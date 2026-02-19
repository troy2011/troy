const NORMAL_RANK_ORDER = [
    'HighCard',
    'OnePair',
    'TwoPair',
    'ThreeKind',
    'CourtOnePair',
    'Straight',
    'Flush',
    'CourtTwoPair',
    'FullHouse',
    'TheWorld',
    'FourKind',
    'StraightFlush',
    'FiveKind'
];
const COURT_VALUES = new Set([11, 12, 13, 14]);
const SUIT_STRENGTH = {
    Wand: 4,
    Pentacle: 3,
    Cup: 2,
    Sword: 1
};
const MINOR_SUITS = ['Wand', 'Pentacle', 'Cup', 'Sword'];
function arcanaRuleNumber(card) {
    return Number(card?.effectNumber ?? card?.number ?? -1);
}
function effectTypeForCard(card) {
    if (!card)
        return 'None';
    if (card.effectType && card.effectType !== 'None')
        return card.effectType;
    if (!card.isArcana)
        return 'None';
    const effectNumber = Number(card?.effectNumber ?? card?.number);
    if (effectNumber === 21)
        return 'World';
    if (effectNumber === 20)
        return 'Judgment';
    if (effectNumber === 0)
        return 'Fool';
    return 'None';
}
function deriveEffects(fateCard) {
    const n = Number(fateCard?.effectNumber ?? fateCard?.number ?? -1);
    return {
        fool: n === 0,
        magician: n === 1,
        empress: n === 3,
        emperor: n === 4,
        lovers: n === 6,
        chariot: n === 7,
        strength: n === 8,
        wheel: n === 10,
        justice: n === 11,
        death: n === 13,
        temperance: n === 14,
        tower: n === 16,
        world: n === 21
    };
}
function rankWeightMap(justice) {
    const order = justice ? NORMAL_RANK_ORDER.slice().reverse() : NORMAL_RANK_ORDER;
    const out = {};
    for (let i = 0; i < order.length; i += 1) {
        out[order[i]] = i + 1;
    }
    return out;
}
function isMinorSuit(suit) {
    return suit === 'Wand' || suit === 'Pentacle' || suit === 'Cup' || suit === 'Sword';
}
function uniqueSortedDesc(values) {
    return Array.from(new Set(values)).sort((a, b) => b - a);
}
function combinations(arr, pick) {
    if (pick <= 0)
        return [[]];
    if (arr.length < pick)
        return [];
    const out = [];
    const walk = (start, acc) => {
        if (acc.length === pick) {
            out.push(acc.slice());
            return;
        }
        const needed = pick - acc.length;
        for (let i = start; i <= arr.length - needed; i += 1) {
            acc.push(arr[i]);
            walk(i + 1, acc);
            acc.pop();
        }
    };
    walk(0, []);
    return out;
}
function lexicographicCompare(left, right) {
    const len = Math.max(left.length, right.length);
    for (let i = 0; i < len; i += 1) {
        const a = left[i] ?? 0;
        const b = right[i] ?? 0;
        if (a !== b)
            return a > b ? 1 : -1;
    }
    return 0;
}

