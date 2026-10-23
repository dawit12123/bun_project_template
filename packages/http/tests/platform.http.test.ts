import { beforeAll, describe, expect, test } from "bun:test";
import { request } from "@driversim/testing";
import { type TestContext, createTestContext } from "./helpers/test-app";

let ctx: TestContext;
let token: string;
beforeAll(async () => {
  ctx = await createTestContext();
  token = await ctx.auth.issue();
});

describe("request validation", () => {
  test("invalid bodies → 422 with field-level details", async () => {
    const res = await request(ctx.app, "POST", "/api/v1/probe/echo", { token, body: { text: "" } });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "VALIDATION_FAILED", details: [expect.objectContaining({ path: "body.text" })] },
    });
  });

  test("invalid path parameters → 422", async () => {
    const res = await request(ctx.app, "GET", "/api/v1/schools/not-a-uuid/probe", {
      token: await ctx.auth.issue({ perms: ["probe:read", "probe:any-school"] }),
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe("params.schoolId");
  });

  test("malformed JSON → 400, not 500", async () => {
    const res = await request(ctx.app, "POST", "/api/v1/probe/echo", {
      token,
      rawBody: "{not json",
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });
});

describe("limits", () => {
  test("oversized bodies → 413", async () => {
    const small = await createTestContext({ bodyLimitBytes: 1024 });
    const res = await request(small.app, "POST", "/api/v1/probe/echo", {
      token: await small.auth.issue(),
      body: { text: "x".repeat(5_000) },
    });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  test("rate limiting → 429 with Retry-After and RateLimit headers", async () => {
    const limited = await createTestContext({ rateLimitPerMinute: 2 });
    const limitedToken = await limited.auth.issue();
    const call = () =>
      request(limited.app, "POST", "/api/v1/probe/echo", { token: limitedToken, body: { text: "hi" } });
    expect((await call()).headers.get("ratelimit-remaining")).toBe("1");
    expect((await call()).status).toBe(200);
    const res = await call();
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  test("health endpoints are never rate limited", async () => {
    const limited = await createTestContext({ rateLimitPerMinute: 1 });
    for (let index = 0; index < 3; index += 1) {
      expect((await request(limited.app, "GET", "/health/live")).status).toBe(200);
    }
  });
});

describe("error handling", () => {
  test("unexpected errors → 500 without leaking internals, and are logged", async () => {
    const res = await request(ctx.app, "GET", "/api/v1/probe/fail", { token });
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: "INTERNAL", message: "An unexpected error occurred." });
    expect(JSON.stringify(res.body)).not.toContain("postgres://");
    expect(
      ctx.logs.records.some(
        (r: { level: string; msg: string }) => r.level === "error" && r.msg === "request failed",
      ),
    ).toBe(true);
  });

  test("every error carries the request id in body and header", async () => {
    const res = await request(ctx.app, "GET", "/api/v1/probe/fail", {
      token,
      headers: { "x-request-id": "trace-0000-1111" },
    });
    expect(res.body.meta.requestId).toBe("trace-0000-1111");
    expect(res.headers.get("x-request-id")).toBe("trace-0000-1111");
  });
});
