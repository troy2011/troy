// server.js (v43 - Modularized)

require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const line = require('@line/bot-sdk');
const admin = require('firebase-admin');
const { geohashForLocation } = require('geofire-common');
const { buildAuthHelpers } = require('./server/auth');

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
const tarotFortune = require('./server/tarotFortune');
const tarotDeck = require('./server/tarotDeck');
const events = require('./server/events');
const exploration = require('./server/exploration');

// 既存ルート
const battleRoutes = require('./server/routes/battleRoutes');
const guildRoutes = require('./server/routes/guildRoutes');
const shipRoutes = require('./server/routes/shipRoutes');
const shipSkillRoutes = require('./server/routes/shipSkillRoutes');
const battleRoomRoutes = require('./server/routes/battleRoomRoutes');
const npcSnapshotRoutes = require('./server/routes/npcSnapshotRoutes');
const territoryRoutes = require('./server/routes/territoryRoutes');
const weeklyContestRoutes = require('./server/routes/weeklyContestRoutes');
const { initializeCardRoutes } = require('./server/routes/cardRoutes');
const { initializeProphecyScheduler } = require('./server/tarotProphecyScheduler');
const { WeeklyContestScheduler } = require('./server/weeklyContestScheduler');

const PORT = process.env.PORT || 8080;
const VIRTUAL_CURRENCY_CODE = economy.VIRTUAL_CURRENCY_CODE;
const LINE_FRIEND_BONUS_PS = Math.max(0, Math.floor(Number(process.env.LINE_FRIEND_BONUS_PS || 100) || 0));
const LINE_OFFICIAL_ADD_FRIEND_URL = String(process.env.LINE_OFFICIAL_ADD_FRIEND_URL || '').trim();
const LEADERBOARD_NAME = economy.LEADERBOARD_NAME;
const BATTLE_REWARD_POINTS = Number(process.env.BATTLE_REWARD_POINTS || 10);
const GACHA_CATALOG_VERSION = inventory.GACHA_CATALOG_VERSION;
const NATION_EMOJI_BY_NATION = {
    fire: '🔥',
    water: '💧',
    wind: '🌪️',
    earth: '🌱',
    neutral: '🏴'
};
const TROY_ENTRY_DEFAULT_NATION = String(process.env.TROY_ENTRY_DEFAULT_NATION || 'fire').trim().toLowerCase();
const NATION_KING_LINE_USER_IDS_KEY = 'NationKingLineUserIds';
const APP_INVITE_COLLECTION = 'app_invites';
const APP_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
const authHelpers = buildAuthHelpers({ admin });
const {
    verifyLineAccessToken,
    verifyLineFriendshipStatus,
    requireAuthenticatedPlayFabId
} = authHelpers;

const lineClient = new line.Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});
const lineConfig = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
};
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').trim();
if (!lineConfig.channelSecret) {
    console.warn('[LINE] LINE_CHANNEL_SECRET is not configured. Webhook verification will fail.');
}

function getPublicBaseUrl(req) {
    if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL.replace(/\/+$/, '');
    const host = req.get('host');
    if (!host) return '';
    return `https://${host}`;
}

async function resolvePlayFabIdFromLineUser(lineUserId) {
    if (!lineUserId) return '';
    try {
        const linkSnap = await firestore.collection('line_user_links').doc(lineUserId).get();
        return linkSnap.exists ? String(linkSnap.data()?.playFabId || '') : '';
    } catch (error) {
        console.warn('[LINE] Failed to read line_user_links:', error?.message || error);
        return '';
    }
}

function normalizeTroyEntryNation(value) {
    const key = String(value || TROY_ENTRY_DEFAULT_NATION || 'fire').trim().toLowerCase();
    return nation.getNationMappingByNation(key) ? key : 'fire';
}

function getNationKeyByGroupName(groupName) {
    const target = String(groupName || '').trim();
    if (!target) return null;
    const entry = Object.entries(nation.NATION_GROUP_BY_NATION || {}).find(([, mapping]) => mapping?.groupName === target);
    return entry ? entry[0] : null;
}

async function getReadOnlyNationForPlayer(playFabId) {
    if (!playFabId) return null;
    try {
        const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['Nation']
        });
        const value = String(ro?.Data?.Nation?.Value || '').trim().toLowerCase();
        return nation.getNationMappingByNation(value) ? value : null;
    } catch (error) {
        console.warn('[troy-entry] Failed to read king nation:', error?.errorMessage || error?.message || error);
        return null;
    }
}

async function resolveGuestNationForTroyEntry(requestedNationRaw) {
    const requested = String(requestedNationRaw || '').trim().toLowerCase();
    const requestedMapping = nation.getNationMappingByNation(requested);
    if (requestedMapping) {
        try {
            const roomSnap = await getTroyRoomDoc(requestedMapping.groupName).get();
            const roomData = roomSnap.data() || {};
            if (roomSnap.exists && roomData.isOpen) {
                const kingNation = await getReadOnlyNationForPlayer(roomData.updatedBy);
                return kingNation || requested;
            }
        } catch (error) {
            console.warn('[troy-entry] Failed to read requested room:', error?.message || error);
        }
    }

    try {
        const openSnap = await firestore.collection('troy_rooms').where('isOpen', '==', true).limit(1).get();
        if (!openSnap.empty) {
            const roomDoc = openSnap.docs[0];
            const roomNation = getNationKeyByGroupName(roomDoc.id);
            const roomData = roomDoc.data() || {};
            const kingNation = await getReadOnlyNationForPlayer(roomData.updatedBy);
            if (kingNation) return kingNation;
            if (roomNation) return roomNation;
        }
    } catch (error) {
        console.warn('[troy-entry] Failed to find open room:', error?.message || error);
    }

    return normalizeTroyEntryNation(requestedNationRaw);
}

async function addPlayerToNationGroup(playFabId, nationKey) {
    const mapping = nation.getNationMappingByNation(nationKey);
    if (!playFabId || !mapping) return null;
    const deps = createDependencies();
    const groupInfo = await nation.ensureNationGroupExists(firestore, mapping, deps);
    const playerEntity = await getEntityKeyFromPlayFabId(playFabId);
    if (!playerEntity?.Id || !playerEntity?.Type) {
        throw new Error('Player entity not found');
    }
    await ensureTitleEntityToken();
    try {
        await promisifyPlayFab(PlayFabGroups.AddMembers, {
            Group: { Id: groupInfo.groupId, Type: 'group' },
            Members: [playerEntity]
        });
    } catch (error) {
        const msg = String(error?.errorMessage || error?.message || error);
        if (!msg.includes('EntityIsAlreadyMember')) throw error;
    }
    return groupInfo;
}

function formatPoints(value) {
    const num = Math.max(0, Math.floor(Number(value) || 0));
    return num.toLocaleString('ja-JP');
}

async function getPlayerDisplayName(playFabId) {
    if (!playFabId) return '';
    try {
        const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
            PlayFabId: playFabId,
            ProfileConstraints: { ShowDisplayName: true }
        });
        return profile?.PlayerProfile?.DisplayName || '';
    } catch (error) {
        console.warn('[LINE] Failed to fetch display name:', error?.message || error);
        return '';
    }
}

function getTroyRoomDoc(groupName) {
    return firestore.collection('troy_rooms').doc(groupName);
}

function normalizeInviteToken(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
}

function getAppInviteDoc(inviteToken) {
    return firestore.collection(APP_INVITE_COLLECTION).doc(inviteToken);
}

async function readAppInviteRecord(inviteToken) {
    const token = normalizeInviteToken(inviteToken);
    if (!token) return null;
    const snap = await getAppInviteDoc(token).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return {
        token,
        ref: snap.ref,
        inviterPlayFabId: String(data.inviterPlayFabId || '').trim(),
        inviterNation: String(data.inviterNation || '').trim().toLowerCase(),
        inviterDisplayName: String(data.inviterDisplayName || '').trim(),
        createdAtMs: Number(data.createdAtMs || 0) || 0,
        expiresAtMs: Number(data.expiresAtMs || 0) || 0,
        useCount: Number(data.useCount || 0) || 0,
        revoked: data.revoked === true
    };
}

function isAppInviteActive(record, nowMs = Date.now()) {
    if (!record || record.revoked) return false;
    if (!record.inviterPlayFabId) return false;
    if (record.expiresAtMs && record.expiresAtMs < nowMs) return false;
    return true;
}

