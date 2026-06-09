const { test, expect } = require('@playwright/test');
const { syncPirateKingNationStatus } = require('../server/playerLevel');

const getUserReadOnlyDataApi = function getUserReadOnlyDataApi() {};
const updateUserReadOnlyDataApi = function updateUserReadOnlyDataApi() {};

function makeDeps(readOnlyData = {}) {
  const updates = [];
  return {
    updates,
    deps: {
      PlayFabServer: {
        GetUserReadOnlyData: getUserReadOnlyDataApi,
        UpdateUserReadOnlyData: updateUserReadOnlyDataApi
      },
      promisifyPlayFab: async (apiFunction, request) => {
        if (apiFunction === getUserReadOnlyDataApi) {
          return {
            Data: Object.fromEntries(Object.entries(readOnlyData).map(([key, value]) => [key, { Value: String(value) }]))
          };
        }
        if (apiFunction === updateUserReadOnlyDataApi) {
          updates.push(request);
          return {};
        }
        throw new Error('Unexpected PlayFab API call');
      }
    }
  };
}

test('pirate king sync makes non-king players neutral black', async () => {
  const { deps, updates } = makeDeps({ IsKing: 'false', Nation: 'fire', AvatarColor: 'red' });

  const result = await syncPirateKingNationStatus('PLAYER1', deps, 41);

  expect(result).toMatchObject({ updated: true, nation: 'neutral', avatarColor: 'black' });
  expect(updates).toHaveLength(1);
  expect(updates[0]).toMatchObject({
    PlayFabId: 'PLAYER1',
    Data: {
      Nation: 'neutral',
      AvatarColor: 'black'
    }
  });
});

test('pirate king sync keeps nation kings in their nation', async () => {
  const { deps, updates } = makeDeps({ IsKing: 'true', Nation: 'fire', AvatarColor: 'red' });

  const result = await syncPirateKingNationStatus('KING1', deps, 41);

  expect(result).toMatchObject({ updated: false, reason: 'NationKing' });
  expect(updates).toHaveLength(0);
});
