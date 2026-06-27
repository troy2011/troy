const { test, expect } = require('@playwright/test');

const LEGACY_STAT_KEYS = {
  strength: '\u7e3a\uff61\u7e3a\u4e5d\uff49',
  defense: '\u7e3a\uff7f\u7e3a\uff6e\u7e3a\uff7e\u7e67\u3085\uff4a',
  speed: '\u7e3a\u5436\u30fb\u7e67\u30fb\uff06',
  intelligence: '\u7e3a\u4e5d\uff20\u7e3a\u8599\uff06'
};

function makeFighter(overrides = {}) {
  const hp = overrides.hp ?? 120;
  const mp = overrides.mp ?? 0;
  return {
    id: overrides.id || 'fighter',
    stats: {
      DisplayName: overrides.name || overrides.id || 'Fighter',
      Level: overrides.level || 8,
      HP: hp,
      MaxHP: hp,
      CurrentHP: overrides.currentHp ?? hp,
      MP: mp,
      MaxMP: mp,
      CurrentMP: overrides.currentMp ?? mp,
      [LEGACY_STAT_KEYS.strength]: overrides.strength ?? 12,
      [LEGACY_STAT_KEYS.defense]: overrides.guard ?? 0,
      [LEGACY_STAT_KEYS.speed]: overrides.speed ?? 10,
      [LEGACY_STAT_KEYS.intelligence]: overrides.intelligence ?? 0,
      Power: overrides.strength ?? 12,
      Defense: overrides.guard ?? 0,
      Agi: overrides.speed ?? 10,
      Int: overrides.intelligence ?? 0
    },
    equipmentStats: {
      Power: overrides.power ?? 8,
      Defense: overrides.defense ?? 0,
      Agi: 0,
      Int: 0,
      MagicPower: 0,
      HealPower: 0,
      StatusRate: 0
    },
    equipment: {
      RightHand: { customData: { Category: 'Weapon', ManifestWeaponType: overrides.weapon || 'sword' } }
    },
    skills: overrides.skills || [],
    tarotBattleDeck: overrides.tarotBattleDeck || [],
    tarotMeleeRole: overrides.tarotMeleeRole || null,
    tarotRolePassive: overrides.tarotRolePassive || null
  };
}

function minor(itemId) {
  const { resolveTarotBattleSkill } = require('../server/tarotBattleSkills');
  return { ...resolveTarotBattleSkill(itemId) };
}

async function runDirectBattle(player, defender, options = {}) {
  const { runMeleeBattle } = require('../server/battle/MeleeCombatSystem');
  return runMeleeBattle(player, defender, {
    random: () => 0,
    maxRounds: 4,
    ...options
  });
}

function combatantSetup(result, fighterId) {
  return result.meleeSetup?.combatants?.find((combatant) => combatant.id === fighterId);
}

function slotSetup(result, fighterId, die) {
  return combatantSetup(result, fighterId)?.slots?.find((slot) => slot.die === die);
}

function timelineFor(result, fighterId, die) {
  return (result.meleeTimeline || []).filter((entry) => entry.actorId === fighterId && entry.die === die);
}

async function withBattleRoutes(callback) {
  const adminPath = require.resolve('firebase-admin');
  const battleRoutesPath = require.resolve('../server/routes/battleRoutes');
  const originalAdminCache = require.cache[adminPath];

  require.cache[adminPath] = {
    id: adminPath,
    filename: adminPath,
    loaded: true,
    exports: {
      database: () => ({}),
      firestore: () => ({})
    }
  };
  delete require.cache[battleRoutesPath];

  try {
    const battleRoutes = require('../server/routes/battleRoutes');
    battleRoutes.initializeBattleRoutes(
      { post() {} },
      async () => ({}),
      {},
      {},
      {},
      { pushMessage: async () => null },
      {},
      {},
      (id) => id,
      { VIRTUAL_CURRENCY_CODE: 'PS', LEADERBOARD_NAME: 'ps_ranking', BATTLE_REWARD_POINTS: 0 },
      {}
    );
    return await callback(battleRoutes);
  } finally {
    delete require.cache[battleRoutesPath];
    if (originalAdminCache) {
      require.cache[adminPath] = originalAdminCache;
    } else {
      delete require.cache[adminPath];
    }
  }
}

