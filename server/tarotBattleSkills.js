const tarotSkillData = require('./data/tarot-battle-skills.json');
const { getCanonicalTarotCategory, getMajorArcanaSuitInfo } = require('./tarotCards');

const MINOR_SUIT_ALIASES = {
    wand: 'wand',
    wands: 'wand',
    fire: 'wand',
    sword: 'sword',
    swords: 'sword',
    wind: 'sword',
    cup: 'cup',
    cups: 'cup',
    water: 'cup',
    pentacle: 'pentacle',
    pentacles: 'pentacle',
    coin: 'pentacle',
    coins: 'pentacle',
    earth: 'pentacle'
};

const ELEMENT_ALIASES = {
    fire: 'fire',
    '火': 'fire',
    water: 'water',
    '水': 'water',
    wind: 'wind',
    '風': 'wind',
    earth: 'earth',
    '地': 'earth',
    none: 'none',
    neutral: 'none',
    '無': 'none',
    '無属性': 'none',
    all: 'all',
    '全属性': 'all'
};

const FACE_ORDER = {
    A: 1,
    ACE: 1,
    PAGE: 11,
    KNIGHT: 12,
    QUEEN: 13,
    KING: 14
};

function normalizeMinorSuit(value) {
    const raw = String(value || '').trim().toLowerCase();
    return MINOR_SUIT_ALIASES[raw] || raw;
}

function normalizeElementKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    return ELEMENT_ALIASES[raw] || ELEMENT_ALIASES[String(value || '').trim()] || raw || 'none';
}

function parseRankNumber(value) {
    const raw = String(value || '').trim();
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
    return FACE_ORDER[raw.toUpperCase()] || null;
}

function jsonCardIdToItemId(cardId) {
    const id = String(cardId || '').trim();
    const major = id.match(/^MAJOR_(\d+)$/i);
    if (major) return `arcana-${Number(major[1])}`;
    const minor = id.match(/^(WAND|SWORD|CUP|PENTACLE)_(\d+)$/i);
    if (minor) return `minor-${minor[1].toLowerCase()}-${Number(minor[2])}`;
    return id;
}

function normalizeItemIdToSkillKey(itemId) {
    const id = String(itemId || '').trim();
    if (!id) return '';
    const major = id.match(/^MAJOR_(\d+)$/i);
    if (major) return `arcana-${Number(major[1])}`;
    const arcana = id.match(/^arcana-(\d+)$/i);
    if (arcana) return `arcana-${Number(arcana[1])}`;
    const legacyMajor = id.match(/^tarot[_-]major[_-][a-z]+[_-](\d+)$/i);
    if (legacyMajor) return `arcana-${Number(legacyMajor[1])}`;

    const minor = id.match(/^(WAND|SWORD|CUP|PENTACLE)_(\d+)$/i);
    if (minor) return `minor-${minor[1].toLowerCase()}-${Number(minor[2])}`;
    const modernMinor = id.match(/^minor-(wand|sword|cup|pentacle)-(\d+)$/i);
    if (modernMinor) return `minor-${modernMinor[1].toLowerCase()}-${Number(modernMinor[2])}`;
    const legacyMinor = id.match(/^tarot[_-]minor[_-](wand|sword|cup|pentacle)[_-](\d+)$/i);
    if (legacyMinor) return `minor-${legacyMinor[1].toLowerCase()}-${Number(legacyMinor[2])}`;
    return id;
}

function itemDataToSkillKey(itemData) {
    if (!itemData || typeof itemData !== 'object') return '';
    const category = getCanonicalTarotCategory(itemData.Category);
    if (category === 'TarotMajor') {
        const number = Number(itemData.ArcanaNumber ?? itemData.CardNumber);
        return Number.isFinite(number) ? `arcana-${number}` : '';
    }
    if (category === 'TarotMinor') {
        const suit = normalizeMinorSuit(itemData.ArcanaSuit || itemData.Suit);
        const rank = parseRankNumber(itemData.ArcanaRank || itemData.Rank || itemData.CardRank || itemData.CardNumber);
        return suit && rank ? `minor-${suit}-${rank}` : '';
    }
    return '';
}

function parseSuccessRate(value) {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    const match = raw.match(/(\d+(?:\.\d+)?)/);
    if (!match) return 0;
    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(1, parsed / 100));
}

