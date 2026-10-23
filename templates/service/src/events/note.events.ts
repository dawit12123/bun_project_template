import { NOTE_EVENT_TYPES, NOTE_EVENT_VERSION } from "@/constants/note.constants";
import type { DomainEvent } from "@driversim/core";

/** EXAMPLE DOMAIN events — the payloads are the public contract consumed by other services. */
export interface NoteCreatedPayload {
  noteId: string;
  schoolId: string;
  title: string;
  createdBy: string;
}

export interface NoteUpdatedPayload {
  noteId: string;
  schoolId: string;
  changedFields: Array<"title" | "body">;
  version: number;
  updatedBy: string;
}

export interface NoteDeletedPayload {
  noteId: string;
  schoolId: string;
  deletedBy: string;
}

const event = <T>(type: string, aggregateId: string, occurredAt: Date, payload: T): DomainEvent<T> => ({
  type,
  version: NOTE_EVENT_VERSION,
  aggregateId,
  occurredAt,
  payload,
});

export const noteCreated = (payload: NoteCreatedPayload, at: Date) =>
  event(NOTE_EVENT_TYPES.CREATED, payload.noteId, at, payload);

export const noteUpdated = (payload: NoteUpdatedPayload, at: Date) =>
  event(NOTE_EVENT_TYPES.UPDATED, payload.noteId, at, payload);

export const noteDeleted = (payload: NoteDeletedPayload, at: Date) =>
  event(NOTE_EVENT_TYPES.DELETED, payload.noteId, at, payload);
