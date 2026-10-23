import type { AppError } from "@driversim/core";
import type { Page } from "@driversim/core";
import type { ApiFailure } from "@driversim/core";
import type { Context } from "hono";
import type { AppEnv } from "../types/http.interface";

/**
 * Builders for the standard response envelope:
 *   success → { success: true,  data,  meta: { requestId, pagination? } }
 *   failure → { success: false, error: { code, message, details? }, meta: { requestId } }
 */
export const ok = <T>(c: Context<AppEnv>, data: T) =>
  c.json({ success: true as const, data, meta: { requestId: c.get("requestId") } }, 200);

export const created = <T>(c: Context<AppEnv>, data: T) =>
  c.json({ success: true as const, data, meta: { requestId: c.get("requestId") } }, 201);

export const paginated = <T>(c: Context<AppEnv>, page: Page<T>, limit: number) =>
  c.json(
    {
      success: true as const,
      data: page.items,
      meta: {
        requestId: c.get("requestId"),
        pagination: { limit, nextCursor: page.nextCursor, hasMore: page.hasMore },
      },
    },
    200,
  );

export const noContent = (c: Context<AppEnv>) => c.body(null, 204);

/** Internal errors never leak their message; every other AppError message is client-safe. */
export const toFailureBody = (error: AppError, requestId: string): ApiFailure => ({
  success: false,
  error: {
    code: error.code,
    message: error.message,
    ...(error.details && error.details.length > 0 ? { details: error.details } : {}),
  },
  meta: { requestId },
});
