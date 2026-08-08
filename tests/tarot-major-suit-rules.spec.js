const { test, expect } = require('@playwright/test');
const {
  enrichTarotCatalogData,
  getMajorArcanaSuitInfo,
  inferTarotCatalogData
} = require('../server/tarotCards');

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

test('tarot catalog data is restored from modern and legacy item ids', () => {
  expect(inferTarotCatalogData('minor-wand-7')).toMatchObject({
    Category: 'TarotMinor',
    ArcanaSuit: 'Wand',
    ArcanaRank: 7,
    sprite_index: 6
  });
  expect(inferTarotCatalogData('tarot_minor_cup_10')).toMatchObject({
    Category: 'TarotMinor',
    ArcanaSuit: 'Cup',
    ArcanaRank: 10,
    sprite_index: 49
  });
  expect(inferTarotCatalogData('arcana-5')).toMatchObject({
    Category: 'TarotMajor',
    ArcanaNumber: 5,
    sprite_index: 85
  });
  expect(inferTarotCatalogData('tarot_major_sword_16')).toMatchObject({
    Category: 'TarotMajor',
    ArcanaNumber: 16,
    sprite_index: 96
  });

  expect(enrichTarotCatalogData('catalog-guid', {
    FriendlyId: 'minor-sword-3',
    DisplayName: '保存済み名称'
  })).toMatchObject({
    Category: 'TarotMinor',
    ArcanaSuit: 'Sword',
    ArcanaRank: 3,
    DisplayName: '保存済み名称'
  });
});
