const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  bootstrapMainApp,
  trackPageErrors,
  expectNoPageErrors
} = require('./helpers/main-app-harness');

test('approved home v3 composition keeps five tabs, king shortcut, and existing ship sprites', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.setViewportSize({ width: 390, height: 698 });
  await page.route('**/api/player-ship/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        ship: {
          form: 'guild',
          name: '火の王の船',
          shipOwnerPlayFabId: 'PF_PLAYWRIGHT',
          isSharedShip: false,
          isGuildShip: true,
          isNationGuild: true,
          guildId: 'guild-fire',
          guildName: '火の国ギルド',
          captainName: '火の王',
          kingShipName: '火の王の船',
          guildShipId: 'guild_ship_guild-fire',
          appearance: { color: 'red' },
          sailColor: 'red',
          upgradeOptions: [],
          upgradeCosts: {}
        }
      })
    });
  });
  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    const ship = await import('/js/ship.js');
    await ship.loadPlayerShipProfile('PF_PLAYWRIGHT');
    window.myAvatarBaseInfo = {
      ...(window.myAvatarBaseInfo || {}),
      Race: 'Human',
      AvatarColor: 'red',
      SkinColorIndex: 1,
      FaceIndex: 1,
      HairStyleIndex: 1,
      FacialHairStyleIndex: 1,
      level: 21
    };
    const { preloadAvatarBaseSprites, renderAvatar } = await import('/js/avatar.js');
    preloadAvatarBaseSprites(window.myAvatarBaseInfo);
    renderAvatar('home-avatar', window.myAvatarBaseInfo, {}, {}, false);
  });
  await expect.poll(async () => page.locator('#home-avatar-layer-body').evaluate((layer) => (
    getComputedStyle(layer).backgroundImage
  ))).toContain('body_red.png');

  await expect(page.locator('body')).toHaveClass(/home-v3/);
  await expect(page.locator('.currency-display')).toBeHidden();
  await expect(page.locator('#navKing')).toHaveCount(0);
  await expect(page.locator('#btnHomeKing')).toBeVisible();
  await expect(page.locator('#btnHomeKing img')).toHaveAttribute('src', 'assets/ui/icons/nav-king-framed.png');
  await expect.poll(async () => page.locator('#btnHomeKing img').evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.home-exp-rank')).not.toContainText('階級');
  await expect(page.locator('#homeExpRank')).toHaveText('見習い');

  const visibleNavIds = await page.locator('#bottomNav .nav-button').evaluateAll((buttons) => (
    buttons
      .filter((button) => getComputedStyle(button).display !== 'none')
      .map((button) => button.id)
  ));
  expect(visibleNavIds).toEqual([
    'navHome',
    'navTroy',
    'navCompanions',
    'navInventory',
    'navRanking'
  ]);

  const homeVisuals = await page.locator('#tabContentHome').evaluate((home) => {
    const backgroundImage = (selector) => getComputedStyle(home.querySelector(selector)).backgroundImage;
    const shipIcon = home.querySelector('.home-player-ship-icon');
    const shipLayer = home.querySelector('.home-guild-ship-layer');
    return {
      header: getComputedStyle(document.getElementById('globalStatusBar')).backgroundImage,
      currency: backgroundImage('.home-ps-card'),
      stage: backgroundImage('.home-ship-bob'),
      rank: backgroundImage('.home-exp-card'),
      rankBackgroundSize: getComputedStyle(home.querySelector('.home-exp-card')).backgroundSize,
      ship: shipLayer ? getComputedStyle(shipLayer).backgroundImage : getComputedStyle(shipIcon).backgroundImage,
      activeNav: getComputedStyle(document.getElementById('navHome')).borderImageSource,
      pedestalCount: home.querySelectorAll('.home-figure-pedestal').length,
      statChip: (() => {
        const style = getComputedStyle(home.querySelector('.home-stat-chip'));
        return {
          borderWidth: style.borderTopWidth,
          backgroundImage: style.backgroundImage,
          backgroundColor: style.backgroundColor
        };
      })()
    };
  });

  expect(homeVisuals.header).toContain('header-luxury.webp');
  expect(homeVisuals.currency).toContain('panel-currency-parchment.webp');
  expect(homeVisuals.stage).toContain('hero-navigator-stage.webp');
  expect(homeVisuals.rank).toContain('panel-rank-stats.webp');
  expect(homeVisuals.rankBackgroundSize).toBe('100%');
  expect(homeVisuals.ship).toMatch(/Sprites\/Ships\/(guildShips|ships)\.png/);
  expect(homeVisuals.activeNav).toContain('nav-slot-active.webp');
  expect(homeVisuals.pedestalCount).toBe(3);
  expect(homeVisuals.statChip).toEqual({
    borderWidth: '0px',
    backgroundImage: 'none',
    backgroundColor: 'rgba(0, 0, 0, 0)'
  });

  await page.locator('#navInventory').click();
  await expect(page.locator('#tabContentInventory')).toBeVisible();
  await expect(page.locator('#navInventory')).toHaveClass(/active/);
  await page.locator('#navHome').click();
  await expect(page.locator('#tabContentHome')).toBeVisible();
  await expect(page.locator('#navHome')).toHaveClass(/active/);

  const alignment = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const centerX = (box) => box.left + (box.width / 2);
    const header = rect('#globalStatusBar');
    const currency = rect('.home-ps-card');
    const stage = rect('.home-ship-bob');
    const ship = rect('.home-player-ship-icon');
    const avatar = rect('.home-ship-avatar');
    const shipPedestal = rect('.home-figure-pedestal-ship');
    const avatarPedestal = rect('.home-figure-pedestal-avatar');
    const nav = rect('#bottomNav');
    const title = rect('.app-title-plaque strong');
    const subtitle = rect('.app-title-plaque span');
    const actions = rect('.home-exp-actions');
    const playerInfo = rect('#globalPlayerInfoTop');
    const shipPedestalRect = rect('.home-figure-pedestal-ship');
    const avatarPedestalRect = rect('.home-figure-pedestal-avatar');
    const moneyBag = rect('.home-ps-icon');
    const specialtyIcon = rect('.home-specialty-chip span');
    const rankLabel = rect('.home-exp-rank span');
    const expValues = rect('.home-exp-values');
    const statPanel = rect('.home-stat-panel');
    const firstStat = rect('.home-stat-chip:first-child');
    const hpStat = rect('.home-stat-chip-hp');
    const exploreButton = rect('#btnHomeExploration');
    const fortuneButton = rect('#btnDailyFortune');
    const navButton = rect('#navHome');
    const navIcon = rect('#navHome .nav-icon');
    return {
      headerCurrencyGap: currency.top - header.bottom,
      header: { top: header.top, bottom: header.bottom, height: header.height },
      currency: { top: currency.top, bottom: currency.bottom, height: currency.height },
      stage: { top: stage.top, bottom: stage.bottom, height: stage.height },
      title: { left: title.left, right: title.right, top: title.top, bottom: title.bottom },
      subtitle: { left: subtitle.left, right: subtitle.right, top: subtitle.top, bottom: subtitle.bottom },
      playerInfo: { left: playerInfo.left, right: playerInfo.right, top: playerInfo.top, bottom: playerInfo.bottom },
      actions: { top: actions.top, bottom: actions.bottom, height: actions.height },
      figures: {
        ship: { top: ship.top, bottom: ship.bottom },
        avatar: { top: avatar.top, bottom: avatar.bottom },
        shipPedestal: { top: shipPedestalRect.top, bottom: shipPedestalRect.bottom },
        avatarPedestal: { top: avatarPedestalRect.top, bottom: avatarPedestalRect.bottom }
      },
      moneyBag: { top: moneyBag.top, bottom: moneyBag.bottom, width: moneyBag.width, height: moneyBag.height },
      specialtyIcon: { width: specialtyIcon.width, height: specialtyIcon.height },
      rankLabel: {
        left: rankLabel.left,
        right: rankLabel.right,
        top: rankLabel.top,
        bottom: rankLabel.bottom
      },
      expValues: { top: expValues.top, bottom: expValues.bottom },
      statPanel: {
        left: statPanel.left,
        right: statPanel.right,
        top: statPanel.top,
        bottom: statPanel.bottom
      },
      statWidths: { first: firstStat.width, hp: hpStat.width },
      exploreButton: {
        left: exploreButton.left,
        top: exploreButton.top,
        width: exploreButton.width,
        height: exploreButton.height
      },
      fortuneButton: {
        left: fortuneButton.left,
        top: fortuneButton.top,
        width: fortuneButton.width,
        height: fortuneButton.height
      },
      stageHeight: stage.height,
      shipPedestalOffset: Math.abs(centerX(ship) - centerX(shipPedestal)),
      avatarPedestalOffset: Math.abs(centerX(avatar) - centerX(avatarPedestal)),
      figureCenterGap: centerX(avatar) - centerX(ship),
      nav: { top: nav.top, bottom: nav.bottom, height: nav.height },
      navButton: { top: navButton.top, bottom: navButton.bottom, height: navButton.height },
      navIcon: { width: navIcon.width, height: navIcon.height },
      navHeight: nav.height
    };
  });
  expect(alignment.headerCurrencyGap).toBeLessThanOrEqual(20);
  expect(alignment.stageHeight).toBeGreaterThanOrEqual(205);
  expect(alignment.shipPedestalOffset).toBeLessThanOrEqual(18);
  expect(alignment.avatarPedestalOffset).toBeLessThanOrEqual(8);
  expect(alignment.figureCenterGap).toBeGreaterThanOrEqual(80);
  expect(alignment.navHeight).toBeGreaterThanOrEqual(52);
  expect(alignment.navHeight).toBeLessThanOrEqual(62);
  expect(alignment.title.left).toBeGreaterThanOrEqual(137);
  expect(alignment.title.left).toBeLessThanOrEqual(143);
  expect(alignment.title.top).toBeGreaterThanOrEqual(45);
  expect(alignment.title.top).toBeLessThanOrEqual(51);
  expect(alignment.subtitle.top).toBeGreaterThanOrEqual(74);
  expect(alignment.subtitle.top).toBeLessThanOrEqual(80);
  expect(alignment.stage.top).toBeGreaterThanOrEqual(258);
  expect(alignment.stage.top).toBeLessThanOrEqual(264);
  expect(alignment.stage.bottom).toBeGreaterThanOrEqual(469);
  expect(alignment.stage.bottom).toBeLessThanOrEqual(475);
  expect(alignment.actions.top).toBeGreaterThanOrEqual(578);
  expect(alignment.actions.top).toBeLessThanOrEqual(584);
  expect(alignment.actions.bottom).toBeGreaterThanOrEqual(640);
  expect(alignment.actions.bottom).toBeLessThanOrEqual(648);
  expect(alignment.actions.height).toBeGreaterThanOrEqual(64);
  expect(alignment.nav.top).toBeGreaterThanOrEqual(644);
  expect(alignment.nav.top).toBeLessThanOrEqual(648);
  expect(alignment.figures.ship.bottom - alignment.figures.avatar.bottom).toBeGreaterThanOrEqual(8);
  expect(alignment.figures.ship.bottom - alignment.figures.avatar.bottom).toBeLessThanOrEqual(14);
  expect(alignment.figures.ship.bottom).toBeGreaterThanOrEqual(402);
  expect(alignment.figures.ship.bottom).toBeLessThanOrEqual(412);
  expect(alignment.moneyBag.top).toBeGreaterThanOrEqual(148);
  expect(alignment.moneyBag.top).toBeLessThanOrEqual(158);
  expect(alignment.specialtyIcon.width).toBeGreaterThanOrEqual(46);
  expect(alignment.specialtyIcon.height).toBeGreaterThanOrEqual(30);
  expect(alignment.rankLabel.left).toBeGreaterThanOrEqual(40);
  expect(alignment.rankLabel.left).toBeLessThanOrEqual(46);
  expect(alignment.rankLabel.top).toBeGreaterThanOrEqual(491);
  expect(alignment.rankLabel.top).toBeLessThanOrEqual(497);
  expect(alignment.expValues.top).toBeGreaterThanOrEqual(490);
  expect(alignment.actions.top - alignment.statPanel.bottom).toBeGreaterThanOrEqual(2);
  expect(alignment.statPanel.left).toBeGreaterThanOrEqual(115);
  expect(alignment.statPanel.left).toBeLessThanOrEqual(118);
  expect(alignment.statPanel.right).toBeGreaterThanOrEqual(363);
  expect(alignment.statPanel.right).toBeLessThanOrEqual(367);
  expect(alignment.statWidths.hp / alignment.statWidths.first).toBeGreaterThanOrEqual(1.23);
  expect(alignment.statWidths.hp / alignment.statWidths.first).toBeLessThanOrEqual(1.29);
  expect(Math.abs(alignment.exploreButton.top - alignment.fortuneButton.top)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(alignment.exploreButton.width - alignment.fortuneButton.width)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(alignment.exploreButton.height - alignment.fortuneButton.height)).toBeLessThanOrEqual(0.5);
  expect(alignment.navButton.height).toBeGreaterThanOrEqual(47);
  expect(alignment.navIcon.width).toBeGreaterThanOrEqual(25);
  expect(alignment.navIcon.height).toBeGreaterThanOrEqual(25);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const screenshotPath = process.env.HOME_V3_SCREENSHOT
    || path.join(os.tmpdir(), 'troy-home-v3-integrated.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`HOME_V3_SCREENSHOT=${screenshotPath}`);

  await page.locator('#btnHomeKing').click();
  await expect(page.locator('#tabContentKing')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-current-tab', 'king');
  await expectNoPageErrors(errors);
});

test('home king shortcut stays hidden for non-king players', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);
  await page.unroute('**/api/get-nation-king-page');
  await page.route('**/api/get-nation-king-page', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ notInNation: true })
    });
  });
  await page.evaluate(async () => {
    const king = await import('/js/nationKing.js?v=20260831-home-king-v1');
    await king.refreshKingNav('PF_PLAYWRIGHT');
  });

  await expect(page.locator('#navKing')).toHaveCount(0);
  await expect(page.locator('#btnHomeKing')).toBeHidden();
  await expect(page.locator('#tabContentHome')).toBeVisible();
  await expectNoPageErrors(errors);
});
