const { test, expect } = require('@playwright/test');

test('battle route initializer wires shared runBattle dependencies', async () => {
  const adminPath = require.resolve('firebase-admin');
  const battleRoutesPath = require.resolve('../server/routes/battleRoutes');
  const originalAdminCache = require.cache[adminPath];
  const originalRandom = Math.random;

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
    const registeredPosts = [];
    battleRoutes.initializeBattleRoutes(
      { post(path) { registeredPosts.push(path); } },
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
    expect(registeredPosts).not.toContain('/api/exploration/npc-battle');
    expect(registeredPosts).toContain('/api/start-battle');
    expect(registeredPosts).toContain('/api/start-island-capture-battle');
    expect(registeredPosts).toContain('/api/start-capital-capture-battle');

    Math.random = () => 0.99;
    const result = await battleRoutes.runBattle(
      {
        id: 'player-a',
        stats: { DisplayName: 'A', Level: 10, CurrentHP: 50, MaxHP: 50, HP: 50, MP: 0, CurrentMP: 0, MaxMP: 0, ちから: 20, みのまもり: 0, すばやさ: 10, かしこさ: 0 },
        equipmentStats: { Power: 50, Defense: 0 },
        equipment: { RightHand: { customData: { Category: 'Weapon', ManifestWeaponType: 'sword' } } },
        skills: []
      },
      {
        id: 'boss-b',
        stats: { DisplayName: 'B', Level: 1, CurrentHP: 5, MaxHP: 5, HP: 5, MP: 0, CurrentMP: 0, MaxMP: 0, ちから: 1, みのまもり: 0, すばやさ: 1, かしこさ: 0 },
        equipmentStats: { Power: 1, Defense: 0 },
        equipment: { RightHand: { customData: { Category: 'Weapon', ManifestWeaponType: 'blunt' } } },
        skills: []
      }
    );

    expect(result?.winner?.id).toBe('player-a');
    expect(Array.isArray(result?.logs)).toBe(true);
  } finally {
    Math.random = originalRandom;
    delete require.cache[battleRoutesPath];
    if (originalAdminCache) {
      require.cache[adminPath] = originalAdminCache;
    } else {
      delete require.cache[adminPath];
    }
  }
});
test('player full profile converts dual enhanced shields into parry stats', async () => {
  const adminPath = require.resolve('firebase-admin');
  const playfabPath = require.resolve('../server/playfab');
  const battleRoutesPath = require.resolve('../server/routes/battleRoutes');
  const originalAdminCache = require.cache[adminPath];
  const originalPlayfabCache = require.cache[playfabPath];

  require.cache[adminPath] = {
    id: adminPath,
    filename: adminPath,
    loaded: true,
    exports: {
      database: () => ({}),
      firestore: () => ({})
    }
  };
  require.cache[playfabPath] = {
    id: playfabPath,
    filename: playfabPath,
    loaded: true,
    exports: {
      getEntityKeyFromPlayFabId: async () => ({ Id: 'entity-player', Type: 'title_player_account' }),
      withTitleEntityToken: async (fn) => fn()
    }
  };
  delete require.cache[battleRoutesPath];

  const PlayFabServer = {
    GetPlayerStatistics: Symbol('GetPlayerStatistics'),
    GetUserReadOnlyData: Symbol('GetUserReadOnlyData'),
    GetPlayerProfile: Symbol('GetPlayerProfile')
  };
  const PlayFabEconomy = {
    GetInventoryItems: Symbol('GetInventoryItems')
  };
  const promisifyPlayFab = async (fn) => {
    if (fn === PlayFabServer.GetPlayerStatistics) {
      return {
        Statistics: [
          { StatisticName: 'HP', Value: 100 },
          { StatisticName: 'MP', Value: 20 },
          { StatisticName: 'ちから', Value: 12 },
          { StatisticName: 'みのまもり', Value: 5 },
          { StatisticName: 'すばやさ', Value: 8 }
        ]
      };
    }
    if (fn === PlayFabServer.GetUserReadOnlyData) {
      return {
        Data: {
          Equipped_RightHand: { Value: 'shield-right-stack' },
          Equipped_LeftHand: { Value: 'shield-stack' },
          Equipped_Armor: { Value: 'armor-stack' }
        }
      };
    }
    if (fn === PlayFabServer.GetPlayerProfile) {
      return {
        PlayerProfile: {
          DisplayName: 'Shield Tester',
          Entity: { Id: 'entity-player', Type: 'title_player_account' }
        }
      };
    }
    if (fn === PlayFabEconomy.GetInventoryItems) {
      return {
        Items: [
          { StackId: 'shield-right-stack', Id: 'shield_10' },
          {
            StackId: 'shield-stack',
            Id: 'shield_09',
            DisplayProperties: { equipmentEnhancement: { version: 1, bonus: 5 } }
          },
          { StackId: 'armor-stack', Id: 'armor_01' }
        ]
      };
    }
    return {};
  };

  try {
    const battleRoutes = require('../server/routes/battleRoutes');
    battleRoutes.initializeBattleRoutes(
      { post() {} },
      promisifyPlayFab,
      PlayFabServer,
      {},
      PlayFabEconomy,
      { pushMessage: async () => null },
      {
        shield_09: { Category: 'Shield', Defense: 24, DisplayName: '鉄縁の木盾' },
        shield_10: { Category: 'Shield', Defense: 10, DisplayName: '木の小盾' },
        armor_01: { Category: 'Armor', Defense: 10, DisplayName: '革鎧' }
      },
      {},
      (id) => id,
      { VIRTUAL_CURRENCY_CODE: 'PS', LEADERBOARD_NAME: 'ps_ranking', BATTLE_REWARD_POINTS: 0 },
      {}
    );

    const profile = await battleRoutes.getPlayerFullProfile('PF_SHIELD');
    expect(profile.equipmentStats.Defense).toBe(10);
    expect(profile.equipmentStats.ParryRate).toBeCloseTo(0.236);
    expect(profile.equipmentStats.ParryCharges).toBe(4);
  } finally {
    delete require.cache[battleRoutesPath];
    if (originalPlayfabCache) {
      require.cache[playfabPath] = originalPlayfabCache;
    } else {
      delete require.cache[playfabPath];
    }
    if (originalAdminCache) {
      require.cache[adminPath] = originalAdminCache;
    } else {
      delete require.cache[adminPath];
    }
  }
});
