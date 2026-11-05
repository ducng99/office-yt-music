import { For, Show, createSignal, onCleanup } from "solid-js";
import { api, errorMessage } from "~/lib/api";
import type { PersonalState } from "@office-music/shared";
import { musicState, personal, receivedAt, setPersonal } from "~/lib/session";
import { SkipIcon } from "./Icons";

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
        const elapsedSinceReceived = (now() - receivedAt()) / 1000;
        return votes().secondsLeft - elapsedSinceReceived <= 0;
    };
    const canVote = () => {
        const state = musicState();
        const mine = personal();
        return Boolean(state?.nowPlaying && state.controllerOnline && mine && !mine.youVoted && mine.votesLeftToday > 0 && !votingClosed());
    };

    const buttonLabel = () => {
        const mine = personal();
        if (mine?.youVoted) {
            return "Voted";
        }
        if (votingClosed()) {
            return "Voting closed";
        }
        return "Vote to skip";
    };

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
                                <> &middot; {mine().votesLeftToday} of {mine().dailyVoteLimit} votes left today</>
                            )}
                        </Show>
                    </div>
                </div>
                <button class="button primary" type="button" disabled={!canVote() || busy()} onClick={vote}>
                    <Show when={busy()} fallback={<SkipIcon size={16} />}><span class="spinner" /></Show>
                    {buttonLabel()}
                </button>
            </div>
            <Show when={error()}>
                <div class="notice error">{error()}</div>
            </Show>
        </section>
    );
}
