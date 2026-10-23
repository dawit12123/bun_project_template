import { PAGINATION } from "@driversim/core";
import { uuidField } from "@driversim/core";
import { z } from "@hono/zod-openapi";

export const paginationQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(PAGINATION.MIN_LIMIT)
    .max(PAGINATION.MAX_LIMIT)
    .default(PAGINATION.DEFAULT_LIMIT)
    .openapi({ param: { name: "limit", in: "query" }, example: PAGINATION.DEFAULT_LIMIT }),
  cursor: z
    .string()
    .max(512)
    .optional()
    .openapi({
      param: { name: "cursor", in: "query" },
      description: "Opaque cursor from `meta.pagination`.",
    }),
});

export const idParamSchema = z.object({
  id: uuidField().openapi({
    param: { name: "id", in: "path" },
    example: "01928c7e-0000-7000-8000-000000000001",
  }),
});

export const schoolParamSchema = z.object({
  schoolId: uuidField().openapi({
    param: { name: "schoolId", in: "path" },
    example: "01928c7e-0000-7000-8000-00000000000a",
  }),
});

export type PaginationQueryDto = z.infer<typeof paginationQuerySchema>;
export type IdParamDto = z.infer<typeof idParamSchema>;
export type SchoolParamDto = z.infer<typeof schoolParamSchema>;
