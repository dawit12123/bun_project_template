import { HEADERS } from "@driversim/core";
import { Errors } from "@driversim/core";
import type { MetricsRecorder } from "@driversim/core";
import type { RateLimiter } from "@driversim/core";
import type { Context, MiddlewareHandler } from "hono";
import { QUIET_PATHS } from "../constants/app.constants";
import type { AppEnv } from "../types/http.interface";

export interface RateLimitOptions {
  name: string;
  limiter: RateLimiter;
  /** Bucket key, e.g. client IP or `${ip}:${phone}` for login throttling. */
  key: (c: Context<AppEnv>) => string;
  /**
   * When the store is unreachable: `open` lets traffic through (general API),
   * `closed` rejects (credential endpoints, where abuse matters more than availability).
   */
  onStoreFailure?: "open" | "closed";
  metrics?: MetricsRecorder;
}

export const rateLimit =
  (options: RateLimitOptions): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    if (QUIET_PATHS.has(c.req.path)) return next();

    let decision: Awaited<ReturnType<RateLimiter["consume"]>>;
    try {
      decision = await options.limiter.consume(options.key(c));
    } catch (error) {
      c.get("logger").error("rate limiter unavailable", { limiter: options.name, err: error });
      if (options.onStoreFailure === "closed") throw Errors.dependencyUnavailable(error);
      return next();
    }

    c.header(HEADERS.RATE_LIMIT_LIMIT, String(decision.limit));
    c.header(HEADERS.RATE_LIMIT_REMAINING, String(decision.remaining));
    c.header(HEADERS.RATE_LIMIT_RESET, String(decision.resetSeconds));

    if (!decision.allowed) {
      options.metrics?.recordRateLimited(options.name);
      throw Errors.rateLimited(decision.resetSeconds);
    }
    await next();
  };
