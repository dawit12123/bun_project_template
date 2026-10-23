import { optionalString } from "@driversim/core";
import { z } from "zod";

export const authEnvSchema = z.object({
  AUTH_ISSUER: z.string().min(1).default("driversim-auth"),
  AUTH_AUDIENCE: z.string().min(1).default("driversim-api"),
  /** JWKS endpoint of auth-service (required in production). */
  AUTH_JWKS_URL: optionalString().pipe(z.string().url().optional()),
  /** Inline JWKS JSON for local development and tests. Ignored when AUTH_JWKS_URL is set. */
  AUTH_JWKS_JSON: optionalString(),
  AUTH_CLOCK_TOLERANCE_S: z.coerce.number().int().min(0).max(300).default(5),
});

export interface AuthConfig {
  issuer: string;
  audience: string;
  jwksUrl: string | undefined;
  jwksJson: string | undefined;
  clockToleranceSeconds: number;
}

export const toAuthConfig = (env: z.infer<typeof authEnvSchema>): AuthConfig => ({
  issuer: env.AUTH_ISSUER,
  audience: env.AUTH_AUDIENCE,
  jwksUrl: env.AUTH_JWKS_URL,
  jwksJson: env.AUTH_JWKS_JSON,
  clockToleranceSeconds: env.AUTH_CLOCK_TOLERANCE_S,
});
