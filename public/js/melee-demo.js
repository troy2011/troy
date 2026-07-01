const WEAPONS = {
    staff: { label: '杖', icon: './Sprites/weapons/magic weapons/staff.png', speed: 0 },
    wand: { label: 'ワンド', icon: './Sprites/weapons/magic weapons/wand.png', speed: 0 },
    axe: { label: '斧', icon: './Sprites/weapons/melee weapons/axe.png', speed: -1 },
    axe_big: { label: '大斧', icon: './Sprites/weapons/melee weapons/axe_big.png', speed: -5 },
    blunt: { label: '鈍器', icon: './Sprites/weapons/melee weapons/blunt.png', speed: -1 },
    dagger: { label: '短剣', icon: './Sprites/weapons/melee weapons/dagger.png', speed: 6 },
    polearm: { label: '槍', icon: './Sprites/weapons/melee weapons/polearm.png', speed: 1 },
    shield: { label: '盾', icon: './Sprites/weapons/melee weapons/shield.png', speed: -2 },
    sword: { label: '剣', icon: './Sprites/weapons/melee weapons/sword.png', speed: 3 },
    sword_big: { label: '大剣', icon: './Sprites/weapons/melee weapons/sword_big.png', speed: -4 },
    gun: { label: '銃', icon: './Sprites/weapons/ranged weapons/musket.png', speed: -3 },
    gun_big: { label: '大型銃', icon: './Sprites/weapons/ranged weapons/blunderbuss.png', speed: -4 },
    bow: { label: '弓', icon: './Sprites/weapons/ranged weapons/bow.png', speed: 2 }
};

