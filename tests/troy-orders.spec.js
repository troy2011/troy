const { test, expect } = require('@playwright/test');

test('staff register creates a checkout from an in-store member and settles with chip return', async ({ page }) => {
  const now = Date.now();
  const state = {
    troyOpen: true,
    nation: 'fire',
    troyTodaySales: {
      total: 2700,
      count: 3,
      categories: [
        { categoryId: 'beer', name: 'ビール・ハイボール', quantity: 2, total: 1400 },
        { categoryId: 'custom', name: '裏メニュー', quantity: 1, total: 800 },
        { categoryId: 'entry', name: 'チャージ', quantity: 1, total: 500 }
      ],
      items: [
        { name: '瓶ビール（ハートランド）', quantity: 2, total: 1400 },
        { name: '裏メニュー', quantity: 1, total: 800 },
        { name: '入店チャージ', quantity: 1, total: 500 }
      ]
    },
    troyCoinConversionLogs: [],
    troyMembers: [
      {
        playFabId: 'PLAYER1',
        displayName: '海風の船長',
        joinedAtMs: now - 600000,
        level: 24,
        rankName: '船長',
        usualItems: [
          { name: 'ジンリッキー（+ソーダ） S', price: 500, count: 5, lastOrderedAtMs: now - 86400000 },
          { name: 'ファジーネーブル（ピーチ+オレンジ） S', price: 500, count: 3, lastOrderedAtMs: now - 172800000 }
        ]
      },
      { playFabId: 'PLAYER2', displayName: '港町の料理人', joinedAtMs: now - 300000, level: 18, rankName: '航海士' }
    ],
    troyPendingCheckouts: []
  };
  const addItemRequests = [];
  const quantityRequests = [];
  const removeItemRequests = [];
  const settleRequests = [];

  await page.addInitScript(() => {
    window.EventSource = class {
      constructor() {}
      close() {}
    };
  });

  await page.route('**/api/troy-orders/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(state)
    });
  });

  await page.route('**/api/troy-orders/add-item', async (route) => {
    const body = route.request().postDataJSON();
    addItemRequests.push(body);
    const existing = state.troyPendingCheckouts.find((entry) => entry.playFabId === body.receiverPlayFabId);
    const item = {
      orderId: `staff:${body.receiverPlayFabId}:${Date.now()}`,
      name: body.name,
      quantity: body.quantity || 1,
      price: body.price,
      menuImage: body.menuImage || body.image || '',
      image: body.image || body.menuImage || '',
      iconImage: body.iconImage || body.image || body.menuImage || '',
      menuCategory: body.menuCategory || '',
      menuCategoryLabel: body.menuCategoryLabel || '',
      lineTotal: body.price * (body.quantity || 1),
      status: 'pending',
      orderedAtMs: Date.now()
    };
    if (existing) {
      existing.items.push(item);
      existing.total += item.lineTotal;
      existing.totalItems += item.quantity;
      existing.lastOrderedAtMs = item.orderedAtMs;
    } else {
      const member = state.troyMembers.find((entry) => entry.playFabId === body.receiverPlayFabId);
      state.troyPendingCheckouts.push({
        playFabId: body.receiverPlayFabId,
        displayName: member?.displayName || body.receiverPlayFabId,
        status: 'open',
        total: item.lineTotal,
        totalItems: item.quantity,
        grantTotal: 0,
        createdAtMs: item.orderedAtMs,
        lastOrderedAtMs: item.orderedAtMs,
        items: [item]
      });
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  await page.route('**/api/troy-orders/item-quantity', async (route) => {
    const body = route.request().postDataJSON();
    quantityRequests.push(body);
    const checkout = state.troyPendingCheckouts.find((entry) => entry.playFabId === body.receiverPlayFabId);
    const item = checkout?.items.find((entry) => entry.orderId === body.orderId);
    if (checkout && item) {
      const previousQuantity = Math.max(1, item.quantity || 1);
      item.quantity = Math.max(1, Math.min(99, previousQuantity + (body.delta || 0)));
      item.lineTotal = item.price * item.quantity;
      delete item.status;
      delete item.servedAtMs;
      checkout.total = checkout.items.reduce((sum, entry) => sum + entry.lineTotal, 0);
      checkout.totalItems = checkout.items.reduce((sum, entry) => sum + entry.quantity, 0);
      checkout.lastOrderedAtMs = Date.now();
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, checkout }) });
  });

  await page.route('**/api/troy-orders/remove-item', async (route) => {
    const body = route.request().postDataJSON();
    removeItemRequests.push(body);
    const checkout = state.troyPendingCheckouts.find((entry) => entry.playFabId === body.receiverPlayFabId);
    if (checkout) {
      checkout.items = checkout.items.filter((entry) => entry.orderId !== body.orderId);
      checkout.total = checkout.items.reduce((sum, entry) => sum + entry.lineTotal, 0);
      checkout.totalItems = checkout.items.reduce((sum, entry) => sum + entry.quantity, 0);
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, checkout }) });
  });

  await page.route('**/api/troy-orders/settle', async (route) => {
    const body = route.request().postDataJSON();
    settleRequests.push(body);
    state.troyPendingCheckouts = state.troyPendingCheckouts.filter((entry) => entry.playFabId !== body.receiverPlayFabId);
    state.troyMembers = state.troyMembers.filter((entry) => entry.playFabId !== body.receiverPlayFabId);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, chipReturnAmount: body.chipReturnAmount })
    });
  });

  await page.goto('/troy-orders.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('h1')).toHaveText('会計レジ');
  await expect(page.locator('#troyOrdersTodaySales')).toHaveText('¥2,700');
  await expect(page.locator('#troyOrdersSalesBreakdown')).toContainText('マスター取り分');
  await expect(page.locator('#troyOrdersSalesBreakdown')).toContainText('¥1,100');
  await expect(page.locator('#troyOrdersSalesBreakdown')).toContainText('ディーラー取り分');
  await expect(page.locator('#troyOrdersSalesBreakdown')).toContainText('¥500');
  await expect(page.locator('#troyOrdersSalesBreakdown')).toContainText('カテゴリ別売上');
  await expect(page.locator('#troyOrdersSalesBreakdown')).toContainText('商品別売上');
  await expect(page.locator('#troyOrdersSalesBreakdown')).toContainText('ビール・ハイボール');
  await expect(page.locator('#troyOrdersSalesBreakdown')).toContainText('瓶ビール（ハートランド）');
  await expect(page.locator('[data-open-ticket]')).toHaveCount(2);
  await expect(page.locator('#troyOrdersEmpty')).toBeHidden();

  await page.locator('[data-open-ticket]', { hasText: '海風の船長' }).click();
  await expect(page.locator('#troyOrdersTicketModal')).toBeVisible();
  await expect(page.locator('#troyOrdersTicketDetail')).toContainText('大きな伝票');
  await expect(page.locator('#troyOrdersTicketDetail')).toContainText('海風の船長');
  const usualCategory = page.locator('#troyOrdersTicketDetail .troy-orders-pos-category').first();
  await expect(usualCategory.locator('summary')).toHaveText('いつもの');
  await expect(usualCategory.locator('[data-add-item][data-item-name="ジンリッキー（+ソーダ） S"]')).toContainText('過去5回');
  await expect(usualCategory.locator('[data-add-item][data-item-name="ファジーネーブル（ピーチ+オレンジ） S"]')).toContainText('過去3回');
  await expect(usualCategory.locator('[data-add-item][data-item-name="ジンリッキー（+ソーダ） S"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/cocktail_clear_soda_tumbler\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="ハイボール（角） S"]')).toContainText('¥500');
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="ハイボール（角） M"]')).toContainText('¥700');
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="シャンディガフ（ビール+ジンジャーエール） S"]')).toContainText('¥500');
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="シャンディガフ（ビール+ジンジャーエール） M"]')).toContainText('¥700');
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="ノンアルコール瓶ビール（ハイネケン）"]')).toContainText('¥500');
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="ノンアルコール瓶ビール（コロナセロ）"]')).toContainText('¥500');
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="ラムパイン（+パイン） S"]')).toContainText('¥500');
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="モヒート（ミント+ソーダ） M"]')).toContainText('¥700');
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="韓国のり"]')).toContainText('¥300');
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
    const addButton = page.locator('#troyOrdersTicketDetail [data-add-item]').filter({ has: page.locator('.troy-orders-pos-name', { hasText: new RegExp(`^${foodName}$`) }) });
    await expect(addButton).toContainText('¥500');
    await expect(addButton.locator('.troy-orders-pos-thumb img')).toHaveAttribute('src', imagePattern);
  }
  const pockyButton = page.locator('#troyOrdersTicketDetail [data-add-item]').filter({ has: page.locator('.troy-orders-pos-name', { hasText: /^ポッキー$/ }) });
  await expect(pockyButton).toContainText('¥300');
  await expect(pockyButton.locator('.troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/food\/pirate_dried_fish_sticks\.png/);
  await expect(page.locator('#troyOrdersTicketDetail')).not.toContainText('ワイン各種');
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="黒霧ボトル"]')).toContainText('¥3,000');
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="ワインボトル"]')).toContainText('¥3,000');
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="グラスワイン（赤） S"]')).toContainText('¥500');
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="グラスワイン（白） S"]')).toContainText('¥500');
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="モエ・エ・シャンドン"]')).toContainText('¥18,000');
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="角ボトル"]')).toContainText('¥4,000');
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="ワインボトル"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/pirate_red_wine_bottle\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="グラスワイン（赤） S"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/pirate_red_wine_glass\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="グラスワイン（白） S"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/fantasy_compass_white_wine\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="モエ・エ・シャンドン"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/troy_champagne_bottle_flute\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="角ボトル"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/troy_yamazaki_whisky_bottle\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="キンミヤボトル"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/pirate_blue_crystal_potion\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="瓶ビール（ハートランド）"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/fantasy_anchor_green_beer_bottle\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="ノンアルコール瓶ビール（コロナセロ）"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/fantasy_golden_compass_beer\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="ジントニック（+トニック） S"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/cocktail_silver_sparkle_highball\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="ジンバック（+ジンジャーエール） S"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/cocktail_gold_sparkle_highball\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="モスコミュール（+ジンジャーエール） S"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/cocktail_gold_sparkle_highball\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="ウォッカトニック（+トニック） S"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/cocktail_clear_soda_tumbler\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="キューバリブレ（+コーラ） S"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/cocktail_copper_mint_mug\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="ラムバック（+ジンジャーエール） S"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/pirate_lime_grog_mug\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="ラムパイン（+パイン） S"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/cocktail_pineapple_skull_tiki\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="モヒート（ミント+ソーダ） S"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/cocktail_skull_mint_tankard\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="メキシコーラ（+コーラ） S"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/cocktail_lime_cola_highball\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="カシスオレンジ S"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/troy_cassis_rocks_glass\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="ナゲット"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/food\/pirate_fried_chicken_nuggets\.png/);
  await expect(page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="梅水晶"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/food\/pirate_ume_crystal_bowl\.png/);

  await page.locator('#troyOrdersTicketDetail .troy-orders-pos-category', { hasText: 'ビール・ハイボール' }).locator('summary').click();
  await page.locator('#troyOrdersTicketDetail [data-add-item][data-item-name="瓶ビール（ハートランド）"]').click();

  expect(addItemRequests).toHaveLength(1);
  expect(addItemRequests[0].receiverPlayFabId).toBe('PLAYER1');
  expect(addItemRequests[0].image).toMatch(/Sprites\/drinks\/fantasy_anchor_green_beer_bottle\.png/);
  expect(addItemRequests[0].menuImage).toMatch(/Sprites\/drinks\/fantasy_anchor_green_beer_bottle\.png/);
  expect(addItemRequests[0].menuCategory).toBe('beer');
  expect(addItemRequests[0].menuCategoryLabel).toBe('ビール・ハイボール');
  await expect(page.locator('#troyOrdersTicketModal')).toBeVisible();
  await expect(page.locator('#troyOrdersTicketDetail')).toContainText('¥700');
  await expect(page.locator('[data-open-ticket]', { hasText: '海風の船長' })).toContainText('¥700');
  const beerOrderRow = page.locator('#troyOrdersTicketDetail .troy-orders-item-row', { hasText: '瓶ビール（ハートランド）' });
  await expect(beerOrderRow.locator('.troy-orders-quantity-control em')).toHaveText('x1');
  await beerOrderRow.locator('[data-increment-item]').click();
  expect(quantityRequests).toHaveLength(1);
  expect(quantityRequests[0].receiverPlayFabId).toBe('PLAYER1');
  expect(quantityRequests[0].delta).toBe(1);
  await expect(beerOrderRow.locator('.troy-orders-quantity-control em')).toHaveText('x2');
  await expect(beerOrderRow.locator('strong')).toHaveText('¥1,400');
  await expect(page.locator('[data-open-ticket]', { hasText: '海風の船長' })).toContainText('¥1,400');
  await beerOrderRow.locator('[data-remove-item]').click();
  expect(removeItemRequests).toHaveLength(1);
  expect(removeItemRequests[0].receiverPlayFabId).toBe('PLAYER1');
  await expect(beerOrderRow).toHaveCount(0);
  await expect(page.locator('#troyOrdersTicketDetail')).toContainText('注文を追加してください');
  await expect(page.locator('[data-open-ticket]', { hasText: '海風の船長' })).toContainText('未入力');

  await page.locator('#troyOrdersTicketDetail .troy-orders-custom-category summary').click();
  await expect(page.locator('#troyOrdersTicketDetail .troy-orders-custom-category summary')).toHaveText('裏メニュー');
  await page.locator('#troyOrdersTicketDetail [data-custom-price-preset="1500"]').click();
  await page.locator('#troyOrdersTicketDetail [data-add-custom-item]').click();

  expect(addItemRequests).toHaveLength(2);
  expect(addItemRequests[1].receiverPlayFabId).toBe('PLAYER1');
  expect(addItemRequests[1].name).toBe('裏メニュー');
  expect(addItemRequests[1].price).toBe(1500);
  expect(addItemRequests[1].menuCategory).toBe('custom');
  expect(addItemRequests[1].menuCategoryLabel).toBe('裏メニュー');
  await expect(page.locator('#troyOrdersTicketDetail')).toContainText('裏メニュー');
  await expect(page.locator('#troyOrdersTicketDetail')).toContainText('¥1,500');
  await expect(page.locator('[data-open-ticket]', { hasText: '海風の船長' })).toContainText('¥1,500');

  await page.locator('#troyOrdersTicketDetail [data-chip-return]').fill('300');
  await page.locator('#troyOrdersTicketDetail [data-settle]').click();
  await expect(page.locator('#troyOrdersConfirmModal')).toBeVisible();
  await expect(page.locator('#troyOrdersConfirmItems')).toContainText('チップ返却');
  await expect(page.locator('#troyOrdersConfirmItems')).toContainText('300G');
  await expect(page.locator('#troyOrdersConfirmItems')).not.toContainText('瓶ビール（ハートランド）');
  await expect(page.locator('#troyOrdersConfirmItems')).toContainText('裏メニュー');

  await page.locator('#troyOrdersReceivedAmount').fill('1000');
  await expect(page.locator('#troyOrdersChangeAmount')).toHaveText('不足 ¥500');
  await page.locator('#troyOrdersConfirmCheck').check();
  await expect(page.locator('#troyOrdersConfirmSubmit')).toBeDisabled();
  await page.locator('#troyOrdersReceivedAmount').fill('2000');
  await expect(page.locator('#troyOrdersChangeAmount')).toHaveText('¥500');
  await page.locator('#troyOrdersConfirmSubmit').click();

  expect(settleRequests).toHaveLength(1);
  expect(settleRequests[0].receiverPlayFabId).toBe('PLAYER1');
  expect(settleRequests[0].settlementRepresentativePlayFabId).toBe('PLAYER1');
  expect(settleRequests[0].expectedTotal).toBe(1500);
  expect(settleRequests[0].chipReturnAmount).toBe(300);
  await expect(page.locator('#troyOrdersMessage')).toContainText('会計と退店処理を完了しました');
  await expect(page.locator('[data-open-ticket]')).toHaveCount(1);
});

