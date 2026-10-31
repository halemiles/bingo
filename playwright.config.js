import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`,
    // The target is a 1080p TV.
    viewport: { width: 1920, height: 1080 },
    trace: 'retain-on-failure',
  },
  // Firefox is what drives the TV on the night; Chromium also collects coverage.
  // Run one with --project=firefox or --project=chromium.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
          firefoxUserPrefs: {
            // nginx sends Cross-Origin-Opener-Policy: same-origin, so the first
            // navigation in each new context (from about:blank) switches
            // browsing context group. Under Playwright that navigation
            // sometimes never commits, which stalled 4-14 tests per container
            // run. Test browser only: the header still ships, and
            // container.spec.js checks it's sent.
            'browser.tabs.remote.useCrossOriginOpenerPolicy': false,
          },
        },
      },
    },
  ],
  // Set BASE_URL to run the suite against a running container instead.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'node scripts/serve.js',
        env: { PORT: String(PORT) },
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: !process.env.CI,
      },
});
