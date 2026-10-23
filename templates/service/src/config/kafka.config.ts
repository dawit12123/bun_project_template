import { booleanFlag, csvList, optionalString } from "@driversim/core";
import { z } from "zod";

export const kafkaEnvSchema = z.object({
  /** Empty outside production → in-memory event bus (events stay inside the process). */
  KAFKA_BROKERS: csvList(),
  KAFKA_CLIENT_ID: optionalString(),
  KAFKA_CONSUMER_GROUP: optionalString(),
  KAFKA_CONSUMER_ENABLED: booleanFlag(true),
  KAFKA_SSL: booleanFlag(false),
  KAFKA_SASL_MECHANISM: optionalString().pipe(z.enum(["plain", "scram-sha-256", "scram-sha-512"]).optional()),
  KAFKA_SASL_USERNAME: optionalString(),
  KAFKA_SASL_PASSWORD: optionalString(),
});

export interface KafkaConfig {
  brokers: string[];
  clientId: string | undefined;
  consumerGroup: string | undefined;
  consumerEnabled: boolean;
  ssl: boolean;
  sasl:
    | { mechanism: "plain" | "scram-sha-256" | "scram-sha-512"; username: string; password: string }
    | undefined;
}

export const toKafkaConfig = (env: z.infer<typeof kafkaEnvSchema>): KafkaConfig => ({
  brokers: env.KAFKA_BROKERS,
  clientId: env.KAFKA_CLIENT_ID,
  consumerGroup: env.KAFKA_CONSUMER_GROUP,
  consumerEnabled: env.KAFKA_CONSUMER_ENABLED,
  ssl: env.KAFKA_SSL,
  sasl:
    env.KAFKA_SASL_MECHANISM && env.KAFKA_SASL_USERNAME && env.KAFKA_SASL_PASSWORD
      ? {
          mechanism: env.KAFKA_SASL_MECHANISM,
          username: env.KAFKA_SASL_USERNAME,
          password: env.KAFKA_SASL_PASSWORD,
        }
      : undefined,
});
