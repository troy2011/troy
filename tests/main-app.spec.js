const { test, expect } = require('@playwright/test');
const {
  bootstrapMainApp,
  trackPageErrors,
  expectNoPageErrors
} = require('./helpers/main-app-harness');

test('main app boots in limited mode with mocked LIFF login', async ({ page }) => {
  const errors = trackPageErrors(page);
  const state = await bootstrapMainApp(page);

  await expect(page.locator('#appWrapper')).toBeVisible();
  await expect(page.locator('#globalPlayerName')).toHaveText('Playwright Tester');
  await expect(page.locator('#tabContentHome')).toBeVisible();

  expect(state.loginPlayFabBody).toMatchObject({
    lineAccessToken: 'playwright-access-token',
    lineUserId: 'Uplaywright',
    displayName: 'Playwright Tester'
  });

  await expectNoPageErrors(errors);
});

test('home tab replaces HP and MP recovery controls with compact stat chips', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.route('**/api/get-stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        stats: {
          Level: 12,
          ちから: 7,
          みのまもり: 8,
          すばやさ: 9,
          かしこさ: 10
        }
      })
    });
  });
  await bootstrapMainApp(page);

  await page.evaluate(async () => {
    const player = await import('/js/player.js');
    await player.getPlayerStats('PF_PLAYWRIGHT');
  });

  await expect(page.locator('#globalHpBar')).toHaveCount(0);
  await expect(page.locator('#globalMpBar')).toHaveCount(0);
  await expect(page.locator('#btnRecoverHP')).toHaveCount(0);
  await expect(page.locator('#btnRecoverMP')).toHaveCount(0);
  await expect(page.locator('.home-stat-chip b')).toHaveText(['7', '8', '9', '10']);
  await expect(page.locator('.home-transfer-card .home-card-title')).toHaveText('ゴールド管理');
  await expect(page.locator('#btnCoinGoldConvert')).toHaveText('チップ返却');
  const transferUi = await page.evaluate(() => {
    const sendBtn = document.getElementById('btnScanPay');
    const chipBtn = document.getElementById('btnCoinConvert');
    const returnBtn = document.getElementById('btnCoinGoldConvert');
    return {
      sendColor: window.getComputedStyle(sendBtn).color,
      chipColor: window.getComputedStyle(chipBtn).color,
      returnColor: window.getComputedStyle(returnBtn).color,
      chipIcon: window.getComputedStyle(chipBtn, '::before').backgroundImage
    };
  });
  expect(transferUi.sendColor).toBe(transferUi.returnColor);
  expect(transferUi.chipColor).toBe(transferUi.returnColor);
  expect(transferUi.chipIcon).toContain('046.png');
  const homeBackgrounds = await page.evaluate(() => {
    const homeTab = document.getElementById('tabContentHome');
    const heroCard = document.querySelector('.home-hero-card');
    const shipStage = document.getElementById('homeShipStage');
    return {
      tabBackground: window.getComputedStyle(homeTab).backgroundImage,
      heroBackground: window.getComputedStyle(heroCard).backgroundImage,
      heroBackgroundSize: window.getComputedStyle(heroCard).backgroundSize,
      heroBackgroundHeight: window.getComputedStyle(heroCard).getPropertyValue('--home-hero-bg-height').trim(),
      heroBorderImageSource: window.getComputedStyle(heroCard).borderImageSource,
      shipStageBackground: window.getComputedStyle(shipStage, '::before').backgroundImage
    };
  });
  expect(homeBackgrounds.heroBackground).toContain('home-ui-sheet.png');
  expect(homeBackgrounds.heroBackgroundSize).toContain('660px');
  expect(homeBackgrounds.heroBackgroundHeight).toBe('660px');
  expect(homeBackgrounds.heroBorderImageSource).toBe('none');
  expect(homeBackgrounds.tabBackground).not.toContain('bg-sea.png');
  expect(homeBackgrounds.shipStageBackground).not.toContain('bg-sea.png');
  await expectNoPageErrors(errors);
});

