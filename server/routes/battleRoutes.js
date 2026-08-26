// battle.js (v42 - 共通関数をexportsするように変更)
require('dotenv').config();
const economy = require('../economy');
const { getEntityKeyFromPlayFabId, withTitleEntityToken } = require('../playfab');
const { applyDerivedPlayerLevelToStats } = require('../playerLevel');
const {
    TAROT_DECK_DATA_KEY,
    MELEE_DECK_DATA_KEY,
    SHIP_DECK_DATA_KEY,
    filterMinorDeckIds,
    readDecksFromData,
    writeDecks,
    writeGuardian
} = require('../tarotDeck');
const {
    getCanonicalTarotCategory,
    getMajorArcanaSuitInfo,
    getMajorArcanaTitle,
    getTarotRankLabel,
    parseStoredEquipmentValue
} = require('../tarotCards');
const { applyEquipmentEnhancementToCatalogData } = require('../equipmentEnhancement');
const {
    normalizeTarotCardLevelMap,
    resolveTarotCatalogItemId
} = require('../tarotItemIds');
const {
    CAPITAL_CAPTURE_BREACH_WALLS,
    normalizeNationWarState
} = require('../nationWarWeapons');
const { getAvatarColorForNation } = require('../nation');
const {
    TAROT_KINGDOM_PET_DATA_KEY,
    buildTarotKingdomPetPublicRecord,
    normalizeTarotKingdomPetState
} = require('../tarotKingdomPets');
const {
    TAROT_GUARDIAN_DATA_KEY,
    buildTarotKingdomGuardian,
    buildTarotKingdomMinorLoadout
} = require('../tarotKingdomArcanaLoadout');

// ----------------------------------------------------
// ★ v42: モジュールレベル変数の定義
// ----------------------------------------------------
// initializeBattleRoutes 実行時に、server.js から渡されるオブジェクトを保持する
let _promisifyPlayFab = null;
let _PlayFabServer = null;
let _PlayFabEconomy = null;
let _lineClient = null;
let _catalogCache = null;
let _catalogCurrencyMap = null;
let _resolveItemId = null;
const tarotKingdomLoadoutMigrationInFlight = new Map();

const TAROT_KINGDOM_EQUIPMENT_SLOTS = ['RightHand', 'LeftHand', 'Armor', 'Accessory'];
const TAROT_KINGDOM_WEAPON_PRIORITY = [
    'axe_big', 'sword_big', 'gun_big', 'bow', 'wand', 'staff', 'dagger',
    'sword', 'axe', 'blunt', 'polearm', 'gun', 'shield', 'unarmed'
];
function getPlayerRankLabelByLevel(level) {
    const value = Math.max(1, Math.floor(Number(level) || 1));
    if (value >= 51) return '海賊王';
    if (value >= 41) return '提督';
    if (value >= 21) return '船長';
    if (value >= 11) return '航海士';
    return '見習い';
}

function resolveBattleCatalogItemId(itemId) {
    return resolveTarotCatalogItemId(itemId, _resolveItemId);
}

function scheduleTarotKingdomLoadoutMigration(playFabId, storedLoadout, guardianItemId) {
    const normalizedPlayFabId = String(playFabId || '').trim();
    if (
        !normalizedPlayFabId
        || !(storedLoadout?.needsDeckMigration || storedLoadout?.needsGuardianMigration)
        || tarotKingdomLoadoutMigrationInFlight.has(normalizedPlayFabId)
    ) return;
    const promisifyPlayFab = _promisifyPlayFab;
    const PlayFabServer = _PlayFabServer;
    const resolveItemId = _resolveItemId;
    const migration = (async () => {
        if (storedLoadout.needsDeckMigration) {
            await writeDecks(
                normalizedPlayFabId,
                { tarotDeck: storedLoadout.tarotDeck },
                promisifyPlayFab,
                PlayFabServer,
                resolveItemId
            );
        }
        if (storedLoadout.needsGuardianMigration && guardianItemId) {
            await writeGuardian(
                normalizedPlayFabId,
                guardianItemId,
                promisifyPlayFab,
                PlayFabServer,
                resolveItemId
            );
        }
    })();
    tarotKingdomLoadoutMigrationInFlight.set(normalizedPlayFabId, migration);
    migration
        .catch((migrationError) => {
            console.warn('[tarot-kingdom] loadout migration failed:', migrationError?.message || migrationError);
        })
        .finally(() => {
            if (tarotKingdomLoadoutMigrationInFlight.get(normalizedPlayFabId) === migration) {
                tarotKingdomLoadoutMigrationInFlight.delete(normalizedPlayFabId);
            }
        });
}

function getTarotKingdomLevelMaxHp(level) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    return 80 + ((safeLevel - 1) * 4);
}

function sanitizeTarotKingdomEquipment(equipment = {}) {
    const sanitized = {};
    TAROT_KINGDOM_EQUIPMENT_SLOTS.forEach((slot) => {
        const itemRef = equipment?.[slot];
        if (typeof itemRef === 'string' && itemRef.trim()) {
            sanitized[slot] = itemRef.trim();
        }
    });
    return sanitized;
}

