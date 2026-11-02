import { Database } from "bun:sqlite";

const MIGRATIONS: string[] = [
    `
    CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );

    CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
    );

    CREATE TABLE plays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        thumbnail TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        skipped_by_vote INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX plays_video_started ON plays(video_id, started_at);

    CREATE TABLE votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        play_id INTEGER NOT NULL REFERENCES plays(id) ON DELETE CASCADE,
        nz_date TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, play_id)
    );
    CREATE INDEX votes_user_date ON votes(user_id, nz_date);

    CREATE TABLE queue_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        video_id TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        thumbnail TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        send_attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX queue_items_status ON queue_items(status);

    CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    `
];

export function openDatabase(path: string): Database {
    const db = new Database(path, { create: true, strict: true });
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA foreign_keys = ON");
    migrate(db);
    return db;
}

function migrate(db: Database): void {
    const row = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
    const currentVersion = row?.user_version ?? 0;

    for (let version = currentVersion; version < MIGRATIONS.length; version++) {
        db.transaction(() => {
            db.run(MIGRATIONS[version]);
            db.run(`PRAGMA user_version = ${version + 1}`);
        })();
    }
}
