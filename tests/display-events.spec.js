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
