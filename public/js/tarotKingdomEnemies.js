const VOLUME_BASE_STATS = Object.freeze({
    1: Object.freeze({ hp: 300, passDamage: 12, areaDamage: 7, defense: 6, speed: 10 }),
    2: Object.freeze({ hp: 380, passDamage: 16, areaDamage: 9, defense: 13, speed: 14 }),
    3: Object.freeze({ hp: 460, passDamage: 19, areaDamage: 11, defense: 18, speed: 18 })
});

// 防御と5枚役への安全なパスで敵の攻撃回数が減るため、
// 実際に発生した一撃は従来より重くする。局ごとの加算値は倍率外に置き、
// 既存のラウンド成長幅は維持する。
const ENEMY_ATTACK_WEIGHT_MULTIPLIER = 1.25;

const ARCHETYPE_BY_NUMBER = Object.freeze({
    0: Object.freeze({ key: 'balanced', hp: 1, pass: 1, area: 1, defense: 1, speed: 1 }),
    1: Object.freeze({ key: 'brute', hp: 1.12, pass: 1.14, area: 0.95, defense: 1.05, speed: 0.85 }),
    2: Object.freeze({ key: 'caster', hp: 0.92, pass: 0.9, area: 1.22, defense: 0.9, speed: 1.08 }),
    3: Object.freeze({ key: 'swift', hp: 0.86, pass: 1.04, area: 0.9, defense: 0.75, speed: 1.42 }),
    4: Object.freeze({ key: 'guardian', hp: 1.22, pass: 0.9, area: 1.05, defense: 1.5, speed: 0.68 })
});

const STAGE_ARCHETYPE_MODIFIERS = Object.freeze({
    balanced: Object.freeze({ hp: 1, pass: 1, area: 1, defense: 1, speed: 1 }),
    brute: Object.freeze({ hp: 1.08, pass: 1.08, area: 1, defense: 1.05, speed: 0.92 }),
    caster: Object.freeze({ hp: 0.96, pass: 1, area: 1.1, defense: 0.96, speed: 1.04 }),
    swift: Object.freeze({ hp: 0.94, pass: 1.03, area: 1, defense: 0.92, speed: 1.12 }),
    guardian: Object.freeze({ hp: 1.1, pass: 0.96, area: 1, defense: 1.12, speed: 0.9 })
});

