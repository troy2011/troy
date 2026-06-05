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
    StatPointSpent_Str: 3,
    StatPointSpent_Def: 2
  });

  expect(state.totalEarned).toBe(15);
  expect(state.totalAllocated).toBe(5);
  expect(state.availablePoints).toBe(10);
  expect(state.stats.str).toMatchObject({ value: 2, allocated: 3 });
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
