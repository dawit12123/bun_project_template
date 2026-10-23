import type { IdentityType } from "@driversim/core";
import { Errors } from "@driversim/core";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/http.interface";
import { getIdentity } from "./identity.accessor";

/** Restricts a route to specific identity types (e.g. only `platform_admin`). */
export const requireIdentityTypes =
  (...types: IdentityType[]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    if (!types.includes(getIdentity(c).identityType)) throw Errors.forbidden();
    await next();
  };