const LEGACY_ENEMY_AILMENTS = Object.freeze({
    'ismartal-vol1-monster-03': Object.freeze({ statusKey: 'poison', label: '毒', scope: 'single', chance: 0.3, potencyRate: 0.2, charges: 3 }),
    'ismartal-vol1-monster-05': Object.freeze({ statusKey: 'blind', label: '暗闇', scope: 'single', chance: 0.32, potency: 25, charges: 2 }),
    'ismartal-vol1-monster-09': Object.freeze({ statusKey: 'burn', label: '火傷', scope: 'both', chance: 0.28, potencyRate: 0.16, charges: 2 }),
    'ismartal-vol1-monster-11': Object.freeze({ statusKey: 'paralysis', label: '攻撃不能', scope: 'single', chance: 0.22, potency: 1, charges: 1 }),
    'ismartal-vol1-monster-13': Object.freeze({ statusKey: 'poison', label: '毒', scope: 'both', chance: 0.34, potencyRate: 0.22, charges: 3 }),
    'ismartal-vol1-monster-16': Object.freeze({ statusKey: 'blind', label: '暗闇', scope: 'area', chance: 0.28, potency: 28, charges: 2 }),
    'ismartal-vol2-monster-03': Object.freeze({ statusKey: 'blind', label: '暗闇', scope: 'single', chance: 0.34, potency: 30, charges: 2 }),
    'ismartal-vol2-monster-07': Object.freeze({ statusKey: 'paralysis', label: '攻撃不能', scope: 'both', chance: 0.32, potency: 1, charges: 1 }),
    'ismartal-vol2-monster-09': Object.freeze({ statusKey: 'paralysis', label: '攻撃不能', scope: 'single', chance: 0.27, potency: 1, charges: 1 }),
    'ismartal-vol2-monster-14': Object.freeze({ statusKey: 'poison', label: '毒', scope: 'single', chance: 0.38, potencyRate: 0.24, charges: 3 }),
    'ismartal-vol2-monster-15': Object.freeze({ statusKey: 'poison', label: '猛毒', scope: 'both', chance: 0.42, potencyRate: 0.28, charges: 3 }),
    'ismartal-vol2-monster-16': Object.freeze({ statusKey: 'blind', label: '暗闇', scope: 'area', chance: 0.4, potency: 36, charges: 2 }),
    'ismartal-vol2-monster-18': Object.freeze({ statusKey: 'burn', label: '火傷', scope: 'both', chance: 0.38, potencyRate: 0.2, charges: 2 }),
    'ismartal-vol2-monster-20': Object.freeze({ statusKey: 'blind', label: '暗闇', scope: 'both', chance: 0.36, potency: 34, charges: 2 }),
    'ismartal-vol3-monster-01': Object.freeze({ statusKey: 'paralysis', label: '攻撃不能', scope: 'single', chance: 0.25, potency: 1, charges: 1 }),
    'ismartal-vol3-monster-02': Object.freeze({ statusKey: 'burn', label: '火傷', scope: 'both', chance: 0.44, potencyRate: 0.22, charges: 2 }),
    'ismartal-vol3-monster-03': Object.freeze({ statusKey: 'blind', label: '暗闇', scope: 'both', chance: 0.4, potency: 38, charges: 2 }),
    'ismartal-vol3-monster-06': Object.freeze({ statusKey: 'poison', label: '毒', scope: 'single', chance: 0.44, potencyRate: 0.27, charges: 3 }),
    'ismartal-vol3-monster-07': Object.freeze({ statusKey: 'poison', label: '猛毒', scope: 'both', chance: 0.42, potencyRate: 0.3, charges: 3 }),
    'ismartal-vol3-monster-09': Object.freeze({ statusKey: 'blind', label: '暗闇', scope: 'single', chance: 0.45, potency: 42, charges: 2 }),
    'ismartal-vol3-monster-10': Object.freeze({ statusKey: 'blind', label: '深闇', scope: 'both', chance: 0.48, potency: 45, charges: 2 })
});

