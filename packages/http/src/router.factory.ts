import { zodIssuesToFieldIssues } from "@driversim/core";
import { Errors } from "@driversim/core";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "./types/http.interface";

const TARGET_PREFIX: Record<string, string> = {
  json: "body",
  form: "body",
  query: "query",
  param: "params",
  header: "headers",
  cookie: "cookies",
};

/**
 * Creates an OpenAPI-aware router whose request validation failures become the standard
 * VALIDATION_FAILED error response (422) with field-level details.
 */
export const createRouter = () =>
  new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) {
        const target = "target" in result ? String(result.target) : undefined;
        throw Errors.validation(
          zodIssuesToFieldIssues(result.error, target ? TARGET_PREFIX[target] : undefined),
        );
      }
    },
  });

export type AppRouter = ReturnType<typeof createRouter>;
