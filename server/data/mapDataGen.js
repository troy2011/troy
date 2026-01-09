const SIZE_BY_KEY = {
    small: { w: 3, h: 3 },
    medium: { w: 4, h: 3 },
    large: { w: 4, h: 4 },
    giant: { w: 5, h: 5 }
};

const DEFAULT_COUNTS = { small: 20, large: 10, giant: 3 };

const MAJOR_ARCANA = [
    { number: 0, name: '愚者' },
    { number: 1, name: '魔術師' },
    { number: 2, name: '女教皇' },
    { number: 3, name: '女帝' },
    { number: 4, name: '皇帝' },
    { number: 5, name: '教皇' },
    { number: 6, name: '恋人' },
    { number: 7, name: '戦車' },
    { number: 8, name: '力' },
    { number: 9, name: '隠者' },
    { number: 10, name: '運命の輪' },
    { number: 11, name: '正義' },
    { number: 12, name: '吊るされた男' },
    { number: 13, name: '死神' },
    { number: 14, name: '節制' },
    { number: 15, name: '悪魔' },
    { number: 16, name: '塔' },
    { number: 17, name: '星' },
    { number: 18, name: '月' },
    { number: 19, name: '太陽' },
    { number: 20, name: '審判' },
    { number: 21, name: '世界' }
];

const RESOURCE_BIOME_BY_FACTION = {
    fire: 'volcanic',
    earth: 'rocky',
    wind: 'mushroom',
    water: 'lake',
    neutral: 'forest'
};

const NON_RESOURCE_BIOME_BY_FACTION = {
    fire: null,
    earth: null,
    wind: null,
    water: null,
    neutral: null
};

const BIOME_FRAME_BY_ID = {
    volcanic: 32,
    rocky: 33,
    mushroom: 34,
    lake: 35,
    forest: 36,
    sacred: 37
};

const MAP_SIZE = { width: 100, height: 100 };
const RESOURCE_CHANCE = 0.35;
const OBSTACLE_TILE_INDEX = 133;
const OBSTACLE_TYPES = ['岩礁', '渦潮', '氷塊', '竜の爪', '棘山', 'クレーター'];
const OBSTACLE_SIZES = [
    { w: 1, h: 1 },
    { w: 1, h: 2 },
    { w: 2, h: 2 }
];
const DEFAULT_OBSTACLE_COUNT = 10;

const getArcanaName = (number) => {
    const entry = MAJOR_ARCANA.find((item) => item.number === number);
    return entry ? entry.name : `Major ${number}`;
};

const getArcanaSizeKey = (number) => {
    if (number <= 7) return 'small';
    if (number <= 15) return 'large';
    return 'giant';
};

const pickBiome = (faction, allowResource) => {
    const key = String(faction || '').toLowerCase();
    if (allowResource && Math.random() < RESOURCE_CHANCE) {
        return RESOURCE_BIOME_BY_FACTION[key] || 'forest';
    }
    return NON_RESOURCE_BIOME_BY_FACTION[key] ?? null;
};

const canPlace = (occupied, rect) => {
    return !occupied.some((o) => (
        rect.x < o.x + o.w &&
        rect.x + rect.w > o.x &&
        rect.y < o.y + o.h &&
        rect.y + rect.h > o.y
    ));
};

const registerOccupied = (occupied, rect) => {
    occupied.push(rect);
};

const placeAtCenter = (sizeKey) => {
    const size = SIZE_BY_KEY[sizeKey] || SIZE_BY_KEY.small;
    const x = Math.floor((MAP_SIZE.width - size.w) / 2);
    const y = Math.floor((MAP_SIZE.height - size.h) / 2);
    return { x, y, w: size.w, h: size.h };
};

const placeRandom = (sizeKey, occupied) => {
    const size = SIZE_BY_KEY[sizeKey] || SIZE_BY_KEY.small;
    const maxX = MAP_SIZE.width - size.w;
    const maxY = MAP_SIZE.height - size.h;
    for (let i = 0; i < 200; i += 1) {
        const x = Math.floor(Math.random() * (maxX + 1));
        const y = Math.floor(Math.random() * (maxY + 1));
        const rect = { x, y, w: size.w, h: size.h };
        if (canPlace(occupied, rect)) return rect;
    }
    return null;
};

const placeRandomRect = (rectSize, occupied) => {
    const size = rectSize || { w: 1, h: 1 };
    const maxX = MAP_SIZE.width - size.w;
    const maxY = MAP_SIZE.height - size.h;
    for (let i = 0; i < 200; i += 1) {
        const x = Math.floor(Math.random() * (maxX + 1));
        const y = Math.floor(Math.random() * (maxY + 1));
        const rect = { x, y, w: size.w, h: size.h };
        if (canPlace(occupied, rect)) return rect;
    }
    return null;
};

