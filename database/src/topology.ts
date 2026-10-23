import { type MigrationFile, migrationSchema } from "@driversim/postgres";

/** Env prefix of per-schema overrides: DATABASE_URL__STUDENT_SERVICE=postgres://… */
export const SCHEMA_URL_PREFIX = "DATABASE_URL__";

export interface DatabaseTarget {
  url: string;
  /** Credential-free label for logs, e.g. `localhost:5433/driversim`. */
  label: string;
  /** Schemas explicitly routed here (the default target also receives every other schema). */
  schemas: string[];
  isDefault: boolean;
}

export interface DatabaseTopology {
  targets: DatabaseTarget[];
  urlForSchema(schema: string | undefined): string;
  targetForSchema(schema: string | undefined): DatabaseTarget;
}

export const describeUrl = (url: string): string => {
  const parsed = new URL(url);
  return `${parsed.host}${parsed.pathname}`;
};

/**
 * Where each schema lives. By default every schema is in DATABASE_URL (one shared database).
 * DATABASE_URL__<SCHEMA> moves one schema to another database.
 */
export const resolveTopology = (env: Record<string, string | undefined>): DatabaseTopology => {
  const defaultUrl = env.DATABASE_URL;
  if (!defaultUrl) throw new Error("DATABASE_URL is not set (see the root .env.example)");

  const overrides = new Map<string, string>();
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(SCHEMA_URL_PREFIX) || !value) continue;
    overrides.set(key.slice(SCHEMA_URL_PREFIX.length).toLowerCase(), value);
  }

  const byUrl = new Map<string, DatabaseTarget>();
  const targetFor = (url: string): DatabaseTarget => {
    let target = byUrl.get(url);
    if (!target) {
      target = { url, label: describeUrl(url), schemas: [], isDefault: url === defaultUrl };
      byUrl.set(url, target);
    }
    return target;
  };
  targetFor(defaultUrl);
  for (const [schema, url] of overrides) targetFor(url).schemas.push(schema);

  const urlForSchema = (schema: string | undefined) =>
    (schema !== undefined ? overrides.get(schema) : undefined) ?? defaultUrl;

  return {
    targets: [...byUrl.values()],
    urlForSchema,
    targetForSchema: (schema) => targetFor(urlForSchema(schema)),
  };
};

const SQL_COMMENTS = /--[^\n]*|\/\*[\s\S]*?\*\//g;
const REFERENCED_SCHEMA = /\breferences\s+"?([a-z_][a-z0-9_]*)"?\s*\.\s*"?[a-z_]/gi;

/** Schemas referenced by foreign keys in a migration (comments ignored). */
export const referencedSchemas = (sql: string): string[] => [
  ...new Set(
    [...sql.replace(SQL_COMMENTS, "").matchAll(REFERENCED_SCHEMA)].map((m) => (m[1] ?? "").toLowerCase()),
  ),
];

/**
 * Foreign keys cannot span databases. Fails with every offending migration when a schema
 * references a schema that the topology places in a different database.
 */
export const assertNoCrossDatabaseReferences = (
  files: readonly MigrationFile[],
  topology: DatabaseTopology,
) => {
  const problems: string[] = [];
  for (const file of files) {
    const owner = migrationSchema(file.name);
    const ownerUrl = topology.urlForSchema(owner);
    for (const referenced of referencedSchemas(file.up)) {
      if (referenced === owner || topology.urlForSchema(referenced) === ownerUrl) continue;
      problems.push(
        `${String(file.version).padStart(4, "0")}_${file.name}: references "${referenced}" in ${describeUrl(
          topology.urlForSchema(referenced),
        )}, but "${owner ?? "(unscoped)"}" lives in ${describeUrl(ownerUrl)}`,
      );
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `Foreign keys cannot cross databases. Keep these schemas in the same database or replace the FK with an id + events:\n  - ${problems.join("\n  - ")}`,
    );
  }
};
