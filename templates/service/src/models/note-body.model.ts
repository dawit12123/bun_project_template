import { NOTE_LIMITS } from "@/constants/note.constants";
import { NoteErrors } from "@/errors/note.errors";
import { ValueObject } from "@driversim/core";

/** Value object: note body text (may be empty) within the configured length. */
export class NoteBody extends ValueObject<{ value: string }> {
  static create(raw: string): NoteBody {
    const value = raw.trim();
    if (value.length > NOTE_LIMITS.BODY_MAX) {
      throw NoteErrors.invalidField("body", `Body must be at most ${NOTE_LIMITS.BODY_MAX} characters.`);
    }
    return new NoteBody({ value });
  }

  get value(): string {
    return this.props.value;
  }
}
