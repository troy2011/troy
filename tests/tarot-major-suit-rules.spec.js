const { test, expect } = require('@playwright/test');
const { getMajorArcanaSuitInfo } = require('../server/tarotCards');

test('only Magician and Tower through Sun have major arcana suits', () => {
  const expected = {
    1: 'all',
    16: 'sword',
    17: 'cup',
    18: 'pentacle',
    19: 'wand'
  };

  for (let number = 0; number <= 21; number += 1) {
    const info = getMajorArcanaSuitInfo({
      Category: 'TarotMajor',
      ArcanaNumber: number,
      ArcanaSuit: 'wand'
    });
    expect(info.key).toBe(expected[number] || 'none');
  }
});
