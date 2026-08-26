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
    tarotEncounter: encounter,
    stageParticipants: [hostPlayFabId, 'PF_DEPARTED'],
    stagePartyLockedAtMs: 0
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
  const activeRef = { id: hostPlayFabId };
  const firestore = {
    collection() {
      return { doc: () => activeRef };
    },
    async runTransaction(callback) {
      return callback({
        async get() {
          return createSnapshot(activeData);
        },
        update(_ref, updates) {
          Object.assign(activeData, updates);
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
              if (path === `tarotKingdomMatch/openRooms/${roomId}`) return createRealtimeSnapshot(openRoom);
              return createRealtimeSnapshot(null);
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
    requireAuthenticatedPlayFabId: async (_req, _res, playFabId) => playFabId
  });

  return {
    activeData,
    guestPlayFabId,
    handlers,
    hostPlayFabId,
    room,
    roomId,
    explorationId,
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
