import { expect, test } from "bun:test";
import { join } from "node:path";
import { describeWithDatabase, silentLogger } from "@driversim/testing";
import { SQL } from "bun";
import { ensureDatabases, migrateDown, migrateUp, migrationStatus } from "../src/migrate";
import { resolveTopology } from "../src/topology";

/** Derives two disposable databases (<name>_a_test, <name>_b_test) from TEST_DATABASE_URL. */
const databaseUrl = (suffix: string): string => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgres://localhost/unused_test");
  url.pathname = `${url.pathname.replace(/_test$/, "")}_${suffix}_test`;
  return url.toString();
};
const SHARED = databaseUrl("shared");
const SPLIT = databaseUrl("split");
const fixtures = (name: string) => join(import.meta.dir, "fixtures", name);

/**
 * Drops the database so each test starts clean. Done at the START of a test only: forcing
 * drops in afterAll crashes Bun 1.2.21 on Windows (connections already closed client-side).
 */
const recreate = async (url: string) => {
  const name = new URL(url).pathname.slice(1);
  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  const admin = new SQL({ url: maintenance.toString(), max: 1 });
  await admin.unsafe(`drop database if exists "${name}" with (force)`);
  await admin.close();
};

const tablesIn = async (url: string): Promise<string[]> => {
  const sql = new SQL({ url, max: 1 });
  try {
    const rows = await sql`
      select table_schema || '.' || table_name as name from information_schema.tables
      where table_schema not in ('pg_catalog', 'information_schema') order by 1`;
    return rows.map((row: { name: string }) => row.name);
  } finally {
    await sql.close();
  }
};

describeWithDatabase("multi-database topology", () => {
  test("same database: schemas share one history and FKs work across schemas", async () => {
    await recreate(SHARED);
    const run = {
      topology: resolveTopology({ DATABASE_URL: SHARED }),
      migrationsDir: fixtures("linked"),
      logger: silentLogger,
    };
    await ensureDatabases(run);
    expect(await migrateUp(run)).toEqual({ [run.topology.targets[0]?.label ?? ""]: [1, 2] });
    expect(await tablesIn(SHARED)).toEqual(["alpha.users", "beta.items", "public.schema_migrations"]);

    // The cross-schema FK is enforced: an item pointing at a missing user is rejected.
    const sql = new SQL({ url: SHARED, max: 1 });
    const violation = await sql`insert into beta.items values (gen_random_uuid(), gen_random_uuid())`.then(
      () => null,
      (error: unknown) => error,
    );
    await sql.close();
    expect((violation as { errno?: string } | null)?.errno).toBe("23503");
  });

  test("split databases: each schema migrates into its own database with its own history", async () => {
    await recreate(SHARED);
    await recreate(SPLIT);
    const run = {
      topology: resolveTopology({ DATABASE_URL: SHARED, DATABASE_URL__BETA: SPLIT }),
      migrationsDir: fixtures("independent"),
      logger: silentLogger,
    };
    await ensureDatabases(run);
    await migrateUp(run);

    expect(await tablesIn(SHARED)).toEqual(["alpha.users", "public.schema_migrations"]);
    expect(await tablesIn(SPLIT)).toEqual(["beta.items", "public.schema_migrations"]);
    const status = await migrationStatus(run);
    expect(status.map((s) => [s.version, s.state, s.database.endsWith("split_test")])).toEqual([
      [1, "applied", false],
      [2, "applied", true],
    ]);

    expect(await migrateDown(run, 1, "beta")).toEqual([2]);
    expect(await tablesIn(SPLIT)).toEqual(["public.schema_migrations"]);
    expect(await tablesIn(SHARED)).toEqual(["alpha.users", "public.schema_migrations"]);
  });

  test("split databases with a cross-database FK are refused before anything runs", async () => {
    await recreate(SHARED);
    await recreate(SPLIT);
    const run = {
      topology: resolveTopology({ DATABASE_URL: SHARED, DATABASE_URL__BETA: SPLIT }),
      migrationsDir: fixtures("linked"),
      logger: silentLogger,
    };
    await ensureDatabases(run);
    const failure = await migrateUp(run).then(
      () => null,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    expect(failure).toContain("Foreign keys cannot cross databases");
    expect(await tablesIn(SHARED)).toEqual([]);
  });
});
