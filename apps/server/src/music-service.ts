import type { Database } from "bun:sqlite";
import { extractVideoId } from "@office-music/shared";
import type { PersonalState, PlayerReport, PublicState, QueueItem, QueueStatus, SearchResult, SessionUser } from "@office-music/shared";
import type { Controller } from "./controller-hub.ts";
import { getSettings } from "./settings.ts";
import { nzDate } from "./nz-date.ts";

const MAX_SEND_ATTEMPTS = 2;
const HOUR_MS = 60 * 60 * 1000;

export class MusicError extends Error {}

interface CurrentPlay {
    id: number;
    videoId: string;
    title: string;
    artist: string;
    thumbnail: string;
    skipping: boolean;
    position: number;
    duration: number;
    isPaused: boolean;
    reportedAt: number;
}

interface QueueRow {
    id: number;
    video_id: string;
    title: string;
    artist: string;
    thumbnail: string;
    user_id: number;
    status: QueueStatus;
    send_attempts: number;
}

function toQueueItem(row: QueueRow): QueueItem {
    return {
        id: row.id,
        videoId: row.video_id,
        title: row.title,
        artist: row.artist,
        thumbnail: row.thumbnail,
        status: row.status
    };
}

export class MusicService {
    private db: Database;
    private controller: Controller;
    private broadcast: (state: PublicState) => void;
    private clock: () => number;
    private currentPlay: CurrentPlay | null = null;

    constructor(db: Database, controller: Controller, broadcast: (state: PublicState) => void, clock: () => number = Date.now) {
        this.db = db;
        this.controller = controller;
        this.broadcast = broadcast;
        this.clock = clock;
    }

    publicState(): PublicState {
        const settings = getSettings(this.db);
        const current = this.currentPlay;

        return {
            controllerOnline: this.controller.online,
            nowPlaying: current
                ? {
                    playId: current.id,
                    videoId: current.videoId,
                    title: current.title,
                    artist: current.artist,
                    thumbnail: current.thumbnail,
                    position: current.position,
                    duration: current.duration,
                    isPaused: current.isPaused,
                    reportedAt: current.reportedAt
                }
                : null,
            votes: {
                voteCount: current ? this.countVotesForPlay(current.id) : 0,
                threshold: settings.skipThreshold,
                windowSeconds: settings.voteWindowSeconds
            },
            queue: this.listQueue()
        };
    }

    personalState(userId: number): PersonalState {
        const settings = getSettings(this.db);
        const used = this.countVotesForUserToday(userId);
        const current = this.currentPlay;
        const youVoted = current
            ? this.db.query("SELECT 1 FROM votes WHERE user_id = ? AND play_id = ?").get(userId, current.id) !== null
            : false;
        const queuedItemIds = this.db.query<{ id: number }, [number]>(
            "SELECT id FROM queue_items WHERE user_id = ? AND status IN ('pending', 'sent') ORDER BY id"
        ).all(userId).map((row) => row.id);

        return {
            youVoted,
            votesLeftToday: Math.max(0, settings.dailyVoteLimit - used),
            dailyVoteLimit: settings.dailyVoteLimit,
            queuedItemIds
        };
    }

    notifyChanged(): void {
        this.broadcast(this.publicState());
    }

    async handlePlayerReport(report: PlayerReport): Promise<void> {
        const now = this.clock();
        const current = this.currentPlay;

        if (current && current.videoId === report.videoId) {
            current.position = report.position;
            current.duration = report.duration;
            current.isPaused = report.isPaused;
            current.reportedAt = now;
            const metadataChanged = report.title !== current.title || report.artist !== current.artist || report.thumbnail !== current.thumbnail;
            if (report.title && report.artist && metadataChanged) {
                current.title = report.title;
                current.artist = report.artist;
                current.thumbnail = report.thumbnail;
                this.db.query("UPDATE plays SET title = ?, artist = ?, thumbnail = ? WHERE id = ?").run(report.title, report.artist, report.thumbnail, current.id);
            }
            this.notifyChanged();
            return;
        }

        this.startPlay(report, now);
        this.reconcileSentItem(report.videoId);
        this.notifyChanged();
        await this.pushNextIfNeeded();
    }

