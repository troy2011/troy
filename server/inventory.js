// server/inventory.js
// インベントリ・装備関連のAPI

const { getItemAmount, getCurrencyIdFromItem } = require('./economy');

const GACHA_CATALOG_VERSION = process.env.GACHA_CATALOG_VERSION || 'main_catalog';
const GACHA_DROP_TABLE_ID = process.env.GACHA_DROP_TABLE_ID || 'gacha_table';
const GACHA_COST = Number(process.env.GACHA_COST || 10);
const VIRTUAL_CURRENCY_CODE = process.env.VIRTUAL_CURRENCY_CODE || 'PS';
const LEADERBOARD_NAME = process.env.LEADERBOARD_NAME || 'ps_ranking';

function normalizeEntityKey(input) {
    const id = input?.Id || input?.id || null;
    const type = input?.Type || input?.type || null;
    if (!id || !type) return null;
    return { Id: String(id), Type: String(type) };
}

// APIルートを初期化
function initializeInventoryRoutes(app, deps) {
    const { promisifyPlayFab, PlayFabServer, PlayFabEconomy, catalogCache, getEntityKeyForPlayFabId, getAllInventoryItems, getVirtualCurrencyMap, addEconomyItem, subtractEconomyItem, getCurrencyBalance } = deps;

    // インベントリ取得
    app.post('/api/get-inventory', async (req, res) => {
        const { playFabId } = req.body;
        const requestEntity = normalizeEntityKey(req.body.entityKey);
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        console.log(`[インベントリ取得] ${playFabId} の持ち物を取得します...`);
        try {
            const entityKey = requestEntity || await getEntityKeyForPlayFabId(playFabId);
            const items = await getAllInventoryItems(entityKey);
            const itemMap = new Map();
            items.forEach((item) => {
                const itemId = item?.Id || item?.ItemId;
                if (!itemId || getCurrencyIdFromItem(item, catalogCache)) return;
                const catalogData = catalogCache[itemId] || {};
                const name = catalogData.DisplayName || catalogData.Title || itemId;
                const amount = getItemAmount(item) || 1;
                if (itemMap.has(name)) {
                    const existing = itemMap.get(name);
                    existing.count += amount;
                    if (item?.StackId) existing.instances.push(item.StackId);
                } else {
                    itemMap.set(name, {
                        name,
                        count: amount,
                        itemId,
                        description: catalogData.Description || '',
                        instances: item?.StackId ? [item.StackId] : [],
                        customData: catalogData
                    });
                }
            });
            const inventoryList = Array.from(itemMap.values());
            const virtualCurrency = getVirtualCurrencyMap(items);
            console.log('[インベントリ取得] 取得完了');
            res.json({ inventory: inventoryList, virtualCurrency });
        } catch (error) {
            console.error('[インベントリ取得] 取得失敗', error.errorMessage || error.message || error);
            res.status(500).json({ error: 'インベントリ取得に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // 装備設定
    app.post('/api/equip-item', async (req, res) => {
        const { playFabId, itemId, slot } = req.body;
        if (!playFabId || !slot) return res.status(400).json({ error: 'IDまたはスロット情報がありません。' });

        const validSlots = { 'RightHand': 'Equipped_RightHand', 'LeftHand': 'Equipped_LeftHand', 'Armor': 'Equipped_Armor' };
        const dataKey = validSlots[slot];
        if (!dataKey) return res.status(400).json({ error: '不正なスロットです。' });

        const dataToUpdate = {};

        if (itemId) {
            dataToUpdate[dataKey] = itemId;
            const itemData = catalogCache[itemId];
            if (itemData && itemData.Category === 'Weapon' && (itemData.sprite_w > 32 || itemData.sprite_h > 32)) {
                console.log(`[装備] 両手武器 (${itemId}) を装備します`);
                dataToUpdate['Equipped_RightHand'] = itemId;
                dataToUpdate['Equipped_LeftHand'] = null;
            }
        } else {
            const currentEquipmentResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, { PlayFabId: playFabId, Keys: ["Equipped_RightHand"] });
            const currentRightHandId = currentEquipmentResult.Data && currentEquipmentResult.Data.Equipped_RightHand ? currentEquipmentResult.Data.Equipped_RightHand.Value : null;
            const itemData = currentRightHandId ? catalogCache[currentRightHandId] : null;

            if (slot === 'RightHand' && itemData && itemData.Category === 'Weapon' && (itemData.sprite_w > 32 || itemData.sprite_h > 32)) {
                console.log(`[装備解除] 両手武器 (${currentRightHandId}) を外します`);
                dataToUpdate['Equipped_RightHand'] = null;
                dataToUpdate['Equipped_LeftHand'] = null;
            } else {
                dataToUpdate[dataKey] = null;
            }
        }

        console.log(`[装備] ${playFabId} の装備を更新します...`, dataToUpdate);

        try {
            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: playFabId,
                Data: dataToUpdate,
                Permission: "Public"
            });
            console.log('[装備] 更新完了');
            res.json({ status: 'success', equippedItem: itemId });
        } catch (error) {
            console.error('[装備] エラー', error.errorMessage);
            res.status(500).json({ error: '装備の更新に失敗しました。', details: error.errorMessage });
        }
    });

    // 装備取得
    app.post('/api/get-equipment', async (req, res) => {
        const { playFabId } = req.body;
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        console.log(`[装備取得] ${playFabId} の装備を取得します...`);
        try {
            const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId, Keys: ["Equipped_RightHand", "Equipped_LeftHand", "Equipped_Armor"]
            });
            const equipment = {};
            if (result.Data && result.Data.Equipped_RightHand) equipment.RightHand = result.Data.Equipped_RightHand.Value;
            if (result.Data && result.Data.Equipped_LeftHand) equipment.LeftHand = result.Data.Equipped_LeftHand.Value;
            if (result.Data && result.Data.Equipped_Armor) equipment.Armor = result.Data.Equipped_Armor.Value;
            console.log('[装備取得] 完了', equipment);
            res.json({ equipment: equipment });
        } catch (error) {
            console.error('[装備取得] エラー', error.errorMessage);
            res.status(500).json({ error: '装備の取得に失敗しました。', details: error.errorMessage });
        }
    });

    // ステータス取得
    app.post('/api/get-stats', async (req, res) => {
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
            console.log('[ステータス取得] 完了');
            res.json({ stats: stats });
        } catch (error) {
            console.error('[ステータス取得] エラー', error.errorMessage);
            res.status(500).json({ error: 'ステータス取得に失敗しました。', details: error.errorMessage });
        }
    });

    // アイテム使用
    app.post('/api/use-item', async (req, res) => {
        const { playFabId, itemInstanceId, itemId } = req.body;
        if (!playFabId || !itemInstanceId || !itemId) {
            return res.status(400).json({ error: 'IDまたはアイテム情報が不足しています。' });
        }

        console.log(`[アイテム使用] ${playFabId} がアイテム (Instance: ${itemInstanceId}) を使用します...`);

        try {
            const itemData = catalogCache[itemId];
            if (!itemData || itemData.Category !== 'Consumable' || !itemData.Effect) {
                return res.status(400).json({ error: 'このアイテムは使用できません。' });
            }

            const effect = itemData.Effect;
            if (effect.Type !== 'Heal' || !effect.Target || !effect.Amount) {
                return res.status(400).json({ error: 'アイテム効果の設定が不正です。' });
            }

            const statsResult = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: playFabId });
            const currentStats = {};
            if (statsResult.Statistics) {
                statsResult.Statistics.forEach(stat => { currentStats[stat.StatisticName] = stat.Value; });
            }

            const targetStat = effect.Target;
            const maxStat = `Max${targetStat}`;
            const currentValue = currentStats[targetStat] || 0;
            const maxValue = currentStats[maxStat] || currentValue;

            if (currentValue >= maxValue) {
                return res.status(400).json({ error: `${targetStat} は既に満タンです。` });
            }

            await subtractEconomyItem(playFabId, itemId, 1);
            console.log(`[アイテム使用] ${playFabId} のアイテム ${itemInstanceId} を消費しました`);

            const recoveredValue = Math.min(currentValue + effect.Amount, maxValue);
            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: playFabId,
                Statistics: [{ StatisticName: targetStat, Value: recoveredValue }]
            });
            console.log(`[アイテム使用] ${playFabId} の ${targetStat} を ${currentValue} -> ${recoveredValue} に回復しました`);

            res.json({
                status: 'success',
                message: `${itemData.DisplayName || itemId}を使用しました。${targetStat}が${effect.Amount}回復しました。`,
                updatedStats: {
                    [targetStat]: recoveredValue
                }
            });

        } catch (error) {
            console.error('[アイテム使用] エラー', error.errorMessage || error.message, error.apiErrorInfo);

            if (error.apiErrorInfo && error.apiErrorInfo.apiError === 'ItemIsNotConsumable') {
                return res.status(400).json({ error: 'このアイテムは消費できません。' });
            }
            if (error.apiErrorInfo && error.apiErrorInfo.apiError === 'NoRemainingUses') {
                return res.status(400).json({ error: 'このアイテムはもう使えません。' });
            }
            res.status(500).json({ error: 'アイテムの使用に失敗しました。', details: error.errorMessage || 'サーバーで予期しないエラーが発生しました。' });
        }
    });

    // アイテム売却
    app.post('/api/sell-item', async (req, res) => {
        const { playFabId, itemInstanceId, itemId } = req.body;
        if (!playFabId || !itemInstanceId || !itemId) {
            return res.status(400).json({ error: 'IDまたはアイテム情報が不足しています。' });
        }

        console.log(`[アイテム売却] ${playFabId} がアイテム (Instance: ${itemInstanceId}) を売却します...`);

        try {
            const itemData = catalogCache[itemId];
            const sellPrice = (itemData && itemData.SellPrice)
                ? parseInt(itemData.SellPrice, 10)
                : 0;

            if (!sellPrice || sellPrice <= 0) {
                return res.status(400).json({ error: 'このアイテムは売却できません。' });
            }

            await subtractEconomyItem(playFabId, itemId, 1);
            console.log('[アイテム売却] アイテムを消費しました');

            await addEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, sellPrice);
            const newBalance = await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE);
            console.log('[アイテム売却] PS を付与しました');

            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: playFabId,
                Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: newBalance }]
            });
            console.log('[アイテム売却] ランキングスコアを更新しました');

            res.json({
                status: 'success',
                message: `${itemData.DisplayName || itemId}を${sellPrice} PSで売却しました。`,
                newBalance: newBalance
            });

        } catch (error) {
            console.error('[アイテム売却] エラー', error.errorMessage || error.message, error.apiErrorInfo);

            if (error.apiErrorInfo && error.apiErrorInfo.apiError === 'ItemNotFound') {
                return res.status(400).json({ error: '指定されたアイテムが見つかりません。' });
            }
            res.status(500).json({
                error: 'アイテムの売却に失敗しました。',
                details: error.errorMessage || 'サーバーで予期しないエラーが発生しました。'
            });
        }
    });

    // ガチャ
    app.post('/api/pull-gacha', async (req, res) => {
        const { playFabId } = req.body;
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        try {
            await subtractEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, GACHA_COST);
            const newBalance = await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE);
            try {
                await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                    PlayFabId: playFabId,
                    Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: newBalance }]
                });
                const evalResult = await promisifyPlayFab(PlayFabServer.EvaluateRandomResultTable, {
                    TableId: GACHA_DROP_TABLE_ID,
                    CatalogVersion: GACHA_CATALOG_VERSION
                });
                const grantedItemId = evalResult.ResultItemId;
                if (!grantedItemId) throw new Error('ガチャ結果が空でした。');
                await addEconomyItem(playFabId, grantedItemId, 1);
                res.json({
                    newBalance: newBalance,
                    grantedItems: [{ ItemId: grantedItemId }]
                });
            } catch (grantError) {
                console.error('ガチャ付与失敗:', grantError.errorMessage || grantError.message || grantError);
                await addEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, GACHA_COST);
                res.status(500).json({
                    error: 'ガチャ報酬の付与に失敗しました。',
                    details: grantError.errorMessage || grantError.message
                });
            }
        } catch (subtractError) {
            if (subtractError.apiErrorInfo && subtractError.apiErrorInfo.apiError === 'InsufficientFunds') {
                return res.status(400).json({ error: `ポイントが不足しています。必要: ${GACHA_COST} PS` });
            }
            console.error('ガチャ課金失敗:', subtractError.errorMessage || subtractError.message || subtractError);
            res.status(500).json({ error: 'ガチャに失敗しました。', details: subtractError.errorMessage || subtractError.message });
        }
    });
}

module.exports = {
    GACHA_CATALOG_VERSION,
    GACHA_DROP_TABLE_ID,
    GACHA_COST,
    initializeInventoryRoutes
};
