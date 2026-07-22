const NPC_STYLE_BY_SEAT = Object.freeze({
    1: { key: 'cautious', hp: 1.10, power: 0.85, defense: 1.20, weaponType: 'shield' },
    2: { key: 'balanced', hp: 1.00, power: 1.00, defense: 1.00, weaponType: 'sword' },
    3: { key: 'aggressive', hp: 0.90, power: 1.20, defense: 0.80, weaponType: 'axe' }
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
    return {
        maxHp: positiveInteger(source.maxHp, positiveInteger(base.maxHp, 1)),
        power: Math.max(0, Math.floor(finiteNumber(source.power, finiteNumber(base.power, 0)))),
        defense: Math.max(0, Math.floor(finiteNumber(source.defense, finiteNumber(base.defense, 0)))),
        intelligence: Math.max(0, Math.floor(finiteNumber(source.intelligence, finiteNumber(base.intelligence, 0)))),
        speed: Math.max(0, Math.floor(finiteNumber(source.speed, finiteNumber(base.speed, 0)))),
        weaponType: String(source.weaponType || base.weaponType || 'unarmed').trim().toLowerCase() || 'unarmed'
    };
}

export function normalizeTarotKingdomCharacter(rawCharacter = {}, fallback = {}) {
    const source = rawCharacter && typeof rawCharacter === 'object' ? rawCharacter : {};
    const base = fallback && typeof fallback === 'object' ? fallback : {};
    const level = positiveInteger(source.level, positiveInteger(base.level, 1));
    return {
        version: 1,
        source: source.source === 'playfab' ? 'playfab' : (source.source === 'preview' ? 'preview' : 'npc'),
        playFabId: String(source.playFabId || base.playFabId || '').trim(),
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
        combat: normalizeTarotKingdomCombat(source.combat, base.combat)
    };
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
        version: 1,
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
        combat: {
            maxHp: scale(baseHp, style.hp),
            power: scale(basePower, style.power),
            defense: scale(baseDefense, style.defense),
            intelligence: baseIntelligence,
            speed: baseSpeed,
            weaponType: style.weaponType
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
