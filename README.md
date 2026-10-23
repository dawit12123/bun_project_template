# DriverSim Backend

Monorepo for the DriverSim platform microservices: **Bun + TypeScript + Hono**, PostgreSQL, Redis,
Redpanda (Kafka API) and Prometheus.

- **`packages/`**: the shared platform, written and tested once (`@driversim/*`).
- **`templates/service/`**: the blueprint every service is generated from. It holds domain
  code and wiring only.
- **`services/`**: generated, independently deployable services. Each has its own config,
  migrations, database and image. Services never import each other.

```
driversim-backend/
├── packages/
│   ├── core/              @driversim/core           errors, base models, types, ports, helpers, validation
│   ├── http/              @driversim/http           createHttpApp, middleware, guards, response envelope, health, OpenAPI
│   ├── testing/           @driversim/testing        test tokens, log capture, request client, test database
│   └── infra/             adapters for external systems (implement core ports)
│       ├── postgres/      @driversim/postgres       Bun SQL client, migrator, seeder, pg errors
│       ├── redis/         @driversim/redis          Redis/in-memory key-value stores, rate limiter
│       ├── messaging/     @driversim/messaging      Kafka/Redpanda publisher & consumer, memory bus, outbox, inbox
│       ├── auth/          @driversim/auth           JWKS + JWT verifier, session revocation, auth event consumer
│       └── observability/ @driversim/observability  JSON logger (secret redaction), Prometheus metrics
├── templates/service/  blueprint: config, domain folders, bootstrap (example `note` domain)
├── services/           auth-service, student-service, … (generated)
├── scripts/new-service.ts
├── docker/             local environment: docker-compose.yml (Postgres :5433, Redis, Redpanda + console :8085,
│                       Prometheus), Postgres init script, Prometheus config
└── docs/               architecture, conventions, ADRs, service registry
```

## Quick start

```bash
bun install                      # all workspaces (Bun ≥ 1.2.21)
bun run infra:up

bun run new-service student-service --remove-example
bun install
cd services/student-service
cp .env.example .env
bun run db:ensure && bun run db:migrate
bun run dev                      # http://localhost:<port>/docs
```

A service also runs with **no infrastructure**: leave `DATABASE_URL`, `REDIS_URL` and
`KAFKA_BROKERS` empty and it uses in-memory adapters. Production config validation blocks this.

## Commands

| Where | Command | What |
|---|---|---|
| root | `bun run new-service <name> [--port N] [--remove-example]` | generate a service |
| root | `bun run typecheck` · `bun run test` · `bun run lint` | every workspace |
| root | `bun run infra:up` · `infra:down` | local infrastructure |
| service | `bun run dev` | watch mode |
| service | `db:ensure` · `db:migrate` · `db:rollback` · `db:status` · `db:create <name>` · `db:seed` | database |
| service | `bun test` (integration suites need `TEST_DATABASE_URL`) | tests |
| service | `bun run openapi:export` | write `openapi/openapi.json` |
| root | `docker build -f services/<name>/Dockerfile --build-arg SERVICE=services/<name> .` | image |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [Conventions](docs/CONVENTIONS.md) ·
  [Adding a domain](docs/ADDING-A-DOMAIN.md) · [Service registry](docs/SERVICES.md) · [ADRs](docs/adr)
