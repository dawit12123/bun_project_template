import { HEADERS } from "@driversim/core";
import { TRACE_ID_PATTERN } from "@driversim/core";
import { newId } from "@driversim/core";
import type { Logger } from "@driversim/core";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/http.interface";

const trusted = (value: string | undefined): string | undefined =>
  value !== undefined && TRACE_ID_PATTERN.test(value) ? value : undefined;

/**
 * Assigns the request id (reusing a well-formed inbound one), the correlation id that follows
 * a business flow across services, and a request-scoped logger carrying both.
 */
export const requestContext =
  (rootLogger: Logger): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const requestId = trusted(c.req.header(HEADERS.REQUEST_ID)) ?? newId();
    const correlationId = trusted(c.req.header(HEADERS.CORRELATION_ID)) ?? requestId;

    c.set("requestId", requestId);
    c.set("correlationId", correlationId);
    c.set("logger", rootLogger.child({ requestId, correlationId }));
    c.header(HEADERS.REQUEST_ID, requestId);
    c.header(HEADERS.CORRELATION_ID, correlationId);
    await next();
  };
