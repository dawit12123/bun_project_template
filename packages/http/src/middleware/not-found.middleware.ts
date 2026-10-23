import { Errors } from "@driversim/core";
import type { NotFoundHandler } from "hono";
import { toFailureBody } from "../helpers/response.helper";
import type { AppEnv } from "../types/http.interface";

export const notFoundHandler = (): NotFoundHandler<AppEnv> => (c) =>
  c.json(toFailureBody(Errors.notFound("Route not found."), c.get("requestId")), 404);
