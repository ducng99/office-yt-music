import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import type { ControllerCommand, PlayerReport, PublicState, SearchResult, SessionUser } from "@office-music/shared";
import { openDatabase } from "../src/db.ts";
import { MusicService } from "../src/music-service.ts";
import { updateSettings } from "../src/settings.ts";
import { createUser } from "../src/users.ts";
import type { Controller } from "../src/controller-hub.ts";

class FakeController implements Controller {
    online = true;
    commands: ControllerCommand[] = [];
    failNext = false;

    async send(command: ControllerCommand): Promise<SearchResult[]> {
        this.commands.push(command);
        if (this.failNext) {
            this.failNext = false;
            throw new Error("boom");
        }
        if (command.type === "lookup") {
            return [{ videoId: command.videoId, title: `Song ${command.videoId}`, artist: "Artist", thumbnail: "", album: "", durationText: "3:00" }];
        }
        return [];
    }

    commandTypes(): string[] {
        return this.commands.map((command) => command.type);
    }
}

function videoId(n: number): string {
    return `video${String(n).padStart(6, "0")}`;
}

function report(id: string): PlayerReport {
    return { videoId: id, title: `Song ${id}`, artist: "Artist", thumbnail: "", position: 0, duration: 180, isPaused: false };
}

function member(userId: number): SessionUser {
    return { id: userId, username: "member", isAdmin: false };
}

function admin(userId: number): SessionUser {
    return { id: userId, username: "admin", isAdmin: true };
}

// 2026-11-03 10:00 NZDT (UTC+13)
const MORNING_NZ = Date.UTC(2026, 10, 2, 21, 0, 0);

let db: Database;
let controller: FakeController;
let service: MusicService;
let now: number;
let lastState: PublicState | null;
let userIds: number[];

beforeEach(async () => {
    db = openDatabase(":memory:");
    controller = new FakeController();
    now = MORNING_NZ;
    lastState = null;
    service = new MusicService(db, controller, (state) => {
        lastState = state;
    }, () => now);

    userIds = [];
    for (const name of ["alice", "bob", "carol", "dave"]) {
        const user = await createUser(db, name, "password123", false);
        userIds.push(user.id);
    }
});

