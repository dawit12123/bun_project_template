import type { NoteListFilter, NoteRecord } from "@/interfaces/note/note.interface";
import type { INoteRepository } from "@/interfaces/note/repository.interface";
import { NoteMapper } from "@/mappers/note.mapper";
import type { Note } from "@/models/note.model";
import { decodeCursor, toPage } from "@driversim/core";
import type { Page, PageRequest } from "@driversim/core";
import type { SQL } from "bun";

/** EXAMPLE DOMAIN Postgres adapter. Works with the pool or with a transaction handle. */
export class PostgresNoteRepository implements INoteRepository {
  constructor(private readonly sql: SQL) {}

  async insert(note: Note): Promise<void> {
    const row = NoteMapper.toRecord(note);
    await this.sql`
      insert into notes (id, school_id, title, body, created_by, created_at, updated_at, version)
      values (${row.id}, ${row.school_id}, ${row.title}, ${row.body}, ${row.created_by},
              ${row.created_at}, ${row.updated_at}, ${row.version})`;
  }

  async update(note: Note, expectedVersion: number): Promise<boolean> {
    const row = NoteMapper.toRecord(note);
    const updated = await this.sql`
      update notes
      set title = ${row.title}, body = ${row.body}, updated_at = ${row.updated_at}, version = ${row.version}
      where id = ${row.id} and school_id = ${row.school_id} and version = ${expectedVersion}
      returning id`;
    return updated.length === 1;
  }

  async findById(schoolId: string, noteId: string): Promise<Note | null> {
    const [row] = (await this.sql`
      select id, school_id, title, body, created_by, created_at, updated_at, version
      from notes
      where school_id = ${schoolId} and id = ${noteId}`) as NoteRecord[];
    return row ? NoteMapper.fromRecord(row) : null;
  }

  /** Keyset pagination, newest first (UUIDv7 ids are time-ordered). */
  async list(filter: NoteListFilter, page: PageRequest): Promise<Page<Note>> {
    const after = decodeCursor(page.cursor);
    const createdBy = filter.createdBy ?? null;
    const rows = (await this.sql`
      select id, school_id, title, body, created_by, created_at, updated_at, version
      from notes
      where school_id = ${filter.schoolId}
        and (${createdBy}::uuid is null or created_by = ${createdBy}::uuid)
        and (${after}::uuid is null or id < ${after}::uuid)
      order by id desc
      limit ${page.limit + 1}`) as NoteRecord[];
    return toPage(rows.map(NoteMapper.fromRecord), page.limit, (note) => note.id);
  }

  async delete(schoolId: string, noteId: string): Promise<boolean> {
    const deleted = await this
      .sql`delete from notes where school_id = ${schoolId} and id = ${noteId} returning id`;
    return deleted.length === 1;
  }
}
