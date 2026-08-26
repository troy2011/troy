const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  HEAD_ARMOR_OVERRIDES,
  OFFHAND_SPRITE_INDICES,
  getFriendlyId,
  normalizeCatalog
} = require('../scripts/normalize-equipment-catalog-presentation');
const {
  ACCESSORY_GROUPS,
  buildAccessoryItems,
  upsertGeneratedItems: upsertAccessoryItems
} = require('../scripts/upsert-accessory-catalog-items');
const { buildTarotManifestationEntry } = require('../server/tarotCards');

const rootCatalogPath = path.resolve(__dirname, '..', 'catalog_v2_items.json');
const localCatalogPath = path.resolve(__dirname, '..', 'data', 'local', 'catalog_v2_items.json');

function readCatalog(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function indexCatalog(catalog) {
  return new Map(catalog.Items.map((item) => [getFriendlyId(item), item]));
}

function getTitle(item) {
  return item?.Title?.['ja-JP'] || item?.Title?.NEUTRAL || '';
}

test('equipment presentation catalogs have unique ids and image-aligned names', () => {
  const expectedTitles = {
    blunt_16: '鉛球のフレイル',
    leather01_01: '角獣の面',
    leather02_01: '魔獣のかぶと',
    metal_37: 'フリギア兜',
    staff_05: '月輪の杖',
    sword_big_10: 'フランベルジュ',
    wand_04: '蛇木のワンド'
  };

  for (const filePath of [rootCatalogPath, localCatalogPath]) {
    const catalog = readCatalog(filePath);
    const ids = catalog.Items.map(getFriendlyId).filter(Boolean);
    const indexed = indexCatalog(catalog);

    expect(new Set(ids).size, filePath).toBe(ids.length);
    expect(ids.filter((id) => id === 'gun_01')).toHaveLength(1);
    expect(getTitle(indexed.get('gun_01'))).toBe('フリントロック');
    for (const [id, title] of Object.entries(expectedTitles)) {
      expect(getTitle(indexed.get(id)), id).toBe(title);
    }
  }
});

test('head armor names and defense values follow the image-aligned catalog definitions', () => {
  const entries = Object.entries(HEAD_ARMOR_OVERRIDES);
  expect(entries).toHaveLength(155);

  for (const filePath of [rootCatalogPath, localCatalogPath]) {
    const indexed = indexCatalog(readCatalog(filePath));
    const armorTitles = [];

    for (const [id, definition] of entries) {
      const item = indexed.get(id);
      const title = getTitle(item);
      expect(item?.DisplayProperties?.Category, id).toBe('Armor');
      expect(title, id).toBe(definition.title);
      expect(item?.DisplayProperties?.Defense, id).toBe(definition.defense);
      expect(Array.from(title).length, id).toBeLessThanOrEqual(10);
      armorTitles.push(title);
    }

    expect(new Set(armorTitles).size, filePath).toBe(armorTitles.length);
  }
});

test('all black metal head armor has legendary-tier base defense', () => {
  const definitions = Object.entries(HEAD_ARMOR_OVERRIDES)
    .filter(([id]) => id.startsWith('metal_black_'));
  expect(definitions).toHaveLength(23);
  expect(definitions.every(([, definition]) => definition.defense === 60)).toBe(true);

  for (const filePath of [rootCatalogPath, localCatalogPath]) {
    const indexed = indexCatalog(readCatalog(filePath));
    expect(definitions.every(([id]) => indexed.get(id)?.DisplayProperties?.Defense === 60), filePath).toBe(true);
  }
});

test('local catalog contains eight distinct accessory groups', () => {
  const catalog = readCatalog(localCatalogPath);
  const accessories = catalog.Items.filter((item) => item?.DisplayProperties?.Category === 'Accessory');
  const groupCounts = Object.fromEntries(ACCESSORY_GROUPS.map((group) => [group.key, 0]));
  const spriteKeys = new Set();

  for (const item of accessories) {
    const properties = item.DisplayProperties;
    groupCounts[properties.AccessoryGroup] += 1;
    spriteKeys.add(`${properties.sprite_path}:${properties.sprite_index}`);
  }

  expect(accessories).toHaveLength(40);
  expect(groupCounts).toEqual({
    mystic: 5,
    royal: 5,
    shadow: 5,
    nature: 5,
    tech: 5,
    gem: 5,
    feather: 5,
    medal: 5
  });
  expect(spriteKeys.size).toBe(accessories.length);

  const indexed = indexCatalog(catalog);
  expect(indexed.get('accessory_gem_05').DisplayProperties.Int).toBe(9);
  expect(indexed.get('accessory_feather_05').DisplayProperties).toMatchObject({ Power: 4, Agi: 12 });
  expect(indexed.get('accessory_medal_05').DisplayProperties).toMatchObject({ Power: 6, Defense: 9 });
  expect([1, 2, 3, 4, 5].map((tier) => (
    indexed.get(`accessory_feather_0${tier}`).DisplayProperties.Power
  ))).toEqual([1, 1, 2, 3, 4]);

  const basicStatTotal = (id) => ['Power', 'Defense', 'Agi', 'Int']
    .reduce((total, key) => total + Number(indexed.get(id).DisplayProperties[key] || 0), 0);
  for (const tier of [2, 3, 4, 5]) {
    expect(basicStatTotal(`accessory_feather_0${tier}`)).toBe(basicStatTotal(`accessory_shadow_0${tier}`));
  }
});

test('offhand icon assignments remain distinct from accessory icons', () => {
  const catalog = readCatalog(localCatalogPath);
  const indexed = indexCatalog(catalog);
  const accessorySpriteKeys = new Set(
    catalog.Items
      .filter((item) => item?.DisplayProperties?.Category === 'Accessory')
      .map((item) => `${item.DisplayProperties.sprite_path}:${item.DisplayProperties.sprite_index}`)
  );
  const offhandSpriteKeys = [];

  for (const [id, spriteIndex] of Object.entries(OFFHAND_SPRITE_INDICES)) {
    const item = indexed.get(id);
    expect(item?.DisplayProperties?.sprite_index, id).toBe(spriteIndex);
    offhandSpriteKeys.push(`${item.DisplayProperties.sprite_path}:${spriteIndex}`);
  }

  expect(new Set(offhandSpriteKeys).size).toBe(offhandSpriteKeys.length);
  expect(offhandSpriteKeys.some((key) => accessorySpriteKeys.has(key))).toBe(false);
});

test('new accessory groups can be selected for tarot manifestations', () => {
  const catalog = readCatalog(localCatalogPath);
  const catalogCache = Object.fromEntries(catalog.Items.map((item) => {
    const id = getFriendlyId(item);
    return [id, {
      FriendlyId: id,
      DisplayName: getTitle(item),
      ...(item.DisplayProperties || {})
    }];
  }));
  const cases = [
    { majorItemId: 'arcana-1', suit: 'sword', expectedGroup: 'accessory_gem' },
    { majorItemId: 'arcana-0', suit: 'sword', expectedGroup: 'accessory_feather' },
    { majorItemId: 'arcana-2', suit: 'sword', expectedGroup: 'accessory_medal' }
  ];

  for (const current of cases) {
    const manifestation = buildTarotManifestationEntry(
      'Accessory',
      { itemId: current.majorItemId, customData: {} },
      {
        itemId: `minor-${current.suit}`,
        name: '小アルカナ',
        customData: { ArcanaSuit: current.suit, ArcanaRank: 5 }
      },
      { catalogCache, manifestedAt: '2026-08-16T00:00:00.000Z' }
    );

    expect(manifestation.customData.ManifestTemplateGroup).toBe(current.expectedGroup);
    expect(manifestation.manifestedItemId).toMatch(new RegExp(`^${current.expectedGroup}_\\d+$`));
  }
});

test('catalog generators are idempotent and preserve the existing accessory position', () => {
  const catalog = readCatalog(localCatalogPath);
  const normalized = normalizeCatalog(structuredClone(catalog), 'test catalog').catalog;
  expect(normalized).toEqual(catalog);

  const generatedItems = buildAccessoryItems();
  const groupKeys = ACCESSORY_GROUPS.map((group) => group.key).join('|');
  const pattern = new RegExp(`^accessory_(${groupKeys})_\\d+$`);
  const mergedItems = upsertAccessoryItems(catalog.Items, generatedItems, pattern);
  const originalFirstIndex = catalog.Items.findIndex((item) => pattern.test(getFriendlyId(item)));
  const mergedFirstIndex = mergedItems.findIndex((item) => pattern.test(getFriendlyId(item)));

  expect(mergedFirstIndex).toBe(originalFirstIndex);
  expect(mergedItems.map(getFriendlyId)).toEqual(catalog.Items.map(getFriendlyId));
});