test('home exploration button loads exploration data in a popup', async ({ page }) => {
  const errors = trackPageErrors(page);
  let explorationStatusBody = null;
  await page.route('**/api/exploration/status', async (route) => {
    explorationStatusBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ship: { shipId: 'ship-test', shipName: 'テスト船' },
        active: null,
        reports: [],
        destinations: [
          {
            id: 'harbor-edge',
            name: '港の外れ',
            description: '近場の探索',
            cost: 100,
            bossName: 'なし',
            bosses: [
              { id: 'treasure_slime', name: '財宝スライム', spriteId: 'treasure_slime', tier: 'weak', tierLabel: '弱' },
              { id: 'puffer_bomb', name: '爆弾フグ', spriteId: 'puffer_bomb', tier: 'medium', tierLabel: '中' },
              { id: 'mimic_chest', name: '宝箱ミミック', spriteId: 'mimic_chest', tier: 'strong', tierLabel: '強' }
            ]
          }
        ]
      })
    });
  });

  await bootstrapMainApp(page);

  await page.locator('#btnHomeExploration').click();

  const panel = page.locator('#shipExplorationPanel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveClass(/is-popup/);
  await expect(panel.locator('.ship-exploration-head h3')).toHaveText('探索');
  await expect(panel.locator('.ship-exploration-meta').first()).toContainText('テスト船');
  await expect(panel.locator('.ship-exploration-destination strong')).toHaveText('港の外れ');
  await expect(panel.locator('.ship-exploration-destination')).toContainText('弱: 財宝スライム / 中: 爆弾フグ / 強: 宝箱ミミック');
  await expect(panel.locator('.ship-exploration-start')).toHaveText('探索開始');
  expect(explorationStatusBody).toMatchObject({ playFabId: 'PF_PLAYWRIGHT' });

  await panel.locator('[data-home-exploration-close]').click();
  await expect(panel).toBeHidden();
  await expectNoPageErrors(errors);
});