function compareVectorByJustice(left, right, justice) {
    const cmp = lexicographicCompare(left, right);
    if (!justice || cmp === 0) return cmp;
    return -cmp;
}
function detectStraight(values, allowStep2) {
    const uniq = uniqueSortedDesc(values);
    if (uniq.length !== 5)
        return null;
    const steps = allowStep2 ? [1, 2] : [1];
    for (const step of steps) {
        let ok = true;
        for (let i = 1; i < uniq.length; i += 1) {
            if (uniq[i - 1] - uniq[i] !== step) {
                ok = false;
                break;
            }
        }
        if (ok) {
            return { high: uniq[0], step };
        }
    }
    return null;
}
function topTwoHandValuesForStrength(hand, effects) {
    const vals = [];
    for (const card of hand) {
        const options = getValueOptionsForCard(card, effects);
        if (options.length > 0) {
            vals.push(Math.max(...options));
        }
    }
    vals.sort((a, b) => b - a);
    return (vals[0] ?? 0) + (vals[1] ?? 0);
}
function suitWeightForOriginal(card) {
    if (isMinorSuit(card.suit)) {
        return SUIT_STRENGTH[card.suit];
    }
    if (card.suit === 'All') {
        return SUIT_STRENGTH.Wand;
    }
    return 0;
}
function normalizeValue(raw, effects, card = null) {
    let value = raw;
    if (effects.death && !(card && card.isArcana) && value >= 11 && value <= 14) {
        value -= 10;
    }
    if (effects.temperance && value % 2 === 1) {
        value += 1;
    }
    if (value < 1)
        value = 1;
    if (value > 15)
        value = 15;
    return value;
}
function getValueOptionsForCard(card, effects) {
    const n = Number(card.number);
    if (card.isArcana && n === 0) {
        return [];
    }
    let out = [];
    if (card.isArcana && n === 3) {
        out = [3, 13];
    }
    else if (card.isArcana && n === 4) {
        out = [4, 14];
    }
    else if (card.isArcana && n === 1) {
        out = [1];
    }
    else if (!card.isArcana && n === 1) {
        out = [1, 15];
    }
    else {
        out = [n];
    }
    return uniqueSortedDesc(out.map((v) => normalizeValue(v, effects, card)));
}
function getSuitOptionsForCard(card, effects) {
    const n = arcanaRuleNumber(card);
    if (card.isArcana && n === 1) {
        return MINOR_SUITS.slice();
    }
    if (card.isArcana && n === 16) {
        return ['Sword'];
    }
    if (card.isArcana && n === 17) {
        return ['Cup'];
    }
    if (card.isArcana && n === 18) {
        return ['Pentacle'];
    }
    if (card.isArcana && n === 19) {
        return ['Wand'];
    }
    if (card.suit === 'All') {
        return MINOR_SUITS.slice();
    }
    if (isMinorSuit(card.suit)) {
        return [card.suit];
    }
    return ['None'];
}
function getWildcardValueDomain(effects) {
    const high = 15;
    const out = [];
    for (let i = 1; i <= high; i += 1) {
        out.push(normalizeValue(i, effects));
    }
    return uniqueSortedDesc(out);
}
function buildPool(input, effects) {
    const hand = input.hand.map((card) => ({ ...card, zone: 'hand' }));
    let board = input.board.map((card) => ({ ...card, zone: 'board' }));
    const fate = input.fateCard ? { ...input.fateCard, zone: 'fate' } : null;
    if (effects.tower && board.length > 0) {
        let maxIndex = 0;
        let maxValue = -Infinity;
        for (let i = 0; i < board.length; i += 1) {
            const options = getValueOptionsForCard(board[i], effects);
            const value = options.length > 0 ? Math.max(...options) : Number(board[i].number);
            if (value > maxValue) {
                maxValue = value;
                maxIndex = i;
            }
        }
        board = board.filter((_, idx) => idx !== maxIndex);
    }
    const pool = [...hand, ...board];
    if (fate)
        pool.push(fate);
    if (effects.chariot && fate) {
        pool.push({
            id: `${fate.id}__chariot_echo`,
            number: 7,
            suit: fate.suit,
            isArcana: true,
            effectType: 'None',
            zone: 'virtual'
        });
    }
    return { hand, pool };
}
function evaluateResolvedFive(resolvedCards, effects, rankMap, privateStrengthSum) {
    const byValue = new Map();
    for (const card of resolvedCards) {
        const list = byValue.get(card.value) || [];
        list.push(card);
        byValue.set(card.value, list);
    }
    const valueEntries = Array.from(byValue.entries())
        .sort((a, b) => {
        if (b[1].length !== a[1].length)
            return b[1].length - a[1].length;
        return b[0] - a[0];
    });
    const valuesDesc = resolvedCards.map((card) => card.value).sort((a, b) => b - a);
    const suitSet = new Set(resolvedCards.map((card) => card.suit));
    const isFlush = suitSet.size === 1 && !suitSet.has('None');
    const straightInfo = detectStraight(valuesDesc, effects.temperance);
    const isStraight = !!straightInfo;
    const pairEntries = valueEntries.filter((entry) => entry[1].length === 2);
    const tripEntries = valueEntries.filter((entry) => entry[1].length === 3);
    const quadEntries = valueEntries.filter((entry) => entry[1].length === 4);
    const fiveEntries = valueEntries.filter((entry) => entry[1].length >= 5);
    const strongestEntry = valueEntries[0] || null;
    const strongestValue = strongestEntry ? Number(strongestEntry[0]) : 0;
    const cardsByValue = new Map(valueEntries.map(([value, cards]) => [Number(value), cards]));
    const getCardsByValue = (value) => cardsByValue.get(Number(value)) || [];
    const removeValueInstances = (value, count) => {
        let toRemove = Math.max(0, Number(count) || 0);
        const out = [];
        for (const current of valuesDesc) {
            if (current === value && toRemove > 0) {
                toRemove -= 1;
                continue;
            }
            out.push(current);
        }
        return out;
    };
    const findTheWorldCombo = () => {
        if (!effects.world) return null;
        const worldCard = resolvedCards.find((card) => {
            const ruleNumber = Number(card?.base?.effectNumber ?? card?.base?.number ?? -1);
            return !!card?.base?.isArcana && ruleNumber === 21;
        });
        if (!worldCard)
            return null;
        const others = resolvedCards.filter((card) => card !== worldCard);
        if (others.length !== 4)
            return null;
        for (const card of others) {
            if (!card?.base?.isArcana) {
                const n = Number(card?.base?.number ?? 0);
                if (COURT_VALUES.has(n))
                    return null;
            }
        }
        const sum = others.reduce((acc, card) => acc + Number(card?.value || 0), 0);
        if (sum !== 21)
            return null;
        const vector = others.map((card) => Number(card?.value || 0)).sort((a, b) => b - a);
        const sortedOthers = others.slice().sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0));
        return { cards: [worldCard, ...sortedOthers], vector };
    };
    const theWorldCombo = findTheWorldCombo();
    let rank = 'HighCard';
    let primaryVector = [];
    let kickerVector = [];
    let roleCards = [];
    if (fiveEntries.length > 0) {
        const [v, cards] = fiveEntries[0];
        rank = 'FiveKind';
        primaryVector = [v];
        roleCards = cards.slice(0, 5);
    }
    else if (isStraight && isFlush) {
        rank = 'StraightFlush';
        primaryVector = [straightInfo?.high ?? 0];
        roleCards = resolvedCards.slice();
    }
    else if (quadEntries.length > 0) {
        const [quadValue, quadCards] = quadEntries[0];
        rank = 'FourKind';
        primaryVector = [quadValue];
        roleCards = quadCards.slice(0, 4);
        const kicker = valueEntries.find((entry) => entry[0] !== quadValue)?.[0] ?? 0;
        kickerVector = [kicker];
    }
    else if (theWorldCombo) {
        rank = 'TheWorld';
        primaryVector = theWorldCombo.vector.slice();
        roleCards = theWorldCombo.cards.slice();
    }
    else if (tripEntries.length > 0 && pairEntries.length > 0) {
        const [tripValue, tripCards] = tripEntries[0];
        const [pairValue, pairCards] = pairEntries[0];
        rank = 'FullHouse';
        primaryVector = [tripValue, pairValue];
        roleCards = [...tripCards.slice(0, 3), ...pairCards.slice(0, 2)];
    }
    else if (isFlush) {
        rank = 'Flush';
        primaryVector = valuesDesc.slice();
        roleCards = resolvedCards.slice();
    }
    else if (isStraight) {
        rank = 'Straight';
        primaryVector = [straightInfo?.high ?? 0];
        roleCards = resolvedCards.slice();
    }
    else if (tripEntries.length > 0) {
        const [tripValue, tripCards] = tripEntries[0];
        rank = 'ThreeKind';
        primaryVector = [tripValue];
        roleCards = tripCards.slice(0, 3);
        kickerVector = valueEntries
            .filter((entry) => entry[0] !== tripValue)
            .map((entry) => entry[0])
            .sort((a, b) => b - a);
    }
    else if (pairEntries.length >= 2) {
        const pairValues = pairEntries.map((entry) => entry[0]).sort((a, b) => b - a);
        rank = 'TwoPair';
        primaryVector = [pairValues[0], pairValues[1]];
        roleCards = [...pairEntries[0][1], ...pairEntries[1][1]].slice(0, 4);
        kickerVector = valueEntries
            .filter((entry) => entry[1].length === 1)
            .map((entry) => entry[0])
            .sort((a, b) => b - a)
            .slice(0, 1);
    }
    else if (pairEntries.length === 1) {
        const [pairValue, pairCards] = pairEntries[0];
        rank = 'OnePair';
        primaryVector = [pairValue];
        roleCards = pairCards.slice(0, 2);
        kickerVector = valueEntries
            .filter((entry) => entry[1].length === 1)
            .map((entry) => entry[0])
            .sort((a, b) => b - a);
    }
    else {
        rank = 'HighCard';
        primaryVector = [valuesDesc[0] ?? 0];
        roleCards = [resolvedCards.slice().sort((a, b) => b.value - a.value)[0]];
        kickerVector = valuesDesc.slice(1);
    }
    if (effects.lovers && strongestEntry) {
        if (rank === 'HighCard') {
            const baseCard = getCardsByValue(strongestValue)[0];
            rank = 'OnePair';
            primaryVector = [strongestValue];
            roleCards = baseCard ? [baseCard, baseCard] : [];
            kickerVector = removeValueInstances(strongestValue, 1).slice(0, 3);
        }
        else if (rank === 'OnePair') {
            const pairCards = getCardsByValue(strongestValue).slice(0, 2);
            const virtual = pairCards[0] || null;
            rank = 'ThreeKind';
            primaryVector = [strongestValue];
            roleCards = virtual ? [...pairCards, virtual] : pairCards;
            kickerVector = removeValueInstances(strongestValue, 2).slice(0, 2);
        }
        else if (rank === 'TwoPair') {
            const highPairCards = getCardsByValue(strongestValue).slice(0, 2);
            const lowPairValue = Number(primaryVector[1] ?? 0);
            const lowPairCards = getCardsByValue(lowPairValue).slice(0, 2);
            const virtual = highPairCards[0] || null;
            rank = 'FullHouse';
            primaryVector = [strongestValue, lowPairValue];
            roleCards = virtual ? [...highPairCards, virtual, ...lowPairCards] : [...highPairCards, ...lowPairCards];
            kickerVector = [];
        }
        else if (rank === 'ThreeKind') {
            const tripCards = getCardsByValue(strongestValue).slice(0, 3);
            const virtual = tripCards[0] || null;
            rank = 'FourKind';
            primaryVector = [strongestValue];
            roleCards = virtual ? [...tripCards, virtual] : tripCards;
            kickerVector = removeValueInstances(strongestValue, 3).slice(0, 1);
        }
        else if (rank === 'FourKind') {
            const quadCards = getCardsByValue(strongestValue).slice(0, 4);
            const virtual = quadCards[0] || null;
            rank = 'FiveKind';
            primaryVector = [strongestValue];
            roleCards = virtual ? [...quadCards, virtual] : quadCards;
            kickerVector = [];
        }
    }
    const roleSuitVector = roleCards
        .map((card) => card.originalSuitWeight)
        .sort((a, b) => b - a);
    return {
        rank,
        rankWeight: rankMap[rank],
        primaryVector,
        kickerVector,
        roleSuitVector,
        privateStrengthSum,
        resolvedCards
    };
}
function compareScoredHands(left, right, effects, options = {}) {
    const useJusticeComparison = !!options.useJusticeComparison;
    const rankMap = rankWeightMap(useJusticeComparison && effects.justice);
    const leftRankWeight = rankMap[left.rank];
    const rightRankWeight = rankMap[right.rank];
    if (leftRankWeight !== rightRankWeight) {
        return { cmp: leftRankWeight > rightRankWeight ? 1 : -1, reason: 'rank' };
    }
    const reverseNumberStrength = useJusticeComparison && effects.justice;
    const primaryCmp = compareVectorByJustice(left.primaryVector, right.primaryVector, reverseNumberStrength);
    if (primaryCmp !== 0) {
        return { cmp: primaryCmp, reason: 'primary-vector' };
    }
    const kickerCmp = compareVectorByJustice(left.kickerVector, right.kickerVector, reverseNumberStrength);
    if (kickerCmp !== 0) {
        return { cmp: kickerCmp, reason: 'kicker' };
    }
    const suitCmp = lexicographicCompare(left.roleSuitVector, right.roleSuitVector);
    if (suitCmp !== 0) {
        return { cmp: suitCmp, reason: 'suit' };
    }
    if (effects.strength && left.privateStrengthSum !== right.privateStrengthSum) {
        return { cmp: left.privateStrengthSum > right.privateStrengthSum ? 1 : -1, reason: 'strength' };
    }
    return { cmp: 0, reason: 'draw' };
}
function resolveVariants(combo, effects, callback) {
    const wildcardValues = getWildcardValueDomain(effects);
    const walk = (index, acc) => {
        if (index >= combo.length) {
            callback(acc.slice());
            return;
        }
        const card = combo[index];
        const isWildcard = card.isArcana && Number(card.number) === 0;
        const suitOptions = isWildcard
            ? MINOR_SUITS.slice()
            : getSuitOptionsForCard(card, effects);
        const valueOptions = isWildcard ? wildcardValues : getValueOptionsForCard(card, effects);
        for (const value of valueOptions) {
            for (const suit of suitOptions) {
                acc.push({
                    base: card,
                    value,
                    suit,
                    originalSuitWeight: isWildcard
                        ? suit === 'World'
                            ? SUIT_STRENGTH.Wand
                            : suit in SUIT_STRENGTH
                                ? SUIT_STRENGTH[suit]
                                : SUIT_STRENGTH.Wand
                        : suitWeightForOriginal(card),
                    isWildcard
                });
                walk(index + 1, acc);
                acc.pop();
            }
        }
    };
    walk(0, []);
}
function rankLabel(rank) {
    switch (rank) {
        case 'HighCard': return 'High Card';
        case 'OnePair': return 'One Pair';
        case 'TwoPair': return 'Two Pair';
        case 'ThreeKind': return 'Three of a Kind';
        case 'CourtOnePair': return 'Court One Pair';
        case 'Straight': return 'Straight';
        case 'Flush': return 'Flush';
        case 'CourtTwoPair': return 'Court Two Pair';
        case 'FullHouse': return 'Full House';
        case 'TheWorld': return 'ザ・ワールド';
        case 'FourKind': return 'Four of a Kind';
        case 'StraightFlush': return 'Straight Flush';
        case 'FiveKind': return 'Five of a Kind';
    }
}
export class HandEvaluator {
    evaluateHand(input) {
        if (!Array.isArray(input.hand) || !Array.isArray(input.board)) {
            throw new Error('Invalid input: hand/board must be arrays.');
        }
        const effects = deriveEffects(input.fateCard);
        const rankMap = rankWeightMap(false);
        const { hand, pool } = buildPool(input, effects);
        if (pool.length < 5) {
            throw new Error('Not enough cards to evaluate.');
        }
        const privateStrengthSum = topTwoHandValuesForStrength(hand, effects);
        const fiveCardCombos = combinations(pool, 5);
        let best = null;
        let bestRawCards = [];
        for (const combo of fiveCardCombos) {
            resolveVariants(combo, effects, (resolvedCards) => {
                const scored = evaluateResolvedFive(resolvedCards, effects, rankMap, privateStrengthSum);
                if (!best) {
                    best = scored;
                    bestRawCards = combo.slice();
                    return;
                }
                const cmp = compareScoredHands(scored, best, effects, { useJusticeComparison: false });
                if (cmp.cmp > 0) {
                    best = scored;
                    bestRawCards = combo.slice();
                }
            });
        }
        if (!best) {
            throw new Error('Evaluation failed to find best hand.');
        }
        return {
            rank: best.rank,
            rankLabel: rankLabel(best.rank),
            rankWeight: best.rankWeight,
            primaryVector: best.primaryVector.slice(),
            kickerVector: best.kickerVector.slice(),
            roleSuitVector: best.roleSuitVector.slice(),
            privateStrengthSum: best.privateStrengthSum,
            bestFive: bestRawCards.map((card) => ({ ...card })),
            resolvedBestFive: best.resolvedCards.map((card) => ({
                id: card.base.id,
                value: card.value,
                suit: card.suit,
                zone: card.base.zone
            })),
            effects
        };
    }
    compareHands(left, right, effects) {
        const leftScore = {
            rank: left.rank,
            rankWeight: left.rankWeight,
            primaryVector: left.primaryVector.slice(),
            kickerVector: left.kickerVector.slice(),
            roleSuitVector: left.roleSuitVector.slice(),
            privateStrengthSum: left.privateStrengthSum,
            resolvedCards: []
        };
        const rightScore = {
            rank: right.rank,
            rankWeight: right.rankWeight,
            primaryVector: right.primaryVector.slice(),
            kickerVector: right.kickerVector.slice(),
            roleSuitVector: right.roleSuitVector.slice(),
            privateStrengthSum: right.privateStrengthSum,
            resolvedCards: []
        };
        return compareScoredHands(leftScore, rightScore, effects, { useJusticeComparison: true });
    }
    compareInputs(leftInput, rightInput) {
        const leftEval = this.evaluateHand(leftInput);
        const rightEval = this.evaluateHand(rightInput);
        const effects = leftEval.effects;
        return this.compareHands(leftEval, rightEval, effects);
    }
}