function buildTarotKingdomItemSource(equipment = {}) {
    const drawingFields = [
        'Category', 'ManifestWeaponType', 'ManifestedWeaponType', 'WeaponType', 'weaponType',
        'sprite_path', 'sprite_index', 'sprite_w', 'sprite_h', 'TwoHanded', 'FriendlyId', 'ItemId'
    ];
    const itemSource = {};
    TAROT_KINGDOM_EQUIPMENT_SLOTS.forEach((slot) => {
        const itemId = typeof equipment?.[slot] === 'string' ? equipment[slot].trim() : '';
        if (!itemId || itemSource[itemId]) return;
        const catalogData = _catalogCache?.[itemId];
        if (!catalogData || typeof catalogData !== 'object') return;
        const customData = {};
        drawingFields.forEach((field) => {
            if (catalogData[field] !== undefined && catalogData[field] !== null) customData[field] = catalogData[field];
        });
        itemSource[itemId] = {
            itemId,
            name: String(catalogData.DisplayName || itemId).trim() || itemId,
            customData
        };
    });
    return itemSource;
}

function buildTarotKingdomAvatarBase(profile = {}, level = 1) {
    const avatar = profile?.avatar || {};
    return {
        Race: String(avatar.Race || 'human').trim() || 'human',
        Nation: String(avatar.Nation || '').trim().toLowerCase() || null,
        AvatarColor: String(avatar.AvatarColor || 'brown').trim() || 'brown',
        SkinColorIndex: Math.max(1, Math.floor(Number(avatar.SkinColorIndex || 1) || 1)),
        FaceIndex: Math.max(1, Math.floor(Number(avatar.FaceIndex || 1) || 1)),
        HairStyleIndex: Math.max(1, Math.floor(Number(avatar.HairStyleIndex || 1) || 1)),
        HairColorIndex: Math.max(1, Math.floor(Number(avatar.HairColorIndex || 1) || 1)),
        FacialHairStyleIndex: Math.max(0, Math.floor(Number(avatar.FacialHairStyleIndex ?? 1) || 0)),
        level
    };
}

function buildTarotKingdomTarotDeck(profile = {}, cardLevels = {}) {
    return buildTarotKingdomMinorLoadout(
        profile?.tarotDeckIds || [],
        _catalogCache || {},
        cardLevels
    );
}

function getTarotKingdomEquippedWeaponTypes(equipment = {}) {
    const types = new Set();
    ['RightHand', 'LeftHand'].forEach((slot) => {
        const itemId = String(equipment?.[slot] || '').trim();
        const itemData = _catalogCache?.[itemId] || {};
        const type = String(
            itemData.ManifestWeaponType
            || itemData.ManifestedWeaponType
            || itemData.WeaponType
            || itemData.weaponType
            || (String(itemData.Category || '').toLowerCase() === 'shield' ? 'shield' : '')
        ).trim().toLowerCase();
        if (type) types.add(type);
    });
    return types;
}

function buildTarotKingdomCombatCharacter(profile = {}, cardLevels = {}) {
    const stats = profile?.stats || {};
    const equipmentStats = profile?.equipmentStats || {};
    const equipment = sanitizeTarotKingdomEquipment(profile?.equipment);
    const level = Math.max(1, Math.floor(Number(profile?.level || stats.Level || 1) || 1));
    const weaponTypes = getTarotKingdomEquippedWeaponTypes(equipment);
    const weaponType = TAROT_KINGDOM_WEAPON_PRIORITY.find((type) => weaponTypes.has(type)) || 'unarmed';
    const statNumber = (key, fallback = 0) => {
        const value = Number(stats[key]);
        return Number.isFinite(value) ? value : fallback;
    };
    const equipmentNumber = (key) => {
        const value = Number(equipmentStats[key]);
        return Number.isFinite(value) ? value : 0;
    };

    return {
        version: 4,
        source: 'playfab',
        playFabId: String(profile?.id || '').trim(),
        displayName: String(stats.DisplayName || profile?.id || '（名前なし）').trim() || '（名前なし）',
        level,
        rankLabel: getPlayerRankLabelByLevel(level),
        avatarBase: buildTarotKingdomAvatarBase(profile, level),
        equipment,
        itemSource: buildTarotKingdomItemSource(equipment),
        tarotDeck: buildTarotKingdomTarotDeck(profile, cardLevels),
        guardianArcana: buildTarotKingdomGuardian(
            profile?.guardianArcanaItemId,
            _catalogCache || {},
            cardLevels
        ),
        combat: {
            maxHp: Math.max(1, Math.floor(statNumber('MaxHP', statNumber('HP', 1)))),
            power: Math.max(0, Math.floor(statNumber('ちから', 0) + equipmentNumber('Power'))),
            defense: Math.max(0, Math.floor(statNumber('みのまもり', 0) + equipmentNumber('Defense'))),
            intelligence: Math.max(0, Math.floor(statNumber('かしこさ', 0))),
            speed: Math.max(0, Math.floor(statNumber('すばやさ', 0) + equipmentNumber('Agi'))),
            equipmentPower: Math.max(0, Math.floor(equipmentNumber('Power'))),
            equipmentMagicPower: Math.max(
                0,
                Math.floor(equipmentNumber('MagicPower') + equipmentNumber('Int'))
            ),
            weaponType,
            weaponTypes: Array.from(weaponTypes)
        }
    };
}