function buildSkill(raw) {
    const itemId = normalizeItemIdToSkillKey(raw.itemId || jsonCardIdToItemId(raw.cardId));
    const elementKey = normalizeElementKey(raw.element);
    return {
        ...raw,
        itemId,
        elementKey,
        successRateValue: parseSuccessRate(raw.successRate),
        cooldown: Math.max(0, Math.floor(Number(raw.cooldown) || 0))
    };
}

const TAROT_BATTLE_SKILLS = (Array.isArray(tarotSkillData.cards) ? tarotSkillData.cards : []).map(buildSkill);
const SKILL_BY_ITEM_ID = new Map();
const SKILL_BY_CARD_ID = new Map();

TAROT_BATTLE_SKILLS.forEach((skill) => {
    if (skill.itemId) SKILL_BY_ITEM_ID.set(skill.itemId, skill);
    if (skill.cardId) SKILL_BY_CARD_ID.set(String(skill.cardId).toUpperCase(), skill);
});

function resolveTarotBattleSkill(itemId, itemData = null) {
    const directKey = normalizeItemIdToSkillKey(itemId);
    const itemDataKey = itemDataToSkillKey(itemData);
    const skill = SKILL_BY_ITEM_ID.get(directKey)
        || SKILL_BY_ITEM_ID.get(itemDataKey)
        || SKILL_BY_CARD_ID.get(String(itemId || '').trim().toUpperCase());
    if (!skill) return null;
    return {
        ...skill,
        itemId: directKey || skill.itemId,
        displayName: String(itemData?.DisplayName || itemData?.ArcanaName || skill.cardName || '').trim() || skill.cardName
    };
}

function getTarotBattleDeck(deckIds, catalogCache = {}) {
    return (Array.isArray(deckIds) ? deckIds : [])
        .filter((itemId) => getCanonicalTarotCategory(catalogCache?.[itemId]?.Category) === 'TarotMinor')
        .map((itemId) => resolveTarotBattleSkill(itemId, catalogCache?.[itemId] || null))
        .filter(Boolean);
}

function getElementForTarotRoleSuit(suit) {
    const key = String(suit || '').trim();
    if (key === 'Wand') return 'fire';
    if (key === 'Sword') return 'wind';
    if (key === 'Cup') return 'water';
    if (key === 'Pentacle') return 'earth';
    if (key === 'All') return 'all';
    return 'none';
}

function getMajorArcanaElement(itemData) {
    const suitInfo = getMajorArcanaSuitInfo(itemData);
    return getElementForTarotRoleSuit(suitInfo?.value || suitInfo?.suit || '');
}

function publicTarotBattleSkill(skill) {
    if (!skill || typeof skill !== 'object') return null;
    return {
        cardId: String(skill.cardId || ''),
        itemId: String(skill.itemId || ''),
        classification: String(skill.classification || ''),
        number: Number.isFinite(Number(skill.number)) ? Number(skill.number) : null,
        cardName: String(skill.cardName || ''),
        suit: String(skill.suit || ''),
        element: String(skill.element || ''),
        elementKey: String(skill.elementKey || 'none'),
        skillName: String(skill.skillName || ''),
        target: String(skill.target || ''),
        effectClass: String(skill.effectClass || ''),
        description: String(skill.description || ''),
        damageTier: String(skill.damageTier || ''),
        healTier: String(skill.healTier || ''),
        special: String(skill.special || ''),
        status: String(skill.status || ''),
        successRate: String(skill.successRate || ''),
        successRateValue: Number(skill.successRateValue || 0) || 0,
        cooldown: Math.max(0, Math.floor(Number(skill.cooldown) || 0)),
        notes: String(skill.notes || '')
    };
}

function getPublicTarotBattleSkills() {
    return TAROT_BATTLE_SKILLS
        .map(publicTarotBattleSkill)
        .filter(Boolean);
}

module.exports = {
    TAROT_BATTLE_SKILLS,
    jsonCardIdToItemId,
    normalizeItemIdToSkillKey,
    normalizeElementKey,
    parseSuccessRate,
    resolveTarotBattleSkill,
    getTarotBattleDeck,
    getElementForTarotRoleSuit,
    getMajorArcanaElement,
    publicTarotBattleSkill,
    getPublicTarotBattleSkills
};
