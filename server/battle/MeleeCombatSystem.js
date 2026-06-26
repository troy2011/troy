'use strict';

const { getTarotRolePassive } = require('../tarotRoles');
const { getTarotBattleDeck } = require('../tarotBattleSkills');

const DEFAULT_MAX_ROUNDS = 18;
const DEFAULT_STARTING_DISTANCE = 4;
const DEFAULT_MAX_DISTANCE = 5;

const WEAPON_RULES = {
    sword: { label: '剣', range: 1, power: 1.08, accuracy: 0.03, critical: 0.03, initiative: 3 },
    axe: { label: '斧', range: 1, power: 1.18, accuracy: -0.03, critical: 0.05, initiative: -1 },
    blunt: { label: '鈍器', range: 1, power: 1.12, accuracy: 0, critical: 0.02, initiative: -1 },
    dagger: { label: '短剣', range: 1, power: 0.92, accuracy: 0.08, critical: 0.08, initiative: 6 },
    shield: { label: '盾', range: 1, power: 0.78, accuracy: 0, critical: 0, initiative: -2 },
    polearm: { label: '槍', range: 2, power: 1.04, accuracy: 0.02, critical: 0.02, initiative: 1 },
    staff: { label: '杖', range: 2, power: 0.9, accuracy: 0.03, critical: 0.01, initiative: 0 },
    gun: { label: '銃', range: 3, power: 1.02, accuracy: 0.01, critical: 0.04, initiative: -3 },
    unarmed: { label: '素手', range: 1, power: 0.72, accuracy: 0.03, critical: 0, initiative: 0 }
};

function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeRate(value, fallback = 0) {
    const parsed = number(value, fallback);
    return parsed > 1 ? parsed / 100 : parsed;
}

function normalizeMultiplier(value, fallback = 1) {
    const parsed = number(value, fallback);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed > 10 ? parsed / 100 : parsed;
}

function nameOf(player) {
    return String(player?.stats?.DisplayName || player?.displayName || player?.name || player?.id || '戦士');
}

function getAwakeningBattle(player) {
    return player?.majorAwakening?.battle || {};
}

function getStat(player, keys, fallback = 0) {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
        const value = number(player?.stats?.[key], Number.NaN);
        if (Number.isFinite(value)) return value;
    }
    return fallback;
}

function getEquipmentStat(player, keys, fallback = 0) {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
        const value = number(player?.equipmentStats?.[key], Number.NaN);
        if (Number.isFinite(value)) return value;
    }
    return fallback;
}

function ensureBattleStats(player) {
    player.stats = player.stats || {};
    const maxHp = Math.max(
        1,
        Math.floor(number(player.stats.MaxHP, number(player.stats.HP, number(player.stats.CurrentHP, 1))))
    );
    const currentHp = clamp(
        Math.floor(number(player.stats.CurrentHP, number(player.stats.HP, maxHp))),
        0,
        maxHp
    );
    const maxMp = Math.max(0, Math.floor(number(player.stats.MaxMP, number(player.stats.MP, number(player.stats.CurrentMP, 0)))));
    const currentMp = clamp(
        Math.floor(number(player.stats.CurrentMP, number(player.stats.MP, maxMp))),
        0,
        maxMp
    );
    player.stats.MaxHP = maxHp;
    player.stats.HP = currentHp;
    player.stats.CurrentHP = currentHp;
    player.stats.MaxMP = maxMp;
    player.stats.MP = currentMp;
    player.stats.CurrentMP = currentMp;
}

function getItemData(itemRef, catalogCache = {}) {
    if (!itemRef) return null;
    if (typeof itemRef === 'object') {
        if (itemRef.customData && typeof itemRef.customData === 'object') return itemRef.customData;
        if (itemRef.CustomData && typeof itemRef.CustomData === 'object') return itemRef.CustomData;
        if (itemRef.ItemId && catalogCache[itemRef.ItemId]) return catalogCache[itemRef.ItemId];
        return itemRef;
    }
    const id = String(itemRef || '').trim();
    return id ? catalogCache[id] || null : null;
}

function inferWeaponTypeFromText(value) {
    const id = String(value || '').trim().toLowerCase();
    if (!id) return '';
    if (id.includes('gun') || id.includes('bow') || id.includes('pistol') || id.includes('rifle')) return 'gun';
    if (id.includes('spear') || id.includes('polearm') || id.includes('lance')) return 'polearm';
    if (id.includes('staff') || id.includes('wand') || id.includes('book') || id.includes('orb')) return 'staff';
    if (id.includes('shield')) return 'shield';
    if (id.includes('dagger') || id.includes('knife')) return 'dagger';
    if (id.includes('sword') || id.includes('blade')) return 'sword';
    if (id.includes('axe')) return 'axe';
    if (id.includes('blunt') || id.includes('club') || id.includes('mace') || id.includes('hammer')) return 'blunt';
    return '';
}

function resolveWeaponType(itemRef, catalogCache = {}) {
    const data = getItemData(itemRef, catalogCache);
    const declared = String(
        data?.ManifestWeaponType
        || data?.ManifestedWeaponType
        || data?.WeaponType
        || data?.weaponType
        || ''
    ).trim().toLowerCase();
    if (declared) {
        if (declared === 'spear' || declared === 'lance') return 'polearm';
        if (declared === 'wand' || declared === 'book' || declared === 'orb') return 'staff';
        if (WEAPON_RULES[declared]) return declared;
    }
    const category = String(data?.Category || data?.category || '').trim().toLowerCase();
    if (category === 'shield') return 'shield';
    const fromData = inferWeaponTypeFromText(`${data?.ItemId || ''} ${data?.DisplayName || ''} ${data?.Name || ''}`);
    if (fromData) return fromData;
    return inferWeaponTypeFromText(typeof itemRef === 'string' ? itemRef : itemRef?.ItemId || itemRef?.id || '');
}

function getEquippedWeaponTypes(player, catalogCache = {}) {
    const types = new Set();
    const right = resolveWeaponType(player?.equipment?.RightHand, catalogCache);
    const left = resolveWeaponType(player?.equipment?.LeftHand, catalogCache);
    if (right) types.add(right);
    if (left) types.add(left);
    if (!types.size) types.add('unarmed');
    return types;
}

