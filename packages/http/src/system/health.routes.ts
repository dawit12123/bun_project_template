import { createRoute } from "@hono/zod-openapi";
import { SYSTEM_ROUTES } from "../constants/app.constants";
import { livenessResponseSchema, readinessResponseSchema } from "../dto/health.dto";
import { jsonContent } from "../helpers/openapi.helper";
import { createRouter } from "../router.factory";
import type { HealthController } from "./health.controller";

const tags = ["System"];

export const healthRoutes = {
  live: createRoute({
    method: "get",
    path: SYSTEM_ROUTES.LIVENESS,
    tags,
    summary: "Liveness probe",
    responses: { 200: jsonContent(livenessResponseSchema, "Process is alive") },
  }),
  ready: createRoute({
    method: "get",
    path: SYSTEM_ROUTES.READINESS,
    tags,
    summary: "Readiness probe",
    responses: {
      200: jsonContent(readinessResponseSchema, "Ready to receive traffic"),
      503: jsonContent(readinessResponseSchema, "A critical dependency is down or the instance is draining"),
    },
  }),
};

export const createHealthRouter = (controller: HealthController) =>
  createRouter().openapi(healthRoutes.live, controller.live).openapi(healthRoutes.ready, controller.ready);
