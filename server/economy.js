// server/economy.js
// 経済関連のユーティリティ関数

const { addGlobalChatMessage } = require('./chat');
const { withTitleEntityToken } = require('./playfab');
const {
    PLAYER_DAILY_CONTRIBUTION_STAT,
    ensureDailyContributionVersionForToday
} = require('./contributionStats');
const VIRTUAL_CURRENCY_CODE = String(process.env.VIRTUAL_CURRENCY_CODE || 'PS').trim().toUpperCase();
const LEADERBOARD_NAME = process.env.LEADERBOARD_NAME || 'ps_ranking';

const ECONOMY_CURRENCY_IDS = new Set([
    VIRTUAL_CURRENCY_CODE,
    'RR',
    'RG',
    'RY',
    'RB',
    'RT',
    'RS'
]);
const BOUNTY_RESET_DATE_KEY = 'BountyResetDate';
const EXPERIENCE_KEY = 'Experience';
const STORE_GAME_RANKING_STATS = {
    darts_countup: {
        statisticName: 'troy_darts_countup_score',
        label: 'ダーツカウントアップ',
        maxScore: 9999,
        scoreScale: 1
    },
    karaoke: {
        statisticName: 'troy_karaoke_score',
        label: 'カラオケ採点',
        maxScore: 100,
        scoreScale: 1000
    }
};
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
    const emoji = NATION_EMOJI_BY_NATION[String(nation || '').trim().toLowerCase()] || '';
    return (emoji && base ? `${emoji} ${base}` : base).slice(0, 25);
}

function getJstDateKey(nowMs = Date.now()) {
    const jstMs = nowMs + (9 * 60 * 60 * 1000);
    return new Date(jstMs).toISOString().slice(0, 10);
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
    const { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId, entityKeyOverride, resolveItemId, idempotencyId } = deps;
    const requestEntity = normalizeEntityKey(entityKeyOverride);
    const entityKey = requestEntity || await getEntityKeyForPlayFabId(playFabId, { getEntityKeyFromPlayFabId });
    const resolvedItemId = typeof resolveItemId === 'function' ? resolveItemId(itemId) : itemId;
    const request = {
        Entity: entityKey,
        Amount: Number(amount),
        Item: { Id: resolvedItemId }
    };
    if (idempotencyId) request.IdempotencyId = String(idempotencyId);
    await withTitleEntityToken(() => promisifyPlayFab(PlayFabEconomy.AddInventoryItems, request));
    return entityKey;
}

