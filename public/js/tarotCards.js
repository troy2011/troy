export const TAROT_MAJOR_CATEGORY_ALIASES = ['TarotMajor', 'MajorArcana', 'TarotArcanaMajor'];
export const TAROT_MINOR_CATEGORY_ALIASES = ['TarotMinor', 'MinorArcana', 'TarotArcanaMinor'];
export const TAROT_MAJOR_SLOT = 'MajorArcana';
export const TAROT_MINOR_SLOTS = ['Armor', 'RightHand', 'LeftHand', 'Accessory'];
const TAROT_CARD_SPRITE = {
    path: './Sprites/Buildings/tarot.png',
    width: 48,
    height: 80,
    cols: 10
};
const TAROT_MINOR_SLOT_ALIASES = {
    MinorArcana1: 'Armor',
    MinorArcana2: 'RightHand',
    MinorArcana3: 'LeftHand',
    MinorArcana4: 'Accessory'
};
export const TAROT_SLOT_LABELS = {
    MajorArcana: '大アルカナ',
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
const TAROT_SHORT_FACE_LABELS = {
    PAGE: 'P',
    KNIGHT: 'N',
    QUEEN: 'Q',
    KING: 'K'
};
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
    16: 'sword',
    17: 'cup',
    18: 'pentacle',
    19: 'wand'
};
const TAROT_MAJOR_ALL_SUIT_NUMBERS = new Set([1]);
const TAROT_MINOR_SPRITE_BASE = {
    wand: 0,
    pentacle: 20,
    cup: 40,
    sword: 60
};

export function getCanonicalTarotCategory(category) {
    const value = String(category || '').trim();
    if (TAROT_MAJOR_CATEGORY_ALIASES.includes(value)) return 'TarotMajor';
    if (TAROT_MINOR_CATEGORY_ALIASES.includes(value)) return 'TarotMinor';
    return value;
}

export function isTarotMajorCategory(category) {
    return getCanonicalTarotCategory(category) === 'TarotMajor';
}

export function isTarotMinorCategory(category) {
    return getCanonicalTarotCategory(category) === 'TarotMinor';
}

export function isTarotManifestationData(itemData) {
    return false;
}

export function matchesInventoryCategory(category, filterCategory) {
    if (filterCategory === 'All') return true;
    return getCanonicalTarotCategory(category) === filterCategory;
}

function normalizeRankValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
    return raw.toUpperCase();
}

function getMinorSuitOrder(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'wand' || normalized === 'wands') return 1;
    if (normalized === 'sword' || normalized === 'swords') return 2;
    if (normalized === 'cup' || normalized === 'cups') return 3;
    if (normalized === 'pentacle' || normalized === 'pentacles') return 4;
    return 99;
}

function getMinorRankOrder(value) {
    const normalized = normalizeRankValue(value);
    if (typeof normalized === 'number') return normalized;
    const faceOrder = {
        PAGE: 11,
        KNIGHT: 12,
        QUEEN: 13,
        KING: 14
    };
    return faceOrder[normalized] || 99;
}

export function compareTarotItems(a, b) {
    const left = a?.customData || {};
    const right = b?.customData || {};
    const leftCategory = getCanonicalTarotCategory(left.Category);
    const rightCategory = getCanonicalTarotCategory(right.Category);
    if (leftCategory === 'TarotMajor' && rightCategory === 'TarotMajor') {
        const leftNumber = Number(left.ArcanaNumber ?? left.CardNumber ?? 999);
        const rightNumber = Number(right.ArcanaNumber ?? right.CardNumber ?? 999);
        if (leftNumber !== rightNumber) return leftNumber - rightNumber;
    }
    if (leftCategory === 'TarotMinor' && rightCategory === 'TarotMinor') {
        const suitDiff = getMinorSuitOrder(left.ArcanaSuit ?? left.Suit) - getMinorSuitOrder(right.ArcanaSuit ?? right.Suit);
        if (suitDiff !== 0) return suitDiff;
        const rankDiff = getMinorRankOrder(left.ArcanaRank ?? left.Rank ?? left.CardRank ?? left.CardNumber) - getMinorRankOrder(right.ArcanaRank ?? right.Rank ?? right.CardRank ?? right.CardNumber);
        if (rankDiff !== 0) return rankDiff;
    }
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'ja');
}

export function getTarotSlotLabel(slot) {
    const normalized = TAROT_MINOR_SLOT_ALIASES[String(slot || '').trim()] || String(slot || '').trim();
    return TAROT_SLOT_LABELS[normalized] || TAROT_SLOT_LABELS[String(slot || '').trim()] || String(slot || '').trim();
}