test('exploration event overlays use sliced panels and no moving grid', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  const audit = await page.evaluate(async () => {
    document.querySelectorAll('.exploration-sequence-overlay, .exploration-result-overlay').forEach((element) => element.remove());

    const sequence = document.createElement('div');
    sequence.className = 'exploration-sequence-overlay is-boat is-sky-deep is-sail';
    sequence.innerHTML = `
      <div class="exploration-sequence-dialog">
        <div class="exploration-sequence-scene">
          <div class="exploration-sequence-sky"></div>
          <div class="exploration-sequence-horizon"></div>
          <div class="exploration-sequence-route"></div>
          <div class="exploration-sequence-arrival"></div>
          <div class="exploration-sequence-island">🏝️</div>
          <div class="exploration-sequence-ship is-boat"></div>
          <div class="exploration-sequence-chests"><span class="exploration-sequence-mini-chest"></span></div>
          <div class="exploration-sequence-log"><div>log</div></div>
        </div>
      </div>
    `;
    document.body.appendChild(sequence);

    const result = document.createElement('div');
    result.className = 'exploration-result-overlay is-opened';
    result.innerHTML = `
      <div class="exploration-result-dialog">
        <button type="button" class="exploration-result-close">×</button>
        <div class="exploration-result-head"><span>勝利</span><strong>result</strong><small>1個のお宝を回収</small></div>
        <div class="exploration-result-showcase">
          <button type="button" class="exploration-result-chest-button"><span class="exploration-result-chest has-rewards"></span></button>
          <div class="exploration-result-prompt"><b>回収完了</b><span>clear</span></div>
        </div>
        <div class="exploration-result-details">
          <div class="exploration-result-boss-card">
            <div class="exploration-result-boss-art"><img class="exploration-boss-image exploration-result-boss-image" src="./Sprites/monsters/ghost_pirate.png" alt="boss"></div>
            <div class="exploration-result-boss-copy"><b>BOSS</b><strong>clear</strong><span>勝利</span></div>
          </div>
          <div class="exploration-result-body"><div><b>結果</b><span>clear</span></div></div>
          <ul class="exploration-result-rewards"><li class="exploration-result-reward is-rare"><span class="exploration-result-reward-icon"></span><strong>reward</strong><span>x1</span></li></ul>
          <div class="exploration-result-log"><div>battle log</div></div>
          <div class="exploration-result-actions"><button type="button">close</button><button type="button">next</button></div>
        </div>
      </div>
    `;
    document.body.appendChild(result);

    const styleOf = (selector) => {
      const element = document.querySelector(selector);
      const style = window.getComputedStyle(element);
      return {
        animationName: style.animationName,
        backgroundImage: style.backgroundImage,
        borderImageSource: style.borderImageSource,
        borderRadius: style.borderRadius,
        display: style.display,
        height: style.height,
        minHeight: style.minHeight,
        opacity: style.opacity,
        overflowX: style.overflowX,
        pointerEvents: style.pointerEvents
      };
    };

    const shipElement = sequence.querySelector('.exploration-sequence-ship');
    const sailAnimationName = window.getComputedStyle(shipElement).animationName;
    const shipSamples = [];
    for (let index = 0; index < 5; index += 1) {
      const rect = shipElement.getBoundingClientRect();
      const style = window.getComputedStyle(shipElement);
      shipSamples.push({
        backgroundPosition: style.backgroundPosition,
        left: rect.left,
        top: rect.top
      });
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const shipMotionDelta = shipSamples[shipSamples.length - 1].left - shipSamples[0].left;
    const shipTopValues = shipSamples.map((sample) => sample.top);
    const shipVerticalDelta = Math.max(...shipTopValues) - Math.min(...shipTopValues);
    const shipFrameCount = new Set(shipSamples.map((sample) => sample.backgroundPosition)).size;
    sequence.className = 'exploration-sequence-overlay is-boat is-sky-deep is-treasure';
    const treasureAnimationName = window.getComputedStyle(shipElement).animationName;
    const openedDetails = styleOf('.exploration-result-details');
    result.className = 'exploration-result-overlay is-awaiting-open';
    await new Promise((resolve) => setTimeout(resolve, 360));
    const awaitingDetails = styleOf('.exploration-result-details');

    const output = {
      sequenceDialog: styleOf('.exploration-sequence-dialog'),
      sequenceScene: styleOf('.exploration-sequence-scene'),
      sequenceSky: styleOf('.exploration-sequence-sky'),
      sequenceRoute: styleOf('.exploration-sequence-route'),
      sequenceArrival: styleOf('.exploration-sequence-arrival'),
      sequenceLog: styleOf('.exploration-sequence-log div'),
      resultDialog: styleOf('.exploration-result-dialog'),
      resultClose: styleOf('.exploration-result-close'),
      resultShowcase: styleOf('.exploration-result-showcase'),
      resultBossCard: styleOf('.exploration-result-boss-card'),
      resultBossImage: styleOf('.exploration-result-boss-image'),
      resultDetailsOpened: openedDetails,
      resultDetailsAwaiting: awaitingDetails,
      resultMetric: styleOf('.exploration-result-body div'),
      resultReward: styleOf('.exploration-result-rewards li'),
      resultLog: styleOf('.exploration-result-log div'),
      sailAnimationName,
      shipFrameCount,
      shipMotionDelta,
      shipVerticalDelta,
      treasureAnimationName
    };

    sequence.remove();
    result.remove();
    return output;
  });

  expect(audit.sequenceDialog.borderImageSource).toContain('assets/ui/panels/');
  expect(audit.sequenceScene.borderImageSource).toContain('assets/ui/panels/');
  expect(audit.sequenceLog.borderImageSource).toContain('assets/ui/panels/');
  expect(audit.sequenceRoute.animationName).toBe('none');
  expect(audit.sequenceRoute.backgroundImage).not.toContain('repeating-linear-gradient');
  expect(audit.sequenceArrival.borderRadius).toBe('50%');
  expect(audit.resultDialog.borderImageSource).toContain('assets/ui/panels/');
  expect(audit.resultDialog.overflowX).toBe('hidden');
  expect(audit.resultShowcase.borderImageSource).toContain('assets/ui/panels/');
  expect(audit.resultBossCard.borderImageSource).toContain('assets/ui/panels/');
  expect(audit.resultBossImage.height).not.toBe('0px');
  expect(audit.resultDetailsOpened.opacity).toBe('1');
  expect(audit.resultDetailsAwaiting.opacity).toBe('0');
  expect(audit.resultDetailsAwaiting.pointerEvents).toBe('none');
  expect(audit.resultMetric.borderImageSource).toContain('assets/ui/panels/');
  expect(audit.resultReward.borderImageSource).toContain('assets/ui/panels/');
  expect(audit.resultLog.borderImageSource).toContain('assets/ui/panels/');
  expect(audit.sequenceSky.display).toBe('none');
  expect(audit.sequenceSky.animationName).toBe('none');
  expect(audit.sequenceSky.backgroundImage).toBe('none');
  expect(audit.sailAnimationName).toContain('explorationSequenceSail');
  expect(audit.sailAnimationName).toContain('homePlayerShipFrameStep');
  expect(Math.abs(audit.shipMotionDelta)).toBeGreaterThan(2);
  expect(Math.abs(audit.shipVerticalDelta)).toBeLessThanOrEqual(1);
  expect(audit.shipFrameCount).toBeGreaterThanOrEqual(2);
  expect(audit.treasureAnimationName).toContain('homePlayerShipFrameStep');
  expect(audit.treasureAnimationName).not.toContain('explorationSequenceTreasureShip');
  expect(audit.resultClose.height).toBe('32px');
  expect(audit.resultClose.minHeight).toBe('32px');
  expect(audit.resultClose.borderRadius).toBe('50%');
  await expectNoPageErrors(errors);
});

