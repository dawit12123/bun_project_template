/**
 * Writes the OpenAPI document to openapi/openapi.json without starting the server or touching
 * external services (memory adapters + a throwaway key set).
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createApp } from "@/bootstrap/app";
import { createContainer } from "@/bootstrap/container";
import { loadConfig } from "@/config";
import { SYSTEM_ROUTES } from "@driversim/http";
import { createJsonLogger } from "@driversim/observability";

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
const container = createContainer(config, createJsonLogger({ level: "silent" }));
const response = await createApp(container).request(SYSTEM_ROUTES.OPENAPI);
if (!response.ok) throw new Error(`OpenAPI generation failed with HTTP ${response.status}`);

const outDir = join(import.meta.dir, "..", "openapi");
await mkdir(outDir, { recursive: true });
const outFile = join(outDir, "openapi.json");
await Bun.write(outFile, `${JSON.stringify(await response.json(), null, 2)}\n`);
await container.close();
console.log(`wrote ${outFile}`);
