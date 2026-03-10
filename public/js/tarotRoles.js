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

const TAROT_ROLE_HINT = {
    OnePair: '同じ数字が2枚揃っています。',
    TwoPair: '2組の数字が噛み合っています。',
    ThreeKind: '同じ数字が3枚揃っています。',
    Straight: '数字の流れが完成しています。',
    Flush: '同じスートが揃っています。',
    FullHouse: '3枚組と2枚組が成立しています。',
    FourKind: '同じ数字が4枚揃っています。',
    StraightFlush: '同スートの連番です。',
    FiveKind: '同じ数字が5枚揃う最上位級です。'
};

const TAROT_ROLE_STRENGTH = TAROT_ROLE_ORDER.reduce((acc, key, index) => {
    acc[key] = index + 1;
    return acc;
}, {});

const SUITS = ['Wand', 'Cup', 'Sword', 'Pentacle'];
const TAROT_ROLE_BONUS_TABLE = {
    OnePair: { power: 1, defense: 1 },
    TwoPair: { power: 1, defense: 1, agi: 1, int: 1 },
    ThreeKind: { power: 3 },
    Straight: { agi: 3, int: 1 },
    Flush: { resonance: true },
    FullHouse: { power: 2, defense: 2, int: 2 },
    FourKind: { power: 4, defense: 2 },
    StraightFlush: { resonance: true, agi: 2 },
    FiveKind: { power: 3, defense: 3, agi: 3, int: 3 }
};
const TAROT_ROLE_BONUS_LABELS = {
    power: '攻',
    defense: '守',
    agi: '速',
    int: '賢'
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
    Wand: { power: 3, int: 1 },
    Sword: { power: 1, agi: 3 },
    Cup: { defense: 1, int: 3 },
    Pentacle: { power: 1, defense: 3 },
    All: { power: 1, defense: 1, agi: 1, int: 1 },
    None: { power: 1, defense: 1 }
};

function createEmptyBonus() {
    return {
        power: 0,
        defense: 0,
        agi: 0,
        int: 0,
        total: 0,
        resonanceSuit: '',
        resonanceSuitLabel: ''
    };
}

function addBonus(target, source) {
    if (!source) return target;
    target.power += Number(source.power || 0) || 0;
    target.defense += Number(source.defense || 0) || 0;
    target.agi += Number(source.agi || 0) || 0;
    target.int += Number(source.int || 0) || 0;
    return target;
}

function finalizeBonus(bonus) {
    bonus.total = bonus.power + bonus.defense + bonus.agi + bonus.int;
    return bonus;
}

function bonusSegments(bonus) {
    return Object.entries(TAROT_ROLE_BONUS_LABELS)
        .map(([key, label]) => {
            const value = Number(bonus?.[key] || 0) || 0;
            return value > 0 ? `${label}+${value}` : '';
        })
        .filter(Boolean);
}

export function formatTarotRoleBonus(bonus) {
    const segments = bonusSegments(bonus);
    if (!segments.length) return '役ボーナスなし';
    const core = segments.join(' / ');
    if (bonus?.resonanceSuitLabel) return `${bonus.resonanceSuitLabel}共鳴: ${core}`;
    return core;
}

export function getTarotRoleBonus(role) {
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
        hint: TAROT_ROLE_HINT[key] || '',
        strength: TAROT_ROLE_STRENGTH[key],
        primary,
        resolvedSuit: flush ? rows[0].suit : '',
        resolvedSuitLabel: flush ? (TAROT_SUIT_LABELS[rows[0].suit] || TAROT_SUIT_LABELS.None) : ''
    };
}

export function evaluateTarotRole(cards) {
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

export function summarizeTarotLoadoutRole(entries) {
    const cards = Array.isArray(entries) ? entries.map((entry) => entry?.roleCard || null) : [];
    const filledCount = cards.filter(Boolean).length;
    if (filledCount < 5) {
        const bonus = getTarotRoleBonus(null);
        return {
            key: 'Incomplete',
            label: '未成立',
            hint: `タロット札が ${filledCount}/5 枚です。`,
            strength: 0,
            bonus,
            bonusText: formatTarotRoleBonus(bonus)
        };
    }
    const role = evaluateTarotRole(cards);
    if (!role) {
        const bonus = getTarotRoleBonus(null);
        return {
            key: 'NoRole',
            label: '役なし',
            hint: '数字かスートを揃えると役が成立します。',
            strength: 0,
            bonus,
            bonusText: formatTarotRoleBonus(bonus)
        };
    }
    const bonus = getTarotRoleBonus(role);
    return {
        ...role,
        bonus,
        bonusText: formatTarotRoleBonus(bonus)
    };
}

export function getTarotLoadoutRoleBonuses(entries) {
    return summarizeTarotLoadoutRole(entries).bonus || createEmptyBonus();
}
