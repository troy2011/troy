const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

async function withCombatProfilesApi(callback, options = {}) {
  const adminPath = require.resolve('firebase-admin');
  const playfabPath = require.resolve('../server/playfab');
  const battleRoutesPath = require.resolve('../server/routes/battleRoutes');
  const originalAdminCache = require.cache[adminPath];
  const originalPlayfabCache = require.cache[playfabPath];
  const roomData = options.roomData || {
    meta: {
      hostUid: 'PF_REQUESTER',
      seatByUid: { PF_REQUESTER: 0, PF_A: 1, PF_B: 2 },
      seatOwners: {
        0: { uid: 'PF_REQUESTER', updatedAt: Date.now() },
        1: { uid: 'PF_A', updatedAt: Date.now() },
        2: { uid: 'PF_B', updatedAt: Date.now() }
      }
    },
    presence: {
      PF_REQUESTER: { uid: 'PF_REQUESTER', seat: 0, playFabId: 'forged-id', updatedAt: Date.now() },
      PF_A: { uid: 'PF_A', seat: 1, playFabId: 'another-forged-id', updatedAt: Date.now() },
      PF_B: { uid: 'PF_B', seat: 2, updatedAt: Date.now() }
    }
  };
  const dbReadPaths = [];

  require.cache[adminPath] = {
    id: adminPath,
    filename: adminPath,
    loaded: true,
    exports: {
      database: () => ({
        ref: (refPath) => {
          dbReadPaths.push(refPath);
          return {
          once: async () => ({
            exists: () => {
              if (!roomData) return false;
              if (refPath.endsWith('/meta/hostUid')) return !!roomData.meta?.hostUid;
              if (refPath.endsWith('/meta/seatByUid')) return !!roomData.meta?.seatByUid;
              if (refPath.endsWith('/meta/seatOwners')) return !!roomData.meta?.seatOwners;
              if (refPath.endsWith('/presence')) return !!roomData.presence;
              return true;
            },
            val: () => {
              if (refPath.endsWith('/meta/hostUid')) return roomData?.meta?.hostUid || null;
              if (refPath.endsWith('/meta/seatByUid')) return roomData?.meta?.seatByUid || null;
              if (refPath.endsWith('/meta/seatOwners')) return roomData?.meta?.seatOwners || null;
              if (refPath.endsWith('/presence')) return roomData?.presence || null;
              return roomData;
            }
          })
        };
        }
      }),
      firestore: () => ({})
    }
  };
  require.cache[playfabPath] = {
    id: playfabPath,
    filename: playfabPath,
    loaded: true,
    exports: {
      getEntityKeyFromPlayFabId: async () => ({ Id: 'entity-player', Type: 'title_player_account' }),
      withTitleEntityToken: async (fn) => fn()
    }
  };
  delete require.cache[battleRoutesPath];

  const posts = new Map();
  const readOnlyRequests = [];
  const profileRequests = [];
  const PlayFabServer = {
    GetPlayerStatistics: Symbol('GetPlayerStatistics'),
    GetUserReadOnlyData: Symbol('GetUserReadOnlyData'),
    GetPlayerProfile: Symbol('GetPlayerProfile')
  };
  const PlayFabEconomy = {
    GetInventoryItems: Symbol('GetInventoryItems')
  };
  const catalogCache = {
    weapon_sword_01: {
      DisplayName: '海賊の剣',
      Description: 'テスト用の剣',
      Category: 'Weapon',
      ManifestWeaponType: 'sword',
      Power: 5
    },
    armor_coat_01: {
      DisplayName: '船長のコート',
      Category: 'Armor',
      Defense: 8,
      Agi: 2
    },
    charm_01: {
      DisplayName: '知恵のお守り',
      Category: 'Accessory',
      Int: 4
    },
    unused_item: {
      DisplayName: '未装備品',
      Category: 'Weapon',
      ManifestWeaponType: 'axe',
      Power: 99
    },
    'minor-cup-1': {
      DisplayName: 'カップA',
      Category: 'TarotMinor',
      ArcanaSuit: 'cup',
      ArcanaRank: 1
    }
  };
  const promisifyPlayFab = async (fn, body = {}) => {
    if (fn === PlayFabServer.GetPlayerStatistics) {
      return {
        Statistics: options.statistics || [
          { StatisticName: 'NationContribution', Value: 16500 },
          { StatisticName: 'HP', Value: 99 },
          { StatisticName: 'MaxHP', Value: 155 },
          { StatisticName: 'ちから', Value: 20 },
          { StatisticName: 'みのまもり', Value: 12 },
          { StatisticName: 'すばやさ', Value: 9 },
          { StatisticName: 'かしこさ', Value: 7 }
        ]
      };
    }
    if (fn === PlayFabServer.GetUserReadOnlyData) {
      readOnlyRequests.push(body);
      return {
        Data: {
          Equipped_RightHand: { Value: 'stack-sword' },
          Equipped_Armor: { Value: 'stack-armor' },
          Equipped_Accessory: { Value: 'stack-charm' },
          lineUserId: { Value: 'line-secret' },
          Race: { Value: 'elf' },
          Nation: { Value: 'water' },
          AvatarColor: { Value: 'blue' },
          SkinColorIndex: { Value: '2' },
          FaceIndex: { Value: '4' },
          HairStyleIndex: { Value: '6' },
          HairColorIndex: { Value: '3' },
          FacialHairStyleIndex: { Value: '0' },
          TarotDeck: { Value: '["minor-cup-1"]' },
          TarotDeckV2: { Value: '["secret-card"]' },
          ...(options.petState ? {
            TarotKingdomPetState: { Value: JSON.stringify(options.petState) }
          } : {})
        }
      };
    }
    if (fn === PlayFabServer.GetPlayerProfile) {
      profileRequests.push(body.PlayFabId);
      if (options.profileGate && typeof options.profileGate.then === 'function') {
        await options.profileGate;
      } else if (Number(options.profileDelayMs) > 0) {
        await new Promise((resolve) => setTimeout(resolve, Number(options.profileDelayMs)));
      }
      return {
        PlayerProfile: {
          DisplayName: `Captain ${body.PlayFabId}`,
          Entity: { Id: `entity-${body.PlayFabId}`, Type: 'title_player_account' }
        }
      };
    }
    if (fn === PlayFabEconomy.GetInventoryItems) {
      return {
        Items: [
          { StackId: 'stack-sword', Id: 'weapon_sword_01' },
          { StackId: 'stack-armor', Id: 'armor_coat_01' },
          { StackId: 'stack-charm', Id: 'charm_01' },
          { StackId: 'stack-cup-a', Id: 'minor-cup-1' },
          { StackId: 'stack-unused', Id: 'unused_item' }
        ]
      };
    }
    return {};
  };

  const authenticatedIds = [];
  const requireAuthenticatedPlayFabId = options.requireAuthenticatedPlayFabId || (async (_req, _res, id) => {
    authenticatedIds.push(id);
    return id;
  });

  try {
    const battleRoutes = require('../server/routes/battleRoutes');
    battleRoutes.initializeBattleRoutes(
      { post(routePath, handler) { posts.set(routePath, handler); } },
      promisifyPlayFab,
      PlayFabServer,
      {},
      PlayFabEconomy,
      { pushMessage: async () => null },
      catalogCache,
      {},
      (id) => id,
      { VIRTUAL_CURRENCY_CODE: 'PS', LEADERBOARD_NAME: 'ps_ranking', BATTLE_REWARD_POINTS: 0 },
      {
        requireAuthenticatedPlayFabId,
        tarotKingdomProfileLimits: options.profileLimits || undefined
      }
    );
    await callback({
      handler: posts.get('/api/tarot-kingdom/combat-profiles'),
      authenticatedIds,
      readOnlyRequests,
      profileRequests,
      dbReadPaths
    });
  } finally {
    delete require.cache[battleRoutesPath];
    if (originalPlayfabCache) require.cache[playfabPath] = originalPlayfabCache;
    else delete require.cache[playfabPath];
    if (originalAdminCache) require.cache[adminPath] = originalAdminCache;
    else delete require.cache[adminPath];
  }
}

