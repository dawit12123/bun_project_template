import { ConfigError, formatEnvIssues } from "@driversim/core";
import type { z } from "zod";
import { type AppConfig, appEnvSchema, toAppConfig } from "./app.config";
import { type AuthConfig, authEnvSchema, toAuthConfig } from "./auth.config";
import { type DatabaseConfig, databaseEnvSchema, toDatabaseConfig } from "./database.config";
import { type HttpConfig, httpEnvSchema, toHttpConfig } from "./http.config";
import { type KafkaConfig, kafkaEnvSchema, toKafkaConfig } from "./kafka.config";
import { type LoggerConfig, loggerEnvSchema, toLoggerConfig } from "./logger.config";
import { type MetricsConfig, metricsEnvSchema, toMetricsConfig } from "./metrics.config";
import { type OutboxConfig, outboxEnvSchema, toOutboxConfig } from "./outbox.config";
import { type RedisConfig, redisEnvSchema, toRedisConfig } from "./redis.config";

export interface Config {
  app: AppConfig;
  http: HttpConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  kafka: KafkaConfig;
  outbox: OutboxConfig;
  auth: AuthConfig;
  logger: LoggerConfig;
  metrics: MetricsConfig;
}

const envSchema = appEnvSchema
  .merge(httpEnvSchema)
  .merge(databaseEnvSchema)
  .merge(redisEnvSchema)
  .merge(kafkaEnvSchema)
  .merge(outboxEnvSchema)
  .merge(authEnvSchema)
  .merge(loggerEnvSchema)
  .merge(metricsEnvSchema)
  .superRefine((env, ctx) => {
    const require = (condition: boolean, path: string, message: string) => {
      if (!condition) ctx.addIssue({ code: "custom", path: [path], message });
    };

    // Every environment must be able to verify tokens.
    require(Boolean(
      env.AUTH_JWKS_URL || env.AUTH_JWKS_JSON,
    ), "AUTH_JWKS_URL", "set AUTH_JWKS_URL (or AUTH_JWKS_JSON outside production)");

    if (env.NODE_ENV !== "production") return;
    // Production never falls back to in-memory adapters or inline keys.
    require(Boolean(env.DATABASE_URL), "DATABASE_URL", "is required in production");
    require(Boolean(env.REDIS_URL), "REDIS_URL", "is required in production");
    require(env.KAFKA_BROKERS.length > 0, "KAFKA_BROKERS", "is required in production");
    require(Boolean(env.AUTH_JWKS_URL), "AUTH_JWKS_URL", "is required in production");
    require(!env.LOG_PRETTY, "LOG_PRETTY", "must be false in production");
  });

export type RawEnv = z.input<typeof envSchema>;

/** Parses and validates the environment once at startup; fails fast with every problem listed. */
export const loadConfig = (source: Record<string, string | undefined> = process.env): Config => {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) throw new ConfigError(formatEnvIssues(parsed.error));
  const env = parsed.data;
  const app = toAppConfig(env);
  const redis = toRedisConfig(env);
  const kafka = toKafkaConfig(env);

  return Object.freeze({
    app,
    http: toHttpConfig(env),
    database: toDatabaseConfig(env),
    redis: { ...redis, keyPrefix: redis.keyPrefix ?? `${app.serviceName}:` },
    kafka: {
      ...kafka,
      clientId: kafka.clientId ?? app.serviceName,
      consumerGroup: kafka.consumerGroup ?? app.serviceName,
    },
    outbox: toOutboxConfig(env),
    auth: toAuthConfig(env),
    logger: toLoggerConfig(env),
    metrics: toMetricsConfig(env),
  });
};

export type { AppConfig, AuthConfig, DatabaseConfig, HttpConfig, KafkaConfig, LoggerConfig, MetricsConfig };
export type { OutboxConfig, RedisConfig };
