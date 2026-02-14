const SUITS = ['Wand', 'Sword', 'Cup', 'Pentacle'];
const SUIT_RANK = {
    Wand: 4,
    Pentacle: 3,
    Cup: 2,
    Sword: 1,
    None: 0,
    All: 0
};

const EFFECT_TYPE = {
    WORLD: 'World',
    JUDGMENT: 'Judgment',
    FOOL: 'Fool',
    NONE: 'None'
};

const HAND_RANK_LABEL = {
    11: 'ファイブカード',
    10: 'ストレートフラッシュ',
    9: 'フォーカード',
    8: 'フルハウス',
    7: 'フラッシュ',
    6: 'ストレート',
    5: 'スリーカード',
    4: 'ツーペア',
    3: 'ワンペア',
    2: 'ハイカード'
};

const ARCANA_NAME = {
    0: '愚者',
    1: '魔術師',
    2: '女教皇',
    3: '女帝',
    4: '皇帝',
    5: '教皇',
    6: '恋人',
    7: '戦車',
    8: '力',
    9: '隠者',
    10: '運命の輪',
    11: '正義',
    12: '吊るされた男',
    13: '死神',
    14: '節制',
    15: '悪魔',
    16: '塔',
    17: '星',
    18: '月',
    19: '太陽',
    20: '審判',
    21: '世界'
};

const TAROT_SPRITE_SRC = 'Sprites/Buildings/tarot.png';
const TAROT_SPRITE_TILE_W = 48;
const TAROT_SPRITE_TILE_H = 80;
const TAROT_SPRITE_SHEET_W = 512;
const TAROT_SPRITE_SHEET_H = 1024;
const CPU_SIMULATION_COUNT = 180;
const CPU_DRAW_SAMPLE_COUNT = 16;

let isBound = false;
let state = null;

const ui = {
    root: null,
    startButton: null,
    nextButton: null,
    stateText: null,
    board: null,
    cpuHand: null,
    playerHand: null,
    cpuGrave: null,
    playerGrave: null,
    resultText: null,
    log: null,
    effectOverlay: null,
    judgmentPanel: null,
    judgmentOptions: null
};

function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sampleIndices(count, max) {
    if (max <= 0 || count <= 0) return [];
    const picks = new Set();
    while (picks.size < Math.min(count, max)) {
        picks.add(Math.floor(Math.random() * max));
    }
    return Array.from(picks);
}

function sampleCards(pool, count) {
    if (!Array.isArray(pool) || pool.length === 0 || count <= 0) return [];
    const indices = sampleIndices(count, pool.length);
    return indices.map((idx) => pool[idx]).filter(Boolean);
}

function buildDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (let number = 1; number <= 14; number += 1) {
            deck.push({
                id: `minor-${suit}-${number}`,
                number,
                suit,
                isArcana: false,
                effectType: EFFECT_TYPE.NONE
            });
        }
    }
    for (let number = 0; number <= 21; number += 1) {
        let effectType = EFFECT_TYPE.NONE;
        if (number === 21) effectType = EFFECT_TYPE.WORLD;
        if (number === 20) effectType = EFFECT_TYPE.JUDGMENT;
        if (number === 0) effectType = EFFECT_TYPE.FOOL;
        deck.push({
            id: `arcana-${number}`,
            number,
            suit: number === 0 ? 'All' : 'None',
            isArcana: true,
            effectType
        });
    }
    return deck;
}

function resetState() {
    state = {
        phase: 'idle',
        deck: [],
        board: [],
        players: {
            player: {
                id: 'player',
                name: 'あなた',
                hand: [],
                graveyard: [],
                canExchange: true,
                bettingEnabled: false
            },
            cpu: {
                id: 'cpu',
                name: 'CPU',
                hand: [],
                graveyard: [],
                canExchange: true,
                bettingEnabled: false
            }
        },
        graveyard: [],
        forceShowdown: false,
        effectsDisabledByFool: false,
        pendingJudgment: null,
        cpuThinking: false,
        log: [],
        result: null
    };
}

function pushLog(text) {
    if (!text) return;
    state.log.unshift(text);
    if (state.log.length > 24) {
        state.log = state.log.slice(0, 24);
    }
}

function showEffectOverlay(text) {
    if (!ui.effectOverlay) return;
    ui.effectOverlay.textContent = text;
    ui.effectOverlay.classList.add('show');
    setTimeout(() => {
        if (!ui.effectOverlay) return;
        ui.effectOverlay.classList.remove('show');
    }, 1600);
}

