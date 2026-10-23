import { describe, expect, test } from "bun:test";
import { NOTE_EVENT_TYPES, NOTE_LIMITS } from "@/constants/note.constants";
import { Note } from "@/models/note.model";
import { DomainError } from "@driversim/core";
import { newId } from "@driversim/core";

const now = new Date("2026-03-01T10:00:00Z");
const create = (overrides: Partial<Parameters<typeof Note.create>[0]> = {}) =>
  Note.create(
    { id: newId(), schoolId: newId(), title: "  Title  ", body: "Body", createdBy: newId(), ...overrides },
    now,
  );

describe("Note aggregate", () => {
  test("create trims values, starts at version 1 and records NoteCreated", () => {
    const note = create();
    expect(note.title).toBe("Title");
    expect(note.version).toBe(1);
    const events = note.pullEvents();
    expect(events.map((event) => event.type)).toEqual([NOTE_EVENT_TYPES.CREATED]);
    expect(note.pullEvents()).toEqual([]);
  });

  test("enforces title and body invariants", () => {
    expect(() => create({ title: "   " })).toThrow(DomainError);
    expect(() => create({ title: "x".repeat(NOTE_LIMITS.TITLE_MAX + 1) })).toThrow(DomainError);
    expect(() => create({ body: "x".repeat(NOTE_LIMITS.BODY_MAX + 1) })).toThrow(DomainError);
  });

  test("update bumps version and lists changed fields", () => {
    const note = create();
    note.pullEvents();
    const later = new Date(now.getTime() + 1_000);
    expect(note.update({ title: "New", body: "Body" }, "actor", later)).toBe(true);
    expect(note.version).toBe(2);
    expect(note.updatedAt).toEqual(later);
    const [event] = note.pullEvents();
    expect(event?.payload).toMatchObject({ changedFields: ["title"], version: 2, updatedBy: "actor" });
  });

  test("no-op update changes nothing and records nothing", () => {
    const note = create();
    note.pullEvents();
    expect(note.update({ title: "Title" }, "actor", now)).toBe(false);
    expect(note.version).toBe(1);
    expect(note.pullEvents()).toEqual([]);
  });

  test("restore never emits events", () => {
    const restored = Note.restore(create().toSnapshot());
    expect(restored.pullEvents()).toEqual([]);
  });
});
