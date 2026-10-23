/**
 * EXAMPLE DOMAIN — everything the `note` domain treats as a fixed value lives here.
 * Remove together with the rest of the note domain when generating a real service.
 */
export const NOTE_PERMISSIONS = {
  READ: "notes:read",
  WRITE: "notes:write",
  DELETE: "notes:delete",
  /** Platform-level permission that bypasses school scoping (e.g. platform admins). */
  READ_ANY_SCHOOL: "notes:read:any-school",
} as const;

export const NOTE_LIMITS = {
  TITLE_MIN: 1,
  TITLE_MAX: 200,
  BODY_MAX: 10_000,
} as const;

export const NOTE_EVENT_TYPES = {
  CREATED: "note.created",
  UPDATED: "note.updated",
  DELETED: "note.deleted",
} as const;

export const NOTE_EVENT_VERSION = 1;

/** Kafka/Redpanda topic carrying every event of this bounded context. */
export const NOTE_TOPIC = "driversim.notes.events.v1";

export const NOTE_ERROR_MESSAGES = {
  NOT_FOUND: "Note not found.",
  VERSION_CONFLICT: "The note was modified by someone else. Reload it and try again.",
  EMPTY_UPDATE: "Provide at least one field to update.",
} as const;
