import type { KeyValueStore } from "@driversim/core";
import type { SessionRevocationStore } from "@driversim/core";
import { AUTH_KV_PREFIX, REVOKED_SESSION_TTL_SECONDS } from "./constants/auth.constants";

/**
 * Denylist of revoked sessions, fed by `auth.session.revoked` events. Lets a service reject
 * a still-unexpired access token immediately after logout or account suspension.
 */
export class KeyValueSessionRevocationStore implements SessionRevocationStore {
  constructor(private readonly store: KeyValueStore) {}

  async isRevoked(sessionId: string): Promise<boolean> {
    return (await this.store.get(`${AUTH_KV_PREFIX.REVOKED_SESSION}${sessionId}`)) !== null;
  }

  async revoke(sessionId: string, ttlSeconds = REVOKED_SESSION_TTL_SECONDS): Promise<void> {
    await this.store.set(`${AUTH_KV_PREFIX.REVOKED_SESSION}${sessionId}`, "1", ttlSeconds);
  }
}
