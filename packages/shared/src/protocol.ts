import type { PublicState, SearchResult, Track } from "./types.ts";

export interface PlayerReport extends Track {
    position: number;
    duration: number;
    isPaused: boolean;
}

export type ControllerCommand =
    | { type: "skip" }
    | { type: "playNext"; videoId: string }
    | { type: "removeFromQueue"; videoId: string }
    | { type: "search"; query: string }
    | { type: "lookup"; videoId: string };

export type ControllerRequest = { id: string; command: ControllerCommand };

export type ControllerResponse =
    | { id: string; ok: true; results?: SearchResult[] }
    | { id: string; ok: false; error: string };

export type ControllerEvent =
    | { type: "nowPlaying"; player: PlayerReport }
    | { type: "response"; response: ControllerResponse }
    | { type: "ping" };

export type BrowserEvent = { type: "state"; state: PublicState };
