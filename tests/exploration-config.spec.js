const { test, expect } = require('@playwright/test');
const { __test } = require('../server/exploration');
const { buildLocalGachaCandidates } = require('../server/gacha');
const resourceStorage = require('../server/resourceStorage');
const pixelMonsters = require('../public/Sprites/pixel-monsters/manifest.json');

const FIXED_NOW_MS = Date.UTC(2026, 5, 18, 15, 30, 0);
const ADVANCED_BOSS_IDS = [
  'chained_megalodon',
  'specter_whale',
  'armored_kraken',
  'phantom_admiral',
  'abyss_angler',
  'cannon_hermit',
  'storm_serpent',
  'manta_wraith',
  'treasure_hermit'
];
const RECOMMENDED_LEVEL_BY_DESTINATION = {
  near_sea: 6,
  palm_islet: 7,
  coral_lagoon: 7,
  coral_passage: 7,
  old_lighthouse: 11,
  sunken_trader: 11,
  ship_graveyard: 22,
  pirate_cove: 15,
  deep_maelstrom: 19,
  megalodon_reef: 24,
  specter_whale_sea: 25,
  armored_kraken_nest: 28,
  phantom_admiral_marsh: 26,
  abyss_angler_vents: 27,
  cannon_hermit_fort: 26,
  storm_serpent_current: 29,
  manta_wraith_grotto: 27,
  treasure_hermit_cave: 30
};

function catalogItem(itemId, category, stats = {}) {
  return {
    ItemId: itemId,
    DisplayName: itemId,
    Category: category,
    ...stats
  };
}

test('exploration tarot encounter is stable and reserves large monsters for strong tiers', () => {
  const destination = __test.DESTINATIONS.near_sea;
  const weakBoss = { id: 'legacy-weak', tier: 'weak' };
  const strongBoss = { id: 'legacy-strong', tier: 'strong' };
  const weak = __test.buildExplorationTarotEncounter({ id: 'exp-stable', destinationId: destination.id }, destination, weakBoss);
  const weakAgain = __test.buildExplorationTarotEncounter({ id: 'exp-stable', destinationId: destination.id }, destination, weakBoss);
  const strong = __test.buildExplorationTarotEncounter({ id: 'exp-boss', destinationId: destination.id }, destination, strongBoss);

  expect(pixelMonsters).toHaveLength(50);
  expect(pixelMonsters.filter((monster) => monster.isBoss)).toHaveLength(3);
  expect(weak.monsterId).toBe(weakAgain.monsterId);
  expect(weak.isBoss).toBe(false);
  expect(strong.isBoss).toBe(true);
  expect(strong.bossTier).toBe('strong');

  const victory = __test.buildTarotKingdomBossResult(strong, 'victory');
  const defeat = __test.buildTarotKingdomBossResult(strong, 'defeat');
  expect(victory).toMatchObject({ tarotKingdom: true, playerWon: true, monsterId: strong.monsterId });
  expect(defeat).toMatchObject({ tarotKingdom: true, playerWon: false, monsterId: strong.monsterId });
});

