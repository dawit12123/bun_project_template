import type { MiddlewareHandler } from "hono";
import { QUIET_PATHS } from "../constants/app.constants";
import type { AppEnv } from "../types/http.interface";
import { routeLabel } from "./route-label";

/** One structured line per request. Query strings are never logged (they may carry tokens). */
export const accessLog = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const startedAt = performance.now();
  await next();
  const status = c.res.status;
  const fields = {
    method: c.req.method,
    route: routeLabel(c),
    path: c.req.path,
    status,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    userId: c.get("identity")?.userId,
  };
  const logger = c.get("logger");
  if (status >= 500) logger.error("request completed", fields);
  else if (status >= 400) logger.warn("request completed", fields);
  else if (QUIET_PATHS.has(c.req.path)) logger.debug("request completed", fields);
  else logger.info("request completed", fields);
};
