const DEFAULT_CATEGORY_WEIGHTS = {
    Weapon: 45,
    Armor: 35,
    Shield: 15,
    Consumable: 5
};

const DEFAULT_RARITY_WEIGHTS = {
    common: 70,
    rare: 20,
    epic: 7,
    legendary: 3
};

const ITEM_RARITY_THRESHOLDS = Object.freeze({
    rare: 18,
    epic: 35,
    legendary: 60
});

const TAROT_MINOR_RARITY_THRESHOLDS = Object.freeze({
    rare: 8,
    epic: 15
});

const DEFAULT_EXCLUDED_ITEM_PATTERNS = [
    'metal_*_*',
    'troy_menu_*'
];

const CATEGORY_ALIASES = {
    weapon: 'Weapon',
    armor: 'Armor',
    shield: 'Shield',
    consumable: 'Consumable'
};

function parseWeightMap(raw, fallback) {
    if (!raw) return { ...fallback };
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed || typeof parsed !== 'object') return { ...fallback };
        const result = {};
        for (const [key, value] of Object.entries(parsed)) {
            const amount = Number(value);
            if (Number.isFinite(amount) && amount > 0) result[key] = amount;
        }
        return Object.keys(result).length ? result : { ...fallback };
    } catch {
        return { ...fallback };
    }
}

const CATEGORY_WEIGHTS = parseWeightMap(process.env.LOCAL_GACHA_CATEGORY_WEIGHTS, DEFAULT_CATEGORY_WEIGHTS);
const RARITY_WEIGHTS = parseWeightMap(process.env.LOCAL_GACHA_RARITY_WEIGHTS, DEFAULT_RARITY_WEIGHTS);
const EXCLUDED_ITEM_PATTERNS = parseStringList(process.env.LOCAL_GACHA_EXCLUDED_ITEM_PATTERNS, DEFAULT_EXCLUDED_ITEM_PATTERNS);

function parseStringList(raw, fallback = []) {
    if (!raw) return [...fallback];
    try {
        const parsed = typeof raw === 'string' && raw.trim().startsWith('[')
            ? JSON.parse(raw)
            : String(raw).split(',');
        const values = Array.isArray(parsed)
            ? parsed.map((value) => String(value || '').trim()).filter(Boolean)
            : [];
        return values.length ? values : [...fallback];
    } catch {
        return [...fallback];
    }
}

function normalizeCategory(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return CATEGORY_ALIASES[raw.toLowerCase()] || raw;
}

function getItemCategory(item) {
    return normalizeCategory(
        item?.Category
        || item?.DisplayProperties?.Category
        || item?.CustomData?.Category
        || item?.customData?.Category
        || item?.ItemClass
        || item?.ContentType
        || item?.Type
    );
}

function getItemId(item) {
    const friendlyAlternate = Array.isArray(item?.AlternateIds)
        ? item.AlternateIds.find((entry) => String(entry?.Type || '').toLowerCase() === 'friendlyid')?.Value
        : '';
    return String(item?.ItemId || item?.FriendlyId || friendlyAlternate || item?.Id || '').trim();
}

function wildcardToRegExp(pattern) {
    const escaped = String(pattern || '')
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i');
}

