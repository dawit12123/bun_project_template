import { createRoute, z } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { API_PREFIX } from "../../src/constants/app.constants";
import { schoolParamSchema } from "../../src/dto/request.dto";
import { getIdentity } from "../../src/guards/identity.accessor";
import { requirePermissions } from "../../src/guards/permissions.guard";
import { requireSchoolAccess } from "../../src/guards/school-access.guard";
import { jsonBody, jsonContent } from "../../src/helpers/openapi.helper";
import { ok } from "../../src/helpers/response.helper";
import { type AppRouter, createRouter } from "../../src/router.factory";
import type { AppEnv } from "../../src/types/http.interface";

/**
 * Test-only routes that exercise the platform (guards, validation, limits, error handling)
 * independently of any business domain, so these tests survive `--remove-example`.
 */
export const PROBE_PERMISSIONS = { READ: "probe:read", ANY_SCHOOL: "probe:any-school" } as const;

const guarded: [MiddlewareHandler<AppEnv>, MiddlewareHandler<AppEnv>] = [
  requireSchoolAccess({ crossSchoolPermission: PROBE_PERMISSIONS.ANY_SCHOOL }),
  requirePermissions(PROBE_PERMISSIONS.READ),
];

const schoolProbe = createRoute({
  method: "get",
  path: "/schools/{schoolId}/probe",
  middleware: guarded,
  request: { params: schoolParamSchema },
  responses: { 200: jsonContent(z.object({ success: z.literal(true), data: z.any(), meta: z.any() }), "ok") },
});

const echoProbe = createRoute({
  method: "post",
  path: "/probe/echo",
  request: { body: jsonBody(z.object({ text: z.string().min(1).max(10_000) })) },
  responses: { 200: jsonContent(z.object({ success: z.literal(true), data: z.any(), meta: z.any() }), "ok") },
});

export const mountProbeRouter = (app: AppRouter): void => {
  const router = createRouter()
    .openapi(schoolProbe, (c) =>
      ok(c, { userId: getIdentity(c).userId, schoolId: c.req.valid("param").schoolId }),
    )
    .openapi(echoProbe, (c) => ok(c, c.req.valid("json")));
  router.get("/probe/fail", () => {
    throw new Error("connection string postgres://user:secret@db");
  });
  app.route(API_PREFIX, router);
};
