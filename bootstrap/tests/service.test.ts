import { describe, expect, test } from "bun:test";
import { ConfigError, StartupError, type StartupReport, runStartupTasks } from "@driversim/core";
import { createHttpApp } from "@driversim/http";
import { createCaptureLogger, createTestAuth } from "@driversim/testing";
import { type Runtime, createRuntime } from "../src/runtime";
import {
  type BackgroundWorker,
  type ServiceContainer,
  type ServiceDefinition,
  describeFatalError,
  startService,
} from "../src/service";

describe("createRuntime", () => {
  test("builds one logger, metrics registry and clock carrying the service identity", () => {
    const logs = createCaptureLogger();
    const runtime = createRuntime({
      serviceName: "student-service",
      version: "1.2.3",
      environment: "test",
      log: { level: "info", sink: logs.sink },
      metrics: { collectDefaults: false },
    });
    runtime.logger.child({ component: "kafka" }).info("hello");
    expect(logs.records[0]).toMatchObject({
      service: "student-service",
      version: "1.2.3",
      env: "test",
      component: "kafka",
    });
    expect(Object.isFrozen(runtime)).toBe(true);
    expect(runtime.state.shuttingDown).toBe(false);
  });
});

const fakeContainer = (events: string[], startupFails: boolean): ServiceContainer => {
  const worker = (name: string): BackgroundWorker => ({
    name,
    start: () => {
      events.push(`start ${name}`);
    },
    stop: async () => {
      events.push(`stop ${name}`);
    },
  });
  return {
    adapters: { database: "memory" },
    workers: [worker("relay"), worker("consumer")],
    initialize: async (): Promise<StartupReport> => {
      events.push("initialize");
      return runStartupTasks(
        [
          {
            name: "postgres",
            critical: true,
            run: () => (startupFails ? Promise.reject(new Error("down")) : Promise.resolve()),
          },
        ],
        createCaptureLogger().logger,
      );
    },
    close: async () => {
      events.push("close");
    },
  };
};

const definitionWith = async (
  events: string[],
  startupFails = false,
): Promise<ServiceDefinition<{ port: number }, ServiceContainer>> => {
  const auth = await createTestAuth();
  return {
    loadConfig: () => ({ port: 0 }),
    runtimeOptions: () => ({
      serviceName: "probe-service",
      version: "0.0.1",
      environment: "test",
      log: { level: "silent" },
      metrics: { collectDefaults: false },
    }),
    createContainer: () => {
      events.push("createContainer");
      return fakeContainer(events, startupFails);
    },
    createApp: (_container: ServiceContainer, runtime: Runtime) => {
      events.push("createApp");
      return createHttpApp({
        service: { serviceName: runtime.serviceName, version: runtime.version },
        logger: runtime.logger,
        metrics: runtime.metrics,
        trustProxy: false,
        cors: { origins: [], credentials: false },
        bodyLimitBytes: 1_024,
        apiDocsEnabled: true,
        readiness: {
          checks: [],
          isShuttingDown: () => runtime.state.shuttingDown,
          startedAt: runtime.state.startedAt,
        },
        auth: { verifier: auth.verifier },
      });
    },
    http: (config) => ({
      host: "127.0.0.1",
      port: config.port,
      apiDocsEnabled: true,
      shutdownTimeoutMs: 5_000,
    }),
  };
};

describe("startService", () => {
  test("initializes once, in order, serves traffic, and shuts down in reverse", async () => {
    const events: string[] = [];
    const exits: number[] = [];
    const running = await startService(await definitionWith(events), {
      handleSignals: false,
      exit: (code) => {
        exits.push(code);
      },
    });
    expect(events).toEqual(["createContainer", "initialize", "createApp", "start relay", "start consumer"]);

    const live = await fetch(new URL("/health/live", running.server.server.url));
    expect(live.status).toBe(200);
    expect(((await live.json()) as { service: string }).service).toBe("probe-service");

    await running.shutdown("test");
    expect(running.runtime.state.shuttingDown).toBe(true);
    expect(events.slice(5)).toEqual(["stop consumer", "stop relay", "close"]);
    expect(exits).toEqual([0]);
  });

  test("a critical startup failure closes resources and never opens the port", async () => {
    const events: string[] = [];
    const failure = await startService(await definitionWith(events, true), { handleSignals: false }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(StartupError);
    expect(events).toEqual(["createContainer", "initialize", "close"]);
  });
});

describe("describeFatalError", () => {
  test("explains config and dependency failures", () => {
    expect(describeFatalError(new ConfigError(["PORT: must be a number"]))).toEqual({
      msg: "invalid configuration",
      issues: ["PORT: must be a number"],
    });
    expect(describeFatalError(new Error("boom"))).toEqual({ msg: "startup failed", error: "boom" });
  });
});
