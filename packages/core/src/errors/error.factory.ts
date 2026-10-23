import { HEADERS } from "../constants/http.constants";
import type { FieldIssue } from "../types/response.interface";
import { AppError } from "./app.error";

export const Errors = {
  badRequest: (message?: string, details?: FieldIssue[]) => new AppError("BAD_REQUEST", message, { details }),
  validation: (details: FieldIssue[], message?: string) =>
    new AppError("VALIDATION_FAILED", message, { details }),
  unauthenticated: (message?: string, cause?: unknown) =>
    new AppError("UNAUTHENTICATED", message, { cause, headers: { [HEADERS.WWW_AUTHENTICATE]: "Bearer" } }),
  forbidden: (message?: string) => new AppError("FORBIDDEN", message),
  notFound: (message?: string) => new AppError("NOT_FOUND", message),
  conflict: (message?: string, details?: FieldIssue[]) => new AppError("CONFLICT", message, { details }),
  payloadTooLarge: () => new AppError("PAYLOAD_TOO_LARGE"),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError("RATE_LIMITED", undefined, {
      headers: { [HEADERS.RETRY_AFTER]: String(Math.max(1, Math.ceil(retryAfterSeconds))) },
    }),
  dependencyUnavailable: (cause?: unknown) => new AppError("DEPENDENCY_UNAVAILABLE", undefined, { cause }),
  internal: (cause?: unknown) => new AppError("INTERNAL", undefined, { cause }),
} as const;
