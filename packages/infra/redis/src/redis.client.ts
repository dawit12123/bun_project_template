import { RedisClient } from "bun";

/** Creates the Redis connection (Bun's native client) with fail-fast behaviour. */
export interface RedisClientOptions {
  url: string;
  connectTimeoutMs: number;
}

export const createRedisClient = (config: RedisClientOptions): RedisClient =>
  new RedisClient(config.url, {
    connectionTimeout: config.connectTimeoutMs,
    autoReconnect: true,
    maxRetries: 10,
    // Fail fast instead of queueing commands while disconnected; callers decide how to degrade.
    enableOfflineQueue: false,
  });
