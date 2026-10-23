/**
 * Writes the OpenAPI document to openapi/openapi.json without starting the server or touching
 * external services (memory adapters + a throwaway key set).
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createApp } from "@/bootstrap/app";
import { toRuntimeOptions } from "@/bootstrap/bootstrap";
import { createContainer } from "@/bootstrap/container";
import { loadConfig } from "@/config";
import { createRuntime } from "@driversim/bootstrap";
import { openApiDocument } from "@driversim/http";

const config = loadConfig({
  ...process.env,
  NODE_ENV: "development",
  DATABASE_URL: "",
  REDIS_URL: "",
  KAFKA_BROKERS: "",
  API_DOCS_ENABLED: "true",
  AUTH_JWKS_URL: "",
  AUTH_JWKS_JSON: JSON.stringify({ keys: [] }),
});
const runtime = createRuntime({ ...toRuntimeOptions(config), log: { level: "silent" } });
const container = createContainer(config, runtime);
const document = openApiDocument(createApp(container, runtime), {
  serviceName: runtime.serviceName,
  version: runtime.version,
});

const outDir = join(import.meta.dir, "..", "openapi");
await mkdir(outDir, { recursive: true });
const outFile = join(outDir, "openapi.json");
await Bun.write(outFile, `${JSON.stringify(document, null, 2)}\n`);
await container.close();
console.log(`wrote ${outFile}`);