async function invoke(handler, body) {
  let statusCode = 200;
  let payload = null;
  const headers = {};
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      payload = value;
      return value;
    },
    set(name, value) {
      headers[String(name).toLowerCase()] = String(value);
      return this;
    }
  };
  await handler({ body }, response);
  return { statusCode, payload, headers };
}

test('combat profile API authenticates the requester and returns sanitized melee-derived snapshots', async () => {
  await withCombatProfilesApi(async ({ handler, authenticatedIds, readOnlyRequests, profileRequests, dbReadPaths }) => {
    expect(handler).toBeTruthy();
    const result = await invoke(handler, {
      playFabId: 'PF_REQUESTER',
      targetPlayFabIds: ['PF_REQUESTER', 'PF_A', 'PF_B'],
      roomId: 'room-test'
    });

    expect(result.statusCode).toBe(200);
    expect(authenticatedIds).toEqual(['PF_REQUESTER']);
    expect(result.payload).toMatchObject({ success: true });
    expect(result.payload.characters).toHaveLength(3);
    expect(result.payload.characters[1]).toMatchObject({
      version: 2,
      source: 'playfab',
      playFabId: 'PF_A',
      displayName: 'Captain PF_A',
      level: 11,
      rankLabel: '航海士',
      avatarBase: {
        Race: 'elf',
        Nation: 'water',
        AvatarColor: 'blue',
        SkinColorIndex: 2,
        FaceIndex: 4,
        HairStyleIndex: 6,
        HairColorIndex: 3,
        FacialHairStyleIndex: 0,
        level: 11
      },
      equipment: {
        RightHand: 'weapon_sword_01',
        Armor: 'armor_coat_01',
        Accessory: 'charm_01'
      },
      itemSource: {
        weapon_sword_01: expect.objectContaining({ itemId: 'weapon_sword_01' }),
        armor_coat_01: expect.objectContaining({ itemId: 'armor_coat_01' }),
        charm_01: expect.objectContaining({ itemId: 'charm_01' })
      },
      tarotDeck: [{
        slot: 0,
        cardId: 'CUP_01',
        itemId: 'minor-cup-1',
        suit: 'Cup',
        rank: 1,
        skillName: '逆巻く杯',
        effectClass: 'attack',
        power: 80
      }],
      combat: {
        maxHp: 155,
        power: 25,
        defense: 20,
        intelligence: 11,
        speed: 11,
        weaponType: 'sword',
        weaponTypes: ['sword']
      }
    });
    expect(result.payload.characters[1].itemSource.unused_item).toBeUndefined();
    expect(result.payload.characters[1].itemSource.weapon_sword_01.customData).toMatchObject({
      Category: 'Weapon',
      ManifestWeaponType: 'sword'
    });
    expect(result.payload.characters[1].itemSource.weapon_sword_01.customData.Power).toBeUndefined();
    expect(readOnlyRequests.every((request) => request.Keys.includes('HairColorIndex'))).toBe(true);
    expect(readOnlyRequests.every((request) => !request.Keys.includes('lineUserId'))).toBe(true);
    expect(readOnlyRequests.every((request) => request.Keys.includes('TarotDeck'))).toBe(true);
    expect(readOnlyRequests.every((request) => request.Keys.includes('TarotKingdomPetState'))).toBe(true);
    expect(readOnlyRequests.every((request) => !request.Keys.includes('TarotDeckV2'))).toBe(true);
    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain('line-secret');
    expect(serialized).not.toContain('secret-card');
    expect(serialized).not.toContain('CurrentHP');
    expect(serialized).not.toContain('meleeDeckIds');

    const profileRequestCount = profileRequests.length;
    const refreshedResult = await invoke(handler, {
      playFabId: 'PF_REQUESTER',
      targetPlayFabIds: ['PF_REQUESTER', 'PF_A', 'PF_B'],
      roomId: 'room-test'
    });
    expect(refreshedResult.statusCode).toBe(200);
    expect(profileRequests).toHaveLength(profileRequestCount + 3);
    expect(dbReadPaths.every((refPath) => !refPath.endsWith('/room-test'))).toBe(true);
    expect(dbReadPaths.some((refPath) => refPath.endsWith('/state'))).toBe(false);
  });
});

