const { test, expect } = require('@playwright/test');
const {
  bootstrapMainApp,
  trackPageErrors,
  expectNoPageErrors
} = require('./helpers/main-app-harness');

function makeExplorationStage(stageNo, {
  name = `探索ステージ${stageNo}`,
  unlocked = true,
  bestRank = null,
  clearCount = 0,
  battlefieldId = 'coral-island',
  imagePath = './assets/tarot-kingdom/battlefields/coral-island-v1.webp',
  monsters = []
} = {}) {
  return {
    version: 1,
    stageNo,
    id: `tarot_stage_${stageNo}`,
    name,
    battlefieldId,
    atmosphereTone: 'test',
    imagePath,
    bestRank,
    clearCount,
    progressionUnlocked: unlocked,
    shipUnlocked: unlocked,
    unlocked,
    lockReason: unlocked ? '' : '前のステージで2位以内に入ると解放',
    monsters: monsters.map((monster, index) => ({
      order: index + 1,
      archetype: 'balanced',
      threatLevel: ((stageNo - 1) * 4) + index + 1,
      isBoss: false,
      ...monster
    }))
  };
}

test('main app boots in limited mode with mocked LIFF login', async ({ page }) => {
  const errors = trackPageErrors(page);
  const state = await bootstrapMainApp(page);

  await expect(page.locator('#appWrapper')).toBeVisible();
  await expect(page.locator('#bootSplash')).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/app-booting/);
  await expect(page.locator('#globalPlayerName')).toHaveText('Playwright Tester');
  await expect(page.locator('#tabContentHome')).toBeVisible();
  await expect(page.locator('#troyMapLink')).toHaveText('MAP');

  const troyMapLink = await page.locator('#troyMapLink').evaluate((link) => ({
    href: link.href,
    target: link.target,
    rel: link.rel,
    color: window.getComputedStyle(link).color
  }));
  const homeQrIcon = await page.locator('#btnHomeScanQr').evaluate((button) => (
    window.getComputedStyle(button, '::before').backgroundImage
  ));
  const homeShipPanel = await page.locator('#homePlayerShipFrame').evaluate((panel) => {
    const style = window.getComputedStyle(panel);
    return {
      borderImageSource: style.borderImageSource,
      borderImageSlice: style.borderImageSlice,
      borderImageWidth: style.borderImageWidth
    };
  });
  const headerCurrency = await page.locator('.currency-display').evaluate((element) => {
    const style = window.getComputedStyle(element);
    const beforeStyle = window.getComputedStyle(element, '::before');
    return {
      hasPanelSliceLayer: Boolean(element.querySelector('.panel-slice-25-layer')),
      text: element.textContent.trim(),
      display: style.display,
      beforeContent: beforeStyle.content,
      beforeBackgroundImage: beforeStyle.backgroundImage,
      beforeWidth: beforeStyle.width
    };
  });
  const compactPanelSliceCount = await page.evaluate(() => (
    document.querySelectorAll([
      '.currency-display.panel-slice-25-host',
      'button.panel-slice-25-host',
      'input.panel-slice-25-host',
      'select.panel-slice-25-host',
      'textarea.panel-slice-25-host',
      '.global-rank-badge.panel-slice-25-host'
    ].join(',')).length
  ));
  const troyMapUrl = new URL(troyMapLink.href);
  expect(troyMapUrl.hostname).toBe('www.google.com');
  expect(troyMapUrl.pathname).toBe('/maps/search/');
  expect(troyMapUrl.searchParams.get('api')).toBe('1');
  expect(troyMapUrl.searchParams.get('query')).toBe('千葉県富里市十倉310-401');
  expect(troyMapLink.target).toBe('_blank');
  expect(troyMapLink.rel).toContain('noopener');
  expect(troyMapLink.color).toBe('rgb(255, 241, 184)');
  expect(homeQrIcon).toContain('030.png');
  expect(homeShipPanel.borderImageSource).toContain('panel-dark-square.png');
  expect(homeShipPanel.borderImageSlice).toContain('24');
  expect(homeShipPanel.borderImageWidth).toContain('10px');
  expect(headerCurrency.hasPanelSliceLayer).toBe(false);
  expect(headerCurrency.text).toContain('G');
  expect(headerCurrency.display).toContain('flex');
  expect(headerCurrency.beforeContent).not.toBe('none');
  expect(headerCurrency.beforeBackgroundImage).toContain('002.png');
  expect(headerCurrency.beforeWidth).toBe('30px');
  expect(compactPanelSliceCount).toBe(0);

  expect(state.loginPlayFabBody).toMatchObject({
    lineAccessToken: 'playwright-access-token',
    lineUserId: 'Uplaywright',
    displayName: 'Playwright Tester'
  });

  await expectNoPageErrors(errors);
});

test('daily tarot fortune modal shows clear draw and result states on mobile', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/tarot-fortune-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ canDraw: true })
    });
  });
  await page.route('**/api/tarot-fortune-draw', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        balance: 1007,
        result: {
          cardId: 'daily_test_wands_7',
          cardNumber: 7,
          suit: 'Wands',
          isArcana: false,
          effectType: 'none',
          cardName: 'ワンドの7',
          orientation: 'upright',
          fortune: '追い風に乗って小さな勝負が進む日。',
          strikeLine: '横槍が入る日だ。守る場所を一つに絞れ、そこで引かなければ主導権はお前さんに残る。',
          rewardPs: 7,
          rewardType: 'gold'
        }
      })
    });
  });

  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    const Tarot = await import('/js/tarotPoker.js');
    await Tarot.showDailyFortunePromptOnLogin('PF_PLAYWRIGHT');
  });
  const overlay = page.locator('#dailyTarotFortuneOverlay');
  const modal = page.locator('#dailyTarotFortuneModal');
  await expect(overlay).toBeVisible();
  const closeButtonStyle = await page.locator('.tarot-fortune-close').evaluate((node) => {
    const style = window.getComputedStyle(node);
    return {
      backgroundImage: style.backgroundImage,
      width: style.width,
      height: style.height,
      fontSize: style.fontSize
    };
  });
  expect(closeButtonStyle.backgroundImage).toContain('action-close.png');
  expect(closeButtonStyle.width).toBe('38px');
  expect(closeButtonStyle.height).toBe('38px');
  expect(closeButtonStyle.fontSize).toBe('0px');
  await expect(page.locator('#dailyTarotFortuneSub')).toHaveText('カードをめくって、今日の航路を読んでください。');
  await expect(page.locator('#dailyTarotFortuneText')).toContainText('まだ伏せたカード');
  await expect(page.locator('#dailyTarotFortuneReward')).toBeHidden();

  const beforeMetrics = await modal.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });
  expect(beforeMetrics.right).toBeLessThanOrEqual(beforeMetrics.viewportWidth);
  expect(beforeMetrics.bottom).toBeLessThanOrEqual(beforeMetrics.viewportHeight);

  await page.locator('#dailyTarotFortuneCardHost .tarot-fortune-card-shell').click();
  await expect(page.locator('#dailyTarotFortuneResultMeta')).toContainText('ワンドの7');
  await expect(page.locator('#dailyTarotFortuneResultMeta')).toContainText('正位置');
  await expect(page.locator('#dailyTarotFortuneText')).toContainText('風向き: 追い風');
  await expect(page.locator('#dailyTarotFortuneText')).toContainText('横槍が入る日だ。');
  await expect(page.locator('#dailyTarotFortuneText')).toContainText('主導権はお前さんに残る。');
  await expect(page.locator('#dailyTarotFortuneText')).not.toContainText('一言判定:');
  await expect(page.locator('#dailyTarotFortuneText')).not.toContainText('船長からの一言:');
  await expect(page.locator('#dailyTarotFortuneReward')).toContainText('+7G');
  await expect(modal).not.toHaveClass(/is-major-arcana/);
  await expect(page.locator('#dailyTarotFortuneArcanaBadge')).toBeHidden();
  await expect(page.locator('#dailyTarotFortuneCardHost .tarot-fortune-card-shell')).not.toHaveClass(/is-major-arcana/);

  await page.locator('.tarot-fortune-done').click();
  await expect(overlay).toBeHidden();
  await expectNoPageErrors(errors);
});

test('daily tarot fortune adds richer presentation after major arcana reveal', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/tarot-fortune-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ canDraw: true })
    });
  });
  await page.route('**/api/tarot-fortune-draw', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        balance: 1018,
        result: {
          cardId: 'arcana-18',
          cardNumber: 18,
          suit: 'None',
          isArcana: true,
          effectType: 'None',
          cardName: '月',
          orientation: 'upright',
          fortune: [
            '風向き: 不穏',
            '一言判定: 一寸先も見えん。見張り番を増やしな。',
            '',
            '船長からの一言:',
            '霧が濃い日。',
            '怖さは合図です。',
            '噂ではなく一次情報で航路を確かめてください。'
          ].join('\n'),
          rewardPs: 18,
          rewardType: 'card',
          rewardItemName: '月',
          skillName: '霧読みの航法'
        }
      })
    });
  });

  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    const Tarot = await import('/js/tarotPoker.js');
    await Tarot.showDailyFortunePromptOnLogin('PF_PLAYWRIGHT_MAJOR');
  });

  const modal = page.locator('#dailyTarotFortuneModal');
  const arcanaBadge = page.locator('#dailyTarotFortuneArcanaBadge');
  const fortuneCard = page.locator('#dailyTarotFortuneCardHost .tarot-fortune-card-shell');
  await expect(modal).not.toHaveClass(/is-major-arcana/);
  await expect(arcanaBadge).toBeHidden();

  await fortuneCard.click();
  await expect(modal).toHaveClass(/is-major-arcana/);
  await expect(fortuneCard).toHaveClass(/is-major-arcana/);
  await expect(arcanaBadge).toBeVisible();
  await expect(arcanaBadge).toHaveText('MAJOR ARCANA');
  await expect(page.locator('#dailyTarotFortuneText')).toContainText('風向き: 不穏');
  await expect(page.locator('#dailyTarotFortuneText')).toContainText('噂ではなく一次情報で航路を確かめてください。');
  await expect(page.locator('#dailyTarotFortuneText')).not.toContainText('一言判定:');
  await expect(page.locator('#dailyTarotFortuneText')).not.toContainText('船長からの一言:');

  const majorPresentation = await modal.evaluate((node) => {
    const beforeStyle = window.getComputedStyle(node, '::before');
    const card = document.querySelector('#dailyTarotFortuneCardHost .tarot-fortune-card-shell');
    const cardStyle = card ? window.getComputedStyle(card) : null;
    return {
      beforeAnimation: beforeStyle.animationName,
      beforeOpacity: beforeStyle.opacity,
      cardAnimation: cardStyle?.animationName || ''
    };
  });
  expect(majorPresentation.beforeAnimation).toBe('tarotFortuneArcanaRays');
  expect(Number(majorPresentation.beforeOpacity)).toBeGreaterThan(0);
  expect(majorPresentation.cardAnimation).toBe('tarotFortuneArcanaCard');
  await expectNoPageErrors(errors);
});

test('home tab shows only the latest nation announcement in the top banner panel', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);
  await page.unroute('**/api/get-nation-announcements');
  await page.route('**/api/get-nation-announcements', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        announcements: [
          {
            nation: 'water',
            nationLabel: '水の国',
            message: '全プレイヤー向けの告知です。本日のTROYは22時から宝探しイベントを開催します。参加希望者は早めに集合してください。',
            updatedAt: Date.parse('2026-06-08T12:00:00+09:00')
          },
          {
            nation: 'fire',
            nationLabel: '火の国',
            message: '火の国からのお知らせ。',
            updatedAt: Date.parse('2026-06-08T10:00:00+09:00')
          }
        ]
      })
    });
  });

  await page.evaluate(async () => {
    await window.showTab('home', { playFabId: 'PF_PLAYWRIGHT', race: 'human', nation: 'fire' });
  });

  const panel = page.locator('#homeAnnouncementPanel');
  await expect(panel).toBeVisible();
  await expect(panel.locator(':scope > .panel-slice-25-layer')).toHaveCount(0);
  await expect(panel.locator('.home-announcement-title')).toHaveText('王の告知');
  await expect(panel).toContainText('全プレイヤー向けの告知です。');
  await expect(panel).not.toContainText('水の国');
  await expect(panel).not.toContainText('火の国');
  await expect(panel).not.toContainText('火の国からのお知らせ。');
  await expect.poll(async () => (
    panel.locator('.home-announcement-message').evaluate((element) => element.classList.contains('is-marquee'))
  )).toBe(true);
  const panelFrame = await panel.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const titleStyle = window.getComputedStyle(element.querySelector('.home-announcement-title'));
    const messageStyle = window.getComputedStyle(element.querySelector('.home-announcement-message'));
    const marqueeStyle = window.getComputedStyle(element.querySelector('.home-announcement-marquee-text'));
    return {
      width: Math.round(rect.width),
      height: rect.height,
      borderImageSource: style.borderImageSource,
      borderImageSlice: style.borderImageSlice,
      borderImageWidth: style.borderImageWidth,
      titleFontSize: titleStyle.fontSize,
      messageFontSize: messageStyle.fontSize,
      messageWhiteSpace: messageStyle.whiteSpace,
      messageTextOverflow: messageStyle.textOverflow,
      marqueeAnimationName: marqueeStyle.animationName,
      marqueeAnimationDuration: marqueeStyle.animationDuration,
      marqueeAnimationDelay: marqueeStyle.animationDelay,
      marqueeTransform: marqueeStyle.transform
    };
  });
  expect(panelFrame.width).toBe(430);
  expect(panelFrame.height).toBeLessThanOrEqual(52);
  expect(panelFrame.borderImageSource).toContain('banner-plaque-gold.png');
  expect(panelFrame.borderImageSlice).toContain('38');
  expect(panelFrame.borderImageSlice).toContain('32');
  expect(panelFrame.borderImageSlice).toContain('30');
  expect(panelFrame.borderImageWidth).toContain('18px');
  expect(panelFrame.borderImageWidth).toContain('15px');
  expect(panelFrame.titleFontSize).toBe('11px');
  expect(panelFrame.messageFontSize).toBe('12px');
  expect(panelFrame.messageWhiteSpace).toBe('nowrap');
  expect(panelFrame.messageTextOverflow).toBe('clip');
  expect(panelFrame.marqueeAnimationName).toBe('homeAnnouncementMarquee');
  expect(panelFrame.marqueeAnimationDuration).toMatch(/s$/);
  expect(panelFrame.marqueeAnimationDelay).toMatch(/^-/);
  expect(panelFrame.marqueeTransform).toContain('matrix');
  await expectNoPageErrors(errors);
});

test('home avatar applies equipped gear during app startup', async ({ page }) => {
  const errors = trackPageErrors(page);
  const equipmentRequests = [];
  await page.route(/\/api\/(get-stats|player-ship\/status|exploration\/status|get-troy-status|get-global-chat|get-line-friend-bonus-status|tarot-fortune-status|get-player-display-name)$/, async (route) => {
    const url = route.request().url();
    let body = {};
    if (url.includes('/api/get-stats')) {
      body = {
        stats: {
          Level: 1,
          STR: 1,
          DEF: 1,
          AGI: 1,
          INT: 1
        }
      };
    } else if (url.includes('/api/player-ship/status')) {
      body = { ship: null, activeShip: null };
    } else if (url.includes('/api/exploration/status')) {
      body = { status: null, destinations: [] };
    } else if (url.includes('/api/get-troy-status')) {
      body = { isOpen: false, members: [] };
    } else if (url.includes('/api/get-global-chat')) {
      body = { messages: [] };
    } else if (url.includes('/api/get-line-friend-bonus-status')) {
      body = { claimed: true };
    } else if (url.includes('/api/tarot-fortune-status')) {
      body = { ok: true, available: false };
    } else if (url.includes('/api/get-player-display-name')) {
      body = { displayName: 'Playwright Tester' };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(body)
    });
  });
  await page.route('**/api/get-inventory', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        inventory: [
          {
            itemId: 'sword_001',
            name: '起動確認の剣',
            customData: {
              Category: 'Weapon',
              sprite_path: './Sprites/weapons/melee weapons/sword.png',
              sprite_index: '1',
              sprite_w: '32',
              sprite_h: '32',
              Atk: '5'
            }
          }
        ],
        virtualCurrency: { PS: 1200 },
        contribution: 0,
        contributionProgress: { level: 1, expInto: 0, expNeeded: 1500, rank: 0 },
        isKing: false
      })
    });
  });
  await page.route('**/api/tarot-deck-get', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ok: true, tarotDeck: [], tarotRole: null })
    });
  });
  await page.route('**/api/player-ship/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        ship: { form: 'boat', stage: 1, majorArcanaSlotLimit: 1, majorArcanaItemIds: [] }
      })
    });
  });
  await page.route('**/api/ship-skill-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, majorArcanaSlotLimit: 1, majorArcanaItemIds: [], skills: [] })
    });
  });
  await page.route('**/api/get-equipment', async (route) => {
    equipmentRequests.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        equipment: {
          RightHand: 'sword_001'
        }
      })
    });
  });

  await bootstrapMainApp(page, {
    firebaseToken: 'playwright-firebase-token',
    mockFirebaseAuth: true
  });

  await expect.poll(() => equipmentRequests.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => page.locator('#home-avatar-layer-weapon-right').evaluate((layer) => (
    window.getComputedStyle(layer).backgroundImage
  )), { timeout: 10_000 }).toContain('sword.png');
  await expect(page.locator('#home-avatar-layer-shield-left')).toHaveCSS('background-image', 'none');
  const homeAvatarAudit = await page.locator('#home-avatar').evaluate((avatar) => {
    const style = window.getComputedStyle(avatar);
    const rect = avatar.getBoundingClientRect();
    return {
      opacity: style.opacity,
      visibility: style.visibility,
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  });
  expect(homeAvatarAudit.opacity).not.toBe('0');
  expect(homeAvatarAudit.visibility).not.toBe('hidden');
  expect(homeAvatarAudit.width).toBeGreaterThan(0);
  expect(homeAvatarAudit.height).toBeGreaterThan(0);
  await expectNoPageErrors(errors);
});

test('home tab lets checked-in customers convert gold to chips', async ({ page }) => {
  const errors = trackPageErrors(page);
  const coinConvertRequests = [];

  await page.route('**/api/get-troy-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        nation: 'fire',
        isOpen: true,
        members: [{ playFabId: 'PF_PLAYWRIGHT', displayName: 'Playwright Tester' }],
        menuDisabled: [],
        menuSpecials: [],
        menuCustomItems: []
      })
    });
  });
  await page.route('**/api/troy-convert-gold-to-coin', async (route) => {
    const requestBody = route.request().postDataJSON();
    coinConvertRequests.push(requestBody);
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, amount: requestBody.amount, newBalance: 8800 })
    });
  });

  await bootstrapMainApp(page);

  await expect(page.locator('#tabContentHome')).toBeVisible();
  await expect(page.locator('#homeCoinConvertPanel')).toBeVisible();
  await expect(page.locator('#homeCoinConvertPanel .home-card-emoji')).toHaveCSS('background-image', /046\.png/);
  await page.locator('#homeCoinConvertAmount').fill('1200');
  await page.locator('#btnHomeCoinConvert').click();

  await expect.poll(() => coinConvertRequests.length).toBe(1);
  expect(coinConvertRequests[0]).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    amount: 1200
  });
  expect(coinConvertRequests[0].requestId).toMatch(/^troy-customer-chip-/);
  await expect(page.locator('#homeCoinConvertMessage')).toContainText('1,200Gをチップ化しました');
  await expect(page.locator('#troyStaffChipConfirmOverlay')).toBeVisible();
  await expect(page.locator('#troyStaffChipConfirmAmount')).toHaveText('1,200G');
  await expect(page.locator('#troyStaffChipConfirmButton img')).toHaveAttribute('src', /assets\/ui\/icons\/046\.png/);
  await page.locator('#troyStaffChipConfirmButton').click();
  await expect(page.locator('#troyStaffChipConfirmOverlay')).toBeHidden();
  await expect(page.locator('#currentPoints')).toHaveText('8800');

  await expectNoPageErrors(errors);
});

test('ranking tab shows bounty billiards and game as top category buttons', async ({ page }) => {
  const errors = trackPageErrors(page);
  const storeGameRequests = [];
  await page.route('**/api/get-ranking', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ranking: [
          { displayName: 'Playwright Tester', score: 9000, level: 18, rankName: '航海士', playFabId: 'PF_PLAYWRIGHT' }
        ]
      })
    });
  });
  await page.route('**/api/get-bounty-ranking', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ranking: [
          { displayName: '賞金首', bounty: 1234, score: 1234, level: 21, rankName: '船長', playFabId: 'PF_BOUNTY' }
        ]
      })
    });
  });
  await page.route('**/api/get-store-game-ranking', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const gameType = String(body.gameType || '');
    storeGameRequests.push(gameType);
    const rankingByType = {
      billiards: [
        { displayName: '玉突き名人', score: 800, scoreScale: 1, level: 12, rankName: '航海士', playFabId: 'PF_BILLIARDS' }
      ],
      game: [
        { displayName: '遊技王', score: 42, scoreScale: 1, level: 41, rankName: '提督', playFabId: 'PF_GAME' }
      ]
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        gameType,
        ranking: rankingByType[gameType] || []
      })
    });
  });

  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    await window.showTab('ranking');
  });

  await expect(page.locator('#tabContentRanking')).toBeVisible();
  await expect(page.locator('.ranking-subsection')).toHaveCount(0);
  await expect(page.locator('.ranking-subcard')).toHaveCount(0);
  const toggleLabels = await page.locator('#rankingToggleButtons .ranking-toggle-btn').evaluateAll((buttons) => (
    buttons.map((button) => button.textContent.trim())
  ));
  expect(toggleLabels).toEqual(['ゴールド順', '懸賞金', 'ダーツ', 'ビリヤード', 'カラオケ', 'ゲーム']);
  await expect(page.locator('#psRankingArea')).toBeVisible();
  await expect(page.locator('#bountyRankingArea')).toBeHidden();
  await expect(page.locator('#billiardsRankingArea')).toBeHidden();
  await expect(page.locator('#gameRankingArea')).toBeHidden();

  await page.locator('#btnShowBountyRanking').click();
  await expect(page.locator('#bountyRankingArea')).toBeVisible();
  await expect(page.locator('#bountyRankingList')).toContainText('賞金首');
  await expect(page.locator('#bountyRankingList')).toContainText('1,234 ĐɃ');

  await page.locator('#btnShowBilliardsRanking').click();
  await expect(page.locator('#billiardsRankingArea')).toBeVisible();
  await expect(page.locator('#billiardsRankingList')).toContainText('玉突き名人');
  await expect(page.locator('#billiardsRankingList')).toContainText('レート 800');

  await page.locator('#btnShowGameRanking').click();
  await expect(page.locator('#gameRankingArea')).toBeVisible();
  await expect(page.locator('#gameRankingList')).toContainText('遊技王');
  await expect(page.locator('#gameRankingList')).toContainText('レート 42');
  expect([...storeGameRequests].sort()).toEqual(['billiards', 'game']);

  await expectNoPageErrors(errors);
});

