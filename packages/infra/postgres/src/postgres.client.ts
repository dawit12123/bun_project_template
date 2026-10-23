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
}

/** Creates the PostgreSQL connection pool (Bun's native driver). */
export const createPostgresClient = (options: PostgresClientOptions): SqlClient =>
  new SQL({
    url: options.url,
    max: options.poolMax,
    idleTimeout: options.idleTimeoutSeconds,
    connectionTimeout: options.connectTimeoutSeconds,
    maxLifetime: options.maxLifetimeSeconds,
    connection: {
      application_name: options.applicationName,
      statement_timeout: String(options.statementTimeoutMs),
    },
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
