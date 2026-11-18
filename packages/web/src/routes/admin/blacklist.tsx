import { For, Show, createResource, createSignal } from "solid-js";
import type { BlacklistEntry } from "@office-music/shared";
import { api, errorMessage } from "~/lib/api";
import { user } from "~/lib/session";

export default function AdminBlacklist() {
    const [entries, { mutate }] = createResource(() => user()?.isAdmin, () => api<BlacklistEntry[]>("/api/admin/blacklist"));
    const [url, setUrl] = createSignal("");
    const [error, setError] = createSignal("");
    const [success, setSuccess] = createSignal("");

    async function add(event: SubmitEvent) {
        event.preventDefault();
        setError("");
        setSuccess("");
        try {
            mutate(await api<BlacklistEntry[]>("/api/admin/blacklist", "POST", { url: url() }));
            setUrl("");
            setSuccess("Song blacklisted");
        } catch (caught) {
            setError(errorMessage(caught));
        }
    }

    async function remove(entry: BlacklistEntry) {
        setError("");
        setSuccess("");
        try {
            mutate(await api<BlacklistEntry[]>(`/api/admin/blacklist/${encodeURIComponent(entry.videoId)}`, "DELETE"));
            setSuccess(`Removed ${entry.title} from the blacklist`);
        } catch (caught) {
            setError(errorMessage(caught));
        }
    }

    return (
        <main class="container wide stack">
            <h1 class="page-title" style={{ margin: 0 }}>Blacklist</h1>

            <form class="card stack" onSubmit={add}>
                <h2 class="card-title" style={{ margin: 0 }}>Blacklist a song</h2>
                <div class="row" style={{ "flex-wrap": "wrap" }}>
                    <input class="input grow" placeholder="YouTube or YouTube Music link" value={url()} onInput={(event) => setUrl(event.currentTarget.value)} required style={{ "min-width": "200px" }} />
                    <button class="button primary" type="submit">Add</button>
                </div>
            </form>

            <Show when={error()}>
                <div class="notice error">{error()}</div>
            </Show>
            <Show when={success()}>
                <div class="notice success">{success()}</div>
            </Show>

            <section class="card table-scroll">
                <Show when={entries()} fallback={<div class="empty">Loading blacklist...</div>}>
                    {(list) => (
                        <Show when={list().length > 0} fallback={<div class="empty">No blacklisted songs</div>}>
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Song</th>
                                        <th>Skips</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    <For each={list()}>
                                        {(entry) => (
                                            <tr>
                                                <td>
                                                    {entry.title}
                                                    <div class="muted" style={{ "font-size": "13px" }}>{entry.artist}</div>
                                                </td>
                                                <td>{entry.skipCount}</td>
                                                <td>
                                                    <div class="table-actions">
                                                        <button class="button small danger" type="button" onClick={() => remove(entry)}>Remove</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </For>
                                </tbody>
                            </table>
                        </Show>
                    )}
                </Show>
            </section>
        </main>
    );
}