test('exploration result reveals details after opening one chest', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.route('**/api/get-ranking', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ranking: [{ displayName: 'Playwright Tester', score: 9000, level: 18, rank: '船長', playFabId: 'PF_PLAYWRIGHT' }] })
    });
  });
  await page.route('**/api/exploration/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ship: { shipId: 'ship-test', shipName: 'テスト船', form: 'fighter' },
        active: null,
        reports: [],
        destinations: [{ id: 'harbor-edge', name: '港の外れ', description: '近場の探索', cost: 100, bossName: '海霧の番人' }]
      })
    });
  });
  await page.route('**/api/exploration/start', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        balance: 9000,
        ship: { shipId: 'ship-test', shipName: 'テスト船', form: 'fighter' },
        active: { destinationId: 'harbor-edge', destinationName: '港の外れ', shipName: 'テスト船' },
        reports: [],
        destinations: []
      })
    });
  });
  await page.route('**/api/exploration/claim', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ship: { shipId: 'ship-test', shipName: 'テスト船', form: 'fighter' },
        active: null,
        reports: [],
        report: {
          destinationId: 'harbor-edge',
          destinationName: '港の外れ',
          bossId: 'ghost_pirate',
          bossName: '海霧の番人',
          bossSpriteId: 'ghost_pirate',
          bossTier: 'strong',
          bossTierLabel: '強',
          bossResult: 'victory',
          rewardCount: 2,
          rewardItems: [{ itemId: 'mist_blade', displayName: '霧切りの刃', rarity: 'rare', quantity: 2 }],
          bossLog: '戦闘開始\n船が島へ接近。\n宝箱を発見した。'
        }
      })
    });
  });

  await bootstrapMainApp(page, { fixedHour: 18 });
  await page.locator('#btnHomeExploration').click();
  await page.locator('#shipExplorationPanel').waitFor({ state: 'visible' });
  await page.locator('.ship-exploration-start').click();

  const result = page.locator('.exploration-result-overlay');
  await expect(result).toHaveClass(/is-awaiting-open/, { timeout: 15_000 });
  await expect(result.locator('.exploration-result-details')).toHaveCSS('opacity', '0');
  await expect(result.locator('.exploration-result-reward')).toContainText('霧切りの刃');
  await expect(result.locator('[data-exploration-result-state]')).toHaveText('宝箱を発見');
  expect(await result.locator('.exploration-result-dialog').evaluate((element) => getComputedStyle(element).overflowX)).toBe('hidden');

  await result.locator('[data-exploration-result-open]').click();
  await expect(result).toHaveClass(/is-opened/, { timeout: 3_000 });
  await expect(result).not.toHaveClass(/is-awaiting-open/);
  await expect(result.locator('[data-exploration-result-state]')).toHaveText('勝利');
  await expect(result.locator('.exploration-result-details')).toHaveCSS('opacity', '1');
  await expect(result.locator('.exploration-result-boss-card')).toHaveAttribute('data-exploration-boss-id', 'ghost_pirate');
  await expect(result.locator('.exploration-result-boss-image')).toHaveAttribute('src', /Sprites\/monsters\/ghost_pirate\.png/);
  await expect(result.locator('.exploration-result-boss-image')).toHaveAttribute('alt', '海霧の番人');
  await expect(result.locator('.exploration-result-boss-copy span')).toHaveText('強BOSS / 勝利');
  await expect(result.locator('.exploration-result-reward')).toContainText('RARE×2');
  await expect(result.locator('.exploration-result-chest')).toHaveCSS('animation-name', 'none');
  await expectNoPageErrors(errors);
});

