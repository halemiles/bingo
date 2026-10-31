import { test, expect } from '@playwright/test';
import { open, openWithGame, sequenceStartingWith, ui } from './helpers.js';

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

test('config.json sets the speed range and default', async ({ page }) => {
  await page.route('**/config.json', (route) =>
    route.fulfill(json({ autoMinSeconds: 2, autoMaxSeconds: 30, autoDefaultSeconds: 8, autoStepSeconds: 2 })),
  );
  await open(page);
  const $ = ui(page);
  await expect($.speed).toHaveAttribute('min', '2');
  await expect($.speed).toHaveAttribute('max', '30');
  await expect($.speed).toHaveAttribute('step', '2');
  await expect($.speedValue).toHaveText('8s');
});

test('without config.json the built-in defaults apply', async ({ page }) => {
  await page.route('**/config.json', (route) => route.fulfill({ status: 404 }));
  await open(page);
  const $ = ui(page);
  await expect($.speed).toHaveAttribute('min', '3');
  await expect($.speed).toHaveAttribute('max', '15');
  await expect($.speedValue).toHaveText('5s');
});

test('an invalid config.json falls back to the defaults', async ({ page }) => {
  await page.route('**/config.json', (route) => route.fulfill(json({ autoMinSeconds: 20, autoMaxSeconds: 5 })));
  await open(page);
  await expect(ui(page).speed).toHaveAttribute('max', '15');
});

test('custom calls from calls.json are shown', async ({ page }) => {
  await page.route('**/data/calls.json', (route) => route.fulfill(json({ 7: 'Lucky number 7' })));
  await openWithGame(page, sequenceStartingWith(7, 88));
  const $ = ui(page);
  await page.keyboard.press('Space');
  await expect($.currentCall).toHaveText('Lucky number 7');
  await page.keyboard.press('Space');
  await expect($.currentCall).toHaveText('');
});

test('calls are shown as text, never as HTML', async ({ page }) => {
  await page.route('**/data/calls.json', (route) => route.fulfill(json({ 1: '<img src=x onerror=alert(1)>' })));
  await openWithGame(page, sequenceStartingWith(1));
  await page.keyboard.press('Space');
  await expect(ui(page).currentCall).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#current-call img')).toHaveCount(0);
});

test('the game still works when calls.json is missing or broken', async ({ page }) => {
  for (const fulfil of [{ status: 404 }, { status: 200, contentType: 'application/json', body: '{oops' }]) {
    await page.unrouteAll();
    await page.route('**/data/calls.json', (route) => route.fulfill(fulfil));
    await openWithGame(page, sequenceStartingWith(88));
    await page.keyboard.press('Space');
    await expect(ui(page).currentBall).toHaveText('88');
    await expect(ui(page).currentCall).toHaveText('');
  }
});
