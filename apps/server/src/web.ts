import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join, normalize } from "node:path";

export type WebHandler = (request: Request) => Promise<Response>;

const WEB_ROOT = join(import.meta.dir, "..", "..", "web");

export async function createWebHandler(dev: boolean, staticDir?: string): Promise<WebHandler> {
    if (dev) {
        return createViteHandler();
    }
    return createStaticHandler(normalize(staticDir ?? join(WEB_ROOT, "dist")));
}

async function createViteHandler(): Promise<WebHandler> {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
        root: WEB_ROOT,
        configFile: join(WEB_ROOT, "vite.config.ts"),
        appType: "spa",
        server: { middlewareMode: true }
    });

    // Vite middlewares expect Node's req/res, so they run on an internal loopback server that Bun.serve forwards to.
    const middlewareServer = createServer(vite.middlewares);
    await new Promise<void>((resolve) => middlewareServer.listen(0, "127.0.0.1", resolve));
    const { port } = middlewareServer.address() as AddressInfo;
    console.log("Serving web app from the Vite dev server");

    return (request) => {
        const url = new URL(request.url);
        return fetch(`http://127.0.0.1:${port}${url.pathname}${url.search}`, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            redirect: "manual"
        });
    };
}

function createStaticHandler(staticDir: string): WebHandler {
    return async (request) => {
        const pathname = new URL(request.url).pathname;
        const filePath = normalize(join(staticDir, pathname));
        if (filePath.startsWith(staticDir + "/")) {
            const file = Bun.file(filePath);
            if (await file.exists()) {
                const isHashedAsset = pathname.startsWith("/assets/");
                return new Response(file, {
                    headers: { "Cache-Control": isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache" }
                });
            }
        }

        const index = Bun.file(join(staticDir, "index.html"));
        if (await index.exists()) {
            return new Response(index, { headers: { "Cache-Control": "no-cache" } });
        }
        return new Response("Web app not built. Run `bun run build` in the project root.", { status: 404 });
    };
}
