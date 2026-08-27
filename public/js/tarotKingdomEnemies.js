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

// Version 3 makes later exploration stages meaningfully tougher without changing
// defense or speed. Keeping the scale indexed by stage makes the curve easy to
// audit and, importantly, leaves in-progress version 2 battles untouched.
const STAGE_HP_SCALE_V3 = Object.freeze([
    1, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4, 1.45, 1.5, 1.55, 1.6
]);
const STAGE_DAMAGE_SCALE_V3 = Object.freeze([
    1, 1.25, 1.4, 1.55, 1.7, 1.85, 2, 2.5, 2.5, 2.8, 2.4
]);

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
    'ismartal-vol1-monster-02': Object.freeze({ statusKey: 'silence', label: '沈黙', scope: 'single', chance: 0.24, potency: 1, charges: 1 }),
    'ismartal-vol1-monster-03': Object.freeze({ statusKey: 'curse', label: '呪い', scope: 'both', chance: 0.28, potency: 100, charges: 2 }),
    'ismartal-vol1-monster-04': Object.freeze({ statusKey: 'slow', label: '鈍足', scope: 'single', chance: 0.28, potency: 25, charges: 2 }),
    'ismartal-vol1-monster-05': LEGACY_ENEMY_AILMENTS['ismartal-vol1-monster-05'],
    'ismartal-vol1-monster-06': Object.freeze({ statusKey: 'fear', label: '恐怖', scope: 'both', chance: 0.25, potency: 1, charges: 1 }),
    'ismartal-vol1-monster-07': Object.freeze({ statusKey: 'poison', label: '毒胞子', scope: 'single', chance: 0.3, potencyRate: 0.16, charges: 3 }),
    'ismartal-vol1-monster-08': Object.freeze({ statusKey: 'slow', label: '鈍足', scope: 'single', chance: 0.25, potency: 22, charges: 2 }),
    'ismartal-vol1-monster-09': LEGACY_ENEMY_AILMENTS['ismartal-vol1-monster-09'],
    'ismartal-vol1-monster-10': Object.freeze({ statusKey: 'blind', label: '暗闇', scope: 'area', chance: 0.27, potency: 24, charges: 2 }),
    'ismartal-vol1-monster-11': Object.freeze({ statusKey: 'fear', label: '恐怖', scope: 'single', chance: 0.26, potency: 20, charges: 2 }),
    'ismartal-vol1-monster-12': Object.freeze({ statusKey: 'paralysis', label: '麻痺', scope: 'single', chance: 0.25, potency: 35, charges: 2 }),
    'ismartal-vol1-monster-13': Object.freeze({ statusKey: 'poison', label: '毒', scope: 'single', chance: 0.34, potencyRate: 0.22, charges: 3 }),
    'ismartal-vol1-monster-14': Object.freeze({ statusKey: 'wet', label: '水浸し', scope: 'both', chance: 0.35, potency: 20, charges: 2 }),
    'ismartal-vol1-monster-15': Object.freeze({ statusKey: 'poison', label: '毒', scope: 'single', chance: 0.32, potencyRate: 0.18, charges: 3 }),
    'ismartal-vol1-monster-16': LEGACY_ENEMY_AILMENTS['ismartal-vol1-monster-16'],
    'ismartal-vol1-monster-17': Object.freeze({ statusKey: 'poison', label: '毒針', scope: 'single', chance: 0.3, potencyRate: 0.18, charges: 3 }),
    'ismartal-vol1-monster-18': Object.freeze({ statusKey: 'confusion', label: '混乱', scope: 'single', chance: 0.27, potency: 50, charges: 1 }),
    'ismartal-vol1-monster-19': Object.freeze({ statusKey: 'slow', label: '鈍足', scope: 'both', chance: 0.3, potency: 24, charges: 2 }),
    'ismartal-vol1-monster-20': Object.freeze({ statusKey: 'wet', label: '水浸し', scope: 'area', chance: 0.32, potency: 24, charges: 2 }),
    'ismartal-vol2-monster-01': Object.freeze({ statusKey: 'freeze', label: '凍結', scope: 'both', chance: 0.32, potency: 30, charges: 1 }),
    'ismartal-vol2-monster-02': Object.freeze({ statusKey: 'confusion', label: '混乱', scope: 'single', chance: 0.28, potency: 50, charges: 1 }),
    'ismartal-vol2-monster-03': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-03'],
    'ismartal-vol2-monster-04': Object.freeze({ statusKey: 'vulnerable', label: '脆弱', scope: 'single', chance: 0.28, potency: 25, charges: 1 }),
    'ismartal-vol2-monster-05': Object.freeze({ statusKey: 'slow', label: '鈍足', scope: 'single', chance: 0.3, potency: 28, charges: 2 }),
    'ismartal-vol2-monster-06': Object.freeze({ statusKey: 'fear', label: '恐怖', scope: 'area', chance: 0.25, potency: 1, charges: 1 }),
    'ismartal-vol2-monster-07': Object.freeze({ statusKey: 'vulnerable', label: '脆弱', scope: 'single', chance: 0.32, potency: 30, charges: 1 }),
    'ismartal-vol2-monster-08': Object.freeze({ statusKey: 'confusion', label: '混乱', scope: 'single', chance: 0.32, potency: 50, charges: 1 }),
    'ismartal-vol2-monster-09': Object.freeze({ statusKey: 'curse', label: '呪い', scope: 'both', chance: 0.29, potency: 100, charges: 2 }),
    'ismartal-vol2-monster-10': Object.freeze({ statusKey: 'silence', label: '沈黙', scope: 'single', chance: 0.32, potency: 100, charges: 1 }),
    'ismartal-vol2-monster-11': Object.freeze({ statusKey: 'poison', label: '毒針', scope: 'single', chance: 0.34, potencyRate: 0.18, charges: 3 }),
    'ismartal-vol2-monster-12': Object.freeze({ statusKey: 'wet', label: '水浸し', scope: 'both', chance: 0.34, potency: 25, charges: 2 }),
    'ismartal-vol2-monster-13': Object.freeze({ statusKey: 'paralysis', label: '麻痺', scope: 'single', chance: 0.28, potency: 38, charges: 2 }),
    'ismartal-vol2-monster-14': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-14'],
    'ismartal-vol2-monster-15': Object.freeze({ statusKey: 'curse', label: '深淵の呪い', scope: 'area', chance: 0.42, potency: 100, charges: 2 }),
    'ismartal-vol2-monster-16': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-16'],
    'ismartal-vol2-monster-17': Object.freeze({ statusKey: 'paralysis', label: '麻痺', scope: 'both', chance: 0.3, potency: 42, charges: 2 }),
    'ismartal-vol2-monster-18': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-18'],
    'ismartal-vol2-monster-19': Object.freeze({ statusKey: 'fear', label: '恐怖', scope: 'both', chance: 0.32, potency: 1, charges: 1 }),
    'ismartal-vol2-monster-20': Object.freeze({ statusKey: 'confusion', label: '混乱', scope: 'both', chance: 0.34, potency: 50, charges: 1 }),
    'ismartal-vol3-monster-01': Object.freeze({ statusKey: 'petrify', label: '石化', scope: 'single', chance: 0.18, potency: 100, charges: 1 }),
    'ismartal-vol3-monster-02': LEGACY_ENEMY_AILMENTS['ismartal-vol3-monster-02'],
    'ismartal-vol3-monster-03': LEGACY_ENEMY_AILMENTS['ismartal-vol3-monster-03'],
    'ismartal-vol3-monster-04': Object.freeze({ statusKey: 'wet', label: '水浸し', scope: 'both', chance: 0.38, potency: 28, charges: 2 }),
    'ismartal-vol3-monster-05': Object.freeze({ statusKey: 'slow', label: '鈍足', scope: 'area', chance: 0.3, potency: 30, charges: 2 }),
    'ismartal-vol3-monster-06': Object.freeze({ statusKey: 'curse', label: '呪い', scope: 'both', chance: 0.4, potency: 100, charges: 2 }),
    'ismartal-vol3-monster-07': LEGACY_ENEMY_AILMENTS['ismartal-vol3-monster-07'],
    'ismartal-vol3-monster-08': Object.freeze({ statusKey: 'sleep', label: '睡眠胞子', scope: 'area', chance: 0.3, potency: 100, charges: 1 }),
    'ismartal-vol3-monster-09': Object.freeze({ statusKey: 'curse', label: '呪い', scope: 'single', chance: 0.4, potency: 100, charges: 2 }),
    'ismartal-vol3-monster-10': Object.freeze({ statusKey: 'fear', label: '恐怖', scope: 'area', chance: 0.45, potency: 35, charges: 2 })
});

