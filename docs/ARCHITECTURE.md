# Architecture

## Platform view

```
 Web (Next.js) · Mobile (Flutter) · Desktop exam app (Flutter)
                        │  HTTPS + Bearer JWT
                  ┌─────▼─────┐
                  │API Gateway│  routing, TLS, coarse rate limits (never trusted for identity)
                  └─────┬─────┘
   ┌────────────────────┼─────────────────────┐
┌──▼──────────┐  ┌──────▼──────────┐   ┌──────▼───────┐
│auth-service │  │student-service  │   │ …-service    │   each: own schema in the shared DB
└──┬──────▲───┘  └──┬───────────▲──┘   └──┬───────────┘
   │ JWKS │ outbox  │ verify JWT│ outbox   │
   │      └─────────┴──── Redpanda (Kafka API) ─────────── events between services
   └── /.well-known/jwks.json → every service verifies tokens locally (no per-request call)
```

- **One database, one schema per service** (ADR-0006). Relations between services are real
  foreign keys across schemas. Each service writes only to its own schema (enforced by Postgres
  roles) and connects with `search_path=<schema>[,extra schemas]`. Migrations form one ordered
  history in `database/migrations/`. Which database each schema lives in is configuration
  (`DATABASE_URL__<SCHEMA>`), so a service can later move to its own database (see
  `database/README.md`).
- **Zero-trust identity.** Each service verifies the access token itself against auth-service's
  JWKS. Identity headers from clients or proxies are ignored (ADR-0002).
- **Reliable events.** State changes and their events commit in one transaction (outbox). A relay
  publishes them, and consumers de-duplicate with an inbox (ADR-0003).

## Shared platform packages

```
                 ┌──────────────── @driversim/core ────────────────┐
                 │ errors · base models · types · PORTS · helpers  │  (zod only, no framework)
                 └───▲────────▲────────▲────────▲────────▲─────────┘
          http      infra/: observability · auth · postgres · redis · messaging   ← adapters implementing core ports
            ▲                       ▲
            └──────── services/<name> ┘                                ← domain code + wiring only
     testing (dev only): test tokens, log capture, request client, test database
```

- `packages/` holds the kernel (`core`), the HTTP platform (`http`) and `testing`;
  `packages/infra/` holds one package per external system (Postgres, Redis, Redpanda, auth-service
  JWKS, logging/Prometheus).
- Packages never read environment variables. The service's `config/` validates env and passes
  plain option objects (`PostgresClientOptions`, `JwtVerifierOptions`, `OutboxRelayOptions`, …).
- Packages use relative imports internally. Services import only the package root
  (`@driversim/http`), never deep paths.
- `@driversim/core` owns every **port** (KeyValueStore, EventPublisher, OutboxWriter, InboxStore,
  TokenVerifier, RateLimiter, MetricsRecorder, ReadinessCheck, UnitOfWork). Adapter packages
  implement them, so a service's use cases depend on core only.

## Inside a service: hexagonal, grouped by type, then by domain

```
src/
├── main.ts                 entry point
├── bootstrap/              composition root: container (adapter choice), app (createHttpApp + routes), shutdown
├── config/                 one file per concern → typed, validated config (mapped onto package options)
├── constants/              <domain>.constants.ts
├── interfaces/<domain>/    <domain>.interface.ts · repository.interface.ts · service.interface.ts
├── dto/<domain>/           request.dto.ts · response.dto.ts · validator.ts
├── models/                 one flat file per entity / value object (extend core base models)
├── events/                 <domain>.events.ts      domain events (public contracts)
├── errors/                 <domain>.errors.ts      DomainErrors (core AppError hierarchy)
├── mappers/                <domain>.mapper.ts      model ↔ DTO ↔ DB record
├── services/               <domain>.service.ts     use cases (implement service.interface)
├── repositories/{postgres,memory}/  <domain>.repository.ts · <domain>.unit-of-work.ts
├── controllers/            <domain>.controller.ts  HTTP inbound adapter
├── routes/                 <domain>.routes.ts      OpenAPI definitions + guards; index.ts registers factories
└── seeds/                  <domain>.seed.ts + index.ts (ordered)
```

