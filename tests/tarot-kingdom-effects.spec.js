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
    const modulePath = path.join(__dirname, '..', 'public', 'js', 'tarotKingdomEffects.js');
    const source = fs.readFileSync(modulePath, 'utf8');
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
      skillName: '慈潮の女王',
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
    expect(resolved.candidates.map((entry) => entry.skillName)).toEqual(['五歩詰め', '六道駆け']);
  });

  test('same-rank resonance is 50%, exact match takes priority, and each engraving activates once', async () => {
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
    expect(sameRank.steps[0]).toMatchObject({ kind: 'buff', potency: 5 });

    const majorRank = effects.resolveTarotKingdomResonance({ ...base, cards: [{ id: 'major-1', kind: 'major', number: 1 }] });
    expect(majorRank.candidates[0]).toMatchObject({ matchKind: 'major-rank', matchMultiplier: 0.5, sourceAttribute: 'neutral' });

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
    expect(binarySameRank.steps[0]).toMatchObject({ kind: 'register-trigger', activationChance: 0.5 });
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
      'magic-damage', 'elemental-barrage', 'physical-damage', 'heal-lowest', 'heal-self',
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
});
