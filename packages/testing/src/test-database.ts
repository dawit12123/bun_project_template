import { describe } from "bun:test";
import { createJsonLogger } from "@driversim/observability";
import { Migrator, assertSchemaName, ensureDatabaseExists } from "@driversim/postgres";
import { SQL } from "bun";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * A dedicated test database per service, derived from the shared TEST_DATABASE_URL:
 * `…/driversim_test` → `…/driversim_<schema>_test`. Workspaces run their tests in parallel,
 * and each one resets its database, so they must never share one.
 */
export const testDatabaseUrlFor = (schema: string, base = TEST_DATABASE_URL): string | undefined => {
  if (!base) return undefined;
  const url = new URL(base);
  const name = url.pathname.slice(1);
  url.pathname = `/${name.endsWith("_test") ? name.slice(0, -"_test".length) : name}_${schema}_test`;
  return url.toString();
};

/** Integration suites run only when TEST_DATABASE_URL points at a disposable database. */
export const describeWithDatabase = TEST_DATABASE_URL ? describe : describe.skip;

export const silentLogger = createJsonLogger({ level: "silent" });

export interface ResetTestDatabaseOptions {
  url?: string;
  /** Returned connection uses `search_path=<schema>` (like the service at runtime). */
  schema?: string;
}

/**
 * Drops every user schema of the test database, applies the migrations in `migrationsDir` and
 * returns a connection. Refuses to touch databases whose name does not end with `_test`.
 */
export const resetTestDatabase = async (
  migrationsDir: string,
  { url = TEST_DATABASE_URL, schema }: ResetTestDatabaseOptions = {},
): Promise<SQL> => {
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith("_test"))
    throw new Error(`Refusing to reset "${name}": test databases must end with _test`);

  await ensureDatabaseExists(url);
  const admin = new SQL({ url, max: 1 });
  try {
    const schemas = await admin`
      select nspname from pg_namespace
      where nspname not like 'pg\\_%' and nspname <> 'information_schema'`;
    for (const { nspname } of schemas) await admin.unsafe(`drop schema "${nspname}" cascade`);
    await admin.unsafe("create schema public");
    await new Migrator(admin, migrationsDir, silentLogger).up();
  } finally {
    await admin.close();
  }

  return new SQL({
    url,
    max: 5,
    ...(schema ? { connection: { search_path: assertSchemaName(schema) } } : {}),
  });
};
