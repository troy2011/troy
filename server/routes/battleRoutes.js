// battle.js (v42 - 共通関数をexportsするように変更)
require('dotenv').config();
const economy = require('../economy');
const { getEntityKeyFromPlayFabId, withTitleEntityToken } = require('../playfab');
const { applyDerivedPlayerLevelToStats } = require('../playerLevel');
const {
    TAROT_DECK_DATA_KEY,
    MELEE_DECK_DATA_KEY,
    SHIP_DECK_DATA_KEY,
    evaluateDeckRole,
    filterMinorDeckIds,
    readDecksFromData,
    writeDecks,
    writeGuardian
} = require('../tarotDeck');
const { getTarotRolePassive } = require('../tarotRoles');
const { getTarotBattleDeck, resolveTarotBattleSkill, publicTarotBattleSkill } = require('../tarotBattleSkills');
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
const { runMeleeBattle, getEquippedWeaponTypes } = require('../battle/MeleeCombatSystem');
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
const LEGACY_NAVAL_MELEE_BATTLES_ENABLED = false;

function rejectRetiredLegacyBattle(res) {
    if (LEGACY_NAVAL_MELEE_BATTLES_ENABLED) return false;
    res.status(410).json({
        error: '船バトルと白兵戦は現在休止中です。',
        code: 'LEGACY_BATTLE_RETIRED'
    });
    return true;
}

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
        profile?.meleeDeckIds || [],
        _catalogCache || {},
        cardLevels
    );
}

function buildTarotKingdomCombatCharacter(profile = {}, cardLevels = {}) {
    const stats = profile?.stats || {};
    const equipmentStats = profile?.equipmentStats || {};
    const equipment = sanitizeTarotKingdomEquipment(profile?.equipment);
    const level = Math.max(1, Math.floor(Number(profile?.level || stats.Level || 1) || 1));
    const weaponTypes = getEquippedWeaponTypes({ ...profile, equipment }, _catalogCache || {});
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

function getCurrencyBalanceFromItems(items, currencyId) {
    const totals = economy.getVirtualCurrencyMap(items, {
        catalogCache: _catalogCache,
        catalogCurrencyMap: _catalogCurrencyMap
    });
    return totals[currencyId] || 0;
}

function getEconomyDeps() {
    return {
        promisifyPlayFab: _promisifyPlayFab,
        PlayFabEconomy: _PlayFabEconomy,
        getEntityKeyFromPlayFabId,
        resolveItemId: _resolveItemId
    };
}

function getBattleItemData(itemRef) {
    if (!itemRef) return null;
    if (itemRef && typeof itemRef === 'object' && itemRef.customData) return itemRef.customData;
    if (typeof itemRef === 'string') return _catalogCache?.[itemRef] || null;
    return null;
}

function getBattleItemCategory(itemRef) {
    return String(getBattleItemData(itemRef)?.Category || '').trim();
}

function getBattleNumericStat(itemRef, keys, fallback = 0) {
    const itemData = getBattleItemData(itemRef);
    if (!itemData || !Array.isArray(keys)) return fallback;
    for (const key of keys) {
        const value = Number(itemData?.[key]);
        if (Number.isFinite(value)) return value;
    }
    return fallback;
}

function isBattleShieldItemData(itemData) {
    if (!itemData) return false;
    const category = String(itemData.Category || itemData.category || '').trim().toLowerCase();
    const weaponType = String(itemData.ManifestWeaponType || itemData.WeaponType || itemData.weaponType || '').trim().toLowerCase();
    return category === 'shield' || weaponType === 'shield';
}

function normalizeParryRateValue(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const rate = parsed > 1 ? parsed / 100 : parsed;
    return Math.max(0, Math.min(0.8, rate));
}

function deriveShieldParryStats(itemData) {
    if (!isBattleShieldItemData(itemData)) return { rate: 0, charges: 0 };
    const defenseTier = Math.max(0, Number(itemData.Defense || itemData.Def || 0) || 0);
    const derivedRate = Math.max(0.12, Math.min(0.38, 0.12 + defenseTier * 0.004));
    const explicitRate = itemData.ParryRate ?? itemData.ParryChance ?? itemData.BlockRate ?? itemData.BlockChance;
    const rate = normalizeParryRateValue(explicitRate, derivedRate);
    const explicitCharges = Number(itemData.ParryCharges ?? itemData.ParryCount ?? itemData.BlockCharges);
    const derivedCharges = defenseTier >= 45 ? 4 : defenseTier >= 28 ? 3 : defenseTier >= 16 ? 2 : 1;
    const charges = Number.isFinite(explicitCharges)
        ? Math.max(0, Math.floor(explicitCharges))
        : derivedCharges;
    return { rate, charges };
}

function resolveBattleWeaponType(weaponRef) {
    if (weaponRef && typeof weaponRef === 'object') {
        const manifestWeapon = String(
            weaponRef?.customData?.ManifestWeaponType
            || weaponRef?.customData?.ManifestedWeaponType
            || ''
        ).toLowerCase();
        if (manifestWeapon) return manifestWeapon;
        const manifestCategory = String(weaponRef?.customData?.Category || '').toLowerCase();
        if (manifestCategory === 'shield') return 'shield';
        if (manifestCategory === 'weapon') return 'staff';
    }
    const id = String(weaponRef || '').toLowerCase();
    if (!id) return '';
    if (id.includes('gun') || id.includes('bow') || id.includes('pistol') || id.includes('rifle')) return 'gun';
    if (id.includes('spear') || id.includes('polearm')) return 'polearm';
    if (id.includes('staff') || id.includes('wand')) return 'staff';
    if (id.includes('shield')) return 'shield';
    if (id.includes('dagger') || id.includes('knife')) return 'dagger';
    if (id.includes('sword')) return 'sword';
    if (id.includes('axe')) return 'axe';
    if (id.includes('blunt') || id.includes('club') || id.includes('mace') || id.includes('hammer')) return 'blunt';
    return '';
}

function getBattleEquippedWeaponTypes(player) {
    const types = new Set();
    const right = resolveBattleWeaponType(player?.equipment?.RightHand);
    const left = resolveBattleWeaponType(player?.equipment?.LeftHand);
    if (right) types.add(right);
    if (left) types.add(left);
    return types;
}

function getBattleAwakeningBattleState(player) {
    return player?.majorAwakening?.battle || {};
}

function buildBattleAwakeningActionPhrase(player, options = {}) {
    const name = String(player?.majorAwakening?.name || '').trim();
    if (!name) return '';
    const battle = getBattleAwakeningBattleState(player);
    const mode = String(options?.mode || '').trim();
    const executeActive = Boolean(options?.executeActive);
    const hasPhysical = (Number(battle?.attackMultiplier || 1) || 1) > 1.001;
    const hasMagic = (Number(battle?.magicAttackMultiplier || 1) || 1) > 1.001;
    const hasBasicMagic = (Number(battle?.basicMagicMultiplier || 1) || 1) > 1.001;
    const hasHeal = (Number(battle?.healMultiplier || 1) || 1) > 1.001;
    const hasExecute = executeActive && (Number(battle?.executeMultiplier || 1) || 1) > 1.001;
    if (mode === 'heal') {
        if (hasHeal) return `${name} の加護が癒やしを満たし、`;
        return '';
    }
    if (mode === 'magic') {
        if (hasMagic && hasExecute) return `${name} が魔力を研ぎ澄まし、弱点を穿った！ `;
        if (hasMagic) return `${name} の加護が魔力を高め、`;
        if (hasExecute) return `${name} が弱点を見抜き、`;
        return '';
    }
    if (mode === 'basicMagic') {
        if ((hasMagic || hasBasicMagic) && hasExecute) return `${name} が魔力弾を研ぎ澄まし、弱点を穿った！ `;
        if (hasMagic || hasBasicMagic) return `${name} の加護が魔力弾を強め、`;
        if (hasExecute) return `${name} が弱点を見抜き、`;
        return '';
    }
    if (mode === 'attack') {
        if (hasPhysical && hasExecute) return `${name} が一撃を研ぎ澄まし、弱点を突いた！ `;
        if (hasPhysical) return `${name} の加護が一撃を後押しし、`;
        if (hasExecute) return `${name} が弱点を見抜き、`;
    }
    return '';
}

function getBattleMagicProfile(player) {
    const equipmentStats = player?.equipmentStats || {};
    const rightHand = player?.equipment?.RightHand;
    const leftHand = player?.equipment?.LeftHand;
    const awakeningBattle = getBattleAwakeningBattleState(player);
    const rightType = resolveBattleWeaponType(rightHand);
    const leftType = resolveBattleWeaponType(leftHand);
    const hasStaff = rightType === 'staff' || leftType === 'staff';
    const leftCategory = getBattleItemCategory(leftHand);
    const hasOffhand = leftCategory === 'Offhand';
    const focusPower = hasStaff
        ? Math.max(
            getBattleNumericStat(rightHand, ['MagicPower', 'Power', 'Atk'], 0),
            getBattleNumericStat(leftHand, ['MagicPower', 'Power', 'Atk'], 0)
        )
        : Math.floor(getBattleNumericStat(leftHand, ['MagicPower', 'Power', 'Atk'], 0) * 0.35);
    const totalMagicPower = Number(equipmentStats.MagicPower || 0) || 0;
    const castRate = Number(equipmentStats.CastRate || 0) || 0;
    const healPower = Number(equipmentStats.HealPower || 0) || 0;
    const mpEfficiency = Number(equipmentStats.MpEfficiency || 0) || 0;
    const statusRate = Number(equipmentStats.StatusRate || 0) || 0;
    const magicBase = totalMagicPower + focusPower + Math.floor(castRate / 4) + (hasOffhand ? 4 : 0);
    const focusMultiplier = hasStaff
        ? (hasOffhand ? 1.18 : 0.98)
        : (hasOffhand ? 0.62 : 0.42);
    const baseAttackPower = Math.max(1, Math.floor(magicBase * focusMultiplier));
    return {
        hasStaff,
        hasOffhand,
        focusPower,
        totalMagicPower,
        castRate,
        healPower,
        mpEfficiency,
        statusRate,
        baseAttackPower,
        mpCostRate: Number(awakeningBattle.mpCostRate || 1) || 1,
        healThresholdBonus: Number(awakeningBattle.healThresholdBonus || 0) || 0,
        castRangeBonus: Number(awakeningBattle.castRangeBonus || 0) || 0,
        basicMagicMultiplier: Number(awakeningBattle.basicMagicMultiplier || 1) || 1,
        magicPreference: Number(awakeningBattle.magicPreference || 0) || 0,
        healPreference: Number(awakeningBattle.healPreference || 0) || 0
    };
}

function getBattleMagicDefense(player) {
    const intelligence = Number(player?.stats?.かしこさ || 0) || 0;
    const equipmentDefense = Number(player?.equipmentStats?.Defense || 0) || 0;
    const awakeningBattle = getBattleAwakeningBattleState(player);
    return Math.max(
        0,
        Math.floor((intelligence * 0.35) + (equipmentDefense * 0.15) + (Number(awakeningBattle.magicDefenseBonus || 0) || 0))
    );
}

function calculateBattleMagicDamage(attacker, defender, magicProfile, options = {}) {
    const intellect = Number(attacker?.stats?.かしこさ || 0) || 0;
    const level = Number(attacker?.stats?.Level || attacker?.level || 1) || 1;
    const enemyGuard = getBattleMagicDefense(defender);
    const baseDamage = Math.max(
        1,
        Math.floor((magicProfile?.baseAttackPower || 1) * (options.powerMultiplier || 1)) - enemyGuard
    );
    const multiplier = ((intellect * level / 128) + 1.8);
    return Math.max(1, Math.floor(baseDamage * multiplier * (options.totalMultiplier || 1)));
}

// ----------------------------------------------------
// ★ v42: プレイヤーHP/MPを保存する共通関数
// ----------------------------------------------------
async function savePlayerHpMp(player) {
    if (!_promisifyPlayFab || !_PlayFabServer) {
        console.error('savePlayerHpMp: battle.js が初期化されていません。');
        return;
    }

    // バトル後のHP/MPを計算 (最低1)
    const finalHP = Math.min(player.stats.CurrentHP <= 0 ? 1 : player.stats.CurrentHP, player.stats.MaxHP);
    const currentMp = player?.stats?.CurrentMP;
    const finalMP = Math.min(currentMp ?? player.stats.MP, player.stats.MaxMP);

    const statsToUpdate = [
        { StatisticName: "HP", Value: finalHP },
        { StatisticName: "MP", Value: finalMP }
    ];

    try {
        await _promisifyPlayFab(_PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: player.id, Statistics: statsToUpdate
        });
        console.log(`[バトル保存] ${player.id} のHP/MPを更新しました。 (HP: ${finalHP}, MP: ${finalMP})`);
    } catch (error) {
        console.error(`[バトル保存エラー] ${player.id} のHP/MP保存に失敗:`, error.errorMessage);
    }
}

