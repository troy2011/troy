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
