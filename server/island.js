// server/island.js
// 島関連のAPI

const { geohashForLocation } = require('geofire-common');
const {
    getSizeTag,
    sizeTagMatchesIsland,
    normalizeSize,
    inferLogicSizeFromSlotsRequired,
    computeMaxHp,
    getBuildingSpec,
    computeConstructionStatus,
    buildingDefs
} = require('./building');

const RESOURCE_INTERVAL_MS = 10 * 60 * 1000;
const RESOURCE_BIOME_CURRENCY = {
    volcanic: 'RR',
    rocky: 'RG',
    mushroom: 'RY',
    lake: 'RB',
    forest: 'RT',
    sacred: 'RS'
};
const OWNED_MAP_IDS_KEY = 'OwnedMapIds';

function normalizeEntityKey(input) {
    const id = input?.Id || input?.id || null;
    const type = input?.Type || input?.type || null;
    if (!id || !type) return null;
    return { Id: String(id), Type: String(type) };
}

function normalizePriceAmounts(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
        return Object.entries(value).map(([code, amount]) => ({
            ItemId: code,
            Amount: Number(amount)
        }));
    }
    return [];
}

function normalizeMapId(mapId) {
    const raw = String(mapId || '').trim();
    return raw ? raw : null;
}

function parseOwnedMapIds(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.map(normalizeMapId).filter(Boolean);
    }
    if (typeof raw !== 'string') return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.map(normalizeMapId).filter(Boolean);
        }
    } catch {}
    return raw.split(',').map(normalizeMapId).filter(Boolean);
}

function uniqueMapIds(list) {
    const seen = new Set();
    const output = [];
    (list || []).forEach((entry) => {
        const value = normalizeMapId(entry);
        if (!value || seen.has(value)) return;
        seen.add(value);
        output.push(value);
    });
    return output;
}

async function getOwnedMapIds(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [OWNED_MAP_IDS_KEY]
    });
    const raw = ro?.Data?.[OWNED_MAP_IDS_KEY]?.Value;
    return parseOwnedMapIds(raw);
}

async function setOwnedMapIds(playFabId, mapIds, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const normalized = uniqueMapIds(mapIds);
    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: {
            [OWNED_MAP_IDS_KEY]: JSON.stringify(normalized)
        }
    });
    return normalized;
}

async function addOwnedMapId(playFabId, mapId, deps) {
    const normalized = normalizeMapId(mapId);
    if (!normalized) return [];
    const current = await getOwnedMapIds(playFabId, deps);
    if (current.includes(normalized)) return current;
    current.push(normalized);
    return setOwnedMapIds(playFabId, current, deps);
}

async function removeOwnedMapId(playFabId, mapId, deps) {
    const normalized = normalizeMapId(mapId);
    if (!normalized) return [];
    const current = await getOwnedMapIds(playFabId, deps);
    const next = current.filter((entry) => entry !== normalized);
    if (next.length === current.length) return current;
    return setOwnedMapIds(playFabId, next, deps);
}

function getWorldMapCollection(firestore, mapId) {
    const raw = String(mapId || '').trim();
    if (!raw) return firestore.collection('world_map');
    return firestore.collection(`world_map_${raw}`);
}

async function findIslandDocAcrossMaps(firestore, islandId, mapIds = null) {
    let mapCollections = [];
    if (Array.isArray(mapIds) && mapIds.length > 0) {
        mapCollections = mapIds.map((mapId) => getWorldMapCollection(firestore, mapId));
    } else {
        const collections = await firestore.listCollections();
        mapCollections = collections.filter((col) => {
            const id = String(col.id || '');
            return id === 'world_map' || id.startsWith('world_map_');
        });
    }

    for (const col of mapCollections) {
        const snap = await col.doc(islandId).get();
        if (snap.exists) {
            const mapId = col.id === 'world_map' ? null : col.id.slice('world_map_'.length);
            return { snap, mapId, collection: col };
        }
    }

    return { snap: null, mapId: null, collection: null };
}

