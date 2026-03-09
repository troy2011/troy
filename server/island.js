// server/island.js
// 島関連のAPI

const { geohashForLocation } = require('geofire-common');
const { VIRTUAL_CURRENCY_CODE } = require('./economy');
const resourceStorage = require('./resourceStorage');
const {
    getSizeTag,
    sizeTagMatchesIsland,
    normalizeSize,
    inferLogicSizeFromSlotsRequired,
    computeMaxHp,
    getBuildingSpec,
    computeConstructionStatus,
    buildingDefs
} = require('./building');

const RESOURCE_INTERVAL_MS = 10 * 60 * 1000;
const RESOURCE_BIOME_CURRENCY = {
    volcanic: 'RR',
    rocky: 'RG',
    mushroom: 'RY',
    lake: 'RB',
    forest: 'RT',
    sacred: 'RS'
};
const RESOURCE_BIOME_JP = {
    '火山': 'volcanic',
    '岩場': 'rocky',
    'キノコ': 'mushroom',
    '湖': 'lake',
    '森林': 'forest',
    '聖地': 'sacred'
};
const RESOURCE_BIOMES = new Set(['volcanic', 'rocky', 'mushroom', 'lake', 'forest', 'sacred']);
const WORLD_GRID_SIZE = 32;
const MAP_TILE_LIMIT = 100;
const CREATE_ISLAND_COST_BY_SIZE = {
    small: 500,
    large: 2500,
    giant: 5000
};
const ISLAND_SIZE_DIMENSIONS = {
    small: { w: 3, h: 3 },
    medium: { w: 4, h: 3 },
    large: { w: 4, h: 4 },
    giant: { w: 5, h: 5 }
};
const RESOURCE_RATIO_BY_NATION = {
    fire: { RR: 0.6, RG: 0.3, RT: 0.1 },
    earth: { RG: 0.6, RR: 0.3, RT: 0.1 },
    wind: { RY: 0.6, RB: 0.3, RT: 0.1 },
    water: { RB: 0.6, RY: 0.3, RT: 0.1 }
};
const NATION_ALIAS = {
    wands: 'fire',
    pentacles: 'earth',
    swords: 'wind',
    cups: 'water'
};
const CAPTURE_MIN_DURATION_MS = 60 * 1000;
const CAPTURE_MAX_DURATION_MS = 5 * 60 * 1000;
const CAPTURE_SPEED_PER_EXTRA = 0.5;
const CAPTURE_SPEED_MAX = 4;
const CAPTURE_SLOT_LIMIT_BY_ISLAND_SIZE = {
    small: 1,
    medium: 2,
    large: 4,
    giant: 8
};
const HOME_STORAGE_RESOURCE_CODES = ['RR', 'RG', 'RY', 'RB', 'RT', 'RS'];
const MY_HOME_STORAGE_DAMAGE_RATIO_BY_LEVEL = {
    1: 0.36,
    2: 0.28,
    3: 0.22,
    4: 0.16,
    5: 0.12
};
const MY_HOME_STORAGE_LOOT_RATIO = 0.5;
const FIXED_BUILDING_RESOURCE_COSTS = {
    my_house: {
        1: [{ code: 'RT', amount: 2 }],
        2: [{ code: 'RT', amount: 3 }],
        3: [{ code: 'RT', amount: 5 }, { code: 'RS', amount: 1 }],
        4: [{ code: 'RT', amount: 7 }, { code: 'RS', amount: 1 }],
        5: [{ code: 'RT', amount: 9 }, { code: 'RS', amount: 2 }]
    },
    watchtower: {
        1: [{ code: 'RT', amount: 2 }],
        2: [{ code: 'RT', amount: 2 }],
        3: [{ code: 'RT', amount: 4 }, { code: 'RS', amount: 1 }]
    },
    teslatower: {
        1: [{ code: 'RT', amount: 2 }],
        2: [{ code: 'RT', amount: 2 }],
        3: [{ code: 'RT', amount: 4 }, { code: 'RS', amount: 1 }]
    },
    coastal_battery: {
        1: [{ code: 'RT', amount: 2 }, { code: 'RS', amount: 1 }]
    },
    dragon_gate: {
        1: [{ code: 'RT', amount: 7 }, { code: 'RS', amount: 2 }]
    },
    shipyard: {
        1: [{ code: 'RT', amount: 8 }, { code: 'RS', amount: 2 }]
    },
    farm: {
        1: [{ code: 'RT', amount: 3 }]
    },
    weapon_shop: {
        1: [{ code: 'RT', amount: 4 }]
    },
    armor_shop: {
        1: [{ code: 'RT', amount: 4 }]
    },
    item_shop: {
        1: [{ code: 'RT', amount: 3 }]
    },
    tavern: {
        1: [{ code: 'RT', amount: 2 }]
    },
    inn: {
        1: [{ code: 'RT', amount: 4 }]
    },
    hot_spring: {
        1: [{ code: 'RT', amount: 4 }]
    },
    repair_dock: {
        1: [{ code: 'RT', amount: 5 }, { code: 'RS', amount: 1 }]
    },
    temple: {
        1: [{ code: 'RT', amount: 10 }, { code: 'RS', amount: 2 }],
        2: [{ code: 'RT', amount: 12 }, { code: 'RS', amount: 3 }],
        3: [{ code: 'RT', amount: 15 }, { code: 'RS', amount: 4 }]
    },
    goddess_statue: {
        1: [{ code: 'RT', amount: 6 }, { code: 'RS', amount: 1 }]
    },
    arcana_fool_tavern: {
        1: [{ code: 'RT', amount: 5 }, { code: 'RS', amount: 1 }]
    },
    arcana_magician_school: {
        1: [{ code: 'RT', amount: 8 }, { code: 'RS', amount: 2 }]
    },
    arcana_priestess_fountain_palace: {
        1: [{ code: 'RT', amount: 8 }, { code: 'RS', amount: 2 }]
    },
    arcana_empress_garden: {
        1: [{ code: 'RT', amount: 8 }, { code: 'RS', amount: 2 }]
    },
    arcana_emperor_training: {
        1: [{ code: 'RT', amount: 8 }, { code: 'RS', amount: 2 }]
    },
    arcana_hierophant_lab: {
        1: [{ code: 'RT', amount: 9 }, { code: 'RS', amount: 2 }]
    },
    arcana_lovers_palace: {
        1: [{ code: 'RT', amount: 9 }, { code: 'RS', amount: 2 }]
    },
    arcana_chariot_factory: {
        1: [{ code: 'RT', amount: 9 }, { code: 'RS', amount: 2 }]
    },
    arcana_strength_fortress: {
        1: [{ code: 'RT', amount: 9 }, { code: 'RS', amount: 2 }]
    },
    arcana_hermit_lodge: {
        1: [{ code: 'RT', amount: 10 }, { code: 'RS', amount: 2 }]
    },
    arcana_wheel_casino: {
        1: [{ code: 'RT', amount: 10 }, { code: 'RS', amount: 2 }]
    },
    arcana_justice_court: {
        1: [{ code: 'RT', amount: 10 }, { code: 'RS', amount: 2 }]
    },
    arcana_hanged_altar: {
        1: [{ code: 'RT', amount: 10 }, { code: 'RS', amount: 2 }]
    },
    arcana_death_mausoleum: {
        1: [{ code: 'RT', amount: 10 }, { code: 'RS', amount: 2 }]
    },
    arcana_temperance_spring: {
        1: [{ code: 'RT', amount: 10 }, { code: 'RS', amount: 2 }]
    },
    arcana_devil_black_market: {
        1: [{ code: 'RT', amount: 12 }, { code: 'RS', amount: 3 }]
    },
    arcana_tower_judgement: {
        1: [{ code: 'RT', amount: 11 }, { code: 'RS', amount: 2 }]
    },
    arcana_star_observatory: {
        1: [{ code: 'RT', amount: 12 }, { code: 'RS', amount: 3 }]
    },
    arcana_moon_shrine: {
        1: [{ code: 'RT', amount: 12 }, { code: 'RS', amount: 3 }]
    },
    arcana_sun_temple: {
        1: [{ code: 'RT', amount: 11 }, { code: 'RS', amount: 2 }]
    },
    arcana_judgement_belltower: {
        1: [{ code: 'RT', amount: 13 }, { code: 'RS', amount: 3 }]
    },
    arcana_world_tree: {
        1: [{ code: 'RT', amount: 15 }, { code: 'RS', amount: 4 }]
    }
};
const OWNED_MAP_IDS_KEY = 'OwnedMapIds';

function getCentralIslandIdForMap(mapId) {
    const key = String(mapId || '').toLowerCase();
    if (!key) return null;
    if (key.startsWith('major_')) return key;
    switch (key) {
        case 'wands':
            return 'capital_fire';
        case 'pentacles':
            return 'capital_earth';
        case 'swords':
            return 'capital_wind';
        case 'cups':
            return 'capital_water';
        default:
            return null;
    }
}

function normalizeEntityKey(input) {
    const id = input?.Id || input?.id || null;
    const type = input?.Type || input?.type || null;
    if (!id || !type) return null;
    return { Id: String(id), Type: String(type) };
}

function normalizePriceAmounts(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
        return Object.entries(value).map(([code, amount]) => ({
            ItemId: code,
            Amount: Number(amount)
        }));
    }
    return [];
}

function normalizeMapId(mapId) {
    const raw = String(mapId || '').trim();
    return raw ? raw : null;
}

function normalizeBiomeKey(biome) {
    if (!biome) return '';
    const raw = String(biome).trim();
    return (RESOURCE_BIOME_JP[raw] || raw).toLowerCase();
}

function normalizeNationKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;
    return NATION_ALIAS[raw] || raw;
}

function computeBaseCostAmount(costEntries) {
    const normalized = Array.isArray(costEntries) ? costEntries : [];
    const ps = normalized
        .filter((entry) => String(entry?.code || entry?.ItemId || '').toUpperCase() === VIRTUAL_CURRENCY_CODE)
        .reduce((sum, entry) => sum + (Number(entry?.amount ?? entry?.Amount ?? 0) || 0), 0);
    if (ps > 0) return ps;
    return normalized.reduce((sum, entry) => sum + (Number(entry?.amount ?? entry?.Amount ?? 0) || 0), 0);
}

function mergeCostEntries(entries, extra) {
    const map = new Map();
    entries.forEach((entry) => {
        const code = String(entry?.code || entry?.ItemId || '').trim();
        if (!code) return;
        map.set(code, (map.get(code) || 0) + (Number(entry?.amount ?? entry?.Amount ?? 0) || 0));
    });
    extra.forEach((entry) => {
        const code = String(entry?.ItemId || '').trim();
        if (!code) return;
        map.set(code, (map.get(code) || 0) + (Number(entry?.Amount) || 0));
    });
    return Array.from(map.entries()).map(([code, amount]) => ({ code, amount }));
}

