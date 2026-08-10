const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

async function waitForCondition(predicate, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if ((Date.now() - startedAt) >= timeoutMs) {
      throw new Error('Timed out waiting for asynchronous combat-profile work');
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

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
  const readOnlyUpdateRequests = [];
  const profileRequests = [];
  const PlayFabServer = {
    GetPlayerStatistics: Symbol('GetPlayerStatistics'),
    GetUserReadOnlyData: Symbol('GetUserReadOnlyData'),
    GetPlayerProfile: Symbol('GetPlayerProfile'),
    UpdateUserReadOnlyData: Symbol('UpdateUserReadOnlyData')
  };
  const PlayFabEconomy = {
    GetInventoryItems: Symbol('GetInventoryItems')
  };
  const catalogCache = options.catalogCache || {
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
    },
    'arcana-1': {
      DisplayName: '魔術師',
      Category: 'TarotMajor',
      FriendlyId: 'arcana-1',
      ArcanaNumber: 1
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
          ...(!options.omitCommonTarotDeck ? {
            TarotDeck: {
              Value: options.tarotDeckStoredValue
                ?? JSON.stringify(options.tarotDeckIds || ['minor-cup-1'])
            }
          } : {}),
          ...(options.meleeDeckIds ? {
            TarotMeleeDeck: { Value: JSON.stringify(options.meleeDeckIds) }
          } : {}),
          ...(options.shipDeckIds ? {
            TarotShipDeck: { Value: JSON.stringify(options.shipDeckIds) }
          } : {}),
          TarotGuardianArcana: {
            Value: options.guardianStoredValue ?? JSON.stringify({
              version: 1,
              itemId: options.guardianItemId || 'tarot_major_01'
            })
          },
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
        Items: options.inventoryItems || [
          {
            StackId: 'stack-sword',
            Id: 'weapon_sword_01',
            DisplayProperties: { equipmentEnhancement: { version: 1, bonus: 3 } }
          },
          { StackId: 'stack-armor', Id: 'armor_coat_01' },
          { StackId: 'stack-charm', Id: 'charm_01' },
          { StackId: 'stack-cup-a', Id: 'minor-cup-1' },
          { StackId: 'stack-major-1', Id: 'tarot_major_01' },
          { StackId: 'stack-unused', Id: 'unused_item' }
        ]
      };
    }
    if (fn === PlayFabServer.UpdateUserReadOnlyData) {
      readOnlyUpdateRequests.push(body);
      if (options.readOnlyUpdateGate && typeof options.readOnlyUpdateGate.then === 'function') {
        await options.readOnlyUpdateGate;
      }
      return {};
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
      options.resolveItemId || ((id) => id),
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
      readOnlyUpdateRequests,
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
      version: 4,
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
        itemId: 'minor-cup-1',
        suit: 'Cup',
        rank: 1,
        cardLevel: 1,
        resonanceId: 'cup-1'
      }],
      guardianArcana: {
        itemId: 'arcana-1',
        number: 1,
        cardLevel: 1,
        passiveId: 'guardian-v3-1'
      },
      combat: {
        maxHp: 155,
        power: 28,
        defense: 20,
        intelligence: 11,
        speed: 11,
        equipmentPower: 8,
        equipmentMagicPower: 4,
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
    expect(readOnlyRequests.every((request) => request.Keys.includes('TarotGuardianArcana'))).toBe(true);
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

test('combat profile restores saved legacy tarot ids without waiting for inventory refresh or migration writes', async () => {
  const tarotDeckIds = [
    'tarot_minor_wand_01',
    'tarot_minor_cup_05',
    'tarot_minor_sword_10',
    'tarot_minor_pentacle_13',
    'minor-sword-14'
  ];
  const canonicalFriendlyIds = [
    'minor-wand-1',
    'minor-cup-5',
    'minor-sword-10',
    'minor-pentacle-13',
    'minor-sword-14'
  ];
  const catalogItemIds = tarotDeckIds.map((_itemId, index) => `catalog-tarot-${index}`);
  const guardianCatalogItemId = 'catalog-major-tower';
  const inventoryItems = [
    { StackId: 'stack-sword', Id: 'weapon_sword_01' },
    { StackId: 'stack-armor', Id: 'armor_coat_01' },
    { StackId: 'stack-charm', Id: 'charm_01' }
  ];
  let releaseMigration;
  const migrationGate = new Promise((resolve) => {
    releaseMigration = resolve;
  });

  await withCombatProfilesApi(async ({ handler, readOnlyUpdateRequests }) => {
    try {
      const result = await Promise.race([
        invoke(handler, {
          playFabId: 'PF_REQUESTER',
          targetPlayFabIds: ['PF_REQUESTER']
        }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Combat profile waited for migration persistence')), 1000);
        })
      ]);

      expect(result.statusCode).toBe(200);
      expect(result.payload.characters[0].tarotDeck).toEqual([
        expect.objectContaining({ slot: 0, itemId: catalogItemIds[0], suit: 'Wand', rank: 1 }),
        expect.objectContaining({ slot: 1, itemId: catalogItemIds[1], suit: 'Cup', rank: 5 }),
        expect.objectContaining({ slot: 2, itemId: catalogItemIds[2], suit: 'Sword', rank: 10 }),
        expect.objectContaining({ slot: 3, itemId: catalogItemIds[3], suit: 'Pentacle', rank: 13 }),
        expect.objectContaining({ slot: 4, itemId: catalogItemIds[4], suit: 'Sword', rank: 14 })
      ]);
      expect(result.payload.characters[0].guardianArcana).toMatchObject({
        itemId: guardianCatalogItemId,
        number: 16,
        passiveId: 'guardian-v3-16'
      });
      expect(readOnlyUpdateRequests).toHaveLength(1);
    } finally {
      releaseMigration();
    }
    await waitForCondition(() => readOnlyUpdateRequests.length === 2);
    expect(readOnlyUpdateRequests.some((request) => (
      JSON.parse(request.Data.TarotDeck || '[]').join('|') === catalogItemIds.join('|')
    ))).toBe(true);
    expect(readOnlyUpdateRequests.some((request) => (
      JSON.parse(request.Data.TarotGuardianArcana || '{}').itemId === guardianCatalogItemId
    ))).toBe(true);
  }, {
    tarotDeckIds,
    guardianStoredValue: JSON.stringify({ ItemId: 'tarot_major_sword_16' }),
    inventoryItems,
    readOnlyUpdateGate: migrationGate,
    resolveItemId: (itemId) => {
      const index = canonicalFriendlyIds.indexOf(itemId);
      if (index >= 0) return catalogItemIds[index];
      return itemId === 'arcana-16' ? guardianCatalogItemId : itemId;
    },
    catalogCache: {
      weapon_sword_01: {
        DisplayName: '海賊の剣',
        Category: 'Weapon',
        ManifestWeaponType: 'sword',
        Power: 5
      },
      armor_coat_01: { DisplayName: '船長のコート', Category: 'Armor', Defense: 8 },
      charm_01: { DisplayName: '知恵のお守り', Category: 'Accessory', Int: 4 },
      [guardianCatalogItemId]: {
        FriendlyId: 'arcana-16',
        DisplayName: '塔',
        Category: 'TarotMajor',
        ArcanaNumber: 16
      },
      ...Object.fromEntries(catalogItemIds.map((itemId, index) => {
        const [suit, rank] = [
          ['Wand', 1],
          ['Cup', 5],
          ['Sword', 10],
          ['Pentacle', 13],
          ['Sword', 14]
        ][index];
        return [itemId, {
          FriendlyId: canonicalFriendlyIds[index],
          DisplayName: `${suit} ${rank}`,
          Category: 'TarotMinor',
          ArcanaSuit: suit,
          ArcanaRank: rank
        }];
      }))
    }
  });
});

