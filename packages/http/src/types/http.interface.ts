import type { AuthIdentity } from "@driversim/core";
import type { Logger } from "@driversim/core";

/** Values attached to every request by middleware and guards. */
export interface AppVariables {
  requestId: string;
  correlationId: string;
  logger: Logger;
  /** Present only after the `authenticate` guard succeeded. */
  identity?: AuthIdentity;
}

/** Hono environment type used by every router, middleware and handler of the service. */
export interface AppEnv {
  Variables: AppVariables;
}
