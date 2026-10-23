import type { MetricsRecorder } from "@driversim/core";
import type { MiddlewareHandler } from "hono";
import { SYSTEM_ROUTES } from "../constants/app.constants";
import type { AppEnv } from "../types/http.interface";
import { routeLabel } from "./route-label";

export const httpMetrics =
  (metrics: MetricsRecorder): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    if (c.req.path === SYSTEM_ROUTES.METRICS) return next();
    const startedAt = performance.now();
    try {
      await next();
    } finally {
      metrics.observeHttpRequest(
        { method: c.req.method, route: routeLabel(c), status: c.res.status },
        (performance.now() - startedAt) / 1_000,
      );
    }
  };
