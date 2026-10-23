import { NOTE_ERROR_MESSAGES } from "@/constants/note.constants";
import { DomainError } from "@driversim/core";

/** EXAMPLE DOMAIN errors. */
export const NoteErrors = {
  notFound: () => new DomainError("NOT_FOUND", NOTE_ERROR_MESSAGES.NOT_FOUND),
  versionConflict: (expectedVersion: number) =>
    new DomainError("CONFLICT", NOTE_ERROR_MESSAGES.VERSION_CONFLICT, {
      details: [{ path: "version", message: `Version ${expectedVersion} is stale.` }],
    }),
  invalidField: (path: "title" | "body", message: string) =>
    new DomainError("VALIDATION_FAILED", undefined, { details: [{ path, message }] }),
} as const;
