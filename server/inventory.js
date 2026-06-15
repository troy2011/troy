// server/inventory.js
// インベントリ・装備関連のAPI

const { getItemAmount, getCurrencyIdFromItem } = require('./economy');
const { withTitleEntityToken } = require('./playfab');
const { drawLocalGachaItem } = require('./gacha');
const resourceStorage = require('./resourceStorage');
const { getAvatarColorForNation, getNationTreasuryRanking } = require('./nation');
const {
    CREW_ROLE_BY_ID,
    normalizeCrewRoleId,
    getCrewRankTitle
} = require('./crewRoles');
const {
    applyDerivedPlayerLevelToStats,
    buildStatsMapFromStatistics,
    getPlayerContributionTotal,
    calculateLevelFromContribution,
    PIRATE_KING_LEVEL,
    syncPirateKingNationStatus
} = require('./playerLevel');
const {
    calculateStatAllocationState,
    normalizeStatAllocationDeltas,
    getStatAllocationDeltaTotal,
    applyStatAllocationDeltas
} = require('./statAllocation');
const {
    TAROT_MAJOR_SLOT,
    TAROT_EQUIPMENT_SLOT_TO_KEY,
    isTarotEquipmentSlot,
    canEquipTarotItemToSlot,
    getStarterMajorArcanaItemId,
    getTarotSlotLabel,
    parseStoredEquipmentValue,
    isTarotMajorCategory
} = require('./tarotCards');
const {
    TAROT_AWAKENINGS_DATA_KEY,
    MAJOR_AWAKEN_MAX_LEVEL,
    parseJsonValue
} = require('./tarotSkills');
const { FEATURE_UNLOCK_LEVELS, isFeatureUnlocked } = require('./featureUnlocks');
const GACHA_CATALOG_VERSION = process.env.GACHA_CATALOG_VERSION || 'main_catalog';
const GACHA_COST = Number(process.env.GACHA_COST || 10);
const VIRTUAL_CURRENCY_CODE = String(process.env.VIRTUAL_CURRENCY_CODE || 'PS').trim().toUpperCase();
const LEADERBOARD_NAME = process.env.LEADERBOARD_NAME || 'ps_ranking';
const DAILY_NATION_SPECIALTY_REWARD_KEY = 'DailyNationSpecialtyRewardDay';
const FACIAL_HAIR_STYLE_INDEX_DEFAULT = 1;
const FACIAL_HAIR_STYLE_INDEX_NONE = 0;
const NATION_SPECIALTY_RESOURCE_BY_NATION = {
    fire: { itemId: 'RR', label: '火薬系の特産品' },
    earth: { itemId: 'RG', label: '石材系の特産品' },
    wind: { itemId: 'RY', label: 'キノコ系の特産品' },
    water: { itemId: 'RB', label: '水系の特産品' }
};
const DAILY_NATION_SPECIALTY_AMOUNT_BY_RANK = [4, 3, 2, 1];
const AVATAR_CUSTOMIZE_LIMITS = {
    SkinColorIndex: { min: 1, max: 8, feature: 'skinChange', label: '美容', cost: 300 },
    FaceIndex: { min: 1, max: 40, feature: 'faceChange', label: '整形', cost: 800 },
    HairStyleIndex: { min: 1, max: 30, feature: 'haircut', label: '散髪', cost: 100 },
    FacialHairStyleIndex: { min: 1, max: 30, feature: 'facialHairChange', label: 'フェイシャルエステ', cost: 1000, defaultValue: FACIAL_HAIR_STYLE_INDEX_DEFAULT }
};
const AVATAR_CUSTOMIZE_ACTIONS = {
    skin: 'SkinColorIndex',
    skinChange: 'SkinColorIndex',
    beauty: 'SkinColorIndex',
    face: 'FaceIndex',
    faceChange: 'FaceIndex',
    surgery: 'FaceIndex',
    hair: 'HairStyleIndex',
    haircut: 'HairStyleIndex',
    facialHair: 'FacialHairStyleIndex',
    facialHairChange: 'FacialHairStyleIndex',
    facialEsthe: 'FacialHairStyleIndex'
};
const AVATAR_CUSTOMIZE_ACTION_OVERRIDES = {
    facialHairRemove: {
        styleKey: 'FacialHairStyleIndex',
        feature: 'facialHairRemove',
        label: 'ひげ脱毛',
        cost: 1000,
        mode: 'clear',
        clearValue: FACIAL_HAIR_STYLE_INDEX_NONE,
        defaultValue: FACIAL_HAIR_STYLE_INDEX_DEFAULT
    },
    beardRemoval: {
        styleKey: 'FacialHairStyleIndex',
        feature: 'facialHairRemove',
        label: 'ひげ脱毛',
        cost: 1000,
        mode: 'clear',
        clearValue: FACIAL_HAIR_STYLE_INDEX_NONE,
        defaultValue: FACIAL_HAIR_STYLE_INDEX_DEFAULT
    }
};
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

