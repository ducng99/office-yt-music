# Office Music

Control the office YouTube Music player from a web page. Everyone signs in, sees what's playing, can vote anonymously to skip (3 votes per person per day, reset at midnight NZ time) and can add songs by name or link.

## How it fits together

```
 browsers ──HTTP/WS──▶ apps/server (Bun, SQLite) ◀──WS── apps/extension (Firefox, in the YouTube Music tab)
                         └─ serves apps/web (Solid SPA)
```

- `apps/server` - Bun server: API, WebSockets, SQLite database (`apps/server/data/`), serves the built web app
- `apps/web` - Solid + Vite SPA (light/dark theme)
- `apps/extension` - Firefox MV3 extension (Firefox 128+) that reads and controls the YouTube Music tab
- `packages/shared` - types and protocol shared by all three

The server keeps the song queue and sends one song at a time to YouTube Music as "Play next". When the queue is empty, YouTube Music keeps playing its own radio/autoplay.

## Server (Docker)

Build and run the image from the repo root (the examples use `https://music.example.com`, replace it with your own domain):

```sh
docker build -t office-music .
docker run -d --name office-music --restart unless-stopped \
    -p 443:3000 \
    -v office-music-data:/data \
    -v /path/to/certs:/certs:ro \
    -e TLS_CERT_FILE=/certs/fullchain.pem \
    -e TLS_KEY_FILE=/certs/privkey.pem \
    office-music
docker logs office-music                                     # prints the controller token
docker exec -it office-music bun create-user.js <name> --admin  # prompts for a password
```

The certificate files must be readable by the container's `bun` user (uid 1000). If a reverse proxy already terminates TLS, leave out the cert volume and the `TLS_*` variables and point the proxy at port 3000 (it must forward WebSocket upgrades for `/ws` and `/controller`, and set `X-Forwarded-Proto: https` so the session cookie is marked secure).

Environment variables: `PORT` (3000), `HOST` (0.0.0.0), `DATA_DIR` (`/data` in Docker), `TLS_CERT_FILE` and `TLS_KEY_FILE` (serve HTTPS directly when both are set).

Without Docker: `bun install`, `bun run build`, then `bun run create-user <name> --admin` and `bun run start`.

Everyone opens your server's URL. Admins create accounts under **Users**.

## Music computer (Firefox extension)

Set the server URL in `apps/extension/.env` (git-ignored, copy it from `apps/extension/.env.example`) or pass it on the command line, then build:

```sh
bun install
bun run --cwd apps/extension build
# or: OM_SERVER_URL=https://music.example.com bun run --cwd apps/extension build
```

`OM_SERVER_URL` becomes the extension's default server URL and is added to its host permissions. It defaults to `http://127.0.0.1:3000`.

1. Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on...** and pick `apps/extension/dist/manifest.json`
2. Click the extension icon in the toolbar, check the server URL and paste the controller token (also shown in **Settings** in the web app)
3. Open https://music.youtube.com, sign in, and start playing something

Temporary add-ons are removed when Firefox restarts. To keep it installed, either sign it as an unlisted add-on on addons.mozilla.org (`bun x web-ext sign --channel=unlisted --source-dir apps/extension/dist` with your AMO API keys) and install the signed `.xpi`, or use Firefox Developer Edition / ESR with `xpinstall.signatures.required` set to `false` in `about:config`.

You can also bake the token into the build so the extension needs no setup: set `OM_CONTROLLER_TOKEN` the same way. The built `dist/` then contains the token, so don't share it.

The extension only has permission to reach the `OM_SERVER_URL` origin, `localhost` and `127.0.0.1`. To switch servers, rebuild with a different `OM_SERVER_URL`. For a local server use `http://127.0.0.1:3000` rather than `localhost`: Firefox resolves `localhost` to IPv6 `::1`, and the server listens on IPv4.

## Development

```sh
bun run dev          # server + web app (Vite with HMR) on :3000
bun run test         # server tests
bun run lint         # ESLint (4-space indent, double quotes, semicolons)
```

After changing the extension, run `bun run --cwd apps/extension build` and click **Reload** on `about:debugging`. The YouTube Music page has a `data-office-music-status` attribute on `<html>` showing the extension's connection state, which helps when debugging.

## When YouTube Music changes

YouTube Music has no public API. Everything that touches its internals is in `apps/extension/src/page.ts`: reading the current track, skipping, "play next", search and lookup. If the controller stops working after a YouTube Music update, that's the file to fix.
