const RESOURCE_ITEM_IDS = ['RR', 'RG', 'RY', 'RB', 'RT', 'RS'];
const PLAYER_SHIP_PROFILE_KEY = 'PlayerShipProfile';

const PLAYER_SHIP_FORMS = {
    boat: {
        form: 'boat',
        stage: 1,
        shipClass: 'common',
        itemId: 'ship_common_boat',
        name: 'ボート'
    },
    explorer: {
        form: 'explorer',
        stage: 2,
        shipClass: 'explorer',
        itemId: 'ship_human_explorer',
        name: 'エクスプローラー'
    },
    defender: {
        form: 'defender',
        stage: 3,
        shipClass: 'defender',
        itemId: 'ship_human_defender',
        name: 'ディフェンダー'
    },
    fighter: {
        form: 'fighter',
        stage: 3,
        shipClass: 'fighter',
        itemId: 'ship_human_fighter',
        name: 'ファイター'
    },
    merchant: {
        form: 'merchant',
        stage: 3,
        shipClass: 'merchant',
        itemId: 'ship_human_merchant',
        name: 'マーチャント'
    }
};

const LEGACY_PLAYER_SHIP_NAMES = {
    boat: new Set(['', 'Common Boat', '手漕ぎボート', '手漕ぎボート(Common)', 'ボート']),
    explorer: new Set(['Explorer', '帆付きボート(Explorer)', '探索船', 'エクスプローラー']),
    defender: new Set(['Defender', '帆船(Defender)', '守備船', 'ディフェンダー']),
    fighter: new Set(['Fighter', '海賊船(Fighter)', '戦闘船', 'ファイター']),
    merchant: new Set(['Merchant', '水上馬車(Merchant)', '商船', 'マーチャント'])
};

const PLAYER_SHIP_UPGRADE_OPTIONS = {
    boat: ['explorer'],
    explorer: ['defender', 'fighter', 'merchant'],
    defender: [],
    fighter: [],
    merchant: []
};

function getPlayerShipMajorArcanaSlotLimit(stageOrForm) {
    if (typeof stageOrForm === 'string' && PLAYER_SHIP_FORMS[stageOrForm]) {
        return getPlayerShipMajorArcanaSlotLimit(PLAYER_SHIP_FORMS[stageOrForm].stage);
    }
    const stage = Math.max(1, Math.floor(Number(stageOrForm || 1) || 1));
    if (stage <= 1) return 1;
    if (stage === 2) return 2;
    return 3;
}

function normalizeMajorArcanaItemIds(value, slotLimit = 1) {
    const limit = getPlayerShipMajorArcanaSlotLimit(slotLimit);
    const unique = [];
    (Array.isArray(value) ? value : []).forEach((itemId) => {
        const id = String(itemId || '').trim();
        if (id && !unique.includes(id)) unique.push(id);
    });
    return unique.slice(0, limit);
}

function normalizeResourceMap(input) {
    const normalized = {};
    for (const itemId of RESOURCE_ITEM_IDS) {
        const amount = Number(input?.[itemId] || 0);
        normalized[itemId] = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0));
    }
    return normalized;
}

function sumResourceMap(input) {
    return RESOURCE_ITEM_IDS.reduce((sum, itemId) => sum + (Number(input?.[itemId] || 0) || 0), 0);
}

function getShipAssetKey(shipId) {
    return `Ship_${shipId}`;
}

function normalizeShipClassFromItemId(itemId) {
    const key = String(itemId || '').trim().toLowerCase();
    if (!key) return 'common';
    if (key === 'ship_common_boat' || key.includes('common')) return 'common';
    if (key.includes('merchant')) return 'merchant';
    if (key.includes('fighter')) return 'fighter';
    if (key.includes('defender')) return 'defender';
    if (key.includes('explorer')) return 'explorer';
    return 'common';
}

function formFromShipClass(shipClass) {
    const key = String(shipClass || '').toLowerCase();
    if (PLAYER_SHIP_FORMS[key]) return key;
    return 'boat';
}

function normalizePlayerShipProfile(input = {}) {
    const form = PLAYER_SHIP_FORMS[input.form] ? input.form : formFromShipClass(input.shipClass);
    const spec = PLAYER_SHIP_FORMS[form] || PLAYER_SHIP_FORMS.boat;
    const rawName = String(input.name || spec.name).trim();
    const name = LEGACY_PLAYER_SHIP_NAMES[form]?.has(rawName) ? spec.name : rawName;
    const majorArcanaSlotLimit = getPlayerShipMajorArcanaSlotLimit(spec.stage);
    const legacyMajorArcana = input.majorArcanaItemId || input.majorArcanaId || input.MajorArcanaId;
    const majorArcanaItemIds = normalizeMajorArcanaItemIds(
        Array.isArray(input.majorArcanaItemIds) ? input.majorArcanaItemIds : (legacyMajorArcana ? [legacyMajorArcana] : []),
        majorArcanaSlotLimit
    );
    return {
        form: spec.form,
        stage: spec.stage,
        shipClass: spec.shipClass,
        itemId: String(input.itemId || spec.itemId),
        name: name.slice(0, 16) || spec.name,
        level: Math.max(1, Math.floor(Number(input.level || 1) || 1)),
        majorArcanaItemIds,
        majorArcanaSlotLimit,
        updatedAtMs: Number(input.updatedAtMs || Date.now()) || Date.now()
    };
}

async function savePlayerShipProfile(playFabId, profile, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const normalized = normalizePlayerShipProfile(profile);
    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: {
            [PLAYER_SHIP_PROFILE_KEY]: JSON.stringify(normalized)
        }
    });
    return normalized;
}