async function resolveAppInviteAssignment(inviteToken) {
    const record = await readAppInviteRecord(inviteToken);
    if (!isAppInviteActive(record)) return null;

    let inviterNation = record.inviterNation || '';
    if (record.inviterPlayFabId) {
        try {
            const readOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: record.inviterPlayFabId,
                Keys: ['Nation']
            });
            inviterNation = String(readOnly?.Data?.Nation?.Value || '').trim().toLowerCase() || inviterNation;
        } catch (error) {
            console.warn('[app-invite] Failed to refresh inviter nation:', error?.errorMessage || error?.message || error);
        }
    }

    const mapping = nation.getNationMappingByNation(inviterNation);
    if (!mapping) return null;

    let inviterDisplayName = record.inviterDisplayName || '';
    if (!inviterDisplayName && record.inviterPlayFabId) {
        inviterDisplayName = await getPlayerDisplayName(record.inviterPlayFabId);
    }

    return {
        token: record.token,
        recordRef: record.ref,
        inviterPlayFabId: record.inviterPlayFabId,
        inviterDisplayName,
        nation: mapping.island,
        mapping,
        expiresAtMs: record.expiresAtMs
    };
}

// LINE Webhook (Message)
app.post('/line/webhook', express.raw({ type: '*/*' }), async (req, res) => {
    if (!lineConfig.channelSecret) {
        console.warn('[LINE] LINE_CHANNEL_SECRET is not configured.');
        return res.status(500).json({ error: 'LINE channel secret is not configured' });
    }
    const signature = req.headers['x-line-signature'] || '';
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!line.validateSignature(rawBody, lineConfig.channelSecret, signature)) {
        return res.status(401).send('Invalid signature');
    }

    let payload = null;
    try {
        payload = JSON.parse(rawBody);
    } catch (error) {
        console.warn('[LINE] Failed to parse webhook body:', error?.message || error);
        return res.status(400).json({ error: 'Invalid webhook body' });
    }

    const events = Array.isArray(payload?.events) ? payload.events : [];
    const deps = createDependencies();

    const handlePointsRequest = async (event) => {
        if (!event || event.type !== 'message') return;
        if (event.message?.type !== 'text') return;
        const text = String(event.message?.text || '').trim();
        if (!text) return;
        const isPoints = (text === 'ポイント確認');
        const isIdQr = (text === 'ID表示');
        const isStatus = (text === '営業状況');
        if (!isPoints && !isIdQr && !isStatus) return;

        const replyToken = event.replyToken;
        const lineUserId = event.source?.userId;
        if (!replyToken) return;
        if (!lineUserId) {
            await lineClient.replyMessage(replyToken, {
                type: 'text',
                text: 'LINEユーザー情報を取得できませんでした。'
            });
            return;
        }

        const playFabId = await resolvePlayFabIdFromLineUser(lineUserId);

        if (isPoints) {
            if (!playFabId) {
                await lineClient.replyMessage(replyToken, {
                    type: 'text',
                    text: '連携が完了していません。TROYにログイン後、もう一度お試しください。'
                });
                return;
            }
            try {
                const points = await deps.getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE);
                await lineClient.replyMessage(replyToken, {
                    type: 'text',
                    text: `現在のポイント：${formatPoints(points)}${VIRTUAL_CURRENCY_CODE}`
                });
            } catch (error) {
                console.warn('[LINE] Failed to fetch points:', error?.message || error);
                await lineClient.replyMessage(replyToken, {
                    type: 'text',
                    text: 'ポイントの取得に失敗しました。少し時間をおいて再度お試しください。'
                });
            }
            return;
        }

        if (isIdQr) {
            const baseUrl = getPublicBaseUrl(req);
            if (!baseUrl) {
                await lineClient.replyMessage(replyToken, {
                    type: 'text',
                    text: 'QRコードの生成に失敗しました。時間をおいて再度お試しください。'
                });
                return;
            }
            const qrUrl = `${baseUrl}/line/qr/${encodeURIComponent(lineUserId)}`;
            const messages = [
                {
                    type: 'text',
                    text: playFabId
                        ? 'あなたのID QRコードです。'
                        : '連携前のためLINE IDのQRコードを表示します。'
                },
                {
                    type: 'image',
                    originalContentUrl: qrUrl,
                    previewImageUrl: qrUrl
                }
            ];
            await lineClient.replyMessage(replyToken, messages);
            return;
        }

        if (isStatus) {
            if (!playFabId) {
                await lineClient.replyMessage(replyToken, {
                    type: 'text',
                    text: '連携が完了していません。TROYにログイン後、もう一度お試しください。'
                });
                return;
            }
            try {
                const nationValue = await nation.getNationForPlayer(playFabId, { promisifyPlayFab, PlayFabServer });
                if (!nationValue) {
                    await lineClient.replyMessage(replyToken, {
                        type: 'text',
                        text: '国情報が取得できませんでした。TROYに再ログインしてからお試しください。'
                    });
                    return;
                }
                const mapping = nation.getNationMappingByNation(nationValue);
                if (!mapping) {
                    await lineClient.replyMessage(replyToken, {
                        type: 'text',
                        text: '国情報が不正なため、営業状況を取得できませんでした。'
                    });
                    return;
                }
                const roomRef = getTroyRoomDoc(mapping.groupName);
                const roomSnap = await roomRef.get();
                const roomData = roomSnap.data() || {};
                const isOpen = !!roomData.isOpen;
                const kingPlayFabId = String(roomData.updatedBy || '').trim();
                const kingName = await getPlayerDisplayName(kingPlayFabId);

                const membersSnap = await roomRef.collection('members').get();
                const memberCount = membersSnap.size || 0;

                const statusText = isOpen ? 'OPEN' : 'CLOSE';
                const displayKing = kingName || '王';
                const message = [
                    '【TROY 営業状況】',
                    `状態: ${statusText}`,
                    `王: ${displayKing}`,
                    `入店人数: ${memberCount}人`
                ].join('\n');
                await lineClient.replyMessage(replyToken, { type: 'text', text: message });
            } catch (error) {
                console.warn('[LINE] Failed to fetch troy status:', error?.message || error);
                await lineClient.replyMessage(replyToken, {
                    type: 'text',
                    text: '営業状況の取得に失敗しました。少し時間をおいて再度お試しください。'
                });
            }
        }
    };

    await Promise.all(events.map((event) => handlePointsRequest(event)));
    return res.status(200).json({ ok: true });
});

