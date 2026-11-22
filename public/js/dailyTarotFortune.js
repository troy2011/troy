import { renderDailyTarotArtwork, renderDailyTarotBackArtwork } from './pirateTarotArtwork.js?v=20261025-pirate-delivery-v2';
import { playDailyFortuneGrandReveal, getDailyFortuneRevealTier } from './dailyFortuneReveal.js?v=20261101-arcana-signs-v1';
import { enableTarotCardZoom, closeTarotCardViewer } from './tarotCardViewer.js?v=20261031-card-viewer-v1';
import { bindModalClose } from './modalClose.js';

const SUITS = ['Sword', 'Cup', 'Pentacle', 'Wand'];

const SUIT_THEME_COLOR = {
    Wand: '#b11818',
    Sword: '#c29b14',
    Cup: '#1e63c6',
    Pentacle: '#1e8f3c'
};

const ARCANA_FLUSH_SUIT_OPTIONS = {
    0: ['All'],
    1: ['All'],
    2: ['Cup'],
    3: ['Pentacle'],
    4: ['Wand'],
    5: ['Sword'],
    6: ['Cup'],
    7: ['Sword'],
    8: ['Wand'],
    9: ['Pentacle'],
    11: ['Sword'],
    12: ['Pentacle'],
    13: ['Cup'],
    14: ['Wand'],
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
let state = null;

const DAILY_FORTUNE_OVERLAY_ID = 'dailyTarotFortuneOverlay';
const DAILY_FORTUNE_MODAL_ID = 'dailyTarotFortuneModal';
const DAILY_FORTUNE_CARD_HOST_ID = 'dailyTarotFortuneCardHost';
const DAILY_FORTUNE_TEXT_ID = 'dailyTarotFortuneText';
const DAILY_FORTUNE_TITLE_ID = 'dailyTarotFortuneTitle';
const DAILY_FORTUNE_SUB_ID = 'dailyTarotFortuneSub';
const DAILY_FORTUNE_ARCANA_BADGE_ID = 'dailyTarotFortuneArcanaBadge';
const DAILY_FORTUNE_RESULT_META_ID = 'dailyTarotFortuneResultMeta';
const DAILY_FORTUNE_REWARD_ID = 'dailyTarotFortuneReward';
const DAILY_FORTUNE_BOUNTY_ID = 'dailyTarotFortuneBounty';
const DAILY_FORTUNE_NOTICE_ID = 'dailyTarotFortuneNotice';

let dailyFortuneCheckedSession = false;
let dailyFortuneClaimedSession = false;
let dailyFortuneCanDrawSession = false;
let dailyFortuneInFlight = false;
let dailyFortuneRetryPlayerId = '';
let dailyFortuneOverlayGeneration = 0;
let dailyFortuneOverlayDay = '';
const dailyFortuneBountyMemory = new Map();
const dailyFortuneBountyAcknowledged = new Set();
const DAILY_FORTUNE_BOUNTY_STORAGE_PREFIX = 'troy:fortune-bounty-notices:v1:';
const dailyFortunePendingDraws = new Set();

function dailyFortunePendingKey(playFabId) {
    return `troy:fortune-pending:${playFabId}`;
}

function dailyFortuneJstDay() {
    return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Display-only copy of today's result, so a second look opens without waiting for the server.
// The server claim alone decides whether a draw is allowed or a reward is granted.
function dailyFortuneResultKey(playFabId) {
    return `troy:fortune-result:v1:${playFabId}`;
}

function readStoredDailyFortuneResult(playFabId) {
    try {
        const result = JSON.parse(localStorage.getItem(dailyFortuneResultKey(playFabId)) || 'null');
        return result?.dayKey === dailyFortuneJstDay() && result.cardId ? result : null;
    } catch { return null; }
}

function storeDailyFortuneResult(playFabId, result) {
    if (!result?.dayKey || !result.cardId) return;
    try { localStorage.setItem(dailyFortuneResultKey(playFabId), JSON.stringify(result)); }
    catch { /* The result is fetched from the server next time. */ }
}

function setDailyFortunePending(playFabId, pending, key = dailyFortunePendingKey(playFabId)) {
    if (pending) dailyFortunePendingDraws.add(key);
    else dailyFortunePendingDraws.delete(key);
    try {
        if (pending) localStorage.setItem(key, '1');
        else localStorage.removeItem(key);
    } catch { /* In-memory protection is retained for this session. */ }
}

// Errors the server returns before it reserves a claim: nothing was drawn or granted,
// so the device guard can be dropped and the player may simply try again.
const DAILY_FORTUNE_NOT_STARTED_ERRORS = new Set(['FortuneTemporarilyUnavailable', 'FortuneAuthUnavailable', 'playFabId is required']);

function isDailyFortuneDrawNotStarted(error) {
    return error?.status === 401 || error?.status === 403 || DAILY_FORTUNE_NOT_STARTED_ERRORS.has(error?.message);
}

function hasDailyFortunePending(playFabId) {
    const key = dailyFortunePendingKey(playFabId);
    try { return dailyFortunePendingDraws.has(key) || localStorage.getItem(key) === '1'; }
    catch { return dailyFortunePendingDraws.has(key); }
}

const DAILY_FORTUNE_WEATHER_STATUSES = {
    10: {
        windLabel: '最高',
        verdict: '満帆にして進め。今日の海はお前さんの味方だ。'
    },
    9: {
        windLabel: '絶好',
        verdict: '獲物の船がよく見える。大砲の準備をしな。'
    },
    8: {
        windLabel: '良好',
        verdict: '悪くない波だ。今のうちに確実に距離を稼ぎな。'
    },
    7: {
        windLabel: '追い風',
        verdict: '霧の向こうに道が見えたぜ。先手を打ちにいくぞ。'
    },
    6: {
        windLabel: '安定',
        verdict: '波は穏やかだ。焦らず、船体を整えながら進め。'
    },
    5: {
        windLabel: '停滞',
        verdict: 'ジタバタ動くな。体力を減らさず、じっと舵を掴め。'
    },
    4: {
        windLabel: '不穏',
        verdict: '一寸先も見えん。見張り番を増やして武器を握っておけ。'
    },
    3: {
        windLabel: '逆風',
        verdict: 'マストが軋んでるぜ。余計な荷物は海に叩き落とせ。'
    },
    2: {
        windLabel: '荒天',
        verdict: '海に呑まれたくなければ、今はマストにしがみついていろ。'
    },
    1: {
        windLabel: '最悪',
        verdict: '船が真っ二つだな。だが、お前さんの心臓はまだ動いている。'
    }
};

const DAILY_FORTUNE_MAJOR_WEATHER_LEVELS = {
    0: { upright: 6, reversed: 4 },
    1: { upright: 9, reversed: 3 },
    2: { upright: 7, reversed: 4 },
    3: { upright: 8, reversed: 4 },
    4: { upright: 8, reversed: 3 },
    5: { upright: 8, reversed: 5 },
    6: { upright: 7, reversed: 3 },
    7: { upright: 9, reversed: 3 },
    8: { upright: 8, reversed: 4 },
    9: { upright: 6, reversed: 4 },
    10: { upright: 8, reversed: 5 },
    11: { upright: 5, reversed: 3 },
    12: { upright: 6, reversed: 3 },
    13: { upright: 3, reversed: 2 },
    14: { upright: 7, reversed: 4 },
    15: { upright: 2, reversed: 6 },
    16: { upright: 1, reversed: 2 },
    17: { upright: 8, reversed: 4 },
    18: { upright: 4, reversed: 7 },
    19: { upright: 10, reversed: 6 },
    20: { upright: 7, reversed: 3 },
    21: { upright: 10, reversed: 5 }
};

const DAILY_FORTUNE_MINOR_WEATHER_LEVELS = {
    upright: {
        1: 8,
        2: 6,
        3: 7,
        4: 6,
        5: 4,
        6: 8,
        7: 5,
        8: 8,
        9: 6,
        10: 3,
        11: 7,
        12: 8,
        13: 8,
        14: 9
    },
    reversed: {
        1: 4,
        2: 3,
        3: 3,
        4: 4,
        5: 3,
        6: 5,
        7: 3,
        8: 4,
        9: 4,
        10: 5,
        11: 4,
        12: 3,
        13: 4,
        14: 2
    }
};

const DAILY_FORTUNE_MINOR_WEATHER_EXCEPTIONS = {
    'sword-10': { upright: 1, reversed: 6 },
    'sword-3': { upright: 2, reversed: 6 },
    'sword-8': { upright: 4, reversed: 7 },
    'sword-2': { upright: 5 },
    'sword-7': { upright: 4 },
    'cup-10': { upright: 10, reversed: 4 },
    'cup-9': { upright: 8 },
    'pentacle-10': { upright: 9, reversed: 3 },
    'pentacle-9': { upright: 8 },
    'wand-6': { upright: 9 },
    'wand-7': { upright: 7 },
    'wand-8': { upright: 9 },
    'wand-10': { upright: 3, reversed: 6 },
    'sword-5': { upright: 2, reversed: 6 },
    'sword-9': { upright: 3, reversed: 6 },
    'cup-4': { upright: 4, reversed: 7 },
    'cup-7': { upright: 4, reversed: 7 },
    'pentacle-5': { upright: 3, reversed: 6 },
    'cup-5': { upright: 3, reversed: 6 }
};

function normalizeDailyFortuneWeatherLevel(level) {
    const value = Math.floor(Number(level) || 0);
    if (value < 1) return 5;
    if (value > 10) return 10;
    return value;
}

function normalizeDailyFortuneSuit(value, fallback = '') {
    const raw = `${String(value || '')} ${String(fallback || '')}`.toLowerCase();
    if (raw.includes('wand')) return 'wand';
    if (raw.includes('sword')) return 'sword';
    if (raw.includes('cup')) return 'cup';
    if (raw.includes('pentacle')) return 'pentacle';
    return 'wand';
}

function getDailyFortuneWeatherStatus(result) {
    const existing = result?.weather && typeof result.weather === 'object' ? result.weather : null;
    if (existing?.windLabel && existing?.verdict) {
        const level = normalizeDailyFortuneWeatherLevel(existing.level);
        return {
            level,
            windLabel: String(existing.windLabel || DAILY_FORTUNE_WEATHER_STATUSES[level].windLabel),
            verdict: String(existing.verdict || DAILY_FORTUNE_WEATHER_STATUSES[level].verdict)
        };
    }

    const direction = String(result?.orientation || '') === 'reversed' ? 'reversed' : 'upright';
    let level = 5;
    if (result?.isArcana) {
        level = DAILY_FORTUNE_MAJOR_WEATHER_LEVELS[Number(result?.cardNumber)]?.[direction] || 5;
    } else {
        const suit = normalizeDailyFortuneSuit(result?.suit, result?.cardId);
        const rank = Number(result?.cardNumber) || 1;
        const exceptionLevel = DAILY_FORTUNE_MINOR_WEATHER_EXCEPTIONS[`${suit}-${rank}`]?.[direction];
        level = exceptionLevel || DAILY_FORTUNE_MINOR_WEATHER_LEVELS[direction]?.[rank] || 5;
    }
    const normalizedLevel = normalizeDailyFortuneWeatherLevel(level);
    const status = DAILY_FORTUNE_WEATHER_STATUSES[normalizedLevel] || DAILY_FORTUNE_WEATHER_STATUSES[5];
    return {
        level: normalizedLevel,
        windLabel: status.windLabel,
        verdict: status.verdict
    };
}

function getDailyFortuneStrikeLine(text) {
    const sourceLines = String(text || '')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
    const captainLineIndex = sourceLines.findIndex((line) => line === '船長からの一言:');
    const contentLines = (captainLineIndex >= 0 ? sourceLines.slice(captainLineIndex + 1) : sourceLines)
        .filter((line) => !/^風向き:/.test(line))
        .filter((line) => !/^一言判定:/.test(line))
        .filter((line) => line !== '船長からの一言:');
    const sentences = contentLines
        .flatMap((line) => line.match(/[^。！？!?]+[。！？!?]?/g) || [line])
        .map((line) => line.trim())
        .filter(Boolean);
    if (sentences.length === 0) {
        return '今日は足元を整え、次の波に備えな。';
    }
    const meaningfulLine = [...sentences].reverse().find((line) => {
        const compact = line.replace(/[\s。、！？!?「」『』（）()…・]/g, '');
        return compact.length >= 14;
    });
    return meaningfulLine || sentences[sentences.length - 1];
}

function getDailyFortuneReading(result) {
    const fortune = String(result?.fortune || '').trim();
    const weather = getDailyFortuneWeatherStatus(result);
    const strikeLine = String(result?.strikeLine || '').replace(/\s*\n+\s*/g, ' ').trim()
        || getDailyFortuneStrikeLine(fortune);
    const tone = weather.level >= 8
        ? 'excellent'
        : weather.level >= 6
            ? 'favorable'
            : weather.level >= 4
                ? 'caution'
                : 'storm';
    return {
        weather,
        strikeLine,
        tone
    };
}

function renderDailyFortuneReading(result) {
    const textEl = document.getElementById(DAILY_FORTUNE_TEXT_ID);
    if (!textEl) return;
    const reading = getDailyFortuneReading(result);
    const { weather, strikeLine, tone } = reading;

    const summary = document.createElement('section');
    summary.className = 'tarot-fortune-summary';

    const summaryLabel = document.createElement('span');
    summaryLabel.className = 'tarot-fortune-section-label';
    summaryLabel.textContent = '今日の風向き';

    const summaryValue = document.createElement('div');
    summaryValue.className = 'tarot-fortune-summary-value';
    const wind = document.createElement('strong');
    wind.className = 'tarot-fortune-wind';
    wind.textContent = weather.windLabel;
    const score = document.createElement('span');
    score.className = 'tarot-fortune-score';
    score.textContent = `${weather.level} / 10`;
    summaryValue.append(wind, score);

    const meter = document.createElement('div');
    meter.className = 'tarot-fortune-meter';
    meter.setAttribute('role', 'img');
    meter.setAttribute('aria-label', `今日の運気 ${weather.level}点／10点`);
    for (let index = 1; index <= 10; index += 1) {
        const segment = document.createElement('span');
        segment.className = 'tarot-fortune-meter-segment';
        segment.classList.toggle('is-filled', index <= weather.level);
        segment.style.setProperty('--segment-index', String(index));
        segment.setAttribute('aria-hidden', 'true');
        meter.appendChild(segment);
    }
    summary.append(summaryLabel, summaryValue, meter);

    const flow = document.createElement('section');
    flow.className = 'tarot-fortune-reading-section tarot-fortune-flow';
    const flowLabel = document.createElement('span');
    flowLabel.className = 'tarot-fortune-section-label';
    flowLabel.textContent = '今日の流れ';
    const flowText = document.createElement('p');
    flowText.textContent = weather.verdict;
    flow.append(flowLabel, flowText);

    const advice = document.createElement('section');
    advice.className = 'tarot-fortune-reading-section tarot-fortune-advice';
    const adviceLabel = document.createElement('span');
    adviceLabel.className = 'tarot-fortune-section-label';
    adviceLabel.textContent = '今日のアドバイス';
    const adviceText = document.createElement('p');
    adviceText.textContent = strikeLine;
    advice.append(adviceLabel, adviceText);

    textEl.classList.add('is-result');
    textEl.dataset.fortuneTone = tone;
    textEl.replaceChildren(summary, flow, advice);
}

function buildApiUrlLocal(endpoint) {
    if (!endpoint) return '';
    if (/^https?:\/\//i.test(endpoint)) return endpoint;
    const base = String(window.API_BASE_URL || '').trim().replace(/\/$/, '');
    return base ? `${base}${endpoint}` : endpoint;
}

async function callJsonApi(endpoint, body) {
    const session = window.capturePlayerSession?.(body?.playFabId);
    const response = await fetch(buildApiUrlLocal(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        if ((response.status === 401 || response.status === 403)
            && session && window.isPlayerSessionCurrent?.(session)) {
            window.dispatchEvent(new CustomEvent('troy:auth-expired', { detail: { uid: session.uid } }));
        }
        const message = data?.error || `HTTP ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }
    return data;
}

function updateGlobalPsDisplay(balance, playFabId, session) {
    if (!Number.isFinite(Number(balance))) return;
    if (typeof window.syncAuthenticatedPoints === 'function') {
        window.syncAuthenticatedPoints(playFabId, Math.max(0, Math.floor(Number(balance))), session);
    }
}

async function refreshDailyFortuneInventory() {
    if (typeof window === 'undefined' || typeof window.refreshInventory !== 'function') return;
    const generation = dailyFortuneOverlayGeneration;
    const playerId = String(window.myPlayFabId || '');
    const session = window.capturePlayerSession?.(playerId);
    try {
        const snapshot = await window.refreshInventory({ force: true, isSilent: true });
        if (!snapshot?.hasInventoryData) throw new Error('InventoryRefreshUnavailable');
    } catch (error) {
        if (generation !== dailyFortuneOverlayGeneration
            || playerId !== String(window.myPlayFabId || '')
            || (session && !window.isPlayerSessionCurrent?.(session))) return;
        console.warn('[dailyFortune] inventory refresh failed:', error);
        showDailyFortuneRpgMessage('所持品とGを更新できませんでした。再読み込みして確認してください。');
    }
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

function createDailyFortuneCardElement(card, options = {}) {
    const {
        hidden = true,
        clickable = false,
        reversed = false,
        onReveal = null,
        onSelect = null,
        artworkLabel = ''
    } = options;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tarot-fortune-card-shell';
    if (hidden && clickable) {
        el.classList.add('is-clickable');
        el.setAttribute('aria-label', 'カードをめくる');
        el.addEventListener('click', () => {
            if (onSelect) onSelect(el);
            else revealDailyFortuneCardElement(el, card, { reversed, onReveal, artworkLabel });
        });
    } else {
        el.classList.add('is-static');
        el.disabled = true;
    }

    const art = document.createElement('div');
    art.className = 'tarot-card-art tarot-fortune-card-art';
    setArtSpriteByIndex(art, hidden ? TAROT_BACK_SPRITE_INDEX : getTarotSpriteIndex(card));
    el.appendChild(art);
    if (hidden) renderDailyTarotBackArtwork(el);

    if (!hidden) {
        el.dataset.revealed = '1';
        el.classList.add('is-revealed');
        if (reversed) el.classList.add('is-reversed');
        renderDailyTarotArtwork(card, el, { reversed, label: artworkLabel });
    }

    return el;
}

function waitDailyFortunePresentation(ms) {
    if (document.hidden) return Promise.resolve();
    return new Promise((resolve) => {
        let timer;
        const finish = () => {
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            resolve();
        };
        const onVisibilityChange = () => { if (document.hidden) finish(); };
        document.addEventListener('visibilitychange', onVisibilityChange);
        timer = setTimeout(finish, ms);
        if (document.hidden) finish();
    });
}

async function revealDailyFortuneCardElement(cardEl, card, options = {}) {
    if (!cardEl || !card) return;
    if (cardEl.dataset.revealed === '1' || cardEl.dataset.revealing === '1') return;
    const art = cardEl.querySelector('.tarot-fortune-card-art');
    if (!art) return;

    cardEl.dataset.revealing = '1';
    cardEl.disabled = true;
    cardEl.classList.add('is-revealing');
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const generation = dailyFortuneOverlayGeneration;
    const ownsOverlay = () => cardEl.isConnected
        && generation === dailyFortuneOverlayGeneration
        && cardEl.closest('.tarot-fortune-overlay')?.style.display === 'flex';
    const isStillOpen = () => ownsOverlay() && (!options.isCurrentSession || options.isCurrentSession());
    let showedFront = false;
    const showFront = () => {
        if (showedFront) return;
        showedFront = true;
        cardEl.querySelector('[data-artwork-side="back"]')?.remove();
        cardEl.classList.remove('has-pirate-artwork', 'is-flip-out');
        setArtSpriteByIndex(art, getTarotSpriteIndex(card));
        if (options.reversed) cardEl.classList.add('is-reversed');
        renderDailyTarotArtwork(card, cardEl, { reversed: options.reversed, label: options.artworkLabel });
    };
    if (!isStillOpen()) return;
    if (!reducedMotion && !document.hidden) {
        // The weather level only picks the effect strength; the card was decided by the server.
        const outcome = await playDailyFortuneGrandReveal({
            cardEl,
            host: cardEl.parentElement,
            overlay: cardEl.closest('.tarot-fortune-overlay'),
            level: options.weatherLevel,
            wait: waitDailyFortunePresentation,
            isStillOpen,
            ownsOverlay,
            flipToFront: showFront
        });
        if (outcome.aborted || !isStillOpen()) return;
    } else {
        showFront();
        if (reducedMotion) cardEl.classList.add('is-quiet-reveal');
    }
    cardEl.classList.remove('is-revealing', 'is-flip-in', 'is-clickable');
    if (card.isArcana) cardEl.classList.add('is-major-arcana');
    cardEl.classList.add('is-revealed', 'is-static');
    cardEl.dataset.revealed = '1';
    delete cardEl.dataset.revealing;
    enableTarotCardZoom(cardEl, { label: options.artworkLabel });

    if (typeof options.onReveal === 'function') {
        options.onReveal(cardEl);
    }
}

function playDailyFortuneRevealPresentation(cardEl, card, options) {
    // Presentation happens after the draw is settled; it never controls rewards.
    // A future skippable video can be contained here with an immediate fallback.
    return revealDailyFortuneCardElement(cardEl, card, options);
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
            const arcanaSuit = String(visualOptions[0] || '').toLowerCase();
            el.classList.add('arcana-suit-hybrid');
            if (arcanaSuit) el.classList.add(`arcana-suit-${arcanaSuit}`);
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
function ensureDailyFortuneOverlay() {
    let overlay = document.getElementById(DAILY_FORTUNE_OVERLAY_ID);
    if (overlay) {
        applyDailyFortuneOverlayLayout(overlay);
        return overlay;
    }

    overlay = document.createElement('div');
    overlay.id = DAILY_FORTUNE_OVERLAY_ID;
    overlay.className = 'tarot-fortune-overlay';
    overlay.innerHTML = `
        <div id="${DAILY_FORTUNE_MODAL_ID}" class="tarot-fortune-modal tarot-fortune-pirate-layout" role="dialog" aria-modal="true" aria-labelledby="${DAILY_FORTUNE_TITLE_ID}">
            <button type="button" class="tarot-fortune-close ui-modal-close" aria-label="閉じる"></button>
            <div class="tarot-fortune-kicker">DAILY TAROT</div>
            <div id="${DAILY_FORTUNE_TITLE_ID}" class="tarot-fortune-title">本日の運勢</div>
            <div id="${DAILY_FORTUNE_SUB_ID}" class="tarot-fortune-sub">1日1回だけ、今日の航路を占えます。</div>
            <div id="${DAILY_FORTUNE_ARCANA_BADGE_ID}" class="tarot-fortune-arcana-badge" hidden>MAJOR ARCANA</div>
            <div class="tarot-fortune-stage">
                <div id="${DAILY_FORTUNE_CARD_HOST_ID}" class="tarot-fortune-card-host"></div>
                <div class="tarot-fortune-reading">
                    <div id="${DAILY_FORTUNE_RESULT_META_ID}" class="tarot-fortune-result-meta" hidden></div>
                    <div id="${DAILY_FORTUNE_TEXT_ID}" class="tarot-fortune-text">運勢を読み込み中...</div>
                    <div id="${DAILY_FORTUNE_REWARD_ID}" class="tarot-fortune-reward" hidden></div>
                </div>
            </div>
            <div id="${DAILY_FORTUNE_BOUNTY_ID}" class="tarot-fortune-reward" role="status" hidden></div>
            <div id="${DAILY_FORTUNE_NOTICE_ID}" class="tarot-fortune-reward" role="status" hidden></div>
            <div class="tarot-fortune-actions">
                <button type="button" class="tarot-fortune-retry tarot-fortune-done" hidden>結果を確認</button>
                <button type="button" class="tarot-fortune-login tarot-fortune-done" hidden>再ログイン</button>
                <button type="button" class="tarot-fortune-done">閉じる</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    applyDailyFortuneOverlayLayout(overlay);
    bindModalClose(overlay.querySelector('.tarot-fortune-close'), closeDailyFortuneOverlay, {
        overlay,
        closeOnBackdrop: true,
        closeOnEscape: true,
        icon: true,
        isOpen: () => overlay.style.display === 'flex'
    });
    bindModalClose(overlay.querySelector('.tarot-fortune-done:not(.tarot-fortune-retry):not(.tarot-fortune-login)'), closeDailyFortuneOverlay);
    overlay.querySelector('.tarot-fortune-login').addEventListener('click', () => window.location.reload());
    const retry = overlay.querySelector('.tarot-fortune-retry');
    retry.addEventListener('click', async () => {
        if (retry.disabled || !dailyFortuneRetryPlayerId) return;
        retry.disabled = true;
        try { await showDailyFortune(dailyFortuneRetryPlayerId, { statusOnly: true }); }
        finally { retry.disabled = false; }
    });
    return overlay;
}

function applyDailyFortuneOverlayLayout(overlay) {
    if (!overlay) return;
    const display = overlay.style.display;
    overlay.removeAttribute('style');
    if (display) overlay.style.display = display;
    const modal = overlay.querySelector(`#${DAILY_FORTUNE_MODAL_ID}`);
    if (!modal) return;
    modal.removeAttribute('style');
}

function closeDailyFortuneOverlay() {
    const overlay = document.getElementById(DAILY_FORTUNE_OVERLAY_ID);
    const unfinished = overlay?.querySelector('.tarot-fortune-stage')?.classList.contains('has-choice');
    dailyFortuneOverlayGeneration += 1;
    closeTarotCardViewer({ immediate: true });
    overlay?.classList.remove('is-fortune-charging');
    overlay?.querySelectorAll('.tarot-fortune-fx').forEach((fx) => fx.remove());
    if (overlay) overlay.style.display = 'none';
    if (unfinished) showDailyFortuneBountyAfterClose();
    if (dailyFortuneOverlayDay && dailyFortuneOverlayDay !== dailyFortuneJstDay()) {
        window.dispatchEvent(new Event('daily-fortune:day-changed'));
    }
}

function openDailyFortuneOverlay() {
    dailyFortuneOverlayGeneration += 1;
    dailyFortuneOverlayDay = dailyFortuneJstDay();
    document.querySelector('.rpg-message-popup.daily-fortune-bounty-notice')?.remove();
    const overlay = ensureDailyFortuneOverlay();
    document.body.appendChild(overlay);
    applyDailyFortuneOverlayLayout(overlay);
    overlay.style.display = 'flex';
}

function showDailyFortuneRpgMessage(message, durationMs = 3200) {
    const text = String(message || '').trim();
    if (!text) return;
    const overlay = document.getElementById(DAILY_FORTUNE_OVERLAY_ID);
    const notice = document.getElementById(DAILY_FORTUNE_NOTICE_ID);
    if (overlay?.style.display === 'flex' && notice) {
        notice.textContent = text;
        notice.hidden = false;
        return;
    }
    if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
        window.showRpgMessage(text, durationMs);
        return;
    }
    const pointMessage = document.getElementById('pointMessage');
    if (pointMessage) pointMessage.textContent = text;
}

function renderDailyFortuneResultLegacy(result) {
    const cardHost = document.getElementById(DAILY_FORTUNE_CARD_HOST_ID);
    const textEl = document.getElementById(DAILY_FORTUNE_TEXT_ID);
    const titleEl = document.getElementById(DAILY_FORTUNE_TITLE_ID);
    if (!cardHost || !textEl || !titleEl) return;

    const card = getCardDataFromFortuneResult(result);
    const cardEl = createCardElement(card, { hidden: false, clickable: false });
    cardEl.classList.add('tarot-fortune-card');
    renderDailyTarotArtwork(card, cardEl, { label: result?.cardName || getCardDisplayName(card), reversed: result?.orientation === 'reversed' });
    enableTarotCardZoom(cardEl, { label: result?.cardName || getCardDisplayName(card) });
    if (String(result?.orientation || '') === 'reversed') {
        cardEl.classList.add('is-reversed');
    }
    cardHost.innerHTML = '';
    cardHost.appendChild(cardEl);

    titleEl.textContent = '本日の運勢';
    setDailyFortuneSubText('風向きと今日のアドバイスを確認してください。');
    setDailyFortuneMajorArcanaState(result, true);
    setDailyFortuneResultMeta(result);
    renderDailyFortuneReading(result);
    setDailyFortuneReward(result);
    setDailyFortuneBounty(result);
}

function getDailyFortuneRewardText(result) {
    const reward = Math.max(0, Math.floor(Number(result?.rewardPs || 0)));
    const goldPart = reward > 0 ? ` +${reward}G` : '';
    const rewardType = String(result?.rewardType || '').trim().toLowerCase();
    if (rewardType === 'fragment') {
        const rewardItemName = String(result?.rewardItemName || result?.cardName || 'カード').trim();
        const fragmentCount = Math.max(1, Math.floor(Number(result?.rewardFragmentCount || 1)));
        const fragmentRequired = Math.max(fragmentCount, Math.floor(Number(result?.rewardFragmentRequired || 2)));
        return `「${rewardItemName}」の欠片を1個受け取った。（${fragmentCount}/${fragmentRequired}）${goldPart}`;
    }
    if (rewardType === 'card') {
        const rewardItemName = String(result?.rewardItemName || result?.cardName || 'カード').trim();
        const skillName = String(result?.skillName || '').trim();
        const skillPart = skillName ? ` スキル:「${skillName}」` : '';
        if (result?.rewardFragmentCompleted) {
            const required = Math.max(1, Math.floor(Number(result?.rewardFragmentRequired || 2)));
            return `欠片が${required}個そろい、「${rewardItemName}」を1枚手に入れた。${goldPart}${skillPart}`;
        }
        return `「${rewardItemName}」を1枚手に入れた。${goldPart}${skillPart}`;
    }
    return reward > 0 ? `+${reward}G` : '';
}

function setDailyFortuneSubText(text) {
    const subEl = document.getElementById(DAILY_FORTUNE_SUB_ID);
    if (subEl) subEl.textContent = String(text || '');
}

function setDailyFortuneMajorArcanaState(result, active = true) {
    const modal = document.getElementById(DAILY_FORTUNE_MODAL_ID);
    const badge = document.getElementById(DAILY_FORTUNE_ARCANA_BADGE_ID);
    const isMajorArcana = !!active && !!result?.isArcana;
    if (modal) modal.classList.toggle('is-major-arcana', isMajorArcana);
    if (badge) {
        badge.hidden = !isMajorArcana;
        badge.textContent = isMajorArcana ? 'MAJOR ARCANA' : '';
    }
}

function setDailyFortuneResultMeta(result) {
    const metaEl = document.getElementById(DAILY_FORTUNE_RESULT_META_ID);
    if (!metaEl) return;
    const cardName = String(result?.cardName || '').trim();
    const orientationLabel = String(result?.orientation || '') === 'reversed' ? '逆位置' : '正位置';
    if (!cardName) {
        metaEl.hidden = true;
        metaEl.textContent = '';
        return;
    }
    metaEl.hidden = false;
    metaEl.textContent = '';
    const cardNameEl = document.createElement('span');
    cardNameEl.className = 'tarot-fortune-card-name';
    cardNameEl.textContent = cardName;
    const orientationEl = document.createElement('span');
    orientationEl.className = 'tarot-fortune-orientation';
    orientationEl.textContent = orientationLabel;
    metaEl.append(cardNameEl, orientationEl);
}

function setDailyFortuneReward(result) {
    const rewardEl = document.getElementById(DAILY_FORTUNE_REWARD_ID);
    if (!rewardEl) return;
    const rewardText = getDailyFortuneRewardText(result);
    if (!rewardText) {
        rewardEl.hidden = true;
        rewardEl.replaceChildren();
        return;
    }
    rewardEl.hidden = false;
    const label = document.createElement('span');
    label.className = 'tarot-fortune-reward-label';
    label.textContent = '今日の報酬';
    const value = document.createElement('strong');
    value.className = 'tarot-fortune-reward-value';
    value.textContent = rewardText;
    rewardEl.replaceChildren(label, value);
    const itemId = String(result?.rewardItemId || result?.cardId || '').trim();
    const rewardType = String(result?.rewardType || '').trim().toLowerCase();
    if (!itemId || (rewardType !== 'card' && rewardType !== 'fragment') || typeof window.showInventoryTarotCard !== 'function') return;
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'tarot-fortune-view-inventory';
    view.textContent = rewardType === 'fragment' ? '欠片を持ち物で見る' : '持ち物で見る';
    view.addEventListener('click', () => {
        closeDailyFortuneOverlay();
        void window.showInventoryTarotCard(itemId, { isArcana: !!result?.isArcana, fragment: rewardType === 'fragment' });
    });
    rewardEl.append(view);
}

function resetDailyFortuneResultDetails() {
    setDailyFortuneSubText('霧の中からカードを引き上げています。');
    setDailyFortuneMajorArcanaState(null, false);
    delete document.getElementById(DAILY_FORTUNE_MODAL_ID)?.dataset.fortuneTier;
    const metaEl = document.getElementById(DAILY_FORTUNE_RESULT_META_ID);
    if (metaEl) {
        metaEl.hidden = true;
        metaEl.textContent = '';
    }
    const rewardEl = document.getElementById(DAILY_FORTUNE_REWARD_ID);
    if (rewardEl) {
        rewardEl.hidden = true;
        rewardEl.replaceChildren();
    }
    const textEl = document.getElementById(DAILY_FORTUNE_TEXT_ID);
    if (textEl) {
        textEl.classList.remove('is-result');
        delete textEl.dataset.fortuneTone;
    }
    for (const id of [DAILY_FORTUNE_BOUNTY_ID, DAILY_FORTUNE_NOTICE_ID]) {
        const notice = document.getElementById(id);
        if (notice) { notice.hidden = true; notice.replaceChildren(); }
    }
    setDailyFortuneBounty(null);
}

// `pending` is the settled draw, or a promise of it: the three face-down cards carry no card data,
// so they can be shown while the server is still answering. It resolves to null when there is nothing to reveal.
function renderDailyFortuneResult(pending, options = {}) {
    const cardHost = document.getElementById(DAILY_FORTUNE_CARD_HOST_ID);
    const textEl = document.getElementById(DAILY_FORTUNE_TEXT_ID);
    const titleEl = document.getElementById(DAILY_FORTUNE_TITLE_ID);
    if (!cardHost || !textEl || !titleEl) return;
    const onRevealComplete = typeof options?.onRevealComplete === 'function'
        ? options.onRevealComplete
        : null;

    let settled = false;
    const settledResult = Promise.resolve(pending).then((value) => { settled = true; return value || null; },
        () => { settled = true; return null; });
    const playerId = String(window.myPlayFabId || '');
    const session = window.capturePlayerSession?.(playerId);
    const isCurrentSession = () => !!playerId && playerId === String(window.myPlayFabId || '')
        && !!session && window.isPlayerSessionCurrent?.(session) === true;
    const finalizeReveal = (result) => {
        titleEl.textContent = '本日の運勢';
        const modal = document.getElementById(DAILY_FORTUNE_MODAL_ID);
        if (modal) modal.dataset.fortuneTier = getDailyFortuneRevealTier(getDailyFortuneWeatherStatus(result).level);
        setDailyFortuneSubText('風向きと今日のアドバイスを確認してください。');
        if (result?.dayKey && result.dayKey !== dailyFortuneJstDay()) {
            titleEl.textContent = '日付をまたいだ占い結果';
            setDailyFortuneSubText(`${result.dayKey} の占い結果です。日付が変わりました。`);
            window.dispatchEvent(new Event('daily-fortune:day-changed'));
        }
        setDailyFortuneMajorArcanaState(result, true);
        setDailyFortuneResultMeta(result);
        renderDailyFortuneReading(result);
        setDailyFortuneReward(result);
        setDailyFortuneBounty(result);
    };

    const handleReveal = async (result) => {
        finalizeReveal(result);
        if (onRevealComplete) {
            await onRevealComplete(result);
        }
    };

    cardHost.innerHTML = '';
    cardHost.classList.add('is-choice');
    cardHost.closest('.tarot-fortune-stage')?.classList.add('has-choice');
    let selected = false;
    for (let index = 0; index < 3; index += 1) {
        const cardEl = createDailyFortuneCardElement(null, {
            hidden: true, clickable: true,
            onSelect: async (chosen) => {
                if (selected || !isCurrentSession()) return;
                selected = true;
                const generation = dailyFortuneOverlayGeneration;
                const isStillOpen = () => chosen.isConnected && generation === dailyFortuneOverlayGeneration
                    && chosen.closest('.tarot-fortune-overlay')?.style.display === 'flex'
                    && isCurrentSession();
                const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
                cardHost.querySelectorAll('.tarot-fortune-card-shell').forEach((other) => {
                    other.disabled = true;
                    if (other !== chosen) other.classList.add('is-not-selected');
                });
                chosen.classList.add('is-selected');
                cardHost.classList.add('is-selecting');
                if (!reducedMotion && !document.hidden) {
                    await waitDailyFortunePresentation(420);
                    if (!isStillOpen()) return;
                }
                const from = chosen.getBoundingClientRect();
                cardHost.querySelectorAll('.tarot-fortune-card-shell.is-not-selected').forEach((other) => other.remove());
                cardHost.classList.remove('is-choice');
                cardHost.classList.remove('is-selecting');
                if (!reducedMotion && !document.hidden) {
                    const to = chosen.getBoundingClientRect();
                    let move = null;
                    if (to.width && to.height && typeof chosen.animate === 'function') {
                        try {
                            const dx = (from.x + from.width / 2) - (to.x + to.width / 2);
                            const dy = (from.y + from.height / 2) - (to.y + to.height / 2);
                            move = chosen.animate([
                                { transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})` },
                                { transform: 'translate(0, 0) scale(1)' }
                            ], { duration: 300, easing: 'ease-out' });
                        } catch { /* The reveal remains usable without a movement animation. */ }
                    }
                    await waitDailyFortunePresentation(300);
                    if (document.hidden) move?.cancel();
                    if (!isStillOpen()) return;
                }
                if (!settled) setDailyFortuneSubText('カードをめくっています…');
                const result = await settledResult;
                if (!result || !isStillOpen()) return;
                const card = getCardDataFromFortuneResult(result);
                const isReversed = String(result?.orientation || '') === 'reversed';
                const weatherLevel = getDailyFortuneWeatherStatus(result).level;
                void playDailyFortuneRevealPresentation(chosen, card, {
                    reversed: isReversed, artworkLabel: result?.cardName || getCardDisplayName(card), weatherLevel, isCurrentSession,
                    onReveal: () => {
                        const stage = cardHost.closest('.tarot-fortune-stage');
                        stage?.classList.remove('has-choice');
                        stage?.classList.add('is-result-entering');
                        void handleReveal(result);
                    }
                });
            }
        });
        cardEl.setAttribute('aria-label', `カード${index + 1}を選ぶ`);
        cardHost.appendChild(cardEl);
    }
    titleEl.textContent = '本日の運勢';
    resetDailyFortuneResultDetails();
    setDailyFortuneSubText('カードを1枚選ぶ');
    textEl.textContent = '';
}

function normalizeDailyBountyReward(rawReward) {
    const reward = rawReward && typeof rawReward === 'object' ? rawReward : {};
    const items = Array.isArray(reward.items)
        ? reward.items
            .map((item) => {
                const itemId = String(item?.itemId || item?.ItemId || '').trim();
                if (!itemId) return null;
                const amount = Math.max(1, Math.floor(Number(item?.amount || item?.Amount || 1) || 1));
                return { itemId, amount };
            })
            .filter(Boolean)
        : [];
    const rank = Number(reward.rank || 0);
    const pulls = Math.max(items.length, Math.floor(Number(reward.pulls || 0) || 0));
    return {
        awarded: !!reward.awarded && items.length > 0,
        alreadyClaimed: !!reward.alreadyClaimed,
        eligible: !!reward.eligible,
        rewardDayKey: String(reward.rewardDayKey || '').trim(),
        rank: Number.isFinite(rank) && rank > 0 ? rank : null,
        pulls,
        items
    };
}

function setDailyFortuneBounty(result) {
    const el = document.getElementById(DAILY_FORTUNE_BOUNTY_ID);
    if (!el) return;
    const playerId = String(window.myPlayFabId || '');
    const notices = loadDailyFortuneBountyNotices(playerId);
    if (!notices.length) {
        el.hidden = true;
        el.replaceChildren();
        return;
    }
    el.replaceChildren();
    for (const notice of notices) {
        const reward = notice.reward;
        const rank = reward.rank ? `第${reward.rank}位` : '順位';
        const dayLabel = reward.rewardDayKey ? `${reward.rewardDayKey}集計 ` : '';
        const label = document.createElement('span');
        label.className = 'tarot-fortune-reward-label';
        label.textContent = `${dayLabel}${rank}報酬`;
        const value = document.createElement('strong');
        value.className = 'tarot-fortune-reward-value';
        value.textContent = formatDailyFortuneBountyItems(reward.items);
        el.append(label, value);
    }
    const acknowledge = document.createElement('button');
    acknowledge.type = 'button';
    acknowledge.className = 'tarot-fortune-done';
    acknowledge.textContent = '確認';
    acknowledge.addEventListener('click', () => {
        if (!isCurrentFortuneBountyPlayer(playerId)) return;
        for (const notice of notices) {
            dailyFortuneBountyAcknowledged.add(notice.key);
            dailyFortuneBountyMemory.delete(notice.key);
            try {
                localStorage.setItem(`${notice.key}:seen`, '1');
                localStorage.removeItem(notice.key);
            } catch { /* Keep the acknowledgement in memory when storage fails. */ }
        }
        setDailyFortuneBounty(result);
    }, { once: true });
    el.append(acknowledge);
    el.hidden = false;
}

function isCurrentFortuneBountyPlayer(playerId) {
    if (!playerId || playerId !== String(window.myPlayFabId || '')) return false;
    const session = window.capturePlayerSession?.(playerId);
    return !!session && window.isPlayerSessionCurrent?.(session) === true;
}

function loadDailyFortuneBountyNotices(playerId) {
    if (!isCurrentFortuneBountyPlayer(playerId)) return [];
    const prefix = `${DAILY_FORTUNE_BOUNTY_STORAGE_PREFIX}${encodeURIComponent(playerId)}:`;
    const notices = new Map();
    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key?.startsWith(prefix) || key.endsWith(':seen') || dailyFortuneBountyAcknowledged.has(key)
                || localStorage.getItem(`${key}:seen`)) continue;
            const raw = localStorage.getItem(key);
            if (!raw || raw.length > 100000) continue;
            try {
                const stored = JSON.parse(raw);
                if (stored.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(stored.day || '')
                    || !Array.isArray(stored.reward?.items) || !stored.reward.items.length
                    || !stored.reward.items.every((item) => typeof item.itemId === 'string'
                        && item.itemId.length > 0 && item.itemId.length <= 256
                        && Number.isSafeInteger(item.amount) && item.amount > 0)) continue;
                notices.set(key, { key, day: stored.day, reward: normalizeDailyBountyReward(stored.reward) });
            } catch { /* Ignore corrupt display-only data. */ }
        }
    } catch { /* In-memory notices remain available for this session. */ }
    for (const [key, entry] of dailyFortuneBountyMemory) {
        if (!key.startsWith(prefix) || dailyFortuneBountyAcknowledged.has(key)) continue;
        try { if (localStorage.getItem(`${key}:seen`)) continue; } catch { /* Memory fallback. */ }
        notices.set(key, entry);
    }
    return [...notices.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function queueDailyFortuneBounty(playFabId, day, reward) {
    const playerId = String(playFabId || '');
    if (!isCurrentFortuneBountyPlayer(playerId)) return;
    const identity = JSON.stringify([day, reward.rewardDayKey, reward.rank, reward.items]);
    const key = `${DAILY_FORTUNE_BOUNTY_STORAGE_PREFIX}${encodeURIComponent(playerId)}:${encodeURIComponent(identity)}`;
    if (dailyFortuneBountyAcknowledged.has(key)) return;
    const entry = { key, day, reward };
    try {
        if (localStorage.getItem(`${key}:seen`)) return;
        localStorage.setItem(key, JSON.stringify({ version: 1, day, reward }));
    } catch { dailyFortuneBountyMemory.set(key, entry); }
}

function formatDailyFortuneBountyItems(items) {
    return items.map((item) => {
        const name = String(window.getInventoryItemDisplayName?.(item.itemId) || '').trim() || '報酬アイテム';
        return `${name}${item.amount > 1 ? ` x${item.amount}` : ''}`;
    }).join(' / ');
}

function showDailyFortuneBountyAfterClose() {
    const notices = loadDailyFortuneBountyNotices(String(window.myPlayFabId || ''));
    if (!notices.length || typeof window.showRpgMessage !== 'function') return;
    const lines = notices.map(({reward}) => {
        const rank = reward.rank ? `第${reward.rank}位` : '順位';
        const items = formatDailyFortuneBountyItems(reward.items);
        const dayLabel = reward.rewardDayKey ? `${reward.rewardDayKey}集計 ` : '';
        return `${dayLabel}${rank}報酬: ${items}`;
    });
    window.showRpgMessage(lines.join('\n'), 3200);
    document.querySelector('.rpg-message-popup')?.classList.add('daily-fortune-bounty-notice');
}

async function requestDailyFortuneStatus(playFabId) {
    return callJsonApi('/api/tarot-fortune-status', { playFabId });
}

async function requestDailyFortuneDraw(playFabId) {
    return callJsonApi('/api/tarot-fortune-draw', { playFabId });
}

function notifyDailyFortuneClaimed(result = null, dayKey = '') {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    const confirmedDayKey = String(result?.dayKey || dayKey || '').trim();
    window.dispatchEvent(new CustomEvent('daily-fortune:claimed', {
        detail: { dayKey: confirmedDayKey }
    }));
}

async function handleDailyFortuneDraw(playFabId) {
    if (!playFabId || dailyFortuneInFlight) return;
    if (hasDailyFortunePending(playFabId)) {
        showDailyFortunePending();
        return;
    }
    dailyFortuneInFlight = true;
    const generation = dailyFortuneOverlayGeneration;
    const balanceSession = window.capturePlayerSession?.(playFabId);
    const textEl = document.getElementById(DAILY_FORTUNE_TEXT_ID);
    // The choice is cosmetic, so the cards are offered at once and the draw is sent behind them.
    let settleChoice = () => {};
    const clearChoice = () => {
        settleChoice(null);
        if (generation !== dailyFortuneOverlayGeneration) return;
        const cardHost = document.getElementById(DAILY_FORTUNE_CARD_HOST_ID);
        if (!cardHost) return;
        cardHost.innerHTML = '';
        cardHost.classList.remove('is-choice', 'is-selecting');
        cardHost.closest('.tarot-fortune-stage')?.classList.remove('has-choice');
    };
    try {
        resetDailyFortuneResultDetails();
        if (document.getElementById(DAILY_FORTUNE_OVERLAY_ID)?.style.display === 'flex') {
            renderDailyFortuneResult(new Promise((resolve) => { settleChoice = resolve; }));
        } else if (textEl) textEl.textContent = '運勢を読み込み中...';
        const pendingKey = dailyFortunePendingKey(playFabId);
        setDailyFortunePending(playFabId, true, pendingKey);
        const data = await requestDailyFortuneDraw(playFabId);
        let showBountyAfterRefresh = false;
        if (balanceSession && !window.isPlayerSessionCurrent?.(balanceSession)) { clearChoice(); return; }
        if (!data?.result) throw new Error('ResultUnavailable');
        setDailyFortunePending(playFabId, false, pendingKey);
        storeDailyFortuneResult(playFabId, data.result);
        const canShowResult = generation === dailyFortuneOverlayGeneration
            && document.getElementById(DAILY_FORTUNE_OVERLAY_ID)?.style.display === 'flex';
        if (data?.result) {
            const reward = normalizeDailyBountyReward(data?.dailyBountyReward || null);
            const hasBountyReward = reward.awarded;
            if (hasBountyReward) queueDailyFortuneBounty(playFabId, String(data.result.dayKey || dailyFortuneJstDay()), reward);
            showBountyAfterRefresh = hasBountyReward && !canShowResult
                && document.getElementById(DAILY_FORTUNE_OVERLAY_ID)?.style.display !== 'flex';
            if (!data.alreadyClaimed) {
                const newItems = reward.items.map((item) => item.itemId);
                if (data.result.rewardCardGranted && data.result.rewardItemId) newItems.unshift(data.result.rewardItemId);
                window.markInventoryItemsAsNew?.(newItems);
            }
            const isPreviousDay = data.result.dayKey && data.result.dayKey !== dailyFortuneJstDay();
            if (canShowResult && (data.alreadyClaimed || isPreviousDay)) {
                clearChoice();
                document.getElementById(DAILY_FORTUNE_MODAL_ID)?.classList.add('is-revisit');
                renderDailyFortuneResultLegacy(data.result);
                if (isPreviousDay && document.getElementById(DAILY_FORTUNE_TITLE_ID)) {
                    document.getElementById(DAILY_FORTUNE_TITLE_ID).textContent = '日付をまたいだ占い結果';
                }
                setDailyFortuneSubText(isPreviousDay ? `${data.result.dayKey} の占い結果です。日付が変わりました。` : '本日の占い結果です。');
            } else {
                settleChoice(canShowResult ? data.result : null);
            }
            dailyFortuneClaimedSession = true;
            dailyFortuneCanDrawSession = false;
            notifyDailyFortuneClaimed(data.result);
        }
        if (Number.isFinite(Number(data?.balance))) {
            updateGlobalPsDisplay(Number(data.balance), playFabId, balanceSession);
        }
        if (canShowResult && textEl && !data?.result?.fortune) {
            textEl.textContent = '本日の占い結果を取得しました。';
        }
        const reward = normalizeDailyBountyReward(data?.dailyBountyReward || null);
        const shouldRefreshInventory = data.alreadyClaimed || !Number.isFinite(data.balance)
            || String(data?.result?.rewardType || '').trim().toLowerCase() === 'card'
            || (reward.awarded && !reward.alreadyClaimed);
        if (shouldRefreshInventory) await refreshDailyFortuneInventory();
        if (showBountyAfterRefresh) showDailyFortuneBountyAfterClose();
        else if (reward.awarded && generation === dailyFortuneOverlayGeneration
            && document.getElementById(DAILY_FORTUNE_OVERLAY_ID)?.style.display === 'flex') {
            // Item names come from the refreshed inventory.
            setDailyFortuneBounty(data.result);
        }
    } catch (error) {
        clearChoice();
        if (balanceSession && !window.isPlayerSessionCurrent?.(balanceSession)) return;
        const notStarted = isDailyFortuneDrawNotStarted(error);
        if (notStarted) setDailyFortunePending(playFabId, false);
        if (generation === dailyFortuneOverlayGeneration
            && document.getElementById(DAILY_FORTUNE_OVERLAY_ID)?.style.display === 'flex'
            && !showDailyFortuneAuthError(error)) {
            if (notStarted) showDailyFortuneNotStarted();
            else showDailyFortunePending();
        }
    } finally {
        dailyFortuneInFlight = false;
    }
}

function setupDailyFortuneOverlay(playFabId) {
    openDailyFortuneOverlay();
    const cardHost = document.getElementById(DAILY_FORTUNE_CARD_HOST_ID);
    const textEl = document.getElementById(DAILY_FORTUNE_TEXT_ID);
    const titleEl = document.getElementById(DAILY_FORTUNE_TITLE_ID);

    if (titleEl) titleEl.textContent = '本日の運勢';
    if (cardHost) cardHost.innerHTML = '';
    resetDailyFortuneResultDetails();
    if (textEl) textEl.textContent = '';
    return handleDailyFortuneDraw(playFabId);
}

async function maybeShowDailyFortunePrompt(playFabId, options = {}) {
    if (!playFabId) return;
    const session = window.capturePlayerSession?.(playFabId);
    const force = !!options.force;
    if (dailyFortuneClaimedSession) return;
    if (dailyFortuneCheckedSession && !force) {
        if (dailyFortuneCanDrawSession) {
            await setupDailyFortuneOverlay(playFabId);
        }
        return;
    }
    try {
        const status = await requestDailyFortuneStatus(playFabId);
        if (session && !window.isPlayerSessionCurrent?.(session)) return;
        if (status?.state === 'pending') {
            dailyFortuneRetryPlayerId = playFabId;
            openDailyFortuneOverlay();
            showDailyFortunePending();
            return;
        }
        dailyFortuneCheckedSession = true;
        dailyFortuneCanDrawSession = !!status?.canDraw;
        dailyFortuneClaimedSession = !dailyFortuneCanDrawSession;
        if (!dailyFortuneCanDrawSession) {
            notifyDailyFortuneClaimed(status?.result, status?.dayKey);
            return;
        }
        setDailyFortunePending(playFabId, false);
        await setupDailyFortuneOverlay(playFabId);
    } catch (error) {
        console.warn('[dailyFortune] status check failed:', error);
    }
}

export async function showDailyFortunePromptOnLogin(playFabId) {
    await maybeShowDailyFortunePrompt(playFabId, { force: true });
}

function showDailyFortunePending() {
    setDailyFortuneSubText('占いの結果を確認しています。');
    const textEl = document.getElementById(DAILY_FORTUNE_TEXT_ID);
    if (textEl) textEl.textContent = '処理状況が不明です。時間をおいて「結果を確認」を押し、解消しない場合はお問い合わせください。';
    const retry = document.querySelector(`#${DAILY_FORTUNE_OVERLAY_ID} .tarot-fortune-retry`);
    if (retry) retry.hidden = false;
}

function showDailyFortuneNotStarted() {
    setDailyFortuneSubText('占いを始められませんでした。');
    const textEl = document.getElementById(DAILY_FORTUNE_TEXT_ID);
    if (textEl) textEl.textContent = 'まだ占いは行われていません。少し時間をおいて、もう一度「占い」を押してください。';
    const retry = document.querySelector(`#${DAILY_FORTUNE_OVERLAY_ID} .tarot-fortune-retry`);
    if (retry) retry.hidden = true;
}

function showDailyFortuneAuthError(error) {
    if (error?.status !== 401 && error?.status !== 403) return false;
    setDailyFortuneSubText('ログイン状態を確認できませんでした。');
    const textEl = document.getElementById(DAILY_FORTUNE_TEXT_ID);
    if (textEl) textEl.textContent = '再ログインして、今日の結果を確認してください。';
    const overlay = document.getElementById(DAILY_FORTUNE_OVERLAY_ID);
    const retry = overlay?.querySelector('.tarot-fortune-retry');
    const login = overlay?.querySelector('.tarot-fortune-login');
    if (retry) retry.hidden = true;
    if (login) login.hidden = false;
    return true;
}

export async function showDailyFortune(playFabId, options = {}) {
    if (!playFabId) return;
    const session = window.capturePlayerSession?.(playFabId);
    dailyFortuneRetryPlayerId = playFabId;
    openDailyFortuneOverlay();
    const generation = dailyFortuneOverlayGeneration;
    const cardHost = document.getElementById(DAILY_FORTUNE_CARD_HOST_ID);
    const textEl = document.getElementById(DAILY_FORTUNE_TEXT_ID);
    const titleEl = document.getElementById(DAILY_FORTUNE_TITLE_ID);
    document.getElementById(DAILY_FORTUNE_MODAL_ID)?.classList.remove('is-revisit');
    const retry = document.querySelector(`#${DAILY_FORTUNE_OVERLAY_ID} .tarot-fortune-retry`);
    if (retry) retry.hidden = true;
    const login = document.querySelector(`#${DAILY_FORTUNE_OVERLAY_ID} .tarot-fortune-login`);
    if (login) login.hidden = true;
    cardHost?.classList.remove('is-choice');
    cardHost?.closest('.tarot-fortune-stage')?.classList.remove('has-choice');
    cardHost?.closest('.tarot-fortune-stage')?.classList.remove('is-result-entering');
    if (titleEl) titleEl.textContent = '本日の運勢';
    if (cardHost) cardHost.innerHTML = '';
    resetDailyFortuneResultDetails();
    setDailyFortuneSubText('今日の潮目を確かめています。');
    if (textEl) textEl.textContent = '運勢を読み込み中...';

    const hasPending = hasDailyFortunePending(playFabId);
    const stored = hasPending ? null : readStoredDailyFortuneResult(playFabId);
    if (stored) {
        notifyDailyFortuneClaimed(stored);
        document.getElementById(DAILY_FORTUNE_MODAL_ID)?.classList.add('is-revisit');
        renderDailyFortuneResultLegacy(stored);
        setDailyFortuneSubText('本日の占い結果です。');
        await refreshDailyFortuneInventory();
        if (generation === dailyFortuneOverlayGeneration) setDailyFortuneBounty(stored);
        return;
    }
    if (options.knownCanDraw && !hasPending) {
        // The home screen already asked the server today; the draw itself answers with the stored result if that has changed.
        dailyFortuneCheckedSession = true;
        dailyFortuneCanDrawSession = true;
        await setupDailyFortuneOverlay(playFabId);
        return;
    }

    try {
        const status = await requestDailyFortuneStatus(playFabId);
        if (session && !window.isPlayerSessionCurrent?.(session)) return;
        if (generation !== dailyFortuneOverlayGeneration) return;
        if (status?.state === 'pending') {
            showDailyFortunePending();
            return;
        }
        dailyFortuneCheckedSession = true;
        dailyFortuneCanDrawSession = !!status?.canDraw;
        dailyFortuneClaimedSession = !dailyFortuneCanDrawSession;
        if (dailyFortuneCanDrawSession) {
            // The server ledger is the source of truth: canDraw means no claim exists,
            // so a flag left on this device by a failed request is stale.
            setDailyFortunePending(playFabId, false);
            if (options.statusOnly) {
                setDailyFortuneSubText('本日はまだ占っていません。');
                if (textEl) textEl.textContent = '閉じてから「占い」を押すと、今日のカードを引けます。';
                return;
            }
            await setupDailyFortuneOverlay(playFabId);
            return;
        }
        setDailyFortunePending(playFabId, false);
        notifyDailyFortuneClaimed(status?.result, status?.dayKey);
        if (status?.result) {
            storeDailyFortuneResult(playFabId, status.result);
            document.getElementById(DAILY_FORTUNE_MODAL_ID)?.classList.add('is-revisit');
            renderDailyFortuneResultLegacy(status.result);
            setDailyFortuneSubText('本日の占い結果です。');
            const revisitGeneration = dailyFortuneOverlayGeneration;
            await refreshDailyFortuneInventory();
            if (revisitGeneration === dailyFortuneOverlayGeneration) setDailyFortuneBounty(status.result);
            return;
        }
        setDailyFortuneSubText('本日の占いは完了しています。');
        if (textEl) textEl.textContent = 'また明日、次の潮目を占えます。';
    } catch (error) {
        if (session && !window.isPlayerSessionCurrent?.(session)) return;
        if (generation !== dailyFortuneOverlayGeneration) return;
        if (!showDailyFortuneAuthError(error)) {
            setDailyFortuneSubText('占いを開けませんでした。航路を確認してください。');
            if (textEl) {
                textEl.textContent = '通信を確認して「結果を確認」を押してください。';
            }
            if (retry) retry.hidden = false;
        }
        console.warn('[dailyFortune] explicit open failed:', error);
    }
}
