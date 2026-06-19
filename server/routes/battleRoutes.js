// battle.js (v42 - 共通関数をexportsするように変更)
require('dotenv').config();
const economy = require('../economy');
const { getEntityKeyFromPlayFabId, withTitleEntityToken } = require('../playfab');
const { applyDerivedPlayerLevelToStats } = require('../playerLevel');
const { TAROT_DECK_DATA_KEY, MELEE_DECK_DATA_KEY, SHIP_DECK_DATA_KEY, evaluateDeckRole } = require('../tarotDeck');
const { getTarotRolePassive } = require('../tarotRoles');
const { getTarotBattleDeck } = require('../tarotBattleSkills');
const {
    getCanonicalTarotCategory,
    getMajorArcanaSuitInfo,
    getMajorArcanaTitle,
    getTarotRankLabel
} = require('../tarotCards');
const {
    CAPITAL_CAPTURE_BREACH_WALLS,
    normalizeNationWarState
} = require('../nationWarWeapons');
const { getAvatarColorForNation } = require('../nation');

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

async function getEntityKeyForPlayFabId(playFabId) {
    const result = await _promisifyPlayFab(_PlayFabServer.GetPlayerProfile, {
        PlayFabId: playFabId,
        ProfileConstraints: { ShowEntity: true }
    });
    return result?.PlayerProfile?.Entity || null;
}

async function getAllInventoryItems(playFabId) {
    const entityKey = await getEntityKeyForPlayFabId(playFabId);
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

function normalizeBattleSkillWeapon(weapon) {
    const key = String(weapon || '').toLowerCase();
    if (!key) return '';
    if (key === 'spear') return 'polearm';
    if (key === 'wand') return 'staff';
    if (key === 'book' || key === 'orb' || key === 'catalyst' || key === 'relic') return 'staff';
    return key;
}

function getBattleEquippedWeaponTypes(player) {
    const types = new Set();
    const right = resolveBattleWeaponType(player?.equipment?.RightHand);
    const left = resolveBattleWeaponType(player?.equipment?.LeftHand);
    if (right) types.add(right);
    if (left) types.add(left);
    return types;
}

function getBattleSkillType(entry) {
    const raw = String(entry?.type || entry?.skillType || entry?.category || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'spell') return 'magic';
    if (raw.includes('passive')) return 'passive';
    if (raw.includes('magic') || raw.includes('spell')) return 'magic';
    if (raw.includes('weapon') || raw.includes('attack')) return 'weapon';
    return raw;
}

function getBattleSkillLabel(entry, fallback) {
    return entry?.name || entry?.skillName || entry?.displayName || fallback;
}

function getBattleSkillWeapon(entry) {
    return normalizeBattleSkillWeapon(entry?.weapon || entry?.skillWeapon || entry?.requiredWeapon || entry?.weaponType || '');
}

function getBattleSkillNumber(entry, keys, fallback = 0) {
    if (!entry || !Array.isArray(keys)) return fallback;
    for (const key of keys) {
        const value = Number(entry?.[key]);
        if (Number.isFinite(value)) return value;
    }
    return fallback;
}

function normalizeBattleMultiplier(value, fallback = 1) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return fallback;
    return num > 10 ? num / 100 : num;
}

function normalizeBattleRate(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return num > 1 ? num / 100 : num;
}