test('player profile shows public stats on the left with avatar on the right', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.route('**/api/get-player-public-profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        profile: {
          playFabId: 'PF_OTHER',
          displayName: 'Other Player',
          nation: 'water',
          level: 18,
          stats: {
            Level: 18,
            ちから: 12,
            みのまもり: 11,
            すばやさ: 10,
            かしこさ: 9
          },
          avatarBase: {
            Race: 'human',
            Nation: 'water',
            AvatarColor: 'blue',
            level: 18
          },
          playerShip: {
            form: 'explorer',
            stage: 2
          },
          equipment: {},
          itemSource: {},
          equipmentList: []
        }
      })
    });
  });
  await bootstrapMainApp(page);

  await page.evaluate(async () => {
    const profile = await import('/js/playerProfile.js');
    await profile.openPlayerProfile('PF_OTHER');
  });

  await expect(page.locator('#playerProfileModal')).toBeVisible();
  await expect(page.locator('#playerProfileStats .player-profile-stat strong')).toHaveText(['12', '11', '10', '9']);
  const layout = await page.evaluate(() => {
    const stats = document.getElementById('playerProfileStats');
    const avatar = document.querySelector('#playerProfileModal .player-profile-avatar-shell');
    const avatarInner = document.getElementById('playerProfileAvatar');
    const ship = document.querySelector('#playerProfileModal .player-profile-ship');
    const copy = document.querySelector('#playerProfileModal .item-detail-copy');
    const firstStat = document.querySelector('#playerProfileStats .player-profile-stat');
    const statsRect = stats?.getBoundingClientRect();
    const avatarRect = avatar?.getBoundingClientRect();
    const avatarInnerRect = avatarInner?.getBoundingClientRect();
    const shipRect = ship?.getBoundingClientRect();
    const copyRect = copy?.getBoundingClientRect();
    const firstStatRect = firstStat?.getBoundingClientRect();
    return {
      statsRight: statsRect?.right || 0,
      avatarLeft: avatarRect?.left || 0,
      avatarRight: avatarRect?.right || 0,
      avatarBottom: avatarRect?.bottom || 0,
      avatarWidth: avatarRect?.width || 0,
      avatarCenterDelta: Math.abs(
        ((avatarInnerRect?.left || 0) + (avatarInnerRect?.width || 0) / 2)
        - ((avatarRect?.left || 0) + (avatarRect?.width || 0) / 2)
      ),
      copyRight: copyRect?.right || 0,
      shipTop: shipRect?.top || 0,
      shipLeft: shipRect?.left || 0,
      shipRight: shipRect?.right || 0,
      statHeight: firstStatRect?.height || 0
    };
  });
  expect(layout.avatarLeft).toBeGreaterThan(layout.statsRight);
  expect(layout.avatarRight).toBeGreaterThan(layout.copyRight);
  expect(layout.shipTop).toBeGreaterThan(layout.avatarBottom);
  expect(Math.abs(layout.shipLeft - layout.avatarLeft)).toBeLessThanOrEqual(2);
  expect(Math.abs(layout.shipRight - layout.avatarRight)).toBeLessThanOrEqual(2);
  expect(layout.avatarWidth).toBeGreaterThanOrEqual(130);
  expect(layout.avatarCenterDelta).toBeLessThanOrEqual(6);
  expect(layout.statHeight).toBeLessThanOrEqual(36);
  await expectNoPageErrors(errors);
});

