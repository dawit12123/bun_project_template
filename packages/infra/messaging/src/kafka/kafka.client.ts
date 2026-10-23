import type { Logger } from "@driversim/core";
import { Kafka, type KafkaConfig as KafkaJsConfig, logLevel } from "kafkajs";

const LEVEL_NAMES: Record<number, "error" | "warn" | "info" | "debug"> = {
  [logLevel.ERROR]: "error",
  [logLevel.WARN]: "warn",
  [logLevel.INFO]: "info",
  [logLevel.DEBUG]: "debug",
};

export interface KafkaClientOptions {
  clientId: string;
  brokers: string[];
  ssl: boolean;
  sasl?: { mechanism: "plain" | "scram-sha-256" | "scram-sha-512"; username: string; password: string };
}

/** Creates the Kafka/Redpanda client, routing kafkajs logs through the service logger. */
export const createKafkaClient = (config: KafkaClientOptions, logger: Logger): Kafka => {
  const kafkaLogger = logger.child({ component: "kafka" });
  const options: KafkaJsConfig = {
    clientId: config.clientId,
    brokers: config.brokers,
    ssl: config.ssl,
    logLevel: logLevel.WARN,
    logCreator:
      () =>
      ({ level, log }) => {
        const { message, ...extra } = log;
        kafkaLogger[LEVEL_NAMES[level] ?? "info"](String(message), extra);
      },
    retry: { initialRetryTime: 300, retries: 8 },
  };
  if (config.sasl) options.sasl = config.sasl as KafkaJsConfig["sasl"];
  return new Kafka(options);
};