test('staff register accepts customer-side order requests into tickets', async ({ page }) => {
  const now = Date.now();
  const state = {
    troyOpen: true,
    nation: 'fire',
    troyTodaySales: { total: 0, count: 0 },
    troyCoinConversionLogs: [],
    troyMembers: [
      { playFabId: 'PLAYER1', displayName: '海風の船長', joinedAtMs: now - 60_000, level: 24, rankName: '船長' }
    ],
    troyPendingCheckouts: [],
    troyCustomerOrderRequests: [
      {
        requestId: 'REQ1',
        playFabId: 'PLAYER1',
        displayName: '海風の船長',
        status: 'pending',
        name: '瓶ビール（ハートランド）',
        price: 700,
        quantity: 1,
        lineTotal: 700,
        menuImage: './Sprites/drinks/fantasy_anchor_green_beer_bottle.png',
        menuCategory: 'beer',
        menuCategoryLabel: 'ビール・ハイボール',
        createdAtMs: now - 10_000
      }
    ]
  };
  const reviewRequests = [];

  await page.addInitScript(() => {
    window.EventSource = class {
      constructor() {}
      close() {}
    };
  });

  await page.route('**/api/troy-orders/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(state)
    });
  });

  await page.route('**/api/troy-orders/customer-request-review', async (route) => {
    const body = route.request().postDataJSON();
    reviewRequests.push(body);
    if (body.action === 'accept') {
      const request = state.troyCustomerOrderRequests.find((entry) => entry.requestId === body.requestId);
      state.troyCustomerOrderRequests = state.troyCustomerOrderRequests.filter((entry) => entry.requestId !== body.requestId);
      state.troyPendingCheckouts.push({
        playFabId: request.playFabId,
        displayName: request.displayName,
        status: 'open',
        total: request.lineTotal,
        totalItems: request.quantity,
        grantTotal: 0,
        createdAtMs: now,
        lastOrderedAtMs: now,
        items: [{
          orderId: `customer-request:${request.requestId}`,
          name: request.name,
          quantity: request.quantity,
          price: request.price,
          lineTotal: request.lineTotal,
          menuImage: request.menuImage,
          image: request.menuImage,
          iconImage: request.menuImage,
          menuCategory: request.menuCategory,
          menuCategoryLabel: request.menuCategoryLabel,
          status: 'pending',
          orderedAtMs: now
        }]
      });
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  await page.goto('/troy-orders.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#troyOrdersCustomerRequestsPanel')).toBeVisible();
  await expect(page.locator('#troyOrdersCustomerRequests')).toContainText('瓶ビール（ハートランド）');
  await page.locator('#troyOrdersCustomerRequests [data-review-customer-order="accept"]').click();

  expect(reviewRequests).toHaveLength(1);
  expect(reviewRequests[0]).toMatchObject({ requestId: 'REQ1', action: 'accept' });
  await expect(page.locator('#troyOrdersCustomerRequestsPanel')).toBeHidden();
  await expect(page.locator('[data-open-ticket]', { hasText: '海風の船長' })).toContainText('¥700');
  await expect(page.locator('[data-open-ticket]', { hasText: '海風の船長' })).toContainText('瓶ビール（ハートランド）');
});

