const { test, expect } = require('@playwright/test');
const {
  TAROT_GUARDIAN_DATA_KEY,
  buildTarotKingdomGuardian,
  buildTarotKingdomMinorLoadout,
  clampCardLevel,
  getArcanaEffectsCatalog,
  parseTarotGuardian,
  serializeTarotGuardian
} = require('../server/tarotKingdomArcanaLoadout');

test('dedicated arcana catalog contains 56 unique minor resonances and 22 guardians', () => {
  const catalog = getArcanaEffectsCatalog();
  expect(catalog.version).toBe(1);
  expect(catalog.minor).toHaveLength(56);
  expect(catalog.guardian).toHaveLength(22);
  expect(new Set(catalog.minor.map((entry) => entry.id)).size).toBe(56);
  expect(new Set(catalog.minor.map((entry) => entry.name)).size).toBe(56);
  expect(new Set(catalog.guardian.map((entry) => entry.passiveId)).size).toBe(22);
  expect(new Set(catalog.guardian.map((entry) => entry.awakeningId)).size).toBe(22);
  expect(JSON.stringify(catalog)).not.toContain('effectCodes');
});

test('minor and guardian snapshots use canonical IDs and clamp their own level ranges', () => {
  const catalog = {
    minor_cup_1: {
      Category: 'TarotMinor',
      ArcanaSuit: 'Cup',
      ArcanaRank: 'A'
    },
    minor_sword_14: {
      Category: 'TarotMinor',
      ArcanaSuit: 'Sword',
      ArcanaRank: 'K'
    },
    tarot_major_21: {
      Category: 'TarotMajor',
      ArcanaNumber: '21'
    }
  };
  const minor = buildTarotKingdomMinorLoadout(
    ['minor_cup_1', 'minor_sword_14'],
    catalog,
    {
      minor_cup_1: { level: 1 },
      minor_sword_14: { level: 99 }
    }
  );
  expect(minor).toMatchObject([
    { slot: 0, suit: 'Cup', rank: 1, cardLevel: 1, resonanceId: 'cup-1' },
    { slot: 1, suit: 'Sword', rank: 14, cardLevel: 15, resonanceId: 'sword-14' }
  ]);

  expect(buildTarotKingdomGuardian('tarot_major_21', catalog, {
    tarot_major_21: { level: 99 }
  })).toMatchObject({
    itemId: 'tarot_major_21',
    number: 21,
    cardLevel: 25,
    passiveId: 'world-ring',
    awakeningId: 'world-awaken'
  });
  expect(clampCardLevel(15, false)).toBe(15);
  expect(clampCardLevel(25, true)).toBe(25);
});

test('guardian storage is independent and never reads an old ship loadout', () => {
  expect(TAROT_GUARDIAN_DATA_KEY).toBe('TarotGuardianArcana');
  expect(parseTarotGuardian(null)).toEqual({ version: 1, itemId: null });
  expect(parseTarotGuardian(JSON.stringify({
    version: 1,
    itemId: 'tarot_major_08',
    oldShipMajorArcana: ['tarot_major_21']
  }))).toEqual({
    version: 1,
    itemId: 'tarot_major_08'
  });
  expect(JSON.parse(serializeTarotGuardian(null))).toEqual({ version: 1, itemId: null });
});

test('card levels strengthen numeric values by two percent without changing fixed fields', () => {
  const scale = (level) => 1 + ((level - 1) * 0.02);
  expect(scale(1)).toBe(1);
  expect(scale(15)).toBeCloseTo(1.28);
  expect(scale(25)).toBeCloseTo(1.48);

  const burn = getArcanaEffectsCatalog().minor.find((entry) => entry.id === 'wand-5');
  expect(burn.steps.find((step) => step.kind === 'enemy-status')).toMatchObject({
    chance: 0.7,
    charges: 2
  });
  const empress = getArcanaEffectsCatalog().guardian.find((entry) => entry.number === 3);
  expect(empress.awakening).toContain('4ターン');
});
