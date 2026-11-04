const { createHash } = require('crypto');
const {
    getEquipmentCategory,
    normalizeDisplayProperties
} = require('./equipmentEnhancement');

// Random options are rolled by the server when a piece of equipment is granted and kept in that
// stack's DisplayProperties, next to its enhancement. The Economy V2 stack is their source of truth;
// a client never sends options in. The roll is seeded by the grant's idempotency key, so a retried
// grant gives the same options it would have the first time.
const EQUIPMENT_RANDOM_OPTIONS_VERSION = 2;
const EQUIPMENT_RANDOM_OPTIONS_PROPERTY = 'equipmentRandomOptions';
const EQUIPMENT_RANDOM_OPTION_CATEGORIES = Object.freeze(['Weapon', 'Armor', 'Shield', 'Accessory']);
const EQUIPMENT_RANDOM_OPTION_MAX_LEVEL = 9;

// Each option has a level from 1 to 9, and its stat grows by `perLevel` for each level. Critical rate is
// in percentage points, and an element's damage in percent added to that element's attacks.
const EQUIPMENT_RANDOM_OPTION_STATS = Object.freeze({
    Power: Object.freeze({ label: '攻撃力', perLevel: 1 }),
    Defense: Object.freeze({ label: '防御力', perLevel: 1 }),
    MagicPower: Object.freeze({ label: '術補', perLevel: 1 }),
    HealPower: Object.freeze({ label: '回復補正', perLevel: 1 }),
    Agi: Object.freeze({ label: 'すばやさ', perLevel: 1 }),
    Int: Object.freeze({ label: 'かしこさ', perLevel: 1 }),
    CriticalRate: Object.freeze({ label: '会心率', perLevel: 1, unit: '%' }),
    MaxHp: Object.freeze({ label: '最大HP', perLevel: 5 }),
    FireDamage: Object.freeze({ label: '火属性ダメージ', perLevel: 3, unit: '%' }),
    WaterDamage: Object.freeze({ label: '水属性ダメージ', perLevel: 3, unit: '%' }),
    WindDamage: Object.freeze({ label: '風属性ダメージ', perLevel: 3, unit: '%' }),
    EarthDamage: Object.freeze({ label: '地属性ダメージ', perLevel: 3, unit: '%' })
});
const EQUIPMENT_RANDOM_OPTION_STAT_KEYS = Object.freeze(Object.keys(EQUIPMENT_RANDOM_OPTION_STATS));

// The same for every rarity: half of all pieces come with no option.
const EQUIPMENT_RANDOM_OPTION_COUNT_WEIGHTS = Object.freeze([50, 30, 15, 5]);
const EQUIPMENT_RANDOM_OPTION_MAX_COUNT = EQUIPMENT_RANDOM_OPTION_COUNT_WEIGHTS.length - 1;
// Lv1 is the most common and Lv9 the rarest (weight 10 - level: Lv9 is 1 in 45).
const EQUIPMENT_RANDOM_OPTION_LEVEL_WEIGHTS = Object.freeze(
    Array.from({ length: EQUIPMENT_RANDOM_OPTION_MAX_LEVEL }, (_, index) => EQUIPMENT_RANDOM_OPTION_MAX_LEVEL - index)
);

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

function pickWeightedIndex(weights, random) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = random() * total;
    for (let index = 0; index < weights.length; index += 1) {
        roll -= weights[index];
        if (roll < 0) return index;
    }
    return weights.length - 1;
}

function getEquipmentRandomOptionValue(stat, level) {
    return (EQUIPMENT_RANDOM_OPTION_STATS[stat]?.perLevel || 0) * level;
}

function describeEquipmentRandomOption(stat, level) {
    const definition = EQUIPMENT_RANDOM_OPTION_STATS[stat];
    return {
        stat,
        level,
        value: getEquipmentRandomOptionValue(stat, level),
        label: definition.label,
        unit: definition.unit || ''
    };
}

function rollEquipmentRandomOptions(catalogData = {}, seed = '') {
    if (!isRandomOptionEquipment(catalogData)) return null;
    const random = createSeededRandom(seed);
    const count = pickWeightedIndex(EQUIPMENT_RANDOM_OPTION_COUNT_WEIGHTS, random);
    const pool = [...EQUIPMENT_RANDOM_OPTION_STAT_KEYS];
    const options = [];
    for (let index = 0; index < count && pool.length; index += 1) {
        const stat = pool.splice(Math.floor(random() * pool.length), 1)[0];
        const level = 1 + pickWeightedIndex(EQUIPMENT_RANDOM_OPTION_LEVEL_WEIGHTS, random);
        options.push({ stat, level });
    }
    return { version: EQUIPMENT_RANDOM_OPTIONS_VERSION, options };
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
            if (!EQUIPMENT_RANDOM_OPTION_STATS[stat] || seen.has(stat)) return null;
            seen.add(stat);
            const level = Math.max(0, Math.min(EQUIPMENT_RANDOM_OPTION_MAX_LEVEL, Math.floor(Number(option?.level) || 0)));
            return level > 0 ? describeEquipmentRandomOption(stat, level) : null;
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
            options: roll.options.map(({ stat, level }) => ({ stat, level }))
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
    EQUIPMENT_RANDOM_OPTION_MAX_LEVEL,
    EQUIPMENT_RANDOM_OPTION_STATS,
    applyEquipmentRandomOptionsToCatalogData,
    describeEquipmentRandomOption,
    buildEquipmentRandomOptionDisplayProperties,
    buildEquipmentRandomOptionStackId,
    getEquipmentRandomOptions,
    isRandomOptionEquipment,
    rollEquipmentRandomOptions
};
