import { type Config, loadConfig } from "@/config";
import type { RuntimeOptions, ServiceDefinition } from "@driversim/bootstrap";
import { createApp } from "./app";
import { type Container, createContainer } from "./container";

/** Maps this service's config onto the shared runtime (logger, metrics, clock). */
export const toRuntimeOptions = (config: Config): RuntimeOptions => ({
  serviceName: config.app.serviceName,
  version: config.app.version,
  environment: config.app.env,
  log: { level: config.logger.level, pretty: config.logger.pretty },
  metrics: { collectDefaults: config.metrics.collectDefaults },
});

/**
 * WHAT this service consists of. HOW it starts (config → runtime → container → initialize →
 * app → workers → listen) and stops is shared by every service in `@driversim/bootstrap`.
 */
export const serviceDefinition: ServiceDefinition<Config, Container> = {
  loadConfig: () => loadConfig(),
  runtimeOptions: toRuntimeOptions,
  createContainer: (config, runtime) => createContainer(config, runtime),
  createApp: (container, runtime) => createApp(container, runtime),
  http: (config) => ({
    host: config.http.host,
    port: config.http.port,
    apiDocsEnabled: config.http.apiDocsEnabled,
    shutdownTimeoutMs: config.app.shutdownTimeoutMs,
  }),
};
