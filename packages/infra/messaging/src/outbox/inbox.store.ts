import type { EventEnvelope } from "@driversim/core";
import type { InboxStore } from "@driversim/core";
import type { SQL } from "bun";
import { MESSAGING_TABLES } from "../constants/messaging.constants";

/**
 * Records processed events in `event_inbox` inside the same transaction as the handler,
 * so a crash between handling and recording cannot cause a silent duplicate.
 */
export class PostgresInboxStore implements InboxStore {
  constructor(private readonly sql: SQL) {}

  async processOnce(
    consumer: string,
    envelope: EventEnvelope,
    handle: () => Promise<void>,
  ): Promise<boolean> {
    return (await this.sql.begin(async (tx) => {
      const inserted = await tx`
        insert into ${tx(MESSAGING_TABLES.INBOX)} (consumer, event_id, event_type)
        values (${consumer}, ${envelope.id}, ${envelope.type})
        on conflict do nothing
        returning event_id`;
      if (inserted.length === 0) return false;
      await handle();
      return true;
    })) as boolean;
  }
}

export class MemoryInboxStore implements InboxStore {
  readonly #processed = new Set<string>();

  async processOnce(
    consumer: string,
    envelope: EventEnvelope,
    handle: () => Promise<void>,
  ): Promise<boolean> {
    const key = `${consumer}:${envelope.id}`;
    if (this.#processed.has(key)) return false;
    await handle();
    this.#processed.add(key);
    return true;
  }
}