test('staff register shows king-managed custom menu items', async ({ page }) => {
  const now = Date.now();
  const state = {
    troyOpen: true,
    nation: 'fire',
    troyTodaySales: { total: 0, count: 0 },
    troyCoinConversionLogs: [],
    menuCustomItems: [
      { id: 'custom-ice', menuId: 'mixer', concept: '特製氷', content: '澄んだ丸氷', price: 800, emoji: '🧊' }
    ],
    troyMembers: [
      { playFabId: 'PLAYER1', displayName: '海風の船長', joinedAtMs: now - 600000, level: 24, rankName: '船長' }
    ],
    troyPendingCheckouts: []
  };
  const addItemRequests = [];

  await page.addInitScript(() => {
    window.EventSource = class {
      constructor() {}
      close() {}
    };
  });

  await page.route('**/api/troy-orders/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(state)
    });
  });

  await page.route('**/api/troy-orders/add-item', async (route) => {
    addItemRequests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  await page.goto('/troy-orders.html', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-open-ticket]', { hasText: '海風の船長' }).click();

  const mixerCategory = page.locator('#troyOrdersTicketDetail .troy-orders-pos-category', { hasText: '割り物' });
  await mixerCategory.locator('summary').click();
  await expect(mixerCategory).toContainText('特製氷');
  await expect(mixerCategory).toContainText('澄んだ丸氷');
  await expect(mixerCategory.locator('[data-add-item][data-item-name="特製氷"] .troy-orders-pos-thumb img')).toHaveAttribute('src', /Sprites\/drinks\/cocktail_clear_soda_tumbler\.png/);

  await mixerCategory.locator('[data-add-item][data-item-name="特製氷"]').click();

  expect(addItemRequests).toHaveLength(1);
  expect(addItemRequests[0].receiverPlayFabId).toBe('PLAYER1');
  expect(addItemRequests[0].name).toBe('特製氷');
  expect(addItemRequests[0].price).toBe(800);
  expect(addItemRequests[0].image).toMatch(/Sprites\/drinks\/cocktail_clear_soda_tumbler\.png/);
});

