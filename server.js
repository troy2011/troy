// server.js (v42 - 航海バトル判定トリガーを追加)

require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const line = require('@line/bot-sdk');
// ★ v120: Firebase Admin SDK を追加
const admin = require('firebase-admin');
const { geohashForLocation } = require('geofire-common');

const PlayFab = require('playfab-sdk/Scripts/PlayFab/PlayFab');
const PlayFabServer = require('playfab-sdk/Scripts/PlayFab/PlayFabServer');
const PlayFabAdmin = require('playfab-sdk/Scripts/PlayFab/PlayFabAdmin');
const PlayFabAuthentication = require('playfab-sdk/Scripts/PlayFab/PlayFabAuthentication');
const PlayFabGroups = require('playfab-sdk/Scripts/PlayFab/PlayFabGroups');

const battleRoutes = require('./battle');
const guildRoutes = require('./guild');
const shipRoutes = require('./ships');
const { generateMapData } = require('./generateMapData');
const buildingDefs = require('./buildingDefinitions');

const RESOURCE_INTERVAL_MS = 10 * 60 * 1000;
const RESOURCE_BIOME_CURRENCY = {
    volcanic: 'RR',
    rocky: 'RG',
    mushroom: 'RY',
    lake: 'RB',
    forest: 'RT',
    sacred: 'RS'
};

// Firebase Admin SDK init
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
let serviceAccount = null;

if (serviceAccountJson) {
    serviceAccount = JSON.parse(serviceAccountJson);
} else {
    serviceAccount = require('./my-liff-app-ee704-firebase-adminsdk-fbsvc-2deac93eab.json');
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://my-liff-app-ee704-default-rtdb.firebaseio.com"
});

const firestore = admin.firestore();


app.use(express.json());

PlayFab.settings.titleId = process.env.PLAYFAB_TITLE_ID;
PlayFab.settings.developerSecretKey = process.env.PLAYFAB_SECRET_KEY;

const lineClient = new line.Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

// Serve static assets (public/*)
app.use(express.static(path.join(__dirname, 'public')));

// CSP for LIFF + Google Translate stylesheet
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

// Serve geofire-common ESM build for browser imports
app.get('/vendor/geofire-common/index.esm.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'node_modules', 'geofire-common', 'dist', 'geofire-common', 'index.esm.js'));
});

function promisifyPlayFab(apiFunction, request) {
    return new Promise((resolve, reject) => {
        apiFunction(request, (error, result) => {
            if (error) return reject(error);
            if (result && result.data) return resolve(result.data);
            if (result) return resolve(result);
            return reject(new Error('PlayFab call returned no error and no result.'));
        });
    });
}

const PORT = process.env.PORT || 8080;
const VIRTUAL_CURRENCY_CODE = process.env.VIRTUAL_CURRENCY_CODE || 'PT';
const LEADERBOARD_NAME = process.env.LEADERBOARD_NAME || 'ps_ranking';
const BATTLE_REWARD_POINTS = Number(process.env.BATTLE_REWARD_POINTS || 10);
const GACHA_CATALOG_VERSION = process.env.GACHA_CATALOG_VERSION || 'main_catalog';
const GACHA_DROP_TABLE_ID = process.env.GACHA_DROP_TABLE_ID || 'gacha_table';
const GACHA_COST = Number(process.env.GACHA_COST || 10);

const NATION_GROUP_BY_RACE = {
    Human: { island: 'fire', groupName: 'nation_fire_island' },
    Goblin: { island: 'water', groupName: 'nation_water_island' },
    Orc: { island: 'earth', groupName: 'nation_earth_island' },
    Elf: { island: 'wind', groupName: 'nation_wind_island' }
};

const NATION_GROUP_BY_NATION = {
    fire: { island: 'fire', groupName: 'nation_fire_island' },
    earth: { island: 'earth', groupName: 'nation_earth_island' },
    wind: { island: 'wind', groupName: 'nation_wind_island' },
    water: { island: 'water', groupName: 'nation_water_island' }
};

const AVATAR_COLOR_BY_NATION = {
    fire: 'red',
    earth: 'green',
    wind: 'purple',
    water: 'blue'
};

function getAvatarColorForNation(nation) {
    const key = String(nation || '').toLowerCase();
    return AVATAR_COLOR_BY_NATION[key] || null;
}

let _titleEntityTokenReady = false;
async function ensureTitleEntityToken() {
    if (_titleEntityTokenReady) return;
    await promisifyPlayFab(PlayFabAuthentication.GetEntityToken, {});
    _titleEntityTokenReady = true;
}

async function getNationGroupDoc(firestore, groupName) {
    return firestore.collection('nation_groups').doc(groupName);
}

async function provisionStarterAssets({ promisifyPlayFab, PlayFabServer, playFabId }) {
    try {
        await promisifyPlayFab(PlayFabServer.GrantItemsToUser, {
            PlayFabId: playFabId,
            ItemIds: ['ship_common_boat']
        });
        return { granted: ['ship_common_boat'] };
    } catch (error) {
        console.warn('[starterAssets] Failed to grant ship_common_boat:', error?.errorMessage || error?.message || error);
        return { granted: [], error: error?.errorMessage || error?.message || String(error) };
    }
}

async function ensureStarterShip({ playFabId, catalogCache, respawnPosition }) {
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
            try {
                shipData = JSON.parse(raw);
            } catch {
                shipData = null;
            }
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
    } else {
        shipData.Stats = shipData.Stats || {};
        if (!Number.isFinite(Number(shipData.Stats.CargoCapacity)) || Number(shipData.Stats.CargoCapacity) <= 0) {
            shipData.Stats.CargoCapacity = shipStats.CargoCapacity;
        }
        if (!Number.isFinite(Number(shipData.Stats.VisionRange)) || Number(shipData.Stats.VisionRange) <= 0) {
            shipData.Stats.VisionRange = shipStats.VisionRange;
        }
    }

    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: {
            ActiveShipId: activeShipId,
            [`Ship_${activeShipId}`]: JSON.stringify(shipData)
        }
    });

    const position = respawnPosition || { x: 100, y: 100 };
    const geoPoint = worldToLatLng(position);
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

async function createStarterIsland({ playFabId, raceName, nationIsland, displayName }) {
    const NATION_BOUNDS = {
        earth: { minX: 0, maxX: 99, minY: 0, maxY: 99 },
        wind: { minX: 400, maxX: 499, minY: 0, maxY: 99 },
        fire: { minX: 0, maxX: 99, minY: 400, maxY: 499 },
        water: { minX: 400, maxX: 499, minY: 400, maxY: 499 }
    };

    const sizeByKey = {
        small: { w: 3, h: 3 },
        medium: { w: 4, h: 3 },
        large: { w: 4, h: 4 },
        giant: { w: 5, h: 5 }
    };
    const islandSize = sizeByKey.small;

    const mapBounds = (() => {
        const key = String(nationIsland || '').toLowerCase();
        return NATION_BOUNDS[key] || null;
    })();

    const mapSize = 500;
    const offsetRange = 6;
    const baseRange = mapBounds
        ? {
            minX: mapBounds.minX,
            maxX: Math.max(mapBounds.minX, mapBounds.maxX - islandSize.w + 1),
            minY: mapBounds.minY,
            maxY: Math.max(mapBounds.minY, mapBounds.maxY - islandSize.h + 1)
        }
        : {
            minX: 0,
            maxX: mapSize - islandSize.w,
            minY: 0,
            maxY: mapSize - islandSize.h
        };
    const worldMap = admin.firestore().collection('world_map');
    const existing = await worldMap.where('ownerId', '==', playFabId).limit(1).get();
    if (!existing.empty) return { skipped: true, reason: 'already_has_island' };

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

    const tries = 80;
    const islandSize = sizeByKey.small;

    const overlaps = (rect) => {
        return occupied.some(o => rect.x < o.x + o.w && rect.x + rect.w > o.x && rect.y < o.y + o.h && rect.y + rect.h > o.y);
    };

    let chosen = null;
    let chosenBiomeFrame = null;
    for (let i = 0; i < tries; i++) {
        const base = nationIslands.length > 0
            ? nationIslands[Math.floor(Math.random() * nationIslands.length)]
            : occupied[Math.floor(Math.random() * occupied.length)];
        const baseMinX = baseRange.minX;
        const baseMaxX = baseRange.maxX;
        const baseMinY = baseRange.minY;
        const baseMaxY = baseRange.maxY;
        const bx = base?.x ?? Math.floor(Math.random() * (baseMaxX - baseMinX + 1)) + baseMinX;
        const by = base?.y ?? Math.floor(Math.random() * (baseMaxY - baseMinY + 1)) + baseMinY;
        const rx = Math.max(baseMinX, Math.min(baseMaxX, bx + Math.floor(Math.random() * (offsetRange * 2 + 1)) - offsetRange));
        const ry = Math.max(baseMinY, Math.min(baseMaxY, by + Math.floor(Math.random() * (offsetRange * 2 + 1)) - offsetRange));
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

    const islandName = `${displayName || 'Player'}島`;
    const docRef = worldMap.doc();
    const islandLevel = 1;
    const houseId = `my_house_lv${Math.min(5, Math.max(1, islandLevel))}`;
    const houseSpec = getBuildingSpec(houseId);
    const houseLogic = houseSpec ? normalizeSize(houseSpec.SizeLogic, inferLogicSizeFromSlotsRequired(houseSpec.SlotsRequired)) : { x: 1, y: 1 };
    const houseVisual = houseSpec ? normalizeSize(houseSpec.SizeVisual, houseLogic) : houseLogic;
    const houseTileIndexRaw = houseSpec ? houseSpec.TileIndex : null;
    const houseTileIndex = Number.isFinite(Number(houseTileIndexRaw)) ? Number(houseTileIndexRaw) : 17;
    const houseW = Math.max(1, Math.trunc(Number(houseLogic.x)));
    const houseH = Math.max(1, Math.trunc(Number(houseLogic.y)));
    const houseVW = Math.max(1, Math.trunc(Number(houseVisual.x)));
    const houseVH = Math.max(1, Math.trunc(Number(houseVisual.y)));
    const houseMaxHp = computeMaxHp(houseW, houseH);

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
        buildingSlots: { layout: '1x1' },
        buildings: [{
            buildingId: houseId,
            status: 'completed',
            level: islandLevel,
            startTime: Date.now(),
            completionTime: Date.now(),
            durationMs: 0,
            helpers: [],
            width: houseW,
            height: houseH,
            visualWidth: houseVW,
            visualHeight: houseVH,
            tileIndex: houseTileIndex,
            maxHp: houseMaxHp,
            currentHp: houseMaxHp,
            x: 0,
            y: 0
        }]
    };

    await docRef.set(islandData);

    const baseX = chosen.x + Math.floor(islandSize.w / 2);
    const baseY = chosen.y + Math.floor(islandSize.h / 2);
    const minOffset = 2;
    const maxOffset = 4;
    let respawnTileX = baseX;
    let respawnTileY = baseY;
    for (let i = 0; i < 12; i++) {
        const dx = (Math.floor(Math.random() * (maxOffset * 2 + 1)) - maxOffset);
        const dy = (Math.floor(Math.random() * (maxOffset * 2 + 1)) - maxOffset);
        if (Math.abs(dx) < minOffset && Math.abs(dy) < minOffset) continue;
        const tx = Math.max(0, Math.min(500 - 1, baseX + dx));
        const ty = Math.max(0, Math.min(500 - 1, baseY + dy));
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

    return { created: true, islandId: docRef.id, name: islandName, respawnPosition };
}

async function getPlayerEntity(playFabId) {
    const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
        PlayFabId: playFabId,
        ProfileConstraints: { ShowDisplayName: true }
    });
    const p = profile?.PlayerProfile || {};
    const entityId = p.EntityId || p.EntityID || p.Entity?.Id || null;
    const entityType = p.EntityType || p.Entity?.Type || 'title_player_account';
    if (!entityId) return null;
    return { Id: entityId, Type: entityType };
}

