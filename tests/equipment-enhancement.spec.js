const { test, expect } = require('@playwright/test');
const { initializeInventoryRoutes } = require('../server/inventory');
const {
  applyEquipmentEnhancementToCatalogData,
  buildEquipmentEnhancementDescriptor,
  getEquipmentRarityForEffectiveValue,
  getEquipmentRarityContribution,
  resolveArmorFamily,
  resolveWeaponFamily
} = require('../server/equipmentEnhancement');

const getUserReadOnlyDataApi = function getUserReadOnlyDataApi() {};
const updateUserReadOnlyDataApi = function updateUserReadOnlyDataApi() {};
const getInventoryItemsApi = function getInventoryItemsApi() {};
const executeInventoryOperationsApi = function executeInventoryOperationsApi() {};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function makeEnhancementHarness({ inventoryItems, readOnlyData = {}, catalogCache = {}, executeError = null }) {
  const routes = new Map();
  const state = clone(inventoryItems || []);
  const readOnly = clone(readOnlyData);
  const executeRequests = [];
  let eTagVersion = 1;
  const app = {
    post(path, handler) {
      routes.set(path, handler);
    }
  };
  const PlayFabServer = {
    GetUserReadOnlyData: getUserReadOnlyDataApi,
    UpdateUserReadOnlyData: updateUserReadOnlyDataApi
  };
  const PlayFabEconomy = {
    GetInventoryItems: getInventoryItemsApi,
    ExecuteInventoryOperations: executeInventoryOperationsApi
  };

  const applyOperations = (operations) => {
    for (const operation of operations || []) {
      if (operation.Subtract) {
        const ref = operation.Subtract.Item || {};
        const item = state.find((entry) => entry.Id === ref.Id && entry.StackId === ref.StackId);
        if (!item || Number(item.Amount || 0) < Number(operation.Subtract.Amount || 0)) {
          throw new Error('InsufficientInventory');
        }
        item.Amount -= Number(operation.Subtract.Amount || 0);
        if (item.Amount <= 0 && operation.Subtract.DeleteEmptyStacks) {
          state.splice(state.indexOf(item), 1);
        }
      }
      if (operation.Add) {
        const ref = operation.Add.Item || {};
        state.push({
          Id: ref.Id,
          StackId: ref.StackId,
          Amount: Number(operation.Add.Amount || 0),
          DisplayProperties: clone(operation.Add.NewStackValues?.DisplayProperties || {})
        });
      }
      if (operation.Update) {
        const update = operation.Update.Item || {};
        if (update.Amount === undefined && !update.ExpirationDate) {
          throw new Error('Request must contain an amount or an expiration date.');
        }
        const item = state.find((entry) => entry.Id === update.Id && entry.StackId === update.StackId);
        if (!item) throw new Error('ItemNotFound');
        if (update.Amount !== undefined) item.Amount = Number(update.Amount);
        item.DisplayProperties = clone(update.DisplayProperties || {});
      }
    }
  };

  initializeInventoryRoutes(app, {
    PlayFabServer,
    PlayFabEconomy,
    promisifyPlayFab: async (apiFunction, request) => {
      if (apiFunction === getUserReadOnlyDataApi) return { Data: clone(readOnly) };
      if (apiFunction === updateUserReadOnlyDataApi) {
        Object.entries(request.Data || {}).forEach(([key, value]) => {
          if (value === null || value === undefined) delete readOnly[key];
          else readOnly[key] = { Value: String(value) };
        });
        return {};
      }
      if (apiFunction === getInventoryItemsApi) {
        return { Items: clone(state), ETag: `etag-${eTagVersion}` };
      }
      if (apiFunction === executeInventoryOperationsApi) {
        executeRequests.push(clone(request));
        if (executeError) throw executeError;
        if (request.ETag && request.ETag !== `etag-${eTagVersion}`) throw new Error('ETagMismatch');
        applyOperations(request.Operations);
        eTagVersion += 1;
        return { ETag: `etag-${eTagVersion}`, IdempotencyId: request.IdempotencyId };
      }
      return {};
    },
    catalogCache,
    getEntityKeyForPlayFabId: async () => ({ Id: 'ENTITY1', Type: 'title_player_account' }),
    getAllInventoryItems: async () => clone(state),
    getVirtualCurrencyMap: () => ({}),
    addEconomyItem: async () => {},
    subtractEconomyItem: async () => {},
    getCurrencyBalance: async () => 0,
    withTitleEntityToken: async (operation) => operation(),
    requireAuthenticatedPlayFabId: async (_req, _res, playFabId) => playFabId
  });

  return { routes, state, readOnly, executeRequests };
}

