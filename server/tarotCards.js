const TAROT_MAJOR_CATEGORIES = new Set(['TarotMajor', 'MajorArcana', 'TarotArcanaMajor']);
const TAROT_MINOR_CATEGORIES = new Set(['TarotMinor', 'MinorArcana', 'TarotArcanaMinor']);
const TAROT_MAJOR_SLOT = 'MajorArcana';
const TAROT_MINOR_SLOTS = ['MinorArcana1', 'MinorArcana2', 'MinorArcana3', 'MinorArcana4'];
const TAROT_MINOR_SLOT_TO_MANIFESTATION_SLOT = {
    MinorArcana1: 'Armor',
    MinorArcana2: 'RightHand',
    MinorArcana3: 'LeftHand',
    MinorArcana4: 'Accessory'
};
const TAROT_MANIFESTATION_SLOTS = ['Armor', 'RightHand', 'LeftHand', 'Accessory'];
const TAROT_MANIFESTATION_SLOT_TO_KEY = {
    Armor: 'Equipped_Armor',
    RightHand: 'Equipped_RightHand',
    LeftHand: 'Equipped_LeftHand',
    Accessory: 'Equipped_Accessory'
};
const TAROT_EQUIPMENT_SLOT_TO_KEY = {
    MajorArcana: 'Equipped_MajorArcana',
    MinorArcana1: 'Equipped_MinorArcana1',
    MinorArcana2: 'Equipped_MinorArcana2',
    MinorArcana3: 'Equipped_MinorArcana3',
    MinorArcana4: 'Equipped_MinorArcana4'
};
const TAROT_SLOT_LABELS = {
    MajorArcana: '体',
    Armor: '頭',
    RightHand: '右手',
    LeftHand: '左手',
    Accessory: 'アクセサリー',
    MinorArcana1: '頭',
    MinorArcana2: '右手',
    MinorArcana3: '左手',
    MinorArcana4: 'アクセサリー'
};
const TAROT_SUIT_LABELS = {
    wand: 'ワンド',
    sword: 'ソード',
    cup: 'カップ',
    pentacle: 'ペンタクル',
    all: '全スート',
    none: '無属性'
};
const TAROT_FACE_LABELS = {
    PAGE: 'ペイジ',
    KNIGHT: 'ナイト',
    QUEEN: 'クイーン',
    KING: 'キング'
};
const ITEM_SPRITE_PRESETS = Object.freeze([
    { idPrefixes: ['accessory_', 'offhand_'], path: './Sprites/items/icons.png', width: 16, height: 16, cols: 16 },
    { idPrefixes: ['hat_black_'], path: './Sprites/wardrobe/cloth/hat_black.png', width: 32, height: 32, cols: 10 },
    { idPrefixes: ['hat_straw_'], path: './Sprites/wardrobe/cloth/hat_straw.png', width: 32, height: 32, cols: 5 },
    { idPrefixes: ['leather01_'], path: './Sprites/wardrobe/leather/leather01.png', width: 32, height: 32, cols: 10 },
    { idPrefixes: ['leather02_'], path: './Sprites/wardrobe/leather/leather02.png', width: 32, height: 48, cols: 4 },
    { idPrefixes: ['metal_black_'], path: './Sprites/wardrobe/metal/metal_black.png', width: 32, height: 48, cols: 10 },
    { idPrefixes: ['metal_'], path: './Sprites/wardrobe/metal/metal.png', width: 32, height: 32, cols: 10 },
    { idPrefixes: ['shield_'], path: './Sprites/weapons/melee weapons/shield.png', width: 32, height: 32, cols: 10 },
    { idPrefixes: ['sword_big_'], path: './Sprites/weapons/melee weapons/sword_big.png', width: 32, height: 48, cols: 10 },
    { idPrefixes: ['sword_'], path: './Sprites/weapons/melee weapons/sword.png', width: 32, height: 32, cols: 7 },
    { idPrefixes: ['dagger_'], path: './Sprites/weapons/melee weapons/dagger.png', width: 32, height: 32, cols: 7 },
    { idPrefixes: ['axe_big_'], path: './Sprites/weapons/melee weapons/axe_big.png', width: 32, height: 48, cols: 5 },
    { idPrefixes: ['axe_'], path: './Sprites/weapons/melee weapons/axe.png', width: 32, height: 32, cols: 10 },
    { idPrefixes: ['blunt_'], path: './Sprites/weapons/melee weapons/blunt.png', width: 32, height: 32, cols: 10 },
    { idPrefixes: ['polearm_'], path: './Sprites/weapons/melee weapons/polearm.png', width: 32, height: 64, cols: 12 },
    { idPrefixes: ['staff_'], path: './Sprites/weapons/magic weapons/staff.png', width: 32, height: 64, cols: 13 },
    { idPrefixes: ['wand_'], path: './Sprites/weapons/magic weapons/wand.png', width: 32, height: 32, cols: 6 },
    { idPrefixes: ['gun_big_'], path: './Sprites/weapons/ranged weapons/pistol_big.png', width: 64, height: 32, cols: 5 },
    { idPrefixes: ['gun_'], path: './Sprites/weapons/ranged weapons/pistol.png', width: 32, height: 32, cols: 4 }
]);

