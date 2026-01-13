// server.js (v43 - Modularized)

require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const line = require('@line/bot-sdk');
const admin = require('firebase-admin');
const { geohashForLocation } = require('geofire-common');

// PlayFab モジュール
const {
    PlayFab,
    PlayFabServer,
    PlayFabAdmin,
    PlayFabAuthentication,
    PlayFabGroups,
    PlayFabEconomy,
    configurePlayFab,
    promisifyPlayFab,
    ensureTitleEntityToken,
    getGroupDataValue,
    setGroupDataValues,
    getEntityKeyFromPlayFabId
} = require('./server/playfab');

// 分割モジュール
const economy = require('./server/economy');
const building = require('./server/building');
const nation = require('./server/nation');
const island = require('./server/island');
const inventory = require('./server/inventory');
const shop = require('./server/shop');
const mapModule = require('./server/map');
const chat = require('./server/chat');

// 既存ルート
const battleRoutes = require('./server/routes/battleRoutes');
const guildRoutes = require('./server/routes/guildRoutes');
const shipRoutes = require('./server/routes/shipRoutes');

const PORT = process.env.PORT || 8080;
const VIRTUAL_CURRENCY_CODE = economy.VIRTUAL_CURRENCY_CODE;
const LEADERBOARD_NAME = economy.LEADERBOARD_NAME;
const BATTLE_REWARD_POINTS = Number(process.env.BATTLE_REWARD_POINTS || 10);
const GACHA_CATALOG_VERSION = inventory.GACHA_CATALOG_VERSION;

// Firebase Admin SDK 初期化
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
let serviceAccount = null;

if (serviceAccountJson) {
    serviceAccount = JSON.parse(serviceAccountJson);
} else {
    serviceAccount = require('./config/firebase-service-account.json');
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://my-liff-app-ee704-default-rtdb.firebaseio.com"
});

const firestore = admin.firestore();

app.use(express.json());

configurePlayFab({
    titleId: process.env.PLAYFAB_TITLE_ID,
    secretKey: process.env.PLAYFAB_SECRET_KEY
});

const lineClient = new line.Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

// 静的ファイル
app.use(express.static(path.join(__dirname, 'public')));

// CSP
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://static.line-scdn.net https://download.playfab.com; " +
        "style-src 'self' 'unsafe-inline' https://www.gstatic.com; " +
        "img-src 'self' data: https://profile.line-scdn.net; " +
        "connect-src 'self' https://api.line.me; " +
        "frame-src 'self' https://liff.line.me;"
    );
    next();
});

// geofire-common ESM
app.get('/vendor/geofire-common/index.esm.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'node_modules', 'geofire-common', 'dist', 'geofire-common', 'index.esm.js'));
});

// カタログキャッシュ
let catalogCache = {};
let catalogAliasMap = {};
let catalogCurrencyMap = {};

function normalizeEntityKey(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = raw.Id || raw.id || raw.EntityId || raw.entityId;
    const type = raw.Type || raw.type || raw.EntityType || raw.entityType;
    if (!id || !type) return null;
    return { Id: String(id), Type: String(type) };
}

function getEntityKeyFromToken(entityToken) {
    if (!entityToken || typeof entityToken !== 'string') return null;
    const parts = entityToken.split('.');
    if (parts.length < 2) return null;
    try {
        const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = payload.padEnd(payload.length + (4 - (payload.length % 4)) % 4, '=');
        const decoded = Buffer.from(padded, 'base64').toString('utf8');
        const data = JSON.parse(decoded);
        return normalizeEntityKey({
            Id: data?.entityId || data?.EntityId,
            Type: data?.entityType || data?.EntityType
        });
    } catch {
        return null;
    }
}

