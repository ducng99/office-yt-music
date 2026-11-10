import type { ControllerCommand, ControllerRequest, ControllerResponse, PlayerReport, SearchResult } from "@office-music/shared";
import { CONTENT_SOURCE, PAGE_SOURCE } from "./shared.ts";

// Everything in this file touches undocumented YouTube Music internals.
// If YouTube Music changes and the controller stops working, this is the file to fix.

const REPORT_INTERVAL_MS = 1000;
const HEARTBEAT_REPORT_MS = 5000;
const SONGS_SEARCH_PARAMS = "EgWKAQIIAWoKEAkQBRAKEAMQBA==";
const PLAYER_STATE_ENDED = 0;
const PLAYER_STATE_PAUSED = 2;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

interface YtPlayer {
    getVideoData(): { video_id?: string; title?: string; author?: string };
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    nextVideo(): void;
}

interface YtMusicApp extends HTMLElement {
    networkManager?: { fetch(path: string, body: Json): Promise<Json> };
}

interface QueueStore {
    getState(): { queue: { items: Json[]; nextQueueItemId: number; queueContextParams?: string } };
}

interface QueueElement extends HTMLElement {
    dispatch?: (action: Json) => void;
    queue?: { store?: { store?: QueueStore; dispatch?: (action: Json) => void } & Partial<QueueStore> };
}

declare global {
    interface Window {
        ytcfg?: { get(key: string): Json };
    }
}

function getPlayer(): YtPlayer | null {
    const element = document.querySelector("#movie_player") as (HTMLElement & Partial<YtPlayer>) | null;
    if (!element || typeof element.getVideoData !== "function") {
        return null;
    }
    return element as unknown as YtPlayer;
}

function getApp(): YtMusicApp | null {
    return document.querySelector("ytmusic-app") as YtMusicApp | null;
}

function getQueue(): { store: QueueStore; dispatch: (action: Json) => void } {
    const element = document.querySelector("#queue") as QueueElement | null;
    const storeHolder = element?.queue?.store;
    const store = storeHolder?.store ?? (storeHolder?.getState ? (storeHolder as QueueStore) : undefined);
    const dispatch = element?.dispatch?.bind(element) ?? storeHolder?.dispatch?.bind(storeHolder);

    if (!store || !dispatch) {
        throw new Error("Couldn't find the YouTube Music queue");
    }
    return { store, dispatch };
}

function isAdPlaying(): boolean {
    return document.querySelector("#movie_player.ad-showing, #movie_player.ad-interrupting") !== null;
}

async function innertube(endpoint: string, body: Json): Promise<Json> {
    const networkManager = getApp()?.networkManager;
    if (networkManager) {
        return networkManager.fetch(`/${endpoint}`, body);
    }

    const ytcfg = window.ytcfg;
    if (!ytcfg) {
        throw new Error("YouTube Music hasn't finished loading");
    }
    const response = await fetch(`/youtubei/v1/${endpoint}?prettyPrint=false`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
            "content-type": "application/json",
            "x-youtube-client-name": String(ytcfg.get("INNERTUBE_CONTEXT_CLIENT_NAME") ?? ""),
            "x-youtube-client-version": String(ytcfg.get("INNERTUBE_CLIENT_VERSION") ?? "")
        },
        body: JSON.stringify({ context: ytcfg.get("INNERTUBE_CONTEXT"), ...body })
    });
    if (!response.ok) {
        throw new Error(`YouTube Music request failed (${response.status})`);
    }
    return response.json();
}

function collect(node: Json, key: string, found: Json[] = []): Json[] {
    if (Array.isArray(node)) {
        for (const child of node) {
            collect(child, key, found);
        }
    } else if (node && typeof node === "object") {
        for (const [childKey, child] of Object.entries(node)) {
            if (childKey === key) {
                found.push(child);
            } else {
                collect(child, key, found);
            }
        }
    }
    return found;
}

function runsText(runs: Json): string {
    if (!Array.isArray(runs)) {
        return "";
    }
    return runs.map((run) => run?.text ?? "").join("");
}

function bestThumbnail(thumbnails: Json): string {
    if (!Array.isArray(thumbnails) || thumbnails.length === 0) {
        return "";
    }
    return thumbnails[thumbnails.length - 1]?.url ?? "";
}

