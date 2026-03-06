// server/inventory.js
// インベントリ・装備関連のAPI

const { getItemAmount, getCurrencyIdFromItem } = require('./economy');
const resourceStorage = require('./resourceStorage');

const GACHA_CATALOG_VERSION = process.env.GACHA_CATALOG_VERSION || 'main_catalog';
const GACHA_DROP_TABLE_ID = process.env.GACHA_DROP_TABLE_ID || 'gacha_table';
const GACHA_COST = Number(process.env.GACHA_COST || 10);
const VIRTUAL_CURRENCY_CODE = String(process.env.VIRTUAL_CURRENCY_CODE || 'PS').trim().toUpperCase();
const LEADERBOARD_NAME = process.env.LEADERBOARD_NAME || 'ps_ranking';
const RESOURCE_RECOVERY_SETTINGS = {
    hp: {
        itemId: 'RY',
        targetStat: 'HP',
        maxStat: 'MaxHP',
        amount: 5,
        fullMessage: 'HPはすでに満タンです。',
        missingMessage: '🍄が足りません。'
    },
    mp: {
        itemId: 'RB',
        targetStat: 'MP',
        maxStat: 'MaxMP',
        amount: 1,
        resolveAmount: (stats, maxValue) => Math.max(1, Math.ceil(Number(maxValue || stats?.MaxMP || 1) * 0.25)),
        fullMessage: 'MPはすでに満タンです。',
        missingMessage: '🫙が足りません。'
    }
};
const VOYAGE_MP_SETTINGS = {
    freeSeconds: 30,
    extraStepSeconds: 90,
    baseCost: 1
};
const VOYAGE_MP_CLASS_ADJUSTMENTS = {
    common: 0,
    explorer: -1,
    merchant: 0,
    fighter: 0,
    defender: 1,
    guild: 2
};
const DOCKED_MP_RECOVERY_SETTINGS = {
    amount: 1,
    cooldownMs: 30 * 1000,
    internalKey: 'DockedMpRecoveryAt'
};
const OFFLINE_MP_RECOVERY_SETTINGS = {
    amount: 1,
    intervalMs: 15 * 60 * 1000,
    internalKey: 'OfflineMpRecoveryAt'
};

function calculateVoyageMpCost(durationMs) {
    const durationValue = Number(durationMs);
    if (!Number.isFinite(durationValue) || durationValue <= 0) {
        return 0;
    }
    const durationSeconds = durationValue / 1000;
    if (durationSeconds <= VOYAGE_MP_SETTINGS.freeSeconds) {
        return 0;
    }
    return VOYAGE_MP_SETTINGS.baseCost + Math.floor((durationSeconds - VOYAGE_MP_SETTINGS.freeSeconds) / VOYAGE_MP_SETTINGS.extraStepSeconds);
}

function normalizeShipClassFromItemId(itemId) {
    const key = String(itemId || '').toLowerCase();
    if (!key) return null;
    if (key === 'ship_common_boat' || key.includes('common')) return 'common';
    if (key === 'guild' || key.includes('guild')) return 'guild';
    if (key.includes('explorer')) return 'explorer';
    if (key.includes('merchant')) return 'merchant';
    if (key.includes('defender')) return 'defender';
    if (key.includes('fighter')) return 'fighter';
    return null;
}

async function resolveActiveShipClass(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const activeShipId = await resourceStorage.getActiveShipId(playFabId, { promisifyPlayFab, PlayFabServer });
    if (!activeShipId) return null;
    const shipData = await resourceStorage.getShipAsset(playFabId, activeShipId, { promisifyPlayFab, PlayFabServer });
    if (!shipData) return null;
    const itemId = String(shipData?.ItemId || '').trim();
    return normalizeShipClassFromItemId(itemId);
}

function applyVoyageMpClassAdjustment(baseCost, shipClass) {
    if (baseCost <= 0) return 0;
    const delta = Number(VOYAGE_MP_CLASS_ADJUSTMENTS[String(shipClass || '').toLowerCase()] || 0);
    return Math.max(1, baseCost + delta);
}

