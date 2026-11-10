import { Show, createSignal, onCleanup } from "solid-js";
import { formatTime } from "~/lib/format";
import { livePosition } from "~/lib/player";
import { musicState, receivedAt } from "~/lib/session";
import { MusicIcon, WifiOffIcon } from "./Icons";

export default function NowPlaying() {
    const [now, setNow] = createSignal(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(timer));

    return (
        <section class="card now-playing" aria-live="polite">
            <Show when={musicState()} fallback={<NowPlayingSkeleton />}>
                {(state) => (
                    <>
                        <Show when={!state().controllerOnline}>
                            <div class="notice error row">
                                <WifiOffIcon size={16} />
                                <span>The music player is offline. Voting and adding songs are paused.</span>
                            </div>
                        </Show>
                        <Show
                            when={state().nowPlaying}
                            fallback={
                                <>
                                    <div class="album-art placeholder"><MusicIcon size={48} /></div>
                                    <div>
                                        <h1 class="track-title">Nothing playing</h1>
                                        <p class="track-artist">
                                            {state().queue.length > 0 ? "Starting the next song in the queue" : "Add a song to start the music"}
                                        </p>
                                    </div>
                                </>
                            }
                        >
                            {(track) => {
                                const position = () => livePosition(track(), receivedAt(), now());
                                const percent = () => (track().duration > 0 ? (position() / track().duration) * 100 : 0);
                                return (
                                    <>
                                        <img class="album-art" src={track().thumbnail} alt="" />
                                        <div>
                                            <h1 class="track-title">{track().title}</h1>
                                            <p class="track-artist">
                                                {track().artist}
                                                <Show when={track().isPaused}> &middot; Paused</Show>
                                            </p>
                                        </div>
                                        <div class="progress">
                                            <div class="progress-track">
                                                <div class="progress-fill" style={{ width: `${percent()}%` }} />
                                            </div>
                                            <div class="progress-times">
                                                <span>{formatTime(position())}</span>
                                                <span>{formatTime(track().duration)}</span>
                                            </div>
                                        </div>
                                    </>
                                );
                            }}
                        </Show>
                    </>
                )}
            </Show>
        </section>
    );
}

function NowPlayingSkeleton() {
    return (
        <>
            <div class="album-art skeleton" />
            <div class="skeleton" style={{ width: "60%", height: "24px" }} />
            <div class="skeleton" style={{ width: "40%", height: "16px" }} />
        </>
    );
}