const ENEMY_AILMENTS = Object.freeze({
    'ismartal-vol1-monster-01': Object.freeze({ statusKey: 'vulnerable', label: '脆弱', scope: 'single', chance: 0.25, potency: 25, charges: 1 }),
    'ismartal-vol1-monster-02': Object.freeze({ statusKey: 'silence', label: '沈黙', scope: 'both', chance: 0.24, potency: 1, charges: 1 }),
    'ismartal-vol1-monster-03': LEGACY_ENEMY_AILMENTS['ismartal-vol1-monster-03'],
    'ismartal-vol1-monster-04': Object.freeze({ statusKey: 'slow', label: '鈍足', scope: 'single', chance: 0.28, potency: 25, charges: 2 }),
    'ismartal-vol1-monster-05': LEGACY_ENEMY_AILMENTS['ismartal-vol1-monster-05'],
    'ismartal-vol1-monster-06': Object.freeze({ statusKey: 'fear', label: '恐怖', scope: 'both', chance: 0.25, potency: 1, charges: 1 }),
    'ismartal-vol1-monster-07': Object.freeze({ statusKey: 'weaken', label: '弱体', scope: 'both', chance: 0.26, potency: 20, charges: 2 }),
    'ismartal-vol1-monster-08': Object.freeze({ statusKey: 'slow', label: '鈍足', scope: 'single', chance: 0.25, potency: 22, charges: 2 }),
    'ismartal-vol1-monster-09': LEGACY_ENEMY_AILMENTS['ismartal-vol1-monster-09'],
    'ismartal-vol1-monster-10': Object.freeze({ statusKey: 'silence', label: '沈黙', scope: 'single', chance: 0.25, potency: 1, charges: 1 }),
    'ismartal-vol1-monster-11': LEGACY_ENEMY_AILMENTS['ismartal-vol1-monster-11'],
    'ismartal-vol1-monster-12': Object.freeze({ statusKey: 'confusion', label: '混乱', scope: 'single', chance: 0.25, potency: 50, charges: 1 }),
    'ismartal-vol1-monster-13': LEGACY_ENEMY_AILMENTS['ismartal-vol1-monster-13'],
    'ismartal-vol1-monster-14': Object.freeze({ statusKey: 'wet', label: '水浸し', scope: 'both', chance: 0.35, potency: 20, charges: 2 }),
    'ismartal-vol1-monster-15': Object.freeze({ statusKey: 'burn', label: '火傷', scope: 'single', chance: 0.32, potencyRate: 0.18, charges: 2 }),
    'ismartal-vol1-monster-16': LEGACY_ENEMY_AILMENTS['ismartal-vol1-monster-16'],
    'ismartal-vol1-monster-17': Object.freeze({ statusKey: 'fear', label: '恐怖', scope: 'single', chance: 0.28, potency: 1, charges: 1 }),
    'ismartal-vol1-monster-18': Object.freeze({ statusKey: 'confusion', label: '混乱', scope: 'single', chance: 0.27, potency: 50, charges: 1 }),
    'ismartal-vol1-monster-19': Object.freeze({ statusKey: 'slow', label: '鈍足', scope: 'both', chance: 0.3, potency: 24, charges: 2 }),
    'ismartal-vol1-monster-20': Object.freeze({ statusKey: 'wet', label: '水浸し', scope: 'area', chance: 0.32, potency: 24, charges: 2 }),
    'ismartal-vol2-monster-01': Object.freeze({ statusKey: 'slow', label: '凍結', scope: 'both', chance: 0.32, potency: 30, charges: 2 }),
    'ismartal-vol2-monster-02': Object.freeze({ statusKey: 'confusion', label: '混乱', scope: 'single', chance: 0.28, potency: 50, charges: 1 }),
    'ismartal-vol2-monster-03': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-03'],
    'ismartal-vol2-monster-04': Object.freeze({ statusKey: 'vulnerable', label: '脆弱', scope: 'single', chance: 0.28, potency: 25, charges: 1 }),
    'ismartal-vol2-monster-05': Object.freeze({ statusKey: 'silence', label: '沈黙', scope: 'both', chance: 0.3, potency: 1, charges: 1 }),
    'ismartal-vol2-monster-06': Object.freeze({ statusKey: 'fear', label: '恐怖', scope: 'area', chance: 0.25, potency: 1, charges: 1 }),
    'ismartal-vol2-monster-07': Object.freeze({ statusKey: 'vulnerable', label: '脆弱', scope: 'both', chance: 0.32, potency: 30, charges: 1 }),
    'ismartal-vol2-monster-08': Object.freeze({ statusKey: 'wet', label: '水浸し', scope: 'single', chance: 0.32, potency: 22, charges: 2 }),
    'ismartal-vol2-monster-09': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-09'],
    'ismartal-vol2-monster-10': Object.freeze({ statusKey: 'weaken', label: '弱体', scope: 'both', chance: 0.32, potency: 24, charges: 2 }),
    'ismartal-vol2-monster-11': Object.freeze({ statusKey: 'burn', label: '火傷', scope: 'single', chance: 0.32, potencyRate: 0.18, charges: 2 }),
    'ismartal-vol2-monster-12': Object.freeze({ statusKey: 'wet', label: '水浸し', scope: 'both', chance: 0.34, potency: 25, charges: 2 }),
    'ismartal-vol2-monster-13': Object.freeze({ statusKey: 'vulnerable', label: '脆弱', scope: 'area', chance: 0.28, potency: 28, charges: 1 }),
    'ismartal-vol2-monster-14': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-14'],
    'ismartal-vol2-monster-15': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-15'],
    'ismartal-vol2-monster-16': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-16'],
    'ismartal-vol2-monster-17': Object.freeze({ statusKey: 'paralysis', label: '攻撃不能', scope: 'both', chance: 0.3, potency: 1, charges: 1 }),
    'ismartal-vol2-monster-18': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-18'],
    'ismartal-vol2-monster-19': Object.freeze({ statusKey: 'fear', label: '恐怖', scope: 'both', chance: 0.32, potency: 1, charges: 1 }),
    'ismartal-vol2-monster-20': Object.freeze({ statusKey: 'confusion', label: '混乱', scope: 'both', chance: 0.34, potency: 50, charges: 1 }),
    'ismartal-vol3-monster-01': LEGACY_ENEMY_AILMENTS['ismartal-vol3-monster-01'],
    'ismartal-vol3-monster-02': LEGACY_ENEMY_AILMENTS['ismartal-vol3-monster-02'],
    'ismartal-vol3-monster-03': LEGACY_ENEMY_AILMENTS['ismartal-vol3-monster-03'],
    'ismartal-vol3-monster-04': Object.freeze({ statusKey: 'wet', label: '水浸し', scope: 'both', chance: 0.38, potency: 28, charges: 2 }),
    'ismartal-vol3-monster-05': Object.freeze({ statusKey: 'weaken', label: '弱体', scope: 'area', chance: 0.3, potency: 26, charges: 2 }),
    'ismartal-vol3-monster-06': LEGACY_ENEMY_AILMENTS['ismartal-vol3-monster-06'],
    'ismartal-vol3-monster-07': LEGACY_ENEMY_AILMENTS['ismartal-vol3-monster-07'],
    'ismartal-vol3-monster-08': Object.freeze({ statusKey: 'weaken', label: '弱体', scope: 'both', chance: 0.36, potency: 30, charges: 2 }),
    'ismartal-vol3-monster-09': LEGACY_ENEMY_AILMENTS['ismartal-vol3-monster-09'],
    'ismartal-vol3-monster-10': Object.freeze({ statusKey: 'confusion', label: '混乱', scope: 'both', chance: 0.45, potency: 55, charges: 1 })
});

