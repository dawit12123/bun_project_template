import type { Logger } from "@driversim/core";
import {
  type MigrationStatus,
  Migrator,
  createPostgresClient,
  ensureDatabaseExists,
  loadMigrationFiles,
  migrationSchema,
} from "@driversim/postgres";
import { type DatabaseTarget, type DatabaseTopology, assertNoCrossDatabaseReferences } from "./topology";

export interface MigrationRun {
  topology: DatabaseTopology;
  migrationsDir: string;
  logger: Logger;
}

const connect = (url: string) =>
  createPostgresClient({
    url,
    applicationName: "migrator",
    poolMax: 1,
    idleTimeoutSeconds: 10,
    connectTimeoutSeconds: 10,
    maxLifetimeSeconds: 0,
    statementTimeoutMs: 5 * 60_000,
  });

/** Runs `work` with a migrator limited to the migrations whose schema lives in `target`. */
const withTarget = async <T>(
  run: MigrationRun,
  target: DatabaseTarget,
  work: (migrator: Migrator) => Promise<T>,
): Promise<T> => {
  const sql = connect(target.url);
  try {
    const migrator = new Migrator(
      sql,
      run.migrationsDir,
      run.logger.child({ database: target.label }),
      (file) => run.topology.targetForSchema(migrationSchema(file.name)).url === target.url,
    );
    return await work(migrator);
  } finally {
    await sql.close();
  }
};

export const ensureDatabases = async (run: MigrationRun): Promise<void> => {
  for (const target of run.topology.targets) {
    const { created } = await ensureDatabaseExists(target.url);
    run.logger.info(created ? "database created" : "database already exists", { database: target.label });
  }
};

/** Validates the whole history first, then applies pending migrations database by database. */
export const migrateUp = async (run: MigrationRun): Promise<Record<string, number[]>> => {
  assertNoCrossDatabaseReferences(await loadMigrationFiles(run.migrationsDir), run.topology);
  const applied: Record<string, number[]> = {};
  for (const target of run.topology.targets) {
    applied[target.label] = await withTarget(run, target, (migrator) => migrator.up());
  }
  return applied;
};

export const migrationStatus = async (
  run: MigrationRun,
): Promise<Array<MigrationStatus & { database: string }>> => {
  const rows: Array<MigrationStatus & { database: string }> = [];
  for (const target of run.topology.targets) {
    const statuses = await withTarget(run, target, (migrator) => migrator.status());
    rows.push(...statuses.map((status) => ({ database: target.label, ...status })));
  }
  return rows.sort((a, b) => a.version - b.version);
};

/** Reverts the latest `steps` migrations of the database that holds `schema` (default database if omitted). */
export const migrateDown = async (run: MigrationRun, steps: number, schema?: string): Promise<number[]> =>
  withTarget(run, run.topology.targetForSchema(schema), (migrator) => migrator.down(steps));