function pickPrimaryWeapon(types) {
    const order = ['sword', 'axe', 'blunt', 'dagger', 'polearm', 'staff', 'gun', 'shield', 'unarmed'];
    return order.find((type) => types.has(type)) || 'unarmed';
}

function getWeaponRule(type) {
    return WEAPON_RULES[type] || WEAPON_RULES.unarmed;
}

function getPlayerSkills(player) {
    const raw = player?.skills || [];
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    return list.filter((entry) =>
        entry
        && typeof entry === 'object'
        && (entry.name || entry.skillName || entry.displayName || entry.id)
    );
}

function getSkillType(entry) {
    const raw = String(entry?.type || entry?.skillType || entry?.category || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'spell') return 'magic';
    if (raw.includes('passive')) return 'passive';
    if (raw.includes('magic') || raw.includes('spell')) return 'magic';
    if (raw.includes('weapon') || raw.includes('attack')) return 'weapon';
    return raw;
}

function getSkillWeapon(entry) {
    const raw = String(entry?.weapon || entry?.skillWeapon || entry?.requiredWeapon || entry?.weaponType || '').trim().toLowerCase();
    if (raw === 'spear' || raw === 'lance') return 'polearm';
    if (raw === 'wand' || raw === 'book' || raw === 'orb' || raw === 'catalyst' || raw === 'relic') return 'staff';
    return raw;
}

function getSkillLabel(entry, fallback) {
    return String(entry?.name || entry?.skillName || entry?.displayName || fallback || '').trim();
}

function getSkillNumber(entry, keys, fallback = 0) {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
        const value = number(entry?.[key], Number.NaN);
        if (Number.isFinite(value)) return value;
    }
    return fallback;
}

function buildPassiveProfile(skills, weaponTypes) {
    const profile = {
        attackMultiplier: 1,
        damageTakenMultiplier: 1,
        accuracyBonus: 0,
        criticalBonus: 0,
        evadeBonus: 0,
        initiativeBonus: 0,
        skillProcBonus: 0
    };
    for (const entry of skills) {
        if (getSkillType(entry) !== 'passive') continue;
        const weapon = getSkillWeapon(entry);
        if (weapon && !weaponTypes.has(weapon)) continue;
        const level = Math.max(1, Math.floor(number(entry.level, 1)));
        const attack = normalizeRate(entry.attackRate ?? entry.attackBonus, 0.015 * level);
        const defense = normalizeRate(entry.defenseRate ?? entry.defenseBonus, weapon === 'shield' ? 0.02 * level : 0.008 * level);
        profile.attackMultiplier += clamp(attack, 0, 0.12);
        profile.damageTakenMultiplier -= clamp(defense, 0, 0.12);
        profile.accuracyBonus += clamp(normalizeRate(entry.accuracyBonus, 0.005 * level), 0, 0.08);
        profile.criticalBonus += clamp(normalizeRate(entry.criticalBonus, weapon === 'dagger' ? 0.01 * level : 0.004 * level), 0, 0.08);
        profile.evadeBonus += clamp(normalizeRate(entry.evadeBonus, weapon === 'dagger' ? 0.012 * level : 0.004 * level), 0, 0.08);
        profile.skillProcBonus += clamp(normalizeRate(entry.procBonus, 0.004 * level), 0, 0.08);
        profile.initiativeBonus += clamp(number(entry.initiativeBonus, weapon === 'dagger' ? level : 0), 0, 12);
    }
    profile.attackMultiplier = clamp(profile.attackMultiplier, 0.75, 1.45);
    profile.damageTakenMultiplier = clamp(profile.damageTakenMultiplier, 0.65, 1.25);
    return profile;
}

function getTarotDeckForPlayer(player, catalogCache = {}) {
    if (Array.isArray(player?.tarotBattleDeck) && player.tarotBattleDeck.length) {
        return player.tarotBattleDeck.filter(Boolean);
    }
    return getTarotBattleDeck(player?.meleeDeckIds || [], catalogCache || {});
}

function navalDurationValue(entry) {
    if (typeof entry === 'number') return Math.max(0, Math.floor(entry));
    return Math.max(0, Math.floor(number(entry?.turns, 0)));
}

function normalizeNavalBoardingState(source = {}) {
    const state = source && typeof source === 'object' ? source : {};
    const statuses = {};
    Object.entries(state.statuses && typeof state.statuses === 'object' ? state.statuses : {}).forEach(([key, value]) => {
        const turns = navalDurationValue(value);
        if (turns > 0) statuses[key] = turns;
    });
    return {
        morale: clamp(Math.floor(number(state.morale, 0)), -2, 2),
        crewHpPercent: clamp(number(state.crewHpPercent, 100), 0, 100),
        crewMpPercent: clamp(number(state.crewMpPercent, 100), 0, 100),
        statuses
    };
}

function createCombatant(player, catalogCache = {}) {
    ensureBattleStats(player);
    const weaponTypes = getEquippedWeaponTypes(player, catalogCache);
    const primaryWeapon = pickPrimaryWeapon(weaponTypes);
    const weaponRule = getWeaponRule(primaryWeapon);
    const skills = getPlayerSkills(player);
    const navalBoarding = normalizeNavalBoardingState(player?.navalBoardingState);
    return {
        player,
        id: String(player?.id || ''),
        name: nameOf(player),
        weaponTypes,
        primaryWeapon,
        weaponRule,
        range: Math.max(...Array.from(weaponTypes).map((type) => getWeaponRule(type).range || 1)),
        skills,
        passive: buildPassiveProfile(skills, weaponTypes),
        navalBoarding,
        navalMoraleMultiplier: 1,
        rolePassive: player?.tarotRolePassive || getTarotRolePassive(player?.tarotMeleeRole),
        tarot: {
            deck: getTarotDeckForPlayer(player, catalogCache),
            index: 0,
            cooldown: 0
        },
        status: {
            attackMultiplier: 1,
            attackTurns: 0,
            damageTakenMultiplier: 1,
            guardTurns: 0,
            defenseBreakMultiplier: 1,
            defenseBreakTurns: 0,
            speedMultiplier: 1,
            speedTurns: 0,
            burnTurns: 0,
            confusionTurns: 0,
            silenceTurns: 0,
            counterTurns: 0,
            counterMultiplier: 0.35
        }
    };
}

