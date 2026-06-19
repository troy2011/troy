const TAROT_ROLE_ORDER = [
    'OnePair',
    'TwoPair',
    'ThreeKind',
    'Straight',
    'Flush',
    'FullHouse',
    'FourKind',
    'StraightFlush',
    'RoyalFlush'
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
    RoyalFlush: 'ロイヤルフラッシュ'
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
    RoyalFlush: '同スートの10・J・Q・K・Aが揃っています。'
};

const TAROT_ROLE_STRENGTH = TAROT_ROLE_ORDER.reduce((acc, key, index) => {
    acc[key] = index + 1;
    return acc;
}, {});

const SUITS = ['Wand', 'Cup', 'Sword', 'Pentacle'];
const TAROT_ROLE_BONUS_TABLE = {
    OnePair: { hpRate: 0.10, text: '最大HP +10%' },
    TwoPair: { hpRate: 0.10, defenseRate: 0.10, text: '最大HP +10% / 防御 +10%' },
    ThreeKind: { attackRate: 0.15, text: '攻撃 +15%' },
    Straight: { agilityRate: 0.15, accuracyBonus: 0.10, text: '素早さ +15% / 命中 +10%' },
    Flush: { elementalSkillRate: 0.20, sameSuitOnly: true, text: '同属性技 +20%' },
    FullHouse: { attackRate: 0.15, defenseRate: 0.15, text: '攻撃 +15% / 防御 +15%' },
    FourKind: { attackRate: 0.20, criticalRate: 0.10, text: '攻撃 +20% / クリティカル率 +10%' },
    StraightFlush: { attackRate: 0.20, agilityRate: 0.20, elementalSkillRate: 0.20, elementalAny: true, text: '攻撃 +20% / 素早さ +20% / 属性技 +20%' },
    RoyalFlush: { hpRate: 0.20, attackRate: 0.20, defenseRate: 0.20, agilityRate: 0.20, shieldRate: 0.20, text: '全能力 +20% / 戦闘開始時シールド' }
};
const TAROT_SUIT_LABELS = {
    Wand: 'ワンド',
    Sword: 'ソード',
    Cup: 'カップ',
    Pentacle: 'ペンタクル',
    All: '全スート',
    None: '無属性'
};
const TAROT_SUIT_ELEMENT = {
    Wand: 'fire',
    Sword: 'wind',
    Cup: 'water',
    Pentacle: 'earth',
    All: 'all',
    None: 'none'
};

function createEmptyBonus() {
    return {
        power: 0,
        defense: 0,
        agi: 0,
        int: 0,
        total: 0,
        hpRate: 0,
        attackRate: 0,
        defenseRate: 0,
        agilityRate: 0,
        accuracyBonus: 0,
        criticalRate: 0,
        elementalSkillRate: 0,
        elementalElement: '',
        shieldRate: 0,
        bonusText: '役ボーナスなし',
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
    target.hpRate += Number(source.hpRate || 0) || 0;
    target.attackRate += Number(source.attackRate || 0) || 0;
    target.defenseRate += Number(source.defenseRate || 0) || 0;
    target.agilityRate += Number(source.agilityRate || 0) || 0;
    target.accuracyBonus += Number(source.accuracyBonus || 0) || 0;
    target.criticalRate += Number(source.criticalRate || 0) || 0;
    target.elementalSkillRate += Number(source.elementalSkillRate || 0) || 0;
    target.shieldRate += Number(source.shieldRate || 0) || 0;
    return target;
}

function finalizeBonus(bonus) {
    bonus.total = bonus.power + bonus.defense + bonus.agi + bonus.int;
    return bonus;
}

export function formatTarotRoleBonus(bonus) {
    return String(bonus?.bonusText || '').trim() || '役ボーナスなし';
}

export function getTarotRoleBonus(role) {
    const bonus = createEmptyBonus();
    const config = TAROT_ROLE_BONUS_TABLE[role?.key];
    if (!config) return finalizeBonus(bonus);
    if (config.sameSuitOnly) {
        const suit = role?.resolvedSuit || 'None';
        bonus.elementalElement = TAROT_SUIT_ELEMENT[suit] || 'none';
        bonus.resonanceSuit = suit;
        bonus.resonanceSuitLabel = TAROT_SUIT_LABELS[suit] || TAROT_SUIT_LABELS.None;
    } else if (config.elementalAny) {
        bonus.elementalElement = 'any';
    }
    addBonus(bonus, config);
    bonus.bonusText = config.text || '役ボーナスなし';
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
    if (straight === 15 && flush) {
        key = 'RoyalFlush';
        primary = [straight];
    } else if (straight && flush) {
        key = 'StraightFlush';
        primary = [straight];
    } else if ((groups[0]?.count || 0) >= 4) {
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
