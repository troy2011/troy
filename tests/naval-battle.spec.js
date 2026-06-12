const { test, expect } = require('@playwright/test');
const { bootstrapMainApp, trackPageErrors, expectNoPageErrors } = require('./helpers/main-app-harness');

test('naval battle UI moves from normal phase to overlap boarding phase', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(() => {
    window.__navalOutcomes = [];
    window.startNavalBattle({
      opponentId: 'PF_NAVAL_TARGET',
      opponentName: 'スクラッチ敵',
      onBoarding: (id) => window.__navalOutcomes.push(['boarding', id]),
      onVictory: () => window.__navalOutcomes.push(['victory']),
      onDefeat: () => window.__navalOutcomes.push(['defeat']),
      onEscape: () => window.__navalOutcomes.push(['escape'])
    });
  });

  const modal = page.locator('#navalBattleModal');
  await expect(modal).toBeVisible();
  await expect(page.locator('#navalTimeline .naval-timeline-axis span')).toHaveText(['0', '1', '2', '3', '4', '5', '6']);
  await expect(page.locator('#navalDistanceLabel')).toHaveText('距離 3');
  await expect(page.locator('#navalCommands .naval-command-btn')).toHaveCount(4);
  await expect(page.locator('[data-naval-command="ram"]')).toBeDisabled();

  await page.locator('[data-naval-command="advance"]').click();
  await expect(page.locator('#navalCommandNote')).toContainText('「前進」実行中');

  await page.evaluate(() => {
    window.__navalBattleDebug.mutate((b) => {
      b.player.command = null;
      b.enemy.command = null;
      b.distance = 1;
      b.player.facing = 'front';
    });
  });
  await expect(page.locator('[data-naval-command="ram"]')).toBeEnabled();

  await page.evaluate(() => {
    window.__navalBattleDebug.mutate((b) => {
      b.distance = 0;
      b.player.facing = 'side';
      b.enemy.facing = 'side';
      b.player.command = null;
      b.enemy.command = null;
    });
  });
  await expect(page.locator('#navalSea')).toHaveClass(/is-overlap/);
  await expect(page.locator('#navalDistanceLabel')).toContainText('重なり状態');
  await expect(page.locator('#navalCommands .naval-command-btn')).toHaveCount(3);
  await expect(page.locator('[data-naval-command="boarding"]')).toBeDisabled();

  await page.evaluate(() => {
    window.__navalBattleDebug.mutate((b) => {
      b.enemy.stun = 5;
      b.enemy.command = null;
    });
  });
  await expect(page.locator('[data-naval-command="boarding"]')).toBeEnabled();
  await page.locator('[data-naval-command="boarding"]').click();
  await expect(modal).toBeHidden();
  expect(await page.evaluate(() => window.__navalOutcomes)).toEqual([['boarding', 'PF_NAVAL_TARGET']]);

  await expectNoPageErrors(errors);
});