const ENEMY_ACTION_AILMENT_OVERRIDES = Object.freeze({
    'ismartal-vol1-monster-02': Object.freeze({
        area: Object.freeze({ statusKey: 'seal', label: '魔導封印', chance: 0.24, potency: 100, charges: 2 })
    }),
    'ismartal-vol1-monster-07': Object.freeze({
        area: Object.freeze({ statusKey: 'sleep', label: '睡眠胞子', chance: 0.24, potency: 100, charges: 1 })
    }),
    'ismartal-vol1-monster-20': Object.freeze({
        single: Object.freeze({ statusKey: 'wet', label: '水浸し', chance: 0.28, potency: 20, charges: 2 })
    }),
    'ismartal-vol2-monster-07': Object.freeze({
        area: Object.freeze({ statusKey: 'burn', label: '火傷', chance: 0.32, potencyRate: 0.2, charges: 2 })
    }),
    'ismartal-vol2-monster-10': Object.freeze({
        area: Object.freeze({ statusKey: 'seal', label: '封印の矢', chance: 0.3, potency: 100, charges: 2 })
    }),
    'ismartal-vol2-monster-16': Object.freeze({
        single: Object.freeze({ statusKey: 'paralysis', label: '電磁麻痺', chance: 0.32, potency: 42, charges: 2 })
    }),
    'ismartal-vol3-monster-01': Object.freeze({
        area: Object.freeze({ statusKey: 'vulnerable', label: '岩砕き', chance: 0.34, potency: 35, charges: 1 })
    }),
    'ismartal-vol3-monster-05': Object.freeze({
        single: Object.freeze({ statusKey: 'wet', label: '水浸し', chance: 0.28, potency: 22, charges: 2 })
    }),
    'ismartal-vol3-monster-08': Object.freeze({
        single: Object.freeze({ statusKey: 'poison', label: '毒胞子', chance: 0.34, potencyRate: 0.2, charges: 3 })
    }),
    'ismartal-vol3-monster-10': Object.freeze({
        single: Object.freeze({ statusKey: 'confusion', label: '闇の混乱', chance: 0.42, potency: 55, charges: 1 })
    })
});

