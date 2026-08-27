const { test, expect } = require('@playwright/test');
const {
  JOB_MASTERY,
  TAROT_KINGDOM_JOB_MASTERY_DATA_KEY,
  awardTarotKingdomJobAbp,
  buildPublicState,
  initializeTarotKingdomJobMasteryRoutes,
  normalizeTarotKingdomJobMasteryState,
  selectTarotKingdomInheritedAbility
} = require('../server/tarotKingdomJobMastery');
const {
  TAROT_KINGDOM_EXPLORATION_STAGES,
  getTarotKingdomMonsterAbp
} = require('../server/tarotKingdomExplorationStages');

const EXPECTED_REQUIRED_ABP = [
  500, 700, 600, 600, 690, 650, 500, 700, 600, 700, 550,
  800, 650, 750, 900, 850, 999, 700, 800, 900, 900, 999
];

const EXPECTED_STAGE_ABP = [
  [1, 1, 1, 2],
  [4, 2, 2, 3],
  [5, 3, 3, 4],
  [4, 4, 5, 6],
  [5, 6, 6, 8],
  [7, 7, 8, 10],
  [9, 15, 11, 13],
  [12, 20, 14, 16],
  [16, 18, 20, 24],
  [24, 28, 32, 40]
];

test.describe('Tarot Kingdom job mastery definitions', () => {
  test('defines all 22 job requirements in Major Arcana order', () => {
    expect(JOB_MASTERY.JOBS).toHaveLength(22);
    expect(JOB_MASTERY.JOBS.map((job) => job.requiredAbp)).toEqual(EXPECTED_REQUIRED_ABP);
    expect(JOB_MASTERY.JOBS.map((job) => job.number)).toEqual(Array.from({ length: 22 }, (_, index) => index));
  });

  test('defines all 40 monster ABP values and stage totals', () => {
    expect(TAROT_KINGDOM_EXPLORATION_STAGES).toHaveLength(10);
    TAROT_KINGDOM_EXPLORATION_STAGES.forEach((stage, stageIndex) => {
      expect(stage.monsters).toHaveLength(4);
      const values = stage.monsters.map((monster, roundIndex) => (
        getTarotKingdomMonsterAbp(stage.stageNo, roundIndex + 1, monster.monsterId)
      ));
      expect(values).toEqual(EXPECTED_STAGE_ABP[stageIndex]);
      expect(values.reduce((sum, value) => sum + value, 0)).toBe(
        EXPECTED_STAGE_ABP[stageIndex].reduce((sum, value) => sum + value, 0)
      );
    });
  });
});

test.describe('Tarot Kingdom job mastery state', () => {
  test('awards once, caps at the job requirement, and auto-selects the first MASTER', () => {
    const itemId = 'arcana-4';
    const first = awardTarotKingdomJobAbp(null, {
      awardId: 'exploration-a+1+player-a',
      itemId,
      amount: 680,
      nowMs: 1000
    });
    expect(first.awarded).toBe(680);
    expect(first.mastered).toBe(false);
    expect(first.record.abp).toBe(680);

    const duplicate = awardTarotKingdomJobAbp(first.state, {
      awardId: 'exploration-a+1+player-a',
      itemId,
      amount: 10,
      nowMs: 2000
    });
    expect(duplicate.alreadyAwarded).toBe(true);
    expect(duplicate.record.abp).toBe(680);

    const mastered = awardTarotKingdomJobAbp(duplicate.state, {
      awardId: 'exploration-a+2+player-a',
      itemId,
      amount: 40,
      nowMs: 3000
    });
    expect(mastered.awarded).toBe(10);
    expect(mastered.mastered).toBe(true);
    expect(mastered.record.abp).toBe(690);
    expect(mastered.state.selectedInheritedItemId).toBe(itemId);
  });

  test('only allows selecting a mastered job and supports clearing the slot', () => {
    const mastered = normalizeTarotKingdomJobMasteryState({
      records: {
        'arcana-0': { number: 0, abp: 500, masteredAtMs: 100 }
      }
    });
    expect(selectTarotKingdomInheritedAbility(mastered, 'arcana-0').selectedInheritedItemId).toBe('arcana-0');
    expect(selectTarotKingdomInheritedAbility(mastered, '').selectedInheritedItemId).toBeNull();
    expect(() => selectTarotKingdomInheritedAbility(mastered, 'arcana-1')).toThrow(/MASTER済み/);
  });

  test('exposes zero progress for every untrained job', () => {
    const publicState = buildPublicState(null);
    expect(publicState.jobs).toHaveLength(22);
    expect(publicState.jobs.every((job) => job.abp === 0 && job.mastered === false)).toBe(true);
  });
});

test('mastery APIs authenticate reads and only persist a MASTER selection', async () => {
  const handlers = new Map();
  const storage = {
    PF_MASTER: {
      [TAROT_KINGDOM_JOB_MASTERY_DATA_KEY]: JSON.stringify({
        records: {
          'arcana-0': { number: 0, abp: 500, masteredAtMs: 100 }
        }
      })
    }
  };
  const PlayFabServer = {
    GetUserReadOnlyData() {},
    UpdateUserReadOnlyData() {}
  };
  const authenticated = [];
  initializeTarotKingdomJobMasteryRoutes({
    get(path, handler) {
      handlers.set(`GET ${path}`, handler);
    },
    post(path, handler) {
      handlers.set(`POST ${path}`, handler);
    }
  }, {
    PlayFabServer,
    requireAuthenticatedPlayFabId: async (_req, _res, playFabId) => {
      authenticated.push(playFabId);
      return playFabId;
    },
    promisifyPlayFab: async (operation, request) => {
      if (operation === PlayFabServer.GetUserReadOnlyData) {
        return {
          Data: {
            [TAROT_KINGDOM_JOB_MASTERY_DATA_KEY]: {
              Value: storage[request.PlayFabId]?.[TAROT_KINGDOM_JOB_MASTERY_DATA_KEY] || ''
            }
          }
        };
      }
      if (operation === PlayFabServer.UpdateUserReadOnlyData) {
        storage[request.PlayFabId] = {
          ...(storage[request.PlayFabId] || {}),
          ...(request.Data || {})
        };
        return {};
      }
      throw new Error('Unexpected PlayFab operation');
    }
  });
  const createResponse = () => ({
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  });

  const readResponse = createResponse();
  await handlers.get('GET /api/tarot-job-mastery')({
    query: { playFabId: 'PF_MASTER' },
    body: {}
  }, readResponse);
  expect(readResponse.statusCode).toBe(200);
  expect(readResponse.payload.mastery.jobs).toHaveLength(22);
  expect(readResponse.payload.mastery.jobs[0]).toEqual(expect.objectContaining({ mastered: true, abp: 500 }));

  const selectResponse = createResponse();
  await handlers.get('POST /api/tarot-job-mastery/select')({
    query: {},
    body: { playFabId: 'PF_MASTER', itemId: 'arcana-0' }
  }, selectResponse);
  expect(selectResponse.statusCode).toBe(200);
  expect(selectResponse.payload.mastery.selectedInheritedItemId).toBe('arcana-0');
  expect(authenticated).toEqual(['PF_MASTER', 'PF_MASTER']);
  expect(JSON.parse(storage.PF_MASTER[TAROT_KINGDOM_JOB_MASTERY_DATA_KEY]).selectedInheritedItemId).toBe('arcana-0');
});
