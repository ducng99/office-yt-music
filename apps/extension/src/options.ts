import type { ConnectionStatus } from "./shared.ts";
import { loadConfig } from "./shared.ts";

const form = document.getElementById("form") as HTMLFormElement;
const serverUrlInput = document.getElementById("serverUrl") as HTMLInputElement;
const tokenInput = document.getElementById("token") as HTMLInputElement;
const statusText = document.getElementById("status") as HTMLSpanElement;
const statusDot = document.getElementById("dot") as HTMLSpanElement;

function renderStatus(status: ConnectionStatus | undefined): void {
    statusText.textContent = status?.message ?? "Not connected";
    statusDot.className = `dot ${status?.state ?? ""}`;
}

const config = await loadConfig();
serverUrlInput.value = config.serverUrl;
tokenInput.value = config.token;

const stored = await chrome.storage.local.get("status");
renderStatus(stored.status as ConnectionStatus | undefined);

chrome.storage.onChanged.addListener((changes) => {
    if (changes.status) {
        renderStatus(changes.status.newValue as ConnectionStatus | undefined);
    }
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await chrome.storage.local.set({
        serverUrl: serverUrlInput.value.trim().replace(/\/+$/, ""),
        token: tokenInput.value.trim()
    });
    renderStatus({ state: "connecting", message: "Saved, connecting..." });
});
