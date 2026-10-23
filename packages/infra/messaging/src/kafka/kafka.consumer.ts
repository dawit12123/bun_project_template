import type { Logger } from "@driversim/core";
import type { EventConsumer, EventHandlerMap } from "@driversim/core";
import type { InboxStore } from "@driversim/core";
import type { Consumer, Kafka } from "kafkajs";
import { parseEventEnvelope } from "../event-envelope.schema";

export interface KafkaEventConsumerOptions {
  groupId: string;
  topics: readonly string[];
  handlers: EventHandlerMap;
  inbox: InboxStore;
  logger: Logger;
}

/**
 * At-least-once consumer. Duplicates are filtered by the inbox; malformed messages are logged
 * and skipped (poison pills must not block the partition); handler failures are rethrown so
 * kafkajs retries the message.
 */
export class KafkaEventConsumer implements EventConsumer {
  readonly #consumer: Consumer;
  readonly #logger: Logger;

  constructor(
    kafka: Kafka,
    private readonly options: KafkaEventConsumerOptions,
  ) {
    this.#consumer = kafka.consumer({ groupId: options.groupId, allowAutoTopicCreation: false });
    this.#logger = options.logger.child({ component: "kafka-consumer", groupId: options.groupId });
  }

  async start(): Promise<void> {
    if (this.options.topics.length === 0) return;
    await this.#consumer.connect();
    for (const topic of this.options.topics) await this.#consumer.subscribe({ topic, fromBeginning: false });

    await this.#consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const raw = message.value?.toString("utf8");
        if (!raw) return;

        let envelope: ReturnType<typeof parseEventEnvelope>;
        try {
          envelope = parseEventEnvelope(raw);
        } catch (error) {
          this.#logger.error("discarding malformed event", {
            topic,
            partition,
            offset: message.offset,
            err: error,
          });
          return;
        }

        const handler = this.options.handlers[envelope.type];
        if (!handler) return;

        const processed = await this.options.inbox.processOnce(this.options.groupId, envelope, () =>
          handler(envelope),
        );
        this.#logger.debug(processed ? "event handled" : "duplicate event skipped", {
          eventId: envelope.id,
          type: envelope.type,
          correlationId: envelope.correlationId,
        });
      },
    });
  }

  async stop(): Promise<void> {
    await this.#consumer.disconnect();
  }
}