describe("voting", () => {
    test("rejects voting when nothing is playing", async () => {
        await expect(service.vote(userIds[0])).rejects.toThrow("Nothing is playing");
    });

    test("one vote per user per song", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        await service.vote(userIds[0]);
        await expect(service.vote(userIds[0])).rejects.toThrow("already voted");
        expect(service.publicState().votes.voteCount).toBe(1);
    });

    test("skips when the threshold is reached", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        await service.vote(userIds[0]);
        await service.vote(userIds[1]);
        expect(controller.commandTypes()).not.toContain("skip");

        await service.vote(userIds[2]);
        expect(controller.commandTypes()).toContain("skip");
        await expect(service.vote(userIds[3])).rejects.toThrow("already being skipped");
    });

    test("respects a configured threshold", async () => {
        updateSettings(db, { skipThreshold: 1 });
        await service.handlePlayerReport(report(videoId(1)));
        await service.vote(userIds[0]);
        expect(controller.commandTypes()).toContain("skip");
    });

    test("re-enables voting if the skip command fails", async () => {
        updateSettings(db, { skipThreshold: 1 });
        await service.handlePlayerReport(report(videoId(1)));
        controller.failNext = true;
        await service.vote(userIds[0]);
        await service.vote(userIds[1]);
        expect(controller.commandTypes().filter((type) => type === "skip")).toHaveLength(2);
    });

    test("limits each user to 3 votes per NZ day", async () => {
        for (let n = 1; n <= 3; n++) {
            await service.handlePlayerReport(report(videoId(n)));
            await service.vote(userIds[0]);
        }
        expect(service.personalState(userIds[0]).votesLeftToday).toBe(0);

        await service.handlePlayerReport(report(videoId(4)));
        await expect(service.vote(userIds[0])).rejects.toThrow("used all 3");
    });

    test("vote allowance resets at midnight NZ time", async () => {
        for (let n = 1; n <= 3; n++) {
            await service.handlePlayerReport(report(videoId(n)));
            await service.vote(userIds[0]);
        }

        // 23:59 NZ, same day
        now = Date.UTC(2026, 10, 3, 10, 59, 0);
        await service.handlePlayerReport(report(videoId(4)));
        await expect(service.vote(userIds[0])).rejects.toThrow("used all 3");

        // 00:01 NZ, next day
        now = Date.UTC(2026, 10, 3, 11, 1, 0);
        await service.handlePlayerReport(report(videoId(5)));
        expect(service.personalState(userIds[0]).votesLeftToday).toBe(3);
        await service.vote(userIds[0]);
        expect(service.personalState(userIds[0]).votesLeftToday).toBe(2);
    });

    test("allows voting during the first minute of a song", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        now += 59_000;
        await service.vote(userIds[0]);
        expect(service.publicState().votes.voteCount).toBe(1);
    });

    test("rejects voting after the first minute of a song", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        now += 61_000;
        await expect(service.vote(userIds[0])).rejects.toThrow("first 60 seconds");
    });

    test("respects a configured voting window", async () => {
        updateSettings(db, { voteWindowSeconds: 120 });
        await service.handlePlayerReport(report(videoId(1)));
        now += 90_000;
        await service.vote(userIds[0]);
        expect(service.publicState().votes.voteCount).toBe(1);
        expect(service.publicState().votes.windowSeconds).toBe(120);
        expect(service.publicState().votes.secondsLeft).toBe(30);

        await service.handlePlayerReport(report(videoId(2)));
        now += 121_000;
        await expect(service.vote(userIds[0])).rejects.toThrow("first 120 seconds");
    });

    test("uses real time rather than the song position", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        now += 5_000;
        await service.handlePlayerReport({ ...report(videoId(1)), position: 45 });
        now += 30_000;
        expect(service.publicState().votes.secondsLeft).toBe(25);
        await service.vote(userIds[0]);
        expect(service.publicState().votes.voteCount).toBe(1);
    });

    test("keeps counting down while paused", async () => {
        await service.handlePlayerReport({ ...report(videoId(1)), isPaused: true });
        now += 61_000;
        await expect(service.vote(userIds[0])).rejects.toThrow("first 60 seconds");
    });

    test("public state never exposes who voted", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        await service.vote(userIds[0]);
        expect(JSON.stringify(lastState)).not.toContain("alice");
        expect(JSON.stringify(lastState)).not.toContain("\"userId\"");
    });

    test("youVoted resets when the song changes", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        await service.vote(userIds[0]);
        expect(service.personalState(userIds[0]).youVoted).toBe(true);

        await service.handlePlayerReport(report(videoId(2)));
        expect(service.personalState(userIds[0]).youVoted).toBe(false);
        expect(service.publicState().votes.voteCount).toBe(0);
    });
});

