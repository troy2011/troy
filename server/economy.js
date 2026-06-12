// server/economy.js
// 経済関連のユーティリティ関数

const { addGlobalChatMessage } = require('./chat');
const { withTitleEntityToken } = require('./playfab');
const {
    applyDerivedPlayerLevelToStats,
    buildStatsMapFromStatistics,
    PLAYER_CONTRIBUTION_STAT
} = require('./playerLevel');
const VIRTUAL_CURRENCY_CODE = String(process.env.VIRTUAL_CURRENCY_CODE || 'PS').trim().toUpperCase();
const LEADERBOARD_NAME = process.env.LEADERBOARD_NAME || 'ps_ranking';
const ENABLE_LEGACY_POINT_ROUTES = String(process.env.ENABLE_LEGACY_POINT_ROUTES || '').trim().toLowerCase() === 'true';
const STORE_GAME_ELO_INITIAL_RATING = 1000;
const STORE_GAME_ELO_K_FACTOR = 64;
const GLOBAL_BOUNTY_RANKING_CANDIDATE_LIMIT = 100;

const ECONOMY_CURRENCY_IDS = new Set([
    VIRTUAL_CURRENCY_CODE,
    'RR',
    'RG',
    'RY',
    'RB',
    'RT',
    'RS'
]);
const STORE_GAME_RANKING_STATS = {
    darts_countup: {
        statisticName: 'troy_darts_countup_score',
        label: 'ダーツカウントアップ',
        maxScore: 9999,
        scoreScale: 1
    },
    billiards: {
        statisticName: 'troy_billiards_rating',
        label: 'ビリヤード',
        scoreScale: 1,
        isRating: true,
        initialRating: STORE_GAME_ELO_INITIAL_RATING,
        kFactor: STORE_GAME_ELO_K_FACTOR
    },
    game: {
        statisticName: 'troy_game_rating',
        label: 'ゲーム',
        scoreScale: 1,
        isRating: true,
        initialRating: STORE_GAME_ELO_INITIAL_RATING,
        kFactor: STORE_GAME_ELO_K_FACTOR
    },
    karaoke: {
        statisticName: 'troy_karaoke_score',
        label: 'カラオケ採点',
        maxScore: 100,
        scoreScale: 1000
    }
};

const TROY_GLOBAL_ROOM_ID = 'global';
const TROY_BOUNTY_RANKING_MEMBER_LIMIT = 50;
const NATION_EMOJI_BY_NATION = {
    fire: '🔥',
    water: '💧',
    wind: '🌪️',
    earth: '🌱'
};

function stripNationEmoji(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    return raw.replace(/^(🔥|💧|🌪️|🌱|🏴)\s*/, '').trim();
}

function normalizePlayerDisplayName(value) {
    return stripNationEmoji(value)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 25);
}

function normalizeStoreGameType(value) {
    const key = String(value || '').trim().toLowerCase();
    return STORE_GAME_RANKING_STATS[key] ? key : '';
}

function normalizeStoreGameScore(value, game) {
    const rawScore = Number(value);
    if (!Number.isFinite(rawScore) || rawScore < 0) return { score: 0, storedScore: 0 };
    const maxScore = Math.max(0, Number(game?.maxScore) || 9999);
    const scoreScale = Math.max(1, Math.floor(Number(game?.scoreScale) || 1));
    const clampedScore = Math.min(rawScore, maxScore);
    const storedScore = Math.round(clampedScore * scoreScale);
    const score = storedScore / scoreScale;
    return { score, storedScore };
}

function isStoreGameRatingGame(game) {
    return Boolean(game?.isRating);
}

function normalizeStoreGameRating(value, game) {
    const fallback = Math.max(1, Math.floor(Number(game?.initialRating) || STORE_GAME_ELO_INITIAL_RATING));
    const rating = Math.floor(Number(value) || 0);
    return rating > 0 ? rating : fallback;
}

function calculateStoreGameEloRating(playerRating, opponentRating, actualScore, game) {
    const current = normalizeStoreGameRating(playerRating, game);
    const opponent = normalizeStoreGameRating(opponentRating, game);
    const kFactor = Math.max(1, Math.floor(Number(game?.kFactor) || STORE_GAME_ELO_K_FACTOR));
    const expected = 1 / (1 + Math.pow(10, (opponent - current) / 400));
    return Math.max(1, Math.round(current + (kFactor * (actualScore - expected))));
}

async function getStoreGameStatisticValue(playFabId, statisticName, deps) {
    if (!playFabId || !statisticName) return 0;
    try {
        const result = await deps.promisifyPlayFab(deps.PlayFabServer.GetPlayerStatistics, {
            PlayFabId: playFabId,
            StatisticNames: [statisticName]
        });
        const stats = Array.isArray(result?.Statistics) ? result.Statistics : [];
        const row = stats.find((entry) => String(entry?.StatisticName || '') === statisticName);
        return Number(row?.Value || 0);
    } catch {
        return 0;
    }
}

