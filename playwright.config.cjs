const { defineConfig, devices } = require('@playwright/test');

const port = Number(process.env.PLAYWRIGHT_STATIC_PORT || 4173);

module.exports = defineConfig({
  testDir: './tests',
  globalTeardown: require.resolve('./scripts/playwright-global-teardown.js'),
  testMatch: ['**/*.spec.js'],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 45_000,
  expect: {
    timeout: 5_000
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome']
      }
    }
  ],
  webServer: {
    command: `node scripts/playwright-static-server.js --port ${port} --root public`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
