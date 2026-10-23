import { z } from "@hono/zod-openapi";

export const livenessResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.string(),
    version: z.string(),
    uptimeSeconds: z.number(),
  })
  .openapi("LivenessResponse");

export const readinessResponseSchema = z
  .object({
    status: z.enum(["ready", "not_ready"]),
    checks: z.record(
      z.object({
        status: z.enum(["up", "down"]),
        critical: z.boolean(),
        durationMs: z.number(),
      }),
    ),
  })
  .openapi("ReadinessResponse");

export type LivenessResponseDto = z.infer<typeof livenessResponseSchema>;
export type ReadinessResponseDto = z.infer<typeof readinessResponseSchema>;