async function getPlayerDisplayName(playFabId, deps) {
    const fallback = String(playFabId || '').trim();
    if (!fallback) return '';
    try {
        const profile = await deps.promisifyPlayFab(deps.PlayFabServer.GetPlayerProfile, {
            PlayFabId: fallback,
            ProfileConstraints: { ShowDisplayName: true }
        });
        return String(profile?.PlayerProfile?.DisplayName || fallback).trim() || fallback;
    } catch {
        return fallback;
    }
}

async function isKingPlayer(playFabId, deps) {
    if (!playFabId) return false;
    try {
        const readOnly = await deps.promisifyPlayFab(deps.PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['IsKing']
        });
        const raw = String(readOnly?.Data?.IsKing?.Value || '').trim().toLowerCase();
        return raw === 'true' || raw === '1' || raw === 'yes';
    } catch {
        return false;
    }
}

function buildNationDisplayName(baseName, nation) {
    const base = normalizePlayerDisplayName(baseName);
    return base.slice(0, 25);
}

function normalizeEntityKey(input) {
    const id = input?.Id || input?.id || null;
    const type = input?.Type || input?.type || null;
    if (!id || !type) return null;
    return { Id: String(id), Type: String(type) };
}

async function getEntityKeyForPlayFabId(playFabId, { getEntityKeyFromPlayFabId }) {
    const entityKey = await getEntityKeyFromPlayFabId(playFabId);
    if (!entityKey?.Id || !entityKey?.Type) {
        throw new Error('EntityKeyNotFound');
    }
    return entityKey;
}

async function getAllInventoryItems(entityKey, { promisifyPlayFab, PlayFabEconomy }) {
    const items = [];
    let token = null;
    do {
        const result = await withTitleEntityToken(() => promisifyPlayFab(PlayFabEconomy.GetInventoryItems, {
            Entity: entityKey,
            Count: 50,
            ContinuationToken: token || undefined
        }));
        const page = Array.isArray(result?.Items) ? result.Items : [];
        items.push(...page);
        token = result?.ContinuationToken || null;
    } while (token);
    return items;
}

function getItemAmount(item) {
    return Number(item?.Amount ?? item?.amount ?? 0) || 0;
}

function getCurrencyIdFromItem(item, catalogCache, catalogCurrencyMap) {
    const itemId = item?.Id || item?.ItemId;
    if (!itemId) return null;
    if (ECONOMY_CURRENCY_IDS.has(itemId)) return itemId;
    if (catalogCurrencyMap && catalogCurrencyMap[itemId]) {
        return catalogCurrencyMap[itemId];
    }
    if (catalogCache) {
        const entry = catalogCache[itemId];
        const entryClass = String(entry?.ItemClass || '').toLowerCase();
        if (entry && entryClass === 'currency') {
            return entry?.FriendlyId || itemId;
        }
    }
    return null;
}

function getVirtualCurrencyMap(items, options = {}) {
    const catalogCache = options.catalogCache || null;
    const catalogCurrencyMap = options.catalogCurrencyMap || null;
    const totals = {};
    (items || []).forEach((item) => {
        const currencyId = getCurrencyIdFromItem(item, catalogCache, catalogCurrencyMap);
        if (!currencyId) return;
        totals[currencyId] = (totals[currencyId] || 0) + getItemAmount(item);
    });
    return totals;
}

async function getCurrencyBalanceWithEntity(entityKey, currencyId, deps) {
    const { promisifyPlayFab, PlayFabEconomy, catalogCache, catalogCurrencyMap } = deps;
    const items = await getAllInventoryItems(entityKey, { promisifyPlayFab, PlayFabEconomy });
    const totals = getVirtualCurrencyMap(items, { catalogCache, catalogCurrencyMap });
    return totals[currencyId] || 0;
}

async function addEconomyItem(playFabId, itemId, amount, deps) {
    const { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId, entityKeyOverride, resolveItemId, idempotencyId, alternateIdType } = deps;
    const requestEntity = normalizeEntityKey(entityKeyOverride);
    const entityKey = requestEntity || await getEntityKeyForPlayFabId(playFabId, { getEntityKeyFromPlayFabId });
    const itemReference = alternateIdType
        ? { AlternateId: { Type: String(alternateIdType), Value: String(itemId) } }
        : { Id: typeof resolveItemId === 'function' ? resolveItemId(itemId) : itemId };
    const request = {
        Entity: entityKey,
        Amount: Number(amount),
        Item: itemReference
    };
    if (idempotencyId) request.IdempotencyId = String(idempotencyId);
    await withTitleEntityToken(() => promisifyPlayFab(PlayFabEconomy.AddInventoryItems, request));
    return entityKey;
}

