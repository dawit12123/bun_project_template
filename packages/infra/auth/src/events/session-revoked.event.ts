import { validateWith } from "@driversim/core";
import { z } from "zod";

/**
 * Inbound event contracts published by auth-service. Every service consumes these to keep its
 * session denylist current.
 */
export const sessionRevokedEventSchema = z.object({
  userId: z.string().uuid(),
  sessionIds: z.array(z.string().min(1)).min(1).max(1_000),
  reason: z.string().max(100).optional(),
});

export type SessionRevokedEventDto = z.infer<typeof sessionRevokedEventSchema>;

export const validateSessionRevokedEvent = (data: unknown): SessionRevokedEventDto =>
  validateWith(sessionRevokedEventSchema, data, "data");
