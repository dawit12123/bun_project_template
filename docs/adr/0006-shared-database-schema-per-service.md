# ADR-0006: One shared database, one schema per service

- **Status:** accepted (2026-10-23). Supersedes the "database per service" part of ADR-0004.
- **Context:** The domain is strongly relational. Students reference users and schools, and
  schedules, attendance and exam results reference students and instructors. The team needs
  real foreign keys, joins and cross-domain consistency in Phase 1.
- **Decision:**
  - One PostgreSQL database (`driversim`) with one schema per service (`auth_service`,
    `student_service`, …). Each service connects with `search_path=<schema>` (`DATABASE_SCHEMA`).
  - One ordered migration history in `database/migrations/`, run by one migrator
    (`bun run db:migrate`). Files are named `NNNN_<schema>__<change>`.
  - Cross-schema relations are foreign keys. Each service writes only to its own schema, enforced
    in staging/production with a Postgres role per service (write own schema, `select` on what it
    needs elsewhere). See `database/README.md`.
  - The layout is configurable: `DATABASE_URL__<SCHEMA>` moves a schema into another database
    with its own migration history. The migrator rejects foreign keys that would cross databases.
    Services can add other schemas of the same database to `search_path`
    (`DATABASE_EXTRA_SCHEMAS`) for unqualified reads.
  - Outbox/inbox tables stay per schema, so every service relays and de-duplicates its own events.
- **Consequences:**
  - Referential integrity and joins across domains; one backup and one connection target.
  - Services remain separately deployable, but a schema change that another service reads is a
    contract change and must stay backward compatible.
  - Migration order is global. A service's schema must exist before others reference it, which
    the single history guarantees.
  - Splitting a service out later means moving its schema to its own database and replacing its
    foreign keys with ids plus events. Schema-per-service keeps that path open.
