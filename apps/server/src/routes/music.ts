import type { BunRequest } from "bun";
import { type AppContext, json, parseId, readJson, requireAdmin, requireUser } from "../http.ts";

export function musicRoutes({ db, service }: AppContext) {
    return {
        "/api/state": {
            GET: (request: BunRequest) => {
                requireUser(db, request);
                return json(service.publicState());
            }
        },

        "/api/votes": {
            POST: async (request: BunRequest) => {
                const user = requireUser(db, request);
                const personal = await service.vote(user.id);
                return json(personal);
            }
        },

        "/api/search": {
            GET: async (request: BunRequest) => {
                requireUser(db, request);
                const query = new URL(request.url).searchParams.get("q") ?? "";
                const results = await service.search(query);
                return json(results);
            }
        },

        "/api/queue": {
            POST: async (request: BunRequest) => {
                const user = requireUser(db, request);
                const body = await readJson<{ input?: string }>(request);
                const item = await service.addToQueue(user.id, body.input ?? "");
                return json(item, 201);
            }
        },

        "/api/queue/:id": {
            DELETE: async (request: BunRequest<"/api/queue/:id">) => {
                requireAdmin(db, request);
                await service.removeQueueItem(parseId(request.params.id));
                return json({ ok: true });
            }
        }
    };
}
