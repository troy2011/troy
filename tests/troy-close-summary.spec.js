const { test, expect } = require('@playwright/test');
const {
  normalizeLineUserIdList,
  getConfiguredTroyCloseSummaryLineUserIds,
  getTroyBusinessDayKey,
  buildTroyTodaySalesSnapshot,
  buildTroySalesBreakdownsFromItems,
  buildTroySalesPayouts,
  buildTroyUsualItemsPayload,
  mergeTroyOrderHistoryItems,
  buildTroyBountyRankingRow,
  formatTroyCloseSummaryMessage
} = require('../server/nation');
const { buildCalculatedTroyBountyRanking } = require('../server/economy');

test('formats TROY close summary LINE message with daily sales and pending checkouts', () => {
  expect(normalizeLineUserIdList('U1, U2 U1;U3')).toEqual(['U1', 'U2', 'U3']);
  expect(normalizeLineUserIdList('["U4","U5","U4"]')).toEqual(['U4', 'U5']);

  const message = formatTroyCloseSummaryMessage({
    dayKey: '2026-06-05',
    nation: 'fire',
    sales: {
      total: 8600,
      count: 3,
      categories: [
        { categoryId: 'beer', name: 'ビール・ハイボール', quantity: 4, total: 2800 },
        { categoryId: 'food', name: 'フード', quantity: 2, total: 1000 },
        { categoryId: 'entry', name: 'チャージ', quantity: 1, total: 500 }
      ],
      items: [
        { name: '瓶ビール（ハートランド）', quantity: 3, total: 2100 },
        { name: 'フライドポテト', quantity: 2, total: 1000 },
        { name: '入店チャージ', quantity: 1, total: 500 }
      ],
      settlements: [
        { settlementId: 'settle-1', playFabId: 'PLAYER1', displayName: '海風の船長', total: 2700, totalItems: 3, settledAtMs: 1000 },
        { settlementId: 'settle-2', playFabId: 'PLAYER2', displayName: '港町の料理人', total: 5900, totalItems: 7, settledAtMs: 2000 }
      ]
    },
    memberCount: 2,
    pending: {
      count: 1,
      total: 1600,
      topItems: [
        { name: '入店チャージ', quantity: 1, total: 500 },
        { name: 'ビール', quantity: 2, total: 1100 }
      ]
    }
  });

  expect(message).toContain('【TROY CLOSE 売上まとめ】');
  expect(message).toContain('営業日: 2026-06-05');
  expect(message).toContain('総売上: ¥8,600 / 3伝票');
  expect(message).toContain('チャージ代: ¥500');
  expect(message).toContain('チャージ除外売上: ¥8,100');
  expect(message).toContain('マスター取り分: ¥4,050（チャージ代を抜いた売上金額の半分）');
  expect(message).toContain('ディーラー取り分: ¥500（チャージ代）');
  expect(message).toContain('会計済み客別:');
  expect(message).toContain('- 1. 海風の船長: ¥2,700 / 3点');
  expect(message).toContain('- 2. 港町の料理人: ¥5,900 / 7点');
  expect(message).toContain('入店中: 2名');
  expect(message).toContain('未会計伝票: 1件 / ¥1,600');
  expect(message).toContain('記録合計: ¥10,200');
  expect(message).toContain('カテゴリ別売上:');
  expect(message).toContain('- ビール・ハイボール x4 / ¥2,800');
  expect(message).toContain('商品別売上:');
  expect(message).toContain('- 瓶ビール（ハートランド） x3 / ¥2,100');
  expect(message).toContain('- 入店チャージ x1 / ¥500');
  expect(message).toContain('※未会計伝票はCLOSE処理でクリアされます。');
});

