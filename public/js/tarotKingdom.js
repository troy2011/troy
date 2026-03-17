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
const SPECIAL_SUIT = {
  2: 'Cup',
  3: 'Pentacle',
  4: 'Wand',
  5: 'Sword',
  6: 'Cup',
  7: 'Sword',
  8: 'Wand',
  9: 'Pentacle',
  11: 'Sword',
  12: 'Pentacle',
  13: 'Cup',
  14: 'Wand',
  16: 'Sword',
  17: 'Cup',
  18: 'Pentacle',
  19: 'Wand'
};
const ARCANA_NAME = {
  0: '愚者', 1: '魔術師', 2: '女教皇', 3: '女帝', 4: '皇帝', 5: '法王', 6: '恋人', 7: '戦車', 8: '力', 9: '隠者',
  10: '運命の輪', 11: '正義', 12: '吊るされた男', 13: '死神', 14: '節制', 15: '悪魔', 16: '塔', 17: '星', 18: '月', 19: '太陽', 20: '審判', 21: '世界'
};

const PLAYERS = [
  { id: 'you', name: 'あなた', isNpc: false },
  { id: 'npc1', name: 'NPC1', isNpc: true, aiStyle: 'cautious' },
  { id: 'npc2', name: 'NPC2', isNpc: true, aiStyle: 'balanced' },
  { id: 'npc3', name: 'NPC3', isNpc: true, aiStyle: 'aggressive' }
];

const NPC_AI_STYLE = {
  CAUTIOUS: 'cautious',
  BALANCED: 'balanced',
  AGGRESSIVE: 'aggressive'
};

const START_HAND = 10;
const TOTAL_HANDS = 4;
const START_CHIPS = 100;
const GAMEOVER_CHIPS_THRESHOLD = 0;
const A_PENALTY = 1;
const ROUND_START_CINEMATIC_MS = 980;
const ROUND_OUT_CINEMATIC_MS = 1080;
const GAME_FINAL_CINEMATIC_MS = 2800;
const ORACLE_FLIP_TOTAL_MS = 620;
const PRESENCE_AWAY_GRACE_MS = 30000;
const OPENING_HAND_FLIP_START_DELAY_MS = 90;
const OPENING_HAND_FLIP_MS = 170;
const OPENING_HAND_FLIP_GAP_MS = 45;
const DRAW_HAND_FLIP_REVEAL_DELAY_MS = 90;
const DRAW_HAND_FLIP_MS = 220;
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
const TK_OPEN_ROOM_HEARTBEAT_MS = 10000;
const TK_OPEN_ROOM_STALE_MS = 45000;
const KINGDOM_MOBILE_BREAKPOINT = 640;
const KINGDOM_MOBILE_MIN_HEIGHT = 420;
const KINGDOM_MOBILE_BOTTOM_GAP = 8;

const ui = {};
let s = null;
let bound = false;
let npcTimer = null;
let trickRenderKey = '';
let trickRenderIdentityKey = '';
let trickRenderToken = 0;
let trickSwapTimer = null;
let stateErrorTimer = null;
let kingdomCutinTimer = null;
let kingdomOverlayTimer = null;
let kingdomTrickSceneFlashKind = '';
let kingdomTrickSceneFlashTimer = null;
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
let drawHandFlipRevealTimer = null;
let drawHandFlipEndTimer = null;
let humanTurnBadgeTimer = null;
let pendingTurnAdvanceAfterTrick = null;
let lastHumanTurnActive = false;
let npcScheduleToken = 0;
let npcActInFlight = false;
let settlementGainEventTimers = [];
let settlementGainAnimTimer = null;
let settlementGainQueue = [];
let settlementGainAnimating = false;
let settlementCoinEventTimers = [];
let settlementChipAnimTimers = new Map();
const HAND_SORT_MODE = { SUIT: 'suit', VALUE: 'value' };
let localHandSortMode = HAND_SORT_MODE.VALUE;
let kingdomLocalInfoMessage = '';
let kingdomLocalInfoTimer = null;
let kingdomLocalPriorityMessage = '';
let kingdomLocalPriorityTimer = null;
let kingdomLocalGraveOpen = false;
let localHandSortDrawLock = false;
let kingdomLocalAutoFold = false;
let kingdomLocalAutoFoldPending = false;
let kingdomLocalAutoFoldPrevReverse = false;
let kingdomLocalAutoFoldPrevCallToken = '';
const KINGDOM_TRACE_ENABLED = true;
let kingdomTraceFlowSeed = 0;
const kingdomRowFxTimers = new Map();
let netActionHostUnsub = null;
let netStateUnsub = null;
let netPresenceUnsub = null;
let netHostUidUnsub = null;
let netOpenRoomsUnsub = null;
let netActionWriteTimer = null;
let netOpenRoomHeartbeatTimer = null;
let netLastStateHash = '';
let netBootPromise = null;
const netHandledActionKeys = new Set();
let netPresenceByUid = {};
let netOpenRoomsCache = {};
let netOpenRoomIndexEnabled = true;
let netManualOfflineMode = false;
let kingdomStartMode = '';
let kingdomViewportSyncQueued = false;
let kingdomViewportWatchBound = false;
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
const KINGDOM_TRICK_SCENE_CLASSES = [
  'is-scene-lock',
  'is-scene-lock-wand',
  'is-scene-lock-cup',
  'is-scene-lock-sword',
  'is-scene-lock-pentacle',
  'is-scene-back',
  'is-scene-cut',
  'is-scene-skip'
];
const KINGDOM_RANK_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

function clearKingdomTrickSceneFlash(shouldRender = false) {
  if (kingdomTrickSceneFlashTimer) {
    clearTimeout(kingdomTrickSceneFlashTimer);
    kingdomTrickSceneFlashTimer = null;
  }
  kingdomTrickSceneFlashKind = '';
  if (shouldRender) render();
}

function triggerKingdomTrickSceneFlash(kind, durationMs = 780) {
  if (!kind) return;
  if (!['cut', 'skip'].includes(String(kind))) return;
  kingdomTrickSceneFlashKind = String(kind);
  if (kingdomTrickSceneFlashTimer) {
    clearTimeout(kingdomTrickSceneFlashTimer);
    kingdomTrickSceneFlashTimer = null;
  }
  const holdMs = Math.max(220, Number(durationMs) || 0);
  kingdomTrickSceneFlashTimer = setTimeout(() => {
    kingdomTrickSceneFlashTimer = null;
    kingdomTrickSceneFlashKind = '';
    render();
  }, holdMs);
  render();
}

function syncKingdomTrickSceneClass() {
  if (!ui.trick) return;
  ui.trick.classList.remove(...KINGDOM_TRICK_SCENE_CLASSES);
  const lockSuit = s?.lock?.suit || null;
  const hasLock = !!lockSuit;
  const hasReverse = !!s?.reverse;
  const flashKind = String(kingdomTrickSceneFlashKind || '');
  let scene = '';
  if (flashKind === 'cut') scene = 'cut';
  else if (flashKind === 'skip') scene = 'skip';
  else if (hasLock) scene = 'lock';
  else if (hasReverse) scene = 'back';
  if (scene === 'cut') {
    ui.trick.classList.add('is-scene-cut');
    return;
  }
  if (scene === 'skip') {
    ui.trick.classList.add('is-scene-skip');
    return;
  }
  if (scene === 'lock') {
    ui.trick.classList.add('is-scene-lock');
    const key = String(lockSuit || '').toLowerCase();
    if (['wand', 'cup', 'sword', 'pentacle'].includes(key)) {
      ui.trick.classList.add(`is-scene-lock-${key}`);
    }
    return;
  }
  if (scene === 'back') {
    ui.trick.classList.add('is-scene-back');
  }
}

function getKingdomChipRanking() {
  if (!s?.players || !Array.isArray(s.players)) return [];
  const rows = s.players.map((player, index) => ({
    index,
    name: String(player?.name || `P${index + 1}`),
    chips: Math.max(0, Number(player?.chips) || 0)
  }));
  rows.sort((a, b) => {
    if (b.chips !== a.chips) return b.chips - a.chips;
    return a.index - b.index;
  });
  return rows.map((row, i) => ({
    ...row,
    rank: i + 1,
    medal: KINGDOM_RANK_MEDAL[i + 1] || ''
  }));
}

function isMobileKingdomViewport() {
  if (typeof window === 'undefined') return false;
  if (!window.matchMedia) return window.innerWidth <= KINGDOM_MOBILE_BREAKPOINT;
  return window.matchMedia(`(max-width: ${KINGDOM_MOBILE_BREAKPOINT}px)`).matches;
}

function getVisibleBottomNavHeight() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  const nav = document.getElementById('bottomNav');
  if (!nav) return 0;
  const style = window.getComputedStyle(nav);
  if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return 0;
  const rect = nav.getBoundingClientRect();
  return Math.max(0, Math.round(rect.height || 0));
}

function syncKingdomViewportHeight() {
  if (typeof window === 'undefined' || !ui.root) return;
  const root = ui.root;
  const rootStyle = window.getComputedStyle(root);
  if (rootStyle.display === 'none') return;
  if (!isMobileKingdomViewport()) {
    root.style.removeProperty('--tarot-kingdom-mobile-height');
    return;
  }
  const viewportHeight = Math.max(
    0,
    Number(window.visualViewport?.height) || 0,
    Number(window.innerHeight) || 0
  );
  if (!viewportHeight) return;
  const rootTop = Number(root.getBoundingClientRect().top) || 0;
  const navHeight = getVisibleBottomNavHeight();
  const available = Math.floor(viewportHeight - rootTop - navHeight - KINGDOM_MOBILE_BOTTOM_GAP);
  if (available <= 0) return;
  root.style.setProperty(
    '--tarot-kingdom-mobile-height',
    `${Math.max(KINGDOM_MOBILE_MIN_HEIGHT, available)}px`
  );
}

function queueSyncKingdomViewportHeight() {
  if (kingdomViewportSyncQueued) return;
  kingdomViewportSyncQueued = true;
  requestAnimationFrame(() => {
    kingdomViewportSyncQueued = false;
    syncKingdomViewportHeight();
  });
}

function bindKingdomViewportWatch() {
  if (kingdomViewportWatchBound || typeof window === 'undefined') return;
  const onViewportChange = () => {
    queueSyncKingdomViewportHeight();
  };
  window.addEventListener('resize', onViewportChange, { passive: true });
  window.addEventListener('orientationchange', onViewportChange, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportChange, { passive: true });
    window.visualViewport.addEventListener('scroll', onViewportChange, { passive: true });
  }
  kingdomViewportWatchBound = true;
}

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

