const { test, expect } = require('@playwright/test');
const { buildPublicProfileShip, initializeInventoryRoutes } = require('../server/inventory');

const getUserReadOnlyDataApi = function getUserReadOnlyDataApi() {};
const updateUserReadOnlyDataApi = function updateUserReadOnlyDataApi() {};
const updatePlayerStatisticsApi = function updatePlayerStatisticsApi() {};

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function makeEquipHarness({ readOnlyData = {}, inventoryItems = [] } = {}) {
  const routes = new Map();
  const updates = [];
  const app = {
    post(path, handler) {
      routes.set(path, handler);
    }
  };

  initializeInventoryRoutes(app, {
    PlayFabServer: {
      GetUserReadOnlyData: getUserReadOnlyDataApi,
      UpdateUserReadOnlyData: updateUserReadOnlyDataApi
    },
    promisifyPlayFab: async (apiFunction, request) => {
      if (apiFunction === getUserReadOnlyDataApi) {
        return { Data: readOnlyData };
      }
      if (apiFunction === updateUserReadOnlyDataApi) {
        updates.push(request);
        return {};
      }
      throw new Error('Unexpected PlayFab API call');
    },
    catalogCache: {
      sword_001: { Category: 'Weapon', DisplayName: 'Test Sword' }
    },
    getEntityKeyForPlayFabId: async () => ({ Id: 'ENTITY1', Type: 'title_player_account' }),
    getAllInventoryItems: async () => inventoryItems,
    getVirtualCurrencyMap: () => ({}),
    requireAuthenticatedPlayFabId: async (_req, _res, playFabId) => playFabId
  });

  return {
    handler: routes.get('/api/equip-item'),
    updates
  };
}

function makeSellHarness({ readOnlyData = {}, inventoryItems = [] } = {}) {
  const routes = new Map();
  const economyAdds = [];
  const economySubtracts = [];
  const statisticUpdates = [];
  const app = {
    post(path, handler) {
      routes.set(path, handler);
    }
  };

  initializeInventoryRoutes(app, {
    PlayFabServer: {
      GetUserReadOnlyData: getUserReadOnlyDataApi,
      UpdatePlayerStatistics: updatePlayerStatisticsApi
    },
    promisifyPlayFab: async (apiFunction, request) => {
      if (apiFunction === getUserReadOnlyDataApi) {
        return { Data: readOnlyData };
      }
      if (apiFunction === updatePlayerStatisticsApi) {
        statisticUpdates.push(request);
        return {};
      }
      throw new Error('Unexpected PlayFab API call');
    },
    catalogCache: {
      junk_001: { Category: 'Consumable', DisplayName: 'Junk' },
      potion_001: { Category: 'Consumable', DisplayName: 'Potion' },
      sword_001: { Category: 'Weapon', DisplayName: 'Test Sword' }
    },
    getEntityKeyForPlayFabId: async () => ({ Id: 'ENTITY1', Type: 'title_player_account' }),
    getAllInventoryItems: async () => inventoryItems,
    getVirtualCurrencyMap: () => ({}),
    addEconomyItem: async (playFabId, itemId, amount) => {
      economyAdds.push({ playFabId, itemId, amount });
    },
    subtractEconomyItem: async (playFabId, itemId, amount) => {
      economySubtracts.push({ playFabId, itemId, amount });
    },
    getCurrencyBalance: async () => 103,
    requireAuthenticatedPlayFabId: async (_req, _res, playFabId) => playFabId
  });

  return {
    handler: routes.get('/api/sell-items'),
    economyAdds,
    economySubtracts,
    statisticUpdates
  };
}

test('public profile ship resolves the king nation guild ship instead of the personal boat', () => {
  const ship = buildPublicProfileShip(
    { shipId: 'KING1', name: 'ボート', form: 'boat', stage: 1 },
    {
      shipOwnerPlayFabId: 'KING1',
      isSharedShip: false,
      isGuildShip: true,
      isNationGuild: true,
      guildType: 'nation',
      guildId: 'nation-fire-group',
      guildName: '火の王直属ギルド',
      guildShipId: 'guild_ship_nation-fire-group',
      kingShipName: '火の王の船',
      nationKey: 'fire',
      sailColor: 'red',
      appearance: { color: 'red' }
    },
    { stage: 3, level: 8, displayName: '火の王直属ギルド号' }
  );

  expect(ship).toMatchObject({
    shipId: 'guild_ship_nation-fire-group',
    name: '火の王の船',
    form: 'guild',
    itemId: 'guild_ship',
    stage: 3,
    level: 8,
    isGuildShip: true,
    isNationGuild: true,
    kingShipName: '火の王の船',
    sailColor: 'red'
  });
});