function resolveManifestSpritePreset(itemId, spritePath = '') {
    const key = String(itemId || '').trim().toLowerCase();
    const normalizedPath = String(spritePath || '').trim().toLowerCase();
    return ITEM_SPRITE_PRESETS.find((preset) =>
        (normalizedPath && normalizedPath === String(preset.path).toLowerCase())
        || preset.idPrefixes.some((prefix) => key.startsWith(prefix))
    ) || null;
}

function normalizeManifestSpriteFrame(itemId, spritePath, spriteWidth = 32, spriteHeight = 32, spriteCols = 0) {
    const preset = resolveManifestSpritePreset(itemId, spritePath);
    if (preset) {
        return {
            path: preset.path,
            width: preset.width,
            height: preset.height,
            cols: preset.cols
        };
    }
    return {
        path: String(spritePath || '').trim(),
        width: Number(spriteWidth) || 32,
        height: Number(spriteHeight) || 32,
        cols: Number(spriteCols) || undefined
    };
}

const TAROT_ROMAN_NUMERALS = {
    1: 'I',
    2: 'II',
    3: 'III',
    4: 'IV',
    5: 'V',
    6: 'VI',
    7: 'VII',
    8: 'VIII',
    9: 'IX',
    10: 'X'
};
const TAROT_MAJOR_SPECIAL_SUIT = {
    2: 'cup',
    3: 'pentacle',
    4: 'wand',
    5: 'sword',
    6: 'cup',
    7: 'sword',
    8: 'wand',
    9: 'pentacle',
    11: 'sword',
    12: 'pentacle',
    13: 'cup',
    14: 'wand',
    16: 'sword',
    17: 'cup',
    18: 'pentacle',
    19: 'wand'
};
const TAROT_MAJOR_ALL_SUIT_NUMBERS = new Set([1]);
const TAROT_MANIFESTATION_BASES = {
    Armor: {
        wand: '術帽',
        sword: '戦冠',
        cup: '月冠',
        pentacle: '金冠'
    },
    RightHand: {
        wand: '杖',
        sword: '剣',
        cup: '聖杯杖',
        pentacle: '印具'
    },
    LeftHand: {
        wand: '導器',
        sword: '副剣',
        cup: '守杯',
        pentacle: '護符板'
    },
    Accessory: {
        wand: '魔印',
        sword: '勲章',
        cup: '首飾り',
        pentacle: '護符'
    }
};
const TAROT_MANIFESTATION_CATEGORY_BY_SLOT = {
    Armor: 'Armor',
    RightHand: 'Weapon',
    LeftHand: 'Shield',
    Accessory: 'Accessory'
};
const TAROT_MANIFEST_WEAPON_TYPE_BY_SLOT_SUIT = {
    RightHand: {
        wand: 'staff',
        sword: 'sword',
        cup: 'staff',
        pentacle: 'blunt'
    },
    LeftHand: {
        wand: 'staff',
        sword: 'dagger',
        cup: 'shield',
        pentacle: 'shield'
    }
};
const NATION_STARTER_MAJOR_CARD_IDS = {
    water: 'arcana-2',
    earth: 'arcana-3',
    fire: 'arcana-4',
    wind: 'arcana-5'
};
const NATION_KEY_ALIASES = {
    water: 'water',
    aqua: 'water',
    '水': 'water',
    earth: 'earth',
    land: 'earth',
    '地': 'earth',
    fire: 'fire',
    flame: 'fire',
    '火': 'fire',
    wind: 'wind',
    air: 'wind',
    '風': 'wind'
};
const TAROT_MANIFEST_STYLE_BY_MAJOR = {
    'arcana-0': 'rogue',
    'arcana-1': 'arcane',
    'arcana-2': 'cleric',
    'arcana-3': 'nature',
    'arcana-4': 'regal',
    'arcana-5': 'cleric',
    'arcana-6': 'nature',
    'arcana-7': 'knight',
    'arcana-8': 'knight',
    'arcana-9': 'arcane',
    'arcana-10': 'rogue',
    'arcana-11': 'regal',
    'arcana-12': 'shadow',
    'arcana-13': 'shadow',
    'arcana-14': 'arcane',
    'arcana-15': 'shadow',
    'arcana-16': 'knight',
    'arcana-17': 'arcane',
    'arcana-18': 'shadow',
    'arcana-19': 'regal',
    'arcana-20': 'cleric',
    'arcana-21': 'regal'
};
const TAROT_MANIFEST_STYLE_LABELS = {
    rogue: '遍歴',
    arcane: '魔術',
    cleric: '聖祈',
    nature: '豊穣',
    knight: '征戦',
    shadow: '冥界',
    regal: '王権'
};
const TAROT_MANIFEST_TEMPLATE_GROUPS = {
    weapon_wand: { category: 'Weapon', regex: /^wand_\d+$/i, sortField: 'Power' },
    weapon_staff: { category: 'Weapon', regex: /^staff_\d+$/i, sortField: 'Power' },
    weapon_sword: { category: 'Weapon', regex: /^sword_\d+$/i, sortField: 'Power' },
    weapon_dagger: { category: 'Weapon', regex: /^dagger_\d+$/i, sortField: 'Power' },
    weapon_blunt: { category: 'Weapon', regex: /^blunt_\d+$/i, sortField: 'Power' },
    weapon_axe: { category: 'Weapon', regex: /^axe_\d+$/i, sortField: 'Power' },
    weapon_polearm: { category: 'Weapon', regex: /^polearm_\d+$/i, sortField: 'Power' },
    shield_guard: { category: 'Shield', regex: /^shield_\d+$/i, sortField: 'Defense' },
    offhand_tome: { category: 'Offhand', regex: /^offhand_tome_\d+$/i, sortField: 'MagicPower' },
    offhand_orb: { category: 'Offhand', regex: /^offhand_orb_\d+$/i, sortField: 'MagicPower' },
    offhand_catalyst: { category: 'Offhand', regex: /^offhand_catalyst_\d+$/i, sortField: 'MagicPower' },
    offhand_relic: { category: 'Offhand', regex: /^offhand_relic_\d+$/i, sortField: 'MagicPower' },
    armor_mage: {
        ids: ['hat_black_11', 'hat_black_12', 'hat_black_14', 'hat_black_16', 'hat_black_21', 'hat_black_23', 'hat_black_25'],
        sortField: 'Defense'
    },
    armor_priest: {
        ids: ['hat_black_12', 'hat_black_15', 'hat_black_16', 'hat_black_21'],
        sortField: 'Defense'
    },
    armor_rogue: {
        ids: ['hat_black_10', 'hat_black_13', 'hat_black_22', 'hat_black_24', 'hat_black_25', 'leather02_04'],
        sortField: 'Defense'
    },
    armor_royal: {
        ids: ['hat_black_15', 'hat_black_16', 'hat_black_18', 'metal_10'],
        sortField: 'Defense'
    },
    armor_knight: {
        ids: ['metal_04', 'metal_09', 'metal_13', 'metal_14', 'metal_15', 'metal_17', 'metal_18', 'metal_20'],
        sortField: 'Defense'
    },
    armor_dark: {
        ids: ['hat_black_24', 'hat_black_25', 'hat_black_26', 'leather02_04'],
        sortField: 'Defense'
    },
    armor_nature: {
        ids: ['hat_black_17', 'hat_black_18', 'hat_black_20', 'hat_black_27', 'hat_black_29', 'hat_black_30'],
        sortField: 'Defense'
    },
    accessory_mystic: { category: 'Accessory', regex: /^accessory_mystic_\d+$/i, sortField: 'Defense' },
    accessory_royal: { category: 'Accessory', regex: /^accessory_royal_\d+$/i, sortField: 'Defense' },
    accessory_shadow: { category: 'Accessory', regex: /^accessory_shadow_\d+$/i, sortField: 'Defense' },
    accessory_nature: { category: 'Accessory', regex: /^accessory_nature_\d+$/i, sortField: 'Defense' },
    accessory_tech: { category: 'Accessory', regex: /^accessory_tech_\d+$/i, sortField: 'Defense' }
};
const TAROT_MANIFEST_STYLE_RULES = {
    rogue: {
        Armor: { wand: 'armor_rogue', sword: 'armor_rogue', cup: 'armor_nature', pentacle: 'armor_rogue' },
        RightHand: { wand: 'weapon_wand', sword: 'weapon_dagger', cup: 'weapon_sword', pentacle: 'weapon_axe' },
        LeftHand: { wand: 'weapon_wand', sword: 'weapon_dagger', cup: 'shield_guard', pentacle: 'shield_guard' },
        Accessory: { wand: 'accessory_shadow', sword: 'accessory_shadow', cup: 'accessory_nature', pentacle: 'accessory_tech' }
    },
    arcane: {
        Armor: { wand: 'armor_mage', sword: 'armor_mage', cup: 'armor_priest', pentacle: 'armor_royal' },
        RightHand: { wand: 'weapon_staff', sword: 'weapon_sword', cup: 'weapon_staff', pentacle: 'weapon_blunt' },
        LeftHand: { wand: 'offhand_tome', sword: 'weapon_dagger', cup: 'offhand_orb', pentacle: 'offhand_catalyst' },
        Accessory: { wand: 'accessory_mystic', sword: 'accessory_mystic', cup: 'accessory_mystic', pentacle: 'accessory_royal' }
    },
    cleric: {
        Armor: { wand: 'armor_priest', sword: 'armor_royal', cup: 'armor_priest', pentacle: 'armor_royal' },
        RightHand: { wand: 'weapon_staff', sword: 'weapon_sword', cup: 'weapon_polearm', pentacle: 'weapon_blunt' },
        LeftHand: { wand: 'offhand_relic', sword: 'shield_guard', cup: 'offhand_relic', pentacle: 'offhand_catalyst' },
        Accessory: { wand: 'accessory_mystic', sword: 'accessory_royal', cup: 'accessory_mystic', pentacle: 'accessory_royal' }
    },
    nature: {
        Armor: { wand: 'armor_nature', sword: 'armor_rogue', cup: 'armor_nature', pentacle: 'armor_nature' },
        RightHand: { wand: 'weapon_staff', sword: 'weapon_sword', cup: 'weapon_polearm', pentacle: 'weapon_blunt' },
        LeftHand: { wand: 'offhand_tome', sword: 'shield_guard', cup: 'offhand_catalyst', pentacle: 'offhand_catalyst' },
        Accessory: { wand: 'accessory_nature', sword: 'accessory_nature', cup: 'accessory_nature', pentacle: 'accessory_nature' }
    },
    knight: {
        Armor: { wand: 'armor_knight', sword: 'armor_knight', cup: 'armor_knight', pentacle: 'armor_knight' },
        RightHand: { wand: 'weapon_staff', sword: 'weapon_sword', cup: 'weapon_polearm', pentacle: 'weapon_axe' },
        LeftHand: { wand: 'shield_guard', sword: 'shield_guard', cup: 'shield_guard', pentacle: 'shield_guard' },
        Accessory: { wand: 'accessory_royal', sword: 'accessory_royal', cup: 'accessory_royal', pentacle: 'accessory_tech' }
    },
    shadow: {
        Armor: { wand: 'armor_dark', sword: 'armor_dark', cup: 'armor_dark', pentacle: 'armor_dark' },
        RightHand: { wand: 'weapon_staff', sword: 'weapon_sword', cup: 'weapon_polearm', pentacle: 'weapon_axe' },
        LeftHand: { wand: 'offhand_orb', sword: 'weapon_dagger', cup: 'offhand_catalyst', pentacle: 'offhand_orb' },
        Accessory: { wand: 'accessory_shadow', sword: 'accessory_shadow', cup: 'accessory_shadow', pentacle: 'accessory_shadow' }
    },
    regal: {
        Armor: { wand: 'armor_royal', sword: 'armor_royal', cup: 'armor_royal', pentacle: 'armor_royal' },
        RightHand: { wand: 'weapon_staff', sword: 'weapon_sword', cup: 'weapon_polearm', pentacle: 'weapon_blunt' },
        LeftHand: { wand: 'offhand_relic', sword: 'shield_guard', cup: 'offhand_relic', pentacle: 'shield_guard' },
        Accessory: { wand: 'accessory_royal', sword: 'accessory_royal', cup: 'accessory_royal', pentacle: 'accessory_royal' }
    }
};
const TAROT_MANIFEST_TEMPLATE_CACHE = new WeakMap();