async function getEntityKeyForPlayFabId(playFabId) {
    const result = await _promisifyPlayFab(_PlayFabServer.GetPlayerProfile, {
        PlayFabId: playFabId,
        ProfileConstraints: { ShowEntity: true }
    });
    return result?.PlayerProfile?.Entity || null;
}

async function getAllInventoryItems(playFabId, knownEntityKey = null) {
    const entityKey = knownEntityKey?.Id && knownEntityKey?.Type
        ? knownEntityKey
        : await getEntityKeyForPlayFabId(playFabId);
    if (!entityKey?.Id || !entityKey?.Type) return [];
    const items = [];
    let token = null;
    do {
        const result = await withTitleEntityToken(() => _promisifyPlayFab(_PlayFabEconomy.GetInventoryItems, {
            Entity: entityKey,
            Count: 100,
            ContinuationToken: token || undefined
        }));
        const page = Array.isArray(result?.Items) ? result.Items : [];
        items.push(...page);
        token = result?.ContinuationToken || null;
    } while (token);
    return items;
}

function getBattleItemData(itemRef) {
    if (!itemRef) return null;
    if (typeof itemRef === 'object' && itemRef.customData) return itemRef.customData;
    if (typeof itemRef === 'string') return _catalogCache?.[itemRef] || null;
    return null;
}