test('panel frame assets are applied through border-image slices', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await expect(page.locator('#tabContentEvents #btnReloadEvents')).toHaveCount(0);

  const audit = await page.evaluate(() => {
    const selectors = [
      '#globalPlayerInfoTop',
      '.home-exp-card',
      '.home-ps-card',
      '#bottomNav',
      '.nav-button',
      '#rankingToggleButtons',
      '#tabContentInventory .inventory-section',
      '#tabContentInventory .avatar-style-panel',
      '#tabContentInventory .equip-slot',
      '#tabContentEvents .event-list-panel',
      '#tabContentEvents .event-card',
      '#tabContentQr .guild-card'
    ];
    return selectors
      .map((selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const style = window.getComputedStyle(element);
        return {
          selector,
          backgroundImage: style.backgroundImage,
          borderImageSource: style.borderImageSource
        };
      })
      .filter(Boolean);
  });

  expect(audit.length).toBeGreaterThanOrEqual(8);
  expect(audit.filter((entry) => /assets\/ui\/panels\//.test(entry.backgroundImage))).toEqual([]);
  expect(audit.filter((entry) => !/assets\/ui\/panels\//.test(entry.borderImageSource))).toEqual([]);
  await expectNoPageErrors(errors);
});

test('king can found a nation guild from companions regardless of level', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.route('**/api/get-stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        stats: { Level: 3 },
        isKing: true,
        nation: 'fire'
      })
    });
  });
  await page.route('**/api/crew-recruitment/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ posts: [] })
    });
  });
  await bootstrapMainApp(page);
  await page.unroute('**/api/get-guild-info');
  await page.route('**/api/get-guild-info', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ guild: null })
    });
  });

  await page.evaluate(() => {
    window.myAvatarBaseInfo = {
      ...(window.myAvatarBaseInfo || {}),
      Nation: 'fire',
      level: 3,
      isKing: true
    };
  });
  await page.evaluate(async () => {
    const events = await import('/js/events.js');
    await events.loadEventPage('PF_PLAYWRIGHT');
  });

  await expect(page.locator('#crewRankSummary')).toContainText('Lv.3 王 / 国ギルド勧誘可');
  await expect(page.locator('#crewOverviewList .event-card')).toContainText('王権限');
  await expect(page.locator('#crewOverviewList .event-card')).toContainText('国のギルドを設立できます');
  await expect(page.locator('#eventHostFeeInfo')).toContainText('王はレベルに関係なく国ギルドを設立できます。');
  await expect(page.locator('#crewCreatePreview')).toHaveText('火の国ギルド を設立します。');
  await expect(page.locator('#btnCreateCrew')).toBeEnabled();
  await expect(page.locator('#btnCreateCrew')).toHaveText('10,000Gで国ギルドを設立');
  await expect(page.locator('#crewOverviewList .event-card')).not.toContainText('Lv.21');
  await expectNoPageErrors(errors);
});

