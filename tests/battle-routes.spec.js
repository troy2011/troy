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
    expect(registeredPosts).toContain('/api/exploration/npc-battle');
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

test('player full profile converts shield defense into parry stats', async () => {
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
          { StackId: 'shield-stack', Id: 'shield_09' },
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
        armor_01: { Category: 'Armor', Defense: 10, DisplayName: '革鎧' }
      },
      {},
      (id) => id,
      { VIRTUAL_CURRENCY_CODE: 'PS', LEADERBOARD_NAME: 'ps_ranking', BATTLE_REWARD_POINTS: 0 },
      {}
    );

    const profile = await battleRoutes.getPlayerFullProfile('PF_SHIELD');
    expect(profile.equipmentStats.Defense).toBe(10);
    expect(profile.equipmentStats.ParryRate).toBeCloseTo(0.216);
    expect(profile.equipmentStats.ParryCharges).toBe(2);
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

test('retired exploration npc battle rejects new legacy battle starts', async () => {
  const adminPath = require.resolve('firebase-admin');
  const playfabPath = require.resolve('../server/playfab');
  const battleRoutesPath = require.resolve('../server/routes/battleRoutes');
  const originalAdminCache = require.cache[adminPath];
  const originalPlayfabCache = require.cache[playfabPath];
  const originalRandom = Math.random;

  const writtenStates = {};
  const refs = new Map();
  const createRef = (path) => {
    const ref = {
      key: path.split('/').pop(),
      child(childPath) {
        return createRef(`${path}/${childPath}`);
      },
      push() {
        const key = `push_${refs.size + 1}`;
        return createRef(path ? `${path}/${key}` : key);
      },
      async set(value) {
        const findUndefined = (node, trail = '') => {
          if (node === undefined) return trail || '<root>';
          if (!node || typeof node !== 'object') return '';
          for (const [key, child] of Object.entries(node)) {
            const found = findUndefined(child, trail ? `${trail}.${key}` : key);
            if (found) return found;
          }
          return '';
        };
        const undefinedPath = findUndefined(value);
        if (undefinedPath) throw new Error(`set failed: value argument contains undefined in property '${path}.${undefinedPath}'`);
        writtenStates[path] = value;
      },
      async once() {
        return { val: () => writtenStates[path] || null };
      },
      on() {},
      off() {}
    };
    refs.set(path, ref);
    return ref;
  };

  const fakeDatabase = () => ({
    ref(path = '') {
      return createRef(path);
    }
  });
  fakeDatabase.ServerValue = { TIMESTAMP: 1 };
  const fakeFirestore = () => ({
    collection: () => ({
      doc: () => ({
        async get() {
          return { exists: false, data: () => ({}) };
        },
        collection: () => ({
          async add() {},
          doc: () => ({
            async set() {}
          })
        }),
        async set() {},
        async update() {
          return {};
        }
      })
    })
  });
  fakeFirestore.FieldValue = { serverTimestamp: () => 1 };
  require.cache[adminPath] = {
    id: adminPath,
    filename: adminPath,
    loaded: true,
    exports: {
      database: fakeDatabase,
      firestore: fakeFirestore
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
    GetPlayerProfile: Symbol('GetPlayerProfile'),
    UpdatePlayerStatistics: Symbol('UpdatePlayerStatistics')
  };
  const PlayFabEconomy = {
    GetInventoryItems: Symbol('GetInventoryItems')
  };
  const promisifyPlayFab = async (fn, body = {}) => {
    if (fn === PlayFabServer.GetPlayerStatistics) {
      return {
        Statistics: [
          { StatisticName: 'Level', Value: 8 },
          { StatisticName: 'HP', Value: 120 },
          { StatisticName: 'MP', Value: 30 },
          { StatisticName: 'MaxHP', Value: 120 },
          { StatisticName: 'MaxMP', Value: 30 },
          { StatisticName: 'ちから', Value: 60 },
          { StatisticName: 'みのまもり', Value: 40 },
          { StatisticName: 'すばやさ', Value: 30 },
          { StatisticName: 'かしこさ', Value: 20 }
        ]
      };
    }
    if (fn === PlayFabServer.GetUserReadOnlyData) {
      if (Array.isArray(body.Keys) && body.Keys.includes('ActiveShipId')) {
        return { Data: { ActiveShipId: { Value: 'ship-active' } } };
      }
      if (Array.isArray(body.Keys) && body.Keys.includes('Ship_ship-active')) {
        return { Data: { 'Ship_ship-active': { Value: JSON.stringify({ ItemId: 'guild_ship', ShipClass: 'guild', CrewCapacity: 1 }) } } };
      }
      return { Data: {} };
    }
    if (fn === PlayFabServer.GetPlayerProfile) {
      return {
        PlayerProfile: {
          DisplayName: 'Tester',
          Entity: { Id: 'entity-player', Type: 'title_player_account' }
        }
      };
    }
    if (fn === PlayFabEconomy.GetInventoryItems) {
      return { Items: [] };
    }
    if (fn === PlayFabServer.UpdatePlayerStatistics) {
      return {};
    }
    return {};
  };

  try {
    const battleRoutes = require('../server/routes/battleRoutes');
    const posts = new Map();
    battleRoutes.initializeBattleRoutes(
      { post(path, handler) { posts.set(path, handler); },
        locals: { respawnShip: async () => null } },
      promisifyPlayFab,
      PlayFabServer,
      {},
      PlayFabEconomy,
      { pushMessage: async () => null },
      {},
      {},
      (id) => id,
      { VIRTUAL_CURRENCY_CODE: 'PS', LEADERBOARD_NAME: 'ps_ranking', BATTLE_REWARD_POINTS: 0 },
      { requireAuthenticatedPlayFabId: async (_req, _res, id) => id }
    );

    Math.random = () => 0.99;
    const handler = posts.get('/api/exploration/npc-battle');
    expect(handler).toBeTruthy();
    let statusCode = 200;
    let body = null;
    await handler(
      {
        body: {
          playFabId: 'PF_PLAYER',
          requestId: 'speed-regression',
          navalOpponentId: 'npc_exploration_naval_speed',
          opponentShipProfile: { itemId: 'guild_ship', shipClass: 'guild', stage: 3 },
          battleContext: {
            navalBoardingState: {
              player: { morale: 0, crewHpPercent: 100, crewMpPercent: 100, statuses: {} },
              enemy: { morale: 0, crewHpPercent: 100, crewMpPercent: 100, statuses: {} }
            }
          }
        }
      },
      {
        status(code) {
          statusCode = code;
          return this;
        },
        json(payload) {
          body = payload;
        }
      }
    );

    expect(statusCode).toBe(410);
    expect(body).toMatchObject({
      code: 'LEGACY_BATTLE_RETIRED'
    });
    expect(Object.keys(writtenStates).filter((path) => path.startsWith('battles/'))).toHaveLength(0);
  } finally {
    Math.random = originalRandom;
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
