const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

let effectsModulePromise;

function loadEffectsModule() {
  if (!effectsModulePromise) {
    globalThis.__TAROT_KINGDOM_ARCANA_EFFECTS__ = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'public', 'data', 'tarot-kingdom-arcana-effects.json'),
      'utf8'
    ));
    globalThis.__TAROT_KINGDOM_LEGACY_ARCANA_EFFECTS__ = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'public', 'data', 'tarot-kingdom-arcana-effects-v2.json'),
      'utf8'
    ));
    const v3Path = path.join(__dirname, '..', 'public', 'js', 'tarotKingdomEffectsV3.js');
    const v3Url = `data:text/javascript;base64,${Buffer.from(fs.readFileSync(v3Path, 'utf8')).toString('base64')}`;
    const modulePath = path.join(__dirname, '..', 'public', 'js', 'tarotKingdomEffects.js');
    const source = fs.readFileSync(modulePath, 'utf8')
      .replace("'./tarotKingdomEffectsV3.js?v=20260805-arcana-v3-full2'", `'${v3Url}'`);
    effectsModulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  }
  return effectsModulePromise;
}

function minor(suit, number, id = `${suit}-${number}`) {
  return { id, kind: 'minor', suit, number };
}

function weaponContext(weaponTypes, card, overrides = {}) {
  return {
    actorIndex: 0,
    playType: 'set',
    cards: [card],
    character: {
      combat: { power: 100, intelligence: 100, weaponType: weaponTypes[0], weaponTypes },
      tarotDeck: []
    },
    players: [
      { hp: 80, maxHp: 100 },
      { hp: 30, maxHp: 100 },
      { hp: 30, maxHp: 100 },
      { hp: 0, maxHp: 100 }
    ],
    enemy: { hp: 100, maxHp: 100 },
    effects: { enemy: {}, party: {}, players: [{}, {}, {}, {}] },
    ...overrides
  };
}

test.describe('Tarot Kingdom weapon-suit effects', () => {
  test('all weapon families map to their suit and unarmed never activates', async () => {
    const effects = await loadEffectsModule();
    const cases = [
      [['staff'], minor('Cup', 5), { kind: 'heal', amount: 15, targetIndex: 1 }],
      [['wand'], minor('Wand', 10), { kind: 'magic', amount: 30 }],
      [['sword'], minor('Sword', 10), { kind: 'effective', amount: 37 }],
      [['sword_big'], minor('Sword', 10), { kind: 'effective', amount: 37 }],
      [['dagger'], minor('Sword', 5), { kind: 'status', statusKey: 'poison' }],
      [['polearm'], minor('Cup', 12), { kind: 'multi-hit', hitCount: 4, amount: 36 }],
      [['gun'], minor('Wand', 5), { kind: 'status', statusKey: 'burn' }],
      [['gun_big'], minor('Wand', 6), { kind: 'status', statusKey: 'blind' }],
      [['bow'], minor('Wand', 6), { kind: 'status', statusKey: 'blind' }],
      [['axe'], minor('Pentacle', 10), { kind: 'effective', amount: 45 }],
      [['axe_big'], minor('Pentacle', 10), { kind: 'effective', amount: 45 }],
      [['blunt'], minor('Pentacle', 10), { kind: 'status', statusKey: 'break', potency: 30 }],
      [['shield'], minor('Pentacle', 5), { kind: 'guard', statusKey: 'areaGuard', potency: 30 }],
      [['shield'], minor('Pentacle', 6), { kind: 'guard', statusKey: 'cover', potency: 27 }]
    ];
    for (const [weapons, card, expected] of cases) {
      expect(effects.resolveTarotKingdomWeaponEffect(weaponContext(weapons, card))).toMatchObject(expected);
    }
    expect(effects.resolveTarotKingdomWeaponEffect(weaponContext(['unarmed'], minor('Sword', 10)))).toBeNull();
    expect(effects.resolveTarotKingdomWeaponEffect(weaponContext(['sword'], minor('Cup', 10)))).toBeNull();
  });

  test('odd/even branches, chance bounds, and 1-3 card restriction are stable', async () => {
    const effects = await loadEffectsModule();
    expect(effects.getTarotKingdomStatusChance(1)).toBe(0.25);
    expect(effects.getTarotKingdomStatusChance(14)).toBe(0.9);
    expect(effects.resolveTarotKingdomWeaponEffect(weaponContext(['dagger'], minor('Sword', 2)))).toMatchObject({ statusKey: 'paralysis', chance: 0.3 });
    expect(effects.resolveTarotKingdomWeaponEffect(weaponContext(['gun'], minor('Wand', 1)))).toMatchObject({ statusKey: 'burn', chance: 0.25 });
    expect(effects.resolveTarotKingdomWeaponEffect({
      ...weaponContext(['sword'], minor('Sword', 10)),
      cards: Array.from({ length: 5 }, (_, index) => minor('Sword', index + 1))
    })).toBeNull();
    expect(effects.resolveTarotKingdomWeaponEffect({ ...weaponContext(['sword'], minor('Sword', 10)), playType: 'role' })).toBeNull();
  });

  test('multiple equipped weapons still resolve to one strongest practical effect', async () => {
    const effects = await loadEffectsModule();
    const resolved = effects.resolveTarotKingdomWeaponEffect(weaponContext(
      ['axe', 'shield'],
      minor('Pentacle', 10)
    ));
    expect(resolved).toMatchObject({ weapon: 'axe', kind: 'effective', amount: 45 });
  });

  test('level and weapon power also strengthen weapon-suit effects in current matches', async () => {
    const effects = await loadEffectsModule();
    const base = effects.resolveTarotKingdomWeaponEffect(
      weaponContext(['sword'], minor('Sword', 10))
    );
    const grown = effects.resolveTarotKingdomWeaponEffect(weaponContext(
      ['sword'],
      minor('Sword', 10),
      {
        growthVersion: 1,
        character: {
          level: 51,
          combat: {
            power: 100,
            intelligence: 100,
            equipmentPower: 50,
            weaponType: 'sword',
            weaponTypes: ['sword']
          },
          tarotDeck: []
        }
      }
    ));

    expect(base.amount).toBe(37);
    expect(grown.amount).toBe(70);
  });
});