test('troy tab replaces bottom chat with a menu board customer order request', async ({ page }) => {
  const errors = trackPageErrors(page);
  const customerOrderRequests = [];
  const coinConvertRequests = [];
  await page.route('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: `
const troySnapshot = {
  data: () => ({
    nation: 'fire',
    isOpen: true,
    menuDisabled: ['ナゲット'],
    menuSpecials: [{ name: '船長の一杯', price: 900, emoji: '⚓' }],
    menuCustomItems: [{ menuId: 'food', concept: '氷', content: '割材', price: 500, emoji: '🧊' }]
  }),
  docs: [{ id: 'PF_PLAYWRIGHT', data: () => ({ displayName: 'テスト船長', joinedAt: Date.now() }) }]
};
export function getFirestore() { return {}; }
export function doc() { return {}; }
export function collection() { return {}; }
export function query() { return {}; }
export function where() { return {}; }
export function orderBy() { return {}; }
export function limit() { return {}; }
export function getDocs() { return Promise.resolve({ docs: [] }); }
export function getDoc() { return Promise.resolve({ exists: () => false, data: () => ({}), id: '' }); }
export function setDoc() { return Promise.resolve(); }
export function updateDoc() { return Promise.resolve(); }
export function addDoc() { return Promise.resolve({ id: 'mock-doc' }); }
export function serverTimestamp() { return Date.now(); }
export function onSnapshot(_ref, next) {
  Promise.resolve().then(() => next({
    ...troySnapshot
  }));
  return () => {};
}
`
    });
  });
  await page.route('**/api/troy-calendar/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ calendar: [] })
    });
  });
  await page.route('**/api/get-troy-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        nation: 'fire',
        isOpen: true,
        members: [{ playFabId: 'PF_PLAYWRIGHT', displayName: 'テスト船長' }],
        menuDisabled: ['ナゲット'],
        menuSpecials: [{ name: '船長の一杯', price: 900, emoji: '⚓' }],
        menuCustomItems: [{ menuId: 'food', concept: '氷', content: '割材', price: 500, emoji: '🧊' }]
      })
    });
  });
  await page.route('**/api/troy-orders/customer-request', async (route) => {
    customerOrderRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, request: { requestId: 'REQ1', status: 'pending' } })
    });
  });
  await page.route('**/api/troy-convert-gold-to-coin', async (route) => {
    const requestBody = route.request().postDataJSON();
    coinConvertRequests.push(requestBody);
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, amount: requestBody.amount, newBalance: 8900 })
    });
  });

  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    await window.showTab('troy');
  });

  await expect(page.locator('#tabContentTroy')).toBeVisible();
  await expect(page.locator('#troyChatDetails')).toHaveCount(0);
  await expect(page.locator('#troyMenuBoardSection')).toBeVisible();
  const troyHeaderLayout = await page.evaluate(() => {
    const row = document.querySelector('#tabContentTroy .troy-status-row');
    const map = document.getElementById('troyMapLink');
    const badge = document.getElementById('troyOpenBadge');
    const rowRect = row.getBoundingClientRect();
    const mapRect = map.getBoundingClientRect();
    const badgeRect = badge.getBoundingClientRect();
    return {
      rowHeight: rowRect.height,
      mapBottom: mapRect.bottom,
      badgeTop: badgeRect.top,
      badgeRight: badgeRect.right,
      mapRight: mapRect.right
    };
  });
  expect(troyHeaderLayout.mapBottom).toBeLessThanOrEqual(troyHeaderLayout.badgeTop);
  expect(Math.abs(troyHeaderLayout.mapRight - troyHeaderLayout.badgeRight)).toBeLessThanOrEqual(2);
  expect(troyHeaderLayout.rowHeight).toBeLessThan(120);
  await expect(page.locator('#troyMenuBoardSection')).toContainText('メニュー表');
  await expect(page.locator('#troyMenuBoardSection')).toContainText('入店中はメニューから注文できます');
  await expect(page.locator('#troyEntryList')).toContainText('現在 1 名入店中');
  await expect(page.locator('#troyEntryList .troy-entry-item')).toHaveCount(0);
  await expect(page.locator('#troyEntryList')).not.toContainText('テスト船長');
  await expect(page.locator('#troyCoinConvertPanel')).toBeVisible();
  await page.locator('#troyCoinConvertAmount').fill('1100');
  await page.locator('#btnTroyCoinConvert').click();
  await expect.poll(() => coinConvertRequests.length).toBe(1);
  expect(coinConvertRequests[0]).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    amount: 1100
  });
  expect(coinConvertRequests[0].requestId).toMatch(/^troy-customer-chip-/);
  await expect(page.locator('#troyCoinConvertMessage')).toContainText('1,100Gをチップ化しました');
  await expect(page.locator('#troyStaffChipConfirmOverlay')).toBeVisible();
  await expect(page.locator('#troyStaffChipConfirmAmount')).toHaveText('1,100G');
  await page.locator('#troyStaffChipConfirmButton').click();
  await expect(page.locator('#troyStaffChipConfirmOverlay')).toBeHidden();
  await expect(page.locator('#troyMenuBoardCategoryTabs .troy-menu-board-tab-icon img')).toHaveCount(11);
  await expect(page.locator('#troyMenuBoardCategoryTabs .troy-menu-board-tab', { hasText: 'BOTTLE MENU' }).locator('.troy-menu-board-tab-icon img')).toHaveAttribute('src', /Sprites\/drinks\/troy_champagne_bottle_flute\.png/);
  await expect(page.locator('#troyMenuBoardCategoryTabs .troy-menu-board-tab', { hasText: '酒場のフード' }).locator('.troy-menu-board-tab-icon img')).toHaveAttribute('src', /Sprites\/food\/snack_fried_chicken_skillet\.png/);
  await expect(page.locator('#troyMenuBoardList')).toContainText('瓶ビール');
  await expect(page.locator('#troyMenuBoardList')).toContainText('¥500〜');
  const heartlandBottleItem = page.locator('#troyMenuBoardList .troy-menu-board-item').filter({ has: page.locator('.troy-menu-board-name', { hasText: /^瓶ビール$/ }) });
  await expect(heartlandBottleItem).toContainText('¥700');
  await expect(heartlandBottleItem.locator('.troy-menu-board-icon img')).toHaveAttribute('src', /Sprites\/drinks\/fantasy_anchor_green_beer_bottle\.png/);
  await expect(page.locator('#troyMenuBoardList [data-troy-menu-board-order]')).toHaveCount(0);

  const highballItem = page.locator('#troyMenuBoardList .troy-menu-board-item').filter({ has: page.locator('.troy-menu-board-name', { hasText: /^ハイボール$/ }) });
  await highballItem.click();
  await expect(page.locator('#troyMenuBoardOrderModal')).toBeVisible();
  await expect(page.locator('#troyMenuBoardOrderSizes')).toContainText('海賊ジョッキ');
  await page.locator('#troyMenuBoardOrderSizes [data-troy-menu-board-size="海賊ジョッキ"]').click();
  await page.locator('#troyMenuBoardOrderQty').selectOption('2');
  await expect(page.locator('#troyMenuBoardOrderTotal')).toHaveText('¥2,000 / x2');
  await page.locator('#troyMenuBoardOrderSubmit').click();
  await expect.poll(() => customerOrderRequests.length).toBe(1);
  expect(customerOrderRequests[0]).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    troyNation: 'fire',
    menuId: 'beer',
    concept: 'ハイボール',
    content: '角',
    sizeLabel: '海賊ジョッキ',
    quantity: 2
  });
  const coronaZeroItem = page.locator('#troyMenuBoardList .troy-menu-board-item').filter({ hasText: 'コロナセロ' });
  await expect(coronaZeroItem).toContainText('¥500');
  await expect(coronaZeroItem.locator('.troy-menu-board-icon img')).toHaveAttribute('src', /Sprites\/drinks\/fantasy_golden_compass_beer\.png/);
  await expect(page.locator('#troyMenuBoardSection .troy-menu-quick-btn')).toHaveCount(0);
  await expect(page.locator('#troyMenuBoardSection #troyChatInput')).toHaveCount(0);

  await page.locator('#troyMenuBoardCategoryTabs .troy-menu-board-tab', { hasText: 'ソフトドリンク' }).click();
  await expect(page.locator('#troyMenuBoardList .troy-menu-board-item')).toHaveCount(5);
  await expect(page.locator('#troyMenuBoardList .troy-menu-board-price')).toHaveText([
    '¥400',
    '¥400',
    '¥400',
    '¥400',
    '¥400'
  ]);

  await page.locator('#troyMenuBoardCategoryTabs .troy-menu-board-tab', { hasText: '酒場のフード' }).click();
  await expect(page.locator('#troyMenuBoardList')).toContainText('ナゲット');
  await expect(page.locator('#troyMenuBoardList')).toContainText('SOLD OUT');
  await expect(page.locator('#troyMenuBoardList .troy-menu-board-item', { hasText: 'ナゲット' }).locator('.troy-menu-board-icon img')).toHaveAttribute('src', /Sprites\/food\/pirate_fried_chicken_nuggets\.png/);
  await expect(page.locator('#troyMenuBoardList .troy-menu-board-item', { hasText: '梅水晶' }).locator('.troy-menu-board-icon img')).toHaveAttribute('src', /Sprites\/food\/pirate_ume_crystal_bowl\.png/);
  await expect(page.locator('#troyMenuBoardList')).toContainText('氷');
  await expect(page.locator('#troyMenuBoardList .troy-menu-board-item', { hasText: '氷' }).locator('.troy-menu-board-icon img')).toHaveAttribute('src', /Sprites\/drinks\/cocktail_clear_soda_tumbler\.png/);
  const noriItem = page.locator('#troyMenuBoardList .troy-menu-board-item').filter({ has: page.locator('.troy-menu-board-name', { hasText: /^韓国のり$/ }) });
  await expect(noriItem.locator('.troy-menu-board-price')).toHaveText('¥300');
  const addedFoodItems = [
    ['フライドポテト', /Sprites\/food\/pirate_french_fries_bucket\.png/],
    ['フランク', /Sprites\/food\/snack_sausage_skillet\.png/],
    ['ミックスナッツ', /Sprites\/food\/pirate_mixed_nuts_barrel\.png/],
    ['ピザトースト', /Sprites\/food\/snack_mini_pizza_plate\.png/],
    ['ビーフジャーキー', /Sprites\/food\/pirate_jerky_platter\.png/],
    ['ポテトチップス', /Sprites\/food\/snack_potato_chips_bowl\.png/],
    ['カップラーメン', /Sprites\/food\/snack_ramen_bowl\.png/],
    ['みそ汁', /Sprites\/food\/snack_miso_soup_bowl\.png/],
    ['ピクルス', /Sprites\/food\/pirate_pickle_barrel\.png/],
    ['珍味', /Sprites\/food\/pirate_dried_squid_plate\.png/]
  ];
  for (const [foodName, imagePattern] of addedFoodItems) {
    const foodItem = page.locator('#troyMenuBoardList .troy-menu-board-item').filter({ has: page.locator('.troy-menu-board-name', { hasText: new RegExp(`^${foodName}$`) }) });
    await expect(foodItem.locator('.troy-menu-board-price')).toHaveText('¥500');
    await expect(foodItem.locator('.troy-menu-board-icon img')).toHaveAttribute('src', imagePattern);
  }
  const pockyItem = page.locator('#troyMenuBoardList .troy-menu-board-item').filter({ has: page.locator('.troy-menu-board-name', { hasText: /^ポッキー$/ }) });
  await expect(pockyItem.locator('.troy-menu-board-price')).toHaveText('¥300');
  await expect(pockyItem.locator('.troy-menu-board-icon img')).toHaveAttribute('src', /Sprites\/food\/pirate_dried_fish_sticks\.png/);

  await page.locator('#troyMenuBoardCategoryTabs .troy-menu-board-tab', { hasText: 'BOTTLE MENU' }).click();
  await expect(page.locator('#troyMenuBoardList')).not.toContainText('ワイン各種');
  const blackBottleItem = page.locator('#troyMenuBoardList .troy-menu-board-item').filter({ has: page.locator('.troy-menu-board-name', { hasText: /^黒霧ボトル$/ }) });
  await expect(blackBottleItem.locator('.troy-menu-board-price')).toHaveText('¥3,000');
  await expect(page.locator('#troyMenuBoardList .troy-menu-board-item', { hasText: 'キンミヤボトル' }).locator('.troy-menu-board-icon img')).toHaveAttribute('src', /Sprites\/drinks\/pirate_blue_crystal_potion\.png/);
  const wineBottleItem = page.locator('#troyMenuBoardList .troy-menu-board-item').filter({ has: page.locator('.troy-menu-board-name', { hasText: /^ワインボトル$/ }) });
  await expect(wineBottleItem.locator('.troy-menu-board-price')).toHaveText('¥3,000');
  await expect(wineBottleItem.locator('.troy-menu-board-icon img')).toHaveAttribute('src', /Sprites\/drinks\/pirate_red_wine_bottle\.png/);
  const moetItem = page.locator('#troyMenuBoardList .troy-menu-board-item').filter({ has: page.locator('.troy-menu-board-name', { hasText: /^モエ・エ・シャンドン$/ }) });
  await expect(moetItem.locator('.troy-menu-board-price')).toHaveText('¥18,000');
  await expect(moetItem.locator('.troy-menu-board-icon img')).toHaveAttribute('src', /Sprites\/drinks\/troy_champagne_bottle_flute\.png/);
  const kakuBottleItem = page.locator('#troyMenuBoardList .troy-menu-board-item').filter({ has: page.locator('.troy-menu-board-name', { hasText: /^角ボトル$/ }) });
  await expect(kakuBottleItem.locator('.troy-menu-board-price')).toHaveText('¥4,000');
  await expect(kakuBottleItem.locator('.troy-menu-board-icon img')).toHaveAttribute('src', /Sprites\/drinks\/troy_yamazaki_whisky_bottle\.png/);

  await page.locator('#troyMenuBoardCategoryTabs .troy-menu-board-tab', { hasText: 'ウイスキー・焼酎・ワイン' }).click();
  const glassWineItem = page.locator('#troyMenuBoardList .troy-menu-board-item').filter({ has: page.locator('.troy-menu-board-name', { hasText: /^グラスワイン$/ }) });
  await expect(glassWineItem.locator('.troy-menu-board-price')).toHaveText('¥500');
  await expect(glassWineItem.locator('.troy-menu-board-icon img')).toHaveAttribute('src', /Sprites\/drinks\/pirate_red_wine_glass\.png/);

  await expectNoPageErrors(errors);
});

test('troy entry QR joins directly without entry gold bonus or chip conversion prompt', async ({ page }) => {
  const errors = trackPageErrors(page);
  const joinRequests = [];
  const convertRequests = [];
  let joined = false;

  await page.route('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: `
const getMemberDocs = () => globalThis.__pwTroyJoined ? [{ id: 'PF_PLAYWRIGHT', data: () => ({ displayName: 'Playwright Tester', joinedAt: Date.now() }) }] : [];
const troyRoomData = () => ({ nation: 'fire', isOpen: true, menuDisabled: [], menuSpecials: [], menuCustomItems: [] });
export function getFirestore() { return {}; }
export function doc() { return {}; }
export function collection() { return {}; }
export function query() { return {}; }
export function where() { return {}; }
export function orderBy() { return {}; }
export function limit() { return {}; }
export function getDocs() { return Promise.resolve({ docs: [] }); }
export function getDoc() { return Promise.resolve({ exists: () => false, data: () => ({}), id: '' }); }
export function setDoc() { return Promise.resolve(); }
export function updateDoc() { return Promise.resolve(); }
export function addDoc() { return Promise.resolve({ id: 'mock-doc' }); }
export function serverTimestamp() { return Date.now(); }
export function onSnapshot(_ref, next) {
  Promise.resolve().then(() => next({
    data: troyRoomData,
    docs: getMemberDocs()
  }));
  return () => {};
}
`
    });
  });
  await page.route('**/api/troy-calendar/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ calendar: [] })
    });
  });
  await page.route('**/api/get-troy-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        nation: 'fire',
        isOpen: true,
        members: joined ? [{ playFabId: 'PF_PLAYWRIGHT', displayName: 'Playwright Tester' }] : [],
        menuDisabled: [],
        menuSpecials: [],
        menuCustomItems: []
      })
    });
  });
  await page.route('**/api/troy-join', async (route) => {
    joinRequests.push(route.request().postDataJSON());
    joined = true;
    await page.evaluate(() => {
      window.__pwTroyJoined = true;
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        nation: 'fire',
        entryBonusGranted: 0,
        entryBonusError: null,
        entryChargeAmount: 500,
        entryStaffChipAmount: 500,
        entryInstructionMessage: 'スタッフからチップ500を受け取ってください',
        entryChargeCreated: true,
        entryChargeError: null,
        alreadyEntered: false
      })
    });
  });
  await page.route('**/api/troy-convert-gold-to-coin', async (route) => {
    convertRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true })
    });
  });

  const state = await bootstrapMainApp(page, {
    gotoUrl: '/?action=troy-entry&troyNation=fire',
    firebaseToken: 'playwright-firebase-token',
    mockFirebaseAuth: true
  });

  await expect.poll(() => joinRequests.length).toBe(1);
  expect(state.loginPlayFabBody).toMatchObject({ action: 'troy-entry', troyEntry: true, troyNation: 'fire' });
  expect(joinRequests[0]).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    displayName: 'Playwright Tester',
    troyNation: 'fire'
  });
  await expect(page.locator('[aria-label="入店前のチップ確認"]')).toHaveCount(0);
  expect(convertRequests).toHaveLength(0);
  await expect(page.locator('#tabContentTroy')).toBeVisible();
  await expect(page.locator('#tabContentTroy')).toContainText('入店中');
  await expect(page.locator('.rpg-message-popup')).toContainText('スタッフからチップ500を受け取ってください');
  await expect(page.locator('#troyStaffChipConfirmOverlay')).toBeVisible();
  await expect(page.locator('#troyStaffChipConfirmAmount')).toHaveText('500G');
  await page.locator('#troyStaffChipConfirmButton').click();
  await expect(page.locator('#troyStaffChipConfirmOverlay')).toBeHidden();

  await expectNoPageErrors(errors);
});

test('troy calendar shows the nearest three business days before folding the rest', async ({ page }) => {
  const errors = trackPageErrors(page);
  const calendarEntries = [
    {
      id: 'cal-1',
      title: 'First open',
      status: 'open',
      date: '2026-06-08',
      startsAtMs: Date.UTC(2026, 5, 8, 18, 0),
      openTime: '18:00',
      closeTime: '23:00'
    },
    {
      id: 'cal-2',
      title: 'Second open',
      status: 'open',
      date: '2026-06-09',
      startsAtMs: Date.UTC(2026, 5, 9, 18, 0),
      openTime: '18:00',
      closeTime: '23:00'
    },
    {
      id: 'cal-3',
      title: 'Closed day',
      status: 'closed',
      date: '2026-06-10',
      startsAtMs: Date.UTC(2026, 5, 10, 18, 0),
      openTime: '18:00',
      closeTime: '23:00'
    },
    ...Array.from({ length: 6 }, (_, index) => {
      const day = 11 + index;
      return {
        id: `cal-extra-${index + 1}`,
        title: `Extra ${index + 1}`,
        status: 'open',
        date: `2026-06-${String(day).padStart(2, '0')}`,
        startsAtMs: Date.UTC(2026, 5, day, 18, 0),
        openTime: '18:00',
        closeTime: '23:00'
      };
    })
  ];
  await page.route('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: `
const troySnapshot = {
  data: () => ({
    nation: 'fire',
    isOpen: true,
    menuDisabled: [],
    menuSpecials: [],
    menuCustomItems: []
  }),
  docs: []
};
export function getFirestore() { return {}; }
export function doc() { return {}; }
export function collection() { return {}; }
export function query() { return {}; }
export function where() { return {}; }
export function orderBy() { return {}; }
export function limit() { return {}; }
export function getDocs() { return Promise.resolve({ docs: [] }); }
export function getDoc() { return Promise.resolve({ exists: () => false, data: () => ({}), id: '' }); }
export function setDoc() { return Promise.resolve(); }
export function updateDoc() { return Promise.resolve(); }
export function addDoc() { return Promise.resolve({ id: 'mock-doc' }); }
export function serverTimestamp() { return Date.now(); }
export function onSnapshot(_ref, next) {
  Promise.resolve().then(() => next({
    ...troySnapshot
  }));
  return () => {};
}
`
    });
  });
  await page.route('**/api/troy-calendar/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        calendar: calendarEntries
      })
    });
  });
  await page.route('**/api/get-troy-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        nation: 'fire',
        isOpen: true,
        members: [],
        menuDisabled: [],
        menuSpecials: [],
        menuCustomItems: []
      })
    });
  });

  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    await window.showTab('troy');
  });

  const directCards = page.locator('#troyBusinessCalendarList > .troy-calendar-item');
  const folded = page.locator('#troyBusinessCalendarList > .troy-calendar-collapsed');
  await expect(directCards).toHaveCount(3);
  await expect(directCards.nth(0)).toContainText('First open');
  await expect(directCards.nth(1)).toContainText('Second open');
  await expect(directCards.nth(2)).toContainText('Closed day');
  await expect(folded).toHaveCount(1);
  await expect(folded.locator('summary')).toContainText('6');
  await expect(folded.locator('.troy-calendar-item')).toHaveCount(6);
  await expect(folded.locator('.troy-calendar-item').first()).toBeHidden();

  await folded.locator('summary').click();
  await expect(folded.locator('.troy-calendar-item').first()).toBeVisible();
  await folded.locator('[data-troy-calendar-reserve="cal-extra-1"]').click();
  await expect(page.locator('#troyReservationPanel')).toBeVisible();
  await expect(page.locator('#reservationStartsAt')).toHaveValue('2026-06-11T18:00');

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
          Level: 21,
          ちから: 7,
          みのまもり: 8,
          すばやさ: 9,
          かしこさ: 10,
          たいりょく: 11,
          HP: 152,
          MaxHP: 160
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
  await expect(page.locator('.home-stat-chip b')).toHaveText(['7', '8', '9', '10', '11', '152/160']);
  await page.setViewportSize({ width: 390, height: 844 });
  const homeStatsFit = await page.locator('.home-stat-panel').evaluate((panel) => {
    const panelRect = panel.getBoundingClientRect();
    return Array.from(panel.children).every((chip) => {
      const chipRect = chip.getBoundingClientRect();
      return chipRect.left >= panelRect.left - 1
        && chipRect.right <= panelRect.right + 1
        && chip.scrollWidth <= chip.clientWidth + 1;
    });
  });
  expect(homeStatsFit).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('.home-transfer-card')).toHaveCount(0);
  await expect(page.locator('#btnScanPay')).toHaveCount(0);
  await expect(page.locator('#btnCoinConvert')).toHaveCount(0);
  await expect(page.locator('#btnCoinGoldConvert')).toHaveCount(0);
  await expect(page.locator('#coinConvertModal')).toHaveCount(0);
  await expect(page.locator('#tabContentHome')).not.toContainText('ゴールド管理');
  await expect(page.locator('#homeRankBenefit .home-rank-benefit-chip')).toHaveText([
    '1杯サイズUP',
    '専用海賊ジョッキ'
  ]);
  const rankBenefitAudit = await page.locator('#homeRankBenefit').evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      whiteSpace: style.whiteSpace,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      ariaLabel: element.getAttribute('aria-label') || ''
    };
  });
  expect(rankBenefitAudit.whiteSpace).not.toBe('nowrap');
  expect(rankBenefitAudit.scrollWidth).toBeLessThanOrEqual(rankBenefitAudit.clientWidth + 1);
  expect(rankBenefitAudit.scrollHeight).toBeLessThanOrEqual(rankBenefitAudit.clientHeight + 1);
  expect(rankBenefitAudit.ariaLabel).toContain('専用の海賊ジョッキ');
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

test('home ship evolution button stays inside the ship panel', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.route('**/api/player-ship/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        ship: {
          shipId: 'ship-home-test',
          form: 'boat',
          name: 'Test Ship',
          upgradeOptions: ['explorer'],
          upgradeCosts: {
            explorer: [{ ItemId: 'PS', Amount: 1000 }]
          }
        }
      })
    });
  });
  await page.route('**/api/get-ship-position', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: 'Ship position not found' })
    });
  });
  await page.route('**/api/get-ship-asset', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        shipData: {
          ShipType: 'Test Ship',
          Domain: 'sea_surface',
          Stats: { CurrentHP: 80, MaxHP: 100, Speed: 7, VisionRange: 4, CargoCapacity: 10, CrewCapacity: 3 },
          Cargo: [],
          Crew: [],
          Equipment: {}
        }
      })
    });
  });

  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    const ship = await import('/js/ship.js');
    await ship.loadPlayerShipProfile('PF_PLAYWRIGHT');
  });
  await expect(page.locator('#homePlayerShipFrame [data-player-ship-evolve]')).toBeVisible();
  await expect(page.locator('#homePlayerShipFrame [data-player-ship-owner]')).toHaveText('自分の船');

  const layout = await page.locator('#homePlayerShipFrame').evaluate((panel) => {
    const button = panel.querySelector('[data-player-ship-evolve]');
    const panelRect = panel.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const panelStyle = window.getComputedStyle(panel);
    return {
      panelTop: panelRect.top,
      panelRight: panelRect.right,
      panelBottom: panelRect.bottom,
      panelLeft: panelRect.left,
      buttonTop: buttonRect.top,
      buttonRight: buttonRect.right,
      buttonBottom: buttonRect.bottom,
      buttonLeft: buttonRect.left,
      computedTop: panelStyle.top,
      computedRight: panelStyle.right
    };
  });

  expect(layout.computedTop).toBe('-108px');
  expect(layout.computedRight).toBe('9px');
  expect(layout.buttonTop).toBeGreaterThanOrEqual(layout.panelTop + 2);
  expect(layout.buttonLeft).toBeGreaterThanOrEqual(layout.panelLeft + 2);
  expect(layout.buttonRight).toBeLessThanOrEqual(layout.panelRight - 2);
  expect(layout.buttonBottom).toBeLessThanOrEqual(layout.panelBottom - 2);

  const shipAudit = await page.locator('#homePlayerShipFrame .home-player-ship-icon').evaluate((el) => ({
    direction: el.getAttribute('data-player-ship-direction'),
    animationName: window.getComputedStyle(el).animationName
  }));
  expect(shipAudit.direction).toBe('row1-a');
  expect(shipAudit.animationName).toContain('homePlayerShipFrameStep');

  await page.locator('#homePlayerShipFrame .home-player-ship-icon').click();
  await expect(page.locator('#shipDetailsModal')).toBeVisible();
  await expect(page.locator('#shipDetailsContent')).toContainText('Test Ship');
  await expect(page.locator('#shipDetailsContent')).toContainText('位置情報は未登録です。');
  await expectNoPageErrors(errors);
});

test('home shared guild ship shows owner label and disables evolution', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.route('**/api/player-ship/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        ship: {
          form: 'fighter',
          name: 'Shared Ship',
          shipOwnerPlayFabId: 'PF_CAPTAIN',
          isSharedShip: true,
          guildId: 'guild-test',
          guildName: 'テスト海賊団',
          captainName: 'テスト船長',
          upgradeOptions: ['merchant'],
          upgradeCosts: {
            merchant: [{ ItemId: 'PS', Amount: 1000 }]
          }
        }
      })
    });
  });

  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    const ship = await import('/js/ship.js');
    await ship.loadPlayerShipProfile('PF_PLAYWRIGHT');
  });

  await expect(page.locator('#homePlayerShipFrame [data-player-ship-owner]')).toHaveText('テスト船長の船');
  await expect(page.locator('#homePlayerShipFrame [data-player-ship-evolve]')).toBeDisabled();
  await expect(page.locator('#homePlayerShipFrame [data-player-ship-rename]')).toBeDisabled();
  await expectNoPageErrors(errors);
});

test('home nation guild ship uses guild ship display for the king owner', async ({ page }) => {
  const errors = trackPageErrors(page);
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
          upgradeOptions: ['merchant'],
          upgradeCosts: {
            merchant: [{ ItemId: 'PS', Amount: 1000 }]
          }
        }
      })
    });
  });

  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    const ship = await import('/js/ship.js');
    await ship.loadPlayerShipProfile('PF_PLAYWRIGHT');
  });

  await expect(page.locator('#homePlayerShipFrame [data-player-ship-owner]')).toHaveText('火の王の船');
  await expect(page.locator('#homePlayerShipFrame [data-player-ship-evolve]')).toBeDisabled();
  await expect(page.locator('#homePlayerShipFrame [data-player-ship-rename]')).toBeDisabled();
  await expect(page.locator('#homePlayerShipFrame .home-player-ship-icon')).toHaveClass(/is-guild/);
  await expect(page.locator('#homePlayerShipFrame .home-guild-ship-layer.is-sail-top')).toHaveClass(/is-red/);
  const layerAudit = await page.locator('#homePlayerShipFrame .home-player-ship-icon').evaluate((el) => {
    const sailTop = el.querySelector('.home-guild-ship-layer.is-sail-top');
    const styles = window.getComputedStyle(sailTop);
    return {
      sailColor: el.getAttribute('data-guild-sail-color'),
      direction: el.getAttribute('data-player-ship-direction'),
      backgroundImage: styles.backgroundImage,
      backgroundPosition: styles.backgroundPosition
    };
  });
  expect(layerAudit.sailColor).toBe('red');
  expect(layerAudit.direction).toBe('guild-left');
  expect(layerAudit.backgroundImage).toContain('guildShips.png');
  expect(layerAudit.backgroundPosition).toContain('-64px');
  await expectNoPageErrors(errors);
});

test('home exploration button loads exploration data in a popup', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.setViewportSize({ width: 900, height: 900 });
  let explorationStatusBody = null;
  await page.route('**/api/get-troy-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        nation: 'fire',
        isOpen: true,
        members: []
      })
    });
  });
  await page.route('**/api/exploration/status', async (route) => {
    explorationStatusBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ship: { shipId: 'ship-test', shipName: 'テスト船', form: 'guild', itemId: 'guild_ship', isGuildShip: true, stage: 3 },
        active: null,
        reports: [{
          id: 'legacy-report',
          destinationName: '過去の探索',
          reportText: 'この履歴は表示しない'
        }],
        stageVersion: 1,
        shipStageCap: 11,
        progress: { version: 1, highestUnlockedStage: 2 },
        stages: [
          makeExplorationStage(1, {
            name: '珊瑚の浅瀬',
            monsters: [
              { monsterId: 'ismartal-vol1-monster-07', monsterName: 'マシュロン' },
              { monsterId: 'ismartal-vol3-monster-04', monsterName: 'プルン' },
              { monsterId: 'ismartal-vol1-monster-01', monsterName: 'トゲマル' },
              { monsterId: 'ismartal-vol2-monster-02', monsterName: 'パピル' }
            ]
          }),
          makeExplorationStage(2, {
            name: '風渡る甲板',
            bestRank: 2,
            clearCount: 3,
            battlefieldId: 'ship-side',
            imagePath: './assets/tarot-kingdom/battlefields/ship-side-v1.webp',
            monsters: [
              { monsterId: 'ismartal-vol3-monster-05', monsterName: 'モクモ' },
              { monsterId: 'ismartal-vol1-monster-04', monsterName: 'ツノガイ' },
              { monsterId: 'ismartal-vol1-monster-10', monsterName: 'リーフロ' },
              { monsterId: 'ismartal-vol1-monster-09', monsterName: 'ホタルビ' }
            ]
          }),
          makeExplorationStage(3, {
            name: '潮騒の島道',
            unlocked: false,
            monsters: [
              { monsterId: 'ismartal-vol1-monster-14', monsterName: 'ポルポ' },
              { monsterId: 'ismartal-vol2-monster-11', monsterName: 'ビズン' },
              { monsterId: 'ismartal-vol3-monster-07', monsterName: 'グールン' },
              { monsterId: 'ismartal-vol1-monster-20', monsterName: 'アクエル' }
            ]
          })
        ],
        explorationSupplies: [
          { itemId: 'troy_menu_drink_a', displayName: 'ラムソーダ', amount: 1, imagePath: './Sprites/drinks/rum.png', effectiveUnits: 1 }
        ]
      })
    });
  });
  await page.route('**/api/get-ranking', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ranking: [
          { displayName: 'Playwright Tester', score: 9000, level: 18, rankName: '航海士', playFabId: 'PF_PLAYWRIGHT' }
        ]
      })
    });
  });

  await bootstrapMainApp(page);

  await expect(page.locator('#btnHomeExploration')).toHaveText('探索に出る');
  await expect(page.locator('#btnHomePlunder')).toBeHidden();
  await page.locator('#btnHomeExploration').click();

  const panel = page.locator('#shipExplorationPanel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveClass(/is-popup/);
  await expect(panel.locator('.ship-exploration-head h3')).toHaveText('探索');
  await expect(panel.locator('.ship-exploration-meta').first()).toContainText('テスト船');
  await expect(panel).not.toContainText('敵船を探す');
  await expect(panel.locator('.ship-exploration-list')).toHaveCount(0);
  await expect(panel.locator('.ship-exploration-list-row')).toHaveCount(0);
  await expect(panel.locator('.ship-exploration-report')).toHaveCount(0);
  await expect(panel).not.toContainText('過去の探索');
  const stageCards = panel.locator('.ship-exploration-stage');
  await expect(stageCards).toHaveCount(3);
  const firstStage = stageCards.nth(0);
  const secondStage = stageCards.nth(1);
  const lockedStage = stageCards.nth(2);
  await expect(firstStage.locator('.ship-exploration-stage-label')).toHaveText('STAGE 1');
  await expect(firstStage.locator('.ship-exploration-title-group strong')).toHaveText('珊瑚の浅瀬');
  await expect(firstStage.locator('.ship-exploration-mapmark img')).toHaveAttribute('src', /coral-island-v1\.webp/);
  await expect(firstStage.locator('.ship-exploration-stage-monster small')).toHaveText(['マシュロン', 'プルン', 'トゲマル', 'パピル']);
  await expect(firstStage.locator('.ship-exploration-stage-order')).toHaveText(['1', '2', '3', '4']);
  await expect(firstStage.locator('.ship-exploration-badge')).toHaveText(['敵4体']);
  await expect(firstStage.locator('.ship-exploration-start')).toHaveText('出航');
  await expect(secondStage.locator('.ship-exploration-meta')).toContainText('最高 2位 / CLEAR 3');
  await expect(lockedStage).toHaveClass(/is-locked/);
  await expect(lockedStage.locator('.ship-exploration-start')).toBeDisabled();
  await expect(lockedStage).toContainText('前のステージで2位以内に入ると解放');
  await expect(panel).not.toContainText(/Gで探索|本日無料|BOSS/);
  const explorationPanelFrame = await firstStage.evaluate((element) => ({
    panelBorder: getComputedStyle(document.getElementById('shipExplorationPanel')).borderImageSource,
    panelSliceSource: document.querySelector('#shipExplorationPanel > .panel-slice-25-layer')?.dataset.source || '',
    destinationBorder: getComputedStyle(element).borderImageSource,
    destinationSliceSource: element.querySelector(':scope > .panel-slice-25-layer')?.dataset.source || '',
    closeBackground: getComputedStyle(document.querySelector('[data-home-exploration-close]')).backgroundImage,
    closeText: document.querySelector('[data-home-exploration-close]')?.textContent || '',
    closeParentClass: document.querySelector('[data-home-exploration-close]')?.parentElement?.className || '',
    headPosition: getComputedStyle(document.querySelector('.ship-exploration-head')).position,
    headTop: getComputedStyle(document.querySelector('.ship-exploration-head')).top,
    globalHeaderZIndex: Number.parseInt(getComputedStyle(document.getElementById('globalStatusBar')).zIndex, 10),
    tabContainerZIndex: Number.parseInt(getComputedStyle(document.getElementById('tabContainer')).zIndex, 10)
  }));
  expect(`${explorationPanelFrame.panelBorder} ${explorationPanelFrame.panelSliceSource}`).toContain('panel-dark-gold.png');
  expect(`${explorationPanelFrame.destinationBorder} ${explorationPanelFrame.destinationSliceSource}`).toContain('panel-parchment.png');
  expect(explorationPanelFrame.closeBackground).toContain('assets/ui/buttons/action-close.png');
  expect(explorationPanelFrame.closeText).toBe('');
  expect(explorationPanelFrame.closeParentClass).toContain('ship-exploration-head');
  expect(explorationPanelFrame.headPosition).toBe('sticky');
  expect(explorationPanelFrame.headTop).toBe('0px');
  expect(explorationPanelFrame.tabContainerZIndex).toBeGreaterThan(explorationPanelFrame.globalHeaderZIndex);
  expect(explorationStatusBody).toMatchObject({ playFabId: 'PF_PLAYWRIGHT' });
  const stageLayout = await panel.evaluate((element) => ({
    panelScrollWidth: element.scrollWidth,
    panelClientWidth: element.clientWidth,
    pageScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth
  }));
  expect(stageLayout.panelScrollWidth).toBeLessThanOrEqual(stageLayout.panelClientWidth);
  expect(stageLayout.pageScrollWidth).toBeLessThanOrEqual(stageLayout.viewportWidth);

  await panel.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(panel.locator('[data-home-exploration-close]')).toBeVisible();
  const explorationNavState = await page.locator('#bottomNav').evaluate((nav) => {
    const panel = document.getElementById('shipExplorationPanel');
    const navStyle = getComputedStyle(nav);
    const panelStyle = getComputedStyle(panel);
    return {
      bodyLocks: document.body.className,
      navPointerEvents: navStyle.pointerEvents,
      navZIndex: Number.parseInt(navStyle.zIndex, 10),
      panelZIndex: Number.parseInt(panelStyle.zIndex, 10),
      isPopupOpen: document.body.classList.contains('home-exploration-popup-open')
    };
  });
  expect(explorationNavState.bodyLocks).not.toContain('modal-lock');
  expect(explorationNavState.navPointerEvents).toBe('auto');
  expect(explorationNavState.navZIndex).toBeGreaterThan(explorationNavState.panelZIndex);
  expect(explorationNavState.isPopupOpen).toBe(true);
  await panel.locator('[data-home-exploration-close]').click();
  await expect(panel).toBeHidden();

  await page.locator('#btnHomeExploration').click();
  await expect(panel).toBeVisible();
  await page.locator('#navRanking').click();
  await expect(page.locator('#navRanking')).toHaveClass(/active/);
  await expect(page.locator('#tabContentRanking')).toBeVisible();
  await expect(panel).toBeHidden();
  expect(await page.evaluate(() => document.body.classList.contains('home-exploration-popup-open'))).toBe(false);

  await expectNoPageErrors(errors);
});

test('exploration popup can retry after its status request fails', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let shouldFail = true;
  let statusRequests = 0;
  await page.route('**/api/exploration/status', async (route) => {
    statusRequests += 1;
    if (shouldFail) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ error: '海域情報を取得できません。' })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ship: { shipId: 'ship-retry', shipName: '再試行号', form: 'boat' },
        active: null,
        reports: [],
        destinations: []
      })
    });
  });

  await bootstrapMainApp(page);
  await page.locator('#btnHomeExploration').click();
  const panel = page.locator('#shipExplorationPanel');
  await expect(panel.locator('[data-exploration-retry]')).toBeVisible();
  shouldFail = false;
  const requestsBeforeRetry = statusRequests;
  await panel.locator('[data-exploration-retry]').click();
  await expect(panel.locator('.ship-exploration-head')).toContainText('再試行号');
  expect(statusRequests).toBeGreaterThan(requestsBeforeRetry);
  await expect(panel.locator('[data-exploration-retry]')).toHaveCount(0);
  await expectNoPageErrors(errors);
});

test('exploration stage starts for free with ordered optional supplies', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let startBody = null;
  let retreatBody = null;
  let claimBody = null;
  await page.route('**/api/get-troy-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ nation: 'fire', isOpen: true, members: [] })
    });
  });
  await page.route('**/api/get-ranking', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ranking: [{ displayName: 'Playwright Tester', score: 9000, level: 18, playFabId: 'PF_PLAYWRIGHT' }] })
    });
  });
  await page.route('**/api/exploration/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ship: { shipId: 'ship-test', shipName: 'テスト船', form: 'explorer', stage: 2 },
        active: null,
        reports: [],
        stageVersion: 1,
        shipStageCap: 8,
        progress: { version: 1, highestUnlockedStage: 1 },
        stages: [makeExplorationStage(1, {
          name: '珊瑚の浅瀬',
          monsters: [
            { monsterId: 'ismartal-vol1-monster-07', monsterName: 'マシュロン' },
            { monsterId: 'ismartal-vol3-monster-04', monsterName: 'プルン' },
            { monsterId: 'ismartal-vol1-monster-01', monsterName: 'トゲマル' },
            { monsterId: 'ismartal-vol2-monster-02', monsterName: 'パピル' }
          ]
        })],
        explorationSupplies: [
          { itemId: 'troy_menu_drink_a', displayName: 'ラムソーダ', amount: 1, imagePath: './Sprites/drinks/rum.png', effectiveUnits: 1 },
          { itemId: 'troy_menu_food_b', displayName: '港町プレート', amount: 2, imagePath: './Sprites/food/plate.png', effectiveUnits: 2 }
        ]
      })
    });
  });
  await page.route('**/api/exploration/start', async (route) => {
    startBody = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 220));
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ship: { shipId: 'ship-test', shipName: 'テスト船', form: 'explorer', stage: 2 },
        active: {
          id: 'exploration-tarot-entry',
          stageNo: 1,
          stageId: 'tarot_stage_1',
          destinationId: 'tarot_stage_1',
          destinationName: '珊瑚の浅瀬',
          imagePath: './assets/tarot-kingdom/battlefields/coral-island-v1.webp',
          shipName: 'テスト船',
          supplyQueue: [
            { itemId: 'troy_menu_drink_a', displayName: 'ラムソーダ', effectiveUnits: 1 },
            { itemId: 'troy_menu_food_b', displayName: '港町プレート', effectiveUnits: 2 }
          ]
        },
        reports: [],
        stages: []
      })
    });
  });
  await page.route('**/api/exploration/encounter', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ship: { shipId: 'ship-test', shipName: 'テスト船', form: 'explorer', stage: 2 },
        active: {
          id: 'exploration-tarot-entry',
          stageNo: 1,
          stageId: 'tarot_stage_1',
          destinationId: 'tarot_stage_1',
          destinationName: '珊瑚の浅瀬',
          imagePath: './assets/tarot-kingdom/battlefields/coral-island-v1.webp'
        },
        encounter: {
          version: 2,
          explorationId: 'exploration-tarot-entry',
          stageNo: 1,
          stageId: 'tarot_stage_1',
          destinationId: 'tarot_stage_1',
          destinationName: '珊瑚の浅瀬',
          battlefieldId: 'coral-island',
          atmosphereTone: 'sunlit-coral',
          monsterId: 'ismartal-vol1-monster-07',
          monsterName: 'マシュロン',
          isBoss: false,
          monsters: [
            { order: 1, monsterId: 'ismartal-vol1-monster-07', monsterName: 'マシュロン', archetype: 'balanced', threatLevel: 1, isBoss: false },
            { order: 2, monsterId: 'ismartal-vol3-monster-04', monsterName: 'プルン', archetype: 'balanced', threatLevel: 2, isBoss: false },
            { order: 3, monsterId: 'ismartal-vol1-monster-01', monsterName: 'トゲマル', archetype: 'guardian', threatLevel: 3, isBoss: false },
            { order: 4, monsterId: 'ismartal-vol2-monster-02', monsterName: 'パピル', archetype: 'swift', threatLevel: 4, isBoss: false }
          ],
          supplyQueue: [
            { itemId: 'troy_menu_drink_a', displayName: 'ラムソーダ', effectiveUnits: 1 },
            { itemId: 'troy_menu_food_b', displayName: '港町プレート', effectiveUnits: 2 }
          ]
        }
      })
    });
  });
  await page.route('**/api/exploration/retreat', async (route) => {
    retreatBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ship: { shipId: 'ship-test', shipName: 'テスト船', form: 'explorer', stage: 2 },
        active: null,
        reports: [],
        retreated: true,
        refundedSupplies: [
          { itemId: 'troy_menu_drink_a', quantity: 1 },
          { itemId: 'troy_menu_food_b', quantity: 1 }
        ],
        progress: { version: 1, highestUnlockedStage: 1 },
        stages: [makeExplorationStage(1, {
          name: '珊瑚の浅瀬',
          monsters: [
            { monsterId: 'ismartal-vol1-monster-07', monsterName: 'マシュロン' },
            { monsterId: 'ismartal-vol3-monster-04', monsterName: 'プルン' },
            { monsterId: 'ismartal-vol1-monster-01', monsterName: 'トゲマル' },
            { monsterId: 'ismartal-vol2-monster-02', monsterName: 'パピル' }
          ]
        })],
        explorationSupplies: [
          { itemId: 'troy_menu_drink_a', displayName: 'ラムソーダ', amount: 1, imagePath: './Sprites/drinks/rum.png', effectiveUnits: 1 },
          { itemId: 'troy_menu_food_b', displayName: '港町プレート', amount: 2, imagePath: './Sprites/food/plate.png', effectiveUnits: 2 }
        ]
      })
    });
  });
  await page.route('**/api/exploration/claim', async (route) => {
    claimBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ship: { shipId: 'ship-test', shipName: 'テスト船', form: 'explorer' },
        active: null,
        reports: [],
        progress: { version: 1, highestUnlockedStage: 2 },
        report: {
          id: 'exploration-tarot-entry',
          stageNo: 1,
          stageId: 'tarot_stage_1',
          destinationId: 'tarot_stage_1',
          destinationName: '珊瑚の浅瀬',
          imagePath: './assets/tarot-kingdom/battlefields/coral-island-v1.webp',
          bossId: 'ismartal-vol2-monster-02',
          bossName: 'パピル',
          bossResult: 'victory',
          monsterId: 'ismartal-vol2-monster-02',
          monsterName: 'パピル',
          monsterIsBoss: false,
          rank: 1,
          monsters: [
            { order: 1, monsterId: 'ismartal-vol1-monster-07', monsterName: 'マシュロン' },
            { order: 2, monsterId: 'ismartal-vol3-monster-04', monsterName: 'プルン' },
            { order: 3, monsterId: 'ismartal-vol1-monster-01', monsterName: 'トゲマル' },
            { order: 4, monsterId: 'ismartal-vol2-monster-02', monsterName: 'パピル' }
          ],
          rewardCount: 1,
          rewardItems: [{ itemId: 'starter_shield', displayName: '見習いの盾', rarity: 'common', quantity: 1 }],
          bossLog: '戦闘開始\n宝箱を発見した。'
        }
      })
    });
  });

  await bootstrapMainApp(page);
  await page.evaluate(() => {
    window.__realExplorationKingdomLauncherAvailable = typeof window.launchTarotKingdomExplorationBattle === 'function';
    window.__explorationKingdomLaunches = [];
    window.launchTarotKingdomExplorationBattle = async (context) => {
      window.__explorationKingdomLaunches.push(context);
      return {
        status: 'completed',
        completed: true,
        outcome: 'victory',
        monsterId: context.monsterId,
        monsterName: context.monsterName,
        isBoss: context.isBoss,
        explorationId: context.explorationId,
        finishers: [
          { roundNo: 1, playerIndex: 0, playFabId: 'PF_PLAYWRIGHT', isNpc: false, monsterId: 'ismartal-vol1-monster-07' },
          { roundNo: 2, playerIndex: 1, playFabId: '', isNpc: true, monsterId: 'ismartal-vol3-monster-04' },
          { roundNo: 3, playerIndex: 0, playFabId: 'PF_PLAYWRIGHT', isNpc: false, monsterId: 'ismartal-vol1-monster-01' },
          { roundNo: 4, playerIndex: 0, playFabId: 'PF_PLAYWRIGHT', isNpc: false, monsterId: 'ismartal-vol2-monster-02' }
        ],
        standings: [
          { playerIndex: 0, playFabId: 'PF_PLAYWRIGHT', isNpc: false, rank: 1, chips: 30 }
        ]
      };
    };
  });
  await page.locator('#btnHomeExploration').click();
  await page.locator('[data-exploration-stage="1"]').click();
  const dialog = page.locator('.ship-exploration-payment-dialog.is-stage-supply');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('局間に使う補給品を順番に3個まで選択（任意）');
  await dialog.locator('[data-stage-supply-item="troy_menu_drink_a"] [data-stage-supply-add]').click();
  await dialog.locator('[data-stage-supply-item="troy_menu_food_b"] [data-stage-supply-add]').click();
  await expect(dialog.locator('[data-stage-supply-slots]')).toContainText('1. ラムソーダ');
  await expect(dialog.locator('[data-stage-supply-slots]')).toContainText('2. 港町プレート');
  await expect(dialog.locator('[data-stage-supply-confirm]')).toHaveText('2個を積んで出航');
  const supplyDialogLayout = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      pageScrollWidth: document.documentElement.scrollWidth
    };
  });
  expect(supplyDialogLayout.left).toBeGreaterThanOrEqual(0);
  expect(supplyDialogLayout.right).toBeLessThanOrEqual(supplyDialogLayout.viewportWidth);
  expect(supplyDialogLayout.bottom).toBeLessThanOrEqual(supplyDialogLayout.viewportHeight);
  expect(supplyDialogLayout.pageScrollWidth).toBeLessThanOrEqual(supplyDialogLayout.viewportWidth);
  await dialog.locator('[data-stage-supply-confirm]').click();

  await expect.poll(() => startBody).not.toBeNull();
  expect(startBody).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    destinationId: 'tarot_stage_1',
    stageNo: 1,
    supplies: [
      { itemId: 'troy_menu_drink_a', quantity: 1 },
      { itemId: 'troy_menu_food_b', quantity: 1 }
    ]
  });
  expect(startBody.paymentMethod).toBeUndefined();
  expect(startBody.paymentConsumables).toBeUndefined();
  const modeChoice = page.locator('.exploration-battle-mode-choice');
  await expect(modeChoice).toBeVisible({ timeout: 7000 });
  await expect(modeChoice.locator('.exploration-battle-mode-head span')).toHaveText('STAGE 1 · 敵4体');
  await expect(modeChoice.locator('.exploration-battle-mode-head strong')).toHaveText('マシュロンが現れた');
  await expect(modeChoice).toContainText('マシュロン');
  await expect(modeChoice).not.toContainText('プルン → トゲマル → パピル');
  await expect(page.getByRole('button', { name: '傭兵召集（オフライン）' })).toBeVisible();
  await expect(page.getByRole('button', { name: '傭兵召集（オフライン）' }).locator('small')).toHaveText('オフライン・3人編成');
  await expect(page.getByRole('button', { name: '救難信号（オンライン）' })).toBeVisible();
  await expect(page.getByRole('button', { name: '撤退' })).toBeVisible();
  const modeChoiceLayout = await modeChoice.evaluate((choice) => {
    const rect = choice.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      pageScrollWidth: document.documentElement.scrollWidth
    };
  });
  expect(modeChoiceLayout.left).toBeGreaterThanOrEqual(0);
  expect(modeChoiceLayout.right).toBeLessThanOrEqual(modeChoiceLayout.viewportWidth);
  expect(modeChoiceLayout.pageScrollWidth).toBeLessThanOrEqual(modeChoiceLayout.viewportWidth);
  expect(await page.evaluate(() => window.__explorationKingdomLaunches?.length || 0)).toBe(0);
  await page.getByRole('button', { name: '撤退' }).click();
  await expect(page.locator('.exploration-sequence-overlay')).toBeHidden();
  await expect.poll(() => retreatBody).not.toBeNull();
  expect(retreatBody).toEqual({
    playFabId: 'PF_PLAYWRIGHT',
    explorationId: 'exploration-tarot-entry'
  });
  await expect(page.locator('#shipExplorationPanel [data-exploration-claim]')).toHaveCount(0);
  await expect(page.locator('#shipExplorationPanel .ship-exploration-start')).toHaveText('出航');
  await page.locator('#shipExplorationPanel [data-exploration-stage="1"]').click();
  const secondSupplyDialog = page.locator('.ship-exploration-payment-dialog.is-stage-supply');
  await expect(secondSupplyDialog).toBeVisible();
  await secondSupplyDialog.locator('[data-stage-supply-confirm]').click();
  await expect(modeChoice).toBeVisible({ timeout: 7_000 });
  await page.getByRole('button', { name: '救難信号（オンライン）' }).click();
  await expect.poll(() => page.evaluate(() => window.__explorationKingdomLaunches?.length || 0), { timeout: 7000 }).toBe(1);
  const kingdomEntry = await page.evaluate(() => ({
    launcherAvailable: window.__realExplorationKingdomLauncherAvailable,
    context: window.__explorationKingdomLaunches[0]
  }));
  expect(kingdomEntry.launcherAvailable).toBe(true);
  expect(kingdomEntry.context).toMatchObject({
    explorationId: 'exploration-tarot-entry',
    stageNo: 1,
    destinationId: 'tarot_stage_1',
    destinationName: '珊瑚の浅瀬',
    isBoss: false,
    mode: 'online'
  });
  expect(kingdomEntry.context.monsterId).toBe('ismartal-vol1-monster-07');
  expect(kingdomEntry.context.monsters).toHaveLength(4);
  await expect.poll(() => Boolean(claimBody)).toBe(true);
  expect(claimBody).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    explorationId: 'exploration-tarot-entry',
    tarotOutcome: 'victory'
  });
  expect(claimBody.tarotFinishers).toHaveLength(4);
  expect(claimBody.tarotFinishers[0]).toMatchObject({
    roundNo: 1,
    playerIndex: 0,
    playFabId: 'PF_PLAYWRIGHT',
    isNpc: false,
    monsterId: 'ismartal-vol1-monster-07'
  });
  expect(claimBody.tarotStandings).toEqual([
    { playerIndex: 0, playFabId: 'PF_PLAYWRIGHT', isNpc: false, rank: 1, chips: 30 }
  ]);
  await expect(page.locator('#tarotModeKingdom')).toBeHidden();
  await expect(page.locator('.exploration-result-overlay')).toBeVisible();
  await expect(page.locator('.exploration-result-boss-copy b')).toHaveText('STAGE 1 / 敵4体');
  await expect(page.locator('.exploration-result-boss-copy strong')).toHaveText('パピル');
  await expect(page.locator('[data-exploration-result-next]')).toHaveText('次のステージへ出航');
  await expectNoPageErrors(errors);
});

test('exploration bridge opens tarot kingdom directly with the selected island monster', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.route('**/api/get-troy-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ nation: 'fire', isOpen: true, members: [] })
    });
  });
  await page.route('**/api/exploration/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ship: null, active: null, reports: [], destinations: [] })
    });
  });
  await page.route('**/api/tarot-kingdom/combat-profiles', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        characters: [{
          version: 1,
          source: 'playfab',
          playFabId: 'PF_PLAYWRIGHT',
          displayName: 'Playwright Tester',
          level: 18,
          rankLabel: '航海士',
          avatarBase: { Race: 'human', SkinColorIndex: 1, HairStyleIndex: 1, HairColorIndex: 1, FaceIndex: 1 },
          equipment: {},
          itemSource: {},
          combat: { maxHp: 120, power: 36, defense: 24, intelligence: 24, speed: 24, weaponType: 'sword' }
        }]
      })
    });
  });

  await bootstrapMainApp(page, { mockFirebaseDatabase: true });
  await page.evaluate(() => {
    window.__explorationBridgePromise = window.launchTarotKingdomExplorationBattle({
      explorationId: 'exp-direct-entry',
      destinationId: 'abyss-route',
      destinationName: '深淵航路',
      monsterId: 'ismartal-vol2-monster-15',
      monsterName: 'アビソス',
      isBoss: true
    });
  });

  await expect(page.locator('#tabContentTarot')).toBeVisible();
  await expect(page.locator('#tarotGameSelectRoot')).toBeHidden();
  await expect(page.locator('#tarotKingdomRoot')).toBeVisible();
  await expect(page.locator('#tarotKingdomEnemyName')).toHaveText('アビソス');
  await expect(page.getByRole('region', { name: '敵モンスター' })).toContainText('BOSS');
  await expect(page.locator('body')).toHaveClass(/tarot-kingdom-exploration-session/);
  await expect(page.locator('body')).toHaveClass(/tarot-kingdom-fullscreen/);
  await expect(page.locator('body')).toHaveAttribute('data-tarot-kingdom-entry-mode', 'offline');
  await expect(page.locator('#tarotKingdomStartOnlineButton')).toBeHidden();
  await expect(page.locator('#tarotKingdomStartOfflineButton')).toBeHidden();
  await expect(page.locator('#tarotKingdomRetreatButton')).toBeHidden();
  await expect(page.locator('#tarotModeKingdom')).toBeHidden();
  await expect(page.locator('#globalStatusBar')).toBeHidden();
  await expect(page.locator('#bottomNav')).toBeHidden();

  const fullscreenFrame = await page.evaluate(() => {
    const root = document.getElementById('tarotKingdomRoot');
    const rect = root?.getBoundingClientRect();
    return {
      top: rect?.top ?? -1,
      left: rect?.left ?? -1,
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });
  expect(fullscreenFrame.top).toBeCloseTo(0, 0);
  expect(fullscreenFrame.left).toBeCloseTo((fullscreenFrame.viewportWidth - fullscreenFrame.width) / 2, 0);
  expect(fullscreenFrame.width).toBeCloseTo(Math.min(fullscreenFrame.viewportWidth, 640), 0);
  expect(fullscreenFrame.height).toBeCloseTo(fullscreenFrame.viewportHeight, 0);

  await page.getByRole('button', { name: 'タロットキングダムを閉じる' }).click();
  await expect(page.locator('#tabContentHome')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/tarot-kingdom-exploration-session/);
  await expect(page.locator('body')).not.toHaveClass(/tarot-kingdom-fullscreen/);
  await expect(page.locator('#globalStatusBar')).toBeVisible();
  await expect(page.locator('#bottomNav')).toBeVisible();
  await expectNoPageErrors(errors);
});

test('exploration rescue signal creates a dedicated online lobby before combat', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.route('**/api/get-troy-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ nation: 'fire', isOpen: true, members: [] })
    });
  });
  await page.route('**/api/exploration/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ship: null, active: null, reports: [], destinations: [] })
    });
  });

  await bootstrapMainApp(page, { mockFirebaseDatabase: true });
  await page.evaluate(() => {
    window.__explorationRescuePromise = window.launchTarotKingdomExplorationBattle({
      explorationId: 'exp-rescue-entry',
      destinationId: 'coral-passage',
      destinationName: '珊瑚礁の抜け道',
      monsterId: 'ismartal-vol2-monster-16',
      monsterName: 'オルビス',
      isBoss: true,
      mode: 'online'
    });
  });

  await expect(page.locator('#tarotKingdomRoot')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-tarot-kingdom-entry-mode', 'online');
  await expect(page.locator('#tarotKingdomStateText')).toContainText('オルビス');
  await expect(page.locator('#tarotKingdomBattleStage')).toBeHidden();
  await expect(page.locator('#tarotKingdomStartOnlineButton')).toContainText(/救難|救援/, { timeout: 7000 });
  await expect(page.locator('#tarotKingdomStartOfflineButton')).toBeHidden();
  await expect(page.locator('#tarotKingdomRetreatButton')).toBeVisible();

  await expect.poll(() => page.evaluate(() => {
    const entries = Array.from(window.__pwFirebaseDbStore?.values?.entries?.() || []);
    const roomEntry = entries.find(([path]) => String(path).startsWith('tarotKingdomMatch/openRooms/'));
    return roomEntry?.[1] || null;
  }), { timeout: 7000 }).toMatchObject({
    kind: 'exploration-rescue',
    monsterName: 'オルビス',
    destinationName: '珊瑚礁の抜け道'
  });

  await page.locator('#tarotKingdomRetreatButton').click();
  await expect(page.locator('#tabContentHome')).toBeVisible();
  await expect.poll(() => page.evaluate(async () => window.__explorationRescuePromise)).toMatchObject({
    status: 'retreated',
    outcome: 'retreated'
  });
  expect(await page.locator('body').getAttribute('data-tarot-kingdom-entry-mode')).toBeNull();
  await expectNoPageErrors(errors);
});

test('legacy naval and melee battle entries are retired from the app', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await bootstrapMainApp(page, { mockFirebaseDatabase: true });

  await expect(page.locator('#btnHomeExploration')).toHaveText('探索に出る');
  await expect(page.locator('#btnHomePlunder')).toHaveCount(0);
  const homeActionLayout = await page.locator('.home-exp-actions').evaluate((actions) => {
    const rect = actions.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      visibleButtons: Array.from(actions.querySelectorAll('button')).filter((button) => !button.hidden).length
    };
  });
  expect(homeActionLayout.left).toBeGreaterThanOrEqual(0);
  expect(homeActionLayout.right).toBeLessThanOrEqual(homeActionLayout.viewportWidth);
  expect(homeActionLayout.pageScrollWidth).toBeLessThanOrEqual(homeActionLayout.viewportWidth);
  expect(homeActionLayout.visibleButtons).toBe(1);
  await expect(page.locator('.qr-battle-card')).toHaveCount(0);
  await expect(page.locator('#btnScanBattle')).toHaveCount(0);
  await expect(page.locator('#navalBattleModal')).not.toBeVisible();
  await expect(page.locator('#battleModal')).not.toBeVisible();

  await expectNoPageErrors(errors);
});

test('exploration event overlays use sliced panels and no moving grid', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  const audit = await page.evaluate(async () => {
    document.querySelectorAll('.exploration-sequence-overlay, .exploration-result-overlay').forEach((element) => element.remove());

    const sequence = document.createElement('div');
    sequence.className = 'exploration-sequence-overlay is-boat is-sky-deep is-voyage is-sail';
    sequence.innerHTML = `
      <div class="exploration-sequence-dialog">
        <div class="exploration-sequence-scene">
          <div class="exploration-sequence-sky"></div>
          <div class="exploration-sequence-horizon"></div>
          <div class="exploration-sequence-route"></div>
          <div class="exploration-sequence-arrival"></div>
          <div class="exploration-sequence-island has-image"><img src="./Sprites/exploration_destinations/pirate_cove_hideout.png" alt=""></div>
          <div class="exploration-sequence-boss"><img class="exploration-boss-image exploration-sequence-boss-image" src="./Sprites/monsters/ghost_pirate.png" alt="boss"><small>BOSS</small></div>
          <div class="exploration-sequence-avatar avatar-combat-actor"></div>
          <div class="exploration-sequence-ship is-boat"></div>
          <div class="exploration-sequence-chests">
            <span class="exploration-sequence-mini-chest" data-exploration-sequence-chest></span>
            <span class="exploration-sequence-mini-chest" data-exploration-sequence-chest></span>
            <span class="exploration-sequence-mini-chest" data-exploration-sequence-chest></span>
            <span class="exploration-sequence-chest-more">+2</span>
          </div>
          <div class="exploration-sequence-log"><div>log</div></div>
        </div>
        <div class="exploration-sequence-copy"><strong>route</strong><span>label</span></div>
        <div class="exploration-sequence-progress" data-exploration-sequence-progress aria-hidden="true"></div>
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
      const panelSliceSource = element.querySelector(':scope > .panel-slice-25-layer')?.dataset.source || '';
      return {
        animationName: style.animationName,
        backgroundImage: style.backgroundImage,
        borderImageSource: style.borderImageSource,
        panelSliceSource,
        borderRadius: style.borderRadius,
        display: style.display,
        filter: style.filter,
        fontSize: style.fontSize,
        height: style.height,
        maxHeight: style.maxHeight,
        maxWidth: style.maxWidth,
        minHeight: style.minHeight,
        objectFit: style.objectFit,
        opacity: style.opacity,
        overflowX: style.overflowX,
        pointerEvents: style.pointerEvents,
        transform: style.transform,
        transitionDuration: style.transitionDuration
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
    const sailIsland = styleOf('.exploration-sequence-island');
    const sailIslandImage = styleOf('.exploration-sequence-island img');
    const sailRoute = styleOf('.exploration-sequence-route');
    sequence.className = 'exploration-sequence-overlay is-boat is-sky-deep is-battle is-result-victory';
    const battleAvatarElement = sequence.querySelector('.exploration-sequence-avatar');
    battleAvatarElement.classList.add('is-avatar-attacking', 'is-avatar-attack-left');
    const battleScene = styleOf('.exploration-sequence-scene');
    const battleShip = styleOf('.exploration-sequence-ship');
    const battleAvatar = styleOf('.exploration-sequence-avatar');
    const battleRoute = styleOf('.exploration-sequence-route');
    const battleIsland = styleOf('.exploration-sequence-island');
    const battleBoss = styleOf('.exploration-sequence-boss');
    const battleBossImage = styleOf('.exploration-sequence-boss-image');
    const battleBossRect = sequence.querySelector('.exploration-sequence-boss').getBoundingClientRect();
    const battleAvatarRect = battleAvatarElement.getBoundingClientRect();
    sequence.className = 'exploration-sequence-overlay is-boat is-sky-deep is-treasure';
    const treasureScene = styleOf('.exploration-sequence-scene');
    const treasureAnimationName = window.getComputedStyle(shipElement).animationName;
    sequence.classList.add('is-opening-chest');
    const sequenceOpeningChest = styleOf('.exploration-sequence-mini-chest');
    const openedDetails = styleOf('.exploration-result-details');
    result.className = 'exploration-result-overlay is-awaiting-open';
    await new Promise((resolve) => setTimeout(resolve, 360));
    const awaitingDetails = styleOf('.exploration-result-details');

    const output = {
      sequenceDialog: styleOf('.exploration-sequence-dialog'),
      sequenceScene: treasureScene,
      sequenceBattleScene: battleScene,
      sequenceBattleShip: battleShip,
      sequenceBattleAvatar: battleAvatar,
      sequenceBattleRoute: battleRoute,
      sequenceBattleIsland: battleIsland,
      sequenceBattleBoss: battleBoss,
      sequenceBattleBossImage: battleBossImage,
      sequenceSailIsland: sailIsland,
      sequenceSailIslandImage: sailIslandImage,
      sequenceBattleBossLeft: battleBossRect.left,
      sequenceBattleAvatarLeft: battleAvatarRect.left,
      sequenceSky: styleOf('.exploration-sequence-sky'),
      sequenceRoute: sailRoute,
      sequenceArrival: styleOf('.exploration-sequence-arrival'),
      sequenceProgress: styleOf('.exploration-sequence-progress'),
      sequenceOpeningChest,
      sequenceChestMore: styleOf('.exploration-sequence-chest-more'),
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

  const panelFrameSource = (entry) => `${entry.borderImageSource || ''} ${entry.panelSliceSource || ''}`;
  const expectPanelFrame = (entry) => expect(panelFrameSource(entry)).toMatch(/assets\/ui\/panels\/|panel-.*\.png/);

  expectPanelFrame(audit.sequenceDialog);
  expectPanelFrame(audit.sequenceScene);
  expect(audit.sequenceScene.backgroundImage).toContain('Sprites/background/deck.webp');
  expect(audit.sequenceBattleScene.backgroundImage).toContain('Sprites/background/deck.webp');
  expect(audit.sequenceBattleShip.opacity).toBe('0');
  expect(audit.sequenceBattleShip.animationName).toBe('none');
  expect(audit.sequenceBattleAvatar.opacity).toBe('1');
  expect(audit.sequenceBattleAvatar.animationName).toContain('avatarCombatAttack');
  expect(audit.sequenceBattleRoute.opacity).toBe('0');
  expect(audit.sequenceBattleIsland.opacity).toBe('0');
  expect(audit.sequenceBattleBoss.animationName).toBe('none');
  expect(audit.sequenceBattleBossImage.transform).toContain('-1');
  expect(audit.sequenceSailIsland.opacity).toBe('1');
  expect(audit.sequenceSailIsland.filter).toContain('brightness');
  expect(audit.sequenceSailIsland.filter).toContain('blur');
  expect(audit.sequenceSailIsland.fontSize).toBe('88px');
  expect(audit.sequenceSailIsland.transform).toBe('none');
  expect(audit.sequenceSailIsland.transitionDuration).toContain('0.32s');
  expect(audit.sequenceSailIslandImage.maxWidth).toBe('100%');
  expect(audit.sequenceSailIslandImage.maxHeight).toBe('100%');
  expect(audit.sequenceSailIslandImage.objectFit).toBe('contain');
  expect(audit.sequenceBattleBossLeft).toBeLessThan(audit.sequenceBattleAvatarLeft);
  expectPanelFrame(audit.sequenceLog);
  expect(audit.sequenceRoute.animationName).toContain('explorationSequenceRoute');
  expect(audit.sequenceRoute.backgroundImage).not.toContain('repeating-linear-gradient');
  expect(audit.sequenceArrival.borderRadius).toBe('50%');
  expect(panelFrameSource(audit.sequenceProgress)).not.toContain('assets/ui/buttons/');
  expect(audit.sequenceOpeningChest.animationName).toContain('explorationSequenceChestPop');
  expect(audit.sequenceOpeningChest.animationName).not.toContain('explorationResultChestOpen');
  expect(audit.sequenceChestMore.borderRadius).toBe('6px');
  expectPanelFrame(audit.resultDialog);
  expect(audit.resultDialog.overflowX).toBe('hidden');
  expectPanelFrame(audit.resultShowcase);
  expectPanelFrame(audit.resultBossCard);
  expect(audit.resultBossImage.height).not.toBe('0px');
  expect(audit.resultDetailsOpened.opacity).toBe('1');
  expect(audit.resultDetailsAwaiting.opacity).toBe('0');
  expect(audit.resultDetailsAwaiting.pointerEvents).toBe('none');
  expectPanelFrame(audit.resultMetric);
  expectPanelFrame(audit.resultReward);
  expectPanelFrame(audit.resultLog);
  expect(audit.sequenceSky.display).toBe('none');
  expect(audit.sequenceSky.animationName).toBe('none');
  expect(audit.sequenceSky.backgroundImage).toBe('none');
  expect(audit.sailAnimationName).toContain('explorationSequenceVoyage');
  expect(audit.sailAnimationName).toContain('homePlayerShipFrameStep');
  expect(Math.abs(audit.shipMotionDelta)).toBeGreaterThan(2);
  expect(Math.abs(audit.shipVerticalDelta)).toBeLessThanOrEqual(1);
  expect(audit.shipFrameCount).toBeGreaterThanOrEqual(2);
  expect(audit.treasureAnimationName).toBe('none');
  expect(audit.treasureAnimationName).not.toContain('explorationSequenceTreasureShip');
  expect(audit.resultClose.height).toBe('32px');
  expect(audit.resultClose.minHeight).toBe('32px');
  expect(audit.resultClose.borderRadius).toBe('50%');
  await expectNoPageErrors(errors);
});

test('exploration result reveals rewards after a tarot kingdom victory', async ({ page }) => {
  const errors = trackPageErrors(page);
  let petChoiceRequest = null;
  let explorationClaimRequest = null;
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
        ship: { shipId: 'ship-test', shipName: 'テスト船', form: 'fighter', stage: 1 },
        active: null,
        reports: [],
        stageVersion: 1,
        shipStageCap: 4,
        progress: { version: 1, highestUnlockedStage: 1 },
        stages: [makeExplorationStage(1, {
          name: '珊瑚の浅瀬',
          monsters: [
            { monsterId: 'ismartal-vol1-monster-07', monsterName: 'マシュロン' },
            { monsterId: 'ismartal-vol3-monster-04', monsterName: 'プルン' },
            { monsterId: 'ismartal-vol1-monster-01', monsterName: 'トゲマル' },
            { monsterId: 'ismartal-vol2-monster-02', monsterName: 'パピル' }
          ]
        })],
        explorationSupplies: []
      })
    });
  });
  await page.route('**/api/exploration/start', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ship: { shipId: 'ship-test', shipName: 'テスト船', form: 'fighter', stage: 1 },
        active: {
          id: 'exploration-reward-test',
          stageNo: 1,
          stageId: 'tarot_stage_1',
          destinationId: 'tarot_stage_1',
          destinationName: '珊瑚の浅瀬',
          imagePath: './assets/tarot-kingdom/battlefields/coral-island-v1.webp',
          shipName: 'テスト船'
        },
        reports: [],
        stages: []
      })
    });
  });
  await page.route('**/api/exploration/encounter', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ship: { shipId: 'ship-test', shipName: 'テスト船', form: 'fighter', stage: 1 },
        active: {
          id: 'exploration-reward-test',
          stageNo: 1,
          stageId: 'tarot_stage_1',
          destinationId: 'tarot_stage_1',
          destinationName: '珊瑚の浅瀬',
          imagePath: './assets/tarot-kingdom/battlefields/coral-island-v1.webp'
        },
        encounter: {
          version: 2,
          explorationId: 'exploration-reward-test',
          stageNo: 1,
          stageId: 'tarot_stage_1',
          destinationId: 'tarot_stage_1',
          destinationName: '珊瑚の浅瀬',
          battlefieldId: 'coral-island',
          atmosphereTone: 'sunlit-coral',
          monsterId: 'ismartal-vol1-monster-07',
          monsterName: 'マシュロン',
          isBoss: false,
          monsters: [
            { order: 1, monsterId: 'ismartal-vol1-monster-07', monsterName: 'マシュロン', archetype: 'balanced', threatLevel: 1, isBoss: false },
            { order: 2, monsterId: 'ismartal-vol3-monster-04', monsterName: 'プルン', archetype: 'balanced', threatLevel: 2, isBoss: false },
            { order: 3, monsterId: 'ismartal-vol1-monster-01', monsterName: 'トゲマル', archetype: 'guardian', threatLevel: 3, isBoss: false },
            { order: 4, monsterId: 'ismartal-vol2-monster-02', monsterName: 'パピル', archetype: 'swift', threatLevel: 4, isBoss: false }
          ],
          supplyQueue: []
        }
      })
    });
  });
  await page.route('**/api/exploration/claim', async (route) => {
    explorationClaimRequest = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ship: { shipId: 'ship-test', shipName: 'テスト船', form: 'fighter' },
        active: null,
        reports: [],
        report: {
          stageNo: 1,
          stageRank: 1,
          destinationId: 'tarot_stage_1',
          destinationName: '珊瑚の浅瀬',
          imagePath: './assets/tarot-kingdom/battlefields/coral-island-v1.webp',
          bossId: 'ismartal-vol2-monster-02',
          bossName: 'パピル',
          bossSpriteId: 'ismartal-vol2-monster-02',
          bossTier: 'stage-1',
          bossTierLabel: 'STAGE 1',
          bossResult: 'victory',
          monsterId: 'ismartal-vol2-monster-02',
          monsterName: 'パピル',
          monsterIsBoss: false,
          rewardCount: 1,
          rewardItems: [{ itemId: 'mist_blade', displayName: '霧切りの刃', rarity: 'rare', quantity: 1 }],
          bossLog: '戦闘開始\n船が島へ接近。\n宝箱を発見した。'
        },
        petOffer: {
          offerId: 'tkpet-exploration-reward-test-ismartal-vol1-monster-01',
          monsterId: 'ismartal-vol1-monster-01',
          monsterName: 'トゲマル',
          explorationId: 'exploration-reward-test',
          rolledAtMs: Date.now(),
          currentPet: {
            monsterId: 'ismartal-vol1-monster-02',
            monsterName: 'グリモア',
            explorationId: 'old-exploration',
            acquiredAtMs: 1000
          }
        }
      })
    });
  });
  await page.route('**/api/tarot-kingdom/pet-state', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        currentPet: {
          monsterId: 'ismartal-vol1-monster-02',
          monsterName: 'グリモア',
          explorationId: 'old-exploration',
          acquiredAtMs: 1000
        },
        pendingOffer: null
      })
    });
  });
  await page.route('**/api/tarot-kingdom/pet-choice', async (route) => {
    petChoiceRequest = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        accepted: true,
        currentPet: {
          monsterId: 'ismartal-vol1-monster-01',
          monsterName: 'トゲマル',
          explorationId: 'exploration-reward-test',
          acquiredAtMs: Date.now()
        },
        pendingOffer: null
      })
    });
  });

  await bootstrapMainApp(page, { fixedHour: 18 });
  await page.evaluate(() => {
    window.launchTarotKingdomExplorationBattle = async (context) => ({
      status: 'completed',
      completed: true,
      outcome: 'victory',
      monsterId: 'ismartal-vol2-monster-02',
      monsterName: 'パピル',
      isBoss: false,
      explorationId: context.explorationId,
      finishers: [
        { roundNo: 1, playerIndex: 1, playFabId: '', isNpc: true, monsterId: 'ismartal-vol1-monster-07', mode: 'offline' },
        { roundNo: 2, playerIndex: 0, playFabId: 'PF_PLAYWRIGHT', isNpc: false, monsterId: 'ismartal-vol3-monster-04', mode: 'offline' },
        { roundNo: 3, playerIndex: 0, playFabId: 'PF_PLAYWRIGHT', isNpc: false, monsterId: 'ismartal-vol1-monster-01', mode: 'offline' },
        { roundNo: 4, playerIndex: 0, playFabId: 'PF_PLAYWRIGHT', isNpc: false, monsterId: 'ismartal-vol2-monster-02', mode: 'offline' }
      ],
      standings: [
        { playerIndex: 0, playFabId: 'PF_PLAYWRIGHT', isNpc: false, chips: 45 },
        { playerIndex: 1, playFabId: '', isNpc: true, chips: 20 },
        { playerIndex: 2, playFabId: '', isNpc: true, chips: 5 }
      ],
      finisher: {
        roundNo: 4,
        playerIndex: 0,
        playFabId: 'PF_PLAYWRIGHT',
        isNpc: false,
        monsterId: 'ismartal-vol2-monster-02',
        mode: 'offline'
      }
    });
  });
  await page.locator('#btnHomeExploration').click();
  await page.locator('#shipExplorationPanel').waitFor({ state: 'visible' });
  await page.locator('.ship-exploration-start').click();
  const supplyDialog = page.locator('.ship-exploration-payment-dialog.is-stage-supply');
  await expect(supplyDialog).toBeVisible();
  await expect(supplyDialog).toContainText('使用できる補給品はありません');
  await supplyDialog.locator('[data-stage-supply-confirm]').click();

  const sequence = page.locator('.exploration-sequence-overlay');
  await expect(sequence).toHaveClass(/is-sail/, { timeout: 15_000 });
  await expect(sequence.locator('[data-exploration-sequence-chest]')).toHaveCount(0);
  await expect(sequence.locator('.exploration-sequence-island img')).toHaveAttribute('src', /coral-island-v1\.webp/);
  await expect(sequence.locator('[data-exploration-sequence-advance]')).toHaveCount(0);
  await expect(sequence.locator('[data-exploration-sequence-progress]')).toBeAttached();
  const readVoyageMetrics = () => sequence.evaluate((element) => {
    const ship = element.querySelector('.exploration-sequence-ship');
    const island = element.querySelector('.exploration-sequence-island');
    const shipRect = ship.getBoundingClientRect();
    const islandRect = island.getBoundingClientRect();
    const islandStyle = getComputedStyle(island);
    return {
      shipLeft: shipRect.left,
      islandWidth: islandRect.width,
      islandHeight: islandRect.height,
      islandOpacity: islandStyle.opacity,
      islandFilter: islandStyle.filter
    };
  });
  const sailMetrics = await readVoyageMetrics();

  await expect(sequence).toHaveClass(/is-up/, { timeout: 5_000 });
  const approachMetrics = await readVoyageMetrics();
  await expect(sequence).toHaveClass(/is-left/, { timeout: 5_000 });
  const landingMetrics = await readVoyageMetrics();
  await expect(sequence).toHaveClass(/is-arrival/, { timeout: 5_000 });
  const arrivalMetrics = await readVoyageMetrics();
  await expect(page.getByRole('button', { name: '傭兵召集（オフライン）' })).toBeVisible({ timeout: 5_000 });
  const encounterMetrics = await readVoyageMetrics();
  const shipLefts = [
    sailMetrics.shipLeft,
    approachMetrics.shipLeft,
    landingMetrics.shipLeft,
    arrivalMetrics.shipLeft,
    encounterMetrics.shipLeft
  ];
  for (let index = 1; index < shipLefts.length; index += 1) {
    expect(shipLefts[index]).toBeGreaterThanOrEqual(shipLefts[index - 1] - 1);
  }
  expect(sailMetrics.islandOpacity).toBe('1');
  expect(encounterMetrics.islandOpacity).toBe('1');
  expect(sailMetrics.islandFilter).toContain('blur');
  expect(Math.abs(encounterMetrics.islandWidth - sailMetrics.islandWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(encounterMetrics.islandHeight - sailMetrics.islandHeight)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: '傭兵召集（オフライン）' }).locator('small')).toHaveText('オフライン・ペット同行4人');
  await page.getByRole('button', { name: '傭兵召集（オフライン）' }).click();
  await expect(sequence).toBeHidden({ timeout: 5_000 });

  const petOffer = page.locator('.tarot-pet-offer-overlay');
  await expect(petOffer).toBeVisible({ timeout: 10_000 });
  await expect(petOffer).toContainText('なんと　トゲマルが');
  await expect(petOffer).toContainText('グリモア と入れ替え');
  await expect(page.locator('.exploration-result-overlay')).toHaveCount(0);
  for (const viewport of [{ width: 390, height: 844 }, { width: 900, height: 900 }]) {
    await page.setViewportSize(viewport);
    const layout = await petOffer.locator('.tarot-pet-offer-dialog').evaluate((dialog) => {
      const rect = dialog.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        pageScrollWidth: document.documentElement.scrollWidth
      };
    });
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.top).toBeGreaterThanOrEqual(0);
    expect(layout.bottom).toBeLessThanOrEqual(layout.viewportHeight);
    expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
  }
  const yesButton = petOffer.locator('[data-tarot-pet-choice="yes"]');
  await expect(yesButton).toBeFocused();
  await yesButton.click();
  await expect(petOffer.locator('.tarot-pet-offer-status')).toHaveText('トゲマルが なかまに くわわった！');
  await expect(petOffer).toBeHidden({ timeout: 5_000 });
  expect(petChoiceRequest).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    offerId: 'tkpet-exploration-reward-test-ismartal-vol1-monster-01',
    accept: true
  });
  expect(explorationClaimRequest.tarotFinisher).toEqual({
    roundNo: 4,
    playerIndex: 0,
    playFabId: 'PF_PLAYWRIGHT',
    isNpc: false,
    monsterId: 'ismartal-vol2-monster-02',
    mode: 'offline'
  });
  expect(explorationClaimRequest.tarotFinishers).toHaveLength(4);
  expect(explorationClaimRequest.tarotStandings).toHaveLength(3);

  const result = page.locator('.exploration-result-overlay');
  await expect(result).toHaveClass(/is-awaiting-open/, { timeout: 15_000 });
  await result.locator('[data-exploration-result-open]').click();
  await expect(result).toHaveClass(/is-opened/, { timeout: 5_000 });
  await expect(result.locator('.exploration-result-details')).toHaveCSS('opacity', '1');
  await expect(result.locator('.exploration-result-reward')).toContainText('霧切りの刃');
  await expect(result.locator('[data-exploration-result-state]')).toHaveText('勝利');
  expect(await result.locator('.exploration-result-dialog').evaluate((element) => getComputedStyle(element).overflowX)).toBe('hidden');
  await expect(result.locator('[data-exploration-result-open]')).toBeDisabled();
  await expect(result.locator('.exploration-result-boss-card')).toHaveAttribute('data-exploration-boss-id', 'ismartal-vol2-monster-02');
  await expect(result.locator('.exploration-result-boss-image')).toHaveCSS('background-image', /pixel-monsters\/vol2\/monster-02\/idle\.png/);
  await expect(result.locator('.exploration-result-boss-copy b')).toHaveText('STAGE 1 / 敵4体');
  await expect(result.locator('.exploration-result-boss-copy strong')).toHaveText('パピル');
  await expect(result.locator('.exploration-result-boss-copy span')).toHaveText('STAGE 1 / 敵4体 / 勝利');
  await expect(result.locator('.exploration-result-body')).toContainText('1位 / タロットキングダム勝利');
  await expect(result.locator('.exploration-result-reward')).toContainText('RARE');
  await expect(result.locator('.exploration-result-chest')).toHaveCSS('animation-name', 'none');

  await result.locator('[data-exploration-result-close]').click();
  await expect(result).toBeHidden();
  await expect(page.locator('#shipExplorationPanel')).toBeHidden();
  expect(await page.evaluate(() => document.body.classList.contains('modal-lock'))).toBe(false);
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
            かしこさ: 9,
            たいりょく: 8,
            HP: 140,
            MaxHP: 152
          },
          avatarBase: {
            Race: 'human',
            Nation: 'water',
            AvatarColor: 'blue',
            SkinColorIndex: 1,
            FaceIndex: 1,
            HairStyleIndex: 1,
            level: 18
          },
          playerShip: {
            form: 'explorer',
            stage: 2
          },
          specialAbility: {
            name: '星渡りの門',
            alias: 'アストラル・ゲート',
            effect: '離れた場所を光の通路で結び、仲間や物を安全に移動させられる。',
            rule: '行き先を見ながら両手で入口の輪を描くと発動する。',
            affinity: '特質',
            type: 'INTJ',
            tempo: 0.25,
            scores: { E: -1, S: -1, T: 1, J: 1 }
          },
          equipment: {
            RightHand: 'polearm_001'
          },
          itemSource: {
            polearm_001: {
              itemId: 'polearm_001',
              customData: {
                Category: 'Weapon',
                sprite_path: './Sprites/weapons/melee weapons/polearm.png',
                sprite_index: '0',
                sprite_w: '32',
                sprite_h: '64',
                TwoHanded: 'true'
              }
            }
          },
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
  await expect(page.locator('#btnPlayerProfileTransfer')).toBeVisible();
  await expect(page.locator('#btnPlayerProfileTransfer')).toHaveText('G');
  await expect(page.locator('#btnPlayerProfileFavorite')).toBeVisible();
  await expect(page.locator('#btnPlayerProfileFavorite')).toHaveText('♡');
  await expect(page.locator('#btnPlayerProfileFavorite')).toHaveAttribute('aria-label', 'お気に入りに追加');
  await expect(page.locator('#btnPlayerProfileBeauty')).toBeHidden();
  await expect(page.locator('#playerProfileTransferPanel')).toBeHidden();
  await expect(page.locator('#playerProfileStatAllocation')).toBeHidden();
  await expect(page.locator('#playerProfileSpecialAbility')).toBeVisible();
  await expect(page.locator('#playerProfileSpecialAbilityAffinity')).toHaveText('特質系');
  await expect(page.locator('#playerProfileSpecialAbilityName')).toHaveText('星渡りの門');
  await expect(page.locator('#playerProfileSpecialAbilityAlias')).toHaveText('アストラル・ゲート');
  await expect(page.locator('#playerProfileSpecialAbilityEffect')).toContainText('光の通路');
  await expect(page.locator('#playerProfileSpecialAbilityRule')).toContainText('入口の輪');
  await expect(page.locator('#playerProfileSpecialAbility')).not.toContainText(/INTJ|tempo|scores/);
  await expect(page.locator('#playerProfileStats .player-profile-stat strong')).toHaveText(['12', '11', '10', '9', '8', '152']);
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
    const avatarLayerRects = Array.from(avatarInner?.querySelectorAll('.avatar-layer') || [])
      .filter((layer) => window.getComputedStyle(layer).backgroundImage !== 'none')
      .map((layer) => layer.getBoundingClientRect());
    const avatarLayerBounds = avatarLayerRects.reduce((acc, rect) => ({
      left: Math.min(acc.left, rect.left),
      top: Math.min(acc.top, rect.top),
      right: Math.max(acc.right, rect.right),
      bottom: Math.max(acc.bottom, rect.bottom)
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const shipRect = ship?.getBoundingClientRect();
    const copyRect = copy?.getBoundingClientRect();
    const firstStatRect = firstStat?.getBoundingClientRect();
    return {
      statsRight: statsRect?.right || 0,
      avatarLeft: avatarRect?.left || 0,
      avatarTop: avatarRect?.top || 0,
      avatarRight: avatarRect?.right || 0,
      avatarBottom: avatarRect?.bottom || 0,
      avatarWidth: avatarRect?.width || 0,
      avatarCenterDelta: Math.abs(
        ((avatarInnerRect?.left || 0) + (avatarInnerRect?.width || 0) / 2)
        - ((avatarRect?.left || 0) + (avatarRect?.width || 0) / 2)
      ),
      avatarTransform: avatarInner ? window.getComputedStyle(avatarInner).transform : '',
      copyRight: copyRect?.right || 0,
      shipTop: shipRect?.top || 0,
      shipLeft: shipRect?.left || 0,
      shipRight: shipRect?.right || 0,
      layerBounds: {
        left: avatarLayerBounds.left,
        top: avatarLayerBounds.top,
        right: avatarLayerBounds.right,
        bottom: avatarLayerBounds.bottom
      },
      statHeight: firstStatRect?.height || 0
    };
  });
  expect(layout.avatarLeft).toBeGreaterThan(layout.statsRight);
  expect(layout.avatarRight).toBeGreaterThan(layout.copyRight);
  expect(layout.shipTop).toBeGreaterThan(layout.avatarBottom);
  expect(Math.abs(layout.shipLeft - layout.avatarLeft)).toBeLessThanOrEqual(2);
  expect(Math.abs(layout.shipRight - layout.avatarRight)).toBeLessThanOrEqual(2);
  expect(layout.avatarWidth).toBeGreaterThanOrEqual(130);
  expect(layout.avatarCenterDelta).toBeLessThanOrEqual(12);
  expect(layout.avatarTransform).toContain('matrix');
  expect(layout.layerBounds.left).toBeGreaterThanOrEqual(layout.avatarLeft - 1);
  expect(layout.layerBounds.top).toBeGreaterThanOrEqual(layout.avatarTop - 1);
  expect(layout.layerBounds.right).toBeLessThanOrEqual(layout.avatarRight + 1);
  expect(layout.layerBounds.bottom).toBeLessThanOrEqual(layout.avatarBottom + 1);
  expect(layout.statHeight).toBeLessThanOrEqual(36);
  await expectNoPageErrors(errors);
});

