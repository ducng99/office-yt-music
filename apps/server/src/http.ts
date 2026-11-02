import type { Database } from "bun:sqlite";
import type { BunRequest } from "bun";
import type { SessionUser } from "@office-music/shared";
import { getSessionUser } from "./users.ts";
import type { MusicService } from "./music-service.ts";
import type { ControllerHub } from "./controller-hub.ts";

export const SESSION_COOKIE = "om_session";

export interface AppContext {
    db: Database;
    service: MusicService;
    hub: ControllerHub;
}

export class HttpError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export function json(data: unknown, status = 200): Response {
    return Response.json(data, { status });
}

export function errorResponse(status: number, message: string): Response {
    return Response.json({ error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
    if (!request.headers.get("content-type")?.includes("application/json")) {
        throw new HttpError(415, "Expected a JSON body");
    }
    try {
        return await request.json() as T;
    } catch {
        throw new HttpError(400, "Invalid JSON body");
    }
}

export function isSecureRequest(request: Request): boolean {
    if (new URL(request.url).protocol === "https:") {
        return true;
    }
    return request.headers.get("x-forwarded-proto") === "https";
}

export function currentUser(db: Database, request: BunRequest): SessionUser | null {
    const sessionId = request.cookies.get(SESSION_COOKIE);
    if (!sessionId) {
        return null;
    }
    return getSessionUser(db, sessionId, Date.now());
}

export function requireUser(db: Database, request: BunRequest): SessionUser {
    const user = currentUser(db, request);
    if (!user) {
        throw new HttpError(401, "Please log in");
    }
    return user;
}

export function requireAdmin(db: Database, request: BunRequest): SessionUser {
    const user = requireUser(db, request);
    if (!user.isAdmin) {
        throw new HttpError(403, "Admins only");
    }
    return user;
}

export function parseId(value: string): number {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) {
        throw new HttpError(400, "Invalid id");
    }
    return id;
}