function isExcludedItemId(itemId, options = {}) {
    const id = String(itemId || '').trim();
    if (!id) return true;
    const exact = new Set((options.excludedItemIds || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
    if (exact.has(id.toLowerCase())) return true;
    const patterns = options.excludedItemPatterns || EXCLUDED_ITEM_PATTERNS;
    return patterns.some((pattern) => wildcardToRegExp(pattern).test(id));
}

function isCatalogExcludedFromGacha(item) {
    const flag = item?.GachaExcluded
        ?? item?.LocalGachaExcluded
        ?? item?.TroyMenuConsumable
        ?? item?.DisplayProperties?.GachaExcluded
        ?? item?.DisplayProperties?.LocalGachaExcluded
        ?? item?.DisplayProperties?.TroyMenuConsumable
        ?? item?.CustomData?.GachaExcluded
        ?? item?.CustomData?.LocalGachaExcluded
        ?? item?.CustomData?.TroyMenuConsumable
        ?? item?.customData?.GachaExcluded
        ?? item?.customData?.LocalGachaExcluded
        ?? item?.customData?.TroyMenuConsumable;
    return flag === true || flag === 1 || String(flag || '').trim().toLowerCase() === 'true';
}

function getNumericItemValue(item, key) {
    const lowerKey = String(key).toLowerCase();
    const value = Number(
        item?.[key]
        ?? item?.[lowerKey]
        ?? item?.DisplayProperties?.[key]
        ?? item?.DisplayProperties?.[lowerKey]
        ?? item?.CustomData?.[key]
        ?? item?.CustomData?.[lowerKey]
        ?? item?.customData?.[key]
        ?? item?.customData?.[lowerKey]
    );
    return Number.isFinite(value) ? value : 0;
}

function getItemGateScore(item) {
    return Math.max(
        getNumericItemValue(item, 'Power'),
        getNumericItemValue(item, 'Defense'),
        getNumericItemValue(item, 'MagicPower'),
        getNumericItemValue(item, 'HealPower')
    );
}

function isWithinStatGate(item, options = {}) {
    const category = getItemCategory(item);
    const gates = options.maxStatsByCategory || {};
    const gate = gates[category] || gates.default || null;
    if (!gate || typeof gate !== 'object') return true;

    for (const [key, maxValue] of Object.entries(gate)) {
        const max = Number(maxValue);
        if (!Number.isFinite(max)) continue;
        const actual = String(key).toLowerCase() === 'score'
            ? getItemGateScore(item)
            : getNumericItemValue(item, key);
        if (actual > max) return false;
    }
    return true;
}

function getItemRarity(item) {
    const category = getItemCategory(item);
    if (category === 'TarotMajor') return 'legendary';

    const score = getItemGateScore(item);
    if (score > 0) {
        const thresholds = category === 'TarotMinor'
            ? TAROT_MINOR_RARITY_THRESHOLDS
            : ITEM_RARITY_THRESHOLDS;
        if (thresholds.legendary && score >= thresholds.legendary) return 'legendary';
        if (thresholds.epic && score >= thresholds.epic) return 'epic';
        if (thresholds.rare && score >= thresholds.rare) return 'rare';
        return 'common';
    }

    const explicit = String(item?.Rarity || item?.rarity || item?.Tier || item?.tier || '').trim().toLowerCase();
    if (explicit === 'legendary' || explicit === 'epic' || explicit === 'rare' || explicit === 'common') return explicit;
    return 'common';
}

function getCandidateWeight(item, options = {}) {
    const category = getItemCategory(item);
    const rarity = getItemRarity(item);
    const categoryWeights = options.categoryWeights || CATEGORY_WEIGHTS;
    const rarityWeights = options.rarityWeights || RARITY_WEIGHTS;
    const categoryWeight = Number(categoryWeights[category] || 0);
    const rarityWeight = Number(rarityWeights[rarity] || 0);
    if (categoryWeight <= 0 || rarityWeight <= 0) return 0;
    return categoryWeight * rarityWeight;
}

function buildLocalGachaCandidates(catalogCache, options = {}) {
    const allowedCategories = new Set(
        (options.allowedCategories || Object.keys(CATEGORY_WEIGHTS)).map(normalizeCategory)
    );
    return Object.values(catalogCache || {})
        .map((item) => {
            const itemId = getItemId(item);
            const category = getItemCategory(item);
            if (isCatalogExcludedFromGacha(item)) return null;
            if (isExcludedItemId(itemId, options)) return null;
            if (!itemId || !allowedCategories.has(category)) return null;
            if (!isWithinStatGate(item, options)) return null;
            const weight = getCandidateWeight(item, options);
            if (weight <= 0) return null;
            return {
                itemId,
                weight,
                category,
                rarity: getItemRarity(item),
                displayName: item?.DisplayName || itemId
            };
        })
        .filter(Boolean);
}

function pickWeighted(candidates, random = Math.random) {
    const total = candidates.reduce((sum, entry) => sum + Number(entry.weight || 0), 0);
    if (total <= 0) return null;
    let roll = random() * total;
    for (const entry of candidates) {
        roll -= Number(entry.weight || 0);
        if (roll < 0) return entry;
    }
    return candidates[candidates.length - 1] || null;
}

function drawLocalGachaItem(catalogCache, options = {}) {
    const candidates = buildLocalGachaCandidates(catalogCache, options);
    const picked = pickWeighted(candidates, options.random || Math.random);
    if (!picked) {
        throw new Error('Local gacha candidates are empty.');
    }
    return picked;
}

module.exports = {
    DEFAULT_CATEGORY_WEIGHTS,
    DEFAULT_RARITY_WEIGHTS,
    DEFAULT_EXCLUDED_ITEM_PATTERNS,
    buildLocalGachaCandidates,
    drawLocalGachaItem,
    getItemRarity,
    getItemGateScore
};
