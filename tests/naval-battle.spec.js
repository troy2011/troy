const { test, expect } = require('@playwright/test');
const { bootstrapMainApp, trackPageErrors, expectNoPageErrors } = require('./helpers/main-app-harness');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.99;
  });
});

test('naval battle uses simultaneous input instead of timeline lag', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_NAVAL_TARGET',
      opponentName: 'スクラッチ敵',
      disableAi: true
    });
  });

  const modal = page.locator('#navalBattleModal');
  await expect(modal).toBeVisible();
  await expect(page.locator('#navalTimeline')).toHaveCount(0);
  await expect(page.locator('#navalRoundStatus')).toContainText('第1合');
  await expect(page.locator('#navalHpPlayerText')).toHaveText('1 / 1');
  await expect(page.locator('#navalCommands [data-naval-command]')).toHaveText([
    /突撃/,
    /前方銃撃/,
    /面舵/
  ]);
  await expect(page.locator('#navalCommands .naval-command-icon img')).toHaveCount(3);
  await expect(page.locator('.naval-status-card h4')).toHaveText([
    'スクラッチ敵の船',
    '自分の船'
  ]);

  await page.locator('[data-naval-command="assault"]').click();
  await expect(page.locator('#navalCommandNote')).toContainText('入力済み');

  const state = await page.evaluate(() => {
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.hp).toBe(0.5);
  expect(state.enemy.hp).toBe(1);
  expect(state.player.pendingCommandId).toBe(null);
  expect(state.enemy.reload).toBe(1);
  expect(state.logs.join('\n')).toContain('操舵ゲージ -0.5');
  const callouts = await page.evaluate(() => Array.from(document.querySelectorAll('#navalEffectLayer .naval-command-callout')).map((el) => el.textContent.trim()));
  expect(callouts).toEqual(expect.arrayContaining([
    '突撃だああ！！',
    '前方銃撃、撃てえ！！'
  ]));
  await expect(page.locator('#navalSea')).toHaveClass(/is-impact-shake/);
  await expect(page.locator('#navalShipPlayer')).toHaveClass(/is-assault-failed/);
  await expect(page.locator('#navalEffectLayer .naval-assault-fail.is-player')).toHaveText('突撃失敗');
  const impactAnimation = await page.evaluate(() => {
    const sea = document.getElementById('navalSea');
    return window.getComputedStyle(sea).animationName;
  });
  expect(impactAnimation).toContain('navalImpactShake');
  await expect(page.locator('#navalShipPlayer')).toHaveClass(/is-surging/);
  const assaultSurge = await page.locator('#navalShipPlayer').getAttribute('style');
  expect(assaultSurge).toContain('--naval-surge-x: -156px');
  expect(assaultSurge).toContain('--naval-surge-recoil-x: 41px');
  const assaultAnimation = await page.evaluate(() => {
    const wrap = document.querySelector('#navalShipPlayer .naval-ship-sprite-wrap');
    const style = window.getComputedStyle(wrap);
    return {
      name: style.animationName,
      duration: style.animationDuration
    };
  });
  expect(assaultAnimation.name).toContain('navalSurgeFailed');
  expect(Number.parseFloat(assaultAnimation.duration)).toBeGreaterThanOrEqual(1.1);
  const navalCss = await page.evaluate(() => document.getElementById('navalBattleStyle')?.textContent || '');
  expect(navalCss).toContain('@keyframes navalShotPlayerMissUp');
  expect(navalCss).toContain('left: -8%; top: calc(var(--naval-shot-track-top');
  expect(navalCss).toContain('left: 108%; top: calc(var(--naval-shot-track-top');
  expect(navalCss).not.toContain('top: 36%');
  expect(navalCss).not.toContain('top: 78%');

  await expectNoPageErrors(errors);
});

