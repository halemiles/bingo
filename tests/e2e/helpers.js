import { expect } from '@playwright/test';

export const GAME_KEY = 'bingo.game.v1';
export const SPEED_KEY = 'bingo.speedSeconds.v1';

// A known draw order: `first` comes out in that order, then the rest ascending.
export function sequenceStartingWith(...first) {
  const rest = [];
  for (let n = 1; n <= 90; n++) if (!first.includes(n)) rest.push(n);
  return [...first, ...rest];
}

export async function open(page) {
  await page.goto('/');
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