function getMaxHp(combatant) {
    return Math.max(1, number(combatant?.player?.stats?.MaxHP, 1));
}

function getCurrentHp(combatant) {
    return number(combatant?.player?.stats?.CurrentHP, 0);
}

function isAlive(combatant) {
    return getCurrentHp(combatant) > 0;
}

function getAttackStat(combatant) {
    const player = combatant.player;
    const level = Math.max(1, getStat(player, ['Level'], player.level || 1));
    const strength = getStat(player, ['ちから', 'Power', 'Strength'], 1);
    const weaponPower = getEquipmentStat(player, ['Power', 'Atk'], 0);
    const intelligence = getStat(player, ['かしこさ', 'Int', 'Intelligence'], 0);
    const magicAssist = combatant.primaryWeapon === 'staff' ? Math.floor(intelligence * 0.45) : Math.floor(intelligence * 0.12);
    return Math.max(1, strength + weaponPower + magicAssist + Math.floor(level * 1.6));
}

function getDefenseStat(combatant) {
    const player = combatant.player;
    const guard = getStat(player, ['みのまもり', 'Defense', 'Guard'], 0);
    const equipmentDefense = getEquipmentStat(player, ['Defense', 'Def'], 0);
    const awakening = getAwakeningBattle(player);
    return Math.max(0, guard + equipmentDefense + number(awakening.defenseBonus, 0));
}

function getMagicProfile(combatant) {
    const player = combatant.player;
    const magicPower = getEquipmentStat(player, ['MagicPower'], 0);
    const focusPower = combatant.weaponTypes.has('staff') ? getEquipmentStat(player, ['Power', 'Atk'], 0) : Math.floor(getEquipmentStat(player, ['Power', 'Atk'], 0) * 0.25);
    const intellect = getStat(player, ['かしこさ', 'Int', 'Intelligence'], 0);
    const healPower = getEquipmentStat(player, ['HealPower'], 0);
    const castRate = getEquipmentStat(player, ['CastRate'], 0);
    return {
        basePower: Math.max(1, magicPower + focusPower + Math.floor(intellect * 0.45)),
        healPower,
        castRate,
        mpEfficiency: getEquipmentStat(player, ['MpEfficiency'], 0),
        hasStaff: combatant.weaponTypes.has('staff')
    };
}

function getEffectiveSpeed(combatant) {
    const player = combatant.player;
    const base = getStat(player, ['すばやさ', 'Agi', 'Speed'], 1);
    const weapon = combatant.weaponRule?.initiative || 0;
    const passive = combatant.passive?.initiativeBonus || 0;
    return Math.max(1, Math.floor((base + weapon + passive) * (combatant.status.speedMultiplier || 1)));
}

function getOutgoingMultiplier(combatant, mode = 'physical', element = 'none') {
    const awakening = getAwakeningBattle(combatant.player);
    const role = combatant.rolePassive || {};
    let multiplier = combatant.passive.attackMultiplier || 1;
    multiplier *= number(combatant.navalMoraleMultiplier, 1);
    multiplier *= combatant.status.attackTurns > 0 ? combatant.status.attackMultiplier || 1 : 1;
    multiplier *= number(role.attackMultiplier, 1);
    if (mode === 'magic') multiplier *= number(awakening.magicAttackMultiplier, 1);
    if (mode === 'physical') multiplier *= number(awakening.attackMultiplier, 1);
    if (mode === 'tarot') {
        const roleElement = String(role.elementalElement || '').trim();
        const skillElement = String(element || 'none').trim();
        if (
            number(role.elementalSkillMultiplier, 1) > 1
            && skillElement !== 'none'
            && (roleElement === 'any' || roleElement === 'all' || skillElement === 'all' || roleElement === skillElement)
        ) {
            multiplier *= number(role.elementalSkillMultiplier, 1);
        }
    }
    return clamp(multiplier, 0.25, 4);
}

function getIncomingMultiplier(combatant) {
    const role = combatant.rolePassive || {};
    const awakening = getAwakeningBattle(combatant.player);
    let multiplier = combatant.passive.damageTakenMultiplier || 1;
    multiplier *= number(role.damageTakenMultiplier, 1);
    multiplier *= number(awakening.damageTakenMultiplier, 1);
    if (combatant.status.guardTurns > 0) multiplier *= combatant.status.damageTakenMultiplier || 1;
    if (combatant.status.defenseBreakTurns > 0) multiplier *= combatant.status.defenseBreakMultiplier || 1;
    return clamp(multiplier, 0.15, 3);
}

function roll(random, chance) {
    return random() < clamp(chance, 0, 1);
}

function shieldSuffix(result) {
    return result.absorbed > 0
        ? `（シールドが ${result.absorbed} 吸収 / 残り${result.remainingShield}）`
        : '';
}

function applyDamage(target, rawDamage) {
    const totalDamage = Math.max(1, Math.floor(number(rawDamage, 1)));
    let remaining = totalDamage;
    const shield = Math.max(0, Math.floor(number(target.player.tarotShield, 0)));
    const absorbed = Math.min(shield, remaining);
    if (absorbed > 0) {
        target.player.tarotShield = shield - absorbed;
        remaining -= absorbed;
    }
    const nextHp = Math.max(0, Math.floor(number(target.player.stats.CurrentHP, 0)) - remaining);
    target.player.stats.CurrentHP = nextHp;
    target.player.stats.HP = nextHp;
    return {
        totalDamage,
        hpDamage: remaining,
        absorbed,
        remainingShield: Math.max(0, Math.floor(number(target.player.tarotShield, 0)))
    };
}

function heal(combatant, amount) {
    const maxHp = getMaxHp(combatant);
    const before = getCurrentHp(combatant);
    const next = Math.min(maxHp, before + Math.max(0, Math.floor(number(amount, 0))));
    combatant.player.stats.CurrentHP = next;
    combatant.player.stats.HP = next;
    return next - before;
}

function maybeCritical(combatant, damage, mode, random) {
    const roleRate = number(combatant.rolePassive?.criticalRateBonus, 0);
    const weaponRate = combatant.weaponRule?.critical || 0;
    const passiveRate = combatant.passive?.criticalBonus || 0;
    const awakeningRate = number(getAwakeningBattle(combatant.player).criticalRateBonus, 0);
    const rate = mode === 'magic' ? 0 : roleRate + weaponRate + passiveRate + awakeningRate;
    if (roll(random, rate)) {
        return { damage: Math.max(1, Math.floor(damage * 1.5)), critical: true };
    }
    return { damage, critical: false };
}

