// Keyboard edge cases that matter with a child at the keyboard, plus the
// screen-reader announcement.
import { test, expect } from './fixtures.js';
import { openWithGame, sequenceStartingWith, ui } from './helpers.js';

test('holding Space down releases only one ball', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(1, 2, 3));
  await page.keyboard.down('Space');
  await page.keyboard.down('Space'); // auto-repeat while held
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await expect(ui(page).count).toHaveText('1 / 90 called');
});

test('shortcuts with Cmd, Ctrl or Alt are left to the browser', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(1, 2));
  const $ = ui(page);
  for (const combo of ['Meta+a', 'Control+a', 'Alt+a', 'Meta+f', 'Control+Space']) {
    await page.keyboard.press(combo);
  }
  await expect($.auto).toHaveAttribute('aria-pressed', 'false');
  await expect($.count).toHaveText('0 / 90 called');
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
});

test('shortcuts are ignored while a confirmation is open', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(1, 2));
  const $ = ui(page);
  await page.keyboard.press('Space');
  await $.newGame.click();
  await page.keyboard.press('a');
  await expect($.auto).toHaveAttribute('aria-pressed', 'false');
  await expect($.dialog).toBeVisible();
});

test('each ball is announced for screen readers, with its call', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(88, 5));
  const announcer = page.locator('#announcer');
  await expect(announcer).toHaveAttribute('aria-live', 'assertive');
  await page.keyboard.press('Space');
  await expect(announcer).toHaveText('88. Two fat ladies 88');
  await page.keyboard.press('Space');
  await expect(announcer).toHaveText('5');
});
