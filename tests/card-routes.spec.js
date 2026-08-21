const { test, expect } = require('@playwright/test');
const {
  getMaxLevel,
  initializeCardRoutes,
  normalizeCardLevel,
  normalizeShardBalance,
  getStarterShardGrant,
  shardCost
} = require('../server/routes/cardRoutes');

function createResponse() {
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

function createCardRouteHarness({ inventoryItems, cardDoc, cardDocError = null, statDoc } = {}) {
  const routes = new Map();
  const inventoryCalls = [];
  const writes = [];
  const app = {
    get(path, ...handlers) {
      routes.set(path, handlers.at(-1));
    },
    post(path, ...handlers) {
      routes.set(path, handlers.at(-1));
    }
  };
  const firestore = {
    collection(collectionName) {
      return {
        doc(id) {
          return {
            async get() {
              if (collectionName === 'playerCards' && cardDocError) throw cardDocError;
              const data = collectionName === 'playerCards' ? cardDoc : statDoc;
              return {
                exists: !!data,
                data: () => data || {}
              };
            },
            collectionName,
            id
          };
        }
      };
    },
    async runTransaction(callback) {
      return callback({
        get: (reference) => reference.get(),
        set: (reference, data, options) => writes.push({ reference, data, options })
      });
    }
  };

  initializeCardRoutes(app, {
    getEntityKeyFromPlayFabId: async (playFabId) => ({ Id: `entity-${playFabId}`, Type: 'title_player_account' }),
    getAllInventoryItems: async (entityKey) => {
      inventoryCalls.push(entityKey);
      return inventoryItems || [];
    },
    catalogCache: {
      tarot_major_00: { Category: 'TarotMajor', DisplayName: '愚者' },
      tarot_minor_wand_01: { Category: 'TarotMinor', DisplayName: 'ワンドA' },
      potion_001: { Category: 'Consumable', DisplayName: 'ポーション' }
    },
    firestore,
    requireAuthenticatedPlayFabId: async (_req, _res, playFabId) => playFabId,
    promisifyPlayFab: async () => {
      throw new Error('The cards route must use getAllInventoryItems.');
    },
    PlayFabEconomy: {
      GetInventoryItems: () => {
        throw new Error('The cards route must use getAllInventoryItems.');
      }
    }
  });

  return {
    handler: routes.get('/api/cards'),
    levelUpHandler: routes.get('/api/cards/levelup'),
    inventoryCalls,
    writes
  };
}

test('cards list uses the shared Economy V2 inventory accessor', async () => {
  const { handler, inventoryCalls } = createCardRouteHarness({
    inventoryItems: [
      { Id: 'tarot_major_00', Amount: 1 },
      { Id: 'tarot_minor_wand_01', Amount: 2 },
      { Id: 'potion_001', Amount: 4 }
    ],
    cardDoc: {
      cards: {
        tarot_minor_wand_01: { level: 3 }
      }
    }
  });
  const response = createResponse();

  await handler({ authenticatedPlayFabId: 'PLAYER1' }, response);

  expect(inventoryCalls).toEqual([{ Id: 'entity-PLAYER1', Type: 'title_player_account' }]);
  expect(response.statusCode).toBe(200);
  expect(response.body.cards).toEqual([
    expect.objectContaining({ itemId: 'tarot_major_00', quantity: 1, level: 1, maxLevel: 10, nextLevelCost: 1, isMajor: true }),
    expect.objectContaining({ itemId: 'tarot_minor_wand_01', quantity: 2, level: 3, maxLevel: 15, nextLevelCost: 2, isMajor: false })
  ]);
  expect(response.body).toMatchObject({
    arcanaShards: 50,
    starterShardGrantAvailable: true
  });
});

test('cards list remains available when card level data cannot be read', async () => {
  const { handler } = createCardRouteHarness({
    inventoryItems: [{ Id: 'tarot_minor_wand_01', Amount: 1 }],
    cardDocError: new Error('Firestore temporarily unavailable')
  });
  const response = createResponse();

  await handler({ authenticatedPlayFabId: 'PLAYER1' }, response);

  expect(response.statusCode).toBe(200);
  expect(response.body.cards).toEqual([
    expect.objectContaining({ itemId: 'tarot_minor_wand_01', level: 1, maxLevel: 10, nextLevelCost: 1 })
  ]);
});

test('card level growth starts at one and uses the relaxed shard curve', () => {
  expect(normalizeCardLevel(0, 10)).toBe(1);
  expect(getMaxLevel(false, 1)).toBe(10);
  expect(getMaxLevel(false, 2)).toBe(15);
  expect(getMaxLevel(true, 1)).toBe(10);
  expect(getMaxLevel(true, 4)).toBe(25);
  expect(shardCost(1)).toBe(1);
  expect(shardCost(2)).toBe(1);
  expect(shardCost(3)).toBe(2);
  expect(shardCost(15)).toBe(8);
  expect(normalizeShardBalance(-5)).toBe(0);
  expect(normalizeShardBalance('3.8')).toBe(3);
  expect(getStarterShardGrant({})).toBe(50);
  expect(getStarterShardGrant({ cardLevelStarterShardGrantVersion: 1 })).toBe(0);
});

test('level up treats legacy level zero as level one without charging for the migration', async () => {
  const { levelUpHandler, writes } = createCardRouteHarness({
    inventoryItems: [{ Id: 'tarot_minor_wand_01', Amount: 1 }],
    cardDoc: { cards: { tarot_minor_wand_01: { level: 0 } } },
    statDoc: { arcanaShards: 1, cardLevelStarterShardGrantVersion: 1 }
  });
  const response = createResponse();

  await levelUpHandler({
    authenticatedPlayFabId: 'PLAYER1',
    body: { itemId: 'tarot_minor_wand_01' }
  }, response);

  expect(response.statusCode).toBe(200);
  expect(response.body).toMatchObject({
    success: true,
    itemId: 'tarot_minor_wand_01',
    newLevel: 2,
    cost: 1,
    maxLevel: 10,
    shardsAfter: 0,
    nextLevelCost: 1
  });
  expect(writes).toEqual(expect.arrayContaining([
    expect.objectContaining({
      reference: expect.objectContaining({ collectionName: 'playerCards', id: 'PLAYER1' }),
      data: expect.objectContaining({
        cards: { tarot_minor_wand_01: { level: 2 } }
      })
    })
  ]));
});

test('level up grants starter shards once to a player without a shard balance', async () => {
  const { levelUpHandler, writes } = createCardRouteHarness({
    inventoryItems: [{ Id: 'tarot_minor_wand_01', Amount: 1 }],
    cardDoc: { cards: { tarot_minor_wand_01: { level: 1 } } },
    statDoc: { arcanaShards: 0 }
  });
  const response = createResponse();

  await levelUpHandler({
    authenticatedPlayFabId: 'PLAYER1',
    body: { itemId: 'tarot_minor_wand_01' }
  }, response);

  expect(response.statusCode).toBe(200);
  expect(response.body).toMatchObject({
    success: true,
    newLevel: 2,
    cost: 1,
    starterShardsGranted: 50,
    shardsAfter: 49
  });
  expect(writes).toEqual(expect.arrayContaining([
    expect.objectContaining({
      reference: expect.objectContaining({ collectionName: 'playerStats', id: 'PLAYER1' }),
      data: expect.objectContaining({ cardLevelStarterShardGrantVersion: 1 })
    })
  ]));
});
