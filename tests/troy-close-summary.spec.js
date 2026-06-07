const { test, expect } = require('@playwright/test');
const {
  normalizeLineUserIdList,
  getConfiguredTroyCloseSummaryLineUserIds,
  getTroyBusinessDayKey,
  buildTroyTodaySalesSnapshot,
  buildTroyUsualItemsPayload,
  mergeTroyOrderHistoryItems,
  formatTroyCloseSummaryMessage
} = require('../server/nation');

test('formats TROY close summary LINE message with daily sales and pending checkouts', () => {
  expect(normalizeLineUserIdList('U1, U2 U1;U3')).toEqual(['U1', 'U2', 'U3']);
  expect(normalizeLineUserIdList('["U4","U5","U4"]')).toEqual(['U4', 'U5']);

  const message = formatTroyCloseSummaryMessage({
    dayKey: '2026-06-05',
    nation: 'fire',
    sales: { total: 8600, count: 3 },
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
  expect(message).toContain('会計済売上: ¥8,600 / 3伝票');
  expect(message).toContain('入店中: 2名');
  expect(message).toContain('未会計伝票: 1件 / ¥1,600');
  expect(message).toContain('記録合計: ¥10,200');
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
      troyTodaySalesCount: 3
    }, { date: afterMidnightJst });

    expect(snapshot).toEqual({ dayKey: '2026-06-05', total: 8600, count: 3 });
  } finally {
    if (previousRollover === undefined) delete process.env.TROY_BUSINESS_DAY_ROLLOVER_HOUR_JST;
    else process.env.TROY_BUSINESS_DAY_ROLLOVER_HOUR_JST = previousRollover;
  }
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
