const { test, expect } = require('@playwright/test');
const {
  getCardLevelOperationId,
  getDuplicateCount,
  getDuplicateCost,
  getDuplicateRequirementError,
  getMaxLevel,
  initializeCardRoutes,
  isInsufficientInventoryError,
  normalizeCardLevel
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

function createCardRouteHarness({ inventoryItems, cardDoc, cardDocError = null, subtractError = null } = {}) {
  const routes = new Map();
  const inventoryCalls = [];
  const writes = [];
  const subtractions = [];
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
              const data = collectionName === 'playerCards' ? cardDoc : null;
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
    subtractEconomyItem: async (...args) => {
      subtractions.push(args);
      if (subtractError) throw subtractError;
    },
    catalogCache: {
      tarot_major_00: { Category: 'TarotMajor', DisplayName: '愚者' },
      tarot_minor_wand_01: { Category: 'TarotMinor', DisplayName: 'ワンドA' },
      potion_001: { Category: 'Consumable', DisplayName: 'ポーション' }
    },
    firestore,
    requireAuthenticatedPlayFabId: async (_req, _res, playFabId) => playFabId
  });

  return {
    handler: routes.get('/api/cards'),
    levelUpHandler: routes.get('/api/cards/levelup'),
    inventoryCalls,
    subtractions,
    writes
  };
}

test('cards list uses the shared Economy V2 inventory accessor and reports duplicate materials', async () => {
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
    expect.objectContaining({
      itemId: 'tarot_major_00', quantity: 1, level: 1, maxLevel: 25,
      duplicateCount: 0, duplicateCost: 1, canLevelUp: false, isMajor: true
    }),
    expect.objectContaining({
      itemId: 'tarot_minor_wand_01', quantity: 2, level: 3, maxLevel: 15,
      duplicateCount: 1, duplicateCost: 1, canLevelUp: true, isMajor: false
    })
  ]);
  expect(Object.keys(response.body)).toEqual(['cards']);
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
    expect.objectContaining({
      itemId: 'tarot_minor_wand_01', level: 1, maxLevel: 15,
      duplicateCount: 0, duplicateCost: 1, canLevelUp: false
    })
  ]);
});

test('card levels use fixed category caps and retain one copy as the base card', () => {
  expect(normalizeCardLevel(0, 10)).toBe(1);
  expect(getMaxLevel(false)).toBe(15);
  expect(getMaxLevel(true)).toBe(25);
  expect(getDuplicateCount(0)).toBe(0);
  expect(getDuplicateCount(1)).toBe(0);
  expect(getDuplicateCount(3)).toBe(2);
  expect(getDuplicateCost(1)).toBe(1);
  expect(getDuplicateCost(5)).toBe(1);
  expect(getDuplicateCost(6)).toBe(2);
  expect(getDuplicateCost(11)).toBe(3);
  expect(getDuplicateRequirementError(3)).toContain('3枚');
  expect(getCardLevelOperationId('PLAYER1', 'tarot_minor_wand_01', 4)).toBe('PLAYER1:tarot_minor_wand_01:4');
  expect(isInsufficientInventoryError({ apiErrorInfo: { apiError: 'InsufficientInventory' } })).toBe(true);
  expect(isInsufficientInventoryError(new Error('temporary network failure'))).toBe(false);
});

test('level up consumes one duplicate and raises the stored card level', async () => {
  const { levelUpHandler, writes, subtractions } = createCardRouteHarness({
    inventoryItems: [{ Id: 'tarot_minor_wand_01', Amount: 2 }],
    cardDoc: { cards: { tarot_minor_wand_01: { level: 0 } } }
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
    maxLevel: 15,
    quantity: 1,
    duplicateCount: 0,
    duplicateCost: 1,
    canLevelUp: false,
    duplicateConsumed: true,
    materialsConsumed: 1
  });
  expect(subtractions).toEqual([
    [
      'PLAYER1',
      'tarot_minor_wand_01',
      1,
      expect.objectContaining({
        entityKeyOverride: { Id: 'entity-PLAYER1', Type: 'title_player_account' },
        idempotencyId: 'card-levelup-PLAYER1:tarot_minor_wand_01:1'
      })
    ]
  ]);
  expect(writes).toEqual(expect.arrayContaining([
    expect.objectContaining({
      reference: expect.objectContaining({ collectionName: 'playerCards', id: 'PLAYER1' }),
      data: expect.objectContaining({
        cards: { tarot_minor_wand_01: { level: 2 } }
      })
    }),
    expect.objectContaining({
      reference: expect.objectContaining({ collectionName: 'playerCardLevelOperations' }),
      data: expect.objectContaining({ status: 'pending', itemId: 'tarot_minor_wand_01' })
    })
  ]));
});

test('level up rejects a single protected copy without consuming it', async () => {
  const { levelUpHandler, writes, subtractions } = createCardRouteHarness({
    inventoryItems: [{ Id: 'tarot_minor_wand_01', Amount: 1 }],
    cardDoc: { cards: { tarot_minor_wand_01: { level: 1 } } }
  });
  const response = createResponse();

  await levelUpHandler({
    authenticatedPlayFabId: 'PLAYER1',
    body: { itemId: 'tarot_minor_wand_01' }
  }, response);

  expect(response.statusCode).toBe(400);
  expect(response.body.error).toContain('予備');
  expect(subtractions).toHaveLength(0);
  expect(writes).toHaveLength(0);
});

test('level up rejects a card already at its category cap without consuming it', async () => {
  const { levelUpHandler, subtractions } = createCardRouteHarness({
    inventoryItems: [{ Id: 'tarot_minor_wand_01', Amount: 99 }],
    cardDoc: { cards: { tarot_minor_wand_01: { level: 15 } } }
  });
  const response = createResponse();

  await levelUpHandler({
    authenticatedPlayFabId: 'PLAYER1',
    body: { itemId: 'tarot_minor_wand_01' }
  }, response);

  expect(response.statusCode).toBe(400);
  expect(response.body.error).toContain('上限');
  expect(subtractions).toHaveLength(0);
});

test('level up consumes the level-scaled duplicate requirement', async () => {
  const { levelUpHandler, subtractions } = createCardRouteHarness({
    inventoryItems: [{ Id: 'tarot_minor_wand_01', Amount: 3 }],
    cardDoc: { cards: { tarot_minor_wand_01: { level: 6 } } }
  });
  const response = createResponse();

  await levelUpHandler({
    authenticatedPlayFabId: 'PLAYER1',
    body: { itemId: 'tarot_minor_wand_01' }
  }, response);

  expect(response.statusCode).toBe(200);
  expect(response.body).toMatchObject({
    newLevel: 7,
    quantity: 1,
    duplicateCount: 0,
    duplicateCost: 2,
    canLevelUp: false,
    materialsConsumed: 2
  });
  expect(subtractions[0][2]).toBe(2);
});

test('level up maps a stale Economy V2 duplicate shortage to an actionable response', async () => {
  const { levelUpHandler } = createCardRouteHarness({
    inventoryItems: [{ Id: 'tarot_minor_wand_01', Amount: 2 }],
    cardDoc: { cards: { tarot_minor_wand_01: { level: 1 } } },
    subtractError: Object.assign(new Error('Insufficient inventory'), {
      apiErrorInfo: { apiError: 'InsufficientInventory' }
    })
  });
  const response = createResponse();

  await levelUpHandler({
    authenticatedPlayFabId: 'PLAYER1',
    body: { itemId: 'tarot_minor_wand_01' }
  }, response);

  expect(response.statusCode).toBe(400);
  expect(response.body.error).toContain('必要');
});
