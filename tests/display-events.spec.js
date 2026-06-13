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

test('display event normalization keeps customer order notice fields', () => {
  const event = normalizeDisplayEvent({
    topic: 'troy-customer-order',
    type: 'refresh',
    label: '注文: 海風の船長 / 瓶ビール（ハートランド） x2',
    requestId: 'customer-order-001',
    displayName: '海風の船長',
    itemName: '瓶ビール（ハートランド）',
    quantity: 2,
    lineTotal: 1400,
    menuImage: '/Sprites/drinks/fantasy_anchor_green_beer_bottle.png',
    createdAtMs: 1710000000000
  });

  expect(event).toMatchObject({
    topic: 'troy-customer-order',
    type: 'refresh',
    requestId: 'customer-order-001',
    displayName: '海風の船長',
    itemName: '瓶ビール（ハートランド）',
    quantity: 2,
    lineTotal: 1400,
    menuImage: '/Sprites/drinks/fantasy_anchor_green_beer_bottle.png',
    createdAtMs: 1710000000000
  });
});