function normalizeCategory(category) {
    return String(category || '').trim();
}

function isTarotMajorCategory(category) {
    return TAROT_MAJOR_CATEGORIES.has(normalizeCategory(category));
}

function isTarotMinorCategory(category) {
    return TAROT_MINOR_CATEGORIES.has(normalizeCategory(category));
}

function isTarotCardCategory(category) {
    return isTarotMajorCategory(category) || isTarotMinorCategory(category);
}

function getCanonicalTarotCategory(category) {
    if (isTarotMajorCategory(category)) return 'TarotMajor';
    if (isTarotMinorCategory(category)) return 'TarotMinor';
    return normalizeCategory(category);
}

function isTarotEquipmentSlot(slot) {
    return !!TAROT_EQUIPMENT_SLOT_TO_KEY[String(slot || '').trim()];
}

function getTarotEquipmentReadOnlyKeys() {
    return Object.values(TAROT_EQUIPMENT_SLOT_TO_KEY);
}

function getTarotManifestationReadOnlyKeys() {
    return Object.values(TAROT_MANIFESTATION_SLOT_TO_KEY);
}

function getCanonicalManifestationSlot(slot) {
    const normalized = String(slot || '').trim();
    return TAROT_MINOR_SLOT_TO_MANIFESTATION_SLOT[normalized] || normalized;
}

