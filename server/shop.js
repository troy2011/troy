// server/shop.js
// ショップ関連のAPI

const {
    SHOP_BUILDING_CATEGORIES,
    getShopBuildingId,
    getShopPricing,
    resolveBasePrice,
    getSizeTag,
    sizeTagMatchesIsland,
    normalizeSize,
    inferLogicSizeFromSlotsRequired,
    computeMaxHp,
    getBuildingSpec,
    computeConstructionStatus,
    buildingDefs
} = require('./building');
const { getWorldMapCollection, findIslandDocAcrossMaps, addOwnedMapId, hasMyHouseOwned } = require('./island');
const { VIRTUAL_CURRENCY_CODE } = require('./economy');
const { invalidateMapCache } = require('./islandEffects');
const {
    canShopCloneItem,
    isShopCopyForbiddenItem,
    pickRandomShopSeedInventory,
    sortShopInventoryEntries
} = require('./shopInventory');

const RESOURCE_BIOME_JP = {
    '火山': 'volcanic',
    '岩場': 'rocky',
    'キノコ': 'mushroom',
    '湖': 'lake',
    '森林': 'forest',
    '聖地': 'sacred'
};
const RESOURCE_BIOMES = new Set(['volcanic', 'rocky', 'mushroom', 'lake', 'forest', 'sacred']);
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
const FIXED_BUILDING_RESOURCE_COSTS = {
    my_house: {
        1: [['RT', 2]],
        2: [['RT', 3]],
        3: [['RT', 5], ['RS', 1]],
        4: [['RT', 7], ['RS', 1]],
        5: [['RT', 9], ['RS', 2]]
    },
    watchtower: {
        1: [['RT', 2]],
        2: [['RT', 2]],
        3: [['RT', 4], ['RS', 1]]
    },
    teslatower: {
        1: [['RT', 2]],
        2: [['RT', 2]],
        3: [['RT', 4], ['RS', 1]]
    },
    coastal_battery: {
        1: [['RT', 2], ['RS', 1]]
    },
    dragon_gate: {
        1: [['RT', 7], ['RS', 2]]
    },
    shipyard: {
        1: [['RT', 8], ['RS', 2]]
    },
    farm: {
        1: [['RT', 3]]
    },
    weapon_shop: {
        1: [['RT', 4]]
    },
    armor_shop: {
        1: [['RT', 4]]
    },
    item_shop: {
        1: [['RT', 3]]
    },
    tavern: {
        1: [['RT', 2]]
    },
    inn: {
        1: [['RT', 4]]
    },
    hot_spring: {
        1: [['RT', 4]]
    },
    repair_dock: {
        1: [['RT', 5], ['RS', 1]]
    },
    temple: {
        1: [['RT', 10], ['RS', 2]],
        2: [['RT', 12], ['RS', 3]],
        3: [['RT', 15], ['RS', 4]]
    },
    goddess_statue: {
        1: [['RT', 6], ['RS', 1]]
    },
    arcana_fool_tavern: {
        1: [['RT', 5], ['RS', 1]]
    },
    arcana_magician_school: {
        1: [['RT', 8], ['RS', 2]]
    },
    arcana_priestess_fountain_palace: {
        1: [['RT', 8], ['RS', 2]]
    },
    arcana_empress_garden: {
        1: [['RT', 8], ['RS', 2]]
    },
    arcana_emperor_training: {
        1: [['RT', 8], ['RS', 2]]
    },
    arcana_hierophant_lab: {
        1: [['RT', 9], ['RS', 2]]
    },
    arcana_lovers_palace: {
        1: [['RT', 9], ['RS', 2]]
    },
    arcana_chariot_factory: {
        1: [['RT', 9], ['RS', 2]]
    },
    arcana_strength_fortress: {
        1: [['RT', 9], ['RS', 2]]
    },
    arcana_hermit_lodge: {
        1: [['RT', 10], ['RS', 2]]
    },
    arcana_wheel_casino: {
        1: [['RT', 10], ['RS', 2]]
    },
    arcana_justice_court: {
        1: [['RT', 10], ['RS', 2]]
    },
    arcana_hanged_altar: {
        1: [['RT', 10], ['RS', 2]]
    },
    arcana_death_mausoleum: {
        1: [['RT', 10], ['RS', 2]]
    },
    arcana_temperance_spring: {
        1: [['RT', 10], ['RS', 2]]
    },
    arcana_devil_black_market: {
        1: [['RT', 12], ['RS', 3]]
    },
    arcana_tower_judgement: {
        1: [['RT', 11], ['RS', 2]]
    },
    arcana_star_observatory: {
        1: [['RT', 12], ['RS', 3]]
    },
    arcana_moon_shrine: {
        1: [['RT', 12], ['RS', 3]]
    },
    arcana_sun_temple: {
        1: [['RT', 11], ['RS', 2]]
    },
    arcana_judgement_belltower: {
        1: [['RT', 13], ['RS', 3]]
    },
    arcana_world_tree: {
        1: [['RT', 15], ['RS', 4]]
    }
};

function normalizeNationKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;
    return NATION_ALIAS[raw] || raw;
}

function computeBaseCostAmount(costEntries) {
    const normalized = Array.isArray(costEntries) ? costEntries : [];
    const ps = normalized
        .filter(([code]) => String(code || '').toUpperCase() === VIRTUAL_CURRENCY_CODE)
        .reduce((sum, [, amount]) => sum + (Number(amount) || 0), 0);
    if (ps > 0) return ps;
    return normalized.reduce((sum, [, amount]) => sum + (Number(amount) || 0), 0);
}

