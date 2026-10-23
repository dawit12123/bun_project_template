import type { OutboundMessage } from "@driversim/core";
import type { EventPublisher } from "@driversim/core";
import type { Kafka, Producer } from "kafkajs";
import { EVENT_HEADERS } from "../constants/messaging.constants";

/** Idempotent producer: retries never duplicate a message within a partition. */
export class KafkaEventPublisher implements EventPublisher {
  readonly #producer: Producer;
  #connecting: Promise<void> | null = null;

  constructor(kafka: Kafka) {
    this.#producer = kafka.producer({
      idempotent: true,
      maxInFlightRequests: 1,
      allowAutoTopicCreation: false,
    });
  }

  /** Connects the producer; called at startup so the first publish does not pay for it. */
  connect(): Promise<void> {
    this.#connecting ??= this.#producer.connect().catch((error: unknown) => {
      this.#connecting = null;
      throw error;
    });
    return this.#connecting;
  }

  async publish(messages: readonly OutboundMessage[]): Promise<void> {
    if (messages.length === 0) return;
    await this.connect();

    const byTopic = new Map<string, OutboundMessage[]>();
    for (const message of messages)
      byTopic.set(message.topic, [...(byTopic.get(message.topic) ?? []), message]);

    await this.#producer.sendBatch({
      acks: -1,
      topicMessages: [...byTopic.entries()].map(([topic, batch]) => ({
        topic,
        messages: batch.map(({ key, envelope }) => ({
          key,
          value: JSON.stringify(envelope),
          headers: {
            [EVENT_HEADERS.EVENT_TYPE]: envelope.type,
            [EVENT_HEADERS.EVENT_VERSION]: String(envelope.version),
            [EVENT_HEADERS.SOURCE]: envelope.source,
            ...(envelope.correlationId ? { [EVENT_HEADERS.CORRELATION_ID]: envelope.correlationId } : {}),
          },
        })),
      })),
    });
  }

  async close(): Promise<void> {
    if (this.#connecting) await this.#producer.disconnect();
    this.#connecting = null;
  }
}
