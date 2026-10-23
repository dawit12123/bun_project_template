# ADR-0001: Bun + TypeScript + Hono for backend services

- **Status:** accepted (2026-10-23)
- **Context:** The platform summary proposed Go + Chi. The delivery board (Trello AUTH-006, 007,
  044, 045) specifies Bun + TypeScript + Hono, and the team lead confirmed Bun for the
  Authentication and Student Management services.
- **Decision:** Services use Bun 1.2.x (runtime, package manager, test runner, native Postgres
  and Redis clients), TypeScript in strict mode, Hono with `@hono/zod-openapi` (validation and
  OpenAPI from one schema), and Zod for config/DTO validation.
- **Consequences:**
  - One language across web (Next.js) and backend; DTO schemas double as OpenAPI docs.
  - Fewer dependencies (built-in SQL, Redis, password hashing, test runner).
  - Kafka uses kafkajs (pure JS); its compatibility with Bun is covered by staging tests.
  - The rest of the PDF architecture (event-driven, PostgreSQL, Redis, Redpanda, Prometheus)
    is unchanged.
