import { paginatedResponseSchema, successResponseSchema } from "@driversim/http";
import { z } from "@hono/zod-openapi";

/** EXAMPLE DOMAIN response DTOs. */
export const noteResponseSchema = z
  .object({
    id: z.string().uuid(),
    schoolId: z.string().uuid(),
    title: z.string(),
    body: z.string(),
    createdBy: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    version: z.number().int(),
  })
  .openapi("Note");

export const noteEnvelopeSchema = successResponseSchema(noteResponseSchema).openapi("NoteResponse");
export const noteListEnvelopeSchema = paginatedResponseSchema(noteResponseSchema).openapi("NoteListResponse");

export type NoteResponseDto = z.infer<typeof noteResponseSchema>;
