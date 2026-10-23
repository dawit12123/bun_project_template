# Adding a domain

The `note` domain in `templates/service` is the worked example. Platform building blocks come
from the packages: base models and errors from `@driversim/core`, guards and response
builders from `@driversim/http`, and the outbox writer from `@driversim/messaging`. Every file marked
`EXAMPLE DOMAIN` has a counterpart you create for your domain. Example below: `student`.

| # | File | Contents |
|---|---|---|
| 1 | `src/constants/student.constants.ts` | permissions, limits, event types, topic, error messages |
| 2 | `src/interfaces/student/student.interface.ts` | props, snapshot, DB record, filters |
| 3 | `src/models/student.model.ts` (+ one file per value object) | aggregate extending `AggregateRoot`; invariants; records events |
| 4 | `src/events/student.events.ts` | event payload types + factories |
| 5 | `src/errors/student.errors.ts` | `DomainError`s with stable codes |
| 6 | `src/dto/student/request.dto.ts` · `response.dto.ts` · `validator.ts` | Zod/OpenAPI schemas and validators |
| 7 | `src/interfaces/student/repository.interface.ts` · `service.interface.ts` | ports: `IStudentRepository`, `IStudentUnitOfWork`, `IStudentService` |
| 8 | `src/mappers/student.mapper.ts` | model ↔ response DTO ↔ record |
| 9 | `src/services/student.service.ts` | use cases. Depend on ports only, and publish events through `outbox` |
| 10 | `src/repositories/postgres/student.repository.ts` · `student.unit-of-work.ts` | Postgres adapters |
| 11 | `src/repositories/memory/student.repository.ts` · `student.unit-of-work.ts` | in-memory adapters (tests, dev) |
| 12 | `src/controllers/student.controller.ts` · `src/routes/student.routes.ts` | HTTP adapter + OpenAPI routes + guards |
| 13 | `database/migrations/NNNN_students.up.sql` / `.down.sql` | `bun run db:create students` |
| 14 | `src/seeds/student.seed.ts` + register in `src/seeds/index.ts` | idempotent initial data |
| 15 | wire in `src/bootstrap/container.ts` (unit of work + service) and `src/routes/index.ts` (`RouteServices` + a router factory) | the only wiring points |
| 16 | tests: `tests/unit/models`, `tests/unit/services`, `tests/http`, `tests/integration` | mirror the note tests |

Checklist before opening a PR:

- [ ] `bun run typecheck && bun run lint && bun test` pass
- [ ] integration tests pass with `TEST_DATABASE_URL`
- [ ] every route has guards (`requireSchoolAccess` for school data + `requirePermissions`)
- [ ] events documented in `events/<domain>.events.ts` and published only via the outbox
- [ ] `bun run openapi:export` output reviewed; Postman collection updated
