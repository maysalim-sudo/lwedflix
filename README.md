# Lwedflix

A desktop app for movies, TV shows and anime, with synced watch parties —
for macOS, Windows and Linux.

- Browse and search through TMDB; stream from embedded players, with a
  choice of servers.
- **Watch parties**: start one from any title and share the code or a
  `lwedflix://watch/<CODE>` link. No account needed. Play, pause and seek in
  anyone's player move everyone's.
- Accounts (optional) for friends, messages, posts, watchlists and history,
  on Supabase.
- Updates itself from GitHub Releases.

## How it's built

It's a Next.js app run by an Electron shell. The app needs its server — API
routes, server components, and a server-only TMDB token — so it isn't a
static export: `scripts/build-server.mjs` builds Next's standalone server,
the installer ships it, and `electron/main.js` runs it on `127.0.0.1:47231`
while the intro plays.

```
src/               the app: pages (src/app), components, libraries
electron/
  main.js          window, local server, deep links, updates, player relay
  preload.js       the bridges: intro, app, and the player bridge
  intro/           the launch animation
scripts/           build-server.mjs, make-icon.mjs
build/icon.png     app icon (electron-builder derives .icns/.ico from it)
docs/index.html    the download page (GitHub Pages)
supabase/          database schema, as migrations
```

**The player bridge** is what a website can't do: the preload also runs
inside the embedded players' cross-origin frames (`nodeIntegrationInSubFrames`),
finds the `<video>`, reports its state and applies play/pause/seek. Watch
parties sync through it (`src/lib/partySync.ts`), and progress and episode
auto-marking work on every server because of it.

**Watch parties** are live Supabase Realtime channels (`src/lib/watchRoom.ts`);
nothing is stored. Presence carries only who's there and the title; positions,
chat and sync go over Broadcast, because Realtime closes the channel of a
client that sends more than 5 Presence updates in 30 seconds.

## Setup

Requires Node 22.12+.

```bash
npm install
cp .env.example .env.local   # then fill it in
```

`.env.local` needs a TMDB read access token and a Supabase project. To set up
a new Supabase project, apply `supabase/migrations` in order. The TMDB token
is copied into the app at build time (see `RUNTIME_ENV` in
`scripts/build-server.mjs`), so anyone with the installer can read it;
`NEXT_PUBLIC_*` values are baked in as well.

## Develop

```bash
npm run app        # build the server, then open the app
npm start          # open the app with the server from the last build
npm run dev        # the UI alone in a browser (http://localhost:3000), with hot reload
npm run typecheck
npm run lint
```

In the browser (`npm run dev`) there's no player bridge, so playback doesn't
sync and progress isn't tracked; everything else works.

## Build installers

```bash
npm run dist:mac     # release/Lwedflix-<v>-arm64.dmg, Lwedflix-<v>.dmg (Intel), and .zip for updates
npm run dist:win     # release/Lwedflix-Setup-<v>.exe
npm run dist:linux   # release/Lwedflix-<v>.AppImage, lwedflix_<v>_amd64.deb
npm run dist         # all of them
```

All of these build on a Mac.

- **macOS** builds are ad-hoc signed, not notarized. On first launch, macOS
  blocks the app: System Settings → Privacy & Security → *Open Anyway*.
- **Windows** installers are unsigned; SmartScreen asks once (*More info →
  Run anyway*).
- **Linux**: the AppImage runs on most distros (`chmod +x`, then open), but
  not on Ubuntu 24.04+ without extra setup — use the .deb there
  (`sudo apt install ./lwedflix_<v>_amd64.deb`), which installs the AppArmor
  profile Ubuntu needs, an app-menu entry and the `lwedflix://` handler. The
  .deb is gzip-compressed because xz isn't available on macOS. x64 only; add
  `arm64` to the `linux` targets for ARM machines.

## Release an update

Installed apps check this repo's GitHub Releases 15 seconds after launch and
every 6 hours (also *Check for Updates…* in the menu).

1. Bump `version` in `package.json`.
2. Create a GitHub token with write access to this repo's contents and
   `export GH_TOKEN=<token>`.
3. `npm run release` — builds every platform and uploads the installers and
   `latest*.yml` update feeds to a **draft** release `v<version>`.
4. Publish the draft on GitHub.

Windows and Linux download updates in the background and install on restart.
macOS can only install updates signed with the same Apple Developer ID as the
running app, which ad-hoc builds don't have, so there the app offers the
download instead. Fully automatic macOS updates need a Developer ID ($99/year):
set `mac.identity` to it, re-enable `hardenedRuntime`, add notarization, and
set `CAN_INSTALL_UPDATES` in `electron/main.js` to `true` on macOS too.

## Download page

`docs/index.html` detects the visitor's system (including Apple Silicon vs
Intel where the browser allows), finds the matching installer in the latest
release, and starts the download. Publish it with GitHub Pages: Settings →
Pages → Deploy from a branch → `main`, folder `/docs`. It's then at
https://mohamedelwed.github.io/lwedflix/.

## Logs

The bundled server logs to `server.log`, updates to `updates.log`, in the
app's log folder: `~/Library/Logs/Lwedflix` on macOS, `%APPDATA%\Lwedflix\logs`
on Windows, `~/.config/Lwedflix/logs` on Linux.

## Note on this codebase

The app uses Next.js 16, whose APIs differ from older versions — see
`AGENTS.md`.
