import { CONTENT_SOURCE, PAGE_SOURCE, PORT_NAME } from "./shared.ts";

const KEEPALIVE_MS = 20_000;

let port: chrome.runtime.Port | null = null;

function connectPort(): void {
    document.documentElement.dataset.officeMusicStatus = "content script loaded";
    port = chrome.runtime.connect({ name: PORT_NAME });

    port.onMessage.addListener((message) => {
        if (message.type === "status") {
            document.documentElement.dataset.officeMusicStatus = `${message.status.state}: ${message.status.message}`;
            return;
        }
        window.postMessage({ source: CONTENT_SOURCE, ...message }, window.location.origin);
    });

    port.onDisconnect.addListener(() => {
        port = null;
        setTimeout(connectPort, 1000);
    });
}

window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== PAGE_SOURCE) {
        return;
    }
    const { source, ...payload } = event.data;
    port?.postMessage(payload);
});

connectPort();

// Firefox suspends idle background pages; regular port traffic keeps it alive.
setInterval(() => port?.postMessage({ type: "ping" }), KEEPALIVE_MS);
