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
const { getWorldMapCollection, findIslandDocAcrossMaps, addOwnedMapId } = require('./island');
const { VIRTUAL_CURRENCY_CODE } = require('./economy');

function normalizeEntityKey(input) {
    const id = input?.Id || input?.id || null;
    const type = input?.Type || input?.type || null;
    if (!id || !type) return null;
    return { Id: String(id), Type: String(type) };
}

// APIルートを初期化
function initializeShopRoutes(app, deps) {
    const { promisifyPlayFab, PlayFabServer, firestore, admin, catalogCache, addEconomyItem, subtractEconomyItem, getCurrencyBalance, getNationTaxRateBps, applyTax, addNationTreasury, getVirtualCurrencyMap, getAllInventoryItems, getEntityKeyForPlayFabId, NATION_GROUP_BY_RACE } = deps;

    // ショップ状態取得
    app.post('/api/get-shop-state', async (req, res) => {
        const { islandId, mapId } = req.body || {};
        if (!islandId) return res.status(400).json({ error: 'islandId is required' });
        try {
            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'IslandNotFound' });
            const island = snap.data() || {};
            const buildingId = getShopBuildingId(island);
            const categories = SHOP_BUILDING_CATEGORIES[buildingId] || [];
            const pricing = getShopPricing(island);
            const inventory = Array.isArray(island.shopInventory) ? island.shopInventory : [];
            const items = inventory.map((entry) => {
                const itemId = entry.itemId;
                const count = Number(entry.count) || 0;
                const itemData = catalogCache[itemId] || {};
                const base = resolveBasePrice(itemData);
                const override = pricing.itemPrices?.[itemId] || {};
                const fixedBuy = Number.isFinite(Number(override.buyPrice)) ? Number(override.buyPrice) : null;
                const fixedSell = Number.isFinite(Number(override.sellPrice)) ? Number(override.sellPrice) : null;
                return {
                    itemId,
                    count,
                    name: itemData.DisplayName || itemId,
                    category: itemData.Category || null,
                    sellPrice: base.sellPrice,
                    buyPrice: base.buyPrice,
                    fixedBuyPrice: fixedBuy,
                    fixedSellPrice: fixedSell
                };
            });
            res.json({
                islandId,
                ownerId: island.ownerId || null,
                buildingId,
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
                    await addNationTreasury(nationValue, tax, firestore, deps);
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

            const isTutorialBuild = Boolean(req?.body?.tutorial) && buildingId === 'my_house';
            if (isTutorialBuild) {
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
            let playerNation = null;
            try {
                const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                    PlayFabId: playFabId,
                    ProfileConstraints: { ShowDisplayName: true }
                });
                displayName = profile?.PlayerProfile?.DisplayName || null;
            } catch (e) {
                console.warn('[StartBuildingConstruction] GetPlayerProfile failed:', e?.errorMessage || e?.message || e);
            }
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
            const islandName = `${displayName || 'Player'}の${spec.DisplayName || buildingId}`;

            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const now = Date.now();

            const building = await firestore.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('IslandNotFound');

                const island = snap.data() || {};
                if (island.ownerId && island.ownerId !== playFabId) throw new Error('NotOwner');

                const buildings = Array.isArray(island.buildings) ? island.buildings.slice() : [];
                const existing = buildings.find(b => b && b.status !== 'demolished');
                if (existing) throw new Error('AlreadyBuilt');

                let sizeTag = getSizeTag(spec.Tags);
                if (!sizeTag && typeof spec.Size === 'string' && spec.Size) {
                    sizeTag = `size_${spec.Size.toLowerCase()}`;
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
                tx.update(ref, patch);

                return entry;
            });

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

            res.json({
                success: true,
                building,
                cost: costEntries,
                message: `${spec.DisplayName || buildingId} の建設を開始しました。`
            });
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'NotOwner') return res.status(403).json({ error: 'この島の所有者ではありません。' });
            if (msg === 'IslandNotFound') return res.status(404).json({ error: '島が見つかりません。' });
            if (msg === 'AlreadyBuilt') return res.status(400).json({ error: 'この島には既に建物があります。' });
            if (msg === 'InvalidBuildingSize') return res.status(400).json({ error: 'この島のサイズに合っていません。' });
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
            if (mapId) {
                ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            } else {
                const found = await findIslandDocAcrossMaps(firestore, islandId);
                if (!found.snap) throw new Error('IslandNotFound');
                ref = found.collection.doc(islandId);
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
        const { islandId, helperPlayFabId, mapId } = req.body || {};
        if (!islandId || !helperPlayFabId) {
            return res.status(400).json({ error: 'islandId and helperPlayFabId are required' });
        }

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
                if (!helpers.includes(helperPlayFabId)) {
                    helpers.push(helperPlayFabId);
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
            const entries = Object.entries(buildingDefs?.buildings || {}).filter(([, building]) => {
                if (!building) return false;
                if (building.buildable === false) return false;
                if (!category) return true;
                return building.category === category;
            });

            let mapBuildingCounts = null;
            if (mapId) {
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
                mapBuildingCounts = counts;
            }

            const buildings = entries.map(([key, building]) => {
                const resolved = buildingDefs.getBuildingById
                    ? buildingDefs.getBuildingById(building.id || key)
                    : building;
                const slotsRequired = Number(building.slotsRequired || 1);
                const sizeTag = `size_${slotsRequired === 1 ? 'small' : slotsRequired === 2 ? 'medium' : 'large'}`;
                const condition = resolved?.buildCondition || building?.buildCondition || null;
                let meetsCondition = true;
                if (condition && mapBuildingCounts) {
                    const requiredId = String(condition.buildingId || '').trim();
                    const minCount = Number(condition.minCount || 0);
                    if (requiredId && minCount > 0) {
                        const current = Number(mapBuildingCounts[requiredId] || 0);
                        meetsCondition = current >= minCount;
                    }
                }
                return {
                    id: building.id || key,
                    name: resolved?.name || building.name || building.id || key,
                    description: resolved?.description || building.description || '',
                    buildTime: Number(resolved?.buildTime || building.buildTime || 0),
                    tags: [sizeTag],
                    slotsRequired,
                    category: building.category || null,
                    buildCondition: condition || null,
                    meetsCondition
                };
            });

            let filtered = buildings.filter((item) => item.meetsCondition !== false);
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
