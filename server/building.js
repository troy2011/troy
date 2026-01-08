// server/building.js
// 建物関連のユーティリティ関数

const buildingDefs = require('./data/buildingDefs');

function getSizeTag(tags) {
    const list = Array.isArray(tags) ? tags : [];
    return list.find(tag => typeof tag === 'string' && tag.startsWith('size_')) || null;
}

function sizeTagMatchesIsland(sizeTag, islandSize) {
    const expected = `size_${String(islandSize || '').toLowerCase()}`;
    return sizeTag === expected;
}

function normalizeSize(obj, fallback) {
    if (obj && typeof obj.x === 'number' && typeof obj.y === 'number') return { x: obj.x, y: obj.y };
    if (obj && typeof obj.x === 'string' && typeof obj.y === 'string') {
        const x = Number(obj.x);
        const y = Number(obj.y);
        if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    }
    return fallback;
}

function inferLogicSizeFromSlotsRequired(slotsRequired) {
    const s = Number(slotsRequired) || 1;
    if (s === 1) return { x: 1, y: 1 };
    if (s === 2) return { x: 2, y: 1 };
    if (s === 4) return { x: 2, y: 2 };
    if (s === 9) return { x: 3, y: 3 };
    return { x: 1, y: 1 };
}

function computeMaxHp(logicW, logicH, level = 1) {
    const w = Math.max(1, Math.trunc(Number(logicW) || 1));
    const h = Math.max(1, Math.trunc(Number(logicH) || 1));
    const base = w * h * 100;
    const lv = Math.max(1, Math.trunc(Number(level) || 1));
    const multiplier = 1 + 0.2 * (lv - 1);
    return Math.round(base * multiplier);
}

function buildPriceAmounts(cost) {
    const amounts = [];
    const entries = cost && typeof cost === 'object' ? Object.entries(cost) : [];
    entries.forEach(([code, amount]) => {
        const value = Number(amount);
        if (!code || !Number.isFinite(value) || value <= 0) return;
        amounts.push({ ItemId: code, Amount: value });
    });
    return amounts;
}

function getBuildingSpec(buildingId, level = null) {
    const building = buildingDefs?.getBuildingById
        ? buildingDefs.getBuildingById(buildingId, level)
        : null;
    if (!building) return null;

    const sizeLogic = building.sizeLogic || inferLogicSizeFromSlotsRequired(building.slotsRequired);
    const sizeVisual = building.sizeVisual || sizeLogic;
    const effects = { ...(building.effects || {}), ...(building.stats || {}) };
    const priceAmounts = buildPriceAmounts(building.cost || {});

    return {
        ItemId: building.id,
        ItemClass: 'Building',
        DisplayName: building.name,
        Description: building.description,
        Category: building.category,
        SlotsRequired: building.slotsRequired,
        BuildTime: building.buildTime,
        Cost: building.cost || {},
        PriceAmounts: priceAmounts,
        Effects: effects,
        SizeLogic: sizeLogic,
        SizeVisual: sizeVisual,
        TileIndex: building.tileIndex,
        Level: building.level,
        Tags: [`size_${building.slotsRequired === 1 ? 'small' : building.slotsRequired === 2 ? 'medium' : 'large'}`]
    };
}

function computeConstructionStatus(buildings) {
    const arr = Array.isArray(buildings) ? buildings : [];
    return arr.some(b => b && b.status === 'constructing') ? 'constructing' : null;
}

// ショップ関連定数
const SHOP_BUILDING_CATEGORIES = {
    weapon_shop: ['Weapon'],
    armor_shop: ['Armor', 'Shield'],
    item_shop: ['Consumable']
};

function getShopBuildingId(island) {
    const buildings = Array.isArray(island?.buildings) ? island.buildings : [];
    const active = buildings.find(b => b && b.status !== 'demolished');
    return active ? (active.buildingId || active.id || null) : null;
}

function getShopPricing(island) {
    const pricing = island?.shopPricing || {};
    const buyMultiplier = Number.isFinite(Number(pricing.buyMultiplier)) ? Number(pricing.buyMultiplier) : 0.7;
    const sellMultiplier = Number.isFinite(Number(pricing.sellMultiplier)) ? Number(pricing.sellMultiplier) : 1.2;
    const itemPrices = pricing.itemPrices && typeof pricing.itemPrices === 'object' ? pricing.itemPrices : {};
    return { buyMultiplier, sellMultiplier, itemPrices };
}

function resolveBasePrice(itemData) {
    const sellPrice = itemData?.SellPrice ? Number(itemData.SellPrice) : 0;
    const buyPrice = itemData?.BuyPrice ? Number(itemData.BuyPrice) : 0;
    return {
        sellPrice: Number.isFinite(sellPrice) ? sellPrice : 0,
        buyPrice: Number.isFinite(buyPrice) ? buyPrice : 0
    };
}

module.exports = {
    getSizeTag,
    sizeTagMatchesIsland,
    normalizeSize,
    inferLogicSizeFromSlotsRequired,
    computeMaxHp,
    getBuildingSpec,
    computeConstructionStatus,
    SHOP_BUILDING_CATEGORIES,
    getShopBuildingId,
    getShopPricing,
    resolveBasePrice,
    buildingDefs
};
