const RESOURCE_ITEM_IDS = ['RR', 'RG', 'RY', 'RB', 'RT', 'RS'];

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
    saveShipCargoPreset
};
