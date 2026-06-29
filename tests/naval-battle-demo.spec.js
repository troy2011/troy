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
  await expect(page.locator('#navalTypePlayer')).toContainText('水上馬車');
  await expect(page.locator('#navalTraitPlayer')).toContainText('馬衝角 常時');
  await expect(page.locator('#navalShipPlayer')).toHaveAttribute('data-ship-key', 'ship_human_merchant');
  await expect(page.locator('#navalShipEnemy')).toHaveAttribute('data-ship-key', 'ship_human_fighter');
  const selectedShipLabels = await page.evaluate(() => ({
    player: document.querySelector('#navalShipPlayer .naval-ship-name')?.textContent?.trim(),
    enemy: document.querySelector('#navalShipEnemy .naval-ship-name')?.textContent?.trim(),
    playerSheet: getComputedStyle(document.querySelector('#navalShipPlayer .naval-ship-sprite')).backgroundImage,
    enemySheet: getComputedStyle(document.querySelector('#navalShipEnemy .naval-ship-sprite')).backgroundImage
  }));
  expect(selectedShipLabels.player).toBeTruthy();
  expect(selectedShipLabels.player).not.toBe('自分の船');
  expect(selectedShipLabels.enemy).toBeTruthy();
  expect(selectedShipLabels.enemy).not.toBe('訓練相手の船');
  expect(selectedShipLabels.playerSheet).toContain('ships_blue.png');
  expect(selectedShipLabels.enemySheet).toContain('ships_blue.png');
  await expect(page.locator('#navalShipPlayerFacing')).toContainText('正面');
});

test('naval battle demo uses the selected ship race-color sprite slot', async ({ page }) => {
  await page.goto('/naval-battle-demo.html', { waitUntil: 'domcontentloaded' });

  const expectedSprites = {
    boat: ['ships.png', '-64px', '-64px', '96px'],
    ship_human_explorer: ['ships_blue.png', '-448px', '-64px', '96px'],
    ship_human_defender: ['ships_blue.png', '-832px', '-64px', '96px'],
    ship_human_fighter: ['ships_blue.png', '-1216px', '-64px', '96px'],
    ship_human_merchant: ['ships_blue.png', '-1600px', '-64px', '96px'],
    ship_elf_explorer: ['ships_green.png', '-448px', '-320px', '68px'],
    ship_elf_defender: ['ships_green.png', '-1216px', '-320px', '68px'],
    ship_elf_fighter: ['ships_green.png', '-832px', '-320px', '68px'],
    ship_elf_merchant: ['ships_green.png', '-1600px', '-320px', '68px'],
    ship_orc_explorer: ['ships_red.png', '-448px', '-576px', '96px'],
    ship_orc_defender: ['ships_red.png', '-832px', '-576px', '96px'],
    ship_orc_fighter: ['ships_red.png', '-1216px', '-576px', '96px'],
    ship_orc_merchant: ['ships_red.png', '-1600px', '-576px', '96px'],
    ship_goblin_explorer: ['ships_yellow.png', '-448px', '-832px', '96px'],
    ship_goblin_defender: ['ships_yellow.png', '-832px', '-832px', '96px'],
    ship_goblin_fighter: ['ships_yellow.png', '-1216px', '-832px', '96px'],
    ship_goblin_merchant: ['ships_yellow.png', '-1600px', '-832px', '96px']
  };

  for (const [shipId, [fileName, x, y, top]] of Object.entries(expectedSprites)) {
    await page.locator('#demoPlayerShip').selectOption(shipId);
    await page.locator('#demoEnemyShip').selectOption('ship_human_defender');
    await page.locator('#demoStart').click();
    await expect(page.locator('#navalBattleModal')).toBeVisible();

    const rendered = await page.evaluate(() => {
      const container = document.querySelector('#navalShipPlayer');
      const sprite = container?.querySelector('.naval-ship-sprite');
      return {
        key: container?.dataset?.shipKey || '',
        image: getComputedStyle(sprite).backgroundImage,
        width: sprite?.style.getPropertyValue('--naval-ship-frame-w') || '',
        sheetWidth: sprite?.style.getPropertyValue('--naval-ship-sheet-w') || '',
        x: sprite?.style.getPropertyValue('--naval-ship-sprite-x') || '',
        y: sprite?.style.getPropertyValue('--naval-ship-sprite-y') || '',
        top: container?.style?.top || ''
      };
    });
    expect(rendered.key).toBe(shipId);
    expect(rendered.image).toContain(fileName);
    expect(rendered.width).toBe('64px');
    expect(rendered.sheetWidth).toBe('2048px');
    expect(rendered.x).toBe(x);
    expect(rendered.y).toBe(y);
    expect(rendered.top).toBe(top);

    await page.locator('[data-naval-close]').click();
    await expect(page.locator('#navalBattleModal')).not.toBeVisible();
  }
});

