const { test, expect } = require('@playwright/test');
const { __test } = require('../server/exploration');

test('exploration destinations have three fixed bosses ordered from weak to strong', () => {
  const destinations = Object.values(__test.DESTINATIONS);
  const spriteIds = new Set();

  expect(destinations).toHaveLength(6);

  for (const destination of destinations) {
    expect(destination.imagePath).toMatch(/^\.\/Sprites\/exploration_destinations\/.+\.png$/);
    const bosses = __test.getDestinationBosses(destination);
    expect(bosses).toHaveLength(3);
    expect(bosses.map((boss) => boss.tier)).toEqual(['weak', 'medium', 'strong']);

    for (const boss of bosses) {
      expect(__test.EXPLORATION_BOSSES[boss.id]).toBeTruthy();
      expect(boss.spriteId).toBeTruthy();
      spriteIds.add(boss.spriteId);
    }
  }

  expect(spriteIds.size).toBe(18);
});

test('exploration boss roll uses weak medium strong weighted order', () => {
  const destination = __test.DESTINATIONS.near_sea;

  expect(__test.selectExplorationBoss(destination, () => 0).id).toBe('treasure_slime');
  expect(__test.selectExplorationBoss(destination, () => 0.61).id).toBe('puffer_bomb');
  expect(__test.selectExplorationBoss(destination, () => 0.95).id).toBe('mimic_chest');
});

test('exploration destinations expand by ship evolution while keeping lower seas', () => {
  expect(__test.getAvailableDestinationsForShipClass('common').map((destination) => destination.id))
    .toEqual(['near_sea']);
  expect(__test.getAvailableDestinationsForShipClass('explorer').map((destination) => destination.id))
    .toEqual(['near_sea', 'coral_passage', 'old_lighthouse']);
  expect(__test.getAvailableDestinationsForShipClass('merchant').map((destination) => destination.id))
    .toEqual(['near_sea', 'coral_passage', 'old_lighthouse', 'sunken_trader']);
  expect(__test.getAvailableDestinationsForShipClass('fighter').map((destination) => destination.id))
    .toEqual(['near_sea', 'coral_passage', 'old_lighthouse', 'pirate_cove']);
  expect(__test.getAvailableDestinationsForShipClass('defender').map((destination) => destination.id))
    .toEqual(['near_sea', 'coral_passage', 'old_lighthouse', 'deep_maelstrom']);

  expect(__test.getExplorationShipAccessClasses('fighter')).toEqual(['common', 'explorer', 'fighter']);
  expect(__test.canShipClassExploreDestination('fighter', __test.DESTINATIONS.near_sea)).toBe(true);
  expect(__test.canShipClassExploreDestination('fighter', __test.DESTINATIONS.pirate_cove)).toBe(true);
  expect(__test.canShipClassExploreDestination('common', __test.DESTINATIONS.pirate_cove)).toBe(false);
});

test('exploration destination list marks locked seas by current ship class', () => {
  const commonList = __test.getAllDestinationsForShipClass('common');
  expect(commonList.map((destination) => destination.id)).toEqual([
    'near_sea',
    'coral_passage',
    'old_lighthouse',
    'sunken_trader',
    'pirate_cove',
    'deep_maelstrom'
  ]);
  expect(commonList.find((destination) => destination.id === 'near_sea')).toMatchObject({
    available: true,
    requirementLabel: '初期ボート / 探索船'
  });
  expect(commonList.find((destination) => destination.id === 'pirate_cove')).toMatchObject({
    available: false,
    requirementLabel: '戦闘船'
  });

  const fighterList = __test.getAllDestinationsForShipClass('fighter');
  expect(fighterList.find((destination) => destination.id === 'pirate_cove')?.available).toBe(true);
  expect(__test.getExplorationShipClassLabel('merchant')).toBe('商船');
});

test('exploration ship roles change boss odds and reward counts', () => {
  const destination = __test.DESTINATIONS.near_sea;

  expect(__test.selectExplorationBoss(destination, () => 0.76, 'fighter').id).toBe('mimic_chest');
  expect(__test.selectExplorationBoss(destination, () => 0.76, 'merchant').id).toBe('puffer_bomb');

  expect(__test.resolveRewardCount({ bossAppeared: true, playerWon: true, bossTier: 'strong' }, 'fighter')).toBe(4);
  expect(__test.resolveRewardCount({ bossAppeared: true, playerWon: true, bossTier: 'weak' }, 'merchant')).toBe(3);
  expect(__test.resolveRewardCount({ bossAppeared: true, playerWon: false, escaped: false, draw: false }, 'defender')).toBe(1);
  expect(__test.resolveRewardCount({ bossAppeared: true, playerWon: false, escaped: false, draw: false }, 'common')).toBe(0);
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

test('daily free exploration only applies to low-level sea areas', () => {
  const freeDestinationIds = Object.values(__test.DESTINATIONS)
    .filter((destination) => __test.isDailyFreeExplorationDestination(destination))
    .map((destination) => destination.id);

  expect(freeDestinationIds).toEqual(['near_sea']);
  expect(__test.publicDestination(__test.DESTINATIONS.near_sea, 'explorer')).toMatchObject({
    id: 'near_sea',
    imagePath: './Sprites/exploration_destinations/near_sea_drift_crate.png',
    dailyFreeEligible: true
  });
  expect(__test.publicDestination(__test.DESTINATIONS.coral_passage, 'explorer')).toMatchObject({
    id: 'coral_passage',
    dailyFreeEligible: false
  });
});
