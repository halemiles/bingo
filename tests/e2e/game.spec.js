import { test, expect } from '@playwright/test';
import { open, openWithGame, sequenceStartingWith, ui, expectRecent } from './helpers.js';

test('a fresh game shows an empty ball, a hint and a clear board', async ({ page }) => {
  await open(page);
  const $ = ui(page);
  await expect($.currentBall).toHaveClass(/is-empty/);
  await expect($.currentCall).toHaveText('Press Space to release the first ball');
  await expect($.calledCells).toHaveCount(0);
  await expect($.count).toHaveText('0 / 90 called');
  await expect($.undo).toBeDisabled();
  await expect($.newGame).toBeDisabled();
});

test('Release ball shows the ball, its call, the last 3 and the board', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(5, 3, 12, 47, 88));
  const $ = ui(page);

  await $.release.click();
  await expect($.currentBall).toHaveText('5');
  await expect($.currentCall).toHaveText(''); // 5 has no call
  await expectRecent(page, []);

  for (let i = 0; i < 4; i++) await $.release.click();
  await expect($.currentBall).toHaveText('88');
  await expect($.currentCall).toHaveText('Two fat ladies 88');
  await expectRecent(page, [47, 12, 3]);

  await expect($.calledCells).toHaveCount(5);
  for (const n of [5, 3, 12, 47, 88]) await expect($.cell(n)).toHaveClass(/is-called/);
  await expect($.cell(88)).toHaveClass(/is-latest/);
  await expect($.cell(47)).not.toHaveClass(/is-latest/);
  await expect($.count).toHaveText('5 / 90 called');
});

test('Space releases a ball, even when another button has focus', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(4, 11));
  const $ = ui(page);

  await page.keyboard.press('Space');
  await expect($.currentBall).toHaveText('4');
  await expect($.currentCall).toHaveText('Number 4 on his own');

  await $.auto.focus();
  await page.keyboard.press('Space');
  await expect($.currentBall).toHaveText('11');
  await expect($.auto).toHaveAttribute('aria-pressed', 'false');
  await expect($.count).toHaveText('2 / 90 called');
});

test('the game survives a reload', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(22, 69));
  const $ = ui(page);
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect($.currentCall).toHaveText('Brighton line 69');

  await page.reload();
  await expect($.currentBall).toHaveText('69');
  await expect($.currentCall).toHaveText('Brighton line 69');
  await expectRecent(page, [22]);
  await expect($.count).toHaveText('2 / 90 called');
});

test('a corrupted saved game is replaced with a new one', async ({ page }) => {
  await open(page);
  await page.evaluate(() => localStorage.setItem('bingo.game.v1', '{"sequence":[1,1,1],"drawnCount":2}'));
  await page.reload();
  await expect(ui(page).currentBall).toHaveClass(/is-empty/);
  await expect(ui(page).count).toHaveText('0 / 90 called');
});

test('undo asks first, and Cancel keeps the ball', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(1, 2, 3));
  const $ = ui(page);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Space');

  await $.undo.click();
  await expect($.dialog).toContainText('Undo ball 3?');
  // Cancel has focus, so a stray Space press is safe.
  await page.keyboard.press('Space');
  await expect($.dialog).toBeHidden();
  await expect($.currentBall).toHaveText('3');

  await $.undo.click();
  await $.dialog.getByRole('button', { name: 'Undo' }).click();
  await expect($.currentBall).toHaveText('2');
  await expect($.cell(3)).not.toHaveClass(/is-called/);
  await expectRecent(page, [1]);
});

test('new game asks first, then clears everything', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(10, 20));
  const $ = ui(page);
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');

  await $.newGame.click();
  await $.dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect($.count).toHaveText('2 / 90 called');

  await $.newGame.click();
  await $.dialog.getByRole('button', { name: 'New game' }).click();
  await expect($.count).toHaveText('0 / 90 called');
  await expect($.calledCells).toHaveCount(0);
  await expect($.currentBall).toHaveClass(/is-empty/);
});

test('the game ends cleanly after the 90th ball', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(), 89);
  const $ = ui(page);
  await page.keyboard.press('Space');
  await expect($.currentBall).toHaveText('90');
  await expect($.count).toHaveText('All 90 called');
  await expect($.calledCells).toHaveCount(90);
  await expect($.release).toBeDisabled();

  await page.keyboard.press('Space');
  await expect($.currentBall).toHaveText('90');
});

test('every called number is drawn exactly once over a full game', async ({ page }) => {
  await open(page);
  const $ = ui(page);
  const seen = new Set();
  for (let i = 0; i < 90; i++) {
    await page.keyboard.press('Space');
    const n = (await $.currentBall.textContent()).trim();
    expect(seen.has(n), `ball ${n} drawn twice`).toBe(false);
    seen.add(n);
  }
  expect(seen.size).toBe(90);
  await expect($.calledCells).toHaveCount(90);
});
