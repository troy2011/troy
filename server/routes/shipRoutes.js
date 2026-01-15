// ships.js - Server-side ship management with hybrid PlayFab/Firestore architecture

const admin = require('firebase-admin');
const { geohashForLocation, geohashQueryBounds, distanceBetween } = require('geofire-common');

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

function initializeShipRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabEconomy, catalogCache, resolveItemId) {
    const db = admin.firestore();
    const shipsCollection = db.collection('ships');
    const { getEntityKeyFromPlayFabId } = require('../playfab');
    const { addEconomyItem, subtractEconomyItem } = require('../economy');

    const economyDeps = { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId, resolveItemId };

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
    shipCatalog = Object.values(catalogCache).filter(item => item.ItemClass === 'Ship').reduce((obj, item) => {
        obj[item.ItemId] = {
            ...item,
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
     * Body: { playFabId, shipItemId, spawnPosition: { x, y } }
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

        if (!playFabId || !shipItemId || !spawnPosition) {
            return res.status(400).json({ error: 'playFabId, shipItemId, spawnPosition are required' });
        }
        if (!mapId || !islandId) {
            return res.status(400).json({ error: 'Capital island is required' });
        }

        const shipSpec = shipCatalog[shipItemId];
        if (!shipSpec) {
            return res.status(400).json({ error: `無効な shipItemId: ${shipItemId}` });
        }

        const priceAmounts = Array.isArray(shipSpec.PriceAmounts) ? shipSpec.PriceAmounts : [];
        const costsToPay = [];
        if (priceAmounts.length === 0 && shipSpec.VirtualCurrencyPrices) {
            for (const [code, amount] of Object.entries(shipSpec.VirtualCurrencyPrices)) {
                const value = Number(amount) || 0;
                if (value > 0) costsToPay.push({ ItemId: code, Amount: value });
            }
        } else {
            priceAmounts.forEach((entry) => {
                const code = entry?.ItemId || entry?.itemId;
                const amount = Number(entry?.Amount ?? entry?.amount ?? 0);
                if (!code || amount <= 0) return;
                costsToPay.push({ ItemId: code, Amount: amount });
            });
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

            const resolvedSpawnPosition = await findAvailableSpawnPosition(spawnPosition);

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
            shipData.Stats = {
                MaxHP: parseInt(shipSpec.MaxHP, 10),
                CurrentHP: parseInt(shipSpec.MaxHP, 10),
                Speed: parseInt(shipSpec.Speed, 10),
                CargoCapacity: parseInt(shipSpec.CargoCapacity, 10),
                CrewCapacity: parseInt(shipSpec.CrewCapacity, 10),
                VisionRange: resolvedVisionRange
            };
            shipData.Skills = shipSpec.Skills || [];
            shipData.Equipment = { Cannon: null, Sail: null, Hull: null, Anchor: null };
            shipData.Cargo = [];
            shipData.Crew = [{ PlayFabId: playFabId, Role: 'Captain' }];
            shipData.Owner = playFabId;
            shipData.CreatedAt = new Date().toISOString();

            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: playFabId,
                Data: {
                    [`Ship_${shipId}`]: JSON.stringify(shipData)
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

            res.json({ success: true, shipId: shipId, shipData: shipData, firestoreData: firestoreShipData });

        } catch (error) {
            console.error('[CreateShip] Error:', error);
            if (error.apiErrorInfo && error.apiErrorInfo.apiError === 'InsufficientFunds') {
                return res.status(402).json({ error: `建造費用が不足しています。(${cost} ${currencyCode} 必要)` });
            }
            res.status(500).json({ error: 'Failed to create ship', details: error.errorMessage || error.message });
        }
    });

    // ( ... 他のAPIエンドポイントは変更なし ... )

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
            const attackerShipId = attackerSummary.exists ? attackerSummary.data()?.shipId : null;
            const defenderShipId = defenderSummary.exists ? defenderSummary.data()?.shipId : null;
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

            const attackerShipData = JSON.parse(attackerShipDataRaw);
            const defenderShipData = JSON.parse(defenderShipDataRaw);
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
                attacker: { playFabId: attackerId, shipId: attackerShipId, hp: attackerShipData.Stats.CurrentHP, damageTaken: defenderDamage, respawned: attackerRespawn, respawnPosition: respawnResults[0] || null },
                defender: { playFabId: defenderId, shipId: defenderShipId, hp: defenderShipData.Stats.CurrentHP, damageTaken: attackerDamage, respawned: defenderRespawn, respawnPosition: respawnResults[1] || null },
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
                const defenderShipId = defenderSummary.exists ? defenderSummary.data()?.shipId : null;
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

                const defenderShipData = JSON.parse(defenderShipDataRaw);
                const defenderMaxHp = Number(defenderShipData?.Stats?.MaxHP) || 0;
                const defenderHp = Number(defenderShipData?.Stats?.CurrentHP);
                const nextDefenderHp = Math.max(0, (Number.isFinite(defenderHp) ? defenderHp : defenderMaxHp) - damageValue);
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
                    damageTaken: damageValue,
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

            const shipData = JSON.parse(result.Data[`Ship_${shipId}`].Value);
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

            const fullShipData = JSON.parse(result.Data[`Ship_${shipId}`].Value);

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
                    assetData = JSON.parse(assetResult.Data[`Ship_${firestoreData.shipId}`].Value);
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
