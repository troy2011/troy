const { test, expect } = require('@playwright/test');
const {
  normalizeLineUserIdList,
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
