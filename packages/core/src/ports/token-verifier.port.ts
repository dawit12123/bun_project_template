import type { AuthIdentity } from "../types/identity.interface";

export interface TokenVerifier {
  /** Resolves the identity of a valid access token or throws an UNAUTHENTICATED AppError. */
  verify(token: string): Promise<AuthIdentity>;
}

export interface SessionRevocationStore {
  isRevoked(sessionId: string): Promise<boolean>;
  revoke(sessionId: string, ttlSeconds?: number): Promise<void>;
}
