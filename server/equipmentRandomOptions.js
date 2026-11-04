const { createHash } = require('crypto');
const {
    getEquipmentCategory,
    getEquipmentRarity,
    normalizeDisplayProperties
} = require('./equipmentEnhancement');

// Random options are rolled by the server when a piece of equipment is granted and kept in that
// stack's DisplayProperties, next to its enhancement. The Economy V2 stack is their source of truth;
// a client never sends options in. The roll is seeded by the grant's idempotency key, so a retried
// grant gives the same options it would have the first time.
const EQUIPMENT_RANDOM_OPTIONS_VERSION = 1;
const EQUIPMENT_RANDOM_OPTIONS_PROPERTY = 'equipmentRandomOptions';
const EQUIPMENT_RANDOM_OPTION_CATEGORIES = Object.freeze(['Weapon', 'Armor', 'Shield', 'Accessory']);

// Every stat here already reaches battle through the equipment stat totals.
const EQUIPMENT_RANDOM_OPTION_STATS = Object.freeze({
    Power: Object.freeze({ label: '攻撃力', maxByRarity: { common: 3, rare: 5, epic: 7, legendary: 10 } }),
    Defense: Object.freeze({ label: '防御力', maxByRarity: { common: 3, rare: 5, epic: 7, legendary: 10 } }),
    MagicPower: Object.freeze({ label: '術補', maxByRarity: { common: 3, rare: 5, epic: 7, legendary: 10 } }),
    HealPower: Object.freeze({ label: '回復補正', maxByRarity: { common: 3, rare: 5, epic: 7, legendary: 10 } }),
    Agi: Object.freeze({ label: 'すばやさ', maxByRarity: { common: 2, rare: 3, epic: 4, legendary: 5 } }),
    Int: Object.freeze({ label: 'かしこさ', maxByRarity: { common: 2, rare: 3, epic: 4, legendary: 5 } })
});
const EQUIPMENT_RANDOM_OPTION_STAT_KEYS = Object.freeze(Object.keys(EQUIPMENT_RANDOM_OPTION_STATS));

// common pieces get one option half of the time
const EQUIPMENT_RANDOM_OPTION_COUNT_BY_RARITY = Object.freeze({
    common: Object.freeze({ min: 0, max: 1 }),
    rare: Object.freeze({ min: 1, max: 1 }),
    epic: Object.freeze({ min: 2, max: 2 }),
    legendary: Object.freeze({ min: 3, max: 3 })
});
const EQUIPMENT_RANDOM_OPTION_MAX_COUNT = 3;

function isRandomOptionEquipment(catalogData = {}) {
    return EQUIPMENT_RANDOM_OPTION_CATEGORIES.includes(getEquipmentCategory(catalogData));
}

// A small seeded generator (mulberry32) so the same seed always rolls the same options.
function createSeededRandom(seed) {
    let state = createHash('sha256').update(String(seed || '')).digest().readUInt32LE(0);
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function rollEquipmentRandomOptions(catalogData = {}, seed = '') {
    if (!isRandomOptionEquipment(catalogData)) return null;
    const rarity = getEquipmentRarity(catalogData);
    const countRange = EQUIPMENT_RANDOM_OPTION_COUNT_BY_RARITY[rarity] || EQUIPMENT_RANDOM_OPTION_COUNT_BY_RARITY.common;
    const random = createSeededRandom(seed);
    const count = countRange.min + Math.floor(random() * (countRange.max - countRange.min + 1));
    const pool = [...EQUIPMENT_RANDOM_OPTION_STAT_KEYS];
    const options = [];
    for (let index = 0; index < count && pool.length; index += 1) {
        const stat = pool.splice(Math.floor(random() * pool.length), 1)[0];
        const max = EQUIPMENT_RANDOM_OPTION_STATS[stat].maxByRarity[rarity] || 1;
        options.push({ stat, value: 1 + Math.floor(random() * max) });
    }
    return { version: EQUIPMENT_RANDOM_OPTIONS_VERSION, rarity, options };
}

// The stored options, kept only when they are ones a roll could have given.
function getEquipmentRandomOptions(inventoryItem = {}) {
    const displayProperties = normalizeDisplayProperties(
        inventoryItem?.DisplayProperties ?? inventoryItem?.displayProperties
    );
    const stored = displayProperties[EQUIPMENT_RANDOM_OPTIONS_PROPERTY];
    if (!stored || typeof stored !== 'object' || !Array.isArray(stored.options)) return [];
    const seen = new Set();
    return stored.options
        .map((option) => {
            const stat = String(option?.stat || '');
            const definition = EQUIPMENT_RANDOM_OPTION_STATS[stat];
            if (!definition || seen.has(stat)) return null;
            seen.add(stat);
            const max = Math.max(...Object.values(definition.maxByRarity));
            const value = Math.max(0, Math.min(max, Math.floor(Number(option?.value) || 0)));
            return value > 0 ? { stat, value, label: definition.label } : null;
        })
        .filter(Boolean)
        .slice(0, EQUIPMENT_RANDOM_OPTION_MAX_COUNT);
}

function applyEquipmentRandomOptionsToCatalogData(catalogData = {}, options = []) {
    if (!options.length) return catalogData;
    const next = { ...catalogData };
    options.forEach(({ stat, value }) => {
        next[stat] = (Number(next[stat]) || 0) + value;
    });
    return next;
}

function buildEquipmentRandomOptionDisplayProperties(currentDisplayProperties = {}, roll = null) {
    const current = normalizeDisplayProperties(currentDisplayProperties);
    if (!roll || !Array.isArray(roll.options) || !roll.options.length) return current;
    return {
        ...current,
        [EQUIPMENT_RANDOM_OPTIONS_PROPERTY]: {
            version: roll.version,
            options: roll.options.map(({ stat, value }) => ({ stat, value }))
        }
    };
}

// A stack id that is the same on every retry of one grant, so a retry cannot leave a second stack.
function buildEquipmentRandomOptionStackId(seed = '') {
    return `ro-${createHash('sha256').update(String(seed || '')).digest('hex').slice(0, 32)}`;
}

module.exports = {
    EQUIPMENT_RANDOM_OPTIONS_PROPERTY,
    EQUIPMENT_RANDOM_OPTIONS_VERSION,
    EQUIPMENT_RANDOM_OPTION_STATS,
    applyEquipmentRandomOptionsToCatalogData,
    buildEquipmentRandomOptionDisplayProperties,
    buildEquipmentRandomOptionStackId,
    getEquipmentRandomOptions,
    isRandomOptionEquipment,
    rollEquipmentRandomOptions
};
