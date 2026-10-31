// The game history: every ball, stage change, claim check and undo, in
// order, and a plain-text download.
import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures.js';
import { openScenario, openWithGame, sequenceStartingWith, ui, history, checkClaim } from './helpers.js';
import { TICKET } from '../../dev/scenarios.js';

test('H opens the history: the balls in the order they came out', async ({ page }) => {
  await openScenario(page, 'traditional-next');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Space');
  await page.keyboard.press('h');

  const $ = history(page);
  await expect($.dialog).toBeVisible();
  await expect($.summary).toHaveText('3 of 90 balls called. Playing for 1 line.');
  await expect($.balls).toHaveText(['47', '50', '5']);
  await expect($.balls.nth(2)).toHaveAttribute('data-position', '3');
  await expect($.balls.nth(2)).toHaveAttribute('aria-label', 'Ball 3: 5');
  await expect($.close).toBeFocused();

  await page.keyboard.press('Escape');
  await expect($.dialog).toBeHidden();
});

test('the called count opens the history too, and opening it pauses auto', async ({ page }) => {
  await openScenario(page, 'traditional-next');
  const $ = ui(page);
  await $.auto.click();
  await $.historyButton.click();
  await expect(history(page).dialog).toBeVisible();
  await expect($.auto).toHaveAttribute('aria-pressed', 'false');
  // The count inside the button still reads as before.
  await expect($.count).toHaveText('0 / 90 called');
  await history(page).close.click();
  await expect(history(page).dialog).toBeHidden();
});

test('claims, stage changes and undos show where they happened', async ({ page }) => {
  await openScenario(page, 'one-line-ready');
  const $ = ui(page);
  const claim = await checkClaim(page, [TICKET[0]]);
  await expect(claim.verdict).toHaveText('1 line! ✅');
  await claim.next.click();
  await page.keyboard.press('Space');
  await $.undo.click();
  await $.dialog.getByRole('button', { name: 'Undo' }).click();
  // The undo lands when the dialog's close event fires, a task after it
  // shuts; wait to see it rather than racing it with the next key.
  await expect($.count).toHaveText('5 / 90 called');

  await page.keyboard.press('h');
  const h = history(page);
  await expect(h.summary).toHaveText('5 of 90 balls called. Playing for 2 lines.');
  await expect(h.balls).toHaveText(['4', '23', '45', '61', '88', '1']);
  await expect(h.events).toHaveText([
    /^Claim for 1 line: 1 line! ✅4 23 45 61 88$/,
    'Now playing for 2 lines',
    'Ball 1 undone: back in the machine',
  ]);
  await expect(h.events.first()).toHaveClass(/history__event--claim/);
  await expect(h.events.first()).toHaveClass(/is-win/);
  await expect(h.events.nth(1)).toHaveClass(/history__event--stage/);
  await expect(h.events.nth(2)).toHaveClass(/history__event--undo/);
});

test('a failed claim is in the history too, and so is a late win note', async ({ page }) => {
  await openScenario(page, 'history-sample');
  await page.keyboard.press('h');
  const h = history(page);
  await expect(h.events.first()).toContainText('Claim for 1 line: 1 line! ✅ Complete since 88, 2 balls ago.');
  await expect(h.events.last()).toContainText('Claim for 2 lines: Not yet: 50 and 77 not called');
  await expect(h.events.last()).not.toHaveClass(/is-win/);
  await expect(h.events.last().locator('.history__numbers')).toHaveText(['4 23 45 61 88', '7 19 32 50 77']);
});

test('the history survives a reload and is scrolled to the newest entry', async ({ page }) => {
  // A full game with a claim checked every ten balls: more than fits.
  const log = [];
  for (let ball = 1; ball <= 89; ball++) {
    log.push({ type: 'ball', ball });
    if (ball % 10 === 0) {
      log.push({ type: 'claim', stage: 2, lines: TICKET, won: false, missing: [81], completedBy: null, ballsAgo: null });
    }
  }
  await openWithGame(page, sequenceStartingWith(), 89, { stage: 2, log });
  await page.keyboard.press('Space');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('h');
  const h = history(page);
  await expect(h.balls).toHaveCount(90);
  await expect(h.events).toHaveCount(8);
  expect(await h.timeline.evaluate((el) => el.scrollHeight > el.clientHeight), 'the list overflows').toBe(true);
  await expect(h.balls.last()).toHaveText('90');
  await expect(h.balls.last()).toBeInViewport();
  await expect(h.balls.first()).not.toBeInViewport();
});

test('a game saved before the history existed shows its balls', async ({ page }) => {
  await openScenario(page, 'old-save');
  await page.keyboard.press('h');
  await expect(history(page).balls).toHaveText(['88', '47', '12']);
  await expect(history(page).events).toHaveCount(0);
});

test('a new game starts with an empty history', async ({ page }) => {
  await openScenario(page, 'history-sample');
  const $ = ui(page);
  await $.newGame.click();
  await $.dialog.getByRole('button', { name: 'New game' }).click();
  await expect($.count).toHaveText('0 / 90 called');
  await page.keyboard.press('h');
  await expect(history(page).summary).toHaveText('0 of 90 balls called. Playing for 1 line.');
  await expect(history(page).timeline).toHaveText('No balls called yet.');
});

test('Download saves a plain-text copy', async ({ page }) => {
  await openScenario(page, 'history-sample');
  await page.keyboard.press('h');
  const [download] = await Promise.all([page.waitForEvent('download'), history(page).download.click()]);
  expect(download.suggestedFilename()).toMatch(/^bingo-\d{4}-\d{2}-\d{2}-\d{4}\.txt$/);
  const text = await readFile(await download.path(), 'utf8');
  expect(text).toMatch(/^Bingo: game history\nExported \d{1,2} \w{3} \d{4}, \d{2}:\d{2}\n/);
  for (const line of [
    '10 of 90 balls called. Playing for 2 lines.',
    ' 1. 4',
    '* Claim for 1 line: 1 line! ✅',
    '  Complete since 88, 2 balls ago.',
    '* Now playing for 2 lines',
    '* Ball 19 undone: back in the machine',
    '10. 32',
    '* Claim for 2 lines: Not yet: 50 and 77 not called',
    '    7 19 32 50 77',
  ]) {
    expect(text.split('\n')).toContain(line);
  }
  // The dialog stays open, so the caller can carry on reading it.
  await expect(history(page).dialog).toBeVisible();
});
