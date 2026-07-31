const { test, expect } = require('@playwright/test');

function loadEconomyWithPlayFabMock() {
  const playfabPath = require.resolve('../server/playfab');
  const economyPath = require.resolve('../server/economy');
  const originalPlayfab = require.cache[playfabPath];
  const originalEconomy = require.cache[economyPath];

  delete require.cache[economyPath];
  require.cache[playfabPath] = {
    id: playfabPath,
    filename: playfabPath,
    loaded: true,
    exports: {
      withTitleEntityToken: async (action) => action()
    }
  };

  const economy = require('../server/economy');
  return {
    economy,
    restore: () => {
      delete require.cache[economyPath];
      if (originalEconomy) require.cache[economyPath] = originalEconomy;
      if (originalPlayfab) require.cache[playfabPath] = originalPlayfab;
      else delete require.cache[playfabPath];
    }
  };
}

test('adds economy items by FriendlyId alternate id without catalog resolution', async () => {
  const { economy, restore } = loadEconomyWithPlayFabMock();
  try {
    let capturedRequest = null;
    let resolverCalled = false;
    await economy.addEconomyItem('PLAYER1', 'troy_menu_sample', 2, {
      PlayFabEconomy: { AddInventoryItems: () => {} },
      getEntityKeyFromPlayFabId: async () => ({ Id: 'ENTITY1', Type: 'title_player_account' }),
      promisifyPlayFab: async (method, request) => {
        capturedRequest = request;
        return {};
      },
      resolveItemId: () => {
        resolverCalled = true;
        return 'resolved-item-id';
      },
      alternateIdType: 'FriendlyId',
      idempotencyId: 'idem-1'
    });

    expect(resolverCalled).toBe(false);
    expect(capturedRequest).toMatchObject({
      Entity: { Id: 'ENTITY1', Type: 'title_player_account' },
      Amount: 2,
      IdempotencyId: 'idem-1',
      Item: {
        AlternateId: {
          Type: 'FriendlyId',
          Value: 'troy_menu_sample'
        }
      }
    });
  } finally {
    restore();
  }
});

test('game ranking uses the Tarot Kingdom total best chips statistic', () => {
  const { economy, restore } = loadEconomyWithPlayFabMock();
  try {
    expect(economy.STORE_GAME_RANKING_STATS.game).toMatchObject({
      statisticName: 'troy_tarot_kingdom_chip_total',
      label: 'タロットキングダム',
      scoreScale: 1,
      automatic: true
    });
    expect(economy.STORE_GAME_RANKING_STATS.game.isRating).toBeUndefined();
  } finally {
    restore();
  }
});

test('adds economy items by resolved catalog id by default', async () => {
  const { economy, restore } = loadEconomyWithPlayFabMock();
  try {
    let capturedRequest = null;
    await economy.addEconomyItem('PLAYER1', 'PS', 100, {
      PlayFabEconomy: { AddInventoryItems: () => {} },
      getEntityKeyFromPlayFabId: async () => ({ Id: 'ENTITY1', Type: 'title_player_account' }),
      promisifyPlayFab: async (method, request) => {
        capturedRequest = request;
        return {};
      },
      resolveItemId: () => 'catalog-ps-id'
    });

    expect(capturedRequest).toMatchObject({
      Entity: { Id: 'ENTITY1', Type: 'title_player_account' },
      Amount: 100,
      Item: { Id: 'catalog-ps-id' }
    });
  } finally {
    restore();
  }
});
