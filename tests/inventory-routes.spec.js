const { test, expect } = require('@playwright/test');
const { buildPublicProfileShip, initializeInventoryRoutes } = require('../server/inventory');

const getUserReadOnlyDataApi = function getUserReadOnlyDataApi() {};
const updateUserReadOnlyDataApi = function updateUserReadOnlyDataApi() {};
const updatePlayerStatisticsApi = function updatePlayerStatisticsApi() {};
const getPlayerProfileApi = function getPlayerProfileApi() {};
const executeInventoryOperationsApi = function executeInventoryOperationsApi() {};

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

function makeEquipHarness({
  readOnlyData = {},
  inventoryItems = [],
  catalogCache = { sword_001: { Category: 'Weapon', DisplayName: 'Test Sword' } },
  updateDelayMs = 0
} = {}) {
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
        if (updateDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, updateDelayMs));
        }
        Object.entries(request.Data || {}).forEach(([key, value]) => {
          if (value === null) {
            delete readOnlyData[key];
          } else {
            readOnlyData[key] = { Value: value };
          }
        });
        return {};
      }
      throw new Error('Unexpected PlayFab API call');
    },
    catalogCache,
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

function makeSellHarness({ readOnlyData = {}, inventoryItems = [], executeInventoryOperationsImpl = null } = {}) {
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
      if (apiFunction === executeInventoryOperationsApi && typeof executeInventoryOperationsImpl === 'function') {
        return executeInventoryOperationsImpl(request);
      }
      throw new Error('Unexpected PlayFab API call');
    },
    PlayFabEconomy: executeInventoryOperationsImpl ? { ExecuteInventoryOperations: executeInventoryOperationsApi } : undefined,
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
    withTitleEntityToken: async (operation) => operation(),
    requireAuthenticatedPlayFabId: async (_req, _res, playFabId) => playFabId
  });

  return {
    handler: routes.get('/api/sell-items'),
    economyAdds,
    economySubtracts,
    statisticUpdates
  };
}

function makeMemoryFirestore(initialData = {}) {
  let autoId = 1;
  let transactionQueue = Promise.resolve();
  const stores = new Map(Object.entries(initialData).map(([name, docs]) => [
    name,
    new Map(Object.entries(docs || {}).map(([id, data]) => [id, { ...data }]))
  ]));
  const getStore = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  const makeDocRef = (collectionName, id = `doc-${autoId++}`) => ({
    id,
    async get() {
      const store = getStore(collectionName);
      const data = store.get(id);
      return { id, exists: !!data, data: () => ({ ...(data || {}) }) };
    },
    async set(data, options = {}) {
      const store = getStore(collectionName);
      const current = store.get(id) || {};
      store.set(id, options.merge ? { ...current, ...data } : { ...data });
    },
    async update(data) {
      const store = getStore(collectionName);
      const current = store.get(id) || {};
      store.set(id, { ...current, ...data });
    }
  });
  const makeQuery = (collectionName, filters = [], max = null) => ({
    where(field, operator, value) {
      return makeQuery(collectionName, [...filters, { field, operator, value }], max);
    },
    limit(value) {
      return makeQuery(collectionName, filters, value);
    },
    async get() {
      let entries = Array.from(getStore(collectionName).entries());
      filters.forEach((filter) => {
        if (filter.operator === '==') {
          entries = entries.filter(([, data]) => data?.[filter.field] === filter.value);
        }
      });
      if (Number.isFinite(max)) entries = entries.slice(0, max);
      return {
        docs: entries.map(([id, data]) => ({ id, exists: true, data: () => ({ ...data }) }))
      };
    }
  });
  const firestore = {
    collection(name) {
      return {
        doc(id) {
          return makeDocRef(name, id);
        },
        where(field, operator, value) {
          return makeQuery(name).where(field, operator, value);
        },
        limit(value) {
          return makeQuery(name).limit(value);
        }
      };
    },
    runTransaction(callback) {
      const run = transactionQueue.then(() => callback({
        get: (ref) => ref.get(),
        update: (ref, data) => ref.update(data),
        set: (ref, data, options) => ref.set(data, options)
      }));
      transactionQueue = run.catch(() => {});
      return run;
    },
    dump(name) {
      return Array.from(getStore(name).entries()).map(([id, data]) => ({ id, ...data }));
    }
  };
  return firestore;
}