test('combat profile does not treat depleted legacy HP as max HP when MaxHP is missing', async () => {
  await withCombatProfilesApi(async ({ handler }) => {
    const result = await invoke(handler, {
      playFabId: 'PF_REQUESTER',
      targetPlayFabIds: ['PF_REQUESTER']
    });

    expect(result.statusCode).toBe(200);
    expect(result.payload.characters[0]).toMatchObject({
      level: 11,
      combat: {
        maxHp: 120
      }
    });
  }, {
    statistics: [
      { StatisticName: 'NationContribution', Value: 16500 },
      { StatisticName: 'HP', Value: 1 },
      { StatisticName: 'ちから', Value: 20 },
      { StatisticName: 'みのまもり', Value: 12 },
      { StatisticName: 'すばやさ', Value: 9 },
      { StatisticName: 'かしこさ', Value: 7 }
    ]
  });
});

test('single-player combat profile response includes the saved current pet for exploration party setup', async () => {
  const monsterId = 'ismartal-vol1-monster-01';
  await withCombatProfilesApi(async ({ handler }) => {
    const result = await invoke(handler, {
      playFabId: 'PF_REQUESTER',
      targetPlayFabIds: ['PF_REQUESTER']
    });
    expect(result.statusCode).toBe(200);
    expect(result.payload.currentPet).toMatchObject({
      monsterId,
      monsterName: 'トゲマル',
      explorationId: 'explore-pet-1'
    });
    expect(result.payload.currentPets).toEqual([{
      playFabId: 'PF_REQUESTER',
      currentPet: expect.objectContaining({
        monsterId,
        monsterName: 'トゲマル'
      })
    }]);
    expect(result.payload.currentPet).not.toHaveProperty('level');
  }, {
    petState: {
      version: 1,
      currentPet: {
        monsterId,
        acquiredAtMs: 1000,
        explorationId: 'explore-pet-1'
      },
      pendingOffer: null
    }
  });
});

