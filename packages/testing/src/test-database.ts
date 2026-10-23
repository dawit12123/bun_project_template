import { describe } from "bun:test";
import { createJsonLogger } from "@driversim/observability";
import { Migrator, ensureDatabaseExists } from "@driversim/postgres";
import { SQL } from "bun";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** Integration suites run only when TEST_DATABASE_URL points at a disposable database. */
export const describeWithDatabase = TEST_DATABASE_URL ? describe : describe.skip;

export const silentLogger = createJsonLogger({ level: "silent" });

/**
 * Recreates the public schema of the test database and applies the migrations in
 * `migrationsDir`. Refuses to touch databases whose name does not end with `_test`.
 */
export const resetTestDatabase = async (migrationsDir: string, url = TEST_DATABASE_URL): Promise<SQL> => {
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith("_test"))
    throw new Error(`Refusing to reset "${name}": test databases must end with _test`);

  await ensureDatabaseExists(url);
  const sql = new SQL({ url, max: 5 });
  await sql.unsafe("drop schema if exists public cascade; create schema public;");
  await new Migrator(sql, migrationsDir, silentLogger).up();
  return sql;
};
