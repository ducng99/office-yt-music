import { For, Show, createSignal } from "solid-js";
import type { QueueItem } from "@office-music/shared";
import { api, errorMessage } from "~/lib/api";
import { musicState, personal, refreshPersonal, user } from "~/lib/session";
import { XIcon } from "./Icons";

export default function Queue() {
    const [error, setError] = createSignal("");
    const queue = () => musicState()?.queue ?? [];
    const canRemove = (item: QueueItem) => user()?.isAdmin || personal()?.queuedItemIds.includes(item.id);

    async function remove(item: QueueItem) {
        if (!confirm(`Remove "${item.title}" from the queue?`)) {
            return;
        }
        setError("");
        try {
            await api(`/api/queue/${item.id}`, "DELETE");
            await refreshPersonal();
        } catch (caught) {
            setError(errorMessage(caught));
        }
    }

    return (
        <section class="card stack">
            <div class="row">
                <h2 class="card-title grow" style={{ margin: 0 }}>Up next</h2>
                <Show when={queue().length > 0}>
                    <span class="badge neutral num">{queue().length}</span>
                </Show>
            </div>

            <Show when={error()}>
                <div class="notice error">{error()}</div>
            </Show>

            <Show
                when={queue().length > 0}
                fallback={<div class="empty">The queue is empty. YouTube Music will keep playing its own picks.</div>}
            >
                <ul class="track-list">
                    <For each={queue()}>
                        {(item) => (
                            <li class="track-row">
                                <img class="track-thumb" src={item.thumbnail} alt="" loading="lazy" />
                                <div class="track-text">
                                    <div class="title">{item.title}</div>
                                    <div class="subtitle">{item.artist}</div>
                                </div>
                                <Show when={item.status === "sent"}>
                                    <span class="badge">Next</span>
                                </Show>
                                <Show when={canRemove(item)}>
                                    <button
                                        class="icon-button danger"
                                        type="button"
                                        onClick={() => remove(item)}
                                        title="Remove from queue"
                                        aria-label={`Remove ${item.title} from queue`}
                                    >
                                        <XIcon size={16} />
                                    </button>
                                </Show>
                            </li>
                        )}
                    </For>
                </ul>
            </Show>
        </section>
    );
}
