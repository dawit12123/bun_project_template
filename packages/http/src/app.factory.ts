import type { Logger, MetricsRecorder, RateLimiter, ReadinessCheck } from "@driversim/core";
import type { SessionRevocationStore, TokenVerifier } from "@driversim/core";
import { API_PREFIX, SYSTEM_ROUTES } from "./constants/app.constants";
import { authenticate } from "./guards/authenticate.guard";
import { resolveClientIp } from "./helpers/client-ip.helper";
import { accessLog } from "./middleware/access-log.middleware";
import { requestBodyLimit } from "./middleware/body-limit.middleware";
import { type CorsOptions, corsPolicy } from "./middleware/cors.middleware";
import { errorHandler } from "./middleware/error-handler.middleware";
import { httpMetrics } from "./middleware/http-metrics.middleware";
import { notFoundHandler } from "./middleware/not-found.middleware";
import { rateLimit } from "./middleware/rate-limit.middleware";
import { requestContext } from "./middleware/request-context.middleware";
import { securityHeaders } from "./middleware/security-headers.middleware";
import { type ServiceIdentity, registerOpenApi } from "./openapi";
import { type AppRouter, createRouter } from "./router.factory";
import { HealthController } from "./system/health.controller";
import { createHealthRouter } from "./system/health.routes";

export interface HttpAppOptions {
  service: ServiceIdentity;
  logger: Logger;
  /** Omit to disable request metrics and the /metrics endpoint. */
  metrics?: MetricsRecorder;
  trustProxy: boolean;
  cors: CorsOptions;
  bodyLimitBytes: number;
  apiDocsEnabled: boolean;
  /** Per-client-IP limiter for everything under the API prefix; omit to disable. */
  apiRateLimiter?: RateLimiter;
  readiness: {
    checks: readonly ReadinessCheck[];
    isShuttingDown: () => boolean;
    startedAt: number;
  };
  /** Every route under the API prefix requires a verified access token. */
  auth: {
    verifier: TokenVerifier;
    revocations?: SessionRevocationStore;
    /** Exact API paths that do not require a token (login, registration, …). */
    publicPaths?: readonly string[];
  };
}

/**
 * Builds the standard DriverSim HTTP application. Services only mount their domain routers:
 *
 *   const app = createHttpApp(options);
 *   app.route(API_PREFIX, createStudentRouter(controller));
 *
 * Middleware order: context → logging/metrics → security → limits → authentication → routes.
 */
export const createHttpApp = (options: HttpAppOptions): AppRouter => {
  const app = createRouter();

  app.onError(errorHandler(options.logger));
  app.notFound(notFoundHandler());

  app.use("*", requestContext(options.logger));
  app.use("*", accessLog());
  if (options.metrics) app.use("*", httpMetrics(options.metrics));
  app.use("*", securityHeaders());
  const cors = corsPolicy(options.cors);
  if (cors) app.use("*", cors);
  app.use("*", requestBodyLimit(options.bodyLimitBytes));

  if (options.apiRateLimiter) {
    app.use(
      `${API_PREFIX}/*`,
      rateLimit({
        name: "api",
        limiter: options.apiRateLimiter,
        key: (c) => resolveClientIp(c, options.trustProxy),
        onStoreFailure: "open",
        metrics: options.metrics,
      }),
    );
  }

  app.route("/", createHealthRouter(new HealthController({ app: options.service, ...options.readiness })));
  app.use(`${API_PREFIX}/*`, authenticate(options.auth));

  const metrics = options.metrics;
  if (metrics) {
    app.get(SYSTEM_ROUTES.METRICS, async (c) =>
      c.body(await metrics.render(), 200, { "content-type": metrics.contentType }),
    );
  }
  registerOpenApi(app, options.service, options.apiDocsEnabled);

  return app;
};
