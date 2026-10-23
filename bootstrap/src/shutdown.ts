import type { Logger } from "@driversim/core";

export interface ShutdownStep {
  name: string;
  run: () => Promise<void>;
}

export interface GracefulShutdownOptions {
  logger: Logger;
  timeoutMs: number;
  /** Called first, e.g. to fail readiness so the load balancer stops routing traffic. */
  onBegin: () => void;
  steps: readonly ShutdownStep[];
  exit?: (code: number) => void;
  /** Listen for SIGTERM/SIGINT (default). Tests disable it and call the returned function. */
  handleSignals?: boolean;
}

/**
 * SIGTERM/SIGINT handling: fail readiness → run steps in order (stop HTTP, consumers, relay,
 * then close connections) → exit. A watchdog forces exit if a step hangs.
 */
export const registerGracefulShutdown = (options: GracefulShutdownOptions) => {
  const exit = options.exit ?? ((code: number) => process.exit(code));
  let started = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (started) return;
    started = true;
    options.onBegin();
    options.logger.info("shutdown started", { signal });

    const watchdog = setTimeout(() => {
      options.logger.fatal("shutdown timed out; forcing exit", { timeoutMs: options.timeoutMs });
      exit(1);
    }, options.timeoutMs);

    let failed = false;
    for (const step of options.steps) {
      try {
        await step.run();
        options.logger.debug("shutdown step completed", { step: step.name });
      } catch (error) {
        failed = true;
        options.logger.error("shutdown step failed", { step: step.name, err: error });
      }
    }
    clearTimeout(watchdog);
    options.logger.info("shutdown complete");
    exit(failed ? 1 : 0);
  };

  if (options.handleSignals !== false) {
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
  }
  return shutdown;
};
