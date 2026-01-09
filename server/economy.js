// server/economy.js
// 経済関連のユーティリティ関数

const VIRTUAL_CURRENCY_CODE = process.env.VIRTUAL_CURRENCY_CODE || 'PS';
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
        const result = await promisifyPlayFab(PlayFabEconomy.GetInventoryItems, {
            Entity: entityKey,
            Count: 50,
            ContinuationToken: token || undefined
        });
        const page = Array.isArray(result?.Items) ? result.Items : [];
        items.push(...page);
        token = result?.ContinuationToken || null;
    } while (token);
    return items;
}

function getItemAmount(item) {
    return Number(item?.Amount ?? item?.amount ?? 0) || 0;
}

function getVirtualCurrencyMap(items) {
    const totals = {};
    (items || []).forEach((item) => {
        const itemId = item?.Id || item?.ItemId;
        if (!itemId || !ECONOMY_CURRENCY_IDS.has(itemId)) return;
        totals[itemId] = (totals[itemId] || 0) + getItemAmount(item);
    });
    return totals;
}

async function getCurrencyBalanceWithEntity(entityKey, currencyId, deps) {
    const { promisifyPlayFab, PlayFabEconomy } = deps;
    const items = await getAllInventoryItems(entityKey, { promisifyPlayFab, PlayFabEconomy });
    const totals = getVirtualCurrencyMap(items);
    return totals[currencyId] || 0;
}

async function addEconomyItem(playFabId, itemId, amount, deps) {
    const { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId, entityKeyOverride } = deps;
    const requestEntity = normalizeEntityKey(entityKeyOverride);
    const entityKey = requestEntity || await getEntityKeyForPlayFabId(playFabId, { getEntityKeyFromPlayFabId });
    await promisifyPlayFab(PlayFabEconomy.AddInventoryItems, {
        Entity: entityKey,
        Amount: Number(amount),
        Item: { Id: itemId }
    });
    return entityKey;
}

async function subtractEconomyItem(playFabId, itemId, amount, deps) {
    const { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId, entityKeyOverride } = deps;
    const requestEntity = normalizeEntityKey(entityKeyOverride);
    const entityKey = requestEntity || await getEntityKeyForPlayFabId(playFabId, { getEntityKeyFromPlayFabId });
    await promisifyPlayFab(PlayFabEconomy.SubtractInventoryItems, {
        Entity: entityKey,
        Amount: Number(amount),
        Item: { Id: itemId }
    });
    return entityKey;
}

async function getCurrencyBalance(playFabId, currencyId, deps) {
    const { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId } = deps;
    const entityKey = await getEntityKeyForPlayFabId(playFabId, { getEntityKeyFromPlayFabId });
    const items = await getAllInventoryItems(entityKey, { promisifyPlayFab, PlayFabEconomy });
    const totals = getVirtualCurrencyMap(items);
    return totals[currencyId] || 0;
}

function applyTax(amount, taxRateBps) {
    const gross = Math.max(0, Math.floor(Number(amount) || 0));
    const bps = Math.max(0, Math.min(5000, Math.floor(Number(taxRateBps) || 0)));
    const tax = Math.floor((gross * bps) / 10000);
    const net = Math.max(0, gross - tax);
    return { gross, tax, net, bps };
}

