// Checks that only make sense against the real nginx container: security
// headers, the health endpoint, config.json rendered from env vars, and the
// strict CSP not blocking anything. Run with BASE_URL pointing at it (CI does).
import { test, expect } from './fixtures.js';
import { open, ui } from './helpers.js';

test.skip(!process.env.BASE_URL, 'container-only: set BASE_URL to a running container');

test('security headers are sent', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("default-src 'none'");
  expect(headers['content-security-policy']).toContain("script-src 'self'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['cache-control']).toBe('no-cache');
  expect(headers['server']).toBe('nginx'); // no version number
});

test('health endpoint and rendered config are served', async ({ request }) => {
  const health = await request.get('/healthz');
  expect(health.status()).toBe(200);

  const config = await request.get('/config.json');
  expect(config.status()).toBe(200);
  expect(config.headers()['content-type']).toContain('application/json');
  const body = await config.json();
  expect(Object.keys(body).sort()).toEqual(['autoDefaultSeconds', 'autoMaxSeconds', 'autoMinSeconds', 'autoStepSeconds']);
});

test('the strict CSP blocks nothing the app needs', async ({ page }) => {
  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await open(page);
  await page.keyboard.press('Space');
  await ui(page).auto.click();
  await ui(page).auto.click();
  await expect(ui(page).count).toHaveText('1 / 90 called');
  expect(await page.evaluate(() => document.fonts.check('700 20px "Atkinson Hyperlegible"'))).toBe(true);
  expect(problems).toEqual([]);
});