test('tarot battle skill data resolves catalog ids and dice fields', () => {
  const {
    jsonCardIdToItemId,
    resolveTarotBattleSkill
  } = require('../server/tarotBattleSkills');

  expect(jsonCardIdToItemId('MAJOR_04')).toBe('arcana-4');
  expect(jsonCardIdToItemId('SWORD_09')).toBe('minor-sword-9');
  expect(resolveTarotBattleSkill('arcana-4')?.skillName).toEqual(expect.any(String));

  const swordNine = resolveTarotBattleSkill('minor-sword-9');
  expect(swordNine).toMatchObject({
    itemId: 'minor-sword-9',
    rank: 9,
    power: null,
    accuracy: null,
    effectText: expect.stringContaining('回避')
  });
});

test('public tarot battle skill payload exposes dice fields without dropping old fields', () => {
  const { getPublicTarotBattleSkills } = require('../server/tarotBattleSkills');
  const skills = getPublicTarotBattleSkills();
  const emperor = skills.find((skill) => skill.itemId === 'arcana-4');
  const swordEight = skills.find((skill) => skill.itemId === 'minor-sword-8');

  expect(emperor).toMatchObject({
    itemId: 'arcana-4',
    cooldown: expect.any(Number),
    effectClass: expect.any(String),
    element: expect.any(String)
  });
  expect(swordEight).toMatchObject({
    itemId: 'minor-sword-8',
    rank: 8,
    power: 100,
    accuracy: 90,
    effectText: expect.stringContaining('防御')
  });
});

test('melee battle result keeps legacy fields and adds structured replay data', async () => {
  const player = makeFighter({ id: 'player-a', name: 'A', hp: 180, speed: 20 });
  const defender = makeFighter({ id: 'boss-b', name: 'B', hp: 180, speed: 1, weapon: 'blunt', power: 1, strength: 1 });

  const result = await runDirectBattle(player, defender, { diceRolls: [2, 6], maxRounds: 1 });

  expect(result.winner).toBeTruthy();
  expect(result.loser).toBeTruthy();
  expect(Array.isArray(result.logs)).toBe(true);
  expect(result.meleeSetup).toMatchObject({
    version: 1,
    combatants: expect.arrayContaining([
      expect.objectContaining({
        id: 'player-a',
        weaponType: 'sword',
        slots: expect.arrayContaining([
          expect.objectContaining({ die: 1 }),
          expect.objectContaining({ die: 2 })
        ])
      })
    ])
  });
  expect(result.meleeTimeline).toEqual(expect.arrayContaining([
    expect.objectContaining({
      actorId: 'player-a',
      die: 2,
      resultType: expect.any(String),
      attackerHpBefore: expect.any(Number),
      defenderHpAfter: expect.any(Number)
    })
  ]));
});

test('tarot role passives use percentage battle effects', () => {
  const { getTarotRolePassive } = require('../server/tarotRoles');

  expect(getTarotRolePassive({ key: 'OnePair', label: 'one pair' }).hpRate).toBeCloseTo(0.1);
  expect(getTarotRolePassive({ key: 'FourKind', label: 'four kind' }).criticalRateBonus).toBeCloseTo(0.1);
  expect(getTarotRolePassive({ key: 'RoyalFlush', label: 'royal flush' }).startingShieldRate).toBeCloseTo(0.2);
});

test('tarot deck helpers preserve user order', () => {
  const {
    equipCardToDeck,
    filterMinorDeckIds,
    moveCardInDeck,
    sortDeckByCardNumber
  } = require('../server/tarotDeck');

  expect(sortDeckByCardNumber(['arcana-10', 'arcana-1'])).toEqual(['arcana-10', 'arcana-1']);
  expect(equipCardToDeck(['arcana-10'], 'arcana-1').deck).toEqual(['arcana-10', 'arcana-1']);
  expect(moveCardInDeck(['arcana-10', 'arcana-1', 'minor-sword-9'], 'minor-sword-9', 'left').deck)
    .toEqual(['arcana-10', 'minor-sword-9', 'arcana-1']);
  expect(filterMinorDeckIds(['arcana-4', 'minor-sword-9', 'minor-cup-10'], {
    'arcana-4': { Category: 'TarotMajor' },
    'minor-sword-9': { Category: 'TarotMinor' },
    'minor-cup-10': { Category: 'TarotMinor' }
  })).toEqual(['minor-sword-9', 'minor-cup-10']);
});

