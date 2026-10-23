import { join } from "node:path";
import { resetTestDatabase as resetWith } from "@driversim/testing";

export { describeWithDatabase, silentLogger } from "@driversim/testing";

export const MIGRATIONS_DIR = join(import.meta.dir, "..", "..", "database", "migrations");

/** Recreates the test database schema from this service's migrations. */
export const resetTestDatabase = () => resetWith(MIGRATIONS_DIR);
