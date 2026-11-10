import type { BunRequest } from "bun";
import type { Branding, Settings } from "@office-music/shared";
import { createUser, deleteUser, listUsers, setPassword, updateUserFlags } from "../users.ts";
import { getControllerToken, getSettings, updateBranding, regenerateControllerToken, updateSettings } from "../settings.ts";
import { type AppContext, HttpError, json, parseId, readJson, requireAdmin } from "../http.ts";

export function adminRoutes({ db, service, hub }: AppContext) {
    return {
        "/api/admin/users": {
            GET: (request: BunRequest) => {
                requireAdmin(db, request);
                return json(listUsers(db));
            },
            POST: async (request: BunRequest) => {
                requireAdmin(db, request);
                const body = await readJson<{ username?: string; password?: string; isAdmin?: boolean }>(request);
                const user = await createUser(db, body.username ?? "", body.password ?? "", body.isAdmin === true);
                return json(user, 201);
            }
        },

        "/api/admin/users/:id": {
            PATCH: async (request: BunRequest<"/api/admin/users/:id">) => {
                const admin = requireAdmin(db, request);
                const userId = parseId(request.params.id);
                const body = await readJson<{ isAdmin?: boolean; disabled?: boolean; password?: string }>(request);

                if (userId === admin.id && (body.isAdmin === false || body.disabled === true)) {
                    throw new HttpError(400, "You can't remove your own admin access or disable yourself");
                }

                updateUserFlags(db, userId, { isAdmin: body.isAdmin, disabled: body.disabled });
                if (body.password !== undefined) {
                    await setPassword(db, userId, body.password);
                }
                return json({ ok: true });
            },
            DELETE: (request: BunRequest<"/api/admin/users/:id">) => {
                const admin = requireAdmin(db, request);
                const userId = parseId(request.params.id);
                if (userId === admin.id) {
                    throw new HttpError(400, "You can't delete yourself");
                }
                deleteUser(db, userId);
                return json({ ok: true });
            }
        },

        "/api/admin/settings": {
            GET: (request: BunRequest) => {
                requireAdmin(db, request);
                return json({ settings: getSettings(db), controllerToken: getControllerToken(db), controllerOnline: hub.online });
            },
            PUT: async (request: BunRequest) => {
                requireAdmin(db, request);
                const body = await readJson<Partial<Settings>>(request);
                const settings = updateSettings(db, body);
                service.notifyChanged();
                return json({ settings, controllerToken: getControllerToken(db), controllerOnline: hub.online });
            }
        },

        "/api/admin/branding": {
            PUT: async (request: BunRequest) => {
                requireAdmin(db, request);
                const body = await readJson<Partial<Branding>>(request);
                const branding = updateBranding(db, body);
                return json(branding);
            }
        },

        "/api/admin/controller-token": {
            POST: (request: BunRequest) => {
                requireAdmin(db, request);
                const controllerToken = regenerateControllerToken(db);
                return json({ settings: getSettings(db), controllerToken, controllerOnline: hub.online });
            }
        }
    };
}