function makeBlackMarketHarness({
  readOnlyData = {},
  inventoryItems = [],
  firestore = makeMemoryFirestore(),
  catalogCache = {
    potion_001: { Category: 'Consumable', DisplayName: 'Potion' },
    sword_001: { Category: 'Weapon', DisplayName: 'Test Sword' }
  },
  currencyBalance = 99,
  subtractError = null,
  addEconomyItemImpl = null,
  subtractEconomyItemImpl = null,
  executeInventoryOperationsImpl = null
} = {}) {
  const routes = new Map();
  const economyAdds = [];
  const economySubtracts = [];
  const app = {
    post(path, handler) {
      routes.set(path, handler);
    }
  };

  initializeInventoryRoutes(app, {
    PlayFabServer: {
      GetUserReadOnlyData: getUserReadOnlyDataApi,
      GetPlayerProfile: getPlayerProfileApi
    },
    promisifyPlayFab: async (apiFunction, request) => {
      if (apiFunction === getUserReadOnlyDataApi) {
        return { Data: readOnlyData };
      }
      if (apiFunction === getPlayerProfileApi) {
        return { PlayerProfile: { DisplayName: `${request.PlayFabId}-name` } };
      }
      if (apiFunction === executeInventoryOperationsApi && typeof executeInventoryOperationsImpl === 'function') {
        return executeInventoryOperationsImpl(request);
      }
      throw new Error('Unexpected PlayFab API call');
    },
    PlayFabEconomy: executeInventoryOperationsImpl ? { ExecuteInventoryOperations: executeInventoryOperationsApi } : undefined,
    firestore,
    catalogCache,
    getEntityKeyForPlayFabId: async () => ({ Id: 'ENTITY1', Type: 'title_player_account' }),
    getAllInventoryItems: async () => inventoryItems,
    getVirtualCurrencyMap: () => ({}),
    addEconomyItem: async (playFabId, itemId, amount, options) => {
      economyAdds.push({ playFabId, itemId, amount });
      if (typeof addEconomyItemImpl === 'function') {
        await addEconomyItemImpl(playFabId, itemId, amount, options);
      }
    },
    subtractEconomyItem: async (playFabId, itemId, amount, options) => {
      economySubtracts.push({ playFabId, itemId, amount });
      if (subtractError && itemId === 'PS') throw subtractError;
      if (typeof subtractEconomyItemImpl === 'function') {
        await subtractEconomyItemImpl(playFabId, itemId, amount, options);
      }
    },
    getCurrencyBalance: async () => currencyBalance,
    withTitleEntityToken: async (operation) => operation(),
    requireAuthenticatedPlayFabId: async (_req, _res, playFabId) => playFabId
  });

  return {
    routes,
    firestore,
    economyAdds,
    economySubtracts
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

test('equip-item rejects reusing one exact stack against a legacy opposite-hand reference', async () => {
  const { handler, updates } = makeEquipHarness({
    readOnlyData: {
      Equipped_LeftHand: { Value: 'sword_001' }
    },
    inventoryItems: [
      { Id: 'sword_001', StackId: 'only-sword-stack', Amount: 1 }
    ]
  });
  const res = makeResponse();
  await handler({
    body: {
      playFabId: 'PF_PLAYWRIGHT',
      itemId: 'sword_001',
      stackId: 'only-sword-stack',
      slot: 'RightHand'
    }
  }, res);

  expect(res.statusCode).toBe(400);
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

test('equip-item rejects using one owned shield in both hands', async () => {
  const { handler, updates } = makeEquipHarness({
    readOnlyData: {
      Equipped_LeftHand: { Value: 'shield_001' }
    },
    inventoryItems: [
      { Id: 'shield_001', Amount: 1 }
    ],
    catalogCache: {
      shield_001: { Category: 'Shield', DisplayName: 'Test Shield' }
    }
  });
  const res = makeResponse();

  await handler({ body: { playFabId: 'PF_PLAYWRIGHT', itemId: 'shield_001', slot: 'RightHand' } }, res);

  expect(res.statusCode).toBe(400);
  expect(res.body).toMatchObject({
    error: '同じ盾を両手に装備するには2個必要です。'
  });
  expect(updates).toHaveLength(0);
});

test('equip-item allows matching shields in both hands when two are owned', async () => {
  const { handler, updates } = makeEquipHarness({
    readOnlyData: {
      Equipped_LeftHand: { Value: 'shield_001' }
    },
    inventoryItems: [
      { Id: 'shield_001', Amount: 2 }
    ],
    catalogCache: {
      shield_001: { Category: 'Shield', DisplayName: 'Test Shield' }
    }
  });
  const res = makeResponse();

  await handler({ body: { playFabId: 'PF_PLAYWRIGHT', itemId: 'shield_001', slot: 'RightHand' } }, res);

  expect(res.statusCode).toBe(200);
  expect(updates).toHaveLength(1);
  expect(updates[0].Data).toMatchObject({
    Equipped_RightHand: 'shield_001'
  });
});

test('equip-item allows different items whose Economy stack ids are both default', async () => {
  const { handler, updates } = makeEquipHarness({
    readOnlyData: {
      Equipped_RightHand: { Value: JSON.stringify({ itemId: 'sword_001', stackId: 'default' }) }
    },
    inventoryItems: [
      { Id: 'sword_001', StackId: 'default', Amount: 1 },
      { Id: 'shield_001', StackId: 'default', Amount: 1 }
    ],
    catalogCache: {
      sword_001: { Category: 'Weapon', DisplayName: 'Test Sword' },
      shield_001: { Category: 'Shield', DisplayName: 'Test Shield' }
    }
  });
  const res = makeResponse();

  await handler({
    body: {
      playFabId: 'PF_PLAYWRIGHT',
      itemId: 'shield_001',
      stackId: 'default',
      slot: 'LeftHand'
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(updates).toHaveLength(1);
  expect(updates[0].Data).toMatchObject({
    Equipped_LeftHand: JSON.stringify({ itemId: 'shield_001', stackId: 'default' })
  });
});

test('equip-item moves a one-handed item between hands without unequipping it first', async () => {
  const { handler, updates } = makeEquipHarness({
    readOnlyData: {
      Equipped_RightHand: { Value: JSON.stringify({ itemId: 'sword_001', stackId: 'sword-stack-1' }) }
    },
    inventoryItems: [{ Id: 'sword_001', StackId: 'sword-stack-1', Amount: 1 }]
  });
  const res = makeResponse();

  await handler({
    body: {
      playFabId: 'PF_PLAYWRIGHT',
      itemId: 'sword_001',
      stackId: 'sword-stack-1',
      fromSlot: 'RightHand',
      slot: 'LeftHand'
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(updates).toHaveLength(1);
  expect(updates[0].Data).toMatchObject({
    Equipped_RightHand: null,
    Equipped_LeftHand: JSON.stringify({ itemId: 'sword_001', stackId: 'sword-stack-1' })
  });
});

test('equip-item rejects a hand move when the specified source no longer holds the item', async () => {
  const { handler, updates } = makeEquipHarness({
    readOnlyData: {
      Equipped_RightHand: { Value: JSON.stringify({ itemId: 'shield_001', stackId: 'shield-stack-1' }) }
    },
    inventoryItems: [
      { Id: 'sword_001', StackId: 'sword-stack-1', Amount: 1 },
      { Id: 'shield_001', StackId: 'shield-stack-1', Amount: 1 }
    ],
    catalogCache: {
      sword_001: { Category: 'Weapon', DisplayName: 'Test Sword' },
      shield_001: { Category: 'Shield', DisplayName: 'Test Shield' }
    }
  });
  const res = makeResponse();

  await handler({
    body: {
      playFabId: 'PF_PLAYWRIGHT',
      itemId: 'sword_001',
      stackId: 'sword-stack-1',
      fromSlot: 'RightHand',
      slot: 'LeftHand'
    }
  }, res);

  expect(res.statusCode).toBe(400);
  expect(res.body).toMatchObject({ error: '移動元に指定した装備がありません。' });
  expect(updates).toHaveLength(0);
});

test('equip-item serializes simultaneous hand changes so one item cannot reach both hands', async () => {
  const { handler, updates } = makeEquipHarness({
    inventoryItems: [{ Id: 'sword_001', StackId: 'sword-stack-1', Amount: 1 }],
    updateDelayMs: 30
  });
  const rightResponse = makeResponse();
  const leftResponse = makeResponse();

  await Promise.all([
    handler({ body: { playFabId: 'PF_PLAYWRIGHT', itemId: 'sword_001', stackId: 'sword-stack-1', slot: 'RightHand' } }, rightResponse),
    handler({ body: { playFabId: 'PF_PLAYWRIGHT', itemId: 'sword_001', stackId: 'sword-stack-1', slot: 'LeftHand' } }, leftResponse)
  ]);

  expect([rightResponse.statusCode, leftResponse.statusCode].sort()).toEqual([200, 400]);
  expect(updates).toHaveLength(1);
});

test('equip-item removes a current two-handed weapon when equipping the left hand', async () => {
  const { handler, updates } = makeEquipHarness({
    readOnlyData: {
      Equipped_RightHand: { Value: JSON.stringify({ itemId: 'polearm_001', stackId: 'default' }) }
    },
    inventoryItems: [
      { Id: 'polearm_001', StackId: 'default', Amount: 1 },
      { Id: 'shield_001', StackId: 'default', Amount: 1 }
    ],
    catalogCache: {
      polearm_001: { Category: 'Weapon', DisplayName: 'Test Polearm', TwoHanded: true },
      shield_001: { Category: 'Shield', DisplayName: 'Test Shield' }
    }
  });
  const res = makeResponse();

  await handler({
    body: {
      playFabId: 'PF_PLAYWRIGHT',
      itemId: 'shield_001',
      stackId: 'default',
      slot: 'LeftHand'
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(updates).toHaveLength(1);
  expect(updates[0].Data).toMatchObject({
    Equipped_RightHand: null,
    Equipped_LeftHand: JSON.stringify({ itemId: 'shield_001', stackId: 'default' })
  });
});

test('equip-item removes the current left hand when equipping a two-handed weapon', async () => {
  const { handler, updates } = makeEquipHarness({
    readOnlyData: {
      Equipped_LeftHand: { Value: JSON.stringify({ itemId: 'shield_001', stackId: 'default' }) }
    },
    inventoryItems: [
      { Id: 'polearm_001', StackId: 'default', Amount: 1 },
      { Id: 'shield_001', StackId: 'default', Amount: 1 }
    ],
    catalogCache: {
      polearm_001: { Category: 'Weapon', DisplayName: 'Test Polearm', TwoHanded: true },
      shield_001: { Category: 'Shield', DisplayName: 'Test Shield' }
    }
  });
  const res = makeResponse();

  await handler({
    body: {
      playFabId: 'PF_PLAYWRIGHT',
      itemId: 'polearm_001',
      stackId: 'default',
      slot: 'RightHand'
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(updates).toHaveLength(1);
  expect(updates[0].Data).toMatchObject({
    Equipped_RightHand: JSON.stringify({ itemId: 'polearm_001', stackId: 'default' }),
    Equipped_LeftHand: null
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

test('sell-items keeps an enhanced stack when selling a grouped unenhanced copy', async () => {
  const executeRequests = [];
  const { handler } = makeSellHarness({
    inventoryItems: [
      { Id: 'sword_001', StackId: 'plain-sword', Amount: 1 },
      {
        Id: 'sword_001',
        StackId: 'enhanced-sword',
        Amount: 1,
        DisplayProperties: { equipmentEnhancement: { version: 1, bonus: 4 } }
      }
    ],
    executeInventoryOperationsImpl: async (request) => {
      executeRequests.push(request);
      return {};
    }
  });
  const res = makeResponse();

  await handler({
    body: {
      playFabId: 'PF_PLAYWRIGHT',
      items: [{ itemId: 'sword_001', amount: 1 }]
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(executeRequests).toHaveLength(1);
  expect(executeRequests[0].Operations).toEqual([{
    Subtract: {
      Item: { Id: 'sword_001', StackId: 'plain-sword' },
      Amount: 1,
      DeleteEmptyStacks: true
    }
  }]);
});

test('black-market create lists one item and records first owner for equipment', async () => {
  const { routes, firestore, economySubtracts } = makeBlackMarketHarness({
    inventoryItems: [
      { Id: 'sword_001', Amount: 1 }
    ]
  });
  const res = makeResponse();

  await routes.get('/api/black-market/create')({
    body: {
      playFabId: 'PF_SELLER',
      itemId: 'sword_001',
      price: 77
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(res.body.listing).toMatchObject({
    sellerPlayFabId: 'PF_SELLER',
    itemId: 'sword_001',
    price: 77,
    status: 'active',
    originPlayFabId: 'PF_SELLER',
    originDisplayName: 'PF_SELLER-name'
  });
  expect(economySubtracts).toEqual([
    { playFabId: 'PF_SELLER', itemId: 'sword_001', amount: 1 }
  ]);
  expect(firestore.dump('black_market_listings')).toHaveLength(1);
});

test('black-market cancel restores the exact enhancement properties', async () => {
  const economyRequests = [];
  const { routes, firestore } = makeBlackMarketHarness({
    inventoryItems: [{
      Id: 'sword_001',
      StackId: 'enhanced-sword-stack',
      Amount: 1,
      DisplayProperties: { equipmentEnhancement: { version: 1, bonus: 6 } }
    }],
    catalogCache: {
      sword_001: { Category: 'Weapon', WeaponType: 'sword', DisplayName: 'Test Sword', Power: 10 }
    },
    executeInventoryOperationsImpl: async (request) => {
      economyRequests.push(request);
      return {};
    }
  });
  const createResponse = makeResponse();
  await routes.get('/api/black-market/create')({
    body: {
      playFabId: 'PF_SELLER',
      itemId: 'sword_001',
      stackId: 'enhanced-sword-stack',
      price: 77
    }
  }, createResponse);

  expect(createResponse.statusCode).toBe(200);
  const listing = firestore.dump('black_market_listings')[0];
  expect(listing.displayProperties).toMatchObject({
    equipmentEnhancement: { version: 1, bonus: 6 }
  });
  expect(listing.itemData.Power).toBe(16);
  expect(economyRequests[0].Operations[0].Subtract.Item).toEqual({
    Id: 'sword_001',
    StackId: 'enhanced-sword-stack'
  });

  const cancelResponse = makeResponse();
  await routes.get('/api/black-market/cancel')({
    body: { playFabId: 'PF_SELLER', listingId: listing.listingId }
  }, cancelResponse);
  expect(cancelResponse.statusCode).toBe(200);
  expect(economyRequests[1].Operations[0].Add.NewStackValues.DisplayProperties).toMatchObject({
    equipmentEnhancement: { version: 1, bonus: 6 }
  });
});

test('black-market create removes undefined catalog fields before Firestore storage', async () => {
  const { routes, firestore } = makeBlackMarketHarness({
    inventoryItems: [{ Id: 'sword_001', Amount: 1 }],
    catalogCache: {
      sword_001: {
        Category: 'Weapon',
        DisplayName: 'Test Sword',
        PriceOptions: undefined,
        DisplayProperties: {
          rarity: 'common',
          subtitle: undefined
        }
      }
    }
  });
  const res = makeResponse();

  await routes.get('/api/black-market/create')({
    body: {
      playFabId: 'PF_SELLER',
      itemId: 'sword_001',
      price: 10
    }
  }, res);

  expect(res.statusCode).toBe(200);
  const [listing] = firestore.dump('black_market_listings');
  expect(Object.hasOwn(listing.itemData, 'PriceOptions')).toBe(false);
  expect(listing.itemData.DisplayProperties).toEqual({ rarity: 'common' });
});

test('black-market create rejects the sixth active listing', async () => {
  const firestore = makeMemoryFirestore({
    black_market_listings: Object.fromEntries(Array.from({ length: 5 }, (_entry, index) => [`listing-${index}`, {
      listingId: `listing-${index}`,
      sellerPlayFabId: 'PF_SELLER',
      itemId: 'sword_001',
      itemName: 'Test Sword',
      price: 1,
      status: 'active',
      createdAtMs: index + 1
    }]))
  });
  const { routes, economySubtracts } = makeBlackMarketHarness({
    firestore,
    inventoryItems: [
      { Id: 'sword_001', Amount: 2 }
    ]
  });
  const res = makeResponse();

  await routes.get('/api/black-market/create')({
    body: {
      playFabId: 'PF_SELLER',
      itemId: 'sword_001',
      price: 1
    }
  }, res);

  expect(res.statusCode).toBe(400);
  expect(res.body.error).toContain('5');
  expect(economySubtracts).toHaveLength(0);
});

test('black-market create does not record first owner for consumables', async () => {
  const { routes } = makeBlackMarketHarness({
    inventoryItems: [
      { Id: 'potion_001', Amount: 1 }
    ]
  });
  const res = makeResponse();

  await routes.get('/api/black-market/create')({
    body: {
      playFabId: 'PF_SELLER',
      itemId: 'potion_001',
      price: 12
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(res.body.listing.originPlayFabId).toBe('');
});

test('black-market cancel returns item and preserves tracked origin', async () => {
  const firestore = makeMemoryFirestore({
    black_market_listings: {
      listing1: {
        listingId: 'listing1',
        sellerPlayFabId: 'PF_SELLER',
        sellerDisplayName: 'Seller',
        itemId: 'sword_001',
        itemName: 'Test Sword',
        price: 25,
        status: 'active',
        originPlayFabId: 'PF_ORIGIN',
        originDisplayName: 'Origin'
      }
    }
  });
  const { routes, economyAdds } = makeBlackMarketHarness({ firestore });
  const res = makeResponse();

  await routes.get('/api/black-market/cancel')({
    body: {
      playFabId: 'PF_SELLER',
      listingId: 'listing1'
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(economyAdds).toEqual([
    { playFabId: 'PF_SELLER', itemId: 'sword_001', amount: 1 }
  ]);
  expect(firestore.dump('black_market_item_origins')).toContainEqual(expect.objectContaining({
    ownerPlayFabId: 'PF_SELLER',
    itemId: 'sword_001',
    originPlayFabId: 'PF_ORIGIN',
    count: 1
  }));
  expect(firestore.dump('black_market_listings')[0]).toMatchObject({ status: 'cancelled' });
});

test('black-market buy rejects buying your own listing', async () => {
  const firestore = makeMemoryFirestore({
    black_market_listings: {
      listing1: {
        listingId: 'listing1',
        sellerPlayFabId: 'PF_SELLER',
        itemId: 'sword_001',
        itemName: 'Test Sword',
        price: 25,
        status: 'active'
      }
    }
  });
  const { routes, economyAdds, economySubtracts } = makeBlackMarketHarness({ firestore });
  const res = makeResponse();

  await routes.get('/api/black-market/buy')({
    body: {
      playFabId: 'PF_SELLER',
      listingId: 'listing1'
    }
  }, res);

  expect(res.statusCode).toBe(400);
  expect(economyAdds).toHaveLength(0);
  expect(economySubtracts).toHaveLength(0);
  expect(firestore.dump('black_market_listings')[0]).toMatchObject({ status: 'active' });
});

test('black-market buy transfers gold and item', async () => {
  const firestore = makeMemoryFirestore({
    black_market_listings: {
      listing1: {
        listingId: 'listing1',
        sellerPlayFabId: 'PF_SELLER',
        itemId: 'sword_001',
        itemName: 'Test Sword',
        price: 25,
        status: 'active',
        originPlayFabId: 'PF_ORIGIN',
        originDisplayName: 'Origin'
      }
    }
  });
  const { routes, economyAdds, economySubtracts } = makeBlackMarketHarness({ firestore, currencyBalance: 74 });
  const res = makeResponse();

  await routes.get('/api/black-market/buy')({
    body: {
      playFabId: 'PF_BUYER',
      listingId: 'listing1'
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(res.body.newBalance).toBe(74);
  expect(economySubtracts).toEqual([
    { playFabId: 'PF_BUYER', itemId: 'PS', amount: 25 }
  ]);
  expect(economyAdds).toEqual([
    { playFabId: 'PF_BUYER', itemId: 'sword_001', amount: 1 },
    { playFabId: 'PF_SELLER', itemId: 'PS', amount: 25 }
  ]);
  expect(firestore.dump('black_market_item_origins')).toContainEqual(expect.objectContaining({
    ownerPlayFabId: 'PF_BUYER',
    itemId: 'sword_001',
    originPlayFabId: 'PF_ORIGIN',
    count: 1
  }));
  expect(firestore.dump('black_market_listings')[0]).toMatchObject({
    status: 'sold',
    buyerPlayFabId: 'PF_BUYER',
    settlementStatus: 'settled'
  });
});

test('black-market buy preserves enhancement properties on the transferred stack', async () => {
  const firestore = makeMemoryFirestore({
    black_market_listings: {
      listing1: {
        listingId: 'listing1',
        sellerPlayFabId: 'PF_SELLER',
        itemId: 'sword_001',
        itemName: 'Test Sword +6',
        price: 25,
        status: 'active',
        displayProperties: { equipmentEnhancement: { version: 1, bonus: 6 } },
        originPlayFabId: 'PF_ORIGIN',
        originDisplayName: 'Origin'
      }
    }
  });
  const executeRequests = [];
  const { routes } = makeBlackMarketHarness({
    firestore,
    currencyBalance: 74,
    executeInventoryOperationsImpl: async (request) => {
      executeRequests.push(request);
      return {};
    }
  });
  const res = makeResponse();

  await routes.get('/api/black-market/buy')({
    body: { playFabId: 'PF_BUYER', listingId: 'listing1' }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(executeRequests).toHaveLength(1);
  expect(executeRequests[0].Operations[0].Add.NewStackValues.DisplayProperties).toMatchObject({
    equipmentEnhancement: { version: 1, bonus: 6 }
  });
});

test('black-market create rejects decimal prices', async () => {
  const { routes, economySubtracts } = makeBlackMarketHarness({
    inventoryItems: [{ Id: 'sword_001', Amount: 1 }]
  });
  const res = makeResponse();

  await routes.get('/api/black-market/create')({
    body: { playFabId: 'PF_SELLER', itemId: 'sword_001', price: 1.5 }
  }, res);

  expect(res.statusCode).toBe(400);
  expect(res.body.error).toContain('整数');
  expect(economySubtracts).toHaveLength(0);
});

test('black-market slot reservation prevents concurrent sixth listings', async () => {
  const firestore = makeMemoryFirestore({
    black_market_listings: Object.fromEntries(Array.from({ length: 4 }, (_entry, index) => [`listing-${index}`, {
      listingId: `listing-${index}`,
      sellerPlayFabId: 'PF_SELLER',
      itemId: 'sword_001',
      itemName: 'Test Sword',
      price: 1,
      status: 'active',
      createdAtMs: index + 1
    }]))
  });
  const { routes, economySubtracts } = makeBlackMarketHarness({
    firestore,
    inventoryItems: [{ Id: 'sword_001', Amount: 2 }]
  });
  const firstRes = makeResponse();
  const secondRes = makeResponse();
  const create = routes.get('/api/black-market/create');

  await Promise.all([
    create({ body: { playFabId: 'PF_SELLER', itemId: 'sword_001', price: 10 } }, firstRes),
    create({ body: { playFabId: 'PF_SELLER', itemId: 'sword_001', price: 11 } }, secondRes)
  ]);

  expect([firstRes.statusCode, secondRes.statusCode].sort()).toEqual([200, 400]);
  expect(economySubtracts).toHaveLength(1);
  expect(firestore.dump('black_market_listing_slots').filter((slot) => slot.status === 'occupied')).toHaveLength(5);
});

test('black-market list resumes a creating listing after a transient debit failure', async () => {
  let failDebit = true;
  const { routes, firestore, economySubtracts } = makeBlackMarketHarness({
    inventoryItems: [{ Id: 'sword_001', Amount: 1 }],
    subtractEconomyItemImpl: async (_playFabId, itemId) => {
      if (itemId === 'sword_001' && failDebit) {
        failDebit = false;
        throw new Error('temporary debit failure');
      }
    }
  });
  const createRes = makeResponse();

  await routes.get('/api/black-market/create')({
    body: { playFabId: 'PF_SELLER', itemId: 'sword_001', price: 20 }
  }, createRes);

  expect(createRes.statusCode).toBe(500);
  expect(firestore.dump('black_market_listings')[0]).toMatchObject({
    status: 'creating',
    itemDebited: false,
    settlementStatus: 'itemDebitPending'
  });

  const listRes = makeResponse();
  await routes.get('/api/black-market/list')({ body: { playFabId: 'PF_SELLER' } }, listRes);

  expect(listRes.statusCode).toBe(200);
  expect(listRes.body.listings).toHaveLength(1);
  expect(firestore.dump('black_market_listings')[0]).toMatchObject({ status: 'active', itemDebited: true });
  expect(economySubtracts).toHaveLength(2);
});

test('black-market purchase recovery pays the seller after a settlement failure', async () => {
  const firestore = makeMemoryFirestore({
    black_market_listings: {
      listing1: {
        listingId: 'listing1',
        sellerPlayFabId: 'PF_SELLER',
        itemId: 'sword_001',
        itemName: 'Test Sword',
        price: 25,
        status: 'active',
        originPlayFabId: 'PF_ORIGIN',
        originDisplayName: 'Origin'
      }
    }
  });
  let failSellerPayment = true;
  const { routes, economyAdds, economySubtracts } = makeBlackMarketHarness({
    firestore,
    addEconomyItemImpl: async (playFabId, itemId) => {
      if (playFabId === 'PF_SELLER' && itemId === 'PS' && failSellerPayment) {
        throw new Error('temporary seller payment failure');
      }
    }
  });
  const buyRes = makeResponse();

  await routes.get('/api/black-market/buy')({
    body: { playFabId: 'PF_BUYER', listingId: 'listing1' }
  }, buyRes);

  expect(buyRes.statusCode).toBe(500);
  expect(firestore.dump('black_market_listings')[0]).toMatchObject({
    status: 'buying',
    buyerItemGranted: true,
    buyerOwnershipGranted: true,
    sellerPaid: false,
    settlementStatus: 'settlementFailed'
  });

  failSellerPayment = false;
  const listRes = makeResponse();
  await routes.get('/api/black-market/list')({ body: { playFabId: 'PF_SELLER' } }, listRes);

  expect(listRes.statusCode).toBe(200);
  expect(firestore.dump('black_market_listings')[0]).toMatchObject({
    status: 'sold',
    sellerPaid: true,
    settlementStatus: 'settled'
  });
  expect(economySubtracts).toEqual([{ playFabId: 'PF_BUYER', itemId: 'PS', amount: 25 }]);
  expect(economyAdds.filter((entry) => entry.playFabId === 'PF_BUYER' && entry.itemId === 'sword_001')).toHaveLength(1);
  expect(economyAdds.filter((entry) => entry.playFabId === 'PF_SELLER' && entry.itemId === 'PS')).toHaveLength(2);
});

test('black-market refund failure keeps the listing locked until recovery succeeds', async () => {
  const firestore = makeMemoryFirestore({
    black_market_listings: {
      listing1: {
        listingId: 'listing1',
        sellerPlayFabId: 'PF_SELLER',
        itemId: 'sword_001',
        itemName: 'Test Sword',
        price: 25,
        status: 'active'
      }
    }
  });
  let allowRefund = false;
  const { routes } = makeBlackMarketHarness({
    firestore,
    addEconomyItemImpl: async (playFabId, itemId) => {
      if (playFabId === 'PF_BUYER' && itemId === 'sword_001') throw new Error('item grant failure');
      if (playFabId === 'PF_BUYER' && itemId === 'PS' && !allowRefund) throw new Error('refund failure');
    }
  });
  const buyRes = makeResponse();

  await routes.get('/api/black-market/buy')({
    body: { playFabId: 'PF_BUYER', listingId: 'listing1' }
  }, buyRes);

  expect(buyRes.statusCode).toBe(500);
  expect(firestore.dump('black_market_listings')[0]).toMatchObject({
    status: 'buying',
    buyerCharged: true,
    buyerItemGranted: false,
    buyerRefunded: false,
    settlementStatus: 'refundPending'
  });

  const pendingListRes = makeResponse();
  await routes.get('/api/black-market/list')({ body: { playFabId: 'PF_BUYER' } }, pendingListRes);
  expect(pendingListRes.statusCode).toBe(200);
  expect(pendingListRes.body.listings).toContainEqual(expect.objectContaining({
    listingId: 'listing1',
    status: 'buying',
    isPending: true
  }));

  allowRefund = true;
  const listRes = makeResponse();
  await routes.get('/api/black-market/list')({ body: { playFabId: 'PF_BUYER' } }, listRes);

  expect(listRes.statusCode).toBe(200);
  expect(firestore.dump('black_market_listings')[0]).toMatchObject({
    status: 'active',
    buyerPlayFabId: '',
    buyerCharged: false
  });
});

test('black-market cancellation remains recoverable when the first return fails', async () => {
  const firestore = makeMemoryFirestore({
    black_market_listings: {
      listing1: {
        listingId: 'listing1',
        sellerPlayFabId: 'PF_SELLER',
        itemId: 'sword_001',
        itemName: 'Test Sword',
        price: 25,
        status: 'active',
        originPlayFabId: 'PF_ORIGIN',
        originDisplayName: 'Origin'
      }
    }
  });
  let failReturn = true;
  const { routes } = makeBlackMarketHarness({
    firestore,
    addEconomyItemImpl: async (playFabId, itemId) => {
      if (playFabId === 'PF_SELLER' && itemId === 'sword_001' && failReturn) {
        failReturn = false;
        throw new Error('temporary return failure');
      }
    }
  });
  const cancelRes = makeResponse();

  await routes.get('/api/black-market/cancel')({
    body: { playFabId: 'PF_SELLER', listingId: 'listing1' }
  }, cancelRes);

  expect(cancelRes.statusCode).toBe(500);
  expect(firestore.dump('black_market_listings')[0]).toMatchObject({
    status: 'cancelling',
    returnGranted: false,
    settlementStatus: 'returnPending'
  });

  const listRes = makeResponse();
  await routes.get('/api/black-market/list')({ body: { playFabId: 'PF_SELLER' } }, listRes);

  expect(listRes.statusCode).toBe(200);
  expect(firestore.dump('black_market_listings')[0]).toMatchObject({
    status: 'cancelled',
    returnGranted: true,
    ownershipReturned: true,
    settlementStatus: 'settled'
  });
});

test('black-market rejects cancelling another seller listing without locking it', async () => {
  const firestore = makeMemoryFirestore({
    black_market_listings: {
      listing1: {
        listingId: 'listing1',
        sellerPlayFabId: 'PF_SELLER',
        itemId: 'sword_001',
        itemName: 'Test Sword',
        price: 25,
        status: 'active'
      }
    }
  });
  const { routes, economyAdds } = makeBlackMarketHarness({ firestore });
  const res = makeResponse();

  await routes.get('/api/black-market/cancel')({
    body: { playFabId: 'PF_OTHER', listingId: 'listing1' }
  }, res);

  expect(res.statusCode).toBe(403);
  expect(economyAdds).toHaveLength(0);
  expect(firestore.dump('black_market_listings')[0]).toMatchObject({ status: 'active' });
});

test('black-market ownership counts remain correct across concurrent purchases', async () => {
  const firestore = makeMemoryFirestore({
    black_market_listings: {
      listing1: {
        listingId: 'listing1',
        sellerPlayFabId: 'PF_SELLER_1',
        itemId: 'sword_001',
        itemName: 'Test Sword',
        price: 10,
        status: 'active',
        originPlayFabId: 'PF_ORIGIN',
        originDisplayName: 'Origin'
      },
      listing2: {
        listingId: 'listing2',
        sellerPlayFabId: 'PF_SELLER_2',
        itemId: 'sword_001',
        itemName: 'Test Sword',
        price: 11,
        status: 'active',
        originPlayFabId: 'PF_ORIGIN',
        originDisplayName: 'Origin'
      }
    }
  });
  const { routes } = makeBlackMarketHarness({ firestore });
  const firstRes = makeResponse();
  const secondRes = makeResponse();
  const buy = routes.get('/api/black-market/buy');

  await Promise.all([
    buy({ body: { playFabId: 'PF_BUYER', listingId: 'listing1' } }, firstRes),
    buy({ body: { playFabId: 'PF_BUYER', listingId: 'listing2' } }, secondRes)
  ]);

  expect(firstRes.statusCode).toBe(200);
  expect(secondRes.statusCode).toBe(200);
  expect(firestore.dump('black_market_item_origins')).toContainEqual(expect.objectContaining({
    ownerPlayFabId: 'PF_BUYER',
    itemId: 'sword_001',
    originPlayFabId: 'PF_ORIGIN',
    count: 2
  }));
});