test('combat profile API rejects missing, duplicate, and oversized target lists before PlayFab reads', async () => {
  await withCombatProfilesApi(async ({ handler, authenticatedIds, profileRequests }) => {
    const missingRequester = await invoke(handler, { targetPlayFabIds: ['PF_A'] });
    const missingTargets = await invoke(handler, { playFabId: 'PF_REQUESTER', targetPlayFabIds: [] });
    const duplicateTargets = await invoke(handler, {
      playFabId: 'PF_REQUESTER',
      targetPlayFabIds: ['PF_A', ' PF_A ']
    });
    const tooManyTargets = await invoke(handler, {
      requesterPlayFabId: 'PF_REQUESTER',
      targetPlayFabIds: ['PF_1', 'PF_2', 'PF_3', 'PF_4', 'PF_5']
    });
    const conflictingRequester = await invoke(handler, {
      playFabId: 'PF_A',
      requesterPlayFabId: 'PF_B',
      targetPlayFabIds: ['PF_A']
    });

    expect(missingRequester.statusCode).toBe(400);
    expect(missingTargets.statusCode).toBe(400);
    expect(duplicateTargets.statusCode).toBe(400);
    expect(tooManyTargets.statusCode).toBe(400);
    expect(conflictingRequester.statusCode).toBe(400);
    expect(authenticatedIds).toEqual([]);
    expect(profileRequests).toEqual([]);
  });
});

test('combat profile API stops when authentication rejects the requester', async () => {
  await withCombatProfilesApi(async ({ handler, profileRequests }) => {
    const result = await invoke(handler, {
      playFabId: 'PF_IMPOSTOR',
      targetPlayFabIds: ['PF_A']
    });
    expect(result.statusCode).toBe(403);
    expect(result.payload).toEqual({ error: 'Forbidden' });
    expect(profileRequests).toEqual([]);
  }, {
    requireAuthenticatedPlayFabId: async (_req, res) => {
      res.status(403).json({ error: 'Forbidden' });
      return '';
    }
  });
});

test('combat profile API derives online membership from authenticated presence keys', async () => {
  await withCombatProfilesApi(async ({ handler, profileRequests }) => {
    const forgedTarget = await invoke(handler, {
      playFabId: 'PF_REQUESTER',
      targetPlayFabIds: ['PF_REQUESTER', 'PF_A', 'PF_IMPOSTOR'],
      roomId: 'room-test'
    });
    const nonHost = await invoke(handler, {
      playFabId: 'PF_A',
      targetPlayFabIds: ['PF_REQUESTER', 'PF_A', 'PF_B'],
      roomId: 'room-test'
    });
    const offlineOther = await invoke(handler, {
      playFabId: 'PF_REQUESTER',
      targetPlayFabIds: ['PF_A']
    });

    expect(forgedTarget.statusCode).toBe(409);
    expect(nonHost.statusCode).toBe(403);
    expect(offlineOther.statusCode).toBe(403);
    expect(profileRequests).toEqual([]);
  });
});

