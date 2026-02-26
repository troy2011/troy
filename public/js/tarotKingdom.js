import { ref, get, set, push, remove, onValue, onChildAdded, onDisconnect, serverTimestamp } from 'firebase/database';

const TAROT_SPRITE_SRC = 'Sprites/Buildings/tarot.png';
const TAROT_TILE_W = 48;
const TAROT_TILE_H = 80;
const TAROT_SHEET_W = 512;
const TAROT_BACK_INDEX = 110;

const SUITS = ['Wand', 'Cup', 'Sword', 'Pentacle'];
const GRAVE_RANK_ORDER = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 1];
const GRAVE_RANK_LABEL = { 1: 'A', 11: 'P', 12: 'N', 13: 'Q', 14: 'K' };
const SUIT_LABEL = { Wand: 'ワンド', Cup: 'カップ', Sword: 'ソード', Pentacle: 'ペンタクル', None: '無' };
const SUIT_TIER = { Wand: 2, Cup: 2, Sword: 1, Pentacle: 1, None: 0 };
const SUIT_MASK = { None: 0, Wand: 1, Cup: 2, Sword: 4, Pentacle: 8, All: 15 };
const SUIT_PAIR_MASK_A = SUIT_MASK.Wand | SUIT_MASK.Cup;
const SUIT_PAIR_MASK_B = SUIT_MASK.Sword | SUIT_MASK.Pentacle;
const SUIT_COLOR = { Wand: '#b11818', Sword: '#c29b14', Cup: '#1e63c6', Pentacle: '#1e8f3c' };
const SPECIAL_SUIT = { 16: 'Sword', 17: 'Cup', 18: 'Pentacle', 19: 'Wand' };
const ARCANA_NAME = {
  0: '愚者', 1: '魔術師', 2: '女教皇', 3: '女帝', 4: '皇帝', 5: '法王', 6: '恋人', 7: '戦車', 8: '力', 9: '隠者',
  10: '運命の輪', 11: '正義', 12: '吊るされた男', 13: '死神', 14: '節制', 15: '悪魔', 16: '塔', 17: '星', 18: '月', 19: '太陽', 20: '審判', 21: '世界'
};

const PLAYERS = [
  { id: 'you', name: 'あなた', isNpc: false },
  { id: 'npc1', name: 'NPC1', isNpc: true },
  { id: 'npc2', name: 'NPC2', isNpc: true },
  { id: 'npc3', name: 'NPC3', isNpc: true }
];

const START_HAND = 10;
const TOTAL_HANDS = 4;
const START_CHIPS = 100;
const GAMEOVER_CHIPS_THRESHOLD = 0;
const A_PENALTY = 1;
const NPC_DELAY = 1100;
const ROUND_START_CINEMATIC_MS = 980;
const ROUND_OUT_CINEMATIC_MS = 1080;
const GAME_FINAL_CINEMATIC_MS = 1900;
const ORACLE_FLIP_TOTAL_MS = 620;
const PRESENCE_AWAY_GRACE_MS = 30000;
const OPENING_HAND_FLIP_START_DELAY_MS = 90;
const OPENING_HAND_FLIP_MS = 170;
const OPENING_HAND_FLIP_GAP_MS = 45;

const ROLE_ORDER = ['Straight', 'Flush', 'FullHouse', 'FourKind', 'TheWorld', 'StraightFlush', 'FiveKind'];
const ROLE_LABEL = {
  Straight: 'ストレート',
  Flush: 'フラッシュ',
  FullHouse: 'フルハウス',
  FourKind: 'フォーカード',
  TheWorld: 'ザ・ワールド',
  StraightFlush: 'ストレートフラッシュ',
  FiveKind: 'ファイブカード'
};
const ROLE_RATE = { Straight: 1, Flush: 1, FullHouse: 2, FourKind: 3, TheWorld: 3, StraightFlush: 4, FiveKind: 5 };
const ROLE_ST = ROLE_ORDER.reduce((a, k, i) => ((a[k] = i + 1), a), {});
const KINGDOM_NET_SCHEMA_VERSION = 1;
const KINGDOM_NET_STATE_WRITE_DELAY = 90;
const TK_MATCH_ROOT = 'tarotKingdomMatch';
const TK_FALLBACK_AUTO_ROOM_COUNT = 6;

const ui = {};
let s = null;
let bound = false;
let npcTimer = null;
let trickRenderKey = '';
let trickRenderToken = 0;
let trickSwapTimer = null;
let stateErrorTimer = null;
let kingdomCutinTimer = null;
let kingdomOverlayTimer = null;
let oracleRevealDelayTimer = null;
let oracleFlipSwapTimer = null;
let oracleFlipEndTimer = null;
let hiddenOracleRevealDelayTimer = null;
let hiddenOracleFlipSwapTimer = null;
let hiddenOracleFlipEndTimer = null;
let callCinematicTimer = null;
let roundStartCinematicTimer = null;
let roundOutCinematicTimer = null;
let openingDealStartTimer = null;
let openingDealFlipTimer = null;
let openingDealNextTimer = null;
let humanTurnBadgeTimer = null;
let lastHumanTurnActive = false;
let npcScheduleToken = 0;
let npcActInFlight = false;
let settlementGainEventTimers = [];
let settlementGainAnimTimer = null;
let settlementGainQueue = [];
let settlementGainAnimating = false;
const HAND_SORT_MODE = { SUIT: 'suit', VALUE: 'value' };
let localHandSortMode = HAND_SORT_MODE.VALUE;
const KINGDOM_TRACE_ENABLED = true;
let kingdomTraceFlowSeed = 0;
const kingdomRowFxTimers = new Map();
let netActionHostUnsub = null;
let netStateUnsub = null;
let netPresenceUnsub = null;
let netHostUidUnsub = null;
let netOpenRoomsUnsub = null;
let netActionWriteTimer = null;
let netLastStateHash = '';
let netBootPromise = null;
const netHandledActionKeys = new Set();
let netPresenceByUid = {};
let netOpenRoomsCache = {};
let netOpenRoomIndexEnabled = true;
const presenceGraceBySeat = Array.from({ length: 4 }, () => ({ uid: null, name: '', until: 0 }));
const tkNet = {
  enabled: false,
  roomId: '',
  roomPath: '',
  db: null,
  uid: '',
  localSeat: -1,
  isHost: false,
  hostUid: '',
  localPlayerName: '',
  presenceRef: null
};

function traceKingdomFlow(step, details = '') {
  if (!KINGDOM_TRACE_ENABLED) return;
  const flowId = s ? Number(s._traceFlowId || 0) : 0;
  const phase = s?.phase ?? 'no-state';
  const turn = s?.turn ?? '-';
  const trick = s?.trick ? `${s.trick.type}:${s.trick.owner}:${s.trick.count ?? '-'}` : 'null';
  const pendingDraw = s?.pendingDraw ?? '-';
  const pendingJudgment = s?.pendingJudgment ?? '-';
  const leadOwner = s?.leadRequiredOwner ?? '-';
  const suffix = details ? ` | ${details}` : '';
  const line = `[TK-TRACE#${flowId}] ${step} | phase=${phase} turn=${turn} trick=${trick} pd=${pendingDraw} pj=${pendingJudgment} lead=${leadOwner}${suffix}`;
  try {
    console.debug(line);
  } catch (_) {
    // no-op
  }
}

const clearNpcTimer = () => {
  if (npcTimer) {
    clearTimeout(npcTimer);
    npcTimer = null;
  }
  npcScheduleToken += 1;
};

const scheduleNpcTimer = (delayMs, fn) => {
  clearNpcTimer();
  const token = npcScheduleToken;
  npcTimer = setTimeout(() => {
    if (token !== npcScheduleToken) return;
    npcTimer = null;
    fn?.();
  }, Math.max(0, Number(delayMs) || 0));
};

const clearCallCinematicTimer = () => {
  if (callCinematicTimer) {
    clearTimeout(callCinematicTimer);
    callCinematicTimer = null;
  }
};
const clearRoundStartCinematicTimer = () => {
  if (roundStartCinematicTimer) {
    clearTimeout(roundStartCinematicTimer);
    roundStartCinematicTimer = null;
  }
};
const clearRoundOutCinematicTimer = () => {
  if (roundOutCinematicTimer) {
    clearTimeout(roundOutCinematicTimer);
    roundOutCinematicTimer = null;
  }
};
const clearOpeningDealTimers = () => {
  if (openingDealStartTimer) {
    clearTimeout(openingDealStartTimer);
    openingDealStartTimer = null;
  }
  if (openingDealFlipTimer) {
    clearTimeout(openingDealFlipTimer);
    openingDealFlipTimer = null;
  }
  if (openingDealNextTimer) {
    clearTimeout(openingDealNextTimer);
    openingDealNextTimer = null;
  }
};
const clearOracleFlipTimers = () => {
  if (oracleRevealDelayTimer) { clearTimeout(oracleRevealDelayTimer); oracleRevealDelayTimer = null; }
  if (oracleFlipSwapTimer) { clearTimeout(oracleFlipSwapTimer); oracleFlipSwapTimer = null; }
  if (oracleFlipEndTimer) { clearTimeout(oracleFlipEndTimer); oracleFlipEndTimer = null; }
  if (hiddenOracleRevealDelayTimer) { clearTimeout(hiddenOracleRevealDelayTimer); hiddenOracleRevealDelayTimer = null; }
  if (hiddenOracleFlipSwapTimer) { clearTimeout(hiddenOracleFlipSwapTimer); hiddenOracleFlipSwapTimer = null; }
  if (hiddenOracleFlipEndTimer) { clearTimeout(hiddenOracleFlipEndTimer); hiddenOracleFlipEndTimer = null; }
  ui.oracleCardWrap?.classList.remove('is-flipping');
  ui.hiddenOracleCardWrap?.classList.remove('is-flipping');
};
const clearSettlementGainFx = () => {
  settlementGainEventTimers.forEach((timerId) => clearTimeout(timerId));
  settlementGainEventTimers = [];
  if (settlementGainAnimTimer) {
    clearTimeout(settlementGainAnimTimer);
    settlementGainAnimTimer = null;
  }
  settlementGainQueue = [];
  settlementGainAnimating = false;
};
function queueSettlementGain(amount) {
  const gain = Math.max(0, Math.floor(Number(amount) || 0));
  if (gain <= 0) return;
  settlementGainQueue.push(gain);
  if (settlementGainAnimating) return;
  const runNext = () => {
    if (!s?.roundSettlement) {
      settlementGainAnimating = false;
      settlementGainAnimTimer = null;
      settlementGainQueue = [];
      return;
    }
    if (!settlementGainQueue.length) {
      settlementGainAnimating = false;
      settlementGainAnimTimer = null;
      return;
    }
    settlementGainAnimating = true;
    const add = Math.max(0, Number(settlementGainQueue.shift()) || 0);
    const total = Math.max(0, Number(s.roundSettlement.totalGain) || 0);
    const from = Math.max(0, Number(s.roundSettlement.displayTotalGain) || 0);
    const to = Math.min(total, from + add);
    const durationMs = 280;
    const startAt = Date.now();
    const tick = () => {
      if (!s?.roundSettlement) {
        settlementGainAnimating = false;
        settlementGainAnimTimer = null;
        settlementGainQueue = [];
        return;
      }
      const t = Math.min(1, (Date.now() - startAt) / durationMs);
      const eased = 1 - ((1 - t) ** 3);
      s.roundSettlement.displayTotalGain = Math.round(from + ((to - from) * eased));
      renderSettlement();
      if (t < 1) {
        settlementGainAnimTimer = setTimeout(tick, 16);
        return;
      }
      s.roundSettlement.displayTotalGain = to;
      renderSettlement();
      settlementGainAnimTimer = null;
      runNext();
    };
    tick();
  };
  runNext();
}
function scheduleSettlementGain(amount, delayMs = 0) {
  const timerId = setTimeout(() => {
    settlementGainEventTimers = settlementGainEventTimers.filter((id) => id !== timerId);
    queueSettlementGain(amount);
  }, Math.max(0, Number(delayMs) || 0));
  settlementGainEventTimers.push(timerId);
}
const getKingdomCoinCountByAmount = (amount) => {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  if (n >= 20) return 10;
  if (n >= 12) return 8;
  if (n >= 8) return 7;
  if (n >= 5) return 6;
  if (n >= 3) return 5;
  return 4;
};
const getKingdomCallFxLevel = (roleKey) => {
  const key = String(roleKey || '');
  if (key === 'FiveKind') return 7;
  if (key === 'StraightFlush') return 6;
  if (key === 'TheWorld') return 6;
  if (key === 'FourKind') return 5;
  if (key === 'FullHouse') return 4;
  if (key === 'Flush') return 3;
  return 2;
};
const getKingdomCallCinematicDuration = (level) => {
  const lv = Math.max(1, Number(level) || 1);
  return 920 + (lv * 180);
};
const getKingdomCallCoinCount = (level) => {
  const lv = Math.max(1, Number(level) || 1);
  return Math.min(12, 4 + lv);
};
function vibrateOnce(ms = 30) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(Math.max(10, Number(ms) || 30));
    } catch (_) {
      // no-op
    }
  }
}
const shuf = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const comb = (arr, n) => { const out = []; const w = (st, ac) => { if (ac.length === n) return out.push(ac.slice()); for (let i = st; i <= arr.length - (n - ac.length); i += 1) { ac.push(arr[i]); w(i + 1, ac); ac.pop(); } }; if (n > 0 && arr.length >= n) w(0, []); return out; };
const cmpVec = (l, r) => { const m = Math.max(l.length, r.length); for (let i = 0; i < m; i += 1) { const a = Number(l[i] ?? 0), b = Number(r[i] ?? 0); if (a !== b) return a > b ? 1 : -1; } return 0; };
const idNum = (c) => Number(c?.number || 0);
const cStrength = (c) => c?.kind === 'minor' ? (c.number === 1 ? 15 : c.number) : (c?.number === 14 ? 14 : Number(c?.number || 0));
const setRankFromNumber = (n) => (Number(n) === 1 ? 15 : Number(n || 0));
const roleNumberOptions = (card) => {
  if (!card) return [0];
  if (card.kind === 'minor') {
    const n = Number(card.number || 0);
    return [n === 1 ? 15 : n];
  }
  const n = Number(card.number || 0);
  if (n === 0) return Array.from({ length: 15 }, (_, i) => i + 1);
  if (n === 1) return [1];
  if (n === 3) return [3, 13];
  if (n === 4) return [4, 14];
  if (n === 14) return [14];
  return [n];
};
const setNumberOptions = (card) => {
  if (!card) return [0];
  if (card.kind === 'minor') return [Number(card.number || 0)];
  const n = Number(card.number || 0);
  if (n === 3) return [3, 13];
  if (n === 4) return [4, 14];
  return [n];
};
const chooseSetNumberCandidate = (cards, reverse = false) => {
  if (!Array.isArray(cards) || !cards.length) return null;
  const optionRows = cards.map((card) => setNumberOptions(card));
  const common = optionRows[0].filter((value) => optionRows.every((row) => row.includes(value)));
  if (!common.length) return null;
  const sorted = common.slice().sort((a, b) => {
    const av = setRankFromNumber(a);
    const bv = setRankFromNumber(b);
    return reverse ? (av - bv) : (bv - av);
  });
  return Number(sorted[0]);
};
const pName = (i) => s.players[i]?.name || `P${i + 1}`;
const hasAceMinor = (cards) => cards.some((c) => c.kind === 'minor' && c.number === 1);
const countAceMinor = (cards) => cards.reduce((total, c) => total + ((c.kind === 'minor' && c.number === 1) ? 1 : 0), 0);
const hasCourt = (c) => { const n = idNum(c); return n >= 11 && n <= 14; };
const isSameCardIdentity = (a, b) => {
  if (!a || !b) return false;
  const aId = String(a.id || '');
  const bId = String(b.id || '');
  if (aId && bId) return aId === bId;
  return String(a.kind || '') === String(b.kind || '')
    && Number(a.number || 0) === Number(b.number || 0)
    && String(a.suit || '') === String(b.suit || '')
    && String(a.arcanaNo || '') === String(b.arcanaNo || '');
};
function pullCardFromDiscard(ownerIndex, targetCard) {
  if (!s?.players?.[ownerIndex] || !targetCard) return null;
  const discard = s.players[ownerIndex].discard;
  if (!Array.isArray(discard) || discard.length <= 0) return null;
  const idx = discard.findIndex((card) => isSameCardIdentity(card, targetCard));
  if (idx < 0) return null;
  const [pulled] = discard.splice(idx, 1);
  return pulled || null;
}
const openOracleRank = (majorCard) => (!majorCard ? null : (majorCard.number === 1 || majorCard.number === 15 ? 1 : (majorCard.number >= 2 && majorCard.number <= 14 ? majorCard.number : null)));
const suitsForCard = (c, role = false) => c.kind === 'minor' ? [c.suit] : (c.number === 1 ? SUITS.slice() : (SPECIAL_SUIT[c.number] ? [SPECIAL_SUIT[c.number]] : ['None']));
const HAND_SORT_SUIT_ORDER = { Wand: 0, Pentacle: 1, Cup: 2, Sword: 3, None: 4 };
const handSortSuitKey = (card) => {
  if (!card) return 99;
  if (card.kind === 'minor') return Number(HAND_SORT_SUIT_ORDER[card.suit] ?? 9);
  const special = SPECIAL_SUIT[Number(card.number || 0)];
  if (special) return Number(HAND_SORT_SUIT_ORDER[special] ?? 9);
  return 5;
};
const compareHandCardsByMode = (a, b, mode = HAND_SORT_MODE.SUIT) => {
  const av = cStrength(a);
  const bv = cStrength(b);
  if (mode === HAND_SORT_MODE.VALUE) {
    if (av !== bv) return av - bv;
    const as = handSortSuitKey(a);
    const bs = handSortSuitKey(b);
    if (as !== bs) return as - bs;
    return idNum(a) - idNum(b);
  }
  const as = handSortSuitKey(a);
  const bs = handSortSuitKey(b);
  if (as !== bs) return as - bs;
  if (av !== bv) return av - bv;
  return idNum(a) - idNum(b);
};
function applyLocalHandSortMode(force = false) {
  if (!s) return;
  const me = getLocalPlayerIndex();
  if (me < 0 || !s.players?.[me]) return;
  if (!force && s.selected && s.selected.size > 0) return;
  const hand = s.players[me].hand;
  if (!Array.isArray(hand) || hand.length <= 1) return;
  hand.sort((a, b) => compareHandCardsByMode(a, b, localHandSortMode));
}

function freezeLocalHandAutoSort(ms = 1100) {
  if (!s) return;
  const hold = Math.max(300, Number(ms) || 1100);
  const nextUntil = Date.now() + hold;
  const current = Number(s.handSortFreezeUntil || 0);
  s.handSortFreezeUntil = Math.max(current, nextUntil);
}

function onPlayerDrewCard(playerIndex, freezeMs = 1100) {
  if (!s || !s.players?.[playerIndex]) return;
  if (isLocalPlayer(playerIndex)) {
    freezeLocalHandAutoSort(freezeMs);
    return;
  }
  s.players[playerIndex].hand.sort((a, b) => cStrength(a) - cStrength(b));
}
function toggleLocalHandSortMode() {
  if (!s) return;
  localHandSortMode = localHandSortMode === HAND_SORT_MODE.SUIT
    ? HAND_SORT_MODE.VALUE
    : HAND_SORT_MODE.SUIT;
  applyLocalHandSortMode(true);
  s.message = localHandSortMode === HAND_SORT_MODE.SUIT
    ? '手札をスート順に並び替えました。'
    : '手札を数値順に並び替えました。';
  render();
}
const suitMaskForCard = (card) => {
  if (!card) return SUIT_MASK.None;
  if (card.kind === 'major') return SUIT_MASK.All;
  const suit = String(card.suit || 'None');
  return SUIT_MASK[suit] || SUIT_MASK.None;
};
const suitMaskForCards = (cards) => (Array.isArray(cards) ? cards.reduce((mask, card) => (mask | suitMaskForCard(card)), SUIT_MASK.None) : SUIT_MASK.None);
const isSuitMatchupCompatible = (playMask, trickMask) => {
  const a = Number(playMask || 0);
  const b = Number(trickMask || 0);
  if (!a || !b) return false;
  if (a === SUIT_MASK.All || b === SUIT_MASK.All) return true;
  const inA = (a & SUIT_PAIR_MASK_A) && (b & SUIT_PAIR_MASK_A);
  const inB = (a & SUIT_PAIR_MASK_B) && (b & SUIT_PAIR_MASK_B);
  return !!(inA || inB);
};
const getPlaySuitMask = (play) => {
  const explicit = Number(play?.suitMask || 0);
  if (explicit > 0) return explicit;
  const cards = (Array.isArray(play?.cardsTable) && play.cardsTable.length > 0)
    ? play.cardsTable
    : (Array.isArray(play?.cardsHand) ? play.cardsHand : []);
  return suitMaskForCards(cards);
};
const getPrimarySuitFromPlay = (play) => {
  const cards = (Array.isArray(play?.cardsTable) && play.cardsTable.length > 0)
    ? play.cardsTable
    : (Array.isArray(play?.cardsHand) ? play.cardsHand : []);
  for (const card of cards) {
    const suits = suitsForCard(card, false).filter((suit) => suit && suit !== 'None');
    if (suits.includes('Sword')) return 'Sword';
    if (suits.includes('Pentacle')) return 'Pentacle';
    if (suits.includes('Cup')) return 'Cup';
    if (suits.includes('Wand')) return 'Wand';
  }
  return null;
};
const pickTrickDefeatFx = (play, prevTrick) => {
  const prevCards = Array.isArray(prevTrick?.cardsTable) ? prevTrick.cardsTable : [];
  if (!play || !prevCards.length) return null;
  const info = { kind: 'normal', special: false };
  if (String(play?.type || '') !== 'set' || String(prevTrick?.type || '') !== 'set') return info;
  const samePower = setCmp(play?.setPower ?? play?.number, prevTrick?.setPower ?? prevTrick?.number) === 0;
  if (!samePower) return info;
  const playCards = Array.isArray(play?.cardsTable) ? play.cardsTable : [];
  const playHasMajor = playCards.some((card) => card?.kind === 'major');
  const prevHasMajor = prevCards.some((card) => card?.kind === 'major');
  if (playHasMajor || prevHasMajor) return info;
  const suitBattle = isSuitMatchupCompatible(getPlaySuitMask(play), getPlaySuitMask(prevTrick));
  if (!suitBattle) return info;
  info.special = true;
  const suit = getPrimarySuitFromPlay(play);
  if (suit === 'Sword') info.kind = 'slash';
  else if (suit === 'Pentacle') info.kind = 'rock';
  else if (suit === 'Cup') info.kind = 'water';
  else if (suit === 'Wand') info.kind = 'fire';
  return info;
};
const suitTierForCard = (c, suit) => {
  const base = SUIT_TIER[suit] || 0;
  // 大アルカナは、同値比較時のスート優位で常に小アルカナより上位
  // (同じ大アルカナ同士では base で軽く序列を残す)
  if (c?.kind === 'major') return 10 + base;
  return base;
};
const mkMinor = () => { const d = []; let id = 0; SUITS.forEach((suit) => { for (let n = 1; n <= 14; n += 1) d.push({ id: `tk_m_${++id}`, kind: 'minor', suit, number: n }); }); return d; };
const mkMajor = () => Array.from({ length: 22 }, (_, n) => ({ id: `tk_a_${n}`, kind: 'major', suit: 'None', number: n }));
const log = (m) => { s.logs.push(m); if (s.logs.length > 120) s.logs.splice(0, s.logs.length - 120); };

function toRomanNumber(value) {
  let number = Math.floor(Number(value) || 0);
  if (!Number.isFinite(number) || number <= 0) return '0';
  const romanMap = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let result = '';
  for (const [unit, symbol] of romanMap) {
    while (number >= unit) {
      result += symbol;
      number -= unit;
    }
  }
  return result;
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
  if (card.kind === 'major') return ARCANA_NAME[card.number] || 'アルカナ';
  return getMinorArcanaRankLabel(card.number);
}

function getCardNumberLabel(card) {
  if (!card) return '';
  const n = Number(card.number) || 0;
  if (card.kind !== 'major' && n === 1) return 'A';
  return String(n);
}

function isRomanOnlyLabel(text) {
  const s = String(text || '').trim();
  return !!s && /^[IVXLCDM]+$/i.test(s);
}

function getRoleBaseLabel(role) {
  if (!role) return '役出し';
  return ROLE_LABEL[role.key] || role.label || '役出し';
}

function getRoleKeyCardName(role, cards) {
  if (!role || !Array.isArray(cards) || !cards.length) return '';
  const target = Number(role?.primary?.[0] || 0);
  let candidates = cards.filter((c) => cStrength(c) === target);
  if (!candidates.length) candidates = cards.slice();
  candidates.sort((a, b) => {
    const arc = Number(b?.kind === 'major') - Number(a?.kind === 'major');
    if (arc !== 0) return arc;
    return cStrength(b) - cStrength(a);
  });
  const name = getCardNameLabel(candidates[0]);
  if (!name || isRomanOnlyLabel(name)) return '';
  return name;
}

function getRoleDisplayLabel(play) {
  const base = getRoleBaseLabel(play?.role);
  if (play?.call) return `コール${base}`;
  const keyName = getRoleKeyCardName(play?.role, play?.cardsHand || []);
  return keyName ? `${keyName}${base}` : base;
}

function getArcanaMatchNumber() {
  if (!s?.openOracleRevealed) return null;
  if (!s.openOracleCard || s.openOracleCard.kind !== 'major') return null;
  const n = Number(s.openOracleCard.number);
  return Number.isFinite(n) ? n : null;
}

function getKingdomCardEffectDescription(card) {
  if (!card) return '';
  const n = Number(card.number || 0);
  if (card.kind === 'major') {
    const majorEffectMap = {
      0: '5枚役のみ数値ワイルド（フラッシュ化なし）',
      1: 'オールスートとして扱う',
      2: '他者はパスで強制ドロー',
      3: '数値3/13の有利側で扱う',
      4: '数値4/14の有利側で扱う',
      5: 'もう一度自分のターン',
      6: '他者が出すたび星+1',
      7: '単騎で2枚出し化',
      8: '強制クリア',
      9: '次ドロー（小/大）を予見',
      10: '単騎で大アルカナを1枚引く',
      11: '11バック（局内永続）',
      12: '生贄で小アルカナ1枚引く',
      13: '他者が出すたび星-1',
      14: '節制ロック（直前スート縛り）',
      15: '他者がパスで星-1',
      16: 'ソードワイルド化※単騎14',
      17: 'カップワイルド化※単騎14',
      18: 'ペンタクルワイルド化※単騎14',
      19: 'ワンドワイルド化※単騎14',
      20: 'クリアで墓地から1枚回収',
      21: '世界+計21の5枚で役'
    };
    return majorEffectMap[n] || '';
  }
  if (n === 5) return '5スキップ';
  if (n === 8) return '8カット';
  if (n === 11) return '11バック';
  if (n === 14) return '場と同スートで14ロック';
  return '';
}

function updateSelectedCardEffectLabel(playerIndex, selectedIndexes) {
  if (!ui.selectedEffect) return;
  const hide = () => {
    ui.selectedEffect.textContent = '';
    ui.selectedEffect.hidden = true;
  };
  if (!s || !Array.isArray(selectedIndexes) || selectedIndexes.length !== 1) {
    hide();
    return;
  }
  const hand = s.players?.[playerIndex]?.hand;
  if (!Array.isArray(hand)) {
    hide();
    return;
  }
  const targetIndex = Number(selectedIndexes[0]);
  const card = Number.isInteger(targetIndex) ? hand[targetIndex] : null;
  const effectText = getKingdomCardEffectDescription(card);
  if (!effectText) {
    hide();
    return;
  }
  ui.selectedEffect.textContent = `${getCardNameLabel(card)}: ${effectText}`;
  ui.selectedEffect.hidden = false;
}