describe("queue", () => {
    test("rejects input that isn't a YouTube link or id", async () => {
        await expect(service.addToQueue(userIds[0], "never gonna give you up")).rejects.toThrow("doesn't look like");
    });

    test("accepts YouTube and YouTube Music links", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        const item = await service.addToQueue(userIds[0], "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM");
        expect(item.videoId).toBe("dQw4w9WgXcQ");
        const second = await service.addToQueue(userIds[0], "https://youtu.be/9bZkp7q19f0?si=abc");
        expect(second.videoId).toBe("9bZkp7q19f0");
    });

    test("limits how many songs one user can have queued", async () => {
        updateSettings(db, { maxQueuedPerUser: 2 });
        await service.handlePlayerReport(report(videoId(1)));
        await service.addToQueue(userIds[0], videoId(10));
        await service.addToQueue(userIds[0], videoId(11));

        await expect(service.addToQueue(userIds[0], videoId(12))).rejects.toThrow("can only have 2 songs");
        await service.addToQueue(userIds[1], videoId(13));

        await service.handlePlayerReport(report(videoId(10)));
        await service.handlePlayerReport(report(videoId(11)));
        await service.addToQueue(userIds[0], videoId(12));
    });

    test("sends only one item to the player at a time, in order", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        await service.addToQueue(userIds[0], videoId(10));
        await service.addToQueue(userIds[1], videoId(11));
        await service.addToQueue(userIds[2], videoId(12));

        const playNext = controller.commands.filter((command) => command.type === "playNext");
        expect(playNext).toEqual([{ type: "playNext", videoId: videoId(10) }]);
        expect(service.publicState().queue.map((item) => item.status)).toEqual(["sent", "pending", "pending"]);

        await service.handlePlayerReport(report(videoId(10)));
        expect(controller.commands.at(-1)).toEqual({ type: "playNext", videoId: videoId(11) });
        expect(service.publicState().queue.map((item) => item.videoId)).toEqual([videoId(11), videoId(12)]);

        await service.handlePlayerReport(report(videoId(11)));
        await service.handlePlayerReport(report(videoId(12)));
        expect(service.publicState().queue).toHaveLength(0);
    });

    test("waits for a now-playing report before sending to the player", async () => {
        await service.addToQueue(userIds[0], videoId(10));
        expect(controller.commandTypes()).not.toContain("playNext");

        await service.handlePlayerReport(report(videoId(1)));
        expect(controller.commandTypes()).toContain("playNext");
    });

    test("starts the next queued song when the player is idle", async () => {
        await service.addToQueue(userIds[0], videoId(10));
        await service.handlePlayerIdle();
        expect(controller.commands.at(-1)).toEqual({ type: "play", videoId: videoId(10) });
        expect(service.publicState().queue[0].status).toBe("sent");

        await service.handlePlayerReport(report(videoId(10)));
        expect(service.publicState().queue).toHaveLength(0);
        expect(service.publicState().nowPlaying?.videoId).toBe(videoId(10));
    });

    test("plays a song added while the player is idle", async () => {
        await service.handlePlayerIdle();
        await service.addToQueue(userIds[0], videoId(10));
        expect(controller.commands.at(-1)).toEqual({ type: "play", videoId: videoId(10) });
    });

    test("clears now playing when the player goes idle", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        await service.handlePlayerIdle();
        expect(service.publicState().nowPlaying).toBeNull();
    });

    test("does not repeat the play command while waiting for it to start", async () => {
        await service.addToQueue(userIds[0], videoId(10));
        await service.handlePlayerIdle();
        await service.handlePlayerIdle();
        expect(controller.commands.filter((command) => command.type === "play")).toHaveLength(1);
    });

    test("retries an idle play once, then gives up", async () => {
        await service.addToQueue(userIds[0], videoId(10));
        await service.handlePlayerIdle();
        now += 20_000;
        await service.handlePlayerIdle();
        expect(controller.commands.filter((command) => command.type === "play")).toHaveLength(2);
        now += 20_000;
        await service.handlePlayerIdle();
        expect(service.publicState().queue).toHaveLength(0);
    });

    test("re-sends a lost item once, then gives up", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        await service.addToQueue(userIds[0], videoId(10));

        await service.handlePlayerReport(report(videoId(2)));
        expect(controller.commands.filter((command) => command.type === "playNext")).toHaveLength(2);

        await service.handlePlayerReport(report(videoId(3)));
        expect(service.publicState().queue).toHaveLength(0);
    });

    test("returns the item to pending if play next fails", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        const originalSend = controller.send.bind(controller);
        controller.send = async (command) => {
            if (command.type === "playNext") {
                throw new Error("offline");
            }
            return originalSend(command);
        };
        await service.addToQueue(userIds[0], videoId(10));
        expect(service.publicState().queue[0].status).toBe("pending");
    });

    test("blocks songs that are already queued", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        await service.addToQueue(userIds[0], videoId(10));
        await service.addToQueue(userIds[0], videoId(11));
        await expect(service.addToQueue(userIds[1], videoId(10))).rejects.toThrow("already in the queue");
        await expect(service.addToQueue(userIds[1], videoId(11))).rejects.toThrow("already in the queue");
    });

    test("blocks songs played within the duplicate window", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        await expect(service.addToQueue(userIds[0], videoId(1))).rejects.toThrow("played in the last 4 hours");

        now += 3 * 60 * 60 * 1000;
        await service.handlePlayerReport(report(videoId(2)));
        await expect(service.addToQueue(userIds[0], videoId(1))).rejects.toThrow("played in the last 4 hours");

        now += 2 * 60 * 60 * 1000;
        const item = await service.addToQueue(userIds[0], videoId(1));
        expect(item.videoId).toBe(videoId(1));
    });

    test("removing a pending item drops it from the queue", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        await service.addToQueue(userIds[0], videoId(10));
        const pending = await service.addToQueue(userIds[0], videoId(11));

        await service.removeQueueItem(member(userIds[0]), pending.id);
        expect(service.publicState().queue.map((item) => item.videoId)).toEqual([videoId(10)]);
        expect(controller.commandTypes()).not.toContain("removeFromQueue");
    });

    test("users can only remove their own songs", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        await service.addToQueue(userIds[0], videoId(10));
        const bobs = await service.addToQueue(userIds[1], videoId(11));

        await expect(service.removeQueueItem(member(userIds[0]), bobs.id)).rejects.toThrow("only remove songs you added");
        expect(service.publicState().queue.map((item) => item.videoId)).toEqual([videoId(10), videoId(11)]);

        await service.removeQueueItem(member(userIds[1]), bobs.id);
        expect(service.publicState().queue.map((item) => item.videoId)).toEqual([videoId(10)]);
    });

    test("admins can remove anyone's songs", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        const alices = await service.addToQueue(userIds[0], videoId(10));

        await service.removeQueueItem(admin(userIds[1]), alices.id);
        expect(service.publicState().queue).toEqual([]);
    });

    test("personal state lists the user's queued items", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        const first = await service.addToQueue(userIds[0], videoId(10));
        await service.addToQueue(userIds[1], videoId(11));
        const second = await service.addToQueue(userIds[0], videoId(12));

        expect(service.personalState(userIds[0]).queuedItemIds).toEqual([first.id, second.id]);
        await service.removeQueueItem(member(userIds[0]), first.id);
        expect(service.personalState(userIds[0]).queuedItemIds).toEqual([second.id]);
        expect(service.personalState(userIds[2]).queuedItemIds).toEqual([]);
    });

    test("removing a sent item removes it from the player and sends the next", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        const sent = await service.addToQueue(userIds[0], videoId(10));
        await service.addToQueue(userIds[0], videoId(11));

        await service.removeQueueItem(member(userIds[0]), sent.id);
        expect(controller.commands).toContainEqual({ type: "removeFromQueue", videoId: videoId(10) });
        expect(controller.commands.at(-1)).toEqual({ type: "playNext", videoId: videoId(11) });
        await expect(service.removeQueueItem(member(userIds[0]), sent.id)).rejects.toThrow("no longer in the queue");
    });
});

