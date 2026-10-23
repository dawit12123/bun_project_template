import { describe, expect, test } from "bun:test";
import { toRuntimeOptions } from "@/bootstrap/bootstrap";
import { createContainer } from "@/bootstrap/container";
import { type Config, loadConfig } from "@/config";
import { createRuntime } from "@driversim/bootstrap";
import { StartupError } from "@driversim/core";

const JWKS = JSON.stringify({ keys: [] });

const runtimeFor = (config: Config) =>
  createRuntime({ ...toRuntimeOptions(config), log: { level: "silent" } });

const build = (env: Record<string, string>) => {
  const config = loadConfig({ AUTH_JWKS_JSON: JWKS, METRICS_DEFAULT_COLLECTORS: "false", ...env });
  const runtime = runtimeFor(config);
  return { runtime, container: createContainer(config, runtime) };
};

describe("container initialization", () => {
  test("in-memory mode has nothing to connect and initialize() is idempotent", async () => {
    const { container } = build({});
    const first = container.initialize();
    expect(container.initialize()).toBe(first);
    const report = await first;
    expect(report.tasks.map((task) => task.name)).toEqual(["auth-jwks"]);
    await container.close();
  });

  test("every configured dependency gets exactly one startup task", () => {
    const { container } = build({
      DATABASE_URL: "postgres://u:p@127.0.0.1:1/driversim",
      REDIS_URL: "redis://127.0.0.1:1",
      KAFKA_BROKERS: "127.0.0.1:1",
    });
    expect(container.startupTasks.map((task) => [task.name, task.critical])).toEqual([
      ["postgres", true],
      ["redis", true],
      ["auth-jwks", false],
      ["kafka", false],
    ]);
  });

  test("an unreachable critical dependency aborts startup before the server opens", async () => {
    const { container } = build({
      DATABASE_URL: "postgres://u:p@127.0.0.1:1/driversim",
      DATABASE_CONNECT_TIMEOUT_S: "2",
    });
    const failure = await container.initialize().then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(StartupError);
    expect((failure as StartupError).report.tasks.find((t) => t.name === "postgres")?.status).toBe("failed");
    await container.close();
  });

  test("uses the shared runtime (logger, metrics, clock) instead of creating its own", () => {
    const { runtime, container } = build({});
    expect(container.runtime).toBe(runtime);
    expect(container.workers.map((worker) => worker.name)).toEqual(["outbox-relay"]);
  });
});
