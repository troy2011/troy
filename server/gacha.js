const DEFAULT_CATEGORY_WEIGHTS = {
    Weapon: 45,
    Armor: 35,
    Shield: 15,
    Consumable: 5
};

const DEFAULT_RARITY_WEIGHTS = {
    common: 55,
    uncommon: 25,
    rare: 13,
    epic: 5,
    legendary: 2
};

const DEFAULT_EXCLUDED_ITEM_PATTERNS = [
    'metal_*_*'
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
    return normalizeCategory(item?.Category || item?.ItemClass || item?.ContentType || item?.Type);
}

function getItemId(item) {
    return String(item?.ItemId || item?.FriendlyId || '').trim();
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

function getItemPrice(item) {
    const amounts = Array.isArray(item?.PriceAmounts) ? item.PriceAmounts : [];
    const ps = amounts.find((entry) => String(entry?.ItemId || '').toUpperCase() === 'PS');
    const amount = Number(ps?.Amount);
    return Number.isFinite(amount) && amount > 0 ? amount : 500;
}

function getItemRarity(item) {
    const explicit = String(item?.Rarity || item?.rarity || item?.Tier || item?.tier || '').trim().toLowerCase();
    if (explicit && RARITY_WEIGHTS[explicit]) return explicit;

    const id = getItemId(item);
    const suffixMatch = id.match(/_(\d+)$/);
    if (suffixMatch) {
        const rank = Number(suffixMatch[1]);
        if (rank >= 24) return 'legendary';
        if (rank >= 18) return 'epic';
        if (rank >= 11) return 'rare';
        if (rank >= 5) return 'uncommon';
    }

    const price = getItemPrice(item);
    if (price >= 12000) return 'legendary';
    if (price >= 5000) return 'epic';
    if (price >= 1500) return 'rare';
    if (price >= 800) return 'uncommon';
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
            if (isExcludedItemId(itemId, options)) return null;
            if (!itemId || !allowedCategories.has(category)) return null;
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
    drawLocalGachaItem
};
