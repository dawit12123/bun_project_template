import type { NoteBody } from "@/models/note-body.model";
import type { NoteTitle } from "@/models/note-title.model";

/** EXAMPLE DOMAIN — state held by the Note aggregate. */
export interface NoteProps {
  schoolId: string;
  title: NoteTitle;
  body: NoteBody;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  /** Optimistic-concurrency version, incremented on every change. */
  version: number;
}

/** Primitive, persistence-friendly view of a Note. */
export interface NoteSnapshot {
  id: string;
  schoolId: string;
  title: string;
  body: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

/** Row shape of the `notes` table. */
export interface NoteRecord {
  id: string;
  school_id: string;
  title: string;
  body: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  version: number;
}

export interface CreateNoteInput {
  id: string;
  schoolId: string;
  title: string;
  body: string;
  createdBy: string;
}

export interface NoteChanges {
  title?: string;
  body?: string;
}

export interface NoteListFilter {
  schoolId: string;
  createdBy?: string;
}
