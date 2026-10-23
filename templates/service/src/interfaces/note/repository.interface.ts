import type { Note } from "@/models/note.model";
import type { Page, PageRequest } from "@driversim/core";
import type { OutboxWriter } from "@driversim/core";
import type { UnitOfWork } from "@driversim/core";
import type { NoteListFilter } from "./note.interface";

/** Outbound port — implemented by repositories/postgres and repositories/memory. */
export interface INoteRepository {
  insert(note: Note): Promise<void>;
  /** Persists changes only if the stored version still equals `expectedVersion`. */
  update(note: Note, expectedVersion: number): Promise<boolean>;
  findById(schoolId: string, noteId: string): Promise<Note | null>;
  list(filter: NoteListFilter, page: PageRequest): Promise<Page<Note>>;
  delete(schoolId: string, noteId: string): Promise<boolean>;
}

/** Everything a note use case may touch inside one transaction. */
export interface NoteTransactionScope {
  notes: INoteRepository;
  outbox: OutboxWriter;
}

export interface INoteUnitOfWork extends UnitOfWork<NoteTransactionScope> {
  /** Non-transactional repository for read-only use cases. */
  readonly notes: INoteRepository;
}