test('naval battle explains commands and latest results with short visual text', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(() => {
    const profile = { nation: 'none' };
    const ship = { form: 'merchant', shipClass: 'merchant', itemId: 'ship_human_merchant', name: '説明用船' };
    window.startNavalBattle({
      opponentId: 'PF_NAVAL_SHORT_TEXT',
      opponentName: '説明用敵',
      disableAi: true,
      playerProfile: profile,
      opponentProfile: profile,
      playerShipProfile: ship,
      opponentShipProfile: ship
    });
  });

  await expect(page.locator('#navalCommands .naval-command-preview')).toHaveCount(3);
  await expect(page.locator('[data-naval-command="assault"] .naval-command-preview')).toContainText('回頭を止める');
  await expect(page.locator('[data-naval-command="bowCannon"] .naval-command-preview')).toContainText('突撃を止める');
  await expect(page.locator('[data-naval-command="starboardRudder"] .naval-command-preview')).toContainText('砲撃を避ける');
  await expect(page.locator('#navalTurnSummary')).toContainText('コマンドを選ぶ');

  let state = await page.evaluate(() => {
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.lastTurnSummary).toContain('命中');
  await expect(page.locator('#navalTurnSummary')).toContainText('命中');
  let chipTexts = await page.evaluate(() => Array.from(document.querySelectorAll('#navalEffectLayer [data-result-chip]')).map((el) => el.textContent.trim()));
  expect(chipTexts).toEqual(expect.arrayContaining(['命中 -1']));

  state = await page.evaluate(() => {
    const profile = { nation: 'none' };
    const ship = { form: 'merchant', shipClass: 'merchant', itemId: 'ship_human_merchant', name: '回避用船' };
    window.startNavalBattle({
      opponentId: 'PF_NAVAL_SHORT_EVADE',
      opponentName: '回避用敵',
      disableAi: true,
      evasionRolls: [0],
      playerProfile: profile,
      opponentProfile: profile,
      playerShipProfile: ship,
      opponentShipProfile: ship
    });
    window.__navalBattleDebug.applyCommand('starboardRudder', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.lastTurnSummary).toContain('回避');
  chipTexts = await page.evaluate(() => Array.from(document.querySelectorAll('#navalEffectLayer [data-result-chip]')).map((el) => el.textContent.trim()));
  expect(chipTexts).toEqual(expect.arrayContaining(['回避']));
  await expect(page.locator('#navalTurnSummary')).toContainText('回避');

  await expectNoPageErrors(errors);
});

test('major arcana command shows a tarot card cue near the acting side', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  let state = await page.evaluate(() => {
    const profile = { nation: 'none' };
    window.startNavalBattle({
      opponentId: 'PF_NAVAL_ARCANA_CARD',
      opponentName: 'カード演出敵',
      disableAi: true,
      playerProfile: profile,
      opponentProfile: profile,
      playerShipProfile: {
        form: 'merchant',
        shipClass: 'merchant',
        itemId: 'ship_human_merchant',
        name: 'カード演出船',
        majorArcanaGear: [{ itemId: 'arcana-4', spriteIndex: 14 }]
      },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', itemId: 'ship_human_merchant', name: '敵船' }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });

  expect(state.player.arcanaGears[0].spriteIndex).toBe(14);
  expect(state.lastArcanaActivation.spriteIndex).toBe(14);
  await expect(page.locator('#navalEffectLayer [data-arcana-card].is-player')).toContainText(state.lastArcanaActivation.body);
  const playerCardPosition = await page.evaluate(() => {
    const sea = document.getElementById('navalSea').getBoundingClientRect();
    const card = document.querySelector('#navalEffectLayer [data-arcana-card].is-player').getBoundingClientRect();
    return { seaCenter: sea.left + sea.width / 2, cardCenter: card.left + card.width / 2 };
  });
  expect(playerCardPosition.cardCenter).toBeGreaterThan(playerCardPosition.seaCenter);

  state = await page.evaluate((snapshot) => {
    window.__navalBattleDebug.applySnapshot(snapshot, 'player');
    return window.__navalBattleDebug.serialize();
  }, state);
  expect(state.player.arcanaGears[0].spriteIndex).toBe(14);

  state = await page.evaluate(() => {
    const profile = { nation: 'none' };
    window.startNavalBattle({
      opponentId: 'PF_NAVAL_ARCANA_CARD_ENEMY',
      opponentName: '敵カード演出',
      disableAi: true,
      playerProfile: profile,
      opponentProfile: profile,
      playerShipProfile: { form: 'merchant', shipClass: 'merchant', itemId: 'ship_human_merchant', name: '自船' },
      opponentShipProfile: {
        form: 'merchant',
        shipClass: 'merchant',
        itemId: 'ship_human_merchant',
        name: '敵船',
        majorArcanaGear: [{ itemId: 'arcana-4', spriteIndex: 4 }]
      }
    });
    window.__navalBattleDebug.applyCommand('assault', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });

  await expect(page.locator('#navalEffectLayer [data-arcana-card].is-enemy')).toContainText(state.lastArcanaActivation.body);
  const enemyCardPosition = await page.evaluate(() => {
    const sea = document.getElementById('navalSea').getBoundingClientRect();
    const card = document.querySelector('#navalEffectLayer [data-arcana-card].is-enemy').getBoundingClientRect();
    return { seaCenter: sea.left + sea.width / 2, cardCenter: card.left + card.width / 2 };
  });
  expect(enemyCardPosition.cardCenter).toBeLessThan(enemyCardPosition.seaCenter);

  await expectNoPageErrors(errors);
});

test('naval battle applies posture evasion rates to cannon hits', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  let state = await page.evaluate(() => {
    const profile = { nation: 'none' };
    const ship = { form: 'merchant', shipClass: 'merchant', name: '商船' };
    window.startNavalBattle({
      opponentId: 'PF_EVASION_FRONT_SUCCESS',
      opponentName: '正面回避敵',
      disableAi: true,
      evasionRolls: [0.49, 1],
      playerProfile: profile,
      opponentProfile: profile,
      playerShipProfile: ship,
      opponentShipProfile: ship
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.hp).toBe(3);
  expect(state.enemy.hp).toBe(2);
  expect(state.logs.join('\n')).toContain('回避率50%');

  state = await page.evaluate(() => {
    const profile = { nation: 'none' };
    const ship = { form: 'merchant', shipClass: 'merchant', name: '商船' };
    window.startNavalBattle({
      opponentId: 'PF_EVASION_FRONT_FAIL',
      opponentName: '正面被弾敵',
      disableAi: true,
      evasionRolls: [0.5, 1],
      playerProfile: profile,
      opponentProfile: profile,
      playerShipProfile: ship,
      opponentShipProfile: ship
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.hp).toBe(2);
  expect(state.enemy.hp).toBe(2);

  state = await page.evaluate(() => {
    const profile = { nation: 'none' };
    const ship = { form: 'merchant', shipClass: 'merchant', name: '商船' };
    window.startNavalBattle({
      opponentId: 'PF_EVASION_SIDE_SUCCESS',
      opponentName: '横被弾敵',
      disableAi: true,
      evasionRolls: [0],
      playerProfile: profile,
      opponentProfile: profile,
      playerShipProfile: ship,
      opponentShipProfile: ship
    });
    window.__navalBattleDebug.mutate((b) => {
      b.player.facing = 'starboard';
      b.player.hp = 3;
      b.enemy.hp = 3;
    });
    window.__navalBattleDebug.applyCommand('blankShot', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.hp).toBe(2);
  expect(state.logs.join('\n')).not.toContain('回避率');
  await expect(page.locator('#navalEffectLayer .naval-cannon-shot')).not.toHaveClass(/is-miss/);
  await expect(page.locator('#navalSea')).toHaveClass(/is-impact-shake/);

  state = await page.evaluate(() => {
    const profile = { nation: 'none' };
    const ship = { form: 'merchant', shipClass: 'merchant', name: '商船' };
    window.startNavalBattle({
      opponentId: 'PF_EVASION_SIDE_TURN_SUCCESS',
      opponentName: '横回頭回避敵',
      disableAi: true,
      evasionRolls: [0.49],
      playerProfile: profile,
      opponentProfile: profile,
      playerShipProfile: ship,
      opponentShipProfile: ship
    });
    window.__navalBattleDebug.mutate((b) => {
      b.player.facing = 'starboard';
      b.player.hp = 3;
      b.enemy.hp = 3;
    });
    window.__navalBattleDebug.applyCommand('portRudder', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.hp).toBe(3);
  expect(state.player.facing).toBe('front');
  expect(state.logs.join('\n')).toContain('回避率50%');
  await expect(page.locator('#navalEffectLayer .naval-cannon-shot')).toHaveClass(/is-miss/);
  await expect(page.locator('#navalEffectLayer .naval-dodge-label.is-player')).toHaveText('回避');
  await expect(page.locator('#navalSea')).not.toHaveClass(/is-impact-shake/);

  state = await page.evaluate(() => {
    const profile = { nation: 'none' };
    const ship = { form: 'merchant', shipClass: 'merchant', name: '商船' };
    window.startNavalBattle({
      opponentId: 'PF_EVASION_ASSAULT',
      opponentName: '突撃被弾敵',
      disableAi: true,
      evasionRolls: [0],
      playerProfile: profile,
      opponentProfile: profile,
      playerShipProfile: ship,
      opponentShipProfile: ship
    });
    window.__navalBattleDebug.applyCommand('assault', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.hp).toBe(2);
  expect(state.logs.join('\n')).not.toContain('回避率');

  const rates = await page.evaluate(() => ({
    front: window.__navalBattleDebug.resolveEvasionRate({
      defenderFacing: 'front',
      defenderCommandId: 'blankShot',
      attackerCommandId: 'bowCannon'
    }),
    side: window.__navalBattleDebug.resolveEvasionRate({
      defenderFacing: 'starboard',
      defenderCommandId: 'blankShot',
      attackerCommandId: 'bowCannon'
    }),
    assault: window.__navalBattleDebug.resolveEvasionRate({
      defenderFacing: 'front',
      defenderCommandId: 'assault',
      attackerCommandId: 'bowCannon'
    }),
    turning: window.__navalBattleDebug.resolveEvasionRate({
      defenderFacing: 'front',
      defenderCommandId: 'starboardRudder',
      attackerCommandId: 'bowCannon'
    }),
    sideTurning: window.__navalBattleDebug.resolveEvasionRate({
      defenderFacing: 'starboard',
      defenderCommandId: 'portRudder',
      attackerCommandId: 'bowCannon'
    })
  }));
  expect(rates).toEqual({
    front: 0.5,
    side: 0,
    assault: 0,
    turning: 1,
    sideTurning: 0.5
  });

  await expectNoPageErrors(errors);
});

test('naval battle renders sprite ships and diagonal dodge for rudder evasions', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_NAVAL_VISUAL_TARGET',
      opponentName: '斜め回避敵',
      disableAi: true,
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', name: '自船ファイター', level: 3 },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', name: '敵ファイター', level: 3 }
    });
  });

  const initial = await page.evaluate(() => {
    const playerSprite = document.querySelector('#navalShipPlayer .naval-ship-sprite');
    const enemySprite = document.querySelector('#navalShipEnemy .naval-ship-sprite');
    return {
      playerX: playerSprite?.style.getPropertyValue('--naval-ship-sprite-x') || '',
      playerY: playerSprite?.style.getPropertyValue('--naval-ship-sprite-y') || '',
      enemyX: enemySprite?.style.getPropertyValue('--naval-ship-sprite-x') || '',
      enemyY: enemySprite?.style.getPropertyValue('--naval-ship-sprite-y') || ''
    };
  });
  expect(initial).toEqual({
    playerX: '-1216px',
    playerY: '-64px',
    enemyX: '-1216px',
    enemyY: '-128px'
  });
  const idleAnimation = await page.evaluate(() => {
    const playerSprite = document.querySelector('#navalShipPlayer .naval-ship-sprite');
    const enemySprite = document.querySelector('#navalShipEnemy .naval-ship-sprite');
    return {
      player: window.getComputedStyle(playerSprite).animationName,
      enemy: window.getComputedStyle(enemySprite).animationName
    };
  });
  expect(idleAnimation.player).toContain('navalShipFrameStep');
  expect(idleAnimation.enemy).toContain('navalShipFrameStep');

  await page.evaluate(() => {
    window.__navalBattleDebug.applyCommand('starboardRudder', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
  });

  await expect(page.locator('#navalShipPlayer')).toHaveClass(/is-turning-up/);
  await expect(page.locator('#navalEffectLayer .naval-cannon-shot')).toHaveClass(/is-miss/);
  await expect(page.locator('#navalEffectLayer .naval-cannon-shot')).toHaveClass(/miss-up/);
  await expect(page.locator('#navalEffectLayer .naval-dodge-label.is-player')).toHaveText('回避');
  await expect(page.locator('#navalSea')).not.toHaveClass(/is-impact-shake/);

  const during = await page.evaluate(() => {
    const sprite = document.querySelector('#navalShipPlayer .naval-ship-sprite');
    const wrap = document.querySelector('#navalShipPlayer .naval-ship-sprite-wrap');
    return {
      x: sprite?.style.getPropertyValue('--naval-ship-sprite-x') || '',
      y: sprite?.style.getPropertyValue('--naval-ship-sprite-y') || '',
      wrapAnimation: window.getComputedStyle(wrap).animationName,
      wrapTransform: window.getComputedStyle(wrap).transform
    };
  });
  expect(during).toEqual({
    x: '-1408px',
    y: '-128px',
    wrapAnimation: 'none',
    wrapTransform: 'none'
  });

  await page.waitForTimeout(1450);
  await expect(page.locator('#navalShipPlayer')).not.toHaveClass(/is-turning/);
  const after = await page.evaluate(() => {
    const sprite = document.querySelector('#navalShipPlayer .naval-ship-sprite');
    return {
      x: sprite?.style.getPropertyValue('--naval-ship-sprite-x') || '',
      y: sprite?.style.getPropertyValue('--naval-ship-sprite-y') || ''
    };
  });
  expect(after).toEqual({ x: '-1216px', y: '-192px' });

  await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_NAVAL_VISUAL_TARGET',
      opponentName: '斜め回避敵',
      disableAi: true,
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', name: '自船ファイター', level: 3 },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', name: '敵ファイター', level: 3 }
    });
    window.__navalBattleDebug.applyCommand('starboardRudder', 'player');
    window.__navalBattleDebug.applyCommand('starboardRudder', 'enemy');
  });
  await expect(page.locator('#navalShipPlayer')).toHaveClass(/is-turning-up/);
  await expect(page.locator('#navalShipEnemy')).toHaveClass(/is-turning-down/);
  const bothDuring = await page.evaluate(() => {
    const playerSprite = document.querySelector('#navalShipPlayer .naval-ship-sprite');
    const enemySprite = document.querySelector('#navalShipEnemy .naval-ship-sprite');
    return {
      playerX: playerSprite?.style.getPropertyValue('--naval-ship-sprite-x') || '',
      playerY: playerSprite?.style.getPropertyValue('--naval-ship-sprite-y') || '',
      enemyX: enemySprite?.style.getPropertyValue('--naval-ship-sprite-x') || '',
      enemyY: enemySprite?.style.getPropertyValue('--naval-ship-sprite-y') || ''
    };
  });
  expect(bothDuring).toEqual({
    playerX: '-1408px',
    playerY: '-128px',
    enemyX: '-1408px',
    enemyY: '-64px'
  });

  await page.waitForTimeout(1450);
  const bothAfter = await page.evaluate(() => {
    const playerSprite = document.querySelector('#navalShipPlayer .naval-ship-sprite');
    const enemySprite = document.querySelector('#navalShipEnemy .naval-ship-sprite');
    return {
      playerX: playerSprite?.style.getPropertyValue('--naval-ship-sprite-x') || '',
      playerY: playerSprite?.style.getPropertyValue('--naval-ship-sprite-y') || '',
      enemyX: enemySprite?.style.getPropertyValue('--naval-ship-sprite-x') || '',
      enemyY: enemySprite?.style.getPropertyValue('--naval-ship-sprite-y') || ''
    };
  });
  expect(bothAfter).toEqual({
    playerX: '-1216px',
    playerY: '-192px',
    enemyX: '-1216px',
    enemyY: '0px'
  });

  await page.evaluate(() => {
    window.__navalBattleDebug.applyCommand('blankShot', 'player');
    window.__navalBattleDebug.applyCommand('blankShot', 'enemy');
  });

  await page.evaluate(() => {
    window.__navalBattleDebug.applyCommand('portRudder', 'player');
    window.__navalBattleDebug.applyCommand('portRudder', 'enemy');
  });
  await expect(page.locator('#navalShipPlayer')).toHaveClass(/is-turning-up/);
  await expect(page.locator('#navalShipEnemy')).toHaveClass(/is-turning-down/);
  const returnDuring = await page.evaluate(() => {
    const playerSprite = document.querySelector('#navalShipPlayer .naval-ship-sprite');
    const enemySprite = document.querySelector('#navalShipEnemy .naval-ship-sprite');
    return {
      playerX: playerSprite?.style.getPropertyValue('--naval-ship-sprite-x') || '',
      playerY: playerSprite?.style.getPropertyValue('--naval-ship-sprite-y') || '',
      enemyX: enemySprite?.style.getPropertyValue('--naval-ship-sprite-x') || '',
      enemyY: enemySprite?.style.getPropertyValue('--naval-ship-sprite-y') || ''
    };
  });
  expect(returnDuring).toEqual({
    playerX: '-1408px',
    playerY: '-128px',
    enemyX: '-1408px',
    enemyY: '-64px'
  });

  await page.waitForTimeout(1450);
  const returnAfter = await page.evaluate(() => {
    const serialized = window.__navalBattleDebug.serialize();
    const playerSprite = document.querySelector('#navalShipPlayer .naval-ship-sprite');
    const enemySprite = document.querySelector('#navalShipEnemy .naval-ship-sprite');
    return {
      playerFacing: serialized.player.facing,
      enemyFacing: serialized.enemy.facing,
      playerX: playerSprite?.style.getPropertyValue('--naval-ship-sprite-x') || '',
      playerY: playerSprite?.style.getPropertyValue('--naval-ship-sprite-y') || '',
      enemyX: enemySprite?.style.getPropertyValue('--naval-ship-sprite-x') || '',
      enemyY: enemySprite?.style.getPropertyValue('--naval-ship-sprite-y') || ''
    };
  });
  expect(returnAfter).toEqual({
    playerFacing: 'front',
    enemyFacing: 'front',
    playerX: '-1216px',
    playerY: '-64px',
    enemyX: '-1216px',
    enemyY: '-128px'
  });

  await expectNoPageErrors(errors);
});

test('ship rank changes steering max and light weapon damage', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_LIGHT_TARGET',
      opponentName: '軽装敵',
      disableAi: true,
      playerProfile: { nation: 'fire' },
      opponentProfile: { nation: 'fire' },
      playerShipProfile: { form: 'boat', shipClass: 'boat', name: '小舟' },
      opponentShipProfile: { form: 'explorer', shipClass: 'explorer', name: '探索船' }
    });
  });

  await expect(page.locator('#navalHpPlayerText')).toHaveText('1 / 1');
  await expect(page.locator('#navalHpEnemyText')).toHaveText('2 / 2');
  await expect(page.locator('#navalWeaponPlayer')).toContainText('銃撃');
  await expect(page.locator('#navalCommands [data-naval-command="bowCannon"]')).toContainText('前方銃撃');

  let state = await page.evaluate(() => {
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.maxHp).toBe(1);
  expect(state.enemy.maxHp).toBe(2);
  expect(state.player.weaponClass).toBe('small');
  expect(state.enemy.hp).toBe(1.5);
  expect(state.logs.join('\n')).toContain('前方銃撃迎撃');

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_LIGHT_SIDE_TARGET',
      opponentName: '側面敵',
      disableAi: true,
      playerShipProfile: { form: 'explorer', shipClass: 'explorer', name: '探索船' },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', name: '戦闘船' }
    });
    window.__navalBattleDebug.mutate((b) => {
      b.player.facing = 'starboard';
      b.enemy.facing = 'starboard';
    });
    window.__navalBattleDebug.applyCommand('broadside', 'player');
    window.__navalBattleDebug.applyCommand('blankShot', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.maxHp).toBe(2);
  expect(state.enemy.maxHp).toBe(3);
  expect(state.enemy.hp).toBe(2);
  expect(state.logs.join('\n')).toContain('側面銃撃');

  await expectNoPageErrors(errors);
});

test('rudder, blank shot, and reload follow the simultaneous rule table', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_RUDDER_TARGET',
      opponentName: '操舵敵',
      disableAi: true,
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', name: '戦闘船' },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', name: '敵戦闘船' }
    });
    window.__navalBattleDebug.applyCommand('starboardRudder', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
  });

  let state = await page.evaluate(() => window.__navalBattleDebug.serialize());
  expect(state.player.facing).toBe('starboard');
  expect(state.player.hp).toBe(3);
  expect(state.player.rudderCooldown).toBe(1);
  expect(state.enemy.reload).toBe(1);
  await expect(page.locator('[data-naval-command="broadside"]')).toBeVisible();
  await expect(page.locator('[data-naval-command="blankShot"]')).toBeVisible();
  await expect(page.locator('[data-naval-command="portRudder"]')).toBeVisible();
  await expect(page.locator('[data-naval-command="portRudder"]')).toBeDisabled();
  await expect(page.locator('[data-naval-command="assault"]')).toHaveCount(0);
  await expect(page.locator('[data-naval-command="cargoRaid"]')).toHaveCount(0);
  await expect(page.locator('#navalCommands .naval-command-icon img')).toHaveCount(3);
  await expect(page.locator('#navalCommandNote')).toContainText('回頭直後');

  const blockedRudder = await page.evaluate(() => {
    const accepted = window.__navalBattleDebug.applyCommand('portRudder', 'player');
    return { accepted, state: window.__navalBattleDebug.serialize() };
  });
  expect(blockedRudder.accepted).toBe(false);
  expect(blockedRudder.state.player.facing).toBe('starboard');
  expect(blockedRudder.state.player.pendingCommandId).toBe(null);
  expect(blockedRudder.state.logs.join('\n')).toContain('回頭直後');

  state = await page.evaluate(() => {
    window.__navalBattleDebug.mutate((b) => {
      b.enemy.facing = 'starboard';
      b.enemy.reload = 0;
    });
    window.__navalBattleDebug.applyCommand('broadside', 'player');
    window.__navalBattleDebug.applyCommand('blankShot', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.hp).toBe(1);
  expect(state.player.reload).toBe(1);
  expect(state.player.rudderCooldown).toBe(0);
  await expect(page.locator('#navalEffectLayer .naval-cannon-shot.is-broadside')).toHaveCount(6);
  await expect(page.locator('[data-naval-command="broadside"]')).toBeVisible();
  await expect(page.locator('[data-naval-command="broadside"]')).toBeDisabled();
  await expect(page.locator('[data-naval-command="portRudder"]')).toBeVisible();
  await expect(page.locator('[data-naval-command="portRudder"]')).toBeEnabled();

  state = await page.evaluate(() => {
    window.__navalBattleDebug.mutate((b) => {
      b.player.facing = 'starboard';
      b.enemy.facing = 'starboard';
      b.player.reload = 0;
      b.enemy.reload = 0;
      b.player.hp = 3;
      b.enemy.hp = 3;
    });
    window.__navalBattleDebug.applyCommand('blankShot', 'player');
    window.__navalBattleDebug.applyCommand('portRudder', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.hp).toBe(3);
  expect(state.enemy.facing).toBe('front');
  expect(state.enemy.rudderCooldown).toBe(1);

  await expectNoPageErrors(errors);
});

test('port rudder dodges bow cannon while side-facing assault is blocked', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  let state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_PORT_DODGE_TARGET',
      opponentName: '取舵回避敵',
      disableAi: true,
      evasionRolls: [0.49],
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', name: '戦闘船' },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', name: '敵戦闘船' }
    });
    window.__navalBattleDebug.mutate((b) => {
      b.enemy.facing = 'starboard';
      b.player.hp = 3;
      b.enemy.hp = 3;
      b.player.reload = 0;
      b.enemy.reload = 0;
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('portRudder', 'enemy');
    return window.__navalBattleDebug.serialize();
  });

  expect(state.enemy.hp).toBe(3);
  expect(state.enemy.facing).toBe('front');
  expect(state.player.reload).toBe(1);
  expect(state.logs.join('\n')).toContain('回避率50%');

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_PORT_ASSAULT_TARGET',
      opponentName: '取舵中断敵',
      disableAi: true,
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', name: '戦闘船' },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', name: '敵戦闘船' }
    });
    window.__navalBattleDebug.mutate((b) => {
      b.enemy.facing = 'starboard';
      b.player.hp = 3;
      b.enemy.hp = 3;
    });
    window.__navalBattleDebug.applyCommand('assault', 'player');
    window.__navalBattleDebug.applyCommand('portRudder', 'enemy');
    return window.__navalBattleDebug.serialize();
  });

  expect(state.player.hp).toBe(3);
  expect(state.enemy.hp).toBe(2);
  expect(state.player.facing).toBe('front');
  expect(state.enemy.facing).toBe('front');
  expect(state.logs.join('\n')).toContain('突撃で方向転換中断');

  const sideAssault = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_SIDE_ASSAULT_TARGET',
      opponentName: '横向き中断敵',
      disableAi: true,
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', name: '戦闘船' },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', name: '敵戦闘船' }
    });
    window.__navalBattleDebug.mutate((b) => {
      b.player.facing = 'starboard';
      b.enemy.facing = 'starboard';
      b.player.hp = 3;
      b.enemy.hp = 3;
    });
    const accepted = window.__navalBattleDebug.applyCommand('assault', 'player');
    return { accepted, state: window.__navalBattleDebug.serialize() };
  });

  expect(sideAssault.accepted).toBe(false);
  expect(sideAssault.state.player.hp).toBe(3);
  expect(sideAssault.state.enemy.hp).toBe(3);
  expect(sideAssault.state.player.facing).toBe('starboard');
  expect(sideAssault.state.player.pendingCommandId).toBe(null);

  await expectNoPageErrors(errors);
});

