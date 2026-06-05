const { test, expect } = require('@playwright/test');

test('staff register creates a checkout from an in-store member and settles with chip return', async ({ page }) => {
  const now = Date.now();
  const state = {
    troyOpen: true,
    nation: 'fire',
    troyTodaySales: { total: 0, count: 0 },
    troyCoinConversionLogs: [],
    troyMembers: [
      { playFabId: 'PLAYER1', displayName: '海風の船長', joinedAtMs: now - 600000, level: 24, rankName: '船長' },
      { playFabId: 'PLAYER2', displayName: '港町の料理人', joinedAtMs: now - 300000, level: 18, rankName: '航海士' }
    ],
    troyPendingCheckouts: []
  };
  const addItemRequests = [];
  const settleRequests = [];

  await page.addInitScript(() => {
    window.EventSource = class {
      constructor() {}
      close() {}
    };
  });

  await page.route('**/api/troy-orders/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(state)
    });
  });

  await page.route('**/api/troy-orders/add-item', async (route) => {
    const body = route.request().postDataJSON();
    addItemRequests.push(body);
    const existing = state.troyPendingCheckouts.find((entry) => entry.playFabId === body.receiverPlayFabId);
    const item = {
      orderId: `staff:${body.receiverPlayFabId}:${Date.now()}`,
      name: body.name,
      quantity: body.quantity || 1,
      price: body.price,
      lineTotal: body.price * (body.quantity || 1),
      status: 'pending',
      orderedAtMs: Date.now()
    };
    if (existing) {
      existing.items.push(item);
      existing.total += item.lineTotal;
      existing.totalItems += item.quantity;
      existing.lastOrderedAtMs = item.orderedAtMs;
    } else {
      const member = state.troyMembers.find((entry) => entry.playFabId === body.receiverPlayFabId);
      state.troyPendingCheckouts.push({
        playFabId: body.receiverPlayFabId,
        displayName: member?.displayName || body.receiverPlayFabId,
        status: 'open',
        total: item.lineTotal,
        totalItems: item.quantity,
        grantTotal: 0,
        createdAtMs: item.orderedAtMs,
        lastOrderedAtMs: item.orderedAtMs,
        items: [item]
      });
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  await page.route('**/api/troy-orders/settle', async (route) => {
    const body = route.request().postDataJSON();
    settleRequests.push(body);
    state.troyPendingCheckouts = state.troyPendingCheckouts.filter((entry) => entry.playFabId !== body.receiverPlayFabId);
    state.troyMembers = state.troyMembers.filter((entry) => entry.playFabId !== body.receiverPlayFabId);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, chipReturnAmount: body.chipReturnAmount })
    });
  });

  await page.goto('/troy-orders.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('h1')).toHaveText('会計レジ');
  await expect(page.locator('[data-customer-chip]')).toHaveCount(2);
  await expect(page.locator('#troyOrdersEmpty')).toContainText('会計中の伝票はありません');

  await page.locator('[data-customer-chip]', { hasText: '海風の船長 / 未入力' }).click();
  await expect(page.locator('#troyOrdersPosMenu')).toBeVisible();
  await expect(page.locator('#troyOrdersPosMenuHeader')).toContainText('会計入力: 海風の船長');

  await page.locator('summary', { hasText: 'アルコール' }).click();
  await page.locator('[data-add-item][data-item-name="ビール（ハートランド）"]').click();

  expect(addItemRequests).toHaveLength(1);
  expect(addItemRequests[0].receiverPlayFabId).toBe('PLAYER1');
  await expect(page.locator('.troy-orders-card')).toHaveCount(1);
  await expect(page.locator('.troy-orders-card')).toContainText('¥600');
  await expect(page.locator('[data-customer-chip]', { hasText: '海風の船長 / ¥600' })).toBeVisible();

  await page.locator('[data-chip-return]').fill('300');
  await page.locator('[data-settle]').click();
  await expect(page.locator('#troyOrdersConfirmModal')).toBeVisible();
  await expect(page.locator('#troyOrdersConfirmItems')).toContainText('チップ返却');
  await expect(page.locator('#troyOrdersConfirmItems')).toContainText('300G');

  await page.locator('#troyOrdersConfirmCheck').check();
  await page.locator('#troyOrdersConfirmSubmit').click();

  expect(settleRequests).toHaveLength(1);
  expect(settleRequests[0].receiverPlayFabId).toBe('PLAYER1');
  expect(settleRequests[0].expectedTotal).toBe(600);
  expect(settleRequests[0].chipReturnAmount).toBe(300);
  await expect(page.locator('#troyOrdersMessage')).toContainText('会計と退店処理を完了しました');
  await expect(page.locator('[data-customer-chip]')).toHaveCount(1);
});
