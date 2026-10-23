import { beforeAll, describe, expect, test } from "bun:test";
import { newId } from "@driversim/core";
import { OTHER_SCHOOL_ID, TEST_SCHOOL_ID } from "@driversim/testing";
import { request } from "@driversim/testing";
import { PROBE_PERMISSIONS } from "./helpers/probe-router";
import { type TestContext, createTestContext } from "./helpers/test-app";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});

const probeOf = (schoolId: string) => `/api/v1/schools/${schoolId}/probe`;
const reader = () => ctx.auth.issue({ perms: [PROBE_PERMISSIONS.READ] });

describe("authentication", () => {
  test("missing token → 401 with WWW-Authenticate", async () => {
    const res = await request(ctx.app, "GET", probeOf(TEST_SCHOOL_ID));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe("Bearer");
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  test("garbage, expired or non-bearer credentials → 401", async () => {
    expect((await request(ctx.app, "GET", probeOf(TEST_SCHOOL_ID), { token: "abc.def.ghi" })).status).toBe(
      401,
    );
    const expired = await ctx.auth.issue({}, { expiresInSeconds: -60 });
    expect((await request(ctx.app, "GET", probeOf(TEST_SCHOOL_ID), { token: expired })).status).toBe(401);
    const basic = await request(ctx.app, "GET", probeOf(TEST_SCHOOL_ID), {
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(basic.status).toBe(401);
  });

  test("identity headers sent by the client are never trusted", async () => {
    const res = await request(ctx.app, "GET", probeOf(TEST_SCHOOL_ID), {
      headers: {
        "x-user-id": newId(),
        "x-school-id": TEST_SCHOOL_ID,
        "x-permissions": PROBE_PERMISSIONS.READ,
      },
    });
    expect(res.status).toBe(401);
  });

  test("a valid token reaches the handler with its identity", async () => {
    const userId = newId();
    const res = await request(ctx.app, "GET", probeOf(TEST_SCHOOL_ID), {
      token: await ctx.auth.issue({ sub: userId, perms: [PROBE_PERMISSIONS.READ] }),
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ userId, schoolId: TEST_SCHOOL_ID });
  });
});

describe("authorization", () => {
  test("cross-school access by changing the URL → 403", async () => {
    const res = await request(ctx.app, "GET", probeOf(OTHER_SCHOOL_ID), { token: await reader() });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  test("missing permission → 403", async () => {
    expect(
      (await request(ctx.app, "GET", probeOf(TEST_SCHOOL_ID), { token: await ctx.auth.issue() })).status,
    ).toBe(403);
  });

  test("forged role names grant nothing without permissions", async () => {
    const token = await ctx.auth.issue({
      typ: "student",
      roles: ["platform_admin", "super_admin"],
      perms: [],
    });
    expect((await request(ctx.app, "GET", probeOf(TEST_SCHOOL_ID), { token })).status).toBe(403);
  });

  test("identities without a school cannot use school-scoped routes", async () => {
    const token = await ctx.auth.issue({ typ: "rta_official", sch: null, perms: [PROBE_PERMISSIONS.READ] });
    expect((await request(ctx.app, "GET", probeOf(TEST_SCHOOL_ID), { token })).status).toBe(403);
  });

  test("the explicit cross-school permission allows platform operators in", async () => {
    const token = await ctx.auth.issue({
      typ: "platform_admin",
      sch: null,
      perms: [PROBE_PERMISSIONS.READ, PROBE_PERMISSIONS.ANY_SCHOOL],
    });
    expect((await request(ctx.app, "GET", probeOf(OTHER_SCHOOL_ID), { token })).status).toBe(200);
  });
});

describe("session revocation", () => {
  test("revoked sessions are rejected even with a still-valid token", async () => {
    const sessionId = newId();
    const token = await ctx.auth.issue({ sid: sessionId, perms: [PROBE_PERMISSIONS.READ] });
    expect((await request(ctx.app, "GET", probeOf(TEST_SCHOOL_ID), { token })).status).toBe(200);

    await ctx.revocations.revoke(sessionId);

    const res = await request(ctx.app, "GET", probeOf(TEST_SCHOOL_ID), { token });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Session has been revoked.");
  });
});