function applyNationResourceCosts(costEntries, nationKey, options = {}) {
    const normalizedNation = normalizeNationKey(nationKey);
    const ratios = normalizedNation ? RESOURCE_RATIO_BY_NATION[normalizedNation] : null;
    if (!ratios) return costEntries;

    const baseAmount = computeBaseCostAmount(costEntries);
    if (baseAmount <= 0) return costEntries;

    const useSacred = !!options.useSacred;
    const resources = Object.entries(ratios).map(([code, ratio]) => {
        const resolvedCode = useSacred && code === 'RT' ? 'RS' : code;
        return { ItemId: resolvedCode, Amount: Math.max(1, Math.round(baseAmount * ratio)) };
    });
    if (options.onlyResource) return resources.map((entry) => ({ code: entry.ItemId, amount: entry.Amount }));
    return mergeCostEntries(costEntries, resources);
}

function getFixedBuildingResourceCostEntries(buildingId, targetLevel = 1) {
    const table = FIXED_BUILDING_RESOURCE_COSTS[String(buildingId || '').trim()];
    if (!table) return [];
    const entries = table[Math.max(1, Math.trunc(Number(targetLevel) || 1))] || [];
    return entries
        .map((entry) => ({
            code: String(entry?.code || '').trim(),
            amount: Number(entry?.amount ?? 0) || 0
        }))
        .filter((entry) => entry.code && entry.amount > 0);
}

function isSmallIslandSize(size) {
    const key = String(size || '').toLowerCase();
    return key === 'small' || key === 's';
}

function canBuildToOccupy({ island, playerNation, mapOccupationNation }) {
    const ownerId = island?.ownerId || null;
    if (ownerId) return false;
    const normalizedPlayerNation = String(playerNation || '').toLowerCase();
    const normalizedMapNation = String(mapOccupationNation || '').toLowerCase();
    const isOwnedArea = !normalizedMapNation || (!!normalizedPlayerNation && normalizedPlayerNation === normalizedMapNation);
    if (!isOwnedArea) return false;
    const biomeKey = normalizeBiomeKey(island?.biome);
    if (RESOURCE_BIOMES.has(biomeKey)) return false;
    const occupationStatus = String(island?.occupationStatus || '').toLowerCase();
    if (occupationStatus === 'capital' || occupationStatus === 'sacred') return false;
    const buildings = Array.isArray(island?.buildings) ? island.buildings : [];
    const hasBuilding = buildings.some(b => b && b.status !== 'demolished');
    return !hasBuilding;
}

function rectsOverlap(a, b) {
    return (
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
    );
}

function getObjectRect(data) {
    if (!data || !data.coordinate) return null;
    const x = Math.floor(Number(data.coordinate.x));
    const y = Math.floor(Number(data.coordinate.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    if (String(data.type || '').toLowerCase() === 'obstacle') {
        const w = Math.max(1, Math.floor(Number(data.width) || 1));
        const h = Math.max(1, Math.floor(Number(data.height) || 1));
        return { x, y, w, h };
    }

    const sizeKey = String(data.size || 'small').toLowerCase();
    const dim = ISLAND_SIZE_DIMENSIONS[sizeKey] || ISLAND_SIZE_DIMENSIONS.small;
    return { x, y, w: dim.w, h: dim.h };
}

function resolveCreateIslandPlacement({ worldX, worldY, sizeKey = 'small' }) {
    const dim = ISLAND_SIZE_DIMENSIONS[sizeKey] || ISLAND_SIZE_DIMENSIONS.small;
    const tileX = Math.floor(Number(worldX) / WORLD_GRID_SIZE);
    const tileY = Math.floor(Number(worldY) / WORLD_GRID_SIZE);
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return null;

    const centerOffsetX = Math.floor(dim.w / 2);
    const centerOffsetY = Math.floor(dim.h / 2);
    const x = Math.max(0, Math.min(MAP_TILE_LIMIT - dim.w, tileX - centerOffsetX));
    const y = Math.max(0, Math.min(MAP_TILE_LIMIT - dim.h, tileY - centerOffsetY));
    return { x, y, w: dim.w, h: dim.h };
}

function normalizeCreateIslandSize(size) {
    const key = String(size || '').trim().toLowerCase();
    if (!key) return 'small';
    if (key === 'small' || key === 's' || key === '小') return 'small';
    if (key === 'large' || key === 'l' || key === '中') return 'large';
    if (key === 'giant' || key === 'g' || key === '大') return 'giant';
    return null;
}

function parseOwnedMapIds(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.map(normalizeMapId).filter(Boolean);
    }
    if (typeof raw !== 'string') return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.map(normalizeMapId).filter(Boolean);
        }
    } catch {}
    return raw.split(',').map(normalizeMapId).filter(Boolean);
}

function uniqueMapIds(list) {
    const seen = new Set();
    const output = [];
    (list || []).forEach((entry) => {
        const value = normalizeMapId(entry);
        if (!value || seen.has(value)) return;
        seen.add(value);
        output.push(value);
    });
    return output;
}

async function getOwnedMapIds(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [OWNED_MAP_IDS_KEY]
    });
    const raw = ro?.Data?.[OWNED_MAP_IDS_KEY]?.Value;
    return parseOwnedMapIds(raw);
}

async function setOwnedMapIds(playFabId, mapIds, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const normalized = uniqueMapIds(mapIds);
    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: {
            [OWNED_MAP_IDS_KEY]: JSON.stringify(normalized)
        }
    });
    return normalized;
}

async function addOwnedMapId(playFabId, mapId, deps) {
    const normalized = normalizeMapId(mapId);
    if (!normalized) return [];
    const current = await getOwnedMapIds(playFabId, deps);
    if (current.includes(normalized)) return current;
    current.push(normalized);
    return setOwnedMapIds(playFabId, current, deps);
}

async function removeOwnedMapId(playFabId, mapId, deps) {
    const normalized = normalizeMapId(mapId);
    if (!normalized) return [];
    const current = await getOwnedMapIds(playFabId, deps);
    const next = current.filter((entry) => entry !== normalized);
    if (next.length === current.length) return current;
    return setOwnedMapIds(playFabId, next, deps);
}

function getIslandCaptureSlotLimit(sizeKey) {
    const normalized = String(sizeKey || 'small').toLowerCase();
    return Number(CAPTURE_SLOT_LIMIT_BY_ISLAND_SIZE[normalized] || CAPTURE_SLOT_LIMIT_BY_ISLAND_SIZE.small);
}

function getMyHomeStorageDamageRatio(level) {
    const normalizedLevel = Math.max(1, Math.trunc(Number(level) || 1));
    return MY_HOME_STORAGE_DAMAGE_RATIO_BY_LEVEL[normalizedLevel] || MY_HOME_STORAGE_DAMAGE_RATIO_BY_LEVEL[5];
}

function getBuildingCaptureArea(building) {
    if (!building) return 0;
    const inferred = inferLogicSizeFromSlotsRequired(building?.slotsRequired || 1);
    const logicW = Math.max(1, Number(building.logicW || building.width || inferred.w || 1));
    const logicH = Math.max(1, Number(building.logicH || building.height || inferred.h || 1));
    return logicW * logicH;
}

function getIslandCaptureBaseDurationMs(island) {
    const buildings = Array.isArray(island?.buildings) ? island.buildings : [];
    const primary = buildings.find((entry) => entry && entry.status !== 'demolished') || buildings[0] || null;
    const area = Math.max(0, getBuildingCaptureArea(primary));
    if (area <= 1) return CAPTURE_MIN_DURATION_MS;
    if (area <= 2) return 2 * 60 * 1000;
    if (area <= 4) return 3 * 60 * 1000;
    if (area <= 6) return 4 * 60 * 1000;
    return CAPTURE_MAX_DURATION_MS;
}

function getCaptureSpeedMultiplier(memberCount) {
    const count = Math.max(1, Math.floor(Number(memberCount) || 1));
    return Math.min(CAPTURE_SPEED_MAX, 1 + ((count - 1) * CAPTURE_SPEED_PER_EXTRA));
}

function normalizeCaptureQueue(raw) {
    if (!Array.isArray(raw)) return [];
    const queue = [];
    raw.forEach((entry) => {
        const playFabId = String(entry?.playFabId || '').trim();
        if (!playFabId) return;
        queue.push({
            playFabId,
            nation: String(entry?.nation || '').toLowerCase() || null,
            joinedAt: Number(entry?.joinedAt) || 0
        });
    });
    return queue;
}

function hasUndemolishedBuilding(island) {
    const buildings = Array.isArray(island?.buildings) ? island.buildings : [];
    return buildings.some((entry) => entry && entry.status !== 'demolished');
}

function isIslandBreached(island) {
    const buildings = Array.isArray(island?.buildings) ? island.buildings : [];
    if (buildings.length === 0) return true;
    const active = buildings.find((entry) => entry && entry.status !== 'demolished');
    if (!active) return true;
    const maxHp = Number(active.maxHp) || Number(active.buildTimeSeconds) || 1;
    const currentHp = Number.isFinite(Number(active.currentHp)) ? Number(active.currentHp) : maxHp;
    return currentHp <= 0;
}

function createIdleCaptureState(island) {
    const breached = isIslandBreached(island);
    return {
        status: breached ? 'breached' : 'idle',
        breachedAt: breached ? Date.now() : 0,
        queue: [],
        slotLimit: getIslandCaptureSlotLimit(island?.size),
        baseDurationMs: getIslandCaptureBaseDurationMs(island),
        progressBaseMs: 0,
        lastProgressAt: 0,
        endsAt: 0,
        ownerCandidateId: null,
        ownerCandidateNation: null
    };
}

function sanitizeCaptureState(raw, island) {
    const fallback = createIdleCaptureState(island);
    const queue = normalizeCaptureQueue(raw?.queue);
    const baseDurationMs = getIslandCaptureBaseDurationMs(island);
    const state = {
        status: String(raw?.status || fallback.status).toLowerCase(),
        breachedAt: Number(raw?.breachedAt) || fallback.breachedAt,
        queue,
        slotLimit: getIslandCaptureSlotLimit(island?.size),
        baseDurationMs,
        progressBaseMs: Math.max(0, Math.min(baseDurationMs, Number(raw?.progressBaseMs) || 0)),
        lastProgressAt: Number(raw?.lastProgressAt) || 0,
        endsAt: Number(raw?.endsAt) || 0,
        ownerCandidateId: raw?.ownerCandidateId ? String(raw.ownerCandidateId) : (queue[0]?.playFabId || null),
        ownerCandidateNation: raw?.ownerCandidateNation ? String(raw.ownerCandidateNation).toLowerCase() : (queue[0]?.nation || null)
    };
    if (queue.length > 0) {
        state.status = 'capturing';
    } else if (!isIslandBreached(island)) {
        state.status = 'idle';
        state.breachedAt = 0;
    } else if (state.status !== 'capturing') {
        state.status = 'breached';
    }
    return state;
}

