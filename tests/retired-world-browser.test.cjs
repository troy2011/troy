'use strict';
require('./no-external-services.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { bootstrapMainApp } = require('./helpers/main-app-harness');

test('retired navigation returns home without loading the world', async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  const context = await browser.newContext({ baseURL: 'https://troy.test', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const worldRequests = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/\/api\/(?:get-world-map-layout|get-map-occupation|start-ship-voyage|territory)/.test(request.url())) worldRequests.push(request.url());
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'troy.test') return route.abort();
    const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const root = path.resolve('public'), file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[path.extname(file).toLowerCase()] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file) });
  });
  try {
    await bootstrapMainApp(page);
    for (const tab of ['map', 'islands', 'battle']) {
      await page.evaluate(async value => window.showTab(value), tab);
      assert.equal(await page.evaluate(() => document.body.dataset.currentTab), 'home');
    }
    assert.deepEqual(worldRequests, []);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await browser.close();
  }
});
