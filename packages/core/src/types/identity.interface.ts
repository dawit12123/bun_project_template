import type { IdentityType } from "../constants/identity.constants";

/** The authenticated caller, derived exclusively from a verified access token. */
export interface AuthIdentity {
  userId: string;
  identityType: IdentityType;
  sessionId: string;
  tokenId: string;
  roles: readonly string[];
  permissions: ReadonlySet<string>;
  /** School tenant the session is scoped to; null for platform-level identities. */
  schoolId: string | null;
  mfa: boolean;
  expiresAt: Date;
}

/** Who performed an action, carried into use cases for auditing and events. */
export interface ActionContext {
  actor: AuthIdentity;
  correlationId: string;
}
