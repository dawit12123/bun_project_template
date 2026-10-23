# Building, testing and releasing

How code goes from a developer machine to a running container.

## 1. Local quality gates

Run these before every push. CI runs the same steps.

```bash
# whole monorepo (from the root)
bun install
bun run typecheck           # tsc in every workspace
bun run lint                # Biome lint + format check (bun run lint:fix to auto-fix)
bun run test                # every workspace's tests

# one service
cd services/<name>
bun run check               # typecheck + lint + tests
```

Integration tests need a disposable database whose name ends in `_test`, because it is reset on
every run:

```bash
TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driversim_test bun test
```

| Suite | Location | Needs |
|---|---|---|
| unit | `tests/unit`, `packages/*/tests` | nothing (in-memory) |
| HTTP (end-to-end through the app) | `tests/http` | nothing (in-memory adapters, test tokens) |
| integration | `tests/integration`, `*.int.test.ts` | `TEST_DATABASE_URL` (skipped otherwise) |

## 2. Continuous integration (`.github/workflows/ci.yml`)

1. **Detect changes.** Only the workspaces touched by the change are checked. A change outside
   `templates/` and `services/` (e.g. `packages/`, `bootstrap/`, `database/`) re-checks
   **every** workspace, because services depend on them.
2. **Per workspace, in parallel:** `bun install --frozen-lockfile` → `typecheck` →
   `biome ci` → tests against a fresh Postgres service container (`TEST_DATABASE_URL` set).

A PR is mergeable when every job is green.

## 3. Versioning

- Services and packages start at `0.1.0`. Bump `version` in the service's `package.json`; it is
  reported by `/health/live` and stamped on every log line (`SERVICE_VERSION` overrides it).
- Shared packages are consumed as `workspace:*`. A breaking change to a package must update
  every dependent service in the same PR.
- Event contracts are versioned separately (`version` in the envelope, `…events.v1` topics).

## 4. Docker image

Images are built from the **repository root**, because a service needs `bootstrap/`,
`packages/` and the root lockfile:

```bash
docker build \
  -f services/<name>/Dockerfile \
  --build-arg SERVICE=services/<name> \
  -t driversim/<name>:<version> .
```

The Dockerfile:

1. **build stage:** copies the repo (minus `.dockerignore`d files) and runs
   `bun install --frozen-lockfile --production`.
2. **runtime stage:** `oven/bun:1.2.23-alpine`, copies only `node_modules`, `bootstrap/`,
   `packages/` and the service. Runs as the non-root `bun` user, with a `HEALTHCHECK` on
   `/health/live`.

Run it:

```bash
docker run --env-file services/<name>/.env -p <port>:<port> driversim/<name>:<version>
```

## 5. Database migrations in a deployment

Migrations are **not** run by the service. Run them once per release, before the new version
receives traffic:

```bash
# from the repo (CI job, release pipeline or a one-off container)
DATABASE_URL=postgres://<migrator-user>@<host>/driversim bun run db:migrate
```

- Use a migrator role allowed to create schemas and tables. Services use their own restricted
  roles (`database/README.md`).
- Migrations must be backward compatible with the running version (expand → deploy → contract)
  so a rollback of the service does not need a database rollback.
- `bun run db:status` shows applied/pending/drifted migrations per database.

## 6. Release order

1. Merge to `main` (CI green).
2. Build and push the images of the changed services.
3. Run `bun run db:migrate` against the target environment.
4. Deploy the services. Each one:
   - validates config, and refuses in-memory adapters in production;
   - connects Postgres and Redis at startup, and exits with a report if either is unreachable;
   - only then opens the port. Readiness (`/health/ready`) turns green when the critical
     dependencies are up.
5. Watch `/metrics` (Prometheus) and the JSON logs (`requestId` / `correlationId` on every line).

## 7. Production configuration checklist

- [ ] `NODE_ENV=production`
- [ ] `DATABASE_URL` uses the service's own Postgres role; `DATABASE_SCHEMA` set
- [ ] `REDIS_URL`, `KAFKA_BROKERS` (+ `KAFKA_SSL` / `KAFKA_SASL_*`) set
- [ ] `AUTH_JWKS_URL` points at auth-service; `AUTH_ISSUER` / `AUTH_AUDIENCE` match it
- [ ] `TRUST_PROXY=true` only behind a trusted load balancer
- [ ] `CORS_ORIGINS` lists only the real frontends
- [ ] `API_DOCS_ENABLED=false` unless the docs should be public
- [ ] `LOG_PRETTY=false` (enforced), `LOG_LEVEL=info`
- [ ] graceful shutdown: orchestrator sends SIGTERM and waits at least `SHUTDOWN_TIMEOUT_MS`

## 8. Rollback

- **Service:** redeploy the previous image tag. Migrations were backward compatible, so the
  schema still fits.
- **Migration (last resort):** `bun run db:rollback [steps] --schema <schema>` reverts the latest
  migrations of that schema's database, using the `.down.sql` files. Prefer a new forward
  migration.
