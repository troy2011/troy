const { test, expect } = require('@playwright/test');

test('naval battle demo page launches the plunder battle only', async ({ page }) => {
  await page.goto('/naval-battle-demo.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('.demo-title')).toHaveText('略奪戦デモ');
  await expect(page.locator('#navalBattleModal')).not.toBeVisible();
  await expect(page.locator('#demoLog')).toContainText('自船と敵船を選んで');
  await expect(page.locator('#demoPlayerShip option')).toHaveCount(17);

  await page.locator('#demoPlayerShip').selectOption('ship_human_merchant');
  await page.locator('#demoEnemyShip').selectOption('ship_human_fighter');
  await page.locator('#demoStart').click();

  await expect(page.locator('#navalBattleModal')).toBeVisible();
  await expect(page.locator('#navalBattleTitle')).toHaveText('略奪海戦');
  await expect(page.locator('#navalCommands [data-naval-command]')).toHaveText([
    /突撃/,
    /船首砲/,
    /面舵/
  ]);
  await expect(page.locator('#navalCommands .naval-command-icon img')).toHaveCount(3);
  await expect(page.locator('#navalBattleLog')).toContainText('同時入力の海戦開始');
  await expect(page.locator('.naval-status-card h4')).toHaveText([
    '訓練相手の船',
    '自分の船'
  ]);
  await expect(page.locator('#navalTypePlayer')).toContainText('人間 商船');
  await expect(page.locator('#navalTraitPlayer')).toContainText('水上滑走 未使用');
  await expect(page.locator('#navalShipPlayerFacing')).toContainText('正面');
});

test('naval battle demo shows the base command matchup matrix', async ({ page }) => {
  await page.goto('/naval-battle-demo.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#demoMatrixTitle')).toHaveText('コマンド相性');
  await expect(page.locator('#demoMatrixNote')).toContainText('基本ルールのみ');
  await expect(page.locator('[data-command-matrix-state]')).toHaveCount(4);
  await expect(page.locator('[data-command-matrix-state="front_front"] [data-matrix-cell]')).toHaveCount(9);
  await expect(page.locator('[data-command-matrix-state="front_side"] [data-matrix-cell]')).toHaveCount(9);
  await expect(page.locator('[data-command-matrix-state="side_front"] [data-matrix-cell]')).toHaveCount(9);
  await expect(page.locator('[data-command-matrix-state="side_side"] [data-matrix-cell]')).toHaveCount(9);
  await expect(page.locator('[data-row-summary]')).toHaveCount(12);

  const frontFront = page.locator('[data-command-matrix-state="front_front"]');
  await expect(frontFront.locator('[data-player-command="assault"][data-enemy-command="starboardRudder"]')).toHaveAttribute('data-outcome', 'win');
  await expect(frontFront.locator('[data-player-command="bowCannon"][data-enemy-command="assault"]')).toHaveAttribute('data-outcome', 'win');
  await expect(frontFront.locator('[data-player-command="starboardRudder"][data-enemy-command="bowCannon"]')).toHaveAttribute('data-outcome', 'win');

  const sideSide = page.locator('[data-command-matrix-state="side_side"]');
  await expect(sideSide.locator('[data-player-command="broadside"][data-enemy-command="blankShot"]')).toHaveAttribute('data-outcome', 'win');
  await expect(sideSide.locator('[data-player-command="blankShot"][data-enemy-command="portRudder"]')).toHaveAttribute('data-outcome', 'draw');
  await expect(sideSide.locator('[data-player-command="portRudder"][data-enemy-command="broadside"]')).toHaveAttribute('data-outcome', 'win');
});