// ----------------------------------------------------
// ★ v42: プレイヤー情報を取得する共通関数 (exports)
// ----------------------------------------------------
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
    let meleeDeckIds = [];
    let shipDeckIds = [];
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
        meleeDeckIds = storedTarotLoadout.meleeDeck;
        shipDeckIds = storedTarotLoadout.shipDeck;
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
        if (isBattleShieldItemData(itemData)) {
            const parry = deriveShieldParryStats(itemData);
            equipmentStats.ParryRate = Math.max(equipmentStats.ParryRate, parry.rate);
            equipmentStats.ParryCharges += parry.charges;
        } else if (options.replaceDefense) {
            equipmentStats.Defense = defenseValue;
        } else {
            equipmentStats.Defense += defenseValue;
        }
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
    accumulateItemStats(equipment.Armor, { slot: 'Armor', replaceDefense: true });
    accumulateItemStats(equipment.Accessory, { slot: 'Accessory' });

    // 白兵戦デッキの役は戦闘開始時パッシブとして扱う
    meleeDeckIds = filterMinorDeckIds(meleeDeckIds, _catalogCache);
    shipDeckIds = filterMinorDeckIds(shipDeckIds, _catalogCache);
    const meleeDeckItemData = meleeDeckIds.map((id) => _catalogCache?.[id] || null);
    const tarotMeleeRole = evaluateDeckRole(meleeDeckItemData);
    const tarotRolePassive = getTarotRolePassive(tarotMeleeRole);
    const tarotBattleDeck = getTarotBattleDeck(meleeDeckIds, _catalogCache);

    if (stats.すばやさ === undefined && Number.isFinite(Number(stats.Agi))) {
        stats.すばやさ = Number(stats.Agi) || 0;
    }
    stats.かしこさ = (Number(stats.かしこさ || 0) || 0) + equipmentStats.Int;

    // 船デッキロール（戦闘では参照のみ）
    const shipDeckItemData = shipDeckIds.map((id) => _catalogCache?.[id] || null);
    const tarotShipRole = evaluateDeckRole(shipDeckItemData);

    return {
        id: playFabId,
        lineUserId: lineUserId,
        stats: stats,
        equipment: equipment,
        equipmentStats: equipmentStats,
        tarotMeleeRole,
        tarotRolePassive,
        tarotBattleDeck,
        tarotShipRole,
        meleeDeckIds,
        shipDeckIds,
        guardianArcanaItemId,
        currentPet,
        avatar: avatar,
        level: stats.Level
    };
}