test('steering zero enables boarding and transitions to melee', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(() => {
    window.__navalOutcomes = [];
    window.startNavalBattle({
      opponentId: 'PF_BOARDING_TARGET',
      opponentName: '接舷敵',
      disableAi: true,
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', name: '戦闘船' },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', name: '敵戦闘船' },
      onBoarding: (id) => window.__navalOutcomes.push(['boarding', id])
    });
  });

  await page.evaluate(() => {
    for (let i = 0; i < 3; i += 1) {
      window.__navalBattleDebug.applyCommand('assault', 'player');
      window.__navalBattleDebug.applyCommand('starboardRudder', 'enemy');
    }
  });
  const state = await page.evaluate(() => window.__navalBattleDebug.serialize());
  expect(state.enemy.hp).toBe(0);
  await expect(page.locator('[data-naval-command="boarding"]')).toBeVisible();

  await page.locator('[data-naval-command="boarding"]').click();
  await expect(page.locator('#navalBattleModal')).toBeVisible();
  await expect(page.locator('#navalShipPlayer')).toHaveClass(/is-boarding-motion/);
  await expect(page.locator('#navalShipEnemy')).not.toHaveClass(/is-boarding-motion/);
  await expect(page.locator('#navalEffectLayer .naval-command-callout')).toContainText('乗り込めええ！！');
  await expect(page.locator('#navalEffectLayer .naval-boarding-clash')).toBeVisible();
  const boardingMotion = await page.evaluate(() => {
    const player = document.querySelector('#navalShipPlayer');
    const enemy = document.querySelector('#navalShipEnemy');
    return {
      playerAnimation: getComputedStyle(player).animationName,
      playerDuration: getComputedStyle(player).animationDuration,
      enemyAnimation: getComputedStyle(enemy).animationName,
      playerBoardingX: player.style.getPropertyValue('--naval-boarding-x'),
      enemyBoardingX: enemy.style.getPropertyValue('--naval-boarding-x')
    };
  });
  expect(boardingMotion.playerAnimation).toContain('navalBoardingPlayer');
  expect(Number.parseFloat(boardingMotion.playerDuration)).toBeGreaterThanOrEqual(1.5);
  expect(boardingMotion.enemyAnimation).not.toContain('navalBoardingEnemy');
  expect(Number.parseInt(boardingMotion.playerBoardingX, 10)).toBeLessThan(-120);
  expect(Number.parseInt(boardingMotion.enemyBoardingX, 10)).toBeGreaterThan(120);
  expect(await page.evaluate(() => window.__navalOutcomes)).toEqual([]);
  await expect(page.locator('#navalBattleModal')).toBeHidden();
  expect(await page.evaluate(() => window.__navalOutcomes)).toEqual([['boarding', 'PF_BOARDING_TARGET']]);

  await expectNoPageErrors(errors);
});

