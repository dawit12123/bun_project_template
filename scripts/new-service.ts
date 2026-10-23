/**
 * Creates a standalone service from templates/service.
 *
 *   bun run new-service <name> [--port 4002] [--remove-example] [--description "..."] [--no-register]
 *
 *   --remove-example  drop the example `note` domain (files, wiring, migration, tests)
 *   --no-register     leave shared files untouched: no registry row, and the schema migrations
 *                     stay inside the service instead of joining database/migrations
 */
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

const ROOT = join(import.meta.dir, "..");
const TEMPLATE_DIR = join(ROOT, "templates", "service");
const SERVICES_DIR = join(ROOT, "services");
const REGISTRY_FILE = join(ROOT, "docs", "SERVICES.md");
const SHARED_MIGRATIONS_DIR = join(ROOT, "database", "migrations");
const MIGRATION_FILE = /^(\d{4,})_([a-z0-9_]+)\.(up|down)\.sql$/;

const TEMPLATE_NAME = "service-template";
const TEMPLATE_SCHEMA = "service_template";
const TEMPLATE_PORT = "4000";
const FIRST_SERVICE_PORT = 4001;
const EXAMPLE_MARKER = "@example-domain";

/** Never copied into a new service. */
const COPY_EXCLUDES = new Set(["node_modules", "openapi", "coverage", ".env", ".env.test", "bun.lock"]);

/** Files and folders that make up the example `note` domain. */
const EXAMPLE_PATHS = [
  "src/constants/note.constants.ts",
  "src/controllers/note.controller.ts",
  "src/dto/note",
  "src/errors/note.errors.ts",
  "src/events/note.events.ts",
  "src/interfaces/note",
  "src/mappers/note.mapper.ts",
  "src/models/note.model.ts",
  "src/models/note-title.model.ts",
  "src/models/note-body.model.ts",
  "src/repositories/postgres/note.repository.ts",
  "src/repositories/postgres/note.unit-of-work.ts",
  "src/repositories/memory/note.repository.ts",
  "src/repositories/memory/note.unit-of-work.ts",
  "src/routes/note.routes.ts",
  "src/seeds/note.seed.ts",
  "src/services/note.service.ts",
  "database/migrations/0002_service_template__notes.up.sql",
  "database/migrations/0002_service_template__notes.down.sql",
  "tests/unit/dto/note.validator.test.ts",
  "tests/unit/models/note.model.test.ts",
  "tests/unit/services/note.service.test.ts",
  "tests/http/note.http.test.ts",
  "tests/integration/note.repository.int.test.ts",
];

const TEXT_EXTENSIONS = /\.(ts|json|md|sql|ya?ml|toml|example|txt)$|Dockerfile$|\.dockerignore$|\.gitignore$/;

const fail = (message: string): never => {
  console.error(`✖ ${message}`);
  process.exit(1);
};

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