test('staff register can settle grouped customer tickets together', async ({ page }) => {
  const now = Date.now();
  const state = {
    troyOpen: true,
    nation: 'fire',
    troyTodaySales: { total: 0, count: 0 },
    troyCoinConversionLogs: [],
    troyMembers: [
      { playFabId: 'PLAYER1', displayName: '海風の船長', joinedAtMs: now - 600000, level: 24, rankName: '船長' },
      { playFabId: 'PLAYER2', displayName: '港町の料理人', joinedAtMs: now - 300000, level: 18, rankName: '航海士' }
    ],
    troyPendingCheckouts: [
      {
        playFabId: 'PLAYER1',
        displayName: '海風の船長',
        status: 'open',
        total: 1000,
        totalItems: 2,
        grantTotal: 0,
        createdAtMs: now - 500000,
        lastOrderedAtMs: now - 490000,
        items: [
          { orderId: 'staff:PLAYER1:1', name: 'ハイボール（角） M', quantity: 1, price: 700, lineTotal: 700, status: 'served', servedAtMs: now - 480000, orderedAtMs: now - 500000 },
          { orderId: 'staff:PLAYER1:2', name: '韓国のり', quantity: 1, price: 300, lineTotal: 300, status: 'served', servedAtMs: now - 470000, orderedAtMs: now - 490000 }
        ]
      },
      {
        playFabId: 'PLAYER2',
        displayName: '港町の料理人',
        status: 'open',
        total: 700,
        totalItems: 1,
        grantTotal: 0,
        createdAtMs: now - 280000,
        lastOrderedAtMs: now - 270000,
        items: [
          { orderId: 'staff:PLAYER2:1', name: '瓶ビール（ハートランド）', quantity: 1, price: 700, lineTotal: 700, status: 'served', servedAtMs: now - 260000, orderedAtMs: now - 270000 }
        ]
      }
    ]
  };
  const settleRequests = [];

  await page.addInitScript(() => {
    window.EventSource = class {
      constructor() {}
      close() {}
    };
  });

  await page.route('**/api/troy-orders/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(state)
    });
  });

  await page.route('**/api/troy-orders/settle', async (route) => {
    const body = route.request().postDataJSON();
    settleRequests.push(body);
    state.troyPendingCheckouts = state.troyPendingCheckouts.filter((entry) => entry.playFabId !== body.receiverPlayFabId);
    state.troyMembers = state.troyMembers.filter((entry) => entry.playFabId !== body.receiverPlayFabId);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, chipReturnAmount: body.chipReturnAmount })
    });
  });

  await page.goto('/troy-orders.html', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-open-ticket]', { hasText: '海風の船長' }).click();
  await expect(page.locator('#troyOrdersTicketDetail')).toContainText('グループ会計');

  await page.locator('#troyOrdersTicketDetail .troy-orders-group-settle summary').click();
  await page.locator('#troyOrdersTicketDetail [data-group-customer-id="PLAYER2"]').check();
  await expect(page.locator('#troyOrdersTicketDetail [data-group-total]')).toHaveText('¥1,700');
  await expect(page.locator('#troyOrdersTicketDetail [data-group-count]')).toHaveText('2名');

  await page.locator('#troyOrdersTicketDetail [data-settle]').click();
  await expect(page.locator('#troyOrdersConfirmModal')).toBeVisible();
  await expect(page.locator('#troyOrdersConfirmName')).toHaveText('グループ会計（2名）');
  await expect(page.locator('#troyOrdersConfirmTotal')).toHaveText('¥1,700');
  await expect(page.locator('#troyOrdersConfirmItems')).toContainText('海風の船長');
  await expect(page.locator('#troyOrdersConfirmItems')).toContainText('港町の料理人');
  await expect(page.locator('#troyOrdersConfirmItems')).toContainText('ハイボール（角） M');
  await expect(page.locator('#troyOrdersConfirmItems')).toContainText('瓶ビール');

  await page.locator('#troyOrdersReceivedAmount').fill('2000');
  await expect(page.locator('#troyOrdersChangeAmount')).toHaveText('¥300');
  await page.locator('#troyOrdersConfirmCheck').check();
  await page.locator('#troyOrdersConfirmSubmit').click();

  await expect(page.locator('#troyOrdersMessage')).toContainText('グループ会計と退店処理を完了しました');
  expect(settleRequests).toHaveLength(2);
  expect(settleRequests.map((entry) => entry.receiverPlayFabId)).toEqual(['PLAYER1', 'PLAYER2']);
  expect(settleRequests.map((entry) => entry.settlementRepresentativePlayFabId)).toEqual(['PLAYER1', 'PLAYER1']);
  expect(settleRequests.map((entry) => entry.expectedTotal)).toEqual([1000, 700]);
  expect(settleRequests.map((entry) => entry.chipReturnAmount)).toEqual([0, 0]);
  await expect(page.locator('[data-open-ticket]')).toHaveCount(0);
});

