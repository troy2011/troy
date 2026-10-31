const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { bootstrapMainApp } = require('./helpers/main-app-harness');

// Serve the real app files and deterministic responses without any network access.
async function installOfflineRoutes(page, baseURL) {
  const origin = new URL(baseURL).origin;
  const publicRoot = path.resolve(__dirname, '../public');
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      const responses = {
        '/api/get-inventory': { inventory: [], virtualCurrency: { PS: 0 } },
        '/api/get-equipment': { equipment: {} },
        '/api/tarot-deck-get': { ok: true, tarotDeck: [] },
        '/api/tarot-battle-skills': { ok: true, cards: [] },
        '/api/get-guild-members': { members: [{ playFabId: 'MOCK_PLAYER', displayName: '長い長い長い長い長い船員の名前', role: 'リーダー' }] }
      };
      return route.fulfill({ json: responses[url.pathname] || {} });
    }
    if (request.method() !== 'GET') return route.abort();
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(publicRoot, relative);
    if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return route.fulfill({ status: 404, body: '' });
    }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
    return route.fulfill({ body: fs.readFileSync(file), contentType: types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  });
}

test('inventory category labels stay on one line with usable tap targets', async ({ page, baseURL }) => {
  await installOfflineRoutes(page, baseURL);
  await bootstrapMainApp(page, { fixedHour: 12 });
  await page.evaluate(() => window.showTab('inventory'));
  const tabs = page.locator('#inventoryMobileSwitch .inventory-panel-btn');
  await expect(tabs).toHaveCount(4);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const tab of await tabs.all()) {
      const result = await tab.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(button);
        return { width: rect.width, height: rect.height, lines: range.getClientRects().length, overflow: button.scrollWidth > button.clientWidth };
      });
      expect(result.width).toBeGreaterThanOrEqual(44);
      expect(result.height).toBeGreaterThanOrEqual(44);
      expect(result.lines).toBe(1);
      expect(result.overflow).toBe(false);
    }
  }
});

test('guild member role remains legible beside a long name and modal reopens', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await installOfflineRoutes(page, baseURL);
  await bootstrapMainApp(page, { fixedHour: 12 });
  await page.unroute('**/api/get-guild-info');
  await page.route('**/api/get-guild-info', (route) => route.fulfill({ json: { guild: { guildId: 'MOCK_GUILD', name: '模擬海賊団', memberCount: 1, maxMembers: 8, role: 'リーダー' } } }));
  const openMembers = () => page.evaluate(async () => {
    const guild = await import('/js/guild.js');
    await guild.loadGuildInfo('PF_PLAYWRIGHT');
    await guild.showGuildMembers('PF_PLAYWRIGHT');
  });
  await openMembers();
  const modal = page.locator('#guildMembersModal');
  await expect(modal).toBeVisible();
  const role = modal.locator('#guildMembersList > div > span').last();
  await expect(role).toHaveText('リーダー');
  expect(await role.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getClientRects().length;
  })).toBe(1);
  await modal.getByRole('button', { name: '閉じる' }).click();
  await expect(modal).toBeHidden();
  await openMembers();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
});