async function subtractEconomyItem(playFabId, itemId, amount, deps) {
    const { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId, entityKeyOverride, resolveItemId, idempotencyId, alternateIdType } = deps;
    const requestEntity = normalizeEntityKey(entityKeyOverride);
    const entityKey = requestEntity || await getEntityKeyForPlayFabId(playFabId, { getEntityKeyFromPlayFabId });
    const itemReference = alternateIdType
        ? { AlternateId: { Type: String(alternateIdType), Value: String(itemId) } }
        : { Id: typeof resolveItemId === 'function' ? resolveItemId(itemId) : itemId };
    const request = {
        Entity: entityKey,
        Amount: Number(amount),
        Item: itemReference
    };
    if (idempotencyId) request.IdempotencyId = String(idempotencyId);
    await withTitleEntityToken(() => promisifyPlayFab(PlayFabEconomy.SubtractInventoryItems, request));
    return entityKey;
}

async function transferEconomyItem(fromPlayFabId, toPlayFabId, itemId, amount, deps) {
    const { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId, resolveItemId, idempotencyId, givingEntityOverride } = deps;
    const givingEntity = normalizeEntityKey(givingEntityOverride) || await getEntityKeyForPlayFabId(fromPlayFabId, { getEntityKeyFromPlayFabId });
    const receivingEntity = await getEntityKeyForPlayFabId(toPlayFabId, { getEntityKeyFromPlayFabId });
    const resolvedItemId = typeof resolveItemId === 'function' ? resolveItemId(itemId) : itemId;
    const request = {
        GivingEntity: givingEntity,
        ReceivingEntity: receivingEntity,
        GivingItem: { Id: resolvedItemId },
        ReceivingItem: { Id: resolvedItemId },
        Amount: Number(amount)
    };
    if (idempotencyId) request.IdempotencyId = String(idempotencyId);
    await withTitleEntityToken(() => promisifyPlayFab(PlayFabEconomy.TransferInventoryItems, request));
    return { givingEntity, receivingEntity };
}

async function getCurrencyBalance(playFabId, currencyId, deps) {
    const { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId, catalogCache, catalogCurrencyMap } = deps;
    const entityKey = await getEntityKeyForPlayFabId(playFabId, { getEntityKeyFromPlayFabId });
    const items = await getAllInventoryItems(entityKey, { promisifyPlayFab, PlayFabEconomy });
    const totals = getVirtualCurrencyMap(items, { catalogCache, catalogCurrencyMap });
    return totals[currencyId] || 0;
}

function applyTax(amount, taxRateBps) {
    const gross = Math.max(0, Math.floor(Number(amount) || 0));
    const bps = Math.max(0, Math.min(5000, Math.floor(Number(taxRateBps) || 0)));
    const tax = Math.floor((gross * bps) / 10000);
    const net = Math.max(0, gross - tax);
    return { gross, tax, net, bps };
}

function getPlayerRankNameByLevel(level) {
    const value = Math.max(1, Math.floor(Number(level) || 1));
    if (value >= 41) return '海賊王';
    if (value >= 31) return '提督';
    if (value >= 21) return '船長';
    if (value >= 11) return '航海士';
    return '見習い';
}

async function getLeaderboardPlayerRankInfo(playFabId, deps) {
    if (!playFabId || !deps?.promisifyPlayFab || !deps?.PlayFabServer) return {};
    try {
        const statsResult = await deps.promisifyPlayFab(deps.PlayFabServer.GetPlayerStatistics, {
            PlayFabId: playFabId
        });
        const stats = applyDerivedPlayerLevelToStats(
            buildStatsMapFromStatistics(statsResult?.Statistics || [])
        ).stats;
        const level = Math.max(1, Math.floor(Number(stats.Level || 1) || 1));
        return {
            level,
            rankName: getPlayerRankNameByLevel(level)
        };
    } catch (error) {
        console.warn('[ranking] player rank resolve failed:', playFabId, error?.errorMessage || error?.message || error);
        return {};
    }
}

async function buildPlayerRankingRows(leaderboard, deps, mapEntry) {
    const entries = Array.isArray(leaderboard) ? leaderboard : [];
    return Promise.all(entries.map(async (entry) => {
        const row = mapEntry(entry);
        const rankInfo = await getLeaderboardPlayerRankInfo(row.playFabId || entry?.PlayFabId, deps);
        return { ...row, ...rankInfo };
    }));
}

