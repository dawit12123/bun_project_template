import { KeyValueSessionRevocationStore } from "@driversim/auth";
import type { ReadinessCheck } from "@driversim/core";
import { PrometheusMetrics } from "@driversim/observability";
import { FixedWindowRateLimiter, MemoryKeyValueStore } from "@driversim/redis";
import { type TestAuth, createCaptureLogger, createTestAuth } from "@driversim/testing";
import { type AppRouter, createHttpApp } from "../../src";
import { mountProbeRouter } from "./probe-router";

export interface TestHttpOptions {
  bodyLimitBytes?: number;
  rateLimitPerMinute?: number;
}

export interface TestContext {
  app: AppRouter;
  auth: TestAuth;
  logs: ReturnType<typeof createCaptureLogger>;
  state: { shuttingDown: boolean };
  checks: ReadinessCheck[];
  revocations: KeyValueSessionRevocationStore;
}

/** The platform HTTP app (no business domain) plus probe routes exercising guards and limits. */
export const createTestContext = async (options: TestHttpOptions = {}): Promise<TestContext> => {
  const auth = await createTestAuth();
  const logs = createCaptureLogger();
  const store = new MemoryKeyValueStore();
  const revocations = new KeyValueSessionRevocationStore(store);
  const state = { shuttingDown: false };
  const checks: ReadinessCheck[] = [];

  const app = createHttpApp({
    service: { serviceName: "platform-test", version: "0.0.0" },
    logger: logs.logger,
    metrics: new PrometheusMetrics({ serviceName: "platform-test", collectDefaults: false }),
    trustProxy: false,
    cors: { origins: [], credentials: false },
    bodyLimitBytes: options.bodyLimitBytes ?? 1_048_576,
    apiDocsEnabled: true,
    apiRateLimiter: new FixedWindowRateLimiter(store, {
      name: "api",
      limit: options.rateLimitPerMinute ?? 300,
      windowSeconds: 60,
    }),
    readiness: { checks, isShuttingDown: () => state.shuttingDown, startedAt: Date.now() },
    auth: { verifier: auth.verifier, revocations },
  });
  mountProbeRouter(app);
  return { app, auth, logs, state, checks, revocations };
};