function buildSelectedCardInfoMessage(playerIndex, selectedIndexes) {
  if (!s || !Array.isArray(selectedIndexes)) return '';
  const hand = s.players?.[playerIndex]?.hand;
  if (!Array.isArray(hand) || selectedIndexes.length <= 0) return '';
  const sel = selectedIndexes
    .map((idx) => Number(idx))
    .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < hand.length);
  if (!sel.length) return '';
  const cards = sel.map((idx) => hand[idx]).filter(Boolean);
  if (!cards.length) return '';

  if (sel.length === 1) {
    const card = cards[0];
    const name = getCardNameLabel(card);
    const effect = getKingdomCardEffectDescription(card);
    return effect ? `選択: ${name} / ${effect}` : `選択: ${name}`;
  }

  if (sel.length === 5) {
    const builtRole = buildRolePlay(playerIndex, sel);
    if (builtRole?.ok) return `選択: ${getRoleDisplayLabel(builtRole.play)}`;
  }

  if (sel.length === 4) {
    const builtCall = buildCallPlay(playerIndex, sel);
    if (builtCall?.ok) return `選択: ${getRoleDisplayLabel(builtCall.play)}`;
  }

  if ([1, 2, 3].includes(sel.length)) {
    const builtSet = buildSetPlay(playerIndex, sel);
    if (builtSet?.ok) {
      const n = Number(builtSet.play?.number || 0);
      const rank = n === 1 ? 'A' : String(n || '?');
      return `選択: ${sel.length}枚 / 数字${rank}`;
    }
  }

  const labels = cards.map((c) => getCardNameLabel(c)).filter(Boolean);
  return labels.length ? `選択: ${labels.join('・')}` : `選択: ${sel.length}枚`;
}

function showKingdomCardEffectInfo(card, prefix = '効果') {
  if (!s || !card) return;
  const name = getCardNameLabel(card);
  const effectText = getKingdomCardEffectDescription(card);
  s.message = effectText
    ? `${prefix}: ${name} / ${effectText}`
    : `${prefix}: ${name}（固有効果なし）`;
  renderSummary();
}

function getShortPlayHelp(reason) {
  const text = String(reason || '');
  if (!text) return '';
  if (text.includes('ストレートコール制限')) return 'ヒント: 場札と同じ数値を手札4枚から外してください。';
  if (text.includes('フラッシュコール制限')) return 'ヒント: 場札がハイカードにならない構成で5枚を作ってください。';
  if (text.includes('コールは手札4枚')) return 'ヒント: コール時は手札を4枚だけ選択します。';
  if (text.includes('コール対象は1枚場札のみ')) return 'ヒント: コールは場札が1枚のときだけ使えます。';
  if (text.includes('場の大アルカナ1枚にはコールできません')) return 'ヒント: 場が大アルカナ単騎のときは通常出しで対応します。';
  if (text.includes('星がない')) return 'ヒント: クリアで星を増やしてから再挑戦してください。';
  if (text.includes('スート縛り')) return 'ヒント: 縛られているスートと同じ色のカードを選択してください。';
  if (text.includes('場札より強い数値')) return 'ヒント: 場札より強い数値に選び直してください。';
  if (text.includes('同じ形式/枚数')) return 'ヒント: 場と同じ枚数・形式で出してください。';
  if (text.includes('5枚選択')) return 'ヒント: 5枚役は5枚ちょうど選択してください。';
  return '';
}

function showPlayError(reason) {
  if (!s) return;
  const detail = (String(reason || '出せません。').trim()) || '出せません。';
  const hint = getShortPlayHelp(detail);
  s.message = hint
    ? `出せない理由: ${detail} / ${hint}`
    : `出せない理由: ${detail}`;
  log(`⚠ ${s.message}`);
  render();
  if (!ui.stateText) return;
  ui.stateText.classList.remove('is-error');
  void ui.stateText.offsetWidth;
  ui.stateText.classList.add('is-error');
  if (stateErrorTimer) clearTimeout(stateErrorTimer);
  stateErrorTimer = setTimeout(() => {
    ui.stateText?.classList.remove('is-error');
    stateErrorTimer = null;
  }, 1800);
}

function sanitizeSelected(playerIndex) {
  if (!s || !s.players?.[playerIndex]) return [];
  const handLen = s.players[playerIndex].hand.length;
  const filtered = Array.from(s.selected)
    .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < handLen)
    .sort((a, b) => a - b);
  if (filtered.length !== s.selected.size) s.selected = new Set(filtered);
  return filtered;
}

function getElementCenterPoint(el) {
  if (!el || !el.getBoundingClientRect) return null;
  const rect = el.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) };
}

function getKingdomOwnerClass(playerIndex) {
  return isLocalPlayer(playerIndex) ? 'is-player' : (isNpcPlayer(playerIndex) ? 'is-cpu' : 'is-remote');
}

function getKingdomPlayerAnchor(playerIndex) {
  return ui.players?.querySelector?.(`[data-player-index="${playerIndex}"]`) || null;
}

function showKingdomOverlay(kind = 'action', holdMsOverride = null) {
  if (!ui.kingdomOverlay) return;
  ui.kingdomOverlay.classList.remove('show', 'is-kingdom-clear', 'is-kingdom-draw', 'is-kingdom-roundend', 'is-kingdom-call', 'is-kingdom-call-freeze');
  if (kind === 'clear') ui.kingdomOverlay.classList.add('is-kingdom-clear');
  else if (kind === 'draw') ui.kingdomOverlay.classList.add('is-kingdom-draw');
  else if (kind === 'call') ui.kingdomOverlay.classList.add('is-kingdom-call', 'is-kingdom-call-freeze');
  else if (kind === 'roundend') ui.kingdomOverlay.classList.add('is-kingdom-roundend');
  void ui.kingdomOverlay.offsetWidth;
  ui.kingdomOverlay.classList.add('show');
  if (kingdomOverlayTimer) clearTimeout(kingdomOverlayTimer);
  const holdMs = holdMsOverride != null
    ? Math.max(120, Number(holdMsOverride) || 0)
    : (kind === 'roundend' ? 760 : (kind === 'call' ? 620 : 260));
  kingdomOverlayTimer = setTimeout(() => {
    ui.kingdomOverlay?.classList.remove('show', 'is-kingdom-clear', 'is-kingdom-draw', 'is-kingdom-roundend', 'is-kingdom-call', 'is-kingdom-call-freeze');
    kingdomOverlayTimer = null;
  }, holdMs);
}

function showKingdomCutin(playerIndex, label, options = {}) {
  if (!ui.kingdomCutin || !label) return;
  const ownerClass = getKingdomOwnerClass(playerIndex);
  const who = playerIndex == null ? '' : `${pName(playerIndex)} `;
  const cutinText = `${who}${label}`;
  ui.kingdomCutin.textContent = cutinText;
  ui.kingdomCutin.classList.remove(
    'is-player',
    'is-cpu',
    'is-showdown-win',
    'is-showdown-lose',
    'is-showdown-draw',
    'is-kingdom-skip',
    'is-kingdom-cut',
    'is-kingdom-reverse',
    'is-kingdom-lock',
    'is-kingdom-call',
    'is-kingdom-role',
    'is-kingdom-round-end',
    'is-kingdom-round-out',
    'is-kingdom-grand-win',
    'is-kingdom-your-turn'
  );
  if (playerIndex != null) ui.kingdomCutin.classList.add(ownerClass);
  if (options.cutinClass) ui.kingdomCutin.classList.add(options.cutinClass);
  ui.kingdomCutin.classList.add('show');
  if (kingdomCutinTimer) clearTimeout(kingdomCutinTimer);
  kingdomCutinTimer = setTimeout(() => {
    ui.kingdomCutin?.classList.remove(
      'show',
      'is-player',
      'is-cpu',
      'is-showdown-win',
      'is-showdown-lose',
      'is-showdown-draw',
      'is-kingdom-skip',
      'is-kingdom-cut',
      'is-kingdom-reverse',
      'is-kingdom-lock',
      'is-kingdom-call',
      'is-kingdom-role',
      'is-kingdom-round-end',
      'is-kingdom-round-out',
      'is-kingdom-grand-win',
      'is-kingdom-your-turn'
    );
    kingdomCutinTimer = null;
  }, options.durationMs || 680);
}

function flashKingdomPlayerRowAction(playerIndex, label, durationMs = 760) {
  const row = ui.players?.querySelector?.(`[data-player-index="${playerIndex}"]`);
  if (!row || !label) return;
  // Keep only one transient action highlight at a time.
  ui.players?.querySelectorAll?.('.tarot-kingdom-player-row.fx-action').forEach((node) => {
    node.classList.remove('fx-action');
    node.removeAttribute('data-action');
  });
  row.dataset.action = label;
  row.classList.remove('fx-action');
  void row.offsetWidth;
  row.classList.add('fx-action');
  if (kingdomRowFxTimers.has(playerIndex)) clearTimeout(kingdomRowFxTimers.get(playerIndex));
  const t = setTimeout(() => {
    const currentRow = ui.players?.querySelector?.(`[data-player-index="${playerIndex}"]`);
    if (!currentRow) return;
    currentRow.classList.remove('fx-action');
    currentRow.removeAttribute('data-action');
    kingdomRowFxTimers.delete(playerIndex);
  }, Math.max(120, Number(durationMs) || 760));
  kingdomRowFxTimers.set(playerIndex, t);
}

function triggerKingdomRowActionFx(playerIndex, label, durationMs = 760) {
  flashKingdomPlayerRowAction(playerIndex, label, durationMs);
}

function playKingdomCoinEffect(playerIndex, coinCount = 4, symbol = '🪙', options = {}) {
  if (typeof document === 'undefined') return;
  const potAnchor = ui.score || ui.round || ui.root;
  if (!potAnchor) return;
  const directTargetEl = options.targetElement || null;
  const selectorTargetEl = (typeof options.targetSelector === 'string' && options.targetSelector)
    ? document.querySelector(options.targetSelector)
    : null;
  const sourceEl = options.fromPot ? potAnchor : (getKingdomPlayerAnchor(playerIndex) || ui.hand || potAnchor);
  const targetEl = directTargetEl
    || selectorTargetEl
    || (options.targetPlayerIndex != null
      ? (getKingdomPlayerAnchor(options.targetPlayerIndex) || potAnchor)
      : potAnchor);
  const from = getElementCenterPoint(sourceEl);
  const to = getElementCenterPoint(targetEl);
  if (!from || !to) return;
  const ownerClass = getKingdomOwnerClass(playerIndex);
  const total = Math.max(1, Math.min(10, Number(coinCount) || 4));
  const baseDelay = Math.max(0, Number(options.delayMs) || 0);
  for (let i = 0; i < total; i += 1) {
    const coin = document.createElement('span');
    coin.className = `tarot-coin-fx ${ownerClass}`;
    if (options.className) coin.classList.add(options.className);
    coin.textContent = symbol;
    coin.style.left = `${from.x}px`;
    coin.style.top = `${from.y}px`;
    coin.style.opacity = '0';
    coin.style.transform = 'translate(-50%, -50%) scale(0.62) rotate(0deg)';
    document.body.appendChild(coin);
    const delay = baseDelay + (i * 34);
    const targetX = to.x + ((Math.random() * 16) - 8);
    const targetY = to.y + ((Math.random() * 12) - 6);
    const rotate = (Math.random() * 88) - 44;
    setTimeout(() => {
      coin.style.transition = 'left 520ms cubic-bezier(0.18,0.84,0.26,1), top 520ms cubic-bezier(0.18,0.84,0.26,1), opacity 90ms ease-out, transform 520ms ease';
      coin.style.left = `${targetX}px`;
      coin.style.top = `${targetY}px`;
      coin.style.opacity = '1';
      coin.style.transform = `translate(-50%, -50%) scale(1) rotate(${rotate}deg)`;
    }, delay);
    setTimeout(() => {
      coin.style.transition = 'opacity 120ms ease-in, transform 120ms ease-in';
      coin.style.opacity = '0';
      coin.style.transform = `translate(-50%, -50%) scale(0.72) rotate(${rotate * 1.25}deg)`;
    }, delay + 430);
    setTimeout(() => {
      if (coin.parentElement) coin.remove();
    }, delay + 620);
  }
}

