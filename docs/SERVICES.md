# Service registry

Local ports and database schemas. All services share the `driversim` database, and each owns one
schema. `bun run new-service` appends a row.

| Service | Port | Schema | Description |
|---|---|---|---|
| service-template | 4000 | service_template | Blueprint (templates/service) |