test('own player profile allocates level-up stat points', async ({ page }) => {
  const errors = trackPageErrors(page);
  let allocationRequest = null;
  const profileStats = {
    Level: 3,
    ちから: 4,
    みのまもり: 6,
    すばやさ: 8,
    かしこさ: 9,
    たいりょく: 5,
    HP: 84,
    MaxHP: 88
  };
  const initialAllocation = {
    pointsPerLevel: 5,
    level: 3,
    totalEarned: 10,
    totalAllocated: 5,
    availablePoints: 5,
    hpPerVitality: 4,
    stats: {
      str: { id: 'str', stat: 'ちから', label: '力', value: 4, allocated: 2 },
      def: { id: 'def', stat: 'みのまもり', label: '守', value: 6, allocated: 1 },
      agi: { id: 'agi', stat: 'すばやさ', label: '速', value: 8, allocated: 1 },
      int: { id: 'int', stat: 'かしこさ', label: '知', value: 9, allocated: 1 },
      vit: { id: 'vit', stat: 'たいりょく', label: '体', value: 5, allocated: 0 }
    }
  };
  await page.route('**/api/get-player-public-profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        profile: {
          playFabId: 'PF_PLAYWRIGHT',
          displayName: 'Playwright Tester',
          nation: 'fire',
          level: 3,
          stats: profileStats,
          statAllocation: initialAllocation,
          avatarBase: {
            Race: 'human',
            Nation: 'fire',
            AvatarColor: 'red',
            level: 3
          },
          playerShip: {
            form: 'boat',
            stage: 1
          },
          equipment: {},
          itemSource: {},
          equipmentList: []
        }
      })
    });
  });
  await page.route('**/api/allocate-stat-points', async (route) => {
    allocationRequest = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        allocatedPoints: 3,
        stats: {
          ...profileStats,
          ちから: 5,
          みのまもり: 7,
          たいりょく: 6,
          HP: 88,
          MaxHP: 92,
          StatPointSpent_Str: 3,
          StatPointSpent_Def: 2,
          StatPointSpent_Vit: 1
        },
        statAllocation: {
          ...initialAllocation,
          totalAllocated: 8,
          availablePoints: 2,
          stats: {
            ...initialAllocation.stats,
            str: { ...initialAllocation.stats.str, value: 5, allocated: 3 },
            def: { ...initialAllocation.stats.def, value: 7, allocated: 2 },
            vit: { ...initialAllocation.stats.vit, value: 6, allocated: 1 }
          }
        }
      })
    });
  });
  await page.route('**/api/get-stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        stats: {
          ...profileStats,
          ちから: 5,
          みのまもり: 7,
          たいりょく: 6,
          HP: 88,
          MaxHP: 92
        }
      })
    });
  });
  await bootstrapMainApp(page);

  await page.evaluate(async () => {
    const profile = await import('/js/playerProfile.js');
    await profile.openPlayerProfile('PF_PLAYWRIGHT');
  });

  await expect(page.locator('#playerProfileModal')).toBeVisible();
  await expect(page.locator('#playerProfileStatAllocation')).toBeVisible();
  await expect(page.locator('#playerProfileStatAllocation .player-profile-stat-alloc-head b')).toHaveText('5pt');
  await page.locator('[data-profile-stat-alloc="str"][data-profile-stat-delta="1"]').click();
  await page.locator('[data-profile-stat-alloc="def"][data-profile-stat-delta="1"]').click();
  await page.locator('[data-profile-stat-alloc="vit"][data-profile-stat-delta="1"]').click();
  await expect(page.locator('#playerProfileStatAllocation .player-profile-stat-alloc-head b')).toHaveText('2pt');
  await expect(page.locator('.player-profile-stat-alloc-row').nth(0).locator('.player-profile-stat-alloc-value')).toHaveText('5');
  await expect(page.locator('.player-profile-stat-alloc-row').nth(1).locator('.player-profile-stat-alloc-value')).toHaveText('7');
  await expect(page.locator('.player-profile-stat-alloc-row').nth(4).locator('.player-profile-stat-alloc-value')).toHaveText('6');
  await page.locator('[data-profile-stat-alloc-save]').click();

  await expect.poll(() => allocationRequest?.allocations?.vit || 0).toBe(1);
  expect(allocationRequest).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    allocations: { str: 1, def: 1, vit: 1 }
  });
  await expect(page.locator('#playerProfileStats .player-profile-stat strong')).toHaveText(['5', '7', '8', '9', '6', '92']);
  await expect(page.locator('#playerProfileStatAllocation .player-profile-stat-alloc-head b')).toHaveText('2pt');
  await expectNoPageErrors(errors);
});

