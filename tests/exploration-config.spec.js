const { test, expect } = require('@playwright/test');
const { __test } = require('../server/exploration');

test('exploration destinations have three fixed bosses ordered from weak to strong', () => {
  const destinations = Object.values(__test.DESTINATIONS);
  const spriteIds = new Set();

  expect(destinations).toHaveLength(6);

  for (const destination of destinations) {
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

test('exploration destinations branch by ship role', () => {
  expect(__test.getAvailableDestinationsForShipClass('common').map((destination) => destination.id))
    .toEqual(['near_sea']);
  expect(__test.getAvailableDestinationsForShipClass('explorer').map((destination) => destination.id))
    .toEqual(['near_sea', 'coral_passage', 'old_lighthouse']);
  expect(__test.getAvailableDestinationsForShipClass('merchant').map((destination) => destination.id))
    .toEqual(['coral_passage', 'sunken_trader']);
  expect(__test.getAvailableDestinationsForShipClass('fighter').map((destination) => destination.id))
    .toEqual(['old_lighthouse', 'pirate_cove']);
  expect(__test.getAvailableDestinationsForShipClass('defender').map((destination) => destination.id))
    .toEqual(['deep_maelstrom']);
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