test('exploration candidates are grouped by rarity with fixed slot metadata', () => {
  const destinations = Object.values(__test.DESTINATIONS);

  expect(destinations).toHaveLength(18);
  expect(__test.EXPLORATION_DAILY_RARITY_ORDER).toEqual(['low', 'medium', 'high']);
  expect(__test.EXPLORATION_CONSUMABLE_REQUIRED_BY_RARITY).toEqual({ low: 1, medium: 2, high: 3 });
  expect(__test.getDestinationsByRarity('low')).toHaveLength(3);
  expect(__test.getDestinationsByRarity('medium')).toHaveLength(6);
  expect(__test.getDestinationsByRarity('high')).toHaveLength(9);

  for (const destination of destinations) {
    expect(destination.imagePath).toMatch(/^\.\/Sprites\/exploration_destinations\/.+\.png$/);
    expect(destination.rarity).toMatch(/^(low|medium|high)$/);
    expect(destination.rarityLabel).toBeTruthy();
    expect(destination.slot).toBe(__test.EXPLORATION_DESTINATION_RARITIES[destination.rarity].slot);
    expect(destination.slotLabel).toBe(__test.EXPLORATION_DESTINATION_RARITIES[destination.rarity].slotLabel);
    expect(destination.recommendedLevel).toBe(RECOMMENDED_LEVEL_BY_DESTINATION[destination.id]);
    expect(Number.isInteger(destination.recommendedLevel)).toBe(true);
    expect(destination.recommendedLevel).toBeGreaterThan(0);
    expect(__test.getExplorationRequiredConsumableCount(destination)).toBe(
      __test.EXPLORATION_CONSUMABLE_REQUIRED_BY_RARITY[destination.rarity]
    );
    expect(__test.getExplorationRequiredSupplyUnits(destination)).toBe(
      __test.EXPLORATION_CONSUMABLE_REQUIRED_BY_RARITY[destination.rarity]
    );

    expect(__test.publicDestination(destination, 'defender')).toMatchObject({
      id: destination.id,
      recommendedLevel: destination.recommendedLevel,
      requiredSupplyUnits: __test.EXPLORATION_CONSUMABLE_REQUIRED_BY_RARITY[destination.rarity],
      requiredConsumableCount: __test.EXPLORATION_CONSUMABLE_REQUIRED_BY_RARITY[destination.rarity]
    });
  }
});

test('troy menu consumables are extracted and validated for exploration payment', () => {
  expect(__test.getTroyMenuConsumableEffectiveUnits(999)).toBe(1);
  expect(__test.getTroyMenuConsumableEffectiveUnits(1000)).toBe(2);
  expect(__test.getTroyMenuConsumableEffectiveUnits(1999)).toBe(2);
  expect(__test.getTroyMenuConsumableEffectiveUnits(2000)).toBe(3);
  expect(__test.getTroyMenuConsumableEffectiveUnits(18000)).toBe(3);

  const inventoryItems = [
    { Id: 'catalog-drink-a', Amount: 1 },
    { Id: 'catalog-food-b', Amount: 2 },
    { Id: 'catalog-premium-c', Amount: 1 },
    { Id: 'regular-potion', Amount: 9 },
    { Id: 'empty-troy', Amount: 0 }
  ];
  const catalog = {
    'catalog-drink-a': {
      ItemId: 'catalog-drink-a',
      FriendlyId: 'troy_menu_drink_a',
      DisplayName: 'ラムソーダ',
      Category: 'Consumable',
      TroyMenuConsumable: true,
      image_path: './Sprites/drinks/rum.png',
      MenuCategory: 'rum',
      MenuPrice: 900
    },
    'catalog-food-b': {
      ItemId: 'catalog-food-b',
      FriendlyId: 'troy_menu_food_b',
      DisplayName: '港町プレート',
      Category: 'Consumable',
      TroyMenuConsumable: true,
      image_path: './Sprites/food/plate.png',
      MenuCategory: 'food',
      MenuPrice: 1000
    },
    'catalog-premium-c': {
      ItemId: 'catalog-premium-c',
      FriendlyId: 'troy_menu_premium_c',
      DisplayName: '提督のボトル',
      Category: 'Consumable',
      TroyMenuConsumable: true,
      image_path: './Sprites/drinks/premium.png',
      MenuCategory: 'whisky',
      MenuPrice: 2000
    },
    'regular-potion': {
      ItemId: 'regular-potion',
      FriendlyId: 'regular_potion',
      DisplayName: 'まほうのせいすい',
      Category: 'Consumable'
    },
    'empty-troy': {
      ItemId: 'empty-troy',
      FriendlyId: 'troy_menu_empty',
      DisplayName: '空の皿',
      Category: 'Consumable',
      TroyMenuConsumable: true
    }
  };

  const options = __test.buildTroyMenuConsumablePaymentOptions(inventoryItems, catalog);
  expect(options.map((item) => item.itemId).sort()).toEqual(['troy_menu_drink_a', 'troy_menu_food_b', 'troy_menu_premium_c']);
  expect(options.find((item) => item.itemId === 'troy_menu_food_b')).toMatchObject({
    displayName: '港町プレート',
    amount: 2,
    imagePath: './Sprites/food/plate.png',
    menuCategory: 'food',
    menuPrice: 1000,
    effectiveUnits: 2
  });
  expect(options.find((item) => item.itemId === 'troy_menu_premium_c')).toMatchObject({
    effectiveUnits: 3
  });
  expect(__test.isTroyMenuConsumableCatalogItem('troy_menu_direct', {})).toBe(true);
  expect(__test.isTroyMenuConsumableCatalogItem('regular_potion', catalog['regular-potion'])).toBe(false);

  const mediumValidation = __test.validateExplorationConsumablePayment([
    { itemId: 'troy_menu_food_b', quantity: 1 }
  ], options, 2);
  expect(mediumValidation).toMatchObject({
    ok: true,
    consumedConsumables: [
      { itemId: 'troy_menu_food_b', quantity: 1, effectiveUnits: 2, supplyUnits: 2 }
    ]
  });
  expect(mediumValidation.supplyProfile).toMatchObject({
    requiredUnits: 2,
    totalUnits: 2,
    surplusUnits: 0,
    totalMenuPrice: 1000
  });

  expect(__test.validateExplorationConsumablePayment([
    { itemId: 'troy_menu_premium_c', quantity: 1 }
  ], options, 3)).toMatchObject({
    ok: true,
    consumedConsumables: [
      { itemId: 'troy_menu_premium_c', quantity: 1, effectiveUnits: 3, supplyUnits: 3 }
    ],
    supplyProfile: {
      requiredUnits: 3,
      totalUnits: 3,
      comboTags: expect.arrayContaining(['premium_supply'])
    }
  });

  expect(__test.validateExplorationConsumablePayment([
    { itemId: 'troy_menu_drink_a', quantity: 1 }
  ], options, 2).ok).toBe(false);
  expect(__test.validateExplorationConsumablePayment([
    { itemId: 'troy_menu_premium_c', quantity: 1 },
    { itemId: 'troy_menu_food_b', quantity: 2 }
  ], options, 1).ok).toBe(false);

  const comboProfile = __test.validateExplorationConsumablePayment([
    { itemId: 'troy_menu_drink_a', quantity: 1 },
    { itemId: 'troy_menu_food_b', quantity: 1 },
    { itemId: 'troy_menu_premium_c', quantity: 1 }
  ], options, 4).supplyProfile;
  expect(comboProfile).toMatchObject({
    totalUnits: 6,
    surplusUnits: 2,
    categoryCounts: {
      rum: 1,
      food: 1,
      whisky: 1
    }
  });
  expect(comboProfile.comboTags).toEqual(expect.arrayContaining(['food_drink', 'diverse_spirits', 'premium_supply', 'extra_supply']));
});

