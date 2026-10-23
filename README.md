# DriverSim Backend

Monorepo for the DriverSim platform microservices: **Bun + TypeScript + Hono**, PostgreSQL, Redis,
Redpanda (Kafka API) and Prometheus.

- **`bootstrap/`**: the initialization every service shares. It creates one logger, one metrics
  registry and one clock per process, and runs the single startup and shutdown sequence.
- **`packages/`**: the shared platform (`@driversim/*`), written and tested once.
- **`database/`**: the shared database. It holds one ordered migration history for every service
  schema.
- **`templates/service/`**: the blueprint every service is generated from. It contains domain
  code and wiring only.
- **`services/`**: generated, independently deployable services. Each has its own config and
  image, plus **its own schema in the shared `driversim` database**. Services never import each
  other.

---

## Contents

1. [Prerequisites](#prerequisites)
2. [Repository layout](#repository-layout)
3. [Getting started](#getting-started)
4. [Running several services](#running-several-services)
5. [Configuration reference](#configuration-reference)
6. [Database model](#database-model)
7. [How a service starts](#how-a-service-starts)
8. [Testing](#testing)
9. [Commands](#commands)
10. [Docker images](#docker-images)
11. [Troubleshooting](#troubleshooting)
12. [Recommendations](#recommendations)
13. [Documentation](#documentation)

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| [Bun](https://bun.sh) | ≥ 1.2.21 | runtime, package manager and test runner (`npm i -g bun@1.2.21`) |
| PostgreSQL | 16+ | via Docker (port **5433**) **or** an existing local install |
| Docker Desktop | optional | only needed for `bun run infra:up` (Postgres, Redis, Redpanda, Prometheus) |

Redis and Redpanda are optional during development. Leave their URLs empty and the service
uses in-memory adapters. Production config refuses that.

---

## Repository layout

```
driversim-backend/
├── bootstrap/            @driversim/bootstrap      createRuntime (logger, metrics, clock — once per process),
│                                                   startService / runService (shared startup + graceful shutdown)
├── packages/
│   ├── core/             @driversim/core           errors, base models, types, ports, helpers, validation
│   ├── http/             @driversim/http           createHttpApp, middleware, guards, response envelope, health, OpenAPI
│   ├── testing/          @driversim/testing        test tokens, log capture, request client, test database
│   └── infra/            adapters for external systems (implement core ports)
│       ├── postgres/     @driversim/postgres       Bun SQL client, migrator, seeder, pg errors
│       ├── redis/        @driversim/redis          Redis/in-memory key-value stores, rate limiter
│       ├── messaging/    @driversim/messaging      Kafka/Redpanda publisher & consumer, memory bus, outbox, inbox
│       ├── auth/         @driversim/auth           JWKS + JWT verifier, session revocation, auth event consumer
│       └── observability/@driversim/observability  JSON logger (secret redaction), Prometheus metrics
├── database/             shared DB: migrations/ (one history, NNNN_<schema>__<change>), migrate script
├── templates/service/    blueprint service (example `note` domain)
├── services/             auth-service, student-service, … (generated)
├── scripts/new-service.ts
├── docker/               docker-compose.yml, Postgres init script, Prometheus config
└── docs/                 architecture, conventions, ADRs, service registry
```

Inside a service, code is grouped **by type, then by domain**:

```
src/
├── main.ts                 runService(serviceDefinition): the whole entry point
├── bootstrap/              bootstrap.ts (service definition) · container.ts (wiring) · app.ts (routes)
├── config/                 one file per concern: app, http, database, redis, kafka, outbox, auth, logger, metrics
├── constants/              <domain>.constants.ts
├── interfaces/<domain>/    <domain>.interface.ts · repository.interface.ts · service.interface.ts (ports)
├── dto/<domain>/           request.dto.ts · response.dto.ts · validator.ts
├── models/                 one flat file per entity / value object
├── events/ errors/ mappers/ services/
├── repositories/{postgres,memory}/
├── controllers/ routes/ consumers/ seeds/
```

---

## Getting started

### 1. Install

```bash
cd driversim-backend
bun install
```

### 2. Start infrastructure (pick one)

**Option A: Docker** (Postgres :5433, Redis :6379, Redpanda :19092, Redpanda Console :8085)

```bash
bun run infra:up              # Docker Desktop must be running
```

**Option B: no Docker.** Use an existing PostgreSQL, and leave Redis/Kafka empty (in-memory).
Point every `DATABASE_URL` below at it, e.g.
`postgres://postgres:<password>@localhost:5432/driversim`.

### 3. Create the shared database

```bash
cp database/.env.example database/.env
# Option B: edit database/.env → DATABASE_URL=postgres://postgres:<password>@localhost:5432/driversim
bun run db:ensure             # creates the "driversim" database (once)
```

### 4. Generate a service and apply its schema

```bash
bun run new-service auth-service --remove-example
#   → services/auth-service, next free port (4001), schema auth_service
#   → its schema migrations are appended to database/migrations/
bun install                   # registers the new workspace
bun run db:migrate            # creates schema auth_service and its tables
```

Omit `--remove-example` to keep the example `note` domain as a reference.

### 5. Configure and run it

```bash
cd services/auth-service
cp .env.example .env
```

- **Option A (Docker):** the defaults already match.
- **Option B (local Postgres, no Docker):** set

  ```
  DATABASE_URL=postgres://postgres:<password>@localhost:5432/driversim
  REDIS_URL=
  KAFKA_BROKERS=
  AUTH_JWKS_URL=
  AUTH_JWKS_JSON={"keys":[]}
  ```

```bash
bun run dev                   # watch mode (restarts on save)
# or
bun run start                 # plain run
```

### 6. Check it

| URL | Expect |
|---|---|
| `http://localhost:4001/health/live` | `{"status":"ok", …}` (process is up) |
| `http://localhost:4001/health/ready` | `{"status":"ready", …}` (every critical dependency is up) |
| `http://localhost:4001/docs` | Swagger UI |
| `http://localhost:4001/openapi.json` | OpenAPI document |
| `http://localhost:4001/metrics` | Prometheus metrics |
| `http://localhost:4001/api/v1/...` without a token | `401` with the standard error envelope |

**Quick try without generating anything:** `cd templates/service && cp .env.example .env && bun run dev`
serves the template on port 4000.

---

## Running several services

> Full guide: [Adding a new service](docs/ADDING-A-SERVICE.md).


Each service runs in its own terminal, on its own port, with its own schema:

```bash
bun run new-service student-service --remove-example   # port 4002, schema student_service
bun install && bun run db:migrate
cd services/student-service && cp .env.example .env && bun run dev
```

Ports and schemas are recorded in [`docs/SERVICES.md`](docs/SERVICES.md).

**Tokens:** every service verifies access tokens issued by `auth-service`. Point the others at it
with `AUTH_JWKS_URL=http://localhost:4001/.well-known/jwks.json`, which becomes available once the
auth service is built. Until then use `AUTH_JWKS_JSON` for local work.

---

## Configuration reference

Each service validates its environment once at startup and lists every problem. Values are never
echoed, since they may be secrets.

| Group | Variables | Default / notes |
|---|---|---|
| App | `NODE_ENV`, `SERVICE_NAME`, `SERVICE_VERSION`, `SHUTDOWN_TIMEOUT_MS` | `development`, service name, `0.1.0`, `15000` |
| HTTP | `HOST`, `PORT`, `TRUST_PROXY`, `CORS_ORIGINS`, `CORS_CREDENTIALS`, `BODY_LIMIT_BYTES`, `API_DOCS_ENABLED`, `RATE_LIMIT_ENABLED`, `RATE_LIMIT_PER_MINUTE` | `0.0.0.0`, service port, `false`, none, `false`, 1 MiB, `true`, `true`, `300` |
| Database | `DATABASE_URL`, `DATABASE_SCHEMA`, `DATABASE_EXTRA_SCHEMAS`, `DATABASE_POOL_MAX`, `DATABASE_*_TIMEOUT_*`, `DATABASE_STATEMENT_TIMEOUT_MS` | empty → in-memory; schema = service name in snake_case |
| Redis | `REDIS_URL`, `REDIS_KEY_PREFIX`, `REDIS_CONNECT_TIMEOUT_MS` | empty → in-memory; prefix `<service>:` |
| Kafka | `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`, `KAFKA_CONSUMER_GROUP`, `KAFKA_CONSUMER_ENABLED`, `KAFKA_SSL`, `KAFKA_SASL_*` | empty → in-memory bus |
| Outbox | `OUTBOX_RELAY_ENABLED`, `OUTBOX_POLL_INTERVAL_MS`, `OUTBOX_BATCH_SIZE`, `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_RETENTION_HOURS` | `true`, `1000`, `100`, `20`, `72` |
| Auth | `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URL`, `AUTH_JWKS_JSON`, `AUTH_CLOCK_TOLERANCE_S` | `driversim-auth`, `driversim-api`; one JWKS source required |
| Logs / metrics | `LOG_LEVEL`, `LOG_PRETTY`, `METRICS_ENABLED`, `METRICS_DEFAULT_COLLECTORS` | `info`, `false`, `true`, `true` |

**Production** additionally requires `DATABASE_URL`, `REDIS_URL`, `KAFKA_BROKERS` and
`AUTH_JWKS_URL`, and forbids `LOG_PRETTY`.

The migrator reads `database/.env`: `DATABASE_URL` plus optional `DATABASE_URL__<SCHEMA>`
overrides (see below).

---

## Database model

One PostgreSQL database (`driversim`), **one schema per service**, with **real foreign keys
between services**:

```
driversim
├── public            schema_migrations (the single migration history)
├── auth_service      users, sessions, …, event_outbox, event_inbox
├── student_service   students (user_id → auth_service.users), …
└── …
```

- Each service connects with `search_path=<its schema>`. Its own tables are unqualified
  (`students`); other services' tables are qualified (`auth_service.users`).
  `DATABASE_EXTRA_SCHEMAS` adds schemas to the `search_path` for unqualified reads.
- Migrations live in `database/migrations/`, named `NNNN_<schema>__<change>.up.sql` / `.down.sql`,
  and each one qualifies every object. Create one with `bun run db:create <schema> <change>`.
- **Same DB or separate DBs is configuration.** `DATABASE_URL__<SCHEMA>` in `database/.env` moves
  a schema to another database, which then has its own history. Foreign keys cannot cross
  databases, and `db:migrate` refuses to run if one would.
- Each service writes only to its own schema. In staging/production, enforce this with one
  Postgres role per service. The SQL is in [`database/README.md`](database/README.md).

---

## How a service starts

`src/main.ts` is a single line: `runService(serviceDefinition)`. `@driversim/bootstrap` runs the
same sequence for every service, and **everything is created once**:

```
loadConfig()                       validate env (fail fast, every problem listed)
createRuntime()                    THE logger, metrics registry and clock of the process
createContainer(config, runtime)   every adapter, repository, service, handler and worker
container.initialize()             connect Postgres*, Redis*, Kafka, prefetch auth keys
                                   (* critical: unreachable → exit 1 with a report; port never opens)
createApp()                        middleware, guards, controllers, routers; OpenAPI cached
workers start                      outbox relay, event consumer
startHttpServer()                  only now does the port accept traffic
SIGTERM / SIGINT                   readiness → 503, stop HTTP, stop workers, close connections
```

Per request, the only things created are request-scoped by nature: the request/correlation ID, a
child logger, and the repositories bound to that request's transaction.

---

## Testing

```bash
bun run test                          # every workspace (from the root)
cd services/<name> && bun test        # one service
bun test tests/unit                   # one folder
```

Unit and HTTP tests need no infrastructure, because they run on in-memory adapters. Integration
tests run only when `TEST_DATABASE_URL` points at a **disposable** database. Its name must end in
`_test`, because every schema in it is dropped on each run:

```bash
TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driversim_test bun test
```

---

## Commands

| Where | Command | What |
|---|---|---|
| root | `bun run new-service <name> [--port N] [--remove-example] [--description "…"]` | generate a service |
| root | `bun run typecheck` · `bun run test` · `bun run lint` · `bun run lint:fix` | every workspace |
| root | `bun run infra:up` · `infra:down` · `infra:logs` | local Docker infrastructure |
| root | `bun run db:ensure` | create every configured database |
| root | `bun run db:migrate` · `db:status` | apply / inspect the shared migration history |
| root | `bun run db:rollback [steps] [--schema s]` | revert the latest migrations of one database |
| root | `bun run db:create <schema> <change>` | scaffold `NNNN_<schema>__<change>.{up,down}.sql` |
| service | `bun run dev` · `bun run start` | run (watch / plain) |
| service | `bun run db:seed` | seed this service's schema |
| service | `bun test` · `test:unit` · `test:http` · `test:integration` | tests |
| service | `bun run typecheck` · `bun run lint` · `bun run check` | quality gates |
| service | `bun run openapi:export` | write `openapi/openapi.json` |

---

## Docker images

> Full guide (CI, versioning, migrations in deployments, release order, rollback):
> [Building, testing and releasing](docs/BUILDING.md).

Build from the **repository root**, because services depend on the workspace packages:

```bash
docker build -f services/<name>/Dockerfile --build-arg SERVICE=services/<name> -t driversim/<name> .
docker run --env-file services/<name>/.env -p 4001:4001 driversim/<name>
```

Migrations run as a separate step (job / init container) with the migrator, not inside the
service container.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Service exits at start with `"a critical dependency is unreachable"` | Postgres or Redis is not reachable from `DATABASE_URL` / `REDIS_URL`. The report names the dependency. |
| `invalid configuration` with a list of variables | Fix each listed variable in `.env`. |
| `relation "…" does not exist` | Run `bun run db:migrate` from the root. Also check `DATABASE_SCHEMA` matches the schema in the migrations. |
| `Foreign keys cannot cross databases` from `db:migrate` | A `DATABASE_URL__<SCHEMA>` override split two schemas linked by an FK. Keep them in one database or replace the FK with an id + events. |
| Port 5432 already in use when starting Docker | Compose maps Postgres to **5433** for that reason. Use 5433 in URLs, or stop the local Postgres. |
| `401` on every API call | Expected without a token. Tokens come from `auth-service`. Set `AUTH_JWKS_URL` (or `AUTH_JWKS_JSON` locally). |
| Windows: `Permission denied` when moving or renaming folders | VS Code holds file handles. Close the files or copy then delete. |
| Windows: Bun segfault in tests that drop databases in `afterAll` | Known Bun 1.2.21 issue. Recreate test databases at the start of a test instead. |
| Windows: Ctrl+C / `kill` does not log `shutdown started` | Windows has no real SIGTERM. Graceful shutdown works on Linux/Docker. |

---

## Recommendations

- **Start with `auth-service`.** Every other service verifies its tokens, and student data
  references `auth_service.users`.
- **Generate services with `--remove-example`.** Keep the template's `note` domain as the
  reference for new domains ([Adding a domain](docs/ADDING-A-DOMAIN.md)).
- **One schema per service, one migration per change.** Never edit an applied migration; add a
  new one (the migrator detects checksum drift).
- **Enforce schema ownership with Postgres roles** before staging (`database/README.md`).
- **Keep cross-service FKs to stable tables** (users, schools). A schema change another service
  reads is a contract change and must stay backward compatible.
- **Publish events only through the outbox** (unit of work), never directly to Kafka.
- **Run `bun run check`** (typecheck + lint + tests) in a service before pushing. CI runs the same
  per changed workspace.
- **Use Docker infrastructure for realistic local runs.** In-memory Redis/Kafka is for quick
  development only.

---

## Documentation

- [Adding a new service](docs/ADDING-A-SERVICE.md): generate, migrate, run, wire domains, relations, PR checklist
- [Building, testing and releasing](docs/BUILDING.md): quality gates, CI, Docker images, migrations, release, rollback
- [Architecture](docs/ARCHITECTURE.md): layers, dependency rules, startup, request and event flow
- [Conventions](docs/CONVENTIONS.md): naming, response envelope, error codes, events, logging, security
- [Adding a domain](docs/ADDING-A-DOMAIN.md): step-by-step recipe
- [Shared database](database/README.md): schemas, migrations, topology, ownership roles
- [Service registry](docs/SERVICES.md): ports and schemas
- [ADRs](docs/adr): recorded decisions (Bun + Hono, JWT per service, outbox/inbox, monorepo,
  shared packages, shared database)