function parseBooleanFlag(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function resolveIsKingFlag(readOnlyData) {
    if (!readOnlyData || typeof readOnlyData !== 'object') return false;
    return parseBooleanFlag(readOnlyData?.IsKing?.Value);
}

// APIルートを初期化
function initializeInventoryRoutes(app, deps) {
    const { promisifyPlayFab, PlayFabServer, PlayFabEconomy, catalogCache, getEntityKeyForPlayFabId, getAllInventoryItems, getVirtualCurrencyMap, addEconomyItem, subtractEconomyItem, getCurrencyBalance, ensureDailyBountyConversion, requireAuthenticatedPlayFabId } = deps;

    async function requireAuthedPlayFabId(req, res, playFabId) {
        if (typeof requireAuthenticatedPlayFabId !== 'function') {
            return playFabId;
        }
        return requireAuthenticatedPlayFabId(req, res, playFabId);
    }

    async function getPlayerStatsMap(playFabId) {
        const result = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, {
            PlayFabId: playFabId
        });
        const currentStats = {};
        if (Array.isArray(result?.Statistics)) {
            result.Statistics.forEach((stat) => {
                currentStats[stat.StatisticName] = stat.Value;
            });
        }
        return currentStats;
    }

    async function applyOfflineMpRecovery(playFabId) {
        const currentStats = await getPlayerStatsMap(playFabId);
        const currentMp = Math.max(0, Number(currentStats.MP || 0));
        const maxMp = Math.max(currentMp, Number(currentStats.MaxMP || currentMp || 0));
        const nowMs = Date.now();
        const internalResult = await promisifyPlayFab(PlayFabServer.GetUserInternalData, {
            PlayFabId: playFabId,
            Keys: [OFFLINE_MP_RECOVERY_SETTINGS.internalKey]
        });
        const lastRecoverAt = Number(
            internalResult?.Data?.[OFFLINE_MP_RECOVERY_SETTINGS.internalKey]?.Value || 0
        );

        if (!Number.isFinite(lastRecoverAt) || lastRecoverAt <= 0) {
            await promisifyPlayFab(PlayFabServer.UpdateUserInternalData, {
                PlayFabId: playFabId,
                Data: {
                    [OFFLINE_MP_RECOVERY_SETTINGS.internalKey]: String(nowMs)
                }
            });
            return { currentStats, recovered: 0 };
        }

        if (currentMp >= maxMp) {
            if (nowMs - lastRecoverAt >= OFFLINE_MP_RECOVERY_SETTINGS.intervalMs) {
                await promisifyPlayFab(PlayFabServer.UpdateUserInternalData, {
                    PlayFabId: playFabId,
                    Data: {
                        [OFFLINE_MP_RECOVERY_SETTINGS.internalKey]: String(nowMs)
                    }
                });
            }
            return { currentStats, recovered: 0 };
        }

        const elapsedMs = Math.max(0, nowMs - lastRecoverAt);
        const recoveredSteps = Math.floor(elapsedMs / OFFLINE_MP_RECOVERY_SETTINGS.intervalMs);
        if (recoveredSteps <= 0) {
            return { currentStats, recovered: 0 };
        }

        const recovered = Math.min(
            maxMp - currentMp,
            recoveredSteps * OFFLINE_MP_RECOVERY_SETTINGS.amount
        );
        if (recovered <= 0) {
            return { currentStats, recovered: 0 };
        }

        const newMp = currentMp + recovered;
        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: playFabId,
            Statistics: [{ StatisticName: 'MP', Value: newMp }]
        });

        const nextRecoverAt = newMp >= maxMp
            ? nowMs
            : lastRecoverAt + (
                Math.ceil(recovered / OFFLINE_MP_RECOVERY_SETTINGS.amount) *
                OFFLINE_MP_RECOVERY_SETTINGS.intervalMs
            );
        await promisifyPlayFab(PlayFabServer.UpdateUserInternalData, {
            PlayFabId: playFabId,
            Data: {
                [OFFLINE_MP_RECOVERY_SETTINGS.internalKey]: String(nextRecoverAt)
            }
        });

        return {
            currentStats: { ...currentStats, MP: newMp },
            recovered
        };
    }

    async function applyResourceRecovery(playFabId, recoveryKey) {
        const config = RESOURCE_RECOVERY_SETTINGS[recoveryKey];
        if (!config) {
            return { ok: false, status: 400, error: '不正な回復種別です。' };
        }

        const currentStats = config.targetStat === 'MP'
            ? (await applyOfflineMpRecovery(playFabId)).currentStats
            : await getPlayerStatsMap(playFabId);

        const currentValue = Number(currentStats[config.targetStat] || 0);
        const maxValue = Number(currentStats[config.maxStat] || currentValue || 0);
        if (currentValue >= maxValue) {
            return { ok: false, status: 400, error: config.fullMessage };
        }
        const recoverAmount = Math.max(
            1,
            Number(
                typeof config.resolveAmount === 'function'
                    ? config.resolveAmount(currentStats, maxValue)
                    : config.amount
            ) || 1
        );

        const activeShipId = await resourceStorage.getActiveShipId(playFabId, { promisifyPlayFab, PlayFabServer });
        if (!activeShipId) {
            return { ok: false, status: 400, error: '使用中の船が必要です。' };
        }
        const shipData = await resourceStorage.getShipAsset(playFabId, activeShipId, { promisifyPlayFab, PlayFabServer });
        if (!shipData) {
            return { ok: false, status: 404, error: '使用中の船データが見つかりません。' };
        }
        const shipCargo = resourceStorage.getShipResourceCargo(shipData);
        const currentBalance = Number(shipCargo[config.itemId] || 0) || 0;
        if (currentBalance < 1) {
            return {
                ok: false,
                status: 402,
                error: config.missingMessage,
                shortages: [{
                    itemId: config.itemId,
                    required: 1,
                    current: currentBalance,
                    shortage: 1 - currentBalance
                }]
            };
        }

        shipCargo[config.itemId] = Math.max(0, currentBalance - 1);
        resourceStorage.setShipResourceCargo(shipData, shipCargo);
        await resourceStorage.updateShipAsset(playFabId, activeShipId, shipData, { promisifyPlayFab, PlayFabServer });

        const recoveredValue = Math.min(currentValue + recoverAmount, maxValue);
        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: playFabId,
            Statistics: [{ StatisticName: config.targetStat, Value: recoveredValue }]
        });

        return {
            ok: true,
            targetStat: config.targetStat,
            recovered: recoveredValue - currentValue,
            newValue: recoveredValue,
            maxValue,
            shipId: activeShipId,
            consumed: { itemId: config.itemId, amount: 1 }
        };
    }

    // インベントリ取得
    app.post('/api/get-inventory', async (req, res) => {
        let { playFabId } = req.body;
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;
        console.log(`[インベントリ取得] ${playFabId} の持ち物を取得します...`);
        try {
            await applyOfflineMpRecovery(playFabId);
            let experience = 0;
            if (typeof ensureDailyBountyConversion === 'function') {
                try {
                    const result = await ensureDailyBountyConversion(playFabId);
                    experience = Number(result?.exp) || 0;
                } catch (resetError) {
                    console.warn('[bounty-reset] Failed:', resetError?.errorMessage || resetError?.message || resetError);
                }
            }
            const entityKey = await getEntityKeyForPlayFabId(playFabId);
            const items = await getAllInventoryItems(entityKey);
            const itemMap = new Map();
            items.forEach((item) => {
                const itemId = item?.Id || item?.ItemId;
                if (!itemId || getCurrencyIdFromItem(item, catalogCache)) return;
                const catalogData = catalogCache[itemId] || {};
                const name = catalogData.DisplayName || catalogData.Title || itemId;
                const amount = getItemAmount(item) || 1;
                if (itemMap.has(itemId)) {
                    const existing = itemMap.get(itemId);
                    existing.count += amount;
                    if (item?.StackId) existing.instances.push(item.StackId);
                } else {
                    itemMap.set(itemId, {
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
            let isKing = false;
            try {
                const readOnlyData = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                    PlayFabId: playFabId,
                    Keys: ['IsKing']
                });
                isKing = resolveIsKingFlag(readOnlyData?.Data);
            } catch (rankError) {
                console.warn('[Inventory] resolve isKing failed:', rankError?.errorMessage || rankError?.message || rankError);
            }
            const currencyKeys = Object.keys(virtualCurrency || {});
            console.log('[Inventory] currency summary', {
                playFabId,
                currencyKeys,
                virtualCurrency
            });
            console.log('[Inventory] fetch complete');
            res.json({ inventory: inventoryList, virtualCurrency, experience, isKing });
        } catch (error) {
            console.error('[インベントリ取得] 取得失敗', error.errorMessage || error.message || error);
            res.status(500).json({ error: 'インベントリ取得に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // 装備設定
    app.post('/api/equip-item', async (req, res) => {
        let { playFabId, itemId, slot } = req.body;
        if (!playFabId || !slot) return res.status(400).json({ error: 'IDまたはスロット情報がありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

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
        let { playFabId } = req.body;
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;
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
        let { playFabId } = req.body;
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;
        console.log(`[ステータス取得] ${playFabId} のステータスを取得します...`);
        try {
            const stats = (await applyOfflineMpRecovery(playFabId)).currentStats;
            console.log('[ステータス取得] 完了');
            res.json({ stats: stats });
        } catch (error) {
            console.error('[ステータス取得] エラー', error.errorMessage);
            res.status(500).json({ error: 'ステータス取得に失敗しました。', details: error.errorMessage });
        }
    });

    app.post('/api/recover-hp-resource', async (req, res) => {
        let { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;
        try {
            const result = await applyResourceRecovery(playFabId, 'hp');
            if (!result.ok) {
                return res.status(result.status || 400).json({
                    error: result.error,
                    shortages: result.shortages || []
                });
            }
            res.json({
                status: 'success',
                message: `🍄でHPが${result.recovered}回復した。`,
                updatedStats: { [result.targetStat]: result.newValue },
                consumed: result.consumed
            });
        } catch (error) {
            console.error('[resource-recover-hp] エラー', error.errorMessage || error.message || error);
            res.status(500).json({ error: 'HP回復に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    app.post('/api/recover-mp-resource', async (req, res) => {
        let { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;
        try {
            const result = await applyResourceRecovery(playFabId, 'mp');
            if (!result.ok) {
                return res.status(result.status || 400).json({
                    error: result.error,
                    shortages: result.shortages || []
                });
            }
            res.json({
                status: 'success',
                message: `🫙でMPが${result.recovered}回復した。`,
                updatedStats: { [result.targetStat]: result.newValue },
                consumed: result.consumed
            });
        } catch (error) {
            console.error('[resource-recover-mp] エラー', error.errorMessage || error.message || error);
            res.status(500).json({ error: 'MP回復に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    app.post('/api/consume-voyage-mp', async (req, res) => {
        let { playFabId, durationMs } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

        const baseVoyageCost = calculateVoyageMpCost(durationMs);

        try {
            let shipClass = null;
            try {
                shipClass = await resolveActiveShipClass(playFabId, { promisifyPlayFab, PlayFabServer });
            } catch (shipError) {
                console.warn('[consume-voyage-mp] ship class resolve failed', shipError?.errorMessage || shipError?.message || shipError);
            }
            const voyageCost = applyVoyageMpClassAdjustment(baseVoyageCost, shipClass);
            const currentStats = (await applyOfflineMpRecovery(playFabId)).currentStats;

            const currentMp = Math.max(0, Number(currentStats.MP || 0));
            if (voyageCost <= 0) {
                return res.json({
                    status: 'ok',
                    baseVoyageCost,
                    voyageCost: 0,
                    shipClass,
                    updatedStats: { MP: currentMp },
                    message: '短い航海のためMP消費はありません。'
                });
            }

            if (currentMp < voyageCost) {
                return res.json({
                    status: 'blocked',
                    baseVoyageCost,
                    voyageCost,
                    shipClass,
                    currentMp,
                    requiredMp: voyageCost,
                    error: `長距離航海にはMPが${voyageCost}必要です。（現在 ${currentMp}）`
                });
            }

            const newMp = Math.max(0, currentMp - voyageCost);
            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: playFabId,
                Statistics: [{ StatisticName: 'MP', Value: newMp }]
            });

        res.json({
            status: 'ok',
            baseVoyageCost,
            voyageCost,
            shipClass,
            updatedStats: { MP: newMp },
            message: `長距離航海でMPを${voyageCost}消費した。`
        });
        } catch (error) {
            console.error('[consume-voyage-mp] エラー', error.errorMessage || error.message || error);
            res.status(500).json({ error: '航海MPの更新に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    app.post('/api/recover-docked-mp', async (req, res) => {
        let { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

        try {
            const currentStats = (await applyOfflineMpRecovery(playFabId)).currentStats;

            const currentMp = Math.max(0, Number(currentStats.MP || 0));
            const maxMp = Math.max(currentMp, Number(currentStats.MaxMP || currentMp || 0));
            if (currentMp >= maxMp) {
                return res.json({
                    status: 'full',
                    updatedStats: { MP: currentMp },
                    recovered: 0
                });
            }

            const internalResult = await promisifyPlayFab(PlayFabServer.GetUserInternalData, {
                PlayFabId: playFabId,
                Keys: [DOCKED_MP_RECOVERY_SETTINGS.internalKey]
            });
            const lastRecoverAt = Number(
                internalResult?.Data?.[DOCKED_MP_RECOVERY_SETTINGS.internalKey]?.Value || 0
            );
            const nowMs = Date.now();
            const remainingMs = lastRecoverAt > 0
                ? Math.max(0, DOCKED_MP_RECOVERY_SETTINGS.cooldownMs - (nowMs - lastRecoverAt))
                : 0;
            if (remainingMs > 0) {
                return res.json({
                    status: 'cooldown',
                    updatedStats: { MP: currentMp },
                    recovered: 0,
                    remainingMs
                });
            }

            const newMp = Math.min(maxMp, currentMp + DOCKED_MP_RECOVERY_SETTINGS.amount);
            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: playFabId,
                Statistics: [{ StatisticName: 'MP', Value: newMp }]
            });
            await promisifyPlayFab(PlayFabServer.UpdateUserInternalData, {
                PlayFabId: playFabId,
                Data: {
                    [DOCKED_MP_RECOVERY_SETTINGS.internalKey]: String(nowMs)
                }
            });

            return res.json({
                status: 'ok',
                updatedStats: { MP: newMp },
                recovered: newMp - currentMp,
                message: `停泊中にMPが${newMp - currentMp}回復した。`
            });
        } catch (error) {
            console.error('[recover-docked-mp] エラー', error.errorMessage || error.message || error);
            return res.status(500).json({ error: '停泊中のMP回復に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // アイテム使用
    app.post('/api/use-item', async (req, res) => {
        let { playFabId, itemInstanceId, itemId } = req.body;
        if (!playFabId || !itemInstanceId || !itemId) {
            return res.status(400).json({ error: 'IDまたはアイテム情報が不足しています。' });
        }
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

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
        let { playFabId, itemInstanceId, itemId } = req.body;
        if (!playFabId || !itemInstanceId || !itemId) {
            return res.status(400).json({ error: 'IDまたはアイテム情報が不足しています。' });
        }
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

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
        let { playFabId } = req.body;
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;
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
