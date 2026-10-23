import type { INoteService } from "@/interfaces/note/service.interface";
import type { noteRoutes } from "@/routes/note.routes";
import { getActionContext } from "@driversim/http";
import { created, noContent, ok, paginated } from "@driversim/http";
import type { AppEnv } from "@driversim/http";
import type { RouteHandler } from "@hono/zod-openapi";

type Routes = typeof noteRoutes;

/** EXAMPLE DOMAIN HTTP adapter: unwraps validated input, calls the use case, shapes the response. */
export class NoteController {
  constructor(private readonly service: INoteService) {}

  create: RouteHandler<Routes["create"], AppEnv> = async (c) => {
    const { schoolId } = c.req.valid("param");
    const note = await this.service.create(getActionContext(c), schoolId, c.req.valid("json"));
    return created(c, note);
  };

  list: RouteHandler<Routes["list"], AppEnv> = async (c) => {
    const { schoolId } = c.req.valid("param");
    const query = c.req.valid("query");
    return paginated(c, await this.service.list(schoolId, query), query.limit);
  };

  get: RouteHandler<Routes["get"], AppEnv> = async (c) => {
    const { schoolId, noteId } = c.req.valid("param");
    return ok(c, await this.service.get(schoolId, noteId));
  };

  update: RouteHandler<Routes["update"], AppEnv> = async (c) => {
    const { schoolId, noteId } = c.req.valid("param");
    return ok(c, await this.service.update(getActionContext(c), schoolId, noteId, c.req.valid("json")));
  };

  remove: RouteHandler<Routes["remove"], AppEnv> = async (c) => {
    const { schoolId, noteId } = c.req.valid("param");
    await this.service.delete(getActionContext(c), schoolId, noteId, c.req.valid("query").version);
    return noContent(c);
  };
}