const createIsland = (config) => {
    const biome = config.biome ?? null;
    const biomeFrame = config.biomeFrame ?? (biome ? BIOME_FRAME_BY_ID[String(biome).toLowerCase()] : null);
    return ({
    id: config.id,
    name: config.name,
    coordinate: { x: config.x, y: config.y },
    size: config.size,
    islandLevel: config.islandLevel ?? 1,
    ownerId: config.ownerId ?? null,
    ownerNation: config.ownerNation ?? null,
    nation: config.nation ?? null,
    biome: biome,
    biomeFrame: biomeFrame ?? null,
    occupationStatus: config.occupationStatus ?? null,
    buildingSlots: config.buildingSlots ?? null,
    buildings: Array.isArray(config.buildings) ? config.buildings : []
});
};

const getNationLabel = (faction) => {
    switch (String(faction || '').toLowerCase()) {
        case 'fire': return '火の国';
        case 'earth': return '土の国';
        case 'wind': return '風の国';
        case 'water': return '水の国';
        default: return '中立';
    }
};

const getBiomeLabel = (biome) => {
    switch (String(biome || '').toLowerCase()) {
        case 'volcanic':
        case 'rocky':
        case 'mushroom':
        case 'lake':
        case 'forest':
        case 'sacred':
            return '資源島';
        default:
            return '無人島';
    }
};

function generateMapData(options = {}) {
    const mapId = String(options.mapId || 'map');
    const mapType = String(options.mapType || 'nation');
    const faction = String(options.faction || 'neutral').toLowerCase();
    const factionLabel = getNationLabel(faction);
    const cardNumber = Number.isFinite(Number(options.cardNumber))
        ? Number(options.cardNumber)
        : null;
    const counts = { ...DEFAULT_COUNTS, ...(options.counts || {}) };

    const occupied = [];
    const islands = [];
    let index = 0;
    let obstacleIndex = 0;

    if (mapType === 'nation') {
        if (faction !== 'neutral' && mapId !== 'joker') {
            const rect = placeAtCenter('giant');
            registerOccupied(occupied, rect);
            islands.push(createIsland({
                id: `capital_${faction}`,
                name: `${factionLabel}首都`,
                x: rect.x,
                y: rect.y,
                size: 'giant',
                nation: faction,
                ownerNation: faction,
                biome: pickBiome(faction, false),
                occupationStatus: 'capital',
                buildingSlots: { layout: '3x3' },
                buildings: [{
                    buildingId: 'capital',
                    status: 'completed',
                    level: 1,
                    startTime: Date.now(),
                    completionTime: Date.now(),
                    durationMs: 0,
                    helpers: [],
                    width: 3,
                    height: 3,
                    visualWidth: 3,
                    visualHeight: 3,
                    tileIndex: 576,
                    x: 0,
                    y: 0
                }]
            }));
        }
    } else if (mapType === 'major' && cardNumber !== null) {
        const sizeKey = getArcanaSizeKey(cardNumber);
        const rect = placeAtCenter(sizeKey);
        registerOccupied(occupied, rect);
        islands.push(createIsland({
            id: `major_${String(cardNumber).padStart(2, '0')}`,
            name: `【${getArcanaName(cardNumber)}】の島`,
            x: rect.x,
            y: rect.y,
            size: sizeKey,
            nation: faction,
            ownerNation: null,
            biome: 'sacred',
            occupationStatus: 'sacred'
        }));
    }

    const addRandomIslands = (sizeKey, count, allowResource) => {
        for (let i = 0; i < count; i += 1) {
            const rect = placeRandom(sizeKey, occupied);
            if (!rect) continue;
            registerOccupied(occupied, rect);
            const biome = pickBiome(faction, !!allowResource);
            const islandNumber = String(index + 1).padStart(3, '0');
            const baseLabel = getBiomeLabel(biome);
            islands.push(createIsland({
                id: `${mapId}_island_${index += 1}`,
                name: `${baseLabel} ${islandNumber}`,
                x: rect.x,
                y: rect.y,
                size: sizeKey,
                nation: faction,
                ownerNation: null,
                biome: biome
            }));
        }
    };

    addRandomIslands('small', counts.small || 0, true);
    addRandomIslands('large', counts.large || 0);
    addRandomIslands('giant', counts.giant || 0);

    if (mapType === 'major') {
        const obstacleCount = Number.isFinite(Number(options.obstacleCount))
            ? Number(options.obstacleCount)
            : DEFAULT_OBSTACLE_COUNT;
        for (let i = 0; i < obstacleCount; i += 1) {
            const sizeSpec = OBSTACLE_SIZES[Math.floor(Math.random() * OBSTACLE_SIZES.length)];
            const rect = placeRandomRect(sizeSpec, occupied);
            if (!rect) continue;
            registerOccupied(occupied, rect);
            const typeLabel = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
            obstacleIndex += 1;
            islands.push({
                id: `${mapId}_obstacle_${String(obstacleIndex).padStart(3, '0')}`,
                type: 'obstacle',
                name: typeLabel,
                coordinate: { x: rect.x, y: rect.y },
                size: 'obstacle',
                width: sizeSpec.w,
                height: sizeSpec.h,
                visualWidth: sizeSpec.w,
                visualHeight: sizeSpec.h,
                tileIndex: OBSTACLE_TILE_INDEX,
                obstacleType: typeLabel
            });
        }
    }

    return islands;
}

module.exports = { generateMapData };
