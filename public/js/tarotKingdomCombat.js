import {
    normalizeTarotKingdomTarotDeck,
    normalizeTarotKingdomWeaponTypes
} from './tarotKingdomEffects.js';

const NPC_STYLE_BY_SEAT = Object.freeze({
    1: { key: 'cautious', hp: 1.10, power: 0.85, defense: 1.20, weaponType: 'shield' },
    2: { key: 'balanced', hp: 1.00, power: 1.00, defense: 1.00, weaponType: 'sword' },
    3: { key: 'aggressive', hp: 0.90, power: 1.20, defense: 0.80, weaponType: 'axe' }
});

const NPC_TAROT_DECK_BY_SEAT = Object.freeze({
    1: Object.freeze([
        { suit: 'Pentacle', rank: 2, skillName: '二重装甲', effectClass: 'support', effectCodes: [{ type: 'nextDamageTaken', target: 'self', multiplier: 0.6 }] },
        { suit: 'Pentacle', rank: 4, skillName: '護符', effectClass: 'support', effectCodes: [{ type: 'cleanse', target: 'self' }, { type: 'nextDamageTaken', target: 'self', multiplier: 0.9 }] },
        { suit: 'Pentacle', rank: 7, skillName: '鉄根', effectClass: 'support', effectCodes: [{ type: 'healPercent', target: 'self', value: 10 }, { type: 'nextDamageTaken', target: 'self', multiplier: 0.8 }] },
        { suit: 'Pentacle', rank: 10, skillName: '要塞化', effectClass: 'support', effectCodes: [{ type: 'nextDamageTaken', target: 'self', multiplier: 0.75, charges: 2 }] },
        { suit: 'Pentacle', rank: 13, skillName: '豊穣の環', effectClass: 'support', effectCodes: [{ type: 'cleanse', target: 'self', status: 'wet' }, { type: 'healPercent', target: 'self', value: 15 }] }
    ]),
    2: Object.freeze([
        { suit: 'Sword', rank: 1, skillName: '風切り', effectClass: 'attack', power: 80, priority: true },
        { suit: 'Sword', rank: 5, skillName: '乱気流', effectClass: 'attack', power: 60, effectCodes: [{ type: 'confusion', chance: 0.3 }] },
        { suit: 'Sword', rank: 8, skillName: '鎌鼬', effectClass: 'attack', power: 100, ignoreDefense: 0.2 },
        { suit: 'Sword', rank: 11, skillName: '索敵の風', effectClass: 'support', effectCodes: [{ type: 'accuracyBonus', target: 'self', value: 20, charges: 2 }, { type: 'clearEnemyEvasion', target: 'enemy' }] },
        { suit: 'Sword', rank: 14, skillName: '天剣', effectClass: 'attack', power: 140, criticalBonus: 0.3 }
    ]),
    3: Object.freeze([
        { suit: 'Pentacle', rank: 1, skillName: '石拳', effectClass: 'attack', power: 90, effectCodes: [{ type: 'nextDamageTaken', target: 'self', multiplier: 0.9 }] },
        { suit: 'Pentacle', rank: 3, skillName: '土槍', effectClass: 'attack', power: 80, effectCodes: [{ type: 'defenseDown', target: 'enemy', multiplier: 0.9 }] },
        { suit: 'Pentacle', rank: 6, skillName: '岩砕き', effectClass: 'attack', power: 100, conditionalPower: { enemyGuarding: true, value: 40 } },
        { suit: 'Pentacle', rank: 12, skillName: '重騎突', effectClass: 'attack', power: 120, conditionalPower: { enemyUsedPriority: true, value: 40 } },
        { suit: 'Pentacle', rank: 14, skillName: '巨岩王', effectClass: 'attack', power: 140, effectCodes: [{ type: 'defenseDown', target: 'enemy', multiplier: 0.8 }] }
    ])
});