async function* walk(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const rewrite = async (path: string, transform: (content: string) => string): Promise<void> => {
  const content = await readFile(path, "utf8");
  const next = transform(content);
  if (next !== content) await writeFile(path, next);
};

const nextFreePort = async (): Promise<number> => {
  if (!(await exists(REGISTRY_FILE))) return FIRST_SERVICE_PORT;
  const ports = [...(await readFile(REGISTRY_FILE, "utf8")).matchAll(/\|\s*(\d{4,5})\s*\|/g)].map((m) =>
    Number(m[1]),
  );
  return Math.max(FIRST_SERVICE_PORT - 1, ...ports) + 1;
};

const removeExampleDomain = async (target: string): Promise<void> => {
  for (const path of EXAMPLE_PATHS) await rm(join(target, path), { recursive: true, force: true });
  // Block markers wrap multi-line code (formatter-safe); line markers tag a single line.
  const block = new RegExp(
    `^[ \\t]*// ${EXAMPLE_MARKER}:start[\\s\\S]*?// ${EXAMPLE_MARKER}:end[^\\n]*\\n`,
    "gm",
  );
  for await (const file of walk(join(target, "src"))) {
    await rewrite(file, (content) =>
      content
        .replace(block, "")
        .split("\n")
        .filter((line) => !line.includes(EXAMPLE_MARKER))
        .join("\n"),
    );
  }
};

/**
 * Appends the service's schema migrations to the shared history (renumbered after the latest
 * version) and points the service's integration tests at that history.
 */
const adoptMigrations = async (target: string, schema: string): Promise<string[]> => {
  const localDir = join(target, "database", "migrations");
  await mkdir(SHARED_MIGRATIONS_DIR, { recursive: true });
  const versions = (await readdir(SHARED_MIGRATIONS_DIR))
    .map((file) => MIGRATION_FILE.exec(file)?.[1])
    .filter((version): version is string => version !== undefined)
    .map(Number);
  let next = Math.max(0, ...versions);
  const renumbered = new Map<string, string>();
  const adopted: string[] = [];

  for (const file of (await readdir(localDir)).sort()) {
    const match = MIGRATION_FILE.exec(file);
    if (!match) continue;
    const [, version, migrationName, direction] = match as unknown as [string, string, string, string];
    if (!renumbered.has(version)) renumbered.set(version, String(++next).padStart(4, "0"));
    const destination = `${renumbered.get(version)}_${migrationName.replace(TEMPLATE_SCHEMA, schema)}.${direction}.sql`;
    await rename(join(localDir, file), join(SHARED_MIGRATIONS_DIR, destination));
    adopted.push(destination);
  }
  await rm(join(target, "database"), { recursive: true, force: true });
  await rewrite(join(target, "tests", "helpers", "test-database.ts"), (content) =>
    content.replace(
      'join(import.meta.dir, "..", "..", "database", "migrations")',
      'join(import.meta.dir, "..", "..", "..", "..", "database", "migrations")',
    ),
  );
  return adopted;
};

const serviceReadme = (name: string, port: number, schema: string, description: string) => `# ${name}

${description}

Generated from \`templates/service\` — see the monorepo docs for the architecture and conventions.

| | |
|---|---|
| Port | \`${port}\` |
| Database schema | \`${schema}\` in the shared \`driversim\` database |
| OpenAPI | http://localhost:${port}/docs |

## Run locally

\`\`\`bash
(cd ../.. && bun run db:migrate)   # shared migration history: database/migrations
cp .env.example .env               # adjust if needed
bun run db:seed                    # optional demo data
bun run dev
\`\`\`

## Checks

\`\`\`bash
bun run typecheck && bun run lint && bun test
TEST_DATABASE_URL=postgres://.../driversim_test bun run test:integration
\`\`\`
`;

const main = async (): Promise<void> => {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      port: { type: "string" },
      description: { type: "string" },
      "remove-example": { type: "boolean", default: false },
      "no-register": { type: "boolean", default: false },
    },
  });

  const name = positionals[0] ?? fail("Usage: bun run new-service <name> [--port N] [--remove-example]");
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) fail(`"${name}" must be kebab-case, e.g. student-service`);
  if (name === TEMPLATE_NAME) fail(`"${name}" is reserved`);

  const target = join(SERVICES_DIR, name);
  if (await exists(target)) fail(`${relative(ROOT, target)} already exists`);

  const port = values.port ? Number(values.port) : await nextFreePort();
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) fail(`invalid port ${values.port}`);
  const schema = name.replace(/-/g, "_");
  const description = values.description ?? `DriverSim ${name}.`;

  // 1. Copy the template.
  await cp(TEMPLATE_DIR, target, {
    recursive: true,
    filter: (source) =>
      !relative(TEMPLATE_DIR, source)
        .split(sep)
        .some((part) => COPY_EXCLUDES.has(part)),
  });

  // 2. Optionally strip the example domain before renaming (markers live in the source).
  if (values["remove-example"]) await removeExampleDomain(target);

  // 3. Rename identifiers, database names and the default port.
  for await (const file of walk(target)) {
    if (!TEXT_EXTENSIONS.test(file)) continue;
    await rewrite(file, (content) =>
      content
        .replaceAll(`@driversim/${TEMPLATE_NAME}`, `@driversim/${name}`)
        .replaceAll(TEMPLATE_NAME, name)
        .replaceAll(TEMPLATE_SCHEMA, schema),
    );
  }
  for (const file of [".env.example", "Dockerfile", "src/config/http.config.ts"]) {
    await rewrite(join(target, file), (content) =>
      content
        .replace(`PORT=${TEMPLATE_PORT}`, `PORT=${port}`)
        .replace(`EXPOSE ${TEMPLATE_PORT}`, `EXPOSE ${port}`)
        .replace(`.default(${TEMPLATE_PORT})`, `.default(${port})`)
        .replace("ARG SERVICE=templates/service", `ARG SERVICE=services/${name}`),
    );
  }
  await rewrite(join(target, "package.json"), (content) => {
    const pkg = JSON.parse(content) as Record<string, unknown>;
    return `${JSON.stringify({ ...pkg, description }, null, 2)}\n`;
  });
  await writeFile(join(target, "README.md"), serviceReadme(name, port, schema, description));

  // 4. Normalize formatting (removing example code can leave empty literals behind).
  const biome = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "biome.exe" : "biome");
  if (await exists(biome)) {
    Bun.spawnSync([biome, "check", "--write", target], { stdout: "ignore", stderr: "ignore" });
  }

  // 5. Join the shared database (migration history) and the service registry.
  let adopted: string[] = [];
  if (!values["no-register"]) {
    adopted = await adoptMigrations(target, schema);
    if (await exists(REGISTRY_FILE)) {
      await rewrite(
        REGISTRY_FILE,
        (content) => `${content.trimEnd()}\n| ${name} | ${port} | ${schema} | ${description} |\n`,
      );
    }
  }

  console.log(`✔ Created ${relative(ROOT, target)} (port ${port}, schema ${schema})`);
  if (adopted.length > 0) console.log(`  added to database/migrations: ${adopted.join(", ")}`);
  console.log(
    values["remove-example"] ? "  example domain removed" : "  example `note` domain kept for reference",
  );
  console.log(`\nNext steps:
  bun install
  bun run db:migrate
  cd ${relative(ROOT, target)}
  cp .env.example .env
  bun run dev`);
};

await main();
