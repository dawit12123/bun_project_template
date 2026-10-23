/** Runs the seeds allowed for NODE_ENV:  bun scripts/seed.ts */
import { loadConfig } from "@/config";
import { seeds } from "@/seeds";
import { systemClock } from "@driversim/core";
import { createJsonLogger } from "@driversim/observability";
import { createPostgresClient } from "@driversim/postgres";
import { runSeeds } from "@driversim/postgres";

const main = async (): Promise<void> => {
  const config = loadConfig();
  if (!config.database.url) throw new Error("DATABASE_URL is required to seed");
  const logger = createJsonLogger({ level: "info", pretty: true, base: { component: "seed" } });
  const sql = createPostgresClient({
    ...config.database,
    url: config.database.url,
    applicationName: "seeder",
  });
  try {
    const executed = await runSeeds(seeds, config.app.env, { sql, logger, clock: systemClock });
    logger.info("seeding finished", { executed, environment: config.app.env });
  } finally {
    await sql.close();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
