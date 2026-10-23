import type { NoteListFilter, NoteSnapshot } from "@/interfaces/note/note.interface";
import type { INoteRepository } from "@/interfaces/note/repository.interface";
import { Note } from "@/models/note.model";
import { decodeCursor, toPage } from "@driversim/core";
import type { Page, PageRequest } from "@driversim/core";

/**
 * EXAMPLE DOMAIN in-memory adapter. Stores snapshots (not live objects) so it behaves like a
 * real database: callers cannot mutate stored state without going through the repository.
 */
export class MemoryNoteRepository implements INoteRepository {
  constructor(readonly rows: Map<string, NoteSnapshot> = new Map()) {}

  async insert(note: Note): Promise<void> {
    if (this.rows.has(note.id)) throw new Error(`Duplicate note id ${note.id}`);
    this.rows.set(note.id, note.toSnapshot());
  }

  async update(note: Note, expectedVersion: number): Promise<boolean> {
    const current = this.rows.get(note.id);
    if (!current || current.schoolId !== note.schoolId || current.version !== expectedVersion) return false;
    this.rows.set(note.id, note.toSnapshot());
    return true;
  }

  async findById(schoolId: string, noteId: string): Promise<Note | null> {
    const row = this.rows.get(noteId);
    return row && row.schoolId === schoolId ? Note.restore(row) : null;
  }

  async list(filter: NoteListFilter, page: PageRequest): Promise<Page<Note>> {
    const after = decodeCursor(page.cursor);
    const matches = [...this.rows.values()]
      .filter((row) => row.schoolId === filter.schoolId)
      .filter((row) => filter.createdBy === undefined || row.createdBy === filter.createdBy)
      .filter((row) => after === null || row.id < after)
      .sort((a, b) => (a.id < b.id ? 1 : -1))
      .slice(0, page.limit + 1)
      .map((row) => Note.restore(row));
    return toPage(matches, page.limit, (note) => note.id);
  }

  async delete(schoolId: string, noteId: string): Promise<boolean> {
    const row = this.rows.get(noteId);
    if (!row || row.schoolId !== schoolId) return false;
    return this.rows.delete(noteId);
  }
}