function playKingdomChariotSplitFx(playerIndex, options = {}) {
  if (typeof document === 'undefined') return;
  const baseDelay = Math.max(0, Number(options.delayMs) || 80);
  const maxRetries = 8;
  const retryWait = 34;

  const run = (retry = 0) => {
    const baseCard = ui.trick?.querySelector?.('.tarot-card:not(.is-leaving)');
    if (!baseCard) {
      if (retry < maxRetries) setTimeout(() => run(retry + 1), retryWait);
      return;
    }
    const rect = baseCard.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    baseCard.classList.add('is-chariot-splitting');
    setTimeout(() => baseCard.classList.remove('is-chariot-splitting'), 560);

    const createSplitCard = (dir) => {
      const clone = baseCard.cloneNode(true);
      clone.classList.remove(
        'is-clickable',
        'is-static',
        'is-selected',
        'is-entering',
        'is-leaving',
        'is-call-arriving',
        'is-undealt',
        'is-chariot-splitting'
      );
      clone.classList.add('tarot-kingdom-split-card', dir === 'left' ? 'is-left' : 'is-right');
      clone.classList.add(getKingdomOwnerClass(playerIndex));
      clone.setAttribute('aria-hidden', 'true');
      clone.tabIndex = -1;
      clone.disabled = true;
      clone.style.left = `${rect.left + (rect.width / 2)}px`;
      clone.style.top = `${rect.top + (rect.height / 2)}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.minWidth = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      clone.style.minHeight = `${rect.height}px`;
      clone.style.setProperty('--tarot-card-w', `${rect.width}px`);
      clone.style.setProperty('--tarot-card-h', `${rect.height}px`);
      document.body.appendChild(clone);
      requestAnimationFrame(() => clone.classList.add('run'));
      setTimeout(() => clone.remove(), 720);
    };

    createSplitCard('left');
    setTimeout(() => createSplitCard('right'), 46);
  };

  setTimeout(() => run(0), baseDelay);
}

function triggerKingdomActionFx(playerIndex, label, options = {}) {
  const run = () => {
    if (playerIndex != null) setTimeout(() => flashKingdomPlayerRowAction(playerIndex, label), 0);
    if (options.overlay) showKingdomOverlay(options.overlay, options.overlayHoldMs ?? null);
    if (options.cutin !== false) showKingdomCutin(playerIndex, label, options);
    if (options.coinCount && options.coinCount > 0) playKingdomCoinEffect(playerIndex, options.coinCount, options.coinSymbol || '🪙');
  };
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  if (delayMs > 0) {
    setTimeout(run, delayMs);
  } else {
    run();
  }
}

function pulseKingdomPotAnchor(durationMs = 720) {
  const anchor = ui.score || ui.round || ui.root;
  if (!anchor) return;
  anchor.classList.remove('is-call-pulse');
  void anchor.offsetWidth;
  anchor.classList.add('is-call-pulse');
  setTimeout(() => {
    anchor.classList.remove('is-call-pulse');
  }, Math.max(220, Number(durationMs) || 720));
}

function getKingdomPlaySourcePoint(playerIndex) {
  if (isLocalPlayer(playerIndex)) {
    const handCard = ui.hand?.querySelector?.('.tarot-card');
    const handPoint = getElementCenterPoint(handCard) || getElementCenterPoint(ui.hand);
    if (handPoint) return handPoint;
  }
  const row = getKingdomPlayerAnchor(playerIndex);
  return getElementCenterPoint(row) || getElementCenterPoint(ui.players) || getElementCenterPoint(ui.root);
}

function getKingdomTrickRightSourcePoint() {
  const rect = ui.trick?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: rect.right + Math.max(20, Math.min(56, rect.width * 0.14)),
    y: rect.top + (rect.height * 0.55)
  };
}

function playKingdomRamAttackFx(playerIndex, attackCard, targetEl, options = {}) {
  const noopController = {
    totalMs: 0,
    settleTo: () => 0,
    remove: () => {}
  };
  if (typeof document === 'undefined') return noopController;
  if (!attackCard || !targetEl) return noopController;
  const from = options.fromPoint || getKingdomPlaySourcePoint(playerIndex);
  const to = getElementCenterPoint(targetEl);
  if (!from || !to) return noopController;
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  const durationMs = Math.max(180, Number(options.durationMs) || 220);
  const keepAfterHit = !!options.keepAfterHit;
  const ghost = cardNode(attackCard, { clickable: false });
  ghost.classList.remove('is-clickable', 'is-static', 'is-selected', 'is-entering', 'is-call-arriving', 'is-leaving');
  ghost.classList.add('tarot-card-fly', 'tarot-kingdom-ram-card');
  ghost.style.left = `${from.x}px`;
  ghost.style.top = `${from.y}px`;
  ghost.style.opacity = '0';
  ghost.style.transform = 'translate(-50%, -50%) scale(0.84) rotate(-10deg)';
  document.body.appendChild(ghost);

  let removed = false;
  const removeGhost = () => {
    if (removed) return;
    removed = true;
    if (ghost.parentElement) ghost.remove();
  };
  const fadeOutAndRemove = (fadeDelayMs = 0, fadeMs = 110) => {
    setTimeout(() => {
      if (removed || !ghost.parentElement) return;
      ghost.style.transition = `opacity ${fadeMs}ms ease-in, transform ${fadeMs}ms ease-in`;
      ghost.style.opacity = '0';
      ghost.style.transform = 'translate(-50%, -50%) scale(0.78) rotate(6deg)';
    }, Math.max(0, Number(fadeDelayMs) || 0));
    setTimeout(removeGhost, Math.max(0, Number(fadeDelayMs) || 0) + Math.max(70, Number(fadeMs) || 110) + 84);
  };

  setTimeout(() => {
    if (removed || !ghost.parentElement) return;
    ghost.style.transition = `left ${durationMs}ms cubic-bezier(0.16, 0.9, 0.24, 1), top ${durationMs}ms cubic-bezier(0.16, 0.9, 0.24, 1), transform ${durationMs}ms cubic-bezier(0.16, 0.9, 0.24, 1), opacity 90ms ease-out`;
    ghost.style.left = `${to.x}px`;
    ghost.style.top = `${to.y}px`;
    ghost.style.opacity = '1';
    ghost.style.transform = 'translate(-50%, -50%) scale(1.06) rotate(0deg)';
  }, delayMs + 12);
  setTimeout(() => {
    if (removed || !targetEl) return;
    targetEl.classList.add('is-ram-impact');
    setTimeout(() => targetEl.classList.remove('is-ram-impact'), 160);
  }, delayMs + Math.max(90, durationMs - 30));
  if (!keepAfterHit) {
    fadeOutAndRemove(delayMs + durationMs + 16, 110);
  }
  return {
    totalMs: delayMs + durationMs + (keepAfterHit ? 0 : 180),
    settleTo: (settleTargetEl, settleOptions = {}) => {
      if (removed || !ghost.parentElement) return 0;
      const settleTarget = getElementCenterPoint(settleTargetEl);
      if (!settleTarget) {
        fadeOutAndRemove(0, 90);
        return 0;
      }
      const settleDelayMs = Math.max(0, Number(settleOptions.delayMs) || 0);
      const settleDurationMs = Math.max(120, Number(settleOptions.durationMs) || 180);
      setTimeout(() => {
        if (removed || !ghost.parentElement) return;
        ghost.style.transition = `left ${settleDurationMs}ms cubic-bezier(0.2, 0.86, 0.24, 1), top ${settleDurationMs}ms cubic-bezier(0.2, 0.86, 0.24, 1), transform ${settleDurationMs}ms cubic-bezier(0.2, 0.86, 0.24, 1)`;
        ghost.style.left = `${settleTarget.x}px`;
        ghost.style.top = `${settleTarget.y}px`;
        ghost.style.transform = 'translate(-50%, -50%) scale(1.01) rotate(0deg)';
      }, settleDelayMs);
      const onArriveMs = settleDelayMs + settleDurationMs + 6;
      setTimeout(() => {
        if (typeof settleOptions.onArrive === 'function') settleOptions.onArrive();
      }, onArriveMs);
      if (settleOptions.autoRemove !== false) {
        fadeOutAndRemove(onArriveMs + 4, 84);
      }
      return onArriveMs + 96;
    },
    remove: (fadeMs = 84) => {
      if (removed || !ghost.parentElement) return;
      fadeOutAndRemove(0, Math.max(60, Number(fadeMs) || 84));
    }
  };
}

function playKingdomCallStealFx(playerIndex, targetEl, options = {}) {
  if (typeof document === 'undefined') return 0;
  if (!targetEl) return 0;
  const from = getKingdomPlaySourcePoint(playerIndex);
  const to = getElementCenterPoint(targetEl);
  if (!from || !to) return 0;
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  const inMs = Math.max(160, Number(options.inMs) || 220);
  const outMs = Math.max(180, Number(options.outMs) || 260);
  const holdMs = Math.max(40, Number(options.holdMs) || 80);
  const ghost = document.createElement('span');
  ghost.className = 'tarot-kingdom-call-ghost';
  ghost.textContent = '👻';
  ghost.style.left = `${from.x}px`;
  ghost.style.top = `${from.y}px`;
  ghost.style.opacity = '0';
  ghost.style.transform = 'translate(-50%, -50%) scale(0.8)';
  document.body.appendChild(ghost);

  setTimeout(() => {
    ghost.style.transition = `left ${inMs}ms cubic-bezier(0.2, 0.86, 0.24, 1), top ${inMs}ms cubic-bezier(0.2, 0.86, 0.24, 1), opacity 100ms ease-out, transform ${inMs}ms cubic-bezier(0.2, 0.86, 0.24, 1)`;
    ghost.style.left = `${to.x}px`;
    ghost.style.top = `${to.y}px`;
    ghost.style.opacity = '1';
    ghost.style.transform = 'translate(-50%, -50%) scale(1.06)';
  }, delayMs + 12);

  setTimeout(() => {
    targetEl.classList.add('is-call-stolen');
    setTimeout(() => targetEl.classList.remove('is-call-stolen'), 220);
  }, delayMs + inMs - 24);

  setTimeout(() => {
    ghost.style.transition = `left ${outMs}ms cubic-bezier(0.16, 0.86, 0.24, 1), top ${outMs}ms cubic-bezier(0.16, 0.86, 0.24, 1), transform ${outMs}ms cubic-bezier(0.16, 0.86, 0.24, 1), opacity 120ms ease-in`;
    ghost.style.left = `${from.x}px`;
    ghost.style.top = `${from.y - 8}px`;
    ghost.style.opacity = '0';
    ghost.style.transform = 'translate(-50%, -50%) scale(0.88)';
  }, delayMs + inMs + holdMs);

  const totalMs = delayMs + inMs + holdMs + outMs + 120;
  setTimeout(() => {
    if (ghost.parentElement) ghost.remove();
  }, totalMs);
  return totalMs;
}

function playKingdomCallTauntGhostFx(targetEl, options = {}) {
  if (typeof document === 'undefined') return 0;
  if (!targetEl) return 0;
  const target = getElementCenterPoint(targetEl);
  if (!target) return 0;
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  const fadeInMs = Math.max(180, Number(options.fadeInMs) || 240);
  const holdMs = Math.max(120, Number(options.holdMs) || 320);
  const fadeOutMs = Math.max(140, Number(options.fadeOutMs) || 220);
  const ghost = document.createElement('span');
  ghost.className = 'tarot-kingdom-call-ghost-taunt';
  ghost.textContent = '👻';
  ghost.style.left = `${target.x}px`;
  ghost.style.top = `${target.y - 8}px`;
  ghost.style.opacity = '0';
  ghost.style.transform = 'translate(-50%, -50%) scale(0.76)';
  document.body.appendChild(ghost);

  setTimeout(() => {
    ghost.classList.add('is-taunt');
    ghost.style.transition = `opacity ${fadeInMs}ms ease-out, transform ${fadeInMs}ms cubic-bezier(0.22, 0.82, 0.24, 1)`;
    ghost.style.opacity = '1';
    ghost.style.transform = 'translate(-50%, -50%) scale(1.02)';
  }, delayMs + 10);

  setTimeout(() => {
    ghost.classList.remove('is-taunt');
    ghost.style.transition = `opacity ${fadeOutMs}ms ease-in, transform ${fadeOutMs}ms ease-in`;
    ghost.style.opacity = '0';
    ghost.style.transform = 'translate(-50%, -50%) scale(0.82)';
  }, delayMs + fadeInMs + holdMs);

  const totalMs = delayMs + fadeInMs + holdMs + fadeOutMs;
  setTimeout(() => {
    if (ghost.parentElement) ghost.remove();
  }, totalMs + 80);
  return totalMs;
}

function spawnKingdomRoleClashParticles(point, delayMs = 0) {
  if (typeof document === 'undefined' || !point) return;
  const particles = [
    { emoji: '⚡', dx: -20, dy: -12, dur: 300, cls: 'is-a' },
    { emoji: '✨', dx: 16, dy: -18, dur: 320, cls: 'is-b' },
    { emoji: '✨', dx: -4, dy: 14, dur: 340, cls: 'is-c' },
    { emoji: '💥', dx: 10, dy: 6, dur: 300, cls: 'is-d' }
  ];
  particles.forEach((cfg, idx) => {
    const node = document.createElement('span');
    node.className = `tarot-kingdom-role-clash-particle ${cfg.cls || ''}`;
    node.textContent = cfg.emoji;
    node.style.left = `${point.x + cfg.dx}px`;
    node.style.top = `${point.y + cfg.dy}px`;
    node.style.animationDelay = `${Math.max(0, Number(delayMs) || 0) + (idx * 24)}ms`;
    node.style.setProperty('--fx-dur', `${Math.max(220, Number(cfg.dur) || 300)}ms`);
    document.body.appendChild(node);
    requestAnimationFrame(() => node.classList.add('run'));
    setTimeout(() => {
      if (node.parentElement) node.remove();
    }, Math.max(0, Number(delayMs) || 0) + (idx * 24) + Math.max(220, Number(cfg.dur) || 300) + 100);
  });
}

function playKingdomRoleClashFx(playerIndex, attackCard, targetEl, options = {}) {
  if (typeof document === 'undefined') return 0;
  if (!attackCard || !targetEl) return 0;
  const from = getKingdomPlaySourcePoint(playerIndex);
  const to = getElementCenterPoint(targetEl);
  if (!from || !to) return 0;
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  const inMs = Math.max(180, Number(options.inMs) || 240);
  const holdMs = Math.max(20, Number(options.holdMs) || 60);
  const outMs = Math.max(160, Number(options.outMs) || 220);
  const ghost = cardNode(attackCard, { clickable: false });
  ghost.classList.remove('is-clickable', 'is-static', 'is-selected', 'is-entering', 'is-call-arriving', 'is-leaving');
  ghost.classList.add('tarot-card-fly', 'tarot-kingdom-role-clash-card');
  ghost.style.left = `${from.x}px`;
  ghost.style.top = `${from.y}px`;
  ghost.style.opacity = '0';
  ghost.style.transform = 'translate(-50%, -50%) scale(0.84) rotate(-8deg)';
  document.body.appendChild(ghost);

  setTimeout(() => {
    ghost.style.transition = `left ${inMs}ms cubic-bezier(0.16, 0.9, 0.24, 1), top ${inMs}ms cubic-bezier(0.16, 0.9, 0.24, 1), transform ${inMs}ms cubic-bezier(0.16, 0.9, 0.24, 1), opacity 100ms ease-out`;
    ghost.style.left = `${to.x}px`;
    ghost.style.top = `${to.y}px`;
    ghost.style.opacity = '1';
    ghost.style.transform = 'translate(-50%, -50%) scale(1.14) rotate(0deg)';
  }, delayMs + 8);

  setTimeout(() => {
    targetEl.classList.add('is-role-clash-impact');
    setTimeout(() => targetEl.classList.remove('is-role-clash-impact'), 180);
    spawnKingdomRoleClashParticles(to, 0);
  }, delayMs + inMs - 24);

  setTimeout(() => {
    ghost.style.transition = `opacity ${outMs}ms ease-in, transform ${outMs}ms ease-in`;
    ghost.style.opacity = '0';
    ghost.style.transform = 'translate(-50%, -50%) scale(0.76) rotate(8deg)';
  }, delayMs + inMs + holdMs);
  const totalMs = delayMs + inMs + holdMs + outMs + 40;
  setTimeout(() => {
    if (ghost.parentElement) ghost.remove();
  }, totalMs + 60);
  return totalMs;
}

function spawnKingdomDefeatParticles(targetEl, kind = 'normal', options = {}) {
  if (typeof document === 'undefined' || !targetEl) return;
  const rect = targetEl.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return;
  const baseX = rect.left + (rect.width / 2);
  const baseY = rect.top + (rect.height / 2);
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  const particles = [];
  if (kind === 'slash') {
    particles.push({ emoji: '🗡️', variant: 'is-sword-main', x: baseX - 14, y: baseY + 6, dur: 430 });
    particles.push({ emoji: '🗡️', variant: 'is-sword-sub', x: baseX + 8, y: baseY - 8, dur: 380 });
  } else if (kind === 'rock') {
    particles.push({ emoji: '🪦', variant: 'is-rock-main', x: baseX, y: baseY - 34, dur: 560 });
    particles.push({ emoji: '💥', variant: 'is-rock-hit', x: baseX + 2, y: baseY + 10, dur: 340 });
  } else if (kind === 'water') {
    particles.push({ emoji: '💦', variant: 'is-water-main', x: baseX - 2, y: baseY - 2, dur: 480 });
    particles.push({ emoji: '💧', variant: 'is-water-drop-a', x: baseX - 18, y: baseY - 8, dur: 460 });
    particles.push({ emoji: '💧', variant: 'is-water-drop-b', x: baseX + 4, y: baseY - 10, dur: 500 });
    particles.push({ emoji: '💧', variant: 'is-water-drop-c', x: baseX + 20, y: baseY - 6, dur: 520 });
  } else if (kind === 'fire') {
    particles.push({ emoji: '🔥', variant: 'is-fire-a', x: baseX - 14, y: baseY + 2, dur: 520 });
    particles.push({ emoji: '🔥', variant: 'is-fire-b', x: baseX + 4, y: baseY - 8, dur: 560 });
    particles.push({ emoji: '🔥', variant: 'is-fire-c', x: baseX + 20, y: baseY + 4, dur: 500 });
  } else {
    particles.push({ emoji: '💥', variant: 'is-normal', x: baseX, y: baseY, dur: 320 });
  }

  particles.forEach((cfg, idx) => {
    const node = document.createElement('span');
    node.className = `tarot-kingdom-defeat-particle is-${kind} ${cfg.variant || ''}`;
    node.textContent = cfg.emoji;
    node.style.left = `${cfg.x}px`;
    node.style.top = `${cfg.y}px`;
    node.style.animationDelay = `${delayMs + (idx * 36)}ms`;
    node.style.setProperty('--fx-dur', `${Math.max(180, Number(cfg.dur) || 360)}ms`);
    document.body.appendChild(node);
    requestAnimationFrame(() => node.classList.add('run'));
    const total = delayMs + (idx * 36) + Math.max(180, Number(cfg.dur) || 360) + 140;
    setTimeout(() => {
      if (node.parentElement) node.remove();
    }, total);
  });
}

function triggerKingdomTrickShake(isSpecial = false) {
  const root = ui.root || ui.trick;
  if (!root) return;
  root.classList.remove('is-trick-shake-normal', 'is-trick-shake-special');
  void root.offsetWidth;
  root.classList.add(isSpecial ? 'is-trick-shake-special' : 'is-trick-shake-normal');
  setTimeout(() => {
    root.classList.remove('is-trick-shake-normal', 'is-trick-shake-special');
  }, isSpecial ? 150 : 100);
}

function showKingdomTrickWinEmphasis(card, effectKind = 'normal', durationMs = 220) {
  if (!ui.trick || !card) return;
  ui.trick.querySelectorAll('.tarot-kingdom-trick-emphasis').forEach((node) => node.remove());
  const overlay = document.createElement('div');
  overlay.className = 'tarot-kingdom-trick-emphasis';
  if (effectKind !== 'normal') overlay.classList.add('is-special');
  const node = cardNode(card, { clickable: false });
  node.classList.add('tarot-kingdom-trick-emphasis-card');
  overlay.appendChild(node);
  ui.trick.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('run'));
  setTimeout(() => {
    overlay.classList.remove('run');
    overlay.remove();
  }, Math.max(180, Number(durationMs) || 220) + 80);
}

function getSpriteIndex(card) {
  if (!card) return TAROT_BACK_INDEX;
  if (card.kind === 'major') return 80 + Number(card.number || 0);
  const n = Number(card.number || 1) - 1;
  const off = card.suit === 'Wand' ? 0 : card.suit === 'Pentacle' ? 20 : card.suit === 'Cup' ? 40 : 60;
  return off + Math.max(0, n);
}

function spritePos(index) {
  const cols = Math.floor(512 / TAROT_TILE_W);
  const x = (index % cols) * TAROT_TILE_W;
  const y = Math.floor(index / cols) * TAROT_TILE_H;
  return { x, y };
}

function straightHigh(vals) {
  const u = Array.from(new Set(vals.slice().sort((a, b) => b - a)));
  if (u.length !== 5) return null;
  // Wheel straight support: A(15)-2-3-4-5
  if (u.includes(15)) {
    const lowWheel = [5, 4, 3, 2].every((n) => u.includes(n));
    if (lowWheel) return 5;
  }
  for (let i = 1; i < 5; i += 1) if (u[i - 1] - u[i] !== 1) return null;
  return u[0];
}

function compareRole(a, b) {
  if (!a && !b) return 0;
  if (a && !b) return 1;
  if (!a && b) return -1;
  if (a.strength !== b.strength) return a.strength > b.strength ? 1 : -1;
  return cmpVec(a.primary, b.primary);
}

function evalRoleVariant(res, src) {
  const world = src.find((c) => c.kind === 'major' && c.number === 21);
  if (world) {
    const others = src.filter((c) => c !== world);
    if (others.length === 4 && others.every((c) => !hasCourt(c)) && others.reduce((a, c) => a + idNum(c), 0) === 21) {
      return {
        key: 'TheWorld',
        label: ROLE_LABEL.TheWorld,
        strength: ROLE_ST.TheWorld,
        baseRate: ROLE_RATE.TheWorld,
        effectiveRate: ROLE_RATE.TheWorld,
        primary: others.map((c) => cStrength(c)).sort((a, b) => b - a),
        suitVec: res.map((r) => suitTierForCard(r.src, r.suit)).sort((a, b) => b - a)
      };
    }
  }

  const vals = res.map((r) => r.v).sort((a, b) => b - a);
  const by = new Map();
  res.forEach((r) => { const list = by.get(r.v) || []; list.push(r); by.set(r.v, list); });
  const grp = Array.from(by.entries()).map(([v, list]) => ({ v: Number(v), n: list.length })).sort((a, b) => b.n - a.n || b.v - a.v);
  const flush = res.every((r) => r.suit !== 'None' && r.suit === res[0].suit);
  const st = straightHigh(vals);
  let key = null, primary = [];
  if ((grp[0]?.n || 0) >= 5) { key = 'FiveKind'; primary = [grp[0].v]; }
  else if (st && flush) { key = 'StraightFlush'; primary = [st]; }
  else if ((grp[0]?.n || 0) === 4) { key = 'FourKind'; primary = [grp[0].v, grp.find((x) => x.v !== grp[0].v)?.v || 0]; }
  else if ((grp[0]?.n || 0) === 3 && (grp[1]?.n || 0) === 2) { key = 'FullHouse'; primary = [grp[0].v, grp[1].v]; }
  else if (flush) { key = 'Flush'; primary = vals.slice(); }
  else if (st) { key = 'Straight'; primary = [st]; }
  if (!key) return null;
  return {
    key,
    label: ROLE_LABEL[key],
    strength: ROLE_ST[key],
    baseRate: ROLE_RATE[key],
    effectiveRate: ROLE_RATE[key],
    primary,
    suitVec: res.map((r) => suitTierForCard(r.src, r.suit)).sort((a, b) => b - a)
  };
}

function evalRole(cards, lockSuit = null) {
  if (!Array.isArray(cards) || cards.length !== 5) return null;
  const options = cards.map((c) => {
    const raws = roleNumberOptions(c);
    const suits = c.kind === 'major' && c.number === 1 ? SUITS.slice() : [suitsForCard(c, true)[0] || 'None'];
    const out = [];
    raws.forEach((raw) => {
      suits.forEach((suit) => {
        const value = (c.kind === 'major' && c.number === 1 && Number(raw) === 1) ? 1 : setRankFromNumber(raw);
        out.push({ src: c, v: value, raw: Number(raw), suit });
      });
    });
    return out;
  });
  let best = null;
  const walk = (i, picked) => {
    if (i >= options.length) {
      if (lockSuit && !picked.every((r) => r.suit === lockSuit)) return;
      const role = evalRoleVariant(picked, cards);
      if (role && (!best || compareRole(role, best) > 0)) best = role;
      return;
    }
    options[i].forEach((row) => {
      if (lockSuit && row.suit !== lockSuit) return;
      picked.push(row);
      walk(i + 1, picked);
      picked.pop();
    });
  };
  walk(0, []);
  return best;
}

function initState() {
  return {
    players: PLAYERS.map((p) => ({ ...p, chips: START_CHIPS, hand: [], discard: [], bet: 0, stars: 0 })),
    handNo: 0,
    turnCount: 0,
    dealer: 0,
    turn: 0,
    phase: 'idle',
    roundActive: false,
    openingDealRevealCount: 0,
    openingDealFlipIndex: -1,
    trick: null,
    leadRequiredOwner: null,
    lastPlay: null,
    pass: [false, false, false, false],
    callOnly: false,
    lock: null,
    trickForcedCount: 0,
    passDrawAuraOwner: null,
    starGainAuraOwner: null,
    starDrainAuraOwner: null,
    passStarDrainAuraOwner: null,
    hermitPreview: null,
    reverse: false,
    reversePersist: false,
    reversePersistSuspendOwner: null,
    minorDeck: [],
    majorDeck: [],
    openOracleCard: null,
    openOracle: null,
    openOracleRevealed: false,
    hiddenOracleCard: null,
    hiddenOracleRevealed: false,
    pendingDraw: null,
    pendingDrawReason: null,
    pendingJudgment: null,
    callMergeFx: null,
    trickDefeatFx: null,
    trickTransitionKind: null,
    graveOpen: false,
    handSortFreezeUntil: 0,
    selected: new Set(),
    pot: 0,
    logs: [],
    awaitRoundConfirm: false,
    roundSettlement: null,
    message: '「新しい戦いを始める」を押してください。',
    champion: null
  };
}

function clearRoundState() {
  clearSettlementGainFx();
  clearRoundStartCinematicTimer();
  clearOpeningDealTimers();
  s.trick = null;
  s.leadRequiredOwner = null;
  s.lastPlay = null;
  s.pass = [false, false, false, false];
  s.callOnly = false;
  s.lock = null;
  s.trickForcedCount = 0;
  s.passDrawAuraOwner = null;
  s.starGainAuraOwner = null;
  s.starDrainAuraOwner = null;
  s.passStarDrainAuraOwner = null;
  s.hermitPreview = null;
  if (!s.reversePersist) s.reverse = false;
  s.reversePersistSuspendOwner = null;
  s.pendingDraw = null;
  s.pendingDrawReason = null;
  s.pendingJudgment = null;
  s.callMergeFx = null;
  s.trickDefeatFx = null;
  s.trickTransitionKind = null;
  s.graveOpen = false;
  s.handSortFreezeUntil = 0;
  s.openingDealRevealCount = 0;
  s.openingDealFlipIndex = -1;
  s.selected.clear();
  s.awaitRoundConfirm = false;
  s.roundSettlement = null;
  s.players.forEach((p) => { p.hand = []; p.discard = []; p.bet = 0; });
}

function getLocalPlayerIndex() {
  if (!s?.players) return -1;
  const seat = Number(tkNet.localSeat);
  if (Number.isInteger(seat) && seat >= 0 && seat < s.players.length) return seat;
  if (isNetModeActive()) return -1;
  const fallback = s.players.findIndex((p) => !p?.isNpc);
  return fallback >= 0 ? fallback : 0;
}

function isLocalPlayer(index) {
  return Number(index) === getLocalPlayerIndex();
}

function isNpcPlayer(index) {
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0) return false;
  // Keep local seat controllable even when presence sync is delayed.
  if (idx === getLocalPlayerIndex()) return false;
  const p = s?.players?.[idx];
  return !!p?.isNpc;
}

function isHumanTurnActiveNow() {
  const me = getLocalPlayerIndex();
  if (me < 0 || !s) return false;
  return !!(s.roundActive && s.phase === 'turn' && s.turn === me);
}

function clearYourTurnBadge() {
  if (humanTurnBadgeTimer) {
    clearTimeout(humanTurnBadgeTimer);
    humanTurnBadgeTimer = null;
  }
  if (ui.yourTurnBadge) {
    ui.yourTurnBadge.classList.remove('show');
    ui.yourTurnBadge.hidden = true;
  }
}

function showHumanTurnCue() {
  const me = getLocalPlayerIndex();
  if (me < 0) return;

  if (ui.kingdomCutin) {
    ui.kingdomCutin.textContent = 'あなたのターン';
    ui.kingdomCutin.classList.remove(
      'is-player',
      'is-cpu',
      'is-showdown-win',
      'is-showdown-lose',
      'is-showdown-draw',
      'is-kingdom-skip',
      'is-kingdom-cut',
      'is-kingdom-reverse',
      'is-kingdom-lock',
      'is-kingdom-call',
      'is-kingdom-role',
      'is-kingdom-round-end',
      'is-kingdom-your-turn'
    );
    ui.kingdomCutin.classList.add('is-player', 'is-kingdom-your-turn', 'show');
    if (kingdomCutinTimer) clearTimeout(kingdomCutinTimer);
    kingdomCutinTimer = setTimeout(() => {
      ui.kingdomCutin?.classList.remove(
        'show',
        'is-player',
        'is-cpu',
        'is-showdown-win',
        'is-showdown-lose',
        'is-showdown-draw',
        'is-kingdom-skip',
        'is-kingdom-cut',
        'is-kingdom-reverse',
        'is-kingdom-lock',
        'is-kingdom-call',
        'is-kingdom-role',
        'is-kingdom-round-end',
        'is-kingdom-your-turn'
      );
      kingdomCutinTimer = null;
    }, 600);
  }

  if (ui.yourTurnBadge) {
    clearYourTurnBadge();
    ui.yourTurnBadge.hidden = false;
    ui.yourTurnBadge.classList.remove('show');
    void ui.yourTurnBadge.offsetWidth;
    ui.yourTurnBadge.classList.add('show');
  }

  vibrateOnce(24);
}

function syncHumanTurnCueState() {
  const now = isHumanTurnActiveNow();
  if (now && !lastHumanTurnActive) {
    showHumanTurnCue();
  } else if (!now && lastHumanTurnActive) {
    clearYourTurnBadge();
  }
  lastHumanTurnActive = now;
}

function getTarotKingdomRoomId() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search || '');
  const room = String(params.get('tkRoom') || '').trim();
  return room.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function generateTarotKingdomRoomId() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `tk_${t}${r}`;
}

function isPermissionDeniedError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  return code.includes('PERMISSION_DENIED') || /permission\s*denied/i.test(msg);
}

async function waitForTkUid(timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const uid = String(window.__tkUid || '');
    if (uid) return uid;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return String(window.__tkUid || '');
}

function isRoomInProgressFromStatePayload(payload) {
  const st = payload?.state || null;
  if (!st || typeof st !== 'object') return false;
  if (st.roundActive) return true;
  if (Number(st.handNo || 0) > 0) return true;
  if (st.awaitRoundConfirm) return true;
  if (String(st.phase || '') === 'done') return true;
  return false;
}

async function readRoomPresenceCount(db, roomPath) {
  const snap = await get(ref(db, `${roomPath}/presence`));
  if (!snap.exists()) return 0;
  const obj = snap.val() || {};
  return Object.keys(obj).length;
}

async function registerOpenRoomIndex(db, roomId) {
  if (!netOpenRoomIndexEnabled) return;
  const now = Date.now();
  try {
    await set(ref(db, `${TK_MATCH_ROOT}/openRooms/${roomId}`), {
      roomId,
      createdAt: now,
      updatedAt: now
    });
  } catch (error) {
    if (isPermissionDeniedError(error)) netOpenRoomIndexEnabled = false;
    throw error;
  }
}

async function pickJoinableOpenRoom(db) {
  if (!netOpenRoomIndexEnabled) return '';
  let openSnap;
  try {
    openSnap = await get(ref(db, `${TK_MATCH_ROOT}/openRooms`));
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      netOpenRoomIndexEnabled = false;
      return '';
    }
    throw error;
  }
  if (!openSnap.exists()) return '';
  const openMap = openSnap.val() || {};
  const entries = Object.entries(openMap).sort((a, b) => {
    const ta = Number(a?.[1]?.createdAt || 0);
    const tb = Number(b?.[1]?.createdAt || 0);
    return ta - tb;
  });
  for (const [roomId] of entries) {
    const roomPath = `tarotKingdomRooms/${roomId}`;
    const stateSnap = await get(ref(db, `${roomPath}/state`));
    const payload = stateSnap.exists() ? stateSnap.val() : null;
    const inProgress = isRoomInProgressFromStatePayload(payload);
    const count = await readRoomPresenceCount(db, roomPath);
    if (inProgress || count >= 4) {
      await remove(ref(db, `${TK_MATCH_ROOT}/openRooms/${roomId}`)).catch((error) => {
        if (isPermissionDeniedError(error)) netOpenRoomIndexEnabled = false;
      });
      continue;
    }
    return roomId;
  }
  return '';
}

async function pickJoinableFallbackRoom(db) {
  for (let i = 0; i < TK_FALLBACK_AUTO_ROOM_COUNT; i += 1) {
    const roomId = `tk_auto_${i}`;
    const roomPath = `tarotKingdomRooms/${roomId}`;
    const stateSnap = await get(ref(db, `${roomPath}/state`)).catch(() => null);
    const payload = stateSnap?.exists?.() ? stateSnap.val() : null;
    const inProgress = isRoomInProgressFromStatePayload(payload);
    const count = await readRoomPresenceCount(db, roomPath).catch(() => 0);
    if (!inProgress && count < 4) return roomId;
  }
  return `tk_auto_${Math.floor(Math.random() * TK_FALLBACK_AUTO_ROOM_COUNT)}`;
}

async function findOrCreateAutoRoomId(db) {
  const joinable = await pickJoinableOpenRoom(db);
  if (joinable) return joinable;
  if (!netOpenRoomIndexEnabled) {
    return pickJoinableFallbackRoom(db);
  }
  const roomId = generateTarotKingdomRoomId();
  try {
    await registerOpenRoomIndex(db, roomId);
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      netOpenRoomIndexEnabled = false;
      return pickJoinableFallbackRoom(db);
    }
    throw error;
  }
  return roomId;
}

function isNetModeActive() {
  return !!(tkNet.enabled && tkNet.db && tkNet.roomPath && tkNet.uid);
}

function isHostAuthority() {
  return !isNetModeActive() || !!tkNet.isHost;
}

function serializeStateForNet() {
  if (!s) return null;
  const next = JSON.parse(JSON.stringify(s, (key, value) => {
    if (value instanceof Set) return [];
    return value;
  }));
  next.selected = [];
  return {
    schema: KINGDOM_NET_SCHEMA_VERSION,
    updatedAt: Date.now(),
    state: next
  };
}

function deserializeStateFromNet(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const rawState = payload?.state;
  if (!rawState || typeof rawState !== 'object') return null;

  const base = initState();
  const nextState = { ...base, ...rawState };

  const incomingPlayers = Array.isArray(rawState.players) ? rawState.players : [];
  nextState.players = base.players.map((playerBase, idx) => {
    const incoming = (incomingPlayers[idx] && typeof incomingPlayers[idx] === 'object')
      ? incomingPlayers[idx]
      : {};
    const bet = Number(incoming.bet);
    const stars = Number(incoming.stars);
    return {
      ...playerBase,
      ...incoming,
      hand: Array.isArray(incoming.hand) ? incoming.hand : [],
      discard: Array.isArray(incoming.discard) ? incoming.discard : [],
      bet: Number.isFinite(bet) ? bet : Number(playerBase.bet || 0),
      stars: Number.isFinite(stars) ? stars : Number(playerBase.stars || 0)
    };
  });

  const incomingPass = Array.isArray(rawState.pass) ? rawState.pass : [];
  nextState.pass = PLAYERS.map((_, idx) => !!incomingPass[idx]);
  nextState.logs = Array.isArray(rawState.logs) ? rawState.logs : [];
  nextState.selected = new Set();
  return nextState;
}

function shouldRoomStayOpen() {
  if (!s) return false;
  if (s.roundActive) return false;
  if (Number(s.handNo || 0) > 0) return false;
  if (s.awaitRoundConfirm) return false;
  if (String(s.phase || '') === 'done') return false;
  return true;
}

async function syncOpenRoomIndex() {
  if (!isNetModeActive() || !tkNet.isHost || !tkNet.roomId || !netOpenRoomIndexEnabled) return;
  const openRef = ref(tkNet.db, `${TK_MATCH_ROOT}/openRooms/${tkNet.roomId}`);
  try {
    if (shouldRoomStayOpen()) {
      const now = Date.now();
      await set(openRef, { roomId: tkNet.roomId, createdAt: now, updatedAt: now });
    } else {
      await remove(openRef).catch(() => {});
    }
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      netOpenRoomIndexEnabled = false;
    } else {
      throw error;
    }
  }
}

async function publishStateToRoom(force = false) {
  if (!isNetModeActive() || !tkNet.isHost || !s) return;
  const payload = serializeStateForNet();
  if (!payload) return;
  const hash = JSON.stringify(payload.state);
  if (!force && hash === netLastStateHash) return;
  netLastStateHash = hash;
  try {
    if (KINGDOM_TRACE_ENABLED) {
      console.debug(`[TK-NET] publish state room=${tkNet.roomId} phase=${s.phase} turn=${s.turn} force=${force}`);
    }
    await set(ref(tkNet.db, `${tkNet.roomPath}/state`), payload);
    await syncOpenRoomIndex();
  } catch (error) {
    console.warn('[tarotKingdom] failed to publish room state:', error);
  }
}

function queueStatePublish(force = false) {
  if (!isNetModeActive() || !tkNet.isHost) return;
  if (netActionWriteTimer) {
    if (force) {
      clearTimeout(netActionWriteTimer);
      netActionWriteTimer = null;
    } else {
      return;
    }
  }
  netActionWriteTimer = setTimeout(() => {
    netActionWriteTimer = null;
    publishStateToRoom(force).catch((error) => {
      console.warn('[tarotKingdom] publish queue failed:', error);
    });
  }, force ? 0 : KINGDOM_NET_STATE_WRITE_DELAY);
}

function applyPresenceToPlayers() {
  if (!s?.players || !isNetModeActive()) return;
  const fallbackNames = ['あなた', 'NPC1', 'NPC2', 'NPC3'];
  const seatTaken = [null, null, null, null];
  Object.entries(netPresenceByUid || {}).forEach(([uid, info]) => {
    const seat = Number(info?.seat);
    if (!Number.isInteger(seat) || seat < 0 || seat >= 4) return;
    seatTaken[seat] = { uid, ...info };
  });

  const localSeat = Number(tkNet.localSeat);
  if (Number.isInteger(localSeat) && localSeat >= 0 && localSeat < 4) {
    const localName = String(
      tkNet.localPlayerName
      || window.myPlayFabDisplayName
      || window.myLineProfile?.displayName
      || fallbackNames[localSeat]
      || `P${localSeat + 1}`
    );
    seatTaken[localSeat] = {
      ...(seatTaken[localSeat] || {}),
      uid: tkNet.uid,
      seat: localSeat,
      displayName: localName,
      name: localName
    };
  }

  const now = Date.now();
  for (let i = 0; i < s.players.length; i += 1) {
    const p = s.players[i];
    const occ = seatTaken[i];
    if (occ) {
      const occName = String(occ.displayName || occ.name || fallbackNames[i] || `P${i + 1}`);
      p.isNpc = false;
      p.name = occName;
      p.uid = occ.uid || null;
      presenceGraceBySeat[i] = { uid: p.uid, name: occName, until: now + PRESENCE_AWAY_GRACE_MS };
      continue;
    }
    const grace = presenceGraceBySeat[i];
    if (grace && Number(grace.until || 0) > now) {
      p.isNpc = false;
      p.name = String(grace.name || fallbackNames[i] || `P${i + 1}`);
      p.uid = grace.uid || null;
      continue;
    }
    p.isNpc = true;
    p.name = fallbackNames[i] || `NPC${i}`;
    p.uid = null;
    presenceGraceBySeat[i] = { uid: null, name: '', until: 0 };
  }
}

function formatOpenRoomLabel(roomId, item, count, currentRoomId) {
  const idShort = String(roomId || '').slice(-6);
  const members = Math.max(0, Number(count || 0));
  const suffix = roomId === currentRoomId ? ' (参加中)' : '';
  const seatText = Number.isFinite(members) ? `${members}/4` : '-/4';
  const updated = Number(item?.updatedAt || item?.createdAt || 0);
  const ageSec = updated > 0 ? Math.max(0, Math.floor((Date.now() - updated) / 1000)) : null;
  const ageText = ageSec != null ? ` ${ageSec}s` : '';
  return `#${idShort} ${seatText}${ageText}${suffix}`;
}

function getActiveSeatCount() {
  const taken = new Set();
  Object.values(netPresenceByUid || {}).forEach((info) => {
    const seat = Number(info?.seat);
    if (Number.isInteger(seat) && seat >= 0 && seat < 4) taken.add(seat);
  });
  return taken.size;
}

function shouldShowOpenRoomsLobby() {
  if (!s) return true;
  if (s.roundActive) return false;
  if (Number(s.handNo || 0) > 0) return false;
  if (s.awaitRoundConfirm) return false;
  const phase = String(s.phase || '');
  if (phase === 'roundEnd' || phase === 'done') return false;
  return true;
}

function setOpenRoomsVisibility(visible) {
  if (!ui.openRoomsWrap) return;
  ui.openRoomsWrap.hidden = !visible;
  ui.openRoomsWrap.style.display = visible ? '' : 'none';
}

function renderOpenRoomsList(roomRows = []) {
  const wrap = ui.openRoomsWrap;
  const listEl = ui.openRoomsList;
  if (!wrap || !listEl) return;
  if (!shouldShowOpenRoomsLobby()) {
    listEl.innerHTML = '';
    setOpenRoomsVisibility(false);
    return;
  }
  setOpenRoomsVisibility(true);
  if (!isNetModeActive()) {
    listEl.innerHTML = '';
    const status = document.createElement('span');
    status.className = 'tarot-kingdom-openrooms-item';
    const hasDb = !!window.__tkDb;
    const hasUid = !!window.__tkUid;
    if (!hasDb) status.textContent = 'マルチ接続準備中です。';
    else if (!hasUid) status.textContent = 'ログイン認証待機中です。';
    else status.textContent = 'マルチ接続に失敗しました。タブを開き直してください。';
    listEl.appendChild(status);
    return;
  }
  listEl.innerHTML = '';
  if (!netOpenRoomIndexEnabled) {
    const info = document.createElement('span');
    info.className = 'tarot-kingdom-openrooms-item';
    info.textContent = '受付一覧は権限未設定のため簡易マッチで接続中です。';
    listEl.appendChild(info);
    return;
  }
  if (!roomRows.length) {
    const empty = document.createElement('span');
    empty.className = 'tarot-kingdom-openrooms-item';
    empty.textContent = '募集中の部屋はありません。';
    listEl.appendChild(empty);
    return;
  }
  roomRows.forEach((row) => {
    const item = document.createElement('span');
    item.className = 'tarot-kingdom-openrooms-item';
    if (row.roomId === tkNet.roomId) item.classList.add('is-current');
    item.textContent = row.label;
    listEl.appendChild(item);
  });
}

async function refreshOpenRoomsPanel() {
  if (!ui.openRoomsWrap || !ui.openRoomsList) return;
  if (!tkNet.db) {
    renderOpenRoomsList([]);
    return;
  }
  if (!netOpenRoomIndexEnabled) {
    renderOpenRoomsList([]);
    return;
  }
  const entries = Object.entries(netOpenRoomsCache || {});
  if (!entries.length) {
    renderOpenRoomsList([]);
    return;
  }
  const rows = [];
  for (const [roomId, item] of entries) {
    const roomPath = `tarotKingdomRooms/${roomId}`;
    const presenceCount = await readRoomPresenceCount(tkNet.db, roomPath).catch(() => 0);
    rows.push({
      roomId,
      label: formatOpenRoomLabel(roomId, item, presenceCount, tkNet.roomId),
      updatedAt: Number(item?.updatedAt || item?.createdAt || 0)
    });
  }
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  renderOpenRoomsList(rows);
}

async function claimHostIfNeeded() {
  if (!isNetModeActive()) return;
  try {
    const hostRef = ref(tkNet.db, `${tkNet.roomPath}/meta/hostUid`);
    const snap = await get(hostRef);
    const current = snap.exists() ? String(snap.val() || '') : '';
    if (!current) {
      await set(hostRef, tkNet.uid);
      tkNet.hostUid = tkNet.uid;
      tkNet.isHost = true;
    } else {
      tkNet.hostUid = current;
      tkNet.isHost = current === tkNet.uid;
    }
  } catch (error) {
    console.warn('[tarotKingdom] host claim failed:', error);
  }
}

async function ensureSeatAssignment() {
  if (!isNetModeActive()) return -1;
  const pickSeat = (usedSet) => {
    for (let i = 0; i < 4; i += 1) {
      if (!usedSet.has(i)) return i;
    }
    return -1;
  };

  // Preferred path: fixed seat table in meta.
  try {
    const seatRef = ref(tkNet.db, `${tkNet.roomPath}/meta/seatByUid/${tkNet.uid}`);
    const existingSeat = await get(seatRef);
    if (existingSeat.exists()) {
      const fixed = Number(existingSeat.val());
      tkNet.localSeat = Number.isInteger(fixed) ? fixed : -1;
      return tkNet.localSeat;
    }
    const allSeatSnap = await get(ref(tkNet.db, `${tkNet.roomPath}/meta/seatByUid`));
    const allSeatByUid = allSeatSnap.exists() ? (allSeatSnap.val() || {}) : {};
    const used = new Set(
      Object.values(allSeatByUid)
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n >= 0 && n < 4)
    );
    const seat = pickSeat(used);
    tkNet.localSeat = seat;
    if (seat >= 0) {
      await set(seatRef, seat);
    }
    return seat;
  } catch (error) {
    if (!isPermissionDeniedError(error)) throw error;
    console.warn('[tarotKingdom] seatByUid permission denied. fallback to presence-based seat assignment.');
  }

  // Fallback path: presence only (works with stricter rules that deny /meta writes).
  try {
    const presenceSnap = await get(ref(tkNet.db, `${tkNet.roomPath}/presence`));
    const presenceMap = presenceSnap.exists() ? (presenceSnap.val() || {}) : {};
    const myPresence = presenceMap?.[tkNet.uid];
    const existing = Number(myPresence?.seat);
    if (Number.isInteger(existing) && existing >= 0 && existing < 4) {
      tkNet.localSeat = existing;
      return existing;
    }
    const used = new Set(
      Object.values(presenceMap)
        .map((v) => Number(v?.seat))
        .filter((n) => Number.isInteger(n) && n >= 0 && n < 4)
    );
    const seat = pickSeat(used);
    tkNet.localSeat = seat;
    return seat;
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      console.warn('[tarotKingdom] presence read also permission denied. fallback to seat=0.');
      tkNet.localSeat = 0;
      return 0;
    }
    throw error;
  }
}