function mergeCostEntries(entries, extra) {
    const map = new Map();
    entries.forEach(([code, amount]) => {
        const key = String(code || '').trim();
        if (!key) return;
        map.set(key, (map.get(key) || 0) + (Number(amount) || 0));
    });
    extra.forEach(({ ItemId, Amount }) => {
        const key = String(ItemId || '').trim();
        if (!key) return;
        map.set(key, (map.get(key) || 0) + (Number(Amount) || 0));
    });
    return Array.from(map.entries());
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
    if (options.onlyResource) return resources.map((entry) => [entry.ItemId, entry.Amount]);
    return mergeCostEntries(costEntries, resources);
}

function getFixedBuildingResourceCostEntries(buildingId, targetLevel = 1) {
    const table = FIXED_BUILDING_RESOURCE_COSTS[String(buildingId || '').trim()];
    if (!table) return [];
    const entries = table[Math.max(1, Math.trunc(Number(targetLevel) || 1))] || [];
    return entries
        .map(([code, amount]) => [String(code || '').trim(), Number(amount) || 0])
        .filter(([code, amount]) => code && amount > 0);
}

function normalizeEntityKey(input) {
    const id = input?.Id || input?.id || null;
    const type = input?.Type || input?.type || null;
    if (!id || !type) return null;
    return { Id: String(id), Type: String(type) };
}

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

async function getMapBuildingCounts(mapId, firestore) {
    if (!mapId) return null;
    const counts = {};
    const snapshot = await getWorldMapCollection(firestore, mapId).get();
    snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const list = Array.isArray(data.buildings) ? data.buildings : [];
        list.forEach((entry) => {
            if (!entry || entry.status === 'demolished') return;
            const rawId = String(entry.buildingId || entry.id || '');
            if (!rawId) return;
            counts[rawId] = (counts[rawId] || 0) + 1;
        });
    });
    return counts;
}

async function getPlayerNation(playFabId, deps) {
    if (!playFabId) return null;
    const { promisifyPlayFab, PlayFabServer } = deps;
    try {
        const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['Nation']
        });
        return String(result?.Data?.Nation?.Value || '').trim().toLowerCase() || null;
    } catch (error) {
        console.warn('[GetPlayerNation] Failed:', error?.errorMessage || error?.message || error);
        return null;
    }
}

function normalizeConditionMapIds(conditionMapId) {
    if (!conditionMapId) return null;
    if (Array.isArray(conditionMapId)) return conditionMapId.map(id => String(id));
    return [String(conditionMapId)];
}

