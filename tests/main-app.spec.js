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

  expect(state.loginPlayFabBody).toMatchObject({
    lineAccessToken: 'playwright-access-token',
    lineUserId: 'Uplaywright',
    displayName: 'Playwright Tester'
  });

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
        { displayName: '遊技王', score: 42, scoreScale: 1, level: 31, rankName: '提督', playFabId: 'PF_GAME' }
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
  await expect(page.locator('#billiardsRankingList')).toContainText('800点');

  await page.locator('#btnShowGameRanking').click();
  await expect(page.locator('#gameRankingArea')).toBeVisible();
  await expect(page.locator('#gameRankingList')).toContainText('遊技王');
  await expect(page.locator('#gameRankingList')).toContainText('42点');
  expect([...storeGameRequests].sort()).toEqual(['billiards', 'game']);
  await expect(page.locator('#kingStoreGameType option[value="billiards"]')).toHaveText('ビリヤード');
  await expect(page.locator('#kingStoreGameType option[value="game"]')).toHaveText('ゲーム');

  await expectNoPageErrors(errors);
});

test('troy tab replaces bottom chat with a menu board customer order request', async ({ page }) => {
  const errors = trackPageErrors(page);
  const customerOrderRequests = [];
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

  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    await window.showTab('troy');
  });

  await expect(page.locator('#tabContentTroy')).toBeVisible();
  await expect(page.locator('#troyChatDetails')).toHaveCount(0);
  const firstTroySectionId = await page.evaluate(() => (
    document.querySelector('#tabContentTroy')?.firstElementChild?.id || ''
  ));
  expect(firstTroySectionId).toBe('troyMenuBoardSection');
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
  await expect(page.locator('#troyMenuBoardCategoryTabs .troy-menu-board-tab-icon img')).toHaveCount(11);
  await expect(page.locator('#troyMenuBoardCategoryTabs .troy-menu-board-tab', { hasText: 'BOTTLE MENU' }).locator('.troy-menu-board-tab-icon img')).toHaveAttribute('src', /Sprites\/drinks\/troy_champagne_bottle_flute\.png/);
  await expect(page.locator('#troyMenuBoardCategoryTabs .troy-menu-board-tab', { hasText: '酒場のフード' }).locator('.troy-menu-board-tab-icon img')).toHaveAttribute('src', /Sprites\/food\/snack_fried_chicken_skillet\.png/);
  await expect(page.locator('#troyMenuBoardList')).toContainText('瓶ビール');
  await expect(page.locator('#troyMenuBoardList')).toContainText('S ¥500 / M ¥700');
  const heartlandBottleItem = page.locator('#troyMenuBoardList .troy-menu-board-item').filter({ has: page.locator('.troy-menu-board-name', { hasText: /^瓶ビール$/ }) });
  await expect(heartlandBottleItem).toContainText('¥700');
  await expect(heartlandBottleItem.locator('.troy-menu-board-icon img')).toHaveAttribute('src', /Sprites\/drinks\/fantasy_anchor_green_beer_bottle\.png/);
  await expect(heartlandBottleItem.locator('[data-troy-menu-board-order]')).toBeEnabled();
  await heartlandBottleItem.locator('[data-troy-menu-board-order]').click();
  expect(customerOrderRequests).toHaveLength(1);
  expect(customerOrderRequests[0]).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    troyNation: 'fire',
    menuId: 'beer',
    concept: '瓶ビール',
    content: 'ハートランド',
    quantity: 1
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

