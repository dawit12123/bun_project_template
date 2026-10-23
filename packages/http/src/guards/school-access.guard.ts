import { Errors } from "@driversim/core";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/http.interface";
import { getIdentity } from "./identity.accessor";

export interface SchoolAccessOptions {
  /** Path parameter holding the target school id. */
  param?: string;
  /** Permission that grants access to every school (platform-level operators). */
  crossSchoolPermission?: string;
}

/**
 * Tenant isolation: the school in the URL must be the school the session is scoped to.
 * Changing `schoolId` in the URL can never reach another school's data.
 */
export const requireSchoolAccess =
  ({ param = "schoolId", crossSchoolPermission }: SchoolAccessOptions = {}): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const identity = getIdentity(c);
    const schoolId = c.req.param(param);
    if (!schoolId) throw Errors.badRequest(`Missing path parameter "${param}".`);

    const sameSchool = identity.schoolId !== null && identity.schoolId === schoolId;
    const crossSchool =
      crossSchoolPermission !== undefined && identity.permissions.has(crossSchoolPermission);
    if (!sameSchool && !crossSchool) throw Errors.forbidden("You do not have access to this school.");
    await next();
  };