function tickDurations(combatant) {
    const status = combatant.status;
    if (status.attackTurns > 0) status.attackTurns -= 1;
    if (status.guardTurns > 0) status.guardTurns -= 1;
    if (status.defenseBreakTurns > 0) status.defenseBreakTurns -= 1;
    if (status.speedTurns > 0) status.speedTurns -= 1;
    if (status.confusionTurns > 0) status.confusionTurns -= 1;
    if (status.silenceTurns > 0) status.silenceTurns -= 1;
    if (status.counterTurns > 0) status.counterTurns -= 1;
    if (status.attackTurns <= 0) status.attackMultiplier = 1;
    if (status.guardTurns <= 0) status.damageTakenMultiplier = 1;
    if (status.defenseBreakTurns <= 0) status.defenseBreakMultiplier = 1;
    if (status.speedTurns <= 0) status.speedMultiplier = 1;
}

async function applyTurnStartStatus(combatant, emitLog) {
    if (combatant.status.burnTurns <= 0) return null;
    combatant.status.burnTurns -= 1;
    const damage = Math.max(1, Math.floor(getMaxHp(combatant) * 0.04));
    const result = applyDamage(combatant, damage);
    await emitLog(`${combatant.name} は火傷で ${result.totalDamage} ダメージ！${shieldSuffix(result)} (残りHP: ${getCurrentHp(combatant)})`);
    if (!isAlive(combatant)) {
        await emitLog(`${combatant.name} はたおれた！`);
        return { defeated: true };
    }
    return null;
}

async function maybeApplyConfusionSelfDamage(combatant, emitLog, random) {
    if (combatant.status.confusionTurns <= 0) return null;
    if (!roll(random, 0.5)) return null;
    const damage = Math.max(1, Math.floor(getMaxHp(combatant) * 0.05));
    const result = applyDamage(combatant, damage);
    await emitLog(`${combatant.name} は混乱して自分に ${result.totalDamage} ダメージ！${shieldSuffix(result)} (残りHP: ${getCurrentHp(combatant)})`);
    if (!isAlive(combatant)) {
        await emitLog(`${combatant.name} はたおれた！`);
        return { defeated: true };
    }
    return null;
}

function getDamageTierMultiplier(tier) {
    const raw = String(tier || '').trim();
    if (raw.includes('特大')) return 1.65;
    if (raw.includes('中〜大')) return 1.18;
    if (raw.includes('大')) return 1.35;
    if (raw.includes('中')) return 1.05;
    if (raw.includes('小')) return 0.75;
    return 0.95;
}

function getHealTierRate(tier) {
    const raw = String(tier || '').trim();
    if (raw.includes('大')) return 0.38;
    if (raw.includes('中')) return 0.25;
    if (raw.includes('継続') || raw.includes('小')) return 0.15;
    return 0.18;
}

function normalizeElement(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === '火' || raw === 'fire') return 'fire';
    if (raw === '水' || raw === 'water') return 'water';
    if (raw === '風' || raw === 'wind') return 'wind';
    if (raw === '地' || raw === 'earth') return 'earth';
    if (raw === '全属性' || raw === 'all') return 'all';
    if (raw === '無' || raw === '無属性' || raw === 'none' || raw === 'neutral') return 'none';
    return raw || 'none';
}

function getTarotHitCount(skill) {
    const raw = `${skill?.effectClass || ''} ${skill?.damageTier || ''}`;
    const match = raw.match(/×(\d+)/);
    if (match) return clamp(Math.floor(number(match[1], 1)), 1, 4);
    return raw.includes('連撃') ? 2 : 1;
}

function calculateTarotDamage(attacker, defender, skill, hitMultiplier = 1) {
    const base = Math.max(1, getAttackStat(attacker) - Math.floor(getDefenseStat(defender) * 0.45));
    const multiplier = getDamageTierMultiplier(skill?.damageTier)
        * hitMultiplier
        * getOutgoingMultiplier(attacker, 'tarot', normalizeElement(skill?.elementKey || skill?.element))
        * getIncomingMultiplier(defender);
    return Math.max(1, Math.floor(base * multiplier));
}

function calculateTarotHeal(attacker, skill) {
    const maxHp = getMaxHp(attacker);
    const intellect = getStat(attacker.player, ['かしこさ', 'Int', 'Intelligence'], 0);
    const healPower = getEquipmentStat(attacker.player, ['HealPower'], 0);
    return Math.max(1, Math.floor(maxHp * getHealTierRate(skill?.healTier)) + Math.floor((intellect + healPower) / 6));
}

function applyTarotBuff(attacker, messages, skill) {
    const element = normalizeElement(skill?.elementKey || skill?.element);
    if (element === 'earth') {
        attacker.status.guardTurns = 2;
        attacker.status.damageTakenMultiplier = 0.78;
        messages.push('守りを固めた');
    } else if (element === 'wind') {
        attacker.status.speedTurns = 2;
        attacker.status.speedMultiplier = 1.15;
        messages.push('素早さが上がった');
    } else if (element === 'water') {
        const recovered = heal(attacker, Math.floor(getMaxHp(attacker) * 0.08));
        messages.push(`HPが ${recovered} 回復`);
    } else {
        attacker.status.attackTurns = 2;
        attacker.status.attackMultiplier = 1.15;
        messages.push('攻撃が上がった');
    }
}

function applyTarotDebuff(attacker, defender, messages, skill, random) {
    const successRate = clamp(number(skill?.successRateValue, 0.25) + (getEquipmentStat(attacker.player, ['StatusRate'], 0) / 100), 0.01, 0.95);
    if (!roll(random, successRate)) {
        messages.push('妨害は外れた');
        return;
    }
    const status = String(skill?.status || '');
    const element = normalizeElement(skill?.elementKey || skill?.element);
    if (status.includes('火傷') || element === 'fire') {
        defender.status.burnTurns = Math.max(defender.status.burnTurns, 2);
        messages.push(`${defender.name} に火傷`);
    } else if (status.includes('沈黙')) {
        defender.status.silenceTurns = Math.max(defender.status.silenceTurns, 2);
        messages.push(`${defender.name} に沈黙`);
    } else if (element === 'wind') {
        defender.status.speedTurns = 2;
        defender.status.speedMultiplier = 0.88;
        messages.push(`${defender.name} の素早さを下げた`);
    } else if (element === 'earth') {
        defender.status.defenseBreakTurns = 2;
        defender.status.defenseBreakMultiplier = 1.14;
        messages.push(`${defender.name} の防御を崩した`);
    } else {
        defender.status.attackTurns = 2;
        defender.status.attackMultiplier = 0.9;
        messages.push(`${defender.name} の攻撃を下げた`);
    }
}

