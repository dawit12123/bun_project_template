import type { ReadinessCheck } from "@driversim/core";
import type { Admin, Kafka } from "kafkajs";

/**
 * One long-lived admin connection reused by every readiness probe (instead of a new connection
 * per `/health/ready` call). Non-critical: thanks to the outbox, the service keeps accepting
 * writes while the broker is down and delivers the events once it recovers.
 */
export class KafkaAdminProbe {
  readonly #admin: Admin;
  #connecting: Promise<void> | null = null;

  constructor(kafka: Kafka) {
    this.#admin = kafka.admin();
  }

  connect(): Promise<void> {
    this.#connecting ??= this.#admin.connect().catch((error: unknown) => {
      this.#connecting = null;
      throw error;
    });
    return this.#connecting;
  }

  readinessCheck(): ReadinessCheck {
    return {
      name: "kafka",
      critical: false,
      timeoutMs: 3_000,
      check: async () => {
        await this.connect();
        await this.#admin.describeCluster();
      },
    };
  }

  async close(): Promise<void> {
    if (this.#connecting) await this.#admin.disconnect();
    this.#connecting = null;
  }
}
