import {
  DEFAULT_ERROR_MESSAGES,
  ERROR_HTTP_STATUS,
  type ErrorCode,
  type ErrorHttpStatus,
} from "../constants/error-codes.constants";
import type { FieldIssue } from "../types/response.interface";

export interface AppErrorOptions {
  details?: FieldIssue[];
  headers?: Record<string, string>;
  cause?: unknown;
}

/** Base error for every expected failure. Its code and message are safe to return to clients. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: ErrorHttpStatus;
  readonly details?: FieldIssue[];
  readonly headers?: Record<string, string>;

  constructor(
    code: ErrorCode,
    message: string = DEFAULT_ERROR_MESSAGES[code],
    options: AppErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = ERROR_HTTP_STATUS[code];
    this.details = options.details;
    this.headers = options.headers;
  }
}

/** Raised by models and services when a business rule is violated. */
export class DomainError extends AppError {}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
