const { test, expect } = require('@playwright/test');

const LEGACY_STAT_KEYS = {
  strength: 'ちから',
  defense: 'みのまもり',
  speed: 'すばやさ',
  intelligence: 'かしこさ'
};

function makeFighter(overrides = {}) {
  const hp = overrides.hp ?? 120;
  const mp = overrides.mp ?? 0;
  const nation = overrides.nation ?? overrides.statsNation;
  const avatar = { ...(overrides.avatar || {}) };
  if (nation !== undefined) avatar.Nation = nation;
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
      Int: overrides.intelligence ?? 0,
      ...(overrides.statsNation !== undefined ? { Nation: overrides.statsNation } : {})
    },
    avatar,
    ...(overrides.nation !== undefined ? { nation: overrides.nation } : {}),
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

test('melee combat stats use allocated Japanese stats plus equipment without direct level scaling', () => {
  const {
    createCombatant,
    getCombatantStatSummary,
    calculatePhysicalDamage
  } = require('../server/battle/MeleeCombatSystem');
  const makeJapaneseStatFighter = (level) => createCombatant({
    id: `level-${level}`,
    stats: {
      DisplayName: `Level ${level}`,
      Level: level,
      HP: 100,
      MaxHP: 100,
      CurrentHP: 100,
      ちから: 20,
      みのまもり: 7,
      すばやさ: 12,
      かしこさ: 3
    },
    equipmentStats: {
      Power: 5,
      Defense: 3,
      Agi: 2,
      Int: 0
    },
    equipment: {
      RightHand: { customData: { Category: 'Weapon', ManifestWeaponType: 'sword' } }
    }
  });
  const lowLevel = makeJapaneseStatFighter(1);
  const highLevel = makeJapaneseStatFighter(50);
  const defender = createCombatant({
    id: 'defender',
    stats: {
      DisplayName: 'Defender',
      Level: 10,
      HP: 100,
      MaxHP: 100,
      CurrentHP: 100,
      みのまもり: 10,
      すばやさ: 1
    },
    equipmentStats: { Power: 0, Defense: 2, Agi: 0 },
    equipment: {
      RightHand: { customData: { Category: 'Weapon', ManifestWeaponType: 'blunt' } }
    }
  });

  expect(getCombatantStatSummary(lowLevel)).toEqual({
    attack: 25,
    defense: 10,
    baseSpeed: 17,
    effectiveSpeed: 17,
    parryRate: 0,
    parryCharges: 0
  });
  expect(getCombatantStatSummary(highLevel)).toEqual(getCombatantStatSummary(lowLevel));
  expect(getCombatantStatSummary(defender).defense).toBe(12);
  expect(calculatePhysicalDamage(lowLevel, defender, null, { power: 100 })).toBe(18);
});