function clearNegativeStatus(combatant) {
    combatant.status.defenseBreakTurns = 0;
    combatant.status.speedTurns = 0;
    combatant.status.burnTurns = 0;
    combatant.status.silenceTurns = 0;
}

function clearPositiveStatus(combatant) {
    combatant.status.attackTurns = 0;
    combatant.status.guardTurns = 0;
    combatant.status.counterTurns = 0;
}

async function tryCounter(attacker, defender, emitLog) {
    if (defender.status.counterTurns <= 0 || !isAlive(attacker) || !isAlive(defender)) return null;
    defender.status.counterTurns = 0;
    const rawDamage = Math.max(1, Math.floor(getAttackStat(defender) * number(defender.status.counterMultiplier, 0.35) * getIncomingMultiplier(attacker)));
    const result = applyDamage(attacker, rawDamage);
    await emitLog(`${defender.name} の反撃！ ${attacker.name} に ${result.totalDamage} ダメージ！${shieldSuffix(result)} (残りHP: ${getCurrentHp(attacker)})`);
    if (!isAlive(attacker)) {
        await emitLog(`${attacker.name} はたおれた！`);
        return { winner: defender.player, loser: attacker.player };
    }
    return null;
}

async function useTarotSkill(attacker, defender, emitLog, random) {
    const tarot = attacker.tarot;
    if (!Array.isArray(tarot.deck) || !tarot.deck.length) return { used: false };
    if (attacker.status.silenceTurns > 0) return { used: false };
    if (tarot.cooldown > 0) {
        tarot.cooldown -= 1;
        return { used: false };
    }
    const skill = tarot.deck[tarot.index % tarot.deck.length];
    tarot.index = (tarot.index + 1) % tarot.deck.length;
    tarot.cooldown = Math.max(0, Math.floor(number(skill?.cooldown, 0)));

    const effectClass = String(skill?.effectClass || '');
    let mode = effectClass;
    if (effectClass === '特殊') {
        const value = random();
        mode = value < 0.25 ? '攻撃' : value < 0.5 ? '回復' : value < 0.75 ? '強化' : '妨害';
    }

    const messages = [];
    const hasAttack = /攻撃|連撃|先制|万能/.test(mode) || !!skill?.damageTier;
    const hasHeal = /回復|復活|万能/.test(mode) || !!skill?.healTier;
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
            const raw = calculateTarotDamage(attacker, defender, skill, perHitMultiplier);
            const critical = maybeCritical(attacker, raw, 'tarot', random);
            const result = applyDamage(defender, critical.damage);
            totalDamage += result.totalDamage;
            totalAbsorbed += result.absorbed;
        }
        messages.push(`${defender.name} に ${totalDamage} ダメージ${hitCount > 1 ? `（${hitCount}連撃）` : ''}${totalAbsorbed > 0 ? ` / シールド${totalAbsorbed}吸収` : ''}`);
    }
    if (hasHeal) {
        const recovered = heal(attacker, calculateTarotHeal(attacker, skill));
        messages.push(`HPが ${recovered} 回復`);
    }
    if (hasDefense) {
        attacker.status.guardTurns = 2;
        attacker.status.damageTakenMultiplier = 0.78;
        messages.push('防御態勢を取った');
    }
    if (hasBuff) applyTarotBuff(attacker, messages, skill);
    if (hasDebuff) applyTarotDebuff(attacker, defender, messages, skill, random);
    if (hasCleanse) {
        clearNegativeStatus(attacker);
        clearPositiveStatus(defender);
        messages.push('状態変化を解除した');
    }
    if (hasCounter) {
        attacker.status.counterTurns = 1;
        attacker.status.counterMultiplier = 0.35;
        messages.push('反撃の構え');
    }
    if (String(skill?.effectClass || '').includes('リスク')) {
        const recoil = applyDamage(attacker, Math.floor(getMaxHp(attacker) * 0.08));
        messages.push(`反動で ${recoil.totalDamage} ダメージ${shieldSuffix(recoil)}`);
    }

    const cardName = skill?.cardName || skill?.displayName || 'タロット';
    const skillName = skill?.skillName || 'カード効果';
    await emitLog(`${attacker.name} のタロット「${cardName} / ${skillName}」！ ${messages.join(' / ') || '効果はなかった'} (CT:${tarot.cooldown})`);
    if (!isAlive(defender)) {
        await emitLog(`${defender.name} はたおれた！`);
        return { used: true, winner: attacker.player, loser: defender.player };
    }
    if (!isAlive(attacker)) {
        await emitLog(`${attacker.name} はたおれた！`);
        return { used: true, winner: defender.player, loser: attacker.player };
    }
    const counter = await tryCounter(attacker, defender, emitLog);
    if (counter) return { used: true, ...counter };
    return { used: true };
}

function getMagicSkillMeta(entry, profile, currentMp, distance) {
    if (getSkillType(entry) !== 'magic') return null;
    const kindRaw = String(entry?.magicKind || entry?.effectType || entry?.targetType || entry?.action || entry?.effect || '').toLowerCase();
    const kind = kindRaw.includes('heal') || kindRaw.includes('recovery') || kindRaw.includes('support') || kindRaw.includes('restore')
        ? 'heal'
        : 'attack';
    const mpCost = Math.max(1, Math.floor(getSkillNumber(entry, ['mpCost', 'cost', 'manaCost', 'mp'], 6) - Math.floor((profile.mpEfficiency || 0) / 3)));
    if (currentMp < mpCost) return null;
    const minRange = Math.max(1, getSkillNumber(entry, ['minRange', 'rangeMin'], 1));
    const maxRange = Math.max(minRange, getSkillNumber(entry, ['maxRange', 'rangeMax', 'range'], profile.hasStaff ? 2 : 1));
    if (kind !== 'heal' && (distance < minRange || distance > maxRange)) return null;
    const powerMultiplier = normalizeMultiplier(
        getSkillNumber(entry, ['powerMultiplier', 'damageMultiplier', 'multiplier', 'powerRate', 'rate'], kind === 'heal' ? 1.05 : 1.18),
        kind === 'heal' ? 1.05 : 1.18
    );
    const hpThreshold = clamp(normalizeRate(getSkillNumber(entry, ['healBelow', 'healThreshold', 'triggerHpRate', 'hpThreshold'], 0.55), 0.55), 0.2, 0.9);
    return { entry, kind, mpCost, powerMultiplier, hpThreshold };
}