async function getPlayerShipProfile(playFabId, deps, options = {}) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [PLAYER_SHIP_PROFILE_KEY, 'ActiveShipId']
    });
    const raw = result?.Data?.[PLAYER_SHIP_PROFILE_KEY]?.Value;
    if (raw) {
        try {
            return normalizePlayerShipProfile(JSON.parse(raw));
        } catch {
            // fall through to migration/default
        }
    }

    const activeShipId = result?.Data?.ActiveShipId?.Value || null;
    let migrated = null;
    if (activeShipId) {
        const shipData = await getShipAsset(playFabId, activeShipId, deps).catch(() => null);
        const shipClass = normalizeShipClassFromItemId(shipData?.ItemId);
        const form = formFromShipClass(shipClass);
        migrated = normalizePlayerShipProfile({
            form,
            shipClass,
            itemId: shipData?.ItemId,
            name: shipData?.ShipType || shipData?.DisplayName,
            level: shipData?.Level
        });
    }
    const profile = migrated || normalizePlayerShipProfile({ form: 'boat' });
    if (options.persist !== false) {
        await savePlayerShipProfile(playFabId, profile, deps).catch(() => {});
    }
    return profile;
}

async function upgradePlayerShipProfile(playFabId, targetForm, deps) {
    const current = await getPlayerShipProfile(playFabId, deps);
    const target = String(targetForm || '').trim().toLowerCase();
    const allowed = PLAYER_SHIP_UPGRADE_OPTIONS[current.form] || [];
    if (!allowed.includes(target)) {
        const error = new Error('InvalidShipUpgradePath');
        error.currentForm = current.form;
        error.allowed = allowed;
        throw error;
    }
    const currentDefaultNames = LEGACY_PLAYER_SHIP_NAMES[current.form] || new Set();
    const shouldCarryName = current.name && !currentDefaultNames.has(String(current.name).trim());
    const next = normalizePlayerShipProfile({
        ...PLAYER_SHIP_FORMS[target],
        name: shouldCarryName ? current.name : PLAYER_SHIP_FORMS[target].name,
        level: current.level + 1,
        majorArcanaItemIds: current.majorArcanaItemIds,
        updatedAtMs: Date.now()
    });
    return savePlayerShipProfile(playFabId, next, deps);
}

async function renamePlayerShipProfile(playFabId, name, deps) {
    const current = await getPlayerShipProfile(playFabId, deps);
    const trimmed = String(name || '').trim();
    if (!trimmed) {
        const error = new Error('InvalidShipName');
        error.reason = 'empty';
        throw error;
    }
    if (trimmed.length > 16) {
        const error = new Error('InvalidShipName');
        error.reason = 'tooLong';
        throw error;
    }
    return savePlayerShipProfile(playFabId, {
        ...current,
        name: trimmed,
        updatedAtMs: Date.now()
    }, deps);
}

function normalizePresetPayload(input) {
    return normalizeResourceMap(input);
}

async function getActiveShipId(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: ['ActiveShipId']
    });
    return result?.Data?.ActiveShipId?.Value || null;
}

async function getShipAsset(playFabId, shipId, deps) {
    if (!playFabId || !shipId) return null;
    const { promisifyPlayFab, PlayFabServer } = deps;
    const assetKey = getShipAssetKey(shipId);
    const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [assetKey]
    });
    const value = result?.Data?.[assetKey]?.Value;
    if (!value) return null;
    return JSON.parse(value);
}

async function updateShipAsset(playFabId, shipId, shipData, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const assetKey = getShipAssetKey(shipId);
    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: {
            [assetKey]: JSON.stringify(shipData)
        }
    });
}

function getShipResourceCargo(shipData) {
    return normalizeResourceMap(shipData?.ResourceCargo);
}

function setShipResourceCargo(shipData, nextCargo) {
    const normalizedCargo = normalizeResourceMap(nextCargo);
    shipData.ResourceCargo = normalizedCargo;
    return normalizedCargo;
}

function getShipCargoCapacity(shipData) {
    const amount = Number(shipData?.Stats?.CargoCapacity || 0);
    return Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0));
}

async function getShipCargoPreset(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: ['ShipCargoPreset']
    });
    const value = result?.Data?.ShipCargoPreset?.Value;
    if (!value) {
        return normalizePresetPayload({});
    }
    try {
        return normalizePresetPayload(JSON.parse(value));
    } catch (error) {
        return normalizePresetPayload({});
    }
}

async function saveShipCargoPreset(playFabId, preset, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const normalized = normalizePresetPayload(preset);
    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: {
            ShipCargoPreset: JSON.stringify(normalized)
        }
    });
    return normalized;
}

module.exports = {
    RESOURCE_ITEM_IDS,
    PLAYER_SHIP_PROFILE_KEY,
    PLAYER_SHIP_FORMS,
    PLAYER_SHIP_UPGRADE_OPTIONS,
    normalizeResourceMap,
    normalizePresetPayload,
    sumResourceMap,
    getShipAssetKey,
    getActiveShipId,
    getShipAsset,
    updateShipAsset,
    getShipResourceCargo,
    setShipResourceCargo,
    getShipCargoCapacity,
    getShipCargoPreset,
    saveShipCargoPreset,
    getPlayerShipMajorArcanaSlotLimit,
    normalizeMajorArcanaItemIds,
    getPlayerShipProfile,
    savePlayerShipProfile,
    upgradePlayerShipProfile,
    renamePlayerShipProfile,
    normalizePlayerShipProfile
};