function getBattleMagicSkillKind(entry) {
    const raw = String(
        entry?.magicKind
        || entry?.effectType
        || entry?.targetType
        || entry?.action
        || entry?.effect
        || ''
    ).trim().toLowerCase();
    if (raw.includes('heal') || raw.includes('recovery') || raw.includes('support') || raw.includes('restore')) {
        return 'heal';
    }
    return 'attack';
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

function calculateBattleMagicHeal(player, magicProfile, options = {}) {
    const intellect = Number(player?.stats?.かしこさ || 0) || 0;
    const base = (magicProfile?.baseAttackPower || 1) + (magicProfile?.healPower || 0) + Math.floor(intellect / 5);
    return Math.max(8, Math.floor(base * (options.totalMultiplier || 1)));
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
async function getPlayerFullProfile(playFabId) {
    if (!_promisifyPlayFab || !_PlayFabServer || !_catalogCache) {
        console.error('getPlayerFullProfile: battle.js が初期化されていません。');
        throw new Error('battle.js is not initialized.');
    }

    const statsPromise = _promisifyPlayFab(_PlayFabServer.GetPlayerStatistics, { PlayFabId: playFabId });
    const equipmentPromise = _promisifyPlayFab(_PlayFabServer.GetUserReadOnlyData, {
        // ★ v122: アバター情報も取得するようにキーを追加
        PlayFabId: playFabId, Keys: [
            "Equipped_RightHand", "Equipped_LeftHand", "Equipped_Armor", "Equipped_Accessory", "lineUserId",
            "Race", "Nation", "AvatarColor", "SkinColorIndex", "FaceIndex", "HairStyleIndex", "FacialHairStyleIndex",
            TAROT_DECK_DATA_KEY,
            MELEE_DECK_DATA_KEY,
            SHIP_DECK_DATA_KEY
        ]
    });
    const profilePromise = _promisifyPlayFab(_PlayFabServer.GetPlayerProfile, {
        PlayFabId: playFabId, ProfileConstraints: { ShowDisplayName: true }
    });
    // ★★★ 修正点: インベントリ全体を取得して、InstanceId と ItemId の対応表を作る ★★★
    const inventoryPromise = getAllInventoryItems(playFabId);

    const [statsResult, equipmentResult, profileResult, inventoryResult] = await Promise.all([statsPromise, equipmentPromise, profilePromise, inventoryPromise]);

    // InstanceId をキー、ItemId を値とするマップを作成
    const instanceIdToItemIdMap = {};
    if (Array.isArray(inventoryResult)) {
        inventoryResult.forEach(item => {
            if (item?.StackId && item?.Id) {
                instanceIdToItemIdMap[item.StackId] = item.Id;
            }
        });
    }

    const stats = {};
    if (statsResult.Statistics) {
        statsResult.Statistics.forEach(stat => { stats[stat.StatisticName] = stat.Value; });
    }
    Object.assign(stats, applyDerivedPlayerLevelToStats(stats).stats);
    if (!stats.MaxHP) stats.MaxHP = stats.HP;
    if (!stats.MaxMP) stats.MaxMP = stats.MP;
    stats.CurrentHP = stats.HP;
    stats.CurrentMP = stats.MP;
    stats.DisplayName = profileResult.PlayerProfile.DisplayName || '（名前なし）';

    const equipment = {}; // ここには最終的に ItemId を格納する
    const avatar = {}; // ★ v122: アバター情報を格納するオブジェクト
    let lineUserId = null;
    let meleeDeckIds = [];
    let shipDeckIds = [];
    if (equipmentResult.Data) {
        const resolveEquippedValue = (rawValue) => {
            const value = rawValue ? String(rawValue).trim() : '';
            if (!value) return null;
            return instanceIdToItemIdMap[value] || value;
        };
        // ★★★ 修正点: InstanceId から ItemId に変換して格納する ★★★
        const rightHandInstanceId = equipmentResult.Data.Equipped_RightHand ? equipmentResult.Data.Equipped_RightHand.Value : null;
        if (rightHandInstanceId) equipment.RightHand = resolveEquippedValue(rightHandInstanceId);

        const leftHandInstanceId = equipmentResult.Data.Equipped_LeftHand ? equipmentResult.Data.Equipped_LeftHand.Value : null;
        if (leftHandInstanceId) equipment.LeftHand = resolveEquippedValue(leftHandInstanceId);

        const armorInstanceId = equipmentResult.Data.Equipped_Armor ? equipmentResult.Data.Equipped_Armor.Value : null;
        if (armorInstanceId) equipment.Armor = resolveEquippedValue(armorInstanceId);

        const accessoryInstanceId = equipmentResult.Data.Equipped_Accessory ? equipmentResult.Data.Equipped_Accessory.Value : null;
        if (accessoryInstanceId) equipment.Accessory = resolveEquippedValue(accessoryInstanceId);

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
        {
            const rawFacialHairStyle = equipmentResult.Data.FacialHairStyleIndex?.Value;
            avatar.FacialHairStyleIndex = rawFacialHairStyle === undefined || rawFacialHairStyle === null || rawFacialHairStyle === ''
                ? 1
                : Math.max(0, Number(rawFacialHairStyle) || 0);
        }
        avatar.level = Number(stats.Level || 1) || 1;

        // タロットデッキ読み込み
        try {
            const commonDeckIds = JSON.parse(equipmentResult.Data[TAROT_DECK_DATA_KEY]?.Value || 'null');
            if (Array.isArray(commonDeckIds)) {
                meleeDeckIds = commonDeckIds;
                shipDeckIds = commonDeckIds;
            } else {
                meleeDeckIds = JSON.parse(equipmentResult.Data[MELEE_DECK_DATA_KEY]?.Value || '[]');
                if (!Array.isArray(meleeDeckIds)) meleeDeckIds = [];
                shipDeckIds = JSON.parse(equipmentResult.Data[SHIP_DECK_DATA_KEY]?.Value || '[]');
                if (!Array.isArray(shipDeckIds)) shipDeckIds = [];
            }
        } catch {
            meleeDeckIds = [];
            shipDeckIds = [];
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
        StatusRate: 0
    };
    const accumulateItemStats = (itemRef, options = {}) => {
        if (!itemRef) return;
        const itemData = getBattleItemData(itemRef);
        if (!itemData) return;
        const powerValue = Number(itemData.Power || itemData.Atk || 0) || 0;
        const defenseValue = Number(itemData.Defense || itemData.Def || 0) || 0;
        const agilityValue = Number(itemData.Agi || itemData.Speed || 0) || 0;
        const intelligenceValue = Number(itemData.Int || itemData.Intelligence || 0) || 0;
        const magicPowerValue = Number(itemData.MagicPower || 0) || 0;
        const healPowerValue = Number(itemData.HealPower || 0) || 0;
        const mpEfficiencyValue = Number(itemData.MpEfficiency || 0) || 0;
        const castRateValue = Number(itemData.CastRate || 0) || 0;
        const statusRateValue = Number(itemData.StatusRate || 0) || 0;
        if (options.replaceDefense) {
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
    accumulateItemStats(equipment.RightHand);
    accumulateItemStats(equipment.LeftHand);
    accumulateItemStats(equipment.Armor, { replaceDefense: true });
    accumulateItemStats(equipment.Accessory);

    // 白兵戦デッキの役は戦闘開始時パッシブとして扱う
    const meleeDeckItemData = meleeDeckIds.map((id) => _catalogCache?.[id] || null);
    const tarotMeleeRole = evaluateDeckRole(meleeDeckItemData);
    const tarotRolePassive = getTarotRolePassive(tarotMeleeRole);
    const tarotBattleDeck = getTarotBattleDeck(meleeDeckIds, _catalogCache);

    stats.すばやさ = (Number(stats.すばやさ || 0) || 0) + equipmentStats.Agi;
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

    const logs = [];
    const sendLogToBoth = async (messageText) => {
        logs.push(messageText);
        // 航海中のバトルではLINE通知が過剰になる可能性があるため、通知を（任意で）無効化
        /*
        try {
            if (playerA.lineUserId && playerB.lineUserId) {
                await Promise.all([
                    _lineClient.pushMessage(playerA.lineUserId, { type: 'text', text: messageText }),
                    _lineClient.pushMessage(playerB.lineUserId, { type: 'text', text: messageText })
                ]);
            }
        } catch (pushError) {
            console.error("プッシュメッセージの送信に失敗:", pushError.originalError ? pushError.originalError.response.data : pushError);
        }
        */
        console.log(`[バトルログ] ${messageText}`); // サーバーコンソールにはログを残す
    };

    const getEquippedWeaponTypes = (player) => {
        const types = new Set();
        const right = resolveBattleWeaponType(player?.equipment?.RightHand);
        const left = resolveBattleWeaponType(player?.equipment?.LeftHand);
        if (right) types.add(right);
        if (left) types.add(left);
        return types;
    };
    const getWeaponRange = (player) => {
        const types = getEquippedWeaponTypes(player);
        if (types.has('gun')) return 3;
        if (types.has('polearm') || types.has('staff')) return 2;
        return 1;
    };
    const getPlayerSkills = (player) => {
        const raw = player?.skills || {};
        return Object.values(raw).filter((entry) =>
            entry
            && typeof entry === 'object'
            && (entry.name || entry.skillName || entry.displayName || entry.id)
        );
    };
    const getSkillLabel = (entry, fallback) => getBattleSkillLabel(entry, fallback);
    const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));
    const rollChance = (chance) => Math.random() < clampValue(chance, 0, 1);
    const normalizeTarotSuitKey = (value) => {
        const key = String(value || '').trim().toLowerCase();
        if (!key) return '';
        if (['wand', 'wands', 'fire', '杖', '棒'].includes(key)) return 'wand';
        if (['sword', 'swords', 'wind', '剣'].includes(key)) return 'sword';
        if (['cup', 'cups', 'water', '聖杯', '杯'].includes(key)) return 'cup';
        if (['pentacle', 'pentacles', 'coin', 'coins', 'earth', '金貨', '硬貨'].includes(key)) return 'pentacle';
        return key;
    };
    const getTarotCaptainRankValue = (itemData) => {
        const raw = String(itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || '').trim().toUpperCase();
        if (raw === 'A' || raw === 'ACE') return 1;
        const value = Number(raw);
        return Number.isFinite(value) && value >= 1 && value <= 10 ? Math.floor(value) : 0;
    };
    const applyTarotCaptainSkillEffects = (player) => {
        const cards = Array.isArray(player?.tarotCaptainSkillCards) ? player.tarotCaptainSkillCards : [];
        if (!cards.length) return null;
        const summary = { wand: 0, sword: 0, cup: 0, pentacle: 0, count: 0 };
        cards.forEach((card) => {
            const itemData = card?.itemData || {};
            const rankValue = getTarotCaptainRankValue(itemData);
            if (!rankValue) return;
            const suit = normalizeTarotSuitKey(itemData?.ArcanaSuit || itemData?.Suit || itemData?.Element);
            if (!['wand', 'sword', 'cup', 'pentacle'].includes(suit)) return;
            summary[suit] += rankValue;
            summary.count += 1;
        });
        if (!summary.count) return null;

        player.equipmentStats = player.equipmentStats || {};
        player.stats = player.stats || {};
        const addStat = (key, amount) => {
            player.stats[key] = (Number(player.stats[key] || 0) || 0) + amount;
        };
        if (summary.wand > 0) {
            player.equipmentStats.Power = (Number(player.equipmentStats.Power || 0) || 0) + summary.wand;
            addStat('こうげき', summary.wand);
            addStat('Power', summary.wand);
        }
        if (summary.sword > 0) {
            addStat('すばやさ', summary.sword);
            addStat('Agi', summary.sword);
        }
        if (summary.cup > 0) {
            const hpBonus = summary.cup * 4;
            addStat('MaxHP', hpBonus);
            addStat('HP', hpBonus);
            addStat('CurrentHP', hpBonus);
        }
        if (summary.pentacle > 0) {
            player.equipmentStats.Defense = (Number(player.equipmentStats.Defense || 0) || 0) + summary.pentacle;
            addStat('みのまもり', summary.pentacle);
            addStat('Defense', summary.pentacle);
        }
        return summary;
    };
    const describeTarotCaptainSkill = (summary) => {
        if (!summary?.count) return '';
        const parts = [];
        if (summary.wand) parts.push(`杖 攻撃+${summary.wand}`);
        if (summary.sword) parts.push(`剣 速さ+${summary.sword}`);
        if (summary.cup) parts.push(`杯 HP+${summary.cup * 4}`);
        if (summary.pentacle) parts.push(`金貨 守備+${summary.pentacle}`);
        return parts.join(' / ');
    };
    const getSkillForWeapon = (skills, weapon, type, allowGeneric = false) => {
        if (!Array.isArray(skills) || !skills.length) return null;
        const target = normalizeBattleSkillWeapon(weapon);
        const match = skills.find((entry) => {
            if (type && getBattleSkillType(entry) !== type) return false;
            const entryWeapon = getBattleSkillWeapon(entry);
            if (entryWeapon) return entryWeapon === target;
            return allowGeneric;
        });
        return match || null;
    };
    const buildPassiveCounts = (skills, weapons) => {
        const counts = {
            sword: 0,
            axe: 0,
            blunt: 0,
            dagger: 0,
            shield: 0,
            polearm: 0,
            staff: 0,
            gun: 0
        };
        if (!Array.isArray(skills) || !skills.length) return counts;
        skills.forEach((entry) => {
            if (!entry || getBattleSkillType(entry) !== 'passive') return;
            const weapon = getBattleSkillWeapon(entry);
            if (!weapon || !(weapon in counts)) return;
            if (weapons && weapons.size && !weapons.has(weapon)) return;
            counts[weapon] += Math.max(1, Number(entry.level || 1) || 1);
        });
        return counts;
    };
    const buildPassiveBonuses = (counts) => {
        const safe = (value, min, max) => clampValue(value, min, max);
        const sword = counts.sword || 0;
        const axe = counts.axe || 0;
        const blunt = counts.blunt || 0;
        const dagger = counts.dagger || 0;
        const shield = counts.shield || 0;
        const polearm = counts.polearm || 0;
        const staff = counts.staff || 0;
        const gun = counts.gun || 0;
        return {
            attackMultiplier: safe(1 + 0.02 * sword + 0.03 * axe + 0.02 * blunt + 0.02 * dagger + 0.02 * polearm + 0.02 * gun + 0.015 * staff, 1, 1.35),
            defenseMultiplier: safe(1 - 0.02 * shield - 0.01 * staff - 0.01 * blunt - 0.01 * sword, 0.7, 1),
            dashBonus: 0.02 * dagger + 0.015 * axe + 0.01 * sword + 0.01 * blunt,
            knockbackBonus: 0.02 * shield,
            chargeBonus: 0.02 * staff,
            lungeBonus: 0.02 * polearm,
            snipeBonus: 0.02 * gun,
            evadeBonus: 0.02 * dagger,
            repositionBonus: 0.02 * gun,
            bluntBonus: 0.02 * blunt,
            daggerBonus: 0.015 * dagger,
            swordBonus: 0.015 * sword,
            axeBonus: 0.015 * axe,
            polearmBonus: 0.015 * polearm,
            gunBonus: 0.015 * gun,
            staffBonus: 0.015 * staff,
            skillProcBonus: 0
        };
    };
    const applyAwakeningToPassiveBonuses = (player, baseBonuses) => {
        const awakeningBattle = getBattleAwakeningBattleState(player);
        return {
            ...baseBonuses,
            attackMultiplier: (Number(baseBonuses?.attackMultiplier || 1) || 1) * (Number(awakeningBattle.attackMultiplier || 1) || 1),
            defenseMultiplier: (Number(baseBonuses?.defenseMultiplier || 1) || 1) * (Number(awakeningBattle.damageTakenMultiplier || 1) || 1),
            dashBonus: (Number(baseBonuses?.dashBonus || 0) || 0) + (Number(awakeningBattle.dashBonus || 0) || 0),
            knockbackBonus: (Number(baseBonuses?.knockbackBonus || 0) || 0) + (Number(awakeningBattle.knockbackBonus || 0) || 0),
            chargeBonus: (Number(baseBonuses?.chargeBonus || 0) || 0) + (Number(awakeningBattle.chargeBonus || 0) || 0),
            lungeBonus: (Number(baseBonuses?.lungeBonus || 0) || 0) + (Number(awakeningBattle.lungeBonus || 0) || 0),
            snipeBonus: (Number(baseBonuses?.snipeBonus || 0) || 0) + (Number(awakeningBattle.snipeBonus || 0) || 0),
            evadeBonus: (Number(baseBonuses?.evadeBonus || 0) || 0) + (Number(awakeningBattle.evadeBonus || 0) || 0),
            repositionBonus: (Number(baseBonuses?.repositionBonus || 0) || 0) + (Number(awakeningBattle.repositionBonus || 0) || 0),
            bluntBonus: Number(baseBonuses?.bluntBonus || 0) || 0,
            daggerBonus: Number(baseBonuses?.daggerBonus || 0) || 0,
            swordBonus: Number(baseBonuses?.swordBonus || 0) || 0,
            axeBonus: Number(baseBonuses?.axeBonus || 0) || 0,
            polearmBonus: Number(baseBonuses?.polearmBonus || 0) || 0,
            gunBonus: Number(baseBonuses?.gunBonus || 0) || 0,
            staffBonus: Number(baseBonuses?.staffBonus || 0) || 0,
            skillProcBonus: (Number(baseBonuses?.skillProcBonus || 0) || 0) + (Number(awakeningBattle.skillProcBonus || 0) || 0)
        };
    };
    const getPassiveLabel = (skills, weapon, fallback) => {
        const entry = getSkillForWeapon(skills, weapon, 'passive', false);
        return getSkillLabel(entry, fallback);
    };
    const getMagicSkillMeta = (entry, magicProfile) => {
        if (!entry || getBattleSkillType(entry) !== 'magic') return null;
        const kind = getBattleMagicSkillKind(entry);
        const mpCost = Math.max(
            1,
            Math.floor(
                (getBattleSkillNumber(entry, ['mpCost', 'cost', 'manaCost', 'mp'], 6) * (Number(magicProfile?.mpCostRate || 1) || 1))
                - Math.floor((magicProfile?.mpEfficiency || 0) / 3)
            )
        );
        const minRange = Math.max(1, getBattleSkillNumber(entry, ['minRange', 'rangeMin'], 1));
        const defaultMaxRange = magicProfile?.hasStaff ? 2 : 1;
        const maxRange = Math.max(
            minRange,
            getBattleSkillNumber(entry, ['maxRange', 'rangeMax', 'range'], defaultMaxRange) + Math.max(0, Number(magicProfile?.castRangeBonus || 0) || 0)
        );
        const powerMultiplier = normalizeBattleMultiplier(
            getBattleSkillNumber(entry, ['powerMultiplier', 'damageMultiplier', 'multiplier', 'powerRate', 'rate'], kind === 'heal' ? 1.05 : 1.18),
            kind === 'heal' ? 1.05 : 1.18
        );
        const hpThreshold = clampValue(
            normalizeBattleRate(getBattleSkillNumber(entry, ['healBelow', 'healThreshold', 'triggerHpRate', 'hpThreshold'], 0.55), 0.55)
                + (Number(magicProfile?.healThresholdBonus || 0) || 0),
            0.2,
            0.85
        );
        return { entry, kind, mpCost, minRange, maxRange, powerMultiplier, hpThreshold };
    };
    const chooseMagicSkill = (skills, weapons, magicProfile, player, distance) => {
        if (!Array.isArray(skills) || !skills.length) return null;
        const currentMp = Number(player?.stats?.CurrentMP ?? player?.stats?.MP ?? 0) || 0;
        const hpRate = (Number(player?.stats?.CurrentHP || 0) || 0) / Math.max(1, Number(player?.stats?.MaxHP || 1) || 1);
        const candidates = skills
            .filter((entry) => getBattleSkillType(entry) === 'magic')
            .map((entry) => {
                const requiredWeapon = getBattleSkillWeapon(entry);
                if (requiredWeapon && (!weapons || !weapons.has(requiredWeapon))) return null;
                if (!requiredWeapon && !magicProfile?.hasStaff && !magicProfile?.totalMagicPower) return null;
                const meta = getMagicSkillMeta(entry, magicProfile);
                if (!meta) return null;
                if (currentMp < meta.mpCost) return null;
                if (meta.kind !== 'heal' && (distance < meta.minRange || distance > meta.maxRange)) return null;
                return meta;
            })
            .filter(Boolean);
        const healCandidate = candidates
            .filter((meta) => meta.kind === 'heal' && hpRate <= meta.hpThreshold)
            .sort((a, b) => {
                const leftScore = (a.powerMultiplier * 100) + ((1 - hpRate) * 40) + ((magicProfile?.healPreference || 0) * 100) - (a.mpCost * 2);
                const rightScore = (b.powerMultiplier * 100) + ((1 - hpRate) * 40) + ((magicProfile?.healPreference || 0) * 100) - (b.mpCost * 2);
                return rightScore - leftScore || a.mpCost - b.mpCost;
            })[0];
        if (healCandidate) return healCandidate;
        return candidates
            .filter((meta) => meta.kind !== 'heal')
            .sort((a, b) => {
                const leftRangeFit = distance >= a.minRange && distance <= a.maxRange ? 1 : 0;
                const rightRangeFit = distance >= b.minRange && distance <= b.maxRange ? 1 : 0;
                const leftScore = (a.powerMultiplier * 100) + (leftRangeFit * 18) + ((magicProfile?.magicPreference || 0) * 100) - (a.mpCost * 2);
                const rightScore = (b.powerMultiplier * 100) + (rightRangeFit * 18) + ((magicProfile?.magicPreference || 0) * 100) - (b.mpCost * 2);
                return rightScore - leftScore || a.mpCost - b.mpCost;
            })[0] || null;
    };

    const applyBattleStartTarotRolePassive = async (player) => {
        const passive = player?.tarotRolePassive || getTarotRolePassive(player?.tarotMeleeRole);
        player.tarotRolePassive = passive;
        player.tarotShield = 0;
        if (!passive?.active) return passive;

        const hpRate = Number(passive.hpRate || 0) || 0;
        if (hpRate > 0) {
            const oldMaxHp = Math.max(1, Number(player.stats.MaxHP || player.stats.HP || player.stats.CurrentHP || 1) || 1);
            const newMaxHp = Math.max(1, Math.floor(oldMaxHp * (1 + hpRate)));
            const hpDelta = Math.max(0, newMaxHp - oldMaxHp);
            player.stats.MaxHP = newMaxHp;
            player.stats.HP = Math.max(Number(player.stats.HP || 0) || 0, newMaxHp);
            player.stats.CurrentHP = Math.min(newMaxHp, (Number(player.stats.CurrentHP || 0) || 0) + hpDelta);
        }

        const agilityMultiplier = Number(passive.agilityMultiplier || 1) || 1;
        if (agilityMultiplier !== 1) {
            const speed = Number(player.stats.すばやさ || player.stats.Agi || 1) || 1;
            const nextSpeed = Math.max(1, Math.floor(speed * agilityMultiplier));
            player.stats.すばやさ = nextSpeed;
            player.stats.Agi = nextSpeed;
        }

        const shieldRate = Number(passive.startingShieldRate || 0) || 0;
        if (shieldRate > 0) {
            player.tarotShield = Math.max(1, Math.floor((Number(player.stats.MaxHP || 1) || 1) * shieldRate));
        }

        await sendLogToBoth(`${player.stats.DisplayName} のタロット役「${passive.roleLabel}」: ${passive.bonusText}`);
        return passive;
    };

    await applyBattleStartTarotRolePassive(playerA);
    await applyBattleStartTarotRolePassive(playerB);

    // ★★★ 改良案: 逃走判定 ★★★
    // すばやさが高い方が、その差に応じて逃げやすくなる
    const agilityA = playerA.stats.すばやさ || 1;
    const agilityB = playerB.stats.すばやさ || 1;
    const escapeChance = (agilityA > agilityB)
        ? (agilityA - agilityB) / agilityA * 0.5 // すばやさの差が大きいほど確率UP (最大50%)
        : (agilityB - agilityA) / agilityB * 0.5;

    if (Math.random() < escapeChance) {
        const escaper = (agilityA > agilityB) ? playerA : playerB;
        const pursuer = (agilityA > agilityB) ? playerB : playerA;
        const log = `${escaper.stats.DisplayName} は ${pursuer.stats.DisplayName} からうまく逃げきった！`;
        console.log(`[バトルログ] ${log}`);
        return { winner: null, loser: null, logs: [log], escaped: true }; // 逃走成功
    }

    let attacker, defender;
    if (playerA.stats.すばやさ >= playerB.stats.すばやさ) {
        attacker = playerA; defender = playerB;
    } else {
        attacker = playerB; defender = playerA;
    }

    let distance = 5;
    const rangeMap = new Map([
        [playerA.id, getWeaponRange(playerA)],
        [playerB.id, getWeaponRange(playerB)]
    ]);
    const skillState = new Map([
        [playerA.id, { charged: false }],
        [playerB.id, { charged: false }]
    ]);
    const skillMap = new Map([
        [playerA.id, getPlayerSkills(playerA)],
        [playerB.id, getPlayerSkills(playerB)]
    ]);
    const weaponMap = new Map([
        [playerA.id, getEquippedWeaponTypes(playerA)],
        [playerB.id, getEquippedWeaponTypes(playerB)]
    ]);
    const passiveCountMap = new Map([
        [playerA.id, buildPassiveCounts(skillMap.get(playerA.id), weaponMap.get(playerA.id))],
        [playerB.id, buildPassiveCounts(skillMap.get(playerB.id), weaponMap.get(playerB.id))]
    ]);
    const passiveBonusMap = new Map([
        [playerA.id, applyAwakeningToPassiveBonuses(playerA, buildPassiveBonuses(passiveCountMap.get(playerA.id)))],
        [playerB.id, applyAwakeningToPassiveBonuses(playerB, buildPassiveBonuses(passiveCountMap.get(playerB.id)))]
    ]);
    const EMPTY_PASSIVE = buildPassiveBonuses({});
    const buildTarotRuntimeState = (player) => ({
        charged: false,
        tarotIndex: 0,
        tarotCooldown: 0,
        tarotDeck: Array.isArray(player?.tarotBattleDeck)
            ? player.tarotBattleDeck.filter(Boolean)
            : getTarotBattleDeck(player?.meleeDeckIds || [], _catalogCache || {}),
        attackBuffTurns: 0,
        attackBuffMultiplier: 1,
        attackDownTurns: 0,
        attackDownMultiplier: 1,
        guardTurns: 0,
        guardMultiplier: 1,
        defenseDownTurns: 0,
        defenseDownMultiplier: 1,
        speedBuffTurns: 0,
        speedBuffMultiplier: 1,
        speedDownTurns: 0,
        speedDownMultiplier: 1,
        burnTurns: 0,
        silenceTurns: 0,
        counterTurns: 0,
        counterMultiplier: 0.35
    });
    skillState.set(playerA.id, { ...buildTarotRuntimeState(playerA), ...(skillState.get(playerA.id) || {}) });
    skillState.set(playerB.id, { ...buildTarotRuntimeState(playerB), ...(skillState.get(playerB.id) || {}) });

    const normalizeBattleElementKey = (value) => {
        const raw = String(value || '').trim().toLowerCase();
        if (raw === '火' || raw === 'fire') return 'fire';
        if (raw === '水' || raw === 'water') return 'water';
        if (raw === '風' || raw === 'wind') return 'wind';
        if (raw === '地' || raw === 'earth') return 'earth';
        if (raw === '全属性' || raw === 'all') return 'all';
        if (raw === '無' || raw === '無属性' || raw === 'none' || raw === 'neutral') return 'none';
        return raw || 'none';
    };
    const getRolePassive = (player) => player?.tarotRolePassive || getTarotRolePassive(player?.tarotMeleeRole);
    const getStateAttackMultiplier = (state) => {
        let multiplier = 1;
        if ((state?.attackBuffTurns || 0) > 0) multiplier *= Number(state.attackBuffMultiplier || 1) || 1;
        if ((state?.attackDownTurns || 0) > 0) multiplier *= Number(state.attackDownMultiplier || 1) || 1;
        return multiplier;
    };
    const getStateDamageTakenMultiplier = (state) => {
        let multiplier = 1;
        if ((state?.guardTurns || 0) > 0) multiplier *= Number(state.guardMultiplier || 1) || 1;
        if ((state?.defenseDownTurns || 0) > 0) multiplier *= Number(state.defenseDownMultiplier || 1) || 1;
        return multiplier;
    };
    const getEffectiveSpeed = (player, state) => {
        let speed = Number(player?.stats?.すばやさ || player?.stats?.Agi || 1) || 1;
        if ((state?.speedBuffTurns || 0) > 0) speed *= Number(state.speedBuffMultiplier || 1) || 1;
        if ((state?.speedDownTurns || 0) > 0) speed *= Number(state.speedDownMultiplier || 1) || 1;
        return Math.max(1, Math.floor(speed));
    };
    const getRoleAttackMultiplier = (player, mode, elementKey) => {
        const passive = getRolePassive(player);
        let multiplier = Number(passive?.attackMultiplier || 1) || 1;
        if (mode === 'tarot') {
            const skillElement = normalizeBattleElementKey(elementKey);
            const roleElement = String(passive?.elementalElement || '').trim();
            const elementalMultiplier = Number(passive?.elementalSkillMultiplier || 1) || 1;
            if (
                elementalMultiplier > 1
                && skillElement !== 'none'
                && skillElement !== ''
                && (roleElement === 'any' || roleElement === 'all' || skillElement === 'all' || roleElement === skillElement)
            ) {
                multiplier *= elementalMultiplier;
            }
        }
        return multiplier;
    };
    const getRoleDamageTakenMultiplier = (player) => Number(getRolePassive(player)?.damageTakenMultiplier || 1) || 1;
    const getRoleAccuracyBonus = (player) => Number(getRolePassive(player)?.accuracyBonus || 0) || 0;
    const getRoleCriticalRate = (player) => Number(getRolePassive(player)?.criticalRateBonus || 0) || 0;
    const applyDamageToPlayer = (target, rawDamage) => {
        const totalDamage = Math.max(0, Math.floor(Number(rawDamage) || 0));
        let remaining = totalDamage;
        const shield = Math.max(0, Math.floor(Number(target?.tarotShield || 0) || 0));
        const absorbed = Math.min(shield, remaining);
        if (absorbed > 0) {
            target.tarotShield = shield - absorbed;
            remaining -= absorbed;
        }
        target.stats.CurrentHP = (Number(target.stats.CurrentHP || 0) || 0) - remaining;
        return {
            totalDamage,
            hpDamage: remaining,
            absorbed,
            remainingShield: Math.max(0, Math.floor(Number(target.tarotShield || 0) || 0))
        };
    };
    const formatShieldSuffix = (damageResult) => damageResult?.absorbed > 0
        ? `（シールドが ${damageResult.absorbed} 吸収 / 残り${damageResult.remainingShield}）`
        : '';
    const maybeApplyCritical = (player, damage, mode) => {
        const rate = mode === 'magic' ? 0 : getRoleCriticalRate(player);
        if (rate > 0 && rollChance(rate)) {
            return { damage: Math.max(1, Math.floor(damage * 1.5)), critical: true };
        }
        return { damage, critical: false };
    };
    const decrementTimedState = (state) => {
        [
            'attackBuffTurns',
            'attackDownTurns',
            'guardTurns',
            'defenseDownTurns',
            'speedBuffTurns',
            'speedDownTurns',
            'silenceTurns',
            'counterTurns'
        ].forEach((key) => {
            if ((state[key] || 0) > 0) state[key] -= 1;
        });
    };
    const applyTurnStartTarotStatus = async (player, state) => {
        if ((state?.burnTurns || 0) <= 0) return null;
        const burnDamage = Math.max(1, Math.floor((Number(player.stats.MaxHP || 1) || 1) * 0.04));
        state.burnTurns -= 1;
        const damageResult = applyDamageToPlayer(player, burnDamage);
        await sendLogToBoth(`${player.stats.DisplayName} は火傷で ${damageResult.totalDamage} ダメージ！${formatShieldSuffix(damageResult)} (残りHP: ${player.stats.CurrentHP})`);
        if (player.stats.CurrentHP <= 0) {
            await sendLogToBoth(`${player.stats.DisplayName} はたおれた！`);
            return { defeated: true };
        }
        return null;
    };
    const getDamageTierMultiplier = (tier) => {
        const raw = String(tier || '').trim();
        if (raw.includes('特大')) return 1.65;
        if (raw.includes('中〜大')) return 1.18;
        if (raw.includes('大')) return 1.35;
        if (raw.includes('中')) return 1.05;
        if (raw.includes('小')) return 0.75;
        return 0.95;
    };
    const getHealTierRate = (tier) => {
        const raw = String(tier || '').trim();
        if (raw.includes('大')) return 0.38;
        if (raw.includes('中')) return 0.25;
        if (raw.includes('継続') || raw.includes('小')) return 0.15;
        return 0.18;
    };
    const getTarotHitCount = (skill) => {
        const raw = `${skill?.effectClass || ''} ${skill?.damageTier || ''}`;
        const match = raw.match(/×(\d+)/);
        if (match) return Math.max(1, Math.min(4, Number(match[1]) || 1));
        return raw.includes('連撃') ? 2 : 1;
    };
    const calculateTarotDamage = (attacker, defender, skill, attackerState, defenderState, hitMultiplier = 1) => {
        const level = Number(attacker?.stats?.Level || attacker?.level || 1) || 1;
        const attackStat = (Number(attacker?.stats?.こうげき || attacker?.stats?.Power || 0) || 0)
            + (Number(attacker?.equipmentStats?.Power || 0) || 0)
            + Math.floor(((Number(attacker?.stats?.かしこさ || 0) || 0) + (Number(attacker?.equipmentStats?.Int || 0) || 0) + (Number(attacker?.equipmentStats?.MagicPower || 0) || 0)) * 0.45)
            + (level * 2);
        const enemyDefense = (Number(defender?.stats?.みのまもり || defender?.stats?.Defense || 0) || 0)
            + (Number(defender?.equipmentStats?.Defense || 0) || 0);
        const baseDamage = Math.max(1, Math.floor(attackStat - (enemyDefense * 0.45)));
        const tierMultiplier = getDamageTierMultiplier(skill?.damageTier);
        const totalMultiplier = tierMultiplier
            * hitMultiplier
            * getRoleAttackMultiplier(attacker, 'tarot', skill?.elementKey || skill?.element)
            * getStateAttackMultiplier(attackerState)
            * getRoleDamageTakenMultiplier(defender)
            * getStateDamageTakenMultiplier(defenderState);
        return Math.max(1, Math.floor(baseDamage * totalMultiplier));
    };
    const calculateTarotHeal = (attacker, skill) => {
        const maxHp = Math.max(1, Number(attacker?.stats?.MaxHP || attacker?.stats?.HP || 1) || 1);
        const intBonus = Math.floor(((Number(attacker?.stats?.かしこさ || 0) || 0) + (Number(attacker?.equipmentStats?.HealPower || 0) || 0)) / 6);
        return Math.max(1, Math.floor(maxHp * getHealTierRate(skill?.healTier)) + intBonus);
    };
    const clearNegativeTarotState = (state) => {
        state.attackDownTurns = 0;
        state.defenseDownTurns = 0;
        state.speedDownTurns = 0;
        state.burnTurns = 0;
        state.silenceTurns = 0;
    };
    const clearPositiveTarotState = (state) => {
        state.attackBuffTurns = 0;
        state.guardTurns = 0;
        state.speedBuffTurns = 0;
        state.counterTurns = 0;
    };
    const applyTarotBuff = (attacker, state, skill, messages) => {
        const element = normalizeBattleElementKey(skill?.elementKey || skill?.element);
        if (element === 'earth') {
            state.guardTurns = 2;
            state.guardMultiplier = 0.8;
            messages.push('守りを固めた');
        } else if (element === 'wind') {
            state.speedBuffTurns = 2;
            state.speedBuffMultiplier = 1.15;
            messages.push('素早さが上がった');
        } else if (element === 'water') {
            const healAmount = Math.max(1, Math.floor((Number(attacker.stats.MaxHP || 1) || 1) * 0.08));
            attacker.stats.CurrentHP = Math.min(attacker.stats.MaxHP || attacker.stats.CurrentHP, attacker.stats.CurrentHP + healAmount);
            messages.push(`HPが ${healAmount} 回復`);
        } else {
            state.attackBuffTurns = 2;
            state.attackBuffMultiplier = 1.15;
            messages.push('攻撃が上がった');
        }
    };
    const applyTarotDebuff = (attacker, defender, defenderState, skill, messages) => {
        const successRate = Math.max(
            0.01,
            (Number(skill?.successRateValue || 0) || 0.25) + ((Number(attacker?.equipmentStats?.StatusRate || 0) || 0) / 100)
        );
        if (!rollChance(successRate)) {
            messages.push('妨害は外れた');
            return;
        }
        const status = String(skill?.status || '').trim();
        const element = normalizeBattleElementKey(skill?.elementKey || skill?.element);
        if (status.includes('火傷') || element === 'fire') {
            defenderState.burnTurns = Math.max(defenderState.burnTurns || 0, 2);
            messages.push(`${defender.stats.DisplayName} に火傷`);
        } else if (status.includes('沈黙')) {
            defenderState.silenceTurns = Math.max(defenderState.silenceTurns || 0, 2);
            messages.push(`${defender.stats.DisplayName} に沈黙`);
        } else if (element === 'wind') {
            defenderState.speedDownTurns = 2;
            defenderState.speedDownMultiplier = 0.9;
            messages.push(`${defender.stats.DisplayName} の素早さを下げた`);
        } else if (element === 'earth') {
            defenderState.defenseDownTurns = 2;
            defenderState.defenseDownMultiplier = 1.12;
            messages.push(`${defender.stats.DisplayName} の防御を崩した`);
        } else {
            defenderState.attackDownTurns = 2;
            defenderState.attackDownMultiplier = 0.9;
            messages.push(`${defender.stats.DisplayName} の攻撃を下げた`);
        }
    };
    const applyTarotRisk = (attacker, skill, messages) => {
        if (!String(skill?.effectClass || '').includes('リスク')) return;
        const recoil = Math.max(1, Math.floor((Number(attacker.stats.MaxHP || 1) || 1) * 0.08));
        const damageResult = applyDamageToPlayer(attacker, recoil);
        messages.push(`反動で ${damageResult.totalDamage} ダメージ${formatShieldSuffix(damageResult)}`);
    };
    const triggerCounterIfReady = async (attacker, defender, attackerState, defenderState) => {
        if ((defenderState?.counterTurns || 0) <= 0 || defender.stats.CurrentHP <= 0 || attacker.stats.CurrentHP <= 0) return null;
        defenderState.counterTurns = 0;
        const base = Math.max(1, Math.floor(((Number(defender.stats.こうげき || 1) || 1) + (Number(defender.equipmentStats?.Power || 0) || 0)) * (Number(defenderState.counterMultiplier || 0.35) || 0.35)));
        const damageResult = applyDamageToPlayer(attacker, base);
        await sendLogToBoth(`${defender.stats.DisplayName} の反撃！ ${attacker.stats.DisplayName} に ${damageResult.totalDamage} ダメージ！${formatShieldSuffix(damageResult)} (残りHP: ${attacker.stats.CurrentHP})`);
        if (attacker.stats.CurrentHP <= 0) {
            await sendLogToBoth(`${attacker.stats.DisplayName} はたおれた！`);
            return { defeated: true };
        }
        return null;
    };
    const applyTarotSkillAction = async (attacker, defender, attackerState, defenderState) => {
        const deck = Array.isArray(attackerState.tarotDeck) ? attackerState.tarotDeck : [];
        if (!deck.length) return { used: false };
        if ((attackerState.tarotCooldown || 0) > 0) {
            attackerState.tarotCooldown -= 1;
            return { used: false };
        }
        const skill = deck[attackerState.tarotIndex % deck.length];
        if (!skill) return { used: false };
        attackerState.tarotIndex = (attackerState.tarotIndex + 1) % deck.length;
        attackerState.tarotCooldown = Math.max(0, Math.floor(Number(skill.cooldown) || 0));

        const effectClass = String(skill.effectClass || '');
        const messages = [];
        let mode = effectClass;
        if (effectClass === '特殊') {
            const roll = Math.random();
            mode = roll < 0.25 ? '攻撃' : roll < 0.5 ? '回復' : roll < 0.75 ? '強化' : '妨害';
        }
        const hasAttack = /攻撃|連撃|先制|万能/.test(mode) || !!skill.damageTier;
        const hasHeal = /回復|復活|万能/.test(mode) || !!skill.healTier;
        const hasDefense = /防御|耐性|挑発|根性/.test(mode);
        const hasBuff = /強化|万能/.test(mode);
        const hasDebuff = /妨害|弱体|万能/.test(mode);
        const hasCleanse = /解除/.test(mode);
        const hasCounter = /反撃/.test(mode);

        if (hasAttack) {
            const hitCount = getTarotHitCount(skill);
            const perHitMultiplier = hitCount > 1 ? 0.65 : 1;
            let totalDamage = 0;
            let totalAbsorbed = 0;
            for (let hit = 0; hit < hitCount; hit += 1) {
                const rawDamage = calculateTarotDamage(attacker, defender, skill, attackerState, defenderState, perHitMultiplier);
                const critical = maybeApplyCritical(attacker, rawDamage, 'tarot');
                const damageResult = applyDamageToPlayer(defender, critical.damage);
                totalDamage += damageResult.totalDamage;
                totalAbsorbed += damageResult.absorbed;
            }
            messages.push(`${defender.stats.DisplayName} に ${totalDamage} ダメージ${hitCount > 1 ? `（${hitCount}連撃）` : ''}${totalAbsorbed > 0 ? ` / シールド${totalAbsorbed}吸収` : ''}`);
        }
        if (hasHeal) {
            const healAmount = calculateTarotHeal(attacker, skill);
            attacker.stats.CurrentHP = Math.min(attacker.stats.MaxHP || attacker.stats.CurrentHP, attacker.stats.CurrentHP + healAmount);
            messages.push(`HPが ${healAmount} 回復`);
        }
        if (hasDefense) {
            attackerState.guardTurns = 2;
            attackerState.guardMultiplier = 0.78;
            messages.push('防御態勢を取った');
        }
        if (hasBuff) applyTarotBuff(attacker, attackerState, skill, messages);
        if (hasDebuff) applyTarotDebuff(attacker, defender, defenderState, skill, messages);
        if (hasCleanse) {
            clearNegativeTarotState(attackerState);
            clearPositiveTarotState(defenderState);
            messages.push('状態変化を解除した');
        }
        if (hasCounter) {
            attackerState.counterTurns = 1;
            attackerState.counterMultiplier = 0.35;
            messages.push('反撃の構え');
        }
        applyTarotRisk(attacker, skill, messages);

        const cardName = skill.cardName || skill.displayName || 'タロット';
        const skillName = skill.skillName || 'カード効果';
        await sendLogToBoth(`${attacker.stats.DisplayName} のタロット「${cardName} / ${skillName}」！ ${messages.join(' / ') || '効果はなかった'} (CT:${attackerState.tarotCooldown})`);
        if (defender.stats.CurrentHP <= 0) {
            await sendLogToBoth(`${defender.stats.DisplayName} はたおれた！`);
            return { used: true, battleEnded: true, winner: attacker, loser: defender };
        }
        if (attacker.stats.CurrentHP <= 0) {
            await sendLogToBoth(`${attacker.stats.DisplayName} はたおれた！`);
            return { used: true, battleEnded: true, winner: defender, loser: attacker };
        }
        const counterResult = await triggerCounterIfReady(attacker, defender, attackerState, defenderState);
        if (counterResult?.defeated) return { used: true, battleEnded: true, winner: defender, loser: attacker };
        return { used: true };
    };
    await sendLogToBoth(`戦闘開始！ ${attacker.stats.DisplayName} の先攻！`);
    await sendLogToBoth(`両者の距離は ${distance} マスだ！`);

    for (let i = 0; i < 20; i++) {
        const attackerRange = rangeMap.get(attacker.id) || 1;
        const attackerSkills = skillMap.get(attacker.id) || [];
        const defenderSkills = skillMap.get(defender.id) || [];
        const attackerWeapons = weaponMap.get(attacker.id) || new Set();
        const defenderWeapons = weaponMap.get(defender.id) || new Set();
        const attackerState = skillState.get(attacker.id) || buildTarotRuntimeState(attacker);
        const defenderState = skillState.get(defender.id) || buildTarotRuntimeState(defender);
        skillState.set(attacker.id, attackerState);
        skillState.set(defender.id, defenderState);
        const statusResult = await applyTurnStartTarotStatus(attacker, attackerState);
        if (statusResult?.defeated) {
            return { winner: defender, loser: attacker, logs: logs };
        }
        decrementTimedState(attackerState);
        const attackerSpeed = getEffectiveSpeed(attacker, attackerState);
        const defenderSpeed = getEffectiveSpeed(defender, defenderState);
        const speedDelta = clampValue((attackerSpeed - defenderSpeed) / 200, -0.1, 0.1);
        const defenderSpeedDelta = clampValue((defenderSpeed - attackerSpeed) / 200, -0.1, 0.1);
        const attackerPassive = passiveBonusMap.get(attacker.id) || EMPTY_PASSIVE;
        const defenderPassive = passiveBonusMap.get(defender.id) || EMPTY_PASSIVE;
        const attackerAwakeningBattle = getBattleAwakeningBattleState(attacker);
        if (distance > attackerRange) {
            let step = 1;
            const dashWeapon = attackerWeapons.has('dagger')
                ? 'dagger'
                : attackerWeapons.has('axe')
                    ? 'axe'
                    : attackerWeapons.has('sword')
                        ? 'sword'
                        : attackerWeapons.has('blunt')
                            ? 'blunt'
                            : '';
            const dashChance = 0.12 + speedDelta + attackerPassive.dashBonus;
            if (dashWeapon && rollChance(dashChance)) {
                step = 2;
                await sendLogToBoth(`${attacker.stats.DisplayName} は ${getPassiveLabel(attackerSkills, dashWeapon, '踏み込み')} で距離を詰めた！`);
            } else {
                const polearmLunge = attackerWeapons.has('polearm') ? getSkillForWeapon(attackerSkills, 'polearm', 'weapon', false) : null;
                if (polearmLunge && distance === attackerRange + 1 && rollChance(0.2 + speedDelta + attackerPassive.lungeBonus)) {
                    step = 2;
                    await sendLogToBoth(`${attacker.stats.DisplayName} は ${getSkillLabel(polearmLunge, '突進')} で一気に詰めた！`);
                }
            }
            distance = Math.max(1, distance - step);
            await sendLogToBoth(`${attacker.stats.DisplayName} は前進した！ (距離: ${distance})`);
        } else {
            const shieldKnockChance = 0.08 + defenderSpeedDelta + defenderPassive.knockbackBonus + (Number(defenderPassive.skillProcBonus || 0) || 0) - getRoleAccuracyBonus(attacker);
            if (defenderWeapons.has('shield') && rollChance(shieldKnockChance)) {
                const knockStep = rollChance(0.25 + defenderPassive.knockbackBonus) ? 2 : 1;
                distance = Math.min(5, distance + knockStep);
                await sendLogToBoth(`${defender.stats.DisplayName} は ${getPassiveLabel(defenderSkills, 'shield', '盾の構え')} で弾き返した！ (距離: ${distance})`);
                [attacker, defender] = [defender, attacker];
                continue;
            }
            const evadeChance = 0.05 + defenderSpeedDelta + defenderPassive.evadeBonus + (Number(defenderPassive.skillProcBonus || 0) || 0) - getRoleAccuracyBonus(attacker);
            if (defenderWeapons.has('dagger') && rollChance(evadeChance)) {
                distance = Math.min(5, distance + 1);
                await sendLogToBoth(`${defender.stats.DisplayName} は ${getPassiveLabel(defenderSkills, 'dagger', '回避')} で攻撃をかわした！ (距離: ${distance})`);
                [attacker, defender] = [defender, attacker];
                continue;
            }

            const repositionChance = 0.08 + speedDelta + attackerPassive.repositionBonus;
            if (attackerWeapons.has('gun') && distance + 1 <= attackerRange && rollChance(repositionChance)) {
                distance = Math.min(5, distance + 1);
                await sendLogToBoth(`${attacker.stats.DisplayName} は ${getPassiveLabel(attackerSkills, 'gun', '間合い操作')} で距離を取った！ (距離: ${distance})`);
            }

            const tarotAction = await applyTarotSkillAction(attacker, defender, attackerState, defenderState);
            if (tarotAction?.battleEnded) {
                return { winner: tarotAction.winner, loser: tarotAction.loser, logs: logs };
            }
            if (tarotAction?.used) {
                [attacker, defender] = [defender, attacker];
                continue;
            }

            const attackerChargeSkill = attackerWeapons.has('staff') ? getSkillForWeapon(attackerSkills, 'staff', 'weapon', false) : null;
            const chargeChance = normalizeBattleRate(
                getBattleSkillNumber(attackerChargeSkill, ['procChance', 'chance', 'activationRate'], 0.15),
                0.15
            );
            if (!attackerState.charged && attackerChargeSkill && rollChance(chargeChance + speedDelta + attackerPassive.chargeBonus + (Number(attackerPassive.skillProcBonus || 0) || 0))) {
                const stepBack = rollChance(0.25 + attackerPassive.chargeBonus) ? 2 : 1;
                distance = Math.min(5, distance + stepBack);
                attackerState.charged = true;
                skillState.set(attacker.id, attackerState);
                await sendLogToBoth(`${attacker.stats.DisplayName} は ${getSkillLabel(attackerChargeSkill, '溜め')} で力をためた！ (距離: ${distance})`);
                [attacker, defender] = [defender, attacker];
                continue;
            }
            const attackerMagic = getBattleMagicProfile(attacker);
            const chargeMultiplier = attackerState.charged ? (1.25 + attackerPassive.staffBonus) : 1;
            const castBoost = 1 + clampValue((attackerMagic.castRate || 0) / 100, 0, 0.25);
            const consumeCharge = () => {
                if (!attackerState.charged) return false;
                attackerState.charged = false;
                skillState.set(attacker.id, attackerState);
                return true;
            };
            const executeMultiplier = (() => {
                const threshold = Number(attackerAwakeningBattle.executeThreshold || 0) || 0;
                if (threshold <= 0) return 1;
                const defenderHpRate = (Number(defender.stats.CurrentHP || 0) || 0) / Math.max(1, Number(defender.stats.MaxHP || 1) || 1);
                if (defenderHpRate > threshold) return 1;
                return Number(attackerAwakeningBattle.executeMultiplier || 1) || 1;
            })();
            const magicSkill = (attackerState.silenceTurns || 0) > 0
                ? null
                : chooseMagicSkill(attackerSkills, attackerWeapons, attackerMagic, attacker, distance);
            if (magicSkill) {
                const currentMp = Number(attacker.stats.CurrentMP ?? attacker.stats.MP ?? 0) || 0;
                attacker.stats.CurrentMP = Math.max(0, currentMp - magicSkill.mpCost);
                const releasedCharge = consumeCharge();
                if (magicSkill.kind === 'heal') {
                    const healBoost = 1 + clampValue((attackerMagic.healPower || 0) / 40, 0, 0.5);
                    const healAmount = calculateBattleMagicHeal(attacker, attackerMagic, {
                        totalMultiplier: magicSkill.powerMultiplier * castBoost * healBoost * chargeMultiplier * (Number(attackerAwakeningBattle.healMultiplier || 1) || 1)
                    });
                    attacker.stats.CurrentHP = Math.min(attacker.stats.MaxHP || attacker.stats.CurrentHP, attacker.stats.CurrentHP + healAmount);
                    const awakeningPhrase = buildBattleAwakeningActionPhrase(attacker, { mode: 'heal' });
                    await sendLogToBoth(
                        `${attacker.stats.DisplayName} は ${getSkillLabel(magicSkill.entry, '治癒魔法')} を唱えた！ `
                        + `${releasedCharge ? '溜めた魔力が重なり、' : ''}${awakeningPhrase}HPが ${healAmount} 回復！ (残りHP: ${attacker.stats.CurrentHP}, 残りMP: ${attacker.stats.CurrentMP})`
                    );
                    [attacker, defender] = [defender, attacker];
                    continue;
                }
                const magicDamage = calculateBattleMagicDamage(attacker, defender, attackerMagic, {
                    powerMultiplier: magicSkill.powerMultiplier,
                    totalMultiplier: attackerPassive.attackMultiplier
                        * castBoost
                        * chargeMultiplier
                        * getRoleAttackMultiplier(attacker, 'magic')
                        * getStateAttackMultiplier(attackerState)
                        * (Number(attackerAwakeningBattle.magicAttackMultiplier || 1) || 1)
                        * defenderPassive.defenseMultiplier
                        * getRoleDamageTakenMultiplier(defender)
                        * getStateDamageTakenMultiplier(defenderState)
                        * executeMultiplier
                });
                const damageResult = applyDamageToPlayer(defender, magicDamage);
                const awakeningPhrase = buildBattleAwakeningActionPhrase(attacker, { mode: 'magic', executeActive: executeMultiplier > 1 });
                await sendLogToBoth(
                    `${attacker.stats.DisplayName} は ${getSkillLabel(magicSkill.entry, '魔法')} を唱えた！ `
                    + `${releasedCharge ? '溜めた魔力が炸裂し、' : ''}${awakeningPhrase}${defender.stats.DisplayName} に ${damageResult.totalDamage} の魔法ダメージ！${formatShieldSuffix(damageResult)} `
                    + `(残りHP: ${defender.stats.CurrentHP}, 残りMP: ${attacker.stats.CurrentMP})`
                );
                if (defender.stats.CurrentHP <= 0) {
                    await sendLogToBoth(`${defender.stats.DisplayName} はたおれた！`);
                    return { winner: attacker, loser: defender, logs: logs };
                }
                const counterResult = await triggerCounterIfReady(attacker, defender, attackerState, defenderState);
                if (counterResult?.defeated) return { winner: defender, loser: attacker, logs: logs };
                [attacker, defender] = [defender, attacker];
                continue;
            }
            if (attackerWeapons.has('staff') && attackerMagic.baseAttackPower > 0) {
                const releasedCharge = consumeCharge();
                const magicDamage = calculateBattleMagicDamage(attacker, defender, attackerMagic, {
                    powerMultiplier: 0.92,
                    totalMultiplier: attackerPassive.attackMultiplier
                        * castBoost
                        * chargeMultiplier
                        * getRoleAttackMultiplier(attacker, 'magic')
                        * getStateAttackMultiplier(attackerState)
                        * (Number(attackerMagic.basicMagicMultiplier || 1) || 1)
                        * (Number(attackerAwakeningBattle.magicAttackMultiplier || 1) || 1)
                        * defenderPassive.defenseMultiplier
                        * getRoleDamageTakenMultiplier(defender)
                        * getStateDamageTakenMultiplier(defenderState)
                        * executeMultiplier
                });
                const damageResult = applyDamageToPlayer(defender, magicDamage);
                const awakeningPhrase = buildBattleAwakeningActionPhrase(attacker, { mode: 'basicMagic', executeActive: executeMultiplier > 1 });
                await sendLogToBoth(
                    `${attacker.stats.DisplayName} の魔力弾！ `
                    + `${releasedCharge ? '溜めた魔力が上乗せされ、' : ''}${awakeningPhrase}${defender.stats.DisplayName} に ${damageResult.totalDamage} のダメージ！${formatShieldSuffix(damageResult)} `
                    + `(残りHP: ${defender.stats.CurrentHP})`
                );
                if (defender.stats.CurrentHP <= 0) {
                    await sendLogToBoth(`${defender.stats.DisplayName} はたおれた！`);
                    return { winner: attacker, loser: defender, logs: logs };
                }
                const counterResult = await triggerCounterIfReady(attacker, defender, attackerState, defenderState);
                if (counterResult?.defeated) return { winner: defender, loser: attacker, logs: logs };
                [attacker, defender] = [defender, attacker];
                continue;
            }
            const weaponPower = attacker.equipmentStats.Power || 0;
            const enemyDefense = (defender.stats.みのまもり || 0) + (defender.equipmentStats.Defense || 0);
            const skillPower = 1.0;
            const baseDamage = (weaponPower * skillPower) - enemyDefense;
            const multiplier = ((attacker.stats.ちから * attacker.stats.Level / 128) + 2);
            let skillMultiplier = attackerPassive.attackMultiplier
                * getRoleAttackMultiplier(attacker, 'physical')
                * getStateAttackMultiplier(attackerState);
            let defenseMultiplier = defenderPassive.defenseMultiplier
                * getRoleDamageTakenMultiplier(defender)
                * getStateDamageTakenMultiplier(defenderState);
            if (attackerState.charged) {
                skillMultiplier *= 1.3 + attackerPassive.staffBonus;
                attackerState.charged = false;
                skillState.set(attacker.id, attackerState);
                await sendLogToBoth(`${attacker.stats.DisplayName} の溜め攻撃！`);
            }
            const gunSkill = attackerWeapons.has('gun') ? getSkillForWeapon(attackerSkills, 'gun', 'weapon', false) : null;
            if (gunSkill && distance >= 2 && rollChance(
                normalizeBattleRate(getBattleSkillNumber(gunSkill, ['procChance', 'chance', 'activationRate'], 0.18), 0.18)
                + 0.08 * (distance - 1)
                + speedDelta
                + attackerPassive.gunBonus
                + attackerPassive.snipeBonus
                + (Number(attackerPassive.skillProcBonus || 0) || 0)
            )) {
                skillMultiplier *= normalizeBattleMultiplier(
                    getBattleSkillNumber(gunSkill, ['powerMultiplier', 'damageMultiplier', 'multiplier'], 1.3),
                    1.3
                );
                await sendLogToBoth(`${attacker.stats.DisplayName} は ${getSkillLabel(gunSkill, '狙撃')} を発動！`);
            }
            const polearmSkill = attackerWeapons.has('polearm') ? getSkillForWeapon(attackerSkills, 'polearm', 'weapon', false) : null;
            if (polearmSkill && distance === 2 && rollChance(
                normalizeBattleRate(getBattleSkillNumber(polearmSkill, ['procChance', 'chance', 'activationRate'], 0.2), 0.2)
                + speedDelta
                + attackerPassive.polearmBonus
                + attackerPassive.lungeBonus
                + (Number(attackerPassive.skillProcBonus || 0) || 0)
            )) {
                skillMultiplier *= normalizeBattleMultiplier(
                    getBattleSkillNumber(polearmSkill, ['powerMultiplier', 'damageMultiplier', 'multiplier'], 1.22),
                    1.22
                );
                await sendLogToBoth(`${attacker.stats.DisplayName} は ${getSkillLabel(polearmSkill, '突刺し')} を発動！`);
            }
            const daggerSkill = attackerWeapons.has('dagger') ? getSkillForWeapon(attackerSkills, 'dagger', 'weapon', false) : null;
            if (daggerSkill && distance === 1 && rollChance(
                normalizeBattleRate(getBattleSkillNumber(daggerSkill, ['procChance', 'chance', 'activationRate'], 0.22), 0.22)
                + speedDelta
                + attackerPassive.daggerBonus
                + (Number(attackerPassive.skillProcBonus || 0) || 0)
            )) {
                skillMultiplier *= normalizeBattleMultiplier(
                    getBattleSkillNumber(daggerSkill, ['powerMultiplier', 'damageMultiplier', 'multiplier'], 1.25),
                    1.25
                );
                await sendLogToBoth(`${attacker.stats.DisplayName} は ${getSkillLabel(daggerSkill, '急所突き')} を発動！`);
            }
            const swordSkill = attackerWeapons.has('sword') ? getSkillForWeapon(attackerSkills, 'sword', 'weapon', false) : null;
            if (swordSkill && distance === 1 && rollChance(
                normalizeBattleRate(getBattleSkillNumber(swordSkill, ['procChance', 'chance', 'activationRate'], 0.18), 0.18)
                + speedDelta
                + attackerPassive.swordBonus
                + (Number(attackerPassive.skillProcBonus || 0) || 0)
            )) {
                skillMultiplier *= normalizeBattleMultiplier(
                    getBattleSkillNumber(swordSkill, ['powerMultiplier', 'damageMultiplier', 'multiplier'], 1.2),
                    1.2
                );
                await sendLogToBoth(`${attacker.stats.DisplayName} は ${getSkillLabel(swordSkill, '連撃')} を発動！`);
            }
            const axeSkill = attackerWeapons.has('axe') ? getSkillForWeapon(attackerSkills, 'axe', 'weapon', false) : null;
            if (axeSkill && distance === 1 && rollChance(
                normalizeBattleRate(getBattleSkillNumber(axeSkill, ['procChance', 'chance', 'activationRate'], 0.18), 0.18)
                + speedDelta
                + attackerPassive.axeBonus
                + (Number(attackerPassive.skillProcBonus || 0) || 0)
            )) {
                skillMultiplier *= normalizeBattleMultiplier(
                    getBattleSkillNumber(axeSkill, ['powerMultiplier', 'damageMultiplier', 'multiplier'], 1.25),
                    1.25
                );
                await sendLogToBoth(`${attacker.stats.DisplayName} は ${getSkillLabel(axeSkill, '強撃')} を発動！`);
            }
            const bluntSkill = attackerWeapons.has('blunt') ? getSkillForWeapon(attackerSkills, 'blunt', 'weapon', false) : null;
            if (bluntSkill && distance === 1 && rollChance(
                normalizeBattleRate(getBattleSkillNumber(bluntSkill, ['procChance', 'chance', 'activationRate'], 0.18), 0.18)
                + speedDelta
                + attackerPassive.bluntBonus
                + (Number(attackerPassive.skillProcBonus || 0) || 0)
            )) {
                skillMultiplier *= normalizeBattleMultiplier(
                    getBattleSkillNumber(bluntSkill, ['powerMultiplier', 'damageMultiplier', 'multiplier'], 1.18),
                    1.18
                );
                await sendLogToBoth(`${attacker.stats.DisplayName} は ${getSkillLabel(bluntSkill, '粉砕撃')} を発動！`);
            }
            // ダメージ計算結果がマイナスにならないようにし、最低でも1ダメージは保証する
            const critical = maybeApplyCritical(
                attacker,
                Math.max(1, Math.floor(baseDamage * multiplier * skillMultiplier * defenseMultiplier * executeMultiplier)),
                'physical'
            );

            const damageResult = applyDamageToPlayer(defender, critical.damage);

            const awakeningPhrase = buildBattleAwakeningActionPhrase(attacker, { mode: 'attack', executeActive: executeMultiplier > 1 });
            await sendLogToBoth(`${attacker.stats.DisplayName} のこうげき！ ${critical.critical ? 'クリティカル！ ' : ''}${awakeningPhrase}${defender.stats.DisplayName} に ${damageResult.totalDamage} のダメージ！${formatShieldSuffix(damageResult)} (残りHP: ${defender.stats.CurrentHP})`);

            if (defender.stats.CurrentHP <= 0) {
                await sendLogToBoth(`${defender.stats.DisplayName} はたおれた！`);
                return { winner: attacker, loser: defender, logs: logs };
            }
            const counterResult = await triggerCounterIfReady(attacker, defender, attackerState, defenderState);
            if (counterResult?.defeated) return { winner: defender, loser: attacker, logs: logs };
        }

        [attacker, defender] = [defender, attacker];
    }

    await sendLogToBoth("決着がつかなかった...！");

    if (playerA.stats.CurrentHP >= playerB.stats.CurrentHP) {
        return { winner: playerA, loser: playerB, logs: logs };
    } else {
        return { winner: playerB, loser: playerA, logs: logs };
    }
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
    const runSequentialRideBattle = async ({ attackerId, defenderId, partyA, partyB }) => {
        const battleRef = db.ref('battles').push();
        const battleId = battleRef.key;
        const playersPayload = {};
        const logEntries = {};
        const roundResults = [];
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
                stats: { すばやさ: player.stats.すばやさ },
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

            await Promise.all([battleResult.winner, battleResult.loser]
                .filter((player) => !isVirtualFighter(player))
                .map((player) => savePlayerHpMp(player)));
            if (!isVirtualFighter(battleResult.winner) && !isVirtualFighter(battleResult.loser)) {
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
            rounds: roundResults
        };

        await battleRef.set(finalBattleState);
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

    // ----------------------------------------------------
    // API 11: バトル実行 (自動戦闘・即時決着)
    // ----------------------------------------------------
    app.post('/api/start-battle', async (req, res) => {
        let { attackerId, defenderId } = req.body;
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
            const result = await runSequentialRideBattle({ attackerId, defenderId, partyA, partyB });
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
                    stats: { すばやさ: playerA.stats.すばやさ }, // ATB計算に必要なステータス
                    avatar: playerA.avatar,
                    equipment: playerA.equipment // ★ v147: アイテムIDのみを保存
                },
                [playerB.id]: {
                    name: playerB.stats.DisplayName,
                    hp: playerB.stats.CurrentHP,
                    maxHp: playerB.stats.MaxHP,
                    online: true, // ★★★ 修正: オンライン状態フラグを追加
                    level: playerB.level, // ★★★ 修正: レベル情報を追加
                    stats: { すばやさ: playerB.stats.すばやさ },
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
                            await handleBattleRewards(battleId, winnerId, loserId);
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
                await handleBattleRewards(battleId, playFabId, opponentId);
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
    async function handleBattleRewards(battleId, winnerId, loserId, roundKey = null) {
        console.log(`[battle-reward] start winner=${winnerId} loser=${loserId}`);
        const loserInventory = await getAllInventoryItems(loserId);
        const loserPs = getCurrencyBalanceFromItems(loserInventory, VIRTUAL_CURRENCY_CODE);
        const battleRef = db.ref(`battles/${battleId}`);
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
    runBattle,
    savePlayerHpMp
};
