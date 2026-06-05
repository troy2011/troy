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
