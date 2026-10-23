import { NOTE_PERMISSIONS } from "@/constants/note.constants";
import type { NoteController } from "@/controllers/note.controller";
import {
  createNoteRequestSchema,
  deleteNoteQuerySchema,
  listNotesQuerySchema,
  noteParamsSchema,
  updateNoteRequestSchema,
} from "@/dto/note/request.dto";
import { noteEnvelopeSchema, noteListEnvelopeSchema } from "@/dto/note/response.dto";
import { schoolParamSchema } from "@driversim/http";
import { requirePermissions } from "@driversim/http";
import { requireSchoolAccess } from "@driversim/http";
import { errorResponses, jsonBody, jsonContent } from "@driversim/http";
import { BEARER_SECURITY } from "@driversim/http";
import { createRouter } from "@driversim/http";
import type { AppEnv } from "@driversim/http";
import { createRoute } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";

/** EXAMPLE DOMAIN — OpenAPI route definitions. Guards run before validation and the handler. */
const tags = ["Notes"];
const schoolScoped = (...permissions: string[]): [MiddlewareHandler<AppEnv>, MiddlewareHandler<AppEnv>] => [
  requireSchoolAccess({ crossSchoolPermission: NOTE_PERMISSIONS.READ_ANY_SCHOOL }),
  requirePermissions(...permissions),
];

export const noteRoutes = {
  create: createRoute({
    method: "post",
    path: "/schools/{schoolId}/notes",
    tags,
    summary: "Create a note",
    security: BEARER_SECURITY,
    middleware: schoolScoped(NOTE_PERMISSIONS.WRITE),
    request: { params: schoolParamSchema, body: jsonBody(createNoteRequestSchema) },
    responses: {
      201: jsonContent(noteEnvelopeSchema, "Note created"),
      ...errorResponses(401, 403, 422, 429),
    },
  }),
  list: createRoute({
    method: "get",
    path: "/schools/{schoolId}/notes",
    tags,
    summary: "List notes of a school (newest first, cursor pagination)",
    security: BEARER_SECURITY,
    middleware: schoolScoped(NOTE_PERMISSIONS.READ),
    request: { params: schoolParamSchema, query: listNotesQuerySchema },
    responses: {
      200: jsonContent(noteListEnvelopeSchema, "A page of notes"),
      ...errorResponses(401, 403, 422, 429),
    },
  }),
  get: createRoute({
    method: "get",
    path: "/schools/{schoolId}/notes/{noteId}",
    tags,
    summary: "Get a note",
    security: BEARER_SECURITY,
    middleware: schoolScoped(NOTE_PERMISSIONS.READ),
    request: { params: noteParamsSchema },
    responses: {
      200: jsonContent(noteEnvelopeSchema, "The note"),
      ...errorResponses(401, 403, 404, 422, 429),
    },
  }),
  update: createRoute({
    method: "patch",
    path: "/schools/{schoolId}/notes/{noteId}",
    tags,
    summary: "Update a note (optimistic concurrency via `version`)",
    security: BEARER_SECURITY,
    middleware: schoolScoped(NOTE_PERMISSIONS.WRITE),
    request: { params: noteParamsSchema, body: jsonBody(updateNoteRequestSchema) },
    responses: {
      200: jsonContent(noteEnvelopeSchema, "The updated note"),
      ...errorResponses(401, 403, 404, 409, 422, 429),
    },
  }),
  remove: createRoute({
    method: "delete",
    path: "/schools/{schoolId}/notes/{noteId}",
    tags,
    summary: "Delete a note",
    security: BEARER_SECURITY,
    middleware: schoolScoped(NOTE_PERMISSIONS.DELETE),
    request: { params: noteParamsSchema, query: deleteNoteQuerySchema },
    responses: {
      204: { description: "Note deleted" },
      ...errorResponses(401, 403, 404, 409, 422, 429),
    },
  }),
};

export const createNoteRouter = (controller: NoteController) =>
  createRouter()
    .openapi(noteRoutes.create, controller.create)
    .openapi(noteRoutes.list, controller.list)
    .openapi(noteRoutes.get, controller.get)
    .openapi(noteRoutes.update, controller.update)
    .openapi(noteRoutes.remove, controller.remove);