function advanceCaptureState(state, now = Date.now()) {
    if (!state || state.status !== 'capturing' || !Array.isArray(state.queue) || state.queue.length === 0) {
        return state;
    }
    const lastAt = Number(state.lastProgressAt) || 0;
    if (lastAt > 0 && now > lastAt) {
        const elapsedMs = now - lastAt;
        state.progressBaseMs = Math.min(
            state.baseDurationMs,
            state.progressBaseMs + (elapsedMs * getCaptureSpeedMultiplier(state.queue.length))
        );
    }
    state.lastProgressAt = now;
    const remainingBaseMs = Math.max(0, state.baseDurationMs - state.progressBaseMs);
    state.endsAt = remainingBaseMs <= 0
        ? now
        : now + Math.ceil(remainingBaseMs / getCaptureSpeedMultiplier(state.queue.length));
    return state;
}

function refreshCaptureState(rawState, island, now = Date.now()) {
    const state = sanitizeCaptureState(rawState, island);
    state.slotLimit = getIslandCaptureSlotLimit(island?.size);
    state.baseDurationMs = getIslandCaptureBaseDurationMs(island);
    state.progressBaseMs = Math.max(0, Math.min(state.baseDurationMs, state.progressBaseMs));
    if (state.queue.length > 0) {
        state.status = 'capturing';
        state.ownerCandidateId = state.queue[0].playFabId;
        state.ownerCandidateNation = state.queue[0].nation || null;
        return advanceCaptureState(state, now);
    }
    state.lastProgressAt = 0;
    state.endsAt = 0;
    state.ownerCandidateId = null;
    state.ownerCandidateNation = null;
    state.status = isIslandBreached(island) ? 'breached' : 'idle';
    if (state.status === 'idle') {
        state.breachedAt = 0;
    }
    return state;
}

function getWorldMapCollection(firestore, mapId) {
    const raw = String(mapId || '').trim();
    if (!raw) return firestore.collection('world_map');
    return firestore.collection(`world_map_${raw}`);
}

async function findIslandDocAcrossMaps(firestore, islandId, mapIds = null) {
    if (!Array.isArray(mapIds) || mapIds.length === 0) {
        return { snap: null, mapId: null, collection: null };
    }
    const mapCollections = mapIds.map((mapId) => getWorldMapCollection(firestore, mapId));

    for (const col of mapCollections) {
        const snap = await col.doc(islandId).get();
        if (snap.exists) {
            const mapId = col.id === 'world_map' ? null : col.id.slice('world_map_'.length);
            return { snap, mapId, collection: col };
        }
    }

    return { snap: null, mapId: null, collection: null };
}

async function resolveOwnedMapIds(firestore, playFabId, deps) {
    if (deps?.promisifyPlayFab && deps?.PlayFabServer) {
        const owned = await getOwnedMapIds(playFabId, deps);
        if (owned.length > 0) return owned;
    }
    return [];
}

async function hasMyHouseOwned(firestore, playFabId, deps, preferredMapId = null) {
    if (!playFabId) return false;
    const mapIds = [];
    if (preferredMapId) mapIds.push(normalizeMapId(preferredMapId));
    const owned = await resolveOwnedMapIds(firestore, playFabId, deps);
    owned.forEach((id) => mapIds.push(id));
    const unique = uniqueMapIds(mapIds);
    if (unique.length === 0) return false;
    for (const mapId of unique) {
        const col = getWorldMapCollection(firestore, mapId);
        const snapshot = await col.where('ownerId', '==', playFabId).get();
        if (snapshot.empty) continue;
        for (const doc of snapshot.docs) {
            const data = doc.data() || {};
            const buildings = Array.isArray(data.buildings) ? data.buildings : [];
            const hasHouse = buildings.some((b) => {
                if (!b || b.status === 'demolished') return false;
                const rawId = String(b.buildingId || b.id || '');
                return rawId === 'my_house' || rawId.startsWith('my_house');
            });
            if (hasHouse) return true;
        }
    }
    return false;
}

function worldToLatLng(point) {
    const gridSize = 32;
    const mapTileSize = 500;
    const metersPerTile = 100;
    const mapPixelSize = mapTileSize * gridSize;
    const metersPerPixel = metersPerTile / gridSize;
    const dxMeters = (point.x - mapPixelSize / 2) * metersPerPixel;
    const dyMeters = (mapPixelSize / 2 - point.y) * metersPerPixel;

    const lat = dyMeters / 110574;
    const lng = dxMeters / 111320;
    return { lat, lng };
}

async function deleteOwnedIslands(firestore, playFabId, deps = null) {
    const mapIds = await resolveOwnedMapIds(firestore, playFabId, deps);
    const mapCollections = mapIds.map((mapId) => getWorldMapCollection(firestore, mapId));
    let deleted = 0;
    for (const col of mapCollections) {
        const snapshot = await col.where('ownerId', '==', playFabId).get();
        if (snapshot.empty) continue;
        const batch = firestore.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += snapshot.size;
    }
    if (deps?.promisifyPlayFab && deps?.PlayFabServer) {
        await setOwnedMapIds(playFabId, [], deps);
    }
    return { deleted };
}

async function transferOwnedIslands(firestore, fromPlayFabId, toPlayFabId, toNation, deps = null) {
    const mapIds = await resolveOwnedMapIds(firestore, fromPlayFabId, deps);
    const mapCollections = mapIds.map((mapId) => getWorldMapCollection(firestore, mapId));

    let transferred = 0;
    const touchedMapIds = new Set();
    for (const col of mapCollections) {
        const snapshot = await col.where('ownerId', '==', fromPlayFabId).get();
        if (snapshot.empty) continue;
        const mapId = col.id === 'world_map' ? null : col.id.slice('world_map_'.length);
        if (mapId) touchedMapIds.add(mapId);
        let batch = firestore.batch();
        let batchCount = 0;
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, {
                ownerId: toPlayFabId,
                ownerNation: toNation || null
            });
            transferred += 1;
            batchCount += 1;
            if (batchCount >= 450) {
                batch.commit();
                batch = firestore.batch();
                batchCount = 0;
            }
        });
        if (batchCount > 0) {
            await batch.commit();
        }
    }

    if (deps?.promisifyPlayFab && deps?.PlayFabServer) {
        const mapList = Array.from(touchedMapIds);
        for (const mapId of mapList) {
            await addOwnedMapId(toPlayFabId, mapId, deps);
            await removeOwnedMapId(fromPlayFabId, mapId, deps);
        }
    }

    return { transferred };
}

async function relocateActiveShip(firestore, playFabId, respawnPosition, deps) {
    const { promisifyPlayFab, PlayFabServer, admin } = deps;
    const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: ['ActiveShipId']
    });
    const activeShipId = ro?.Data?.ActiveShipId?.Value;
    if (!activeShipId) return { moved: false, reason: 'no_active_ship' };

    const geoPoint = worldToLatLng(respawnPosition);
    const geohash = geohashForLocation([geoPoint.lat, geoPoint.lng]);
    const now = Date.now();
    const patch = {
        position: { x: respawnPosition.x, y: respawnPosition.y },
        currentX: respawnPosition.x,
        currentY: respawnPosition.y,
        targetX: respawnPosition.x,
        targetY: respawnPosition.y,
        arrivalTime: now,
        movement: {
            isMoving: false,
            departureTime: null,
            arrivalTime: null,
            departurePos: null,
            destinationPos: null
        },
        geohash: geohash,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };

    await Promise.all([
        firestore.collection('ships').doc(playFabId).set(patch, { merge: true }),
        firestore.collection('ships').doc(activeShipId).set(patch, { merge: true })
    ]);

    return { moved: true, shipId: activeShipId };
}

function getActiveShipIdForResource(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    return promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: ['ActiveShipId']
    }).then(result => {
        const value = result?.Data?.ActiveShipId?.Value;
        return (typeof value === 'string' && value.trim()) ? value.trim() : null;
    });
}

async function getActiveShipCargoCapacity(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const activeShipId = await getActiveShipIdForResource(playFabId, deps);
    if (!activeShipId) return 0;

    const key = `Ship_${activeShipId}`;
    const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [key]
    });
    const raw = result?.Data?.[key]?.Value;
    if (!raw) return 0;

    let shipData = null;
    try {
        shipData = JSON.parse(raw);
    } catch {
        return 0;
    }
    const capacity = Number(shipData?.Stats?.CargoCapacity);
    return Number.isFinite(capacity) ? Math.max(0, Math.trunc(capacity)) : 0;
}

