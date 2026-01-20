const { getWorldMapCollection } = require('./island');
const buildingDefs = require('./data/buildingDefs');

const GRID_SIZE = 32;
const SIZE_BY_KEY = {
    small: { w: 3, h: 3 },
    medium: { w: 4, h: 3 },
    large: { w: 4, h: 4 },
    giant: { w: 5, h: 5 }
};

const cache = new Map();

function getMapKey(mapId) {
    const raw = String(mapId || '');
    return raw ? raw : 'world_map';
}

async function loadIslands(mapId, firestore) {
    const key = getMapKey(mapId);
    const cached = cache.get(key);
    if (cached) return cached;
    const snapshot = await getWorldMapCollection(firestore, mapId).get();
    const islands = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    cache.set(key, islands);
    return islands;
}

function invalidateMapCache(mapId) {
    cache.delete(getMapKey(mapId));
}

function getIslandRect(island) {
    const sizeKey = String(island?.size || 'small').toLowerCase();
    const size = SIZE_BY_KEY[sizeKey] || SIZE_BY_KEY.small;
    const x = Number(island?.x) || 0;
    const y = Number(island?.y) || 0;
    return { x, y, width: size.w * GRID_SIZE, height: size.h * GRID_SIZE };
}

function getIslandCenter(rect) {
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function getActiveBuilding(island) {
    const list = Array.isArray(island?.buildings) ? island.buildings : [];
    return list.find((b) => b && b.status === 'completed') || null;
}

function resolveBuildingEffects(building) {
    if (!building) return null;
    if (building.effects && typeof building.effects === 'object') return building.effects;
    const buildingId = building.buildingId || building.id || null;
    const level = Number.isFinite(Number(building.level)) ? Number(building.level) : null;
    if (!buildingId || !buildingDefs?.getBuildingById) return null;
    const def = buildingDefs.getBuildingById(buildingId, level);
    return def?.effects || null;
}

function distance(a, b) {
    const dx = (Number(a?.x) || 0) - (Number(b?.x) || 0);
    const dy = (Number(a?.y) || 0) - (Number(b?.y) || 0);
    return Math.sqrt(dx * dx + dy * dy);
}

function collectFlags(effects, distTiles) {
    const flags = {};
    const check = (key, flag) => {
        const radius = Number(effects?.[key] || 0);
        if (radius > 0 && distTiles <= radius) flags[flag] = true;
    };
    check('autoAttackRadius', 'autoAttack');
    check('watchRadius', 'watch');
    check('areaBuffRadius', 'areaBuff');
    check('areaHealRadius', 'areaHeal');
    check('allyDeathBuffRadius', 'allyDeathBuff');
    check('enemyDeathPrisonRadius', 'enemyDeathPrison');
    check('fogSlowRadius', 'fogSlow');
    return flags;
}

async function getEffectsAtPosition(mapId, position, firestore) {
    if (!position || !Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.y))) return [];
    const islands = await loadIslands(mapId, firestore);
    const results = [];
    islands.forEach((island) => {
        const building = getActiveBuilding(island);
        const effects = resolveBuildingEffects(building);
        if (!effects || typeof effects !== 'object') return;
        const rect = getIslandRect(island);
        const center = getIslandCenter(rect);
        const distPx = distance(center, position);
        const distTiles = distPx / GRID_SIZE;
        const flags = collectFlags(effects, distTiles);
        const hasGlobalWatch = effects.watchGlobal === true;
        if (Object.keys(flags).length === 0 && !hasGlobalWatch) return;
        results.push({
            islandId: island.id,
            ownerNation: island.ownerNation || island.nation || null,
            buildingId: building.buildingId || building.id || null,
            effects,
            flags,
            distanceTiles: distTiles
        });
    });
    return results;
}

module.exports = {
    GRID_SIZE,
    invalidateMapCache,
    getEffectsAtPosition
};
