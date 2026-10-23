import { describe, expect, test } from "bun:test";
import { AppError, type EventEnvelope, newId } from "@driversim/core";
import { createCaptureLogger } from "@driversim/testing";
import { AUTH_EVENT_TYPES } from "../src/constants/auth.constants";
import { createAuthEventHandlers } from "../src/consumers/auth.consumer";
import { KeyValueSessionRevocationStore } from "../src/session-revocation.store";

class FakeStore {
  readonly values = new Map<string, string>();
  async get(key: string) {
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.values.set(key, value);
  }
  async setIfAbsent() {
    return true;
  }
  async delete() {}
  async increment() {
    return { value: 1, ttlSeconds: 1 };
  }
  async ping() {}
  async close() {}
}

const envelope = (data: unknown): EventEnvelope => ({
  id: newId(),
  type: AUTH_EVENT_TYPES.SESSION_REVOKED,
  version: 1,
  source: "auth-service",
  occurredAt: new Date().toISOString(),
  subject: newId(),
  schoolId: null,
  correlationId: null,
  causationId: null,
  data,
});

describe("auth event handlers", () => {
  test("session.revoked marks every listed session as revoked", async () => {
    const revocations = new KeyValueSessionRevocationStore(new FakeStore());
    const handlers = createAuthEventHandlers({ revocations, logger: createCaptureLogger().logger });
    const [a, b] = [newId(), newId()];
    await handlers[AUTH_EVENT_TYPES.SESSION_REVOKED]?.(envelope({ userId: newId(), sessionIds: [a, b] }));
    expect(await revocations.isRevoked(a)).toBe(true);
    expect(await revocations.isRevoked(b)).toBe(true);
    expect(await revocations.isRevoked(newId())).toBe(false);
  });

  test("malformed payloads are rejected", async () => {
    const revocations = new KeyValueSessionRevocationStore(new FakeStore());
    const handlers = createAuthEventHandlers({ revocations, logger: createCaptureLogger().logger });
    await expect(
      handlers[AUTH_EVENT_TYPES.SESSION_REVOKED]?.(envelope({ sessionIds: [] })) ?? Promise.resolve(),
    ).rejects.toBeInstanceOf(AppError);
  });
});