test('own player profile hides stat allocation when no points are available', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.route('**/api/get-player-public-profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        profile: {
          playFabId: 'PF_PLAYWRIGHT',
          displayName: 'Playwright Tester',
          nation: 'fire',
          level: 2,
          stats: {
            Level: 2,
            ちから: 5,
            みのまもり: 5,
            すばやさ: 5,
            かしこさ: 5
          },
          statAllocation: {
            pointsPerLevel: 5,
            level: 2,
            totalEarned: 5,
            totalAllocated: 5,
            availablePoints: 0,
            stats: {
              str: { id: 'str', stat: 'ちから', label: '力', value: 5, allocated: 2 },
              def: { id: 'def', stat: 'みのまもり', label: '守', value: 5, allocated: 1 },
              agi: { id: 'agi', stat: 'すばやさ', label: '速', value: 5, allocated: 1 },
              int: { id: 'int', stat: 'かしこさ', label: '知', value: 5, allocated: 1 }
            }
          },
          avatarBase: {
            Race: 'human',
            Nation: 'fire',
            AvatarColor: 'red',
            level: 2
          },
          playerShip: {
            form: 'boat',
            stage: 1
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
    await profile.openPlayerProfile('PF_PLAYWRIGHT');
  });

  await expect(page.locator('#playerProfileModal')).toBeVisible();
  await expect(page.locator('#playerProfileStatAllocation')).toBeHidden();
  await expect(page.locator('#playerProfileStatAllocation')).toBeEmpty();
  await expectNoPageErrors(errors);
});