function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveInteger(value, fallback = 1) {
    return Math.max(1, Math.floor(finiteNumber(value, fallback)));
}

export function getTarotKingdomEnemyAilmentProfile(monsterId = '', version = 2) {
    const registry = Number(version) >= 2 ? ENEMY_AILMENTS : LEGACY_ENEMY_AILMENTS;
    const profile = registry[String(monsterId || '').trim()];
    return profile ? { ...profile } : null;
}

function createStageAilmentProfile(monsterId, threatLevel, version = 2) {
    const ailment = getTarotKingdomEnemyAilmentProfile(monsterId, version);
    if (!ailment) return null;
    const threat = Math.max(1, Math.min(44, Math.floor(finiteNumber(threatLevel, 1))));
    const chanceCap = Math.min(0.85, 0.14 + (threat * 0.007));
    const potencyMultiplier = 0.6 + (threat / 110);
    return {
        ...ailment,
        chance: Math.min(getTarotKingdomEnemyAilmentChance(ailment), chanceCap),
        ...(Number.isFinite(Number(ailment.potencyRate))
            ? { potencyRate: Math.max(0.01, finiteNumber(ailment.potencyRate) * potencyMultiplier) }
            : {}),
        ...(Number.isFinite(Number(ailment.potency))
            ? { potency: Math.max(1, Math.round(finiteNumber(ailment.potency) * potencyMultiplier)) }
            : {})
    };
}

function createTarotKingdomStageEnemyCombatProfile(monster = {}, options = {}) {
    const stageNo = Math.max(1, Math.min(11, Math.floor(finiteNumber(options.stageNo, 1))));
    const roundNo = Math.max(1, Math.min(4, Math.floor(finiteNumber(options.roundNo, 1))));
    const threatLevel = Math.max(
        1,
        Math.min(44, Math.floor(finiteNumber(options.threatLevel, ((stageNo - 1) * 4) + roundNo)))
    );
    const archetypeKey = String(options.archetype || 'balanced').trim().toLowerCase();
    const archetype = STAGE_ARCHETYPE_MODIFIERS[archetypeKey] || STAGE_ARCHETYPE_MODIFIERS.balanced;
    const baseHp = 220 + (threatLevel * 17);
    const basePassDamage = 9 + Math.floor(threatLevel * 0.48);
    const baseAreaDamage = 5 + Math.floor(threatLevel * 0.3);
    const baseDefense = 3 + Math.floor(threatLevel * 0.65);
    const baseSpeed = 7 + Math.floor(threatLevel * 0.35);
    return {
        version: 2,
        stageNo,
        roundNo,
        threatLevel,
        archetype: archetypeKey in STAGE_ARCHETYPE_MODIFIERS ? archetypeKey : 'balanced',
        maxHp: positiveInteger(baseHp * archetype.hp),
        passDamage: positiveInteger(basePassDamage * archetype.pass * ENEMY_ATTACK_WEIGHT_MULTIPLIER),
        areaDamage: positiveInteger(baseAreaDamage * archetype.area * ENEMY_ATTACK_WEIGHT_MULTIPLIER),
        defense: Math.max(0, Math.round(baseDefense * archetype.defense)),
        speed: Math.max(1, Math.round(baseSpeed * archetype.speed)),
        ailment: createStageAilmentProfile(monster?.id, threatLevel, options.ailmentVersion)
    };
}