export function buildTarotCardMeta(itemData) {
    const category = getCanonicalTarotCategory(itemData?.Category);
    if (category !== 'TarotMajor' && category !== 'TarotMinor') return [];
    const lines = [];
    if (category === 'TarotMajor') {
        const roleName = String(itemData?.ArcanaRole || itemData?.RoleName || '').trim();
        const number = String(itemData?.ArcanaNumber ?? itemData?.CardNumber ?? '').trim();
        if (number) lines.push(`大アルカナ ${number}`);
        lines.push(`宿り: ${getTarotSuitLabel(itemData)}`);
        lines.push(`系統: ${roleName || 'ロールコア'}`);
    } else if (category === 'TarotMinor') {
        const suit = String(itemData?.ArcanaSuit || itemData?.Suit || '').trim();
        const rank = String(itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || '').trim();
        if (suit || rank) {
            lines.push(`小アルカナ: ${[suit, rank].filter(Boolean).join(' ')}`.trim());
        }
        const skillType = String(itemData?.ArcanaSkillType || itemData?.SkillType || '').trim();
        lines.push(`系統: ${skillType || 'スキルカード'}`);
    }
    const passive = String(itemData?.PassiveName || itemData?.ArcanaPassive || '').trim();
    if (passive) lines.push(`固有: ${passive}`);
    const keyword = String(itemData?.ArcanaKeyword || itemData?.SkillKeyword || '').trim();
    if (keyword) lines.push(`キーワード: ${keyword}`);
    return lines.filter(Boolean);
}

