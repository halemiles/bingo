# Bingo Caller — Plan

A self-hosted, browser-based 90-ball bingo caller. A human reads the numbers out; the app draws them, displays them clearly, and keeps track of what's been called.

The caller is a child, so the current ball's text needs to be easy to read aloud, and the house "bingo calls" (e.g. "Two fat ladies 88") are shown alongside the number.

## Goals

- Draw numbers 1–90 with no repeats, fairly (cryptographically random).
- Two modes:
  - **Manual** — press **Release ball** to draw the next number.
  - **Auto** — draws a ball every N seconds, with an adjustable speed and pause/resume.
- Display:
  - **Current ball** — large and prominent, readable from across a room, with its bingo call underneath when it has one.
  - **Last 3 balls** — the three called before the current one (4 balls on screen in total).
  - **Board** — all 90 numbers in a grid; called numbers highlighted green.
- Runs entirely in the browser, self-hosted, no accounts, no external calls.

## Non-goals (for now)

- Voice calling (a human calls the numbers).
- Player tickets / automatic winner detection.
- Multi-device sync (e.g. phone as remote, TV as display).

## Architecture

**Static site, no backend.** Plain HTML + CSS + vanilla JS (ES modules), no build step.

Why: the whole game state is "a shuffled list of 90 numbers and how far through it we are". There is nothing a server needs to do, so a backend would only add attack surface, moving parts and things to back up. If multi-device sync is wanted later, that's the point to add one.

```
bingo/
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js          # UI wiring: DOM, timers, buttons, keyboard
│   ├── game.js         # Pure game logic, no DOM — unit-testable
│   ├── calls.js        # Loads + validates data/calls.json
│   ├── config.js       # Loads + validates config.json (auto speed)
│   ├── data/calls.json # The house bingo calls, editable
│   └── fonts/          # Self-hosted reading font (no CDN)
├── docker/
│   ├── nginx.conf          # security headers, CSP, caching
│   └── 40-bingo-config.sh  # env vars -> config.json at container start
├── scripts/serve.js    # zero-dependency dev server (npm start, Playwright)
├── tests/
│   ├── unit/           # node:test, zero deps
│   └── e2e/            # Playwright specs
├── Dockerfile          # nginx-unprivileged serving public/
├── compose.yaml
└── README.md
```

### Game logic (`game.js`)

Pure functions over a plain state object so it's trivial to test and persist:

```js
state = {
  sequence: [/* 90 numbers, shuffled at game start */],
  drawnCount: 0,
}
```

- `newGame()` — Fisher–Yates shuffle of 1..90 using `crypto.getRandomValues` (not `Math.random`).
- `draw(state)` — returns new state with `drawnCount + 1`; no-op once all 90 are out.
- `undo(state)` — steps back one ball (for mis-clicks).
- Derived views: `currentBall`, `recentBalls`, `calledBalls`, `isFinished`.

The auto speed is a per-browser setting stored separately, not part of the game.

Shuffling up front (rather than picking randomly per draw) makes the game a deterministic replay of one list, which keeps undo and persistence simple.

### Bingo calls (`calls.json`)

A plain map of number → the exact phrase to read out. Only numbers with a call are listed; everything else just shows the number.

```json
{
  "4":  "Number 4 on his own",
  "11": "Legs 11",
  "22": "Two ducks 22",
  "69": "Brighton line 69",
  "88": "Two fat ladies 88"
}
```

- The phrase is stored **exactly as it's read aloud**, number included, rather than built from a template. "Number 4 on his own" and "Legs 11" put the number in different places, and a child reading it shouldn't have to do any assembly. What's on screen is what gets said.
- Seeded with the house calls above. Adding one is a one-line edit to the file in Git.
- `compose.yaml` bind-mounts the `public/data/` directory read-only over the bundled copy, so a new call goes live with a browser refresh, with no rebuild. It mounts the directory rather than the single file because many editors save by replacing the file, and a single-file bind mount would keep serving the old copy. Without the mount, the bundled file is used.
- `calls.js` validates on load: keys must be whole numbers 1–90 and values non-empty strings. Bad entries are skipped with a console warning rather than breaking the game. A missing or malformed file means "no calls", and the game still works.
- Calls are rendered with `textContent`, never `innerHTML`, so an edited file can't inject markup.
- When voice is added later, the same phrases feed straight into speech.

