/** API version prefix shared by every public route of the service. */
export const API_PREFIX = "/api/v1";

export const SYSTEM_ROUTES = {
  LIVENESS: "/health/live",
  READINESS: "/health/ready",
  METRICS: "/metrics",
  OPENAPI: "/openapi.json",
  DOCS: "/docs",
} as const;

/** Paths that are excluded from verbose access logging and rate limiting. */
export const QUIET_PATHS: ReadonlySet<string> = new Set([
  SYSTEM_ROUTES.LIVENESS,
  SYSTEM_ROUTES.READINESS,
  SYSTEM_ROUTES.METRICS,
]);
