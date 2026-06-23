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
  const impactAnimation = await page.evaluate(() => {
    const sea = document.getElementById('navalSea');
    return window.getComputedStyle(sea).animationName;
  });
  expect(impactAnimation).toContain('navalImpactShake');
  await expect(page.locator('#navalShipPlayer')).toHaveClass(/is-surging/);
  const assaultSurge = await page.locator('#navalShipPlayer').getAttribute('style');
  expect(assaultSurge).toContain('--naval-surge-x: -156px');
  const assaultAnimation = await page.evaluate(() => {
    const wrap = document.querySelector('#navalShipPlayer .naval-ship-sprite-wrap');
    const style = window.getComputedStyle(wrap);
    return {
      name: style.animationName,
      duration: style.animationDuration
    };
  });
  expect(assaultAnimation.name).toContain('navalSurge');
  expect(Number.parseFloat(assaultAnimation.duration)).toBeGreaterThanOrEqual(1.1);
  const navalCss = await page.evaluate(() => document.getElementById('navalBattleStyle')?.textContent || '');
  expect(navalCss).toContain('@keyframes navalShotPlayerMissUp');
  expect(navalCss).toContain('left: 24%; top: var(--naval-shot-track-top');
  expect(navalCss).not.toContain('top: 36%');
  expect(navalCss).not.toContain('top: 78%');

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
      evasionRolls: [0.19, 1],
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
  expect(state.logs.join('\n')).toContain('回避率20%');

  state = await page.evaluate(() => {
    const profile = { nation: 'none' };
    const ship = { form: 'merchant', shipClass: 'merchant', name: '商船' };
    window.startNavalBattle({
      opponentId: 'PF_EVASION_FRONT_FAIL',
      opponentName: '正面被弾敵',
      disableAi: true,
      evasionRolls: [0.2, 1],
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
      opponentName: '横回避敵',
      disableAi: true,
      evasionRolls: [0.04],
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
  expect(state.player.hp).toBe(3);
  expect(state.logs.join('\n')).toContain('回避率5%');
  await expect(page.locator('#navalEffectLayer .naval-cannon-shot')).toHaveClass(/is-miss/);
  await expect(page.locator('#navalSea')).not.toHaveClass(/is-impact-shake/);

  state = await page.evaluate(() => {
    const profile = { nation: 'none' };
    const ship = { form: 'merchant', shipClass: 'merchant', name: '商船' };
    window.startNavalBattle({
      opponentId: 'PF_EVASION_SIDE_FAIL',
      opponentName: '横被弾敵',
      disableAi: true,
      evasionRolls: [0.05],
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
  await expect(page.locator('#navalSea')).toHaveClass(/is-impact-shake/);

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
    })
  }));
  expect(rates).toEqual({
    front: 0.2,
    side: 0.05,
    assault: 0,
    turning: 0.35
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
  expect(state.enemy.reload).toBe(1);
  await expect(page.locator('[data-naval-command="broadside"]')).toBeVisible();
  await expect(page.locator('[data-naval-command="blankShot"]')).toBeVisible();
  await expect(page.locator('[data-naval-command="assault"]')).toHaveCount(0);
  await expect(page.locator('[data-naval-command="cargoRaid"]')).toHaveCount(0);
  await expect(page.locator('#navalCommands .naval-command-icon img')).toHaveCount(3);

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
  await expect(page.locator('#navalEffectLayer .naval-cannon-shot.is-broadside')).toHaveCount(6);
  await expect(page.locator('[data-naval-command="broadside"]')).toHaveCount(0);

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
  expect(state.logs.join('\n')).toContain('船首砲を回避して正面へ戻った');

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

test('race-specific ship traits replace generic class traits', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  let state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_GENERIC_TRAIT_REMOVED',
      opponentName: '旧特性敵',
      disableAi: true,
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', name: '戦闘船' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '商船' }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.hp).toBe(2);
  expect(state.player.shipTraitKey).toBe('');
  expect(state.player.shipTraitUsed).toBe(false);
  expect(state.logs.join('\n')).not.toContain('戦闘船特性');

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_HUMAN_FIGHTER_TRAIT',
      opponentName: '火炎敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', itemId: 'ship_human_fighter', name: '人間戦闘船' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '商船' }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.hp).toBe(1.5);
  expect(state.player.shipTraitKey).toBe('ship_human_fighter');
  expect(state.player.shipTraitName).toBe('火炎噴射');
  expect(state.player.shipTraitUsed).toBe(true);
  expect(state.logs.join('\n')).toContain('火炎噴射');

  state = await page.evaluate(() => {
    const snapshot = window.__navalBattleDebug.serialize();
    window.__navalBattleDebug.applySnapshot(snapshot, 'player');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.shipTraitUsed).toBe(true);

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

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_ORC_FIGHTER_TRAIT',
      opponentName: '直撃敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', itemId: 'ship_orc_fighter', name: 'オーク戦闘船' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '商船' }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.hp).toBe(1);
  expect(state.player.shipTraitUsed).toBe(true);
  expect(state.logs.join('\n')).toContain('直撃砲');

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_HUMAN_DEFENDER_TRAIT',
      opponentName: '防壁敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'defender', shipClass: 'defender', itemId: 'ship_human_defender', name: '人間防衛船' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '敵商船' }
    });
    window.__navalBattleDebug.applyCommand('assault', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.hp).toBe(3);
  expect(state.player.shipTraitUsed).toBe(true);
  expect(state.logs.join('\n')).toContain('艦隊防壁');

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_GOBLIN_DEFENDER_TRAIT',
      opponentName: '砂嵐敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'defender', shipClass: 'defender', itemId: 'ship_goblin_defender', name: 'ゴブリン防衛船' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '敵商船' }
    });
    window.__navalBattleDebug.mutate((b) => {
      b.player.facing = 'starboard';
      b.enemy.facing = 'starboard';
    });
    window.__navalBattleDebug.applyCommand('broadside', 'player');
    window.__navalBattleDebug.applyCommand('blankShot', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.hp).toBe(0.5);
  expect(state.player.shipTraitUsed).toBe(true);
  expect(state.logs.join('\n')).toContain('砂嵐ノイズ');

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_HUMAN_MERCHANT_TRAIT',
      opponentName: '滑走敵',
      disableAi: true,
      evasionRolls: [0.39, 1],
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'merchant', shipClass: 'merchant', itemId: 'ship_human_merchant', name: '人間商船' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '敵商船' }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.hp).toBe(3);
  expect(state.player.shipTraitUsed).toBe(true);
  expect(state.logs.join('\n')).toContain('水上滑走');
  expect(state.logs.join('\n')).toContain('回避率40%');

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_ORC_MERCHANT_TRAIT',
      opponentName: '装甲敵',
      disableAi: true,
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'merchant', shipClass: 'merchant', itemId: 'ship_orc_merchant', name: 'オーク商船' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '敵商船' }
    });
    window.__navalBattleDebug.applyCommand('assault', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.player.hp).toBe(3);
  expect(state.player.shipTraitUsed).toBe(true);
  expect(state.logs.join('\n')).toContain('装甲展開');

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_ELF_EXPLORER_TRAIT',
      opponentName: '視認敵',
      disableAi: true,
      evasionRolls: [1, 0],
      playerProfile: { nation: 'none' },
      opponentProfile: { nation: 'none' },
      playerShipProfile: { form: 'explorer', shipClass: 'explorer', itemId: 'ship_elf_explorer', name: 'エルフ探索船' },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '敵商船' }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.hp).toBe(2.5);
  expect(state.player.shipTraitUsed).toBe(true);
  expect(state.logs.join('\n')).toContain('高度視認');

  const rates = await page.evaluate(() => ({
    normalTurning: window.__navalBattleDebug.resolveEvasionRate({
      defenderFacing: 'front',
      defenderCommandId: 'starboardRudder',
      attackerCommandId: 'bowCannon'
    }),
    humanExplorerTurning: window.__navalBattleDebug.resolveEvasionRate({
      defenderFacing: 'front',
      defenderCommandId: 'starboardRudder',
      attackerCommandId: 'bowCannon',
      defenderShipTraitKey: 'ship_human_explorer'
    })
  }));
  expect(rates.normalTurning).toBe(0.35);
  expect(rates.humanExplorerTurning).toBe(0.55);

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

