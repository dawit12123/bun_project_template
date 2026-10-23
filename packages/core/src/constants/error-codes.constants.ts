import { HTTP_STATUS, type HttpStatus } from "./http.constants";

/** Transport-agnostic error codes. Clients branch on these, never on messages. */
export const ERROR_CODES = {
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  RATE_LIMITED: "RATE_LIMITED",
  DEPENDENCY_UNAVAILABLE: "DEPENDENCY_UNAVAILABLE",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ERROR_HTTP_STATUS = {
  BAD_REQUEST: HTTP_STATUS.BAD_REQUEST,
  VALIDATION_FAILED: HTTP_STATUS.UNPROCESSABLE_ENTITY,
  UNAUTHENTICATED: HTTP_STATUS.UNAUTHORIZED,
  FORBIDDEN: HTTP_STATUS.FORBIDDEN,
  NOT_FOUND: HTTP_STATUS.NOT_FOUND,
  CONFLICT: HTTP_STATUS.CONFLICT,
  PAYLOAD_TOO_LARGE: HTTP_STATUS.PAYLOAD_TOO_LARGE,
  RATE_LIMITED: HTTP_STATUS.TOO_MANY_REQUESTS,
  DEPENDENCY_UNAVAILABLE: HTTP_STATUS.SERVICE_UNAVAILABLE,
  INTERNAL: HTTP_STATUS.INTERNAL_SERVER_ERROR,
} as const satisfies Record<ErrorCode, HttpStatus>;

/** HTTP statuses an error can map to (never 2xx). */
export type ErrorHttpStatus = (typeof ERROR_HTTP_STATUS)[ErrorCode];

export const DEFAULT_ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  BAD_REQUEST: "The request is malformed.",
  VALIDATION_FAILED: "The request failed validation.",
  UNAUTHENTICATED: "Authentication is required.",
  FORBIDDEN: "You do not have permission to perform this action.",
  NOT_FOUND: "The requested resource was not found.",
  CONFLICT: "The request conflicts with the current state of the resource.",
  PAYLOAD_TOO_LARGE: "The request payload is too large.",
  RATE_LIMITED: "Too many requests. Please retry later.",
  DEPENDENCY_UNAVAILABLE: "A required dependency is temporarily unavailable.",
  INTERNAL: "An unexpected error occurred.",
};
