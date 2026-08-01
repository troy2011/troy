const { test, expect } = require('@playwright/test');
const {
  loadLineFriendBonusStatus,
  normalizeServiceErrorMessage
} = require('../server/lineFriendBonus');

test('line friend bonus status parses PlayFab read-only data', async () => {
  const requests = [];
  const result = await loadLineFriendBonusStatus('PF_TEST', {
    promisifyPlayFab: async (_method, request) => {
      requests.push(request);
      return {
        Data: {
          lineUserId: { Value: 'LINE_TEST' },
          LineFriendBonusClaimedAt: { Value: '12345' },
          LineFriendBonusAmount: { Value: '500' }
        }
      };
    },
    PlayFabServer: { GetUserReadOnlyData: () => {} },
    rewardAmount: 500,
    addFriendUrl: 'https://line.me/example'
  });

  expect(requests).toEqual([{
    PlayFabId: 'PF_TEST',
    Keys: ['LineFriendBonusClaimedAt', 'LineFriendBonusAmount', 'lineUserId']
  }]);
  expect(result.error).toBeNull();
  expect(result.status).toEqual({
    eligible: true,
    linkedLineUserId: true,
    rewardAmount: 500,
    claimed: true,
    claimedAt: '12345',
    claimedAmount: 500,
    addFriendUrl: 'https://line.me/example',
    temporarilyUnavailable: false
  });
});

test('line friend bonus status retries and degrades without returning an API error', async () => {
  const waits = [];
  let attempts = 0;
  const playFabError = {
    code: 503,
    error: 'Connection error',
    errorMessage: { reason: 'upstream unavailable' }
  };
  const result = await loadLineFriendBonusStatus('PF_TEST', {
    promisifyPlayFab: async () => {
      attempts += 1;
      throw playFabError;
    },
    PlayFabServer: { GetUserReadOnlyData: () => {} },
    rewardAmount: 500,
    addFriendUrl: ''
  }, {
    retryDelayMs: 25,
    wait: async (delayMs) => waits.push(delayMs)
  });

  expect(attempts).toBe(2);
  expect(waits).toEqual([25]);
  expect(result.error).toBe(playFabError);
  expect(result.status).toEqual({
    eligible: false,
    linkedLineUserId: false,
    rewardAmount: 500,
    claimed: false,
    claimedAt: '',
    claimedAmount: 0,
    addFriendUrl: '',
    temporarilyUnavailable: true
  });
  expect(normalizeServiceErrorMessage(playFabError)).toBe('{"reason":"upstream unavailable"}');
});