test('player profile transfer panel stays inside the sheet on narrow screens', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.setViewportSize({ width: 320, height: 720 });
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
            Level: 18
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
  await expect(page.locator('#playerProfileTransferPanel')).toBeHidden();
  await page.locator('#btnPlayerProfileTransfer').click();
  await expect(page.locator('#playerProfileTransferPanel')).toBeVisible();

  const audit = await page.evaluate(() => {
    const panel = document.getElementById('playerProfileTransferPanel');
    const sheet = document.querySelector('#playerProfileModal .player-profile-sheet');
    const ship = document.querySelector('#playerProfileModal .player-profile-ship');
    const shipIcon = document.querySelector('#playerProfileModal .player-profile-ship-icon');
    const panelRect = panel.getBoundingClientRect();
    const sheetRect = sheet.getBoundingClientRect();
    const shipRect = ship.getBoundingClientRect();
    const shipIconRect = shipIcon.getBoundingClientRect();
    const shipIconStyle = window.getComputedStyle(shipIcon);
    const selectors = [
      '#playerProfileTransferPanel',
      '#playerProfileModal .player-profile-transfer-title',
      '#playerProfileModal .player-profile-transfer-quick-row',
      '#playerProfileModal .player-profile-transfer-input-row',
      '#playerProfileModal .player-profile-transfer-actions',
      '#btnPlayerProfileTransferSubmit'
    ];
    const entries = selectors.map((selector) => {
      const element = document.querySelector(selector);
      const rect = element.getBoundingClientRect();
      return {
        selector,
        left: rect.left,
        right: rect.right,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth
      };
    });
    const quickButtons = Array.from(document.querySelectorAll('#playerProfileModal .player-profile-transfer-quick-btn')).map((button) => ({
      text: button.textContent.trim(),
      scrollWidth: button.scrollWidth,
      clientWidth: button.clientWidth
    }));
    return {
      viewportWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      sheetLeft: sheetRect.left,
      sheetRight: sheetRect.right,
      sheetScrollWidth: sheet.scrollWidth,
      sheetClientWidth: sheet.clientWidth,
      panelLeft: panelRect.left,
      panelRight: panelRect.right,
      panelScrollWidth: panel.scrollWidth,
      panelClientWidth: panel.clientWidth,
      entries,
      quickButtons,
      shipRight: shipRect.right,
      shipIconRight: shipIconRect.right,
      shipIconWidth: shipIconRect.width,
      shipIconHeight: shipIconRect.height,
      shipIconBackgroundSize: shipIconStyle.backgroundSize,
      shipIconBackgroundPosition: shipIconStyle.backgroundPosition
    };
  });

  expect(audit.pageScrollWidth).toBeLessThanOrEqual(audit.viewportWidth + 1);
  expect(audit.sheetScrollWidth).toBeLessThanOrEqual(audit.sheetClientWidth + 1);
  expect(audit.panelScrollWidth).toBeLessThanOrEqual(audit.panelClientWidth + 1);
  expect(audit.entries.filter((entry) => (
    entry.left < audit.panelLeft - 1
    || entry.right > audit.panelRight + 1
    || entry.scrollWidth > entry.clientWidth + 1
  ))).toEqual([]);
  expect(audit.quickButtons.filter((button) => button.scrollWidth > button.clientWidth + 1)).toEqual([]);
  expect(audit.shipIconRight).toBeLessThanOrEqual(audit.shipRight + 1);
  expect(audit.shipIconWidth).toBe(56);
  expect(audit.shipIconHeight).toBe(56);
  expect(audit.shipIconBackgroundSize).toBe('1792px 896px');
  expect(audit.shipIconBackgroundPosition).toContain('-392px');
  expect(audit.shipIconBackgroundPosition).toContain('-56px');
  await expectNoPageErrors(errors);
});

test('panel frame assets are applied through border-image slices', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await expect(page.locator('#tabContentCompanions #btnReloadCompanions')).toHaveCount(0);

  const audit = await page.evaluate(() => {
    const selectors = [
      '#globalPlayerInfoTop',
      '.home-exp-card',
      '.home-ps-card',
      '#bottomNav',
      '.nav-button',
      '#rankingToggleButtons',
      '#tabContentInventory .inventory-section',
      '#avatarStyleModal .avatar-style-panel',
      '#playerProfileStatAllocation',
      '#tabContentInventory .equip-slot',
      '#tabContentCompanions .companion-list-panel',
      '#tabContentCompanions .companion-card',
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
          borderImageSource: style.borderImageSource,
          panelSliceSource: element.querySelector(':scope > .panel-slice-25-layer')?.dataset.source || ''
        };
      })
      .filter(Boolean);
  });

  expect(audit.length).toBeGreaterThanOrEqual(8);
  expect(audit.filter((entry) => /assets\/ui\/panels\//.test(entry.backgroundImage))).toEqual([]);
  expect(audit.filter((entry) => (
    !/assets\/ui\/panels\//.test(entry.borderImageSource)
    && !/assets\/ui\/buttons\//.test(entry.borderImageSource)
    && !/panel-.*\.png/.test(entry.panelSliceSource)
  ))).toEqual([]);
  await expectNoPageErrors(errors);
});

test('king OPEN button uses the current gold button frame', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  const openButton = await page.locator('#btnKingTroyOpen').evaluate((button) => {
    const style = window.getComputedStyle(button);
    return {
      borderImageSource: style.borderImageSource,
      borderImageSlice: style.borderImageSlice,
      borderImageWidth: style.borderImageWidth,
      color: style.color,
      textShadow: style.textShadow
    };
  });

  expect(openButton.borderImageSource).toContain('button-gold-large.png');
  expect(openButton.borderImageSlice).toContain('24');
  expect(openButton.borderImageWidth).toContain('10px');
  expect(openButton.color).toBe('rgb(29, 14, 4)');
  expect(openButton.textShadow).toContain('rgb');
  await expectNoPageErrors(errors);
});

test('king page shows TROY entry QR from priority controls', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);
  await page.unroute('**/api/get-nation-king-page');
  await page.route('**/api/get-nation-king-page', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        nation: 'fire',
        troyOpen: false,
        troyMembers: [],
        announcement: { message: 'Map systems nominal' }
      })
    });
  });

  await page.evaluate(async () => {
    const king = await import('/js/nationKing.js');
    await king.refreshKingNav('PF_PLAYWRIGHT');
    await window.showTab('king', { playFabId: 'PF_PLAYWRIGHT', race: 'human', nation: 'fire' });
  });
  await expect(page.locator('#tabContentKing')).toBeVisible();
  await expect(page.locator('#btnKingTroyEntryQr')).toBeHidden();

  await page.unroute('**/api/get-nation-king-page');
  await page.route('**/api/get-nation-king-page', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        nation: 'fire',
        troyOpen: true,
        troyMembers: [],
        announcement: { message: 'Map systems nominal' }
      })
    });
  });
  await page.evaluate(async () => {
    const king = await import('/js/nationKing.js');
    await king.loadKingPage('PF_PLAYWRIGHT');
  });
  await expect(page.locator('[data-king-section-tab="ops"]')).toHaveClass(/is-active/);
  await expect(page.locator('#btnKingTroyEntryQr')).toBeVisible();
  await page.locator('[data-king-section-tab="store"]').click();
  await expect(page.locator('[data-king-section-panel="store"]')).toBeVisible();
  await expect(page.locator('#btnKingTroyEntryQr')).toBeHidden();
  await page.locator('[data-king-section-tab="ops"]').click();
  await expect(page.locator('[data-king-section-panel="ops"]')).toBeVisible();
  await expect(page.locator('#btnKingTroyEntryQr')).toBeVisible();
  await page.locator('#btnKingTroyEntryQr').click();

  const qrValue = await page.locator('#kingTroyEntryQrValue').inputValue();
  expect(qrValue).toContain('action=troy-entry');
  expect(qrValue).toContain('troyNation=fire');
  await expect(page.locator('#kingTroyEntryQrModal')).toBeVisible();
  await expect(page.locator('#kingTroyEntryQrCanvas')).toHaveAttribute('width', '300');

  await page.locator('#btnKingTroyEntryQrClose').click();
  await expect(page.locator('#kingTroyEntryQrModal')).toBeHidden();
  await expectNoPageErrors(errors);
});

test('king calendar panel shows reservation review actions', async ({ page }) => {
  const errors = trackPageErrors(page);
  const reviewRequests = [];
  let reservationStatus = 'pending';

  await bootstrapMainApp(page);
  await page.unroute('**/api/get-nation-king-page');
  await page.route('**/api/get-nation-king-page', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        nation: 'fire',
        troyOpen: false,
        troyMembers: [],
        announcement: { message: 'Map systems nominal' }
      })
    });
  });
  await page.route('**/api/troy-calendar/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ calendar: [] })
    });
  });
  await page.route('**/api/reservations/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        isKing: true,
        reservations: [{
          id: 'RESERVE1',
          startsAtMs: Date.parse('2026-06-15T21:00:00+09:00'),
          partySize: 4,
          purpose: 'visit',
          purposeLabel: '来店',
          status: reservationStatus,
          displayName: '予約太郎',
          note: '奥の席希望',
          canReview: reservationStatus === 'pending'
        }]
      })
    });
  });
  await page.route('**/api/reservations/review', async (route) => {
    const body = route.request().postDataJSON();
    reviewRequests.push(body);
    reservationStatus = body.approve ? 'approved' : 'rejected';
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true })
    });
  });

  await page.evaluate(async () => {
    const king = await import('/js/nationKing.js');
    await king.refreshKingNav('PF_PLAYWRIGHT');
    await window.showTab('king', { playFabId: 'PF_PLAYWRIGHT', race: 'human', nation: 'fire' });
  });

  await page.locator('[data-king-section-tab="calendar"]').click();
  const reservationPanel = page.locator('#kingTroyReservationMount');
  await expect(reservationPanel).toBeVisible();
  await expect(reservationPanel).toContainText('予約申請');
  await expect(reservationPanel).toContainText('予約太郎');
  await expect(reservationPanel).toContainText('奥の席希望');
  await expect(reservationPanel.locator('[data-reservation-review="RESERVE1"][data-reservation-approve="true"]')).toBeVisible();

  await reservationPanel.locator('[data-reservation-review="RESERVE1"][data-reservation-approve="true"]').click();
  await expect.poll(() => reviewRequests.length).toBe(1);
  expect(reviewRequests[0]).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    reservationId: 'RESERVE1',
    approve: true
  });
  await expect(reservationPanel).toContainText('承認済み');
  await expect(reservationPanel.locator('[data-reservation-review="RESERVE1"]')).toHaveCount(0);

  await expectNoPageErrors(errors);
});