test('npc boarding waits for final command animation before melee transition', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(() => {
    window.__navalOutcomes = [];
    window.startNavalBattle({
      opponentId: 'PF_NPC_BOARDING_TARGET',
      opponentName: '接舷NPC',
      disableAi: true,
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', name: '戦闘船' },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', name: '敵戦闘船' },
      onBoarding: (id, payload) => window.__navalOutcomes.push(['boarding', id, payload?.navalOutcome])
    });
    window.__navalBattleDebug.mutate((b) => {
      b.player.hp = 1;
      b.enemy.hp = 3;
      b.player.reload = 0;
      b.enemy.reload = 0;
    });
    window.__navalBattleDebug.applyCommand('assault', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
  });

  const finalState = await page.evaluate(() => window.__navalBattleDebug.serialize());
  expect(finalState.player.hp).toBe(0);
  expect(finalState.outcome).toBe('boarded');
  await expect(page.locator('#navalBattleModal')).toBeVisible();
  await expect(page.locator('#navalShipPlayer')).toHaveClass(/is-assault-failed/);
  await expect(page.locator('#navalEffectLayer .naval-cannon-shot.is-enemy')).toBeVisible();
  await expect(page.locator('#navalEffectLayer .naval-assault-fail.is-player')).toHaveText('突撃失敗');
  await expect(page.locator('#navalEffectLayer .naval-boarding-clash')).toHaveCount(0);
  await expect(page.locator('#navalShipEnemy')).not.toHaveClass(/is-boarding-motion/);
  expect(await page.evaluate(() => window.__navalOutcomes)).toEqual([]);

  await page.waitForTimeout(1600);
  await expect(page.locator('#navalShipEnemy')).toHaveClass(/is-boarding-motion/);
  await expect(page.locator('#navalEffectLayer .naval-boarding-clash')).toBeVisible();
  expect(await page.evaluate(() => window.__navalOutcomes)).toEqual([]);
  await expect(page.locator('#navalBattleModal')).toBeHidden();
  expect(await page.evaluate(() => window.__navalOutcomes)).toEqual([['boarding', 'PF_NPC_BOARDING_TARGET', 'boarded']]);

  await expectNoPageErrors(errors);
});