async function sendRoomAction(action) {
  if (!isNetModeActive() || !action || typeof action !== 'object') return false;
  if (tkNet.localSeat < 0) return false;
  try {
    const payload = {
      ...action,
      uid: tkNet.uid,
      seat: tkNet.localSeat,
      sentAt: Date.now()
    };
    if (KINGDOM_TRACE_ENABLED) {
      console.debug(`[TK-NET] send action room=${tkNet.roomId} seat=${tkNet.localSeat} type=${payload.type}`);
    }
    await push(ref(tkNet.db, `${tkNet.roomPath}/actions`), payload);
    return true;
  } catch (error) {
    console.warn('[tarotKingdom] failed to send action:', error);
    return false;
  }
}

function stopHostActionListener() {
  if (typeof netActionHostUnsub === 'function') {
    netActionHostUnsub();
    netActionHostUnsub = null;
  }
}

function stopRoomSubscriptions() {
  if (typeof netHostUidUnsub === 'function') {
    netHostUidUnsub();
    netHostUidUnsub = null;
  }
  if (typeof netStateUnsub === 'function') {
    netStateUnsub();
    netStateUnsub = null;
  }
  if (typeof netPresenceUnsub === 'function') {
    netPresenceUnsub();
    netPresenceUnsub = null;
  }
  if (typeof netOpenRoomsUnsub === 'function') {
    netOpenRoomsUnsub();
    netOpenRoomsUnsub = null;
  }
  stopHostActionListener();
}

function handleHostRoomAction(payload, key) {
  if (!isNetModeActive() || !tkNet.isHost || !s) return;
  if (!payload || typeof payload !== 'object') return;
  const seat = Number(payload.seat);
  if (!Number.isInteger(seat) || seat < 0 || seat >= 4) return;
  const type = String(payload.type || '');
  if (KINGDOM_TRACE_ENABLED) {
    console.debug(`[TK-NET] host action key=${key} type=${type} seat=${seat} phase=${s.phase} turn=${s.turn}`);
  }
  switch (type) {
    case 'startOrNext':
      startOrNext();
      break;
    case 'confirmRound':
      confirmRoundSettlement();
      break;
    case 'play': {
      if (!s.roundActive) break;
      if (s.phase === 'draw' && s.pendingDraw === seat) {
        s.pendingDraw = null;
        s.pendingDrawReason = null;
        s.phase = 'turn';
        s.turn = seat;
      }
      if (!(s.phase === 'turn' && s.turn === seat)) break;
      const play = payload.play && typeof payload.play === 'object' ? payload.play : null;
      if (!play) break;
      play.owner = seat;
      const mode = play.type === 'role' && play.call ? 'call' : 'normal';
      const valid = validatePlay(play, mode);
      if (!valid.ok) break;
      applyPlay(seat, play);
      break;
    }
    case 'pass':
      if (s.roundActive && s.phase === 'turn' && s.turn === seat) {
        passAction(seat);
      }
      break;
    case 'draw':
      if (s.roundActive && s.phase === 'draw' && s.pendingDraw === seat) {
        applyDrawChoice(String(payload.deckType || 'minor'));
      }
      break;
    case 'hangedMan':
      if (s.roundActive && s.phase === 'turn' && s.turn === seat) {
        useHangedManAction(seat, Array.isArray(payload.selectedIndexes) ? payload.selectedIndexes : []);
      }
      break;
    case 'judgmentPick':
      if (s.roundActive && s.phase === 'judgment' && s.pendingJudgment === seat) {
        applyJudgmentPick(Number(payload.owner), Number(payload.cardIndex));
      }
      break;
    case 'judgmentSkip':
      if (s.roundActive && s.phase === 'judgment' && s.pendingJudgment === seat) {
        skipJudgmentPick();
      }
      break;
    default:
      break;
  }
  queueStatePublish();
  if (key) {
    remove(ref(tkNet.db, `${tkNet.roomPath}/actions/${key}`)).catch(() => {});
  }
}

function startHostActionListener() {
  if (!isNetModeActive() || !tkNet.isHost) {
    stopHostActionListener();
    return;
  }
  if (typeof netActionHostUnsub === 'function') return;
  const actionsRef = ref(tkNet.db, `${tkNet.roomPath}/actions`);
  netActionHostUnsub = onChildAdded(actionsRef, (snapshot) => {
    const key = snapshot.key || '';
    if (!key) return;
    if (netHandledActionKeys.has(key)) return;
    netHandledActionKeys.add(key);
    const payload = snapshot.val();
    handleHostRoomAction(payload, key);
  });
}

function applyRemoteRoomState(payload) {
  const next = deserializeStateFromNet(payload);
  if (!next) return;
  const localSeat = Number(tkNet.localSeat);
  const prevSelectedKeys = [];
  if (
    s
    && Number.isInteger(localSeat)
    && localSeat >= 0
    && Array.isArray(s.players)
    && Array.isArray(s.players[localSeat]?.hand)
    && s.selected instanceof Set
  ) {
    const prevHand = s.players[localSeat].hand;
    const keyOf = (card) => {
      if (!card || typeof card !== 'object') return '';
      if (card.id != null) return `id:${String(card.id)}`;
      return [
        card.kind || '',
        card.suit || '',
        card.number ?? '',
        card.arcanaNo ?? '',
        card.name || ''
      ].join('|');
    };
    Array.from(s.selected)
      .map((idx) => Number(idx))
      .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < prevHand.length)
      .forEach((idx) => {
        const key = keyOf(prevHand[idx]);
        if (key) prevSelectedKeys.push(key);
      });
  }
  s = next;
  if (
    prevSelectedKeys.length > 0
    && Number.isInteger(localSeat)
    && localSeat >= 0
    && Array.isArray(s.players)
    && Array.isArray(s.players[localSeat]?.hand)
  ) {
    const hand = s.players[localSeat].hand;
    const used = new Set();
    const keyOf = (card) => {
      if (!card || typeof card !== 'object') return '';
      if (card.id != null) return `id:${String(card.id)}`;
      return [
        card.kind || '',
        card.suit || '',
        card.number ?? '',
        card.arcanaNo ?? '',
        card.name || ''
      ].join('|');
    };
    const restored = [];
    prevSelectedKeys.forEach((key) => {
      for (let i = 0; i < hand.length; i += 1) {
        if (used.has(i)) continue;
        if (keyOf(hand[i]) !== key) continue;
        restored.push(i);
        used.add(i);
        break;
      }
    });
    s.selected = new Set(restored);
  }
  applyPresenceToPlayers();
  enforceLeadTurnInvariant();
  render();
}

function startRoomSubscriptions() {
  if (!isNetModeActive()) return;
  stopRoomSubscriptions();

  const hostUidRef = ref(tkNet.db, `${tkNet.roomPath}/meta/hostUid`);
  netHostUidUnsub = onValue(hostUidRef, (snap) => {
    const prevHost = !!tkNet.isHost;
    const hostUid = snap.exists() ? String(snap.val() || '') : '';
    tkNet.hostUid = hostUid;
    tkNet.isHost = hostUid && hostUid === tkNet.uid;
    if (!hostUid) {
      claimHostIfNeeded().catch((error) => {
        console.warn('[tarotKingdom] host reclaim failed:', error);
      });
    }
    if (tkNet.isHost) {
      if (!prevHost) {
        netHandledActionKeys.clear();
      }
      startHostActionListener();
    } else {
      stopHostActionListener();
    }
  });

  const presenceRef = ref(tkNet.db, `${tkNet.roomPath}/presence`);
  netPresenceUnsub = onValue(presenceRef, (snapshot) => {
    netPresenceByUid = snapshot.exists() ? (snapshot.val() || {}) : {};
    if (s) {
      applyPresenceToPlayers();
      if (tkNet.isHost) queueStatePublish();
      render();
    }
  });

  const stateRef = ref(tkNet.db, `${tkNet.roomPath}/state`);
  netStateUnsub = onValue(stateRef, (snapshot) => {
    if (tkNet.isHost) return;
    if (!snapshot.exists()) return;
    applyRemoteRoomState(snapshot.val());
  });

  if (netOpenRoomIndexEnabled) {
    const openRoomsRef = ref(tkNet.db, `${TK_MATCH_ROOT}/openRooms`);
    netOpenRoomsUnsub = onValue(openRoomsRef, (snapshot) => {
      netOpenRoomsCache = snapshot.exists() ? (snapshot.val() || {}) : {};
      refreshOpenRoomsPanel().catch((error) => {
        console.warn('[tarotKingdom] failed to refresh open room panel:', error);
      });
    }, (error) => {
      if (isPermissionDeniedError(error)) {
        netOpenRoomIndexEnabled = false;
        netOpenRoomsCache = {};
        refreshOpenRoomsPanel().catch(() => {});
      } else {
        console.warn('[tarotKingdom] open rooms subscription failed:', error);
      }
    });
  }
}

function teardownTarotKingdomNetwork() {
  stopRoomSubscriptions();
  if (netActionWriteTimer) {
    clearTimeout(netActionWriteTimer);
    netActionWriteTimer = null;
  }
  if (tkNet.isHost && tkNet.db && tkNet.roomId && netOpenRoomIndexEnabled) {
    remove(ref(tkNet.db, `${TK_MATCH_ROOT}/openRooms/${tkNet.roomId}`)).catch(() => {});
  }
  if (tkNet.presenceRef && tkNet.db) {
    remove(tkNet.presenceRef).catch(() => {});
  }
  tkNet.enabled = false;
  tkNet.roomId = '';
  tkNet.roomPath = '';
  tkNet.db = null;
  tkNet.uid = '';
  tkNet.localSeat = -1;
  tkNet.isHost = false;
  tkNet.hostUid = '';
  tkNet.localPlayerName = '';
  tkNet.presenceRef = null;
  netPresenceByUid = {};
  presenceGraceBySeat.forEach((slot) => {
    slot.uid = null;
    slot.name = '';
    slot.until = 0;
  });
  netOpenRoomsCache = {};
  netHandledActionKeys.clear();
  netLastStateHash = '';
  netBootPromise = null;
  renderOpenRoomsList([]);
}

async function ensureTarotKingdomNetwork() {
  if (netBootPromise) return netBootPromise;
  netBootPromise = (async () => {
    try {
      const explicitRoomId = getTarotKingdomRoomId();
      const db = window.__tkDb || null;
      let uid = String(window.__tkUid || '');
      if (db && !uid) uid = await waitForTkUid(4000);
      if (!db || !uid) {
        teardownTarotKingdomNetwork();
        tkNet.localSeat = 0;
        return;
      }
      let roomId = explicitRoomId || (await findOrCreateAutoRoomId(db));
      if (!roomId) {
        teardownTarotKingdomNetwork();
        tkNet.localSeat = 0;
        return;
      }

      tkNet.enabled = true;
      tkNet.db = db;
      tkNet.uid = String(uid);
      tkNet.roomId = roomId;
      tkNet.roomPath = `tarotKingdomRooms/${roomId}`;
      tkNet.localPlayerName = String(window.myPlayFabDisplayName || window.myLineProfile?.displayName || window.myPlayFabId || 'Player');

      await ensureSeatAssignment();
      if (tkNet.localSeat < 0 && !explicitRoomId) {
        roomId = generateTarotKingdomRoomId();
        await registerOpenRoomIndex(db, roomId);
        tkNet.roomId = roomId;
        tkNet.roomPath = `tarotKingdomRooms/${roomId}`;
        await ensureSeatAssignment();
      }
      if (tkNet.localSeat < 0) {
        teardownTarotKingdomNetwork();
        tkNet.localSeat = 0;
        return;
      }
      await claimHostIfNeeded();

      if (tkNet.isHost) {
        try {
          await remove(ref(db, `${tkNet.roomPath}/actions`));
        } catch (_) {
          // ignore
        }
        netHandledActionKeys.clear();
        try {
          const hostDisc = onDisconnect(ref(db, `${tkNet.roomPath}/meta/hostUid`));
          await hostDisc.remove();
        } catch (_) {
          // ignore
        }
      }
      startRoomSubscriptions();

      const presenceRef = ref(db, `${tkNet.roomPath}/presence/${tkNet.uid}`);
      tkNet.presenceRef = presenceRef;
      const presencePayload = {
        uid: tkNet.uid,
        seat: tkNet.localSeat,
        displayName: tkNet.localPlayerName,
        playFabId: window.myPlayFabId || '',
        updatedAt: serverTimestamp()
      };
      await set(presenceRef, presencePayload);
      netPresenceByUid[tkNet.uid] = { ...presencePayload, updatedAt: Date.now() };
      try {
        const disc = onDisconnect(presenceRef);
        await disc.remove();
      } catch (_) {
        // ignore
      }

      if (tkNet.isHost) {
        const roomStateSnap = await get(ref(db, `${tkNet.roomPath}/state`));
        if (!roomStateSnap.exists()) {
          resetMatch();
          applyPresenceToPlayers();
          await publishStateToRoom(true);
        } else if (!s) {
          applyRemoteRoomState(roomStateSnap.val());
          applyPresenceToPlayers();
          queueStatePublish(true);
        }
        await syncOpenRoomIndex();
      } else {
        const roomStateSnap = await get(ref(db, `${tkNet.roomPath}/state`));
        if (roomStateSnap.exists()) {
          applyRemoteRoomState(roomStateSnap.val());
        }
      }
    } catch (error) {
      console.warn('[tarotKingdom] ensure network failed:', error);
      teardownTarotKingdomNetwork();
      tkNet.localSeat = 0;
    }
  })();
  try {
    await netBootPromise;
  } finally {
    netBootPromise = null;
  }
}

function resetMatch() {
  clearSettlementGainFx();
  s = initState();
  if (trickSwapTimer) { clearTimeout(trickSwapTimer); trickSwapTimer = null; }
  trickRenderKey = '';
  trickRenderToken += 1;
  if (stateErrorTimer) { clearTimeout(stateErrorTimer); stateErrorTimer = null; }
  clearOracleFlipTimers();
  clearCallCinematicTimer();
  clearRoundStartCinematicTimer();
  clearRoundOutCinematicTimer();
  clearOpeningDealTimers();
  clearYourTurnBadge();
  lastHumanTurnActive = false;
  if (kingdomCutinTimer) { clearTimeout(kingdomCutinTimer); kingdomCutinTimer = null; }
  if (kingdomOverlayTimer) { clearTimeout(kingdomOverlayTimer); kingdomOverlayTimer = null; }
  kingdomRowFxTimers.forEach((timerId) => clearTimeout(timerId));
  kingdomRowFxTimers.clear();
  ui.kingdomCutin?.classList.remove(
    'show',
    'is-player',
    'is-cpu',
    'is-showdown-win',
    'is-showdown-lose',
    'is-showdown-draw',
    'is-kingdom-skip',
    'is-kingdom-cut',
    'is-kingdom-reverse',
    'is-kingdom-lock',
    'is-kingdom-call',
    'is-kingdom-role',
    'is-kingdom-round-end',
    'is-kingdom-round-out',
    'is-kingdom-grand-win',
    'is-kingdom-your-turn'
  );
  ui.kingdomOverlay?.classList.remove('show', 'is-kingdom-clear', 'is-kingdom-draw', 'is-kingdom-roundend', 'is-kingdom-call', 'is-kingdom-call-freeze');
  s.openOracleCard = shuf(mkMajor())[0] || null;
  s.openOracle = openOracleRank(s.openOracleCard);
  s.openOracleRevealed = false;
  s.hiddenOracleCard = null;
  s.hiddenOracleRevealed = false;
  if (!isNetModeActive()) {
    tkNet.localSeat = 0;
    const fallbackName = String(window.myPlayFabDisplayName || window.myLineProfile?.displayName || 'あなた');
    s.players.forEach((p, idx) => {
      p.isNpc = idx !== tkNet.localSeat;
      if (idx === tkNet.localSeat) p.name = fallbackName;
      else p.name = idx === 1 ? 'NPC1' : (idx === 2 ? 'NPC2' : 'NPC3');
    });
  } else {
    applyPresenceToPlayers();
  }
}

function resolveReversePersistSuspend() {
  if (!s) return;
  const owner = s.reversePersistSuspendOwner;
  if (owner == null) return;
  if (!s.reversePersist) {
    s.reversePersistSuspendOwner = null;
    return;
  }
  if (!s.roundActive || s.phase !== 'turn') return;
  if (s.turn === owner) return;
  s.reverse = true;
  s.reversePersistSuspendOwner = null;
}

function enforceLeadTurnInvariant() {
  if (!s || !s.roundActive) return;
  if (s.phase !== 'turn') return;
  if (s.trick) {
    s.leadRequiredOwner = null;
    return;
  }
  if (s.leadRequiredOwner == null) s.leadRequiredOwner = s.turn;
  if (s.turn !== s.leadRequiredOwner) s.turn = s.leadRequiredOwner;
}

function setupHand() {
  clearNpcTimer();
  clearOpeningDealTimers();
  clearRoundState();
  // 表オラクルは毎局再抽選
  s.openOracleCard = shuf(mkMajor())[0] || null;
  s.openOracle = openOracleRank(s.openOracleCard);
  s.openOracleRevealed = false;
  s.hiddenOracleCard = null;
  s.hiddenOracleRevealed = false;
  if (s.reversePersist) s.reverse = true;
  s.roundActive = true;
  s.phase = 'openingDeal';
  s.leadRequiredOwner = null;
  s.turnCount = 1;
  s.minorDeck = shuf(mkMinor());
  s.majorDeck = shuf(mkMajor());
  for (let r = 0; r < START_HAND; r += 1) for (let i = 0; i < 4; i += 1) {
    const p = (s.dealer + i) % 4;
    const c = s.minorDeck.pop();
    if (c) s.players[p].hand.push(c);
  }
  s.players.forEach((p) => p.hand.sort((a, b) => cStrength(a) - cStrength(b)));
  s.players.forEach((p) => { p.stars = Math.max(0, Number(p.stars) || 0) + 1; });
  log(`第${s.handNo + 1}局開始 / 親: ${pName(s.dealer)}`);

  const opening = s.minorDeck.pop();
  if (opening) {
    const openingPlay = {
      type: 'set',
      owner: s.dealer,
      count: 1,
      selected: [],
      cardsHand: [opening],
      cardsTable: [opening],
      number: idNum(opening),
      setPower: cStrength(opening),
      suitMask: suitMaskForCards([opening]),
      suitTier: Math.max(...suitsForCard(opening, false).map((x) => suitTierForCard(opening, x)))
    };
    s.pass = [false, false, false, false];
    s.trick = openingPlay;
    s.lastPlay = openingPlay;
    log(`開始場札: ${getCardNameLabel(opening)}(${getCardNumberLabel(opening)})`);

    const fx = applySetEffects(openingPlay);
    if (fx.forceClear) {
      clearTrick(s.dealer);
      return;
    }
    if (fx.keepTurn) {
      s.turn = s.dealer;
    } else {
      s.turn = nextAlive(s.dealer, 1 + Math.max(0, fx.skip), false) ?? s.dealer;
    }
    s.message = `開始場札を公開。${pName(s.turn)}のターン`;
  } else {
    s.turn = s.dealer;
    s.message = `${pName(s.dealer)}が親です。カードを出してください。`;
  }
}

function playOpeningDealCinematic() {
  clearOpeningDealTimers();
  if (!s || !s.roundActive) return;
  const me = getLocalPlayerIndex();
  const handCount = Math.max(0, Number(s.players?.[me]?.hand?.length || 0));
  s.phase = 'openingDeal';
  s.openingDealRevealCount = 0;
  s.openingDealFlipIndex = -1;
  s.message = '配札中...';
  traceKingdomFlow('openingDeal.start', `handCount=${handCount}`);
  render();
  if (handCount <= 0) {
    playRoundStartCinematic();
    return;
  }

  const revealNext = () => {
    if (!s || !s.roundActive) return;
    if (s.phase !== 'openingDeal') return;
    const nextIndex = Math.max(0, Number(s.openingDealRevealCount || 0));
    if (nextIndex >= handCount) {
      s.openingDealFlipIndex = -1;
      render();
      traceKingdomFlow('openingDeal.end', `revealed=${nextIndex}`);
      playRoundStartCinematic();
      return;
    }

    s.openingDealFlipIndex = nextIndex;
    render();
    openingDealFlipTimer = setTimeout(() => {
      openingDealFlipTimer = null;
      if (!s || !s.roundActive || s.phase !== 'openingDeal') return;
      if (Number(s.openingDealFlipIndex ?? -1) !== nextIndex) return;
      s.openingDealRevealCount = nextIndex + 1;
      s.openingDealFlipIndex = -1;
      render();
      openingDealNextTimer = setTimeout(() => {
        openingDealNextTimer = null;
        revealNext();
      }, OPENING_HAND_FLIP_GAP_MS);
    }, OPENING_HAND_FLIP_MS);
  };

  openingDealStartTimer = setTimeout(() => {
    openingDealStartTimer = null;
    revealNext();
  }, OPENING_HAND_FLIP_START_DELAY_MS);
}

function playRoundStartCinematic() {
  clearRoundStartCinematicTimer();
  clearOpeningDealTimers();
  if (!s || !s.roundActive) return;
  const roundNo = Math.max(1, Number(s.handNo || 0) + 1);
  const currentTurn = s.turn;
  s.phase = 'openingCinematic';
  s.message = `第${roundNo}局 開始`;
  traceKingdomFlow('roundStartCinematic.start', `round=${roundNo} nextTurn=${currentTurn}`);
  triggerKingdomActionFx(currentTurn, `第${roundNo}局 開始`, {
    overlay: 'action',
    durationMs: ROUND_START_CINEMATIC_MS,
    cutin: true
  });
  render();
  roundStartCinematicTimer = setTimeout(() => {
    roundStartCinematicTimer = null;
    if (!s || !s.roundActive) return;
    if (s.phase !== 'openingCinematic') return;
    s.phase = 'turn';
    s.message = `${pName(s.turn)}のターン`;
    traceKingdomFlow('roundStartCinematic.end', `turn=${s.turn}`);
    scheduleNpc();
    render();
  }, ROUND_START_CINEMATIC_MS);
}
function nextAlive(from, steps = 1, onlyNotPassed = false) {
  let found = 0;
  for (let st = 1; st <= 20; st += 1) {
    const idx = (from + st) % 4;
    if (s.players[idx].hand.length <= 0) continue;
    if (onlyNotPassed && s.pass[idx]) continue;
    found += 1;
    if (found >= steps) return idx;
  }
  return null;
}

function allOthersPassed(lastPlayer) {
  for (let i = 0; i < 4; i += 1) {
    if (i === lastPlayer) continue;
    if (s.players[i].hand.length <= 0) continue;
    if (!s.pass[i]) return false;
  }
  return true;
}

function setCmp(aPower, bPower) {
  const a = Number(aPower || 0);
  const b = Number(bPower || 0);
  if (!s.reverse) return a === b ? 0 : (a > b ? 1 : -1);
  return a === b ? 0 : (a < b ? 1 : -1);
}

function buildSetPlay(pi, sel) {
  const p = s.players[pi];
  const forcedCount = Math.max(0, Number(s.trickForcedCount || 0));
  if (forcedCount > 0 && sel.length !== forcedCount) return { ok: false, reason: `${forcedCount}枚出しのみ有効です。` };
  if (![1, 2, 3].includes(sel.length)) return { ok: false, reason: '通常出しは1〜3枚です。' };
  const cards = sel.map((i) => p.hand[i]).filter(Boolean);
  if (cards.length !== sel.length) return { ok: false, reason: '選択が不正です。' };
  let n = chooseSetNumberCandidate(cards, !!s.reverse);
  if (n == null) return { ok: false, reason: '同じ数値で揃えてください。' };
  if (
    cards.length === 1 &&
    cards[0]?.kind === 'major' &&
    [16, 17, 18, 19].includes(Number(cards[0]?.number || 0))
  ) {
    n = 14;
  }
  if (s.lock?.suit && !cards.every((c) => suitsForCard(c, false).includes(s.lock.suit))) return { ok: false, reason: `スート縛り: ${SUIT_LABEL[s.lock.suit]}` };
  const allMagicianOne = Number(n) === 1 && cards.every((c) => c.kind === 'major' && Number(c.number) === 1);
  const setPower = allMagicianOne ? 1 : setRankFromNumber(n);
  if (s.lock?.min != null && cards.length === 1 && setPower <= s.lock.min) return { ok: false, reason: `${s.lock.min}より強いカードが必要です。` };
  const suitTier = Math.max(...cards.map((c) => Math.max(...suitsForCard(c, false).map((x) => suitTierForCard(c, x)))));
  const suitMask = suitMaskForCards(cards);
  return {
    ok: true,
    play: {
      type: 'set',
      owner: pi,
      count: cards.length,
      selected: sel.slice(),
      selectedIds: cards.map((c) => c?.id).filter(Boolean),
      cardsHand: cards.slice(),
      cardsTable: cards.slice(),
      number: Number(n),
      setPower,
      suitMask,
      suitTier
    }
  };
}