test('low medium high destinations expose 3 2 1 bosses respectively', () => {
  for (const destination of __test.getDestinationsByRarity('low')) {
    const bosses = __test.getDestinationBosses(destination);
    expect(bosses).toHaveLength(3);
    expect(bosses.every((boss) => !ADVANCED_BOSS_IDS.includes(boss.id))).toBe(true);
  }

  for (const destination of __test.getDestinationsByRarity('medium')) {
    const bosses = __test.getDestinationBosses(destination);
    expect(bosses).toHaveLength(2);
    expect(bosses.every((boss) => !ADVANCED_BOSS_IDS.includes(boss.id))).toBe(true);
  }

  const highBossIds = __test.getDestinationsByRarity('high')
    .flatMap((destination) => __test.getDestinationBosses(destination).map((boss) => boss.id));
  expect(highBossIds.sort()).toEqual([...ADVANCED_BOSS_IDS].sort());
  for (const bossId of ADVANCED_BOSS_IDS) {
    expect(__test.EXPLORATION_BOSSES[bossId]).toMatchObject({
      id: bossId,
      tier: 'strong'
    });
    expect(__test.EXPLORATION_BOSSES[bossId].level).toBeGreaterThanOrEqual(24);
    expect(__test.EXPLORATION_BOSSES[bossId].hp).toBeGreaterThanOrEqual(280);
  }
});