async function invoke(handler, body) {
  const response = makeResponse();
  await handler({ body }, response);
  return response;
}

const catalog = {
  sword_001: { Category: 'Weapon', WeaponType: 'sword', DisplayName: '片手剣', Power: 10 },
  sword_002: { Category: 'Weapon', WeaponType: 'sword', DisplayName: '鋼の剣', Power: 14 },
  sword_rare: { Category: 'Weapon', WeaponType: 'sword', DisplayName: '希少な剣', Power: 20 },
  sword_epic: { Category: 'Weapon', WeaponType: 'sword', DisplayName: '英雄の剣', Power: 35 },
  sword_legendary: { Category: 'Weapon', WeaponType: 'sword', DisplayName: '伝説の剣', Power: 60 },
  sword_big_001: { Category: 'Weapon', WeaponType: 'sword_big', DisplayName: '大剣', Power: 20 },
  gun_05: { Category: 'Weapon', WeaponType: 'gun', DisplayName: 'フリントロック', Power: 14 },
  gun_06: { Category: 'Weapon', WeaponType: 'gun', DisplayName: 'ペッパーボックス', Power: 14 },
  leather01_001: { Category: 'Armor', DisplayName: '革鎧', Defense: 8, sprite_path: './Sprites/wardrobe/leather/leather01.png' },
  metal_001: { Category: 'Armor', DisplayName: '鉄鎧', Defense: 12, sprite_path: './Sprites/wardrobe/metal/metal.png' },
  shield_01: { Category: 'Shield', DisplayName: '樹皮の小盾', Defense: 8, sprite_path: './Sprites/weapons/melee weapons/shield.png' },
  shield_02: { Category: 'Shield', DisplayName: '鉄の盾', Defense: 12, sprite_path: './Sprites/weapons/melee weapons/shield.png' }
};

test('equipment families keep weapon variants separate and classify armor and shields', () => {
  expect(resolveWeaponFamily('sword_001', catalog.sword_001)).toBe('sword');
  expect(resolveWeaponFamily('sword_big_001', catalog.sword_big_001)).toBe('sword_big');
  expect(resolveArmorFamily('leather01_001', catalog.leather01_001)).toBe('leather');
  expect(resolveArmorFamily('metal_001', catalog.metal_001)).toBe('metal');
  expect(buildEquipmentEnhancementDescriptor('shield_01', catalog.shield_01)).toMatchObject({
    category: 'Shield',
    family: 'shield',
    primaryStat: 'Defense',
    baseValue: 8,
    materialEligible: true,
    eligible: true
  });
  expect(getEquipmentRarityContribution(catalog.sword_001)).toBe(1);
  expect(getEquipmentRarityContribution(catalog.sword_rare)).toBe(2);
  expect(getEquipmentRarityContribution(catalog.sword_epic)).toBe(3);
  expect(getEquipmentRarityContribution(catalog.sword_legendary)).toBe(4);
});

test('equipment rank rises when its enhanced primary stat crosses a rarity threshold', () => {
  const makeEnhancedItem = (bonus) => ({
    DisplayProperties: { equipmentEnhancement: { version: 1, bonus } }
  });

  expect(buildEquipmentEnhancementDescriptor('sword_001', catalog.sword_001)).toMatchObject({
    effectiveValue: 10,
    rarity: 'common',
    rarityContribution: 1
  });
  expect(buildEquipmentEnhancementDescriptor('sword_001', catalog.sword_001, makeEnhancedItem(8))).toMatchObject({
    effectiveValue: 18,
    rarity: 'rare',
    rarityContribution: 2
  });
  expect(buildEquipmentEnhancementDescriptor('sword_001', catalog.sword_001, makeEnhancedItem(25))).toMatchObject({
    effectiveValue: 35,
    rarity: 'epic',
    rarityContribution: 3
  });
  expect(buildEquipmentEnhancementDescriptor('sword_001', catalog.sword_001, makeEnhancedItem(50))).toMatchObject({
    effectiveValue: 60,
    rarity: 'legendary',
    rarityContribution: 4
  });
  expect(getEquipmentRarityForEffectiveValue(catalog.metal_001, 60)).toBe('legendary');
});

