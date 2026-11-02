import { For, Show, createSignal } from "solid-js";
import type { QueueItem, SearchResult } from "@office-music/shared";
import { api, errorMessage } from "~/lib/api";
import { musicState } from "~/lib/session";
import { PlusIcon, SearchIcon } from "./Icons";

export default function AddSong() {
    const [query, setQuery] = createSignal("");
    const [results, setResults] = createSignal<SearchResult[] | null>(null);
    const [searching, setSearching] = createSignal(false);
    const [addingId, setAddingId] = createSignal<string | null>(null);
    const [error, setError] = createSignal("");
    const [success, setSuccess] = createSignal("");

    const offline = () => musicState()?.controllerOnline === false;

    async function search(event: SubmitEvent) {
        event.preventDefault();
        const text = query().trim();
        if (!text) {
            return;
        }

        setSearching(true);
        setError("");
        setSuccess("");
        try {
            setResults(await api<SearchResult[]>(`/api/search?q=${encodeURIComponent(text)}`));
        } catch (caught) {
            setResults(null);
            setError(errorMessage(caught));
        } finally {
            setSearching(false);
        }
    }

    async function add(result: SearchResult) {
        setAddingId(result.videoId);
        setError("");
        setSuccess("");
        try {
            const item = await api<QueueItem>("/api/queue", "POST", { input: result.videoId });
            setSuccess(`Added "${item.title}" to the queue`);
            setResults(null);
            setQuery("");
        } catch (caught) {
            setError(errorMessage(caught));
        } finally {
            setAddingId(null);
        }
    }

    return (
        <section class="card stack">
            <h2 class="card-title">Add a song</h2>
            <form class="row" onSubmit={search}>
                <input
                    class="input grow"
                    type="text"
                    placeholder="Song name or YouTube link"
                    value={query()}
                    onInput={(event) => setQuery(event.currentTarget.value)}
                    disabled={offline()}
                    aria-label="Song name or YouTube link"
                />
                <button class="button" type="submit" disabled={offline() || searching() || !query().trim()}>
                    <Show when={searching()} fallback={<SearchIcon size={16} />}><span class="spinner" /></Show>
                    <span class="hide-mobile">Search</span>
                </button>
            </form>

            <Show when={error()}>
                <div class="notice error">{error()}</div>
            </Show>
            <Show when={success()}>
                <div class="notice success">{success()}</div>
            </Show>

            <Show when={results()}>
                {(list) => (
                    <Show when={list().length > 0} fallback={<div class="empty">No songs found</div>}>
                        <ul class="track-list">
                            <For each={list()}>
                                {(result) => (
                                    <li class="track-row">
                                        <img class="track-thumb" src={result.thumbnail} alt="" loading="lazy" />
                                        <div class="track-text">
                                            <div class="title">{result.title}</div>
                                            <div class="subtitle">
                                                {[result.artist, result.album, result.durationText].filter(Boolean).join(" · ")}
                                            </div>
                                        </div>
                                        <button
                                            class="button small"
                                            type="button"
                                            disabled={addingId() !== null}
                                            onClick={() => add(result)}
                                        >
                                            <Show when={addingId() === result.videoId} fallback={<PlusIcon size={14} />}>
                                                <span class="spinner" />
                                            </Show>
                                            Add
                                        </button>
                                    </li>
                                )}
                            </For>
                        </ul>
                    </Show>
                )}
            </Show>
        </section>
    );
}
