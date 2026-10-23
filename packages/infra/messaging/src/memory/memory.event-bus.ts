import type { EventEnvelope, OutboundMessage } from "@driversim/core";
import type { EventHandler, EventPublisher } from "@driversim/core";

/** In-process publisher for development and tests. Delivers synchronously to subscribers. */
export class MemoryEventBus implements EventPublisher {
  readonly published: OutboundMessage[] = [];
  readonly #handlers = new Map<string, EventHandler[]>();

  subscribe(eventType: string, handler: EventHandler): () => void {
    this.#handlers.set(eventType, [...(this.#handlers.get(eventType) ?? []), handler]);
    return () => {
      this.#handlers.set(
        eventType,
        (this.#handlers.get(eventType) ?? []).filter((candidate) => candidate !== handler),
      );
    };
  }

  async publish(messages: readonly OutboundMessage[]): Promise<void> {
    for (const message of messages) {
      this.published.push(message);
      for (const handler of this.#handlers.get(message.envelope.type) ?? []) await handler(message.envelope);
    }
  }

  ofType(eventType: string): EventEnvelope[] {
    return this.published.filter((message) => message.envelope.type === eventType).map((m) => m.envelope);
  }

  clear(): void {
    this.published.length = 0;
  }

  async close(): Promise<void> {
    this.#handlers.clear();
  }
}
