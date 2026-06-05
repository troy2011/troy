const { test, expect } = require('@playwright/test');
const {
  normalizeLineUserIdList,
  getConfiguredTroyCloseSummaryLineUserIds,
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
  expect(message).toContain('日付: 2026-06-05');
  expect(message).toContain('本日売上: ¥8,600 / 3件');
  expect(message).toContain('入店中: 2名');
  expect(message).toContain('未会計: 1件 / ¥1,600');
  expect(message).toContain('- 入店チャージ x1 / ¥500');
  expect(message).toContain('※未会計伝票はCLOSE処理でクリアされます。');
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
