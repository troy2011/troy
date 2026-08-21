// server/inventory.js
// インベントリ・装備関連のAPI

const { randomUUID } = require('node:crypto');
const { getItemAmount, getCurrencyIdFromItem } = require('./economy');
const { withTitleEntityToken: defaultWithTitleEntityToken } = require('./playfab');
const { drawLocalGachaItem } = require('./gacha');
const resourceStorage = require('./resourceStorage');
const { buildMajorArcanaShipGearView } = require('./majorArcanaShipGear');
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
    isTarotMajorCategory,
    enrichTarotCatalogData
} = require('./tarotCards');
const { parseJsonValue } = require('./tarotSkills');
const { FEATURE_UNLOCK_LEVELS, isFeatureUnlocked } = require('./featureUnlocks');
const { getDestinyProfile } = require('./personalityAssessmentEngine');
const {
    EQUIPMENT_ENHANCEMENT_MAX_STAT,
    applyEquipmentEnhancementToCatalogData,
    buildEquipmentEnhancementDescriptor,
    buildEquipmentEnhancementDisplayProperties,
    getEquipmentEnhancementBonus,
    normalizeDisplayProperties
} = require('./equipmentEnhancement');
const {
    TAROT_KINGDOM_PET_DATA_KEY,
    buildTarotKingdomPetPublicRecord,
    normalizeTarotKingdomPetState
} = require('./tarotKingdomPets');
const { resolveGuildShipContext } = require('./guildShipSharing');
const GACHA_CATALOG_VERSION = process.env.GACHA_CATALOG_VERSION || 'main_catalog';
const GACHA_COST = Number(process.env.GACHA_COST || 10);
const VIRTUAL_CURRENCY_CODE = String(process.env.VIRTUAL_CURRENCY_CODE || 'PS').trim().toUpperCase();
const LEADERBOARD_NAME = process.env.LEADERBOARD_NAME || 'ps_ranking';
const INVENTORY_SELL_UNIT_PRICE = 1;
const BLACK_MARKET_LISTINGS_COLLECTION = 'black_market_listings';
const BLACK_MARKET_OWNERSHIP_COLLECTION = 'black_market_item_origins';
const BLACK_MARKET_SLOTS_COLLECTION = 'black_market_listing_slots';
const BLACK_MARKET_MAX_ACTIVE_LISTINGS = 5;
const BLACK_MARKET_MIN_PRICE = 1;
const BLACK_MARKET_MAX_PRICE = 9999;
const BLACK_MARKET_OCCUPIED_STATUSES = new Set(['creating', 'active', 'buying', 'cancelling']);
const EQUIPMENT_ENHANCEMENT_PENDING_KEY = 'EquipmentEnhancementPending';
const EQUIPMENT_ENHANCEMENT_MAX_MATERIAL_STACKS = 40;
const INVENTORY_SELL_EQUIPMENT_KEYS = [
    'Equipped_RightHand',
    'Equipped_LeftHand',
    'Equipped_Armor',
    'Equipped_Accessory',
    ...Object.values(TAROT_EQUIPMENT_SLOT_TO_KEY)
];
const INVENTORY_SELL_DECK_KEYS = ['TarotDeck', 'TarotMeleeDeck', 'TarotShipDeck'];
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

