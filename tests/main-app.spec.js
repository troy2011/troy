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
            bossName: 'なし'
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
  await expect(panel.locator('.ship-exploration-start')).toHaveText('探索開始');
  expect(explorationStatusBody).toMatchObject({ playFabId: 'PF_PLAYWRIGHT' });

  await panel.locator('[data-home-exploration-close]').click();
  await expect(panel).toBeHidden();
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
  });

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
    const content = slot?.querySelector('.equip-slot-content');
    const art = document.getElementById('equippedRightHandArt');
    const sprite = art?.querySelector('.equip-slot-item-sprite');
    const contentRect = content?.getBoundingClientRect();
    const artRect = art?.getBoundingClientRect();
    const spriteRect = sprite?.getBoundingClientRect();
    const slotRect = slot?.getBoundingClientRect();
    return {
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