async function deleteOwnedIslands(firestore, playFabId) {
    const snapshot = await firestore.collection('world_map').where('ownerId', '==', playFabId).get();
    if (snapshot.empty) return { deleted: 0 };
    const batch = firestore.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    return { deleted: snapshot.size };
}

async function transferOwnedIslands(firestore, fromPlayFabId, toPlayFabId, toNation) {
    const snapshot = await firestore.collection('world_map').where('ownerId', '==', fromPlayFabId).get();
    if (snapshot.empty) return { transferred: 0 };

    let transferred = 0;
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

    return { transferred };
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

async function relocateActiveShip(firestore, playFabId, respawnPosition) {
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


// ----------------------------------------------------
// API: 国（島）グループ「王」専用ページ情報
// ----------------------------------------------------
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

app.post('/api/get-nation-king-page', async (req, res) => {
    const { playFabId } = req.body;
    if (!playFabId) return res.status(400).json({ error: 'PlayFab ID is required' });

    try {
        const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['NationGroupId']
        });
        if (!ro || !ro.Data || !ro.Data.NationGroupId || !ro.Data.NationGroupId.Value) {
            return res.json({ notInNation: true });
        }

        const csResult = await promisifyPlayFab(PlayFabServer.ExecuteCloudScript, {
            PlayFabId: playFabId,
            FunctionName: 'GetNationKingPageData',
            FunctionParameter: {},
            GeneratePlayStreamEvent: false
        });

        if (csResult && csResult.Error) {
            const msg = csResult.Error.Message || csResult.Error.Error || 'CloudScript error';
            if (String(msg).includes('NationGroupNotSet')) {
                return res.json({ notInNation: true });
            }
            if (String(msg).includes('JavascriptException')) {
                return res.json({ notInNation: true });
            }
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'Only the king can view this page' });
            }
            if (String(msg).includes('NationKingNotSet')) {
                return res.status(403).json({ error: 'Nation king is not set' });
            }
            return res.status(500).json({ error: 'Failed to get king page data', details: msg });
        }

        res.json(csResult ? (csResult.FunctionResult || {}) : {});
    } catch (error) {
        const msg = error.errorMessage || error.message;
        if (String(msg).includes('NationGroupNotSet')) {
            return res.json({ notInNation: true });
        }
        if (String(msg).includes('JavascriptException')) {
            return res.json({ notInNation: true });
        }
        console.error('[get-nation-king-page]', msg);
        res.status(500).json({ error: 'Failed to get king page data', details: msg });
    }
});
// ----------------------------------------------------
// API 7: インベントリ（持ち物）の取得 (v41と変更なし)
// ----------------------------------------------------

app.post('/api/get-nation-group', async (req, res) => {
    const { raceName } = req.body || {};
    if (!raceName) return res.status(400).json({ error: 'raceName is required' });

    const mapping = NATION_GROUP_BY_RACE[raceName];
    if (!mapping) return res.status(400).json({ error: 'Invalid raceName' });

    try {
        const firestore = admin.firestore();
        const docRef = await getNationGroupDoc(firestore, mapping.groupName);
        const docSnap = await docRef.get();
        const data = docSnap.exists ? docSnap.data() : null;
        return res.json({
            groupName: mapping.groupName,
            groupId: data && data.groupId ? data.groupId : null
        });
    } catch (error) {
        console.error('[get-nation-group] Error:', error.errorMessage || error.message);
        return res.status(500).json({ error: 'Failed to get nation group', details: error.errorMessage || error.message });
    }
});

app.post('/api/get-owned-islands', async (req, res) => {
    const { playFabId } = req.body || {};
    if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });

    try {
        const snapshot = await firestore.collection('world_map')
            .where('ownerId', '==', playFabId)
            .get();
        const islands = snapshot.docs.map(doc => {
            const data = doc.data() || {};
            return {
                id: doc.id,
                name: data.name || null,
                size: data.size || null,
                islandLevel: data.islandLevel || null,
                biome: data.biome || null,
                coordinate: data.coordinate || null,
                buildings: data.buildings || []
            };
        });
        res.json({ islands });
    } catch (error) {
        console.error('[get-owned-islands] Error:', error?.message || error);
        res.status(500).json({ error: 'Failed to fetch owned islands' });
    }
});

app.post('/api/king-exile', async (req, res) => {
    const { playFabId, targetPlayFabId } = req.body || {};
    if (!playFabId || !targetPlayFabId) {
        return res.status(400).json({ error: 'playFabId and targetPlayFabId are required' });
    }
    if (playFabId === targetPlayFabId) {
        return res.status(400).json({ error: 'Cannot exile self' });
    }

    try {
        const kingCheck = await promisifyPlayFab(PlayFabServer.ExecuteCloudScript, {
            PlayFabId: playFabId,
            FunctionName: 'GetNationKingPageData',
            FunctionParameter: {},
            GeneratePlayStreamEvent: false
        });
        if (kingCheck && kingCheck.Error) {
            const msg = kingCheck.Error.Message || kingCheck.Error.Error || 'CloudScript error';
            if (String(msg).includes('NotKing') || String(msg).includes('NationKingNotSet')) {
                return res.status(403).json({ error: 'Only the king can exile players' });
            }
            return res.status(500).json({ error: 'Failed to validate king', details: msg });
        }

        const kingRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['NationGroupId', 'NationGroupName', 'NationIsland', 'Nation', 'Race']
        });
        const kingNationGroupId = kingRo?.Data?.NationGroupId?.Value || null;
        if (!kingNationGroupId) return res.status(400).json({ error: 'King nation group not set' });

        let targetNationIsland = await resolveNationIslandByGroupId(kingNationGroupId);
        const kingNation = String(kingRo?.Data?.Nation?.Value || kingRo?.Data?.NationIsland?.Value || '').toLowerCase();
        const kingRace = kingRo?.Data?.Race?.Value || null;
        if (!targetNationIsland && kingNation) targetNationIsland = kingNation;
        const nationMapping = NATION_GROUP_BY_NATION[kingNation] || null;
        const targetNationGroupName = kingRo?.Data?.NationGroupName?.Value || nationMapping?.groupName || null;

        const targetRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: targetPlayFabId,
            Keys: ['Race', 'NationGroupId', 'Nation']
        });
        const targetRace = targetRo?.Data?.Race?.Value || null;
        const targetPrevGroupId = targetRo?.Data?.NationGroupId?.Value || null;

        const playerEntity = await getPlayerEntity(targetPlayFabId);
        if (!playerEntity) return res.status(400).json({ error: 'Failed to resolve target entity' });

        if (targetPrevGroupId && targetPrevGroupId !== kingNationGroupId) {
            try {
                await promisifyPlayFab(PlayFabGroups.RemoveMembers, {
                    Group: { Id: targetPrevGroupId, Type: 'group' },
                    Members: [playerEntity]
                });
            } catch (e) {
                console.warn('[king-exile] RemoveMembers failed:', e?.errorMessage || e?.message || e);
            }
        }

        try {
            await promisifyPlayFab(PlayFabGroups.AddMembers, {
                Group: { Id: kingNationGroupId, Type: 'group' },
                Members: [playerEntity]
            });
        } catch (e) {
            const msg = e?.errorMessage || e?.message || String(e);
            if (!String(msg).includes('EntityIsAlreadyMember')) throw e;
        }

        const avatarColor = getAvatarColorForNation(targetNationIsland || kingNation);
        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: targetPlayFabId,
            Data: {
                Nation: targetNationIsland || kingNation || null,
                NationIsland: targetNationIsland || kingNation || null,
                NationGroupId: kingNationGroupId,
                NationGroupName: targetNationGroupName,
                AvatarColor: avatarColor || 'brown',
                NationChangedAt: String(Date.now())
            }
        });

        const transferResult = await transferOwnedIslands(firestore, targetPlayFabId, playFabId, targetNationIsland || kingNation || null);
        let starterIsland = null;
        try {
            const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: targetPlayFabId,
                ProfileConstraints: { ShowDisplayName: true }
            });
            const displayName = profile?.PlayerProfile?.DisplayName || null;
            starterIsland = await createStarterIsland({
                playFabId: targetPlayFabId,
                raceName: targetRace || 'Human',
                nationIsland: targetNationIsland || kingNation || null,
                displayName
            });
        } catch (e) {
            console.warn('[king-exile] Failed to create starter island:', e?.errorMessage || e?.message || e);
        }

        if (starterIsland?.respawnPosition) {
            await relocateActiveShip(firestore, targetPlayFabId, starterIsland.respawnPosition);
        }

        return res.json({
            success: true,
            nationGroupId: kingNationGroupId,
            nationIsland: targetNationIsland || kingNation || null,
            transferredIslands: transferResult.transferred,
            starterIsland
        });
    } catch (error) {
        console.error('[king-exile] Error:', error?.errorMessage || error?.message || error);
        return res.status(500).json({ error: 'Failed to exile player', details: error?.errorMessage || error?.message || error });
    }
});

