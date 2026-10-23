import { NOTE_ERROR_MESSAGES, NOTE_LIMITS } from "@/constants/note.constants";
import { trimmedString, uuidField } from "@driversim/core";
import { paginationQuerySchema, schoolParamSchema } from "@driversim/http";
import { z } from "@hono/zod-openapi";

/** EXAMPLE DOMAIN request DTOs. */
const noteTitle = () =>
  trimmedString(NOTE_LIMITS.TITLE_MIN, NOTE_LIMITS.TITLE_MAX).openapi({ example: "Road signs — week 1" });
const noteBody = () =>
  z.string().trim().max(NOTE_LIMITS.BODY_MAX).openapi({ example: "Review warning and regulatory signs." });

export const noteParamsSchema = schoolParamSchema.extend({
  noteId: uuidField().openapi({ param: { name: "noteId", in: "path" } }),
});

export const createNoteRequestSchema = z
  .object({
    title: noteTitle(),
    body: noteBody().default(""),
  })
  .openapi("CreateNoteRequest");

export const updateNoteRequestSchema = z
  .object({
    title: noteTitle().optional(),
    body: noteBody().optional(),
    version: z
      .number()
      .int()
      .positive()
      .openapi({ description: "Version the client last read.", example: 1 }),
  })
  .refine((value) => value.title !== undefined || value.body !== undefined, {
    message: NOTE_ERROR_MESSAGES.EMPTY_UPDATE,
    path: ["title"],
  })
  .openapi("UpdateNoteRequest");

export const deleteNoteQuerySchema = z.object({
  version: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .openapi({
      param: { name: "version", in: "query" },
      description: "Optional optimistic-concurrency guard.",
    }),
});

export const listNotesQuerySchema = paginationQuerySchema.extend({
  createdBy: uuidField()
    .optional()
    .openapi({ param: { name: "createdBy", in: "query" } }),
});

export type NoteParamsDto = z.infer<typeof noteParamsSchema>;
export type CreateNoteRequestDto = z.infer<typeof createNoteRequestSchema>;
export type UpdateNoteRequestDto = z.infer<typeof updateNoteRequestSchema>;
export type DeleteNoteQueryDto = z.infer<typeof deleteNoteQuerySchema>;
export type ListNotesQueryDto = z.infer<typeof listNotesQuerySchema>;