test('staff register shows automatic entry charge on a newly entered member ticket', async ({ page }) => {
  const now = Date.now();
  const state = {
    troyOpen: true,
    nation: 'fire',
    troyTodaySales: { total: 0, count: 0 },
    troyCoinConversionLogs: [],
    troyMembers: [
      { playFabId: 'PLAYER1', displayName: '海風の船長', joinedAtMs: now - 120000, level: 24, rankName: '船長' }
    ],
    troyPendingCheckouts: [
      {
        playFabId: 'PLAYER1',
        displayName: '海風の船長',
        status: 'open',
        total: 500,
        totalItems: 1,
        grantTotal: 0,
        createdAtMs: now - 120000,
        lastOrderedAtMs: now - 120000,
        items: [
          {
            orderId: 'troy-entry:PLAYER1:fire',
            name: '入店チャージ',
            quantity: 1,
            price: 500,
            lineTotal: 500,
            status: 'served',
            servedAtMs: now - 120000,
            orderedAtMs: now - 120000
          }
        ]
      }
    ]
  };

  await page.addInitScript(() => {
    window.EventSource = class {
      constructor() {}
      close() {}
    };
  });

  await page.route('**/api/troy-orders/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(state)
    });
  });

  await page.goto('/troy-orders.html', { waitUntil: 'domcontentloaded' });

  const ticket = page.locator('[data-open-ticket]', { hasText: '海風の船長' });
  await expect(ticket).toContainText('入店チャージ');
  await expect(ticket).toContainText('¥500');
  await expect(ticket).toContainText('会計待ち');

  await ticket.click();
  await expect(page.locator('#troyOrdersTicketDetail')).toContainText('入店チャージ');
  await expect(page.locator('#troyOrdersTicketDetail')).toContainText('¥500');
  await expect(page.locator('#troyOrdersTicketDetail')).toContainText('全て提供済み');
});

