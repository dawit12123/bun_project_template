import { IDENTITY_TYPE_VALUES } from "@driversim/core";
import { Errors } from "@driversim/core";
import type { AuthIdentity } from "@driversim/core";
import type { TokenVerifier } from "@driversim/core";
import { type JWTVerifyGetKey, errors as joseErrors, jwtVerify } from "jose";
import { z } from "zod";
import { ACCEPTED_JWT_ALGORITHMS } from "./constants/auth.constants";

/** Access-token claims contract shared with auth-service. */
export const accessTokenClaimsSchema = z.object({
  sub: z.string().uuid(),
  sid: z.string().min(1),
  jti: z.string().min(1),
  typ: z.enum(IDENTITY_TYPE_VALUES),
  roles: z.array(z.string()).default([]),
  perms: z.array(z.string()).default([]),
  sch: z.string().uuid().nullable().optional(),
  mfa: z.boolean().default(false),
  exp: z.number().int(),
});

export type AccessTokenClaims = z.input<typeof accessTokenClaimsSchema>;

export interface JwtVerifierOptions {
  issuer: string;
  audience: string;
  clockToleranceSeconds: number;
}

/** Verifies signature, algorithm, issuer, audience, expiry and claim shape of access tokens. */
export class JwtTokenVerifier implements TokenVerifier {
  constructor(
    private readonly keys: JWTVerifyGetKey,
    private readonly config: JwtVerifierOptions,
  ) {}

  async verify(token: string): Promise<AuthIdentity> {
    let payload: unknown;
    try {
      ({ payload } = await jwtVerify(token, this.keys, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: [...ACCEPTED_JWT_ALGORITHMS],
        clockTolerance: this.config.clockToleranceSeconds,
        requiredClaims: ["sub", "exp", "iat", "jti"],
      }));
    } catch (error) {
      // The key server being unreachable is our problem, not an invalid credential.
      if (error instanceof joseErrors.JWKSTimeout) throw Errors.dependencyUnavailable(error);
      throw Errors.unauthenticated("Invalid or expired access token.", error);
    }

    const claims = accessTokenClaimsSchema.safeParse(payload);
    if (!claims.success) throw Errors.unauthenticated("Access token claims are invalid.", claims.error);

    const { sub, sid, jti, typ, roles, perms, sch, mfa, exp } = claims.data;
    return {
      userId: sub,
      sessionId: sid,
      tokenId: jti,
      identityType: typ,
      roles,
      permissions: new Set(perms),
      schoolId: sch ?? null,
      mfa,
      expiresAt: new Date(exp * 1_000),
    };
  }
}
