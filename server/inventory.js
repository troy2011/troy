// server/inventory.js
// インベントリ・装備関連のAPI

const { randomUUID } = require('crypto');
const { getItemAmount, getCurrencyIdFromItem } = require('./economy');
const {
    applyDerivedPlayerLevelToStats,
    buildStatsMapFromStatistics,
    getPlayerContributionTotal
} = require('./playerLevel');
const resourceStorage = require('./resourceStorage');
const {
    TAROT_MAJOR_SLOT,
    TAROT_EQUIPMENT_SLOT_TO_KEY,
    TAROT_MANIFESTATION_SLOT_TO_KEY,
    TAROT_MANIFESTATION_SLOTS,
    isTarotEquipmentSlot,
    canEquipTarotItemToSlot,
    getStarterMajorArcanaItemId,
    getCanonicalManifestationSlot,
    isTarotManifestationSlot,
    buildTarotManifestationEntry,
    applyTarotManifestationNaming,
    parseStoredEquipmentValue,
    isTarotManifestationEntry,
    isTarotMinorCategory,
    isTarotMajorCategory
} = require('./tarotCards');
const {
    TROY_SKILLS_DATA_KEY,
    LEGACY_TROY_SKILLS_DATA_KEY,
    TAROT_AWAKENINGS_DATA_KEY,
    MINOR_SKILL_MAX_LEVEL,
    MAJOR_AWAKEN_MAX_LEVEL,
    parseJsonValue,
    getMinorSkillId,
    buildMinorSkillState,
    mapSkillsBySourceItem
} = require('./tarotSkills');
const {
    getMajorArcanaAwakeningState
} = require('./tarotAwakenings');

const GACHA_CATALOG_VERSION = process.env.GACHA_CATALOG_VERSION || 'main_catalog';
const GACHA_DROP_TABLE_ID = process.env.GACHA_DROP_TABLE_ID || 'gacha_table';
const GACHA_COST = Number(process.env.GACHA_COST || 10);
const VIRTUAL_CURRENCY_CODE = String(process.env.VIRTUAL_CURRENCY_CODE || 'PS').trim().toUpperCase();
const LEADERBOARD_NAME = process.env.LEADERBOARD_NAME || 'ps_ranking';
const TAROT_MANIFEST_PREVIEW_DATA_KEY = 'TarotManifestPreview';
const TAROT_MANIFEST_PREVIEW_TTL_MS = 10 * 60 * 1000;
const TAROT_MANIFEST_CUSTOM_NAME_MAX_LENGTH = 16;
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
const ITEM_SPRITE_PRESETS = Object.freeze([
    { idPrefixes: ['accessory_', 'offhand_'], path: './Sprites/items/icons.png', width: 16, height: 16, cols: 16, twoHanded: false },
    { idPrefixes: ['hat_black_'], path: './Sprites/wardrobe/cloth/hat_black.png', width: 32, height: 32, cols: 10, twoHanded: false },
    { idPrefixes: ['hat_straw_'], path: './Sprites/wardrobe/cloth/hat_straw.png', width: 32, height: 32, cols: 5, twoHanded: false },
    { idPrefixes: ['leather01_'], path: './Sprites/wardrobe/leather/leather01.png', width: 32, height: 32, cols: 10, twoHanded: false },
    { idPrefixes: ['leather02_'], path: './Sprites/wardrobe/leather/leather02.png', width: 32, height: 48, cols: 4, twoHanded: false },
    { idPrefixes: ['metal_black_'], path: './Sprites/wardrobe/metal/metal_black.png', width: 32, height: 48, cols: 10, twoHanded: false },
    { idPrefixes: ['metal_'], path: './Sprites/wardrobe/metal/metal.png', width: 32, height: 32, cols: 10, twoHanded: false },
    { idPrefixes: ['shield_'], path: './Sprites/weapons/melee weapons/shield.png', width: 32, height: 32, cols: 10, twoHanded: false },
    { idPrefixes: ['sword_big_'], path: './Sprites/weapons/melee weapons/sword_big.png', width: 32, height: 48, cols: 10, twoHanded: true },
    { idPrefixes: ['sword_'], path: './Sprites/weapons/melee weapons/sword.png', width: 32, height: 32, cols: 7, twoHanded: false },
    { idPrefixes: ['dagger_'], path: './Sprites/weapons/melee weapons/dagger.png', width: 32, height: 32, cols: 7, twoHanded: false },
    { idPrefixes: ['axe_big_'], path: './Sprites/weapons/melee weapons/axe_big.png', width: 32, height: 48, cols: 5, twoHanded: true },
    { idPrefixes: ['axe_'], path: './Sprites/weapons/melee weapons/axe.png', width: 32, height: 32, cols: 10, twoHanded: false },
    { idPrefixes: ['blunt_'], path: './Sprites/weapons/melee weapons/blunt.png', width: 32, height: 32, cols: 10, twoHanded: false },
    { idPrefixes: ['polearm_'], path: './Sprites/weapons/melee weapons/polearm.png', width: 32, height: 64, cols: 12, twoHanded: true },
    { idPrefixes: ['staff_'], path: './Sprites/weapons/magic weapons/staff.png', width: 32, height: 64, cols: 13, twoHanded: false, weaponType: 'staff' },
    { idPrefixes: ['wand_'], path: './Sprites/weapons/magic weapons/wand.png', width: 32, height: 32, cols: 6, twoHanded: false, weaponType: 'staff' },
    { idPrefixes: ['gun_big_'], path: './Sprites/weapons/ranged weapons/pistol_big.png', width: 64, height: 32, cols: 5, twoHanded: true },
    { idPrefixes: ['gun_'], path: './Sprites/weapons/ranged weapons/pistol.png', width: 32, height: 32, cols: 4, twoHanded: false }
]);

