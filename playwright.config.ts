import { defineConfig, devices } from '@playwright/test'

// Runs against `npm run preview` (a real built production bundle) rather
// than the dev server, and against a Cloudflare Pages preview deployment
// URL in CI (see .github/workflows/ci.yml) so the Pages Functions edge
// layer (login, session cookie, API proxy) is exercised for real, not
// mocked — this is the gap the readiness audit flagged: nothing previously
// proved the full login -> cookie -> proxy -> backend path end to end.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.HIVE_UI_E2E_BASE_URL || 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.HIVE_UI_E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run preview -- --port 4173',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
})
