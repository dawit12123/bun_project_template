import { beforeAll, describe, expect, test } from "bun:test";
import { AUTH_EVENT_TYPES, AUTH_TOPIC } from "@driversim/auth";
import { newId } from "@driversim/core";
import { request } from "@driversim/testing";
import { type TestContext, createTestContext } from "@tests/helpers/test-container";

/** Service wiring: platform stack + consumers. Domain-independent (survives --remove-example). */
const PROBE_URL = "/api/v1/__wiring-probe";
let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});

describe("service wiring", () => {
  test("health reports this service", async () => {
    const res = await request(ctx.app, "GET", "/health/live");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("service-template");
  });

  test("everything under the API prefix requires authentication", async () => {
    expect((await request(ctx.app, "GET", PROBE_URL)).status).toBe(401);
  });

  test("auth.session.revoked events reach the session denylist", async () => {
    const sessionId = newId();
    const token = await ctx.auth.issue({ sid: sessionId });
    const url = PROBE_URL;
    expect((await request(ctx.app, "GET", url, { token })).status).toBe(404);

    await ctx.bus.publish([
      {
        topic: AUTH_TOPIC,
        key: newId(),
        envelope: {
          id: newId(),
          type: AUTH_EVENT_TYPES.SESSION_REVOKED,
          version: 1,
          source: "auth-service",
          occurredAt: new Date().toISOString(),
          subject: newId(),
          schoolId: null,
          correlationId: null,
          causationId: null,
          data: { userId: newId(), sessionIds: [sessionId], reason: "logout" },
        },
      },
    ]);
    expect((await request(ctx.app, "GET", url, { token })).status).toBe(401);
  });

  test("OpenAPI is published with the platform routes", async () => {
    const res = await request(ctx.app, "GET", "/openapi.json");
    expect(Object.keys(res.body.paths)).toContain("/health/ready");
  });
});
