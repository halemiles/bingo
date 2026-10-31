# Bingo

A self-hosted 90-ball bingo caller for the browser, designed to be shown on a TV. Someone reads the numbers out; the app draws them, shows the current ball, the three before it and a board of every number called so far.

- **Manual**: press **Release ball** (or `Space`) for each number.
- **Auto**: draws a ball every few seconds; drag the slider to change the pace.
- **House calls**: numbers with a nickname show it under the ball ("Two fat ladies 88"), ready to read aloud.
- **Prizes**: plays for 1 line, then 2 lines, then a full house, with a banner across the top saying which, and a checker for claims.
- **History**: every ball, prize change, claim check and undo in order, with a plain-text download, for settling a dispute.
- **Voice** (optional, off by default): reads each ball aloud with the laptop's own voices. Nothing is sent off the device.
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
| `C`     | Check a claim                        |
| `N`     | Move on to the next prize            |
| `M`     | Turn the voice on / off              |
| `H`     | Show the game history                |
| `F`     | Toggle fullscreen                    |

- `Space` always releases a ball, whatever has focus, so it's hard to press the wrong thing.
- **Undo** and **New game** ask first, and **Cancel** is selected by default.
- After a reload, auto mode is always paused, so balls don't start flying before the caller is ready.

### Prizes and claims

The banner at the top shows what's being played for: **1 line**, **2 lines**, then **Full house**. It never moves on by itself, because more than one person can win on the same ball: press **Next stage** (or `N`) when you're ready. If you move on by mistake, click the banner and pick the right stage. The stage is saved with the game, and **New game** goes back to 1 line.

When someone shouts, press **Check claim** (or `C`). Auto mode pauses. Type or paste the numbers from their ticket, one ticket line per line of text, 5 numbers to a line: 1 line for the first prize, 2 for the second, all 3 for a full house. Spaces or commas between numbers both work. Press **Check** (or `Ctrl`+`Enter`, `Cmd`+`Enter` on a Mac).

- **A win** shows "1 line! ✅" with every number ticked. If the line was already complete a few balls ago, a note says which ball finished it. It still counts.
- **Not yet** names the numbers that haven't been called and marks them with a dashed outline.
- **Check another** checks the next person's ticket for the same prize, for shared wins. **Next stage** appears after a win.
- After a **full house** you're offered a new game (it still asks first), but you can close the box and carry on.

### Game history

Press `H`, or click the "37 / 90 called" count at the bottom, to see everything that has happened this game, oldest first and scrolled to the newest:

- each ball in the order it came out, with its place in the draw (the 31st ball, and so on)
- each move to the next prize ("Now playing for 2 lines")
- each claim checked, with the numbers entered and the result, including "Complete since 88, 2 balls ago" for a late one
- each undo ("Ball 61 undone: back in the machine"), so the record shows what really happened rather than quietly rewriting it

**Download** saves the same thing as a text file (`bingo-2026-10-31-1942.txt`) you can keep, print or send to someone who wasn't there. The history is saved with the game, so it survives a refresh; **New game** starts a fresh one, so download first if you want a copy.

### Voice

Voice is **off by default**, so the person calling stays the star. Turn it on with **Voice** (top left) or `M`; the setting is remembered. Once it's on:

- A ball with a house call is read exactly as written ("Two fat ladies 88"). Others get the traditional reading: "4 and 7, 47", "5 oh, 50", "Number 5 on his own". What's on screen doesn't change.
- Pick the voice from the list next to the button. Only voices installed on the laptop are listed; online voices are left out so nothing depends on the Wi-Fi. It starts on a British voice (Daniel on a Mac) and remembers your choice.
- In auto mode the countdown to the next ball starts once the voice has finished (the countdown shows "Speaking…" until then), but it never waits more than 8 seconds, so a stuck voice can't stall the game.
- **Undo**, **New game** and pausing auto cut off whatever is being said.
- Browsers only allow speech after someone has pressed a key or clicked, so the first ball after opening the page is spoken once you press `Space` or `A`. Nothing else is needed.
- If the browser can't speak at all, the Voice button simply doesn't appear.

#### Setting up voice on a Mac

1. **Get a better voice.** The built-in voices are compact. Open **System Settings → Accessibility → Spoken Content → System voice → Manage Voices…**, then under English download an **Enhanced** or **Premium** British voice (for example Daniel, Kate or Serena). They're free and run on the laptop. Quit and reopen Firefox afterwards so it sees them; the app picks a Premium or Enhanced Daniel over the compact one by itself.
2. **Send the sound to the TV.** Open **System Settings → Sound → Output** and choose the TV (it's listed by name, over HDMI). Turn the TV volume up rather than the laptop's if it sounds quiet.
3. **Check it in the app.** Press `M` (or click **Voice**), pick a voice from the list, then release the first ball with `Space` and listen.

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
npx playwright install chromium firefox
npm test
```

| Command | What it does |
| --- | --- |
| `npm run test:unit` | Unit tests (Node's built-in runner, no dependencies) |
| `npm run test:unit:coverage` | The same, failing below 100% line coverage of `public/` |
| `npm run test:e2e` | Playwright in Chromium and Firefox, against a small built-in dev server |
| `npm run test:e2e:coverage` | Playwright in Chromium, then a per-line coverage report of the browser code |

### Trying things out: scenarios

`npm start` also serves a page of ready-made games at <http://127.0.0.1:8080/dev/>: a house call next, the traditional readings next, a line ready to claim (with the numbers to paste), a full house one ball away, the last ball, a save from an older version, and so on. Pick one and it replaces the game saved in that browser, then opens the caller. It's handy for checking the voice on the real laptop.

The same scenarios live in [`dev/scenarios.js`](dev/scenarios.js) and the Playwright tests use them through `openScenario(page, id)`, so a manual check and a test set up exactly the same game. The page is part of the dev server only: the Docker image serves `public/` and nothing else, so it can't replace a game on the night.

To run the Playwright suite against a running container instead (this also runs the container-only checks for security headers, `/healthz` and `config.json`):

```bash
BASE_URL=http://localhost:8080 npm run test:e2e
```

### Layout

```
public/
  index.html, styles.css
  app.js         UI: rendering, auto timer, voice, keyboard, persistence
  game.js        Pure game logic (shuffle, draw, undo, prize stages)
  claims.js      Pure claim checking (parse a ticket, check it against the draw)
  history.js     Pure: the game log as a timeline and as a text file
  speech-text.js Pure: what the voice says for a ball
  voices.js      Pure: which voices to offer, and the default
  calls.js       Loads and validates data/calls.json
  config.js      Loads and validates config.json (auto speed)
  data/calls.json
  fonts/         Atkinson Hyperlegible (SIL Open Font License)
docker/
  nginx.conf
  40-bingo-config.sh   Renders env vars into config.json at startup
dev/                   Scenario page and shared scenarios (dev server only)
scripts/serve.js       Dev server (serves public/, and dev/ at /dev/)
scripts/e2e-coverage.js  Line coverage report for the browser code
tests/unit, tests/e2e
```

See [PLAN.md](PLAN.md) for the design decisions behind it.
