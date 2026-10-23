import { join } from "node:path";
import { resetTestDatabase as resetWith, testDatabaseUrlFor } from "@driversim/testing";

export { describeWithDatabase, silentLogger } from "@driversim/testing";

/** This service's schema; repositories use unqualified table names through `search_path`. */
export const SCHEMA = "service_template";

/** This service's own test database (derived from the shared TEST_DATABASE_URL). */
export const TEST_DATABASE_URL = testDatabaseUrlFor(SCHEMA);

/** Migration history applied to the test database (the generator points it at database/migrations). */
export const MIGRATIONS_DIR = join(import.meta.dir, "..", "..", "database", "migrations");

/** Recreates the test database from the migrations and connects with this service's schema. */
export const resetTestDatabase = () => resetWith(MIGRATIONS_DIR, { schema: SCHEMA, url: TEST_DATABASE_URL });
