import { type App, createApp } from "@/bootstrap/app";
import { type Container, type ContainerOverrides, createContainer } from "@/bootstrap/container";
import { loadConfig } from "@/config";
import { ManualClock } from "@driversim/core";
import { MemoryEventBus } from "@driversim/messaging";
import { type TestAuth, createCaptureLogger, createTestAuth } from "@driversim/testing";

export interface TestContext {
  app: App;
  container: Container;
  auth: TestAuth;
  bus: MemoryEventBus;
  clock: ManualClock;
  logs: ReturnType<typeof createCaptureLogger>;
  state: { shuttingDown: boolean; startedAt: number };
}

/**
 * Full application on in-memory adapters (no Postgres/Redis/Kafka needed) with a real JWT
 * verifier backed by a throwaway key pair.
 */
export const createTestContext = async (
  env: Record<string, string> = {},
  overrides: ContainerOverrides = {},
): Promise<TestContext> => {
  const auth = await createTestAuth();
  const bus = new MemoryEventBus();
  const clock = new ManualClock(new Date());
  const logs = createCaptureLogger();
  const config = loadConfig({
    NODE_ENV: "test",
    SERVICE_NAME: "service-template",
    AUTH_JWKS_JSON: auth.jwksJson,
    METRICS_DEFAULT_COLLECTORS: "false",
    ...env,
  });
  const container = createContainer(config, logs.logger, {
    publisher: bus,
    clock,
    tokenVerifier: auth.verifier,
    ...overrides,
  });
  const state = { shuttingDown: false, startedAt: Date.now() };
  const app = createApp(container, state);
  return { app, container, auth, bus, clock, logs, state };
};