test('keeps after-midnight TROY close sales on the same business day', () => {
  const previousRollover = process.env.TROY_BUSINESS_DAY_ROLLOVER_HOUR_JST;
  try {
    process.env.TROY_BUSINESS_DAY_ROLLOVER_HOUR_JST = '5';

    const beforeMidnightJst = new Date('2026-06-05T14:30:00.000Z');
    const afterMidnightJst = new Date('2026-06-05T16:30:00.000Z');
    const afterRolloverJst = new Date('2026-06-05T20:30:00.000Z');

    expect(getTroyBusinessDayKey(beforeMidnightJst)).toBe('2026-06-05');
    expect(getTroyBusinessDayKey(afterMidnightJst)).toBe('2026-06-05');
    expect(getTroyBusinessDayKey(afterRolloverJst)).toBe('2026-06-06');

    const snapshot = buildTroyTodaySalesSnapshot({
      troyTodaySalesDayKey: '2026-06-05',
      troyTodaySalesTotal: 8600,
      troyTodaySalesCount: 3,
      troyTodaySalesCategories: [
        { categoryId: 'beer', name: 'ビール・ハイボール', quantity: 4, total: 2800 },
        { categoryId: 'entry', name: 'チャージ', quantity: 1, total: 500 }
      ],
      troyTodaySalesItems: [
        { name: '瓶ビール（ハートランド）', quantity: 3, total: 2100 },
        { name: '入店チャージ', quantity: 1, total: 500 }
      ],
      troyTodaySalesSettlements: [
        { settlementId: 'settle-2', playFabId: 'PLAYER2', displayName: '港町の料理人', total: 5900, totalItems: 7, settledAtMs: 2000 },
        { settlementId: 'settle-1', playFabId: 'PLAYER1', displayName: '海風の船長', total: 2700, totalItems: 3, settledAtMs: 1000 }
      ]
    }, { date: afterMidnightJst });

    expect(snapshot).toEqual({
      dayKey: '2026-06-05',
      total: 8600,
      count: 3,
      categories: [
        { categoryId: 'beer', name: 'ビール・ハイボール', quantity: 4, total: 2800 },
        { categoryId: 'entry', name: 'チャージ', quantity: 1, total: 500 }
      ],
      items: [
        { name: '瓶ビール（ハートランド）', quantity: 3, total: 2100 },
        { name: '入店チャージ', quantity: 1, total: 500 }
      ],
      settlements: [
        { settlementId: 'settle-1', playFabId: 'PLAYER1', displayName: '海風の船長', total: 2700, totalItems: 3, settledAtMs: 1000 },
        { settlementId: 'settle-2', playFabId: 'PLAYER2', displayName: '港町の料理人', total: 5900, totalItems: 7, settledAtMs: 2000 }
      ],
      payouts: {
        total: 8600,
        chargeTotal: 500,
        nonChargeTotal: 8100,
        masterShare: 4050,
        dealerShare: 500
      }
    });
  } finally {
    if (previousRollover === undefined) delete process.env.TROY_BUSINESS_DAY_ROLLOVER_HOUR_JST;
    else process.env.TROY_BUSINESS_DAY_ROLLOVER_HOUR_JST = previousRollover;
  }
});

test('limits detailed TROY close summary LINE text safely', () => {
  const settlements = Array.from({ length: 180 }, (_, index) => ({
    settlementId: `settle-${index}`,
    displayName: `とても長い名前のお客様${String(index + 1).padStart(3, '0')}`,
    total: 1000 + index,
    totalItems: 4,
    settledAtMs: 1000 + index
  }));
  const message = formatTroyCloseSummaryMessage({
    dayKey: '2026-06-05',
    nation: 'fire',
    sales: {
      total: 180000,
      count: 180,
      settlements
    }
  });

  expect(message.length).toBeLessThanOrEqual(4900);
  expect(message).toContain('※文字数上限のため');
});

