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
    11: 'ファイブカード',
    10: 'ストレートフラッシュ',
    9: 'フォーカード',
    8: 'フルハウス',
    4.5: '\u30a8\u30ec\u30e1\u30f3\u30c8',
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
const BLIND_BONUS_TP = 10;
const PLAYER_ORDER = ['player', 'cpu'];
const CPU_SIMULATION_COUNT = 180;
const CPU_DRAW_SAMPLE_COUNT = 16;
const BET_ACTION_TEMPO_MS = 900;
const BET_ACTION_GAP_MS = 260;
const ROUND_CUTIN_TEMPO_MS = 980;
const SHOWDOWN_RESULT_CUTIN_TEMPO_MS = 1700;
const CUTIN_STYLE_CLASSES = ['is-player', 'is-cpu', 'is-showdown-win', 'is-showdown-lose', 'is-showdown-draw'];
const BET_ACTION_LABEL = {
    check: 'チェック',
    call: 'コール',
    bet: 'BET',
    raise: 'レイズ',
    fold: 'フォールド'
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
    stateText: null,
    drawGuide: null,
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
    stopPotRollAnimation();
    potDisplayValue = null;
    state = {
        phase: 'idle',
        drawRound: 0,
        isResolvingPlayerDiscard: false,
        selectedDiscardIndex: null,
        selectedJudgmentPick: null,
        awaitingPostJudgmentDiscard: false,
        dealerIndex: 0,
        deck: [],
        board: [],
        players: {
            player: {
                id: 'player',
                name: 'あなた',
                hand: [],
                graveyard: [],
                canExchange: true,
                hasResurrectionRight: false,
                bettingEnabled: false,
                testPoints: TEST_POINT_START
            },
            cpu: {
                id: 'cpu',
                name: 'CPU',
                hand: [],
                graveyard: [],
                canExchange: true,
                hasResurrectionRight: false,
                bettingEnabled: false,
                testPoints: TEST_POINT_START
            }
        },
        graveyard: [],
        potArray: [],
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

function resetCutinStyle() {
    if (!ui.cutin) return;
    ui.cutin.classList.remove(...CUTIN_STYLE_CLASSES);
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
        resetCutinStyle();
        ui.cutin.classList.add('show', ownerClass);
    }
    await wait(BET_ACTION_TEMPO_MS);
    if (actionEl) {
        actionEl.classList.remove('show', 'is-player', 'is-cpu');
        actionEl.textContent = '';
    }
    if (ui.cutin) {
        ui.cutin.classList.remove('show');
        resetCutinStyle();
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
    resetCutinStyle();
    ui.cutin.classList.add('show');
    await wait(ROUND_CUTIN_TEMPO_MS);
    ui.cutin.classList.remove('show');
    resetCutinStyle();
    await wait(BET_ACTION_GAP_MS);
}

function getShowdownCutinPayload() {
    const winner = state?.result?.winner;
    const playerRole = state?.result?.playerBest?.rankLabel || '役なし';
    const cpuRole = state?.result?.cpuBest?.rankLabel || '役なし';
    if (winner === 'player') {
        return {
            className: 'is-showdown-win',
            text: `VICTORY - ${playerRole}`
        };
    }
    if (winner === 'cpu') {
        return {
            className: 'is-showdown-lose',
            text: `DEFEAT - ${cpuRole}`
        };
    }
    return {
        className: 'is-showdown-draw',
        text: `DRAW GAME - ${playerRole}`
    };
}

async function showShowdownResultCutin() {
    const payload = getShowdownCutinPayload();
    if (!payload?.text) return;
    if (!ui.cutin) {
        await wait(SHOWDOWN_RESULT_CUTIN_TEMPO_MS);
        return;
    }
    ui.cutin.textContent = payload.text;
    resetCutinStyle();
    ui.cutin.classList.add('show', payload.className);
    await wait(SHOWDOWN_RESULT_CUTIN_TEMPO_MS);
    ui.cutin.classList.remove('show');
    resetCutinStyle();
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

function getAllGraveOptions({ excludeOwnerKey = null, latestOnly = false, excludeCards = [] } = {}) {
    const options = [];
    const excludeSet = new Set(
        (Array.isArray(excludeCards) ? excludeCards : [])
            .map((entry) => `${entry?.ownerKey || ''}:${entry?.cardId || ''}`)
            .filter((key) => key !== ':')
    );
    ['player', 'cpu'].forEach((ownerKey) => {
        if (excludeOwnerKey && ownerKey === excludeOwnerKey) return;
        const grave = state.players[ownerKey]?.graveyard || [];
        const startIndex = grave.length - 1;
        const endIndex = latestOnly ? Math.max(grave.length - 1, 0) : 0;
        for (let i = startIndex; i >= endIndex; i -= 1) {
            const card = grave[i];
            if (!card) continue;
            const key = `${ownerKey}:${card.id}`;
            if (excludeSet.has(key)) continue;
            options.push({ ownerKey, cardId: card.id, card });
            if (latestOnly) break;
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

function getCardEffectType(card) {
    if (!card) return EFFECT_TYPE.NONE;
    const raw = String(card.effectType || '').trim().toLowerCase();
    if (raw === 'world') return EFFECT_TYPE.WORLD;
    if (raw === 'judgment') return EFFECT_TYPE.JUDGMENT;
    if (raw === 'fool') return EFFECT_TYPE.FOOL;
    const number = Number(card.number);
    if (number === 21) return EFFECT_TYPE.WORLD;
    if (number === 20) return EFFECT_TYPE.JUDGMENT;
    if (number === 0) return EFFECT_TYPE.FOOL;
    return EFFECT_TYPE.NONE;
}

function getJudgmentContextForExchange(ownerKey, discardedCard = null) {
    if (!state?.players?.[ownerKey] || isEffectDisabled()) return null;
    const owner = state.players[ownerKey];
    const isKarma = getCardEffectType(discardedCard) === EFFECT_TYPE.JUDGMENT;
    if (isKarma) {
        return {
            mode: 'karma',
            options: getAllGraveOptions({ excludeOwnerKey: ownerKey, latestOnly: false })
        };
    }
    if (owner.hasResurrectionRight) {
        const excludeCards = [];
        if (discardedCard?.id) {
            excludeCards.push({ ownerKey, cardId: discardedCard.id });
        }
        return {
            mode: 'resurrection',
            options: getAllGraveOptions({ latestOnly: false, excludeCards })
        };
    }
    return null;
}

function hasFoolInHand(ownerKey) {
    return state.players[ownerKey].hand.some((card) => getCardEffectType(card) === EFFECT_TYPE.FOOL);
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

function isRomanRankLabel(label) {
    return /^[IVXLCDM]+$/u.test(String(label || '').trim());
}

function getLeadCardLabelForScore(cards, leadValue) {
    if (!Array.isArray(cards) || cards.length === 0) return '';
    const hit = cards
        .slice()
        .sort(compareCardsForFlush)
        .find((card) => getCardPrimaryValue(card) === leadValue);
    if (!hit) return '';
    return getCardNameLabel(hit);
}

function decorateRankLabel(baseRankLabel, rank, rankVector, cards) {
    if (!baseRankLabel) return '';
    if (Number(rank) === 4.5) return baseRankLabel; // エレメントは固定名を優先
    const leadValue = Array.isArray(rankVector) ? Number(rankVector[0] || 0) : 0;
    if (!Number.isFinite(leadValue) || leadValue <= 0) return baseRankLabel;
    const leadLabel = getLeadCardLabelForScore(cards, leadValue);
    if (!leadLabel || isRomanRankLabel(leadLabel)) return baseRankLabel;
    return `${leadLabel}${baseRankLabel}`;
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
    const suitOptionsList = cards.map((card) => {
        const options = getCardSuitOptionsForFlush(card);
        if (options.includes('All')) return SUITS.slice();
        return options.filter((suit) => SUITS.includes(suit));
    });
    const canCoverAllSuits = (() => {
        const dfs = (index, covered) => {
            if (covered.size === SUITS.length) return true;
            if (index >= suitOptionsList.length) return false;
            const options = suitOptionsList[index];
            if (!options || options.length === 0) {
                return dfs(index + 1, covered);
            }
            for (const suit of options) {
                const next = new Set(covered);
                next.add(suit);
                if (dfs(index + 1, next)) return true;
            }
            return dfs(index + 1, covered);
        };
        return dfs(0, new Set());
    })();
    if (!canCoverAllSuits) return null;

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

    const baseRankLabel = rankLabel || HAND_RANK_LABEL[rank] || '役なし';
    const decoratedRankLabel = decorateRankLabel(baseRankLabel, rank, rankVector, sorted);

    return {
        rank,
        rankLabel: decoratedRankLabel,
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
    const leftRemaining = getRemainingCardsOutsideBest(leftAllCards, leftBest);
    const rightRemaining = getRemainingCardsOutsideBest(rightAllCards, rightBest);
    const remainingCmp = compareRemainingCardSets(leftRemaining, rightRemaining);
    return {
        cmp: remainingCmp,
        usedRemaining: leftRemaining.length > 0 || rightRemaining.length > 0,
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

function chooseBestTwoHandCardsForLiveRole(handCards, boardCards) {
    const hand = Array.isArray(handCards) ? handCards : [];
    const board = Array.isArray(boardCards) ? boardCards : [];
    if (hand.length <= 2) return hand.slice();
    let bestPair = hand.slice(0, 2);
    let bestScore = null;
    for (let i = 0; i < hand.length - 1; i += 1) {
        for (let j = i + 1; j < hand.length; j += 1) {
            const pair = [hand[i], hand[j]];
            const merged = [...pair, ...board];
            if (merged.length < 5) continue;
            const score = chooseBestFiveFromSeven(merged);
            if (!score) continue;
            if (!bestScore || compareScore(score, bestScore) > 0) {
                bestScore = score;
                bestPair = pair;
            }
        }
    }
    return bestScore ? bestPair : hand.slice(0, 2);
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
    if (!amountText) return `${icon}\n${label}`;
    const compactAmount = String(amountText || '').replace(/\s*TP$/u, '');
    return `${icon}\n${label}\n${compactAmount}`;
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

function addBetToPot(ownerKey, amount, meta = null) {
    if (!state?.betting || amount <= 0) return false;
    const player = state.players?.[ownerKey];
    if (!player || player.testPoints < amount) return false;
    player.testPoints -= amount;
    state.pot += amount;
    state.betting.contributions[ownerKey] += amount;
    if (!Array.isArray(state.potArray)) state.potArray = [];
    state.potArray.push({
        ownerKey,
        amount,
        reason: meta?.reason || 'bet',
        roundKey: state?.betting?.roundKey || null,
        at: Date.now()
    });
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

function getActivePlayerOrder() {
    const ordered = PLAYER_ORDER.filter((ownerKey) => !!state?.players?.[ownerKey]);
    if (ordered.length > 0) return ordered;
    return Object.keys(state?.players || {});
}

function normalizeDealerIndexByOrder(order) {
    if (!Array.isArray(order) || order.length <= 0) return 0;
    const raw = Math.floor(Number(state?.dealerIndex) || 0);
    const normalized = ((raw % order.length) + order.length) % order.length;
    state.dealerIndex = normalized;
    return normalized;
}

function applyPreflopBlind() {
    if (!state?.betting || state.betting.roundKey !== 'preflop') return;
    const order = getActivePlayerOrder();
    if (order.length < 2) return;
    const dealerPos = normalizeDealerIndexByOrder(order);
    const blindPos = (dealerPos + 1) % order.length;
    const blindOwner = order[blindPos];
    const blindResponder = order[(blindPos + 1) % order.length] || null;
    const blindAmount = Math.max(0, Math.floor(Number(BLIND_BONUS_TP) || 0));
    const payer = state.players?.[blindOwner];
    if (!payer || blindAmount <= 0) return;
    const payerStack = Math.max(0, Math.floor(Number(payer.testPoints) || 0));
    const payAmount = Math.min(blindAmount, payerStack);
    if (payAmount <= 0) {
        pushLog(`BLIND: ${blindOwner.toUpperCase()} stack不足`);
        return;
    }
    if (!addBetToPot(blindOwner, payAmount, { reason: 'blind' })) return;
    state.betting.currentBet = Math.max(
        Number(state.betting.currentBet) || 0,
        Number(state.betting.contributions?.[blindOwner]) || 0
    );
    state.betting.pendingResponseFor = blindResponder;
    state.betting.checks.player = false;
    state.betting.checks.cpu = false;
    const dealerOwner = order[dealerPos];
    pushLog(
        `BLIND: ${blindOwner.toUpperCase()} ${formatTestPoint(payAmount)} / DEALER ${String(dealerOwner || '').toUpperCase()}`
    );
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
    if (roundKey === 'preflop') {
        applyPreflopBlind();
    }
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
    if (state?.forceShowdown) {
        await forceShowdown();
        return;
    }
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
    if (nextPhase === 'river-ready') {
        await openRiverThenFinalBetting();
        return;
    }
    state.phase = nextPhase;
}

async function openRiverThenFinalBetting() {
    if (!state || state.phase === 'showdown' || state.phase === 'river-opening') return;
    state.phase = 'river-opening';
    render();
    await showRoundCutin('RIVER OPEN');
    await revealBoard(1);
    if (state.phase !== 'showdown') {
        await transitionAfterPhase('betting-final');
    }
    render();
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

function chooseCpuPlan() {
    const cpu = state.players.cpu;
    const boardCards = state.board.slice();
    const basePool = state.deck.slice();
    if (cpu.hand.length !== 2 || (boardCards.length !== 3 && boardCards.length !== 5)) {
        return { discardIndex: 0, source: 'deck', graveOwnerKey: null, expected: 0 };
    }

    let bestOverallPlan = null;
    for (let discardIndex = 0; discardIndex < cpu.hand.length; discardIndex += 1) {
        const keepCard = cpu.hand[discardIndex === 0 ? 1 : 0];
        if (!keepCard) continue;
        const discarded = cpu.hand[discardIndex];
        const judgmentCtx = getJudgmentContextForExchange('cpu', discarded);

        const evaluateFixedCard = (pickedCard) => {
            const hand = [keepCard, pickedCard];
            const poolAfter = buildPoolWithoutCards(basePool, [pickedCard]);
            const expected = estimateCpuWinRate(hand, boardCards, poolAfter);
            return expected;
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
            graveCardId: null,
            judgmentMode: judgmentCtx?.mode || null,
            expected: deckExpected
        };

        if (judgmentCtx && Array.isArray(judgmentCtx.options) && judgmentCtx.options.length > 0) {
            for (const option of judgmentCtx.options) {
                if (!option?.card) continue;
                const fixedExpected = evaluateFixedCard(option.card);
                if (fixedExpected > bestPlan.expected) {
                    bestPlan = {
                        discardIndex,
                        source: 'grave',
                        graveOwnerKey: option.ownerKey,
                        graveCardId: option.cardId || null,
                        judgmentMode: judgmentCtx.mode,
                        expected: fixedExpected
                    };
                }
            }
        }
        if (!bestOverallPlan || bestPlan.expected > bestOverallPlan.expected) {
            bestOverallPlan = bestPlan;
        }
    }

    return bestOverallPlan || {
        discardIndex: 0,
        source: 'deck',
        graveOwnerKey: null,
        graveCardId: null,
        judgmentMode: null,
        expected: 0
    };
}

function isEffectDisabled() {
    return state.effectsDisabledByFool;
}

function applyDiscardSpecial(card, ownerKey) {
    if (!card) return;
    const effectType = getCardEffectType(card);
    if (isEffectDisabled()) {
        if (effectType === EFFECT_TYPE.WORLD || effectType === EFFECT_TYPE.JUDGMENT) {
            pushLog('THE FOOL active: discard effect nullified');
            showEffectOverlay('THE FOOL - EFFECT NULLIFIED');
        }
        return;
    }
    if (effectType === EFFECT_TYPE.WORLD) {
        const otherKey = ownerKey === 'player' ? 'cpu' : 'player';
        state.players[otherKey].canExchange = false;
        const playerHasFool = hasFoolInHand('player');
        const cpuHasFool = hasFoolInHand('cpu');
        state.players.player.bettingEnabled = playerHasFool;
        state.players.cpu.bettingEnabled = cpuHasFool;
        if (!playerHasFool && !cpuHasFool) {
            state.forceShowdown = true;
            pushLog('THE WORLD: no FOOL in hand -> force showdown');
            showEffectOverlay('THE WORLD - TIME STOP');
            return;
        }
        pushLog('THE WORLD: exchange lock -> ' + state.players[otherKey].name);
        showEffectOverlay('THE WORLD - EXCHANGE LOCK');
    }
}

function applyBoardSpecial(card) {
    if (!card) return;
    const effectType = getCardEffectType(card);
    if (effectType === EFFECT_TYPE.FOOL) {
        if (!state.effectsDisabledByFool) {
            state.effectsDisabledByFool = true;
            state.pendingJudgment = null;
            Object.keys(state.players || {}).forEach((ownerKey) => {
                state.players[ownerKey].hasResurrectionRight = false;
            });
            pushLog('THE FOOL on board: special effects disabled');
            showEffectOverlay('THE FOOL - CHAOS NULLIFICATION');
        }
        return;
    }
    if (effectType === EFFECT_TYPE.WORLD && !isEffectDisabled()) {
        state.players.player.bettingEnabled = hasFoolInHand('player');
        state.players.cpu.bettingEnabled = hasFoolInHand('cpu');
        state.forceShowdown = true;
        pushLog('THE WORLD on board: force showdown');
        showEffectOverlay('THE WORLD - TIME STOP');
        return;
    }
    if (effectType === EFFECT_TYPE.JUDGMENT && !isEffectDisabled()) {
        Object.keys(state.players || {}).forEach((ownerKey) => {
            state.players[ownerKey].hasResurrectionRight = true;
        });
        pushLog('JUDGMENT on board: resurrection right granted');
        showEffectOverlay('JUDGMENT - RESURRECTION');
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
        if (getCardEffectType(card) === EFFECT_TYPE.JUDGMENT) {
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
    state.forceShowdown = false;
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
    state.isResolvingPlayerDiscard = false;
    state.selectedDiscardIndex = null;
    state.selectedJudgmentPick = null;
    state.awaitingPostJudgmentDiscard = false;
    await showRoundCutin(`DRAW PHASE ${roundNo}`);
    const player = state.players.player;
    if (!player.canExchange) {
        pushLog(`あなたは交換不可（第${roundNo}ドロー）。`);
        await processCpuExchange(getPostDrawNextPhase());
        render();
        return;
    }
    const drawn = drawFor('player');
    if (drawn) {
        await animateCardFlight(drawn, ui.deckAnchor, ui.playerHand, 260, 1);
        pushLog(`強制ドロー: ${getCardDisplayName(drawn)}`);
    } else {
        pushLog('山札切れ: 強制ドロー失敗。');
    }
    state.phase = 'draw-player';
    render();
}

async function openFlopThenDraw() {
    await showRoundCutin('FLOP OPEN');
    await revealBoard(3);
    if (state.phase !== 'showdown') {
        await enterDrawPhase(1);
    }
    render();
}

async function openTurnThenDraw() {
    await showRoundCutin('TURN OPEN');
    await revealBoard(1);
    if (state.phase !== 'showdown') {
        await enterDrawPhase(2);
    }
    render();
}

function chooseCpuDiscardIndex(handCards) {
    const hand = Array.isArray(handCards) ? handCards : [];
    if (hand.length <= 1) return 0;
    let weakestIndex = 0;
    for (let i = 1; i < hand.length; i += 1) {
        if (compareCardPower(hand[i], hand[weakestIndex]) < 0) {
            weakestIndex = i;
        }
    }
    return weakestIndex;
}

function chooseCpuJudgmentOption(options) {
    const list = Array.isArray(options) ? options.filter((opt) => opt?.card) : [];
    if (!list.length) return null;
    return list.slice().sort((a, b) => compareCardPower(b.card, a.card))[0] || null;
}

async function cpuDiscardOneCard(reasonLabel = '') {
    const cpu = state.players.cpu;
    if (!cpu.hand.length) return null;
    const discardIndex = Math.max(0, Math.min(cpu.hand.length - 1, chooseCpuDiscardIndex(cpu.hand)));
    const cpuHandCardEls = ui.cpuHand ? Array.from(ui.cpuHand.querySelectorAll('.tarot-card')) : [];
    const fromHandEl = cpuHandCardEls[discardIndex] || ui.cpuHand;
    const [discarded] = cpu.hand.splice(discardIndex, 1);
    if (!discarded) return null;
    if (fromHandEl?.classList) {
        fromHandEl.classList.add('is-leaving');
        await wait(80);
    }
    await animateCardFlight(discarded, fromHandEl, ui.cpuGrave, 260, 0.88, { hidden: true });
    addToGrave('cpu', discarded);
    const suffix = reasonLabel ? `（${reasonLabel}）` : '';
    pushLog(`CPUは ${getCardDisplayName(discarded)} を墓地に送った${suffix}`);
    applyDiscardSpecial(discarded, 'cpu');
    render();
    await wait(220);
    return discarded;
}

async function processCpuExchange(nextPhase = 'turn-ready') {
    const cpu = state.players.cpu;
    if (!cpu.canExchange) {
        pushLog('CPUは交換不能。');
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
    const forcedDraw = drawFor('cpu');
    if (forcedDraw) {
        await animateCardFlight(forcedDraw, ui.deckAnchor, ui.cpuHand, 260, 1, { hidden: true });
        pushLog(`CPUが強制ドロー: ${getCardDisplayName(forcedDraw)}`);
        render();
        await wait(180);
    } else {
        pushLog('CPUの強制ドロー失敗（山札切れ）。');
    }

    const discarded = await cpuDiscardOneCard('通常破棄');
    let needExtraDiscard = false;
    if (discarded && !state.forceShowdown) {
        const judgmentCtx = getJudgmentContextForExchange('cpu', discarded);
        const options = Array.isArray(judgmentCtx?.options) ? judgmentCtx.options : [];
        if (judgmentCtx && options.length > 0) {
            const picked = chooseCpuJudgmentOption(options);
            if (picked?.ownerKey && picked?.cardId) {
                const gained = takeGraveCardById(picked.ownerKey, picked.cardId);
                if (gained) {
                    const fromGrave = picked.ownerKey === 'player' ? ui.playerGrave : ui.cpuGrave;
                    await animateCardFlight(gained, fromGrave, ui.cpuHand, 280, 1, { hidden: true });
                    cpu.hand.push(gained);
                    pushLog(`CPUは審判効果で ${getCardDisplayName(gained)} を回収。追加で1枚捨てる。`);
                    showEffectOverlay(
                        judgmentCtx.mode === 'karma'
                            ? 'JUDGMENT - KARMA INTERCHANGE'
                            : 'JUDGMENT - RESURRECTION'
                    );
                    render();
                    await wait(220);
                    needExtraDiscard = true;
                }
            }
        }
    }
    if (needExtraDiscard && !state.forceShowdown) {
        await cpuDiscardOneCard('追加破棄');
    }
    state.cpuThinking = false;
    if (state.forceShowdown) {
        await forceShowdown();
        return;
    }
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
    const previousOrder = getActivePlayerOrder();
    const previousDealerIndex = Number.isFinite(Number(state?.dealerIndex))
        ? Math.floor(Number(state.dealerIndex))
        : -1;
    const keepPlayerTp = Number.isFinite(Number(state?.players?.player?.testPoints))
        ? Math.max(0, Math.floor(Number(state.players.player.testPoints)))
        : TEST_POINT_START;
    const keepCpuTp = Number.isFinite(Number(state?.players?.cpu?.testPoints))
        ? Math.max(0, Math.floor(Number(state.players.cpu.testPoints)))
        : TEST_POINT_START;
    resetState();
    const activeOrder = getActivePlayerOrder();
    const rotationSize = activeOrder.length > 0 ? activeOrder.length : previousOrder.length;
    if (rotationSize > 0) {
        const previousNormalized = ((previousDealerIndex % rotationSize) + rotationSize) % rotationSize;
        state.dealerIndex = (previousNormalized + 1) % rotationSize;
    } else {
        state.dealerIndex = 0;
    }
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
    startBettingRound('preflop', 'preflop');
    pushLog('プレフロップ: 手札2枚を配布。');
    render();
}

async function handleNext() {
    if (!state) return;
    if (state.phase === 'preflop') {
        await openFlopThenDraw();
        return;
    }

    if (state.phase === 'draw-player') {
        pushLog(`DRAW PHASE ${state.drawRound}: 手札を選んで捨ててください。`);
        return;
    }

    if (state.phase === 'draw-player-judgment') {
        pushLog('審判発動中: 墓地カードを選択してください。');
        return;
    }

    if (state.phase === 'turn-ready') {
        await openTurnThenDraw();
        return;
    }

    if (state.phase === 'river-ready') {
        await openRiverThenFinalBetting();
        return;
    }
}

async function handlePrimaryButtonClick() {
    if (!state) return;
    if (state.phase === 'idle' || state.phase === 'showdown') {
        await startNewGame();
        return;
    }
    await handleNext();
}

async function onPlayerCardClick(index) {
    if (!state || state.phase !== 'draw-player') return;
    const player = state.players.player;
    if (!player.canExchange) return;
    if (index < 0 || index >= player.hand.length) return;
    if (state.isResolvingPlayerDiscard) return;
    if (state.selectedDiscardIndex !== index) {
        state.selectedDiscardIndex = index;
        render();
        return;
    }
    state.isResolvingPlayerDiscard = true;
    state.selectedDiscardIndex = null;
    render();

    const playerCardEls = ui.playerHand ? Array.from(ui.playerHand.querySelectorAll('.tarot-card')) : [];
    const sourceEl = playerCardEls[index] || ui.playerHand;
    const [discarded] = player.hand.splice(index, 1);

    try {
        if (sourceEl?.classList) {
            sourceEl.classList.add('is-leaving');
            await wait(80);
        }
        await animateCardFlight(discarded, sourceEl || ui.playerHand, ui.playerGrave, 260, 0.88);
        addToGrave('player', discarded);
        pushLog('あなたは ' + getCardDisplayName(discarded) + ' を墓地へ');
        applyDiscardSpecial(discarded, 'player');
        if (state.forceShowdown) {
            state.awaitingPostJudgmentDiscard = false;
            await finishPlayerExchange(getPostDrawNextPhase());
            return;
        }

        const canTriggerJudgment = !state.awaitingPostJudgmentDiscard;
        const judgmentCtx = canTriggerJudgment ? getJudgmentContextForExchange('player', discarded) : null;
        if (judgmentCtx && Array.isArray(judgmentCtx.options) && judgmentCtx.options.length > 0) {
            state.phase = 'draw-player-judgment';
            state.pendingJudgment = {
                mode: judgmentCtx.mode,
                options: judgmentCtx.options
            };
            state.awaitingPostJudgmentDiscard = true;
            state.selectedJudgmentPick = null;
            render();
            return;
        }
        state.awaitingPostJudgmentDiscard = false;
        await finishPlayerExchange(getPostDrawNextPhase());
    } finally {
        state.isResolvingPlayerDiscard = false;
    }
}

async function onJudgmentGraveCardClick(ownerKey, cardId = null) {
    if (!state || state.phase !== 'draw-player-judgment' || !cardId) return;
    const pending = state.pendingJudgment;
    if (!pending || !Array.isArray(pending.options)) return;
    const allowed = pending.options.some((opt) => opt?.ownerKey === ownerKey && opt?.cardId === cardId);
    if (!allowed) return;

    const selected = state.selectedJudgmentPick;
    const isSame = !!selected && selected.ownerKey === ownerKey && selected.cardId === cardId;
    if (!isSame) {
        state.selectedJudgmentPick = { ownerKey, cardId };
        render();
        return;
    }
    await onJudgmentPick(ownerKey, cardId);
}

async function onJudgmentPick(ownerKey, cardId = null) {
    if (!state || state.phase !== 'draw-player-judgment') return;
    const pending = state.pendingJudgment;
    const hasPending = !!pending && Array.isArray(pending.options);
    let selectedOption = null;
    if (ownerKey !== 'deck' && hasPending) {
        selectedOption = pending.options.find((opt) => {
            if (!opt) return false;
            if (opt.ownerKey !== ownerKey) return false;
            if (cardId) return opt.cardId === cardId;
            return true;
        }) || null;
    }

    const isSkip = ownerKey === 'deck';
    const gained = selectedOption ? takeGraveCardById(selectedOption.ownerKey, selectedOption.cardId) : null;
    if (gained && selectedOption) {
        const fromGrave = selectedOption.ownerKey === 'player' ? ui.playerGrave : ui.cpuGrave;
        await animateCardFlight(gained, fromGrave, ui.playerHand, 280, 1);
        state.players.player.hand.push(gained);
        showEffectOverlay(
            pending?.mode === 'karma'
                ? 'JUDGMENT - KARMA INTERCHANGE'
                : 'JUDGMENT - RESURRECTION'
        );
        pushLog('審判効果でカード回収。追加で1枚捨ててください。');
    } else {
        pushLog(isSkip
            ? '審判効果をスキップしました。'
            : '審判で回収できるカードがなかったため、そのまま終了。');
        state.awaitingPostJudgmentDiscard = false;
        state.pendingJudgment = null;
        state.selectedJudgmentPick = null;
        state.selectedDiscardIndex = null;
        state.phase = 'draw-player';
        await finishPlayerExchange(getPostDrawNextPhase());
        return;
    }
    state.pendingJudgment = null;
    state.selectedJudgmentPick = null;
    state.selectedDiscardIndex = null;
    state.phase = 'draw-player';
    render();
}
function getPhaseText() {
    if (!state) return '';
    if (state.phase === 'idle') return '「新しい勝負を始める」を押してください。';
    if (state.phase === 'dealing') return '配札中...';
    if (state.phase === 'betting-preflop') return 'プリフロップBET: アクションを選択してください。';
    if (state.phase === 'betting-mid') return '中盤BET: ターン公開前の駆け引き。';
    if (state.phase === 'betting-final') return '最終BET: ショーダウン前の勝負。';
    if (state.phase === 'preflop') return '下のボタンでフロップを開示。';
    if (state.phase === 'draw-player') {
        return state.awaitingPostJudgmentDiscard
            ? `第${state.drawRound}ドローフェーズ: 審判回収後。手札を1枚選んで捨てる。`
            : `第${state.drawRound}ドローフェーズ: 強制ドロー済み。手札を1枚選んで捨てる。`;
    }
    if (state.phase === 'draw-player-judgment') return '審判発動: 墓地カードを選択して回収。';
    if (state.phase === 'cpu-thinking') return 'CPUが行動を決定中...';
    if (state.phase === 'turn-ready') return '下のボタンでターンを開示。';
    if (state.phase === 'river-ready') return 'リバーを自動で展開します...';
    if (state.phase === 'river-opening') return 'リバー展開中...';
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
    container.classList.toggle('is-draw-phase', !!options.drawPhase);
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
        if (typeof options.isSelectedIndex === 'function' && options.isSelectedIndex(index, card)) {
            el.classList.add('is-selected');
        }
        container.appendChild(el);
    });
}

function renderGraveRow(container, cards, options = {}) {
    if (!container) return;
    container.innerHTML = '';
    const reversed = cards.slice().reverse();
    const list = options.showAll ? reversed : reversed.slice(0, 3);
    list.forEach((card) => {
        const canClick = !!options.clickable
            && typeof options.onCardClick === 'function'
            && (typeof options.isCardEnabled !== 'function' || options.isCardEnabled(card));
        const item = createCardElement(card, {
            hidden: false,
            clickable: canClick,
            onClick: () => options.onCardClick(card, item)
        });
        item.classList.add('tarot-grave-card');
        if (typeof options.isSelectedCard === 'function' && options.isSelectedCard(card)) {
            item.classList.add('is-selected');
        }
        container.appendChild(item);
    });
}

function shouldShowKickerForShowdown(leftScore, rightScore) {
    if (!leftScore || !rightScore) return false;
    if (leftScore.rank !== rightScore.rank) return false;
    if (![3, 4, 5].includes(leftScore.rank)) return false;

    if (leftScore.rank === 3) {
        // ワンペア同値時はキッカー比較になるため表示対象
        return (leftScore.rankVector?.[0] || 0) === (rightScore.rankVector?.[0] || 0);
    }
    if (leftScore.rank === 5) {
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
        return appendExtraKickers(
            appendKicker(
                takeByCount(2, 1).slice(0, 2),
                Math.max(1, (Array.isArray(score.rankVector) ? score.rankVector.length : 1) - 1)
            )
        );
    case 4: // two pair
        return appendExtraKickers(appendKicker(takeByCount(2, 2).slice(0, 4), 1));
    case 5: // three card
        return appendExtraKickers(
            appendKicker(
                takeByCount(3, 1).slice(0, 3),
                Math.max(1, (Array.isArray(score.rankVector) ? score.rankVector.length : 1) - 1)
            )
        );
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
    if (state.phase !== 'showdown' || !state.result || !state.showdownRevealDone) {
        setOutcomeBadge(ui.playerOutcome, null, '');
        setOutcomeBadge(ui.cpuOutcome, null, '');
        return;
    }
    const winner = state.result.winner;
    if (winner === 'player') {
        setOutcomeBadge(ui.playerOutcome, 'is-win', '勝利');
        setOutcomeBadge(ui.cpuOutcome, 'is-lose', '敗北');
        return;
    }
    if (winner === 'cpu') {
        setOutcomeBadge(ui.playerOutcome, 'is-lose', '敗北');
        setOutcomeBadge(ui.cpuOutcome, 'is-win', '勝利');
        return;
    }
    setOutcomeBadge(ui.playerOutcome, 'is-draw', '引き分け');
    setOutcomeBadge(ui.cpuOutcome, 'is-draw', '引き分け');
}

function getLiveBestRoleLabel(ownerKey) {
    if (!state?.players?.[ownerKey]) return '';
    const hand = state.players[ownerKey].hand || [];
    const board = state.board || [];
    const handForRole = chooseBestTwoHandCardsForLiveRole(hand, board);
    const cards = [
        ...handForRole,
        ...board
    ];
    if (cards.length < 5) return '成立役: なし';
    const best = chooseBestFiveFromSeven(cards);
    if (!best?.rankLabel) return '成立役: なし';
    return `成立役: ${best.rankLabel}`;
}

function renderRoleLabels() {
    if (!ui.playerRole || !ui.cpuRole) return;
    if (state.phase !== 'showdown' || !state.result) {
        ui.playerRole.textContent = getLiveBestRoleLabel('player');
        ui.cpuRole.textContent = '成立役: 非公開';
        return;
    }
    if (!state.showdownRevealDone) {
        ui.playerRole.textContent = '成立役: 判定中...';
        ui.cpuRole.textContent = '成立役: 判定中...';
        return;
    }
    const winner = state.result.winner;
    const playerPrefix = winner === 'player' ? '勝利' : winner === 'cpu' ? '敗北' : '引き分け';
    const cpuPrefix = winner === 'cpu' ? '勝利' : winner === 'player' ? '敗北' : '引き分け';
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
    await wait(120);
    await showShowdownResultCutin();
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

    const titleEl = ui.judgmentPanel.querySelector('.tarot-judgment-title');
    if (titleEl) {
        titleEl.textContent = pending.mode === 'karma'
            ? '審判効果: 他プレイヤー墓地のカードを取得'
            : '審判効果: 墓地のカードを蘇生';
    }

    ui.judgmentPanel.style.display = 'block';
    ui.judgmentOptions.innerHTML = '';
    const hint = document.createElement('div');
    hint.className = 'tarot-judgment-hint';
    hint.textContent = '墓地カードを1回クリックで選択、再クリックで回収。回収しない場合はスキップ。';
    ui.judgmentOptions.appendChild(hint);
    const skipButton = document.createElement('button');
    skipButton.type = 'button';
    skipButton.textContent = '回収をスキップ';
    skipButton.addEventListener('click', () => {
        onJudgmentPick('deck');
    });
    ui.judgmentOptions.appendChild(skipButton);
}
function renderButtons() {
    if (!ui.startButton) return;
    const btn = ui.startButton;
    if (!state) {
        btn.disabled = true;
        btn.textContent = '読み込み中...';
        return;
    }
    if (state.phase === 'idle' || state.phase === 'showdown') {
        btn.disabled = false;
        btn.textContent = '新しい勝負を始める';
        return;
    }
    if (state.phase === 'dealing') {
        btn.disabled = true;
        btn.textContent = '配札中...';
        return;
    }
    if (isBettingPhase()) {
        btn.disabled = true;
        btn.textContent = 'BET進行中';
        return;
    }
    if (state.phase === 'preflop') {
        btn.disabled = false;
        btn.textContent = 'フロップを開く';
        return;
    }
    if (state.phase === 'draw-player') {
        const isBusy = !!state.isResolvingPlayerDiscard;
        btn.disabled = true;
        btn.textContent = isBusy
            ? 'ドロー処理中...'
            : ('第' + state.drawRound + 'ドロー: 手札を選択');
        return;
    }
    if (state.phase === 'draw-player-judgment') {
        btn.disabled = true;
        btn.textContent = '墓地カードを選択';
        return;
    }
    if (state.phase === 'cpu-thinking') {
        btn.disabled = true;
        btn.textContent = 'CPU思考中...';
        return;
    }
    if (state.phase === 'river-opening') {
        btn.disabled = true;
        btn.textContent = 'リバー公開中...';
        return;
    }
    if (state.phase === 'turn-ready') {
        btn.disabled = false;
        btn.textContent = 'ターンを開く';
        return;
    }
    if (state.phase === 'river-ready') {
        btn.disabled = false;
        btn.textContent = 'リバーを開く';
        return;
    }
    btn.disabled = true;
    btn.textContent = '進行待ち...';
}

function renderLog() {
    if (!ui.log || !state) return;
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

function renderDrawGuide() {
    if (!ui.drawGuide || !state) return;
    if (state.phase !== 'draw-player' && state.phase !== 'draw-player-judgment' && state.phase !== 'cpu-thinking') {
        ui.drawGuide.style.display = 'none';
        ui.drawGuide.textContent = '';
        return;
    }
    if (state.phase === 'draw-player') {
        ui.drawGuide.textContent = state.awaitingPostJudgmentDiscard
            ? ('第' + state.drawRound + 'ドロー: 審判で回収済み。手札を1回クリックで選択、再クリックで捨てる')
            : ('第' + state.drawRound + 'ドロー: 強制ドロー済み。手札を1回クリックで選択、再クリックで捨てる');
    } else if (state.phase === 'draw-player-judgment') {
        ui.drawGuide.textContent = '審判発動中: 墓地カードを1回クリックで選択、再クリックで回収（スキップ可）';
    } else {
        ui.drawGuide.textContent = 'CPUがドロー処理中...';
    }
    ui.drawGuide.style.display = 'block';
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
        drawPhase: !isShowdown && !isDealing && state.phase === 'draw-player',
        isSelectedIndex: (index) => !isShowdown && !isDealing && state.phase === 'draw-player' && state.selectedDiscardIndex === index,
        onCardClick: onPlayerCardClick
    });
    renderCardRow(ui.cpuHand, cpuCardsForView, {
        hidden: isShowdown ? showdownHidden : true,
        clickable: false
    });
    const isJudgmentPickPhase = !isShowdown
        && !isDealing
        && state.phase === 'draw-player-judgment'
        && !!state.pendingJudgment
        && Array.isArray(state.pendingJudgment.options);
    const judgmentOptionsByOwner = {
        player: new Set(),
        cpu: new Set()
    };
    if (isJudgmentPickPhase) {
        state.pendingJudgment.options.forEach((opt) => {
            if (!opt?.ownerKey || !opt?.cardId) return;
            if (!judgmentOptionsByOwner[opt.ownerKey]) return;
            judgmentOptionsByOwner[opt.ownerKey].add(opt.cardId);
        });
    }
    renderGraveRow(ui.playerGrave, isShowdown ? [] : state.players.player.graveyard, {
        showAll: isJudgmentPickPhase,
        clickable: isJudgmentPickPhase,
        isCardEnabled: (card) => judgmentOptionsByOwner.player.has(card.id),
        isSelectedCard: (card) => state.selectedJudgmentPick?.ownerKey === 'player' && state.selectedJudgmentPick?.cardId === card.id,
        onCardClick: (card) => onJudgmentGraveCardClick('player', card?.id)
    });
    renderGraveRow(ui.cpuGrave, isShowdown ? [] : state.players.cpu.graveyard, {
        showAll: isJudgmentPickPhase,
        clickable: isJudgmentPickPhase,
        isCardEnabled: (card) => judgmentOptionsByOwner.cpu.has(card.id),
        isSelectedCard: (card) => state.selectedJudgmentPick?.ownerKey === 'cpu' && state.selectedJudgmentPick?.cardId === card.id,
        onCardClick: (card) => onJudgmentGraveCardClick('cpu', card?.id)
    });
    renderJudgmentPanel();
    renderButtons();
    renderBettingInfo();
    renderDrawGuide();
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
    ui.pokerRoot = ui.root?.querySelector('.tarot-poker-root') || null;
    ui.startButton = document.getElementById('tarotStartButton');
    ui.stateText = document.getElementById('tarotStateText');
    ui.drawGuide = document.getElementById('tarotDrawGuide');
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
    ui.startButton?.addEventListener('click', handlePrimaryButtonClick);
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
