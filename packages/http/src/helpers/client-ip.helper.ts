import { HEADERS } from "@driversim/core";
import type { Context } from "hono";
import { getConnInfo } from "hono/bun";

/**
 * Resolves the caller IP. X-Forwarded-For is honoured only behind a trusted proxy;
 * otherwise clients could spoof it to dodge rate limits.
 */
export const resolveClientIp = (c: Context, trustProxy: boolean): string => {
  if (trustProxy) {
    const forwarded = c.req.header(HEADERS.FORWARDED_FOR)?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
};
