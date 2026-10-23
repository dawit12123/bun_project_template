import { HEADERS } from "@driversim/core";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "../types/http.interface";

/** Explicit allow-list only; no CORS headers at all when no origins are configured. */
export interface CorsOptions {
  origins: string[];
  credentials: boolean;
}

export const corsPolicy = (config: CorsOptions): MiddlewareHandler<AppEnv> | null => {
  if (config.origins.length === 0) return null;
  return cors({
    origin: config.origins,
    credentials: config.credentials,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", HEADERS.REQUEST_ID, HEADERS.CORRELATION_ID],
    exposeHeaders: [HEADERS.REQUEST_ID, HEADERS.CORRELATION_ID, HEADERS.RETRY_AFTER],
    maxAge: 600,
  });
};
