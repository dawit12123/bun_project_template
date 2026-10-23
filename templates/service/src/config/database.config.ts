import { optionalString } from "@driversim/core";
import { z } from "zod";

export const databaseEnvSchema = z.object({
  /** When unset outside production, the service runs on in-memory adapters. */
  DATABASE_URL: optionalString().pipe(z.string().url().optional()),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_IDLE_TIMEOUT_S: z.coerce.number().int().min(0).default(30),
  DATABASE_CONNECT_TIMEOUT_S: z.coerce.number().int().min(1).default(5),
  DATABASE_MAX_LIFETIME_S: z.coerce.number().int().min(0).default(1_800),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),
});

export interface DatabaseConfig {
  url: string | undefined;
  poolMax: number;
  idleTimeoutSeconds: number;
  connectTimeoutSeconds: number;
  maxLifetimeSeconds: number;
  statementTimeoutMs: number;
}

export const toDatabaseConfig = (env: z.infer<typeof databaseEnvSchema>): DatabaseConfig => ({
  url: env.DATABASE_URL,
  poolMax: env.DATABASE_POOL_MAX,
  idleTimeoutSeconds: env.DATABASE_IDLE_TIMEOUT_S,
  connectTimeoutSeconds: env.DATABASE_CONNECT_TIMEOUT_S,
  maxLifetimeSeconds: env.DATABASE_MAX_LIFETIME_S,
  statementTimeoutMs: env.DATABASE_STATEMENT_TIMEOUT_MS,
});
