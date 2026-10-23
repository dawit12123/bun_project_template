import { swaggerUI } from "@hono/swagger-ui";
import { SYSTEM_ROUTES } from "./constants/app.constants";
import type { AppRouter } from "./router.factory";

export const BEARER_SECURITY = [{ bearerAuth: [] }];

export interface ServiceIdentity {
  serviceName: string;
  version: string;
}

export const buildOpenApiDocument = (app: ServiceIdentity) =>
  ({
    openapi: "3.0.3",
    info: {
      title: `DriverSim ${app.serviceName}`,
      version: app.version,
      description: "Every response uses the envelope `{ success, data | error, meta: { requestId } }`.",
    },
  }) as const;

type OpenApiDocument = ReturnType<AppRouter["getOpenAPIDocument"]>;
const documents = new WeakMap<AppRouter, OpenApiDocument>();

/**
 * The service's OpenAPI document, generated once per app and cached. Call it after all routes
 * are mounted (bootstrap does) so even the first `/openapi.json` request is served from cache.
 */
export const openApiDocument = (router: AppRouter, app: ServiceIdentity): OpenApiDocument => {
  let document = documents.get(router);
  if (!document) {
    document = router.getOpenAPIDocument(buildOpenApiDocument(app));
    documents.set(router, document);
  }
  return document;
};

/** Registers the bearer scheme and exposes `/openapi.json` (+ Swagger UI at `/docs`). */
export const registerOpenApi = (router: AppRouter, app: ServiceIdentity, exposeDocs: boolean): void => {
  router.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Access token issued by auth-service.",
  });
  if (!exposeDocs) return;
  router.get(SYSTEM_ROUTES.OPENAPI, (c) => c.json(openApiDocument(router, app)));
  router.get(SYSTEM_ROUTES.DOCS, swaggerUI({ url: SYSTEM_ROUTES.OPENAPI }));
};