test('ship-specific metadata exposes domain durability low firepower and passive state', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  const cases = [
    ['boat', 'boat', '手漕ぎボート', 'surface', '海上', 1, true, '小さな船影', 'small-silhouette'],
    ['ship_human_explorer', 'explorer', '帆付きボート', 'surface', '海上', 1.5, true, '素直な舵', 'honest-rudder'],
    ['ship_human_defender', 'defender', '帆船', 'surface', '海上', 3, false, '火炎弾', 'human-broadside-fire'],
    ['ship_human_fighter', 'fighter', '海賊船', 'surface', '海上', 3, false, '焼夷弾', 'human-bow-fire'],
    ['ship_human_merchant', 'merchant', '水上馬車', 'surface', '海上', 3, false, '馬衝角', 'human-assault-ram'],
    ['ship_elf_explorer', 'explorer', '気球', 'air', '飛行', 2, true, '高空退避', 'balloon-retreat'],
    ['ship_elf_defender', 'defender', '海賊飛行船', 'air', '飛行', 2, false, '絨毯爆撃', 'elf-broadside-fear'],
    ['ship_elf_fighter', 'fighter', '海賊飛空艇', 'air', '飛行', 2, false, '爆弾投下', 'elf-bow-bomb'],
    ['ship_elf_merchant', 'merchant', '飛行船', 'air', '飛行', 2, false, '急降下', 'elf-assault-dive'],
    ['ship_orc_explorer', 'explorer', '石のボート', 'surface', '海上', 1.5, true, '石造船殻', 'stone-hull'],
    ['ship_orc_defender', 'defender', '潜水艦', 'underwater', '水中', 4, false, '水圧魚雷', 'pressure-torpedo'],
    ['ship_orc_fighter', 'fighter', '水上戦車', 'surface', '海上', 3, false, '巨大砲', 'bow-mirror-null'],
    ['ship_orc_merchant', 'merchant', '水上バス', 'surface', '海上', 3, false, '突進', 'assault-mirror-null'],
    ['ship_goblin_explorer', 'explorer', 'キャタピラ・ボート', 'surface', '海上', 1.5, true, '波風旋回', 'wave-turn'],
    ['ship_goblin_defender', 'defender', '潜水艦・望遠鏡', 'underwater', '水中', 4, false, '無泡魚雷', 'bubbleless-torpedo'],
    ['ship_goblin_fighter', 'fighter', 'ドリルタンク', 'surface', '海上', 3, false, 'ドリル', 'goblin-assault-flood'],
    ['ship_goblin_merchant', 'merchant', '水瓶船', 'surface', '海上', 3, false, '水爆弾', 'goblin-bow-flood'],
    ['guild_ship', 'guild', '王の船', 'surface', '海上', 5, false, '', '']
  ];

  const ships = await page.evaluate((input) => input.map(([itemId, form]) => {
    window.startNavalBattle({
      opponentId: `PF_META_${itemId}`,
      opponentName: 'メタ敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form, shipClass: form, itemId: itemId === 'boat' ? 'ship_common_boat' : itemId, name: itemId },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', itemId: 'ship_human_fighter', name: '敵船' }
    });
    const state = window.__navalBattleDebug.serialize();
    return {
      itemId,
      shipType: state.player.shipType,
      maxHp: state.player.maxHp,
      shipDomain: state.player.shipDomain,
      shipDomainLabel: state.player.shipDomainLabel,
      lowFirepower: state.player.lowFirepower,
      shipPassiveName: state.player.shipPassiveName,
      shipPassiveKey: state.player.shipPassiveKey,
      shipTraitKey: state.player.shipTraitKey,
      arcanaCount: state.player.arcanaGears.length,
      shipClassName: document.getElementById('navalShipPlayer')?.className || '',
      spriteFrameWidth: getComputedStyle(document.querySelector('#navalShipPlayer .naval-ship-sprite')).getPropertyValue('--naval-ship-frame-w'),
      spriteSheetWidth: getComputedStyle(document.querySelector('#navalShipPlayer .naval-ship-sprite')).getPropertyValue('--naval-ship-sheet-w'),
      spriteX: getComputedStyle(document.querySelector('#navalShipPlayer .naval-ship-sprite')).getPropertyValue('--naval-ship-sprite-x'),
      shipTop: document.getElementById('navalShipPlayer')?.style.top || '',
      guildLayerCount: document.querySelectorAll('#navalShipPlayer .naval-guild-ship-layer').length,
      guildLayerBackground: getComputedStyle(document.querySelector('#navalShipPlayer .naval-guild-ship-layer.is-hull') || document.body).backgroundImage,
      guildSpriteBackground: getComputedStyle(document.querySelector('#navalShipPlayer .naval-ship-sprite')).backgroundImage,
      weaponText: document.getElementById('navalWeaponPlayer')?.textContent || '',
      stateText: document.getElementById('navalStatePlayer')?.textContent || '',
      traitText: document.getElementById('navalTraitPlayer')?.textContent || ''
    };
  }), cases);

  for (const [itemId, , name, domain, domainLabel, maxHp, lowFirepower, passiveName, passiveKey] of cases) {
    const ship = ships.find((entry) => entry.itemId === itemId);
    expect(ship).toBeTruthy();
    expect(ship.shipType).toBe(name);
    expect(ship.maxHp).toBe(maxHp);
    expect(ship.shipDomain).toBe(domain);
    expect(ship.shipDomainLabel).toBe(domainLabel);
    expect(ship.lowFirepower).toBe(lowFirepower);
    expect(ship.shipPassiveName).toBe(passiveName);
    expect(ship.shipPassiveKey).toBe(passiveKey);
    expect(ship.stateText).toContain(`領域${domainLabel}`);
    expect(ship.stateText).toContain(`海戦耐久${maxHp}/${maxHp}`);
  }
  expect(ships.find((entry) => entry.itemId === 'boat').weaponText).toContain('前0.5/側1');
  expect(ships.find((entry) => entry.itemId === 'ship_orc_defender').traitText).toContain('水圧魚雷 常時');
  expect(ships.find((entry) => entry.itemId === 'ship_orc_fighter').traitText).toContain('巨大砲 未使用');
  expect(ships.find((entry) => entry.itemId === 'boat').shipTop).toBe('96px');
  const guildShip = ships.find((entry) => entry.itemId === 'guild_ship');
  expect(guildShip.shipClassName).toContain('is-guild');
  expect(guildShip.spriteFrameWidth).toBe('96px');
  expect(guildShip.spriteSheetWidth).toBe('2016px');
  expect(guildShip.spriteX).toBe('-96px');
  expect(guildShip.shipTop).toBe('96px');
  expect(guildShip.guildLayerCount).toBe(4);
  expect(guildShip.guildLayerBackground).toContain('guildShips.png');
  expect(guildShip.guildSpriteBackground).toBe('none');
  expect(guildShip.shipTraitKey).toBe('guild_ship');
  expect(guildShip.traitText).toBe('-');
  expect(guildShip.arcanaCount).toBe(0);

  await expectNoPageErrors(errors);
});

