// The TV setup: everything fits without scrolling, fullscreen, cursor
// hiding, keeping the screen awake, and surviving blocked storage.
import { test, expect } from './fixtures.js';
import { open, openWithGame, sequenceStartingWith, ui, claim, checkClaim } from './helpers.js';

async function expectOnScreen(locators, viewport) {
  for (const locator of locators) {
    const box = await locator.boundingBox();
    expect(box, 'element is rendered').not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
}

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
]) {
  test(`everything fits on a ${viewport.width}x${viewport.height} screen`, async ({ page }) => {
    await page.setViewportSize(viewport);
    // Full house is the longest banner.
    await openWithGame(page, sequenceStartingWith(88, 47, 12, 3), 4, { stage: 2 });
    const $ = ui(page);
    await expectOnScreen(
      [$.stageBanner, $.check, $.nextStage, $.currentBall, $.currentCall, $.recent.last(), $.cell(1), $.cell(90), $.release, $.newGame],
      viewport,
    );
    // The banner sits above the game, clear of the board.
    const banner = await $.stageBanner.boundingBox();
    expect(banner.y + banner.height).toBeLessThanOrEqual((await $.cell(1).boundingBox()).y);
  });

  test(`a full house claim fits on a ${viewport.width}x${viewport.height} screen`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const ticket = [
      [1, 12, 23, 34, 45],
      [2, 13, 24, 35, 46],
      [3, 14, 25, 36, 47],
    ];
    await openWithGame(page, sequenceStartingWith(...ticket.flat()), 15, { stage: 2 });
    const $ = await checkClaim(page, ticket);
    await expect($.verdict).toHaveText('Full house! 🎉');
    await expectOnScreen([$.verdict, $.called.last(), $.close, $.newGame], viewport);

    // The entry box with every validation error showing fits too.
    await $.again.click();
    await claim(page).input.fill('1 2 3 4\n5 5 6 7 8 9\n0 91 x');
    await claim(page).submit.click();
    await expect(claim(page).errors).not.toHaveCount(0);
    await expectOnScreen([claim(page).input, claim(page).errors.last(), claim(page).submit], viewport);
  });
}

test('F toggles fullscreen and the button label follows', async ({ page }) => {
  await open(page);
  const label = page.locator('#fullscreen-label');
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(label).toHaveText('Exit fullscreen');
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await expect(label).toHaveText('Fullscreen');
});

test('in fullscreen the cursor hides when idle and returns on movement', async ({ page }) => {
  await page.clock.install();
  await open(page);
  await page.getByRole('button', { name: /Fullscreen/ }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);

  await page.clock.runFor(3_100);
  await expect(page.locator('body')).toHaveClass(/cursor-hidden/);
  await page.mouse.move(200, 200);
  await expect(page.locator('body')).not.toHaveClass(/cursor-hidden/);
});

test.describe('keeping the screen awake', () => {
  // Stub the Wake Lock API so the test can see requests and releases.
  async function stubWakeLock(page, { fail = false } = {}) {
    await page.addInitScript((fail) => {
      window.wakeLockRequests = 0;
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          async request(type) {
            window.wakeLockRequests++;
            if (fail) throw new DOMException('Not allowed', 'NotAllowedError');
            const lock = new EventTarget();
            lock.type = type;
            lock.release = async () => lock.dispatchEvent(new Event('release'));
            window.wakeLock = lock;
            return lock;
          },
        },
      });
    }, fail);
  }
  const requests = (page) => page.evaluate(() => window.wakeLockRequests);

  test('is requested from the first ball, and again after the lock is lost', async ({ page }) => {
    await stubWakeLock(page);
    await openWithGame(page, sequenceStartingWith(1, 2, 3));
    expect(await requests(page)).toBe(0);

    await page.keyboard.press('Space');
    await expect.poll(() => requests(page)).toBe(1);
    await page.keyboard.press('Space');
    expect(await requests(page)).toBe(1); // already held

    // The OS drops the lock (e.g. the tab was hidden); coming back re-requests it.
    await page.evaluate(() => window.wakeLock.release());
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => requests(page)).toBe(2);
  });

  test('a refused lock does not stop the game', async ({ page }) => {
    await stubWakeLock(page, { fail: true });
    await openWithGame(page, sequenceStartingWith(1, 2));
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await expect(ui(page).count).toHaveText('2 / 90 called');
  });
});

test('the game still works when browser storage is blocked', async ({ page }) => {
  // Some private-browsing modes throw on any storage access.
  await page.addInitScript(() => {
    const blocked = () => {
      throw new DOMException('Storage disabled', 'SecurityError');
    };
    Storage.prototype.getItem = blocked;
    Storage.prototype.setItem = blocked;
  });
  await open(page);
  const $ = ui(page);
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect($.count).toHaveText('2 / 90 called');
  await $.speed.fill('8');
  await expect($.speedValue).toHaveText('8s');
});

test('a saved game that is not valid JSON is replaced with a new one', async ({ page }) => {
  await open(page);
  await page.evaluate(() => localStorage.setItem('bingo.game.v1', '{not json'));
  await page.reload();
  await expect(ui(page).count).toHaveText('0 / 90 called');
});
