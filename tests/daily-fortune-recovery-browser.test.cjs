'use strict';
require('./no-external-services.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { bootstrapMainApp } = require('./helpers/main-app-harness');

test('previous-day recovery remains visible until acknowledged and refreshes inventory', async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  const context = await browser.newContext({ baseURL: 'https://troy.test', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const oldDay = new Date(Date.now() + 9 * 3600000 - 86400000).toISOString().slice(0, 10);
  let ready = false, acknowledgements = 0, inventoryRequests = 0;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/api/get-inventory')) inventoryRequests++; });
  await page.addInitScript(() => localStorage.setItem('troy:fortune-pending:PF_PLAYWRIGHT', '1'));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'troy.test') return route.abort();
    const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const root = path.resolve('public'), file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[path.extname(file).toLowerCase()] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file) });
  });
  const result = { dayKey: oldDay, cardId: 'fixture', cardNumber: 3, suit: 'Sword', isArcana: false,
    cardName: 'ソードの3', orientation: 'upright', weather: { level: 5, windLabel: '順風' },
    strikeLine: '今日の一歩を確かめ、落ち着いて進みましょう。', fortune: '順風', rewardType: 'card', rewardPs: 3 };
  await page.route('**/api/tarot-fortune-status', route => route.fulfill({ json: acknowledgements
    ? { canDraw: true, result: null }
    : !ready ? { state: 'pending', canDraw: false, result: null }
      : { state: 'recovered', recoveryDay: oldDay, dayKey: oldDay, canDraw: false, result,
        dailyBountyReward: { awarded: true, eligible: true, alreadyClaimed: true, rank: 1, rewardDayKey: oldDay, items: [{ itemId: 'bonus-card', amount: 1 }] } } }));
  // The ranking reward is shown by its inventory name, never its internal id.
  await page.route('**/api/get-inventory', route => route.fulfill({ json: {
    inventory: [{ itemId: 'bonus-card', name: 'ボーナスカード', count: 1, customData: { Category: 'Consumable' } }], virtualCurrency: { PS: 0 }, contribution: 0 } }));
  await page.route('**/api/tarot-fortune-ack-recovery', route => {
    assert.equal(route.request().postDataJSON().dayKey, oldDay); acknowledgements++;
    return route.fulfill({ json: { ok: true } });
  });
  try {
    await bootstrapMainApp(page);
    assert.equal(acknowledgements, 0);
    const before = inventoryRequests;
    await page.locator('#btnDailyFortune').click();
    await page.locator('#dailyTarotFortuneModal .tarot-fortune-retry').waitFor({ state: 'visible' });
    assert.equal(acknowledgements, 0);
    ready = true;
    await page.locator('#dailyTarotFortuneModal .tarot-fortune-retry').click();
    await page.waitForFunction(() => document.getElementById('dailyTarotFortuneSub')?.textContent.includes('本日の占いを始められます'));
    assert.equal(acknowledgements, 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('troy:fortune-pending:PF_PLAYWRIGHT')), null);
    await page.waitForFunction(() => document.getElementById('dailyTarotFortuneBounty')?.innerText.includes('ボーナスカード'));
    assert.doesNotMatch(await page.locator('#dailyTarotFortuneBounty').innerText(), /bonus-card/);
    assert.ok(inventoryRequests > before);
    await page.locator('#dailyTarotFortuneModal .tarot-fortune-close').click();
    await page.locator('#btnDailyFortune').click();
    await page.waitForFunction(() => document.getElementById('dailyTarotFortuneCardHost')?.querySelectorAll('button').length > 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); await browser.close(); }
});
