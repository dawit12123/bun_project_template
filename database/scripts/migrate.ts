/**
 * Central migrations for the DriverSim database(s): one schema per service, one ordered history.
 *
 *   bun run db:migrate                         apply pending migrations (every database)
 *   bun run db:rollback [steps=1] [--schema s] revert the latest migrations of one database
 *   bun run db:status                          applied / pending / drifted, per database
 *   bun run db:create <schema> <name>          scaffold NNNN_<schema>__<name>.up.sql / .down.sql
 *   bun run db:ensure                          create every configured database
 *
 * Topology (root .env; database/.env may override for the migrator only):
 *   DATABASE_URL=…                  default database: every schema lives here unless overridden
 *   DATABASE_URL__<SCHEMA>=…        put one schema in another database (no FKs across databases)
 *
 * Options: --dir <path> applies another migrations folder (e.g. the template blueprint).
 */
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createJsonLogger } from "@driversim/observability";
import { MIGRATION_FILE_PATTERN, assertSchemaName } from "@driversim/postgres";
import { ensureDatabases, migrateDown, migrateUp, migrationStatus } from "../src/migrate";
import { resolveTopology } from "../src/topology";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: { dir: { type: "string" }, schema: { type: "string" } },
});
const [command = "status", ...rest] = positionals;
const migrationsDir = values.dir
  ? resolve(process.env.INIT_CWD ?? process.cwd(), values.dir)
  : join(import.meta.dir, "..", "migrations");

const slug = (value: string | undefined) =>
  value
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const createMigration = async (schemaArg: string | undefined, nameArg: string | undefined): Promise<void> => {
  const schema = slug(schemaArg);
  const name = slug(nameArg);
  if (!schema || !name) throw new Error("Usage: bun run db:create <schema> <name>");
  assertSchemaName(schema);
  const versions = (await readdir(migrationsDir))
    .map((file) => MIGRATION_FILE_PATTERN.exec(file)?.[1])
    .filter((version): version is string => version !== undefined)
    .map(Number);
  const next = String(Math.max(0, ...versions) + 1).padStart(4, "0");
  for (const direction of ["up", "down"] as const) {
    const path = join(migrationsDir, `${next}_${schema}__${name}.${direction}.sql`);
    await Bun.write(
      path,
      `-- ${next} ${schema}: ${name} (${direction})\n-- Qualify every object: ${schema}.<table>\n`,
    );
    console.log(`created ${path}`);
  }
};

const main = async (): Promise<void> => {
  if (command === "create") return createMigration(rest[0], rest[1]);

  const logger = createJsonLogger({ level: "info", pretty: true, base: { component: "migrate" } });
  const topology = resolveTopology(process.env);
  const run = { topology, migrationsDir, logger };
  for (const target of topology.targets) {
    logger.info("database target", {
      database: target.label,
      schemas: target.isDefault ? ["(default)", ...target.schemas] : target.schemas,
    });
  }

  switch (command) {
    case "ensure-database":
      await ensureDatabases(run);
      break;
    case "up":
      logger.info("migrations applied", await migrateUp(run));
      break;
    case "down": {
      const steps = Number(rest[0] ?? 1);
      if (!Number.isInteger(steps) || steps < 1) throw new Error("steps must be a positive integer");
      logger.info("migrations reverted", { reverted: await migrateDown(run, steps, values.schema) });
      break;
    }
    case "status":
      console.table(await migrationStatus(run));
      break;
    default:
      throw new Error(`Unknown command "${command}"`);
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