test('combat profile resolves tarot loadouts saved as Economy V2 stack ids on the first response', async () => {
  const minorCatalogItemId = 'catalog-minor-cup-five';
  const guardianCatalogItemId = 'catalog-major-priestess';

  await withCombatProfilesApi(async ({ handler, readOnlyUpdateRequests }) => {
    const result = await invoke(handler, {
      playFabId: 'PF_REQUESTER',
      targetPlayFabIds: ['PF_REQUESTER']
    });

    expect(result.statusCode).toBe(200);
    expect(result.payload.characters[0]).toMatchObject({
      tarotDeck: [{
        slot: 0,
        itemId: minorCatalogItemId,
        suit: 'Cup',
        rank: 5
      }],
      guardianArcana: {
        itemId: guardianCatalogItemId,
        number: 2,
        passiveId: 'guardian-v3-2'
      }
    });
    await waitForCondition(() => readOnlyUpdateRequests.length >= 2);
    expect(readOnlyUpdateRequests.some((request) => (
      JSON.parse(request.Data.TarotDeck || '[]')[0] === minorCatalogItemId
    ))).toBe(true);
    expect(readOnlyUpdateRequests.some((request) => (
      JSON.parse(request.Data.TarotGuardianArcana || '{}').itemId === guardianCatalogItemId
    ))).toBe(true);
  }, {
    tarotDeckIds: ['stack-cup-five'],
    guardianStoredValue: JSON.stringify({ itemId: 'stack-major-priestess' }),
    inventoryItems: [
      { StackId: 'stack-cup-five', Id: minorCatalogItemId },
      { StackId: 'stack-major-priestess', Id: guardianCatalogItemId }
    ],
    catalogCache: {
      [minorCatalogItemId]: {
        FriendlyId: 'minor-cup-5',
        DisplayName: 'カップ5',
        Category: 'TarotMinor',
        ArcanaSuit: 'Cup',
        ArcanaRank: 5
      },
      [guardianCatalogItemId]: {
        FriendlyId: 'arcana-2',
        DisplayName: '女教皇',
        Category: 'TarotMajor',
        ArcanaNumber: 2
      }
    }
  });
});