// APIルートを初期化
function initializeEconomyRoutes(app, deps) {
    const { promisifyPlayFab, PlayFabServer, PlayFabEconomy, getEntityKeyFromPlayFabId } = deps;

    const economyDeps = { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId };

    // ポイント取得
    app.post('/api/get-points', async (req, res) => {
        const playFabId = req.body.playFabId;
        const requestEntity = normalizeEntityKey(req.body.entityKey);
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        try {
            const points = requestEntity
                ? await getCurrencyBalanceWithEntity(requestEntity, VIRTUAL_CURRENCY_CODE, economyDeps)
                : await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE, economyDeps);
            res.json({ points });
        } catch (error) {
            res.status(500).json({
                error: 'ポイント取得に失敗しました。',
                details: error.errorMessage || error.message
            });
        }
    });

    // ポイント追加
    app.post('/api/add-points', async (req, res) => {
        const { playFabId, amount } = req.body;
        if (!playFabId || !amount) {
            return res.status(400).json({ error: 'PlayFab ID と amount が必要です。' });
        }
        try {
            await addEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, amount, economyDeps);
            const newBalance = await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE, economyDeps);
            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: playFabId,
                Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: newBalance }]
            });
            res.json({ newBalance });
        } catch (error) {
            console.error('ポイント追加失敗:', error.errorMessage || error.message || error);
            res.status(500).json({
                error: 'ポイント追加に失敗しました。',
                details: error.errorMessage || error.message
            });
        }
    });

    // ポイント消費
    app.post('/api/use-points', async (req, res) => {
        const { playFabId, amount } = req.body;
        if (!playFabId || !amount) {
            return res.status(400).json({ error: 'PlayFab ID と amount が必要です。' });
        }
        try {
            await subtractEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, amount, economyDeps);
            const newBalance = await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE, economyDeps);
            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: playFabId,
                Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: newBalance }]
            });
            res.json({ newBalance });
        } catch (error) {
            if (error.apiErrorInfo && error.apiErrorInfo.apiError === 'InsufficientFunds') {
                return res.status(400).json({ error: 'ポイントが不足しています。' });
            }
            console.error('ポイント消費失敗:', error.errorMessage || error.message || error);
            res.status(500).json({
                error: 'ポイント消費に失敗しました。',
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

    // 賞金ランキング取得
    app.post('/api/get-bounty-ranking', async (req, res) => {
        try {
            const result = await promisifyPlayFab(PlayFabServer.GetLeaderboard, {
                StatisticName: 'bounty_ranking',
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
                        displayName: entry.DisplayName || '名無し',
                        score: entry.StatValue,
                        avatarUrl: avatarUrl
                    };
                });
            }
            res.json({ ranking });
        } catch (error) {
            console.error('賞金ランキング取得失敗:', error.errorMessage || error.message || error);
            return res.status(500).json({
                error: '賞金ランキング取得に失敗しました。',
                details: error.errorMessage || error.message
            });
        }
    });

    // ポイント送金
    app.post('/api/transfer-points', async (req, res) => {
        const { fromId, toId, amount } = req.body;
        const amountInt = parseInt(amount, 10);
        if (!fromId || !toId || !amountInt || amountInt <= 0) {
            return res.status(400).json({ error: '送金パラメータが不正です。' });
        }
        if (fromId === toId) {
            return res.status(400).json({ error: '同じアカウントには送金できません。' });
        }
        try {
            await subtractEconomyItem(fromId, VIRTUAL_CURRENCY_CODE, amountInt, economyDeps);
            const payerNewBalance = await getCurrencyBalance(fromId, VIRTUAL_CURRENCY_CODE, economyDeps);
            try {
                await addEconomyItem(toId, VIRTUAL_CURRENCY_CODE, amountInt, economyDeps);
                const receiverNewBalance = await getCurrencyBalance(toId, VIRTUAL_CURRENCY_CODE, economyDeps);
                await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                    PlayFabId: fromId,
                    Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: payerNewBalance }]
                });
                await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                    PlayFabId: toId,
                    Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: receiverNewBalance }]
                });
                res.json({ newBalance: payerNewBalance });
            } catch (addError) {
                console.error('送金先への加算失敗:', addError.errorMessage || addError.message || addError);
                await addEconomyItem(fromId, VIRTUAL_CURRENCY_CODE, amountInt, economyDeps);
                res.status(500).json({ error: '送金先への加算に失敗しました。' });
            }
        } catch (subtractError) {
            if (subtractError.apiErrorInfo && subtractError.apiErrorInfo.apiError === 'InsufficientFunds') {
                return res.status(400).json({ error: 'ポイントが不足しています。' });
            }
            console.error('送金元からの減算失敗:', subtractError.errorMessage || subtractError.message || subtractError);
            res.status(500).json({ error: '送金に失敗しました。', details: subtractError.errorMessage || subtractError.message });
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
    addEconomyItem,
    subtractEconomyItem,
    getCurrencyBalance,
    applyTax,
    initializeEconomyRoutes
};
