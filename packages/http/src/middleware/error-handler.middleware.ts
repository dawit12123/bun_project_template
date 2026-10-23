import { HEADERS } from "@driversim/core";
import { zodIssuesToFieldIssues } from "@driversim/core";
import { type AppError, isAppError } from "@driversim/core";
import { Errors } from "@driversim/core";
import { newId } from "@driversim/core";
import type { Logger } from "@driversim/core";
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { toFailureBody } from "../helpers/response.helper";
import type { AppEnv } from "../types/http.interface";

const fromHttpException = (error: HTTPException): AppError => {
  switch (error.status) {
    case 400:
      return Errors.badRequest(error.message || undefined);
    case 401:
      return Errors.unauthenticated();
    case 403:
      return Errors.forbidden();
    case 404:
      return Errors.notFound();
    case 413:
      return Errors.payloadTooLarge();
    case 429:
      return Errors.rateLimited(1);
    default:
      return Errors.internal(error);
  }
};

/** Normalizes anything thrown into an AppError. Unknown errors become INTERNAL. */
export const toAppError = (error: unknown): AppError => {
  if (isAppError(error)) return error;
  if (error instanceof HTTPException) return fromHttpException(error);
  if (error instanceof ZodError) return Errors.validation(zodIssuesToFieldIssues(error));
  return Errors.internal(error);
};

/** Single exit point for failures: standard envelope, safe messages, 5xx always logged. */
export const errorHandler =
  (fallbackLogger: Logger): ErrorHandler<AppEnv> =>
  (error, c) => {
    const appError = toAppError(error);
    const requestId = c.get("requestId") ?? newId();
    const logger = c.get("logger") ?? fallbackLogger;

    if (appError.status >= 500) {
      logger.error("request failed", { code: appError.code, err: error });
    } else {
      logger.debug("request rejected", { code: appError.code, message: appError.message });
    }

    return c.json(toFailureBody(appError, requestId), appError.status, {
      ...appError.headers,
      [HEADERS.REQUEST_ID]: requestId,
    });
  };