async function buildCalculatedTroyBountyRanking(deps, options = {}) {
    const { firestore } = deps || {};
    if (!firestore) return null;
    const limitRaw = Number.parseInt(String(options.limit || '10'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 10;
    const { buildTroyBountyRankingRow } = require('./nation');
    if (typeof buildTroyBountyRankingRow !== 'function') return null;

    const roomRef = firestore.collection('troy_rooms').doc(TROY_GLOBAL_ROOM_ID);
    const roomSnap = await roomRef.get();
    const roomData = roomSnap.exists ? (roomSnap.data() || {}) : {};
    const membersSnap = await roomRef
        .collection('members')
        .orderBy('joinedAt', 'asc')
        .limit(TROY_BOUNTY_RANKING_MEMBER_LIMIT)
        .get();
    const rows = await Promise.all(membersSnap.docs.map((doc) => buildTroyBountyRankingRow(doc, deps)));
    const ranking = rows
        .filter(Boolean)
        .sort((a, b) => (
            (b.bounty - a.bounty)
            || (b.level - a.level)
            || (a.joinedAtMs - b.joinedAtMs)
            || String(a.playFabId || '').localeCompare(String(b.playFabId || ''))
        ))
        .slice(0, limit)
        .map((entry, index) => ({
            position: index + 1,
            playFabId: entry.playFabId,
            displayName: entry.displayName,
            avatarUrl: entry.avatarUrl,
            level: entry.level,
            rankName: entry.rankName,
            bounty: entry.bounty,
            score: entry.score
        }));

    return {
        scope: 'troy-members',
        isOpen: !!roomData.isOpen,
        memberCount: membersSnap.size,
        updatedAt: Date.now(),
        ranking
    };
}

async function buildCalculatedGlobalBountyRanking(deps, options = {}) {
    const { promisifyPlayFab, PlayFabServer } = deps || {};
    if (typeof promisifyPlayFab !== 'function' || !PlayFabServer) return null;
    const limitRaw = Number.parseInt(String(options.limit || '10'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 10;
    const { buildTroyBountyRankingRow } = require('./nation');
    if (typeof buildTroyBountyRankingRow !== 'function') return null;

    const result = await promisifyPlayFab(PlayFabServer.GetLeaderboard, {
        StatisticName: PLAYER_CONTRIBUTION_STAT,
        StartPosition: 0,
        MaxResultsCount: GLOBAL_BOUNTY_RANKING_CANDIDATE_LIMIT,
        ProfileConstraints: { ShowAvatarUrl: true, ShowDisplayName: true }
    });
    const entries = Array.isArray(result?.Leaderboard) ? result.Leaderboard : [];
    const rows = await Promise.all(entries.map((entry) => {
        const avatarUrl = entry?.Profile?.AvatarUrl || '';
        const displayName = entry?.DisplayName || entry?.Profile?.DisplayName || entry?.PlayFabId || 'Player';
        return buildTroyBountyRankingRow({
            id: entry?.PlayFabId || '',
            data: () => ({
                displayName,
                avatarUrl,
                contributionTotal: entry?.StatValue || 0,
                joinedAt: Number(entry?.Position || 0)
            })
        }, deps);
    }));
    const ranking = rows
        .filter(Boolean)
        .sort((a, b) => (
            (b.bounty - a.bounty)
            || (b.level - a.level)
            || String(a.playFabId || '').localeCompare(String(b.playFabId || ''))
        ))
        .slice(0, limit)
        .map((entry, index) => ({
            position: index + 1,
            playFabId: entry.playFabId,
            displayName: entry.displayName,
            avatarUrl: entry.avatarUrl,
            level: entry.level,
            rankName: entry.rankName,
            bounty: entry.bounty,
            score: entry.score
        }));

    return {
        scope: 'all-players',
        updatedAt: Date.now(),
        ranking
    };
}

// APIルートを初期化
function initializeEconomyRoutes(app, deps) {
    const { promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabEconomy, getEntityKeyFromPlayFabId, firestore, admin, emitDisplayEvent, requireAuthenticatedPlayFabId } = deps;

    const economyDeps = {
        promisifyPlayFab,
        PlayFabEconomy,
        getEntityKeyFromPlayFabId,
        catalogCache: deps.catalogCache,
        catalogCurrencyMap: deps.catalogCurrencyMap,
        resolveItemId: deps.resolveItemId
    };

    const pushDisplayEvent = (payload) => {
        if (typeof emitDisplayEvent !== 'function') return;
        try {
            emitDisplayEvent(payload);
        } catch (error) {
            console.warn('[display-event] Failed to emit:', error?.message || error);
        }
    };

    // ゴールド取得
    app.post('/api/get-points', async (req, res) => {
        const playFabId = req.body.playFabId;
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        const authenticatedPlayFabId = await requireAuthenticatedPlayFabId(req, res, playFabId);
        if (!authenticatedPlayFabId) return;
        try {
            const entityKey = await getEntityKeyForPlayFabId(authenticatedPlayFabId, { getEntityKeyFromPlayFabId });
            const items = await getAllInventoryItems(entityKey, { promisifyPlayFab, PlayFabEconomy });
            const totals = getVirtualCurrencyMap(items, {
                catalogCache: economyDeps.catalogCache,
                catalogCurrencyMap: economyDeps.catalogCurrencyMap
            });
            res.json({
                points: totals[VIRTUAL_CURRENCY_CODE] || 0,
                virtualCurrency: totals
            });
        } catch (error) {
            res.status(500).json({
                error: 'ゴールド取得に失敗しました。',
                details: error.errorMessage || error.message
            });
        }
    });

    // ゴールド追加
    app.post('/api/add-points', async (req, res) => {
        if (!ENABLE_LEGACY_POINT_ROUTES) {
            return res.status(410).json({ error: 'Legacy point grant route is disabled.' });
        }
        const { playFabId, amount } = req.body;
        if (!playFabId || !amount) {
            return res.status(400).json({ error: 'PlayFab ID と amount が必要です。' });
        }
        const authenticatedPlayFabId = await requireAuthenticatedPlayFabId(req, res, playFabId);
        if (!authenticatedPlayFabId) return;
        try {
            await addEconomyItem(authenticatedPlayFabId, VIRTUAL_CURRENCY_CODE, amount, economyDeps);
            const newBalance = await getCurrencyBalance(authenticatedPlayFabId, VIRTUAL_CURRENCY_CODE, economyDeps);
            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: authenticatedPlayFabId,
                Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: newBalance }]
            });
            res.json({ newBalance });
        } catch (error) {
            console.error('ゴールド追加失敗:', error.errorMessage || error.message || error);
            res.status(500).json({
                error: 'ゴールド追加に失敗しました。',
                details: error.errorMessage || error.message
            });
        }
    });

    // ゴールド消費
    app.post('/api/use-points', async (req, res) => {
        if (!ENABLE_LEGACY_POINT_ROUTES) {
            return res.status(410).json({ error: 'Legacy point spend route is disabled.' });
        }
        const { playFabId, amount } = req.body;
        if (!playFabId || !amount) {
            return res.status(400).json({ error: 'PlayFab ID と amount が必要です。' });
        }
        const authenticatedPlayFabId = await requireAuthenticatedPlayFabId(req, res, playFabId);
        if (!authenticatedPlayFabId) return;
        try {
            await subtractEconomyItem(authenticatedPlayFabId, VIRTUAL_CURRENCY_CODE, amount, economyDeps);
            const newBalance = await getCurrencyBalance(authenticatedPlayFabId, VIRTUAL_CURRENCY_CODE, economyDeps);
            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: authenticatedPlayFabId,
                Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: newBalance }]
            });
            res.json({ newBalance });
        } catch (error) {
            if (error.apiErrorInfo && error.apiErrorInfo.apiError === 'InsufficientFunds') {
                return res.status(400).json({ error: 'ゴールドが不足しています。' });
            }
            console.error('ゴールド消費失敗:', error.errorMessage || error.message || error);
            res.status(500).json({
                error: 'ゴールド消費に失敗しました。',
                details: error.errorMessage || error.message
            });
        }
    });

    // ランキング取得
    app.post('/api/get-ranking', async (req, res) => {
        try {
            const result = await promisifyPlayFab(PlayFabServer.GetLeaderboard, {
                StatisticName: LEADERBOARD_NAME,
                StartPosition: 0,
                MaxResultsCount: 10,
                ProfileConstraints: { ShowAvatarUrl: true, ShowDisplayName: true }
            });
            let ranking = [];
            if (result && result.Leaderboard) {
                ranking = await buildPlayerRankingRows(result.Leaderboard, { promisifyPlayFab, PlayFabServer }, (entry) => {
                    const avatarUrl = (entry.Profile && entry.Profile.AvatarUrl) ? entry.Profile.AvatarUrl : null;
                    return {
                        position: entry.Position,
                        playFabId: entry.PlayFabId || null,
                        displayName: entry.DisplayName || '名無し',
                        score: entry.StatValue,
                        avatarUrl: avatarUrl
                    };
                });
            }
            res.json({ ranking });
        } catch (error) {
            console.error('ランキング取得失敗:', error.errorMessage || error.message || error);
            return res.status(500).json({
                error: 'ランキング取得に失敗しました。',
                details: error.errorMessage || error.message
            });
        }
    });

    // 懸賞金ランキング取得
    app.post('/api/get-bounty-ranking', async (req, res) => {
        try {
            const calculated = await buildCalculatedGlobalBountyRanking({
                promisifyPlayFab,
                PlayFabServer,
                firestore
            }, {
                limit: req.body?.limit || 10
            });
            if (!calculated) {
                return res.status(503).json({ error: '懸賞金ランキングを計算できませんでした。' });
            }
            res.json(calculated);
        } catch (error) {
            console.error('懸賞金ランキング取得失敗:', error.errorMessage || error.message || error);
            return res.status(500).json({
                error: '懸賞金ランキング取得に失敗しました。',
                details: error.errorMessage || error.message
            });
        }
    });

    app.post('/api/get-store-game-ranking', async (req, res) => {
        try {
            const gameType = normalizeStoreGameType(req.body?.gameType || req.body?.type);
            const game = STORE_GAME_RANKING_STATS[gameType];
            if (!game) return res.status(400).json({ error: 'InvalidGameType' });

            const result = await promisifyPlayFab(PlayFabServer.GetLeaderboard, {
                StatisticName: game.statisticName,
                StartPosition: 0,
                MaxResultsCount: 20,
                ProfileConstraints: { ShowAvatarUrl: true, ShowDisplayName: true }
            });
            const ranking = Array.isArray(result?.Leaderboard)
                ? await buildPlayerRankingRows(
                    result.Leaderboard.filter((entry) => Number(entry?.StatValue || 0) > 0),
                    { promisifyPlayFab, PlayFabServer },
                    (entry) => ({
                        position: entry.Position,
                        playFabId: entry.PlayFabId || null,
                        displayName: entry.DisplayName || entry.Profile?.DisplayName || '名無し',
                        score: Number(entry.StatValue || 0),
                        scoreScale: Math.max(1, Math.floor(Number(game.scoreScale) || 1)),
                        isRating: isStoreGameRatingGame(game),
                        initialRating: Math.max(1, Math.floor(Number(game.initialRating) || STORE_GAME_ELO_INITIAL_RATING)),
                        avatarUrl: entry.Profile?.AvatarUrl || null
                    })
                )
                : [];
            res.json({
                success: true,
                gameType,
                label: game.label,
                isRating: isStoreGameRatingGame(game),
                initialRating: Math.max(1, Math.floor(Number(game.initialRating) || STORE_GAME_ELO_INITIAL_RATING)),
                kFactor: Math.max(1, Math.floor(Number(game.kFactor) || STORE_GAME_ELO_K_FACTOR)),
                ranking
            });
        } catch (error) {
            console.error('[get-store-game-ranking] failed:', error?.errorMessage || error?.message || error);
            return res.status(500).json({
                error: 'ランキング取得に失敗しました。',
                details: error?.errorMessage || error?.message
            });
        }
    });

    app.post('/api/king-update-store-game-score', async (req, res) => {
        const playFabId = String(req.body?.playFabId || '').trim();
        const targetPlayFabId = String(req.body?.targetPlayFabId || req.body?.targetId || '').trim();
        if (!playFabId || !targetPlayFabId) {
            return res.status(400).json({ error: 'playFabId and targetPlayFabId are required' });
        }
        const authenticatedPlayFabId = await requireAuthenticatedPlayFabId(req, res, playFabId);
        if (!authenticatedPlayFabId) return;
        try {
            const viewerIsKing = await isKingPlayer(authenticatedPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!viewerIsKing) return res.status(403).json({ error: '王のみ操作できます。' });

            const gameType = normalizeStoreGameType(req.body?.gameType || req.body?.type);
            const game = STORE_GAME_RANKING_STATS[gameType];
            if (!game) return res.status(400).json({ error: 'InvalidGameType' });
            if (isStoreGameRatingGame(game)) {
                const opponentPlayFabId = String(req.body?.opponentPlayFabId || req.body?.opponentId || '').trim();
                if (!opponentPlayFabId) return res.status(400).json({ error: '負けた相手を選択してください。' });
                if (opponentPlayFabId === targetPlayFabId) return res.status(400).json({ error: '同じプレイヤー同士では記録できません。' });

                const [winnerCurrentRaw, loserCurrentRaw] = await Promise.all([
                    getStoreGameStatisticValue(targetPlayFabId, game.statisticName, { promisifyPlayFab, PlayFabServer }),
                    getStoreGameStatisticValue(opponentPlayFabId, game.statisticName, { promisifyPlayFab, PlayFabServer })
                ]);
                const winnerPreviousRating = normalizeStoreGameRating(winnerCurrentRaw, game);
                const loserPreviousRating = normalizeStoreGameRating(loserCurrentRaw, game);
                const winnerRating = calculateStoreGameEloRating(winnerPreviousRating, loserPreviousRating, 1, game);
                const loserRating = calculateStoreGameEloRating(loserPreviousRating, winnerPreviousRating, 0, game);

                await Promise.all([
                    promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                        PlayFabId: targetPlayFabId,
                        Statistics: [{ StatisticName: game.statisticName, Value: winnerRating }]
                    }),
                    promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                        PlayFabId: opponentPlayFabId,
                        Statistics: [{ StatisticName: game.statisticName, Value: loserRating }]
                    })
                ]);
                const [winnerDisplayName, loserDisplayName] = await Promise.all([
                    getPlayerDisplayName(targetPlayFabId, { promisifyPlayFab, PlayFabServer }),
                    getPlayerDisplayName(opponentPlayFabId, { promisifyPlayFab, PlayFabServer })
                ]);
                return res.json({
                    success: true,
                    gameType,
                    label: game.label,
                    isRating: true,
                    targetPlayFabId,
                    opponentPlayFabId,
                    displayName: winnerDisplayName,
                    opponentDisplayName: loserDisplayName,
                    previousRating: winnerPreviousRating,
                    rating: winnerRating,
                    opponentPreviousRating: loserPreviousRating,
                    opponentRating: loserRating,
                    score: winnerRating,
                    storedScore: winnerRating,
                    scoreScale: 1,
                    initialRating: Math.max(1, Math.floor(Number(game.initialRating) || STORE_GAME_ELO_INITIAL_RATING)),
                    kFactor: Math.max(1, Math.floor(Number(game.kFactor) || STORE_GAME_ELO_K_FACTOR))
                });
            }
            const scoreInfo = normalizeStoreGameScore(req.body?.score, game);
            if (scoreInfo.storedScore <= 0) return res.status(400).json({ error: '点数を入力してください。' });

            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: targetPlayFabId,
                Statistics: [{ StatisticName: game.statisticName, Value: scoreInfo.storedScore }]
            });
            const displayName = await getPlayerDisplayName(targetPlayFabId, { promisifyPlayFab, PlayFabServer });
            res.json({
                success: true,
                gameType,
                label: game.label,
                targetPlayFabId,
                displayName,
                score: scoreInfo.score,
                storedScore: scoreInfo.storedScore,
                scoreScale: Math.max(1, Math.floor(Number(game.scoreScale) || 1))
            });
        } catch (error) {
            console.error('[king-update-store-game-score] failed:', error?.errorMessage || error?.message || error);
            return res.status(500).json({
                error: '店内ゲームの点数更新に失敗しました。',
                details: error?.errorMessage || error?.message
            });
        }
    });

    // ゴールド送金
    app.post('/api/transfer-points', async (req, res) => {
        const normalizePlayFabId = (value) => {
            const raw = String(value || '').trim();
            if (!raw) return '';
            return raw.replace(/^playfab:/i, '').trim().toUpperCase();
        };
        const isValidPlayFabId = (value) => /^[A-F0-9]{16,32}$/.test(value);

        const fromId = normalizePlayFabId(req.body?.fromId);
        const toId = normalizePlayFabId(req.body?.toId);
        const requestId = String(req.body?.requestId || '').trim();
        const amountInt = parseInt(req.body?.amount, 10);
        if (!fromId || !toId || !amountInt || amountInt <= 0) {
            return res.status(400).json({ error: '送金パラメータが不正です。' });
        }
        if (!isValidPlayFabId(toId)) {
            return res.status(400).json({ error: '送金先IDが正しくありません。' });
        }
        if (fromId === toId) {
            return res.status(400).json({ error: '同じアカウントには送金できません。' });
        }
        if (!requestId) {
            return res.status(400).json({ error: 'requestId is required' });
        }
        const authenticatedPlayFabId = await requireAuthenticatedPlayFabId(req, res, fromId);
        if (!authenticatedPlayFabId) return;
        try {
            const idempotencyFor = (suffix) => requestId ? `${requestId}:${suffix}` : null;
            const payerDeps = { ...economyDeps, idempotencyId: idempotencyFor('ps-transfer') };
            await transferEconomyItem(authenticatedPlayFabId, toId, VIRTUAL_CURRENCY_CODE, amountInt, payerDeps);
            const payerNewBalance = await getCurrencyBalance(authenticatedPlayFabId, VIRTUAL_CURRENCY_CODE, economyDeps);
            try {
                const receiverNewBalance = await getCurrencyBalance(toId, VIRTUAL_CURRENCY_CODE, economyDeps);
                await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                    PlayFabId: authenticatedPlayFabId,
                    Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: payerNewBalance }]
                });
                await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                    PlayFabId: toId,
                    Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: receiverNewBalance }]
                });
                try {
                    const getDisplayName = async (id) => {
                        try {
                            const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                                PlayFabId: id,
                                ProfileConstraints: { ShowDisplayName: true }
                            });
                            return profile?.PlayerProfile?.DisplayName || id;
                        } catch {
                            return id;
                        }
                    };
                    const [toName, fromName] = await Promise.all([
                        getDisplayName(toId),
                        getDisplayName(authenticatedPlayFabId)
                    ]);
                    addGlobalChatMessage(`「${toName}」は「${fromName}」から${amountInt}G勝ち取った！`, 'システム');
                    pushDisplayEvent({
                        type: 'boom',
                        topic: 'ps-transfer',
                        label: `奪取: ${toName} ← ${fromName} ${amountInt}G`
                    });
                } catch (chatError) {
                    console.warn('[transfer-points] Failed to publish global chat:', chatError?.message || chatError);
                }
                if (firestore && admin) {
                    try {
                        await firestore
                            .collection('notifications')
                            .doc(toId)
                            .collection('items')
                            .add({
                                type: 'transfer_in',
                                fromId: authenticatedPlayFabId,
                                amount: amountInt,
                                currency: VIRTUAL_CURRENCY_CODE,
                                balanceAfter: receiverNewBalance,
                                createdAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                    } catch (notifyError) {
                        console.warn('[transfer-points] Notification write failed:', notifyError?.message || notifyError);
                    }
                }
                res.json({ newBalance: payerNewBalance });
            } catch (addError) {
                console.error('送金後の処理失敗:', addError.errorMessage || addError.message || addError);
                const addMessage = addError?.errorMessage || addError?.message || '';
                res.json({
                    newBalance: payerNewBalance,
                    postTransferSyncError: String(addMessage || '送金後の同期に失敗しました。')
                });
            }
        } catch (subtractError) {
            const subtractMessage = subtractError?.errorMessage || subtractError?.message || '';
            if (String(subtractMessage).includes('EntityKeyNotFound')) {
                const hint = '送金元のアカウントが見つかりません。';
                return res.status(400).json({ error: hint });
            }
            if (subtractError.apiErrorInfo && subtractError.apiErrorInfo.apiError === 'InsufficientFunds') {
                return res.status(400).json({ error: 'ゴールドが不足しています。' });
            }
            console.error('送金に失敗:', subtractError.errorMessage || subtractError.message || subtractError);
            res.status(500).json({ error: '送金に失敗しました。', details: subtractError.errorMessage || subtractError.message });
        }
    });

    // プレイヤー表示名取得
    app.post('/api/get-player-display-name', async (req, res) => {
        const { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        try {
            const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: playFabId,
                ProfileConstraints: { ShowDisplayName: true }
            });
            const displayName = profile?.PlayerProfile?.DisplayName || null;
            res.json({ displayName });
        } catch (error) {
            res.status(500).json({
                error: 'Failed to get display name',
                details: error.errorMessage || error.message
            });
        }
    });

    app.post('/api/update-player-display-name', async (req, res) => {
        const { playFabId } = req.body || {};
        const displayName = normalizePlayerDisplayName(req.body?.displayName);
        if (!playFabId || !displayName) return res.status(400).json({ error: 'playFabId and displayName are required' });
        if (displayName.length < 3) return res.status(400).json({ error: '名前は3文字以上で入力してください。' });
        const requesterPlayFabId = await requireAuthenticatedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const readOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: requesterPlayFabId,
                Keys: ['Nation']
            });
            const nation = String(readOnly?.Data?.Nation?.Value || '').trim().toLowerCase();
            const nextDisplayName = buildNationDisplayName(displayName, nation);
            await promisifyPlayFab(PlayFabAdmin.UpdateUserTitleDisplayName, {
                PlayFabId: requesterPlayFabId,
                DisplayName: nextDisplayName
            });
            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: requesterPlayFabId,
                Data: { BaseDisplayName: displayName }
            });
            res.json({ success: true, displayName: nextDisplayName, baseDisplayName: displayName });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            console.error('[update-player-display-name] Error:', msg);
            res.status(500).json({ error: '名前変更に失敗しました。', details: msg });
        }
    });
}

module.exports = {
    VIRTUAL_CURRENCY_CODE,
    LEADERBOARD_NAME,
    ECONOMY_CURRENCY_IDS,
    getEntityKeyForPlayFabId,
    getAllInventoryItems,
    getItemAmount,
    getVirtualCurrencyMap,
    getCurrencyIdFromItem,
    addEconomyItem,
    subtractEconomyItem,
    getCurrencyBalance,
    transferEconomyItem,
    applyTax,
    buildCalculatedTroyBountyRanking,
    buildCalculatedGlobalBountyRanking,
    initializeEconomyRoutes
};
