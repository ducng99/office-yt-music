import type { ServerWebSocket } from "bun";
import type { ControllerCommand, ControllerResponse, SearchResult } from "@office-music/shared";

const DEFAULT_TIMEOUT_MS = 10_000;

export class ControllerError extends Error {}

export interface Controller {
    readonly online: boolean;
    send(command: ControllerCommand): Promise<SearchResult[]>;
}

interface PendingRequest {
    resolve: (results: SearchResult[]) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class ControllerHub implements Controller {
    private socket: ServerWebSocket<unknown> | null = null;
    private pending = new Map<string, PendingRequest>();
    private onStatusChange: () => void;

    constructor(onStatusChange: () => void) {
        this.onStatusChange = onStatusChange;
    }

    get online(): boolean {
        return this.socket !== null;
    }

    attach(socket: ServerWebSocket<unknown>): void {
        if (this.socket && this.socket !== socket) {
            this.socket.close(4000, "Replaced by a newer controller connection");
        }
        this.socket = socket;
        this.onStatusChange();
    }

    detach(socket: ServerWebSocket<unknown>): void {
        if (this.socket !== socket) {
            return;
        }
        this.socket = null;
        for (const [id, request] of this.pending) {
            clearTimeout(request.timer);
            request.reject(new ControllerError("Controller disconnected"));
            this.pending.delete(id);
        }
        this.onStatusChange();
    }

    handleResponse(response: ControllerResponse): void {
        const request = this.pending.get(response.id);
        if (!request) {
            return;
        }
        clearTimeout(request.timer);
        this.pending.delete(response.id);

        if (response.ok) {
            request.resolve(response.results ?? []);
        } else {
            request.reject(new ControllerError(response.error));
        }
    }

    send(command: ControllerCommand): Promise<SearchResult[]> {
        const socket = this.socket;
        if (!socket) {
            return Promise.reject(new ControllerError("The music player is offline"));
        }

        const id = crypto.randomUUID();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new ControllerError("The music player did not respond in time"));
            }, DEFAULT_TIMEOUT_MS);

            this.pending.set(id, { resolve, reject, timer });
            socket.send(JSON.stringify({ id, command }));
        });
    }
}
