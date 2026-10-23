import { BEARER_PREFIX, HEADERS } from "@driversim/core";
import { Errors } from "@driversim/core";
import type { SessionRevocationStore, TokenVerifier } from "@driversim/core";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/http.interface";

export interface AuthenticateOptions {
  verifier: TokenVerifier;
  /** Optional denylist; when it is unreachable the request fails closed (503). */
  revocations?: SessionRevocationStore;
  /**
   * Exact paths reachable without a token (e.g. login, registration). Matching is exact and
   * method-agnostic; everything else under the API prefix stays protected.
   */
  publicPaths?: readonly string[];
}

/**
 * Verifies the bearer token in this service (never trusts identity headers set by clients or
 * proxies) and attaches the identity to the request context.
 */
export const authenticate = ({
  verifier,
  revocations,
  publicPaths = [],
}: AuthenticateOptions): MiddlewareHandler<AppEnv> => {
  const open = new Set(publicPaths.map((path) => path.replace(/\/+$/, "")));
  return async (c, next) => {
    if (open.has(c.req.path.replace(/\/+$/, ""))) return next();
    const header = c.req.header(HEADERS.AUTHORIZATION);
    if (!header?.startsWith(BEARER_PREFIX)) throw Errors.unauthenticated();
    const token = header.slice(BEARER_PREFIX.length).trim();
    if (!token) throw Errors.unauthenticated();

    const identity = await verifier.verify(token);

    if (revocations) {
      let revoked: boolean;
      try {
        revoked = await revocations.isRevoked(identity.sessionId);
      } catch (error) {
        throw Errors.dependencyUnavailable(error);
      }
      if (revoked) throw Errors.unauthenticated("Session has been revoked.");
    }

    c.set("identity", identity);
    c.set("logger", c.get("logger").child({ userId: identity.userId, sessionId: identity.sessionId }));
    await next();
  };
};