app.post('/api/get-guild-areas', async (req, res) => {
    const { guildId } = req.body || {};
    if (!guildId) return res.json({ success: true, areas: [] });
    try {
        const snapshot = await firestore.collection('guild_areas')
            .where('guildId', '==', guildId)
            .get();
        const areas = snapshot.docs.map((doc) => doc.data());
        res.json({ success: true, areas });
    } catch (error) {
        console.error('[GetGuildAreas] Error:', error?.message || error);
        res.status(500).json({ error: 'Failed to get guild areas' });
    }
});

app.post('/api/capture-guild-area', async (req, res) => {
    const { guildId, gx, gy } = req.body || {};
    if (!guildId || !Number.isFinite(Number(gx)) || !Number.isFinite(Number(gy))) {
        return res.status(400).json({ error: 'guildId, gx, gy are required' });
    }
    try {
        const key = `${guildId}_${gx}_${gy}`;
        await firestore.collection('guild_areas').doc(key).set({
            guildId,
            gx: Number(gx),
            gy: Number(gy),
            occupiedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        res.json({ success: true });
    } catch (error) {
        console.error('[CaptureGuildArea] Error:', error?.message || error);
        res.status(500).json({ error: 'Failed to capture guild area' });
    }
});

app.post('/api/donate-nation-currency', async (req, res) => {
    const { playFabId, currency, amount } = req.body || {};
    if (!playFabId || !currency) {
        return res.status(400).json({ error: 'playFabId and currency are required' });
    }
    const value = Math.floor(Number(amount) || 0);
    if (!Number.isFinite(value) || value <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    try {
        const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['NationGroupId']
        });
        const nationGroupId = ro?.Data?.NationGroupId?.Value || null;
        if (!nationGroupId) {
            return res.status(400).json({ error: 'Nation not set' });
        }

        await promisifyPlayFab(PlayFabServer.SubtractUserVirtualCurrency, {
            PlayFabId: playFabId,
            VirtualCurrency: String(currency).toUpperCase(),
            Amount: value
        });

        const snapshot = await firestore.collection('nation_groups')
            .where('groupId', '==', nationGroupId)
            .limit(1)
            .get();
        if (snapshot.empty) {
            return res.status(404).json({ error: 'Nation group not found' });
        }
        const docRef = snapshot.docs[0].ref;
        const field = `treasury.${String(currency).toUpperCase()}`;
        await docRef.set({
            treasury: {
                [String(currency).toUpperCase()]: admin.firestore.FieldValue.increment(value)
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        res.json({ success: true });
    } catch (error) {
        console.error('[donate-nation-currency] Error:', error?.errorMessage || error?.message || error);
        res.status(500).json({ error: 'Failed to donate currency' });
    }
});

app.post('/api/set-race', async (req, res) => {
    const { playFabId, raceName, nationGroupId, entityToken, displayName } = req.body || {};
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
        const mapping = NATION_GROUP_BY_RACE[raceName];
        if (!mapping) return res.status(400).json({ error: 'Invalid raceName' });
        if (!nationGroupId) return res.status(400).json({ error: 'nationGroupId is required' });
        if (!entityToken) return res.status(400).json({ error: 'entityToken is required' });

        const firestore = admin.firestore();
        const docRef = await getNationGroupDoc(firestore, mapping.groupName);
        const docSnap = await docRef.get();
        const storedGroupId = docSnap.exists && docSnap.data() ? docSnap.data().groupId : null;
        if (storedGroupId && storedGroupId !== nationGroupId) {
            return res.status(409).json({ error: 'Nation group mismatch' });
        }

        await ensureTitleEntityToken();
        const validate = await promisifyPlayFab(PlayFabAuthentication.ValidateEntityToken, { EntityToken: entityToken });
        const playerEntity = validate && validate.Entity ? validate.Entity : null;
        if (!playerEntity || !playerEntity.Id || !playerEntity.Type) {
            return res.status(400).json({ error: 'Invalid entity token' });
        }

        const groupInfo = await promisifyPlayFab(PlayFabGroups.GetGroup, {
            Group: { Id: nationGroupId, Type: 'group' }
        });
        if (groupInfo && groupInfo.GroupName && groupInfo.GroupName !== mapping.groupName) {
            return res.status(400).json({ error: 'Invalid nation group name' });
        }

        try {
            await promisifyPlayFab(PlayFabGroups.AddMembers, {
                Group: { Id: nationGroupId, Type: 'group' },
                Members: [playerEntity]
            });
        } catch (e) {
            const msg = (e && (e.errorMessage || e.message)) ? (e.errorMessage || e.message) : String(e);
            if (!msg.includes('EntityIsAlreadyMember')) {
                throw e;
            }
        }

        if (!storedGroupId) {
            await docRef.set({
                groupId: nationGroupId,
                groupName: mapping.groupName,
                nationIsland: mapping.island,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
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
            Nation: mapping.island,
            NationIsland: mapping.island,
            NationGroupId: nationGroupId,
            NationGroupName: mapping.groupName
        };

        const statsPayload = Object.keys(initialStats).map(key => ({ StatisticName: key, Value: initialStats[key] }));
        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, { PlayFabId: playFabId, Statistics: statsPayload });

        avatarData.SkinColorIndex = Math.floor(Math.random() * maxSkinColorIndex) + 1;
        avatarData.FaceIndex = Math.floor(Math.random() * maxFaceIndex) + 1;
        avatarData.HairStyleIndex = Math.floor(Math.random() * 30) + 1;

        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: playFabId,
            Data: { "Race": raceName, ...avatarData, ...nationData }
        });

        let starterIsland = null;
        try {
            const existingIslands = await firestore.collection('world_map')
                .where('ownerId', '==', playFabId)
                .limit(1)
                .get();
            if (existingIslands.empty) {
                const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                    PlayFabId: playFabId,
                    ProfileConstraints: { ShowDisplayName: true }
                });
                const displayName = profile?.PlayerProfile?.DisplayName || null;
                starterIsland = await createStarterIsland({
                    playFabId,
                    raceName,
                    nationIsland: nationData.NationIsland,
                    displayName
                });
            } else {
                console.warn('[starterIsland] Skipped creation because starter island already exists');
            }
        } catch (e) {
            console.warn('[starterIsland] Failed to create starter island:', e?.errorMessage || e?.message || e);
        }

        const starterAssets = await provisionStarterAssets({
            promisifyPlayFab,
            PlayFabServer,
            firestore,
            catalogCache,
            playFabId,
            raceName,
            nationIsland: nationData.NationIsland
        });

        try {
            await ensureStarterShip({
                playFabId,
                catalogCache,
                respawnPosition: starterIsland?.respawnPosition || null
            });
        } catch (e) {
            console.warn('[starterShip] Failed to ensure starter ship:', e?.errorMessage || e?.message || e);
        }

        res.json({
            status: 'success',
            selectedRace: raceName,
            nation: nationData,
            starterAssets,
            starterIsland
        });
    } catch (error) {
        console.error('[set-race] Error:', error.errorMessage || error.message);
        res.status(500).json({ error: 'Failed to set race', details: error.errorMessage || error.message });
    }
});