const NPC_WEAPON_BY_STYLE = Object.freeze({
    cautious: {
        equipment: { RightHand: 'sword_0', LeftHand: 'shield_0' },
        itemSource: {
            sword_0: { itemId: 'sword_0', customData: { Category: 'Weapon', WeaponType: 'sword', sprite_index: '0' } },
            shield_0: { itemId: 'shield_0', customData: { Category: 'Shield', WeaponType: 'shield', sprite_index: '0' } }
        }
    },
    balanced: {
        equipment: { RightHand: 'sword_1' },
        itemSource: {
            sword_1: { itemId: 'sword_1', customData: { Category: 'Weapon', WeaponType: 'sword', sprite_index: '1' } }
        }
    },
    aggressive: {
        equipment: { RightHand: 'axe_2' },
        itemSource: {
            axe_2: { itemId: 'axe_2', customData: { Category: 'Weapon', WeaponType: 'axe', sprite_index: '2' } }
        }
    }
});
const PET_ARCHETYPE_BY_NUMBER = Object.freeze({
    0: Object.freeze({ key: 'balanced', hp: 1, power: 1, defense: 1, intelligence: 1, speed: 1, aiStyle: 'balanced' }),
    1: Object.freeze({ key: 'brute', hp: 1.12, power: 1.14, defense: 1.05, intelligence: 0.95, speed: 0.85, aiStyle: 'aggressive' }),
    2: Object.freeze({ key: 'caster', hp: 0.92, power: 0.9, defense: 0.9, intelligence: 1.22, speed: 1.08, aiStyle: 'balanced' }),
    3: Object.freeze({ key: 'swift', hp: 0.86, power: 1.04, defense: 0.75, intelligence: 0.9, speed: 1.42, aiStyle: 'aggressive' }),
    4: Object.freeze({ key: 'guardian', hp: 1.22, power: 0.9, defense: 1.5, intelligence: 1.05, speed: 0.68, aiStyle: 'cautious' })
});

const EXPLORATION_NPC_WEAPONS = Object.freeze([
    { idPrefix: 'sword_', weaponType: 'sword', frames: 7 },
    { idPrefix: 'dagger_', weaponType: 'dagger', frames: 7 },
    { idPrefix: 'axe_', weaponType: 'axe', frames: 10 },
    { idPrefix: 'blunt_', weaponType: 'blunt', frames: 10 },
    { idPrefix: 'staff_', weaponType: 'staff', frames: 13 },
    { idPrefix: 'wand_', weaponType: 'wand', frames: 6 },
    { idPrefix: 'gun_', weaponType: 'gun', frames: 4 },
    {
        idPrefix: 'bow_',
        weaponType: 'bow',
        frames: 7,
        spritePath: './Sprites/weapons/ranged weapons/bow.png',
        spriteWidth: 32,
        spriteHeight: 32
    },
    { idPrefix: 'sword_big_', weaponType: 'sword_big', frames: 10, twoHanded: true },
    { idPrefix: 'axe_big_', weaponType: 'axe_big', frames: 5, twoHanded: true },
    { idPrefix: 'polearm_', weaponType: 'polearm', frames: 12, twoHanded: true },
    { idPrefix: 'gun_big_', weaponType: 'gun_big', frames: 5, twoHanded: true }
]);
const EXPLORATION_NPC_ARMORS = Object.freeze([
    { idPrefix: 'leather01_', frames: 10 },
    { idPrefix: 'leather02_', frames: 4 },
    { idPrefix: 'metal_', frames: 10 },
    { idPrefix: 'metal_black_', frames: 10 }
]);

function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveInteger(value, fallback = 1) {
    return Math.max(1, Math.floor(finiteNumber(value, fallback)));
}

