# AGENTS.md

Office Music: a web app for controlling the office YouTube Music player. Users sign in, see what's playing, vote anonymously to skip, and add songs. It's a Bun workspace monorepo (`apps/*`, `packages/*`). Use Bun for everything; there is no Node/npm tooling.

## Commands

```sh
bun install
bun run dev                            # apps/server on :3000 with bun --watch, serving apps/web through Vite middleware (HMR)
bun run build                          # web (to apps/web/dist) + extension (to apps/extension/dist)
bun run start                          # server, serves the built web app
bun run create-user <name> --admin     # prompts for a password
bun run test                           # bun test in apps/server
cd apps/server && bun test test/music-service.test.ts -t "<name pattern>"   # single test
bun run lint                           # ESLint; lint:fix to autofix
bunx tsc -p apps/server                # typecheck (no root script; also apps/web, apps/extension, packages/shared)
bun run --cwd apps/extension build     # OM_SERVER_URL / OM_CONTROLLER_TOKEN env or apps/extension/.env
```

Code style is enforced by ESLint (`eslint.config.js`): 4-space indent, double quotes, semicolons, unused args prefixed `_`. Imports between local TS files use explicit `.ts` extensions (in server, extension, shared; the web app uses extensionless imports and `~/*` for `src/*`).

## Architecture

```
 browsers ──HTTP/WS /ws──▶ apps/server (Bun.serve, bun:sqlite) ◀──WS /controller?token=──  apps/extension (Firefox MV3, in the music.youtube.com tab)
                             └─ serves apps/web (static build with SPA fallback; Vite middleware when NODE_ENV=development)
```

- `packages/shared` - types (`types.ts`), the WebSocket protocol (`protocol.ts`) and YouTube URL parsing (`extractVideoId`). Imported as `@office-music/shared` straight from source (no build step). Change the protocol here and update both server and extension.
- `apps/server`
  - `web.ts` serves the web app: with `NODE_ENV=development` (set by `bun run dev`) it runs Vite in middleware mode behind an internal loopback HTTP server (HMR socket on Vite's default port 24678); otherwise it serves `STATIC_DIR` (default `apps/web/dist`) with SPA fallback. `vite` is a dev dependency, loaded via dynamic import and marked `--external` in the Docker bundle.
  - `index.ts` wires everything: `Bun.serve` with the `routes` object (route modules in `src/routes/` each return a route map built from an `AppContext` of `{ db, service, hub }`), the two WebSocket endpoints, web app fallback, and error mapping. Throw `HttpError` for explicit statuses; `MusicError`/`UserError`/`SettingsError` map to 400, `ControllerError` to 503, anything else to 500.
  - `music-service.ts` is the core domain logic (votes, queue, now-playing). It depends on the `Controller` interface, not the hub, and takes an injectable clock - tests use a `FakeController` and `openDatabase(":memory:")`. After any state change it calls `notifyChanged()`, which broadcasts the full `PublicState` to all browsers over the `state` pub/sub topic. Per-user data (`PersonalState`: votes left, whether you voted) is not broadcast; browsers fetch it from `/api/me`.
  - `controller-hub.ts` holds the single controller socket (a newer connection replaces the old one) and turns commands into request/response promises keyed by UUID with a 10s timeout.
  - `db.ts` has an append-only `MIGRATIONS` array tracked via `PRAGMA user_version` - add new migrations as new entries, never edit existing ones. Settings and the controller token live in the `settings` key/value table (`settings.ts`).
  - Daily vote limits reset at midnight NZ time (`nz-date.ts`; votes store an `nz_date` string).
- Queue lifecycle: `queue_items.status` is `pending` -> `sent` -> `played` (or `removed`). At most one item is `sent` at a time; the server sends it to YouTube Music as "Play next" only once something is playing. When the player reports a new video, `reconcileSentItem` marks the sent item played, or returns it to pending (giving up after 2 attempts). When the queue is empty YouTube Music's own autoplay continues. Songs already queued, or played within `duplicateWindowHours`, are rejected.
- `apps/extension` has three script contexts bridged by messages:
  - `page.ts` runs in the page's MAIN world and is the only code touching undocumented YouTube Music internals (`#movie_player`, `ytmusic-app` networkManager, the `#queue` store). It reports the player every second and executes commands. If YouTube Music changes, fix this file.
  - `content.ts` relays between the page (`window.postMessage`) and the background script (runtime port), and writes connection status to `<html data-office-music-status>` for debugging.
  - `background.ts` owns the WebSocket to the server, with reconnect backoff and keepalive pings.
  - `build.ts` bundles with `Bun.build` (IIFE for content/page/background, ESM for options), inlines `OM_SERVER_URL`/`OM_CONTROLLER_TOKEN` via `define`, and adds the server origin to `host_permissions`. To test changes, rebuild and reload it at `about:debugging`. Use `http://127.0.0.1:3000` for a local server, not `localhost`: Firefox resolves that to IPv6 and the server listens on IPv4.
- `apps/web` - Solid SPA built with Vite (`vite-plugin-solid`) and `@solidjs/router`, served as static files by the Bun server. Routes are declared in `src/app.tsx`. `lib/session.ts` holds the global signals (user, personal state, music state) and the `/ws` connection; it refetches `/api/me` when `playId` changes. `lib/api.ts` is the fetch wrapper (throws `ApiError`).
- Auth: cookie session `om_session` (secure when HTTPS or `X-Forwarded-Proto: https`). Admins manage users and settings; only admins can remove queue items.

## Deployment

The `Dockerfile` builds the web app and bundles the server and `create-user` into single files (`server.js`, `create-user.js`). Env vars: `PORT`, `HOST`, `DATA_DIR` (SQLite lives at `$DATA_DIR/office-music.sqlite`, default `apps/server/data/`), `STATIC_DIR`, and `TLS_CERT_FILE` + `TLS_KEY_FILE` (both or neither). The controller token is printed on startup and also shown in the web app's Settings page.
