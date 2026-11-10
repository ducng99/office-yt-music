export interface ExtensionConfig {
    serverUrl: string;
    token: string;
}

export interface ConnectionStatus {
    state: "disconnected" | "connecting" | "connected" | "error";
    message: string;
}

declare const process: { env: { OM_SERVER_URL: string; OM_CONTROLLER_TOKEN: string } };

export const DEFAULT_CONFIG: ExtensionConfig = {
    serverUrl: process.env.OM_SERVER_URL,
    token: process.env.OM_CONTROLLER_TOKEN
};

export const PAGE_SOURCE = "office-music-page";
export const CONTENT_SOURCE = "office-music-content";
export const PORT_NAME = "office-music-ytm";

export async function loadConfig(): Promise<ExtensionConfig> {
    const stored = await chrome.storage.local.get(["serverUrl", "token"]);
    return {
        serverUrl: typeof stored.serverUrl === "string" && stored.serverUrl ? stored.serverUrl : DEFAULT_CONFIG.serverUrl,
        token: typeof stored.token === "string" && stored.token ? stored.token : DEFAULT_CONFIG.token
    };
}

export function controllerSocketUrl(config: ExtensionConfig): string {
    const url = new URL("/controller", config.serverUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("token", config.token);
    return url.toString();
}