async function subtractEconomyItem(playFabId, itemId, amount, deps) {
    const { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId, entityKeyOverride, resolveItemId, idempotencyId } = deps;
    const requestEntity = normalizeEntityKey(entityKeyOverride);
    const entityKey = requestEntity || await getEntityKeyForPlayFabId(playFabId, { getEntityKeyFromPlayFabId });
    const resolvedItemId = typeof resolveItemId === 'function' ? resolveItemId(itemId) : itemId;
    const request = {
        Entity: entityKey,
        Amount: Number(amount),
        Item: { Id: resolvedItemId }
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

async function ensureDailyBountyConversion(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    if (!playFabId) return { updated: false };

    const todayKey = getJstDateKey();
    const readResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [BOUNTY_RESET_DATE_KEY, EXPERIENCE_KEY]
    });
    const currentExpRaw = readResult?.Data?.[EXPERIENCE_KEY]?.Value;
    const currentExp = Number(currentExpRaw) || 0;
    const lastKey = readResult?.Data?.[BOUNTY_RESET_DATE_KEY]?.Value || '';
    if (lastKey === todayKey) {
        return { updated: false, exp: currentExp };
    }
    const bountyAmount = await getCurrencyBalance(playFabId, 'BT', deps);

    let nextExp = currentExp;
    if (bountyAmount > 0) {
        await subtractEconomyItem(playFabId, 'BT', bountyAmount, deps);
        nextExp = currentExp + bountyAmount;
    }

    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: {
            [BOUNTY_RESET_DATE_KEY]: todayKey,
            [EXPERIENCE_KEY]: String(nextExp)
        }
    });
    await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
        PlayFabId: playFabId,
        Statistics: [{ StatisticName: 'bounty_ranking', Value: 0 }]
    });

    return { updated: true, bountyConverted: bountyAmount, exp: nextExp };
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
                ranking = result.Leaderboard.map((entry) => {
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

    // 日次貢献度ランキング取得
    app.post('/api/get-bounty-ranking', async (req, res) => {
        try {
            const contributionState = await ensureDailyContributionVersionForToday({
                firestore,
                admin,
                promisifyPlayFab,
                PlayFabServer,
                PlayFabAdmin
            });
            const result = await promisifyPlayFab(PlayFabServer.GetLeaderboard, {
                StatisticName: PLAYER_DAILY_CONTRIBUTION_STAT,
                StartPosition: 0,
                MaxResultsCount: 10,
                ProfileConstraints: { ShowAvatarUrl: true, ShowDisplayName: true },
                Version: contributionState.activeVersion
            });
            let ranking = [];
            if (result && result.Leaderboard) {
                ranking = result.Leaderboard.map((entry) => {
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
            res.json({
                ranking,
                dayKey: contributionState.activeDayKey
            });
        } catch (error) {
            console.error('貢献度ランキング取得失敗:', error.errorMessage || error.message || error);
            return res.status(500).json({
                error: '貢献度ランキング取得に失敗しました。',
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
                ? result.Leaderboard
                    .filter((entry) => Number(entry?.StatValue || 0) > 0)
                    .map((entry) => ({
                        position: entry.Position,
                        playFabId: entry.PlayFabId || null,
                        displayName: entry.DisplayName || entry.Profile?.DisplayName || '名無し',
                        score: Number(entry.StatValue || 0),
                        scoreScale: Math.max(1, Math.floor(Number(game.scoreScale) || 1)),
                        avatarUrl: entry.Profile?.AvatarUrl || null
                    }))
                : [];
            res.json({ success: true, gameType, label: game.label, ranking });
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
            const scoreInfo = normalizeStoreGameScore(req.body?.score, game);
            if (scoreInfo.storedScore <= 0) return res.status(400).json({ error: '点数を入力してください。' });

            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: targetPlayFabId,
                Statistics: [{ StatisticName: game.statisticName, Value: scoreInfo.storedScore }]
            });
            let displayName = targetPlayFabId;
            try {
                const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                    PlayFabId: targetPlayFabId,
                    ProfileConstraints: { ShowDisplayName: true }
                });
                displayName = String(profile?.PlayerProfile?.DisplayName || targetPlayFabId).trim() || targetPlayFabId;
            } catch {}
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
        const authenticatedPlayFabId = await requireAuthenticatedPlayFabId(req, res, fromId);
        if (!authenticatedPlayFabId) return;
        try {
            const idempotencyFor = (suffix) => requestId ? `${requestId}:${suffix}` : null;
            const payerDeps = { ...economyDeps, idempotencyId: idempotencyFor('ps-transfer') };
            await transferEconomyItem(authenticatedPlayFabId, toId, VIRTUAL_CURRENCY_CODE, amountInt, payerDeps);
            const payerNewBalance = await getCurrencyBalance(authenticatedPlayFabId, VIRTUAL_CURRENCY_CODE, economyDeps);
            try {
                const receiverNewBalance = await getCurrencyBalance(toId, VIRTUAL_CURRENCY_CODE, economyDeps);
                let bountyAdded = false;
                let receiverNewBounty = null;
                let payerNewBounty = null;
                let bountyTransferred = 0;
                let bountyShortage = false;
                try {
                    const payerBounty = await getCurrencyBalance(authenticatedPlayFabId, 'BT', economyDeps);
                    const bountyTransfer = Math.min(Math.max(0, payerBounty), amountInt);
                    bountyShortage = payerBounty < amountInt;
                    if (bountyTransfer > 0) {
                        await transferEconomyItem(authenticatedPlayFabId, toId, 'BT', bountyTransfer, { ...payerDeps, idempotencyId: idempotencyFor('bt-transfer') });
                        receiverNewBounty = await getCurrencyBalance(toId, 'BT', economyDeps);
                        payerNewBounty = await getCurrencyBalance(authenticatedPlayFabId, 'BT', economyDeps);
                        bountyAdded = true;
                        bountyTransferred = bountyTransfer;
                    }
                } catch (bountyError) {
                    console.warn('[transfer-points] Failed to sync bounty:', bountyError?.errorMessage || bountyError?.message || bountyError);
                }
                await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                    PlayFabId: authenticatedPlayFabId,
                    Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: payerNewBalance }]
                });
                const receiverStats = [{ StatisticName: LEADERBOARD_NAME, Value: receiverNewBalance }];
                if (bountyAdded && receiverNewBounty !== null) {
                    receiverStats.push({ StatisticName: 'bounty_ranking', Value: receiverNewBounty });
                }
                await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                    PlayFabId: toId,
                    Statistics: receiverStats
                });
                if (bountyAdded && payerNewBounty !== null) {
                    await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                        PlayFabId: authenticatedPlayFabId,
                        Statistics: [{ StatisticName: 'bounty_ranking', Value: payerNewBounty }]
                    });
                }
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
                res.json({ newBalance: payerNewBalance, bountyAdded, bountyShortage, bountyTransferred });
            } catch (addError) {
                console.error('送金後の処理失敗:', addError.errorMessage || addError.message || addError);
                const addMessage = addError?.errorMessage || addError?.message || '';
                if (String(addMessage).includes('EntityKeyNotFound')) {
                    return res.status(400).json({ error: '送金先のアカウントが見つかりません。' });
                }
                res.status(500).json({ error: '送金後の処理に失敗しました。' });
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
    ensureDailyBountyConversion,
    applyTax,
    initializeEconomyRoutes
};
