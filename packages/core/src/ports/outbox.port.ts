import type { OutboundMessage } from "../types/event.interface";

/** Writes events in the same transaction as the business change (transactional outbox). */
export interface OutboxWriter {
  add(message: OutboundMessage): Promise<void>;
}

export interface OutboxRelay {
  start(): void;
  stop(): Promise<void>;
  /** Publishes one batch; returns the number of messages published. */
  tick(): Promise<number>;
}
