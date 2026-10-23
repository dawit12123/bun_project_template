import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { NOTE_EVENT_TYPES } from "@/constants/note.constants";
import { Note } from "@/models/note.model";
import { PostgresNoteRepository } from "@/repositories/postgres/note.repository";
import { PostgresNoteUnitOfWork } from "@/repositories/postgres/note.unit-of-work";
import { NoteService } from "@/services/note.service";
import { ManualClock } from "@driversim/core";
import { newId } from "@driversim/core";
import type { ActionContext } from "@driversim/core";
import { isUniqueViolation } from "@driversim/postgres";
import { describeWithDatabase, resetTestDatabase } from "@tests/helpers/test-database";
import type { SQL } from "bun";

describeWithDatabase("Postgres note adapters", () => {
  let sql: SQL;
  let service: NoteService;
  const schoolId = newId();
  const context: ActionContext = {
    correlationId: "corr-int-0001",
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

  beforeAll(async () => {
    sql = await resetTestDatabase();
  });
  beforeEach(async () => {
    await sql`truncate notes, event_outbox`;
    service = new NoteService({
      unitOfWork: new PostgresNoteUnitOfWork(sql),
      clock: new ManualClock(new Date()),
      newId,
      serviceName: "svc",
    });
  });
  afterAll(async () => {
    await sql?.close();
  });

  test("create writes the row and its outbox event atomically", async () => {
    const note = await service.create(context, schoolId, { title: "Hello", body: "World" });
    expect(await service.get(schoolId, note.id)).toEqual(note);
    const outbox = await sql`select event_type, message_key, payload from event_outbox`;
    expect(outbox).toHaveLength(1);
    expect(outbox[0].event_type).toBe(NOTE_EVENT_TYPES.CREATED);
    expect(outbox[0].message_key).toBe(note.id);
    const payload = typeof outbox[0].payload === "string" ? JSON.parse(outbox[0].payload) : outbox[0].payload;
    expect(payload.correlationId).toBe(context.correlationId);
  });

  test("a failure inside the unit of work rolls back the row and the event", async () => {
    const unitOfWork = new PostgresNoteUnitOfWork(sql);
    const note = Note.create({ id: newId(), schoolId, title: "t", body: "", createdBy: newId() }, new Date());
    await expect(
      unitOfWork.run(async ({ notes, outbox }) => {
        await notes.insert(note);
        await outbox.add({
          topic: "t",
          key: note.id,
          envelope: {
            id: newId(),
            type: "x",
            version: 1,
            source: "svc",
            occurredAt: new Date().toISOString(),
            subject: note.id,
            schoolId,
            correlationId: null,
            causationId: null,
            data: {},
          },
        });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await sql`select 1 from notes`).toHaveLength(0);
    expect(await sql`select 1 from event_outbox`).toHaveLength(0);
  });

  test("optimistic concurrency rejects stale writers", async () => {
    const note = await service.create(context, schoolId, { title: "v1", body: "" });
    await service.update(context, schoolId, note.id, { title: "v2", version: 1 });
    await expect(
      service.update(context, schoolId, note.id, { title: "v3", version: 1 }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  test("keyset pagination and creator filter", async () => {
    const otherAuthor = { ...context, actor: { ...context.actor, userId: newId() } };
    for (const title of ["a", "b", "c"]) await service.create(context, schoolId, { title, body: "" });
    await service.create(otherAuthor, schoolId, { title: "z", body: "" });

    const first = await service.list(schoolId, { limit: 2, createdBy: context.actor.userId });
    expect(first.items.map((n) => n.title)).toEqual(["c", "b"]);
    const second = await service.list(schoolId, {
      limit: 2,
      createdBy: context.actor.userId,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items.map((n) => n.title)).toEqual(["a"]);
    expect(second.hasMore).toBe(false);
  });

  test("duplicate ids surface as a unique violation", async () => {
    const repository = new PostgresNoteRepository(sql);
    const note = Note.create(
      { id: newId(), schoolId, title: "dup", body: "", createdBy: newId() },
      new Date(),
    );
    await repository.insert(note);
    const error = await repository.insert(note).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(isUniqueViolation(error)).toBe(true);
  });
});