// LINE ID QR (for rich menu)
app.get('/line/qr/:lineUserId', async (req, res) => {
    const lineUserId = String(req.params?.lineUserId || '').trim();
    if (!lineUserId) {
        return res.status(400).json({ error: 'lineUserId is required' });
    }
    const playFabId = await resolvePlayFabIdFromLineUser(lineUserId);
    const payload = playFabId ? `TROY:${playFabId}` : `LINE:${lineUserId}`;
    const encoded = encodeURIComponent(payload);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=1&data=${encoded}`;
    return res.redirect(qrUrl);
});

app.use(express.json());

configurePlayFab({
    titleId: process.env.PLAYFAB_TITLE_ID,
    secretKey: process.env.PLAYFAB_SECRET_KEY
});

// Tarot engine backward-compat routes for extensionless ESM imports.
// Old cached GameController.js may import "./HandEvaluator" (without ".js").
app.get('/js/tarot-engine/HandEvaluator', (req, res) => {
    return res.sendFile(path.join(__dirname, 'public', 'js', 'tarot-engine', 'HandEvaluator.js'));
});
app.get('/js/tarot-engine/GameController', (req, res) => {
    return res.sendFile(path.join(__dirname, 'public', 'js', 'tarot-engine', 'GameController.js'));
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

// Display page + stream
const displayClients = new Set();
const displayEventBuffer = [];
const DISPLAY_EVENT_LIMIT = 40;

function normalizeDisplayEvent(input) {
    const now = Date.now();
    const type = String(input?.type || 'splash').toLowerCase();
    const label = String(input?.label || '').trim().slice(0, 120);
    let x = Number(input?.x);
    let y = Number(input?.y);

    if (Number.isFinite(x) && x >= 0 && x <= 1) x *= 100;
    if (Number.isFinite(y) && y >= 0 && y <= 1) y *= 100;

    if (!Number.isFinite(x)) x = null;
    if (!Number.isFinite(y)) y = null;

    if (Number.isFinite(x)) x = Math.min(95, Math.max(5, x));
    if (Number.isFinite(y)) y = Math.min(95, Math.max(5, y));

    return {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        label,
        x,
        y,
        at: now
    };
}

function pushDisplayEvent(event) {
    displayEventBuffer.push(event);
    if (displayEventBuffer.length > DISPLAY_EVENT_LIMIT) {
        displayEventBuffer.splice(0, displayEventBuffer.length - DISPLAY_EVENT_LIMIT);
    }
}

function sendDisplayEvent(res, event) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function broadcastDisplayEvent(event) {
    for (const client of displayClients) {
        try {
            sendDisplayEvent(client.res, event);
        } catch (error) {
            displayClients.delete(client);
            try {
                client.res.end();
            } catch (closeError) {
                // ignore
            }
        }
    }
}

function emitDisplayEvent(payload) {
    const event = normalizeDisplayEvent(payload);
    pushDisplayEvent(event);
    broadcastDisplayEvent(event);
    return event;
}

app.get('/display', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

app.get('/api/display-stream', (req, res) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();

    const client = { res };
    displayClients.add(client);

    sendDisplayEvent(res, { type: 'connected', at: Date.now() });
    if (displayEventBuffer.length) {
        sendDisplayEvent(res, { type: 'batch', events: displayEventBuffer.slice(-6) });
    }

    const keepAlive = setInterval(() => {
        res.write(':keep-alive\n\n');
    }, 20000);

    req.on('close', () => {
        clearInterval(keepAlive);
        displayClients.delete(client);
    });
});

app.post('/api/display-event', (req, res) => {
    const event = normalizeDisplayEvent(req.body || {});
    pushDisplayEvent(event);
    broadcastDisplayEvent(event);
    res.json({ ok: true });
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

function stripNationEmoji(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    return raw.replace(/^(🔥|💧|🌪️|🌱|🏴)\s*/, '').trim();
}

function buildNationDisplayName(baseName, nation) {
    const key = String(nation || '').toLowerCase();
    const emoji = NATION_EMOJI_BY_NATION[key] || '';
    const base = stripNationEmoji(baseName);
    if (!emoji) return base;
    return base ? `${emoji} ${base}` : emoji;
}

async function getNationKingLineUserIds() {
    try {
        const data = await promisifyPlayFab(PlayFabAdmin.GetTitleData, { Keys: [NATION_KING_LINE_USER_IDS_KEY] });
        const raw = data?.Data?.[NATION_KING_LINE_USER_IDS_KEY] || '';
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        console.warn('[kingLineUserId] Failed to load TitleData:', e?.errorMessage || e?.message || e);
        return {};
    }
}

async function ensureNationDisplayName(playFabId, nation, preferredBaseName) {
    if (!playFabId || !nation) return { baseName: '', displayName: '' };
    let currentDisplayName = '';
    try {
        const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
            PlayFabId: playFabId,
            ProfileConstraints: { ShowDisplayName: true }
        });
        currentDisplayName = profile?.PlayerProfile?.DisplayName || '';
    } catch (e) {
        console.warn('[displayName] GetPlayerProfile failed:', e?.errorMessage || e?.message || e);
    }

    const baseName = stripNationEmoji(preferredBaseName || currentDisplayName || playFabId);
    const nextDisplayName = buildNationDisplayName(baseName, nation);
    if (nextDisplayName && nextDisplayName !== currentDisplayName) {
        try {
            await promisifyPlayFab(PlayFabAdmin.UpdateUserTitleDisplayName, {
                PlayFabId: playFabId,
                DisplayName: nextDisplayName
            });
        } catch (e) {
            console.warn('[displayName] UpdateUserTitleDisplayName failed:', e?.errorMessage || e?.message || e);
        }
    }
    return { baseName, displayName: nextDisplayName || currentDisplayName };
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

    if (Object.keys(totals).length === 0) {
        if (Array.isArray(item?.PriceOptions)) {
            item.PriceOptions.forEach((option) => {
                const prices = Array.isArray(option?.Prices) ? option.Prices : [];
                prices.forEach((price) => {
                    const priceAmounts = Array.isArray(price?.Amounts) ? price.Amounts : [];
                    priceAmounts.forEach((entry) => {
                        pushAmount(entry?.ItemId || entry?.itemId, entry?.Amount ?? entry?.amount);
                    });
                });
            });
        } else if (Array.isArray(item?.PriceOptions?.Prices)) {
            item.PriceOptions.Prices.forEach((price) => {
                const priceAmounts = Array.isArray(price?.Amounts) ? price.Amounts : [];
                priceAmounts.forEach((entry) => {
                    pushAmount(entry?.ItemId || entry?.itemId, entry?.Amount ?? entry?.amount);
                });
            });
        }
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
        const tokenResult = await promisifyPlayFab(PlayFabAuthentication.GetEntityToken, {});
        const titleEntity = tokenResult?.Entity;
        if (!titleEntity?.Id || !titleEntity?.Type) {
            throw new Error('Title entity token is missing Entity.');
        }

        const itemIds = [];
        let token = null;
        do {
            const result = await promisifyPlayFab(PlayFabEconomy.SearchItems, {
                Count: 50,
                Entity: titleEntity,
                ContinuationToken: token || undefined
            });
            const page = Array.isArray(result?.Items) ? result.Items : [];
            page.forEach((item) => {
                if (item?.Id) itemIds.push(item.Id);
            });
            token = result?.ContinuationToken || null;
            console.log(`[カタログ] ページ取得: ${page.length}件 (累計: ${itemIds.length}件)`);
        } while (token);

        const uniqueIds = Array.from(new Set(itemIds));
        const items = [];
        for (let i = 0; i < uniqueIds.length; i += 50) {
            const batchIds = uniqueIds.slice(i, i + 50);
            try {
                const batchResult = await promisifyPlayFab(PlayFabEconomy.GetItems, {
                    Entity: titleEntity,
                    Ids: batchIds
                });
                const batchItems = Array.isArray(batchResult?.Items) ? batchResult.Items : [];
                items.push(...batchItems);
            } catch (error) {
                console.warn('[カタログ] GetItems failed:', error?.errorMessage || error?.message || error);
            }
        }

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
        const pickAlternateFriendlyId = (entry) => {
            if (!Array.isArray(entry?.AlternateIds)) return null;
            const friendlyAlt = entry.AlternateIds.find((alt) => String(alt?.Type || '').toLowerCase() === 'friendlyid');
            return friendlyAlt?.Value ? String(friendlyAlt.Value).trim() : null;
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

        const localPriceMap = (() => {
            const fallback = {};
            try {
                const localCandidates = [
                    path.join(__dirname, 'data', 'local', 'catalog_v2_items.json'),
                    path.join(__dirname, 'catalog_v2_items.json')
                ];
                const localPath = localCandidates.find((candidate) => fs.existsSync(candidate));
                if (!localPath) return fallback;
                const raw = fs.readFileSync(localPath, 'utf8');
                const parsed = JSON.parse(raw);
                const items = Array.isArray(parsed?.Items) ? parsed.Items : [];
                items.forEach((localItem) => {
                    const altIds = Array.isArray(localItem?.AlternateIds) ? localItem.AlternateIds : [];
                    const friendly = altIds.find((entry) => String(entry?.Type || '').toLowerCase() === 'friendlyid')?.Value;
                    if (!friendly) return;
                    const amounts = normalizePriceAmounts(localItem);
                    const entry = {
                        PriceAmounts: amounts,
                        PriceOptions: localItem?.PriceOptions,
                        VirtualCurrencyPrices: localItem?.VirtualCurrencyPrices
                    };
                    fallback[String(friendly)] = entry;
                });
            } catch (error) {
                console.warn('[カタログ] ローカルカタログの読み込みに失敗しました。', error?.message || error);
            }
            return fallback;
        })();

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
            const altFriendlyId = pickAlternateFriendlyId(item);
            const resolvedFriendlyId = normalizeCurrencyCode(item.FriendlyId)
                || normalizeCurrencyCode(altFriendlyId)
                || pickAlternateCurrencyId(item)
                || null;
            const normalizedPriceAmounts = normalizePriceAmounts(item);
            const customPriceSource = (() => {
                const direct = customData?.PriceAmounts ?? customData?.priceAmounts ?? null;
                if (Array.isArray(direct)) return direct;
                if (direct && typeof direct === 'object') {
                    return Object.entries(direct).map(([code, amount]) => ({
                        ItemId: code,
                        Amount: Number(amount)
                    }));
                }
                const legacy = customData?.VirtualCurrencyPrices ?? customData?.virtualCurrencyPrices ?? customData?.Cost ?? null;
                if (legacy && typeof legacy === 'object') {
                    return Object.entries(legacy).map(([code, amount]) => ({
                        ItemId: code,
                        Amount: Number(amount)
                    }));
                }
                return null;
            })();
            const resolvedPriceAmounts = (normalizedPriceAmounts.length > 0)
                ? normalizedPriceAmounts
                : (Array.isArray(customPriceSource) ? customPriceSource : []);
            const localFallback = resolvedFriendlyId ? localPriceMap[resolvedFriendlyId] : null;
            const finalPriceAmounts = (resolvedPriceAmounts.length > 0)
                ? resolvedPriceAmounts
                : (Array.isArray(localFallback?.PriceAmounts) ? localFallback.PriceAmounts : []);
            const finalPriceOptions = item.PriceOptions || localFallback?.PriceOptions;
            const finalVirtualCurrencyPrices = item.VirtualCurrencyPrices || localFallback?.VirtualCurrencyPrices;

            itemMap[item.Id] = {
                ItemId: item.Id,
                ItemClass: item.ContentType || item.Type,
                FriendlyId: resolvedFriendlyId,
                DisplayName: displayName,
                Description: description,
                PriceOptions: finalPriceOptions,
                VirtualCurrencyPrices: finalVirtualCurrencyPrices,
                PriceAmounts: finalPriceAmounts,
                ...customData
            };

            const isShip = String(item?.ContentType || item?.Type || '').toLowerCase() === 'ship';
            if (isShip && finalPriceAmounts.length === 0) {
                console.warn('[カタログ] Ship has no price data', {
                    itemId: item.Id,
                    displayName,
                    friendlyId: resolvedFriendlyId,
                    customKeys: Object.keys(customData || {})
                });
            }

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
        lineClient,
        catalogCache,
        catalogCurrencyMap,
        ensureTitleEntityToken,
        getGroupDataValue,
        setGroupDataValues,
        getEntityKeyFromPlayFabId,
        requireAuthenticatedPlayFabId,
        NATION_GROUP_BY_RACE: nation.NATION_GROUP_BY_RACE,
        // economy関数
        getEntityKeyForPlayFabId: (playFabId) => economy.getEntityKeyForPlayFabId(playFabId, { getEntityKeyFromPlayFabId }),
        getAllInventoryItems: (entityKey) => economy.getAllInventoryItems(entityKey, { promisifyPlayFab, PlayFabEconomy }),
        getVirtualCurrencyMap: (items) => economy.getVirtualCurrencyMap(items, { catalogCurrencyMap, catalogCache }),
        addEconomyItem: (playFabId, itemId, amount, options) => {
            const entityKeyOverride = (options && options.Id && options.Type) ? options : options?.entityKeyOverride;
            const idempotencyId = options?.idempotencyId;
            return economy.addEconomyItem(playFabId, itemId, amount, {
                promisifyPlayFab,
                PlayFabEconomy,
                getEntityKeyFromPlayFabId,
                entityKeyOverride,
                idempotencyId,
                resolveItemId: resolveCatalogItemId
            });
        },
        subtractEconomyItem: (playFabId, itemId, amount, options) => {
            const entityKeyOverride = (options && options.Id && options.Type) ? options : options?.entityKeyOverride;
            const idempotencyId = options?.idempotencyId;
            return economy.subtractEconomyItem(playFabId, itemId, amount, {
                promisifyPlayFab,
                PlayFabEconomy,
                getEntityKeyFromPlayFabId,
                entityKeyOverride,
                idempotencyId,
                resolveItemId: resolveCatalogItemId
            });
        },
        getCurrencyBalance: (playFabId, currencyId) => economy.getCurrencyBalance(playFabId, currencyId, { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId, catalogCurrencyMap, catalogCache }),
        applyTax: economy.applyTax,
        // nation関数
        getNationTaxRateBps: (nation, fs, d) => require('./server/nation').getNationTaxRateBps(nation, fs || firestore, d || createDependencies()),
        addNationTreasury: (nation, amount, fs, d, options) => require('./server/nation').addNationTreasury(nation, amount, fs || firestore, d || createDependencies(), options),
        getMapOccupationNation: (mapId) => require('./server/nation').getMapOccupationNation(mapId, { promisifyPlayFab, PlayFabAdmin }),
        setMapOccupationNation: (mapId, nation) => require('./server/nation').setMapOccupationNation(mapId, nation, { promisifyPlayFab, PlayFabAdmin, firestore, admin }),
        // island関数
        transferOwnedIslands: (fs, fromId, toId, toNation) => island.transferOwnedIslands(fs, fromId, toId, toNation, { promisifyPlayFab, PlayFabServer }),
        createStarterIsland: createStarterIsland,
        relocateActiveShip: (fs, playFabId, pos) => island.relocateActiveShip(fs, playFabId, pos, { promisifyPlayFab, PlayFabServer, admin }),
        emitDisplayEvent
    };
}

// スターター島作成（認証時に必要）
async function createStarterIsland({ playFabId, raceName, nationIsland, displayName }) {
    const MAP_SIZE = 100;
    const STARTER_SAFE_MARGIN = 12;
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
    const preferredStarterRange = {
        minX: Math.min(baseRange.maxX, Math.max(baseRange.minX, baseRange.minX + STARTER_SAFE_MARGIN)),
        maxX: Math.max(baseRange.minX, Math.min(baseRange.maxX, baseRange.maxX - STARTER_SAFE_MARGIN)),
        minY: Math.min(baseRange.maxY, Math.max(baseRange.minY, baseRange.minY + STARTER_SAFE_MARGIN)),
        maxY: Math.max(baseRange.minY, Math.min(baseRange.maxY, baseRange.maxY - STARTER_SAFE_MARGIN))
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
        const spawnRange = base ? baseRange : preferredStarterRange;
        const bx = base?.x ?? Math.floor(Math.random() * (spawnRange.maxX - spawnRange.minX + 1)) + spawnRange.minX;
        const by = base?.y ?? Math.floor(Math.random() * (spawnRange.maxY - spawnRange.minY + 1)) + spawnRange.minY;
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
    const respawnCandidates = [
        { x: baseX, y: chosen.y + islandSize.h }, // 南側: 島を画面上に見せやすい
        { x: baseX, y: chosen.y - 1 },
        { x: chosen.x + islandSize.w, y: baseY },
        { x: chosen.x - 1, y: baseY },
        { x: chosen.x + islandSize.w, y: chosen.y + islandSize.h },
        { x: chosen.x - 1, y: chosen.y + islandSize.h },
        { x: chosen.x + islandSize.w, y: chosen.y - 1 },
        { x: chosen.x - 1, y: chosen.y - 1 }
    ];
    for (const candidate of respawnCandidates) {
        if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) continue;
        if (candidate.x < 0 || candidate.x >= MAP_SIZE || candidate.y < 0 || candidate.y >= MAP_SIZE) continue;
        respawnTileX = candidate.x;
        respawnTileY = candidate.y;
        break;
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

async function deleteCollectionDocs(collectionRef, batchSize = 400) {
    let snapshot = await collectionRef.limit(batchSize).get();
    while (!snapshot.empty) {
        const batch = firestore.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        snapshot = await collectionRef.limit(batchSize).get();
    }
}

async function cleanupFirestoreForPlayFabId(playFabId) {
    if (!playFabId) return;
    try {
        await island.deleteOwnedIslands(firestore, playFabId, null);
    } catch (e) {
        console.warn('[cleanup] Failed to delete owned islands:', e?.errorMessage || e?.message || e);
    }
    try {
        const shipsSnap = await firestore.collection('ships').where('playFabId', '==', playFabId).get();
        if (!shipsSnap.empty) {
            let batch = firestore.batch();
            let count = 0;
            shipsSnap.docs.forEach((doc) => {
                batch.delete(doc.ref);
                count += 1;
                if (count >= 400) {
                    batch.commit();
                    batch = firestore.batch();
                    count = 0;
                }
            });
            if (count > 0) await batch.commit();
        }
    } catch (e) {
        console.warn('[cleanup] Failed to delete ships:', e?.errorMessage || e?.message || e);
    }
    try {
        const notifRef = firestore.collection('notifications').doc(playFabId);
        await deleteCollectionDocs(notifRef.collection('items'));
        await notifRef.delete();
    } catch (e) {
        console.warn('[cleanup] Failed to delete notifications:', e?.errorMessage || e?.message || e);
    }
}

// ログインAPI
app.post('/api/login-playfab', async (req, res) => {
    const { lineAccessToken } = req.body || {};
    if (!lineAccessToken) return res.status(400).json({ error: 'lineAccessToken is required' });

    try {
        const lineProfile = await verifyLineAccessToken(lineAccessToken);
        const lineUserId = lineProfile.userId;
        const displayName = lineProfile.displayName || String(req.body?.displayName || '').trim();
        const pictureUrl = lineProfile.pictureUrl || String(req.body?.pictureUrl || '').trim();
        const loginResult = await promisifyPlayFab(PlayFabServer.LoginWithCustomID, {
            CustomId: lineUserId,
            CreateAccount: true
        });

        const playFabId = loginResult?.PlayFabId;
        if (!playFabId) {
            return res.status(500).json({ error: 'PlayFab login failed' });
        }

        try {
            const linkRef = firestore.collection('line_user_links').doc(lineUserId);
            const linkSnap = await linkRef.get();
            const previousPlayFabId = linkSnap.exists ? String(linkSnap.data()?.playFabId || '') : '';
            if (previousPlayFabId && previousPlayFabId !== playFabId) {
                await cleanupFirestoreForPlayFabId(previousPlayFabId);
            }
            await linkRef.set({
                playFabId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (e) {
            console.warn('[login-playfab] Failed to sync line_user_links:', e?.errorMessage || e?.message || e);
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
            Keys: ['Race', 'Nation', 'BaseDisplayName']
        });
        const troyEntryRequested = String(req.body?.action || '').trim().toLowerCase() === 'troy-entry'
            || req.body?.troyEntry === true;
        let needsRaceSelection = !(readOnly?.Data?.Race?.Value);
        let nationValue = String(readOnly?.Data?.Nation?.Value || '').toLowerCase();
        if (troyEntryRequested && (needsRaceSelection || !nationValue)) {
            const guestNation = await resolveGuestNationForTroyEntry(req.body?.troyNation || req.body?.entryNation);
            const guestMapping = nation.getNationMappingByNation(guestNation);
            try {
                await nation.ensureNationGroupExists(firestore, guestMapping, createDependencies());
            } catch (groupError) {
                console.warn('[login-playfab] Guest nation group ensure failed:', groupError?.errorMessage || groupError?.message || groupError);
            }
            try {
                await addPlayerToNationGroup(playFabId, guestNation);
            } catch (memberError) {
                console.warn('[login-playfab] Guest nation member add failed:', memberError?.errorMessage || memberError?.message || memberError);
            }
            const baseName = String(displayName || '').trim().slice(0, 30) || `Guest-${String(playFabId).slice(-4)}`;
            try {
                await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                    PlayFabId: playFabId,
                    Statistics: [
                        { StatisticName: 'Level', Value: 1 },
                        { StatisticName: 'HP', Value: 5 },
                        { StatisticName: 'MaxHP', Value: 5 },
                        { StatisticName: 'MP', Value: 15 },
                        { StatisticName: 'MaxMP', Value: 15 },
                        { StatisticName: 'ちから', Value: 2 },
                        { StatisticName: 'みのまもり', Value: 5 },
                        { StatisticName: 'すばやさ', Value: 10 },
                        { StatisticName: 'かしこさ', Value: 15 },
                        { StatisticName: 'きようさ', Value: 10 }
                    ]
                });
            } catch (statsError) {
                console.warn('[login-playfab] Guest stats setup failed:', statsError?.errorMessage || statsError?.message || statsError);
            }
            try {
                await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                    PlayFabId: playFabId,
                    Data: {
                        Race: readOnly?.Data?.Race?.Value || 'Human',
                        Nation: guestNation,
                        BaseDisplayName: baseName,
                        IsGuest: 'true',
                        GuestEntryCreatedAt: new Date().toISOString()
                    }
                });
                needsRaceSelection = false;
                nationValue = guestNation;
            } catch (guestError) {
                console.warn('[login-playfab] Guest profile setup failed:', guestError?.errorMessage || guestError?.message || guestError);
            }
        }
        const storedBaseName = readOnly?.Data?.BaseDisplayName?.Value || '';
        if (nationValue) {
            const result = await ensureNationDisplayName(playFabId, nationValue, storedBaseName || displayName);
            if (result.baseName && storedBaseName !== result.baseName) {
                try {
                    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                        PlayFabId: playFabId,
                        Data: { BaseDisplayName: result.baseName }
                    });
                } catch (e) {
                    console.warn('[login-playfab] UpdateUserReadOnlyData(BaseDisplayName) failed:', e?.errorMessage || e?.message || e);
                }
            }
        }

        const firebaseToken = await admin.auth().createCustomToken(playFabId);

        return res.json({
            playFabId,
            needsRaceSelection,
            troyEntryNation: troyEntryRequested ? (nationValue || null) : null,
            firebaseToken
        });
    } catch (error) {
        const message = error?.errorMessage || error?.message || error;
        if (String(message).includes('LineAccessTokenRequired') || String(message).includes('HTTP 401')) {
            return res.status(401).json({ error: 'LINE authentication failed', details: message });
        }
        console.error('[login-playfab] Error:', message);
        return res.status(500).json({ error: 'PlayFab login failed', details: message });
    }
});

app.post('/api/get-app-invite-info', async (req, res) => {
    const inviteToken = normalizeInviteToken(req.body?.inviteToken);
    if (!inviteToken) return res.status(400).json({ error: 'inviteToken is required', valid: false });

    try {
        const invite = await resolveAppInviteAssignment(inviteToken);
        if (!invite) {
            return res.status(404).json({ error: 'InviteNotFound', valid: false });
        }
        return res.json({
            valid: true,
            inviterDisplayName: invite.inviterDisplayName || '招待プレイヤー',
            inviterPlayFabId: invite.inviterPlayFabId,
            nation: invite.nation,
            expiresAtMs: invite.expiresAtMs
        });
    } catch (error) {
        const message = error?.errorMessage || error?.message || String(error);
        console.error('[get-app-invite-info] Error:', message);
        return res.status(500).json({ error: 'Failed to resolve invite', details: message, valid: false });
    }
});

app.post('/api/apply-app-invite', async (req, res) => {
    const { playFabId, inviteToken, inviteNation, displayName } = req.body || {};
    const authenticatedPlayFabId = await requireAuthenticatedPlayFabId(req, res, playFabId);
    if (!authenticatedPlayFabId) return;

    try {
        const fixedInviteNation = String(inviteNation || '').trim().toLowerCase();
        const fixedInviteMapping = fixedInviteNation ? nation.getNationMappingByNation(fixedInviteNation) : null;
        if (fixedInviteNation && !fixedInviteMapping) {
            return res.status(400).json({ error: 'InvalidInviteNation' });
        }
        const tokenInviteAssignment = fixedInviteMapping ? null : await resolveAppInviteAssignment(inviteToken);
        const inviteAssignment = fixedInviteMapping ? {
            mapping: fixedInviteMapping,
            nation: fixedInviteNation,
            inviterPlayFabId: '',
            inviterDisplayName: ''
        } : tokenInviteAssignment;
        if (!inviteAssignment?.mapping || !inviteAssignment?.nation) {
            return res.status(400).json({ error: 'InviteRequired' });
        }

        const targetNation = String(inviteAssignment.nation || '').trim().toLowerCase();
        const targetMapping = nation.getNationMappingByNation(targetNation);
        if (!targetMapping) return res.status(400).json({ error: 'InvalidInviteNation' });

        const readOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: authenticatedPlayFabId,
            Keys: ['Nation', 'BaseDisplayName', 'IsKing']
        });
        const prevNation = String(readOnly?.Data?.Nation?.Value || '').trim().toLowerCase();
        const isKing = String(readOnly?.Data?.IsKing?.Value || '').trim().toLowerCase() === 'true';
        if (isKing) {
            return res.json({
                success: true,
                skipped: true,
                reason: 'IsKing',
                changed: false,
                previousNation: prevNation || null,
                nation: prevNation || null
            });
        }
        const baseDisplayName = String(readOnly?.Data?.BaseDisplayName?.Value || displayName || '').trim();
        const changed = prevNation !== targetNation;
        const deps = createDependencies();
        const targetGroup = await nation.ensureNationGroupExists(firestore, targetMapping, deps);
        const playerEntity = await getEntityKeyFromPlayFabId(authenticatedPlayFabId);
        if (!playerEntity?.Id || !playerEntity?.Type) {
            return res.status(400).json({ error: 'Failed to resolve player entity' });
        }

        await ensureTitleEntityToken();
        if (changed && prevNation) {
            const prevMapping = nation.getNationMappingByNation(prevNation);
            if (prevMapping) {
                try {
                    const prevGroup = await nation.ensureNationGroupExists(firestore, prevMapping, deps);
                    await promisifyPlayFab(PlayFabGroups.RemoveMembers, {
                        Group: { Id: prevGroup.groupId, Type: 'group' },
                        Members: [playerEntity]
                    });
                } catch (error) {
                    console.warn('[apply-app-invite] RemoveMembers failed:', error?.errorMessage || error?.message || error);
                }
            }
        }

        try {
            await promisifyPlayFab(PlayFabGroups.AddMembers, {
                Group: { Id: targetGroup.groupId, Type: 'group' },
                Members: [playerEntity]
            });
        } catch (error) {
            const msg = String(error?.errorMessage || error?.message || error);
            if (!msg.includes('EntityIsAlreadyMember')) throw error;
        }

        const displayResult = await ensureNationDisplayName(authenticatedPlayFabId, targetNation, baseDisplayName || displayName || '');
        const avatarColor = nation.getAvatarColorForNation(targetNation) || 'brown';
        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: authenticatedPlayFabId,
            Data: {
                Nation: targetNation,
                BaseDisplayName: displayResult.baseName || baseDisplayName || displayName || '',
                AvatarColor: avatarColor,
                IsKing: 'false',
                InvitedByPlayFabId: inviteAssignment.inviterPlayFabId || '',
                InvitedByDisplayName: inviteAssignment.inviterDisplayName || '',
                InviteAcceptedAt: String(Date.now()),
                ...(changed ? { NationChangedAt: String(Date.now()) } : {})
            },
            KeysToRemove: ['NationGroupId', 'NationGroupName', 'NationKingId']
        });

        if (inviteAssignment?.recordRef) {
            try {
                await inviteAssignment.recordRef.set({
                    inviterNation: targetNation,
                    useCount: admin.firestore.FieldValue.increment(1),
                    lastAcceptedPlayFabId: authenticatedPlayFabId,
                    lastAcceptedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (error) {
                console.warn('[apply-app-invite] Failed to update invite usage:', error?.errorMessage || error?.message || error);
            }
        }

        return res.json({
            success: true,
            changed,
            previousNation: prevNation || null,
            nation: targetNation,
            avatarColor
        });
    } catch (error) {
        const message = error?.errorMessage || error?.message || String(error);
        console.error('[apply-app-invite] Error:', message);
        return res.status(500).json({ error: 'Failed to apply invite', details: message });
    }
});

app.post('/api/get-line-friend-bonus-status', async (req, res) => {
    const { playFabId } = req.body || {};
    const authenticatedPlayFabId = await requireAuthenticatedPlayFabId(req, res, playFabId);
    if (!authenticatedPlayFabId) return;

    try {
        const readOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: authenticatedPlayFabId,
            Keys: ['LineFriendBonusClaimedAt', 'LineFriendBonusAmount', 'lineUserId']
        });
        const claimedAt = String(readOnly?.Data?.LineFriendBonusClaimedAt?.Value || '').trim();
        const claimedAmount = Math.max(0, Math.floor(Number(readOnly?.Data?.LineFriendBonusAmount?.Value || 0) || 0));
        const linkedLineUserId = String(readOnly?.Data?.lineUserId?.Value || '').trim();
        return res.json({
            eligible: !!linkedLineUserId && LINE_FRIEND_BONUS_PS > 0,
            linkedLineUserId: !!linkedLineUserId,
            rewardAmount: LINE_FRIEND_BONUS_PS,
            claimed: !!claimedAt,
            claimedAt: claimedAt || '',
            claimedAmount,
            addFriendUrl: LINE_OFFICIAL_ADD_FRIEND_URL
        });
    } catch (error) {
        const message = error?.errorMessage || error?.message || String(error);
        console.error('[get-line-friend-bonus-status] Error:', message);
        return res.status(500).json({ error: 'Failed to get line friend bonus status', details: message });
    }
});

app.post('/api/claim-line-friend-bonus', async (req, res) => {
    const { playFabId, lineAccessToken } = req.body || {};
    const authenticatedPlayFabId = await requireAuthenticatedPlayFabId(req, res, playFabId);
    if (!authenticatedPlayFabId) return;
    if (!LINE_FRIEND_BONUS_PS) {
        return res.status(400).json({ error: 'LineFriendBonusDisabled' });
    }

    try {
        const lineProfile = await verifyLineAccessToken(lineAccessToken);
        const friendship = await verifyLineFriendshipStatus(lineAccessToken);
        const readOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: authenticatedPlayFabId,
            Keys: ['lineUserId', 'LineFriendBonusClaimedAt', 'LineFriendBonusAmount']
        });
        const linkedLineUserId = String(readOnly?.Data?.lineUserId?.Value || '').trim();
        if (!linkedLineUserId || linkedLineUserId !== lineProfile.userId) {
            return res.status(403).json({ error: 'LineUserMismatch' });
        }
        const alreadyClaimedAt = String(readOnly?.Data?.LineFriendBonusClaimedAt?.Value || '').trim();
        const alreadyClaimedAmount = Math.max(0, Math.floor(Number(readOnly?.Data?.LineFriendBonusAmount?.Value || 0) || 0));
        if (alreadyClaimedAt) {
            return res.json({
                claimed: true,
                alreadyClaimed: true,
                rewardAmount: alreadyClaimedAmount || LINE_FRIEND_BONUS_PS,
                claimedAt: alreadyClaimedAt
            });
        }
        if (!friendship.friendFlag) {
            return res.status(409).json({ error: 'LineFriendshipRequired' });
        }

        const grantDeps = createDependencies();
        await grantDeps.addEconomyItem(authenticatedPlayFabId, VIRTUAL_CURRENCY_CODE, LINE_FRIEND_BONUS_PS, {
            idempotencyId: `line-friend-bonus:${authenticatedPlayFabId}`
        });
        const claimedAt = String(Date.now());
        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: authenticatedPlayFabId,
            Data: {
                LineFriendBonusClaimedAt: claimedAt,
                LineFriendBonusAmount: String(LINE_FRIEND_BONUS_PS)
            }
        });
        const newBalance = await economy.getCurrencyBalance(authenticatedPlayFabId, VIRTUAL_CURRENCY_CODE, {
            promisifyPlayFab,
            PlayFabEconomy,
            getEntityKeyFromPlayFabId,
            catalogCache,
            catalogCurrencyMap
        });
        return res.json({
            claimed: true,
            rewardAmount: LINE_FRIEND_BONUS_PS,
            claimedAt,
            newBalance
        });
    } catch (error) {
        const message = error?.errorMessage || error?.message || String(error);
        console.error('[claim-line-friend-bonus] Error:', message);
        return res.status(500).json({ error: 'Failed to claim line friend bonus', details: message });
    }
});

app.post('/api/create-app-invite', async (req, res) => {
    const { playFabId } = req.body || {};
    const authenticatedPlayFabId = await requireAuthenticatedPlayFabId(req, res, playFabId);
    if (!authenticatedPlayFabId) return;

    try {
        const readOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: authenticatedPlayFabId,
            Keys: ['Nation']
        });
        const inviterNation = String(readOnly?.Data?.Nation?.Value || '').trim().toLowerCase();
        const mapping = nation.getNationMappingByNation(inviterNation);
        if (!mapping) {
            return res.status(400).json({ error: 'NationNotSet', details: '所属国が未設定のため招待できません。' });
        }

        const inviterDisplayName = await getPlayerDisplayName(authenticatedPlayFabId);
        const inviteToken = String(typeof randomUUID === 'function' ? randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).replace(/-/g, '');
        const nowMs = Date.now();
        const expiresAtMs = nowMs + APP_INVITE_TTL_MS;
        await getAppInviteDoc(inviteToken).set({
            inviterPlayFabId: authenticatedPlayFabId,
            inviterNation,
            inviterDisplayName,
            createdAtMs: nowMs,
            expiresAtMs,
            useCount: 0,
            revoked: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: false });

        const baseUrl = getPublicBaseUrl(req);
        const inviteUrl = `${baseUrl || ''}/?invite=${encodeURIComponent(inviteToken)}`;
        return res.json({
            inviteToken,
            inviteUrl,
            nation: inviterNation,
            inviterDisplayName,
            expiresAtMs
        });
    } catch (error) {
        const message = error?.errorMessage || error?.message || String(error);
        console.error('[create-app-invite] Error:', message);
        return res.status(500).json({ error: 'Failed to create invite', details: message });
    }
});

// 種族設定API
app.post('/api/set-race', async (req, res) => {
    const { playFabId, raceName, displayName, inviteToken, inviteNation } = req.body || {};
    const completeGuestRegistrationRequest = req.body?.completeGuestRegistration === true;
    const clientEntityKey = normalizeEntityKey(req.body?.entityKey) || getEntityKeyFromToken(req.body?.entityToken);
    if (!playFabId || !raceName) return res.status(400).json({ error: 'playFabId and raceName are required' });
    console.log(`[set-race] ${playFabId} selected race ${raceName}`);

    const authenticatedPlayFabId = await requireAuthenticatedPlayFabId(req, res, playFabId);
    if (!authenticatedPlayFabId) return;

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

    let setRaceStep = 'init';
    try {
        setRaceStep = 'read-player-readonly';
        const currentReadOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['Nation', 'lineUserId', 'IsGuest', 'StarterGoldGranted']
        });
        const prevNation = String(currentReadOnly?.Data?.Nation?.Value || '').toLowerCase();
        const lineUserId = String(currentReadOnly?.Data?.lineUserId?.Value || '').trim();
        const isGuest = String(currentReadOnly?.Data?.IsGuest?.Value || '').toLowerCase() === 'true';
        const starterGoldGranted = String(currentReadOnly?.Data?.StarterGoldGranted?.Value || '').toLowerCase() === 'true';
        const completeGuestRegistration = completeGuestRegistrationRequest && isGuest && !!nation.getNationMappingByNation(prevNation);

        setRaceStep = 'resolve-invite';
        const fixedInviteNation = String(inviteNation || '').trim().toLowerCase();
        const fixedInviteMapping = fixedInviteNation ? nation.getNationMappingByNation(fixedInviteNation) : null;
        if (fixedInviteNation && !fixedInviteMapping) {
            return res.status(400).json({ error: 'InvalidInviteNation' });
        }
        const tokenInviteAssignment = completeGuestRegistration ? null : await resolveAppInviteAssignment(inviteToken);
        const fixedInviteAssignment = (!completeGuestRegistration && fixedInviteMapping) ? {
            mapping: fixedInviteMapping,
            nation: fixedInviteNation,
            inviterPlayFabId: '',
            inviterDisplayName: ''
        } : null;
        const inviteAssignment = fixedInviteAssignment || tokenInviteAssignment;
        setRaceStep = 'resolve-mapping';
        const mapping = completeGuestRegistration
            ? nation.getNationMappingByNation(prevNation)
            : (inviteAssignment?.mapping || nation.NATION_GROUP_BY_RACE[raceName]);
        if (!mapping) return res.status(400).json({ error: 'Invalid raceName' });
        const deps = createDependencies();
        setRaceStep = 'ensure-nation-group';
        let groupInfo = await nation.ensureNationGroupExists(firestore, mapping, deps);
        let serverEntityKey = null;
        try {
            setRaceStep = 'resolve-entity';
            serverEntityKey = await getEntityKeyFromPlayFabId(playFabId);
        } catch (e) {
            console.warn('[set-race] getEntityKeyFromPlayFabId failed:', e?.errorMessage || e?.message || e);
        }
        const playerEntity = serverEntityKey?.Id && serverEntityKey?.Type
            ? serverEntityKey
            : (clientEntityKey?.Id && clientEntityKey?.Type ? clientEntityKey : null);
        if (!playerEntity) {
            return res.status(400).json({ error: 'Failed to resolve player entity' });
        }

        let assignedGroupId = groupInfo.groupId;
        let assignedGroupName = groupInfo.groupName;
        const assignedNation = completeGuestRegistration ? prevNation : (inviteAssignment?.nation || mapping.island);
        let isKing = !!groupInfo.created;

        try {
            const kingMap = await getNationKingLineUserIds();
            const expectedKingLineId = String(kingMap?.[assignedGroupName] || '').trim();
            if (expectedKingLineId) {
                isKing = lineUserId && lineUserId === expectedKingLineId;
            }
            if (completeGuestRegistration) {
                isKing = false;
            }
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

            setRaceStep = 'group-add-member';
            await ensureTitleEntityToken();
            let addMemberError = null;
            try {
                await promisifyPlayFab(PlayFabGroups.AddMembers, {
                    Group: { Id: assignedGroupId, Type: 'group' },
                    Members: [playerEntity]
                });
            } catch (e) {
                addMemberError = e;
                const fallbackEntity = clientEntityKey?.Id && clientEntityKey?.Type ? clientEntityKey : null;
                const isDifferentEntity =
                    !!fallbackEntity &&
                    (String(fallbackEntity.Id) !== String(playerEntity.Id) || String(fallbackEntity.Type) !== String(playerEntity.Type));
                if (isDifferentEntity) {
                    try {
                        await promisifyPlayFab(PlayFabGroups.AddMembers, {
                            Group: { Id: assignedGroupId, Type: 'group' },
                            Members: [fallbackEntity]
                        });
                        addMemberError = null;
                    } catch (fallbackError) {
                        addMemberError = fallbackError;
                    }
                }
            }
            if (addMemberError) {
                const addMsg = String(addMemberError?.errorMessage || addMemberError?.message || addMemberError);
                if (addMsg.includes('EntityIsAlreadyMember')) {
                    addMemberError = null;
                } else if (addMsg.includes('入力パラメータ') || addMsg.toLowerCase().includes('invalid input')) {
                    console.warn('[set-race] AddMembers skipped due to invalid params:', addMsg);
                    addMemberError = null;
                }
            }
            if (addMemberError) throw addMemberError;

            if (isKing) {
                setRaceStep = 'write-king-doc';
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

        setRaceStep = 'update-display-name';
        const displayResult = await ensureNationDisplayName(playFabId, assignedNation, displayName || '');

        const nationData = {
            Nation: assignedNation
        };

        setRaceStep = 'update-player-statistics';
        const statsPayload = Object.keys(initialStats).map(key => ({ StatisticName: key, Value: initialStats[key] }));
        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, { PlayFabId: playFabId, Statistics: statsPayload });

        avatarData.SkinColorIndex = Math.floor(Math.random() * maxSkinColorIndex) + 1;
        avatarData.FaceIndex = Math.floor(Math.random() * maxFaceIndex) + 1;
        avatarData.HairStyleIndex = Math.floor(Math.random() * 30) + 1;

        setRaceStep = 'write-readonly-data';
        const toReadOnlyStringMap = (raw) => {
            const out = {};
            Object.entries(raw || {}).forEach(([key, value]) => {
                if (value == null) return;
                const text = String(value);
                if (!text) return;
                out[key] = text;
            });
            return out;
        };
        const readOnlyCorePayload = toReadOnlyStringMap({
            Race: raceName,
            BaseDisplayName: displayResult.baseName || displayName || '',
            Nation: nationData.Nation,
            IsKing: isKing ? 'true' : 'false',
            NationKingId: isKing ? playFabId : null,
            IsGuest: completeGuestRegistration ? 'false' : null,
            GuestCompletedAt: completeGuestRegistration ? new Date().toISOString() : null
        });
        const readOnlyOptionalPayload = toReadOnlyStringMap({
            AvatarColor: avatarData.AvatarColor,
            SkinColorIndex: avatarData.SkinColorIndex,
            FaceIndex: avatarData.FaceIndex,
            HairStyleIndex: avatarData.HairStyleIndex,
            InvitedByPlayFabId: inviteAssignment?.inviterPlayFabId || null,
            InvitedByDisplayName: inviteAssignment?.inviterDisplayName || null,
            InviteAcceptedAt: inviteAssignment ? String(Date.now()) : null
        });
        const coreKeysToRemove = [
            'NationGroupId',
            'NationGroupName',
            ...(isKing ? [] : ['NationKingId']),
            ...(inviteAssignment ? [] : ['InvitedByPlayFabId', 'InvitedByDisplayName', 'InviteAcceptedAt']),
            ...(completeGuestRegistration ? ['GuestEntryCreatedAt'] : [])
        ];
        const writeReadOnlyData = async (dataMap, keysToRemove = []) => {
            if ((!dataMap || Object.keys(dataMap).length === 0) && (!Array.isArray(keysToRemove) || !keysToRemove.length)) {
                return;
            }
            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: playFabId,
                Data: dataMap || {},
                KeysToRemove: Array.isArray(keysToRemove) ? keysToRemove : []
            });
        };
        try {
            await writeReadOnlyData({ ...readOnlyCorePayload, ...readOnlyOptionalPayload }, coreKeysToRemove);
        } catch (bulkError) {
            console.warn('[set-race] bulk UpdateUserReadOnlyData failed, retrying by chunks:', bulkError?.errorMessage || bulkError?.message || bulkError);
            for (const [key, value] of Object.entries(readOnlyCorePayload)) {
                try {
                    await writeReadOnlyData({ [key]: value });
                } catch (singleError) {
                    const msg = singleError?.errorMessage || singleError?.message || String(singleError);
                    throw new Error(`${msg} (key:${key})`);
                }
            }
            if (coreKeysToRemove.length) {
                try {
                    await writeReadOnlyData({}, coreKeysToRemove);
                } catch (removeError) {
                    const msg = removeError?.errorMessage || removeError?.message || String(removeError);
                    throw new Error(`${msg} (key:${coreKeysToRemove.join(',')})`);
                }
            }
            for (const [key, value] of Object.entries(readOnlyOptionalPayload)) {
                try {
                    await writeReadOnlyData({ [key]: value });
                } catch (optionalError) {
                    console.warn(`[set-race] optional read-only key skipped: ${key}`, optionalError?.errorMessage || optionalError?.message || optionalError);
                }
            }
        }

        const starterIsland = null;

        const starterAssets = await provisionStarterAssets({ playFabId, entityKey: playerEntity });
        const shouldGrantStarterGold = !starterGoldGranted && !prevNation && !completeGuestRegistration;
        if (shouldGrantStarterGold) {
            try {
                await deps.addEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, 500, {
                    entityKeyOverride: playerEntity,
                    idempotencyId: `starter-gold:${playFabId}`
                });
                try {
                    const newBalance = await deps.getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE);
                    await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                        PlayFabId: playFabId,
                        Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: newBalance }]
                    });
                } catch (syncError) {
                    console.warn('[starterGrant] Failed to sync starter PS ranking:', syncError?.errorMessage || syncError?.message || syncError);
                }
                try {
                    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                        PlayFabId: playFabId,
                        Data: {
                            StarterGoldGranted: 'true',
                            StarterGoldGrantedAt: new Date().toISOString()
                        }
                    });
                } catch (flagError) {
                    console.warn('[starterGrant] Failed to persist starter grant flag:', flagError?.errorMessage || flagError?.message || flagError);
                }
            } catch (e) {
                console.warn('[starterGrant] Failed to grant starter PS:', e?.errorMessage || e?.message || e);
            }
        }

        try {
            await ensureStarterShip({
                playFabId,
                respawnPosition: starterIsland?.respawnPosition || null
            });
        } catch (e) {
            console.warn('[starterShip] Failed to ensure starter ship:', e?.errorMessage || e?.message || e);
        }

        if (inviteAssignment?.recordRef) {
            try {
                await inviteAssignment.recordRef.set({
                    inviterNation: assignedNation,
                    useCount: admin.firestore.FieldValue.increment(1),
                    lastAcceptedPlayFabId: playFabId,
                    lastAcceptedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (e) {
                console.warn('[app-invite] Failed to update invite usage:', e?.errorMessage || e?.message || e);
            }
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
        const msg = error?.errorMessage || error?.message || String(error);
        console.error(`[set-race] Error at ${setRaceStep}:`, msg);
        res.status(500).json({ error: 'Failed to set race', details: `[${setRaceStep}] ${msg}` });
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
        PlayFabAdmin,
        PlayFabEconomy,
        getEntityKeyFromPlayFabId,
        requireAuthenticatedPlayFabId,
        catalogCache,
        catalogCurrencyMap,
        resolveItemId: resolveCatalogItemId,
        firestore,
        admin,
        emitDisplayEvent
    });

    // 国家ルート
    nation.initializeNationRoutes(app, deps);

    // タロット運勢
    tarotFortune.initializeTarotFortuneRoutes(app, deps);

    // タロットデッキ
    tarotDeck.initializeTarotDeckRoutes(app, deps);

    // 店舗イベント
    events.initializeEventRoutes(app, deps);

    // 探索
    exploration.initializeExplorationRoutes(app, deps);

    // 島ルート
    island.initializeIslandRoutes(app, deps);

    // インベントリルート
    inventory.initializeInventoryRoutes(app, {
        promisifyPlayFab,
        PlayFabServer,
        PlayFabAdmin,
        PlayFabGroups,
        PlayFabEconomy,
        firestore,
        admin,
        catalogCache,
        getEntityKeyForPlayFabId: deps.getEntityKeyForPlayFabId,
        getAllInventoryItems: deps.getAllInventoryItems,
        getVirtualCurrencyMap: deps.getVirtualCurrencyMap,
        addEconomyItem: deps.addEconomyItem,
        subtractEconomyItem: deps.subtractEconomyItem,
        getCurrencyBalance: deps.getCurrencyBalance,
        requireAuthenticatedPlayFabId,
        ensureDailyBountyConversion: (playFabId) => economy.ensureDailyBountyConversion(playFabId, {
            promisifyPlayFab,
            PlayFabServer,
            PlayFabEconomy,
            getEntityKeyFromPlayFabId,
            catalogCache,
            catalogCurrencyMap,
            resolveItemId: resolveCatalogItemId
        })
    });

    // ショップルート
    shop.initializeShopRoutes(app, deps);

    // チャットルート
    chat.initializeChatRoutes(app);

    // バトルルート
    battleRoutes.initializeBattleRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabEconomy, lineClient, catalogCache, catalogCurrencyMap, resolveCatalogItemId, sharedConstants, {
        requireAuthenticatedPlayFabId
    });

    // ギルドルート
    guildRoutes.initializeGuildRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabEconomy, resolveCatalogItemId, {
        requireAuthenticatedPlayFabId
    });

    // 船ルート
    shipRoutes.initializeShipRoutes(
        app,
        promisifyPlayFab,
        PlayFabServer,
        PlayFabAdmin,
        PlayFabEconomy,
        catalogCache,
        resolveCatalogItemId,
        catalogCurrencyMap,
        {
            requireAuthenticatedPlayFabId
        }
    );

    // 船スキルルート
    shipSkillRoutes.initializeShipSkillRoutes(
        app,
        promisifyPlayFab,
        PlayFabServer,
        PlayFabEconomy,
        catalogCache,
        { requireAuthenticatedPlayFabId }
    );

    // バトルルームルート
    battleRoomRoutes.initializeBattleRoomRoutes(
        app,
        promisifyPlayFab,
        PlayFabServer,
        { requireAuthenticatedPlayFabId },
        lineClient,
        {
            promisifyPlayFab,
            PlayFabEconomy,
            getEntityKeyFromPlayFabId,
            resolveItemId: resolveCatalogItemId
        }
    );

    // NPC スナップショットルート
    npcSnapshotRoutes.initializeNpcSnapshotRoutes(
        app,
        promisifyPlayFab,
        PlayFabServer,
        { requireAuthenticatedPlayFabId }
    );

    // 領海ルート
    territoryRoutes.initializeTerritoryRoutes(
        app,
        promisifyPlayFab,
        PlayFabServer,
        { requireAuthenticatedPlayFabId }
    );

    // 週次争奪ルート
    weeklyContestRoutes.initializeWeeklyContestRoutes(
        app,
        promisifyPlayFab,
        PlayFabServer,
        { requireAuthenticatedPlayFabId }
    );

    // カードレベル育成ルート
    initializeCardRoutes(app, {
        promisifyPlayFab,
        PlayFabEconomy,
        getEntityKeyFromPlayFabId,
        catalogCache,
        requireAuthenticatedPlayFabId,
    });

    // タロット予言イベントスケジューラ
    initializeProphecyScheduler();

    // 週次争奪ウィンドウスケジューラ
    new WeeklyContestScheduler().start();

    app.listen(PORT, () => {
        console.log(`サーバーがポート ${PORT} で起動しました。http://localhost:${PORT}`);
    });
}

main();