test('major arcana ship rigging works with simultaneous commands', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_ARCANA_TARGET',
      opponentName: '艤装敵',
      disableAi: true,
      playerShipProfile: {
        form: 'fighter',
        shipClass: 'fighter',
        name: '雷撃船',
        level: 3,
        majorArcanaItemIds: ['arcana-7']
      },
      opponentShipProfile: {
        form: 'defender',
        shipClass: 'defender',
        name: '避雷船',
        level: 3,
        majorArcanaItemIds: ['arcana-16']
      }
    });
  });

  await expect(page.locator('#navalArcanaPlayer')).toContainText('雷鳴の船首衝角');
  await expect(page.locator('#navalArcanaEnemy')).toContainText('巨大な避雷マスト');

  const state = await page.evaluate(() => {
    window.__navalBattleDebug.mutate((b) => {
      b.enemy.facing = 'starboard';
    });
    window.__navalBattleDebug.applyCommand('assault', 'player');
    window.__navalBattleDebug.applyCommand('blankShot', 'enemy');
    return window.__navalBattleDebug.serialize();
  });
  expect(state.enemy.hp).toBe(2.5);
  expect(state.player.hp).toBe(2.5);
  expect(state.player.arcanaGears[0].used).toBe(true);
  expect(state.enemy.arcanaGears[0].used).toBe(true);
  expect(state.logs.join('\n')).toContain('雷鳴の船首衝角');
  expect(state.logs.join('\n')).toContain('巨大な避雷マスト');

  await expectNoPageErrors(errors);
});