test('enhancement apply combines material rarity with an inherited enhancement bonus', async () => {
  const harness = makeEnhancementHarness({
    catalogCache: catalog,
    inventoryItems: [
      { Id: 'sword_001', StackId: 'base', Amount: 1 },
      { Id: 'sword_002', StackId: 'plain-material', Amount: 2 },
      {
        Id: 'sword_rare',
        StackId: 'enhanced-material',
        Amount: 1,
        DisplayProperties: { equipmentEnhancement: { version: 1, bonus: 3 } }
      }
    ]
  });
  const response = await invoke(harness.routes.get('/api/equipment-enhancement/apply'), {
    playFabId: 'PF1',
    baseStackId: 'base',
    materials: [
      { stackId: 'plain-material', amount: 1 },
      { stackId: 'enhanced-material', amount: 1 }
    ],
    idempotencyId: 'request-0001'
  });

  expect(response.statusCode).toBe(200);
  expect(response.body).toMatchObject({ contribution: 6, targetBonus: 6, targetValue: 16 });
  expect(response.body.materials).toEqual(expect.arrayContaining([
    expect.objectContaining({
      itemId: 'sword_rare',
      rarity: 'rare',
      rarityContribution: 2,
      bonus: 3,
      contribution: 5
    })
  ]));
  expect(harness.state.find((item) => item.StackId === 'base').DisplayProperties).toMatchObject({
    equipmentEnhancement: { version: 1, bonus: 6 }
  });
  expect(harness.state.find((item) => item.StackId === 'plain-material').Amount).toBe(1);
  expect(harness.state.find((item) => item.StackId === 'enhanced-material')).toBeUndefined();
  expect(harness.executeRequests[0].IdempotencyId).toContain('request-0001');
  expect(harness.executeRequests[0].ETag).toBe('etag-1');
  expect(harness.executeRequests[0].Operations.at(-1).Update.Item).toMatchObject({
    Id: 'sword_001',
    StackId: 'base',
    Amount: 1,
    DisplayProperties: { equipmentEnhancement: { version: 1, bonus: 6 } }
  });

  const replay = await invoke(harness.routes.get('/api/equipment-enhancement/apply'), {
    playFabId: 'PF1',
    baseStackId: 'base',
    materials: [
      { stackId: 'plain-material', amount: 1 },
      { stackId: 'enhanced-material', amount: 1 }
    ],
    idempotencyId: 'request-0001'
  });
  expect(replay.statusCode).toBe(409);
  expect(harness.executeRequests).toHaveLength(1);
});

test('enhancement distinguishes different items that share the default Economy stack id', async () => {
  const harness = makeEnhancementHarness({
    catalogCache: catalog,
    readOnlyData: {
      Equipped_RightHand: {
        Value: JSON.stringify({ itemId: 'gun_06', stackId: 'default' })
      }
    },
    inventoryItems: [
      { Id: 'gun_06', StackId: 'default', Amount: 1 },
      { Id: 'gun_05', StackId: 'default', Amount: 2 }
    ]
  });

  const response = await invoke(harness.routes.get('/api/equipment-enhancement/apply'), {
    playFabId: 'PF1',
    baseItemId: 'gun_06',
    baseStackId: 'default',
    materials: [{ itemId: 'gun_05', stackId: 'default', amount: 1 }],
    idempotencyId: 'request-default-stack'
  });

  expect(response.statusCode).toBe(200);
  expect(response.body).toMatchObject({
    base: { itemId: 'gun_06', stackId: 'default', family: 'gun' },
    contribution: 1,
    targetBonus: 1,
    targetValue: 15
  });
  expect(harness.state.find((item) => item.Id === 'gun_06')).toMatchObject({
    StackId: 'default',
    Amount: 1,
    DisplayProperties: { equipmentEnhancement: { version: 1, bonus: 1 } }
  });
  expect(harness.state.find((item) => item.Id === 'gun_05')).toMatchObject({
    StackId: 'default',
    Amount: 1
  });
  expect(JSON.parse(harness.readOnly.Equipped_RightHand.Value)).toEqual({
    itemId: 'gun_06',
    stackId: 'default'
  });
  expect(harness.executeRequests[0].Operations).toEqual(expect.arrayContaining([
    expect.objectContaining({
      Subtract: expect.objectContaining({ Item: { Id: 'gun_05', StackId: 'default' }, Amount: 1 })
    }),
    expect.objectContaining({
      Update: expect.objectContaining({ Item: expect.objectContaining({ Id: 'gun_06', StackId: 'default' }) })
    })
  ]));
});

