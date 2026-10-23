import type { Context } from "hono";

/**
 * Route template (e.g. `/api/v1/schools/:schoolId/students`) of the matched endpoint. Used for
 * metric labels and logs so ids never explode label cardinality.
 */
export const routeLabel = (c: Context): string => {
  const endpoint = c.req.matchedRoutes.filter((route) => route.method !== "ALL").at(-1);
  return endpoint?.path ?? "unmatched";
};
