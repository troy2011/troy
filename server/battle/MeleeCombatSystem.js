'use strict';

const { getTarotRolePassive } = require('../tarotRoles');
const { getTarotBattleDeck } = require('../tarotBattleSkills');

const DEFAULT_MAX_ROUNDS = 18;
const DICE_SLOTS = [1, 2, 3, 4, 5, 6];
const MINOR_DICE = [2, 3, 4, 5, 6];
const LEGACY_STAT_KEYS = {
    strength: 'ちから',
    defense: 'みのまもり',
    speed: 'すばやさ',
    intelligence: 'かしこさ'
};

const WEAPON_LABELS = {
    staff: '杖',
    wand: 'ワンド',
    axe: '斧',
    axe_big: '大斧',
    blunt: '鈍器',
    dagger: '短剣',
    polearm: '槍',
    shield: '盾',
    sword: '剣',
    sword_big: '大剣',
    gun: '銃',
    gun_big: '大型銃',
    bow: '弓',
    unarmed: '素手'
};

const WEAPON_SPEED = {
    dagger: 6,
    sword: 3,
    bow: 2,
    polearm: 1,
    staff: 0,
    wand: 0,
    blunt: -1,
    axe: -1,
    shield: -2,
    gun: -3,
    gun_big: -4,
    sword_big: -4,
    axe_big: -5,
    unarmed: 0
};

const ELEMENT_KEYS = new Set(['fire', 'wind', 'earth', 'water']);
const ELEMENT_LABELS = {
    fire: '\u706b',
    wind: '\u98a8',
    earth: '\u5730',
    water: '\u6c34',
    none: '\u7121\u5c5e\u6027'
};
const ELEMENT_BEATS = {
    fire: 'wind',
    wind: 'earth',
    earth: 'water',
    water: 'fire'
};
const ELEMENT_ALIASES = {
    fire: 'fire',
    flame: 'fire',
    wand: 'fire',
    wands: 'fire',
    '\u706b': 'fire',
    '\u30ef\u30f3\u30c9': 'fire',
    wind: 'wind',
    air: 'wind',
    sword: 'wind',
    swords: 'wind',
    '\u98a8': 'wind',
    '\u30bd\u30fc\u30c9': 'wind',
    '\u5263': 'wind',
    earth: 'earth',
    land: 'earth',
    pentacle: 'earth',
    pentacles: 'earth',
    coin: 'earth',
    coins: 'earth',
    '\u5730': 'earth',
    '\u30da\u30f3\u30bf\u30af\u30eb': 'earth',
    '\u30b3\u30a4\u30f3': 'earth',
    water: 'water',
    aqua: 'water',
    cup: 'water',
    cups: 'water',
    '\u6c34': 'water',
    '\u30ab\u30c3\u30d7': 'water',
    none: 'none',
    neutral: 'none',
    unknown: 'none',
    '\u7121': 'none',
    '\u7121\u5c5e\u6027': 'none'
};

const WEAPON_FORMS = {
    staff: [
        form(1, '杖打ち', 70, 100),
        support(2, '祈り', [fx('healPercent', { target: 'self', value: 5 })]),
        form(3, '足払い', 60, 100, [fx('nextWeaponPower', { target: 'enemy', value: -20 })]),
        support(4, '守りの印', [fx('nextDamageTaken', { target: 'self', multiplier: 0.8, charges: 1 })]),
        support(5, '浄化', [fx('cleanse', { target: 'self', statuses: ['fear', 'confusion'] })]),
        support(6, '星読み', [fx('nextMinorAccuracy', { target: 'self', value: 15 })])
    ],
    wand: [
        form(1, '魔弾', 80, 100, [], { elementKey: 'fire' }),
        form(2, '火花', 60, 100, [fx('burn', { chance: 0.15 })], { elementKey: 'fire' }),
        support(3, '詠唱', [fx('nextMinorPower', { target: 'self', value: 20 })]),
        support(4, '魔力逆流', [fx('nextMinorAccuracy', { target: 'self', value: -20 })], { drawback: true }),
        form(5, '焼尽', 110, 85, [], { elementKey: 'fire' }),
        support(6, '魔力充填', [fx('nextMinorEffectChance', { target: 'self', value: 15 })])
    ],
    axe: [
        form(1, '斧打ち', 110, 95),
        form(2, '横薙ぎ', 90, 100),
        form(3, '食い込み', 100, 95, [fx('defenseDown', { target: 'enemy', multiplier: 0.9, turns: 1 })]),
        form(4, '大振り', 130, 70, [fx('nextDamageTaken', { trigger: 'miss', target: 'self', multiplier: 1.2, charges: 1 })], { drawback: true }),
        form(5, '追い斧', 80, 100, [], { conditionalPower: { status: 'fear', value: 50 } }),
        form(6, '柄殴り', 70, 100, [fx('confusion', { chance: 0.2 })])
    ],
    axe_big: [
        form(1, '巨斧', 130, 85),
        missForm(2, '踏み外し', [fx('nextDamageTaken', { target: 'self', multiplier: 1.2, charges: 1 })]),
        form(3, '断ち割り', 160, 75),
        support(4, '溜め', [fx('nextWeaponPower', { target: 'self', value: 50 })]),
        form(5, '反動斬り', 140, 80, [fx('selfHpPercentDamage', { trigger: 'always', value: 5 })], { drawback: true }),
        form(6, '終撃', 180, 65)
    ],
    blunt: [
        form(1, '殴打', 100, 100),
        form(2, '鎧砕き', 80, 100, [fx('defenseDown', { target: 'enemy', multiplier: 0.9, turns: 1 })]),
        form(3, '昏倒打ち', 70, 100, [fx('confusion', { chance: 0.2 })]),
        form(4, '重心崩し', 60, 100, [fx('attackDown', { target: 'enemy', multiplier: 0.8, turns: 1 })]),
        form(5, '盾割り', 100, 90, [fx('clearGuard', { target: 'enemy' })], { guardPierce: 0.5 }),
        missForm(6, '振り遅れ', [fx('accuracyBonus', { target: 'self', value: -15, turns: 1 })])
    ],
    dagger: [
        form(1, '刺突', 70, 110, [], { criticalBonus: 0.15 }),
        form(2, '先刺し', 60, 100, [], { priority: true }),
        form(3, '二連突き', 40, 100, [], { hitCount: 2 }),
        form(4, '深追い', 100, 90, [fx('nextDamageTaken', { trigger: 'always', target: 'self', multiplier: 1.2, charges: 1 })], { drawback: true }),
        form(5, '影縫い', 60, 100, [fx('speedChange', { target: 'enemy', multiplier: 0.8, turns: 1 })]),
        form(6, '急所狙い', 120, 75, [], { criticalBonus: 0.3 })
    ],
    polearm: [
        form(1, '突き', 100, 100),
        support(2, '間合い取り', [fx('nextDamageTaken', { target: 'self', multiplier: 0.75, charges: 1 })]),
        form(3, '薙ぎ払い', 90, 100),
        form(4, '迎撃', 80, 100, [fx('nextWeaponPower', { target: 'enemy', value: -30 })]),
        form(5, '引き寄せ', 70, 100, [fx('defenseDown', { target: 'enemy', multiplier: 0.9, turns: 1 })]),
        missForm(6, '長柄が絡む', [fx('speedChange', { target: 'self', multiplier: 0.8, turns: 1 })])
    ],
    shield: [
        form(1, '盾打ち', 60, 100, [fx('nextDamageTaken', { target: 'self', multiplier: 0.9, charges: 1 })]),
        support(2, '防御姿勢', [fx('nextDamageTaken', { target: 'self', multiplier: 0.6, charges: 1 })]),
        form(3, '押し返し', 70, 100, [fx('attackDown', { target: 'enemy', multiplier: 0.8, turns: 1 })]),
        support(4, '盾構え', [fx('damageTakenTimed', { target: 'self', multiplier: 0.5, turns: 1 })]),
        support(5, '反撃姿勢', [fx('counter', { target: 'self', power: 60, turns: 1 })]),
        missForm(6, '動きが鈍る', [fx('speedChange', { target: 'self', multiplier: 0.8, turns: 1 })])
    ],
    sword: [
        form(1, '斬撃', 100, 100),
        form(2, '受け流し', 70, 100, [fx('nextDamageTaken', { target: 'self', multiplier: 0.85, charges: 1 })]),
        form(3, '突き', 90, 110),
        form(4, '連斬', 50, 100, [], { hitCount: 2 }),
        form(5, '踏み込み', 110, 90),
        support(6, '呼吸を整える', [fx('moraleOrHeal', { target: 'self', value: 1, healPercent: 5 })])
    ],
    sword_big: [
        form(1, '大剣斬り', 120, 90),
        missForm(2, '構え直し', [fx('nextDamageTaken', { target: 'self', multiplier: 0.9, charges: 1 })]),
        form(3, '兜割り', 150, 80),
        form(4, '薙ぎ払い', 110, 95),
        form(5, '反動斬り', 130, 85, [fx('speedChange', { target: 'self', multiplier: 0.9, turns: 1 })], { drawback: true }),
        form(6, '溜め斬り', 180, 65)
    ],
    bow: [
        form(1, '射撃', 90, 110),
        form(2, '曲射', 80, 100, [], { ignoreDefense: 0.2 }),
        support(3, '狙い', [fx('accuracyBonus', { target: 'self', value: 30, turns: 1 })]),
        form(4, '早射ち', 45, 100, [], { hitCount: 2 }),
        form(5, '牽制射', 60, 100, [fx('attackDown', { target: 'enemy', multiplier: 0.8, turns: 1 })]),
        missForm(6, '弦切れ', [fx('nextWeaponPower', { target: 'self', value: -20 })])
    ],
    gun: [
        form(1, '発砲', 120, 85, [], { ignoreDefense: 0.2 }),
        missForm(2, '装填不良'),
        form(3, '貫通弾', 120, 90, [], { ignoreDefense: 0.5 }),
        form(4, '牽制射撃', 70, 100, [fx('accuracyBonus', { target: 'enemy', value: -20, turns: 1 })]),
        missForm(5, '暴発', [fx('selfHpPercentDamage', { target: 'self', value: 5 })]),
        form(6, '銃火一閃', 160, 70, [], { ignoreDefense: 0.3 })
    ],
    unarmed: [
        form(1, '殴る', 60, 100),
        form(2, '身構える', 0, 0, [fx('nextDamageTaken', { target: 'self', multiplier: 0.9, charges: 1 })], { kind: 'support' }),
        form(3, '蹴る', 70, 95),
        form(4, '押す', 50, 100, [fx('attackDown', { target: 'enemy', multiplier: 0.9, turns: 1 })]),
        form(5, '飛びかかる', 80, 85),
        missForm(6, '息切れ')
    ]
};

