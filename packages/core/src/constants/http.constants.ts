export const HEADERS = {
  AUTHORIZATION: "authorization",
  REQUEST_ID: "x-request-id",
  CORRELATION_ID: "x-correlation-id",
  FORWARDED_FOR: "x-forwarded-for",
  RETRY_AFTER: "retry-after",
  RATE_LIMIT_LIMIT: "ratelimit-limit",
  RATE_LIMIT_REMAINING: "ratelimit-remaining",
  RATE_LIMIT_RESET: "ratelimit-reset",
  WWW_AUTHENTICATE: "www-authenticate",
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];

export const BEARER_PREFIX = "Bearer ";
