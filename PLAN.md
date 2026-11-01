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
- **Prize stages**: plays for 1 line → 2 lines → full house, shown in a banner across the top. The caller moves on; it's never automatic.
- **Claim checker**: type or paste a player's ticket lines and see whether they've won.
- **Game history**: everything that happened this game, in order, with a text download.
- **Voice calling** (optional, off by default): the browser's own speech reads each ball aloud.
- Runs entirely in the browser, self-hosted, no accounts, no external calls.

## Non-goals (for now)

- Voice replacing the caller. It's off by default and there to help, not to take over.
- Player tickets held in the app / automatic winner detection. The caller checks a claim when someone shouts.
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
│   ├── claims.js       # Pure claim checking: parse ticket lines, check vs. draw
│   ├── history.js      # Pure: the game log as a timeline and as a text file
│   ├── speech-text.js  # Pure: what the voice says for a ball
│   ├── voices.js       # Pure: which voices to offer, and the default
│   ├── calls.js        # Loads + validates data/calls.json
│   ├── config.js       # Loads + validates config.json (auto speed)
│   ├── data/calls.json # The house bingo calls, editable
│   └── fonts/          # Self-hosted reading font (no CDN)
├── docker/
│   ├── nginx.conf          # security headers, CSP, caching
│   └── 40-bingo-config.sh  # env vars -> config.json at container start
├── dev/                # scenario page + shared scenarios (dev server only)
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
  stage: 0, // index into STAGES: 0 = 1 line, 1 = 2 lines, 2 = full house
  log: [],  // what happened, in order (see Game history)
}
```

- `newGame()` — Fisher–Yates shuffle of 1..90 using `crypto.getRandomValues` (not `Math.random`).
- `draw(state)` — returns new state with `drawnCount + 1`; no-op once all 90 are out.
- `undo(state)` — steps back one ball (for mis-clicks).
- Derived views: `currentBall`, `recentBalls`, `calledBalls`, `isFinished`.
- `nextStage(state)` / `setStage(state, i)` — move between prizes; `newGame()` starts at 1 line.
- `restoreGame(saved)` — validates a save and defaults new fields: `stage` to 0 when it's missing or nonsense, and `log` to the balls alone when it's missing or doesn't match them. Games saved by older versions always load with their balls.

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
- The same phrases feed straight into the voice (below).

### Prize stages & checking a claim (`claims.js`)

A game plays for **1 line**, then **2 lines**, then **full house**. The stage is part of the game state, saved with it, and reset by **New game**. It only moves when the caller says so (**Next stage** / `N`), because several people can win on the same ball. Clicking the banner picks a stage directly, to undo a slip.

**Check claim** (`C`) opens a dialog over the game and pauses auto. The caller types or pastes the player's ticket, **one ticket line per line of text**, 5 numbers each: 1 line, 2 lines or 3 lines (15 numbers) depending on the stage.

- `parseClaim(text, lines)` splits on newlines and on spaces, commas or semicolons, and reports **every** problem at once: wrong number of lines, a line without exactly 5 numbers, anything that isn't a whole number 1–90, and a number entered twice anywhere (a ticket never repeats one).
- `checkClaim(lines, state)` — a win when every number is among the drawn balls. It also reports which ball finished the claim and how many balls ago, so a late claim gets a gentle "complete since 61, 3 balls ago". There's deliberately no "must win on the last number" rule: house rules vary and the caller decides.
- `describeResult` builds the words: "1 line! ✅", "Full house! 🎉", or "Not yet: 23 and 61 not called" (a count instead once more than 5 are missing).
- The result shows each entered number marked called (filled, bold) or not (dashed outline), so it doesn't rely on colour.
- After a result: **Check another** keeps the stage, for shared wins. **Next stage** is offered after a win. After a full house, **New game** is offered (still behind the usual confirmation) but never forced.

The checker trusts the caller to type a real ticket line; it doesn't validate 90-ball ticket structure (column ranges, blanks). That would reject typos less clearly than it helps.

### Game history (`history.js`)

For settling a dispute: "when did 61 come out?", "was that line already complete?", "did we move to 2 lines before or after that ball?". The board shows *what* was called, not the order or what happened around it.

- **An append-only log in the game state**: `{ type: 'ball', ball }`, `{ type: 'undo', ball }`, `{ type: 'stage', stage }` and `{ type: 'claim', stage, lines, won, missing, completedBy, ballsAgo }`. `draw`, `undo`, `setStage` and `recordClaim` in `game.js` append to it, so the log can't drift from the game. An undo is an event, not an erasure: the record shows what really happened.
- **Loading** (`restoreGame`): entries that make no sense are dropped, and the ball and undo entries are replayed against the sequence. If they don't come out as exactly the balls drawn (a save from before the log, or a damaged one), the log is rebuilt from the balls alone. A save is never rejected for its history.
- **On screen** (`H`, or the "37 / 90 called" count, which doubles as the button and so costs no footer space): runs of balls as small chips with their place in the draw, interleaved with stage changes, claim checks (numbers and result) and undos. It scrolls inside the dialog, opens scrolled to the newest entry, and pauses auto like every dialog.
- **Download**: `historyText` as a `.txt` named by local date and time, through a `Blob` and an `<a download>`. The clipboard was ruled out because it needs a secure context, and the app is often served over plain `http://` on the LAN.
- **Current game only**: New game clears it, as before. Keeping past games was considered and left out for now; download first to keep a copy.
- No per-ball clock times: the order is what settles a dispute, and timestamps would add to every draw in the save.

