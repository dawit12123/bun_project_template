-- Runs once, when the postgres volume is first created. One database per service (+ _test).
-- `bun run new-service` appends new services here; for an existing volume use `bun run db:ensure`.
create database "service_template";
create database "service_template_test";
