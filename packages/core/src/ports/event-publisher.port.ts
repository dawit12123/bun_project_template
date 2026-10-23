import type { EventEnvelope, OutboundMessage } from "../types/event.interface";

export interface EventPublisher {
  publish(messages: readonly OutboundMessage[]): Promise<void>;
  close(): Promise<void>;
}

export type EventHandler<TData = unknown> = (envelope: EventEnvelope<TData>) => Promise<void>;

/** Event type → handler. A consumer ignores types it has no handler for. */
export type EventHandlerMap = Readonly<Record<string, EventHandler>>;

export interface EventConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}
