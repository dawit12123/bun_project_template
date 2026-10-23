/**
 * Runs services from the repository root.
 *
 *   bun run dev                       every service in watch mode (prefixed, coloured logs)
 *   bun run dev auth-service          one or more named services
 *   bun run start [service…]          same, without watch mode
 *   bun run services                  list services, ports and .env status
 *   bun run setup                     first-time setup: root + service .env files, database, migrations
 *
 * Each service loads the root .env (shared) and then its own .env (overrides), and runs from the
 * repo root, so watch mode also
 * reloads on shared-code changes. When `services/` is empty (the blueprint repo) the template
 * service is used instead.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const COLORS = [36, 35, 33, 32, 34, 91, 96, 95];

interface ServiceInfo {
  name: string;
  dir: string;
  port: string;
  hasEnv: boolean;
}

const readPort = (dir: string): string => {
  for (const file of [".env", ".env.example"]) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    const match = /^PORT=(\d+)/m.exec(readFileSync(path, "utf8"));
    if (match?.[1]) return match[1];
  }
  return "?";
};

const describe = (name: string, dir: string): ServiceInfo => ({
  name,
  dir,
  port: readPort(dir),
  hasEnv: existsSync(join(dir, ".env")),
});

/** Generated services, or the template when there are none (blueprint repo). */
const discover = (): ServiceInfo[] => {
  const servicesDir = join(ROOT, "services");
  const services = existsSync(servicesDir)
    ? readdirSync(servicesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(servicesDir, entry.name, "package.json")))
        .map((entry) => describe(entry.name, join(servicesDir, entry.name)))
    : [];
  const template = join(ROOT, "templates", "service");
  if (services.length === 0 && existsSync(template)) return [describe("service-template", template)];
  return services;
};

const select = (all: ServiceInfo[], names: string[]): ServiceInfo[] => {
  if (names.length === 0) return all;
  const template = join(ROOT, "templates", "service");
  return names.map((name) => {
    const found = all.find((service) => service.name === name);
    if (found) return found;
    if ((name === "service-template" || name === "template") && existsSync(template)) {
      return describe("service-template", template);
    }
    console.error(`✖ Unknown service "${name}". Available: ${all.map((s) => s.name).join(", ") || "(none)"}`);
    process.exit(1);
  });
};

const prefixLines = (label: string, color: number, chunk: string, carry: { rest: string }): string => {
  const text = carry.rest + chunk;
  const lines = text.split("\n");
  carry.rest = lines.pop() ?? "";
  return lines.map((line) => `\x1b[${color}m${label}\x1b[0m ${line}\n`).join("");
};

const pipe = async (
  stream: ReadableStream<Uint8Array>,
  label: string,
  color: number,
  out: NodeJS.WriteStream,
) => {
  const decoder = new TextDecoder();
  const carry = { rest: "" };
  for await (const chunk of stream) out.write(prefixLines(label, color, decoder.decode(chunk), carry));
  if (carry.rest) out.write(`\x1b[${color}m${label}\x1b[0m ${carry.rest}\n`);
};

