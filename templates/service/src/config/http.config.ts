import { booleanFlag, csvList } from "@driversim/core";
import { z } from "zod";

export const httpEnvSchema = z.object({
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  TRUST_PROXY: booleanFlag(false),
  CORS_ORIGINS: csvList(),
  CORS_CREDENTIALS: booleanFlag(false),
  BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(50 * 1_024 * 1_024)
    .default(1_024 * 1_024),
  API_DOCS_ENABLED: booleanFlag(true),
  RATE_LIMIT_ENABLED: booleanFlag(true),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
});

export interface HttpConfig {
  host: string;
  port: number;
  trustProxy: boolean;
  cors: { origins: string[]; credentials: boolean };
  bodyLimitBytes: number;
  apiDocsEnabled: boolean;
  rateLimit: { enabled: boolean; perMinute: number };
}

export const toHttpConfig = (env: z.infer<typeof httpEnvSchema>): HttpConfig => ({
  host: env.HOST,
  port: env.PORT,
  trustProxy: env.TRUST_PROXY,
  cors: { origins: env.CORS_ORIGINS, credentials: env.CORS_CREDENTIALS },
  bodyLimitBytes: env.BODY_LIMIT_BYTES,
  apiDocsEnabled: env.API_DOCS_ENABLED,
  rateLimit: { enabled: env.RATE_LIMIT_ENABLED, perMinute: env.RATE_LIMIT_PER_MINUTE },
});
