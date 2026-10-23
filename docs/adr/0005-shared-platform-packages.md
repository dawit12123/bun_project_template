# ADR-0005: Shared platform packages (`@driversim/*`)

- **Status:** accepted (2026-10-23)
- **Context:** Copying ~60 platform files (logger, guards, outbox, adapters, …) into every
  service causes duplicated fixes and behavioural drift across 7–10 services.
- **Decision:** Extract the platform into workspace packages:

  | Package | Owns |
  |---|---|
  | core | errors, base models, types, ports, helpers, validation |
  | observability | logger, metrics |
  | http | app factory, middleware, guards, envelope, health, OpenAPI |
  | auth | JWKS/JWT verification, session revocation, auth events |
  | postgres | client, migrator, seeder |
  | redis | key-value stores, rate limiter |
  | messaging | Kafka, memory bus, outbox, inbox |
  | bootstrap (repo root `bootstrap/`) | process singletons (logger, metrics, clock) + shared `startService` / graceful shutdown |
  | testing | test utilities (dev dependency) |

  Adapter packages for external systems live under `packages/infra/` (postgres, redis,
  messaging, auth, observability); `core`, `http` and `testing` stay at `packages/`.
  Services depend on them with `workspace:*`. Packages are configured through option objects
  and never read env. Service code contains only domain logic and wiring.
- **Consequences:**
  - A platform fix lands once, and CI re-tests every workspace when `packages/` changes.
  - Docker images are built from the repository root (`--build-arg SERVICE=services/<name>`).
  - Moving a service to its own repository requires publishing the packages (e.g. GitHub
    Packages with semver) and replacing `workspace:*` with versions. This is a one-time,
    mechanical change.
  - Breaking changes to a package must update every dependent service in the same PR.
