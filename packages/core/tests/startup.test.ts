import { describe, expect, test } from "bun:test";
import { StartupError, runStartupTasks } from "../src/helpers/startup.helper";
import type { Logger } from "../src/types/logger.interface";

const logs: Array<{ level: string; msg: string }> = [];
const logger: Logger = {
  trace: () => {},
  debug: () => {},
  info: (msg) => logs.push({ level: "info", msg }),
  warn: (msg) => logs.push({ level: "warn", msg }),
  error: (msg) => logs.push({ level: "error", msg }),
  fatal: () => {},
  child: () => logger,
  isLevelEnabled: () => true,
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("runStartupTasks", () => {
  test("runs every task once, concurrently, and reports durations", async () => {
    const calls: string[] = [];
    const startedAt = performance.now();
    const report = await runStartupTasks(
      ["a", "b", "c"].map((name) => ({
        name,
        critical: true,
        run: async () => {
          calls.push(name);
          await sleep(50);
        },
      })),
      logger,
    );
    expect(calls.sort()).toEqual(["a", "b", "c"]);
    expect(performance.now() - startedAt).toBeLessThan(140);
    expect(report.tasks.every((task) => task.status === "ok")).toBe(true);
  });

  test("a non-critical failure is reported but does not abort startup", async () => {
    const report = await runStartupTasks(
      [
        { name: "postgres", critical: true, run: async () => {} },
        { name: "kafka", critical: false, run: () => Promise.reject(new Error("broker down")) },
      ],
      logger,
    );
    expect(report.tasks.find((task) => task.name === "kafka")).toMatchObject({
      status: "failed",
      error: "broker down",
    });
    expect(logs.some((log) => log.level === "warn")).toBe(true);
  });

  test("a critical failure aborts startup with the full report", async () => {
    const failure = await runStartupTasks(
      [
        { name: "postgres", critical: true, run: () => Promise.reject(new Error("ECONNREFUSED")) },
        { name: "redis", critical: true, run: async () => {} },
      ],
      logger,
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(StartupError);
    expect((failure as StartupError).message).toContain("postgres (ECONNREFUSED)");
    expect((failure as StartupError).report.tasks).toHaveLength(2);
  });

  test("a hanging task times out instead of blocking startup forever", async () => {
    const failure = await runStartupTasks(
      [{ name: "redis", critical: true, timeoutMs: 30, run: () => new Promise<void>(() => {}) }],
      logger,
    ).then(
      () => null,
      (error: unknown) => error as StartupError,
    );
    expect(failure?.report.tasks[0]?.error).toBe("redis timed out after 30ms");
  });
});
