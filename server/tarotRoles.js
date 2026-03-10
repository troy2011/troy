const {
    getCanonicalTarotCategory,
    getMajorArcanaSuitInfo,
    isTarotManifestationEntry
} = require('./tarotCards');

const TAROT_ROLE_ORDER = [
    'OnePair',
    'TwoPair',
    'ThreeKind',
    'Straight',
    'Flush',
    'FullHouse',
    'FourKind',
    'StraightFlush',
    'FiveKind'
];

const TAROT_ROLE_LABEL = {
    OnePair: 'ワンペア',
    TwoPair: 'ツーペア',
    ThreeKind: 'スリーカード',
    Straight: 'ストレート',
    Flush: 'フラッシュ',
    FullHouse: 'フルハウス',
    FourKind: 'フォーカード',
    StraightFlush: 'ストレートフラッシュ',
    FiveKind: 'ファイブカード'
};

const TAROT_ROLE_STRENGTH = TAROT_ROLE_ORDER.reduce((acc, key, index) => {
    acc[key] = index + 1;
    return acc;
}, {});

const SUITS = ['Wand', 'Cup', 'Sword', 'Pentacle'];
const TAROT_ROLE_BONUS_TABLE = {
    OnePair: { Power: 1, Defense: 1 },
    TwoPair: { Power: 1, Defense: 1, Agi: 1, Int: 1 },
    ThreeKind: { Power: 3 },
    Straight: { Agi: 3, Int: 1 },
    Flush: { resonance: true },
    FullHouse: { Power: 2, Defense: 2, Int: 2 },
    FourKind: { Power: 4, Defense: 2 },
    StraightFlush: { resonance: true, Agi: 2 },
    FiveKind: { Power: 3, Defense: 3, Agi: 3, Int: 3 }
};

const TAROT_SUIT_LABELS = {
    Wand: 'ワンド',
    Sword: 'ソード',
    Cup: 'カップ',
    Pentacle: 'ペンタクル',
    All: '全スート',
    None: '無属性'
};

const TAROT_SUIT_RESONANCE_BONUS = {
    Wand: { Power: 3, Int: 1 },
    Sword: { Power: 1, Agi: 3 },
    Cup: { Defense: 1, Int: 3 },
    Pentacle: { Power: 1, Defense: 3 },
    All: { Power: 1, Defense: 1, Agi: 1, Int: 1 },
    None: { Power: 1, Defense: 1 }
};

function createEmptyBonus() {
    return {
        Power: 0,
        Defense: 0,
        Agi: 0,
        Int: 0,
        total: 0,
        resonanceSuit: '',
        resonanceSuitLabel: ''
    };
}

function addBonus(target, source) {
    if (!source) return target;
    target.Power += Number(source.Power ?? source.power ?? 0) || 0;
    target.Defense += Number(source.Defense ?? source.defense ?? 0) || 0;
    target.Agi += Number(source.Agi ?? source.agi ?? 0) || 0;
    target.Int += Number(source.Int ?? source.int ?? 0) || 0;
    return target;
}

function finalizeBonus(bonus) {
    bonus.total = bonus.Power + bonus.Defense + bonus.Agi + bonus.Int;
    return bonus;
}

function cmpVec(left, right) {
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index += 1) {
        const a = Number(left[index] ?? 0);
        const b = Number(right[index] ?? 0);
        if (a !== b) return a > b ? 1 : -1;
    }
    return 0;
}

