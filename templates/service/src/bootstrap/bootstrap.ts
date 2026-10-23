import { loadConfig } from "@/config";
import { startHttpServer } from "@driversim/http";
import { createJsonLogger } from "@driversim/observability";
import { type AppState, createApp } from "./app";
import { createContainer } from "./container";
import { registerGracefulShutdown } from "./shutdown";

/** Starts the service: config → logger → container → HTTP → background workers → signals. */
export const bootstrap = async (): Promise<void> => {
  const config = loadConfig();
  const logger = createJsonLogger({
    level: config.logger.level,
    pretty: config.logger.pretty,
    base: { service: config.app.serviceName, version: config.app.version, env: config.app.env },
  });

  const container = createContainer(config, logger);
  logger.info("adapters selected", container.adapters);

  const state: AppState = { shuttingDown: false, startedAt: Date.now() };
  const app = createApp(container, state);
  const http = startHttpServer(app.fetch, config.http, logger);

  if (config.outbox.relayEnabled) container.outboxRelay.start();
  if (container.consumer) await container.consumer.start();

  registerGracefulShutdown({
    logger,
    timeoutMs: config.app.shutdownTimeoutMs,
    onBegin: () => {
      state.shuttingDown = true;
    },
    steps: [
      { name: "http", run: () => http.stop() },
      { name: "consumer", run: async () => container.consumer?.stop() },
      { name: "outbox-relay", run: () => container.outboxRelay.stop() },
      { name: "resources", run: () => container.close() },
    ],
  });
};
