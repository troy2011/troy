const EQUIPMENT_ENHANCEMENT_VERSION = 1;
const EQUIPMENT_ENHANCEMENT_MAX_STAT = 99;
const EQUIPMENT_ENHANCEMENT_PROPERTY = 'equipmentEnhancement';
const EQUIPMENT_ENHANCEMENT_RARITY_CONTRIBUTIONS = Object.freeze({
    common: 1,
    rare: 2,
    epic: 3,
    legendary: 4
});
const EQUIPMENT_RARITY_THRESHOLDS = Object.freeze({
    rare: 18,
    epic: 35,
    legendary: 60
});

const WEAPON_FAMILY_ALIASES = Object.freeze({
    sword: 'sword',
    longsword: 'sword',
    sword_big: 'sword_big',
    greatsword: 'sword_big',
    large_sword: 'sword_big',
    two_handed_sword: 'sword_big',
    dagger: 'dagger',
    knife: 'dagger',
    axe: 'axe',
    axe_big: 'axe_big',
    greataxe: 'axe_big',
    great_axe: 'axe_big',
    large_axe: 'axe_big',
    blunt: 'blunt',
    mace: 'blunt',
    hammer: 'blunt',
    polearm: 'polearm',
    spear: 'polearm',
    staff: 'staff',
    wand: 'wand',
    bow: 'bow',
    gun: 'gun',
    pistol: 'gun',
    gun_big: 'gun_big',
    big_gun: 'gun_big',
    heavy_gun: 'gun_big'
});

function normalizeToken(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
}

function getEquipmentCategory(catalogData = {}) {
    return String(catalogData.Category || catalogData.category || '').trim();
}

function getEquipmentRarity(catalogData = {}) {
    const score = Math.max(
        Number(catalogData.Power ?? catalogData.Atk) || 0,
        Number(catalogData.Defense ?? catalogData.Def) || 0,
        Number(catalogData.MagicPower) || 0,
        Number(catalogData.HealPower) || 0
    );
    if (score >= EQUIPMENT_RARITY_THRESHOLDS.legendary) return 'legendary';
    if (score >= EQUIPMENT_RARITY_THRESHOLDS.epic) return 'epic';
    if (score >= EQUIPMENT_RARITY_THRESHOLDS.rare) return 'rare';
    if (score > 0) return 'common';

    const explicit = normalizeToken(
        catalogData.Rarity
        || catalogData.rarity
        || catalogData.Rare
        || catalogData.Tier
        || catalogData.tier
    );
    if (['legendary', 'lgd', 'red'].includes(explicit)) return 'legendary';
    if (['epic', 'purple'].includes(explicit)) return 'epic';
    if (['rare', 'blue'].includes(explicit)) return 'rare';
    return 'common';
}

function getEquipmentRarityContribution(catalogData = {}) {
    return EQUIPMENT_ENHANCEMENT_RARITY_CONTRIBUTIONS[getEquipmentRarity(catalogData)]
        || EQUIPMENT_ENHANCEMENT_RARITY_CONTRIBUTIONS.common;
}

function getEquipmentRarityForEffectiveValue(catalogData = {}, effectiveValue = 0) {
    const primaryStat = getEquipmentPrimaryStat(catalogData);
    if (!primaryStat) return getEquipmentRarity(catalogData);
    const normalizedValue = Math.max(0, Math.min(
        EQUIPMENT_ENHANCEMENT_MAX_STAT,
        Math.floor(Number(effectiveValue) || 0)
    ));
    return getEquipmentRarity({
        ...catalogData,
        [primaryStat]: normalizedValue
    });
}

function resolveWeaponFamily(itemId, catalogData = {}) {
    const explicit = normalizeToken(
        catalogData.WeaponType
        || catalogData.weaponType
        || catalogData.WeaponFamily
        || catalogData.weaponFamily
    );
    if (WEAPON_FAMILY_ALIASES[explicit]) return WEAPON_FAMILY_ALIASES[explicit];

    const source = normalizeToken([
        itemId,
        catalogData.FriendlyId,
        catalogData.sprite_path,
        catalogData.SpritePath,
        catalogData.DisplayName,
        catalogData.Title
    ].filter(Boolean).join('_'));
    const orderedFamilies = [
        ['sword_big', /(?:^|_)sword_big(?:_|$)|great_?sword/],
        ['axe_big', /(?:^|_)axe_big(?:_|$)|great_?axe/],
        ['gun_big', /(?:^|_)gun_big(?:_|$)|big_?gun|heavy_?gun/],
        ['dagger', /(?:^|_)(?:dagger|knife)(?:_|$)/],
        ['polearm', /(?:^|_)(?:polearm|spear)(?:_|$)/],
        ['blunt', /(?:^|_)(?:blunt|mace|hammer)(?:_|$)/],
        ['staff', /(?:^|_)staff(?:_|$)/],
        ['wand', /(?:^|_)wand(?:_|$)/],
        ['bow', /(?:^|_)bow(?:_|$)/],
        ['gun', /(?:^|_)(?:gun|pistol)(?:_|$)/],
        ['axe', /(?:^|_)axe(?:_|$)/],
        ['sword', /(?:^|_)sword(?:_|$)/]
    ];
    return orderedFamilies.find(([, pattern]) => pattern.test(source))?.[0] || '';
}

