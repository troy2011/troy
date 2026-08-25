const { test, expect } = require('@playwright/test');
const { __test } = require('../server/exploration');

const getUserReadOnlyDataApi = function getUserReadOnlyDataApi() {};
const updateUserReadOnlyDataApi = function updateUserReadOnlyDataApi() {};
const currencyId = String(process.env.VIRTUAL_CURRENCY_CODE || 'PS').trim().toUpperCase();

function makeRewardHarness({ failMarkerWriteOnce = false } = {}) {
  const readOnlyData = {};
  const economyCalls = [];
  const appliedIdempotencyIds = new Set();
  let markerWrites = 0;

  return {
    readOnlyData,
    economyCalls,
    async grant(playFabId = 'PF_PLAYWRIGHT', explorationId = 'exp-tutorial') {
      return __test.grantTarotKingdomTutorialReward(playFabId, explorationId, {
        PlayFabServer: {
          GetUserReadOnlyData: getUserReadOnlyDataApi,
          UpdateUserReadOnlyData: updateUserReadOnlyDataApi
        },
        promisifyPlayFab: async (api, request) => {
          if (api === getUserReadOnlyDataApi) return { Data: readOnlyData };
          if (api === updateUserReadOnlyDataApi) {
            markerWrites += 1;
            if (failMarkerWriteOnce && markerWrites === 1) {
              throw new Error('marker write unavailable');
            }
            Object.entries(request.Data || {}).forEach(([key, value]) => {
              readOnlyData[key] = { Value: value };
            });
            return {};
          }
          throw new Error('Unexpected PlayFab API call');
        },
        addEconomyItem: async (id, itemId, amount, options) => {
          economyCalls.push({ id, itemId, amount, idempotencyId: options?.idempotencyId });
          appliedIdempotencyIds.add(options?.idempotencyId);
          return {};
        }
      });
    },
    get creditedCount() {
      return appliedIdempotencyIds.size;
    }
  };
}

test('tutorial reward is eligible only for a victorious stage one tutorial owner', () => {
  const active = { tutorialEnabled: true, stageNo: 1 };
  const victory = { tarotKingdom: true, playerWon: true };

  expect(__test.isTarotKingdomTutorialRewardEligible(active, victory, 'PF1', 'PF1')).toBe(true);
  expect(__test.isTarotKingdomTutorialRewardEligible({ ...active, tutorialEnabled: false }, victory, 'PF1', 'PF1')).toBe(false);
  expect(__test.isTarotKingdomTutorialRewardEligible({ ...active, stageNo: 2 }, victory, 'PF1', 'PF1')).toBe(false);
  expect(__test.isTarotKingdomTutorialRewardEligible(active, { ...victory, playerWon: false }, 'PF1', 'PF1')).toBe(false);
  expect(__test.isTarotKingdomTutorialRewardEligible(active, victory, 'PF2', 'PF1')).toBe(false);
});

test('tutorial reward credits 500G once and stores the account marker', async () => {
  const harness = makeRewardHarness();

  await expect(harness.grant()).resolves.toMatchObject({
    amount: 500,
    granted: true,
    alreadyClaimed: false
  });
  await expect(harness.grant()).resolves.toMatchObject({
    amount: 500,
    granted: true,
    alreadyClaimed: true,
    replayed: true
  });
  await expect(harness.grant('PF_PLAYWRIGHT', 'exp-after-reward')).resolves.toMatchObject({
    amount: 0,
    granted: false,
    alreadyClaimed: true
  });

  expect(harness.economyCalls).toEqual([{
    id: 'PF_PLAYWRIGHT',
    itemId: currencyId,
    amount: 500,
    idempotencyId: 'tarot-kingdom-tutorial-reward-PF_PLAYWRIGHT'
  }]);
  expect(harness.readOnlyData.TarotKingdomTutorialRewardClaimed).toEqual({ Value: 'exploration:exp-tutorial' });
});

test('tutorial reward retry keeps the Economy grant idempotent when the marker write fails', async () => {
  const harness = makeRewardHarness({ failMarkerWriteOnce: true });

  await expect(harness.grant()).rejects.toThrow('marker write unavailable');
  await expect(harness.grant()).resolves.toMatchObject({ amount: 500, granted: true });

  expect(harness.economyCalls).toHaveLength(2);
  expect(harness.creditedCount).toBe(1);
  expect(harness.readOnlyData.TarotKingdomTutorialRewardClaimed).toEqual({ Value: 'exploration:exp-tutorial' });
});
