import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type { BunRequest, Server, ServerWebSocket } from "bun";
import type { BrowserEvent, ControllerEvent, PublicState } from "@office-music/shared";
import { openDatabase } from "./db.ts";
import { ControllerError, ControllerHub } from "./controller-hub.ts";
import { MusicError, MusicService } from "./music-service.ts";
import { UserError } from "./users.ts";
import { SettingsError, getBranding, getControllerToken } from "./settings.ts";
import { type AppContext, HttpError, currentUser, errorResponse, json } from "./http.ts";
import { authRoutes } from "./routes/auth.ts";
import { musicRoutes } from "./routes/music.ts";
import { adminRoutes } from "./routes/admin.ts";
import { createWebHandler } from "./web.ts";

type SocketData = { kind: "browser" | "controller" };

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dir, "..", "data");
const BROWSER_TOPIC = "state";
const TLS_CERT_FILE = process.env.TLS_CERT_FILE;
const TLS_KEY_FILE = process.env.TLS_KEY_FILE;

if (Boolean(TLS_CERT_FILE) !== Boolean(TLS_KEY_FILE)) {
    throw new Error("Set both TLS_CERT_FILE and TLS_KEY_FILE to serve HTTPS, or neither to serve HTTP");
}
const tls = TLS_CERT_FILE && TLS_KEY_FILE ? { cert: Bun.file(TLS_CERT_FILE), key: Bun.file(TLS_KEY_FILE) } : undefined;

mkdirSync(DATA_DIR, { recursive: true });
const db = openDatabase(join(DATA_DIR, "office-music.sqlite"));

let server: Server<SocketData> | null = null;

function broadcast(state: PublicState): void {
    const event: BrowserEvent = { type: "state", state };
    server?.publish(BROWSER_TOPIC, JSON.stringify(event));
}

const hub = new ControllerHub(() => service.notifyChanged());
const service = new MusicService(db, hub, broadcast);
const context: AppContext = { db, service, hub };

function toErrorResponse(error: unknown): Response {
    if (error instanceof HttpError) {
        return errorResponse(error.status, error.message);
    }
    if (error instanceof MusicError || error instanceof UserError || error instanceof SettingsError) {
        return errorResponse(400, error.message);
    }
    if (error instanceof ControllerError) {
        return errorResponse(503, error.message);
    }
    console.error(error);
    return errorResponse(500, "Something went wrong");
}

// Bun.env rather than process.env: `bun build` inlines process.env.NODE_ENV at bundle time.
const serveWeb = await createWebHandler(Bun.env.NODE_ENV === "development", process.env.STATIC_DIR);

server = Bun.serve<SocketData>({
    port: PORT,
    hostname: HOST,
    tls,

    routes: {
        ...authRoutes(context),
        ...musicRoutes(context),
        ...adminRoutes(context),

        "/ws": (request: BunRequest, srv: Server<SocketData>) => {
            if (!currentUser(db, request)) {
                return errorResponse(401, "Please log in");
            }
            if (srv.upgrade(request, { data: { kind: "browser" } })) {
                return undefined;
            }
            return errorResponse(400, "Expected a WebSocket upgrade");
        },

        "/controller": (request: BunRequest, srv: Server<SocketData>) => {
            const token = new URL(request.url).searchParams.get("token");
            if (token !== getControllerToken(db)) {
                return errorResponse(401, "Invalid controller token");
            }
            if (srv.upgrade(request, { data: { kind: "controller" } })) {
                return undefined;
            }
            return errorResponse(400, "Expected a WebSocket upgrade");
        },

        "/api/branding": () => json(getBranding(db)),

        "/api/*": () => errorResponse(404, "Not found")
    },

    fetch(request) {
        return serveWeb(request);
    },

    error: toErrorResponse,

    websocket: {
        idleTimeout: 60,

        open(socket: ServerWebSocket<SocketData>) {
            if (socket.data.kind === "controller") {
                hub.attach(socket);
                console.log("Controller connected");
                return;
            }
            socket.subscribe(BROWSER_TOPIC);
            const event: BrowserEvent = { type: "state", state: service.publicState() };
            socket.send(JSON.stringify(event));
        },

        async message(socket: ServerWebSocket<SocketData>, message) {
            if (socket.data.kind !== "controller") {
                return;
            }

            let event: ControllerEvent;
            try {
                event = JSON.parse(String(message));
            } catch {
                console.error("Invalid controller message");
                return;
            }

            if (event.type === "response") {
                hub.handleResponse(event.response);
            } else if (event.type === "nowPlaying") {
                await service.handlePlayerReport(event.player).catch((error) => console.error("Player report failed:", error));
            } else if (event.type === "idle") {
                await service.handlePlayerIdle().catch((error) => console.error("Player idle report failed:", error));
            }
        },

        close(socket: ServerWebSocket<SocketData>) {
            if (socket.data.kind === "controller") {
                hub.detach(socket);
                console.log("Controller disconnected");
            }
        }
    }
});

console.log(`Office Music listening on ${tls ? "https" : "http"}://${HOST}:${server.port}`);
console.log(`Controller token: ${getControllerToken(db)}`);