function chooseMagicSkill(combatant, distance) {
    const currentMp = number(combatant.player.stats.CurrentMP, 0);
    if (currentMp <= 0 || combatant.status.silenceTurns > 0) return null;
    const profile = getMagicProfile(combatant);
    const candidates = combatant.skills
        .map((entry) => {
            const weapon = getSkillWeapon(entry);
            if (weapon && !combatant.weaponTypes.has(weapon)) return null;
            return getMagicSkillMeta(entry, profile, currentMp, distance);
        })
        .filter(Boolean);
    const hpRate = getCurrentHp(combatant) / getMaxHp(combatant);
    return candidates
        .filter((meta) => meta.kind === 'heal' && hpRate <= meta.hpThreshold)
        .sort((a, b) => b.powerMultiplier - a.powerMultiplier || a.mpCost - b.mpCost)[0]
        || candidates
            .filter((meta) => meta.kind === 'attack')
            .sort((a, b) => b.powerMultiplier - a.powerMultiplier || a.mpCost - b.mpCost)[0]
        || null;
}

async function useMagicSkill(attacker, defender, distance, emitLog) {
    const magicSkill = chooseMagicSkill(attacker, distance);
    if (!magicSkill) return { used: false };
    const profile = getMagicProfile(attacker);
    attacker.player.stats.CurrentMP = Math.max(0, number(attacker.player.stats.CurrentMP, 0) - magicSkill.mpCost);
    attacker.player.stats.MP = attacker.player.stats.CurrentMP;

    if (magicSkill.kind === 'heal') {
        const awakening = getAwakeningBattle(attacker.player);
        const amount = Math.max(8, Math.floor((profile.basePower + profile.healPower) * magicSkill.powerMultiplier * number(awakening.healMultiplier, 1)));
        const recovered = heal(attacker, amount);
        await emitLog(`${attacker.name} は ${getSkillLabel(magicSkill.entry, '治癒魔法')} を唱えた！ HPが ${recovered} 回復！ (残りHP: ${getCurrentHp(attacker)}, 残りMP: ${attacker.player.stats.CurrentMP})`);
        return { used: true };
    }

    const intellect = getStat(attacker.player, ['かしこさ', 'Int', 'Intelligence'], 0);
    const enemyGuard = Math.floor(getDefenseStat(defender) * 0.25 + getStat(defender.player, ['かしこさ', 'Int', 'Intelligence'], 0) * 0.25);
    const base = Math.max(1, Math.floor(profile.basePower * magicSkill.powerMultiplier) - enemyGuard);
    const rawDamage = Math.max(1, Math.floor(base * (1.8 + intellect / 64) * getOutgoingMultiplier(attacker, 'magic') * getIncomingMultiplier(defender)));
    const result = applyDamage(defender, rawDamage);
    await emitLog(`${attacker.name} は ${getSkillLabel(magicSkill.entry, '魔法')} を唱えた！ ${defender.name} に ${result.totalDamage} の魔法ダメージ！${shieldSuffix(result)} (残りHP: ${getCurrentHp(defender)}, 残りMP: ${attacker.player.stats.CurrentMP})`);
    if (!isAlive(defender)) {
        await emitLog(`${defender.name} はたおれた！`);
        return { used: true, winner: attacker.player, loser: defender.player };
    }
    const counter = await tryCounter(attacker, defender, emitLog);
    if (counter) return { used: true, ...counter };
    return { used: true };
}

function chooseWeaponTechnique(combatant, distance, random) {
    const weapon = combatant.primaryWeapon;
    const technique = combatant.skills.find((entry) => {
        if (getSkillType(entry) !== 'weapon') return false;
        const skillWeapon = getSkillWeapon(entry);
        return !skillWeapon || skillWeapon === weapon;
    });
    if (!technique) return null;
    const baseChance = normalizeRate(getSkillNumber(technique, ['procChance', 'chance', 'activationRate'], 0.16), 0.16);
    const rangeBonus = weapon === 'gun' ? Math.max(0, distance - 1) * 0.04 : 0;
    if (!roll(random, baseChance + rangeBonus + (combatant.passive.skillProcBonus || 0))) return null;
    return technique;
}

function calculatePhysicalDamage(attacker, defender, distance, technique, random) {
    const attack = getAttackStat(attacker);
    const defense = getDefenseStat(defender);
    const distancePenalty = distance > 1 && attacker.primaryWeapon !== 'gun' && attacker.primaryWeapon !== 'polearm' && attacker.primaryWeapon !== 'staff'
        ? 0.88
        : 1;
    const techniqueMultiplier = technique
        ? normalizeMultiplier(getSkillNumber(technique, ['powerMultiplier', 'damageMultiplier', 'multiplier'], 1.2), 1.2)
        : 1;
    const raw = Math.max(1, Math.floor(
        (attack * attacker.weaponRule.power * techniqueMultiplier * distancePenalty * getOutgoingMultiplier(attacker, 'physical'))
        - (defense * 0.55)
    ));
    const final = Math.floor(raw * getIncomingMultiplier(defender));
    return maybeCritical(attacker, final, 'physical', random);
}