function buildRolePlay(pi, sel) {
  const p = s.players[pi];
  if (sel.length !== 5) return { ok: false, reason: '役は5枚選択です。' };
  const cards = sel.map((i) => p.hand[i]).filter(Boolean);
  if (cards.length !== 5) return { ok: false, reason: '選択が不正です。' };
  const role = evalRole(cards, s.lock?.suit || null);
  if (!role || role.strength < ROLE_ST.Straight) return { ok: false, reason: 'ストレート以上が必要です。' };
  return {
    ok: true,
    play: {
      type: 'role',
      owner: pi,
      count: 5,
      selected: sel.slice(),
      selectedIds: cards.map((c) => c?.id).filter(Boolean),
      cardsHand: cards.slice(),
      cardsTable: cards.slice(),
      role,
      call: false
    }
  };
}

function buildCallPlay(pi, sel) {
  const p = s.players[pi];
  const stars = Math.max(0, Number(p?.stars) || 0);
  if (stars <= 0) return { ok: false, reason: '星がないためコールできません。' };
  const base = s.trick?.cardsTable?.[0];
  if (!base) return { ok: false, reason: '場札がありません。' };
  if (base.kind === 'major') return { ok: false, reason: '場の大アルカナ1枚にはコールできません。' };
  if (sel.length !== 4) return { ok: false, reason: 'コールは手札4枚です。' };
  const cards = sel.map((i) => p.hand[i]).filter(Boolean);
  if (cards.length !== 4) return { ok: false, reason: '選択が不正です。' };
  if (cards.some((c) => c.kind !== 'minor')) return { ok: false, reason: 'コール手札は小アルカナのみです。' };
  const role = evalRole([base, ...cards], s.lock?.suit || null);
  if (!role || role.strength < ROLE_ST.Straight) return { ok: false, reason: 'コール成立しません。' };
  if (role.key === 'Straight' && cards.some((c) => Number(c?.number) === Number(base?.number))) {
    return { ok: false, reason: 'ストレートコール制限に抵触します。' };
  }
  if (role.key === 'Flush') {
    const vals = [base, ...cards].map((c) => cStrength(c)).sort((a, b) => b - a);
    if (vals[0] === cStrength(base)) return { ok: false, reason: 'フラッシュコール制限に抵触します。' };
  }
  role.effectiveRate = role.key === 'FullHouse' ? Math.max(0, role.baseRate - 2) : Math.max(0, role.baseRate - 1);
  return {
    ok: true,
    play: {
      type: 'role',
      owner: pi,
      count: 5,
      selected: sel.slice(),
      selectedIds: cards.map((c) => c?.id).filter(Boolean),
      cardsHand: cards.slice(),
      cardsTable: [base, ...cards],
      role,
      call: true
    }
  };
}

function isMinorAceCard(card) {
  return !!card && card.kind === 'minor' && Number(card.number) === 1;
}

function getRemainingHandAfterPlay(play) {
  const owner = Number(play?.owner);
  const hand = s?.players?.[owner]?.hand;
  if (!Array.isArray(hand)) return null;
  const selectedIds = Array.isArray(play?.selectedIds) ? play.selectedIds.filter(Boolean) : [];
  if (selectedIds.length > 0) {
    const idSet = new Set(selectedIds);
    return hand.filter((card) => !idSet.has(card?.id));
  }
  const selectedSet = new Set((Array.isArray(play?.selected) ? play.selected : []).map((idx) => Number(idx)));
  return hand.filter((_, idx) => !selectedSet.has(idx));
}

function getAceFinishRuleViolation(play) {
  const remaining = getRemainingHandAfterPlay(play);
  if (!Array.isArray(remaining)) return null;
  const played = Array.isArray(play?.cardsHand) ? play.cardsHand : [];

  // 手札がまだ残る場合に、残りがAのみになる出し方は禁止
  if (remaining.length > 0 && remaining.every(isMinorAceCard)) {
    return '手札がAだけ残る出し方はできません。';
  }
  // 最後の1手をAのみで上がる（A上がり）を禁止
  if (remaining.length === 0 && played.length > 0 && played.every(isMinorAceCard)) {
    return 'A上がりは禁止です。';
  }
  // 最後の1手で大アルカナを含んで上がることを禁止
  if (remaining.length === 0 && played.length > 0 && played.every((card) => card?.kind === 'major')) {
    return '大アルカナ上がりは禁止です。';
  }
  return null;
}

function validatePlay(play, mode) {
  const aceRuleViolation = getAceFinishRuleViolation(play);
  if (aceRuleViolation) return { ok: false, reason: aceRuleViolation };
  if (!s.trick) return mode === 'call' ? { ok: false, reason: '初手でコールは不可です。' } : { ok: true };
  if (s.callOnly && mode !== 'call') return { ok: false, reason: '8カット中: コールかパスのみ。' };
  if (mode === 'call') {
    const actor = s.players?.[Number(play?.owner)];
    const stars = Math.max(0, Number(actor?.stars) || 0);
    if (stars <= 0) return { ok: false, reason: '星がないためコールできません。' };
    const base = s.trick?.cardsTable?.[0];
    if (base?.kind === 'major') return { ok: false, reason: '場の大アルカナ1枚にはコールできません。' };
    return (s.trick.type === 'set' && s.trick.count === 1) ? { ok: true } : { ok: false, reason: 'コール対象は1枚場札のみです。' };
  }
  if (play.type !== s.trick.type) return { ok: false, reason: '場と同じ形式/枚数で。' };
  const expectedSetCount = Math.max(0, Number(s.trickForcedCount || 0)) || Number(s.trick.count || 0);
  if (play.type === 'set') {
    if (play.count !== expectedSetCount) return { ok: false, reason: '場と同じ形式/枚数で。' };
  } else if (play.count !== s.trick.count) {
    return { ok: false, reason: '場と同じ形式/枚数で。' };
  }
  if (play.type === 'set') {
    const c = setCmp(play.setPower ?? play.number, s.trick.setPower ?? s.trick.number);
    if (c > 0) return { ok: true };
    if (c < 0) return { ok: false, reason: '場札より強い数値が必要です。' };
    const playCards = Array.isArray(play?.cardsTable) ? play.cardsTable : [];
    const trickCards = Array.isArray(s?.trick?.cardsTable) ? s.trick.cardsTable : [];
    const playHasMajor = playCards.some((card) => card?.kind === 'major');
    const trickHasMajor = trickCards.some((card) => card?.kind === 'major');
    // 同数値時は大アルカナを優先。場に大アルカナがあるなら、
    // 小アルカナのみでは返せない（A=15 でも不可）。
    if (trickHasMajor && !playHasMajor) {
      return { ok: false, reason: '同数値では場の大アルカナに返せません。' };
    }
    if (playHasMajor && !trickHasMajor) {
      return { ok: true };
    }
    const playMask = getPlaySuitMask(play);
    const trickMask = getPlaySuitMask(s.trick);
    return isSuitMatchupCompatible(playMask, trickMask)
      ? { ok: true }
      : { ok: false, reason: '同数値は相性スート（W↔C / S↔P）のみ有効です。' };
  }
  const roleCmp = compareRole(play.role, s.trick.role);
  if (roleCmp > 0) return { ok: true };
  if (roleCmp < 0) return { ok: false, reason: '場より強い役が必要です。' };
  const playMask = getPlaySuitMask(play);
  const trickMask = getPlaySuitMask(s.trick);
  return isSuitMatchupCompatible(playMask, trickMask)
    ? { ok: true }
    : { ok: false, reason: '同役同値は相性スート（W↔C / S↔P）のみ有効です。' };
}

function removeHand(p, idxs) {
  const sorted = idxs.slice().sort((a, b) => b - a);
  const out = [];
  sorted.forEach((i) => { if (i >= 0 && i < p.hand.length) out.push(p.hand.splice(i, 1)[0]); });
  out.reverse();
  return out;
}

function removeHandByIds(p, ids) {
  const want = Array.isArray(ids) ? ids.filter(Boolean) : [];
  const out = [];
  for (const id of want) {
    const idx = p.hand.findIndex((c) => c?.id === id);
    if (idx < 0) return { ok: false, removed: out };
    const [card] = p.hand.splice(idx, 1);
    if (!card) return { ok: false, removed: out };
    out.push(card);
  }
  return { ok: true, removed: out };
}

function applyRoleRewardOnClear(playerIndex) {
  const play = s.lastPlay;
  if (!play || play.type !== 'role' || play.owner !== playerIndex) return;
  const p = s.players[playerIndex];
  const roleLabel = getRoleDisplayLabel(play);
  const add = Number(play.role?.effectiveRate ?? play.role?.baseRate ?? 0);
  if (add <= 0) { log(`${p.name}: ${roleLabel}（星加算なし）`); return; }
  p.stars = Math.max(0, Number(p.stars) || 0) + add;
  log(`${p.name}: ${roleLabel}成立 +${add}⭐`);
  playKingdomCoinEffect(playerIndex, Math.min(8, Math.max(3, add + 2)), '🪙');
}

function npcChooseDrawPlan(playerIndex) {
  const actor = s?.players?.[playerIndex];
  if (!actor || !isNpcPlayer(playerIndex)) return 'minor';
  const hand = Math.max(0, Number(actor.hand?.length || 0));
  const stars = Math.max(0, Number(actor.stars) || 0);
  const reason = String(s?.pendingDrawReason || 'normal');
  const hasMinor = (s?.minorDeck?.length || 0) > 0;
  const hasMajor = (s?.majorDeck?.length || 0) > 0 && stars > 0;

  // クリア後は基本的にドローを見送り、手数を減らす方を優先する
  if (reason === 'clear' && hand <= 9) return 'skip';
  if (hand <= 6) return 'skip';

  if (!hasMinor && !hasMajor) return 'skip';
  if (!hasMinor && hasMajor) return 'major';
  if (hasMinor && !hasMajor) return 'minor';

  const useMajor = hasMajor && (hand <= 5 || Math.random() < 0.25);
  return useMajor ? 'major' : 'minor';
}

function finalizeDrawPhaseToTurn(playerIndex) {
  if (!s) return;
  s.pendingDraw = null;
  s.pendingDrawReason = null;
  s.phase = 'turn';
  if (Number.isInteger(playerIndex) && playerIndex >= 0) {
    s.turn = playerIndex;
    if (!s.trick) s.leadRequiredOwner = playerIndex;
  }
}

function skipDrawChoice(playerIndex, note = '') {
  if (s?.pendingDraw !== playerIndex) return;
  finalizeDrawPhaseToTurn(playerIndex);
  s.message = `${pName(playerIndex)}がドローを見送り`;
  log(note ? `${pName(playerIndex)}: ドロー見送り（${note}）` : `${pName(playerIndex)}: ドロー見送り`);
  scheduleNpc();
  render();
}

function drawChoiceStart(playerIndex, reason = 'normal') {
  const actor = s.players[playerIndex];
  traceKingdomFlow(
    'drawChoiceStart.enter',
    `player=${playerIndex} hand=${actor?.hand?.length ?? 0} minorDeck=${s.minorDeck.length} majorDeck=${s.majorDeck.length}`
  );
  if ((actor?.hand?.length || 0) >= START_HAND) {
    traceKingdomFlow('drawChoiceStart.skip.fullHand', `player=${playerIndex}`);
    finalizeDrawPhaseToTurn(playerIndex);
    s.message = `${pName(playerIndex)}は手札上限(${START_HAND}枚)のためドローできません。`;
    log(`${pName(playerIndex)}: 手札上限のためドローなし`);
    scheduleNpc();
    render();
    return;
  }
  s.pendingDraw = playerIndex;
  s.pendingDrawReason = reason;
  traceKingdomFlow('drawChoiceStart.pending', `player=${playerIndex} minorDeck=${s.minorDeck.length} majorDeck=${s.majorDeck.length}`);
  if (s.minorDeck.length <= 0 && s.majorDeck.length <= 0) {
    traceKingdomFlow('drawChoiceStart.skip.noDeck', `player=${playerIndex}`);
    finalizeDrawPhaseToTurn(playerIndex); s.message = `${pName(playerIndex)}が親です。`; scheduleNpc(); render(); return;
  }
  s.phase = 'draw'; s.message = `${pName(playerIndex)}: 小 or 大アルカナを1枚ドロー`;
  traceKingdomFlow('drawChoiceStart.waitChoice', `player=${playerIndex}`);
  render();
  if (isNpcPlayer(playerIndex)) {
    scheduleNpcTimer(NPC_DELAY, () => {
      if (!s || !s.roundActive) {
        traceKingdomFlow('drawChoiceStart.npcTimer.abort', `player=${playerIndex} reason=inactive`);
        return;
      }
      if (s.phase !== 'draw' || s.pendingDraw !== playerIndex) {
        traceKingdomFlow('drawChoiceStart.npcTimer.abort', `player=${playerIndex} reason=phaseOrPending`);
        return;
      }
      const plan = npcChooseDrawPlan(playerIndex);
      traceKingdomFlow('drawChoiceStart.npcTimer.choose', `player=${playerIndex} plan=${plan} reason=${s.pendingDrawReason || 'normal'}`);
      if (plan === 'skip') {
        skipDrawChoice(playerIndex, s.pendingDrawReason === 'clear' ? 'クリア後は攻め継続' : '戦術');
        return;
      }
      applyDrawChoice(plan);
    });
  }
}

function judgmentOptions() {
  const out = [];
  s.players.forEach((p, owner) => p.discard.forEach((card, cardIndex) => out.push({ owner, cardIndex, card })));
  return out;
}

function judgmentStart(playerIndex) {
  const opts = judgmentOptions();
  if (!opts.length) { log('審判: 回収候補なし'); drawChoiceStart(playerIndex, 'judgment'); return; }
  s.pendingJudgment = playerIndex; s.phase = 'judgment'; s.message = `${pName(playerIndex)}: 審判で墓地回収`;
  render();
  if (isNpcPlayer(playerIndex)) {
    scheduleNpcTimer(NPC_DELAY, () => {
      if (!s || !s.roundActive) return;
      if (s.phase !== 'judgment' || s.pendingJudgment !== playerIndex) return;
      const pick = opts.slice().sort((a, b) => cStrength(b.card) - cStrength(a.card))[0];
      if (pick) applyJudgmentPick(pick.owner, pick.cardIndex); else skipJudgmentPick();
    });
  }
}

function clearTrick(leader) {
  clearCallCinematicTimer();
  s._traceFlowId = (kingdomTraceFlowSeed += 1);
  traceKingdomFlow('clearTrick.enter', `leader=${leader}`);
  s.turnCount = Math.max(1, Number(s.turnCount) || 1) + 1;
  if (s.players[leader]) {
    s.players[leader].stars = Math.max(0, Number(s.players[leader].stars) || 0) + 1;
  }
  applyRoleRewardOnClear(leader);
  const hadJudgment = !!(s.lastPlay && s.lastPlay.type === 'set' && s.lastPlay.owner === leader && s.lastPlay.cardsHand.some((c) => c.kind === 'major' && c.number === 20));
  traceKingdomFlow('clearTrick.stateReset', `hadJudgment=${hadJudgment}`);
  s.trickForcedCount = 0;
  s.passDrawAuraOwner = null;
  s.starGainAuraOwner = null;
  s.starDrainAuraOwner = null;
  s.passStarDrainAuraOwner = null;
  s.hermitPreview = null;
  s.trickDefeatFx = null;
  s.trickTransitionKind = null;
  s.trick = null; s.lastPlay = null; s.pass = [false, false, false, false]; s.callOnly = false; s.lock = null;
  s.leadRequiredOwner = leader;
  if (!s.reversePersist) s.reverse = false;
  s.turn = leader;
  triggerKingdomActionFx(leader, 'クリア', { overlay: 'clear', durationMs: 760, cutin: false });
  triggerKingdomActionFx(leader, `ターン ${s.turnCount}`, { overlay: 'action', durationMs: 700, cutin: true, delayMs: 120 });
  if (hadJudgment) {
    traceKingdomFlow('clearTrick.next', 'judgmentStart');
    judgmentStart(leader);
    return;
  }
  traceKingdomFlow('clearTrick.next', 'drawChoiceStart');
  drawChoiceStart(leader, 'clear');
}

function applySetEffects(play) {
  const cards = play.cardsHand;
  if (cards.length > 3) return { forceClear: false, keepTurn: false, skip: 0 };
  let forceClear = false, keepTurn = false, skip = 0;
  const has = (n) => cards.some((c) => idNum(c) === n);
  const hasMajor = (n) => cards.some((c) => c.kind === 'major' && c.number === n);
  const owner = s.players?.[play.owner];
  const drawMinorForEffect = (count = 1) => {
    if (!owner) return 0;
    let drew = 0;
    for (let i = 0; i < count; i += 1) {
      if (owner.hand.length >= START_HAND) break;
      const card = s.minorDeck.pop();
      if (!card) break;
      owner.hand.push(card);
      drew += 1;
    }
    if (drew > 0) onPlayerDrewCard(play.owner, 1100);
    return drew;
  };
  const drawMajorForEffect = (count = 1) => {
    if (!owner) return 0;
    let drew = 0;
    for (let i = 0; i < count; i += 1) {
      if (owner.hand.length >= START_HAND) break;
      const card = s.majorDeck.pop();
      if (!card) break;
      owner.hand.push(card);
      drew += 1;
    }
    if (drew > 0) onPlayerDrewCard(play.owner, 1100);
    return drew;
  };
  if (cards.length === 1 && hasMajor(7)) {
    s.trickForcedCount = 2;
    play.count = 2;
    log(`${pName(play.owner)}: 戦車で2枚出し縛り`);
    triggerKingdomActionFx(play.owner, '戦車: 2枚出し', { overlay: 'action', durationMs: 820, cutin: true, cutinClass: 'is-kingdom-lock' });
    playKingdomChariotSplitFx(play.owner, { delayMs: 100 });
    setTimeout(() => {
      if (s && s.trick === play && play.cardsTable && play.cardsTable.length === 1) {
        const c = play.cardsTable[0];
        const clone = { ...c, id: (c.id || 'tk_unknown') + '_split' };
        play.cardsTable.push(clone);
        if (play.tableOwners) play.tableOwners.push(play.owner);
        render();
      }
    }, 820);
  }
  if (hasMajor(13)) {
    s.starDrainAuraOwner = play.owner;
    log(`${pName(play.owner)}: 死神効果`);
    triggerKingdomActionFx(play.owner, '死神', { overlay: 'action', durationMs: 820, cutin: true, cutinClass: 'is-kingdom-lock' });
  }
  if (hasMajor(15)) {
    s.passStarDrainAuraOwner = play.owner;
    log(`${pName(play.owner)}: 悪魔効果`);
    triggerKingdomActionFx(play.owner, '悪魔', { overlay: 'action', durationMs: 820, cutin: true, cutinClass: 'is-kingdom-lock' });
  }
  if (hasMajor(2)) {
    s.passDrawAuraOwner = play.owner;
    log(`${pName(play.owner)}: 女教皇効果（他者パスで強制ドロー）`);
    triggerKingdomActionFx(play.owner, '女教皇', { overlay: 'draw', durationMs: 700, cutin: true });
  }
  if (hasMajor(6)) {
    s.starGainAuraOwner = play.owner;
    log(`${pName(play.owner)}: 恋人効果（他者が出すたび星+1）`);
    triggerKingdomActionFx(play.owner, '恋人', { overlay: 'draw', durationMs: 700, cutin: true });
  }
  if (cards.length === 1 && hasMajor(9)) {
    const minorTop = s.minorDeck[s.minorDeck.length - 1] || null;
    const majorTop = s.majorDeck[s.majorDeck.length - 1] || null;
    s.hermitPreview = { owner: play.owner, minorTop, majorTop, at: Date.now() };
    if (isLocalPlayer(play.owner)) {
      s.message = `隠者の予見: 小=${minorTop ? getCardNameLabel(minorTop) : 'なし'} / 大=${majorTop ? getCardNameLabel(majorTop) : 'なし'}`;
    }
    log(`${pName(play.owner)}: 隠者で山札を予見`);
    triggerKingdomActionFx(play.owner, '隠者: 予見', { overlay: 'draw', durationMs: 760, cutin: true });
  }
  if (cards.length === 1 && hasMajor(10)) {
    const drew = drawMajorForEffect(1);
    log(`${pName(play.owner)}: 運命の輪で大アルカナ+${drew}`);
    triggerKingdomActionFx(play.owner, `運命の輪 +${drew}`, { overlay: 'draw', durationMs: 760, cutin: true });
  }
  if (has(5)) {
    if (cards.length === 1 && cards.some((c) => c.kind === 'major' && c.number === 5)) {
      keepTurn = true; skip = 3; log(`${pName(play.owner)}: 大アルカナ5でターン継続`);
      triggerKingdomActionFx(play.owner, 'もう一度ターン', { overlay: 'action', durationMs: 860, cutin: true, cutinClass: 'is-kingdom-skip' });
    } else {
      skip = cards.length; log(`${pName(play.owner)}: 5スキップ x${cards.length}`);
      triggerKingdomActionFx(play.owner, `5スキップ x${cards.length}`, { overlay: 'action', durationMs: 780, cutin: true, cutinClass: 'is-kingdom-skip' });
    }
  }
  if (has(8)) {
    if (cards.length >= 2 || cards.some((c) => c.kind === 'major' && c.number === 8)) {
      forceClear = true; s.callOnly = false; log(`${pName(play.owner)}: 8カットでクリア`);
      triggerKingdomActionFx(play.owner, '8カット', { overlay: 'clear', durationMs: 860, cutin: true, cutinClass: 'is-kingdom-cut' });
    } else {
      s.callOnly = true; log(`${pName(play.owner)}: 8カット（コール猶予）`);
      triggerKingdomActionFx(play.owner, '8カット', { overlay: 'action', durationMs: 780, cutin: true, cutinClass: 'is-kingdom-cut' });
    }
  } else s.callOnly = false;
  if (has(11)) {
    const hasMajor11 = cards.some((c) => c.kind === 'major' && c.number === 11);
    if (s.reverse) {
      if (s.reversePersist) {
        s.reverse = false;
        s.reversePersistSuspendOwner = play.owner;
        log(`${pName(play.owner)}: 11バックをこのターンのみ解除`);
        triggerKingdomActionFx(play.owner, '11バック解除', { overlay: 'action', durationMs: 920, cutin: true, cutinClass: 'is-kingdom-reverse' });
      } else {
        s.reverse = false;
        log(`${pName(play.owner)}: 11バック解除`);
        triggerKingdomActionFx(play.owner, '11バック解除', { overlay: 'action', durationMs: 820, cutin: true, cutinClass: 'is-kingdom-reverse' });
      }
    } else {
      s.reverse = true;
      s.reversePersistSuspendOwner = null;
      if (hasMajor11) {
        s.reversePersist = true; log(`${pName(play.owner)}: 大アルカナ11でこの局終了まで11バック`);
        triggerKingdomActionFx(play.owner, '大アルカナ11バック', { overlay: 'action', durationMs: 920, cutin: true, cutinClass: 'is-kingdom-reverse' });
      } else {
        log(`${pName(play.owner)}: 11バック`);
        triggerKingdomActionFx(play.owner, '11バック', { overlay: 'action', durationMs: 820, cutin: true, cutinClass: 'is-kingdom-reverse' });
      }
    }
  }
  if (has(14) && cards.length === 1) {
    const cur = cards[0];
    const prevSuit = (play?.prevLeadSuit && play.prevLeadSuit !== 'None') ? play.prevLeadSuit : null;
    if (prevSuit && cur.kind === 'major' && cur.number === 14) {
      // 節制: 直前の場札スートを基準にロック
      s.lock = { suit: prevSuit, min: cStrength(cur) };
      log(`${pName(play.owner)}: 節制ロック (${SUIT_LABEL[prevSuit]})`);
      triggerKingdomActionFx(play.owner, '節制ロック', { overlay: 'action', durationMs: 860, cutin: true, cutinClass: 'is-kingdom-lock' });
    } else if (prevSuit && suitsForCard(cur, false).includes(prevSuit)) {
      // 通常14ロック: 直前の場札と同スート時のみ発動
      s.lock = { suit: prevSuit, min: null };
      log(`${pName(play.owner)}: 14ロック (${SUIT_LABEL[prevSuit]})`);
      triggerKingdomActionFx(play.owner, '14ロック', { overlay: 'action', durationMs: 820, cutin: true, cutinClass: 'is-kingdom-lock' });
    }
  }
  if (forceClear) {
    const label = cards.map((c) => `${getCardNameLabel(c)}(${getCardNumberLabel(c)})`).join(', ');
    log(`${pName(play.owner)}: クリア理由 ${label}`);
  }
  return { forceClear, keepTurn, skip };
}

