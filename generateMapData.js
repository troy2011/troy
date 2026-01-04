const SIZE_BY_KEY = {
    small: { w: 3, h: 3 },
    medium: { w: 4, h: 3 },
    large: { w: 4, h: 4 },
    giant: { w: 5, h: 5 }
};

const DEFAULT_COUNTS = { small: 20, large: 10, giant: 3 };

const MAJOR_ARCANA = [
    { number: 0, name: 'The Fool' },
    { number: 1, name: 'The Magician' },
    { number: 2, name: 'The High Priestess' },
    { number: 3, name: 'The Empress' },
    { number: 4, name: 'The Emperor' },
    { number: 5, name: 'The Hierophant' },
    { number: 6, name: 'The Lovers' },
    { number: 7, name: 'The Chariot' },
    { number: 8, name: 'Strength' },
    { number: 9, name: 'The Hermit' },
    { number: 10, name: 'Wheel of Fortune' },
    { number: 11, name: 'Justice' },
    { number: 12, name: 'The Hanged Man' },
    { number: 13, name: 'Death' },
    { number: 14, name: 'Temperance' },
    { number: 15, name: 'The Devil' },
    { number: 16, name: 'The Tower' },
    { number: 17, name: 'The Star' },
    { number: 18, name: 'The Moon' },
    { number: 19, name: 'The Sun' },
    { number: 20, name: 'Judgement' },
    { number: 21, name: 'The World' }
];

const RESOURCE_BIOME_BY_FACTION = {
    fire: 'volcanic',
    earth: 'rocky',
    wind: 'mushroom',
    water: 'lake',
    neutral: 'forest'
};

const NON_RESOURCE_BIOME_BY_FACTION = {
    fire: 'beach',
    earth: 'jungle',
    wind: 'ocean',
    water: 'beach',
    neutral: 'beach'
};

const MAP_SIZE = { width: 100, height: 100 };
const RESOURCE_CHANCE = 0.35;

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
    return NON_RESOURCE_BIOME_BY_FACTION[key] || 'beach';
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

const createIsland = (config) => ({
    id: config.id,
    name: config.name,
    coordinate: { x: config.x, y: config.y },
    size: config.size,
    islandLevel: config.islandLevel ?? 1,
    ownerId: config.ownerId ?? null,
    ownerNation: config.ownerNation ?? null,
    nation: config.nation ?? null,
    biome: config.biome ?? null,
    biomeFrame: config.biomeFrame ?? null,
    occupationStatus: config.occupationStatus ?? null,
    buildingSlots: config.buildingSlots ?? null,
    buildings: Array.isArray(config.buildings) ? config.buildings : []
});

function generateMapData(options = {}) {
    const mapId = String(options.mapId || 'map');
    const mapType = String(options.mapType || 'nation');
    const faction = String(options.faction || 'neutral').toLowerCase();
    const factionLabel = options.factionLabel || faction;
    const cardNumber = Number.isFinite(Number(options.cardNumber))
        ? Number(options.cardNumber)
        : null;
    const counts = { ...DEFAULT_COUNTS, ...(options.counts || {}) };

    const occupied = [];
    const islands = [];
    let index = 0;

    if (mapType === 'nation') {
        if (faction !== 'neutral' && mapId !== 'joker') {
            const rect = placeAtCenter('giant');
            registerOccupied(occupied, rect);
            islands.push(createIsland({
                id: `capital_${faction}`,
                name: `${factionLabel} Capital`,
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
            name: getArcanaName(cardNumber),
            x: rect.x,
            y: rect.y,
            size: sizeKey,
            nation: faction,
            ownerNation: null,
            biome: 'sacred',
            occupationStatus: 'sacred'
        }));
    }

    const addRandomIslands = (sizeKey, count) => {
        for (let i = 0; i < count; i += 1) {
            const rect = placeRandom(sizeKey, occupied);
            if (!rect) continue;
            registerOccupied(occupied, rect);
            islands.push(createIsland({
                id: `${mapId}_island_${index += 1}`,
                name: `${mapId}_island_${index}`,
                x: rect.x,
                y: rect.y,
                size: sizeKey,
                nation: faction,
                ownerNation: null,
                biome: pickBiome(faction, true)
            }));
        }
    };

    addRandomIslands('small', counts.small || 0);
    addRandomIslands('large', counts.large || 0);
    addRandomIslands('giant', counts.giant || 0);

    return islands;
}

module.exports = { generateMapData };