function buildPublicProfileShip(baseShip = null, shipContext = null, guildShipData = null) {
    const context = shipContext && typeof shipContext === 'object' ? shipContext : {};
    const base = baseShip && typeof baseShip === 'object' ? baseShip : null;
    if (!context.isGuildShip) {
        if (!base) return null;
        return {
            ...base,
            shipOwnerPlayFabId: context.shipOwnerPlayFabId || base.shipOwnerPlayFabId || null,
            isSharedShip: Boolean(context.isSharedShip || base.isSharedShip),
            guildId: context.guildId || base.guildId || null,
            guildName: context.guildName || base.guildName || null,
            captainName: context.captainName || base.captainName || null
        };
    }

    const stored = guildShipData && typeof guildShipData === 'object' ? guildShipData : {};
    const appearance = {
        ...(base?.appearance && typeof base.appearance === 'object' ? base.appearance : {}),
        ...(context.appearance && typeof context.appearance === 'object' ? context.appearance : {}),
        ...(stored.appearance && typeof stored.appearance === 'object' ? stored.appearance : {})
    };
    const sailColor = String(stored.sailColor || appearance.color || context.sailColor || '').trim().toLowerCase();
    if (sailColor) appearance.color = sailColor;
    const guildName = String(context.guildName || '').trim();
    const automaticGuildName = guildName ? `${guildName}号` : '';
    const storedDisplayName = String(stored.displayName || '').trim();
    const customDisplayName = storedDisplayName && storedDisplayName !== automaticGuildName
        ? storedDisplayName
        : '';
    const name = customDisplayName
        || String(context.kingShipName || '').trim()
        || automaticGuildName
        || String(base?.name || '').trim()
        || 'ギルドシップ';

    return {
        ...(base || {}),
        shipId: context.guildShipId || base?.shipId || null,
        name,
        form: 'guild',
        itemId: 'guild_ship',
        stage: Math.max(1, Math.floor(Number(stored.stage || stored.shipStage || base?.stage || 3) || 3)),
        level: Math.max(1, Math.floor(Number(stored.level || stored.shipLevel || base?.level || 1) || 1)),
        isSharedShip: Boolean(context.isSharedShip),
        isGuildShip: true,
        isNationGuild: Boolean(context.isNationGuild),
        guildType: context.guildType || 'nation',
        guildId: context.guildId || null,
        guildName: guildName || null,
        guildShipId: context.guildShipId || null,
        kingShipName: context.kingShipName || null,
        captainName: context.captainName || null,
        nationKey: context.nationKey || null,
        sailColor: sailColor || null,
        appearance
    };
}
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
    if (preset) {
        normalized.sprite_path = preset.path;
        normalized.sprite_w = preset.width;
        normalized.sprite_h = preset.height;
        normalized.sprite_cols = preset.cols;
        if (preset.weaponType && !normalized.WeaponType) {
            normalized.WeaponType = preset.weaponType;
        }
    }
    return enrichTarotCatalogData(itemId, normalized);
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
    const equipmentMutationQueues = new Map();
    const runWithTitleEntityToken = typeof deps.withTitleEntityToken === 'function'
        ? deps.withTitleEntityToken
        : defaultWithTitleEntityToken;

    async function requireAuthedPlayFabId(req, res, playFabId) {
        if (typeof requireAuthenticatedPlayFabId !== 'function') {
            return playFabId;
        }
        return requireAuthenticatedPlayFabId(req, res, playFabId);
    }

    async function acquireEquipmentMutationLock(playFabId) {
        const key = String(playFabId || '').trim();
        const previous = equipmentMutationQueues.get(key) || Promise.resolve();
        let releaseCurrent;
        const current = new Promise((resolve) => {
            releaseCurrent = resolve;
        });
        equipmentMutationQueues.set(key, current);
        await previous.catch(() => undefined);
        return () => {
            releaseCurrent();
            if (equipmentMutationQueues.get(key) === current) {
                equipmentMutationQueues.delete(key);
            }
        };
    }

    async function executeInventoryOperations(entityKey, operations, options = {}) {
        if (!PlayFabEconomy?.ExecuteInventoryOperations) {
            throw new Error('PlayFab Economy inventory operations are unavailable.');
        }
        const request = {
            Entity: entityKey,
            Operations: operations
        };
        if (options.eTag) request.ETag = String(options.eTag);
        if (options.idempotencyId) request.IdempotencyId = String(options.idempotencyId);
        return runWithTitleEntityToken(() => promisifyPlayFab(PlayFabEconomy.ExecuteInventoryOperations, request));
    }

    async function getInventorySnapshot(entityKey) {
        if (!PlayFabEconomy?.GetInventoryItems) {
            return { items: await getAllInventoryItems(entityKey), eTag: '' };
        }
        const items = [];
        let continuationToken = null;
        let eTag = '';
        do {
            const result = await runWithTitleEntityToken(() => promisifyPlayFab(PlayFabEconomy.GetInventoryItems, {
                Entity: entityKey,
                Count: 50,
                ContinuationToken: continuationToken || undefined
            }));
            items.push(...(Array.isArray(result?.Items) ? result.Items : []));
            eTag = String(result?.ETag || eTag || '');
            continuationToken = result?.ContinuationToken || null;
        } while (continuationToken);
        return { items, eTag };
    }

    async function subtractEconomyStack(playFabId, itemId, stackId, amount, options = {}) {
        if (!PlayFabEconomy?.ExecuteInventoryOperations) {
            return subtractEconomyItem(playFabId, itemId, amount, options);
        }
        const entityKey = options.entityKey || await getEntityKeyForPlayFabId(playFabId);
        return executeInventoryOperations(entityKey, [{
            Subtract: {
                Item: { Id: itemId, StackId: stackId },
                Amount: amount,
                DeleteEmptyStacks: true
            }
        }], options);
    }

    async function addEconomyStack(playFabId, itemId, displayProperties = {}, options = {}) {
        if (!PlayFabEconomy?.ExecuteInventoryOperations) {
            await addEconomyItem(playFabId, itemId, Math.max(1, Math.floor(Number(options.amount) || 1)), options);
            return '';
        }
        const entityKey = options.entityKey || await getEntityKeyForPlayFabId(playFabId);
        const stackId = String(options.stackId || randomUUID()).trim();
        await executeInventoryOperations(entityKey, [{
            Add: {
                Item: { Id: itemId, StackId: stackId },
                Amount: Math.max(1, Math.floor(Number(options.amount) || 1)),
                NewStackValues: { DisplayProperties: normalizeDisplayProperties(displayProperties) }
            }
        }], options);
        return stackId;
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
            const membershipResult = await runWithTitleEntityToken(() => promisifyPlayFab(PlayFabGroups.ListMembership, {
                Entity: entityKey
            }));
            const groups = Array.isArray(membershipResult?.Groups) ? membershipResult.Groups : [];
            if (!groups.length) return null;

            for (const group of groups) {
                const guildId = group?.Group?.Id;
                if (!guildId || isSystemNationGroupEntry(group)) continue;

                const guildDataResult = await runWithTitleEntityToken(() => promisifyPlayFab(PlayFabData.GetObjects, {
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
        const isPirateKing = level >= PIRATE_KING_LEVEL && !resolveIsKingFlag(readOnlyData);
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

    function buildPublicEquipmentItem(itemRef, inventoryItems = []) {
        if (!itemRef) return null;
        if (typeof itemRef === 'object' && itemRef.customData) return itemRef;
        const parsed = parseStoredEquipmentValue(itemRef);
        const requestedStackId = getStoredEquipmentStackId(parsed);
        const rawString = typeof parsed === 'string' ? parsed.trim() : '';
        const inventoryItem = (inventoryItems || []).find((item) => (
            (requestedStackId && getInventoryStackId(item) === requestedStackId)
            || (!requestedStackId && rawString && getInventoryStackId(item) === rawString)
        )) || null;
        const itemId = getStoredEquipmentItemId(parsed)
            || getInventoryItemId(inventoryItem)
            || rawString;
        if (!itemId) return null;
        const baseCatalogData = normalizeCatalogDisplayData(itemId, catalogCache[itemId] || {});
        const enhanced = applyEquipmentEnhancementToCatalogData(itemId, baseCatalogData, inventoryItem || {});
        const stackId = getInventoryStackId(inventoryItem) || requestedStackId;
        return {
            itemId,
            stackId: stackId || undefined,
            name: enhanced.catalogData.DisplayName || itemId,
            description: enhanced.catalogData.Description || '',
            customData: enhanced.catalogData,
            enhancement: enhanced.enhancement
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
            if (!itemRef) return;
            const item = buildPublicEquipmentItem(itemRef);
            if (!item) return;
            itemSource[item.itemId] = item;
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

    function getInventoryItemTotal(items, itemId) {
        const targetId = String(itemId || '').trim();
        if (!targetId) return 0;
        return (items || []).reduce((total, item) => {
            const currentId = String(item?.Id || item?.ItemId || '').trim();
            if (currentId !== targetId) return total;
            return total + (getItemAmount(item) || 0);
        }, 0);
    }

    function getStoredEquipmentItemId(rawValue) {
        const parsed = parseStoredEquipmentValue(rawValue);
        if (!parsed) return '';
        if (typeof parsed !== 'object') return String(parsed || '').trim();
        return String(
            parsed.itemId
            || parsed.ItemId
            || parsed.id
            || parsed.Id
            || parsed?.Item?.Id
            || parsed?.Item?.itemId
            || ''
        ).trim();
    }

    function getStoredEquipmentStackId(rawValue) {
        const parsed = parseStoredEquipmentValue(rawValue);
        if (!parsed || typeof parsed !== 'object') return '';
        return String(
            parsed.stackId
            || parsed.StackId
            || parsed.instanceId
            || parsed.InstanceId
            || parsed.itemInstanceId
            || parsed.ItemInstanceId
            || ''
        ).trim();
    }

    function buildStoredEquipmentValue(itemId, stackId = '') {
        const safeItemId = String(itemId || '').trim();
        const safeStackId = String(stackId || '').trim();
        if (!safeItemId) return null;
        if (!safeStackId) return safeItemId;
        return JSON.stringify({ itemId: safeItemId, stackId: safeStackId });
    }

    function getInventoryItemId(item) {
        return String(item?.Id || item?.ItemId || '').trim();
    }

    function getInventoryStackId(item) {
        return String(item?.StackId || item?.stackId || '').trim();
    }

    function getInventoryReferenceKey(itemId, stackId) {
        return `${String(itemId || '').trim()}::${String(stackId || '').trim()}`;
    }

    function findInventoryStack(inventoryItems, itemId, stackId) {
        const safeItemId = String(itemId || '').trim();
        const safeStackId = String(stackId || '').trim();
        if (!safeStackId) return null;
        const matches = (Array.isArray(inventoryItems) ? inventoryItems : []).filter((item) => (
            getInventoryStackId(item) === safeStackId
            && (!safeItemId || getInventoryItemId(item) === safeItemId)
        ));
        return matches.length === 1 ? matches[0] : null;
    }

    function getInventoryStackAmount(item) {
        const rawAmount = item?.Amount ?? item?.amount;
        return Math.max(0, Math.floor(rawAmount == null ? 1 : (Number(rawAmount) || 0)));
    }

    async function getOwnedInventoryItemCount(playFabId, itemId) {
        if (typeof getEntityKeyForPlayFabId !== 'function' || typeof getAllInventoryItems !== 'function') {
            return 0;
        }
        const entityKey = await getEntityKeyForPlayFabId(playFabId);
        const inventoryItems = await getAllInventoryItems(entityKey);
        return getInventoryItemTotal(inventoryItems, itemId);
    }

    function isCurrencyInventoryItem(itemId) {
        return !!getCurrencyIdFromItem({ Id: itemId }, catalogCache);
    }

    function getBlackMarketCollection() {
        if (!firestore || typeof firestore.collection !== 'function') return null;
        return firestore.collection(BLACK_MARKET_LISTINGS_COLLECTION);
    }

    function getBlackMarketOwnershipCollection() {
        if (!firestore || typeof firestore.collection !== 'function') return null;
        return firestore.collection(BLACK_MARKET_OWNERSHIP_COLLECTION);
    }

    function getBlackMarketSlotsCollection() {
        if (!firestore || typeof firestore.collection !== 'function') return null;
        return firestore.collection(BLACK_MARKET_SLOTS_COLLECTION);
    }

    function normalizeBlackMarketPrice(value) {
        const price = Number(value);
        if (!Number.isInteger(price) || price < BLACK_MARKET_MIN_PRICE || price > BLACK_MARKET_MAX_PRICE) {
            return 0;
        }
        return price;
    }

    function normalizeBlackMarketCategory(category) {
        const raw = String(category || '').trim();
        if (raw === 'TarotArcanaMajor' || raw === 'MajorArcana') return 'TarotMajor';
        if (raw === 'TarotArcanaMinor' || raw === 'MinorArcana') return 'TarotMinor';
        return raw;
    }

    function sanitizeFirestoreValue(value, inArray = false) {
        if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
            return inArray ? null : undefined;
        }
        if (value === null || typeof value !== 'object') return value;
        if (value instanceof Date) return value;
        if (Array.isArray(value)) {
            return value.map((entry) => sanitizeFirestoreValue(entry, true));
        }
        return Object.entries(value).reduce((result, [key, entry]) => {
            const sanitized = sanitizeFirestoreValue(entry);
            if (sanitized !== undefined) result[key] = sanitized;
            return result;
        }, {});
    }

    function isBlackMarketOriginTrackedItem(itemId, itemData = null) {
        if (!itemId || isCurrencyInventoryItem(itemId)) return false;
        const catalogData = itemData || normalizeCatalogDisplayData(itemId, catalogCache[itemId] || {});
        const category = normalizeBlackMarketCategory(catalogData?.Category);
        return category !== 'Consumable';
    }

    function makeBlackMarketOwnershipId(ownerPlayFabId, itemId, originPlayFabId) {
        return [ownerPlayFabId, itemId, originPlayFabId]
            .map((part) => encodeURIComponent(String(part || '').trim()))
            .join('__');
    }

    function getListingSnapshotFromDoc(doc) {
        const data = typeof doc?.data === 'function' ? doc.data() : (doc || {});
        return {
            listingId: String(data.listingId || doc?.id || '').trim(),
            sellerPlayFabId: String(data.sellerPlayFabId || '').trim(),
            sellerDisplayName: String(data.sellerDisplayName || data.sellerPlayFabId || '').trim(),
            buyerPlayFabId: String(data.buyerPlayFabId || '').trim(),
            itemId: String(data.itemId || '').trim(),
            stackId: String(data.stackId || '').trim(),
            itemName: String(data.itemName || data.itemId || '').trim(),
            price: Math.max(0, Math.floor(Number(data.price) || 0)),
            status: String(data.status || 'active').trim(),
            createdAtMs: Math.max(0, Math.floor(Number(data.createdAtMs) || 0)),
            updatedAtMs: Math.max(0, Math.floor(Number(data.updatedAtMs) || 0)),
            soldAtMs: Math.max(0, Math.floor(Number(data.soldAtMs) || 0)),
            cancelledAtMs: Math.max(0, Math.floor(Number(data.cancelledAtMs) || 0)),
            originPlayFabId: String(data.originPlayFabId || '').trim(),
            originDisplayName: String(data.originDisplayName || '').trim(),
            itemData: data.itemData && typeof data.itemData === 'object' ? data.itemData : {},
            displayProperties: normalizeDisplayProperties(data.displayProperties),
            settlementStatus: String(data.settlementStatus || '').trim(),
            lastError: String(data.lastError || '').trim(),
            slotIndex: Number.isInteger(data.slotIndex) ? data.slotIndex : -1,
            originTracked: data.originTracked === true,
            itemDebited: data.itemDebited === true,
            ownershipDebited: data.ownershipDebited === true,
            returnGranted: data.returnGranted === true,
            ownershipReturned: data.ownershipReturned === true,
            buyerCharged: data.buyerCharged === true,
            buyerItemGranted: data.buyerItemGranted === true,
            buyerOwnershipGranted: data.buyerOwnershipGranted === true,
            buyerRefunded: data.buyerRefunded === true,
            sellerPaid: data.sellerPaid === true
        };
    }

    function buildBlackMarketItemSnapshot(itemId, inventoryItem = null) {
        const baseCatalogData = normalizeCatalogDisplayData(itemId, catalogCache[itemId] || {});
        const enhanced = applyEquipmentEnhancementToCatalogData(itemId, baseCatalogData, inventoryItem || {});
        const catalogData = enhanced.catalogData;
        return {
            itemId,
            itemName: String(catalogData.DisplayName || catalogData.Title || itemId).trim() || itemId,
            description: String(catalogData.Description || '').trim(),
            category: normalizeBlackMarketCategory(catalogData.Category),
            itemData: sanitizeFirestoreValue(catalogData) || {},
            enhancement: enhanced.enhancement,
            displayProperties: sanitizeFirestoreValue(normalizeDisplayProperties(inventoryItem?.DisplayProperties)) || {}
        };
    }

    async function getBlackMarketOccupiedListingsForSeller(playFabId) {
        const collection = getBlackMarketCollection();
        if (!collection) return [];
        const snap = await collection.where('sellerPlayFabId', '==', playFabId).limit(200).get();
        return (snap?.docs || [])
            .map(getListingSnapshotFromDoc)
            .filter((listing) => BLACK_MARKET_OCCUPIED_STATUSES.has(listing.status));
    }

    async function getBlackMarketActiveListingCount(playFabId) {
        return (await getBlackMarketOccupiedListingsForSeller(playFabId)).length;
    }

    function getBlackMarketSlotRef(playFabId, slotIndex) {
        const collection = getBlackMarketSlotsCollection();
        if (!collection) return null;
        const ownerKey = encodeURIComponent(String(playFabId || '').trim());
        return collection.doc(`${ownerKey}__${slotIndex}`);
    }

    function requireBlackMarketTransactions() {
        if (!firestore || typeof firestore.runTransaction !== 'function') {
            const error = new Error('闇市の取引ロックを利用できません。');
            error.status = 503;
            throw error;
        }
    }

    async function reserveBlackMarketListingSlot(listingRef, listing) {
        requireBlackMarketTransactions();
        const existingListings = await getBlackMarketOccupiedListingsForSeller(listing.sellerPlayFabId);
        return firestore.runTransaction(async (tx) => {
            const slotRefs = Array.from({ length: BLACK_MARKET_MAX_ACTIVE_LISTINGS }, (_entry, index) => (
                getBlackMarketSlotRef(listing.sellerPlayFabId, index)
            ));
            const slotSnaps = [];
            for (const slotRef of slotRefs) {
                slotSnaps.push(await tx.get(slotRef));
            }

            const claimedListingIds = new Set(slotSnaps.map((snap) => (
                snap?.exists ? String(snap.data()?.listingId || '').trim() : ''
            )).filter(Boolean));
            const freeSlotIndexes = slotSnaps
                .map((snap, index) => ({ snap, index }))
                .filter(({ snap }) => !snap?.exists || !String(snap.data()?.listingId || '').trim())
                .map(({ index }) => index);

            const legacyListings = existingListings.filter((entry) => (
                entry.listingId
                && entry.slotIndex < 0
                && !claimedListingIds.has(entry.listingId)
            ));
            for (const legacyListing of legacyListings) {
                const legacySlotIndex = freeSlotIndexes.shift();
                if (!Number.isInteger(legacySlotIndex)) break;
                tx.set(slotRefs[legacySlotIndex], {
                    sellerPlayFabId: listing.sellerPlayFabId,
                    listingId: legacyListing.listingId,
                    status: 'occupied',
                    updatedAtMs: Date.now()
                }, { merge: true });
                tx.set(getBlackMarketCollection().doc(legacyListing.listingId), {
                    slotIndex: legacySlotIndex,
                    updatedAtMs: Date.now()
                }, { merge: true });
            }

            const slotIndex = freeSlotIndexes.shift();
            if (!Number.isInteger(slotIndex)) return null;
            const nowMs = Date.now();
            tx.set(listingRef, {
                ...listing,
                slotIndex,
                createdAtMs: nowMs,
                updatedAtMs: nowMs
            });
            tx.set(slotRefs[slotIndex], {
                sellerPlayFabId: listing.sellerPlayFabId,
                listingId: listing.listingId,
                status: 'occupied',
                updatedAtMs: nowMs
            }, { merge: true });
            return slotIndex;
        });
    }

    async function getBlackMarketListing(listingId) {
        const collection = getBlackMarketCollection();
        if (!collection) return null;
        const ref = collection.doc(String(listingId || '').trim());
        const snap = await ref.get();
        if (!snap?.exists) return null;
        return getListingSnapshotFromDoc({ id: ref.id, data: () => snap.data() });
    }

    async function patchBlackMarketListing(listingId, patch = {}) {
        const collection = getBlackMarketCollection();
        if (!collection) return;
        await collection.doc(listingId).set({
            ...patch,
            updatedAtMs: Date.now()
        }, { merge: true });
    }

    async function getBlackMarketOwnershipEntries(ownerPlayFabId, itemId = '') {
        const collection = getBlackMarketOwnershipCollection();
        if (!collection) return [];
        const snap = await collection.where('ownerPlayFabId', '==', ownerPlayFabId).limit(500).get();
        return (snap?.docs || [])
            .map((doc) => ({ id: doc.id, ...(typeof doc.data === 'function' ? doc.data() : {}) }))
            .filter((entry) => {
                if (String(entry.itemId || '').trim() !== String(itemId || entry.itemId || '').trim()) return false;
                return Math.max(0, Math.floor(Number(entry.count) || 0)) > 0;
            })
            .sort((a, b) => (Number(a.createdAtMs || 0) || 0) - (Number(b.createdAtMs || 0) || 0));
    }

    async function pickBlackMarketOriginForListing(sellerPlayFabId, itemId, itemData) {
        if (!isBlackMarketOriginTrackedItem(itemId, itemData)) return null;
        const existingOrigins = await getBlackMarketOwnershipEntries(sellerPlayFabId, itemId);
        if (existingOrigins.length > 0) {
            const origin = existingOrigins[0];
            return {
                playFabId: String(origin.originPlayFabId || sellerPlayFabId).trim() || sellerPlayFabId,
                displayName: String(origin.originDisplayName || origin.originPlayFabId || sellerPlayFabId).trim() || sellerPlayFabId,
                tracked: true
            };
        }
        const displayName = await getPlayerDisplayName(sellerPlayFabId);
        return {
            playFabId: sellerPlayFabId,
            displayName: displayName || sellerPlayFabId,
            tracked: false
        };
    }

    async function buildBlackMarketOriginSummaries(playFabId, itemIds = []) {
        const ids = new Set((Array.isArray(itemIds) ? itemIds : [])
            .map((itemId) => String(itemId || '').trim())
            .filter(Boolean));
        if (!ids.size) return {};
        const entries = await getBlackMarketOwnershipEntries(playFabId);
        const grouped = {};
        entries.forEach((entry) => {
            const itemId = String(entry.itemId || '').trim();
            if (!ids.has(itemId)) return;
            const count = Math.max(0, Math.floor(Number(entry.count) || 0));
            if (count <= 0) return;
            if (!grouped[itemId]) grouped[itemId] = [];
            grouped[itemId].push({
                playFabId: String(entry.originPlayFabId || '').trim(),
                displayName: String(entry.originDisplayName || entry.originPlayFabId || '').trim(),
                count
            });
        });
        return Object.fromEntries(Object.entries(grouped).map(([itemId, originEntries]) => {
            const names = [...new Set(originEntries.map((entry) => entry.displayName || entry.playFabId).filter(Boolean))];
            return [itemId, {
                itemId,
                entries: originEntries,
                displayText: names.length > 1 ? `${names[0]} ほか` : (names[0] || '')
            }];
        }));
    }

    function normalizeSellRequestItems(items) {
        const sourceItems = Array.isArray(items) ? items : [];
        const byReference = new Map();
        sourceItems.forEach((entry) => {
            const itemId = String(entry?.itemId || entry?.ItemId || entry?.id || '').trim();
            const stackId = String(entry?.stackId || entry?.StackId || entry?.itemInstanceId || '').trim();
            const amount = Math.max(1, Math.floor(Number(entry?.amount ?? entry?.count ?? 1) || 1));
            if (!itemId || isCurrencyInventoryItem(itemId)) return;
            const key = `${itemId}::${stackId}`;
            const current = byReference.get(key) || { itemId, stackId, amount: 0 };
            current.amount += amount;
            byReference.set(key, current);
        });
        return Array.from(byReference.values());
    }

    function parseStoredDeckItemIds(rawValue) {
        return (parseJsonValue(rawValue, []) || [])
            .map((itemId) => String(itemId || '').trim())
            .filter(Boolean);
    }

    async function getInventorySellContext(playFabId) {
        const readOnlyResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: [...INVENTORY_SELL_EQUIPMENT_KEYS, ...INVENTORY_SELL_DECK_KEYS]
        });
        let shipMajorArcanaItemIds = [];
        try {
            const playerShip = await resourceStorage.getPlayerShipProfile(
                playFabId,
                { promisifyPlayFab, PlayFabServer },
                { persist: false }
            );
            shipMajorArcanaItemIds = (playerShip?.majorArcanaItemIds || [])
                .map((itemId) => String(itemId || '').trim())
                .filter(Boolean);
        } catch (error) {
            console.warn('[inventory-sell] ship major arcana lookup failed:', error?.errorMessage || error?.message || error);
        }
        return {
            readOnlyData: readOnlyResult?.Data || {},
            shipMajorArcanaItemIds
        };
    }

    function getReservedSellCount(itemId, context) {
        const targetId = String(itemId || '').trim();
        if (!targetId) return 0;
        let count = 0;
        INVENTORY_SELL_EQUIPMENT_KEYS.forEach((key) => {
            const equippedItemId = getStoredEquipmentItemId(context?.readOnlyData?.[key]?.Value || null);
            if (equippedItemId === targetId) count += 1;
        });
        const deckIds = new Set();
        INVENTORY_SELL_DECK_KEYS.forEach((key) => {
            parseStoredDeckItemIds(context?.readOnlyData?.[key]?.Value).forEach((deckItemId) => deckIds.add(deckItemId));
        });
        if (deckIds.has(targetId)) count += 1;
        (context?.shipMajorArcanaItemIds || []).forEach((shipItemId) => {
            if (shipItemId === targetId) count += 1;
        });
        return count;
    }

    function getSellableInventoryItemCount(inventoryItems, itemId, context) {
        if (isCurrencyInventoryItem(itemId)) return 0;
        const ownedCount = getInventoryItemTotal(inventoryItems, itemId);
        return Math.max(0, ownedCount - getReservedSellCount(itemId, context));
    }

    function createInventoryRequestError(message, status = 400) {
        const error = new Error(message);
        error.status = status;
        return error;
    }

    function normalizeEnhancementMaterialSelections(value) {
        const source = Array.isArray(value) ? value : [];
        const byReference = new Map();
        source.forEach((entry) => {
            const itemId = String(entry?.itemId || entry?.ItemId || '').trim();
            const stackId = String(entry?.stackId || entry?.StackId || '').trim();
            const amount = Math.max(0, Math.floor(Number(entry?.amount ?? 1) || 0));
            if (!stackId || amount <= 0) return;
            const key = getInventoryReferenceKey(itemId, stackId);
            const current = byReference.get(key) || { itemId, stackId, amount: 0 };
            current.amount += amount;
            byReference.set(key, current);
        });
        return Array.from(byReference.values());
    }

    function getEnhancementEquippedSlotKeys(baseItem, sellContext) {
        const itemId = getInventoryItemId(baseItem);
        const stackId = getInventoryStackId(baseItem);
        const exactMatches = [];
        const legacyMatches = [];
        INVENTORY_SELL_EQUIPMENT_KEYS.slice(0, 4).forEach((key) => {
            const rawValue = sellContext?.readOnlyData?.[key]?.Value || null;
            const storedItemId = getStoredEquipmentItemId(rawValue);
            const storedStackId = getStoredEquipmentStackId(rawValue);
            if (storedStackId && storedStackId === stackId && (!storedItemId || storedItemId === itemId)) exactMatches.push(key);
            else if (!storedStackId && storedItemId === itemId) legacyMatches.push(key);
        });
        if (exactMatches.length) return exactMatches;
        return legacyMatches.slice(0, 1);
    }

    function isExactEquipmentStackReserved(itemId, stackId, sellContext) {
        const safeItemId = String(itemId || '').trim();
        if (!stackId) return false;
        return INVENTORY_SELL_EQUIPMENT_KEYS.slice(0, 4).some((key) => {
            const rawValue = sellContext?.readOnlyData?.[key]?.Value || null;
            const storedStackId = getStoredEquipmentStackId(rawValue);
            if (storedStackId !== stackId) return false;
            const storedItemId = getStoredEquipmentItemId(rawValue);
            return !safeItemId || !storedItemId || storedItemId === safeItemId;
        });
    }

    function getLegacyReservedSellCount(itemId, context) {
        const targetId = String(itemId || '').trim();
        if (!targetId) return 0;
        let count = 0;
        INVENTORY_SELL_EQUIPMENT_KEYS.forEach((key) => {
            const rawValue = context?.readOnlyData?.[key]?.Value || null;
            if (!getStoredEquipmentStackId(rawValue) && getStoredEquipmentItemId(rawValue) === targetId) {
                count += 1;
            }
        });
        const deckIds = new Set();
        INVENTORY_SELL_DECK_KEYS.forEach((key) => {
            parseStoredDeckItemIds(context?.readOnlyData?.[key]?.Value).forEach((deckItemId) => deckIds.add(deckItemId));
        });
        if (deckIds.has(targetId)) count += 1;
        (context?.shipMajorArcanaItemIds || []).forEach((shipItemId) => {
            if (shipItemId === targetId) count += 1;
        });
        return count;
    }

    function selectUnenhancedInventoryStacks(inventoryItems, itemId, amount, sellContext, claimedByStackId = new Map()) {
        const targetAmount = Math.max(0, Math.floor(Number(amount) || 0));
        let reservedRemaining = getLegacyReservedSellCount(itemId, sellContext);
        let selectionRemaining = targetAmount;
        const selections = [];
        const candidates = (Array.isArray(inventoryItems) ? inventoryItems : []).filter((item) => (
            getInventoryItemId(item) === itemId
            && getInventoryStackAmount(item) > 0
            && getEquipmentEnhancementBonus(item) <= 0
            && !isExactEquipmentStackReserved(itemId, getInventoryStackId(item), sellContext)
        ));

        for (const item of candidates) {
            const stackId = getInventoryStackId(item);
            const alreadyClaimed = stackId ? (claimedByStackId.get(stackId) || 0) : 0;
            let available = Math.max(0, getInventoryStackAmount(item) - alreadyClaimed);
            const reservedHere = Math.min(reservedRemaining, available);
            reservedRemaining -= reservedHere;
            available -= reservedHere;
            const selectedAmount = Math.min(selectionRemaining, available);
            if (selectedAmount > 0) {
                selections.push({ stackId, amount: selectedAmount });
                selectionRemaining -= selectedAmount;
            }
            if (selectionRemaining <= 0) break;
        }
        return selectionRemaining > 0 ? null : selections;
    }

    async function buildEquipmentEnhancementContext(playFabId, payload = {}) {
        const requestedBaseItemId = String(payload.baseItemId || '').trim();
        const baseStackId = String(payload.baseStackId || '').trim();
        if (!baseStackId) throw createInventoryRequestError('強化する装備個体を選んでください。');

        const materialSelections = normalizeEnhancementMaterialSelections(payload.materials);
        if (!materialSelections.length) throw createInventoryRequestError('素材を1個以上選んでください。');
        if (materialSelections.length > EQUIPMENT_ENHANCEMENT_MAX_MATERIAL_STACKS) {
            throw createInventoryRequestError('一度に選べる素材の種類が多すぎます。');
        }

        const entityKey = await getEntityKeyForPlayFabId(playFabId);
        const [snapshot, sellContext] = await Promise.all([
            getInventorySnapshot(entityKey),
            getInventorySellContext(playFabId)
        ]);
        const inventoryItems = snapshot.items;
        const baseItem = findInventoryStack(inventoryItems, requestedBaseItemId, baseStackId);
        if (!baseItem || getInventoryStackAmount(baseItem) <= 0) {
            throw createInventoryRequestError('強化する装備が見つかりません。', 409);
        }

        const baseItemId = getInventoryItemId(baseItem);
        const baseCatalogData = normalizeCatalogDisplayData(baseItemId, catalogCache[baseItemId] || {});
        const baseEnhancement = buildEquipmentEnhancementDescriptor(baseItemId, baseCatalogData, baseItem);
        if (!baseEnhancement.eligible) {
            const message = baseEnhancement.capped
                ? 'この装備の能力は上限に達しています。'
                : 'この装備は強化対象ではありません。';
            throw createInventoryRequestError(message);
        }

        const materials = [];
        const materialAmountByItemId = new Map();
        let contribution = 0;
        for (const selection of materialSelections) {
            const materialItem = findInventoryStack(inventoryItems, selection.itemId, selection.stackId);
            if (!materialItem || getInventoryStackAmount(materialItem) < selection.amount) {
                throw createInventoryRequestError('素材の所持数が変わりました。再読み込みしてください。', 409);
            }
            const selectedItemId = getInventoryItemId(materialItem);
            if (selection.stackId === baseStackId && selectedItemId === baseItemId && getInventoryStackAmount(baseItem) - selection.amount < 1) {
                throw createInventoryRequestError('ベース個体そのものは素材にできません。');
            }
            const isBaseReference = selection.stackId === baseStackId && selectedItemId === baseItemId;
            if (isExactEquipmentStackReserved(selectedItemId, selection.stackId, sellContext) && !isBaseReference) {
                throw createInventoryRequestError('装備中の個体は素材にできません。');
            }

            const itemId = selectedItemId;
            const catalogData = normalizeCatalogDisplayData(itemId, catalogCache[itemId] || {});
            const enhancement = buildEquipmentEnhancementDescriptor(itemId, catalogData, materialItem);
            if (!enhancement.materialEligible || enhancement.family !== baseEnhancement.family || enhancement.category !== baseEnhancement.category) {
                throw createInventoryRequestError('ベースと同じ系統の装備だけを素材にできます。');
            }
            const stackContribution = enhancement.contribution * selection.amount;
            contribution += stackContribution;
            materialAmountByItemId.set(itemId, (materialAmountByItemId.get(itemId) || 0) + selection.amount);
            materials.push({
                item: materialItem,
                itemId,
                stackId: selection.stackId,
                amount: selection.amount,
                enhancement,
                contribution: stackContribution,
                name: catalogData.DisplayName || catalogData.Title || itemId
            });
        }

        for (const [itemId, selectedAmount] of materialAmountByItemId.entries()) {
            const ownedCount = getInventoryItemTotal(inventoryItems, itemId);
            const reservedCount = getReservedSellCount(itemId, sellContext);
            const requiredRemaining = itemId === baseItemId ? Math.max(1, reservedCount) : reservedCount;
            if (selectedAmount > Math.max(0, ownedCount - requiredRemaining)) {
                throw createInventoryRequestError('装備中または予約中の個体は素材にできません。');
            }
        }

        const targetBonus = baseEnhancement.storedBonus + contribution;
        const capacity = EQUIPMENT_ENHANCEMENT_MAX_STAT - baseEnhancement.baseValue;
        if (targetBonus > capacity) {
            throw createInventoryRequestError(`強化後の${baseEnhancement.primaryStat === 'Power' ? '攻撃力' : '防御力'}は99を超えられません。`);
        }

        return {
            entityKey,
            eTag: snapshot.eTag,
            inventoryItems,
            sellContext,
            baseItem,
            baseItemId,
            baseStackId,
            baseCatalogData,
            baseEnhancement,
            materials,
            contribution,
            targetBonus,
            targetValue: baseEnhancement.baseValue + targetBonus,
            equippedSlotKeys: getEnhancementEquippedSlotKeys(baseItem, sellContext)
        };
    }

    function buildEquipmentEnhancementPreview(context) {
        return {
            ok: true,
            base: {
                itemId: context.baseItemId,
                stackId: context.baseStackId,
                name: context.baseCatalogData.DisplayName || context.baseCatalogData.Title || context.baseItemId,
                category: context.baseEnhancement.category,
                family: context.baseEnhancement.family,
                primaryStat: context.baseEnhancement.primaryStat,
                baseValue: context.baseEnhancement.baseValue,
                currentValue: context.baseEnhancement.effectiveValue,
                currentBonus: context.baseEnhancement.storedBonus
            },
            materials: context.materials.map((material) => ({
                itemId: material.itemId,
                stackId: material.stackId,
                name: material.name,
                amount: material.amount,
                bonus: material.enhancement.storedBonus,
                rarity: material.enhancement.rarity,
                rarityContribution: material.enhancement.rarityContribution,
                contribution: material.contribution
            })),
            contribution: context.contribution,
            targetBonus: context.targetBonus,
            targetValue: context.targetValue,
            maxValue: EQUIPMENT_ENHANCEMENT_MAX_STAT
        };
    }

    async function writeEnhancementPendingMarker(playFabId, marker) {
        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: playFabId,
            Data: { [EQUIPMENT_ENHANCEMENT_PENDING_KEY]: marker ? JSON.stringify(marker) : null },
            Permission: 'Public'
        });
    }

    async function reconcilePendingEquipmentEnhancement(playFabId, inventoryItems = null) {
        const result = await getPlayerReadOnlyData(playFabId, [EQUIPMENT_ENHANCEMENT_PENDING_KEY]);
        const marker = parseJsonValue(result?.Data?.[EQUIPMENT_ENHANCEMENT_PENDING_KEY]?.Value, null);
        if (!marker?.targetStackId || !marker?.itemId) return false;
        const items = Array.isArray(inventoryItems)
            ? inventoryItems
            : await getAllInventoryItems(await getEntityKeyForPlayFabId(playFabId));
        const targetExists = items.some((item) => (
            getInventoryStackId(item) === String(marker.targetStackId)
            && getInventoryItemId(item) === String(marker.itemId)
            && getInventoryStackAmount(item) > 0
        ));
        const data = { [EQUIPMENT_ENHANCEMENT_PENDING_KEY]: null };
        if (targetExists) {
            const storedValue = buildStoredEquipmentValue(marker.itemId, marker.targetStackId);
            (Array.isArray(marker.slotKeys) ? marker.slotKeys : []).forEach((key) => {
                if (INVENTORY_SELL_EQUIPMENT_KEYS.includes(key)) data[key] = storedValue;
            });
        }
        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: playFabId,
            Data: data,
            Permission: 'Public'
        });
        return targetExists;
    }

    async function applyEquipmentEnhancement(playFabId, payload = {}) {
        const idempotencyId = String(payload.idempotencyId || '').trim();
        if (!/^[A-Za-z0-9:_-]{8,120}$/.test(idempotencyId)) {
            throw createInventoryRequestError('強化リクエストIDが不正です。');
        }
        const context = await buildEquipmentEnhancementContext(playFabId, payload);
        const baseAmount = getInventoryStackAmount(context.baseItem);
        const shouldSplitBase = baseAmount > 1;
        const targetStackId = shouldSplitBase ? randomUUID() : context.baseStackId;
        const targetDisplayProperties = buildEquipmentEnhancementDisplayProperties(
            context.baseItem,
            context.targetBonus
        );
        const subtractionByStack = new Map();
        context.materials.forEach((material) => {
            const key = getInventoryReferenceKey(material.itemId, material.stackId);
            subtractionByStack.set(key, {
                itemId: material.itemId,
                stackId: material.stackId,
                amount: (subtractionByStack.get(key)?.amount || 0) + material.amount
            });
        });
        if (shouldSplitBase) {
            const key = getInventoryReferenceKey(context.baseItemId, context.baseStackId);
            subtractionByStack.set(key, {
                itemId: context.baseItemId,
                stackId: context.baseStackId,
                amount: (subtractionByStack.get(key)?.amount || 0) + 1
            });
        }

        const operations = Array.from(subtractionByStack.values()).map((entry) => ({
            Subtract: {
                Item: { Id: entry.itemId, StackId: entry.stackId },
                Amount: entry.amount,
                DeleteEmptyStacks: true
            }
        }));
        if (shouldSplitBase) {
            operations.push({
                Add: {
                    Item: { Id: context.baseItemId, StackId: targetStackId },
                    Amount: 1,
                    NewStackValues: { DisplayProperties: targetDisplayProperties }
                }
            });
        } else {
            operations.push({
                Update: {
                    Item: {
                        Id: context.baseItemId,
                        StackId: context.baseStackId,
                        Amount: baseAmount,
                        DisplayProperties: targetDisplayProperties
                    }
                }
            });
        }

        const slotKeys = context.equippedSlotKeys;
        const marker = slotKeys.length ? {
            itemId: context.baseItemId,
            sourceStackId: context.baseStackId,
            targetStackId,
            slotKeys,
            createdAtMs: Date.now()
        } : null;
        if (marker) await writeEnhancementPendingMarker(playFabId, marker);
        try {
            await executeInventoryOperations(context.entityKey, operations, {
                eTag: context.eTag,
                idempotencyId: `equipment-enhancement:${playFabId}:${idempotencyId}`
            });
        } catch (error) {
            if (marker) await writeEnhancementPendingMarker(playFabId, null).catch(() => {});
            throw error;
        }

        let equipmentSyncPending = false;
        if (marker) {
            try {
                await reconcilePendingEquipmentEnhancement(playFabId);
            } catch (error) {
                equipmentSyncPending = true;
                console.warn('[equipment-enhancement] equipment sync pending:', error?.errorMessage || error?.message || error);
            }
        }
        return {
            ...buildEquipmentEnhancementPreview(context),
            targetStackId,
            equipmentSyncPending
        };
    }

    async function sellInventoryItems(playFabId, requestedItems) {
        const entityKey = await getEntityKeyForPlayFabId(playFabId);
        const inventoryItems = await getAllInventoryItems(entityKey);
        const sellContext = await getInventorySellContext(playFabId);
        const sellItems = normalizeSellRequestItems(requestedItems);
        if (!sellItems.length) {
            return { ok: false, status: 400, error: '売却するアイテムを選んでください。' };
        }

        const claimedByStackId = new Map();
        const claimedByItemId = new Map();
        for (const entry of sellItems.filter((item) => item.stackId)) {
            const sellableCount = getSellableInventoryItemCount(inventoryItems, entry.itemId, sellContext);
            const claimedItemAmount = (claimedByItemId.get(entry.itemId) || 0) + entry.amount;
            if (sellableCount < claimedItemAmount) {
                const itemData = normalizeCatalogDisplayData(entry.itemId, catalogCache[entry.itemId] || {});
                const itemName = itemData.DisplayName || itemData.Title || entry.itemId;
                return { ok: false, status: 400, error: `${itemName}は売却できる所持数が足りません。` };
            }
            const alreadyClaimed = claimedByStackId.get(entry.stackId) || 0;
            const requiredAmount = alreadyClaimed + entry.amount;
            const stack = inventoryItems.find((item) => (
                getInventoryItemId(item) === entry.itemId
                && getInventoryStackId(item) === entry.stackId
            ));
            if (!stack || getInventoryStackAmount(stack) < requiredAmount) {
                return { ok: false, status: 409, error: '売却する個体の所持数が変わりました。' };
            }
            if (isExactEquipmentStackReserved(entry.itemId, entry.stackId, sellContext)) {
                return { ok: false, status: 400, error: '装備中の個体は売却できません。' };
            }
            claimedByStackId.set(entry.stackId, requiredAmount);
            claimedByItemId.set(entry.itemId, claimedItemAmount);
        }

        for (const entry of sellItems.filter((item) => !item.stackId)) {
            const stackSelections = selectUnenhancedInventoryStacks(
                inventoryItems,
                entry.itemId,
                entry.amount,
                sellContext,
                claimedByStackId
            );
            if (!stackSelections) {
                const itemData = normalizeCatalogDisplayData(entry.itemId, catalogCache[entry.itemId] || {});
                const itemName = itemData.DisplayName || itemData.Title || entry.itemId;
                return { ok: false, status: 400, error: `${itemName}は売却できる所持数が足りません。` };
            }
            entry.stackSelections = stackSelections;
            stackSelections.forEach((selection) => {
                if (selection.stackId) {
                    claimedByStackId.set(
                        selection.stackId,
                        (claimedByStackId.get(selection.stackId) || 0) + selection.amount
                    );
                }
            });
        }

        const totalAmount = sellItems.reduce((sum, entry) => sum + entry.amount, 0);
        const totalGold = totalAmount * INVENTORY_SELL_UNIT_PRICE;
        const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        for (const entry of sellItems) {
            if (entry.stackId) {
                await subtractEconomyStack(playFabId, entry.itemId, entry.stackId, entry.amount, {
                    idempotencyId: `inventory-sell-${playFabId}-${entry.stackId}-${stamp}`
                });
            } else {
                for (const [index, selection] of entry.stackSelections.entries()) {
                    if (selection.stackId) {
                        await subtractEconomyStack(playFabId, entry.itemId, selection.stackId, selection.amount, {
                            idempotencyId: `inventory-sell-${playFabId}-${selection.stackId}-${stamp}`
                        });
                    } else {
                        await subtractEconomyItem(playFabId, entry.itemId, selection.amount, {
                            idempotencyId: `inventory-sell-${playFabId}-${entry.itemId}-${index}-${stamp}`
                        });
                    }
                }
            }
        }
        await addEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, totalGold, {
            idempotencyId: `inventory-sell-gold-${playFabId}-${stamp}`
        });
        const newBalance = await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE);
        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: playFabId,
            Statistics: [{ StatisticName: LEADERBOARD_NAME, Value: newBalance }]
        });

        return {
            ok: true,
            soldCount: totalAmount,
            totalGold,
            newBalance,
            items: sellItems
        };
    }

    function getBlackMarketErrorMessage(error) {
        return error?.errorMessage || error?.message || String(error || '');
    }

    function isBlackMarketApiError(error, code) {
        return error?.apiErrorInfo?.apiError === code || error?.errorCode === code;
    }

    async function listBlackMarketListings(playFabId) {
        const collection = getBlackMarketCollection();
        if (!collection) {
            return { ok: false, status: 503, error: '闇市は現在利用できません。' };
        }
        const pendingListings = await recoverBlackMarketListingsForUser(playFabId);
        const snap = await collection.where('status', '==', 'active').limit(100).get();
        const activeListings = (snap?.docs || [])
            .map(getListingSnapshotFromDoc)
            .filter((listing) => listing.status === 'active')
            .sort((a, b) => b.createdAtMs - a.createdAtMs);
        const listings = [...activeListings, ...(pendingListings || [])]
            .filter((listing, index, source) => source.findIndex((entry) => entry.listingId === listing.listingId) === index)
            .map((listing) => ({
                ...listing,
                isMine: String(listing.sellerPlayFabId || '') === String(playFabId || ''),
                isPending: listing.status !== 'active'
            }));
        const myActiveCount = await getBlackMarketActiveListingCount(playFabId);
        return { ok: true, listings, myActiveCount, maxActiveListings: BLACK_MARKET_MAX_ACTIVE_LISTINGS };
    }

    async function finalizeCreatingBlackMarketListing(listingId) {
        requireBlackMarketTransactions();
        const listingRef = getBlackMarketCollection().doc(listingId);
        return firestore.runTransaction(async (tx) => {
            const listingSnap = await tx.get(listingRef);
            if (!listingSnap?.exists) return null;
            const listing = getListingSnapshotFromDoc({ id: listingRef.id, data: () => listingSnap.data() });
            if (listing.status !== 'creating') return listing;
            if (!listing.itemDebited) throw new Error('出品アイテムの預かり処理が完了していません。');

            let ownershipRef = null;
            let ownershipSnap = null;
            if (listing.originTracked && listing.originPlayFabId && !listing.ownershipDebited) {
                ownershipRef = getBlackMarketOwnershipCollection().doc(makeBlackMarketOwnershipId(
                    listing.sellerPlayFabId,
                    listing.itemId,
                    listing.originPlayFabId
                ));
                ownershipSnap = await tx.get(ownershipRef);
            }

            const nowMs = Date.now();
            if (ownershipRef) {
                const current = ownershipSnap?.exists ? (ownershipSnap.data() || {}) : {};
                tx.set(ownershipRef, {
                    ownerPlayFabId: listing.sellerPlayFabId,
                    itemId: listing.itemId,
                    originPlayFabId: listing.originPlayFabId,
                    originDisplayName: listing.originDisplayName || listing.originPlayFabId,
                    count: Math.max(0, Math.floor(Number(current.count) || 0) - 1),
                    createdAtMs: Number(current.createdAtMs || nowMs) || nowMs,
                    updatedAtMs: nowMs
                }, { merge: true });
            }
            tx.update(listingRef, {
                status: 'active',
                ownershipDebited: true,
                settlementStatus: '',
                lastError: '',
                updatedAtMs: nowMs
            });
            return { ...listing, status: 'active', ownershipDebited: true, updatedAtMs: nowMs };
        });
    }

    async function resumeCreatingBlackMarketListing(listingId) {
        let listing = await getBlackMarketListing(listingId);
        if (!listing || listing.status !== 'creating') return listing;
        if (!listing.itemDebited) {
            try {
                if (listing.stackId) {
                    await subtractEconomyStack(listing.sellerPlayFabId, listing.itemId, listing.stackId, 1, {
                        idempotencyId: `black-market-list-item-${listing.listingId}`
                    });
                } else {
                    await subtractEconomyItem(listing.sellerPlayFabId, listing.itemId, 1, {
                        idempotencyId: `black-market-list-item-${listing.listingId}`
                    });
                }
                await patchBlackMarketListing(listing.listingId, { itemDebited: true, lastError: '' });
            } catch (error) {
                await patchBlackMarketListing(listing.listingId, {
                    settlementStatus: 'itemDebitPending',
                    lastError: getBlackMarketErrorMessage(error)
                }).catch(() => {});
                throw error;
            }
        }
        return finalizeCreatingBlackMarketListing(listing.listingId);
    }

    async function createBlackMarketListing(playFabId, itemId, stackId, priceValue) {
        const collection = getBlackMarketCollection();
        if (!collection || !getBlackMarketSlotsCollection()) {
            return { ok: false, status: 503, error: '闇市は現在利用できません。' };
        }
        const safeItemId = String(itemId || '').trim();
        const safeStackId = String(stackId || '').trim();
        const price = normalizeBlackMarketPrice(priceValue);
        if (!safeItemId || !price) {
            return { ok: false, status: 400, error: '価格は1-9999Gの整数で入力してください。' };
        }
        if (isCurrencyInventoryItem(safeItemId)) {
            return { ok: false, status: 400, error: 'Gは出品できません。' };
        }

        const entityKey = await getEntityKeyForPlayFabId(playFabId);
        const inventoryItems = await getAllInventoryItems(entityKey);
        const sellContext = await getInventorySellContext(playFabId);
        const sellableCount = getSellableInventoryItemCount(inventoryItems, safeItemId, sellContext);
        if (sellableCount < 1) {
            const itemData = normalizeCatalogDisplayData(safeItemId, catalogCache[safeItemId] || {});
            const itemName = itemData.DisplayName || itemData.Title || safeItemId;
            return { ok: false, status: 400, error: `${itemName}は出品できる所持数が足りません。` };
        }

        const selectedInventoryItem = safeStackId
            ? inventoryItems.find((item) => (
                getInventoryItemId(item) === safeItemId
                && getInventoryStackId(item) === safeStackId
                && getInventoryStackAmount(item) > 0
            ))
            : inventoryItems.find((item) => (
                getInventoryItemId(item) === safeItemId
                && getInventoryStackAmount(item) > 0
                && getEquipmentEnhancementBonus(item) <= 0
                && !isExactEquipmentStackReserved(safeItemId, getInventoryStackId(item), sellContext)
            ));
        if (!selectedInventoryItem) {
            return { ok: false, status: 400, error: '指定した商品個体は出品できません。' };
        }
        if (isExactEquipmentStackReserved(safeItemId, getInventoryStackId(selectedInventoryItem), sellContext)) {
            return { ok: false, status: 400, error: '装備中の個体は出品できません。' };
        }

        const snapshot = buildBlackMarketItemSnapshot(safeItemId, selectedInventoryItem);
        const origin = await pickBlackMarketOriginForListing(playFabId, safeItemId, snapshot.itemData);
        const sellerDisplayName = await getPlayerDisplayName(playFabId);
        const listingRef = collection.doc();
        const listing = {
            listingId: listingRef.id,
            sellerPlayFabId: playFabId,
            sellerDisplayName: sellerDisplayName || playFabId,
            itemId: safeItemId,
            stackId: getInventoryStackId(selectedInventoryItem),
            itemName: snapshot.itemName,
            description: snapshot.description,
            category: snapshot.category,
            itemData: snapshot.itemData,
            displayProperties: snapshot.displayProperties,
            price,
            status: 'creating',
            originPlayFabId: origin?.playFabId || '',
            originDisplayName: origin?.displayName || origin?.playFabId || '',
            originTracked: origin?.tracked === true,
            itemDebited: false,
            ownershipDebited: false,
            settlementStatus: 'itemDebitPending',
            lastError: ''
        };
        const slotIndex = await reserveBlackMarketListingSlot(listingRef, listing);
        if (!Number.isInteger(slotIndex)) {
            return { ok: false, status: 400, error: `闇市に出せるのは${BLACK_MARKET_MAX_ACTIVE_LISTINGS}個までです。` };
        }
        const activeListing = await resumeCreatingBlackMarketListing(listing.listingId);
        return {
            ok: true,
            listing: activeListing,
            myActiveCount: await getBlackMarketActiveListingCount(playFabId),
            maxActiveListings: BLACK_MARKET_MAX_ACTIVE_LISTINGS
        };
    }

    async function beginBlackMarketCancellation(playFabId, listingId) {
        requireBlackMarketTransactions();
        const listingRef = getBlackMarketCollection().doc(listingId);
        return firestore.runTransaction(async (tx) => {
            const snap = await tx.get(listingRef);
            if (!snap?.exists) return { ok: false, status: 404, error: '出品が見つかりません。' };
            const listing = getListingSnapshotFromDoc({ id: listingRef.id, data: () => snap.data() });
            if (listing.sellerPlayFabId !== playFabId) {
                return { ok: false, status: 403, error: '自分の出品だけキャンセルできます。' };
            }
            if (listing.status === 'cancelling') return { ok: true, listing };
            if (listing.status !== 'active') {
                return { ok: false, status: 400, error: 'この出品は操作できません。' };
            }
            const nowMs = Date.now();
            tx.update(listingRef, {
                status: 'cancelling',
                returnGranted: false,
                ownershipReturned: false,
                settlementStatus: 'returnPending',
                lastError: '',
                updatedAtMs: nowMs
            });
            return { ok: true, listing: { ...listing, status: 'cancelling' } };
        });
    }

    async function finalizeBlackMarketCancellation(listingId) {
        requireBlackMarketTransactions();
        const listingRef = getBlackMarketCollection().doc(listingId);
        return firestore.runTransaction(async (tx) => {
            const listingSnap = await tx.get(listingRef);
            if (!listingSnap?.exists) return null;
            const listing = getListingSnapshotFromDoc({ id: listingRef.id, data: () => listingSnap.data() });
            if (listing.status !== 'cancelling') return listing;
            if (!listing.returnGranted) throw new Error('出品アイテムの返却処理が完了していません。');

            let ownershipRef = null;
            let ownershipSnap = null;
            if (listing.originPlayFabId && !listing.ownershipReturned) {
                ownershipRef = getBlackMarketOwnershipCollection().doc(makeBlackMarketOwnershipId(
                    listing.sellerPlayFabId,
                    listing.itemId,
                    listing.originPlayFabId
                ));
                ownershipSnap = await tx.get(ownershipRef);
            }
            const slotRef = listing.slotIndex >= 0
                ? getBlackMarketSlotRef(listing.sellerPlayFabId, listing.slotIndex)
                : null;
            const slotSnap = slotRef ? await tx.get(slotRef) : null;
            const nowMs = Date.now();
            if (ownershipRef) {
                const current = ownershipSnap?.exists ? (ownershipSnap.data() || {}) : {};
                tx.set(ownershipRef, {
                    ownerPlayFabId: listing.sellerPlayFabId,
                    itemId: listing.itemId,
                    originPlayFabId: listing.originPlayFabId,
                    originDisplayName: listing.originDisplayName || listing.originPlayFabId,
                    count: Math.max(0, Math.floor(Number(current.count) || 0)) + 1,
                    createdAtMs: Number(current.createdAtMs || nowMs) || nowMs,
                    updatedAtMs: nowMs
                }, { merge: true });
            }
            tx.update(listingRef, {
                status: 'cancelled',
                ownershipReturned: true,
                cancelledAtMs: nowMs,
                settlementStatus: 'settled',
                lastError: '',
                updatedAtMs: nowMs
            });
            if (slotRef && String(slotSnap?.data()?.listingId || '') === listing.listingId) {
                tx.set(slotRef, { listingId: '', status: 'free', updatedAtMs: nowMs }, { merge: true });
            }
            return { ...listing, status: 'cancelled', ownershipReturned: true };
        });
    }

    async function resumeBlackMarketCancellation(listingId) {
        let listing = await getBlackMarketListing(listingId);
        if (!listing || listing.status !== 'cancelling') return listing;
        if (!listing.returnGranted) {
            try {
                if (Object.keys(listing.displayProperties || {}).length) {
                    await addEconomyStack(listing.sellerPlayFabId, listing.itemId, listing.displayProperties, {
                        idempotencyId: `black-market-cancel-return-${listing.listingId}`
                    });
                } else {
                    await addEconomyItem(listing.sellerPlayFabId, listing.itemId, 1, {
                        idempotencyId: `black-market-cancel-return-${listing.listingId}`
                    });
                }
                await patchBlackMarketListing(listing.listingId, { returnGranted: true, lastError: '' });
            } catch (error) {
                await patchBlackMarketListing(listing.listingId, {
                    settlementStatus: 'returnPending',
                    lastError: getBlackMarketErrorMessage(error)
                }).catch(() => {});
                throw error;
            }
        }
        return finalizeBlackMarketCancellation(listing.listingId);
    }

    async function cancelBlackMarketListing(playFabId, listingId) {
        const safeListingId = String(listingId || '').trim();
        if (!safeListingId) return { ok: false, status: 400, error: '出品が見つかりません。' };
        const started = await beginBlackMarketCancellation(playFabId, safeListingId);
        if (!started.ok) return started;
        await resumeBlackMarketCancellation(safeListingId);
        return { ok: true, listingId: safeListingId };
    }

    async function beginBlackMarketPurchase(playFabId, listingId) {
        requireBlackMarketTransactions();
        const listingRef = getBlackMarketCollection().doc(listingId);
        return firestore.runTransaction(async (tx) => {
            const snap = await tx.get(listingRef);
            if (!snap?.exists) return { ok: false, status: 404, error: '出品が見つかりません。' };
            const listing = getListingSnapshotFromDoc({ id: listingRef.id, data: () => snap.data() });
            if (listing.sellerPlayFabId === playFabId) {
                return { ok: false, status: 400, error: '自分の出品は購入できません。' };
            }
            if (listing.status === 'buying' && listing.buyerPlayFabId === playFabId) {
                return { ok: true, listing };
            }
            if (listing.status !== 'active') {
                return { ok: false, status: 400, error: 'この出品は購入できません。' };
            }
            const nowMs = Date.now();
            const buyingListing = {
                ...listing,
                status: 'buying',
                buyerPlayFabId: playFabId,
                buyerCharged: false,
                buyerItemGranted: false,
                buyerOwnershipGranted: false,
                buyerRefunded: false,
                sellerPaid: false,
                settlementStatus: 'chargePending',
                lastError: '',
                updatedAtMs: nowMs
            };
            tx.update(listingRef, {
                status: buyingListing.status,
                buyerPlayFabId: buyingListing.buyerPlayFabId,
                buyerCharged: false,
                buyerItemGranted: false,
                buyerOwnershipGranted: false,
                buyerRefunded: false,
                sellerPaid: false,
                settlementStatus: buyingListing.settlementStatus,
                lastError: '',
                updatedAtMs: nowMs
            });
            return { ok: true, listing: buyingListing };
        });
    }

    async function resetBlackMarketListingAfterRefund(listingId) {
        requireBlackMarketTransactions();
        const listingRef = getBlackMarketCollection().doc(listingId);
        return firestore.runTransaction(async (tx) => {
            const snap = await tx.get(listingRef);
            if (!snap?.exists) return null;
            const listing = getListingSnapshotFromDoc({ id: listingRef.id, data: () => snap.data() });
            if (listing.status !== 'buying') return listing;
            if (listing.buyerCharged && !listing.buyerRefunded) {
                throw new Error('購入者への返金処理が完了していません。');
            }
            const nowMs = Date.now();
            tx.update(listingRef, {
                status: 'active',
                buyerPlayFabId: '',
                buyerCharged: false,
                buyerItemGranted: false,
                buyerOwnershipGranted: false,
                buyerRefunded: false,
                sellerPaid: false,
                settlementStatus: '',
                lastError: '',
                updatedAtMs: nowMs
            });
            return { ...listing, status: 'active', buyerPlayFabId: '' };
        });
    }

    async function refundBlackMarketBuyer(listing) {
        if (listing.buyerCharged && !listing.buyerRefunded) {
            await addEconomyItem(listing.buyerPlayFabId, VIRTUAL_CURRENCY_CODE, listing.price, {
                idempotencyId: `black-market-buy-refund-${listing.listingId}-${listing.buyerPlayFabId}`
            });
            await patchBlackMarketListing(listing.listingId, { buyerRefunded: true, lastError: '' });
        }
        return resetBlackMarketListingAfterRefund(listing.listingId);
    }

    async function grantBlackMarketBuyerOwnership(listingId) {
        requireBlackMarketTransactions();
        const listingRef = getBlackMarketCollection().doc(listingId);
        return firestore.runTransaction(async (tx) => {
            const listingSnap = await tx.get(listingRef);
            if (!listingSnap?.exists) return null;
            const listing = getListingSnapshotFromDoc({ id: listingRef.id, data: () => listingSnap.data() });
            if (listing.status !== 'buying' || listing.buyerOwnershipGranted) return listing;
            let ownershipRef = null;
            let ownershipSnap = null;
            if (listing.originPlayFabId) {
                ownershipRef = getBlackMarketOwnershipCollection().doc(makeBlackMarketOwnershipId(
                    listing.buyerPlayFabId,
                    listing.itemId,
                    listing.originPlayFabId
                ));
                ownershipSnap = await tx.get(ownershipRef);
            }
            const nowMs = Date.now();
            if (ownershipRef) {
                const current = ownershipSnap?.exists ? (ownershipSnap.data() || {}) : {};
                tx.set(ownershipRef, {
                    ownerPlayFabId: listing.buyerPlayFabId,
                    itemId: listing.itemId,
                    originPlayFabId: listing.originPlayFabId,
                    originDisplayName: listing.originDisplayName || listing.originPlayFabId,
                    count: Math.max(0, Math.floor(Number(current.count) || 0)) + 1,
                    createdAtMs: Number(current.createdAtMs || nowMs) || nowMs,
                    updatedAtMs: nowMs
                }, { merge: true });
            }
            tx.update(listingRef, {
                buyerOwnershipGranted: true,
                settlementStatus: 'sellerPaymentPending',
                updatedAtMs: nowMs
            });
            return { ...listing, buyerOwnershipGranted: true };
        });
    }

    async function finalizeBlackMarketPurchase(listingId) {
        requireBlackMarketTransactions();
        const listingRef = getBlackMarketCollection().doc(listingId);
        return firestore.runTransaction(async (tx) => {
            const listingSnap = await tx.get(listingRef);
            if (!listingSnap?.exists) return null;
            const listing = getListingSnapshotFromDoc({ id: listingRef.id, data: () => listingSnap.data() });
            if (listing.status !== 'buying') return listing;
            if (!listing.buyerItemGranted || !listing.buyerOwnershipGranted || !listing.sellerPaid) {
                throw new Error('闇市の精算処理が完了していません。');
            }
            const slotRef = listing.slotIndex >= 0
                ? getBlackMarketSlotRef(listing.sellerPlayFabId, listing.slotIndex)
                : null;
            const slotSnap = slotRef ? await tx.get(slotRef) : null;
            const nowMs = Date.now();
            tx.update(listingRef, {
                status: 'sold',
                soldAtMs: nowMs,
                settlementStatus: 'settled',
                lastError: '',
                updatedAtMs: nowMs
            });
            if (slotRef && String(slotSnap?.data()?.listingId || '') === listing.listingId) {
                tx.set(slotRef, { listingId: '', status: 'free', updatedAtMs: nowMs }, { merge: true });
            }
            return { ...listing, status: 'sold', settlementStatus: 'settled' };
        });
    }

    async function resumeBlackMarketPurchase(listingId) {
        let listing = await getBlackMarketListing(listingId);
        if (!listing || listing.status !== 'buying') return { ok: false, status: 400, error: 'この出品は購入できません。' };
        if (listing.settlementStatus === 'refundPending') {
            try {
                await refundBlackMarketBuyer(listing);
                return { ok: false, status: 500, error: '購入処理に失敗したため、Gを返却しました。' };
            } catch (error) {
                await patchBlackMarketListing(listing.listingId, { lastError: getBlackMarketErrorMessage(error) }).catch(() => {});
                throw error;
            }
        }

        if (!listing.buyerCharged) {
            try {
                await subtractEconomyItem(listing.buyerPlayFabId, VIRTUAL_CURRENCY_CODE, listing.price, {
                    idempotencyId: `black-market-buy-pay-${listing.listingId}-${listing.buyerPlayFabId}`
                });
                await patchBlackMarketListing(listing.listingId, {
                    buyerCharged: true,
                    settlementStatus: 'itemGrantPending',
                    lastError: ''
                });
            } catch (error) {
                if (isBlackMarketApiError(error, 'InsufficientFunds')) {
                    await resetBlackMarketListingAfterRefund(listing.listingId);
                    return { ok: false, status: 400, error: 'Gが足りません。' };
                }
                await patchBlackMarketListing(listing.listingId, {
                    settlementStatus: 'chargePending',
                    lastError: getBlackMarketErrorMessage(error)
                }).catch(() => {});
                throw error;
            }
            listing = await getBlackMarketListing(listing.listingId);
        }

        if (!listing.buyerItemGranted) {
            try {
                if (Object.keys(listing.displayProperties || {}).length) {
                    await addEconomyStack(listing.buyerPlayFabId, listing.itemId, listing.displayProperties, {
                        idempotencyId: `black-market-buy-item-${listing.listingId}-${listing.buyerPlayFabId}`
                    });
                } else {
                    await addEconomyItem(listing.buyerPlayFabId, listing.itemId, 1, {
                        idempotencyId: `black-market-buy-item-${listing.listingId}-${listing.buyerPlayFabId}`
                    });
                }
                await patchBlackMarketListing(listing.listingId, {
                    buyerItemGranted: true,
                    settlementStatus: 'ownershipPending',
                    lastError: ''
                });
            } catch (error) {
                await patchBlackMarketListing(listing.listingId, {
                    settlementStatus: 'refundPending',
                    lastError: getBlackMarketErrorMessage(error)
                }).catch(() => {});
                const refundListing = await getBlackMarketListing(listing.listingId);
                try {
                    await refundBlackMarketBuyer(refundListing || listing);
                    return { ok: false, status: 500, error: '商品の受け渡しに失敗したため、Gを返却しました。' };
                } catch (refundError) {
                    await patchBlackMarketListing(listing.listingId, {
                        settlementStatus: 'refundPending',
                        lastError: getBlackMarketErrorMessage(refundError)
                    }).catch(() => {});
                    throw refundError;
                }
            }
            listing = await getBlackMarketListing(listing.listingId);
        }

        try {
            if (!listing.buyerOwnershipGranted) {
                await grantBlackMarketBuyerOwnership(listing.listingId);
                listing = await getBlackMarketListing(listing.listingId);
            }
            if (!listing.sellerPaid) {
                await addEconomyItem(listing.sellerPlayFabId, VIRTUAL_CURRENCY_CODE, listing.price, {
                    idempotencyId: `black-market-buy-seller-gold-${listing.listingId}`
                });
                await patchBlackMarketListing(listing.listingId, {
                    sellerPaid: true,
                    settlementStatus: 'finalizing',
                    lastError: ''
                });
            }
            await finalizeBlackMarketPurchase(listing.listingId);
            const newBalance = await getCurrencyBalance(listing.buyerPlayFabId, VIRTUAL_CURRENCY_CODE).catch(() => null);
            return { ok: true, listingId: listing.listingId, newBalance };
        } catch (error) {
            await patchBlackMarketListing(listing.listingId, {
                settlementStatus: 'settlementFailed',
                lastError: getBlackMarketErrorMessage(error)
            }).catch(() => {});
            throw error;
        }
    }

    async function buyBlackMarketListing(playFabId, listingId) {
        const safeListingId = String(listingId || '').trim();
        if (!safeListingId) return { ok: false, status: 400, error: '出品が見つかりません。' };
        const started = await beginBlackMarketPurchase(playFabId, safeListingId);
        if (!started.ok) return started;
        return resumeBlackMarketPurchase(safeListingId);
    }

    async function recoverBlackMarketListingsForUser(playFabId) {
        const collection = getBlackMarketCollection();
        if (!collection) return [];
        const recoverable = new Map();
        const pendingListings = [];
        const sellerSnap = await collection.where('sellerPlayFabId', '==', playFabId).limit(200).get();
        const buyerSnap = await collection.where('buyerPlayFabId', '==', playFabId).limit(200).get();
        [...(sellerSnap?.docs || []), ...(buyerSnap?.docs || [])].forEach((doc) => {
            const listing = getListingSnapshotFromDoc(doc);
            if (['creating', 'cancelling', 'buying'].includes(listing.status)) {
                recoverable.set(listing.listingId, listing);
            }
        });
        for (const listing of recoverable.values()) {
            try {
                if (listing.status === 'creating' && listing.sellerPlayFabId === playFabId) {
                    await resumeCreatingBlackMarketListing(listing.listingId);
                } else if (listing.status === 'cancelling' && listing.sellerPlayFabId === playFabId) {
                    await resumeBlackMarketCancellation(listing.listingId);
                } else if (listing.status === 'buying') {
                    await resumeBlackMarketPurchase(listing.listingId);
                }
            } catch (error) {
                console.error('[black-market] recovery pending:', listing.listingId, getBlackMarketErrorMessage(error));
            }
            const refreshed = await getBlackMarketListing(listing.listingId).catch(() => null);
            if (refreshed && ['creating', 'cancelling', 'buying'].includes(refreshed.status)) {
                pendingListings.push(refreshed);
            }
        }
        return pendingListings;
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

    app.post('/api/equipment-enhancement/preview', async (req, res) => {
        let { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;
        try {
            const context = await buildEquipmentEnhancementContext(playFabId, req.body || {});
            return res.json(buildEquipmentEnhancementPreview(context));
        } catch (error) {
            console.error('[equipment-enhancement/preview] error:', error?.errorMessage || error?.message || error);
            const statusCode = Number.isInteger(error?.status) ? error.status : 500;
            return res.status(statusCode).json({
                error: statusCode < 500 ? error.message : '強化内容の確認に失敗しました。',
                details: error?.errorMessage || error?.message || String(error)
            });
        }
    });

    app.post('/api/equipment-enhancement/apply', async (req, res) => {
        let { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;
        try {
            return res.json(await applyEquipmentEnhancement(playFabId, req.body || {}));
        } catch (error) {
            console.error('[equipment-enhancement/apply] error:', error?.errorMessage || error?.message || error);
            const isConflict = ['ETagMismatch', 'ConcurrentWrite', 'PreconditionFailed'].includes(error?.apiErrorInfo?.apiError)
                || /etag|concurrent|precondition/i.test(String(error?.errorMessage || error?.message || ''));
            const statusCode = Number.isInteger(error?.status) ? error.status : (isConflict ? 409 : 500);
            return res.status(statusCode).json({
                error: Number.isInteger(error?.status)
                    ? error.message
                    : (isConflict ? '持ち物が更新されました。再読み込みしてやり直してください。' : '装備の強化に失敗しました。'),
                details: error?.errorMessage || error?.message || String(error)
            });
        }
    });

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
            await reconcilePendingEquipmentEnhancement(playFabId, items).catch((error) => {
                console.warn('[equipment-enhancement] pending equipment reconciliation failed:', error?.errorMessage || error?.message || error);
            });
            const itemMap = new Map();
            items.forEach((item) => {
                const itemId = item?.Id || item?.ItemId;
                if (!itemId || getCurrencyIdFromItem(item, catalogCache)) return;
                const baseCatalogData = normalizeCatalogDisplayData(itemId, catalogCache[itemId] || {});
                const enhanced = applyEquipmentEnhancementToCatalogData(itemId, baseCatalogData, item);
                const catalogData = enhanced.catalogData;
                const enhancement = enhanced.enhancement;
                const name = catalogData.DisplayName || catalogData.Title || itemId;
                const amount = getInventoryStackAmount(item);
                if (amount <= 0) return;
                const stackId = getInventoryStackId(item);
                const isEnhancedStack = enhancement.storedBonus > 0 && !!stackId;
                const mapKey = isEnhancedStack ? `${itemId}::${stackId}` : itemId;
                const stackRecord = {
                    stackId,
                    count: amount,
                    enhancement: {
                        bonus: enhancement.storedBonus,
                        rarity: enhancement.rarity,
                        rarityContribution: enhancement.rarityContribution,
                        contribution: enhancement.contribution
                    }
                };
                if (itemMap.has(mapKey)) {
                    const existing = itemMap.get(mapKey);
                    existing.count += amount;
                    if (stackId) existing.instances.push(stackId);
                    if (stackId) existing.stacks.push(stackRecord);
                } else {
                    itemMap.set(mapKey, {
                        name,
                        count: amount,
                        itemId,
                        description: catalogData.Description || '',
                        stackId: isEnhancedStack ? stackId : '',
                        instances: stackId ? [stackId] : [],
                        stacks: stackId ? [stackRecord] : [],
                        customData: catalogData,
                        enhancement,
                        materialEligible: enhancement.materialEligible
                    });
                }
            });
            const inventoryList = Array.from(itemMap.values());
            const virtualCurrency = getVirtualCurrencyMap(items);
            const itemIds = inventoryList.map((item) => item.itemId).filter(Boolean);
            const blackMarketOrigins = await buildBlackMarketOriginSummaries(playFabId, itemIds).catch((error) => {
                console.warn('[black-market] origin summary failed:', error?.errorMessage || error?.message || error);
                return {};
            });
            const blackMarketMyActiveCount = await getBlackMarketActiveListingCount(playFabId).catch((error) => {
                console.warn('[black-market] active count failed:', error?.errorMessage || error?.message || error);
                return 0;
            });
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
                blackMarketOrigins,
                blackMarketMyActiveCount,
                blackMarketMaxActiveListings: BLACK_MARKET_MAX_ACTIVE_LISTINGS
            });
        } catch (error) {
            console.error('[インベントリ取得] 取得失敗', error.errorMessage || error.message || error);
            res.status(500).json({ error: 'インベントリ取得に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // 装備設定
    app.post('/api/equip-item', async (req, res) => {
        let { playFabId, itemId, stackId, fromSlot, slot } = req.body;
        if (!playFabId || !slot) return res.status(400).json({ error: 'IDまたはスロット情報がありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;
        stackId = String(stackId || '').trim();
        fromSlot = String(fromSlot || '').trim();
        const releaseEquipmentMutation = await acquireEquipmentMutationLock(playFabId);

        try {

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
        const sourceDataKey = fromSlot ? validSlots[fromSlot] : '';
        if (fromSlot && (
            !sourceDataKey
            || !['RightHand', 'LeftHand'].includes(slot)
            || !['RightHand', 'LeftHand'].includes(fromSlot)
            || fromSlot === slot
        )) {
            return res.status(400).json({ error: '装備移動元が不正です。' });
        }

        const dataToUpdate = {};

        if (itemId) {
            if (stackId) {
                const entityKey = await getEntityKeyForPlayFabId(playFabId);
                const inventoryItems = await getAllInventoryItems(entityKey);
                const ownedStack = inventoryItems.find((entry) => (
                    getInventoryStackId(entry) === stackId
                    && getInventoryItemId(entry) === String(itemId)
                    && getInventoryStackAmount(entry) > 0
                ));
                if (!ownedStack) {
                    return res.status(400).json({ error: '指定した装備個体を所持していません。' });
                }
            }
            const itemData = normalizeCatalogDisplayData(itemId, catalogCache[itemId]);
            const normalizedCategory = String(itemData?.Category || '').trim();
            const isTwoHandedWeapon = isTwoHandedCatalogWeapon(itemId, itemData);
            if (isTarotEquipmentSlot(slot)) {
                if (!itemData || !canEquipTarotItemToSlot(itemData, slot)) {
                    return res.status(400).json({ error: 'このカードはその枠に装備できません。' });
                }
            } else if (slot === 'RightHand') {
                if (!['Weapon', 'Shield'].includes(normalizedCategory)) {
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
            let currentHandData = null;
            if (slot === 'RightHand' || slot === 'LeftHand') {
                const currentHandResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                    PlayFabId: playFabId,
                    Keys: ['Equipped_RightHand', 'Equipped_LeftHand']
                });
                currentHandData = currentHandResult?.Data || {};
            }
            const movingBetweenHands = !!fromSlot;
            if (movingBetweenHands) {
                const sourceValue = currentHandData?.[sourceDataKey]?.Value || null;
                const sourceItemId = getStoredEquipmentItemId(sourceValue);
                const sourceStackId = getStoredEquipmentStackId(sourceValue);
                const sourceMatches = sourceItemId === itemId
                    && (!stackId || !sourceStackId || sourceStackId === stackId);
                if (!sourceMatches) {
                    return res.status(400).json({ error: '移動元に指定した装備がありません。' });
                }
            }
            const canEquipInEitherHand = ['Weapon', 'Shield'].includes(normalizedCategory) && !isTwoHandedWeapon;
            if (canEquipInEitherHand && (slot === 'RightHand' || slot === 'LeftHand')) {
                const oppositeKey = slot === 'RightHand' ? 'Equipped_LeftHand' : 'Equipped_RightHand';
                const oppositeRawValue = currentHandData?.[oppositeKey]?.Value || null;
                const oppositeItemId = getStoredEquipmentItemId(oppositeRawValue);
                const oppositeStackId = getStoredEquipmentStackId(oppositeRawValue);
                const sameItem = !!oppositeItemId && oppositeItemId === itemId;
                const sameSpecificStack = sameItem
                    && stackId
                    && stackId !== 'default'
                    && oppositeStackId === stackId;
                const movingToOppositeHand = !!fromSlot && sourceDataKey === oppositeKey;
                if (sameSpecificStack && !movingToOppositeHand) {
                    return res.status(400).json({ error: '同じ装備個体を両手に装備することはできません。' });
                }
                if (sameItem && !movingToOppositeHand) {
                    const ownedCount = await getOwnedInventoryItemCount(playFabId, itemId);
                    const hasDistinctExactStacks = !!stackId
                        && stackId !== 'default'
                        && !!oppositeStackId
                        && oppositeStackId !== 'default'
                        && stackId !== oppositeStackId;
                    if (!hasDistinctExactStacks && ownedCount < 2) {
                        return res.status(400).json({
                            error: normalizedCategory === 'Shield'
                                ? '同じ盾を両手に装備するには2個必要です。'
                                : '同じ片手武器を両手に装備するには2本必要です。'
                        });
                    }
                }
            }
            const storedEquipmentValue = buildStoredEquipmentValue(itemId, stackId);
            dataToUpdate[dataKey] = storedEquipmentValue;
            if (sourceDataKey) dataToUpdate[sourceDataKey] = null;
            if (itemData && isTwoHandedWeapon) {
                console.log(`[装備] 両手武器 (${itemId}) を装備します`);
                dataToUpdate['Equipped_RightHand'] = storedEquipmentValue;
                dataToUpdate['Equipped_LeftHand'] = null;
            } else if (slot === 'LeftHand') {
                const currentRightHandValue = currentHandData?.Equipped_RightHand?.Value || null;
                const currentRightHandId = getStoredEquipmentItemId(currentRightHandValue);
                const currentRightHandData = currentRightHandId
                    ? normalizeCatalogDisplayData(currentRightHandId, catalogCache[currentRightHandId])
                    : null;
                if (isTwoHandedCatalogWeapon(currentRightHandId, currentRightHandData)) {
                    dataToUpdate['Equipped_RightHand'] = null;
                }
            }
        } else {
            const currentEquipmentResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, { PlayFabId: playFabId, Keys: ["Equipped_RightHand"] });
            const currentRightHandValue = currentEquipmentResult.Data && currentEquipmentResult.Data.Equipped_RightHand ? currentEquipmentResult.Data.Equipped_RightHand.Value : null;
            const currentRightHandId = getStoredEquipmentItemId(currentRightHandValue);
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
            res.json({ status: 'success', equippedItem: itemId, stackId: stackId || null });
        } catch (error) {
            console.error('[装備] エラー', error.errorMessage);
            res.status(500).json({ error: '装備の更新に失敗しました。', details: error.errorMessage });
        }
        } finally {
            releaseEquipmentMutation();
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
            await reconcilePendingEquipmentEnhancement(playFabId).catch((error) => {
                console.warn('[equipment-enhancement] equipment reconciliation failed:', error?.errorMessage || error?.message || error);
            });
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
                'PersonalityDestinyV2',
                TAROT_KINGDOM_PET_DATA_KEY,
                'Equipped_RightHand',
                'Equipped_LeftHand',
                'Equipped_Armor',
                'Equipped_Accessory'
            ];
            const [profileResult, readOnlyResult, statsResult, targetInventoryItems] = await Promise.all([
                promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                    PlayFabId: targetId,
                    ProfileConstraints: { ShowDisplayName: true, ShowAvatarUrl: true }
                }),
                getPlayerReadOnlyData(targetId, readOnlyKeys),
                promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: targetId }),
                getEntityKeyForPlayFabId(targetId)
                    .then((entityKey) => getAllInventoryItems(entityKey))
                    .catch(() => [])
            ]);
            const readOnlyData = readOnlyResult?.Data || {};
            const stats = buildStatsMapFromStatistics(statsResult?.Statistics || []);
            Object.assign(stats, applyDerivedPlayerLevelToStats(stats).stats);
            const isOwnProfile = targetId === String(playFabId || '').trim();
            const equipment = {};
            const assignEquipmentValue = (slotName, rawValue) => {
                const parsed = parseStoredEquipmentValue(rawValue);
                if (parsed === null || parsed === undefined || parsed === '') return;
                equipment[slotName] = buildPublicEquipmentItem(parsed, targetInventoryItems) || parsed;
            };
            assignEquipmentValue('RightHand', readOnlyData?.Equipped_RightHand?.Value || null);
            assignEquipmentValue('LeftHand', readOnlyData?.Equipped_LeftHand?.Value || null);
            assignEquipmentValue('Armor', readOnlyData?.Equipped_Armor?.Value || null);
            assignEquipmentValue('Accessory', readOnlyData?.Equipped_Accessory?.Value || null);

            const avatarBase = buildAvatarBaseFromReadOnly(readOnlyData, stats);
            const publicStats = {
                Level: Math.max(1, Math.floor(Number(stats.Level || avatarBase.level || 1) || 1)),
                HP: Math.max(0, Math.floor(Number(stats.HP || 0) || 0)),
                MaxHP: Math.max(1, Math.floor(Number(stats.MaxHP || 1) || 1)),
                ちから: Math.max(0, Math.floor(Number(stats.ちから || 0) || 0)),
                みのまもり: Math.max(0, Math.floor(Number(stats.みのまもり || 0) || 0)),
                すばやさ: Math.max(0, Math.floor(Number(stats.すばやさ || 0) || 0)),
                かしこさ: Math.max(0, Math.floor(Number(stats.かしこさ || 0) || 0)),
                たいりょく: Math.max(0, Math.floor(Number(stats.たいりょく || 0) || 0))
            };
            const destinyProfile = getDestinyProfile(parseJsonValue(
                readOnlyData?.PersonalityDestinyV2?.Value,
                null
            ), { detail: isOwnProfile ? 'full' : 'summary' });
            const currentPet = buildTarotKingdomPetPublicRecord(
                normalizeTarotKingdomPetState(readOnlyData?.[TAROT_KINGDOM_PET_DATA_KEY]?.Value).currentPet
            );
            const shipDeps = {
                promisifyPlayFab,
                PlayFabServer,
                PlayFabGroups,
                PlayFabData,
                firestore,
                getEntityKeyFromPlayFabId: getEntityKeyForPlayFabId
            };
            const shipContext = await resolveGuildShipContext(targetId, shipDeps).catch(() => null);
            const shipOwnerPlayFabId = String(shipContext?.shipOwnerPlayFabId || targetId).trim() || targetId;
            const basePlayerShip = await resourceStorage.getPlayerShipProfile(
                shipOwnerPlayFabId,
                { promisifyPlayFab, PlayFabServer },
                { persist: false }
            ).catch(() => null);
            let guildShipData = null;
            if (shipContext?.isGuildShip && shipContext.guildShipId && firestore?.collection) {
                const guildShipSnap = await firestore.collection('ships').doc(String(shipContext.guildShipId)).get().catch(() => null);
                guildShipData = guildShipSnap?.exists ? (guildShipSnap.data() || null) : null;
            }
            const playerShip = buildPublicProfileShip(basePlayerShip, shipContext, guildShipData);
            if (playerShip) {
                const majorArcanaItemIds = resourceStorage.normalizeMajorArcanaItemIds(
                    playerShip.majorArcanaItemIds || [],
                    playerShip.majorArcanaSlotLimit || playerShip.stage || 1
                );
                playerShip.majorArcanaItemIds = majorArcanaItemIds;
                playerShip.majorArcanaGear = majorArcanaItemIds
                    .map((itemId, index) => ({
                        itemId,
                        slotIndex: index,
                        shipGear: buildMajorArcanaShipGearView(itemId)
                    }))
                    .filter((entry) => entry.shipGear);
            }
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
                    destinyProfile,
                    currentPet,
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
            const resolvedStats = targetStat === 'HP'
                ? applyDerivedPlayerLevelToStats(currentStats).stats
                : currentStats;
            const currentValue = resolvedStats[targetStat] || 0;
            const maxValue = resolvedStats[maxStat] || currentValue;

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
        if (!playFabId || !itemId) {
            return res.status(400).json({ error: 'IDまたはアイテム情報が不足しています。' });
        }
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

        console.log(`[アイテム売却] ${playFabId} がアイテム (Instance: ${itemInstanceId}) を売却します...`);

        try {
            const itemData = normalizeCatalogDisplayData(itemId, catalogCache[itemId] || {});
            const result = await sellInventoryItems(playFabId, [{ itemId, stackId: itemInstanceId, amount: 1 }]);
            if (!result.ok) {
                return res.status(result.status || 400).json({ error: result.error || 'このアイテムは売却できません。' });
            }

            res.json({
                status: 'success',
                message: `${itemData.DisplayName || itemData.Title || itemId}を${INVENTORY_SELL_UNIT_PRICE}Gで売却しました。`,
                soldCount: result.soldCount,
                totalGold: result.totalGold,
                newBalance: result.newBalance
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

    app.post('/api/sell-items', async (req, res) => {
        let { playFabId, items } = req.body || {};
        if (!playFabId || !Array.isArray(items)) {
            return res.status(400).json({ error: '売却するアイテム情報が不足しています。' });
        }
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

        console.log(`[アイテム一括売却] ${playFabId} が ${items.length} 種類を売却します...`);

        try {
            const result = await sellInventoryItems(playFabId, items);
            if (!result.ok) {
                return res.status(result.status || 400).json({ error: result.error || 'アイテムを売却できません。' });
            }
            return res.json({
                status: 'success',
                message: `${result.soldCount}個を${result.totalGold}Gで売却しました。`,
                soldCount: result.soldCount,
                totalGold: result.totalGold,
                newBalance: result.newBalance,
                items: result.items
            });
        } catch (error) {
            console.error('[アイテム一括売却] エラー', error.errorMessage || error.message, error.apiErrorInfo);

            if (error.apiErrorInfo && error.apiErrorInfo.apiError === 'ItemNotFound') {
                return res.status(400).json({ error: '指定されたアイテムが見つかりません。' });
            }
            return res.status(500).json({
                error: 'アイテムの売却に失敗しました。',
                details: error.errorMessage || 'サーバーで予期しないエラーが発生しました。'
            });
        }
    });

    // ガチャ
    app.post('/api/black-market/list', async (req, res) => {
        let { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab IDがありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;
        try {
            const result = await listBlackMarketListings(playFabId);
            if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
            return res.json({ status: 'success', ...result });
        } catch (error) {
            console.error('[black-market/list] error:', error?.errorMessage || error?.message || error);
            return res.status(500).json({ error: '闇市の一覧取得に失敗しました。', details: error?.errorMessage || error?.message });
        }
    });

    app.post('/api/black-market/origins', async (req, res) => {
        let { playFabId, itemIds } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab IDがありません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;
        try {
            const origins = await buildBlackMarketOriginSummaries(playFabId, itemIds);
            return res.json({ status: 'success', origins });
        } catch (error) {
            console.error('[black-market/origins] error:', error?.errorMessage || error?.message || error);
            return res.status(500).json({ error: '初代所有者の取得に失敗しました。', details: error?.errorMessage || error?.message });
        }
    });

    app.post('/api/black-market/create', async (req, res) => {
        let { playFabId, itemId, stackId, price } = req.body || {};
        if (!playFabId || !itemId) return res.status(400).json({ error: '出品するアイテムを選んでください。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;
        try {
            const result = await createBlackMarketListing(playFabId, itemId, stackId, price);
            if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
            return res.json({ status: 'success', message: '闇市に出品しました。', ...result });
        } catch (error) {
            console.error('[black-market/create] error:', error?.errorMessage || error?.message || error);
            if (error?.apiErrorInfo?.apiError === 'ItemNotFound') {
                return res.status(400).json({ error: '出品するアイテムが見つかりません。' });
            }
            return res.status(error?.status || 500).json({ error: '闇市への出品に失敗しました。', details: error?.errorMessage || error?.message });
        }
    });

    app.post('/api/black-market/cancel', async (req, res) => {
        let { playFabId, listingId } = req.body || {};
        if (!playFabId || !listingId) return res.status(400).json({ error: '出品が見つかりません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;
        try {
            const result = await cancelBlackMarketListing(playFabId, listingId);
            if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
            return res.json({ status: 'success', message: '出品を取り消しました。', ...result });
        } catch (error) {
            console.error('[black-market/cancel] error:', error?.errorMessage || error?.message || error);
            return res.status(error?.status || 500).json({ error: '出品の取り消しに失敗しました。', details: error?.errorMessage || error?.message });
        }
    });

    app.post('/api/black-market/buy', async (req, res) => {
        let { playFabId, listingId } = req.body || {};
        if (!playFabId || !listingId) return res.status(400).json({ error: '購入する出品が見つかりません。' });
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;
        try {
            const result = await buyBlackMarketListing(playFabId, listingId);
            if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
            return res.json({ status: 'success', message: '闇市で購入しました。', ...result });
        } catch (error) {
            console.error('[black-market/buy] error:', error?.errorMessage || error?.message || error);
            if (error?.apiErrorInfo?.apiError === 'InsufficientFunds') {
                return res.status(400).json({ error: 'Gが足りません。' });
            }
            return res.status(error?.status || 500).json({ error: '闇市での購入に失敗しました。', details: error?.errorMessage || error?.message });
        }
    });

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
    buildPublicProfileShip,
    initializeInventoryRoutes
};
