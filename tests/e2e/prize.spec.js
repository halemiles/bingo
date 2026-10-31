// Prize stages (1 line → 2 lines → full house) and checking a claim.
import { test, expect } from './fixtures.js';
import { open, openWithGame, sequenceStartingWith, ui, claim, checkClaim, GAME_KEY } from './helpers.js';

// One made-up ticket: three lines of five.
const LINE_1 = [4, 23, 45, 61, 88];
const LINE_2 = [7, 19, 32, 50, 77];
const LINE_3 = [2, 16, 38, 64, 81];
const TICKET = [...LINE_1, ...LINE_2, ...LINE_3];

const savedGame = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), GAME_KEY);

test.describe('stages', () => {
  test('a new game plays for 1 line, and Next stage goes on to full house', async ({ page }) => {
    await open(page);
    const $ = ui(page);
    await expect($.stageBanner).toHaveText('Playing for: 1 line');

    await $.nextStage.click();
    await expect($.stageBanner).toHaveText('Playing for: 2 lines');
    await expect(page.locator('#announcer')).toHaveText('Now playing for 2 lines');

    await $.nextStage.click();
    await expect($.stageBanner).toHaveText('Playing for: Full house');
    await expect($.nextStage).toBeDisabled();
  });

  test('N moves to the next stage, and does nothing after full house', async ({ page }) => {
    await open(page);
    const $ = ui(page);
    await page.keyboard.press('n');
    await expect($.stageBanner).toHaveText('Playing for: 2 lines');
    await page.keyboard.press('N');
    await expect($.stageBanner).toHaveText('Playing for: Full house');
    await page.keyboard.press('n');
    await expect($.stageBanner).toHaveText('Playing for: Full house');
    expect((await savedGame(page)).stage).toBe(2);
  });

  test('clicking the banner picks a stage directly, and Cancel keeps it', async ({ page }) => {
    await open(page);
    const $ = ui(page);

    await $.stageBanner.click();
    await expect($.stagePicker).toBeVisible();
    // The current stage is marked and focused.
    await expect($.stagePicker.getByRole('button', { name: '1 line' })).toHaveAttribute('aria-pressed', 'true');
    await expect($.stagePicker.getByRole('button', { name: '1 line' })).toBeFocused();
    await $.stagePicker.getByRole('button', { name: 'Full house' }).click();
    await expect($.stagePicker).toBeHidden();
    await expect($.stageBanner).toHaveText('Playing for: Full house');

    // Back to fix a mistake.
    await $.stageBanner.click();
    await expect($.stagePicker.getByRole('button', { name: 'Full house' })).toHaveAttribute('aria-pressed', 'true');
    await $.stagePicker.getByRole('button', { name: '2 lines' }).click();
    await expect($.stageBanner).toHaveText('Playing for: 2 lines');

    await $.stageBanner.click();
    await $.stagePicker.getByRole('button', { name: 'Cancel' }).click();
    await expect($.stageBanner).toHaveText('Playing for: 2 lines');

    // Picking the stage already being played leaves it alone.
    await $.stageBanner.click();
    await $.stagePicker.getByRole('button', { name: '2 lines' }).click();
    await expect($.stageBanner).toHaveText('Playing for: 2 lines');
  });

  test('the stage survives a reload, and a new game resets it to 1 line', async ({ page }) => {
    await openWithGame(page, sequenceStartingWith(1, 2), 0, { stage: 0 });
    const $ = ui(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('n');
    await page.keyboard.press('n');

    await page.reload();
    await expect($.stageBanner).toHaveText('Playing for: Full house');
    await expect($.count).toHaveText('1 / 90 called');

    await $.newGame.click();
    await $.dialog.getByRole('button', { name: 'New game' }).click();
    await expect($.stageBanner).toHaveText('Playing for: 1 line');
    expect((await savedGame(page)).stage).toBe(0);
  });

  test('a game saved before stages existed loads at 1 line with its balls', async ({ page }) => {
    // openWithGame without a stage writes the old { sequence, drawnCount } save.
    await openWithGame(page, sequenceStartingWith(88, 47, 12), 3);
    const $ = ui(page);
    await expect($.stageBanner).toHaveText('Playing for: 1 line');
    await expect($.currentBall).toHaveText('12');
    await expect($.count).toHaveText('3 / 90 called');
  });

  test('a saved stage that makes no sense starts at 1 line and keeps the balls', async ({ page }) => {
    await openWithGame(page, sequenceStartingWith(88, 47), 2, { stage: 7 });
    const $ = ui(page);
    await expect($.stageBanner).toHaveText('Playing for: 1 line');
    await expect($.currentBall).toHaveText('47');
  });
});

test.describe('checking a claim', () => {
  test('1 line: a win, then Next stage', async ({ page }) => {
    await openWithGame(page, sequenceStartingWith(...LINE_1), 5, { stage: 0 });
    const $ = await checkClaim(page, [LINE_1]);

    await expect($.title).toHaveText('Check a claim: 1 line');
    await expect($.verdict).toHaveText('1 line! ✅');
    await expect($.note).toBeHidden();
    await expect($.called).toHaveCount(5);
    await expect($.missing).toHaveCount(0);
    await expect($.again).toBeFocused();
    await expect($.newGame).toBeHidden();

    await $.next.click();
    await expect($.dialog).toBeHidden();
    await expect(ui(page).stageBanner).toHaveText('Playing for: 2 lines');
  });

  test('a shared win: Check another keeps the stage', async ({ page }) => {
    const other = [5, 12, 47, 66, 90];
    await openWithGame(page, sequenceStartingWith(...LINE_1, ...other), 10, { stage: 0 });
    let $ = await checkClaim(page, [LINE_1]);
    await expect($.verdict).toHaveText('1 line! ✅');

    await $.again.click();
    await expect($.input).toHaveValue('');
    await expect($.input).toBeFocused();
    await expect($.title).toHaveText('Check a claim: 1 line');
    $ = await checkClaim(page, [other]);
    await expect($.verdict).toHaveText('1 line! ✅');

    await $.close.click();
    await expect($.dialog).toBeHidden();
    await expect(ui(page).stageBanner).toHaveText('Playing for: 1 line');
  });

  test('2 lines: needs both lines called', async ({ page }) => {
    await openWithGame(page, sequenceStartingWith(...LINE_1, ...LINE_2), 9, { stage: 1 });
    let $ = await checkClaim(page, [LINE_1, LINE_2]);
    await expect($.title).toHaveText('Check a claim: 2 lines');
    await expect($.verdict).toHaveText('Not yet: 77 not called');
    await expect($.lines).toHaveCount(2);
    await $.close.click();

    await page.keyboard.press('Space');
    $ = await checkClaim(page, [LINE_1, LINE_2]);
    await expect($.verdict).toHaveText('2 lines! ✅');
    await expect($.called).toHaveCount(10);
  });

  test('full house: celebrates and offers a new game without forcing one', async ({ page }) => {
    await openWithGame(page, sequenceStartingWith(...TICKET), 15, { stage: 2 });
    const $$ = ui(page);
    let $ = await checkClaim(page, [LINE_1, LINE_2, LINE_3]);
    await expect($.title).toHaveText('Check a claim: Full house');
    await expect($.verdict).toHaveText('Full house! 🎉');
    await expect($.called).toHaveCount(15);
    await expect($.next).toBeHidden();
    await expect($.newGame).toBeVisible();

    // Not forced: closing keeps the game.
    await $.close.click();
    await expect($$.count).toHaveText('15 / 90 called');

    // Taking the offer still asks first, like the New game button.
    $ = await checkClaim(page, [LINE_1, LINE_2, LINE_3]);
    await $.newGame.click();
    await expect($.dialog).toBeHidden();
    await expect($$.dialog).toContainText('Start a new game?');
    await $$.dialog.getByRole('button', { name: 'New game' }).click();
    await expect($$.count).toHaveText('0 / 90 called');
    await expect($$.stageBanner).toHaveText('Playing for: 1 line');
  });

  test('a failed claim says what is missing and marks it', async ({ page }) => {
    await openWithGame(page, sequenceStartingWith(4, 23, 45), 3, { stage: 0 });
    const $ = await checkClaim(page, [LINE_1]);
    await expect($.verdict).toHaveText('Not yet: 61 and 88 not called');
    await expect($.called).toHaveText(['4', '23', '45']);
    await expect($.missing).toHaveText(['61', '88']);
    await expect($.missing.first()).toHaveAttribute('aria-label', '61, not called');
    await expect($.called.first()).toHaveAttribute('aria-label', '4, called');
    await expect($.next).toBeHidden();
    await expect($.newGame).toBeHidden();
  });

  test('a claim that was complete a few balls ago says so', async ({ page }) => {
    await openWithGame(page, sequenceStartingWith(...LINE_1, 70, 71, 72), 8, { stage: 0 });
    const $ = await checkClaim(page, [LINE_1]);
    await expect($.verdict).toHaveText('1 line! ✅');
    await expect($.note).toHaveText('Complete since 88, 3 balls ago.');
  });

  test('validation errors are listed, and the claim can then be fixed', async ({ page }) => {
    await openWithGame(page, sequenceStartingWith(...LINE_1, ...LINE_2), 10, { stage: 1 });
    const $ = claim(page);
    await ui(page).check.click();

    await $.submit.click();
    await expect($.errors).toHaveText(['Enter 2 lines of 5 numbers, one per line.']);

    await $.input.fill('4 23 45 61\n7 7 32 50 99');
    await $.submit.click();
    await expect($.errors).toHaveText([
      'Line 1 has 4 numbers; a line has 5.',
      'Line 2: 99 is not between 1 and 90.',
      '7 is entered more than once.',
    ]);
    await expect($.input).toHaveAttribute('aria-invalid', 'true');
    await expect($.input).toBeFocused();
    await expect($.verdict).toBeHidden();

    await $.input.fill('4 23 45 61 88\n7 19 32 50 77');
    await $.submit.click();
    await expect($.verdict).toHaveText('2 lines! ✅');

    // Errors don't linger into the next check.
    await $.again.click();
    await expect($.errors).toHaveCount(0);
    await expect($.input).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('a pasted block with a line per row is read as is', async ({ page }) => {
    await openWithGame(page, sequenceStartingWith(...TICKET), 15, { stage: 2 });
    const $ = claim(page);
    await ui(page).check.click();
    await $.input.focus();
    await page.keyboard.insertText('4, 23, 45, 61, 88\r\n7 19 32 50 77\r\n\r\n2 16 38 64 81\r\n');
    await $.submit.click();
    await expect($.verdict).toHaveText('Full house! 🎉');
  });

  test('the box shows how many lines to enter for the stage', async ({ page }) => {
    await openWithGame(page, sequenceStartingWith(), 0, { stage: 0 });
    const $ = claim(page);
    await ui(page).check.click();
    await expect($.dialog).toContainText('Type or paste the 5 numbers of the line.');
    await expect($.input).toHaveAttribute('rows', '1');
    await $.cancel.click();
    await expect($.dialog).toBeHidden();

    await page.keyboard.press('n');
    await page.keyboard.press('n');
    await ui(page).check.click();
    await expect($.dialog).toContainText('Type or paste the 15 numbers, one ticket line per line of text.');
    await expect($.input).toHaveAttribute('rows', '3');
    expect((await $.input.getAttribute('placeholder')).split('\n')).toHaveLength(3);
  });
});

test.describe('keys', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T19:00:00Z');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  test('C opens the checker, pauses auto, and leaves the box empty', async ({ page }) => {
    await openWithGame(page, sequenceStartingWith(...LINE_1), 0, { stage: 0 });
    const $ = ui(page);
    await $.auto.click();
    await page.clock.runFor(5_100);
    await expect($.count).toHaveText('1 / 90 called');

    await page.keyboard.press('c');
    await expect(claim(page).dialog).toBeVisible();
    await expect($.auto).toHaveAttribute('aria-pressed', 'false');
    await expect(claim(page).input).toBeFocused();
    await expect(claim(page).input).toHaveValue('');
    await page.clock.runFor(20_000);
    await expect($.count).toHaveText('1 / 90 called');
  });

  test('typing in the checker does not trigger shortcuts, and Escape closes it', async ({ page }) => {
    await openWithGame(page, sequenceStartingWith(...LINE_1), 0, { stage: 0 });
    const $ = ui(page);
    await page.keyboard.press('c');
    await page.keyboard.type('n a f ');
    await expect(claim(page).input).toHaveValue('n a f ');
    await page.keyboard.press('Space');
    await expect($.stageBanner).toHaveText('Playing for: 1 line');
    await expect($.auto).toHaveAttribute('aria-pressed', 'false');
    await expect($.count).toHaveText('0 / 90 called');

    await page.keyboard.press('Escape');
    await expect(claim(page).dialog).toBeHidden();
    await page.keyboard.press('Space');
    await expect($.count).toHaveText('1 / 90 called');
  });

  test('Space releases a ball straight after the checker closes', async ({ page }) => {
    // The dialog loses `open` at once but its close event comes a task later,
    // with focus still on the hidden claim box. Send Space into that gap.
    await openWithGame(page, sequenceStartingWith(1, 2), 0, { stage: 0 });
    await page.keyboard.press('c');
    await page.evaluate(() => {
      document.getElementById('claim').close();
      const box = document.getElementById('claim-numbers');
      box.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    });
    await expect(ui(page).count).toHaveText('1 / 90 called');
  });

  test('Enter starts a new line and Ctrl+Enter checks', async ({ page }) => {
    await openWithGame(page, sequenceStartingWith(...LINE_1, ...LINE_2), 10, { stage: 1 });
    await page.keyboard.press('c');
    await page.keyboard.type('4 23 45 61 88');
    await page.keyboard.press('Enter');
    await page.keyboard.type('7 19 32 50 77');
    await expect(claim(page).verdict).toBeHidden();
    await page.keyboard.press('Control+Enter');
    await expect(claim(page).verdict).toHaveText('2 lines! ✅');
  });

  test('Cmd+Enter checks too, for the Mac', async ({ page }) => {
    await openWithGame(page, sequenceStartingWith(...LINE_1), 5, { stage: 0 });
    await page.keyboard.press('c');
    await page.keyboard.type('4 23 45 61 88');
    await page.keyboard.press('Meta+Enter');
    await expect(claim(page).verdict).toHaveText('1 line! ✅');
  });

  test('picking a stage pauses auto', async ({ page }) => {
    await openWithGame(page, sequenceStartingWith(1, 2, 3), 0, { stage: 0 });
    const $ = ui(page);
    await $.auto.click();
    await $.stageBanner.click();
    await expect($.auto).toHaveAttribute('aria-pressed', 'false');
    // Shortcuts are ignored while the picker is open.
    await page.keyboard.press('n');
    await page.clock.runFor(20_000);
    await expect($.count).toHaveText('0 / 90 called');
    await page.keyboard.press('Escape');
    await expect($.stageBanner).toHaveText('Playing for: 1 line');
  });
});