function drawCard() {
    if (!state.deck.length) return null;
    return state.deck.pop();
}

function dealTo(ownerKey, count) {
    for (let i = 0; i < count; i += 1) {
        const card = drawCard();
        if (!card) break;
        state.players[ownerKey].hand.push(card);
    }
}

function addToGrave(ownerKey, card) {
    if (!card) return;
    state.players[ownerKey].graveyard.push(card);
    state.graveyard.push({ ownerKey, card });
}

function takeLatestGraveCard(ownerKey) {
    const grave = state.players[ownerKey]?.graveyard;
    if (!grave || !grave.length) return null;
    const card = grave.pop() || null;
    if (!card) return null;
    for (let i = state.graveyard.length - 1; i >= 0; i -= 1) {
        const entry = state.graveyard[i];
        if (entry.ownerKey === ownerKey && entry.card?.id === card.id) {
            state.graveyard.splice(i, 1);
            break;
        }
    }
    return card;
}

function hasFoolInHand(ownerKey) {
    return state.players[ownerKey].hand.some((card) => card.effectType === EFFECT_TYPE.FOOL);
}

function getCardDisplayName(card) {
    if (!card) return '';
    if (card.isArcana) {
        return ARCANA_NAME[card.number] || `アルカナ ${card.number}`;
    }
    return `${card.suit} ${card.number}`;
}

function getCardSuitForFlush(card) {
    if (!card) return 'None';
    if (!card.isArcana) return card.suit;
    if (card.number === 16) return 'Sword';
    if (card.number === 17) return 'Cup';
    if (card.number === 18) return 'Pentacle';
    if (card.number === 19) return 'Wand';
    if (card.number === 0) return 'All';
    return 'None';
}

function matchesSuit(card, suit) {
    const suited = getCardSuitForFlush(card);
    return suited === suit || suited === 'All';
}

function compareNumberDesc(a, b) {
    return b.number - a.number;
}

function compareCardsForFlush(a, b) {
    const diff = b.number - a.number;
    if (diff !== 0) return diff;
    const arcanaDiff = Number(b.isArcana) - Number(a.isArcana);
    if (arcanaDiff !== 0) return arcanaDiff;
    return SUIT_RANK[getCardSuitForFlush(b)] - SUIT_RANK[getCardSuitForFlush(a)];
}

function getUniqueNumbersDesc(cards) {
    const seen = new Set();
    const out = [];
    cards
        .slice()
        .sort(compareNumberDesc)
        .forEach((card) => {
            if (seen.has(card.number)) return;
            seen.add(card.number);
            out.push(card.number);
        });
    return out;
}

function detectStraight(cards) {
    const values = getUniqueNumbersDesc(cards);
    if (values.length < 5) return null;
    for (let i = 0; i <= values.length - 5; i += 1) {
        const start = values[i];
        const seq = [start];
        let expected = start - 1;
        for (let j = i + 1; j < values.length && seq.length < 5; j += 1) {
            const current = values[j];
            if (current === expected) {
                seq.push(current);
                expected -= 1;
            } else if (current < expected) {
                break;
            }
        }
        if (seq.length === 5) {
            return { high: seq[0], sequence: seq };
        }
    }
    return null;
}