function isTarotManifestationSlot(slot) {
    return TAROT_MANIFESTATION_SLOTS.includes(getCanonicalManifestationSlot(slot));
}

function getTarotSlotLabel(slot) {
    return TAROT_SLOT_LABELS[String(slot || '').trim()] || String(slot || '').trim();
}

function canEquipTarotItemToSlot(itemData, slot) {
    const category = getCanonicalTarotCategory(itemData?.Category);
    const normalizedSlot = String(slot || '').trim();
    if (normalizedSlot === TAROT_MAJOR_SLOT) return category === 'TarotMajor';
    if (TAROT_MINOR_SLOTS.includes(normalizedSlot)) return category === 'TarotMinor';
    return false;
}

function getEquipmentCategoryForSlot(slot) {
    const normalizedSlot = getCanonicalManifestationSlot(slot);
    if (normalizedSlot === 'RightHand') return 'Weapon';
    if (normalizedSlot === 'LeftHand') return 'Shield';
    if (normalizedSlot === 'Armor') return 'Armor';
    if (normalizedSlot === 'Accessory') return 'Accessory';
    if (slot === TAROT_MAJOR_SLOT) return 'TarotMajor';
    if (TAROT_MINOR_SLOTS.includes(slot)) return 'TarotMinor';
    return '';
}

function getStarterMajorArcanaItemId(nation) {
    const rawKey = String(nation || '').trim().toLowerCase();
    const key = NATION_KEY_ALIASES[rawKey] || rawKey;
    return NATION_STARTER_MAJOR_CARD_IDS[key] || null;
}

function normalizeSuitKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'wands') return 'wand';
    if (raw === 'swords') return 'sword';
    if (raw === 'cups') return 'cup';
    if (raw === 'pentacles') return 'pentacle';
    return raw;
}

function getMajorArcanaNumber(itemData) {
    const number = Number(itemData?.ArcanaNumber ?? itemData?.CardNumber);
    return Number.isFinite(number) ? number : null;
}