const ENEMY_SPECIAL_ABILITIES = Object.freeze({
    'ismartal-vol1-monster-02': Object.freeze({ id: 'arcane-cleanse', kind: 'cleanse', trigger: 'area', maxUses: 2, label: '魔導浄化' }),
    'ismartal-vol1-monster-04': Object.freeze({ id: 'shell-guard', kind: 'buff', trigger: 'both', maxUses: 1, hpThreshold: 0.75, statusKey: 'defenseUp', potency: 25, turns: 2, label: '殻ごもり' }),
    'ismartal-vol1-monster-05': Object.freeze({ id: 'focus-eye', kind: 'buff', trigger: 'single', maxUses: 1, statusKey: 'accuracyUp', potency: 25, turns: 2, label: '眼光集中' }),
    'ismartal-vol1-monster-08': Object.freeze({ id: 'sap-regeneration', kind: 'heal', trigger: 'both', maxUses: 1, hpThreshold: 0.55, healRate: 0.14, label: '樹液再生' }),
    'ismartal-vol1-monster-11': Object.freeze({ id: 'feral-rage', kind: 'buff', trigger: 'both', maxUses: 1, hpThreshold: 0.5, statusKey: 'powerUp', potency: 25, turns: 2, label: '獣性解放' }),
    'ismartal-vol1-monster-20': Object.freeze({ id: 'water-regeneration', kind: 'heal', trigger: 'area', maxUses: 2, hpThreshold: 0.85, healRate: 0.08, label: '水精再生' }),
    'ismartal-vol2-monster-07': Object.freeze({ id: 'armored-hide', kind: 'buff', trigger: 'area', maxUses: 1, hpThreshold: 0.7, statusKey: 'defenseUp', potency: 30, turns: 2, label: '甲殻硬化' }),
    'ismartal-vol2-monster-12': Object.freeze({ id: 'life-tongue', kind: 'drain', trigger: 'single', maxUses: 2, damageRate: 0.5, healCapRate: 0.08, label: '生命吸収' }),
    'ismartal-vol2-monster-15': Object.freeze({ id: 'abyss-regeneration', kind: 'heal', trigger: 'area', maxUses: 2, hpThreshold: 0.6, healRate: 0.06, label: '深淵再生' }),
    'ismartal-vol2-monster-16': Object.freeze({ id: 'optic-barrier', kind: 'buff', trigger: 'area', maxUses: 1, hpThreshold: 0.7, statusKey: 'defenseUp', potency: 30, turns: 2, label: '光学障壁' }),
    'ismartal-vol2-monster-19': Object.freeze({ id: 'mimic-rage', kind: 'buff', trigger: 'both', maxUses: 1, hpThreshold: 0.5, statusKey: 'powerUp', potency: 30, turns: 2, label: '暴食の怒り' }),
    'ismartal-vol3-monster-02': Object.freeze({ id: 'flame-focus', kind: 'buff', trigger: 'area', maxUses: 1, hpThreshold: 0.6, statusKey: 'intelligenceUp', potency: 30, turns: 2, label: '炎熱集中' }),
    'ismartal-vol3-monster-04': Object.freeze({ id: 'slime-regeneration', kind: 'heal', trigger: 'both', maxUses: 1, hpThreshold: 0.6, healRate: 0.12, label: 'ぷるぷる再生' }),
    'ismartal-vol3-monster-06': Object.freeze({ id: 'soul-drain', kind: 'drain', trigger: 'single', maxUses: 2, damageRate: 0.6, healCapRate: 0.1, label: '魂吸収' }),
    'ismartal-vol3-monster-08': Object.freeze({ id: 'mycelial-regeneration', kind: 'heal', trigger: 'both', maxUses: 1, hpThreshold: 0.55, healRate: 0.18, label: '菌糸再生' }),
    'ismartal-vol3-monster-10': Object.freeze({ id: 'shadow-cleanse', kind: 'cleanse', trigger: 'area', maxUses: 2, label: '影脱ぎ' })
});