// ----------------------------------------------------
// API 7: ?????????????? (v41?????)
// ----------------------------------------------------
app.post('/api/get-inventory', async (req, res) => {
    // (v41と変更なし)
    const { playFabId } = req.body;
    if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
    console.log(`[インベントリ取得] ${playFabId} の持ち物を取得します...`);
    try {
        const result = await promisifyPlayFab(PlayFabServer.GetUserInventory, { PlayFabId: playFabId });
        const itemMap = new Map();
        if (result && result.Inventory) {
            result.Inventory.forEach(item => {
                const itemId = item.ItemId;
                const name = item.DisplayName || itemId;
                const catalogData = catalogCache[itemId] || {};
                if (itemMap.has(name)) {
                    const existing = itemMap.get(name);
                    existing.count += 1;
                    existing.instances.push(item.ItemInstanceId);
                } else {
                    itemMap.set(name, {
                        name: name, count: 1, itemId: itemId,
                        description: catalogData.Description || '', // description を追加
                        instances: [item.ItemInstanceId],
                        customData: catalogData,
                    });
                }
            });
        }
        const inventoryList = Array.from(itemMap.values());
        console.log(`[インベントリ取得] 成功。`);
        res.json({ inventory: inventoryList, virtualCurrency: result?.VirtualCurrency || {} });
    } catch (error) {
        console.error('[インベントリ取得エラー]', error.errorMessage);
        res.status(500).json({ error: '持ち物の取得に失敗しました。', details: error.errorMessage });
    }
});
// ----------------------------------------------------
// API 9: アイテムを装備する (v41と変更なし)
// ----------------------------------------------------
app.post('/api/equip-item', async (req, res) => {
    // ★ v103: slot パラメータを受け取るように修正
    const { playFabId, itemId, slot } = req.body; // itemId は null の場合がある
    if (!playFabId || !slot) return res.status(400).json({ error: 'IDまたはスロット情報がありません。' });

    // slot名からPlayFabに保存するキー名を決定
    const validSlots = { 'RightHand': 'Equipped_RightHand', 'LeftHand': 'Equipped_LeftHand', 'Armor': 'Equipped_Armor' };
    const dataKey = validSlots[slot];
    if (!dataKey) return res.status(400).json({ error: '無効な装備スロットです。' });

    const dataToUpdate = {};

    if (itemId) {
        // --- アイテムを装備する場合 ---
        dataToUpdate[dataKey] = itemId;

        // カタログキャッシュからアイテム情報を取得
        const itemData = catalogCache[itemId];
        if (itemData && itemData.Category === 'Weapon' && (itemData.sprite_w > 32 || itemData.sprite_h > 32)) {
            console.log(`[装備] 両手持ち武器 (${itemId}) を検出しました。`);
            // 右手に装備し、左手を空にする
            dataToUpdate['Equipped_RightHand'] = itemId;
            dataToUpdate['Equipped_LeftHand'] = null; // 左手を明示的に空にする
        }
    } else {
        // --- アイテムを外す場合 (itemId is null) ---
        // ★ v167: 両手武器を外す場合の特別処理
        // 現在の装備情報を取得して、外すアイテムが両手武器か判定する
        const currentEquipmentResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, { PlayFabId: playFabId, Keys: ["Equipped_RightHand"] });
        const currentRightHandId = currentEquipmentResult.Data && currentEquipmentResult.Data.Equipped_RightHand ? currentEquipmentResult.Data.Equipped_RightHand.Value : null;
        const itemData = currentRightHandId ? catalogCache[currentRightHandId] : null;

        if (slot === 'RightHand' && itemData && itemData.Category === 'Weapon' && (itemData.sprite_w > 32 || itemData.sprite_h > 32)) {
            console.log(`[装備解除] 両手武器 (${currentRightHandId}) を外すため、両手を空にします。`);
            dataToUpdate['Equipped_RightHand'] = null;
            dataToUpdate['Equipped_LeftHand'] = null;
        } else {
            // 通常の片手武器や防具を外す場合
            dataToUpdate[dataKey] = null;
        }
    }

    console.log(`[装備] ${playFabId} のデータを更新します...`, dataToUpdate);

    try {
        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: playFabId,
            Data: dataToUpdate,
            Permission: "Public" // 念のためPublicに設定
        });
        console.log('[装備] 成功。');
        res.json({ status: 'success', equippedItem: itemId });
    } catch (error) {
        console.error('[装備エラー]', error.errorMessage);
        res.status(500).json({ error: '装備の保存に失敗しました。', details: error.errorMessage });
    }
});
// ----------------------------------------------------
// API 10: 現在の装備を取得する (v41と変更なし)
// ----------------------------------------------------
app.post('/api/get-equipment', async (req, res) => {
    // ★ v103: 新しいデータ構造で返すように修正
    const { playFabId } = req.body;
    if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
    console.log(`[装備取得] ${playFabId} の装備を読み込みます...`);
    try {
        // PlayFabから右手、左手、鎧の装備データを取得
        const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId, Keys: ["Equipped_RightHand", "Equipped_LeftHand", "Equipped_Armor"]
        });
        const equipment = {};
        // 取得したデータを新しいキー名(RightHand, LeftHand, Armor)にマッピング
        if (result.Data && result.Data.Equipped_RightHand) equipment.RightHand = result.Data.Equipped_RightHand.Value;
        if (result.Data && result.Data.Equipped_LeftHand) equipment.LeftHand = result.Data.Equipped_LeftHand.Value;
        if (result.Data && result.Data.Equipped_Armor) equipment.Armor = result.Data.Equipped_Armor.Value;
        console.log('[装備取得] 成功。', equipment);
        res.json({ equipment: equipment });
    } catch (error) {
        console.error('[装備取得エラー]', error.errorMessage);
        res.status(500).json({ error: '装備の取得に失敗しました。', details: error.errorMessage });
    }
});
// ----------------------------------------------------
// API 1: ポイント残高の取得 (v41と変更なし)
// ----------------------------------------------------
app.post('/api/get-points', async (req, res) => {
    // (v41と変更なし)
    const playFabId = req.body.playFabId;
    if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
    try {
        const result = await promisifyPlayFab(PlayFabServer.GetUserInventory, { PlayFabId: playFabId });
        let points = 0;
        if (result && result.VirtualCurrency && result.VirtualCurrency[VIRTUAL_CURRENCY_CODE]) {
            points = result.VirtualCurrency[VIRTUAL_CURRENCY_CODE];
        }
        console.log(`[${playFabId}] のポイント残高: ${points} PT`);
        res.json({ points: points });
    } catch (error) {
        res.status(500).json({ error: 'インベントリの取得に失敗しました。', details: error.errorMessage });
    }
});
// ----------------------------------------------------
// API 2: ポイントの追加 (v41と変更なし)
// ----------------------------------------------------
app.post('/api/add-points', async (req, res) => {
    // (v41と変更なし)
    const { playFabId, amount } = req.body;
    if (!playFabId || !amount) return res.status(400).json({ error: 'IDまたはAmountがありません。' });
    try {
        const result = await promisifyPlayFab(PlayFabServer.AddUserVirtualCurrency, {
            PlayFabId: playFabId, VirtualCurrency: VIRTUAL_CURRENCY_CODE, Amount: amount
        });
        const newBalance = result.Balance;
        console.log(`[${playFabId}] に ${amount} PT 追加。 新残高: ${newBalance}`);
        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: playFabId, Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: newBalance }]
        });
        console.log('ランキングのスコアを更新しました。');
        res.json({ newBalance: newBalance });
    } catch (error) {
        console.error('ポイント追加またはランキング更新に失敗:', error.errorMessage);
        res.status(500).json({ error: 'ポイントの追加に失敗しました。', details: error.errorMessage });
    }
});
// ----------------------------------------------------
// API 3: ポイントの消費 (v41と変更なし)
// ----------------------------------------------------
app.post('/api/use-points', async (req, res) => {
    // (v41と変更なし)
    const { playFabId, amount } = req.body;
    if (!playFabId || !amount) return res.status(400).json({ error: 'IDまたはAmountがありません。' });
    try {
        const result = await promisifyPlayFab(PlayFabServer.SubtractUserVirtualCurrency, {
            PlayFabId: playFabId, VirtualCurrency: VIRTUAL_CURRENCY_CODE, Amount: amount
        });
        const newBalance = result.Balance;
        console.log(`[${playFabId}] から ${amount} PT 消費。 新残高: ${newBalance}`);
        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: playFabId, Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: newBalance }]
        });
        console.log('ランキングのスコアを更新しました。');
        res.json({ newBalance: newBalance });
    } catch (error) {
        if (error.apiErrorInfo && error.apiErrorInfo.apiError === 'InsufficientFunds') {
            return res.status(400).json({ error: 'ポイントが不足しています。' });
        }
        console.error('ポイント消費またはランキング更新に失敗:', error.errorMessage);
        res.status(500).json({ error: 'ポイントの消費に失敗しました。', details: error.errorMessage });
    }
});
// ----------------------------------------------------
// API 4: ランキング取得 (v41と変更なし)
// ----------------------------------------------------
app.post('/api/get-ranking', async (req, res) => {
    // (v41と変更なし)
    console.log('ランキング取得APIが呼び出されました...');
    try {
        const result = await promisifyPlayFab(PlayFabServer.GetLeaderboard, {
            StatisticName: LEADERBOARD_NAME, StartPosition: 0, MaxResultsCount: 10,
            ProfileConstraints: { ShowAvatarUrl: true, ShowDisplayName: true }
        });
        console.log('ランキング取得成功。');
        let ranking = [];
        if (result && result.Leaderboard) {
            ranking = result.Leaderboard.map(entry => {
                let avatarUrl = (entry.Profile && entry.Profile.AvatarUrl) ? entry.Profile.AvatarUrl : null;
                return {
                    position: entry.Position,
                    displayName: entry.DisplayName || '（名前なし）',
                    score: entry.StatValue,
                    avatarUrl: avatarUrl
                };
            });
        }
        res.json({ ranking: ranking });
    } catch (error) {
        console.error('リーダーボード取得エラー:', error.errorMessage);
        return res.status(500).json({ error: 'ランキングの取得に失敗しました。', details: error.errorMessage });
    }
});
// ----------------------------------------------------
// API: 懸賞金ランキング取得 (★ vXXXで追加)
// ----------------------------------------------------
app.post('/api/get-bounty-ranking', async (req, res) => {
    console.log('懸賞金ランキング取得APIが呼び出されました...');
    try {
        const result = await promisifyPlayFab(PlayFabServer.GetLeaderboard, {
            StatisticName: 'bounty_ranking', // ★ 参照するリーダーボード名を変更
            StartPosition: 0,
            MaxResultsCount: 10,
            ProfileConstraints: { ShowAvatarUrl: true, ShowDisplayName: true }
        });
        console.log('懸賞金ランキング取得成功。');
        let ranking = [];
        if (result && result.Leaderboard) {
            ranking = result.Leaderboard.map(entry => {
                let avatarUrl = (entry.Profile && entry.Profile.AvatarUrl) ? entry.Profile.AvatarUrl : null;
                return {
                    position: entry.Position,
                    displayName: entry.DisplayName || '（名前なし）',
                    score: entry.StatValue,
                    avatarUrl: avatarUrl
                };
            });
        }
        res.json({ ranking: ranking });
    } catch (error) {
        console.error('懸賞金リーダーボード取得エラー:', error.errorMessage);
        return res.status(500).json({ error: '懸賞金ランキングの取得に失敗しました。', details: error.errorMessage });
    }
});
// ----------------------------------------------------
// API 5: ポイント転送 (v41と変更なし)
// ----------------------------------------------------
app.post('/api/transfer-points', async (req, res) => {
    // (v41と変更なし)
    const { fromId, toId, amount } = req.body;
    const amountInt = parseInt(amount, 10);
    if (!fromId || !toId || !amountInt || amountInt <= 0) {
        return res.status(400).json({ error: 'リクエスト情報が不足しています（0以下のP数は送れません）。' });
    }
    if (fromId === toId) return res.status(400).json({ error: '自分自身に送ることはできません。' });
    console.log(`[転送開始] ${fromId} から ${toId} へ ${amountInt} PT`);
    try {
        const subtractResult = await promisifyPlayFab(PlayFabServer.SubtractUserVirtualCurrency, {
            PlayFabId: fromId, VirtualCurrency: VIRTUAL_CURRENCY_CODE, Amount: amountInt
        });
        const payerNewBalance = subtractResult.Balance;
        console.log(`[転送-1] ${fromId} から ${amountInt} PT 引きました。新残高: ${payerNewBalance}`);
        try {
            const addResult = await promisifyPlayFab(PlayFabServer.AddUserVirtualCurrency, {
                PlayFabId: toId, VirtualCurrency: VIRTUAL_CURRENCY_CODE, Amount: amountInt
            });
            const receiverNewBalance = addResult.Balance;
            console.log(`[転送-2] ${toId} へ ${amountInt} PT 足しました。新残高: ${receiverNewBalance}`);
            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: fromId, Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: payerNewBalance }]
            });
            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: toId, Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: receiverNewBalance }]
            });
            console.log(`[転送-3] 両名のランキングを更新しました。`);
            res.json({ newBalance: payerNewBalance });
        } catch (addError) {
            console.error(`[転送-2 エラー] ${toId} への加算に失敗。 ${fromId} へ返金します。`, addError.errorMessage);
            await promisifyPlayFab(PlayFabServer.AddUserVirtualCurrency, {
                PlayFabId: fromId, VirtualCurrency: VIRTUAL_CURRENCY_CODE, Amount: amountInt
            });
            res.status(500).json({ error: '相手への送金に失敗したため、処理をキャンセルし返金しました。' });
        }
    } catch (subtractError) {
        if (subtractError.apiErrorInfo && subtractError.apiErrorInfo.apiError === 'InsufficientFunds') {
            return res.status(400).json({ error: 'ポイントが不足しています。' });
        }
        console.error(`[転送-1 エラー] ${fromId} からの減算に失敗。`, subtractError.errorMessage);
        res.status(500).json({ error: '送金処理に失敗しました。', details: subtractError.errorMessage });
    }
});
// ----------------------------------------------------
// API 6: ガチャを引く (v41と変更なし)
// ----------------------------------------------------
app.post('/api/pull-gacha', async (req, res) => {
    // (v41と変更なし)
    const { playFabId } = req.body;
    if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
    console.log(`[ガチャ開始] ${playFabId} が ${GACHA_COST} PT でガチャを引きます...`);
    try {
        const subtractResult = await promisifyPlayFab(PlayFabServer.SubtractUserVirtualCurrency, {
            PlayFabId: playFabId, VirtualCurrency: VIRTUAL_CURRENCY_CODE, Amount: GACHA_COST
        });
        const newBalance = subtractResult.Balance;
        console.log(`[ガチャ-1] ${playFabId} から ${GACHA_COST} PT 消費。新残高: ${newBalance}`);
        try {
            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: playFabId, Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: newBalance }]
            });
            console.log(`[ガチャ-2] ランキングを更新しました。`);
            console.log(`[ガチャ-3] ドロップテーブル ${GACHA_DROP_TABLE_ID} を評価します...`);
            const evalResult = await promisifyPlayFab(PlayFabServer.EvaluateRandomResultTable, {
                TableId: GACHA_DROP_TABLE_ID, CatalogVersion: GACHA_CATALOG_VERSION
            });
            const grantedItemId = evalResult.ResultItemId;
            if (!grantedItemId) throw new Error('ドロップテーブルからアイテムが抽選されませんでした。');
            console.log(`[ガチャ-4] 抽選結果 (ItemId): ${grantedItemId}`);
            const grantResult = await promisifyPlayFab(PlayFabServer.GrantItemsToUser, {
                PlayFabId: playFabId, CatalogVersion: GACHA_CATALOG_VERSION, ItemIds: [grantedItemId]
            });
            console.log(`[ガチャ-5] アイテム付与成功。`);
            res.json({
                newBalance: newBalance,
                grantedItems: grantResult.ItemGrantResults || []
            });
        } catch (grantError) {
            console.error(`[ガチャ エラー] アイテム付与/評価に失敗。 ${playFabId} へ返金します。`, grantError.errorMessage || grantError.message);
            await promisifyPlayFab(PlayFabServer.AddUserVirtualCurrency, {
                PlayFabId: playFabId, VirtualCurrency: VIRTUAL_CURRENCY_CODE, Amount: GACHA_COST
            });
            res.status(500).json({ error: 'ガチャの抽選に失敗したため、処理をキャンセルし返金しました。', details: grantError.errorMessage || grantError.message });
        }
    } catch (subtractError) {
        if (subtractError.apiErrorInfo && subtractError.apiErrorInfo.apiError === 'InsufficientFunds') {
            return res.status(400).json({ error: `ガチャを引くためのPs（ピース）が不足しています。（${GACHA_COST} Ps 必要です）` });
        }
        console.error(`[ガチャ-1 エラー] ポイント消費に失敗。`, subtractError.errorMessage);
        res.status(500).json({ error: 'ガチャ処理に失敗しました。', details: subtractError.errorMessage });
    }
});
// ----------------------------------------------------
// API 12: プレイヤーステータス取得 (v41と変更なし)
// ----------------------------------------------------
app.post('/api/get-stats', async (req, res) => {
    // (v41と変更なし)
    const { playFabId } = req.body;
    if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
    console.log(`[ステータス取得] ${playFabId} のステータスを取得します...`);
    try {
        const result = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, {
            PlayFabId: playFabId
        });
        const stats = {};
        if (result.Statistics) {
            result.Statistics.forEach(stat => {
                stats[stat.StatisticName] = stat.Value;
            });
        }
        console.log(`[ステータス取得] 成功。`);
        res.json({ stats: stats });
    } catch (error) {
        console.error('[ステータス取得エラー]', error.errorMessage);
        res.status(500).json({ error: 'ステータスの取得に失敗しました。', details: error.errorMessage });
    }
});