function normalizePriceAmounts(item) {
    const totals = {};
    const pushAmount = (itemId, amount) => {
        const rawId = String(itemId || '').trim();
        const id = (rawId === 'PT' || rawId === 'GO') ? 'PS' : rawId;
        const value = Number(amount);
        if (!id || !Number.isFinite(value) || value <= 0) return;
        totals[id] = (totals[id] || 0) + value;
    };

    if (Array.isArray(item?.PriceAmounts)) {
        item.PriceAmounts.forEach((entry) => {
            pushAmount(entry?.ItemId || entry?.itemId, entry?.Amount ?? entry?.amount);
        });
    }

    if (Object.keys(totals).length === 0 && Array.isArray(item?.PriceOptions?.Prices)) {
        item.PriceOptions.Prices.forEach((price) => {
            const priceAmounts = Array.isArray(price?.Amounts) ? price.Amounts : [];
            priceAmounts.forEach((entry) => {
                pushAmount(entry?.ItemId || entry?.itemId, entry?.Amount ?? entry?.amount);
            });
        });
    }

    if (Object.keys(totals).length === 0 && item?.VirtualCurrencyPrices && typeof item.VirtualCurrencyPrices === 'object') {
        Object.entries(item.VirtualCurrencyPrices).forEach(([code, amount]) => {
            pushAmount(code, amount);
        });
    }

    return Object.entries(totals).map(([id, amount]) => ({ ItemId: id, Amount: amount }));
}

