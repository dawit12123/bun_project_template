# service-template

Blueprint for DriverSim services. It holds domain code and wiring only; the platform comes
from `packages/@driversim/*`. It is runnable and fully tested, and shows every pattern through
the example `note` domain. Don't add business features here: generate a service with
`bun run new-service <name>` from the repository root.

| | |
|---|---|
| Port | `4000` |
| Database schema | `service_template` (blueprint migrations in `database/migrations`, adopted into the shared history by `new-service`) |
| OpenAPI | http://localhost:4000/docs |

## Run

```bash
cp .env.example .env
# apply the blueprint migrations to your local database (template only)
(cd ../../database && bun scripts/migrate.ts up --dir ../templates/service/database/migrations)
bun run db:seed
bun run dev
```

To run without any infrastructure, leave `DATABASE_URL`, `REDIS_URL` and `KAFKA_BROKERS` empty
and set `AUTH_JWKS_JSON={"keys":[]}`.

## Test

```bash
bun test                                                   # unit + HTTP (in-memory)
TEST_DATABASE_URL=postgres://…/driversim_test bun test   # + Postgres integration
```

See `../../docs/ARCHITECTURE.md` for the layout and dependency rules.