test('tarot battle deck ignores major arcana because they are ship equipment', () => {
  const { getTarotBattleDeck } = require('../server/tarotBattleSkills');
  const deck = getTarotBattleDeck(['arcana-4', 'minor-sword-9'], {
    'arcana-4': { Category: 'TarotMajor', ArcanaNumber: 4 },
    'minor-sword-9': { Category: 'TarotMinor', ArcanaSuit: 'sword', ArcanaRank: '9' }
  });

  expect(deck.map((skill) => skill.itemId)).toEqual(['minor-sword-9']);
});

test('matching minor rank starts unlocked and skips the weapon form', async () => {
  const player = makeFighter({
    id: 'player-a',
    name: 'A',
    hp: 220,
    speed: 20,
    tarotBattleDeck: [minor('minor-cup-2'), minor('minor-cup-3'), minor('minor-cup-4')]
  });
  const defender = makeFighter({ id: 'boss-b', name: 'B', hp: 500, speed: 1, weapon: 'blunt', power: 1, strength: 1 });

  const result = await runDirectBattle(player, defender, { diceRolls: [4, 6], maxRounds: 1 });
  const joined = result.logs.join('\n');

  expect(joined).toContain('A の出目4: カップ4 / ぬかるみ（小アルカナ）');
  expect(joined).not.toContain('連斬（武器型）');
  expect(slotSetup(result, 'player-a', 4)).toMatchObject({
    die: 4,
    initialUnlocked: true,
    card: expect.objectContaining({ itemId: 'minor-cup-4', rank: 4 })
  });
  expect(timelineFor(result, 'player-a', 4)[0]).toMatchObject({
    resultType: 'minorArcana',
    action: expect.objectContaining({ cardName: 'カップ4' })
  });
});

test('nonmatching minor rank uses weapon form first then the card on the next same die', async () => {
  const player = makeFighter({
    id: 'player-a',
    name: 'A',
    hp: 220,
    speed: 20,
    tarotBattleDeck: [minor('minor-cup-2'), minor('minor-cup-3'), minor('minor-wand-9')]
  });
  const defender = makeFighter({ id: 'boss-b', name: 'B', hp: 500, speed: 1, weapon: 'blunt', power: 1, strength: 1 });

  const result = await runDirectBattle(player, defender, { diceRolls: [4, 6, 4, 6], maxRounds: 2 });
  const firstWeapon = result.logs.findIndex((line) => line.includes('A の出目4: 連斬（武器型）'));
  const secondMinor = result.logs.findIndex((line) => line.includes('A の出目4: ワンド9 / 火の輪（小アルカナ）'));

  expect(firstWeapon).toBeGreaterThan(-1);
  expect(secondMinor).toBeGreaterThan(firstWeapon);
  expect(slotSetup(result, 'player-a', 4)).toMatchObject({
    die: 4,
    initialUnlocked: false,
    card: expect.objectContaining({ itemId: 'minor-wand-9', rank: 9 })
  });
  expect(timelineFor(result, 'player-a', 4).map((entry) => entry.resultType)).toEqual(['weaponForm', 'minorArcana']);
});

test('die one becomes a miss after its weapon form has been removed', async () => {
  const player = makeFighter({ id: 'player-a', name: 'A', hp: 220, speed: 20 });
  const defender = makeFighter({ id: 'boss-b', name: 'B', hp: 500, speed: 1, weapon: 'blunt', power: 1, strength: 1 });

  const result = await runDirectBattle(player, defender, { diceRolls: [1, 6, 1, 6], maxRounds: 2 });
  const firstWeapon = result.logs.findIndex((line) => line.includes('A の出目1: 斬撃（武器型）'));
  const secondMiss = result.logs.findIndex((line) => line.includes('A の出目1: ミス（1の武器型は外れている）'));

  expect(firstWeapon).toBeGreaterThan(-1);
  expect(secondMiss).toBeGreaterThan(firstWeapon);
  expect(timelineFor(result, 'player-a', 1).map((entry) => entry.resultType)).toEqual(['weaponForm', 'miss']);
});