test('ship-specific passives affect naval hit rate damage status and snapshots', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  let state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_GENERIC_PASSIVE_REMOVED',
      opponentName: '旧特性敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', name: '戦闘船' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '商船' }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.hp).toBe(2);
  expect(state.player.shipPassiveKey).toBe('');

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_LOWFIRE_BOAT',
      opponentName: '低火力敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'boat', shipClass: 'boat', itemId: 'ship_common_boat', name: '小舟' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', itemId: 'ship_human_merchant', name: '敵船' }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.lowFirepower).toBe(true);
  expect(state.enemy.hp).toBe(2.5);

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_HUMAN_MERCHANT_RAM',
      opponentName: '馬衝角敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'merchant', shipClass: 'merchant', itemId: 'ship_human_merchant', name: '水上馬車' },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', itemId: 'ship_human_fighter', name: '敵船' }
    });
    window.__navalBattleDebug.applyCommand('assault', 'player');
    window.__navalBattleDebug.applyCommand('starboardRudder', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.hp).toBe(1.5);
  expect(state.logs.join('\n')).toContain('馬衝角');

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_ORC_BOW_NULL',
      opponentName: '巨大砲敵',
      disableAi: true,
      evasionRolls: [1, 1],
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', itemId: 'ship_orc_fighter', name: '水上戦車' },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', itemId: 'ship_human_fighter', name: '敵船' }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.hp).toBe(3);
  expect(state.enemy.hp).toBe(2);
  expect(state.player.shipPassiveUses['bow-mirror-null']).toBe(1);
  state = await page.evaluate(() => {
    const snapshot = window.__navalBattleDebug.serialize();
    window.__navalBattleDebug.applySnapshot(snapshot, 'player');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.shipPassiveUses['bow-mirror-null']).toBe(1);

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_ORC_ASSAULT_NULL',
      opponentName: '突進敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'merchant', shipClass: 'merchant', itemId: 'ship_orc_merchant', name: '水上バス' },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', itemId: 'ship_human_fighter', name: '敵船' }
    });
    window.__navalBattleDebug.applyCommand('assault', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.hp).toBe(3);
  expect(state.enemy.hp).toBe(2);
  expect(state.player.shipPassiveUses['assault-mirror-null']).toBe(1);

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_ORC_STONE_HULL',
      opponentName: '石造敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'explorer', shipClass: 'explorer', itemId: 'ship_orc_explorer', name: '石のボート' },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', itemId: 'ship_human_fighter', name: '敵船' }
    });
    window.__navalBattleDebug.applyCommand('assault', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.maxHp).toBe(1.5);
  expect(state.player.hp).toBe(1);
  expect(state.player.shipPassiveUses['stone-hull']).toBe(1);

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_HUMAN_FIRE_PROC',
      opponentName: '焼夷敵',
      disableAi: true,
      evasionRolls: [0],
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', itemId: 'ship_human_fighter', name: '海賊船' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', itemId: 'ship_human_merchant', name: '敵船' }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.hp).toBe(2);
  expect(state.enemy.statuses.fire.turns).toBe(2);
  expect(state.logs.join('\n')).toContain('焼夷弾');

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_ELF_BOMB_PROC',
      opponentName: '爆弾敵',
      disableAi: true,
      evasionRolls: [0],
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', itemId: 'ship_elf_fighter', name: '海賊飛空艇' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', itemId: 'ship_human_merchant', name: '敵船' }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.hp).toBe(1.5);
  expect(state.logs.join('\n')).toContain('爆弾投下');

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_GOBLIN_FLOOD_PROC',
      opponentName: 'ドリル敵',
      disableAi: true,
      evasionRolls: [0],
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', itemId: 'ship_goblin_fighter', name: 'ドリルタンク' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', itemId: 'ship_human_merchant', name: '敵船' }
    });
    window.__navalBattleDebug.applyCommand('assault', 'player');
    window.__navalBattleDebug.applyCommand('starboardRudder', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.statuses.flood.turns).toBe(2);
  expect(state.logs.join('\n')).toContain('ドリル');

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_ELF_DIVE_PENDING',
      opponentName: '急降下敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'merchant', shipClass: 'merchant', itemId: 'ship_elf_merchant', name: '飛行船' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', itemId: 'ship_human_merchant', name: '敵船' }
    });
    window.__navalBattleDebug.applyCommand('assault', 'player');
    window.__navalBattleDebug.applyCommand('starboardRudder', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.shipPassivePending.diveGuard.value).toBe(0.5);

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_GOBLIN_WAVE_PENDING',
      opponentName: '波風敵',
      disableAi: true,
      evasionRolls: [0],
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'explorer', shipClass: 'explorer', itemId: 'ship_goblin_explorer', name: 'キャタピラ・ボート' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', itemId: 'ship_human_merchant', name: '敵船' }
    });
    window.__navalBattleDebug.applyCommand('starboardRudder', 'player');
    window.__navalBattleDebug.applyCommand('starboardRudder', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.shipPassivePending.waveTurn.value).toBe(0.3);

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_ARCANA_COMMAND_PASSIVE',
      opponentName: '置換敵',
      disableAi: true,
      evasionRolls: [0],
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', itemId: 'ship_human_fighter', name: '海賊船', majorArcanaItemIds: ['arcana-1'] },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', itemId: 'ship_human_merchant', name: '敵船' }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.arcanaGears[0].used).toBe(true);
  expect(state.enemy.statuses.fire.turns).toBe(2);

  const rates = await page.evaluate(() => ({
    normalFront: window.__navalBattleDebug.resolveEvasionRate({
      defenderFacing: 'front',
      defenderCommandId: 'bowCannon',
      attackerCommandId: 'bowCannon'
    }),
    airFront: window.__navalBattleDebug.resolveEvasionRate({
      defenderFacing: 'front',
      defenderCommandId: 'bowCannon',
      attackerCommandId: 'bowCannon',
      defenderShipTraitKey: 'ship_elf_fighter'
    }),
    underwaterFront: window.__navalBattleDebug.resolveEvasionRate({
      defenderFacing: 'front',
      defenderCommandId: 'bowCannon',
      attackerCommandId: 'bowCannon',
      defenderShipTraitKey: 'ship_orc_defender'
    }),
    boatFront: window.__navalBattleDebug.resolveEvasionRate({
      defenderFacing: 'front',
      defenderCommandId: 'bowCannon',
      attackerCommandId: 'bowCannon',
      defenderShipTraitKey: 'boat'
    }),
    humanExplorerSideTurning: window.__navalBattleDebug.resolveEvasionRate({
      defenderFacing: 'starboard',
      defenderCommandId: 'portRudder',
      attackerCommandId: 'bowCannon',
      defenderShipTraitKey: 'ship_human_explorer'
    }),
    goblinBroadsideHitUp: window.__navalBattleDebug.resolveEvasionRate({
      defenderFacing: 'front',
      defenderCommandId: 'bowCannon',
      attackerCommandId: 'broadside',
      attackerShipTraitKey: 'ship_goblin_defender'
    })
  }));
  expect(rates.normalFront).toBe(0.5);
  expect(rates.airFront).toBe(0.8);
  expect(rates.underwaterFront).toBe(0.2);
  expect(rates.boatFront).toBe(0.55);
  expect(rates.humanExplorerSideTurning).toBe(0.6);
  expect(rates.goblinBroadsideHitUp).toBe(0.3);

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_PRESSURE_TORPEDO_CAP',
      opponentName: '水圧敵',
      disableAi: true,
      evasionRolls: [0.15, 1],
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'defender', shipClass: 'defender', itemId: 'ship_orc_defender', name: '潜水艦' },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', itemId: 'ship_human_fighter', name: '敵船' }
    });
    window.__navalBattleDebug.mutate((b) => {
      b.player.facing = 'starboard';
    });
    window.__navalBattleDebug.applyCommand('broadside', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.hp).toBe(4);
  expect(state.turnEvasions || []).toEqual([]);
  expect(state.logs.join('\n')).toContain('回避率20%');

  await expectNoPageErrors(errors);
});

