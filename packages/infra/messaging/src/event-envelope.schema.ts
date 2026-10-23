import type { EventEnvelope } from "@driversim/core";
import { z } from "zod";

/** Validates envelopes arriving from the broker before any handler sees them. */
export const eventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1).max(200),
  version: z.number().int().positive(),
  source: z.string().min(1).max(100),
  occurredAt: z.string().datetime({ offset: true }),
  subject: z.string().min(1).max(200),
  schoolId: z.string().uuid().nullable(),
  correlationId: z.string().max(128).nullable(),
  causationId: z.string().max(128).nullable(),
  data: z.unknown(),
});

export const parseEventEnvelope = (raw: string): EventEnvelope =>
  eventEnvelopeSchema.parse(JSON.parse(raw)) as EventEnvelope;