async function resolveOwnedMapIds(firestore, playFabId, deps) {
    if (deps?.promisifyPlayFab && deps?.PlayFabServer) {
        const owned = await getOwnedMapIds(playFabId, deps);
        if (owned.length > 0) return owned;
    }
    const collections = await firestore.listCollections();
    const mapCollections = collections.filter((col) => String(col.id || '').startsWith('world_map'));
    return mapCollections
        .map((col) => col.id === 'world_map' ? null : col.id.slice('world_map_'.length))
        .filter(Boolean);
}

function worldToLatLng(point) {
    const gridSize = 32;
    const mapTileSize = 500;
    const metersPerTile = 100;
    const mapPixelSize = mapTileSize * gridSize;
    const metersPerPixel = metersPerTile / gridSize;
    const dxMeters = (point.x - mapPixelSize / 2) * metersPerPixel;
    const dyMeters = (mapPixelSize / 2 - point.y) * metersPerPixel;

    const lat = dyMeters / 110574;
    const lng = dxMeters / 111320;
    return { lat, lng };
}

async function deleteOwnedIslands(firestore, playFabId, deps = null) {
    const mapIds = await resolveOwnedMapIds(firestore, playFabId, deps);
    const mapCollections = mapIds.map((mapId) => getWorldMapCollection(firestore, mapId));
    let deleted = 0;
    for (const col of mapCollections) {
        const snapshot = await col.where('ownerId', '==', playFabId).get();
        if (snapshot.empty) continue;
        const batch = firestore.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += snapshot.size;
    }
    if (deps?.promisifyPlayFab && deps?.PlayFabServer) {
        await setOwnedMapIds(playFabId, [], deps);
    }
    return { deleted };
}

async function transferOwnedIslands(firestore, fromPlayFabId, toPlayFabId, toNation, deps = null) {
    const mapIds = await resolveOwnedMapIds(firestore, fromPlayFabId, deps);
    const mapCollections = mapIds.map((mapId) => getWorldMapCollection(firestore, mapId));

    let transferred = 0;
    const touchedMapIds = new Set();
    for (const col of mapCollections) {
        const snapshot = await col.where('ownerId', '==', fromPlayFabId).get();
        if (snapshot.empty) continue;
        const mapId = col.id === 'world_map' ? null : col.id.slice('world_map_'.length);
        if (mapId) touchedMapIds.add(mapId);
        let batch = firestore.batch();
        let batchCount = 0;
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, {
                ownerId: toPlayFabId,
                ownerNation: toNation || null
            });
            transferred += 1;
            batchCount += 1;
            if (batchCount >= 450) {
                batch.commit();
                batch = firestore.batch();
                batchCount = 0;
            }
        });
        if (batchCount > 0) {
            await batch.commit();
        }
    }

    if (deps?.promisifyPlayFab && deps?.PlayFabServer) {
        const mapList = Array.from(touchedMapIds);
        for (const mapId of mapList) {
            await addOwnedMapId(toPlayFabId, mapId, deps);
            await removeOwnedMapId(fromPlayFabId, mapId, deps);
        }
    }

    return { transferred };
}

async function relocateActiveShip(firestore, playFabId, respawnPosition, deps) {
    const { promisifyPlayFab, PlayFabServer, admin } = deps;
    const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: ['ActiveShipId']
    });
    const activeShipId = ro?.Data?.ActiveShipId?.Value;
    if (!activeShipId) return { moved: false, reason: 'no_active_ship' };

    const geoPoint = worldToLatLng(respawnPosition);
    const geohash = geohashForLocation([geoPoint.lat, geoPoint.lng]);
    const now = Date.now();
    const patch = {
        position: { x: respawnPosition.x, y: respawnPosition.y },
        currentX: respawnPosition.x,
        currentY: respawnPosition.y,
        targetX: respawnPosition.x,
        targetY: respawnPosition.y,
        arrivalTime: now,
        movement: {
            isMoving: false,
            departureTime: null,
            arrivalTime: null,
            departurePos: null,
            destinationPos: null
        },
        geohash: geohash,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };

    await Promise.all([
        firestore.collection('ships').doc(playFabId).set(patch, { merge: true }),
        firestore.collection('ships').doc(activeShipId).set(patch, { merge: true })
    ]);

    return { moved: true, shipId: activeShipId };
}

function getActiveShipIdForResource(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    return promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: ['ActiveShipId']
    }).then(result => {
        const value = result?.Data?.ActiveShipId?.Value;
        return (typeof value === 'string' && value.trim()) ? value.trim() : null;
    });
}

