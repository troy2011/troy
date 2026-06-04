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
    const copy = document.querySelector('#playerProfileModal .item-detail-copy');
    const firstStat = document.querySelector('#playerProfileStats .player-profile-stat');
    const statsRect = stats?.getBoundingClientRect();
    const avatarRect = avatar?.getBoundingClientRect();
    const copyRect = copy?.getBoundingClientRect();
    const firstStatRect = firstStat?.getBoundingClientRect();
    return {
      statsRight: statsRect?.right || 0,
      avatarLeft: avatarRect?.left || 0,
      avatarRight: avatarRect?.right || 0,
      avatarWidth: avatarRect?.width || 0,
      copyRight: copyRect?.right || 0,
      statHeight: firstStatRect?.height || 0
    };
  });
  expect(layout.avatarLeft).toBeGreaterThan(layout.statsRight);
  expect(layout.avatarRight).toBeGreaterThan(layout.copyRight);
  expect(layout.avatarWidth).toBeGreaterThanOrEqual(130);
  expect(layout.statHeight).toBeLessThanOrEqual(36);
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
      }
    };

    renderAvatar(
      'avatar',
      { Race: 'human', AvatarColor: 'brown' },
      { RightHand: 'sword_001', Armor: 'hat_black_001' },
      items
    );
  });

  await expect(page.locator('#equippedRightHandArt.has-item .equip-slot-item-sprite')).toHaveCount(1);
  await expect(page.locator('#equippedArmorArt.has-item .equip-slot-item-sprite')).toHaveCount(1);
  const headSlotIcon = await page.locator('.armor-slot .equip-slot-icon').evaluate((element) =>
    window.getComputedStyle(element).backgroundImage
  );
  expect(headSlotIcon).toContain('019.png');
  expect(headSlotIcon).not.toContain('073.png');

  const layout = await page.evaluate(() => {
    const slot = document.querySelector('.weapon-slot');
    const content = slot?.querySelector('.equip-slot-content');
    const art = document.getElementById('equippedRightHandArt');
    const contentRect = content?.getBoundingClientRect();
    const artRect = art?.getBoundingClientRect();
    const slotRect = slot?.getBoundingClientRect();
    return {
      contentRight: contentRect?.right || 0,
      artLeft: artRect?.left || 0,
      artRight: artRect?.right || 0,
      slotRight: slotRect?.right || 0
    };
  });

  expect(layout.artLeft).toBeGreaterThan(layout.contentRight);
  expect(layout.slotRight - layout.artRight).toBeLessThan(20);
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
