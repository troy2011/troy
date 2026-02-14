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
    7.5: 'エレメント',
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
const BET_ACTION_TEMPO_MS = 460;
const BET_ACTION_GAP_MS = 140;
const BET_ACTION_LABEL = {
    check: 'チェック',
    call: 'コール',
    bet: 'BET',
    raise: 'レイズ',
    fold: 'フォールド'
};

let isBound = false;
let state = null;

const ui = {
    root: null,
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
    // 110,111,...,119 の10フレームを必ず再生
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
    state = {
        phase: 'idle',
        drawRound: 0,
        deck: [],
        board: [],
        players: {
            player: {
                id: 'player',
                name: 'あなた',
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
    const ownerName = ownerKey === 'player' ? 'あなた' : 'CPU';
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
    return `${card.suit} ${getCardNumberLabel(card)}`;
}

function getCardNameLabel(card) {
    if (!card) return '';
    if (card.isArcana) return ARCANA_NAME[card.number] || 'アルカナ';
    return card.suit;
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

function getCardSuitForFlush(card) {
    if (!card) return 'None';
    if (!card.isArcana) return card.suit;
    if (card.suit === 'All') return 'All';
    if (card.number === 16) return 'Sword';
    if (card.number === 17) return 'Cup';
    if (card.number === 18) return 'Pentacle';
    if (card.number === 19) return 'Wand';
    return 'None';
}

function matchesSuit(card, suit) {
    const suited = getCardSuitForFlush(card);
    return suited === suit || suited === 'All';
}

function compareNumberDesc(a, b) {
    return getCardPrimaryValue(b) - getCardPrimaryValue(a);
}

function compareCardsForFlush(a, b) {
    const diff = getCardPrimaryValue(b) - getCardPrimaryValue(a);
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

    const nonArcanaSuits = new Set();
    cards.forEach((card) => {
        if (!card || card.isArcana) return;
        const suit = getCardSuitForFlush(card);
        if (SUITS.includes(suit)) {
            nonArcanaSuits.add(suit);
        }
    });

    if (nonArcanaSuits.size < SUITS.length) return null;

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
    const suitStrength = sorted.reduce((max, card) => {
        const suit = getCardSuitForFlush(card);
        return Math.max(max, SUIT_RANK[suit] || 0);
    }, 0);

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
        rank = 7.5;
        rankVector = [element.maxArcana];
        maxNumber = element.maxArcana;
        rankLabel = '\u30a8\u30ec\u30e1\u30f3\u30c8';
    } else if (flush || allArcana) {
        rank = 7;
        if (flush) {
            rankVector = flush.valueVector;
        } else {
            rankVector = sorted.map((card) => getCardPrimaryValue(card)).sort((a, b) => b - a);
            rankLabel = 'アルカナフラッシュ';
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
        rankLabel: rankLabel || HAND_RANK_LABEL[rank] || '役なし',
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

function isBettingPhase() {
    return typeof state?.phase === 'string' && state.phase.startsWith('betting-');
}

function formatTestPoint(value) {
    const amount = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    return `${amount} TP`;
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
        pushLog(`ポット ${formatTestPoint(pot)} は引き分けで分配。`);
        return;
    }
    if (winnerKey === 'player' || winnerKey === 'cpu') {
        state.players[winnerKey].testPoints += pot;
        const winnerName = state.players[winnerKey].name || winnerKey;
        pushLog(`${winnerName} がポット ${formatTestPoint(pot)} を獲得。`);
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
    pushLog(`ベッティング開始: ${roundKey} / 最小 ${formatTestPoint(TEST_BET_UNIT)}`);
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
    if (!state?.betting) return { ok: false, message: 'ベットフェーズではありません。' };
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
            playerBest: { rankLabel: ownerKey === 'player' ? 'フォールド負け' : 'フォールド勝ち' },
            cpuBest: { rankLabel: ownerKey === 'cpu' ? 'フォールド負け' : 'フォールド勝ち' }
        };
        return { ok: true, handEnded: true };
    }

    if (action === 'check') {
        if (toCall > 0) return { ok: false, message: 'コール額があります。' };
        betting.checks[ownerKey] = true;
        pushLog(`${actorName} はチェック。`);
        if (betting.checks.player && betting.checks.cpu) {
            betting.pendingResponseFor = null;
            return { ok: true, roundComplete: true };
        }
        return { ok: true };
    }

    if (action === 'call') {
        if (toCall <= 0) return { ok: false, message: 'コール不要です。' };
        if (!addBetToPot(ownerKey, toCall)) return { ok: false, message: 'ポイント不足でコールできません。' };
        betting.checks.player = false;
        betting.checks.cpu = false;
        betting.pendingResponseFor = null;
        pushLog(`${actorName} はコール (${formatTestPoint(toCall)})。`);
        return { ok: true, roundComplete: true };
    }

    if (action === 'bet') {
        if (betting.currentBet > 0 || toCall > 0) return { ok: false, message: '現在はベットではなくコール/レイズです。' };
        const amount = betting.minBet;
        if (!addBetToPot(ownerKey, amount)) return { ok: false, message: 'ポイント不足でベットできません。' };
        betting.currentBet = betting.contributions[ownerKey];
        betting.pendingResponseFor = otherKey;
        betting.checks.player = false;
        betting.checks.cpu = false;
        pushLog(`${actorName} はベット (${formatTestPoint(amount)})。`);
        return { ok: true };
    }

    if (action === 'raise') {
        const raiseCost = toCall + betting.minRaise;
        if (raiseCost <= 0) return { ok: false, message: 'レイズ条件を満たしていません。' };
        if (!addBetToPot(ownerKey, raiseCost)) return { ok: false, message: 'ポイント不足でレイズできません。' };
        betting.currentBet = betting.contributions[ownerKey];
        betting.pendingResponseFor = otherKey;
        betting.checks.player = false;
        betting.checks.cpu = false;
        pushLog(`${actorName} はレイズ (+${formatTestPoint(betting.minRaise)})。`);
        return { ok: true };
    }

    return { ok: false, message: '未対応アクションです。' };
}

async function transitionAfterPhase(nextPhase = 'turn-ready') {
    if (nextPhase === 'showdown') {
        await resolveShowdown();
        return;
    }
    if (nextPhase === 'betting-mid') {
        startBettingRound('mid', 'turn-ready');
        render();
        return;
    }
    if (nextPhase === 'betting-final') {
        startBettingRound('final', 'showdown');
        render();
        return;
    }
    state.phase = nextPhase;
}

async function completeBettingRoundIfNeeded() {
    if (!state?.betting) return;
    const nextPhase = state.betting.nextPhase;
    state.betting = null;
    await transitionAfterPhase(nextPhase);
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
        pushLog(result.message || 'この操作はできません。');
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
    if (cpu.hand.length !== 2 || (boardCards.length !== 3 && boardCards.length !== 5)) {
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

async function revealBoard(count) {
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
        applyBoardSpecial(card);
        render();
        if (state.forceShowdown) break;
    }
    if (state.forceShowdown) {
        await forceShowdown();
    }
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

async function processCpuExchange(nextPhase = 'turn-ready') {
    const cpu = state.players.cpu;
    if (!cpu.canExchange) {
        pushLog('CPUは交換不能。ドローをスキップ。');
        await transitionAfterPhase(nextPhase);
        return;
    }
    if (!cpu.hand.length) {
        await transitionAfterPhase(nextPhase);
        return;
    }
    state.cpuThinking = true;
    state.phase = 'cpu-thinking';
    pushLog('CPUが交換手を読んでいます...');
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
    pushLog(`CPUは ${getCardDisplayName(discarded)} を墓地に送った（期待勝率 ${(Math.max(0, plan.expected || 0) * 100).toFixed(1)}%）。`);
    applyDiscardSpecial(discarded, 'cpu');
    render();
    await wait(280);

    const canJudgment = discarded.effectType === EFFECT_TYPE.JUDGMENT && !isEffectDisabled();
    if (canJudgment && plan.source === 'grave' && plan.graveOwnerKey) {
        const gained = takeLatestGraveCard(plan.graveOwnerKey);
        if (gained) {
            const fromGrave = plan.graveOwnerKey === 'player' ? ui.playerGrave : ui.cpuGrave;
            await animateCardFlight(gained, fromGrave, ui.cpuHand, 280, 1, { hidden: true });
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
                const fromGrave = pickedOwner === 'player' ? ui.playerGrave : ui.cpuGrave;
                await animateCardFlight(gained, fromGrave, ui.cpuHand, 280, 1, { hidden: true });
                cpu.hand.push(gained);
                pushLog(`CPUは審判で ${state.players[pickedOwner].name} の最新墓地カードを取得。`);
                showEffectOverlay('JUDGMENT - SOUL RETRIEVE');
            } else {
                drawFor('cpu');
                pushLog('CPUの審判対象が消失。山札から補充。');
            }
        } else {
            const drawn = drawFor('cpu');
            if (drawn) {
                await animateCardFlight(drawn, ui.deckAnchor, ui.cpuHand, 260, 1, { hidden: true });
            }
            pushLog('CPUは審判を使ったが対象なし。山札から補充。');
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
    resetState();
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
    startBettingRound('preflop', 'preflop');
    pushLog('プレフロップ: 手札2枚を配布。');
    render();
}

async function handleNext() {
    if (!state) return;
    if (state.phase === 'preflop') {
        await revealBoard(3);
        if (state.phase !== 'showdown') {
            state.drawRound = 1;
            state.phase = 'draw-player';
            if (!state.players.player.canExchange) {
                pushLog('あなたは交換不能。ドローをスキップ。');
                await processCpuExchange(getPostDrawNextPhase());
            }
        }
        render();
        return;
    }

    if (state.phase === 'draw-player') {
        pushLog(`あなたは第${state.drawRound}ドローをスキップ。`);
        await finishPlayerExchange(getPostDrawNextPhase());
        return;
    }

    if (state.phase === 'turn-ready') {
        await revealBoard(1);
        if (state.phase !== 'showdown') {
            state.drawRound = 2;
            state.phase = 'draw-player';
            if (!state.players.player.canExchange) {
                pushLog('あなたは交換不可。ドローをスキップ。');
                await processCpuExchange(getPostDrawNextPhase());
            }
        }
        render();
        return;
    }

    if (state.phase === 'river-ready') {
        await revealBoard(1);
        if (state.phase !== 'showdown') {
            await transitionAfterPhase('betting-final');
        }
        render();
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

    const drawn = drawFor('player');
    if (drawn) {
        await animateCardFlight(drawn, ui.deckAnchor, ui.playerHand, 260, 1);
    }
    await finishPlayerExchange(getPostDrawNextPhase());
}

async function onJudgmentPick(ownerKey) {
    if (!state || state.phase !== 'draw-player-judgment') return;
    const gained = takeLatestGraveCard(ownerKey);
    if (gained) {
        const fromGrave = ownerKey === 'player' ? ui.playerGrave : ui.cpuGrave;
        await animateCardFlight(gained, fromGrave, ui.playerHand, 280, 1);
        state.players.player.hand.push(gained);
        pushLog(`審判発動: ${state.players[ownerKey].name} の最新墓地カードを取得。`);
        showEffectOverlay('JUDGMENT - SOUL RETRIEVE');
    } else {
        const drawn = drawFor('player');
        if (drawn) {
            await animateCardFlight(drawn, ui.deckAnchor, ui.playerHand, 260, 1);
        }
        pushLog('審判対象が消失したため、山札から1枚補充。');
    }
    state.pendingJudgment = null;
    state.phase = 'draw-player';
    await finishPlayerExchange(getPostDrawNextPhase());
}

function getPhaseText() {
    if (!state) return '';
    if (state.phase === 'idle') return '「新しい勝負を始める」を押してください。';
    if (state.phase === 'dealing') return '配札中...';
    if (state.phase === 'betting-preflop') return 'プリフロップBET: アクションを選択してください。';
    if (state.phase === 'betting-mid') return '中盤BET: ターン公開前の駆け引き。';
    if (state.phase === 'betting-final') return '最終BET: ショーダウン前の勝負。';
    if (state.phase === 'preflop') return '次へでフロップを開示。';
    if (state.phase === 'draw-player') return `第${state.drawRound}ドローフェーズ: 手札1枚を選択（次へでスキップ）。`;
    if (state.phase === 'draw-player-judgment') return '審判発動: 取得カードを選択。';
    if (state.phase === 'cpu-thinking') return 'CPUが行動を決定中...';
    if (state.phase === 'turn-ready') return '次へでターンを開示。';
    if (state.phase === 'river-ready') return '次へでリバーを開示。';
    if (state.phase === 'showdown') return 'ショーダウン完了。';
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

function getRoleCardsForDisplay(score) {
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

    switch (score.rank) {
    case 2: // high card
        return cards.slice(0, 1);
    case 3: // one pair
        return takeByCount(2, 1).slice(0, 2);
    case 4: // two pair
        return takeByCount(2, 2).slice(0, 4);
    case 5: // three card
        return takeByCount(3, 1).slice(0, 3);
    case 9: // four card
        return takeByCount(4, 1).slice(0, 4);
    case 11: // five card
        return takeByCount(5, 1).slice(0, 5);
    default: // straight / flush / full house / straight flush
        return cards.slice(0, 5);
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

function renderRoleLabels() {
    if (!ui.playerRole || !ui.cpuRole) return;
    if (state.phase !== 'showdown' || !state.result) {
        ui.playerRole.textContent = '';
        ui.cpuRole.textContent = '';
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
    const playerCards = getRoleCardsForDisplay(state.result.playerBest);
    const cpuCards = getRoleCardsForDisplay(state.result.cpuBest);
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
        btn.addEventListener('click', () => onJudgmentPick(option.ownerKey));
        ui.judgmentOptions.appendChild(btn);
    });
}

function renderButtons() {
    if (!ui.nextButton) return;
    if (!state || state.phase === 'idle' || state.phase === 'showdown' || state.phase === 'dealing') {
        ui.nextButton.disabled = true;
        ui.nextButton.textContent = '次へ';
        return;
    }
    if (isBettingPhase()) {
        ui.nextButton.disabled = true;
        ui.nextButton.textContent = 'BET操作中';
        return;
    }
    if (state.phase === 'preflop') {
        ui.nextButton.disabled = false;
        ui.nextButton.textContent = 'フロップを開く';
        return;
    }
    if (state.phase === 'draw-player') {
        ui.nextButton.disabled = false;
        ui.nextButton.textContent = `第${state.drawRound}ドローをスキップ`;
        return;
    }
    if (state.phase === 'draw-player-judgment') {
        ui.nextButton.disabled = true;
        ui.nextButton.textContent = '審判選択中';
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
        return;
    }
    ui.nextButton.disabled = true;
    ui.nextButton.textContent = '次へ';
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
    if (ui.potText) ui.potText.textContent = `Pot: ${formatTestPoint(state.pot)}`;
    if (ui.playerPointText) ui.playerPointText.textContent = `あなた: ${formatTestPoint(state.players.player.testPoints)}`;
    if (ui.cpuPointText) ui.cpuPointText.textContent = `CPU: ${formatTestPoint(state.players.cpu.testPoints)}`;
    if (!ui.bettingInfo) return;

    const active = isBettingPhase() && !!state.betting;
    ui.bettingInfo.style.display = active ? 'block' : 'none';
    if (ui.betPopup) ui.betPopup.style.display = active ? 'block' : 'none';
    if (!active) {
        if (ui.betActionHint) ui.betActionHint.textContent = 'ベットフェーズ待機中';
        if (ui.betCheckButton) ui.betCheckButton.disabled = true;
        if (ui.betCallButton) ui.betCallButton.disabled = true;
        if (ui.betBetButton) ui.betBetButton.disabled = true;
        if (ui.betRaiseButton) ui.betRaiseButton.disabled = true;
        if (ui.betFoldButton) ui.betFoldButton.disabled = true;
        return;
    }

    const toCall = getToCall('player');
    const minBet = state.betting.minBet;
    const minRaise = state.betting.minRaise;
    const point = state.players.player.testPoints;
    const currentBet = state.betting.currentBet || 0;
    const pending = state.betting.pendingResponseFor;

    if (ui.betActionHint) {
        ui.betActionHint.textContent = pending === 'player'
            ? `CPUのアクションに対応してください（コール ${formatTestPoint(toCall)}）`
            : `あなたの手番です（現在ベット ${formatTestPoint(currentBet)}）`;
    }

    if (ui.betCheckButton) ui.betCheckButton.disabled = toCall > 0;
    if (ui.betCallButton) {
        ui.betCallButton.disabled = toCall <= 0 || point < toCall;
        ui.betCallButton.textContent = `コール ${formatTestPoint(toCall)}`;
    }
    if (ui.betBetButton) {
        ui.betBetButton.disabled = currentBet > 0 || point < minBet;
        ui.betBetButton.textContent = `BET ${formatTestPoint(minBet)}`;
    }
    if (ui.betRaiseButton) {
        const raiseCost = toCall + minRaise;
        ui.betRaiseButton.disabled = currentBet <= 0 || point < raiseCost;
        ui.betRaiseButton.textContent = `レイズ +${formatTestPoint(minRaise)}`;
    }
    if (ui.betFoldButton) ui.betFoldButton.disabled = false;
}
function render() {
    if (!state || !ui.root) return;
    renderBoard();
    const isShowdown = state.phase === 'showdown' && !!state.result;
    const isDealing = state.phase === 'dealing' || !!state.initialDealAnimating;
    ui.root.classList.toggle('is-showdown', isShowdown);
    ui.root.classList.toggle('is-dealing', isDealing);
    const playerCardsForView = isShowdown ? getRoleCardsForDisplay(state.result.playerBest) : state.players.player.hand;
    const cpuCardsForView = isShowdown ? getRoleCardsForDisplay(state.result.cpuBest) : state.players.cpu.hand;
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
            <div id="${DAILY_FORTUNE_TITLE_ID}" class="tarot-fortune-title">本日の運勢</div>
            <div class="tarot-fortune-sub">1日1回だけ、タロットで運勢を占えます。</div>
            <div id="${DAILY_FORTUNE_CARD_HOST_ID}" class="tarot-fortune-card-host"></div>
            <div id="${DAILY_FORTUNE_TEXT_ID}" class="tarot-fortune-text">中央のボタンで占いを開始してください。</div>
            <div class="tarot-fortune-actions">
                <button id="${DAILY_FORTUNE_DRAW_BUTTON_ID}" type="button">占う</button>
                <button id="${DAILY_FORTUNE_CLOSE_BUTTON_ID}" type="button" style="display:none;">閉じる</button>
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

    const orientationLabel = String(result?.orientation || '') === 'reversed' ? '逆位置' : '正位置';
    const reward = Math.max(0, Math.floor(Number(result?.rewardPs || 0)));
    titleEl.textContent = `本日の運勢: ${String(result?.cardName || '')}（${orientationLabel}）`;
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
            drawButton.textContent = '占い中...';
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
            textEl.textContent = '本日の占い結果を取得しました。';
        }
        const pointMessage = document.getElementById('pointMessage');
        if (pointMessage && data?.result) {
            const name = String(data.result.cardName || 'カード');
            const reward = Math.max(0, Math.floor(Number(data.result.rewardPs || 0)));
            pointMessage.textContent = `本日の運勢「${name}」: +${reward}Ps`;
        }
    } catch (error) {
        if (textEl) {
            textEl.textContent = `占いに失敗しました: ${error?.message || 'unknown error'}`;
        }
        if (drawButton) drawButton.disabled = false;
    } finally {
        if (drawButton) {
            drawButton.textContent = '占う';
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

    if (titleEl) titleEl.textContent = '本日の運勢';
    if (cardHost) cardHost.innerHTML = '';
    if (textEl) textEl.textContent = '中央のボタンで占いを開始してください。';

    if (drawButton) {
        drawButton.style.display = 'inline-flex';
        drawButton.disabled = false;
        drawButton.textContent = '占う';
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
