const { test, expect } = require('@playwright/test');
const explorationModule = require('../server/exploration');

function createSnapshot(value) {
  return {
    exists: value !== null && value !== undefined,
    val: () => value,
    data: () => value
  };
}

function createRealtimeSnapshot(value) {
  return {
    exists: () => value !== null && value !== undefined,
    val: () => value
  };
}

function createResponse() {
  return {
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
  };
}

function createOnlineRouteHarness() {
  const handlers = new Map();
  const explorationId = 'exp-online-party';
  const hostPlayFabId = 'PF_HOST';
  const guestPlayFabId = 'PF_GUEST';
  const roomId = 'tk_online_party';
  const now = Date.now();
  const encounter = explorationModule.__test.buildTarotKingdomStageEncounter({
    explorationId,
    stageNo: 1,
    selectedAtMs: now
  });
  const activeData = {
    id: explorationId,
    status: 'active',
    playFabId: hostPlayFabId,
    stageNo: 1,
    tarotEncounter: encounter,
    stageParticipants: [hostPlayFabId, 'PF_DEPARTED'],
    stagePartyLockedAtMs: 0,
    jobMasteryRulesVersion: 1,
    jobMasteryProfiles: {},
    jobMasteryPendingRounds: {}
  };
  const room = {
    meta: { hostUid: hostPlayFabId },
    presence: {
      [hostPlayFabId]: {
        uid: hostPlayFabId,
        playFabId: hostPlayFabId,
        seat: 0,
        updatedAt: now
      }
    },
    state: {
      state: {
        roundActive: false,
        handNo: 0,
        awaitRoundConfirm: false,
        phase: 'waiting',
        onlineDeparture: null
      }
    }
  };
  const openRoom = {
    kind: 'exploration-rescue',
    ownerPlayFabId: hostPlayFabId,
    explorationId
  };
  const routeState = {
    activeExists: true,
    openRoomVisible: true,
    removedRealtimePaths: []
  };
  const activeRef = {
    id: hostPlayFabId,
    async get() {
      return createSnapshot(routeState.activeExists ? activeData : null);
    },
    async set(updates) {
      Object.assign(activeData, updates);
    },
    async delete() {
      routeState.activeExists = false;
    }
  };
  const playFabData = {};
  const PlayFabServer = {
    GetUserReadOnlyData() {},
    UpdateUserReadOnlyData() {}
  };
  const promisifyPlayFab = async (operation, request) => {
    if (operation === PlayFabServer.GetUserReadOnlyData) {
      const values = playFabData[request.PlayFabId] || {};
      return {
        Data: Object.fromEntries((request.Keys || []).map((key) => [
          key,
          { Value: values[key] || '' }
        ]))
      };
    }
    if (operation === PlayFabServer.UpdateUserReadOnlyData) {
      playFabData[request.PlayFabId] = {
        ...(playFabData[request.PlayFabId] || {}),
        ...(request.Data || {})
      };
      return {};
    }
    throw new Error('Unexpected PlayFab operation');
  };
  const firestore = {
    collection() {
      return { doc: () => activeRef };
    },
    async runTransaction(callback) {
      return callback({
        async get() {
          return createSnapshot(routeState.activeExists ? activeData : null);
        },
        update(_ref, updates) {
          Object.assign(activeData, updates);
        },
        delete() {
          routeState.activeExists = false;
        }
      });
    }
  };
  const admin = {
    database() {
      return {
        ref(path) {
          return {
            async once() {
              if (path === `tarotKingdomRooms/${roomId}`) return createRealtimeSnapshot(room);
              if (path === `tarotKingdomMatch/openRooms/${roomId}`) {
                return createRealtimeSnapshot(routeState.openRoomVisible ? openRoom : null);
              }
              return createRealtimeSnapshot(null);
            },
            async remove() {
              routeState.removedRealtimePaths.push(path);
              if (path === `tarotKingdomMatch/openRooms/${roomId}`) {
                routeState.openRoomVisible = false;
              }
            }
          };
        }
      };
    },
    firestore: {
      FieldValue: {
        serverTimestamp: () => ({ serverTimestamp: true })
      }
    }
  };
  explorationModule.initializeExplorationRoutes({
    post(path, handler) {
      handlers.set(path, handler);
    }
  }, {
    firestore,
    admin,
    PlayFabServer,
    promisifyPlayFab,
    addEconomyItem: async () => ({}),
    getAllInventoryItems: async () => [],
    getEntityKeyForPlayFabId: async () => ({ Id: hostPlayFabId, Type: 'title_player_account' }),
    requireAuthenticatedPlayFabId: async (_req, _res, playFabId) => playFabId
  });

  return {
    activeData,
    guestPlayFabId,
    handlers,
    hostPlayFabId,
    room,
    roomId,
    routeState,
    explorationId,
    playFabData,
    now
  };
}