function getSuitKey(itemData) {
    const raw = String(itemData?.ArcanaSuit || itemData?.Suit || '').trim().toLowerCase();
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

export function getMajorArcanaSuitInfo(itemData) {
    const number = getMajorArcanaNumber(itemData);
    if (TAROT_MAJOR_ALL_SUIT_NUMBERS.has(number)) {
        return { key: 'all', label: TAROT_SUIT_LABELS.all };
    }
    const specialSuit = TAROT_MAJOR_SPECIAL_SUIT[number];
    if (specialSuit) {
        return { key: specialSuit, label: TAROT_SUIT_LABELS[specialSuit] || specialSuit };
    }
    if (number !== null) {
        return { key: 'none', label: TAROT_SUIT_LABELS.none };
    }
    const explicitSuit = getSuitKey(itemData);
    if (explicitSuit === 'all') {
        return { key: 'all', label: TAROT_SUIT_LABELS.all };
    }
    if (explicitSuit && explicitSuit !== 'none') {
        return {
            key: explicitSuit,
            label: TAROT_SUIT_LABELS[explicitSuit] || String(itemData?.ArcanaSuit || itemData?.Suit || '').trim()
        };
    }
    return { key: 'none', label: TAROT_SUIT_LABELS.none };
}

function getRankNumber(itemData) {
    const raw = String(itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || '').trim();
    if (!raw) return null;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
    const faceOrder = {
        PAGE: 11,
        P: 11,
        'ペイジ': 11,
        KNIGHT: 12,
        N: 12,
        'ナイト': 12,
        QUEEN: 13,
        Q: 13,
        'クイーン': 13,
        KING: 14,
        K: 14,
        'キング': 14
    };
    return faceOrder[raw.toUpperCase()] || faceOrder[raw] || null;
}

export function getTarotRankNumber(itemData) {
    return getRankNumber(itemData);
}

function getMinorSpriteIndex(itemData) {
    const suitKey = getSuitKey(itemData);
    const rankNumber = getRankNumber(itemData);
    if (!suitKey || !rankNumber || !(suitKey in TAROT_MINOR_SPRITE_BASE)) return null;
    if (rankNumber <= 10) return TAROT_MINOR_SPRITE_BASE[suitKey] + (rankNumber - 1);
    return TAROT_MINOR_SPRITE_BASE[suitKey] + 10 + (rankNumber - 11);
}

export function getTarotSuitLabel(itemData) {
    if (getCanonicalTarotCategory(itemData?.Category) === 'TarotMajor') {
        return getMajorArcanaSuitInfo(itemData).label;
    }
    const suitKey = getSuitKey(itemData);
    return TAROT_SUIT_LABELS[suitKey] || String(itemData?.ArcanaSuit || itemData?.Suit || '').trim();
}

export function getTarotRankLabel(itemData) {
    const raw = String(itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || '').trim();
    if (!raw) return '';
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return TAROT_ROMAN_NUMERALS[parsed] || String(parsed);
    return TAROT_FACE_LABELS[raw.toUpperCase()] || raw;
}

export function getTarotNumberBadge(itemData) {
    const category = getCanonicalTarotCategory(itemData?.Category);
    if (category === 'TarotMajor') {
        const number = getMajorArcanaNumber(itemData);
        return number == null ? '' : String(number);
    }
    const raw = String(itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || '').trim();
    if (!raw) return '';
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed === 1 ? 'A' : String(parsed);
    return TAROT_SHORT_FACE_LABELS[raw.toUpperCase()] || raw;
}

function toEvaluatorSuitValue(suitKey) {
    if (suitKey === 'wand') return 'Wand';
    if (suitKey === 'sword') return 'Sword';
    if (suitKey === 'cup') return 'Cup';
    if (suitKey === 'pentacle') return 'Pentacle';
    if (suitKey === 'all') return 'All';
    return 'None';
}

function buildTarotRoleCard(itemData, categoryOverride = '') {
    const category = categoryOverride || getCanonicalTarotCategory(itemData?.Category);
    if (category === 'TarotMajor') {
        const number = getMajorArcanaNumber(itemData);
        if (number == null) return null;
        const suitInfo = getMajorArcanaSuitInfo(itemData);
        return {
            kind: 'major',
            number,
            suit: toEvaluatorSuitValue(suitInfo.key),
            name: String(itemData?.ArcanaName || itemData?.DisplayName || '').trim()
        };
    }
    if (category === 'TarotMinor') {
        const number = getRankNumber(itemData);
        const suitKey = getSuitKey(itemData);
        if (!number || !suitKey) return null;
        return {
            kind: 'minor',
            number,
            suit: toEvaluatorSuitValue(suitKey),
            name: String(itemData?.DisplayName || '').trim()
        };
    }
    return null;
}

export function getMajorArcanaTitle(item) {
    const itemData = item?.customData || item || {};
    return String(item?.name || itemData?.ArcanaName || itemData?.RoleName || itemData?.ArcanaRole || '無銘').trim();
}

export function getTarotSpriteFrame(item) {
    const itemData = item?.customData || item || {};
    const category = getCanonicalTarotCategory(itemData?.Category);
    if (category === 'TarotMajor' || category === 'TarotMinor') {
        const fallbackIndex = category === 'TarotMinor' ? getMinorSpriteIndex(itemData) : null;
        return {
            path: String(itemData?.sprite_path || TAROT_CARD_SPRITE.path).trim() || TAROT_CARD_SPRITE.path,
            index: Number(itemData?.sprite_index ?? fallbackIndex ?? 0) || 0,
            width: Number(itemData?.sprite_w ?? TAROT_CARD_SPRITE.width) || TAROT_CARD_SPRITE.width,
            height: Number(itemData?.sprite_h ?? TAROT_CARD_SPRITE.height) || TAROT_CARD_SPRITE.height,
            cols: Number(itemData?.sprite_cols ?? TAROT_CARD_SPRITE.cols) || TAROT_CARD_SPRITE.cols
        };
    }
    return null;
}

export function buildTarotLoadoutEntry(slot, item) {
    const normalizedSlot = TAROT_MINOR_SLOT_ALIASES[String(slot || '').trim()] || String(slot || '').trim();
    const slotLabel = getTarotSlotLabel(normalizedSlot);
    const itemData = item?.customData || item || {};
    if (normalizedSlot === TAROT_MAJOR_SLOT) {
        if (!itemData || !isTarotMajorCategory(itemData.Category)) {
            return {
                slot: normalizedSlot,
                slotLabel,
                title: '未装着',
                detail: '大アルカナカードを選んでください。',
                sprite: null,
                isEmpty: true,
                suitKey: 'none',
                suitLabel: '未設定',
                numberLabel: '',
                isArcana: true
            };
        }
        const roleName = String(itemData?.ArcanaRole || itemData?.RoleName || '').trim();
        const suitInfo = getMajorArcanaSuitInfo(itemData);
        return {
            slot: normalizedSlot,
            slotLabel,
            title: getMajorArcanaTitle(item),
            detail: [suitInfo.label, roleName].filter(Boolean).join(' / ') || '大アルカナ',
            sprite: getTarotSpriteFrame(item),
            isEmpty: false,
            suitKey: suitInfo.key,
            suitLabel: suitInfo.label,
            numberLabel: getTarotNumberBadge(itemData),
            isArcana: true,
            roleCard: buildTarotRoleCard(itemData, 'TarotMajor')
        };
    }
    if (item) {
        return {
            slot: normalizedSlot,
            slotLabel,
            title: '札なし',
            detail: '通常装備が入っています。',
            sprite: null,
            isEmpty: true,
            suitKey: 'none',
            suitLabel: '札なし',
            numberLabel: '',
            isArcana: false,
            roleCard: null
        };
    }
    return {
        slot: normalizedSlot,
        slotLabel,
        title: '札なし',
        detail: 'カードが設定されていません。',
        sprite: null,
        isEmpty: true,
        suitKey: 'none',
        suitLabel: '札なし',
        numberLabel: '',
        isArcana: false,
        roleCard: null
    };
}