test('nation element advantage boosts the first attack only', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  let state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_ELEMENT_TARGET',
      opponentName: '風敵',
      disableAi: true,
      playerProfile: { nation: 'fire' },
      opponentProfile: { nation: 'wind' },
      playerShipProfile: { form: 'merchant', shipClass: 'merchant', name: '火の商船' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '風の商船' }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.element).toBe('fire');
  expect(state.enemy.element).toBe('wind');
  expect(state.enemy.hp).toBe(1);
  expect(state.player.elementAdvantageUsed).toBe(true);
  expect(state.logs.join('\n')).toContain('属性優勢');
  await expect(page.locator('#navalElementPlayer')).toContainText('有利');

  state = await page.evaluate(() => {
    window.__navalBattleDebug.mutate((b) => {
      b.enemy.hp = 3;
      b.player.reload = 0;
      b.enemy.reload = 0;
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.hp).toBe(2);
  expect(state.player.elementAdvantageUsed).toBe(true);

  state = await page.evaluate(() => {
    const snapshot = window.__navalBattleDebug.serialize();
    snapshot.player.elementAdvantageUsed = true;
    window.__navalBattleDebug.applySnapshot(snapshot, 'player');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.element).toBe('fire');
  expect(state.player.weaponClass).toBe('cannon');
  expect(state.player.elementAdvantageUsed).toBe(true);

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_SAME_ELEMENT_TARGET',
      opponentName: '同属性敵',
      disableAi: true,
      playerProfile: { nation: 'fire' },
      opponentProfile: { nation: 'fire' },
      playerShipProfile: { form: 'merchant', shipClass: 'merchant', name: '火の商船' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '火の敵商船' }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.hp).toBe(2);
  expect(state.player.elementAdvantageUsed).toBe(false);

  await expectNoPageErrors(errors);
});

test('major arcana replacement command uses the lowest numbered card first', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_ARCANA_PRIORITY_TARGET',
      opponentName: '置換敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: {
        form: 'merchant',
        shipClass: 'merchant',
        name: '優先船',
        level: 3,
        majorArcanaItemIds: ['arcana-4', 'arcana-1']
      },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '標的船', level: 3 }
    });
  });

  await expect(page.locator('[data-naval-command="bowCannon"]')).toContainText('魔術師の魔砲');
  await expect(page.locator('[data-naval-command="bowCannon"]')).toContainText('大アルカナ');

  const state = await page.evaluate(() => {
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  const magician = state.player.arcanaGears.find((gear) => gear.arcanaNumber === 1);
  const emperor = state.player.arcanaGears.find((gear) => gear.arcanaNumber === 4);
  expect(magician.used).toBe(true);
  expect(emperor.used).toBe(false);
  expect(state.player.reload).toBe(0);
  expect(state.enemy.hp).toBe(2);
  expect(state.logs.join('\n')).toContain('魔術師の魔砲');

  await expectNoPageErrors(errors);
});

