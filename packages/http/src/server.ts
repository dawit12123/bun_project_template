import type { Logger } from "@driversim/core";
import type { Server } from "bun";

export interface HttpServer {
  server: Server;
  /** Stops accepting connections and waits for in-flight requests to finish. */
  stop(): Promise<void>;
}

export const startHttpServer = (
  fetch: (request: Request, server: Server) => Response | Promise<Response>,
  config: { host: string; port: number },
  logger: Logger,
): HttpServer => {
  const server = Bun.serve({ hostname: config.host, port: config.port, fetch });
  logger.info("http server listening", { url: server.url.toString() });
  return {
    server,
    stop: async () => {
      await server.stop(false);
      logger.info("http server stopped");
    },
  };
};