test('king calendar save reports Google Business Profile sync and surfaces API failures', async ({ page }) => {
  const errors = trackPageErrors(page);
  const saveRequests = [];
  const syncStatusRequests = [];
  const reviewDetailsRequests = [];
  const reviewApprovalRequests = [];
  let calendarEntries = [];
  let saveShouldFail = false;
  let syncResponse = { status: 'queued', queued: true };
  let syncStatusResponse = { status: 'up_to_date', updated: false };

  await bootstrapMainApp(page);
  await page.unroute('**/api/get-nation-king-page');
  await page.route('**/api/get-nation-king-page', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        nation: 'fire',
        troyOpen: false,
        troyMembers: [],
        announcement: { message: 'Map systems nominal' }
      })
    });
  });
  await page.route('**/api/troy-calendar/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ calendar: calendarEntries })
    });
  });
  await page.route('**/api/reservations/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ isKing: true, reservations: [] })
    });
  });
  await page.route('**/api/troy-calendar/save', async (route) => {
    const body = route.request().postDataJSON();
    saveRequests.push(body);
    if (saveShouldFail) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ error: 'FailedToSaveTroyCalendar' })
      });
      return;
    }
    calendarEntries = [{
      id: 'CAL-SYNCED',
      nation: 'global',
      date: body.date,
      openTime: body.openTime,
      closeTime: body.closeTime,
      status: body.status,
      title: body.title,
      note: body.note,
      startsAtMs: Date.parse(`${body.date}T${body.openTime}:00+09:00`),
      updatedAtMs: Date.now()
    }];
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        entry: calendarEntries[0],
        googleBusinessProfileSync: body.googleBusinessProfileConsent === true
          ? syncResponse
          : { status: 'not_requested', queued: false }
      })
    });
  });
  await page.route('**/api/troy-calendar/google-sync-status', async (route) => {
    syncStatusRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, googleBusinessProfileSync: syncStatusResponse })
    });
  });
  await page.route('**/api/troy-calendar/google-sync-review-details', async (route) => {
    reviewDetailsRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        googleBusinessProfileReview: {
          status: 'review_required',
          reviewRequired: true,
          reviewHash: 'a'.repeat(64),
          reason: 'remote_conflict',
          remoteSpecialHours: [{
            startDate: { year: 2026, month: 8, day: 5 },
            closed: true
          }],
          proposedSpecialHours: [{
            startDate: { year: 2026, month: 8, day: 5 },
            openTime: { hours: 21, minutes: 0 },
            endDate: { year: 2026, month: 8, day: 6 },
            closeTime: { hours: 1, minutes: 30 }
          }]
        }
      })
    });
  });
  await page.route('**/api/troy-calendar/google-sync-review-approve', async (route) => {
    reviewApprovalRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        googleBusinessProfileSync: { status: 'queued', queued: true }
      })
    });
  });

  await page.evaluate(async () => {
    window.__TROY_CALENDAR_SYNC_POLL_DELAYS_MS = [10];
    const king = await import('/js/nationKing.js');
    await king.refreshKingNav('PF_PLAYWRIGHT');
    await window.showTab('king', { playFabId: 'PF_PLAYWRIGHT', race: 'human', nation: 'fire' });
  });
  await page.locator('[data-king-section-tab="calendar"]').click();
  await expect.poll(() => syncStatusRequests.length).toBe(1);
  expect(syncStatusRequests[0]).toEqual({ playFabId: 'PF_PLAYWRIGHT' });
  await page.locator('#kingTroyCalendarDate').fill('2026-08-01');
  await page.locator('#kingTroyCalendarOpenTime').fill('21:00');
  await page.locator('#kingTroyCalendarCloseTime').fill('23:59');
  await page.locator('#kingTroyCalendarTitle').fill('通常営業');
  await expect(page.locator('#kingTroyCalendarGoogleConsent')).not.toBeChecked();
  await page.locator('#kingTroyCalendarGoogleConsent').check();
  await page.locator('#kingTroyCalendarTitle').fill('通常営業（確認後に変更）');
  await expect(page.locator('#kingTroyCalendarGoogleConsent')).not.toBeChecked();
  await page.locator('#kingTroyCalendarTitle').fill('通常営業');
  await page.locator('#btnKingTroyCalendarSave').click();
  await expect.poll(() => saveRequests.length).toBe(1);
  expect(saveRequests[0].googleBusinessProfileConsent).toBeUndefined();
  expect(saveRequests[0].consentVersion).toBeUndefined();
  expect(saveRequests[0].operationId).toBeUndefined();
  await expect(page.locator('#kingPageMessage')).toHaveText('営業予定を保存しました。');

  await page.locator('#kingTroyCalendarDate').fill('2026-08-02');
  await page.locator('#kingTroyCalendarTitle').fill('通常営業');
  await page.locator('#kingTroyCalendarGoogleConsent').check();
  syncStatusResponse = { status: 'synced', updated: true };
  await page.locator('#btnKingTroyCalendarSave').click();

  await expect.poll(() => saveRequests.length).toBe(2);
  expect(saveRequests[1]).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    date: '2026-08-02',
    openTime: '21:00',
    closeTime: '23:59',
    status: 'open',
    title: '通常営業',
    googleBusinessProfileConsent: true,
    consentVersion: 'gbp-special-hours-v1'
  });
  expect(saveRequests[1].requestId).toMatch(/^[-a-zA-Z0-9]+$/);
  expect(saveRequests[1].operationId).toMatch(/^[-a-zA-Z0-9]+$/);
  await expect(page.locator('#kingPageMessage')).toContainText('Googleビジネスプロフィールへの反映を受け付けました');
  await expect.poll(() => syncStatusRequests.length).toBe(2);
  expect(syncStatusRequests[1]).toEqual({ playFabId: 'PF_PLAYWRIGHT' });
  await expect(page.locator('#kingPageMessage')).toContainText('Googleビジネスプロフィールへ更新リクエストを送信しました');

  syncResponse = { status: 'validated', updated: false, dryRun: true };
  await page.locator('#kingTroyCalendarDate').fill('2026-08-03');
  await page.locator('#kingTroyCalendarGoogleConsent').check();
  await page.locator('#btnKingTroyCalendarSave').click();
  await expect.poll(() => saveRequests.length).toBe(3);
  expect(saveRequests[2].requestId).toMatch(/^[-a-zA-Z0-9]+$/);
  expect(saveRequests[2].requestId).not.toBe(saveRequests[1].requestId);
  await expect(page.locator('#kingPageMessage')).toContainText('更新内容を検証しました');
  await expect(page.locator('#kingPageMessage')).toContainText('実際の反映は行っていません');

  saveShouldFail = true;
  await page.locator('#kingTroyCalendarDate').fill('2026-08-04');
  await page.locator('#kingTroyCalendarGoogleConsent').check();
  await page.locator('#btnKingTroyCalendarSave').click();
  await expect.poll(() => saveRequests.length).toBe(4);
  await expect(page.locator('#kingPageMessage')).toContainText('営業予定の保存に失敗しました');
  await expect(page.locator('#kingPageMessage')).not.toContainText('営業予定を保存しました');

  const failedRequestId = saveRequests[3].requestId;
  saveShouldFail = false;
  syncResponse = { status: 'queued', queued: true };
  await page.locator('#btnKingTroyCalendarSave').click();
  await expect.poll(() => saveRequests.length).toBe(5);
  expect(saveRequests[4].requestId).toBe(failedRequestId);
  expect(saveRequests[4].operationId).toBe(saveRequests[3].operationId);
  await expect(page.locator('#kingPageMessage')).toContainText('Googleビジネスプロフィールへの反映を受け付けました');

  const reviewHash = 'a'.repeat(64);
  syncResponse = {
    status: 'conflict_requires_review',
    reviewRequired: true,
    reviewRequiredRemoteSpecialHoursHash: reviewHash
  };
  await page.locator('#kingTroyCalendarDate').fill('2026-08-05');
  await page.locator('#kingTroyCalendarGoogleConsent').check();
  await page.locator('#btnKingTroyCalendarSave').click();
  await expect.poll(() => saveRequests.length).toBe(6);
  await expect(page.locator('#kingTroyCalendarGoogleReview')).toBeVisible();
  await expect(page.locator('#kingPageMessage')).toContainText('自動反映を停止しました');
  await expect(page.locator('#btnKingTroyCalendarGoogleReviewApprove')).toBeHidden();
  await page.locator('#btnKingTroyCalendarGoogleReviewLoad').click();
  await expect.poll(() => reviewDetailsRequests.length).toBe(1);
  expect(reviewDetailsRequests[0]).toEqual({ playFabId: 'PF_PLAYWRIGHT' });
  await expect(page.locator('#kingTroyCalendarGoogleReviewDetails')).toContainText('2026-08-05：休業');
  await expect(page.locator('#kingTroyCalendarGoogleReviewDetails')).toContainText('2026-08-05：21:00 – 2026-08-06 01:30');
  await expect(page.locator('#btnKingTroyCalendarGoogleReviewApprove')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#btnKingTroyCalendarGoogleReviewApprove').click();
  await expect.poll(() => reviewApprovalRequests.length).toBe(1);
  expect(reviewApprovalRequests[0]).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    googleBusinessProfileConsent: true,
    consentVersion: 'gbp-special-hours-v1',
    reviewHash
  });
  expect(reviewApprovalRequests[0].operationId).toMatch(/^[-a-zA-Z0-9]+$/);
  await expect(page.locator('#kingTroyCalendarGoogleReview')).toBeHidden();
  await expectNoPageErrors(errors);
});

test('king store game scoring saves from each in-store customer row', async ({ page }) => {
  const errors = trackPageErrors(page);
  const scoreRequests = [];
  const chipReturnRequests = [];
  await bootstrapMainApp(page);
  await page.unroute('**/api/get-nation-king-page');
  await page.route('**/api/get-nation-king-page', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        nation: 'fire',
        troyOpen: true,
        troyMembers: [
          { playFabId: 'PLAYER1', displayName: '海風の船長', joinedAtMs: Date.now() - 1000, level: 24, rankName: '船長' },
          { playFabId: 'PLAYER2', displayName: '月影の副長', joinedAtMs: Date.now() - 900, level: 18, rankName: '航海士' }
        ],
        announcement: { message: 'Map systems nominal' }
      })
    });
  });
  await page.route('**/api/king-update-store-game-score', async (route) => {
    const requestBody = route.request().postDataJSON();
    scoreRequests.push(requestBody);
    const responseBody = requestBody.gameType === 'billiards'
      ? {
          success: true,
          label: 'ビリヤード',
          displayName: '海風の船長',
          opponentDisplayName: '月影の副長',
          previousRating: 1000,
          rating: 1032,
          opponentPreviousRating: 1000,
          opponentRating: 968,
          score: 1032
        }
      : { success: true, label: 'ダーツカウントアップ', displayName: '海風の船長', score: requestBody.score };
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(responseBody)
    });
  });
  await page.route('**/api/king-troy-return-coin', async (route) => {
    const requestBody = route.request().postDataJSON();
    chipReturnRequests.push(requestBody);
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        amount: requestBody.amount,
        receiverPlayFabId: requestBody.receiverPlayFabId,
        contributionAmount: 1200
      })
    });
  });
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await page.evaluate(async () => {
    const king = await import('/js/nationKing.js');
    await king.refreshKingNav('PF_PLAYWRIGHT');
    await window.showTab('king', { playFabId: 'PF_PLAYWRIGHT', race: 'human', nation: 'fire' });
  });

  await expect(page.locator('[data-king-section-tab="store"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-king-section-panel="store"]')).toBeVisible();
  await expect(page.locator('[data-king-section-panel="ops"]')).toBeHidden();
  await expect(page.locator('#kingStoreGameDetails')).toHaveCount(0);
  await expect(page.locator('#kingStoreGameType')).toHaveCount(0);
  await expect(page.locator('#btnKingCoinReturn')).toHaveCount(0);

  const playerRow = page.locator('.troy-entry-item[data-troy-entry-player="PLAYER1"]');
  await expect(playerRow).toContainText('海風の船長');
  await expect(playerRow.locator('.king-chip-return-panel')).toContainText('チップ返却');
  await playerRow.locator('[data-chip-return-amount="PLAYER1"]').fill('1234');
  await playerRow.locator('[data-chip-return="PLAYER1"]').click();

  await expect.poll(() => chipReturnRequests.length).toBe(1);
  expect(chipReturnRequests[0]).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    receiverPlayFabId: 'PLAYER1',
    amount: 1234
  });
  await expect(page.locator('#kingPageMessage')).toContainText('海風の船長 に 1,234Gをチップ返却しました。');
  await expect(playerRow.locator('[data-chip-return-amount="PLAYER1"]')).toHaveValue('0');
  await expect(playerRow.locator('.king-store-game-inline summary')).toHaveText('店内ゲーム採点');
  await expect(playerRow.locator('[data-store-game-type] option[value="billiards"]')).toHaveText('ビリヤード');
  await expect(playerRow.locator('[data-store-game-type] option[value="game"]')).toHaveText('ゲーム');

  await playerRow.locator('.king-store-game-inline summary').click();
  await expect.poll(async () => playerRow.locator('.king-store-game-inline').evaluate((details) => details.open)).toBe(true);
  await expect(playerRow.locator('[data-store-game-score]')).toBeVisible();
  await expect(playerRow.locator('[data-store-game-opponent]')).toBeHidden();
  await playerRow.locator('[data-store-game-score]').fill('701');
  await playerRow.locator('[data-store-game-save="PLAYER1"]').click();

  await expect.poll(() => scoreRequests.length).toBe(1);
  expect(scoreRequests[0]).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    targetPlayFabId: 'PLAYER1',
    gameType: 'darts_countup',
    score: 701
  });
  await expect(page.locator('#kingPageMessage')).toContainText('ダーツカウントアップ: 海風の船長 の記録を 701点で保存しました。');

  await playerRow.locator('[data-store-game-type]').selectOption('billiards');
  await expect(playerRow.locator('[data-store-game-score]')).toBeHidden();
  await expect(playerRow.locator('[data-store-game-opponent]')).toBeVisible();
  await expect(playerRow.locator('[data-store-game-save="PLAYER1"]')).toHaveText('勝利を記録');
  await playerRow.locator('[data-store-game-opponent]').selectOption('PLAYER2');
  await playerRow.locator('[data-store-game-save="PLAYER1"]').click();

  await expect.poll(() => scoreRequests.length).toBe(2);
  expect(scoreRequests[1]).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    targetPlayFabId: 'PLAYER1',
    gameType: 'billiards',
    opponentPlayFabId: 'PLAYER2'
  });
  expect(scoreRequests[1].score).toBeUndefined();
  await expect(page.locator('#kingPageMessage')).toContainText('ビリヤード: 海風の船長 が 月影の副長 に勝利。レート 1,000→1,032');
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
    await window.showTab('companions', { playFabId: 'PF_PLAYWRIGHT', race: 'goblin', nation: 'water' });
  });

  await expect(page.locator('#crewRankSummary')).toContainText('Lv.3 王 / 国ギルド勧誘可');
  await expect(page.locator('#crewOverviewList .companion-card')).toContainText('王権限');
  await expect(page.locator('#crewOverviewList .companion-card')).toContainText('国のギルドを設立できます');
  await expect(page.locator('#companionHostNote')).toContainText('王はレベルに関係なく国ギルドを設立できます。');
  await expect(page.locator('#crewCreatePreview')).toHaveText('火の国ギルド を設立します。');
  await expect(page.locator('#crewCreatePreview')).toHaveCSS('color', 'rgb(255, 241, 194)');
  await expect(page.locator('#btnCreateCrew')).toBeEnabled();
  await expect(page.locator('#btnCreateCrew')).toHaveText('1,000Gで国ギルドを設立');
  await expect(page.locator('#crewOverviewList .companion-card')).not.toContainText('Lv.21');
  await expectNoPageErrors(errors);
});

test('ship captain can create a pirate guild with an optional custom name', async ({ page }) => {
  const errors = trackPageErrors(page);
  let createRequest = null;
  await page.route('**/api/get-stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        stats: { Level: 21 },
        isKing: false,
        nation: 'water'
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
  await page.route('**/api/create-guild', async (route) => {
    createRequest = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, guildName: createRequest.guildName, cost: 1000 })
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
      Nation: 'water',
      level: 21,
      displayName: '青波'
    };
    window.myPlayFabDisplayName = '青波';
  });
  await page.evaluate(async () => {
    await window.showTab('companions', { playFabId: 'PF_PLAYWRIGHT', race: 'goblin', nation: 'water' });
  });

  await page.locator('[data-crew-section-tab="invite"]').click();
  await expect(page.locator('#btnCreateCrew')).toHaveText('1,000Gで海賊団を設立');
  await expect(page.locator('#crewNameInput')).toBeVisible();
  await page.locator('#crewNameInput').fill('青波一味');
  await expect(page.locator('#crewCreatePreview')).toHaveText('青波一味 を設立します。');
  await page.locator('#btnCreateCrew').click();
  await expect.poll(() => createRequest?.guildName).toBe('青波一味');
  await expectNoPageErrors(errors);
});

test('companion tab hides internal PlayFab IDs from member and application cards', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.route('**/api/get-stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        stats: { Level: 24 },
        isKing: false,
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
  await page.route('**/api/get-guild-members', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        members: [
          {
            playFabId: 'PLAYER_MEMBER_1',
            displayName: '海風の剣士',
            crewRoleId: 'swordsman',
            crewRoleLabel: '剣士',
            level: 24
          },
          {
            playFabId: 'PLAYER_MEMBER_NO_NAME',
            crewRoleId: 'cook',
            crewRoleLabel: 'コック',
            level: 24
          }
        ]
      })
    });
  });
  await page.route('**/api/get-guild-applications', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        applications: [
          {
            playFabId: 'APPLICANT_DOCTOR',
            displayName: '流浪の船医',
            crewRoleId: 'doctor',
            crewRoleLabel: '船医',
            appliedAt: Date.now()
          },
          {
            playFabId: 'APPLICANT_NO_NAME',
            crewRoleId: 'sniper',
            crewRoleLabel: '狙撃手',
            appliedAt: Date.now()
          }
        ]
      })
    });
  });
  await bootstrapMainApp(page);
  await page.unroute('**/api/get-guild-info');
  await page.route('**/api/get-guild-info', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        guild: {
          guildId: 'GUILD_OWNER',
          name: 'テスト海賊団',
          role: '船長',
          isOwner: true,
          guildType: 'pirate',
          companionCount: 1,
          maxCompanions: 7,
          memberCount: 2,
          maxMembers: 8,
          level: 1,
          treasury: 0,
          availableRoles: [
            { id: 'swordsman', available: false },
            { id: 'sniper', available: false },
            { id: 'cook', available: false },
            { id: 'doctor', available: true },
            { id: 'shipwright', available: false },
            { id: 'musician', available: false },
            { id: 'archaeologist', available: false }
          ]
        }
      })
    });
  });

  await page.evaluate(async () => {
    const companions = await import('/js/companions.js');
    await companions.loadCompanionsPage('PF_PLAYWRIGHT');
  });

  await expect(page.locator('#crewMembersList')).toContainText('海風の剣士');
  await expect(page.locator('#crewMembersList')).toContainText('剣士');
  await expect(page.locator('#crewMembersList')).toContainText('名前未設定');
  await expect(page.locator('#crewQuickPanel')).toContainText('テスト海賊団に所属中');
  await expect(page.locator('#crewRoleSlotsList')).toContainText('船医');
  await expect(page.locator('#crewRoleSlotsList')).toContainText('空き');
  await expect(page.locator('#crewApplicationsBadge')).toHaveText('2');
  await expect(page.locator('#crewApplicationsList')).toContainText('流浪の船医');
  await expect(page.locator('#crewApplicationsList')).toContainText('船医');
  await expect(page.locator('#crewApplicationsList')).toContainText('名前未設定');
  await expect(page.locator('#tabContentCompanions .crew-system-help summary')).toHaveText('海賊団とは？');
  await expect(page.locator('#tabContentCompanions .crew-system-help')).toContainText('共有ボトルキープ');
  await expect(page.locator('#crewInviteRoleSelect')).toHaveValue('doctor');
  await expect(page.locator('#crewInviteRoleSelect option[value="cook"]')).toHaveText('コック / ギャンブラー（使用中）');
  await expect(page.locator('#crewInviteRoleSelect option[value="doctor"]')).toHaveText('船医 / サポート');
  await expect(page.locator('#crewInviteValue')).toContainText('guild:GUILD_OWNER:role:doctor');
  await expect(page.locator('#tabContentCompanions')).not.toContainText('ID PLAYER_MEMBER_1');
  await expect(page.locator('#tabContentCompanions')).not.toContainText('ID APPLICANT_DOCTOR');
  await expect(page.locator('#tabContentCompanions')).not.toContainText('PLAYER_MEMBER_NO_NAME');
  await expect(page.locator('#tabContentCompanions')).not.toContainText('APPLICANT_NO_NAME');
  await expectNoPageErrors(errors);
});

test('companion invite scan shows role confirmation before joining', async ({ page }) => {
  const errors = trackPageErrors(page);
  let inviteRequest = null;
  const joinRequests = [];
  await page.route('**/api/get-stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        stats: { Level: 12 },
        isKing: false,
        nation: 'water'
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
  await page.route('**/api/get-guild-invite-info', async (route) => {
    inviteRequest = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        invite: {
          guildId: inviteRequest.guildId,
          guildName: '青波海賊団',
          ownerTitle: '船長',
          companionCount: 2,
          maxCompanions: 7,
          crewRoleId: inviteRequest.crewRoleId,
          crewRoleLabel: '船医',
          crewGameLabel: 'サポート',
          crewIconKey: 'drink',
          canJoin: true
        }
      })
    });
  });
  await page.route('**/api/join-guild', async (route) => {
    joinRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        guildId: 'GUILD_INVITE',
        guildName: '青波海賊団',
        crewRoleId: 'doctor',
        crewRoleLabel: '船医'
      })
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
    window.liff.isInClient = () => true;
    window.liff.scanCodeV2 = async () => ({ value: 'guild:GUILD_INVITE:role:doctor' });
  });
  await page.evaluate(async () => {
    await window.showTab('companions', { playFabId: 'PF_PLAYWRIGHT', race: 'goblin', nation: 'water' });
  });

  await page.locator('[data-crew-section-tab="invite"]').click();
  await page.locator('#btnScanJoinCrew').click();
  await expect.poll(() => inviteRequest?.crewRoleId).toBe('doctor');
  await expect(page.locator('#crewJoinConfirmPanel')).toBeVisible();
  await expect(page.locator('#crewJoinConfirmPanel')).toContainText('青波海賊団');
  await expect(page.locator('#crewJoinConfirmPanel')).toContainText('船医');
  await expect(page.locator('#crewJoinConfirmPanel')).toContainText('サポート');
  expect(joinRequests).toHaveLength(0);

  await page.locator('#btnCancelCrewJoin').click();
  await expect(page.locator('#crewJoinConfirmPanel')).toBeHidden();
  expect(joinRequests).toHaveLength(0);

  await page.locator('#btnScanJoinCrew').click();
  await page.locator('#btnConfirmCrewJoin').click();
  await expect.poll(() => joinRequests.length).toBe(1);
  expect(joinRequests[0]).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    guildId: 'GUILD_INVITE',
    crewRoleId: 'doctor'
  });
  await expect(page.locator('#companionPageMessage')).toContainText('船医として仲間に参加しました。');
  await expectNoPageErrors(errors);
});

test('companion member can use shared warehouse currency and items', async ({ page }) => {
  const errors = trackPageErrors(page);
  let treasury = 1200;
  let warehouse = [
    {
      itemId: 'shared_potion',
      itemName: '共有回復薬',
      imagePath: './Sprites/food/snack_miso_soup_bowl.png',
      donatedBy: 'CAPTAIN',
      donatedAt: '2026-06-15T12:00:00.000Z'
    }
  ];
  let depositCurrencyRequest = null;
  let withdrawCurrencyRequest = null;
  let donateItemRequest = null;
  let withdrawItemRequest = null;

  await page.route('**/api/get-stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        stats: { Level: 24 },
        isKing: false,
        nation: 'water'
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
  await page.route('**/api/get-guild-members', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        members: [
          { playFabId: 'PF_PLAYWRIGHT', displayName: '倉庫係', crewRoleId: 'doctor', crewRoleLabel: '船医', level: 24 }
        ]
      })
    });
  });
  await page.route('**/api/get-guild-warehouse', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        treasury,
        warehouse,
        history: [
          { type: 'currency_deposit', playFabId: 'PF_PLAYWRIGHT', amount: 300, createdAt: '2026-06-16T12:10:00.000Z' },
          { type: 'item_deposit', playFabId: 'PF_PLAYWRIGHT', itemId: 'shared_potion', itemName: '共有回復薬', createdAt: '2026-06-15T12:00:00.000Z' }
        ]
      })
    });
  });
  await page.route('**/api/get-inventory', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        inventory: [
          {
            itemId: 'my_potion',
            name: '回復薬',
            count: 2,
            instances: ['STACK_MY_POTION'],
            customData: {
              Category: 'Consumable',
              image_path: './Sprites/food/snack_pickle_barrel.png'
            }
          }
        ],
        virtualCurrency: { PS: 5000 }
      })
    });
  });
  await page.route('**/api/deposit-guild-currency', async (route) => {
    depositCurrencyRequest = route.request().postDataJSON();
    treasury += depositCurrencyRequest.amount;
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, treasury, warehouse })
    });
  });
  await page.route('**/api/withdraw-guild-currency', async (route) => {
    withdrawCurrencyRequest = route.request().postDataJSON();
    treasury -= withdrawCurrencyRequest.amount;
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, treasury, warehouse })
    });
  });
  await page.route('**/api/donate-to-guild-warehouse', async (route) => {
    donateItemRequest = route.request().postDataJSON();
    warehouse.push({
      itemId: donateItemRequest.itemId,
      itemName: donateItemRequest.itemName,
      imagePath: donateItemRequest.imagePath,
      donatedBy: donateItemRequest.playFabId,
      donatedAt: '2026-06-16T12:00:00.000Z'
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, treasury, warehouse })
    });
  });
  await page.route('**/api/withdraw-from-guild-warehouse', async (route) => {
    withdrawItemRequest = route.request().postDataJSON();
    warehouse.splice(withdrawItemRequest.warehouseIndex, 1);
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, treasury, warehouse })
    });
  });

  await bootstrapMainApp(page);
  await page.unroute('**/api/get-guild-info');
  await page.route('**/api/get-guild-info', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        guild: {
          guildId: 'GUILD_SHARED',
          name: '共有海賊団',
          role: 'メンバー',
          isOwner: false,
          guildType: 'pirate',
          companionCount: 2,
          maxCompanions: 7,
          memberCount: 3,
          maxMembers: 8,
          level: 1,
          treasury
        }
      })
    });
  });
  await page.evaluate(async () => {
    await window.showTab('companions', { playFabId: 'PF_PLAYWRIGHT', race: 'goblin', nation: 'water' });
  });
  await page.locator('[data-crew-section-tab="warehouse"]').click();

  await expect(page.locator('#crewWarehousePanel')).toBeVisible();
  await expect(page.locator('#crewWarehouseSummary')).toContainText('資金 1,200G / アイテム 1');
  await expect(page.locator('#crewDepositItemSelect')).toContainText('回復薬 x2');
  await expect(page.locator('#crewWarehouseList')).toContainText('共有回復薬');
  await expect(page.locator('#crewWarehouseList .crew-warehouse-thumb img')).toHaveCount(1);
  await expect(page.locator('#crewWarehouseHistoryList')).toContainText('倉庫係 が 300G 入金');
  await expect(page.locator('#crewWarehouseHistoryList')).toContainText('倉庫係 が 共有回復薬 を預け入れ');

  await page.locator('#crewDepositCurrencyInput').fill('300');
  await page.locator('#btnDepositGuildCurrency').click();
  await expect.poll(() => depositCurrencyRequest?.amount).toBe(300);
  await expect(page.locator('#crewWarehouseSummary')).toContainText('資金 1,500G');

  await page.locator('#crewWithdrawCurrencyInput').fill('200');
  await page.locator('#btnWithdrawGuildCurrency').click();
  await expect.poll(() => withdrawCurrencyRequest?.amount).toBe(200);
  await expect(page.locator('#crewWarehouseSummary')).toContainText('資金 1,300G');

  await page.locator('#btnDepositGuildItem').click();
  await expect.poll(() => donateItemRequest?.itemId).toBe('my_potion');
  await expect.poll(() => donateItemRequest?.itemName).toBe('回復薬');
  await expect.poll(() => donateItemRequest?.imagePath).toBe('./Sprites/food/snack_pickle_barrel.png');
  await expect(page.locator('#crewWarehouseSummary')).toContainText('アイテム 2');
  await expect(page.locator('#crewWarehouseList')).toContainText('回復薬');
  await expect(page.locator('#crewWarehouseList .crew-warehouse-thumb img')).toHaveCount(2);

  await page.locator('#crewWarehouseList .js-withdraw-guild-item').first().click();
  await expect.poll(() => withdrawItemRequest?.warehouseIndex).toBe(0);
  await expect(page.locator('#crewWarehouseSummary')).toContainText('アイテム 1');
  await expectNoPageErrors(errors);
});

