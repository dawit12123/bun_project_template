# Adding a new service

Every service is generated from `templates/service`, so they all share the same structure, startup
sequence, error format and conventions. Generating one takes about a minute, and you then fill in
its domains.

## 1. Choose the name, port and schema

| Item | Rule | Example |
|---|---|---|
| Name | kebab-case, ends with `-service` | `student-service` |
| Port | next free port in [`SERVICES.md`](SERVICES.md) (picked automatically) | `4002` |
| Schema | the name in snake_case (automatic) | `student_service` |

Check [`SERVICES.md`](SERVICES.md) so the name is not already taken.

## 2. Generate it

```bash
# from the repository root
bun run new-service student-service --remove-example --description "Student registration and documents"
```

| Option | Effect |
|---|---|
| `--remove-example` | drops the example `note` domain (files, wiring, migration, tests). Omit it to keep the example as a reference |
| `--port N` | use a specific port instead of the next free one |
| `--description "…"` | written to `package.json`, the service README and the registry |
| `--no-register` | do not touch shared files (registry, `database/migrations`). Only for experiments |

What the generator does:

1. Copies `templates/service` to `services/<name>` (without `node_modules`, `.env`, build output).
2. Renames the package (`@driversim/<name>`), `SERVICE_NAME`, schema, port and Docker `SERVICE` arg.
3. With `--remove-example`, deletes the example domain and strips its wiring
   (`// @example-domain` markers).
4. **Appends the service's schema migrations to `database/migrations/`** (renumbered after the
   latest version), and points the service's integration tests at that shared history.
5. Adds a row to [`SERVICES.md`](SERVICES.md).
6. Formats the result with Biome.

## 3. Register and migrate

```bash
bun install                 # registers the new workspace (@driversim/<name>)
bun run db:migrate          # creates schema <schema> with event_outbox / event_inbox
```

## 4. Run it

```bash
cd services/student-service
cp .env.example .env        # adjust DATABASE_URL / REDIS_URL / KAFKA_BROKERS for your machine
bun run dev
```

Check `http://localhost:<port>/health/ready` and `http://localhost:<port>/docs`.

## 5. Add the service's domains

Follow [ADDING-A-DOMAIN.md](ADDING-A-DOMAIN.md) for each domain (e.g. `student`, `document`).
In short:

```
src/constants/student.constants.ts
src/interfaces/student/{student,repository,service}.interface.ts
src/dto/student/{request.dto,response.dto,validator}.ts
src/models/student.model.ts (+ value objects)
src/events/ · src/errors/ · src/mappers/ · src/services/
src/repositories/{postgres,memory}/student.{repository,unit-of-work}.ts
src/controllers/student.controller.ts · src/routes/student.routes.ts
database/migrations/NNNN_student_service__students.{up,down}.sql   (bun run db:create student_service students)
```

Then wire it in the only two places that connect things:

- `src/bootstrap/container.ts`: create the unit of work and the service.
- `src/routes/index.ts`: add it to `RouteServices` and add a router factory.

## 6. Relations to other services

Reference another service's table with a **qualified foreign key** in your migration:

```sql
create table student_service.students (
  id        uuid primary key,
  user_id   uuid not null references auth_service.users (id),
  school_id uuid not null
);
```

- The referenced schema must be created by an **earlier** migration (the shared history
  guarantees order).
- Read other schemas with qualified names (`auth_service.users`), or list them in
  `DATABASE_EXTRA_SCHEMAS`.
- **Never write** to another service's schema. Change its data through its API or its events.

## 7. Events

- **Publish:** record domain events in the aggregate and add them to the unit of work's `outbox`.
  The relay delivers them to `driversim.<context>.events.v1`.
- **Consume:** add handlers in `src/consumers/` and include them in the container's handler map.
  The inbox de-duplicates.

## 8. Before opening the PR

```bash
cd services/<name>
bun run check                       # typecheck + lint + tests
TEST_DATABASE_URL=postgres://…/driversim_test bun run test:integration
bun run openapi:export              # review openapi/openapi.json
```

- [ ] `SERVICES.md` row and description are correct
- [ ] migrations qualify every object and touch only this service's schema
- [ ] every route has guards (`requireSchoolAccess` for school data + `requirePermissions`)
- [ ] `.env.example` documents any new variable (and `src/config/*.config.ts` validates it)
- [ ] Postman collection / API docs updated for the frontend teams

## Removing a service

1. Delete `services/<name>` and its row in `SERVICES.md`.
2. Add a migration that drops its schema (`drop schema <schema> cascade`), after removing foreign
   keys that point into it from other schemas. Never delete applied migration files.
3. `bun install` to update the workspace lockfile.
