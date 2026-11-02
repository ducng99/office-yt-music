import { createSignal } from "solid-js";
import type { BrowserEvent, PersonalState, PublicState, SessionUser } from "@office-music/shared";
import { ApiError, api } from "./api";

interface MeResponse {
    user: SessionUser;
    personal: PersonalState;
}

const [user, setUser] = createSignal<SessionUser | null>(null);
const [personal, setPersonal] = createSignal<PersonalState | null>(null);
const [musicState, setMusicState] = createSignal<PublicState | null>(null);
const [receivedAt, setReceivedAt] = createSignal(0);
const [sessionChecked, setSessionChecked] = createSignal(false);
const [socketConnected, setSocketConnected] = createSignal(false);

export { musicState, personal, receivedAt, sessionChecked, setPersonal, socketConnected, user };

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
let lastPlayId: number | null = null;

export async function loadSession(): Promise<void> {
    try {
        const me = await api<MeResponse>("/api/me");
        setUser(me.user);
        setPersonal(me.personal);
        connectSocket();
    } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) {
            console.error(error);
        }
        setUser(null);
    } finally {
        setSessionChecked(true);
    }
}

export async function login(username: string, password: string): Promise<void> {
    const me = await api<MeResponse>("/api/auth/login", "POST", { username, password });
    setUser(me.user);
    setPersonal(me.personal);
    connectSocket();
}

export async function logout(): Promise<void> {
    await api("/api/auth/logout", "POST", {}).catch(() => null);
    disconnectSocket();
    setUser(null);
    setPersonal(null);
    setMusicState(null);
}

export async function refreshPersonal(): Promise<void> {
    try {
        const me = await api<MeResponse>("/api/me");
        setUser(me.user);
        setPersonal(me.personal);
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
            disconnectSocket();
            setUser(null);
        }
    }
}

function handleState(state: PublicState): void {
    setMusicState(state);
    setReceivedAt(Date.now());

    const playId = state.nowPlaying?.playId ?? null;
    if (playId !== lastPlayId) {
        lastPlayId = playId;
        refreshPersonal();
    }
}

function connectSocket(): void {
    if (socket) {
        return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socket = ws;

    ws.onopen = () => {
        reconnectDelay = 1000;
        setSocketConnected(true);
    };

    ws.onmessage = (message) => {
        const event = JSON.parse(String(message.data)) as BrowserEvent;
        if (event.type === "state") {
            handleState(event.state);
        }
    };

    ws.onclose = () => {
        socket = null;
        setSocketConnected(false);
        if (!user()) {
            return;
        }
        reconnectTimer = setTimeout(async () => {
            reconnectTimer = null;
            await refreshPersonal();
            if (user()) {
                connectSocket();
            }
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 15_000);
    };
}

function disconnectSocket(): void {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (socket) {
        socket.onclose = null;
        socket.close();
        socket = null;
    }
    setSocketConnected(false);
}
