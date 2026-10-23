-- Runs once, when the postgres volume is first created.
-- The platform uses ONE database ("driversim", created via POSTGRES_DB) with one schema per
-- service; schemas and tables come from the shared migrations (bun run db:migrate).
create database "driversim_test";
