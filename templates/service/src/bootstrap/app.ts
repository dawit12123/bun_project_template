import { registerRoutes } from "@/routes";
import type { Runtime } from "@driversim/bootstrap";
import { createHttpApp } from "@driversim/http";
import { FixedWindowRateLimiter } from "@driversim/redis";
import type { Container } from "./container";

/**
 * Builds the HTTP application: the platform stack from @driversim/http (middleware, health,
 * metrics, docs, authentication) plus this service's domain routers. Opens no ports, so tests
 * call `app.request()` directly.
 */
export const createApp = (container: Container, runtime: Runtime = container.runtime) => {
  const { config } = container;

  const app = createHttpApp({
    service: { serviceName: config.app.serviceName, version: config.app.version },
    logger: runtime.logger,
    metrics: config.metrics.enabled ? runtime.metrics : undefined,
    trustProxy: config.http.trustProxy,
    cors: config.http.cors,
    bodyLimitBytes: config.http.bodyLimitBytes,
    apiDocsEnabled: config.http.apiDocsEnabled,
    apiRateLimiter: config.http.rateLimit.enabled
      ? new FixedWindowRateLimiter(container.keyValue, {
          name: "api",
          limit: config.http.rateLimit.perMinute,
          windowSeconds: 60,
        })
      : undefined,
    readiness: {
      checks: container.readinessChecks,
      isShuttingDown: () => runtime.state.shuttingDown,
      startedAt: runtime.state.startedAt,
    },
    auth: { verifier: container.tokenVerifier, revocations: container.revocations },
  });

  registerRoutes(app, container.services);
  return app;
};

export type App = ReturnType<typeof createApp>;