test('combat profile recovers a legacy deck when an empty common key was saved prematurely', async () => {
  const catalogItemId = 'catalog-minor-wand-a';
  await withCombatProfilesApi(async ({ handler, readOnlyUpdateRequests }) => {
    const result = await invoke(handler, {
      playFabId: 'PF_REQUESTER',
      targetPlayFabIds: ['PF_REQUESTER']
    });

    expect(result.statusCode).toBe(200);
    expect(result.payload.characters[0].tarotDeck).toEqual([
      expect.objectContaining({ itemId: catalogItemId, suit: 'Wand', rank: 1 })
    ]);
    expect(readOnlyUpdateRequests.some((request) => (
      JSON.parse(request.Data.TarotDeck || '[]')[0] === catalogItemId
    ))).toBe(true);
  }, {
    tarotDeckStoredValue: '[]',
    meleeDeckIds: ['tarot_minor_wand_01'],
    shipDeckIds: [],
    guardianStoredValue: '',
    resolveItemId: (itemId) => (itemId === 'minor-wand-1' ? catalogItemId : itemId),
    inventoryItems: [
      { StackId: 'stack-minor', Id: catalogItemId }
    ],
    catalogCache: {
      [catalogItemId]: {
        FriendlyId: 'minor-wand-1',
        DisplayName: 'ワンドA',
        Category: 'TarotMinor',
        ArcanaSuit: 'Wand',
        ArcanaRank: 1
      }
    }
  });
});

test('combat profile keeps deck and guardian ownership across catalog id migration', async () => {
  const legacyMinorId = 'legacy-minor-cup-a';
  const legacyGuardianId = 'legacy-major-magician';
  const canonicalMinorId = 'catalog-minor-cup-a';
  const canonicalGuardianId = 'catalog-major-magician';
  const resolveItemId = (itemId) => ({
    [legacyMinorId]: canonicalMinorId,
    [legacyGuardianId]: canonicalGuardianId
  }[itemId] || itemId);

  await withCombatProfilesApi(async ({ handler }) => {
    const result = await invoke(handler, {
      playFabId: 'PF_REQUESTER',
      targetPlayFabIds: ['PF_REQUESTER']
    });

    expect(result.statusCode).toBe(200);
    expect(result.payload.characters[0]).toMatchObject({
      tarotDeck: [expect.objectContaining({
        itemId: canonicalMinorId,
        suit: 'Cup',
        rank: 1
      })],
      guardianArcana: expect.objectContaining({
        itemId: canonicalGuardianId,
        number: 1
      })
    });
  }, {
    tarotDeckIds: [legacyMinorId],
    guardianItemId: legacyGuardianId,
    resolveItemId,
    inventoryItems: [
      { StackId: 'stack-sword', Id: 'weapon_sword_01' },
      { StackId: 'stack-armor', Id: 'armor_coat_01' },
      { StackId: 'stack-charm', Id: 'charm_01' },
      { StackId: 'stack-minor', Id: legacyMinorId },
      { StackId: 'stack-guardian', Id: legacyGuardianId }
    ],
    catalogCache: {
      weapon_sword_01: {
        DisplayName: '海賊の剣',
        Category: 'Weapon',
        ManifestWeaponType: 'sword',
        Power: 5
      },
      armor_coat_01: { DisplayName: '船長のコート', Category: 'Armor', Defense: 8 },
      charm_01: { DisplayName: '知恵のお守り', Category: 'Accessory', Int: 4 },
      [canonicalMinorId]: {
        FriendlyId: legacyMinorId,
        DisplayName: 'カップA',
        Category: 'TarotMinor',
        ArcanaSuit: 'Cup',
        ArcanaRank: 1
      },
      [canonicalGuardianId]: {
        FriendlyId: legacyGuardianId,
        DisplayName: '魔術師',
        Category: 'TarotMajor',
        ArcanaNumber: 1
      }
    }
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