const ENEMY_AILMENTS_V2_BASE = Object.freeze({
    'ismartal-vol1-monster-01': Object.freeze({ statusKey: 'vulnerable', label: '脆弱', scope: 'single', chance: 0.25, potency: 25, charges: 1 }),
    'ismartal-vol1-monster-02': Object.freeze({ statusKey: 'silence', label: '沈黙', scope: 'both', chance: 0.24, potency: 1, charges: 1 }),
    'ismartal-vol1-monster-03': LEGACY_ENEMY_AILMENTS['ismartal-vol1-monster-03'],
    'ismartal-vol1-monster-04': Object.freeze({ statusKey: 'slow', label: '鈍足', scope: 'single', chance: 0.28, potency: 25, charges: 2 }),
    'ismartal-vol1-monster-05': LEGACY_ENEMY_AILMENTS['ismartal-vol1-monster-05'],
    'ismartal-vol1-monster-06': Object.freeze({ statusKey: 'fear', label: '恐怖', scope: 'both', chance: 0.25, potency: 1, charges: 1 }),
    'ismartal-vol1-monster-07': Object.freeze({ statusKey: 'curse', label: '呪い', scope: 'both', chance: 0.26, potency: 100, charges: 2 }),
    'ismartal-vol1-monster-08': Object.freeze({ statusKey: 'slow', label: '鈍足', scope: 'single', chance: 0.25, potency: 22, charges: 2 }),
    'ismartal-vol1-monster-09': LEGACY_ENEMY_AILMENTS['ismartal-vol1-monster-09'],
    'ismartal-vol1-monster-10': Object.freeze({ statusKey: 'silence', label: '沈黙', scope: 'single', chance: 0.25, potency: 1, charges: 1 }),
    'ismartal-vol1-monster-11': Object.freeze({ statusKey: 'paralysis', label: '麻痺', scope: 'single', chance: 0.22, potency: 35, charges: 2 }),
    'ismartal-vol1-monster-12': Object.freeze({ statusKey: 'confusion', label: '混乱', scope: 'single', chance: 0.25, potency: 50, charges: 1 }),
    'ismartal-vol1-monster-13': LEGACY_ENEMY_AILMENTS['ismartal-vol1-monster-13'],
    'ismartal-vol1-monster-14': Object.freeze({ statusKey: 'wet', label: '水浸し', scope: 'both', chance: 0.35, potency: 20, charges: 2 }),
    'ismartal-vol1-monster-15': Object.freeze({ statusKey: 'burn', label: '火傷', scope: 'single', chance: 0.32, potencyRate: 0.18, charges: 2 }),
    'ismartal-vol1-monster-16': LEGACY_ENEMY_AILMENTS['ismartal-vol1-monster-16'],
    'ismartal-vol1-monster-17': Object.freeze({ statusKey: 'fear', label: '恐怖', scope: 'single', chance: 0.28, potency: 1, charges: 1 }),
    'ismartal-vol1-monster-18': Object.freeze({ statusKey: 'confusion', label: '混乱', scope: 'single', chance: 0.27, potency: 50, charges: 1 }),
    'ismartal-vol1-monster-19': Object.freeze({ statusKey: 'slow', label: '鈍足', scope: 'both', chance: 0.3, potency: 24, charges: 2 }),
    'ismartal-vol1-monster-20': Object.freeze({ statusKey: 'wet', label: '水浸し', scope: 'area', chance: 0.32, potency: 24, charges: 2 }),
    'ismartal-vol2-monster-01': Object.freeze({ statusKey: 'freeze', label: '凍結', scope: 'both', chance: 0.32, potency: 30, charges: 1 }),
    'ismartal-vol2-monster-02': Object.freeze({ statusKey: 'confusion', label: '混乱', scope: 'single', chance: 0.28, potency: 50, charges: 1 }),
    'ismartal-vol2-monster-03': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-03'],
    'ismartal-vol2-monster-04': Object.freeze({ statusKey: 'vulnerable', label: '脆弱', scope: 'single', chance: 0.28, potency: 25, charges: 1 }),
    'ismartal-vol2-monster-05': Object.freeze({ statusKey: 'silence', label: '沈黙', scope: 'both', chance: 0.3, potency: 1, charges: 1 }),
    'ismartal-vol2-monster-06': Object.freeze({ statusKey: 'fear', label: '恐怖', scope: 'area', chance: 0.25, potency: 1, charges: 1 }),
    'ismartal-vol2-monster-07': Object.freeze({ statusKey: 'vulnerable', label: '脆弱', scope: 'both', chance: 0.32, potency: 30, charges: 1 }),
    'ismartal-vol2-monster-08': Object.freeze({ statusKey: 'wet', label: '水浸し', scope: 'single', chance: 0.32, potency: 22, charges: 2 }),
    'ismartal-vol2-monster-09': Object.freeze({ statusKey: 'paralysis', label: '麻痺', scope: 'single', chance: 0.27, potency: 40, charges: 2 }),
    'ismartal-vol2-monster-10': Object.freeze({ statusKey: 'seal', label: '封印', scope: 'both', chance: 0.32, potency: 100, charges: 2 }),
    'ismartal-vol2-monster-11': Object.freeze({ statusKey: 'burn', label: '火傷', scope: 'single', chance: 0.32, potencyRate: 0.18, charges: 2 }),
    'ismartal-vol2-monster-12': Object.freeze({ statusKey: 'wet', label: '水浸し', scope: 'both', chance: 0.34, potency: 25, charges: 2 }),
    'ismartal-vol2-monster-13': Object.freeze({ statusKey: 'vulnerable', label: '脆弱', scope: 'area', chance: 0.28, potency: 28, charges: 1 }),
    'ismartal-vol2-monster-14': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-14'],
    'ismartal-vol2-monster-15': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-15'],
    'ismartal-vol2-monster-16': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-16'],
    'ismartal-vol2-monster-17': Object.freeze({ statusKey: 'paralysis', label: '麻痺', scope: 'both', chance: 0.3, potency: 42, charges: 2 }),
    'ismartal-vol2-monster-18': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-18'],
    'ismartal-vol2-monster-19': Object.freeze({ statusKey: 'fear', label: '恐怖', scope: 'both', chance: 0.32, potency: 1, charges: 1 }),
    'ismartal-vol2-monster-20': Object.freeze({ statusKey: 'confusion', label: '混乱', scope: 'both', chance: 0.34, potency: 50, charges: 1 }),
    'ismartal-vol3-monster-01': Object.freeze({ statusKey: 'paralysis', label: '麻痺', scope: 'single', chance: 0.25, potency: 45, charges: 2 }),
    'ismartal-vol3-monster-02': LEGACY_ENEMY_AILMENTS['ismartal-vol3-monster-02'],
    'ismartal-vol3-monster-03': LEGACY_ENEMY_AILMENTS['ismartal-vol3-monster-03'],
    'ismartal-vol3-monster-04': Object.freeze({ statusKey: 'wet', label: '水浸し', scope: 'both', chance: 0.38, potency: 28, charges: 2 }),
    'ismartal-vol3-monster-05': Object.freeze({ statusKey: 'curse', label: '呪い', scope: 'area', chance: 0.3, potency: 100, charges: 2 }),
    'ismartal-vol3-monster-06': LEGACY_ENEMY_AILMENTS['ismartal-vol3-monster-06'],
    'ismartal-vol3-monster-07': LEGACY_ENEMY_AILMENTS['ismartal-vol3-monster-07'],
    'ismartal-vol3-monster-08': Object.freeze({ statusKey: 'petrify', label: '石化', scope: 'single', chance: 0.18, potency: 100, charges: 1 }),
    'ismartal-vol3-monster-09': LEGACY_ENEMY_AILMENTS['ismartal-vol3-monster-09'],
    'ismartal-vol3-monster-10': Object.freeze({ statusKey: 'confusion', label: '混乱', scope: 'both', chance: 0.45, potency: 55, charges: 1 })
});

