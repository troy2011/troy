const SUITS = ['Wand', 'Sword', 'Cup', 'Pentacle'];
const SUIT_RANK = {
    Wand: 4,
    Pentacle: 3,
    Cup: 2,
    Sword: 1,
    None: 0,
    All: 0
};

const SUIT_THEME_COLOR = {
    Wand: '#b11818',
    Sword: '#c29b14',
    Cup: '#1e63c6',
    Pentacle: '#1e8f3c'
};

const ARCANA_FLUSH_SUIT_OPTIONS = {
    1: ['All'],
    16: ['Sword'],
    17: ['Cup'],
    18: ['Pentacle'],
    19: ['Wand']
};

const EFFECT_TYPE = {
    WORLD: 'World',
    JUDGMENT: 'Judgment',
    FOOL: 'Fool',
    NONE: 'None'
};

const HAND_RANK_LABEL = {
    11: '繝輔ぃ繧､繝悶き繝ｼ繝・,
    10: '繧ｹ繝医Ξ繝ｼ繝医ヵ繝ｩ繝・・ｽ・ｽ繝･',
    9: '繝輔か繝ｼ繧ｫ繝ｼ繝・,
    8: '繝輔Ν繝上え繧ｹ',
    4.5: '\u30a8\u30ec\u30e1\u30f3\u30c8',
    7: '繝輔Λ繝・・ｽ・ｽ繝･',
    6: '繧ｹ繝医Ξ繝ｼ繝・,
    5: '繧ｹ繝ｪ繝ｼ繧ｫ繝ｼ繝・,
    4: '繝・・ｽE繝壹い',
    3: '繝ｯ繝ｳ繝壹い',
    2: '繝上う繧ｫ繝ｼ繝・
};

const ARCANA_NAME = {
    0: '諢夊・,
    1: '鬲碑｡灘ｸｫ',
    2: '螂ｳ謨咏嚊',
    3: '螂ｳ蟶・,
    4: '逧・・ｽ・ｽE,
    5: '謨咏嚊',
    6: '諱倶ｺｺ',
    7: '謌ｦ霆・,
    8: '蜉・,
    9: '髫閠・,
    10: '驕句多縺ｮ霈ｪ',
    11: '豁｣鄒ｩ',
    12: '蜷翫ｋ縺輔ｌ縺溽塙',
    13: '豁ｻ逾・,
    14: '遽蛻ｶ',
    15: '謔ｪ鬲・,
    16: '蝪・,
    17: '譏・,
    18: '譛・,
    19: '螟ｪ髯ｽ',
    20: '蟇ｩ蛻､',
    21: '荳也阜'
};

const TAROT_SPRITE_SRC = 'Sprites/Buildings/tarot.png';
const TAROT_SPRITE_TILE_W = 48;
const TAROT_SPRITE_TILE_H = 80;
const TAROT_SPRITE_SHEET_W = 512;
const TAROT_SPRITE_SHEET_H = 1024;
const TAROT_BACK_SPRITE_INDEX = 110;
const TAROT_REVEAL_FRAME_START = 110;
const TAROT_REVEAL_FRAME_END = 119;
const TAROT_REVEAL_FRAMES = Array.from(
    { length: TAROT_REVEAL_FRAME_END - TAROT_REVEAL_FRAME_START + 1 },
    (_, i) => TAROT_REVEAL_FRAME_START + i
);
const TAROT_REVEAL_FRAME_MS = 38;
const TEST_POINT_START = 300;
const TEST_BET_UNIT = 10;
const CPU_SIMULATION_COUNT = 180;
const CPU_DRAW_SAMPLE_COUNT = 16;
const BET_ACTION_TEMPO_MS = 1800;
const BET_ACTION_GAP_MS = 520;
const ROUND_CUTIN_TEMPO_MS = 1960;
const BET_ACTION_LABEL = {
    check: '繝√ぉ繝・・ｽ・ｽ',
    call: '繧ｳ繝ｼ繝ｫ',
    bet: 'BET',
    raise: '繝ｬ繧､繧ｺ',
    fold: '繝輔か繝ｼ繝ｫ繝・
};

const BET_ACTION_ICON = {
    check: '✓',
    call: '↔',
    bet: '◆',
    raise: '↗',
    fold: '✕'
};

let isBound = false;
let state = null;

const ui = {
    root: null,
    pokerRoot: null,
    startButton: null,
    nextButton: null,
    stateText: null,
    deckAnchor: null,
    board: null,
    cpuHand: null,
    playerHand: null,
    cpuGrave: null,
    playerGrave: null,
    resultText: null,
    log: null,
    effectOverlay: null,
    cutin: null,
    judgmentPanel: null,
    judgmentOptions: null,
    bettingInfo: null,
    betPopup: null,
    potText: null,
    potValueText: null,
    playerPointText: null,
    cpuPointText: null,
    betActionHint: null,
    betCheckButton: null,
    betCallButton: null,
    betBetButton: null,
    betRaiseButton: null,
    betFoldButton: null,
    playerOutcome: null,
    cpuOutcome: null,
    playerRole: null,
    cpuRole: null,
    playerAction: null,
    cpuAction: null
};

const DAILY_FORTUNE_OVERLAY_ID = 'dailyTarotFortuneOverlay';
const DAILY_FORTUNE_MODAL_ID = 'dailyTarotFortuneModal';
const DAILY_FORTUNE_DRAW_BUTTON_ID = 'dailyTarotFortuneDrawButton';
const DAILY_FORTUNE_CLOSE_BUTTON_ID = 'dailyTarotFortuneCloseButton';
const DAILY_FORTUNE_CARD_HOST_ID = 'dailyTarotFortuneCardHost';
const DAILY_FORTUNE_TEXT_ID = 'dailyTarotFortuneText';
const DAILY_FORTUNE_TITLE_ID = 'dailyTarotFortuneTitle';

let dailyFortuneCheckedSession = false;
let dailyFortuneClaimedSession = false;
let dailyFortuneCanDrawSession = false;
let dailyFortuneInFlight = false;
let potDisplayValue = null;
let potRollAnimationId = 0;

