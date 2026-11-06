import type { Database } from "bun:sqlite";
import type { Branding, Settings } from "@office-music/shared";

const DEFAULTS: Settings = {
    skipThreshold: 3,
    dailyVoteLimit: 3,
    duplicateWindowHours: 4,
    voteWindowSeconds: 60,
    maxQueuedPerUser: 5
};

const KEYS: Record<keyof Settings, string> = {
    skipThreshold: "skip_threshold",
    dailyVoteLimit: "daily_vote_limit",
    duplicateWindowHours: "duplicate_window_hours",
    voteWindowSeconds: "vote_window_seconds",
    maxQueuedPerUser: "max_queued_per_user"
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

const DEFAULT_SITE_NAME = "Office Music";
const MAX_SITE_NAME_LENGTH = 50;
const MAX_LOGO_LENGTH = 700_000;
const LOGO_PATTERN = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

export function getBranding(db: Database): Branding {
    return {
        siteName: readValue(db, "site_name") ?? DEFAULT_SITE_NAME,
        logo: readValue(db, "site_logo") || null,
        logoOnly: readValue(db, "logo_only") === "1"
    };
}

export function updateBranding(db: Database, changes: Partial<Branding>): Branding {
    if (changes.siteName !== undefined) {
        const siteName = String(changes.siteName).trim();
        if (siteName.length < 1 || siteName.length > MAX_SITE_NAME_LENGTH) {
            throw new SettingsError(`Site name must be 1 to ${MAX_SITE_NAME_LENGTH} characters`);
        }
        writeValue(db, "site_name", siteName);
    }
    if (changes.logo !== undefined) {
        if (changes.logo === null) {
            writeValue(db, "site_logo", "");
        } else {
            if (typeof changes.logo !== "string" || changes.logo.length > MAX_LOGO_LENGTH || !LOGO_PATTERN.test(changes.logo)) {
                throw new SettingsError("Logo must be a PNG, JPEG, GIF, WebP or SVG image under 500 KB");
            }
            writeValue(db, "site_logo", changes.logo);
        }
    }
    if (changes.logoOnly !== undefined) {
        writeValue(db, "logo_only", changes.logoOnly === true ? "1" : "0");
    }
    const branding = getBranding(db);
    if (branding.logoOnly && !branding.logo) {
        writeValue(db, "logo_only", "0");
        branding.logoOnly = false;
    }
    return branding;
}