### Persistence & recovery

State is saved to `localStorage` after every change. A page refresh, browser crash or accidental tab close mid-game restores exactly where you were. Auto mode always resumes **paused** after a reload so it never fires balls before the caller is ready.

### UI (`app.js`)

**Target setup:** a laptop plugged into a TV over HDMI, the caller driving it from the laptop keyboard. Design for 1920×1080 landscape, read from across a room:

- All sizing in viewport units (`vw`/`vh`/`clamp()`), so it scales to whatever resolution the TV negotiates, with no scrolling at 16:9.
- Dark background, high-contrast numbers, large bold digits. TVs often overscan, so keep a safe margin (~3%) around the edges.
- **Screen Wake Lock API** keeps the laptop from dimming or sleeping mid-game. Browsers only allow it on HTTPS or `localhost`; over plain `http://<lan-ip>` the laptop's own sleep settings apply.
- In fullscreen, the mouse cursor hides after a few seconds idle.
- Controls stay visible but visually quiet so the numbers dominate the TV.

**Readable for a child caller:**

- The call phrase sits directly under the current ball in large text, so it can be read off the laptop screen or the TV.
- Font: [Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/), designed for legibility (distinct letterforms, unambiguous digits like 6/9 and 1/7). It's under the Open Font License and bundled in `public/fonts/`, so there are no third-party font requests.
- Manual mode lets the caller go at their own pace: one press of `Space` per ball. Calls take longer to read than bare numbers, so in Auto mode the slider may want to sit a little higher than 5 s.

Layout:

```
┌───────────────────────────────┬─────────────────────────────┐
│                               │  1  2  3  4  5  6  7  8  9 10│
│          ( 88 )               │ 11 12 13 14 15 16 17 18 19 20│
│     "Two fat ladies 88"       │ 21 ...                       │
│                               │ ...                          │
│   ( 12 )  ( 47 )  ( 3 )       │ 81 82 83 84 85 86 87 88 89 90│
│        last 3 balls           │                              │
├───────────────────────────────┴─────────────────────────────┤
│ [Release ball]  [▶ Auto]  speed: ──●── 5s   [Undo] [New game]│
│ Called: 23 / 90                                     [⛶ Full] │
└─────────────────────────────────────────────────────────────┘
```