test('current equipment slots render equipped item sprites on the right edge', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.route('**/api/get-player-public-profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        profile: {
          playFabId: 'PF_PLAYWRIGHT',
          displayName: 'Playwright Tester',
          nation: 'fire',
          level: 12,
          stats: {
            Level: 12
          },
          avatarBase: {
            Race: 'human',
            Nation: 'fire',
            AvatarColor: 'brown',
            level: 12
          },
          playerShip: {
            form: 'boat',
            stage: 1
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

  await expect(page.locator('#tabContentInventory .avatar-style-panel')).toHaveCount(0);
  await expect(page.locator('#avatarStyleModal')).not.toBeVisible();
  await page.locator('#home-avatar').click();
  await expect(page.locator('#playerProfileModal')).toBeVisible();
  await expect(page.locator('#btnPlayerProfileTransfer')).toBeHidden();
  await expect(page.locator('#btnPlayerProfileFavorite')).toBeHidden();
  await expect(page.locator('#btnPlayerProfileBeauty')).toBeVisible();
  await page.locator('#btnPlayerProfileBeauty').click();
  await expect(page.locator('#playerProfileModal')).not.toBeVisible();
  await expect(page.locator('#avatarStyleModal')).toBeVisible();
  await expect(page.locator('#avatarStylePanel')).toBeVisible();
  await expect(page.locator('#btnRandomHaircut')).toContainText('100G');
  await expect(page.locator('#btnRandomSkin')).toContainText('300G');
  await expect(page.locator('#btnRandomFace')).toContainText('800G');
  await expect(page.locator('#btnRemoveFacialHair')).toContainText('1000G');
  await expect(page.locator('#btnRandomFacialHair')).toContainText('1000G');
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
  expect(slotIcons.head).not.toContain('073.png');
  expect(slotIcons.right).toContain('076.png');
  expect(slotIcons.left).toContain('077.png');
  expect(slotIcons.accessory).toContain('074.png');

  const layout = await page.evaluate(() => {
    const slot = document.querySelector('.weapon-slot');
    const stylePanel = document.getElementById('avatarStylePanel');
    const content = slot?.querySelector('.equip-slot-content');
    const art = document.getElementById('equippedRightHandArt');
    const sprite = art?.querySelector('.equip-slot-item-sprite');
    const armorArt = document.getElementById('equippedArmorArt');
    const armorSprite = armorArt?.querySelector('.equip-slot-item-sprite');
    const panelStyle = stylePanel ? window.getComputedStyle(stylePanel) : null;
    const contentRect = content?.getBoundingClientRect();
    const artRect = art?.getBoundingClientRect();
    const spriteRect = sprite?.getBoundingClientRect();
    const armorArtRect = armorArt?.getBoundingClientRect();
    const armorSpriteRect = armorSprite?.getBoundingClientRect();
    const slotRect = slot?.getBoundingClientRect();
    return {
      stylePanelDisplay: panelStyle?.display || '',
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
      armorArtCenterY: armorArtRect ? armorArtRect.top + armorArtRect.height / 2 : 0,
      armorSpriteCenterY: armorSpriteRect ? armorSpriteRect.top + armorSpriteRect.height / 2 : 0,
      statAtkColor: window.getComputedStyle(document.querySelector('#equippedRightHandStats .stat-atk')).color,
      statDefColor: window.getComputedStyle(document.querySelector('#equippedLeftHandStats .stat-def')).color,
      slotRight: slotRect?.right || 0
    };
  });

  expect(layout.stylePanelDisplay).not.toBe('none');
  expect(layout.artLeft).toBeGreaterThan(layout.contentRight);
  expect(layout.slotRight - layout.artRight).toBeLessThan(20);
  expect(layout.artWidth).toBeGreaterThanOrEqual(52);
  expect(layout.artHeight).toBeGreaterThanOrEqual(52);
  expect(Math.max(layout.spriteWidth, layout.spriteHeight)).toBeGreaterThanOrEqual(48);
  expect(Math.abs(layout.spriteCenterX - layout.artCenterX)).toBeLessThanOrEqual(2);
  expect(Math.abs(layout.spriteCenterY - layout.artCenterY)).toBeLessThanOrEqual(2);
  expect(layout.armorSpriteCenterY).toBeLessThan(layout.armorArtCenterY - 2);
  expect(layout.statAtkColor).toBe('rgb(255, 208, 138)');
  expect(layout.statDefColor).toBe('rgb(185, 220, 255)');
  await expectNoPageErrors(errors);
});

test('inventory current equipment resolves object equipment references', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const equipmentItems = [
    {
      itemId: 'sword_001',
      instances: ['sword-instance-1'],
      name: 'Object Ref Sword',
      customData: {
        Category: 'Weapon',
        Power: 12,
        sprite_path: './Sprites/weapons/melee weapons/sword.png',
        sprite_index: '1',
        sprite_w: '32',
        sprite_h: '32'
      }
    },
    {
      itemId: 'shield_001',
      instances: ['shield-instance-1'],
      name: 'Object Ref Shield',
      customData: {
        Category: 'Shield',
        Defense: 8,
        sprite_path: './Sprites/weapons/melee weapons/shield.png',
        sprite_index: '2',
        sprite_w: '32',
        sprite_h: '32'
      }
    },
    {
      itemId: 'orb_001',
      instances: ['orb-instance-1'],
      name: 'Object Ref Orb',
      customData: {
        Category: 'Offhand',
        MagicPower: 5,
        sprite_path: './Sprites/items/icons.png',
        sprite_index: '8',
        sprite_w: '16',
        sprite_h: '16'
      }
    }
  ];

  await page.route('**/api/get-inventory', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        inventory: equipmentItems,
        virtualCurrency: { PS: 0 },
        contribution: 0
      })
    });
  });
  await page.route('**/api/get-equipment', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        equipment: {
          RightHand: { itemId: 'sword_001' },
          LeftHand: { ItemInstanceId: 'shield-instance-1' }
        }
      })
    });
  });
  await page.route('**/api/tarot-deck-get', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ok: true, tarotDeck: [], tarotRole: null })
    });
  });
  await page.route('**/api/player-ship/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        ship: { form: 'boat', stage: 1, majorArcanaSlotLimit: 1, majorArcanaItemIds: [] }
      })
    });
  });
  await page.route('**/api/ship-skill-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, majorArcanaSlotLimit: 1, majorArcanaItemIds: [], skills: [] })
    });
  });

  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    document.querySelectorAll('.tab-content').forEach((tab) => {
      tab.style.display = tab.id === 'tabContentInventory' ? 'block' : 'none';
    });
    const inventory = await import('/js/inventory.js');
    await inventory.getInventory('PF_PLAYWRIGHT', { force: true });
    inventory.switchInventoryGroup('Equipment');
  });

  await expect(page.locator('#inventoryTabs .inventory-tab-btn')).toHaveText(['武器', '左手', '防具', 'アクセ']);
  await expect(page.locator('#equippedRightHand')).toHaveText('Object Ref Sword');
  await expect(page.locator('#equippedLeftHand')).toHaveText('Object Ref Shield');
  const rightHandSlotIconMetrics = await page.locator('#tabContentInventory .weapon-slot .equip-slot-icon').evaluate((icon) => {
    const rect = icon.getBoundingClientRect();
    const style = window.getComputedStyle(icon);
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      backgroundSize: style.backgroundSize,
      backgroundImage: style.backgroundImage
    };
  });
  expect(rightHandSlotIconMetrics.width).toBe(34);
  expect(rightHandSlotIconMetrics.height).toBe(34);
  expect(rightHandSlotIconMetrics.backgroundSize).toBe('32px 32px');
  expect(rightHandSlotIconMetrics.backgroundImage).toContain('076.png');
  const leftHandSlotIconMetrics = await page.locator('#tabContentInventory .shield-slot .equip-slot-icon').evaluate((icon) => {
    const style = window.getComputedStyle(icon);
    return {
      backgroundImage: style.backgroundImage
    };
  });
  expect(leftHandSlotIconMetrics.backgroundImage).toContain('077.png');
  const headSlotIconMetrics = await page.locator('#tabContentInventory .armor-slot .equip-slot-icon').evaluate((icon) => {
    const style = window.getComputedStyle(icon);
    return {
      backgroundImage: style.backgroundImage,
      backgroundSize: style.backgroundSize
    };
  });
  expect(headSlotIconMetrics.backgroundImage).toContain('032.png');
  expect(headSlotIconMetrics.backgroundImage).not.toContain('073.png');
  expect(headSlotIconMetrics.backgroundSize).toContain('74% 74%');
  await expect(page.locator('#equippedRightHandArt.has-item .equip-slot-item-sprite')).toHaveCount(1);
  await expect(page.locator('#equippedLeftHandArt.has-item .equip-slot-item-sprite')).toHaveCount(1);
  const equippedArtMetrics = await page.locator('#equippedRightHandArt').evaluate((art) => {
    const sprite = art.querySelector('.equip-slot-item-sprite');
    const artRect = art.getBoundingClientRect();
    const spriteRect = sprite?.getBoundingClientRect();
    const artStyle = window.getComputedStyle(art);
    const spriteStyle = sprite ? window.getComputedStyle(sprite) : null;
    return {
      artDisplay: artStyle.display,
      artOpacity: artStyle.opacity,
      artWidth: Math.round(artRect.width),
      artHeight: Math.round(artRect.height),
      spriteWidth: Math.round(spriteRect?.width || 0),
      spriteHeight: Math.round(spriteRect?.height || 0),
      spriteFitsWidth: (spriteRect?.width || 0) <= artRect.width,
      spriteFitsHeight: (spriteRect?.height || 0) <= artRect.height,
      spriteBackground: spriteStyle?.backgroundImage || ''
    };
  });
  expect(equippedArtMetrics.artDisplay).not.toBe('none');
  expect(equippedArtMetrics.artOpacity).toBe('1');
  expect(equippedArtMetrics.artWidth).toBeGreaterThanOrEqual(34);
  expect(equippedArtMetrics.artHeight).toBeGreaterThanOrEqual(34);
  expect(equippedArtMetrics.spriteWidth).toBeGreaterThan(0);
  expect(equippedArtMetrics.spriteHeight).toBeGreaterThan(0);
  expect(equippedArtMetrics.spriteFitsWidth).toBe(true);
  expect(equippedArtMetrics.spriteFitsHeight).toBe(true);
  expect(equippedArtMetrics.spriteBackground).not.toBe('none');
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector('#tabContentInventory .weapon-slot')?.click();
  });
  await page.waitForFunction(() => {
    const tabs = document.getElementById('inventoryTabs');
    const switcher = document.getElementById('inventoryMobileSwitch');
    if (!tabs || !switcher) return false;
    const tabsTop = tabs.getBoundingClientRect().top;
    const switcherBottom = switcher.getBoundingClientRect().bottom;
    return tabsTop >= switcherBottom + 6 && tabsTop < window.innerHeight;
  });
  const autoScrollMetrics = await page.evaluate(() => {
    const tabs = document.getElementById('inventoryTabs');
    const switcher = document.getElementById('inventoryMobileSwitch');
    return {
      tabsTop: Math.round(tabs.getBoundingClientRect().top),
      switcherBottom: Math.round(switcher.getBoundingClientRect().bottom)
    };
  });
  expect(autoScrollMetrics.tabsTop).toBeGreaterThanOrEqual(autoScrollMetrics.switcherBottom + 6);
  await page.evaluate(async () => {
    const inventory = await import('/js/inventory.js');
    inventory.switchInventoryTab('Weapon');
  });
  await expect(page.locator('#inventoryGrid .inventory-item-cell[data-category="Weapon"]')).toHaveAttribute('data-equipment-state', 'equipped');
  await page.evaluate(async () => {
    const inventory = await import('/js/inventory.js');
    inventory.switchInventoryTab('LeftHand');
  });
  await expect(page.locator('#inventoryGrid .inventory-item-cell[data-category="Shield"]')).toHaveCount(1);
  await expect(page.locator('#inventoryGrid .inventory-item-cell[data-category="Offhand"]')).toHaveCount(1);
  await expect(page.locator('#inventoryGrid .inventory-item-cell[data-category="Shield"]')).toHaveAttribute('data-equipment-state', 'equipped');
  await expectNoPageErrors(errors);
});

test('facial hair unlocks at level 21 and salon actions update the layer', async ({ page }) => {
  const errors = trackPageErrors(page);
  const updateRequests = [];

  await page.route('**/api/get-stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        stats: {
          Level: 21,
          ちから: 7,
          みのまもり: 8,
          すばやさ: 9,
          かしこさ: 10
        }
      })
    });
  });

  await page.route('**/api/update-avatar-style', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    updateRequests.push(body);
    const action = String(body?.style?.action || '');
    const nextValue = action === 'facialHairRemove' ? 0 : 7;
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        action,
        changedKey: 'FacialHairStyleIndex',
        nextValue,
        cost: 1000,
        avatarStyle: { FacialHairStyleIndex: nextValue }
      })
    });
  });

  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    const player = await import('/js/player.js');
    await player.getPlayerStats('PF_PLAYWRIGHT');
    window.myAvatarBaseInfo = {
      ...(window.myAvatarBaseInfo || {}),
      Race: 'human',
      AvatarColor: 'brown',
      SkinColorIndex: 1,
      FaceIndex: 1,
      HairStyleIndex: 1,
      FacialHairStyleIndex: 2,
      level: 21
    };
    const { renderAvatar } = await import('/js/avatar.js');
    renderAvatar('home-avatar', window.myAvatarBaseInfo, {}, {}, false);
  });

  await expect.poll(async () => (
    page.locator('#home-avatar-layer-facial-hair').evaluate((layer) => ({
      spriteIndex: layer.dataset.spriteIndex,
      backgroundImage: window.getComputedStyle(layer).backgroundImage
    }))
  )).toMatchObject({
    spriteIndex: '1',
    backgroundImage: expect.stringContaining('human_facialhair_brown.png')
  });

  await page.evaluate(() => {
    window.confirm = () => true;
    window.openAvatarStyleModal();
  });
  await expect(page.locator('#btnRemoveFacialHair')).toBeEnabled();
  await expect(page.locator('#btnRandomFacialHair')).toBeEnabled();
  await page.locator('#btnRemoveFacialHair').click();
  await expect.poll(() => updateRequests.length).toBe(1);

  await expect.poll(async () => (
    page.locator('#home-avatar-layer-facial-hair').evaluate((layer) => ({
      spriteIndex: layer.dataset.spriteIndex,
      backgroundImage: window.getComputedStyle(layer).backgroundImage
    }))
  )).toMatchObject({
    spriteIndex: '',
    backgroundImage: 'none'
  });

  await page.locator('#btnRandomFacialHair').click();
  await expect.poll(() => updateRequests.length).toBe(2);
  await expect.poll(async () => (
    page.locator('#home-avatar-layer-facial-hair').evaluate((layer) => ({
      spriteIndex: layer.dataset.spriteIndex,
      backgroundImage: window.getComputedStyle(layer).backgroundImage
    }))
  )).toMatchObject({
    spriteIndex: '6',
    backgroundImage: expect.stringContaining('human_facialhair_brown.png')
  });

  expect(updateRequests.map((request) => request?.style?.action)).toEqual(['facialHairRemove', 'facialHair']);
  await expectNoPageErrors(errors);
});

test('elf avatar uses yellow base sprites when stored color is yellow', async ({ page }) => {
  const errors = trackPageErrors(page);
  const purpleElfSpriteRequests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/Sprites/Characters/elf/') && url.includes('_purple.png')) {
      purpleElfSpriteRequests.push(url);
    }
  });

  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    window.myAvatarBaseInfo = {
      ...(window.myAvatarBaseInfo || {}),
      Race: 'Elf',
      AvatarColor: 'yellow',
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
    window.getComputedStyle(layer).backgroundImage
  ))).toContain('body_yellow.png');
  await expect.poll(async () => page.locator('#home-avatar-layer-hair').evaluate((layer) => (
    window.getComputedStyle(layer).backgroundImage
  ))).toContain('elf_hair_yellow.png');
  await expect.poll(async () => page.locator('#home-avatar-layer-facial-hair').evaluate((layer) => (
    window.getComputedStyle(layer).backgroundImage
  ))).toContain('elf_facialhair_yellow.png');
  expect(purpleElfSpriteRequests).toHaveLength(0);
  await expectNoPageErrors(errors);
});

test('unsupported avatar races fall back to human sprite assets', async ({ page }) => {
  const errors = trackPageErrors(page);
  const unsupportedRaceRequests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/Sprites/Characters/dwarf/')) {
      unsupportedRaceRequests.push(url);
    }
  });

  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    window.myAvatarBaseInfo = {
      ...(window.myAvatarBaseInfo || {}),
      Race: 'dwarf',
      AvatarColor: 'grey',
      SkinColorIndex: 8,
      FaceIndex: 2,
      HairStyleIndex: 2,
      FacialHairStyleIndex: 2,
      level: 21
    };
    const { preloadAvatarBaseSprites, renderAvatar } = await import('/js/avatar.js');
    preloadAvatarBaseSprites(window.myAvatarBaseInfo);
    renderAvatar('home-avatar', window.myAvatarBaseInfo, {}, {}, false);
  });

  const homeAvatarVisibility = await page.locator('#home-avatar').evaluate((avatar) => {
    const style = window.getComputedStyle(avatar);
    return {
      opacity: style.opacity,
      visibility: style.visibility
    };
  });
  expect(homeAvatarVisibility.opacity).not.toBe('0');
  expect(homeAvatarVisibility.visibility).not.toBe('hidden');
  await expect.poll(async () => page.locator('#home-avatar-layer-head').evaluate((layer) => (
    window.getComputedStyle(layer).backgroundImage
  ))).toContain('human_head_skin_1.png');
  await expect.poll(async () => page.locator('#home-avatar-layer-hair').evaluate((layer) => (
    window.getComputedStyle(layer).backgroundImage
  ))).toContain('human_hair_brown.png');
  await expect.poll(async () => page.locator('#home-avatar-layer-hand-right').evaluate((layer) => (
    window.getComputedStyle(layer).backgroundImage
  ))).toContain('human_hand.png');
  expect(unsupportedRaceRequests).toHaveLength(0);
  await expectNoPageErrors(errors);
});

test('combat avatars expose reusable body sprite motions', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(async () => {
    const fixture = document.createElement('div');
    fixture.id = 'combatIdleAvatarFixture';
    fixture.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none;';
    fixture.innerHTML = `
      <div id="combatIdleAvatar" class="avatar-container avatar-combat-actor">
        <div id="combatIdleAvatar-layer-body" class="avatar-layer"></div>
        <div id="combatIdleAvatar-layer-head" class="avatar-layer"></div>
        <div id="combatIdleAvatar-layer-facial-hair" class="avatar-layer"></div>
        <div id="combatIdleAvatar-layer-hair" class="avatar-layer"></div>
        <div id="combatIdleAvatar-layer-armor" class="avatar-layer"></div>
        <div id="combatIdleAvatar-layer-hand-right" class="avatar-layer"></div>
        <div id="combatIdleAvatar-layer-weapon-right" class="avatar-layer"></div>
        <div id="combatIdleAvatar-layer-hand-left" class="avatar-layer"></div>
        <div id="combatIdleAvatar-layer-shield-left" class="avatar-layer"></div>
      </div>`;
    document.body.appendChild(fixture);

    const { renderAvatar } = await import('/js/avatar.js');
    const avatar = { Race: 'human', AvatarColor: 'brown', SkinColorIndex: 1, FaceIndex: 1, HairStyleIndex: 1, FacialHairStyleIndex: 0, level: 21 };
    renderAvatar('combatIdleAvatar', avatar, {}, {}, false);
  });

  await page.waitForFunction(() => (
    document.getElementById('combatIdleAvatar-layer-body')?.dataset.loadState === 'ready'
  ));
  await expect(page.locator('#combatIdleAvatar')).toHaveAttribute('data-avatar-idle-state', 'body');
  const initialFrame = await page.locator('#combatIdleAvatar-layer-body').evaluate((layer) => layer.dataset.spriteIndex || '');
  await page.waitForFunction((frame) => (
    document.getElementById('combatIdleAvatar-layer-body')?.dataset.spriteIndex !== frame
    && document.getElementById('combatIdleAvatar-layer-head')?.style.transform.includes('translateY')
  ), initialFrame, { timeout: 2500 });

  const shiftedHeadTransform = await page.locator('#combatIdleAvatar-layer-head').evaluate((layer) => layer.style.transform);
  expect(shiftedHeadTransform).toContain('translateY');

  const motionSamples = await page.evaluate(async () => {
    const {
      startAvatarBodyMotion,
      playAvatarBodyMotion
    } = await import('/js/avatar.js');
    const body = document.getElementById('combatIdleAvatar-layer-body');
    const read = () => ({
      index: Number(body?.dataset.spriteIndex || 0),
      motion: body?.dataset.bodyMotion || '',
      frame: Number(body?.dataset.bodyMotionFrame || 0)
    });

    startAvatarBodyMotion('combatIdleAvatar', 'walk', { intervalMs: 30 });
    await new Promise((resolve) => setTimeout(resolve, 140));
    const walk = read();

    startAvatarBodyMotion('combatIdleAvatar', 'run', { intervalMs: 30 });
    await new Promise((resolve) => setTimeout(resolve, 140));
    const run = read();

    await playAvatarBodyMotion('combatIdleAvatar', 'jump', { intervalMs: 30, restore: false });
    const jump = read();

    startAvatarBodyMotion('combatIdleAvatar', 'idle', { intervalMs: 30 });
    return { walk, run, jump };
  });

  expect(motionSamples.walk.motion).toBe('walk');
  expect(motionSamples.walk.index).toBeGreaterThanOrEqual(8);
  expect(motionSamples.walk.index).toBeLessThan(16);
  expect(motionSamples.run.motion).toBe('run');
  expect(motionSamples.run.index).toBeGreaterThanOrEqual(16);
  expect(motionSamples.run.index).toBeLessThan(24);
  expect(motionSamples.jump.motion).toBe('jump');
  expect(motionSamples.jump.index).toBeGreaterThanOrEqual(24);
  expect(motionSamples.jump.index).toBeLessThan(27);
  await expectNoPageErrors(errors);
});

test('tall avatar weapons stay close to the avatar floor', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(async () => {
    const fixture = document.createElement('div');
    fixture.id = 'tallWeaponOffsetFixture';
    fixture.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none;';
    const buildAvatar = (prefix) => `
      <div id="${prefix}" class="avatar-container">
        <div id="${prefix}-layer-body" class="avatar-layer"></div>
        <div id="${prefix}-layer-head" class="avatar-layer"></div>
        <div id="${prefix}-layer-facial-hair" class="avatar-layer"></div>
        <div id="${prefix}-layer-hair" class="avatar-layer"></div>
        <div id="${prefix}-layer-armor" class="avatar-layer"></div>
        <div id="${prefix}-layer-hand-right" class="avatar-layer"></div>
        <div id="${prefix}-layer-weapon-right" class="avatar-layer"></div>
        <div id="${prefix}-layer-hand-left" class="avatar-layer"></div>
        <div id="${prefix}-layer-shield-left" class="avatar-layer"></div>
      </div>`;
    fixture.innerHTML = buildAvatar('axeBig') + buildAvatar('polearm');
    document.body.appendChild(fixture);

    const { renderAvatar } = await import('/js/avatar.js');
    const avatar = { Race: 'human', AvatarColor: 'brown', SkinColorIndex: 1, FaceIndex: 1, HairStyleIndex: 1, FacialHairStyleIndex: 0, level: 21 };
    const items = {
      axe_big_001: { itemId: 'axe_big_001', customData: { Category: 'Weapon', sprite_path: './Sprites/weapons/melee weapons/axe_big.png', sprite_index: '0', sprite_w: '32', sprite_h: '48' } },
      polearm_001: { itemId: 'polearm_001', customData: { Category: 'Weapon', sprite_path: './Sprites/weapons/melee weapons/polearm.png', sprite_index: '0', sprite_w: '32', sprite_h: '64' } }
    };
    renderAvatar('axeBig', avatar, { RightHand: 'axe_big_001' }, items, false);
    renderAvatar('polearm', avatar, { RightHand: 'polearm_001' }, items, false);
  });

  await page.waitForFunction(() => ['axeBig', 'polearm'].every((prefix) => (
    document.getElementById(`${prefix}-layer-weapon-right`)?.dataset.loadState === 'ready'
  )));
  const floorOffsets = await page.evaluate(() => Object.fromEntries(['axeBig', 'polearm'].map((prefix) => {
    const body = document.getElementById(`${prefix}-layer-body`).getBoundingClientRect();
    const weapon = document.getElementById(`${prefix}-layer-weapon-right`).getBoundingClientRect();
    return [prefix, Math.round(weapon.bottom - body.bottom)];
  })));
  const leftHandTransforms = await page.evaluate(() => Object.fromEntries(['axeBig', 'polearm'].map((prefix) => [
    prefix,
    document.getElementById(`${prefix}-layer-hand-left`).dataset.baseTransform || ''
  ])));

  expect(floorOffsets.axeBig).toBeLessThanOrEqual(60);
  expect(floorOffsets.polearm).toBeLessThanOrEqual(60);
  expect(leftHandTransforms.axeBig).toContain('translateX(0px)');
  expect(leftHandTransforms.polearm).toContain('translateX(0px)');
  await expectNoPageErrors(errors);
});

