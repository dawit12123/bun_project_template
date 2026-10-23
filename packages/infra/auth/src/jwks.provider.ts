import { type JSONWebKeySet, type JWTVerifyGetKey, createLocalJWKSet, createRemoteJWKSet } from "jose";

/**
 * Resolves verification keys published by auth-service. Remote JWKS are cached and refetched
 * on unknown `kid`, which makes signing-key rotation transparent to every service.
 */
export interface JwksSourceOptions {
  /** JWKS endpoint of auth-service (production). */
  jwksUrl?: string;
  /** Inline JWKS JSON (development and tests). */
  jwksJson?: string;
}

export const createJwksKeyResolver = (config: JwksSourceOptions): JWTVerifyGetKey => {
  if (config.jwksUrl) {
    return createRemoteJWKSet(new URL(config.jwksUrl), {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    });
  }
  if (config.jwksJson) return createLocalJWKSet(JSON.parse(config.jwksJson) as JSONWebKeySet);
  throw new Error("No JWKS source configured (AUTH_JWKS_URL or AUTH_JWKS_JSON)");
};
