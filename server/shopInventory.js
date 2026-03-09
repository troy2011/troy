const { SHOP_BUILDING_CATEGORIES } = require('./building');

const SHOP_PRIMARY_STAT_LIMIT_BY_LEVEL = Object.freeze({
    1: 20,
    2: 35,
    3: 50,
    4: 70,
    5: 90
});

const SHOP_INITIAL_STOCK_RANGE_BY_BUILDING = Object.freeze({
    weapon_shop: { min: 2, max: 4 },
    armor_shop: { min: 2, max: 4 },
    item_shop: { min: 3, max: 5 }
});

const SHOP_COPY_FORBIDDEN_SPRITE_PATTERNS = Object.freeze([
    /\/weapons\/melee weapons\/sword_big\.[a-z0-9]+$/i,
    /\/weapons\/melee weapons\/axe_big\.[a-z0-9]+$/i,
    /\/weapons\/magic weapons\/staff\.[a-z0-9]+$/i,
    /\/wardrobe\/metal\/metal(?:_[a-z]+)?\.[a-z0-9]+$/i
]);

function clampShopLevel(level) {
    const normalized = Math.max(1, Math.floor(Number(level) || 1));
    return Math.min(5, normalized);
}

function isExplicitFalse(value) {
    if (value === false || value === 0) return true;
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'false' || normalized === '0' || normalized === 'no';
}

