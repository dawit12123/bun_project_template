# ADR-0002: Every service verifies access tokens itself

- **Status:** accepted (2026-10-23)
- **Context:** A gateway that forwards identity headers (`X-User-Id`, …) makes every service
  trust whatever reaches it. Misrouted or internal traffic could then forge identity
  (Trello AUTH-042: "Clients cannot forge trusted identity context").
- **Decision:** auth-service signs short-lived access tokens with an asymmetric key (EdDSA)
  and publishes `/.well-known/jwks.json`. Each service verifies signature, `alg`, `iss`, `aud`,
  `exp` and claim shape locally (`infrastructure/auth`) and ignores identity headers. Immediate
  revocation is handled by consuming `auth.session.revoked` into a Redis denylist checked by
  the `authenticate` guard.
- **Consequences:** No per-request call to auth-service. Key rotation is transparent (JWKS is
  cached and refetched on unknown `kid`). Revocation is near-real-time through events.
  Permissions travel in the token, so a role change takes effect on the next token refresh
  or immediately through session revocation.