test('same-rank minor on axe_big die two removes the bad weapon form drawback', async () => {
  const player = makeFighter({
    id: 'player-a',
    name: 'A',
    hp: 220,
    speed: 20,
    weapon: 'axe_big',
    tarotBattleDeck: [minor('minor-pentacle-2')]
  });
  const defender = makeFighter({ id: 'boss-b', name: 'B', hp: 500, speed: 1, weapon: 'blunt', power: 1, strength: 1 });

  const result = await runDirectBattle(player, defender, { diceRolls: [2, 6], maxRounds: 1 });
  const joined = result.logs.join('\n');

  expect(joined).toContain('A の出目2: ペンタクル2 / 二重装甲（小アルカナ）');
  expect(joined).not.toContain('踏み外し');
  expect(slotSetup(result, 'player-a', 2)).toMatchObject({
    die: 2,
    initialUnlocked: true,
    card: expect.objectContaining({ itemId: 'minor-pentacle-2', rank: 2 })
  });
  expect(timelineFor(result, 'player-a', 2)[0]).toMatchObject({
    resultType: 'minorArcana',
    action: expect.objectContaining({ cardName: 'ペンタクル2' })
  });
});

test('empty dice slots use the weapon form once and then miss', async () => {
  const player = makeFighter({ id: 'player-a', name: 'A', hp: 220, speed: 20 });
  const defender = makeFighter({ id: 'boss-b', name: 'B', hp: 500, speed: 1, weapon: 'blunt', power: 1, strength: 1 });

  const result = await runDirectBattle(player, defender, { diceRolls: [3, 6, 3, 6], maxRounds: 2 });
  const firstWeapon = result.logs.findIndex((line) => line.includes('A の出目3: 突き（武器型）'));
  const secondMiss = result.logs.findIndex((line) => line.includes('A の出目3: ミス（空スロットの武器型は外れている）'));

  expect(firstWeapon).toBeGreaterThan(-1);
  expect(secondMiss).toBeGreaterThan(firstWeapon);
  expect(slotSetup(result, 'player-a', 3)).toMatchObject({
    die: 3,
    initialUnlocked: false,
    card: null
  });
  expect(timelineFor(result, 'player-a', 3).map((entry) => entry.resultType)).toEqual(['weaponForm', 'miss']);
});

test('royal flush passive grants a shield that absorbs damage before HP', async () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    await withBattleRoutes(async (battleRoutes) => {
      const defender = makeFighter({
        id: 'royal-a',
        name: 'Royal',
        hp: 100,
        power: 1,
        speed: 10,
        tarotMeleeRole: { key: 'RoyalFlush', label: 'ロイヤルフラッシュ' }
      });
      const attacker = makeFighter({
        id: 'attacker-b',
        name: 'Attacker',
        hp: 120,
        power: 30,
        strength: 20,
        speed: 13,
        weapon: 'blunt'
      });

      const result = await battleRoutes.runBattle(defender, attacker);

      expect(result.logs.some((line) => line.includes('タロット役「ロイヤルフラッシュ」'))).toBe(true);
      expect(result.logs.some((line) => line.includes('シールド'))).toBe(true);
      expect(defender.tarotShield).toBeLessThan(24);
    });
  } finally {
    Math.random = originalRandom;
  }
});

test('naval boarding state carries morale crew damage and statuses into melee', async () => {
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  try {
    await withBattleRoutes(async (battleRoutes) => {
      const player = makeFighter({
        id: 'naval-a',
        name: 'Naval',
        hp: 100,
        mp: 20,
        power: 2,
        strength: 8,
        speed: 10,
        weapon: 'sword'
      });
      player.navalBoardingState = {
        morale: 2,
        crewHpPercent: 70,
        crewMpPercent: 50,
        statuses: {
          fire: { turns: 2 },
          flood: { turns: 2 },
          fear: { turns: 2 },
          confusion: { turns: 2 }
        }
      };
      const defender = makeFighter({
        id: 'naval-b',
        name: 'Target',
        hp: 180,
        power: 1,
        strength: 4,
        speed: 8,
        weapon: 'blunt'
      });

      const result = await battleRoutes.runBattle(player, defender);
      const joined = result.logs.join('\n');

      expect(joined).toContain('海戦影響');
      expect(joined).toContain('船員HP70%');
      expect(joined).toContain('船員MP50%');
      expect(joined).toContain('火傷');
      expect(joined).toContain('水浸し');
      expect(joined).toContain('恐怖');
      expect(joined).toContain('混乱');
      expect(joined).toContain('士気+2');
      expect(joined).toContain('火傷で');
    });
  } finally {
    Math.random = originalRandom;
  }
});
