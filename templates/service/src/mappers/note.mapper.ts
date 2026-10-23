import type { NoteResponseDto } from "@/dto/note/response.dto";
import type { NoteRecord } from "@/interfaces/note/note.interface";
import { Note } from "@/models/note.model";

/** EXAMPLE DOMAIN translations between the model, the API contract and the database row. */
export const NoteMapper = {
  toResponse(note: Note): NoteResponseDto {
    return {
      id: note.id,
      schoolId: note.schoolId,
      title: note.title,
      body: note.body,
      createdBy: note.createdBy,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      version: note.version,
    };
  },

  toRecord(note: Note): NoteRecord {
    return {
      id: note.id,
      school_id: note.schoolId,
      title: note.title,
      body: note.body,
      created_by: note.createdBy,
      created_at: note.createdAt,
      updated_at: note.updatedAt,
      version: note.version,
    };
  },

  fromRecord(record: NoteRecord): Note {
    return Note.restore({
      id: record.id,
      schoolId: record.school_id,
      title: record.title,
      body: record.body,
      createdBy: record.created_by,
      createdAt: new Date(record.created_at),
      updatedAt: new Date(record.updated_at),
      version: Number(record.version),
    });
  },
} as const;