const AVATAR_RANDOM_DEFAULT_STYLE_KEYS = [
    'HairStyleIndex',
    'FacialHairStyleIndex'
];
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

function getJapanDayKey(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(date);
}

function resolveIsKingFlag(readOnlyData) {
    if (!readOnlyData || typeof readOnlyData !== 'object') return false;
    return parseBooleanFlag(readOnlyData?.IsKing?.Value);
}

function resolveAvatarCustomizeAction(requestedAction) {
    const override = AVATAR_CUSTOMIZE_ACTION_OVERRIDES[requestedAction];
    if (override) {
        const baseConfig = AVATAR_CUSTOMIZE_LIMITS[override.styleKey] || {};
        return { ...baseConfig, ...override };
    }
    const styleKey = AVATAR_CUSTOMIZE_ACTIONS[requestedAction];
    if (!styleKey) return null;
    const config = AVATAR_CUSTOMIZE_LIMITS[styleKey];
    if (!config) return null;
    return { styleKey, ...config };
}

function isReadOnlyAvatarStyleUnset(readOnlyData, styleKey) {
    const value = readOnlyData?.[styleKey]?.Value;
    return value === undefined || value === null || String(value).trim() === '';
}

function pickInitialAvatarStyleValue(styleKey) {
    const config = AVATAR_CUSTOMIZE_LIMITS[styleKey];
    if (!config) return null;
    const min = Math.max(0, Math.floor(Number(config.min) || 0));
    const max = Math.max(min, Math.floor(Number(config.max) || min));
    return min + Math.floor(Math.random() * ((max - min) + 1));
}

