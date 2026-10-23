import { beforeAll, describe, expect, test } from "bun:test";
import { HEADERS } from "@driversim/core";
import { request } from "@driversim/testing";
import { type TestContext, createTestContext } from "./helpers/test-app";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});

describe("system endpoints", () => {
  test("liveness reports service identity", async () => {
    const res = await request(ctx.app, "GET", "/health/live");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", service: "platform-test" });
  });

  test("readiness passes with in-memory adapters and fails while draining", async () => {
    expect((await request(ctx.app, "GET", "/health/ready")).status).toBe(200);
    ctx.state.shuttingDown = true;
    const draining = await request(ctx.app, "GET", "/health/ready");
    ctx.state.shuttingDown = false;
    expect(draining.status).toBe(503);
    expect(draining.body.status).toBe("not_ready");
  });

  test("readiness fails when a critical dependency is down", async () => {
    const failing = await createTestContext();
    failing.checks.push({
      name: "postgres",
      check: () => Promise.reject(new Error("down")),
    });
    const res = await request(failing.app, "GET", "/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.checks.postgres).toMatchObject({ status: "down", critical: true });
  });

  test("echoes a well-formed request id and replaces a malformed one", async () => {
    const kept = await request(ctx.app, "GET", "/health/live", {
      headers: { [HEADERS.REQUEST_ID]: "req-abc-12345" },
    });
    expect(kept.headers.get(HEADERS.REQUEST_ID)).toBe("req-abc-12345");
    const replaced = await request(ctx.app, "GET", "/health/live", {
      headers: { [HEADERS.REQUEST_ID]: "<script>" },
    });
    expect(replaced.headers.get(HEADERS.REQUEST_ID)).not.toBe("<script>");
  });

  test("unknown routes use the standard error envelope", async () => {
    const res = await request(ctx.app, "GET", "/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "Route not found." },
      meta: { requestId: expect.any(String) },
    });
  });

  test("security headers are set", async () => {
    const res = await request(ctx.app, "GET", "/health/live");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  test("metrics expose HTTP counters labelled by route template", async () => {
    await request(ctx.app, "GET", "/health/live");
    const res = await request(ctx.app, "GET", "/metrics");
    expect(res.status).toBe(200);
    expect(String(res.body)).toContain('http_requests_total{method="GET",route="/health/live",status="200"');
  });

  test("OpenAPI document is published", async () => {
    const res = await request(ctx.app, "GET", "/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.paths["/health/ready"]).toBeDefined();
    expect(res.body.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
  });
});

describe("one-time initialization", () => {
  test("the OpenAPI document is generated once and then served from cache", async () => {
    const fresh = await createTestContext();
    const original = fresh.app.getOpenAPIDocument.bind(fresh.app);
    let generations = 0;
    fresh.app.getOpenAPIDocument = ((config: Parameters<typeof original>[0]) => {
      generations += 1;
      return original(config);
    }) as typeof fresh.app.getOpenAPIDocument;

    for (let index = 0; index < 5; index += 1) {
      expect((await request(fresh.app, "GET", "/openapi.json")).status).toBe(200);
    }
    expect(generations).toBe(1);
  });
});
