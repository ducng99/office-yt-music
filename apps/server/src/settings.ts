import type { Database } from "bun:sqlite";
import type { Settings } from "@office-music/shared";

const DEFAULTS: Settings = {
    skipThreshold: 3,
    dailyVoteLimit: 3,
    duplicateWindowHours: 4
};

const KEYS: Record<keyof Settings, string> = {
    skipThreshold: "skip_threshold",
    dailyVoteLimit: "daily_vote_limit",
    duplicateWindowHours: "duplicate_window_hours"
};

const CONTROLLER_TOKEN_KEY = "controller_token";

export class SettingsError extends Error {}

function readValue(db: Database, key: string): string | null {
    const row = db.query<{ value: string }, [string]>("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : null;
}

function writeValue(db: Database, key: string, value: string): void {
    db.query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function getSettings(db: Database): Settings {
    const settings = { ...DEFAULTS };
    for (const name of Object.keys(KEYS) as (keyof Settings)[]) {
        const value = readValue(db, KEYS[name]);
        if (value !== null) {
            settings[name] = Number(value);
        }
    }
    return settings;
}

export function updateSettings(db: Database, changes: Partial<Settings>): Settings {
    for (const name of Object.keys(KEYS) as (keyof Settings)[]) {
        const value = changes[name];
        if (value === undefined) {
            continue;
        }
        if (!Number.isInteger(value) || value < 1 || value > 1000) {
            throw new SettingsError(`${name} must be a whole number between 1 and 1000`);
        }
        writeValue(db, KEYS[name], String(value));
    }
    return getSettings(db);
}

export function getControllerToken(db: Database): string {
    const existing = readValue(db, CONTROLLER_TOKEN_KEY);
    if (existing) {
        return existing;
    }
    const token = crypto.randomUUID().replaceAll("-", "");
    writeValue(db, CONTROLLER_TOKEN_KEY, token);
    return token;
}

export function regenerateControllerToken(db: Database): string {
    const token = crypto.randomUUID().replaceAll("-", "");
    writeValue(db, CONTROLLER_TOKEN_KEY, token);
    return token;
}