const ENEMY_AILMENTS_V2 = Object.freeze({
    ...ENEMY_AILMENTS_V2_BASE,
    'ismartal-vol1-monster-07': Object.freeze({ statusKey: 'weaken', label: '弱体', scope: 'both', chance: 0.26, potency: 20, charges: 2 }),
    'ismartal-vol1-monster-11': LEGACY_ENEMY_AILMENTS['ismartal-vol1-monster-11'],
    'ismartal-vol2-monster-09': LEGACY_ENEMY_AILMENTS['ismartal-vol2-monster-09'],
    'ismartal-vol2-monster-10': Object.freeze({ statusKey: 'weaken', label: '弱体', scope: 'both', chance: 0.32, potency: 24, charges: 2 }),
    'ismartal-vol2-monster-17': Object.freeze({ statusKey: 'paralysis', label: '攻撃不能', scope: 'both', chance: 0.3, potency: 1, charges: 1 }),
    'ismartal-vol3-monster-01': LEGACY_ENEMY_AILMENTS['ismartal-vol3-monster-01'],
    'ismartal-vol3-monster-05': Object.freeze({ statusKey: 'weaken', label: '弱体', scope: 'area', chance: 0.3, potency: 26, charges: 2 }),
    'ismartal-vol3-monster-08': Object.freeze({ statusKey: 'weaken', label: '弱体', scope: 'both', chance: 0.36, potency: 30, charges: 2 })
});

