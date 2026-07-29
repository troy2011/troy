const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

let effectsModulePromise;

function loadEffectsModule() {
  if (!effectsModulePromise) {
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
  test('matches by minor suit and rank, works with role submissions, and ignores item identity', async () => {
    const effects = await loadEffectsModule();
    const deck = [{
      slot: 0,
      itemId: 'owned-instance-does-not-matter',
      cardId: 'CUP_05',
      suit: 'Cup',
      rank: 5,
      skillName: '潮の共鳴',
      effectClass: 'attack',
      power: 100,
      effectCodes: [{ type: 'flood' }]
    }];
    const context = weaponContext(['unarmed'], minor('Cup', 5), {
      playType: 'role',
      character: { combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] }, tarotDeck: deck }
    });
    expect(effects.resolveTarotKingdomResonance(context)).toMatchObject({
      slot: 0,
      skillName: '潮の共鳴',
      suit: 'Cup',
      rank: 5
    });
    expect(effects.resolveTarotKingdomResonance({ ...context, cards: [minor('Cup', 6)] })).toBeNull();
    expect(effects.resolveTarotKingdomResonance({ ...context, cards: [{ kind: 'major', number: 5 }] })).toBeNull();
  });

  test('best candidate uses defeat, healing, damage and then deck order priorities', async () => {
    const effects = await loadEffectsModule();
    const card = minor('Sword', 5);
    const strongerCard = minor('Sword', 6);
    const character = {
      combat: { power: 100, intelligence: 100, weaponType: 'unarmed', weaponTypes: ['unarmed'] },
      tarotDeck: [
        { slot: 0, cardId: 'SWORD_05', suit: 'Sword', rank: 5, skillName: '弱撃', power: 50 },
        { slot: 1, cardId: 'SWORD_06', suit: 'Sword', rank: 6, skillName: '決着撃', power: 100 }
      ]
    };
    const resolved = effects.resolveTarotKingdomResonance({
      ...weaponContext(['unarmed'], card),
      cards: [card, strongerCard],
      character,
      enemy: { hp: 25, maxHp: 100 }
    });
    expect(resolved.skillName).toBe('決着撃');
  });

  test('all 56 saved minor-card effect codes have a structured conversion', async () => {
    const effects = await loadEffectsModule();
    const skillData = JSON.parse(fs.readFileSync(path.join(__dirname, '../server/data/tarot-battle-skills.json'), 'utf8'));
    const minorDeck = skillData.cards.filter((card) => card.classification === '小アルカナ');
    expect(minorDeck).toHaveLength(56);
    expect(effects.getUnsupportedTarotKingdomEffectCodes(minorDeck)).toEqual([]);
    minorDeck.forEach((entry, slot) => {
      const suit = `${entry.suit.charAt(0).toUpperCase()}${entry.suit.slice(1).toLowerCase()}`;
      const candidate = effects.buildTarotKingdomResonanceCandidate(
        { ...entry, slot },
        minor(suit, entry.rank),
        weaponContext(['unarmed'], minor(suit, entry.rank))
      );
      expect(candidate, entry.itemId).toBeTruthy();
      expect(candidate.steps.length, entry.itemId).toBeGreaterThan(0);
    });
  });
});
