const { test, expect } = require('@playwright/test');
const { initializeCardRoutes } = require('../server/routes/cardRoutes');

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

function createCardRouteHarness({ inventoryItems, cardDoc, cardDocError = null } = {}) {
  const routes = new Map();
  const inventoryCalls = [];
  const app = {
    get(path, ...handlers) {
      routes.set(path, handlers.at(-1));
    },
    post(path, ...handlers) {
      routes.set(path, handlers.at(-1));
    }
  };
  const firestore = {
    collection() {
      return {
        doc() {
          return {
            async get() {
              if (cardDocError) throw cardDocError;
              return {
                exists: !!cardDoc,
                data: () => cardDoc || {}
              };
            }
          };
        }
      };
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

  return { handler: routes.get('/api/cards'), inventoryCalls };
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
    expect.objectContaining({ itemId: 'tarot_major_00', quantity: 1, level: 0, maxLevel: 5, isMajor: true }),
    expect.objectContaining({ itemId: 'tarot_minor_wand_01', quantity: 2, level: 3, maxLevel: 10, isMajor: false })
  ]);
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
    expect.objectContaining({ itemId: 'tarot_minor_wand_01', level: 0, maxLevel: 5 })
  ]);
});