export function normalizeTarotKingdomCombat(rawCombat = {}, fallback = {}) {
    const source = rawCombat && typeof rawCombat === 'object' ? rawCombat : {};
    const base = fallback && typeof fallback === 'object' ? fallback : {};
    const weaponType = String(source.weaponType || base.weaponType || 'unarmed').trim().toLowerCase() || 'unarmed';
    return {
        maxHp: positiveInteger(source.maxHp, positiveInteger(base.maxHp, 1)),
        power: Math.max(0, Math.floor(finiteNumber(source.power, finiteNumber(base.power, 0)))),
        defense: Math.max(0, Math.floor(finiteNumber(source.defense, finiteNumber(base.defense, 0)))),
        intelligence: Math.max(0, Math.floor(finiteNumber(source.intelligence, finiteNumber(base.intelligence, 0)))),
        speed: Math.max(0, Math.floor(finiteNumber(source.speed, finiteNumber(base.speed, 0)))),
        weaponType,
        weaponTypes: normalizeTarotKingdomWeaponTypes(source.weaponTypes || base.weaponTypes, weaponType)
    };
}

export function normalizeTarotKingdomCharacter(rawCharacter = {}, fallback = {}) {
    const source = rawCharacter && typeof rawCharacter === 'object' ? rawCharacter : {};
    const base = fallback && typeof fallback === 'object' ? fallback : {};
    const level = positiveInteger(source.level, positiveInteger(base.level, 1));
    const monsterId = String(source.monsterId || base.monsterId || '').trim();
    return {
        version: 2,
        source: source.source === 'playfab'
            ? 'playfab'
            : (source.source === 'preview' ? 'preview' : (source.source === 'pet' ? 'pet' : 'npc')),
        playFabId: String(source.playFabId || base.playFabId || '').trim(),
        ...(monsterId ? { monsterId } : {}),
        displayName: String(source.displayName || base.displayName || '冒険者').trim() || '冒険者',
        level,
        rankLabel: String(source.rankLabel || base.rankLabel || `Lv${level}`).trim() || `Lv${level}`,
        avatarBase: source.avatarBase && typeof source.avatarBase === 'object'
            ? { ...source.avatarBase, level }
            : { ...(base.avatarBase || {}), level },
        equipment: source.equipment && typeof source.equipment === 'object'
            ? { ...source.equipment }
            : { ...(base.equipment || {}) },
        itemSource: source.itemSource && typeof source.itemSource === 'object'
            ? source.itemSource
            : (base.itemSource || {}),
        tarotDeck: normalizeTarotKingdomTarotDeck(source.tarotDeck || base.tarotDeck || []),
        combat: normalizeTarotKingdomCombat(source.combat, base.combat)
    };
}

export function createTarotKingdomPetCharacter({ pet = null, level = 1 } = {}) {
    const monsterId = String(pet?.monsterId || '').trim();
    const displayName = String(pet?.monsterName || monsterId || 'ペット').trim() || 'ペット';
    const safeLevel = positiveInteger(level, 1);
    const number = Math.max(1, Math.floor(finiteNumber(pet?.number, 1)));
    const archetype = PET_ARCHETYPE_BY_NUMBER[number % 5] || PET_ARCHETYPE_BY_NUMBER[0];
    const baseHp = 80 + ((safeLevel - 1) * 4);
    const basePower = Math.max(8, safeLevel * 3);
    const baseDefense = Math.max(4, safeLevel * 2);
    const baseIntelligence = Math.max(3, safeLevel * 2);
    const baseSpeed = Math.max(4, safeLevel * 2);
    const scale = (value, multiplier) => Math.max(1, Math.round(value * multiplier));
    return normalizeTarotKingdomCharacter({
        version: 2,
        source: 'pet',
        monsterId,
        playFabId: '',
        displayName,
        level: safeLevel,
        rankLabel: `仲間 Lv${safeLevel}`,
        avatarBase: { Race: 'monster', AvatarColor: 'monster', level: safeLevel },
        equipment: {},
        itemSource: {},
        tarotDeck: [],
        combat: {
            maxHp: scale(baseHp, archetype.hp),
            power: scale(basePower, archetype.power),
            defense: scale(baseDefense, archetype.defense),
            intelligence: scale(baseIntelligence, archetype.intelligence),
            speed: scale(baseSpeed, archetype.speed),
            weaponType: 'unarmed',
            weaponTypes: ['unarmed']
        }
    });
}

export function getTarotKingdomPetAiStyle(pet = null) {
    const number = Math.max(1, Math.floor(finiteNumber(pet?.number, 1)));
    return (PET_ARCHETYPE_BY_NUMBER[number % 5] || PET_ARCHETYPE_BY_NUMBER[0]).aiStyle;
}

