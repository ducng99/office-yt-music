import type { NowPlaying } from "@office-music/shared";

export function livePosition(track: NowPlaying, received: number, now: number): number {
    if (track.isPaused) {
        return track.position;
    }
    const elapsed = (now - received) / 1000;
    return Math.min(track.duration, track.position + elapsed);
}
