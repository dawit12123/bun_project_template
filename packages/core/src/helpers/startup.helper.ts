import type { StartupReport, StartupTask } from "../ports/startup.port";
import type { Logger } from "../types/logger.interface";

const DEFAULT_TIMEOUT_MS = 10_000;

const withTimeout = (promise: Promise<void>, timeoutMs: number, name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

export class StartupError extends Error {
  readonly report: StartupReport;

  constructor(report: StartupReport) {
    const failed = report.tasks.filter((task) => task.critical && task.status === "failed");
    super(`Startup failed: ${failed.map((task) => `${task.name} (${task.error})`).join(", ")}`);
    this.name = "StartupError";
    this.report = report;
  }
}

/**
 * Runs startup tasks concurrently. Resolves with a report, or rejects with a StartupError when
 * any critical task failed. Non-critical failures are logged as warnings.
 */
export const runStartupTasks = async (
  tasks: readonly StartupTask[],
  logger: Logger,
): Promise<StartupReport> => {
  const startedAt = performance.now();
  const results = await Promise.all(
    tasks.map(async (task) => {
      const taskStart = performance.now();
      try {
        await withTimeout(task.run(), task.timeoutMs ?? DEFAULT_TIMEOUT_MS, task.name);
        return {
          name: task.name,
          critical: task.critical,
          status: "ok" as const,
          durationMs: elapsed(taskStart),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        (task.critical ? logger.error : logger.warn)("startup task failed", {
          task: task.name,
          critical: task.critical,
          err: error,
        });
        return {
          name: task.name,
          critical: task.critical,
          status: "failed" as const,
          durationMs: elapsed(taskStart),
          error: message,
        };
      }
    }),
  );
  const report: StartupReport = { durationMs: elapsed(startedAt), tasks: results };
  if (results.some((task) => task.critical && task.status === "failed")) throw new StartupError(report);
  return report;
};

const elapsed = (from: number) => Math.round((performance.now() - from) * 100) / 100;