async function getPlayerFullProfile(playFabId, options = {}) {
    if (!_promisifyPlayFab || !_PlayFabServer || !_catalogCache) {
        console.error('getPlayerFullProfile: battle.js が初期化されていません。');
        throw new Error('battle.js is not initialized.');
    }

    const statsPromise = _promisifyPlayFab(_PlayFabServer.GetPlayerStatistics, { PlayFabId: playFabId });
    const avatarEquipmentKeys = [
        'Equipped_RightHand', 'Equipped_LeftHand', 'Equipped_Armor', 'Equipped_Accessory',
        'Race', 'Nation', 'AvatarColor', 'SkinColorIndex', 'FaceIndex', 'HairStyleIndex', 'HairColorIndex', 'FacialHairStyleIndex'
    ];
    const readOnlyKeys = options.scope === 'tarotKingdomCombat'
        ? [
            ...avatarEquipmentKeys,
            TAROT_DECK_DATA_KEY,
            MELEE_DECK_DATA_KEY,
            SHIP_DECK_DATA_KEY,
            TAROT_GUARDIAN_DATA_KEY,
            TAROT_KINGDOM_PET_DATA_KEY
        ]
        : [...avatarEquipmentKeys, 'lineUserId', TAROT_DECK_DATA_KEY, MELEE_DECK_DATA_KEY, SHIP_DECK_DATA_KEY];
    const equipmentPromise = _promisifyPlayFab(_PlayFabServer.GetUserReadOnlyData, {
        // ★ v122: アバター情報も取得するようにキーを追加
        PlayFabId: playFabId,
        Keys: readOnlyKeys
    });
    const profilePromise = _promisifyPlayFab(_PlayFabServer.GetPlayerProfile, {
        PlayFabId: playFabId, ProfileConstraints: { ShowDisplayName: true, ShowEntity: true }
    });
    // ★★★ 修正点: インベントリ全体を取得して、InstanceId と ItemId の対応表を作る ★★★
    const inventoryPromise = profilePromise.then((result) => (
        getAllInventoryItems(playFabId, result?.PlayerProfile?.Entity || null)
    ));

    const [statsResult, equipmentResult, profileResult, inventoryResult] = await Promise.all([statsPromise, equipmentPromise, profilePromise, inventoryPromise]);

    // InstanceId をキー、ItemId を値とするマップを作成
    const instanceIdToItemIdMap = {};
    const instanceIdToInventoryItemMap = {};
    if (Array.isArray(inventoryResult)) {
        inventoryResult.forEach(item => {
            if (item?.StackId && item?.Id) {
                instanceIdToItemIdMap[item.StackId] = item.Id;
                instanceIdToInventoryItemMap[item.StackId] = item;
            }
        });
    }

    const stats = {};
    if (statsResult.Statistics) {
        statsResult.Statistics.forEach(stat => { stats[stat.StatisticName] = stat.Value; });
    }
    Object.assign(stats, applyDerivedPlayerLevelToStats(stats).stats);
    if (!stats.MaxHP) {
        stats.MaxHP = options.scope === 'tarotKingdomCombat'
            ? Math.max(
                Math.max(0, Math.floor(Number(stats.HP) || 0)),
                getTarotKingdomLevelMaxHp(stats.Level)
            )
            : stats.HP;
    }
    if (!stats.MaxMP) stats.MaxMP = stats.MP;
    stats.CurrentHP = stats.HP;
    stats.CurrentMP = stats.MP;
    stats.DisplayName = profileResult.PlayerProfile.DisplayName || '（名前なし）';

    const equipment = {}; // ここには最終的に ItemId を格納する
    const equippedInventoryItems = {};
    const avatar = {}; // ★ v122: アバター情報を格納するオブジェクト
    let lineUserId = null;
    let tarotDeckIds = [];
    let guardianArcanaItemId = null;
    let currentPet = null;
    if (equipmentResult.Data) {
        const resolveEquippedValue = (rawValue) => {
            const parsed = parseStoredEquipmentValue(rawValue);
            if (!parsed) return null;
            if (typeof parsed === 'object') {
                const stackId = String(parsed.stackId || parsed.StackId || parsed.instanceId || parsed.InstanceId || '').trim();
                const itemId = String(parsed.itemId || parsed.ItemId || parsed.id || parsed.Id || instanceIdToItemIdMap[stackId] || '').trim();
                if (!itemId) return null;
                return { itemId, inventoryItem: stackId ? instanceIdToInventoryItemMap[stackId] || null : null };
            }
            const value = String(parsed).trim();
            if (!value) return null;
            return {
                itemId: instanceIdToItemIdMap[value] || value,
                inventoryItem: instanceIdToInventoryItemMap[value] || null
            };
        };
        const assignEquipment = (slot, rawValue) => {
            const resolved = resolveEquippedValue(rawValue);
            if (!resolved?.itemId) return;
            equipment[slot] = resolved.itemId;
            if (resolved.inventoryItem) equippedInventoryItems[slot] = resolved.inventoryItem;
        };
        // ★★★ 修正点: InstanceId から ItemId に変換して格納する ★★★
        const rightHandInstanceId = equipmentResult.Data.Equipped_RightHand ? equipmentResult.Data.Equipped_RightHand.Value : null;
        if (rightHandInstanceId) assignEquipment('RightHand', rightHandInstanceId);

        const leftHandInstanceId = equipmentResult.Data.Equipped_LeftHand ? equipmentResult.Data.Equipped_LeftHand.Value : null;
        if (leftHandInstanceId) assignEquipment('LeftHand', leftHandInstanceId);

        const armorInstanceId = equipmentResult.Data.Equipped_Armor ? equipmentResult.Data.Equipped_Armor.Value : null;
        if (armorInstanceId) assignEquipment('Armor', armorInstanceId);

        const accessoryInstanceId = equipmentResult.Data.Equipped_Accessory ? equipmentResult.Data.Equipped_Accessory.Value : null;
        if (accessoryInstanceId) assignEquipment('Accessory', accessoryInstanceId);

        if (equipmentResult.Data.lineUserId) lineUserId = equipmentResult.Data.lineUserId.Value;

        // ★ v122: アバター情報を取得
        const nation = String(equipmentResult.Data.Nation?.Value || '').trim().toLowerCase();
        avatar.Race = String(equipmentResult.Data.Race?.Value || 'human').trim() || 'human';
        avatar.Nation = nation || null;
        avatar.AvatarColor = getAvatarColorForNation(nation)
            || String(equipmentResult.Data.AvatarColor?.Value || '').trim()
            || 'brown';
        avatar.SkinColorIndex = Number(equipmentResult.Data.SkinColorIndex?.Value || 1) || 1;
        avatar.FaceIndex = Number(equipmentResult.Data.FaceIndex?.Value || 1) || 1;
        avatar.HairStyleIndex = Number(equipmentResult.Data.HairStyleIndex?.Value || 1) || 1;
        avatar.HairColorIndex = Number(equipmentResult.Data.HairColorIndex?.Value || 1) || 1;
        {
            const rawFacialHairStyle = equipmentResult.Data.FacialHairStyleIndex?.Value;
            avatar.FacialHairStyleIndex = rawFacialHairStyle === undefined || rawFacialHairStyle === null || rawFacialHairStyle === ''
                ? 1
                : Math.max(0, Number(rawFacialHairStyle) || 0);
        }
        avatar.level = Number(stats.Level || 1) || 1;

        // Very early loadout builds could persist an Economy V2 StackId instead of
        // the catalog item id. Resolve that representation before applying the
        // legacy-friendly-id migration so the first combat-profile response is
        // already usable; persistence can continue asynchronously afterwards.
        const resolveStoredTarotItemId = (itemId) => {
            const storedId = String(itemId || '').trim();
            if (!storedId) return '';
            return resolveBattleCatalogItemId(instanceIdToItemIdMap[storedId] || storedId);
        };
        const storedTarotLoadout = readDecksFromData(equipmentResult.Data, resolveStoredTarotItemId);
        tarotDeckIds = storedTarotLoadout.tarotDeck;
        if (options.scope === 'tarotKingdomCombat') {
            const guardianItemId = resolveBattleCatalogItemId(storedTarotLoadout.guardian?.itemId);
            guardianArcanaItemId = guardianItemId || null;
            scheduleTarotKingdomLoadoutMigration(playFabId, storedTarotLoadout, guardianItemId);
            currentPet = buildTarotKingdomPetPublicRecord(
                normalizeTarotKingdomPetState(
                    equipmentResult.Data[TAROT_KINGDOM_PET_DATA_KEY]?.Value
                ).currentPet
            );
        }
    }

    const equipmentStats = {
        Power: 0,
        Defense: 0,
        Agi: 0,
        Int: 0,
        MagicPower: 0,
        HealPower: 0,
        MpEfficiency: 0,
        CastRate: 0,
        StatusRate: 0,
        ParryRate: 0,
        ParryCharges: 0
    };
    const accumulateItemStats = (itemRef, options = {}) => {
        if (!itemRef) return;
        const baseItemData = getBattleItemData(itemRef);
        if (!baseItemData) return;
        const itemId = typeof itemRef === 'string' ? itemRef : String(itemRef?.itemId || '').trim();
        const itemData = applyEquipmentEnhancementToCatalogData(
            itemId,
            baseItemData,
            equippedInventoryItems[options.slot] || {}
        ).catalogData;
        const powerValue = Number(itemData.Power || itemData.Atk || 0) || 0;
        const defenseValue = Number(itemData.Defense || itemData.Def || 0) || 0;
        const agilityValue = Number(itemData.Agi || itemData.Speed || 0) || 0;
        const intelligenceValue = Number(itemData.Int || itemData.Intelligence || 0) || 0;
        const magicPowerValue = Number(itemData.MagicPower || 0) || 0;
        const healPowerValue = Number(itemData.HealPower || 0) || 0;
        const mpEfficiencyValue = Number(itemData.MpEfficiency || 0) || 0;
        const castRateValue = Number(itemData.CastRate || 0) || 0;
        const statusRateValue = Number(itemData.StatusRate || 0) || 0;
        equipmentStats.Defense += defenseValue;
        equipmentStats.Power += powerValue;
        equipmentStats.Agi += agilityValue;
        equipmentStats.Int += intelligenceValue;
        equipmentStats.MagicPower += magicPowerValue;
        equipmentStats.HealPower += healPowerValue;
        equipmentStats.MpEfficiency += mpEfficiencyValue;
        equipmentStats.CastRate += castRateValue;
        equipmentStats.StatusRate += statusRateValue;
    };
    accumulateItemStats(equipment.RightHand, { slot: 'RightHand' });
    accumulateItemStats(equipment.LeftHand, { slot: 'LeftHand' });
    accumulateItemStats(equipment.Armor, { slot: 'Armor' });
    accumulateItemStats(equipment.Accessory, { slot: 'Accessory' });

    tarotDeckIds = filterMinorDeckIds(tarotDeckIds, _catalogCache);

    if (stats.すばやさ === undefined && Number.isFinite(Number(stats.Agi))) {
        stats.すばやさ = Number(stats.Agi) || 0;
    }
    stats.かしこさ = (Number(stats.かしこさ || 0) || 0) + equipmentStats.Int;

    return {
        id: playFabId,
        lineUserId: lineUserId,
        stats: stats,
        equipment: equipment,
        equipmentStats: equipmentStats,
        tarotDeckIds,
        guardianArcanaItemId,
        currentPet,
        avatar: avatar,
        level: stats.Level
    };
}

