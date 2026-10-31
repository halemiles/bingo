// The TV setup: everything fits without scrolling, fullscreen, cursor
// hiding, keeping the screen awake, and surviving blocked storage.
import { test, expect } from './fixtures.js';
import { open, openWithGame, sequenceStartingWith, ui } from './helpers.js';

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
]) {
  test(`everything fits on a ${viewport.width}x${viewport.height} screen`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openWithGame(page, sequenceStartingWith(88, 47, 12, 3), 4);
    const $ = ui(page);
    for (const locator of [$.currentBall, $.currentCall, $.recent.last(), $.cell(1), $.cell(90), $.release, $.newGame]) {
      const box = await locator.boundingBox();
      expect(box, 'element is rendered').not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
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