function normalizeBiomeKey(biome) {
    if (!biome) return '';
    const raw = String(biome).trim();
    return (RESOURCE_BIOME_JP[raw] || raw).toLowerCase();
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

function checkMapIdCondition(condition, mapId) {
    const mapIds = normalizeConditionMapIds(condition?.mapId);
    if (!mapIds) return true;
    if (!mapId) return false;
    return mapIds.includes(String(mapId));
}

function checkBuildingCountCondition(condition, mapBuildingCounts) {
    const requiredId = String(condition?.buildingId || '').trim();
    const minCount = Number(condition?.minCount || 0);
    if (!requiredId || minCount <= 0) return true;
    if (!mapBuildingCounts) return false;
    const current = Number(mapBuildingCounts[requiredId] || 0);
    return current >= minCount;
}

function checkOccupationCondition(condition, mapOccupationNation, playerNation) {
    if (!condition?.requiresOccupation) return true;
    if (!mapOccupationNation) return false;
    if (condition.matchNation === false) return true;
    return !!playerNation && playerNation === mapOccupationNation;
}

function getConditionReason(condition, mapId, mapBuildingCounts, mapOccupationNation, playerNation) {
    if (!condition) return null;
    if (!checkMapIdCondition(condition, mapId)) return '建設可能な海域ではありません';
    if (!checkBuildingCountCondition(condition, mapBuildingCounts)) return '建設数条件を満たしていません';
    if (!checkOccupationCondition(condition, mapOccupationNation, playerNation)) return '占領条件を満たしていません';
    return null;
}

// APIルートを初期化
function initializeShopRoutes(app, deps) {
    const { promisifyPlayFab, PlayFabServer, firestore, admin, catalogCache, addEconomyItem, subtractEconomyItem, getCurrencyBalance, getNationTaxRateBps, applyTax, addNationTreasury, setMapOccupationNation, getMapOccupationNation, getVirtualCurrencyMap, getAllInventoryItems, getEntityKeyForPlayFabId, NATION_GROUP_BY_RACE } = deps;

    // ショップ状態取得
    function parseCatalogStat(itemData, keys) {
        for (const key of keys) {
            const raw = itemData?.[key];
            const value = Number.parseInt(raw, 10);
            if (Number.isFinite(value)) return value;
        }
        return 0;
    }

    function getCatalogPrimaryStat(itemData) {
        const category = itemData?.Category || null;
        if (category === 'Weapon') {
            return { label: '攻撃', value: parseCatalogStat(itemData, ['Attack', 'Atk', 'Power', 'attack', 'atk']) };
        }
        if (category === 'Offhand') {
            return { label: '術補', value: parseCatalogStat(itemData, ['MagicPower', 'Int', 'Intelligence']) };
        }
        if (category === 'Armor' || category === 'Shield') {
            return { label: '防御', value: parseCatalogStat(itemData, ['Defense', 'Def', 'defense', 'def']) };
        }
        return null;
    }

    function getPreferredEquipSlot(itemData) {
        const category = itemData?.Category || null;
        if (category === 'Weapon') return 'RightHand';
        if (category === 'Shield') return 'LeftHand';
        if (category === 'Offhand') return 'LeftHand';
        if (category === 'Armor') return 'Armor';
        return null;
    }

    function getActiveBuildingEntry(island) {
        const buildings = Array.isArray(island?.buildings) ? island.buildings : [];
        return buildings.find((entry) => entry && entry.status !== 'demolished') || null;
    }

    async function ensureShopInventorySeeded(ref, requestedBuildingId) {
        if (!requestedBuildingId || !SHOP_BUILDING_CATEGORIES[requestedBuildingId]) {
            return { seeded: false, island: null };
        }

        return firestore.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) throw new Error('IslandNotFound');

            const island = snap.data() || {};
            const activeBuilding = getActiveBuildingEntry(island);
            const activeBuildingId = String(activeBuilding?.buildingId || activeBuilding?.id || '').trim();
            if (!activeBuilding || activeBuildingId !== requestedBuildingId) {
                return { seeded: false, island };
            }
            if (String(activeBuilding?.status || '') !== 'completed') {
                return { seeded: false, island };
            }

            const existingInventory = Array.isArray(island.shopInventory) ? island.shopInventory : [];
            const alreadySeeded = existingInventory.length > 0
                || Number(island.shopSeedVersion || 0) > 0
                || Number(island.shopSeededAt || 0) > 0;
            if (alreadySeeded) {
                return { seeded: false, island };
            }

            const shopLevel = Math.max(1, Math.floor(Number(activeBuilding?.level) || 1));
            const seededInventory = pickRandomShopSeedInventory({
                buildingId: requestedBuildingId,
                shopLevel,
                catalogCache
            });
            if (!seededInventory.length) {
                return { seeded: false, island };
            }
            const seededAt = Date.now();
            tx.update(ref, {
                shopInventory: seededInventory,
                shopSeedVersion: 1,
                shopSeededAt: seededAt,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });

            return {
                seeded: true,
                island: {
                    ...island,
                    shopInventory: seededInventory,
                    shopSeedVersion: 1,
                    shopSeededAt: seededAt
                }
            };
        });
    }

    app.post('/api/get-shop-state', async (req, res) => {
        const { islandId, mapId } = req.body || {};
        if (!islandId) return res.status(400).json({ error: 'islandId is required' });
        try {
            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'IslandNotFound' });
            let island = snap.data() || {};
            let buildingId = getShopBuildingId(island);
            if (buildingId && SHOP_BUILDING_CATEGORIES[buildingId]) {
                const seeded = await ensureShopInventorySeeded(ref, buildingId);
                if (seeded?.island) {
                    island = seeded.island;
                    buildingId = getShopBuildingId(island);
                }
            }
            const activeBuilding = getActiveBuildingEntry(island);
            const shopLevel = Math.max(1, Math.floor(Number(activeBuilding?.level) || 1));
            const categories = SHOP_BUILDING_CATEGORIES[buildingId] || [];
            const pricing = getShopPricing(island);
            const inventory = Array.isArray(island.shopInventory) ? island.shopInventory : [];
            const items = sortShopInventoryEntries(inventory.map((entry) => {
                const itemId = entry.itemId;
                const count = Number(entry.count) || 0;
                const itemData = catalogCache[itemId] || {};
                const base = resolveBasePrice(itemData);
                const override = pricing.itemPrices?.[itemId] || {};
                const fixedBuy = Number.isFinite(Number(override.buyPrice)) ? Number(override.buyPrice) : null;
                const fixedSell = Number.isFinite(Number(override.sellPrice)) ? Number(override.sellPrice) : null;
                const primaryStat = getCatalogPrimaryStat(itemData);
                return {
                    itemId,
                    count,
                    name: itemData.DisplayName || itemId,
                    category: itemData.Category || null,
                    preferredEquipSlot: getPreferredEquipSlot(itemData),
                    primaryStatLabel: primaryStat?.label || null,
                    primaryStatValue: Number(primaryStat?.value || 0),
                    description: itemData.Description || '',
                    sellPrice: base.sellPrice,
                    buyPrice: base.buyPrice,
                    fixedBuyPrice: fixedBuy,
                    fixedSellPrice: fixedSell,
                    copyForbidden: isShopCopyForbiddenItem(itemData),
                    copyEligible: canShopCloneItem({ buildingId, shopLevel, itemData })
                };
            }), buildingId);
            res.json({
                islandId,
                ownerId: island.ownerId || null,
                buildingId,
                shopLevel,
                categories,
                pricing,
                inventory: items
            });
        } catch (error) {
            console.error('[GetShopState] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get shop state' });
        }
    });

    // ショップ価格設定
    app.post('/api/set-shop-pricing', async (req, res) => {
        const { playFabId, islandId, buyMultiplier, sellMultiplier, mapId } = req.body || {};
        if (!playFabId || !islandId) return res.status(400).json({ error: 'playFabId and islandId are required' });
        const buyValue = Number(buyMultiplier);
        const sellValue = Number(sellMultiplier);
        if (!Number.isFinite(buyValue) || !Number.isFinite(sellValue)) {
            return res.status(400).json({ error: 'Invalid pricing values' });
        }
        try {
            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'IslandNotFound' });
            const island = snap.data() || {};
            if (!island.ownerId || island.ownerId !== playFabId) {
                return res.status(403).json({ error: 'NotOwner' });
            }
            await ref.update({
                shopPricing: {
                    buyMultiplier: buyValue,
                    sellMultiplier: sellValue,
                    updatedAt: Date.now(),
                    ownerId: playFabId
                }
            });
            res.json({ success: true });
        } catch (error) {
            console.error('[SetShopPricing] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to set shop pricing' });
        }
    });

    // アイテム個別価格設定
    app.post('/api/set-shop-item-price', async (req, res) => {
        const { playFabId, islandId, itemId, buyPrice, sellPrice, mapId } = req.body || {};
        if (!playFabId || !islandId || !itemId) {
            return res.status(400).json({ error: 'Missing parameters' });
        }
        const buyValue = Number(buyPrice);
        const sellValue = Number(sellPrice);
        if (!Number.isFinite(buyValue) || !Number.isFinite(sellValue)) {
            return res.status(400).json({ error: 'Invalid price values' });
        }
        try {
            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'IslandNotFound' });
            const island = snap.data() || {};
            if (island.ownerId !== playFabId) return res.status(403).json({ error: 'NotOwner' });
            const pricing = island.shopPricing && typeof island.shopPricing === 'object' ? island.shopPricing : {};
            const itemPrices = pricing.itemPrices && typeof pricing.itemPrices === 'object' ? { ...pricing.itemPrices } : {};
            itemPrices[itemId] = { buyPrice: buyValue, sellPrice: sellValue };
            await ref.update({
                shopPricing: {
                    ...pricing,
                    itemPrices,
                    updatedAt: Date.now(),
                    ownerId: playFabId
                }
            });
            res.json({ success: true });
        } catch (error) {
            console.error('[SetShopItemPrice] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to set item price' });
        }
    });

    // ショップへ売却
    app.post('/api/sell-to-shop', async (req, res) => {
        const { playFabId, islandId, itemInstanceId, itemId, mapId } = req.body || {};
        if (!playFabId || !islandId || !itemInstanceId || !itemId) {
            return res.status(400).json({ error: 'Missing parameters' });
        }
        try {
            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'IslandNotFound' });
            const island = snap.data() || {};
            const buildingId = getShopBuildingId(island);
            const categories = SHOP_BUILDING_CATEGORIES[buildingId] || [];
            if (!categories.length) return res.status(400).json({ error: 'ShopNotAvailable' });
            const itemData = catalogCache[itemId] || {};
            if (categories.length && itemData.Category && !categories.includes(itemData.Category)) {
                return res.status(400).json({ error: 'InvalidItemCategory' });
            }
            const base = resolveBasePrice(itemData);
            const pricing = getShopPricing(island);
            const override = pricing.itemPrices?.[itemId] || {};
            const fixedBuy = Number.isFinite(Number(override.buyPrice)) ? Number(override.buyPrice) : null;
            const price = fixedBuy != null ? fixedBuy : Math.floor(base.sellPrice * pricing.buyMultiplier);
            if (!price || price <= 0) return res.status(400).json({ error: 'ItemNotPurchasable' });

            await subtractEconomyItem(playFabId, itemId, 1);

            await addEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, price);
            const newBalance = await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE);
            const shopInventory = Array.isArray(island.shopInventory) ? island.shopInventory.slice() : [];
            const idx = shopInventory.findIndex(i => i && i.itemId === itemId);
            if (idx >= 0) {
                shopInventory[idx] = { ...shopInventory[idx], count: Number(shopInventory[idx].count || 0) + 1 };
            } else {
                shopInventory.push({ itemId, count: 1 });
            }
            await ref.update({ shopInventory });
            res.json({ success: true, price, newBalance: newBalance });
        } catch (error) {
            console.error('[SellToShop] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to sell item to shop' });
        }
    });

    // ショップから購入
    app.post('/api/buy-from-shop', async (req, res) => {
        const { playFabId, islandId, itemId, mapId } = req.body || {};
        if (!playFabId || !islandId || !itemId) {
            return res.status(400).json({ error: 'Missing parameters' });
        }
        try {
            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'IslandNotFound' });
            const island = snap.data() || {};
            const buildingId = getShopBuildingId(island);
            const categories = SHOP_BUILDING_CATEGORIES[buildingId] || [];
            if (!categories.length) return res.status(400).json({ error: 'ShopNotAvailable' });
            const itemData = catalogCache[itemId] || {};
            if (categories.length && itemData.Category && !categories.includes(itemData.Category)) {
                return res.status(400).json({ error: 'InvalidItemCategory' });
            }
            const base = resolveBasePrice(itemData);
            const pricing = getShopPricing(island);
            const override = pricing.itemPrices?.[itemId] || {};
            const fixedSell = Number.isFinite(Number(override.sellPrice)) ? Number(override.sellPrice) : null;
            const baseSell = base.buyPrice || base.sellPrice;
            const price = fixedSell != null ? fixedSell : Math.floor(baseSell * pricing.sellMultiplier);
            if (!price || price <= 0) return res.status(400).json({ error: 'ItemNotForSale' });

            const shopInventory = Array.isArray(island.shopInventory) ? island.shopInventory.slice() : [];
            const idx = shopInventory.findIndex(i => i && i.itemId === itemId);
            if (idx === -1 || Number(shopInventory[idx].count || 0) <= 0) {
                return res.status(400).json({ error: 'OutOfStock' });
            }

            await subtractEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, price);
            await addEconomyItem(playFabId, itemId, 1);

            const nextCount = Number(shopInventory[idx].count || 0) - 1;
            if (nextCount <= 0) {
                shopInventory.splice(idx, 1);
            } else {
                shopInventory[idx] = { ...shopInventory[idx], count: nextCount };
            }
            await ref.update({ shopInventory });

            const ownerId = island.ownerId || null;
            if (ownerId && price > 0) {
                const nationValue = String(island.nation || '').toLowerCase();
                const taxRateBps = await getNationTaxRateBps(nationValue, firestore, deps);
                const { tax, net } = applyTax(price, taxRateBps);
                if (net > 0) {
                    await addEconomyItem(ownerId, VIRTUAL_CURRENCY_CODE, net);
                }
                if (tax > 0) {
                    await addNationTreasury(nationValue, tax, firestore, deps, {
                        contributorPlayFabId: playFabId
                    });
                }
            }

            res.json({ success: true, price });
        } catch (error) {
            console.error('[BuyFromShop] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to buy item from shop' });
        }
    });

    // 建設開始
    app.post('/api/start-building-construction', async (req, res) => {
        const { playFabId, islandId, buildingId, mapId } = req.body || {};
        const requestEntity = normalizeEntityKey(req.body?.entityKey);
        if (!playFabId || !islandId || !buildingId) {
            return res.status(400).json({ error: 'playFabId, islandId, buildingId are required' });
        }

        try {
            const spec = getBuildingSpec(buildingId);
            if (!spec) {
                return res.status(400).json({ error: '建物定義が見つかりません。' });
            }

            const baseDef = buildingDefs?.getBuildingById ? buildingDefs.getBuildingById(buildingId) : null;
            const condition = baseDef?.buildCondition || null;
            let mapOccupationNation = null;
            let playerNation = null;
            if (condition) {
                const mapBuildingCounts = await getMapBuildingCounts(mapId, firestore);
                mapOccupationNation = mapId && typeof getMapOccupationNation === 'function'
                    ? await getMapOccupationNation(mapId)
                    : null;
                playerNation = await getPlayerNation(playFabId, { promisifyPlayFab, PlayFabServer });
                const meets = checkMapIdCondition(condition, mapId)
                    && checkBuildingCountCondition(condition, mapBuildingCounts)
                    && checkOccupationCondition(condition, mapOccupationNation, playerNation);
                if (!meets) {
                    return res.status(403).json({ error: 'BuildConditionNotMet' });
                }
            }

            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const preSnap = await ref.get();
            if (!preSnap.exists) {
                return res.status(404).json({ error: 'IslandNotFound' });
            }
            const preIsland = preSnap.data() || {};
            const currentOwner = preIsland.ownerId || null;
            if (currentOwner && currentOwner !== playFabId) {
                return res.status(403).json({ error: 'NotOwner' });
            }

            const isMyHouseBuild = buildingId === 'my_house';
            const isTutorialBuild = Boolean(req?.body?.tutorial) && isMyHouseBuild;
            const sizeKey = String(preIsland.size || '').toLowerCase();
            const isSmallIsland = sizeKey === 'small' || sizeKey === 's';
            let allowMyHouseRebuild = false;
            if (isMyHouseBuild) {
                const hasMyHouse = await hasMyHouseOwned(firestore, playFabId, { promisifyPlayFab, PlayFabServer }, mapId);
                allowMyHouseRebuild = !hasMyHouse && isSmallIsland;
                if (!isSmallIsland) {
                    return res.status(400).json({ error: 'MyHouseSmallOnly' });
                }
            }
            if (isTutorialBuild && !allowMyHouseRebuild) {
                try {
                    const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                        PlayFabId: playFabId,
                        Keys: ['TutorialMyHouseBuilt']
                    });
                    const done = String(ro?.Data?.TutorialMyHouseBuilt?.Value || '').toLowerCase();
                    if (done === 'true') {
                        return res.status(400).json({ error: 'TutorialAlreadyCompleted' });
                    }
                } catch (e) {
                    console.warn('[StartBuildingConstruction] Tutorial flag check failed:', e?.errorMessage || e?.message || e);
                }
            }

            if (!playerNation) {
                playerNation = await getPlayerNation(playFabId, { promisifyPlayFab, PlayFabServer });
            }
            if (!mapOccupationNation && mapId && typeof getMapOccupationNation === 'function') {
                mapOccupationNation = await getMapOccupationNation(mapId);
            }

            if (!currentOwner && !canBuildToOccupy({ island: preIsland, playerNation, mapOccupationNation })) {
                return res.status(403).json({ error: 'BuildToOccupyNotAllowed' });
            }

            let costEntries = [];
            if (Array.isArray(spec.PriceAmounts)) {
                costEntries = spec.PriceAmounts.map((entry) => {
                    const code = entry?.ItemId || entry?.itemId;
                    const amount = Number(entry?.Amount ?? entry?.amount ?? 0);
                    return [code, amount];
                });
            } else if (spec.Cost && typeof spec.Cost === 'object') {
                costEntries = Object.entries(spec.Cost);
            }
            costEntries = costEntries.filter(([, amount]) => Number(amount) > 0);
            const fixedResourceCosts = getFixedBuildingResourceCostEntries(buildingId, 1);
            if (fixedResourceCosts.length > 0) {
                costEntries = fixedResourceCosts;
            } else {
                const paymentMethod = String(req?.body?.paymentMethod || '').trim().toLowerCase();
                const resourceCosts = applyNationResourceCosts(costEntries, playerNation, { useSacred: false, onlyResource: true });
                const costEntriesWithResource = resourceCosts.length > 0 ? resourceCosts : costEntries;
                const useResourcePayment = paymentMethod === 'resource';
                costEntries = useResourcePayment ? costEntriesWithResource : costEntries;
            }

            if (costEntries.length > 0) {
                const entityKey = requestEntity || await getEntityKeyForPlayFabId(playFabId);
                const items = await getAllInventoryItems(entityKey);
                const balances = getVirtualCurrencyMap(items);

                for (const [currency, amount] of costEntries) {
                    const balance = balances[currency] || 0;
                    if (balance < Number(amount)) {
                        return res.status(400).json({
                            error: `${currency} が不足しています。必要: ${amount}, 所持: ${balance}`
                        });
                    }
                }

                for (const [currency, amount] of costEntries) {
                    await subtractEconomyItem(playFabId, currency, Number(amount), requestEntity);
                }
            }

            let displayName = null;
            try {
                const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                    PlayFabId: playFabId,
                    ProfileConstraints: { ShowDisplayName: true }
                });
                displayName = profile?.PlayerProfile?.DisplayName || null;
            } catch (e) {
                console.warn('[StartBuildingConstruction] GetPlayerProfile failed:', e?.errorMessage || e?.message || e);
            }
            if (!playerNation) {
                try {
                    const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                        PlayFabId: playFabId,
                        Keys: ['Nation', 'Race']
                    });
                    const nationValue = ro?.Data?.Nation?.Value || null;
                    const raceValue = ro?.Data?.Race?.Value || null;
                    if (nationValue) {
                        playerNation = String(nationValue).toLowerCase();
                    } else if (raceValue && NATION_GROUP_BY_RACE[raceValue]) {
                        playerNation = NATION_GROUP_BY_RACE[raceValue].island;
                    }
                } catch (e) {
                    console.warn('[StartBuildingConstruction] GetUserReadOnlyData failed:', e?.errorMessage || e?.message || e);
                }
            }
            const islandName = `${displayName || 'Player'}の${spec.DisplayName || buildingId}`;

            const now = Date.now();

            let building = null;
            try {
                building = await firestore.runTransaction(async (tx) => {
                    const snap = await tx.get(ref);
                    if (!snap.exists) throw new Error('IslandNotFound');

                    const island = snap.data() || {};
                    if (island.ownerId && island.ownerId !== playFabId) throw new Error('NotOwner');
                    if (!island.ownerId && !canBuildToOccupy({ island, playerNation, mapOccupationNation })) {
                        throw new Error('BuildToOccupyNotAllowed');
                    }

                    const buildings = Array.isArray(island.buildings) ? island.buildings.slice() : [];
                    const existing = buildings.find(b => b && b.status !== 'demolished');
                    if (existing) throw new Error('AlreadyBuilt');

                    let sizeTag = getSizeTag(spec.Tags);
                    if (!sizeTag && typeof spec.Size === 'string' && spec.Size) {
                        sizeTag = `size_${spec.Size.toLowerCase()}`;
                    }
                    if (buildingId === 'my_house') {
                        const sizeKey = String(island.size || '').toLowerCase();
                        const isSmallIsland = sizeKey === 'small' || sizeKey === 's';
                        if (!isSmallIsland) {
                            throw new Error('MyHouseSmallOnly');
                        }
                    }
                    if (!sizeTag || !sizeTagMatchesIsland(sizeTag, island.size)) {
                        throw new Error('InvalidBuildingSize');
                    }

                    const sizeLogic = normalizeSize(spec.SizeLogic, inferLogicSizeFromSlotsRequired(spec.SlotsRequired));
                    const sizeVisual = normalizeSize(spec.SizeVisual, sizeLogic);

                    const logicW = Math.max(1, Math.trunc(sizeLogic.x));
                    const logicH = Math.max(1, Math.trunc(sizeLogic.y));
                    const visualW = Math.max(1, Math.trunc(sizeVisual.x));
                    const visualH = Math.max(1, Math.trunc(sizeVisual.y));

                    const buildTimeSeconds = isTutorialBuild ? 0 : Math.max(1, Math.trunc(Number(spec.BuildTime) || 60));
                    const durationMs = buildTimeSeconds * 1000;
                    const status = isTutorialBuild ? 'completed' : 'constructing';

                    const tileIndexRaw = spec.TileIndex;
                    const tileIndexValue = Number.isFinite(Number(tileIndexRaw)) ? Number(tileIndexRaw) : 17;
                    const maxHp = computeMaxHp(logicW, logicH, Number(spec.Level) || 1);
                    const entry = {
                        buildingId,
                        status: status,
                        level: Number.isFinite(Number(spec.Level)) ? Number(spec.Level) : 1,
                        startTime: now,
                        completionTime: now + durationMs,
                        durationMs,
                        buildTimeSeconds,
                        helpers: [],
                        width: logicW,
                        height: logicH,
                        visualWidth: visualW,
                        visualHeight: visualH,
                        tileIndex: tileIndexValue,
                        maxHp,
                        currentHp: maxHp
                    };

                    buildings.push(entry);

                    const isImmediateOccupation = !island.ownerId;
                    const patch = {
                        buildings,
                        name: islandName,
                        ownerId: island.ownerId || playFabId,
                        ownerNation: island.ownerNation || playerNation,
                        nation: island.nation || playerNation,
                        occupationStatus: island.occupationStatus || 'occupied',
                        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                    };
                    if (status === 'constructing') {
                        patch.constructionStatus = 'constructing';
                    } else {
                        patch.constructionStatus = admin.firestore.FieldValue.delete();
                    }
                    if (isImmediateOccupation) {
                        patch.captureState = admin.firestore.FieldValue.delete();
                    }
                    tx.update(ref, patch);

                    return entry;
                });
            } catch (error) {
                if (costEntries.length > 0) {
                    for (const [currency, amount] of costEntries) {
                        try {
                            await addEconomyItem(playFabId, currency, Number(amount), requestEntity);
                        } catch (refundError) {
                            console.warn('[StartBuildingConstruction] Refund failed:', refundError?.errorMessage || refundError?.message || refundError);
                        }
                    }
                }
                throw error;
            }

            if (isTutorialBuild) {
                try {
                    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                        PlayFabId: playFabId,
                        Data: { TutorialMyHouseBuilt: 'true' }
                    });
                } catch (e) {
                    console.warn('[StartBuildingConstruction] Failed to mark tutorial build:', e?.errorMessage || e?.message || e);
                }
            }

            try {
                await addOwnedMapId(playFabId, mapId, { promisifyPlayFab, PlayFabServer });
            } catch (e) {
                console.warn('[StartBuildingConstruction] Failed to update OwnedMapIds:', e?.errorMessage || e?.message || e);
            }

            try {
                const centralId = getCentralIslandIdForMap(mapId);
                if (centralId && centralId === islandId && typeof setMapOccupationNation === 'function') {
                    await setMapOccupationNation(mapId, playerNation || null);
                }
            } catch (e) {
                console.warn('[StartBuildingConstruction] Failed to update map occupation:', e?.errorMessage || e?.message || e);
            }

            invalidateMapCache(mapId);

            res.json({
                success: true,
                building,
                cost: costEntries,
                occupiedByBuild: !currentOwner,
                message: `${spec.DisplayName || buildingId} の建設を開始しました。`
            });
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'NotOwner') return res.status(403).json({ error: 'この島の所有者ではありません。' });
            if (msg === 'IslandNotFound') return res.status(404).json({ error: '島が見つかりません。' });
            if (msg === 'AlreadyBuilt') return res.status(400).json({ error: 'この島には既に建物があります。' });
            if (msg === 'InvalidBuildingSize') return res.status(400).json({ error: 'この島のサイズに合っていません。' });
            if (msg === 'BuildToOccupyNotAllowed') return res.status(403).json({ error: 'この島は建築して占領できません。' });
            if (msg === 'MyHouseSmallOnly') return res.status(400).json({ error: 'マイハウスはスモール島専用です。' });
            if (msg === 'TutorialAlreadyCompleted') return res.status(400).json({ error: 'マイハウスは既に建築済みです。' });
            console.error('[StartBuildingConstruction] Error:', error);
            res.status(500).json({ error: 'Failed to start building construction', details: msg });
        }
    });

    // 建設完了確認
    app.post('/api/check-building-completion', async (req, res) => {
        const { islandId, mapId } = req.body || {};
        if (!islandId) {
            return res.status(400).json({ error: 'islandId is required' });
        }

        try {
            let ref = null;
            let resolvedMapId = mapId || null;
            if (mapId) {
                ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            } else {
                const found = await findIslandDocAcrossMaps(firestore, islandId);
                if (!found.snap) throw new Error('IslandNotFound');
                ref = found.collection.doc(islandId);
                resolvedMapId = found.mapId;
            }
            const now = Date.now();

            const result = await firestore.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('IslandNotFound');
                const island = snap.data() || {};
                const buildings = Array.isArray(island.buildings) ? island.buildings.slice() : [];
                const idx = buildings.findIndex(b => b && b.status === 'constructing');

                if (idx === -1) {
                    const existing = buildings.find(b => b && b.status === 'completed');
                    if (existing && existing.status === 'completed') {
                        return { completed: true, building: existing };
                    }
                    return { completed: false, remainingTime: 0 };
                }

                const b = buildings[idx];
                const completionTime = Number(b.completionTime) || 0;
                if (now < completionTime) {
                    const remainingTime = Math.max(0, Math.ceil((completionTime - now) / 1000));
                    return { completed: false, remainingTime, building: b };
                }

                buildings[idx] = { ...b, status: 'completed' };
                const status = computeConstructionStatus(buildings);
                const patch = {
                    buildings,
                    constructionStatus: status,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                };
                if (!status) patch.constructionStatus = admin.firestore.FieldValue.delete();

                tx.update(ref, patch);
                return { completed: true, building: buildings[idx] };
            });

            if (result.completed) {
                const completedBuildingId = String(result?.building?.buildingId || result?.building?.id || '').trim();
                if (completedBuildingId && SHOP_BUILDING_CATEGORIES[completedBuildingId]) {
                    try {
                        await ensureShopInventorySeeded(ref, completedBuildingId);
                    } catch (seedError) {
                        console.warn('[CheckBuildingCompletion] shop seed failed:', seedError?.message || seedError);
                    }
                }
                invalidateMapCache(resolvedMapId);
            }

            res.json({ success: true, ...result, message: result.completed ? '建設が完了しました。' : 'まだ建設中です。' });
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'IslandNotFound') return res.status(404).json({ error: '島が見つかりません。' });
            console.error('[CheckBuildingCompletion] Error:', error);
            res.status(500).json({ error: 'Failed to check building completion', details: msg });
        }
    });

    // 建設支援
    app.post('/api/help-construction', async (req, res) => {
        const { islandId, helperPlayFabId, mapId, playFabId } = req.body || {};
        if (!islandId || !playFabId) {
            return res.status(400).json({ error: 'islandId and playFabId are required' });
        }
        if (helperPlayFabId && helperPlayFabId !== playFabId) {
            return res.status(403).json({ error: 'InvalidHelper' });
        }
        const resolvedHelperId = playFabId;

        try {
            let ref = null;
            if (mapId) {
                ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            } else {
                const found = await findIslandDocAcrossMaps(firestore, islandId);
                if (!found.snap) throw new Error('IslandNotFound');
                ref = found.collection.doc(islandId);
            }
            const now = Date.now();
            const reductionPerHelper = 0.1;
            const maxReduction = 0.5;

            const result = await firestore.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('IslandNotFound');
                const island = snap.data() || {};
                const buildings = Array.isArray(island.buildings) ? island.buildings.slice() : [];
                const idx = buildings.findIndex(b => b && b.status === 'constructing');
                if (idx === -1) throw new Error('NotConstructing');

                const b = buildings[idx];
                const helpers = Array.isArray(b.helpers) ? b.helpers.slice() : [];
                if (!helpers.includes(resolvedHelperId)) {
                    helpers.push(resolvedHelperId);
                }

                const durationMs = Number(b.durationMs) || Math.max(0, (Number(b.completionTime) || now) - (Number(b.startTime) || now));
                const reduction = Math.min(maxReduction, helpers.length * reductionPerHelper);
                const newCompletion = (Number(b.startTime) || now) + Math.floor(durationMs * (1 - reduction));

                buildings[idx] = { ...b, helpers, completionTime: Math.max(now, newCompletion), durationMs };
                tx.update(ref, {
                    buildings,
                    constructionStatus: 'constructing',
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });

                return { building: buildings[idx], reduction };
            });

            res.json({ success: true, ...result, message: '建設時間を短縮しました。' });
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'IslandNotFound') return res.status(404).json({ error: '島が見つかりません。' });
            if (msg === 'NotConstructing') return res.status(400).json({ error: 'そのスロットは建設中ではありません。' });
            console.error('[HelpConstruction] Error:', error);
            res.status(500).json({ error: 'Failed to help construction', details: msg });
        }
    });

    // 建物メタ情報
    app.get('/api/get-building-meta', async (_req, res) => {
        try {
            const meta = buildingDefs.getBuildingMetaMap();
            res.json(meta);
        } catch (error) {
            const msg = error?.message || String(error);
            console.error('[GetBuildingMeta] Error:', msg);
            res.status(500).json({ error: 'Failed to get building meta', details: msg });
        }
    });

    // カテゴリ別建物取得
    app.post('/api/get-buildings-by-category', async (req, res) => {
        try {
            const category = String(req?.body?.category || '');
            const islandSize = String(req?.body?.islandSize || '').toLowerCase();
            const mapId = String(req?.body?.mapId || '').trim();
            const playFabId = String(req?.body?.playFabId || '').trim();
            const entries = Object.entries(buildingDefs?.buildings || {}).filter(([, building]) => {
                if (!building) return false;
                if (building.buildable === false) return false;
                if (!category) return true;
                return building.category === category;
            });

            const mapBuildingCounts = await getMapBuildingCounts(mapId, firestore);
            const needsOccupationCheck = entries.some(([, building]) => building?.buildCondition?.requiresOccupation === true);
            const mapOccupationNation = (mapId && needsOccupationCheck && typeof getMapOccupationNation === 'function')
                ? await getMapOccupationNation(mapId)
                : null;
            const playerNation = (playFabId && needsOccupationCheck)
                ? await getPlayerNation(playFabId, { promisifyPlayFab, PlayFabServer })
                : null;

            const buildings = entries.map(([key, building]) => {
                const resolved = buildingDefs.getBuildingById
                    ? buildingDefs.getBuildingById(building.id || key)
                    : building;
                const slotsRequired = Number(building.slotsRequired || 1);
                const sizeTag = `size_${slotsRequired === 1 ? 'small' : slotsRequired === 2 ? 'medium' : slotsRequired === 9 ? 'giant' : 'large'}`;
                const condition = resolved?.buildCondition || building?.buildCondition || null;
                let meetsCondition = true;
                let conditionReason = null;
                if (condition) {
                    meetsCondition = checkMapIdCondition(condition, mapId)
                        && checkBuildingCountCondition(condition, mapBuildingCounts)
                        && checkOccupationCondition(condition, mapOccupationNation, playerNation);
                    conditionReason = meetsCondition ? null : getConditionReason(condition, mapId, mapBuildingCounts, mapOccupationNation, playerNation);
                }
                return {
                    id: building.id || key,
                    name: resolved?.name || building.name || building.id || key,
                    description: resolved?.description || building.description || '',
                    buildTime: Number(resolved?.buildTime || building.buildTime || 0),
                    cost: resolved?.cost || building.cost || {},
                    tags: [sizeTag],
                    slotsRequired,
                    category: building.category || null,
                    buildCondition: condition || null,
                    meetsCondition,
                    conditionReason
                };
            });

            let filtered = buildings;
            if (islandSize) {
                const tag = `size_${islandSize}`;
                filtered = filtered.filter(item => !Array.isArray(item.tags) || item.tags.includes(tag));
            }

            res.json({ success: true, buildings: filtered });
        } catch (error) {
            const msg = error?.message || String(error);
            console.error('[GetBuildingsByCategory] Error:', msg);
            res.status(500).json({ error: 'Failed to get buildings', details: msg });
        }
    });
}

module.exports = {
    initializeShopRoutes
};
