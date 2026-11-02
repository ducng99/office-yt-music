import { For, Show, createResource, createSignal } from "solid-js";
import type { Settings } from "@office-music/shared";
import { api, errorMessage } from "~/lib/api";
import { musicState, user } from "~/lib/session";

interface SettingsResponse {
    settings: Settings;
    controllerToken: string;
    controllerOnline: boolean;
}

const FIELDS: { key: keyof Settings; label: string; help: string }[] = [
    { key: "skipThreshold", label: "Votes needed to skip", help: "A song is skipped once this many people vote." },
    { key: "dailyVoteLimit", label: "Skip votes per person per day", help: "Resets at midnight NZ time." },
    { key: "duplicateWindowHours", label: "Duplicate window (hours)", help: "A song can't be re-added if it played within this many hours." }
];

export default function AdminSettings() {
    const [data, { mutate }] = createResource(() => user()?.isAdmin, () => api<SettingsResponse>("/api/admin/settings"));
    const [draft, setDraft] = createSignal<Partial<Settings>>({});
    const [error, setError] = createSignal("");
    const [success, setSuccess] = createSignal("");

    const value = (key: keyof Settings) => draft()[key] ?? data()?.settings[key] ?? "";
    const controllerOnline = () => musicState()?.controllerOnline ?? data()?.controllerOnline ?? false;

    async function save(event: SubmitEvent) {
        event.preventDefault();
        setError("");
        setSuccess("");
        try {
            mutate(await api<SettingsResponse>("/api/admin/settings", "PUT", draft()));
            setDraft({});
            setSuccess("Settings saved");
        } catch (caught) {
            setError(errorMessage(caught));
        }
    }

    async function regenerateToken() {
        if (!confirm("Generate a new controller token? The extension will need the new token to reconnect.")) {
            return;
        }
        try {
            mutate(await api<SettingsResponse>("/api/admin/controller-token", "POST", {}));
        } catch (caught) {
            setError(errorMessage(caught));
        }
    }

    async function copyToken() {
        const token = data()?.controllerToken;
        if (token) {
            await navigator.clipboard.writeText(token).catch(() => null);
            setSuccess("Token copied");
        }
    }

    return (
        <main class="container stack">
            <h1 class="page-title" style={{ margin: 0 }}>Settings</h1>

            <Show when={error()}>
                <div class="notice error">{error()}</div>
            </Show>
            <Show when={success()}>
                <div class="notice success">{success()}</div>
            </Show>

            <form class="card stack" onSubmit={save}>
                <h2 class="card-title" style={{ margin: 0 }}>Rules</h2>
                <For each={FIELDS}>
                    {(field) => (
                        <div class="field">
                            <label for={field.key}>{field.label}</label>
                            <input
                                id={field.key}
                                class="input"
                                type="number"
                                min="1"
                                max="1000"
                                value={value(field.key)}
                                onInput={(event) => setDraft({ ...draft(), [field.key]: Number(event.currentTarget.value) })}
                                required
                            />
                            <span class="muted" style={{ "font-size": "13px" }}>{field.help}</span>
                        </div>
                    )}
                </For>
                <div>
                    <button class="button primary" type="submit" disabled={Object.keys(draft()).length === 0}>Save</button>
                </div>
            </form>

            <section class="card stack">
                <div class="row">
                    <h2 class="card-title grow" style={{ margin: 0 }}>Music player</h2>
                    <span class="row" style={{ "font-size": "14px" }}>
                        <span class="status-dot" classList={{ online: controllerOnline(), offline: !controllerOnline() }} />
                        {controllerOnline() ? "Connected" : "Offline"}
                    </span>
                </div>
                <p class="muted" style={{ margin: 0, "font-size": "14px" }}>
                    Paste this token into the Office Music Controller extension options on the music computer.
                </p>
                <div class="token">{data()?.controllerToken ?? "..."}</div>
                <div class="row">
                    <button class="button small" type="button" onClick={copyToken}>Copy</button>
                    <button class="button small danger" type="button" onClick={regenerateToken}>Regenerate</button>
                </div>
            </section>
        </main>
    );
}