function resolveCatalogSpritePreset(itemId, itemData = {}) {
    const key = String(itemId || itemData?.ItemId || itemData?.FriendlyId || '').trim().toLowerCase();
    const spritePath = String(itemData?.sprite_path || itemData?.SpritePath || '').trim().toLowerCase();
    for (const preset of ITEM_SPRITE_PRESETS) {
        if (spritePath && spritePath === String(preset.path).toLowerCase()) return preset;
        if (preset.idPrefixes.some((prefix) => key.startsWith(prefix))) return preset;
    }
    return null;
}

function normalizeCatalogDisplayData(itemId, itemData = {}) {
    const normalized = { ...(itemData || {}) };
    const preset = resolveCatalogSpritePreset(itemId, normalized);
    if (!preset) return normalized;
    normalized.sprite_path = preset.path;
    normalized.sprite_w = preset.width;
    normalized.sprite_h = preset.height;
    normalized.sprite_cols = preset.cols;
    if (preset.weaponType && !normalized.WeaponType) {
        normalized.WeaponType = preset.weaponType;
    }
    return normalized;
}

function isTwoHandedCatalogWeapon(itemId, itemData = {}) {
    if (!itemData || String(itemData?.Category || '').trim() !== 'Weapon') return false;
    if (itemData?.TwoHanded === true || String(itemData?.TwoHanded || '').trim().toLowerCase() === 'true') {
        return true;
    }
    const preset = resolveCatalogSpritePreset(itemId, itemData);
    if (preset && typeof preset.twoHanded === 'boolean') {
        return preset.twoHanded;
    }
    return Number(itemData?.sprite_w || 0) > 32 || Number(itemData?.sprite_h || 0) > 32;
}

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

    async function getPlayerReadOnlyData(playFabId, keys) {
        return promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: Array.isArray(keys) ? keys : []
        });
    }

    async function getPlayerDisplayName(playFabId) {
        try {
            const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: playFabId,
                ProfileConstraints: { ShowDisplayName: true }
            });
            return String(profile?.PlayerProfile?.DisplayName || '').trim();
        } catch (error) {
            console.warn('[inventory] display name resolve failed:', error?.errorMessage || error?.message || error);
            return '';
        }
    }

    async function getPlayerNation(playFabId) {
        const readOnly = await getPlayerReadOnlyData(playFabId, ['Nation']);
        return String(readOnly?.Data?.Nation?.Value || '').trim().toLowerCase();
    }

    async function getPlayerTarotProgress(playFabId) {
        const readOnly = await getPlayerReadOnlyData(playFabId, [
            TROY_SKILLS_DATA_KEY,
            LEGACY_TROY_SKILLS_DATA_KEY,
            TAROT_AWAKENINGS_DATA_KEY
        ]);
        const skills = parseJsonValue(
            readOnly?.Data?.[TROY_SKILLS_DATA_KEY]?.Value
            || readOnly?.Data?.[LEGACY_TROY_SKILLS_DATA_KEY]?.Value,
            {}
        );
        const awakenings = parseJsonValue(readOnly?.Data?.[TAROT_AWAKENINGS_DATA_KEY]?.Value, {});
        return { skills, awakenings };
    }

    async function savePlayerTarotProgress(playFabId, { skills, awakenings }) {
        const updateData = {};
        if (skills) {
            updateData[TROY_SKILLS_DATA_KEY] = JSON.stringify(skills);
        }
        if (awakenings) {
            updateData[TAROT_AWAKENINGS_DATA_KEY] = JSON.stringify(awakenings);
        }
        if (!Object.keys(updateData).length) return;
        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: playFabId,
            Data: updateData,
            Permission: 'Public'
        });
    }

    function getInventoryItemTotal(items, itemId) {
        const targetId = String(itemId || '').trim();
        if (!targetId) return 0;
        return (items || []).reduce((total, item) => {
            const currentId = String(item?.Id || item?.ItemId || '').trim();
            if (currentId !== targetId) return total;
            return total + (getItemAmount(item) || 0);
        }, 0);
    }

    function sanitizeTarotManifestCustomName(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, TAROT_MANIFEST_CUSTOM_NAME_MAX_LENGTH);
    }

    async function saveTarotManifestPreviewState(playFabId, previewState = null) {
        await promisifyPlayFab(PlayFabServer.UpdateUserInternalData, {
            PlayFabId: playFabId,
            Data: {
                [TAROT_MANIFEST_PREVIEW_DATA_KEY]: previewState ? JSON.stringify(previewState) : ''
            }
        });
    }

    async function loadTarotManifestPreviewState(playFabId) {
        const result = await promisifyPlayFab(PlayFabServer.GetUserInternalData, {
            PlayFabId: playFabId,
            Keys: [TAROT_MANIFEST_PREVIEW_DATA_KEY]
        });
        return parseJsonValue(result?.Data?.[TAROT_MANIFEST_PREVIEW_DATA_KEY]?.Value, null);
    }

    async function buildTarotManifestPreview(playFabId, itemId, slot) {
        const normalizedSlot = getCanonicalManifestationSlot(slot);
        if (!isTarotManifestationSlot(normalizedSlot)) {
            return { ok: false, status: 400, error: '不正な具現化先です。' };
        }

        const minorCardData = normalizeCatalogDisplayData(itemId, catalogCache[itemId]);
        if (!minorCardData || !isTarotMinorCategory(minorCardData.Category)) {
            return { ok: false, status: 400, error: 'そのカードは具現化できません。' };
        }

        const majorItemId = await ensureStarterMajorArcanaEquipped(playFabId);
        if (!majorItemId) {
            return { ok: false, status: 400, error: '体の大アルカナが設定されていません。' };
        }
        const majorCardData = normalizeCatalogDisplayData(majorItemId, catalogCache[majorItemId]);
        if (!majorCardData) {
            return { ok: false, status: 400, error: '体の大アルカナ情報が見つかりません。' };
        }

        const entityKey = await getEntityKeyForPlayFabId(playFabId);
        const inventoryItems = await getAllInventoryItems(entityKey);
        if (getInventoryItemTotal(inventoryItems, itemId) <= 0) {
            return { ok: false, status: 400, error: '具現化に使うカードを所持していません。' };
        }

        const manifestedByName = await getPlayerDisplayName(playFabId);
        const previewManifestation = buildTarotManifestationEntry(
            normalizedSlot,
            { itemId: majorItemId, name: majorCardData.DisplayName || majorItemId, customData: majorCardData },
            { itemId, name: minorCardData.DisplayName || itemId, customData: minorCardData },
            {
                majorItemId,
                sourceCardId: itemId,
                sourceCardName: minorCardData.DisplayName || itemId,
                manifestedByPlayFabId: playFabId,
                manifestedByName,
                catalogCache
            }
        );
        return {
            ok: true,
            playFabId,
            slot: normalizedSlot,
            sourceCardId: itemId,
            sourceCardName: minorCardData.DisplayName || itemId,
            majorItemId,
            previewManifestation
        };
    }

    async function ensureStarterMajorArcanaOwned(playFabId, nation, inventoryItems = null, entityKey = null) {
        const starterMajorId = getStarterMajorArcanaItemId(String(nation || '').trim().toLowerCase());
        if (!starterMajorId) {
            return {
                starterMajorId: '',
                items: Array.isArray(inventoryItems) ? inventoryItems : []
            };
        }

        let items = Array.isArray(inventoryItems) ? inventoryItems : null;
        let resolvedEntityKey = entityKey;
        if (!items) {
            resolvedEntityKey = resolvedEntityKey || await getEntityKeyForPlayFabId(playFabId);
            items = await getAllInventoryItems(resolvedEntityKey);
        }
        if (getInventoryItemTotal(items, starterMajorId) > 0) {
            return { starterMajorId, items };
        }

        await addEconomyItem(playFabId, starterMajorId, 1, {
            // Keep the player's initial major arcana available as a switch target.
            idempotencyId: `starter-major-${playFabId}-${starterMajorId}`
        });
        resolvedEntityKey = resolvedEntityKey || await getEntityKeyForPlayFabId(playFabId);
        items = await getAllInventoryItems(resolvedEntityKey);
        return { starterMajorId, items };
    }

    async function ensureStarterMajorArcanaEquipped(playFabId) {
        const readOnly = await getPlayerReadOnlyData(playFabId, [TAROT_EQUIPMENT_SLOT_TO_KEY.MajorArcana, 'Nation']);
        const nation = String(readOnly?.Data?.Nation?.Value || '').trim().toLowerCase();
        await ensureStarterMajorArcanaOwned(playFabId, nation);
        const currentMajor = String(readOnly?.Data?.[TAROT_EQUIPMENT_SLOT_TO_KEY.MajorArcana]?.Value || '').trim();
        if (currentMajor) {
            return currentMajor;
        }
        const starterMajorId = getStarterMajorArcanaItemId(nation);
        if (!starterMajorId) return '';

        const entityKey = await getEntityKeyForPlayFabId(playFabId);
        await ensureStarterMajorArcanaOwned(playFabId, nation, await getAllInventoryItems(entityKey), entityKey);

        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: playFabId,
            Data: {
                [TAROT_EQUIPMENT_SLOT_TO_KEY.MajorArcana]: starterMajorId
            },
            Permission: 'Public'
        });
        return starterMajorId;
    }

    async function getPlayerStatsMap(playFabId) {
        const result = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, {
            PlayFabId: playFabId
        });
        const currentStats = buildStatsMapFromStatistics(result?.Statistics);
        return applyDerivedPlayerLevelToStats(currentStats).stats;
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
            await ensureStarterMajorArcanaEquipped(playFabId);
            const { currentStats } = await applyOfflineMpRecovery(playFabId);
            let experience = getPlayerContributionTotal(currentStats);
            if (typeof ensureDailyBountyConversion === 'function') {
                try {
                    await ensureDailyBountyConversion(playFabId);
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
                const catalogData = normalizeCatalogDisplayData(itemId, catalogCache[itemId] || {});
                const name = catalogData.DisplayName || catalogData.Title || itemId;
                const rawAmount = item?.Amount ?? item?.amount;
                const amount = rawAmount == null ? 1 : (Number(rawAmount) || 0);
                if (amount <= 0) return;
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
            const { skills: tarotSkills, awakenings: tarotAwakenings } = await getPlayerTarotProgress(playFabId);
            let isKing = false;
            let equippedMajorArcanaId = '';
            try {
                const readOnlyData = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                    PlayFabId: playFabId,
                    Keys: ['IsKing', TAROT_EQUIPMENT_SLOT_TO_KEY.MajorArcana]
                });
                isKing = resolveIsKingFlag(readOnlyData?.Data);
                equippedMajorArcanaId = String(readOnlyData?.Data?.[TAROT_EQUIPMENT_SLOT_TO_KEY.MajorArcana]?.Value || '').trim();
            } catch (rankError) {
                console.warn('[Inventory] resolve isKing failed:', rankError?.errorMessage || rankError?.message || rankError);
            }
            const activeTarotAwakening = equippedMajorArcanaId
                ? getMajorArcanaAwakeningState({
                    itemId: equippedMajorArcanaId,
                    name: catalogCache?.[equippedMajorArcanaId]?.DisplayName || equippedMajorArcanaId,
                    customData: catalogCache?.[equippedMajorArcanaId] || {}
                }, tarotAwakenings)
                : null;
            const currencyKeys = Object.keys(virtualCurrency || {});
            console.log('[Inventory] currency summary', {
                playFabId,
                currencyKeys,
                virtualCurrency
            });
            console.log('[Inventory] fetch complete');
            res.json({
                inventory: inventoryList,
                virtualCurrency,
                experience,
                contribution: experience,
                level: Number(currentStats?.Level || 1) || 1,
                isKing,
                tarotSkills,
                tarotSkillByCard: mapSkillsBySourceItem(tarotSkills),
                tarotAwakenings,
                activeTarotAwakening
            });
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

        const validSlots = {
            RightHand: 'Equipped_RightHand',
            LeftHand: 'Equipped_LeftHand',
            Armor: 'Equipped_Armor',
            Accessory: 'Equipped_Accessory',
            ...TAROT_EQUIPMENT_SLOT_TO_KEY
        };
        const dataKey = validSlots[slot];
        if (!dataKey) return res.status(400).json({ error: '不正なスロットです。' });

        const dataToUpdate = {};

        if (itemId) {
            const itemData = normalizeCatalogDisplayData(itemId, catalogCache[itemId]);
            const normalizedCategory = String(itemData?.Category || '').trim();
            const isTwoHandedWeapon = isTwoHandedCatalogWeapon(itemId, itemData);
            if (isTarotEquipmentSlot(slot)) {
                if (!itemData || !canEquipTarotItemToSlot(itemData, slot)) {
                    return res.status(400).json({ error: 'このカードはその枠に装備できません。' });
                }
                if (slot === TAROT_MAJOR_SLOT) {
                    const entityKey = await getEntityKeyForPlayFabId(playFabId);
                    const items = await getAllInventoryItems(entityKey);
                    if (getInventoryItemTotal(items, itemId) <= 0) {
                        return res.status(400).json({ error: 'その大アルカナを所持していません。' });
                    }
                }
            } else if (slot === 'RightHand') {
                if (normalizedCategory !== 'Weapon') {
                    return res.status(400).json({ error: 'この装備は右手に装備できません。' });
                }
            } else if (slot === 'LeftHand') {
                if (!['Weapon', 'Shield', 'Offhand'].includes(normalizedCategory)) {
                    return res.status(400).json({ error: 'この装備は左手に装備できません。' });
                }
                if (isTwoHandedWeapon) {
                    return res.status(400).json({ error: '両手武器は左手に装備できません。' });
                }
            } else if (slot === 'Armor') {
                if (normalizedCategory !== 'Armor') {
                    return res.status(400).json({ error: 'この装備は防具枠に装備できません。' });
                }
            } else if (slot === 'Accessory') {
                if (normalizedCategory !== 'Accessory') {
                    return res.status(400).json({ error: 'この装備はアクセサリー枠に装備できません。' });
                }
            }
            dataToUpdate[dataKey] = itemId;
            if (itemData && isTwoHandedWeapon) {
                console.log(`[装備] 両手武器 (${itemId}) を装備します`);
                dataToUpdate['Equipped_RightHand'] = itemId;
                dataToUpdate['Equipped_LeftHand'] = null;
            }
        } else {
            if (slot === TAROT_MAJOR_SLOT) {
                return res.status(400).json({ error: '体の大アルカナは外せません。' });
            }
            const currentEquipmentResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, { PlayFabId: playFabId, Keys: ["Equipped_RightHand"] });
            const currentRightHandId = currentEquipmentResult.Data && currentEquipmentResult.Data.Equipped_RightHand ? currentEquipmentResult.Data.Equipped_RightHand.Value : null;
            const itemData = currentRightHandId ? normalizeCatalogDisplayData(currentRightHandId, catalogCache[currentRightHandId]) : null;

            if (slot === 'RightHand' && isTwoHandedCatalogWeapon(currentRightHandId, itemData)) {
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
            await ensureStarterMajorArcanaEquipped(playFabId);
            const equipmentKeys = [
                'Equipped_RightHand',
                'Equipped_LeftHand',
                'Equipped_Armor',
                'Equipped_Accessory',
                TAROT_EQUIPMENT_SLOT_TO_KEY.MajorArcana
            ];
            const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId, Keys: equipmentKeys
            });
            const equipment = {};
            const assignEquipmentValue = (slotName, rawValue) => {
                const parsed = parseStoredEquipmentValue(rawValue);
                if (parsed === null || parsed === undefined || parsed === '') return;
                equipment[slotName] = parsed;
            };
            assignEquipmentValue('RightHand', result?.Data?.Equipped_RightHand?.Value || null);
            assignEquipmentValue('LeftHand', result?.Data?.Equipped_LeftHand?.Value || null);
            assignEquipmentValue('Armor', result?.Data?.Equipped_Armor?.Value || null);
            assignEquipmentValue('Accessory', result?.Data?.Equipped_Accessory?.Value || null);
            assignEquipmentValue(TAROT_MAJOR_SLOT, result?.Data?.[TAROT_EQUIPMENT_SLOT_TO_KEY.MajorArcana]?.Value || null);
            console.log('[装備取得] 完了', equipment);
            res.json({ equipment: equipment });
        } catch (error) {
            console.error('[装備取得] エラー', error.errorMessage);
            res.status(500).json({ error: '装備の取得に失敗しました。', details: error.errorMessage });
        }
    });

    app.post('/api/preview-tarot-manifestation', async (req, res) => {
        let { playFabId, itemId, slot } = req.body || {};
        if (!playFabId || !itemId || !slot) {
            return res.status(400).json({ error: 'IDまたは具現化先の情報がありません。' });
        }
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

        try {
            const previewResult = await buildTarotManifestPreview(playFabId, itemId, slot);
            if (!previewResult?.ok) {
                return res.status(previewResult?.status || 400).json({ error: previewResult?.error || '具現化プレビューを生成できません。' });
            }

            const nowMs = Date.now();
            const previewState = {
                token: randomUUID(),
                createdAtMs: nowMs,
                expiresAtMs: nowMs + TAROT_MANIFEST_PREVIEW_TTL_MS,
                slot: previewResult.slot,
                sourceCardId: previewResult.sourceCardId,
                sourceCardName: previewResult.sourceCardName,
                majorItemId: previewResult.majorItemId,
                manifestation: previewResult.previewManifestation
            };
            await saveTarotManifestPreviewState(playFabId, previewState);

            return res.json({
                success: true,
                previewToken: previewState.token,
                expiresAtMs: previewState.expiresAtMs,
                preview: {
                    manifestation: previewState.manifestation,
                    suggestedName: String(
                        previewState.manifestation?.manifestedItemName
                        || previewState.manifestation?.name
                        || ''
                    ).trim(),
                    customNameMaxLength: TAROT_MANIFEST_CUSTOM_NAME_MAX_LENGTH
                }
            });
        } catch (error) {
            console.error('[preview-tarot-manifestation] Error:', error?.errorMessage || error?.message || error);
            return res.status(500).json({
                error: '具現化プレビューの生成に失敗しました。',
                details: error?.errorMessage || error?.message || String(error)
            });
        }
    });

    app.post('/api/manifest-tarot-card', async (req, res) => {
        let { playFabId, itemId, slot, previewToken, customName, useCustomName } = req.body || {};
        if (!playFabId) {
            return res.status(400).json({ error: 'IDまたは具現化先の情報がありません。' });
        }
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

        try {
            let normalizedSlot = getCanonicalManifestationSlot(slot);
            let sourceCardId = String(itemId || '').trim();
            let manifestation = null;
            const hasPreviewToken = !!String(previewToken || '').trim();
            const wantsCustomName = useCustomName === true || String(useCustomName || '').trim().toLowerCase() === 'true';
            const sanitizedCustomName = sanitizeTarotManifestCustomName(customName);

            if (wantsCustomName && !sanitizedCustomName) {
                return res.status(400).json({ error: '命名する場合は名前を入力してください。' });
            }

            if (hasPreviewToken) {
                const previewState = await loadTarotManifestPreviewState(playFabId);
                if (!previewState || String(previewState?.token || '').trim() !== String(previewToken).trim()) {
                    return res.status(409).json({ error: '具現化プレビューの有効期限が切れました。' });
                }
                if (Date.now() > Math.max(0, Number(previewState?.expiresAtMs) || 0)) {
                    try {
                        await saveTarotManifestPreviewState(playFabId, null);
                    } catch (clearError) {
                        console.warn('[manifest-tarot-card] Expired preview clear failed:', clearError?.errorMessage || clearError?.message || clearError);
                    }
                    return res.status(409).json({ error: '具現化プレビューの有効期限が切れました。' });
                }

                normalizedSlot = getCanonicalManifestationSlot(previewState.slot);
                sourceCardId = String(previewState.sourceCardId || '').trim();
                manifestation = applyTarotManifestationNaming(previewState.manifestation, {
                    customName: wantsCustomName ? sanitizedCustomName : ''
                });
            } else {
                if (!sourceCardId || !normalizedSlot) {
                    return res.status(400).json({ error: 'IDまたは具現化先の情報がありません。' });
                }
                const previewResult = await buildTarotManifestPreview(playFabId, sourceCardId, normalizedSlot);
                if (!previewResult?.ok) {
                    return res.status(previewResult?.status || 400).json({ error: previewResult?.error || 'カードの具現化に失敗しました。' });
                }
                normalizedSlot = previewResult.slot;
                manifestation = applyTarotManifestationNaming(previewResult.previewManifestation, { customName: '' });
            }

            if (!isTarotManifestationSlot(normalizedSlot) || !sourceCardId || !manifestation) {
                return res.status(400).json({ error: 'カードの具現化情報が不正です。' });
            }

            const entityKey = await getEntityKeyForPlayFabId(playFabId);
            const inventoryItems = await getAllInventoryItems(entityKey);
            if (getInventoryItemTotal(inventoryItems, sourceCardId) <= 0) {
                return res.status(400).json({ error: '具現化に使うカードを所持していません。' });
            }

            const manifestationKey = TAROT_MANIFESTATION_SLOT_TO_KEY[normalizedSlot];
            const nowStamp = Date.now();

            await subtractEconomyItem(playFabId, sourceCardId, 1, {
                idempotencyId: `manifest-tarot-${playFabId}-${normalizedSlot}-${sourceCardId}-${nowStamp}`
            });
            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: playFabId,
                Data: {
                    [manifestationKey]: JSON.stringify(manifestation)
                },
                Permission: 'Public'
            });
            if (hasPreviewToken) {
                try {
                    await saveTarotManifestPreviewState(playFabId, null);
                } catch (clearError) {
                    console.warn('[manifest-tarot-card] Preview clear failed:', clearError?.errorMessage || clearError?.message || clearError);
                }
            }

            return res.json({
                success: true,
                slot: normalizedSlot,
                manifestation
            });
        } catch (error) {
            console.error('[manifest-tarot-card] Error:', error?.errorMessage || error?.message || error);
            return res.status(500).json({
                error: 'カードの具現化に失敗しました。',
                details: error?.errorMessage || error?.message || String(error)
            });
        }
    });

    app.post('/api/study-tarot-card', async (req, res) => {
        let { playFabId, itemId } = req.body || {};
        if (!playFabId || !itemId) {
            return res.status(400).json({ error: '習得に使うカード情報がありません。' });
        }
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

        try {
            const minorCardData = catalogCache[itemId];
            if (!minorCardData || !isTarotMinorCategory(minorCardData.Category)) {
                return res.status(400).json({ error: 'そのカードでは術を習得できません。' });
            }

            const entityKey = await getEntityKeyForPlayFabId(playFabId);
            const inventoryItems = await getAllInventoryItems(entityKey);
            if (getInventoryItemTotal(inventoryItems, itemId) <= 0) {
                return res.status(400).json({ error: '習得に使うカードを所持していません。' });
            }

            const { skills, awakenings } = await getPlayerTarotProgress(playFabId);
            const skillId = getMinorSkillId(itemId, minorCardData);
            const currentSkill = skills?.[skillId] || null;
            const nextLevel = (Number(currentSkill?.level || 0) || 0) + 1;
            if (nextLevel > MINOR_SKILL_MAX_LEVEL) {
                return res.status(400).json({ error: 'この術はすでに最大まで修めています。' });
            }

            const updatedSkill = buildMinorSkillState(itemId, {
                ...minorCardData,
                DisplayName: minorCardData.DisplayName || itemId
            }, nextLevel, currentSkill);
            updatedSkill.learnedAt = currentSkill?.learnedAt || new Date().toISOString();
            updatedSkill.copiesSpent = (Number(currentSkill?.copiesSpent || 0) || 0) + 1;

            const updatedSkills = {
                ...(skills || {}),
                [skillId]: updatedSkill
            };
            const nowStamp = Date.now();
            await subtractEconomyItem(playFabId, itemId, 1, {
                idempotencyId: `study-tarot-${playFabId}-${itemId}-${nowStamp}`
            });
            await savePlayerTarotProgress(playFabId, {
                skills: updatedSkills,
                awakenings
            });

            return res.json({
                success: true,
                action: currentSkill ? 'upgraded' : 'learned',
                skill: updatedSkill,
                tarotSkills: updatedSkills,
                tarotSkillByCard: mapSkillsBySourceItem(updatedSkills),
                message: currentSkill
                    ? `${updatedSkill.name} が Lv${updatedSkill.level} になった。`
                    : `${updatedSkill.name} を習得した。`
            });
        } catch (error) {
            console.error('[study-tarot-card] Error:', error?.errorMessage || error?.message || error);
            return res.status(500).json({
                error: 'タロットカードからの習得に失敗しました。',
                details: error?.errorMessage || error?.message || String(error)
            });
        }
    });

    app.post('/api/awaken-major-arcana', async (req, res) => {
        let { playFabId, itemId } = req.body || {};
        if (!playFabId || !itemId) {
            return res.status(400).json({ error: '覚醒に使う大アルカナ情報がありません。' });
        }
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

        try {
            const majorCardData = catalogCache[itemId];
            if (!majorCardData || !isTarotMajorCategory(majorCardData.Category)) {
                return res.status(400).json({ error: 'そのカードは大アルカナではありません。' });
            }

            await ensureStarterMajorArcanaEquipped(playFabId);
            const entityKey = await getEntityKeyForPlayFabId(playFabId);
            const inventoryItems = await getAllInventoryItems(entityKey);
            const totalCopies = getInventoryItemTotal(inventoryItems, itemId);
            const requiredCopies = 2;
            if (totalCopies < requiredCopies) {
                return res.status(400).json({
                    error: '覚醒するには予備の大アルカナが1枚必要です。最後の1枚は残してください。'
                });
            }

            const { skills, awakenings } = await getPlayerTarotProgress(playFabId);
            const currentLevel = Number(awakenings?.[itemId] || 0) || 0;
            if (currentLevel >= MAJOR_AWAKEN_MAX_LEVEL) {
                return res.status(400).json({ error: 'この大アルカナはすでに最大まで覚醒しています。' });
            }

            const updatedAwakenings = {
                ...(awakenings || {}),
                [itemId]: currentLevel + 1
            };
            const nowStamp = Date.now();
            await subtractEconomyItem(playFabId, itemId, 1, {
                idempotencyId: `awaken-arcana-${playFabId}-${itemId}-${nowStamp}`
            });
            await savePlayerTarotProgress(playFabId, {
                skills,
                awakenings: updatedAwakenings
            });

            return res.json({
                success: true,
                itemId,
                awakeningLevel: updatedAwakenings[itemId],
                maxLevel: MAJOR_AWAKEN_MAX_LEVEL,
                tarotAwakenings: updatedAwakenings,
                message: `${majorCardData.DisplayName || itemId} の覚醒が Lv${updatedAwakenings[itemId]} になった。`
            });
        } catch (error) {
            console.error('[awaken-major-arcana] Error:', error?.errorMessage || error?.message || error);
            return res.status(500).json({
                error: '大アルカナの覚醒に失敗しました。',
                details: error?.errorMessage || error?.message || String(error)
            });
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
            const stats = applyDerivedPlayerLevelToStats((await applyOfflineMpRecovery(playFabId)).currentStats).stats;
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
