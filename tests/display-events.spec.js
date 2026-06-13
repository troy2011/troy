const { test, expect } = require('@playwright/test');
const { normalizeDisplayEvent } = require('../server/displayEvents');

test('display event normalization keeps entry sound and rank fields', () => {
  const event = normalizeDisplayEvent({
    topic: 'troy-entry',
    type: 'flare',
    label: '入店: 海風の船長',
    level: 28,
    rankName: '船長',
    rankBenefits: ['ドリンクサイズアップ1回', '専用ジョッキ 店内専用']
  });

  expect(event).toMatchObject({
    topic: 'troy-entry',
    type: 'flare',
    label: '入店: 海風の船長',
    level: 28,
    rankName: '船長',
    rankBenefits: ['ドリンクサイズアップ1回', '専用ジョッキ 店内専用']
  });
});

test('display event normalization keeps lifecycle topics for ranking refresh', () => {
  const event = normalizeDisplayEvent({
    topic: 'troy-status',
    type: 'splash',
    label: 'TROY CLOSE',
    isOpen: false
  });

  expect(event).toMatchObject({
    topic: 'troy-status',
    type: 'splash',
    label: 'TROY CLOSE',
    isOpen: false
  });
  expect(event).not.toHaveProperty('level');
  expect(event).not.toHaveProperty('rankBenefits');
});

test('display event normalization supports generic customer order notices', () => {
  const event = normalizeDisplayEvent({
    topic: 'troy-customer-order',
    type: 'refresh',
    label: 'TROYメニュー注文あり',
    requestId: 'customer-order-001',
    createdAtMs: 1710000000000
  });

  expect(event).toMatchObject({
    topic: 'troy-customer-order',
    type: 'refresh',
    label: 'TROYメニュー注文あり',
    requestId: 'customer-order-001',
    createdAtMs: 1710000000000
  });
  expect(event).not.toHaveProperty('displayName');
  expect(event).not.toHaveProperty('itemName');
  expect(event).not.toHaveProperty('quantity');
  expect(event).not.toHaveProperty('lineTotal');
  expect(event).not.toHaveProperty('menuImage');
});
