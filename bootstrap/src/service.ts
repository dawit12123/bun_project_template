import { ConfigError, StartupError, type StartupReport } from "@driversim/core";
import { type AppRouter, type HttpServer, openApiDocument, startHttpServer } from "@driversim/http";
import { type Runtime, type RuntimeOptions, createRuntime } from "./runtime";
import { registerGracefulShutdown } from "./shutdown";

/** A long-running process inside the service (outbox relay, event consumer, scheduler, …). */
export interface BackgroundWorker {
  name: string;
  start(): void | Promise<void>;
  stop(): Promise<void>;
}

/** What `startService` needs from a service's composition root. */
export interface ServiceContainer {
  /** Logged once at startup, e.g. which adapters (postgres/memory, …) were selected. */
  readonly adapters?: Readonly<Record<string, string>>;
  /** Started after initialization, stopped (in reverse order) before resources close. */
  readonly workers: readonly BackgroundWorker[];
  /** Opens connections and prefetches; rejects with StartupError on critical failures. */
  initialize(): Promise<StartupReport>;
  close(): Promise<void>;
}

export interface ServiceHttpOptions {
  host: string;
  port: number;
  apiDocsEnabled: boolean;
  shutdownTimeoutMs: number;
}

/** Each service declares WHAT it consists of; `startService` owns HOW it starts and stops. */
export interface ServiceDefinition<TConfig, TContainer extends ServiceContainer> {
  loadConfig(): TConfig;
  runtimeOptions(config: TConfig): RuntimeOptions;
  createContainer(config: TConfig, runtime: Runtime): TContainer;
  createApp(container: TContainer, runtime: Runtime): AppRouter;
  http(config: TConfig): ServiceHttpOptions;
}

export interface RunningService<TContainer> {
  runtime: Runtime;
  container: TContainer;
  app: AppRouter;
  server: HttpServer;
  /** Graceful shutdown (also triggered by SIGTERM/SIGINT unless disabled). */
  shutdown(reason?: string): Promise<void>;
}

export interface StartServiceOptions {
  handleSignals?: boolean;
  exit?: (code: number) => void;
}

/**
 * The single startup sequence shared by every DriverSim service. Everything is created ONCE:
 *
 *   config → runtime (logger, metrics, clock) → container (adapters, services)
 *   → initialize() (connections, key prefetch) → app (+ cached OpenAPI) → workers → listen
 *
 * Requests only reuse these instances. Shutdown runs in reverse: stop accepting traffic → stop
 * workers → close connections.
 */
export const startService = async <TConfig, TContainer extends ServiceContainer>(
  definition: ServiceDefinition<TConfig, TContainer>,
  options: StartServiceOptions = {},
): Promise<RunningService<TContainer>> => {
  const config = definition.loadConfig();
  const runtime = createRuntime(definition.runtimeOptions(config));
  const { logger } = runtime;

  const container = definition.createContainer(config, runtime);
  if (container.adapters) logger.info("adapters selected", { ...container.adapters });
  try {
    logger.info("dependencies initialized", { ...(await container.initialize()) });
  } catch (error) {
    await container.close();
    throw error;
  }

  const http = definition.http(config);
  const app = definition.createApp(container, runtime);
  if (http.apiDocsEnabled)
    openApiDocument(app, { serviceName: runtime.serviceName, version: runtime.version });

  for (const worker of container.workers) {
    await worker.start();
    logger.debug("worker started", { worker: worker.name });
  }

  const server = startHttpServer(app.fetch, http, logger);
  logger.info("service ready", { startupMs: Date.now() - runtime.state.startedAt });

  const shutdown = registerGracefulShutdown({
    logger,
    timeoutMs: http.shutdownTimeoutMs,
    handleSignals: options.handleSignals,
    exit: options.exit,
    onBegin: () => {
      runtime.state.shuttingDown = true;
    },
    steps: [
      { name: "http", run: () => server.stop() },
      ...[...container.workers].reverse().map((worker) => ({ name: worker.name, run: () => worker.stop() })),
      { name: "resources", run: () => container.close() },
    ],
  });

  return { runtime, container, app, server, shutdown: (reason = "manual") => shutdown(reason) };
};

/** Fatal startup errors as one JSON line on stderr (the logger may not exist yet). */
export const describeFatalError = (error: unknown): Record<string, unknown> => {
  if (error instanceof ConfigError) return { msg: "invalid configuration", issues: error.issues };
  if (error instanceof StartupError)
    return { msg: "a critical dependency is unreachable", startup: error.report };
  return { msg: "startup failed", error: error instanceof Error ? error.message : String(error) };
};

/** Entry point for `main.ts`: start the service or exit(1) with a readable reason. */
export const runService = <TConfig, TContainer extends ServiceContainer>(
  definition: ServiceDefinition<TConfig, TContainer>,
): void => {
  startService(definition).catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ time: new Date().toISOString(), level: "fatal", ...describeFatalError(error) })}\n`,
    );
    process.exit(1);
  });
};