describe("search", () => {
    test("uses lookup for links and search for text", async () => {
        await service.search("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
        await service.search("rick astley");
        expect(controller.commands).toEqual([
            { type: "lookup", videoId: "dQw4w9WgXcQ" },
            { type: "search", query: "rick astley" }
        ]);
    });
});

describe("golden buzzer", () => {
    test("locks the playing song against skip votes, once per day", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        await service.goldenBuzzer(userIds[0], { playing: true });
        expect(service.publicState().nowPlaying?.golden).toBe(true);
        await expect(service.vote(userIds[1])).rejects.toThrow("golden buzzer");
        await expect(service.goldenBuzzer(userIds[0], { playing: true })).rejects.toThrow();

        now += 24 * 60 * 60 * 1000;
        expect(service.personalState(userIds[0]).goldenBuzzerAvailable).toBe(true);
    });

    test("queued golden song stays golden when played and can't be removed", async () => {
        await service.handlePlayerReport(report(videoId(1)));
        const item = await service.addToQueue(userIds[1], videoId(2));
        await service.goldenBuzzer(userIds[0], { queueItemId: item.id });
        await expect(service.removeQueueItem(admin(1), item.id)).rejects.toThrow("golden");
        await service.handlePlayerReport(report(videoId(2)));
        expect(service.publicState().nowPlaying?.golden).toBe(true);
    });
});