const run = async (script: "dev" | "start", services: ServiceInfo[]): Promise<void> => {
  if (services.length === 0) {
    console.error("✖ No services found. Create one with: bun run new-service <name> --remove-example");
    process.exit(1);
  }
  const missing = services.filter((service) => !service.hasEnv);
  if (!existsSync(join(ROOT, ".env"))) {
    console.error("✖ Missing root .env (shared settings). Run: bun run setup");
    process.exit(1);
  }
  if (missing.length > 0) {
    console.error(`✖ Missing .env for: ${missing.map((s) => s.name).join(", ")}. Run: bun run setup`);
    process.exit(1);
  }

  const width = Math.max(...services.map((service) => service.name.length));
  console.log(
    services
      .map((service) => `▶ ${service.name.padEnd(width)}  http://localhost:${service.port}/docs`)
      .join("\n"),
  );

  const children = services.map((service, index) => {
    const label = `[${service.name.padEnd(width)}]`;
    const color = COLORS[index % COLORS.length] ?? 36;
    // Started from the repo root with the service's own .env: watch mode then also reloads on
    // changes in bootstrap/ and packages/ (a service-folder cwd would only watch the service).
    const entry = join(service.dir, "src", "main.ts");
    const envFile = join(service.dir, ".env");
    // Root .env first (shared settings), then the service's .env (overrides).
    const envFiles = ["--env-file", join(ROOT, ".env"), "--env-file", envFile];
    const cmd = script === "dev" ? ["bun", "--watch", ...envFiles, entry] : ["bun", ...envFiles, entry];
    const child = Bun.spawn(cmd, {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, FORCE_COLOR: "1" },
    });
    void pipe(child.stdout, label, color, process.stdout);
    void pipe(child.stderr, label, color, process.stderr);
    return { service, child };
  });

  let stopping = false;
  const stopAll = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    for (const { child } of children) child.kill(signal);
  };
  process.on("SIGINT", () => stopAll("SIGINT"));
  process.on("SIGTERM", () => stopAll("SIGTERM"));

  // When one service exits on its own (e.g. bad config), stop the others too.
  const first = await Promise.race(
    children.map(async ({ service, child }) => ({ service, code: await child.exited })),
  );
  if (!stopping) {
    console.error(`■ ${first.service.name} exited with code ${first.code}; stopping the others`);
    stopAll("SIGTERM");
  }
  await Promise.all(children.map(({ child }) => child.exited));
  process.exit(first.code ?? 0);
};

const exec = async (cmd: string[], cwd: string): Promise<void> => {
  const code = await Bun.spawn(cmd, { cwd, stdout: "inherit", stderr: "inherit" }).exited;
  if (code !== 0) {
    console.error(`✖ ${cmd.join(" ")} failed (exit ${code})`);
    process.exit(code);
  }
};

/** Copies missing .env files from their examples, creates the database(s) and migrates. */
const setup = async (): Promise<void> => {
  const targets = [
    { name: "root (shared settings)", dir: ROOT },
    ...discover().map((service) => ({ name: service.name, dir: service.dir })),
  ];
  for (const target of targets) {
    const env = join(target.dir, ".env");
    const example = join(target.dir, ".env.example");
    if (!existsSync(env) && existsSync(example)) {
      await copyFile(example, env);
      console.log(`✔ ${target.name}: created .env from .env.example (review DATABASE_URL & secrets)`);
    } else if (existsSync(env)) {
      console.log(`• ${target.name}: .env already present`);
    }
  }
  await exec(["bun", "run", "db:ensure"], ROOT);
  if (
    existsSync(join(ROOT, "services")) &&
    readdirSync(join(ROOT, "services")).some((n) => n !== ".gitkeep")
  ) {
    await exec(["bun", "run", "db:migrate"], ROOT);
  } else {
    // Blueprint repo: apply the template's blueprint migrations so it can run.
    await exec(
      [
        "bun",
        "--env-file",
        ".env",
        "--env-file",
        "database/.env",
        "database/scripts/migrate.ts",
        "up",
        "--dir",
        "templates/service/database/migrations",
      ],
      ROOT,
    );
  }
  console.log("\n✔ Setup complete. Start everything with: bun run dev");
};

const list = (): void => {
  const services = discover();
  if (services.length === 0) {
    console.log("No services yet. Create one with: bun run new-service <name> --remove-example");
    return;
  }
  const width = Math.max(...services.map((service) => service.name.length));
  for (const service of services) {
    console.log(
      `${service.name.padEnd(width)}  port ${service.port.padEnd(5)}  ${service.hasEnv ? ".env ✔" : ".env missing (bun run setup)"}`,
    );
  }
};

const [command, ...names] = process.argv.slice(2);
switch (command) {
  case "dev":
  case "start":
    await run(command, select(discover(), names));
    break;
  case "list":
    list();
    break;
  case "setup":
    await setup();
    break;
  default:
    console.error("Usage: bun scripts/run.ts <dev|start|list|setup> [service…]");
    process.exit(1);
}