test('market heading and controls fit on narrow screens and return focus on close', async ({ page, baseURL }) => {
  await installOfflineRoutes(page, baseURL);
  await bootstrapMainApp(page, { fixedHour: 12 });
  await page.evaluate(() => window.showTab('inventory'));
  let releaseListings;
  await page.route('**/api/black-market/list', async (route) => {
    await new Promise((resolve) => { releaseListings = resolve; });
    await route.fulfill({ json: { listings: [] } });
  });
  const open = page.getByRole('button', { name: '闇市を開く' });
  await open.click();
  const market = page.locator('#blackMarketPanel');
  await expect(market).toBeVisible();
  const refresh = market.getByRole('button', { name: '闇市を更新' });
  await expect(refresh).toBeDisabled();
  expect(await refresh.evaluate((button) => getComputedStyle(button).backgroundImage)).not.toBe('none');
  await expect.poll(() => typeof releaseListings).toBe('function');
  releaseListings();
  await expect(market).toHaveAttribute('aria-busy', 'false');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => market.evaluate((element) => Math.round(parseFloat(getComputedStyle(element).getPropertyValue('--black-market-viewport-width'))))).toBe(width);
    const bounds = await market.locator('.black-market-panel-head').evaluate((head) => {
      const selectors = ['h3', '.black-market-listing-count', '.black-market-refresh', '.black-market-close'];
      const boxes = selectors.map((selector) => {
        const r = head.querySelector(selector).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      });
      const overlaps = boxes.some((box, index) => boxes.slice(index + 1).some((other) =>
        box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top));
      const titleRange = document.createRange();
      titleRange.selectNodeContents(head.querySelector('h3'));
      const titleText = titleRange.getBoundingClientRect();
      const titleOverlapsCount = titleText.right > boxes[1].left && titleText.left < boxes[1].right
        && titleText.bottom > boxes[1].top && titleText.top < boxes[1].bottom;
      return { boxes, overlaps, titleOverlapsCount };
    });
    expect(bounds.overlaps).toBe(false);
    expect(bounds.titleOverlapsCount).toBe(false);
    expect(bounds.boxes[2].width).toBeGreaterThanOrEqual(44);
    expect(bounds.boxes[2].height).toBeGreaterThanOrEqual(44);
    expect(bounds.boxes.every((box) => box.left >= 0 && box.right <= width)).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(market).toBeHidden();
  await expect(open).toBeFocused();
});

test('ship details has a close control visible before scrolling', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await installOfflineRoutes(page, baseURL);
  await page.route('**/api/player-ship/status', (route) => route.fulfill({ json: { success: true, ship: { shipId: 'MOCK_SHIP', form: 'boat', name: 'テスト船' } } }));
  await page.route('**/api/get-ship-asset', (route) => route.fulfill({ json: { success: true, shipData: { ShipType: 'テスト船', Domain: 'sea_surface', Stats: { CurrentHP: 80, MaxHP: 100, Speed: 7, VisionRange: 4, CargoCapacity: 10, CrewCapacity: 3 }, Cargo: [], Crew: [], Equipment: {} } } }));
  await page.route('**/api/get-ship-position', (route) => route.fulfill({ status: 404, json: { error: 'not found' } }));
  await bootstrapMainApp(page, { fixedHour: 12 });
  await page.evaluate(async () => {
    const ship = await import('/js/ship.js');
    await ship.loadPlayerShipProfile('PF_PLAYWRIGHT');
  });
  const shipIcon = page.locator('[data-player-ship-tap]');
  await shipIcon.click();
  const modal = page.locator('#shipDetailsModal');
  const close = modal.getByRole('button', { name: '船の詳細を閉じる' });
  await expect(modal).toBeVisible();
  await expect(close).toBeInViewport();
  const box = await close.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(modal).toBeHidden();
  await shipIcon.click();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
});

test('fortune preparation stays inside the button and restores its label', async ({ page, baseURL }) => {
  await installOfflineRoutes(page, baseURL);
  await page.route('**/js/tarotPoker.js*', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'export async function showDailyFortune() { await new Promise(resolve => { window.__finishMockFortune = resolve; }); }'
  }));
  await bootstrapMainApp(page, { fixedHour: 12 });
  const button = page.locator('#btnDailyFortune');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await button.click();
    await expect(button).toBeDisabled();
    await expect(button).toHaveText('準備中…');
    await expect(button).toHaveAttribute('aria-busy', 'true');
    const fits = await button.evaluate((element) => {
      const buttonRect = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const textRect = range.getBoundingClientRect();
      return range.getClientRects().length === 1 && textRect.left >= buttonRect.left
        && textRect.right <= buttonRect.right && element.scrollWidth <= element.clientWidth;
    });
    expect(fits).toBe(true);
    await expect.poll(() => page.evaluate(() => typeof window.__finishMockFortune)).toBe('function');
    await page.evaluate(() => { window.__finishMockFortune(); delete window.__finishMockFortune; });
    await expect(button).toBeEnabled();
    await expect(button).not.toHaveAttribute('aria-busy', 'true');
    await expect(button).toHaveText('占い');
  }
});