test('builds TROY bounty ranking from fresh member snapshot when PlayFab stats lag', async () => {
  const fakePlayFabServer = {
    GetPlayerStatistics: () => {},
    GetPlayerProfile: () => {}
  };
  const row = await buildTroyBountyRankingRow({
    id: 'PLAYER1',
    data: () => ({
      displayName: '海風の船長',
      contributionTotal: 3000,
      level: 1,
      joinedAt: { toMillis: () => 1000 }
    })
  }, {
    PlayFabServer: fakePlayFabServer,
    promisifyPlayFab: async (method) => {
      if (method === fakePlayFabServer.GetPlayerStatistics) {
        return {
          Statistics: [
            { StatisticName: 'NationContribution', Value: 1000 },
            { StatisticName: 'Level', Value: 1 }
          ]
        };
      }
      return {
        PlayerProfile: {
          DisplayName: '海風の船長',
          AvatarUrl: 'https://example.test/avatar.png'
        }
      };
    },
    firestore: {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false, data: () => ({}) })
        })
      })
    }
  });

  expect(row.contributionDebt).toBe(0);
  expect(row.level).toBe(3);
  expect(row.bounty).toBe(9000);
  expect(row.avatarUrl).toBe('https://example.test/avatar.png');
});

test('builds calculated bounty ranking for get-bounty-ranking', async () => {
  const memberDocs = [
    {
      id: 'PLAYER_LOW',
      data: () => ({
        displayName: '低い賞金首',
        contributionTotal: 800,
        level: 2,
        joinedAt: { toMillis: () => 2000 }
      })
    },
    {
      id: 'PLAYER_HIGH',
      data: () => ({
        displayName: '高い賞金首',
        contributionTotal: 3000,
        level: 3,
        joinedAt: { toMillis: () => 1000 }
      })
    }
  ];
  const firestore = {
    collection: (name) => {
      if (name !== 'troy_rooms') {
        return {
          doc: () => ({
            get: async () => ({ exists: false, data: () => ({}) })
          })
        };
      }
      return {
        doc: () => ({
          get: async () => ({ exists: true, data: () => ({ isOpen: true }) }),
          collection: () => ({
            orderBy: () => ({
              limit: () => ({
                get: async () => ({ size: memberDocs.length, docs: memberDocs })
              })
            })
          })
        })
      };
    }
  };

  const ranking = await buildCalculatedTroyBountyRanking({
    firestore,
    PlayFabServer: {
      GetPlayerStatistics: () => {},
      GetPlayerProfile: () => {}
    },
    promisifyPlayFab: async (method, request) => {
      if (String(request?.PlayFabId || '') === 'PLAYER_HIGH' && method.name === 'GetPlayerProfile') {
        return { PlayerProfile: { DisplayName: '高い賞金首', AvatarUrl: '' } };
      }
      if (method.name === 'GetPlayerProfile') {
        return { PlayerProfile: { DisplayName: '低い賞金首', AvatarUrl: '' } };
      }
      return { Statistics: [] };
    }
  });

  expect(ranking.scope).toBe('troy-members');
  expect(ranking.isOpen).toBe(true);
  expect(ranking.memberCount).toBe(2);
  expect(ranking.ranking.map((row) => row.playFabId)).toEqual(['PLAYER_HIGH', 'PLAYER_LOW']);
  expect(ranking.ranking.map((row) => row.bounty)).toEqual([9000, 1600]);
});

test('builds TROY item and category sales breakdowns from checkout items', () => {
  const result = buildTroySalesBreakdownsFromItems([
    {
      name: '瓶ビール（ハートランド）',
      price: 700,
      quantity: 2,
      menuCategory: 'beer',
      menuCategoryLabel: 'ビール・ハイボール'
    },
    {
      name: '裏メニュー',
      price: 1500,
      quantity: 1,
      menuCategory: 'custom',
      menuCategoryLabel: '裏メニュー'
    },
    {
      name: '入店チャージ',
      price: 500,
      quantity: 1,
      menuCategory: 'entry',
      menuCategoryLabel: 'チャージ'
    }
  ]);

  expect(result.items).toEqual([
    { name: '瓶ビール（ハートランド）', quantity: 2, total: 1400 },
    { name: '裏メニュー', quantity: 1, total: 1500 },
    { name: '入店チャージ', quantity: 1, total: 500 }
  ].sort((a, b) => (b.total - a.total) || (b.quantity - a.quantity) || a.name.localeCompare(b.name, 'ja')));
  expect(result.categories).toEqual([
    { categoryId: 'custom', name: '裏メニュー', quantity: 1, total: 1500 },
    { categoryId: 'beer', name: 'ビール・ハイボール', quantity: 2, total: 1400 },
    { categoryId: 'entry', name: 'チャージ', quantity: 1, total: 500 }
  ]);
});

