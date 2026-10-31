// Shared Playwright `test`. With COVERAGE=1 it records V8 JavaScript coverage
// of the app's own scripts (Chromium only) into coverage/e2e/, which
// scripts/e2e-coverage.js turns into a per-line report.

import { test as base, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const COVERAGE_DIR = join(process.cwd(), 'coverage', 'e2e');

export const test = base.extend({
  collectCoverage: [
    async ({ page, browserName }, use, testInfo) => {
      const enabled = process.env.COVERAGE === '1' && browserName === 'chromium';
      if (enabled) await page.coverage.startJSCoverage({ resetOnNavigation: false });
      await use();
      if (!enabled) return;
      const entries = (await page.coverage.stopJSCoverage()).filter(({ url }) => /\/[\w-]+\.js$/.test(url));
      await mkdir(COVERAGE_DIR, { recursive: true });
      await writeFile(join(COVERAGE_DIR, `${testInfo.testId}.json`), JSON.stringify(entries));
    },
    { auto: true },
  ],
});

export { expect };