test('player ship major arcana slots follow evolution stage', () => {
  expect(resourceStorage.getPlayerShipMajorArcanaSlotLimit('boat')).toBe(1);
  expect(resourceStorage.getPlayerShipMajorArcanaSlotLimit('explorer')).toBe(2);
  expect(resourceStorage.getPlayerShipMajorArcanaSlotLimit('fighter')).toBe(3);
  expect(resourceStorage.getPlayerShipMajorArcanaSlotLimit('defender')).toBe(3);
  expect(resourceStorage.getPlayerShipMajorArcanaSlotLimit('merchant')).toBe(3);

  expect(resourceStorage.normalizePlayerShipProfile({
    form: 'boat',
    majorArcanaItemIds: ['arcana-4', 'arcana-5']
  }).majorArcanaItemIds).toEqual(['arcana-4']);
  expect(resourceStorage.normalizePlayerShipProfile({
    form: 'explorer',
    majorArcanaItemIds: ['arcana-4', 'arcana-5', 'arcana-6']
  }).majorArcanaItemIds).toEqual(['arcana-4', 'arcana-5']);
});

test('ship major arcana weaken exploration boss before melee battle without reward changes', () => {
  const boss = {
    stats: {
      MaxHP: 100,
      HP: 100,
      CurrentHP: 100,
      ちから: 50,
      みのまもり: 40,
      すばやさ: 30
    },
    equipmentStats: {
      Power: 20,
      Defense: 10,
      Agi: 5,
      StatusRate: 0
    }
  };
  const catalog = {
    'arcana-wand': { Category: 'TarotMajor', DisplayName: '皇帝', ArcanaNumber: 4 },
    'arcana-sword': { Category: 'TarotMajor', DisplayName: '法王', ArcanaNumber: 5 },
    'arcana-cup': { Category: 'TarotMajor', DisplayName: '恋人', ArcanaNumber: 6 }
  };

  const result = __test.applyMajorArcanaPreBattleWeakening(
    boss,
    ['arcana-wand', 'arcana-sword', 'arcana-cup'],
    catalog
  );

  expect(result.logs).toHaveLength(3);
  expect(boss.stats.MaxHP).toBe(91);
  expect(boss.stats.CurrentHP).toBe(91);
  expect(boss.stats.ちから).toBe(46);
  expect(boss.equipmentStats.Power).toBe(18);
  expect(boss.stats.すばやさ).toBe(30);
  expect(boss.equipmentStats.StatusRate).toBe(0);
  expect(__test.resolveRewardCount({ bossAppeared: true, playerWon: true }, 'fighter')).toBe(1);
});

test('daily destinations are deterministic per user and JST day in low medium high order', () => {
  const first = __test.getDailyExplorationDestinations('PF_DAILY_A', 'common', FIXED_NOW_MS);
  const second = __test.getDailyExplorationDestinations('PF_DAILY_A', 'common', FIXED_NOW_MS);
  const nextDay = __test.getDailyExplorationDestinations('PF_DAILY_A', 'common', FIXED_NOW_MS + 24 * 60 * 60 * 1000);
  const otherUser = __test.getDailyExplorationDestinations('PF_DAILY_B', 'common', FIXED_NOW_MS);

  expect(first).toHaveLength(3);
  expect(first.map((destination) => destination.id)).toEqual(second.map((destination) => destination.id));
  expect(first.map((destination) => destination.rarity)).toEqual(['low', 'medium', 'high']);
  expect(first.map((destination) => destination.slot)).toEqual([1, 2, 3]);
  for (const destination of first) {
    expect(destination.recommendedLevel).toBe(RECOMMENDED_LEVEL_BY_DESTINATION[destination.id]);
  }
  expect(nextDay.map((destination) => destination.id)).not.toEqual(first.map((destination) => destination.id));
  expect(otherUser.map((destination) => destination.id)).not.toEqual(first.map((destination) => destination.id));
});

