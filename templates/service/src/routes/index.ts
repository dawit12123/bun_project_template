import { NoteController } from "@/controllers/note.controller"; // @example-domain
import type { INoteService } from "@/interfaces/note/service.interface"; // @example-domain
import { API_PREFIX, type AppRouter } from "@driversim/http";
import { createNoteRouter } from "./note.routes"; // @example-domain

/** Use cases exposed over HTTP, one entry per domain. */
export interface RouteServices {
  // @example-domain:start
  note: INoteService;
  // @example-domain:end
  [domain: string]: unknown;
}

/** One factory per domain router; add yours here. */
const routerFactories: Array<(services: RouteServices) => AppRouter> = [
  // @example-domain:start
  (services) => createNoteRouter(new NoteController(services.note)),
  // @example-domain:end
];

/**
 * Mounts this service's domain routers under the API prefix. Health, metrics, docs and
 * authentication are already registered by `createHttpApp`.
 */
export const registerRoutes = (app: AppRouter, services: RouteServices): void => {
  for (const createRouter of routerFactories) app.route(API_PREFIX, createRouter(services));
};
