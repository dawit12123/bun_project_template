/**
 * Database migrations CLI.
 *   bun scripts/migrate.ts up                 apply pending migrations
 *   bun scripts/migrate.ts down [steps=1]     revert the latest migrations
 *   bun scripts/migrate.ts status             list applied / pending / drifted
 *   bun scripts/migrate.ts create <name>      scaffold NNNN_<name>.up.sql / .down.sql
 *   bun scripts/migrate.ts ensure-database    create the database if it does not exist
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "@/config";
import { createJsonLogger } from "@driversim/observability";
import { MIGRATION_FILE_PATTERN } from "@driversim/postgres";
import { Migrator } from "@driversim/postgres";
import { createPostgresClient, ensureDatabaseExists } from "@driversim/postgres";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "database", "migrations");
const [command = "status", argument] = process.argv.slice(2);

const createMigration = async (rawName: string | undefined): Promise<void> => {
  const name = rawName
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!name) throw new Error("Usage: bun scripts/migrate.ts create <name>");
  const versions = (await readdir(MIGRATIONS_DIR))
    .map((file) => MIGRATION_FILE_PATTERN.exec(file)?.[1])
    .filter((version): version is string => version !== undefined)
    .map(Number);
  const next = String(Math.max(0, ...versions) + 1).padStart(4, "0");
  for (const direction of ["up", "down"] as const) {
    const path = join(MIGRATIONS_DIR, `${next}_${name}.${direction}.sql`);
    await Bun.write(path, `-- ${next}_${name} (${direction})\n`);
    console.log(`created ${path}`);
  }
};

const main = async (): Promise<void> => {
  if (command === "create") return createMigration(argument);

  const config = loadConfig();
  if (!config.database.url) throw new Error("DATABASE_URL is required to run migrations");
  const logger = createJsonLogger({ level: "info", pretty: true, base: { component: "migrate" } });

  if (command === "ensure-database") {
    const { database, created } = await ensureDatabaseExists(config.database.url);
    logger.info(created ? "database created" : "database already exists", { database });
    return;
  }

  const sql = createPostgresClient({
    ...config.database,
    url: config.database.url,
    applicationName: "migrator",
  });
  try {
    const migrator = new Migrator(sql, MIGRATIONS_DIR, logger);
    switch (command) {
      case "up": {
        const applied = await migrator.up();
        logger.info(applied.length ? "migrations applied" : "database is up to date", { applied });
        break;
      }
      case "down": {
        const steps = Number(argument ?? 1);
        if (!Number.isInteger(steps) || steps < 1) throw new Error("steps must be a positive integer");
        logger.info("migrations reverted", { reverted: await migrator.down(steps) });
        break;
      }
      case "status":
        console.table(await migrator.status());
        break;
      default:
        throw new Error(`Unknown command "${command}"`);
    }
  } finally {
    await sql.close();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
