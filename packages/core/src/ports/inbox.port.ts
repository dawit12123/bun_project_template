import type { EventEnvelope } from "../types/event.interface";

/** Idempotent-consumer port: each (consumer, event id) pair is handled at most once. */
export interface InboxStore {
  /**
   * Runs `handle` unless this consumer already processed the event.
   * Returns false when the event was a duplicate and was skipped.
   */
  processOnce(consumer: string, envelope: EventEnvelope, handle: () => Promise<void>): Promise<boolean>;
}