const getNpcActionDelayMs = (phase = 'turn') => {
  // NPCの思考待機。展開が速すぎるため、フェーズごとに最低待機を持たせる。
  const phaseKey = String(phase || 'turn');
  const baseDelayMs = (
    phaseKey === 'draw' || phaseKey === 'judgment'
      ? 520
      : 640
  );
  const hasActiveCinematic = !!(
    callCinematicTimer ||
    roundStartCinematicTimer ||
    roundOutCinematicTimer ||
    openingDealStartTimer ||
    openingDealFlipTimer ||
    openingDealNextTimer ||
    trickSwapTimer
  );
  return hasActiveCinematic ? (baseDelayMs + 220) : baseDelayMs;
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
const clearPendingTurnAdvanceAfterTrick = () => {
  pendingTurnAdvanceAfterTrick = null;
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
const clearDrawHandFlipTimers = () => {
  if (drawHandFlipRevealTimer) {
    clearTimeout(drawHandFlipRevealTimer);
    drawHandFlipRevealTimer = null;
  }
  if (drawHandFlipEndTimer) {
    clearTimeout(drawHandFlipEndTimer);
    drawHandFlipEndTimer = null;
  }
  if (s) {
    s.drawFlipPlayer = -1;
    s.drawFlipCardId = '';
    s.drawFlipRevealAt = 0;
    s.drawFlipEndAt = 0;
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
  settlementCoinEventTimers.forEach((timerId) => clearTimeout(timerId));
  settlementCoinEventTimers = [];
  if (settlementChipAnimTimers instanceof Map) {
    settlementChipAnimTimers.forEach((timerId) => clearTimeout(timerId));
    settlementChipAnimTimers.clear();
  }
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
      renderPlayers();
      if (t < 1) {
        settlementGainAnimTimer = setTimeout(tick, 16);
        return;
      }
      s.roundSettlement.displayTotalGain = to;
      renderPlayers();
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
function scheduleSettlementCoinFx(run, delayMs = 0) {
  const timerId = setTimeout(() => {
    settlementCoinEventTimers = settlementCoinEventTimers.filter((id) => id !== timerId);
    try {
      run?.();
    } catch (_) {
      // no-op
    }
  }, Math.max(0, Number(delayMs) || 0));
  settlementCoinEventTimers.push(timerId);
}

function animateSettlementChipField(key, readValue, writeValue, toValue, durationMs = 260) {
  if (!s?.roundSettlement) return;
  const from = Math.max(0, Number(readValue()) || 0);
  const to = Math.max(0, Math.round(Number(toValue) || 0));
  if (from === to) {
    writeValue(to);
    renderPlayers();
    return;
  }
  const prevTimerId = settlementChipAnimTimers.get(key);
  if (prevTimerId) clearTimeout(prevTimerId);
  const startAt = Date.now();
  const duration = Math.max(120, Number(durationMs) || 260);

  const tick = () => {
    if (!s?.roundSettlement) {
      const currentTimerId = settlementChipAnimTimers.get(key);
      if (currentTimerId) clearTimeout(currentTimerId);
      settlementChipAnimTimers.delete(key);
      return;
    }
    const t = Math.min(1, (Date.now() - startAt) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const v = Math.round(from + ((to - from) * eased));
    writeValue(v);
    renderPlayers();
    if (t >= 1) {
      settlementChipAnimTimers.delete(key);
      return;
    }
    const nextTimerId = setTimeout(tick, 16);
    settlementChipAnimTimers.set(key, nextTimerId);
  };

  tick();
}

function animateSettlementPayerChipTo(payerIndex, targetValue, durationMs = 240) {
  const data = s?.roundSettlement;
  if (!data) return;
  const row = (data.rows || []).find((r) => Number(r?.payerIndex) === Number(payerIndex));
  if (!row) return;
  animateSettlementChipField(
    `payer:${Number(payerIndex)}`,
    () => Number(row.displayPayerChips ?? row.payerStartChips ?? row.payerFinalChips ?? 0),
    (next) => { row.displayPayerChips = Math.max(0, Number(next) || 0); },
    targetValue,
    durationMs
  );
}

function animateSettlementWinnerChipTo(targetValue, durationMs = 300) {
  const data = s?.roundSettlement;
  if (!data) return;
  animateSettlementChipField(
    'winner',
    () => Number(data.displayWinnerChips ?? data.winnerStartChips ?? data.winnerFinalChips ?? 0),
    (next) => { data.displayWinnerChips = Math.max(0, Number(next) || 0); },
    targetValue,
    durationMs
  );
}

function applySettlementPayerChipDelta(payerIndex, delta, durationMs = 240) {
  const data = s?.roundSettlement;
  if (!data) return;
  const row = (data.rows || []).find((r) => Number(r?.payerIndex) === Number(payerIndex));
  if (!row) return;
  const current = Math.max(0, Number(row.displayPayerChips ?? row.payerStartChips ?? row.payerFinalChips ?? 0));
  const target = Math.max(0, current + (Number(delta) || 0));
  animateSettlementPayerChipTo(payerIndex, target, durationMs);
}

function applySettlementWinnerChipDelta(delta, durationMs = 300) {
  const data = s?.roundSettlement;
  if (!data) return;
  const current = Math.max(0, Number(data.displayWinnerChips ?? data.winnerStartChips ?? data.winnerFinalChips ?? 0));
  const target = Math.max(0, current + (Number(delta) || 0));
  animateSettlementWinnerChipTo(target, durationMs);
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
  if (cards.length === 2) {
    const lovers = cards.filter((card) => card?.kind === 'major' && Number(card?.number) === 6);
    if (lovers.length >= 1) {
      const partner = cards.find((card) => !(card?.kind === 'major' && Number(card?.number) === 6));
      if (!partner) return 6;
      const partnerOptions = setNumberOptions(partner).slice().sort((a, b) => {
        const av = setRankFromNumber(a);
        const bv = setRankFromNumber(b);
        return reverse ? (av - bv) : (bv - av);
      });
      return Number(partnerOptions[0]);
    }
  }
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
const HAND_SORT_SUIT_ORDER = { Sword: 0, Cup: 1, Pentacle: 2, Wand: 3, None: 4 };
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
  if (!isNpcPlayer(playerIndex)) {
    // Human-controlled seats keep draw order so the hand can stay unsorted during
    // the flip/freeze window and only the local client re-sorts after the freeze.
    if (!isLocalPlayer(playerIndex)) return;
    localHandSortDrawLock = true;
    freezeLocalHandAutoSort(freezeMs);
    return;
  }
  s.players[playerIndex].hand.sort((a, b) => cStrength(a) - cStrength(b));
}

function startDrawHandFlip(playerIndex, card) {
  if (!s) return;
  if (!isLocalPlayer(playerIndex) || !card?.id) return;
  clearDrawHandFlipTimers();
  const now = Date.now();
  const revealAt = now + DRAW_HAND_FLIP_REVEAL_DELAY_MS;
  const endAt = revealAt + DRAW_HAND_FLIP_MS;
  const cardId = String(card.id);
  s.drawFlipPlayer = Number(playerIndex);
  s.drawFlipCardId = cardId;
  s.drawFlipRevealAt = revealAt;
  s.drawFlipEndAt = endAt;
  drawHandFlipRevealTimer = setTimeout(() => {
    drawHandFlipRevealTimer = null;
    if (!s) return;
    if (String(s.drawFlipCardId || '') !== cardId) return;
    render();
  }, Math.max(0, revealAt - now));
  drawHandFlipEndTimer = setTimeout(() => {
    drawHandFlipEndTimer = null;
    if (!s) return;
    if (String(s.drawFlipCardId || '') !== cardId) return;
    s.drawFlipPlayer = -1;
    s.drawFlipCardId = '';
    s.drawFlipRevealAt = 0;
    s.drawFlipEndAt = 0;
    render();
  }, Math.max(0, endAt - now) + 20);
}
function toggleLocalHandSortMode() {
  if (!s) return;
  localHandSortMode = localHandSortMode === HAND_SORT_MODE.SUIT
    ? HAND_SORT_MODE.VALUE
    : HAND_SORT_MODE.SUIT;
  localHandSortDrawLock = false;
  applyLocalHandSortMode(true);
  setLocalInfoMessage(localHandSortMode === HAND_SORT_MODE.SUIT
    ? '手札をスート順に並び替えました。'
    : '手札を数値順に並び替えました。', 1400);
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
  if (String(play?.type || '') === 'role') {
    const keyCard = getRoleKeyCard(play?.role, cards);
    if (keyCard) {
      const suits = suitsForCard(keyCard, false).filter((suit) => suit && suit !== 'None');
      if (suits.includes('Sword')) return 'Sword';
      if (suits.includes('Pentacle')) return 'Pentacle';
      if (suits.includes('Cup')) return 'Cup';
      if (suits.includes('Wand')) return 'Wand';
    }
  }
  for (const card of cards) {
    const suits = suitsForCard(card, false).filter((suit) => suit && suit !== 'None');
    if (suits.includes('Sword')) return 'Sword';
    if (suits.includes('Pentacle')) return 'Pentacle';
    if (suits.includes('Cup')) return 'Cup';
    if (suits.includes('Wand')) return 'Wand';
  }
  return null;
};
const MAJOR_ATTACK_FX = {
  0: { leadEmoji: '🃏', markerEmoji: '🐕', pattern: 'trickster', kind: 'normal', heroDurationMs: 900 },
  1: { leadEmoji: '🪄', markerEmoji: '♾️', pattern: 'orbit', kind: 'normal', heroDurationMs: 940 },
  2: { leadEmoji: '📜', markerEmoji: '🌙', pattern: 'float', kind: 'water', heroDurationMs: 940 },
  3: { leadEmoji: '👸', markerEmoji: '🌾', pattern: 'throne', kind: 'slash', heroDurationMs: 930 },
  4: { leadEmoji: '🤴', markerEmoji: '🏰', pattern: 'edict', kind: 'fire', heroDurationMs: 930 },
  5: { leadEmoji: '🗝️', markerEmoji: '⛪', pattern: 'sanctum', kind: 'rock', heroDurationMs: 940 },
  6: { leadEmoji: '👼', markerEmoji: '💞', pattern: 'halo', kind: 'water', heroDurationMs: 930 },
  7: { leadEmoji: '🐎', markerEmoji: '🛡️', pattern: 'rush', kind: 'slash', heroDurationMs: 900 },
  8: { leadEmoji: '🦁', markerEmoji: '💥', pattern: 'burst', kind: 'fire', heroDurationMs: 890 },
  9: { leadEmoji: '🧙🏾‍♂️', markerEmoji: '💨', pattern: 'trickster', kind: 'rock', heroDurationMs: 940 },
  10: { leadEmoji: '🎡', markerEmoji: '🌀', pattern: 'orbit', kind: 'normal', heroDurationMs: 940 },
  11: { leadEmoji: '⚖️', markerEmoji: '💫', pattern: 'verdict', kind: 'slash', heroDurationMs: 930 },
  12: { leadEmoji: '🌳', markerEmoji: '🪢', pattern: 'sanctum', kind: 'rock', heroDurationMs: 930 },
  13: { leadEmoji: '💀', markerEmoji: '🦋', pattern: 'rift', kind: 'fire', heroDurationMs: 940 },
  14: { leadEmoji: '🏺', markerEmoji: '🕊️', pattern: 'float', kind: 'water', heroDurationMs: 930 },
  15: { leadEmoji: '👿', markerEmoji: '⛓️', pattern: 'rift', kind: 'normal', heroDurationMs: 940 },
  16: { leadEmoji: '🌩️', markerEmoji: '⚡', pattern: 'slam', kind: 'slash', heroDurationMs: 900 },
  17: { leadEmoji: '✨', markerEmoji: '⭐', pattern: 'halo', kind: 'water', heroDurationMs: 900 },
  18: { leadEmoji: '🌕', markerEmoji: '🦞', pattern: 'float', kind: 'rock', heroDurationMs: 940 },
  19: { leadEmoji: '☀️', markerEmoji: '🌻', pattern: 'burst', kind: 'fire', heroDurationMs: 900 },
  20: { leadEmoji: '🎺', markerEmoji: '🎵', pattern: 'verdict', kind: 'normal', heroDurationMs: 930 },
  21: { leadEmoji: '🌍', markerEmoji: '♾️', pattern: 'world', kind: 'normal', heroDurationMs: 1020 }
};

const getMajorAttackFxFromCards = (cards) => {
  if (!Array.isArray(cards)) return null;
  const major = cards.find((card) => card?.kind === 'major');
  if (!major) return null;
  const n = Number(major.number);
  if (!Number.isFinite(n)) return null;
  const cfg = MAJOR_ATTACK_FX[n];
  if (!cfg) return null;
  return {
    number: n,
    leadEmoji: String(cfg.leadEmoji || ''),
    markerEmoji: String(cfg.markerEmoji || ''),
    pattern: String(cfg.pattern || 'burst'),
    kind: String(cfg.kind || 'normal'),
    heroDurationMs: Math.max(420, Number(cfg.heroDurationMs) || 760)
  };
};
const isMajorAttackFx = (arcanaFx) => !!(arcanaFx && Number.isFinite(Number(arcanaFx.number)));
const ARCANA_DEFEAT_PATTERNS = ['orbit', 'float', 'slam', 'burst', 'rush', 'trickster', 'throne', 'edict', 'sanctum', 'halo', 'verdict', 'rift', 'world'];
const DEFEAT_MARKER_BY_KIND = {
  slash: '🗡️',
  rock: '🏅',
  water: '💦',
  fire: '🔥'
};
const getArcanaDefeatPatternClass = (arcanaFx) => {
  const pattern = String(arcanaFx?.pattern || '').trim();
  if (!pattern || !ARCANA_DEFEAT_PATTERNS.includes(pattern)) return '';
  return `is-defeat-arcana-${pattern}`;
};
const clearArcanaDefeatPatternClasses = (node) => {
  if (!node?.classList) return;
  ARCANA_DEFEAT_PATTERNS.forEach((pattern) => node.classList.remove(`is-defeat-arcana-${pattern}`));
};
const getDefeatMarkerEmoji = (defeatKind, arcanaFx) => {
  if (String(defeatKind || '') === 'arcana') {
    return String(arcanaFx?.markerEmoji || '').trim();
  }
  return String(DEFEAT_MARKER_BY_KIND[String(defeatKind || '')] || '').trim();
};
const isMinorCourtOrAceCard = (card) => {
  if (!card || card.kind !== 'minor') return false;
  const n = Number(card.number) || 0;
  return n === 1 || (n >= 11 && n <= 14);
};
const hasMinorCourtOrAce = (cards) => Array.isArray(cards) && cards.some(isMinorCourtOrAceCard);
const hasNamedRoleDisplay = (play) => {
  if (String(play?.type || '') !== 'role') return false;
  const keyName = getRoleKeyCardName(play?.role, play?.cardsHand || []);
  return !!String(keyName || '').trim();
};
const getAttackKeyCardFromPlay = (play) => {
  if (!play) return null;
  const cards = (Array.isArray(play?.cardsTable) && play.cardsTable.length > 0)
    ? play.cardsTable
    : (Array.isArray(play?.cardsHand) ? play.cardsHand : []);
  if (!cards.length) return null;
  if (String(play?.type || '') === 'role') {
    return getRoleKeyCard(play?.role, cards) || cards[0] || null;
  }
  return cards[0] || null;
};
const pickTrickDefeatFx = (play, prevTrick) => {
  const prevCards = Array.isArray(prevTrick?.cardsTable) ? prevTrick.cardsTable : [];
  if (!play || !prevCards.length) return null;
  const info = { kind: 'normal', special: false };
  const playType = String(play?.type || '');
  const prevType = String(prevTrick?.type || '');
  const playCards = Array.isArray(play?.cardsTable) ? play.cardsTable : [];
  const attackCard = getAttackKeyCardFromPlay(play);
  const majorFx = getMajorAttackFxFromCards(attackCard ? [attackCard] : playCards);
  if (playType === 'set' && prevType === 'set') {
    if (!hasMinorCourtOrAce(playCards) && !majorFx) return info;
  } else if (playType === 'role' && prevType === 'role') {
    if (!hasNamedRoleDisplay(play) && !majorFx) return info;
  } else {
    return info;
  }
  info.special = true;
  if (majorFx) {
    info.kind = 'arcana';
    info.arcana = majorFx;
  } else {
    // Court/A based special attacks are suit-only; do not emit arcana lead emoji.
    info.arcana = null;
    const suit = getPrimarySuitFromPlay(play);
    if (suit === 'Sword') info.kind = 'slash';
    else if (suit === 'Pentacle') info.kind = 'rock';
    else if (suit === 'Cup') info.kind = 'water';
    else if (suit === 'Wand') info.kind = 'fire';
  }
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
  if (card.displayNumberLabelOverride != null) {
    const overrideLabel = String(card.displayNumberLabelOverride || '').trim();
    if (overrideLabel) return overrideLabel;
  }
  const options = getCardDisplayNumberOptions(card);
  if (!Array.isArray(options) || options.length <= 0) return '';
  if (options.length === 1) {
    const n = Number(options[0]) || 0;
    if (card.kind !== 'major' && n === 1) return 'A';
    return String(n);
  }
  const lo = Number(options[0]) || 0;
  const hi = Number(options[options.length - 1]) || 0;
  return `${lo}/${hi}`;
}

function getCardDisplayNumberOptions(card) {
  if (!card) return [];
  if (card.displayNumberOverride != null) {
    const overrideValue = Number(card.displayNumberOverride) || 0;
    return overrideValue > 0 ? [overrideValue] : [];
  }
  const n = Number(card.number) || 0;
  if (card.kind !== 'major') return [n];
  // 大アルカナ本体の通常表示は素の番号を使う。
  if (n === 3) return [3];
  if (n === 4) return [4];
  return [n];
}

function shouldRollCardNumber(card) {
  if (!card || card.kind !== 'major') return false;
  if (card.displayNumberLabelOverride != null) {
    const label = String(card.displayNumberLabelOverride || '').trim();
    if (label) return true;
  }
  if (card.displayNumberOverride != null) {
    const shown = Number(card.displayNumberOverride) || 0;
    const base = Number(card.number) || 0;
    return shown > 0 && shown !== base;
  }
  return false;
}

function isRomanOnlyLabel(text) {
  const s = String(text || '').trim();
  return !!s && /^[IVXLCDM]+$/i.test(s);
}

function getRoleBaseLabel(role) {
  if (!role) return '役出し';
  return ROLE_LABEL[role.key] || role.label || '役出し';
}

function getRoleKeyCard(role, cards) {
  if (!role || !Array.isArray(cards) || !cards.length) return null;
  const baseCards = cards.filter(Boolean);
  if (!baseCards.length) return null;
  const bestSuitTier = (card) => {
    const suits = suitsForCard(card, false).filter((suit) => suit && suit !== 'None');
    if (!suits.length) return 0;
    const tier = suits.reduce((max, suit) => Math.max(max, SUIT_TIER[suit] || 0), 0);
    return card?.kind === 'major' ? 10 + tier : tier;
  };
  const majorCards = baseCards.filter((card) => card?.kind === 'major');
  let candidates = majorCards.length
    ? majorCards.slice()
    : [];
  if (!candidates.length) {
    const target = Number(role?.primary?.[0] || 0);
    candidates = target > 0
      ? baseCards.filter((card) => cStrength(card) === target)
      : [];
  }
  if (!candidates.length) candidates = baseCards.slice();
  candidates.sort((a, b) => {
    const strengthDiff = cStrength(b) - cStrength(a);
    if (strengthDiff !== 0) return strengthDiff;
    return bestSuitTier(b) - bestSuitTier(a);
  });
  return candidates[0] || null;
}

function getRoleKeyCardName(role, cards) {
  const keyCard = getRoleKeyCard(role, cards);
  if (!keyCard) return '';
  const name = getCardNameLabel(keyCard);
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
      1: 'オールスート / 数値1固定',
      2: '出した時に小アルカナ2枚ドロー（上限10）',
      3: '数値3/13の有利側（表示は3/13）',
      4: '数値4/14の有利側（表示は4/14）',
      5: '場を維持してもう一度ターン',
      6: 'どのカードでもペア出し可能',
      7: '通常ドローで引くと2枚に増殖',
      8: '大アルカナ8は強制クリア',
      9: 'セットで次の小アルカナを予見（この局）',
      10: '単騎で数値+1〜6',
      11: '11バック（局内永続）',
      12: '生贄で星+2（このカードは消える）',
      13: '次のクリアまで、他者が出すたび星-1',
      14: '節制ロック（直前スート縛り）',
      15: '次のクリアまで、他者がパスで星-1',
      16: '単騎時はソード14扱い',
      17: '単騎時はカップ14扱い',
      18: '単騎時はペンタクル14扱い',
      19: '単騎時はワンド14扱い',
      20: 'クリアで墓地から1枚回収',
      21: '単騎でどんな場札にも返せる'
    };
    return majorEffectMap[n] || '';
  }
  if (n === 5) return '5スキップ';
  if (n === 8) return '8カット';
  if (n === 11) return '11バック';
  if (n === 14) return '場と同スートで14ロック';
  return '';
}

function clearLocalInfoMessage(renderNow = false) {
  if (kingdomLocalInfoTimer) {
    clearTimeout(kingdomLocalInfoTimer);
    kingdomLocalInfoTimer = null;
  }
  if (!kingdomLocalInfoMessage) return;
  kingdomLocalInfoMessage = '';
  if (renderNow && s) renderSummary();
}

function setLocalInfoMessage(text, holdMs = 1800) {
  if (kingdomLocalInfoTimer) {
    clearTimeout(kingdomLocalInfoTimer);
    kingdomLocalInfoTimer = null;
  }
  kingdomLocalInfoMessage = String(text || '').trim();
  if (s) renderSummary();
  if (!kingdomLocalInfoMessage || holdMs <= 0) return;
  const current = kingdomLocalInfoMessage;
  kingdomLocalInfoTimer = setTimeout(() => {
    kingdomLocalInfoTimer = null;
    if (kingdomLocalInfoMessage !== current) return;
    kingdomLocalInfoMessage = '';
    if (s) renderSummary();
  }, holdMs);
}

function setLocalPriorityMessage(text, holdMs = 1800) {
  if (kingdomLocalPriorityTimer) {
    clearTimeout(kingdomLocalPriorityTimer);
    kingdomLocalPriorityTimer = null;
  }
  kingdomLocalPriorityMessage = String(text || '').trim();
  if (s) renderSummary();
  if (!kingdomLocalPriorityMessage || holdMs <= 0) return;
  const current = kingdomLocalPriorityMessage;
  kingdomLocalPriorityTimer = setTimeout(() => {
    kingdomLocalPriorityTimer = null;
    if (kingdomLocalPriorityMessage !== current) return;
    kingdomLocalPriorityMessage = '';
    if (s) renderSummary();
  }, holdMs);
}

function clearLocalAutoFold() {
  kingdomLocalAutoFold = false;
  kingdomLocalAutoFoldPending = false;
  kingdomLocalAutoFoldPrevCallToken = '';
}

function getAutoFoldCallToken(play) {
  if (!(play && play.type === 'role' && play.call)) return '';
  const owner = Number.isFinite(Number(play.owner)) ? Number(play.owner) : -1;
  const count = Number.isFinite(Number(play.count)) ? Number(play.count) : 0;
  const cards = Array.isArray(play.cardsTable)
    ? play.cardsTable.map((card) => [
        String(card?.kind || ''),
        String(card?.suit || ''),
        String(card?.number ?? ''),
        String(card?.displayNumberOverride ?? ''),
        String(card?.displayNumberLabelOverride ?? '')
      ].join(':')).join('|')
    : '';
  return [owner, String(play.role || ''), count, cards].join('#');
}

function syncLocalAutoFoldState() {
  if (!s) {
    clearLocalAutoFold();
    kingdomLocalAutoFoldPrevReverse = false;
    return;
  }
  const me = getLocalPlayerIndex();
  const myTurn = me >= 0 && s.phase === 'turn' && s.turn === me;
  const currentReverse = !!s.reverse;
  const currentCallToken = getAutoFoldCallToken(s.lastPlay);
  const hasNewCall = !!(currentCallToken && currentCallToken !== kingdomLocalAutoFoldPrevCallToken);
  if (kingdomLocalAutoFold) {
    if (!s.roundActive || !s.trick || hasNewCall || currentReverse !== kingdomLocalAutoFoldPrevReverse) {
      clearLocalAutoFold();
    }
  }
  if (kingdomLocalAutoFoldPending && (!kingdomLocalAutoFold || !myTurn || !s.trick || s.phase !== 'turn')) {
    kingdomLocalAutoFoldPending = false;
  }
  kingdomLocalAutoFoldPrevReverse = currentReverse;
}

function processLocalAutoFold() {
  if (!s || !kingdomLocalAutoFold || kingdomLocalAutoFoldPending) return;
  const me = getLocalPlayerIndex();
  if (me < 0) return;
  if (!(s.roundActive && s.phase === 'turn' && s.turn === me && s.trick)) return;
  kingdomLocalAutoFoldPending = true;
  setTimeout(() => {
    if (!s || !kingdomLocalAutoFold) {
      kingdomLocalAutoFoldPending = false;
      return;
    }
    requestHostAction({ type: 'pass' }, () => passAction(me)).then((ok) => {
      if (!ok) kingdomLocalAutoFoldPending = false;
    }).catch((error) => {
      kingdomLocalAutoFoldPending = false;
      console.warn('[tarotKingdom] auto fold failed:', error);
    });
  }, 0);
}

function buildLocalStateTextOverride(playerIndex, selectedIndexes) {
  const selectedText = buildSelectedCardInfoMessage(playerIndex, selectedIndexes);
  if (selectedText) {
    return selectedText;
  }
  if (!s?.hermitPreview || Number(s.hermitPreview.owner) !== Number(playerIndex)) return '';
  const minorTop = getCurrentHermitPreviewMinorTop();
  return `隠者の予見: 小=${minorTop ? getCardNameLabel(minorTop) : 'なし'}`;
}

function getCurrentHermitPreviewMinorTop() {
  if (!s?.hermitPreview) return null;
  const deckTop = (Array.isArray(s?.minorDeck) && s.minorDeck.length > 0)
    ? (s.minorDeck[s.minorDeck.length - 1] || null)
    : null;
  if (deckTop) return deckTop;
  // Backward compatibility for already-synced state that only has snapshot.
  return s.hermitPreview.minorTop || null;
}

function getVisibleHermitPreviewForLocalPlayer() {
  if (!s?.roundActive || s?.hiddenOracleRevealed) return null;
  const me = getLocalPlayerIndex();
  if (!s?.hermitPreview || Number(s.hermitPreview.owner) !== Number(me)) return null;
  return getCurrentHermitPreviewMinorTop();
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
  setLocalInfoMessage(effectText
    ? `${prefix}: ${name} / ${effectText}`
    : `${prefix}: ${name}（固有効果なし）`, 2200);
}

function showPlayError(reason) {
  if (!s) return;
  const detail = (String(reason || '出せません。').trim()) || '出せません。';
  setLocalPriorityMessage(`出せない理由: ${detail}`, 2400);
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
  ui.kingdomOverlay.classList.remove('show', 'is-kingdom-clear', 'is-kingdom-draw', 'is-kingdom-roundend', 'is-kingdom-grandfinal', 'is-kingdom-call', 'is-kingdom-call-freeze');
  if (kind === 'clear') ui.kingdomOverlay.classList.add('is-kingdom-clear');
  else if (kind === 'draw') ui.kingdomOverlay.classList.add('is-kingdom-draw');
  else if (kind === 'call') ui.kingdomOverlay.classList.add('is-kingdom-call', 'is-kingdom-call-freeze');
  else if (kind === 'grandfinal') ui.kingdomOverlay.classList.add('is-kingdom-roundend', 'is-kingdom-grandfinal');
  else if (kind === 'roundend') ui.kingdomOverlay.classList.add('is-kingdom-roundend');
  void ui.kingdomOverlay.offsetWidth;
  ui.kingdomOverlay.classList.add('show');
  if (kingdomOverlayTimer) clearTimeout(kingdomOverlayTimer);
  const holdMs = holdMsOverride != null
    ? Math.max(120, Number(holdMsOverride) || 0)
    : (kind === 'grandfinal' ? Math.max(1400, GAME_FINAL_CINEMATIC_MS) : (kind === 'roundend' ? 760 : (kind === 'call' ? 620 : 260)));
  kingdomOverlayTimer = setTimeout(() => {
    ui.kingdomOverlay?.classList.remove('show', 'is-kingdom-clear', 'is-kingdom-draw', 'is-kingdom-roundend', 'is-kingdom-grandfinal', 'is-kingdom-call', 'is-kingdom-call-freeze');
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
    'is-kingdom-clear-combo',
    'is-kingdom-clear-gold',
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
      'is-kingdom-clear-combo',
      'is-kingdom-clear-gold',
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
  const directSourceEl = options.sourceElement || null;
  const selectorSourceEl = (typeof options.sourceSelector === 'string' && options.sourceSelector)
    ? document.querySelector(options.sourceSelector)
    : null;
  const directTargetEl = options.targetElement || null;
  const selectorTargetEl = (typeof options.targetSelector === 'string' && options.targetSelector)
    ? document.querySelector(options.targetSelector)
    : null;
  const sourceEl = directSourceEl
    || selectorSourceEl
    || (options.fromPot ? potAnchor : (getKingdomPlayerAnchor(playerIndex) || ui.hand || potAnchor));
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

function triggerKingdomGrandWinnerFx(playerIndex) {
  const mainDuration = Math.max(2200, Number(GAME_FINAL_CINEMATIC_MS) || 0);
  const secondDelay = Math.max(640, Math.floor(mainDuration * 0.44));
  triggerKingdomActionFx(playerIndex, '🏆 FINAL WINNER', {
    overlay: 'grandfinal',
    overlayHoldMs: mainDuration + 700,
    durationMs: mainDuration,
    cutin: true,
    cutinClass: 'is-kingdom-grand-win',
    delayMs: 120
  });
  triggerKingdomActionFx(playerIndex, `${pName(playerIndex)} CHAMPION`, {
    overlay: 'grandfinal',
    overlayHoldMs: 1300,
    durationMs: 1200,
    cutin: true,
    cutinClass: 'is-kingdom-grand-win',
    delayMs: secondDelay
  });
  playKingdomCoinEffect(playerIndex, 14, '🪙', {
    fromPot: true,
    targetPlayerIndex: playerIndex,
    className: 'is-payout is-finale',
    delayMs: 220
  });
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
  const targetRect = targetEl?.getBoundingClientRect?.();
  const targetWidth = (targetRect && targetRect.width > 0) ? targetRect.width : TAROT_TILE_W;
  // Stop with only a slight overlap so the tackle reads as an impact in front of the target card.
  const desiredOverlapPx = Math.max(4, Math.min(12, Math.round(targetWidth * 0.14)));
  const defaultStopBeforePx = Math.max(6, Math.round(targetWidth - desiredOverlapPx));
  const rawStopBeforePx = Number(options.stopBeforePx);
  const stopBeforePx = Number.isFinite(rawStopBeforePx)
    ? Math.max(0, rawStopBeforePx)
    : defaultStopBeforePx;
  const hitPauseMs = Math.max(20, Number(options.hitPauseMs) || 56);
  const keepAfterHit = !!options.keepAfterHit;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / dist;
  const uy = dy / dist;
  const hitX = to.x - (ux * stopBeforePx);
  const hitY = to.y - (uy * stopBeforePx);
  const ghost = cardNode(attackCard, { clickable: false });
  ghost.classList.remove('is-clickable', 'is-static', 'is-selected', 'is-entering', 'is-call-arriving', 'is-leaving');
  ghost.classList.add('tarot-card-fly', 'tarot-kingdom-ram-card');
  if (targetRect && targetRect.width > 0 && targetRect.height > 0) {
    const w = Math.round(targetRect.width);
    const h = Math.round(targetRect.height);
    ghost.style.width = `${w}px`;
    ghost.style.minWidth = `${w}px`;
    ghost.style.height = `${h}px`;
    ghost.style.minHeight = `${h}px`;
    ghost.style.setProperty('--tarot-card-w', `${w}px`);
    ghost.style.setProperty('--tarot-card-h', `${h}px`);
  }
  ghost.style.left = `${from.x}px`;
  ghost.style.top = `${from.y}px`;
  ghost.style.opacity = '0';
  ghost.style.transform = 'translate(-50%, -50%) scale(1) rotate(0deg)';
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
    ghost.style.left = `${hitX}px`;
    ghost.style.top = `${hitY}px`;
    ghost.style.opacity = '1';
    ghost.style.transform = 'translate(-50%, -50%) scale(1) rotate(0deg)';
  }, delayMs + 12);
  if (!keepAfterHit) {
    fadeOutAndRemove(delayMs + durationMs + hitPauseMs + 16, 110);
  }
  return {
    totalMs: delayMs + durationMs + hitPauseMs + (keepAfterHit ? 0 : 180),
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
    // 衝突時の明滅は廃止。パーティクルのみ残す。
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

const toCssContentString = (text, fallback = '💥') => {
  const value = String(text || fallback || '💥');
  return JSON.stringify(value);
};

function applyKingdomDefeatMarkerEmoji(node, markerEmoji) {
  if (!node) return;
  if (markerEmoji) {
    node.style.setProperty('--defeat-marker-content', toCssContentString(markerEmoji, '💥'));
  } else {
    node.style.removeProperty('--defeat-marker-content');
  }
}

function spawnKingdomArcanaLeadFx(targetEl, arcanaFx, options = {}) {
  if (typeof document === 'undefined' || !targetEl || !arcanaFx?.leadEmoji) return 0;
  const rect = targetEl.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return 0;
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  const durationMs = Math.max(480, Number(options.durationMs) || Number(arcanaFx?.heroDurationMs) || 820);
  const x = rect.left + (rect.width * 0.5);
  // Place the lead emoji above the card center with a fixed gap so it never overlaps the card body.
  const heroHalfPx = Math.max(20, Number(options.heroHalfPx) || 26);
  const gapPx = Math.max(8, Number(options.gapPx) || 10);
  const y = Math.max(heroHalfPx + 4, rect.top - heroHalfPx - gapPx);
  const node = document.createElement('span');
  const pattern = String(arcanaFx?.pattern || 'burst');
  const n = Number(arcanaFx?.number);
  node.className = `tarot-kingdom-arcana-hero is-${pattern}${Number.isFinite(n) ? ` is-arcana-${Math.max(0, Math.min(21, Math.floor(n)))}` : ''}`;
  node.textContent = String(arcanaFx.leadEmoji || '');
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  node.style.opacity = '0';
  node.style.setProperty('--fx-dur', `${durationMs}ms`);
  document.body.appendChild(node);
  setTimeout(() => {
    if (!node.parentElement) return;
    node.classList.add('run');
  }, delayMs + 12);
  const totalMs = delayMs + durationMs + 220;
  setTimeout(() => {
    if (node.parentElement) node.remove();
  }, totalMs);
  return totalMs;
}

function spawnKingdomDefeatParticles(targetEl, kind = 'normal', options = {}) {
  if (typeof document === 'undefined' || !targetEl) return;
  const rect = targetEl.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return;
  const baseX = rect.left + (rect.width / 2);
  const baseY = rect.top + (rect.height / 2);
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  const markerEmoji = String(options?.markerEmoji || '').trim();
  const particles = [];
  if (kind === 'slash') {
    // Slash now uses only the sword marker + split clones.
    return;
  } else if (kind === 'rock') {
    particles.push({ emoji: markerEmoji || '🏅', variant: 'is-rock-main', x: baseX, y: baseY - 56, dur: 520, offset: 0 });
    particles.push({ emoji: '🪙', variant: 'is-rock-ground', x: baseX - 18, y: baseY - 24, dur: 420, offset: 68 });
    particles.push({ emoji: '💥', variant: 'is-rock-hit', x: baseX + 2, y: baseY + 2, dur: 260, offset: 148 });
  } else if (kind === 'water') {
    particles.push({ emoji: markerEmoji || '💦', variant: 'is-water-main', x: baseX, y: baseY - 28, dur: 440, offset: 0 });
    particles.push({ emoji: '💧', variant: 'is-water-drop-a', x: baseX - 20, y: baseY - 12, dur: 300, offset: 120 });
    particles.push({ emoji: '💧', variant: 'is-water-drop-b', x: baseX + 4, y: baseY - 16, dur: 340, offset: 152 });
    particles.push({ emoji: '💧', variant: 'is-water-drop-c', x: baseX + 20, y: baseY - 10, dur: 320, offset: 184 });
  } else if (kind === 'fire') {
    particles.push({ emoji: markerEmoji || '🔥', variant: 'is-fire-a', x: baseX - 16, y: baseY + 6, dur: 420, offset: 0 });
    particles.push({ emoji: '🔥', variant: 'is-fire-b', x: baseX + 2, y: baseY - 10, dur: 520, offset: 70 });
    particles.push({ emoji: '🔥', variant: 'is-fire-c', x: baseX + 18, y: baseY + 2, dur: 460, offset: 132 });
    particles.push({ emoji: '▪️', variant: 'is-fire-char', x: baseX - 4, y: baseY + 10, dur: 560, offset: 210 });
  } else {
    particles.push({ emoji: markerEmoji || '💥', variant: 'is-normal', x: baseX, y: baseY, dur: 320, offset: 0 });
    particles.push({ emoji: markerEmoji || '💫', variant: 'is-normal', x: baseX + 10, y: baseY - 8, dur: 300, offset: 44 });
  }

  particles.forEach((cfg) => {
    const node = document.createElement('span');
    node.className = `tarot-kingdom-defeat-particle ${cfg.variant || ''}`;
    node.textContent = cfg.emoji;
    node.style.left = `${cfg.x}px`;
    node.style.top = `${cfg.y}px`;
    node.style.animationDelay = `${delayMs + Math.max(0, Number(cfg.offset) || 0)}ms`;
    node.style.setProperty('--fx-dur', `${Math.max(220, Number(cfg.dur) || 420)}ms`);
    document.body.appendChild(node);
    requestAnimationFrame(() => node.classList.add('run'));
    const total = delayMs + Math.max(0, Number(cfg.offset) || 0) + Math.max(220, Number(cfg.dur) || 420) + 120;
    setTimeout(() => {
      if (node.parentElement) node.remove();
    }, total);
  });
}

function spawnKingdomSlashSplitFx(targetEl, options = {}) {
  if (typeof document === 'undefined' || !targetEl) return 0;
  const rect = targetEl.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return 0;
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  const durationMs = Math.max(320, Number(options.durationMs) || 560);
  const parts = [
    { suffix: 'is-left', clip: 'inset(0 50% 0 0 round 0)' },
    { suffix: 'is-right', clip: 'inset(0 0 0 50% round 0)' }
  ];
  const nodes = parts.map((part) => {
    const node = targetEl.cloneNode(true);
    node.classList.remove(
      'is-defeat-transition',
      'is-defeat-primary',
      'is-entering',
      'is-call-arriving',
      'is-leaving',
      'is-clickable',
      'is-selected',
      'is-static'
    );
    node.classList.add('tarot-kingdom-slash-fragment', part.suffix);
    node.style.left = `${rect.left}px`;
    node.style.top = `${rect.top}px`;
    node.style.width = `${rect.width}px`;
    node.style.height = `${rect.height}px`;
    node.style.clipPath = part.clip;
    node.style.setProperty('--fx-dur', `${durationMs}ms`);
    document.body.appendChild(node);
    setTimeout(() => {
      if (!node.parentElement) return;
      node.classList.add('run');
    }, delayMs + 12);
    return node;
  });
  const totalMs = delayMs + durationMs + 180;
  setTimeout(() => {
    nodes.forEach((node) => {
      if (node?.parentElement) node.remove();
    });
  }, totalMs);
  return totalMs;
}

function getKingdomDefeatShakeLevel(play, defeatFxKind = 'normal', transitionKind = 'normal') {
  if (!play) return 0;
  if (transitionKind === 'roleClash') return 3;
  if (String(play.type || '') === 'role') {
    const key = String(play?.role?.key || '');
    if (key === 'FiveKind' || key === 'StraightFlush' || key === 'TheWorld') return 3;
    if (key === 'FourKind' || key === 'FullHouse') return 2;
    return 1;
  }
  let level = 0;
  const count = Math.max(1, Number(play?.count) || 1);
  if (count >= 3) level += 2;
  else if (count === 2) level += 1;
  if (defeatFxKind !== 'normal') level += 1;
  return Math.max(0, Math.min(3, level));
}

function getKingdomDefeatTimingProfile(defeatFxKind = 'normal', options = {}) {
  const kind = String(defeatFxKind || 'normal');
  const shakeLevel = Math.max(0, Math.min(3, Number(options.shakeLevel) || 0));
  const roleClash = !!options.roleClash;
  const debugPreview = !!options.debugPreview;
  const presets = {
    normal: { cardMs: 360, markerMs: 0, visualEndRatio: 0.52, staggerMs: 20, tailPadMs: 8, settleMs: 118, splitLeadMs: 72, splitMs: 340, particleLeadMs: 10 },
    slash: { cardMs: 330, markerMs: 330, visualEndRatio: 0.34, staggerMs: 16, tailPadMs: 0, settleMs: 108, splitLeadMs: 24, splitMs: 380, particleLeadMs: 0 },
    rock: { cardMs: 440, markerMs: 380, visualEndRatio: 0.62, staggerMs: 18, tailPadMs: 6, settleMs: 122, splitLeadMs: 0, splitMs: 0, particleLeadMs: 10 },
    water: { cardMs: 410, markerMs: 350, visualEndRatio: 0.58, staggerMs: 18, tailPadMs: 6, settleMs: 116, splitLeadMs: 0, splitMs: 0, particleLeadMs: 0 },
    fire: { cardMs: 430, markerMs: 370, visualEndRatio: 0.7, staggerMs: 18, tailPadMs: 8, settleMs: 120, splitLeadMs: 0, splitMs: 0, particleLeadMs: 0 },
    arcana: { cardMs: 520, markerMs: 460, visualEndRatio: 0.56, staggerMs: 22, tailPadMs: 12, settleMs: 132, splitLeadMs: 0, splitMs: 0, particleLeadMs: 0 }
  };
  const preset = presets[kind] || presets.normal;
  const cardMs = Math.max(
    220,
    preset.cardMs
      + (shakeLevel * (kind === 'arcana' ? 34 : 28))
      + (roleClash ? 24 : 0)
      + (debugPreview ? 12 : 0)
  );
  let markerMs = preset.markerMs
    ? Math.max(
      220,
      preset.markerMs
        + (shakeLevel * (kind === 'arcana' ? 24 : 18))
        + (roleClash ? 18 : 0)
        + (debugPreview ? 12 : 0)
    )
    : 0;
  if (markerMs > 0) {
    markerMs = Math.min(markerMs, cardMs + (kind === 'arcana' ? 72 : 24));
  }
  const visualEndMs = Math.max(
    160,
    Math.min(
      cardMs,
      Math.round(cardMs * Math.max(0.2, Math.min(0.9, Number(preset.visualEndRatio) || 0.6)))
    )
  );
  return {
    cardMs,
    markerMs,
    activeMs: Math.max(cardMs, markerMs),
    visualEndMs,
    staggerMs: Math.max(0, preset.staggerMs + (roleClash ? 2 : 0)),
    tailPadMs: Math.max(0, preset.tailPadMs + (debugPreview ? 4 : 0)),
    settleMs: preset.settleMs,
    splitLeadMs: preset.splitLeadMs,
    splitMs: preset.splitMs ? Math.max(280, preset.splitMs + (shakeLevel * 18)) : 0,
    particleLeadMs: preset.particleLeadMs
  };
}

function settleKingdomIncomingFirstCard(ramFx, runIfCurrent, renderIncomingNow, resolvePending, settleDurationMs = 120) {
  if (typeof renderIncomingNow === 'function') renderIncomingNow();
  const firstNode = ui.trick?.querySelector?.('.tarot-card');
  if (firstNode && ramFx?.settleTo) {
    firstNode.style.opacity = '0.24';
    firstNode.style.transform = 'translateY(0) scale(0.985)';
    const settleDoneMs = ramFx.settleTo(firstNode, {
      durationMs: Math.max(96, Number(settleDurationMs) || 120),
      onArrive: () => {
        firstNode.style.opacity = '';
        firstNode.style.transform = '';
      },
        autoRemove: true
      });
    setTimeout(() => runIfCurrent(() => {
      if (typeof resolvePending === 'function') resolvePending();
    }), Math.max(0, settleDoneMs) + 12);
    return;
  }
  if (ramFx?.remove) {
    ramFx.remove(72);
    setTimeout(() => runIfCurrent(() => {
      if (typeof resolvePending === 'function') resolvePending();
    }), 96);
    return;
  }
  if (typeof resolvePending === 'function') resolvePending();
}

function triggerKingdomTrickShake(level = 0) {
  const root = ui.root || ui.trick;
  if (!root) return;
  const lv = Math.max(0, Math.min(3, Number(level) || 0));
  root.classList.remove('is-trick-shake-normal', 'is-trick-shake-special', 'is-trick-shake-heavy', 'is-trick-shake-ultra');
  void root.offsetWidth;
  if (lv >= 3) root.classList.add('is-trick-shake-ultra');
  else if (lv >= 2) root.classList.add('is-trick-shake-heavy');
  else if (lv >= 1) root.classList.add('is-trick-shake-special');
  else root.classList.add('is-trick-shake-normal');
  const holdMs = lv >= 3 ? 230 : (lv >= 2 ? 190 : (lv >= 1 ? 150 : 100));
  setTimeout(() => {
    root.classList.remove('is-trick-shake-normal', 'is-trick-shake-special', 'is-trick-shake-heavy', 'is-trick-shake-ultra');
  }, holdMs);
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
  let bestRows = null;
  const walk = (i, picked) => {
    if (i >= options.length) {
      if (lockSuit && !picked.every((r) => r.suit === lockSuit)) return;
      const role = evalRoleVariant(picked, cards);
      if (role && (!best || compareRole(role, best) > 0)) {
        best = role;
        bestRows = picked.slice();
      }
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
  if (best && Array.isArray(bestRows) && bestRows.length > 0) {
    const switchByCardId = {};
    bestRows.forEach((row) => {
      const card = row?.src;
      if (!card || card.kind !== 'major' || !card.id) return;
      const base = Number(card.number || 0);
      const raw = Number(row.raw || 0);
      if (base === 3 && raw === 13) switchByCardId[String(card.id)] = 13;
      else if (base === 4 && raw === 14) switchByCardId[String(card.id)] = 14;
    });
    if (Object.keys(switchByCardId).length > 0) {
      best.displayNumberSwitchByCardId = switchByCardId;
    }
  }
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
    drawFlipPlayer: -1,
    drawFlipCardId: '',
    drawFlipRevealAt: 0,
    drawFlipEndAt: 0,
    selected: new Set(),
    pot: 0,
    logs: [],
    awaitRoundConfirm: false,
    roundSettlement: null,
    clearStreakOwner: null,
    clearStreakCount: 0,
    message: 'オンラインかオフラインを選択してください。',
    champion: null
  };
}

function clearRoundState() {
  clearSettlementGainFx();
  clearRoundStartCinematicTimer();
  clearOpeningDealTimers();
  clearDrawHandFlipTimers();
  clearLocalInfoMessage(false);
  clearKingdomTrickSceneFlash(false);
  kingdomLocalGraveOpen = false;
  localHandSortDrawLock = false;
  s.trick = null;
  s.leadRequiredOwner = null;
  s.lastPlay = null;
  s.pass = [false, false, false, false];
  s.callOnly = false;
  s.lock = null;
  s.trickForcedCount = 0;
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
  s.drawFlipPlayer = -1;
  s.drawFlipCardId = '';
  s.drawFlipRevealAt = 0;
  s.drawFlipEndAt = 0;
  s.openingDealRevealCount = 0;
  s.openingDealFlipIndex = -1;
  s.selected.clear();
  s.awaitRoundConfirm = false;
  s.roundSettlement = null;
  s.clearStreakOwner = null;
  s.clearStreakCount = 0;
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

function getNpcAiStyle(playerIndex) {
  const style = String(s?.players?.[playerIndex]?.aiStyle || PLAYERS[playerIndex]?.aiStyle || NPC_AI_STYLE.BALANCED);
  if (style === NPC_AI_STYLE.CAUTIOUS) return NPC_AI_STYLE.CAUTIOUS;
  if (style === NPC_AI_STYLE.AGGRESSIVE) return NPC_AI_STYLE.AGGRESSIVE;
  return NPC_AI_STYLE.BALANCED;
}

function getActiveTurnPlayerIndex() {
  if (!s?.roundActive) return -1;
  if (s.phase === 'draw' && Number.isInteger(s.pendingDraw)) return Number(s.pendingDraw);
  if (s.phase === 'judgment' && Number.isInteger(s.pendingJudgment)) return Number(s.pendingJudgment);
  if (s.phase === 'turn' && Number.isInteger(s.turn)) return Number(s.turn);
  return -1;
}

function isHumanTurnActiveNow() {
  const me = getLocalPlayerIndex();
  if (me < 0 || !s) return false;
  return getActiveTurnPlayerIndex() === me;
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

  vibrateOnce(55);
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
  const now = Date.now();
  for (const [roomId] of entries) {
    const item = openMap?.[roomId] || {};
    const updatedAt = Number(item?.updatedAt || item?.createdAt || 0);
    const isStale = updatedAt > 0 && (now - updatedAt) > TK_OPEN_ROOM_STALE_MS;
    if (isStale) {
      await remove(ref(db, `${TK_MATCH_ROOT}/openRooms/${roomId}`)).catch((error) => {
        if (isPermissionDeniedError(error)) netOpenRoomIndexEnabled = false;
      });
      continue;
    }
    const roomPath = `tarotKingdomRooms/${roomId}`;
    const stateSnap = await get(ref(db, `${roomPath}/state`));
    const payload = stateSnap.exists() ? stateSnap.val() : null;
    const inProgress = isRoomInProgressFromStatePayload(payload);
    const presenceSnap = await get(ref(db, `${roomPath}/presence`));
    const presenceMap = presenceSnap.exists() ? (presenceSnap.val() || {}) : {};
    const count = Object.keys(presenceMap).length;
    const hostUidSnap = await get(ref(db, `${roomPath}/meta/hostUid`));
    const hostUid = hostUidSnap.exists() ? String(hostUidSnap.val() || '') : '';
    const hasLiveHost = !hostUid || !!presenceMap?.[hostUid];
    if (inProgress || count >= 4 || count <= 0 || !hasLiveHost) {
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
    const presenceSnap = await get(ref(db, `${roomPath}/presence`)).catch(() => null);
    const presenceMap = presenceSnap?.exists?.() ? (presenceSnap.val() || {}) : {};
    const count = Object.keys(presenceMap).length;
    const hostUidSnap = await get(ref(db, `${roomPath}/meta/hostUid`)).catch(() => null);
    const hostUid = hostUidSnap?.exists?.() ? String(hostUidSnap.val() || '') : '';
    const hasLiveHost = !hostUid || !!presenceMap?.[hostUid];
    if (inProgress || count >= 4) continue;
    if (count <= 0) return roomId;
    if (hasLiveHost) return roomId;
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
  next.graveOpen = false;
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

function shouldShowKingdomModeChoice() {
  if (!s) return true;
  if (s.roundActive) return false;
  if (Number(s.handNo || 0) > 0) return false;
  if (s.awaitRoundConfirm) return false;
  const phase = String(s.phase || '');
  if (phase === 'roundEnd' || phase === 'done') return false;
  return true;
}

function shouldShowOpenRoomsLobby() {
  if (kingdomStartMode !== 'online') return false;
  if (!s) return true;
  if (s.roundActive) return false;
  if (Number(s.handNo || 0) > 0) return false;
  if (s.awaitRoundConfirm) return false;
  const phase = String(s.phase || '');
  if (phase === 'roundEnd' || phase === 'done') return false;
  return true;
}

function isKingdomOnlineConnecting() {
  return kingdomStartMode === 'online' && !isNetModeActive() && String(s?.message || '') === 'オンライン対戦に接続中です...';
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

async function claimHostIfNeeded(forceTakeover = false) {
  if (!isNetModeActive()) return;
  try {
    const hostRef = ref(tkNet.db, `${tkNet.roomPath}/meta/hostUid`);
    const snap = await get(hostRef);
    const current = snap.exists() ? String(snap.val() || '') : '';
    const hostMissingFromPresence = !!current && !netPresenceByUid?.[current];
    if (!current || (forceTakeover && hostMissingFromPresence)) {
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
  if (netManualOfflineMode) return;
  const next = deserializeStateFromNet(payload);
  if (!next) return;
  clearLocalInfoMessage(false);
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
      scheduleOpenRoomHeartbeat();
    } else {
      stopHostActionListener();
      clearOpenRoomHeartbeatTimer();
    }
  });

  const presenceRef = ref(tkNet.db, `${tkNet.roomPath}/presence`);
  netPresenceUnsub = onValue(presenceRef, (snapshot) => {
    netPresenceByUid = snapshot.exists() ? (snapshot.val() || {}) : {};
    if (!tkNet.isHost && tkNet.hostUid && !netPresenceByUid[tkNet.hostUid]) {
      claimHostIfNeeded(true).catch((error) => {
        console.warn('[tarotKingdom] host takeover failed:', error);
      });
    }
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
  clearOpenRoomHeartbeatTimer();
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
  if (netManualOfflineMode) {
    teardownTarotKingdomNetwork();
    tkNet.localSeat = 0;
    return;
  }
  if (netBootPromise) return netBootPromise;
  netBootPromise = (async () => {
    try {
      if (netManualOfflineMode) {
        teardownTarotKingdomNetwork();
        tkNet.localSeat = 0;
        return;
      }
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
        if (netOpenRoomIndexEnabled) {
          try {
            const openDisc = onDisconnect(ref(db, `${TK_MATCH_ROOT}/openRooms/${tkNet.roomId}`));
            await openDisc.remove();
          } catch (_) {
            // ignore
          }
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
  clearPendingTurnAdvanceAfterTrick();
  clearKingdomTrickSceneFlash(false);
  s = initState();
  clearLocalInfoMessage(false);
  if (kingdomLocalPriorityTimer) {
    clearTimeout(kingdomLocalPriorityTimer);
    kingdomLocalPriorityTimer = null;
  }
  kingdomLocalPriorityMessage = '';
  kingdomLocalGraveOpen = false;
  clearLocalAutoFold();
  kingdomLocalAutoFoldPrevReverse = false;
  npcActInFlight = false;
  netLastStateHash = '';
  if (trickSwapTimer) { clearTimeout(trickSwapTimer); trickSwapTimer = null; }
  trickRenderKey = '';
  trickRenderIdentityKey = '';
  trickRenderToken += 1;
  if (stateErrorTimer) { clearTimeout(stateErrorTimer); stateErrorTimer = null; }
  clearOracleFlipTimers();
  clearCallCinematicTimer();
  clearRoundStartCinematicTimer();
  clearRoundOutCinematicTimer();
  clearOpeningDealTimers();
  clearDrawHandFlipTimers();
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
  clearLocalAutoFold();
  kingdomLocalAutoFoldPrevReverse = false;
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
  if (![1, 2, 3].includes(sel.length)) return { ok: false, reason: '通常出しは1〜3枚です。' };
  const cards = sel.map((i) => p.hand[i]).filter(Boolean);
  if (cards.length !== sel.length) return { ok: false, reason: '選択が不正です。' };
  const isWorldSingle = cards.length === 1
    && cards[0]?.kind === 'major'
    && Number(cards[0]?.number) === 21;
  if (forcedCount > 0 && sel.length !== forcedCount && !isWorldSingle) {
    return { ok: false, reason: `${forcedCount}枚出しのみ有効です。` };
  }
  let n = chooseSetNumberCandidate(cards, !!s.reverse);
  if (n == null) return { ok: false, reason: '同じ数値で揃えてください。' };
  if (
    cards.length === 1 &&
    cards[0]?.kind === 'major' &&
    [16, 17, 18, 19].includes(Number(cards[0]?.number || 0))
  ) {
    n = 14;
  }
  const cardsForSuitLock = (cards.length === 2 && cards.some((c) => c?.kind === 'major' && Number(c?.number) === 6))
    ? cards.filter((c) => !(c?.kind === 'major' && Number(c?.number) === 6))
    : cards;
  if (s.lock?.suit && !isWorldSingle && !cardsForSuitLock.every((c) => suitsForCard(c, false).includes(s.lock.suit))) {
    return { ok: false, reason: `スート縛り: ${SUIT_LABEL[s.lock.suit]}` };
  }
  const allMagicianOne = Number(n) === 1 && cards.every((c) => c.kind === 'major' && Number(c.number) === 1);
  const setPower = allMagicianOne ? 1 : setRankFromNumber(n);
  if (s.lock?.min != null && cards.length === 1 && setPower <= s.lock.min && !isWorldSingle) {
    return { ok: false, reason: `${s.lock.min}より強いカードが必要です。` };
  }
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
  const role = evalRole([base, ...cards], s.lock?.suit || null);
  if (!role || role.strength < ROLE_ST.Straight) return { ok: false, reason: 'コール成立しません。' };
  const baseNumber = Number(base?.number);
  const hasSameNumberInHand = Array.isArray(p?.hand)
    && p.hand.some((c) => Number(c?.number) === baseNumber);
  if (role.key === 'Straight' && hasSameNumberInHand) {
    return { ok: false, reason: 'ストレートコール制限: 手札（選択中含む）に場札と同数値があるため不可です。' };
  }
  if (role.key === 'Flush') {
    const baseSuit = (suitsForCard(base, false) || [])[0] || 'None';
    const sameSuitCountInHand = Array.isArray(p?.hand)
      ? p.hand.filter((c) => (suitsForCard(c, false) || []).includes(baseSuit)).length
      : 0;
    if (baseSuit !== 'None' && sameSuitCountInHand >= 5) {
      return { ok: false, reason: 'フラッシュコール制限: 手札（選択中含む）に場札と同スートが5枚以上あるため不可です。' };
    }
    const vals = [base, ...cards].map((c) => cStrength(c)).sort((a, b) => b - a);
    if (vals[0] === cStrength(base)) return { ok: false, reason: 'フラッシュコール制限: 場札がハイカードになる構成は不可です。' };
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
  return null;
}

function validatePlay(play, mode) {
  const aceRuleViolation = getAceFinishRuleViolation(play);
  if (aceRuleViolation) return { ok: false, reason: aceRuleViolation };
  if (!s.trick) return mode === 'call' ? { ok: false, reason: '初手でコールは不可です。' } : { ok: true };
  const playCards = Array.isArray(play?.cardsTable) ? play.cardsTable : [];
  const isWorldSingleOverride = mode !== 'call'
    && play?.type === 'set'
    && Number(play?.count || 0) === 1
    && playCards.length === 1
    && playCards[0]?.kind === 'major'
    && Number(playCards[0]?.number) === 21;
  if (isWorldSingleOverride) return { ok: true };
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
  const aiStyle = getNpcAiStyle(playerIndex);
  const hand = Math.max(0, Number(actor.hand?.length || 0));
  const stars = Math.max(0, Number(actor.stars) || 0);
  const reason = String(s?.pendingDrawReason || 'normal');
  const hasMinor = (s?.minorDeck?.length || 0) > 0;
  const hasMajor = (s?.majorDeck?.length || 0) > 0 && stars > 0;
  if (!hasMinor && !hasMajor) return 'skip';
  const summary = summarizeNpcHandPotential(playerIndex);
  const shouldUseMajor = () => {
    if (!hasMajor) return false;
    if (aiStyle === NPC_AI_STYLE.CAUTIOUS) {
      if (stars < 3) return false;
      if (hand >= 6) return false;
      if (summary.roleCount > 0 || summary.pairOrMoreCount > 0) return false;
      if (summary.strongSingleCount > 0) return false;
      if (summary.deadSingleCount < 4) return false;
      if (summary.majorCount > 0) return false;
      return true;
    }
    if (aiStyle === NPC_AI_STYLE.AGGRESSIVE) {
      if (stars < 1) return false;
      if (hand >= 8) return false;
      if (summary.roleCount > 0) return false;
      if (summary.pairOrMoreCount > 1) return false;
      if (summary.strongSingleCount > 1) return false;
      if (summary.deadSingleCount < 2) return false;
      if (summary.majorCount > 2) return false;
      return true;
    }
    if (stars < 2) return false;
    if (hand >= 7) return false;
    if (summary.roleCount > 0 || summary.pairOrMoreCount > 0) return false;
    if (summary.strongSingleCount > 0) return false;
    if (summary.deadSingleCount < 3) return false;
    if (summary.majorCount > 1) return false;
    return true;
  };

  if (reason === 'clear') {
    // クリア後は「弱い単騎ばかりで、次の先手が弱い」時だけドローする。
    if (aiStyle === NPC_AI_STYLE.CAUTIOUS) {
      if (hand >= 8) return 'skip';
      if (hand <= 5) return 'skip';
      if (summary.roleCount > 0) return 'skip';
      if (summary.pairOrMoreCount > 0) return 'skip';
      if (summary.strongSingleCount > 0) return 'skip';
      if (summary.deadSingleCount <= 2) return 'skip';
    } else if (aiStyle === NPC_AI_STYLE.AGGRESSIVE) {
      if (hand >= 10) return 'skip';
      if (hand <= 3) return 'skip';
      if (summary.roleCount > 0 && summary.pairOrMoreCount > 0) return 'skip';
      if (summary.strongSingleCount >= 3) return 'skip';
      if (summary.deadSingleCount <= 0) return 'skip';
    } else {
      if (hand >= 9) return 'skip';
      if (hand <= 4) return 'skip';
      if (summary.roleCount > 0) return 'skip';
      if (summary.pairOrMoreCount >= 2) return 'skip';
      if (summary.strongSingleCount >= 2) return 'skip';
      if (summary.deadSingleCount <= 1) return 'skip';
    }
    if (!hasMinor && hasMajor) return shouldUseMajor() ? 'major' : 'skip';
    if (!hasMinor) return 'skip';
    return shouldUseMajor() ? 'major' : 'minor';
  }

  if (reason === 'judgment') {
    // 審判後は回収済みなので、さらに膨らませるのは控えめ。
    if (aiStyle === NPC_AI_STYLE.CAUTIOUS) {
      if (hand >= 7) return 'skip';
      if (summary.roleCount > 0 || summary.pairOrMoreCount > 0) return 'skip';
    } else if (aiStyle === NPC_AI_STYLE.AGGRESSIVE) {
      if (hand >= 9) return 'skip';
      if (summary.roleCount > 0 && summary.pairOrMoreCount > 0) return 'skip';
    } else {
      if (hand >= 8) return 'skip';
      if (summary.roleCount > 0 || summary.pairOrMoreCount > 0) return 'skip';
    }
    if (!hasMinor && hasMajor) return shouldUseMajor() ? 'major' : 'skip';
    if (!hasMinor) return 'skip';
    return shouldUseMajor() ? 'major' : 'minor';
  }

  // 通常ドロー（親で有効手なし）は基本的に前進。メジャーは本当に弱い時だけ。
  if (!hasMinor && hasMajor) return shouldUseMajor() ? 'major' : 'skip';
  if (hasMinor && !hasMajor) return 'minor';
  return shouldUseMajor() ? 'major' : 'minor';
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

function maybeApplyChariotNormalDrawDuplication(playerIndex, card) {
  if (!s) return null;
  if (!card || card.kind !== 'major' || Number(card.number) !== 7) return null;
  const p = s.players?.[playerIndex];
  if (!p) return null;
  if (Number(p.hand.length || 0) >= START_HAND) return null;
  const clone = {
    ...card,
    id: `${String(card.id || 'tk_a_7')}_dup_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    chariotClone: true
  };
  p.hand.push(clone);
  return clone;
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
  if (isNpcPlayer(playerIndex)) scheduleNpc();
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
  if (isNpcPlayer(playerIndex)) scheduleNpc();
}

function clearTrick(leader) {
  clearCallCinematicTimer();
  s._traceFlowId = (kingdomTraceFlowSeed += 1);
  traceKingdomFlow('clearTrick.enter', `leader=${leader}`);
  const clearedPlay = s.lastPlay;
  const isRoleClear = !!(clearedPlay && clearedPlay.type === 'role');
  if (Number.isInteger(s.clearStreakOwner) && s.clearStreakOwner === leader) {
    s.clearStreakCount = Math.max(1, Number(s.clearStreakCount) || 1) + 1;
  } else {
    s.clearStreakOwner = leader;
    s.clearStreakCount = 1;
  }
  s.turnCount = Math.max(1, Number(s.turnCount) || 1) + 1;
  if (s.players[leader]) {
    s.players[leader].stars = Math.max(0, Number(s.players[leader].stars) || 0) + 1;
  }
  applyRoleRewardOnClear(leader);
  const hadJudgment = !!(s.lastPlay && s.lastPlay.type === 'set' && s.lastPlay.owner === leader && s.lastPlay.cardsHand.some((c) => c.kind === 'major' && c.number === 20));
  traceKingdomFlow('clearTrick.stateReset', `hadJudgment=${hadJudgment}`);
  s.trickForcedCount = 0;
  s.starDrainAuraOwner = null;
  s.passStarDrainAuraOwner = null;
  s.trickDefeatFx = null;
  s.trickTransitionKind = 'clearSweep';
  s.trick = null;
  s.lastPlay = null;
  s.pass = [false, false, false, false];
  s.callOnly = false;
  s.lock = null;
  s.leadRequiredOwner = leader;
  if (!s.reversePersist) s.reverse = false;
  s.turn = leader;

  const clearLabel = isRoleClear
    ? `${getRoleDisplayLabel(clearedPlay)}でクリア`
    : 'クリア';
  triggerKingdomActionFx(leader, clearLabel, {
    overlay: 'clear',
    durationMs: isRoleClear ? 980 : 760,
    cutin: !!isRoleClear,
    cutinClass: isRoleClear ? 'is-kingdom-clear-gold' : undefined
  });
  if (Number(s.clearStreakCount) >= 2) {
    triggerKingdomActionFx(leader, `${s.clearStreakCount} CLEAR`, {
      overlay: 'action',
      durationMs: 860,
      cutin: true,
      cutinClass: 'is-kingdom-clear-combo',
      delayMs: isRoleClear ? 120 : 40
    });
  }
  triggerKingdomActionFx(leader, `ターン ${s.turnCount}`, {
    overlay: 'action',
    durationMs: 700,
    cutin: true,
    delayMs: Number(s.clearStreakCount) >= 2 ? 200 : 120
  });

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
    const drew = drawMinorForEffect(2);
    log(`${pName(play.owner)}: 女教皇で小アルカナ+${drew}`);
    triggerKingdomActionFx(play.owner, `女教皇 +${drew}`, { overlay: 'draw', durationMs: 760, cutin: true });
  }
  if (hasMajor(6)) {
    log(`${pName(play.owner)}: 恋人でペアワイルド`);
    triggerKingdomActionFx(play.owner, '恋人: ペア化', { overlay: 'action', durationMs: 700, cutin: true });
  }
  if (hasMajor(9)) {
    const minorTop = s.minorDeck[s.minorDeck.length - 1] || null;
    s.hermitPreview = { owner: play.owner, minorTop, at: Date.now() };
    if (isLocalPlayer(play.owner)) {
      setLocalInfoMessage(`隠者の予見: 小=${minorTop ? getCardNameLabel(minorTop) : 'なし'}`, 2600);
    }
    log(`${pName(play.owner)}: 隠者で小アルカナを予見`);
    triggerKingdomActionFx(play.owner, '隠者: 予見', { overlay: 'draw', durationMs: 760, cutin: true });
  }
  if (cards.length === 1 && hasMajor(10)) {
    const boost = 1 + Math.floor(Math.random() * 6);
    const boostedNumber = 10 + boost;
    play.wheelBoost = boost;
    play.wheelDisplayNumber = boostedNumber;
    play.setPower = boostedNumber;
    (play.cardsTable || [])
      .filter((card) => card?.kind === 'major' && Number(card?.number || 0) === 10)
      .forEach((card) => { card.displayNumberOverride = boostedNumber; });
    (play.cardsHand || [])
      .filter((card) => card?.kind === 'major' && Number(card?.number || 0) === 10)
      .forEach((card) => { card.displayNumberOverride = boostedNumber; });
    log(`${pName(play.owner)}: 運命の輪で数値+${boost}`);
    triggerKingdomActionFx(play.owner, `運命の輪 +${boost}`, { overlay: 'action', durationMs: 780, cutin: true });
  }
  if (hasMajor(5)) {
    keepTurn = true;
    skip = 0;
    log(`${pName(play.owner)}: 法王でターン継続`);
    triggerKingdomActionFx(play.owner, 'もう一度ターン', { overlay: 'action', durationMs: 860, cutin: true, cutinClass: 'is-kingdom-skip' });
  } else if (has(5)) {
    skip = cards.length; log(`${pName(play.owner)}: 5スキップ x${cards.length}`);
    triggerKingdomActionFx(play.owner, `5スキップ x${cards.length}`, { overlay: 'action', durationMs: 780, cutin: true, cutinClass: 'is-kingdom-skip' });
    triggerKingdomTrickSceneFlash('skip', 760 + (Math.max(1, cards.length) * 120));
  }
  if (has(8)) {
    if (cards.length >= 2 || cards.some((c) => c.kind === 'major' && c.number === 8)) {
      forceClear = true; s.callOnly = false; log(`${pName(play.owner)}: 8カットでクリア`);
      triggerKingdomActionFx(play.owner, '8カット', { overlay: 'clear', durationMs: 860, cutin: true, cutinClass: 'is-kingdom-cut' });
      triggerKingdomTrickSceneFlash('cut', 980);
    } else {
      s.callOnly = true; log(`${pName(play.owner)}: 8カット（コール猶予）`);
      triggerKingdomActionFx(play.owner, '8カット', { overlay: 'action', durationMs: 780, cutin: true, cutinClass: 'is-kingdom-cut' });
      triggerKingdomTrickSceneFlash('cut', 840);
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
    if (prevSuit && hasMajor(14)) {
      // 節制: 直前の場札スートを基準にロック
      s.lock = { suit: prevSuit, min: null };
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
  const chipsBeforeSettlement = s.players.map((p) => Math.max(0, Number(p?.chips) || 0));
  const roundNo = Math.max(1, Number(s.handNo || 0) + 1);
  s.hiddenOracleCard = s.minorDeck.pop() || null;
  s.hiddenOracleRevealed = false;
  const hidden = s.hiddenOracleCard ? idNum(s.hiddenOracleCard) : null;
  const oracleHits = winner.discard.reduce((a, c) => a + ((s.openOracle != null && idNum(c) === s.openOracle) || (hidden != null && idNum(c) === hidden) ? 1 : 0), 0);
  const starBonusBase = Math.max(0, Number(winner.stars) || 0);
  const starBonusTotal = starBonusBase + Math.max(0, Number(oracleHits) || 0);
  let fxDelayMs = 360;
  let totalGain = 0;
  const settlement = {
    roundNo,
    winnerIndex,
    winnerName: winner.name,
    winnerStartChips: Math.max(0, Number(chipsBeforeSettlement[winnerIndex]) || 0),
    winnerFinalChips: 0,
    displayWinnerChips: Math.max(0, Number(chipsBeforeSettlement[winnerIndex]) || 0),
    starBonus: starBonusBase,
    oracleHits,
    rows: [],
    coinEvents: [],
    coinFxDispatched: false,
    bonusCoinFx: null,
    potAward: 0,
    totalGain: 0,
    displayTotalGain: 0
  };
  log(`${winner.name}がアウト！ 清算開始`);
  s.players.forEach((loser, i) => {
    if (i === winnerIndex) return;
    const remain = loser.hand.length;
    const acePenalty = countAceMinor(loser.hand) * A_PENALTY;
    const scoreFactor = 1 + starBonusTotal + acePenalty;
    const pay = remain * scoreFactor;
    const factorParts = [
      { label: '基本', value: 1 },
      { label: '★', value: starBonusTotal },
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
      starBonus: starBonusTotal,
      oracleHits: 0,
      acePenalty,
      scoreFactor,
      factorSummary,
      pay,
      payerStartChips: Math.max(0, Number(chipsBeforeSettlement[i]) || 0),
      payerFinalChips: Math.max(0, Number(loser.chips) || 0),
      displayPayerChips: Math.max(0, Number(chipsBeforeSettlement[i]) || 0)
    });
    log(`${loser.name} -> ${winner.name}: ${pay}（${remain}枚 x 係数${scoreFactor}）`);
    if (pay > 0) {
      settlement.coinEvents.push({
        payerIndex: i,
        pay,
        coinCount: getKingdomCoinCountByAmount(pay),
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
  settlement.bonusCoinFx = {
    coinCount: Math.min(10, Math.max(4, Math.ceil(totalGain / 6))),
    delayMs: fxDelayMs + 200
  };
  settlement.winnerFinalChips = Math.max(0, Number(winner.chips) || 0);
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
    triggerKingdomGrandWinnerFx(top);
    const bankruptText = bankruptPlayers.map((p) => `${p.name}(${p.chips})`).join(' / ');
    s.message = `ゲーム終了（チップ枯渇）: ${bankruptText} / 勝者: ${s.players[top].name} (${s.players[top].chips}チップ)`;
    log(s.message);
    render();
    if (s.hiddenOracleCard) {
      hiddenOracleRevealDelayTimer = setTimeout(() => {
        hiddenOracleRevealDelayTimer = null;
        if (!s || s.phase !== 'done') return;
        revealHiddenOracleWithFlip();
      }, 260);
    }
    return;
  }
  s.handNo += 1;
  if (s.handNo >= TOTAL_HANDS) {
    let top = 0; s.players.forEach((p, i) => { if (s.players[i].chips > s.players[top].chips) top = i; });
    s.champion = top;
    s.phase = 'done';
    s.awaitRoundConfirm = false;
    triggerKingdomGrandWinnerFx(top);
    s.message = `ゲーム終了！ 優勝: ${s.players[top].name} (${s.players[top].chips}チップ)`;
    log(s.message);
    render();
    if (s.hiddenOracleCard) {
      hiddenOracleRevealDelayTimer = setTimeout(() => {
        hiddenOracleRevealDelayTimer = null;
        if (!s || s.phase !== 'done') return;
        revealHiddenOracleWithFlip();
      }, 260);
    }
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
    startDrawHandFlip(pi, c);
    onPlayerDrewCard(pi, 1200);
    const dup = maybeApplyChariotNormalDrawDuplication(pi, c);
    if (dup) {
      onPlayerDrewCard(pi, 900);
      log(`${pName(pi)}: 戦車が増殖`);
    }
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
  startDrawHandFlip(pi, card);
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
  // Clear stale, transient number labels before applying the current-play label hints.
  const clearTransientNumberLabel = (card) => {
    if (!card || typeof card !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(card, 'displayNumberOverride')) {
      delete card.displayNumberOverride;
    }
    if (Object.prototype.hasOwnProperty.call(card, 'displayNumberLabelOverride')) {
      delete card.displayNumberLabelOverride;
    }
  };
  play.cardsTable.forEach(clearTransientNumberLabel);
  play.cardsHand.forEach(clearTransientNumberLabel);
  if (play.type === 'set' && Number(play.count || 0) === 1 && play.cardsTable?.[0]?.kind === 'major') {
    const majorNo = Number(play.cardsTable[0].number || 0);
    if ([16, 17, 18, 19].includes(majorNo)) {
      play.cardsTable[0].displayNumberOverride = 14;
      if (play.cardsHand?.[0]) play.cardsHand[0].displayNumberOverride = 14;
    }
  }
  if (play.type === 'set') {
    const chosen = Number(play.number || 0);
    const applySetSwitchLabel = (card) => {
      if (!card || card.kind !== 'major') return;
      const n = Number(card.number || 0);
      if (n === 3 && chosen === 13) card.displayNumberOverride = 13;
      if (n === 4 && chosen === 14) card.displayNumberOverride = 14;
    };
    play.cardsTable.forEach(applySetSwitchLabel);
    play.cardsHand.forEach(applySetSwitchLabel);
  } else if (isRolePlay) {
    const switchMap = play?.role?.displayNumberSwitchByCardId;
    if (switchMap && typeof switchMap === 'object') {
      const applyRoleSwitchLabel = (card) => {
        if (!card || card.kind !== 'major' || !card.id) return;
        const target = Number(switchMap[String(card.id)] || 0);
        const n = Number(card.number || 0);
        if (n === 3 && target === 13) card.displayNumberOverride = 13;
        if (n === 4 && target === 14) card.displayNumberOverride = 14;
      };
      play.cardsTable.forEach(applyRoleSwitchLabel);
      play.cardsHand.forEach(applyRoleSwitchLabel);
    }
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
    clearPendingTurnAdvanceAfterTrick();
    pulseKingdomPotAnchor(Math.max(760, callCinematicMs - 140));
    playKingdomCoinEffect(pi, getKingdomCallCoinCount(callFxLevel), '🪙', { className: 'is-call-bet', delayMs: 90 });
    vibrateOnce(65);
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
  clearPendingTurnAdvanceAfterTrick();
  pendingTurnAdvanceAfterTrick = () => {
    if (!s || s.lastPlay !== play || s.trick !== play) return;
    continueAfterPlay(pi, play);
  };
  render();
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

function hasNpcStraightSeed(values) {
  const list = Array.from(new Set((values || []).map((value) => Number(value) || 0).filter((value) => value > 0))).sort((a, b) => a - b);
  if (list.length < 3) return false;
  return (list[list.length - 1] - list[0]) <= 4;
}

function collectNpcRoleSeedInfo(pi) {
  const p = s.players?.[pi];
  if (!p) return new Map();
  const out = new Map();
  const hand = Array.isArray(p.hand) ? p.hand : [];
  const touch = (card, key, amount = 1) => {
    const cardId = card?.id;
    if (!cardId) return;
    let entry = out.get(cardId);
    if (!entry) {
      entry = { flushSeedCount: 0, straightSeedCount: 0 };
      out.set(cardId, entry);
    }
    entry[key] += amount;
  };

  // 3枚以上同スートがある時は、フラッシュの種として残す。
  SUITS.forEach((suit) => {
    const suitCards = hand.filter((card) => suitsForCard(card, true).includes(suit));
    if (suitCards.length >= 3) {
      const weight = Math.max(1, suitCards.length - 2);
      suitCards.forEach((card) => {
        touch(card, 'flushSeedCount', weight);
      });
    }
  });

  // 3枚でストレートの芽が見えるカード群は残す。
  const idxs = hand.map((_, index) => index);
  comb(idxs, 3).forEach((pick) => {
    const pickedCards = pick.map((index) => hand[index]).filter(Boolean);
    if (pickedCards.length !== 3) return;
    const optionRows = pickedCards.map((card) => {
      const expanded = [];
      roleNumberOptions(card).forEach((raw) => {
        const value = Number(raw) || 0;
        if (value <= 0) return;
        expanded.push(value);
        if (value === 15) expanded.push(1);
      });
      return Array.from(new Set(expanded));
    });
    let canSeed = false;
    const walk = (rowIndex, values) => {
      if (canSeed) return;
      if (rowIndex >= optionRows.length) {
        if (hasNpcStraightSeed(values)) canSeed = true;
        return;
      }
      optionRows[rowIndex].forEach((value) => {
        values.push(value);
        walk(rowIndex + 1, values);
        values.pop();
      });
    };
    walk(0, []);
    if (canSeed) {
      pickedCards.forEach((card) => {
        touch(card, 'straightSeedCount', 1);
      });
    }
  });

  return out;
}

function collectNpcRoleSeedCardIds(pi) {
  const out = new Set();
  collectNpcRoleSeedInfo(pi).forEach((entry, cardId) => {
    if ((Number(entry?.flushSeedCount || 0) + Number(entry?.straightSeedCount || 0)) > 0) {
      out.add(cardId);
    }
  });
  return out;
}

function collectNpcSingleOnlyCardIds(pi, calls, roles, sets) {
  const p = s.players?.[pi];
  if (!p) return new Set();
  const multiUse = new Set();
  const roleSeedInfo = collectNpcRoleSeedInfo(pi);
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
    if (!card?.id) return;
    if (card.kind === 'major' || isMinorAceCard(card)) return;
    if (multiUse.has(card.id)) return;
    if (roleSeedInfo.has(card.id)) return;
    out.add(card.id);
  });
  return out;
}

function summarizeNpcHandPotential(playerIndex) {
  const p = s?.players?.[playerIndex];
  if (!p) {
    return {
      roleCount: 0,
      pairOrMoreCount: 0,
      strongSingleCount: 0,
      deadSingleCount: 0,
      majorCount: 0
    };
  }
  const roles = roleMoves(playerIndex);
  const sets = setMoves(playerIndex);
  const singleOnlyIds = collectNpcSingleOnlyCardIds(playerIndex, [], roles, sets);
  const singleMoves = sets.filter((play) => Number(play?.count || 0) === 1);
  const pairOrMoreMoves = sets.filter((play) => Number(play?.count || 0) >= 2);
  const strongSingles = singleMoves.filter((play) => {
    const power = Number(play?.setPower ?? play?.number ?? 0);
    return power >= 13 || (play?.cardsHand?.[0]?.kind === 'major' && power >= 10);
  });
  const deadSingles = singleMoves.filter((play) => {
    const cardId = play?.cardsHand?.[0]?.id;
    return !!cardId && singleOnlyIds.has(cardId);
  });
  return {
    roleCount: roles.length,
    pairOrMoreCount: pairOrMoreMoves.length,
    strongSingleCount: strongSingles.length,
    deadSingleCount: deadSingles.length,
    majorCount: (p.hand || []).filter((card) => card?.kind === 'major').length
  };
}

function getNpcPlayCardStats(play) {
  const cards = Array.isArray(play?.cardsHand) ? play.cardsHand : [];
  let majorCount = 0;
  let aceCount = 0;
  let maxStrength = 0;
  let totalStrength = 0;
  cards.forEach((card) => {
    if (!card) return;
    if (card.kind === 'major') majorCount += 1;
    if (isMinorAceCard(card)) aceCount += 1;
    const strength = Number(cStrength(card) || 0);
    if (strength > maxStrength) maxStrength = strength;
    totalStrength += strength;
  });
  return { majorCount, aceCount, maxStrength, totalStrength };
}

function createNpcReserveContext(pi, calls = [], roles = [], sets = []) {
  const p = s.players?.[pi];
  const byCardId = new Map();
  const roleSeedInfo = collectNpcRoleSeedInfo(pi);
  const ensureEntry = (card) => {
    const cardId = card?.id;
    if (!cardId) return null;
    let entry = byCardId.get(cardId);
    if (!entry) {
      entry = {
        callCount: 0,
        roleCount: 0,
        multiSetCount: 0,
        flushSeedCount: 0,
        straightSeedCount: 0,
        isMajor: card?.kind === 'major',
        isAce: isMinorAceCard(card)
      };
      byCardId.set(cardId, entry);
    }
    return entry;
  };
  const bumpCards = (play, key) => {
    (play?.cardsHand || []).forEach((card) => {
      const entry = ensureEntry(card);
      if (entry) entry[key] += 1;
    });
  };
  (p?.hand || []).forEach((card) => {
    const entry = ensureEntry(card);
    if (!entry) return;
    const seed = roleSeedInfo.get(card.id);
    if (seed) {
      entry.flushSeedCount = Number(seed.flushSeedCount || 0);
      entry.straightSeedCount = Number(seed.straightSeedCount || 0);
    }
  });
  (calls || []).forEach((play) => bumpCards(play, 'callCount'));
  (roles || []).forEach((play) => bumpCards(play, 'roleCount'));
  (sets || []).forEach((play) => {
    if (Number(play?.count || 0) >= 2) bumpCards(play, 'multiSetCount');
  });
  const singleOnlyIds = new Set();
  byCardId.forEach((entry, cardId) => {
    const seedWeight = entry.flushSeedCount + entry.straightSeedCount;
    entry.futureUseWeight =
      (entry.roleCount * 20)
      + (entry.callCount * 16)
      + (entry.multiSetCount * 12)
      + (entry.flushSeedCount * 8)
      + (entry.straightSeedCount * 7);
    entry.isProtected = entry.futureUseWeight > 0;
    entry.isSingleOnly = !entry.isProtected && !entry.isMajor && !entry.isAce;
    entry.preserveBias = entry.futureUseWeight + seedWeight + (entry.isMajor ? 5 : 0) + (entry.isAce ? 4 : 0);
    if (entry.isSingleOnly) singleOnlyIds.add(cardId);
  });
  return {
    byCardId,
    singleOnlyIds,
    playStats: new WeakMap()
  };
}

function getNpcPlayReserveStats(play, reserveContext) {
  if (!reserveContext) {
    return {
      preserveBias: 0,
      futureUseWeight: 0,
      protectedCardCount: 0,
      deadSingleCount: 0,
      seedTouchCount: 0,
      roleTouchCount: 0,
      callTouchCount: 0,
      multiSetTouchCount: 0
    };
  }
  const cached = reserveContext.playStats.get(play);
  if (cached) return cached;
  const out = {
    preserveBias: 0,
    futureUseWeight: 0,
    protectedCardCount: 0,
    deadSingleCount: 0,
    seedTouchCount: 0,
    roleTouchCount: 0,
    callTouchCount: 0,
    multiSetTouchCount: 0
  };
  (play?.cardsHand || []).forEach((card) => {
    const entry = reserveContext.byCardId.get(card?.id);
    if (!entry) return;
    out.preserveBias += Number(entry.preserveBias || 0);
    out.futureUseWeight += Number(entry.futureUseWeight || 0);
    if (entry.isProtected) out.protectedCardCount += 1;
    if (entry.isSingleOnly) out.deadSingleCount += 1;
    if ((Number(entry.flushSeedCount || 0) + Number(entry.straightSeedCount || 0)) > 0) out.seedTouchCount += 1;
    if (Number(entry.roleCount || 0) > 0) out.roleTouchCount += 1;
    if (Number(entry.callCount || 0) > 0) out.callTouchCount += 1;
    if (Number(entry.multiSetCount || 0) > 0) out.multiSetTouchCount += 1;
  });
  reserveContext.playStats.set(play, out);
  return out;
}

function compareNpcPlaysForConserve(a, b, aiStyle = NPC_AI_STYLE.BALANCED, reserveContext = null) {
  if (a?.type !== b?.type) {
    if (aiStyle === NPC_AI_STYLE.AGGRESSIVE) {
      if (a?.type === 'role' && b?.type === 'set') return -1;
      if (a?.type === 'set' && b?.type === 'role') return 1;
    } else {
      if (a?.type === 'role' && b?.type === 'set') return 1;
      if (a?.type === 'set' && b?.type === 'role') return -1;
    }
  }
  const aCount = Number(a?.count || 0);
  const bCount = Number(b?.count || 0);
  if (aCount !== bCount) return aCount - bCount;
  const aReserve = getNpcPlayReserveStats(a, reserveContext);
  const bReserve = getNpcPlayReserveStats(b, reserveContext);
  if (aCount === 1 && bCount === 1 && a?.type === 'set' && b?.type === 'set') {
    if (aReserve.deadSingleCount !== bReserve.deadSingleCount) return bReserve.deadSingleCount - aReserve.deadSingleCount;
  }
  if (aReserve.preserveBias !== bReserve.preserveBias) return aReserve.preserveBias - bReserve.preserveBias;
  if (aReserve.futureUseWeight !== bReserve.futureUseWeight) return aReserve.futureUseWeight - bReserve.futureUseWeight;
  if (aReserve.protectedCardCount !== bReserve.protectedCardCount) return aReserve.protectedCardCount - bReserve.protectedCardCount;
  if (aReserve.seedTouchCount !== bReserve.seedTouchCount) return aReserve.seedTouchCount - bReserve.seedTouchCount;
  if (aReserve.roleTouchCount !== bReserve.roleTouchCount) return aReserve.roleTouchCount - bReserve.roleTouchCount;
  if (aReserve.callTouchCount !== bReserve.callTouchCount) return aReserve.callTouchCount - bReserve.callTouchCount;
  if (aReserve.multiSetTouchCount !== bReserve.multiSetTouchCount) return aReserve.multiSetTouchCount - bReserve.multiSetTouchCount;
  if (a?.type === 'role' && b?.type === 'role') {
    const roleCmp = compareRole(a?.role, b?.role);
    if (roleCmp !== 0) return roleCmp;
  } else if (a?.type === 'set' && b?.type === 'set') {
    const setOrder = setCmp(a?.setPower ?? a?.number, b?.setPower ?? b?.number);
    if (setOrder !== 0) return setOrder;
  }
  const aStats = getNpcPlayCardStats(a);
  const bStats = getNpcPlayCardStats(b);
  if (aStats.majorCount !== bStats.majorCount) return aStats.majorCount - bStats.majorCount;
  if (aStats.aceCount !== bStats.aceCount) return aStats.aceCount - bStats.aceCount;
  if (aStats.maxStrength !== bStats.maxStrength) return aStats.maxStrength - bStats.maxStrength;
  if (aStats.totalStrength !== bStats.totalStrength) return aStats.totalStrength - bStats.totalStrength;
  return Number(a?.suitTier || 0) - Number(b?.suitTier || 0);
}

function pickNpcOpeningSinglePlay(pi, sets, reserveContext) {
  if (!Array.isArray(sets) || !sets.length || !reserveContext?.singleOnlyIds?.size) return null;
  const aiStyle = getNpcAiStyle(pi);
  const candidates = sets.filter((play) => {
    if (play?.type !== 'set' || Number(play.count) !== 1) return false;
    const cardId = play?.cardsHand?.[0]?.id;
    return !!cardId && reserveContext.singleOnlyIds.has(cardId);
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => compareNpcPlaysForConserve(a, b, aiStyle, reserveContext));
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
  const aiStyle = getNpcAiStyle(pi);
  const p = s.players[pi], calls = callMoves(pi), sets = setMoves(pi), roles = roleMoves(pi);
  const reserveContext = createNpcReserveContext(pi, calls, roles, sets);
  if (s.callOnly) {
    if (!calls.length) return { action: 'pass' };
    const outNow = calls.find((m) => m.selected.length === p.hand.length);
    if (outNow) return { action: 'play', play: outNow };
    calls.sort((a, b) => compareNpcPlaysForConserve(a, b, aiStyle, reserveContext));
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
    const openingSingle = pickNpcOpeningSinglePlay(pi, sets, reserveContext);
    if (openingSingle) return { action: 'play', play: openingSingle };
  }
  sortNpcPlayCandidates(all, aiStyle, reserveContext);
  return { action: 'play', play: all[0] };
}

function sortNpcPlayCandidates(all, aiStyle = NPC_AI_STYLE.BALANCED, reserveContext = null) {
  all.sort((a, b) => compareNpcPlaysForConserve(a, b, aiStyle, reserveContext));
  return all;
}

function pickBestNpcLeadPlay(pi) {
  const sets = setMoves(pi);
  const roles = roleMoves(pi);
  const reserveContext = createNpcReserveContext(pi, [], roles, sets);
  if (isNpcOpeningPhase(pi)) {
    const openingSingle = pickNpcOpeningSinglePlay(pi, sets, reserveContext);
    if (openingSingle) return openingSingle;
  }
  const all = [...roles, ...sets];
  if (!all.length) return null;
  return sortNpcPlayCandidates(all, getNpcAiStyle(pi), reserveContext)[0] || null;
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
        scheduleNpc();
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
    const delayMs = getNpcActionDelayMs('draw');
    traceKingdomFlow('scheduleNpc.timer', `reason=draw player=${s.pendingDraw} delay=${delayMs}`);
    scheduleNpcTimer(delayMs, () => npcAct());
    return;
  }
  if (s.phase === 'judgment' && s.pendingJudgment != null && isNpcPlayer(s.pendingJudgment)) {
    const delayMs = getNpcActionDelayMs('judgment');
    traceKingdomFlow('scheduleNpc.timer', `reason=judgment player=${s.pendingJudgment} delay=${delayMs}`);
    scheduleNpcTimer(delayMs, () => npcAct());
    return;
  }
  if (s.phase !== 'turn') {
    traceKingdomFlow('scheduleNpc.abort', `reason=phase:${s.phase}`);
    return;
  }
  if (isNpcPlayer(s.turn)) {
    const delayMs = getNpcActionDelayMs('turn');
    traceKingdomFlow('scheduleNpc.timer', `reason=turn player=${s.turn} delay=${delayMs}`);
    scheduleNpcTimer(delayMs, () => npcAct());
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
    } else if (SPECIAL_SUIT[Number(card.number)]) {
      const arcanaSuit = SPECIAL_SUIT[Number(card.number)];
      el.classList.add('arcana-suit-hybrid');
      el.classList.add(`arcana-suit-${String(arcanaSuit).toLowerCase()}`);
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
  const displayNumberOptions = getCardDisplayNumberOptions(card);
  if (card?.kind === 'major' && Array.isArray(displayNumberOptions) && displayNumberOptions.length > 1) {
    power.classList.add('is-center-range');
  }
  if (opt.numberRolling || shouldRollCardNumber(card)) {
    power.classList.add('is-rolling');
  }
  power.textContent = getCardNumberLabel(card);
  el.appendChild(art); el.appendChild(label); el.appendChild(power);
  if (opt.onClick) el.addEventListener('click', opt.onClick);
  return el;
}

function isKingdomMatchDoneState(state = s) {
  if (!state) return false;
  if (String(state.phase || '') === 'done') return true;
  return state.champion != null && !state.roundActive && !state.awaitRoundConfirm && !!state.roundSettlement;
}

function renderPlayers() {
  const settlementData = s?.roundSettlement || null;
  const isMatchDone = isKingdomMatchDoneState(s);
  const showRankingMedals = isMatchDone;
  ui.players.innerHTML = '';
  if (settlementData) {
    const winnerName = String(settlementData.winnerName || pName(Number(settlementData.winnerIndex)));
    const shownGain = Math.max(0, Number(settlementData.displayTotalGain ?? settlementData.totalGain) || 0);
    const summary = document.createElement('div');
    summary.className = 'tarot-kingdom-players-summary';
    summary.textContent = isMatchDone
      ? `最終結果: ${winnerName} +${shownGain}TP`
      : `局結果: ${winnerName} +${shownGain}TP`;
    ui.players.appendChild(summary);
  }
  const rankByIndex = new Map();
  if (showRankingMedals) {
    getKingdomChipRanking().forEach((entry) => {
      rankByIndex.set(entry.index, entry);
    });
  }
  const callOwner = (s.phase === 'callCinematic' && s.callMergeFx?.owner != null)
    ? Number(s.callMergeFx.owner)
    : null;
  const settlementRowsByPayer = new Map();
  if (settlementData && Array.isArray(settlementData.rows)) {
    settlementData.rows.forEach((row) => {
      const idx = Number(row?.payerIndex);
      if (Number.isInteger(idx)) settlementRowsByPayer.set(idx, row);
    });
  }
  const activeTurnPlayer = getActiveTurnPlayerIndex();
  s.players.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'tarot-kingdom-player-row';
    if (settlementData) row.classList.add('is-settlement');
    row.dataset.playerIndex = String(i);
    row.id = `tarotKingdomPlayerAnchor-${i}`;
    const rankInfo = showRankingMedals ? (rankByIndex.get(i) || null) : null;
    if (rankInfo?.rank === 1) row.classList.add('is-rank-first');
    if (isMatchDone && i === Number(s?.champion)) row.classList.add('is-rank-champion');
    const isLastOne = !settlementData && Number(p?.hand?.length || 0) === 1;
    if (i === activeTurnPlayer) row.classList.add('is-turn');
    if (isLocalPlayer(i)) row.classList.add('is-human');
    if (isLastOne) row.classList.add('is-last-one');
    if (callOwner != null) {
      if (i === callOwner) row.classList.add('is-call-focus');
      else row.classList.add('is-call-dim');
    }
    const left = document.createElement('div');
    left.className = 'tarot-kingdom-player-name';
    const isSettlementWinner = !!settlementData && i === Number(settlementData.winnerIndex);
    const starCount = Math.max(
      0,
      Number(p.stars) || 0,
      isSettlementWinner
        ? (Math.max(0, Number(settlementData.starBonus) || 0) + Math.max(0, Number(settlementData.oracleHits) || 0))
        : 0
    );
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
    const settlementPayerRow = settlementRowsByPayer.get(i) || null;
    const shownChips = (() => {
      if (settlementPayerRow) return Math.max(0, Number(settlementPayerRow.displayPayerChips ?? settlementPayerRow.payerFinalChips ?? p.chips) || 0);
      if (isSettlementWinner) return Math.max(0, Number(settlementData.displayWinnerChips ?? settlementData.winnerFinalChips ?? p.chips) || 0);
      return Math.max(0, Number(p.chips) || 0);
    })();
    const chipsMeta = document.createElement('span');
    chipsMeta.className = settlementData
      ? 'tarot-kingdom-meta-chips is-settlement'
      : 'tarot-kingdom-meta-chips';
    chipsMeta.textContent = `${shownChips}チップ`;
    if (!settlementData) {
      const handMeta = document.createElement('span');
      handMeta.className = 'tarot-kingdom-meta-hand';
      if (handCount <= 3) handMeta.classList.add('is-low');
      if (handCount <= 1) handMeta.classList.add('is-critical');
      handMeta.textContent = `手札${handCount}`;
      const slash = document.createElement('span');
      slash.className = 'tarot-kingdom-meta-sep';
      slash.textContent = '/';
      right.appendChild(handMeta);
      right.appendChild(slash);
    }
    right.appendChild(chipsMeta);
    let settleFloat = null;
    if (settlementPayerRow) {
      const pay = Math.max(0, Number(settlementPayerRow.pay) || 0);
      if (pay > 0) {
        settleFloat = document.createElement('span');
        settleFloat.className = 'tarot-kingdom-settle-float is-loss';
        settleFloat.textContent = `-${pay}TP`;
      }
    } else if (isSettlementWinner) {
      const gain = Math.max(0, Number(settlementData.displayTotalGain ?? settlementData.totalGain) || 0);
      if (gain > 0) {
        settleFloat = document.createElement('span');
        settleFloat.className = 'tarot-kingdom-settle-float is-gain';
        settleFloat.textContent = `+${gain}TP`;
      }
    }
    if (settleFloat) row.classList.add('has-settle-float');
    if (showRankingMedals) {
      if (rankInfo?.medal) {
        const medal = document.createElement('span');
        medal.className = 'tarot-kingdom-rank-medal';
        medal.textContent = rankInfo.medal;
        medal.title = `総合${rankInfo.rank}位`;
        right.appendChild(medal);
      }
    }
    row.appendChild(left);
    row.appendChild(right);
    if (settleFloat) row.appendChild(settleFloat);
    ui.players.appendChild(row);
  });
}

function renderTrick() {
  const cards = s.trick?.cardsTable || [];
  syncKingdomTrickSceneClass();
  let ramSettleFirstCard = false;
  const resolvePendingAfterTrick = () => {
    if (typeof pendingTurnAdvanceAfterTrick !== 'function') return;
    const fn = pendingTurnAdvanceAfterTrick;
    pendingTurnAdvanceAfterTrick = null;
    try {
      fn();
    } catch (error) {
      console.warn('[tarotKingdom] resolve pending turn advance failed:', error);
    }
  };
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
  const nextIdentityKey = cards.length
    ? cards.map((c) => [
        String(c?.id || ''),
        String(c?.kind || ''),
        String(c?.suit || ''),
        String(c?.number ?? '')
      ].join(':')).join('|')
    : '__empty__';
  const nextKey = cards.length
    ? cards.map((c) => [
        String(c?.id || ''),
        String(c?.kind || ''),
        String(c?.suit || ''),
        String(c?.number ?? ''),
        String(c?.displayNumberOverride ?? ''),
        String(c?.displayNumberLabelOverride ?? '')
      ].join(':')).join('|')
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
  if (nextIdentityKey === trickRenderIdentityKey) {
    trickRenderKey = nextKey;
    renderNow();
    return;
  }
  trickRenderIdentityKey = nextIdentityKey;
  trickRenderKey = nextKey;

  if (trickSwapTimer) {
    clearTimeout(trickSwapTimer);
    trickSwapTimer = null;
  }
  const prevCards = Array.from(ui.trick.querySelectorAll('.tarot-card:not(.tarot-kingdom-trick-emphasis-card)'));
  const defeatFxRaw = String(s?.trickDefeatFx?.kind || 'normal');
  const defeatFxKind = ['normal', 'slash', 'rock', 'water', 'fire', 'arcana'].includes(defeatFxRaw)
    ? defeatFxRaw
    : 'normal';
  const arcanaFx = s?.trickDefeatFx?.arcana || null;
  const transitionKind = String(s?.trickTransitionKind || '');
  const isCallTransition = transitionKind === 'callSteal';
  const isRoleClashTransition = transitionKind === 'roleClash';
  const callOwner = Number.isInteger(Number(s?.trick?.owner)) ? Number(s.trick.owner) : -1;
  const currentPlay = s?.trick || null;
  const attackCard = getAttackKeyCardFromPlay(currentPlay) || cards[0] || null;
  const shakeLevel = getKingdomDefeatShakeLevel(currentPlay, defeatFxKind, transitionKind);
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
      const ramFx = playKingdomRamAttackFx(callOwner, attackCard, prevCards[0], {
        fromPoint: getKingdomTrickRightSourcePoint() || undefined,
        delayMs: hitStopMs,
        durationMs: ramMs,
        keepAfterHit: true
      });
      const clashMs = playKingdomRoleClashFx(callOwner, attackCard, prevCards[0], { delayMs: hitStopMs + 8, inMs: 240, holdMs: 70, outMs: 210 });
      const preDefeatMs = Math.max(260, clashMs);
      const profile = getKingdomDefeatTimingProfile(defeatFxKind, { shakeLevel, roleClash: true });
      const staggerMs = profile.staggerMs;
      const isArcanaDefeat = isMajorAttackFx(arcanaFx);
      const markerEmoji = getDefeatMarkerEmoji(defeatFxKind, arcanaFx);
      const markerPerCard = !!markerEmoji;
      const baseMs = profile.cardMs;
      const markerMs = markerPerCard ? profile.markerMs : 0;
      setTimeout(() => runIfCurrent(() => triggerKingdomTrickShake(Math.max(2, shakeLevel))), hitStopMs + 210);
      setTimeout(() => runIfCurrent(() => {
        const leadArcanaFx = isArcanaDefeat ? arcanaFx : null;
        if (leadArcanaFx?.leadEmoji) {
          spawnKingdomArcanaLeadFx(prevCards[0], leadArcanaFx, { delayMs: 0, durationMs: Math.max(profile.activeMs + 160, Number(leadArcanaFx.heroDurationMs) || 0) });
        }
        prevCards.forEach((node, idx) => {
          if (!node) return;
          if (defeatFxKind === 'slash') {
            spawnKingdomSlashSplitFx(node, {
              delayMs: (idx * staggerMs) + profile.splitLeadMs,
              durationMs: profile.splitMs
            });
          } else if (defeatFxKind === 'rock' || defeatFxKind === 'water' || defeatFxKind === 'fire') {
            spawnKingdomDefeatParticles(node, defeatFxKind, {
              delayMs: (idx * staggerMs) + profile.particleLeadMs,
              markerEmoji
            });
          }
          node.classList.remove('is-entering', 'is-call-arriving', 'is-leaving');
          clearArcanaDefeatPatternClasses(node);
          node.classList.add('is-defeat-transition', `is-defeat-${defeatFxKind}`);
          if (defeatFxKind === 'arcana') {
            const arcanaPatternClass = getArcanaDefeatPatternClass(arcanaFx);
            if (arcanaPatternClass) node.classList.add(arcanaPatternClass);
          }
          if (markerPerCard) node.classList.add('is-defeat-primary');
          else node.classList.remove('is-defeat-primary');
          applyKingdomDefeatMarkerEmoji(node, markerPerCard ? markerEmoji : '');
          node.style.animationDelay = `${idx * staggerMs}ms`;
          node.style.setProperty('--defeat-card-ms', `${baseMs}ms`);
          if (markerPerCard) node.style.setProperty('--defeat-marker-ms', `${markerMs}ms`);
          else node.style.removeProperty('--defeat-marker-ms');
        });
      }), preDefeatMs);
      const swapHoldMs = profile.visualEndMs;
      trickSwapTimer = setTimeout(() => {
        if (swapToken !== trickRenderToken) return;
        trickSwapTimer = null;
        settleKingdomIncomingFirstCard(
          ramFx,
          runIfCurrent,
          () => {
            ramSettleFirstCard = true;
            renderNow();
          },
          resolvePendingAfterTrick,
          profile.settleMs
        );
      }, preDefeatMs + swapHoldMs);
      return;
    }
    const isSpecial = defeatFxKind !== 'normal';
    const hitStopMs = 80;
    const ramMs = (isSpecial ? 236 : 208) + (shakeLevel * 22);
    const preDefeatMs = hitStopMs + ramMs + 40;
    const profile = getKingdomDefeatTimingProfile(defeatFxKind, { shakeLevel });
    const staggerMs = profile.staggerMs;
    const baseMs = profile.cardMs;
    const isArcanaDefeat = isMajorAttackFx(arcanaFx);
    const markerEmoji = getDefeatMarkerEmoji(defeatFxKind, arcanaFx);
    const markerPerCard = !!markerEmoji;
    const markerMs = markerPerCard ? profile.markerMs : 0;
    const runIfCurrent = (fn) => {
      if (swapToken !== trickRenderToken) return;
      fn();
    };
    ui.trick.classList.add('is-hit-stop');
    setTimeout(() => runIfCurrent(() => ui.trick.classList.remove('is-hit-stop')), hitStopMs);
    const ramFx = playKingdomRamAttackFx(Number(s?.trick?.owner ?? -1), attackCard, prevCards[0], {
      fromPoint: getKingdomTrickRightSourcePoint() || undefined,
      delayMs: hitStopMs,
      durationMs: ramMs,
      keepAfterHit: true
    });
    setTimeout(() => runIfCurrent(() => triggerKingdomTrickShake(shakeLevel)), hitStopMs + ramMs - 18);
    setTimeout(() => runIfCurrent(() => {
      const leadArcanaFx = isArcanaDefeat ? arcanaFx : null;
      if (leadArcanaFx?.leadEmoji) {
        spawnKingdomArcanaLeadFx(prevCards[0], leadArcanaFx, { delayMs: 0, durationMs: Math.max(profile.activeMs + 160, Number(leadArcanaFx.heroDurationMs) || 0) });
      }
      prevCards.forEach((node, idx) => {
        if (!node) return;
        if (defeatFxKind === 'slash') {
          spawnKingdomSlashSplitFx(node, {
            delayMs: (idx * staggerMs) + profile.splitLeadMs,
            durationMs: profile.splitMs
          });
        } else if (defeatFxKind === 'rock' || defeatFxKind === 'water' || defeatFxKind === 'fire') {
          spawnKingdomDefeatParticles(node, defeatFxKind, {
            delayMs: (idx * staggerMs) + profile.particleLeadMs,
            markerEmoji
          });
        }
        node.classList.remove('is-entering', 'is-call-arriving', 'is-leaving');
        clearArcanaDefeatPatternClasses(node);
        node.classList.add('is-defeat-transition', `is-defeat-${defeatFxKind}`);
        if (defeatFxKind === 'arcana') {
          const arcanaPatternClass = getArcanaDefeatPatternClass(arcanaFx);
          if (arcanaPatternClass) node.classList.add(arcanaPatternClass);
        }
        if (markerPerCard) node.classList.add('is-defeat-primary');
        else node.classList.remove('is-defeat-primary');
        applyKingdomDefeatMarkerEmoji(node, markerPerCard ? markerEmoji : '');
        node.style.animationDelay = `${idx * staggerMs}ms`;
        node.style.setProperty('--defeat-card-ms', `${baseMs}ms`);
        if (markerPerCard) node.style.setProperty('--defeat-marker-ms', `${markerMs}ms`);
        else node.style.removeProperty('--defeat-marker-ms');
      });
    }), preDefeatMs);
    const swapHoldMs = profile.visualEndMs;
    trickSwapTimer = setTimeout(() => {
      if (swapToken !== trickRenderToken) return;
      trickSwapTimer = null;
        settleKingdomIncomingFirstCard(
          ramFx,
          runIfCurrent,
          () => {
            ramSettleFirstCard = true;
            renderNow();
          },
          resolvePendingAfterTrick,
          profile.settleMs
        );
      }, preDefeatMs + swapHoldMs);
      return;
  }
  if (prevCards.length > 0 && cards.length === 0 && transitionKind === 'clearSweep') {
    trickRenderToken += 1;
    const swapToken = trickRenderToken;
    const runIfCurrent = (fn) => {
      if (swapToken !== trickRenderToken) return;
      fn();
    };
    const sweepMs = 420;
    const staggerMs = 26;
    const baseMs = 260;
    const tailMs = Math.max(0, (prevCards.length - 1) * staggerMs);
    ui.trick.classList.remove('is-clear-sweep');
    void ui.trick.offsetWidth;
    ui.trick.classList.add('is-clear-sweep');
    prevCards.forEach((node, idx) => {
      if (!node) return;
      node.classList.remove('is-entering', 'is-call-arriving', 'is-leaving');
      node.classList.add('is-clear-sweep-leaving');
      node.style.animationDelay = `${idx * staggerMs}ms`;
      node.style.setProperty('--clear-card-ms', `${baseMs}ms`);
    });
    trickSwapTimer = setTimeout(() => {
      if (swapToken !== trickRenderToken) return;
      trickSwapTimer = null;
      runIfCurrent(() => {
        ui.trick.classList.remove('is-clear-sweep');
        renderNow();
        resolvePendingAfterTrick();
      });
    }, sweepMs + baseMs + tailMs + 50);
    return;
  }
  trickRenderToken += 1;
  renderNow();
  resolvePendingAfterTrick();
}

function renderHand() {
  ui.hand.innerHTML = '';
  const me = getLocalPlayerIndex();
  if (me < 0 || !s.players?.[me]) return;
  const now = Date.now();
  const inOpeningDeal = s.roundActive && s.phase === 'openingDeal';
  const openingRevealCount = Math.max(0, Number(s.openingDealRevealCount || 0));
  const openingFlipIndex = Number.isInteger(Number(s.openingDealFlipIndex))
    ? Number(s.openingDealFlipIndex)
    : -1;
  const drawFlipPlayer = Number(s.drawFlipPlayer);
  const drawFlipCardId = String(s.drawFlipCardId || '');
  const drawFlipRevealAt = Number(s.drawFlipRevealAt || 0);
  const drawFlipEndAt = Number(s.drawFlipEndAt || 0);
  const drawFlipActive = !!(!inOpeningDeal && drawFlipCardId && drawFlipPlayer === me && now < drawFlipEndAt);
  const freezeUntil = Number(s.handSortFreezeUntil || 0);
  const freezeActive = freezeUntil > Date.now();
  if (!freezeActive && !inOpeningDeal && !localHandSortDrawLock) applyLocalHandSortMode(false);
  const selected = sanitizeSelected(me);
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
    sanitizeSelected(me);
    clearLocalInfoMessage(false);
    render();
  };
  s.players[me].hand.forEach((c, i) => {
    const isDrawFlipTarget = drawFlipActive && c?.id && String(c.id) === drawFlipCardId;
    let showCard = inOpeningDeal
      ? ((i < openingRevealCount || i === openingFlipIndex) ? c : null)
      : c;
    if (isDrawFlipTarget && now < drawFlipRevealAt) {
      showCard = null;
    }
    const node = cardNode(showCard, {
      clickable: canSelect,
      selected: selected.includes(i),
      onClick: () => onHandTap(i)
    });
    if (inOpeningDeal && i === openingFlipIndex) node.classList.add('is-opening-flip');
    if (isDrawFlipTarget && now >= drawFlipRevealAt) node.classList.add('is-opening-flip');
    ui.hand.appendChild(node);
  });
}

function clearSelectedCards(withMessage = true) {
  if (!s) return;
  if (!s.selected || s.selected.size <= 0) return;
  s.selected.clear();
  if (withMessage) {
    if (s.roundActive && (s.phase === 'turn' || s.phase === 'draw')) setLocalInfoMessage('選択を解除しました。', 1200);
    else clearLocalInfoMessage(false);
  }
  render();
}

function toggleGraveyard() {
  if (!s) return;
  if (s.pendingJudgment != null) {
    kingdomLocalGraveOpen = true;
    render();
    return;
  }
  kingdomLocalGraveOpen = !kingdomLocalGraveOpen;
  setLocalInfoMessage(kingdomLocalGraveOpen ? '墓地を表示します。' : '墓地を閉じました。', 1200);
  render();
}

function renderJudgment() {
  const inJudgment = s.pendingJudgment != null;
  const forceVisible = inJudgment;
  const visible = forceVisible || !!kingdomLocalGraveOpen;
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
              setLocalInfoMessage(`${getCardNameLabel(entry.card)} は ${pName(entry.owner)} が出したカード`, 1800);
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
  const hermitPreviewCard = getVisibleHermitPreviewForLocalPlayer();
  if (ui.oracleCard) {
    ui.oracleCard.innerHTML = '';
    const card = (s.openOracleRevealed && s.openOracleCard) ? s.openOracleCard : null;
    ui.oracleCard.appendChild(cardNode(card, { small: true }));
  }
  if (ui.hiddenOracleCard) {
    ui.hiddenOracleCard.innerHTML = '';
    const hiddenCard = hermitPreviewCard || ((s.hiddenOracleRevealed && s.hiddenOracleCard) ? s.hiddenOracleCard : null);
    ui.hiddenOracleCard.appendChild(cardNode(hiddenCard, { small: true }));
  }
}

function renderSummary() {
  const hermitPreviewCard = getVisibleHermitPreviewForLocalPlayer();
  const me = getLocalPlayerIndex();
  const localSelected = me >= 0 ? sanitizeSelected(me) : [];
  const localStateOverride = me >= 0 ? buildLocalStateTextOverride(me, localSelected) : '';
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
  ui.stateText.textContent = kingdomLocalPriorityMessage || localStateOverride || kingdomLocalInfoMessage || s.message || '';
  if (ui.selectedEffect) {
    ui.selectedEffect.textContent = '';
    ui.selectedEffect.hidden = true;
  }
  if (ui.score) ui.score.textContent = '';
  if (ui.openOracle) {
    if (!s.openOracleCard) ui.openOracle.textContent = '表: なし';
    else if (!s.openOracleRevealed) ui.openOracle.textContent = '表: 未公開';
    else ui.openOracle.textContent = `表: ${getCardNameLabel(s.openOracleCard)} ${s.openOracle != null ? `(オラクル ${getCardNumberLabel({ kind: 'minor', number: s.openOracle, suit: 'None' })})` : '(表オラクルなし)'}`;
  }
  if (ui.hiddenOracle) {
    if (hermitPreviewCard) {
      ui.hiddenOracle.textContent = `予見: ${getCardNameLabel(hermitPreviewCard)} (${getCardNumberLabel(hermitPreviewCard)})`;
    } else {
      ui.hiddenOracle.textContent = s.hiddenOracleCard ? `裏: ${getCardNameLabel(s.hiddenOracleCard)} (${getCardNumberLabel(s.hiddenOracleCard)})` : '裏: 未公開';
    }
  }
  if (ui.log) {
    const logs = Array.isArray(s?.logs) ? s.logs : [];
    ui.log.innerHTML = logs.slice(-28).map((m) => `<div class="tarot-log-row">${m}</div>`).join('');
    ui.log.scrollTop = ui.log.scrollHeight;
  }
}

function dispatchSettlementCoinFxIfNeeded(data) {
  if (!data || data.coinFxDispatched) return;
  if (typeof document === 'undefined') return;
  const winnerIndex = Number(data.winnerIndex);
  const winnerAnchor = document.querySelector(`#tarotKingdomPlayerAnchor-${winnerIndex}`) || getKingdomPlayerAnchor(winnerIndex);
  if (!winnerAnchor) return;

  data.coinFxDispatched = true;
  const targetElement = winnerAnchor;
  (data.coinEvents || []).forEach((event) => {
    const payerIndex = Number(event?.payerIndex);
    const pay = Math.max(0, Number(event?.pay) || 0);
    const count = Math.max(1, Number(event?.coinCount) || 4);
    const delayMs = Math.max(0, Number(event?.delayMs) || 0);
    // 出発タイミングで支払側を減算表示。
    scheduleSettlementCoinFx(() => {
      applySettlementPayerChipDelta(payerIndex, -pay, 220);
    }, delayMs);
    scheduleSettlementCoinFx(() => {
      const fromElement = document.querySelector(`#tarotKingdomPlayerAnchor-${payerIndex}`) || getKingdomPlayerAnchor(payerIndex);
      if (!fromElement || !targetElement) return;
      playKingdomCoinEffect(payerIndex, count, '🪙', {
        sourceElement: fromElement,
        targetElement,
        className: 'is-payout'
      });
    }, delayMs);
    // 到着タイミングで勝者側を加算表示。
    scheduleSettlementCoinFx(() => {
      applySettlementWinnerChipDelta(pay, 280);
    }, delayMs + 520);
  });

  if (data.bonusCoinFx) {
    const bonusDelay = Math.max(0, Number(data.bonusCoinFx.delayMs) || 0);
    const bonusCount = Math.max(1, Number(data.bonusCoinFx.coinCount) || 4);
    const bonusPay = Math.max(0, Number(data.potAward) || 0);
    scheduleSettlementCoinFx(() => {
      playKingdomCoinEffect(winnerIndex, bonusCount, '👑', {
        fromPot: true,
        targetElement,
        className: 'is-payout'
      });
    }, bonusDelay);
    scheduleSettlementCoinFx(() => {
      if (bonusPay > 0) applySettlementWinnerChipDelta(bonusPay, 300);
    }, bonusDelay + 520);
  }
}

function renderSettlement() {
  const confirmButton = ui.settlementConfirmButton;
  const data = s.roundSettlement;
  const isMatchDone = isKingdomMatchDoneState(s);
  const show = !!data || isMatchDone;
  ui.root?.classList.remove('is-settlement-open');
  if (!show) {
    if (confirmButton) {
      confirmButton.hidden = true;
      confirmButton.disabled = true;
    }
    return;
  }

  if (data) dispatchSettlementCoinFxIfNeeded(data);

  if (confirmButton) {
    const canConfirm = !!s.awaitRoundConfirm && !s.roundActive && s.handNo < TOTAL_HANDS && !isMatchDone;
    const canRestart = isMatchDone;
    let restartDisabled = false;
    let restartLabel = 'もう一度ゲームを始める';
    if (kingdomStartMode === 'online') {
      if (!isNetModeActive()) {
        restartLabel = 'オンライン接続をやり直す';
      } else if (!tkNet.isHost) {
        restartLabel = 'ホストの再開を待機中';
        restartDisabled = true;
      } else {
        restartLabel = '同じメンバーでもう一度ゲームを始める';
      }
    }
    confirmButton.hidden = !(canConfirm || canRestart);
    confirmButton.disabled = canConfirm ? false : (canRestart ? restartDisabled : true);
    if (canConfirm) {
      confirmButton.textContent = '確認して次の局へ';
    } else if (canRestart) {
      confirmButton.textContent = restartLabel;
    }
  }
}

function updateButtons() {
  const me = getLocalPlayerIndex();
  if (me < 0 || !s.players?.[me]) {
    if (ui.modeControls) {
      ui.modeControls.hidden = true;
    }
    if (ui.startOnlineButton) {
      ui.startOnlineButton.hidden = true;
      ui.startOnlineButton.disabled = true;
    }
    if (ui.startOfflineButton) {
      ui.startOfflineButton.hidden = true;
      ui.startOfflineButton.disabled = true;
    }
  if (ui.restartButton) {
      ui.restartButton.hidden = true;
      ui.restartButton.disabled = true;
    }
    ui.playButton.disabled = true;
    ui.clearButton.disabled = true;
    if (ui.foldButton) {
      ui.foldButton.disabled = true;
      ui.foldButton.textContent = 'フォールド';
      ui.foldButton.classList.remove('is-major-draw');
    }
    ui.passButton.disabled = true;
    ui.passButton.textContent = 'パス';
    ui.passButton.classList.remove('is-minor-draw');
    ui.drawMinorButton.hidden = true;
    ui.drawMinorButton.disabled = true;
    ui.drawMinorButton.style.display = 'none';
    ui.drawMinorButton.setAttribute('aria-hidden', 'true');
    ui.drawMajorButton.hidden = true;
    ui.drawMajorButton.disabled = true;
    ui.drawMajorButton.style.display = 'none';
    ui.drawMajorButton.setAttribute('aria-hidden', 'true');
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
  const isMatchDone = isKingdomMatchDoneState(s);
  const showModeChoice = shouldShowKingdomModeChoice() && !isMatchDone;
  const isLobbyReadyToStart =
    !s.roundActive &&
    !s.awaitRoundConfirm &&
    Number(s.handNo || 0) <= 0 &&
    !isMatchDone;
  const myTurn = s.roundActive && s.phase === 'turn' && s.turn === me;
  const drawMe = s.roundActive && s.phase === 'draw' && s.pendingDraw === me;
  const canDrawMinor = drawMe && s.minorDeck.length > 0 && myHandCount < START_HAND;
  const canDrawMajor = drawMe && s.majorDeck.length > 0 && myStars > 0 && myHandCount < START_HAND;
  const hasSelected = !!(s.selected && s.selected.size > 0);
  const canClearSelection = hasSelected;
  const canToggleSort = !hasSelected && myHandCount > 1;
  const canPlayNow = myTurn || drawMe;
  const isConnectingOnline = isKingdomOnlineConnecting();
  const showModeControls = showModeChoice;
  if (ui.modeControls) {
    ui.modeControls.hidden = !showModeControls;
  }
  if (ui.startOnlineButton) {
    const showOnlineButton = showModeChoice;
    let onlineLabel = 'オンライン対戦を探す';
    let onlineDisabled = actionLocked;
    if (kingdomStartMode === 'online') {
      if (isConnectingOnline) {
        onlineLabel = 'オンライン接続中';
        onlineDisabled = true;
      } else if (!netMode) {
        onlineLabel = 'オンライン対戦を再試行';
      } else if (!tkNet.isHost) {
        onlineLabel = 'ホストの開始を待機中';
        onlineDisabled = true;
      } else if (isLobbyReadyToStart) {
        onlineLabel = hasVacancy ? '受付を止めて戦いを始める' : 'オンライン対戦を開始';
      } else {
        onlineLabel = 'オンライン対戦を再試行';
      }
    }
    ui.startOnlineButton.hidden = !showOnlineButton;
    ui.startOnlineButton.disabled = !showOnlineButton || onlineDisabled;
    ui.startOnlineButton.textContent = onlineLabel;
    ui.startOnlineButton.classList.toggle('is-selected', kingdomStartMode === 'online');
  }
  if (ui.startOfflineButton) {
    const showOfflineButton = showModeChoice;
    let offlineLabel = 'オフラインで始める';
    let offlineDisabled = actionLocked;
    if (kingdomStartMode === 'online') {
      if (isConnectingOnline) {
        offlineLabel = '接続をやめる';
      } else if (netMode) {
        offlineLabel = tkNet.isHost ? 'オンライン受付をやめる' : '待機をやめる';
      }
    }
    ui.startOfflineButton.hidden = !showOfflineButton;
    ui.startOfflineButton.disabled = !showOfflineButton || offlineDisabled;
    ui.startOfflineButton.textContent = offlineLabel;
    ui.startOfflineButton.classList.toggle('is-selected', kingdomStartMode === 'offline');
  }
  if (ui.restartButton) {
    ui.restartButton.hidden = true;
    ui.restartButton.disabled = true;
    ui.restartButton.classList.remove('is-selected');
  }
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
  if (ui.foldButton) {
    if (drawMe) {
      ui.foldButton.textContent = '★ドロー';
      ui.foldButton.disabled = actionLocked || !canDrawMajor;
    } else {
      ui.foldButton.textContent = kingdomLocalAutoFold ? 'フォールド中' : 'フォールド';
      ui.foldButton.disabled = kingdomLocalAutoFold
        ? false
        : (actionLocked || !(s.roundActive && s.phase === 'turn' && !!s.trick));
    }
    ui.foldButton.classList.toggle('is-ready', !!(!ui.foldButton.disabled && (drawMe || kingdomLocalAutoFold || myTurn)));
    ui.foldButton.classList.toggle('is-active', !drawMe && kingdomLocalAutoFold);
    ui.foldButton.classList.toggle('is-major-draw', drawMe);
  }
  ui.passButton.textContent = drawMe ? 'ドロー' : 'パス';
  ui.passButton.disabled = drawMe ? (actionLocked || !canDrawMinor) : (actionLocked || !myTurn);
  ui.passButton.classList.toggle('is-minor-draw', drawMe);
  ui.drawMinorButton.hidden = true;
  ui.drawMinorButton.disabled = true;
  ui.drawMinorButton.style.display = 'none';
  ui.drawMinorButton.setAttribute('aria-hidden', 'true');
  ui.drawMajorButton.hidden = true;
  ui.drawMajorButton.disabled = true;
  ui.drawMajorButton.style.display = 'none';
  ui.drawMajorButton.setAttribute('aria-hidden', 'true');
  const actionReadyPhase = myTurn || drawMe;
  const popupButtons = [ui.graveToggleButton, ui.foldButton, ui.passButton];
  popupButtons.forEach((btn) => {
    if (!btn) return;
    const isFoldActive = btn === ui.foldButton && kingdomLocalAutoFold;
    const isReady = !!(isFoldActive || (actionReadyPhase && !btn.disabled));
    btn.classList.toggle('is-ready', isReady);
  });
  if (ui.actionPopup) {
    const hasReady = popupButtons.some((btn) => !!btn && btn.classList.contains('is-ready'));
    ui.actionPopup.hidden = isMatchDone;
    ui.actionPopup.classList.toggle('is-human-ready', hasReady);
    ui.actionPopup.classList.toggle('is-call-locked', inCallCinematic);
  }
  if (ui.graveToggleButton) {
    if (s.pendingJudgment != null) {
      ui.graveToggleButton.textContent = '墓地（審判中）';
      ui.graveToggleButton.disabled = true;
    } else {
      ui.graveToggleButton.textContent = kingdomLocalGraveOpen ? '墓地を閉じる' : '墓地を見る';
      ui.graveToggleButton.disabled = actionLocked || !s.roundActive;
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
  queueSyncKingdomViewportHeight();
  syncLocalAutoFoldState();
  resolveReversePersistSuspend();
  enforceLeadTurnInvariant();
  renderSummary();
  setOpenRoomsVisibility(shouldShowOpenRoomsLobby());
  renderPlayers();
  renderSettlement();
  renderOracleCard();
  renderTrick();
  renderHand();
  renderJudgment();
  updateButtons();
  processLocalAutoFold();
  syncHumanTurnCueState();
  if (isNetModeActive() && tkNet.isHost) {
    scheduleOpenRoomHeartbeat();
    queueStatePublish();
  } else {
    clearOpenRoomHeartbeatTimer();
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
  if (s.handNo >= TOTAL_HANDS || isKingdomMatchDoneState(s)) return;
  s.awaitRoundConfirm = false;
  s.roundSettlement = null;
  beginNextRound();
}

function startOrNext() {
  const restartingDoneMatch = !s || isKingdomMatchDoneState(s);
  if (restartingDoneMatch) {
    resetMatch();
  }
  if (!s || s.awaitRoundConfirm) return;
  if (!s.roundActive && s.handNo < TOTAL_HANDS) {
    beginNextRound();
    if (isNetModeActive() && tkNet.isHost) {
      queueStatePublish(true);
    }
  }
}

function canStartKingdomRoundFromLobby() {
  if (!s) return false;
  if (s.awaitRoundConfirm) return false;
  if (s.roundActive) return false;
  if (s.phase === 'done') return false;
  return Number(s.handNo || 0) < TOTAL_HANDS;
}

async function activateKingdomOnlineMode() {
  kingdomStartMode = 'online';
  netManualOfflineMode = false;
  if (!s || (!s.roundActive && !s.awaitRoundConfirm && Number(s.handNo || 0) <= 0)) {
    resetMatch();
  }
  s.message = 'オンライン対戦に接続中です...';
  render();
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
  } else if (!tkNet.enabled && !s.roundActive && Number(s.handNo || 0) <= 0) {
    s.message = 'オンライン接続に失敗しました。もう一度選択してください。';
  }
  render();
  if (tkNet.enabled && tkNet.isHost) {
    queueStatePublish(true);
  }
  refreshOpenRoomsPanel().catch((error) => {
    console.warn('[tarotKingdom] failed to paint open room panel:', error);
  });
}

function activateKingdomOfflineMode(options = {}) {
  const { renderNow = true, message = 'オフライン対戦を開始できます。' } = options;
  kingdomStartMode = 'offline';
  netManualOfflineMode = true;
  teardownTarotKingdomNetwork();
  tkNet.localSeat = 0;
  if (!s || (!s.roundActive && !s.awaitRoundConfirm && Number(s.handNo || 0) <= 0)) {
    resetMatch();
  }
  s.message = message;
  applyPresenceToPlayers();
  if (renderNow) {
    render();
  }
}

function activateAndStartKingdomOfflineMode() {
  activateKingdomOfflineMode({
    renderNow: false,
    message: 'オフライン対戦を開始しています...'
  });
  if (!s) return;
  if (canStartKingdomRoundFromLobby()) {
    beginNextRound();
    return;
  }
  render();
}

function returnToKingdomModeChoice(message = 'オンラインかオフラインを選択してください。') {
  teardownTarotKingdomNetwork();
  kingdomStartMode = '';
  netManualOfflineMode = false;
  resetMatch();
  if (s) {
    s.message = message;
    applyPresenceToPlayers();
    render();
  }
  refreshOpenRoomsPanel().catch((error) => {
    console.warn('[tarotKingdom] failed to paint open room panel:', error);
  });
}

async function removeCurrentOpenRoomIndex() {
  if (!isNetModeActive() || !tkNet.isHost || !netOpenRoomIndexEnabled || !tkNet.roomId) return;
  try {
    await remove(ref(tkNet.db, `${TK_MATCH_ROOT}/openRooms/${tkNet.roomId}`)).catch(() => {});
  } catch (_) {
    // syncOpenRoomIndex will re-open or degrade permission mode if needed
  }
}

async function handleKingdomOnlineStartClick() {
  if (!s) return;
  if (isKingdomOnlineConnecting()) return;
  if (kingdomStartMode !== 'online' || !isNetModeActive()) {
    await activateKingdomOnlineMode();
    return;
  }
  if (!tkNet.isHost) return;
  if (!canStartKingdomRoundFromLobby()) return;
  s.message = '対戦を開始しています...';
  render();
  await removeCurrentOpenRoomIndex();
  await requestHostAction({ type: 'startOrNext' }, () => startOrNext());
}

function handleKingdomOfflineStartClick() {
  if (!s) return;
  const inOnlineLobby = shouldShowOpenRoomsLobby();
  if (kingdomStartMode === 'online' && inOnlineLobby && (isKingdomOnlineConnecting() || isNetModeActive())) {
    returnToKingdomModeChoice('オンライン受付を終了しました。');
    return;
  }
  activateAndStartKingdomOfflineMode();
}

async function handleKingdomRestartClick() {
  if (!s || String(s.phase || '') !== 'done') return;
  if (kingdomStartMode === 'online') {
    if (!isNetModeActive()) {
      await activateKingdomOnlineMode();
      return;
    }
    if (!tkNet.isHost) return;
    s.message = '新しい対戦を準備しています...';
    render();
    await removeCurrentOpenRoomIndex();
    await requestHostAction({ type: 'startOrNext' }, () => startOrNext());
    return;
  }
  s.message = '新しい対戦を準備しています...';
  render();
  startOrNext();
}

function clearOpenRoomHeartbeatTimer() {
  if (netOpenRoomHeartbeatTimer) {
    clearTimeout(netOpenRoomHeartbeatTimer);
    netOpenRoomHeartbeatTimer = null;
  }
}

function scheduleOpenRoomHeartbeat() {
  clearOpenRoomHeartbeatTimer();
  if (!isNetModeActive() || !tkNet.isHost || !netOpenRoomIndexEnabled) return;
  if (!shouldRoomStayOpen()) return;
  netOpenRoomHeartbeatTimer = setTimeout(async () => {
    netOpenRoomHeartbeatTimer = null;
    if (!isNetModeActive() || !tkNet.isHost || !netOpenRoomIndexEnabled) return;
    try {
      await syncOpenRoomIndex();
    } catch (_) {
      // ignore; syncOpenRoomIndex already downgrades permission mode when needed
    }
    scheduleOpenRoomHeartbeat();
  }, TK_OPEN_ROOM_HEARTBEAT_MS);
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
  if (p.hand.length <= 1) return { ok: false, reason: '最後の1枚では使用できません。' };

  p.hand.splice(idx, 1);
  p.stars = Math.max(0, Number(p.stars) || 0) + 2;
  s.selected.clear();
  log(`${pName(pi)}: 吊るされた男で星+2`);
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
  ui.modeControls = document.getElementById('tarotKingdomModeControls');
  ui.openRoomsWrap = document.getElementById('tarotKingdomOpenRooms');
  ui.openRoomsList = document.getElementById('tarotKingdomOpenRoomsList');
  ui.settlementConfirmButton = document.getElementById('tarotKingdomSettlementConfirmButton');
  ui.actionPopup = document.getElementById('tarotKingdomActionPopup');
  if (ui.actionPopup) {
    const stopPopupPropagation = (event) => {
      event?.stopPropagation?.();
    };
    ui.actionPopup.addEventListener('pointerdown', stopPopupPropagation);
    ui.actionPopup.addEventListener('mousedown', stopPopupPropagation);
    ui.actionPopup.addEventListener('touchstart', stopPopupPropagation, { passive: true });
    ui.actionPopup.addEventListener('touchmove', stopPopupPropagation, { passive: true });
    ui.actionPopup.addEventListener('click', stopPopupPropagation);
  }
  ui.startOnlineButton = document.getElementById('tarotKingdomStartOnlineButton');
  ui.startOfflineButton = document.getElementById('tarotKingdomStartOfflineButton');
  ui.restartButton = document.getElementById('tarotKingdomRestartButton');
  ui.playButton = document.getElementById('tarotKingdomPlayButton');
  ui.clearButton = document.getElementById('tarotKingdomClearButton');
  ui.foldButton = document.getElementById('tarotKingdomFoldButton');
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
  bindKingdomViewportWatch();
  queueSyncKingdomViewportHeight();
  ui.startOnlineButton?.addEventListener('click', () => {
    handleKingdomOnlineStartClick().catch((error) => {
      console.warn('[tarotKingdom] online start click failed:', error);
      if (s) {
        s.message = 'オンライン開始に失敗しました。もう一度試してください。';
        render();
      }
    });
  });
  ui.startOfflineButton?.addEventListener('click', () => {
    handleKingdomOfflineStartClick();
  });
  ui.restartButton?.addEventListener('click', () => {
    handleKingdomRestartClick().catch((error) => {
      console.warn('[tarotKingdom] restart click failed:', error);
      if (s) {
        s.message = '再開に失敗しました。もう一度試してください。';
        render();
      }
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
  const requestHumanDraw = (deckType) => {
    const me = getLocalPlayerIndex();
    requestHostAction({ type: 'draw', deckType }, () => {
      if (s?.phase === 'draw' && s.pendingDraw === me) applyDrawChoice(deckType);
    }).catch((error) => {
      console.warn(`[tarotKingdom] draw ${deckType} action failed:`, error);
    });
  };
  ui.passButton?.addEventListener('click', () => {
    const me = getLocalPlayerIndex();
    if (s?.roundActive && s.phase === 'draw' && s.pendingDraw === me) {
      requestHumanDraw('minor');
      return;
    }
    if (!(s?.roundActive && s.phase === 'turn' && s.turn === me)) return;
    requestHostAction({ type: 'pass' }, () => passAction(me)).catch((error) => {
      console.warn('[tarotKingdom] pass action failed:', error);
    });
  });
  ui.foldButton?.addEventListener('click', () => {
    const me = getLocalPlayerIndex();
    if (s?.roundActive && s.phase === 'draw' && s.pendingDraw === me) {
      requestHumanDraw('major');
      return;
    }
    if (kingdomLocalAutoFold) {
      clearLocalAutoFold();
      setLocalInfoMessage('フォールド解除', 900);
      render();
      return;
    }
    if (!s?.roundActive || s.phase !== 'turn') return;
    if (!s.trick) {
      showPlayError('場がある時だけフォールドできます。');
      return;
    }
    kingdomLocalAutoFold = true;
    kingdomLocalAutoFoldPending = false;
    kingdomLocalAutoFoldPrevReverse = !!s.reverse;
    kingdomLocalAutoFoldPrevCallToken = getAutoFoldCallToken(s.lastPlay);
    setLocalInfoMessage('フォールド中: 場が流れるか、11バックか、コールで解除', 1400);
    render();
  });
  ui.drawMinorButton?.addEventListener('click', () => requestHumanDraw('minor'));
  ui.drawMajorButton?.addEventListener('click', () => requestHumanDraw('major'));
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
    if (String(s?.phase || '') === 'done') {
      handleKingdomRestartClick().catch((error) => {
        console.warn('[tarotKingdom] settlement restart failed:', error);
      });
      return;
    }
    requestHostAction({ type: 'confirmRound' }, () => confirmRoundSettlement()).catch((error) => {
      console.warn('[tarotKingdom] confirm round action failed:', error);
    });
  });
  bound = true;
}

export async function loadTarotKingdomPage() {
  bindUi();
  if (kingdomStartMode === 'online') {
    await activateKingdomOnlineMode();
    return;
  }
  if (kingdomStartMode === 'offline') {
    activateKingdomOfflineMode();
    return;
  }
  if (!s) {
    resetMatch();
  }
  s.message = 'オンラインかオフラインを選択してください。';
  applyPresenceToPlayers();
  render();
  refreshOpenRoomsPanel().catch((error) => {
    console.warn('[tarotKingdom] failed to paint open room panel:', error);
  });
}

export function destroyTarotKingdomPage() {
  kingdomStartMode = '';
  netManualOfflineMode = false;
  localHandSortDrawLock = false;
  clearLocalAutoFold();
  kingdomLocalAutoFoldPrevReverse = false;
  if (kingdomLocalPriorityTimer) {
    clearTimeout(kingdomLocalPriorityTimer);
    kingdomLocalPriorityTimer = null;
  }
  kingdomLocalPriorityMessage = '';
  clearSettlementGainFx();
  clearPendingTurnAdvanceAfterTrick();
  clearNpcTimer();
  clearOracleFlipTimers();
  clearCallCinematicTimer();
  clearRoundStartCinematicTimer();
  clearRoundOutCinematicTimer();
  clearOpeningDealTimers();
  clearDrawHandFlipTimers();
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
  clearKingdomTrickSceneFlash(false);
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

  trickRenderKey = '';
  trickRenderIdentityKey = '';
  trickRenderToken += 1;
  npcActInFlight = false;
  teardownTarotKingdomNetwork();
  s = null;
}
