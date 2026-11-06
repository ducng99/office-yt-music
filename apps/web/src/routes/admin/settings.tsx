import { For, Show, createResource, createSignal } from "solid-js";
import type { Branding, Settings } from "@office-music/shared";
import { api, errorMessage } from "~/lib/api";
import { branding, setBranding } from "~/lib/branding";
import { musicState, user } from "~/lib/session";

interface SettingsResponse {
    settings: Settings;
    controllerToken: string;
    controllerOnline: boolean;
}

const FIELDS: { key: keyof Settings; label: string; help: string }[] = [
    { key: "skipThreshold", label: "Votes needed to skip", help: "A song is skipped once this many people vote." },
    { key: "dailyVoteLimit", label: "Skip votes per person per day", help: "Resets at midnight NZ time." },
    { key: "voteWindowSeconds", label: "Skip voting window (seconds)", help: "Votes to skip are only accepted during this many seconds (real time, regardless of seeking or pausing) after a song starts." },
    { key: "duplicateWindowHours", label: "Duplicate window (hours)", help: "A song can't be re-added if it played within this many hours." },
    { key: "maxQueuedPerUser", label: "Max queued songs per person", help: "Users can't add more songs while they already have this many in the queue." }
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

    const [siteName, setSiteName] = createSignal<string | null>(null);
    const [logoOnly, setLogoOnly] = createSignal<boolean | null>(null);
    const [logo, setLogo] = createSignal<string | null | undefined>(undefined);

    const shownLogo = () => (logo() === undefined ? branding().logo : logo());
    const brandingDirty = () => siteName() !== null || logoOnly() !== null || logo() !== undefined;

    function chooseLogo(event: Event & { currentTarget: HTMLInputElement }) {
        const file = event.currentTarget.files?.[0];
        if (!file) {
            return;
        }
        if (file.size > 500_000) {
            setError("Logo must be under 500 KB");
            return;
        }
        const reader = new FileReader();
        reader.onload = () => setLogo(String(reader.result));
        reader.readAsDataURL(file);
    }

    async function saveBranding(event: SubmitEvent) {
        event.preventDefault();
        setError("");
        setSuccess("");
        const changes: Partial<Branding> = {};
        if (siteName() !== null) changes.siteName = siteName()!;
        if (logoOnly() !== null) changes.logoOnly = logoOnly()!;
        if (logo() !== undefined) changes.logo = logo();
        if (logo() === null) changes.logoOnly = false;
        try {
            setBranding(await api<Branding>("/api/admin/branding", "PUT", changes));
            setSiteName(null);
            setLogoOnly(null);
            setLogo(undefined);
            setSuccess("Branding saved");
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

            <form class="card stack" onSubmit={saveBranding}>
                <h2 class="card-title" style={{ margin: 0 }}>Branding</h2>
                <div class="field">
                    <label for="siteName">Site name</label>
                    <input
                        id="siteName"
                        class="input"
                        maxlength="50"
                        value={siteName() ?? branding().siteName}
                        onInput={(event) => setSiteName(event.currentTarget.value)}
                        required
                    />
                </div>
                <div class="field">
                    <label for="logo">Logo</label>
                    <Show when={shownLogo()}>
                        {(src) => <img class="brand-logo large" src={src()} alt="Logo preview" />}
                    </Show>
                    <input id="logo" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onChange={chooseLogo} />
                    <span class="muted" style={{ "font-size": "13px" }}>PNG, JPEG, GIF, WebP or SVG, up to 500 KB. Also used as the browser icon.</span>
                    <Show when={shownLogo()}>
                        <div>
                            <button class="button small" type="button" onClick={() => setLogo(null)}>Remove logo</button>
                        </div>
                    </Show>
                </div>
                <label class="row">
                    <input
                        type="checkbox"
                        checked={(logoOnly() ?? branding().logoOnly) && !!shownLogo()}
                        disabled={!shownLogo()}
                        onChange={(event) => setLogoOnly(event.currentTarget.checked)}
                    />
                    Only show the logo (hide the site name)
                </label>
                <div>
                    <button class="button primary" type="submit" disabled={!brandingDirty()}>Save</button>
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