test('enhancement rejects another weapon variant and a value over 99 without mutation', async () => {
  const harness = makeEnhancementHarness({
    catalogCache: {
      ...catalog,
      sword_098: { Category: 'Weapon', WeaponType: 'sword', DisplayName: '極剣', Power: 98 }
    },
    inventoryItems: [
      { Id: 'sword_098', StackId: 'base', Amount: 1 },
      { Id: 'sword_big_001', StackId: 'big-material', Amount: 1 },
      { Id: 'sword_002', StackId: 'plain-material', Amount: 2 }
    ]
  });

  const mismatch = await invoke(harness.routes.get('/api/equipment-enhancement/preview'), {
    playFabId: 'PF1',
    baseStackId: 'base',
    materials: [{ stackId: 'big-material', amount: 1 }]
  });
  expect(mismatch.statusCode).toBe(400);

  const overCap = await invoke(harness.routes.get('/api/equipment-enhancement/apply'), {
    playFabId: 'PF1',
    baseStackId: 'base',
    materials: [{ stackId: 'plain-material', amount: 2 }],
    idempotencyId: 'request-0002'
  });
  expect(overCap.statusCode).toBe(400);
  expect(harness.executeRequests).toHaveLength(0);
  expect(harness.state.find((item) => item.StackId === 'plain-material').Amount).toBe(2);
});

test('enhancing a legacy equipped stack splits one copy and keeps the result equipped', async () => {
  const harness = makeEnhancementHarness({
    catalogCache: catalog,
    readOnlyData: { Equipped_RightHand: { Value: 'sword_001' } },
    inventoryItems: [
      { Id: 'sword_001', StackId: 'base-stack', Amount: 2 },
      { Id: 'sword_002', StackId: 'material', Amount: 1 }
    ]
  });
  const response = await invoke(harness.routes.get('/api/equipment-enhancement/apply'), {
    playFabId: 'PF1',
    baseStackId: 'base-stack',
    materials: [{ stackId: 'material', amount: 1 }],
    idempotencyId: 'request-0003'
  });

  expect(response.statusCode).toBe(200);
  expect(response.body.targetStackId).not.toBe('base-stack');
  expect(harness.state.find((item) => item.StackId === 'base-stack').Amount).toBe(1);
  const enhanced = harness.state.find((item) => item.StackId === response.body.targetStackId);
  expect(enhanced.DisplayProperties.equipmentEnhancement.bonus).toBe(1);
  expect(JSON.parse(harness.readOnly.Equipped_RightHand.Value)).toEqual({
    itemId: 'sword_001',
    stackId: response.body.targetStackId
  });
  expect(harness.readOnly.EquipmentEnhancementPending).toBeUndefined();
});

test('shield enhancement accepts only shields and keeps the base equipped in the left hand', async () => {
  const harness = makeEnhancementHarness({
    catalogCache: catalog,
    readOnlyData: {
      Equipped_LeftHand: {
        Value: JSON.stringify({ itemId: 'shield_01', stackId: 'shield-base' })
      }
    },
    inventoryItems: [
      { Id: 'shield_01', StackId: 'shield-base', Amount: 1 },
      { Id: 'shield_02', StackId: 'shield-material', Amount: 1 },
      { Id: 'leather01_001', StackId: 'armor-material', Amount: 1 }
    ]
  });

  const mismatch = await invoke(harness.routes.get('/api/equipment-enhancement/preview'), {
    playFabId: 'PF1',
    baseItemId: 'shield_01',
    baseStackId: 'shield-base',
    materials: [{ itemId: 'leather01_001', stackId: 'armor-material', amount: 1 }]
  });
  expect(mismatch.statusCode).toBe(400);

  const response = await invoke(harness.routes.get('/api/equipment-enhancement/apply'), {
    playFabId: 'PF1',
    baseItemId: 'shield_01',
    baseStackId: 'shield-base',
    materials: [{ itemId: 'shield_02', stackId: 'shield-material', amount: 1 }],
    idempotencyId: 'request-shield-0001'
  });

  expect(response.statusCode).toBe(200);
  expect(response.body).toMatchObject({
    base: { itemId: 'shield_01', stackId: 'shield-base', category: 'Shield', family: 'shield', primaryStat: 'Defense' },
    contribution: 1,
    targetBonus: 1,
    targetValue: 9,
    targetStackId: 'shield-base'
  });
  expect(harness.state.find((item) => item.StackId === 'shield-base')).toMatchObject({
    Amount: 1,
    DisplayProperties: { equipmentEnhancement: { version: 1, bonus: 1 } }
  });
  expect(harness.state.find((item) => item.StackId === 'shield-material')).toBeUndefined();
  expect(harness.state.find((item) => item.StackId === 'armor-material')).toMatchObject({ Amount: 1 });
  expect(JSON.parse(harness.readOnly.Equipped_LeftHand.Value)).toEqual({
    itemId: 'shield_01',
    stackId: 'shield-base'
  });
});

