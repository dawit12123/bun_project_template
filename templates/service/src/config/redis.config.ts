import { optionalString } from "@driversim/core";
import { z } from "zod";

export const redisEnvSchema = z.object({
  /** When unset outside production, an in-memory key-value store is used. */
  REDIS_URL: optionalString().pipe(z.string().url().optional()),
  REDIS_KEY_PREFIX: optionalString(),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5_000),
});

export interface RedisConfig {
  url: string | undefined;
  /** Namespaces every key; defaults to `<service-name>:` so services never collide. */
  keyPrefix: string | undefined;
  connectTimeoutMs: number;
}

export const toRedisConfig = (env: z.infer<typeof redisEnvSchema>): RedisConfig => ({
  url: env.REDIS_URL,
  keyPrefix: env.REDIS_KEY_PREFIX,
  connectTimeoutMs: env.REDIS_CONNECT_TIMEOUT_MS,
});
