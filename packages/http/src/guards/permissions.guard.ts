import { Errors } from "@driversim/core";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/http.interface";
import { getIdentity } from "./identity.accessor";

/** Caller must hold every listed permission. */
export const requirePermissions =
  (...permissions: string[]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const identity = getIdentity(c);
    if (!permissions.every((permission) => identity.permissions.has(permission))) throw Errors.forbidden();
    await next();
  };

/** Caller must hold at least one of the listed permissions. */
export const requireAnyPermission =
  (...permissions: string[]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const identity = getIdentity(c);
    if (!permissions.some((permission) => identity.permissions.has(permission))) throw Errors.forbidden();
    await next();
  };