test('home ship evolution button stays inside the ship panel', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.route('**/api/player-ship/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        ship: {
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
            durationMs: 3 * 60 * 60 * 1000,
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
  await expect(panel.locator('.ship-exploration-badge')).toContainText(['100G', '3時間']);
  await expect(panel.locator('.ship-exploration-boss-chip')).toHaveCount(3);
  await expect(panel.locator('.ship-exploration-boss-chip').nth(0)).toContainText('弱');
  await expect(panel.locator('.ship-exploration-boss-chip').nth(0)).toContainText('財宝スライム');
  await expect(panel.locator('.ship-exploration-boss-chip').nth(1)).toContainText('中');
  await expect(panel.locator('.ship-exploration-boss-chip').nth(1)).toContainText('爆弾フグ');
  await expect(panel.locator('.ship-exploration-boss-chip').nth(2)).toContainText('強');
  await expect(panel.locator('.ship-exploration-boss-chip').nth(2)).toContainText('宝箱ミミック');
  await expect(panel.locator('.ship-exploration-boss-image')).toHaveCount(3);
  await expect(panel.locator('.ship-exploration-start')).toHaveText('探索開始');
  const explorationPanelFrame = await panel.locator('.ship-exploration-destination').evaluate((element) => ({
    panelBorder: getComputedStyle(document.getElementById('shipExplorationPanel')).borderImageSource,
    destinationBorder: getComputedStyle(element).borderImageSource
  }));
  expect(explorationPanelFrame.panelBorder).toContain('assets/ui/panels/');
  expect(explorationPanelFrame.destinationBorder).toContain('assets/ui/panels/');
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
  await expect(page.locator('#btnPlayerProfileTransfer')).toBeVisible();
  await expect(page.locator('#btnPlayerProfileTransfer')).toHaveText('G');
  await expect(page.locator('#btnPlayerProfileFavorite')).toBeVisible();
  await expect(page.locator('#btnPlayerProfileFavorite')).toHaveText('♡');
  await expect(page.locator('#btnPlayerProfileFavorite')).toHaveAttribute('aria-label', 'お気に入りに追加');
  await expect(page.locator('#btnPlayerProfileBeauty')).toBeHidden();
  await expect(page.locator('#playerProfileTransferPanel')).toBeHidden();
  await expect(page.locator('#playerProfileStatAllocation')).toBeHidden();
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
      avatarTransform: avatarInner ? window.getComputedStyle(avatarInner).transform : '',
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
  expect(layout.avatarCenterDelta).toBeLessThanOrEqual(12);
  expect(layout.avatarTransform).toContain('matrix');
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
    かしこさ: 9
  };
  const initialAllocation = {
    pointsPerLevel: 5,
    level: 3,
    totalEarned: 10,
    totalAllocated: 5,
    availablePoints: 5,
    stats: {
      str: { id: 'str', stat: 'ちから', label: '力', value: 4, allocated: 2 },
      def: { id: 'def', stat: 'みのまもり', label: '守', value: 6, allocated: 1 },
      agi: { id: 'agi', stat: 'すばやさ', label: '速', value: 8, allocated: 1 },
      int: { id: 'int', stat: 'かしこさ', label: '知', value: 9, allocated: 1 }
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
          ちから: 6,
          みのまもり: 7,
          StatPointSpent_Str: 4,
          StatPointSpent_Def: 2
        },
        statAllocation: {
          ...initialAllocation,
          totalAllocated: 8,
          availablePoints: 2,
          stats: {
            ...initialAllocation.stats,
            str: { ...initialAllocation.stats.str, value: 6, allocated: 4 },
            def: { ...initialAllocation.stats.def, value: 7, allocated: 2 }
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
          ちから: 6,
          みのまもり: 7
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
  await page.locator('[data-profile-stat-alloc="str"][data-profile-stat-delta="1"]').click();
  await expect(page.locator('#playerProfileStatAllocation .player-profile-stat-alloc-head b')).toHaveText('2pt');
  await expect(page.locator('.player-profile-stat-alloc-row').nth(0).locator('.player-profile-stat-alloc-value')).toHaveText('6');
  await expect(page.locator('.player-profile-stat-alloc-row').nth(1).locator('.player-profile-stat-alloc-value')).toHaveText('7');
  await page.locator('[data-profile-stat-alloc-save]').click();

  await expect.poll(() => allocationRequest?.allocations?.str || 0).toBe(2);
  expect(allocationRequest).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    allocations: { str: 2, def: 1 }
  });
  await expect(page.locator('#playerProfileStats .player-profile-stat strong')).toHaveText(['6', '7', '8', '9']);
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
      '#avatarStyleModal .avatar-style-panel',
      '#playerProfileStatAllocation',
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
  expect(slotIcons.right).toContain('033.png');
  expect(slotIcons.left).toContain('026.png');
  expect(slotIcons.accessory).toContain('028.png');

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
      armorArtCenterY: armorArtRect ? armorArtRect.top + armorArtRect.height / 2 : 0,
      armorSpriteCenterY: armorSpriteRect ? armorSpriteRect.top + armorSpriteRect.height / 2 : 0,
      statAtkColor: window.getComputedStyle(document.querySelector('#equippedRightHandStats .stat-atk')).color,
      statDefColor: window.getComputedStyle(document.querySelector('#equippedLeftHandStats .stat-def')).color,
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
  expect(layout.armorSpriteCenterY).toBeLessThan(layout.armorArtCenterY - 2);
  expect(layout.statAtkColor).toBe('rgb(255, 208, 138)');
  expect(layout.statDefColor).toBe('rgb(185, 220, 255)');
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

test('elf avatar uses purple base sprites when stored color is yellow', async ({ page }) => {
  const errors = trackPageErrors(page);
  const yellowElfSpriteRequests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/Sprites/Characters/elf/') && url.includes('_yellow.png')) {
      yellowElfSpriteRequests.push(url);
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
  ))).toContain('body_purple.png');
  await expect.poll(async () => page.locator('#home-avatar-layer-hair').evaluate((layer) => (
    window.getComputedStyle(layer).backgroundImage
  ))).toContain('elf_hair_purple.png');
  await expect.poll(async () => page.locator('#home-avatar-layer-facial-hair').evaluate((layer) => (
    window.getComputedStyle(layer).backgroundImage
  ))).toContain('elf_facialhair_purple.png');
  expect(yellowElfSpriteRequests).toHaveLength(0);
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

test('tarot deck and list show suit-colored number badges at the upper left', async ({ page }) => {
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
        tarotDeck: ['tarot_minor_cup_10', 'tarot_major_sword_5'],
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
  await expect(page.locator('#meleeDeckGrid .tarot-loadout-card:not(.is-empty) .tarot-number-badge')).toHaveText(['5', '10']);

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
    const style = window.getComputedStyle(badge);
    return {
      leftOffset: badgeRect.left - frameRect.left,
      topOffset: badgeRect.top - frameRect.top,
      textShadow: style.textShadow,
      strokeWidth: style.webkitTextStrokeWidth || style.getPropertyValue('-webkit-text-stroke-width')
    };
  });
  expect(badgePosition.leftOffset).toBeLessThan(8);
  expect(badgePosition.topOffset).toBeLessThan(8);
  expect(badgePosition.textShadow).toMatch(/rgba?\(0, 0, 0/);
  expect(badgePosition.strokeWidth).not.toBe('0px');
  await expectNoPageErrors(errors);
});
