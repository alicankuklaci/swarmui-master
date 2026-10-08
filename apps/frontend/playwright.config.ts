import { defineConfig, devices } from '@playwright/test';

/**
 * SwarmUI E2E configuration.
 *
 * Tests run against the LIVE production instance by default:
 *   http://212.83.131.111:1519
 *
 * Overrides:
 *   PLAYWRIGHT_BASE_URL  - alternate SwarmUI base URL
 *   SWARMUI_USER         - admin username (default: root)
 *   SWARMUI_PASS         - admin password
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './playwright-report-results',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  // Workers=1 keeps mutation ordering sane and avoids backend rate limits (10/min).
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://212.83.131.111:1519',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
