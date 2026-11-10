import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = import.meta.dir;
const outdir = join(root, "dist");

const serverUrl = process.env.OM_SERVER_URL || "http://127.0.0.1:3000";
let serverOrigin: string;
try {
    serverOrigin = new URL(serverUrl).origin;
} catch {
    console.error(`OM_SERVER_URL is not a valid URL: ${serverUrl}`);
    process.exit(1);
}

await rm(outdir, { recursive: true, force: true });

const define = {
    "process.env.OM_SERVER_URL": JSON.stringify(serverUrl),
    "process.env.OM_CONTROLLER_TOKEN": JSON.stringify(process.env.OM_CONTROLLER_TOKEN ?? "")
};

const classicScripts = await Bun.build({
    entrypoints: [join(root, "src/content.ts"), join(root, "src/page.ts"), join(root, "src/background.ts")],
    outdir,
    format: "iife",
    target: "browser",
    define
});

const moduleScripts = await Bun.build({
    entrypoints: [join(root, "src/options.ts")],
    outdir,
    format: "esm",
    target: "browser",
    define
});

for (const result of [classicScripts, moduleScripts]) {
    if (!result.success) {
        for (const log of result.logs) {
            console.error(log);
        }
        process.exit(1);
    }
}

await cp(join(root, "static"), outdir, { recursive: true });

const manifestPath = join(outdir, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const serverPermission = `${serverOrigin}/*`;
if (!manifest.host_permissions.includes(serverPermission)) {
    manifest.host_permissions.push(serverPermission);
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 4) + "\n");

console.log(`Extension built to ${outdir} (server: ${serverUrl})`);