// ----------------------------------------------------
// API 15: 回復アイテムを使用する (★ v43で追加)
// ----------------------------------------------------
app.post('/api/use-item', async (req, res) => {
    const { playFabId, itemInstanceId, itemId } = req.body;
    if (!playFabId || !itemInstanceId || !itemId) {
        return res.status(400).json({ error: 'IDまたはアイテム情報が不足しています。' });
    }

    console.log(`[アイテム使用] ${playFabId} がアイテム (Instance: ${itemInstanceId}) を使用します...`);

    try {
        // 1. アイテムのカスタムデータをキャッシュから取得
        const itemData = catalogCache[itemId];
        if (!itemData || itemData.Category !== 'Consumable' || !itemData.Effect) {
            return res.status(400).json({ error: 'このアイテムは使用できません。' });
        }

        const effect = itemData.Effect;
        if (effect.Type !== 'Heal' || !effect.Target || !effect.Amount) {
            return res.status(400).json({ error: 'アイテムの効果が正しく設定されていません。' });
        }

        // 2. 現在のステータスを取得
        const statsResult = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: playFabId });
        const currentStats = {};
        if (statsResult.Statistics) {
            statsResult.Statistics.forEach(stat => { currentStats[stat.StatisticName] = stat.Value; });
        }

        const targetStat = effect.Target; // "HP" or "MP"
        const maxStat = `Max${targetStat}`; // "MaxHP" or "MaxMP"

        const currentValue = currentStats[targetStat] || 0;
        const maxValue = currentStats[maxStat] || currentValue;

        // 3. すでに全回復しているかチェック
        if (currentValue >= maxValue) {
            return res.status(400).json({ error: `${targetStat}はすでに満タンです。` });
        }

        // 4. アイテムを消費
        await promisifyPlayFab(PlayFabServer.ConsumeItem, {
            PlayFabId: playFabId,
            ItemInstanceId: itemInstanceId,
            ConsumeCount: 1
        });
        console.log(`[アイテム使用] ${playFabId} のアイテム ${itemInstanceId} を消費しました。`);

        // 5. ステータスを回復・更新
        const recoveredValue = Math.min(currentValue + effect.Amount, maxValue);
        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: playFabId,
            Statistics: [{ StatisticName: targetStat, Value: recoveredValue }]
        });
        console.log(`[アイテム使用] ${playFabId} の ${targetStat} が ${currentValue} -> ${recoveredValue} に回復しました。`);

        // 6. 結果をクライアントに返す
        res.json({
            status: 'success',
            message: `${itemData.DisplayName || itemId}を使い、${targetStat}が${effect.Amount}回復した！`,
            updatedStats: {
                [targetStat]: recoveredValue
            }
        });

    } catch (error) {
        console.error('[アイテム使用エラー]', error.errorMessage || error.message, error.apiErrorInfo);

        // ★★★ PlayFabからのエラー内容に応じて、クライアントへのメッセージを分かりやすくする ★★★
        if (error.apiErrorInfo && error.apiErrorInfo.apiError === 'ItemIsNotConsumable') {
            return res.status(400).json({ error: 'このアイテムは消費できないアイテムです。' });
        }
        if (error.apiErrorInfo && error.apiErrorInfo.apiError === 'NoRemainingUses') {
            return res.status(400).json({ error: 'このアイテムはもう残っていません。' });
        }
        res.status(500).json({ error: 'アイテムの使用に失敗しました。', details: error.errorMessage || 'サーバーで予期せぬエラーが発生しました。' });
    }
});

// ----------------------------------------------------
// API 16: アイテムを売却する (★ v106で追加)
// ----------------------------------------------------
app.post('/api/sell-item', async (req, res) => {
    const { playFabId, itemInstanceId, itemId } = req.body;
    if (!playFabId || !itemInstanceId || !itemId) {
        return res.status(400).json({ error: 'IDまたはアイテム情報が不足しています。' });
    }

    console.log(`[アイテム売却] ${playFabId} がアイテム (Instance: ${itemInstanceId}) を売却します...`);

    try {
        // 1. アイテムの売却価格をカタログキャッシュから取得
        const itemData = catalogCache[itemId];
        // ★ v110: SellPriceが定義されていない場合はPowerを参照せず、売却不可とする
        const sellPrice = (itemData && itemData.SellPrice)
            ? parseInt(itemData.SellPrice, 10)
            : 0;

        if (!sellPrice || sellPrice <= 0) {
            return res.status(400).json({ error: 'このアイテムは売却できません。' });
        }

        // 2. アイテムを消費
        await promisifyPlayFab(PlayFabServer.ConsumeItem, {
            PlayFabId: playFabId,
            ItemInstanceId: itemInstanceId,
            ConsumeCount: 1
        });
        console.log(`[アイテム売却] アイテム ${itemInstanceId} を消費しました。`);

        // 3. 売却価格分のPsを付与
        const addResult = await promisifyPlayFab(PlayFabServer.AddUserVirtualCurrency, {
            PlayFabId: playFabId,
            VirtualCurrency: VIRTUAL_CURRENCY_CODE,
            Amount: sellPrice
        });
        const newBalance = addResult.Balance;
        console.log(`[アイテム売却] ${sellPrice} Ps を付与しました。新残高: ${newBalance}`);

        // 4. ランキングスコアを更新
        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: playFabId,
            Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: newBalance }]
        });
        console.log(`[アイテム売却] ランキングスコアを更新しました。`);

        // 5. 結果をクライアントに返す
        res.json({
            status: 'success',
            message: `${itemData.DisplayName || itemId}を ${sellPrice} Ps で売却しました。`,
            newBalance: newBalance
        });

    } catch (error) {
        console.error('[アイテム売却エラー]', error.errorMessage || error.message, error.apiErrorInfo);

        if (error.apiErrorInfo && error.apiErrorInfo.apiError === 'ItemNotFound') {
            return res.status(400).json({ error: '指定されたアイテムが見つかりません。' });
        }
        res.status(500).json({ error: 'アイテムの売却に失敗しました。', details: error.errorMessage || 'サーバーで予期せぬエラーが発生しました。' });
    }
});

