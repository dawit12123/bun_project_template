import type { ReadinessCheck } from "@driversim/core";
import type { SqlClient } from "./postgres.client";

export const postgresReadinessCheck = (sql: SqlClient): ReadinessCheck => ({
  name: "postgres",
  critical: true,
  timeoutMs: 2_000,
  async check() {
    await sql`select 1`;
  },
});