test.describe('Tarot Kingdom equipped-card resonance', () => {
  test('schema 19 keeps the version 2 resonance table while schema 20 uses version 3', async () => {
    const effects = await loadEffectsModule();
    const character = {
      combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
      tarotDeck: [{ slot: 0, cardId: 'CUP_01', suit: 'Cup', rank: 1, cardLevel: 1 }]
    };
    const base = weaponContext(['unarmed'], minor('Cup', 1), {
      character,
      isLeader: true,
      handBefore: [minor('Cup', 1)],
      handAfter: []
    });
    const legacy = effects.resolveTarotKingdomResonance({ ...base, arcanaLoadoutEffectsVersion: 2 });
    const current = effects.resolveTarotKingdomResonance({ ...base, arcanaLoadoutEffectsVersion: 3 });
    expect(legacy.candidates[0]).toMatchObject({ skillName: 'はじまりの雫', resonanceId: 'cup-1' });
    expect(legacy.steps[0]).toMatchObject({ kind: 'heal-percent', percent: 12 });
    expect(current.candidates[0].skillName).not.toBe('はじまりの雫');
    expect(current.steps[0]).toMatchObject({ effectVersion: 3 });
  });

  test('exact matches work in role submissions and ignore item identity', async () => {
    const effects = await loadEffectsModule();
    const deck = [{
      slot: 0,
      itemId: 'owned-instance-does-not-matter',
      cardId: 'CUP_13',
      suit: 'Cup',
      rank: 13,
      cardLevel: 1
    }];
    const context = weaponContext(['unarmed'], minor('Cup', 13), {
      playType: 'role',
      character: { combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] }, tarotDeck: deck }
    });
    expect(effects.resolveTarotKingdomResonance(context)).toMatchObject({
      candidates: [{
      slot: 0,
      skillName: '黄泉返りの霊水',
      suit: 'Cup',
      rank: 13,
      matchKind: 'exact',
      matchMultiplier: 1
      }]
    });
    expect(effects.resolveTarotKingdomResonance({ ...context, cards: [minor('Cup', 12)] })).toBeNull();
    expect(effects.resolveTarotKingdomResonance({ ...context, cards: [{ kind: 'major', number: 15 }] })).toBeNull();
  });

  test('every exact match resolves in equipped-slot order', async () => {
    const effects = await loadEffectsModule();
    const card = minor('Sword', 5);
    const strongerCard = minor('Sword', 6);
    const character = {
      combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
      tarotDeck: [
        { slot: 0, cardId: 'SWORD_05', suit: 'Sword', rank: 5, cardLevel: 1 },
        { slot: 1, cardId: 'SWORD_06', suit: 'Sword', rank: 6, cardLevel: 1 }
      ]
    };
    const resolved = effects.resolveTarotKingdomResonance({
      ...weaponContext(['unarmed'], card),
      cards: [card, strongerCard],
      character,
      enemy: { hp: 25, maxHp: 100 }
    });
    expect(resolved.candidates).toHaveLength(2);
    expect(resolved.candidates.map((entry) => entry.slot)).toEqual([0, 1]);
    expect(resolved.candidates.map((entry) => entry.skillName)).toEqual(['盾割り', '六道連環']);
  });

  test('minor same-rank resonance is 50%, major cards do not resonate, and exact match takes priority', async () => {
    const effects = await loadEffectsModule();
    const character = {
      combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
      tarotDeck: [{ slot: 0, cardId: 'PENTACLE_01', suit: 'Pentacle', rank: 1, cardLevel: 1 }]
    };
    const base = weaponContext(['unarmed'], minor('Sword', 1), {
      character,
      handBefore: [minor('Sword', 1)],
      handAfter: []
    });
    const sameRank = effects.resolveTarotKingdomResonance(base);
    expect(sameRank.candidates).toHaveLength(1);
    expect(sameRank.candidates[0]).toMatchObject({ matchKind: 'same-rank', matchMultiplier: 0.5 });
    expect(sameRank.steps[0]).toMatchObject({ kind: 'buff', potency: 2, resolvedR: 2 });

    const majorRank = effects.resolveTarotKingdomResonance({ ...base, cards: [{ id: 'major-1', kind: 'major', number: 1 }] });
    expect(majorRank).toBeNull();

    const exactWins = effects.resolveTarotKingdomResonance({
      ...base,
      cards: [minor('Sword', 1), minor('Pentacle', 1), minor('Pentacle', 1, 'duplicate')]
    });
    expect(exactWins.candidates).toHaveLength(1);
    expect(exactWins.candidates[0]).toMatchObject({ matchKind: 'exact', matchMultiplier: 1 });

    const binarySameRank = effects.resolveTarotKingdomResonance({
      ...base,
      cards: [{ id: 'major-13', kind: 'major', number: 13 }],
      character: {
        ...character,
        tarotDeck: [{ slot: 0, cardId: 'SWORD_13', suit: 'Sword', rank: 13, cardLevel: 1 }]
      }
    });
    expect(binarySameRank).toBeNull();
  });

  test('new conditions read field, hand, reverse, leader, and control events', async () => {
    const effects = await loadEffectsModule();
    expect(effects.isTarotKingdomResonanceConditionMet(
      { kind: 'field-rank-gap-min', gap: 7 },
      { cards: [minor('Sword', 14)], fieldCard: minor('Cup', 7) }
    )).toBe(true);
    expect(effects.isTarotKingdomResonanceConditionMet(
      { kind: 'reverse-overtake' },
      { cards: [minor('Sword', 9)], fieldCard: minor('Cup', 10), reverseBefore: true }
    )).toBe(true);
    expect(effects.isTarotKingdomResonanceConditionMet(
      { kind: 'leader-after-optional-draw' },
      { cards: [minor('Wand', 6)], isLeader: true, optionalDrawUsed: true }
    )).toBe(true);
    expect(effects.isTarotKingdomResonanceConditionMet(
      { kind: 'causes-lock' },
      { playType: 'set', cards: [minor('Wand', 14)], fieldCard: minor('Wand', 10) }
    )).toBe(true);
    expect(effects.isTarotKingdomResonanceConditionMet(
      { kind: 'enemy-guarded' },
      { effects: { enemy: { defenseUp: { potency: 25 } } } }
    )).toBe(true);
    expect(effects.isTarotKingdomResonanceConditionMet(
      { kind: 'previous-pass-ko' },
      { previousPassKoIndex: null }
    )).toBe(false);
  });

  test('all 56 dedicated definitions are complete without legacy effect codes', async () => {
    const effects = await loadEffectsModule();
    const minorDeck = globalThis.__TAROT_KINGDOM_ARCANA_EFFECTS__.minor;
    expect(minorDeck).toHaveLength(56);
    expect(effects.getUnsupportedTarotKingdomEffectCodes(minorDeck)).toEqual([]);
    const supportedKinds = new Set([
      'r-effect', 'magic-damage', 'elemental-barrage', 'physical-damage', 'heal-lowest', 'heal-self',
      'heal-field-owner', 'heal-previous-player', 'shield-self', 'shield-lowest-other', 'shield-party',
      'cleanse-field-owner', 'cleanse-party', 'revive-previous-passer', 'enemy-status', 'party-status',
      'player-status-self', 'cover-lowest', 'dispel-enemy-guard', 'hand-suit-damage', 'pile-barrage',
      'dual-history-damage', 'base-attack-bonus', 'submitted-count-damage', 'hand-count-damage',
      'court-card-shield', 'shield-scaled-damage', 'delayed-damage', 'delayed-buff', 'field-aura'
    ]);
    minorDeck.forEach((entry) => {
      expect(entry.condition?.kind, `${entry.id} condition`).toBeTruthy();
      expect(entry.steps.length, entry.id).toBeGreaterThan(0);
      entry.steps.forEach((step) => expect(supportedKinds.has(step.kind), `${entry.id}:${step.kind}`).toBe(true));
    });
  });

  test('all 56 definitions resolve R 0/5/10 and exact or half resonance deterministically', async () => {
    const effects = await loadEffectsModule();
    const definitions = globalThis.__TAROT_KINGDOM_ARCANA_EFFECTS__.minor;
    const alternateSuit = { Wand: 'Cup', Cup: 'Sword', Sword: 'Pentacle', Pentacle: 'Wand' };
    const basePlayers = [
      { hp: 80, maxHp: 100 },
      { hp: 35, maxHp: 100 },
      { hp: 60, maxHp: 100 },
      { hp: 0, maxHp: 100 }
    ];

    for (const definition of definitions) {
      for (const resolvedR of [0, 5, 10]) {
        const text = effects.getTarotKingdomResolvedEffectText(definition, {
          actorIndex: 0,
          resolvedR,
          players: basePlayers,
          enemy: { hp: 70, maxHp: 100 },
          effects: { enemy: { poison: { remainingTurns: 1 } }, party: {}, players: [{}, {}, {}, {}] },
          character: { combat: { power: 100, intelligence: 100 } },
          fieldCard: minor('Cup', Math.max(1, definition.rank - 1)),
          fieldOwnerIndex: 1,
          koPlayerIndex: 3,
          resonanceMatch: { multiplier: 1, submittedCard: minor(definition.suit, definition.rank) }
        });
        expect(text, `${definition.id} R${resolvedR}`).toMatch(new RegExp(`^(R${resolvedR}：|今回は効果なし)`));
      }

      const deckEntry = {
        slot: 0,
        suit: definition.suit,
        rank: definition.rank,
        cardLevel: 1,
        resonanceId: definition.id
      };
      const context = {
        ...weaponContext(['unarmed'], minor(definition.suit, definition.rank)),
        resolvedR: 5,
        fieldCard: minor('Cup', Math.max(1, definition.rank - 1)),
        fieldOwnerIndex: 1,
        koPlayerIndex: 3,
        character: {
          combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
          tarotDeck: [deckEntry]
        }
      };
      const exact = effects.resolveTarotKingdomResonance(context);
      expect(exact?.candidates?.[0], `${definition.id} exact`).toMatchObject({
        resonanceId: definition.id,
        matchKind: 'exact',
        matchMultiplier: 1
      });
      const half = effects.resolveTarotKingdomResonance({
        ...context,
        cards: [minor(alternateSuit[definition.suit], definition.rank)]
      });
      expect(half?.candidates?.[0], `${definition.id} half`).toMatchObject({
        resonanceId: definition.id,
        matchKind: 'same-rank',
        matchMultiplier: 0.5
      });
      [...exact.candidates[0].steps, ...half.candidates[0].steps].forEach((step) => {
        expect(step.resolvedR, `${definition.id} shared R`).toBe(5);
        ['amount', 'percent', 'potency', 'chance'].forEach((key) => {
          if (step[key] != null) expect(Number.isFinite(Number(step[key])), `${definition.id} ${key}`).toBe(true);
        });
      });
    }
  });
});