// ----------------------------------------------------
// 島( world_map ) + 建設API
// buildings[] の推奨スキーマ（島あたり1件）
// {
//   buildingId: "watchtower",
//   status: "constructing"|"completed"|"demolished",
//   level: 1,
//   startTime: 123,
//   completionTime: 456,
//   durationMs: 1800000,
//   helpers: ["PLAYFABID", ...],
//   width: 1, height: 1,             // 論理(占有)サイズ（スロット単位）
//   visualWidth: 1, visualHeight: 3,  // 見た目サイズ（スロット単位）
//   tileIndex: 17                     // map_tiles のフレーム（未整備なら同一でOK）
// }
// ----------------------------------------------------
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

function computeMaxHp(logicW, logicH) {
    const w = Math.max(1, Math.trunc(Number(logicW) || 1));
    const h = Math.max(1, Math.trunc(Number(logicH) || 1));
    return w * h * 100;
}

function getActiveShipIdForResource(playFabId) {
    return promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: ['ActiveShipId']
    }).then(result => {
        const value = result?.Data?.ActiveShipId?.Value;
        return (typeof value === 'string' && value.trim()) ? value.trim() : null;
    });
}

async function getActiveShipCargoCapacity(playFabId) {
    const activeShipId = await getActiveShipIdForResource(playFabId);
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

function getBuildingSpec(buildingId) {
    // buildingDefinitions.js direct lookup (PlayFab Catalog independent)
    let building = buildingDefs?.buildings?.[buildingId];
    if (!building && buildingDefs?.buildings) {
        building = Object.values(buildingDefs.buildings).find(b => b && b.id === buildingId) || null;
    }
    if (!building) return null;
    if (!building) return null;

    // sizeLogic と sizeVisual を直接使用（定義されていない場合はslotsRequiredから推測）
    const sizeLogic = building.sizeLogic || inferLogicSizeFromSlotsRequired(building.slotsRequired);
    const sizeVisual = building.sizeVisual || sizeLogic;

    return {
        ItemId: building.id,
        ItemClass: 'Building',
        DisplayName: building.name,
        Description: building.description,
        Category: building.category,
        SlotsRequired: building.slotsRequired,
        BuildTime: building.buildTime,
        Cost: building.cost || {},
        Effects: building.effects || {},
        SizeLogic: sizeLogic,
        SizeVisual: sizeVisual,
        TileIndex: building.tileIndex,
        Tags: [`size_${building.slotsRequired === 1 ? 'small' : building.slotsRequired === 2 ? 'medium' : 'large'}`]
    };
}


function computeConstructionStatus(buildings) {
    const arr = Array.isArray(buildings) ? buildings : [];
    return arr.some(b => b && b.status === 'constructing') ? 'constructing' : null;
}

async function resolveNationIslandByGroupId(groupId) {
    if (!groupId) return null;
    const snapshot = await firestore.collection('nation_groups')
        .where('groupId', '==', groupId)
        .limit(1)
        .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    const data = doc.data() || {};
    const groupName = data.groupName || doc.id;
    if (!groupName) return null;
    const entry = Object.values(NATION_GROUP_BY_RACE).find(item => item && item.groupName === groupName);
    return entry ? entry.island : null;
}

app.post('/api/get-resource-status', async (req, res) => {
    const { playFabId, islandId } = req.body || {};
    if (!playFabId || !islandId) return res.status(400).json({ error: 'playFabId and islandId are required' });

    try {
        const ref = firestore.collection('world_map').doc(islandId);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: 'Island not found' });

        const data = snap.data() || {};
        const biome = data.biome;
        const currency = RESOURCE_BIOME_CURRENCY[biome];
        if (!currency) return res.status(400).json({ error: 'Island not harvestable' });

        const capacity = await getActiveShipCargoCapacity(playFabId);
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
            lastCollectedAt = now;
            await harvestRef.set({ lastCollectedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
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

app.post('/api/collect-resource', async (req, res) => {
    const { playFabId, islandId } = req.body || {};
    if (!playFabId || !islandId) return res.status(400).json({ error: 'playFabId and islandId are required' });

    try {
        const ref = firestore.collection('world_map').doc(islandId);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: 'Island not found' });

        const data = snap.data() || {};
        const biome = data.biome;
        const currency = RESOURCE_BIOME_CURRENCY[biome];
        if (!currency) return res.status(400).json({ error: 'Island not harvestable' });

        const capacity = await getActiveShipCargoCapacity(playFabId);
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
            lastCollectedAt = now;
        }

        const elapsed = Math.max(0, now - lastCollectedAt);
        const units = Math.floor(elapsed / RESOURCE_INTERVAL_MS);
        const amount = Math.min(units, capacity);

        if (amount <= 0) {
            return res.status(400).json({ error: 'Nothing to collect' });
        }

        await promisifyPlayFab(PlayFabServer.AddUserVirtualCurrency, {
            PlayFabId: playFabId,
            VirtualCurrency: currency,
            Amount: amount
        });

        const newLast = lastCollectedAt + amount * RESOURCE_INTERVAL_MS;
        await harvestRef.set({
            lastCollectedAt: new Date(newLast)
        }, { merge: true });

        res.json({ success: true, biome, currency, amount, capacity });
    } catch (error) {
        console.error('[CollectResource] Error:', error);
        res.status(500).json({ error: 'Failed to collect resource', details: error.message });
    }
});

app.post('/api/get-island-details', async (req, res) => {
    const { islandId } = req.body || {};
    if (!islandId) return res.status(400).json({ error: 'islandId is required' });

    try {
        const ref = firestore.collection('world_map').doc(islandId);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: 'Island not found' });

        const data = snap.data() || {};
        const biome = data.biome;
        const biomeInfo = null;
        const islandLevel = Math.max(1, Math.trunc(Number(data.islandLevel) || 1));
        const maxLevel = 5;
        let upgradeCost = null;
        let upgradeHouseId = null;
        let upgradeLevel = null;
        if (islandLevel < maxLevel) {
            upgradeLevel = islandLevel + 1;
            upgradeHouseId = `my_house_lv${upgradeLevel}`;
            const spec = getBuildingSpec(upgradeHouseId);
            if (spec && spec.VirtualCurrencyPrices) {
                upgradeCost = spec.VirtualCurrencyPrices;
            }
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

// ----------------------------------------------------
// 島ショップAPI
// ----------------------------------------------------
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

app.post('/api/get-shop-state', async (req, res) => {
    const { islandId } = req.body || {};
    if (!islandId) return res.status(400).json({ error: 'islandId is required' });
    try {
        const ref = firestore.collection('world_map').doc(islandId);
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

app.post('/api/set-shop-pricing', async (req, res) => {
    const { playFabId, islandId, buyMultiplier, sellMultiplier } = req.body || {};
    if (!playFabId || !islandId) return res.status(400).json({ error: 'playFabId and islandId are required' });
    const buyValue = Number(buyMultiplier);
    const sellValue = Number(sellMultiplier);
    if (!Number.isFinite(buyValue) || !Number.isFinite(sellValue)) {
        return res.status(400).json({ error: 'Invalid pricing values' });
    }
    try {
        const ref = firestore.collection('world_map').doc(islandId);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: 'IslandNotFound' });
        const island = snap.data() || {};
        if (island.ownerId !== playFabId) return res.status(403).json({ error: 'NotOwner' });
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

app.post('/api/set-shop-item-price', async (req, res) => {
    const { playFabId, islandId, itemId, buyPrice, sellPrice } = req.body || {};
    if (!playFabId || !islandId || !itemId) {
        return res.status(400).json({ error: 'Missing parameters' });
    }
    const buyValue = Number(buyPrice);
    const sellValue = Number(sellPrice);
    if (!Number.isFinite(buyValue) || !Number.isFinite(sellValue)) {
        return res.status(400).json({ error: 'Invalid price values' });
    }
    try {
        const ref = firestore.collection('world_map').doc(islandId);
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

app.post('/api/sell-to-shop', async (req, res) => {
    const { playFabId, islandId, itemInstanceId, itemId } = req.body || {};
    if (!playFabId || !islandId || !itemInstanceId || !itemId) {
        return res.status(400).json({ error: 'Missing parameters' });
    }
    try {
        const ref = firestore.collection('world_map').doc(islandId);
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

        await promisifyPlayFab(PlayFabServer.ConsumeItem, {
            PlayFabId: playFabId,
            ItemInstanceId: itemInstanceId,
            ConsumeCount: 1
        });

        const addResult = await promisifyPlayFab(PlayFabServer.AddUserVirtualCurrency, {
            PlayFabId: playFabId,
            VirtualCurrency: VIRTUAL_CURRENCY_CODE,
            Amount: price
        });

        const shopInventory = Array.isArray(island.shopInventory) ? island.shopInventory.slice() : [];
        const idx = shopInventory.findIndex(i => i && i.itemId === itemId);
        if (idx >= 0) {
            shopInventory[idx] = { ...shopInventory[idx], count: Number(shopInventory[idx].count || 0) + 1 };
        } else {
            shopInventory.push({ itemId, count: 1 });
        }
        await ref.update({ shopInventory });
        res.json({ success: true, price, newBalance: addResult?.Balance });
    } catch (error) {
        console.error('[SellToShop] Error:', error?.message || error);
        res.status(500).json({ error: 'Failed to sell item to shop' });
    }
});

app.post('/api/buy-from-shop', async (req, res) => {
    const { playFabId, islandId, itemId } = req.body || {};
    if (!playFabId || !islandId || !itemId) {
        return res.status(400).json({ error: 'Missing parameters' });
    }
    try {
        const ref = firestore.collection('world_map').doc(islandId);
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

        await promisifyPlayFab(PlayFabServer.SubtractUserVirtualCurrency, {
            PlayFabId: playFabId,
            VirtualCurrency: VIRTUAL_CURRENCY_CODE,
            Amount: price
        });

        await promisifyPlayFab(PlayFabServer.GrantItemsToUser, {
            PlayFabId: playFabId,
            ItemIds: [itemId]
        });

        const nextCount = Number(shopInventory[idx].count || 0) - 1;
        if (nextCount <= 0) {
            shopInventory.splice(idx, 1);
        } else {
            shopInventory[idx] = { ...shopInventory[idx], count: nextCount };
        }
        await ref.update({ shopInventory });
        res.json({ success: true, price });
    } catch (error) {
        console.error('[BuyFromShop] Error:', error?.message || error);
        res.status(500).json({ error: 'Failed to buy item from shop' });
    }
});

app.post('/api/start-building-construction', async (req, res) => {
    const { playFabId, islandId, buildingId } = req.body || {};
    if (!playFabId || !islandId || !buildingId) {
        return res.status(400).json({ error: 'playFabId, islandId, buildingId are required' });
    }

    try {
        // 1. 建物定義を取得
        const spec = getBuildingSpec(buildingId);
        if (!spec) {
            return res.status(400).json({ error: '建物が見つかりません。' });
        }

        // 2. コストを確認・支払い
        const costs = spec.Cost || {};
        const costEntries = Object.entries(costs).filter(([, amount]) => Number(amount) > 0);

        if (costEntries.length > 0) {
            // プレイヤーの残高を確認
            const inventory = await promisifyPlayFab(PlayFabServer.GetUserInventory, { PlayFabId: playFabId });
            const balances = inventory?.VirtualCurrency || {};

            // 残高チェック
            for (const [currency, amount] of costEntries) {
                const balance = balances[currency] || 0;
                if (balance < Number(amount)) {
                    return res.status(400).json({
                        error: `${currency} が不足しています。必要: ${amount}, 所持: ${balance}`
                    });
                }
            }

            // コスト支払い
            for (const [currency, amount] of costEntries) {
                await promisifyPlayFab(PlayFabServer.SubtractUserVirtualCurrency, {
                    PlayFabId: playFabId,
                    VirtualCurrency: currency,
                    Amount: Number(amount)
                });
            }
        }

        // 3. 建設処理（Firestoreトランザクション）
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
        const islandName = `${displayName || 'Player'}?${spec.DisplayName || buildingId}`;

const ref = firestore.collection('world_map').doc(islandId);
        const now = Date.now();

        const building = await firestore.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) throw new Error('IslandNotFound');

            const island = snap.data() || {};
            if (island.ownerId !== playFabId) throw new Error('NotOwner');

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

            const buildTimeSeconds = Math.max(1, Math.trunc(Number(spec.BuildTime) || 60));
            const durationMs = buildTimeSeconds * 1000;

            const tileIndexRaw = spec.TileIndex;
            const tileIndexValue = Number.isFinite(Number(tileIndexRaw)) ? Number(tileIndexRaw) : 17;
            const maxHp = computeMaxHp(logicW, logicH);
            const entry = {
                buildingId,
                status: 'constructing',
                level: 1,
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

            tx.update(ref, {
                buildings,
                name: islandName,
                constructionStatus: 'constructing',
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });

            return entry;
        });

        res.json({
            success: true,
            building,
            cost: costs,
            message: `${spec.DisplayName || buildingId} の建設を開始しました。`
        });
    } catch (error) {
        const msg = error?.message || String(error);
        if (msg === 'NotOwner') return res.status(403).json({ error: 'この島の所有者ではありません。' });
        if (msg === 'IslandNotFound') return res.status(404).json({ error: '島が見つかりません。' });
        if (msg === 'AlreadyBuilt') return res.status(400).json({ error: 'この島には既に建物があります。' });
        if (msg === 'InvalidBuildingSize') return res.status(400).json({ error: 'この島のサイズには建てられません。' });
        console.error('[StartBuildingConstruction] Error:', error);
        res.status(500).json({ error: 'Failed to start building construction', details: msg });
    }
});

app.post('/api/upgrade-island-level', async (req, res) => {
    const { playFabId, islandId } = req.body || {};
    if (!playFabId || !islandId) {
        return res.status(400).json({ error: 'playFabId and islandId are required' });
    }

    const nextLevelFrom = (level) => Math.max(1, Math.trunc(Number(level) || 1)) + 1;
    const maxLevel = 5;

    try {
        const ref = firestore.collection('world_map').doc(islandId);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: 'Island not found' });

        const island = snap.data() || {};
        if (island.ownerId !== playFabId) return res.status(403).json({ error: 'NotOwner' });

        const userReadOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['Nation', 'Race', 'NationGroupId']
        });
        const nationGroupId = userReadOnly?.Data?.NationGroupId?.Value || null;
        const nationValue = userReadOnly?.Data?.Nation?.Value || null;
        const raceName = userReadOnly?.Data?.Race?.Value || null;
        if (!nationGroupId && !nationValue && !raceName) return res.status(400).json({ error: 'NationNotSet' });

        let nationIsland = await resolveNationIslandByGroupId(nationGroupId);
        if (!nationIsland && nationValue) {
            nationIsland = String(nationValue).toLowerCase();
        }
        if (!nationIsland && raceName && NATION_GROUP_BY_RACE[raceName]) {
            nationIsland = NATION_GROUP_BY_RACE[raceName].island;
        }
        if (!nationIsland || island.biome !== nationIsland) {
            return res.status(403).json({ error: 'NationMismatch' });
        }

        const currentLevel = Math.max(1, Math.trunc(Number(island.islandLevel) || 1));
        if (currentLevel >= maxLevel) return res.status(400).json({ error: 'MaxLevel' });

        const nextLevel = nextLevelFrom(currentLevel);
        const houseId = `my_house_lv${nextLevel}`;
        const spec = getBuildingSpec(houseId);
        if (!spec) return res.status(400).json({ error: 'BuildingNotFound' });

        const costs = spec.VirtualCurrencyPrices || {};
        const inventory = await promisifyPlayFab(PlayFabServer.GetUserInventory, { PlayFabId: playFabId });
        const balances = inventory?.VirtualCurrency || {};
        const costEntries = Object.entries(costs).filter(([, amount]) => Number(amount) > 0);
        for (const [code, amount] of costEntries) {
            const bal = Number(balances[code] || 0);
            if (bal < Number(amount)) {
                return res.status(400).json({ error: 'InsufficientFunds', details: { currency: code, required: Number(amount), balance: bal } });
            }
        }

        for (const [code, amount] of costEntries) {
            await promisifyPlayFab(PlayFabServer.SubtractUserVirtualCurrency, {
                PlayFabId: playFabId,
                VirtualCurrency: code,
                Amount: Number(amount)
            });
        }

        const sizeLogic = normalizeSize(spec.SizeLogic, inferLogicSizeFromSlotsRequired(spec.SlotsRequired));
        const sizeVisual = normalizeSize(spec.SizeVisual, sizeLogic);
        const logicW = Math.max(1, Math.trunc(sizeLogic.x));
        const logicH = Math.max(1, Math.trunc(sizeLogic.y));
        const visualW = Math.max(1, Math.trunc(sizeVisual.x));
        const visualH = Math.max(1, Math.trunc(sizeVisual.y));
        const tileIndexRaw = spec.TileIndex;
        const tileIndexValue = Number.isFinite(Number(tileIndexRaw)) ? Number(tileIndexRaw) : 17;
        const maxHp = computeMaxHp(logicW, logicH);

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

            const filtered = existing.filter(b => !b || !String(b.buildingId || b.id || '').startsWith('my_house_lv'));
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

app.post('/api/check-building-completion', async (req, res) => {
    const { islandId } = req.body || {};
    if (!islandId) {
        return res.status(400).json({ error: 'islandId is required' });
    }

    try {
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
        const islandName = `${displayName || 'Player'}?${spec.DisplayName || buildingId}`;

const ref = firestore.collection('world_map').doc(islandId);
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

        res.json({ success: true, ...result, message: result.completed ? '建設が完了しました。' : 'まだ完成していません。' });
    } catch (error) {
        const msg = error?.message || String(error);
        if (msg === 'IslandNotFound') return res.status(404).json({ error: '島が見つかりません。' });
        console.error('[CheckBuildingCompletion] Error:', error);
        res.status(500).json({ error: 'Failed to check building completion', details: msg });
    }
});

app.post('/api/help-construction', async (req, res) => {
    const { islandId, helperPlayFabId } = req.body || {};
    if (!islandId || !helperPlayFabId) {
        return res.status(400).json({ error: 'islandId and helperPlayFabId are required' });
    }

    try {
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
        const islandName = `${displayName || 'Player'}?${spec.DisplayName || buildingId}`;

const ref = firestore.collection('world_map').doc(islandId);
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
                name: islandName,
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

app.get('/api/get-constructing-islands', async (_req, res) => {
    try {
        const snapshot = await firestore.collection('world_map').where('constructionStatus', '==', 'constructing').get();
        const islands = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        res.json({ success: true, islands });
    } catch (error) {
        console.error('[GetConstructingIslands] Error:', error);
        res.status(500).json({ error: 'Failed to get constructing islands', details: error.message });
    }
});

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

app.post('/api/get-buildings-by-category', async (req, res) => {
    try {
        const category = String(req?.body?.category || '');
        const islandSize = String(req?.body?.islandSize || '').toLowerCase();
        const entries = Object.entries(buildingDefs?.buildings || {}).filter(([, building]) => {
            if (!building) return false;
            if (building.buildable === false) return false;
            if (!category) return true;
            return building.category === category;
        });

        const buildings = entries.map(([key, building]) => {
            const slotsRequired = Number(building.slotsRequired || 1);
            const sizeTag = `size_${slotsRequired === 1 ? 'small' : slotsRequired === 2 ? 'medium' : 'large'}`;
            return {
                id: building.id || key,
                name: building.name || building.id || key,
                description: building.description || '',
                buildTime: Number(building.buildTime || 0),
                tags: [sizeTag],
                slotsRequired,
                category: building.category || null
            };
        });

        let filtered = buildings;
        if (islandSize) {
            const tag = `size_${islandSize}`;
            filtered = buildings.filter(item => !Array.isArray(item.tags) || item.tags.includes(tag));
        }

        res.json({ success: true, buildings: filtered });
    } catch (error) {
        const msg = error?.message || String(error);
        console.error('[GetBuildingsByCategory] Error:', msg);
        res.status(500).json({ error: 'Failed to get buildings', details: msg });
    }
});

const GLOBAL_CHAT_LIMIT = 200;
const NEARBY_CHAT_LIMIT = 200;
const NEARBY_CHAT_RANGE = 500;
const NEARBY_CHAT_TTL_MS = 10 * 60 * 1000;
const globalChatMessages = [];
const nearbyChatMessages = [];

function trimChat(list, limit) {
    while (list.length > limit) list.shift();
}

function normalizeChatMessage(entry) {
    return {
        message: entry.message,
        displayName: entry.displayName || 'Player',
        timestamp: entry.timestamp
    };
}

app.post('/api/get-global-chat', async (_req, res) => {
    res.json({ success: true, messages: globalChatMessages.map(normalizeChatMessage) });
});

app.post('/api/send-global-chat', async (req, res) => {
    const { message, displayName } = req.body || {};
    const text = String(message || '').trim();
    if (!text) return res.status(400).json({ error: 'Message is required' });
    globalChatMessages.push({
        message: text,
        displayName: String(displayName || 'Player'),
        timestamp: Date.now()
    });
    trimChat(globalChatMessages, GLOBAL_CHAT_LIMIT);
    res.json({ success: true });
});

app.post('/api/get-nearby-chat', async (req, res) => {
    const x = Number(req?.body?.x);
    const y = Number(req?.body?.y);
    const now = Date.now();
    const list = nearbyChatMessages.filter((msg) => (now - msg.timestamp) <= NEARBY_CHAT_TTL_MS);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return res.json({ success: true, messages: list.map(normalizeChatMessage) });
    }
    const filtered = list.filter((msg) => {
        const dx = (Number(msg.x) || 0) - x;
        const dy = (Number(msg.y) || 0) - y;
        return Math.sqrt(dx * dx + dy * dy) <= NEARBY_CHAT_RANGE;
    });
    res.json({ success: true, messages: filtered.map(normalizeChatMessage) });
});

app.post('/api/send-nearby-chat', async (req, res) => {
    const { message, displayName } = req.body || {};
    const text = String(message || '').trim();
    if (!text) return res.status(400).json({ error: 'Message is required' });
    const x = Number(req?.body?.x);
    const y = Number(req?.body?.y);
    nearbyChatMessages.push({
        message: text,
        displayName: String(displayName || 'Player'),
        timestamp: Date.now(),
        x: Number.isFinite(x) ? x : null,
        y: Number.isFinite(y) ? y : null
    });
    trimChat(nearbyChatMessages, NEARBY_CHAT_LIMIT);
    res.json({ success: true });
});

// ----------------------------------------------------
// ★ v41: PlayFabのカタログ情報を読み込んでキャッシュする (複数カタログ対応)
// ----------------------------------------------------
async function loadCatalogCache() {
    console.log('[キャッシュ] PlayFabカタログの読み込みを開始します...');
    const catalogVersions = [GACHA_CATALOG_VERSION, 'ships_catalog', 'buildings_catalog']; // 読み込むカタログのリスト
    try {
        async function loadCatalogVersion(version) {
            try {
                return await promisifyPlayFab(PlayFabServer.GetCatalogItems, { CatalogVersion: version });
            } catch (error) {
                const titleId = PlayFab.settings.titleId || process.env.PLAYFAB_TITLE_ID;
                const localPath = path.join(__dirname, 'playfab_catalog', `title-${titleId}-${version}.json`);
                const msg = error?.errorMessage || error?.message || String(error);
                const code = error?.code ? ` (${error.code})` : '';
                console.warn(`[キャッシュ] PlayFabから ${version} の取得に失敗しました${code}: ${msg}`);
 
                if (fs.existsSync(localPath)) {
                    try {
                        const raw = fs.readFileSync(localPath, 'utf-8');
                        const parsed = JSON.parse(raw);
                        const catalog = parsed?.Catalog || parsed?.data?.Catalog || [];
                        const catalogArray = Array.isArray(catalog) ? catalog : [];
                        const shipCount = catalogArray.filter((it) => it && (it.ItemClass === 'Ship' || (typeof it.ItemId === 'string' && it.ItemId.startsWith('ship_')))).length;

                        // ships_catalog が古い/壊れている場合（例: placeholder itemのみ）に備えて、プロジェクト直下のファイルも試す
                        if (version === 'ships_catalog' && shipCount === 0) {
                            const altPath = path.join(__dirname, 'playfab_ships_catalog.json');
                            if (fs.existsSync(altPath)) {
                                try {
                                    const altRaw = fs.readFileSync(altPath, 'utf-8');
                                    const altParsed = JSON.parse(altRaw);
                                    const altCatalog = altParsed?.Catalog || altParsed?.data?.Catalog || [];
                                    const altArray = Array.isArray(altCatalog) ? altCatalog : [];
                                    const altShipCount = altArray.filter((it) => it && (it.ItemClass === 'Ship' || (typeof it.ItemId === 'string' && it.ItemId.startsWith('ship_')))).length;
                                    console.warn(`[キャッシュ] ${localPath} に船が見つからないため、代替ファイルから ${version} を読み込みます: ${altPath} (${altArray.length}件/Ship ${altShipCount}件)`);
                                    return { Catalog: altArray };
                                } catch (e2) {
                                    console.warn(`[キャッシュ] 代替ファイルの読み込みに失敗しました: ${altPath}`, e2?.message || e2);
                                }
                            }
                        }
                        console.warn(`[キャッシュ] ローカルファイルから ${version} を読み込みます: ${localPath} (${catalogArray.length}件)`);
                        return { Catalog: catalogArray };
                    } catch (e) {
                        console.warn(`[キャッシュ] ローカルファイルの読み込みに失敗しました: ${localPath}`, e?.message || e);
                    }
                } else {
                    console.warn(`[キャッシュ] ローカルファイルが見つかりません: ${localPath}`);
                }

                
                throw error;
            }
        }

        const catalogPromises = catalogVersions.map((version) => loadCatalogVersion(version));

        const results = await Promise.all(catalogPromises);

        const itemMap = {};
        results.forEach(result => {
            if (result.Catalog) {
                result.Catalog.forEach(item => {
                    let customData = {};
                    if (item.CustomData) {
                        try {
                            // PlayFabのCustomDataはキーも値も文字列なので、まずはJSONとしてパース
                            const parsedData = JSON.parse(item.CustomData);
                            // パースしたオブジェクトの各値をさらにパース試行
                            for (const key in parsedData) {
                                const normalizedKey = String(key).trim();
                                try {
                                    // JSON???????????????????
                                    customData[normalizedKey] = JSON.parse(parsedData[key]);
                                } catch (e) {
                                    // ???????????????????????
                                    customData[normalizedKey] = parsedData[key];
                                }
                            }
                        } catch (e) {
                            console.warn(`[キャッシュ] ItemID ${item.ItemId} のCustomDataのパースに失敗しました。`, item.CustomData);
                        }
                    }
                    itemMap[item.ItemId] = {
                        ItemId: item.ItemId,
                        ItemClass: item.ItemClass,
                        DisplayName: item.DisplayName,
                        Description: item.Description,
                        VirtualCurrencyPrices: item.VirtualCurrencyPrices,
                        ...customData
                    };
                });
            }
        });

        catalogCache = itemMap;
        console.log(`[キャッシュ] カタログの読み込み完了。 ${Object.keys(catalogCache).length} 件のアイテム情報をキャッシュしました。`);
    } catch (error) {
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.error('[キャッシュ] 致命的エラー: カタログの読み込みに失敗しました。', error?.errorMessage || error?.message || error);
        console.error(`[キャッシュ] 接続先: ${PlayFab.GetServerUrl ? PlayFab.GetServerUrl() : '(unknown)'}`);
        console.error('PlayFabのTitle ID, Secret Key, CatalogVersion名、ネットワーク疎通(443/tcp)を確認してください。');
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        process.exit(1);
    }
}

// ----------------------------------------------------
// ★ 初期マップデータをFirestoreに投入する
// ----------------------------------------------------
async function initializeMapData() {
    console.log('[マップ初期化] Firestoreの world_map コレクションを確認します...');

    const firestore = admin.firestore();
    const worldMapCollection = firestore.collection('world_map');

    try {
        // 既存のドキュメント数を確認
        const snapshot = await worldMapCollection.limit(1).get();

        if (!snapshot.empty) {
            console.log('[マップ初期化] 既にマップデータが存在します。スキップします。');
            return;
        }

        console.log('[マップ初期化] マップデータが存在しないため、初期データを生成します...');

        // マップデータを生成
        const islands = generateMapData();

        // Firestoreにバッチで書き込む（500件ずつ）
        let batch = firestore.batch();
        let batchCount = 0;
        let totalCount = 0;

        for (const island of islands) {
            const docRef = worldMapCollection.doc(island.id);
            batch.set(docRef, island);
            batchCount++;
            totalCount++;

            // Firestoreのバッチは500件まで
            if (batchCount >= 500) {
                await batch.commit();
                console.log(`[マップ初期化] ${totalCount} / ${islands.length} 件の島データを書き込みました...`);
                // 新しいバッチを作成
                batch = firestore.batch();
                batchCount = 0;
            }
        }

        // 残りのデータを書き込む
        if (batchCount > 0) {
            await batch.commit();
        }

        console.log(`[マップ初期化] 完了。合計 ${totalCount} 件の島データをFirestoreに登録しました。`);

    } catch (error) {
        console.error('[マップ初期化エラー] Firestoreへの書き込みに失敗しました。', error.message);
        // エラーが発生してもサーバーは起動を続ける
    }
}

// ----------------------------------------------------
// ★ v42: サーバー起動 (メイン)
// ----------------------------------------------------
async function main() {
    await loadCatalogCache();

    // ★ 初期マップデータをFirestoreに投入
    await initializeMapData();

    // ★ v41: 共通で渡す定数をまとめる
    const sharedConstants = {
        VIRTUAL_CURRENCY_CODE,
        LEADERBOARD_NAME,
        BATTLE_REWARD_POINTS,
        GACHA_CATALOG_VERSION
    };

    // v40: battle.js を初期化
    // ★★★ 修正: dbインスタンスを渡す ★★★
    const db = admin.database();
    battleRoutes.initializeBattleRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabAdmin, lineClient, catalogCache, sharedConstants, db);

    // ★ ギルド機能を初期化
    guildRoutes.initializeGuildRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabAdmin);

    // ★ 船システムを初期化
    shipRoutes.initializeShipRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabAdmin, catalogCache);

    app.listen(PORT, () => {
        console.log(`サーバーがポート ${PORT} で起動しました。 http://localhost:${PORT}`);
    });
}

// v42: サーバーを起動
main();