function finishRound(winnerIndex) {
  clearSettlementGainFx();
  clearNpcTimer();
  clearCallCinematicTimer();
  clearRoundOutCinematicTimer();
  s.roundActive = false; s.phase = 'roundEnd'; s.selected.clear(); s.pendingDraw = null; s.pendingJudgment = null;
  s.awaitRoundConfirm = false;
  const winner = s.players[winnerIndex];
  const roundNo = Math.max(1, Number(s.handNo || 0) + 1);
  s.hiddenOracleCard = s.minorDeck.pop() || null;
  s.hiddenOracleRevealed = false;
  const hidden = s.hiddenOracleCard ? idNum(s.hiddenOracleCard) : null;
  const oracleHits = winner.discard.reduce((a, c) => a + ((s.openOracle != null && idNum(c) === s.openOracle) || (hidden != null && idNum(c) === hidden) ? 1 : 0), 0);
  let fxDelayMs = 360;
  let totalGain = 0;
  const settlement = {
    roundNo,
    winnerIndex,
    winnerName: winner.name,
    starBonus: Math.max(0, Number(winner.stars) || 0),
    oracleHits,
    rows: [],
    potAward: 0,
    totalGain: 0,
    displayTotalGain: 0
  };
  log(`${winner.name}がアウト！ 清算開始`);
  s.players.forEach((loser, i) => {
    if (i === winnerIndex) return;
    const remain = loser.hand.length;
    const acePenalty = countAceMinor(loser.hand) * A_PENALTY;
    const scoreFactor = 1 + settlement.starBonus + oracleHits + acePenalty;
    const pay = remain * scoreFactor;
    const factorParts = [
      { label: '基本', value: 1 },
      { label: '★', value: settlement.starBonus },
      { label: 'アルカナ', value: oracleHits },
      { label: 'A所持', value: acePenalty }
    ];
    const factorSummary = factorParts
      .filter((part) => Number(part.value) > 0)
      .map((part) => `${part.label}x${part.value}`)
      .join(' / ');
    loser.chips -= pay; winner.chips += pay;
    totalGain += Math.max(0, pay);
    settlement.rows.push({
      payerIndex: i,
      payerName: loser.name,
      receiverIndex: winnerIndex,
      receiverName: winner.name,
      remain,
      starBonus: settlement.starBonus,
      oracleHits,
      acePenalty,
      scoreFactor,
      factorSummary,
      pay
    });
    log(`${loser.name} -> ${winner.name}: ${pay}（${remain}枚 x 係数${scoreFactor}）`);
    if (pay > 0) {
      playKingdomCoinEffect(i, getKingdomCoinCountByAmount(pay), '🪙', {
        targetPlayerIndex: winnerIndex,
        className: 'is-payout',
        delayMs: fxDelayMs
      });
      scheduleSettlementGain(pay, fxDelayMs + 520);
      fxDelayMs += 110;
    }
  });
  if (s.pot > 0) {
    const potAward = s.pot;
    winner.chips += potAward;
    totalGain += Math.max(0, potAward);
    settlement.potAward = potAward;
    log(`${winner.name}がPOT ${potAward}獲得`);
    scheduleSettlementGain(potAward, fxDelayMs + 200);
    s.pot = 0;
  }
  settlement.totalGain = totalGain;
  s.roundSettlement = settlement;
  // 清算パネルを先に描画して総受取を反映
  render();
  if (totalGain <= 0) {
    s.roundSettlement.displayTotalGain = 0;
    renderSettlement();
  }
  triggerKingdomActionFx(winnerIndex, `総取り +${totalGain}`, {
    overlay: 'roundend',
    durationMs: 1200,
    cutin: true,
    cutinClass: 'is-showdown-win',
    delayMs: fxDelayMs + 140
  });
  playKingdomCoinEffect(winnerIndex, Math.min(10, Math.max(4, Math.ceil(totalGain / 6))), '👑', {
    fromPot: true,
    targetPlayerIndex: winnerIndex,
    className: 'is-payout',
    delayMs: fxDelayMs + 200
  });
  // 永続11バックは「その局のみ」。局終了時に必ず解除する。
  s.reversePersist = false;
  s.reversePersistSuspendOwner = null;
  s.reverse = false;
  s.players.forEach((p) => { p.stars = 0; });
  const bankruptPlayers = s.players
    .map((p, i) => ({ i, name: p.name, chips: Number(p.chips) || 0 }))
    .filter((p) => p.chips <= GAMEOVER_CHIPS_THRESHOLD);
  if (bankruptPlayers.length > 0) {
    let top = 0;
    s.players.forEach((_, i) => {
      if ((Number(s.players[i].chips) || 0) > (Number(s.players[top].chips) || 0)) top = i;
    });
    s.champion = top;
    s.phase = 'done';
    s.awaitRoundConfirm = false;
    triggerKingdomActionFx(top, '最終勝利！\nチャンピオン決定', {
      overlay: 'roundend',
      overlayHoldMs: GAME_FINAL_CINEMATIC_MS,
      durationMs: GAME_FINAL_CINEMATIC_MS,
      cutin: true,
      cutinClass: 'is-kingdom-grand-win',
      delayMs: 120
    });
    playKingdomCoinEffect(top, 12, '🏆', {
      fromPot: true,
      targetPlayerIndex: top,
      className: 'is-payout',
      delayMs: 220
    });
    const bankruptText = bankruptPlayers.map((p) => `${p.name}(${p.chips})`).join(' / ');
    s.message = `ゲーム終了（チップ枯渇）: ${bankruptText} / 勝者: ${s.players[top].name} (${s.players[top].chips}チップ)`;
    log(s.message);
    render();
    return;
  }
  s.handNo += 1;
  if (s.handNo >= TOTAL_HANDS) {
    let top = 0; s.players.forEach((p, i) => { if (s.players[i].chips > s.players[top].chips) top = i; });
    s.champion = top;
    s.phase = 'done';
    s.awaitRoundConfirm = false;
    triggerKingdomActionFx(top, '最終勝利！\nチャンピオン決定', {
      overlay: 'roundend',
      overlayHoldMs: GAME_FINAL_CINEMATIC_MS,
      durationMs: GAME_FINAL_CINEMATIC_MS,
      cutin: true,
      cutinClass: 'is-kingdom-grand-win',
      delayMs: 120
    });
    playKingdomCoinEffect(top, 12, '🏆', {
      fromPot: true,
      targetPlayerIndex: top,
      className: 'is-payout',
      delayMs: 220
    });
    s.message = `ゲーム終了！ 優勝: ${s.players[top].name} (${s.players[top].chips}チップ)`;
    log(s.message);
    render();
    return;
  }
  s.dealer = (s.dealer + 1) % 4;
  s.awaitRoundConfirm = true;
  s.message = `${winner.name}が第${roundNo}局に勝利。清算を確認して次局へ進んでください。次局の親: ${pName(s.dealer)}。`;
  render();
  if (s.hiddenOracleCard) {
    hiddenOracleRevealDelayTimer = setTimeout(() => {
      hiddenOracleRevealDelayTimer = null;
      revealHiddenOracleWithFlip();
    }, 120);
  }
}

function applyDrawChoice(deckType) {
  traceKingdomFlow('applyDrawChoice.enter', `requested=${deckType}`);
  const pi = s.pendingDraw;
  if (pi == null) {
    traceKingdomFlow('applyDrawChoice.abort', 'reason=noPendingDraw');
    return;
  }
  const actor = s.players[pi];
  if (!actor) {
    traceKingdomFlow('applyDrawChoice.abort', `reason=noActor player=${pi}`);
    return;
  }
  if ((actor.hand?.length || 0) >= START_HAND) {
    traceKingdomFlow('applyDrawChoice.abort', `reason=fullHand player=${pi}`);
    finalizeDrawPhaseToTurn(pi);
    s.message = `${pName(pi)}は手札上限(${START_HAND}枚)のためドローできません。`;
    log(`${pName(pi)}: 手札上限のためドローなし`);
    scheduleNpc();
    render();
    return;
  }
  if (isLocalPlayer(pi)) s.selected.clear();
  let use = deckType;
  traceKingdomFlow('applyDrawChoice.resolveDeck.start', `player=${pi} requested=${deckType} stars=${Math.max(0, Number(actor.stars) || 0)}`);
  if (use === 'major' && s.majorDeck.length <= 0) use = 'minor';
  if (use === 'minor' && s.minorDeck.length <= 0) use = 'major';
  traceKingdomFlow('applyDrawChoice.resolveDeck.afterFallback', `player=${pi} selected=${use}`);

  // 大アルカナドローは星1消費。星不足なら人間は選べず、NPCは可能なら小アルカナへフォールバック。
  if (use === 'major') {
    const stars = Math.max(0, Number(actor.stars) || 0);
    if (stars <= 0) {
      if (isNpcPlayer(pi) && s.minorDeck.length > 0) {
        use = 'minor';
      } else if (isLocalPlayer(pi)) {
        traceKingdomFlow('applyDrawChoice.abort', `reason=noStars player=${pi}`);
        s.message = '星が足りないため大アルカナを引けません。';
        render();
        return;
      } else {
        traceKingdomFlow('applyDrawChoice.abort', `reason=noStarsNpcNoMinor player=${pi}`);
        finalizeDrawPhaseToTurn(pi);
        s.message = `${pName(pi)}が親です。`;
        scheduleNpc();
        render();
        return;
      }
    }
  }

  const c = use === 'major' ? (s.majorDeck.pop() || null) : (s.minorDeck.pop() || null);
  traceKingdomFlow('applyDrawChoice.drawn', `player=${pi} deck=${use} card=${c ? `${c.kind}:${c.suit}:${c.number}` : 'none'}`);
  if (c) {
    actor.hand.push(c);
    onPlayerDrewCard(pi, 1200);
    if (use === 'major') actor.stars = Math.max(0, (Number(actor.stars) || 0) - 1);
    log(`${pName(pi)}: ${use === 'major' ? '大' : '小'}アルカナをドロー`);
  }
  const drawByHuman = isLocalPlayer(pi);
  triggerKingdomActionFx(pi, use === 'major' ? '大アルカナドロー' : '小アルカナドロー', {
    overlay: drawByHuman ? 'draw' : null,
    durationMs: 620,
    cutin: drawByHuman
  });
  finalizeDrawPhaseToTurn(pi); s.message = `${pName(pi)}が親です。`;
  traceKingdomFlow('applyDrawChoice.exit', `player=${pi} hand=${actor.hand.length}`);
  scheduleNpc(); render();
}

function applyJudgmentPick(owner, cardIndex) {
  const pi = s.pendingJudgment;
  if (pi == null) return;
  const poolOwner = s.players[owner];
  if (!poolOwner || cardIndex < 0 || cardIndex >= poolOwner.discard.length) return;
  const card = poolOwner.discard.splice(cardIndex, 1)[0];
  s.players[pi].hand.push(card);
  onPlayerDrewCard(pi, 1100);
  s.pendingJudgment = null;
  log(`${pName(pi)}: 審判で ${getCardNameLabel(card)} を回収`);
  triggerKingdomActionFx(pi, '審判回収', { overlay: 'draw', durationMs: 700, cutin: true });
  drawChoiceStart(pi, 'judgment');
}

function skipJudgmentPick() {
  const pi = s.pendingJudgment;
  if (pi == null) return;
  s.pendingJudgment = null;
  log(`${pName(pi)}: 審判回収をスキップ`);
  triggerKingdomActionFx(pi, '審判スキップ', { overlay: 'draw', durationMs: 520, cutin: false });
  drawChoiceStart(pi, 'judgment');
}

function continueAfterPlay(pi, play) {
  if (!s || !s.players?.[pi]) return;
  if (s.lastPlay !== play || s.trick !== play) return;
  const p = s.players[pi];
  if (play?.type === 'role' && play?.call) {
    // コール成立後は、場にかかっている効果を全解除する。
    s.callOnly = false; // 8カット（コール猶予）
    s.lock = null; // 14ロック / 節制ロック
    s.reverse = false; // 11バック
    s.reversePersist = false; // 永続11バック（局中）も解除
    s.reversePersistSuspendOwner = null;
  }
  if (p.hand.length <= 0) {
    if (play?.type === 'role') {
      p.stars = Math.max(0, Number(p.stars) || 0) + 1;
      applyRoleRewardOnClear(pi);
    }
    startRoundOutCinematic(pi, play);
    return;
  }
  if (play.type === 'set') {
    const fx = applySetEffects(play);
    if (fx.forceClear) { clearTrick(pi); return; }
    if (fx.keepTurn) {
      s.phase = 'turn';
      s.turn = pi;
      s.message = `${p.name}のターン継続`;
      scheduleNpc();
      render();
      return;
    }
    s.phase = 'turn';
    s.turn = nextAlive(pi, 1 + Math.max(0, fx.skip), false) ?? pi;
  } else {
    s.phase = 'turn';
    s.turn = nextAlive(pi, 1, false) ?? pi;
  }
  s.message = `${pName(s.turn)}のターン`;
  scheduleNpc();
  render();
}

function getRoundFinishActionLabel(play) {
  if (!play) return '出し切り';
  if (play.type === 'role') return getRoleDisplayLabel(play);
  const count = Math.max(1, Number(play?.count) || Number(play?.cardsTable?.length) || 1);
  return `${count}枚出し`;
}

function startRoundOutCinematic(winnerIndex, play) {
  if (!s || !s.players?.[winnerIndex]) {
    finishRound(winnerIndex);
    return;
  }
  clearNpcTimer();
  clearCallCinematicTimer();
  clearRoundOutCinematicTimer();
  const winner = s.players[winnerIndex];
  const actionLabel = getRoundFinishActionLabel(play);
  s.phase = 'roundOutCinematic';
  s.turn = winnerIndex;
  s.message = `${winner.name}が出し切り！ 最後の一手: ${actionLabel}`;
  triggerKingdomActionFx(winnerIndex, `出し切り！\n${actionLabel}`, {
    overlay: 'roundend',
    overlayHoldMs: ROUND_OUT_CINEMATIC_MS,
    durationMs: ROUND_OUT_CINEMATIC_MS + 260,
    cutin: true,
    cutinClass: 'is-kingdom-round-out'
  });
  render();
  roundOutCinematicTimer = setTimeout(() => {
    roundOutCinematicTimer = null;
    if (!s || !s.roundActive || s.phase !== 'roundOutCinematic') return;
    finishRound(winnerIndex);
  }, ROUND_OUT_CINEMATIC_MS);
}

function applyPlay(pi, play, retryDepth = 0) {
  clearCallCinematicTimer();
  const p = s.players[pi];
  const prevTrick = s?.trick
    ? {
      ...s.trick,
      cardsTable: Array.isArray(s.trick.cardsTable) ? s.trick.cardsTable.slice() : [],
      tableOwners: Array.isArray(s.trick.tableOwners) ? s.trick.tableOwners.slice() : []
    }
    : null;
  const prevLeadCard = s?.trick?.cardsTable?.[0] || null;
  const prevLeadSuit = prevLeadCard ? (suitsForCard(prevLeadCard, false)[0] || 'None') : null;
  const prevLeadOwner = Number.isInteger(s?.trick?.owner) ? s.trick.owner : null;
  const selectedIds = Array.isArray(play?.selectedIds) ? play.selectedIds.filter(Boolean) : [];
  const selectedCount = selectedIds.length > 0
    ? selectedIds.length
    : (Array.isArray(play?.selected) ? play.selected.length : 0);
  let removed = [];
  if (selectedIds.length > 0) {
    const byId = removeHandByIds(p, selectedIds);
    removed = byId.removed || [];
    if (!byId.ok) {
      removed.forEach((card) => { if (card) p.hand.push(card); });
      p.hand.sort((a, b) => cStrength(a) - cStrength(b));
      removed = [];
    }
  } else {
    removed = removeHand(p, Array.isArray(play?.selected) ? play.selected : []);
  }
  if (selectedCount <= 0 || removed.length !== selectedCount) {
    log(`${p.name}: 出し処理失敗（選択同期ずれ）`);
    if (isNpcPlayer(pi)) {
      if (retryDepth < 1) {
        const fallback = npcDecide(pi);
        if (fallback?.action === 'play' && fallback.play) {
          applyPlay(pi, fallback.play, retryDepth + 1);
          return;
        }
      }
      passAction(pi);
      return;
    }
    s.message = 'カードの出し処理に失敗しました。もう一度選択してください。';
    render();
    return;
  }
  play.cardsHand = removed.slice();
  const isRolePlay = play.type === 'role';
  const isCallPlay = isRolePlay && !!play.call;
  if (play.type === 'set') {
    play.cardsTable = removed.slice();
    play.tableOwners = play.cardsTable.map(() => pi);
  } else if (isCallPlay) {
    const base = s.trick?.cardsTable?.[0];
    if (base) {
      play.cardsTable = [base, ...removed];
      play.tableOwners = [
        Number.isInteger(prevLeadOwner) ? prevLeadOwner : pi,
        ...removed.map(() => pi)
      ];
    } else {
      play.cardsTable = removed.slice();
      play.tableOwners = play.cardsTable.map(() => pi);
    }
  } else {
    play.cardsTable = removed.slice();
    play.tableOwners = play.cardsTable.map(() => pi);
  }
  // 大アルカナは墓地へ送らない（場からは取り除かれるが墓地には残さない）
  p.discard.push(...removed.filter((c) => c?.kind !== 'major'));
  if (isCallPlay && prevLeadCard && prevLeadCard.kind !== 'major') {
    let captured = null;
    if (Number.isInteger(prevLeadOwner)) {
      captured = pullCardFromDiscard(prevLeadOwner, prevLeadCard);
    }
    if (!captured) {
      for (let i = 0; i < s.players.length; i += 1) {
        captured = pullCardFromDiscard(i, prevLeadCard);
        if (captured) break;
      }
    }
    const movedCard = captured || prevLeadCard;
    if (movedCard?.kind !== 'major') {
      p.discard.push(movedCard);
      log(`${p.name}: コール取り込み札を墓地へ移動`);
    }
  }
  if (play.call) {
    p.stars = Math.max(0, (Number(p.stars) || 0) - 1);
  }
  const gainOwner = Number.isInteger(s.starGainAuraOwner) ? Number(s.starGainAuraOwner) : null;
  if (gainOwner != null && gainOwner !== pi && s.players?.[gainOwner]) {
    s.players[gainOwner].stars = Math.max(0, Number(s.players[gainOwner].stars) || 0) + 1;
    log(`${pName(gainOwner)}: 恋人効果で星+1（${p.name}の出し）`);
  }
  const drainOwner = Number.isInteger(s.starDrainAuraOwner) ? Number(s.starDrainAuraOwner) : null;
  if (drainOwner != null && drainOwner !== pi) {
    p.stars = Math.max(0, (Number(p.stars) || 0) - 1);
    log(`${p.name}: 死神効果で星-1`);
  }
  if (isLocalPlayer(pi)) s.selected.clear();
  s.pass = [false, false, false, false];
  s.trick = play;
  s.trickDefeatFx = pickTrickDefeatFx(play, prevTrick);
  s.trickTransitionKind = isCallPlay
    ? 'callSteal'
    : (play?.type === 'role' && String(prevTrick?.type || '') === 'role' ? 'roleClash' : 'normal');
  play.prevLeadSuit = prevLeadSuit;
  s.leadRequiredOwner = null;
  s.lastPlay = play;
  s.turn = pi;
  if (p.hand.length === 1) {
    triggerKingdomRowActionFx(pi, 'LAST 1', 920);
    triggerKingdomActionFx(pi, 'ラスト1枚', { overlay: 'action', durationMs: 820, cutin: true });
  }
  const callFxLevel = isCallPlay ? getKingdomCallFxLevel(play?.role?.key) : 0;
  const callCinematicMs = isCallPlay ? getKingdomCallCinematicDuration(callFxLevel) : 0;
  s.callMergeFx = isCallPlay
    ? { owner: pi, startedAt: Date.now(), level: callFxLevel, roleKey: String(play?.role?.key || '') }
    : null;
  log(`${p.name}: ${play.type === 'set' ? `${play.count}枚出し` : getRoleDisplayLabel(play)}`);
  const actionLabel = play.type === 'set'
    ? `${play.count}枚出し`
    : getRoleDisplayLabel(play);
  triggerKingdomActionFx(pi, actionLabel, {
    overlay: isCallPlay ? 'call' : 'action',
    overlayHoldMs: isCallPlay ? callCinematicMs : null,
    durationMs: isCallPlay ? Math.max(980, callCinematicMs - 120) : (isRolePlay ? 980 : 700),
    cutin: isRolePlay,
    cutinClass: isCallPlay ? 'is-kingdom-call' : (isRolePlay ? 'is-kingdom-role' : undefined),
    delayMs: isCallPlay ? 90 : (isRolePlay ? 180 : 0)
  });

  if (isCallPlay) {
    pulseKingdomPotAnchor(Math.max(760, callCinematicMs - 140));
    playKingdomCoinEffect(pi, getKingdomCallCoinCount(callFxLevel), '🪙', { className: 'is-call-bet', delayMs: 90 });
    vibrateOnce(32);
    clearNpcTimer();
    s.phase = 'callCinematic';
    s.message = `${p.name}がコール！ 場札を5枚役に取り込み中...`;
    render();
    callCinematicTimer = setTimeout(() => {
      callCinematicTimer = null;
      if (!s || s.lastPlay !== play) return;
      if (s.phase !== 'callCinematic' || s.turn !== pi) return;
      s.callMergeFx = null;
      continueAfterPlay(pi, play);
    }, callCinematicMs);
    return;
  }
  continueAfterPlay(pi, play);
}

function passAction(pi) {
  if (!s.trick) {
    // フェイルセーフ: まれに親ターン復帰時に場札が空のまま進行することがあるため、
    // その場合は親ドロー手順へ戻して進行停止を回避する。
    if (s?.roundActive && s.phase === 'turn' && s.turn === pi) {
      const actor = s.players?.[pi];
      if (actor && actor.hand.length < START_HAND && (s.minorDeck.length > 0 || s.majorDeck.length > 0)) {
        log(`${pName(pi)}: 場が空のため親ドローへ復帰`);
        drawChoiceStart(pi);
        return;
      }
    }
    s.message = '場が空のためパスできません。';
    render();
    // NPCがここに入った場合でも再試行可能にして、進行停止を避ける
    if (isNpcPlayer(pi)) scheduleNpc();
    return;
  }
  s.pass[pi] = true; log(`${pName(pi)}: パス`);
  const player = s.players?.[pi];
  const passDrainOwner = Number.isInteger(s.passStarDrainAuraOwner) ? Number(s.passStarDrainAuraOwner) : null;
  if (passDrainOwner != null && passDrainOwner !== pi && player) {
    player.stars = Math.max(0, (Number(player.stars) || 0) - 1);
    log(`${pName(pi)}: 悪魔効果でパス時に星-1`);
  }
  const passDrawOwner = Number.isInteger(s.passDrawAuraOwner) ? Number(s.passDrawAuraOwner) : null;
  if (passDrawOwner != null && passDrawOwner !== pi && player) {
    let drew = 0;
    if (player.hand.length < START_HAND) {
      let drawCard = s.minorDeck.pop() || null;
      if (!drawCard) drawCard = s.majorDeck.pop() || null;
      if (drawCard) {
        player.hand.push(drawCard);
        onPlayerDrewCard(pi, 1200);
        drew = 1;
      }
    }
    if (drew > 0) {
      log(`${pName(pi)}: 女教皇効果で強制ドロー`);
      triggerKingdomActionFx(pi, '強制ドロー', { overlay: null, durationMs: 620, cutin: false });
    } else {
      log(`${pName(pi)}: 女教皇効果（強制ドロー不可）`);
    }
  }
  if (isLocalPlayer(pi)) s.selected.clear();
  const passByHuman = isLocalPlayer(pi);
  triggerKingdomActionFx(pi, 'パス', { overlay: passByHuman ? 'action' : null, durationMs: 480, cutin: passByHuman });
  const leader = s.lastPlay?.owner;
  if (leader != null && allOthersPassed(leader)) { log('全員パスでクリア'); clearTrick(leader); return; }
  s.turn = nextAlive(pi, 1, true) ?? (leader ?? pi);
  s.message = `${pName(s.turn)}のターン`;
  scheduleNpc(); render();
}

function setMoves(pi) {
  const p = s.players[pi], out = [];
  const idxs = p.hand.map((_, i) => i);
  for (let n = 1; n <= Math.min(3, idxs.length); n += 1) {
    comb(idxs, n).forEach((pick) => {
      const b = buildSetPlay(pi, pick), v = b.ok ? validatePlay(b.play, 'normal') : { ok: false };
      if (b.ok && v.ok) out.push(b.play);
    });
  }
  return out;
}

function roleMoves(pi) {
  const p = s.players[pi], out = [];
  if (p.hand.length < 5) return out;
  comb(p.hand.map((_, i) => i), 5).forEach((pick) => {
    const b = buildRolePlay(pi, pick), v = b.ok ? validatePlay(b.play, 'normal') : { ok: false };
    if (b.ok && v.ok) out.push(b.play);
  });
  return out;
}

function callMoves(pi) {
  const p = s.players[pi], out = [];
  if (!(s.trick && s.trick.type === 'set' && s.trick.count === 1)) return out;
  const minorIdx = p.hand.map((c, i) => ({ c, i })).filter((x) => x.c.kind === 'minor').map((x) => x.i);
  if (minorIdx.length < 4) return out;
  comb(minorIdx, 4).forEach((pick) => {
    const b = buildCallPlay(pi, pick), v = b.ok ? validatePlay(b.play, 'call') : { ok: false };
    if (b.ok && v.ok) out.push(b.play);
  });
  return out;
}

function isNpcOpeningPhase(pi) {
  const p = s.players?.[pi];
  if (!p) return false;
  const turnNo = Math.max(1, Number(s?.turnCount || 1));
  // 序盤は「手札がまだ多い」かつ「局の前半ターン」を優先判定する
  return p.hand.length >= 7 || turnNo <= 3;
}

function collectNpcSingleOnlyCardIds(pi, calls, roles, sets) {
  const p = s.players?.[pi];
  if (!p) return new Set();
  const multiUse = new Set();
  const addCards = (play) => {
    (play?.cardsHand || []).forEach((card) => {
      if (card?.id) multiUse.add(card.id);
    });
  };
  (calls || []).forEach(addCards);
  (roles || []).forEach(addCards);
  (sets || []).forEach((play) => {
    if (Number(play?.count || 0) >= 2) addCards(play);
  });
  const out = new Set();
  p.hand.forEach((card) => {
    if (card?.id && !multiUse.has(card.id)) out.add(card.id);
  });
  return out;
}

function pickNpcOpeningSinglePlay(pi, sets, singleOnlyIds) {
  if (!Array.isArray(sets) || !sets.length || !(singleOnlyIds instanceof Set) || !singleOnlyIds.size) return null;
  const candidates = sets.filter((play) => {
    if (play?.type !== 'set' || Number(play.count) !== 1) return false;
    const cardId = play?.cardsHand?.[0]?.id;
    return !!cardId && singleOnlyIds.has(cardId);
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aPower = a?.setPower ?? a?.number ?? 0;
    const bPower = b?.setPower ?? b?.number ?? 0;
    const byPower = setCmp(aPower, bPower); // 弱い方を先に処理
    if (byPower !== 0) return byPower;
    return Number(a?.suitTier || 0) - Number(b?.suitTier || 0);
  });
  return candidates[0] || null;
}

function isNextPlayerOnLastCard(pi) {
  const next = nextAlive(pi, 1, false);
  if (!Number.isInteger(next) || next === pi) return false;
  return Number(s?.players?.[next]?.hand?.length || 0) === 1;
}

function pickNpcPressurePlay(calls, roles, sets) {
  const roleLike = [...(calls || []), ...(roles || [])];
  if (roleLike.length) {
    roleLike.sort((a, b) => compareRole(b.role, a.role));
    return roleLike[0] || null;
  }
  const setList = Array.isArray(sets) ? sets.slice() : [];
  if (!setList.length) return null;
  const pairOrMore = setList.filter((m) => Number(m?.count || 0) >= 2);
  const byPowerDesc = (a, b) => {
    const ap = Number(a?.setPower ?? a?.number ?? 0);
    const bp = Number(b?.setPower ?? b?.number ?? 0);
    if (bp !== ap) return bp - ap;
    const ac = Number(a?.count || 0);
    const bc = Number(b?.count || 0);
    if (bc !== ac) return bc - ac;
    return Number(b?.suitTier || 0) - Number(a?.suitTier || 0);
  };
  if (pairOrMore.length) {
    pairOrMore.sort(byPowerDesc);
    return pairOrMore[0] || null;
  }
  const singles = setList.filter((m) => Number(m?.count || 0) === 1);
  const target = singles.length ? singles : setList;
  target.sort(byPowerDesc);
  return target[0] || null;
}

function npcDecide(pi) {
  const p = s.players[pi], calls = callMoves(pi), sets = setMoves(pi), roles = roleMoves(pi);
  if (s.callOnly) {
    if (!calls.length) return { action: 'pass' };
    const outNow = calls.find((m) => m.selected.length === p.hand.length);
    if (outNow) return { action: 'play', play: outNow };
    calls.sort((a, b) => compareRole(b.role, a.role));
    return { action: 'play', play: calls[0] };
  }
  const all = [...calls, ...roles, ...sets];
  if (!all.length) return { action: 'pass' };
  const outNow = all.find((m) => m.selected.length === p.hand.length);
  if (outNow) return { action: 'play', play: outNow };
  if (isNextPlayerOnLastCard(pi)) {
    const pressurePlay = pickNpcPressurePlay(calls, roles, sets);
    if (pressurePlay) return { action: 'play', play: pressurePlay };
  }
  if (isNpcOpeningPhase(pi)) {
    const singleOnlyIds = collectNpcSingleOnlyCardIds(pi, calls, roles, sets);
    const openingSingle = pickNpcOpeningSinglePlay(pi, sets, singleOnlyIds);
    if (openingSingle) return { action: 'play', play: openingSingle };
  }
  all.sort((a, b) => {
    if (a.type === 'role' && b.type === 'set') return -1;
    if (a.type === 'set' && b.type === 'role') return 1;
    if (a.type === 'role' && b.type === 'role') return compareRole(b.role, a.role);
    return setCmp(b.setPower ?? b.number, a.setPower ?? a.number) || (b.suitTier - a.suitTier);
  });
  return { action: 'play', play: all[0] };
}

