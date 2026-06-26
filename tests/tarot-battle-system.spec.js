const { test, expect } = require('@playwright/test');

function makeFighter(overrides = {}) {
  return {
    id: overrides.id || 'fighter',
    stats: {
      DisplayName: overrides.name || overrides.id || 'Fighter',
      Level: overrides.level || 8,
      HP: overrides.hp || 120,
      MaxHP: overrides.hp || 120,
      CurrentHP: overrides.currentHp || overrides.hp || 120,
      MP: overrides.mp || 0,
      MaxMP: overrides.mp || 0,
      CurrentMP: overrides.mp || 0,
      ちから: overrides.strength || 12,
      みのまもり: overrides.guard || 0,
      すばやさ: overrides.speed || 10,
      かしこさ: overrides.intelligence || 0,
      Power: overrides.strength || 12,
      Defense: overrides.guard || 0,
      Agi: overrides.speed || 10,
      Int: overrides.intelligence || 0
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
    skills: [],
    tarotBattleDeck: overrides.tarotBattleDeck || [],
    tarotMeleeRole: overrides.tarotMeleeRole || null,
    tarotRolePassive: overrides.tarotRolePassive || null
  };
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

test('tarot battle skill data resolves catalog ids and cooldowns', () => {
  const {
    jsonCardIdToItemId,
    resolveTarotBattleSkill
  } = require('../server/tarotBattleSkills');

  expect(jsonCardIdToItemId('MAJOR_04')).toBe('arcana-4');
  expect(jsonCardIdToItemId('SWORD_09')).toBe('minor-sword-9');
  expect(resolveTarotBattleSkill('arcana-4')?.skillName).toBe('王の砲撃');
  expect(resolveTarotBattleSkill('minor-sword-9')?.cooldown).toBeGreaterThan(0);
});

test('public tarot battle skill payload keeps UI summary fields', () => {
  const { getPublicTarotBattleSkills } = require('../server/tarotBattleSkills');
  const skills = getPublicTarotBattleSkills();
  const emperor = skills.find((skill) => skill.itemId === 'arcana-4');
  const swordNine = skills.find((skill) => skill.itemId === 'minor-sword-9');

  expect(emperor).toMatchObject({
    itemId: 'arcana-4',
    skillName: '王の砲撃',
    cooldown: expect.any(Number),
    effectClass: expect.any(String),
    element: expect.any(String)
  });
  expect(swordNine).toMatchObject({
    itemId: 'minor-sword-9',
    cooldown: expect.any(Number)
  });
});

test('tarot role passives use percentage battle effects', () => {
  const { getTarotRolePassive } = require('../server/tarotRoles');

  expect(getTarotRolePassive({ key: 'OnePair', label: 'ワンペア' }).hpRate).toBeCloseTo(0.1);
  expect(getTarotRolePassive({ key: 'FourKind', label: 'フォーカード' }).criticalRateBonus).toBeCloseTo(0.1);
  expect(getTarotRolePassive({ key: 'RoyalFlush', label: 'ロイヤルフラッシュ' }).startingShieldRate).toBeCloseTo(0.2);
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

test('runBattle uses tarot cards in deck order with cooldown turns between them', async () => {
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  try {
    await withBattleRoutes(async (battleRoutes) => {
      const player = makeFighter({
        id: 'player-a',
        name: 'A',
        hp: 160,
        power: 2,
        tarotBattleDeck: [
          { cardName: '一枚目', skillName: '赤の斬撃', effectClass: '攻撃', damageTier: '小', element: '火', elementKey: 'fire', cooldown: 1 },
          { cardName: '二枚目', skillName: '青の斬撃', effectClass: '攻撃', damageTier: '小', element: '水', elementKey: 'water', cooldown: 1 }
        ]
      });
      const defender = makeFighter({
        id: 'boss-b',
        name: 'B',
        hp: 400,
        power: 0,
        strength: 1,
        speed: 10,
        weapon: 'blunt'
      });

      const result = await battleRoutes.runBattle(player, defender);
      const firstIndex = result.logs.findIndex((line) => line.includes('一枚目 / 赤の斬撃'));
      const secondIndex = result.logs.findIndex((line) => line.includes('二枚目 / 青の斬撃'));

      expect(firstIndex).toBeGreaterThan(-1);
      expect(secondIndex).toBeGreaterThan(firstIndex);
      expect(result.logs.slice(firstIndex + 1, secondIndex).some((line) => line.includes('A のこうげき'))).toBe(true);
      expect(result.logs[firstIndex + 1]).toContain('B');
    });
  } finally {
    Math.random = originalRandom;
  }
});

test('royal flush passive grants a shield that absorbs damage before HP', async () => {
  const originalRandom = Math.random;
  Math.random = () => 0.99;
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
