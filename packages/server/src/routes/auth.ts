import type { BunRequest } from "bun";
import { changePassword, createSession, deleteSession, verifyLogin } from "../users.ts";
import { type AppContext, HttpError, SESSION_COOKIE, isSecureRequest, json, readJson, requireUser } from "../http.ts";

export function authRoutes({ db, service }: AppContext) {
    return {
        "/api/auth/login": {
            POST: async (request: BunRequest) => {
                const body = await readJson<{ username?: string; password?: string }>(request);
                const user = await verifyLogin(db, body.username ?? "", body.password ?? "");
                if (!user) {
                    throw new HttpError(401, "Incorrect username or password");
                }

                const session = createSession(db, user.id, Date.now());
                request.cookies.set(SESSION_COOKIE, session.id, {
                    httpOnly: true,
                    sameSite: "lax",
                    secure: isSecureRequest(request),
                    path: "/",
                    expires: new Date(session.expiresAt)
                });
                return json({ user, personal: service.personalState(user.id) });
            }
        },

        "/api/auth/logout": {
            POST: (request: BunRequest) => {
                const sessionId = request.cookies.get(SESSION_COOKIE);
                if (sessionId) {
                    deleteSession(db, sessionId);
                }
                request.cookies.delete({ name: SESSION_COOKIE, path: "/" });
                return json({ ok: true });
            }
        },

        "/api/me": {
            GET: (request: BunRequest) => {
                const user = requireUser(db, request);
                return json({ user, personal: service.personalState(user.id) });
            }
        },

        "/api/me/password": {
            POST: async (request: BunRequest) => {
                const user = requireUser(db, request);
                const body = await readJson<{ currentPassword?: string; newPassword?: string }>(request);
                await changePassword(db, user.id, body.currentPassword ?? "", body.newPassword ?? "");

                const session = createSession(db, user.id, Date.now());
                request.cookies.set(SESSION_COOKIE, session.id, {
                    httpOnly: true,
                    sameSite: "lax",
                    secure: isSecureRequest(request),
                    path: "/",
                    expires: new Date(session.expiresAt)
                });
                return json({ ok: true });
            }
        }
    };
}