test('shield parry blocks limited incoming hits without adding defense', async () => {
  const attacker = makeFighter({
    id: 'attacker',
    name: 'Attacker',
    hp: 200,
    strength: 30,
    power: 30,
    speed: 20,
    weapon: 'sword'
  });
  const defender = makeFighter({
    id: 'shield-user',
    name: 'Shield',
    hp: 80,
    strength: 1,
    power: 1,
    guard: 0,
    defense: 0,
    speed: 1,
    weapon: 'shield'
  });
  defender.equipmentStats.ParryRate = 80;
  defender.equipmentStats.ParryCharges = 1;

  const result = await runDirectBattle(attacker, defender, {
    diceRolls: [1, 6, 2, 6],
    maxRounds: 2
  });
  const firstAttack = timelineFor(result, 'attacker', 1)[0];
  const secondAttack = timelineFor(result, 'attacker', 2)[0];

  expect(result.logs.join('\n')).toContain('Shield は盾で斬撃をパリイ（残り0回）');
  expect(firstAttack).toMatchObject({
    parried: true,
    parryCount: 1,
    damage: 0,
    defenderHpBefore: 80,
    defenderHpAfter: 80
  });
  expect(firstAttack.statusChanges).toContainEqual({
    target: 'target',
    key: 'parryCharges',
    before: 1,
    after: 0
  });
  expect(secondAttack.parried).toBe(false);
  expect(secondAttack.damage).toBeGreaterThan(0);
  expect(defender.stats.CurrentHP).toBeLessThan(80);
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
    action: expect.objectContaining({
      cardName: 'カップ4',
      name: 'ぬかるみ',
      suit: 'cup',
      rank: 4
    })
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

test('minor arcana attacks apply suit element affinity against defender nation', async () => {
  const runFireMinorAgainst = async (nation) => {
    const suffix = nation || 'none';
    const attacker = makeFighter({
      id: `fire-attacker-${suffix}`,
      name: 'Fire Minor',
      hp: 500,
      speed: 20,
      strength: 100,
      power: 0,
      tarotBattleDeck: [{ ...minor('minor-wand-2'), accuracy: 100, effectCodes: [] }]
    });
    const defender = makeFighter({
      id: `defender-${suffix}`,
      name: `Defender ${suffix}`,
      hp: 500,
      speed: 1,
      strength: 1,
      power: 0,
      guard: 0,
      defense: 0,
      weapon: 'blunt',
      ...(nation ? { nation } : {})
    });
    const result = await runDirectBattle(attacker, defender, { diceRolls: [2, 6], maxRounds: 1 });
    return {
      result,
      defenderId: defender.id,
      entry: timelineFor(result, attacker.id, 2)[0]
    };
  };

  const wind = await runFireMinorAgainst('wind');
  const water = await runFireMinorAgainst('water');
  const fire = await runFireMinorAgainst('fire');
  const none = await runFireMinorAgainst(null);

  expect(wind.entry).toMatchObject({
    damage: 100,
    attackElementKey: 'fire',
    defenderElementKey: 'wind',
    elementalRelation: 'weak',
    elementalMultiplier: 1.25,
    elementalLabel: 'WEAK!',
    action: expect.objectContaining({ source: 'minor', elementKey: 'fire' })
  });
  expect(combatantSetup(wind.result, wind.defenderId)).toMatchObject({
    elementKey: 'wind',
    elementLabel: expect.any(String)
  });
  expect(water.entry).toMatchObject({
    damage: 60,
    attackElementKey: 'fire',
    defenderElementKey: 'water',
    elementalRelation: 'resist',
    elementalMultiplier: 0.75,
    elementalLabel: 'RESIST...'
  });
  expect(fire.entry).toMatchObject({
    damage: 80,
    attackElementKey: 'fire',
    defenderElementKey: 'fire',
    elementalRelation: 'neutral',
    elementalMultiplier: 1,
    elementalLabel: ''
  });
  expect(none.entry).toMatchObject({
    damage: 80,
    attackElementKey: 'fire',
    defenderElementKey: 'none',
    elementalRelation: 'none',
    elementalMultiplier: 1,
    elementalLabel: ''
  });
  expect(wind.result.logs.join('\n')).toContain('WEAK!');
  expect(water.result.logs.join('\n')).toContain('RESIST...');
});

test('weapon fire forms and support minor arcana do not use elemental affinity', async () => {
  const wandUser = makeFighter({
    id: 'wand-user',
    name: 'Wand',
    hp: 500,
    speed: 20,
    strength: 100,
    power: 0,
    weapon: 'wand'
  });
  const windDefender = makeFighter({
    id: 'wind-defender',
    name: 'Wind Defender',
    hp: 500,
    speed: 1,
    strength: 1,
    power: 0,
    guard: 0,
    defense: 0,
    weapon: 'blunt',
    nation: 'wind'
  });
  const weaponResult = await runDirectBattle(wandUser, windDefender, { diceRolls: [1, 6], maxRounds: 1 });
  const weaponEntry = timelineFor(weaponResult, 'wand-user', 1)[0];

  expect(weaponEntry).toMatchObject({
    resultType: 'weaponForm',
    damage: 80,
    attackElementKey: 'none',
    defenderElementKey: 'wind',
    elementalRelation: 'none',
    elementalMultiplier: 1,
    elementalLabel: '',
    action: expect.objectContaining({ source: 'weapon', elementKey: 'fire' })
  });
  expect(weaponResult.logs.join('\n')).not.toContain('WEAK!');

  const healer = makeFighter({
    id: 'healer',
    name: 'Healer',
    hp: 100,
    currentHp: 80,
    speed: 20,
    strength: 100,
    power: 0,
    tarotBattleDeck: [minor('minor-cup-2'), minor('minor-cup-3')]
  });
  const fireDefender = makeFighter({
    id: 'fire-defender',
    name: 'Fire Defender',
    hp: 500,
    speed: 1,
    strength: 1,
    power: 0,
    guard: 0,
    defense: 0,
    weapon: 'blunt',
    nation: 'fire'
  });
  const supportResult = await runDirectBattle(healer, fireDefender, { diceRolls: [3, 6], maxRounds: 1 });
  const supportEntry = timelineFor(supportResult, 'healer', 3)[0];

  expect(supportEntry).toMatchObject({
    resultType: 'minorArcana',
    damage: 0,
    attackElementKey: 'none',
    defenderElementKey: 'fire',
    elementalRelation: 'none',
    elementalMultiplier: 1,
    elementalLabel: '',
    action: expect.objectContaining({ source: 'minor', kind: 'support', elementKey: 'water' })
  });
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