test('equip-item rejects using one owned one-handed weapon in both hands', async () => {
  const { handler, updates } = makeEquipHarness({
    readOnlyData: {
      Equipped_RightHand: { Value: 'sword_001' }
    },
    inventoryItems: [
      { Id: 'sword_001', Amount: 1 }
    ]
  });
  const res = makeResponse();

  await handler({ body: { playFabId: 'PF_PLAYWRIGHT', itemId: 'sword_001', slot: 'LeftHand' } }, res);

  expect(res.statusCode).toBe(400);
  expect(res.body).toMatchObject({
    error: '同じ片手武器を両手に装備するには2本必要です。'
  });
  expect(updates).toHaveLength(0);
});

test('equip-item allows matching one-handed weapons in both hands when two are owned', async () => {
  const { handler, updates } = makeEquipHarness({
    readOnlyData: {
      Equipped_RightHand: { Value: 'sword_001' }
    },
    inventoryItems: [
      { Id: 'sword_001', Amount: 2 }
    ]
  });
  const res = makeResponse();

  await handler({ body: { playFabId: 'PF_PLAYWRIGHT', itemId: 'sword_001', slot: 'LeftHand' } }, res);

  expect(res.statusCode).toBe(200);
  expect(res.body).toMatchObject({ status: 'success', equippedItem: 'sword_001' });
  expect(updates).toHaveLength(1);
  expect(updates[0]).toMatchObject({
    PlayFabId: 'PF_PLAYWRIGHT',
    Data: {
      Equipped_LeftHand: 'sword_001'
    }
  });
});

test('sell-items sells multiple selected item copies for one gold each', async () => {
  const { handler, economyAdds, economySubtracts, statisticUpdates } = makeSellHarness({
    inventoryItems: [
      { Id: 'junk_001', Amount: 2 },
      { Id: 'potion_001', Amount: 1 }
    ]
  });
  const res = makeResponse();

  await handler({
    body: {
      playFabId: 'PF_PLAYWRIGHT',
      items: [
        { itemId: 'junk_001', amount: 2 },
        { itemId: 'potion_001', amount: 1 }
      ]
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(res.body).toMatchObject({
    status: 'success',
    soldCount: 3,
    totalGold: 3,
    newBalance: 103
  });
  expect(economySubtracts).toEqual([
    { playFabId: 'PF_PLAYWRIGHT', itemId: 'junk_001', amount: 2 },
    { playFabId: 'PF_PLAYWRIGHT', itemId: 'potion_001', amount: 1 }
  ]);
  expect(economyAdds).toEqual([
    { playFabId: 'PF_PLAYWRIGHT', itemId: 'PS', amount: 3 }
  ]);
  expect(statisticUpdates).toHaveLength(1);
});

test('sell-items rejects selling the last equipped item copy', async () => {
  const { handler, economyAdds, economySubtracts } = makeSellHarness({
    readOnlyData: {
      Equipped_RightHand: { Value: 'sword_001' }
    },
    inventoryItems: [
      { Id: 'sword_001', Amount: 1 }
    ]
  });
  const res = makeResponse();

  await handler({
    body: {
      playFabId: 'PF_PLAYWRIGHT',
      items: [{ itemId: 'sword_001', amount: 1 }]
    }
  }, res);

  expect(res.statusCode).toBe(400);
  expect(res.body).toMatchObject({
    error: 'Test Swordは売却できる所持数が足りません。'
  });
  expect(economySubtracts).toHaveLength(0);
  expect(economyAdds).toHaveLength(0);
});

test('sell-items allows selling a spare copy while one matching item is equipped', async () => {
  const { handler, economyAdds, economySubtracts } = makeSellHarness({
    readOnlyData: {
      Equipped_RightHand: { Value: 'sword_001' }
    },
    inventoryItems: [
      { Id: 'sword_001', Amount: 2 }
    ]
  });
  const res = makeResponse();

  await handler({
    body: {
      playFabId: 'PF_PLAYWRIGHT',
      items: [{ itemId: 'sword_001', amount: 1 }]
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(res.body).toMatchObject({
    soldCount: 1,
    totalGold: 1
  });
  expect(economySubtracts).toEqual([
    { playFabId: 'PF_PLAYWRIGHT', itemId: 'sword_001', amount: 1 }
  ]);
  expect(economyAdds).toEqual([
    { playFabId: 'PF_PLAYWRIGHT', itemId: 'PS', amount: 1 }
  ]);
});