async function performPhysicalAttack(attacker, defender, distance, emitLog, random) {
    const evasionChance = defender.weaponTypes.has('dagger')
        ? clamp(0.08 + (defender.passive.evadeBonus || 0) - number(attacker.rolePassive?.accuracyBonus, 0), 0.02, 0.35)
        : 0;
    if (evasionChance > 0 && roll(random, evasionChance)) {
        await emitLog(`${attacker.name} のこうげき！ ${defender.name} は身をかわした！`);
        return {};
    }

    const technique = chooseWeaponTechnique(attacker, distance, random);
    if (technique) {
        await emitLog(`${attacker.name} は ${getSkillLabel(technique, '武器技')} を発動！`);
    }
    const critical = calculatePhysicalDamage(attacker, defender, distance, technique, random);
    const result = applyDamage(defender, critical.damage);
    await emitLog(`${attacker.name} のこうげき！ ${critical.critical ? 'クリティカル！ ' : ''}${defender.name} に ${result.totalDamage} のダメージ！${shieldSuffix(result)} (残りHP: ${getCurrentHp(defender)})`);
    if (!isAlive(defender)) {
        await emitLog(`${defender.name} はたおれた！`);
        return { winner: attacker.player, loser: defender.player };
    }
    const counter = await tryCounter(attacker, defender, emitLog);
    if (counter) return counter;
    return {};
}

async function advance(attacker, battle, emitLog, random) {
    const speedEdge = clamp(getEffectiveSpeed(attacker) / 160, 0, 0.25);
    const quickStep = attacker.weaponTypes.has('dagger') || attacker.weaponTypes.has('sword') || attacker.weaponTypes.has('polearm');
    const step = quickStep && roll(random, 0.22 + speedEdge) ? 2 : 1;
    battle.distance = Math.max(1, battle.distance - step);
    await emitLog(`${attacker.name} は距離を詰めた！ (距離: ${battle.distance})`);
}

async function takeTurn(attacker, defender, battle, emitLog, random) {
    if (!isAlive(attacker)) return null;
    const statusResult = await applyTurnStartStatus(attacker, emitLog);
    if (statusResult?.defeated) return { winner: defender.player, loser: attacker.player };

    if (battle.distance > attacker.range) {
        await advance(attacker, battle, emitLog, random);
        tickDurations(attacker);
        return null;
    }

    if (defender.weaponTypes.has('shield') && roll(random, 0.08 + (defender.passive.evadeBonus || 0))) {
        battle.distance = Math.min(DEFAULT_MAX_DISTANCE, battle.distance + 1);
        await emitLog(`${defender.name} は盾で押し返した！ (距離: ${battle.distance})`);
        tickDurations(attacker);
        return null;
    }

    const confusionResult = await maybeApplyConfusionSelfDamage(attacker, emitLog, random);
    if (confusionResult?.defeated) return { winner: defender.player, loser: attacker.player };

    const tarot = await useTarotSkill(attacker, defender, emitLog, random);
    if (tarot.winner) return tarot;
    if (tarot.used) {
        tickDurations(attacker);
        return null;
    }

    const magic = await useMagicSkill(attacker, defender, battle.distance, emitLog);
    if (magic.winner) return magic;
    if (magic.used) {
        tickDurations(attacker);
        return null;
    }

    const physical = await performPhysicalAttack(attacker, defender, battle.distance, emitLog, random);
    tickDurations(attacker);
    return physical?.winner ? physical : null;
}

function getCaptainRankValue(itemData) {
    const raw = String(itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || '').trim().toUpperCase();
    if (raw === 'A' || raw === 'ACE') return 1;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 1 && value <= 10 ? Math.floor(value) : 0;
}

function normalizeCaptainSuit(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (['wand', 'wands', 'fire', '杖', '棒'].includes(raw)) return 'wand';
    if (['sword', 'swords', 'wind', '剣'].includes(raw)) return 'sword';
    if (['cup', 'cups', 'water', '聖杯', '杯'].includes(raw)) return 'cup';
    if (['pentacle', 'pentacles', 'coin', 'coins', 'earth', '金貨', '硬貨'].includes(raw)) return 'pentacle';
    return raw;
}

function applyCaptainCards(combatant) {
    const cards = Array.isArray(combatant.player?.tarotCaptainSkillCards) ? combatant.player.tarotCaptainSkillCards : [];
    const summary = { wand: 0, sword: 0, cup: 0, pentacle: 0, count: 0 };
    for (const card of cards) {
        const itemData = card?.itemData || {};
        const rank = getCaptainRankValue(itemData);
        const suit = normalizeCaptainSuit(itemData?.ArcanaSuit || itemData?.Suit || itemData?.Element);
        if (!rank || !['wand', 'sword', 'cup', 'pentacle'].includes(suit)) continue;
        summary[suit] += rank;
        summary.count += 1;
    }
    if (!summary.count) return '';
    combatant.player.equipmentStats = combatant.player.equipmentStats || {};
    combatant.player.equipmentStats.Power = number(combatant.player.equipmentStats.Power, 0) + summary.wand;
    combatant.player.equipmentStats.Defense = number(combatant.player.equipmentStats.Defense, 0) + summary.pentacle;
    combatant.player.stats.すばやさ = getStat(combatant.player, ['すばやさ', 'Agi'], 1) + summary.sword;
    const hpBonus = summary.cup * 4;
    combatant.player.stats.MaxHP += hpBonus;
    combatant.player.stats.CurrentHP += hpBonus;
    combatant.player.stats.HP = combatant.player.stats.CurrentHP;
    const parts = [];
    if (summary.wand) parts.push(`杖 攻撃+${summary.wand}`);
    if (summary.sword) parts.push(`剣 速さ+${summary.sword}`);
    if (summary.cup) parts.push(`杯 HP+${hpBonus}`);
    if (summary.pentacle) parts.push(`金貨 守備+${summary.pentacle}`);
    return parts.join(' / ');
}

