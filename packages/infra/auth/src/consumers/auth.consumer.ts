import type { Logger } from "@driversim/core";
import type { EventHandlerMap } from "@driversim/core";
import type { SessionRevocationStore } from "@driversim/core";
import { AUTH_EVENT_TYPES, AUTH_TOPIC } from "../constants/auth.constants";
import { validateSessionRevokedEvent } from "../events/session-revoked.event";

export const AUTH_CONSUMER_TOPICS = [AUTH_TOPIC] as const;

export interface AuthConsumerDependencies {
  revocations: SessionRevocationStore;
  logger: Logger;
}

/** Keeps the local session denylist in sync with logouts/suspensions performed in auth-service. */
export const createAuthEventHandlers = ({
  revocations,
  logger,
}: AuthConsumerDependencies): EventHandlerMap => ({
  [AUTH_EVENT_TYPES.SESSION_REVOKED]: async (envelope) => {
    const event = validateSessionRevokedEvent(envelope.data);
    await Promise.all(event.sessionIds.map((sessionId) => revocations.revoke(sessionId)));
    logger.info("sessions revoked", {
      userId: event.userId,
      count: event.sessionIds.length,
      correlationId: envelope.correlationId,
    });
  },
});