test('effective catalog stats are capped at 99', () => {
  const result = applyEquipmentEnhancementToCatalogData(
    'sword_001',
    { Category: 'Weapon', WeaponType: 'sword', Power: 97 },
    { DisplayProperties: { equipmentEnhancement: { version: 1, bonus: 8 } } }
  );
  expect(result.catalogData.Power).toBe(99);
  expect(result.enhancement.storedBonus).toBe(8);
  expect(result.enhancement.bonus).toBe(2);

  const armorResult = applyEquipmentEnhancementToCatalogData(
    'leather01_001',
    catalog.leather01_001,
    { DisplayProperties: { equipmentEnhancement: { version: 1, bonus: 4 } } }
  );
  expect(armorResult.catalogData.Defense).toBe(12);
  expect(armorResult.enhancement.family).toBe('leather');

  const shieldResult = applyEquipmentEnhancementToCatalogData(
    'shield_01',
    catalog.shield_01,
    { DisplayProperties: { equipmentEnhancement: { version: 1, bonus: 5 } } }
  );
  expect(shieldResult.catalogData.Defense).toBe(13);
  expect(shieldResult.enhancement.family).toBe('shield');
});

test('equipped material stacks are rejected before Economy mutation', async () => {
  const harness = makeEnhancementHarness({
    catalogCache: catalog,
    readOnlyData: {
      Equipped_RightHand: {
        Value: JSON.stringify({ itemId: 'sword_002', stackId: 'equipped-material' })
      }
    },
    inventoryItems: [
      { Id: 'sword_001', StackId: 'base', Amount: 1 },
      { Id: 'sword_002', StackId: 'equipped-material', Amount: 1 }
    ]
  });

  const response = await invoke(harness.routes.get('/api/equipment-enhancement/apply'), {
    playFabId: 'PF1',
    baseStackId: 'base',
    materials: [{ stackId: 'equipped-material', amount: 1 }],
    idempotencyId: 'request-0005'
  });

  expect(response.statusCode).toBe(400);
  expect(response.body.error).toBe('装備中の個体は素材にできません。');
  expect(harness.executeRequests).toHaveLength(0);
});

test('enhancement reports a concurrent Economy precondition failure without local mutation', async () => {
  const executeError = new Error('Inventory precondition failed');
  executeError.apiErrorInfo = { apiError: 'PreconditionFailed' };
  const harness = makeEnhancementHarness({
    catalogCache: catalog,
    executeError,
    inventoryItems: [
      { Id: 'sword_001', StackId: 'base', Amount: 1 },
      { Id: 'sword_002', StackId: 'material', Amount: 1 }
    ]
  });

  const response = await invoke(harness.routes.get('/api/equipment-enhancement/apply'), {
    playFabId: 'PF1',
    baseStackId: 'base',
    materials: [{ stackId: 'material', amount: 1 }],
    idempotencyId: 'request-0004'
  });

  expect(response.statusCode).toBe(409);
  expect(response.body.error).toBe('持ち物が更新されました。再読み込みしてやり直してください。');
  expect(harness.state).toEqual([
    { Id: 'sword_001', StackId: 'base', Amount: 1 },
    { Id: 'sword_002', StackId: 'material', Amount: 1 }
  ]);
});

test('enhancement maps a throttled Economy request to a retryable response without mutation', async () => {
  const executeError = new Error('The client has exceeded the maximum API request rate and is being throttled');
  const harness = makeEnhancementHarness({
    catalogCache: catalog,
    executeError,
    inventoryItems: [
      { Id: 'sword_001', StackId: 'base', Amount: 1 },
      { Id: 'sword_002', StackId: 'material', Amount: 1 }
    ]
  });

  const response = await invoke(harness.routes.get('/api/equipment-enhancement/apply'), {
    playFabId: 'PF1',
    baseStackId: 'base',
    materials: [{ stackId: 'material', amount: 1 }],
    idempotencyId: 'request-throttled'
  });

  expect(response.statusCode).toBe(429);
  expect(response.headers['Retry-After']).toBe('2');
  expect(response.body).toEqual({
    error: '強化処理が混み合っています。2秒ほど待ってから、もう一度実行してください。'
  });
  expect(harness.state).toEqual([
    { Id: 'sword_001', StackId: 'base', Amount: 1 },
    { Id: 'sword_002', StackId: 'material', Amount: 1 }
  ]);
});
