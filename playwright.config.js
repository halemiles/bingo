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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } }],
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