test('public shop and menu fit mobile screens and support Back and Forward', async ({ page, baseURL }) => {
  await installOfflineRoutes(page, baseURL);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/shop/index.html');
    await expect(page).toHaveTitle(/海賊酒場TROY/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.locator('.mobile-cta a[href="/shop/menu.html"]').click();
    await expect(page).toHaveTitle('メニュー｜海賊酒場TROY');
    const heading = page.locator('.menu-hero h1');
    await expect(heading).toBeVisible();
    expect(await heading.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    })).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.goBack();
    await expect(page).toHaveURL(/\/shop\/index\.html$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/shop\/menu\.html$/);
  }
});

test('physical tarot card reading survives Back, Forward and reselection', async ({ page, baseURL }) => {
  await installOfflineRoutes(page, baseURL);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/pirate-tarot.html');
  await expect(page.locator('#cardGrid button')).toHaveCount(78);
  await page.locator('#cardSearch').fill('ソード3');
  await page.locator('[data-card-id="sword-3"]').click();
  await page.getByLabel('逆位置', { exact: false }).check();
  await page.locator('#showReading').click();
  await expect(page.locator('#resultLabel')).toHaveText('ソード 3');
  const cardData = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/pirate-self-readings.json'), 'utf8'));
  const reading = cardData.cards.find((card) => card.id === 'sword-3').meanings.reversed;
  await expect(page.locator('#resultPoint')).toHaveText(reading.point);
  await expect(page.locator('#resultAction')).toHaveText(reading.action);
  await page.goBack();
  await expect(page.locator('#picker')).toBeVisible();
  await expect(page.locator('#selectedLabel')).toHaveText('ソード 3');
  await page.goForward();
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#resultDirection')).toHaveText('逆位置');
  await page.locator('#readAgain').click();
  await expect(page.locator('#picker')).toBeVisible();
  await page.locator('#clearSearch').click();
  await page.locator('#cardSearch').fill('カップ10');
  await page.locator('[data-card-id="cup-10"]').click();
  await expect(page.locator('#showReading')).toBeDisabled();
  await page.getByLabel('正位置', { exact: false }).check();
  await page.locator('#showReading').click();
  await expect(page.locator('#resultLabel')).toHaveText('カップ 10');
  await page.goBack();
  await expect(page.locator('#picker')).toBeVisible();
  await page.goForward();
  await expect(page.locator('#resultLabel')).toHaveText('カップ 10');
});

test('market purchase and listing dialogs cancel without sending transactions', async ({ page, baseURL }) => {
  await installOfflineRoutes(page, baseURL);
  const item = { itemId: 'sword_001', instances: ['sword-stack'], count: 1, name: '長い装備品の名前テスト', customData: { Category: 'Weapon', Power: 12 } };
  const listings = [
    { listingId: 'mine-1', sellerPlayFabId: 'PF_PLAYWRIGHT', sellerDisplayName: '自分', itemId: item.itemId, itemName: item.name, itemData: item.customData, price: 88, status: 'active', isMine: true },
    { listingId: 'other-1', sellerPlayFabId: 'OTHER', sellerDisplayName: '船員', itemId: item.itemId, itemName: item.name, itemData: item.customData, price: 99, status: 'active', isMine: false }
  ];
  const transactions = [];
  await page.route('**/api/get-inventory', (route) => route.fulfill({ json: { inventory: [item], virtualCurrency: { PS: 100 }, contribution: 0, blackMarketMyActiveCount: 0, blackMarketMaxActiveListings: 5 } }));
  await page.route('**/api/black-market/list', (route) => route.fulfill({ json: { status: 'success', listings, myActiveCount: 1, maxActiveListings: 5 } }));
  await page.route(/\/api\/black-market\/(create|buy|cancel)$/, (route) => { transactions.push(route.request().url()); return route.abort(); });
  await bootstrapMainApp(page, { fixedHour: 12 });
  await page.evaluate(async () => {
    window.showTab('inventory');
    const inventory = await import('/js/inventory.js');
    await inventory.getInventory('PF_PLAYWRIGHT', { force: true });
    inventory.switchInventoryTab('Weapon');
  });
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: '闇市を開く' }).click();
    const market = page.locator('#blackMarketPanel');
    await expect(market.locator('.black-market-listing')).toHaveCount(2);
    await market.locator('.black-market-listing-action.is-buy').click();
    const dialog = page.locator('#inventoryActionDialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('99G');
    for (const control of await dialog.locator('.inventory-action-dialog-actions button').all()) {
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    const box = await dialog.locator('.inventory-action-dialog-sheet').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(market).toBeVisible();
    await market.locator('.black-market-listing-action.is-buy').click();
    await dialog.locator('.inventory-action-dialog-cancel').click();
    await market.locator('.black-market-listing-action.is-cancel').click();
    await dialog.locator('.inventory-action-dialog-cancel').click();
    await market.getByRole('button', { name: '闇市を閉じる' }).click();
    await expect(market).toBeHidden();
    await page.locator('#inventoryGrid .inventory-item-cell[data-category="Weapon"]').click();
    const listingAction = page.locator('#itemDetailButtons .item-detail-action', { hasText: '闇市に出す' });
    if (!await listingAction.isVisible()) await listingAction.locator('xpath=ancestor::details[1]/summary').click();
    await listingAction.click();
    await expect(dialog).toBeVisible();
    await dialog.locator('.inventory-action-dialog-input').fill('1.5');
    await dialog.locator('.inventory-action-dialog-confirm').click();
    await expect(dialog).toContainText('整数');
    expect((await dialog.locator('.inventory-action-dialog-input').boundingBox()).height).toBeGreaterThanOrEqual(44);
    await dialog.locator('.inventory-action-dialog-cancel').click();
    await expect(dialog).toBeHidden();
    await page.locator('#itemDetailModal .item-detail-corner-close').click();
  }
  expect(transactions).toEqual([]);
});