WEAPON_FORMS.gun_big = WEAPON_FORMS.gun;

function fx(type, props = {}) {
    return { type, ...props };
}

function form(slot, name, power, accuracy, effectCodes = [], extra = {}) {
    return {
        kind: extra.kind || 'attack',
        source: 'weapon',
        slot,
        name,
        power,
        accuracy,
        hitCount: extra.hitCount || 1,
        effectCodes,
        ...extra
    };
}

function support(slot, name, effectCodes = [], extra = {}) {
    return form(slot, name, null, null, effectCodes, { ...extra, kind: 'support' });
}

function missForm(slot, name, effectCodes = []) {
    return {
        kind: 'miss',
        source: 'weapon',
        slot,
        name,
        power: null,
        accuracy: null,
        hitCount: 0,
        effectCodes,
        drawback: true
    };
}

function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function nameOf(player) {
    return String(player?.stats?.DisplayName || player?.displayName || player?.name || player?.id || '戦闘員');
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

function normalizeRate(value, fallback = 0) {
    const parsed = number(value, Number.NaN);
    if (!Number.isFinite(parsed)) return fallback;
    const rate = parsed > 1 ? parsed / 100 : parsed;
    return clamp(rate, 0, 0.8);
}

function getParryRate(player) {
    const raw = getEquipmentStat(player, ['ParryRate', 'ParryChance', 'BlockRate', 'BlockChance'], Number.NaN);
    return normalizeRate(raw, 0);
}

function getParryCharges(player) {
    const raw = getEquipmentStat(player, ['ParryCharges', 'ParryCount', 'BlockCharges'], 0);
    return Math.max(0, Math.floor(raw));
}

function ensureBattleStats(player) {
    player.stats = player.stats || {};
    const maxHp = Math.max(1, Math.floor(number(player.stats.MaxHP, number(player.stats.HP, number(player.stats.CurrentHP, 1)))));
    const currentHp = clamp(Math.floor(number(player.stats.CurrentHP, number(player.stats.HP, maxHp))), 0, maxHp);
    const maxMp = Math.max(0, Math.floor(number(player.stats.MaxMP, number(player.stats.MP, number(player.stats.CurrentMP, 0)))));
    const currentMp = clamp(Math.floor(number(player.stats.CurrentMP, number(player.stats.MP, maxMp))), 0, maxMp);
    player.stats.MaxHP = maxHp;
    player.stats.CurrentHP = currentHp;
    player.stats.HP = currentHp;
    player.stats.MaxMP = maxMp;
    player.stats.CurrentMP = currentMp;
    player.stats.MP = currentMp;
    player.equipmentStats = player.equipmentStats || {};
    return player.stats;
}

function getMaxHp(combatant) {
    return Math.max(1, number(combatant?.player?.stats?.MaxHP, 1));
}

function getCurrentHp(combatant) {
    return clamp(number(combatant?.player?.stats?.CurrentHP, 0), 0, getMaxHp(combatant));
}

function setCurrentHp(combatant, hp) {
    const next = clamp(Math.floor(number(hp, 0)), 0, getMaxHp(combatant));
    combatant.player.stats.CurrentHP = next;
    combatant.player.stats.HP = next;
}

function getMaxMp(combatant) {
    return Math.max(0, number(combatant?.player?.stats?.MaxMP, number(combatant?.player?.stats?.MP, 0)));
}

function getCurrentMp(combatant) {
    return clamp(number(combatant?.player?.stats?.CurrentMP, number(combatant?.player?.stats?.MP, 0)), 0, getMaxMp(combatant));
}

function setCurrentMp(combatant, mp) {
    const next = clamp(Math.floor(number(mp, 0)), 0, getMaxMp(combatant));
    combatant.player.stats.CurrentMP = next;
    combatant.player.stats.MP = next;
}

function getAttackStat(combatant) {
    const player = combatant.player;
    const base = getStat(player, [LEGACY_STAT_KEYS.strength, 'Power', 'Attack'], 1);
    const equipment = getEquipmentStat(player, ['Power', 'Attack'], 0);
    return Math.max(1, base + equipment);
}

function getDefenseStat(combatant) {
    const player = combatant.player;
    const base = getStat(player, [LEGACY_STAT_KEYS.defense, 'Defense', 'Guard'], 0);
    const equipment = getEquipmentStat(player, ['Defense', 'Guard'], 0);
    return Math.max(0, base + equipment);
}

function getBaseSpeed(combatant) {
    const player = combatant.player;
    const base = getStat(player, [LEGACY_STAT_KEYS.speed, 'Agi', 'Speed'], 1);
    const equipment = getEquipmentStat(player, ['Agi', 'Speed'], 0);
    return Math.max(1, base + equipment + (WEAPON_SPEED[combatant.primaryWeapon] || 0));
}

function getEffectiveSpeed(combatant) {
    return Math.max(1, Math.floor(getBaseSpeed(combatant) * number(combatant.status.speedMultiplier, 1)));
}

function getCombatantStatSummary(combatant) {
    return {
        attack: getAttackStat(combatant),
        defense: getDefenseStat(combatant),
        baseSpeed: getBaseSpeed(combatant),
        effectiveSpeed: getEffectiveSpeed(combatant),
        parryRate: number(combatant.status?.parryRate, 0),
        parryCharges: Math.max(0, Math.floor(number(combatant.status?.parryCharges, 0)))
    };
}

function inferWeaponTypeFromText(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (/(axe_big|greataxe|great_axe|battleaxe|largeaxe|大斧|巨斧)/i.test(raw)) return 'axe_big';
    if (/(sword_big|greatsword|great_sword|claymore|large_sword|大剣)/i.test(raw)) return 'sword_big';
    if (/(gun_big|cannon|rifle|large_gun|大銃|大型銃)/i.test(raw)) return 'gun_big';
    if (/(polearm|spear|lance|halberd|槍|長柄)/i.test(raw)) return 'polearm';
    if (/(dagger|knife|短剣|ナイフ)/i.test(raw)) return 'dagger';
    if (/(shield|buckler|盾)/i.test(raw)) return 'shield';
    if (/(wand|rod|ワンド|魔杖)/i.test(raw)) return 'wand';
    if (/(staff|杖)/i.test(raw)) return 'staff';
    if (/(bow|archery|弓)/i.test(raw)) return 'bow';
    if (/(gun|pistol|musket|銃)/i.test(raw)) return 'gun';
    if (/(axe|斧)/i.test(raw)) return 'axe';
    if (/(blunt|mace|hammer|club|鈍器|棍|槌)/i.test(raw)) return 'blunt';
    if (/(sword|blade|剣)/i.test(raw)) return 'sword';
    return '';
}

function resolveWeaponType(itemRef, catalogCache = {}) {
    if (!itemRef) return '';
    const data = itemRef.customData || itemRef.itemData || catalogCache[itemRef.ItemId] || catalogCache[itemRef.itemId] || itemRef;
    const declared = inferWeaponTypeFromText(data?.ManifestWeaponType || data?.WeaponType || data?.weaponType || data?.type);
    if (declared && WEAPON_FORMS[declared]) return declared;
    const category = String(data?.Category || data?.category || '').trim().toLowerCase();
    if (category === 'shield') return 'shield';
    const fromData = inferWeaponTypeFromText(`${data?.ItemId || ''} ${data?.DisplayName || ''} ${data?.Name || ''}`);
    if (fromData && WEAPON_FORMS[fromData]) return fromData;
    const fromRef = inferWeaponTypeFromText(typeof itemRef === 'string' ? itemRef : itemRef?.ItemId || itemRef?.id || '');
    return WEAPON_FORMS[fromRef] ? fromRef : '';
}

function getEquippedWeaponTypes(player, catalogCache = {}) {
    const types = [];
    const right = resolveWeaponType(player?.equipment?.RightHand, catalogCache);
    const left = resolveWeaponType(player?.equipment?.LeftHand, catalogCache);
    if (right) types.push(right);
    if (left && !types.includes(left)) types.push(left);
    if (!types.length) types.push('unarmed');
    return new Set(types);
}

function pickPrimaryWeapon(types) {
    const order = ['axe_big', 'sword_big', 'gun_big', 'bow', 'wand', 'staff', 'dagger', 'sword', 'axe', 'blunt', 'polearm', 'gun', 'shield', 'unarmed'];
    return order.find((type) => types.has(type)) || 'unarmed';
}

function getTarotDeckForPlayer(player, catalogCache = {}) {
    if (Array.isArray(player?.tarotBattleDeck)) {
        return player.tarotBattleDeck.filter(Boolean).slice(0, 5);
    }
    return getTarotBattleDeck(player?.meleeDeckIds || [], catalogCache || {}).slice(0, 5);
}

function parseRankNumber(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return null;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return Math.floor(parsed);
    const faces = { A: 1, ACE: 1, PAGE: 11, KNIGHT: 12, QUEEN: 13, KING: 14 };
    return faces[raw] || null;
}

function getMinorRank(card) {
    return parseRankNumber(card?.rank ?? card?.number ?? card?.ArcanaRank ?? card?.Rank ?? card?.CardRank ?? card?.CardNumber);
}

function normalizeMinorSuit(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'wands' || raw === 'fire') return 'wand';
    if (raw === 'swords' || raw === 'wind') return 'sword';
    if (raw === 'cups' || raw === 'water') return 'cup';
    if (raw === 'pentacles' || raw === 'coins' || raw === 'earth') return 'pentacle';
    return raw;
}

