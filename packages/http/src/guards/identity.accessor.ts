import { Errors } from "@driversim/core";
import type { ActionContext, AuthIdentity } from "@driversim/core";
import type { Context } from "hono";
import type { AppEnv } from "../types/http.interface";

/** The verified caller. Throws if a route forgot the `authenticate` guard. */
export const getIdentity = (c: Context<AppEnv>): AuthIdentity => {
  const identity = c.get("identity");
  if (!identity) throw Errors.unauthenticated();
  return identity;
};

/** Actor + correlation id handed to services for auditing and event metadata. */
export const getActionContext = (c: Context<AppEnv>): ActionContext => ({
  actor: getIdentity(c),
  correlationId: c.get("correlationId"),
});
