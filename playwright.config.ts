import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against a production build of Scalene (node adapter) wired
// to e2e/stub-cms.mjs. CMS_API_BASE_URL / MEDIA_BASE_URL are inlined at BUILD
// time, so the build must happen with them pointing at the stub -- `npm run
// test:e2e:build` does that; CI runs it before the tests.
const CMS_PORT = Number(process.env.E2E_CMS_PORT ?? 4010);
const SITE_PORT = Number(process.env.E2E_SITE_PORT ?? 4321);
const SITE = `http://127.0.0.1:${SITE_PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: SITE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node e2e/stub-cms.mjs',
      url: `http://127.0.0.1:${CMS_PORT}/v1/homepage`,
      reuseExistingServer: !process.env.CI,
      env: { E2E_CMS_PORT: String(CMS_PORT) },
      stdout: 'pipe',
    },
    {
      command: 'node dist/server/entry.mjs',
      url: SITE,
      reuseExistingServer: !process.env.CI,
      env: { HOST: '127.0.0.1', PORT: String(SITE_PORT) },
      timeout: 60_000,
    },
  ],
});
