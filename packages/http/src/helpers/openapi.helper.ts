import type { z } from "@hono/zod-openapi";
import { errorResponseSchema } from "../dto/response.dto";

const ERROR_DESCRIPTIONS = {
  400: "Malformed request",
  401: "Missing, invalid or expired access token",
  403: "Authenticated but not allowed",
  404: "Resource not found",
  409: "Conflict with the current state (e.g. stale version)",
  413: "Payload too large",
  422: "Validation failed — see `error.details`",
  429: "Rate limit exceeded",
  503: "A dependency is unavailable",
} as const;

type DocumentedErrorStatus = keyof typeof ERROR_DESCRIPTIONS;

export const jsonContent = <T extends z.ZodTypeAny>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

export const jsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
});

/** Documents the standard error envelope for the given statuses. */
export const errorResponses = <S extends DocumentedErrorStatus>(...statuses: S[]) =>
  Object.fromEntries(
    statuses.map((status) => [status, jsonContent(errorResponseSchema, ERROR_DESCRIPTIONS[status])]),
  ) as Record<S, ReturnType<typeof jsonContent<typeof errorResponseSchema>>>;
