const { test, expect } = require('@playwright/test');
const {
  bootstrapMainApp,
  trackPageErrors,
  expectNoPageErrors
} = require('./helpers/main-app-harness');

test('opening a returned exploration chest reveals its item and marks the inventory entry as NEW', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await bootstrapMainApp(page, { fixedHour: 18 });

  await page.route('**/api/get-inventory', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        inventory: [{
          itemId: 'mist_blade',
          name: '霧切りの刃',
          count: 2,
          customData: {
            Category: 'Weapon',
            sprite_path: './Sprites/weapons/melee weapons/sword.png',
            sprite_index: '2',
            sprite_w: '32',
            sprite_h: '32',
            Atk: '8'
          }
        }],
        virtualCurrency: { PS: 1200 },
        contribution: 0,
        contributionProgress: { level: 1, expInto: 0, expNeeded: 1500, rank: 0 },
        isKing: false
      })
    });
  });
  await page.route('**/api/exploration/claim', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ship: { shipId: 'ship-test', shipName: 'テスト船', form: 'fighter', stage: 1 },
        active: null,
        reports: [],
        report: {
          stageNo: 1,
          stageRank: 1,
          destinationId: 'tarot_stage_1',
          destinationName: '珊瑚の浅瀬',
          imagePath: './assets/tarot-kingdom/battlefields/coral-island-v1.webp',
          bossResult: 'victory',
          monsterId: 'ismartal-vol2-monster-02',
          monsterName: 'パピル',
          monsterIsBoss: false,
          rewardCount: 1,
          rewardItems: [{
            itemId: 'mist_blade',
            displayName: '霧切りの刃',
            rarity: 'rare',
            quantity: 2,
            spritePath: './Sprites/weapons/melee weapons/sword.png',
            spriteIndex: 2,
            spriteWidth: 32,
            spriteHeight: 32
          }]
        },
        progress: { highestUnlockedStage: 1 }
      })
    });
  });

  await page.evaluate(async () => {
    const ship = await import('/js/ship.js?v=20260823-exploration-loot-reveal-v1');
    await ship.claimOnlineExplorationReward('PF_PLAYWRIGHT', 'PF_PLAYWRIGHT', {
      mode: 'online',
      status: 'completed',
      outcome: 'victory',
      explorationId: 'exploration-loot-reveal-test',
      destinationName: '珊瑚の浅瀬'
    });
  });

  const result = page.locator('.exploration-result-overlay');
  await expect(result).toHaveClass(/is-awaiting-open/);
  await result.locator('[data-exploration-result-open]').click();
  await expect(result).toHaveClass(/is-opened/);
  const lootIcon = result.locator('.exploration-result-loot-icon');
  await expect(lootIcon).not.toHaveClass(/is-fallback/);
  await expect.poll(() => lootIcon.evaluate((element) => getComputedStyle(element).backgroundImage)).not.toBe('none');
  await expect(result.locator('.exploration-result-loot-card')).toHaveCSS('animation-name', 'explorationResultLootPop');
  await expect(result.locator('[data-exploration-result-prompt-title]')).toHaveText('霧切りの刃 ×2を手に入れた！');
  await page.waitForTimeout(700);
  const rewardLayout = await result.evaluate((overlay) => {
    const dialog = overlay.querySelector('.exploration-result-dialog').getBoundingClientRect();
    const showcase = overlay.querySelector('.exploration-result-showcase').getBoundingClientRect();
    const loot = overlay.querySelector('.exploration-result-loot-icon-frame').getBoundingClientRect();
    const prompt = overlay.querySelector('.exploration-result-prompt').getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      dialog: { left: dialog.left, right: dialog.right },
      showcase: { left: showcase.left, right: showcase.right, top: showcase.top, bottom: showcase.bottom },
      loot: { left: loot.left, right: loot.right, top: loot.top, bottom: loot.bottom },
      promptTop: prompt.top
    };
  });
  expect(rewardLayout.dialog.left).toBeGreaterThanOrEqual(-1);
  expect(rewardLayout.dialog.right).toBeLessThanOrEqual(rewardLayout.viewportWidth + 1);
  expect(rewardLayout.loot.left).toBeGreaterThanOrEqual(rewardLayout.showcase.left - 1);
  expect(rewardLayout.loot.right).toBeLessThanOrEqual(rewardLayout.showcase.right + 1);
  expect(rewardLayout.loot.top).toBeGreaterThanOrEqual(rewardLayout.showcase.top - 1);
  expect(rewardLayout.loot.bottom).toBeLessThanOrEqual(rewardLayout.promptTop + 8);

  await result.locator('[data-exploration-result-close]').click();
  await page.locator('#navInventory').click();
  await expect(page.locator('#tabContentInventory')).toBeVisible();
  await page.evaluate(async () => {
    const inventory = await import('inventory');
    await inventory.getInventory('PF_PLAYWRIGHT', { force: true });
    inventory.switchInventoryTab('Weapon');
  });
  const rewardItem = page.locator('#inventoryGrid .inventory-item-cell[title="霧切りの刃"]');
  await expect(rewardItem).toHaveClass(/is-new/);
  expect(await rewardItem.evaluate((element) => element.innerHTML)).toContain('inventory-item-badge is-new');
  await expect(rewardItem.locator('.inventory-item-badge.is-new')).toHaveText('NEW');
  await rewardItem.click();
  await expect(page.locator('#itemDetailModal')).toBeVisible();
  await expect(rewardItem).not.toHaveClass(/is-new/);
  await expectNoPageErrors(errors);
});
