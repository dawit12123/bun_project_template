import type { ReadinessCheck } from "@driversim/core";
import type { Kafka } from "kafkajs";

/**
 * Broker reachability. Non-critical: thanks to the outbox, the service keeps accepting writes
 * while the broker is down and delivers the events once it recovers.
 */
export const kafkaReadinessCheck = (kafka: Kafka): ReadinessCheck => ({
  name: "kafka",
  critical: false,
  timeoutMs: 3_000,
  async check() {
    const admin = kafka.admin();
    await admin.connect();
    try {
      await admin.describeCluster();
    } finally {
      await admin.disconnect();
    }
  },
});
