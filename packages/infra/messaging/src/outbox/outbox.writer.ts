import type { OutboundMessage } from "@driversim/core";
import type { OutboxWriter } from "@driversim/core";
import type { SQL } from "bun";
import { MESSAGING_TABLES } from "../constants/messaging.constants";

/** Writes into `event_outbox` using the caller's transaction — never commits on its own. */
export class PostgresOutboxWriter implements OutboxWriter {
  constructor(private readonly tx: SQL) {}

  async add(message: OutboundMessage): Promise<void> {
    const { envelope } = message;
    await this.tx`
      insert into ${this.tx(MESSAGING_TABLES.OUTBOX)} (id, topic, message_key, event_type, payload)
      values (${envelope.id}, ${message.topic}, ${message.key}, ${envelope.type}, ${JSON.stringify(envelope)}::jsonb)`;
  }
}

/** In-memory outbox shared by the memory unit-of-work and the memory relay. */
export class MemoryOutbox {
  readonly pending: OutboundMessage[] = [];

  append(messages: readonly OutboundMessage[]): void {
    this.pending.push(...messages);
  }

  /** Writer that stages messages until the surrounding unit of work commits. */
  stagingWriter(): OutboxWriter & { staged: OutboundMessage[] } {
    const staged: OutboundMessage[] = [];
    return {
      staged,
      add: async (message) => {
        staged.push(message);
      },
    };
  }
}