function normalizeElementKey(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'none';
    const lower = raw.toLowerCase();
    return ELEMENT_ALIASES[lower] || ELEMENT_ALIASES[raw] || 'none';
}

function elementLabelForKey(value) {
    const key = normalizeElementKey(value);
    return ELEMENT_LABELS[key] || ELEMENT_LABELS.none;
}

function getPlayerElementKey(player) {
    return normalizeElementKey(
        player?.avatar?.Nation
        ?? player?.avatar?.nation
        ?? player?.nation
        ?? player?.Nation
        ?? player?.stats?.Nation
        ?? player?.stats?.nation
    );
}

function getCombatantElementKey(combatant) {
    return normalizeElementKey(combatant?.elementKey || getPlayerElementKey(combatant?.player));
}

function getActionAttackElementKey(action) {
    if (action?.source !== 'minor' || action?.kind !== 'attack') return 'none';
    return normalizeElementKey(action.elementKey || action.element || action.suit);
}

function getElementalAffinity(attacker, defender, action) {
    const attackElementKey = getActionAttackElementKey(action);
    const defenderElementKey = getCombatantElementKey(defender);
    const neutral = {
        attackElementKey,
        defenderElementKey,
        relation: 'none',
        multiplier: 1,
        label: ''
    };
    if (!ELEMENT_KEYS.has(attackElementKey) || !ELEMENT_KEYS.has(defenderElementKey)) return neutral;
    if (attackElementKey === defenderElementKey) {
        return { ...neutral, relation: 'neutral' };
    }
    if (ELEMENT_BEATS[attackElementKey] === defenderElementKey) {
        return { ...neutral, relation: 'weak', multiplier: 1.25, label: 'WEAK!' };
    }
    if (ELEMENT_BEATS[defenderElementKey] === attackElementKey) {
        return { ...neutral, relation: 'resist', multiplier: 0.75, label: 'RESIST...' };
    }
    return { ...neutral, relation: 'neutral' };
}

function cloneAction(action, source = 'weapon') {
    return {
        ...action,
        source,
        effectCodes: Array.isArray(action?.effectCodes) ? action.effectCodes.map((entry) => ({ ...entry })) : []
    };
}

function buildWeaponForms(primaryWeapon) {
    const table = WEAPON_FORMS[primaryWeapon] || WEAPON_FORMS.unarmed;
    const forms = {};
    for (const action of table) {
        forms[action.slot] = {
            action: cloneAction(action, 'weapon'),
            removed: false
        };
    }
    return forms;
}

