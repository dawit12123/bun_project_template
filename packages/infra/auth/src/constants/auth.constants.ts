/** Topic carrying identity/security events published by auth-service. */
export const AUTH_TOPIC = "driversim.auth.events.v1";

export const AUTH_EVENT_TYPES = {
  SESSION_REVOKED: "auth.session.revoked",
  USER_STATUS_CHANGED: "auth.user.status_changed",
} as const;

/** Algorithms accepted on access tokens. Symmetric algorithms are rejected on purpose. */
export const ACCEPTED_JWT_ALGORITHMS = ["EdDSA", "ES256", "RS256"] as const;

export const AUTH_KV_PREFIX = {
  REVOKED_SESSION: "auth:revoked-session:",
} as const;

/** How long a revoked session marker is kept; must exceed the access-token lifetime. */
export const REVOKED_SESSION_TTL_SECONDS = 60 * 60;