test('daily slots remain visible while ship availability follows slot rules', () => {
  const common = __test.getDailyExplorationDestinations('PF_LOCKS', 'common', FIXED_NOW_MS);
  const explorer = __test.getDailyExplorationDestinations('PF_LOCKS', 'explorer', FIXED_NOW_MS);

  expect(common).toHaveLength(3);
  expect(common.map((destination) => destination.available)).toEqual([true, false, false]);
  expect(explorer.map((destination) => destination.available)).toEqual([true, true, false]);

  for (const shipClass of ['merchant', 'fighter', 'defender']) {
    expect(__test.getDailyExplorationDestinations('PF_LOCKS', shipClass, FIXED_NOW_MS)
      .map((destination) => destination.available)).toEqual([true, true, true]);
  }

  expect(common[1].requirementLabel).toBe('探索船');
  expect(common[2].requirementLabel).toBe('商船 / 戦闘船 / 守備船');
  expect(__test.getAvailableDestinationsForShipClass('common', 'PF_LOCKS', FIXED_NOW_MS)).toHaveLength(3);
});

test('only the first daily slot is free eligible and startable destinations are limited to today', () => {
  const daily = __test.getDailyExplorationDestinations('PF_FREE', 'defender', FIXED_NOW_MS);
  expect(daily.map((destination) => destination.dailyFreeEligible)).toEqual([true, false, false]);

  for (const destination of daily) {
    expect(__test.isDailyExplorationDestinationForPlayer('PF_FREE', destination.id, FIXED_NOW_MS)).toBe(true);
  }

  const nonDailyDestination = Object.keys(__test.DESTINATIONS)
    .find((destinationId) => !daily.some((destination) => destination.id === destinationId));
  expect(__test.isDailyExplorationDestinationForPlayer('PF_FREE', nonDailyDestination, FIXED_NOW_MS)).toBe(false);
});

test('exploration ship roles still change boss odds and reward counts', () => {
  const destination = __test.DESTINATIONS.near_sea;

  expect(__test.selectExplorationBoss(destination, () => 0, 'common').id).toBe('treasure_slime');
  expect(__test.selectExplorationBoss(destination, () => 0.61, 'common').id).toBe('puffer_bomb');
  expect(__test.selectExplorationBoss(destination, () => 0.95, 'common').id).toBe('mimic_chest');
  expect(__test.selectExplorationBoss(destination, () => 0.76, 'fighter').id).toBe('mimic_chest');
  expect(__test.selectExplorationBoss(destination, () => 0.76, 'merchant').id).toBe('puffer_bomb');

  expect(__test.resolveRewardCount({ bossAppeared: true, playerWon: true, bossTier: 'strong' }, 'fighter')).toBe(1);
  expect(__test.resolveRewardCount({ bossAppeared: true, playerWon: true, bossTier: 'weak' }, 'merchant')).toBe(1);
  expect(__test.resolveRewardCount({ bossAppeared: false }, 'common')).toBe(1);
  expect(__test.resolveRewardCount({ bossAppeared: true, playerWon: false, escaped: true, draw: false }, 'common')).toBe(1);
  expect(__test.resolveRewardCount({ bossAppeared: true, playerWon: false, escaped: false, draw: false }, 'defender')).toBe(1);
  expect(__test.resolveRewardCount({ bossAppeared: true, playerWon: false, escaped: false, draw: false }, 'common')).toBe(0);
  expect(__test.resolveRewardCount(
    { bossAppeared: true, playerWon: false, escaped: false, draw: false },
    'common',
    { comboTags: ['food_drink'], effectLabels: [], requiredUnits: 2, totalUnits: 2, surplusUnits: 0 }
  )).toBe(1);
});

test('daily free exploration status resets by JST day key', () => {
  expect(__test.getJstDayKey(Date.UTC(2026, 5, 17, 14, 59, 59))).toBe('2026-06-17');
  expect(__test.getJstDayKey(Date.UTC(2026, 5, 17, 15, 0, 0))).toBe('2026-06-18');

  expect(__test.buildDailyFreeExplorationStatus('2026-06-18', { exists: false })).toMatchObject({
    dayKey: '2026-06-18',
    available: true,
    used: false
  });
  expect(__test.buildDailyFreeExplorationStatus('2026-06-18', {
    exists: true,
    data: () => ({ explorationId: 'exp-test', usedAtMs: 1234 })
  })).toMatchObject({
    dayKey: '2026-06-18',
    available: false,
    used: true,
    usedAtMs: 1234,
    explorationId: 'exp-test'
  });
});