function applyNavalBoardingEffects(combatant) {
    const state = combatant.navalBoarding || {};
    const parts = [];
    const hpPercent = clamp(number(state.crewHpPercent, 100), 0, 100);
    if (hpPercent < 100) {
        const nextHp = Math.max(1, Math.floor(getMaxHp(combatant) * (hpPercent / 100)));
        combatant.player.stats.CurrentHP = Math.min(getCurrentHp(combatant), nextHp);
        combatant.player.stats.HP = combatant.player.stats.CurrentHP;
        parts.push(`船員HP${Math.round(hpPercent)}%`);
    }
    const maxMp = Math.max(0, number(combatant.player.stats.MaxMP, number(combatant.player.stats.MP, 0)));
    const mpPercent = clamp(number(state.crewMpPercent, 100), 0, 100);
    if (maxMp > 0 && mpPercent < 100) {
        const nextMp = Math.max(0, Math.floor(maxMp * (mpPercent / 100)));
        combatant.player.stats.CurrentMP = Math.min(number(combatant.player.stats.CurrentMP, maxMp), nextMp);
        combatant.player.stats.MP = combatant.player.stats.CurrentMP;
        parts.push(`船員MP${Math.round(mpPercent)}%`);
    }
    const statuses = state.statuses || {};
    if (statuses.fire) {
        combatant.status.burnTurns = Math.max(combatant.status.burnTurns, statuses.fire);
        parts.push('火傷');
    }
    if (statuses.flood) {
        combatant.status.speedTurns = Math.max(combatant.status.speedTurns, statuses.flood);
        combatant.status.speedMultiplier = Math.min(combatant.status.speedMultiplier || 1, 0.9);
        parts.push('水浸し');
    }
    if (statuses.fear) {
        combatant.status.attackTurns = Math.max(combatant.status.attackTurns, statuses.fear);
        combatant.status.attackMultiplier = Math.min(combatant.status.attackMultiplier || 1, 0.5);
        parts.push('恐怖');
    }
    if (statuses.confusion) {
        combatant.status.confusionTurns = Math.max(combatant.status.confusionTurns, statuses.confusion);
        parts.push('混乱');
    }
    const morale = clamp(Math.floor(number(state.morale, 0)), -2, 2);
    if (morale !== 0) {
        combatant.navalMoraleMultiplier = clamp(1 + morale * 0.08, 0.84, 1.16);
        parts.push(`士気${morale > 0 ? '+' : ''}${morale}`);
    }
    return parts.join(' / ');
}

async function applyBattleStartEffects(combatant, emitLog) {
    const captainText = applyCaptainCards(combatant);
    if (captainText) {
        await emitLog(`${combatant.name} の船長タロット: ${captainText}`);
    }

    const passive = combatant.rolePassive || {};
    combatant.player.tarotShield = 0;
    if (passive.active) {
        const oldMaxHp = getMaxHp(combatant);
        const hpRate = number(passive.hpRate, 0);
        if (hpRate > 0) {
            const newMaxHp = Math.max(1, Math.floor(oldMaxHp * (1 + hpRate)));
            const delta = newMaxHp - oldMaxHp;
            combatant.player.stats.MaxHP = newMaxHp;
            combatant.player.stats.CurrentHP = Math.min(newMaxHp, getCurrentHp(combatant) + delta);
            combatant.player.stats.HP = combatant.player.stats.CurrentHP;
        }

        const agilityMultiplier = number(passive.agilityMultiplier, 1);
        if (agilityMultiplier !== 1) {
            const speed = getStat(combatant.player, ['すばやさ', 'Agi'], 1);
            const nextSpeed = Math.max(1, Math.floor(speed * agilityMultiplier));
            combatant.player.stats.すばやさ = nextSpeed;
            combatant.player.stats.Agi = nextSpeed;
        }

        const shieldRate = number(passive.startingShieldRate, 0);
        if (shieldRate > 0) {
            combatant.player.tarotShield = Math.max(1, Math.floor(getMaxHp(combatant) * shieldRate));
        }

        await emitLog(`${combatant.name} のタロット役「${passive.roleLabel}」: ${passive.bonusText}`);
    }

    const navalText = applyNavalBoardingEffects(combatant);
    if (navalText) {
        await emitLog(`${combatant.name} の海戦影響: ${navalText}`);
    }
}

function decideByJudgement(a, b) {
    const aHpRate = getCurrentHp(a) / getMaxHp(a);
    const bHpRate = getCurrentHp(b) / getMaxHp(b);
    if (aHpRate !== bHpRate) return aHpRate > bHpRate ? { winner: a, loser: b } : { winner: b, loser: a };
    const aScore = getAttackStat(a) + getDefenseStat(a) + getEffectiveSpeed(a);
    const bScore = getAttackStat(b) + getDefenseStat(b) + getEffectiveSpeed(b);
    return aScore >= bScore ? { winner: a, loser: b } : { winner: b, loser: a };
}

async function runMeleeBattle(playerA, playerB, options = {}) {
    const logs = [];
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const emitLog = async (message) => {
        const text = String(message || '');
        logs.push(text);
        if (typeof options.emitLog === 'function') {
            await options.emitLog(text);
        }
    };

    const catalogCache = options.catalogCache || {};
    const fighterA = createCombatant(playerA, catalogCache);
    const fighterB = createCombatant(playerB, catalogCache);

    await applyBattleStartEffects(fighterA, emitLog);
    await applyBattleStartEffects(fighterB, emitLog);

    const first = getEffectiveSpeed(fighterA) >= getEffectiveSpeed(fighterB) ? fighterA : fighterB;
    const second = first === fighterA ? fighterB : fighterA;
    const battle = {
        distance: clamp(
            Math.floor(number(options.startingDistance, DEFAULT_STARTING_DISTANCE)),
            1,
            Math.floor(number(options.maxDistance, DEFAULT_MAX_DISTANCE))
        )
    };

    await emitLog(`戦闘開始！ ${first.name} の先攻！`);
    await emitLog(`両者の距離は ${battle.distance} マスだ！`);

    const maxRounds = Math.max(1, Math.floor(number(options.maxRounds, DEFAULT_MAX_ROUNDS)));
    for (let round = 1; round <= maxRounds; round += 1) {
        const order = [fighterA, fighterB].sort((left, right) => getEffectiveSpeed(right) - getEffectiveSpeed(left));
        for (const attacker of order) {
            const defender = attacker === fighterA ? fighterB : fighterA;
            const result = await takeTurn(attacker, defender, battle, emitLog, random);
            if (result?.winner && result?.loser) {
                return { winner: result.winner, loser: result.loser, logs };
            }
        }
    }

    await emitLog('決着がつかなかった...！ 判定に入る。');
    const judgement = decideByJudgement(fighterA, fighterB);
    await emitLog(`判定勝ち: ${judgement.winner.name}`);
    return { winner: judgement.winner.player, loser: judgement.loser.player, logs };
}

module.exports = {
    runMeleeBattle,
    createCombatant,
    resolveWeaponType,
    getEquippedWeaponTypes,
    getEffectiveSpeed,
    calculateTarotDamage,
    calculatePhysicalDamage
};
