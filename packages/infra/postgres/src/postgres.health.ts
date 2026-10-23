import type { ReadinessCheck, StartupTask } from "@driversim/core";
import type { SqlClient } from "./postgres.client";

/** Opens the pool's first connection (and validates credentials/schema) during startup. */
export const postgresStartupTask = (sql: SqlClient): StartupTask => ({
  name: "postgres",
  critical: true,
  run: async () => {
    await sql`select 1`;
  },
});

export const postgresReadinessCheck = (sql: SqlClient): ReadinessCheck => ({
  name: "postgres",
  critical: true,
  timeoutMs: 2_000,
  async check() {
    await sql`select 1`;
  },
});