test('staff register can group tickets by dragging and ungroup locally', async ({ page }) => {
  const now = Date.now();
  const state = {
    troyOpen: true,
    nation: 'fire',
    troyTodaySales: { total: 0, count: 0 },
    troyCoinConversionLogs: [],
    troyMembers: [
      { playFabId: 'PLAYER1', displayName: '海風の船長', joinedAtMs: now - 600000, level: 24, rankName: '船長' },
      { playFabId: 'PLAYER2', displayName: '港町の料理人', joinedAtMs: now - 300000, level: 18, rankName: '航海士' },
      { playFabId: 'PLAYER3', displayName: '旅人の剣士', joinedAtMs: now - 200000, level: 12, rankName: '甲板員' }
    ],
    troyPendingCheckouts: [
      {
        playFabId: 'PLAYER1',
        displayName: '海風の船長',
        status: 'open',
        total: 1000,
        totalItems: 2,
        grantTotal: 0,
        createdAtMs: now - 500000,
        lastOrderedAtMs: now - 490000,
        items: [
          { orderId: 'staff:PLAYER1:1', name: 'ハイボール（角） M', quantity: 1, price: 700, lineTotal: 700, status: 'served', servedAtMs: now - 480000, orderedAtMs: now - 500000 },
          { orderId: 'staff:PLAYER1:2', name: '韓国のり', quantity: 1, price: 300, lineTotal: 300, status: 'served', servedAtMs: now - 470000, orderedAtMs: now - 490000 }
        ]
      },
      {
        playFabId: 'PLAYER2',
        displayName: '港町の料理人',
        status: 'open',
        total: 700,
        totalItems: 1,
        grantTotal: 0,
        createdAtMs: now - 280000,
        lastOrderedAtMs: now - 270000,
        items: [
          { orderId: 'staff:PLAYER2:1', name: '瓶ビール（ハートランド）', quantity: 1, price: 700, lineTotal: 700, status: 'served', servedAtMs: now - 260000, orderedAtMs: now - 270000 }
        ]
      },
      {
        playFabId: 'PLAYER3',
        displayName: '旅人の剣士',
        status: 'open',
        total: 500,
        totalItems: 1,
        grantTotal: 0,
        createdAtMs: now - 180000,
        lastOrderedAtMs: now - 170000,
        items: [
          { orderId: 'staff:PLAYER3:1', name: '漬けチーズ', quantity: 1, price: 500, lineTotal: 500, status: 'served', servedAtMs: now - 160000, orderedAtMs: now - 170000 }
        ]
      }
    ]
  };
  const settleRequests = [];

  async function dragCenterToCenter(source, target) {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
    await page.mouse.up();
  }

  async function dragCenterToLeftEdge(source, target) {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + 8, targetBox.y + targetBox.height / 2, { steps: 10 });
    await page.mouse.up();
  }

  await page.addInitScript(() => {
    window.EventSource = class {
      constructor() {}
      close() {}
    };
  });

  await page.route('**/api/troy-orders/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(state)
    });
  });

  await page.route('**/api/troy-orders/settle', async (route) => {
    const body = route.request().postDataJSON();
    settleRequests.push(body);
    state.troyPendingCheckouts = state.troyPendingCheckouts.filter((entry) => entry.playFabId !== body.receiverPlayFabId);
    state.troyMembers = state.troyMembers.filter((entry) => entry.playFabId !== body.receiverPlayFabId);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, chipReturnAmount: body.chipReturnAmount })
    });
  });

  await page.goto('/troy-orders.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-open-ticket]')).toHaveCount(3);

  await dragCenterToCenter(
    page.locator('[data-open-ticket][data-customer-id="PLAYER2"]'),
    page.locator('[data-open-ticket][data-customer-id="PLAYER1"]')
  );

  await expect(page.locator('[data-open-ticket]')).toHaveCount(2);
  let groupTicket = page.locator('[data-open-ticket][data-group-id]');
  await expect(groupTicket).toContainText('海風の船長 と 港町の料理人');
  await expect(groupTicket).toContainText('グループ 2名');
  await expect(groupTicket.locator('[data-ungroup-ticket]')).toBeVisible();

  await groupTicket.locator('[data-ungroup-ticket]').click();
  await expect(page.locator('[data-open-ticket]')).toHaveCount(3);

  await dragCenterToCenter(
    page.locator('[data-open-ticket][data-customer-id="PLAYER2"]'),
    page.locator('[data-open-ticket][data-customer-id="PLAYER1"]')
  );
  groupTicket = page.locator('[data-open-ticket][data-group-id]');
  await dragCenterToLeftEdge(
    page.locator('[data-open-ticket][data-customer-id="PLAYER3"]'),
    groupTicket
  );
  await expect(page.locator('[data-open-ticket]').first()).toContainText('旅人の剣士');

  await groupTicket.click({ position: { x: 36, y: 82 } });
  await expect(page.locator('#troyOrdersTicketModal')).toBeVisible();
  await expect(page.locator('#troyOrdersTicketDetail [data-ticket-customer-name]')).toHaveText('海風の船長 と 港町の料理人');
  await expect(page.locator('#troyOrdersTicketDetail [data-group-total]')).toHaveText('¥1,700');
  await expect(page.locator('#troyOrdersTicketDetail [data-group-count]')).toHaveText('2名');

  await page.locator('#troyOrdersTicketDetail [data-settle]').click();
  await expect(page.locator('#troyOrdersConfirmName')).toHaveText('グループ会計（2名）');
  await expect(page.locator('#troyOrdersConfirmTotal')).toHaveText('¥1,700');
  await page.locator('#troyOrdersReceivedAmount').fill('2000');
  await expect(page.locator('#troyOrdersChangeAmount')).toHaveText('¥300');
  await page.locator('#troyOrdersConfirmCheck').check();
  await page.locator('#troyOrdersConfirmSubmit').click();

  await expect(page.locator('#troyOrdersMessage')).toContainText('グループ会計と退店処理を完了しました');
  expect(settleRequests).toHaveLength(2);
  expect(settleRequests.map((entry) => entry.receiverPlayFabId)).toEqual(['PLAYER1', 'PLAYER2']);
  expect(settleRequests.map((entry) => entry.settlementRepresentativePlayFabId)).toEqual(['PLAYER1', 'PLAYER1']);
  expect(settleRequests.map((entry) => entry.expectedTotal)).toEqual([1000, 700]);
  await expect(page.locator('[data-open-ticket]')).toHaveCount(1);
  await expect(page.locator('[data-open-ticket]')).toContainText('旅人の剣士');
});
