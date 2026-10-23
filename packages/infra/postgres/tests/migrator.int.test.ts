import { afterAll, beforeAll, expect, test } from "bun:test";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeWithDatabase, resetTestDatabase, silentLogger } from "@driversim/testing";
import { Migrator } from "../src/migrator";
import { buildSearchPath, createPostgresClient } from "../src/postgres.client";

const MIGRATIONS_DIR = join(import.meta.dir, "fixtures", "migrations");
import type { SQL } from "bun";

describeWithDatabase("Migrator", () => {
  let sql: SQL;
  let workDir: string;

  beforeAll(async () => {
    sql = await resetTestDatabase(MIGRATIONS_DIR);
    workDir = await mkdtemp(join(tmpdir(), "migrations-"));
    await cp(MIGRATIONS_DIR, workDir, { recursive: true });
  });

  afterAll(async () => {
    await sql?.close();
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  test("status shows every migration applied", async () => {
    const status = await new Migrator(sql, workDir, silentLogger).status();
    expect(status.length).toBeGreaterThanOrEqual(1);
    expect(status.every((entry) => entry.state === "applied")).toBe(true);
  });

  test("up is idempotent", async () => {
    expect(await new Migrator(sql, workDir, silentLogger).up()).toEqual([]);
  });

  test("down then up round-trips the latest migration", async () => {
    const migrator = new Migrator(sql, workDir, silentLogger);
    const [reverted] = await migrator.down(1);
    expect(reverted).toBeDefined();
    expect((await migrator.status()).find((entry) => entry.version === reverted)?.state).toBe("pending");
    expect(await migrator.up()).toEqual([reverted as number]);
  });

  test("concurrent runners never apply a migration twice", async () => {
    const migrator = new Migrator(sql, workDir, silentLogger);
    await migrator.down(1);
    const results = await Promise.all([migrator.up(), new Migrator(sql, workDir, silentLogger).up()]);
    expect(results.flat()).toHaveLength(1);
  });

  test("editing an applied migration is detected as drift", async () => {
    const [first] = (await new Migrator(sql, workDir, silentLogger).status()).slice(0, 1);
    const file = join(workDir, `${String(first?.version).padStart(4, "0")}_${first?.name}.up.sql`);
    await writeFile(file, "-- tampered\nselect 1;\n");
    const migrator = new Migrator(sql, workDir, silentLogger);
    expect((await migrator.status())[0]?.state).toBe("drifted");
    await expect(migrator.up()).rejects.toThrow("checksum drift");
  });
});

describeWithDatabase("search_path", () => {
  test("owned schema first, extra schemas readable unqualified", async () => {
    const admin = await resetTestDatabase(join(import.meta.dir, "fixtures", "migrations"));
    await admin.unsafe(`
      create schema owner_svc; create table owner_svc.things (id int);
      create schema other_svc; create table other_svc.users (id int); insert into other_svc.users values (42);`);
    await admin.close();

    const sql = createPostgresClient({
      url: process.env.TEST_DATABASE_URL ?? "",
      applicationName: "search-path-test",
      poolMax: 1,
      idleTimeoutSeconds: 5,
      connectTimeoutSeconds: 5,
      maxLifetimeSeconds: 60,
      statementTimeoutMs: 5_000,
      schema: "owner_svc",
      extraSchemas: ["other_svc"],
    });
    const [path] = await sql`show search_path`;
    const [user] = await sql`select id from users`;
    await sql`insert into things values (1)`;
    const [owned] = await sql`select count(*)::int as n from owner_svc.things`;
    await sql.close();

    expect(path.search_path.replaceAll(" ", "")).toBe("owner_svc,other_svc");
    expect(user.id).toBe(42);
    expect(owned.n).toBe(1);
  });

  test("buildSearchPath validates and de-duplicates", () => {
    expect(buildSearchPath("a", ["b", "a"])).toBe("a,b");
    expect(buildSearchPath(undefined, [])).toBeUndefined();
    expect(() => buildSearchPath("bad;drop", [])).toThrow("Invalid schema name");
  });
});
