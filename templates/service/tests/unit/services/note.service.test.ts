import { beforeEach, describe, expect, test } from "bun:test";
import { NOTE_EVENT_TYPES, NOTE_TOPIC } from "@/constants/note.constants";
import { MemoryNoteUnitOfWork } from "@/repositories/memory/note.unit-of-work";
import { NoteService } from "@/services/note.service";
import type { AppError } from "@driversim/core";
import { ManualClock } from "@driversim/core";
import { newId } from "@driversim/core";
import type { ActionContext } from "@driversim/core";
import { MemoryOutbox } from "@driversim/messaging";

const schoolId = newId();
const context: ActionContext = {
  correlationId: "corr-12345678",
  actor: {
    userId: newId(),
    identityType: "school_staff",
    sessionId: "s",
    tokenId: "t",
    roles: [],
    permissions: new Set(),
    schoolId,
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
  },
};

let outbox: MemoryOutbox;
let unitOfWork: MemoryNoteUnitOfWork;
let service: NoteService;

beforeEach(() => {
  outbox = new MemoryOutbox();
  unitOfWork = new MemoryNoteUnitOfWork(outbox);
  service = new NoteService({ unitOfWork, clock: new ManualClock(), newId, serviceName: "svc" });
});

const errorOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error as AppError,
  );

describe("NoteService", () => {
  test("create persists the note and stages its event in the outbox", async () => {
    const note = await service.create(context, schoolId, { title: "Hello", body: "" });
    expect(await service.get(schoolId, note.id)).toEqual(note);
    expect(outbox.pending).toHaveLength(1);
    const [message] = outbox.pending;
    expect(message?.topic).toBe(NOTE_TOPIC);
    expect(message?.key).toBe(note.id);
    expect(message?.envelope).toMatchObject({
      type: NOTE_EVENT_TYPES.CREATED,
      source: "svc",
      schoolId,
      correlationId: context.correlationId,
    });
  });

  test("notes are invisible from another school", async () => {
    const note = await service.create(context, schoolId, { title: "Hello", body: "" });
    expect((await errorOf(service.get(newId(), note.id)))?.code).toBe("NOT_FOUND");
  });

  test("update with a stale version is a conflict and changes nothing", async () => {
    const note = await service.create(context, schoolId, { title: "v1", body: "" });
    await service.update(context, schoolId, note.id, { title: "v2", version: 1 });
    const error = await errorOf(service.update(context, schoolId, note.id, { title: "v3", version: 1 }));
    expect(error?.code).toBe("CONFLICT");
    expect((await service.get(schoolId, note.id)).title).toBe("v2");
    expect(outbox.pending.map((m) => m.envelope.type)).toEqual([
      NOTE_EVENT_TYPES.CREATED,
      NOTE_EVENT_TYPES.UPDATED,
    ]);
  });

  test("a failing unit of work rolls back rows and discards staged events", async () => {
    const note = await service.create(context, schoolId, { title: "keep", body: "" });
    const failing = unitOfWork.run(async ({ notes, outbox: writer }) => {
      await notes.delete(schoolId, note.id);
      await writer.add(outbox.pending[0] as never);
      throw new Error("boom");
    });
    await expect(failing).rejects.toThrow("boom");
    expect((await service.get(schoolId, note.id)).title).toBe("keep");
    expect(outbox.pending).toHaveLength(1);
  });

  test("delete removes the note and publishes NoteDeleted", async () => {
    const note = await service.create(context, schoolId, { title: "bye", body: "" });
    await service.delete(context, schoolId, note.id);
    expect((await errorOf(service.get(schoolId, note.id)))?.code).toBe("NOT_FOUND");
    expect(outbox.pending.at(-1)?.envelope.type).toBe(NOTE_EVENT_TYPES.DELETED);
  });

  test("list paginates newest first", async () => {
    for (const title of ["a", "b", "c"]) await service.create(context, schoolId, { title, body: "" });
    const first = await service.list(schoolId, { limit: 2 });
    expect(first.items.map((n) => n.title)).toEqual(["c", "b"]);
    expect(first.hasMore).toBe(true);
    const second = await service.list(schoolId, { limit: 2, cursor: first.nextCursor ?? undefined });
    expect(second.items.map((n) => n.title)).toEqual(["a"]);
    expect(second.hasMore).toBe(false);
  });
});