test('online stage party sync drops departed players and blocks a late join after lock', async () => {
  const harness = createOnlineRouteHarness();
  const syncHandler = harness.handlers.get('/api/exploration/stage-party-sync');
  const joinHandler = harness.handlers.get('/api/exploration/stage-join');
  const syncResponse = createResponse();

  await syncHandler({
    body: {
      playFabId: harness.hostPlayFabId,
      ownerPlayFabId: harness.hostPlayFabId,
      explorationId: harness.explorationId,
      roomId: harness.roomId,
      locked: true
    }
  }, syncResponse);

  expect(syncResponse.statusCode).toBe(200);
  expect(harness.activeData.stageParticipants).toEqual([harness.hostPlayFabId]);
  expect(harness.activeData.stagePartyLockedAtMs).toBeGreaterThan(0);

  harness.room.presence[harness.guestPlayFabId] = {
    uid: harness.guestPlayFabId,
    playFabId: harness.guestPlayFabId,
    seat: 1,
    updatedAt: harness.now
  };
  const lateJoinResponse = createResponse();
  await joinHandler({
    body: {
      playFabId: harness.guestPlayFabId,
      ownerPlayFabId: harness.hostPlayFabId,
      explorationId: harness.explorationId,
      roomId: harness.roomId
    }
  }, lateJoinResponse);

  expect(lateJoinResponse.statusCode).toBe(409);
  expect(lateJoinResponse.payload).toEqual({ error: 'この救難信号は出航準備に入りました。' });
  expect(harness.activeData.stageParticipants).toEqual([harness.hostPlayFabId]);

  const unlockResponse = createResponse();
  await syncHandler({
    body: {
      playFabId: harness.hostPlayFabId,
      ownerPlayFabId: harness.hostPlayFabId,
      explorationId: harness.explorationId,
      roomId: harness.roomId,
      locked: false
    }
  }, unlockResponse);

  expect(unlockResponse.statusCode).toBe(200);
  expect(unlockResponse.payload.participants).toEqual([
    harness.hostPlayFabId,
    harness.guestPlayFabId
  ]);
  expect(harness.activeData.stagePartyLockedAtMs).toBe(0);
});

test('round ABP is server-defined, excludes KO actors, and freezes the first survivor list', async () => {
  const harness = createOnlineRouteHarness();
  harness.activeData.stageParticipants = [harness.hostPlayFabId, harness.guestPlayFabId];
  harness.activeData.jobMasteryProfiles = {
    [harness.hostPlayFabId]: { guardianItemId: 'arcana-4' },
    [harness.guestPlayFabId]: { guardianItemId: 'arcana-3' }
  };
  const handler = harness.handlers.get('/api/tarot-kingdom/job-abp/round');
  const firstResponse = createResponse();

  await handler({
    body: {
      playFabId: harness.hostPlayFabId,
      explorationId: harness.explorationId,
      roundNo: 4,
      survivors: [
        { playFabId: harness.hostPlayFabId, hp: 12 },
        { playFabId: harness.guestPlayFabId, hp: 0 },
        { playFabId: 'NPC-1', hp: 99, isNpc: true }
      ]
    }
  }, firstResponse);

  expect(firstResponse.statusCode).toBe(200);
  expect(firstResponse.payload.amount).toBe(2);
  expect(firstResponse.payload.awards).toEqual([
    expect.objectContaining({
      playFabId: harness.hostPlayFabId,
      jobName: 'ナイト',
      awarded: 2,
      abp: 2
    })
  ]);
  expect(harness.activeData.jobMasteryPendingRounds['4']).toEqual(expect.objectContaining({
    survivors: [harness.hostPlayFabId],
    status: 'completed'
  }));

  const replayResponse = createResponse();
  await handler({
    body: {
      playFabId: harness.hostPlayFabId,
      explorationId: harness.explorationId,
      roundNo: 4,
      survivors: [
        { playFabId: harness.hostPlayFabId, hp: 12 },
        { playFabId: harness.guestPlayFabId, hp: 12 }
      ]
    }
  }, replayResponse);

  expect(replayResponse.statusCode).toBe(200);
  expect(replayResponse.payload.awards).toHaveLength(1);
  expect(harness.playFabData[harness.guestPlayFabId]).toBeUndefined();
});