test('opponent avatar keeps right-hand weapon on weapon layer when flipped', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(async () => {
    const fixture = document.createElement('div');
    fixture.id = 'opponentWeaponLayerFixture';
    fixture.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none;';
    fixture.innerHTML = `
      <div id="opponentWeaponAvatar" class="avatar-container">
        <div id="opponentWeaponAvatar-layer-body" class="avatar-layer"></div>
        <div id="opponentWeaponAvatar-layer-head" class="avatar-layer"></div>
        <div id="opponentWeaponAvatar-layer-facial-hair" class="avatar-layer"></div>
        <div id="opponentWeaponAvatar-layer-hair" class="avatar-layer"></div>
        <div id="opponentWeaponAvatar-layer-armor" class="avatar-layer"></div>
        <div id="opponentWeaponAvatar-layer-hand-right" class="avatar-layer"></div>
        <div id="opponentWeaponAvatar-layer-weapon-right" class="avatar-layer"></div>
        <div id="opponentWeaponAvatar-layer-hand-left" class="avatar-layer"></div>
        <div id="opponentWeaponAvatar-layer-shield-left" class="avatar-layer"></div>
      </div>`;
    document.body.appendChild(fixture);

    const { renderAvatar } = await import('/js/avatar.js');
    const avatar = { Race: 'human', AvatarColor: 'brown', SkinColorIndex: 1, FaceIndex: 1, HairStyleIndex: 1, FacialHairStyleIndex: 0, level: 21 };
    const items = {
      polearm_001: { itemId: 'polearm_001', customData: { Category: 'Weapon', sprite_path: './Sprites/weapons/melee weapons/polearm.png', sprite_index: '0', sprite_w: '32', sprite_h: '64' } }
    };
    renderAvatar('opponentWeaponAvatar', avatar, { RightHand: 'polearm_001' }, items, true);
  });

  await page.waitForFunction(() => (
    document.getElementById('opponentWeaponAvatar-layer-weapon-right')?.dataset.loadState === 'ready'
  ));
  const layerState = await page.evaluate(() => {
    const weapon = window.getComputedStyle(document.getElementById('opponentWeaponAvatar-layer-weapon-right')).backgroundImage;
    const shield = window.getComputedStyle(document.getElementById('opponentWeaponAvatar-layer-shield-left')).backgroundImage;
    return { weapon, shield };
  });

  expect(layerState.weapon).toContain('polearm.png');
  expect(layerState.shield).toBe('none');
  await expectNoPageErrors(errors);
});

test('avatar shield center aligns with the left hand center', async ({ page }) => {
  const errors = trackPageErrors(page);
  await bootstrapMainApp(page);

  await page.evaluate(async () => {
    const fixture = document.createElement('div');
    fixture.id = 'shieldOffsetFixture';
    fixture.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none;';
    fixture.innerHTML = `
      <div id="shieldCenterAvatar" class="avatar-container">
        <div id="shieldCenterAvatar-layer-body" class="avatar-layer"></div>
        <div id="shieldCenterAvatar-layer-head" class="avatar-layer"></div>
        <div id="shieldCenterAvatar-layer-facial-hair" class="avatar-layer"></div>
        <div id="shieldCenterAvatar-layer-hair" class="avatar-layer"></div>
        <div id="shieldCenterAvatar-layer-armor" class="avatar-layer"></div>
        <div id="shieldCenterAvatar-layer-hand-right" class="avatar-layer"></div>
        <div id="shieldCenterAvatar-layer-weapon-right" class="avatar-layer"></div>
        <div id="shieldCenterAvatar-layer-hand-left" class="avatar-layer"></div>
        <div id="shieldCenterAvatar-layer-shield-left" class="avatar-layer"></div>
      </div>`;
    document.body.appendChild(fixture);

    const { renderAvatar } = await import('/js/avatar.js');
    const avatar = { Race: 'human', AvatarColor: 'brown', SkinColorIndex: 1, FaceIndex: 1, HairStyleIndex: 1, FacialHairStyleIndex: 0, level: 1 };
    const items = {
      shield_020: { itemId: 'shield_020', customData: { Category: 'Shield', sprite_path: './Sprites/weapons/melee weapons/shield.png', sprite_index: '20', sprite_w: '32', sprite_h: '32' } }
    };
    renderAvatar('shieldCenterAvatar', avatar, { LeftHand: 'shield_020' }, items, false);
  });

  await page.waitForFunction(() => (
    document.getElementById('shieldCenterAvatar-layer-shield-left')?.dataset.loadState === 'ready'
  ));
  const centerDelta = await page.evaluate(() => {
    const hand = document.getElementById('shieldCenterAvatar-layer-hand-left').getBoundingClientRect();
    const shield = document.getElementById('shieldCenterAvatar-layer-shield-left').getBoundingClientRect();
    return {
      x: Math.abs((shield.left + shield.width / 2) - (hand.left + hand.width / 2)),
      y: Math.abs((shield.top + shield.height / 2) - (hand.top + hand.height / 2))
    };
  });

  expect(centerDelta.x).toBeLessThanOrEqual(1);
  expect(centerDelta.y).toBeLessThanOrEqual(1);
  await expectNoPageErrors(errors);
});

test('tarot deck and list show suit-colored number badges at the upper right', async ({ page }) => {
  const errors = trackPageErrors(page);
  const tarotItems = [
    {
      itemId: 'tarot_minor_wand_7',
      name: 'Wand Seven',
      count: 3,
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
      count: 2,
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
        tarotDeck: ['tarot_minor_cup_10'],
        tarotRole: null
      })
    });
  });
  await page.route('**/api/player-ship/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        ship: {
          form: 'explorer',
          stage: 2,
          majorArcanaSlotLimit: 2,
          majorArcanaItemIds: ['tarot_major_sword_5']
        }
      })
    });
  });
  await page.route('**/api/ship-skill-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        majorArcanaSlotLimit: 2,
        majorArcanaItemIds: ['tarot_major_sword_5'],
        skills: [
          {
            cardItemId: 'tarot_major_sword_5',
            cardName: 'Major Five',
            skillName: '船団の号令',
            activationType: 'active',
            cooldownSec: 60,
            range: 'medium',
            aoe: 'single',
            description: '船に装備した大アルカナの船スキル'
          }
        ]
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
      body: JSON.stringify({
        cards: tarotItems.map((item, index) => ({
          itemId: item.itemId,
          level: index + 1,
          maxLevel: 10,
          quantity: item.count || 1,
          nextLevelCost: 40
        }))
      })
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
  await expect(page.locator('#meleeDeckGrid .tarot-loadout-visual .tarot-number-badge.is-cup')).toHaveText('10');
  await expect(page.locator('#meleeDeckGrid .tarot-loadout-card:not(.is-empty) .tarot-number-badge')).toHaveText(['10']);
  await expect(page.locator('#shipMajorArcanaGrid .tarot-loadout-visual .tarot-number-badge.is-none')).toHaveText('5');
  await expect(page.locator('#shipMajorArcanaGrid .tarot-loadout-visual .tarot-number-badge.is-sword')).toHaveCount(0);

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
    const cell = badge.closest('.inventory-item-cell');
    const frame = badge.closest('.inventory-item-icon-frame');
    const badgeRect = badge.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const style = window.getComputedStyle(badge);
    return {
      rightOffsetFromFrame: Math.round(frameRect.right - badgeRect.right),
      topOffsetFromFrame: Math.round(badgeRect.top - frameRect.top),
      insideCell: badgeRect.left >= cellRect.left && badgeRect.top >= cellRect.top && badgeRect.right <= cellRect.right && badgeRect.bottom <= cellRect.bottom,
      backgroundImage: style.backgroundImage,
      textShadow: style.textShadow,
      strokeWidth: style.webkitTextStrokeWidth || style.getPropertyValue('-webkit-text-stroke-width')
    };
  });
  expect(Math.abs(badgePosition.rightOffsetFromFrame)).toBeLessThanOrEqual(4);
  expect(Math.abs(badgePosition.topOffsetFromFrame)).toBeLessThanOrEqual(4);
  expect(badgePosition.insideCell).toBe(true);
  expect(badgePosition.backgroundImage).toContain('checkbox-empty.png');
  expect(badgePosition.textShadow).toMatch(/rgba?\(0, 0, 0/);
  expect(badgePosition.strokeWidth).not.toBe('0px');

  const tarotIconMetrics = await page.locator('#inventoryGrid .inventory-item-cell[data-category="TarotMinor"] .inventory-item-icon-frame').first().evaluate((frame) => {
    const icon = frame.querySelector('.inventory-item-icon');
    const frameRect = frame.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();
    return {
      frameWidth: Math.round(frameRect.width),
      frameHeight: Math.round(frameRect.height),
      iconWidth: Math.round(iconRect.width),
      iconHeight: Math.round(iconRect.height),
      iconTransform: window.getComputedStyle(icon).transform
    };
  });
  expect(tarotIconMetrics).toMatchObject({
    frameWidth: 48,
    frameHeight: 80,
    iconWidth: 48,
    iconHeight: 80,
    iconTransform: 'none'
  });

  const equippedTarotMarker = await page.locator('#inventoryGrid .inventory-item-cell.is-equipped[data-category="TarotMinor"]').evaluate((cell) => {
    const marker = window.getComputedStyle(cell, '::after');
    const style = window.getComputedStyle(cell);
    return {
      content: marker.content,
      borderImageSource: style.borderImageSource,
      overflow: style.overflow
    };
  });
  expect(equippedTarotMarker.content).toBe('none');
  expect(equippedTarotMarker.borderImageSource).toContain('panel-gold-square.png');
  expect(equippedTarotMarker.overflow).toBe('visible');

  const countBadgeMetrics = await page.locator('#inventoryGrid .inventory-item-cell[data-category="TarotMinor"]:has(.inventory-item-badge.is-count)').first().evaluate((cell) => {
    const countBadge = cell.querySelector('.inventory-item-badge.is-count');
    const frame = cell.querySelector('.inventory-item-icon-frame');
    const countRect = countBadge.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    return {
      text: countBadge.textContent,
      centeredOffset: Math.round(((countRect.left + countRect.right) / 2) - ((cellRect.left + cellRect.right) / 2)),
      bottomOverlap: Math.round(frameRect.bottom - countRect.top),
      overflow: window.getComputedStyle(cell).overflow,
      zIndex: window.getComputedStyle(countBadge).zIndex
    };
  });
  expect(countBadgeMetrics.text).toBe('×3');
  expect(Math.abs(countBadgeMetrics.centeredOffset)).toBeLessThanOrEqual(1);
  expect(countBadgeMetrics.bottomOverlap).toBeGreaterThanOrEqual(0);
  expect(countBadgeMetrics.bottomOverlap).toBeLessThanOrEqual(10);
  expect(countBadgeMetrics.overflow).toBe('visible');
  expect(Number.parseInt(countBadgeMetrics.zIndex, 10)).toBeGreaterThanOrEqual(30);

  const levelBadgeMetrics = await page.locator('#inventoryGrid .inventory-item-cell[data-category="TarotMinor"] .inventory-item-stat-badge').first().evaluate((levelBadge) => {
    const cell = levelBadge.closest('.inventory-item-cell');
    const frame = cell.querySelector('.inventory-item-icon-frame');
    const numberBadge = cell.querySelector('.tarot-number-badge');
    const levelRect = levelBadge.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const numberRect = numberBadge.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const style = window.getComputedStyle(levelBadge);
    return {
      text: levelBadge.textContent,
      leftOffsetFromFrame: Math.round(levelRect.left - frameRect.left),
      topOverlap: Math.round(levelRect.bottom - frameRect.top),
      overlapsNumber: levelRect.left < numberRect.right && levelRect.right > numberRect.left && levelRect.top < numberRect.bottom && levelRect.bottom > numberRect.top,
      backgroundImage: style.backgroundImage,
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      textShadow: style.textShadow,
      strokeWidth: style.webkitTextStrokeWidth || style.getPropertyValue('-webkit-text-stroke-width'),
      overflow: window.getComputedStyle(cell).overflow,
      zIndex: window.getComputedStyle(levelBadge.closest('.inventory-item-stat-badges')).zIndex
    };
  });
  expect(levelBadgeMetrics.text).toBe('Lv1');
  expect(Math.abs(levelBadgeMetrics.leftOffsetFromFrame)).toBeLessThanOrEqual(2);
  expect(levelBadgeMetrics.topOverlap).toBeGreaterThanOrEqual(0);
  expect(levelBadgeMetrics.topOverlap).toBeLessThanOrEqual(10);
  expect(levelBadgeMetrics.overlapsNumber).toBe(false);
  expect(levelBadgeMetrics.backgroundImage).toBe('none');
  expect(levelBadgeMetrics.backgroundColor).toContain('rgba(3, 5, 8');
  expect(Number.parseFloat(levelBadgeMetrics.borderRadius)).toBeGreaterThan(5);
  expect(levelBadgeMetrics.textShadow).toMatch(/rgba?\(0, 0, 0/);
  expect(levelBadgeMetrics.strokeWidth).toBe('0px');
  expect(levelBadgeMetrics.overflow).toBe('visible');
  expect(Number.parseInt(levelBadgeMetrics.zIndex, 10)).toBeGreaterThanOrEqual(30);
  await expectNoPageErrors(errors);
});

test('tarot cards open detail before changing deck membership', async ({ page }) => {
  const errors = trackPageErrors(page);
  const tarotItems = [
    {
      itemId: 'tarot_minor_wand_7',
      name: 'Wand Seven',
      customData: { Category: 'TarotMinor', ArcanaSuit: 'wand', ArcanaRank: '7', CardNumber: '7' }
    },
    {
      itemId: 'tarot_minor_cup_10',
      name: 'Cup Ten',
      customData: { Category: 'TarotMinor', ArcanaSuit: 'cup', ArcanaRank: '10', CardNumber: '10' }
    }
  ];
  const equipRequests = [];
  const unequipRequests = [];

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
        tarotDeck: ['tarot_minor_cup_10'],
        tarotRole: null
      })
    });
  });
  await page.route('**/api/player-ship/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        ship: { form: 'boat', stage: 1, majorArcanaSlotLimit: 1, majorArcanaItemIds: [] }
      })
    });
  });
  await page.route('**/api/ship-skill-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, majorArcanaSlotLimit: 1, majorArcanaItemIds: [], skills: [] })
    });
  });
  await page.route('**/api/tarot-deck-equip', async (route) => {
    equipRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ok: true,
        tarotDeck: ['tarot_minor_cup_10', 'tarot_minor_wand_7'],
        tarotRole: null
      })
    });
  });
  await page.route('**/api/tarot-deck-unequip', async (route) => {
    unequipRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ok: true,
        tarotDeck: ['tarot_minor_wand_7'],
        tarotRole: null
      })
    });
  });
  await page.route('**/api/tarot-battle-skills', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ok: true,
        cards: [
          {
            cardId: 'WAND_07',
            itemId: 'minor-wand-7',
            cardName: 'ワンド7',
            suit: 'ワンド',
            element: '火',
            elementKey: 'fire',
            skillName: '勝利の旗火',
            target: '敵1体',
            effectClass: '攻撃/条件強化',
            description: '中ダメージ。条件達成時に攻撃UP',
            damageTier: '中',
            healTier: '',
            status: '',
            successRate: '',
            cooldown: 3
          },
          {
            cardId: 'CUP_10',
            itemId: 'minor-cup-10',
            cardName: 'カップ10',
            suit: 'カップ',
            element: '水',
            elementKey: 'water',
            skillName: '大回復の杯',
            target: '自分',
            effectClass: '回復',
            description: '自分を大きく回復する',
            damageTier: '',
            healTier: '大',
            status: '',
            successRate: '',
            cooldown: 4
          }
        ]
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

  await expect(page.locator('#meleeDeckGrid')).toHaveAttribute('data-deck-count', '1');
  const tarotSticky = await page.evaluate(() => ({
    switcher: window.getComputedStyle(document.getElementById('inventoryMobileSwitch')).position,
    deck: window.getComputedStyle(document.querySelector('#tabContentInventory .inventory-section[data-panel="tarot"]')).position
  }));
  expect(tarotSticky).toEqual({ switcher: 'sticky', deck: 'sticky' });

  await page.locator('#meleeDeckGrid .tarot-loadout-card:not(.is-empty)').click();
  expect(unequipRequests).toHaveLength(0);
  await expect(page.locator('#itemDetailModal')).toBeVisible();
  await expect(page.locator('#itemDetailTarotCombat')).toContainText('大回復の杯');
  await expect(page.locator('#itemDetailTarotCombat')).toContainText('CT 4');
  await expect(page.locator('#itemDetailTarotCombat')).toContainText('デッキ1枚目');
  await page.evaluate(() => window.closeItemDetailModal && window.closeItemDetailModal());

  await page.locator('#inventoryGrid .inventory-item-cell:has(.tarot-number-badge.is-wand)').click();
  expect(equipRequests).toHaveLength(0);
  await expect(page.locator('#itemDetailModal')).toBeVisible();
  await expect(page.locator('#itemDetailTarotCombat')).toContainText('勝利の旗火');
  await expect(page.locator('#itemDetailTarotCombat')).toContainText('未セット');
  await expect(page.locator('#itemDetailTarotCombat')).toContainText('戦闘開始は1枚目から');
  await page.locator('#itemDetailModal .item-detail-action.is-equip').click();
  expect(equipRequests).toHaveLength(1);
  expect(equipRequests[0]).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    cardItemId: 'tarot_minor_wand_7',
    deckType: 'tarot'
  });
  await expect(page.locator('#meleeDeckGrid')).toHaveAttribute('data-deck-count', '2');

  await page.locator('#inventoryGrid .inventory-item-cell:has(.tarot-number-badge.is-cup)').click();
  expect(unequipRequests).toHaveLength(0);
  await expect(page.locator('#itemDetailModal')).toBeVisible();
  await page.locator('#itemDetailModal .item-detail-action.is-remove').click();
  expect(unequipRequests).toHaveLength(1);
  expect(unequipRequests[0]).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    cardItemId: 'tarot_minor_cup_10',
    deckType: 'tarot'
  });
  await expect(page.locator('#meleeDeckGrid')).toHaveAttribute('data-deck-count', '1');
  await expectNoPageErrors(errors);
});

test('equipment cards open detail before equipping from inventory grid', async ({ page }) => {
  const errors = trackPageErrors(page);
  const equipmentItems = [
    {
      itemId: 'sword_001',
      name: 'Iron Sword',
      description: 'A reliable blade with a readable detail description.',
      customData: { Category: 'Weapon', Power: 12, sprite_path: './Sprites/weapons/melee weapons/sword.png', sprite_index: '0' }
    },
    {
      itemId: 'shield_001',
      name: 'Round Shield',
      customData: { Category: 'Shield', Defense: 8, sprite_path: './Sprites/weapons/melee weapons/shield.png', sprite_index: '0' }
    },
    {
      itemId: 'hat_black_001',
      name: 'Leather Helm',
      customData: { Category: 'Armor', Defense: 6, sprite_path: './Sprites/wardrobe/cloth/hat_black.png', sprite_index: '0', sprite_w: '32', sprite_h: '32' }
    }
  ];
  const equipRequests = [];
  let equipmentState = {};

  await page.route('**/api/get-inventory', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        inventory: equipmentItems,
        virtualCurrency: { PS: 0 },
        contribution: 0
      })
    });
  });
  await page.route('**/api/get-equipment', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ equipment: equipmentState })
    });
  });
  await page.route('**/api/equip-item', async (route) => {
    const body = route.request().postDataJSON();
    equipRequests.push(body);
    if (body.slot) {
      equipmentState = { ...equipmentState, [body.slot]: body.itemId || null };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, equipment: equipmentState })
    });
  });
  await page.route('**/api/tarot-deck-get', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ok: true, tarotDeck: [], tarotRole: null })
    });
  });
  await page.route('**/api/player-ship/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        ship: { form: 'boat', stage: 1, majorArcanaSlotLimit: 1, majorArcanaItemIds: [] }
      })
    });
  });
  await page.route('**/api/ship-skill-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, majorArcanaSlotLimit: 1, majorArcanaItemIds: [], skills: [] })
    });
  });

  await bootstrapMainApp(page);

  await page.evaluate(async () => {
    const inventoryTab = document.getElementById('tabContentInventory');
    if (inventoryTab) inventoryTab.style.display = 'block';
    const inventory = await import('/js/inventory.js');
    await inventory.getInventory('PF_PLAYWRIGHT', { force: true });
    inventory.switchInventoryGroup('Equipment');
    inventory.switchInventoryTab('Weapon');
  });

  const equipmentLayout = await page.evaluate(() => ({
    switcher: window.getComputedStyle(document.getElementById('inventoryMobileSwitch')).position,
    loadout: window.getComputedStyle(document.querySelector('#tabContentInventory .avatar-card.inventory-section')).position,
    sectionHeader: window.getComputedStyle(document.querySelector('#tabContentInventory .inventory-section[data-panel="items"] > .section-header')).display,
    summary: window.getComputedStyle(document.getElementById('inventoryListSummary')).display,
    hint: window.getComputedStyle(document.getElementById('inventoryTabHint')).display
  }));
  expect(equipmentLayout).toEqual({
    switcher: 'sticky',
    loadout: 'static',
    sectionHeader: 'none',
    summary: 'none',
    hint: 'none'
  });

  await page.evaluate(async () => {
    const inventory = await import('/js/inventory.js');
    inventory.switchInventoryTab('Armor');
  });
  const armorIconMetrics = await page.locator('#inventoryGrid .inventory-item-cell[data-category="Armor"]').evaluate((cell) => {
    const frame = cell.querySelector('.inventory-item-icon-frame');
    const icon = cell.querySelector('.inventory-item-icon');
    const frameRect = frame.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();
    return {
      centerDelta: Math.round((iconRect.top + iconRect.height / 2) - (frameRect.top + frameRect.height / 2))
    };
  });
  expect(armorIconMetrics.centerDelta).toBeLessThan(0);
  await page.evaluate(async () => {
    const inventory = await import('/js/inventory.js');
    inventory.switchInventoryTab('Weapon');
  });

  await expect(page.locator('#inventoryGrid .inventory-item-cell[data-category="Weapon"] .inventory-item-stat-badge')).toHaveText('12');
  await expect(page.locator('#inventoryGrid .inventory-item-cell[data-category="Weapon"] .inventory-item-quick-action')).toHaveCount(0);
  await page.locator('#inventoryGrid .inventory-item-cell[data-category="Weapon"]').click();

  expect(equipRequests).toHaveLength(0);
  await expect(page.locator('#itemDetailModal')).toBeVisible();
  await expect(page.locator('#itemDetailDescription')).toContainText('readable detail description');
  const descriptionStyle = await page.locator('#itemDetailDescription').evaluate((description) => {
    const rect = description.getBoundingClientRect();
    const style = window.getComputedStyle(description);
    return {
      color: style.color,
      backgroundImage: style.backgroundImage,
      height: Math.round(rect.height),
      textShadow: style.textShadow
    };
  });
  expect(descriptionStyle.color).toBe('rgb(43, 25, 8)');
  expect(descriptionStyle.backgroundImage).toContain('panel-parchment-wide.png');
  expect(descriptionStyle.height).toBeGreaterThan(24);
  expect(descriptionStyle.textShadow).not.toBe('none');
  await page.locator('#itemDetailModal .item-detail-action.is-equip').first().click();
  expect(equipRequests).toHaveLength(1);
  expect(equipRequests[0]).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    itemId: 'sword_001',
    slot: 'RightHand'
  });
  await expect(page.locator('#inventoryGrid .inventory-item-cell[data-category="Weapon"]')).toHaveAttribute('data-equipment-state', 'equipped');
  await expect(page.locator('#inventoryGrid .inventory-item-cell[data-category="Weapon"] .inventory-item-quick-action')).toHaveCount(0);
  await expectNoPageErrors(errors);
});

test('single one-handed weapon cannot be equipped to both hands from detail modal', async ({ page }) => {
  const errors = trackPageErrors(page);
  const equipmentItems = [
    {
      itemId: 'sword_001',
      instances: ['sword-instance-1'],
      count: 1,
      name: 'Only Sword',
      customData: { Category: 'Weapon', Power: 12, sprite_path: './Sprites/weapons/melee weapons/sword.png', sprite_index: '0' }
    }
  ];

  await page.route('**/api/get-inventory', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        inventory: equipmentItems,
        virtualCurrency: { PS: 0 },
        contribution: 0
      })
    });
  });
  await page.route('**/api/get-equipment', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ equipment: { RightHand: { itemId: 'sword_001' } } })
    });
  });
  await page.route('**/api/tarot-deck-get', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ok: true, tarotDeck: [], tarotRole: null })
    });
  });

  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    const inventoryTab = document.getElementById('tabContentInventory');
    if (inventoryTab) inventoryTab.style.display = 'block';
    const inventory = await import('/js/inventory.js');
    await inventory.getInventory('PF_PLAYWRIGHT', { force: true });
    inventory.switchInventoryGroup('Equipment');
    inventory.switchInventoryTab('Weapon');
  });

  await page.locator('#inventoryGrid .inventory-item-cell[data-category="Weapon"]').click();
  await expect(page.locator('#itemDetailModal')).toBeVisible();
  await expect(page.locator('#itemDetailButtons .item-detail-action.is-remove')).toContainText('右手を外す');
  await expect(page.locator('#itemDetailButtons .item-detail-action.is-disabled')).toHaveText('左手装備');
  await expect(page.locator('#itemDetailButtons .item-detail-action.is-disabled')).toBeDisabled();
  await expect(page.locator('#itemDetailButtons .item-detail-action-note')).toHaveCount(0);
  await expectNoPageErrors(errors);
});
