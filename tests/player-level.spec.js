const { test, expect } = require('@playwright/test');
const {
  applyDerivedPlayerLevelToStats,
  calculatePlayerMaxHp,
  calculateLevelFromContribution,
  PIRATE_KING_LEVEL,
  syncPirateKingNationStatus
} = require('../server/playerLevel');

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

  const result = await syncPirateKingNationStatus('PLAYER1', deps, PIRATE_KING_LEVEL);

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

test('pirate king sync does not run before level 51', async () => {
  const { deps, updates } = makeDeps({ IsKing: 'false', Nation: 'fire', AvatarColor: 'red' });

  const result = await syncPirateKingNationStatus('PLAYER1', deps, PIRATE_KING_LEVEL - 1);

  expect(result).toMatchObject({ updated: false, reason: 'NotPirateKing' });
  expect(updates).toHaveLength(0);
});

test('pirate king sync keeps nation kings in their nation', async () => {
  const { deps, updates } = makeDeps({ IsKing: 'true', Nation: 'fire', AvatarColor: 'red' });

  const result = await syncPirateKingNationStatus('KING1', deps, PIRATE_KING_LEVEL);

  expect(result).toMatchObject({ updated: false, reason: 'NationKing' });
  expect(updates).toHaveLength(0);
});

test('player contribution totals reach admiral at level 41 and pirate king at level 51', () => {
  expect(calculateLevelFromContribution(247500).level).toBe(41);
  expect(calculateLevelFromContribution(511500).level).toBe(51);
  expect(PIRATE_KING_LEVEL).toBe(51);
});

test('max HP grows from level and vitality without lowering saved high values', () => {
  expect(calculatePlayerMaxHp({ Level: 1, たいりょく: 5 })).toBe(80);
  expect(calculatePlayerMaxHp({ Level: 11, たいりょく: 5 })).toBe(120);
  expect(calculatePlayerMaxHp({ Level: 11, たいりょく: 8 })).toBe(132);
  expect(calculatePlayerMaxHp({ Level: 11, たいりょく: 5, MaxHP: 155 })).toBe(155);
});

test('legacy race HP migrates to vitality while preserving current HP rate', () => {
  const human = applyDerivedPlayerLevelToStats({ HP: 5, MaxHP: 5 }).stats;
  const orc = applyDerivedPlayerLevelToStats({ HP: 9, MaxHP: 15 }).stats;

  expect(human).toMatchObject({ Level: 1, HP: 80, MaxHP: 80, たいりょく: 5 });
  expect(orc).toMatchObject({ Level: 1, HP: 72, MaxHP: 120, たいりょく: 15 });
});
