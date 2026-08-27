const { test, expect } = require('@playwright/test');
const { __test: tarotFortune } = require('../server/tarotFortune');

const DIRECTIONS = ['upright', 'reversed'];

function getAllDedicatedLines() {
  const entries = [];
  for (let number = 0; number <= 21; number += 1) {
    for (const direction of DIRECTIONS) {
      entries.push({
        id: `major-${number}-${direction}`,
        line: tarotFortune.MAJOR_DAILY_STRIKE_LINES[number]?.[direction]
      });
    }
  }
  for (const suit of ['Wand', 'Sword', 'Cup', 'Pentacle']) {
    for (let number = 1; number <= 14; number += 1) {
      for (const direction of DIRECTIONS) {
        entries.push({
          id: `${suit}-${number}-${direction}`,
          line: tarotFortune.MINOR_DAILY_STRIKE_LINES[suit]?.[number]?.[direction]
        });
      }
    }
  }
  return entries;
}

test('daily tarot has a dedicated concise reading for all 156 outcomes', () => {
  const entries = getAllDedicatedLines();
  expect(entries).toHaveLength(156);

  for (const entry of entries) {
    expect(entry.line, `${entry.id} is missing`).toBeTruthy();
    expect(entry.line, `${entry.id} contains a newline`).not.toContain('\n');
    expect(entry.line.length, `${entry.id} is too short`).toBeGreaterThanOrEqual(35);
    expect(entry.line.length, `${entry.id} is too long`).toBeLessThanOrEqual(100);
    expect((entry.line.match(/[。！？!?]/g) || []).length, `${entry.id} lacks an omen and outcome`).toBeGreaterThanOrEqual(2);
    expect(entry.line, `${entry.id} leaked a structured heading`).not.toMatch(/^(結論|現在地|次に取るべき一手|禁じ手|船長からの一言|一言判定):/);
  }
});

test('daily tarot renders only wind and the dedicated line for every card', () => {
  const deck = tarotFortune.buildTarotDeck();
  expect(deck).toHaveLength(78);

  for (const card of deck) {
    for (const orientation of DIRECTIONS) {
      const strikeLine = tarotFortune.getFortuneStrikeText(card, orientation);
      const weather = tarotFortune.getFortuneWeather(card, orientation);
      const displayText = tarotFortune.getFortuneText(card, orientation);

      expect(displayText).toBe(`風向き: ${weather.windLabel}\n\n${strikeLine}`);
      expect(displayText).not.toContain('一言判定:');
      expect(displayText).not.toContain('船長からの一言:');
    }
  }
});

test('recovery reversals use recovering wind instead of severe weather', () => {
  const recoveryCards = [
    { suit: 'Sword', number: 3 },
    { suit: 'Sword', number: 5 },
    { suit: 'Sword', number: 8 },
    { suit: 'Sword', number: 9 },
    { suit: 'Sword', number: 10 },
    { suit: 'Cup', number: 4 },
    { suit: 'Cup', number: 5 },
    { suit: 'Cup', number: 7 },
    { suit: 'Pentacle', number: 5 },
    { suit: 'Wand', number: 10 }
  ];

  for (const card of recoveryCards) {
    const weather = tarotFortune.getFortuneWeather({ ...card, isArcana: false }, 'reversed');
    expect(weather.level, `${card.suit}-${card.number}`).toBeGreaterThanOrEqual(6);
  }
});

test('daily tarot grants a card upright and completes a reversed card from two fragments', () => {
  const card = tarotFortune.buildTarotDeck()[0];
  const uprightReward = tarotFortune.buildFortuneReward(card, 'upright');
  const firstReversedReward = tarotFortune.buildFortuneReward(card, 'reversed', 0);
  const secondReversedReward = tarotFortune.buildFortuneReward(card, 'reversed', 1);

  expect(uprightReward).toMatchObject({
    rewardType: 'card',
    rewardItemAmount: 1,
    rewardCardGranted: true,
    rewardFragmentAmount: 0
  });
  expect(firstReversedReward).toMatchObject({
    rewardType: 'fragment',
    rewardItemAmount: 0,
    rewardCardGranted: false,
    rewardFragmentAmount: 1,
    rewardFragmentCount: 1,
    rewardFragmentRequired: 2,
    rewardFragmentCompleted: false
  });
  expect(secondReversedReward).toMatchObject({
    rewardType: 'card',
    rewardItemAmount: 1,
    rewardCardGranted: true,
    rewardFragmentAmount: 1,
    rewardFragmentCount: 0,
    rewardFragmentRequired: 2,
    rewardFragmentCompleted: true
  });
});

test('daily tarot fragment storage keeps only one pending fragment per card', () => {
  const normalized = tarotFortune.normalizeFortuneFragmentRecord({
    counts: {
      'arcana-18': 8,
      'minor-cup-4': 1,
      empty: 0
    }
  });

  expect(normalized).toEqual({
    version: 1,
    counts: {
      'arcana-18': 1,
      'minor-cup-4': 1
    }
  });
});
