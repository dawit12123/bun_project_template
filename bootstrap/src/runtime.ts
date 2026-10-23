import { type Clock, type LogLevel, type LogSink, type Logger, systemClock } from "@driversim/core";
import { PrometheusMetrics, createJsonLogger } from "@driversim/observability";

export interface RuntimeOptions {
  serviceName: string;
  version: string;
  environment: string;
  log: {
    level: LogLevel | "silent";
    pretty?: boolean;
    /** Replaces stdout, e.g. to capture records in tests. */
    sink?: LogSink;
    /** Domain-specific sensitive field names, in addition to the platform defaults. */
    extraRedactKeys?: readonly string[];
  };
  metrics: { collectDefaults: boolean };
  clock?: Clock;
}

/** Process lifecycle flags shared by health checks and shutdown. */
export interface RuntimeState {
  shuttingDown: boolean;
  readonly startedAt: number;
}

/**
 * Process-wide singletons of a service. Created exactly once at startup by `createRuntime()`
 * and passed to everything that needs them. Nothing else creates loggers, metric registries
 * or clocks.
 */
export interface Runtime {
  readonly serviceName: string;
  readonly version: string;
  readonly environment: string;
  /** Root logger; every record carries service, version and env. Use `.child()` for components. */
  readonly logger: Logger;
  readonly metrics: PrometheusMetrics;
  readonly clock: Clock;
  readonly state: RuntimeState;
}

export const createRuntime = (options: RuntimeOptions): Runtime =>
  Object.freeze({
    serviceName: options.serviceName,
    version: options.version,
    environment: options.environment,
    logger: createJsonLogger({
      level: options.log.level,
      pretty: options.log.pretty,
      sink: options.log.sink,
      extraRedactKeys: options.log.extraRedactKeys,
      base: { service: options.serviceName, version: options.version, env: options.environment },
    }),
    metrics: new PrometheusMetrics({
      serviceName: options.serviceName,
      collectDefaults: options.metrics.collectDefaults,
    }),
    clock: options.clock ?? systemClock,
    state: { shuttingDown: false, startedAt: Date.now() },
  });
