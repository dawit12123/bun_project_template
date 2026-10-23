/** Runs the seeds allowed for NODE_ENV into this service's schema:  bun run db:seed */
import { toRuntimeOptions } from "@/bootstrap/bootstrap";
import { loadConfig } from "@/config";
import { seeds } from "@/seeds";
import { createRuntime } from "@driversim/bootstrap";
import { createPostgresClient, runSeeds } from "@driversim/postgres";

const main = async (): Promise<void> => {
  const config = loadConfig();
  if (!config.database.url) throw new Error("DATABASE_URL is required to seed");
  // Same runtime (logger, clock) the service uses; only the output style differs.
  const runtime = createRuntime({ ...toRuntimeOptions(config), log: { level: "info", pretty: true } });
  const logger = runtime.logger.child({ component: "seed" });
  const sql = createPostgresClient({
    ...config.database,
    url: config.database.url,
    applicationName: `${config.app.serviceName}-seeder`,
  });
  try {
    const executed = await runSeeds(seeds, config.app.env, { sql, logger, clock: runtime.clock });
    logger.info("seeding finished", {
      executed,
      environment: config.app.env,
      schema: config.database.schema,
    });
  } finally {
    await sql.close();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
