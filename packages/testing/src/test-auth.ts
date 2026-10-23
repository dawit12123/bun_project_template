import { type AccessTokenClaims, JwtTokenVerifier } from "@driversim/auth";
import { newId } from "@driversim/core";
import { type JWK, SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";

export const TEST_ISSUER = "driversim-auth";
export const TEST_AUDIENCE = "driversim-api";
export const TEST_SCHOOL_ID = "01928c7e-0000-7000-8000-0000000000a1";
export const OTHER_SCHOOL_ID = "01928c7e-0000-7000-8000-0000000000b2";

export interface IssueOptions {
  issuer?: string;
  audience?: string;
  /** Seconds from now; negative values produce an already-expired token. */
  expiresInSeconds?: number;
}

export interface TestAuth {
  jwksJson: string;
  verifier: JwtTokenVerifier;
  issue(claims?: Partial<AccessTokenClaims>, options?: IssueOptions): Promise<string>;
}

/** Ed25519 key pair + issuer mirroring what auth-service produces. */
export const createTestAuth = async (): Promise<TestAuth> => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const publicJwk: JWK = { ...(await exportJWK(publicKey)), kid: "test-key-1", alg: "EdDSA", use: "sig" };
  const jwks = { keys: [publicJwk] };

  return {
    jwksJson: JSON.stringify(jwks),
    verifier: new JwtTokenVerifier(createLocalJWKSet(jwks), {
      issuer: TEST_ISSUER,
      audience: TEST_AUDIENCE,
      clockToleranceSeconds: 0,
    }),
    async issue(claims = {}, options = {}) {
      const now = Math.floor(Date.now() / 1_000);
      const { sub = newId(), exp: _ignored, ...rest } = claims;
      const payload = {
        sid: newId(),
        typ: "school_staff",
        roles: ["school_admin"],
        perms: [] as string[],
        sch: TEST_SCHOOL_ID,
        mfa: false,
        ...rest,
      };
      return new SignJWT(payload)
        .setProtectedHeader({ alg: "EdDSA", kid: "test-key-1" })
        .setSubject(sub)
        .setJti(newId())
        .setIssuer(options.issuer ?? TEST_ISSUER)
        .setAudience(options.audience ?? TEST_AUDIENCE)
        .setIssuedAt(now - 1)
        .setExpirationTime(now + (options.expiresInSeconds ?? 300))
        .sign(privateKey);
    },
  };
};