test('closing and reopening market ignores the older in-flight response', async ({ page, baseURL }) => {
  await installOfflineRoutes(page, baseURL);
  const pending = [];
  await page.route('**/api/black-market/list', async (route) => {
    const sequence = pending.length;
    await new Promise((resolve) => { pending.push(resolve); });
    const listing = { listingId: String(sequence), sellerDisplayName: '船員', itemId: 'sword_001', itemName: sequence === 0 ? '古い出品' : '最新の出品', itemData: { Category: 'Weapon' }, price: 99, status: 'active', isMine: false };
    await route.fulfill({ json: { listings: [listing] } });
  });
  await bootstrapMainApp(page, { fixedHour: 12 });
  await page.evaluate(() => window.showTab('inventory'));
  const open = page.getByRole('button', { name: '闇市を開く' });
  const market = page.locator('#blackMarketPanel');
  await open.click();
  await expect.poll(() => pending.length).toBe(1);
  await market.getByRole('button', { name: '闇市を閉じる' }).click();
  await expect(market).toBeHidden();
  await expect(page.locator('#loadingSpinner')).toBeHidden();
  await open.click();
  await expect.poll(() => pending.length).toBe(2);
  await expect(market).toHaveAttribute('aria-busy', 'true');
  pending[0]();
  await page.waitForTimeout(100);
  await expect(market).toHaveAttribute('aria-busy', 'true');
  await expect(market).not.toContainText('古い出品');
  pending[1]();
  await expect(market).toHaveAttribute('aria-busy', 'false');
  await expect(market).toContainText('最新の出品');
});

test('market shows a loading failure and can retry', async ({ page, baseURL }) => {
  await installOfflineRoutes(page, baseURL);
  let attempts = 0;
  await page.route('**/api/black-market/list', (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 503, json: { error: '一時的に取得できません' } })
      : route.fulfill({ json: { listings: [] } });
  });
  await bootstrapMainApp(page, { fixedHour: 12 });
  await page.evaluate(() => window.showTab('inventory'));
  await page.getByRole('button', { name: '闇市を開く' }).click();
  const market = page.locator('#blackMarketPanel');
  await expect(market.locator('.black-market-empty.is-error')).toContainText('一時的に取得できません');
  const refresh = market.getByRole('button', { name: '闇市を更新' });
  await expect(refresh).toBeEnabled();
  await refresh.click();
  await expect(market).toContainText('出品はありません');
  expect(attempts).toBe(2);
});