async function getActiveShipCargoCapacity(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const activeShipId = await getActiveShipIdForResource(playFabId, deps);
    if (!activeShipId) return 0;

    const key = `Ship_${activeShipId}`;
    const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [key]
    });
    const raw = result?.Data?.[key]?.Value;
    if (!raw) return 0;

    let shipData = null;
    try {
        shipData = JSON.parse(raw);
    } catch {
        return 0;
    }
    const capacity = Number(shipData?.Stats?.CargoCapacity);
    return Number.isFinite(capacity) ? Math.max(0, Math.trunc(capacity)) : 0;
}

// APIルートを初期化
function initializeIslandRoutes(app, deps) {
    const { promisifyPlayFab, PlayFabServer, firestore, admin, addEconomyItem, subtractEconomyItem, getVirtualCurrencyMap, getAllInventoryItems, getEntityKeyForPlayFabId, getNationTaxRateBps, applyTax, addNationTreasury, NATION_GROUP_BY_RACE, catalogCache } = deps;

    const islandDeps = { promisifyPlayFab, PlayFabServer, admin };

    // 所有島一覧
    app.post('/api/get-owned-islands', async (req, res) => {
        const { playFabId, mapId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });

        try {
            const islands = [];
            if (mapId) {
                const col = getWorldMapCollection(firestore, mapId);
                const snapshot = await col.where('ownerId', '==', playFabId).get();
                snapshot.docs.forEach((doc) => {
                    const data = doc.data() || {};
                    islands.push({
                        id: doc.id,
                        name: data.name || null,
                        size: data.size || null,
                        islandLevel: data.islandLevel || null,
                        biome: data.biome || null,
                        coordinate: data.coordinate || null,
                        buildings: data.buildings || [],
                        mapId
                    });
                });
            } else {
                const ownedMapIds = await getOwnedMapIds(playFabId, { promisifyPlayFab, PlayFabServer });
                for (const ownedMapId of ownedMapIds) {
                    const col = getWorldMapCollection(firestore, ownedMapId);
                    const snapshot = await col.where('ownerId', '==', playFabId).get();
                    if (snapshot.empty) continue;
                    const resolvedMapId = col.id.startsWith('world_map_') ? col.id.slice('world_map_'.length) : null;
                    snapshot.docs.forEach((doc) => {
                        const data = doc.data() || {};
                        islands.push({
                            id: doc.id,
                            name: data.name || null,
                            size: data.size || null,
                            islandLevel: data.islandLevel || null,
                            biome: data.biome || null,
                            coordinate: data.coordinate || null,
                            buildings: data.buildings || [],
                            mapId: resolvedMapId
                        });
                    });
                }
            }
            res.json({ islands });
        } catch (error) {
            console.error('[get-owned-islands] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to fetch owned islands' });
        }
    });

    // 島詳細取得
    app.post('/api/get-island-details', async (req, res) => {
        const { islandId, mapId, playFabId } = req.body || {};
        if (!islandId) return res.status(400).json({ error: 'islandId is required' });

        try {
            let snap = null;
            if (mapId) {
                const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
                snap = await ref.get();
            }
            if (!snap || !snap.exists) {
                const ownedMapIds = playFabId
                    ? await getOwnedMapIds(playFabId, { promisifyPlayFab, PlayFabServer })
                    : null;
                const found = await findIslandDocAcrossMaps(firestore, islandId, ownedMapIds);
                snap = found.snap;
            }
            if (!snap.exists) return res.status(404).json({ error: 'Island not found' });

            const data = snap.data() || {};
            const biomeInfo = null;
            const islandLevel = Math.max(1, Math.trunc(Number(data.islandLevel) || 1));
            const maxLevel = 5;
            let upgradeCost = null;
            let upgradeHouseId = null;
            let upgradeLevel = null;
            if (islandLevel < maxLevel) {
                upgradeLevel = islandLevel + 1;
                upgradeHouseId = 'my_house';
                const spec = getBuildingSpec(upgradeHouseId, upgradeLevel);
                const priceAmounts = normalizePriceAmounts(spec?.PriceAmounts);
                upgradeCost = priceAmounts.length > 0 ? priceAmounts : null;
            }

            res.json({
                success: true,
                island: {
                    id: snap.id,
                    ...data,
                    biomeInfo,
                    upgradeCost,
                    upgradeHouseId,
                    upgradeLevel
                }
            });
        } catch (error) {
            console.error('[GetIslandDetails] Error:', error);
            res.status(500).json({ error: 'Failed to get island details', details: error.message });
        }
    });

    // リソース状態取得
    app.post('/api/get-resource-status', async (req, res) => {
        const { playFabId, islandId, mapId } = req.body || {};
        if (!playFabId || !islandId) return res.status(400).json({ error: 'playFabId and islandId are required' });

        try {
            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'Island not found' });

            const data = snap.data() || {};
            const biome = data.biome;
            const currency = RESOURCE_BIOME_CURRENCY[biome];
            if (!currency) return res.status(400).json({ error: 'Island not harvestable' });

            const capacity = await getActiveShipCargoCapacity(playFabId, islandDeps);
            if (!capacity || capacity <= 0) {
                return res.status(400).json({ error: 'Cargo capacity is zero' });
            }

            const harvestRef = ref.collection('resourceHarvest').doc(playFabId);
            const harvestSnap = await harvestRef.get();
            const now = Date.now();
            let lastCollectedAt = harvestSnap.exists ? harvestSnap.data()?.lastCollectedAt : null;
            if (lastCollectedAt && typeof lastCollectedAt.toMillis === 'function') {
                lastCollectedAt = lastCollectedAt.toMillis();
            }
            if (!Number.isFinite(lastCollectedAt)) {
                lastCollectedAt = now - RESOURCE_INTERVAL_MS;
                await harvestRef.set({ lastCollectedAt: new Date(lastCollectedAt) }, { merge: true });
            }

            const elapsed = Math.max(0, now - lastCollectedAt);
            const units = Math.floor(elapsed / RESOURCE_INTERVAL_MS);
            const available = Math.min(units, capacity);
            const nextInMs = available > 0 ? 0 : (RESOURCE_INTERVAL_MS - (elapsed % RESOURCE_INTERVAL_MS));

            res.json({
                success: true,
                biome,
                currency,
                capacity,
                available,
                nextInMs
            });
        } catch (error) {
            console.error('[GetResourceStatus] Error:', error);
            res.status(500).json({ error: 'Failed to get resource status', details: error.message });
        }
    });

    // リソース収集
    app.post('/api/collect-resource', async (req, res) => {
        const { playFabId, islandId, mapId } = req.body || {};
        const requestEntity = normalizeEntityKey(req.body?.entityKey);
        if (!playFabId || !islandId || !mapId) {
            return res.status(400).json({ error: 'playFabId, islandId, mapId are required' });
        }

        try {
            const capacity = await getActiveShipCargoCapacity(playFabId, islandDeps);
            if (!capacity || capacity <= 0) {
                return res.json({ success: false, amount: 0, message: 'Cargo capacity is zero' });
            }

            const result = await firestore.runTransaction(async (tx) => {
                const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('IslandNotFound');

                const data = snap.data() || {};
                const biome = data.biome;
                const currency = RESOURCE_BIOME_CURRENCY[biome];
                if (!currency) throw new Error('IslandNotHarvestable');

                const harvestRef = ref.collection('resourceHarvest').doc(playFabId);
                const harvestSnap = await tx.get(harvestRef);
                const now = Date.now();
                let lastCollectedAt = harvestSnap.exists ? harvestSnap.data()?.lastCollectedAt : null;
                if (lastCollectedAt && typeof lastCollectedAt.toMillis === 'function') {
                    lastCollectedAt = lastCollectedAt.toMillis();
                }
                if (!Number.isFinite(lastCollectedAt)) {
                    lastCollectedAt = now;
                }

                const elapsed = Math.max(0, now - lastCollectedAt);
                const units = Math.floor(elapsed / RESOURCE_INTERVAL_MS);
                const amount = Math.min(units, capacity);
                if (amount <= 0) {
                    throw new Error('NothingToCollect');
                }

                const remainderTime = elapsed % RESOURCE_INTERVAL_MS;
                const newLastTime = now - remainderTime;
                tx.set(harvestRef, { lastCollectedAt: new Date(newLastTime) }, { merge: true });

                return { biome, currency, amount, capacity };
            });

            await addEconomyItem(playFabId, result.currency, result.amount, requestEntity);
            res.json({ success: true, ...result });
        } catch (error) {
            const code = error?.message || '';
            if (code === 'NothingToCollect') {
                return res.json({ success: false, amount: 0, message: 'Nothing to collect yet' });
            }
            if (code === 'IslandNotFound') {
                return res.status(404).json({ error: 'Island not found' });
            }
            if (code === 'IslandNotHarvestable') {
                return res.status(400).json({ error: 'Island not harvestable' });
            }
            console.error('[CollectResource] Error:', error);
            res.status(500).json({ error: 'Failed to collect resource', details: error.message });
        }
    });

    // 温泉入浴
    app.post('/api/hot-spring-bath', async (req, res) => {
        const { playFabId, islandId, mapId } = req.body || {};
        const requestEntity = normalizeEntityKey(req.body?.entityKey);
        if (!playFabId || !islandId || !mapId) {
            return res.status(400).json({ error: 'playFabId, islandId, mapId are required' });
        }

        try {
            const islandRef = getWorldMapCollection(firestore, mapId).doc(islandId);
            const islandSnap = await islandRef.get();
            if (!islandSnap.exists) return res.status(404).json({ error: 'IslandNotFound' });
            const island = islandSnap.data() || {};
            const buildings = Array.isArray(island.buildings) ? island.buildings : [];
            const hasHotSpring = buildings.some(b => b && b.status !== 'demolished' && (b.buildingId === 'hot_spring' || b.id === 'hot_spring'));
            if (!hasHotSpring) return res.status(400).json({ error: 'HotSpringNotFound' });
            const ownerId = island.ownerId || null;
            const price = Math.max(0, Math.floor(Number(island.hotSpringPrice) || 200));
            if (!price) return res.status(400).json({ error: 'PriceNotSet' });

            const nationValue = String(island.nation || '').toLowerCase();
            const userNationResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['Nation']
            });
            const userNation = String(userNationResult?.Data?.Nation?.Value || '').toLowerCase();
            if (!userNation || (nationValue && userNation !== nationValue)) {
                return res.status(403).json({ error: 'NotOwnNation' });
            }

            const { getCurrencyBalance } = require('./economy');
            const economyDeps = deps;
            const balance = await getCurrencyBalance(playFabId, 'PS', economyDeps);
            if (balance < price) {
                return res.status(400).json({ error: 'InsufficientFunds' });
            }

            const statsResult = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: playFabId });
            const currentStats = {};
            if (statsResult.Statistics) {
                statsResult.Statistics.forEach(stat => { currentStats[stat.StatisticName] = stat.Value; });
            }
            const currentHp = Number(currentStats.HP || 0);
            const maxHp = Number(currentStats.MaxHP || currentHp || 0);
            if (currentHp >= maxHp) {
                return res.status(400).json({ error: 'HpAlreadyMax' });
            }

            await subtractEconomyItem(playFabId, 'PS', price, requestEntity);

            const taxRateBps = await getNationTaxRateBps(nationValue || userNation, firestore, deps);
            const { tax, net } = applyTax(price, taxRateBps);
            if (ownerId && net > 0) {
                await addEconomyItem(ownerId, 'PS', net, requestEntity);
            }
            if (tax > 0) {
                await addNationTreasury(nationValue || userNation, tax, firestore, deps);
            }

            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: playFabId,
                Statistics: [{ StatisticName: 'HP', Value: maxHp }]
            });

            res.json({ success: true, price, tax, net, newHp: maxHp });
        } catch (error) {
            console.error('[HotSpringBath] Error:', error);
            res.status(500).json({ error: 'Failed to use hot spring', details: error?.errorMessage || error?.message || error });
        }
    });

    // 温泉価格設定
    app.post('/api/set-hot-spring-price', async (req, res) => {
        const { playFabId, islandId, price, mapId } = req.body || {};
        if (!playFabId || !islandId) return res.status(400).json({ error: 'playFabId and islandId are required' });
        const value = Math.max(0, Math.floor(Number(price) || 0));
        if (!Number.isFinite(value) || value <= 0) {
            return res.status(400).json({ error: 'InvalidPrice' });
        }
        try {
            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'IslandNotFound' });
            const island = snap.data() || {};
            if (!island.ownerId || island.ownerId !== playFabId) {
                return res.status(403).json({ error: 'NotOwner' });
            }
            const buildings = Array.isArray(island.buildings) ? island.buildings : [];
            const hasHotSpring = buildings.some(b => b && b.status !== 'demolished' && (b.buildingId === 'hot_spring' || b.id === 'hot_spring'));
            if (!hasHotSpring) return res.status(400).json({ error: 'HotSpringNotFound' });

            await ref.update({
                hotSpringPrice: value,
                hotSpringPriceUpdatedAt: Date.now()
            });
            res.json({ success: true, price: value });
        } catch (error) {
            console.error('[SetHotSpringPrice] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to set hot spring price' });
        }
    });

    // 島レベルアップグレード
    app.post('/api/upgrade-island-level', async (req, res) => {
        const { playFabId, islandId, mapId } = req.body || {};
        if (!playFabId || !islandId) {
            return res.status(400).json({ error: 'playFabId and islandId are required' });
        }

        const nextLevelFrom = (level) => Math.max(1, Math.trunc(Number(level) || 1)) + 1;
        const maxLevel = 5;

        try {
            const ref = getWorldMapCollection(firestore, mapId).doc(islandId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'Island not found' });

            const island = snap.data() || {};
            if (island.ownerId !== playFabId) return res.status(403).json({ error: 'NotOwner' });

            const userReadOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['Nation', 'Race']
            });
            const nationValue = userReadOnly?.Data?.Nation?.Value || null;
            const raceName = userReadOnly?.Data?.Race?.Value || null;
            if (!nationValue && !raceName) return res.status(400).json({ error: 'NationNotSet' });

            let nationIsland = nationValue ? String(nationValue).toLowerCase() : null;
            if (!nationIsland && raceName && NATION_GROUP_BY_RACE[raceName]) {
                nationIsland = NATION_GROUP_BY_RACE[raceName].island;
            }
            if (!nationIsland || island.biome !== nationIsland) {
                return res.status(403).json({ error: 'NationMismatch' });
            }

            const currentLevel = Math.max(1, Math.trunc(Number(island.islandLevel) || 1));
            if (currentLevel >= maxLevel) return res.status(400).json({ error: 'MaxLevel' });

            const nextLevel = nextLevelFrom(currentLevel);
            const houseId = 'my_house';
            const spec = getBuildingSpec(houseId, nextLevel);
            if (!spec) return res.status(400).json({ error: 'BuildingNotFound' });

            const priceAmounts = normalizePriceAmounts(spec?.PriceAmounts);
            const entityKey = await getEntityKeyForPlayFabId(playFabId);
            const items = await getAllInventoryItems(entityKey);
            const balances = getVirtualCurrencyMap(items);
            const costEntries = priceAmounts
                .map((entry) => ({
                    code: entry?.ItemId || entry?.itemId,
                    amount: Number(entry?.Amount ?? entry?.amount ?? 0)
                }))
                .filter((entry) => entry.code && entry.amount > 0);
            for (const entry of costEntries) {
                const bal = Number(balances[entry.code] || 0);
                if (bal < entry.amount) {
                    return res.status(400).json({ error: 'InsufficientFunds', details: { currency: entry.code, required: entry.amount, balance: bal } });
                }
            }

            for (const entry of costEntries) {
                await subtractEconomyItem(playFabId, entry.code, entry.amount);
            }

            const sizeLogic = normalizeSize(spec.SizeLogic, inferLogicSizeFromSlotsRequired(spec.SlotsRequired));
            const sizeVisual = normalizeSize(spec.SizeVisual, sizeLogic);
            const logicW = Math.max(1, Math.trunc(sizeLogic.x));
            const logicH = Math.max(1, Math.trunc(sizeLogic.y));
            const visualW = Math.max(1, Math.trunc(sizeVisual.x));
            const visualH = Math.max(1, Math.trunc(sizeVisual.y));
            const tileIndexRaw = spec.TileIndex;
            const tileIndexValue = Number.isFinite(Number(tileIndexRaw)) ? Number(tileIndexRaw) : 17;
            const maxHp = computeMaxHp(logicW, logicH, nextLevel);

            await firestore.runTransaction(async (tx) => {
                const snapTx = await tx.get(ref);
                if (!snapTx.exists) throw new Error('IslandNotFound');
                const data = snapTx.data() || {};
                const existing = Array.isArray(data.buildings) ? data.buildings.slice() : [];

                const nextBuilding = {
                    buildingId: houseId,
                    status: 'completed',
                    level: nextLevel,
                    startTime: Date.now(),
                    completionTime: Date.now(),
                    durationMs: 0,
                    helpers: [],
                    width: logicW,
                    height: logicH,
                    visualWidth: visualW,
                    visualHeight: visualH,
                    tileIndex: tileIndexValue,
                    maxHp: maxHp,
                    currentHp: maxHp,
                    x: 0,
                    y: 0
                };

                const filtered = existing.filter(b => {
                    if (!b) return true;
                    const rawId = String(b.buildingId || b.id || '');
                    if (rawId === 'my_house') return false;
                    return !rawId.startsWith('my_house_lv');
                });
                filtered.push(nextBuilding);

                tx.update(ref, {
                    islandLevel: nextLevel,
                    buildings: filtered
                });
            });

            res.json({ success: true, islandId, nextLevel, buildingId: houseId });
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'IslandNotFound') return res.status(404).json({ error: 'IslandNotFound' });
            console.error('[upgrade-island-level] Error:', error);
            res.status(500).json({ error: 'Failed to upgrade island level', details: error?.errorMessage || error?.message || error });
        }
    });

    // 建設中の島一覧
    app.get('/api/get-constructing-islands', async (req, res) => {
        try {
            const mapId = String(req?.query?.mapId || '').trim();
            const now = Date.now();

            const normalizeConstructingIslands = async (snapshot) => {
                const islands = [];
                for (const docSnap of snapshot.docs) {
                    const data = docSnap.data() || {};
                    const buildings = Array.isArray(data.buildings) ? data.buildings.slice() : [];
                    const idx = buildings.findIndex(b => b && b.status === 'constructing');
                    if (idx === -1) {
                        if (data.constructionStatus) {
                            await docSnap.ref.update({
                                constructionStatus: admin.firestore.FieldValue.delete()
                            });
                        }
                        continue;
                    }

                    const completionTime = Number(buildings[idx].completionTime) || 0;
                    if (completionTime && completionTime <= now) {
                        buildings[idx] = { ...buildings[idx], status: 'completed' };
                        const status = computeConstructionStatus(buildings);
                        const patch = {
                            buildings,
                            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                        };
                        if (status) {
                            patch.constructionStatus = status;
                        } else {
                            patch.constructionStatus = admin.firestore.FieldValue.delete();
                        }
                        await docSnap.ref.update(patch);
                        continue;
                    }

                    islands.push({ id: docSnap.id, ...data });
                }
                return islands;
            };

            if (mapId) {
                const snapshot = await getWorldMapCollection(firestore, mapId)
                    .where('constructionStatus', '==', 'constructing')
                    .get();
                const islands = await normalizeConstructingIslands(snapshot);
                return res.json({ success: true, islands });
            }

            const collections = await firestore.listCollections();
            const mapCollections = collections.filter((col) => String(col.id || '').startsWith('world_map'));
            const islands = [];
            for (const col of mapCollections) {
                const snapshot = await col.where('constructionStatus', '==', 'constructing').get();
                const list = await normalizeConstructingIslands(snapshot);
                islands.push(...list);
            }

            res.json({ success: true, islands });
        } catch (error) {
            console.error('[GetConstructingIslands] Error:', error);
            res.status(500).json({ error: 'Failed to get constructing islands', details: error.message });
        }
    });
}

module.exports = {
    RESOURCE_INTERVAL_MS,
    RESOURCE_BIOME_CURRENCY,
    getWorldMapCollection,
    findIslandDocAcrossMaps,
    worldToLatLng,
    deleteOwnedIslands,
    transferOwnedIslands,
    getOwnedMapIds,
    addOwnedMapId,
    removeOwnedMapId,
    resolveOwnedMapIds,
    relocateActiveShip,
    getActiveShipIdForResource,
    getActiveShipCargoCapacity,
    initializeIslandRoutes
};
