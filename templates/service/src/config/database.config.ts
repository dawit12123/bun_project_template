import { csvList, optionalString } from "@driversim/core";
import { z } from "zod";

export const databaseEnvSchema = z.object({
  /** When unset outside production, the service runs on in-memory adapters. */
  DATABASE_URL: optionalString().pipe(z.string().url().optional()),
  /** This service's schema in the shared database; defaults to SERVICE_NAME in snake_case. */
  DATABASE_SCHEMA: optionalString().pipe(
    z
      .string()
      .regex(/^[a-z_][a-z0-9_]{0,62}$/, "must be a lower-case Postgres identifier")
      .optional(),
  ),
  /** Other services' schemas (same database) added to search_path for unqualified reads. */
  DATABASE_EXTRA_SCHEMAS: csvList().pipe(
    z.array(z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/, "must be lower-case Postgres identifiers")),
  ),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_IDLE_TIMEOUT_S: z.coerce.number().int().min(0).default(30),
  DATABASE_CONNECT_TIMEOUT_S: z.coerce.number().int().min(1).default(5),
  DATABASE_MAX_LIFETIME_S: z.coerce.number().int().min(0).default(1_800),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),
});

export interface DatabaseConfig {
  url: string | undefined;
  /** Every connection uses `search_path=<schema>`; other schemas need qualified names. */
  schema: string;
  extraSchemas: string[];
  poolMax: number;
  idleTimeoutSeconds: number;
  connectTimeoutSeconds: number;
  maxLifetimeSeconds: number;
  statementTimeoutMs: number;
}

export const toDatabaseConfig = (
  env: z.infer<typeof databaseEnvSchema>,
  serviceName: string,
): DatabaseConfig => ({
  url: env.DATABASE_URL,
  schema: env.DATABASE_SCHEMA ?? serviceName.replace(/-/g, "_"),
  extraSchemas: env.DATABASE_EXTRA_SCHEMAS,
  poolMax: env.DATABASE_POOL_MAX,
  idleTimeoutSeconds: env.DATABASE_IDLE_TIMEOUT_S,
  connectTimeoutSeconds: env.DATABASE_CONNECT_TIMEOUT_S,
  maxLifetimeSeconds: env.DATABASE_MAX_LIFETIME_S,
  statementTimeoutMs: env.DATABASE_STATEMENT_TIMEOUT_MS,
});