### Dependency rules

| Layer | May depend on |
|---|---|
| `models/`, `events/`, `errors/` | `@driversim/core`, own `constants/`, `interfaces/` (types) |
| `services/` | models, own ports (`interfaces/`), dto types, mappers, `@driversim/core`. **Never** repositories or adapter packages |
| `repositories/` | implement own ports; may use `@driversim/core`, `@driversim/messaging` (outbox writer), Bun SQL |
| `controllers/`, `routes/` | `service.interface.ts`, dto, `@driversim/http` (guards, response builders) |
| `bootstrap/` | everything (the only place that connects ports to adapters) |

Because services depend only on ports, every use case runs unchanged against Postgres or the
in-memory adapters. The HTTP tests exercise the whole app without any infrastructure.

## Startup lifecycle (everything is built once, centrally)

`src/main.ts` is a single line, `runService(serviceDefinition)`. The service declares WHAT it
consists of (`bootstrap/bootstrap.ts`: config loader, runtime options, container and app
factories). `@driversim/bootstrap` owns HOW every service starts and stops:

```
loadConfig()                         validate env once (fail fast, every problem listed)
createRuntime()                      THE logger, metrics registry and clock of the process (one each)
createContainer(config, runtime)     every adapter, repository, service, handler and worker, ONCE;
                                     they all receive the runtime's logger/metrics/clock
container.initialize()               connect Postgres*, Redis*, Kafka producer + admin, prefetch JWKS
                                     (* critical: unreachable → StartupError, port never opens)
createApp(container, runtime)        middleware, guards, controllers, routers built once
openApiDocument()                    OpenAPI generated once and cached
container.workers[].start()          outbox relay, event consumer
startHttpServer()                    only now does the port accept traffic
graceful shutdown (SIGTERM/SIGINT)   stop HTTP → stop workers (reverse) → close connections
```

Scripts (`db:seed`, `openapi:export`) build the same runtime. Nothing in a service calls
`createJsonLogger` or `new PrometheusMetrics` directly.

Per request, the only things created are request-scoped by nature: the request/correlation id,
a child logger, and the repository/outbox objects bound to that request's transaction. No
client, pool, verifier, router or schema is created or connected during a request. Readiness
probes reuse the connections opened at startup (one Kafka admin, the Postgres pool, the Redis
client).

## Request lifecycle

```
request-context (request/correlation id, scoped logger)
→ access-log → http-metrics → security-headers → cors → body-limit
→ rate-limit (per IP, /api/v1/*) → authenticate (JWT + revoked-session check)
→ route guards (school access, permissions) → DTO validation (422)
→ controller → service (unit of work: repository + outbox) → response envelope
errors anywhere → error-handler → standard error envelope (5xx details only in logs)
```

## Event lifecycle

```
service → aggregate records DomainEvent → unit of work → INSERT row + INSERT event_outbox (1 tx)
outbox relay (FOR UPDATE SKIP LOCKED, backoff, dead-letter) → Redpanda topic (key = aggregate id)
consumer → validate envelope → inbox (consumer, event_id) in same tx as handler → handler
```

## Adapter selection (bootstrap/container.ts)

| Setting present | Adapter | Absent (dev/test only) |
|---|---|---|
| `DATABASE_URL` (+ `DATABASE_SCHEMA`) | Postgres repositories, outbox, inbox in the service schema | in-memory repositories + outbox |
| `REDIS_URL` | Redis key-value store (rate limits, revocations) | in-memory store |
| `KAFKA_BROKERS` | kafkajs producer/consumer | in-memory event bus |
| `AUTH_JWKS_URL` | remote JWKS (cached, rotation-aware) | `AUTH_JWKS_JSON` inline keys |
