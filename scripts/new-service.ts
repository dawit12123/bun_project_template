/**
 * Creates a standalone service from templates/service.
 *
 *   bun run new-service <name> [--port 4002] [--remove-example] [--description "..."] [--no-register]
 *
 *   --remove-example  drop the example `note` domain (files, wiring, migration, tests)
 *   --no-register     do not touch the shared service registry / local database init script
 */
import { cp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

const ROOT = join(import.meta.dir, "..");
const TEMPLATE_DIR = join(ROOT, "templates", "service");
const SERVICES_DIR = join(ROOT, "services");
const REGISTRY_FILE = join(ROOT, "docs", "SERVICES.md");
const DB_INIT_FILE = join(ROOT, "docker", "postgres", "init", "01-databases.sql");

const TEMPLATE_NAME = "service-template";
const TEMPLATE_DB = "service_template";
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
  "database/migrations/0002_notes.up.sql",
  "database/migrations/0002_notes.down.sql",
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

const serviceReadme = (name: string, port: number, database: string, description: string) => `# ${name}

${description}

Generated from \`templates/service\` — see the monorepo docs for the architecture and conventions.

| | |
|---|---|
| Port | \`${port}\` |
| Database | \`${database}\` (tests: \`${database}_test\`) |
| OpenAPI | http://localhost:${port}/docs |

## Run locally

\`\`\`bash
cp .env.example .env          # adjust if needed
bun run db:ensure             # create the database (once)
bun run db:migrate
bun run db:seed               # optional demo data
bun run dev
\`\`\`

## Checks

\`\`\`bash
bun run typecheck && bun run lint && bun test
TEST_DATABASE_URL=postgres://.../${database}_test bun run test:integration
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
  const database = name.replace(/-/g, "_");
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
        .replaceAll(TEMPLATE_DB, database),
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
  await writeFile(join(target, "README.md"), serviceReadme(name, port, database, description));

  // 4. Normalize formatting (removing example code can leave empty literals behind).
  const biome = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "biome.exe" : "biome");
  if (await exists(biome)) {
    Bun.spawnSync([biome, "check", "--write", target], { stdout: "ignore", stderr: "ignore" });
  }

  // 5. Register the service for local infrastructure.
  if (!values["no-register"]) {
    if (await exists(REGISTRY_FILE)) {
      await rewrite(
        REGISTRY_FILE,
        (content) => `${content.trimEnd()}\n| ${name} | ${port} | ${database} | ${description} |\n`,
      );
    }
    if (await exists(DB_INIT_FILE)) {
      await rewrite(DB_INIT_FILE, (content) =>
        content.includes(`"${database}"`)
          ? content
          : `${content.trimEnd()}\ncreate database "${database}";\ncreate database "${database}_test";\n`,
      );
    }
  }

  console.log(`✔ Created ${relative(ROOT, target)} (port ${port}, database ${database})`);
  console.log(
    values["remove-example"] ? "  example domain removed" : "  example `note` domain kept for reference",
  );
  console.log(`\nNext steps:
  bun install
  cd ${relative(ROOT, target)}
  cp .env.example .env
  bun run db:ensure && bun run db:migrate
  bun run dev`);
};

await main();