test('the current online host can confirm ABP after departure closes the rescue listing', async () => {
  const harness = createOnlineRouteHarness();
  harness.activeData.stageParticipants = [harness.hostPlayFabId];
  harness.activeData.stageRoomId = harness.roomId;
  harness.activeData.jobMasteryProfiles = {
    [harness.hostPlayFabId]: { guardianItemId: 'arcana-0' }
  };
  harness.routeState.openRoomVisible = false;
  const response = createResponse();

  await harness.handlers.get('/api/tarot-kingdom/job-abp/round')({
    body: {
      playFabId: harness.hostPlayFabId,
      ownerPlayFabId: harness.hostPlayFabId,
      roomId: harness.roomId,
      explorationId: harness.explorationId,
      roundNo: 1,
      survivors: [{ playFabId: harness.hostPlayFabId, hp: 1 }]
    }
  }, response);

  expect(response.statusCode).toBe(200);
  expect(response.payload).toEqual(expect.objectContaining({ amount: 1, monsterId: 'ismartal-vol3-monster-04' }));
});

test('online host retreat ends the exploration even when rescue guests participated', async () => {
  const harness = createOnlineRouteHarness();
  harness.activeData.stageParticipants = [harness.hostPlayFabId, harness.guestPlayFabId];
  harness.activeData.stageRoomId = harness.roomId;
  const response = createResponse();

  await harness.handlers.get('/api/exploration/retreat')({
    body: {
      playFabId: harness.hostPlayFabId,
      explorationId: harness.explorationId
    }
  }, response);

  expect(response.statusCode).toBe(200);
  expect(response.payload).toEqual(expect.objectContaining({
    active: null,
    retreated: true,
    replayed: false
  }));
  expect(harness.routeState.activeExists).toBe(false);
  expect(harness.routeState.removedRealtimePaths).toEqual(expect.arrayContaining([
    `tarotKingdomRooms/${harness.roomId}`,
    `tarotKingdomMatch/openRooms/${harness.roomId}`
  ]));
});

test('retreating exploration remains visible and can finish an interrupted refund', async () => {
  const harness = createOnlineRouteHarness();
  harness.activeData.status = 'retreating';
  harness.activeData.stageRoomId = harness.roomId;
  const statusResponse = createResponse();

  await harness.handlers.get('/api/exploration/status')({
    body: { playFabId: harness.hostPlayFabId }
  }, statusResponse);

  expect(statusResponse.statusCode).toBe(200);
  expect(statusResponse.payload.active).toEqual(expect.objectContaining({
    id: harness.explorationId,
    status: 'retreating'
  }));

  const retreatResponse = createResponse();
  await harness.handlers.get('/api/exploration/retreat')({
    body: {
      playFabId: harness.hostPlayFabId,
      explorationId: harness.explorationId
    }
  }, retreatResponse);

  expect(retreatResponse.statusCode).toBe(200);
  expect(retreatResponse.payload).toEqual(expect.objectContaining({
    active: null,
    retreated: true
  }));
  expect(harness.routeState.activeExists).toBe(false);
});
