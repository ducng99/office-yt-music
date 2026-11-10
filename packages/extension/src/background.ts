import type { ControllerEvent, ControllerRequest } from "@office-music/shared";
import { type ConnectionStatus, PORT_NAME, controllerSocketUrl, loadConfig } from "./shared.ts";

const KEEPALIVE_MS = 20_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

let socket: WebSocket | null = null;
let tabPort: chrome.runtime.Port | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let reconnectDelay = 1000;

function setStatus(status: ConnectionStatus): void {
    chrome.storage.local.set({ status });
    tabPort?.postMessage({ type: "status", status });
}

function sendToServer(event: ControllerEvent): void {
    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(event));
    }
}

function clearTimers(): void {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
    }
}

function disconnect(): void {
    clearTimers();
    if (socket) {
        socket.onclose = null;
        socket.close();
        socket = null;
    }
    setStatus({ state: "disconnected", message: "YouTube Music tab is not open" });
}

function scheduleReconnect(): void {
    if (reconnectTimer || !tabPort) {
        return;
    }
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
}

async function connect(): Promise<void> {
    if (!tabPort || socket) {
        return;
    }

    const config = await loadConfig();
    if (!config.token) {
        setStatus({ state: "error", message: "Set the controller token in the extension options" });
        return;
    }

    let url: string;
    try {
        url = controllerSocketUrl(config);
    } catch {
        setStatus({ state: "error", message: "Invalid server URL" });
        return;
    }

    setStatus({ state: "connecting", message: `Connecting to ${config.serverUrl}` });
    const ws = new WebSocket(url);
    socket = ws;

    ws.onopen = () => {
        reconnectDelay = 1000;
        setStatus({ state: "connected", message: `Connected to ${config.serverUrl}` });
        keepaliveTimer = setInterval(() => sendToServer({ type: "ping" }), KEEPALIVE_MS);
        tabPort?.postMessage({ type: "requestReport" });
    };

    ws.onmessage = (message) => {
        const request = JSON.parse(String(message.data)) as ControllerRequest;
        if (!tabPort) {
            sendToServer({ type: "response", response: { id: request.id, ok: false, error: "YouTube Music tab is not open" } });
            return;
        }
        tabPort.postMessage({ type: "request", request });
    };

    ws.onclose = (event) => {
        clearTimers();
        socket = null;
        const message = event.code === 1006 ? "Can't reach the server, retrying" : `Disconnected (${event.code}), retrying`;
        setStatus({ state: "error", message });
        scheduleReconnect();
    };
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) {
        return;
    }

    tabPort?.disconnect();
    tabPort = port;

    port.onMessage.addListener((event: ControllerEvent) => {
        sendToServer(event);
    });

    port.onDisconnect.addListener(() => {
        if (tabPort === port) {
            tabPort = null;
            disconnect();
        }
    });

    connect();
});

chrome.storage.onChanged.addListener((changes) => {
    if (changes.serverUrl || changes.token) {
        clearTimers();
        if (socket) {
            socket.onclose = null;
            socket.close();
            socket = null;
        }
        reconnectDelay = 1000;
        connect();
    }
});