    async vote(userId: number): Promise<PersonalState> {
        const current = this.currentPlay;
        if (!current) {
            throw new MusicError("Nothing is playing right now");
        }

        const settings = getSettings(this.db);
        const now = this.clock();
        const today = nzDate(now);

        const shouldSkip = this.db.transaction(() => {
            if (current.skipping) {
                throw new MusicError("This song is already being skipped");
            }
            if (this.livePosition(current, now) > settings.voteWindowSeconds) {
                throw new MusicError(`Voting to skip is only allowed during the first ${settings.voteWindowSeconds} seconds of a song`);
            }
            const alreadyVoted = this.db.query("SELECT 1 FROM votes WHERE user_id = ? AND play_id = ?").get(userId, current.id);
            if (alreadyVoted) {
                throw new MusicError("You already voted to skip this song");
            }
            if (this.countVotesForUserToday(userId) >= settings.dailyVoteLimit) {
                throw new MusicError(`You have used all ${settings.dailyVoteLimit} skip votes for today`);
            }

            this.db.query("INSERT INTO votes (user_id, play_id, nz_date, created_at) VALUES (?, ?, ?, ?)").run(userId, current.id, today, now);

            if (this.countVotesForPlay(current.id) >= settings.skipThreshold) {
                current.skipping = true;
                this.db.query("UPDATE plays SET skipped_by_vote = 1 WHERE id = ?").run(current.id);
                return true;
            }
            return false;
        })();

        if (shouldSkip) {
            try {
                await this.controller.send({ type: "skip" });
            } catch (error) {
                current.skipping = false;
                this.db.query("UPDATE plays SET skipped_by_vote = 0 WHERE id = ?").run(current.id);
                console.error("Skip failed:", error);
            }
        }

        this.notifyChanged();
        return this.personalState(userId);
    }

    async search(query: string): Promise<SearchResult[]> {
        const trimmed = query.trim();
        if (!trimmed) {
            return [];
        }

        const videoId = extractVideoId(trimmed);
        if (videoId) {
            return this.controller.send({ type: "lookup", videoId });
        }
        const results = await this.controller.send({ type: "search", query: trimmed });
        return results.slice(0, 5);
    }

    async addToQueue(userId: number, input: string): Promise<QueueItem> {
        const videoId = extractVideoId(input);
        if (!videoId) {
            throw new MusicError("That doesn't look like a YouTube or YouTube Music link");
        }

        this.assertNotDuplicate(videoId);

        const [track] = await this.controller.send({ type: "lookup", videoId });
        if (!track) {
            throw new MusicError("Couldn't find that song");
        }

        this.assertNotDuplicate(videoId);

        const row = this.db.query<QueueRow, [number, string, string, string, string, number]>(
            "INSERT INTO queue_items (user_id, video_id, title, artist, thumbnail, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
        ).get(userId, videoId, track.title, track.artist, track.thumbnail, this.clock());

        if (!row) {
            throw new MusicError("Failed to add song");
        }

        this.notifyChanged();
        await this.pushNextIfNeeded();
        return toQueueItem(row);
    }

    async removeQueueItem(requester: SessionUser, itemId: number): Promise<void> {
        const row = this.db.query<QueueRow, [number]>("SELECT * FROM queue_items WHERE id = ?").get(itemId);
        if (!row || (row.status !== "pending" && row.status !== "sent")) {
            throw new MusicError("That song is no longer in the queue");
        }
        if (!requester.isAdmin && row.user_id !== requester.id) {
            throw new MusicError("You can only remove songs you added");
        }

        this.setQueueStatus(row.id, "removed");

        if (row.status === "sent") {
            try {
                await this.controller.send({ type: "removeFromQueue", videoId: row.video_id });
            } catch (error) {
                console.error("Remove from player queue failed:", error);
            }
        }

        this.notifyChanged();
        await this.pushNextIfNeeded();
    }

