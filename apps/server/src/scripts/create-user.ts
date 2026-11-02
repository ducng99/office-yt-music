import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { openDatabase } from "../db.ts";
import { UserError, createUser } from "../users.ts";

const args = process.argv.slice(2);
const isAdmin = args.includes("--admin");
const [username] = args.filter((arg) => !arg.startsWith("--"));

if (!username) {
    console.error("Usage: bun run create-user <username> [--admin]");
    process.exit(1);
}

const password = prompt(`Password for ${username}:`);
if (!password) {
    console.error("A password is required");
    process.exit(1);
}

const dataDir = process.env.DATA_DIR ?? join(import.meta.dir, "..", "..", "data");
mkdirSync(dataDir, { recursive: true });
const db = openDatabase(join(dataDir, "office-music.sqlite"));

try {
    const user = await createUser(db, username, password, isAdmin);
    console.log(`Created ${user.isAdmin ? "admin" : "user"} "${user.username}"`);
} catch (error) {
    if (error instanceof UserError) {
        console.error(error.message);
        process.exit(1);
    }
    throw error;
}