// ----------------------------------------------------
// ★ v42: server.js から呼び出される初期化関数
// ----------------------------------------------------
function initializeBattleRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabEconomy, lineClient, catalogCache, catalogCurrencyMap, resolveItemId, constants, authTools = {}) {

    // ★ v42: モジュールレベル変数に代入
    _promisifyPlayFab = promisifyPlayFab;
    _PlayFabServer = PlayFabServer;
    _PlayFabEconomy = PlayFabEconomy;
    _lineClient = lineClient || null;
    _catalogCache = catalogCache;
    _catalogCurrencyMap = catalogCurrencyMap || null;
    _resolveItemId = resolveItemId || null;
    // ★ v120: Firebase Adminのdatabaseインスタンスを取得
    const admin = require('firebase-admin');
    const db = admin.database();
    const firestore = admin.firestore();

    const {
        VIRTUAL_CURRENCY_CODE,
        LEADERBOARD_NAME,
        BATTLE_REWARD_POINTS
    } = constants;
    const requireAuthenticatedPlayFabId = authTools?.requireAuthenticatedPlayFabId || null;
    const requireAuthedPlayFabId = async (req, res, playFabId) => {
        if (typeof requireAuthenticatedPlayFabId !== 'function') return playFabId;
        return requireAuthenticatedPlayFabId(req, res, playFabId);
    };
    const battlePairCooldownMs = 60 * 1000;
    const recentBattlePairs = new Map();
    const tarotKingdomProfileRequestWindows = new Map();
    const tarotKingdomCombatProfileInFlight = new Map();
    const TAROT_KINGDOM_PROFILE_WINDOW_MS = 60 * 1000;
    const TAROT_KINGDOM_PROFILE_MAX_REQUESTS = 8;
    const TAROT_KINGDOM_PRESENCE_STALE_MS = 90 * 1000;
    const TAROT_KINGDOM_PRESENCE_FUTURE_TOLERANCE_MS = 15 * 1000;
    const tarotKingdomProfileLimits = authTools?.tarotKingdomProfileLimits || {};
    const getTarotKingdomProfileLimit = (key, fallback, minimum = 1) => {
        const value = Number(tarotKingdomProfileLimits?.[key]);
        return Number.isFinite(value) ? Math.max(minimum, Math.floor(value)) : fallback;
    };
    const TAROT_KINGDOM_PROFILE_HTTP_DEADLINE_MS = getTarotKingdomProfileLimit('httpDeadlineMs', 12 * 1000);
    const TAROT_KINGDOM_PROFILE_QUEUE_WAIT_MS = getTarotKingdomProfileLimit('queueWaitMs', 10 * 1000);
    const TAROT_KINGDOM_PROFILE_MAX_CONCURRENCY = getTarotKingdomProfileLimit('maxConcurrency', 4);
    const TAROT_KINGDOM_PROFILE_MAX_QUEUE = getTarotKingdomProfileLimit('maxQueue', 32, 0);
    const TAROT_KINGDOM_PROFILE_TIMEOUT_CODE = 'TarotKingdomCombatProfileTimeout';
    const TAROT_KINGDOM_PROFILE_OVERLOAD_CODE = 'TarotKingdomCombatProfileOverload';
    let tarotKingdomProfileActiveCount = 0;
    const tarotKingdomProfileWaiters = [];
    const createTarotKingdomProfileError = (code, message) => {
        const error = new Error(message);
        error.code = code;
        return error;
    };
    const createTarotKingdomProfileRelease = () => {
        let released = false;
        return () => {
            if (released) return;
            released = true;
            tarotKingdomProfileActiveCount = Math.max(0, tarotKingdomProfileActiveCount - 1);
            while (tarotKingdomProfileWaiters.length > 0) {
                const waiter = tarotKingdomProfileWaiters.shift();
                if (!waiter || waiter.settled) continue;
                waiter.settled = true;
                if (waiter.timeoutId) clearTimeout(waiter.timeoutId);
                // Reserve the released slot before waking the waiter so a new request cannot barge in.
                tarotKingdomProfileActiveCount += 1;
                waiter.resolve(createTarotKingdomProfileRelease());
                break;
            }
        };
    };
    const acquireTarotKingdomProfileSlot = async () => {
        if (tarotKingdomProfileActiveCount < TAROT_KINGDOM_PROFILE_MAX_CONCURRENCY) {
            tarotKingdomProfileActiveCount += 1;
            return createTarotKingdomProfileRelease();
        }
        if (tarotKingdomProfileWaiters.length >= TAROT_KINGDOM_PROFILE_MAX_QUEUE) {
            throw createTarotKingdomProfileError(
                TAROT_KINGDOM_PROFILE_OVERLOAD_CODE,
                'Combat profile queue is full.'
            );
        }
        return new Promise((resolve, reject) => {
            const waiter = {
                settled: false,
                timeoutId: null,
                resolve
            };
            waiter.timeoutId = setTimeout(() => {
                if (waiter.settled) return;
                waiter.settled = true;
                const waiterIndex = tarotKingdomProfileWaiters.indexOf(waiter);
                if (waiterIndex >= 0) tarotKingdomProfileWaiters.splice(waiterIndex, 1);
                reject(createTarotKingdomProfileError(
                    TAROT_KINGDOM_PROFILE_OVERLOAD_CODE,
                    'Combat profile queue wait timed out.'
                ));
            }, TAROT_KINGDOM_PROFILE_QUEUE_WAIT_MS);
            tarotKingdomProfileWaiters.push(waiter);
        });
    };
    const withTarotKingdomProfileSlot = async (task) => {
        const release = await acquireTarotKingdomProfileSlot();
        try {
            return await Promise.resolve().then(task);
        } finally {
            release();
        }
    };
    const getTarotKingdomCardLevels = async (playFabIds = []) => {
        const uniqueIds = Array.from(new Set(
            (Array.isArray(playFabIds) ? playFabIds : [])
                .map((value) => String(value || '').trim())
                .filter(Boolean)
        ));
        if (!uniqueIds.length) return new Map();
        if (
            typeof firestore?.collection !== 'function'
            || typeof firestore?.getAll !== 'function'
        ) {
            return new Map(uniqueIds.map((playFabId) => [playFabId, {}]));
        }
        const refs = uniqueIds.map((playFabId) => (
            firestore.collection('playerCards').doc(playFabId)
        ));
        const snapshots = await firestore.getAll(...refs);
        const result = new Map();
        snapshots.forEach((snapshot, index) => {
            const playFabId = uniqueIds[index];
            result.set(
                playFabId,
                normalizeTarotCardLevelMap(snapshot.exists ? (snapshot.data()?.cards || {}) : {}, _resolveItemId)
            );
        });
        return result;
    };
    const waitForTarotKingdomProfileHttp = async (inFlight) => {
        let timeoutId = null;
        try {
            return await Promise.race([
                inFlight,
                new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(createTarotKingdomProfileError(
                        TAROT_KINGDOM_PROFILE_TIMEOUT_CODE,
                        'Combat profile HTTP wait timed out.'
                    )), TAROT_KINGDOM_PROFILE_HTTP_DEADLINE_MS);
                })
            ]);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    };
    // タロットキングダム用の固定戦闘プロフィール
    app.post('/api/tarot-kingdom/combat-profiles', async (req, res) => {
        const body = req.body || {};
        const playFabId = String(body.playFabId || '').trim();
        const requesterPlayFabId = String(body.requesterPlayFabId || '').trim();
        const roomId = String(body.roomId || '').trim();
        if (playFabId && requesterPlayFabId && playFabId !== requesterPlayFabId) {
            return res.status(400).json({ error: '依頼者のプレイヤーIDが一致しません。' });
        }
        const requestedBy = requesterPlayFabId || playFabId;
        if (!requestedBy) {
            return res.status(400).json({ error: 'playFabId is required' });
        }
        if (requestedBy.length > 128 || /[\u0000-\u001f\u007f]/u.test(requestedBy)) {
            return res.status(400).json({ error: 'playFabId is invalid' });
        }
        if (typeof requireAuthenticatedPlayFabId !== 'function') {
            return res.status(503).json({ error: '認証サービスを利用できません。' });
        }

        const targetPlayFabIds = body.targetPlayFabIds;
        if (!Array.isArray(targetPlayFabIds) || targetPlayFabIds.length === 0) {
            return res.status(400).json({ error: 'targetPlayFabIds must be a non-empty array' });
        }
        if (targetPlayFabIds.length > 4) {
            return res.status(400).json({ error: 'targetPlayFabIds accepts at most 4 players' });
        }

        const normalizedTargetIds = targetPlayFabIds.map((value) => (
            typeof value === 'string' ? value.trim() : ''
        ));
        const hasInvalidTarget = normalizedTargetIds.some((value) => (
            !value || value.length > 128 || /[\u0000-\u001f\u007f]/u.test(value)
        ));
        if (hasInvalidTarget) {
            return res.status(400).json({ error: 'targetPlayFabIds contains an invalid player ID' });
        }
        if (new Set(normalizedTargetIds).size !== normalizedTargetIds.length) {
            return res.status(400).json({ error: 'targetPlayFabIds must not contain duplicates' });
        }
        if (roomId && (!/^[A-Za-z0-9_-]{1,96}$/u.test(roomId))) {
            return res.status(400).json({ error: 'roomId is invalid' });
        }

        const authenticatedPlayFabId = await requireAuthedPlayFabId(req, res, requestedBy);
        if (!authenticatedPlayFabId) return;

        try {
            const now = Date.now();
            const recentRequests = (tarotKingdomProfileRequestWindows.get(authenticatedPlayFabId) || [])
                .filter((requestedAt) => now - requestedAt < TAROT_KINGDOM_PROFILE_WINDOW_MS);
            if (recentRequests.length >= TAROT_KINGDOM_PROFILE_MAX_REQUESTS) {
                const retryAfterSeconds = Math.max(
                    1,
                    Math.ceil((recentRequests[0] + TAROT_KINGDOM_PROFILE_WINDOW_MS - now) / 1000)
                );
                res.set?.('Retry-After', String(retryAfterSeconds));
                return res.status(429).json({ error: '戦闘プロフィールの再取得回数が多すぎます。少し待ってください。' });
            }
            recentRequests.push(now);
            tarotKingdomProfileRequestWindows.set(authenticatedPlayFabId, recentRequests);
            if (tarotKingdomProfileRequestWindows.size > 512) {
                for (const [key, requestTimes] of tarotKingdomProfileRequestWindows.entries()) {
                    const activeTimes = Array.isArray(requestTimes)
                        ? requestTimes.filter((requestedAt) => now - requestedAt < TAROT_KINGDOM_PROFILE_WINDOW_MS)
                        : [];
                    if (activeTimes.length) tarotKingdomProfileRequestWindows.set(key, activeTimes);
                    else tarotKingdomProfileRequestWindows.delete(key);
                }
            }

            if (roomId) {
                const roomRoot = `tarotKingdomRooms/${roomId}`;
                const [hostSnapshot, seatSnapshot, seatOwnersSnapshot, presenceSnapshot] = await Promise.all([
                    db.ref(`${roomRoot}/meta/hostUid`).once('value'),
                    db.ref(`${roomRoot}/meta/seatByUid`).once('value'),
                    db.ref(`${roomRoot}/meta/seatOwners`).once('value'),
                    db.ref(`${roomRoot}/presence`).once('value')
                ]);
                const hostUid = hostSnapshot.exists() ? String(hostSnapshot.val() || '').trim() : '';
                const seatByUidValue = seatSnapshot.exists() ? seatSnapshot.val() : null;
                const seatOwnersValue = seatOwnersSnapshot.exists() ? seatOwnersSnapshot.val() : null;
                const presenceValue = presenceSnapshot.exists() ? presenceSnapshot.val() : null;
                if (!hostUid && !seatByUidValue && !seatOwnersValue && !presenceValue) {
                    return res.status(404).json({ error: '対戦ルームが見つかりません。' });
                }
                if (!hostUid || hostUid !== authenticatedPlayFabId) {
                    return res.status(403).json({ error: '対戦ホストだけがプロフィールを固定できます。' });
                }
                const seatByUid = seatByUidValue && typeof seatByUidValue === 'object'
                    ? seatByUidValue
                    : {};
                const seatOwners = seatOwnersValue && typeof seatOwnersValue === 'object'
                    ? seatOwnersValue
                    : {};
                const occupantBySeat = new Map();
                let duplicateSeat = false;
                Object.entries(presenceValue && typeof presenceValue === 'object' ? presenceValue : {})
                    .forEach(([uidKey, presence]) => {
                        const uid = String(uidKey || '').trim();
                        const seat = Number(presence?.seat);
                        const fixedSeat = Number(seatByUid?.[uid]);
                        const lease = seatOwners?.[seat];
                        const leaseUid = String(
                            lease && typeof lease === 'object' ? lease.uid : lease || ''
                        ).trim();
                        const updatedAt = Number(presence?.updatedAt);
                        if (!uid || !Number.isInteger(seat) || seat < 0 || seat >= 4) return;
                        if (
                            !Number.isFinite(updatedAt)
                            || updatedAt <= 0
                            || updatedAt > now + TAROT_KINGDOM_PRESENCE_FUTURE_TOLERANCE_MS
                            || now - updatedAt > TAROT_KINGDOM_PRESENCE_STALE_MS
                        ) return;
                        if (Object.keys(seatByUid).length > 0 && (!Number.isInteger(fixedSeat) || fixedSeat !== seat)) return;
                        if (!leaseUid || leaseUid !== uid) return;
                        if (occupantBySeat.has(seat) && occupantBySeat.get(seat) !== uid) {
                            duplicateSeat = true;
                            return;
                        }
                        occupantBySeat.set(seat, uid);
                    });
                if (duplicateSeat) {
                    return res.status(409).json({ error: '同じ座席に複数の参加者がいます。ルームを再同期してください。' });
                }
                const authoritativeIds = Array.from(occupantBySeat.entries())
                    .sort((left, right) => left[0] - right[0])
                    .map((entry) => entry[1]);
                if (!authoritativeIds.includes(authenticatedPlayFabId)) {
                    return res.status(403).json({ error: '対戦ルームへの参加を確認できません。' });
                }
                const requestedSet = new Set(normalizedTargetIds);
                if (
                    authoritativeIds.length !== normalizedTargetIds.length
                    || authoritativeIds.some((id) => !requestedSet.has(id))
                ) {
                    return res.status(409).json({ error: '参加者情報が更新されています。ルームを再同期してください。' });
                }
            } else if (
                normalizedTargetIds.length !== 1
                || normalizedTargetIds[0] !== authenticatedPlayFabId
            ) {
                return res.status(403).json({ error: 'ルーム外では本人のプロフィールだけ取得できます。' });
            }

            const [profiles, cardLevelsByPlayer] = await Promise.all([
                Promise.all(normalizedTargetIds.map(async (targetId) => {
                let inFlight = tarotKingdomCombatProfileInFlight.get(targetId);
                if (!inFlight) {
                    inFlight = withTarotKingdomProfileSlot(async () => {
                        const profile = await getPlayerFullProfile(targetId, { scope: 'tarotKingdomCombat' });
                        if (!profile || String(profile.id || '').trim() !== targetId) {
                            throw new Error(`Combat profile was not resolved: ${targetId}`);
                        }
                        return profile;
                    });
                    tarotKingdomCombatProfileInFlight.set(targetId, inFlight);
                    const clearInFlight = () => {
                        if (tarotKingdomCombatProfileInFlight.get(targetId) === inFlight) {
                            tarotKingdomCombatProfileInFlight.delete(targetId);
                        }
                    };
                    // Keep the shared operation registered until the downstream PlayFab work settles,
                    // even if every HTTP caller has already reached its response deadline.
                    inFlight.then(clearInFlight, clearInFlight);
                }
                return waitForTarotKingdomProfileHttp(inFlight);
                })),
                getTarotKingdomCardLevels(normalizedTargetIds)
            ]);
            const profileSnapshots = profiles.map((profile, index) => {
                const targetId = normalizedTargetIds[index];
                const cardLevels = cardLevelsByPlayer.get(targetId) || {};
                return {
                    character: buildTarotKingdomCombatCharacter(
                        profile,
                        cardLevels
                    ),
                    currentPet: buildTarotKingdomPetPublicRecord(profile.currentPet, {
                        catalogCache: _catalogCache || {}
                    })
                };
            });
            const characters = profileSnapshots.map((snapshot) => snapshot.character);
            const currentPets = profileSnapshots.map((snapshot, index) => ({
                playFabId: normalizedTargetIds[index],
                currentPet: snapshot.currentPet || null
            }));
            const currentPet = normalizedTargetIds.length === 1
                && normalizedTargetIds[0] === authenticatedPlayFabId
                ? currentPets[0].currentPet
                : null;
            return res.json({ success: true, characters, currentPets, currentPet });
        } catch (error) {
            if (error?.code === TAROT_KINGDOM_PROFILE_TIMEOUT_CODE) {
                return res.status(504).json({
                    error: '戦闘プロフィールの取得がタイムアウトしました。'
                });
            }
            if (error?.code === TAROT_KINGDOM_PROFILE_OVERLOAD_CODE) {
                res.set?.('Retry-After', '1');
                return res.status(503).json({
                    error: '戦闘プロフィールの取得が混み合っています。少し待って再試行してください。'
                });
            }
            console.error('[tarot-kingdom/combat-profiles] Error:', error?.errorMessage || error?.message || error);
            return res.status(500).json({
                error: '戦闘用キャラクター情報の取得に失敗しました。'
            });
        }
    });

    // ----------------------------------------------------
}

// ★ v42: 共通関数を exports する
module.exports = {
    initializeBattleRoutes,
    getPlayerFullProfile,
    buildTarotKingdomCombatCharacter
};