// APIルートを初期化
function initializeIslandRoutes(app, deps) {
    const { promisifyPlayFab, PlayFabServer, firestore, admin, addEconomyItem, subtractEconomyItem, getVirtualCurrencyMap, getAllInventoryItems, getEntityKeyForPlayFabId, getNationTaxRateBps, applyTax, addNationTreasury, setMapOccupationNation, getMapOccupationNation, NATION_GROUP_BY_RACE, catalogCache } = deps;

    const islandDeps = { promisifyPlayFab, PlayFabServer, admin };
    const getPlayerNation = async (playFabId) => {
        if (!playFabId) return '';
        const nationRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['Nation']
        });
        return String(nationRo?.Data?.Nation?.Value || '').toLowerCase();
    };
    const applyMyHomeStorageDamage = async ({ defenderPlayFabId, attackerPlayFabId = null, buildingLevel = 1 }) => {
        if (!defenderPlayFabId) {
            return { damaged: {}, looted: {}, lost: {}, totalDamaged: 0, totalLooted: 0, totalLost: 0 };
        }
        const entityKey = await getEntityKeyForPlayFabId(defenderPlayFabId);
        const items = await getAllInventoryItems(entityKey);
        const balances = getVirtualCurrencyMap(items);
        const ratio = getMyHomeStorageDamageRatio(buildingLevel);
        const damaged = {};
        const looted = {};
        const lost = {};
        let totalDamaged = 0;
        let totalLooted = 0;
        let totalLost = 0;

        let attackerShipId = null;
        let attackerShipData = null;
        let attackerCargo = null;
        let remainingCapacity = 0;

        if (attackerPlayFabId) {
            try {
                attackerShipId = await resourceStorage.getActiveShipId(attackerPlayFabId, { promisifyPlayFab, PlayFabServer });
                if (attackerShipId) {
                    attackerShipData = await resourceStorage.getShipAsset(attackerPlayFabId, attackerShipId, { promisifyPlayFab, PlayFabServer });
                    if (attackerShipData) {
                        attackerCargo = resourceStorage.getShipResourceCargo(attackerShipData);
                        const cargoCapacity = resourceStorage.getShipCargoCapacity(attackerShipData);
                        remainingCapacity = Math.max(0, cargoCapacity - resourceStorage.sumResourceMap(attackerCargo));
                    }
                }
            } catch (error) {
                console.warn('[DamageIslandBuilding] Failed to prepare attacker cargo loot:', error?.errorMessage || error?.message || error);
                attackerShipId = null;
                attackerShipData = null;
                attackerCargo = null;
                remainingCapacity = 0;
            }
        }

        for (const code of HOME_STORAGE_RESOURCE_CODES) {
            const balance = Math.max(0, Math.trunc(Number(balances?.[code] || 0)));
            if (balance <= 0) continue;
            const damageAmount = Math.min(balance, Math.max(1, Math.floor(balance * ratio)));
            if (damageAmount <= 0) continue;
            try {
                await subtractEconomyItem(defenderPlayFabId, code, damageAmount);
                damaged[code] = damageAmount;
                totalDamaged += damageAmount;
                let lootedAmount = 0;
                if (attackerCargo && remainingCapacity > 0) {
                    const desiredLoot = Math.min(
                        damageAmount,
                        Math.max(1, Math.round(damageAmount * MY_HOME_STORAGE_LOOT_RATIO))
                    );
                    lootedAmount = Math.min(desiredLoot, remainingCapacity);
                    if (lootedAmount > 0) {
                        attackerCargo[code] = Math.max(0, Math.trunc(Number(attackerCargo[code] || 0))) + lootedAmount;
                        looted[code] = (looted[code] || 0) + lootedAmount;
                        totalLooted += lootedAmount;
                        remainingCapacity -= lootedAmount;
                    }
                }
                const lostAmount = Math.max(0, damageAmount - lootedAmount);
                if (lostAmount > 0) {
                    lost[code] = lostAmount;
                    totalLost += lostAmount;
                }
            } catch (error) {
                console.warn(`[DamageIslandBuilding] Failed to apply home storage loss for ${defenderPlayFabId} ${code}:`, error?.errorMessage || error?.message || error);
            }
        }

        if (attackerShipData && attackerShipId && attackerCargo) {
            try {
                resourceStorage.setShipResourceCargo(attackerShipData, attackerCargo);
                await resourceStorage.updateShipAsset(attackerPlayFabId, attackerShipId, attackerShipData, { promisifyPlayFab, PlayFabServer });
            } catch (error) {
                console.warn('[DamageIslandBuilding] Failed to persist attacker cargo loot:', error?.errorMessage || error?.message || error);
            }
        }

        return { damaged, looted, lost, totalDamaged, totalLooted, totalLost };
    };
    const respondCaptureState = (res, islandId, mapId, state) => {
        res.json({
            success: true,
            islandId,
            mapId,
            captureState: state
        });
    };

    // 島占領
    app.post('/api/claim-island', async (req, res) => {
        const { playFabId, islandId, mapId } = req.body || {};
        if (!playFabId || !islandId || !mapId) {
            return res.status(400).json({ error: 'playFabId, islandId, mapId are required' });
        }
        try {
            const nationRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['Nation']
            });
            const playerNation = String(nationRo?.Data?.Nation?.Value || '').toLowerCase();
            const mapOccupationNation = (mapId && typeof getMapOccupationNation === 'function')
                ? await getMapOccupationNation(mapId)
                : null;

            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const result = await firestore.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('IslandNotFound');
                const data = snap.data() || {};
                if (data.ownerId === playFabId) {
                    return { island: data, changed: false };
                }
                if (!canBuildToOccupy({ island: data, playerNation, mapOccupationNation })) {
                    throw new Error('BuildToOccupyNotAllowed');
                }
                const patch = {
                    ownerId: playFabId,
                    ownerNation: playerNation || null,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                };
                tx.update(ref, patch);
                return { island: { ...data, ...patch }, changed: true };
            });

            let updatedMapOccupationNation = null;
            const centralId = getCentralIslandIdForMap(mapId);
            if (centralId && centralId === islandId && typeof setMapOccupationNation === 'function') {
                updatedMapOccupationNation = await setMapOccupationNation(mapId, playerNation || null);
            }

            res.json({
                success: true,
                islandId,
                mapId,
                ownerId: playFabId,
                ownerNation: playerNation || null,
                mapOccupationNation: updatedMapOccupationNation || null
            });
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'IslandNotFound') return res.status(404).json({ error: 'Island not found' });
            if (msg === 'BuildToOccupyNotAllowed') return res.status(403).json({ error: 'BuildToOccupyNotAllowed' });
            console.error('[ClaimIsland] Error:', error);
            res.status(500).json({ error: 'Failed to claim island', details: msg });
        }
    });

    app.post('/api/damage-island-building', async (req, res) => {
        const { playFabId, islandId, mapId } = req.body || {};
        const damage = Math.max(1, Math.floor(Number(req.body?.damage) || 300));
        if (!playFabId || !islandId || !mapId) {
            return res.status(400).json({ error: 'playFabId, islandId, mapId are required' });
        }
        try {
            const playerNation = await getPlayerNation(playFabId);
            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const result = await firestore.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('IslandNotFound');
                const data = snap.data() || {};
                const ownerNation = String(data.ownerNation || data.ownerRace || '').toLowerCase();
                if (data.ownerId && data.ownerId === playFabId) throw new Error('CannotAttackOwnIsland');
                if (playerNation && ownerNation && playerNation === ownerNation) throw new Error('FriendlyFireNotAllowed');
                const buildings = Array.isArray(data.buildings) ? data.buildings.slice() : [];
                const idx = buildings.findIndex((entry) => entry && entry.status !== 'demolished');
                if (idx < 0) throw new Error('BuildingNotFound');
                const current = buildings[idx] || {};
                const maxHp = Number(current.maxHp) || Number(current.buildTimeSeconds) || 1;
                const currentHp = Number.isFinite(Number(current.currentHp)) ? Number(current.currentHp) : maxHp;
                const nextHp = Math.max(0, currentHp - damage);
                const buildingId = String(current.buildingId || current.id || '');
                const isMyHome = buildingId === 'my_house' || buildingId.startsWith('my_house');
                const nextBuilding = {
                    ...current,
                    maxHp,
                    currentHp: nextHp
                };
                if (nextHp <= 0) {
                    nextBuilding.status = 'demolished';
                }
                buildings[idx] = nextBuilding;
                let captureState = data.captureState || null;
                if (nextHp <= 0) {
                    captureState = refreshCaptureState({
                        status: 'breached',
                        breachedAt: Date.now(),
                        queue: [],
                        progressBaseMs: 0,
                        lastProgressAt: 0,
                        endsAt: 0
                    }, { ...data, buildings }, Date.now());
                }
                tx.update(ref, {
                    buildings,
                    captureState: captureState || data.captureState || null,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });
                return {
                    buildingHp: nextHp,
                    buildingMaxHp: maxHp,
                    destroyed: nextHp <= 0,
                    captureState: captureState || sanitizeCaptureState(data.captureState, data),
                    storageDamageOwnerId: nextHp <= 0 && isMyHome ? String(data.ownerId || '').trim() : '',
                    storageDamageEligible: nextHp <= 0 && isMyHome,
                    storageDamageLevel: Math.max(1, Math.trunc(Number(current.level || 1)))
                };
            });
            let storageDamage = {};
            let storageLooted = {};
            if (result.storageDamageEligible && result.storageDamageOwnerId) {
                const storageOutcome = await applyMyHomeStorageDamage({
                    defenderPlayFabId: result.storageDamageOwnerId,
                    attackerPlayFabId: playFabId,
                    buildingLevel: result.storageDamageLevel
                });
                storageDamage = storageOutcome.damaged || {};
                storageLooted = storageOutcome.looted || {};
            }
            res.json({
                success: true,
                islandId,
                mapId,
                hp: result.buildingHp,
                maxHp: result.buildingMaxHp,
                destroyed: result.destroyed,
                captureState: result.captureState,
                storageDamage,
                storageLooted
            });
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'IslandNotFound') return res.status(404).json({ error: 'Island not found' });
            if (msg === 'BuildingNotFound') return res.status(404).json({ error: '建物がありません' });
            if (msg === 'CannotAttackOwnIsland') return res.status(403).json({ error: '自分の島は攻撃できません' });
            if (msg === 'FriendlyFireNotAllowed') return res.status(403).json({ error: '同盟側の島は攻撃できません' });
            console.error('[DamageIslandBuilding] Error:', error);
            res.status(500).json({ error: 'Failed to damage island building', details: msg });
        }
    });

    const mutateIslandCapture = async ({ playFabId, islandId, mapId, mode }) => {
        const playerNation = await getPlayerNation(playFabId);
        if (!playerNation) throw new Error('NationRequired');
        const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
        const now = Date.now();
        return firestore.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) throw new Error('IslandNotFound');
            const data = snap.data() || {};
            if (data.ownerId && data.ownerId === playFabId) throw new Error('AlreadyOwner');
            if (!isIslandBreached(data)) throw new Error('IslandNotBreached');

            let state = refreshCaptureState(data.captureState, data, now);
            const currentIndex = state.queue.findIndex((entry) => entry.playFabId === playFabId);

            if (mode === 'leave') {
                if (currentIndex >= 0) {
                    state.queue.splice(currentIndex, 1);
                }
            } else {
                if (currentIndex < 0) {
                    if (state.queue.length >= state.slotLimit) throw new Error('CaptureFull');
                    const leadNation = String(state.queue[0]?.nation || '').toLowerCase();
                    if (leadNation && leadNation !== playerNation) throw new Error('CaptureOccupiedByEnemy');
                    state.queue.push({
                        playFabId,
                        nation: playerNation,
                        joinedAt: now
                    });
                }
            }

            state = refreshCaptureState(state, data, now);
            tx.update(ref, {
                captureState: state,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
            return state;
        });
    };

    app.post('/api/start-island-capture', async (req, res) => {
        const { playFabId, islandId, mapId } = req.body || {};
        if (!playFabId || !islandId || !mapId) {
            return res.status(400).json({ error: 'playFabId, islandId, mapId are required' });
        }
        try {
            const state = await mutateIslandCapture({ playFabId, islandId, mapId, mode: 'start' });
            respondCaptureState(res, islandId, mapId, state);
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'IslandNotFound') return res.status(404).json({ error: 'Island not found' });
            if (msg === 'AlreadyOwner') return res.status(403).json({ error: '自分の島です' });
            if (msg === 'IslandNotBreached') return res.status(409).json({ error: '建物を破壊してから上陸してください' });
            if (msg === 'CaptureFull') return res.status(409).json({ error: 'この島はこれ以上上陸できません' });
            if (msg === 'CaptureOccupiedByEnemy') return res.status(409).json({ error: '敵が占領中です' });
            if (msg === 'NationRequired') return res.status(400).json({ error: 'NationRequired' });
            console.error('[StartIslandCapture] Error:', error);
            res.status(500).json({ error: 'Failed to start island capture', details: msg });
        }
    });

    app.post('/api/join-island-capture', async (req, res) => {
        const { playFabId, islandId, mapId } = req.body || {};
        if (!playFabId || !islandId || !mapId) {
            return res.status(400).json({ error: 'playFabId, islandId, mapId are required' });
        }
        try {
            const state = await mutateIslandCapture({ playFabId, islandId, mapId, mode: 'join' });
            respondCaptureState(res, islandId, mapId, state);
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'IslandNotFound') return res.status(404).json({ error: 'Island not found' });
            if (msg === 'AlreadyOwner') return res.status(403).json({ error: '自分の島です' });
            if (msg === 'IslandNotBreached') return res.status(409).json({ error: '建物を破壊してから上陸してください' });
            if (msg === 'CaptureFull') return res.status(409).json({ error: 'この島はこれ以上上陸できません' });
            if (msg === 'CaptureOccupiedByEnemy') return res.status(409).json({ error: '敵が占領中です' });
            if (msg === 'NationRequired') return res.status(400).json({ error: 'NationRequired' });
            console.error('[JoinIslandCapture] Error:', error);
            res.status(500).json({ error: 'Failed to join island capture', details: msg });
        }
    });

    app.post('/api/cancel-island-capture', async (req, res) => {
        const { playFabId, islandId, mapId } = req.body || {};
        if (!playFabId || !islandId || !mapId) {
            return res.status(400).json({ error: 'playFabId, islandId, mapId are required' });
        }
        try {
            const state = await mutateIslandCapture({ playFabId, islandId, mapId, mode: 'leave' });
            respondCaptureState(res, islandId, mapId, state);
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'IslandNotFound') return res.status(404).json({ error: 'Island not found' });
            if (msg === 'NationRequired') return res.status(400).json({ error: 'NationRequired' });
            console.error('[CancelIslandCapture] Error:', error);
            res.status(500).json({ error: 'Failed to cancel island capture', details: msg });
        }
    });

    app.post('/api/complete-island-capture', async (req, res) => {
        const { playFabId, islandId, mapId } = req.body || {};
        if (!playFabId || !islandId || !mapId) {
            return res.status(400).json({ error: 'playFabId, islandId, mapId are required' });
        }
        try {
            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const now = Date.now();
            const result = await firestore.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('IslandNotFound');
                const data = snap.data() || {};
                let state = refreshCaptureState(data.captureState, data, now);
                if (!Array.isArray(state.queue) || state.queue.length === 0) throw new Error('CaptureNotStarted');
                const leader = state.queue[0];
                if (!leader || leader.playFabId !== playFabId) throw new Error('CaptureLeaderOnly');
                state = advanceCaptureState(state, now);
                if (state.progressBaseMs < state.baseDurationMs) throw new Error('CaptureNotReady');

                const nextOwnerNation = leader.nation || null;
                tx.update(ref, {
                    ownerId: playFabId,
                    ownerNation: nextOwnerNation,
                    captureState: {
                        status: 'idle',
                        breachedAt: 0,
                        queue: [],
                        slotLimit: getIslandCaptureSlotLimit(data?.size),
                        baseDurationMs: getIslandCaptureBaseDurationMs(data),
                        progressBaseMs: 0,
                        lastProgressAt: 0,
                        endsAt: 0,
                        ownerCandidateId: null,
                        ownerCandidateNation: null
                    },
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });
                return {
                    ownerId: playFabId,
                    ownerNation: nextOwnerNation
                };
            });

            let updatedMapOccupationNation = null;
            const centralId = getCentralIslandIdForMap(mapId);
            if (centralId && centralId === islandId && typeof setMapOccupationNation === 'function') {
                updatedMapOccupationNation = await setMapOccupationNation(mapId, result.ownerNation || null);
            }

            res.json({
                success: true,
                islandId,
                mapId,
                ownerId: result.ownerId,
                ownerNation: result.ownerNation,
                mapOccupationNation: updatedMapOccupationNation || null
            });
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'IslandNotFound') return res.status(404).json({ error: 'Island not found' });
            if (msg === 'CaptureNotStarted') return res.status(409).json({ error: 'まだ上陸していません' });
            if (msg === 'CaptureLeaderOnly') return res.status(403).json({ error: '先頭のプレイヤーのみ占領を完了できます' });
            if (msg === 'CaptureNotReady') return res.status(409).json({ error: 'まだ占領時間が完了していません' });
            console.error('[CompleteIslandCapture] Error:', error);
            res.status(500).json({ error: 'Failed to complete island capture', details: msg });
        }
    });

    // 新規島作成（現在地付近）
    app.post('/api/create-island', async (req, res) => {
        const { playFabId, mapId, worldX, worldY, name, size } = req.body || {};
        if (!playFabId || !mapId) {
            return res.status(400).json({ error: 'playFabId and mapId are required' });
        }
        const sizeKey = normalizeCreateIslandSize(size);
        if (!sizeKey) {
            return res.status(400).json({ error: 'InvalidSize' });
        }
        const placement = resolveCreateIslandPlacement({ worldX, worldY, sizeKey });
        if (!placement) {
            return res.status(400).json({ error: 'InvalidPosition' });
        }
        const costPs = Number(CREATE_ISLAND_COST_BY_SIZE[sizeKey] || 0);
        if (costPs <= 0) {
            return res.status(400).json({ error: 'InvalidCreateCost' });
        }

        const rawName = String(name || '').replace(/\s+/g, ' ').trim();
        const MAX_NAME_LENGTH = 24;
        const islandName = rawName
            ? rawName.slice(0, MAX_NAME_LENGTH)
            : `新規島 ${new Date().toLocaleTimeString('ja-JP', { hour12: false })}`;

        try {
            const nationRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['Nation']
            });
            const playerNation = normalizeNationKey(nationRo?.Data?.Nation?.Value || null);
            const mapOccupationNationRaw = (mapId && typeof getMapOccupationNation === 'function')
                ? await getMapOccupationNation(mapId)
                : null;
            const mapOccupationNation = normalizeNationKey(mapOccupationNationRaw);
            const mapNationById = normalizeNationKey(mapId);
            const effectiveMapNation = mapOccupationNation || mapNationById || null;

            // 島作成は自国の領海のみ許可
            if (!playerNation || !effectiveMapNation || effectiveMapNation !== playerNation) {
                return res.status(403).json({ error: 'MapNotOwnedByPlayerNation' });
            }

            const collectionRef = getWorldMapCollection(firestore, mapId);
            const entityKey = await getEntityKeyForPlayFabId(playFabId);
            const items = await getAllInventoryItems(entityKey);
            const balances = getVirtualCurrencyMap(items);
            const balancePs = Number(balances[VIRTUAL_CURRENCY_CODE] || 0);
            if (balancePs < costPs) {
                return res.status(400).json({
                    error: 'InsufficientFunds',
                    details: { currency: VIRTUAL_CURRENCY_CODE, required: costPs, balance: balancePs }
                });
            }

            let deducted = false;
            let createResult = null;
            try {
                await subtractEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, costPs);
                deducted = true;

                createResult = await firestore.runTransaction(async (tx) => {
                    const snapshot = await tx.get(collectionRef);
                    const existing = snapshot.docs.map((doc) => doc.data() || {});
                    for (const entry of existing) {
                        const rect = getObjectRect(entry);
                        if (!rect) continue;
                        if (rectsOverlap(placement, rect)) {
                            throw new Error('IslandPositionOccupied');
                        }
                    }

                    const uniqueSuffix = Math.random().toString(36).slice(2, 8);
                    const islandId = `${mapId}_player_${Date.now().toString(36)}_${uniqueSuffix}`;
                    const islandRef = collectionRef.doc(islandId);
                    const slotLayout = sizeKey === 'giant' ? '3x3' : (sizeKey === 'large' ? '2x2' : '1x1');
                    const islandData = {
                        id: islandId,
                        name: islandName,
                        coordinate: { x: placement.x, y: placement.y },
                        size: sizeKey,
                        islandLevel: 1,
                        ownerId: playFabId,
                        ownerNation: playerNation || null,
                        nation: playerNation || effectiveMapNation || null,
                        biome: null,
                        biomeFrame: null,
                        occupationStatus: null,
                        buildingSlots: { layout: slotLayout },
                        buildings: [],
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                    };
                    tx.set(islandRef, islandData);
                    return { islandId, islandData };
                });
            } catch (error) {
                if (deducted) {
                    await addEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, costPs);
                }
                throw error;
            }

            await addOwnedMapId(playFabId, mapId, { promisifyPlayFab, PlayFabServer });

            res.json({
                success: true,
                mapId,
                costPs,
                island: createResult.islandData
            });
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'IslandPositionOccupied') {
                return res.status(409).json({ error: 'IslandPositionOccupied' });
            }
            console.error('[create-island] Error:', error);
            res.status(500).json({ error: 'Failed to create island', details: msg });
        }
    });

    // 所有島一覧
    app.post('/api/get-owned-islands', async (req, res) => {
        const { playFabId, mapId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });

        try {
            const islands = [];
            if (mapId) {
                const col = getWorldMapCollection(firestore, mapId);
                const snapshot = await col.where('ownerId', '==', playFabId).get();
                snapshot.docs.forEach((doc) => {
                    const data = doc.data() || {};
                    islands.push({
                        id: doc.id,
                        name: data.name || null,
                        size: data.size || null,
                        islandLevel: data.islandLevel || null,
                        biome: data.biome || null,
                        coordinate: data.coordinate || null,
                        buildings: data.buildings || [],
                        mapId
                    });
                });
            } else {
                const ownedMapIds = await getOwnedMapIds(playFabId, { promisifyPlayFab, PlayFabServer });
                if (ownedMapIds.length === 0) {
                    return res.json({ islands });
                }
                for (const ownedMapId of ownedMapIds) {
                    const col = getWorldMapCollection(firestore, ownedMapId);
                    const snapshot = await col.where('ownerId', '==', playFabId).get();
                    if (snapshot.empty) continue;
                    const resolvedMapId = col.id.startsWith('world_map_') ? col.id.slice('world_map_'.length) : null;
                    snapshot.docs.forEach((doc) => {
                        const data = doc.data() || {};
                        islands.push({
                            id: doc.id,
                            name: data.name || null,
                            size: data.size || null,
                            islandLevel: data.islandLevel || null,
                            biome: data.biome || null,
                            coordinate: data.coordinate || null,
                            buildings: data.buildings || [],
                            mapId: resolvedMapId
                        });
                    });
                }
            }
            res.json({ islands });
        } catch (error) {
            console.error('[get-owned-islands] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to fetch owned islands' });
        }
    });

    // 島詳細取得
    app.post('/api/get-island-details', async (req, res) => {
        const { islandId, mapId, playFabId } = req.body || {};
        if (!islandId) return res.status(400).json({ error: 'islandId is required' });

        try {
            let snap = null;
            if (mapId) {
                const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
                snap = await ref.get();
            }
            if (!snap || !snap.exists) {
                const ownedMapIds = playFabId
                    ? await getOwnedMapIds(playFabId, { promisifyPlayFab, PlayFabServer })
                    : null;
                const found = await findIslandDocAcrossMaps(firestore, islandId, ownedMapIds);
                snap = found.snap;
            }
            if (!snap || !snap.exists) return res.status(404).json({ error: 'Island not found' });

            const data = snap.data() || {};
            const biomeInfo = null;
            const islandLevel = Math.max(1, Math.trunc(Number(data.islandLevel) || 1));
            const maxLevel = 5;
            let upgradeCost = null;
            let upgradeHouseId = null;
            let upgradeLevel = null;
            if (islandLevel < maxLevel) {
                upgradeLevel = islandLevel + 1;
                upgradeHouseId = 'my_house';
                const spec = getBuildingSpec(upgradeHouseId, upgradeLevel);
                const priceAmounts = normalizePriceAmounts(spec?.PriceAmounts);
                upgradeCost = priceAmounts.length > 0 ? priceAmounts : null;
            }

            let buildingUpgradeCost = null;
            let buildingUpgradeLevel = null;
            let buildingUpgradeBuildingId = null;
            let buildingUpgradeMaxLevel = null;
            let buildingUpgradeAvailable = false;
            let buildingUpgradeReason = null;
            const activeBuilding = Array.isArray(data.buildings)
                ? data.buildings.find(b => b && b.status !== 'demolished')
                : null;
            let playerHasMyHouse = false;
            let allowMyHouseRebuild = false;
            if (playFabId) {
                try {
                    playerHasMyHouse = await hasMyHouseOwned(firestore, playFabId, { promisifyPlayFab, PlayFabServer }, mapId);
                } catch (error) {
                    console.warn('[GetIslandDetails] Failed to resolve my house ownership:', error?.message || error);
                }
                const hasBuilding = Array.isArray(data.buildings) && data.buildings.some(b => b && b.status !== 'demolished');
                allowMyHouseRebuild = !playerHasMyHouse && !hasBuilding && isSmallIslandSize(data.size);
            }
            if (activeBuilding) {
                const rawId = String(activeBuilding.buildingId || activeBuilding.id || '');
                const currentLevel = Math.max(1, Math.trunc(Number(activeBuilding.level) || 1));
                const resolvedBase = rawId ? buildingDefs.getBuildingById(rawId) : null;
                const levels = resolvedBase?.levels || null;
                const levelKeys = levels ? Object.keys(levels).map(n => Number(n)).filter(n => Number.isFinite(n)) : [];
                buildingUpgradeMaxLevel = levelKeys.length > 0 ? Math.max(...levelKeys) : 5;
                if (!rawId) {
                    buildingUpgradeReason = 'BuildingNotFound';
                } else if (rawId === 'my_house' || rawId.startsWith('my_house')) {
                    buildingUpgradeReason = 'UseIslandUpgrade';
                } else if (activeBuilding.status !== 'completed') {
                    buildingUpgradeReason = 'NotCompleted';
                } else if (currentLevel >= buildingUpgradeMaxLevel) {
                    buildingUpgradeReason = 'MaxLevel';
                } else {
                    buildingUpgradeLevel = currentLevel + 1;
                    buildingUpgradeBuildingId = rawId;
                    const spec = getBuildingSpec(rawId, buildingUpgradeLevel);
                    const priceAmounts = normalizePriceAmounts(spec?.PriceAmounts);
                    buildingUpgradeCost = priceAmounts.length > 0 ? priceAmounts : null;
                    buildingUpgradeAvailable = !!spec;
                    if (!spec) {
                        buildingUpgradeReason = 'BuildingSpecMissing';
                    }
                }
            } else {
                buildingUpgradeReason = 'NoBuilding';
            }

            res.json({
                success: true,
                island: {
                    id: snap.id,
                    ...data,
                    biomeInfo,
                    upgradeCost,
                    upgradeHouseId,
                    upgradeLevel,
                    buildingUpgradeCost,
                    buildingUpgradeLevel,
                    buildingUpgradeBuildingId,
                    buildingUpgradeMaxLevel,
                    buildingUpgradeAvailable,
                    buildingUpgradeReason,
                    playerHasMyHouse,
                    allowMyHouseRebuild
                }
            });
        } catch (error) {
            console.error('[GetIslandDetails] Error:', error);
            res.status(500).json({ error: 'Failed to get island details', details: error.message });
        }
    });

    // 島名変更
    app.post('/api/rename-island', async (req, res) => {
        const { playFabId, islandId, mapId, name } = req.body || {};
        if (!playFabId || !islandId) {
            return res.status(400).json({ error: 'playFabId and islandId are required' });
        }

        const rawName = String(name || '').replace(/\s+/g, ' ').trim();
        if (!rawName) {
            return res.status(400).json({ error: 'InvalidName' });
        }
        const MAX_NAME_LENGTH = 24;
        if (rawName.length > MAX_NAME_LENGTH) {
            return res.status(400).json({ error: 'NameTooLong', max: MAX_NAME_LENGTH });
        }

        try {
            let ref = null;
            let snap = null;
            let resolvedMapId = mapId || null;

            if (mapId) {
                ref = getWorldMapCollection(firestore, mapId).doc(islandId);
                snap = await ref.get();
            }

            if (!snap || !snap.exists) {
                const ownedMapIds = await getOwnedMapIds(playFabId, { promisifyPlayFab, PlayFabServer });
                const found = await findIslandDocAcrossMaps(firestore, islandId, ownedMapIds);
                snap = found?.snap || null;
                ref = found?.collection ? found.collection.doc(islandId) : null;
                resolvedMapId = found?.mapId || resolvedMapId;
            }

            if (!snap || !snap.exists || !ref) {
                return res.status(404).json({ error: 'IslandNotFound' });
            }

            const island = snap.data() || {};
            if (island.ownerId !== playFabId) {
                return res.status(403).json({ error: 'NotOwner' });
            }

            await ref.set({
                name: rawName,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            res.json({ success: true, islandId, name: rawName, mapId: resolvedMapId });
        } catch (error) {
            console.error('[rename-island] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to rename island', details: error?.message || error });
        }
    });

    // リソース状態取得
    app.post('/api/get-resource-status', async (req, res) => {
        const { playFabId, islandId, mapId } = req.body || {};
        if (!playFabId || !islandId) return res.status(400).json({ error: 'playFabId and islandId are required' });

        try {
            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'Island not found' });

            const data = snap.data() || {};
            const biome = data.biome;
            const currency = RESOURCE_BIOME_CURRENCY[biome];
            if (!currency) return res.status(400).json({ error: 'Island not harvestable' });

            const capacity = await getActiveShipCargoCapacity(playFabId, islandDeps);
            if (!capacity || capacity <= 0) {
                return res.status(400).json({ error: 'Cargo capacity is zero' });
            }

            const harvestRef = ref.collection('resourceHarvest').doc(playFabId);
            const harvestSnap = await harvestRef.get();
            const now = Date.now();
            let lastCollectedAt = harvestSnap.exists ? harvestSnap.data()?.lastCollectedAt : null;
            if (lastCollectedAt && typeof lastCollectedAt.toMillis === 'function') {
                lastCollectedAt = lastCollectedAt.toMillis();
            }
            if (!Number.isFinite(lastCollectedAt)) {
                lastCollectedAt = now - RESOURCE_INTERVAL_MS;
                await harvestRef.set({ lastCollectedAt: new Date(lastCollectedAt) }, { merge: true });
            }

            const elapsed = Math.max(0, now - lastCollectedAt);
            const units = Math.floor(elapsed / RESOURCE_INTERVAL_MS);
            const available = Math.min(units, capacity);
            const nextInMs = available > 0 ? 0 : (RESOURCE_INTERVAL_MS - (elapsed % RESOURCE_INTERVAL_MS));

            res.json({
                success: true,
                biome,
                currency,
                capacity,
                available,
                nextInMs
            });
        } catch (error) {
            console.error('[GetResourceStatus] Error:', error);
            res.status(500).json({ error: 'Failed to get resource status', details: error.message });
        }
    });

    // リソース収集
    app.post('/api/collect-resource', async (req, res) => {
        const { playFabId, islandId, mapId } = req.body || {};
        const requestEntity = normalizeEntityKey(req.body?.entityKey);
        if (!playFabId || !islandId || !mapId) {
            return res.status(400).json({ error: 'playFabId, islandId, mapId are required' });
        }

        try {
            const capacity = await getActiveShipCargoCapacity(playFabId, islandDeps);
            if (!capacity || capacity <= 0) {
                return res.json({ success: false, amount: 0, message: 'Cargo capacity is zero' });
            }

            const result = await firestore.runTransaction(async (tx) => {
                const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('IslandNotFound');

                const data = snap.data() || {};
                const biome = data.biome;
                const currency = RESOURCE_BIOME_CURRENCY[biome];
                if (!currency) throw new Error('IslandNotHarvestable');

                const harvestRef = ref.collection('resourceHarvest').doc(playFabId);
                const harvestSnap = await tx.get(harvestRef);
                const now = Date.now();
                let lastCollectedAt = harvestSnap.exists ? harvestSnap.data()?.lastCollectedAt : null;
                if (lastCollectedAt && typeof lastCollectedAt.toMillis === 'function') {
                    lastCollectedAt = lastCollectedAt.toMillis();
                }
                if (!Number.isFinite(lastCollectedAt)) {
                    lastCollectedAt = now;
                }

                const elapsed = Math.max(0, now - lastCollectedAt);
                const units = Math.floor(elapsed / RESOURCE_INTERVAL_MS);
                const amount = Math.min(units, capacity);
                if (amount <= 0) {
                    throw new Error('NothingToCollect');
                }

                const remainderTime = elapsed % RESOURCE_INTERVAL_MS;
                const newLastTime = now - remainderTime;
                tx.set(harvestRef, { lastCollectedAt: new Date(newLastTime) }, { merge: true });

                return { biome, currency, amount, capacity };
            });

            await addEconomyItem(playFabId, result.currency, result.amount, requestEntity);
            res.json({ success: true, ...result });
        } catch (error) {
            const code = error?.message || '';
            if (code === 'NothingToCollect') {
                return res.json({ success: false, amount: 0, message: 'Nothing to collect yet' });
            }
            if (code === 'IslandNotFound') {
                return res.status(404).json({ error: 'Island not found' });
            }
            if (code === 'IslandNotHarvestable') {
                return res.status(400).json({ error: 'Island not harvestable' });
            }
            console.error('[CollectResource] Error:', error);
            res.status(500).json({ error: 'Failed to collect resource', details: error.message });
        }
    });

    // 温泉入浴
    app.post('/api/hot-spring-bath', async (req, res) => {
        const { playFabId, islandId, mapId } = req.body || {};
        const requestEntity = normalizeEntityKey(req.body?.entityKey);
        if (!playFabId || !islandId || !mapId) {
            return res.status(400).json({ error: 'playFabId, islandId, mapId are required' });
        }

        try {
            const islandRef = getWorldMapCollection(firestore, mapId).doc(islandId);
            const islandSnap = await islandRef.get();
            if (!islandSnap.exists) return res.status(404).json({ error: 'IslandNotFound' });
            const island = islandSnap.data() || {};
            const buildings = Array.isArray(island.buildings) ? island.buildings : [];
            const hasHotSpring = buildings.some(b => b && b.status !== 'demolished' && (b.buildingId === 'hot_spring' || b.id === 'hot_spring'));
            if (!hasHotSpring) return res.status(400).json({ error: 'HotSpringNotFound' });
            const ownerId = island.ownerId || null;
            const price = Math.max(0, Math.floor(Number(island.hotSpringPrice) || 200));
            if (!price) return res.status(400).json({ error: 'PriceNotSet' });

            const nationValue = String(island.nation || '').toLowerCase();
            const userNationResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['Nation']
            });
            const userNation = String(userNationResult?.Data?.Nation?.Value || '').toLowerCase();
            if (!userNation || (nationValue && userNation !== nationValue)) {
                return res.status(403).json({ error: 'NotOwnNation' });
            }

            const { getCurrencyBalance } = require('./economy');
            const economyDeps = deps;
            const balance = await getCurrencyBalance(playFabId, 'PS', economyDeps);
            if (balance < price) {
                return res.status(400).json({ error: 'InsufficientFunds' });
            }

            const statsResult = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: playFabId });
            const currentStats = {};
            if (statsResult.Statistics) {
                statsResult.Statistics.forEach(stat => { currentStats[stat.StatisticName] = stat.Value; });
            }
            const currentHp = Number(currentStats.HP || 0);
            const maxHp = Number(currentStats.MaxHP || currentHp || 0);
            if (currentHp >= maxHp) {
                return res.status(400).json({ error: 'HpAlreadyMax' });
            }

            await subtractEconomyItem(playFabId, 'PS', price, requestEntity);

            const taxRateBps = await getNationTaxRateBps(nationValue || userNation, firestore, deps);
            const { tax, net } = applyTax(price, taxRateBps);
            if (ownerId && net > 0) {
                await addEconomyItem(ownerId, 'PS', net, requestEntity);
            }
            if (tax > 0) {
                await addNationTreasury(nationValue || userNation, tax, firestore, deps, {
                    contributorPlayFabId: playFabId
                });
            }

            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: playFabId,
                Statistics: [{ StatisticName: 'HP', Value: maxHp }]
            });

            res.json({ success: true, price, tax, net, newHp: maxHp });
        } catch (error) {
            console.error('[HotSpringBath] Error:', error);
            res.status(500).json({ error: 'Failed to use hot spring', details: error?.errorMessage || error?.message || error });
        }
    });

    // 温泉価格設定
    app.post('/api/set-hot-spring-price', async (req, res) => {
        const { playFabId, islandId, price, mapId } = req.body || {};
        if (!playFabId || !islandId) return res.status(400).json({ error: 'playFabId and islandId are required' });
        const value = Math.max(0, Math.floor(Number(price) || 0));
        if (!Number.isFinite(value) || value <= 0) {
            return res.status(400).json({ error: 'InvalidPrice' });
        }
        try {
            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'IslandNotFound' });
            const island = snap.data() || {};
            if (!island.ownerId || island.ownerId !== playFabId) {
                return res.status(403).json({ error: 'NotOwner' });
            }
            const buildings = Array.isArray(island.buildings) ? island.buildings : [];
            const hasHotSpring = buildings.some(b => b && b.status !== 'demolished' && (b.buildingId === 'hot_spring' || b.id === 'hot_spring'));
            if (!hasHotSpring) return res.status(400).json({ error: 'HotSpringNotFound' });

            await ref.update({
                hotSpringPrice: value,
                hotSpringPriceUpdatedAt: Date.now()
            });
            res.json({ success: true, price: value });
        } catch (error) {
            console.error('[SetHotSpringPrice] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to set hot spring price' });
        }
    });

    // 島レベルアップグレード
    app.post('/api/upgrade-island-level', async (req, res) => {
        const { playFabId, islandId, mapId } = req.body || {};
        if (!playFabId || !islandId) {
            return res.status(400).json({ error: 'playFabId and islandId are required' });
        }

        const nextLevelFrom = (level) => Math.max(1, Math.trunc(Number(level) || 1)) + 1;
        const maxLevel = 5;

        try {
            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'Island not found' });

            const island = snap.data() || {};
            if (island.ownerId !== playFabId) return res.status(403).json({ error: 'NotOwner' });

            const userReadOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['Nation', 'Race']
            });
            const nationValue = userReadOnly?.Data?.Nation?.Value || null;
            const raceName = userReadOnly?.Data?.Race?.Value || null;
            if (!nationValue && !raceName) return res.status(400).json({ error: 'NationNotSet' });

            let nationIsland = nationValue ? String(nationValue).toLowerCase() : null;
            if (!nationIsland && raceName && NATION_GROUP_BY_RACE[raceName]) {
                nationIsland = NATION_GROUP_BY_RACE[raceName].island;
            }
            if (!nationIsland || island.biome !== nationIsland) {
                return res.status(403).json({ error: 'NationMismatch' });
            }

            const currentLevel = Math.max(1, Math.trunc(Number(island.islandLevel) || 1));
            if (currentLevel >= maxLevel) return res.status(400).json({ error: 'MaxLevel' });

            const nextLevel = nextLevelFrom(currentLevel);
            const houseId = 'my_house';
            const spec = getBuildingSpec(houseId, nextLevel);
            if (!spec) return res.status(400).json({ error: 'BuildingNotFound' });

            const priceAmounts = normalizePriceAmounts(spec?.PriceAmounts);
            const entityKey = await getEntityKeyForPlayFabId(playFabId);
            const items = await getAllInventoryItems(entityKey);
            const balances = getVirtualCurrencyMap(items);
            const costEntries = priceAmounts
                .map((entry) => ({
                    code: entry?.ItemId || entry?.itemId,
                    amount: Number(entry?.Amount ?? entry?.amount ?? 0)
                }))
                .filter((entry) => entry.code && entry.amount > 0);
            const fixedResourceCosts = getFixedBuildingResourceCostEntries(houseId, nextLevel);
            let effectiveCosts = fixedResourceCosts.length > 0 ? fixedResourceCosts : costEntries;
            if (fixedResourceCosts.length === 0) {
                const paymentMethod = String(req?.body?.paymentMethod || '').trim().toLowerCase();
                const resourceCosts = applyNationResourceCosts(costEntries, nationIsland, { useSacred: true, onlyResource: true });
                const costEntriesWithResource = resourceCosts.length > 0 ? resourceCosts : costEntries;
                const useResourcePayment = paymentMethod === 'resource';
                effectiveCosts = useResourcePayment ? costEntriesWithResource : costEntries;
            }
            for (const entry of effectiveCosts) {
                const bal = Number(balances[entry.code] || 0);
                if (bal < entry.amount) {
                    return res.status(400).json({ error: 'InsufficientFunds', details: { currency: entry.code, required: entry.amount, balance: bal } });
                }
            }

            let deducted = false;
            try {
                for (const entry of effectiveCosts) {
                    await subtractEconomyItem(playFabId, entry.code, entry.amount);
                }
                deducted = true;

                const sizeLogic = normalizeSize(spec.SizeLogic, inferLogicSizeFromSlotsRequired(spec.SlotsRequired));
                const sizeVisual = normalizeSize(spec.SizeVisual, sizeLogic);
                const logicW = Math.max(1, Math.trunc(sizeLogic.x));
                const logicH = Math.max(1, Math.trunc(sizeLogic.y));
                const visualW = Math.max(1, Math.trunc(sizeVisual.x));
                const visualH = Math.max(1, Math.trunc(sizeVisual.y));
                const tileIndexRaw = spec.TileIndex;
                const tileIndexValue = Number.isFinite(Number(tileIndexRaw)) ? Number(tileIndexRaw) : 17;
                const maxHp = computeMaxHp(logicW, logicH, nextLevel);

                await firestore.runTransaction(async (tx) => {
                    const snapTx = await tx.get(ref);
                    if (!snapTx.exists) throw new Error('IslandNotFound');
                    const data = snapTx.data() || {};
                    const existing = Array.isArray(data.buildings) ? data.buildings.slice() : [];

                    const nextBuilding = {
                        buildingId: houseId,
                        status: 'completed',
                        level: nextLevel,
                        startTime: Date.now(),
                        completionTime: Date.now(),
                        durationMs: 0,
                        helpers: [],
                        width: logicW,
                        height: logicH,
                        visualWidth: visualW,
                        visualHeight: visualH,
                        tileIndex: tileIndexValue,
                        maxHp: maxHp,
                        currentHp: maxHp,
                        x: 0,
                        y: 0
                    };

                    const filtered = existing.filter(b => {
                        if (!b) return true;
                        const rawId = String(b.buildingId || b.id || '');
                        if (rawId === 'my_house') return false;
                        return !rawId.startsWith('my_house_lv');
                    });
                    filtered.push(nextBuilding);

                    tx.update(ref, {
                        islandLevel: nextLevel,
                        buildings: filtered
                    });
                });
            } catch (error) {
                if (deducted) {
                    for (const entry of effectiveCosts) {
                        await addEconomyItem(playFabId, entry.code, entry.amount);
                    }
                }
                throw error;
            }

            res.json({ success: true, islandId, nextLevel, buildingId: houseId });
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'IslandNotFound') return res.status(404).json({ error: 'IslandNotFound' });
            console.error('[upgrade-island-level] Error:', error);
            res.status(500).json({ error: 'Failed to upgrade island level', details: error?.errorMessage || error?.message || error });
        }
    });

    // 建物レベルアップ
    app.post('/api/upgrade-building', async (req, res) => {
        const { playFabId, islandId, mapId } = req.body || {};
        if (!playFabId || !islandId) {
            return res.status(400).json({ error: 'playFabId and islandId are required' });
        }

        try {
            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'IslandNotFound' });

            const island = snap.data() || {};
            if (island.ownerId !== playFabId) return res.status(403).json({ error: 'NotOwner' });

            const buildings = Array.isArray(island.buildings) ? island.buildings.slice() : [];
            const idx = buildings.findIndex(b => b && b.status !== 'demolished');
            if (idx === -1) return res.status(400).json({ error: 'NoBuilding' });

            const target = buildings[idx];
            if (target.status !== 'completed') return res.status(400).json({ error: 'NotCompleted' });

            const rawId = String(target.buildingId || target.id || '');
            if (!rawId) return res.status(400).json({ error: 'BuildingNotFound' });
            if (rawId === 'my_house' || rawId.startsWith('my_house')) {
                return res.status(400).json({ error: 'UseIslandUpgrade' });
            }

            const currentLevel = Math.max(1, Math.trunc(Number(target.level) || 1));
            const resolvedBase = buildingDefs.getBuildingById(rawId);
            const levels = resolvedBase?.levels || null;
            const levelKeys = levels ? Object.keys(levels).map(n => Number(n)).filter(n => Number.isFinite(n)) : [];
            const maxLevel = levelKeys.length > 0 ? Math.max(...levelKeys) : 5;
            if (currentLevel >= maxLevel) return res.status(400).json({ error: 'MaxLevel' });

            const nextLevel = currentLevel + 1;
            const spec = getBuildingSpec(rawId, nextLevel);
            if (!spec) return res.status(400).json({ error: 'BuildingNotFound' });

            let nationIsland = String(island.ownerNation || '').toLowerCase() || null;
            if (!nationIsland) {
                const userReadOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                    PlayFabId: playFabId,
                    Keys: ['Nation', 'Race']
                });
                const nationValue = userReadOnly?.Data?.Nation?.Value || null;
                const raceName = userReadOnly?.Data?.Race?.Value || null;
                if (nationValue) {
                    nationIsland = String(nationValue).toLowerCase();
                } else if (raceName && NATION_GROUP_BY_RACE[raceName]) {
                    nationIsland = NATION_GROUP_BY_RACE[raceName].island;
                }
            }

            const priceAmounts = normalizePriceAmounts(spec?.PriceAmounts);
            const entityKey = await getEntityKeyForPlayFabId(playFabId);
            const items = await getAllInventoryItems(entityKey);
            const balances = getVirtualCurrencyMap(items);
            const costEntries = priceAmounts
                .map((entry) => ({
                    code: entry?.ItemId || entry?.itemId,
                    amount: Number(entry?.Amount ?? entry?.amount ?? 0)
                }))
                .filter((entry) => entry.code && entry.amount > 0);
            const fixedResourceCosts = getFixedBuildingResourceCostEntries(rawId, nextLevel);
            let effectiveCosts = fixedResourceCosts.length > 0 ? fixedResourceCosts : costEntries;
            if (fixedResourceCosts.length === 0) {
                const paymentMethod = String(req?.body?.paymentMethod || '').trim().toLowerCase();
                const resourceCosts = applyNationResourceCosts(costEntries, nationIsland, { useSacred: true, onlyResource: true });
                const costEntriesWithResource = resourceCosts.length > 0 ? resourceCosts : costEntries;
                const useResourcePayment = paymentMethod === 'resource';
                effectiveCosts = useResourcePayment ? costEntriesWithResource : costEntries;
            }
            for (const entry of effectiveCosts) {
                const bal = Number(balances[entry.code] || 0);
                if (bal < entry.amount) {
                    return res.status(400).json({ error: 'InsufficientFunds', details: { currency: entry.code, required: entry.amount, balance: bal } });
                }
            }

            let deducted = false;
            try {
                for (const entry of effectiveCosts) {
                    await subtractEconomyItem(playFabId, entry.code, entry.amount);
                }
                deducted = true;

                const sizeLogic = normalizeSize(spec.SizeLogic, inferLogicSizeFromSlotsRequired(spec.SlotsRequired));
                const sizeVisual = normalizeSize(spec.SizeVisual, sizeLogic);
                const logicW = Math.max(1, Math.trunc(sizeLogic.x));
                const logicH = Math.max(1, Math.trunc(sizeLogic.y));
                const visualW = Math.max(1, Math.trunc(sizeVisual.x));
                const visualH = Math.max(1, Math.trunc(sizeVisual.y));
                const tileIndexRaw = spec.TileIndex;
                const tileIndexValue = Number.isFinite(Number(tileIndexRaw)) ? Number(tileIndexRaw) : target.tileIndex;
                const maxHp = computeMaxHp(logicW, logicH, nextLevel);

                const updated = await firestore.runTransaction(async (tx) => {
                    const snapTx = await tx.get(ref);
                    if (!snapTx.exists) throw new Error('IslandNotFound');
                    const data = snapTx.data() || {};
                    if (data.ownerId !== playFabId) throw new Error('NotOwner');
                    const list = Array.isArray(data.buildings) ? data.buildings.slice() : [];
                    const i = list.findIndex(b => b && b.status !== 'demolished');
                    if (i === -1) throw new Error('NoBuilding');
                    const active = list[i];
                    const activeId = String(active.buildingId || active.id || '');
                    if (activeId !== rawId) throw new Error('BuildingChanged');
                    const activeLevel = Math.max(1, Math.trunc(Number(active.level) || 1));
                    if (activeLevel !== currentLevel) throw new Error('BuildingChanged');
                    if (active.status !== 'completed') throw new Error('NotCompleted');

                    list[i] = {
                        ...active,
                        level: nextLevel,
                        width: logicW,
                        height: logicH,
                        visualWidth: visualW,
                        visualHeight: visualH,
                        tileIndex: tileIndexValue,
                        maxHp,
                        currentHp: maxHp,
                        lastUpgradedAt: Date.now()
                    };
                    tx.update(ref, { buildings: list });
                    return list[i];
                });

                res.json({ success: true, islandId, buildingId: rawId, nextLevel, building: updated });
            } catch (error) {
                if (deducted) {
                    for (const entry of effectiveCosts) {
                        await addEconomyItem(playFabId, entry.code, entry.amount);
                    }
                }
                throw error;
            }
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'IslandNotFound') return res.status(404).json({ error: 'IslandNotFound' });
            if (msg === 'NotOwner') return res.status(403).json({ error: 'NotOwner' });
            if (msg === 'NoBuilding') return res.status(400).json({ error: 'NoBuilding' });
            if (msg === 'NotCompleted') return res.status(400).json({ error: 'NotCompleted' });
            if (msg === 'BuildingChanged') return res.status(409).json({ error: 'BuildingChanged' });
            console.error('[upgrade-building] Error:', error);
            res.status(500).json({ error: 'Failed to upgrade building', details: error?.errorMessage || error?.message || error });
        }
    });

    // 建設中の島一覧
    app.get('/api/get-constructing-islands', async (req, res) => {
        try {
            const mapId = String(req?.query?.mapId || '').trim();
            const now = Date.now();

            const normalizeConstructingIslands = async (snapshot) => {
                const islands = [];
                for (const docSnap of snapshot.docs) {
                    const data = docSnap.data() || {};
                    const buildings = Array.isArray(data.buildings) ? data.buildings.slice() : [];
                    const idx = buildings.findIndex(b => b && b.status === 'constructing');
                    if (idx === -1) {
                        if (data.constructionStatus) {
                            await docSnap.ref.update({
                                constructionStatus: admin.firestore.FieldValue.delete()
                            });
                        }
                        continue;
                    }

                    const completionTime = Number(buildings[idx].completionTime) || 0;
                    if (completionTime && completionTime <= now) {
                        buildings[idx] = { ...buildings[idx], status: 'completed' };
                        const status = computeConstructionStatus(buildings);
                        const patch = {
                            buildings,
                            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                        };
                        if (status) {
                            patch.constructionStatus = status;
                        } else {
                            patch.constructionStatus = admin.firestore.FieldValue.delete();
                        }
                        await docSnap.ref.update(patch);
                        continue;
                    }

                    islands.push({ id: docSnap.id, ...data });
                }
                return islands;
            };

            if (mapId) {
                const snapshot = await getWorldMapCollection(firestore, mapId)
                    .where('constructionStatus', '==', 'constructing')
                    .get();
                const islands = await normalizeConstructingIslands(snapshot);
                return res.json({ success: true, islands });
            }

            const collections = await firestore.listCollections();
            const mapCollections = collections.filter((col) => String(col.id || '').startsWith('world_map'));
            const islands = [];
            for (const col of mapCollections) {
                const snapshot = await col.where('constructionStatus', '==', 'constructing').get();
                const list = await normalizeConstructingIslands(snapshot);
                islands.push(...list);
            }

            res.json({ success: true, islands });
        } catch (error) {
            console.error('[GetConstructingIslands] Error:', error);
            res.status(500).json({ error: 'Failed to get constructing islands', details: error.message });
        }
    });
}

module.exports = {
    RESOURCE_INTERVAL_MS,
    RESOURCE_BIOME_CURRENCY,
    getWorldMapCollection,
    findIslandDocAcrossMaps,
    worldToLatLng,
    deleteOwnedIslands,
    transferOwnedIslands,
    getOwnedMapIds,
    addOwnedMapId,
    removeOwnedMapId,
    resolveOwnedMapIds,
    hasMyHouseOwned,
    relocateActiveShip,
    getActiveShipIdForResource,
    getActiveShipCargoCapacity,
    initializeIslandRoutes
};
