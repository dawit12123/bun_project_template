import { SQL } from "bun";

/** A connection pool or a transaction — repositories accept either. */
export type SqlClient = SQL;

export interface PostgresClientOptions {
  url: string;
  applicationName: string;
  poolMax: number;
  idleTimeoutSeconds: number;
  connectTimeoutSeconds: number;
  maxLifetimeSeconds: number;
  statementTimeoutMs: number;
  /**
   * The service's own schema. Every connection gets `search_path=<schema>`, so unqualified table
   * names (`notes`, `event_outbox`) resolve to this service's tables. Other schemas are
   * reachable only when referenced explicitly (`auth.users`).
   */
  schema?: string;
  /**
   * Further schemas appended to `search_path` after the owned one, so related tables of other
   * services (same database) can be read unqualified. Writes should still target `schema` only.
   */
  extraSchemas?: readonly string[];
}

/** `search_path` value: owned schema first, then the extra (read) schemas. */
export const buildSearchPath = (
  schema?: string,
  extraSchemas: readonly string[] = [],
): string | undefined => {
  const path = [schema, ...extraSchemas]
    .filter((name): name is string => Boolean(name))
    .map(assertSchemaName);
  return path.length > 0 ? [...new Set(path)].join(",") : undefined;
};

const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

export const assertSchemaName = (schema: string): string => {
  if (!IDENTIFIER_PATTERN.test(schema)) throw new Error(`Invalid schema name "${schema}"`);
  return schema;
};

/** Startup parameters sent on every new connection. */
const connectionParameters = (options: PostgresClientOptions): Record<string, string> => {
  const parameters: Record<string, string> = {
    application_name: options.applicationName,
    statement_timeout: String(options.statementTimeoutMs),
  };
  const searchPath = buildSearchPath(options.schema, options.extraSchemas);
  if (searchPath) parameters.search_path = searchPath;
  return parameters;
};

/** Creates the PostgreSQL connection pool (Bun's native driver). */
export const createPostgresClient = (options: PostgresClientOptions): SqlClient =>
  new SQL({
    url: options.url,
    max: options.poolMax,
    idleTimeout: options.idleTimeoutSeconds,
    connectionTimeout: options.connectTimeoutSeconds,
    maxLifetime: options.maxLifetimeSeconds,
    connection: connectionParameters(options),
  });

const DATABASE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

/**
 * Creates the database named in `url` when it does not exist yet (local/dev convenience).
 * Connects to the `postgres` maintenance database with the same credentials.
 */
export const ensureDatabaseExists = async (url: string): Promise<{ database: string; created: boolean }> => {
  const target = new URL(url);
  const database = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (!DATABASE_NAME_PATTERN.test(database)) throw new Error(`Unsupported database name "${database}"`);

  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  const admin = new SQL({ url: maintenance.toString(), max: 1 });
  try {
    const rows = await admin`select 1 from pg_database where datname = ${database}`;
    if (rows.length > 0) return { database, created: false };
    await admin.unsafe(`create database "${database}"`);
    return { database, created: true };
  } finally {
    await admin.close();
  }
};
