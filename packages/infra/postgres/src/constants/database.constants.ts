export const DATABASE_TABLES = {
  MIGRATIONS: "schema_migrations",
} as const;

/** Key passed to pg_advisory_xact_lock so concurrent migrators never interleave. */
export const MIGRATION_LOCK_KEY = 72_310_001;

export const MIGRATION_FILE_PATTERN = /^(\d{4,})_([a-z0-9_]+)\.(up|down)\.sql$/;

export const POSTGRES_ERROR_CODES = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  SERIALIZATION_FAILURE: "40001",
} as const;
