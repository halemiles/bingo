import { expect } from '@playwright/test';
import { GAME_KEY, findScenario, sequenceStartingWith } from '../../dev/scenarios.js';

// The draw-order helper and scenarios are shared with the dev server's
// /dev/ page, so a test and a manual check can set up the same game.
export { GAME_KEY, sequenceStartingWith };
export const SPEED_KEY = 'bingo.speedSeconds.v1';

// Waits for the app's own ready flag rather than the browser's `load` event.
// Against the nginx container, Firefox under Playwright sometimes never
// reports `load` for the first navigation in a new context (about 1 in 6 in
// CI; reloads never hang). The suspect is the Cross-Origin-Opener-Policy
// header, which makes that first navigation switch browsing context groups.
// `data-ready` is what the app sets once its config and calls are loaded, so
// it's the better signal anyway.
export async function open(page) {
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
}

// Loads the app with a fixed draw order so tests know which ball is next.
// `extra` adds saved fields such as `{ stage: 1 }`; without it the save has
// no stage, like a game saved before prize stages existed.
export async function openWithGame(page, sequence, drawnCount = 0, extra = {}) {
  await open(page);
  await page.evaluate(([key, value]) => localStorage.setItem(key, JSON.stringify(value)), [
    GAME_KEY,
    { sequence, drawnCount, ...extra },
  ]);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
}

// Loads the app with one of the scenarios from dev/scenarios.js.
export async function openScenario(page, id) {
  const { game } = findScenario(id);
  await open(page);
  await page.evaluate(([key, value]) => {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  }, [GAME_KEY, game]);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
}

export function ui(page) {
  return {
    currentBall: page.getByTestId('current-ball'),
    currentCall: page.getByTestId('current-call'),
    recent: page.getByTestId('recent-balls').locator('li'),
    calledCells: page.getByTestId('board').locator('li.is-called'),
    cell: (n) => page.getByTestId('board').locator(`li[data-number="${n}"]`),
    count: page.getByTestId('count'),
    countdown: page.getByTestId('countdown'),
    release: page.getByRole('button', { name: /Release ball/ }),
    auto: page.locator('#auto'),
    speed: page.getByRole('slider'),
    speedValue: page.locator('#speed-value'),
    undo: page.getByRole('button', { name: 'Undo' }),
    newGame: page.getByRole('button', { name: 'New game' }),
    dialog: page.getByRole('dialog'),
    stageBanner: page.getByTestId('stage-banner'),
    stagePicker: page.getByTestId('stage-picker'),
    nextStage: page.locator('#next-stage'),
    check: page.locator('#check'),
    voice: page.locator('#voice'),
    voicePicker: page.getByTestId('voice-picker'),
    historyButton: page.locator('#history'),
  };
}

// The game history dialog.
export function history(page) {
  const dialog = page.getByTestId('history');
  return {
    dialog,
    summary: page.getByTestId('history-summary'),
    timeline: page.getByTestId('history-timeline'),
    balls: page.getByTestId('history-timeline').locator('li.history__ball'),
    events: page.getByTestId('history-timeline').locator('.history__event'),
    download: dialog.getByRole('button', { name: 'Download' }),
    close: dialog.getByRole('button', { name: 'Close' }),
  };
}

// The claim checker dialog.
export function claim(page) {
  const dialog = page.getByTestId('claim');
  return {
    dialog,
    title: dialog.getByRole('heading'),
    input: dialog.getByRole('textbox'),
    submit: dialog.getByRole('button', { name: 'Check', exact: true }),
    cancel: dialog.getByRole('button', { name: 'Cancel' }),
    errors: dialog.getByRole('alert').locator('li'),
    verdict: page.getByTestId('claim-verdict'),
    note: page.getByTestId('claim-note'),
    lines: page.getByTestId('claim-lines').locator('ol'),
    called: page.getByTestId('claim-lines').locator('li.is-called'),
    missing: page.getByTestId('claim-lines').locator('li.is-missing'),
    again: dialog.getByRole('button', { name: 'Check another' }),
    next: dialog.getByRole('button', { name: 'Next stage' }),
    newGame: dialog.getByRole('button', { name: 'New game' }),
    close: dialog.getByRole('button', { name: 'Close' }),
  };
}

// Opens the claim checker, enters the lines and checks them.
export async function checkClaim(page, lines) {
  const $ = claim(page);
  if (!(await $.dialog.isVisible())) await ui(page).check.click();
  await $.input.fill(lines.map((line) => line.join(' ')).join('\n'));
  await $.submit.click();
  return $;
}

export async function expectRecent(page, numbers) {
  const texts = await ui(page).recent.allTextContents();
  expect(texts.map((t) => t.trim())).toEqual([...numbers.map(String), ...Array(3 - numbers.length).fill('')]);
}

// Voices like a Mac's in Chrome: local ones plus a network one to be hidden.
export const TEST_VOICES = [
  { name: 'Samantha', lang: 'en-US', localService: true, voiceURI: 'samantha', default: true },
  { name: 'Google UK English Male', lang: 'en-GB', localService: false, voiceURI: 'google-uk', default: false },
  { name: 'Daniel', lang: 'en-GB', localService: true, voiceURI: 'daniel', default: false },
  { name: 'Kate', lang: 'en-GB', localService: true, voiceURI: 'kate', default: false },
];

// Replaces the Web Speech API, which can't run headless, with a stub that
// records what the app asked for. In the page:
//   window.speech.spoken       [{ text, voice, lang, rate }] in order
//   window.speech.interrupted  texts cut short by cancel()
//   window.finishSpeaking()    the current utterance ends normally
//   window.loadVoices()        voices arrive late (with { late: true })
// Utterances never end by themselves, so a test controls when speech is done.
export async function stubSpeech(page, { voices = TEST_VOICES, late = false } = {}) {
  await page.addInitScript(
    ({ voices, late }) => {
      const record = { spoken: [], interrupted: [], current: null, voices: late ? [] : voices };
      window.speech = record;

      class Utterance extends EventTarget {
        constructor(text) {
          super();
          Object.assign(this, { text, voice: null, lang: '', rate: 1 });
        }
      }
      const synth = new EventTarget();
      const finish = (type) => {
        const utterance = record.current;
        record.current = null;
        synth.speaking = false;
        if (type === 'error') record.interrupted.push(utterance.text);
        utterance.dispatchEvent(new Event(type));
      };
      Object.assign(synth, {
        speaking: false,
        pending: false,
        getVoices: () => record.voices,
        speak(utterance) {
          const { text, voice, lang, rate } = utterance;
          record.spoken.push({ text, voice: voice?.name ?? null, lang, rate });
          record.current = utterance;
          synth.speaking = true;
        },
        cancel() {
          if (record.current) finish('error');
        },
      });
      window.finishSpeaking = () => finish('end');
      window.loadVoices = () => {
        record.voices = voices;
        synth.dispatchEvent(new Event('voiceschanged'));
      };
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => synth });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, writable: true, value: Utterance });
    },
    { voices, late },
  );
}

export const spoken = (page) => page.evaluate(() => window.speech.spoken.map((s) => s.text));
