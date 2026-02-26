import { HandEvaluator as TarotEngineHandEvaluator } from './tarot-engine/HandEvaluator.js';
import { GameController as TarotGameController } from './tarot-engine/GameController.js';

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
    0: ['All'],
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
    8.5: 'ザ・ワールド',
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
const FATE_EFFECT_SUMMARY = {
    0: '\u611a\u8005: \u30ef\u30a4\u30eb\u30c9\u30ab\u30fc\u30c9\u3068\u3057\u3066\u6271\u3046\u3002',
    1: '\u9b54\u8853\u5e2b: \u30aa\u30fc\u30eb\u30b9\u30fc\u30c8\u3068\u3057\u3066\u5224\u5b9a\u3055\u308c\u308b\u3002',
    2: '\u5973\u6559\u7687: \u624b\u672d1\u679a\u306e\u516c\u958b\u6a29\u304c\u767a\u751f\u3059\u308b\u3002',
    3: '\u5973\u5e1d: \u6570\u5024\u306f3/13\u306e\u6709\u5229\u5074\u3067\u5224\u5b9a\u3002',
    4: '\u7687\u5e1d: \u6570\u5024\u306f4/14\u306e\u6709\u5229\u5074\u3067\u5224\u5b9a\u3002',
    5: '\u6cd5\u738b: \u521d\u671f\u914d\u672d\u304c3\u679a\u306b\u306a\u308b\u3002',
    6: '\u604b\u4eba: \u6700\u591a\u91cd\u8907\u6570\u5024\u3092+1\u679a\u6271\u3044\u3057\u3001\u30da\u30a2\u7cfb\u5f79\u30921\u6bb5\u968e\u5f37\u5316\u3002',
    7: '\u6226\u8eca: \u6570\u50247\u306e2\u679a\u5206\u3068\u3057\u3066\u6271\u3046\u3002',
    8: '\u529b: \u540c\u5f79\u6642\u306f\u624b\u672d\u5408\u8a08\u3067\u6c7a\u7740\u3002',
    9: '\u96a0\u8005: \u30ea\u30d0\u30fc\u4e88\u5b9a\u30ab\u30fc\u30c9\u3092\u5148\u884c\u78ba\u8a8d\u3002',
    10: '\u904b\u547d\u306e\u8f2a: \u30bf\u30fc\u30f3\u3067\u52b9\u679c\u304c\u5225\u30a2\u30eb\u30ab\u30ca\u3078\u5909\u7570\u3002',
    11: '\u6b63\u7fa9: \u5f79\u306e\u5f37\u5f31\u304c\u9006\u8ee2\u3059\u308b\u3002',
    12: '\u540a\u308b\u3055\u308c\u305f\u7537: \u6700\u9ad8\u6570\u5024\u624b\u672d\u3092\u5f37\u5236\u4ea4\u63db\u3002',
    13: '\u6b7b\u795e: \u30b3\u30fc\u30c8\u30ab\u30fc\u30c9\u30921-4\u3078\u5909\u63db\u3002',
    14: '\u7bc0\u5236: \u5947\u6570\u3092+1\u3057\u3066\u5076\u6570\u5316\u3059\u308b\u3002',
    15: '\u60aa\u9b54: \u30d9\u30c3\u30c8/\u30b3\u30fc\u30eb\u5f8c\u306e\u30d5\u30a9\u30fc\u30eb\u30c9\u4e0d\u53ef\u3002',
    16: '\u5854: \u5834\u306e\u6700\u9ad8\u6570\u5024\u30ab\u30fc\u30c9\u3092\u7121\u52b9\u5316\u3002',
    17: '\u661f: \u30ea\u30d0\u30fc\u5f8c\u306b\u8ffd\u52a01\u679a+\u8ffd\u52a0\u30d9\u30c3\u30c8\u3002',
    18: '\u6708: \u30ea\u30d0\u30fc\u3092\u4f0f\u305b\u305f\u307e\u307e\u9032\u884c\u3059\u308b\u3002',
    19: '\u592a\u967d: 1\u679a\u30c9\u30ed\u30fc\u5f8c\u306b1\u679a\u6368\u3066\u308b\u3002',
    20: '\u5be9\u5224: \u6368\u3066\u3066\u5f15\u304f+\u5893\u5730\u4ea4\u63db\u6a29\u3002',
    21: '\u4e16\u754c: \u5168\u30b9\u30fc\u30c8\u7d71\u4e00\u3067\u30d5\u30e9\u30c3\u30b7\u30e5\u4ee5\u4e0a\u78ba\u5b9a\u3002'
};
const TEST_POINT_START = 300;
const TEST_BET_UNIT = 10;
const BLIND_BONUS_TP = 10;
const SMALL_BLIND_TP = Math.max(1, Math.floor(BLIND_BONUS_TP / 2));
const PLAYER_ORDER = ['player', 'cpu', 'npc2', 'npc3'];
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
    bet: 'ベット',
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

const TAROT_ENGINE_ENABLED = true;
const TAROT_ENGINE_RANK_TO_LEGACY = {
    HighCard: 2,
    OnePair: 3,
    TwoPair: 4,
    ThreeKind: 5,
    CourtOnePair: 5.5,
    Straight: 6,
    Flush: 7,
    CourtTwoPair: 7.5,
    FullHouse: 8,
    TheWorld: 8.5,
    FourKind: 9,
    StraightFlush: 10,
    FiveKind: 11
};

let tarotEngineEvaluator = null;
try {
    tarotEngineEvaluator = new TarotEngineHandEvaluator();
} catch (error) {
    console.warn('[tarot-engine] HandEvaluator init failed:', error);
}
let tarotGameController = null;
let tarotControllerLogCursor = 0;

let isBound = false;
let state = null;