function buildApiUrlLocal(endpoint) {
    if (!endpoint) return '';
    if (/^https?:\/\//i.test(endpoint)) return endpoint;
    const base = String(window.API_BASE_URL || '').trim().replace(/\/$/, '');
    return base ? `${base}${endpoint}` : endpoint;
}

async function callJsonApi(endpoint, body) {
    const response = await fetch(buildApiUrlLocal(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = data?.error || `HTTP ${response.status}`;
        throw new Error(message);
    }
    return data;
}

function updateGlobalPsDisplay(balance) {
    if (!Number.isFinite(Number(balance))) return;
    const value = String(Math.max(0, Math.floor(Number(balance))));
    const globalPoints = document.getElementById('globalPoints');
    if (globalPoints) globalPoints.textContent = value;
    const currentPoints = document.getElementById('currentPoints');
    if (currentPoints) currentPoints.textContent = value;
}

function getCardDataFromFortuneResult(result) {
    return {
        id: result?.cardId || 'fortune-card',
        number: Number(result?.cardNumber || 0),
        suit: String(result?.suit || 'None'),
        isArcana: !!result?.isArcana,
        effectType: String(result?.effectType || EFFECT_TYPE.NONE)
    };
}

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

function getRectCenter(rect) {
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

function setArtSpriteByIndex(artEl, spriteIndex) {
    if (!artEl) return;
    const col = spriteIndex % 10;
    const row = Math.floor(spriteIndex / 10);
    artEl.style.setProperty('--tarot-sheet-w', `${TAROT_SPRITE_SHEET_W}px`);
    artEl.style.setProperty('--tarot-sheet-h', `${TAROT_SPRITE_SHEET_H}px`);
    artEl.style.setProperty('--tarot-x', `${col * TAROT_SPRITE_TILE_W}px`);
    artEl.style.setProperty('--tarot-y', `${row * TAROT_SPRITE_TILE_H}px`);
    artEl.style.setProperty('--tarot-sprite-src', `url('${TAROT_SPRITE_SRC}')`);
}

function createBackCardData() {
    return {
        id: 'back',
        number: 0,
        suit: 'None',
        isArcana: false,
        effectType: EFFECT_TYPE.NONE
    };
}

async function animateBackToFrontOnElement(cardEl, finalCard) {
    if (!cardEl || !finalCard) return;
    const art = cardEl.querySelector('.tarot-card-art');
    if (!art) return;
    // 110,111,...,119 縺ｮ10繝輔Ξ繝ｼ繝繧貞ｿ・・ｽ・ｽ蜀咲函
    for (const frame of TAROT_REVEAL_FRAMES) {
        setArtSpriteByIndex(art, frame);
        await wait(TAROT_REVEAL_FRAME_MS);
    }
    const revealed = createCardElement(finalCard, { hidden: false, clickable: false });
    cardEl.replaceWith(revealed);
}

async function revealCpuHandFromBack() {
    if (!ui.cpuHand || !state?.players?.cpu?.hand) return;
    const cpuCards = state.players.cpu.hand;
    const cpuEls = Array.from(ui.cpuHand.querySelectorAll('.tarot-card'));
    if (!cpuEls.length || cpuEls.length !== cpuCards.length) return;
    const hasHiddenCard = cpuEls.some((el) => el.classList.contains('is-hidden'));
    if (!hasHiddenCard) return;
    for (let i = 0; i < cpuCards.length; i += 1) {
        await animateBackToFrontOnElement(cpuEls[i], cpuCards[i]);
    }
}

async function animateCardFlight(card, fromEl, toEl, durationMs = 320, scaleTo = 0.92, options = {}) {
    if (typeof document === 'undefined' || !card) return;
    const fromTarget = fromEl || ui.deckAnchor || ui.root;
    const toTarget = toEl || ui.root;
    if (!fromTarget || !toTarget) return;

    const fromRect = fromTarget.getBoundingClientRect();
    const toRect = toTarget.getBoundingClientRect();
    if (!fromRect.width || !fromRect.height) return;
    const startW = 64;
    const startH = 100;
    const fromCenter = getRectCenter(fromRect);
    const toCenter = getRectCenter(toRect);

    const ghost = createCardElement(card, { hidden: Boolean(options.hidden), clickable: false });
    ghost.classList.add('tarot-card-fly');
    ghost.style.position = 'fixed';
    ghost.style.left = `${fromCenter.x - startW / 2}px`;
    ghost.style.top = `${fromCenter.y - startH / 2}px`;
    ghost.style.width = `${startW}px`;
    ghost.style.height = `${startH}px`;
    ghost.style.margin = '0';
    ghost.style.zIndex = '5000';
    ghost.style.pointerEvents = 'none';
    ghost.style.transform = 'translate(0px, 0px) scale(1)';
    ghost.style.opacity = '0.98';
    document.body.appendChild(ghost);

    const dx = toCenter.x - fromCenter.x;
    const dy = toCenter.y - fromCenter.y;

    await new Promise((resolve) => {
        requestAnimationFrame(() => {
            ghost.style.transition = `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${durationMs}ms ease`;
            ghost.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleTo})`;
            ghost.style.opacity = '0.86';
            setTimeout(resolve, durationMs + 16);
        });
    });

    if (ghost.parentElement) ghost.remove();
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
            suit: number === 1 ? 'All' : 'None',
            isArcana: true,
            effectType
        });
    }
    return deck;
}

function resetState() {
    stopPotRollAnimation();
    potDisplayValue = null;
    state = {
        phase: 'idle',
        drawRound: 0,
        deck: [],
        board: [],
        players: {
            player: {
                id: 'player',
                name: '縺ゅ↑縺・,
                hand: [],
                graveyard: [],
                canExchange: true,
                bettingEnabled: false,
                testPoints: TEST_POINT_START
            },
            cpu: {
                id: 'cpu',
                name: 'CPU',
                hand: [],
                graveyard: [],
                canExchange: true,
                bettingEnabled: false,
                testPoints: TEST_POINT_START
            }
        },
        graveyard: [],
        pot: 0,
        betting: null,
        handSettled: false,
        forceShowdown: false,
        effectsDisabledByFool: false,
        judgmentBoardDrawRound: 0,
        pendingJudgment: null,
        cpuThinking: false,
        initialDealAnimating: false,
        initialDealRevealedCount: 0,
        showdownRevealDone: false,
        showdownRevealRunning: false,
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

function clearBetActionLabels() {
    const labels = [ui.playerAction, ui.cpuAction];
    labels.forEach((el) => {
        if (!el) return;
        el.textContent = '';
        el.classList.remove('show', 'is-player', 'is-cpu');
    });
}

function getBetActionLabel(action) {
    return BET_ACTION_LABEL[action] || String(action || '').toUpperCase();
}

async function showActionCutin(ownerKey, action) {
    const label = getBetActionLabel(action);
    const ownerName = ownerKey === 'player' ? '縺ゅ↑縺・ : 'CPU';
    const ownerClass = ownerKey === 'player' ? 'is-player' : 'is-cpu';
    const actionEl = ownerKey === 'player' ? ui.playerAction : ui.cpuAction;
    if (actionEl) {
        actionEl.textContent = label;
        actionEl.classList.remove('is-player', 'is-cpu');
        actionEl.classList.add('show', ownerClass);
    }
    if (ui.cutin) {
        ui.cutin.textContent = `${ownerName} ${label}`;
        ui.cutin.classList.remove('is-player', 'is-cpu');
        ui.cutin.classList.add('show', ownerClass);
    }
    await wait(BET_ACTION_TEMPO_MS);
    if (actionEl) {
        actionEl.classList.remove('show', 'is-player', 'is-cpu');
        actionEl.textContent = '';
    }
    if (ui.cutin) {
        ui.cutin.classList.remove('show', 'is-player', 'is-cpu');
    }
    await wait(BET_ACTION_GAP_MS);
}

async function showRoundCutin(text) {
    if (!text) return;
    if (!ui.cutin) {
        await wait(ROUND_CUTIN_TEMPO_MS);
        return;
    }
    ui.cutin.textContent = text;
    ui.cutin.classList.remove('is-player', 'is-cpu');
    ui.cutin.classList.add('show');
    await wait(ROUND_CUTIN_TEMPO_MS);
    ui.cutin.classList.remove('show');
    await wait(BET_ACTION_GAP_MS);
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

function getAllGraveOptions() {
    const options = [];
    ['player', 'cpu'].forEach((ownerKey) => {
        const grave = state.players[ownerKey]?.graveyard || [];
        for (let i = grave.length - 1; i >= 0; i -= 1) {
            const card = grave[i];
            if (!card) continue;
            options.push({ ownerKey, cardId: card.id, card });
        }
    });
    return options;
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

function takeGraveCardById(ownerKey, cardId) {
    if (!ownerKey || !cardId) return null;
    const grave = state.players[ownerKey]?.graveyard;
    if (!grave || !grave.length) return null;
    let hitIndex = -1;
    for (let i = grave.length - 1; i >= 0; i -= 1) {
        if (grave[i]?.id === cardId) {
            hitIndex = i;
            break;
        }
    }
    if (hitIndex < 0) return null;
    const [card] = grave.splice(hitIndex, 1);
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
    return getCardNameLabel(card);
}

function toRomanNumber(value) {
    const number = Math.max(0, Math.floor(Number(value) || 0));
    const romanMap = [
        [1000, 'M'],
        [900, 'CM'],
        [500, 'D'],
        [400, 'CD'],
        [100, 'C'],
        [90, 'XC'],
        [50, 'L'],
        [40, 'XL'],
        [10, 'X'],
        [9, 'IX'],
        [5, 'V'],
        [4, 'IV'],
        [1, 'I']
    ];
    if (number <= 0) return '0';
    let rest = number;
    let text = '';
    for (const [unit, symbol] of romanMap) {
        while (rest >= unit) {
            text += symbol;
            rest -= unit;
        }
    }
    return text;
}

function getMinorArcanaRankLabel(number) {
    const n = Number(number) || 0;
    if (n === 1) return 'Ace';
    if (n === 11) return 'Page';
    if (n === 12) return 'Knight';
    if (n === 13) return 'Queen';
    if (n === 14) return 'King';
    return toRomanNumber(n);
}

function getCardNameLabel(card) {
    if (!card) return '';
    if (card.isArcana) return ARCANA_NAME[card.number] || 'Arcana';
    return getMinorArcanaRankLabel(card.number);
}
function getCardNumberLabel(card) {
    if (!card) return '';
    if (!card.isArcana && Number(card.number) === 1) return 'A';
    return String(card.number);
}

function getCardValueOptions(card) {
    if (!card) return [0];
    const num = Number(card.number) || 0;
    if (!card.isArcana && num === 1) return [1, 15];
    return [num];
}

function getCardPrimaryValue(card) {
    const values = getCardValueOptions(card);
    return values.length ? Math.max(...values) : 0;
}

function getCardSuitOptionsForFlush(card) {
    if (!card) return ['None'];
    if (!card.isArcana) return [card.suit];
    const fromMap = ARCANA_FLUSH_SUIT_OPTIONS[Number(card.number)];
    if (Array.isArray(fromMap) && fromMap.length > 0) return fromMap.slice();
    if (card.suit === 'All') return ['All'];
    return ['None'];
}

function getCardSuitForFlush(card) {
    const options = getCardSuitOptionsForFlush(card);
    return options[0] || 'None';
}

function matchesSuit(card, suit) {
    const options = getCardSuitOptionsForFlush(card);
    return options.includes(suit) || options.includes('All');
}

function getCardSuitStrength(card) {
    const options = getCardSuitOptionsForFlush(card);
    if (options.includes('All')) return 5;
    return options.reduce((max, suit) => Math.max(max, SUIT_RANK[suit] || 0), 0);
}

function compareNumberDesc(a, b) {
    return getCardPrimaryValue(b) - getCardPrimaryValue(a);
}

function compareCardsForFlush(a, b) {
    const diff = getCardPrimaryValue(b) - getCardPrimaryValue(a);
    if (diff !== 0) return diff;
    const arcanaDiff = Number(b.isArcana) - Number(a.isArcana);
    if (arcanaDiff !== 0) return arcanaDiff;
    return getCardSuitStrength(b) - getCardSuitStrength(a);
}

function getUniqueNumbersDesc(cards) {
    const seen = new Set();
    const out = [];
    cards
        .slice()
        .sort(compareNumberDesc)
        .forEach((card) => {
            const values = getCardValueOptions(card);
            values.forEach((value) => {
                if (seen.has(value)) return;
                seen.add(value);
                out.push(value);
            });
        });
    return out.sort((a, b) => b - a);
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
        const valueVector = bestFive.map((card) => getCardPrimaryValue(card)).sort((a, b) => b - a);
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

function detectElement(cards) {
    const arcanaCards = cards.filter((card) => card?.isArcana);
    if (!arcanaCards.length) return null;

    const suitSet = new Set();
    cards.forEach((card) => {
        if (!card) return;
        const options = getCardSuitOptionsForFlush(card);
        options.forEach((suit) => {
            if (SUITS.includes(suit)) suitSet.add(suit);
        });
    });

    if (suitSet.size < SUITS.length) return null;

    const maxArcana = arcanaCards.reduce((max, card) => {
        const num = Number(card?.number) || 0;
        return Math.max(max, num);
    }, 0);

    return {
        maxArcana
    };
}

function getScoreVectorByCounts(entries, cards = []) {
    const hasMinorAce = cards.some((card) => !card?.isArcana && Number(card?.number) === 1);
    const aceValue = hasMinorAce ? 15 : 1;
    const out = [];
    entries.forEach(([value, count]) => {
        const mapped = value === 1 ? aceValue : value;
        for (let i = 0; i < count; i += 1) {
            out.push(mapped);
        }
    });
    return out;
}

function mapCountEntryValue(value, cards = []) {
    if (value !== 1) return value;
    const hasMinorAce = cards.some((card) => !card?.isArcana && Number(card?.number) === 1);
    return hasMinorAce ? 15 : 1;
}

function scoreFiveCards(cards) {
    const sorted = cards.slice().sort(compareCardsForFlush);
    let maxNumber = sorted.reduce((max, card) => Math.max(max, getCardPrimaryValue(card)), 0);
    const arcanaNumbers = sorted.filter((card) => card.isArcana).map((card) => card.number);
    const hasArcana = arcanaNumbers.length > 0;
    const allArcana = sorted.every((card) => card.isArcana);
    const maxArcana = hasArcana ? Math.max(...arcanaNumbers) : -1;
    const suitStrength = sorted.reduce((max, card) => Math.max(max, getCardSuitStrength(card)), 0);

    const countEntries = getCountEntries(sorted);
    const flush = detectBestFlush(sorted);
    const element = detectElement(sorted);
    const straight = detectStraight(sorted);
    const straightFlush = flush ? detectStraight(flush.cards) : null;

    let rank = 2;
    let rankVector = [];
    let rankLabel = '';

    if (countEntries[0]?.[1] === 5) {
        rank = 11;
        rankVector = [mapCountEntryValue(countEntries[0][0], sorted)];
    } else if (straightFlush) {
        rank = 10;
        rankVector = [straightFlush.high];
    } else if (countEntries[0]?.[1] === 4) {
        const quad = mapCountEntryValue(countEntries[0][0], sorted);
        const kicker = mapCountEntryValue(countEntries[1]?.[0] || 0, sorted);
        rank = 9;
        rankVector = [quad, kicker];
    } else if (countEntries[0]?.[1] === 3 && countEntries[1]?.[1] === 2) {
        rank = 8;
        rankVector = [
            mapCountEntryValue(countEntries[0][0], sorted),
            mapCountEntryValue(countEntries[1][0], sorted)
        ];
    } else if (element) {
        rank = 4.5;
        rankVector = [element.maxArcana];
        maxNumber = element.maxArcana;
        rankLabel = '\u30a8\u30ec\u30e1\u30f3\u30c8';
    } else if (flush || allArcana) {
        rank = 7;
        if (flush) {
            rankVector = flush.valueVector;
        } else {
            rankVector = sorted.map((card) => getCardPrimaryValue(card)).sort((a, b) => b - a);
            rankLabel = '繧｢繝ｫ繧ｫ繝翫ヵ繝ｩ繝・・ｽ・ｽ繝･';
        }
    } else if (straight) {
        rank = 6;
        rankVector = [straight.high];
    } else if (countEntries[0]?.[1] === 3) {
        const trip = mapCountEntryValue(countEntries[0][0], sorted);
        const kickers = countEntries.slice(1).map(([v]) => mapCountEntryValue(v, sorted)).sort((a, b) => b - a);
        rank = 5;
        rankVector = [trip, ...kickers];
    } else if (countEntries[0]?.[1] === 2 && countEntries[1]?.[1] === 2) {
        const first = mapCountEntryValue(countEntries[0][0], sorted);
        const second = mapCountEntryValue(countEntries[1][0], sorted);
        const pairHigh = Math.max(first, second);
        const pairLow = Math.min(first, second);
        const kicker = mapCountEntryValue(countEntries[2]?.[0] || 0, sorted);
        rank = 4;
        rankVector = [pairHigh, pairLow, kicker];
    } else if (countEntries[0]?.[1] === 2) {
        const pair = mapCountEntryValue(countEntries[0][0], sorted);
        const kickers = countEntries.slice(1).map(([v]) => mapCountEntryValue(v, sorted)).sort((a, b) => b - a);
        rank = 3;
        rankVector = [pair, ...kickers];
    } else {
        rank = 2;
        rankVector = getScoreVectorByCounts(countEntries, sorted);
    }

    return {
        rank,
        rankLabel: rankLabel || HAND_RANK_LABEL[rank] || '蠖ｹ縺ｪ縺・,
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

function compareCardPower(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    const valueDiff = getCardPrimaryValue(a) - getCardPrimaryValue(b);
    if (valueDiff !== 0) return valueDiff;
    const arcanaDiff = Number(a.isArcana) - Number(b.isArcana);
    if (arcanaDiff !== 0) return arcanaDiff;
    const suitDiff = getCardSuitStrength(a) - getCardSuitStrength(b);
    if (suitDiff !== 0) return suitDiff;
    return 0;
}

function isSameBestFiveCards(leftScore, rightScore) {
    const leftCards = Array.isArray(leftScore?.cards) ? leftScore.cards : [];
    const rightCards = Array.isArray(rightScore?.cards) ? rightScore.cards : [];
    if (leftCards.length !== 5 || rightCards.length !== 5) return false;
    const leftIds = leftCards.map((card) => String(card?.id || '')).sort();
    const rightIds = rightCards.map((card) => String(card?.id || '')).sort();
    for (let i = 0; i < leftIds.length; i += 1) {
        if (leftIds[i] !== rightIds[i]) return false;
    }
    return true;
}

function resolveCommonBestScoreForRemainingTieBreak(leftAllCards, rightAllCards, leftBest, rightBest) {
    if (isSameBestFiveCards(leftBest, rightBest)) {
        return { enabled: true, referenceScore: leftBest };
    }
    const rightIds = new Set(
        (Array.isArray(rightAllCards) ? rightAllCards : [])
            .map((card) => card?.id)
            .filter(Boolean)
    );
    const sharedCards = (Array.isArray(leftAllCards) ? leftAllCards : [])
        .filter((card) => rightIds.has(card?.id));
    if (sharedCards.length < 5) return { enabled: false, referenceScore: null };
    const sharedBest = sharedCards.length === 5
        ? scoreFiveCards(sharedCards)
        : chooseBestFiveFromSeven(sharedCards);
    if (!sharedBest) return { enabled: false, referenceScore: null };
    if (compareScore(leftBest, sharedBest) !== 0) return { enabled: false, referenceScore: null };
    if (compareScore(rightBest, sharedBest) !== 0) return { enabled: false, referenceScore: null };
    return { enabled: true, referenceScore: sharedBest };
}

function getRemainingCardsOutsideBest(allCards, bestScore) {
    const cards = Array.isArray(allCards) ? allCards : [];
    const usedIds = new Set(
        (Array.isArray(bestScore?.cards) ? bestScore.cards : [])
            .map((card) => card?.id)
            .filter(Boolean)
    );
    return cards
        .filter((card) => !usedIds.has(card?.id))
        .sort((a, b) => compareCardPower(b, a));
}

function compareRemainingCardSets(leftCards, rightCards) {
    const left = Array.isArray(leftCards) ? leftCards : [];
    const right = Array.isArray(rightCards) ? rightCards : [];
    const maxLen = Math.max(left.length, right.length);
    for (let i = 0; i < maxLen; i += 1) {
        const cmp = compareCardPower(left[i], right[i]);
        if (cmp !== 0) return cmp;
    }
    return 0;
}

function compareHandsWithRemainingTieBreak(leftAllCards, leftBest, rightAllCards, rightBest) {
    const baseCmp = compareScore(leftBest, rightBest);
    if (baseCmp !== 0) {
        return {
            cmp: baseCmp,
            usedRemaining: false,
            leftRemaining: [],
            rightRemaining: []
        };
    }
    const commonBestResult = resolveCommonBestScoreForRemainingTieBreak(
        leftAllCards,
        rightAllCards,
        leftBest,
        rightBest
    );
    if (!commonBestResult.enabled) {
        return {
            cmp: 0,
            usedRemaining: false,
            leftRemaining: [],
            rightRemaining: []
        };
    }
    const leftRemaining = getRemainingCardsOutsideBest(leftAllCards, commonBestResult.referenceScore);
    const rightRemaining = getRemainingCardsOutsideBest(rightAllCards, commonBestResult.referenceScore);
    const remainingCmp = compareRemainingCardSets(leftRemaining, rightRemaining);
    return {
        cmp: remainingCmp,
        usedRemaining: true,
        leftRemaining,
        rightRemaining
    };
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
    const comparedResult = compareHandsWithRemainingTieBreak(playerCards, playerBest, cpuCards, cpuBest);
    const compared = comparedResult.cmp;
    const winner = compared > 0 ? 'player' : compared < 0 ? 'cpu' : 'draw';
    return {
        playerBest,
        cpuBest,
        winner,
        remainingTieBreakUsed: !!comparedResult.usedRemaining,
        playerRemainingCards: comparedResult.leftRemaining || [],
        cpuRemainingCards: comparedResult.rightRemaining || []
    };
}

function isBettingPhase() {
    return typeof state?.phase === 'string' && state.phase.startsWith('betting-');
}

function formatPointNumber(value) {
    const amount = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    return amount.toLocaleString('ja-JP');
}

function formatTestPoint(value) {
    return `${formatPointNumber(value)} TP`;
}

function formatBetActionButtonLabel(action, amountText = '') {
    const icon = BET_ACTION_ICON[action] || '•';
    const label = BET_ACTION_LABEL[action] || String(action || '').toUpperCase();
    if (!amountText) return `${icon} ${label}`;
    return `${icon} ${label} ${amountText}`;
}

function setPotDisplayNumber(value) {
    const text = formatPointNumber(value);
    if (ui.potValueText) {
        ui.potValueText.textContent = text;
        return;
    }
    if (ui.potText) {
        ui.potText.textContent = `POT ${text} TP`;
    }
}

function stopPotRollAnimation() {
    if (potRollAnimationId) {
        cancelAnimationFrame(potRollAnimationId);
        potRollAnimationId = 0;
    }
}

function animatePotDisplay(nextValue) {
    const target = Number.isFinite(nextValue) ? Math.max(0, Math.floor(nextValue)) : 0;
    if (!ui.potText) return;
    if (potDisplayValue === null) {
        stopPotRollAnimation();
        potDisplayValue = target;
        setPotDisplayNumber(target);
        ui.potText.classList.remove('is-rolling');
        return;
    }
    if (target === potDisplayValue) {
        setPotDisplayNumber(target);
        ui.potText.classList.remove('is-rolling');
        return;
    }

    stopPotRollAnimation();
    const from = potDisplayValue;
    const delta = target - from;
    const duration = Math.min(1200, Math.max(360, Math.abs(delta) * 20));
    const startedAt = (window.performance && typeof window.performance.now === 'function')
        ? window.performance.now()
        : Date.now();

    ui.potText.classList.add('is-rolling');

    const tick = () => {
        const now = (window.performance && typeof window.performance.now === 'function')
            ? window.performance.now()
            : Date.now();
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(from + (delta * eased));
        if (current !== potDisplayValue) {
            potDisplayValue = current;
            setPotDisplayNumber(current);
        }
        if (progress < 1) {
            potRollAnimationId = requestAnimationFrame(tick);
            return;
        }
        potDisplayValue = target;
        setPotDisplayNumber(target);
        ui.potText.classList.remove('is-rolling');
        potRollAnimationId = 0;
    };

    potRollAnimationId = requestAnimationFrame(tick);
}

function getToCall(ownerKey) {
    if (!state?.betting) return 0;
    return Math.max(0, (state.betting.currentBet || 0) - (state.betting.contributions?.[ownerKey] || 0));
}

function addBetToPot(ownerKey, amount) {
    if (!state?.betting || amount <= 0) return false;
    const player = state.players?.[ownerKey];
    if (!player || player.testPoints < amount) return false;
    player.testPoints -= amount;
    state.pot += amount;
    state.betting.contributions[ownerKey] += amount;
    return true;
}

function settlePotByWinner(winnerKey) {
    if (!state || state.handSettled) return;
    state.handSettled = true;
    const pot = Math.max(0, Number(state.pot || 0));
    if (pot <= 0) return;
    if (winnerKey === 'draw') {
        const half = Math.floor(pot / 2);
        state.players.player.testPoints += half;
        state.players.cpu.testPoints += pot - half;
        pushLog(`繝昴ャ繝・${formatTestPoint(pot)} 縺ｯ蠑輔″蛻・・ｽ・ｽ縺ｧ蛻・・ｽE縲Ａ);
        return;
    }
    if (winnerKey === 'player' || winnerKey === 'cpu') {
        state.players[winnerKey].testPoints += pot;
        const winnerName = state.players[winnerKey].name || winnerKey;
        pushLog(`${winnerName} 縺鯉ｿｽE繝・・ｽ・ｽ ${formatTestPoint(pot)} 繧堤佐蠕励Ａ);
    }
}

function startBettingRound(roundKey, nextPhase) {
    state.betting = {
        roundKey,
        nextPhase,
        minBet: TEST_BET_UNIT,
        minRaise: TEST_BET_UNIT,
        currentBet: 0,
        contributions: { player: 0, cpu: 0 },
        pendingResponseFor: null,
        checks: { player: false, cpu: false }
    };
    state.phase = `betting-${roundKey}`;
    pushLog(`繝吶ャ繝・・ｽ・ｽ繝ｳ繧ｰ髢句ｧ・ ${roundKey} / 譛蟆・${formatTestPoint(TEST_BET_UNIT)}`);
}

function getBettingRoundCutinText(roundKey) {
    if (roundKey === 'preflop') return 'BETTING START';
    if (roundKey === 'mid') return 'BETTING ROUND';
    if (roundKey === 'final') return 'FINAL BETTING';
    return 'BETTING PHASE';
}

async function startBettingRoundWithCutin(roundKey, nextPhase) {
    await showRoundCutin(getBettingRoundCutinText(roundKey));
    startBettingRound(roundKey, nextPhase);
    render();
}
function getCpuWinRateEstimate() {
    const hand = state.players.cpu.hand;
    const board = state.board.slice();
    const pool = state.deck.slice();
    return estimateCpuWinRate(hand, board, pool, Math.floor(CPU_SIMULATION_COUNT * 0.7));
}

function chooseCpuBettingAction() {
    const betting = state.betting;
    const cpu = state.players.cpu;
    const toCall = getToCall('cpu');
    const minRaise = betting.minRaise || TEST_BET_UNIT;
    const minBet = betting.minBet || TEST_BET_UNIT;
    const roundKey = String(betting.roundKey || '');
    const rate = getCpuWinRateEstimate();
    const winRate = Number.isFinite(rate) && rate >= 0 ? rate : 0.5;

    if (toCall > 0) {
        const isFirstPreflopResponse = roundKey === 'preflop'
            && toCall <= minBet
            && (betting.contributions?.cpu || 0) === 0;
        if (isFirstPreflopResponse) {
            if (winRate > 0.78 && cpu.testPoints >= toCall + minRaise && Math.random() < 0.35) {
                return { action: 'raise' };
            }
            return { action: 'call' };
        }

        const potAfterCall = state.pot + toCall;
        const potOdds = toCall / Math.max(1, potAfterCall);
        const stackPressure = toCall / Math.max(1, cpu.testPoints || 1);
        const isSmallCall = toCall <= minBet;
        if (!isSmallCall && stackPressure > 0.22 && winRate + 0.08 < potOdds) return { action: 'fold' };
        if (winRate > 0.72 && cpu.testPoints >= toCall + minRaise && Math.random() < 0.45) {
            return { action: 'raise' };
        }
        return { action: 'call' };
    }

    if (winRate > 0.66 && cpu.testPoints >= betting.minBet && Math.random() < 0.55) {
        return { action: 'bet' };
    }
    return { action: 'check' };
}

function applyBetAction(ownerKey, action) {
    if (!state?.betting) return { ok: false, message: '繝吶ャ繝医ヵ繧ｧ繝ｼ繧ｺ縺ｧ縺ｯ縺ゅｊ縺ｾ縺帙ｓ縲・ };
    const betting = state.betting;
    const otherKey = ownerKey === 'player' ? 'cpu' : 'player';
    const toCall = getToCall(ownerKey);
    const actor = state.players[ownerKey];
    const actorName = actor.name || ownerKey;

    if (action === 'fold') {
        settlePotByWinner(otherKey);
        state.phase = 'showdown';
        state.result = {
            winner: otherKey,
            playerBest: { rankLabel: ownerKey === 'player' ? '繝輔か繝ｼ繝ｫ繝芽ｲ縺・ : '繝輔か繝ｼ繝ｫ繝牙享縺｡' },
            cpuBest: { rankLabel: ownerKey === 'cpu' ? '繝輔か繝ｼ繝ｫ繝芽ｲ縺・ : '繝輔か繝ｼ繝ｫ繝牙享縺｡' }
        };
        return { ok: true, handEnded: true };
    }

    if (action === 'check') {
        if (toCall > 0) return { ok: false, message: '繧ｳ繝ｼ繝ｫ鬘阪′縺ゅｊ縺ｾ縺吶・ };
        betting.checks[ownerKey] = true;
        pushLog(`${actorName} 縺ｯ繝√ぉ繝・・ｽ・ｽ縲Ａ);
        if (betting.checks.player && betting.checks.cpu) {
            betting.pendingResponseFor = null;
            return { ok: true, roundComplete: true };
        }
        return { ok: true };
    }

    if (action === 'call') {
        if (toCall <= 0) return { ok: false, message: '繧ｳ繝ｼ繝ｫ荳崎ｦ√〒縺吶・ };
        if (!addBetToPot(ownerKey, toCall)) return { ok: false, message: '繝昴う繝ｳ繝井ｸ崎ｶｳ縺ｧ繧ｳ繝ｼ繝ｫ縺ｧ縺阪∪縺帙ｓ縲・ };
        betting.checks.player = false;
        betting.checks.cpu = false;
        betting.pendingResponseFor = null;
        pushLog(`${actorName} 縺ｯ繧ｳ繝ｼ繝ｫ (${formatTestPoint(toCall)})縲Ａ);
        return { ok: true, roundComplete: true };
    }

    if (action === 'bet') {
        if (betting.currentBet > 0 || toCall > 0) return { ok: false, message: '迴ｾ蝨ｨ縺ｯ繝吶ャ繝医〒縺ｯ縺ｪ縺上さ繝ｼ繝ｫ/繝ｬ繧､繧ｺ縺ｧ縺吶・ };
        const amount = betting.minBet;
        if (!addBetToPot(ownerKey, amount)) return { ok: false, message: '繝昴う繝ｳ繝井ｸ崎ｶｳ縺ｧ繝吶ャ繝医〒縺阪∪縺帙ｓ縲・ };
        betting.currentBet = betting.contributions[ownerKey];
        betting.pendingResponseFor = otherKey;
        betting.checks.player = false;
        betting.checks.cpu = false;
        pushLog(`${actorName} 縺ｯ繝吶ャ繝・(${formatTestPoint(amount)})縲Ａ);
        return { ok: true };
    }

    if (action === 'raise') {
        const raiseCost = toCall + betting.minRaise;
        if (raiseCost <= 0) return { ok: false, message: '繝ｬ繧､繧ｺ譚｡莉ｶ繧呈ｺ縺溘＠縺ｦ縺・・ｽ・ｽ縺帙ｓ縲・ };
        if (!addBetToPot(ownerKey, raiseCost)) return { ok: false, message: '繝昴う繝ｳ繝井ｸ崎ｶｳ縺ｧ繝ｬ繧､繧ｺ縺ｧ縺阪∪縺帙ｓ縲・ };
        betting.currentBet = betting.contributions[ownerKey];
        betting.pendingResponseFor = otherKey;
        betting.checks.player = false;
        betting.checks.cpu = false;
        pushLog(`${actorName} 縺ｯ繝ｬ繧､繧ｺ (+${formatTestPoint(betting.minRaise)})縲Ａ);
        return { ok: true };
    }

    return { ok: false, message: '譛ｪ蟇ｾ蠢懊い繧ｯ繧ｷ繝ｧ繝ｳ縺ｧ縺吶・ };
}

async function transitionAfterPhase(nextPhase = 'turn-ready') {
    if (nextPhase === 'showdown') {
        await resolveShowdown();
        return;
    }
    if (nextPhase === 'betting-mid') {
        await startBettingRoundWithCutin('mid', 'turn-ready');
        return;
    }
    if (nextPhase === 'betting-final') {
        await startBettingRoundWithCutin('final', 'showdown');
        return;
    }
    if (nextPhase === 'river-ready') {
        await showRoundCutin('RIVER OPEN');
        await revealBoard(1);
        if (state.phase !== 'showdown') {
            await startBettingRoundWithCutin('final', 'showdown');
        } else {
            render();
        }
        return;
    }
    state.phase = nextPhase;
}

async function completeBettingRoundIfNeeded() {
    if (!state?.betting) return;
    const nextPhase = state.betting.nextPhase;
    state.betting = null;
    await transitionAfterPhase(nextPhase);
    if (nextPhase === 'preflop') {
        await openFlopThenDraw();
        return;
    }
    if (nextPhase === 'turn-ready') {
        await openTurnThenDraw();
        return;
    }
    render();
}

async function runCpuBettingTurn() {
    if (!isBettingPhase() || !state.betting) return;
    const decision = chooseCpuBettingAction();
    let usedAction = decision.action;
    let result = applyBetAction('cpu', usedAction);
    if (!result.ok) {
        usedAction = getToCall('cpu') > 0 ? 'call' : 'check';
        result = applyBetAction('cpu', usedAction);
        if (!result.ok) {
            usedAction = 'fold';
            result = applyBetAction('cpu', usedAction);
        }
    }
    await showActionCutin('cpu', usedAction);
    render();
    await wait(180);
    if (state.phase === 'showdown') return;
    if (state.betting && state.betting.pendingResponseFor === 'player') {
        return;
    }
    if (!state.betting || !state.betting.pendingResponseFor) {
        await completeBettingRoundIfNeeded();
    }
}

async function onPlayerBetAction(action) {
    if (!isBettingPhase() || state.cpuThinking) return;
    const result = applyBetAction('player', action);
    if (!result.ok) {
        pushLog(result.message || '縺難ｿｽE謫堺ｽ懶ｿｽE縺ｧ縺阪∪縺帙ｓ縲・);
        render();
        return;
    }
    await showActionCutin('player', action);
    render();
    if (state.phase === 'showdown') return;
    if (result.roundComplete) {
        await completeBettingRoundIfNeeded();
        return;
    }
    if (state.betting?.pendingResponseFor === 'cpu' || (!state.betting?.pendingResponseFor && !result.roundComplete)) {
        await runCpuBettingTurn();
    }
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
    if (!Array.isArray(boardCards) || boardCards.length > 5) return -1;
    const pool = buildPoolWithoutCards(basePool, [...candidateCpuHand, ...boardCards]);
    const boardDrawNeeded = Math.max(0, 5 - boardCards.length);
    const required = 2 + boardDrawNeeded;
    if (pool.length < required) return -1;
    let score = 0;
    for (let i = 0; i < simulationCount; i += 1) {
        const draw = drawRandomMany(pool, required);
        if (!draw) break;
        const enemyHand = [draw[0], draw[1]];
        const boardAdds = boardDrawNeeded > 0 ? draw.slice(2) : [];
        const futureBoard = [...boardCards, ...boardAdds];
        const cpuBest = chooseBestFiveFromSeven([...candidateCpuHand, ...futureBoard]);
        const enemyBest = chooseBestFiveFromSeven([...enemyHand, ...futureBoard]);
        if (!cpuBest || !enemyBest) continue;
        const cmpResult = compareHandsWithRemainingTieBreak(
            [...candidateCpuHand, ...futureBoard],
            cpuBest,
            [...enemyHand, ...futureBoard],
            enemyBest
        );
        const cmp = cmpResult.cmp;
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
    if (cpu.hand.length !== 2 || (boardCards.length !== 3 && boardCards.length !== 5)) {
        return { discardIndex: 0, source: 'deck', graveOwnerKey: null, expected: 0 };
    }

    const plans = [];
    for (let discardIndex = 0; discardIndex < cpu.hand.length; discardIndex += 1) {
        const keepCard = cpu.hand[discardIndex === 0 ? 1 : 0];
        if (!keepCard) continue;
        const discarded = cpu.hand[discardIndex];
        const boardJudgmentActive = isBoardJudgmentActiveInCurrentDraw();
        const canJudgment = !isEffectDisabled() && (
            discarded.effectType === EFFECT_TYPE.JUDGMENT || boardJudgmentActive
        );

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
            const options = getLatestGraveOptions();
            if (!boardJudgmentActive) {
                for (let i = options.length - 1; i >= 0; i -= 1) {
                    if (options[i].ownerKey === 'cpu') {
                        options.splice(i, 1);
                    }
                }
            }
            if (discarded.effectType === EFFECT_TYPE.JUDGMENT) {
                options.push({ ownerKey: 'cpu', card: discarded });
            }
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

function isBoardJudgmentActiveInCurrentDraw() {
    if (!state) return false;
    if (isEffectDisabled()) return false;
    return Number(state.judgmentBoardDrawRound || 0) === Number(state.drawRound || -1);
}

function applyDiscardSpecial(card, ownerKey) {
    if (!card || isEffectDisabled()) return;
    if (card.effectType === EFFECT_TYPE.WORLD) {
        const otherKey = ownerKey === 'player' ? 'cpu' : 'player';
        state.players[otherKey].canExchange = false;
        state.players.player.bettingEnabled = hasFoolInHand('player');
        state.players.cpu.bettingEnabled = hasFoolInHand('cpu');
        pushLog(`縲御ｸ也阜縲咲ｴ譽・ ${state.players[otherKey].name} 縺ｯ莠､謠帑ｸ搾ｿｽE縺ｫ縺ｪ縺｣縺溘Ａ);
        showEffectOverlay('THE WORLD - EXCHANGE LOCK');
    }
}

function applyBoardSpecial(card) {
    if (!card) return;
    if (card.effectType === EFFECT_TYPE.FOOL) {
        if (!state.effectsDisabledByFool) {
            state.effectsDisabledByFool = true;
            state.pendingJudgment = null;
            pushLog('縲鯉ｿｽE閠・・ｽ・ｽ縺悟ｴ縺ｫ蜃ｺ迴ｾ縲ゆｻ･髯阪∽ｸ也阜/蟇ｩ蛻､縺ｮ蜉ｹ譫懶ｿｽE辟｡蜉ｹ縲・);
            showEffectOverlay('THE FOOL - CHAOS NULLIFICATION');
        }
        return;
    }
    if (card.effectType === EFFECT_TYPE.WORLD && !isEffectDisabled()) {
        state.players.player.bettingEnabled = hasFoolInHand('player');
        state.players.cpu.bettingEnabled = hasFoolInHand('cpu');
        state.forceShowdown = true;
        pushLog('縲御ｸ也阜縲阪′蝣ｴ縺ｫ蜃ｺ迴ｾ縲ょｼｷ蛻ｶ繧ｷ繝ｧ繝ｼ繝繧ｦ繝ｳ逋ｺ蜍輔・);
        showEffectOverlay('THE WORLD - TIME STOP');
    }
}

async function revealBoard(count) {
    let judgmentRevealed = false;
    for (let i = 0; i < count; i += 1) {
        const card = drawCard();
        if (!card) break;
        state.board.push(card);
        render();
        const boardCards = ui.board ? Array.from(ui.board.querySelectorAll('.tarot-card')) : [];
        const revealTarget = boardCards[state.board.length - 1];
        if (revealTarget) {
            const hiddenTarget = createCardElement(createBackCardData(), { hidden: true, clickable: false });
            revealTarget.replaceWith(hiddenTarget);
            await animateBackToFrontOnElement(hiddenTarget, card);
        }
        if (card.effectType === EFFECT_TYPE.JUDGMENT) {
            judgmentRevealed = true;
        }
        applyBoardSpecial(card);
        render();
        if (state.forceShowdown) break;
    }
    if (state.forceShowdown) {
        await forceShowdown();
    }
    return { judgmentRevealed };
}

async function forceShowdown() {
    state.phase = 'showdown';
    state.result = evaluateShowdown();
    settlePotByWinner(state.result?.winner || 'draw');
    await runShowdownPresentation();
}

function drawFor(ownerKey) {
    const card = drawCard();
    if (card) {
        state.players[ownerKey].hand.push(card);
    }
    return card;
}

function getPostDrawNextPhase() {
    return state.drawRound >= 2 ? 'river-ready' : 'betting-mid';
}

async function enterDrawPhase(roundNo) {
    state.drawRound = roundNo;
    await showRoundCutin(`DRAW PHASE ${roundNo}`);
    state.phase = 'draw-player';
}

async function openFlopThenDraw() {
    await showRoundCutin('FLOP OPEN');
    const revealResult = await revealBoard(3);
    state.judgmentBoardDrawRound = !isEffectDisabled() && !!revealResult?.judgmentRevealed ? 1 : 0;
    if (state.phase !== 'showdown') {
        await enterDrawPhase(1);
        if (!state.players.player.canExchange) {
            pushLog('縺ゅ↑縺滂ｿｽE莠､謠帑ｸ榊庄縲ゅラ繝ｭ繝ｼ繧偵せ繧ｭ繝・・ｽE縲・);
            await processCpuExchange(getPostDrawNextPhase());
        }
    }
    render();
}

async function openTurnThenDraw() {
    await showRoundCutin('TURN OPEN');
    const revealResult = await revealBoard(1);
    state.judgmentBoardDrawRound = !isEffectDisabled() && !!revealResult?.judgmentRevealed ? 2 : 0;
    if (state.phase !== 'showdown') {
        await enterDrawPhase(2);
        if (!state.players.player.canExchange) {
            pushLog('縺ゅ↑縺滂ｿｽE莠､謠帑ｸ榊庄・ｽE・ｽE蟾｡逶ｮ・ｽE・ｽ縲ゅラ繝ｭ繝ｼ繧偵せ繧ｭ繝・・ｽE縲・);
            await processCpuExchange(getPostDrawNextPhase());
        }
    }
    render();
}

async function processCpuExchange(nextPhase = 'turn-ready') {
    const cpu = state.players.cpu;
    if (!cpu.canExchange) {
        pushLog('CPU縺ｯ莠､謠帑ｸ搾ｿｽE縲ゅラ繝ｭ繝ｼ繧偵せ繧ｭ繝・・ｽE縲・);
        await transitionAfterPhase(nextPhase);
        return;
    }
    if (!cpu.hand.length) {
        await transitionAfterPhase(nextPhase);
        return;
    }
    state.cpuThinking = true;
    state.phase = 'cpu-thinking';
    pushLog('CPU縺御ｺ､謠帶焔繧定ｪｭ繧薙〒縺・・ｽ・ｽ縺・..');
    render();
    await wait(420);

    const plan = chooseCpuPlan();
    const discardIndex = Math.max(0, Math.min(cpu.hand.length - 1, Number(plan.discardIndex) || 0));
    const cpuHandCardEls = ui.cpuHand ? Array.from(ui.cpuHand.querySelectorAll('.tarot-card')) : [];
    const fromHandEl = cpuHandCardEls[discardIndex] || ui.cpuHand;
    const [discarded] = cpu.hand.splice(discardIndex, 1);
    if (fromHandEl?.classList) {
        fromHandEl.classList.add('is-leaving');
        await wait(80);
    }
    await animateCardFlight(discarded, fromHandEl, ui.cpuGrave, 260, 0.88, { hidden: true });
    addToGrave('cpu', discarded);
    pushLog(`CPU縺ｯ ${getCardDisplayName(discarded)} 繧貞｢灘慍縺ｫ騾√▲縺滂ｼ域悄蠕・・ｽ・ｽ邇・${(Math.max(0, plan.expected || 0) * 100).toFixed(1)}%・ｽE・ｽ縲Ａ);
    applyDiscardSpecial(discarded, 'cpu');
    render();
    await wait(280);

    const canJudgment = !isEffectDisabled() && (
        discarded.effectType === EFFECT_TYPE.JUDGMENT || isBoardJudgmentActiveInCurrentDraw()
    );
    if (canJudgment && plan.source === 'grave' && plan.graveOwnerKey) {
        const gained = takeLatestGraveCard(plan.graveOwnerKey);
        if (gained) {
            const fromGrave = plan.graveOwnerKey === 'player' ? ui.playerGrave : ui.cpuGrave;
            await animateCardFlight(gained, fromGrave, ui.cpuHand, 280, 1, { hidden: true });
            cpu.hand.push(gained);
            pushLog(`CPU縺ｯ蟇ｩ蛻､縺ｧ ${state.players[plan.graveOwnerKey].name} 縺ｮ譛譁ｰ蠅灘慍繧ｫ繝ｼ繝峨ｒ蜿門ｾ励Ａ);
            showEffectOverlay('JUDGMENT - SOUL RETRIEVE');
        } else {
            drawFor('cpu');
            pushLog('CPU縺ｮ蟇ｩ蛻､蟇ｾ雎｡縺梧ｶ亥､ｱ縲ょｱｱ譛ｭ縺九ｉ陬懶ｿｽE縲・);
        }
    } else if (canJudgment) {
        const options = getLatestGraveOptions();
        if (options.length > 0 && plan.source === 'grave') {
            const pickedOwner = plan.graveOwnerKey || options[0].ownerKey;
            const gained = takeLatestGraveCard(pickedOwner);
            if (gained) {
                const fromGrave = pickedOwner === 'player' ? ui.playerGrave : ui.cpuGrave;
                await animateCardFlight(gained, fromGrave, ui.cpuHand, 280, 1, { hidden: true });
                cpu.hand.push(gained);
                pushLog(`CPU縺ｯ蟇ｩ蛻､縺ｧ ${state.players[pickedOwner].name} 縺ｮ譛譁ｰ蠅灘慍繧ｫ繝ｼ繝峨ｒ蜿門ｾ励Ａ);
                showEffectOverlay('JUDGMENT - SOUL RETRIEVE');
            } else {
                drawFor('cpu');
                pushLog('CPU縺ｮ蟇ｩ蛻､蟇ｾ雎｡縺梧ｶ亥､ｱ縲ょｱｱ譛ｭ縺九ｉ陬懶ｿｽE縲・);
            }
        } else {
            const drawn = drawFor('cpu');
            if (drawn) {
                await animateCardFlight(drawn, ui.deckAnchor, ui.cpuHand, 260, 1, { hidden: true });
            }
            pushLog('CPU縺ｯ蟇ｩ蛻､繧剃ｽｿ縺｣縺溘′蟇ｾ雎｡縺ｪ縺励ょｱｱ譛ｭ縺九ｉ陬懶ｿｽE縲・);
        }
    } else {
        const drawn = drawFor('cpu');
        if (drawn) {
            await animateCardFlight(drawn, ui.deckAnchor, ui.cpuHand, 260, 1, { hidden: true });
        }
    }
    state.cpuThinking = false;
    await transitionAfterPhase(nextPhase);
}

async function resolveShowdown() {
    state.phase = 'showdown';
    state.result = evaluateShowdown();
    settlePotByWinner(state.result?.winner || 'draw');
    await runShowdownPresentation();
}

async function finishPlayerExchange(nextPhase = 'turn-ready') {
    if (state.forceShowdown) {
        await forceShowdown();
        return;
    }
    await processCpuExchange(nextPhase);
    render();
}

async function startNewGame() {
    if (state?.initialDealAnimating) return;
    const keepPlayerTp = Number.isFinite(Number(state?.players?.player?.testPoints))
        ? Math.max(0, Math.floor(Number(state.players.player.testPoints)))
        : TEST_POINT_START;
    const keepCpuTp = Number.isFinite(Number(state?.players?.cpu?.testPoints))
        ? Math.max(0, Math.floor(Number(state.players.cpu.testPoints)))
        : TEST_POINT_START;
    resetState();
    state.players.player.testPoints = keepPlayerTp;
    state.players.cpu.testPoints = keepCpuTp;
    clearBetActionLabels();
    state.deck = shuffle(buildDeck());
    state.phase = 'dealing';
    state.initialDealAnimating = true;
    state.initialDealRevealedCount = 0;
    render();
    for (let i = 0; i < 2; i += 1) {
        const playerCard = drawFor('player');
        render();
        if (playerCard && ui.playerHand) {
            const playerCards = Array.from(ui.playerHand.querySelectorAll('.tarot-card'));
            const playerTarget = playerCards[playerCards.length - 1];
            if (playerTarget) {
                await animateBackToFrontOnElement(playerTarget, playerCard);
            }
        }
        state.initialDealRevealedCount = i + 1;
        await wait(80);
        const cpuCard = drawFor('cpu');
        render();
        if (cpuCard) {
            await animateCardFlight(cpuCard, ui.deckAnchor, ui.cpuHand, 220, 1, { hidden: true });
        }
        await wait(90);
    }
    state.initialDealAnimating = false;
    state.initialDealRevealedCount = 2;
    state.drawRound = 0;
    await startBettingRoundWithCutin('preflop', 'preflop');
    pushLog('繝励Ξ繝輔Ο繝・・ｽE: 謇区惆2譫壹ｒ驟榊ｸ・・ｽ・ｽE);
    render();
}

async function handleNext() {
    if (!state) return;
    if (state.phase === 'preflop') {
        await openFlopThenDraw();
        return;
    }

    if (state.phase === 'draw-player') {
        pushLog(`DRAW PHASE ${state.drawRound}: 莠､謠帙ｒ遒ｺ螳啻);
        await finishPlayerExchange(getPostDrawNextPhase());
        return;
    }

    if (state.phase === 'draw-player-judgment') {
        await onJudgmentPick('deck');
        return;
    }

    if (state.phase === 'turn-ready') {
        await openTurnThenDraw();
        return;
    }

    if (state.phase === 'river-ready') {
        await transitionAfterPhase('river-ready');
        return;
    }
}

async function onPlayerCardClick(index, sourceEl) {
    if (!state || state.phase !== 'draw-player') return;
    const player = state.players.player;
    if (!player.canExchange) return;
    if (index < 0 || index >= player.hand.length) return;

    const [discarded] = player.hand.splice(index, 1);
    if (sourceEl?.classList) {
        sourceEl.classList.add('is-leaving');
        await wait(80);
    }
    await animateCardFlight(discarded, sourceEl || ui.playerHand, ui.playerGrave, 260, 0.88);
    addToGrave('player', discarded);
    pushLog(`縺ゅ↑縺滂ｿｽE ${getCardDisplayName(discarded)} 繧貞｢灘慍縺ｫ騾√▲縺溘Ａ);
    applyDiscardSpecial(discarded, 'player');

    const canJudgment = !isEffectDisabled() && (
        discarded.effectType === EFFECT_TYPE.JUDGMENT || isBoardJudgmentActiveInCurrentDraw()
    );
    if (canJudgment) {
        const options = getAllGraveOptions();
        if (options.length > 0) {
            state.phase = 'draw-player-judgment';
            state.pendingJudgment = { options };
            render();
            return;
        }
    }

    const drawn = drawFor('player');
    if (drawn) {
        await animateCardFlight(drawn, ui.deckAnchor, ui.playerHand, 260, 1);
    }
    await finishPlayerExchange(getPostDrawNextPhase());
}

async function onJudgmentPick(ownerKey, cardId = null) {
    if (!state || state.phase !== 'draw-player-judgment') return;
    const gained = ownerKey === 'deck'
        ? null
        : (cardId ? takeGraveCardById(ownerKey, cardId) : takeLatestGraveCard(ownerKey));
    if (gained) {
        const fromGrave = ownerKey === 'player' ? ui.playerGrave : ui.cpuGrave;
        await animateCardFlight(gained, fromGrave, ui.playerHand, 280, 1);
        state.players.player.hand.push(gained);
        pushLog(`蟇ｩ蛻､逋ｺ蜍・ ${state.players[ownerKey].name} 縺ｮ譛譁ｰ蠅灘慍繧ｫ繝ｼ繝峨ｒ蜿門ｾ励Ａ);
        showEffectOverlay('JUDGMENT - SOUL RETRIEVE');
    } else {
        const drawn = drawFor('player');
        if (drawn) {
            await animateCardFlight(drawn, ui.deckAnchor, ui.playerHand, 260, 1);
        }
        pushLog('蟇ｩ蛻､蟇ｾ雎｡縺梧ｶ亥､ｱ縺励◆縺溘ａ縲∝ｱｱ譛ｭ縺九ｉ1譫夊｣懶ｿｽE縲・);
    }
    state.pendingJudgment = null;
    state.phase = 'draw-player';
    await finishPlayerExchange(getPostDrawNextPhase());
}

function getPhaseText() {
    if (!state) return '';
    if (state.phase === 'idle') return '縲梧眠縺励＞蜍晁ｲ繧貞ｧ九ａ繧九阪ｒ謚ｼ縺励※縺上□縺輔＞縲・;
    if (state.phase === 'dealing') return '驟肴惆荳ｭ...';
    if (state.phase === 'betting-preflop') return '繝励Μ繝輔Ο繝・・ｽEBET: 繧｢繧ｯ繧ｷ繝ｧ繝ｳ繧帝∈謚槭＠縺ｦ縺上□縺輔＞縲・;
    if (state.phase === 'betting-mid') return '荳ｭ逶､BET: 繧ｿ繝ｼ繝ｳ蜈ｬ髢句燕縺ｮ鬧・・ｽ・ｽ蠑輔″縲・;
    if (state.phase === 'betting-final') return '譛邨・ET: 繧ｷ繝ｧ繝ｼ繝繧ｦ繝ｳ蜑搾ｿｽE蜍晁ｲ縲・;
    if (state.phase === 'preflop') return '谺｡縺ｸ縺ｧ繝輔Ο繝・・ｽE繧帝幕遉ｺ縲・;
    if (state.phase === 'draw-player') return `隨ｬ${state.drawRound}繝峨Ο繝ｼ繝輔ぉ繝ｼ繧ｺ: 謐ｨ縺ｦ繧区焔譛ｭ繧帝∈謚橸ｼ医せ繧ｭ繝・・ｽE繧ょ庄・ｽE・ｽ`;
    if (state.phase === 'draw-player-judgment') return '蟇ｩ蛻､逋ｺ蜍・ 蜿門ｾ励き繝ｼ繝峨ｒ驕ｸ謚槭・;
    if (state.phase === 'cpu-thinking') return 'CPU縺瑚｡悟虚繧呈ｱｺ螳壻ｸｭ...';
    if (state.phase === 'turn-ready') return '谺｡縺ｸ縺ｧ繧ｿ繝ｼ繝ｳ繧帝幕遉ｺ縲・;
    if (state.phase === 'river-ready') return '繝ｪ繝撰ｿｽE蜈ｬ髢倶ｸｭ...';
    if (state.phase === 'showdown') return '繧ｷ繝ｧ繝ｼ繝繧ｦ繝ｳ螳御ｺ・・ｽ・ｽE;
    return '';
}
function getResultText() {
    return '';
}
function getSuitClass(card) {
    if (!card) return 'none';
    if (card.suit === 'Wand') return 'wand';
    if (card.suit === 'Sword') return 'sword';
    if (card.suit === 'Cup') return 'cup';
    if (card.suit === 'Pentacle') return 'pentacle';
    if (card.suit === 'All') return 'all-suit';
    return 'none';
}

function getSuitThemeColor(suit) {
    return SUIT_THEME_COLOR[suit] || '#5b6472';
}

function getArcanaSuitOptionsForVisual(card) {
    if (!card || !card.isArcana) return [];
    const options = getCardSuitOptionsForFlush(card).filter((suit) => SUITS.includes(suit));
    return options;
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

    const spriteIndex = hidden ? TAROT_BACK_SPRITE_INDEX : getTarotSpriteIndex(card);
    const art = document.createElement('div');
    art.className = 'tarot-card-art';
    setArtSpriteByIndex(art, spriteIndex);
    el.appendChild(art);

    if (hidden) {
        el.classList.add('is-static');
        return el;
    }

    if (card.isArcana) {
        el.classList.add('is-arcana');
        const visualOptions = getArcanaSuitOptionsForVisual(card);
        if (Number(card.number) === 1 || getCardSuitOptionsForFlush(card).includes('All')) {
            el.classList.add('arcana-all-corners');
        } else if (visualOptions.length >= 1) {
            el.classList.add('arcana-suit-hybrid');
            el.style.setProperty('--arcana-color', getSuitThemeColor(visualOptions[0]));
        }
    }

    const title = document.createElement('div');
    title.className = 'tarot-card-title';
    title.textContent = getCardNameLabel(card);

    const number = document.createElement('div');
    number.className = 'tarot-card-number';
    number.textContent = getCardNumberLabel(card);

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
        const hidden = typeof options.hiddenByIndex === 'function'
            ? !!options.hiddenByIndex(index, card)
            : !!options.hidden;
        const el = createCardElement(card, {
            hidden,
            clickable,
            onClick: () => options.onCardClick(index, el)
        });
        container.appendChild(el);
    });
}

function renderGraveRow(container, cards) {
    if (!container) return;
    container.innerHTML = '';
    const list = cards.slice().reverse().slice(0, 3);
    list.forEach((card) => {
        const item = createCardElement(card, { hidden: false, clickable: false });
        item.classList.add('tarot-grave-card');
        container.appendChild(item);
    });
}

function shouldShowKickerForShowdown(leftScore, rightScore) {
    if (!leftScore || !rightScore) return false;
    if (leftScore.rank !== rightScore.rank) return false;
    if (![3, 4, 5].includes(leftScore.rank)) return false;

    if (leftScore.rank === 3 || leftScore.rank === 5) {
        return (leftScore.rankVector?.[0] || 0) === (rightScore.rankVector?.[0] || 0);
    }
    if (leftScore.rank === 4) {
        return (leftScore.rankVector?.[0] || 0) === (rightScore.rankVector?.[0] || 0)
            && (leftScore.rankVector?.[1] || 0) === (rightScore.rankVector?.[1] || 0);
    }
    return false;
}

function getRoleCardsForDisplay(score, options = {}) {
    const includeKicker = !!options.includeKicker;
    const extraKickerCards = Array.isArray(options.extraKickerCards) ? options.extraKickerCards : [];
    if (!score || !Array.isArray(score.cards) || score.cards.length === 0) return [];
    const cards = score.cards.slice().sort(compareCardsForFlush);
    const numberMap = new Map();
    cards.forEach((card) => {
        const key = Number(card.number);
        if (!numberMap.has(key)) numberMap.set(key, []);
        numberMap.get(key).push(card);
    });
    const groups = Array.from(numberMap.entries()).sort((a, b) => {
        if (b[1].length !== a[1].length) return b[1].length - a[1].length;
        return b[0] - a[0];
    });

    const takeByCount = (count, maxGroup = 1) => groups
        .filter(([, list]) => list.length === count)
        .slice(0, maxGroup)
        .flatMap(([, list]) => list)
        .sort(compareCardsForFlush);

    const appendKicker = (baseCards, kickerCount = 1) => {
        if (!includeKicker || !Array.isArray(baseCards) || baseCards.length === 0 || kickerCount <= 0) {
            return baseCards;
        }
        const usedIds = new Set(baseCards.map((card) => card?.id).filter(Boolean));
        const kickers = cards
            .filter((card) => !usedIds.has(card?.id))
            .slice(0, kickerCount);
        return baseCards.concat(kickers);
    };

    const appendExtraKickers = (baseCards) => {
        if (!Array.isArray(baseCards) || baseCards.length === 0 || extraKickerCards.length === 0) {
            return baseCards;
        }
        const usedIds = new Set(baseCards.map((card) => card?.id).filter(Boolean));
        const out = baseCards.slice();
        extraKickerCards.forEach((card) => {
            if (!card) return;
            if (usedIds.has(card.id)) return;
            usedIds.add(card.id);
            out.push(card);
        });
        return out;
    };

    switch (score.rank) {
    case 2: // high card
        return appendExtraKickers(cards.slice(0, 1));
    case 3: // one pair
        return appendExtraKickers(appendKicker(takeByCount(2, 1).slice(0, 2), 1));
    case 4: // two pair
        return appendExtraKickers(appendKicker(takeByCount(2, 2).slice(0, 4), 1));
    case 5: // three card
        return appendExtraKickers(appendKicker(takeByCount(3, 1).slice(0, 3), 1));
    case 9: // four card
        return appendExtraKickers(takeByCount(4, 1).slice(0, 4));
    case 11: // five card
        return appendExtraKickers(takeByCount(5, 1).slice(0, 5));
    default: // straight / flush / full house / straight flush
        return appendExtraKickers(cards.slice(0, 5));
    }
}

function setOutcomeBadge(el, kind, text) {
    if (!el) return;
    el.classList.remove('is-win', 'is-lose', 'is-draw');
    el.textContent = '';
    if (!kind || !text) return;
    el.classList.add(kind);
    el.textContent = text;
}

function renderOutcomeBadges() {
    if (!state || !ui.playerOutcome || !ui.cpuOutcome) return;
    if (state.phase !== 'showdown' || !state.result) {
        setOutcomeBadge(ui.playerOutcome, null, '');
        setOutcomeBadge(ui.cpuOutcome, null, '');
        return;
    }
    const winner = state.result.winner;
    if (winner === 'player') {
        setOutcomeBadge(ui.playerOutcome, 'is-win', 'WIN');
        setOutcomeBadge(ui.cpuOutcome, 'is-lose', 'LOSE');
        return;
    }
    if (winner === 'cpu') {
        setOutcomeBadge(ui.playerOutcome, 'is-lose', 'LOSE');
        setOutcomeBadge(ui.cpuOutcome, 'is-win', 'WIN');
        return;
    }
    setOutcomeBadge(ui.playerOutcome, 'is-draw', 'DRAW');
    setOutcomeBadge(ui.cpuOutcome, 'is-draw', 'DRAW');
}

function getLiveBestRoleLabel(ownerKey) {
    if (!state?.players?.[ownerKey]) return '';
    const cards = [
        ...(state.players[ownerKey].hand || []),
        ...(state.board || [])
    ];
    if (cards.length < 5) return '謌千ｫ句ｽｹ: 縺ｪ縺・;
    const best = chooseBestFiveFromSeven(cards);
    if (!best?.rankLabel) return '謌千ｫ句ｽｹ: 縺ｪ縺・;
    return `謌千ｫ句ｽｹ: ${best.rankLabel}`;
}

function renderRoleLabels() {
    if (!ui.playerRole || !ui.cpuRole) return;
    if (state.phase !== 'showdown' || !state.result) {
        ui.playerRole.textContent = getLiveBestRoleLabel('player');
        ui.cpuRole.textContent = '謌千ｫ句ｽｹ: 髱橸ｿｽE髢・;
        return;
    }
    const winner = state.result.winner;
    const playerPrefix = winner === 'player' ? 'WIN' : winner === 'cpu' ? 'LOSE' : 'DRAW';
    const cpuPrefix = winner === 'cpu' ? 'WIN' : winner === 'player' ? 'LOSE' : 'DRAW';
    const playerRole = state.result.playerBest?.rankLabel || '';
    const cpuRole = state.result.cpuBest?.rankLabel || '';
    ui.playerRole.textContent = `${playerPrefix}: ${playerRole}`;
    ui.cpuRole.textContent = `${cpuPrefix}: ${cpuRole}`;
}

async function revealRoleCardsOneByOne(rowEl, cards) {
    if (!rowEl || !Array.isArray(cards) || cards.length === 0) return;
    const hiddenEls = Array.from(rowEl.querySelectorAll('.tarot-card'));
    const length = Math.min(hiddenEls.length, cards.length);
    for (let i = 0; i < length; i += 1) {
        await animateBackToFrontOnElement(hiddenEls[i], cards[i]);
        await wait(90);
    }
}

async function runShowdownPresentation() {
    if (!state || state.phase !== 'showdown' || !state.result) return;
    if (state.showdownRevealRunning) return;
    if (state.showdownRevealDone) {
        render();
        return;
    }
    state.showdownRevealRunning = true;
    state.showdownRevealDone = false;
    render();
    showEffectOverlay('SHOWDOWN');
    await wait(140);
    const useRemainingTieBreak = !!state.result.remainingTieBreakUsed;
    const showKickerOnTie = !useRemainingTieBreak
        && shouldShowKickerForShowdown(state.result.playerBest, state.result.cpuBest);
    const playerCards = getRoleCardsForDisplay(state.result.playerBest, {
        includeKicker: showKickerOnTie,
        extraKickerCards: useRemainingTieBreak ? state.result.playerRemainingCards : []
    });
    const cpuCards = getRoleCardsForDisplay(state.result.cpuBest, {
        includeKicker: showKickerOnTie,
        extraKickerCards: useRemainingTieBreak ? state.result.cpuRemainingCards : []
    });
    await revealRoleCardsOneByOne(ui.playerHand, playerCards);
    await wait(140);
    await revealRoleCardsOneByOne(ui.cpuHand, cpuCards);
    state.showdownRevealRunning = false;
    state.showdownRevealDone = true;
    render();
}

function renderBoard() {
    if (!ui.board) return;
    ui.board.innerHTML = '';
    state.board.forEach((card) => {
        const cardEl = createCardElement(card, { hidden: false });
        ui.board.appendChild(cardEl);
    });
    for (let i = state.board.length; i < 5; i += 1) {
        const hiddenCard = createCardElement(createBackCardData(), { hidden: true, clickable: false });
        ui.board.appendChild(hiddenCard);
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
        btn.textContent = `${ownerName}: ${getCardDisplayName(option.card)} (${getCardNumberLabel(option.card)})`;
        btn.addEventListener('click', () => onJudgmentPick(option.ownerKey, option.cardId || null));
        ui.judgmentOptions.appendChild(btn);
    });
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.textContent = '螻ｱ譛ｭ縺九ｉ蠑輔￥・ｽE・ｽ繧ｹ繧ｭ繝・・ｽE・ｽE・ｽE;
    skipBtn.addEventListener('click', () => onJudgmentPick('deck'));
    ui.judgmentOptions.appendChild(skipBtn);
}

function renderButtons() {
    if (!ui.nextButton) return;
    if (!state || state.phase === 'idle' || state.phase === 'showdown' || state.phase === 'dealing') {
        ui.nextButton.disabled = true;
        ui.nextButton.textContent = '谺｡縺ｸ';
        return;
    }
    if (isBettingPhase()) {
        ui.nextButton.disabled = true;
        ui.nextButton.textContent = 'BET謫堺ｽ應ｸｭ';
        return;
    }
    if (state.phase === 'preflop') {
        ui.nextButton.disabled = false;
        ui.nextButton.textContent = '繝輔Ο繝・・ｽE繧帝幕縺・;
        return;
    }
    if (state.phase === 'draw-player') {
        ui.nextButton.disabled = false;
        ui.nextButton.textContent = `隨ｬ${state.drawRound}繝峨Ο繝ｼ繧偵せ繧ｭ繝・・ｽE`;
        return;
    }
    if (state.phase === 'draw-player-judgment') {
        ui.nextButton.disabled = false;
        ui.nextButton.textContent = '蟇ｩ蛻､繧偵せ繧ｭ繝・・ｽE';
        return;
    }
    if (state.phase === 'cpu-thinking') {
        ui.nextButton.disabled = true;
        ui.nextButton.textContent = 'CPU諤晁・・ｽ・ｽ...';
        return;
    }
    if (state.phase === 'turn-ready') {
        ui.nextButton.disabled = false;
        ui.nextButton.textContent = '繧ｿ繝ｼ繝ｳ繧帝幕縺・;
        return;
    }
    if (state.phase === 'river-ready') {
        ui.nextButton.disabled = true;
        ui.nextButton.textContent = '繝ｪ繝撰ｿｽE蜈ｬ髢倶ｸｭ...';
        return;
    }
    ui.nextButton.disabled = true;
    ui.nextButton.textContent = '谺｡縺ｸ';
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

function renderBettingInfo() {
    if (!state) return;
    const potValue = Math.max(0, Math.floor(Number(state.pot || 0)));
    if (ui.potText) {
        animatePotDisplay(potValue);
        ui.potText.classList.toggle('is-hot', potValue > 0);
    }
    if (ui.playerPointText) ui.playerPointText.textContent = formatTestPoint(state.players.player.testPoints);
    if (ui.cpuPointText) ui.cpuPointText.textContent = formatTestPoint(state.players.cpu.testPoints);

    const active = isBettingPhase() && !!state.betting;
    if (ui.betPopup) ui.betPopup.style.display = active ? 'block' : 'none';

    if (!active) {
        if (ui.betCheckButton) ui.betCheckButton.disabled = true;
        if (ui.betCallButton) ui.betCallButton.disabled = true;
        if (ui.betBetButton) ui.betBetButton.disabled = true;
        if (ui.betRaiseButton) ui.betRaiseButton.disabled = true;
        if (ui.betFoldButton) ui.betFoldButton.disabled = true;
        if (ui.betCheckButton) ui.betCheckButton.textContent = formatBetActionButtonLabel('check');
        if (ui.betCallButton) ui.betCallButton.textContent = formatBetActionButtonLabel('call');
        if (ui.betBetButton) ui.betBetButton.textContent = formatBetActionButtonLabel('bet');
        if (ui.betRaiseButton) ui.betRaiseButton.textContent = formatBetActionButtonLabel('raise');
        if (ui.betFoldButton) ui.betFoldButton.textContent = formatBetActionButtonLabel('fold');
        return;
    }

    const toCall = getToCall('player');
    const minBet = state.betting.minBet;
    const minRaise = state.betting.minRaise;
    const point = state.players.player.testPoints;
    const currentBet = state.betting.currentBet || 0;

    if (ui.betCheckButton) {
        ui.betCheckButton.disabled = toCall > 0;
        ui.betCheckButton.textContent = formatBetActionButtonLabel('check');
    }
    if (ui.betCallButton) {
        ui.betCallButton.disabled = toCall <= 0 || point < toCall;
        ui.betCallButton.textContent = formatBetActionButtonLabel('call', formatTestPoint(toCall));
    }
    if (ui.betBetButton) {
        ui.betBetButton.disabled = currentBet > 0 || point < minBet;
        ui.betBetButton.textContent = formatBetActionButtonLabel('bet', formatTestPoint(minBet));
    }
    if (ui.betRaiseButton) {
        const raiseCost = toCall + minRaise;
        ui.betRaiseButton.disabled = currentBet <= 0 || point < raiseCost;
        ui.betRaiseButton.textContent = formatBetActionButtonLabel('raise', `+${formatTestPoint(minRaise)}`);
    }
    if (ui.betFoldButton) {
        ui.betFoldButton.disabled = false;
        ui.betFoldButton.textContent = formatBetActionButtonLabel('fold');
    }
}

function render() {
    if (!state || !ui.root) return;
    renderBoard();
    const isShowdown = state.phase === 'showdown' && !!state.result;
    const useRemainingTieBreak = isShowdown && !!state.result?.remainingTieBreakUsed;
    const showKickerOnTie = isShowdown
        && !useRemainingTieBreak
        && shouldShowKickerForShowdown(state.result?.playerBest, state.result?.cpuBest);
    const isDealing = state.phase === 'dealing' || !!state.initialDealAnimating;
    ui.root.classList.toggle('is-showdown', isShowdown);
    ui.root.classList.toggle('is-dealing', isDealing);
    if (ui.pokerRoot) {
        ui.pokerRoot.classList.toggle('is-showdown', isShowdown);
        ui.pokerRoot.classList.toggle('is-dealing', isDealing);
    }
    const playerCardsForView = isShowdown
        ? getRoleCardsForDisplay(state.result.playerBest, {
            includeKicker: showKickerOnTie,
            extraKickerCards: useRemainingTieBreak ? state.result.playerRemainingCards : []
        })
        : state.players.player.hand;
    const cpuCardsForView = isShowdown
        ? getRoleCardsForDisplay(state.result.cpuBest, {
            includeKicker: showKickerOnTie,
            extraKickerCards: useRemainingTieBreak ? state.result.cpuRemainingCards : []
        })
        : state.players.cpu.hand;
    const showdownHidden = isShowdown && !state.showdownRevealDone;
    const playerHidden = showdownHidden || isDealing;
    renderCardRow(ui.playerHand, playerCardsForView, {
        hidden: playerHidden,
        hiddenByIndex: (index) => (isDealing ? index >= (state.initialDealRevealedCount || 0) : playerHidden),
        clickable: !isShowdown && !isDealing && state.phase === 'draw-player',
        onCardClick: onPlayerCardClick
    });
    renderCardRow(ui.cpuHand, cpuCardsForView, {
        hidden: isShowdown ? showdownHidden : true,
        clickable: false
    });
    renderGraveRow(ui.playerGrave, isShowdown ? [] : state.players.player.graveyard);
    renderGraveRow(ui.cpuGrave, isShowdown ? [] : state.players.cpu.graveyard);
    renderJudgmentPanel();
    renderButtons();
    renderBettingInfo();
    renderOutcomeBadges();
    renderRoleLabels();
    if (ui.stateText) ui.stateText.textContent = getPhaseText();
    if (ui.resultText) {
        ui.resultText.textContent = getResultText();
        ui.resultText.style.display = 'none';
    }
    renderLog();
}

function ensureDailyFortuneOverlay() {
    let overlay = document.getElementById(DAILY_FORTUNE_OVERLAY_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = DAILY_FORTUNE_OVERLAY_ID;
    overlay.className = 'tarot-fortune-overlay';
    overlay.innerHTML = `
        <div id="${DAILY_FORTUNE_MODAL_ID}" class="tarot-fortune-modal">
            <div id="${DAILY_FORTUNE_TITLE_ID}" class="tarot-fortune-title">譛ｬ譌･縺ｮ驕句兇</div>
            <div class="tarot-fortune-sub">1譌･1蝗槭□縺代√ち繝ｭ繝・・ｽ・ｽ縺ｧ驕句兇繧貞頃縺医∪縺吶・/div>
            <div id="${DAILY_FORTUNE_CARD_HOST_ID}" class="tarot-fortune-card-host"></div>
            <div id="${DAILY_FORTUNE_TEXT_ID}" class="tarot-fortune-text">荳ｭ螟ｮ縺ｮ繝懊ち繝ｳ縺ｧ蜊縺・・ｽ・ｽ髢句ｧ九＠縺ｦ縺上□縺輔＞縲・/div>
            <div class="tarot-fortune-actions">
                <button id="${DAILY_FORTUNE_DRAW_BUTTON_ID}" type="button">蜊縺・/button>
                <button id="${DAILY_FORTUNE_CLOSE_BUTTON_ID}" type="button" style="display:none;">髢峨§繧・/button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            closeDailyFortuneOverlay();
        }
    });
    return overlay;
}

function closeDailyFortuneOverlay() {
    const overlay = document.getElementById(DAILY_FORTUNE_OVERLAY_ID);
    if (overlay) overlay.style.display = 'none';
}

function openDailyFortuneOverlay() {
    const overlay = ensureDailyFortuneOverlay();
    overlay.style.display = 'flex';
}

function renderDailyFortuneResult(result) {
    const cardHost = document.getElementById(DAILY_FORTUNE_CARD_HOST_ID);
    const textEl = document.getElementById(DAILY_FORTUNE_TEXT_ID);
    const titleEl = document.getElementById(DAILY_FORTUNE_TITLE_ID);
    if (!cardHost || !textEl || !titleEl) return;

    const card = getCardDataFromFortuneResult(result);
    const cardEl = createCardElement(card, { hidden: false, clickable: false });
    cardEl.classList.add('tarot-fortune-card');
    if (String(result?.orientation || '') === 'reversed') {
        cardEl.classList.add('is-reversed');
    }
    cardHost.innerHTML = '';
    cardHost.appendChild(cardEl);

    const orientationLabel = String(result?.orientation || '') === 'reversed' ? '騾・・ｽ・ｽ鄂ｮ' : '豁｣菴咲ｽｮ';
    const reward = Math.max(0, Math.floor(Number(result?.rewardPs || 0)));
    titleEl.textContent = `譛ｬ譌･縺ｮ驕句兇: ${String(result?.cardName || '')}・ｽE・ｽE{orientationLabel}・ｽE・ｽ`;
    textEl.textContent = `${String(result?.fortune || '')}  +${reward}Ps`;
}

async function requestDailyFortuneStatus(playFabId) {
    return callJsonApi('/api/tarot-fortune-status', { playFabId });
}

async function requestDailyFortuneDraw(playFabId) {
    return callJsonApi('/api/tarot-fortune-draw', { playFabId });
}

async function handleDailyFortuneDraw(playFabId) {
    if (!playFabId || dailyFortuneInFlight) return;
    dailyFortuneInFlight = true;
    const drawButton = document.getElementById(DAILY_FORTUNE_DRAW_BUTTON_ID);
    const closeButton = document.getElementById(DAILY_FORTUNE_CLOSE_BUTTON_ID);
    const textEl = document.getElementById(DAILY_FORTUNE_TEXT_ID);
    try {
        if (drawButton) {
            drawButton.disabled = true;
            drawButton.textContent = '蜊縺・・ｽ・ｽ...';
        }
        const data = await requestDailyFortuneDraw(playFabId);
        if (data?.result) {
            renderDailyFortuneResult(data.result);
            dailyFortuneClaimedSession = true;
            dailyFortuneCanDrawSession = false;
        }
        if (Number.isFinite(Number(data?.balance))) {
            updateGlobalPsDisplay(Number(data.balance));
        }
        if (textEl && !data?.result?.fortune) {
            textEl.textContent = '譛ｬ譌･縺ｮ蜊縺・・ｽ・ｽ譫懊ｒ蜿門ｾ励＠縺ｾ縺励◆縲・;
        }
        const pointMessage = document.getElementById('pointMessage');
        if (pointMessage && data?.result) {
            const name = String(data.result.cardName || '繧ｫ繝ｼ繝・);
            const reward = Math.max(0, Math.floor(Number(data.result.rewardPs || 0)));
            pointMessage.textContent = `譛ｬ譌･縺ｮ驕句兇縲・{name}縲・ +${reward}Ps`;
        }
    } catch (error) {
        if (textEl) {
            textEl.textContent = `蜊縺・・ｽ・ｽ螟ｱ謨励＠縺ｾ縺励◆: ${error?.message || 'unknown error'}`;
        }
        if (drawButton) drawButton.disabled = false;
    } finally {
        if (drawButton) {
            drawButton.textContent = '蜊縺・;
            drawButton.style.display = dailyFortuneClaimedSession ? 'none' : 'inline-flex';
            drawButton.disabled = dailyFortuneClaimedSession;
        }
        if (closeButton) closeButton.style.display = 'inline-flex';
        dailyFortuneInFlight = false;
    }
}

function setupDailyFortuneOverlay(playFabId) {
    openDailyFortuneOverlay();
    const drawButton = document.getElementById(DAILY_FORTUNE_DRAW_BUTTON_ID);
    const closeButton = document.getElementById(DAILY_FORTUNE_CLOSE_BUTTON_ID);
    const cardHost = document.getElementById(DAILY_FORTUNE_CARD_HOST_ID);
    const textEl = document.getElementById(DAILY_FORTUNE_TEXT_ID);
    const titleEl = document.getElementById(DAILY_FORTUNE_TITLE_ID);

    if (titleEl) titleEl.textContent = '譛ｬ譌･縺ｮ驕句兇';
    if (cardHost) cardHost.innerHTML = '';
    if (textEl) textEl.textContent = '荳ｭ螟ｮ縺ｮ繝懊ち繝ｳ縺ｧ蜊縺・・ｽ・ｽ髢句ｧ九＠縺ｦ縺上□縺輔＞縲・;

    if (drawButton) {
        drawButton.style.display = 'inline-flex';
        drawButton.disabled = false;
        drawButton.textContent = '蜊縺・;
        drawButton.onclick = () => handleDailyFortuneDraw(playFabId);
    }
    if (closeButton) {
        closeButton.style.display = 'inline-flex';
        closeButton.onclick = () => closeDailyFortuneOverlay();
    }
}

async function maybeShowDailyFortunePrompt(playFabId, options = {}) {
    if (!playFabId) return;
    const force = !!options.force;
    if (dailyFortuneClaimedSession) return;
    if (dailyFortuneCheckedSession && !force) {
        if (dailyFortuneCanDrawSession) {
            setupDailyFortuneOverlay(playFabId);
        }
        return;
    }
    try {
        const status = await requestDailyFortuneStatus(playFabId);
        dailyFortuneCheckedSession = true;
        dailyFortuneCanDrawSession = !!status?.canDraw;
        dailyFortuneClaimedSession = !dailyFortuneCanDrawSession;
        if (!dailyFortuneCanDrawSession) return;
        setupDailyFortuneOverlay(playFabId);
    } catch (error) {
        console.warn('[dailyFortune] status check failed:', error);
    }
}

function bindElements() {
    ui.root = document.getElementById('tabContentTarot');
    ui.pokerRoot = ui.root?.querySelector('.tarot-poker-root') || null;
    ui.startButton = document.getElementById('tarotStartButton');
    ui.nextButton = document.getElementById('tarotNextButton');
    ui.stateText = document.getElementById('tarotStateText');
    ui.deckAnchor = document.getElementById('tarotDeckAnchor');
    ui.board = document.getElementById('tarotPokerBoard');
    ui.cpuHand = document.getElementById('tarotCpuHand');
    ui.playerHand = document.getElementById('tarotPlayerHand');
    ui.cpuGrave = document.getElementById('tarotCpuGrave');
    ui.playerGrave = document.getElementById('tarotPlayerGrave');
    ui.resultText = document.getElementById('tarotResultText');
    ui.log = document.getElementById('tarotLog');
    ui.effectOverlay = document.getElementById('tarotEffectOverlay');
    ui.cutin = document.getElementById('tarotCutin');
    ui.judgmentPanel = document.getElementById('tarotJudgmentPanel');
    ui.judgmentOptions = document.getElementById('tarotJudgmentOptions');
    ui.bettingInfo = document.getElementById('tarotBettingInfo');
    ui.betPopup = document.getElementById('tarotBetPopup');
    ui.potText = document.getElementById('tarotPotText');
    ui.potValueText = document.getElementById('tarotPotValue');
    ui.playerPointText = document.getElementById('tarotPlayerPointText');
    ui.cpuPointText = document.getElementById('tarotCpuPointText');
    ui.betActionHint = document.getElementById('tarotBetActionHint');
    ui.betCheckButton = document.getElementById('tarotBetCheck');
    ui.betCallButton = document.getElementById('tarotBetCall');
    ui.betBetButton = document.getElementById('tarotBetBet');
    ui.betRaiseButton = document.getElementById('tarotBetRaise');
    ui.betFoldButton = document.getElementById('tarotBetFold');
    ui.playerOutcome = document.getElementById('tarotPlayerOutcome');
    ui.cpuOutcome = document.getElementById('tarotCpuOutcome');
    ui.playerRole = document.getElementById('tarotPlayerRole');
    ui.cpuRole = document.getElementById('tarotCpuRole');
    ui.playerAction = document.getElementById('tarotPlayerAction');
    ui.cpuAction = document.getElementById('tarotCpuAction');
}

function bindEvents() {
    if (isBound) return;
    isBound = true;
    ui.startButton?.addEventListener('click', startNewGame);
    ui.nextButton?.addEventListener('click', handleNext);
    ui.betCheckButton?.addEventListener('click', () => onPlayerBetAction('check'));
    ui.betCallButton?.addEventListener('click', () => onPlayerBetAction('call'));
    ui.betBetButton?.addEventListener('click', () => onPlayerBetAction('bet'));
    ui.betRaiseButton?.addEventListener('click', () => onPlayerBetAction('raise'));
    ui.betFoldButton?.addEventListener('click', () => onPlayerBetAction('fold'));
}

export async function loadTarotPokerPage() {
    bindElements();
    bindEvents();
    if (!state) {
        resetState();
    }
    render();
    if (window?.myPlayFabId) {
        await maybeShowDailyFortunePrompt(window.myPlayFabId, { force: false });
    }
}

export async function showDailyFortunePromptOnLogin(playFabId) {
    await maybeShowDailyFortunePrompt(playFabId, { force: true });
}
