import { beforeAll, describe, expect, test } from "bun:test";
import { AppError } from "@driversim/core";
import { TEST_SCHOOL_ID, type TestAuth, createTestAuth } from "@driversim/testing";
import { SignJWT } from "jose";

let auth: TestAuth;
beforeAll(async () => {
  auth = await createTestAuth();
});

const expectUnauthenticated = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe("UNAUTHENTICATED");
};

describe("JwtTokenVerifier", () => {
  test("maps valid claims to an AuthIdentity", async () => {
    const identity = await auth.verifier.verify(
      await auth.issue({ roles: ["school_admin"], perms: ["probe:read"], mfa: true }),
    );
    expect(identity.identityType).toBe("school_staff");
    expect(identity.schoolId).toBe(TEST_SCHOOL_ID);
    expect(identity.permissions.has("probe:read")).toBe(true);
    expect(identity.mfa).toBe(true);
  });

  test("rejects expired tokens", async () => {
    await expectUnauthenticated(auth.verifier.verify(await auth.issue({}, { expiresInSeconds: -10 })));
  });

  test("rejects wrong issuer or audience", async () => {
    await expectUnauthenticated(auth.verifier.verify(await auth.issue({}, { issuer: "evil" })));
    await expectUnauthenticated(auth.verifier.verify(await auth.issue({}, { audience: "other-api" })));
  });

  test("rejects tampered payloads", async () => {
    const [header, , signature] = (await auth.issue()).split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "x", typ: "platform_admin" })).toString("base64url");
    await expectUnauthenticated(auth.verifier.verify(`${header}.${forged}.${signature}`));
  });

  test("rejects symmetric (HS256) tokens even with matching claims", async () => {
    const token = await new SignJWT({ sid: "s", typ: "platform_admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(crypto.randomUUID())
      .setJti("j")
      .setIssuer("driversim-auth")
      .setAudience("driversim-api")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("a-shared-secret-that-is-long-enough!"));
    await expectUnauthenticated(auth.verifier.verify(token));
  });

  test("rejects unknown identity types", async () => {
    await expectUnauthenticated(auth.verifier.verify(await auth.issue({ typ: "superuser" as never })));
  });
});