test('current equipment slots render equipped item sprites on the right edge', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(async () => {
    const inventoryTab = document.getElementById('tabContentInventory');
    if (inventoryTab) inventoryTab.style.display = 'block';

    const { renderAvatar } = await import('/js/avatar.js');
    const items = {
      sword_001: {
        itemId: 'sword_001',
        name: 'Test Sword',
        customData: {
          Category: 'Weapon',
          sprite_path: './Sprites/weapons/melee weapons/sword.png',
          sprite_index: '1',
          sprite_w: '32',
          sprite_h: '32',
          Atk: '5'
        }
      },
      hat_black_001: {
        itemId: 'hat_black_001',
        name: 'Test Helm',
        customData: {
          Category: 'Armor',
          sprite_path: './Sprites/wardrobe/cloth/hat_black.png',
          sprite_index: '0',
          sprite_w: '32',
          sprite_h: '32',
          Def: '2'
        }
      },
      shield_001: {
        itemId: 'shield_001',
        name: 'Test Shield',
        customData: {
          Category: 'Shield',
          sprite_path: './Sprites/weapons/melee weapons/shield.png',
          sprite_index: '2',
          sprite_w: '32',
          sprite_h: '32',
          Def: '3'
        }
      },
      accessory_001: {
        itemId: 'accessory_001',
        name: 'Test Ring',
        customData: {
          Category: 'Accessory',
          sprite_path: './Sprites/items/icons.png',
          sprite_index: '8',
          sprite_w: '16',
          sprite_h: '16',
          Int: '1'
        }
      }
    };

    renderAvatar(
      'avatar',
      { Race: 'human', AvatarColor: 'brown' },
      { RightHand: 'sword_001', LeftHand: 'shield_001', Armor: 'hat_black_001', Accessory: 'accessory_001' },
      items
    );

    const inventory = await import('/js/inventory.js');
    inventory.switchInventoryGroup('Equipment', { panel: 'items' });
  });

  await expect(page.locator('#avatarStylePanel')).toBeVisible();
  await expect(page.locator('#btnRandomHaircut')).toContainText('100G');
  await expect(page.locator('#btnRandomSkin')).toContainText('300G');
  await expect(page.locator('#btnRandomFace')).toContainText('800G');
  await expect(page.locator('#equippedRightHandArt.has-item .equip-slot-item-sprite')).toHaveCount(1);
  await expect(page.locator('#equippedLeftHandArt.has-item .equip-slot-item-sprite')).toHaveCount(1);
  await expect(page.locator('#equippedArmorArt.has-item .equip-slot-item-sprite')).toHaveCount(1);
  await expect(page.locator('#equippedAccessoryArt.has-item .equip-slot-item-sprite')).toHaveCount(1);
  const slotIcons = await page.evaluate(() => ({
    head: window.getComputedStyle(document.querySelector('.armor-slot .equip-slot-icon')).backgroundImage,
    right: window.getComputedStyle(document.querySelector('.weapon-slot .equip-slot-icon')).backgroundImage,
    left: window.getComputedStyle(document.querySelector('.shield-slot .equip-slot-icon')).backgroundImage,
    accessory: window.getComputedStyle(document.querySelector('.accessory-slot .equip-slot-icon')).backgroundImage
  }));
  expect(slotIcons.head).toContain('032.png');
  expect(slotIcons.right).toContain('033.png');
  expect(slotIcons.left).toContain('026.png');
  expect(slotIcons.accessory).toContain('028.png');

  const layout = await page.evaluate(() => {
    const slot = document.querySelector('.weapon-slot');
    const stylePanel = document.getElementById('avatarStylePanel');
    const content = slot?.querySelector('.equip-slot-content');
    const art = document.getElementById('equippedRightHandArt');
    const sprite = art?.querySelector('.equip-slot-item-sprite');
    const panelStyle = stylePanel ? window.getComputedStyle(stylePanel) : null;
    const contentRect = content?.getBoundingClientRect();
    const artRect = art?.getBoundingClientRect();
    const spriteRect = sprite?.getBoundingClientRect();
    const slotRect = slot?.getBoundingClientRect();
    return {
      stylePanelDisplay: panelStyle?.display || '',
      stylePanelBorderImage: panelStyle?.borderImageSource || '',
      contentRight: contentRect?.right || 0,
      artLeft: artRect?.left || 0,
      artRight: artRect?.right || 0,
      artWidth: artRect?.width || 0,
      artHeight: artRect?.height || 0,
      artCenterX: artRect ? artRect.left + artRect.width / 2 : 0,
      artCenterY: artRect ? artRect.top + artRect.height / 2 : 0,
      spriteWidth: spriteRect?.width || 0,
      spriteHeight: spriteRect?.height || 0,
      spriteCenterX: spriteRect ? spriteRect.left + spriteRect.width / 2 : 0,
      spriteCenterY: spriteRect ? spriteRect.top + spriteRect.height / 2 : 0,
      slotRight: slotRect?.right || 0
    };
  });

  expect(layout.stylePanelDisplay).not.toBe('none');
  expect(layout.stylePanelBorderImage).toContain('panel-sheet-frame.png');
  expect(layout.artLeft).toBeGreaterThan(layout.contentRight);
  expect(layout.slotRight - layout.artRight).toBeLessThan(20);
  expect(layout.artWidth).toBeGreaterThanOrEqual(52);
  expect(layout.artHeight).toBeGreaterThanOrEqual(52);
  expect(Math.max(layout.spriteWidth, layout.spriteHeight)).toBeGreaterThanOrEqual(48);
  expect(Math.abs(layout.spriteCenterX - layout.artCenterX)).toBeLessThanOrEqual(2);
  expect(Math.abs(layout.spriteCenterY - layout.artCenterY)).toBeLessThanOrEqual(2);
  await expectNoPageErrors(errors);
});