test('stage 1 exploration gacha favors weak equipment slot fillers including accessory', () => {
  const options = __test.getExplorationGachaOptions('near_sea', { stage: 1, shipClass: 'common' });
  const catalog = {
    weak_weapon: catalogItem('weak_weapon', 'Weapon', { Power: 12 }),
    strong_weapon: catalogItem('strong_weapon', 'Weapon', { Power: 21 }),
    weak_armor: catalogItem('weak_armor', 'Armor', { Defense: 12 }),
    strong_armor: catalogItem('strong_armor', 'Armor', { Defense: 13 }),
    weak_shield: catalogItem('weak_shield', 'Shield', { Defense: 12 }),
    strong_shield: catalogItem('strong_shield', 'Shield', { Defense: 19 }),
    weak_accessory: catalogItem('weak_accessory', 'Accessory', { MagicPower: 12 }),
    strong_accessory: catalogItem('strong_accessory', 'Accessory', { MagicPower: 13 }),
    starter_potion: catalogItem('starter_potion', 'Consumable')
  };

  expect(options.categoryWeights).toEqual({
    Weapon: 30,
    Armor: 25,
    Shield: 25,
    Accessory: 15,
    Consumable: 5
  });
  expect(options.allowedCategories).toEqual(['Weapon', 'Armor', 'Shield', 'Accessory', 'Consumable']);
  expect(options.rarityWeights).toMatchObject({ common: 100, rare: 0, epic: 0, legendary: 0 });

  const suppliedOptions = __test.getExplorationGachaOptions('near_sea', { stage: 1, shipClass: 'common' }, {
    comboTags: ['premium_supply', 'extra_supply'],
    effectLabels: [],
    requiredUnits: 1,
    totalUnits: 4,
    surplusUnits: 3
  });
  expect(suppliedOptions.rarityWeights).toMatchObject({ common: 100, rare: 0, epic: 0, legendary: 0 });
  expect(suppliedOptions.categoryWeights.Accessory).toBeGreaterThan(options.categoryWeights.Accessory);

  const itemIds = buildLocalGachaCandidates(catalog, options)
    .map((candidate) => candidate.itemId)
    .sort();
  expect(itemIds).toEqual(['starter_potion', 'weak_accessory', 'weak_armor', 'weak_shield', 'weak_weapon']);
});

test('stage 2 exploration gacha allows accessory up to score 35', () => {
  const options = __test.getExplorationGachaOptions('coral_passage', { stage: 2, shipClass: 'explorer' });
  const catalog = {
    stage2_accessory: catalogItem('stage2_accessory', 'Accessory', { MagicPower: 35 }),
    too_strong_accessory: catalogItem('too_strong_accessory', 'Accessory', { MagicPower: 36 }),
    stage2_weapon: catalogItem('stage2_weapon', 'Weapon', { Power: 45 }),
    too_strong_weapon: catalogItem('too_strong_weapon', 'Weapon', { Power: 46 })
  };

  expect(options.allowedCategories).toContain('Accessory');
  const itemIds = buildLocalGachaCandidates(catalog, options)
    .map((candidate) => candidate.itemId)
    .sort();
  expect(itemIds).toEqual(['stage2_accessory', 'stage2_weapon']);
});

test('supply profile adjusts reward options without breaking stage rarity caps', () => {
  const base = __test.getExplorationGachaOptions('coral_passage', { stage: 2, shipClass: 'explorer' });
  const supplied = __test.getExplorationGachaOptions('coral_passage', { stage: 2, shipClass: 'explorer' }, {
    comboTags: ['food_drink', 'diverse_spirits', 'premium_supply', 'extra_supply'],
    effectLabels: [],
    requiredUnits: 2,
    totalUnits: 5,
    surplusUnits: 3
  });

  expect(supplied.rarityWeights.legendary).toBeGreaterThan(base.rarityWeights.legendary);
  expect(supplied.rarityWeights.epic).toBeGreaterThan(base.rarityWeights.epic);
  expect(supplied.categoryWeights.Weapon).toBeGreaterThan(base.categoryWeights.Weapon);
  expect(supplied.categoryWeights.Accessory).toBeGreaterThan(base.categoryWeights.Accessory);
});