function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveInteger(value, fallback = 1) {
    return Math.max(1, Math.floor(finiteNumber(value, fallback)));
}

export function getTarotKingdomEnemyAilmentProfile(monsterId = '', version = 2) {
    const registry = Number(version) >= 3
        ? ENEMY_AILMENTS
        : (Number(version) >= 2 ? ENEMY_AILMENTS_V2 : LEGACY_ENEMY_AILMENTS);
    const profile = registry[String(monsterId || '').trim()];
    return profile ? { ...profile } : null;
}

function getEnemyAilmentForAttack(monsterId, attackKind) {
    const key = String(monsterId || '').trim();
    const kind = attackKind === 'area' ? 'area' : 'single';
    const override = ENEMY_ACTION_AILMENT_OVERRIDES[key]?.[kind];
    if (override) return { ...override, scope: kind };
    const primary = ENEMY_AILMENTS[key];
    if (!primary) return null;
    const scope = String(primary.scope || 'single');
    if (scope !== 'both' && scope !== kind) return null;
    return { ...primary, scope: kind };
}

export function getTarotKingdomEnemyAbilityProfile(monsterId = '', version = 1) {
    if (Number(version) < 1) return null;
    const key = String(monsterId || '').trim();
    const singleAilment = getEnemyAilmentForAttack(key, 'single');
    const areaAilment = getEnemyAilmentForAttack(key, 'area');
    const special = ENEMY_SPECIAL_ABILITIES[key];
    if (!singleAilment && !areaAilment && !special) return null;
    return {
        version: 1,
        attacks: {
            single: singleAilment ? { ailment: singleAilment } : null,
            area: areaAilment ? { ailment: areaAilment } : null
        },
        special: special ? { ...special } : null
    };
}

