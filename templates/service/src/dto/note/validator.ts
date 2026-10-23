import { validateWith } from "@driversim/core";
import {
  type CreateNoteRequestDto,
  type UpdateNoteRequestDto,
  createNoteRequestSchema,
  updateNoteRequestSchema,
} from "./request.dto";

/**
 * EXAMPLE DOMAIN validators for callers that bypass HTTP validation
 * (event consumers, seeds, scripts). HTTP routes validate through the route schemas.
 */
export const validateCreateNote = (input: unknown): CreateNoteRequestDto =>
  validateWith(createNoteRequestSchema, input, "body");

export const validateUpdateNote = (input: unknown): UpdateNoteRequestDto =>
  validateWith(updateNoteRequestSchema, input, "body");