test('naval battle demo shows the base command matchup matrix', async ({ page }) => {
  await page.goto('/naval-battle-demo.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#demoMatrixTitle')).toHaveText('コマンド相性');
  await expect(page.locator('#demoMatrixNote')).toContainText('基本ルールのみ');
  await expect(page.locator('#demoMatrixNote')).toContainText('連続操舵不可');
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
  await expect(frontFront.locator('[data-player-command="starboardRudder"][data-enemy-command="bowCannon"]')).toContainText('自船操舵不可');

  const sideSide = page.locator('[data-command-matrix-state="side_side"]');
  await expect(sideSide.locator('[data-player-command="broadside"][data-enemy-command="blankShot"]')).toHaveAttribute('data-outcome', 'win');
  await expect(sideSide.locator('[data-player-command="blankShot"][data-enemy-command="portRudder"]')).toHaveAttribute('data-outcome', 'draw');
  await expect(sideSide.locator('[data-player-command="portRudder"][data-enemy-command="broadside"]')).toHaveAttribute('data-outcome', 'loss');
  await expect(sideSide.locator('[data-player-command="portRudder"][data-enemy-command="broadside"]')).toContainText('自船操舵不可');
});

test('naval battle demo exposes arcana replacement state and repair command', async ({ page }) => {
  await page.goto('/naval-battle-demo.html', { waitUntil: 'domcontentloaded' });

  await page.locator('#demoArcanaPreset').selectOption('attack');
  await page.locator('#demoStart').click();

  await expect(page.locator('#navalBattleModal')).toBeVisible();
  await expect(page.locator('[data-naval-command="assault"]')).toContainText('戦車の制圧突撃');
  await expect(page.locator('[data-naval-command="bowCannon"]')).toContainText('皇帝の盾砲');
  await expect(page.locator('#navalStatePlayer')).toContainText('士気0');
  await expect(page.locator('#navalStatePlayer')).toContainText('船員HP100%');

  await page.evaluate(() => {
    window.__navalBattleDebug.mutate((b) => {
      b.player.equipmentDamage = { mast: { turns: 2 }, rudder: { turns: 2 } };
      b.player.statuses = { fire: { turns: 2 } };
    });
  });

  await expect(page.locator('#navalStatePlayer')).toContainText('炎上2');
  await expect(page.locator('#navalStatePlayer')).toContainText('マスト損傷2');
  await expect(page.locator('#navalStatePlayer')).toContainText('舵輪損傷2');
  await expect(page.locator('[data-naval-command="repair"]')).toBeEnabled();
});

test('naval battle demo shows short previews, latest summary, and arcana card cue on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/naval-battle-demo.html', { waitUntil: 'domcontentloaded' });

  await page.locator('#demoArcanaPreset').selectOption('attack');
  await page.locator('#demoStart').click();

  await expect(page.locator('#navalBattleModal')).toBeVisible();
  await expect(page.locator('#navalCommands .naval-command-preview')).toHaveCount(3);
  await expect(page.locator('[data-naval-command="assault"] .naval-command-preview')).toContainText('命中した敵に浸水');
  await expect(page.locator('[data-naval-command="starboardRudder"] .naval-command-preview')).toContainText('砲撃を避ける');
  await expect(page.locator('#navalTurnSummary')).toContainText('コマンドを選ぶ');

  const state = await page.evaluate(() => {
    window.__navalBattleDebug.mutate((b) => {
      b.options.disableAi = true;
      b.options.evasionRolls = [1, 1];
      b.evasionRollIndex = 0;
      b.enemy.pendingCommandId = null;
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });

  await expect(page.locator('#navalTurnSummary')).toContainText('命中');
  const chipTexts = await page.evaluate(() => Array.from(document.querySelectorAll('#navalEffectLayer [data-result-chip]')).map((el) => el.textContent.trim()));
  expect(chipTexts.some((text) => text.startsWith('命中'))).toBe(true);
  await expect(page.locator('#navalEffectLayer [data-arcana-card].is-player')).toContainText(state.lastArcanaActivation.body);
  const cardBackground = await page.evaluate(() => (
    getComputedStyle(document.querySelector('#navalEffectLayer [data-arcana-card].is-player .naval-arcana-card-sprite')).backgroundImage
  ));
  expect(cardBackground).toContain('tarot.png');

  const layout = await page.evaluate(() => {
    const sea = document.getElementById('navalSea').getBoundingClientRect();
    const card = document.querySelector('#navalEffectLayer [data-arcana-card].is-player').getBoundingClientRect();
    const commands = document.getElementById('navalCommands').getBoundingClientRect();
    return {
      cardInsideSea: card.top >= sea.top && card.bottom <= sea.bottom && card.left >= sea.left && card.right <= sea.right,
      cardAboveCommands: card.bottom < commands.top
    };
  });
  expect(layout.cardInsideSea).toBe(true);
  expect(layout.cardAboveCommands).toBe(true);
});
