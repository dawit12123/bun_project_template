# Shared database

DriverSim uses **one PostgreSQL database with one schema per service**:

```
driversim
├── public            schema_migrations (the one migration history)
├── auth_service      users, credentials, roles, sessions, event_outbox, event_inbox
├── student_service   students (user_id → auth_service.users), documents, event_outbox, …
└── …
```

- Each service connects with `search_path=<its schema>` (`DATABASE_SCHEMA`), so its own tables
  are unqualified (`students`). Tables of other services must be qualified
  (`auth_service.users`).
- Cross-service relations are ordinary foreign keys:
  `user_id uuid not null references auth_service.users (id)`.
- **A service writes only to its own schema.** It reads other schemas only where a role grant
  allows it (see below).

## Same database or separate databases (configurable)

Today every schema lives in one database. The layout is configuration, not code:

| Where | Setting | Effect |
|---|---|---|
| root `.env` | `DATABASE_URL` | default database: every schema migrates here |
| root `.env` | `DATABASE_URL__<SCHEMA>` | that schema (e.g. `DATABASE_URL__STUDENT_SERVICE`) migrates into another database, with its own history |
| service `.env` | `DATABASE_URL` | the database the service connects to (same URL as its schema's target) |
| service `.env` | `DATABASE_SCHEMA` | the schema it owns and writes to (default: service name in snake_case) |
| service `.env` | `DATABASE_EXTRA_SCHEMAS` | other schemas **in the same database** added to `search_path` for unqualified reads |

Foreign keys only work inside one database. `bun run db:migrate` checks every migration first,
and refuses to run if a `REFERENCES other_schema.table` points at a schema configured for a
different database. The error names the migration and both databases.

To move a service to its own database later:

1. Replace its foreign keys into other schemas (and theirs into it) with plain ids, and keep the
   data in sync with events.
2. Set `DATABASE_URL__<SCHEMA>` for the migrator and the service's `DATABASE_URL`.
3. Copy the data across and run `bun run db:migrate`.

## Migrations

All migrations live in `database/migrations/` and form one ordered history, so a schema is
always created before another service's foreign key references it.

```bash
bun run db:ensure                          # create every configured database (once)
bun run db:migrate                         # validate, then apply pending migrations per database
bun run db:status                          # applied / pending / drifted, with the database of each
bun run db:rollback [steps] [--schema s]   # revert the latest migrations of one database
bun run db:create student_service add_documents   # → NNNN_student_service__add_documents.{up,down}.sql
```

Rules:

- File name `NNNN_<schema>__<change>.up.sql` plus `.down.sql`. Qualify every object
  (`student_service.documents`).
- A migration touches **one** service's schema. A cross-schema foreign key belongs to the
  migration of the schema that owns the referencing table.
- Never edit an applied migration (the migrator detects checksum drift). Add a new one.
- `bun run new-service` appends the new service's schema migrations here automatically.

The migrator reads the repository root `.env` (see `.env.example`); an optional
`database/.env` overrides it for the migrator only (e.g. an admin user). It needs rights to create
schemas.

## Enforcing ownership with roles (staging/production)

Run once per service as a database administrator (the example uses `student_service`, which
reads `auth_service`):

```sql
create role student_service login password '…';
grant usage on schema student_service to student_service;
grant select, insert, update, delete on all tables in schema student_service to student_service;
alter default privileges for role driversim in schema student_service
  grant select, insert, update, delete on tables to student_service;

-- read-only access to another service's data, only where needed
grant usage on schema auth_service to student_service;
grant select on auth_service.users to student_service;
```

The service then uses that role in `DATABASE_URL`. Postgres rejects any write outside its
schema, so the boundary is enforced by the database rather than by convention.