export function createTarotKingdomNpcCharacter({ seat = 1, level = 1, displayName = '' } = {}) {
    const safeSeat = Math.max(1, Math.min(3, Math.floor(finiteNumber(seat, 1))));
    const safeLevel = positiveInteger(level, 1);
    const style = NPC_STYLE_BY_SEAT[safeSeat] || NPC_STYLE_BY_SEAT[2];
    const weapon = NPC_WEAPON_BY_STYLE[style.key] || NPC_WEAPON_BY_STYLE.balanced;
    const baseHp = 80 + ((safeLevel - 1) * 4);
    const basePower = Math.max(8, safeLevel * 3);
    const baseDefense = Math.max(4, safeLevel * 2);
    const baseIntelligence = Math.max(3, safeLevel * 2);
    const baseSpeed = Math.max(4, safeLevel * 2);
    const scale = (value, multiplier) => Math.max(1, Math.floor(value * multiplier));
    // AvatarColor selects a body sprite filename. Keep every generated NPC on
    // an existing body palette; "blonde" is a hair color and has no body image.
    const colorBySeat = ['brown', 'brown', 'black', 'red'];
    return normalizeTarotKingdomCharacter({
        version: 2,
        source: 'npc',
        playFabId: '',
        displayName: String(displayName || `NPC${safeSeat}`),
        level: safeLevel,
        rankLabel: `${style.key === 'cautious' ? '守護' : (style.key === 'aggressive' ? '猛攻' : '均衡')} Lv${safeLevel}`,
        avatarBase: {
            Race: 'human',
            AvatarColor: colorBySeat[safeSeat] || 'brown',
            SkinColorIndex: 1,
            FaceIndex: safeSeat,
            HairStyleIndex: safeSeat + 1,
            HairColorIndex: safeSeat,
            FacialHairStyleIndex: safeSeat === 3 ? 1 : 0,
            level: safeLevel
        },
        equipment: weapon.equipment,
        itemSource: weapon.itemSource,
        tarotDeck: NPC_TAROT_DECK_BY_SEAT[safeSeat] || [],
        combat: {
            maxHp: scale(baseHp, style.hp),
            power: scale(basePower, style.power),
            defense: scale(baseDefense, style.defense),
            intelligence: baseIntelligence,
            speed: baseSpeed,
            weaponType: style.weaponType,
            weaponTypes: safeSeat === 1 ? ['sword', 'shield'] : [style.weaponType]
        }
    });
}

function explorationRandomIndex(length, random) {
    if (length <= 1) return 0;
    const value = Math.max(0, Math.min(0.999999, finiteNumber(random(), 0)));
    return Math.floor(value * length);
}

function buildExplorationNpcItem(id, category, spriteIndex, weaponType = '', definition = null) {
    const customData = {
        Category: category,
        sprite_index: String(Math.max(0, Math.floor(finiteNumber(spriteIndex, 0))))
    };
    if (weaponType) customData.WeaponType = weaponType;
    if (definition?.twoHanded) customData.TwoHanded = true;
    if (definition?.spritePath) {
        customData.sprite_path = definition.spritePath;
        customData.sprite_w = String(definition.spriteWidth || 32);
        customData.sprite_h = String(definition.spriteHeight || 32);
    }
    return { itemId: id, customData };
}