const ui = {
    root: null,
    pokerRoot: null,
    startButton: null,
    stateText: null,
    participantList: null,
    drawGuide: null,
    deckAnchor: null,
    fateCard: null,
    fateEffectText: null,
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
    npc2PointText: null,
    npc3PointText: null,
    betActionHint: null,
    betCheckButton: null,
    betCallButton: null,
    betBetButton: null,
    betRaiseButton: null,
    betFoldButton: null,
    playerOutcome: null,
    cpuOutcome: null,
    npc2Outcome: null,
    npc3Outcome: null,
    playerRole: null,
    cpuRole: null,
    npc2Role: null,
    npc3Role: null,
    playerAction: null,
    cpuAction: null,
    npc2Action: null,
    npc3Action: null,
    npcColumnTitle: null,
    npcGraveTitle: null,
    npc2ColumnTitle: null,
    npc3ColumnTitle: null,
    npc2GraveTitle: null,
    npc3GraveTitle: null,
    npc2Hand: null,
    npc3Hand: null,
    npc2Grave: null,
    npc3Grave: null
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

function getNpcKeys() {
    return PLAYER_ORDER.filter((key) => key !== 'player');
}

function getDisplayNpcKey() {
    const actingNpcKey = state?.betting?.pendingResponseFor;
    if (actingNpcKey && actingNpcKey !== 'player' && state.players?.[actingNpcKey]) {
        return actingNpcKey;
    }
    if (state?.displayNpcKey && state.players?.[state.displayNpcKey]) {
        return state.displayNpcKey;
    }
    const npcKeys = getNpcKeys();
    return npcKeys.find((key) => !!state?.players?.[key]) || 'cpu';
}

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

    const resolveRect = (el) => {
        if (!el || typeof el.getBoundingClientRect !== 'function') return null;
        if (el.classList?.contains('tarot-card')) return el.getBoundingClientRect();
        const childCards = el.querySelectorAll ? Array.from(el.querySelectorAll('.tarot-card')) : [];
        if (childCards.length > 0) {
            return childCards[childCards.length - 1].getBoundingClientRect();
        }
        return el.getBoundingClientRect();
    };

    const fromRect = resolveRect(fromTarget);
    const toRect = resolveRect(toTarget);
    if (!fromRect || !toRect || !fromRect.width || !fromRect.height) return;
    const startW = Math.max(42, Math.floor(fromRect.width));
    const startH = Math.max(68, Math.floor(fromRect.height));
    const fromCenter = getRectCenter(fromRect);
    const toCenter = getRectCenter(toRect);

    const hiddenGhost = Boolean(options.hidden);
    const canCloneSource = typeof HTMLElement !== 'undefined'
        && fromTarget instanceof HTMLElement
        && fromTarget.classList.contains('tarot-card');
    const ghost = canCloneSource
        ? fromTarget.cloneNode(true)
        : createCardElement(card, { hidden: hiddenGhost, clickable: false });
    ghost.classList.add('tarot-card-fly');
    ghost.classList.remove('is-selected', 'is-leaving');
    if (hiddenGhost) {
        ghost.classList.add('is-hidden');
        const artEl = ghost.querySelector('.tarot-card-art');
        if (artEl) {
            setArtSpriteByIndex(artEl, TAROT_BACK_SPRITE_INDEX);
        }
        const titleEl = ghost.querySelector('.tarot-card-title');
        const numberEl = ghost.querySelector('.tarot-card-number');
        if (titleEl) titleEl.remove();
        if (numberEl) numberEl.remove();
    }
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
    const arcLift = Math.max(18, Math.min(44, Math.abs(dx) * 0.08 + 18));
    const rotateDeg = Math.max(-8, Math.min(8, dx / 18));
    const step1 = Math.max(120, Math.floor(durationMs * 0.42));
    const step2 = Math.max(120, durationMs - step1);
    const midX = dx * 0.58;
    const midY = dy * 0.58 - arcLift;

    await new Promise((resolve) => {
        requestAnimationFrame(() => {
            ghost.style.transition = `transform ${step1}ms cubic-bezier(0.24, 0.9, 0.3, 1), opacity ${step1}ms ease-out`;
            ghost.style.transform = `translate(${midX}px, ${midY}px) scale(${Math.min(1.05, scaleTo + 0.08)}) rotate(${rotateDeg}deg)`;
            ghost.style.opacity = '0.96';
            setTimeout(() => {
                ghost.style.transition = `transform ${step2}ms cubic-bezier(0.18, 0.82, 0.32, 1), opacity ${step2}ms ease-in`;
                ghost.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleTo}) rotate(0deg)`;
                ghost.style.opacity = '0.86';
                setTimeout(resolve, step2 + 20);
            }, step1);
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
        let suit = 'None';
        if (number === 1) suit = 'All';
        else if (number === 16) suit = 'Sword';
        else if (number === 17) suit = 'Cup';
        else if (number === 18) suit = 'Pentacle';
        else if (number === 19) suit = 'Wand';
        deck.push({
            id: `arcana-${number}`,
            number,
            suit,
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
        selectedSwapHandIndex: null,
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
                revealHandIndex: null,
                canExchange: true,
                hasResurrectionRight: false,
                bettingEnabled: false,
                testPoints: TEST_POINT_START
            },
            cpu: {
                id: 'cpu',
                name: 'NPC1',
                hand: [],
                graveyard: [],
                revealHandIndex: null,
                canExchange: true,
                hasResurrectionRight: false,
                bettingEnabled: false,
                testPoints: TEST_POINT_START
            },
            npc2: {
                id: 'npc2',
                name: 'NPC2',
                hand: [],
                graveyard: [],
                revealHandIndex: null,
                canExchange: true,
                hasResurrectionRight: false,
                bettingEnabled: false,
                testPoints: TEST_POINT_START
            },
            npc3: {
                id: 'npc3',
                name: 'NPC3',
                hand: [],
                graveyard: [],
                revealHandIndex: null,
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
        pendingPayoutFx: null,
        pendingJudgment: null,
        pendingJudgmentAutoSwapMap: null,
        fateCard: null,
        activeFateCard: null,
        fateRevealed: false,
        displayNpcKey: 'cpu',
        boardHiddenRiver: null,
        previewRiverCard: null,
        pendingBoardFlipIndices: [],
        pendingFateDiscardMode: null,
        pendingFateDiscardPlayers: [],
        positionContext: null,
        tablePositionLabels: {},
        controllerPhase: '',
        cpuThinking: false,
        initialDealAnimating: false,
        initialDealRevealedCount: 0,
        initialDealDealtCounts: {},
        showdownRevealDone: false,
        showdownRevealRunning: false,
        log: [],
        result: null
    };
}

function controllerPhaseToRoundKey(phase) {
    if (phase === 'preflop-bet') return 'preflop';
    if (phase === 'flop-bet') return 'flop';
    if (phase === 'turn-bet') return 'turn';
    if (phase === 'river-bet') return 'river';
    if (phase === 'river-bet-2') return 'river2';
    return null;
}

function getRoundKeyLabel(roundKey) {
    if (roundKey === 'preflop') return 'プリフロップ';
    if (roundKey === 'flop') return 'フロップ';
    if (roundKey === 'turn') return 'ターン';
    if (roundKey === 'river') return 'リバー';
    if (roundKey === 'river2') return '追加リバー';
    if (roundKey === 'mid') return '中盤';
    if (roundKey === 'final') return '最終';
    return String(roundKey || '');
}

function syncStateFromController(controllerState) {
    if (!state || !controllerState) return;
    const controllerPlayers = controllerState.players || {};
    Object.keys(state.players || {}).forEach((ownerKey) => {
        const src = controllerPlayers?.[ownerKey] || {};
        state.players[ownerKey].hand = Array.isArray(src.hand) ? src.hand.slice() : [];
        state.players[ownerKey].graveyard = Array.isArray(src.discard) ? src.discard.slice() : [];
        state.players[ownerKey].revealHandIndex = Number.isFinite(src.revealHandIndex)
            ? Math.floor(src.revealHandIndex)
            : null;
    });

    state.board = Array.isArray(controllerState.boardVisible) ? controllerState.boardVisible.slice() : [];
    state.deck = Array.isArray(controllerState.deck) ? controllerState.deck.slice() : [];
    state.fateCard = controllerState.fateCard ? { ...controllerState.fateCard } : null;
    state.activeFateCard = controllerState.activeFateCard ? { ...controllerState.activeFateCard } : null;
    state.boardHiddenRiver = controllerState.boardHiddenRiver ? { ...controllerState.boardHiddenRiver } : null;
    state.previewRiverCard = controllerState.previewRiverCard ? { ...controllerState.previewRiverCard } : null;
    state.pendingFateDiscardMode = controllerState.pendingFateDiscardMode || null;
    state.pendingFateDiscardPlayers = Array.isArray(controllerState.pendingFateDiscardPlayers)
        ? controllerState.pendingFateDiscardPlayers.slice()
        : [];
    state.controllerPhase = String(controllerState.phase || '');
    if (!Array.isArray(state.pendingBoardFlipIndices)) {
        state.pendingBoardFlipIndices = [];
    }

    state.graveyard = [];
    Object.keys(state.players || {}).forEach((ownerKey) => {
        (state.players?.[ownerKey]?.graveyard || []).forEach((card) => {
            state.graveyard.push({ ownerKey, card });
        });
    });

    const logs = Array.isArray(controllerState.logs) ? controllerState.logs : [];
    for (let i = tarotControllerLogCursor; i < logs.length; i += 1) {
        pushLog(`[エンジン] ${logs[i]}`);
    }
    tarotControllerLogCursor = logs.length;
}

function queuePendingBoardFlips(fromIndex, toIndexInclusive) {
    if (!state) return;
    if (!Array.isArray(state.pendingBoardFlipIndices)) {
        state.pendingBoardFlipIndices = [];
    }
    const seen = new Set(state.pendingBoardFlipIndices);
    for (let i = fromIndex; i <= toIndexInclusive; i += 1) {
        if (i < 0) continue;
        seen.add(i);
    }
    state.pendingBoardFlipIndices = Array.from(seen).sort((a, b) => a - b);
}

async function runPendingBoardFlipAnimation() {
    if (!state || !ui?.board) return;
    const pending = (Array.isArray(state.pendingBoardFlipIndices) ? state.pendingBoardFlipIndices.slice() : [])
        .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < (state.board?.length || 0))
        .sort((a, b) => a - b);
    if (!pending.length) return;
    render();
    await wait(60);
    for (const idx of pending) {
        const boardCards = Array.from(ui.board.querySelectorAll('.tarot-card'));
        const targetEl = boardCards[idx];
        const card = state.board?.[idx];
        if (!targetEl || !card) continue;
        await animateBackToFrontOnElement(targetEl, card);
        await wait(80);
    }
    state.pendingBoardFlipIndices = [];
    render();
}

function getControllerPendingDiscardModeForPlayer() {
    if (!tarotGameController || !state) return null;
    const phaseFromController = String(state.controllerPhase || tarotGameController.getState()?.phase || '');
    if (phaseFromController !== 'fate-action') return null;
    const mode = state.pendingFateDiscardMode;
    if (mode !== 'sun' && mode !== 'judgment') return null;
    if (!Array.isArray(state.pendingFateDiscardPlayers) || !state.pendingFateDiscardPlayers.includes('player')) return null;
    return mode;
}

function isControllerPlayerDiscardPending() {
    return !!getControllerPendingDiscardModeForPlayer();
}

function isControllerJudgmentPlayerDiscardPending() {
    return getControllerPendingDiscardModeForPlayer() === 'judgment';
}

function getControllerBoardForShowdown(controllerState) {
    const board = Array.isArray(controllerState?.boardVisible)
        ? controllerState.boardVisible.slice()
        : [];
    if (controllerState?.boardHiddenRiver) {
        board.push(controllerState.boardHiddenRiver);
    }
    return board;
}

function findHighestNumberCardIndex(cards) {
    if (!Array.isArray(cards) || cards.length <= 0) return 0;
    let bestIdx = 0;
    let bestValue = Number(cards[0]?.number || 0);
    for (let i = 1; i < cards.length; i += 1) {
        const value = Number(cards[i]?.number || 0);
        if (value > bestValue) {
            bestValue = value;
            bestIdx = i;
        }
    }
    return bestIdx;
}

function chooseBestJudgmentSwapCardId(ownerKey, controllerState) {
    if (!tarotEngineEvaluator || !controllerState?.players?.[ownerKey]) return null;
    const owner = controllerState.players[ownerKey];
    if (owner?.folded) return null;
    const hand = Array.isArray(owner.hand) ? owner.hand.slice() : [];
    const grave = Array.isArray(owner.discard) ? owner.discard.slice() : [];
    if (!hand.length || !grave.length) return null;
    const fateCard = controllerState?.activeFateCard ? { ...controllerState.activeFateCard } : null;
    const board = getControllerBoardForShowdown(controllerState);
    const baseInput = {
        hand: hand.slice(),
        board: board.slice(),
        fateCard
    };
    let bestCardId = null;
    let bestCmp = 0;
    for (const graveCard of grave) {
        if (!graveCard?.id) continue;
        const nextHand = hand.slice();
        const handIdx = findHighestNumberCardIndex(nextHand);
        nextHand.splice(handIdx, 1, graveCard);
        const candidateInput = {
            hand: nextHand,
            board: board.slice(),
            fateCard
        };
        const cmpObj = tarotEngineEvaluator.compareInputs(candidateInput, baseInput);
        const cmp = Number(cmpObj?.cmp || 0);
        if (cmp > bestCmp) {
            bestCmp = cmp;
            bestCardId = graveCard.id;
        }
    }
    return bestCmp > 0 ? bestCardId : null;
}

function buildAutoJudgmentSwapMap(controllerState, playerCardId = null) {
    const map = {};
    const playerOrder = Array.isArray(controllerState?.playerOrder) && controllerState.playerOrder.length
        ? controllerState.playerOrder
        : Object.keys(controllerState?.players || {});
    playerOrder.forEach((ownerKey) => {
        const owner = controllerState?.players?.[ownerKey];
        if (!owner || owner.folded) return;
        if (ownerKey === 'player') {
            if (playerCardId) map.player = playerCardId;
            return;
        }
        const pickedId = chooseBestJudgmentSwapCardId(ownerKey, controllerState);
        if (pickedId) {
            map[ownerKey] = pickedId;
        }
    });
    return map;
}

function prepareJudgmentSwapSelection(controllerState) {
    if (!state || !controllerState?.canUseJudgmentSwap) return false;
    const player = controllerState?.players?.player;
    const playerDiscard = Array.isArray(player?.discard) ? player.discard : [];
    const playerHand = Array.isArray(player?.hand) ? player.hand : [];
    if (!playerHand.length || !playerDiscard.length) return false;
    state.pendingJudgmentAutoSwapMap = buildAutoJudgmentSwapMap(controllerState);
    state.pendingJudgment = {
        mode: 'showdown-swap',
        options: playerDiscard.map((card) => ({ ownerKey: 'player', cardId: card?.id, card })).filter((opt) => !!opt.cardId)
    };
    state.selectedSwapHandIndex = findHighestNumberCardIndex(playerHand);
    state.selectedJudgmentPick = null;
    state.phase = 'showdown-judgment-select';
    pushLog('審判効果: ショーダウン前に墓地カードを交換できます。');
    render();
    return true;
}

function mapControllerEvaluationToLegacy(ownerKey, evaluation, controllerState) {
    if (!evaluation) {
        return { rankLabel: '役なし', cards: [] };
    }
    const allCards = [
        ...((controllerState?.players?.[ownerKey]?.hand || []).slice()),
        ...((controllerState?.boardVisible || []).slice()),
        ...(controllerState?.activeFateCard ? [controllerState.activeFateCard] : [])
    ];
    const map = new Map();
    allCards.forEach((card) => {
        if (!card) return;
        map.set(String(card.id || ''), card);
    });

    const cards = (Array.isArray(evaluation.bestFive) ? evaluation.bestFive : [])
        .map((entry) => {
            const byId = map.get(String(entry?.id || ''));
            if (byId) return byId;
            if (entry?.zone === 'fate' && controllerState?.activeFateCard) {
                return controllerState.activeFateCard;
            }
            return null;
        })
        .filter(Boolean);
    const legacyRank = TAROT_ENGINE_RANK_TO_LEGACY[evaluation.rank] || 0;
    const rankVector = [
        ...(Array.isArray(evaluation.primaryVector) ? evaluation.primaryVector : []),
        ...(Array.isArray(evaluation.kickerVector) ? evaluation.kickerVector : [])
    ];

    return {
        rank: legacyRank,
        rankLabel: buildLegacyRankLabelFromEngine(evaluation, cards, legacyRank, rankVector),
        rankVector,
        maxNumber: Number(rankVector[0] || 0),
        hasArcana: cards.some((card) => !!card?.isArcana),
        maxArcana: cards.reduce((max, card) => Math.max(max, card?.isArcana ? Number(card.number || 0) : -1), -1),
        suitStrength: cards.reduce((max, card) => Math.max(max, getCardSuitStrength(card)), 0),
        cards,
        engine: evaluation
    };
}

async function runControllerFateActionLoop() {
    if (!tarotGameController) return;
    let guard = 0;
    while (guard < 4) {
        guard += 1;
        const controllerState = tarotGameController.getState();
        if (controllerState.phase !== 'fate-action') return;
        const beforeBoardCount = Array.isArray(controllerState.boardVisible) ? controllerState.boardVisible.length : 0;

        const fateNo = getFateRuleNumber(controllerState.activeFateCard);
        const input = {};
        if (fateNo === 2) {
            input.revealByPlayer = {};
            const playerIds = Array.isArray(controllerState.playerOrder) && controllerState.playerOrder.length
                ? controllerState.playerOrder
                : Object.keys(controllerState.players || {});
            playerIds.forEach((ownerKey) => {
                const hand = controllerState.players?.[ownerKey]?.hand || [];
                input.revealByPlayer[ownerKey] = ownerKey === 'player'
                    ? null
                    : (hand.length ? chooseCpuRevealIndex(hand) : null);
            });
        }
        if (fateNo === 19) {
            input.discardByPlayer = {};
            const playerIds = Array.isArray(controllerState.playerOrder) && controllerState.playerOrder.length
                ? controllerState.playerOrder
                : Object.keys(controllerState.players || {});
            playerIds.forEach((ownerKey) => {
                if (ownerKey === 'player') return;
                const hand = controllerState.players?.[ownerKey]?.hand || [];
                input.discardByPlayer[ownerKey] = hand.length ? chooseCpuDiscardIndex(hand) : 0;
            });
            input.allowPlayerChoice = true;
        } else if (fateNo === 20) {
            input.discardByPlayer = {};
            const playerIds = Array.isArray(controllerState.playerOrder) && controllerState.playerOrder.length
                ? controllerState.playerOrder
                : Object.keys(controllerState.players || {});
            playerIds.forEach((ownerKey) => {
                if (ownerKey === 'player') return;
                const hand = controllerState.players?.[ownerKey]?.hand || [];
                input.discardByPlayer[ownerKey] = hand.length ? chooseCpuDiscardIndex(hand) : 0;
            });
            input.allowPlayerChoice = true;
        }

        await showRoundCutin(`運命カード ${fateNo}`);
        const updated = tarotGameController.runFateAction(input);
        syncStateFromController(updated);
        const afterBoardCount = Array.isArray(updated?.boardVisible) ? updated.boardVisible.length : (state.board?.length || 0);
        if (afterBoardCount > beforeBoardCount) {
            queuePendingBoardFlips(beforeBoardCount, afterBoardCount - 1);
            await runPendingBoardFlipAnimation();
        }
        const hasNpcReveal = getNpcKeys().some((key) => Number.isFinite(updated?.players?.[key]?.revealHandIndex));
        if (fateNo === 2 && hasNpcReveal) {
            showEffectOverlay('女教皇: NPC手札を公開');
        }
        if (fateNo === 9 && updated?.previewRiverCard) {
            showEffectOverlay(`隠者: 予見 ${getCardDisplayName(updated.previewRiverCard)}`);
        }
        render();
        const pendingPlayerFateDiscardMode = (fateNo === 19 || fateNo === 20)
            && updated?.phase === 'fate-action'
            && (updated?.pendingFateDiscardMode === 'sun' || updated?.pendingFateDiscardMode === 'judgment')
            && Array.isArray(updated?.pendingFateDiscardPlayers)
            && updated.pendingFateDiscardPlayers.includes('player')
            ? updated.pendingFateDiscardMode
            : null;
        if (pendingPlayerFateDiscardMode) {
            pushLog(
                pendingPlayerFateDiscardMode === 'sun'
                    ? '太陽効果: 引いた後に捨てるカードを選択してください。'
                    : '審判効果: 捨てるカードを選択してください。'
            );
            return;
        }
        if (updated.phase !== 'fate-action') return;
    }
}

async function resolveShowdownByController(judgmentSwapByPlayer = null) {
    if (!tarotGameController) {
        throw new Error('tarotGameController が初期化されていません');
    }
    const before = tarotGameController.getState();
    if (!judgmentSwapByPlayer && before?.canUseJudgmentSwap) {
        const waitingSelection = prepareJudgmentSwapSelection(before);
        if (waitingSelection) return;
        judgmentSwapByPlayer = buildAutoJudgmentSwapMap(before);
    }

    const controllerResult = tarotGameController.resolveShowdown(judgmentSwapByPlayer || {});
    const after = tarotGameController.getState();
    syncStateFromController(after);
    state.pendingJudgment = null;
    state.pendingJudgmentAutoSwapMap = null;
    state.selectedSwapHandIndex = null;
    state.selectedJudgmentPick = null;

    const winners = Array.isArray(controllerResult?.winnerIds) ? controllerResult.winnerIds : [];
    const npcKeys = getNpcKeys().filter((key) => !!state.players?.[key]);
    let displayNpcKey = npcKeys[0] || 'cpu';
    let displayNpcScore = null;
    npcKeys.forEach((key) => {
        const score = mapControllerEvaluationToLegacy(key, controllerResult?.evaluations?.[key], after);
        if (!score) return;
        if (!displayNpcScore || compareScore(score, displayNpcScore) > 0) {
            displayNpcScore = score;
            displayNpcKey = key;
        }
    });
    state.displayNpcKey = displayNpcKey;

    const uiWinner = winners.includes('player')
        ? (winners.length === 1 ? 'player' : 'draw')
        : (winners.length > 0 ? 'cpu' : 'draw');
    const settleWinner = winners.length === 1 ? winners[0] : (winners.length > 1 ? winners : 'draw');

    state.phase = 'showdown';
    state.showdownRevealRunning = false;
    state.showdownRevealDone = false;
    state.result = {
        winner: uiWinner,
        playerBest: mapControllerEvaluationToLegacy('player', controllerResult?.evaluations?.player, after),
        cpuBest: displayNpcScore || mapControllerEvaluationToLegacy(displayNpcKey, controllerResult?.evaluations?.[displayNpcKey], after),
        remainingTieBreakUsed: false,
        playerRemainingCards: [],
        cpuRemainingCards: []
    };
    settlePotByWinner(settleWinner);
    if (winners.length > 0) {
        const names = winners.map((key) => state.players?.[key]?.name || key).join(' / ');
        pushLog(`ショーダウン勝者: ${names}`);
    }
    await runShowdownPresentation();
}

async function advanceControllerAfterBettingRound() {
    if (!tarotGameController) return;
    const beforeBoardCount = Array.isArray(state?.board) ? state.board.length : 0;
    let controllerState = tarotGameController.completeBettingRound();
    syncStateFromController(controllerState);
    let afterBoardCount = Array.isArray(controllerState?.boardVisible) ? controllerState.boardVisible.length : (state.board?.length || 0);
    if (afterBoardCount > beforeBoardCount) {
        queuePendingBoardFlips(beforeBoardCount, afterBoardCount - 1);
        await runPendingBoardFlipAnimation();
    }

    if (controllerState.phase === 'fate-action') {
        await runControllerFateActionLoop();
        controllerState = tarotGameController.getState();
        syncStateFromController(controllerState);
    }

    const roundKey = controllerPhaseToRoundKey(controllerState.phase);
    if (roundKey) {
        startBettingRound(roundKey, '__controller__');
        render();
        if (state?.betting?.pendingResponseFor && state.betting.pendingResponseFor !== 'player') {
            await runNpcBettingTurns();
        }
        return;
    }

    if (controllerState.phase === 'showdown') {
        await resolveShowdownByController();
        return;
    }
    render();
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
    const labels = [ui.playerAction, ui.cpuAction, ui.npc2Action, ui.npc3Action];
    labels.forEach((el) => {
        if (!el) return;
        el.textContent = '';
        el.classList.remove('show', 'is-player', 'is-cpu');
    });
}

function getElementCenterPoint(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return null;
    const rect = el.getBoundingClientRect();
    if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

function getBetCoinSourceElement(ownerKey) {
    const handEl = getHandContainerByOwner(ownerKey);
    if (handEl) {
        const handCards = handEl.querySelectorAll
            ? Array.from(handEl.querySelectorAll('.tarot-card'))
            : [];
        for (let i = 0; i < handCards.length; i += 1) {
            const cardEl = handCards[i];
            if (!cardEl || !cardEl.classList) continue;
            if (cardEl.classList.contains('is-undealt')) continue;
            return cardEl;
        }
        return handEl;
    }
    const participantChip = ui.participantList?.querySelector?.(`[data-owner-key="${ownerKey}"]`) || null;
    if (participantChip) return participantChip;
    return getActionElementByOwner(ownerKey) || null;
}

function getPayoutTargetElement(ownerKey) {
    const handEl = getHandContainerByOwner(ownerKey);
    if (handEl) {
        const handCards = handEl.querySelectorAll
            ? Array.from(handEl.querySelectorAll('.tarot-card'))
            : [];
        for (let i = 0; i < handCards.length; i += 1) {
            const cardEl = handCards[i];
            if (!cardEl || !cardEl.classList) continue;
            if (cardEl.classList.contains('is-undealt')) continue;
            return cardEl;
        }
        return handEl;
    }
    const participantChip = ui.participantList?.querySelector?.(`[data-owner-key="${ownerKey}"]`) || null;
    if (participantChip) return participantChip;
    const actionEl = getActionElementByOwner(ownerKey);
    if (actionEl) return actionEl;
    return null;
}

function getMoneyBagCountByPot(potAmount, winnerCount = 1) {
    const pot = Math.max(0, Math.floor(Number(potAmount) || 0));
    let count = 4;
    if (pot >= 40) count = 6;
    if (pot >= 80) count = 8;
    if (pot >= 140) count = 10;
    if (pot >= 220) count = 12;
    if (pot >= 320) count = 14;
    if (pot >= 460) count = 16;
    if (pot >= 640) count = 18;
    if (pot >= 900) count = 20;
    const normalizedWinners = Math.max(1, Math.floor(Number(winnerCount) || 1));
    return Math.max(3, Math.min(20, Math.round(count / normalizedWinners)));
}

async function playBetCoinEffect(ownerKey, action) {
    if (!['bet', 'raise', 'call'].includes(String(action || ''))) return;
    const targetEl = ui.potText;
    if (!targetEl || typeof document === 'undefined') return;
    const sourceEl = getBetCoinSourceElement(ownerKey);
    const from = getElementCenterPoint(sourceEl);
    const to = getElementCenterPoint(targetEl);
    if (!from || !to) return;

    const coinCount = action === 'raise' ? 6 : 4;
    const ownerClass = ownerKey === 'player' ? 'is-player' : 'is-cpu';
    const lifeMs = action === 'raise' ? 620 : 500;
    const fadeInMs = 90;
    const fadeOutMs = 120;
    const tasks = [];

    for (let i = 0; i < coinCount; i += 1) {
        const coin = document.createElement('span');
        coin.className = `tarot-coin-fx ${ownerClass}`;
        coin.textContent = '🪙';
        coin.style.left = `${from.x}px`;
        coin.style.top = `${from.y}px`;
        coin.style.opacity = '0';
        coin.style.transform = 'translate(-50%, -50%) scale(0.6) rotate(0deg)';
        document.body.appendChild(coin);

        const delay = i * 36;
        const jitterX = (Math.random() * 14) - 7;
        const jitterY = (Math.random() * 12) - 6;
        const targetX = to.x + jitterX;
        const targetY = to.y + jitterY;
        const rotate = (Math.random() * 80) - 40;

        const run = new Promise((resolve) => {
            setTimeout(() => {
                coin.style.transition = `left ${lifeMs}ms cubic-bezier(0.18,0.84,0.26,1), top ${lifeMs}ms cubic-bezier(0.18,0.84,0.26,1), opacity ${fadeInMs}ms ease-out, transform ${lifeMs}ms ease`;
                coin.style.left = `${targetX}px`;
                coin.style.top = `${targetY}px`;
                coin.style.opacity = '1';
                coin.style.transform = `translate(-50%, -50%) scale(1) rotate(${rotate}deg)`;
            }, delay);

            setTimeout(() => {
                coin.style.transition = `opacity ${fadeOutMs}ms ease-in, transform ${fadeOutMs}ms ease-in`;
                coin.style.opacity = '0';
                coin.style.transform = `translate(-50%, -50%) scale(0.72) rotate(${rotate * 1.3}deg)`;
            }, delay + Math.max(120, lifeMs - 110));

            setTimeout(() => {
                if (coin.parentElement) coin.remove();
                resolve();
            }, delay + lifeMs + 80);
        });

        tasks.push(run);
    }

    await Promise.all(tasks);
}

async function playShowdownPotPayoutEffect() {
    const payload = state?.pendingPayoutFx;
    if (!payload) return;
    state.pendingPayoutFx = null;
    if (typeof document === 'undefined') return;
    const sourceEl = ui.potText || ui.potValueText;
    const from = getElementCenterPoint(sourceEl);
    if (!from) return;
    const winners = Array.isArray(payload.winners)
        ? payload.winners.filter((key) => !!state?.players?.[key])
        : [];
    if (!winners.length) return;
    const totalPot = Math.max(0, Math.floor(Number(payload.pot || 0)));
    if (totalPot <= 0) return;

    const tasks = [];
    const perWinnerAmount = Math.max(1, Math.floor(totalPot / winners.length));
    winners.forEach((winnerKey, winnerIndex) => {
        const targetEl = getPayoutTargetElement(winnerKey);
        const to = getElementCenterPoint(targetEl);
        if (!to) return;
        const ownerClass = winnerKey === 'player' ? 'is-player' : 'is-cpu';
        const bagCount = getMoneyBagCountByPot(perWinnerAmount, 1);
        const lifeMs = 680;
        for (let i = 0; i < bagCount; i += 1) {
            const bag = document.createElement('span');
            bag.className = `tarot-coin-fx is-payout ${ownerClass}`;
            bag.textContent = '💰';
            bag.style.left = `${from.x}px`;
            bag.style.top = `${from.y}px`;
            bag.style.opacity = '0';
            bag.style.transform = 'translate(-50%, -50%) scale(0.56) rotate(0deg)';
            document.body.appendChild(bag);

            const delay = (winnerIndex * 90) + (i * 48);
            const jitterX = (Math.random() * 18) - 9;
            const jitterY = (Math.random() * 14) - 7;
            const targetX = to.x + jitterX;
            const targetY = to.y + jitterY;
            const rotate = (Math.random() * 120) - 60;
            const arcY = Math.max(18, Math.abs(from.y - to.y) * 0.15);

            const run = new Promise((resolve) => {
                setTimeout(() => {
                    bag.style.transition = `left ${lifeMs}ms cubic-bezier(0.16,0.84,0.25,1), top ${lifeMs}ms cubic-bezier(0.16,0.84,0.25,1), opacity ${lifeMs}ms ease, transform ${lifeMs}ms ease`;
                    bag.style.left = `${targetX}px`;
                    bag.style.top = `${targetY - arcY}px`;
                    bag.style.opacity = '1';
                    bag.style.transform = `translate(-50%, -50%) scale(1.05) rotate(${rotate}deg)`;
                }, delay);

                setTimeout(() => {
                    bag.style.top = `${targetY}px`;
                    bag.style.transform = `translate(-50%, -50%) scale(0.88) rotate(${rotate * 1.2}deg)`;
                }, delay + Math.max(120, lifeMs - 180));

                setTimeout(() => {
                    bag.style.opacity = '0';
                    bag.style.transform = `translate(-50%, -50%) scale(0.72) rotate(${rotate * 1.35}deg)`;
                }, delay + Math.max(120, lifeMs - 90));

                setTimeout(() => {
                    if (bag.parentElement) bag.remove();
                    resolve();
                }, delay + lifeMs + 100);
            });
            tasks.push(run);
        }
    });

    if (!tasks.length) return;
    await Promise.all(tasks);
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
    const ownerName = state?.players?.[ownerKey]?.name || (ownerKey === 'player' ? 'あなた' : ownerKey.toUpperCase());
    const ownerClass = ownerKey === 'player' ? 'is-player' : 'is-cpu';
    const actionEl = getActionElementByOwner(ownerKey);
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
    if (action === 'bet' || action === 'raise' || action === 'call') {
        playBetCoinEffect(ownerKey, action).catch(() => {});
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
    if (!state?.players?.[ownerKey]) return null;
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

function getFateRuleNumber(card) {
    if (!card) return 0;
    const effectNumber = Number(card.effectNumber);
    if (Number.isFinite(effectNumber)) return effectNumber;
    return Number(card.number || 0);
}

function getActiveFateRuleNumber() {
    return getFateRuleNumber(state?.activeFateCard || state?.fateCard || null);
}

function escapeHtmlText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getFatePreviewSuitClass(card) {
    const options = getCardSuitOptionsForFlush(card).filter((suit) => SUITS.includes(suit));
    const suit = options[0] || 'None';
    if (suit === 'Wand') return 'is-wand';
    if (suit === 'Sword') return 'is-sword';
    if (suit === 'Cup') return 'is-cup';
    if (suit === 'Pentacle') return 'is-pentacle';
    return 'is-none';
}

function getFateEffectSummary(card) {
    if (!card) return '運命カード効果: なし';
    const displayNumber = Number(card.number);
    const ruleNumber = getFateRuleNumber(card);
    const base = Object.prototype.hasOwnProperty.call(FATE_EFFECT_SUMMARY, ruleNumber)
        ? FATE_EFFECT_SUMMARY[ruleNumber]
        : '\u3053\u306e\u30ab\u30fc\u30c9\u306e\u52b9\u679c\u8aac\u660e\u306f\u672a\u8a2d\u5b9a\u3067\u3059\u3002';
    const name = getCardDisplayName(card);
    const mutationText = ruleNumber !== displayNumber
        ? ` / 変異効果: ${(ARCANA_NAME[ruleNumber] || 'アルカナ')}(${ruleNumber})`
        : '';
    if (ruleNumber === 9 && state?.previewRiverCard) {
        const previewName = getCardDisplayName(state.previewRiverCard);
        const previewNum = getCardNumberLabel(state.previewRiverCard);
        return `${name} (${displayNumber}) / ${base}${mutationText} / 予見: ${previewName}(${previewNum})`;
    }
    return `${name} (${displayNumber}) / ${base}${mutationText}`;
}

function getFateEffectSummaryHtml(card) {
    const plain = getFateEffectSummary(card);
    const ruleNumber = getFateRuleNumber(card);
    if (ruleNumber === 9 && state?.previewRiverCard) {
        const previewName = getCardDisplayName(state.previewRiverCard);
        const previewNum = getCardNumberLabel(state.previewRiverCard);
        const previewToken = `${previewName}(${previewNum})`;
        const escapedPlain = escapeHtmlText(plain);
        const escapedToken = escapeHtmlText(previewToken);
        const tokenIndex = escapedPlain.lastIndexOf(escapedToken);
        if (tokenIndex >= 0) {
            const suitClass = getFatePreviewSuitClass(state.previewRiverCard);
            const before = escapedPlain.slice(0, tokenIndex);
            const after = escapedPlain.slice(tokenIndex + escapedToken.length);
            return `${before}<span class="tarot-fate-preview-token ${suitClass}">${escapedToken}</span>${after}`;
        }
        return escapedPlain;
    }
    return escapeHtmlText(plain);
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
    if (card.isArcana) return ARCANA_NAME[card.number] || 'アルカナ';
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

function getDisplayAdjustedNumber(card) {
    if (!card) return 0;
    const baseNumber = Number(card.number) || 0;
    if (card.isArcana) return baseNumber;

    const fateNumber = getActiveFateRuleNumber();

    // 死神: コート(11-14)を 1-4 に固定変換
    if (fateNumber === 13 && baseNumber >= 11 && baseNumber <= 14) {
        return baseNumber - 10;
    }

    // 節制: 奇数を +1 して偶数化
    if (fateNumber === 14 && baseNumber % 2 === 1) {
        return baseNumber + 1;
    }

    return baseNumber;
}

function getCardDisplayNumberOptions(card) {
    if (!card) return [];
    if (card.isArcana) {
        const baseNumber = Number(card.number) || 0;
        // 運命の輪の変異は「見た目効果」扱い。数値表示は10固定。
        if (baseNumber === 10 && Number.isFinite(Number(card.effectNumber))) {
            return [10];
        }
        if (baseNumber === 3) return [3, 13];
        if (baseNumber === 4) return [4, 14];
        return [baseNumber];
    }
    return [getDisplayAdjustedNumber(card)];
}

function getCardNumberLabel(card) {
    if (!card) return '';
    const options = getCardDisplayNumberOptions(card);
    if (!Array.isArray(options) || options.length <= 0) return '';
    if (options.length === 1) {
        const displayNumber = Number(options[0]) || 0;
        if (!card.isArcana && displayNumber === 1) return 'A';
        return String(displayNumber);
    }
    const lo = Number(options[0]) || 0;
    const hi = Number(options[options.length - 1]) || 0;
    return `${lo}/${hi}`;
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
    const ruleNumber = Number.isFinite(Number(card.effectNumber))
        ? Number(card.effectNumber)
        : Number(card.number);
    const fromMap = ARCANA_FLUSH_SUIT_OPTIONS[ruleNumber];
    if (Array.isArray(fromMap) && fromMap.length > 0) return fromMap.slice();
    if (card.suit === 'All') return ['All'];
    if (SUITS.includes(card.suit)) return [card.suit];
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
    if (a?.engine && b?.engine && tarotEngineEvaluator) {
        try {
            return tarotEngineEvaluator.compareHands(
                a.engine,
                b.engine,
                a.engine.effects || {}
            ).cmp;
        } catch (error) {
            console.warn('[tarot-engine] compareScore fallback to legacy compare:', error);
        }
    }
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
    const sharedBest = chooseBestFiveFromSeven(sharedCards);
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
    if (!Array.isArray(cards) || cards.length < 5) return null;
    const fate = state?.activeFateCard || null;
    return evaluateHandByTarotEngine(cards, [], fate);
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

function mapCardForTarotEngine(card) {
    if (!card) return null;
    return {
        id: String(card.id || ''),
        number: Number(card.number || 0),
        effectNumber: Number.isFinite(Number(card.effectNumber))
            ? Number(card.effectNumber)
            : undefined,
        suit: String(card.suit || 'None'),
        isArcana: !!card.isArcana,
        effectType: getCardEffectType(card)
    };
}

function mapCardsById(cards) {
    const map = new Map();
    (Array.isArray(cards) ? cards : []).forEach((card) => {
        if (!card) return;
        map.set(String(card.id || ''), card);
    });
    return map;
}

function buildLegacyRankLabelFromEngine(engineEval, bestCards, legacyRank, rankVector) {
    if (!engineEval) return '役なし';
    const baseLabel = HAND_RANK_LABEL[legacyRank];
    if (baseLabel) {
        return decorateRankLabel(baseLabel, legacyRank, rankVector, bestCards);
    }
    return String(engineEval.rankLabel || engineEval.rank || '役なし');
}

function evaluateHandByTarotEngine(handCards, boardCards, fateCard = null) {
    if (!TAROT_ENGINE_ENABLED || !tarotEngineEvaluator) return null;
    const hand = (Array.isArray(handCards) ? handCards : []).map(mapCardForTarotEngine).filter(Boolean);
    const board = (Array.isArray(boardCards) ? boardCards : []).map(mapCardForTarotEngine).filter(Boolean);
    const fate = fateCard ? mapCardForTarotEngine(fateCard) : null;
    if (hand.length + board.length + (fate ? 1 : 0) < 5) return null;
    try {
        const engineEval = tarotEngineEvaluator.evaluateHand({
            hand,
            board,
            fateCard: fate || undefined
        });
        const cardMap = mapCardsById([
            ...(Array.isArray(handCards) ? handCards : []),
            ...(Array.isArray(boardCards) ? boardCards : []),
            ...(fateCard ? [fateCard] : [])
        ]);
        const bestCards = (Array.isArray(engineEval.bestFive) ? engineEval.bestFive : [])
            .map((entry) => {
                const byId = cardMap.get(String(entry?.id || ''));
                if (byId) return byId;
                if (entry?.zone === 'fate' && fateCard) {
                    return fateCard;
                }
                return null;
            })
            .filter(Boolean);
        const legacyRank = TAROT_ENGINE_RANK_TO_LEGACY[engineEval.rank] || 0;
        const rankVector = [
            ...(Array.isArray(engineEval.primaryVector) ? engineEval.primaryVector : []),
            ...(Array.isArray(engineEval.kickerVector) ? engineEval.kickerVector : [])
        ];
        return {
            rank: legacyRank,
            rankLabel: buildLegacyRankLabelFromEngine(engineEval, bestCards, legacyRank, rankVector),
            rankVector,
            maxNumber: Number(rankVector[0] || 0),
            hasArcana: bestCards.some((card) => !!card?.isArcana),
            maxArcana: bestCards.reduce((max, card) => Math.max(max, card?.isArcana ? Number(card.number || 0) : -1), -1),
            suitStrength: bestCards.reduce((max, card) => Math.max(max, getCardSuitStrength(card)), 0),
            cards: bestCards,
            engine: engineEval
        };
    } catch (error) {
        console.error('[tarot-engine] evaluateHand failed:', error);
        return null;
    }
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

function getTotalPaidAmountByOwner(ownerKey) {
    if (!state || !ownerKey) return 0;
    if (!Array.isArray(state.potArray) || state.potArray.length <= 0) return 0;
    const total = state.potArray.reduce((sum, entry) => {
        if (!entry || entry.ownerKey !== ownerKey) return sum;
        const amount = Math.floor(Number(entry.amount || 0));
        if (!Number.isFinite(amount) || amount <= 0) return sum;
        return sum + amount;
    }, 0);
    return Math.max(0, total);
}

function settlePotByWinner(winnerKey) {
    if (!state || state.handSettled) return;
    state.handSettled = true;
    const pot = Math.max(0, Number(state.pot || 0));
    if (pot <= 0) return;
    const winners = Array.isArray(winnerKey)
        ? winnerKey.filter((key) => !!state.players?.[key])
        : (winnerKey === 'draw'
            ? Object.keys(state.players || {}).filter((key) => !state.players[key].folded)
            : [winnerKey].filter((key) => !!state.players?.[key]));
    if (!winners.length) return;
    state.pendingPayoutFx = {
        pot,
        winners: winners.slice(),
        at: Date.now()
    };

    const baseShare = Math.floor(pot / winners.length);
    let rest = pot - (baseShare * winners.length);
    winners.forEach((key) => {
        const bonus = rest > 0 ? 1 : 0;
        state.players[key].testPoints += baseShare + bonus;
        if (rest > 0) rest -= 1;
    });

    if (winners.length > 1) {
        const names = winners.map((key) => state.players?.[key]?.name || key).join(' / ');
        pushLog(`ポット ${formatTestPoint(pot)} は分配: ${names}`);
        return;
    }
    const winner = winners[0];
    const winnerName = state.players[winner]?.name || winner;
    pushLog(`${winnerName} がポット ${formatTestPoint(pot)} を獲得。`);
}

function getActivePlayerOrder() {
    const ordered = PLAYER_ORDER.filter((ownerKey) => !!state?.players?.[ownerKey]);
    if (ordered.length > 0) return ordered;
    return Object.keys(state?.players || {});
}

function getRoundPlayerOrder() {
    const ordered = getActivePlayerOrder();
    const alive = ordered.filter((ownerKey) => !!state?.players?.[ownerKey] && !state.players[ownerKey].folded);
    return alive.length > 0 ? alive : ordered;
}

function getHandContainerByOwner(ownerKey) {
    if (ownerKey === 'player') return ui.playerHand;
    if (ownerKey === 'cpu') return ui.cpuHand;
    if (ownerKey === 'npc2') return ui.npc2Hand;
    if (ownerKey === 'npc3') return ui.npc3Hand;
    return null;
}

function getGraveContainerByOwner(ownerKey) {
    if (ownerKey === 'player') return ui.playerGrave;
    if (ownerKey === 'cpu') return ui.cpuGrave;
    if (ownerKey === 'npc2') return ui.npc2Grave;
    if (ownerKey === 'npc3') return ui.npc3Grave;
    return null;
}

function getActionElementByOwner(ownerKey) {
    if (ownerKey === 'player') return ui.playerAction;
    if (ownerKey === 'cpu') return ui.cpuAction;
    if (ownerKey === 'npc2') return ui.npc2Action;
    if (ownerKey === 'npc3') return ui.npc3Action;
    return null;
}

function normalizeDealerIndexByOrder(order) {
    if (!Array.isArray(order) || order.length <= 0) return 0;
    const raw = Math.floor(Number(state?.dealerIndex) || 0);
    const normalized = ((raw % order.length) + order.length) % order.length;
    state.dealerIndex = normalized;
    return normalized;
}

function createMiddlePositionLabels(count) {
    if (count <= 0) return [];
    if (count === 1) return ['UTG'];
    if (count === 2) return ['UTG', 'CO'];
    if (count === 3) return ['UTG', 'HJ', 'CO'];
    const labels = ['UTG'];
    for (let i = 1; i < count - 2; i += 1) {
        labels.push(`MP${i}`);
    }
    labels.push('HJ', 'CO');
    return labels;
}

function getPositionContext(order) {
    if (!Array.isArray(order) || order.length <= 0) return null;
    const seatCount = order.length;
    const dealerPos = normalizeDealerIndexByOrder(order);
    const ctx = {
        order: order.slice(),
        dealerPos,
        smallBlindPos: dealerPos,
        bigBlindPos: dealerPos,
        firstPreflopPos: dealerPos,
        firstPostflopPos: dealerPos,
        dealerOwner: order[dealerPos],
        smallBlindOwner: order[dealerPos],
        bigBlindOwner: order[dealerPos],
        firstPreflopActor: order[dealerPos],
        firstPostflopActor: order[dealerPos],
        positionLabels: {}
    };

    if (seatCount === 1) {
        ctx.positionLabels[ctx.dealerOwner] = 'BTN';
        return ctx;
    }

    if (seatCount === 2) {
        ctx.smallBlindPos = dealerPos;
        ctx.bigBlindPos = (dealerPos + 1) % seatCount;
        ctx.firstPreflopPos = ctx.smallBlindPos;
        ctx.firstPostflopPos = ctx.bigBlindPos;
        ctx.smallBlindOwner = order[ctx.smallBlindPos];
        ctx.bigBlindOwner = order[ctx.bigBlindPos];
        ctx.firstPreflopActor = order[ctx.firstPreflopPos];
        ctx.firstPostflopActor = order[ctx.firstPostflopPos];
        ctx.positionLabels[ctx.smallBlindOwner] = 'BTN/SB';
        ctx.positionLabels[ctx.bigBlindOwner] = 'BB';
        return ctx;
    }

    ctx.smallBlindPos = (dealerPos + 1) % seatCount;
    ctx.bigBlindPos = (dealerPos + 2) % seatCount;
    ctx.firstPreflopPos = (dealerPos + 3) % seatCount;
    ctx.firstPostflopPos = ctx.smallBlindPos;
    ctx.smallBlindOwner = order[ctx.smallBlindPos];
    ctx.bigBlindOwner = order[ctx.bigBlindPos];
    ctx.firstPreflopActor = order[ctx.firstPreflopPos];
    ctx.firstPostflopActor = order[ctx.firstPostflopPos];
    ctx.positionLabels[ctx.dealerOwner] = 'BTN';
    ctx.positionLabels[ctx.smallBlindOwner] = 'SB';
    ctx.positionLabels[ctx.bigBlindOwner] = 'BB';

    const middleOwners = [];
    let cursor = (ctx.bigBlindPos + 1) % seatCount;
    while (cursor !== ctx.dealerPos) {
        middleOwners.push(order[cursor]);
        cursor = (cursor + 1) % seatCount;
    }
    const middleLabels = createMiddlePositionLabels(middleOwners.length);
    middleOwners.forEach((ownerKey, idx) => {
        ctx.positionLabels[ownerKey] = middleLabels[idx] || `P${idx + 1}`;
    });
    return ctx;
}

function applyPreflopBlinds() {
    if (!state?.betting || state.betting.roundKey !== 'preflop') return;
    const order = getRoundPlayerOrder();
    if (order.length < 2) return;
    const pos = getPositionContext(order);
    if (!pos) return;
    const postBlind = (ownerKey, amount, reason) => {
        const payer = state.players?.[ownerKey];
        const blindAmount = Math.max(0, Math.floor(Number(amount) || 0));
        if (!payer || blindAmount <= 0) return 0;
        const payerStack = Math.max(0, Math.floor(Number(payer.testPoints) || 0));
        const payAmount = Math.min(blindAmount, payerStack);
        if (payAmount <= 0) return 0;
        if (!addBetToPot(ownerKey, payAmount, { reason })) return 0;
        return payAmount;
    };
    const sbPaid = postBlind(pos.smallBlindOwner, SMALL_BLIND_TP, 'small-blind');
    const bbPaid = postBlind(pos.bigBlindOwner, BLIND_BONUS_TP, 'big-blind');
    state.betting.currentBet = Math.max(
        Number(state.betting.currentBet) || 0,
        Number(state.betting.contributions?.[pos.smallBlindOwner]) || 0,
        Number(state.betting.contributions?.[pos.bigBlindOwner]) || 0
    );
    state.betting.pendingResponseFor = pos.firstPreflopActor || null;
    state.betting.positionContext = pos;
    state.positionContext = pos;
    state.tablePositionLabels = { ...(pos.positionLabels || {}) };
    Object.keys(state.betting.checks || {}).forEach((ownerKey) => {
        state.betting.checks[ownerKey] = false;
    });
    pushLog(
        `ポジション: 親 ${state.players?.[pos.dealerOwner]?.name || pos.dealerOwner} / スモール ${state.players?.[pos.smallBlindOwner]?.name || pos.smallBlindOwner} / ビッグ ${state.players?.[pos.bigBlindOwner]?.name || pos.bigBlindOwner}`
    );
    pushLog(
        `ブラインド: スモール ${formatTestPoint(sbPaid)} / ビッグ ${formatTestPoint(bbPaid)}`
    );
}

function startBettingRound(roundKey, nextPhase) {
    const order = getRoundPlayerOrder();
    const contributions = {};
    const checks = {};
    order.forEach((ownerKey) => {
        contributions[ownerKey] = 0;
        checks[ownerKey] = false;
    });
    const pos = getPositionContext(order);
    const initialTurn = roundKey === 'preflop'
        ? (pos?.firstPreflopActor || order[0] || 'player')
        : (pos?.firstPostflopActor || order[0] || 'player');
    state.betting = {
        roundKey,
        nextPhase,
        minBet: TEST_BET_UNIT,
        minRaise: TEST_BET_UNIT,
        currentBet: 0,
        contributions,
        pendingResponseFor: initialTurn,
        checks,
        positionContext: pos
    };
    state.positionContext = pos;
    state.tablePositionLabels = { ...(pos?.positionLabels || {}) };
    state.phase = `betting-${roundKey}`;
    pushLog(`ベッティング開始: ${getRoundKeyLabel(roundKey)} / 最小 ${formatTestPoint(TEST_BET_UNIT)}`);
    if (roundKey === 'preflop') {
        applyPreflopBlinds();
    }
}

function getBettingActiveOrder() {
    const order = getActivePlayerOrder();
    return order.filter((ownerKey) => !!state.players?.[ownerKey] && !state.players[ownerKey].folded);
}

function getNextBettingActor(currentKey) {
    const order = getBettingActiveOrder();
    if (!order.length) return null;
    const idx = order.indexOf(currentKey);
    if (idx < 0) return order[0];
    return order[(idx + 1) % order.length];
}

function isBettingRoundComplete() {
    if (!state?.betting) return false;
    const active = getBettingActiveOrder();
    if (active.length <= 1) return true;
    const currentBet = Number(state.betting.currentBet || 0);
    if (currentBet <= 0) {
        return active.every((ownerKey) => !!state.betting.checks?.[ownerKey]);
    }
    return active.every((ownerKey) => (Number(state.betting.contributions?.[ownerKey] || 0) >= currentBet));
}

function getNpcWinRateEstimate(ownerKey) {
    const hand = state.players?.[ownerKey]?.hand || [];
    const board = state.board.slice();
    const pool = state.deck.slice();
    const aliveOpponents = getActivePlayerOrder()
        .filter((key) => key !== ownerKey)
        .filter((key) => !!state.players?.[key] && !state.players[key].folded);
    const opponentCount = Math.max(1, aliveOpponents.length);
    return estimateCpuWinRate(hand, board, pool, Math.floor(CPU_SIMULATION_COUNT * 0.7), opponentCount);
}

function chooseNpcBettingAction(ownerKey) {
    const betting = state.betting;
    const npc = state.players?.[ownerKey];
    if (!npc) return { action: 'check' };
    const toCall = getToCall(ownerKey);
    const minRaise = betting.minRaise || TEST_BET_UNIT;
    const minBet = betting.minBet || TEST_BET_UNIT;
    const roundKey = String(betting.roundKey || '');
    const rate = getNpcWinRateEstimate(ownerKey);
    const winRate = Number.isFinite(rate) && rate >= 0 ? rate : 0.5;

    if (toCall > 0) {
        const alreadyContributed = Number(betting.contributions?.[ownerKey] || 0);
        const isFirstPreflopResponse = roundKey === 'preflop'
            && toCall <= BLIND_BONUS_TP
            && alreadyContributed <= BLIND_BONUS_TP;
        if (isFirstPreflopResponse) {
            if (winRate > 0.78 && npc.testPoints >= toCall + minRaise && Math.random() < 0.35) {
                return { action: 'raise' };
            }
            return { action: 'call' };
        }

        const potAfterCall = state.pot + toCall;
        const potOdds = toCall / Math.max(1, potAfterCall);
        const stackPressure = toCall / Math.max(1, npc.testPoints || 1);
        const isSmallCall = toCall <= minBet;
        if (!isSmallCall && stackPressure > 0.22 && winRate + 0.08 < potOdds) return { action: 'fold' };
        if (winRate > 0.72 && npc.testPoints >= toCall + minRaise && Math.random() < 0.45) {
            return { action: 'raise' };
        }
        return { action: 'call' };
    }

    if (winRate > 0.66 && npc.testPoints >= betting.minBet && Math.random() < 0.55) {
        return { action: 'bet' };
    }
    return { action: 'check' };
}

function applyBetAction(ownerKey, action) {
    if (!state?.betting) return { ok: false, message: '現在はベットフェーズではありません。' };
    const betting = state.betting;
    const activeOrder = getBettingActiveOrder();
    if (!activeOrder.includes(ownerKey)) return { ok: false, message: 'このプレイヤーは行動できません。' };
    const toCall = getToCall(ownerKey);
    const actor = state.players[ownerKey];
    const actorName = actor.name || ownerKey;
    const registerControllerAction = () => {
        if (!tarotGameController) return { ok: true };
        try {
            tarotGameController.registerPlayerAction(ownerKey, action);
            syncStateFromController(tarotGameController.getState());
            return { ok: true };
        } catch (error) {
            return { ok: false, message: error?.message || 'Action blocked.' };
        }
    };

    if (action === 'fold') {
        const controllerResult = registerControllerAction();
        if (!controllerResult.ok) return controllerResult;
        actor.folded = true;
        pushLog(`${actorName} はフォールド。`);
        const survivors = getBettingActiveOrder();
        if (survivors.length <= 1) {
            const winnerKey = survivors[0] || 'draw';
            settlePotByWinner(winnerKey);
            state.phase = 'showdown';
            const displayNpcKey = getDisplayNpcKey();
            state.result = {
                winner: winnerKey === 'player' ? 'player' : (winnerKey === 'draw' ? 'draw' : 'cpu'),
                playerBest: { rankLabel: winnerKey === 'player' ? 'フォールド勝ち' : 'フォールド負け' },
                cpuBest: { rankLabel: winnerKey === displayNpcKey ? 'フォールド勝ち' : 'フォールド負け' },
                remainingTieBreakUsed: false,
                playerRemainingCards: [],
                cpuRemainingCards: []
            };
            return { ok: true, handEnded: true };
        }
        betting.pendingResponseFor = getNextBettingActor(ownerKey);
        return { ok: true };
    }

    if (action === 'check') {
        if (toCall > 0) return { ok: false, message: 'コール額があります。' };
        const controllerResult = registerControllerAction();
        if (!controllerResult.ok) return controllerResult;
        betting.checks[ownerKey] = true;
        pushLog(`${actorName} はチェック。`);
        if (isBettingRoundComplete()) {
            betting.pendingResponseFor = null;
            return { ok: true, roundComplete: true };
        }
        betting.pendingResponseFor = getNextBettingActor(ownerKey);
        return { ok: true };
    }

    if (action === 'call') {
        if (toCall <= 0) return { ok: false, message: 'コール不要です。' };
        const controllerResult = registerControllerAction();
        if (!controllerResult.ok) return controllerResult;
        if (!addBetToPot(ownerKey, toCall)) return { ok: false, message: 'ポイント不足でコールできません。' };
        betting.checks[ownerKey] = false;
        pushLog(`${actorName} はコール (${formatTestPoint(toCall)})。`);
        if (isBettingRoundComplete()) {
            betting.pendingResponseFor = null;
            return { ok: true, roundComplete: true };
        }
        betting.pendingResponseFor = getNextBettingActor(ownerKey);
        return { ok: true };
    }

    if (action === 'bet') {
        if (betting.currentBet > 0 || toCall > 0) return { ok: false, message: '現在はベットではなくコール/レイズです。' };
        const controllerResult = registerControllerAction();
        if (!controllerResult.ok) return controllerResult;
        const amount = betting.minBet;
        if (!addBetToPot(ownerKey, amount)) return { ok: false, message: 'ポイント不足でベットできません。' };
        betting.currentBet = betting.contributions[ownerKey];
        Object.keys(betting.checks || {}).forEach((key) => {
            betting.checks[key] = false;
        });
        betting.pendingResponseFor = getNextBettingActor(ownerKey);
        pushLog(`${actorName} はベット (${formatTestPoint(amount)})。`);
        return { ok: true };
    }

    if (action === 'raise') {
        const raiseCost = toCall + betting.minRaise;
        if (raiseCost <= 0) return { ok: false, message: 'レイズ額を計算できません。' };
        const controllerResult = registerControllerAction();
        if (!controllerResult.ok) return controllerResult;
        if (!addBetToPot(ownerKey, raiseCost)) return { ok: false, message: 'ポイント不足でレイズできません。' };
        betting.currentBet = betting.contributions[ownerKey];
        Object.keys(betting.checks || {}).forEach((key) => {
            betting.checks[key] = false;
        });
        betting.pendingResponseFor = getNextBettingActor(ownerKey);
        pushLog(`${actorName} はレイズ (+${formatTestPoint(betting.minRaise)})。`);
        return { ok: true };
    }

    return { ok: false, message: '未対応のアクションです。' };
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
    state.betting = null;
    await advanceControllerAfterBettingRound();
}
async function runNpcBettingTurns() {
    if (!isBettingPhase() || !state.betting) return;
    state.cpuThinking = true;
    render();
    try {
        let guard = 0;
        while (state.betting && state.betting.pendingResponseFor && state.betting.pendingResponseFor !== 'player' && guard < 24) {
            guard += 1;
            const ownerKey = state.betting.pendingResponseFor;
            state.displayNpcKey = ownerKey;
            render();
            const decision = chooseNpcBettingAction(ownerKey);
            let usedAction = decision.action;
            let result = applyBetAction(ownerKey, usedAction);
            if (!result.ok) {
                usedAction = getToCall(ownerKey) > 0 ? 'call' : 'check';
                result = applyBetAction(ownerKey, usedAction);
                if (!result.ok) {
                    usedAction = 'fold';
                    result = applyBetAction(ownerKey, usedAction);
                }
            }
            await showActionCutin(ownerKey, usedAction);
            render();
            await wait(180);

            if (state.phase === 'showdown') return;
            if (!state.betting) return;
            if (result?.handEnded) return;
            if (result?.roundComplete || !state.betting.pendingResponseFor || isBettingRoundComplete()) {
                state.betting.pendingResponseFor = null;
                await completeBettingRoundIfNeeded();
                return;
            }
        }
    } finally {
        state.cpuThinking = false;
        render();
    }
}

async function onPlayerBetAction(action) {
    if (!isBettingPhase() || state.cpuThinking) return;
    if (state?.betting?.pendingResponseFor && state.betting.pendingResponseFor !== 'player') return;
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
    if (state.betting?.pendingResponseFor && state.betting.pendingResponseFor !== 'player') {
        await runNpcBettingTurns();
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

function estimateCpuWinRate(
    candidateCpuHand,
    boardCards,
    basePool,
    simulationCount = CPU_SIMULATION_COUNT,
    opponentCount = 1
) {
    if (!Array.isArray(candidateCpuHand) || candidateCpuHand.length !== 2) return -1;
    if (!Array.isArray(boardCards) || boardCards.length > 5) return -1;
    const enemyCount = Math.max(1, Math.floor(Number(opponentCount) || 1));
    const pool = buildPoolWithoutCards(basePool, [...candidateCpuHand, ...boardCards]);
    const boardDrawNeeded = Math.max(0, 5 - boardCards.length);
    const required = (enemyCount * 2) + boardDrawNeeded;
    if (pool.length < required) return -1;
    let score = 0;
    for (let i = 0; i < simulationCount; i += 1) {
        const draw = drawRandomMany(pool, required);
        if (!draw) break;
        const enemyHands = [];
        for (let enemyIndex = 0; enemyIndex < enemyCount; enemyIndex += 1) {
            const offset = enemyIndex * 2;
            enemyHands.push([draw[offset], draw[offset + 1]]);
        }
        const boardAdds = boardDrawNeeded > 0 ? draw.slice(enemyCount * 2) : [];
        const futureBoard = [...boardCards, ...boardAdds];
        const cpuBest = chooseBestFiveFromSeven([...candidateCpuHand, ...futureBoard]);
        if (!cpuBest) continue;
        let share = 1;
        for (let enemyIndex = 0; enemyIndex < enemyHands.length; enemyIndex += 1) {
            const enemyHand = enemyHands[enemyIndex];
            const enemyBest = chooseBestFiveFromSeven([...enemyHand, ...futureBoard]);
            if (!enemyBest) continue;
            const cmpResult = compareHandsWithRemainingTieBreak(
                [...candidateCpuHand, ...futureBoard],
                cpuBest,
                [...enemyHand, ...futureBoard],
                enemyBest
            );
            const cmp = cmpResult.cmp;
            if (cmp < 0) {
                share = 0;
                break;
            }
            if (cmp === 0) {
                share *= 0.5;
            }
        }
        score += share;
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

function applyDiscardSpecial(card, ownerKey) {
    if (!card) return;
    const effectType = getCardEffectType(card);
    if (effectType === EFFECT_TYPE.WORLD) {
        const otherKey = ownerKey === 'player' ? 'cpu' : 'player';
        state.players[otherKey].canExchange = false;
        const playerHasFool = hasFoolInHand('player');
        const cpuHasFool = hasFoolInHand('cpu');
        state.players.player.bettingEnabled = playerHasFool;
        state.players.cpu.bettingEnabled = cpuHasFool;
        if (!playerHasFool && !cpuHasFool) {
            state.forceShowdown = true;
        pushLog('世界: 愚者不在のため強制ショーダウン');
            showEffectOverlay('THE WORLD - TIME STOP');
            return;
        }
        pushLog('世界: 交換ロック → ' + state.players[otherKey].name);
        showEffectOverlay('THE WORLD - EXCHANGE LOCK');
    }
}

function applyBoardSpecial(card) {
    if (!card) return;
    const effectType = getCardEffectType(card);
    if (effectType === EFFECT_TYPE.FOOL) {
        pushLog('愚者: ワイルドカード発動');
        showEffectOverlay('THE FOOL - WILD CARD');
        return;
    }
    if (effectType === EFFECT_TYPE.WORLD) {
        state.players.player.bettingEnabled = hasFoolInHand('player');
        state.players.cpu.bettingEnabled = hasFoolInHand('cpu');
        state.forceShowdown = true;
        pushLog('場の世界: 強制ショーダウン');
        showEffectOverlay('THE WORLD - TIME STOP');
        return;
    }
    if (effectType === EFFECT_TYPE.JUDGMENT) {
        Object.keys(state.players || {}).forEach((ownerKey) => {
            state.players[ownerKey].hasResurrectionRight = true;
        });
        pushLog('場の審判: 蘇生権を付与');
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
            await animateCardFlight(card, ui.deckAnchor, hiddenTarget, 260, 1, { hidden: true });
            await wait(50);
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
    if (!tarotGameController) {
        throw new Error('tarotGameController が初期化されていません');
    }
    await resolveShowdownByController();
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
        render();
        const playerCardEls = ui.playerHand ? Array.from(ui.playerHand.querySelectorAll('.tarot-card')) : [];
        const targetEl = playerCardEls[player.hand.length - 1] || ui.playerHand;
        await animateCardFlight(drawn, ui.deckAnchor, targetEl, 260, 1);
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

function chooseCpuRevealIndex(handCards) {
    const hand = Array.isArray(handCards) ? handCards : [];
    if (!hand.length) return null;
    let strongestIndex = 0;
    for (let i = 1; i < hand.length; i += 1) {
        if (compareCardPower(hand[i], hand[strongestIndex]) > 0) {
            strongestIndex = i;
        }
    }
    return strongestIndex;
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
    if (fromHandEl?.classList) {
        fromHandEl.classList.add('is-leaving');
        await wait(110);
    }
    const [discarded] = cpu.hand.splice(discardIndex, 1);
    if (!discarded) return null;
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
        render();
        const cpuHandEls = ui.cpuHand ? Array.from(ui.cpuHand.querySelectorAll('.tarot-card')) : [];
        const targetEl = cpuHandEls[cpu.hand.length - 1] || ui.cpuHand;
        await animateCardFlight(forcedDraw, ui.deckAnchor, targetEl, 260, 1, { hidden: true });
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
                    const fromGrave = getGraveContainerByOwner(picked.ownerKey) || ui.cpuGrave;
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
    if (!tarotGameController) {
        throw new Error('tarotGameController が初期化されていません');
    }
    await resolveShowdownByController();
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
    const keepNpc2Tp = Number.isFinite(Number(state?.players?.npc2?.testPoints))
        ? Math.max(0, Math.floor(Number(state.players.npc2.testPoints)))
        : TEST_POINT_START;
    const keepNpc3Tp = Number.isFinite(Number(state?.players?.npc3?.testPoints))
        ? Math.max(0, Math.floor(Number(state.players.npc3.testPoints)))
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
    state.players.npc2.testPoints = keepNpc2Tp;
    state.players.npc3.testPoints = keepNpc3Tp;
    state.displayNpcKey = getNpcKeys()[0] || 'cpu';
    clearBetActionLabels();

    tarotGameController = new TarotGameController({ playerIds: PLAYER_ORDER.slice() });
    tarotControllerLogCursor = 0;
    const controllerState = tarotGameController.startRound();
    syncStateFromController(controllerState);

    state.phase = 'fate-reveal';
    await revealFateCardPresentation();

    state.phase = 'dealing';
    state.initialDealAnimating = true;
    state.initialDealRevealedCount = 0;
    state.initialDealDealtCounts = {};
    PLAYER_ORDER.forEach((ownerKey) => {
        state.initialDealDealtCounts[ownerKey] = 0;
    });

    const dealingOrder = getActivePlayerOrder();
    const handByOwner = {};
    dealingOrder.forEach((ownerKey) => {
        handByOwner[ownerKey] = state.players?.[ownerKey]?.hand || [];
    });
    const dealCount = dealingOrder.reduce((max, ownerKey) => {
        const length = Array.isArray(handByOwner[ownerKey]) ? handByOwner[ownerKey].length : 0;
        return Math.max(max, length);
    }, 0);

    let playerRevealCount = 0;
    for (let i = 0; i < dealCount; i += 1) {
        for (let turn = 0; turn < dealingOrder.length; turn += 1) {
            const ownerKey = dealingOrder[turn];
            const hand = handByOwner[ownerKey] || [];
            const card = hand[i];
            if (!card) continue;

            render();
            const handContainer = getHandContainerByOwner(ownerKey) || ui.cpuHand;
            const handSlots = handContainer ? Array.from(handContainer.querySelectorAll('.tarot-card')) : [];
            const targetHand = handSlots[i] || handContainer;
            if (targetHand) {
                await animateCardFlight(card, ui.deckAnchor, targetHand, 220, 1, { hidden: true });
            }
            const currentDealt = Number(state.initialDealDealtCounts?.[ownerKey] || 0);
            state.initialDealDealtCounts[ownerKey] = Math.max(currentDealt, i + 1);
            render();
            await wait(60);
        }
        await wait(80);
    }

    render();
    await wait(120);

    const playerHandCards = handByOwner.player || [];
    for (let i = 0; i < playerHandCards.length; i += 1) {
        const card = playerHandCards[i];
        const target = Array.from(ui.playerHand?.querySelectorAll('.tarot-card') || [])[i];
        if (!card || !target) continue;
        await animateBackToFrontOnElement(target, card);
        playerRevealCount = Math.max(playerRevealCount, i + 1);
        state.initialDealRevealedCount = playerRevealCount;
        render();
        await wait(90);
    }

    state.initialDealAnimating = false;
    state.initialDealRevealedCount = playerRevealCount;
    state.drawRound = 0;

    const roundKey = controllerPhaseToRoundKey(controllerState.phase) || 'preflop';
    startBettingRound(roundKey, '__controller__');
    if (state.activeFateCard) {
        pushLog('運命カードを公開。');
    }
    render();
    if (state?.betting?.pendingResponseFor && state.betting.pendingResponseFor !== 'player') {
        await runNpcBettingTurns();
    }
}
async function handleNext() {
    if (!state) return;
    if (state.phase === 'preflop') {
        await openFlopThenDraw();
        return;
    }

    if (state.phase === 'draw-player') {
        pushLog(`第${state.drawRound}ドローフェーズ: 捨てる手札を選択（スキップも可）`);
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

function canSkipPlayerDiscardPhase() {
    if (!state) return false;
    if (state.phase !== 'draw-player') return false;
    if (state.isResolvingPlayerDiscard) return false;
    if (state.awaitingPostJudgmentDiscard) return false;
    if (getControllerPendingDiscardModeForPlayer()) return false;
    return true;
}

async function skipPlayerDiscardPhase() {
    if (!canSkipPlayerDiscardPhase()) return;
    state.selectedDiscardIndex = null;
    pushLog(`第${state.drawRound}ドローフェーズ: スキップして次へ進行`);
    await finishPlayerExchange(getPostDrawNextPhase());
}

async function handlePrimaryButtonClick() {
    if (!state) return;
    if (state.phase === 'idle' || state.phase === 'showdown') {
        await startNewGame();
        return;
    }
    if (canSkipPlayerDiscardPhase()) {
        await skipPlayerDiscardPhase();
        return;
    }
    await handleNext();
}

async function onPlayerCardClick(index) {
    const pendingFateDiscardMode = getControllerPendingDiscardModeForPlayer();
    const isFatePendingDiscard = !!pendingFateDiscardMode;
    const isShowdownSwapSelect = !!state
        && state.phase === 'showdown-judgment-select'
        && state.pendingJudgment?.mode === 'showdown-swap';
    if (!state || (state.phase !== 'draw-player' && !isFatePendingDiscard && !isShowdownSwapSelect)) return;
    if (isShowdownSwapSelect) {
        const playerHand = state.players?.player?.hand || [];
        if (index < 0 || index >= playerHand.length) return;
        state.selectedSwapHandIndex = index;
        render();
        return;
    }
    if (isFatePendingDiscard) {
        const player = state.players.player;
        if (index < 0 || index >= player.hand.length) return;
        if (state.isResolvingPlayerDiscard) return;
        if (state.selectedDiscardIndex !== index) {
            state.selectedDiscardIndex = index;
            render();
            return;
        }
        state.isResolvingPlayerDiscard = true;
        try {
            const updated = tarotGameController.runFateAction({
                discardByPlayer: { player: index },
                allowPlayerChoice: true
            });
            state.selectedDiscardIndex = null;
            syncStateFromController(updated);
            render();
            if (updated.phase === 'fate-action') {
                await runControllerFateActionLoop();
            }

            const controllerState = tarotGameController.getState();
            syncStateFromController(controllerState);
            const roundKey = controllerPhaseToRoundKey(controllerState.phase);
            if (roundKey) {
                startBettingRound(roundKey, '__controller__');
                render();
                if (state?.betting?.pendingResponseFor && state.betting.pendingResponseFor !== 'player') {
                    await runNpcBettingTurns();
                }
            } else if (controllerState.phase === 'showdown') {
                await resolveShowdownByController();
            } else {
                render();
            }
        } finally {
            state.isResolvingPlayerDiscard = false;
        }
        return;
    }
    
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

    const playerCardEls = ui.playerHand ? Array.from(ui.playerHand.querySelectorAll('.tarot-card')) : [];
    const sourceEl = playerCardEls[index] || ui.playerHand;

    try {
        if (sourceEl?.classList) {
            sourceEl.classList.add('is-leaving');
            await wait(110);
        }
        const [discarded] = player.hand.splice(index, 1);
        state.selectedDiscardIndex = null;
        if (!discarded) {
            render();
            return;
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
    if (!state || (state.phase !== 'draw-player-judgment' && state.phase !== 'showdown-judgment-select') || !cardId) return;
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
    if (!state || (state.phase !== 'draw-player-judgment' && state.phase !== 'showdown-judgment-select')) return;
    const pending = state.pendingJudgment;
    const hasPending = !!pending && Array.isArray(pending.options);
    const isShowdownSwap = state.phase === 'showdown-judgment-select' && pending?.mode === 'showdown-swap';
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
    if (isShowdownSwap) {
        const playerCardId = (!isSkip && selectedOption) ? selectedOption.cardId : null;
        const selectedHandIdx = Number.isFinite(Number(state.selectedSwapHandIndex))
            ? Math.max(0, Math.min((state.players?.player?.hand?.length || 1) - 1, Math.floor(Number(state.selectedSwapHandIndex))))
            : -1;
        const selectedHandCardId = selectedHandIdx >= 0
            ? (state.players?.player?.hand?.[selectedHandIdx]?.id || null)
            : null;
        const swapMap = {
            ...(state.pendingJudgmentAutoSwapMap || {}),
            ...(playerCardId
                ? {
                    player: selectedHandCardId
                        ? { graveCardId: playerCardId, handCardId: selectedHandCardId }
                        : { graveCardId: playerCardId }
                }
                : {})
        };
        state.pendingJudgment = null;
        state.pendingJudgmentAutoSwapMap = null;
        state.selectedSwapHandIndex = null;
        state.selectedJudgmentPick = null;
        await resolveShowdownByController(swapMap);
        return;
    }
    const gained = selectedOption ? takeGraveCardById(selectedOption.ownerKey, selectedOption.cardId) : null;
    if (gained && selectedOption) {
        const fromGrave = getGraveContainerByOwner(selectedOption.ownerKey) || ui.playerGrave;
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
        state.selectedSwapHandIndex = null;
        state.selectedDiscardIndex = null;
        state.phase = 'draw-player';
        await finishPlayerExchange(getPostDrawNextPhase());
        return;
    }
    state.pendingJudgment = null;
    state.selectedJudgmentPick = null;
    state.selectedSwapHandIndex = null;
    state.selectedDiscardIndex = null;
    state.phase = 'draw-player';
    render();
}
function getPhaseText() {
    if (!state) return '';
    if (state.phase === 'idle') return '「新しい勝負を始める」を押してください。';
    if (state.phase === 'fate-reveal') return '運命のカードを公開中...';
    if (state.phase === 'dealing') return '配札中...';
    if (state.phase === 'betting-preflop') return 'プリフロップベット: アクションを選択してください。';
    if (state.phase === 'betting-flop') return 'フロップベット: アクションを選択してください。';
    if (state.phase === 'betting-turn') return 'ターンベット: アクションを選択してください。';
    if (state.phase === 'betting-river') return 'リバーベット: アクションを選択してください。';
    if (state.phase === 'betting-river2') return '追加ベット: アクションを選択してください。';
    if (state.phase === 'betting-mid') return '中盤ベット: アクションを選択してください。';
    if (state.phase === 'betting-final') return '最終ベット: アクションを選択してください。';
    if (state.phase === 'preflop') return 'フロップを公開します。';
    const pendingFateDiscardMode = getControllerPendingDiscardModeForPlayer();
    if (pendingFateDiscardMode === 'sun') return '太陽効果: 引いた後に、捨てる手札を選択してください。';
    if (pendingFateDiscardMode === 'judgment') return '審判効果: 捨てる手札を選択してください。';
    if (state.phase === 'draw-player') {
        return state.awaitingPostJudgmentDiscard
            ? `第${state.drawRound}ドローフェーズ: 1枚捨ててください。`
            : `第${state.drawRound}ドローフェーズ: 捨てる手札を選択（スキップも可）`;
    }
    if (state.phase === 'draw-player-judgment') return '審判効果: 墓地から取得カードを選択（スキップ可）。';
    if (state.phase === 'showdown-judgment-select') return '審判効果: 交換する手札を選んでから、墓地カードを選択（スキップ可）。';
    if (state.phase === 'cpu-thinking') return 'NPCが思考中...';
    if (state.phase === 'turn-ready') return 'ターンを公開します。';
    if (state.phase === 'river-ready') return 'リバーを公開します。';
    if (state.phase === 'river-opening') return 'リバー公開中...';
    if (state.phase === 'showdown') return 'ショーダウン演出中...';
    if (state.controllerPhase) return `エンジン進行: ${state.controllerPhase}`;
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
    if (card.isArcana) {
        const baseNumber = Number(card.number || 0);
        // 運命の輪は内部number=10を維持し、表示画像のみ変異先を使う。
        const visualNumber = (
            baseNumber === 10 && Number.isFinite(Number(card.effectNumber))
        ) ? Number(card.effectNumber) : baseNumber;
        return 80 + visualNumber;
    }
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
        if (typeof options.isUndealtIndex === 'function' && options.isUndealtIndex(index, card)) {
            el.classList.add('is-undealt');
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
    const fallbackCards = cards.slice(0, Math.min(5, cards.length));
    const withFallbackCards = (selected) => {
        const list = Array.isArray(selected) ? selected.filter(Boolean) : [];
        return list.length > 0 ? list : fallbackCards;
    };
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
        return appendExtraKickers(withFallbackCards(cards.slice(0, 1)));
    case 3: // one pair
        return appendExtraKickers(
            withFallbackCards(
            appendKicker(
                takeByCount(2, 1).slice(0, 2),
                Math.max(1, (Array.isArray(score.rankVector) ? score.rankVector.length : 1) - 1)
            )
            )
        );
    case 4: // two pair
        return appendExtraKickers(withFallbackCards(appendKicker(takeByCount(2, 2).slice(0, 4), 1)));
    case 5: // three card
        return appendExtraKickers(
            withFallbackCards(
            appendKicker(
                takeByCount(3, 1).slice(0, 3),
                Math.max(1, (Array.isArray(score.rankVector) ? score.rankVector.length : 1) - 1)
            )
            )
        );
    case 9: // four card
        return appendExtraKickers(withFallbackCards(takeByCount(4, 1).slice(0, 4)));
    case 8.5: { // the world (World + 4 cards sum 21, excluding court from the 4)
        const worldCard = cards.find((card) => {
            const ruleNumber = Number.isFinite(Number(card?.effectNumber))
                ? Number(card.effectNumber)
                : Number(card?.number || 0);
            return !!card?.isArcana && ruleNumber === 21;
        });
        if (!worldCard) return appendExtraKickers(withFallbackCards(cards.slice(0, 5)));
        const others = cards
            .filter((card) => card !== worldCard)
            .filter((card) => !!card?.isArcana || ![11, 12, 13, 14].includes(Number(card?.number || 0)))
            .sort(compareCardsForFlush)
            .slice(0, 4);
        return appendExtraKickers(withFallbackCards([worldCard, ...others]));
    }
    case 11: // five card
        return appendExtraKickers(withFallbackCards(takeByCount(5, 1).slice(0, 5)));
    default: // straight / flush / full house / straight flush
        return appendExtraKickers(withFallbackCards(cards.slice(0, 5)));
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
    const npcOutcomeMap = {
        cpu: ui.cpuOutcome,
        npc2: ui.npc2Outcome,
        npc3: ui.npc3Outcome
    };
    const clearNpcOutcomes = () => {
        Object.values(npcOutcomeMap).forEach((el) => setOutcomeBadge(el, null, ''));
    };
    if (state.phase !== 'showdown' || !state.result || !state.showdownRevealDone) {
        setOutcomeBadge(ui.playerOutcome, null, '');
        clearNpcOutcomes();
        return;
    }
    const winner = state.result.winner;
    const displayNpcKey = getDisplayNpcKey();
    if (winner === 'player') {
        setOutcomeBadge(ui.playerOutcome, 'is-win', '勝利');
        Object.values(npcOutcomeMap).forEach((el) => setOutcomeBadge(el, 'is-lose', '敗北'));
        return;
    }
    if (winner === 'cpu') {
        setOutcomeBadge(ui.playerOutcome, 'is-lose', '敗北');
        Object.keys(npcOutcomeMap).forEach((ownerKey) => {
            const el = npcOutcomeMap[ownerKey];
            if (!el) return;
            if (ownerKey === displayNpcKey) {
                setOutcomeBadge(el, 'is-win', '勝利');
            } else {
                setOutcomeBadge(el, 'is-lose', '敗北');
            }
        });
        return;
    }
    setOutcomeBadge(ui.playerOutcome, 'is-draw', '引き分け');
    Object.values(npcOutcomeMap).forEach((el) => setOutcomeBadge(el, 'is-draw', '引き分け'));
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
    const displayNpcKey = getDisplayNpcKey();
    const npcRoleMap = {
        cpu: ui.cpuRole,
        npc2: ui.npc2Role,
        npc3: ui.npc3Role
    };
    if (state.phase !== 'showdown' || !state.result) {
        ui.playerRole.textContent = getLiveBestRoleLabel('player');
        Object.keys(npcRoleMap).forEach((ownerKey) => {
            const el = npcRoleMap[ownerKey];
            if (!el) return;
            const name = state?.players?.[ownerKey]?.name || ownerKey.toUpperCase();
            el.textContent = `${name}: 成立役: 非公開`;
        });
        return;
    }
    if (!state.showdownRevealDone) {
        ui.playerRole.textContent = '成立役: 判定中...';
        Object.keys(npcRoleMap).forEach((ownerKey) => {
            const el = npcRoleMap[ownerKey];
            if (!el) return;
            const name = state?.players?.[ownerKey]?.name || ownerKey.toUpperCase();
            el.textContent = `${name}: 判定中...`;
        });
        return;
    }
    const winner = state.result.winner;
    const playerPrefix = winner === 'player' ? '勝利' : winner === 'cpu' ? '敗北' : '引き分け';
    const playerRole = state.result.playerBest?.rankLabel || '';
    const cpuRole = state.result.cpuBest?.rankLabel || '';
    ui.playerRole.textContent = `${playerPrefix}: ${playerRole}`;
    Object.keys(npcRoleMap).forEach((ownerKey) => {
        const el = npcRoleMap[ownerKey];
        if (!el) return;
        const name = state?.players?.[ownerKey]?.name || ownerKey.toUpperCase();
        if (ownerKey === displayNpcKey) {
            const npcPrefix = winner === 'cpu' ? '勝利' : winner === 'player' ? '敗北' : '引き分け';
            el.textContent = `${name} ${npcPrefix}: ${cpuRole}`;
            return;
        }
        const npcPrefix = winner === 'player' ? '敗北' : winner === 'draw' ? '引き分け' : '敗北';
        el.textContent = `${name} ${npcPrefix}: 非公開`;
    });
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
    try {
        showEffectOverlay('SHOWDOWN');
        await wait(140);
        const useRemainingTieBreak = !!state.result.remainingTieBreakUsed;
        const showKickerOnTie = !useRemainingTieBreak
            && shouldShowKickerForShowdown(state.result.playerBest, state.result.cpuBest);
        const displayNpcKey = getDisplayNpcKey();
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
        await revealRoleCardsOneByOne(getHandContainerByOwner(displayNpcKey), cpuCards);

        if (state.phase === 'showdown' && state.result) {
            state.showdownRevealDone = true;
        }
        render();
        await playShowdownPotPayoutEffect();
        await wait(120);
        await showShowdownResultCutin();
        render();
    } catch (error) {
        console.error('[tarotPoker] showdown presentation failed:', error);
    } finally {
        state.showdownRevealRunning = false;
        if (state.phase === 'showdown' && state.result && !state.showdownRevealDone) {
            state.showdownRevealDone = true;
        }
        render();
    }
}

function renderBoard() {
    if (!ui.board) return;
    ui.board.innerHTML = '';
    const pendingFlipSet = new Set(Array.isArray(state?.pendingBoardFlipIndices) ? state.pendingBoardFlipIndices : []);
    state.board.forEach((card, index) => {
        const cardEl = createCardElement(card, { hidden: pendingFlipSet.has(index) });
        ui.board.appendChild(cardEl);
    });
    for (let i = state.board.length; i < 5; i += 1) {
        const hiddenCard = createCardElement(createBackCardData(), { hidden: true, clickable: false });
        ui.board.appendChild(hiddenCard);
    }
}

function renderFateCardInfo() {
    if (ui.fateCard) {
        ui.fateCard.innerHTML = '';
        const fate = state?.activeFateCard || null;
        const hiddenFate = !!fate && !state?.fateRevealed;
        const fateCardEl = fate
            ? createCardElement(fate, { hidden: hiddenFate, clickable: false })
            : createCardElement(createBackCardData(), { hidden: true, clickable: false });
        ui.fateCard.appendChild(fateCardEl);
    }
    if (ui.fateEffectText) {
        if (state?.activeFateCard && !state?.fateRevealed) {
            ui.fateEffectText.textContent = '公開待ち';
        } else {
            ui.fateEffectText.innerHTML = getFateEffectSummaryHtml(state?.activeFateCard || null);
        }
    }
}

async function revealFateCardPresentation() {
    const fate = state?.activeFateCard || state?.fateCard || null;
    if (!fate) {
        state.fateRevealed = true;
        render();
        return;
    }
    state.fateRevealed = false;
    render();

    const fateEl = ui.fateCard ? ui.fateCard.querySelector('.tarot-card') : null;
    if (fateEl) {
        await animateBackToFrontOnElement(fateEl, fate);
    }
    state.fateRevealed = true;
    render();
    showEffectOverlay(`${getCardDisplayName(fate)} (${getCardNumberLabel(fate)})`);
    await wait(260);
}

function renderJudgmentPanel() {
    if (!ui.judgmentPanel || !ui.judgmentOptions) return;
    const pending = state.pendingJudgment;
    if (!pending || !Array.isArray(pending.options) || pending.options.length === 0) {
        ui.judgmentPanel.style.display = 'none';
        ui.judgmentOptions.innerHTML = '';
        return;
    }

    const isShowdownSwap = pending.mode === 'showdown-swap';
    const titleEl = ui.judgmentPanel.querySelector('.tarot-judgment-title');
    if (titleEl) {
        titleEl.textContent = isShowdownSwap
            ? '審判効果: ショーダウン前の墓地交換'
            : pending.mode === 'karma'
                ? '審判効果: 他プレイヤー墓地のカードを取得'
                : '審判効果: 墓地のカードを蘇生';
    }

    ui.judgmentPanel.style.display = 'block';
    ui.judgmentOptions.innerHTML = '';
    const hint = document.createElement('div');
    hint.className = 'tarot-judgment-hint';
    hint.textContent = isShowdownSwap
        ? '先に手札を1枚選択し、次に墓地カードを1回クリックで選択・再クリックで交換。交換しない場合はスキップ。'
        : '墓地カードを1回クリックで選択、再クリックで回収。回収しない場合はスキップ。';
    ui.judgmentOptions.appendChild(hint);
    const skipButton = document.createElement('button');
    skipButton.type = 'button';
    skipButton.textContent = isShowdownSwap ? '交換せずショーダウン' : '回収をスキップ';
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
        btn.textContent = 'ベット進行中';
        return;
    }
    if (state.phase === 'preflop') {
        btn.disabled = false;
        btn.textContent = 'フロップを開く';
        return;
    }
    if (state.phase === 'draw-player') {
        const isBusy = !!state.isResolvingPlayerDiscard;
        const canSkip = !isBusy
            && !state.awaitingPostJudgmentDiscard
            && !getControllerPendingDiscardModeForPlayer();
        btn.disabled = !canSkip;
        if (isBusy) {
            btn.textContent = 'ドロー処理中...';
        } else if (canSkip) {
            btn.textContent = '第' + state.drawRound + 'ドロー: スキップ';
        } else {
            btn.textContent = '第' + state.drawRound + 'ドロー: 手札を選択';
        }
        return;
    }
    if (isControllerPlayerDiscardPending()) {
        btn.disabled = true;
        btn.textContent = isControllerJudgmentPlayerDiscardPending()
            ? '審判効果: 捨てる手札を選択'
            : '太陽効果: 捨てる手札を選択';
        return;
    }
    if (state.phase === 'draw-player-judgment') {
        btn.disabled = true;
        btn.textContent = '墓地カードを選択';
        return;
    }
    if (state.phase === 'showdown-judgment-select') {
        btn.disabled = true;
        btn.textContent = '審判効果: 墓地交換を選択';
        return;
    }
    if (state.phase === 'cpu-thinking') {
        btn.disabled = true;
        btn.textContent = 'NPC思考中...';
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
    if (ui.cpuPointText) ui.cpuPointText.textContent = formatTestPoint(state.players?.cpu?.testPoints || 0);
    if (ui.npc2PointText) ui.npc2PointText.textContent = formatTestPoint(state.players?.npc2?.testPoints || 0);
    if (ui.npc3PointText) ui.npc3PointText.textContent = formatTestPoint(state.players?.npc3?.testPoints || 0);

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
    const isPlayerTurn = !state.betting.pendingResponseFor || state.betting.pendingResponseFor === 'player';

    if (ui.betCheckButton) {
        ui.betCheckButton.disabled = !isPlayerTurn || toCall > 0;
        ui.betCheckButton.textContent = formatBetActionButtonLabel('check');
    }
    if (ui.betCallButton) {
        ui.betCallButton.disabled = !isPlayerTurn || toCall <= 0 || point < toCall;
        ui.betCallButton.textContent = formatBetActionButtonLabel('call', formatTestPoint(toCall));
    }
    if (ui.betBetButton) {
        ui.betBetButton.disabled = !isPlayerTurn || currentBet > 0 || point < minBet;
        ui.betBetButton.textContent = formatBetActionButtonLabel('bet', formatTestPoint(minBet));
    }
    if (ui.betRaiseButton) {
        const raiseCost = toCall + minRaise;
        ui.betRaiseButton.disabled = !isPlayerTurn || currentBet <= 0 || point < raiseCost;
        ui.betRaiseButton.textContent = formatBetActionButtonLabel('raise', `+${formatTestPoint(minRaise)}`);
    }
    if (ui.betFoldButton) {
        ui.betFoldButton.disabled = !isPlayerTurn;
        ui.betFoldButton.textContent = formatBetActionButtonLabel('fold');
    }
}

function renderParticipantList() {
    if (!ui.participantList || !state) return;
    const order = getActivePlayerOrder();
    const turnKey = state?.betting?.pendingResponseFor || null;
    const displayNpcKey = getDisplayNpcKey();
    const positionLabels = state?.tablePositionLabels || {};
    ui.participantList.innerHTML = '';
    order.forEach((ownerKey) => {
        const player = state.players?.[ownerKey];
        if (!player) return;
        const chip = document.createElement('div');
        chip.className = 'tarot-participant-chip';
        chip.dataset.ownerKey = ownerKey;
        if (ownerKey === 'player') chip.classList.add('is-player');
        if (ownerKey === turnKey) chip.classList.add('is-turn');
        if (player.folded) chip.classList.add('is-folded');
        if (ownerKey !== 'player' && ownerKey === displayNpcKey) chip.classList.add('is-display');
        const betAmount = getTotalPaidAmountByOwner(ownerKey);
        const posLabel = positionLabels?.[ownerKey] ? ` ${positionLabels[ownerKey]}` : '';
        chip.textContent = `${player.name}${posLabel} B${betAmount}`;
        ui.participantList.appendChild(chip);
    });
}

function renderDrawGuide() {
    if (!ui.drawGuide || !state) return;
    const pendingFateDiscardMode = getControllerPendingDiscardModeForPlayer();
    const isFateDiscardPending = !!pendingFateDiscardMode;
    if (!isFateDiscardPending && state.phase !== 'draw-player' && state.phase !== 'draw-player-judgment' && state.phase !== 'cpu-thinking') {
        ui.drawGuide.style.display = 'none';
        ui.drawGuide.textContent = '';
        return;
    }
    if (isFateDiscardPending) {
        ui.drawGuide.textContent = pendingFateDiscardMode === 'judgment'
            ? '審判効果: 捨てる手札を1回クリックで選択、再クリックで捨てる'
            : '太陽効果: 強制ドロー済み。手札を1回クリックで選択、再クリックで捨てる';
    } else if (state.phase === 'draw-player') {
        ui.drawGuide.textContent = state.awaitingPostJudgmentDiscard
            ? ('第' + state.drawRound + 'ドロー: 審判で回収済み。手札を1回クリックで選択、再クリックで捨てる')
            : ('第' + state.drawRound + 'ドロー: 強制ドロー済み。手札を1回クリックで選択、再クリックで捨てる');
    } else if (state.phase === 'draw-player-judgment') {
        ui.drawGuide.textContent = '審判発動中: 墓地カードを1回クリックで選択、再クリックで回収（スキップ可）';
    } else {
        ui.drawGuide.textContent = 'NPCがドロー処理中...';
    }
    ui.drawGuide.style.display = 'block';
}
function render() {
    if (!state || !ui.root) return;
    renderBoard();
    renderFateCardInfo();
    const displayNpcKey = getDisplayNpcKey();
    const npcKeys = getNpcKeys();
    if (ui.npcColumnTitle) ui.npcColumnTitle.textContent = `${state.players?.cpu?.name || 'NPC1'} 手札`;
    if (ui.npcGraveTitle) ui.npcGraveTitle.textContent = `${state.players?.cpu?.name || 'NPC1'} 墓地`;
    if (ui.npc2ColumnTitle) ui.npc2ColumnTitle.textContent = `${state.players?.npc2?.name || 'NPC2'} 手札`;
    if (ui.npc2GraveTitle) ui.npc2GraveTitle.textContent = `${state.players?.npc2?.name || 'NPC2'} 墓地`;
    if (ui.npc3ColumnTitle) ui.npc3ColumnTitle.textContent = `${state.players?.npc3?.name || 'NPC3'} 手札`;
    if (ui.npc3GraveTitle) ui.npc3GraveTitle.textContent = `${state.players?.npc3?.name || 'NPC3'} 墓地`;
    const isShowdown = state.phase === 'showdown' && !!state.result;
    const useRemainingTieBreak = isShowdown && !!state.result?.remainingTieBreakUsed;
    const showKickerOnTie = isShowdown
        && !useRemainingTieBreak
        && shouldShowKickerForShowdown(state.result?.playerBest, state.result?.cpuBest);
    const isDealing = state.phase === 'fate-reveal' || state.phase === 'dealing' || !!state.initialDealAnimating;
    const dealCounts = state.initialDealDealtCounts || {};
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
    const getNpcCardsForView = (ownerKey) => {
        if (!isShowdown) return state.players?.[ownerKey]?.hand || [];
        if (ownerKey === displayNpcKey) {
            return getRoleCardsForDisplay(state.result.cpuBest, {
                includeKicker: showKickerOnTie,
                extraKickerCards: useRemainingTieBreak ? state.result.cpuRemainingCards : []
            });
        }
        return state.players?.[ownerKey]?.hand || [];
    };
    const showdownHidden = isShowdown && !state.showdownRevealDone;
    const playerHidden = showdownHidden || isDealing;
    const isFatePendingDiscard = isControllerPlayerDiscardPending();
    const isShowdownSwapSelect = !isShowdown
        && !isDealing
        && state.phase === 'showdown-judgment-select'
        && state.pendingJudgment?.mode === 'showdown-swap';
    renderCardRow(ui.playerHand, playerCardsForView, {
        hidden: playerHidden,
        hiddenByIndex: (index) => {
            if (!isDealing) return playerHidden;
            const dealt = Number(dealCounts.player || 0);
            if (index >= dealt) return true;
            const revealed = Number(state.initialDealRevealedCount || 0);
            return index >= revealed;
        },
        isUndealtIndex: (index) => {
            if (!isDealing) return false;
            const dealt = Number(dealCounts.player || 0);
            return index >= dealt;
        },
        clickable: !isShowdown && !isDealing && (state.phase === 'draw-player' || isFatePendingDiscard || isShowdownSwapSelect),
        drawPhase: !isShowdown && !isDealing && (state.phase === 'draw-player' || isFatePendingDiscard),
        isSelectedIndex: (index) => {
            if (isShowdownSwapSelect) {
                return state.selectedSwapHandIndex === index;
            }
            return !isShowdown && !isDealing && (state.phase === 'draw-player' || isFatePendingDiscard) && state.selectedDiscardIndex === index;
        },
        onCardClick: onPlayerCardClick
    });
    npcKeys.forEach((ownerKey) => {
        const handContainer = getHandContainerByOwner(ownerKey);
        if (!handContainer || !state.players?.[ownerKey]) return;
        renderCardRow(handContainer, getNpcCardsForView(ownerKey), {
            hidden: isShowdown
                ? (ownerKey === displayNpcKey ? showdownHidden : !state.showdownRevealDone)
                : true,
            hiddenByIndex: (index) => {
                if (isShowdown) {
                    if (ownerKey === displayNpcKey) return showdownHidden;
                    return !state.showdownRevealDone;
                }
                if (isDealing) return true;
                const revealIndex = Number.isFinite(state?.players?.[ownerKey]?.revealHandIndex)
                    ? Number(state.players[ownerKey].revealHandIndex)
                    : -1;
                return index !== revealIndex;
            },
            isUndealtIndex: (index) => {
                if (!isDealing) return false;
                const dealt = Number(dealCounts[ownerKey] || 0);
                return index >= dealt;
            },
            clickable: false
        });
    });
    const isJudgmentPickPhase = !isDealing
        && (state.phase === 'draw-player-judgment' || state.phase === 'showdown-judgment-select')
        && !!state.pendingJudgment
        && Array.isArray(state.pendingJudgment.options);
    const judgmentOptionsByOwner = {};
    Object.keys(state.players || {}).forEach((ownerKey) => {
        judgmentOptionsByOwner[ownerKey] = new Set();
    });
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
    npcKeys.forEach((ownerKey) => {
        const graveContainer = getGraveContainerByOwner(ownerKey);
        if (!graveContainer || !state.players?.[ownerKey]) return;
        renderGraveRow(graveContainer, isShowdown ? [] : (state.players?.[ownerKey]?.graveyard || []), {
            showAll: isJudgmentPickPhase,
            clickable: isJudgmentPickPhase,
            isCardEnabled: (card) => {
                const keySet = judgmentOptionsByOwner[ownerKey];
                return !!keySet && keySet.has(card.id);
            },
            isSelectedCard: (card) => state.selectedJudgmentPick?.ownerKey === ownerKey && state.selectedJudgmentPick?.cardId === card.id,
            onCardClick: (card) => onJudgmentGraveCardClick(ownerKey, card?.id)
        });
    });
    renderJudgmentPanel();
    renderButtons();
    renderBettingInfo();
    renderParticipantList();
    renderDrawGuide();
    renderOutcomeBadges();
    renderRoleLabels();
    if (ui.stateText) ui.stateText.textContent = getPhaseText();
    if (ui.resultText) {
        ui.resultText.textContent = getResultText();
        ui.resultText.style.display = 'none';
    }
    renderLog();
    if (isShowdown && !state.showdownRevealDone && !state.showdownRevealRunning) {
        setTimeout(() => {
            if (!state || state.phase !== 'showdown' || state.showdownRevealDone || state.showdownRevealRunning) return;
            runShowdownPresentation();
        }, 0);
    }
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
    ui.participantList = document.getElementById('tarotParticipantList');
    ui.drawGuide = document.getElementById('tarotDrawGuide');
    ui.deckAnchor = document.getElementById('tarotDeckAnchor');
    ui.fateCard = document.getElementById('tarotFateCard');
    ui.fateEffectText = document.getElementById('tarotFateEffectText');
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
    ui.npc2PointText = document.getElementById('tarotNpc2PointText');
    ui.npc3PointText = document.getElementById('tarotNpc3PointText');
    ui.betActionHint = document.getElementById('tarotBetActionHint');
    ui.betCheckButton = document.getElementById('tarotBetCheck');
    ui.betCallButton = document.getElementById('tarotBetCall');
    ui.betBetButton = document.getElementById('tarotBetBet');
    ui.betRaiseButton = document.getElementById('tarotBetRaise');
    ui.betFoldButton = document.getElementById('tarotBetFold');
    ui.playerOutcome = document.getElementById('tarotPlayerOutcome');
    ui.cpuOutcome = document.getElementById('tarotCpuOutcome');
    ui.npc2Outcome = document.getElementById('tarotNpc2Outcome');
    ui.npc3Outcome = document.getElementById('tarotNpc3Outcome');
    ui.playerRole = document.getElementById('tarotPlayerRole');
    ui.cpuRole = document.getElementById('tarotCpuRole');
    ui.npc2Role = document.getElementById('tarotNpc2Role');
    ui.npc3Role = document.getElementById('tarotNpc3Role');
    ui.playerAction = document.getElementById('tarotPlayerAction');
    ui.cpuAction = document.getElementById('tarotCpuAction');
    ui.npc2Action = document.getElementById('tarotNpc2Action');
    ui.npc3Action = document.getElementById('tarotNpc3Action');
    ui.npcColumnTitle = document.getElementById('tarotNpcColumnTitle');
    ui.npcGraveTitle = document.getElementById('tarotNpcGraveTitle');
    ui.npc2ColumnTitle = document.getElementById('tarotNpc2ColumnTitle');
    ui.npc3ColumnTitle = document.getElementById('tarotNpc3ColumnTitle');
    ui.npc2GraveTitle = document.getElementById('tarotNpc2GraveTitle');
    ui.npc3GraveTitle = document.getElementById('tarotNpc3GraveTitle');
    ui.npc2Hand = document.getElementById('tarotNpc2Hand');
    ui.npc3Hand = document.getElementById('tarotNpc3Hand');
    ui.npc2Grave = document.getElementById('tarotNpc2Grave');
    ui.npc3Grave = document.getElementById('tarotNpc3Grave');
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

export function destroyTarotPokerPage() {
    stopPotRollAnimation();

    if (ui.effectOverlay) {
        ui.effectOverlay.classList.remove('show');
        ui.effectOverlay.textContent = '';
    }
    if (ui.cutin) {
        ui.cutin.classList.remove('show');
        resetCutinStyle();
        ui.cutin.textContent = '';
    }

    if (ui.board) ui.board.innerHTML = '';
    if (ui.playerHand) ui.playerHand.innerHTML = '';
    if (ui.cpuHand) ui.cpuHand.innerHTML = '';
    if (ui.npc2Hand) ui.npc2Hand.innerHTML = '';
    if (ui.npc3Hand) ui.npc3Hand.innerHTML = '';
    if (ui.playerGrave) ui.playerGrave.innerHTML = '';
    if (ui.cpuGrave) ui.cpuGrave.innerHTML = '';
    if (ui.npc2Grave) ui.npc2Grave.innerHTML = '';
    if (ui.npc3Grave) ui.npc3Grave.innerHTML = '';
    if (ui.judgmentOptions) ui.judgmentOptions.innerHTML = '';
    if (ui.log) ui.log.innerHTML = '';

    if (ui.judgmentPanel) ui.judgmentPanel.style.display = 'none';
    if (ui.betPopup) ui.betPopup.style.display = '';
    if (ui.resultText) ui.resultText.textContent = '';
    if (ui.stateText) ui.stateText.textContent = '';
    if (ui.drawGuide) ui.drawGuide.textContent = '';
    if (ui.participantList) ui.participantList.innerHTML = '';

    if (typeof document !== 'undefined') {
        document.querySelectorAll('.tarot-coin-fx').forEach((el) => el.remove());
        const overlay = document.getElementById(DAILY_FORTUNE_OVERLAY_ID);
        if (overlay) overlay.style.display = 'none';
    }

    tarotGameController = null;
    tarotControllerLogCursor = 0;
    state = null;
}

export async function showDailyFortunePromptOnLogin(playFabId) {
    await maybeShowDailyFortunePrompt(playFabId, { force: true });
}
