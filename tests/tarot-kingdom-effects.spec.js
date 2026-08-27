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
    globalThis.__TAROT_KINGDOM_ARCANA_AP_EFFECTS__ = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'public', 'data', 'tarot-kingdom-arcana-ap-effects.json'),
      'utf8'
    ));
    const statusesPath = path.join(__dirname, '..', 'public', 'js', 'tarotKingdomStatuses.js');
    const statusesUrl = `data:text/javascript;base64,${Buffer.from(fs.readFileSync(statusesPath, 'utf8')).toString('base64')}`;
    const v3Path = path.join(__dirname, '..', 'public', 'js', 'tarotKingdomEffectsV3.js');
    const v3Source = fs.readFileSync(v3Path, 'utf8')
      .replace(/'\.\/tarotKingdomStatuses\.js\?v=[^']+'/, `'${statusesUrl}'`);
    const v3Url = `data:text/javascript;base64,${Buffer.from(v3Source).toString('base64')}`;
    const modulePath = path.join(__dirname, '..', 'public', 'js', 'tarotKingdomEffects.js');
    const source = fs.readFileSync(modulePath, 'utf8')
      .replace(/'\.\/tarotKingdomEffectsV3\.js\?v=[^']+'/, `'${v3Url}'`)
      .replace(/'\.\/tarotKingdomStatuses\.js\?v=[^']+'/, `'${statusesUrl}'`);
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

test('card detail text resolves level ranges to the current card value', async () => {
  const effects = await loadEffectsModule();
  const minor = (suit, rank) => effects.getTarotKingdomMinorApDefinition(suit, rank);

  expect(effects.getTarotKingdomCurrentLevelEffectText(minor('Cup', 5), 8))
    .toBe('生存している味方全員から、状態異常か能力低下を1つずつ解除し、解除できた味方へ10％のシールドを付与する。');
  expect(effects.getTarotKingdomCurrentLevelEffectText(minor('Pentacle', 6), 8))
    .toBe('敵を直接ダメージを受けるまで睡眠状態にし、次に受ける直接攻撃のダメージを18％増加させる。');
  expect(effects.getTarotKingdomCurrentLevelEffectText(minor('Pentacle', 7), 15))
    .toBe('敵の次の戦闘攻撃を1回止め、攻撃力を25％低下させる。効果は2ターン続く。');
  expect(effects.getTarotKingdomCurrentLevelEffectText(minor('Pentacle', 13), 1))
    .toBe('敵を次に場が流れるまで石化させ、石化中に次に受ける直接攻撃のダメージを10％増加させる。');
  expect(effects.getTarotKingdomCurrentLevelEffectText(minor('Pentacle', 14), 8))
    .toBe('生存している味方全員へ直接攻撃を1回無効化する分身と、10％のシールドを付与する。');
  expect(effects.getTarotKingdomCurrentLevelEffectText(minor('Wand', 6), 8))
    .toBe('APを4回復する。');
  expect(effects.getTarotKingdomCurrentLevelEffectText(minor('Wand', 10), 8))
    .toBe('APを5回復し、自分は最大HP8％の反動ダメージを受ける。HP1で止まる。');
});

