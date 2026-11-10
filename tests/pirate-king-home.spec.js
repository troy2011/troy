const { test, expect } = require('@playwright/test');
const { bootstrapMainApp, trackPageErrors, expectNoPageErrors } = require('./helpers/main-app-harness');

// A player at the 海賊王 rank gets a gold home backdrop with no rank badge, and the first time the server
// grants and equips 覇王の兜 the player is told and the head slot shows it.
const CROWN = { itemId: 'metal_black_10', name: '覇王の兜', count: 1, customData: { Category: 'Armor', Defense: 60, sprite_path: './Sprites/wardrobe/metal/metal_black.png', sprite_index: 9 } };
const OLD_HAT = { itemId: 'hat_black_07', name: '海賊のぼうし', count: 1, customData: { Category: 'Armor', Defense: 2, sprite_path: './Sprites/wardrobe/cloth/hat_black.png', sprite_index: 6 } };

async function openHome(page, { level, crownReward = false, width = 390 }) {
  let equipped = OLD_HAT.itemId;
  await page.setViewportSize({ width, height: 844 });
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('**/api/get-stats', (route) => {
    if (crownReward) equipped = CROWN.itemId;
    return route.fulfill({ json: {
      stats: { Level: level, HP: 300, MaxHP: 300, ちから: 40, みのまもり: 40, すばやさ: 40, かしこさ: 40, たいりょく: 40 },
      crewRankInfo: null, isKing: false, nation: 'neutral',
      ...(crownReward ? { pirateKingCrownReward: { itemId: CROWN.itemId, itemName: CROWN.name, amount: 1, equippedSlot: 'Armor' } } : {})
    } });
  });
  await page.route('**/api/get-inventory', (route) => route.fulfill({ json: {
    inventory: crownReward ? [OLD_HAT, CROWN] : [OLD_HAT], virtualCurrency: { PS: 100 }, contribution: 0 } }));
  await page.route('**/api/get-equipment', (route) => route.fulfill({ json: { equipment: { Armor: equipped } } }));
  await bootstrapMainApp(page);
  await expect(page.locator('#globalLevel')).toHaveText(String(level), { timeout: 15000 });
}

for (const width of [320, 390, 430]) {
  test(`a 海賊王 sees no rank badge and the full name at ${width}px`, async ({ page }) => {
    const errors = trackPageErrors(page);
    await openHome(page, { level: 55, width });

    await expect(page.locator('#appWrapper')).toHaveClass(/is-pirate-king/);
    await expect(page.locator('#globalRankBadge')).toBeHidden();
    const name = page.locator('#globalPlayerName');
    await expect(name).toHaveText('Playwright Tester');
    // At 320px the header row itself is too narrow for a 17-character name, badge or not.
    if (width >= 390) {
      expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/pirate-king-home-${width}.png`, fullPage: true });
    await expectNoPageErrors(errors);
  });
}

test('below Lv51 the home header stays as it was', async ({ page }) => {
  await openHome(page, { level: 50 });
  await expect(page.locator('#globalRankBadge')).toHaveText('提督');
  await expect(page.locator('#globalRankBadge')).toBeVisible();
  await expect(page.locator('#appWrapper')).not.toHaveClass(/is-pirate-king/);
  await page.screenshot({ path: 'test-results/pirate-king-home-before.png', fullPage: true });
});

test('the first 海賊王 visit announces the helmet and shows it equipped', async ({ page }) => {
  const errors = trackPageErrors(page);
  await openHome(page, { level: 51, crownReward: true });

  await expect(page.locator('body')).toContainText('海賊王の証「覇王の兜」を手に入れ、装備した！');
  await page.screenshot({ path: 'test-results/pirate-king-crown-message.png' });
  await page.evaluate(() => window.showTab('inventory'));
  await expect(page.locator('#equippedArmor')).toContainText('覇王の兜');
  await page.screenshot({ path: 'test-results/pirate-king-crown-equipped.png' });
  await expectNoPageErrors(errors);
});
