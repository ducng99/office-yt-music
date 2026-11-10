import type { Database } from "bun:sqlite";
import type { AdminUser, SessionUser } from "@office-music/shared";

const SESSION_LIFETIME_MS = 1000 * 60 * 60 * 24 * 30;
const MIN_PASSWORD_LENGTH = 6;

interface UserRow {
    id: number;
    username: string;
    password_hash: string;
    is_admin: number;
    disabled: number;
    created_at: string;
}

export class UserError extends Error {}

function toSessionUser(row: UserRow): SessionUser {
    return { id: row.id, username: row.username, isAdmin: row.is_admin === 1 };
}

function validatePassword(password: string): void {
    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new UserError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
}

export async function createUser(db: Database, username: string, password: string, isAdmin: boolean): Promise<SessionUser> {
    const cleanUsername = username.trim();
    if (!/^[A-Za-z0-9._-]{2,32}$/.test(cleanUsername)) {
        throw new UserError("Username must be 2-32 characters: letters, numbers, dot, dash or underscore");
    }
    validatePassword(password);

    const existing = db.query("SELECT id FROM users WHERE username = ?").get(cleanUsername);
    if (existing) {
        throw new UserError("Username already exists");
    }

    const passwordHash = await Bun.password.hash(password);
    const row = db.query<UserRow, [string, string, number, string]>(
        "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?) RETURNING *"
    ).get(cleanUsername, passwordHash, isAdmin ? 1 : 0, new Date().toISOString());

    if (!row) {
        throw new UserError("Failed to create user");
    }
    return toSessionUser(row);
}

export async function verifyLogin(db: Database, username: string, password: string): Promise<SessionUser | null> {
    const row = db.query<UserRow, [string]>("SELECT * FROM users WHERE username = ?").get(username.trim());
    if (!row || row.disabled === 1) {
        return null;
    }
    const valid = await Bun.password.verify(password, row.password_hash);
    return valid ? toSessionUser(row) : null;
}

export async function changePassword(db: Database, userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const row = db.query<UserRow, [number]>("SELECT * FROM users WHERE id = ?").get(userId);
    if (!row) {
        throw new UserError("User not found");
    }
    const valid = await Bun.password.verify(currentPassword, row.password_hash);
    if (!valid) {
        throw new UserError("Current password is incorrect");
    }
    await setPassword(db, userId, newPassword);
}

export async function setPassword(db: Database, userId: number, newPassword: string): Promise<void> {
    validatePassword(newPassword);
    const passwordHash = await Bun.password.hash(newPassword);
    db.query("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
    db.query("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function listUsers(db: Database): AdminUser[] {
    const rows = db.query<UserRow, []>("SELECT * FROM users ORDER BY username COLLATE NOCASE").all();
    return rows.map((row) => ({
        ...toSessionUser(row),
        disabled: row.disabled === 1,
        createdAt: row.created_at
    }));
}

export function updateUserFlags(db: Database, userId: number, changes: { isAdmin?: boolean; disabled?: boolean }): void {
    if (changes.isAdmin !== undefined) {
        db.query("UPDATE users SET is_admin = ? WHERE id = ?").run(changes.isAdmin ? 1 : 0, userId);
    }
    if (changes.disabled !== undefined) {
        db.query("UPDATE users SET disabled = ? WHERE id = ?").run(changes.disabled ? 1 : 0, userId);
        if (changes.disabled) {
            db.query("DELETE FROM sessions WHERE user_id = ?").run(userId);
        }
    }
}

export function deleteUser(db: Database, userId: number): void {
    db.query("DELETE FROM users WHERE id = ?").run(userId);
}

export function createSession(db: Database, userId: number, now: number): { id: string; expiresAt: number } {
    const id = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    const expiresAt = now + SESSION_LIFETIME_MS;
    db.query("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, userId, expiresAt);
    return { id, expiresAt };
}

export function getSessionUser(db: Database, sessionId: string, now: number): SessionUser | null {
    const row = db.query<UserRow & { expires_at: number }, [string]>(
        "SELECT users.*, sessions.expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ?"
    ).get(sessionId);

    if (!row || row.disabled === 1) {
        return null;
    }
    if (row.expires_at < now) {
        deleteSession(db, sessionId);
        return null;
    }
    return toSessionUser(row);
}

export function deleteSession(db: Database, sessionId: string): void {
    db.query("DELETE FROM sessions WHERE id = ?").run(sessionId);
}
