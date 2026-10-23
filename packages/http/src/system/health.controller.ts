import type { ReadinessCheck, ReadinessReport } from "@driversim/core";
import type { RouteHandler } from "@hono/zod-openapi";
import type { ServiceIdentity } from "../openapi";
import type { AppEnv } from "../types/http.interface";
import type { healthRoutes } from "./health.routes";

type Routes = typeof healthRoutes;

const DEFAULT_CHECK_TIMEOUT_MS = 2_000;

const withTimeout = (promise: Promise<void>, timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
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

export interface HealthControllerDependencies {
  app: ServiceIdentity;
  checks: readonly ReadinessCheck[];
  /** True once shutdown started: readiness fails so the load balancer drains this instance. */
  isShuttingDown: () => boolean;
  startedAt: number;
}

export class HealthController {
  constructor(private readonly deps: HealthControllerDependencies) {}

  /** Liveness: the process is up. Never touches dependencies (avoids restart storms). */
  live: RouteHandler<Routes["live"], AppEnv> = (c) =>
    c.json(
      {
        status: "ok" as const,
        service: this.deps.app.serviceName,
        version: this.deps.app.version,
        uptimeSeconds: Math.round((Date.now() - this.deps.startedAt) / 1_000),
      },
      200,
    );

  /** Readiness: every critical dependency answers within its timeout. */
  ready: RouteHandler<Routes["ready"], AppEnv> = async (c) => {
    const report = await this.#evaluate();
    return report.status === "ready" ? c.json(report, 200) : c.json(report, 503);
  };

  async #evaluate(): Promise<ReadinessReport> {
    const entries = await Promise.all(
      this.deps.checks.map(async (check) => {
        const critical = check.critical ?? true;
        const startedAt = performance.now();
        try {
          await withTimeout(check.check(), check.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS);
          return [check.name, { status: "up" as const, critical, durationMs: elapsed(startedAt) }] as const;
        } catch {
          return [check.name, { status: "down" as const, critical, durationMs: elapsed(startedAt) }] as const;
        }
      }),
    );
    const checks = Object.fromEntries(entries);
    const healthy =
      !this.deps.isShuttingDown() &&
      entries.every(([, result]) => !result.critical || result.status === "up");
    return { status: healthy ? "ready" : "not_ready", checks };
  }
}

const elapsed = (startedAt: number) => Math.round((performance.now() - startedAt) * 100) / 100;