function getMajorArcanaSuitInfo(itemData) {
    const explicitSuit = normalizeSuitKey(itemData?.ArcanaSuit || itemData?.Suit);
    if (explicitSuit === 'all') {
        return { key: 'all', label: TAROT_SUIT_LABELS.all };
    }
    if (explicitSuit && explicitSuit !== 'none') {
        return {
            key: explicitSuit,
            label: TAROT_SUIT_LABELS[explicitSuit] || String(itemData?.ArcanaSuit || itemData?.Suit || '').trim()
        };
    }
    const number = getMajorArcanaNumber(itemData);
    if (TAROT_MAJOR_ALL_SUIT_NUMBERS.has(number)) {
        return { key: 'all', label: TAROT_SUIT_LABELS.all };
    }
    const specialSuit = TAROT_MAJOR_SPECIAL_SUIT[number];
    if (specialSuit) {
        return { key: specialSuit, label: TAROT_SUIT_LABELS[specialSuit] || specialSuit };
    }
    return { key: 'none', label: TAROT_SUIT_LABELS.none };
}

function getTarotSuitLabel(itemData) {
    if (getCanonicalTarotCategory(itemData?.Category) === 'TarotMajor') {
        return getMajorArcanaSuitInfo(itemData).label;
    }
    const suitKey = normalizeSuitKey(itemData?.ArcanaSuit || itemData?.Suit);
    return TAROT_SUIT_LABELS[suitKey] || String(itemData?.ArcanaSuit || itemData?.Suit || '').trim();
}

function getTarotRankLabel(itemData) {
    const raw = String(itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || '').trim();
    if (!raw) return '';
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return TAROT_ROMAN_NUMERALS[parsed] || String(parsed);
    return TAROT_FACE_LABELS[raw.toUpperCase()] || raw;
}

function getMajorArcanaTitle(itemData, fallbackName) {
    return String(
        fallbackName
        || itemData?.DisplayName
        || itemData?.ArcanaName
        || itemData?.RoleName
        || itemData?.ArcanaRole
        || '無銘'
    ).trim();
}

function getTarotRankValue(itemData) {
    const raw = String(itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || '').trim();
    if (!raw) return 1;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return Math.max(1, Math.min(10, parsed));
    const faceOrder = {
        PAGE: 11,
        KNIGHT: 12,
        QUEEN: 13,
        KING: 14
    };
    return faceOrder[raw.toUpperCase()] || 1;
}

function getTemplateFriendlyId(entry) {
    return String(entry?.FriendlyId || entry?.ItemId || '').trim();
}

function getTemplateDisplayName(entry) {
    return String(entry?.DisplayName || entry?.FriendlyId || entry?.ItemId || '').trim();
}

function getTemplateSortValue(entry, sortField) {
    if (!entry || typeof entry !== 'object') return 0;
    if (sortField === 'Power') return Number(entry.Power ?? entry.Atk ?? 0) || 0;
    if (sortField === 'MagicPower') return Number(entry.MagicPower ?? entry.Int ?? entry.Intelligence ?? 0) || 0;
    return Number(entry.Defense ?? entry.Def ?? 0) || 0;
}

function getTarotCatalogTemplateState(catalogCache) {
    if (!catalogCache || typeof catalogCache !== 'object') {
        return { entries: [], byFriendlyId: {}, groups: {} };
    }
    if (TAROT_MANIFEST_TEMPLATE_CACHE.has(catalogCache)) {
        return TAROT_MANIFEST_TEMPLATE_CACHE.get(catalogCache);
    }
    const uniqueEntries = [];
    const byFriendlyId = {};
    const seen = new Set();
    Object.values(catalogCache).forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const friendlyId = getTemplateFriendlyId(entry);
        if (!friendlyId || seen.has(friendlyId)) return;
        seen.add(friendlyId);
        uniqueEntries.push(entry);
        byFriendlyId[friendlyId] = entry;
    });
    const state = { entries: uniqueEntries, byFriendlyId, groups: {} };
    TAROT_MANIFEST_TEMPLATE_CACHE.set(catalogCache, state);
    return state;
}

function getTemplateGroupCandidates(catalogCache, groupId) {
    const state = getTarotCatalogTemplateState(catalogCache);
    if (state.groups[groupId]) return state.groups[groupId];
    const spec = TAROT_MANIFEST_TEMPLATE_GROUPS[groupId];
    if (!spec) {
        state.groups[groupId] = [];
        return state.groups[groupId];
    }
    let candidates = [];
    if (Array.isArray(spec.ids) && spec.ids.length > 0) {
        candidates = spec.ids
            .map((id) => state.byFriendlyId[String(id).trim()])
            .filter(Boolean);
    } else {
        candidates = state.entries.filter((entry) => {
            const friendlyId = getTemplateFriendlyId(entry);
            if (!friendlyId) return false;
            if (spec.category && normalizeCategory(entry.Category) !== spec.category) return false;
            if (spec.regex && !spec.regex.test(friendlyId)) return false;
            return true;
        });
    }
    candidates.sort((left, right) => {
        const diff = getTemplateSortValue(left, spec.sortField) - getTemplateSortValue(right, spec.sortField);
        if (diff !== 0) return diff;
        return getTemplateFriendlyId(left).localeCompare(getTemplateFriendlyId(right), 'ja');
    });
    state.groups[groupId] = candidates;
    return candidates;
}

