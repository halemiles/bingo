# CLAUDE.md

Self-hosted 90-ball bingo caller. A child reads the numbers aloud from a TV: a Mac running **Firefox**, plugged in over HDMI. `PLAN.md` holds the design decisions; `README.md` is the user-facing guide.

## Commands

```bash
npm start                   # dev server on http://127.0.0.1:8080 (no install needed); scenarios at /dev/
npm run test:unit           # node:test, zero deps
npm run test:unit:coverage  # same, enforcing 100% lines/functions, 95% branches on public/
npm run test:e2e            # Playwright, Chromium + Firefox
npm run test:e2e:coverage   # Chromium run + per-line coverage of the browser code
docker compose up -d        # the real thing, on :8080
BASE_URL=http://127.0.0.1:8080 npm run test:e2e   # e2e against the container (also runs container.spec.js)
```

In cloud sessions Firefox usually can't be downloaded (`cdn.playwright.dev` is blocked by the network policy), so run `--project=chromium` there; CI runs both browsers.

## Architecture rules

- **Static site, no backend, no build step, no runtime dependencies.** Vanilla ES modules in `public/`. The only dev dependency is `@playwright/test`; think hard before adding another.
- **Logic stays out of the DOM.** `game.js`, `claims.js`, `speech-text.js`, `voices.js`, `calls.js` and `config.js` are pure and unit-tested under Node. `app.js` is the only file that touches the DOM, and is covered by Playwright. New logic goes in a pure module with its own `tests/unit/*.test.js`. Node's coverage only counts files a test imports, so an untested module silently escapes the threshold.
- **Game state** is `{ sequence, drawnCount, stage }` in `localStorage` under `bingo.game.v1`, loaded through `restoreGame` (which uses `isValidState` for the balls). When adding fields, games saved by the older version must still load: default the new fields instead of rejecting the save, as `restoreGame` does for `stage`. Storage access can throw, so always go through `readStorage`/`writeStorage`.
- **Randomness** uses `secureRandomInt` (`crypto.getRandomValues` with rejection sampling). Never `Math.random`.
- **Data files** (`public/data/calls.json`, the rendered `config.json`) are user-edited: validate them, skip bad entries, never crash, and render text with `textContent`, never `innerHTML`.

## UI rules

- TV first: 16:9, readable from across a room. Size things with `vh`/`vw`/container units, not pixels. `tests/e2e/screen.spec.js` checks everything fits at 1920×1080, 1366×768 and 1280×720; extend it for new on-screen elements.
- Keyboard: `Space` release ball, `A` auto, `C` check claim, `N` next stage, `M` voice, `F` fullscreen. The global handler ignores Cmd/Ctrl/Alt combos, key repeat and keys while any dialog is open; keep it that way. A text field inside a closed dialog isn't a typing target (focus lingers there for a task after `close()`). `Space` always releases a ball, even when a button has focus.
- Dialogs go through `showDialog()`; confirmations use `confirmAction()` on top of it, with Cancel focused. Never use `window.confirm()`: it exits fullscreen. Opening any dialog (confirm, stage picker, claim checker) pauses auto mode.
- Fonts and assets are bundled; nothing is loaded from another origin.
- Voice is off by default and uses local voices only (`localService`). Anything that interrupts the game (undo, new game, pause) calls `stopSpeaking()`; `stopAuto()` itself doesn't, so the 90th ball is still said in full. Auto waits on speech through `waitThenSchedule()`, guarded by `auto.turn`.

## Security / hosting rules

- The nginx CSP is strict (`default-src 'none'`, `'self'` only). No inline `<script>`/`<style>`, no `style="…"` attributes, no external URLs. Setting CSS custom properties from JS (`el.style.setProperty`) is fine.
- In `docker/nginx.conf` every `add_header` lives at server level: a location with its own `add_header` silently drops the inherited security headers.
- nginx listens on IPv4 only; an IPv6 listener crashes it on hosts with IPv6 disabled.
- The container is read-only and runs as non-root; only `/tmp` (tmpfs) is writable. Env-var config is rendered by `docker/40-bingo-config.sh`, which must fail fast on bad values (tested in `tests/unit/entrypoint.test.js`).
- The base image is pinned by digest and GitHub Actions by commit SHA; bump the tag comment with the hash.

## Testing conventions

- Import `test`/`expect` from `tests/e2e/fixtures.js`, not `@playwright/test`; the fixture collects coverage.
- Use `openScenario(page, id)` for a ready-made game from `dev/scenarios.js` (the same ones the dev server's `/dev/` page offers), or `openWithGame(page, sequenceStartingWith(...))` for a one-off draw order. Locators live in `ui(page)`. Add a scenario when a game set-up is useful by hand too; `tests/unit/scenarios.test.js` checks each does what its description says.
- `dev/` is served by `scripts/serve.js` only, never by nginx, so it must not be needed by the app. `tests/e2e/dev-scenarios.spec.js` skips when `BASE_URL` is set.
- Speech is stubbed with `stubSpeech(page)` from `helpers.js`: utterances never end by themselves (`window.finishSpeaking()` ends one), and `window.speech` records what was said and cut off.
- Timer tests: `page.clock.install()` then `page.clock.pauseAt(...)`. An installed clock still ticks in real time until paused, which made tests flaky under load.
- Browser APIs that can't run headless (Wake Lock, speech) are stubbed with `page.addInitScript`, and the test asserts what the app asked for.
- `tests/e2e/container.spec.js` only runs when `BASE_URL` is set (headers, `/healthz`, `config.json`, no CSP errors).
- Keep coverage where it is: 100% lines for the logic modules (enforced in CI) and 100% of `app.js` lines via `npm run test:e2e:coverage` (checked by hand). For a new test of a guard or edge case, break the code once and watch the test fail.

## Workflow

- One branch and PR per issue, into `main`; CI must be green (unit with thresholds, then e2e on the dev server and on the hardened container, both browsers).
- Before pushing: `npm run test:unit:coverage`, `npm run test:e2e`, and for Docker or nginx changes `docker compose up -d --build` plus the e2e run against it.
- Update `README.md` for anything a user sets up or sees, and `PLAN.md` when a design decision changes.

## Open work

No open issues. Ideas for later are listed under "Future ideas" in `PLAN.md`.
