import { For, Show, createSignal, onCleanup } from "solid-js";
import { api, errorMessage } from "~/lib/api";
import type { PersonalState } from "@office-music/shared";
import { musicState, personal, receivedAt, setPersonal } from "~/lib/session";
import { SkipIcon, StarIcon } from "./Icons";

export default function VotePanel() {
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal("");
    const [now, setNow] = createSignal(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(timer));

    const votes = () => musicState()?.votes ?? { voteCount: 0, threshold: 0, windowSeconds: 0, secondsLeft: 0 };
    const votingClosed = () => {
        if (!musicState()?.nowPlaying) {
            return false;
        }
        const elapsedSinceReceived = Math.max(0, now() - receivedAt()) / 1000;
        return votes().secondsLeft - elapsedSinceReceived <= 0;
    };
    const canVote = () => {
        const state = musicState();
        const mine = personal();
        return Boolean(state?.nowPlaying && state.controllerOnline && mine && !state.nowPlaying.golden && !mine.youVoted && mine.votesLeftToday > 0 && !votingClosed());
    };

    const buttonLabel = () => {
        const mine = personal();
        if (mine?.youVoted) {
            return "Voted";
        }
        if (musicState()?.nowPlaying?.golden) {
            return "Golden buzzer";
        }
        if (votingClosed()) {
            return "Voting closed";
        }
        return "Vote to skip";
    };

    const canBuzz = () => {
        const state = musicState();
        return Boolean(state?.nowPlaying && !state.nowPlaying.golden && state.controllerOnline && personal()?.goldenBuzzerAvailable);
    };

    async function buzz() {
        if (!confirm("Use your golden buzzer on this song? It can't be skipped, and you only get one per day.")) {
            return;
        }
        setBusy(true);
        setError("");
        try {
            setPersonal(await api<PersonalState>("/api/golden-buzzer", "POST", {}));
        } catch (caught) {
            setError(errorMessage(caught));
        } finally {
            setBusy(false);
        }
    }

    async function vote() {
        setBusy(true);
        setError("");
        try {
            setPersonal(await api<PersonalState>("/api/votes", "POST", {}));
        } catch (caught) {
            setError(errorMessage(caught));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section class="card stack">
            <div class="vote">
                <div class="vote-info">
                    <div class="vote-segments" aria-hidden="true">
                        <For each={Array.from({ length: votes().threshold })}>
                            {(_, index) => <div class="vote-segment" classList={{ filled: index() < votes().voteCount }} />}
                        </For>
                    </div>
                    <div class="vote-text">
                        {votes().voteCount} of {votes().threshold} votes to skip
                        <Show when={personal()}>
                            {(mine) => (
                                <> &middot; You have {mine().votesLeftToday} votes left today</>
                            )}
                        </Show>
                    </div>
                </div>
            </div>
            <div class="vote-actions">
                <button class="button primary" type="button" disabled={!canVote() || busy()} onClick={vote}>
                    <Show when={busy()} fallback={<SkipIcon size={16} />}><span class="spinner" /></Show>
                    {buttonLabel()}
                </button>
                <button class="button golden" type="button" disabled={!canBuzz() || busy()} onClick={buzz} title="Lock this song so it can't be skipped (once per day)">
                    <StarIcon size={16} />
                    Golden buzzer
                </button>
            </div>
            <Show when={error()}>
                <div class="notice error">{error()}</div>
            </Show>
        </section>
    );
}