function pickTemplateByRank(catalogCache, groupId, rankValue) {
    const candidates = getTemplateGroupCandidates(catalogCache, groupId);
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    const clampedRank = Math.max(1, Math.min(14, Number(rankValue) || 1));
    const ratio = clampedRank <= 10
        ? (((clampedRank - 1) / 9) * 0.85)
        : (0.85 + ((clampedRank - 10) / 4) * 0.15);
    const index = Math.max(0, Math.min(candidates.length - 1, Math.round(ratio * (candidates.length - 1))));
    return candidates[index] || candidates[candidates.length - 1];
}

function getManifestStyleId(majorItemId) {
    const key = String(majorItemId || '').trim();
    return TAROT_MANIFEST_STYLE_BY_MAJOR[key] || 'arcane';
}

function getManifestStyleLabel(styleId) {
    return TAROT_MANIFEST_STYLE_LABELS[String(styleId || '').trim()] || String(styleId || '').trim();
}

function getManifestTemplateGroupId(styleId, slot, suitKey) {
    const style = TAROT_MANIFEST_STYLE_RULES[String(styleId || '').trim()] || TAROT_MANIFEST_STYLE_RULES.arcane;
    const slotGroups = style?.[getCanonicalManifestationSlot(slot)] || {};
    return slotGroups?.[suitKey] || null;
}

function inferManifestWeaponTypeFromTemplate(templateEntry, slot, suitKey) {
    const friendlyId = getTemplateFriendlyId(templateEntry).toLowerCase();
    if (friendlyId.startsWith('wand_') || friendlyId.startsWith('staff_')) return 'staff';
    if (friendlyId.startsWith('sword_')) return 'sword';
    if (friendlyId.startsWith('dagger_')) return 'dagger';
    if (friendlyId.startsWith('shield_')) return 'shield';
    if (friendlyId.startsWith('axe_')) return 'axe';
    if (friendlyId.startsWith('blunt_')) return 'blunt';
    if (friendlyId.startsWith('polearm_')) return 'polearm';
    return TAROT_MANIFEST_WEAPON_TYPE_BY_SLOT_SUIT[getCanonicalManifestationSlot(slot)]?.[suitKey] || '';
}

function resolveTarotManifestationTemplate(slot, majorItemId, minorItemData, options = {}) {
    const catalogCache = options.catalogCache;
    const normalizedSlot = getCanonicalManifestationSlot(slot);
    const suitKey = normalizeSuitKey(minorItemData?.ArcanaSuit || minorItemData?.Suit);
    const styleId = getManifestStyleId(majorItemId);
    const groupId = getManifestTemplateGroupId(styleId, normalizedSlot, suitKey);
    const groupDefinition = groupId ? TAROT_MANIFEST_TEMPLATE_GROUPS[groupId] : null;
    const templateEntry = groupId ? pickTemplateByRank(catalogCache, groupId, getTarotRankValue(minorItemData)) : null;
    const templateCategory = normalizeCategory(templateEntry?.Category);
    const groupCategory = normalizeCategory(groupDefinition?.category);
    const isAccessoryProxy = normalizedSlot === 'Accessory' && !!templateEntry && templateCategory !== 'Accessory';
    return {
        styleId,
        styleLabel: getManifestStyleLabel(styleId),
        groupId,
        templateEntry,
        templateItemId: getTemplateFriendlyId(templateEntry),
        templateItemName: getTemplateDisplayName(templateEntry),
        templateCategory,
        isAccessoryProxy,
        resolvedCategory: isAccessoryProxy
            ? 'Accessory'
            : (templateCategory || groupCategory || TAROT_MANIFESTATION_CATEGORY_BY_SLOT[normalizedSlot] || 'Accessory'),
        weaponType: inferManifestWeaponTypeFromTemplate(templateEntry, normalizedSlot, suitKey)
    };
}

function parseStoredEquipmentValue(rawValue) {
    if (!rawValue || typeof rawValue !== 'string') return rawValue;
    const trimmed = rawValue.trim();
    if (!trimmed.startsWith('{')) return trimmed;
    try {
        const parsed = JSON.parse(trimmed);
        return parsed && typeof parsed === 'object' ? parsed : trimmed;
    } catch {
        return trimmed;
    }
}

function isTarotManifestationEntry(value) {
    return !!(value && typeof value === 'object' && value.kind === 'tarot_manifestation' && value.customData?.Manifested);
}

function buildTarotManifestationName(slot, majorItemData, minorItemData, options = {}) {
    const normalizedSlot = getCanonicalManifestationSlot(slot);
    const suitKey = normalizeSuitKey(minorItemData?.ArcanaSuit || minorItemData?.Suit);
    const baseName = TAROT_MANIFESTATION_BASES[normalizedSlot]?.[suitKey] || getTarotSlotLabel(normalizedSlot);
    const majorTitle = getMajorArcanaTitle(majorItemData, options.majorName);
    const rankLabel = getTarotRankLabel(minorItemData);
    const titleCore = `${baseName}${rankLabel ? ` ${rankLabel}` : ''}`;
    return majorTitle ? `${majorTitle}の${titleCore}` : titleCore;
}