### Voice calling (`speech-text.js`, `voices.js`)

The browser's built-in **Web Speech API** reads each ball aloud. No library, no new dependency, and nothing leaves the device. Target: Firefox on a Mac, with the sound going to the TV over HDMI.

- **Off by default** (`M` or the **Voice** button turns it on; remembered in `localStorage`). The child caller stays the star; voice is a helper.
- **What it says** (`spokenText`): the `calls.json` phrase exactly if there is one, otherwise the traditional reading: "4 and 7, 47", "5 oh, 50", "Number 5 on his own" (matching the house call for 4), "9 oh, 90". The screen is unchanged. Spoken at rate 0.9, a little slower for a room.
- **Voices** (`localVoices`, `chooseVoice`): only `localService` voices are offered. Network voices such as Chrome's "Google UK English" send text off the device and fail without Wi-Fi. The default is the best British English voice: Daniel on macOS, preferring a downloaded Premium or Enhanced version. The choice is saved by `voiceURI` and falls back to the default if that voice is uninstalled. Browsers fill in the voice list late, so it's rebuilt on `voiceschanged`.
- **Auto mode waits for the voice**: after a ball, the Auto button shows 🔊 and the countdown starts when the utterance ends, or after an 8 s limit in case the browser never says so. A "turn" counter stops a voice that finishes late (after a pause, or after another ball was released) from starting a stale countdown.
- **Stopping**: undo, new game and pausing auto cancel speech. A new ball cuts off the previous one. The 90th ball, which stops auto by itself, is still said in full.
- **No speech support**: the controls are hidden and everything else works.
- Browsers only allow speech after a user gesture; `Space` or `A` counts, so nothing extra is needed.
- The voice controls sit in the header's left column, mirroring Check claim / Next stage on the right; the footer had no room left at 1920 wide. The picker only shows while voice is on. After picking a voice, focus is handed back to the page so `Space` releases a ball rather than reopening the list.

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
[Voice] [Daniel ▾]   ( Playing for: 1 line )   [Check claim] [Next stage]
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
- **Auto mode**: toggle button + speed slider (3–15 s, default 5 s, range configurable — see [Configuration](#configuration)). The chosen speed is remembered between games. Changing speed takes effect on the next tick. While Auto is running, **Release ball** draws immediately and restarts the countdown. The countdown lives in the Auto button: while running it reads "Pause 5s" and a darker band fills it towards the next ball (🔊 while the voice speaks). Darker rather than lighter so the white label gains contrast as the band passes under it. A separate countdown widget made the footer wrap onto a second row whenever auto ran, shrinking the balls and board.
  - The button is the same width idle and running: "Auto" reserves the width of "Pause", and the seconds reserve room for the longest countdown the configured maximum allows ("15s" by default, "3600s" at the limit). Starting auto or a countdown dropping from "100s" to "99s" moves nothing. `screen.spec.js` checks the footer's height and the slider's position don't change.
  - The seconds are `aria-hidden`, so a screen reader hears a steady "Pause" rather than a name that changes every second; the button's title explains the countdown.
- Auto stops automatically when all 90 are drawn.
- **Prize banner** across the top: "Playing for: 1 line", large enough to read on the TV, with **Check claim** and **Next stage** beside it. Keeping the prize controls together up there also keeps the footer to one row at 1280×720.
- **New game** and **Undo** require confirmation in an in-page `<dialog>` (an accidental "New game" mid-session is the one catastrophic UX failure here). Cancel has focus by default, so a stray `Space` is harmless. A native `confirm()` would kick the browser out of fullscreen.
- **Keyboard**: `Space` = release ball, `A` = toggle auto, `C` = check claim, `N` = next stage, `M` = voice, `H` = history, `F` = fullscreen. Useful with a clicker/presenter remote. `Space` always releases a ball even when a button has focus, so a child pressing it can't toggle something else by accident.
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

- **Unit** (`node --test`): shuffle produces a permutation of 1..90; draw never repeats; draw past 90 is a no-op; undo reverses draw; derived views (last three etc.) are correct at the edges (0, 1, 2, 3, 90 drawn). Stage moves stop at full house; old saves restore at 1 line. Claims: parsing and every validation message, win, not yet, complete-since. Spoken text: house call, two digits, tens, single digits, 90. Voices: network voices hidden, ordering, the Daniel default, the saved choice. History: the log records balls, undos, stage changes and claims in order; bad entries are dropped and a mismatched log is rebuilt; the timeline and text export, including late wins and undos. Every dev scenario loads and does what its description says. The bundled `calls.json` is valid; the loader skips bad keys/values and treats a malformed file as empty.
- **E2E** (Playwright): release ball updates main ball, last-3 and board; a ball with a call shows its phrase, a ball without one shows none (using a seeded sequence so the test knows which ball comes next); a missing `calls.json` doesn't break the game; auto mode draws on a timer (using Playwright's clock API so tests don't actually wait); speed change; custom speed range from `config.json`; fallback when it is missing; undo; new game confirmation; state survives reload; game ends cleanly at 90.
- **Prizes** (Playwright): checking at each stage, a shared win (check another), a failed claim, validation errors, pasting, the `C` and `N` keys, picking a stage from the banner, the stage surviving a reload and resetting on a new game, a pre-stages save loading at 1 line.
- **Voice** (Playwright, speech API stubbed with `page.addInitScript` so tests see what would be said): off by default and remembered when turned on; the right text for a house call and for traditional readings; network voices hidden, Daniel by default, a choice remembered; voices that load late; auto waiting for speech and the 8 s limit; undo, new game and pause cutting speech off; the last ball said in full; no controls without speech support.
- **History** (Playwright): balls in order, opened by `H` or the count, pausing auto; claims, stage changes and undos where they happened; surviving a reload, scrolled to the newest entry; an old save showing its balls; a new game starting empty; the downloaded text file; a full game's history fitting at 1280×720.
- **Dev scenarios** (Playwright, dev server only): picking a scenario loads its game; the dev server refuses paths outside `public/` and `dev/`.
- **Hardening for the night** (Playwright): holding `Space` releases one ball; Cmd/Ctrl/Alt shortcuts are left to the browser; shortcuts are ignored while a dialog is open; opening a dialog pauses auto; the layout fits at 1920×1080, 1366×768 and 1280×720; fullscreen and cursor hiding; Wake Lock requested on the first ball and re-requested after loss (stubbed); blocked storage and unparseable saves don't break the game; the screen-reader announcement.
- **Container only** (`BASE_URL` set): security headers, `/healthz`, rendered `config.json`, and no console or CSP errors during play.
- **Browsers**: every Playwright test runs in Chromium and Firefox, the browser used on the night.
- **Coverage**: unit tests hold the logic modules at 100% lines (enforced in CI); Playwright covers 100% of `app.js` lines (`npm run test:e2e:coverage`, a zero-dependency V8 coverage report).
- **Entrypoint** (`node:test` running the script with `sh`): defaults, custom values, leading zeros, and each kind of bad value fails with a clear message.
- **CI**: GitHub Actions with two jobs. One runs unit tests with coverage thresholds, then Playwright against the dev server. The other builds the image, checks a bad config stops the container, runs it hardened, and runs the same Playwright suite against it. Actions are pinned to commit SHAs. Both jobs cache the Playwright browsers (`~/.cache/ms-playwright`, keyed on the lockfile) and give the install step its own 6-minute limit, after a slow runner once spent 9 of the job's 15 minutes downloading them.

## Delivery phases

All five phases are built.

1. **Core** — `game.js`, `calls.js` + unit tests.
2. **UI** — layout, manual release, call phrase under the current ball, board highlighting, last 3, persistence, bundled font.
3. **Auto mode** — timer, speed slider, countdown, pause/resume, `config.json` loading with fallback defaults.
4. **Polish** — undo, new game confirm, keyboard shortcuts, fullscreen, animations.
5. **Ship** — Dockerfile, compose, config entrypoint script, nginx hardening, Playwright suite, CI.

## Future ideas

- An in-app editor for calls, so the caller can add new ones themselves. It would need somewhere to save them: `localStorage` for one browser, or a small backend for anything shared.
- Separate **caller** and **display** views — same machine via `BroadcastChannel` (no backend), or across devices via a tiny WebSocket server.
- Keep the last few games after New game (history is current-game only for now).
- Configurable prize stages (e.g. corners, or a single "full house only" game) via `config.json`.

## Decisions

- **Ball display:** current ball plus the three before it (4 in total).
- **Primary display:** a TV driven by a laptop over HDMI.
- **Auto speed:** 3–15 s, default 5 s, configurable through env vars.
- **Caller:** a child reads the numbers aloud; the house calls are shown under the current ball, stored as editable data in `calls.json`.
- **Prizes:** 1 line → 2 lines → full house, moved on by hand only. Claims are typed one ticket line per row; a late claim is noted, not refused.
- **Voice:** Web Speech API with local voices only, off by default, traditional reading unless `calls.json` has a call; auto waits for it (8 s limit).
- **History:** an append-only log saved with the game, current game only, downloaded as plain text.
- **Manual testing:** ready-made games on a dev-server-only `/dev/` page, shared with the Playwright tests, never shipped in the image.