test('hierophant replacement seal hides enemy arcana without consuming it', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  let state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_HIEROPHANT_TARGET',
      opponentName: '封印敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: {
        form: 'merchant',
        shipClass: 'merchant',
        name: '封印砲船',
        level: 3,
        majorArcanaItemIds: ['arcana-5']
      },
      opponentShipProfile: {
        form: 'merchant',
        shipClass: 'merchant',
        name: '魔砲船',
        level: 3,
        majorArcanaItemIds: ['arcana-1']
      }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });

  expect(state.player.arcanaGears[0].used).toBe(true);
  expect(state.enemy.arcanaGears[0].used).toBe(false);
  expect(state.enemy.arcanaCommandLocks.replacement).toBe(1);
  expect(state.logs.join('\n')).toContain('大アルカナを沈黙させた');

  state = await page.evaluate(() => {
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.pendingArcanaKey).toBe(null);
  expect(state.enemy.arcanaGears[0].used).toBe(false);

  await expectNoPageErrors(errors);
});

test('chariot assault wins a mirror assault and applies flood', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  const state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_CHARIOT_TARGET',
      opponentName: '突撃敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: {
        form: 'merchant',
        shipClass: 'merchant',
        name: '戦車船',
        level: 3,
        majorArcanaItemIds: ['arcana-7']
      },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '敵船', level: 3 }
    });
    window.__navalBattleDebug.applyCommand('assault', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });

  expect(state.player.hp).toBe(3);
  expect(state.enemy.hp).toBe(2);
  expect(state.enemy.statuses.flood.turns).toBe(2);
  expect(state.player.arcanaGears[0].used).toBe(true);
  expect(state.logs.join('\n')).toContain('戦車の制圧突撃');

  await expectNoPageErrors(errors);
});

test('repair command clears equipment damage only', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_REPAIR_TARGET',
      opponentName: '修理敵',
      disableAi: true,
      playerShipProfile: { form: 'merchant', shipClass: 'merchant', name: '修理船', level: 3 },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '見張り船', level: 3 }
    });
    window.__navalBattleDebug.mutate((b) => {
      b.player.equipmentDamage = { mast: { turns: 2 }, rudder: { turns: 2 } };
      b.player.statuses = { fire: { turns: 2 }, fear: { turns: 2 } };
      b.enemy.facing = 'starboard';
    });
  });

  await expect(page.locator('[data-naval-command="repair"]')).toBeEnabled();
  const state = await page.evaluate(() => {
    window.__navalBattleDebug.applyCommand('repair', 'player');
    window.__navalBattleDebug.applyCommand('blankShot', 'enemy');
    return window.__navalBattleDebug.serialize();
  });

  expect(state.player.equipmentDamage).toEqual({});
  expect(state.player.statuses.fire.turns).toBeGreaterThan(0);
  expect(state.player.statuses.fear.turns).toBeGreaterThan(0);
  expect(state.logs.join('\n')).toContain('設備を修理した');

  await expectNoPageErrors(errors);
});

test('devil and judgement arcana apply statuses and recovery state', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  let state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_DEVIL_TARGET',
      opponentName: '状態敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: {
        form: 'merchant',
        shipClass: 'merchant',
        name: '悪魔砲船',
        level: 3,
        majorArcanaItemIds: ['arcana-15']
      },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '横向き敵船', level: 3 }
    });
    window.__navalBattleDebug.mutate((b) => {
      b.player.facing = 'starboard';
      b.enemy.facing = 'starboard';
    });
    window.__navalBattleDebug.applyCommand('broadside', 'player');
    window.__navalBattleDebug.applyCommand('blankShot', 'enemy');
    return window.__navalBattleDebug.serialize();
  });

  expect(state.enemy.statuses.confusion.turns).toBe(2);
  expect(state.enemy.statuses.fire.turns).toBe(2);
  expect(state.player.arcanaGears[0].used).toBe(true);
  expect(state.player.morale).toBe(1);
  expect(state.enemy.morale).toBe(-1);

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_JUDGEMENT_TARGET',
      opponentName: '復旧敵',
      disableAi: true,
      playerShipProfile: {
        form: 'merchant',
        shipClass: 'merchant',
        name: '審判船',
        level: 3,
        majorArcanaItemIds: ['arcana-20']
      },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '横向き敵船', level: 3 }
    });
    window.__navalBattleDebug.mutate((b) => {
      b.player.facing = 'starboard';
      b.enemy.facing = 'starboard';
      b.player.crewHpPercent = 70;
      b.player.statuses = {
        fire: { turns: 2 },
        flood: { turns: 2 },
        fear: { turns: 2 },
        confusion: { turns: 2 }
      };
      b.player.equipmentDamage = { mast: { turns: 2 }, rudder: { turns: 2 } };
    });
    window.__navalBattleDebug.applyCommand('blankShot', 'player');
    window.__navalBattleDebug.applyCommand('blankShot', 'enemy');
    return window.__navalBattleDebug.serialize();
  });

  expect(state.player.arcanaGears[0].used).toBe(true);
  expect(state.player.crewHpPercent).toBe(80);
  expect(state.player.equipmentDamage).toEqual({});
  expect(state.player.statuses.fear).toBeUndefined();
  expect(state.player.statuses.confusion).toBeUndefined();
  expect(state.player.statuses.fire.turns).toBeGreaterThan(0);
  expect(state.player.statuses.flood.turns).toBeGreaterThan(0);

  await expectNoPageErrors(errors);
});