function buildTarotManifestationEntry(slot, majorItem, minorItem, options = {}) {
    const normalizedSlot = getCanonicalManifestationSlot(slot);
    const majorData = majorItem?.customData || majorItem || {};
    const minorData = minorItem?.customData || minorItem || {};
    const suitKey = normalizeSuitKey(minorData?.ArcanaSuit || minorData?.Suit);
    const suitLabel = getTarotSuitLabel(minorData);
    const rankLabel = getTarotRankLabel(minorData);
    const majorItemId = String(options.majorItemId || majorItem?.itemId || majorData?.FriendlyId || majorData?.ItemId || '').trim();
    const majorName = getMajorArcanaTitle(majorData, options.majorName || majorItem?.name);
    const majorNumber = getMajorArcanaNumber(majorData);
    const majorSuitInfo = getMajorArcanaSuitInfo(majorData);
    const sourceCardName = String(options.sourceCardName || minorItem?.name || minorData?.DisplayName || '').trim();
    const template = resolveTarotManifestationTemplate(normalizedSlot, majorItemId, minorData, options);
    const templateData = template.templateEntry || null;
    const category = template.resolvedCategory || TAROT_MANIFESTATION_CATEGORY_BY_SLOT[normalizedSlot] || 'Accessory';
    const templateName = template.templateItemName;
    const name = templateName || buildTarotManifestationName(normalizedSlot, majorData, minorData, {
        majorName
    });
    const manifestWeaponType = template.weaponType || TAROT_MANIFEST_WEAPON_TYPE_BY_SLOT_SUIT[normalizedSlot]?.[suitKey] || '';
    const useTemplateStats = !!templateData;
    const power = useTemplateStats
        ? (Number(templateData?.Power ?? templateData?.Atk ?? 0) || 0)
        : (Number(minorData?.Power ?? minorData?.Atk ?? 0) || 0);
    const defense = useTemplateStats
        ? (Number(templateData?.Defense ?? templateData?.Def ?? 0) || 0)
        : (Number(minorData?.Defense ?? minorData?.Def ?? 0) || 0);
    const agility = useTemplateStats
        ? (Number(templateData?.Agi ?? templateData?.Speed ?? 0) || 0)
        : (Number(minorData?.Agi ?? minorData?.Speed ?? 0) || 0);
    const intelligence = useTemplateStats
        ? (Number(templateData?.Int ?? templateData?.Intelligence ?? 0) || 0)
        : (Number(minorData?.Int ?? minorData?.Intelligence ?? 0) || 0);
    const magicPower = useTemplateStats
        ? (Number(templateData?.MagicPower ?? 0) || 0)
        : (Number(minorData?.MagicPower ?? 0) || 0);
    const healPower = useTemplateStats
        ? (Number(templateData?.HealPower ?? 0) || 0)
        : (Number(minorData?.HealPower ?? 0) || 0);
    const mpEfficiency = useTemplateStats
        ? (Number(templateData?.MpEfficiency ?? 0) || 0)
        : (Number(minorData?.MpEfficiency ?? 0) || 0);
    const castRate = useTemplateStats
        ? (Number(templateData?.CastRate ?? 0) || 0)
        : (Number(minorData?.CastRate ?? 0) || 0);
    const statusRate = useTemplateStats
        ? (Number(templateData?.StatusRate ?? 0) || 0)
        : (Number(minorData?.StatusRate ?? 0) || 0);
    const templateItemId = template.templateItemId || getTemplateFriendlyId(templateData);
    const rawSpritePath = String(templateData?.sprite_path || minorData?.sprite_path || '').trim();
    const spriteIndex = Number(templateData?.sprite_index ?? minorData?.sprite_index ?? 0) || 0;
    const normalizedSpriteFrame = normalizeManifestSpriteFrame(
        templateItemId,
        rawSpritePath,
        Number(templateData?.sprite_w ?? minorData?.sprite_w ?? 32) || 32,
        Number(templateData?.sprite_h ?? minorData?.sprite_h ?? 32) || 32,
        Number(templateData?.sprite_cols ?? minorData?.sprite_cols ?? 0) || 0
    );
    const spritePath = normalizedSpriteFrame.path;
    const spriteWidth = normalizedSpriteFrame.width;
    const spriteHeight = normalizedSpriteFrame.height;
    const spriteColumns = normalizedSpriteFrame.cols;
    const manifestedAt = String(options.manifestedAt || new Date().toISOString());
    const manifestedByName = String(options.manifestedByName || '').trim();
    const description = templateName
        ? `${sourceCardName || '小アルカナ'}が具現化した${getTarotSlotLabel(normalizedSlot)}装備「${templateName}」。`
        : `${sourceCardName || '小アルカナ'}が具現化した${getTarotSlotLabel(normalizedSlot)}装備。`;
    return {
        kind: 'tarot_manifestation',
        slot: normalizedSlot,
        slotLabel: getTarotSlotLabel(normalizedSlot),
        name,
        description,
        sourceCardId: String(options.sourceCardId || minorItem?.itemId || minorData?.ItemId || '').trim(),
        sourceCardName,
        majorArcanaId: majorItemId,
        majorArcanaName: majorName,
        majorArcanaNumber: majorNumber,
        majorArcanaSuit: majorSuitInfo.key,
        majorArcanaSuitLabel: majorSuitInfo.label,
        manifestedByPlayFabId: String(options.manifestedByPlayFabId || '').trim(),
        manifestedByName,
        manifestedAt,
        manifestedItemId: template.templateItemId,
        manifestedItemName: templateName,
        manifestedItemCategory: template.templateCategory,
        manifestedStyle: template.styleId,
        manifestedStyleLabel: template.styleLabel,
        customData: {
            Manifested: true,
            Category: category,
            ManifestedSlot: normalizedSlot,
            ManifestedSlotLabel: getTarotSlotLabel(normalizedSlot),
            ManifestedBy: manifestedByName,
            ManifestedByPlayFabId: String(options.manifestedByPlayFabId || '').trim(),
            ManifestedAt: manifestedAt,
            SourceCardId: String(options.sourceCardId || minorItem?.itemId || minorData?.ItemId || '').trim(),
            SourceCardName: sourceCardName,
            MajorArcanaId: majorItemId,
            MajorArcanaName: majorName,
            MajorArcanaNumber: majorNumber,
            MajorArcanaSuit: majorSuitInfo.key,
            MajorArcanaSuitLabel: majorSuitInfo.label,
            ArcanaSuit: String(minorData?.ArcanaSuit || minorData?.Suit || '').trim(),
            ArcanaSuitLabel: suitLabel,
            ArcanaRank: String(minorData?.ArcanaRank || minorData?.Rank || minorData?.CardRank || minorData?.CardNumber || '').trim(),
            ArcanaRankLabel: rankLabel,
            ManifestStyle: template.styleId,
            ManifestStyleLabel: template.styleLabel,
            ManifestTemplateGroup: template.groupId || '',
            ManifestedItemId: template.templateItemId,
            ManifestedItemName: templateName,
            ManifestedItemCategory: template.templateCategory,
            ManifestedItemIsProxy: template.isAccessoryProxy,
            ManifestWeaponType: manifestWeaponType,
            sprite_path: spritePath,
            sprite_index: spriteIndex,
            sprite_w: spriteWidth,
            sprite_h: spriteHeight,
            sprite_cols: spriteColumns,
            Power: power,
            Defense: defense,
            Agi: agility,
            Int: intelligence,
            MagicPower: magicPower,
            HealPower: healPower,
            MpEfficiency: mpEfficiency,
            CastRate: castRate,
            StatusRate: statusRate
        }
    };
}