- Board is 9 rows × 10 columns (1–10, 11–20, … 81–90), the conventional UK layout.
- Newly drawn ball gets a brief highlight/animation on both the main ball and the board cell.
- **Auto mode**: toggle button + speed slider (3–15 s, default 5 s, range configurable — see [Configuration](#configuration)). The chosen speed is remembered between games. Changing speed takes effect on the next tick. While Auto is running, **Release ball** draws immediately and restarts the countdown. A small countdown indicator shows time to next ball.
- Auto stops automatically when all 90 are drawn.
- **New game** and **Undo** require confirmation in an in-page `<dialog>` (an accidental "New game" mid-session is the one catastrophic UX failure here). Cancel has focus by default, so a stray `Space` is harmless. A native `confirm()` would kick the browser out of fullscreen.
- **Keyboard**: `Space` = release ball, `A` = toggle auto, `F` = fullscreen. Useful with a clicker/presenter remote. `Space` always releases a ball even when a button has focus, so a child pressing it can't toggle something else by accident.
- Fullscreen button (Fullscreen API) for TV use.
- Accessibility: called state isn't conveyed by colour alone (bold + tick/strike style as well as green); `aria-live` region announces the current ball for screen readers.

## Configuration

The auto speed range is configured declaratively through environment variables in `compose.yaml`, so the settings live in Git alongside the deployment:

```yaml
environment:
  AUTO_MIN_SECONDS: 3
  AUTO_MAX_SECONDS: 15
  AUTO_DEFAULT_SECONDS: 5
  AUTO_STEP_SECONDS: 1
```

- At container start, a small script in `/docker-entrypoint.d/` (a hook the nginx image supports) renders these into `config.json`. The script writes to a tmpfs at `/tmp/bingo`, which nginx serves as `/config.json`, so the container stays read-only.
- `app.js` fetches `config.json` on load. If the file is missing or invalid (for example when served by `python3 -m http.server`), it falls back to the built-in defaults above.
- Values are validated (whole seconds, 1–3600, min ≤ default ≤ max), and the entrypoint fails fast with a clear error rather than serving a broken config. An empty value means "use the default".
- The slider is the per-session control; the env vars set its bounds and starting point. A speed the caller picks on the slider persists in `localStorage` and wins over the default, clamped to the configured range.

## Hosting

- `nginxinc/nginx-unprivileged:alpine` image, copying `public/` in.
- `compose.yaml` with `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges`, healthcheck, restart policy.
- `nginx.conf` sets a strict CSP (`default-src 'none'`, then only `'self'` for scripts, styles, fonts and images), `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`. Everything is served `Cache-Control: no-cache` (cheap 304 revalidation), so a new image or an edited `calls.json` shows up on the next refresh.
- nginx listens on IPv4 only. An IPv6 listener crashes nginx on Docker hosts with IPv6 disabled, which is common in homelabs.
- Healthcheck on `/healthz`, checking every second during start-up and every 30 s after.
- No game data to back up. The only mount is `public/data/` holding `calls.json` (read-only, and it lives in Git). Recovery = `git clone` + `docker compose up -d`.
- Also works with zero infrastructure: open `public/index.html` via any static server (`python3 -m http.server`).

## Testing

- **Unit** (`node --test`): shuffle produces a permutation of 1..90; draw never repeats; draw past 90 is a no-op; undo reverses draw; derived views (last three etc.) are correct at the edges (0, 1, 2, 3, 90 drawn). The bundled `calls.json` is valid; the loader skips bad keys/values and treats a malformed file as empty.
- **E2E** (Playwright): release ball updates main ball, last-3 and board; a ball with a call shows its phrase, a ball without one shows none (using a seeded sequence so the test knows which ball comes next); a missing `calls.json` doesn't break the game; auto mode draws on a timer (using Playwright's clock API so tests don't actually wait); speed change; custom speed range from `config.json`; fallback when it is missing; undo; new game confirmation; state survives reload; game ends cleanly at 90.
- **Entrypoint** (`node:test` running the script with `sh`): defaults, custom values, leading zeros, and each kind of bad value fails with a clear message.
- **CI**: GitHub Actions with two jobs. One runs unit + Playwright against the dev server. The other builds the image, checks a bad config stops the container, runs it hardened, and runs the same Playwright suite against it. Actions are pinned to commit SHAs.

## Delivery phases

All five phases are built.

1. **Core** — `game.js`, `calls.js` + unit tests.
2. **UI** — layout, manual release, call phrase under the current ball, board highlighting, last 3, persistence, bundled font.
3. **Auto mode** — timer, speed slider, countdown, pause/resume, `config.json` loading with fallback defaults.
4. **Polish** — undo, new game confirm, keyboard shortcuts, fullscreen, animations.
5. **Ship** — Dockerfile, compose, config entrypoint script, nginx hardening, Playwright suite, CI.

## Future ideas

- Voice calling via the browser's built-in Web Speech API (local, no cloud), reading the phrases from `calls.json`.
- An in-app editor for calls, so the caller can add new ones themselves. It would need somewhere to save them: `localStorage` for one browser, or a small backend for anything shared.
- Separate **caller** and **display** views — same machine via `BroadcastChannel` (no backend), or across devices via a tiny WebSocket server.
- Game history / export of the called sequence (useful for verifying a disputed claim).
- "Check a ticket" helper: type in a player's numbers and see which are called.

## Decisions

- **Ball display:** current ball plus the three before it (4 in total).
- **Primary display:** a TV driven by a laptop over HDMI.
- **Auto speed:** 3–15 s, default 5 s, configurable through env vars.
- **Caller:** a child reads the numbers aloud; the house calls are shown under the current ball, stored as editable data in `calls.json`.