// カタログ読み込み
async function loadCatalogCache() {
    console.log('[カタログ] PlayFab Economy V2 カタログの読み込みを開始します...');
    try {
        await ensureTitleEntityToken();
        const items = [];
        let token = null;
        do {
            const result = await promisifyPlayFab(PlayFabEconomy.SearchItems, {
                Count: 50,
                ContinuationToken: token || undefined
            });
            const page = Array.isArray(result?.Items) ? result.Items : [];
            items.push(...page);
            token = result?.ContinuationToken || null;
            console.log(`[カタログ] ページ取得: ${page.length}件 (累計: ${items.length}件)`);
        } while (token);

        const pickLocalizedText = (entry) => {
            if (!entry) return '';
            if (typeof entry === 'string') return entry;
            return entry['ja-JP'] || entry.NEUTRAL || entry.en || Object.values(entry)[0] || '';
        };
        const normalizeCurrencyCode = (value) => {
            const raw = String(value || '').trim();
            if (!raw) return null;
            if (/^[A-Za-z0-9]{1,3}$/.test(raw)) {
                return raw.toUpperCase();
            }
            return raw;
        };
        const pickAlternateCurrencyId = (entry) => {
            if (!Array.isArray(entry?.AlternateIds)) return null;
            for (const alt of entry.AlternateIds) {
                const normalized = normalizeCurrencyCode(alt?.Value);
                if (!normalized) continue;
                if (/^[A-Z0-9]{1,3}$/.test(normalized)) return normalized;
            }
            return null;
        };

        const itemMap = {};
        const aliasMap = {};
        const currencyMap = {};
        items.forEach((item) => {
            let customData = {};
            const displayProps = item?.DisplayProperties ?? item?.CustomData ?? null;
            if (displayProps) {
                try {
                    const parsed = typeof displayProps === 'string'
                        ? JSON.parse(displayProps)
                        : displayProps;
                    if (parsed && typeof parsed === 'object') {
                        for (const [key, value] of Object.entries(parsed)) {
                            const normalizedKey = String(key).trim();
                            if (!normalizedKey) continue;
                            try {
                                customData[normalizedKey] = typeof value === 'string' ? JSON.parse(value) : value;
                            } catch {
                                customData[normalizedKey] = value;
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[カタログ] ItemID ${item?.Id} のDisplayPropertiesパースに失敗しました。`, e?.message || e);
                }
            }

            const displayName = pickLocalizedText(item?.Title) || item?.DisplayName || item?.Id;
            const description = pickLocalizedText(item?.Description) || '';
            const resolvedFriendlyId = normalizeCurrencyCode(item.FriendlyId) || pickAlternateCurrencyId(item) || null;
            itemMap[item.Id] = {
                ItemId: item.Id,
                ItemClass: item.ContentType || item.Type,
                FriendlyId: resolvedFriendlyId,
                DisplayName: displayName,
                Description: description,
                PriceAmounts: normalizePriceAmounts(item),
                ...customData
            };

            const contentType = String(item?.ContentType || item?.Type || '').toLowerCase();
            if (contentType === 'currency') {
                if (resolvedFriendlyId) {
                    currencyMap[item.Id] = resolvedFriendlyId;
                }
            }

            const aliases = new Set();
            if (item?.Id) aliases.add(String(item.Id));
            if (item?.FriendlyId) aliases.add(String(item.FriendlyId));
            if (resolvedFriendlyId) aliases.add(String(resolvedFriendlyId));
            if (Array.isArray(item?.AlternateIds)) {
                item.AlternateIds.forEach((entry) => {
                    if (entry?.Value) aliases.add(String(entry.Value));
                });
            }
            aliases.forEach((alias) => {
                if (alias && !aliasMap[alias]) {
                    aliasMap[alias] = item.Id;
                }
            });
        });

        catalogCache = itemMap;
        catalogAliasMap = aliasMap;
        catalogCurrencyMap = currencyMap;
        console.log(`[カタログ] 読み込み完了: ${Object.keys(catalogCache).length} 件のアイテムをキャッシュしました。`);
        const shipCount = Object.values(catalogCache).filter(i => i.ItemClass === 'Ship').length;
        console.log(`[カタログ] 内訳確認: Ship = ${shipCount} 件`);
        console.log(`[カタログ] 内訳確認: Currency = ${Object.keys(catalogCurrencyMap).length} 件`);
    } catch (error) {
        console.error('[カタログ] エラー: カタログの読み込みに失敗しました。', error?.errorMessage || error?.message || error);
        process.exit(1);
    }
}

function resolveCatalogItemId(itemId) {
    if (!itemId) return itemId;
    const key = String(itemId);
    return catalogAliasMap[key] || itemId;
}

// 依存関係オブジェクト
function createDependencies() {
    return {
        promisifyPlayFab,
        PlayFabServer,
        PlayFabAdmin,
        PlayFabGroups,
        PlayFabEconomy,
        firestore,
        admin,
        catalogCache,
        catalogCurrencyMap,
        ensureTitleEntityToken,
        getGroupDataValue,
        setGroupDataValues,
        getEntityKeyFromPlayFabId,
        NATION_GROUP_BY_RACE: nation.NATION_GROUP_BY_RACE,
        // economy関数
        getEntityKeyForPlayFabId: (playFabId) => economy.getEntityKeyForPlayFabId(playFabId, { getEntityKeyFromPlayFabId }),
        getAllInventoryItems: (entityKey) => economy.getAllInventoryItems(entityKey, { promisifyPlayFab, PlayFabEconomy }),
        getVirtualCurrencyMap: (items) => economy.getVirtualCurrencyMap(items, { catalogCurrencyMap, catalogCache }),
        addEconomyItem: (playFabId, itemId, amount, entityKeyOverride) => economy.addEconomyItem(playFabId, itemId, amount, { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId, entityKeyOverride, resolveItemId: resolveCatalogItemId }),
        subtractEconomyItem: (playFabId, itemId, amount, entityKeyOverride) => economy.subtractEconomyItem(playFabId, itemId, amount, { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId, entityKeyOverride, resolveItemId: resolveCatalogItemId }),
        getCurrencyBalance: (playFabId, currencyId) => economy.getCurrencyBalance(playFabId, currencyId, { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId, catalogCurrencyMap, catalogCache }),
        applyTax: economy.applyTax,
        // nation関数
        getNationTaxRateBps: (nation, fs, d) => require('./server/nation').getNationTaxRateBps(nation, fs || firestore, d || createDependencies()),
        addNationTreasury: (nation, amount, fs, d) => require('./server/nation').addNationTreasury(nation, amount, fs || firestore, d || createDependencies()),
        // island関数
        transferOwnedIslands: (fs, fromId, toId, toNation) => island.transferOwnedIslands(fs, fromId, toId, toNation, { promisifyPlayFab, PlayFabServer }),
        createStarterIsland: createStarterIsland,
        relocateActiveShip: (fs, playFabId, pos) => island.relocateActiveShip(fs, playFabId, pos, { promisifyPlayFab, PlayFabServer, admin })
    };
}

// スターター島作成（認証時に必要）
async function createStarterIsland({ playFabId, raceName, nationIsland, displayName }) {
    const MAP_SIZE = 100;
    const AREA_BY_NATION = {
        fire: 'wands',
        earth: 'pentacles',
        wind: 'swords',
        water: 'cups',
        neutral: 'joker'
    };

    const sizeByKey = {
        small: { w: 3, h: 3 },
        medium: { w: 4, h: 3 },
        large: { w: 4, h: 4 },
        giant: { w: 5, h: 5 }
    };
    const islandSize = sizeByKey.small;

    const mapId = AREA_BY_NATION[String(nationIsland || '').toLowerCase()] || 'joker';
    const mapBounds = { minX: 0, maxX: MAP_SIZE - 1, minY: 0, maxY: MAP_SIZE - 1 };
    const offsetRange = 6;
    const baseRange = {
        minX: mapBounds.minX,
        maxX: Math.max(mapBounds.minX, mapBounds.maxX - islandSize.w + 1),
        minY: mapBounds.minY,
        maxY: Math.max(mapBounds.minY, mapBounds.maxY - islandSize.h + 1)
    };

    const worldMap = firestore.collection(`world_map_${mapId}`);
    const allCollections = await firestore.listCollections();
    const mapCollections = allCollections.filter((col) => String(col.id || '').startsWith('world_map'));

    let hasExisting = false;
    for (const col of mapCollections) {
        const snap = await col.where('ownerId', '==', playFabId).limit(1).get();
        if (!snap.empty) {
            hasExisting = true;
            break;
        }
    }
    if (hasExisting) return { skipped: true, reason: 'already_has_island' };

    const allIslandsSnap = await worldMap.get();
    const occupied = [];
    const nationIslands = [];
    allIslandsSnap.forEach(doc => {
        const data = doc.data() || {};
        const coord = data.coordinate || {};
        const sizeKey = data.size || 'small';
        const size = sizeByKey[sizeKey] || sizeByKey.small;
        if (Number.isFinite(coord.x) && Number.isFinite(coord.y)) {
            occupied.push({ x: coord.x, y: coord.y, w: size.w, h: size.h });
            if (nationIsland && data.biome === nationIsland) {
                nationIslands.push({ x: coord.x, y: coord.y, biomeFrame: data.biomeFrame ?? null });
            }
        }
    });

    const overlaps = (rect) => {
        return occupied.some(o => rect.x < o.x + o.w && rect.x + rect.w > o.x && rect.y < o.y + o.h && rect.y + rect.h > o.y);
    };

    let chosen = null;
    let chosenBiomeFrame = null;
    for (let i = 0; i < 80; i++) {
        const base = nationIslands.length > 0
            ? nationIslands[Math.floor(Math.random() * nationIslands.length)]
            : occupied[Math.floor(Math.random() * occupied.length)];
        const bx = base?.x ?? Math.floor(Math.random() * (baseRange.maxX - baseRange.minX + 1)) + baseRange.minX;
        const by = base?.y ?? Math.floor(Math.random() * (baseRange.maxY - baseRange.minY + 1)) + baseRange.minY;
        const rx = Math.max(baseRange.minX, Math.min(baseRange.maxX, bx + Math.floor(Math.random() * (offsetRange * 2 + 1)) - offsetRange));
        const ry = Math.max(baseRange.minY, Math.min(baseRange.maxY, by + Math.floor(Math.random() * (offsetRange * 2 + 1)) - offsetRange));
        const rect = { x: rx, y: ry, w: islandSize.w, h: islandSize.h };
        if (!overlaps(rect)) {
            chosen = { x: rx, y: ry };
            chosenBiomeFrame = base?.biomeFrame ?? null;
            break;
        }
    }

    if (!chosen) {
        return { skipped: true, reason: 'no_space' };
    }

    const islandName = `${displayName || 'Player'}の島`;
    const docRef = worldMap.doc();
    const islandLevel = 1;
    const islandData = {
        id: docRef.id,
        coordinate: { x: chosen.x, y: chosen.y },
        name: islandName,
        size: 'small',
        islandLevel: islandLevel,
        ownerId: playFabId,
        ownerNation: nationIsland || null,
        biome: nationIsland || null,
        biomeFrame: chosenBiomeFrame,
        starterIsland: true,
        buildingSlots: { layout: '1x1' },
        buildings: []
    };

    await docRef.set(islandData);
    try {
        await island.addOwnedMapId(playFabId, mapId, { promisifyPlayFab, PlayFabServer });
    } catch (e) {
        console.warn('[createStarterIsland] Failed to update OwnedMapIds:', e?.errorMessage || e?.message || e);
    }

    const baseX = chosen.x + Math.floor(islandSize.w / 2);
    const baseY = chosen.y + Math.floor(islandSize.h / 2);
    let respawnTileX = baseX;
    let respawnTileY = baseY;
    for (let i = 0; i < 12; i++) {
        const dx = Math.floor(Math.random() * 9) - 4;
        const dy = Math.floor(Math.random() * 9) - 4;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) continue;
        const tx = Math.max(0, Math.min(MAP_SIZE - 1, baseX + dx));
        const ty = Math.max(0, Math.min(MAP_SIZE - 1, baseY + dy));
        const inside = (tx >= chosen.x && tx < chosen.x + islandSize.w && ty >= chosen.y && ty < chosen.y + islandSize.h);
        if (!inside) {
            respawnTileX = tx;
            respawnTileY = ty;
            break;
        }
    }
    const respawnPosition = { x: (respawnTileX + 0.5) * 32, y: (respawnTileY + 0.5) * 32 };
    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: { RespawnPosition: JSON.stringify(respawnPosition) }
    });

    return { created: true, islandId: docRef.id, name: islandName, mapId, respawnPosition };
}

// スターター船確保
async function ensureStarterShip({ playFabId, respawnPosition }) {
    const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: ['ActiveShipId', 'AvatarColor', 'Nation']
    });
    let activeShipId = ro?.Data?.ActiveShipId?.Value || null;
    const avatarColor = ro?.Data?.AvatarColor?.Value || 'brown';

    const shipSpec = catalogCache?.ship_common_boat || null;
    const shipBaseFrame = Number(shipSpec?.baseFrame);
    const shipDomain = shipSpec?.Domain || 'sea_surface';
    const shipStats = {
        MaxHP: Number(shipSpec?.MaxHP) || 100,
        CurrentHP: Number(shipSpec?.MaxHP) || 100,
        Speed: Number(shipSpec?.Speed) || 100,
        CargoCapacity: Number(shipSpec?.CargoCapacity) || 5,
        CrewCapacity: Number(shipSpec?.CrewCapacity) || 1,
        VisionRange: Number(shipSpec?.VisionRange) || 300
    };

    let shipData = null;
    if (activeShipId) {
        const key = `Ship_${activeShipId}`;
        const shipRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: [key]
        });
        const raw = shipRo?.Data?.[key]?.Value;
        if (raw) {
            try { shipData = JSON.parse(raw); } catch { shipData = null; }
        }
    }

    if (!activeShipId || !shipData) {
        activeShipId = activeShipId || `ship_${playFabId}_${Date.now()}`;
        shipData = {
            ShipId: activeShipId,
            ShipType: shipSpec?.DisplayName || 'Common Boat',
            ItemId: 'ship_common_boat',
            baseFrame: Number.isFinite(shipBaseFrame) ? Math.max(0, Math.trunc(shipBaseFrame)) : 0,
            Domain: shipDomain,
            Stats: { ...shipStats },
            Skills: shipSpec?.Skills || [],
            Equipment: { Cannon: null, Sail: null, Hull: null, Anchor: null },
            Cargo: [],
            Crew: [{ PlayFabId: playFabId, Role: 'Captain' }],
            Owner: playFabId,
            CreatedAt: new Date().toISOString()
        };
    }

    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: {
            ActiveShipId: activeShipId,
            [`Ship_${activeShipId}`]: JSON.stringify(shipData)
        }
    });

    const position = respawnPosition || { x: 100, y: 100 };
    const geoPoint = island.worldToLatLng(position);
    const geohash = geohashForLocation([geoPoint.lat, geoPoint.lng]);
    const firestoreShipData = {
        shipId: activeShipId,
        playFabId: playFabId,
        position: position,
        geohash: geohash,
        appearance: {
            shipType: shipData.ShipType || 'Common Boat',
            domain: shipDomain,
            color: String(avatarColor).toLowerCase(),
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

    await firestore.collection('ships').doc(activeShipId).set(firestoreShipData, { merge: true });
    await firestore.collection('ships').doc(playFabId).set({
        shipId: activeShipId,
        playFabId: playFabId,
        active: true,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { shipId: activeShipId };
}

// スターターアセット
async function provisionStarterAssets({ playFabId, entityKey }) {
    const deps = createDependencies();
    try {
        if (entityKey?.Id && entityKey?.Type) {
            await promisifyPlayFab(PlayFabEconomy.AddInventoryItems, {
                Entity: { Id: entityKey.Id, Type: entityKey.Type },
                Item: { Id: 'ship_common_boat' },
                Amount: 1
            });
        } else {
            await deps.addEconomyItem(playFabId, 'ship_common_boat', 1);
        }
        return { granted: ['ship_common_boat'] };
    } catch (error) {
        console.warn('[starterAssets] Failed to grant ship_common_boat:', error?.errorMessage || error?.message || error);
        return { granted: [], error: error?.errorMessage || error?.message || String(error) };
    }
}

// ログインAPI
app.post('/api/login-playfab', async (req, res) => {
    const { lineUserId, displayName, pictureUrl } = req.body || {};
    if (!lineUserId) return res.status(400).json({ error: 'lineUserId is required' });

    try {
        const loginResult = await promisifyPlayFab(PlayFabServer.LoginWithCustomID, {
            CustomId: lineUserId,
            CreateAccount: true
        });

        const playFabId = loginResult?.PlayFabId;
        if (!playFabId) {
            return res.status(500).json({ error: 'PlayFab login failed' });
        }

        if (displayName) {
            try {
                await promisifyPlayFab(PlayFabAdmin.UpdateUserTitleDisplayName, {
                    PlayFabId: playFabId,
                    DisplayName: displayName
                });
            } catch (e) {
                console.warn('[login-playfab] UpdateUserTitleDisplayName failed:', e?.errorMessage || e?.message || e);
            }
        }

        if (pictureUrl) {
            try {
                await promisifyPlayFab(PlayFabServer.UpdateAvatarUrl, {
                    PlayFabId: playFabId,
                    ImageUrl: pictureUrl
                });
            } catch (e) {
                console.warn('[login-playfab] UpdateAvatarUrl failed:', e?.errorMessage || e?.message || e);
            }
        }

        try {
            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: playFabId,
                Data: { lineUserId: lineUserId }
            });
        } catch (e) {
            console.warn('[login-playfab] UpdateUserReadOnlyData failed:', e?.errorMessage || e?.message || e);
        }

        const readOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['Race', 'NationGroupId']
        });
        const needsRaceSelection = !(readOnly?.Data?.Race?.Value);

        const firebaseToken = await admin.auth().createCustomToken(playFabId);

        return res.json({
            playFabId,
            needsRaceSelection,
            firebaseToken
        });
    } catch (error) {
        console.error('[login-playfab] Error:', error?.errorMessage || error?.message || error);
        return res.status(500).json({ error: 'PlayFab login failed', details: error?.errorMessage || error?.message || error });
    }
});

// 種族設定API
app.post('/api/set-race', async (req, res) => {
        const { playFabId, raceName, displayName, isKing: isKingRequest } = req.body || {};
        const entityKey = normalizeEntityKey(req.body?.entityKey) || getEntityKeyFromToken(req.body?.entityToken);
    if (!playFabId || !raceName) return res.status(400).json({ error: 'playFabId and raceName are required' });
    console.log(`[set-race] ${playFabId} selected race ${raceName}`);

    let initialStats = {};
    let avatarData = {};
    const maxFaceIndex = 40;
    let maxSkinColorIndex = 1;

    switch (raceName) {
        case 'Human':
            initialStats = { "Level": 1, "HP": 5, "MaxHP": 5, "MP": 15, "MaxMP": 15, "ちから": 2, "みのまもり": 5, "すばやさ": 10, "かしこさ": 15, "きようさ": 10 };
            maxSkinColorIndex = 7;
            avatarData = { "AvatarColor": "red" };
            break;
        case 'Elf':
            initialStats = { "Level": 1, "HP": 5, "MaxHP": 5, "MP": 10, "MaxMP": 10, "ちから": 5, "みのまもり": 5, "すばやさ": 15, "かしこさ": 10, "きようさ": 15 };
            maxSkinColorIndex = 8;
            avatarData = { "AvatarColor": "purple" };
            break;
        case 'Orc':
            initialStats = { "Level": 1, "HP": 15, "MaxHP": 15, "MP": 2, "MaxMP": 2, "ちから": 15, "みのまもり": 15, "すばやさ": 2, "かしこさ": 2, "きようさ": 5 };
            maxSkinColorIndex = 4;
            avatarData = { "AvatarColor": "green" };
            break;
        case 'Goblin':
            initialStats = { "Level": 1, "HP": 5, "MaxHP": 5, "MP": 15, "MaxMP": 15, "ちから": 2, "みのまもり": 5, "すばやさ": 10, "かしこさ": 15, "きようさ": 10 };
            maxSkinColorIndex = 4;
            avatarData = { "AvatarColor": "blue" };
            break;
        default:
            return res.status(400).json({ error: 'Invalid raceName' });
    }

    try {
        const mapping = nation.NATION_GROUP_BY_RACE[raceName];
        if (!mapping) return res.status(400).json({ error: 'Invalid raceName' });
        const deps = createDependencies();
        let groupInfo = await nation.ensureNationGroupExists(firestore, mapping, deps);
        const playerEntity = entityKey && entityKey.Id && entityKey.Type ? entityKey : null;
        if (!playerEntity) {
            return res.status(400).json({ error: 'Failed to resolve player entity' });
        }

        let assignedGroupId = groupInfo.groupId;
        let assignedGroupName = groupInfo.groupName;
        const assignedNation = mapping.island;
        let isKing = !!isKingRequest || !!groupInfo.created;

        try {
            const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['Nation']
            });
            const prevNation = String(ro?.Data?.Nation?.Value || '').toLowerCase();
            if (prevNation && prevNation !== assignedNation) {
                const prevMapping = nation.getNationMappingByNation(prevNation);
                if (prevMapping) {
                    try {
                        const prevGroup = await nation.ensureNationGroupExists(firestore, prevMapping, deps);
                        await ensureTitleEntityToken();
                        await promisifyPlayFab(PlayFabGroups.RemoveMembers, {
                            Group: { Id: prevGroup.groupId, Type: 'group' },
                            Members: [playerEntity]
                        });
                    } catch (e) {
                        console.warn('[set-race] RemoveMembers failed:', e?.errorMessage || e?.message || e);
                    }
                }
            }

            await ensureTitleEntityToken();
            await promisifyPlayFab(PlayFabGroups.AddMembers, {
                Group: { Id: assignedGroupId, Type: 'group' },
                Members: [playerEntity]
            });

            if (isKing) {
                const docRef = await nation.getNationGroupDoc(firestore, mapping.groupName);
                await docRef.set({
                    kingPlayFabId: playFabId,
                    kingAssignedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
        } catch (e) {
            const msg = (e && (e.errorMessage || e.message)) ? (e.errorMessage || e.message) : String(e);
            if (!String(msg).includes('EntityIsAlreadyMember')) {
                return res.status(500).json({ error: 'Failed to assign nation group', details: msg });
            }
        }

        if (displayName) {
            try {
                await promisifyPlayFab(PlayFabAdmin.UpdateUserTitleDisplayName, {
                    PlayFabId: playFabId,
                    DisplayName: String(displayName)
                });
            } catch (e) {
                console.warn('[set-race] UpdateUserTitleDisplayName failed:', e?.errorMessage || e?.message || e);
            }
        }

        const nationData = {
            Nation: assignedNation,
            NationGroupId: assignedGroupId,
            NationGroupName: assignedGroupName
        };

        const statsPayload = Object.keys(initialStats).map(key => ({ StatisticName: key, Value: initialStats[key] }));
        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, { PlayFabId: playFabId, Statistics: statsPayload });

        avatarData.SkinColorIndex = Math.floor(Math.random() * maxSkinColorIndex) + 1;
        avatarData.FaceIndex = Math.floor(Math.random() * maxFaceIndex) + 1;
        avatarData.HairStyleIndex = Math.floor(Math.random() * 30) + 1;

        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: playFabId,
            Data: { "Race": raceName, ...avatarData, ...nationData, IsKing: isKing ? 'true' : 'false', NationKingId: isKing ? playFabId : '' }
        });

        let starterIsland = null;
        try {
            const collections = await firestore.listCollections();
            const mapCollections = collections.filter((col) => String(col.id || '').startsWith('world_map'));
            let hasExisting = false;
            for (const col of mapCollections) {
                const snapshot = await col.where('ownerId', '==', playFabId).limit(1).get();
                if (!snapshot.empty) {
                    hasExisting = true;
                    break;
                }
            }
            if (!hasExisting) {
                starterIsland = await createStarterIsland({
                    playFabId,
                    raceName,
                    nationIsland: nationData.Nation,
                    displayName: displayName || null
                });
            }
        } catch (e) {
            console.warn('[starterIsland] Failed to create starter island:', e?.errorMessage || e?.message || e);
        }

        const starterAssets = await provisionStarterAssets({ playFabId, entityKey });
        try {
            await addEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, 500, entityKey);
        } catch (e) {
            console.warn('[starterGrant] Failed to grant starter PS:', e?.errorMessage || e?.message || e);
        }

        try {
            await ensureStarterShip({
                playFabId,
                respawnPosition: starterIsland?.respawnPosition || null
            });
        } catch (e) {
            console.warn('[starterShip] Failed to ensure starter ship:', e?.errorMessage || e?.message || e);
        }

        res.json({
            status: 'success',
            selectedRace: raceName,
            nation: nationData,
            isKing: isKing,
            starterAssets,
            starterIsland
        });
    } catch (error) {
        console.error('[set-race] Error:', error.errorMessage || error.message);
        res.status(500).json({ error: 'Failed to set race', details: error.errorMessage || error.message });
    }
});

// サーバー起動
async function main() {
    await loadCatalogCache();

    // マップ初期化
    await mapModule.initializeMapData(firestore);

    // 共通定数
    const sharedConstants = {
        VIRTUAL_CURRENCY_CODE,
        LEADERBOARD_NAME,
        BATTLE_REWARD_POINTS,
        GACHA_CATALOG_VERSION
    };

    // 依存関係
    const deps = createDependencies();

    // 経済ルート
    economy.initializeEconomyRoutes(app, {
        promisifyPlayFab,
        PlayFabServer,
        PlayFabEconomy,
        getEntityKeyFromPlayFabId,
        catalogCache,
        catalogCurrencyMap,
        resolveItemId: resolveCatalogItemId
    });

    // 国家ルート
    nation.initializeNationRoutes(app, deps);

    // 島ルート
    island.initializeIslandRoutes(app, deps);

    // インベントリルート
    inventory.initializeInventoryRoutes(app, {
        promisifyPlayFab,
        PlayFabServer,
        PlayFabEconomy,
        catalogCache,
        getEntityKeyForPlayFabId: deps.getEntityKeyForPlayFabId,
        getAllInventoryItems: deps.getAllInventoryItems,
        getVirtualCurrencyMap: deps.getVirtualCurrencyMap,
        addEconomyItem: deps.addEconomyItem,
        subtractEconomyItem: deps.subtractEconomyItem,
        getCurrencyBalance: deps.getCurrencyBalance
    });

    // ショップルート
    shop.initializeShopRoutes(app, deps);

    // チャットルート
    chat.initializeChatRoutes(app);

    // バトルルート
    const db = admin.database();
    battleRoutes.initializeBattleRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabEconomy, lineClient, catalogCache, sharedConstants, db);

    // ギルドルート
    guildRoutes.initializeGuildRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabEconomy);

    // 船ルート
    shipRoutes.initializeShipRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabEconomy, catalogCache);

    app.listen(PORT, () => {
        console.log(`サーバーがポート ${PORT} で起動しました。http://localhost:${PORT}`);
    });
}

main();