function applyTarotManifestationNaming(manifestation, options = {}) {
    if (!manifestation || typeof manifestation !== 'object') return manifestation;
    const next = {
        ...manifestation,
        customData: {
            ...(manifestation.customData || {})
        }
    };
    const customName = String(options.customName || '').trim();
    const hasCustomName = !!customName;
    const slot = getCanonicalManifestationSlot(next.slot || next.customData?.ManifestedSlot || '');
    const slotLabel = String(next.slotLabel || next.customData?.ManifestedSlotLabel || getTarotSlotLabel(slot)).trim() || getTarotSlotLabel(slot);
    const sourceCardName = String(next.sourceCardName || next.customData?.SourceCardName || '小アルカナ').trim() || '小アルカナ';
    const templateName = String(next.manifestedItemName || next.customData?.ManifestedItemName || next.name || '').trim();
    const displayName = hasCustomName ? customName : (templateName || next.name || slotLabel);

    next.name = displayName;
    next.description = hasCustomName
        ? `${sourceCardName}が具現化した${slotLabel}装備「${displayName}」。`
        : `${sourceCardName}が具現化した${slotLabel}装備「${templateName || displayName}」。`;
    next.customData.CustomName = customName;
    next.customData.DisplayName = displayName;
    next.customData.NameMode = hasCustomName ? 'custom' : 'template';
    next.customData.NameFinalized = true;
    return next;
}

module.exports = {
    TAROT_MAJOR_CATEGORIES,
    TAROT_MINOR_CATEGORIES,
    TAROT_MAJOR_SLOT,
    TAROT_MINOR_SLOTS,
    TAROT_MINOR_SLOT_TO_MANIFESTATION_SLOT,
    TAROT_MANIFESTATION_SLOTS,
    TAROT_MANIFESTATION_SLOT_TO_KEY,
    TAROT_EQUIPMENT_SLOT_TO_KEY,
    NATION_STARTER_MAJOR_CARD_IDS,
    normalizeCategory,
    isTarotMajorCategory,
    isTarotMinorCategory,
    isTarotCardCategory,
    getCanonicalTarotCategory,
    isTarotEquipmentSlot,
    getTarotEquipmentReadOnlyKeys,
    getTarotManifestationReadOnlyKeys,
    getCanonicalManifestationSlot,
    isTarotManifestationSlot,
    getTarotSlotLabel,
    canEquipTarotItemToSlot,
    getEquipmentCategoryForSlot,
    getStarterMajorArcanaItemId,
    getMajorArcanaSuitInfo,
    getTarotSuitLabel,
    getTarotRankLabel,
    getMajorArcanaTitle,
    parseStoredEquipmentValue,
    isTarotManifestationEntry,
    buildTarotManifestationName,
    buildTarotManifestationEntry,
    applyTarotManifestationNaming
};
