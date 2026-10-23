import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { sha256Hex } from "@driversim/core";
import type { Logger } from "@driversim/core";
import { DATABASE_TABLES, MIGRATION_FILE_PATTERN, MIGRATION_LOCK_KEY } from "./constants/database.constants";
import type { SqlClient } from "./postgres.client";

export interface MigrationFile {
  version: number;
  name: string;
  up: string;
  down: string | null;
  checksum: string;
}

export interface MigrationStatus {
  version: number;
  name: string;
  state: "applied" | "pending" | "drifted";
  appliedAt: Date | null;
}

interface AppliedRow {
  version: number;
  name: string;
  checksum: string;
  applied_at: Date;
}

const TABLE = DATABASE_TABLES.MIGRATIONS;

/** Loads `NNNN_name.up.sql` / `NNNN_name.down.sql` pairs sorted by version. */
/** Schema named by a `NNNN_<schema>__<change>` migration; undefined for unscoped names. */
export const migrationSchema = (name: string): string | undefined => {
  const separator = name.indexOf("__");
  return separator > 0 ? name.slice(0, separator) : undefined;
};

export const loadMigrationFiles = async (directory: string): Promise<MigrationFile[]> => {
  const byVersion = new Map<number, { name: string; up?: string; down?: string }>();
  for (const file of (await readdir(directory)).sort()) {
    const match = MIGRATION_FILE_PATTERN.exec(file);
    if (!match) continue;
    const [, versionText, name, direction] = match as unknown as [string, string, string, "up" | "down"];
    const version = Number(versionText);
    const entry = byVersion.get(version) ?? { name };
    if (entry.name !== name)
      throw new Error(`Migration ${version} has conflicting names: ${entry.name}, ${name}`);
    entry[direction] = await Bun.file(join(directory, file)).text();
    byVersion.set(version, entry);
  }

  return [...byVersion.entries()]
    .sort(([a], [b]) => a - b)
    .map(([version, entry]) => {
      if (!entry.up) throw new Error(`Migration ${version}_${entry.name} is missing its .up.sql file`);
      return {
        version,
        name: entry.name,
        up: entry.up,
        down: entry.down ?? null,
        checksum: sha256Hex(entry.up),
      };
    });
};

/**
 * Applies versioned SQL migrations. Each migration runs in its own transaction guarded by an
 * advisory lock, so concurrent deploys cannot apply the same migration twice. Applied
 * migrations are checksummed; editing one after it ran is reported as drift.
 */
export class Migrator {
  constructor(
    private readonly sql: SqlClient,
    private readonly directory: string,
    private readonly logger: Logger,
    /** Restricts the migrator to some files, e.g. the schemas that live in this database. */
    private readonly include: (file: MigrationFile) => boolean = () => true,
  ) {}

  async status(): Promise<MigrationStatus[]> {
    await this.#ensureTable();
    const [files, applied] = await Promise.all([this.#files(), this.#applied()]);
    const statuses: MigrationStatus[] = files.map((file) => {
      const row = applied.get(file.version);
      if (!row) return { version: file.version, name: file.name, state: "pending", appliedAt: null };
      const state = row.checksum === file.checksum ? "applied" : "drifted";
      return { version: file.version, name: file.name, state, appliedAt: row.applied_at };
    });
    for (const row of applied.values()) {
      if (!files.some((file) => file.version === row.version)) {
        statuses.push({ version: row.version, name: row.name, state: "drifted", appliedAt: row.applied_at });
      }
    }
    return statuses.sort((a, b) => a.version - b.version);
  }

  /** Applies all pending migrations; returns the versions applied. */
  async up(): Promise<number[]> {
    await this.#ensureTable();
    const files = await this.#files();
    this.#assertNoDrift(files, await this.#applied());

    const appliedNow: number[] = [];
    for (const file of files) {
      const applied = await this.sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;
        const existing = await tx`select 1 from ${tx(TABLE)} where version = ${file.version}`;
        if (existing.length > 0) return false;
        await tx.unsafe(file.up);
        await tx`insert into ${tx(TABLE)} (version, name, checksum) values (${file.version}, ${file.name}, ${file.checksum})`;
        return true;
      });
      if (applied) {
        appliedNow.push(file.version);
        this.logger.info("migration applied", { version: file.version, name: file.name });
      }
    }
    return appliedNow;
  }

  /** Reverts the latest `steps` applied migrations; returns the versions reverted. */
  async down(steps = 1): Promise<number[]> {
    await this.#ensureTable();
    const files = new Map((await this.#files()).map((file) => [file.version, file]));
    const reverted: number[] = [];

    for (let index = 0; index < steps; index += 1) {
      const version = await this.sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;
        const [latest] = await tx`select version, name from ${tx(TABLE)} order by version desc limit 1`;
        if (!latest) return null;
        const file = files.get(Number(latest.version));
        if (!file?.down) throw new Error(`Migration ${latest.version}_${latest.name} has no .down.sql file`);
        await tx.unsafe(file.down);
        await tx`delete from ${tx(TABLE)} where version = ${latest.version}`;
        return Number(latest.version);
      });
      if (version === null) break;
      reverted.push(version);
      this.logger.info("migration reverted", { version });
    }
    return reverted;
  }

  #assertNoDrift(files: MigrationFile[], applied: Map<number, AppliedRow>): void {
    const drifted = files.filter((file) => {
      const row = applied.get(file.version);
      return row !== undefined && row.checksum !== file.checksum;
    });
    if (drifted.length > 0) {
      const list = drifted.map((file) => `${file.version}_${file.name}`).join(", ");
      throw new Error(
        `Applied migrations were modified (checksum drift): ${list}. Add a new migration instead.`,
      );
    }
  }

  async #ensureTable(): Promise<void> {
    await this.sql.unsafe(`
      create table if not exists ${TABLE} (
        version    integer primary key,
        name       text        not null,
        checksum   text        not null,
        applied_at timestamptz not null default now()
      )`);
  }

  async #files(): Promise<MigrationFile[]> {
    return (await loadMigrationFiles(this.directory)).filter(this.include);
  }

  async #applied(): Promise<Map<number, AppliedRow>> {
    const rows = (await this
      .sql`select version, name, checksum, applied_at from ${this.sql(TABLE)}`) as AppliedRow[];
    return new Map(rows.map((row) => [Number(row.version), row]));
  }
}