function setRankFromNumber(number) {
    return Number(number) === 1 ? 15 : Number(number || 0);
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

function getRankNumber(itemData) {
    const raw = String(itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || '').trim();
    if (!raw) return null;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
    const faceOrder = {
        PAGE: 11,
        KNIGHT: 12,
        QUEEN: 13,
        KING: 14
    };
    return faceOrder[raw.toUpperCase()] || null;
}

function toEvaluatorSuitValue(suitKey) {
    if (suitKey === 'wand') return 'Wand';
    if (suitKey === 'sword') return 'Sword';
    if (suitKey === 'cup') return 'Cup';
    if (suitKey === 'pentacle') return 'Pentacle';
    if (suitKey === 'all') return 'All';
    return 'None';
}

function roleNumberOptions(card) {
    if (!card) return [0];
    if (card.kind === 'minor') {
        const number = Number(card.number || 0);
        return [number === 1 ? 15 : number];
    }
    const number = Number(card.number || 0);
    if (number === 0) return Array.from({ length: 15 }, (_, index) => index + 1);
    if (number === 1) return [1];
    if (number === 3) return [3, 13];
    if (number === 4) return [4, 14];
    if (number === 14) return [14];
    return [number];
}

function roleSuitOptions(card) {
    if (!card) return ['None'];
    if (card.kind === 'minor') return [String(card.suit || 'None')];
    if (Number(card.number) === 1 || String(card.suit || '') === 'All') return SUITS.slice();
    return [String(card.suit || 'None')];
}

function straightHigh(values) {
    const unique = Array.from(new Set(values.slice().sort((a, b) => b - a)));
    if (unique.length !== 5) return null;
    if (unique.includes(15)) {
        const lowWheel = [5, 4, 3, 2].every((number) => unique.includes(number));
        if (lowWheel) return 5;
    }
    for (let index = 1; index < 5; index += 1) {
        if (unique[index - 1] - unique[index] !== 1) return null;
    }
    return unique[0];
}

function compareRole(left, right) {
    if (!left && !right) return 0;
    if (left && !right) return 1;
    if (!left && right) return -1;
    if (left.strength !== right.strength) return left.strength > right.strength ? 1 : -1;
    return cmpVec(left.primary, right.primary);
}

function evalRoleVariant(rows) {
    const values = rows.map((row) => row.value).sort((a, b) => b - a);
    const countMap = new Map();
    rows.forEach((row) => {
        const list = countMap.get(row.value) || [];
        list.push(row);
        countMap.set(row.value, list);
    });
    const groups = Array.from(countMap.entries())
        .map(([value, list]) => ({ value: Number(value), count: list.length }))
        .sort((a, b) => b.count - a.count || b.value - a.value);
    const flush = rows.every((row) => row.suit !== 'None' && row.suit === rows[0].suit);
    const straight = straightHigh(values);
    let key = null;
    let primary = [];
    if ((groups[0]?.count || 0) >= 5) {
        key = 'FiveKind';
        primary = [groups[0].value];
    } else if (straight && flush) {
        key = 'StraightFlush';
        primary = [straight];
    } else if ((groups[0]?.count || 0) === 4) {
        key = 'FourKind';
        primary = [groups[0].value, groups.find((group) => group.value !== groups[0].value)?.value || 0];
    } else if ((groups[0]?.count || 0) === 3 && (groups[1]?.count || 0) === 2) {
        key = 'FullHouse';
        primary = [groups[0].value, groups[1].value];
    } else if (flush) {
        key = 'Flush';
        primary = values.slice();
    } else if (straight) {
        key = 'Straight';
        primary = [straight];
    } else if ((groups[0]?.count || 0) === 3) {
        key = 'ThreeKind';
        primary = [
            groups[0].value,
            ...groups.filter((group) => group.value !== groups[0].value).map((group) => group.value)
        ];
    } else if ((groups[0]?.count || 0) === 2 && (groups[1]?.count || 0) === 2) {
        const pairs = groups.filter((group) => group.count === 2).map((group) => group.value);
        const kicker = groups.find((group) => group.count === 1)?.value || 0;
        key = 'TwoPair';
        primary = pairs.concat(kicker);
    } else if ((groups[0]?.count || 0) === 2) {
        key = 'OnePair';
        primary = [
            groups[0].value,
            ...groups.filter((group) => group.value !== groups[0].value).map((group) => group.value)
        ];
    }
    if (!key) return null;
    return {
        key,
        label: TAROT_ROLE_LABEL[key],
        strength: TAROT_ROLE_STRENGTH[key],
        primary,
        resolvedSuit: flush ? rows[0].suit : '',
        resolvedSuitLabel: flush ? (TAROT_SUIT_LABELS[rows[0].suit] || TAROT_SUIT_LABELS.None) : ''
    };
}

function resolveItemData(itemRef, catalogCache) {
    if (!itemRef) return null;
    if (itemRef && typeof itemRef === 'object' && itemRef.customData) return itemRef.customData;
    if (typeof itemRef === 'string') return catalogCache?.[itemRef] || null;
    return itemRef;
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
        const suitKey = normalizeSuitKey(itemData?.ArcanaSuit || itemData?.Suit);
        if (!number || !suitKey) return null;
        return {
            kind: 'minor',
            number,
            suit: toEvaluatorSuitValue(suitKey),
            name: String(itemData?.SourceCardName || itemData?.DisplayName || '').trim()
        };
    }
    return null;
}

