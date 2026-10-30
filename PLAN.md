# Bingo Caller — Plan

A self-hosted, browser-based 90-ball bingo caller. A human reads the numbers out; the app draws them, displays them clearly, and keeps track of what's been called.

## Goals

- Draw numbers 1–90 with no repeats, fairly (cryptographically random).
- Two modes:
  - **Manual** — press **Release ball** to draw the next number.
  - **Auto** — draws a ball every N seconds, with an adjustable speed and pause/resume.
- Display:
  - **Current ball** — large and prominent, readable from across a room.
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
│   └── game.js         # Pure game logic, no DOM — unit-testable
├── tests/
│   ├── game.test.js    # Unit tests (node:test, zero deps)
│   └── e2e/            # Playwright specs
├── Dockerfile          # nginx-unprivileged serving public/
├── compose.yaml
├── nginx.conf          # security headers, CSP, caching
└── README.md
```

### Game logic (`game.js`)

Pure functions over a plain state object so it's trivial to test and persist:

```js
state = {
  sequence: [/* 90 numbers, shuffled at game start */],
  drawnCount: 0,
  autoIntervalMs: 5000,
}
```

- `newGame()` — Fisher–Yates shuffle of 1..90 using `crypto.getRandomValues` (not `Math.random`).
- `draw(state)` — returns new state with `drawnCount + 1`; no-op once all 90 are out.
- `undo(state)` — steps back one ball (for mis-clicks).
- Derived views: `current`, `lastThree`, `calledSet`, `remaining`.

Shuffling up front (rather than picking randomly per draw) makes the game a deterministic replay of one list, which keeps undo and persistence simple.

### Persistence & recovery

State is saved to `localStorage` after every change. A page refresh, browser crash or accidental tab close mid-game restores exactly where you were. Auto mode always resumes **paused** after a reload so it never fires balls before the caller is ready.

### UI (`app.js`)

**Target setup:** a laptop plugged into a TV over HDMI, the caller driving it from the laptop keyboard. Design for 1920×1080 landscape, read from across a room:

- All sizing in viewport units (`vw`/`vh`/`clamp()`), so it scales to whatever resolution the TV negotiates, with no scrolling at 16:9.
- Dark background, high-contrast numbers, large bold digits. TVs often overscan, so keep a safe margin (~3%) around the edges.
- **Screen Wake Lock API** keeps the laptop from dimming or sleeping mid-game.
- In fullscreen, the mouse cursor hides after a few seconds idle.
- Controls stay visible but visually quiet so the numbers dominate the TV.

Layout:

```
┌───────────────────────────────┬─────────────────────────────┐
│                               │  1  2  3  4  5  6  7  8  9 10│
│          ( 47 )               │ 11 12 13 14 15 16 17 18 19 20│
│       current ball            │ 21 ...                       │
│                               │ ...                          │
│   ( 12 )  ( 88 )  ( 3 )       │ 81 82 83 84 85 86 87 88 89 90│
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
- **New game** and **Undo** require confirmation (an accidental "New game" mid-session is the one catastrophic UX failure here).
- **Keyboard**: `Space` = release ball, `A` = toggle auto, `F` = fullscreen. Useful with a clicker/presenter remote.
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

- At container start, a small script in `/docker-entrypoint.d/` (a hook the nginx image supports) renders these into `config.json`. The script writes to a tmpfs, so the container stays read-only.
- `app.js` fetches `config.json` on load. If the file is missing or invalid (for example when served by `python3 -m http.server`), it falls back to the built-in defaults above.
- Values are validated (numbers only, min ≤ default ≤ max, min ≥ 1 s), and the entrypoint fails fast with a clear error rather than serving a broken config.
- The slider is the per-session control; the env vars set its bounds and starting point. A speed the caller picks on the slider persists in `localStorage` and wins over the default, clamped to the configured range.

## Hosting

- `nginxinc/nginx-unprivileged:alpine` image, copying `public/` in.
- `compose.yaml` with `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges`, healthcheck, restart policy.
- `nginx.conf` sets a strict CSP (`default-src 'self'`), `X-Content-Type-Options`, `Referrer-Policy`, and no-cache on `index.html`.
- No volumes and no data to back up — the image *is* the deployment. Recovery = `docker compose up -d`.
- Also works with zero infrastructure: open `public/index.html` via any static server (`python3 -m http.server`).

## Testing

- **Unit** (`node --test`): shuffle produces a permutation of 1..90; draw never repeats; draw past 90 is a no-op; undo reverses draw; derived views (last three etc.) are correct at the edges (0, 1, 2, 3, 90 drawn).
- **E2E** (Playwright): release ball updates main ball, last-3 and board; auto mode draws on a timer (using Playwright's clock API so tests don't actually wait); speed change; custom speed range from `config.json`; fallback when it is missing; undo; new game confirmation; state survives reload; game ends cleanly at 90.
- **CI**: GitHub Actions running unit + Playwright, plus building the Docker image.

## Delivery phases

1. **Core** — `game.js` + unit tests.
2. **UI** — layout, manual release, board highlighting, last 3, persistence.
3. **Auto mode** — timer, speed slider, countdown, pause/resume, `config.json` loading with fallback defaults.
4. **Polish** — undo, new game confirm, keyboard shortcuts, fullscreen, animations.
5. **Ship** — Dockerfile, compose, config entrypoint script, nginx hardening, Playwright suite, CI.

## Future ideas

- Voice calling via the browser's built-in Web Speech API (local, no cloud), optionally with traditional calls ("Legs eleven", "Two fat ladies").
- Separate **caller** and **display** views — same machine via `BroadcastChannel` (no backend), or across devices via a tiny WebSocket server.
- Game history / export of the called sequence (useful for verifying a disputed claim).
- "Check a ticket" helper: type in a player's numbers and see which are called.

## Decisions

- **Ball display:** current ball plus the three before it (4 in total).
- **Primary display:** a TV driven by a laptop over HDMI.
- **Auto speed:** 3–15 s, default 5 s, configurable through env vars.