// ----------------------------------------------------
// ★ v42: バトル計算を実行する共通関数 (exports)
// ----------------------------------------------------
async function runBattle(playerA, playerB) {
    if (!_lineClient) {
        console.error('runBattle: battle.js が初期化されていません。');
        throw new Error('battle.js is not initialized.');
    }

    return runMeleeBattle(playerA, playerB, {
        catalogCache: _catalogCache || {},
        random: Math.random,
        emitLog: async (messageText) => {
            console.log(`[バトルログ] ${messageText}`);
        }
    });
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
    const pruneBattlePairs = () => {
        const now = Date.now();
        for (const [key, expiresAt] of recentBattlePairs.entries()) {
            if (expiresAt <= now) recentBattlePairs.delete(key);
        }
    };
    const getPairKey = (a, b) => {
        const left = String(a || '');
        const right = String(b || '');
        return left < right ? `${left}|${right}` : `${right}|${left}`;
    };
    const normalizeRewardPlayerId = (value) => String(value || '').trim();
    const normalizeNavalDurationMap = (source) => {
        const map = {};
        Object.entries(source && typeof source === 'object' ? source : {}).forEach(([key, value]) => {
            const turns = typeof value === 'number'
                ? value
                : Number((value && typeof value === 'object' ? value.turns : 0) || 0);
            if (turns > 0) map[key] = { turns: Math.max(1, Math.floor(turns)) };
        });
        return map;
    };
    const normalizeNavalBoardingSideState = (source) => {
        const state = source && typeof source === 'object' ? source : {};
        return {
            morale: Math.max(-2, Math.min(2, Math.floor(Number(state.morale || 0) || 0))),
            crewHpPercent: Math.max(0, Math.min(100, Number(state.crewHpPercent ?? 100) || 100)),
            crewMpPercent: Math.max(0, Math.min(100, Number(state.crewMpPercent ?? 100) || 100)),
            statuses: normalizeNavalDurationMap(state.statuses)
        };
    };
    const normalizeNavalBoardingState = (source) => {
        const state = source && typeof source === 'object' ? source : null;
        if (!state) return null;
        return {
            player: normalizeNavalBoardingSideState(state.player),
            enemy: normalizeNavalBoardingSideState(state.enemy)
        };
    };
    const normalizeBattleRewardContext = (rawContext, attackerId = '', defenderId = '') => {
        const context = rawContext && typeof rawContext === 'object' ? rawContext : null;
        if (!context) return null;
        const source = String(context.source || context.type || '').trim();
        const mode = String(context.rewardMode || context.mode || '').trim();
        const outcome = String(context.navalOutcome || context.outcome || '').trim();
        if (source === 'explorationNpc' || mode === 'none' || context.npcBattle === true) {
            return null;
        }
        const isNavalPlunder = source === 'navalPlunder'
            || mode === 'boarded-loser-only'
            || outcome === 'boarding'
            || outcome === 'boarded'
            || context.boardedPlayerId
            || context.boardingPlayerId;
        if (!isNavalPlunder) return null;

        const attacker = normalizeRewardPlayerId(attackerId);
        const defender = normalizeRewardPlayerId(defenderId);
        const validIds = new Set([attacker, defender].filter(Boolean));
        let boardedPlayerId = normalizeRewardPlayerId(context.boardedPlayerId || context.boardedId || context.plunderLoserId);
        if (!boardedPlayerId && outcome === 'boarding') boardedPlayerId = defender;
        if (!boardedPlayerId && outcome === 'boarded') boardedPlayerId = attacker;
        if (validIds.size > 0 && boardedPlayerId && !validIds.has(boardedPlayerId)) boardedPlayerId = '';

        let boardingPlayerId = normalizeRewardPlayerId(context.boardingPlayerId || context.boarderPlayerId || context.plunderWinnerId);
        if (!boardingPlayerId && boardedPlayerId && attacker && defender) {
            boardingPlayerId = boardedPlayerId === attacker ? defender : attacker;
        }
        if (validIds.size > 0 && boardingPlayerId && !validIds.has(boardingPlayerId)) boardingPlayerId = '';

        return {
            source: 'navalPlunder',
            rewardMode: 'boarded-loser-only',
            navalOutcome: outcome || null,
            boardedPlayerId: boardedPlayerId || null,
            boardingPlayerId: boardingPlayerId || null,
            navalBoardingState: normalizeNavalBoardingState(context.navalBoardingState)
        };
    };
    const getBattleRewardDecision = (rewardContext, winnerId, loserId) => {
        if (!rewardContext || rewardContext.rewardMode !== 'boarded-loser-only') {
            return { allow: true, log: '' };
        }
        const loser = normalizeRewardPlayerId(loserId);
        const boarded = normalizeRewardPlayerId(rewardContext.boardedPlayerId);
        if (!boarded) {
            return { allow: false, log: '海戦の被接舷者を確認できないため、略奪は発生しなかった。' };
        }
        if (loser !== boarded) {
            return { allow: false, log: '乗り込んだ側が白兵戦で敗れたため、略奪は発生しなかった。' };
        }
        return { allow: true, log: '' };
    };
    const requireAuthedPlayFabId = async (req, res, playFabId) => {
        if (typeof requireAuthenticatedPlayFabId !== 'function') {
            return playFabId;
        }
        return requireAuthenticatedPlayFabId(req, res, playFabId);
    };
    const BOARDING_BLOCKED_ATTACKER_CLASSES = new Set(['explorer', 'common']);
    const BOARDING_PROTECTED_TARGET_CLASSES = new Set(['fighter', 'defender', 'merchant']);
    const SHIP_CLASS_LABELS = {
        common: '初期ボート',
        explorer: 'Explorer',
        fighter: 'Fighter',
        defender: 'Defender',
        merchant: 'Merchant',
        guild: 'ギルドシップ'
    };
    const normalizeShipClass = (raw) => {
        const key = String(raw || '').trim().toLowerCase();
        if (!key) return '';
        if (key === 'ship_common_boat' || key.includes('common')) return 'common';
        if (key.includes('explorer')) return 'explorer';
        if (key.includes('merchant')) return 'merchant';
        if (key.includes('defender')) return 'defender';
        if (key.includes('fighter')) return 'fighter';
        if (key === 'guild') return 'guild';
        return key;
    };
    const resolveShipClassFromItemId = (itemId) => {
        const key = String(itemId || '').trim().toLowerCase();
        if (!key) return '';
        if (key === 'ship_common_boat' || key.includes('common')) return 'common';
        if (key.includes('explorer')) return 'explorer';
        if (key.includes('merchant')) return 'merchant';
        if (key.includes('defender')) return 'defender';
        if (key.includes('fighter')) return 'fighter';
        return '';
    };
    const getShipClassLabel = (shipClass) => {
        const key = normalizeShipClass(shipClass);
        return SHIP_CLASS_LABELS[key] || '対象船';
    };
    const resolveShipCrewCapacity = (asset, itemId) => {
        const catalogItem = itemId ? _catalogCache?.[itemId] : null;
        const candidates = [
            asset?.Stats?.CrewCapacity,
            asset?.BaseStats?.CrewCapacity,
            asset?.CrewCapacity,
            catalogItem?.CrewCapacity,
            catalogItem?.Stats?.CrewCapacity,
            catalogItem?.CustomData?.CrewCapacity
        ];
        for (const value of candidates) {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
        }
        return 1;
    };
    const resolvePlayerActiveShipMeta = async (playFabId) => {
        if (!playFabId) return null;
        try {
            const activeResult = await _promisifyPlayFab(_PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['ActiveShipId']
            });
            const activeShipId = String(activeResult?.Data?.ActiveShipId?.Value || '').trim();
            if (!activeShipId) {
                return {
                    shipId: null,
                    itemId: 'ship_common_boat',
                    shipClass: 'common',
                    crewCapacity: resolveShipCrewCapacity(null, 'ship_common_boat')
                };
            }
            const shipResult = await _promisifyPlayFab(_PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: [`Ship_${activeShipId}`]
            });
            const raw = shipResult?.Data?.[`Ship_${activeShipId}`]?.Value;
            if (!raw) {
                return {
                    shipId: activeShipId,
                    itemId: null,
                    shipClass: '',
                    crewCapacity: 1
                };
            }
            const asset = JSON.parse(raw);
            const itemId = String(asset?.ItemId || '').trim();
            const classFromAsset = normalizeShipClass(asset?.ShipClass || asset?.Class || asset?.shipClass || asset?.class);
            const classFromCatalog = normalizeShipClass(_catalogCache?.[itemId]?.class || _catalogCache?.[itemId]?.Class);
            const classFromItemId = resolveShipClassFromItemId(itemId);
            const shipClass = classFromAsset || classFromCatalog || classFromItemId || '';
            const crewCapacity = resolveShipCrewCapacity(asset, itemId);
            return { shipId: activeShipId, itemId, shipClass, crewCapacity };
        } catch (error) {
            console.warn('[BattleRule] Failed to resolve active ship meta:', error?.errorMessage || error?.message || error);
            return null;
        }
    };
    const resolveDefenderShipMeta = async (defenderId) => {
        if (!defenderId) return null;
        try {
            const shipDoc = await firestore.collection('ships').doc(defenderId).get();
            if (shipDoc.exists) {
                const shipData = shipDoc.data() || {};
                if (shipData?.isGuildShip || shipData?.guildShip) {
                    return {
                        shipId: defenderId,
                        itemId: null,
                        shipClass: 'guild',
                        isGuildShip: true
                    };
                }
            }
        } catch (error) {
            console.warn('[BattleRule] Failed to resolve defender ship doc:', error?.message || error);
        }
        const meta = await resolvePlayerActiveShipMeta(defenderId);
        if (!meta) return null;
        return {
            ...meta,
            isGuildShip: false,
            shipClass: normalizeShipClass(meta.shipClass)
        };
    };
    const shouldBlockBoardingByShipClass = (attackerClass, defenderMeta) => {
        const attacker = normalizeShipClass(attackerClass);
        if (!BOARDING_BLOCKED_ATTACKER_CLASSES.has(attacker)) return false;
        if (defenderMeta?.isGuildShip) return true;
        const defenderClass = normalizeShipClass(defenderMeta?.shipClass);
        return BOARDING_PROTECTED_TARGET_CLASSES.has(defenderClass);
    };
    const normalizePartyEntry = (entry) => {
        if (entry && typeof entry === 'object') return entry;
        const id = String(entry || '').trim();
        return id ? { type: 'player', id } : null;
    };
    const isVirtualFighter = (entryOrPlayer) => {
        return !!(entryOrPlayer?.type === 'tarotCrew' || entryOrPlayer?.isVirtualFighter);
    };
    const getEffectiveFighterId = (entryOrPlayer) => {
        if (!entryOrPlayer) return '';
        if (isVirtualFighter(entryOrPlayer)) {
            return String(entryOrPlayer.ownerId || '').trim();
        }
        return String(entryOrPlayer.id || '').trim();
    };
    const getPartyEntryId = (entry) => String(normalizePartyEntry(entry)?.id || '').trim();
    const isTarotCourtCard = (itemData) => {
        const rank = String(itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || '').trim().toUpperCase();
        return ['PAGE', 'KNIGHT', 'QUEEN', 'KING'].includes(rank);
    };
    const isTarotCaptainSkillCard = (itemData) => {
        if (getCanonicalTarotCategory(itemData?.Category) !== 'TarotMinor') return false;
        const raw = String(itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || '').trim().toUpperCase();
        if (raw === 'A' || raw === 'ACE') return true;
        const number = Number(raw);
        return Number.isFinite(number) && number >= 1 && number <= 10;
    };
    const isTarotCrewCard = (itemData) => {
        const category = getCanonicalTarotCategory(itemData?.Category);
        return category === 'TarotMajor' || (category === 'TarotMinor' && isTarotCourtCard(itemData));
    };
    const getTarotCrewWeapon = (itemData) => {
        const category = getCanonicalTarotCategory(itemData?.Category);
        if (category === 'TarotMajor') return 'staff';
        const rank = String(itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || '').trim().toUpperCase();
        if (rank === 'PAGE' || rank === 'QUEEN') return 'staff';
        if (rank === 'KNIGHT') return 'polearm';
        if (rank === 'KING') return 'sword';
        return 'sword';
    };
    const getTarotCrewDisplayName = (itemId, itemData) => {
        const category = getCanonicalTarotCategory(itemData?.Category);
        if (category === 'TarotMajor') return getMajorArcanaTitle(itemData, itemData?.DisplayName || itemId);
        return String(itemData?.DisplayName || [itemData?.ArcanaSuit, getTarotRankLabel(itemData)].filter(Boolean).join(' ') || itemId).trim();
    };
    const buildTarotCrewSkills = (itemData, isMajor, rank, weapon) => {
        const rankKey = String(rank || '').trim().toUpperCase();
        const level = isMajor ? 3 : rankKey === 'KING' ? 3 : rankKey === 'KNIGHT' ? 2 : 1;
        const procChance = isMajor ? 0.28 : rankKey === 'KING' ? 0.24 : rankKey === 'KNIGHT' ? 0.22 : rankKey === 'QUEEN' ? 0.2 : 0.18;
        const powerMultiplier = isMajor ? 1.28 : rankKey === 'KING' ? 1.24 : rankKey === 'KNIGHT' ? 1.2 : rankKey === 'QUEEN' ? 1.16 : 1.12;
        const skillName = isMajor ? '大アルカナの一撃' : `${getTarotRankLabel(itemData) || 'タロット'}の一撃`;
        return [
            {
                id: `tarot-crew-weapon-${weapon}`,
                type: 'weapon',
                weapon,
                name: skillName,
                procChance,
                powerMultiplier
            },
            {
                id: `tarot-crew-passive-${weapon}`,
                type: 'passive',
                weapon,
                name: isMajor ? '大アルカナの加護' : 'コートカードの加護',
                level
            }
        ];
    };
    const buildTarotCrewProfile = (ownerProfile, cardId, itemData, index) => {
        const category = getCanonicalTarotCategory(itemData?.Category);
        const isMajor = category === 'TarotMajor';
        const suitInfo = isMajor ? getMajorArcanaSuitInfo(itemData) : null;
        const rank = String(itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || '').trim().toUpperCase();
        const suitKey = String(itemData?.ArcanaSuit || itemData?.Suit || suitInfo?.key || '').trim().toLowerCase();
        const baseLevel = Math.max(1, Number(ownerProfile?.level || ownerProfile?.stats?.Level || 1) || 1);
        const power = Number(itemData?.Power || itemData?.Atk || 0) || 0;
        const defense = Number(itemData?.Defense || itemData?.Def || 0) || 0;
        const intValue = Number(itemData?.Int || itemData?.Intelligence || itemData?.MagicPower || 0) || 0;
        const agiValue = Number(itemData?.Agi || itemData?.Speed || 0) || 0;
        const rankPower = rank === 'KING' ? 10 : rank === 'KNIGHT' ? 8 : rank === 'QUEEN' ? 6 : rank === 'PAGE' ? 4 : 0;
        const majorPower = isMajor ? 14 : 0;
        const maxHp = Math.max(28, Math.floor((Number(ownerProfile?.stats?.MaxHP || 80) || 80) * (isMajor ? 0.55 : 0.38)) + defense * 2 + majorPower);
        const attackStat = Math.max(6, Math.floor((Number(ownerProfile?.stats?.こうげき || ownerProfile?.stats?.Power || 20) || 20) * (isMajor ? 0.42 : 0.3)) + power + rankPower);
        const defenseStat = Math.max(3, Math.floor((Number(ownerProfile?.stats?.みのまもり || ownerProfile?.stats?.Defense || 12) || 12) * (isMajor ? 0.38 : 0.28)) + defense);
        const speedStat = Math.max(4, Math.floor((Number(ownerProfile?.stats?.すばやさ || 12) || 12) * (isMajor ? 0.38 : 0.32)) + agiValue);
        const intStat = Math.max(3, Math.floor((Number(ownerProfile?.stats?.かしこさ || 10) || 10) * (isMajor ? 0.38 : 0.3)) + intValue);
        const displayName = getTarotCrewDisplayName(cardId, itemData);
        const weapon = getTarotCrewWeapon(itemData);
        return {
            id: `tarotCrew:${ownerProfile.id}:${cardId}:${index}`,
            ownerId: ownerProfile.id,
            isVirtualFighter: true,
            type: 'tarotCrew',
            level: Math.max(1, Math.floor(baseLevel * (isMajor ? 0.75 : 0.55))),
            lineUserId: null,
            avatar: {
                ...(ownerProfile.avatar || {}),
                tarotCrew: true,
                cardId,
                suit: suitKey || suitInfo?.key || 'none'
            },
            equipment: {
                RightHand: { customData: { Category: 'Weapon', ManifestWeaponType: weapon } },
                LeftHand: null,
                Armor: null,
                Accessory: null
            },
            skills: buildTarotCrewSkills(itemData, isMajor, rank, weapon),
            tarotAwakeningBattle: null,
            stats: {
                DisplayName: isMajor ? `大アルカナ ${displayName}` : `船員 ${displayName}`,
                Level: baseLevel,
                HP: maxHp,
                MaxHP: maxHp,
                CurrentHP: maxHp,
                MP: isMajor || weapon === 'staff' ? Math.max(8, Math.floor(maxHp * 0.35)) : 0,
                MaxMP: isMajor || weapon === 'staff' ? Math.max(8, Math.floor(maxHp * 0.35)) : 0,
                CurrentMP: isMajor || weapon === 'staff' ? Math.max(8, Math.floor(maxHp * 0.35)) : 0,
                こうげき: attackStat,
                みのまもり: defenseStat,
                すばやさ: speedStat,
                かしこさ: intStat,
                Power: attackStat,
                Defense: defenseStat,
                Agi: speedStat,
                Int: intStat
            }
        };
    };
    const buildMeleeParty = async (hostId) => {
        if (!hostId) return [];
        const hostProfile = await getPlayerFullProfile(hostId);
        return [{ type: 'player', id: hostId, profile: hostProfile }];
    };
    const getPlayerNation = async (playFabId) => {
        if (!playFabId) return '';
        try {
            const result = await _promisifyPlayFab(_PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['Nation']
            });
            return String(result?.Data?.Nation?.Value || '').trim().toLowerCase();
        } catch (error) {
            console.warn('[Battle] Failed to resolve nation:', error?.errorMessage || error?.message || error);
            return '';
        }
    };
    const getWorldMapCollection = (mapId) => {
        const raw = String(mapId || '').trim();
        if (!raw) return firestore.collection('world_map');
        return firestore.collection(`world_map_${raw}`);
    };
    const normalizeCaptureQueueEntries = (raw) => {
        if (!Array.isArray(raw)) return [];
        return raw
            .map((entry) => ({
                playFabId: String(entry?.playFabId || '').trim(),
                nation: String(entry?.nation || '').trim().toLowerCase() || null,
                joinedAt: Number(entry?.joinedAt) || 0
            }))
            .filter((entry) => entry.playFabId);
    };
    const getCaptureSpeedMultiplier = (memberCount) => {
        const count = Math.max(1, Math.floor(Number(memberCount) || 1));
        return Math.min(4, 1 + ((count - 1) * 0.5));
    };
    const updateIslandCaptureAfterBattle = async ({ islandId, mapId, remainingDefenderIds }) => {
        if (!islandId || !mapId) return null;
        const islandRef = getWorldMapCollection(mapId).doc(islandId);
        const now = Date.now();
        return firestore.runTransaction(async (tx) => {
            const snap = await tx.get(islandRef);
            if (!snap.exists) throw new Error('IslandNotFound');
            const data = snap.data() || {};
            const currentState = data.captureState || {};
            const currentQueue = normalizeCaptureQueueEntries(currentState.queue);
            const survivorSet = new Set(
                Array.isArray(remainingDefenderIds)
                    ? remainingDefenderIds.map((entry) => String(entry || '').trim()).filter(Boolean)
                    : []
            );
            const nextQueue = currentQueue.filter((entry) => survivorSet.has(entry.playFabId));
            const baseDurationMs = Math.max(0, Number(currentState.baseDurationMs) || 0);
            const progressBaseMs = Math.max(
                0,
                Math.min(baseDurationMs || Number(currentState.progressBaseMs) || 0, Number(currentState.progressBaseMs) || 0)
            );
            const breachedAt = Number(currentState.breachedAt) || now;
            let nextState;
            if (nextQueue.length > 0) {
                const speed = getCaptureSpeedMultiplier(nextQueue.length);
                const remainingBaseMs = Math.max(0, baseDurationMs - progressBaseMs);
                nextState = {
                    ...currentState,
                    status: 'capturing',
                    breachedAt,
                    queue: nextQueue,
                    progressBaseMs,
                    lastProgressAt: now,
                    endsAt: remainingBaseMs <= 0 ? now : now + Math.ceil(remainingBaseMs / speed),
                    ownerCandidateId: nextQueue[0].playFabId,
                    ownerCandidateNation: nextQueue[0].nation || null
                };
            } else {
                nextState = {
                    ...currentState,
                    status: 'breached',
                    breachedAt,
                    queue: [],
                    progressBaseMs: 0,
                    lastProgressAt: 0,
                    endsAt: 0,
                    ownerCandidateId: null,
                    ownerCandidateNation: null
                };
            }
            tx.update(islandRef, {
                captureState: nextState,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
            return nextState;
        });
    };
    const getCapitalNationFromIsland = (islandData = {}, mapId = '') => {
        const explicitNation = String(islandData.ownerNation || islandData.nation || '').trim().toLowerCase();
        if (explicitNation) return explicitNation;
        const mapKey = String(mapId || islandData.mapId || '').trim().toLowerCase();
        if (mapKey === 'wands') return 'fire';
        if (mapKey === 'pentacles') return 'earth';
        if (mapKey === 'cups') return 'water';
        if (mapKey === 'swords') return 'wind';
        return '';
    };
    const getCapitalCaptureSpeedMultiplier = (memberCount) => {
        const count = Math.max(1, Math.floor(Number(memberCount) || 1));
        return Math.min(4, 1 + ((count - 1) * 0.5));
    };
    const updateCapitalCaptureAfterBattle = async ({ nation, remainingDefenderIds }) => {
        const nationKey = String(nation || '').trim().toLowerCase();
        if (!nationKey) return null;
        const warRef = firestore.collection('nation_wars').doc(nationKey);
        const now = Date.now();
        return firestore.runTransaction(async (tx) => {
            const snap = await tx.get(warRef);
            const currentState = normalizeNationWarState(snap.exists ? (snap.data() || {}) : null, nationKey, now);
            const currentCapture = currentState.capitalCaptureState || {};
            const currentQueue = Array.isArray(currentCapture.queue) ? currentCapture.queue : [];
            const survivorSet = new Set(
                Array.isArray(remainingDefenderIds)
                    ? remainingDefenderIds.map((entry) => String(entry || '').trim()).filter(Boolean)
                    : []
            );
            const nextQueue = currentQueue.filter((entry) => survivorSet.has(entry.playFabId));
            const baseDurationMs = Math.max(0, Number(currentCapture.baseDurationMs) || 0);
            const progressBaseMs = Math.max(
                0,
                Math.min(baseDurationMs || Number(currentCapture.progressBaseMs) || 0, Number(currentCapture.progressBaseMs) || 0)
            );
            const breachedAt = Number(currentCapture.breachedAt) || now;
            let nextCaptureState;
            if (Number(currentCapture.raidUnlockedAtMs) > 0) {
                nextCaptureState = currentCapture;
            } else if (currentState.capitalStatus.walls > CAPITAL_CAPTURE_BREACH_WALLS) {
                nextCaptureState = {
                    ...currentCapture,
                    status: 'idle',
                    breachedAt: 0,
                    queue: [],
                    progressBaseMs: 0,
                    lastProgressAt: 0,
                    endsAt: 0,
                    ownerCandidateId: null,
                    ownerCandidateNation: null
                };
            } else if (nextQueue.length > 0) {
                const speed = getCapitalCaptureSpeedMultiplier(nextQueue.length);
                const remainingBaseMs = Math.max(0, baseDurationMs - progressBaseMs);
                nextCaptureState = {
                    ...currentCapture,
                    status: 'capturing',
                    breachedAt,
                    queue: nextQueue,
                    progressBaseMs,
                    lastProgressAt: now,
                    endsAt: remainingBaseMs <= 0 ? now : now + Math.ceil(remainingBaseMs / speed),
                    ownerCandidateId: nextQueue[0].playFabId,
                    ownerCandidateNation: nextQueue[0].nation || null
                };
            } else {
                nextCaptureState = {
                    ...currentCapture,
                    status: 'breached',
                    breachedAt,
                    queue: [],
                    progressBaseMs: 0,
                    lastProgressAt: 0,
                    endsAt: 0,
                    ownerCandidateId: null,
                    ownerCandidateNation: null
                };
            }
            const nextState = {
                ...currentState,
                capitalCaptureState: nextCaptureState,
                updatedAtMs: now
            };
            tx.set(warRef, {
                ...nextState,
                nation: nationKey,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return nextState.capitalCaptureState;
        });
    };
    const runSequentialRideBattle = async ({ attackerId, defenderId, partyA, partyB, battleContext = null }) => {
        const battleRef = db.ref('battles').push();
        const battleId = battleRef.key;
        const rewardContext = normalizeBattleRewardContext(battleContext, attackerId, defenderId);
        const meleeNavalBoardingState = rewardContext?.navalBoardingState
            || normalizeNavalBoardingState(battleContext?.navalBoardingState);
        const getNavalBoardingStateForPlayer = (playFabId) => {
            const id = normalizeRewardPlayerId(playFabId);
            const state = meleeNavalBoardingState;
            if (!id || !state) return null;
            if (id === normalizeRewardPlayerId(attackerId)) return state.player || null;
            if (id === normalizeRewardPlayerId(defenderId)) return state.enemy || null;
            return null;
        };
        const playersPayload = {};
        const logEntries = {};
        const roundResults = [];
        const meleeDuels = [];
        let round = 1;
        let currentAIndex = 0;
        let currentBIndex = 0;
        let lastWinnerId = null;
        let lastLoserId = null;
        let lastWinnerOwnerId = null;
        let lastLoserOwnerId = null;
        let timeCursor = Date.now();
        const appendLog = (line) => {
            logEntries[timeCursor++] = line;
        };
        const readBattleSpeed = (player) => {
            const base = Number(player?.stats?.すばやさ ?? player?.stats?.Agi ?? player?.stats?.Speed ?? 1);
            const equipment = Number(player?.equipmentStats?.Agi ?? player?.equipmentStats?.Speed ?? 0);
            const value = (Number.isFinite(base) ? base : 1) + (Number.isFinite(equipment) ? equipment : 0);
            return Math.max(1, Math.floor(value));
        };
        const rememberPlayer = (player) => {
            if (!player?.id || playersPayload[player.id]) return;
            playersPayload[player.id] = {
                name: player.stats.DisplayName,
                hp: Math.max(0, Number(player.stats.CurrentHP || 0)),
                maxHp: player.stats.MaxHP,
                online: !isVirtualFighter(player),
                virtual: isVirtualFighter(player),
                ownerId: player.ownerId || null,
                level: player.level,
                stats: { すばやさ: readBattleSpeed(player) },
                avatar: player.avatar,
                equipment: player.equipment
            };
        };
        const getActiveShipIdForPlayer = async (playFabId) => {
            if (!playFabId) return null;
            try {
                const readOnly = await _promisifyPlayFab(_PlayFabServer.GetUserReadOnlyData, {
                    PlayFabId: playFabId,
                    Keys: ['ActiveShipId']
                });
                const value = readOnly?.Data?.ActiveShipId?.Value;
                return value ? String(value) : null;
            } catch (error) {
                console.warn('[RideBattle] Failed to resolve ActiveShipId:', error?.errorMessage || error?.message || error);
                return null;
            }
        };
        const respawnParty = async (partyIds) => {
            const respawnShip = app?.locals?.respawnShip;
            if (!respawnShip || !Array.isArray(partyIds) || partyIds.length === 0) return;
            const ownerIds = Array.from(new Set(partyIds
                .map((entry) => {
                    const normalized = normalizePartyEntry(entry);
                    return normalized?.type === 'player' ? normalized.id : normalized?.ownerId;
                })
                .filter(Boolean)));
            for (const playerId of ownerIds) {
                const shipId = await getActiveShipIdForPlayer(playerId);
                if (!shipId) continue;
                try {
                    await respawnShip(playerId, shipId, 'party_defeat');
                } catch (error) {
                    console.warn('[RideBattle] Failed to respawn party ship:', error?.message || error);
                }
            }
        };
        const resolvePartyFighter = async (entry) => {
            const normalized = normalizePartyEntry(entry);
            if (!normalized) return null;
            if (normalized.type === 'tarotCrew') {
                return null;
            }
            const sourceProfile = normalized.profile || await getPlayerFullProfile(normalized.id);
            const profile = sourceProfile ? JSON.parse(JSON.stringify(sourceProfile)) : null;
            const navalBoardingState = getNavalBoardingStateForPlayer(normalized.id);
            if (profile && navalBoardingState) {
                profile.navalBoardingState = navalBoardingState;
            }
            return profile;
        };

        [...partyA, ...partyB].forEach((entry) => {
            const normalized = normalizePartyEntry(entry);
            if (normalized?.type === 'player' && normalized.profile) {
                rememberPlayer(normalized.profile);
            }
        });

        while (currentAIndex < partyA.length && currentBIndex < partyB.length) {
            const fighterAEntry = normalizePartyEntry(partyA[currentAIndex]);
            const fighterBEntry = normalizePartyEntry(partyB[currentBIndex]);
            const fighterAId = getPartyEntryId(fighterAEntry);
            const fighterBId = getPartyEntryId(fighterBEntry);
            const playerA = await resolvePartyFighter(fighterAEntry);
            const playerB = await resolvePartyFighter(fighterBEntry);
            if (!playerA || !playerB) {
                appendLog('戦闘メンバーを解決できなかった...');
                break;
            }
            rememberPlayer(playerA);
            rememberPlayer(playerB);

            appendLog(`【連戦 ${round}】${playerA.stats.DisplayName} vs ${playerB.stats.DisplayName}`);
            const battleResult = await runBattle(playerA, playerB);
            (battleResult.logs || []).forEach((line) => appendLog(line));

            if (!battleResult?.winner || !battleResult?.loser) {
                appendLog('勝敗がつかなかった...');
                break;
            }

            const winnerId = battleResult.winner.id;
            const loserId = battleResult.loser.id;
            const winnerOwnerId = getEffectiveFighterId(battleResult.winner) || winnerId;
            const loserOwnerId = getEffectiveFighterId(battleResult.loser) || loserId;
            lastWinnerId = winnerId;
            lastLoserId = loserId;
            lastWinnerOwnerId = winnerOwnerId;
            lastLoserOwnerId = loserOwnerId;
            roundResults.push({
                round,
                attackerId: fighterAId,
                defenderId: fighterBId,
                winnerId,
                loserId,
                winnerOwnerId,
                loserOwnerId
            });
            meleeDuels.push({
                round,
                attackerId: fighterAId,
                defenderId: fighterBId,
                winnerId,
                loserId,
                winnerOwnerId,
                loserOwnerId,
                setup: battleResult.meleeSetup || null,
                timeline: Array.isArray(battleResult.meleeTimeline) ? battleResult.meleeTimeline : []
            });

            await Promise.all([battleResult.winner, battleResult.loser]
                .filter((player) => !isVirtualFighter(player))
                .map((player) => savePlayerHpMp(player)));
            if (!rewardContext && !isVirtualFighter(battleResult.winner) && !isVirtualFighter(battleResult.loser)) {
                try {
                    await handleBattleRewards(battleId, winnerId, loserId, `round_${round}`);
                } catch (rewardError) {
                    console.error(`[勝敗処理エラー] battleId: ${battleId}`, rewardError);
                }
            }
            if (!isVirtualFighter(battleResult.winner) && !isVirtualFighter(battleResult.loser)) {
                recentBattlePairs.set(getPairKey(winnerId, loserId), Date.now() + battlePairCooldownMs);
            }

            if (winnerId === fighterAId) {
                currentBIndex += 1;
            } else {
                currentAIndex += 1;
            }
            round += 1;
        }

        let defeatedParty = null;
        if (currentAIndex >= partyA.length && currentBIndex < partyB.length) {
            defeatedParty = partyA;
        } else if (currentBIndex >= partyB.length && currentAIndex < partyA.length) {
            defeatedParty = partyB;
        }
        if (defeatedParty && defeatedParty.length > 0) {
            appendLog('全員が敗北したため船が復活した。');
            await respawnParty(defeatedParty);
        }

        const finalBattleState = {
            status: 'finished',
            winner: lastWinnerOwnerId || lastWinnerId || null,
            lastActionPlayer: null,
            players: playersPayload,
            log: logEntries,
            rounds: roundResults,
            melee: {
                version: 1,
                duels: meleeDuels
            },
            rewardContext: rewardContext || null
        };

        await battleRef.set(finalBattleState);
        if (rewardContext && lastWinnerOwnerId && lastLoserOwnerId) {
            try {
                await handleBattleRewards(battleId, lastWinnerOwnerId, lastLoserOwnerId, 'plunder_final', rewardContext);
            } catch (rewardError) {
                console.error(`[勝敗処理エラー] battleId: ${battleId}`, rewardError);
            }
        }
        recentBattlePairs.set(getPairKey(attackerId, defenderId), Date.now() + battlePairCooldownMs);

        const invitationRef = db.ref('invitations').push();
        const invitationId = invitationRef.key;
        const attackerName = playersPayload[attackerId]?.name || attackerId;
        const defenderName = playersPayload[defenderId]?.name || defenderId;
        await invitationRef.set({
            status: 'started',
            battleId,
            from: { id: attackerId, name: attackerName },
            to: { id: defenderId, name: defenderName },
            createdAt: require('firebase-admin').database.ServerValue.TIMESTAMP
        });

        try {
            const notify = async (targetId, payload) => {
                await firestore
                    .collection('notifications')
                    .doc(targetId)
                    .collection('items')
                    .add({
                        type: 'battle_result',
                        battleId,
                        ...payload,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
            };
            for (const roundInfo of roundResults) {
                const winnerId = roundInfo.winnerId || null;
                const loserId = roundInfo.loserId || null;
                const winnerNotifyId = roundInfo.winnerOwnerId || winnerId;
                const loserNotifyId = roundInfo.loserOwnerId || loserId;
                if (winnerNotifyId && loserNotifyId && winnerNotifyId !== loserNotifyId) {
                    await notify(winnerNotifyId, { result: 'win', opponentId: loserNotifyId, round: roundInfo.round });
                }
                if (loserNotifyId && winnerNotifyId && loserNotifyId !== winnerNotifyId) {
                    await notify(loserNotifyId, { result: 'lose', opponentId: winnerNotifyId, round: roundInfo.round });
                }
            }
        } catch (notifyError) {
            console.warn('[RideBattle] Notification write failed:', notifyError?.message || notifyError);
        }

        return {
            battleId,
            invitationId,
            roundResults,
            remainingPartyA: currentAIndex < partyA.length ? partyA.slice(currentAIndex) : [],
            remainingPartyB: currentBIndex < partyB.length ? partyB.slice(currentBIndex) : []
        };
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
    // API 11: バトル実行 (自動戦闘・即時決着)
    // ----------------------------------------------------
    app.post('/api/start-battle', async (req, res) => {
        if (rejectRetiredLegacyBattle(res)) return;
        let { attackerId, defenderId, battleContext } = req.body;
        if (!attackerId || !defenderId) return res.status(400).json({ error: 'プレイヤーIDが不足しています。' });
        attackerId = await requireAuthedPlayFabId(req, res, attackerId);
        if (!attackerId) return;
        if (attackerId === defenderId) return res.status(400).json({ error: '自分自身とは対戦できません。' });
        const [attackerShipMeta, defenderShipMeta] = await Promise.all([
            resolvePlayerActiveShipMeta(attackerId),
            resolveDefenderShipMeta(defenderId)
        ]);
        const attackerClass = normalizeShipClass(
            attackerShipMeta?.shipClass || resolveShipClassFromItemId(attackerShipMeta?.itemId)
        );
        if (shouldBlockBoardingByShipClass(attackerClass, defenderShipMeta)) {
            const attackerLabel = getShipClassLabel(attackerClass);
            const defenderLabel = defenderShipMeta?.isGuildShip
                ? 'ギルドシップ'
                : getShipClassLabel(defenderShipMeta?.shipClass);
            return res.status(403).json({
                error: `${attackerLabel}では${defenderLabel}に乗り込めません。`,
                code: 'BOARDING_CLASS_RESTRICTED',
                attackerClass: attackerClass || null,
                defenderClass: defenderShipMeta?.isGuildShip ? 'guild' : normalizeShipClass(defenderShipMeta?.shipClass || '')
            });
        }
        pruneBattlePairs();
        const pairKey = getPairKey(attackerId, defenderId);
        const blockedUntil = recentBattlePairs.get(pairKey) || 0;
        if (blockedUntil > Date.now()) {
            return res.status(429).json({ error: '同一ペアの連続戦闘は一定時間できません。' });
        }

        console.log(`[バトル開始] ${attackerId} vs ${defenderId}`);
        try {
            const partyA = await buildMeleeParty(attackerId);
            const partyB = await buildMeleeParty(defenderId);
            const result = await runSequentialRideBattle({ attackerId, defenderId, partyA, partyB, battleContext });
            console.log(`[自動戦闘] バトル結果を保存しました: ${result.battleId}`);
            res.json({
                status: "Battle Finished",
                battleId: result.battleId,
                invitationId: result.invitationId
            });
        } catch (error) {
            console.error('[バトル作成エラー]', error.errorMessage || error.message || error);
            res.status(500).json({ error: 'バトル作成中にエラーが発生しました。', details: error.errorMessage || error.message });
        }
    });

    app.post('/api/start-island-capture-battle', async (req, res) => {
        if (rejectRetiredLegacyBattle(res)) return;
        let { attackerId, opponentId, islandId, mapId } = req.body || {};
        if (!attackerId || !islandId || !mapId) {
            return res.status(400).json({ error: 'attackerId, islandId, mapId are required' });
        }
        attackerId = await requireAuthedPlayFabId(req, res, attackerId);
        if (!attackerId) return;

        try {
            const islandRef = getWorldMapCollection(mapId).doc(islandId);
            const islandSnap = await islandRef.get();
            if (!islandSnap.exists) {
                return res.status(404).json({ error: 'IslandNotFound' });
            }

            const islandData = islandSnap.data() || {};
            const captureQueue = normalizeCaptureQueueEntries(islandData?.captureState?.queue);
            if (captureQueue.length === 0) {
                return res.status(409).json({ error: 'CaptureDefendersMissing' });
            }

            const defenderId = captureQueue[0].playFabId;
            if (!defenderId || defenderId === attackerId) {
                return res.status(409).json({ error: 'CaptureBattleInvalid' });
            }
            if (opponentId && String(opponentId) !== String(defenderId)) {
                return res.status(409).json({ error: 'CaptureBattleTargetChanged' });
            }

            const attackerNation = await getPlayerNation(attackerId);
            const defenderNation = String(captureQueue[0]?.nation || '').toLowerCase();
            if (attackerNation && defenderNation && attackerNation === defenderNation) {
                return res.status(403).json({ error: 'SameNationCaptureBattleBlocked' });
            }

            const [attackerShipMeta, defenderShipMeta] = await Promise.all([
                resolvePlayerActiveShipMeta(attackerId),
                resolveDefenderShipMeta(defenderId)
            ]);
            const attackerClass = normalizeShipClass(
                attackerShipMeta?.shipClass || resolveShipClassFromItemId(attackerShipMeta?.itemId)
            );
            if (shouldBlockBoardingByShipClass(attackerClass, defenderShipMeta)) {
                return res.status(403).json({ error: 'BOARDING_CLASS_RESTRICTED' });
            }

            pruneBattlePairs();
            const pairKey = getPairKey(attackerId, defenderId);
            const blockedUntil = recentBattlePairs.get(pairKey) || 0;
            if (blockedUntil > Date.now()) {
                return res.status(429).json({ error: 'BattleCooldownActive' });
            }

            const partyA = await buildMeleeParty(attackerId);
            const partyB = captureQueue.map((entry) => entry.playFabId).filter(Boolean);
            if (partyA.length === 0 || partyB.length === 0) {
                return res.status(409).json({ error: 'CaptureBattlePartyMissing' });
            }

            const result = await runSequentialRideBattle({
                attackerId,
                defenderId,
                partyA,
                partyB
            });

            const nextCaptureState = await updateIslandCaptureAfterBattle({
                islandId,
                mapId,
                remainingDefenderIds: result.remainingPartyB
            });

            res.json({
                status: 'Battle Finished',
                battleId: result.battleId,
                invitationId: result.invitationId,
                islandId,
                mapId,
                captureState: nextCaptureState || null
            });
        } catch (error) {
            console.error('[start-island-capture-battle] Error:', error?.errorMessage || error?.message || error);
            res.status(500).json({
                error: 'Failed to start island capture battle',
                details: error?.errorMessage || error?.message || String(error)
            });
        }
    });

    app.post('/api/start-capital-capture-battle', async (req, res) => {
        if (rejectRetiredLegacyBattle(res)) return;
        let { attackerId, opponentId, islandId, mapId } = req.body || {};
        if (!attackerId || !islandId || !mapId) {
            return res.status(400).json({ error: 'attackerId, islandId, mapId are required' });
        }
        attackerId = await requireAuthedPlayFabId(req, res, attackerId);
        if (!attackerId) return;

        try {
            const islandRef = getWorldMapCollection(mapId).doc(islandId);
            const islandSnap = await islandRef.get();
            if (!islandSnap.exists) {
                return res.status(404).json({ error: 'IslandNotFound' });
            }

            const islandData = islandSnap.data() || {};
            if (String(islandData.occupationStatus || '').trim().toLowerCase() !== 'capital') {
                return res.status(409).json({ error: 'CapitalBattleInvalid' });
            }

            const defenderNation = getCapitalNationFromIsland(islandData, mapId);
            if (!defenderNation) {
                return res.status(409).json({ error: 'CapitalNationMissing' });
            }

            const warRef = firestore.collection('nation_wars').doc(defenderNation);
            const warSnap = await warRef.get();
            const warState = normalizeNationWarState(warSnap.exists ? (warSnap.data() || {}) : null, defenderNation, Date.now());
            const captureQueue = Array.isArray(warState.capitalCaptureState?.queue)
                ? warState.capitalCaptureState.queue.filter((entry) => entry?.playFabId)
                : [];
            if (captureQueue.length === 0) {
                return res.status(409).json({ error: 'CapitalCaptureDefendersMissing' });
            }

            const defenderId = captureQueue[0].playFabId;
            if (!defenderId || defenderId === attackerId) {
                return res.status(409).json({ error: 'CapitalCaptureBattleInvalid' });
            }
            if (opponentId && String(opponentId) !== String(defenderId)) {
                return res.status(409).json({ error: 'CapitalCaptureTargetChanged' });
            }

            const attackerNation = await getPlayerNation(attackerId);
            if (attackerNation && defenderNation && attackerNation === defenderNation) {
                return res.status(403).json({ error: 'SameNationCaptureBattleBlocked' });
            }

            const [attackerShipMeta, defenderShipMeta] = await Promise.all([
                resolvePlayerActiveShipMeta(attackerId),
                resolveDefenderShipMeta(defenderId)
            ]);
            const attackerClass = normalizeShipClass(
                attackerShipMeta?.shipClass || resolveShipClassFromItemId(attackerShipMeta?.itemId)
            );
            if (shouldBlockBoardingByShipClass(attackerClass, defenderShipMeta)) {
                return res.status(403).json({ error: 'BOARDING_CLASS_RESTRICTED' });
            }

            pruneBattlePairs();
            const pairKey = getPairKey(attackerId, defenderId);
            const blockedUntil = recentBattlePairs.get(pairKey) || 0;
            if (blockedUntil > Date.now()) {
                return res.status(429).json({ error: 'BattleCooldownActive' });
            }

            const partyA = await buildMeleeParty(attackerId);
            const partyB = captureQueue.map((entry) => entry.playFabId).filter(Boolean);
            if (partyA.length === 0 || partyB.length === 0) {
                return res.status(409).json({ error: 'CapitalCaptureBattlePartyMissing' });
            }

            const result = await runSequentialRideBattle({
                attackerId,
                defenderId,
                partyA,
                partyB
            });

            const nextCaptureState = await updateCapitalCaptureAfterBattle({
                nation: defenderNation,
                remainingDefenderIds: result.remainingPartyB
            });

            res.json({
                status: 'Battle Finished',
                battleId: result.battleId,
                invitationId: result.invitationId,
                islandId,
                mapId,
                capitalNation: defenderNation,
                capitalCaptureState: nextCaptureState || null
            });
        } catch (error) {
            console.error('[start-capital-capture-battle] Error:', error?.errorMessage || error?.message || error);
            res.status(500).json({
                error: 'Failed to start capital capture battle',
                details: error?.errorMessage || error?.message || String(error)
            });
        }
    });

    // ----------------------------------------------------
    // API 18: 対戦招待を承諾し、バトルを開始する (★ v123で追加, v141で復活)
    // ----------------------------------------------------
    app.post('/api/accept-battle', async (req, res) => {
        let { playFabId, invitationId } = req.body;
        if (!playFabId || !invitationId) {
            return res.status(400).json({ error: 'リクエスト情報が不足しています。' });
        }
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

        console.log(`[招待承諾] invitationId: ${invitationId}, player: ${playFabId}`);

        const invitationRef = db.ref(`invitations/${invitationId}`);

        try {
            const snapshot = await invitationRef.once('value');
            const invitation = snapshot.val();

            if (!invitation || invitation.status !== 'pending' || invitation.to.id !== playFabId) {
                return res.status(400).json({ error: '無効な招待、または既に処理されています。' });
            }

            // --- 1. 両プレイヤーの全ステータスを読み込む ---
            const playerA = await getPlayerFullProfile(invitation.from.id); // 攻撃者
            const playerB = await getPlayerFullProfile(invitation.to.id);   // 防御者
            const readBattleSpeed = (player) => {
                const base = Number(player?.stats?.すばやさ ?? player?.stats?.Agi ?? player?.stats?.Speed ?? 1);
                const equipment = Number(player?.equipmentStats?.Agi ?? player?.equipmentStats?.Speed ?? 0);
                const value = (Number.isFinite(base) ? base : 1) + (Number.isFinite(equipment) ? equipment : 0);
                return Math.max(1, Math.floor(value));
            };

            // --- 2. Firebase Realtime Databaseに「バトル部屋」を作成 ---
            const battleRef = db.ref('battles').push();
            const battleId = battleRef.key;

            // ★ v137: ATBゲージの初期化
            const initialPlayers = {
                [playerA.id]: {
                    name: playerA.stats.DisplayName,
                    hp: playerA.stats.CurrentHP,
                    maxHp: playerA.stats.MaxHP,
                    online: true, // ★★★ 修正: オンライン状態フラグを追加
                    level: playerA.level, // ★★★ 修正: レベル情報を追加
                    stats: { すばやさ: readBattleSpeed(playerA) }, // ATB計算に必要なステータス
                    avatar: playerA.avatar,
                    equipment: playerA.equipment // ★ v147: アイテムIDのみを保存
                },
                [playerB.id]: {
                    name: playerB.stats.DisplayName,
                    hp: playerB.stats.CurrentHP,
                    maxHp: playerB.stats.MaxHP,
                    online: true, // ★★★ 修正: オンライン状態フラグを追加
                    level: playerB.level, // ★★★ 修正: レベル情報を追加
                    stats: { すばやさ: readBattleSpeed(playerB) },
                    avatar: playerB.avatar,
                    equipment: playerB.equipment // ★ v147: アイテムIDのみを保存
                }
            };

            const initialBattleState = {
                status: 'active',
                winner: null,
                lastActionPlayer: null, // ★ v139: 最後に行動したプレイヤー
                players: initialPlayers,
                log: {
                    [Date.now()]: `戦闘開始！`
                }
            };

            await battleRef.set(initialBattleState);
            console.log(`[リアルタイムバトル] バトル部屋を作成しました: ${battleId}`);

            // --- 3. 招待ステータスを更新し、両クライアントに通知 ---
            await invitationRef.update({
                status: 'started',
                battleId: battleId
            });

            // --- 4. 使用済みの招待をDBから削除する ---
            await invitationRef.remove();
            console.log(`[招待削除] 使用済みの招待 ${invitationId} を削除しました。`);

            // --- 5. 承諾したクライアントにバトルIDを返す ---
            res.json({
                status: "Battle Ready",
                battleId: battleId
            });

        } catch (error) {
            console.error('[招待承諾エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: '招待の承諾処理中にエラーが発生しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API 19: アイテム詳細情報を取得する (★ v147で追加)
    // ----------------------------------------------------
    app.post('/api/get-item-details', (req, res) => {
        const { itemIds } = req.body;
        if (!Array.isArray(itemIds)) {
            return res.status(400).json({ error: 'itemIdsは配列である必要があります。' });
        }

        const itemDetails = {};
        itemIds.forEach(id => {
            if (id && _catalogCache[id]) {
                const item = _catalogCache[id];
                itemDetails[id] = {
                    itemId: id,
                    name: item.DisplayName,
                    // ★ 修正: catalogCache の構造に合わせる
                    // catalogCache は DisplayName とカスタムデータがフラットに格納されている
                    // customData プロパティとして、item オブジェクト全体を渡す
                    customData: item
                };
            }
        });
        res.json(itemDetails);
    });

    // ----------------------------------------------------
    // API 17: リアルタイムバトルアクション実行 (★ v121で追加)
    // ----------------------------------------------------
    app.post('/api/battle-action', async (req, res) => {
        let { playFabId, battleId, action } = req.body;
        if (!playFabId || !battleId || !action) {
            return res.status(400).json({ error: 'リクエスト情報が不足しています。' });
        }
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

        console.log(`[バトルアクション] battleId: ${battleId}, player: ${playFabId}, action: ${action}`);

        const battleRef = db.ref(`battles/${battleId}`);
 
        // ★★★ v182: トランザクションを使って同時攻撃を防ぎ、安全に処理する ★★★
        // --- トランザクションの外で、時間のかかるプロフィール取得を先に行う ---
        try {
            const attackerId = playFabId;
            // ★★★ 修正: defenderIdを先に取得するために一度DBを読み込む ★★★
            const initialSnapshot = await battleRef.once('value');
            const initialBattleState = initialSnapshot.val();
            if (!initialBattleState || !initialBattleState.players) {
                return res.status(404).json({ error: 'バトルが見つかりません。' });
            }
            if (!initialBattleState.players[attackerId]) {
                return res.status(403).json({ error: 'このバトルの参加者ではありません。' });
            }
            const defenderId = Object.keys(initialBattleState.players).find(id => id !== attackerId);
            if (!defenderId) {
                 return res.status(404).json({ error: '対戦相手が見つかりません。' });
            }

            const attackerProfile = await getPlayerFullProfile(attackerId);
            const defenderProfile = await getPlayerFullProfile(defenderId);

            // --- ダメージ計算 ---
            const attackerWeapons = getBattleEquippedWeaponTypes(attackerProfile);
            const attackerMagic = getBattleMagicProfile(attackerProfile);
            const attackerAwakeningBattle = getBattleAwakeningBattleState(attackerProfile);
            const defenderAwakeningBattle = getBattleAwakeningBattleState(defenderProfile);
            const executeMultiplier = (() => {
                const threshold = Number(attackerAwakeningBattle.executeThreshold || 0) || 0;
                if (threshold <= 0) return 1;
                const defenderHpRate = (Number(defenderProfile.stats.CurrentHP || 0) || 0) / Math.max(1, Number(defenderProfile.stats.MaxHP || 1) || 1);
                if (defenderHpRate > threshold) return 1;
                return Number(attackerAwakeningBattle.executeMultiplier || 1) || 1;
            })();
            let finalDamage = 1;
            let actionLabel = 'こうげき';
            if (attackerWeapons.has('staff') && attackerMagic.baseAttackPower > 0) {
                finalDamage = calculateBattleMagicDamage(attackerProfile, defenderProfile, attackerMagic, {
                    powerMultiplier: 0.92,
                    totalMultiplier: (1 + Math.min((attackerMagic.castRate || 0) / 100, 0.25))
                        * (Number(attackerMagic.basicMagicMultiplier || 1) || 1)
                        * (Number(attackerAwakeningBattle.magicAttackMultiplier || 1) || 1)
                        * executeMultiplier
                });
                actionLabel = '魔力弾';
            } else {
                const weaponPower = attackerProfile.equipmentStats.Power || 0;
                const enemyDefense = (defenderProfile.stats.みのまもり || 0) + (defenderProfile.equipmentStats.Defense || 0);
                const baseDamage = weaponPower - enemyDefense;
                const multiplier = ((attackerProfile.stats.ちから * attackerProfile.stats.Level / 128) + 2);
                finalDamage = Math.max(
                    1,
                    Math.floor(
                        baseDamage
                        * multiplier
                        * (Number(attackerAwakeningBattle.attackMultiplier || 1) || 1)
                        * (Number(defenderAwakeningBattle.damageTakenMultiplier || 1) || 1)
                        * executeMultiplier
                    )
                );
            }
            const awakeningPhrase = buildBattleAwakeningActionPhrase(
                attackerProfile,
                attackerWeapons.has('staff') && attackerMagic.baseAttackPower > 0
                    ? { mode: 'basicMagic', executeActive: executeMultiplier > 1 }
                    : { mode: 'attack', executeActive: executeMultiplier > 1 }
            );

            // --- トランザクションで、チェックと更新をアトミックに行う ---
            battleRef.transaction((currentBattleState) => {
                if (!currentBattleState) {
                    return null; // リトライを促す
                }
                if (currentBattleState.status === 'finished') {
                    console.log('[トランザクション] 中断: バトル終了済み');
                    return; // 中断
                }
                if (!currentBattleState.players || !currentBattleState.players[attackerId] || !currentBattleState.players[defenderId]) {
                    console.log('[トランザクション] 中断: 参加者情報が不正');
                    return; // 中断
                }
                if (currentBattleState.players[attackerId].hp <= 0) {
                    console.log('[トランザクション] 中断: 攻撃者HPが0');
                    return; // 中断
                }
                if (!currentBattleState.log || typeof currentBattleState.log !== 'object') {
                    currentBattleState.log = {};
                }

                // ★★★ ここでダメージを反映 ★★★
                const newDefenderHp = Math.max(0, currentBattleState.players[defenderId].hp - finalDamage);
                currentBattleState.players[defenderId].hp = newDefenderHp;
                currentBattleState.log[Date.now()] = `${attackerProfile.stats.DisplayName} の${actionLabel}！ ${awakeningPhrase}${defenderProfile.stats.DisplayName} に ${finalDamage} のダメージ！`;
                currentBattleState.lastActionPlayer = attackerId;

                if (newDefenderHp <= 0) {
                    currentBattleState.status = 'finished';
                    currentBattleState.winner = attackerId;
                    currentBattleState.log[Date.now() + 1] = `${defenderProfile.stats.DisplayName} はたおれた！`;
                }
                return currentBattleState;

            }).then(async (result) => {
                if (!result.committed) {
                    console.log(`[バトルアクション] トランザクション中断 (競合または条件不一致): ${battleId}`);
                    return res.status(409).json({ error: 'アクションを処理できませんでした（競合発生）。' });
                }

                console.log(`[バトルアクション] トランザクション成功: ${battleId}`);

                // ★★★ ここから報酬処理を追加 ★★★
                const finalBattleState = result.snapshot.val();
                // このアクションでバトルが終了したかチェック
                if (finalBattleState && finalBattleState.status === 'finished') {
                    const winnerId = finalBattleState.winner;
                    const loserId = Object.keys(finalBattleState.players).find(id => id !== winnerId);

                    if (winnerId && loserId) {
                        try {
                            await handleBattleRewards(battleId, winnerId, loserId, null, finalBattleState.rewardContext || null);
                        } catch (rewardError) {
                            console.error(`[報酬処理エラー] battleId: ${battleId}`, rewardError);
                        }
                    }
                }

                res.json({ status: 'success', message: 'アクションを処理しました。' });

            }).catch(error => {
                console.error('[バトルアクション] トランザクションで致命的なエラーが発生しました:', error);
                res.status(500).json({ error: 'バトルアクション処理中にサーバーエラーが発生しました。' });
            });

        } catch (error) {
            console.error('[バトルアクション] プロフィール取得または事前処理でエラー:', error);
            res.status(500).json({ error: 'バトルアクション処理中にサーバーエラーが発生しました。' });
        }
    });

    // ★★★ 修正: 相手の切断による不戦勝を処理するAPIを追加 ★★★
    app.post('/api/claim-win-by-disconnect', async (req, res) => {
        let { playFabId, battleId } = req.body;
        if (!playFabId || !battleId) {
            return res.status(400).json({ error: 'リクエスト情報が不足しています。' });
        }
        playFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!playFabId) return;

        console.log(`[不戦勝処理] ${playFabId} が相手の切断を申告。 battleId: ${battleId}`);

        const battleRef = db.ref(`battles/${battleId}`);

        try {
            const snapshot = await battleRef.once('value');
            const battleState = snapshot.val();

            if (!battleState || battleState.status === 'finished') {
                console.log('[不戦勝処理] バトルは既に終了しています。');
                return res.json({ status: 'already_finished' });
            }
            if (!battleState.players || !battleState.players[playFabId]) {
                return res.status(403).json({ error: 'このバトルの参加者ではありません。' });
            }

            const opponentId = Object.keys(battleState.players).find(id => id !== playFabId);
            if (!opponentId || !battleState.players[opponentId]) {
                return res.status(404).json({ error: '対戦相手が見つかりません。' });
            }

            // 相手が本当にオフラインか確認
            if (battleState.players[opponentId].online === true) {
                console.log('[不戦勝処理] 相手はまだオンラインです。処理を中断します。');
                return res.status(400).json({ error: '相手はまだオンラインです。' });
            }

            // --- 不戦勝が確定 ---
            console.log(`[不戦勝処理] ${opponentId} の切断を確認。${playFabId} の勝利とします。`);

            // バトルを終了させる
            const updates = {};
            updates[`/status`] = 'finished';
            updates[`/winner`] = playFabId;
            updates[`/log/${Date.now()}`] = `${battleState.players[opponentId].name} の接続が切れました。`;
            updates[`/log/${Date.now() + 1}`] = `${battleState.players[playFabId].name} の不戦勝です！`;
            await battleRef.update(updates);

            // 報酬処理を実行
            try {
                await handleBattleRewards(battleId, playFabId, opponentId, null, battleState.rewardContext || null);
            } catch (rewardError) {
                console.error(`[報酬処理エラー@不戦勝] battleId: ${battleId}`, rewardError);
            }

            res.json({ status: 'success', message: '不戦勝が確定しました。' });

        } catch (error) {
            console.error('[不戦勝処理エラー]', error);
            res.status(500).json({ error: '不戦勝処理中にサーバーエラーが発生しました。' });
        }
    });


    // ★★★ 報酬処理用の非同期関数を追加 ★★★
    // Battle rewards only move gold. Bounty is calculated elsewhere from the current TROY rules.
    async function handleBattleRewards(battleId, winnerId, loserId, roundKey = null, battleContext = null) {
        console.log(`[battle-reward] start winner=${winnerId} loser=${loserId}`);
        const battleRef = db.ref(`battles/${battleId}`);
        const rewardContext = normalizeBattleRewardContext(battleContext);
        const rewardFlagRef = roundKey
            ? battleRef.child(`rewardProcessedRounds/${roundKey}`)
            : battleRef.child('rewardProcessed');
        const rewardLockSnapshot = await rewardFlagRef.transaction(current => {
            if (current) return;
            return { at: Date.now(), winnerId, loserId };
        });
        if (!rewardLockSnapshot.committed) {
            console.log(`[battle-reward] already processed: ${battleId}${roundKey ? ` ${roundKey}` : ''}`);
            return;
        }

        const rewardLogUpdates = {};
        const decision = getBattleRewardDecision(rewardContext, winnerId, loserId);
        if (!decision.allow) {
            console.log(`[battle-reward] skipped by context: ${decision.log}`);
            rewardLogUpdates[`log/${Date.now()}`] = decision.log;
            await battleRef.update(rewardLogUpdates);
            return;
        }

        const loserInventory = await getAllInventoryItems(loserId);
        const loserPs = getCurrencyBalanceFromItems(loserInventory, VIRTUAL_CURRENCY_CODE);
        const randomRate = Math.random() * (0.3 - 0.1) + 0.1;
        const pointsToSteal = Math.floor(loserPs * randomRate);

        if (pointsToSteal <= 0) {
            console.log('[battle-reward] no gold to steal');
            rewardLogUpdates[`log/${Date.now()}`] = 'しかし、奪えるものが何もなかった！';
            await battleRef.update(rewardLogUpdates);
            return;
        }

        await economy.subtractEconomyItem(loserId, VIRTUAL_CURRENCY_CODE, pointsToSteal, getEconomyDeps());
        await economy.addEconomyItem(winnerId, VIRTUAL_CURRENCY_CODE, pointsToSteal, getEconomyDeps());

        console.log(`[battle-reward] ${winnerId} stole ${pointsToSteal}${VIRTUAL_CURRENCY_CODE} from ${loserId}`);
        rewardLogUpdates[`log/${Date.now()}`] = `勝者は ${pointsToSteal}${VIRTUAL_CURRENCY_CODE} を奪った！`;
        await battleRef.update(rewardLogUpdates);

        const winnerInventory = await getAllInventoryItems(winnerId);
        const winnerNewBalance = getCurrencyBalanceFromItems(winnerInventory, VIRTUAL_CURRENCY_CODE);
        const loserNewBalance = Math.max(0, loserPs - pointsToSteal);
        await _promisifyPlayFab(_PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: winnerId,
            Statistics: [{ StatisticName: 'points_ranking', Value: winnerNewBalance }]
        });
        await _promisifyPlayFab(_PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: loserId,
            Statistics: [{ StatisticName: 'points_ranking', Value: loserNewBalance }]
        });
        console.log('[battle-reward] updated gold ranking only');
    }

}

// ★ v42: 共通関数を exports する
module.exports = {
    initializeBattleRoutes,
    getPlayerFullProfile,
    buildTarotKingdomCombatCharacter,
    runBattle,
    savePlayerHpMp
};