function evaluateTarotRole(cards) {
    if (!Array.isArray(cards) || cards.length !== 5) return null;
    if (cards.some((card) => !card)) return null;
    const options = cards.map((card) => {
        const numbers = roleNumberOptions(card);
        const suits = roleSuitOptions(card);
        const rows = [];
        numbers.forEach((rawNumber) => {
            suits.forEach((suit) => {
                const value = card.kind === 'major' && Number(card.number) === 1 && Number(rawNumber) === 1
                    ? 1
                    : setRankFromNumber(rawNumber);
                rows.push({
                    src: card,
                    raw: Number(rawNumber),
                    value,
                    suit
                });
            });
        });
        return rows;
    });
    let best = null;
    const walk = (index, picked) => {
        if (index >= options.length) {
            const candidate = evalRoleVariant(picked);
            if (candidate && (!best || compareRole(candidate, best) > 0)) {
                best = candidate;
            }
            return;
        }
        options[index].forEach((row) => {
            picked.push(row);
            walk(index + 1, picked);
            picked.pop();
        });
    };
    walk(0, []);
    return best;
}

function getTarotRoleBonus(role) {
    const bonus = createEmptyBonus();
    const config = TAROT_ROLE_BONUS_TABLE[role?.key];
    if (!config) return finalizeBonus(bonus);
    if (config.resonance) {
        const suit = role?.resolvedSuit || 'None';
        addBonus(bonus, TAROT_SUIT_RESONANCE_BONUS[suit] || TAROT_SUIT_RESONANCE_BONUS.None);
        bonus.resonanceSuit = suit;
        bonus.resonanceSuitLabel = TAROT_SUIT_LABELS[suit] || TAROT_SUIT_LABELS.None;
    }
    addBonus(bonus, config);
    return finalizeBonus(bonus);
}

function buildTarotCardsFromEquipment(equipment, catalogCache) {
    const majorData = resolveItemData(equipment?.MajorArcana, catalogCache);
    const slots = ['Armor', 'RightHand', 'LeftHand', 'Accessory'];
    const cards = [buildTarotRoleCard(majorData, 'TarotMajor')];
    slots.forEach((slot) => {
        const entry = equipment?.[slot];
        if (!isTarotManifestationEntry(entry)) {
            cards.push(null);
            return;
        }
        cards.push(buildTarotRoleCard({
            Category: 'TarotMinor',
            ArcanaSuit: entry?.customData?.ArcanaSuit || entry?.customData?.Suit,
            ArcanaRank: entry?.customData?.ArcanaRank || entry?.customData?.Rank || entry?.customData?.CardRank || entry?.customData?.CardNumber,
            SourceCardName: entry?.customData?.SourceCardName || ''
        }, 'TarotMinor'));
    });
    return cards;
}

function getTarotRoleSummaryFromEquipment(equipment, catalogCache) {
    const cards = buildTarotCardsFromEquipment(equipment, catalogCache);
    const filledCount = cards.filter(Boolean).length;
    if (filledCount < 5) {
        const bonus = getTarotRoleBonus(null);
        return {
            key: 'Incomplete',
            label: '未成立',
            strength: 0,
            filledCount,
            bonus
        };
    }
    const role = evaluateTarotRole(cards);
    if (!role) {
        const bonus = getTarotRoleBonus(null);
        return {
            key: 'NoRole',
            label: '役なし',
            strength: 0,
            filledCount,
            bonus
        };
    }
    return {
        ...role,
        filledCount,
        bonus: getTarotRoleBonus(role)
    };
}

function getTarotRoleBonusFromEquipment(equipment, catalogCache) {
    return getTarotRoleSummaryFromEquipment(equipment, catalogCache).bonus;
}

module.exports = {
    evaluateTarotRole,
    getTarotRoleBonus,
    getTarotRoleSummaryFromEquipment,
    getTarotRoleBonusFromEquipment
};
