import { ERROR_CODES } from "@driversim/core";
import { z } from "@hono/zod-openapi";

const errorCodeValues = Object.values(ERROR_CODES) as [string, ...string[]];

export const fieldIssueSchema = z.object({
  path: z.string().openapi({ example: "body.title" }),
  message: z.string().openapi({ example: "Is required." }),
  code: z.string().optional(),
});

export const paginationMetaSchema = z.object({
  limit: z.number().int(),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const responseMetaSchema = z.object({
  requestId: z.string().openapi({ example: "01928c7e-1234-7000-8000-00000000abcd" }),
  pagination: paginationMetaSchema.optional(),
});

export const errorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z.object({
      code: z.enum(errorCodeValues).openapi({ example: "VALIDATION_FAILED" }),
      message: z.string(),
      details: z.array(fieldIssueSchema).optional(),
    }),
    meta: responseMetaSchema,
  })
  .openapi("ErrorResponse");

/** Standard success envelope: `{ success: true, data, meta }`. */
export const successResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ success: z.literal(true), data, meta: responseMetaSchema });

/** Paginated success envelope: `data` is an array and `meta.pagination` is always present. */
export const paginatedResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    success: z.literal(true),
    data: z.array(item),
    meta: responseMetaSchema.extend({ pagination: paginationMetaSchema }),
  });

export type ErrorResponseDto = z.infer<typeof errorResponseSchema>;