test('combat profile API rejects duplicate seats and stale participants', async () => {
  const duplicateRoom = {
    meta: {
      hostUid: 'PF_REQUESTER',
      seatByUid: { PF_REQUESTER: 0, PF_A: 1, PF_B: 1 },
      seatOwners: {
        0: { uid: 'PF_REQUESTER', updatedAt: Date.now() },
        1: { uid: 'PF_A', updatedAt: Date.now() }
      }
    },
    presence: {
      PF_REQUESTER: { seat: 0, updatedAt: Date.now() },
      PF_A: { seat: 1, updatedAt: Date.now() },
      PF_B: { seat: 1, updatedAt: Date.now() }
    }
  };
  await withCombatProfilesApi(async ({ handler, profileRequests }) => {
    const duplicateSeat = await invoke(handler, {
      playFabId: 'PF_REQUESTER',
      targetPlayFabIds: ['PF_REQUESTER', 'PF_A', 'PF_B'],
      roomId: 'room-test'
    });
    expect(duplicateSeat.statusCode).toBe(409);
    expect(profileRequests).toEqual([]);
  }, { roomData: duplicateRoom });

  const staleRoom = {
    meta: {
      hostUid: 'PF_REQUESTER',
      seatByUid: { PF_REQUESTER: 0, PF_A: 1 },
      seatOwners: {
        0: { uid: 'PF_REQUESTER', updatedAt: Date.now() },
        1: { uid: 'PF_A', updatedAt: Date.now() }
      }
    },
    presence: {
      PF_REQUESTER: { seat: 0, updatedAt: Date.now() },
      PF_A: { seat: 1, updatedAt: Date.now() - 120_000 }
    }
  };
  await withCombatProfilesApi(async ({ handler, profileRequests }) => {
    const staleParticipant = await invoke(handler, {
      playFabId: 'PF_REQUESTER',
      targetPlayFabIds: ['PF_REQUESTER', 'PF_A'],
      roomId: 'room-test'
    });
    expect(staleParticipant.statusCode).toBe(409);
    expect(profileRequests).toEqual([]);
  }, { roomData: staleRoom });

  for (const invalidUpdatedAt of [undefined, Date.now() + 60_000]) {
    const invalidRoom = {
      meta: {
        hostUid: 'PF_REQUESTER',
        seatByUid: { PF_REQUESTER: 0, PF_A: 1 },
        seatOwners: {
          0: { uid: 'PF_REQUESTER', updatedAt: Date.now() },
          1: { uid: 'PF_A', updatedAt: Date.now() }
        }
      },
      presence: {
        PF_REQUESTER: { seat: 0, updatedAt: Date.now() },
        PF_A: { seat: 1, ...(invalidUpdatedAt === undefined ? {} : { updatedAt: invalidUpdatedAt }) }
      }
    };
    await withCombatProfilesApi(async ({ handler, profileRequests }) => {
      const invalidPresence = await invoke(handler, {
        playFabId: 'PF_REQUESTER',
        targetPlayFabIds: ['PF_REQUESTER', 'PF_A'],
        roomId: 'room-test'
      });
      expect(invalidPresence.statusCode).toBe(409);
      expect(profileRequests).toEqual([]);
    }, { roomData: invalidRoom });
  }
});

test('combat profile API rejects a presence seat without the matching seat-owner lease', async () => {
  const forgedLeaseRoom = {
    meta: {
      hostUid: 'PF_REQUESTER',
      seatByUid: { PF_REQUESTER: 0, PF_A: 1 },
      seatOwners: {
        0: { uid: 'PF_REQUESTER', updatedAt: Date.now() },
        1: { uid: 'PF_OTHER', updatedAt: Date.now() }
      }
    },
    presence: {
      PF_REQUESTER: { seat: 0, updatedAt: Date.now() },
      PF_A: { seat: 1, updatedAt: Date.now() }
    }
  };
  await withCombatProfilesApi(async ({ handler, profileRequests }) => {
    const response = await invoke(handler, {
      playFabId: 'PF_REQUESTER',
      targetPlayFabIds: ['PF_REQUESTER', 'PF_A'],
      roomId: 'room-test'
    });
    expect(response.statusCode).toBe(409);
    expect(profileRequests).toEqual([]);
  }, { roomData: forgedLeaseRoom });
});

