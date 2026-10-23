import { beforeAll, describe, expect, test } from "bun:test";
import { NOTE_EVENT_TYPES, NOTE_PERMISSIONS } from "@/constants/note.constants";
import { TEST_SCHOOL_ID } from "@driversim/testing";
import { request } from "@driversim/testing";
import { type TestContext, createTestContext } from "@tests/helpers/test-container";

/** EXAMPLE DOMAIN end-to-end tests (removed with --remove-example). */
let ctx: TestContext;
let token: string;
const base = `/api/v1/schools/${TEST_SCHOOL_ID}/notes`;

beforeAll(async () => {
  ctx = await createTestContext();
  token = await ctx.auth.issue({
    perms: [NOTE_PERMISSIONS.READ, NOTE_PERMISSIONS.WRITE, NOTE_PERMISSIONS.DELETE],
  });
});

describe("notes API", () => {
  test("full lifecycle: create → get → update → delete, with events relayed", async () => {
    const createdRes = await request(ctx.app, "POST", base, {
      token,
      body: { title: "Signs", body: "Week 1" },
    });
    expect(createdRes.status).toBe(201);
    expect(createdRes.body).toMatchObject({
      success: true,
      data: { title: "Signs", body: "Week 1", version: 1, schoolId: TEST_SCHOOL_ID },
      meta: { requestId: expect.any(String) },
    });
    const id = createdRes.body.data.id as string;

    expect((await request(ctx.app, "GET", `${base}/${id}`, { token })).body.data.title).toBe("Signs");

    const updated = await request(ctx.app, "PATCH", `${base}/${id}`, {
      token,
      body: { title: "Signs v2", version: 1 },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.version).toBe(2);

    expect((await request(ctx.app, "DELETE", `${base}/${id}?version=2`, { token })).status).toBe(204);
    expect((await request(ctx.app, "GET", `${base}/${id}`, { token })).status).toBe(404);

    await ctx.container.outboxRelay.tick();
    expect(ctx.bus.published.map((m) => m.envelope.type)).toEqual([
      NOTE_EVENT_TYPES.CREATED,
      NOTE_EVENT_TYPES.UPDATED,
      NOTE_EVENT_TYPES.DELETED,
    ]);
  });

  test("validation failures return 422 with field details", async () => {
    const res = await request(ctx.app, "POST", base, { token, body: { title: "" } });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path: "body.title" }));
  });

  test("an update without changes is rejected", async () => {
    const created = await request(ctx.app, "POST", base, { token, body: { title: "noop" } });
    const res = await request(ctx.app, "PATCH", `${base}/${created.body.data.id}`, {
      token,
      body: { version: 1 },
    });
    expect(res.status).toBe(422);
  });

  test("stale version → 409", async () => {
    const created = await request(ctx.app, "POST", base, { token, body: { title: "race" } });
    const id = created.body.data.id;
    await request(ctx.app, "PATCH", `${base}/${id}`, { token, body: { body: "first", version: 1 } });
    const res = await request(ctx.app, "PATCH", `${base}/${id}`, {
      token,
      body: { body: "second", version: 1 },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  test("list returns the paginated envelope", async () => {
    for (const title of ["page-a", "page-b"])
      await request(ctx.app, "POST", base, { token, body: { title } });
    const res = await request(ctx.app, "GET", `${base}?limit=1`, { token });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.pagination).toMatchObject({ limit: 1, hasMore: true });
    const next = await request(
      ctx.app,
      "GET",
      `${base}?limit=1&cursor=${res.body.meta.pagination.nextCursor}`,
      {
        token,
      },
    );
    expect(next.body.data[0].id).not.toBe(res.body.data[0].id);
  });

  test("tampered cursors are rejected", async () => {
    const res = await request(ctx.app, "GET", `${base}?cursor=garbage`, { token });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe("query.cursor");
  });

  test("read-only callers cannot write", async () => {
    const readOnly = await ctx.auth.issue({ perms: [NOTE_PERMISSIONS.READ] });
    expect((await request(ctx.app, "POST", base, { token: readOnly, body: { title: "x" } })).status).toBe(
      403,
    );
    expect((await request(ctx.app, "GET", base, { token: readOnly })).status).toBe(200);
  });
});