function sortNpcPlayCandidates(all) {
  all.sort((a, b) => {
    if (a.type === 'role' && b.type === 'set') return -1;
    if (a.type === 'set' && b.type === 'role') return 1;
    if (a.type === 'role' && b.type === 'role') return compareRole(b.role, a.role);
    return setCmp(b.setPower ?? b.number, a.setPower ?? a.number) || (b.suitTier - a.suitTier);
  });
  return all;
}

function pickBestNpcLeadPlay(pi) {
  const sets = setMoves(pi);
  const roles = roleMoves(pi);
  if (isNpcOpeningPhase(pi)) {
    const singleOnlyIds = collectNpcSingleOnlyCardIds(pi, [], roles, sets);
    const openingSingle = pickNpcOpeningSinglePlay(pi, sets, singleOnlyIds);
    if (openingSingle) return openingSingle;
  }
  const all = [...roles, ...sets];
  if (!all.length) return null;
  return sortNpcPlayCandidates(all)[0] || null;
}

function recoverNpcNoTrickState(pi) {
  if (!s || !s.roundActive || s.phase !== 'turn' || s.turn !== pi || s.trick) return false;
  const p = s.players?.[pi];
  if (!p || !isNpcPlayer(pi)) return false;

  let lead = pickBestNpcLeadPlay(pi);
  if (lead) {
    applyPlay(pi, lead);
    return true;
  }

  if (p.hand.length < START_HAND && (s.minorDeck.length > 0 || s.majorDeck.length > 0)) {
    traceKingdomFlow('recoverNpcNoTrickState.drawChoice', `player=${pi}`);
    drawChoiceStart(pi);
    return true;
  }
  return false;
}

function npcAct() {
  if (!isHostAuthority()) return;
  if (npcActInFlight) return;
  npcActInFlight = true;
  try {
  traceKingdomFlow('npcAct.enter');
  if (!s || !s.roundActive) return;
  if (s.phase === 'draw' && s.pendingDraw != null) {
    const dpi = s.pendingDraw;
    const plan = npcChooseDrawPlan(dpi);
    traceKingdomFlow('npcAct.drawPhase', `player=${dpi} plan=${plan} reason=${s.pendingDrawReason || 'normal'}`);
    if (plan === 'skip') {
      skipDrawChoice(dpi, s.pendingDrawReason === 'clear' ? 'クリア後は攻め継続' : '戦術');
      return;
    }
    applyDrawChoice(plan);
    return;
  }
  if (s.phase === 'judgment' && s.pendingJudgment != null) { traceKingdomFlow('npcAct.judgmentPhase', `player=${s.pendingJudgment}`); skipJudgmentPick(); return; }
  if (s.phase !== 'turn') { traceKingdomFlow('npcAct.abort', 'reason=notTurnPhase'); return; }
  const pi = s.turn, p = s.players[pi];
  if (!p || !isNpcPlayer(pi)) { traceKingdomFlow('npcAct.abort', `reason=invalidOrHuman turn=${pi}`); return; }
  if (!s.trick && recoverNpcNoTrickState(pi)) { traceKingdomFlow('npcAct.recoverNoTrick', `player=${pi}`); return; }
  if (!s.trick) {
    const leadSetMoves = setMoves(pi);
    const leadRoleMoves = roleMoves(pi);
    if (!leadSetMoves.length && !leadRoleMoves.length) {
      if (p.hand.length < START_HAND && (s.minorDeck.length > 0 || s.majorDeck.length > 0)) {
        log(`${pName(pi)}: 親ターンで有効手なし→ドローへ`);
        drawChoiceStart(pi);
        return;
      }
    }
  }
  if (p.hand.length < START_HAND && s.minorDeck.length > 0) {
    const hangIdx = p.hand.findIndex((c) => c?.kind === 'major' && c?.number === 12);
    if (hangIdx >= 0 && Math.random() < 0.22) {
      const used = useHangedManAction(pi, [hangIdx]);
      if (used.ok) {
        traceKingdomFlow('npcAct.hangedMan', `player=${pi}`);
        scheduleNpcTimer(Math.max(420, Math.floor(NPC_DELAY * 0.75)), () => {
          if (!s || !s.roundActive) return;
          if (s.phase !== 'turn' || s.turn !== pi) return;
          if (!s.players?.[pi] || !isNpcPlayer(pi)) return;
          npcAct();
        });
        return;
      }
    }
  }
  const d = npcDecide(pi);
  traceKingdomFlow('npcAct.decide', `player=${pi} action=${d?.action || 'none'}`);
  if (d.action === 'play' && d.play) {
    traceKingdomFlow('npcAct.play', `player=${pi} type=${d.play.type} count=${d.play.count}`);
    applyPlay(pi, d.play);
  } else if (!s.trick && recoverNpcNoTrickState(pi)) {
    traceKingdomFlow('npcAct.recoverNoTrick.fallback', `player=${pi}`);
    return;
  } else {
    traceKingdomFlow('npcAct.pass', `player=${pi}`);
    passAction(pi);
  }
  } finally {
    traceKingdomFlow('npcAct.exit');
    npcActInFlight = false;
  }
}

function scheduleNpc() {
  if (!isHostAuthority()) {
    clearNpcTimer();
    return;
  }
  enforceLeadTurnInvariant();
  traceKingdomFlow('scheduleNpc.enter');
  clearNpcTimer();
  if (!s || !s.roundActive) {
    traceKingdomFlow('scheduleNpc.abort', 'reason=inactive');
    return;
  }
  if (s.phase === 'draw' && s.pendingDraw != null && isNpcPlayer(s.pendingDraw)) {
    traceKingdomFlow('scheduleNpc.timer', `reason=draw player=${s.pendingDraw} delay=${NPC_DELAY}`);
    scheduleNpcTimer(NPC_DELAY, () => npcAct());
    return;
  }
  if (s.phase === 'judgment' && s.pendingJudgment != null && isNpcPlayer(s.pendingJudgment)) {
    traceKingdomFlow('scheduleNpc.timer', `reason=judgment player=${s.pendingJudgment} delay=${NPC_DELAY}`);
    scheduleNpcTimer(NPC_DELAY, () => npcAct());
    return;
  }
  if (s.phase !== 'turn') {
    traceKingdomFlow('scheduleNpc.abort', `reason=phase:${s.phase}`);
    return;
  }
  if (isNpcPlayer(s.turn)) {
    traceKingdomFlow('scheduleNpc.timer', `reason=turn player=${s.turn} delay=${NPC_DELAY}`);
    scheduleNpcTimer(NPC_DELAY, () => npcAct());
    return;
  }
  traceKingdomFlow('scheduleNpc.abort', `reason=humanTurn player=${s.turn}`);
}

function cardNode(card, opt = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'tarot-card';
  const arcanaMatchNumber = getArcanaMatchNumber();
  if (card?.kind === 'minor' && arcanaMatchNumber != null && Number(card.number) === arcanaMatchNumber) {
    el.classList.add('is-arcana-match');
  }
  if (card?.kind === 'minor') {
    el.classList.add(String(card.suit || 'None').toLowerCase());
  } else if (card?.kind === 'major') {
    el.classList.add('is-arcana');
    if (card.number === 1) {
      el.classList.add('arcana-all-corners');
    } else if ([16, 17, 18, 19].includes(Number(card.number))) {
      const arcanaSuit = SPECIAL_SUIT[Number(card.number)];
      el.classList.add('arcana-suit-hybrid');
      if (arcanaSuit && SUIT_COLOR[arcanaSuit]) {
        el.style.setProperty('--arcana-color', SUIT_COLOR[arcanaSuit]);
      }
    } else {
      el.classList.add('none');
    }
  } else {
    el.classList.add('none');
  }
  if (opt.small) el.classList.add('is-mini');
  if (opt.clickable) el.classList.add('is-clickable');
  else el.classList.add('is-static');
  if (opt.selected) el.classList.add('is-selected');
  if (!opt.onClick) el.disabled = true;
  const art = document.createElement('span');
  art.className = 'tarot-card-art';
  const pos = spritePos(getSpriteIndex(card));
  art.style.setProperty('--tarot-sprite-src', `url("${TAROT_SPRITE_SRC}")`);
  art.style.setProperty('--tarot-sheet-w', '512px');
  art.style.setProperty('--tarot-sheet-h', '1024px');
  art.style.setProperty('--tarot-x', `${pos.x}px`);
  art.style.setProperty('--tarot-y', `${pos.y}px`);
  const label = document.createElement('span');
  label.className = 'tarot-card-title';
  label.textContent = getCardNameLabel(card);
  const power = document.createElement('span');
  power.className = 'tarot-card-number';
  power.textContent = getCardNumberLabel(card);
  el.appendChild(art); el.appendChild(label); el.appendChild(power);
  if (opt.onClick) el.addEventListener('click', opt.onClick);
  return el;
}

function renderPlayers() {
  ui.players.innerHTML = '';
  const callOwner = (s.phase === 'callCinematic' && s.callMergeFx?.owner != null)
    ? Number(s.callMergeFx.owner)
    : null;
  s.players.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'tarot-kingdom-player-row';
    row.dataset.playerIndex = String(i);
    const isLastOne = Number(p?.hand?.length || 0) === 1;
    if (i === s.turn && s.phase === 'turn') row.classList.add('is-turn');
    if (isLocalPlayer(i)) row.classList.add('is-human');
    if (isLastOne) row.classList.add('is-last-one');
    if (callOwner != null) {
      if (i === callOwner) row.classList.add('is-call-focus');
      else row.classList.add('is-call-dim');
    }
    const left = document.createElement('div');
    left.className = 'tarot-kingdom-player-name';
    const starCount = Math.max(0, Number(p.stars) || 0);
    left.textContent = `${p.name}${starCount > 0 ? ` ${'⭐'.repeat(starCount)}` : ''}`;
    const right = document.createElement('div');
    right.className = 'tarot-kingdom-player-meta';
    if (isLastOne) {
      const warn = document.createElement('span');
      warn.className = 'tarot-kingdom-flag is-last-one';
      warn.textContent = 'LAST 1';
      right.appendChild(warn);
    }
    const handCount = Math.max(0, Number(p?.hand?.length || 0));
    const handMeta = document.createElement('span');
    handMeta.className = 'tarot-kingdom-meta-hand';
    if (handCount <= 3) handMeta.classList.add('is-low');
    if (handCount <= 1) handMeta.classList.add('is-critical');
    handMeta.textContent = `手札${handCount}`;
    const slash = document.createElement('span');
    slash.className = 'tarot-kingdom-meta-sep';
    slash.textContent = '/';
    const chipsMeta = document.createElement('span');
    chipsMeta.className = 'tarot-kingdom-meta-chips';
    chipsMeta.textContent = `${p.chips}チップ`;
    right.appendChild(handMeta);
    right.appendChild(slash);
    right.appendChild(chipsMeta);
    row.appendChild(left); row.appendChild(right); ui.players.appendChild(row);
  });
}

function renderTrick() {
  const cards = s.trick?.cardsTable || [];
  let ramSettleFirstCard = false;
  if (ui.trickOwner) {
    if (!cards.length) {
      ui.trickOwner.textContent = '場札主: -';
    } else {
      const owner = Number.isInteger(s.trick?.owner) ? s.trick.owner : null;
      if (!Number.isInteger(owner) || !s.players?.[owner]) {
        ui.trickOwner.textContent = '場札主: -';
      } else {
        const handCount = Math.max(0, Number(s.players[owner]?.hand?.length || 0));
        const roleSuffix = s.trick?.type === 'role' && s.trick?.role
          ? `/${getRoleBaseLabel(s.trick.role)}`
          : '';
        ui.trickOwner.textContent = `場札主: ${pName(owner)} 手札${handCount}${roleSuffix}`;
      }
    }
  }
  const nextKey = cards.length
    ? cards.map((c) => c?.id || `${c?.kind || ''}:${c?.suit || ''}:${c?.number ?? ''}`).join('|')
    : '__empty__';
  const renderNow = () => {
    ui.trick.classList.remove('is-hit-stop');
    ui.trick.innerHTML = '';
    if (!cards.length) {
      const e = document.createElement('div');
      e.className = 'tarot-kingdom-empty';
      e.textContent = '場札なし';
      ui.trick.appendChild(e);
      return;
    }
    cards.forEach((c, idx) => {
      const node = cardNode(c, {
        clickable: true,
        onClick: () => showKingdomCardEffectInfo(c, '場札')
      });
      const callFxActive = s.callMergeFx?.owner != null && s.trick?.type === 'role' && s.trick?.call;
      const callFxLevel = Math.max(1, Number(s.callMergeFx?.level) || 1);
      let animDelayMs = 0;
      let animDurationMs = 240;
      if (callFxActive && idx > 0) {
        // コール時の4枚は右側から順に飛び込み、横一列で着地させる
        const orderFromRight = Math.max(0, (cards.length - 1) - idx);
        node.classList.add('is-call-arriving');
        animDelayMs = orderFromRight * Math.max(96, 154 - (callFxLevel * 10));
        animDurationMs = 360 + (callFxLevel * 62);
        node.style.animationDelay = `${animDelayMs}ms`;
        node.style.animationDuration = `${animDurationMs}ms`;
      } else if (callFxActive && idx === 0) {
        // 場札1枚目は据え置き、追加4枚のみ右→左で流し込む
        animDelayMs = 0;
        animDurationMs = 0;
      } else if (ramSettleFirstCard && idx === 0) {
        animDelayMs = 0;
        animDurationMs = 0;
      } else {
        node.classList.add('is-entering');
        animDelayMs = idx * (s.callMergeFx ? 120 : 78);
        animDurationMs = 260;
        node.style.animationDelay = `${animDelayMs}ms`;
        node.style.animationDuration = `${animDurationMs}ms`;
      }
      let cleaned = false;
      const clearAnimState = () => {
        if (cleaned) return;
        cleaned = true;
        node.classList.remove('is-entering');
        node.classList.remove('is-call-arriving');
        node.style.animationDelay = '';
        node.style.animationDuration = '';
      };
      node.addEventListener('animationend', clearAnimState, { once: true });
      // animationend が来ない環境でも透明のまま残らないようにする。
      setTimeout(clearAnimState, animDelayMs + animDurationMs + 120);
      ui.trick.appendChild(node);
    });
    ramSettleFirstCard = false;
  };

  if (nextKey === trickRenderKey) {
    const hasVisibleNode = !!ui.trick.querySelector('.tarot-card:not(.is-entering):not(.is-call-arriving):not(.is-undealt), .tarot-kingdom-empty');
    if (!hasVisibleNode) renderNow();
    return;
  }
  trickRenderKey = nextKey;

  if (trickSwapTimer) {
    clearTimeout(trickSwapTimer);
    trickSwapTimer = null;
  }
  const prevCards = Array.from(ui.trick.querySelectorAll('.tarot-card:not(.tarot-kingdom-trick-emphasis-card)'));
  const defeatFxRaw = String(s?.trickDefeatFx?.kind || 'normal');
  const defeatFxKind = ['normal', 'slash', 'rock', 'water', 'fire'].includes(defeatFxRaw)
    ? defeatFxRaw
    : 'normal';
  const transitionKind = String(s?.trickTransitionKind || '');
  const isCallTransition = transitionKind === 'callSteal';
  const isRoleClashTransition = transitionKind === 'roleClash';
  const callOwner = Number.isInteger(Number(s?.trick?.owner)) ? Number(s.trick.owner) : -1;
  s.trickDefeatFx = null;
  s.trickTransitionKind = null;

  if (prevCards.length > 0 && cards.length > 0) {
    trickRenderToken += 1;
    const swapToken = trickRenderToken;
    if (isCallTransition) {
      const hitStopMs = 60;
      const runIfCurrent = (fn) => {
        if (swapToken !== trickRenderToken) return;
        fn();
      };
      ui.trick.classList.add('is-hit-stop');
      setTimeout(() => runIfCurrent(() => ui.trick.classList.remove('is-hit-stop')), hitStopMs);
      const ghostTotalMs = playKingdomCallTauntGhostFx(prevCards[0], { delayMs: hitStopMs + 8, fadeInMs: 240, holdMs: 320, fadeOutMs: 220 });
      // 👻が煽った直後に4枚を右→左で流し込む
      const callOpenMs = hitStopMs + 240;
      setTimeout(() => runIfCurrent(() => renderNow()), callOpenMs);
      trickSwapTimer = setTimeout(() => {
        if (swapToken !== trickRenderToken) return;
        trickSwapTimer = null;
      }, Math.max(callOpenMs + 480, ghostTotalMs) + 80);
      return;
    }
    if (isRoleClashTransition) {
      const hitStopMs = 70;
      const ramMs = 220;
      const runIfCurrent = (fn) => {
        if (swapToken !== trickRenderToken) return;
        fn();
      };
      ui.trick.classList.add('is-hit-stop');
      setTimeout(() => runIfCurrent(() => ui.trick.classList.remove('is-hit-stop')), hitStopMs);
      const ramFx = playKingdomRamAttackFx(callOwner, cards[0], prevCards[0], {
        fromPoint: getKingdomTrickRightSourcePoint() || undefined,
        delayMs: hitStopMs,
        durationMs: ramMs,
        keepAfterHit: true
      });
      const clashMs = playKingdomRoleClashFx(callOwner, cards[0], prevCards[0], { delayMs: hitStopMs + 8, inMs: 240, holdMs: 70, outMs: 210 });
      const preDefeatMs = Math.max(260, clashMs);
      const staggerMs = 24;
      const tailMs = Math.max(0, (prevCards.length - 1) * staggerMs);
      const baseMs = 520;
      const markerMs = 280;
      setTimeout(() => runIfCurrent(() => triggerKingdomTrickShake(true)), hitStopMs + 210);
      setTimeout(() => runIfCurrent(() => {
        prevCards.forEach((node, idx) => {
          if (!node) return;
          if (idx === 0) spawnKingdomDefeatParticles(node, 'normal', { delayMs: 0 });
          node.classList.remove('is-entering', 'is-call-arriving', 'is-leaving');
          node.classList.add('is-defeat-transition', 'is-defeat-normal');
          node.style.animationDelay = `${idx * staggerMs}ms`;
          node.style.setProperty('--defeat-card-ms', `${baseMs}ms`);
          node.style.setProperty('--defeat-marker-ms', `${markerMs}ms`);
        });
      }), preDefeatMs);
      trickSwapTimer = setTimeout(() => {
        if (swapToken !== trickRenderToken) return;
        trickSwapTimer = null;
        ramSettleFirstCard = true;
        renderNow();
        const firstNode = ui.trick?.querySelector?.('.tarot-card');
        if (firstNode && ramFx?.settleTo) {
          firstNode.style.opacity = '0';
          firstNode.style.transform = 'translateY(0) scale(1)';
          ramFx.settleTo(firstNode, {
            durationMs: 170,
            onArrive: () => {
              firstNode.style.opacity = '';
              firstNode.style.transform = '';
            },
            autoRemove: true
          });
        } else if (ramFx?.remove) {
          ramFx.remove(84);
        }
      }, preDefeatMs + baseMs + tailMs + 80);
      return;
    }
    const isSpecial = defeatFxKind !== 'normal';
    const hitStopMs = 80;
    const ramMs = isSpecial ? 260 : 220;
    const preDefeatMs = hitStopMs + ramMs + 40;
    const staggerMs = 24;
    const tailMs = Math.max(0, (prevCards.length - 1) * staggerMs);
    const baseMs = isSpecial ? 620 : 420;
    const markerMs = isSpecial ? 320 : 240;
    const runIfCurrent = (fn) => {
      if (swapToken !== trickRenderToken) return;
      fn();
    };
    ui.trick.classList.add('is-hit-stop');
    setTimeout(() => runIfCurrent(() => ui.trick.classList.remove('is-hit-stop')), hitStopMs);
    const ramFx = playKingdomRamAttackFx(Number(s?.trick?.owner ?? -1), cards[0], prevCards[0], {
      fromPoint: getKingdomTrickRightSourcePoint() || undefined,
      delayMs: hitStopMs,
      durationMs: ramMs,
      keepAfterHit: true
    });
    setTimeout(() => runIfCurrent(() => triggerKingdomTrickShake(isSpecial)), hitStopMs + ramMs - 18);
    setTimeout(() => runIfCurrent(() => {
      prevCards.forEach((node, idx) => {
        if (!node) return;
        if (idx === 0) spawnKingdomDefeatParticles(node, defeatFxKind, { delayMs: 0 });
        node.classList.remove('is-entering', 'is-call-arriving', 'is-leaving');
        node.classList.add('is-defeat-transition', `is-defeat-${defeatFxKind}`);
        node.style.animationDelay = `${idx * staggerMs}ms`;
        node.style.setProperty('--defeat-card-ms', `${baseMs}ms`);
        node.style.setProperty('--defeat-marker-ms', `${markerMs}ms`);
      });
    }), preDefeatMs);
    trickSwapTimer = setTimeout(() => {
      if (swapToken !== trickRenderToken) return;
      trickSwapTimer = null;
      ramSettleFirstCard = true;
      renderNow();
      const firstNode = ui.trick?.querySelector?.('.tarot-card');
      if (firstNode && ramFx?.settleTo) {
        firstNode.style.opacity = '0';
        firstNode.style.transform = 'translateY(0) scale(1)';
        ramFx.settleTo(firstNode, {
          durationMs: 170,
          onArrive: () => {
            firstNode.style.opacity = '';
            firstNode.style.transform = '';
          },
          autoRemove: true
        });
      } else if (ramFx?.remove) {
        ramFx.remove(84);
      }
    }, preDefeatMs + baseMs + tailMs + 80);
    return;
  }
  trickRenderToken += 1;
  renderNow();
}

function renderHand() {
  ui.hand.innerHTML = '';
  const me = getLocalPlayerIndex();
  if (me < 0 || !s.players?.[me]) return;
  const inOpeningDeal = s.roundActive && s.phase === 'openingDeal';
  const openingRevealCount = Math.max(0, Number(s.openingDealRevealCount || 0));
  const openingFlipIndex = Number.isInteger(Number(s.openingDealFlipIndex))
    ? Number(s.openingDealFlipIndex)
    : -1;
  const freezeUntil = Number(s.handSortFreezeUntil || 0);
  const freezeActive = freezeUntil > Date.now();
  if (!freezeActive && !inOpeningDeal) applyLocalHandSortMode(false);
  const selected = sanitizeSelected(me);
  if (ui.selectedEffect) {
    ui.selectedEffect.textContent = '';
    ui.selectedEffect.hidden = true;
  }
  const drawMe = s.roundActive && s.phase === 'draw' && s.pendingDraw === me;
  const canCommit = (s.roundActive && s.phase === 'turn' && s.turn === me) || drawMe;
  const canSelect = !!(s.roundActive && !inOpeningDeal && Array.isArray(s.players[me]?.hand) && s.players[me].hand.length > 0);
  const onHandTap = (idx) => {
    if (!canSelect) {
      showPlayError('今は手札を選択できません。');
      return;
    }
    if (s.selected.has(idx)) s.selected.delete(idx);
    else s.selected.add(idx);
    const selectedNow = sanitizeSelected(me);
    const infoText = buildSelectedCardInfoMessage(me, selectedNow);
    s.message = infoText || (canCommit
      ? '選択中'
      : '選択中（あなたのターン待ち）');
    render();
  };
  s.players[me].hand.forEach((c, i) => {
    const showCard = inOpeningDeal
      ? ((i < openingRevealCount || i === openingFlipIndex) ? c : null)
      : c;
    const node = cardNode(showCard, {
      clickable: canSelect,
      selected: selected.includes(i),
      onClick: () => onHandTap(i)
    });
    if (inOpeningDeal && i === openingFlipIndex) node.classList.add('is-opening-flip');
    ui.hand.appendChild(node);
  });
}

function clearSelectedCards(withMessage = true) {
  if (!s) return;
  if (!s.selected || s.selected.size <= 0) return;
  s.selected.clear();
  if (withMessage) {
    if (s.roundActive && (s.phase === 'turn' || s.phase === 'draw')) {
      s.message = '選択を解除しました。';
    } else {
      s.message = '';
    }
  }
  render();
}

function toggleGraveyard() {
  if (!s) return;
  if (s.pendingJudgment != null) {
    s.graveOpen = true;
    render();
    return;
  }
  s.graveOpen = !s.graveOpen;
  s.message = s.graveOpen ? '墓地を表示します。' : '墓地を閉じました。';
  render();
}

function renderJudgment() {
  const inJudgment = s.pendingJudgment != null;
  const forceVisible = inJudgment;
  const visible = forceVisible || !!s.graveOpen;
  if (!visible) {
    ui.judgmentArea.style.display = 'none';
    ui.judgmentOptions.innerHTML = '';
    return;
  }

  ui.judgmentArea.style.display = 'block';
  ui.judgmentOptions.innerHTML = '';

  const judgmentPlayer = inJudgment ? s.players[s.pendingJudgment] : null;
  const human = Number(s.pendingJudgment) === getLocalPlayerIndex();
  if (ui.judgmentTitle) {
    ui.judgmentTitle.textContent = inJudgment
      ? '審判: 墓地から回収するカードを選択'
      : '墓地（場から取り除かれたカード）';
  }
  ui.judgmentSkipButton.style.display = inJudgment ? '' : 'none';
  ui.judgmentSkipButton.disabled = !(inJudgment && human);

  const slotMap = new Map();
  s.players.forEach((p, owner) => {
    p.discard.forEach((card, cardIndex) => {
      if (!card || card.kind !== 'minor') return;
      slotMap.set(`${card.suit}:${Number(card.number)}`, { card, owner, cardIndex });
    });
  });

  const rankHeader = document.createElement('div');
  rankHeader.className = 'tarot-kingdom-grave-rank-header';
  GRAVE_RANK_ORDER.forEach((rank) => {
    const cell = document.createElement('div');
    cell.className = 'tarot-kingdom-grave-rank-cell';
    cell.textContent = GRAVE_RANK_LABEL[rank] || String(rank);
    rankHeader.appendChild(cell);
  });
  ui.judgmentOptions.appendChild(rankHeader);

  SUITS.forEach((suit) => {
    const row = document.createElement('div');
    row.className = 'tarot-kingdom-grave-row';

    const suitLabel = document.createElement('div');
    suitLabel.className = 'tarot-kingdom-grave-suit-label';
    suitLabel.textContent = suit;
    row.appendChild(suitLabel);

    const grid = document.createElement('div');
    grid.className = 'tarot-kingdom-grave-grid';

    GRAVE_RANK_ORDER.forEach((rank) => {
      const slot = document.createElement('div');
      slot.className = 'tarot-kingdom-grave-slot';
      const entry = slotMap.get(`${suit}:${rank}`);
      if (!entry) {
        const empty = document.createElement('div');
        empty.className = 'tarot-kingdom-grave-slot-empty';
        empty.textContent = ' ';
        slot.appendChild(empty);
      } else {
        const clickable = inJudgment && human;
        const node = cardNode(entry.card, {
          clickable: true,
          onClick: clickable
            ? () => {
              const me = getLocalPlayerIndex();
              requestHostAction(
                { type: 'judgmentPick', owner: entry.owner, cardIndex: entry.cardIndex },
                () => {
                  if (s?.phase === 'judgment' && s.pendingJudgment === me) {
                    applyJudgmentPick(entry.owner, entry.cardIndex);
                  }
                }
              ).catch((error) => {
                console.warn('[tarotKingdom] judgment pick action failed:', error);
              });
            }
            : () => {
              s.message = `${getCardNameLabel(entry.card)} は ${pName(entry.owner)} が出したカード`;
              renderSummary();
            }
        });
        node.classList.add('is-mini');
        slot.appendChild(node);
      }
      grid.appendChild(slot);
    });
    row.appendChild(grid);
    ui.judgmentOptions.appendChild(row);
  });
}

function renderOracleCard() {
  if (ui.oracleCard) {
    ui.oracleCard.innerHTML = '';
    const card = (s.openOracleRevealed && s.openOracleCard) ? s.openOracleCard : null;
    ui.oracleCard.appendChild(cardNode(card, { small: true }));
  }
  if (ui.hiddenOracleCard) {
    ui.hiddenOracleCard.innerHTML = '';
    const hiddenCard = (s.hiddenOracleRevealed && s.hiddenOracleCard) ? s.hiddenOracleCard : null;
    ui.hiddenOracleCard.appendChild(cardNode(hiddenCard, { small: true }));
  }
}