test.describe('Tarot Kingdom legacy weapon-suit effect compatibility', () => {
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

  test('a call reuses its exact field card and counts all five role cards', async () => {
    const effects = await loadEffectsModule();
    const fieldCard = minor('Sword', 6, 'call-field');
    const roleCards = [
      fieldCard,
      minor('Cup', 7, 'call-hand-1'),
      minor('Wand', 8, 'call-hand-2'),
      minor('Pentacle', 9, 'call-hand-3'),
      minor('Cup', 10, 'call-hand-4')
    ];
    const resolved = effects.resolveTarotKingdomResonance({
      ...weaponContext(['unarmed'], roleCards[1]),
      arcanaLoadoutEffectsVersion: 2,
      playType: 'role',
      isCall: true,
      cards: roleCards,
      character: {
        combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
        tarotDeck: [{ slot: 0, cardId: 'SWORD_06', suit: 'Sword', rank: 6, cardLevel: 1 }]
      }
    });
    expect(resolved?.candidates?.[0]).toMatchObject({
      submittedCardId: fieldCard.id,
      matchKind: 'exact',
      matchMultiplier: 1
    });
    expect(resolved?.steps?.[0]).toMatchObject({ hitCount: 5 });
  });

  test('resonance requires the same minor suit and rank', async () => {
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
    expect(effects.resolveTarotKingdomResonance(base)).toBeNull();
    expect(effects.resolveTarotKingdomResonance({
      ...base,
      cards: [{ id: 'major-1', kind: 'major', number: 1 }]
    })).toBeNull();

    const exact = effects.resolveTarotKingdomResonance({
      ...base,
      cards: [minor('Sword', 1), minor('Pentacle', 1), minor('Pentacle', 1, 'duplicate')]
    });
    expect(exact.candidates).toHaveLength(1);
    expect(exact.candidates[0]).toMatchObject({ matchKind: 'exact', matchMultiplier: 1 });
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
      { kind: 'causes-lock' },
      { playType: 'set', cards: [minor('Wand', 13)], fieldCard: minor('Wand', 10) }
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
    globalThis.__TAROT_KINGDOM_ARCANA_EFFECTS__.guardian.forEach((definition) => {
      expect(definition.passive, `guardian ${definition.number} passive`).not.toContain('R');
    });
  });

  test('all 56 definitions resolve R 0/5/10 only for exact resonance', async () => {
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
        expect(text, `${definition.id} value ${resolvedR}`).not.toContain('R');
        expect(text.trim().length, `${definition.id} value ${resolvedR}`).toBeGreaterThan(0);
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
      const otherSuit = effects.resolveTarotKingdomResonance({
        ...context,
        cards: [minor(alternateSuit[definition.suit], definition.rank)]
      });
      expect(otherSuit, `${definition.id} other suit`).toBeNull();
      expect(effects.resolveTarotKingdomResonance({
        ...context,
        cards: [{ id: `major-${definition.rank}`, kind: 'major', number: definition.rank }]
      }), `${definition.id} major`).toBeNull();
      exact.candidates[0].steps.forEach((step) => {
        expect(step.resolvedR, `${definition.id} shared R`).toBe(5);
        ['amount', 'percent', 'potency', 'chance'].forEach((key) => {
          if (step[key] != null) expect(Number.isFinite(Number(step[key])), `${definition.id} ${key}`).toBe(true);
        });
      });
      expect(effects.getTarotKingdomFriendlyEffectText(definition), `${definition.id} friendly effect`)
        .not.toContain('R');
      expect(effects.getTarotKingdomResonanceGrowthText(definition.rank), `${definition.id} growth text`)
        .toMatch(/効果上昇|効果を決定/);
    }
  });

  test('each resonant rank uses its own resolved value in the same action', async () => {
    const effects = await loadEffectsModule();
    const cupAce = minor('Cup', 1, 'per-rank-cup-ace');
    const wandTwo = minor('Wand', 2, 'per-rank-wand-two');
    const resolved = effects.resolveTarotKingdomResonance({
      ...weaponContext(['unarmed'], cupAce),
      arcanaLoadoutEffectsVersion: 3,
      cards: [cupAce, wandTwo],
      resolvedRByRank: { 1: 8, 2: 0 },
      character: {
        combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
        tarotDeck: [
          { slot: 0, cardId: 'CUP_01', suit: 'Cup', rank: 1, cardLevel: 1 },
          { slot: 1, cardId: 'WAND_02', suit: 'Wand', rank: 2, cardLevel: 1 }
        ]
      }
    });
    expect(resolved.candidates).toHaveLength(2);
    expect(resolved.candidates[0].steps[0].resolvedR).toBe(8);
    expect(resolved.candidates[1].steps[0].resolvedR).toBe(0);
  });

  test('Scholar keeps the legacy inversion in version 4 and maximizes resonance in version 5', async () => {
    const effects = await loadEffectsModule();
    const context = {
      actorIndex: 0,
      guardianNumber: 11,
      reverseBefore: true,
      rHistory: { turnNo: 3 },
      players: Array.from({ length: 4 }, () => ({ hp: 100, maxHp: 100 }))
    };

    expect(effects.resolveTarotKingdomR(4, {
      ...context,
      arcanaLoadoutEffectsVersion: 4
    })).toBe(7);
    expect(effects.resolveTarotKingdomR(4, {
      ...context,
      arcanaLoadoutEffectsVersion: 5
    })).toBe(10);
    expect(effects.resolveTarotKingdomR(4, {
      ...context,
      reverseBefore: false,
      arcanaLoadoutEffectsVersion: 5
    })).toBe(3);
  });

  test('inherited Guardian numbers participate in Gambler and Scholar R rules', async () => {
    const effects = await loadEffectsModule();
    const players = Array.from({ length: 4 }, () => ({ hp: 100, maxHp: 100 }));
    expect(effects.resolveTarotKingdomR(4, {
      actorIndex: 0,
      guardianNumber: 4,
      guardianNumbers: [4, 11],
      reverseBefore: true,
      rHistory: { turnNo: 3 },
      players,
      arcanaLoadoutEffectsVersion: 9
    })).toBe(10);
    expect(effects.resolveTarotKingdomR(10, {
      actorIndex: 0,
      guardianNumber: 4,
      guardianNumbers: [4, 10],
      rHistory: { rank10: { floorByPlayer: [7, 0, 0, 0] } },
      players,
      arcanaLoadoutEffectsVersion: 9
    }, () => 0)).toBe(7);
  });

  test('guardian catalog exposes the revised practical conditions', async () => {
    const effects = await loadEffectsModule();
    const expected = new Map([
      [1, ['呪術師', '最大＋45％']],
      [6, ['吟遊詩人', '他の生存味方']],
      [11, ['パラディン', 'カードルール上の数字は変わらない']],
      [12, ['かばう', '最大値の1/8以下']],
      [13, ['死霊術師', '最大20％']],
      [14, ['ものまねし', '小アルカナ14']],
      [20, ['ビショップ', '発動するたび']],
      [21, ['勇者', '2枚']]
    ]);
    expected.forEach(([passiveName, phrase], number) => {
      const definition = effects.getTarotKingdomGuardianDefinition(number);
      expect(definition).toMatchObject({ passiveName });
      expect(definition.passive).toContain(phrase);
    });
    expect(effects.getTarotKingdomGuardianDefinition(15).passive).toContain('自分がP・N・Q・Kを出すたび');
  });

  test('AP catalog covers all 56 exact cards with rank-based costs', async () => {
    const effects = await loadEffectsModule();
    const definitions = globalThis.__TAROT_KINGDOM_ARCANA_AP_EFFECTS__.minor;
    expect(definitions).toHaveLength(56);
    expect(new Set(definitions.map((entry) => entry.id)).size).toBe(56);
    for (const definition of definitions) {
      const expectedCost = definition.rank === 1
        ? 'all'
        : (definition.rank <= 4 ? 0 : (definition.rank <= 10 ? 1 : 2));
      expect(definition.apCost, definition.id).toBe(expectedCost);
      expect(effects.getTarotKingdomMinorApDefinition(definition.suit, definition.rank), definition.id)
        .toMatchObject({ id: definition.id, apCost: expectedCost });
    }
  });

  test('all 56 AP definitions expand into an executable effect in a valid battle context', async () => {
    const effects = await loadEffectsModule();
    const definitions = globalThis.__TAROT_KINGDOM_ARCANA_AP_EFFECTS__.minor;
    for (const definition of definitions) {
      const card = minor(definition.suit, definition.rank, `execute-${definition.id}`);
      const resolved = effects.resolveTarotKingdomResonance({
        ...weaponContext(['unarmed'], card, {
          players: [
            { hp: 50, maxHp: 100 },
            { hp: 20, maxHp: 100 },
            { hp: 80, maxHp: 100 },
            { hp: 0, maxHp: 100 }
          ],
          enemy: { hp: 500, maxHp: 500 },
          effects: {
            enemy: { defenseUp: { potency: 20, remainingTurns: 2 } },
            party: {},
            players: [{}, { poison: { potency: 8, charges: 2 } }, {}, {}]
          },
          koOrder: [3]
        }),
        arcanaLoadoutEffectsVersion: 6,
        arcanaPoints: 10,
        cards: [card],
        character: {
          combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
          tarotDeck: [{
            slot: 0,
            suit: definition.suit,
            rank: definition.rank,
            cardLevel: 1,
            resonanceId: definition.id
          }]
        }
      });
      expect(resolved, definition.id).not.toBeNull();
      expect(resolved.steps.length, definition.id).toBeGreaterThan(0);
    }
  });

  test('AP resonance spends in slot order, permits five-card plays, and lets recharge fund a later card', async () => {
    const effects = await loadEffectsModule();
    const played = [
      minor('Wand', 6, 'ap-wand-six'),
      minor('Sword', 14, 'ap-sword-king'),
      minor('Cup', 2, 'ap-role-filler-1'),
      minor('Pentacle', 3, 'ap-role-filler-2'),
      minor('Wand', 4, 'ap-role-filler-3')
    ];
    const resolved = effects.resolveTarotKingdomResonance({
      ...weaponContext(['unarmed'], played[0]),
      arcanaLoadoutEffectsVersion: 6,
      arcanaPoints: 1,
      playType: 'role',
      cards: played,
      character: {
        combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
        tarotDeck: [
          { slot: 0, suit: 'Wand', rank: 6, cardLevel: 1 },
          { slot: 1, suit: 'Sword', rank: 14, cardLevel: 1 }
        ]
      }
    });
    expect(resolved).toMatchObject({ apBefore: 1, apAfter: 0, apSpent: 3, apGained: 2 });
    expect(resolved.candidates.map((candidate) => ({
      id: candidate.resonanceId,
      cost: candidate.apCost,
      gain: candidate.apGain,
      after: candidate.apAfter
    }))).toEqual([
      { id: 'wand-6', cost: 1, gain: 2, after: 2 },
      { id: 'sword-14', cost: 2, gain: 0, after: 0 }
    ]);
  });

  test('multiple A cards split all AP and AP zero still produces minimum A potency', async () => {
    const effects = await loadEffectsModule();
    const makeContext = (arcanaPoints) => ({
      ...weaponContext(['unarmed'], minor('Sword', 1)),
      arcanaLoadoutEffectsVersion: 6,
      arcanaPoints,
      cards: [minor('Sword', 1), minor('Wand', 1)],
      character: {
        combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
        tarotDeck: [
          { slot: 0, suit: 'Sword', rank: 1, cardLevel: 1 },
          { slot: 1, suit: 'Wand', rank: 1, cardLevel: 1 }
        ]
      }
    });
    const split = effects.resolveTarotKingdomResonance(makeContext(5));
    expect(split).toMatchObject({ apBefore: 5, apAfter: 0, apSpent: 5 });
    expect(split.candidates.map((candidate) => candidate.apAllocation)).toEqual([3, 2]);
    const empty = effects.resolveTarotKingdomResonance(makeContext(0));
    expect(empty).toMatchObject({ apBefore: 0, apAfter: 0, apSpent: 0 });
    expect(empty.steps.every((step) => Number(step.amount) >= 1)).toBe(true);
  });

  test('version 7 requires at least one AP for an A resonance', async () => {
    const effects = await loadEffectsModule();
    const card = minor('Sword', 1, 'v7-empty-ace');
    const resolved = effects.resolveTarotKingdomResonance({
      ...weaponContext(['unarmed'], card),
      arcanaLoadoutEffectsVersion: 7,
      arcanaPoints: 0,
      cards: [card],
      character: {
        combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
        tarotDeck: [{ slot: 0, suit: 'Sword', rank: 1, cardLevel: 1 }]
      }
    });
    expect(resolved).toBeNull();
  });

  test('version 7 sword 3 is stronger than sword 2 while version 6 remains compatible', async () => {
    const effects = await loadEffectsModule();
    const resolve = (rank, version) => {
      const card = minor('Sword', rank, `sword-${rank}-v${version}`);
      return effects.resolveTarotKingdomResonance({
        ...weaponContext(['unarmed'], card),
        arcanaLoadoutEffectsVersion: version,
        arcanaPoints: 0,
        cards: [card],
        character: {
          combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
          tarotDeck: [{ slot: 0, suit: 'Sword', rank, cardLevel: 1 }]
        }
      });
    };
    expect(resolve(3, 6).steps[0].amount).toBeLessThan(resolve(2, 6).steps[0].amount);
    expect(resolve(3, 7).steps[0].amount).toBeGreaterThan(resolve(2, 7).steps[0].amount);
  });

  test('Gambler repeats every exact resonance on a two-card pair without extra AP cost', async () => {
    const effects = await loadEffectsModule();
    const cards = [minor('Wand', 6, 'double-wand-6'), minor('Sword', 6, 'double-sword-6')];
    const resolved = effects.resolveTarotKingdomResonance({
      ...weaponContext(['unarmed'], cards[0]),
      arcanaLoadoutEffectsVersion: 7,
      arcanaPoints: 2,
      playType: 'set',
      cards,
      character: {
        combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
        guardianArcana: { number: 10, cardLevel: 1 },
        tarotDeck: [
          { slot: 0, suit: 'Wand', rank: 6, cardLevel: 1 },
          { slot: 1, suit: 'Sword', rank: 6, cardLevel: 1 }
        ]
      }
    });
    expect(resolved).toMatchObject({
      gamblerDoubleUp: true,
      apBefore: 2,
      apAfter: 4,
      apSpent: 2,
      apGained: 4
    });
    expect(resolved.candidates).toHaveLength(2);
    expect(resolved.candidates.every((candidate) => candidate.gamblerReplay === true)).toBe(true);
    expect(resolved.steps.filter((step) => step.gamblerReplay === true)).toHaveLength(
      resolved.steps.filter((step) => step.gamblerReplay !== true).length
    );
    expect(resolved.steps.filter((step) => step.gamblerReplay === true).every((step) => step.apCost === 0)).toBe(true);

    const inherited = effects.resolveTarotKingdomResonance({
      ...weaponContext(['unarmed'], cards[0]),
      arcanaLoadoutEffectsVersion: 9,
      arcanaPoints: 2,
      playType: 'set',
      cards,
      character: {
        combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
        guardianArcana: { number: 4, cardLevel: 1 },
        inheritedGuardianAbility: { number: 10, cardLevel: 25 },
        tarotDeck: [
          { slot: 0, suit: 'Wand', rank: 6, cardLevel: 1 },
          { slot: 1, suit: 'Sword', rank: 6, cardLevel: 1 }
        ]
      }
    });
    expect(inherited).toMatchObject({ gamblerDoubleUp: true });
    expect(inherited.candidates.every((candidate) => candidate.gamblerReplay === true)).toBe(true);

    const threeCards = effects.resolveTarotKingdomResonance({
      ...weaponContext(['unarmed'], cards[0]),
      arcanaLoadoutEffectsVersion: 7,
      arcanaPoints: 3,
      playType: 'set',
      cards: [...cards, minor('Cup', 6, 'third-six')],
      character: {
        combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
        guardianArcana: { number: 10, cardLevel: 1 },
        tarotDeck: [{ slot: 0, suit: 'Wand', rank: 6, cardLevel: 1 }]
      }
    });
    expect(threeCards.gamblerDoubleUp).toBe(false);
  });

  test('Scholar discounts fixed AP resonance only during 11 back in version 7', async () => {
    const effects = await loadEffectsModule();
    const card = minor('Sword', 14, 'scholar-sword-king');
    const context = {
      ...weaponContext(['unarmed'], card),
      arcanaLoadoutEffectsVersion: 7,
      arcanaPoints: 1,
      cards: [card],
      character: {
        combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
        guardianArcana: { number: 11, cardLevel: 1 },
        tarotDeck: [{ slot: 0, suit: 'Sword', rank: 14, cardLevel: 1 }]
      }
    };
    expect(effects.resolveTarotKingdomResonance({ ...context, reverseBefore: false })).toBeNull();
    expect(effects.resolveTarotKingdomResonance({ ...context, reverseBefore: true })).toMatchObject({
      apBefore: 1,
      apAfter: 0,
      apSpent: 1,
      candidates: [{ apCost: 1 }]
    });
    const inheritedContext = {
      ...context,
      arcanaLoadoutEffectsVersion: 9,
      character: {
        ...context.character,
        guardianArcana: { number: 4, cardLevel: 1 },
        inheritedGuardianAbility: { number: 11, cardLevel: 25 }
      }
    };
    expect(effects.resolveTarotKingdomResonance({ ...inheritedContext, reverseBefore: true })).toMatchObject({
      apBefore: 1,
      apAfter: 0,
      apSpent: 1,
      candidates: [{ apCost: 1 }]
    });
  });

  test('level growth gives the seven previously fixed minor effects their specified values', async () => {
    const effects = await loadEffectsModule();
    const resolve = (suit, rank, cardLevel, overrides = {}) => {
      const card = minor(suit, rank, `${suit}-${rank}-lv${cardLevel}`);
      return effects.resolveTarotKingdomResonance({
        ...weaponContext(['unarmed'], card, overrides),
        arcanaLoadoutEffectsVersion: 7,
        arcanaPoints: 5,
        cards: [card],
        character: {
          combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
          tarotDeck: [{ slot: 0, suit, rank, cardLevel }]
        }
      });
    };
    const step = (resolved, kind, statusKey = '') => resolved.steps.find((entry) => (
      entry.kind === kind && (!statusKey || entry.statusKey === statusKey)
    ));
    const cupContext = {
      effects: { enemy: {}, party: {}, players: [{ poison: { potency: 5 } }, {}, {}, {}] }
    };

    expect(step(resolve('Cup', 5, 1, cupContext), 'buff', 'hpShield').potency).toBe(5);
    expect(step(resolve('Cup', 5, 15, cupContext), 'buff', 'hpShield').potency).toBe(15);
    expect(step(resolve('Pentacle', 6, 1), 'status', 'vulnerable').potency).toBe(10);
    expect(step(resolve('Pentacle', 6, 15), 'status', 'vulnerable').potency).toBe(25);
    expect(step(resolve('Pentacle', 7, 1), 'buff', 'attackDown').potency).toBe(10);
    expect(step(resolve('Pentacle', 7, 15), 'buff', 'attackDown').potency).toBe(25);
    expect(step(resolve('Pentacle', 7, 15), 'buff', 'attackDown').turns).toBe(2);
    expect(step(resolve('Pentacle', 13, 1), 'status', 'vulnerable').potency).toBe(10);
    expect(step(resolve('Pentacle', 13, 15), 'status', 'vulnerable').potency).toBe(25);
    expect(step(resolve('Pentacle', 14, 1), 'buff', 'hpShield').potency).toBe(5);
    expect(step(resolve('Pentacle', 14, 15), 'buff', 'hpShield').potency).toBe(15);
    expect(step(resolve('Wand', 6, 1), 'ap-gain').amount).toBe(2);
    expect(step(resolve('Wand', 6, 15), 'ap-gain').amount).toBe(5);
    expect(step(resolve('Wand', 10, 1), 'ap-gain').amount).toBe(3);
    expect(step(resolve('Wand', 10, 15), 'ap-gain').amount).toBe(6);
    expect(step(resolve('Wand', 10, 1), 'recoil-percent').percent).toBe(10);
    expect(step(resolve('Wand', 10, 15), 'recoil-percent').percent).toBe(5);
  });

  test('Gambler and Scholar annotate only their numerical resonance effects with level scaling', async () => {
    const effects = await loadEffectsModule();
    const gamblerCards = [minor('Sword', 2, 'gambler-sword-two'), minor('Wand', 2, 'gambler-wand-two')];
    const gambler = effects.resolveTarotKingdomResonance({
      ...weaponContext(['unarmed'], gamblerCards[0]),
      arcanaLoadoutEffectsVersion: 7,
      arcanaPoints: 2,
      cards: gamblerCards,
      character: {
        combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
        guardianArcana: { number: 10, cardLevel: 25 },
        tarotDeck: [
          { slot: 0, suit: 'Sword', rank: 2, cardLevel: 1 },
          { slot: 1, suit: 'Wand', rank: 2, cardLevel: 1 }
        ]
      }
    });
    expect(gambler.steps.filter((entry) => entry.gamblerReplay && entry.kind !== 'ap-gain'))
      .toEqual(expect.arrayContaining([expect.objectContaining({ numericMultiplier: 2.5 })]));
    expect(gambler.apGained).toBe(0);

    const scholarCard = minor('Sword', 14, 'scholar-sword-fourteen');
    const scholar = effects.resolveTarotKingdomResonance({
      ...weaponContext(['unarmed'], scholarCard),
      arcanaLoadoutEffectsVersion: 7,
      arcanaPoints: 1,
      cards: [scholarCard],
      reverseBefore: true,
      character: {
        combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
        guardianArcana: { number: 11, cardLevel: 25 },
        tarotDeck: [{ slot: 0, suit: 'Sword', rank: 14, cardLevel: 1 }]
      }
    });
    expect(scholar.steps).toEqual(expect.arrayContaining([expect.objectContaining({ numericMultiplier: 3 })]));
  });

  test('an unaffordable or targetless AP effect neither activates nor spends AP', async () => {
    const effects = await loadEffectsModule();
    const character = (suit, rank) => ({
      combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
      tarotDeck: [{ slot: 0, suit, rank, cardLevel: 1 }]
    });
    expect(effects.resolveTarotKingdomResonance({
      ...weaponContext(['unarmed'], minor('Sword', 14)),
      arcanaLoadoutEffectsVersion: 6,
      arcanaPoints: 1,
      character: character('Sword', 14)
    })).toBeNull();
    expect(effects.resolveTarotKingdomResonance({
      ...weaponContext(['unarmed'], minor('Cup', 2), {
        players: Array.from({ length: 4 }, () => ({ hp: 100, maxHp: 100 })),
        effects: { enemy: {}, party: {}, players: [{}, {}, {}, {}] }
      }),
      arcanaLoadoutEffectsVersion: 6,
      arcanaPoints: 3,
      character: character('Cup', 2)
    })).toBeNull();
  });
});
