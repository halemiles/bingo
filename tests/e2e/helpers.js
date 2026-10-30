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
export async function openWithGame(page, sequence, drawnCount = 0) {
  await open(page);
  await page.evaluate(([key, value]) => localStorage.setItem(key, JSON.stringify(value)), [
    GAME_KEY,
    { sequence, drawnCount },
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
  };
}

export async function expectRecent(page, numbers) {
  const texts = await ui(page).recent.allTextContents();
  expect(texts.map((t) => t.trim())).toEqual([...numbers.map(String), ...Array(3 - numbers.length).fill('')]);
}