function fallbackThumbnail(videoId: string): string {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function splitByline(text: string): { artist: string; album: string; durationText: string } {
    const parts = text.split(" • ").map((part) => part.trim()).filter(Boolean);
    if (parts[0] === "Song" || parts[0] === "Video") {
        parts.shift();
    }

    let durationText = "";
    if (parts.length > 0 && /^\d+(:\d+)+$/.test(parts[parts.length - 1])) {
        durationText = parts.pop() ?? "";
    }

    const artist = parts[0] ?? "";
    const album = parts.length > 1 && !/views?$/i.test(parts[1]) ? parts[1] : "";
    return { artist, album, durationText };
}

function parseSearchItem(item: Json): SearchResult | null {
    const videoId: string | undefined = item?.playlistItemData?.videoId
        ?? item?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
    if (!videoId) {
        return null;
    }

    const columns = item.flexColumns ?? [];
    const title = runsText(columns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs);
    const byline = runsText(columns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs);
    const { artist, album, durationText } = splitByline(byline);
    const thumbnail = bestThumbnail(item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails) || fallbackThumbnail(videoId);

    return { videoId, title, artist, album, durationText, thumbnail };
}

function parseQueueRenderer(renderer: Json): SearchResult | null {
    const videoId: string | undefined = renderer?.videoId;
    if (!videoId) {
        return null;
    }
    const { artist, album } = splitByline(runsText(renderer.longBylineText?.runs));
    return {
        videoId,
        title: runsText(renderer.title?.runs),
        artist,
        album,
        durationText: runsText(renderer.lengthText?.runs),
        thumbnail: bestThumbnail(renderer.thumbnail?.thumbnails) || fallbackThumbnail(videoId)
    };
}

function queueItemRenderer(item: Json): Json {
    return item?.playlistPanelVideoRenderer
        ?? item?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer
        ?? null;
}

async function search(query: string): Promise<SearchResult[]> {
    const response = await innertube("search", { query, params: SONGS_SEARCH_PARAMS });
    const items = collect(response, "musicResponsiveListItemRenderer");
    const results: SearchResult[] = [];
    for (const item of items) {
        const result = parseSearchItem(item);
        if (result && !results.some((existing) => existing.videoId === result.videoId)) {
            results.push(result);
        }
    }
    return results;
}

async function fetchQueueData(videoId: string, insertAfterCurrent: boolean): Promise<Json[]> {
    const body: Json = { videoIds: [videoId] };
    if (insertAfterCurrent) {
        body.queueInsertPosition = "INSERT_AFTER_CURRENT_VIDEO";
        try {
            body.queueContextParams = getQueue().store.getState().queue.queueContextParams;
        } catch {
            // Queue context is optional for the lookup.
        }
    }
    const response = await innertube("music/get_queue", body);
    const queueDatas = Array.isArray(response?.queueDatas) ? response.queueDatas : [];
    return queueDatas.map((data: Json) => data?.content).filter(Boolean);
}

async function lookup(videoId: string): Promise<SearchResult[]> {
    const items = await fetchQueueData(videoId, false);
    for (const item of items) {
        const result = parseQueueRenderer(queueItemRenderer(item));
        if (result) {
            return [result];
        }
    }
    return [];
}

function currentQueueIndex(items: Json[]): number {
    return items.findIndex((item) => queueItemRenderer(item)?.selected === true);
}

async function playNext(videoId: string): Promise<void> {
    const items = await fetchQueueData(videoId, true);
    if (items.length === 0) {
        throw new Error("YouTube Music couldn't find that song");
    }

    const { store, dispatch } = getQueue();
    const state = store.getState().queue;
    const currentIndex = currentQueueIndex(state.items);

    dispatch({
        type: "ADD_ITEMS",
        payload: {
            nextQueueItemId: state.nextQueueItemId,
            index: currentIndex >= 0 ? currentIndex + 1 : state.items.length,
            items,
            shuffleEnabled: false,
            shouldAssignIds: true
        }
    });
}

function removeFromQueue(videoId: string): void {
    const { store, dispatch } = getQueue();
    const items = store.getState().queue.items;
    const currentIndex = currentQueueIndex(items);
    const index = items.findIndex((item, i) => i > currentIndex && queueItemRenderer(item)?.videoId === videoId);
    if (index >= 0) {
        dispatch({ type: "REMOVE_ITEM", payload: index });
    }
}

function play(videoId: string): void {
    const app = getApp();
    if (!app) {
        throw new Error("YouTube Music hasn't finished loading");
    }
    app.dispatchEvent(new CustomEvent("yt-navigate", {
        bubbles: true,
        detail: { endpoint: { watchEndpoint: { videoId } } }
    }));
}

function skip(): void {
    const player = getPlayer();
    if (player) {
        player.nextVideo();
        return;
    }
    const button = document.querySelector(".next-button") as HTMLElement | null;
    if (!button) {
        throw new Error("Couldn't find the YouTube Music player");
    }
    button.click();
}

function isIdle(): boolean {
    if (!getApp() || isAdPlaying()) {
        return false;
    }
    const player = getPlayer();
    if (!player || !player.getVideoData()?.video_id) {
        return true;
    }
    return player.getPlayerState() === PLAYER_STATE_ENDED;
}

function readPlayer(): PlayerReport | null {
    const player = getPlayer();
    const data = player?.getVideoData();
    if (!player || !data?.video_id || isAdPlaying() || player.getPlayerState() === PLAYER_STATE_ENDED) {
        return null;
    }

    const metadata = navigator.mediaSession?.metadata;
    const metadataMatches = metadata !== null && metadata !== undefined && metadata.title === data.title;
    const artwork = metadataMatches ? metadata.artwork : [];

    return {
        videoId: data.video_id,
        title: data.title ?? "",
        artist: (metadataMatches && metadata.artist ? metadata.artist : data.author) ?? "",
        thumbnail: artwork.length > 0 ? artwork[artwork.length - 1].src : fallbackThumbnail(data.video_id),
        position: Math.round(player.getCurrentTime() || 0),
        duration: Math.round(player.getDuration() || 0),
        isPaused: player.getPlayerState() === PLAYER_STATE_PAUSED
    };
}

async function runCommand(command: ControllerCommand): Promise<SearchResult[]> {
    switch (command.type) {
        case "skip":
            skip();
            return [];
        case "play":
            play(command.videoId);
            return [];
        case "playNext":
            await playNext(command.videoId);
            return [];
        case "removeFromQueue":
            removeFromQueue(command.videoId);
            return [];
        case "search":
            return search(command.query);
        case "lookup":
            return lookup(command.videoId);
    }
}

function post(message: Json): void {
    window.postMessage({ source: PAGE_SOURCE, ...message }, window.location.origin);
}

let lastReport: PlayerReport | null = null;
let lastReportAt = 0;
let lastIdleAt = 0;

function reportIdle(force: boolean): void {
    if (force || lastReport !== null || Date.now() - lastIdleAt >= HEARTBEAT_REPORT_MS) {
        lastReport = null;
        lastIdleAt = Date.now();
        post({ type: "idle" });
    }
}

function report(force: boolean): void {
    if (isIdle()) {
        reportIdle(force);
        return;
    }

    const current = readPlayer();
    if (!current) {
        return;
    }

    const changed = !lastReport
        || lastReport.videoId !== current.videoId
        || lastReport.isPaused !== current.isPaused
        || lastReport.title !== current.title
        || lastReport.artist !== current.artist
        || lastReport.thumbnail !== current.thumbnail;

    if (force || changed || Date.now() - lastReportAt >= HEARTBEAT_REPORT_MS) {
        lastReport = current;
        lastReportAt = Date.now();
        post({ type: "nowPlaying", player: current });
    }
}

window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data?.source !== CONTENT_SOURCE) {
        return;
    }

    if (event.data.type === "requestReport") {
        report(true);
        return;
    }

    if (event.data.type !== "request") {
        return;
    }

    const request = event.data.request as ControllerRequest;
    let response: ControllerResponse;
    try {
        const results = await runCommand(request.command);
        response = { id: request.id, ok: true, results };
    } catch (error) {
        response = { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    post({ type: "response", response });
});

setInterval(() => report(false), REPORT_INTERVAL_MS);

function dismissStillWatchingPrompt(): void {
    const prompt = document.querySelector("ytmusic-you-there-renderer");
    const button = prompt?.querySelector("button") as HTMLButtonElement | null;
    button?.click();
}

setInterval(dismissStillWatchingPrompt, REPORT_INTERVAL_MS);

// Evens out loud and quiet songs with a compressor on the player's audio.
// The context is only connected once it is running, because a suspended context would silence the player.
let audioContext: AudioContext | null = null;
let connectedVideo: HTMLMediaElement | null = null;

function connectVolumeStabiliser(): void {
    const video = document.querySelector("video") as HTMLVideoElement | null;
    if (!video || video === connectedVideo) {
        return;
    }

    audioContext ??= new AudioContext();
    if (audioContext.state !== "running") {
        void audioContext.resume();
        return;
    }

    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -40;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    const makeupGain = audioContext.createGain();
    makeupGain.gain.value = 2;

    const source = audioContext.createMediaElementSource(video);
    source.connect(compressor);
    compressor.connect(makeupGain);
    makeupGain.connect(audioContext.destination);
    connectedVideo = video;
}

setInterval(connectVolumeStabiliser, REPORT_INTERVAL_MS);