export function createTarotKingdomExplorationNpcCharacter({
    seat = 1,
    level = 1,
    playerAvatarBase = {},
    random = Math.random
} = {}) {
    const safeSeat = Math.max(1, Math.min(3, Math.floor(finiteNumber(seat, 1))));
    const randomSource = typeof random === 'function' ? random : Math.random;
    const base = createTarotKingdomNpcCharacter({
        seat: safeSeat,
        level,
        displayName: `はぐれ海賊${safeSeat}`
    });
    const weapon = EXPLORATION_NPC_WEAPONS[
        explorationRandomIndex(EXPLORATION_NPC_WEAPONS.length, randomSource)
    ];
    const armor = EXPLORATION_NPC_ARMORS[
        explorationRandomIndex(EXPLORATION_NPC_ARMORS.length, randomSource)
    ];
    const weaponFrame = explorationRandomIndex(weapon.frames, randomSource);
    const armorFrame = explorationRandomIndex(armor.frames, randomSource);
    const weaponId = `${weapon.idPrefix}${weaponFrame}`;
    const armorId = `${armor.idPrefix}${armorFrame}`;
    const equipment = { RightHand: weaponId, Armor: armorId };
    const itemSource = {
        [weaponId]: buildExplorationNpcItem(weaponId, 'Weapon', weaponFrame, weapon.weaponType, weapon),
        [armorId]: buildExplorationNpcItem(armorId, 'Armor', armorFrame)
    };
    const weaponTypes = [weapon.weaponType];
    if (!weapon.twoHanded && randomSource() < 0.45) {
        const shieldFrame = explorationRandomIndex(10, randomSource);
        const shieldId = `shield_${shieldFrame}`;
        equipment.LeftHand = shieldId;
        itemSource[shieldId] = buildExplorationNpcItem(shieldId, 'Shield', shieldFrame, 'shield');
        weaponTypes.push('shield');
    }
    const inheritedAvatar = playerAvatarBase && typeof playerAvatarBase === 'object'
        ? playerAvatarBase
        : {};
    const avatarBase = {
        ...base.avatarBase,
        Race: String(inheritedAvatar.Race || base.avatarBase.Race || 'human'),
        AvatarColor: String(inheritedAvatar.AvatarColor || base.avatarBase.AvatarColor || 'brown'),
        SkinColorIndex: Math.max(1, Math.floor(finiteNumber(
            inheritedAvatar.SkinColorIndex,
            base.avatarBase.SkinColorIndex || 1
        ))),
        FaceIndex: explorationRandomIndex(10, randomSource) + 1,
        HairStyleIndex: explorationRandomIndex(10, randomSource) + 1,
        HairColorIndex: explorationRandomIndex(9, randomSource) + 2,
        FacialHairStyleIndex: randomSource() < 0.38
            ? explorationRandomIndex(10, randomSource) + 1
            : 0
    };
    return normalizeTarotKingdomCharacter({
        ...base,
        displayName: `はぐれ海賊${safeSeat}`,
        avatarBase,
        equipment,
        itemSource,
        combat: {
            ...base.combat,
            weaponType: weapon.weaponType,
            weaponTypes
        }
    });
}

export function calculateTarotKingdomPlayerAttack({
    cardCount = 1,
    maxCardStrength = 0,
    power = 0,
    intelligence = 0,
    isSkill = false,
    roleRate = 1
} = {}) {
    if (isSkill) {
        const safeRate = Math.max(1, Math.floor(finiteNumber(roleRate, 1)));
        const baseDamage = 72 + (safeRate * 18);
        const scaling = 1 + (Math.min(200, Math.max(0, finiteNumber(intelligence, 0))) / 100);
        return { kind: 'skill', baseDamage, damage: Math.max(0, Math.floor(baseDamage * scaling)) };
    }
    const safeCount = Math.max(1, Math.min(5, Math.floor(finiteNumber(cardCount, 1))));
    const baseDamage = 10 + (safeCount * 14) + Math.floor(Math.max(0, finiteNumber(maxCardStrength, 0)) / 3);
    const scaling = 1 + (Math.min(200, Math.max(0, finiteNumber(power, 0))) / 100);
    return { kind: 'attack', baseDamage, damage: Math.max(0, Math.floor(baseDamage * scaling)) };
}

export function calculateTarotKingdomIncomingDamage(enemyBaseDamage, defense = 0) {
    const baseDamage = Math.max(0, Math.floor(finiteNumber(enemyBaseDamage, 0)));
    if (baseDamage <= 0) return 0;
    const safeDefense = Math.max(0, finiteNumber(defense, 0));
    return Math.max(1, Math.floor((baseDamage * 100) / (100 + safeDefense)));
}