function resolveArmorFamily(itemId, catalogData = {}) {
    const explicit = normalizeToken(
        catalogData.ArmorType
        || catalogData.armorType
        || catalogData.ArmorFamily
        || catalogData.armorFamily
    );
    if (['cloth', 'leather', 'metal'].includes(explicit)) return explicit;

    const source = normalizeToken([
        itemId,
        catalogData.FriendlyId,
        catalogData.sprite_path,
        catalogData.SpritePath,
        catalogData.DisplayName,
        catalogData.Title
    ].filter(Boolean).join('_'));
    if (/(?:^|_)leather\d*(?:_|$)/.test(source)) return 'leather';
    if (/(?:^|_)(?:metal|plate|mail)(?:_|$)/.test(source)) return 'metal';
    if (/(?:^|_)(?:cloth|robe|hat_black|hat_straw)(?:_|$)/.test(source)) return 'cloth';
    return '';
}

function resolveEquipmentEnhancementFamily(itemId, catalogData = {}) {
    const category = getEquipmentCategory(catalogData);
    if (category === 'Weapon') return resolveWeaponFamily(itemId, catalogData);
    if (category === 'Armor') return resolveArmorFamily(itemId, catalogData);
    if (category === 'Shield') return 'shield';
    return '';
}

function getEquipmentPrimaryStat(catalogData = {}) {
    const category = getEquipmentCategory(catalogData);
    if (category === 'Weapon') return 'Power';
    if (category === 'Armor' || category === 'Shield') return 'Defense';
    return '';
}

function getEquipmentBaseStat(catalogData = {}) {
    const primaryStat = getEquipmentPrimaryStat(catalogData);
    if (!primaryStat) return 0;
    const fallbackStat = primaryStat === 'Power' ? 'Atk' : 'Def';
    return Math.max(0, Math.floor(Number(catalogData[primaryStat] ?? catalogData[fallbackStat]) || 0));
}

function normalizeDisplayProperties(value) {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string') return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function getEquipmentEnhancementBonus(inventoryItem = {}) {
    const displayProperties = normalizeDisplayProperties(
        inventoryItem.DisplayProperties ?? inventoryItem.displayProperties
    );
    const enhancement = displayProperties[EQUIPMENT_ENHANCEMENT_PROPERTY];
    if (!enhancement || typeof enhancement !== 'object') return 0;
    return Math.max(0, Math.floor(Number(enhancement.bonus) || 0));
}

function buildEquipmentEnhancementDisplayProperties(inventoryItem = {}, bonus = 0) {
    const current = normalizeDisplayProperties(
        inventoryItem.DisplayProperties ?? inventoryItem.displayProperties
    );
    return {
        ...current,
        [EQUIPMENT_ENHANCEMENT_PROPERTY]: {
            version: EQUIPMENT_ENHANCEMENT_VERSION,
            bonus: Math.max(0, Math.floor(Number(bonus) || 0))
        }
    };
}

function buildEquipmentEnhancementDescriptor(itemId, catalogData = {}, inventoryItem = {}) {
    const category = getEquipmentCategory(catalogData);
    const primaryStat = getEquipmentPrimaryStat(catalogData);
    const family = resolveEquipmentEnhancementFamily(itemId, catalogData);
    const baseValue = getEquipmentBaseStat(catalogData);
    const storedBonus = getEquipmentEnhancementBonus(inventoryItem);
    const bonus = Math.max(0, Math.min(storedBonus, EQUIPMENT_ENHANCEMENT_MAX_STAT - baseValue));
    const effectiveValue = Math.min(EQUIPMENT_ENHANCEMENT_MAX_STAT, baseValue + bonus);
    const rarity = getEquipmentRarityForEffectiveValue(catalogData, effectiveValue);
    const rarityContribution = EQUIPMENT_ENHANCEMENT_RARITY_CONTRIBUTIONS[rarity]
        || EQUIPMENT_ENHANCEMENT_RARITY_CONTRIBUTIONS.common;
    const materialEligible = ['Weapon', 'Armor', 'Shield'].includes(category) && !!family;
    const eligible = materialEligible && effectiveValue < EQUIPMENT_ENHANCEMENT_MAX_STAT;
    return {
        version: EQUIPMENT_ENHANCEMENT_VERSION,
        category,
        family,
        primaryStat,
        baseValue,
        bonus,
        storedBonus,
        effectiveValue,
        rarity,
        rarityContribution,
        contribution: rarityContribution + storedBonus,
        eligible,
        materialEligible,
        capped: effectiveValue >= EQUIPMENT_ENHANCEMENT_MAX_STAT
    };
}

function applyEquipmentEnhancementToCatalogData(itemId, catalogData = {}, inventoryItem = {}) {
    const enhancement = buildEquipmentEnhancementDescriptor(itemId, catalogData, inventoryItem);
    if (!enhancement.primaryStat || enhancement.bonus <= 0) {
        return { catalogData: { ...catalogData }, enhancement };
    }
    return {
        catalogData: {
            ...catalogData,
            [enhancement.primaryStat]: enhancement.effectiveValue
        },
        enhancement
    };
}

module.exports = {
    EQUIPMENT_ENHANCEMENT_MAX_STAT,
    EQUIPMENT_ENHANCEMENT_PROPERTY,
    EQUIPMENT_ENHANCEMENT_RARITY_CONTRIBUTIONS,
    EQUIPMENT_ENHANCEMENT_VERSION,
    applyEquipmentEnhancementToCatalogData,
    buildEquipmentEnhancementDescriptor,
    buildEquipmentEnhancementDisplayProperties,
    getEquipmentBaseStat,
    getEquipmentCategory,
    getEquipmentEnhancementBonus,
    getEquipmentPrimaryStat,
    getEquipmentRarity,
    getEquipmentRarityContribution,
    getEquipmentRarityForEffectiveValue,
    normalizeDisplayProperties,
    resolveArmorFamily,
    resolveEquipmentEnhancementFamily,
    resolveWeaponFamily
};
