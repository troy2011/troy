const { defineConfig } = require('@playwright/test');

// Never turn an explicitly configured production process into a test process.
if (process.env.NODE_ENV && !['test', 'development'].includes(process.env.NODE_ENV)) {
  throw new Error('AI fixtures require NODE_ENV=test or development (or unset).');
}
process.env.NODE_ENV = 'test';
process.env.TROY_AI_TEST = '1';
process.env.PLAYWRIGHT_STATIC_PORT = '4187';

module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'ai-app-poc.test.cjs',
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: 'tmp/ai-test-results',
  reporter: [['list']],
  globalTeardown: './scripts/playwright-global-teardown.js',
  use: {
    baseURL: 'http://127.0.0.1:4187',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
    launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] },
    // Raw traces/HAR may include headers or bodies; use the safe JSON report instead.
    trace: 'off',
    video: 'off',
    screenshot: 'off'
  },
  webServer: {
    command: 'node scripts/playwright-static-server.js --port 4187 --root public',
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: false
  }
});