test('combat profile API rate limits the ninth request and returns Retry-After', async () => {
  await withCombatProfilesApi(async ({ handler }) => {
    const results = [];
    for (let index = 0; index < 9; index += 1) {
      results.push(await invoke(handler, {
        playFabId: 'PF_REQUESTER',
        targetPlayFabIds: ['PF_REQUESTER']
      }));
    }
    expect(results.slice(0, 8).every((result) => result.statusCode === 200)).toBe(true);
    expect(results[8].statusCode).toBe(429);
    expect(Number(results[8].headers['retry-after'])).toBeGreaterThan(0);
  });
});

test('combat profile API shares concurrent PlayFab profile reads', async () => {
  await withCombatProfilesApi(async ({ handler, profileRequests }) => {
    const body = { playFabId: 'PF_REQUESTER', targetPlayFabIds: ['PF_REQUESTER'] };
    const [first, second] = await Promise.all([invoke(handler, body), invoke(handler, body)]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(profileRequests).toEqual(['PF_REQUESTER']);
  }, { profileDelayMs: 30 });
});

test('combat profile API keeps timed-out work in-flight and bounds the queue', async () => {
  let releaseProfile;
  const profileGate = new Promise((resolve) => {
    releaseProfile = resolve;
  });

  try {
    await withCombatProfilesApi(async ({ handler, profileRequests }) => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const firstBody = { playFabId: 'PF_SLOW', targetPlayFabIds: ['PF_SLOW'] };
      const first = await invoke(handler, firstBody);
      expect(first.statusCode).toBe(504);

      // The same target must keep sharing the timed-out downstream operation.
      const sharedTimeoutPromise = invoke(handler, firstBody);
      await delay(2);

      // A different target fills the sole queue position while PF_SLOW still owns the slot.
      const queuedPromise = invoke(handler, {
        playFabId: 'PF_QUEUED',
        targetPlayFabIds: ['PF_QUEUED']
      });
      await delay(2);

      // A third distinct target must be rejected immediately because the queue is full.
      const overflow = await invoke(handler, {
        playFabId: 'PF_OVERFLOW',
        targetPlayFabIds: ['PF_OVERFLOW']
      });
      expect(overflow.statusCode).toBe(503);
      expect(overflow.headers['retry-after']).toBe('1');

      const [sharedTimeout, queued] = await Promise.all([sharedTimeoutPromise, queuedPromise]);
      expect(sharedTimeout.statusCode).toBe(504);
      expect(queued.statusCode).toBe(503);
      expect(queued.headers['retry-after']).toBe('1');
      expect(profileRequests).toEqual(['PF_SLOW']);

      // Once the downstream call really settles, the active slot must become reusable.
      releaseProfile();
      await delay(0);
      const recovered = await invoke(handler, {
        playFabId: 'PF_RECOVERED',
        targetPlayFabIds: ['PF_RECOVERED']
      });
      expect(recovered.statusCode).toBe(200);
      expect(profileRequests).toEqual(['PF_SLOW', 'PF_RECOVERED']);
    }, {
      profileGate,
      profileLimits: {
        httpDeadlineMs: 20,
        queueWaitMs: 10,
        maxConcurrency: 1,
        maxQueue: 1
      }
    });
  } finally {
    releaseProfile();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
});

test('playfab client exposes Tarot Kingdom combat profile and pet wrappers', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/playfabClient.js'), 'utf8');
  expect(source).toContain('export function getTarotKingdomCombatProfiles(playFabId, targetPlayFabIds, options = {})');
  expect(source).toContain("{ playFabId, targetPlayFabIds, roomId: String(roomId || '').trim() }");
  expect(source).toContain('export function getTarotKingdomPetState(playFabId, options)');
  expect(source).toContain('export function chooseTarotKingdomPet(playFabId, offerId, accept, options)');
  expect(source).toContain('body.tarotFinisher = {');
});
