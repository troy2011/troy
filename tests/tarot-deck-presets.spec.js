const { test, expect } = require('@playwright/test');
const {
  bootstrapMainApp,
  trackPageErrors,
  expectNoPageErrors
} = require('./helpers/main-app-harness');

test('tarot deck presets save and apply a guardian with the minor deck on mobile', async ({ page }) => {
  const errors = trackPageErrors(page);
  const inventory = [
    {
      itemId: 'tarot_major_1',
      name: '魔術師',
      customData: { Category: 'TarotMajor', ArcanaNumber: 1, CardNumber: 1 }
    },
    {
      itemId: 'tarot_major_2',
      name: '女教皇',
      customData: { Category: 'TarotMajor', ArcanaNumber: 2, CardNumber: 2 }
    },
    {
      itemId: 'tarot_minor_wand_1',
      name: 'ワンドA',
      customData: { Category: 'TarotMinor', ArcanaSuit: 'wand', ArcanaRank: '1', CardNumber: '1' }
    },
    {
      itemId: 'tarot_minor_sword_2',
      name: 'ソード2',
      customData: { Category: 'TarotMinor', ArcanaSuit: 'sword', ArcanaRank: '2', CardNumber: '2' }
    }
  ];
  const savedPresets = [
    {
      tarotDeck: ['tarot_minor_wand_1'],
      guardianItemId: 'tarot_major_1'
    },
    null,
    null
  ];
  const saveRequests = [];
  const applyRequests = [];
  let activeDeck = ['tarot_minor_wand_1'];
  let activeGuardian = { itemId: 'tarot_major_1', number: 1, cardLevel: 1 };
  let activePresets = [null, null, null];

  await page.route('**/api/get-inventory', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ inventory, virtualCurrency: { PS: 0 }, contribution: 0 })
    });
  });
  await page.route('**/api/tarot-deck-get', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ok: true,
        tarotDeck: activeDeck,
        guardian: activeGuardian,
        tarotRole: null,
        presets: activePresets
      })
    });
  });
  await page.route('**/api/tarot-deck-preset-save', async (route) => {
    saveRequests.push(route.request().postDataJSON());
    activePresets = savedPresets;
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ok: true,
        slot: 1,
        tarotDeck: ['tarot_minor_wand_1'],
        guardian: { itemId: 'tarot_major_1', number: 1, cardLevel: 1 },
        tarotRole: null,
        presets: savedPresets
      })
    });
  });
  await page.route('**/api/tarot-deck-preset-apply', async (route) => {
    applyRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ok: true,
        slot: 1,
        tarotDeck: ['tarot_minor_wand_1'],
        guardian: { itemId: 'tarot_major_1', number: 1, cardLevel: 1 },
        tarotRole: null,
        presets: savedPresets
      })
    });
  });
  await page.route('**/api/get-equipment', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ equipment: {} }) });
  });
  await page.route('**/api/cards', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ cards: [] }) });
  });
  await page.route('**/api/player-ship/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, ship: { form: 'boat', stage: 1, majorArcanaSlotLimit: 1, majorArcanaItemIds: [] } })
    });
  });
  await page.route('**/api/ship-skill-status', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ success: true, skills: [] }) });
  });

  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    document.getElementById('tabContentInventory').style.display = 'block';
    const module = await import('/js/inventory.js');
    await module.getInventory('PF_PLAYWRIGHT', { force: true });
    module.switchInventoryGroup('Tarot');
  });
  await page.setViewportSize({ width: 390, height: 844 });

  const presets = page.locator('#tarotDeckPresetList .tarot-deck-preset');
  await expect(presets).toHaveCount(3);
  await expect(presets.nth(0)).toContainText('編成1');
  await expect(presets.nth(0).getByRole('button', { name: '保存' })).toBeVisible();
  await presets.nth(0).getByRole('button', { name: '保存' }).click();
  await expect.poll(() => saveRequests.length).toBe(1);
  expect(saveRequests[0]).toMatchObject({ playFabId: 'PF_PLAYWRIGHT', slot: 1 });
  await expect(presets.nth(0)).toContainText('使用中');
  await expect(presets.nth(0).getByRole('button', { name: '上書き' })).toBeVisible();

  activeDeck = ['tarot_minor_sword_2'];
  activeGuardian = { itemId: 'tarot_major_2', number: 2, cardLevel: 1 };
  await page.evaluate(async () => {
    const module = await import('/js/inventory.js');
    await module.getInventory('PF_PLAYWRIGHT', { force: true });
  });
  await presets.nth(0).getByRole('button', { name: '適用' }).click();
  await expect(page.locator('#inventoryActionDialog')).toBeVisible();
  await page.getByRole('button', { name: '適用する' }).click();
  await expect.poll(() => applyRequests.length).toBe(1);
  expect(applyRequests[0]).toMatchObject({ playFabId: 'PF_PLAYWRIGHT', slot: 1 });
  await expect(page.locator('#meleeDeckGrid')).toHaveAttribute('data-deck-count', '1');
  await expect(page.locator('#guardianArcanaGrid .tarot-loadout-card')).toHaveAttribute('aria-label', /魔術師/);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectNoPageErrors(errors);
});
