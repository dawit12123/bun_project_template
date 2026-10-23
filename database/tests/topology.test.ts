import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadMigrationFiles } from "@driversim/postgres";
import { assertNoCrossDatabaseReferences, referencedSchemas, resolveTopology } from "../src/topology";

const SHARED = "postgres://u:p@localhost:5433/driversim";
const OTHER = "postgres://u:p@localhost:5433/beta_db";
const fixtures = (name: string) => join(import.meta.dir, "fixtures", name);

describe("resolveTopology", () => {
  test("every schema lives in DATABASE_URL by default", () => {
    const topology = resolveTopology({ DATABASE_URL: SHARED });
    expect(topology.targets).toHaveLength(1);
    expect(topology.urlForSchema("student_service")).toBe(SHARED);
    expect(topology.urlForSchema(undefined)).toBe(SHARED);
  });

  test("DATABASE_URL__<SCHEMA> moves one schema to another database", () => {
    const topology = resolveTopology({ DATABASE_URL: SHARED, DATABASE_URL__BETA: OTHER });
    expect(topology.urlForSchema("beta")).toBe(OTHER);
    expect(topology.urlForSchema("alpha")).toBe(SHARED);
    expect(topology.targets.map((t) => [t.label, t.isDefault, t.schemas])).toEqual([
      ["localhost:5433/driversim", true, []],
      ["localhost:5433/beta_db", false, ["beta"]],
    ]);
  });

  test("labels never contain credentials", () => {
    const [target] = resolveTopology({ DATABASE_URL: SHARED }).targets;
    expect(target?.label).not.toContain("p@");
  });

  test("requires DATABASE_URL", () => {
    expect(() => resolveTopology({})).toThrow("DATABASE_URL");
  });
});

describe("cross-database foreign keys", () => {
  test("references are detected, comments ignored", () => {
    expect(
      referencedSchemas('a uuid references alpha.users (id), b uuid REFERENCES "Gamma"."x"(id)'),
    ).toEqual(["alpha", "gamma"]);
    expect(referencedSchemas("-- references alpha.users (id)\n/* references beta.x */ select 1")).toEqual([]);
  });

  test("FKs between schemas of the same database are allowed", async () => {
    const files = await loadMigrationFiles(fixtures("linked"));
    expect(() =>
      assertNoCrossDatabaseReferences(files, resolveTopology({ DATABASE_URL: SHARED })),
    ).not.toThrow();
  });

  test("an FK into a schema of another database is rejected with the exact migration", async () => {
    const files = await loadMigrationFiles(fixtures("linked"));
    const topology = resolveTopology({ DATABASE_URL: SHARED, DATABASE_URL__BETA: OTHER });
    expect(() => assertNoCrossDatabaseReferences(files, topology)).toThrow(
      '0002_beta__schema: references "alpha" in localhost:5433/driversim, but "beta" lives in localhost:5433/beta_db',
    );
  });

  test("schemas without FKs may live in different databases", async () => {
    const files = await loadMigrationFiles(fixtures("independent"));
    const topology = resolveTopology({ DATABASE_URL: SHARED, DATABASE_URL__BETA: OTHER });
    expect(() => assertNoCrossDatabaseReferences(files, topology)).not.toThrow();
  });
});
