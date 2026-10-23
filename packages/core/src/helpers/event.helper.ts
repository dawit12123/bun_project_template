import type { DomainEvent, EventEnvelope, OutboundMessage } from "../types/event.interface";
import { newId } from "./id.helper";

export interface EnvelopeContext {
  source: string;
  topic: string;
  schoolId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
}

export const toEnvelope = <T>(event: DomainEvent<T>, context: EnvelopeContext): EventEnvelope<T> => ({
  id: newId(),
  type: event.type,
  version: event.version,
  source: context.source,
  occurredAt: event.occurredAt.toISOString(),
  subject: event.aggregateId,
  schoolId: context.schoolId ?? null,
  correlationId: context.correlationId ?? null,
  causationId: context.causationId ?? null,
  data: event.payload,
});

/** Converts domain events into outbound messages keyed by aggregate, preserving per-aggregate order. */
export const toOutboundMessages = (
  events: readonly DomainEvent[],
  context: EnvelopeContext,
): OutboundMessage[] =>
  events.map((event) => ({
    topic: context.topic,
    key: event.aggregateId,
    envelope: toEnvelope(event, context),
  }));
