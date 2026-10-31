# Bingo

A self-hosted 90-ball bingo caller for the browser, designed to be shown on a TV. Someone reads the numbers out; the app draws them, shows the current ball, the three before it and a board of every number called so far.

- **Manual**: press **Release ball** (or `Space`) for each number.
- **Auto**: draws a ball every few seconds; drag the slider to change the pace.
- **House calls**: numbers with a nickname show it under the ball ("Two fat ladies 88"), ready to read aloud.
- No backend, no accounts, no external requests. The game is saved in the browser, so a refresh or crash picks up where you left off.

## Run it

With Docker (recommended):

```bash
docker compose up -d
```

Then open <http://localhost:8080>, or `http://<server-ip>:8080` from the laptop plugged into the TV.

Without Docker (needs Node 22+, no install step):

```bash
npm start
```

## On the night

| Key     | Action                               |
| ------- | ------------------------------------ |
| `Space` | Release the next ball                |
| `A`     | Start / pause auto mode              |
| `F`     | Toggle fullscreen                    |

- `Space` always releases a ball, whatever has focus, so it's hard to press the wrong thing.
- **Undo** and **New game** ask first, and **Cancel** is selected by default.
- After a reload, auto mode is always paused, so balls don't start flying before the caller is ready.

## Customising

### House calls

Edit [`public/data/calls.json`](public/data/calls.json). Each entry is a ball number and the exact phrase to read out:

```json
{
  "4": "Number 4 on his own",
  "88": "Two fat ladies 88"
}
```

`compose.yaml` mounts `public/data/` into the container read-only, so after saving the file just refresh the browser. Entries that aren't a number from 1 to 90 with some text are skipped (there's a warning in the browser console), and the rest still work.

### Auto speed

Set in `compose.yaml`, in whole seconds:

```yaml
environment:
  AUTO_MIN_SECONDS: 3      # slider minimum
  AUTO_MAX_SECONDS: 15     # slider maximum
  AUTO_DEFAULT_SECONDS: 5  # starting value
  AUTO_STEP_SECONDS: 1     # slider step
```

Apply with `docker compose up -d`. Values are checked at startup: if they don't make sense (say, a minimum above the maximum), the container refuses to start and `docker compose logs` says why. Whatever speed you pick on the slider is remembered in that browser, kept within the configured range.

## Good to know

- **Screen sleep:** the app asks the browser to keep the screen awake, but browsers only allow that on HTTPS or `localhost`. If you open it over plain `http://<server-ip>`, set the laptop not to sleep, or put it behind your HTTPS reverse proxy.
- **Randomness:** each game is a Fisher–Yates shuffle using the browser's cryptographic random number generator (`crypto.getRandomValues`), not `Math.random`.
- **Hardening:** the container runs nginx as a non-root user on a read-only filesystem with all Linux capabilities dropped, and sends a strict Content Security Policy. There's no data to back up: recovery is `git clone` and `docker compose up -d`.

## Development

```bash
npm install
npm test
```

```bash
npm run test:unit
```

```bash
npm run test:e2e
```

- Unit tests use Node's built-in runner, with no dependencies.
- Playwright runs against a small built-in dev server by default. To run it against a container instead:

```bash
BASE_URL=http://localhost:8080 npm run test:e2e
```

### Layout

```
public/
  index.html, styles.css
  app.js         UI: rendering, auto timer, keyboard, persistence
  game.js        Pure game logic (shuffle, draw, undo)
  calls.js       Loads and validates data/calls.json
  config.js      Loads and validates config.json (auto speed)
  data/calls.json
  fonts/         Atkinson Hyperlegible (SIL Open Font License)
docker/
  nginx.conf
  40-bingo-config.sh   Renders env vars into config.json at startup
scripts/serve.js       Dev server
tests/unit, tests/e2e
```

See [PLAN.md](PLAN.md) for the design decisions behind it.