function renderSummary() {
  const turnText = s.roundActive ? ` / ターン ${Math.max(1, Number(s.turnCount) || 1)}` : '';
  ui.round.textContent = `局 ${Math.min(s.handNo + 1, TOTAL_HANDS)} / ${TOTAL_HANDS}${turnText}`;
  if (ui.turn) ui.turn.textContent = s.roundActive ? `${pName(s.turn)}の手番` : '待機中';
  if (ui.reverseChip) {
    const showReverse = !!s.roundActive && !!s.reverse;
    ui.reverseChip.hidden = !showReverse;
    ui.reverseChip.style.display = showReverse ? '' : 'none';
    ui.reverseChip.textContent = s.reversePersist ? '11バック中（この局）' : '11バック中';
  }
  if (ui.lockChip) {
    const lockSuit = s?.lock?.suit || null;
    const showLock = !!lockSuit;
    ui.lockChip.hidden = !showLock;
    ui.lockChip.style.display = showLock ? '' : 'none';
    ui.lockChip.classList.remove('is-lock-wand', 'is-lock-cup', 'is-lock-sword', 'is-lock-pentacle');
    if (showLock) {
      const key = String(lockSuit || '').toLowerCase();
      ui.lockChip.classList.add(`is-lock-${key}`);
      const minText = s?.lock?.min != null ? ` / >${s.lock.min}` : '';
      ui.lockChip.textContent = `ロック: ${SUIT_LABEL[lockSuit] || lockSuit}${minText}`;
    }
  }
  ui.root?.classList.toggle('is-reverse', !!s.reverse);
  ui.stateText.textContent = s.message || '';
  if (ui.score) ui.score.textContent = '';
  if (ui.openOracle) {
    if (!s.openOracleCard) ui.openOracle.textContent = '表: なし';
    else if (!s.openOracleRevealed) ui.openOracle.textContent = '表: 未公開';
    else ui.openOracle.textContent = `表: ${getCardNameLabel(s.openOracleCard)} ${s.openOracle != null ? `(オラクル ${getCardNumberLabel({ kind: 'minor', number: s.openOracle, suit: 'None' })})` : '(表オラクルなし)'}`;
  }
  if (ui.hiddenOracle) {
    ui.hiddenOracle.textContent = s.hiddenOracleCard ? `裏: ${getCardNameLabel(s.hiddenOracleCard)} (${getCardNumberLabel(s.hiddenOracleCard)})` : '裏: 未公開';
  }
  if (ui.log) {
    const logs = Array.isArray(s?.logs) ? s.logs : [];
    ui.log.innerHTML = logs.slice(-28).map((m) => `<div class="tarot-log-row">${m}</div>`).join('');
    ui.log.scrollTop = ui.log.scrollHeight;
  }
}

function renderSettlement() {
  const panel = ui.settlement;
  const body = ui.settlementBody;
  const confirmButton = ui.settlementConfirmButton;
  const data = s.roundSettlement;
  const show = !!data;
  if (panel) {
    panel.hidden = !show;
    panel.style.display = show ? '' : 'none';
  }
  if (!show) {
    if (body) body.innerHTML = '';
    if (confirmButton) {
      confirmButton.hidden = true;
      confirmButton.disabled = true;
    }
    return;
  }

  if (body) {
    body.innerHTML = '';

    const winnerAnchor = document.createElement('div');
    winnerAnchor.id = 'tarotKingdomSettlementWinnerAnchor';
    winnerAnchor.className = 'tarot-kingdom-settlement-winner';
    const winnerMain = document.createElement('div');
    winnerMain.className = 'tarot-kingdom-settlement-winner-main';
    const shownGain = Math.max(0, Number(data.displayTotalGain ?? data.totalGain) || 0);
    winnerMain.textContent = `勝者 ${data.winnerName} / 受取 +${shownGain} TP`;
    const winnerSub = document.createElement('div');
    winnerSub.className = 'tarot-kingdom-settlement-winner-sub';
    const stars = Math.max(0, Number(data.starBonus) || 0);
    const starText = stars > 0 ? '★'.repeat(stars) : '★0';
    winnerSub.textContent = `${starText} / オラクルx${Math.max(0, Number(data.oracleHits) || 0)}`;
    winnerAnchor.appendChild(winnerMain);
    winnerAnchor.appendChild(winnerSub);
    body.appendChild(winnerAnchor);

    (data.rows || []).forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'tarot-kingdom-settlement-row';

      const top = document.createElement('div');
      top.className = 'tarot-kingdom-settlement-row-top';
      top.textContent = `${row.payerName} → ${row.receiverName}`;
      rowEl.appendChild(top);

      const values = document.createElement('div');
      values.className = 'tarot-kingdom-settlement-row-values';
      values.textContent = `支払 ${row.pay} TP / 受取 ${row.pay} TP`;
      rowEl.appendChild(values);

      const formula = document.createElement('div');
      formula.className = 'tarot-kingdom-settlement-row-formula';
      formula.textContent = `計算式: 手札${row.remain} x 係数${row.scoreFactor} = ${row.pay}TP`;
      rowEl.appendChild(formula);

      const factors = document.createElement('div');
      factors.className = 'tarot-kingdom-settlement-row-formula';
      factors.textContent = `係数内訳: ${row.factorSummary || '基本x1'}`;
      rowEl.appendChild(factors);

      body.appendChild(rowEl);
    });

    if (data.potAward > 0) {
      const pot = document.createElement('div');
      pot.className = 'tarot-kingdom-settlement-pot';
      pot.textContent = `POT受取: ${data.potAward} TP`;
      body.appendChild(pot);
    }

    const total = document.createElement('div');
    total.className = 'tarot-kingdom-settlement-total';
    total.textContent = `総受取: ${data.totalGain} TP`;
    body.appendChild(total);
  }

  if (confirmButton) {
    const canConfirm = !!s.awaitRoundConfirm && !s.roundActive && s.handNo < TOTAL_HANDS && s.phase !== 'done';
    confirmButton.hidden = !canConfirm;
    confirmButton.disabled = !canConfirm;
    if (canConfirm) confirmButton.textContent = '確認して次の局へ';
  }
}

function updateButtons() {
  const me = getLocalPlayerIndex();
  if (me < 0 || !s.players?.[me]) {
    if (ui.startButton) {
      ui.startButton.hidden = true;
      ui.startButton.disabled = true;
    }
    ui.playButton.disabled = true;
    ui.clearButton.disabled = true;
    ui.passButton.disabled = true;
    ui.drawMinorButton.disabled = true;
    ui.drawMajorButton.disabled = true;
    if (ui.graveToggleButton) ui.graveToggleButton.disabled = true;
    return;
  }
  const inCallCinematic = s.phase === 'callCinematic';
  const inOpeningCinematic = s.phase === 'openingCinematic';
  const inOpeningDeal = s.phase === 'openingDeal';
  const actionLocked = inCallCinematic || inOpeningCinematic || inOpeningDeal;
  const myStars = Math.max(0, Number(s.players[me]?.stars) || 0);
  const myHandCount = Math.max(0, Number(s.players[me]?.hand?.length || 0));
  const netMode = isNetModeActive();
  const seatCount = netMode ? getActiveSeatCount() : 1;
  const hasVacancy = netMode ? seatCount < 4 : false;
  const isLobbyReadyToStart =
    !s.roundActive &&
    !s.awaitRoundConfirm &&
    Number(s.handNo || 0) <= 0 &&
    String(s.phase || '') !== 'done';
  const myTurn = s.roundActive && s.phase === 'turn' && s.turn === me;
  const drawMe = s.roundActive && s.phase === 'draw' && s.pendingDraw === me;
  const hasSelected = !!(s.selected && s.selected.size > 0);
  const canClearSelection = hasSelected;
  const canToggleSort = !hasSelected && myHandCount > 1;
  const canPlayNow = myTurn || drawMe;
  ui.startButton.hidden = !!s.roundActive || !!s.awaitRoundConfirm;
  if (ui.playButton) {
    ui.playButton.textContent = '選択';
    ui.playButton.disabled = actionLocked || !canPlayNow;
  }
  if (ui.clearButton) {
    ui.clearButton.textContent = hasSelected
      ? '選択解除'
      : (localHandSortMode === HAND_SORT_MODE.SUIT ? '数値順' : 'スート順');
    ui.clearButton.disabled = actionLocked || !(canClearSelection || canToggleSort);
  }
  ui.passButton.disabled = actionLocked || !myTurn;
  ui.drawMinorButton.disabled = actionLocked || !(drawMe && s.minorDeck.length > 0 && myHandCount < START_HAND);
  ui.drawMajorButton.disabled = actionLocked || !(drawMe && s.majorDeck.length > 0 && myStars > 0 && myHandCount < START_HAND);
  const actionReadyPhase = myTurn || drawMe;
  const popupButtons = [ui.drawMajorButton, ui.drawMinorButton, ui.graveToggleButton, ui.passButton];
  popupButtons.forEach((btn) => {
    if (!btn) return;
    const isReady = !!(actionReadyPhase && !btn.disabled);
    btn.classList.toggle('is-ready', isReady);
  });
  if (ui.actionPopup) {
    const hasReady = popupButtons.some((btn) => !!btn && btn.classList.contains('is-ready'));
    ui.actionPopup.classList.toggle('is-human-ready', hasReady);
    ui.actionPopup.classList.toggle('is-call-locked', inCallCinematic);
  }
  if (ui.graveToggleButton) {
    if (s.pendingJudgment != null) {
      ui.graveToggleButton.textContent = '墓地（審判中）';
      ui.graveToggleButton.disabled = true;
    } else {
      ui.graveToggleButton.textContent = s.graveOpen ? '墓地を閉じる' : '墓地を見る';
      ui.graveToggleButton.disabled = actionLocked || !s.roundActive;
    }
  }
  if (ui.startButton) {
    if (netMode && !tkNet.isHost) {
      ui.startButton.disabled = true;
      ui.startButton.textContent = 'ホストの開始を待機中';
    } else {
      ui.startButton.disabled = false;
      if (s.phase === 'done') {
        ui.startButton.textContent = '新しいゲームを開始';
      } else if (!s.roundActive && s.handNo > 0) {
        ui.startButton.textContent = '次の局を開始';
      } else if (isLobbyReadyToStart && hasVacancy) {
        ui.startButton.textContent = '受付を止めて戦いを始める';
      } else {
        ui.startButton.textContent = '新しい戦いを始める';
      }
    }
  }

  // 吊るされた男ボタンの表示制御
  if (ui.hangedManButton) {
    let showHanged = false;
    if (myTurn && s.selected.size === 1) {
      const idx = Array.from(s.selected)[0];
      const card = s.players[me].hand[idx];
      if (card && card.kind === 'major' && card.number === 12) {
        showHanged = true;
      }
    }
    ui.hangedManButton.style.display = showHanged ? '' : 'none';
    ui.hangedManButton.disabled = actionLocked;
  }
}

function render() {
  if (!s) return;
  resolveReversePersistSuspend();
  enforceLeadTurnInvariant();
  renderSummary();
  setOpenRoomsVisibility(shouldShowOpenRoomsLobby());
  renderSettlement();
  renderOracleCard();
  renderPlayers();
  renderTrick();
  renderHand();
  renderJudgment();
  updateButtons();
  syncHumanTurnCueState();
  if (isNetModeActive() && tkNet.isHost) {
    queueStatePublish();
  }
}

function revealOracleWithFlip() {
  if (!s || s.openOracleRevealed || !s.openOracleCard) return;
  clearOracleFlipTimers();
  ui.oracleCardWrap?.classList.add('is-flipping');
  oracleFlipSwapTimer = setTimeout(() => {
    oracleFlipSwapTimer = null;
    if (!s) return;
    s.openOracleRevealed = true;
    renderSummary();
    renderOracleCard();
  }, 280);
  oracleFlipEndTimer = setTimeout(() => {
    oracleFlipEndTimer = null;
    ui.oracleCardWrap?.classList.remove('is-flipping');
  }, 600);
}

function revealHiddenOracleWithFlip() {
  if (!s || s.hiddenOracleRevealed || !s.hiddenOracleCard) return;
  clearOracleFlipTimers();
  ui.hiddenOracleCardWrap?.classList.add('is-flipping');
  hiddenOracleFlipSwapTimer = setTimeout(() => {
    hiddenOracleFlipSwapTimer = null;
    if (!s) return;
    s.hiddenOracleRevealed = true;
    renderSummary();
    renderOracleCard();
  }, 280);
  hiddenOracleFlipEndTimer = setTimeout(() => {
    hiddenOracleFlipEndTimer = null;
    ui.hiddenOracleCardWrap?.classList.remove('is-flipping');
  }, 600);
}

function beginNextRound() {
  setupHand();
  render();
  const startOpeningDeal = () => {
    if (!s || !s.roundActive) return;
    playOpeningDealCinematic();
  };
  if (!s.openOracleRevealed && s.openOracleCard) {
    revealOracleWithFlip();
    if (oracleRevealDelayTimer) {
      clearTimeout(oracleRevealDelayTimer);
      oracleRevealDelayTimer = null;
    }
    oracleRevealDelayTimer = setTimeout(() => {
      oracleRevealDelayTimer = null;
      startOpeningDeal();
    }, ORACLE_FLIP_TOTAL_MS);
    return;
  }
  startOpeningDeal();
}

function confirmRoundSettlement() {
  if (!s || !s.awaitRoundConfirm) return;
  if (s.handNo >= TOTAL_HANDS || s.phase === 'done') return;
  s.awaitRoundConfirm = false;
  s.roundSettlement = null;
  beginNextRound();
}

function startOrNext() {
  if (!s || s.phase === 'done') resetMatch();
  if (s.awaitRoundConfirm) return;
  if (!s.roundActive && s.handNo < TOTAL_HANDS) {
    beginNextRound();
  }
}

async function requestHostAction(action, localApply) {
  if (!isNetModeActive() || tkNet.isHost) {
    localApply?.();
    queueStatePublish();
    return true;
  }
  const ok = await sendRoomAction(action);
  if (!ok) {
    showPlayError('通信に失敗しました。少し待って再実行してください。');
  }
  return ok;
}

function useHangedManAction(pi, selectedIndexes) {
  const p = s?.players?.[pi];
  if (!p) return { ok: false, reason: 'プレイヤー情報が不正です。' };
  if (!Array.isArray(selectedIndexes) || selectedIndexes.length !== 1) return { ok: false, reason: '吊るされた男は1枚選択で使用します。' };
  const idx = Number(selectedIndexes[0]);
  const card = p.hand[idx];
  if (!card || card.kind !== 'major' || card.number !== 12) return { ok: false, reason: '吊るされた男を選択してください。' };
  if (p.hand.length >= START_HAND) return { ok: false, reason: `手札が上限(${START_HAND}枚)のため使用できません。` };
  if (s.minorDeck.length <= 0) return { ok: false, reason: '小アルカナ山札がありません。' };

  p.hand.splice(idx, 1);
  const drawCard = s.minorDeck.pop();
  if (drawCard) p.hand.push(drawCard);
  if (drawCard) onPlayerDrewCard(pi, 1200);
  s.selected.clear();
  log(`${pName(pi)}: 吊るされた男で小アルカナ1枚ドロー`);
  s.message = `${pName(pi)}: 吊るされた男を使用`;
  triggerKingdomActionFx(pi, '吊るされた男', { overlay: 'draw', durationMs: 760, cutin: true });
  render();
  return { ok: true };
}

function humanPlay() {
  if (!s || !s.roundActive) return;
  const me = getLocalPlayerIndex();
  if (me < 0 || !s.players?.[me]) return;
  const myTurn = s.phase === 'turn' && s.turn === me;
  const drawMe = s.phase === 'draw' && s.pendingDraw === me;
  if (!myTurn && !drawMe) return;
  if (drawMe && (!isNetModeActive() || tkNet.isHost)) {
    s.pendingDraw = null;
    s.pendingDrawReason = null;
    s.phase = 'turn';
    s.turn = me;
    s.message = 'ドローせずに場へ出します。';
  }
  const sel = sanitizeSelected(me);
  if (!sel.length) { showPlayError('手札を選択してください。'); return; }
  // 吊るされた男の自動発動ロジックを削除し、単体出し（セット）として処理を続行させる
  const canCallContext = !!(s.trick && s.trick.type === 'set' && s.trick.count === 1);
  let mode = 'normal';
  let built = null;

  if (canCallContext && sel.length === 4) {
    const maybeCall = buildCallPlay(me, sel);
    if (!maybeCall.ok) { showPlayError(maybeCall.reason || 'コールできません。'); return; }
    built = maybeCall;
    mode = 'call';
  } else if (sel.length === 5) {
    built = buildRolePlay(me, sel);
  } else if (sel.length >= 1 && sel.length <= 3) {
    built = buildSetPlay(me, sel);
  } else {
    showPlayError(canCallContext
      ? '1〜3枚・5枚、またはコール用に4枚を選択してください。'
      : '1〜3枚または5枚を選択してください。');
    return;
  }

  if (!built.ok) { showPlayError(built.reason || '出せません。'); return; }
  const ok = validatePlay(built.play, mode === 'call' ? 'call' : 'normal');
  if (!ok.ok) { showPlayError(ok.reason || '出せません。'); return; }
  requestHostAction(
    { type: 'play', play: built.play },
    () => applyPlay(me, built.play)
  ).catch((error) => {
    console.warn('[tarotKingdom] play action failed:', error);
  });
}

function bindUi() {
  if (bound) return;
  ui.root = document.getElementById('tarotKingdomRoot');
  ui.round = document.getElementById('tarotKingdomRound');
  ui.turn = document.getElementById('tarotKingdomTurn');
  ui.reverseChip = document.getElementById('tarotKingdomReverse');
  ui.lockChip = document.getElementById('tarotKingdomLock');
  ui.trickOwner = document.getElementById('tarotKingdomTrickOwner');
  ui.score = document.getElementById('tarotKingdomScore');
  ui.oracleCardWrap = document.getElementById('tarotKingdomOracleCardWrap');
  ui.oracleCard = document.getElementById('tarotKingdomOracleCard');
  ui.hiddenOracleCardWrap = document.getElementById('tarotKingdomHiddenOracleCardWrap');
  ui.hiddenOracleCard = document.getElementById('tarotKingdomHiddenOracleCard');
  ui.openOracle = document.getElementById('tarotKingdomOpenOracle');
  ui.hiddenOracle = document.getElementById('tarotKingdomHiddenOracle');
  ui.kingdomOverlay = document.getElementById('tarotKingdomEffectOverlay');
  ui.kingdomCutin = document.getElementById('tarotKingdomCutin');
  ui.stateText = document.getElementById('tarotKingdomStateText');
  ui.openRoomsWrap = document.getElementById('tarotKingdomOpenRooms');
  ui.openRoomsList = document.getElementById('tarotKingdomOpenRoomsList');
  ui.settlement = document.getElementById('tarotKingdomSettlement');
  ui.settlementBody = document.getElementById('tarotKingdomSettlementBody');
  ui.settlementConfirmButton = document.getElementById('tarotKingdomSettlementConfirmButton');
  ui.actionPopup = document.getElementById('tarotKingdomActionPopup');
  ui.startButton = document.getElementById('tarotKingdomStartButton');
  ui.playButton = document.getElementById('tarotKingdomPlayButton');
  ui.clearButton = document.getElementById('tarotKingdomClearButton');
  ui.passButton = document.getElementById('tarotKingdomPassButton');
  ui.drawMinorButton = document.getElementById('tarotKingdomDrawMinorButton');
  ui.drawMajorButton = document.getElementById('tarotKingdomDrawMajorButton');
  ui.graveToggleButton = document.getElementById('tarotKingdomGraveToggleButton');
  ui.selectedEffect = document.getElementById('tarotKingdomSelectedEffect');
  ui.yourTurnBadge = document.getElementById('tarotKingdomYourTurnBadge');
  ui.players = document.getElementById('tarotKingdomPlayers');
  ui.trick = document.getElementById('tarotKingdomTrick');
  ui.hand = document.getElementById('tarotKingdomHand');
  ui.log = document.getElementById('tarotKingdomLog');
  ui.judgmentArea = document.getElementById('tarotKingdomJudgmentArea');
  ui.judgmentTitle = document.getElementById('tarotKingdomJudgmentTitle');
  ui.judgmentOptions = document.getElementById('tarotKingdomJudgmentOptions');
  ui.judgmentSkipButton = document.getElementById('tarotKingdomJudgmentSkipButton');
  ui.startButton?.addEventListener('click', () => {
    requestHostAction({ type: 'startOrNext' }, () => startOrNext()).catch((error) => {
      console.warn('[tarotKingdom] start action failed:', error);
    });
  });
  ui.playButton?.addEventListener('click', () => humanPlay());

  // 生贄ボタンの生成とイベント設定
  if (!ui.hangedManButton) {
    const btn = document.createElement('button');
    btn.id = 'tarotKingdomHangedManButton';
    if (ui.playButton) {
      btn.className = ui.playButton.className;
      // 必要に応じてスタイル調整用のクラスを追加
      // btn.classList.add('is-sub'); 
    }
    btn.textContent = '生贄';
    btn.style.display = 'none';
    // playButtonの隣（次）に挿入
    if (ui.playButton && ui.playButton.parentNode) {
      ui.playButton.parentNode.insertBefore(btn, ui.playButton.nextSibling);
    }
    ui.hangedManButton = btn;

    ui.hangedManButton.addEventListener('click', () => {
      const me = getLocalPlayerIndex();
      const sel = sanitizeSelected(me);
      if (sel.length !== 1) return;
      requestHostAction(
        { type: 'hangedMan', selectedIndexes: sel.slice() },
        () => {
          const used = useHangedManAction(me, sel);
          if (!used.ok) showPlayError(used.reason || '吊るされた男を使用できません。');
        }
      ).catch((error) => {
        console.warn('[tarotKingdom] hangedMan action failed:', error);
      });
    });
  }

  ui.clearButton?.addEventListener('click', () => {
    if (s?.selected && s.selected.size > 0) {
      clearSelectedCards(true);
      return;
    }
    toggleLocalHandSortMode();
  });
  ui.passButton?.addEventListener('click', () => {
    const me = getLocalPlayerIndex();
    if (!(s?.roundActive && s.phase === 'turn' && s.turn === me)) return;
    requestHostAction({ type: 'pass' }, () => passAction(me)).catch((error) => {
      console.warn('[tarotKingdom] pass action failed:', error);
    });
  });
  ui.drawMinorButton?.addEventListener('click', () => {
    const me = getLocalPlayerIndex();
    requestHostAction({ type: 'draw', deckType: 'minor' }, () => {
      if (s?.phase === 'draw' && s.pendingDraw === me) applyDrawChoice('minor');
    }).catch((error) => {
      console.warn('[tarotKingdom] draw minor action failed:', error);
    });
  });
  ui.drawMajorButton?.addEventListener('click', () => {
    const me = getLocalPlayerIndex();
    requestHostAction({ type: 'draw', deckType: 'major' }, () => {
      if (s?.phase === 'draw' && s.pendingDraw === me) applyDrawChoice('major');
    }).catch((error) => {
      console.warn('[tarotKingdom] draw major action failed:', error);
    });
  });
  ui.graveToggleButton?.addEventListener('click', () => toggleGraveyard());
  ui.judgmentSkipButton?.addEventListener('click', () => {
    const me = getLocalPlayerIndex();
    requestHostAction({ type: 'judgmentSkip' }, () => {
      if (s?.phase === 'judgment' && s.pendingJudgment === me) skipJudgmentPick();
    }).catch((error) => {
      console.warn('[tarotKingdom] judgment skip action failed:', error);
    });
  });
  ui.settlementConfirmButton?.addEventListener('click', () => {
    requestHostAction({ type: 'confirmRound' }, () => confirmRoundSettlement()).catch((error) => {
      console.warn('[tarotKingdom] confirm round action failed:', error);
    });
  });
  bound = true;
}

export async function loadTarotKingdomPage() {
  bindUi();
  await ensureTarotKingdomNetwork();
  if (!s) {
    if (!tkNet.enabled || tkNet.isHost) {
      resetMatch();
    } else {
      s = initState();
      s.message = 'ルーム状態を同期中です...';
    }
  }
  applyPresenceToPlayers();
  if (tkNet.enabled && !tkNet.isHost) {
    const bootLike =
      !s.roundActive &&
      !s.trick &&
      Number(s.handNo || 0) === 0 &&
      (!Array.isArray(s.logs) || s.logs.length === 0);
    if (bootLike) s.message = 'ルーム状態を同期中です...';
  }
  render();
  if (tkNet.enabled && tkNet.isHost) {
    queueStatePublish(true);
  }
  refreshOpenRoomsPanel().catch((error) => {
    console.warn('[tarotKingdom] failed to paint open room panel:', error);
  });
}

export function destroyTarotKingdomPage() {
  clearSettlementGainFx();
  clearNpcTimer();
  clearOracleFlipTimers();
  clearCallCinematicTimer();
  clearRoundStartCinematicTimer();
  clearRoundOutCinematicTimer();
  clearOpeningDealTimers();
  clearYourTurnBadge();
  lastHumanTurnActive = false;
  if (trickSwapTimer) {
    clearTimeout(trickSwapTimer);
    trickSwapTimer = null;
  }
  if (stateErrorTimer) {
    clearTimeout(stateErrorTimer);
    stateErrorTimer = null;
  }
  if (kingdomCutinTimer) {
    clearTimeout(kingdomCutinTimer);
    kingdomCutinTimer = null;
  }
  if (kingdomOverlayTimer) {
    clearTimeout(kingdomOverlayTimer);
    kingdomOverlayTimer = null;
  }
  kingdomRowFxTimers.forEach((timerId) => clearTimeout(timerId));
  kingdomRowFxTimers.clear();

  // Remove transient FX nodes created during play.
  if (typeof document !== 'undefined') {
    document.querySelectorAll('.tarot-coin-fx').forEach((el) => el.remove());
  }

  if (ui.kingdomCutin) {
    ui.kingdomCutin.classList.remove(
      'show',
      'is-player',
      'is-cpu',
      'is-showdown-win',
      'is-showdown-lose',
      'is-showdown-draw',
      'is-kingdom-skip',
      'is-kingdom-cut',
      'is-kingdom-reverse',
      'is-kingdom-lock',
      'is-kingdom-call',
      'is-kingdom-role',
      'is-kingdom-round-end',
      'is-kingdom-round-out',
      'is-kingdom-grand-win',
      'is-kingdom-your-turn'
    );
    ui.kingdomCutin.textContent = '';
  }
  ui.kingdomOverlay?.classList.remove('show', 'is-kingdom-clear', 'is-kingdom-draw', 'is-kingdom-roundend', 'is-kingdom-call', 'is-kingdom-call-freeze');
  ui.oracleCardWrap?.classList.remove('is-flipping');
  ui.hiddenOracleCardWrap?.classList.remove('is-flipping');

  if (ui.trick) ui.trick.innerHTML = '';
  if (ui.hand) ui.hand.innerHTML = '';
  if (ui.selectedEffect) {
    ui.selectedEffect.textContent = '';
    ui.selectedEffect.hidden = true;
  }
  if (ui.yourTurnBadge) {
    ui.yourTurnBadge.classList.remove('show');
    ui.yourTurnBadge.hidden = true;
  }
  if (ui.players) ui.players.innerHTML = '';
  if (ui.log) ui.log.innerHTML = '';
  if (ui.judgmentOptions) ui.judgmentOptions.innerHTML = '';
  if (ui.judgmentArea) ui.judgmentArea.style.display = 'none';
  ui.actionPopup?.classList.remove('is-call-locked');
  if (ui.settlementBody) ui.settlementBody.innerHTML = '';
  if (ui.settlement) ui.settlement.hidden = true;

  trickRenderKey = '';
  trickRenderToken += 1;
  npcActInFlight = false;
  teardownTarotKingdomNetwork();
  s = null;
}
