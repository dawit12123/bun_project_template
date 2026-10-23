import { noteCreated, noteDeleted, noteUpdated } from "@/events/note.events";
import type { CreateNoteInput, NoteChanges, NoteProps, NoteSnapshot } from "@/interfaces/note/note.interface";
import { AggregateRoot } from "@driversim/core";
import { NoteBody } from "./note-body.model";
import { NoteTitle } from "./note-title.model";

/** EXAMPLE DOMAIN aggregate. All invariants live here; no I/O, no framework. */
export class Note extends AggregateRoot<NoteProps> {
  static create(input: CreateNoteInput, now: Date): Note {
    const note = new Note(input.id, {
      schoolId: input.schoolId,
      title: NoteTitle.create(input.title),
      body: NoteBody.create(input.body),
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    note.record(
      noteCreated(
        { noteId: note.id, schoolId: note.schoolId, title: note.title, createdBy: note.createdBy },
        now,
      ),
    );
    return note;
  }

  /** Rehydrates a persisted note; never emits events. */
  static restore(snapshot: NoteSnapshot): Note {
    return new Note(snapshot.id, {
      schoolId: snapshot.schoolId,
      title: NoteTitle.create(snapshot.title),
      body: NoteBody.create(snapshot.body),
      createdBy: snapshot.createdBy,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      version: snapshot.version,
    });
  }

  /** Applies changes; returns false (and records nothing) when nothing actually changed. */
  update(changes: NoteChanges, actorId: string, now: Date): boolean {
    const changedFields: Array<"title" | "body"> = [];
    if (changes.title !== undefined) {
      const title = NoteTitle.create(changes.title);
      if (!title.equals(this.props.title)) {
        this.props.title = title;
        changedFields.push("title");
      }
    }
    if (changes.body !== undefined) {
      const body = NoteBody.create(changes.body);
      if (!body.equals(this.props.body)) {
        this.props.body = body;
        changedFields.push("body");
      }
    }
    if (changedFields.length === 0) return false;

    this.props.version += 1;
    this.props.updatedAt = now;
    this.record(
      noteUpdated(
        {
          noteId: this.id,
          schoolId: this.schoolId,
          changedFields,
          version: this.version,
          updatedBy: actorId,
        },
        now,
      ),
    );
    return true;
  }

  markDeleted(actorId: string, now: Date): void {
    this.record(noteDeleted({ noteId: this.id, schoolId: this.schoolId, deletedBy: actorId }, now));
  }

  get schoolId(): string {
    return this.props.schoolId;
  }
  get title(): string {
    return this.props.title.value;
  }
  get body(): string {
    return this.props.body.value;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get version(): number {
    return this.props.version;
  }

  toSnapshot(): NoteSnapshot {
    return {
      id: this.id,
      schoolId: this.schoolId,
      title: this.title,
      body: this.body,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
    };
  }
}