const DICE = [1, 2, 3, 4, 5, 6];
const MINOR_DICE = [2, 3, 4, 5, 6];
const MAX_ROUNDS = 18;
const DICE_ROLL_STEPS = 14;
const DICE_ROLL_INTERVAL_MS = 42;
const DICE_ROLL_WINDUP_MS = 180;
const NEXT_TURN_DELAY_MS = 760;
const MELEE_TAROT_SPRITE_SRC = '../Sprites/Buildings/tarot.png';
const MELEE_TAROT_TILE_W = 48;
const MELEE_TAROT_TILE_H = 80;
const MELEE_TAROT_SHEET_W = 512;
const MELEE_TAROT_SHEET_H = 1024;
const MELEE_TAROT_BACK_INDEX = 110;
const MELEE_SLOT_TAROT_SCALE = 0.54;
const MELEE_MINOR_CUTIN_TAROT_SCALE = 1.86;
const MELEE_ATTACK_EFFECT_BASE = '../Sprites/pixel_animations_gfxpack/animationsheets/';
const MELEE_ATTACK_EFFECT_FRAME = 64;
const MELEE_FEEDBACK_ICON_COLS = 16;
const MELEE_FEEDBACK_ICON_ROWS = 64;
const MELEE_FEEDBACK_ICON_INDEX = {
    damage: 136,
    miss: 223,
    parry: 203,
    weak: 136,
    resist: 207,
    heal: 0,
    burn: 144,
    wet: 149,
    fear: 230,
    confuse: 222,
    atkDown: 97,
    defDown: 74,
    speedDown: 101,
    accDown: 68,
    vulnUp: 223,
    guard: 203
};
const MELEE_ELEMENTAL_EFFECTS = {
    fire: {
        file: 'fire.png', cols: 5, rows: 6, intervalMs: 42, scale: 2.35,
        patterns: [{ startFrame: 4, frames: 6 }, { startFrame: 10, frames: 6 }, { startFrame: 16, frames: 11 }]
    },
    wind: {
        file: 'wind.png', cols: 5, rows: 5, intervalMs: 38, scale: 2.35,
        patterns: [{ startFrame: 4, frames: 6 }, { startFrame: 10, frames: 9 }, { startFrame: 19, frames: 6 }]
    },
    earth: {
        file: 'earth1.png', cols: 5, rows: 6, intervalMs: 42, scale: 2.35,
        patterns: [{ startFrame: 0, frames: 12 }, { startFrame: 12, frames: 15 }]
    },
    water: {
        file: 'water.png', cols: 5, rows: 10, intervalMs: 34, scale: 2.35,
        patterns: [{ startFrame: 0, frames: 11 }, { startFrame: 22, frames: 12 }, { startFrame: 34, frames: 8 }, { startFrame: 42, frames: 7 }]
    }
};
const MELEE_WEAPON_EFFECTS = {
    sword: { file: 'weapons_1.png', cols: 5, rows: 7, startFrame: 22, frames: 6, intervalMs: 34, scale: 2.18 },
    sword_big: { file: 'weapons_1.png', cols: 5, rows: 7, startFrame: 28, frames: 6, intervalMs: 38, scale: 2.34 },
    dagger: { file: 'weapons_1.png', cols: 5, rows: 7, startFrame: 0, frames: 6, intervalMs: 30, scale: 2.0 },
    polearm: { file: 'weapons_1.png', cols: 5, rows: 7, startFrame: 16, frames: 6, intervalMs: 34, scale: 2.16 },
    axe: { file: 'weapons_2.png', cols: 5, rows: 6, startFrame: 0, frames: 6, intervalMs: 38, scale: 2.2 },
    axe_big: { file: 'weapons_2.png', cols: 5, rows: 6, startFrame: 0, frames: 6, intervalMs: 42, scale: 2.42 },
    blunt: { file: 'impact1.png', cols: 5, rows: 6, startFrame: 15, frames: 6, intervalMs: 36, scale: 2.18 },
    shield: { file: 'impact1.png', cols: 5, rows: 6, startFrame: 20, frames: 5, intervalMs: 36, scale: 2.02 },
    bow: { file: 'arrow.png', cols: 5, rows: 4, startFrame: 0, frames: 11, intervalMs: 32, scale: 2.0 },
    gun: { file: 'impact2.png', cols: 5, rows: 3, startFrame: 5, frames: 5, intervalMs: 32, scale: 2.06 },
    gun_big: { file: 'impact2.png', cols: 5, rows: 3, startFrame: 10, frames: 5, intervalMs: 34, scale: 2.24 },
    staff: { file: 'impact1.png', cols: 5, rows: 6, startFrame: 25, frames: 5, intervalMs: 36, scale: 2.04 },
    wand: { file: 'fire.png', cols: 5, rows: 6, startFrame: 4, frames: 6, intervalMs: 42, scale: 2.12 },
    claw: { file: 'claw_bite.png', cols: 5, rows: 5, startFrame: 16, frames: 6, intervalMs: 34, scale: 2.08 },
    bite: { file: 'claw_bite.png', cols: 5, rows: 5, startFrame: 0, frames: 8, intervalMs: 34, scale: 2.04 },
    unarmed: { file: 'claw_bite.png', cols: 5, rows: 5, startFrame: 16, frames: 6, intervalMs: 34, scale: 2.08 }
};
const DEMO_ELEMENT_KEYS = new Set(['fire', 'wind', 'earth', 'water']);
const DEMO_ELEMENT_BEATS = {
    fire: 'wind',
    wind: 'earth',
    earth: 'water',
    water: 'fire'
};
const DEMO_ELEMENT_LABELS = {
    fire: '\u706b',
    wind: '\u98a8',
    earth: '\u5730',
    water: '\u6c34',
    none: '\u7121\u5c5e\u6027'
};
const DEMO_ELEMENT_ALIASES = {
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

const DEMO_COMBAT_PROFILES = {
    player: {
        stats: {
            Nation: 'fire',
            Level: 10,
            HP: 120,
            MaxHP: 120,
            CurrentHP: 120,
            Power: 24,
            Attack: 24,
            Defense: 5,
            Guard: 5,
            Agi: 14,
            Speed: 14,
            ちから: 24,
            みのまもり: 5,
            すばやさ: 14,
            かしこさ: 0
        },
        equipmentStats: {
            Power: 12,
            Defense: 3,
            Agi: 4,
            Int: 0
        }
    },
    enemy: {
        stats: {
            Nation: 'wind',
            Level: 10,
            HP: 132,
            MaxHP: 132,
            CurrentHP: 132,
            Power: 27,
            Attack: 27,
            Defense: 7,
            Guard: 7,
            Agi: 8,
            Speed: 8,
            ちから: 27,
            みのまもり: 7,
            すばやさ: 8,
            かしこさ: 0
        },
        equipmentStats: {
            Power: 13,
            Defense: 3,
            Agi: 1,
            Int: 0
        }
    }
};

const DEMO_AVATAR_BASES = {
    player: {
        Race: 'human',
        AvatarColor: 'brown',
        SkinColorIndex: 2,
        FaceIndex: 1,
        HairStyleIndex: 2,
        FacialHairStyleIndex: 1,
        level: 20
    },
    enemy: {
        Race: 'orc',
        AvatarColor: 'green',
        SkinColorIndex: 3,
        FaceIndex: 1,
        HairStyleIndex: 1,
        FacialHairStyleIndex: 0,
        level: 20
    }
};

const DEMO_WEAPON_SPRITE_META = {
    bow: { sprite_path: './Sprites/weapons/ranged weapons/bow.png', sprite_w: 32, sprite_h: 32 }
};

const FORM_TABLE = {
    staff: [
        attack(1, '杖打ち', 70, 100),
        support(2, '祈り', [fx('healPercent', { target: 'self', value: 5 })]),
        attack(3, '足払い', 60, 100, [fx('nextWeaponPower', { target: 'enemy', value: -20 })]),
        support(4, '守りの印', [fx('nextDamageTaken', { target: 'self', multiplier: 0.8, charges: 1 })]),
        support(5, '浄化', [fx('cleanse', { target: 'self', statuses: ['fear', 'confusion'] })]),
        support(6, '星読み', [fx('nextMinorAccuracy', { target: 'self', value: 15 })])
    ],
    wand: [
        attack(1, '魔弾', 80, 100),
        attack(2, '火花', 60, 100, [fx('burn', { chance: 0.15 })]),
        support(3, '詠唱', [fx('nextMinorPower', { target: 'self', value: 20 })]),
        support(4, '魔力逆流', [fx('nextMinorAccuracy', { target: 'self', value: -20 })]),
        attack(5, '焼尽', 110, 85),
        support(6, '魔力充填', [fx('nextMinorEffectChance', { target: 'self', value: 15 })])
    ],
    axe: [
        attack(1, '斧打ち', 110, 95),
        attack(2, '横薙ぎ', 90, 100),
        attack(3, '食い込み', 100, 95, [fx('defenseDown', { target: 'enemy', multiplier: 0.9, turns: 1 })]),
        attack(4, '大振り', 130, 70, [fx('nextDamageTaken', { trigger: 'miss', target: 'self', multiplier: 1.2, charges: 1 })]),
        attack(5, '追い斧', 80, 100, [], { conditionalPower: { status: 'fear', value: 50 } }),
        attack(6, '柄殴り', 70, 100, [fx('confusion', { chance: 0.2 })])
    ],
    axe_big: [
        attack(1, '巨斧', 130, 85),
        miss(2, '踏み外し', [fx('nextDamageTaken', { target: 'self', multiplier: 1.2, charges: 1 })]),
        attack(3, '断ち割り', 160, 75),
        support(4, '溜め', [fx('nextWeaponPower', { target: 'self', value: 50 })]),
        attack(5, '反動斬り', 140, 80, [fx('selfHpPercentDamage', { trigger: 'always', target: 'self', value: 5 })]),
        attack(6, '終撃', 180, 65)
    ],
    blunt: [
        attack(1, '殴打', 100, 100),
        attack(2, '鎧砕き', 80, 100, [fx('defenseDown', { target: 'enemy', multiplier: 0.9, turns: 1 })]),
        attack(3, '昏倒打ち', 70, 100, [fx('confusion', { chance: 0.2 })]),
        attack(4, '重心崩し', 60, 100, [fx('attackDown', { target: 'enemy', multiplier: 0.8, turns: 1 })]),
        attack(5, '盾割り', 100, 90, [fx('clearGuard', { target: 'enemy' })], { ignoreDefense: 0.5 }),
        miss(6, '振り遅れ', [fx('accuracyBonus', { target: 'self', value: -15, turns: 1 })])
    ],
    dagger: [
        attack(1, '刺突', 70, 110, [], { criticalBonus: 0.15 }),
        attack(2, '先刺し', 60, 100, [], { priority: true }),
        attack(3, '二連突き', 40, 100, [], { hitCount: 2 }),
        attack(4, '深追い', 100, 90, [fx('nextDamageTaken', { trigger: 'always', target: 'self', multiplier: 1.2, charges: 1 })]),
        attack(5, '影縫い', 60, 100, [fx('speedChange', { target: 'enemy', multiplier: 0.8, turns: 1 })]),
        attack(6, '急所狙い', 120, 75, [], { criticalBonus: 0.3 })
    ],
    polearm: [
        attack(1, '突き', 100, 100),
        support(2, '間合い取り', [fx('nextDamageTaken', { target: 'self', multiplier: 0.75, charges: 1 })]),
        attack(3, '薙ぎ払い', 90, 100),
        attack(4, '迎撃', 80, 100, [fx('nextWeaponPower', { target: 'enemy', value: -30 })]),
        attack(5, '引き寄せ', 70, 100, [fx('defenseDown', { target: 'enemy', multiplier: 0.9, turns: 1 })]),
        miss(6, '長柄が絡む', [fx('speedChange', { target: 'self', multiplier: 0.8, turns: 1 })])
    ],
    shield: [
        attack(1, '盾打ち', 60, 100, [fx('nextDamageTaken', { target: 'self', multiplier: 0.9, charges: 1 })]),
        support(2, '防御姿勢', [fx('nextDamageTaken', { target: 'self', multiplier: 0.6, charges: 1 })]),
        attack(3, '押し返し', 70, 100, [fx('attackDown', { target: 'enemy', multiplier: 0.8, turns: 1 })]),
        support(4, '盾構え', [fx('damageTakenTimed', { target: 'self', multiplier: 0.5, turns: 1 })]),
        support(5, '反撃姿勢', [fx('counter', { target: 'self', power: 60, turns: 1 })]),
        miss(6, '動きが鈍る', [fx('speedChange', { target: 'self', multiplier: 0.8, turns: 1 })])
    ],
    sword: [
        attack(1, '斬撃', 100, 100),
        attack(2, '受け流し', 70, 100, [fx('nextDamageTaken', { target: 'self', multiplier: 0.85, charges: 1 })]),
        attack(3, '突き', 90, 110),
        attack(4, '連斬', 50, 100, [], { hitCount: 2 }),
        attack(5, '踏み込み', 110, 90),
        support(6, '呼吸を整える', [fx('moraleOrHeal', { target: 'self', value: 1, healPercent: 5 })])
    ],
    sword_big: [
        attack(1, '大剣斬り', 120, 90),
        miss(2, '構え直し', [fx('nextDamageTaken', { target: 'self', multiplier: 0.9, charges: 1 })]),
        attack(3, '兜割り', 150, 80),
        attack(4, '薙ぎ払い', 110, 95),
        attack(5, '反動斬り', 130, 85, [fx('speedChange', { target: 'self', multiplier: 0.9, turns: 1 })]),
        attack(6, '溜め斬り', 180, 65)
    ],
    bow: [
        attack(1, '射撃', 90, 110),
        attack(2, '曲射', 80, 100, [], { ignoreDefense: 0.2 }),
        support(3, '狙い', [fx('accuracyBonus', { target: 'self', value: 30, turns: 1 })]),
        attack(4, '早射ち', 45, 100, [], { hitCount: 2 }),
        attack(5, '牽制射', 60, 100, [fx('attackDown', { target: 'enemy', multiplier: 0.8, turns: 1 })]),
        miss(6, '弦切れ', [fx('nextWeaponPower', { target: 'self', value: -20 })])
    ],
    gun: [
        attack(1, '発砲', 120, 85, [], { ignoreDefense: 0.2 }),
        miss(2, '装填不良'),
        attack(3, '貫通弾', 120, 90, [], { ignoreDefense: 0.5 }),
        attack(4, '牽制射撃', 70, 100, [fx('accuracyBonus', { target: 'enemy', value: -20, turns: 1 })]),
        miss(5, '暴発', [fx('selfHpPercentDamage', { target: 'self', value: 5 })]),
        attack(6, '銃火一閃', 160, 70, [], { ignoreDefense: 0.3 })
    ]
};

FORM_TABLE.gun_big = FORM_TABLE.gun;

const PRESETS = [
    {
        id: 'counter',
        label: '剣と炎の反撃',
        weapon: 'sword',
        enemyWeapon: 'axe_big',
        deck: ['minor-cup-2', 'minor-sword-3', 'minor-wand-9', 'minor-pentacle-5', 'minor-sword-6'],
        enemyDeck: ['minor-pentacle-2', 'minor-wand-2', 'minor-cup-4', 'minor-pentacle-5', 'minor-cup-6']
    },
    {
        id: 'dagger',
        label: '短剣速攻',
        weapon: 'dagger',
        enemyWeapon: 'shield',
        deck: ['minor-sword-1', 'minor-wand-7', 'minor-cup-4', 'minor-sword-9', 'minor-wand-10'],
        enemyDeck: ['minor-pentacle-2', 'minor-cup-6', 'minor-pentacle-4', 'minor-wand-9', 'minor-pentacle-10']
    },
    {
        id: 'gun',
        label: '銃と水浸し',
        weapon: 'gun',
        enemyWeapon: 'sword_big',
        deck: ['minor-cup-2', 'minor-cup-3', 'minor-cup-4', 'minor-cup-5', 'minor-cup-6'],
        enemyDeck: ['minor-sword-2', 'minor-wand-4', 'minor-pentacle-8', 'minor-sword-10', 'minor-pentacle-14']
    }
];

const fallbackCards = [
    card('minor-cup-2', 'カップ2', 'cup', 2, '水刃', 70, 100, [fx('flood', { chance: 0.2 })], '20%で水浸し'),
    card('minor-cup-3', 'カップ3', 'cup', 3, '雫の祝福', null, null, [fx('healOrCleanseBurn', { target: 'self', value: 10 })], 'HP10%回復'),
    card('minor-cup-4', 'カップ4', 'cup', 4, 'ぬかるみ', 50, 100, [fx('speedChange', { target: 'enemy', multiplier: 0.8, turns: 1 })], '敵の素早さ低下'),
    card('minor-cup-5', 'カップ5', 'cup', 5, '潮封じ', 60, 95, [fx('nextMinorEffectMultiplier', { target: 'enemy', multiplier: 0.8 })], '敵の小アルカナ効果低下'),
    card('minor-cup-6', 'カップ6', 'cup', 6, '泡沫の盾', null, null, [fx('nextDamageTaken', { target: 'self', multiplier: 0.7, charges: 1 })], '次ダメージ-30%'),
    card('minor-wand-2', 'ワンド2', 'wand', 2, '二連火花', 40, 95, [fx('burn', { chance: 0.1 })], '2回攻撃', 2),
    card('minor-wand-4', 'ワンド4', 'wand', 4, '火柱', 90, 90, [fx('burn', { chance: 0.2 })], '20%で火傷'),
    card('minor-wand-7', 'ワンド7', 'wand', 7, '炎走', 70, 100, [fx('burn', { chance: 0.2 })], '先制', 1, { priority: true }),
    card('minor-wand-9', 'ワンド9', 'wand', 9, '火の輪', null, null, [fx('counter', { target: 'self', power: 60, turns: 1 })], '反撃姿勢'),
    card('minor-wand-10', 'ワンド10', 'wand', 10, '大火球', 130, 80, [fx('burn', { chance: 0.4 })], '40%で火傷'),
    card('minor-pentacle-2', 'ペンタクル2', 'pentacle', 2, '二重装甲', null, null, [fx('nextDamageTaken', { target: 'self', multiplier: 0.6, charges: 1 })], '次ダメージ-40%'),
    card('minor-pentacle-4', 'ペンタクル4', 'pentacle', 4, '護符', null, null, [fx('cleanse', { target: 'self', statuses: ['fear', 'confusion'] })], '恐怖・混乱解除'),
    card('minor-pentacle-5', 'ペンタクル5', 'pentacle', 5, '重圧', 70, 95, [fx('speedChange', { target: 'enemy', multiplier: 0.8, turns: 1 })], '敵の素早さ低下'),
    card('minor-pentacle-8', 'ペンタクル8', 'pentacle', 8, '地鳴り', 90, 90, [fx('fear', { chance: 0.25 })], '25%で恐怖'),
    card('minor-pentacle-10', 'ペンタクル10', 'pentacle', 10, '要塞化', null, null, [fx('nextDamageTaken', { target: 'self', multiplier: 0.75, charges: 2 })], '次2回ダメージ-25%'),
    card('minor-pentacle-14', 'ペンタクルKing', 'pentacle', 14, '巨岩王', 140, 80, [fx('defenseDown', { target: 'enemy', multiplier: 0.8, turns: 1 })], '敵防御低下'),
    card('minor-sword-1', 'ソードA', 'sword', 1, '風切り', 80, 110, [], '先制', 1, { priority: true }),
    card('minor-sword-2', 'ソード2', 'sword', 2, '双刃', 50, 95, [], '2回攻撃', 2),
    card('minor-sword-3', 'ソード3', 'sword', 3, '追い風', null, null, [fx('speedChange', { target: 'self', multiplier: 1.2, turns: 1 }), fx('accuracyBonus', { target: 'self', value: 10, turns: 1 })], '速度と命中上昇'),
    card('minor-sword-6', 'ソード6', 'sword', 6, 'つむじ斬り', 90, 95, [], '自分が速ければ威力上昇', 1, { conditionalPower: { selfSpeedAtLeastEnemy: true, value: 20 } }),
    card('minor-sword-9', 'ソード9', 'sword', 9, '空蝉', null, null, [fx('evasion', { target: 'self', chance: 0.4, turns: 1 })], '40%で回避'),
    card('minor-sword-10', 'ソード10', 'sword', 10, '嵐刃', 120, 85, [fx('confusion', { chance: 0.3 })], '30%で混乱')
];

const state = {
    cards: [],
    cardById: new Map(),
    fighters: [],
    queue: [],
    round: 0,
    current: null,
    over: true,
    lastAction: null,
    actionToken: 0,
    isRolling: false
};

let avatarModule = null;

const el = {
    playerWeapon: document.getElementById('playerWeapon'),
    enemyWeapon: document.getElementById('enemyWeapon'),
    deckPreset: document.getElementById('deckPreset'),
    newBattleButton: document.getElementById('newBattleButton'),
    rollButton: document.getElementById('rollButton'),
    diceFace: document.getElementById('diceFace'),
    actionTitle: document.getElementById('actionTitle'),
    actionDetail: document.getElementById('actionDetail'),
    turnText: document.getElementById('turnText'),
    battleLog: document.getElementById('battleLog'),
    playerPanel: document.getElementById('playerPanel'),
    enemyPanel: document.getElementById('enemyPanel'),
    playerWeaponIcon: document.getElementById('playerWeaponIcon'),
    enemyWeaponIcon: document.getElementById('enemyWeaponIcon'),
    playerName: document.getElementById('playerName'),
    enemyName: document.getElementById('enemyName'),
    playerMeta: document.getElementById('playerMeta'),
    enemyMeta: document.getElementById('enemyMeta'),
    playerHpText: document.getElementById('playerHpText'),
    enemyHpText: document.getElementById('enemyHpText'),
    playerHpBar: document.getElementById('playerHpBar'),
    enemyHpBar: document.getElementById('enemyHpBar'),
    playerStatus: document.getElementById('playerStatus'),
    enemyStatus: document.getElementById('enemyStatus'),
    playerSlots: document.getElementById('playerSlots'),
    enemySlots: document.getElementById('enemySlots'),
    playerAvatar: document.getElementById('playerDemoAvatar'),
    enemyAvatar: document.getElementById('enemyDemoAvatar'),
    battleBoard: document.querySelector('.fighters.melee-replay-board'),
    deckSelects: Array.from(document.querySelectorAll('.deck-editor select')),
    fixedDice: Array.from(document.querySelectorAll('.fixed-dice button'))
};

init();

async function init() {
    populateWeaponSelects();
    populatePresetSelect();
    await loadCards();
    await loadAvatarModule();
    populateDeckSelects(PRESETS[0].deck);
    el.playerWeapon.value = PRESETS[0].weapon;
    el.enemyWeapon.value = PRESETS[0].enemyWeapon;
    setupDemoAvatars();
    bindEvents();
    startBattle();
}

async function loadAvatarModule() {
    try {
        avatarModule = await import('./avatar.js');
    } catch (error) {
        avatarModule = null;
        console.warn('[melee-demo] avatar module unavailable', error);
    }
}

function bindEvents() {
    el.newBattleButton.addEventListener('click', startBattle);
    el.playerWeapon.addEventListener('change', startBattle);
    el.enemyWeapon.addEventListener('change', startBattle);
    for (const select of el.deckSelects) {
        select.addEventListener('change', startBattle);
    }
    el.deckPreset.addEventListener('change', () => {
        const preset = PRESETS.find((entry) => entry.id === el.deckPreset.value) || PRESETS[0];
        el.playerWeapon.value = preset.weapon;
        el.enemyWeapon.value = preset.enemyWeapon;
        populateDeckSelects(preset.deck);
        startBattle();
    });
}

function setupDemoAvatars() {
    const buildAvatarLayerMarkup = avatarModule?.buildAvatarLayerMarkup;
    if (typeof buildAvatarLayerMarkup !== 'function') return;
    if (el.playerAvatar) {
        el.playerAvatar.innerHTML = buildAvatarLayerMarkup('playerDemoAvatar');
    }
    if (el.enemyAvatar) {
        el.enemyAvatar.innerHTML = buildAvatarLayerMarkup('enemyDemoAvatar');
    }
    renderDemoAvatars();
}

function renderDemoAvatars() {
    renderDemoAvatar('player', el.playerWeapon.value || PRESETS[0].weapon);
    renderDemoAvatar('enemy', el.enemyWeapon.value || PRESETS[0].enemyWeapon);
}

function renderDemoAvatar(side, weaponType) {
    const root = side === 'player' ? el.playerAvatar : el.enemyAvatar;
    const renderAvatar = avatarModule?.renderAvatar;
    if (!root || typeof renderAvatar !== 'function') return;
    setDemoAvatarVictorious(side, false);
    setDemoAvatarDefeated(side, false);
    const item = createDemoWeaponItem(weaponType);
    const equipment = { RightHand: item };
    renderAvatar(`${side}DemoAvatar`, DEMO_AVATAR_BASES[side], equipment, {}, false);
}

function createDemoWeaponItem(weaponType) {
    const weapon = normalizeWeaponType(weaponType);
    const meta = DEMO_WEAPON_SPRITE_META[weapon] || {};
    return {
        itemId: `${weapon}_demo`,
        customData: {
            Category: 'Weapon',
            sprite_index: '0',
            ...meta
        }
    };
}

function normalizeWeaponType(weaponType) {
    const key = String(weaponType || '').trim().toLowerCase();
    return WEAPONS[key] ? key : 'sword';
}

function normalizeAttackEffectWeaponType(weaponType) {
    const key = String(weaponType || '').trim().toLowerCase();
    if (key === 'gun-big' || key === 'large_gun' || key === 'large-gun') return 'gun_big';
    if (key === 'claws' || key === 'claw_bite' || key === 'claw-bite' || key === '爪') return 'claw';
    if (key === 'fang' || key === 'fangs' || key === '牙' || key === '噛みつき') return 'bite';
    if (MELEE_WEAPON_EFFECTS[key]) return key;
    const weapon = normalizeWeaponType(key);
    return MELEE_WEAPON_EFFECTS[weapon] ? weapon : 'unarmed';
}

function normalizeTarotSuit(suit) {
    const key = String(suit || '').trim().toLowerCase();
    if (key.includes('wand')) return 'wand';
    if (key.includes('pentacle') || key.includes('coin')) return 'pentacle';
    if (key.includes('cup')) return 'cup';
    if (key.includes('sword')) return 'sword';
    return '';
}

function tarotSpriteIndex(card) {
    const suit = normalizeTarotSuit(card?.suit);
    const rank = Math.max(1, Math.min(14, Number(card?.rank ?? card?.number ?? 1))) - 1;
    if (suit === 'wand') return rank;
    if (suit === 'pentacle') return 20 + rank;
    if (suit === 'cup') return 40 + rank;
    if (suit === 'sword') return 60 + rank;
    return MELEE_TAROT_BACK_INDEX;
}

function setTarotArtSprite(artEl, spriteIndex, scale = MELEE_SLOT_TAROT_SCALE) {
    const col = spriteIndex % 10;
    const row = Math.floor(spriteIndex / 10);
    artEl.style.setProperty('--tarot-sheet-w', `${MELEE_TAROT_SHEET_W * scale}px`);
    artEl.style.setProperty('--tarot-sheet-h', `${MELEE_TAROT_SHEET_H * scale}px`);
    artEl.style.setProperty('--tarot-x', `${col * MELEE_TAROT_TILE_W * scale}px`);
    artEl.style.setProperty('--tarot-y', `${row * MELEE_TAROT_TILE_H * scale}px`);
    artEl.style.setProperty('--tarot-art-w', `${MELEE_TAROT_TILE_W * scale}px`);
    artEl.style.setProperty('--tarot-art-h', `${MELEE_TAROT_TILE_H * scale}px`);
    artEl.style.setProperty('--tarot-sprite-src', `url('${MELEE_TAROT_SPRITE_SRC}')`);
}

function createMinorArcanaEffect(card, side) {
    const effect = document.createElement('div');
    effect.className = `melee-minor-arcana-effect is-${side}-side`;
    effect.dataset.cardName = String(card?.cardName || '');
    effect.dataset.suit = normalizeTarotSuit(card?.suit);
    effect.dataset.rank = String(card?.rank ?? card?.number ?? '');
    effect.dataset.skillName = String(card?.skillName || card?.name || '');

    const artWrap = document.createElement('div');
    artWrap.className = 'melee-minor-arcana-card';

    const art = document.createElement('span');
    art.className = 'tarot-card-art melee-minor-arcana-art';
    setTarotArtSprite(art, tarotSpriteIndex(card), MELEE_MINOR_CUTIN_TAROT_SCALE);
    artWrap.append(art);

    const name = document.createElement('div');
    name.className = 'melee-minor-arcana-name';
    name.textContent = [card?.cardName, card?.skillName || card?.name].filter(Boolean).join(' / ') || '小アルカナ';

    effect.append(artWrap, name);
    return effect;
}

function selectAttackEffectPattern(config, seed = 0) {
    const patterns = Array.isArray(config?.patterns) && config.patterns.length > 0
        ? config.patterns
        : [{ startFrame: Number(config?.startFrame) || 0, frames: Number(config?.frames) || 1 }];
    const index = Math.abs(Math.floor(Number(seed) || 0)) % patterns.length;
    return {
        ...config,
        startFrame: Number(patterns[index]?.startFrame) || 0,
        frames: Math.max(1, Math.floor(Number(patterns[index]?.frames) || 1))
    };
}

function setAttackEffectFrame(sprite, config, frameIndex) {
    if (!sprite || !config) return;
    const frame = Math.max(0, Math.min(config.frames - 1, Math.floor(Number(frameIndex) || 0)));
    const absoluteFrame = Math.max(0, (Number(config.startFrame) || 0) + frame);
    const scale = Number(config.scale) || 2.35;
    const col = absoluteFrame % config.cols;
    const row = Math.floor(absoluteFrame / config.cols);
    sprite.style.width = `${MELEE_ATTACK_EFFECT_FRAME * scale}px`;
    sprite.style.height = `${MELEE_ATTACK_EFFECT_FRAME * scale}px`;
    sprite.style.backgroundImage = `url('${MELEE_ATTACK_EFFECT_BASE}${config.file}')`;
    sprite.style.backgroundSize = `${config.cols * MELEE_ATTACK_EFFECT_FRAME * scale}px ${config.rows * MELEE_ATTACK_EFFECT_FRAME * scale}px`;
    sprite.style.backgroundPosition = `-${col * MELEE_ATTACK_EFFECT_FRAME * scale}px -${row * MELEE_ATTACK_EFFECT_FRAME * scale}px`;
}

function createSpriteAttackEffect(config, side, options = {}) {
    if (!config) return null;
    const selectedConfig = selectAttackEffectPattern(config, options.seed);
    const effect = document.createElement('div');
    effect.className = `melee-sprite-attack-effect ${options.className || ''} is-${side}-side`;
    if (options.elementKey) effect.dataset.element = options.elementKey;
    if (options.weaponType) effect.dataset.weapon = options.weaponType;
    const sprite = document.createElement('span');
    sprite.className = `melee-attack-effect-sprite ${options.spriteClassName || ''}`;
    sprite.setAttribute('aria-hidden', 'true');
    setAttackEffectFrame(sprite, selectedConfig, 0);
    effect.append(sprite);
    return { effect, sprite, config: selectedConfig };
}

function createElementalAttackEffect(elementKey, side, seed = 0) {
    const key = normalizeDemoElementKey(elementKey);
    return createSpriteAttackEffect(MELEE_ELEMENTAL_EFFECTS[key], side, {
        seed,
        elementKey: key,
        className: 'melee-elemental-attack-effect',
        spriteClassName: 'melee-elemental-effect-sprite'
    });
}

function createWeaponAttackEffect(weaponType, side, seed = 0) {
    const weapon = normalizeAttackEffectWeaponType(weaponType);
    return createSpriteAttackEffect(MELEE_WEAPON_EFFECTS[weapon] || MELEE_WEAPON_EFFECTS.unarmed, side, {
        seed,
        weaponType: weapon,
        className: 'melee-weapon-attack-effect',
        spriteClassName: 'melee-weapon-effect-sprite'
    });
}

function playSpriteAttackEffect(effectParts) {
    if (!effectParts) return;
    const { effect, sprite, config } = effectParts;
    let frame = 0;
    let timer = null;
    const tick = () => {
        setAttackEffectFrame(sprite, config, frame);
        frame += 1;
        if (frame >= config.frames) {
            window.clearInterval(timer);
            window.setTimeout(() => effect.remove(), 220);
        }
    };
    tick();
    timer = window.setInterval(tick, config.intervalMs);
    window.setTimeout(() => {
        window.clearInterval(timer);
        effect.remove();
    }, config.frames * config.intervalMs + 520);
}

function triggerDemoMinorArcana(unitId, card) {
    if (!el.battleBoard) return;
    const side = unitId === 'player' ? 'player' : 'enemy';
    el.battleBoard.querySelectorAll(`.melee-minor-arcana-effect.is-${side}-side`).forEach((node) => node.remove());
    const effect = createMinorArcanaEffect(card, side);
    el.battleBoard.append(effect);
    window.setTimeout(() => effect.remove(), 2600);
}

function triggerDemoElementalAttackEffect(targetId, action, result) {
    if (!el.battleBoard || action?.source !== 'minor' || action?.kind !== 'attack') return;
    if (!result?.hit || Number(result.total) <= 0) return;
    const elementKey = demoActionAttackElementKey(action);
    if (!MELEE_ELEMENTAL_EFFECTS[elementKey]) return;
    const side = targetId === 'player' ? 'player' : 'enemy';
    el.battleBoard.querySelectorAll(`.melee-elemental-attack-effect.is-${side}-side`).forEach((node) => node.remove());
    const effectParts = createElementalAttackEffect(elementKey, side, action.rank || result.total || 0);
    if (!effectParts) return;
    el.battleBoard.append(effectParts.effect);
    playSpriteAttackEffect(effectParts);
}

function triggerDemoWeaponAttackEffect(targetId, actor, action, result) {
    if (!el.battleBoard || action?.source !== 'weapon' || action?.kind !== 'attack') return;
    if (!result?.hit || Number(result.total) <= 0) return;
    const weaponType = normalizeAttackEffectWeaponType(actor?.weapon);
    const side = targetId === 'player' ? 'player' : 'enemy';
    el.battleBoard.querySelectorAll(`.melee-weapon-attack-effect.is-${side}-side`).forEach((node) => node.remove());
    const effectParts = createWeaponAttackEffect(weaponType, side, action.slot || result.total || 0);
    if (!effectParts) return;
    el.battleBoard.append(effectParts.effect);
    playSpriteAttackEffect(effectParts);
}

function createSlotWeaponIcon(weaponType) {
    const icon = document.createElement('span');
    icon.className = 'melee-slot-icon weapon-sprite';
    icon.dataset.weapon = normalizeWeaponType(weaponType);
    icon.setAttribute('aria-hidden', 'true');
    return icon;
}

function createSlotDieIcon(die) {
    const icon = document.createElement('span');
    icon.className = 'slot-die melee-replay-slot-die dice-sprite';
    icon.dataset.die = String(die);
    icon.setAttribute('aria-label', `D${die}`);
    return icon;
}

function createSlotTarotIcon(card) {
    const icon = document.createElement('span');
    icon.className = 'melee-slot-icon melee-slot-tarot';
    icon.dataset.suit = normalizeTarotSuit(card?.suit);
    icon.dataset.rank = String(card?.rank ?? card?.number ?? '');
    icon.setAttribute('aria-label', card?.cardName || card?.skillName || 'minor arcana');

    const art = document.createElement('span');
    art.className = 'tarot-card-art';
    setTarotArtSprite(art, tarotSpriteIndex(card));
    icon.append(art);
    return icon;
}

function slotVisualType(fighter, die) {
    const slot = fighter.slots[die];
    if (state.lastAction?.actorId === fighter.id && state.lastAction?.die === die) {
        return state.lastAction.resultType === 'minorArcana' ? 'tarot' : 'weapon';
    }
    return slot?.card && slot.unlocked ? 'tarot' : 'weapon';
}

function populateWeaponSelects() {
    for (const [value, info] of Object.entries(WEAPONS)) {
        el.playerWeapon.append(new Option(info.label, value));
        el.enemyWeapon.append(new Option(info.label, value));
    }
}

function populatePresetSelect() {
    for (const preset of PRESETS) {
        el.deckPreset.append(new Option(preset.label, preset.id));
    }
}

async function loadCards() {
    try {
        const response = await fetch('/api/tarot-battle-skills', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        state.cards = (payload.cards || [])
            .filter((entry) => String(entry.itemId || '').startsWith('minor-'))
            .map(normalizeCard);
    } catch (error) {
        state.cards = fallbackCards.map(normalizeCard);
    }
    state.cardById = new Map(state.cards.map((entry) => [entry.itemId, entry]));
}

function populateDeckSelects(ids) {
    for (let index = 0; index < el.deckSelects.length; index += 1) {
        const select = el.deckSelects[index];
        select.replaceChildren();
        for (const skill of state.cards) {
            select.append(new Option(`${skill.cardName} ${skill.skillName}`, skill.itemId));
        }
        select.value = ids[index] || state.cards[index]?.itemId || '';
    }
}

function startBattle() {
    const preset = PRESETS.find((entry) => entry.id === el.deckPreset.value) || PRESETS[0];
    const playerDeck = el.deckSelects.map((select) => state.cardById.get(select.value)).filter(Boolean);
    const enemyDeck = preset.enemyDeck.map((id) => state.cardById.get(id)).filter(Boolean);
    renderDemoAvatars();
    state.fighters = [
        createFighter('player', 'あなた', el.playerWeapon.value, playerDeck, DEMO_COMBAT_PROFILES.player),
        createFighter('enemy', '甲板長', el.enemyWeapon.value, enemyDeck, DEMO_COMBAT_PROFILES.enemy)
    ];
    state.round = 0;
    state.queue = [];
    state.current = null;
    state.over = false;
    state.lastAction = null;
    state.actionToken += 1;
    state.isRolling = false;
    setDiceFace(null);
    el.battleLog.replaceChildren();
    log('戦闘開始', true);
    beginRound();
}

function beginRound() {
    if (state.over) return;
    state.round += 1;
    if (state.round > MAX_ROUNDS) {
        judgeBattle();
        return;
    }
    const sorted = [...state.fighters].sort((a, b) => effectiveSpeed(b) - effectiveSpeed(a));
    state.queue = sorted.map((fighter) => fighter.id);
    log(`第${state.round}ラウンド`, true);
    nextTurn();
}

function nextTurn() {
    if (state.over) return;
    const alive = state.fighters.filter((fighter) => fighter.hp > 0);
    if (alive.length < 2) {
        finishBattle(alive[0]);
        return;
    }
    const nextId = state.queue.shift();
    if (!nextId) {
        beginRound();
        return;
    }
    const actor = byId(nextId);
    if (!actor || actor.hp <= 0) {
        nextTurn();
        return;
    }
    state.current = actor;
    const actionToken = ++state.actionToken;
    render();
    if (!applyStartOfTurn(actor)) {
        tick(actor);
        window.setTimeout(nextTurn, 360);
        return;
    }
    window.setTimeout(() => autoResolveTurn(actor, actionToken), DICE_ROLL_WINDUP_MS);
}

async function autoResolveTurn(actor, actionToken) {
    if (state.over || state.current !== actor || actionToken !== state.actionToken) return;
    const die = randomDie();
    const completed = await animateDiceRoll(die, actionToken);
    if (!completed || state.over || state.current !== actor || actionToken !== state.actionToken) return;
    resolveTurn(actor, die, actionToken);
}

function animateDiceRoll(finalDie, actionToken) {
    state.isRolling = true;
    el.diceFace.classList.add('is-rolling');
    el.actionTitle.textContent = 'サイコロ';
    el.actionDetail.textContent = `${state.current?.name || '戦闘員'}が出目を振っている`;
    return new Promise((resolve) => {
        let step = 0;
        const tickRoll = () => {
            if (state.over || actionToken !== state.actionToken) {
                state.isRolling = false;
                el.diceFace.classList.remove('is-rolling');
                resolve(false);
                return;
            }
            const nextDie = step >= DICE_ROLL_STEPS - 1 ? finalDie : DICE[step % DICE.length];
            setDiceFace(nextDie, step >= DICE_ROLL_STEPS - 1 ? `出目${finalDie}` : 'サイコロを振っている');
            step += 1;
            if (step >= DICE_ROLL_STEPS) {
                state.isRolling = false;
                el.diceFace.classList.remove('is-rolling');
                resolve(true);
                return;
            }
            window.setTimeout(tickRoll, DICE_ROLL_INTERVAL_MS);
        };
        tickRoll();
    });
}

function setDiceFace(die, label = null) {
    if (die == null) {
        delete el.diceFace.dataset.die;
        el.diceFace.textContent = '?';
        el.diceFace.setAttribute('aria-label', label || '出目なし');
        return;
    }
    el.diceFace.dataset.die = String(die);
    el.diceFace.textContent = '';
    el.diceFace.setAttribute('aria-label', label || `出目${die}`);
}

function resolveTurn(actor, die, actionToken) {
    if (actionToken != null && actionToken !== state.actionToken) return;
    const target = opponentOf(actor);
    const decision = resolveDiceAction(actor, die);
    state.lastAction = { actorId: actor.id, die, resultType: decision.type };
    setDiceFace(die);
    if (decision.type === 'miss') {
        el.actionTitle.textContent = 'ミス';
        el.actionDetail.textContent = decision.reason;
        log(`${actor.name} の出目${die}: ミス（${decision.reason}）`);
        createDemoFeedbackPopup(target.id, 'MISS', 'miss');
    } else {
        const action = decision.action;
        const kindText = decision.type === 'weaponForm' ? '武器型' : '小アルカナ';
        const targetHpBefore = target.hp;
        const actorHpBefore = actor.hp;
        const actorStatusBefore = demoStatusSnapshot(actor);
        const targetStatusBefore = demoStatusSnapshot(target);
        el.actionTitle.textContent = `${action.name}（${kindText}）`;
        el.actionDetail.textContent = action.effectText || `${action.power ?? '-'} / ${action.accuracy ?? '-'}`;
        log(`${actor.name} の出目${die}: ${displayAction(decision)}`, decision.type === 'minorArcana');
        if (decision.type === 'minorArcana') triggerDemoMinorArcana(actor.id, action);
        triggerDemoAvatarMotion(actor);
        const result = executeAction(actor, target, action);
        if (targetHpBefore > target.hp) triggerDemoDamageFeedback(target.id, targetHpBefore - target.hp);
        triggerDemoWeaponAttackEffect(target.id, actor, action, result);
        triggerDemoElementalAttackEffect(target.id, action, result);
        if (result.elementalLabel && targetHpBefore > target.hp) {
            createDemoFeedbackPopup(target.id, result.elementalLabel, 'status', 1);
        }
        if (actorHpBefore > actor.hp) triggerDemoDamageFeedback(actor.id, actorHpBefore - actor.hp);
        if (actor.hp > actorHpBefore) createDemoHealingPopup(actor.id, actor.hp - actorHpBefore);
        if (action.kind === 'attack' && !result.hit && targetHpBefore <= target.hp) {
            createDemoFeedbackPopup(target.id, 'MISS', 'miss');
        }
        showDemoStatusFeedback(actor.id, actorStatusBefore, demoStatusSnapshot(actor));
        showDemoStatusFeedback(target.id, targetStatusBefore, demoStatusSnapshot(target));
    }
    tick(actor);
    render();
    if (target.hp <= 0) {
        finishBattle(actor);
        return;
    }
    if (actor.hp <= 0) {
        finishBattle(target);
        return;
    }
    window.setTimeout(nextTurn, NEXT_TURN_DELAY_MS);
}

function triggerDemoAvatarMotion(actor) {
    const actorId = actor?.id || '';
    const avatar = actorId === 'player' ? el.playerAvatar : el.enemyAvatar;
    if (!avatar || avatar.classList.contains('is-avatar-defeated')) return;
    const direction = actorId === 'player' ? 'left' : 'right';
    applyAvatarWeaponClass(avatar, actor?.weapon);
    avatarModule?.triggerAvatarAttackMotion?.(avatar, {
        direction,
        duration: 460,
        bodyMotion: getDemoAvatarBodyMotion(actor?.weapon),
        bodyMotionIntervalMs: getDemoAvatarBodyMotion(actor?.weapon) === 'jump' ? 96 : 52
    });
    window.setTimeout(() => clearAvatarWeaponClass(avatar), 560);
}

function getDemoAvatarBodyMotion(weaponType) {
    const weapon = normalizeWeaponType(weaponType);
    if (weapon === 'axe_big' || weapon === 'sword_big' || weapon === 'axe' || weapon === 'blunt') return 'jump';
    if (weapon === 'gun' || weapon === 'gun_big' || weapon === 'bow' || weapon === 'staff' || weapon === 'wand') return 'walk';
    return 'run';
}

function triggerDemoDamageFeedback(unitId, amount = 0) {
    const avatar = unitId === 'player' ? el.playerAvatar : el.enemyAvatar;
    flashClass(avatar, 'is-avatar-damaged', 220);
    flashClass(el.battleBoard, 'is-damage-shake', 280);
    createDemoDamagePopup(unitId, amount);
}

function createDemoDamagePopup(unitId, amount = 0) {
    if (!el.battleBoard || amount <= 0) return;
    createDemoFeedbackPopup(unitId, `-${Math.ceil(amount)}`, 'damage');
}

function createDemoHealingPopup(unitId, amount = 0) {
    if (!el.battleBoard || amount <= 0) return;
    createDemoFeedbackPopup(unitId, `+${Math.ceil(amount)}`, 'heal');
}

function normalizeDemoFeedbackIconKey(text, type = 'damage') {
    const label = String(text || '').trim().toUpperCase();
    if (type === 'damage') return 'damage';
    if (type === 'heal') return 'heal';
    if (label === 'MISS') return 'miss';
    if (label === 'PARRY') return 'parry';
    if (label.startsWith('WEAK')) return 'weak';
    if (label.startsWith('RESIST')) return 'resist';
    if (label === 'BURN') return 'burn';
    if (label === 'WET') return 'wet';
    if (label === 'FEAR') return 'fear';
    if (label === 'CONFUSE') return 'confuse';
    if (label === 'ATK DOWN') return 'atkDown';
    if (label === 'DEF DOWN') return 'defDown';
    if (label === 'SPEED DOWN') return 'speedDown';
    if (label === 'ACC DOWN') return 'accDown';
    if (label === 'VULN UP') return 'vulnUp';
    if (label === 'GUARD') return 'guard';
    return '';
}

function getDemoFeedbackTone(iconKey, type = 'damage') {
    if (type === 'damage') return 'damage';
    if (type === 'heal') return 'heal';
    if (type === 'miss') return 'miss';
    if (iconKey === 'guard' || iconKey === 'parry') return 'buff';
    if (iconKey === 'weak') return 'advantage';
    if (iconKey === 'resist') return 'resist';
    if (iconKey === 'burn' || iconKey === 'wet' || iconKey === 'fear' || iconKey === 'confuse') return 'ailment';
    if (iconKey === 'atkDown' || iconKey === 'defDown' || iconKey === 'speedDown' || iconKey === 'accDown' || iconKey === 'vulnUp') return 'debuff';
    return type === 'status' ? 'status' : type;
}

function appendDemoFeedbackText(labelEl, text, type = 'damage') {
    const value = String(text || '');
    if (type !== 'damage' && type !== 'heal') {
        labelEl.textContent = value;
        return;
    }
    value.split('').forEach((char, index) => {
        const span = document.createElement('span');
        span.className = /[0-9]/.test(char) ? 'melee-feedback-digit' : 'melee-feedback-sign';
        span.style.setProperty('--digit-delay', `${index * 34}ms`);
        span.textContent = char;
        labelEl.append(span);
    });
}

function createDemoFeedbackIcon(iconKey) {
    const index = MELEE_FEEDBACK_ICON_INDEX[iconKey];
    if (!Number.isFinite(index)) return null;
    const col = index % MELEE_FEEDBACK_ICON_COLS;
    const row = Math.floor(index / MELEE_FEEDBACK_ICON_COLS);
    const icon = document.createElement('span');
    icon.className = 'melee-feedback-icon';
    icon.dataset.iconKey = iconKey;
    icon.dataset.iconIndex = String(index);
    icon.style.setProperty('--icon-col', String(col));
    icon.style.setProperty('--icon-row', String(row));
    icon.style.setProperty('--icon-col-pos', `${(col / (MELEE_FEEDBACK_ICON_COLS - 1)) * 100}%`);
    icon.style.setProperty('--icon-row-pos', `${(row / (MELEE_FEEDBACK_ICON_ROWS - 1)) * 100}%`);
    return icon;
}

function createDemoFeedbackPopup(unitId, text, type = 'damage', stackIndex = 0) {
    if (!el.battleBoard || !text) return;
    const isPlayer = unitId === 'player';
    const stack = Math.max(0, Number(stackIndex) || 0);
    const popup = document.createElement('span');
    popup.className = `melee-damage-pop is-${type} ${isPlayer ? 'is-player-side' : 'is-enemy-side'}`;
    popup.dataset.feedbackType = type;
    const iconKey = normalizeDemoFeedbackIconKey(text, type);
    const tone = getDemoFeedbackTone(iconKey, type);
    if (iconKey) popup.dataset.feedbackKey = iconKey;
    if (tone) popup.dataset.feedbackTone = tone;
    const numericAmount = Math.abs(Number(String(text).replace(/[^0-9.-]/g, '')) || 0);
    if (numericAmount >= 50) popup.classList.add('is-heavy-hit');
    popup.style.setProperty('--feedback-stack-y', `${type === 'status' ? stack * -18 : 0}px`);
    popup.style.setProperty('--feedback-x', `${type === 'status' ? (isPlayer ? -8 : 8) : 0}px`);
    const icon = createDemoFeedbackIcon(iconKey);
    if (icon) popup.append(icon);
    const label = document.createElement('span');
    label.className = 'melee-feedback-text';
    appendDemoFeedbackText(label, text, type);
    popup.append(label);
    el.battleBoard.append(popup);
    window.setTimeout(() => popup.remove(), type === 'status' ? 2800 : 2400);
}

function demoStatusSnapshot(unit) {
    return {
        burnTurns: unit.burnTurns,
        floodTurns: unit.floodTurns,
        fearTurns: unit.fearTurns,
        confusionTurns: unit.confusionTurns,
        attackMultiplier: unit.attackMultiplier,
        defenseMultiplier: unit.defenseMultiplier,
        speedMultiplier: unit.speedMultiplier,
        accuracyBonus: unit.accuracyBonus,
        damageTakenMultiplier: unit.damageTakenMultiplier,
        nextDamageTakenCharges: unit.nextDamageTakenCharges
    };
}

function demoStatusChangeLabel(key, before, after) {
    if (['burnTurns', 'floodTurns', 'fearTurns', 'confusionTurns'].includes(key) && after > before) {
        return ({ burnTurns: 'BURN', floodTurns: 'WET', fearTurns: 'FEAR', confusionTurns: 'CONFUSE' })[key];
    }
    if (key === 'attackMultiplier' && after < before) return 'ATK DOWN';
    if (key === 'defenseMultiplier' && after < before) return 'DEF DOWN';
    if (key === 'speedMultiplier' && after < before) return 'SPEED DOWN';
    if (key === 'accuracyBonus' && after < before) return 'ACC DOWN';
    if (key === 'damageTakenMultiplier' && after > before) return 'VULN UP';
    if (key === 'nextDamageTakenCharges' && after > before) return 'GUARD';
    return '';
}

function showDemoStatusFeedback(unitId, before, after) {
    const shown = new Set();
    let stackIndex = 0;
    Object.keys(after || {}).forEach((key) => {
        const label = demoStatusChangeLabel(key, Number(before?.[key] ?? 0), Number(after?.[key] ?? 0));
        if (!label || shown.has(label)) return;
        shown.add(label);
        createDemoFeedbackPopup(unitId, label, 'status', stackIndex);
        stackIndex += 1;
    });
}

function applyAvatarWeaponClass(avatar, weaponType) {
    if (!avatar) return;
    clearAvatarWeaponClass(avatar);
    avatar.classList.add(weaponAnimationClass(weaponType));
}

function clearAvatarWeaponClass(avatar) {
    avatar?.classList?.remove('is-avatar-weapon-heavy', 'is-avatar-weapon-pierce', 'is-avatar-weapon-ranged', 'is-avatar-weapon-guard', 'is-avatar-weapon-slash');
}

function setDemoAvatarDefeated(side, defeated) {
    const avatar = side === 'player' ? el.playerAvatar : el.enemyAvatar;
    if (!avatar) return;
    if (defeated) {
        const alreadyDefeated = avatar.dataset.avatarDefeated === 'true' && avatar.classList.contains('is-avatar-defeated');
        avatar.dataset.avatarDefeated = 'true';
        const direction = side === 'player' ? -1 : 1;
        avatar.style.setProperty('--avatar-defeat-head-x', `${10 * direction}px`);
        avatar.style.setProperty('--avatar-defeat-head-bounce-x', `${-4 * direction}px`);
        avatar.style.setProperty('--avatar-defeat-head-rest-x', `${3 * direction}px`);
        avatar.style.setProperty('--avatar-defeat-head-rotate', `${34 * direction}deg`);
        avatar.style.setProperty('--avatar-defeat-head-bounce-rotate', `${-11 * direction}deg`);
        avatar.style.setProperty('--avatar-defeat-head-rest-rotate', `${7 * direction}deg`);
        setDemoAvatarVictorious(side, false);
        avatar.classList.remove('is-avatar-attacking', 'is-avatar-attack-left', 'is-avatar-attack-right', 'is-avatar-damaged');
        clearAvatarWeaponClass(avatar);
        avatarModule?.stopAvatarBodyMotion?.(avatar, { reset: false });
        if (!alreadyDefeated) avatar.classList.add('is-avatar-defeated');
        return;
    }
    delete avatar.dataset.avatarDefeated;
    avatar.style.removeProperty('--avatar-defeat-head-x');
    avatar.style.removeProperty('--avatar-defeat-head-bounce-x');
    avatar.style.removeProperty('--avatar-defeat-head-rest-x');
    avatar.style.removeProperty('--avatar-defeat-head-rotate');
    avatar.style.removeProperty('--avatar-defeat-head-bounce-rotate');
    avatar.style.removeProperty('--avatar-defeat-head-rest-rotate');
    avatar.classList.remove('is-avatar-defeated');
}

function setDemoAvatarVictorious(side, victorious) {
    const avatar = side === 'player' ? el.playerAvatar : el.enemyAvatar;
    if (!avatar) return;
    if (victorious) {
        if (avatar.classList.contains('is-avatar-defeated')) return;
        const alreadyVictorious = avatar.dataset.avatarVictorious === 'true' && avatar.classList.contains('is-avatar-victorious');
        avatar.dataset.avatarVictorious = 'true';
        const direction = side === 'player' ? -1 : 1;
        avatar.style.setProperty('--avatar-victory-shift-x', `${6 * direction}px`);
        avatar.style.setProperty('--avatar-victory-rebound-x', `${-3 * direction}px`);
        avatar.classList.remove('is-avatar-attacking', 'is-avatar-attack-left', 'is-avatar-attack-right', 'is-avatar-damaged');
        clearAvatarWeaponClass(avatar);
        if (!alreadyVictorious) {
            avatarModule?.playAvatarBodyMotion?.(avatar, 'jump', {
                intervalMs: 96,
                restoreMotion: 'idle'
            });
            avatar.classList.add('is-avatar-victorious');
        }
        return;
    }
    delete avatar.dataset.avatarVictorious;
    avatar.style.removeProperty('--avatar-victory-shift-x');
    avatar.style.removeProperty('--avatar-victory-rebound-x');
    avatar.classList.remove('is-avatar-victorious');
}

function weaponAnimationClass(weaponType) {
    const weapon = normalizeWeaponType(weaponType);
    if (weapon === 'gun' || weapon === 'gun_big' || weapon === 'bow' || weapon === 'staff' || weapon === 'wand') return 'is-avatar-weapon-ranged';
    if (weapon === 'axe_big' || weapon === 'sword_big' || weapon === 'axe' || weapon === 'blunt') return 'is-avatar-weapon-heavy';
    if (weapon === 'dagger' || weapon === 'polearm') return 'is-avatar-weapon-pierce';
    if (weapon === 'shield') return 'is-avatar-weapon-guard';
    return 'is-avatar-weapon-slash';
}

function flashClass(element, className, duration) {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    window.setTimeout(() => element.classList.remove(className), duration);
}

function resolveDiceAction(actor, die) {
    const slotDie = clamp(Math.floor(Number(die) || 1), 1, 6);
    const formState = actor.forms[slotDie];
    const slot = actor.slots[slotDie];
    if (slotDie >= 2 && slot?.card && slot.unlocked) {
        return { type: 'minorArcana', die: slotDie, action: minorAction(slot.card) };
    }
    if (formState && !formState.removed) {
        formState.removed = true;
        if (slot?.card) slot.unlocked = true;
        return { type: 'weaponForm', die: slotDie, action: cloneAction(formState.action) };
    }
    if (slotDie >= 2 && slot?.card) {
        slot.unlocked = true;
        return { type: 'minorArcana', die: slotDie, action: minorAction(slot.card) };
    }
    return {
        type: 'miss',
        die: slotDie,
        reason: slotDie === 1 ? '1の武器型は外れている' : '空スロットの武器型は外れている'
    };
}

function executeAction(actor, target, action) {
    actor.usedPriorityLastTurn = !!action.priority;
    if (action.kind === 'miss') {
        log(`${actor.name} の${action.name}は失敗`);
        applyEffects(action.effectCodes || [], actor, target, action, 'always');
        applyEffects(action.effectCodes || [], actor, target, action, 'miss');
        return { hit: false, total: 0 };
    }
    if (action.kind === 'support') {
        applyEffects(action.effectCodes || [], actor, target, action, 'support');
        applyEffects(action.effectCodes || [], actor, target, action, 'always');
        return { hit: true, total: 0 };
    }

    const hits = Math.max(1, Number(action.hitCount) || 1);
    let total = 0;
    let hit = false;
    const elemental = demoElementalAffinity(actor, target, action);
    for (let index = 0; index < hits; index += 1) {
        if (target.evasionChance > 0 && Math.random() < target.evasionChance) {
            target.evasionChance = 0;
            target.evasionTurns = 0;
            log(`${target.name} は攻撃を回避`);
            continue;
        }
        const chance = hitChance(actor, action);
        if (chance < 1 && Math.random() > chance) {
            log(`${action.name} は外れた`);
            continue;
        }
        let damage = actionDamage(actor, target, action);
        const critChance = clamp((action.criticalBonus || 0), 0, 0.8);
        if (critChance > 0 && Math.random() < critChance) {
            damage = Math.floor(damage * 1.5);
            log('クリティカル');
        }
        const applied = dealDamage(target, damage);
        total += applied;
        hit = true;
        log(`${actor.name} の${action.name}が命中。${target.name}に${applied}ダメージ`);
        if (elemental.label) log(elemental.label);
        if (target.hp <= 0) break;
    }
    if (hit) {
        applyEffects(action.effectCodes || [], actor, target, action, 'hit');
        if (action.drainRate && total > 0) {
            const heal = Math.floor(total * action.drainRate);
            actor.hp = clamp(actor.hp + heal, 0, actor.maxHp);
            log(`${actor.name} は${heal}吸収`);
        }
        maybeCounter(target, actor);
    } else {
        applyEffects(action.effectCodes || [], actor, target, action, 'miss');
    }
    applyEffects(action.effectCodes || [], actor, target, action, 'always');
    return { hit, total, elementalLabel: hit ? elemental.label : '' };
}

function actionDamage(actor, target, action) {
    let power = Number(action.power) || 100;
    if (action.source === 'weapon' && actor.nextWeaponPowerBonus) {
        power += actor.nextWeaponPowerBonus;
        actor.nextWeaponPowerBonus = 0;
    }
    if (action.source === 'minor' && actor.nextMinorPowerBonus) {
        power += actor.nextMinorPowerBonus;
        actor.nextMinorPowerBonus = 0;
    }
    if (action.conditionalPower && conditionMatches(action.conditionalPower, actor, target)) {
        power += Number(action.conditionalPower.value) || 0;
    }
    const ignored = clamp(Number(action.ignoreDefense) || 0, 0, 1);
    const defense = target.defense * target.defenseMultiplier * (1 - ignored);
    let damage = Math.max(1, actor.attack * Math.max(0, power) / 100 - defense * 0.55);
    damage *= actor.attackMultiplier;
    damage *= 1 + actor.morale * 0.05;
    damage *= target.damageTakenMultiplier;
    damage *= demoElementalAffinity(actor, target, action).multiplier;
    if (target.nextDamageTakenCharges > 0) {
        damage *= target.nextDamageTakenMultiplier;
        target.nextDamageTakenCharges -= 1;
        if (target.nextDamageTakenCharges <= 0) {
            target.nextDamageTakenCharges = 0;
            target.nextDamageTakenMultiplier = 1;
        }
    }
    return Math.max(1, Math.floor(damage));
}

function hitChance(actor, action) {
    let accuracy = Number(action.accuracy) || 100;
    accuracy += actor.accuracyBonus;
    if (action.source === 'minor' && actor.nextMinorAccuracyBonus) {
        accuracy += actor.nextMinorAccuracyBonus;
        actor.nextMinorAccuracyBonus = 0;
    }
    return clamp(accuracy, 5, 100) / 100;
}

function applyEffects(effects, actor, target, action, trigger) {
    for (const effect of effects) {
        const expected = effect.trigger || (action.kind === 'support' ? 'support' : 'hit');
        if (expected !== 'always' && expected !== trigger) continue;
        if (effect.conditionStatus && !hasStatus(effect.target === 'self' ? actor : target, effect.conditionStatus)) continue;
        const chance = effect.chance == null ? 1 : clamp(Number(effect.chance) + actor.nextMinorEffectChanceBonus / 100, 0, 1);
        if (chance < 1 && Math.random() > chance) continue;
        applyEffect(effect, actor, target, action);
    }
    if (action.source === 'minor' && trigger !== 'miss') actor.nextMinorEffectChanceBonus = 0;
}

function applyEffect(effect, actor, target, action) {
    const unit = effect.target === 'self' ? actor : target;
    switch (effect.type) {
        case 'burn':
            unit.burnTurns = Math.max(unit.burnTurns, Number(effect.turns) || 2);
            log(`${unit.name} は火傷を負った`);
            break;
        case 'flood':
            unit.floodTurns = Math.max(unit.floodTurns, Number(effect.turns) || 2);
            setTimed(unit, 'speedMultiplier', 'speedTurns', 0.9, Number(effect.turns) || 2);
            log(`${unit.name} は水浸しになった`);
            break;
        case 'fear':
            unit.fearTurns = Math.max(unit.fearTurns, Number(effect.turns) || 2);
            setTimed(unit, 'attackMultiplier', 'attackTurns', 0.8, Number(effect.turns) || 2);
            log(`${unit.name} は恐怖した`);
            break;
        case 'confusion':
            unit.confusionTurns = Math.max(unit.confusionTurns, Number(effect.turns) || 2);
            log(`${unit.name} は混乱した`);
            break;
        case 'speedChange':
            setTimed(unit, 'speedMultiplier', 'speedTurns', Number(effect.multiplier) || 1, Number(effect.turns) || 1);
            log(`${unit.name} の素早さが変化`);
            break;
        case 'defenseDown':
            setTimed(unit, 'defenseMultiplier', 'defenseTurns', Number(effect.multiplier) || 0.9, Number(effect.turns) || 1);
            log(`${unit.name} の防御が下がった`);
            break;
        case 'attackDown':
            setTimed(unit, 'attackMultiplier', 'attackTurns', Number(effect.multiplier) || 0.8, Number(effect.turns) || 1);
            log(`${unit.name} の次ダメージが下がる`);
            break;
        case 'accuracyBonus':
            unit.accuracyBonus += Number(effect.value) || 0;
            unit.accuracyTurns = Math.max(unit.accuracyTurns, Number(effect.turns) || 1);
            log(`${unit.name} の命中が変化`);
            break;
        case 'nextDamageTaken':
            unit.nextDamageTakenMultiplier = Number(effect.multiplier) || 1;
            unit.nextDamageTakenCharges = Math.max(unit.nextDamageTakenCharges, Number(effect.charges) || 1);
            log(`${unit.name} の次被ダメージ補正が変化`);
            break;
        case 'damageTakenTimed':
            setTimed(unit, 'damageTakenMultiplier', 'damageTakenTurns', Number(effect.multiplier) || 1, Number(effect.turns) || 1);
            log(`${unit.name} は防御を固めた`);
            break;
        case 'nextWeaponPower':
            unit.nextWeaponPowerBonus += Number(effect.value) || 0;
            log(`${unit.name} の次武器型威力が変化`);
            break;
        case 'nextMinorPower':
            unit.nextMinorPowerBonus += Number(effect.value) || 0;
            log(`${unit.name} の次小アルカナ威力が上がる`);
            break;
        case 'nextMinorAccuracy':
            unit.nextMinorAccuracyBonus += Number(effect.value) || 0;
            log(`${unit.name} の次小アルカナ命中が変化`);
            break;
        case 'nextMinorEffectChance':
            unit.nextMinorEffectChanceBonus += Number(effect.value) || 0;
            log(`${unit.name} の次小アルカナ追加効果率が上がる`);
            break;
        case 'nextMinorEffectMultiplier':
            unit.nextMinorEffectMultiplier = Number(effect.multiplier) || 1;
            log(`${unit.name} の次小アルカナ効果量が下がる`);
            break;
        case 'clearGuard':
        case 'clearEnemyEvasion':
            clearGuard(unit);
            log(`${unit.name} の構えを解除`);
            break;
        case 'cleanse':
            cleanse(unit, effect.statuses || ['burn', 'flood', 'fear', 'confusion']);
            log(`${unit.name} は状態を整えた`);
            break;
        case 'healPercent':
            heal(unit, Number(effect.value) || 0);
            break;
        case 'healOrCleanseBurn':
            if (unit.burnTurns > 0) {
                unit.burnTurns = 0;
                log(`${unit.name} の火傷を解除`);
            } else {
                heal(unit, Number(effect.value) || 0);
            }
            break;
        case 'healAndCleanseOne':
            heal(unit, Number(effect.value) || 0);
            cleanse(unit, ['burn', 'flood', 'fear', 'confusion'], 1);
            break;
        case 'morale':
            unit.morale = clamp(unit.morale + (Number(effect.value) || 0), -2, 2);
            log(`${unit.name} の士気が${unit.morale >= 0 ? '+' : ''}${unit.morale}`);
            break;
        case 'moraleOrHeal':
            if (unit.morale >= 2) {
                heal(unit, Number(effect.healPercent) || 5);
            } else {
                unit.morale = clamp(unit.morale + (Number(effect.value) || 1), -2, 2);
                log(`${unit.name} の士気が+${unit.morale}`);
            }
            break;
        case 'moraleOrPower':
            if (unit.morale >= 2) {
                unit.nextWeaponPowerBonus += Number(effect.powerBonus) || 20;
                log(`${unit.name} の次攻撃威力が上がる`);
            } else {
                unit.morale = clamp(unit.morale + (Number(effect.value) || 1), -2, 2);
                log(`${unit.name} の士気が+${unit.morale}`);
            }
            break;
        case 'mpPercent':
            log(`${unit.name} のMPが${Number(effect.value) > 0 ? '+' : ''}${Number(effect.value) || 0}%`);
            break;
        case 'counter':
            unit.counterPower = Math.max(unit.counterPower, Number(effect.power) || 60);
            unit.counterTurns = Math.max(unit.counterTurns, Number(effect.turns) || 1);
            log(`${unit.name} は反撃姿勢を取った`);
            break;
        case 'evasion':
            unit.evasionChance = Math.max(unit.evasionChance, Number(effect.chance) || 0.4);
            unit.evasionTurns = Math.max(unit.evasionTurns, Number(effect.turns) || 1);
            log(`${unit.name} は回避姿勢を取った`);
            break;
        case 'selfHpPercentDamage': {
            const damage = Math.max(1, Math.floor(unit.maxHp * ((Number(effect.value) || 5) / 100)));
            dealDamage(unit, damage);
            log(`${unit.name} は反動で${damage}ダメージ`);
            break;
        }
        case 'extraHpPercentDamage': {
            const damage = Math.max(1, Math.floor(unit.maxHp * ((Number(effect.value) || 10) / 100)));
            dealDamage(unit, damage);
            log(`${unit.name} に追加${damage}ダメージ`);
            break;
        }
        default:
            break;
    }
}

function applyStartOfTurn(actor) {
    if (actor.burnTurns > 0) {
        const damage = Math.max(1, Math.floor(actor.maxHp * 0.05));
        dealDamage(actor, damage);
        log(`${actor.name} は火傷で${damage}ダメージ`);
        triggerDemoDamageFeedback(actor.id);
        if (actor.hp <= 0) return false;
    }
    if (actor.confusionTurns > 0 && Math.random() < 0.2) {
        log(`${actor.name} は混乱して行動できない`);
        return false;
    }
    return true;
}

function maybeCounter(defender, attacker) {
    if (defender.counterTurns <= 0 || defender.counterPower <= 0 || attacker.hp <= 0) return;
    const action = attack(0, '反撃', defender.counterPower, 100);
    defender.counterTurns = 0;
    defender.counterPower = 0;
    const damage = actionDamage(defender, attacker, action);
    const applied = dealDamage(attacker, damage);
    log(`${defender.name} の反撃。${attacker.name}に${applied}ダメージ`);
}

function tick(actor) {
    for (const [turnKey, valueKey] of [
        ['attackTurns', 'attackMultiplier'],
        ['damageTakenTurns', 'damageTakenMultiplier'],
        ['defenseTurns', 'defenseMultiplier'],
        ['speedTurns', 'speedMultiplier'],
        ['accuracyTurns', 'accuracyBonus']
    ]) {
        if (actor[turnKey] > 0) {
            actor[turnKey] -= 1;
            if (actor[turnKey] <= 0) actor[valueKey] = valueKey === 'accuracyBonus' ? 0 : 1;
        }
    }
    if (actor.burnTurns > 0) actor.burnTurns -= 1;
    if (actor.floodTurns > 0) actor.floodTurns -= 1;
    if (actor.fearTurns > 0) actor.fearTurns -= 1;
    if (actor.confusionTurns > 0) actor.confusionTurns -= 1;
    if (actor.counterTurns > 0) {
        actor.counterTurns -= 1;
        if (actor.counterTurns <= 0) actor.counterPower = 0;
    }
    if (actor.evasionTurns > 0) {
        actor.evasionTurns -= 1;
        if (actor.evasionTurns <= 0) actor.evasionChance = 0;
    }
}

function judgeBattle() {
    const [player, enemy] = state.fighters;
    const playerRate = player.hp / player.maxHp;
    const enemyRate = enemy.hp / enemy.maxHp;
    const winner = playerRate === enemyRate
        ? (player.attack + player.defense + effectiveSpeed(player) >= enemy.attack + enemy.defense + effectiveSpeed(enemy) ? player : enemy)
        : (playerRate > enemyRate ? player : enemy);
    log('最大ラウンド到達。判定へ', true);
    finishBattle(winner);
}

function finishBattle(winner) {
    state.over = true;
    state.current = null;
    log(`${winner?.name || '不明'} の勝利`, true);
    render();
    setDemoAvatarVictorious(winner?.id === 'player' ? 'player' : 'enemy', true);
}

function render() {
    const player = byId('player');
    const enemy = byId('enemy');
    renderFighter(player, 'player');
    renderFighter(enemy, 'enemy');
    renderSlots(player, el.playerSlots);
    renderSlots(enemy, el.enemySlots);
    el.rollButton.disabled = true;
    for (const button of el.fixedDice) button.disabled = true;
    el.playerPanel.classList.toggle('is-active', state.current?.id === 'player');
    el.enemyPanel.classList.toggle('is-active', state.current?.id === 'enemy');
    el.playerPanel.classList.toggle('is-acting', state.current?.id === 'player');
    el.enemyPanel.classList.toggle('is-acting', state.current?.id === 'enemy');
    if (state.over) {
        el.turnText.textContent = '決着';
    } else if (state.current?.id === 'player') {
        el.turnText.textContent = `第${state.round}ラウンド あなたの手番`;
    } else if (state.current?.id === 'enemy') {
        el.turnText.textContent = `第${state.round}ラウンド 相手の手番`;
    } else {
        el.turnText.textContent = `第${state.round}ラウンド`;
    }
}

function renderFighter(fighter, side) {
    const prefix = side === 'player' ? 'player' : 'enemy';
    el[`${prefix}Name`].textContent = fighter.name;
    el[`${prefix}Meta`].textContent = side === 'player'
        ? `${WEAPONS[fighter.weapon].label}型 / 攻${fighter.attack} 防${fighter.defense} 速${effectiveSpeed(fighter)}`
        : `${WEAPONS[fighter.weapon].label}型`;
    el[`${prefix}Panel`].dataset.weapon = fighter.weapon;
    const weaponIcon = el[`${prefix}WeaponIcon`];
    if (weaponIcon) {
        weaponIcon.dataset.weapon = fighter.weapon;
        weaponIcon.setAttribute('aria-label', WEAPONS[fighter.weapon].label);
    }
    el[`${prefix}HpText`].textContent = side === 'player' ? `HP ${fighter.hp}/${fighter.maxHp}` : 'HP';
    el[`${prefix}HpBar`].max = fighter.maxHp;
    el[`${prefix}HpBar`].value = fighter.hp;
    setDemoAvatarDefeated(side, fighter.hp <= 0);
    const statusRoot = el[`${prefix}Status`];
    statusRoot.replaceChildren(...statusLabels(fighter).map((text) => {
        const chip = document.createElement('span');
        chip.className = 'status-chip';
        chip.textContent = text;
        return chip;
    }));
}

function renderSlots(fighter, root) {
    root.replaceChildren();
    for (const die of DICE) {
        const slot = fighter.slots[die];
        const formState = fighter.forms[die];
        const hasCard = !!slot?.card;
        const isActive = state.lastAction?.actorId === fighter.id && state.lastAction?.die === die;
        const isActiveWeaponForm = isActive && state.lastAction?.resultType === 'weaponForm';
        const isUnlocked = hasCard && slot.unlocked && !isActiveWeaponForm;
        const resultType = hasCard
            ? (isUnlocked ? 'minorArcana' : 'weaponForm')
            : (formState?.removed ? 'miss' : 'weaponForm');
        const label = hasCard
            ? (slot.card.cardName || slot.card.skillName)
            : (formState?.action?.name || 'weapon form');
        const box = document.createElement('div');
        box.className = 'slot melee-replay-slot';
        box.dataset.die = String(die);
        box.dataset.weapon = fighter.weapon;
        box.dataset.resultType = resultType;
        if (hasCard) {
            box.dataset.cardSuit = normalizeTarotSuit(slot.card.suit);
            box.dataset.cardRank = String(slot.card.rank ?? slot.card.number ?? '');
            box.classList.add('has-card');
        }
        if (isUnlocked) box.classList.add('is-unlocked');
        if (!hasCard && formState?.removed) box.classList.add('is-spent');
        if (isActive) box.classList.add('is-active');
        const icon = slotVisualType(fighter, die) === 'tarot'
            ? createSlotTarotIcon(slot.card)
            : createSlotWeaponIcon(fighter.weapon);
        box.title = `D${die}: ${label}`;
        box.append(createSlotDieIcon(die), icon);
        root.append(box);
    }
}
function statusLabels(fighter) {
    const labels = [];
    if (fighter.morale) labels.push(`士気${fighter.morale > 0 ? '+' : ''}${fighter.morale}`);
    if (fighter.burnTurns > 0) labels.push('火傷');
    if (fighter.floodTurns > 0) labels.push('水浸し');
    if (fighter.fearTurns > 0) labels.push('恐怖');
    if (fighter.confusionTurns > 0) labels.push('混乱');
    if (fighter.nextDamageTakenCharges > 0) labels.push('防御');
    if (fighter.counterTurns > 0) labels.push('反撃');
    if (fighter.evasionTurns > 0) labels.push('回避');
    if (fighter.nextWeaponPowerBonus) labels.push('武器威力');
    if (fighter.nextMinorPowerBonus || fighter.nextMinorAccuracyBonus) labels.push('小アルカナ強化');
    return labels;
}

function createFighter(id, name, weapon, deck, profile) {
    const forms = {};
    for (const action of FORM_TABLE[weapon] || FORM_TABLE.sword) {
        forms[action.slot] = { action: cloneAction(action), removed: false };
    }
    const slots = {};
    for (const die of MINOR_DICE) {
        const cardEntry = deck[die - 2] || null;
        const unlocked = !!cardEntry && Number(cardEntry.rank) === die;
        if (unlocked) forms[die].removed = true;
        slots[die] = { card: cardEntry, unlocked };
    }
    const combatProfile = normalizeDemoCombatProfile(profile);
    const maxHp = demoMaxHp(combatProfile);
    const hp = demoCurrentHp(combatProfile);
    const elementKey = demoCombatProfileElementKey(combatProfile);
    return {
        id,
        name,
        weapon,
        profile: combatProfile,
        elementKey,
        elementLabel: demoElementLabel(elementKey),
        maxHp,
        hp,
        attack: demoAttackStat(combatProfile),
        defense: demoDefenseStat(combatProfile),
        speed: demoSpeedStat(combatProfile),
        forms,
        slots,
        morale: 0,
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
        burnTurns: 0,
        floodTurns: 0,
        fearTurns: 0,
        confusionTurns: 0,
        usedPriorityLastTurn: false
    };
}

function minorAction(cardEntry) {
    return {
        kind: cardEntry.power == null && cardEntry.accuracy == null ? 'support' : 'attack',
        source: 'minor',
        name: cardEntry.skillName,
        cardName: cardEntry.cardName,
        suit: cardEntry.suit,
        elementKey: normalizeDemoElementKey(cardEntry.elementKey || cardEntry.element || cardEntry.suit),
        rank: cardEntry.rank,
        power: cardEntry.power,
        accuracy: cardEntry.accuracy,
        hitCount: cardEntry.hitCount || 1,
        effectText: cardEntry.effectText || '',
        effectCodes: cloneEffects(cardEntry.effectCodes),
        ignoreDefense: Number(cardEntry.ignoreDefense) || 0,
        criticalBonus: Number(cardEntry.criticalBonus) || 0,
        drainRate: Number(cardEntry.drainRate) || 0,
        priority: !!cardEntry.priority,
        conditionalPower: cardEntry.conditionalPower || null
    };
}

function normalizeCard(entry) {
    return {
        ...entry,
        rank: Number(entry.rank ?? entry.number),
        elementKey: normalizeDemoElementKey(entry.elementKey || entry.element || entry.suit),
        power: entry.power == null ? null : Number(entry.power),
        accuracy: entry.accuracy == null ? null : Number(entry.accuracy),
        hitCount: Math.max(1, Number(entry.hitCount) || 1),
        effectCodes: Array.isArray(entry.effectCodes) ? entry.effectCodes : []
    };
}

function card(itemId, cardName, suit, rank, skillName, power, accuracy, effectCodes, effectText, hitCount = 1, extra = {}) {
    return normalizeCard({
        itemId,
        cardName,
        suit,
        rank,
        number: rank,
        skillName,
        power,
        accuracy,
        hitCount,
        effectText,
        effectCodes,
        ...extra
    });
}

function attack(slot, name, power, accuracy, effectCodes = [], extra = {}) {
    return { slot, name, kind: 'attack', source: 'weapon', power, accuracy, hitCount: extra.hitCount || 1, effectCodes, ...extra };
}

function support(slot, name, effectCodes = [], extra = {}) {
    return { slot, name, kind: 'support', source: 'weapon', power: null, accuracy: null, hitCount: 0, effectCodes, ...extra };
}

function miss(slot, name, effectCodes = []) {
    return { slot, name, kind: 'miss', source: 'weapon', power: null, accuracy: null, hitCount: 0, effectCodes };
}

function fx(type, props = {}) {
    return { type, ...props };
}

function cloneAction(action) {
    return { ...action, effectCodes: cloneEffects(action.effectCodes || []) };
}

function cloneEffects(effects) {
    return effects.map((entry) => ({ ...entry }));
}

function asNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDemoElementKey(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'none';
    const lower = raw.toLowerCase();
    return DEMO_ELEMENT_ALIASES[lower] || DEMO_ELEMENT_ALIASES[raw] || 'none';
}

function demoElementLabel(value) {
    const key = normalizeDemoElementKey(value);
    return DEMO_ELEMENT_LABELS[key] || DEMO_ELEMENT_LABELS.none;
}

function demoCombatProfileElementKey(profile) {
    const stats = profile?.stats || {};
    return normalizeDemoElementKey(stats.Nation ?? stats.nation ?? profile?.nation ?? profile?.Nation);
}

function demoActionAttackElementKey(action) {
    if (action?.source !== 'minor' || action?.kind !== 'attack') return 'none';
    return normalizeDemoElementKey(action.elementKey || action.element || action.suit);
}

function demoElementalAffinity(actor, target, action) {
    const attackElementKey = demoActionAttackElementKey(action);
    const defenderElementKey = normalizeDemoElementKey(target?.elementKey);
    const neutral = {
        attackElementKey,
        defenderElementKey,
        relation: 'none',
        multiplier: 1,
        label: ''
    };
    if (!DEMO_ELEMENT_KEYS.has(attackElementKey) || !DEMO_ELEMENT_KEYS.has(defenderElementKey)) return neutral;
    if (attackElementKey === defenderElementKey) return { ...neutral, relation: 'neutral' };
    if (DEMO_ELEMENT_BEATS[attackElementKey] === defenderElementKey) {
        return { ...neutral, relation: 'weak', multiplier: 1.25, label: 'WEAK!' };
    }
    if (DEMO_ELEMENT_BEATS[defenderElementKey] === attackElementKey) {
        return { ...neutral, relation: 'resist', multiplier: 0.75, label: 'RESIST...' };
    }
    return { ...neutral, relation: 'neutral' };
}

function readDemoStat(profile, keys, fallback = 0) {
    const stats = profile?.stats || {};
    for (const key of keys) {
        const value = asNumber(stats[key], Number.NaN);
        if (Number.isFinite(value)) return value;
    }
    return fallback;
}

function readDemoEquipmentStat(profile, keys, fallback = 0) {
    const equipmentStats = profile?.equipmentStats || {};
    for (const key of keys) {
        const value = asNumber(equipmentStats[key], Number.NaN);
        if (Number.isFinite(value)) return value;
    }
    return fallback;
}

function normalizeDemoCombatProfile(profile = {}) {
    const stats = { ...(profile.stats || {}) };
    const equipmentStats = { ...(profile.equipmentStats || {}) };
    const maxHp = Math.max(1, Math.floor(asNumber(stats.MaxHP, asNumber(stats.HP, asNumber(stats.CurrentHP, 1)))));
    const currentHp = clamp(Math.floor(asNumber(stats.CurrentHP, asNumber(stats.HP, maxHp))), 0, maxHp);
    stats.MaxHP = maxHp;
    stats.CurrentHP = currentHp;
    stats.HP = currentHp;
    return { stats, equipmentStats };
}

function demoMaxHp(profile) {
    return Math.max(1, Math.floor(readDemoStat(profile, ['MaxHP', 'HP', 'CurrentHP'], 1)));
}

function demoCurrentHp(profile) {
    return clamp(Math.floor(readDemoStat(profile, ['CurrentHP', 'HP'], demoMaxHp(profile))), 0, demoMaxHp(profile));
}

function demoAttackStat(profile) {
    const base = readDemoStat(profile, ['ちから', 'Power', 'Attack'], 1);
    const equipment = readDemoEquipmentStat(profile, ['Power', 'Attack'], 0);
    return Math.max(1, base + equipment);
}

function demoDefenseStat(profile) {
    const base = readDemoStat(profile, ['みのまもり', 'Defense', 'Guard'], 0);
    const equipment = readDemoEquipmentStat(profile, ['Defense', 'Guard'], 0);
    return Math.max(0, base + equipment);
}

function demoSpeedStat(profile) {
    const base = readDemoStat(profile, ['すばやさ', 'Agi', 'Speed'], 1);
    const equipment = readDemoEquipmentStat(profile, ['Agi', 'Speed'], 0);
    return Math.max(1, base + equipment);
}

function effectiveSpeed(fighter) {
    return Math.max(1, Math.floor((fighter.speed + (WEAPONS[fighter.weapon].speed || 0)) * fighter.speedMultiplier));
}

function randomDie() {
    return Math.floor(Math.random() * 6) + 1;
}

function dealDamage(target, amount) {
    const damage = Math.max(0, Math.floor(amount));
    target.hp = clamp(target.hp - damage, 0, target.maxHp);
    return damage;
}

function heal(target, percent) {
    const amount = Math.max(1, Math.floor(target.maxHp * percent / 100));
    const before = target.hp;
    target.hp = clamp(target.hp + amount, 0, target.maxHp);
    log(`${target.name} はHPを${target.hp - before}回復`);
}

function clearGuard(unit) {
    unit.nextDamageTakenMultiplier = 1;
    unit.nextDamageTakenCharges = 0;
    unit.counterPower = 0;
    unit.counterTurns = 0;
    unit.evasionChance = 0;
    unit.evasionTurns = 0;
}

function cleanse(unit, statuses, limit = Infinity) {
    let count = 0;
    for (const status of statuses) {
        if (count >= limit) break;
        const key = `${status}Turns`;
        if (unit[key] > 0) {
            unit[key] = 0;
            count += 1;
        }
    }
}

function setTimed(unit, valueKey, turnKey, value, turns) {
    unit[valueKey] = value;
    unit[turnKey] = Math.max(unit[turnKey], turns);
}

function conditionMatches(condition, actor, target) {
    if (!condition) return false;
    if (condition.status && hasStatus(target, condition.status)) return true;
    if (condition.selfStatus && hasStatus(actor, condition.selfStatus)) return true;
    if (condition.selfSpeedAtLeastEnemy && effectiveSpeed(actor) >= effectiveSpeed(target)) return true;
    if (condition.enemyGuarding && (target.nextDamageTakenCharges > 0 || target.damageTakenMultiplier < 1)) return true;
    if (condition.enemyUsedPriority && target.usedPriorityLastTurn) return true;
    return false;
}

function hasStatus(unit, status) {
    if (status === 'any') return ['burn', 'flood', 'fear', 'confusion'].some((name) => hasStatus(unit, name));
    return Number(unit[`${status}Turns`]) > 0;
}

function byId(id) {
    return state.fighters.find((fighter) => fighter.id === id);
}

function opponentOf(actor) {
    return state.fighters.find((fighter) => fighter.id !== actor.id);
}

function displayAction(decision) {
    if (decision.type === 'weaponForm') return `${decision.action.name}（武器型）`;
    return `${decision.action.cardName} / ${decision.action.name}（小アルカナ）`;
}

function log(text, important = false) {
    const item = document.createElement('li');
    item.textContent = text;
    if (important) item.className = 'is-important';
    el.battleLog.append(item);
    el.battleLog.parentElement.scrollTop = el.battleLog.parentElement.scrollHeight;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
