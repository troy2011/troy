// ships.js - Server-side ship management with hybrid PlayFab/Firestore architecture

const admin = require('firebase-admin');
const { geohashForLocation, geohashQueryBounds, distanceBetween } = require('geofire-common');
const { getEffectsAtPosition } = require('../islandEffects');

// WorldMapScene.js と同じ座標系（ピクセル）→緯度経度の近似変換（geofire-common用）
const GEO_CONFIG = {
    GRID_SIZE: 32,        // 1タイル=32px
    MAP_TILE_SIZE: 500,   // 500x500 tiles
    METERS_PER_TILE: 100  // 1タイル=100m
};

// ファイルスコープで船のカタログをキャッシュする変数
let shipCatalog = {};

function normalizeBaseFrame(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.trunc(num));
}

function extractPlayFabIdFromShipId(shipId) {
    if (typeof shipId !== 'string') return null;
    const match = /^ship_([^_]+)_/.exec(shipId);
    return match ? match[1] : null;
}

function isLikelyPlayFabId(value) {
    return typeof value === 'string' && /^[a-f0-9]{16}$/i.test(value);
}

function worldToLatLng(point) {
    const mapPixelSize = GEO_CONFIG.MAP_TILE_SIZE * GEO_CONFIG.GRID_SIZE;
    const metersPerPixel = GEO_CONFIG.METERS_PER_TILE / GEO_CONFIG.GRID_SIZE;
    const dxMeters = (point.x - mapPixelSize / 2) * metersPerPixel;
    const dyMeters = (mapPixelSize / 2 - point.y) * metersPerPixel;

    const lat = dyMeters / 110574;
    const lng = dxMeters / 111320;
    return { lat, lng };
}

/**
 * データ構造メモ (省略)
 */

function initializeShipRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabEconomy, catalogCache, resolveItemId, catalogCurrencyMap) {
    const db = admin.firestore();
    const shipsCollection = db.collection('ships');
    const { getEntityKeyFromPlayFabId, PlayFabAuthentication } = require('../playfab');
    const { addEconomyItem, subtractEconomyItem, VIRTUAL_CURRENCY_CODE } = require('../economy');

    const economyDeps = { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId, resolveItemId };

    const buildCostsFromItem = (spec) => {
        const costs = [];
        const pushCost = (code, amount) => {
            const id = code ? String(code) : '';
            const value = Number(amount) || 0;
            if (!id || value <= 0) return;
            costs.push({ ItemId: id, Amount: value });
        };
        if (Array.isArray(spec?.PriceAmounts)) {
            spec.PriceAmounts.forEach((entry) => {
                pushCost(entry?.ItemId || entry?.itemId, entry?.Amount ?? entry?.amount);
            });
        }
        if (costs.length === 0 && spec?.PriceOptions) {
            const options = Array.isArray(spec.PriceOptions) ? spec.PriceOptions : [spec.PriceOptions];
            options.forEach((option) => {
                const prices = Array.isArray(option?.Prices) ? option.Prices : [];
                prices.forEach((price) => {
                    const amounts = Array.isArray(price?.Amounts) ? price.Amounts : [];
                    amounts.forEach((entry) => {
                        pushCost(entry?.ItemId || entry?.itemId, entry?.Amount ?? entry?.amount);
                    });
                });
            });
        }
        if (costs.length === 0 && spec?.VirtualCurrencyPrices) {
            for (const [code, amount] of Object.entries(spec.VirtualCurrencyPrices)) {
                pushCost(code, amount);
            }
        }
        return costs;
    };

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

    const SHIP_LEVEL_CAP = 5;

    const resolveShipSpec = (shipData) => {
        if (!shipData) return null;
        if (shipData.ItemId && shipCatalog[shipData.ItemId]) return shipCatalog[shipData.ItemId];
        const shipType = shipData.ShipType;
        if (shipType) {
            return Object.values(shipCatalog).find(item => item.DisplayName === shipType) || null;
        }
        return null;
    };

    const buildShipUpgradeCosts = (shipSpec, nextLevel) => {
        const baseCosts = buildCostsFromItem(shipSpec);
        if (!Array.isArray(baseCosts) || baseCosts.length === 0) return [];
        const multiplier = Math.max(1, Number(nextLevel) || 1);
        return baseCosts.map((entry) => ({
            ...entry,
            Amount: Math.max(1, Math.round((Number(entry.Amount) || 0) * multiplier))
        }));
    };

    const normalizeNationKey = (value) => {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return null;
        return NATION_ALIAS[raw] || raw;
    };

    const computeBaseCostAmount = (costEntries) => {
        const normalized = Array.isArray(costEntries) ? costEntries : [];
        const ps = normalized
            .filter((entry) => String(entry?.ItemId || entry?.itemId || '').toUpperCase() === VIRTUAL_CURRENCY_CODE)
            .reduce((sum, entry) => sum + (Number(entry?.Amount ?? entry?.amount ?? 0) || 0), 0);
        if (ps > 0) return ps;
        return normalized.reduce((sum, entry) => sum + (Number(entry?.Amount ?? entry?.amount ?? 0) || 0), 0);
    };

    const mergeCostEntries = (entries, extra) => {
        const map = new Map();
        (entries || []).forEach((entry) => {
            const code = String(entry?.ItemId || entry?.itemId || '').trim();
            if (!code) return;
            map.set(code, (map.get(code) || 0) + (Number(entry?.Amount ?? entry?.amount ?? 0) || 0));
        });
        (extra || []).forEach((entry) => {
            const code = String(entry?.ItemId || '').trim();
            if (!code) return;
            map.set(code, (map.get(code) || 0) + (Number(entry?.Amount) || 0));
        });
        return Array.from(map.entries()).map(([ItemId, Amount]) => ({ ItemId, Amount }));
    };

    const applyNationResourceCosts = (costEntries, nationKey, options = {}) => {
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
        if (options.onlyResource) return resources.map((entry) => ({ ItemId: entry.ItemId, Amount: entry.Amount }));
        return mergeCostEntries(costEntries, resources);
    };

    const resolvePlayerNation = async (playFabId) => {
        if (!playFabId) return null;
        try {
            const userReadOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['Nation', 'Race']
            });
            const nationValue = userReadOnly?.Data?.Nation?.Value || null;
            const raceValue = userReadOnly?.Data?.Race?.Value || null;
            if (nationValue) return String(nationValue).toLowerCase();
            if (raceValue && NATION_GROUP_BY_RACE[raceValue]) return NATION_GROUP_BY_RACE[raceValue].island;
        } catch (error) {
            console.warn('[ResolvePlayerNation] Failed:', error?.errorMessage || error?.message || error);
        }
        return null;
    };

    const normalizeShipLevel = (value) => {
        const num = Math.floor(Number(value));
        return Number.isFinite(num) && num > 0 ? num : 1;
    };

    const toInt = (value, fallback = 0) => {
        const num = Number(value);
        return Number.isFinite(num) ? Math.trunc(num) : fallback;
    };

    const buildScaledShipStats = (shipData) => {
        const level = normalizeShipLevel(shipData?.Level);
        const base = shipData?.BaseStats || shipData?.Stats || {};

        const baseMaxHp = Math.max(1, toInt(base.MaxHP, toInt(shipData?.Stats?.MaxHP, 1)));
        const baseSpeed = Math.max(1, toInt(base.Speed, toInt(shipData?.Stats?.Speed, 1)));
        const baseVision = Math.max(1, toInt(base.VisionRange, toInt(shipData?.Stats?.VisionRange, 1)));
        const baseCargo = Math.max(0, toInt(base.CargoCapacity, toInt(shipData?.Stats?.CargoCapacity, 0)));
        const baseCrew = Math.max(0, toInt(base.CrewCapacity, toInt(shipData?.Stats?.CrewCapacity, 0)));

        const scaledMaxHp = Math.max(1, Math.round(baseMaxHp * level));
        const scaledSpeed = Math.max(1, Math.round(baseSpeed * level));
        const scaledVision = Math.max(1, Math.round(baseVision * level));

        const currentHpRaw = Number(shipData?.Stats?.CurrentHP);
        const currentMaxRaw = Number(shipData?.Stats?.MaxHP);
        let ratio = 1;
        if (Number.isFinite(currentHpRaw) && Number.isFinite(currentMaxRaw) && currentMaxRaw > 0) {
            ratio = currentHpRaw / currentMaxRaw;
        }
        const scaledCurrent = Number.isFinite(ratio)
            ? Math.max(0, Math.min(scaledMaxHp, Math.round(scaledMaxHp * ratio)))
            : scaledMaxHp;

        return {
            level,
            baseStats: {
                MaxHP: baseMaxHp,
                Speed: baseSpeed,
                CargoCapacity: baseCargo,
                CrewCapacity: baseCrew,
                VisionRange: baseVision
            },
            stats: {
                MaxHP: scaledMaxHp,
                CurrentHP: scaledCurrent,
                Speed: scaledSpeed,
                CargoCapacity: baseCargo,
                CrewCapacity: baseCrew,
                VisionRange: scaledVision
            }
        };
    };

    const applyShipLevelToShipData = (shipData) => {
        if (!shipData || typeof shipData !== 'object') return shipData;
        const { level, baseStats, stats } = buildScaledShipStats(shipData);
        return { ...shipData, Level: level, BaseStats: baseStats, Stats: stats };
    };

    async function findIslandByBiome(biome) {
        const collections = await db.listCollections();
        const mapCollections = collections.filter((col) => String(col.id || '').startsWith('world_map'));
        for (const col of mapCollections) {
            const snapshot = await col.where('biome', '==', biome).limit(1).get();
            if (!snapshot.empty) {
                return snapshot.docs[0].data() || null;
            }
        }
        return null;
    }

    async function getActiveShipId(playFabId) {
        const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['ActiveShipId']
        });
        const value = result?.Data?.ActiveShipId?.Value;
        return (typeof value === 'string' && value.trim()) ? value.trim() : null;
    }

    async function setActiveShipId(playFabId, shipId, shipState) {
        const prevActiveId = await getActiveShipId(playFabId);
        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: playFabId,
            Data: { ActiveShipId: shipId }
        });

        if (prevActiveId && prevActiveId !== shipId) {
            await shipsCollection.doc(prevActiveId).set({
                active: false,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        // マップ表示で参照される「プレイヤー用 docId=PlayFabId」にも反映
        const patch = {
            shipId,
            playFabId,
            active: true,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };

        if (shipState && typeof shipState === 'object') {
            if (shipState.position) {
                patch.position = shipState.position;
                if (typeof shipState.position.x === 'number') patch.currentX = shipState.position.x;
                if (typeof shipState.position.y === 'number') patch.currentY = shipState.position.y;
            }
            if (shipState.movement) {
                patch.movement = shipState.movement;
                if (shipState.movement?.destinationPos) {
                    if (typeof shipState.movement.destinationPos.x === 'number') patch.targetX = shipState.movement.destinationPos.x;
                    if (typeof shipState.movement.destinationPos.y === 'number') patch.targetY = shipState.movement.destinationPos.y;
                }
                if (typeof shipState.movement?.arrivalTime === 'number') patch.arrivalTime = shipState.movement.arrivalTime;
            }
            if (shipState.appearance) patch.appearance = shipState.appearance;
            if (shipState.geohash) patch.geohash = shipState.geohash;
        }

        await shipsCollection.doc(playFabId).set(patch, { merge: true });

        await shipsCollection.doc(shipId).set({
            active: true,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    async function resolveRespawnPosition(playFabId) {
        const readOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['RespawnPosition', 'Nation', 'Race']
        });

        const rawRespawn = readOnly?.Data?.RespawnPosition?.Value;
        if (rawRespawn) {
            try {
                const parsed = JSON.parse(rawRespawn);
                const rx = Number(parsed?.x);
                const ry = Number(parsed?.y);
                if (Number.isFinite(rx) && Number.isFinite(ry)) {
                    return { x: rx, y: ry };
                }
            } catch (_e) {
                // ignore parse errors
            }
        }

        const nationValue = String(readOnly?.Data?.Nation?.Value || '').trim().toLowerCase();
        const raceValue = String(readOnly?.Data?.Race?.Value || '').trim();
        let nationIsland = nationValue || null;
        if (!nationIsland && raceValue && NATION_GROUP_BY_RACE[raceValue]) {
            nationIsland = NATION_GROUP_BY_RACE[raceValue].island;
        }
        if (nationIsland) {
            const island = await findIslandByBiome(nationIsland);
            if (island) {
                const coord = island.coordinate || {};
                const ix = Number(coord.x);
                const iy = Number(coord.y);
                    if (Number.isFinite(ix) && Number.isFinite(iy)) {
                        const baseX = ix * GEO_CONFIG.GRID_SIZE;
                        const baseY = iy * GEO_CONFIG.GRID_SIZE;
                        return { x: baseX, y: baseY + (GEO_CONFIG.GRID_SIZE * 2) };
                    }
            }
        }

        const fallback = await islandCollection.limit(1).get();
        if (!fallback.empty) {
            const island = fallback.docs[0].data() || {};
            const coord = island.coordinate || {};
            const ix = Number(coord.x);
            const iy = Number(coord.y);
            if (Number.isFinite(ix) && Number.isFinite(iy)) {
                return { x: ix * GEO_CONFIG.GRID_SIZE, y: iy * GEO_CONFIG.GRID_SIZE };
            }
        }

        return { x: 100, y: 100 };
    }

    async function respawnShip(playFabId, shipId, reason) {
        const basePosition = await resolveRespawnPosition(playFabId);
        const respawnPosition = await findAvailableSpawnPosition(basePosition);
        const now = Date.now();
        const geoPoint = worldToLatLng(respawnPosition);
        const geohash = geohashForLocation([geoPoint.lat, geoPoint.lng]);

        try {
            const shipResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: [`Ship_${shipId}`]
            });
            const shipRaw = shipResult?.Data?.[`Ship_${shipId}`]?.Value;
            if (shipRaw) {
                const shipData = JSON.parse(shipRaw);
                const maxHp = Number(shipData?.Stats?.MaxHP);
                if (!Number.isFinite(maxHp) || maxHp <= 0) {
                    // keep as-is
                } else {
                    shipData.Stats = shipData.Stats || {};
                    shipData.Stats.CurrentHP = maxHp;
                    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                        PlayFabId: playFabId,
                        Data: { [`Ship_${shipId}`]: JSON.stringify(shipData) }
                    });
                }
            }
        } catch (error) {
            console.warn('[RespawnShip] Failed to reset ship HP:', error?.errorMessage || error?.message || error);
        }

        const movement = {
            isMoving: false,
            departureTime: null,
            arrivalTime: null,
            departurePos: null,
            destinationPos: null
        };

        const patch = {
            position: { x: respawnPosition.x, y: respawnPosition.y },
            currentX: respawnPosition.x,
            currentY: respawnPosition.y,
            targetX: respawnPosition.x,
            targetY: respawnPosition.y,
            arrivalTime: now,
            movement: movement,
            geohash: geohash,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };

        await Promise.all([
            shipsCollection.doc(playFabId).set(patch, { merge: true }),
            shipsCollection.doc(shipId).set(patch, { merge: true })
        ]);

        console.log('[RespawnShip] Respawned', { playFabId, shipId, reason, respawnPosition });
        return respawnPosition;
    }


    // ----------------------------------------------------
    // API: 使用中の船を取得
    // ----------------------------------------------------
    app.post('/api/get-active-ship', async (req, res) => {
        const { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });

        try {
            const activeShipId = await getActiveShipId(playFabId);
            res.json({ success: true, activeShipId });
        } catch (error) {
            console.error('[GetActiveShip] Error:', error);
            res.status(500).json({ error: 'Failed to get active ship', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: 使用中の船を切り替え
    // ----------------------------------------------------
    app.post('/api/set-active-ship', async (req, res) => {
        const { playFabId, shipId } = req.body || {};
        if (!playFabId || !shipId) return res.status(400).json({ error: 'playFabId and shipId are required' });

        try {
            // 1) Firestoreで所有者チェック
            const shipDoc = await shipsCollection.doc(shipId).get();
            if (!shipDoc.exists) return res.status(404).json({ error: 'Ship not found' });
            const shipData = shipDoc.data() || {};
            if (shipData.playFabId !== playFabId) return res.status(403).json({ error: 'Not your ship' });

            // 2) PlayFab側のShip_キーでも存在チェック（不正なshipId弾き）
            const assetKey = `Ship_${shipId}`;
            const assetResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: [assetKey]
            });
            if (!assetResult?.Data?.[assetKey]?.Value) return res.status(403).json({ error: 'Ship asset not owned' });

            await setActiveShipId(playFabId, shipId, shipData);
            res.json({ success: true, activeShipId: shipId });
        } catch (error) {
            console.error('[SetActiveShip] Error:', error);
            res.status(500).json({ error: 'Failed to set active ship', details: error.errorMessage || error.message });
        }
    });

    async function findAvailableSpawnPosition(basePosition) {
        const mapPixelSize = GEO_CONFIG.MAP_TILE_SIZE * GEO_CONFIG.GRID_SIZE;
        const clamp = (v) => Math.max(0, Math.min(mapPixelSize - 1, Math.floor(v)));

        const candidates = [
            { dx: 0, dy: 0 },
            { dx: 32, dy: 0 },
            { dx: -32, dy: 0 },
            { dx: 0, dy: 32 },
            { dx: 0, dy: -32 },
            { dx: 32, dy: 32 },
            { dx: 32, dy: -32 },
            { dx: -32, dy: 32 },
            { dx: -32, dy: -32 },
            { dx: 64, dy: 0 },
            { dx: -64, dy: 0 },
            { dx: 0, dy: 64 },
            { dx: 0, dy: -64 },
        ];

        for (const c of candidates) {
            const x = clamp(basePosition.x + c.dx);
            const y = clamp(basePosition.y + c.dy);

            const snapshot = await shipsCollection
                .where('position.x', '==', x)
                .where('position.y', '==', y)
                .limit(1)
                .get();

            if (snapshot.empty) return { x, y };
        }

        const rx = clamp(basePosition.x + (Math.floor(Math.random() * 9) - 4) * GEO_CONFIG.GRID_SIZE);
        const ry = clamp(basePosition.y + (Math.floor(Math.random() * 9) - 4) * GEO_CONFIG.GRID_SIZE);
        return { x: rx, y: ry };
    }

    async function getAvatarColor(playFabId) {
        try {
            const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['AvatarColor']
            });
            const value = result?.Data?.AvatarColor?.Value;
            return typeof value === 'string' && value.trim() ? value.trim() : 'brown';
        } catch (e) {
            return 'brown';
        }
    }

    // --- 船カタログの初期化 ---
    // サーバー起動時に渡されたカタログキャッシュから船のデータだけをフィルタリング
    const resolveCurrencyCode = (itemId) => {
        if (!itemId) return itemId;
        return catalogCurrencyMap?.[itemId] || catalogCache?.[itemId]?.FriendlyId || itemId;
    };

    shipCatalog = Object.values(catalogCache).filter(item => item.ItemClass === 'Ship').reduce((obj, item) => {
        let priceAmounts = Array.isArray(item.PriceAmounts) ? item.PriceAmounts : [];
        if (priceAmounts.length > 0) {
            priceAmounts = priceAmounts.map((entry) => ({
                ...entry,
                ItemId: resolveCurrencyCode(entry?.ItemId || entry?.itemId)
            }));
        }
        obj[item.ItemId] = {
            ...item,
            PriceAmounts: priceAmounts,
            baseFrame: normalizeBaseFrame(item.baseFrame)
        };
        return obj;
    }, {});
    console.log(`[シップヤード] ${Object.keys(shipCatalog).length} 種類の船データをカタログから読み込みました。`);

    /**
     * API: 船のカタログ情報をクライアントに提供する
     * GET /api/get-ship-catalog
     */
    app.get('/api/get-ship-catalog', (req, res) => {
        if (!shipCatalog || Object.keys(shipCatalog).length === 0) {
            return res.status(503).json({ error: '船のカタログが利用できません。サーバーを再起動してください。' });
        }
        res.json(shipCatalog);
    });

    /**
     * API: 船を建造する (カタログベースに修正)
     * POST /api/create-ship
     * Body: { playFabId, shipItemId, mapId, islandId }
     */
    app.post('/api/create-ship', async (req, res) => {
        const { playFabId, shipItemId, spawnPosition, mapId, islandId } = req.body;
        console.log('[create-ship] incoming', {
            playFabId,
            shipItemId,
            hasSpawnPosition: !!spawnPosition,
            mapId,
            islandId
        });

        if (!playFabId || !shipItemId) {
            return res.status(400).json({ error: 'playFabId and shipItemId are required' });
        }
        if (!mapId || !islandId) {
            return res.status(400).json({ error: 'Capital island is required' });
        }

        const shipSpec = shipCatalog[shipItemId];
        if (!shipSpec) {
            return res.status(400).json({ error: `無効な shipItemId: ${shipItemId}` });
        }
        if (!Array.isArray(shipSpec.PriceAmounts) && !shipSpec.PriceOptions && !shipSpec.VirtualCurrencyPrices) {
            console.warn('[create-ship] shipSpec snapshot', {
                shipItemId,
                shipSpecKeys: Object.keys(shipSpec || {}),
                shipSpec
            });
        }

        let costsToPay = buildCostsFromItem(shipSpec);
        if (costsToPay.length === 0) {
            try {
                const tokenResult = await promisifyPlayFab(PlayFabAuthentication.GetEntityToken, {});
                const titleEntity = tokenResult?.Entity;
                if (titleEntity?.Id && titleEntity?.Type) {
                    const latestResult = await promisifyPlayFab(PlayFabEconomy.GetItems, {
                        Entity: titleEntity,
                        Ids: [shipItemId]
                    });
                    const latestItem = Array.isArray(latestResult?.Items) ? latestResult.Items[0] : null;
                    const latestCosts = buildCostsFromItem(latestItem);
                    if (latestCosts.length > 0) {
                        costsToPay.push(...latestCosts);
                    }
                }
            } catch (error) {
                console.warn('[create-ship] Failed to fetch latest price data', error?.errorMessage || error?.message || error);
            }
        }
        if (costsToPay.length === 0) {
            console.warn('[create-ship] MissingPriceAmounts', {
                shipItemId,
                priceAmounts: shipSpec?.PriceAmounts,
                priceOptions: shipSpec?.PriceOptions,
                virtualCurrencyPrices: shipSpec?.VirtualCurrencyPrices
            });
            return res.status(400).json({ error: 'MissingPriceAmounts' });
        }

        try {
            const readOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['Race', 'Nation']
            });
            const playerRace = String(readOnly?.Data?.Race?.Value || '').toLowerCase().trim();
            const playerNation = String(readOnly?.Data?.Nation?.Value || '').toLowerCase().trim();
            if (!playerNation) {
                return res.status(403).json({ error: 'NationNotSet' });
            }
            const paymentMethod = String(req?.body?.paymentMethod || '').trim().toLowerCase();
            const resourceCosts = applyNationResourceCosts(costsToPay, playerNation, { useSacred: false, onlyResource: true });
            const resourceCostsResolved = resourceCosts.length > 0 ? resourceCosts : costsToPay;
            const useResourcePayment = paymentMethod === 'resource';
            costsToPay = useResourcePayment ? resourceCostsResolved : costsToPay;
            const shipRace = String(shipSpec.race || shipSpec.Race || '').toLowerCase().trim();
            if (shipRace && shipRace !== 'common' && playerRace && shipRace !== playerRace) {
                return res.status(403).json({ error: 'Race restricted ship', details: { shipRace, playerRace } });
            }

            const capitalRef = db.collection(`world_map_${mapId}`).doc(islandId);
            const capitalSnap = await capitalRef.get();
            if (!capitalSnap.exists) {
                return res.status(404).json({ error: 'CapitalNotFound' });
            }
            const capital = capitalSnap.data() || {};
            const capitalNation = String(capital.nation || '').toLowerCase().trim();
            if (!capitalNation || capitalNation !== playerNation) {
                return res.status(403).json({ error: 'NotOwnCapital' });
            }
            const buildings = Array.isArray(capital.buildings) ? capital.buildings : [];
            const hasCapital = buildings.some(b => b && b.status !== 'demolished' && (b.buildingId === 'capital' || b.id === 'capital'));
            if (!hasCapital) {
                return res.status(403).json({ error: 'CapitalRequired' });
            }

            const coord = capital.coordinate || {};
            const ix = Number(coord.x);
            const iy = Number(coord.y);
            let baseSpawnPosition = null;
            if (Number.isFinite(ix) && Number.isFinite(iy)) {
                baseSpawnPosition = {
                    x: ix * GEO_CONFIG.GRID_SIZE,
                    y: iy * GEO_CONFIG.GRID_SIZE + GEO_CONFIG.GRID_SIZE
                };
            } else if (spawnPosition && Number.isFinite(Number(spawnPosition.x)) && Number.isFinite(Number(spawnPosition.y))) {
                baseSpawnPosition = { x: Number(spawnPosition.x), y: Number(spawnPosition.y) };
            } else {
                baseSpawnPosition = await resolveRespawnPosition(playFabId);
            }

            const resolvedSpawnPosition = await findAvailableSpawnPosition(baseSpawnPosition);

            // 1. 建造コストを支払う
            for (const costItem of costsToPay) {
                const code = costItem.ItemId || costItem.itemId;
                const amount = costItem.Amount || costItem.amount;
                await subtractEconomyItem(playFabId, code, amount, economyDeps);
                console.log(`[CreateShip] ${playFabId} paid ${amount} ${code}`);
            }

            // 2. PlayFabに船データを保存（UserReadOnlyData）
            const shipId = `ship_${playFabId}_${Date.now()}`;
            const shipData = {};
            shipData.ShipId = shipId;
            shipData.ShipType = shipSpec.DisplayName; // カタログの表示名を利用
            shipData.ItemId = shipItemId; // カタログのItemIdを保存
            shipData.baseFrame = normalizeBaseFrame(shipSpec.baseFrame); // グラフィックの基準フレーム
            shipData.Domain = shipSpec.Domain || 'sea_surface';
            const visionRange = Number(shipSpec.VisionRange);
            const resolvedVisionRange = Number.isFinite(visionRange) ? visionRange : 300;
            shipData.Level = 1;
            shipData.BaseStats = {
                MaxHP: parseInt(shipSpec.MaxHP, 10),
                Speed: parseInt(shipSpec.Speed, 10),
                CargoCapacity: parseInt(shipSpec.CargoCapacity, 10),
                CrewCapacity: parseInt(shipSpec.CrewCapacity, 10),
                VisionRange: resolvedVisionRange
            };
            shipData.Stats = {
                MaxHP: shipData.BaseStats.MaxHP,
                CurrentHP: shipData.BaseStats.MaxHP,
                Speed: shipData.BaseStats.Speed,
                CargoCapacity: shipData.BaseStats.CargoCapacity,
                CrewCapacity: shipData.BaseStats.CrewCapacity,
                VisionRange: shipData.BaseStats.VisionRange
            };
            shipData.Skills = shipSpec.Skills || [];
            shipData.Equipment = { Cannon: null, Sail: null, Hull: null, Anchor: null };
            shipData.Cargo = [];
            shipData.Crew = [{ PlayFabId: playFabId, Role: 'Captain' }];
            shipData.Owner = playFabId;
            shipData.CreatedAt = new Date().toISOString();
            const resolvedShipData = applyShipLevelToShipData(shipData);

            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: playFabId,
                Data: {
                    [`Ship_${shipId}`]: JSON.stringify(resolvedShipData)
                }
            });

            // 3. Firestoreに位置データを保存
            const spawnGeo = worldToLatLng(resolvedSpawnPosition);
            const geohash = geohashForLocation([spawnGeo.lat, spawnGeo.lng]);
            const avatarColor = await getAvatarColor(playFabId);

            const firestoreShipData = {
                shipId: shipId,
                playFabId: playFabId,
                position: resolvedSpawnPosition,
                geohash: geohash,
                appearance: {
                    shipType: shipSpec.DisplayName,
                    domain: shipSpec.Domain || 'sea_surface',
                    color: avatarColor,
                    sailState: 'furled'
                },
                movement: {
                    isMoving: false,
                    departureTime: null,
                    arrivalTime: null,
                    departurePos: null,
                    destinationPos: null
                },
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('ships').doc(shipId).set(firestoreShipData);
            console.log(`[CreateShip] Ship created with geohash: ${geohash}`);
            console.log(`[CreateShip] Created ship ${shipId} for player ${playFabId}`);

            // 初回の1隻目なら自動的に使用中にする
            const currentActive = await getActiveShipId(playFabId);
            if (!currentActive) {
                await setActiveShipId(playFabId, shipId, firestoreShipData);
            }

            res.json({ success: true, shipId: shipId, shipData: resolvedShipData, firestoreData: firestoreShipData });

        } catch (error) {
            console.error('[CreateShip] Error:', error);
            if (error.apiErrorInfo && error.apiErrorInfo.apiError === 'InsufficientFunds') {
                return res.status(402).json({ error: `建造費用が不足しています。(${cost} ${currencyCode} 必要)` });
            }
            res.status(500).json({ error: 'Failed to create ship', details: error.errorMessage || error.message });
        }
    });

    /**
     * API: 船のレベルアップ
     * POST /api/upgrade-ship
     */
    app.post('/api/upgrade-ship', async (req, res) => {
        const { playFabId, shipId } = req.body || {};
        if (!playFabId || !shipId) {
            return res.status(400).json({ error: 'playFabId and shipId are required' });
        }

        try {
            const shipDoc = await shipsCollection.doc(shipId).get();
            if (!shipDoc.exists) return res.status(404).json({ error: 'Ship not found' });
            const shipDocData = shipDoc.data() || {};
            if (shipDocData.playFabId !== playFabId) {
                return res.status(403).json({ error: 'Not your ship' });
            }

            const assetKey = `Ship_${shipId}`;
            const assetResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: [assetKey]
            });
            if (!assetResult?.Data?.[assetKey]?.Value) {
                return res.status(404).json({ error: 'Ship asset not found' });
            }

            const rawShipData = JSON.parse(assetResult.Data[assetKey].Value);
            const currentShipData = applyShipLevelToShipData(rawShipData);
            const currentLevel = normalizeShipLevel(currentShipData.Level);
            if (currentLevel >= SHIP_LEVEL_CAP) {
                return res.status(400).json({ error: 'ShipLevelCap', level: currentLevel });
            }

            const nextLevel = currentLevel + 1;
            const shipSpec = resolveShipSpec(currentShipData);
            if (!shipSpec) {
                return res.status(400).json({ error: 'ShipSpecNotFound' });
            }

            let upgradeCosts = buildShipUpgradeCosts(shipSpec, nextLevel);
            const nationForCosts = await resolvePlayerNation(playFabId);
            const paymentMethod = String(req?.body?.paymentMethod || '').trim().toLowerCase();
            const resourceCosts = applyNationResourceCosts(upgradeCosts, nationForCosts, { useSacred: true, onlyResource: true });
            const resourceCostsResolved = resourceCosts.length > 0 ? resourceCosts : upgradeCosts;
            const useResourcePayment = paymentMethod === 'resource';
            upgradeCosts = useResourcePayment ? resourceCostsResolved : upgradeCosts;
            if (upgradeCosts.length === 0) {
                return res.status(400).json({ error: 'UpgradeCostNotConfigured' });
            }

            for (const costItem of upgradeCosts) {
                await subtractEconomyItem(playFabId, costItem.ItemId, costItem.Amount, economyDeps);
                console.log(`[UpgradeShip] ${playFabId} paid ${costItem.Amount} ${costItem.ItemId}`);
            }

            const leveledData = applyShipLevelToShipData({
                ...currentShipData,
                Level: nextLevel
            });
            leveledData.Stats = leveledData.Stats || {};
            leveledData.Stats.CurrentHP = leveledData.Stats.MaxHP;

            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: playFabId,
                Data: { [assetKey]: JSON.stringify(leveledData) }
            });

            res.json({ success: true, shipId, shipData: leveledData, level: nextLevel, costs: upgradeCosts });
        } catch (error) {
            console.error('[UpgradeShip] Error:', error);
            if (error.apiErrorInfo && error.apiErrorInfo.apiError === 'InsufficientFunds') {
                return res.status(402).json({ error: 'InsufficientFunds' });
            }
            return res.status(500).json({ error: 'Failed to upgrade ship', details: error.errorMessage || error.message });
        }
    });

    // ( ... 他のAPIエンドポイントは変更なし ... )

    const RAM_DIRECTION_THRESHOLDS = { front: 60, side: 120 };
    const RAM_DIRECTION_MULTIPLIERS = { front: 1.0, side: 1.25, back: 1.5 };
    const DIRECTION_VECTORS = {
        ship_down: { x: 0, y: 1 },
        ship_up: { x: 0, y: -1 },
        ship_left: { x: -1, y: 0 },
        ship_right: { x: 1, y: 0 },
        ship_down_left: { x: -0.707, y: 0.707 },
        ship_down_right: { x: 0.707, y: 0.707 },
        ship_up_left: { x: -0.707, y: -0.707 },
        ship_up_right: { x: 0.707, y: -0.707 }
    };

    function normalizeVector(vec) {
        const x = Number(vec?.x);
        const y = Number(vec?.y);
        const len = Math.hypot(x, y);
        if (!Number.isFinite(len) || len === 0) return null;
        return { x: x / len, y: y / len };
    }

    function normalizePosition(pos) {
        const x = Number(pos?.x);
        const y = Number(pos?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
    }

    function getFacingVector(key) {
        const vec = DIRECTION_VECTORS[String(key || '').toLowerCase().trim()];
        return vec ? normalizeVector(vec) : null;
    }

    function resolveShipPosition(doc) {
        const movement = doc?.movement || null;
        if (movement?.isMoving && movement?.departurePos && movement?.destinationPos) {
            const now = Date.now();
            const departureTime = Number(movement.departureTime);
            const arrivalTime = Number(movement.arrivalTime);
            if (Number.isFinite(departureTime) && Number.isFinite(arrivalTime) && arrivalTime > departureTime) {
                const progress = Math.min(1, Math.max(0, (now - departureTime) / (arrivalTime - departureTime)));
                const start = movement.departurePos;
                const end = movement.destinationPos;
                if (start && end) {
                    return {
                        x: Number(start.x) + (Number(end.x) - Number(start.x)) * progress,
                        y: Number(start.y) + (Number(end.y) - Number(start.y)) * progress
                    };
                }
            }
        }
        const position = normalizePosition(doc?.position);
        if (position) return position;
        const currentX = Number(doc?.currentX);
        const currentY = Number(doc?.currentY);
        if (Number.isFinite(currentX) && Number.isFinite(currentY)) {
            return { x: currentX, y: currentY };
        }
        return null;
    }

    function getDirectionMultiplier(facingKey, selfPos, targetPos) {
        const facing = getFacingVector(facingKey);
        const self = normalizePosition(selfPos);
        const target = normalizePosition(targetPos);
        if (!facing || !self || !target) return { multiplier: 1.0, zone: 'unknown' };
        const toTarget = normalizeVector({ x: target.x - self.x, y: target.y - self.y });
        if (!toTarget) return { multiplier: 1.0, zone: 'unknown' };
        const dot = Math.max(-1, Math.min(1, facing.x * toTarget.x + facing.y * toTarget.y));
        const angle = Math.acos(dot) * (180 / Math.PI);
        if (angle <= RAM_DIRECTION_THRESHOLDS.front) {
            return { multiplier: RAM_DIRECTION_MULTIPLIERS.front, zone: 'front' };
        }
        if (angle <= RAM_DIRECTION_THRESHOLDS.side) {
            return { multiplier: RAM_DIRECTION_MULTIPLIERS.side, zone: 'side' };
        }
        return { multiplier: RAM_DIRECTION_MULTIPLIERS.back, zone: 'back' };
    }

    const AUTO_ATTACK_DAMAGE_BY_TIER = {
        small: 60,
        medium: 120,
        large: 200
    };

    function resolveAutoAttackDamage(effects) {
        const directDamage = Number(effects?.damage);
        if (Number.isFinite(directDamage) && directDamage > 0) return directDamage;
        const tier = String(effects?.autoAttackTier || '').toLowerCase();
        return AUTO_ATTACK_DAMAGE_BY_TIER[tier] || 0;
    }

    function pickAutoAttackDamage(effectEntries, nation) {
        if (!Array.isArray(effectEntries) || !nation) return 0;
        let maxDamage = 0;
        effectEntries.forEach((entry) => {
            if (!entry?.flags?.autoAttack) return;
            const ownerNation = String(entry.ownerNation || '').trim().toLowerCase();
            if (!ownerNation || ownerNation === nation) return;
            const damage = resolveAutoAttackDamage(entry.effects);
            if (damage > maxDamage) maxDamage = damage;
        });
        return maxDamage;
    }

    /**
     * API: 船の体当たりダメージ
     * POST /api/ram-ship
     */
    app.post('/api/ram-ship', async (req, res) => {
        const { attackerId, defenderId } = req.body || {};
        if (!attackerId || !defenderId || attackerId === defenderId) {
            return res.status(400).json({ error: 'attackerId and defenderId are required and must be different' });
        }

        try {
            const baseDamage = 300;
            const advantage = (a, b) => {
                if (a === 'fighter' && b === 'merchant') return true;
                if (a === 'defender' && b === 'fighter') return true;
                if (a === 'merchant' && b === 'defender') return true;
                return false;
            };

            const [attackerSummary, defenderSummary] = await Promise.all([
                shipsCollection.doc(attackerId).get(),
                shipsCollection.doc(defenderId).get()
            ]);
            const attackerSummaryData = attackerSummary.exists ? (attackerSummary.data() || {}) : {};
            const defenderSummaryData = defenderSummary.exists ? (defenderSummary.data() || {}) : {};
            const nowTs = Date.now();
            const attackerImmune = Number(attackerSummaryData.immuneUntil) > nowTs;
            const defenderImmune = Number(defenderSummaryData.immuneUntil) > nowTs;
            const attackerShipId = attackerSummaryData.shipId || null;
            const defenderShipId = defenderSummaryData.shipId || null;
            if (!attackerShipId || !defenderShipId) {
                return res.status(404).json({ error: 'Active ship not found for attacker/defender' });
            }

            const [attackerNationResult, defenderNationResult] = await Promise.all([
                promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, { PlayFabId: attackerId, Keys: ['Nation'] }),
                promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, { PlayFabId: defenderId, Keys: ['Nation'] })
            ]);
            const attackerNation = String(attackerNationResult?.Data?.Nation?.Value || '').trim().toLowerCase();
            const defenderNation = String(defenderNationResult?.Data?.Nation?.Value || '').trim().toLowerCase();
            if (attackerNation && defenderNation && attackerNation === defenderNation) {
                return res.json({ success: true, skipped: true, reason: 'same_nation' });
            }

            const [attackerShipDataResult, defenderShipDataResult] = await Promise.all([
                promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, { PlayFabId: attackerId, Keys: [`Ship_${attackerShipId}`] }),
                promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, { PlayFabId: defenderId, Keys: [`Ship_${defenderShipId}`] })
            ]);
            const attackerShipDataRaw = attackerShipDataResult?.Data?.[`Ship_${attackerShipId}`]?.Value;
            const defenderShipDataRaw = defenderShipDataResult?.Data?.[`Ship_${defenderShipId}`]?.Value;
            if (!attackerShipDataRaw || !defenderShipDataRaw) {
                return res.status(404).json({ error: 'Ship asset not found for attacker/defender' });
            }

            let attackerShipData = applyShipLevelToShipData(JSON.parse(attackerShipDataRaw));
            let defenderShipData = applyShipLevelToShipData(JSON.parse(defenderShipDataRaw));
            const attackerDomain = String(attackerShipData?.Domain || '').toLowerCase();
            const defenderDomain = String(defenderShipData?.Domain || '').toLowerCase();
            const attackerItemId = attackerShipData?.ItemId;
            const defenderItemId = defenderShipData?.ItemId;
            const attackerClass = String(catalogCache[attackerItemId]?.class || catalogCache[attackerItemId]?.Class || '').toLowerCase();
            const defenderClass = String(catalogCache[defenderItemId]?.class || catalogCache[defenderItemId]?.Class || '').toLowerCase();

            let attackerDamage = baseDamage * (advantage(attackerClass, defenderClass) ? 2 : 1);
            let defenderDamage = baseDamage * (advantage(defenderClass, attackerClass) ? 2 : 1);

            const attackerMaxHp = Number(attackerShipData?.Stats?.MaxHP) || 0;
            const defenderMaxHp = Number(defenderShipData?.Stats?.MaxHP) || 0;
            const attackerHp = Number(attackerShipData?.Stats?.CurrentHP);
            const defenderHp = Number(defenderShipData?.Stats?.CurrentHP);

            const isAirDomain = (domain) => ['air', 'sky', 'flight', 'flying'].includes(domain);
            const isWaterDomain = (domain) => ['water', 'underwater', 'sea_underwater', 'submarine'].includes(domain);

            if (isAirDomain(attackerDomain) !== isAirDomain(defenderDomain)) {
                return res.json({ success: true, skipped: true, reason: 'air_mismatch' });
            }

            if (isWaterDomain(defenderDomain)) {
                attackerDamage *= 0.5;
            }
            if (isWaterDomain(attackerDomain)) {
                defenderDamage *= 0.5;
            }
            if (isAirDomain(defenderDomain)) {
                attackerDamage = Math.max(attackerDamage, defenderMaxHp);
            }
            if (isAirDomain(attackerDomain)) {
                defenderDamage = Math.max(defenderDamage, attackerMaxHp);
            }

            const attackerFacing = req.body?.attackerFacing || attackerSummaryData.lastAnimKey || 'ship_down';
            const defenderFacing = req.body?.defenderFacing || defenderSummaryData.lastAnimKey || 'ship_down';
            const attackerPos = normalizePosition(req.body?.attackerPos) || resolveShipPosition(attackerSummaryData);
            const defenderPos = normalizePosition(req.body?.defenderPos) || resolveShipPosition(defenderSummaryData);
            const attackerDir = getDirectionMultiplier(attackerFacing, attackerPos, defenderPos);
            const defenderDir = getDirectionMultiplier(defenderFacing, defenderPos, attackerPos);
            attackerDamage *= attackerDir.multiplier;
            defenderDamage *= defenderDir.multiplier;

            let autoDamageToAttacker = 0;
            let autoDamageToDefender = 0;
            const resolvedMapId = (typeof req.body?.mapId === 'string' && req.body.mapId.trim())
                ? req.body.mapId.trim()
                : (attackerSummaryData.mapId || defenderSummaryData.mapId || null);
            try {
                const [attackerEffects, defenderEffects] = await Promise.all([
                    attackerPos ? getEffectsAtPosition(resolvedMapId, attackerPos, db) : [],
                    defenderPos ? getEffectsAtPosition(resolvedMapId, defenderPos, db) : []
                ]);
                autoDamageToAttacker = pickAutoAttackDamage(attackerEffects, attackerNation);
                autoDamageToDefender = pickAutoAttackDamage(defenderEffects, defenderNation);
            } catch (error) {
                console.warn('[RamShip] Failed to resolve island effects:', error?.message || error);
            }
            attackerDamage += autoDamageToDefender;
            defenderDamage += autoDamageToAttacker;

            if (defenderImmune) {
                attackerDamage = 0;
            }
            if (attackerImmune) {
                defenderDamage = 0;
            }

            const nextAttackerHp = Math.max(0, (Number.isFinite(attackerHp) ? attackerHp : attackerMaxHp) - defenderDamage);
            const nextDefenderHp = Math.max(0, (Number.isFinite(defenderHp) ? defenderHp : defenderMaxHp) - attackerDamage);
            const attackerRespawn = nextAttackerHp <= 0;
            const defenderRespawn = nextDefenderHp <= 0;

            attackerShipData.Stats = attackerShipData.Stats || {};
            defenderShipData.Stats = defenderShipData.Stats || {};
            attackerShipData.Stats.CurrentHP = attackerRespawn ? attackerMaxHp : nextAttackerHp;
            defenderShipData.Stats.CurrentHP = defenderRespawn ? defenderMaxHp : nextDefenderHp;

            await Promise.all([
                promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                    PlayFabId: attackerId,
                    Data: { [`Ship_${attackerShipId}`]: JSON.stringify(attackerShipData) }
                }),
                promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                    PlayFabId: defenderId,
                    Data: { [`Ship_${defenderShipId}`]: JSON.stringify(defenderShipData) }
                })
            ]);

            const respawnResults = await Promise.all([
                attackerRespawn ? respawnShip(attackerId, attackerShipId, 'ram') : null,
                defenderRespawn ? respawnShip(defenderId, defenderShipId, 'ram') : null
            ]);

            return res.json({
                success: true,
                attacker: { playFabId: attackerId, shipId: attackerShipId, hp: attackerShipData.Stats.CurrentHP, damageTaken: defenderDamage, respawned: attackerRespawn, respawnPosition: respawnResults[0] || null, immuneActive: attackerImmune },
                defender: { playFabId: defenderId, shipId: defenderShipId, hp: defenderShipData.Stats.CurrentHP, damageTaken: attackerDamage, respawned: defenderRespawn, respawnPosition: respawnResults[1] || null, immuneActive: defenderImmune },
                baseDamage: baseDamage,
                attackerDamage,
                defenderDamage
            });
        } catch (error) {
            console.error('[RamShip] Error:', error);
            return res.status(500).json({ error: 'Failed to apply ram damage', details: error.errorMessage || error.message });
        }
    });

    /**
     * API: Ship action damage (client-side targeting)
     * POST /api/ship-action-damage
     */
    app.post('/api/ship-action-damage', async (req, res) => {
        const { attackerId, targets, damage } = req.body || {};
        if (!attackerId || !Array.isArray(targets) || targets.length === 0) {
            return res.status(400).json({ error: 'attackerId and targets are required' });
        }
        const damageValue = Number(damage);
        if (!Number.isFinite(damageValue) || damageValue <= 0) {
            return res.status(400).json({ error: 'damage must be a positive number' });
        }

        try {
            const attackerNationResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: attackerId,
                Keys: ['Nation']
            });
            const attackerNation = String(attackerNationResult?.Data?.Nation?.Value || '').trim().toLowerCase();

            const results = [];
            for (const targetId of targets) {
                if (!targetId || targetId === attackerId) continue;

                const defenderNationResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                    PlayFabId: targetId,
                    Keys: ['Nation']
                });
                const defenderNation = String(defenderNationResult?.Data?.Nation?.Value || '').trim().toLowerCase();
                if (attackerNation && defenderNation && attackerNation === defenderNation) {
                    results.push({ playFabId: targetId, skipped: true, reason: 'same_nation' });
                    continue;
                }

                const defenderSummary = await shipsCollection.doc(targetId).get();
                const defenderSummaryData = defenderSummary.exists ? (defenderSummary.data() || {}) : {};
                const defenderShipId = defenderSummaryData.shipId || null;
                if (!defenderShipId) {
                    results.push({ playFabId: targetId, error: 'Active ship not found' });
                    continue;
                }

                const defenderShipDataResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                    PlayFabId: targetId,
                    Keys: [`Ship_${defenderShipId}`]
                });
                const defenderShipDataRaw = defenderShipDataResult?.Data?.[`Ship_${defenderShipId}`]?.Value;
                if (!defenderShipDataRaw) {
                    results.push({ playFabId: targetId, error: 'Ship asset not found' });
                    continue;
                }

                const defenderShipData = applyShipLevelToShipData(JSON.parse(defenderShipDataRaw));
                const defenderMaxHp = Number(defenderShipData?.Stats?.MaxHP) || 0;
                const defenderHp = Number(defenderShipData?.Stats?.CurrentHP);
                const shieldUntil = Number(defenderSummaryData.shieldUntil) || 0;
                const shieldFactor = Number(defenderSummaryData.shieldFactor);
                const shieldActive = shieldUntil > Date.now()
                    && Number.isFinite(shieldFactor)
                    && shieldFactor > 0
                    && shieldFactor < 1;
                const immuneUntil = Number(defenderSummaryData.immuneUntil) || 0;
                if (immuneUntil > Date.now()) {
                    results.push({ playFabId: targetId, skipped: true, reason: 'immune' });
                    continue;
                }
                const appliedDamage = shieldActive
                    ? Math.max(1, Math.round(damageValue * shieldFactor))
                    : damageValue;
                const nextDefenderHp = Math.max(0, (Number.isFinite(defenderHp) ? defenderHp : defenderMaxHp) - appliedDamage);
                const defenderRespawn = nextDefenderHp <= 0;

                defenderShipData.Stats = defenderShipData.Stats || {};
                defenderShipData.Stats.CurrentHP = defenderRespawn ? defenderMaxHp : nextDefenderHp;

                await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                    PlayFabId: targetId,
                    Data: { [`Ship_${defenderShipId}`]: JSON.stringify(defenderShipData) }
                });

                const respawnResult = defenderRespawn ? await respawnShip(targetId, defenderShipId, 'action') : null;
                results.push({
                    playFabId: targetId,
                    shipId: defenderShipId,
                    hp: defenderShipData.Stats.CurrentHP,
                    damageTaken: appliedDamage,
                    shielded: shieldActive,
                    shieldFactor: shieldActive ? shieldFactor : null,
                    respawned: defenderRespawn,
                    respawnPosition: respawnResult || null
                });
            }

            return res.json({
                success: true,
                hits: results.filter(r => r && !r.skipped && !r.error).length,
                results
            });
        } catch (error) {
            console.error('[ShipActionDamage] Error:', error);
            return res.status(500).json({ error: 'Failed to apply ship action damage', details: error.errorMessage || error.message });
        }
    });

    /**
     * API: Ship action player damage (HP only)
     * POST /api/ship-action-player-damage
     */
    app.post('/api/ship-action-player-damage', async (req, res) => {
        const { attackerId, targets, damage } = req.body || {};
        if (!attackerId || !Array.isArray(targets) || targets.length === 0) {
            return res.status(400).json({ error: 'attackerId and targets are required' });
        }
        const damageValue = Number(damage);
        if (!Number.isFinite(damageValue) || damageValue <= 0) {
            return res.status(400).json({ error: 'damage must be a positive number' });
        }

        try {
            const attackerNationResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: attackerId,
                Keys: ['Nation']
            });
            const attackerNation = String(attackerNationResult?.Data?.Nation?.Value || '').trim().toLowerCase();

            const results = [];
            for (const targetId of targets) {
                if (!targetId || targetId === attackerId) continue;
                const defenderNationResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                    PlayFabId: targetId,
                    Keys: ['Nation']
                });
                const defenderNation = String(defenderNationResult?.Data?.Nation?.Value || '').trim().toLowerCase();
                if (attackerNation && defenderNation && attackerNation === defenderNation) {
                    results.push({ playFabId: targetId, skipped: true, reason: 'same_nation' });
                    continue;
                }

                const statsResult = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: targetId });
                const stats = {};
                if (Array.isArray(statsResult?.Statistics)) {
                    statsResult.Statistics.forEach((entry) => {
                        stats[entry.StatisticName] = entry.Value;
                    });
                }
                const maxHp = Number(stats.MaxHP || stats.HP || 1);
                const currentHp = Number.isFinite(Number(stats.HP)) ? Number(stats.HP) : maxHp;
                const nextHp = Math.max(1, currentHp - damageValue);

                await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                    PlayFabId: targetId,
                    Statistics: [{ StatisticName: 'HP', Value: nextHp }]
                });

                results.push({ playFabId: targetId, hp: nextHp, damageTaken: currentHp - nextHp });
            }

            return res.json({
                success: true,
                hits: results.filter(r => r && !r.skipped && !r.error).length,
                results
            });
        } catch (error) {
            console.error('[ShipActionPlayerDamage] Error:', error);
            return res.status(500).json({ error: 'Failed to apply player damage', details: error.errorMessage || error.message });
        }
    });

    /**
     * API: Ship action immune (no damage)
     * POST /api/ship-action-immune
     */
    app.post('/api/ship-action-immune', async (req, res) => {
        const { playFabId, durationMs } = req.body || {};
        if (!playFabId) {
            return res.status(400).json({ error: 'playFabId is required' });
        }
        const durationValue = Number(durationMs);
        if (!Number.isFinite(durationValue) || durationValue <= 0) {
            return res.status(400).json({ error: 'durationMs must be a positive number' });
        }
        try {
            const immuneUntil = Date.now() + durationValue;
            await shipsCollection.doc(playFabId).set({
                immuneUntil,
                immuneUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return res.json({ success: true, immuneUntil });
        } catch (error) {
            console.error('[ShipActionImmune] Error:', error);
            return res.status(500).json({ error: 'Failed to apply immune', details: error.errorMessage || error.message });
        }
    });

    /**
     * API: Ship action shield (ally protection)
     * POST /api/ship-action-shield
     */
    app.post('/api/ship-action-shield', async (req, res) => {
        const { attackerId, targets, durationMs, shieldFactor } = req.body || {};
        if (!attackerId || !Array.isArray(targets) || targets.length === 0) {
            return res.status(400).json({ error: 'attackerId and targets are required' });
        }
        const durationValue = Number(durationMs);
        if (!Number.isFinite(durationValue) || durationValue <= 0) {
            return res.status(400).json({ error: 'durationMs must be a positive number' });
        }
        const factorRaw = Number.isFinite(Number(shieldFactor)) ? Number(shieldFactor) : 0.6;
        const factorValue = Math.min(1, Math.max(0.2, factorRaw));

        try {
            const attackerNationResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: attackerId,
                Keys: ['Nation']
            });
            const attackerNation = String(attackerNationResult?.Data?.Nation?.Value || '').trim().toLowerCase();
            const shieldUntil = Date.now() + durationValue;

            const results = [];
            for (const targetId of targets) {
                if (!targetId) continue;
                if (targetId === attackerId) {
                    await shipsCollection.doc(targetId).set({
                        shieldUntil,
                        shieldFactor: factorValue,
                        shieldSource: attackerId,
                        shieldUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    results.push({ playFabId: targetId, shieldUntil, shieldFactor: factorValue });
                    continue;
                }

                const defenderNationResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                    PlayFabId: targetId,
                    Keys: ['Nation']
                });
                const defenderNation = String(defenderNationResult?.Data?.Nation?.Value || '').trim().toLowerCase();
                if (attackerNation && defenderNation && attackerNation !== defenderNation) {
                    results.push({ playFabId: targetId, skipped: true, reason: 'different_nation' });
                    continue;
                }

                await shipsCollection.doc(targetId).set({
                    shieldUntil,
                    shieldFactor: factorValue,
                    shieldSource: attackerId,
                    shieldUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                results.push({ playFabId: targetId, shieldUntil, shieldFactor: factorValue });
            }

            return res.json({ success: true, results });
        } catch (error) {
            console.error('[ShipActionShield] Error:', error);
            return res.status(500).json({ error: 'Failed to apply ship action shield', details: error.errorMessage || error.message });
        }
    });

    /**
     * API: Respawn ship to a safe position
     * POST /api/respawn-ship
     */
    app.post('/api/respawn-ship', async (req, res) => {
        const { playFabId, shipId, reason } = req.body || {};
        if (!playFabId || !shipId) return res.status(400).json({ error: 'playFabId and shipId are required' });

        try {
            const position = await respawnShip(playFabId, shipId, reason || 'manual');
            res.json({ success: true, position });
        } catch (error) {
            console.error('[RespawnShip] Error:', error);
            res.status(500).json({ error: 'Failed to respawn ship', details: error.errorMessage || error.message });
        }
    });

    /**
     * API: 船の資産データを取得（変更なし）
     * POST /api/get-ship-asset
     */
    app.post('/api/get-ship-asset', async (req, res) => {
        const { playFabId, shipId } = req.body;

        if (!playFabId || !shipId) {
            return res.status(400).json({ error: 'playFabId and shipId are required' });
        }

        try {
            const parsedPlayFabId = extractPlayFabIdFromShipId(shipId);
            let ownerPlayFabId = isLikelyPlayFabId(parsedPlayFabId) ? parsedPlayFabId : null;

            if (!ownerPlayFabId && isLikelyPlayFabId(playFabId)) {
                ownerPlayFabId = playFabId;
            }

            if (!ownerPlayFabId) {
                const shipDoc = await shipsCollection.doc(shipId).get();
                const shipData = shipDoc.exists ? (shipDoc.data() || {}) : {};
                if (isLikelyPlayFabId(shipData.playFabId)) {
                    ownerPlayFabId = shipData.playFabId;
                }
            }

            if (!ownerPlayFabId) {
                ownerPlayFabId = playFabId;
            }

            console.log('[GetShipAsset] resolve owner', { shipId, playFabId, ownerPlayFabId });
            const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: ownerPlayFabId,
                Keys: [`Ship_${shipId}`]
            });

            if (!result.Data || !result.Data[`Ship_${shipId}`]) {
                return res.json({ success: false, missing: true, shipData: null });
            }

            const shipData = applyShipLevelToShipData(JSON.parse(result.Data[`Ship_${shipId}`].Value));
            res.json({ success: true, shipData: shipData });

        } catch (error) {
            if (error && (error.errorCode === 1001 || error.error === 'User not found')) {
                return res.json({ success: false, missing: true, shipData: null });
            }
            console.error('[GetShipAsset] Error:', error);
            res.status(500).json({ error: 'Failed to get ship asset', details: error.errorMessage || error.message });
        }
    });

    /**
     * API: 船の軽量アセットデータを取得（変更なし）
     * POST /api/get-ship-asset-light
     */
    app.post('/api/get-ship-asset-light', async (req, res) => {
        const { playFabId, shipId } = req.body;

        if (!playFabId || !shipId) {
            return res.status(400).json({ error: 'playFabId and shipId are required' });
        }

        try {
            const parsedPlayFabId = extractPlayFabIdFromShipId(shipId);
            let ownerPlayFabId = isLikelyPlayFabId(parsedPlayFabId) ? parsedPlayFabId : null;

            if (!ownerPlayFabId && isLikelyPlayFabId(playFabId)) {
                ownerPlayFabId = playFabId;
            }

            if (!ownerPlayFabId) {
                const shipDoc = await shipsCollection.doc(shipId).get();
                const shipData = shipDoc.exists ? (shipDoc.data() || {}) : {};
                if (isLikelyPlayFabId(shipData.playFabId)) {
                    ownerPlayFabId = shipData.playFabId;
                }
            }

            if (!ownerPlayFabId) {
                ownerPlayFabId = playFabId;
            }

            console.log('[GetShipAssetLight] resolve owner', { shipId, playFabId, ownerPlayFabId });
            const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: ownerPlayFabId,
                Keys: [`Ship_${shipId}`]
            });

            if (!result.Data || !result.Data[`Ship_${shipId}`]) {
                return res.json({ success: false, missing: true, shipData: null });
            }

            const fullShipData = applyShipLevelToShipData(JSON.parse(result.Data[`Ship_${shipId}`].Value));

            const lightShipData = {
                ShipId: fullShipData.ShipId,
                ShipType: fullShipData.ShipType,
                Stats: fullShipData.Stats,
                Owner: fullShipData.Owner
            };

            res.json({ success: true, shipData: lightShipData });

        } catch (error) {
            if (error && (error.errorCode === 1001 || error.error === 'User not found')) {
                return res.json({ success: false, missing: true, shipData: null });
            }
            console.error('[GetShipAssetLight] Error:', error);
            res.status(500).json({ error: 'Failed to get ship asset (light)', details: error.errorMessage || error.message });
        }
    });

    /**
     * API: 船の位置データを取得（変更なし）
     * POST /api/get-ship-position
     */
    app.post('/api/get-ship-position', async (req, res) => {
        const { shipId } = req.body;

        if (!shipId) {
            return res.status(400).json({ error: 'shipId is required' });
        }

        try {
            const doc = await db.collection('ships').doc(shipId).get();

            if (!doc.exists) {
                return res.status(404).json({ error: 'Ship position not found' });
            }

            res.json({ success: true, positionData: doc.data() });

        } catch (error) {
            console.error('[GetShipPosition] Error:', error);
            res.status(500).json({ error: 'Failed to get ship position', details: error.message });
        }
    });

    /**
     * API: NPC船の航海を開始
     * POST /api/start-ship-voyage
     */
    app.post('/api/start-ship-voyage', async (req, res) => {
        const { shipId, destination, isNpc, shipSpeed } = req.body;

        if (!isNpc) {
            return res.status(403).json({ error: 'PlayerVoyageNotAllowed' });
        }
        if (!shipId || !destination) {
            return res.status(400).json({ error: 'shipId and destination are required' });
        }
        const speedValue = Number(shipSpeed);
        if (!Number.isFinite(speedValue) || speedValue <= 0) {
            return res.status(400).json({ error: 'shipSpeed is required' });
        }

        try {
            const shipDoc = await db.collection('ships').doc(shipId).get();
            if (!shipDoc.exists) {
                return res.status(404).json({ error: 'Ship position not found' });
            }

            const currentPos = shipDoc.data().position;

            const distance = Math.sqrt(
                Math.pow(destination.x - currentPos.x, 2) +
                Math.pow(destination.y - currentPos.y, 2)
            );
            const travelTimeSeconds = distance / speedValue;
            const departureTime = Date.now();
            const arrivalTime = departureTime + (travelTimeSeconds * 1000);

            const destinationGeo = worldToLatLng(destination);
            const destinationGeohash = geohashForLocation([destinationGeo.lat, destinationGeo.lng]);

            await db.collection('ships').doc(shipId).update({
                geohash: destinationGeohash,
                movement: {
                    isMoving: true,
                    departureTime: departureTime,
                    arrivalTime: arrivalTime,
                    departurePos: currentPos,
                    destinationPos: destination
                },
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`[StartShipVoyage] Updated geohash to ${destinationGeohash}`);
            console.log(`[StartShipVoyage] Ship ${shipId} departing from (${currentPos.x}, ${currentPos.y}) to (${destination.x}, ${destination.y}), ETA: ${travelTimeSeconds.toFixed(1)}s`);

            res.json({
                success: true,
                departureTime: departureTime,
                arrivalTime: arrivalTime,
                travelTimeSeconds: travelTimeSeconds,
                distance: distance
            });

        } catch (error) {
            console.error('[StartShipVoyage] Error:', error);
            res.status(500).json({ error: 'Failed to start ship voyage', details: error.message });
        }
    });

    /**
     * API: 船を停止（変更なし）
     * POST /api/stop-ship
     */
    app.post('/api/stop-ship', async (req, res) => {
        const { shipId } = req.body;

        if (!shipId) {
            return res.status(400).json({ error: 'shipId is required' });
        }

        try {
            const shipDoc = await db.collection('ships').doc(shipId).get();
            if (!shipDoc.exists) {
                return res.status(404).json({ error: 'Ship not found' });
            }

            const shipData = shipDoc.data();
            const movement = shipData.movement;

            const currentPos = calculateCurrentPosition(movement);

            const stoppedGeo = worldToLatLng(currentPos);
            const stoppedGeohash = geohashForLocation([stoppedGeo.lat, stoppedGeo.lng]);

            await db.collection('ships').doc(shipId).update({
                position: currentPos,
                geohash: stoppedGeohash,
                movement: {
                    isMoving: false,
                    departureTime: null,
                    arrivalTime: null,
                    departurePos: null,
                    destinationPos: null
                },
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`[StopShip] Ship ${shipId} stopped at (${currentPos.x}, ${currentPos.y}), geohash: ${stoppedGeohash}`);
            res.json({ success: true, currentPosition: currentPos });

        } catch (error) {
            console.error('[StopShip] Error:', error);
            res.status(500).json({ error: 'Failed to stop ship', details: error.message });
        }
    });

    /**
     * API: プレイヤーの全船情報を取得（変更なし）
     * POST /api/get-player-ships
     */
    app.post('/api/get-player-ships', async (req, res) => {
        const { playFabId } = req.body;

        if (!playFabId) {
            return res.status(400).json({ error: 'playFabId is required' });
        }

        try {
            const activeShipId = await getActiveShipId(playFabId);
            const shipsSnapshot = await db.collection('ships').where('playFabId', '==', playFabId).get();

            const ships = [];
            for (const doc of shipsSnapshot.docs) {
                const firestoreData = doc.data();

                // docId=playFabId の「プレイヤー位置用ドキュメント」を除外
                if (typeof doc.id === 'string' && !doc.id.startsWith('ship_')) continue;
                if (typeof firestoreData.shipId !== 'string' || !firestoreData.shipId.startsWith('ship_')) continue;

                const assetResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                    PlayFabId: playFabId,
                    Keys: [`Ship_${firestoreData.shipId}`]
                });

                let assetData = null;
                if (assetResult.Data && assetResult.Data[`Ship_${firestoreData.shipId}`]) {
                    assetData = applyShipLevelToShipData(JSON.parse(assetResult.Data[`Ship_${firestoreData.shipId}`].Value));
                }

                const currentPos = calculateCurrentPosition(firestoreData.movement);

                ships.push({
                    shipId: firestoreData.shipId,
                    assetData: assetData,
                    positionData: firestoreData,
                    currentPosition: currentPos,
                    isActive: !!activeShipId && firestoreData.shipId === activeShipId
                });
            }

            res.json({ success: true, ships: ships, activeShipId: activeShipId });

        } catch (error) {
            console.error('[GetPlayerShips] Error:', error);
            res.status(500).json({ error: 'Failed to get player ships', details: error.message });
        }
    });

    /**
     * API: 視界内の船情報を取得（変更なし）
     * POST /api/get-ships-in-view
     */
    app.post('/api/get-ships-in-view', async (req, res) => {
        const { centerX, centerY, radius, mapId } = req.body;

        if (centerX === undefined || centerY === undefined || !radius) {
            return res.status(400).json({ error: 'centerX, centerY, radius are required' });
        }

        try {
            const center = [centerY, centerX];
            const radiusInM = radius * 100;
            const bounds = geohashQueryBounds(center, radiusInM);
            console.log(`[GetShipsInView] Geohash bounds for radius ${radius}:`, bounds.length, 'queries');

            const promises = [];
            for (const b of bounds) {
                let q = db.collection('ships');
                if (mapId) {
                    q = q.where('mapId', '==', mapId);
                }
                q = q.orderBy('geohash')
                    .startAt(b[0])
                    .endAt(b[1]);
                promises.push(q.get());
            }

            const snapshots = await Promise.all(promises);
            const shipsInView = [];

            for (const snapshot of snapshots) {
                for (const doc of snapshot.docs) {
                    const shipData = doc.data();
                    const currentPos = calculateCurrentPosition(shipData.movement) || shipData.position || { x: 0, y: 0 };

                    const distance = Math.sqrt(
                        Math.pow(currentPos.x - centerX, 2) +
                        Math.pow(currentPos.y - centerY, 2)
                    );

                    if (distance <= radius) {
                        if (!shipsInView.find(s => s.shipId === shipData.shipId)) {
                            shipsInView.push({
                                shipId: shipData.shipId,
                                playFabId: shipData.playFabId,
                                position: currentPos,
                                appearance: shipData.appearance,
                                movement: shipData.movement
                            });
                        }
                    }
                }
            }
            console.log(`[GetShipsInView] Found ${shipsInView.length} ships in view (optimized with geohash)`);
            res.json({ success: true, ships: shipsInView });

        } catch (error) {
            console.error('[GetShipsInView] Error:', error);
            res.status(500).json({ error: 'Failed to get ships in view', details: error.message });
        }
    });

    /**
     * ユーティリティ: 現在位置計算（変更なし）
     */
    function calculateCurrentPosition(movement) {
        if (!movement || !movement.isMoving) {
            return movement?.departurePos || null;
        }

        const now = Date.now();
        const { departureTime, arrivalTime, departurePos, destinationPos } = movement;

        if (now >= arrivalTime) {
            return destinationPos;
        }
        if (!departurePos || !destinationPos) return null;

        const totalTime = arrivalTime - departureTime;
        const elapsedTime = now - departureTime;
        const progress = totalTime > 0 ? elapsedTime / totalTime : 0;

        const currentX = departurePos.x + (destinationPos.x - departurePos.x) * progress;
        const currentY = departurePos.y + (destinationPos.y - departurePos.y) * progress;

        return { x: currentX, y: currentY };
    }

    // ( ... 島関連のAPIエンドポイントは変更なし ... )
    // ( この部分は省略 )
    
    app.locals.calculateCurrentPosition = calculateCurrentPosition;
}

module.exports = { initializeShipRoutes };
