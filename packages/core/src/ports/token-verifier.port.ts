import type { AuthIdentity } from "../types/identity.interface";

export interface TokenVerifier {
  /** Resolves the identity of a valid access token or throws an UNAUTHENTICATED AppError. */
  verify(token: string): Promise<AuthIdentity>;
  /** Optional startup hook, e.g. prefetching the signing keys so the first request is not slower. */
  warmUp?(): Promise<void>;
}

export interface SessionRevocationStore {
  isRevoked(sessionId: string): Promise<boolean>;
  revoke(sessionId: string, ttlSeconds?: number): Promise<void>;
}
