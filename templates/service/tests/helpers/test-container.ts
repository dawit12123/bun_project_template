import { type App, createApp } from "@/bootstrap/app";
import { toRuntimeOptions } from "@/bootstrap/bootstrap";
import { type Container, type ContainerOverrides, createContainer } from "@/bootstrap/container";
import { loadConfig } from "@/config";
import { type Runtime, type RuntimeState, createRuntime } from "@driversim/bootstrap";
import { ManualClock } from "@driversim/core";
import { MemoryEventBus } from "@driversim/messaging";
import { type TestAuth, createCaptureLogger, createTestAuth } from "@driversim/testing";

export interface TestContext {
  app: App;
  container: Container;
  runtime: Runtime;
  auth: TestAuth;
  bus: MemoryEventBus;
  clock: ManualClock;
  logs: ReturnType<typeof createCaptureLogger>;
  state: RuntimeState;
}

/**
 * Full application on in-memory adapters (no Postgres/Redis/Kafka needed) with a real JWT
 * verifier backed by a throwaway key pair. Built exactly like production: one runtime, one
 * container, one app.
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
  const runtime = createRuntime({
    ...toRuntimeOptions(config),
    log: { level: "debug", sink: logs.sink },
    clock,
  });
  const container = createContainer(config, runtime, {
    publisher: bus,
    tokenVerifier: auth.verifier,
    ...overrides,
  });
  const app = createApp(container, runtime);
  return { app, container, runtime, auth, bus, clock, logs, state: runtime.state };
};