test('builds TROY master and dealer payouts from charge sales', () => {
  expect(buildTroySalesPayouts({
    total: 2700,
    categories: [
      { categoryId: 'beer', name: 'ビール・ハイボール', quantity: 2, total: 1400 },
      { categoryId: 'custom', name: '裏メニュー', quantity: 1, total: 800 },
      { categoryId: 'entry', name: 'チャージ', quantity: 1, total: 500 }
    ],
    items: [
      { name: '瓶ビール（ハートランド）', quantity: 2, total: 1400 },
      { name: '入店チャージ', quantity: 1, total: 500 }
    ]
  })).toEqual({
    total: 2700,
    chargeTotal: 500,
    nonChargeTotal: 2200,
    masterShare: 1100,
    dealerShare: 500
  });
});

test('resolves TROY close summary LINE IDs from game master environment keys', () => {
  const previousTroy = process.env.TROY_GAME_MASTER_LINE_USER_IDS;
  const previousQuest = process.env.QUEST_APPROVER_ADMIN_LINE_IDS;
  const previousGameMaster = process.env.GAME_MASTER_LINE_USER_IDS;
  const previousGameMasterSingle = process.env.GAME_MASTER_LINE_USER_ID;
  try {
    delete process.env.TROY_GAME_MASTER_LINE_USER_IDS;
    delete process.env.GAME_MASTER_LINE_USER_IDS;
    delete process.env.GAME_MASTER_LINE_USER_ID;
    process.env.QUEST_APPROVER_ADMIN_LINE_IDS = 'Ugm1, Ugm2 Ugm1';

    expect(getConfiguredTroyCloseSummaryLineUserIds()).toEqual(['Ugm1', 'Ugm2']);
  } finally {
    if (previousTroy === undefined) delete process.env.TROY_GAME_MASTER_LINE_USER_IDS;
    else process.env.TROY_GAME_MASTER_LINE_USER_IDS = previousTroy;
    if (previousQuest === undefined) delete process.env.QUEST_APPROVER_ADMIN_LINE_IDS;
    else process.env.QUEST_APPROVER_ADMIN_LINE_IDS = previousQuest;
    if (previousGameMaster === undefined) delete process.env.GAME_MASTER_LINE_USER_IDS;
    else process.env.GAME_MASTER_LINE_USER_IDS = previousGameMaster;
    if (previousGameMasterSingle === undefined) delete process.env.GAME_MASTER_LINE_USER_ID;
    else process.env.GAME_MASTER_LINE_USER_ID = previousGameMasterSingle;
  }
});

test('builds TROY usual order items from settled checkout history', () => {
  const merged = mergeTroyOrderHistoryItems([
    { name: 'ハイボール（角） S', price: 500, count: 2, lastOrderedAtMs: 1000 },
    { name: '梅水晶', price: 500, count: 1, lastOrderedAtMs: 900 }
  ], [
    { name: 'ハイボール（角） S', price: 500, quantity: 1, orderedAtMs: 2000 },
    { name: '梅水晶', price: 500, quantity: 3, orderedAtMs: 2100 },
    { name: '入店チャージ', price: 500, quantity: 1, orderedAtMs: 2200 },
    { name: '裏メニュー', price: 1500, quantity: 1, orderedAtMs: 2300 }
  ], 3000);

  const usualItems = buildTroyUsualItemsPayload({ items: merged });
  expect(usualItems.map((item) => item.name)).toEqual(['梅水晶', 'ハイボール（角） S']);
  expect(usualItems.map((item) => item.count)).toEqual([4, 3]);
  expect(usualItems).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ name: '入店チャージ' }),
    expect.objectContaining({ name: '裏メニュー' })
  ]));
});
