const { test, expect } = require('@playwright/test');
const {
  calculateStatAllocationState,
  normalizeStatAllocationDeltas,
  getStatAllocationDeltaTotal,
  applyStatAllocationDeltas
} = require('../server/statAllocation');

test('stat allocation grants five points per level after level one', () => {
  const state = calculateStatAllocationState({
    Level: 4,
    ちから: 2,
    みのまもり: 5,
    すばやさ: 10,
    かしこさ: 15,
    たいりょく: 5,
    StatPointSpent_Str: 3,
    StatPointSpent_Def: 2,
    StatPointSpent_Vit: 1
  });

  expect(state.totalEarned).toBe(15);
  expect(state.totalAllocated).toBe(6);
  expect(state.availablePoints).toBe(9);
  expect(state.hpPerVitality).toBe(4);
  expect(state.stats.str).toMatchObject({ value: 2, allocated: 3 });
  expect(state.stats.vit).toMatchObject({ value: 5, allocated: 1 });
});

test('stat allocation normalizes requested deltas and applies visible stats plus spent counters', () => {
  const deltas = normalizeStatAllocationDeltas({
    str: 2,
    def: '1',
    agi: -4,
    unknown: 99
  });
  expect(deltas).toEqual({ str: 2, def: 1 });
  expect(getStatAllocationDeltaTotal(deltas)).toBe(3);

  const updated = applyStatAllocationDeltas({
    Level: 3,
    ちから: 4,
    みのまもり: 6,
    StatPointSpent_Str: 1
  }, deltas);

  expect(updated.stats).toMatchObject({
    ちから: 6,
    みのまもり: 7,
    StatPointSpent_Str: 3,
    StatPointSpent_Def: 1
  });
  expect(updated.statistics).toEqual([
    { StatisticName: 'ちから', Value: 6 },
    { StatisticName: 'StatPointSpent_Str', Value: 3 },
    { StatisticName: 'みのまもり', Value: 7 },
    { StatisticName: 'StatPointSpent_Def', Value: 1 }
  ]);
});

test('allocating vitality raises max HP and current HP by four per point', () => {
  const deltas = normalizeStatAllocationDeltas({ vit: 2 });
  const updated = applyStatAllocationDeltas({
    Level: 3,
    HP: 70,
    MaxHP: 88,
    たいりょく: 5
  }, deltas);

  expect(updated.stats).toMatchObject({
    HP: 78,
    MaxHP: 96,
    たいりょく: 7,
    StatPointSpent_Vit: 2
  });
  expect(updated.statistics).toEqual([
    { StatisticName: 'たいりょく', Value: 7 },
    { StatisticName: 'StatPointSpent_Vit', Value: 2 },
    { StatisticName: 'MaxHP', Value: 96 },
    { StatisticName: 'HP', Value: 78 }
  ]);
});