function parseAvatarStyleReadOnlyValue(readOnlyData, styleKey) {
    const config = AVATAR_CUSTOMIZE_LIMITS[styleKey] || {};
    const value = readOnlyData?.[styleKey]?.Value;
    if (value === undefined || value === null || String(value).trim() === '') {
        return config.defaultValue ?? config.min ?? 1;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return config.defaultValue ?? config.min ?? 1;
    if (styleKey === 'FacialHairStyleIndex') {
        return Math.max(FACIAL_HAIR_STYLE_INDEX_NONE, Math.floor(parsed));
    }
    return Math.max(config.min ?? 1, Math.floor(parsed));
}

// APIルートを初期化
function initializeInventoryRoutes(app, deps) {
    const { promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabGroups, PlayFabData, PlayFabEconomy, firestore, admin, catalogCache, getEntityKeyForPlayFabId, getAllInventoryItems, getVirtualCurrencyMap, addEconomyItem, subtractEconomyItem, getCurrencyBalance, requireAuthenticatedPlayFabId } = deps;

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

    function normalizePlayFabId(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        return raw.replace(/^playfab:/i, '').trim().toUpperCase();
    }

    function isSystemNationGroupName(value) {
        return /^nation_(fire|water|wind|earth)_island$/i.test(String(value || '').trim());
    }

    function isSystemNationGroupEntry(groupEntry, guildData = null) {
        return [
            groupEntry?.GroupName,
            groupEntry?.Group?.Name,
            guildData?.groupName,
            guildData?.name
        ].some(isSystemNationGroupName);
    }

    function parseGuildDataObject(rawData) {
        if (!rawData) return {};
        if (typeof rawData === 'string') return JSON.parse(rawData);
        if (typeof rawData === 'object') return rawData;
        return {};
    }

    async function getPlayerCrewRankInfo(playFabId, stats = {}) {
        if (!PlayFabGroups || !PlayFabData || !playFabId) return null;
        try {
            const entityKey = await getEntityKeyForPlayFabId(playFabId);
            const membershipResult = await withTitleEntityToken(() => promisifyPlayFab(PlayFabGroups.ListMembership, {
                Entity: entityKey
            }));
            const groups = Array.isArray(membershipResult?.Groups) ? membershipResult.Groups : [];
            if (!groups.length) return null;

            for (const group of groups) {
                const guildId = group?.Group?.Id;
                if (!guildId || isSystemNationGroupEntry(group)) continue;

                const guildDataResult = await withTitleEntityToken(() => promisifyPlayFab(PlayFabData.GetObjects, {
                    Entity: { Id: guildId, Type: 'group' },
                    EscapeObject: false
                }));
                const rawData = guildDataResult?.Objects?.GuildData?.DataObject;
                const guildData = parseGuildDataObject(rawData);
                if (isSystemNationGroupEntry(group, guildData)) continue;

                const ownerId = normalizePlayFabId(guildData?.ownerPlayFabId || guildData?.captainPlayFabId);
                if (!ownerId) continue;

                const roleAssignments = guildData?.crewRoles && typeof guildData.crewRoles === 'object' ? guildData.crewRoles : {};
                const roleId = normalizeCrewRoleId(roleAssignments[normalizePlayFabId(playFabId)]);
                const role = CREW_ROLE_BY_ID[roleId] || null;
                if (!role) continue;

                const level = Math.max(1, Math.floor(Number(stats.Level || 1) || 1));
                return {
                    guildId,
                    guildName: String(group?.GroupName || '').trim(),
                    crewRoleId: roleId,
                    crewRoleLabel: role.label,
                    crewRankTitle: getCrewRankTitle(roleId, level)
                };
            }
            return null;
        } catch (error) {
            console.warn('[inventory] crew rank info resolve failed:', error?.errorMessage || error?.message || error);
            return null;
        }
    }

    async function getPlayerNation(playFabId) {
        const readOnly = await getPlayerReadOnlyData(playFabId, ['Nation']);
        return String(readOnly?.Data?.Nation?.Value || '').trim().toLowerCase();
    }

    async function claimDailyNationSpecialtyReward(playFabId) {
        const dayKey = getJapanDayKey();
        const readOnly = await getPlayerReadOnlyData(playFabId, ['Nation', DAILY_NATION_SPECIALTY_REWARD_KEY]);
        const nation = String(readOnly?.Data?.Nation?.Value || '').trim().toLowerCase();
        const specialty = NATION_SPECIALTY_RESOURCE_BY_NATION[nation];
        if (!specialty) return null;
        if (String(readOnly?.Data?.[DAILY_NATION_SPECIALTY_REWARD_KEY]?.Value || '') === dayKey) {
            return null;
        }

        let rank = 4;
        try {
            if (firestore && PlayFabAdmin && PlayFabGroups && getAllInventoryItems && getVirtualCurrencyMap) {
                const ranking = await getNationTreasuryRanking(firestore, {
                    promisifyPlayFab,
                    PlayFabServer,
                    PlayFabAdmin,
                    PlayFabGroups,
                    admin,
                    getAllInventoryItems,
                    getVirtualCurrencyMap
                });
                const rankIndex = Array.isArray(ranking)
                    ? ranking.findIndex((row) => String(row?.nation || '').toLowerCase() === nation)
                    : -1;
                if (rankIndex >= 0) rank = rankIndex + 1;
            }
        } catch (rankError) {
            console.warn('[daily-nation-specialty] Ranking fallback:', rankError?.message || rankError);
        }

        const amount = DAILY_NATION_SPECIALTY_AMOUNT_BY_RANK[Math.min(Math.max(rank, 1), DAILY_NATION_SPECIALTY_AMOUNT_BY_RANK.length) - 1] || 1;
        await addEconomyItem(playFabId, specialty.itemId, amount, {
            idempotencyId: `daily-nation-specialty:${playFabId}:${dayKey}:${specialty.itemId}`
        });
        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: playFabId,
            Data: {
                [DAILY_NATION_SPECIALTY_REWARD_KEY]: dayKey
            }
        });

        return {
            dayKey,
            nation,
            rank,
            itemId: specialty.itemId,
            label: specialty.label,
            amount
        };
    }

    function buildAvatarBaseFromReadOnly(readOnlyData = {}, stats = {}) {
        const level = Math.max(1, Number(stats?.Level || stats?.level || 1) || 1);
        const isPirateKing = level >= 41 && !resolveIsKingFlag(readOnlyData);
        const nation = isPirateKing ? 'neutral' : String(readOnlyData?.Nation?.Value || '').trim().toLowerCase();
        const avatarColor = getAvatarColorForNation(nation)
            || String(readOnlyData?.AvatarColor?.Value || '').trim()
            || 'brown';
        return {
            Race: String(readOnlyData?.Race?.Value || 'human').trim() || 'human',
            Nation: nation || null,
            AvatarColor: avatarColor,
            SkinColorIndex: Math.max(1, Number(readOnlyData?.SkinColorIndex?.Value || 1) || 1),
            FaceIndex: Math.max(1, Number(readOnlyData?.FaceIndex?.Value || 1) || 1),
            HairStyleIndex: parseAvatarStyleReadOnlyValue(readOnlyData, 'HairStyleIndex'),
            HairColorIndex: Math.max(1, Number(readOnlyData?.HairColorIndex?.Value || 1) || 1),
            FacialHairStyleIndex: parseAvatarStyleReadOnlyValue(readOnlyData, 'FacialHairStyleIndex'),
            level
        };
    }

    function buildPublicEquipmentItem(itemRef) {
        if (!itemRef) return null;
        if (typeof itemRef === 'object' && itemRef.customData) return itemRef;
        const itemId = String(itemRef || '').trim();
        if (!itemId) return null;
        const catalogData = normalizeCatalogDisplayData(itemId, catalogCache[itemId] || {});
        return {
            itemId,
            name: catalogData.DisplayName || itemId,
            description: catalogData.Description || '',
            customData: catalogData
        };
    }

    function getPublicEquipmentDisplayName(itemRef) {
        if (itemRef && typeof itemRef === 'object') {
            return String(
                itemRef.name
                || itemRef.customData?.DisplayName
                || ''
            ).trim() || '装備中';
        }
        const item = buildPublicEquipmentItem(itemRef);
        return item?.name || '未装備';
    }

    function buildPublicItemSource(equipment = {}) {
        const itemSource = {};
        ['RightHand', 'LeftHand', 'Armor', 'Accessory'].forEach((slot) => {
            const itemRef = equipment?.[slot];
            if (!itemRef || typeof itemRef !== 'string') return;
            const item = buildPublicEquipmentItem(itemRef);
            if (!item) return;
            itemSource[itemRef] = item;
        });
        return itemSource;
    }

    function buildPublicEquipmentList(equipment = {}) {
        return [
            { slot: 'Armor', label: getTarotSlotLabel('Armor'), name: getPublicEquipmentDisplayName(equipment.Armor) },
            { slot: 'RightHand', label: getTarotSlotLabel('RightHand'), name: getPublicEquipmentDisplayName(equipment.RightHand) },
            { slot: 'LeftHand', label: getTarotSlotLabel('LeftHand'), name: getPublicEquipmentDisplayName(equipment.LeftHand) },
            { slot: 'Accessory', label: getTarotSlotLabel('Accessory'), name: getPublicEquipmentDisplayName(equipment.Accessory) }
        ];
    }

    async function getPlayerTarotProgress(playFabId) {
        const readOnly = await getPlayerReadOnlyData(playFabId, [
            TAROT_AWAKENINGS_DATA_KEY
        ]);
        const awakenings = parseJsonValue(readOnly?.Data?.[TAROT_AWAKENINGS_DATA_KEY]?.Value, {});
        return { awakenings };
    }

    async function savePlayerTarotProgress(playFabId, { awakenings }) {
        const updateData = {};
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
        const readOnly = await getPlayerReadOnlyData(playFabId, ['Nation']);
        const nation = String(readOnly?.Data?.Nation?.Value || '').trim().toLowerCase();
        await ensureStarterMajorArcanaOwned(playFabId, nation);
        const starterMajorId = getStarterMajorArcanaItemId(nation);
        if (!starterMajorId) return '';
        return starterMajorId;
    }

    async function getPlayerStatsMap(playFabId) {
        const result = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, {
            PlayFabId: playFabId
        });
        const currentStats = buildStatsMapFromStatistics(result?.Statistics);
        return applyDerivedPlayerLevelToStats(currentStats).stats;
    }

    function pickRandomAvatarStyleValue(currentValue, config) {
        const candidates = [];
        const parsedCurrent = Math.floor(Number(currentValue));
        const current = Number.isFinite(parsedCurrent) && parsedCurrent >= config.min && parsedCurrent <= config.max
            ? parsedCurrent
            : null;
        for (let value = config.min; value <= config.max; value += 1) {
            if (value !== current) candidates.push(value);
        }
        if (!candidates.length) return current ?? config.min;
        return candidates[Math.floor(Math.random() * candidates.length)];
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
            const { currentStats } = await applyOfflineMpRecovery(playFabId);
            let experience = getPlayerContributionTotal(currentStats);
            const contributionProgress = calculateLevelFromContribution(experience);
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
            const { awakenings: tarotAwakenings } = await getPlayerTarotProgress(playFabId);
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
            res.json({
                inventory: inventoryList,
                virtualCurrency,
                experience,
                contribution: experience,
                level: contributionProgress.level,
                contributionProgress,
                isKing,
                tarotSkills: {},
                tarotSkillByCard: {},
                tarotAwakenings,
                activeTarotAwakening: null
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
        if (!dataKey) {
            if (slot === TAROT_MAJOR_SLOT) {
                return res.status(400).json({ error: '大アルカナの体装備は廃止されました。デッキに追加してください。' });
            }
            return res.status(400).json({ error: '不正なスロットです。' });
        }

        const dataToUpdate = {};

        if (itemId) {
            const itemData = normalizeCatalogDisplayData(itemId, catalogCache[itemId]);
            const normalizedCategory = String(itemData?.Category || '').trim();
            const isTwoHandedWeapon = isTwoHandedCatalogWeapon(itemId, itemData);
            if (isTarotEquipmentSlot(slot)) {
                if (!itemData || !canEquipTarotItemToSlot(itemData, slot)) {
                    return res.status(400).json({ error: 'このカードはその枠に装備できません。' });
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
            const equipmentKeys = [
                'Equipped_RightHand',
                'Equipped_LeftHand',
                'Equipped_Armor',
                'Equipped_Accessory'
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
            console.log('[装備取得] 完了', equipment);
            res.json({ equipment: equipment });
        } catch (error) {
            console.error('[装備取得] エラー', error.errorMessage);
            res.status(500).json({ error: '装備の取得に失敗しました。', details: error.errorMessage });
        }
    });

    app.post('/api/get-player-public-profile', async (req, res) => {
        let { playFabId, targetPlayFabId } = req.body || {};
        if (!playFabId || !targetPlayFabId) {
            return res.status(400).json({ error: 'プレイヤーIDが不足しています。' });
        }
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

        try {
            const targetId = String(targetPlayFabId || '').trim();
            const readOnlyKeys = [
                'Race',
                'Nation',
                'IsKing',
                'AvatarColor',
                'SkinColorIndex',
                'FaceIndex',
                'HairStyleIndex',
                'FacialHairStyleIndex',
                'HairColorIndex',
                'Equipped_RightHand',
                'Equipped_LeftHand',
                'Equipped_Armor',
                'Equipped_Accessory'
            ];
            const [profileResult, readOnlyResult, statsResult] = await Promise.all([
                promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                    PlayFabId: targetId,
                    ProfileConstraints: { ShowDisplayName: true, ShowAvatarUrl: true }
                }),
                getPlayerReadOnlyData(targetId, readOnlyKeys),
                promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: targetId })
            ]);
            const readOnlyData = readOnlyResult?.Data || {};
            const stats = buildStatsMapFromStatistics(statsResult?.Statistics || []);
            Object.assign(stats, applyDerivedPlayerLevelToStats(stats).stats);
            const isOwnProfile = targetId === String(playFabId || '').trim();
            const equipment = {};
            const assignEquipmentValue = (slotName, rawValue) => {
                const parsed = parseStoredEquipmentValue(rawValue);
                if (parsed === null || parsed === undefined || parsed === '') return;
                equipment[slotName] = parsed;
            };
            assignEquipmentValue('RightHand', readOnlyData?.Equipped_RightHand?.Value || null);
            assignEquipmentValue('LeftHand', readOnlyData?.Equipped_LeftHand?.Value || null);
            assignEquipmentValue('Armor', readOnlyData?.Equipped_Armor?.Value || null);
            assignEquipmentValue('Accessory', readOnlyData?.Equipped_Accessory?.Value || null);

            const avatarBase = buildAvatarBaseFromReadOnly(readOnlyData, stats);
            const publicStats = {
                Level: Math.max(1, Math.floor(Number(stats.Level || avatarBase.level || 1) || 1)),
                ちから: Math.max(0, Math.floor(Number(stats.ちから || 0) || 0)),
                みのまもり: Math.max(0, Math.floor(Number(stats.みのまもり || 0) || 0)),
                すばやさ: Math.max(0, Math.floor(Number(stats.すばやさ || 0) || 0)),
                かしこさ: Math.max(0, Math.floor(Number(stats.かしこさ || 0) || 0))
            };
            const playerShip = await resourceStorage.getPlayerShipProfile(targetId, { promisifyPlayFab, PlayFabServer }, { persist: false }).catch(() => null);
            return res.json({
                success: true,
                profile: {
                    playFabId: targetId,
                    displayName: String(profileResult?.PlayerProfile?.DisplayName || targetId).trim() || targetId,
                    avatarUrl: String(profileResult?.PlayerProfile?.AvatarUrl || '').trim(),
                    nation: String(readOnlyData?.Nation?.Value || '').trim().toLowerCase() || null,
                    level: avatarBase.level,
                    stats: publicStats,
                    statAllocation: isOwnProfile ? calculateStatAllocationState(stats) : null,
                    avatarBase,
                    playerShip,
                    equipment,
                    itemSource: buildPublicItemSource(equipment),
                    equipmentList: buildPublicEquipmentList(equipment)
                }
            });
        } catch (error) {
            console.error('[get-player-public-profile] Error:', error?.errorMessage || error?.message || error);
            return res.status(500).json({
                error: 'プレイヤー情報の取得に失敗しました。',
                details: error?.errorMessage || error?.message || String(error)
            });
        }
    });

    app.post('/api/preview-tarot-manifestation', async (req, res) => {
        return res.status(410).json({ error: 'タロットカードの具現化は廃止されました。' });
    });

    app.post('/api/manifest-tarot-card', async (req, res) => {
        return res.status(410).json({ error: 'タロットカードの具現化は廃止されました。' });
    });

    app.post('/api/study-tarot-card', async (req, res) => {
        return res.status(410).json({ error: 'タロットカードからの術習得は廃止されました。' });
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

            const { awakenings } = await getPlayerTarotProgress(playFabId);
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
            let dailyNationSpecialtyReward = null;
            try {
                dailyNationSpecialtyReward = await claimDailyNationSpecialtyReward(playFabId);
            } catch (rewardError) {
                console.warn('[daily-nation-specialty] Claim skipped:', rewardError?.errorMessage || rewardError?.message || rewardError);
            }
            const stats = applyDerivedPlayerLevelToStats((await applyOfflineMpRecovery(playFabId)).currentStats).stats;
            const crewRankInfo = await getPlayerCrewRankInfo(playFabId, stats);
            let isKing = false;
            let nation = null;
            try {
                const readOnly = await getPlayerReadOnlyData(playFabId, ['IsKing', 'Nation', 'AvatarColor']);
                isKing = resolveIsKingFlag(readOnly?.Data);
                nation = String(readOnly?.Data?.Nation?.Value || '').trim().toLowerCase() || null;
                if (!isKing && Number(stats.Level || 1) >= PIRATE_KING_LEVEL) {
                    const syncResult = await syncPirateKingNationStatus(playFabId, { promisifyPlayFab, PlayFabServer }, stats.Level);
                    if (syncResult?.nation) {
                        nation = syncResult.nation;
                    }
                }
            } catch (rankError) {
                console.warn('[ステータス取得] 王情報の取得に失敗:', rankError?.errorMessage || rankError?.message || rankError);
            }
            console.log('[ステータス取得] 完了');
            res.json({
                stats: stats,
                statAllocation: calculateStatAllocationState(stats),
                dailyNationSpecialtyReward,
                crewRankInfo,
                isKing,
                nation
            });
        } catch (error) {
            console.error('[ステータス取得] エラー', error.errorMessage);
            res.status(500).json({ error: 'ステータス取得に失敗しました。', details: error.errorMessage });
        }
    });

    app.post('/api/allocate-stat-points', async (req, res) => {
        let { playFabId, allocations } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

        try {
            const currentStats = await getPlayerStatsMap(playFabId);
            const deltas = normalizeStatAllocationDeltas(allocations || {});
            const requestedTotal = getStatAllocationDeltaTotal(deltas);
            if (requestedTotal <= 0) {
                return res.status(400).json({ error: '割り振るポイントを選択してください。' });
            }

            const currentAllocation = calculateStatAllocationState(currentStats);
            if (requestedTotal > currentAllocation.availablePoints) {
                return res.status(400).json({
                    error: '未割り振りポイントが不足しています。',
                    requestedPoints: requestedTotal,
                    availablePoints: currentAllocation.availablePoints,
                    statAllocation: currentAllocation
                });
            }

            const updated = applyStatAllocationDeltas(currentStats, deltas);
            if (!updated.statistics.length) {
                return res.status(400).json({ error: '割り振るポイントを選択してください。' });
            }

            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: playFabId,
                Statistics: updated.statistics
            });

            const nextAllocation = calculateStatAllocationState(updated.stats);
            return res.json({
                success: true,
                stats: updated.stats,
                statAllocation: nextAllocation,
                allocatedPoints: requestedTotal
            });
        } catch (error) {
            console.error('[allocate-stat-points] Error:', error?.errorMessage || error?.message || error);
            return res.status(500).json({
                error: 'ステータスポイントの割り振りに失敗しました。',
                details: error?.errorMessage || error?.message || String(error)
            });
        }
    });

    app.post('/api/update-avatar-style', async (req, res) => {
        let { playFabId } = req.body || {};
        const requestedAction = String(req.body?.style?.action || req.body?.action || '').trim();
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;
        try {
            const config = resolveAvatarCustomizeAction(requestedAction);
            const styleKey = config?.styleKey;
            if (!styleKey || !config) {
                return res.status(400).json({ error: '変更メニューが正しくありません。' });
            }
            const stats = await getPlayerStatsMap(playFabId);
            const level = Math.max(1, Math.floor(Number(stats.Level || 1) || 1));
            if (!isFeatureUnlocked(config.feature, level)) {
                return res.status(403).json({
                    error: `${config.label}はLv.${FEATURE_UNLOCK_LEVELS[config.feature]}から利用できます。`,
                    feature: config.feature,
                    requiredLevel: FEATURE_UNLOCK_LEVELS[config.feature],
                    level
                });
            }
            const balance = typeof getCurrencyBalance === 'function'
                ? await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE)
                : null;
            if (Number.isFinite(balance) && balance < config.cost) {
                return res.status(402).json({
                    error: `${config.label}には${config.cost}G必要です。`,
                    cost: config.cost,
                    balance
                });
            }
            const readOnly = await getPlayerReadOnlyData(playFabId, Object.keys(AVATAR_CUSTOMIZE_LIMITS));
            const rawCurrentValue = readOnly?.Data?.[styleKey]?.Value;
            const currentValue = rawCurrentValue === undefined || rawCurrentValue === null || rawCurrentValue === ''
                ? (config.defaultValue ?? config.min)
                : Number(rawCurrentValue);
            const nextValue = config.mode === 'clear'
                ? Number(config.clearValue ?? FACIAL_HAIR_STYLE_INDEX_NONE)
                : pickRandomAvatarStyleValue(currentValue, config);
            const nextData = { [styleKey]: String(nextValue) };
            await subtractEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, config.cost, {
                idempotencyId: req.body?.requestId ? `avatar-style-${req.body.requestId}` : undefined
            });
            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: playFabId,
                Data: nextData
            });
            const newBalance = typeof getCurrencyBalance === 'function'
                ? await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE).catch(() => null)
                : null;
            res.json({
                success: true,
                level,
                unlocks: FEATURE_UNLOCK_LEVELS,
                action: requestedAction,
                changedKey: styleKey,
                previousValue: currentValue,
                nextValue,
                cost: config.cost,
                balance: Number.isFinite(newBalance) ? newBalance : undefined,
                avatarStyle: Object.fromEntries(Object.entries(nextData).map(([key, value]) => [key, Number(value)]))
            });
        } catch (error) {
            console.error('[update-avatar-style] Error:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: 'アバター変更に失敗しました。', details: error?.errorMessage || error?.message || String(error) });
        }
    });

    app.post('/api/ensure-avatar-style-defaults', async (req, res) => {
        let { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

        try {
            const readOnly = await getPlayerReadOnlyData(playFabId, AVATAR_RANDOM_DEFAULT_STYLE_KEYS);
            const readOnlyData = readOnly?.Data || {};
            const nextData = {};

            AVATAR_RANDOM_DEFAULT_STYLE_KEYS.forEach((styleKey) => {
                if (!isReadOnlyAvatarStyleUnset(readOnlyData, styleKey)) return;
                const nextValue = pickInitialAvatarStyleValue(styleKey);
                if (nextValue === null) return;
                nextData[styleKey] = String(nextValue);
            });

            if (Object.keys(nextData).length) {
                await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                    PlayFabId: playFabId,
                    Data: nextData
                });
            }

            const avatarStyle = {};
            AVATAR_RANDOM_DEFAULT_STYLE_KEYS.forEach((styleKey) => {
                avatarStyle[styleKey] = Number(
                    nextData[styleKey] ?? parseAvatarStyleReadOnlyValue(readOnlyData, styleKey)
                );
            });

            res.json({
                success: true,
                createdKeys: Object.keys(nextData),
                avatarStyle
            });
        } catch (error) {
            console.error('[ensure-avatar-style-defaults] Error:', error?.errorMessage || error?.message || error);
            res.status(500).json({
                error: 'アバター初期スタイルの保存に失敗しました。',
                details: error?.errorMessage || error?.message || String(error)
            });
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
            if (!itemData || itemData.Category !== 'Consumable') {
                return res.status(400).json({ error: 'このアイテムは使用できません。' });
            }

            const isTroyMenuConsumable = parseBooleanFlag(itemData.TroyMenuConsumable)
                || parseBooleanFlag(itemData.IsTroyMenuConsumable);
            if (isTroyMenuConsumable) {
                await subtractEconomyItem(playFabId, itemId, 1);
                const itemName = itemData.DisplayName || itemData.Title || itemId;
                return res.json({
                    status: 'success',
                    message: `${itemName}を使いました。`,
                    updatedStats: {}
                });
            }

            if (!itemData.Effect) {
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
            console.log('[アイテム売却] ゴールドを付与しました');

            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: playFabId,
                Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: newBalance }]
            });
            console.log('[アイテム売却] ランキングスコアを更新しました');

            res.json({
                status: 'success',
                message: `${itemData.DisplayName || itemId}を${sellPrice}Gで売却しました。`,
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
                const gachaResult = drawLocalGachaItem(catalogCache);
                const grantedItemId = gachaResult.itemId;
                if (!grantedItemId) throw new Error('ガチャ結果が空でした。');
                await addEconomyItem(playFabId, grantedItemId, 1);
                const catalogData = normalizeCatalogDisplayData(grantedItemId, catalogCache[grantedItemId] || {});
                const grantedItemName = catalogData.DisplayName || catalogData.Title || grantedItemId;
                res.json({
                    newBalance: newBalance,
                    grantedItems: [{ ItemId: grantedItemId, DisplayName: grantedItemName }]
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
                return res.status(400).json({ error: `ゴールドが不足しています。必要: ${GACHA_COST}G` });
            }
            console.error('ガチャ課金失敗:', subtractError.errorMessage || subtractError.message || subtractError);
            res.status(500).json({ error: 'ガチャに失敗しました。', details: subtractError.errorMessage || subtractError.message });
        }
    });
}

module.exports = {
    GACHA_CATALOG_VERSION,
    GACHA_COST,
    initializeInventoryRoutes
};