test('judgement rigging revives once before boarding defeat', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_JUDGEMENT_TARGET',
      opponentName: '審判敵',
      disableAi: true,
      playerShipProfile: {
        form: 'boat',
        shipClass: 'boat',
        name: '復帰船',
        level: 1,
        majorArcanaItemIds: ['arcana-20']
      }
    });
    window.__navalBattleDebug.mutate((b) => {
      b.player.hp = 1;
      b.player.facing = 'starboard';
      b.enemy.facing = 'starboard';
    });
    window.__navalBattleDebug.applyCommand('blankShot', 'player');
    window.__navalBattleDebug.applyCommand('broadside', 'enemy');
  });

  const state = await page.evaluate(() => window.__navalBattleDebug.serialize());
  expect(state.finished).toBe(false);
  expect(state.player.hp).toBe(0.5);
  expect(state.player.arcanaGears[0].used).toBe(true);
  expect(state.logs.join('\n')).toContain('復活の号鐘');

  await expectNoPageErrors(errors);
});

test('major arcana element advantage is tracked separately from nation advantage', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  const state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_ARCANA_ELEMENT_TARGET',
      opponentName: '属性敵',
      disableAi: true,
      playerProfile: { nation: 'fire' },
      opponentProfile: { nation: 'wind' },
      playerShipProfile: {
        form: 'merchant',
        shipClass: 'merchant',
        name: '皇砲船',
        majorArcanaItemIds: ['arcana-4']
      },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '風商船' }
    });
    window.__navalBattleDebug.applyCommand('bowCannon', 'player');
    window.__navalBattleDebug.applyCommand('assault', 'enemy');
    return window.__navalBattleDebug.serialize();
  });

  expect(state.enemy.hp).toBe(0);
  expect(state.player.elementAdvantageUsed).toBe(true);
  expect(state.player.arcanaGears[0].used).toBe(true);
  expect(state.player.arcanaGears[0].arcanaElementUsed).toBe(true);
  expect(state.logs.join('\n')).toContain('属性優勢');
  expect(state.logs.join('\n')).toContain('皇砲の大砲架属性優勢');

  await expectNoPageErrors(errors);
});

test('major arcana defensive element can reduce first shot to zero', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  const state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_HIEROPHANT_TARGET',
      opponentName: '地属性敵',
      disableAi: true,
      opponentProfile: { nation: 'earth' },
      playerShipProfile: {
        form: 'merchant',
        shipClass: 'merchant',
        name: '鐘楼船',
        majorArcanaItemIds: ['arcana-5']
      },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '地商船' }
    });
    window.__navalBattleDebug.applyCommand('assault', 'player');
    window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    return window.__navalBattleDebug.serialize();
  });

  expect(state.player.hp).toBe(3);
  expect(state.player.arcanaGears[0].used).toBe(true);
  expect(state.player.arcanaGears[0].arcanaElementUsed).toBe(true);
  expect(state.logs.join('\n')).toContain('誓約の鐘楼属性優勢');

  await expectNoPageErrors(errors);
});

test('lovers and devil rigging synchronize command lock state', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  let state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_LOCK_TARGET',
      opponentName: '拘束敵',
      disableAi: true,
      playerShipProfile: {
        form: 'merchant',
        shipClass: 'merchant',
        name: '絆鎖船',
        majorArcanaItemIds: ['arcana-6']
      },
      opponentShipProfile: { form: 'merchant', shipClass: 'merchant', name: '敵商船' }
    });
    window.__navalBattleDebug.mutate((b) => {
      b.enemy.facing = 'starboard';
    });
    window.__navalBattleDebug.applyCommand('assault', 'player');
    window.__navalBattleDebug.applyCommand('blankShot', 'enemy');
    const snapshot = window.__navalBattleDebug.serialize();
    window.__navalBattleDebug.applySnapshot(snapshot, 'player');
    return window.__navalBattleDebug.serialize();
  });

  expect(state.enemy.arcanaCommandLocks.rudder).toBe(1);
  expect(state.player.arcanaGears[0].used).toBe(true);
  expect(state.logs.join('\n')).toContain('次の面舵/取舵が封じられた');

  state = await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_DEVIL_TARGET',
      opponentName: '封鎖敵',
      disableAi: true,
      playerShipProfile: { form: 'merchant', shipClass: 'merchant', name: '商船' },
      opponentShipProfile: {
        form: 'merchant',
        shipClass: 'merchant',
        name: '黒鎖船',
        majorArcanaItemIds: ['arcana-15']
      }
    });
    window.__navalBattleDebug.mutate((b) => {
      b.enemy.hp = 0;
    });
    window.__navalBattleDebug.applyCommand('boarding', 'player');
    return window.__navalBattleDebug.serialize();
  });

  expect(state.finished).toBe(false);
  expect(state.enemy.arcanaGears[0].used).toBe(true);
  expect(state.logs.join('\n')).toContain('封鎖艤装に止められた');

  await expectNoPageErrors(errors);
});