function scaleStageAilment(ailment, threatLevel) {
    if (!ailment) return null;
    const threat = Math.max(1, Math.min(40, Math.floor(finiteNumber(threatLevel, 1))));
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

function createStageAilmentProfile(monsterId, threatLevel, version = 2) {
    const ailment = getTarotKingdomEnemyAilmentProfile(monsterId, version);
    return scaleStageAilment(ailment, threatLevel);
}

function createStageAbilityProfile(monsterId, threatLevel, version = 1) {
    const profile = getTarotKingdomEnemyAbilityProfile(monsterId, version);
    if (!profile) return null;
    return {
        ...profile,
        attacks: {
            single: profile.attacks.single?.ailment
                ? { ailment: scaleStageAilment(profile.attacks.single.ailment, threatLevel) }
                : null,
            area: profile.attacks.area?.ailment
                ? { ailment: scaleStageAilment(profile.attacks.area.ailment, threatLevel) }
                : null
        },
        special: profile.special ? { ...profile.special } : null
    };
}

function createTarotKingdomStageEnemyCombatProfile(monster = {}, options = {}) {
    const stageNo = Math.max(1, Math.min(10, Math.floor(finiteNumber(options.stageNo, 1))));
    const roundNo = Math.max(1, Math.min(4, Math.floor(finiteNumber(options.roundNo, 1))));
    const threatLevel = Math.max(
        1,
        Math.min(40, Math.floor(finiteNumber(options.threatLevel, ((stageNo - 1) * 4) + roundNo)))
    );
    const archetypeKey = String(options.archetype || 'balanced').trim().toLowerCase();
    const archetype = STAGE_ARCHETYPE_MODIFIERS[archetypeKey] || STAGE_ARCHETYPE_MODIFIERS.balanced;
    const balanceVersion = Math.max(0, Math.floor(finiteNumber(options.balanceVersion, 2)));
    const hpScale = balanceVersion >= 3 ? STAGE_HP_SCALE_V3[stageNo] : 1;
    const damageScale = balanceVersion >= 3 ? STAGE_DAMAGE_SCALE_V3[stageNo] : 1;
    const baseHp = 220 + (threatLevel * 17);
    const basePassDamage = 9 + Math.floor(threatLevel * 0.48);
    const baseAreaDamage = 5 + Math.floor(threatLevel * 0.3);
    const baseDefense = 3 + Math.floor(threatLevel * 0.65);
    const baseSpeed = 7 + Math.floor(threatLevel * 0.35);
    return {
        version: balanceVersion >= 3 ? 3 : 2,
        stageNo,
        roundNo,
        threatLevel,
        archetype: archetypeKey in STAGE_ARCHETYPE_MODIFIERS ? archetypeKey : 'balanced',
        maxHp: positiveInteger(baseHp * archetype.hp * hpScale),
        passDamage: positiveInteger(basePassDamage * archetype.pass * ENEMY_ATTACK_WEIGHT_MULTIPLIER * damageScale),
        areaDamage: positiveInteger(baseAreaDamage * archetype.area * ENEMY_ATTACK_WEIGHT_MULTIPLIER * damageScale),
        defense: Math.max(0, Math.round(baseDefense * archetype.defense)),
        speed: Math.max(1, Math.round(baseSpeed * archetype.speed)),
        ailment: createStageAilmentProfile(monster?.id, threatLevel, options.ailmentVersion),
        abilities: createStageAbilityProfile(monster?.id, threatLevel, options.abilityVersion)
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
        ailment: getTarotKingdomEnemyAilmentProfile(monster?.id, options.ailmentVersion),
        abilities: getTarotKingdomEnemyAbilityProfile(monster?.id, options.abilityVersion)
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
    const penalty = Math.max(-0.33, Math.min(0.7, finiteNumber(accuracyPenalty, 0)));
    return Math.max(0.2, Math.min(0.98, speedAdjusted - penalty));
}

export function getTarotKingdomEnemyAilmentChance(ailment = null) {
    if (!ailment) return 0;
    return Math.max(0, Math.min(0.85, finiteNumber(ailment.chance, 0)));
}