export function createTarotKingdomEnemyCombatProfile(monster = {}, roundIndex = 0, options = {}) {
    if (options?.stageVersion === 1 || Number(options?.stageNo) > 0) {
        return createTarotKingdomStageEnemyCombatProfile(monster, {
            ...options,
            roundNo: options.roundNo ?? (Math.floor(finiteNumber(roundIndex, 0)) + 1)
        });
    }
    const volume = Math.max(1, Math.min(3, Math.floor(finiteNumber(monster?.volume, 1))));
    const number = Math.max(1, Math.floor(finiteNumber(monster?.number, 1)));
    const round = Math.max(0, Math.min(3, Math.floor(finiteNumber(roundIndex, 0))));
    const base = VOLUME_BASE_STATS[volume] || VOLUME_BASE_STATS[1];
    const archetype = ARCHETYPE_BY_NUMBER[number % 5] || ARCHETYPE_BY_NUMBER[0];
    const isBoss = monster?.isBoss === true || String(monster?.sizeClass || '') === 'large';
    const numberHp = base.hp + ((number - 1) * 6);
    const numberPass = base.passDamage + Math.floor((number - 1) / 6);
    const numberArea = base.areaDamage + Math.floor((number - 1) / 8);
    const numberDefense = base.defense + Math.floor((number - 1) / 3);
    const numberSpeed = base.speed + Math.floor((number - 1) / 5);
    const bossHp = isBoss ? 1.55 : 1;
    const bossAttack = isBoss ? 1.25 : 1;
    const bossDefense = isBoss ? 1.35 : 1;
    const bossSpeed = isBoss ? 0.85 : 1;
    const maxHp = positiveInteger((numberHp * archetype.hp * bossHp) + (round * 80));
    const passDamage = positiveInteger(
        (numberPass * archetype.pass * bossAttack * ENEMY_ATTACK_WEIGHT_MULTIPLIER) + (round * 2)
    );
    const areaDamage = positiveInteger(
        (numberArea * archetype.area * bossAttack * ENEMY_ATTACK_WEIGHT_MULTIPLIER) + (round * 2)
    );
    const defense = Math.max(0, Math.floor(
        (numberDefense * archetype.defense * bossDefense) + (round * 4)
    ));
    const speed = Math.max(1, Math.floor(
        (numberSpeed * archetype.speed * bossSpeed) + (round * 2)
    ));
    return {
        version: 1,
        archetype: archetype.key,
        maxHp,
        passDamage,
        areaDamage,
        defense,
        speed,
        ailment: getTarotKingdomEnemyAilmentProfile(monster?.id, options.ailmentVersion)
    };
}

export function calculateTarotKingdomEnemyMitigatedDamage(rawDamage, defense = 0) {
    const raw = Math.max(0, Math.floor(finiteNumber(rawDamage, 0)));
    if (raw <= 0) return 0;
    const safeDefense = Math.max(0, finiteNumber(defense, 0));
    return Math.max(1, Math.floor((raw * 100) / (100 + safeDefense)));
}

export function calculateTarotKingdomHitChance(attackerSpeed = 0, defenderSpeed = 0, accuracyPenalty = 0) {
    const attacker = Math.max(0, finiteNumber(attackerSpeed, 0));
    const defender = Math.max(0, finiteNumber(defenderSpeed, 0));
    const speedDifference = Math.max(-60, Math.min(60, attacker - defender));
    const speedAdjusted = Math.max(0.65, Math.min(0.98, 0.9 + (speedDifference * 0.004)));
    const penalty = Math.max(0, Math.min(0.7, finiteNumber(accuracyPenalty, 0)));
    return Math.max(0.2, Math.min(0.98, speedAdjusted - penalty));
}

export function getTarotKingdomEnemyAilmentChance(ailment = null) {
    if (!ailment) return 0;
    return Math.max(0, Math.min(0.85, finiteNumber(ailment.chance, 0)));
}
