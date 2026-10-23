import { NOTE_LIMITS } from "@/constants/note.constants";
import { NoteErrors } from "@/errors/note.errors";
import { ValueObject } from "@driversim/core";

/** Value object: a trimmed, non-empty note title within the configured length. */
export class NoteTitle extends ValueObject<{ value: string }> {
  static create(raw: string): NoteTitle {
    const value = raw.trim();
    if (value.length < NOTE_LIMITS.TITLE_MIN) throw NoteErrors.invalidField("title", "Title is required.");
    if (value.length > NOTE_LIMITS.TITLE_MAX) {
      throw NoteErrors.invalidField("title", `Title must be at most ${NOTE_LIMITS.TITLE_MAX} characters.`);
    }
    return new NoteTitle({ value });
  }

  get value(): string {
    return this.props.value;
  }
}
