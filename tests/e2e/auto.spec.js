import { test, expect } from './fixtures.js';
import { open, openWithGame, sequenceStartingWith, ui, SPEED_KEY } from './helpers.js';

// Playwright's fake clock means these run instantly instead of waiting
// real seconds between balls. An installed clock still ticks in real time
// until paused, so pause it: time then only moves via runFor().
test.beforeEach(async ({ page }) => {
  const start = new Date('2026-01-01T19:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
});

test('auto mode draws a ball every interval until paused', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(1, 2, 3, 4));
  const $ = ui(page);

  await $.auto.click();
  await expect($.auto).toHaveAttribute('aria-pressed', 'true');
  await expect($.countdown).toHaveText('5s');

  await page.clock.runFor(4_900);
  await expect($.currentBall).toHaveClass(/is-empty/);
  await page.clock.runFor(200);
  await expect($.currentBall).toHaveText('1');
  await page.clock.runFor(5_000);
  await expect($.currentBall).toHaveText('2');

  await page.keyboard.press('a');
  await expect($.auto).toHaveAttribute('aria-pressed', 'false');
  await expect($.countdown).toBeHidden();
  await page.clock.runFor(20_000);
  await expect($.currentBall).toHaveText('2');
});

test('a new speed applies from the next ball and is remembered', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(1, 2, 3));
  const $ = ui(page);

  await $.speed.fill('10');
  await expect($.speedValue).toHaveText('10s');
  await $.auto.click();
  await page.clock.runFor(9_900);
  await expect($.currentBall).toHaveClass(/is-empty/);
  await page.clock.runFor(200);
  await expect($.currentBall).toHaveText('1');

  await page.reload();
  await expect(ui(page).speedValue).toHaveText('10s');
});

test('releasing a ball manually during auto restarts the countdown', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(1, 2, 3));
  const $ = ui(page);

  await $.auto.click();
  await page.clock.runFor(4_000);
  await page.keyboard.press('Space');
  await expect($.currentBall).toHaveText('1');

  await page.clock.runFor(4_000); // 8s since start, but only 4s since the manual ball
  await expect($.currentBall).toHaveText('1');
  await page.clock.runFor(1_100);
  await expect($.currentBall).toHaveText('2');
});

test('auto stops by itself when all 90 balls are out', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(), 88);
  const $ = ui(page);

  await $.auto.click();
  await page.clock.runFor(10_100);
  await expect($.count).toHaveText('All 90 called');
  await expect($.auto).toHaveAttribute('aria-pressed', 'false');
  await expect($.auto).toBeDisabled();
});

test('after a reload, auto mode is paused', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(1, 2));
  const $ = ui(page);
  await $.auto.click();
  await page.clock.runFor(5_100);
  await expect($.currentBall).toHaveText('1');

  await page.reload();
  await expect($.auto).toHaveAttribute('aria-pressed', 'false');
  await page.clock.runFor(20_000);
  await expect($.currentBall).toHaveText('1');
});

test('the Auto button counts down and fills up towards the next ball', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(1, 2));
  const $ = ui(page);
  const progress = () => $.auto.evaluate((button) => Number(button.style.getPropertyValue('--progress')));
  await $.auto.click();
  await expect($.countdown).toHaveText('5s');
  await page.clock.runFor(2_000);
  await expect($.countdown).toHaveText('3s');
  // 2 of 5 seconds gone: the button is 40% filled.
  await expect.poll(progress).toBeCloseTo(0.4, 1);

  // Pausing empties it again.
  await $.auto.click();
  await expect($.countdown).toBeHidden();
  expect(await progress()).toBe(0);
});

test('the Auto button keeps a steady name while counting down', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(1, 2));
  const $ = ui(page);
  await expect($.auto).toHaveAccessibleName('Auto A');
  await $.auto.click();
  await expect($.countdown).toHaveText('5s');
  // The seconds are for sighted viewers; a screen reader hears a name that
  // doesn't change every second, and the description says what they mean.
  await expect($.auto).toHaveAccessibleName('Pause A');
  await expect($.auto).toHaveAccessibleDescription(/next ball/);

  // Pause and start again: the description comes back with the countdown.
  await $.auto.click();
  await expect($.auto).toHaveAccessibleName('Auto A');
  await expect($.auto).not.toHaveAttribute('title');
  await $.auto.click();
  await expect($.countdown).toHaveText('5s');
  await expect($.auto).toHaveAccessibleDescription(/next ball/);
});

test('the running Auto button stays green with the mouse over it', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(1, 2));
  const $ = ui(page);
  const background = () => $.auto.evaluate((button) => getComputedStyle(button).backgroundColor);
  await page.mouse.move(0, 0);
  await $.auto.hover();
  const idleHover = await background();

  // Clicking leaves the mouse on the button; it should still look "on".
  await $.auto.click();
  await expect($.auto).toHaveAttribute('aria-pressed', 'true');
  expect(await background()).not.toBe(idleHover);
});

test('opening a confirmation pauses auto, so no ball is drawn behind it', async ({ page }) => {
  await openWithGame(page, sequenceStartingWith(1, 2, 3));
  const $ = ui(page);
  await $.auto.click();
  await page.clock.runFor(5_100);
  await expect($.currentBall).toHaveText('1');

  await $.undo.click();
  await expect($.auto).toHaveAttribute('aria-pressed', 'false');
  await page.clock.runFor(20_000);
  await $.dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect($.currentBall).toHaveText('1');
  await expect($.count).toHaveText('1 / 90 called');
});

test('a remembered speed outside the configured range is clamped', async ({ page }) => {
  await open(page);
  await page.evaluate((key) => localStorage.setItem(key, '60'), SPEED_KEY);
  await page.reload();
  await expect(ui(page).speedValue).toHaveText('15s');
});