test('tarot deck and list show suit-colored number badges at the lower left', async ({ page }) => {
  const errors = trackPageErrors(page);
  const tarotItems = [
    {
      itemId: 'tarot_minor_wand_7',
      name: 'Wand Seven',
      customData: { Category: 'TarotMinor', ArcanaSuit: 'wand', ArcanaRank: '7', CardNumber: '7' }
    },
    {
      itemId: 'tarot_minor_pentacle_3',
      name: 'Pentacle Three',
      customData: { Category: 'TarotMinor', ArcanaSuit: 'pentacle', ArcanaRank: '3', CardNumber: '3' }
    },
    {
      itemId: 'tarot_minor_sword_9',
      name: 'Sword Nine',
      customData: { Category: 'TarotMinor', ArcanaSuit: 'sword', ArcanaRank: '9', CardNumber: '9' }
    },
    {
      itemId: 'tarot_minor_cup_10',
      name: 'Cup Ten',
      customData: { Category: 'TarotMinor', ArcanaSuit: 'cup', ArcanaRank: '10', CardNumber: '10' }
    },
    {
      itemId: 'tarot_major_sword_5',
      name: 'Major Five',
      customData: { Category: 'TarotMajor', ArcanaNumber: '5', CardNumber: '5', ArcanaRole: 'Sword Core' }
    }
  ];

  await page.route('**/api/get-inventory', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        inventory: tarotItems,
        virtualCurrency: { PS: 0 },
        contribution: 0
      })
    });
  });
  await page.route('**/api/tarot-deck-get', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ok: true,
        tarotDeck: ['tarot_major_sword_5', 'tarot_minor_cup_10'],
        tarotRole: null
      })
    });
  });
  await page.route('**/api/get-equipment', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ equipment: {} })
    });
  });
  await page.route('**/api/cards', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ cards: [] })
    });
  });

  await bootstrapMainApp(page);

  await page.evaluate(async () => {
    const inventoryTab = document.getElementById('tabContentInventory');
    if (inventoryTab) inventoryTab.style.display = 'block';
    const inventory = await import('/js/inventory.js');
    await inventory.getInventory('PF_PLAYWRIGHT', { force: true });
    inventory.switchInventoryGroup('Tarot');
    inventory.switchInventoryTab('TarotMinor');
  });

  await expect(page.locator('#inventoryGrid .tarot-number-badge')).toHaveCount(4);
  await expect(page.locator('#inventoryGrid .tarot-number-badge.is-wand')).toHaveText('7');
  await expect(page.locator('#inventoryGrid .tarot-number-badge.is-pentacle')).toHaveText('3');
  await expect(page.locator('#inventoryGrid .tarot-number-badge.is-sword')).toHaveText('9');
  await expect(page.locator('#inventoryGrid .tarot-number-badge.is-cup')).toHaveText('10');
  await expect(page.locator('#meleeDeckGrid .tarot-loadout-visual .tarot-number-badge.is-sword')).toHaveText('5');
  await expect(page.locator('#meleeDeckGrid .tarot-loadout-visual .tarot-number-badge.is-cup')).toHaveText('10');

  const badgeStyles = await page.evaluate(() => {
    const read = (selector) => {
      const badge = document.querySelector(selector);
      return badge ? window.getComputedStyle(badge).color : '';
    };
    return {
      wand: read('#inventoryGrid .tarot-number-badge.is-wand'),
      pentacle: read('#inventoryGrid .tarot-number-badge.is-pentacle'),
      sword: read('#inventoryGrid .tarot-number-badge.is-sword'),
      cup: read('#inventoryGrid .tarot-number-badge.is-cup')
    };
  });
  expect(badgeStyles).toEqual({
    wand: 'rgb(240, 162, 160)',
    pentacle: 'rgb(158, 215, 164)',
    sword: 'rgb(234, 213, 109)',
    cup: 'rgb(143, 188, 239)'
  });

  const badgePosition = await page.locator('#inventoryGrid .tarot-number-badge.is-wand').evaluate((badge) => {
    const frame = badge.closest('.inventory-item-icon-frame');
    const badgeRect = badge.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    return {
      leftOffset: badgeRect.left - frameRect.left,
      bottomOffset: frameRect.bottom - badgeRect.bottom
    };
  });
  expect(badgePosition.leftOffset).toBeLessThan(8);
  expect(badgePosition.bottomOffset).toBeLessThan(8);
  await expectNoPageErrors(errors);
});
