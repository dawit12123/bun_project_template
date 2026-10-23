import { z } from "zod";

export const NODE_ENVS = ["development", "test", "production"] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export const appEnvSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default("development"),
  SERVICE_NAME: z
    .string()
    .regex(/^[a-z][a-z0-9-]{1,62}$/, "must be kebab-case")
    .default("service-template"),
  SERVICE_VERSION: z.string().min(1).default("0.1.0"),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
});

export interface AppConfig {
  env: NodeEnv;
  isProduction: boolean;
  isTest: boolean;
  serviceName: string;
  version: string;
  shutdownTimeoutMs: number;
}

export const toAppConfig = (env: z.infer<typeof appEnvSchema>): AppConfig => ({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  serviceName: env.SERVICE_NAME,
  version: env.SERVICE_VERSION,
  shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
});
