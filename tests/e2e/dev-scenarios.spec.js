// The dev server's /dev/ page. It isn't in the Docker image, so this is
// skipped when testing a container (BASE_URL set).
import { test, expect } from './fixtures.js';
import { ui } from './helpers.js';

test.skip(!!process.env.BASE_URL, 'The scenario page is served by the dev server only');

test('picking a scenario loads its game into the caller', async ({ page }) => {
  await page.goto('/dev/');
  await expect(page.getByRole('heading', { name: 'Scenarios' })).toBeVisible();
  await page.getByRole('button', { name: 'Full house on the next ball' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  const $ = ui(page);
  await expect($.stageBanner).toHaveText('Playing for: Full house');
  await expect($.count).toHaveText('14 / 90 called');
  await page.keyboard.press('Space');
  await expect($.currentBall).toHaveText('81');
});

test('claim scenarios show the lines to type into the checker', async ({ page }) => {
  await page.goto('/dev/');
  const item = page.getByRole('listitem').filter({ hasText: '2 lines, one ball short' });
  await expect(item.locator('pre')).toHaveText('4 23 45 61 88\n7 19 32 50 77');
});

test('"No saved game" clears the game but keeps settings', async ({ page }) => {
  await page.goto('/dev/');
  await page.getByRole('button', { name: 'House call next' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => localStorage.setItem('bingo.speedSeconds.v1', '9'));

  await page.goto('/dev');
  await page.getByRole('button', { name: 'No saved game' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(ui(page).count).toHaveText('0 / 90 called');
  await expect(ui(page).speedValue).toHaveText('9s');
});

test('the dev server does not serve files outside public/ and dev/', async ({ request }) => {
  for (const path of ['/dev/%2e%2e/package.json', '/dev/..%2fpackage.json', '/%2e%2e/package.json']) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