function getCountEntries(cards) {
    const map = new Map();
    cards.forEach((card) => {
        map.set(card.number, (map.get(card.number) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return b[0] - a[0];
    });
}

function detectBestFlush(cards) {
    let best = null;
    for (const suit of SUITS) {
        const suited = cards.filter((card) => matchesSuit(card, suit));
        if (suited.length < 5) continue;
        const bestFive = suited.slice().sort(compareCardsForFlush).slice(0, 5);
        const valueVector = bestFive.map((card) => card.number).sort((a, b) => b - a);
        if (!best) {
            best = { suit, cards: bestFive, valueVector };
            continue;
        }
        for (let i = 0; i < Math.max(best.valueVector.length, valueVector.length); i += 1) {
            const left = valueVector[i] || 0;
            const right = best.valueVector[i] || 0;
            if (left > right) {
                best = { suit, cards: bestFive, valueVector };
                break;
            }
            if (left < right) break;
        }
    }
    return best;
}

function getScoreVectorByCounts(entries) {
    const out = [];
    entries.forEach(([value, count]) => {
        for (let i = 0; i < count; i += 1) {
            out.push(value);
        }
    });
    return out;
}

function scoreFiveCards(cards) {
    const sorted = cards.slice().sort(compareCardsForFlush);
    const maxNumber = sorted.reduce((max, card) => Math.max(max, card.number), 0);
    const arcanaNumbers = sorted.filter((card) => card.isArcana).map((card) => card.number);
    const hasArcana = arcanaNumbers.length > 0;
    const maxArcana = hasArcana ? Math.max(...arcanaNumbers) : -1;
    const suitStrength = sorted.reduce((max, card) => {
        const suit = getCardSuitForFlush(card);
        return Math.max(max, SUIT_RANK[suit] || 0);
    }, 0);

    const countEntries = getCountEntries(sorted);
    const flush = detectBestFlush(sorted);
    const straight = detectStraight(sorted);
    const straightFlush = flush ? detectStraight(flush.cards) : null;

    let rank = 2;
    let rankVector = [];

    if (countEntries[0]?.[1] === 5) {
        rank = 11;
        rankVector = [countEntries[0][0]];
    } else if (straightFlush) {
        rank = 10;
        rankVector = [straightFlush.high];
    } else if (countEntries[0]?.[1] === 4) {
        const quad = countEntries[0][0];
        const kicker = countEntries[1]?.[0] || 0;
        rank = 9;
        rankVector = [quad, kicker];
    } else if (countEntries[0]?.[1] === 3 && countEntries[1]?.[1] === 2) {
        rank = 8;
        rankVector = [countEntries[0][0], countEntries[1][0]];
    } else if (flush) {
        rank = 7;
        rankVector = flush.valueVector;
    } else if (straight) {
        rank = 6;
        rankVector = [straight.high];
    } else if (countEntries[0]?.[1] === 3) {
        const trip = countEntries[0][0];
        const kickers = countEntries.slice(1).map(([v]) => v).sort((a, b) => b - a);
        rank = 5;
        rankVector = [trip, ...kickers];
    } else if (countEntries[0]?.[1] === 2 && countEntries[1]?.[1] === 2) {
        const pairHigh = Math.max(countEntries[0][0], countEntries[1][0]);
        const pairLow = Math.min(countEntries[0][0], countEntries[1][0]);
        const kicker = countEntries[2]?.[0] || 0;
        rank = 4;
        rankVector = [pairHigh, pairLow, kicker];
    } else if (countEntries[0]?.[1] === 2) {
        const pair = countEntries[0][0];
        const kickers = countEntries.slice(1).map(([v]) => v).sort((a, b) => b - a);
        rank = 3;
        rankVector = [pair, ...kickers];
    } else {
        rank = 2;
        rankVector = getScoreVectorByCounts(countEntries);
    }

    return {
        rank,
        rankLabel: HAND_RANK_LABEL[rank] || '役なし',
        rankVector,
        maxNumber,
        hasArcana,
        maxArcana,
        suitStrength,
        cards: sorted
    };
}

function compareScore(a, b) {
    if (a.rank !== b.rank) return a.rank > b.rank ? 1 : -1;
    if (a.maxNumber !== b.maxNumber) return a.maxNumber > b.maxNumber ? 1 : -1;

    const maxLen = Math.max(a.rankVector.length, b.rankVector.length);
    for (let i = 0; i < maxLen; i += 1) {
        const left = a.rankVector[i] || 0;
        const right = b.rankVector[i] || 0;
        if (left !== right) return left > right ? 1 : -1;
    }

    if (a.hasArcana !== b.hasArcana) {
        return a.hasArcana ? 1 : -1;
    }
    if (a.hasArcana && b.hasArcana && a.maxArcana !== b.maxArcana) {
        return a.maxArcana > b.maxArcana ? 1 : -1;
    }
    if (!a.hasArcana && !b.hasArcana && a.suitStrength !== b.suitStrength) {
        return a.suitStrength > b.suitStrength ? 1 : -1;
    }
    return 0;
}

function chooseBestFiveFromSeven(cards) {
    if (cards.length < 5) return null;
    let best = null;
    for (let a = 0; a < cards.length - 4; a += 1) {
        for (let b = a + 1; b < cards.length - 3; b += 1) {
            for (let c = b + 1; c < cards.length - 2; c += 1) {
                for (let d = c + 1; d < cards.length - 1; d += 1) {
                    for (let e = d + 1; e < cards.length; e += 1) {
                        const combo = [cards[a], cards[b], cards[c], cards[d], cards[e]];
                        const score = scoreFiveCards(combo);
                        if (!best || compareScore(score, best) > 0) {
                            best = score;
                        }
                    }
                }
            }
        }
    }
    return best;
}

function evaluateShowdown() {
    const playerCards = [...state.players.player.hand, ...state.board];
    const cpuCards = [...state.players.cpu.hand, ...state.board];
    const playerBest = chooseBestFiveFromSeven(playerCards);
    const cpuBest = chooseBestFiveFromSeven(cpuCards);
    if (!playerBest || !cpuBest) return null;
    const compared = compareScore(playerBest, cpuBest);
    const winner = compared > 0 ? 'player' : compared < 0 ? 'cpu' : 'draw';
    return { playerBest, cpuBest, winner };
}

function buildPoolWithoutCards(pool, cardsToRemove) {
    if (!Array.isArray(pool) || pool.length === 0) return [];
    if (!Array.isArray(cardsToRemove) || cardsToRemove.length === 0) return pool.slice();
    const removeCounts = new Map();
    cardsToRemove.forEach((card) => {
        if (!card?.id) return;
        removeCounts.set(card.id, (removeCounts.get(card.id) || 0) + 1);
    });
    return pool.filter((card) => {
        if (!card?.id) return true;
        const left = removeCounts.get(card.id) || 0;
        if (left <= 0) return true;
        removeCounts.set(card.id, left - 1);
        return false;
    });
}

function drawRandomMany(pool, count) {
    if (!Array.isArray(pool) || pool.length < count) return null;
    const picked = [];
    const used = new Set();
    while (picked.length < count) {
        const idx = Math.floor(Math.random() * pool.length);
        if (used.has(idx)) continue;
        used.add(idx);
        picked.push(pool[idx]);
    }
    return picked;
}

function estimateCpuWinRate(candidateCpuHand, boardCards, basePool, simulationCount = CPU_SIMULATION_COUNT) {
    if (!Array.isArray(candidateCpuHand) || candidateCpuHand.length !== 2) return -1;
    if (!Array.isArray(boardCards) || boardCards.length !== 3) return -1;
    const pool = buildPoolWithoutCards(basePool, [...candidateCpuHand, ...boardCards]);
    if (pool.length < 4) return -1;
    let score = 0;
    for (let i = 0; i < simulationCount; i += 1) {
        const draw = drawRandomMany(pool, 4);
        if (!draw) break;
        const enemyHand = [draw[0], draw[1]];
        const futureBoard = [boardCards[0], boardCards[1], boardCards[2], draw[2], draw[3]];
        const cpuBest = chooseBestFiveFromSeven([...candidateCpuHand, ...futureBoard]);
        const enemyBest = chooseBestFiveFromSeven([...enemyHand, ...futureBoard]);
        if (!cpuBest || !enemyBest) continue;
        const cmp = compareScore(cpuBest, enemyBest);
        if (cmp > 0) score += 1;
        else if (cmp === 0) score += 0.5;
    }
    return score / simulationCount;
}

function getLatestGraveOptions() {
    const options = [];
    ['player', 'cpu'].forEach((ownerKey) => {
        const grave = state.players[ownerKey].graveyard;
        if (!grave.length) return;
        options.push({
            ownerKey,
            card: grave[grave.length - 1]
        });
    });
    return options;
}

function chooseCpuPlan() {
    const cpu = state.players.cpu;
    const boardCards = state.board.slice();
    const basePool = state.deck.slice();
    if (cpu.hand.length !== 2 || boardCards.length !== 3) {
        return { discardIndex: 0, source: 'deck', graveOwnerKey: null, expected: 0 };
    }

    const plans = [];
    for (let discardIndex = 0; discardIndex < cpu.hand.length; discardIndex += 1) {
        const keepCard = cpu.hand[discardIndex === 0 ? 1 : 0];
        if (!keepCard) continue;
        const discarded = cpu.hand[discardIndex];
        const canJudgment = discarded.effectType === EFFECT_TYPE.JUDGMENT && !isEffectDisabled();

        const evaluateFixedCard = (pickedCard) => {
            const hand = [keepCard, pickedCard];
            const poolAfter = buildPoolWithoutCards(basePool, [pickedCard]);
            const expected = estimateCpuWinRate(hand, boardCards, poolAfter);
            return { expected, source: 'grave', graveOwnerKey: null, pickedCard };
        };

        const evaluateDeckAverage = () => {
            if (!basePool.length) return -1;
            const sampled = sampleCards(basePool, CPU_DRAW_SAMPLE_COUNT);
            if (!sampled.length) return -1;
            const total = sampled.reduce((sum, card) => {
                const hand = [keepCard, card];
                const poolAfter = buildPoolWithoutCards(basePool, [card]);
                const expected = estimateCpuWinRate(hand, boardCards, poolAfter, Math.floor(CPU_SIMULATION_COUNT / 2));
                return sum + expected;
            }, 0);
            return total / sampled.length;
        };

        const deckExpected = evaluateDeckAverage();
        let bestPlan = {
            discardIndex,
            source: 'deck',
            graveOwnerKey: null,
            expected: deckExpected
        };

        if (canJudgment) {
            const options = getLatestGraveOptions().filter((entry) => entry.ownerKey !== 'cpu');
            options.push({ ownerKey: 'cpu', card: discarded });
            for (const option of options) {
                if (!option?.card) continue;
                const fixed = evaluateFixedCard(option.card);
                if (fixed.expected > bestPlan.expected) {
                    bestPlan = {
                        discardIndex,
                        source: 'grave',
                        graveOwnerKey: option.ownerKey,
                        expected: fixed.expected
                    };
                }
            }
        }
        plans.push(bestPlan);
    }

    plans.sort((a, b) => b.expected - a.expected);
    return plans[0] || { discardIndex: 0, source: 'deck', graveOwnerKey: null, expected: 0 };
}

function isEffectDisabled() {
    return state.effectsDisabledByFool;
}

function applyDiscardSpecial(card, ownerKey) {
    if (!card || isEffectDisabled()) return;
    if (card.effectType === EFFECT_TYPE.WORLD) {
        const otherKey = ownerKey === 'player' ? 'cpu' : 'player';
        state.players[otherKey].canExchange = false;
        state.players.player.bettingEnabled = hasFoolInHand('player');
        state.players.cpu.bettingEnabled = hasFoolInHand('cpu');
        pushLog(`「世界」破棄: ${state.players[otherKey].name} は交換不能になった。`);
        showEffectOverlay('THE WORLD - EXCHANGE LOCK');
    }
}

function applyBoardSpecial(card) {
    if (!card) return;
    if (card.effectType === EFFECT_TYPE.FOOL) {
        if (!state.effectsDisabledByFool) {
            state.effectsDisabledByFool = true;
            state.pendingJudgment = null;
            pushLog('「愚者」が場に出現。以降、世界/審判の効果は無効。');
            showEffectOverlay('THE FOOL - CHAOS NULLIFICATION');
        }
        return;
    }
    if (card.effectType === EFFECT_TYPE.WORLD && !isEffectDisabled()) {
        state.players.player.bettingEnabled = hasFoolInHand('player');
        state.players.cpu.bettingEnabled = hasFoolInHand('cpu');
        state.forceShowdown = true;
        pushLog('「世界」が場に出現。強制ショーダウン発動。');
        showEffectOverlay('THE WORLD - TIME STOP');
    }
}

function revealBoard(count) {
    for (let i = 0; i < count; i += 1) {
        const card = drawCard();
        if (!card) break;
        state.board.push(card);
        applyBoardSpecial(card);
    }
    if (state.forceShowdown) {
        forceShowdown();
    }
}

function forceShowdown() {
    state.phase = 'showdown';
    state.result = evaluateShowdown();
    render();
}

function drawFor(ownerKey) {
    const card = drawCard();
    if (card) {
        state.players[ownerKey].hand.push(card);
    }
}

async function processCpuExchange() {
    const cpu = state.players.cpu;
    if (!cpu.canExchange) {
        pushLog('CPUは交換不能。ドローをスキップ。');
        state.phase = 'turn-ready';
        return;
    }
    if (!cpu.hand.length) {
        state.phase = 'turn-ready';
        return;
    }
    state.cpuThinking = true;
    state.phase = 'cpu-thinking';
    pushLog('CPUが交換手を読んでいます...');
    render();
    await wait(420);

    const plan = chooseCpuPlan();
    const discardIndex = Math.max(0, Math.min(cpu.hand.length - 1, Number(plan.discardIndex) || 0));
    const [discarded] = cpu.hand.splice(discardIndex, 1);
    addToGrave('cpu', discarded);
    pushLog(`CPUは ${getCardDisplayName(discarded)} を墓地に送った（期待勝率 ${(Math.max(0, plan.expected || 0) * 100).toFixed(1)}%）。`);
    applyDiscardSpecial(discarded, 'cpu');
    render();
    await wait(280);

    const canJudgment = discarded.effectType === EFFECT_TYPE.JUDGMENT && !isEffectDisabled();
    if (canJudgment && plan.source === 'grave' && plan.graveOwnerKey) {
        const gained = takeLatestGraveCard(plan.graveOwnerKey);
        if (gained) {
            cpu.hand.push(gained);
            pushLog(`CPUは審判で ${state.players[plan.graveOwnerKey].name} の最新墓地カードを取得。`);
            showEffectOverlay('JUDGMENT - SOUL RETRIEVE');
        } else {
            drawFor('cpu');
            pushLog('CPUの審判対象が消失。山札から補充。');
        }
    } else if (canJudgment) {
        const options = getLatestGraveOptions();
        if (options.length > 0 && plan.source === 'grave') {
            const pickedOwner = plan.graveOwnerKey || options[0].ownerKey;
            const gained = takeLatestGraveCard(pickedOwner);
            if (gained) {
                cpu.hand.push(gained);
                pushLog(`CPUは審判で ${state.players[pickedOwner].name} の最新墓地カードを取得。`);
                showEffectOverlay('JUDGMENT - SOUL RETRIEVE');
            } else {
                drawFor('cpu');
                pushLog('CPUの審判対象が消失。山札から補充。');
            }
        } else {
            drawFor('cpu');
            pushLog('CPUは審判を使ったが対象なし。山札から補充。');
        }
    } else {
        drawFor('cpu');
    }
    state.cpuThinking = false;
    state.phase = 'turn-ready';
}

async function finishPlayerExchange() {
    if (state.forceShowdown) {
        forceShowdown();
        return;
    }
    await processCpuExchange();
    render();
}

function startNewGame() {
    resetState();
    state.deck = shuffle(buildDeck());
    dealTo('player', 2);
    dealTo('cpu', 2);
    state.phase = 'preflop';
    pushLog('プリフロップ: 手札2枚を配布。');
    render();
}

async function handleNext() {
    if (!state) return;
    if (state.phase === 'preflop') {
        revealBoard(3);
        if (state.phase !== 'showdown') {
            state.phase = 'draw-player';
            if (!state.players.player.canExchange) {
                pushLog('あなたは交換不能。ドローをスキップ。');
                await processCpuExchange();
            }
        }
        render();
        return;
    }

    if (state.phase === 'turn-ready') {
        revealBoard(1);
        if (state.phase !== 'showdown') {
            state.phase = 'river-ready';
        }
        render();
        return;
    }

    if (state.phase === 'river-ready') {
        revealBoard(1);
        if (state.phase !== 'showdown') {
            state.phase = 'showdown';
            state.result = evaluateShowdown();
        }
        render();
    }
}

async function onPlayerCardClick(index) {
    if (!state || state.phase !== 'draw-player') return;
    const player = state.players.player;
    if (!player.canExchange) return;
    if (index < 0 || index >= player.hand.length) return;

    const [discarded] = player.hand.splice(index, 1);
    addToGrave('player', discarded);
    pushLog(`あなたは ${getCardDisplayName(discarded)} を墓地に送った。`);
    applyDiscardSpecial(discarded, 'player');

    const canJudgment = discarded.effectType === EFFECT_TYPE.JUDGMENT && !isEffectDisabled();
    if (canJudgment) {
        const options = getLatestGraveOptions();
        if (options.length > 0) {
            state.phase = 'draw-player-judgment';
            state.pendingJudgment = { options };
            render();
            return;
        }
    }

    drawFor('player');
    await finishPlayerExchange();
}

async function onJudgmentPick(ownerKey) {
    if (!state || state.phase !== 'draw-player-judgment') return;
    const gained = takeLatestGraveCard(ownerKey);
    if (gained) {
        state.players.player.hand.push(gained);
        pushLog(`審判発動: ${state.players[ownerKey].name} の最新墓地カードを取得。`);
        showEffectOverlay('JUDGMENT - SOUL RETRIEVE');
    } else {
        drawFor('player');
        pushLog('審判対象が消失したため、山札から1枚補充。');
    }
    state.pendingJudgment = null;
    state.phase = 'draw-player';
    await finishPlayerExchange();
}

function getPhaseText() {
    if (!state) return '';
    if (state.phase === 'idle') return '「新しい勝負を始める」を押してください。';
    if (state.phase === 'preflop') return 'プリフロップ完了。次へでフロップを開示。';
    if (state.phase === 'draw-player') return 'ドローフェーズ: 手札1枚を選んで交換。';
    if (state.phase === 'draw-player-judgment') return '審判発動: 取得カードを選択。';
    if (state.phase === 'cpu-thinking') return 'CPUが交換手を計算中...';
    if (state.phase === 'turn-ready') return '交換完了。次へでターンを開示。';
    if (state.phase === 'river-ready') return '次へでリバーを開示。';
    if (state.phase === 'showdown') {
        if (state.forceShowdown) {
            const p = state.players.player.bettingEnabled ? 'ON' : 'OFF';
            const c = state.players.cpu.bettingEnabled ? 'ON' : 'OFF';
            return `強制ショーダウン中（愚者所持者のみbettingEnabled: あなた ${p} / CPU ${c}）`;
        }
        return 'ショーダウン完了。';
    }
    return '';
}

function getResultText() {
    if (!state || state.phase !== 'showdown' || !state.result) return '';
    const { winner, playerBest, cpuBest } = state.result;
    const winnerText = winner === 'player' ? 'あなたの勝利' : winner === 'cpu' ? 'CPUの勝利' : '引き分け';
    return `${winnerText} | あなた: ${playerBest.rankLabel} / CPU: ${cpuBest.rankLabel}`;
}

function getSuitClass(card) {
    if (!card) return 'none';
    if (card.suit === 'Wand') return 'wand';
    if (card.suit === 'Sword') return 'sword';
    if (card.suit === 'Cup') return 'cup';
    if (card.suit === 'Pentacle') return 'pentacle';
    return 'none';
}

function getTarotSpriteIndex(card) {
    if (!card) return 110;
    if (card.isArcana) return 80 + Number(card.number || 0);
    const number = Math.max(1, Math.min(14, Number(card.number || 1))) - 1;
    if (card.suit === 'Wand') return number;
    if (card.suit === 'Pentacle') return 20 + number;
    if (card.suit === 'Cup') return 40 + number;
    if (card.suit === 'Sword') return 60 + number;
    return 110;
}

function createCardElement(card, options = {}) {
    const { hidden = false, clickable = false, onClick = null } = options;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `tarot-card ${hidden ? 'is-hidden' : ''} ${getSuitClass(card)}`;

    if (hidden) {
        el.classList.add('is-static');
        el.innerHTML = '<span class="tarot-card-back">?</span>';
        return el;
    }

    if (card.isArcana) {
        el.classList.add('is-arcana');
    }

    const spriteIndex = getTarotSpriteIndex(card);
    const col = spriteIndex % 10;
    const row = Math.floor(spriteIndex / 10);
    const art = document.createElement('div');
    art.className = 'tarot-card-art';
    art.style.setProperty('--tarot-sheet-w', `${TAROT_SPRITE_SHEET_W}px`);
    art.style.setProperty('--tarot-sheet-h', `${TAROT_SPRITE_SHEET_H}px`);
    art.style.setProperty('--tarot-x', `${col * TAROT_SPRITE_TILE_W}px`);
    art.style.setProperty('--tarot-y', `${row * TAROT_SPRITE_TILE_H}px`);
    art.style.setProperty('--tarot-sprite-src', `url('${TAROT_SPRITE_SRC}')`);
    el.appendChild(art);

    const title = document.createElement('div');
    title.className = 'tarot-card-title';
    title.textContent = card.isArcana ? (ARCANA_NAME[card.number] || 'アルカナ') : card.suit;

    const number = document.createElement('div');
    number.className = 'tarot-card-number';
    number.textContent = String(card.number);

    el.appendChild(title);
    el.appendChild(number);

    if (clickable && typeof onClick === 'function') {
        el.classList.add('is-clickable');
        el.addEventListener('click', onClick);
    } else {
        el.classList.add('is-static');
    }
    return el;
}

function renderCardRow(container, cards, options = {}) {
    if (!container) return;
    container.innerHTML = '';
    cards.forEach((card, index) => {
        const clickable = options.clickable && typeof options.onCardClick === 'function';
        const el = createCardElement(card, {
            hidden: options.hidden,
            clickable,
            onClick: () => options.onCardClick(index)
        });
        container.appendChild(el);
    });
}

function renderGraveRow(container, cards) {
    if (!container) return;
    container.innerHTML = '';
    const list = cards.slice().reverse().slice(0, 6);
    list.forEach((card) => {
        const item = document.createElement('div');
        item.className = 'tarot-grave-item';
        item.textContent = `${card.number} ${getCardDisplayName(card)}`;
        container.appendChild(item);
    });
}

function renderBoard() {
    if (!ui.board) return;
    ui.board.innerHTML = '';
    state.board.forEach((card) => {
        const cardEl = createCardElement(card, { hidden: false });
        ui.board.appendChild(cardEl);
    });
    for (let i = state.board.length; i < 5; i += 1) {
        const slot = document.createElement('div');
        slot.className = 'tarot-board-slot';
        slot.textContent = '---';
        ui.board.appendChild(slot);
    }
}

function renderJudgmentPanel() {
    if (!ui.judgmentPanel || !ui.judgmentOptions) return;
    const pending = state.pendingJudgment;
    if (!pending || !Array.isArray(pending.options) || pending.options.length === 0) {
        ui.judgmentPanel.style.display = 'none';
        ui.judgmentOptions.innerHTML = '';
        return;
    }
    ui.judgmentPanel.style.display = 'block';
    ui.judgmentOptions.innerHTML = '';
    pending.options.forEach((option) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const ownerName = state.players[option.ownerKey].name;
        btn.textContent = `${ownerName}: ${getCardDisplayName(option.card)} (${option.card.number})`;
        btn.addEventListener('click', () => onJudgmentPick(option.ownerKey));
        ui.judgmentOptions.appendChild(btn);
    });
}

function renderButtons() {
    if (!ui.nextButton) return;
    if (!state || state.phase === 'idle' || state.phase === 'showdown') {
        ui.nextButton.disabled = true;
        ui.nextButton.textContent = '進行終了';
        return;
    }
    if (state.phase === 'preflop') {
        ui.nextButton.disabled = false;
        ui.nextButton.textContent = 'フロップを開く';
        return;
    }
    if (state.phase === 'draw-player' || state.phase === 'draw-player-judgment') {
        ui.nextButton.disabled = true;
        ui.nextButton.textContent = '手札選択中';
        return;
    }
    if (state.phase === 'cpu-thinking') {
        ui.nextButton.disabled = true;
        ui.nextButton.textContent = 'CPU思考中...';
        return;
    }
    if (state.phase === 'turn-ready') {
        ui.nextButton.disabled = false;
        ui.nextButton.textContent = 'ターンを開く';
        return;
    }
    if (state.phase === 'river-ready') {
        ui.nextButton.disabled = false;
        ui.nextButton.textContent = 'リバーを開く';
    }
}

function renderLog() {
    if (!ui.log) return;
    ui.log.innerHTML = '';
    state.log.forEach((line) => {
        const row = document.createElement('div');
        row.className = 'tarot-log-row';
        row.textContent = line;
        ui.log.appendChild(row);
    });
}

function render() {
    if (!state || !ui.root) return;
    renderBoard();
    renderCardRow(ui.playerHand, state.players.player.hand, {
        hidden: false,
        clickable: state.phase === 'draw-player',
        onCardClick: onPlayerCardClick
    });
    renderCardRow(ui.cpuHand, state.players.cpu.hand, {
        hidden: state.phase !== 'showdown',
        clickable: false
    });
    renderGraveRow(ui.playerGrave, state.players.player.graveyard);
    renderGraveRow(ui.cpuGrave, state.players.cpu.graveyard);
    renderJudgmentPanel();
    renderButtons();
    if (ui.stateText) ui.stateText.textContent = getPhaseText();
    if (ui.resultText) ui.resultText.textContent = getResultText();
    renderLog();
}

function bindElements() {
    ui.root = document.getElementById('tabContentTarot');
    ui.startButton = document.getElementById('tarotStartButton');
    ui.nextButton = document.getElementById('tarotNextButton');
    ui.stateText = document.getElementById('tarotStateText');
    ui.board = document.getElementById('tarotPokerBoard');
    ui.cpuHand = document.getElementById('tarotCpuHand');
    ui.playerHand = document.getElementById('tarotPlayerHand');
    ui.cpuGrave = document.getElementById('tarotCpuGrave');
    ui.playerGrave = document.getElementById('tarotPlayerGrave');
    ui.resultText = document.getElementById('tarotResultText');
    ui.log = document.getElementById('tarotLog');
    ui.effectOverlay = document.getElementById('tarotEffectOverlay');
    ui.judgmentPanel = document.getElementById('tarotJudgmentPanel');
    ui.judgmentOptions = document.getElementById('tarotJudgmentOptions');
}

function bindEvents() {
    if (isBound) return;
    isBound = true;
    ui.startButton?.addEventListener('click', startNewGame);
    ui.nextButton?.addEventListener('click', handleNext);
}

export async function loadTarotPokerPage() {
    bindElements();
    bindEvents();
    if (!state) {
        resetState();
    }
    render();
}