function isExplicitTrue(value) {
    if (value === true || value === 1) return true;
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function parseCatalogStat(itemData, keys) {
    for (const key of keys) {
        const value = Number.parseInt(itemData?.[key], 10);
        if (Number.isFinite(value)) return value;
    }
    return 0;
}

function getCatalogPrimaryStatValue(itemData) {
    const category = String(itemData?.Category || '').trim();
    if (category === 'Weapon') {
        return parseCatalogStat(itemData, ['Attack', 'Atk', 'Power', 'attack', 'atk']);
    }
    if (category === 'Armor' || category === 'Shield') {
        return parseCatalogStat(itemData, ['Defense', 'Def', 'defense', 'def']);
    }
    return 0;
}

function getShopPrimaryStatLimit(buildingId, shopLevel) {
    if (buildingId !== 'weapon_shop' && buildingId !== 'armor_shop') {
        return Number.POSITIVE_INFINITY;
    }
    const normalizedLevel = clampShopLevel(shopLevel);
    return SHOP_PRIMARY_STAT_LIMIT_BY_LEVEL[normalizedLevel] || SHOP_PRIMARY_STAT_LIMIT_BY_LEVEL[1];
}

function normalizeSpritePath(spritePath) {
    return String(spritePath || '').replace(/\\/g, '/').trim().toLowerCase();
}

function isShopCopyForbiddenItem(itemData) {
    if (!itemData) return false;
    if (isExplicitTrue(itemData.ShopCopyForbidden)) return true;
    const spritePath = normalizeSpritePath(itemData.sprite_path);
    if (!spritePath) return false;
    return SHOP_COPY_FORBIDDEN_SPRITE_PATTERNS.some((pattern) => pattern.test(spritePath));
}

function canShopCloneItem({ buildingId, shopLevel, itemData }) {
    const categories = SHOP_BUILDING_CATEGORIES[buildingId] || [];
    const category = String(itemData?.Category || '').trim();
    if (!categories.includes(category)) return false;
    if (isExplicitFalse(itemData?.ShopCraftable)) return false;
    if (isShopCopyForbiddenItem(itemData)) return false;
    if (buildingId === 'item_shop') return true;
    const limit = getShopPrimaryStatLimit(buildingId, shopLevel);
    const statValue = getCatalogPrimaryStatValue(itemData);
    return statValue > 0 && statValue <= limit;
}

function canSeedShopItem({ buildingId, shopLevel, itemData }) {
    const categories = SHOP_BUILDING_CATEGORIES[buildingId] || [];
    const category = String(itemData?.Category || '').trim();
    if (!categories.includes(category)) return false;
    if (isExplicitFalse(itemData?.ShopSeedable)) return false;
    const basePrice = Number(itemData?.BuyPrice || itemData?.SellPrice || 0);
    if (!Number.isFinite(basePrice) || basePrice <= 0) return false;
    if (buildingId === 'item_shop') return true;
    const limit = getShopPrimaryStatLimit(buildingId, shopLevel);
    const statValue = getCatalogPrimaryStatValue(itemData);
    return statValue > 0 && statValue <= limit;
}

function getShopInitialStockRange(buildingId) {
    return SHOP_INITIAL_STOCK_RANGE_BY_BUILDING[buildingId] || { min: 0, max: 0 };
}

function randomIntInRange(min, max, random = Math.random) {
    if (max <= min) return min;
    const safeRandom = Math.min(0.999999, Math.max(0, Number(random()) || 0));
    return min + Math.floor(safeRandom * ((max - min) + 1));
}

function shuffle(list, random = Math.random) {
    const next = Array.isArray(list) ? list.slice() : [];
    for (let index = next.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor((Math.min(0.999999, Math.max(0, Number(random()) || 0))) * (index + 1));
        const temp = next[index];
        next[index] = next[swapIndex];
        next[swapIndex] = temp;
    }
    return next;
}

function pickRandomShopSeedInventory({ buildingId, shopLevel, catalogCache, random = Math.random }) {
    const range = getShopInitialStockRange(buildingId);
    if (range.max <= 0) return [];

    const eligibleIds = Object.entries(catalogCache || {})
        .filter(([itemId, itemData]) => itemId && canSeedShopItem({ buildingId, shopLevel, itemData }))
        .map(([itemId]) => itemId);

    if (!eligibleIds.length) return [];

    const count = Math.min(
        eligibleIds.length,
        randomIntInRange(range.min, range.max, random)
    );

    return shuffle(eligibleIds, random)
        .slice(0, count)
        .map((itemId) => ({
            itemId,
            count: 1,
            seedSource: 'initial'
        }));
}

function resolveDisplayedSellPrice(item) {
    if (Number.isFinite(Number(item?.fixedSellPrice))) return Number(item.fixedSellPrice);
    if (Number.isFinite(Number(item?.buyPrice)) && Number(item.buyPrice) > 0) return Number(item.buyPrice);
    if (Number.isFinite(Number(item?.sellPrice))) return Number(item.sellPrice);
    return 0;
}

function sortShopInventoryEntries(items, buildingId) {
    const list = Array.isArray(items) ? items.slice() : [];
    return list.sort((left, right) => {
        const leftStat = Number(left?.primaryStatValue || 0);
        const rightStat = Number(right?.primaryStatValue || 0);
        if (buildingId === 'weapon_shop' || buildingId === 'armor_shop') {
            if (rightStat !== leftStat) return rightStat - leftStat;
        }

        const leftPrice = resolveDisplayedSellPrice(left);
        const rightPrice = resolveDisplayedSellPrice(right);
        if (leftPrice !== rightPrice) return leftPrice - rightPrice;

        const leftName = String(left?.name || left?.itemId || '');
        const rightName = String(right?.name || right?.itemId || '');
        return leftName.localeCompare(rightName, 'ja');
    });
}

module.exports = {
    SHOP_PRIMARY_STAT_LIMIT_BY_LEVEL,
    SHOP_INITIAL_STOCK_RANGE_BY_BUILDING,
    SHOP_COPY_FORBIDDEN_SPRITE_PATTERNS,
    clampShopLevel,
    getCatalogPrimaryStatValue,
    getShopPrimaryStatLimit,
    isShopCopyForbiddenItem,
    canShopCloneItem,
    canSeedShopItem,
    pickRandomShopSeedInventory,
    sortShopInventoryEntries
};