    async pushNextIfNeeded(): Promise<void> {
        if (!this.controller.online || !this.currentPlay) {
            return;
        }
        const sent = this.db.query<QueueRow, []>("SELECT * FROM queue_items WHERE status = 'sent'").get();
        if (sent) {
            return;
        }
        const next = this.db.query<QueueRow, []>("SELECT * FROM queue_items WHERE status = 'pending' ORDER BY id LIMIT 1").get();
        if (!next) {
            return;
        }

        this.db.query("UPDATE queue_items SET status = 'sent', send_attempts = send_attempts + 1 WHERE id = ?").run(next.id);
        this.notifyChanged();

        try {
            await this.controller.send({ type: "playNext", videoId: next.video_id });
        } catch (error) {
            console.error("Play next failed:", error);
            const latest = this.db.query<QueueRow, [number]>("SELECT * FROM queue_items WHERE id = ?").get(next.id);
            if (latest?.status === "sent") {
                this.setQueueStatus(next.id, "pending");
                this.notifyChanged();
            }
        }
    }

    private startPlay(report: PlayerReport, now: number): void {
        if (this.currentPlay) {
            this.db.query("UPDATE plays SET ended_at = ? WHERE id = ?").run(now, this.currentPlay.id);
        }

        const row = this.db.query<{ id: number }, [string, string, string, string, number]>(
            "INSERT INTO plays (video_id, title, artist, thumbnail, started_at) VALUES (?, ?, ?, ?, ?) RETURNING id"
        ).get(report.videoId, report.title, report.artist, report.thumbnail, now);

        if (!row) {
            throw new Error("Failed to record play");
        }

        this.currentPlay = {
            id: row.id,
            videoId: report.videoId,
            title: report.title,
            artist: report.artist,
            thumbnail: report.thumbnail,
            skipping: false,
            position: report.position,
            duration: report.duration,
            isPaused: report.isPaused,
            reportedAt: now
        };
    }

    private reconcileSentItem(newVideoId: string): void {
        const sent = this.db.query<QueueRow, []>("SELECT * FROM queue_items WHERE status = 'sent'").get();
        if (!sent) {
            return;
        }
        if (sent.video_id === newVideoId) {
            this.setQueueStatus(sent.id, "played");
            return;
        }
        if (sent.send_attempts >= MAX_SEND_ATTEMPTS) {
            console.error(`Giving up on queue item ${sent.id} (${sent.video_id}) after ${sent.send_attempts} attempts`);
            this.setQueueStatus(sent.id, "removed");
            return;
        }
        this.setQueueStatus(sent.id, "pending");
    }

    private assertNotDuplicate(videoId: string): void {
        const queued = this.db.query("SELECT 1 FROM queue_items WHERE video_id = ? AND status IN ('pending', 'sent')").get(videoId);
        if (queued) {
            throw new MusicError("That song is already in the queue");
        }

        const settings = getSettings(this.db);
        const since = this.clock() - settings.duplicateWindowHours * HOUR_MS;
        const recentlyPlayed = this.db.query("SELECT 1 FROM plays WHERE video_id = ? AND started_at >= ?").get(videoId, since);
        if (recentlyPlayed) {
            throw new MusicError(`That song was played in the last ${settings.duplicateWindowHours} hours`);
        }
    }

    private listQueue(): QueueItem[] {
        const rows = this.db.query<QueueRow, []>(
            "SELECT * FROM queue_items WHERE status IN ('pending', 'sent') ORDER BY CASE status WHEN 'sent' THEN 0 ELSE 1 END, id"
        ).all();
        return rows.map(toQueueItem);
    }

    private setQueueStatus(itemId: number, status: QueueStatus): void {
        this.db.query("UPDATE queue_items SET status = ? WHERE id = ?").run(status, itemId);
    }

    private livePosition(current: CurrentPlay, now: number): number {
        if (current.isPaused) {
            return current.position;
        }
        return current.position + (now - current.reportedAt) / 1000;
    }

    private countVotesForPlay(playId: number): number {
        const row = this.db.query<{ total: number }, [number]>("SELECT COUNT(*) AS total FROM votes WHERE play_id = ?").get(playId);
        return row?.total ?? 0;
    }

    private countVotesForUserToday(userId: number): number {
        const today = nzDate(this.clock());
        const row = this.db.query<{ total: number }, [number, string]>("SELECT COUNT(*) AS total FROM votes WHERE user_id = ? AND nz_date = ?").get(userId, today);
        return row?.total ?? 0;
    }
}