function buildDiceSlots(forms, deck) {
    const slots = {};
    for (const die of MINOR_DICE) {
        const card = deck[die - 2] || null;
        const rank = getMinorRank(card);
        const unlocked = !!card && rank === die;
        if (unlocked && forms[die]) forms[die].removed = true;
        slots[die] = { die, card, unlocked };
    }
    return slots;
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

function createStatus() {
    return {
        attackMultiplier: 1,
        attackTurns: 0,
        damageTakenMultiplier: 1,
        damageTakenTurns: 0,
        defenseMultiplier: 1,
        defenseTurns: 0,
        speedMultiplier: 1,
        speedTurns: 0,
        accuracyBonus: 0,
        accuracyTurns: 0,
        nextDamageTakenMultiplier: 1,
        nextDamageTakenCharges: 0,
        nextWeaponPowerBonus: 0,
        nextMinorPowerBonus: 0,
        nextMinorAccuracyBonus: 0,
        nextMinorEffectChanceBonus: 0,
        nextMinorEffectMultiplier: 1,
        counterPower: 0,
        counterTurns: 0,
        evasionChance: 0,
        evasionTurns: 0,
        parryRate: 0,
        parryCharges: 0,
        parryMaxCharges: 0,
        burnTurns: 0,
        floodTurns: 0,
        fearTurns: 0,
        confusionTurns: 0,
        usedPriorityLastTurn: false
    };
}

function createCombatant(player, catalogCache = {}) {
    ensureBattleStats(player);
    const weaponTypes = getEquippedWeaponTypes(player, catalogCache);
    const primaryWeapon = pickPrimaryWeapon(weaponTypes);
    const forms = buildWeaponForms(primaryWeapon);
    const deck = getTarotDeckForPlayer(player, catalogCache);
    const slots = buildDiceSlots(forms, deck);
    const status = createStatus();
    const elementKey = getPlayerElementKey(player);
    status.parryRate = getParryRate(player);
    status.parryCharges = getParryCharges(player);
    status.parryMaxCharges = status.parryCharges;
    return {
        player,
        id: String(player?.id || ''),
        name: nameOf(player),
        weaponTypes,
        primaryWeapon,
        weaponLabel: WEAPON_LABELS[primaryWeapon] || primaryWeapon,
        elementKey,
        elementLabel: elementLabelForKey(elementKey),
        forms,
        slots,
        deck,
        rolePassive: player?.tarotRolePassive || getTarotRolePassive(player?.tarotMeleeRole),
        navalBoarding: normalizeNavalBoardingState(player?.navalBoardingState),
        navalMoraleMultiplier: 1,
        morale: 0,
        status
    };
}

function publicCardForTimeline(card) {
    if (!card) return null;
    return {
        itemId: String(card.itemId || ''),
        cardId: String(card.cardId || ''),
        cardName: String(card.cardName || ''),
        skillName: String(card.skillName || ''),
        suit: String(card.suit || ''),
        elementKey: normalizeElementKey(card.elementKey || card.element || card.suit),
        rank: getMinorRank(card),
        power: Number.isFinite(Number(card.power)) ? Number(card.power) : null,
        accuracy: Number.isFinite(Number(card.accuracy)) ? Number(card.accuracy) : null,
        effectText: String(card.effectText || '')
    };
}

function publicActionForTimeline(action) {
    if (!action) return null;
    return {
        source: String(action.source || ''),
        kind: String(action.kind || ''),
        name: String(action.name || ''),
        cardName: String(action.cardName || ''),
        suit: String(action.suit || ''),
        elementKey: normalizeElementKey(action.elementKey || action.element || action.suit),
        rank: Number.isFinite(Number(action.rank)) ? Number(action.rank) : null,
        power: Number.isFinite(Number(action.power)) ? Number(action.power) : null,
        accuracy: Number.isFinite(Number(action.accuracy)) ? Number(action.accuracy) : null,
        hitCount: Math.max(0, Math.floor(number(action.hitCount, 0))),
        effectText: String(action.effectText || ''),
        priority: !!action.priority
    };
}

function publicSlotForTimeline(combatant, die) {
    const slot = combatant.slots?.[die] || {};
    const formState = combatant.forms?.[die] || {};
    const action = formState.action || {};
    return {
        die,
        initialUnlocked: !!(slot.card && slot.unlocked),
        weaponForm: {
            name: String(action.name || ''),
            kind: String(action.kind || ''),
            power: Number.isFinite(Number(action.power)) ? Number(action.power) : null,
            accuracy: Number.isFinite(Number(action.accuracy)) ? Number(action.accuracy) : null
        },
        card: publicCardForTimeline(slot.card)
    };
}

function publicCombatantForTimeline(combatant) {
    const elementKey = getCombatantElementKey(combatant);
    return {
        id: String(combatant.id || ''),
        name: String(combatant.name || ''),
        weaponType: String(combatant.primaryWeapon || ''),
        weaponLabel: String(combatant.weaponLabel || ''),
        elementKey,
        elementLabel: elementLabelForKey(elementKey),
        maxHp: getMaxHp(combatant),
        currentHp: getCurrentHp(combatant),
        parryRate: number(combatant.status?.parryRate, 0),
        parryCharges: Math.max(0, Math.floor(number(combatant.status?.parryCharges, 0))),
        slots: DICE_SLOTS.map((die) => publicSlotForTimeline(combatant, die))
    };
}

function createMeleeSetup(fighterA, fighterB) {
    return {
        version: 1,
        combatants: [
            publicCombatantForTimeline(fighterA),
            publicCombatantForTimeline(fighterB)
        ]
    };
}

function statusSnapshot(combatant) {
    const status = combatant.status || {};
    return {
        hp: getCurrentHp(combatant),
        maxHp: getMaxHp(combatant),
        morale: combatMorale(combatant),
        burn: Math.max(0, Math.floor(number(status.burnTurns, 0))),
        flood: Math.max(0, Math.floor(number(status.floodTurns, 0))),
        fear: Math.max(0, Math.floor(number(status.fearTurns, 0))),
        confusion: Math.max(0, Math.floor(number(status.confusionTurns, 0))),
        attackMultiplier: number(status.attackMultiplier, 1),
        defenseMultiplier: number(status.defenseMultiplier, 1),
        speedMultiplier: number(status.speedMultiplier, 1),
        accuracyBonus: number(status.accuracyBonus, 0),
        damageTakenMultiplier: number(status.damageTakenMultiplier, 1),
        guardCharges: Math.max(0, Math.floor(number(status.nextDamageTakenCharges, 0))),
        counter: Math.max(0, Math.floor(number(status.counterTurns, 0))),
        evasion: Math.max(0, Math.floor(number(status.evasionTurns, 0))),
        parryCharges: Math.max(0, Math.floor(number(status.parryCharges, 0)))
    };
}

function statusDiff(before, after) {
    const changes = [];
    Object.keys(after || {}).forEach((key) => {
        if (key === 'hp' || key === 'maxHp') return;
        if (before?.[key] !== after[key]) {
            changes.push({ key, before: before?.[key] ?? null, after: after[key] });
        }
    });
    return changes;
}

function createTimelineEntry({ round, attacker, defender, die, decision, before, after, execution }) {
    const action = decision?.action || null;
    const attackerBefore = before?.attacker || {};
    const defenderBefore = before?.defender || {};
    const attackerAfter = after?.attacker || {};
    const defenderAfter = after?.defender || {};
    const elemental = getElementalAffinity(attacker, defender, action);
    return {
        round: Math.max(1, Math.floor(number(round, 1))),
        actorId: String(attacker.id || ''),
        actorName: String(attacker.name || ''),
        targetId: String(defender.id || ''),
        targetName: String(defender.name || ''),
        die: Math.max(1, Math.floor(number(die, 1))),
        resultType: String(decision?.type || 'miss'),
        reason: String(decision?.reason || ''),
        action: publicActionForTimeline(action),
        attackElementKey: elemental.attackElementKey,
        defenderElementKey: elemental.defenderElementKey,
        elementalRelation: elemental.relation,
        elementalMultiplier: elemental.multiplier,
        elementalLabel: elemental.label,
        damage: Math.max(0, defenderBefore.hp - defenderAfter.hp),
        selfDamage: Math.max(0, attackerBefore.hp - attackerAfter.hp),
        healing: Math.max(0, attackerAfter.hp - attackerBefore.hp),
        attackerHpBefore: attackerBefore.hp,
        attackerHpAfter: attackerAfter.hp,
        defenderHpBefore: defenderBefore.hp,
        defenderHpAfter: defenderAfter.hp,
        anyHit: !!execution?.anyHit,
        parried: !!execution?.parried,
        parryCount: Math.max(0, Math.floor(number(execution?.parryCount, 0))),
        statusChanges: [
            ...statusDiff(attackerBefore, attackerAfter).map((change) => ({ ...change, target: 'actor' })),
            ...statusDiff(defenderBefore, defenderAfter).map((change) => ({ ...change, target: 'target' }))
        ]
    };
}

function normalizeActionFromMinor(card) {
    return {
        kind: card?.power == null && card?.accuracy == null ? 'support' : 'attack',
        source: 'minor',
        name: String(card?.skillName || card?.name || card?.cardName || '小アルカナ'),
        cardName: String(card?.cardName || ''),
        suit: normalizeMinorSuit(card?.suit),
        elementKey: normalizeElementKey(card?.elementKey || card?.element || card?.suit),
        power: Number.isFinite(Number(card?.power)) ? Number(card.power) : null,
        accuracy: Number.isFinite(Number(card?.accuracy)) ? Number(card.accuracy) : null,
        rank: getMinorRank(card),
        hitCount: Math.max(1, Math.floor(number(card?.hitCount, 1))),
        effectText: String(card?.effectText || ''),
        effectCodes: Array.isArray(card?.effectCodes) ? card.effectCodes.map((entry) => ({ ...entry })) : [],
        ignoreDefense: number(card?.ignoreDefense, 0),
        criticalBonus: number(card?.criticalBonus, 0),
        drainRate: number(card?.drainRate, 0),
        priority: !!card?.priority,
        conditionalPower: card?.conditionalPower || null
    };
}

function resolveDiceAction(combatant, die) {
    const slotDie = Math.floor(number(die, 1));
    if (!DICE_SLOTS.includes(slotDie)) {
        return { type: 'miss', die: slotDie, reason: '無効な出目' };
    }

    const formState = combatant.forms[slotDie];
    const minorSlot = combatant.slots[slotDie];
    if (slotDie >= 2 && minorSlot?.card && minorSlot.unlocked) {
        return {
            type: 'minorArcana',
            die: slotDie,
            action: normalizeActionFromMinor(minorSlot.card)
        };
    }

    if (formState && !formState.removed) {
        formState.removed = true;
        if (minorSlot?.card) minorSlot.unlocked = true;
        return {
            type: 'weaponForm',
            die: slotDie,
            action: cloneAction(formState.action, 'weapon')
        };
    }

    if (slotDie >= 2 && minorSlot?.card) {
        minorSlot.unlocked = true;
        return {
            type: 'minorArcana',
            die: slotDie,
            action: normalizeActionFromMinor(minorSlot.card)
        };
    }

    return {
        type: 'miss',
        die: slotDie,
        reason: slotDie === 1 ? '1の武器型は外れている' : '空スロットの武器型は外れている'
    };
}

function createDieRoller(options, random) {
    const diceRolls = Array.isArray(options?.diceRolls) ? options.diceRolls.slice() : [];
    return () => {
        if (diceRolls.length) return clamp(Math.floor(number(diceRolls.shift(), 1)), 1, 6);
        return Math.floor(random() * 6) + 1;
    };
}

function hasStatus(combatant, status) {
    if (status === 'any') return ['burn', 'flood', 'fear', 'confusion'].some((key) => hasStatus(combatant, key));
    if (status === 'burn') return combatant.status.burnTurns > 0;
    if (status === 'flood') return combatant.status.floodTurns > 0;
    if (status === 'fear') return combatant.status.fearTurns > 0;
    if (status === 'confusion') return combatant.status.confusionTurns > 0;
    if (status === 'guard') return combatant.status.nextDamageTakenCharges > 0 || combatant.status.damageTakenMultiplier < 1;
    if (status === 'priority') return !!combatant.status.usedPriorityLastTurn;
    return false;
}

function formatActionName(decision) {
    const action = decision.action || {};
    if (decision.type === 'weaponForm') return `${action.name}（武器型）`;
    if (decision.type === 'minorArcana') {
        const cardName = action.cardName ? `${action.cardName} / ` : '';
        return `${cardName}${action.name}（小アルカナ）`;
    }
    return 'ミス';
}

function roleAttackMultiplier(combatant, action) {
    const passive = combatant.rolePassive || {};
    let multiplier = number(passive.attackMultiplier, 1);
    if (action?.source === 'minor' && passive.elementalSkillMultiplier) {
        const element = String(passive.elementalElement || '').toLowerCase();
        if (element === 'any' || !element || element === action.elementKey) {
            multiplier *= number(passive.elementalSkillMultiplier, 1);
        }
    }
    return multiplier;
}

function roleDamageTakenMultiplier(combatant) {
    return number(combatant.rolePassive?.damageTakenMultiplier, 1);
}

function calculateActionDamage(attacker, defender, action, consume = true) {
    const attack = getAttackStat(attacker);
    const defenseMultiplier = action?.ignoreDefense >= 1 ? 0 : number(defender.status.defenseMultiplier, 1);
    const ignoreDefense = clamp(number(action?.ignoreDefense, 0), 0, 1);
    const defense = getDefenseStat(defender) * defenseMultiplier * (1 - ignoreDefense);
    let power = number(action?.power, 100);

    if (action?.source === 'weapon' && attacker.status.nextWeaponPowerBonus) {
        power += attacker.status.nextWeaponPowerBonus;
        if (consume) attacker.status.nextWeaponPowerBonus = 0;
    }
    if (action?.source === 'minor' && attacker.status.nextMinorPowerBonus) {
        power += attacker.status.nextMinorPowerBonus;
        if (consume) attacker.status.nextMinorPowerBonus = 0;
    }
    if (action?.source === 'minor' && action.suit === 'wand' && attacker.status.nextWandsPowerBonus) {
        power += attacker.status.nextWandsPowerBonus;
        if (consume) attacker.status.nextWandsPowerBonus = 0;
    }
    if (action?.conditionalPower) {
        const condition = action.conditionalPower;
        const matchedStatus = hasStatus(defender, condition.status) || hasStatus(attacker, condition.selfStatus);
        const matchedSpeed = condition.selfSpeedAtLeastEnemy && getEffectiveSpeed(attacker) >= getEffectiveSpeed(defender);
        const matchedGuard = condition.enemyGuarding && hasStatus(defender, 'guard');
        const matchedPriority = condition.enemyUsedPriority && hasStatus(defender, 'priority');
        if (matchedStatus || matchedSpeed || matchedGuard || matchedPriority) {
            power += number(condition.value, 0);
        }
    }

    let raw = Math.max(1, attack * Math.max(0, power) / 100 - defense * 0.55);
    raw *= number(attacker.status.attackMultiplier, 1);
    raw *= 1 + combatMorale(attacker) * 0.05;
    raw *= number(attacker.navalMoraleMultiplier, 1);
    raw *= roleAttackMultiplier(attacker, action);
    raw *= roleDamageTakenMultiplier(defender);
    raw *= number(defender.status.damageTakenMultiplier, 1);
    raw *= getElementalAffinity(attacker, defender, action).multiplier;
    if (defender.status.nextDamageTakenCharges > 0) {
        raw *= number(defender.status.nextDamageTakenMultiplier, 1);
        if (consume) {
            defender.status.nextDamageTakenCharges -= 1;
            if (defender.status.nextDamageTakenCharges <= 0) {
                defender.status.nextDamageTakenCharges = 0;
                defender.status.nextDamageTakenMultiplier = 1;
            }
        }
    }
    return Math.max(1, Math.floor(raw));
}

function calculateHitChance(attacker, defender, action, consume = true) {
    let accuracy = number(action?.accuracy, 100);
    accuracy += number(attacker.status.accuracyBonus, 0);
    accuracy += number(attacker.rolePassive?.accuracyBonus, 0) * 100;
    if (action?.source === 'minor' && attacker.status.nextMinorAccuracyBonus) {
        accuracy += attacker.status.nextMinorAccuracyBonus;
        if (consume) attacker.status.nextMinorAccuracyBonus = 0;
    }
    if (defender.status.evasionChance > 0 && consume) {
        // Evasion is handled separately so the log can explain what happened.
    }
    return clamp(accuracy, 5, 100) / 100;
}

function combatMorale(combatant) {
    return clamp(number(combatant.morale, 0), -2, 2);
}

function rollChance(random, chance) {
    if (chance >= 1) return true;
    if (chance <= 0) return false;
    return random() < chance;
}

async function maybeParry(defender, action, emitLog, random) {
    const status = defender.status || {};
    if (action?.kind !== 'attack') return false;
    if (number(status.parryRate, 0) <= 0 || Math.floor(number(status.parryCharges, 0)) <= 0) return false;
    if (!rollChance(random, number(status.parryRate, 0))) return false;
    status.parryCharges = Math.max(0, Math.floor(number(status.parryCharges, 0)) - 1);
    await emitLog(`${defender.name} は盾で${action.name}をパリイ（残り${status.parryCharges}回）`);
    return true;
}

async function applyDamage(defender, amount, emitLog, source = '') {
    let remaining = Math.max(0, Math.floor(number(amount, 0)));
    const shield = Math.max(0, Math.floor(number(defender.player.tarotShield, 0)));
    if (shield > 0 && remaining > 0) {
        const absorbed = Math.min(shield, remaining);
        defender.player.tarotShield = shield - absorbed;
        remaining -= absorbed;
        await emitLog(`${defender.name} のシールドが ${absorbed} ダメージを吸収`);
    }
    if (remaining > 0) {
        setCurrentHp(defender, getCurrentHp(defender) - remaining);
    }
    return remaining;
}

async function healPercent(combatant, percent, emitLog, label = '回復') {
    const amount = Math.max(1, Math.floor(getMaxHp(combatant) * number(percent, 0) / 100));
    const before = getCurrentHp(combatant);
    setCurrentHp(combatant, before + amount);
    const healed = getCurrentHp(combatant) - before;
    if (healed > 0) await emitLog(`${combatant.name} は${label}で HPを${healed}回復`);
    return healed;
}

function setMultiplier(status, multiplierKey, turnKey, multiplier, turns) {
    status[multiplierKey] = number(multiplier, 1);
    status[turnKey] = Math.max(status[turnKey] || 0, Math.floor(number(turns, 1)));
}

function cleanseStatuses(target, statuses) {
    const cleared = [];
    for (const status of statuses || []) {
        if (status === 'burn' && target.status.burnTurns > 0) {
            target.status.burnTurns = 0;
            cleared.push('火傷');
        }
        if (status === 'flood' && target.status.floodTurns > 0) {
            target.status.floodTurns = 0;
            cleared.push('水浸し');
        }
        if (status === 'fear' && target.status.fearTurns > 0) {
            target.status.fearTurns = 0;
            cleared.push('恐怖');
        }
        if (status === 'confusion' && target.status.confusionTurns > 0) {
            target.status.confusionTurns = 0;
            cleared.push('混乱');
        }
        if (status === 'accuracy' && target.status.accuracyBonus !== 0) {
            target.status.accuracyBonus = 0;
            target.status.accuracyTurns = 0;
            cleared.push('命中変化');
        }
        if (status === 'guard') {
            clearGuard(target);
            cleared.push('防御効果');
        }
    }
    return cleared;
}

function clearGuard(target) {
    target.status.nextDamageTakenMultiplier = 1;
    target.status.nextDamageTakenCharges = 0;
    target.status.damageTakenMultiplier = Math.max(1, target.status.damageTakenMultiplier);
    target.status.damageTakenTurns = 0;
    target.status.counterPower = 0;
    target.status.counterTurns = 0;
    target.status.evasionChance = 0;
    target.status.evasionTurns = 0;
}

function effectTarget(effect, attacker, defender) {
    const target = effect.target || 'enemy';
    return target === 'self' ? attacker : defender;
}

function adjustedEffectChance(attacker, action, effect) {
    let chance = number(effect.chance, 1);
    if (action.source === 'minor') {
        chance += number(attacker.status.nextMinorEffectChanceBonus, 0) / 100;
    }
    return clamp(chance, 0, 1);
}

function adjustedEffectValue(defender, action, value) {
    let next = number(value, 0);
    if (action.source === 'minor' && defender.status.nextMinorEffectMultiplier !== 1) {
        next *= defender.status.nextMinorEffectMultiplier;
        defender.status.nextMinorEffectMultiplier = 1;
    }
    return next;
}

async function applyEffect(effect, context) {
    const { attacker, defender, action, emitLog, random, trigger } = context;
    const expected = effect.trigger || (action.kind === 'support' ? 'support' : 'hit');
    if (expected !== 'always' && expected !== trigger) return;
    if (effect.conditionStatus) {
        const conditionTarget = effect.conditionTarget === 'self' ? attacker : defender;
        if (!hasStatus(conditionTarget, effect.conditionStatus)) return;
    }
    if (effect.chance != null && !rollChance(random, adjustedEffectChance(attacker, action, effect))) return;

    const target = effectTarget(effect, attacker, defender);
    const rawValue = adjustedEffectValue(defender, action, effect.value);
    switch (effect.type) {
        case 'burn':
            target.status.burnTurns = Math.max(target.status.burnTurns, Math.floor(number(effect.turns, 2)));
            await emitLog(`${target.name} は火傷を負った`);
            break;
        case 'flood':
            target.status.floodTurns = Math.max(target.status.floodTurns, Math.floor(number(effect.turns, 2)));
            setMultiplier(target.status, 'speedMultiplier', 'speedTurns', 0.9, number(effect.turns, 2));
            await emitLog(`${target.name} は水浸しになった`);
            break;
        case 'fear':
            target.status.fearTurns = Math.max(target.status.fearTurns, Math.floor(number(effect.turns, 2)));
            setMultiplier(target.status, 'attackMultiplier', 'attackTurns', 0.8, number(effect.turns, 2));
            await emitLog(`${target.name} は恐怖した`);
            break;
        case 'confusion':
            target.status.confusionTurns = Math.max(target.status.confusionTurns, Math.floor(number(effect.turns, 2)));
            await emitLog(`${target.name} は混乱した`);
            break;
        case 'speedChange':
            setMultiplier(target.status, 'speedMultiplier', 'speedTurns', number(effect.multiplier, 1), number(effect.turns, 1));
            await emitLog(`${target.name} の素早さが変化`);
            break;
        case 'speedUp':
            setMultiplier(target.status, 'speedMultiplier', 'speedTurns', number(effect.multiplier, 1.2), number(effect.turns, 1));
            await emitLog(`${target.name} の素早さが上がった`);
            break;
        case 'defenseDown':
            setMultiplier(target.status, 'defenseMultiplier', 'defenseTurns', number(effect.multiplier, 0.9), number(effect.turns, 1));
            await emitLog(`${target.name} の防御が下がった`);
            break;
        case 'attackDown':
            setMultiplier(target.status, 'attackMultiplier', 'attackTurns', number(effect.multiplier, 0.8), number(effect.turns, 1));
            await emitLog(`${target.name} の次のダメージが下がる`);
            break;
        case 'accuracyBonus':
            target.status.accuracyBonus += rawValue;
            target.status.accuracyTurns = Math.max(target.status.accuracyTurns, Math.floor(number(effect.turns, 1)));
            await emitLog(`${target.name} の命中が${rawValue >= 0 ? '上がった' : '下がった'}`);
            break;
        case 'nextDamageTaken':
            target.status.nextDamageTakenMultiplier = number(effect.multiplier, 1);
            target.status.nextDamageTakenCharges = Math.max(target.status.nextDamageTakenCharges, Math.floor(number(effect.charges, 1)));
            await emitLog(`${target.name} の次被ダメージ補正が変化`);
            break;
        case 'damageTakenTimed':
            setMultiplier(target.status, 'damageTakenMultiplier', 'damageTakenTurns', number(effect.multiplier, 1), number(effect.turns, 1));
            await emitLog(`${target.name} は防御を固めた`);
            break;
        case 'nextWeaponPower':
            target.status.nextWeaponPowerBonus += rawValue;
            await emitLog(`${target.name} の次の武器型威力が${rawValue >= 0 ? '上がる' : '下がる'}`);
            break;
        case 'nextMinorPower':
            target.status.nextMinorPowerBonus += rawValue;
            await emitLog(`${target.name} の次の小アルカナ威力が上がる`);
            break;
        case 'nextMinorAccuracy':
            target.status.nextMinorAccuracyBonus += rawValue;
            await emitLog(`${target.name} の次の小アルカナ命中が変化`);
            break;
        case 'nextMinorEffectChance':
            target.status.nextMinorEffectChanceBonus += rawValue;
            await emitLog(`${target.name} の次の小アルカナ追加効果率が上がる`);
            break;
        case 'nextMinorEffectMultiplier':
            target.status.nextMinorEffectMultiplier = number(effect.multiplier, 1);
            await emitLog(`${target.name} の次の小アルカナ効果量が下がる`);
            break;
        case 'clearGuard':
            clearGuard(target);
            await emitLog(`${target.name} の防御・ガード効果を解除`);
            break;
        case 'cleanse': {
            const cleared = cleanseStatuses(target, effect.statuses || ['burn', 'flood', 'fear', 'confusion']);
            await emitLog(cleared.length ? `${target.name} の${cleared.join('・')}を解除` : `${target.name} は状態を整えた`);
            break;
        }
        case 'healPercent':
            await healPercent(target, rawValue, emitLog);
            break;
        case 'healOrCleanseBurn':
            if (target.status.burnTurns > 0) {
                target.status.burnTurns = 0;
                await emitLog(`${target.name} の火傷を解除`);
            } else {
                await healPercent(target, rawValue, emitLog);
            }
            break;
        case 'healAndCleanseOne': {
            const cleared = cleanseStatuses(target, ['burn', 'flood', 'fear', 'confusion']).slice(0, 1);
            await healPercent(target, rawValue, emitLog);
            if (cleared.length) await emitLog(`${target.name} の${cleared[0]}を解除`);
            break;
        }
        case 'morale':
            target.morale = clamp(target.morale + rawValue, -2, 2);
            await emitLog(`${target.name} の士気が${target.morale >= 0 ? '+' : ''}${target.morale}`);
            break;
        case 'moraleOrHeal':
            if (target.morale >= 2) {
                await healPercent(target, number(effect.healPercent, 5), emitLog);
            } else {
                target.morale = clamp(target.morale + rawValue, -2, 2);
                await emitLog(`${target.name} の士気が+${target.morale}`);
            }
            break;
        case 'moraleOrPower':
            if (target.morale >= 2) {
                target.status.nextWeaponPowerBonus += number(effect.powerBonus, 20);
                await emitLog(`${target.name} の次攻撃威力が上がる`);
            } else {
                target.morale = clamp(target.morale + rawValue, -2, 2);
                await emitLog(`${target.name} の士気が+${target.morale}`);
            }
            break;
        case 'nextWandsPower':
            target.status.nextWandsPowerBonus = number(effect.value, 30);
            await emitLog(`${target.name} の次のワンド技威力が上がる`);
            break;
        case 'mpPercent': {
            const delta = Math.floor(getMaxMp(target) * rawValue / 100);
            setCurrentMp(target, getCurrentMp(target) + delta);
            await emitLog(`${target.name} のMPが${delta >= 0 ? '+' : ''}${delta}`);
            break;
        }
        case 'counter':
            target.status.counterPower = Math.max(target.status.counterPower, number(effect.power, 60));
            target.status.counterTurns = Math.max(target.status.counterTurns, Math.floor(number(effect.turns, 1)));
            await emitLog(`${target.name} は反撃姿勢を取った`);
            break;
        case 'evasion':
            target.status.evasionChance = Math.max(target.status.evasionChance, number(effect.chance, 0.4));
            target.status.evasionTurns = Math.max(target.status.evasionTurns, Math.floor(number(effect.turns, 1)));
            await emitLog(`${target.name} は回避姿勢を取った`);
            break;
        case 'selfHpPercentDamage': {
            const recoil = Math.max(1, Math.floor(getMaxHp(target) * rawValue / 100));
            await applyDamage(target, recoil, emitLog, 'recoil');
            await emitLog(`${target.name} は反動で${recoil}ダメージ`);
            break;
        }
        case 'extraHpPercentDamage': {
            const extra = Math.max(1, Math.floor(getMaxHp(target) * rawValue / 100));
            await applyDamage(target, extra, emitLog, 'extra');
            await emitLog(`${target.name} は追加で${extra}ダメージ`);
            break;
        }
        case 'clearEnemyEvasion':
            target.status.evasionChance = 0;
            target.status.evasionTurns = 0;
            target.status.counterPower = 0;
            target.status.counterTurns = 0;
            await emitLog(`${target.name} の回避・反撃構えを解除`);
            break;
        default:
            break;
    }
}

async function applyEffects(effects, context) {
    for (const effect of effects || []) {
        await applyEffect(effect, context);
    }
    if (context.action.source === 'minor' && context.trigger !== 'miss') {
        context.attacker.status.nextMinorEffectChanceBonus = 0;
    }
}

async function executeAttack(attacker, defender, action, emitLog, random) {
    const hitCount = Math.max(1, Math.floor(number(action.hitCount, 1)));
    let anyHit = false;
    let totalDamage = 0;
    let parryCount = 0;
    for (let i = 0; i < hitCount; i += 1) {
        if (defender.status.evasionChance > 0 && rollChance(random, defender.status.evasionChance)) {
            defender.status.evasionChance = 0;
            defender.status.evasionTurns = 0;
            await emitLog(`${defender.name} は攻撃を回避`);
            continue;
        }
        const hitChance = calculateHitChance(attacker, defender, action, i === hitCount - 1);
        if (!rollChance(random, hitChance)) {
            await emitLog(`${action.name} は外れた`);
            continue;
        }
        if (await maybeParry(defender, action, emitLog, random)) {
            parryCount += 1;
            continue;
        }
        let damage = calculateActionDamage(attacker, defender, action, i === hitCount - 1);
        const critChance = clamp(number(action.criticalBonus, 0) + number(attacker.rolePassive?.criticalRateBonus, 0), 0, 0.8);
        if (critChance > 0 && rollChance(random, critChance)) {
            damage = Math.floor(damage * 1.5);
            await emitLog('クリティカル！');
        }
        const elemental = getElementalAffinity(attacker, defender, action);
        const applied = await applyDamage(defender, damage, emitLog);
        totalDamage += applied;
        anyHit = true;
        await emitLog(`${attacker.name} の${action.name}が命中。${defender.name}に${applied}ダメージ`);
        if (elemental.label) await emitLog(elemental.label);
        if (getCurrentHp(defender) <= 0) break;
    }

    if (anyHit) {
        await applyEffects(action.effectCodes, { attacker, defender, action, emitLog, random, trigger: 'hit' });
        if (action.drainRate && totalDamage > 0) {
            const heal = Math.floor(totalDamage * number(action.drainRate, 0));
            setCurrentHp(attacker, getCurrentHp(attacker) + heal);
            await emitLog(`${attacker.name} は${heal}吸収`);
        }
        await maybeCounter(defender, attacker, emitLog, random);
    } else if (parryCount <= 0) {
        await applyEffects(action.effectCodes, { attacker, defender, action, emitLog, random, trigger: 'miss' });
    }
    await applyEffects(action.effectCodes, { attacker, defender, action, emitLog, random, trigger: 'always' });
    return { anyHit, totalDamage, parried: parryCount > 0, parryCount };
}

async function maybeCounter(defender, attacker, emitLog, random) {
    if (defender.status.counterTurns <= 0 || defender.status.counterPower <= 0 || getCurrentHp(attacker) <= 0) return;
    const counterAction = form(0, '反撃', defender.status.counterPower, 100);
    defender.status.counterTurns = 0;
    defender.status.counterPower = 0;
    const damage = calculateActionDamage(defender, attacker, counterAction, true);
    const applied = await applyDamage(attacker, damage, emitLog);
    await emitLog(`${defender.name} の反撃。${attacker.name}に${applied}ダメージ`);
}

async function executeDecision(attacker, defender, decision, emitLog, random) {
    if (decision.type === 'miss') {
        await emitLog(`${attacker.name} の出目${decision.die}: ミス（${decision.reason}）`);
        return { anyHit: false, totalDamage: 0 };
    }
    const action = decision.action;
    attacker.status.usedPriorityLastTurn = !!action.priority;
    await emitLog(`${attacker.name} の出目${decision.die}: ${formatActionName(decision)}`);
    if (action.priority) await emitLog(`${attacker.name} は先制の構え`);

    if (action.kind === 'miss') {
        await emitLog(`${attacker.name} の${action.name}は失敗`);
        await applyEffects(action.effectCodes, { attacker, defender, action, emitLog, random, trigger: 'always' });
        await applyEffects(action.effectCodes, { attacker, defender, action, emitLog, random, trigger: 'miss' });
        return { anyHit: false, totalDamage: 0 };
    }

    if (action.kind === 'support') {
        await applyEffects(action.effectCodes, { attacker, defender, action, emitLog, random, trigger: 'support' });
        await applyEffects(action.effectCodes, { attacker, defender, action, emitLog, random, trigger: 'always' });
        return { anyHit: true, totalDamage: 0 };
    }

    return executeAttack(attacker, defender, action, emitLog, random);
}

async function applyStartOfTurnStatus(combatant, emitLog, random) {
    if (combatant.status.burnTurns > 0) {
        const damage = Math.max(1, Math.floor(getMaxHp(combatant) * 0.05));
        await applyDamage(combatant, damage, emitLog, 'burn');
        await emitLog(`${combatant.name} は火傷で${damage}ダメージ`);
        if (getCurrentHp(combatant) <= 0) return false;
    }
    if (combatant.status.confusionTurns > 0 && rollChance(random, 0.2)) {
        await emitLog(`${combatant.name} は混乱して行動できない`);
        return false;
    }
    return true;
}

function tickDurations(combatant) {
    const status = combatant.status;
    const timed = [
        ['attackTurns', 'attackMultiplier'],
        ['damageTakenTurns', 'damageTakenMultiplier'],
        ['defenseTurns', 'defenseMultiplier'],
        ['speedTurns', 'speedMultiplier'],
        ['accuracyTurns', 'accuracyBonus']
    ];
    for (const [turnKey, valueKey] of timed) {
        if (status[turnKey] > 0) {
            status[turnKey] -= 1;
            if (status[turnKey] <= 0) {
                status[turnKey] = 0;
                status[valueKey] = valueKey === 'accuracyBonus' ? 0 : 1;
            }
        }
    }
    if (status.burnTurns > 0) status.burnTurns -= 1;
    if (status.floodTurns > 0) status.floodTurns -= 1;
    if (status.fearTurns > 0) status.fearTurns -= 1;
    if (status.confusionTurns > 0) status.confusionTurns -= 1;
    if (status.counterTurns > 0) {
        status.counterTurns -= 1;
        if (status.counterTurns <= 0) status.counterPower = 0;
    }
    if (status.evasionTurns > 0) {
        status.evasionTurns -= 1;
        if (status.evasionTurns <= 0) status.evasionChance = 0;
    }
}

async function takeTurn(attacker, defender, emitLog, rollDie, random, context = {}) {
    if (getCurrentHp(attacker) <= 0) return { winner: defender, loser: attacker };
    const canAct = await applyStartOfTurnStatus(attacker, emitLog, random);
    if (getCurrentHp(attacker) <= 0) return { winner: defender, loser: attacker };
    if (!canAct) {
        tickDurations(attacker);
        return null;
    }

    const die = rollDie();
    const decision = resolveDiceAction(attacker, die);
    const before = {
        attacker: statusSnapshot(attacker),
        defender: statusSnapshot(defender)
    };
    const execution = await executeDecision(attacker, defender, decision, emitLog, random);
    const after = {
        attacker: statusSnapshot(attacker),
        defender: statusSnapshot(defender)
    };
    if (Array.isArray(context.timeline)) {
        context.timeline.push(createTimelineEntry({
            round: context.round,
            attacker,
            defender,
            die,
            decision,
            before,
            after,
            execution
        }));
    }
    tickDurations(attacker);

    if (getCurrentHp(defender) <= 0) return { winner: attacker, loser: defender };
    if (getCurrentHp(attacker) <= 0) return { winner: defender, loser: attacker };
    return null;
}

function getCaptainRankValue(itemData) {
    const raw = String(itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || '').trim().toUpperCase();
    if (raw === 'A' || raw === 'ACE') return 1;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 1 && value <= 10 ? Math.floor(value) : 0;
}

function normalizeCaptainSuit(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (['wand', 'wands', 'fire', 'ワンド'].includes(raw)) return 'wand';
    if (['sword', 'swords', 'wind', 'ソード', '剣'].includes(raw)) return 'sword';
    if (['cup', 'cups', 'water', 'カップ'].includes(raw)) return 'cup';
    if (['pentacle', 'pentacles', 'coin', 'coins', 'earth', 'ペンタクル'].includes(raw)) return 'pentacle';
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
    const speed = getStat(combatant.player, [LEGACY_STAT_KEYS.speed, 'Agi'], 1) + summary.sword;
    combatant.player.stats[LEGACY_STAT_KEYS.speed] = speed;
    combatant.player.stats.Agi = speed;
    const hpBonus = summary.cup * 4;
    combatant.player.stats.MaxHP += hpBonus;
    combatant.player.stats.CurrentHP += hpBonus;
    combatant.player.stats.HP = combatant.player.stats.CurrentHP;
    const parts = [];
    if (summary.wand) parts.push(`ワンド攻撃+${summary.wand}`);
    if (summary.sword) parts.push(`ソード速度+${summary.sword}`);
    if (summary.cup) parts.push(`カップHP+${hpBonus}`);
    if (summary.pentacle) parts.push(`ペンタクル防御+${summary.pentacle}`);
    return parts.join(' / ');
}

function applyNavalBoardingEffects(combatant) {
    const state = combatant.navalBoarding || {};
    const parts = [];
    const hpPercent = clamp(number(state.crewHpPercent, 100), 0, 100);
    if (hpPercent < 100) {
        const nextHp = Math.max(1, Math.floor(getMaxHp(combatant) * (hpPercent / 100)));
        setCurrentHp(combatant, Math.min(getCurrentHp(combatant), nextHp));
        parts.push(`船員HP${Math.round(hpPercent)}%`);
    }
    const mpPercent = clamp(number(state.crewMpPercent, 100), 0, 100);
    if (getMaxMp(combatant) > 0 && mpPercent < 100) {
        const nextMp = Math.max(0, Math.floor(getMaxMp(combatant) * (mpPercent / 100)));
        setCurrentMp(combatant, Math.min(getCurrentMp(combatant), nextMp));
        parts.push(`船員MP${Math.round(mpPercent)}%`);
    }
    const statuses = state.statuses || {};
    if (statuses.fire) {
        combatant.status.burnTurns = Math.max(combatant.status.burnTurns, statuses.fire);
        parts.push('火傷');
    }
    if (statuses.flood) {
        combatant.status.floodTurns = Math.max(combatant.status.floodTurns, statuses.flood);
        setMultiplier(combatant.status, 'speedMultiplier', 'speedTurns', 0.9, statuses.flood);
        parts.push('水浸し');
    }
    if (statuses.fear) {
        combatant.status.fearTurns = Math.max(combatant.status.fearTurns, statuses.fear);
        setMultiplier(combatant.status, 'attackMultiplier', 'attackTurns', 0.5, statuses.fear);
        parts.push('恐怖');
    }
    if (statuses.confusion) {
        combatant.status.confusionTurns = Math.max(combatant.status.confusionTurns, statuses.confusion);
        parts.push('混乱');
    }
    const morale = clamp(Math.floor(number(state.morale, 0)), -2, 2);
    if (morale !== 0) {
        combatant.navalMoraleMultiplier = clamp(1 + morale * 0.08, 0.84, 1.16);
        combatant.morale = clamp(combatant.morale + morale, -2, 2);
        parts.push(`士気${morale > 0 ? '+' : ''}${morale}`);
    }
    return parts.join(' / ');
}

async function applyBattleStartEffects(combatant, emitLog) {
    const captainText = applyCaptainCards(combatant);
    if (captainText) await emitLog(`${combatant.name} の船長タロット: ${captainText}`);

    const passive = combatant.rolePassive || {};
    combatant.player.tarotShield = 0;
    if (passive.active) {
        const oldMaxHp = getMaxHp(combatant);
        const hpRate = number(passive.hpRate, 0);
        if (hpRate > 0) {
            const newMaxHp = Math.max(1, Math.floor(oldMaxHp * (1 + hpRate)));
            const delta = newMaxHp - oldMaxHp;
            combatant.player.stats.MaxHP = newMaxHp;
            setCurrentHp(combatant, getCurrentHp(combatant) + delta);
        }
        const agilityMultiplier = number(passive.agilityMultiplier, 1);
        if (agilityMultiplier !== 1) {
            const speed = Math.max(1, Math.floor(getStat(combatant.player, [LEGACY_STAT_KEYS.speed, 'Agi'], 1) * agilityMultiplier));
            combatant.player.stats[LEGACY_STAT_KEYS.speed] = speed;
            combatant.player.stats.Agi = speed;
        }
        const shieldRate = number(passive.startingShieldRate, 0);
        if (shieldRate > 0) {
            combatant.player.tarotShield = Math.max(1, Math.floor(getMaxHp(combatant) * shieldRate));
        }
        await emitLog(`${combatant.name} のタロット役「${passive.roleLabel || passive.roleKey}」: ${passive.bonusText}`);
    }

    const navalText = applyNavalBoardingEffects(combatant);
    if (navalText) await emitLog(`${combatant.name} の海戦影響: ${navalText}`);
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
    const rollDie = createDieRoller(options, random);
    const emitLog = async (message) => {
        const text = String(message || '');
        logs.push(text);
        if (typeof options.emitLog === 'function') await options.emitLog(text);
    };

    const catalogCache = options.catalogCache || {};
    const fighterA = createCombatant(playerA, catalogCache);
    const fighterB = createCombatant(playerB, catalogCache);

    await applyBattleStartEffects(fighterA, emitLog);
    await applyBattleStartEffects(fighterB, emitLog);
    const meleeSetup = createMeleeSetup(fighterA, fighterB);
    const meleeTimeline = [];

    const first = getEffectiveSpeed(fighterA) >= getEffectiveSpeed(fighterB) ? fighterA : fighterB;
    await emitLog(`戦闘開始！ ${first.name} の先攻`);
    await emitLog(`${fighterA.name} は${fighterA.weaponLabel}型、${fighterB.name} は${fighterB.weaponLabel}型で白兵戦に入る`);

    const maxRounds = Math.max(1, Math.floor(number(options.maxRounds, DEFAULT_MAX_ROUNDS)));
    for (let round = 1; round <= maxRounds; round += 1) {
        await emitLog(`第${round}ラウンド`);
        const order = [fighterA, fighterB].sort((left, right) => getEffectiveSpeed(right) - getEffectiveSpeed(left));
        for (const attacker of order) {
            const defender = attacker === fighterA ? fighterB : fighterA;
            const result = await takeTurn(attacker, defender, emitLog, rollDie, random, { round, timeline: meleeTimeline });
            if (result?.winner && result?.loser) {
                await emitLog(`${result.winner.name} の勝利`);
                return { winner: result.winner.player, loser: result.loser.player, logs, meleeSetup, meleeTimeline };
            }
        }
    }

    await emitLog('最大ラウンド到達。残HP率と戦闘値で判定');
    const judgement = decideByJudgement(fighterA, fighterB);
    await emitLog(`判定勝ち: ${judgement.winner.name}`);
    return { winner: judgement.winner.player, loser: judgement.loser.player, logs, meleeSetup, meleeTimeline };
}

function calculateTarotDamage(attacker, defender, skill, hitMultiplier = 1) {
    const action = normalizeActionFromMinor(skill || {});
    return Math.max(1, Math.floor(calculateActionDamage(attacker, defender, action, false) * number(hitMultiplier, 1)));
}

function calculatePhysicalDamage(attacker, defender, _distance, technique = {}) {
    const action = {
        source: 'weapon',
        kind: 'attack',
        name: technique.name || '武器攻撃',
        power: number(technique.power, 100),
        accuracy: number(technique.accuracy, 100),
        hitCount: 1,
        effectCodes: []
    };
    return calculateActionDamage(attacker, defender, action, false);
}

module.exports = {
    runMeleeBattle,
    createCombatant,
    resolveWeaponType,
    getEquippedWeaponTypes,
    getEffectiveSpeed,
    getCombatantStatSummary,
    resolveDiceAction,
    normalizeElementKey,
    getElementalAffinity,
    calculateTarotDamage,
    calculatePhysicalDamage
};
