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
const SUIT_COLOR = { Wand: '#b11818', Sword: '#c29b14', Cup: '#1e63c6', Pentacle: '#1e8f3c' };
const SPECIAL_SUIT = { 16: 'Sword', 17: 'Cup', 18: 'Pentacle', 19: 'Wand' };
const ARCANA_NAME = {
  0: '愚者', 1: '魔術師', 2: '女教皇', 3: '女帝', 4: '皇帝', 5: '法王', 6: '恋人', 7: '戦車', 8: '力', 9: '隠者',
  10: '運命の輪', 11: '正義', 12: '吊るされた男', 13: '死神', 14: '節制', 15: '悪魔', 16: '塔', 17: '星', 18: '月', 19: '太陽', 20: '審判', 21: '世界'
};

const PLAYERS = [
  { id: 'you', name: 'あなた', human: true },
  { id: 'npc1', name: 'NPC1', human: false },
  { id: 'npc2', name: 'NPC2', human: false },
  { id: 'npc3', name: 'NPC3', human: false }
];

const START_HAND = 10;
const TOTAL_HANDS = 4;
const START_CHIPS = 30;
const A_PENALTY = 1;
const RAISE_COST = 1;
const NPC_DELAY = 1100;
const NPC_RAISE_FOLLOWUP_DELAY = 900;
const ROUND_START_CINEMATIC_MS = 980;

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
let callCinematicTimer = null;
let roundStartCinematicTimer = null;
let npcScheduleToken = 0;
let npcActInFlight = false;
const KINGDOM_TRACE_ENABLED = true;
let kingdomTraceFlowSeed = 0;
const kingdomRowFxTimers = new Map();

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
const clearOracleFlipTimers = () => {
  if (oracleRevealDelayTimer) { clearTimeout(oracleRevealDelayTimer); oracleRevealDelayTimer = null; }
  if (oracleFlipSwapTimer) { clearTimeout(oracleFlipSwapTimer); oracleFlipSwapTimer = null; }
  if (oracleFlipEndTimer) { clearTimeout(oracleFlipEndTimer); oracleFlipEndTimer = null; }
  ui.oracleCardWrap?.classList.remove('is-flipping');
};
const getKingdomCoinCountByAmount = (amount) => {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  if (n >= 20) return 10;
  if (n >= 12) return 8;
  if (n >= 8) return 7;
  if (n >= 5) return 6;
  if (n >= 3) return 5;
  return 4;
};
const getKingdomMoneyBagCountByPot = (potAmount) => {
  const pot = Math.max(0, Math.floor(Number(potAmount) || 0));
  if (pot >= 80) return 12;
  if (pot >= 50) return 10;
  if (pot >= 30) return 8;
  if (pot >= 15) return 6;
  return 4;
};
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
const isPairLikeRole = (roleKey) => ['FullHouse', 'FourKind', 'FiveKind'].includes(String(roleKey || ''));
const pName = (i) => s.players[i]?.name || `P${i + 1}`;
const hasAceMinor = (cards) => cards.some((c) => c.kind === 'minor' && c.number === 1);
const hasCourt = (c) => { const n = idNum(c); return n >= 11 && n <= 14; };
const openOracleRank = (majorCard) => (!majorCard ? null : (majorCard.number === 1 || majorCard.number === 15 ? 1 : (majorCard.number >= 2 && majorCard.number <= 14 ? majorCard.number : null)));
const suitsForCard = (c, role = false) => c.kind === 'minor' ? [c.suit] : (c.number === 1 ? SUITS.slice() : (SPECIAL_SUIT[c.number] ? [SPECIAL_SUIT[c.number]] : ['None']));
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
      2: '出した瞬間、小アルカナを1枚引く',
      3: '数値3/13の有利側で扱う',
      4: '数値4/14の有利側で扱う',
      5: '全員スキップしてもう一度自分のターン',
      6: 'ペア系の役に混ぜると星+1',
      7: '単騎で2枚出し化（2枚出し縛り）',
      8: '強制クリア',
      9: '次ドロー（小/大）を予見',
      10: '単騎で大アルカナを1枚引く',
      11: '11バック（大アルカナは局内永続）',
      12: '捨てて小アルカナ1枚ドロー',
      13: 'このトリック中、出すたび星-1',
      14: '節制ロック（直前スート縛り）',
      15: 'このトリック中、パスで星-1',
      16: 'ソード最上位札',
      17: 'カップ最上位札',
      18: 'ペンタクル最上位札',
      19: 'ワンド最上位札',
      20: 'このカードでクリア時、墓地から1枚回収',
      21: 'ザ・ワールドの必須札'
    };
    return majorEffectMap[n] || '';
  }
  if (n === 5) return '5スキップ';
  if (n === 8) return '8カット';
  if (n === 11) return '11バック';
  if (n === 14) return '同スートKで14ロック';
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

function showKingdomCardEffectInfo(card, prefix = '効果') {
  if (!s || !card) return;
  const name = getCardNameLabel(card);
  const effectText = getKingdomCardEffectDescription(card);
  s.message = effectText
    ? `${prefix}: ${name} / ${effectText}`
    : `${prefix}: ${name}（固有効果なし）`;
  renderSummary();
}

function showPlayError(reason) {
  if (!s) return;
  const detail = (String(reason || '出せません。').trim()) || '出せません。';
  s.message = `出せない理由: ${detail}`;
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
  return s?.players?.[playerIndex]?.human ? 'is-player' : 'is-cpu';
}

function getKingdomPlayerAnchor(playerIndex) {
  return ui.players?.querySelector?.(`[data-player-index="${playerIndex}"]`) || null;
}

function showKingdomOverlay(kind = 'action') {
  if (!ui.kingdomOverlay) return;
  ui.kingdomOverlay.classList.remove('show', 'is-kingdom-raise', 'is-kingdom-clear', 'is-kingdom-draw', 'is-kingdom-roundend', 'is-kingdom-call');
  if (kind === 'raise') ui.kingdomOverlay.classList.add('is-kingdom-raise');
  else if (kind === 'clear') ui.kingdomOverlay.classList.add('is-kingdom-clear');
  else if (kind === 'draw') ui.kingdomOverlay.classList.add('is-kingdom-draw');
  else if (kind === 'call') ui.kingdomOverlay.classList.add('is-kingdom-call');
  else if (kind === 'roundend') ui.kingdomOverlay.classList.add('is-kingdom-roundend');
  void ui.kingdomOverlay.offsetWidth;
  ui.kingdomOverlay.classList.add('show');
  if (kingdomOverlayTimer) clearTimeout(kingdomOverlayTimer);
  const holdMs = kind === 'roundend' ? 760 : (kind === 'call' ? 620 : 260);
  kingdomOverlayTimer = setTimeout(() => {
    ui.kingdomOverlay?.classList.remove('show', 'is-kingdom-raise', 'is-kingdom-clear', 'is-kingdom-draw', 'is-kingdom-roundend', 'is-kingdom-call');
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
    'is-kingdom-round-end'
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
      'is-kingdom-round-end'
    );
    kingdomCutinTimer = null;
  }, options.durationMs || 680);
}

function flashKingdomPlayerRowAction(playerIndex, label) {
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
  }, 760);
  kingdomRowFxTimers.set(playerIndex, t);
}

function playKingdomCoinEffect(playerIndex, coinCount = 4, symbol = '🪙', options = {}) {
  if (typeof document === 'undefined') return;
  const potAnchor = ui.score || ui.round || ui.root;
  if (!potAnchor) return;
  const sourceEl = options.fromPot ? potAnchor : (getKingdomPlayerAnchor(playerIndex) || ui.hand || potAnchor);
  const targetEl = options.targetPlayerIndex != null
    ? (getKingdomPlayerAnchor(options.targetPlayerIndex) || potAnchor)
    : potAnchor;
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
    if (options.overlay) showKingdomOverlay(options.overlay);
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
  return cmpVec(a.primary, b.primary) || cmpVec(a.suitVec || [], b.suitVec || []);
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
    players: PLAYERS.map((p) => ({ ...p, chips: START_CHIPS, hand: [], discard: [], raise: false, raisePending: false, bet: 0, stars: 0 })),
    handNo: 0,
    turnCount: 0,
    dealer: 0,
    turn: 0,
    phase: 'idle',
    roundActive: false,
    trick: null,
    leadRequiredOwner: null,
    lastPlay: null,
    pass: [false, false, false, false],
    callOnly: false,
    lock: null,
    trickForcedCount: 0,
    death13Active: false,
    devil15Active: false,
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
    pendingDraw: null,
    pendingDrawReason: null,
    pendingJudgment: null,
    callMergeFx: null,
    graveOpen: false,
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
  clearRoundStartCinematicTimer();
  s.trick = null;
  s.leadRequiredOwner = null;
  s.lastPlay = null;
  s.pass = [false, false, false, false];
  s.callOnly = false;
  s.lock = null;
  s.trickForcedCount = 0;
  s.death13Active = false;
  s.devil15Active = false;
  s.hermitPreview = null;
  if (!s.reversePersist) s.reverse = false;
  s.reversePersistSuspendOwner = null;
  s.pendingDraw = null;
  s.pendingDrawReason = null;
  s.pendingJudgment = null;
  s.callMergeFx = null;
  s.graveOpen = false;
  s.selected.clear();
  s.awaitRoundConfirm = false;
  s.roundSettlement = null;
  s.players.forEach((p) => { p.hand = []; p.discard = []; p.raise = false; p.raisePending = false; p.bet = 0; });
}

function resetMatch() {
  s = initState();
  if (trickSwapTimer) { clearTimeout(trickSwapTimer); trickSwapTimer = null; }
  trickRenderKey = '';
  trickRenderToken += 1;
  if (stateErrorTimer) { clearTimeout(stateErrorTimer); stateErrorTimer = null; }
  clearOracleFlipTimers();
  clearCallCinematicTimer();
  clearRoundStartCinematicTimer();
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
    'is-kingdom-round-end'
  );
  ui.kingdomOverlay?.classList.remove('show', 'is-kingdom-raise', 'is-kingdom-clear', 'is-kingdom-draw', 'is-kingdom-roundend');
  s.openOracleCard = shuf(mkMajor())[0] || null;
  s.openOracle = openOracleRank(s.openOracleCard);
  s.openOracleRevealed = false;
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
  clearRoundState();
  if (s.reversePersist) s.reverse = true;
  s.roundActive = true;
  s.phase = 'turn';
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
  playRoundStartCinematic();
}

function playRoundStartCinematic() {
  clearRoundStartCinematicTimer();
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
  if (p.raise) return { ok: false, reason: 'レイズ後は1〜3枚出し不可です。' };
  const forcedCount = Math.max(0, Number(s.trickForcedCount || 0));
  if (forcedCount > 0 && sel.length !== forcedCount) return { ok: false, reason: `${forcedCount}枚出しのみ有効です。` };
  if (![1, 2, 3].includes(sel.length)) return { ok: false, reason: '通常出しは1〜3枚です。' };
  const cards = sel.map((i) => p.hand[i]).filter(Boolean);
  if (cards.length !== sel.length) return { ok: false, reason: '選択が不正です。' };
  const n = chooseSetNumberCandidate(cards, !!s.reverse);
  if (n == null) return { ok: false, reason: '同じ数値で揃えてください。' };
  if (s.lock?.suit && !cards.every((c) => suitsForCard(c, false).includes(s.lock.suit))) return { ok: false, reason: `スート縛り: ${SUIT_LABEL[s.lock.suit]}` };
  const allMagicianOne = Number(n) === 1 && cards.every((c) => c.kind === 'major' && Number(c.number) === 1);
  const setPower = allMagicianOne ? 1 : setRankFromNumber(n);
  if (s.lock?.min != null && cards.length === 1 && setPower <= s.lock.min) return { ok: false, reason: `${s.lock.min}より強いカードが必要です。` };
  const suitTier = Math.max(...cards.map((c) => Math.max(...suitsForCard(c, false).map((x) => suitTierForCard(c, x)))));
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
  if (role.key === 'Straight' && cards.some((c) => idNum(c) === idNum(base))) return { ok: false, reason: 'ストレートコール制限に抵触します。' };
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
  if (remaining.length === 0 && played.length > 0 && played.some((card) => card?.kind === 'major')) {
    return '大アルカナ上がりは禁止です。';
  }
  return null;
}

function validatePlay(play, mode) {
  const aceRuleViolation = getAceFinishRuleViolation(play);
  if (aceRuleViolation) return { ok: false, reason: aceRuleViolation };
  if (s.death13Active) {
    const actor = s.players?.[Number(play?.owner)];
    const stars = Math.max(0, Number(actor?.stars) || 0);
    if (stars <= 0) return { ok: false, reason: '死神効果中は星がないとカードを出せません。' };
  }
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
    return play.suitTier >= s.trick.suitTier ? { ok: true } : { ok: false, reason: '同数値はスート優位が必要です。' };
  }
  return compareRole(play.role, s.trick.role) >= 0 ? { ok: true } : { ok: false, reason: '場より強い役が必要です。' };
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
  if (!actor || actor.human) return 'minor';
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

function skipDrawChoice(playerIndex, note = '') {
  if (s?.pendingDraw !== playerIndex) return;
  s.pendingDraw = null;
  s.pendingDrawReason = null;
  s.phase = 'turn';
  s.message = `${pName(playerIndex)}がドローを見送り`;
  log(note ? `${pName(playerIndex)}: ドロー見送り（${note}）` : `${pName(playerIndex)}: ドロー見送り`);
  scheduleNpc();
  render();
}

function drawChoiceStart(playerIndex, reason = 'normal') {
  s.selected.clear();
  const actor = s.players[playerIndex];
  traceKingdomFlow(
    'drawChoiceStart.enter',
    `player=${playerIndex} hand=${actor?.hand?.length ?? 0} minorDeck=${s.minorDeck.length} majorDeck=${s.majorDeck.length}`
  );
  if ((actor?.hand?.length || 0) >= START_HAND) {
    traceKingdomFlow('drawChoiceStart.skip.fullHand', `player=${playerIndex}`);
    s.pendingDraw = null;
    s.pendingDrawReason = null;
    s.phase = 'turn';
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
    s.pendingDraw = null; s.pendingDrawReason = null; s.phase = 'turn'; s.message = `${pName(playerIndex)}が親です。`; scheduleNpc(); render(); return;
  }
  s.phase = 'draw'; s.message = `${pName(playerIndex)}: 小 or 大アルカナを1枚ドロー`;
  traceKingdomFlow('drawChoiceStart.waitChoice', `player=${playerIndex}`);
  render();
  if (!s.players[playerIndex].human) {
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
  s.selected.clear();
  const opts = judgmentOptions();
  if (!opts.length) { log('審判: 回収候補なし'); drawChoiceStart(playerIndex, 'judgment'); return; }
  s.pendingJudgment = playerIndex; s.phase = 'judgment'; s.message = `${pName(playerIndex)}: 審判で墓地回収`;
  render();
  if (!s.players[playerIndex].human) {
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
  s.death13Active = false;
  s.devil15Active = false;
  s.hermitPreview = null;
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
    if (drew > 0) owner.hand.sort((a, b) => cStrength(a) - cStrength(b));
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
    if (drew > 0) owner.hand.sort((a, b) => cStrength(a) - cStrength(b));
    return drew;
  };
  if (cards.length === 1 && hasMajor(7)) {
    s.trickForcedCount = 2;
    play.count = 2;
    log(`${pName(play.owner)}: 戦車で2枚出し縛り`);
    triggerKingdomActionFx(play.owner, '戦車: 2枚出し', { overlay: 'action', durationMs: 820, cutin: true, cutinClass: 'is-kingdom-lock' });
    playKingdomChariotSplitFx(play.owner, { delayMs: 100 });
  }
  if (hasMajor(13)) {
    s.death13Active = true;
    if (owner) owner.stars = Math.max(0, (Number(owner.stars) || 0) - 1);
    log(`${pName(play.owner)}: 死神効果`);
    triggerKingdomActionFx(play.owner, '死神', { overlay: 'action', durationMs: 820, cutin: true, cutinClass: 'is-kingdom-lock' });
  }
  if (hasMajor(15)) {
    s.devil15Active = true;
    log(`${pName(play.owner)}: 悪魔効果`);
    triggerKingdomActionFx(play.owner, '悪魔', { overlay: 'action', durationMs: 820, cutin: true, cutinClass: 'is-kingdom-lock' });
  }
  if (hasMajor(2)) {
    const drew = drawMinorForEffect(1);
    log(`${pName(play.owner)}: 女教皇で小アルカナ+${drew}`);
    triggerKingdomActionFx(play.owner, `女教皇 +${drew}`, { overlay: 'draw', durationMs: 700, cutin: true });
  }
  if (cards.length === 1 && hasMajor(9)) {
    const minorTop = s.minorDeck[s.minorDeck.length - 1] || null;
    const majorTop = s.majorDeck[s.majorDeck.length - 1] || null;
    s.hermitPreview = { owner: play.owner, minorTop, majorTop, at: Date.now() };
    if (owner?.human) {
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
      keepTurn = true; skip = 3; log(`${pName(play.owner)}: 大アルカナ5で全員スキップ`);
      triggerKingdomActionFx(play.owner, '大アルカナ5', { overlay: 'action', durationMs: 860, cutin: true, cutinClass: 'is-kingdom-skip' });
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
  clearNpcTimer();
  clearCallCinematicTimer();
  s.roundActive = false; s.phase = 'roundEnd'; s.selected.clear(); s.pendingDraw = null; s.pendingJudgment = null;
  s.awaitRoundConfirm = false;
  const winner = s.players[winnerIndex];
  const roundNo = Math.max(1, Number(s.handNo || 0) + 1);
  s.hiddenOracleCard = s.minorDeck.pop() || null;
  const hidden = s.hiddenOracleCard ? idNum(s.hiddenOracleCard) : null;
  const oracleHits = winner.discard.reduce((a, c) => a + ((s.openOracle != null && idNum(c) === s.openOracle) || (hidden != null && idNum(c) === hidden) ? 1 : 0), 0);
  const raiseBonus = winner.raise ? 1 : 0;
  let fxDelayMs = 360;
  let totalGain = 0;
  const settlement = {
    roundNo,
    winnerIndex,
    winnerName: winner.name,
    starBonus: Math.max(0, Number(winner.stars) || 0),
    raiseBonus,
    oracleHits,
    rows: [],
    potAward: 0,
    totalGain: 0
  };
  triggerKingdomActionFx(winnerIndex, '局終了', {
    overlay: 'roundend',
    durationMs: 1160,
    cutin: true,
    cutinClass: 'is-kingdom-round-end'
  });
  log(`${winner.name}がアウト！ 清算開始`);
  s.players.forEach((loser, i) => {
    if (i === winnerIndex) return;
    const remain = loser.hand.length;
    const acePenalty = hasAceMinor(loser.hand) ? A_PENALTY : 0;
    const scoreFactor = 1 + settlement.starBonus + raiseBonus + oracleHits + acePenalty;
    const pay = remain * scoreFactor;
    loser.chips -= pay; winner.chips += pay;
    totalGain += Math.max(0, pay);
    settlement.rows.push({
      payerIndex: i,
      payerName: loser.name,
      receiverIndex: winnerIndex,
      receiverName: winner.name,
      remain,
      starBonus: settlement.starBonus,
      raiseBonus,
      oracleHits,
      acePenalty,
      scoreFactor,
      pay
    });
    log(`${loser.name} -> ${winner.name}: ${pay}（${remain}枚 x 係数${scoreFactor}）`);
    if (pay > 0) {
      playKingdomCoinEffect(i, getKingdomCoinCountByAmount(pay), '🪙', {
        targetPlayerIndex: winnerIndex,
        delayMs: fxDelayMs
      });
      fxDelayMs += 110;
    }
  });
  if (s.pot > 0) {
    const potAward = s.pot;
    winner.chips += potAward;
    totalGain += Math.max(0, potAward);
    settlement.potAward = potAward;
    log(`${winner.name}がPOT ${potAward}獲得`);
    playKingdomCoinEffect(winnerIndex, getKingdomMoneyBagCountByPot(potAward), '💰', {
      fromPot: true,
      targetPlayerIndex: winnerIndex,
      className: 'is-payout',
      delayMs: fxDelayMs + 80
    });
    s.pot = 0;
  }
  settlement.totalGain = totalGain;
  s.roundSettlement = settlement;
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
  s.handNo += 1;
  if (s.handNo >= TOTAL_HANDS) {
    let top = 0; s.players.forEach((p, i) => { if (s.players[i].chips > s.players[top].chips) top = i; });
    s.champion = top;
    s.phase = 'done';
    s.awaitRoundConfirm = false;
    s.message = `ゲーム終了！ 優勝: ${s.players[top].name} (${s.players[top].chips}チップ)`;
    log(s.message);
    render();
    return;
  }
  s.dealer = (s.dealer + 1) % 4;
  s.awaitRoundConfirm = true;
  s.message = `${winner.name}が第${roundNo}局に勝利。清算を確認して次局へ進んでください。次局の親: ${pName(s.dealer)}。`;
  render();
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
    s.pendingDraw = null;
    s.pendingDrawReason = null;
    s.phase = 'turn';
    s.message = `${pName(pi)}は手札上限(${START_HAND}枚)のためドローできません。`;
    log(`${pName(pi)}: 手札上限のためドローなし`);
    scheduleNpc();
    render();
    return;
  }
  s.selected.clear();
  let use = deckType;
  traceKingdomFlow('applyDrawChoice.resolveDeck.start', `player=${pi} requested=${deckType} stars=${Math.max(0, Number(actor.stars) || 0)}`);
  if (use === 'major' && s.majorDeck.length <= 0) use = 'minor';
  if (use === 'minor' && s.minorDeck.length <= 0) use = 'major';
  traceKingdomFlow('applyDrawChoice.resolveDeck.afterFallback', `player=${pi} selected=${use}`);

  // 大アルカナドローは星1消費。星不足なら人間は選べず、NPCは可能なら小アルカナへフォールバック。
  if (use === 'major') {
    const stars = Math.max(0, Number(actor.stars) || 0);
    if (stars <= 0) {
      if (!actor.human && s.minorDeck.length > 0) {
        use = 'minor';
      } else if (actor.human) {
        traceKingdomFlow('applyDrawChoice.abort', `reason=noStars player=${pi}`);
        s.message = '星が足りないため大アルカナを引けません。';
        render();
        return;
      } else {
        traceKingdomFlow('applyDrawChoice.abort', `reason=noStarsNpcNoMinor player=${pi}`);
        s.pendingDraw = null;
        s.pendingDrawReason = null;
        s.phase = 'turn';
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
    actor.hand.sort((a, b) => cStrength(a) - cStrength(b));
    if (use === 'major') actor.stars = Math.max(0, (Number(actor.stars) || 0) - 1);
    log(`${pName(pi)}: ${use === 'major' ? '大' : '小'}アルカナをドロー`);
  }
  const drawByHuman = !!actor?.human;
  triggerKingdomActionFx(pi, use === 'major' ? '大アルカナドロー' : '小アルカナドロー', {
    overlay: drawByHuman ? 'draw' : null,
    durationMs: 620,
    cutin: drawByHuman
  });
  s.pendingDraw = null; s.pendingDrawReason = null; s.phase = 'turn'; s.message = `${pName(pi)}が親です。`;
  traceKingdomFlow('applyDrawChoice.exit', `player=${pi} hand=${actor.hand.length}`);
  scheduleNpc(); render();
}

function applyJudgmentPick(owner, cardIndex) {
  const pi = s.pendingJudgment;
  if (pi == null) return;
  const poolOwner = s.players[owner];
  if (!poolOwner || cardIndex < 0 || cardIndex >= poolOwner.discard.length) return;
  const card = poolOwner.discard.splice(cardIndex, 1)[0];
  s.players[pi].hand.push(card); s.players[pi].hand.sort((a, b) => cStrength(a) - cStrength(b));
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
  if (p.hand.length <= 0) { finishRound(pi); return; }
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

function applyPlay(pi, play, retryDepth = 0) {
  clearCallCinematicTimer();
  const p = s.players[pi];
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
    if (!p.human) {
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
  if (play.call) {
    p.stars = Math.max(0, (Number(p.stars) || 0) - 1);
  }
  if (s.death13Active) {
    p.stars = Math.max(0, (Number(p.stars) || 0) - 1);
    log(`${p.name}: 死神効果で星-1`);
  }
  if (play.type === 'role' && removed.some((c) => c.kind === 'major' && c.number === 6) && isPairLikeRole(play.role?.key)) {
    p.stars = Math.max(0, Number(p.stars) || 0) + 1;
    log(`${p.name}: 恋人効果で星+1`);
    triggerKingdomActionFx(pi, '恋人: 星+1', { overlay: 'draw', durationMs: 640, cutin: true });
  }
  // レイズ待機中: 出した結果で手札が4枚になった瞬間にレイズ成立（演出あり）
  if (p.raisePending && !p.raise && p.hand.length === 4) {
    if (p.chips >= RAISE_COST) {
      p.raisePending = false;
      p.raise = true;
      p.chips -= RAISE_COST;
      p.bet += RAISE_COST;
      s.pot += RAISE_COST;
      log(`${p.name}: レイズ成立 (+${RAISE_COST}ベット)`);
      triggerKingdomActionFx(pi, 'レイズ成立', { overlay: 'raise', durationMs: 760, cutin: true, coinCount: 6 });
    } else {
      p.raisePending = false;
      log(`${p.name}: レイズ失敗（チップ不足）`);
      s.message = `${p.name}: チップ不足でレイズ成立できませんでした。`;
    }
  }
  s.selected.clear();
  s.pass = [false, false, false, false];
  s.trick = play;
  play.prevLeadSuit = prevLeadSuit;
  s.leadRequiredOwner = null;
  s.lastPlay = play;
  s.turn = pi;
  s.callMergeFx = isCallPlay ? { owner: pi, startedAt: Date.now() } : null;
  log(`${p.name}: ${play.type === 'set' ? `${play.count}枚出し` : getRoleDisplayLabel(play)}`);
  const actionLabel = play.type === 'set'
    ? `${play.count}枚出し`
    : getRoleDisplayLabel(play);
  triggerKingdomActionFx(pi, actionLabel, {
    overlay: isCallPlay ? 'call' : 'action',
    durationMs: isCallPlay ? 1400 : (isRolePlay ? 980 : 700),
    cutin: isRolePlay,
    cutinClass: isCallPlay ? 'is-kingdom-call' : (isRolePlay ? 'is-kingdom-role' : undefined),
    delayMs: isCallPlay ? 90 : (isRolePlay ? 180 : 0)
  });

  if (isCallPlay) {
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
    }, 1220);
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
    if (!s?.players?.[pi]?.human) scheduleNpc();
    return;
  }
  s.pass[pi] = true; log(`${pName(pi)}: パス`);
  if (s.devil15Active) {
    const player = s.players?.[pi];
    if (player) {
      player.stars = Math.max(0, (Number(player.stars) || 0) - 1);
      log(`${pName(pi)}: 悪魔効果でパス時に星-1`);
    }
  }
  s.selected.clear();
  const passByHuman = !!s.players[pi]?.human;
  triggerKingdomActionFx(pi, 'パス', { overlay: passByHuman ? 'action' : null, durationMs: 480, cutin: passByHuman });
  const leader = s.lastPlay?.owner;
  if (leader != null && allOthersPassed(leader)) { log('全員パスでクリア'); clearTrick(leader); return; }
  s.turn = nextAlive(pi, 1, true) ?? (leader ?? pi);
  s.message = `${pName(s.turn)}のターン`;
  scheduleNpc(); render();
}

function raiseAction(pi) {
  const p = s.players[pi];
  if (p.raise) { s.message = 'この局は既にレイズ済みです。'; render(); return; }
  if (p.raisePending) { s.message = '既にレイズ待機中です。'; render(); return; }
  if (p.hand.length < 5) { s.message = 'レイズ待機は手札5枚以上で宣言してください。'; render(); return; }
  if (p.chips < RAISE_COST) { s.message = 'チップ不足でレイズ待機不可。'; render(); return; }
  p.raisePending = true;
  log(`${p.name}: レイズ待機`);
  s.message = `${p.name}がレイズ待機`;
  render();
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
  if (p.raisePending && p.hand.length > 4) {
    const targetUse = p.hand.length - 4;
    const reach = all.filter((m) => Array.isArray(m.selected) && m.selected.length === targetUse);
    if (reach.length) return { action: 'play', play: reach[0] };
  }
  const outNow = all.find((m) => m.selected.length === p.hand.length);
  if (outNow) return { action: 'play', play: outNow };
  if (isNpcOpeningPhase(pi)) {
    const singleOnlyIds = collectNpcSingleOnlyCardIds(pi, calls, roles, sets);
    const openingSingle = pickNpcOpeningSinglePlay(pi, sets, singleOnlyIds);
    if (openingSingle) return { action: 'play', play: openingSingle };
  }
  if (p.human && !p.raise && !p.raisePending && p.hand.length >= 5 && p.chips >= RAISE_COST && Math.random() < 0.28) return { action: 'raise' };
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
  if (!p || p.human) return false;

  let lead = pickBestNpcLeadPlay(pi);
  if (!lead && (p.raise || p.raisePending)) {
    // Emergency unlock for NPC only to avoid deadlock on empty trick.
    p.raise = false;
    p.raisePending = false;
    lead = pickBestNpcLeadPlay(pi);
  }
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
  if (!p || p.human) { traceKingdomFlow('npcAct.abort', `reason=invalidOrHuman turn=${pi}`); return; }
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
          if (!s.players?.[pi] || s.players[pi].human) return;
          npcAct();
        });
        return;
      }
    }
  }
  const d = npcDecide(pi);
  traceKingdomFlow('npcAct.decide', `player=${pi} action=${d?.action || 'none'}`);
  if (d.action === 'raise') {
    raiseAction(pi);
    scheduleNpcTimer(NPC_RAISE_FOLLOWUP_DELAY, () => {
      if (!s || !s.roundActive) return;
      if (s.phase !== 'turn' || s.turn !== pi) return;
      const current = s.players?.[pi];
      if (!current || current.human) return;
      const d2 = npcDecide(pi);
      traceKingdomFlow('npcAct.raiseFollowup', `player=${pi} action=${d2?.action || 'none'}`);
      if (d2.action === 'play' && d2.play) applyPlay(pi, d2.play);
      else passAction(pi);
    });
    return;
  }
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
  enforceLeadTurnInvariant();
  traceKingdomFlow('scheduleNpc.enter');
  clearNpcTimer();
  if (!s || !s.roundActive) {
    traceKingdomFlow('scheduleNpc.abort', 'reason=inactive');
    return;
  }
  if (s.phase === 'draw' && s.pendingDraw != null && !s.players[s.pendingDraw].human) {
    traceKingdomFlow('scheduleNpc.timer', `reason=draw player=${s.pendingDraw} delay=${NPC_DELAY}`);
    scheduleNpcTimer(NPC_DELAY, () => npcAct());
    return;
  }
  if (s.phase === 'judgment' && s.pendingJudgment != null && !s.players[s.pendingJudgment].human) {
    traceKingdomFlow('scheduleNpc.timer', `reason=judgment player=${s.pendingJudgment} delay=${NPC_DELAY}`);
    scheduleNpcTimer(NPC_DELAY, () => npcAct());
    return;
  }
  if (s.phase !== 'turn') {
    traceKingdomFlow('scheduleNpc.abort', `reason=phase:${s.phase}`);
    return;
  }
  if (!s.players[s.turn]?.human) {
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
  s.players.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'tarot-kingdom-player-row';
    row.dataset.playerIndex = String(i);
    if (i === s.turn && s.phase === 'turn') row.classList.add('is-turn');
    if (p.human) row.classList.add('is-human');
    const left = document.createElement('div');
    left.className = 'tarot-kingdom-player-name';
    const starCount = Math.max(0, Number(p.stars) || 0);
    left.textContent = `${p.name}${starCount > 0 ? ` ${'⭐'.repeat(starCount)}` : ''}`;
    const right = document.createElement('div'); right.className = 'tarot-kingdom-player-meta'; right.textContent = `H${p.hand.length} / ${p.chips}TP / B${p.bet}`;
    if (p.raisePending && !p.raise) { const t = document.createElement('span'); t.className = 'tarot-kingdom-flag'; t.textContent = '待機'; right.appendChild(t); }
    if (p.raise) { const t = document.createElement('span'); t.className = 'tarot-kingdom-flag'; t.textContent = 'RAISE'; right.appendChild(t); }
    row.appendChild(left); row.appendChild(right); ui.players.appendChild(row);
  });
}

function renderTrick() {
  const cards = s.trick?.cardsTable || [];
  const owners = Array.isArray(s.trick?.tableOwners) ? s.trick.tableOwners : [];
  if (ui.trickOwner) {
    if (!cards.length) {
      ui.trickOwner.textContent = '場札主: -';
    } else {
      const ownerSummary = new Map();
      cards.forEach((_, idx) => {
        const owner = Number.isInteger(owners[idx]) ? owners[idx] : (Number.isInteger(s.trick?.owner) ? s.trick.owner : null);
        if (!Number.isInteger(owner) || !s.players?.[owner]) return;
        const key = owner;
        const current = ownerSummary.get(key) || { count: 0, hand: Math.max(0, Number(s.players[owner].hand?.length || 0)) };
        current.count += 1;
        ownerSummary.set(key, current);
      });
      const parts = Array.from(ownerSummary.entries()).map(([owner, data]) => `${pName(owner)}x${data.count} H${data.hand}`);
      ui.trickOwner.textContent = `場札主: ${parts.join(' / ') || '-'}`;
    }
  }
  const nextKey = cards.length
    ? cards.map((c) => c?.id || `${c?.kind || ''}:${c?.suit || ''}:${c?.number ?? ''}`).join('|')
    : '__empty__';
  const renderNow = () => {
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
      let animDelayMs = 0;
      let animDurationMs = 240;
      if (callFxActive && idx > 0) {
        // コール時の4枚は右側から順に飛び込み、横一列で着地させる
        const orderFromRight = Math.max(0, (cards.length - 1) - idx);
        node.classList.add('is-call-arriving');
        animDelayMs = orderFromRight * 140;
        animDurationMs = 420;
        node.style.animationDelay = `${animDelayMs}ms`;
      } else {
        node.classList.add('is-entering');
        animDelayMs = idx * (s.callMergeFx ? 120 : 78);
        animDurationMs = 260;
        node.style.animationDelay = `${animDelayMs}ms`;
      }
      let cleaned = false;
      const clearAnimState = () => {
        if (cleaned) return;
        cleaned = true;
        node.classList.remove('is-entering');
        node.classList.remove('is-call-arriving');
        node.style.animationDelay = '';
      };
      node.addEventListener('animationend', clearAnimState, { once: true });
      // animationend が来ない環境でも透明のまま残らないようにする。
      setTimeout(clearAnimState, animDelayMs + animDurationMs + 120);
      ui.trick.appendChild(node);
    });
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
  // 場札消失の競合回避: 入れ替えは遅延せず即時反映する
  trickRenderToken += 1;
  renderNow();
}

function renderHand() {
  ui.hand.innerHTML = '';
  const me = s.players.findIndex((p) => p.human);
  const selected = sanitizeSelected(me);
  if (ui.selectedEffect) {
    ui.selectedEffect.textContent = '';
    ui.selectedEffect.hidden = true;
  }
  const drawMe = s.roundActive && s.phase === 'draw' && s.pendingDraw === me;
  const canSelect = s.roundActive && (s.phase === 'turn' || drawMe);
  const canCommit = (s.roundActive && s.phase === 'turn' && s.turn === me) || drawMe;
  const onHandTap = (idx) => {
    if (!canSelect) {
      showPlayError(`現在は「${s.phase}」フェーズです。`);
      return;
    }
    if (s.selected.has(idx)) s.selected.delete(idx);
    else s.selected.add(idx);
    s.message = canCommit
      ? `選択中: ${s.selected.size}枚`
      : `選択中: ${s.selected.size}枚（あなたのターン待ち）`;
    render();
  };
  s.players[me].hand.forEach((c, i) => ui.hand.appendChild(cardNode(c, {
    clickable: canSelect,
    selected: selected.includes(i),
    onClick: () => onHandTap(i)
  })));
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
  const human = !!judgmentPlayer?.human;
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
            ? () => applyJudgmentPick(entry.owner, entry.cardIndex)
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
  if (!ui.oracleCard) return;
  ui.oracleCard.innerHTML = '';
  const card = (s.openOracleRevealed && s.openOracleCard) ? s.openOracleCard : null;
  ui.oracleCard.appendChild(cardNode(card, { small: true }));
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
  if (!s.openOracleCard) ui.openOracle.textContent = '表: なし';
  else if (!s.openOracleRevealed) ui.openOracle.textContent = '表: 未公開';
  else ui.openOracle.textContent = `表: ${getCardNameLabel(s.openOracleCard)} ${s.openOracle != null ? `(オラクル ${getCardNumberLabel({ kind: 'minor', number: s.openOracle, suit: 'None' })})` : '(表オラクルなし)'}`;
  ui.hiddenOracle.textContent = s.hiddenOracleCard ? `裏: ${getCardNameLabel(s.hiddenOracleCard)} (${getCardNumberLabel(s.hiddenOracleCard)})` : '裏: 未公開';
  ui.log.innerHTML = s.logs.slice(-28).map((m) => `<div class="tarot-log-row">${m}</div>`).join('');
  ui.log.scrollTop = ui.log.scrollHeight;
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
    const head = document.createElement('div');
    head.className = 'tarot-kingdom-settlement-head';
    head.textContent = `第${data.roundNo}局 / 勝者: ${data.winnerName}`;
    body.appendChild(head);

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
      formula.textContent = `計算式: ${row.remain} × (1 + ${row.starBonus} + ${row.raiseBonus} + ${row.oracleHits} + ${row.acePenalty}) = ${row.pay}`;
      rowEl.appendChild(formula);

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
  const me = s.players.findIndex((p) => p.human);
  const inCallCinematic = s.phase === 'callCinematic';
  const inOpeningCinematic = s.phase === 'openingCinematic';
  const actionLocked = inCallCinematic || inOpeningCinematic;
  const myStars = Math.max(0, Number(s.players[me]?.stars) || 0);
  const myHandCount = Math.max(0, Number(s.players[me]?.hand?.length || 0));
  const myTurn = s.roundActive && s.phase === 'turn' && s.turn === me;
  const drawMe = s.roundActive && s.phase === 'draw' && s.pendingDraw === me;
  const canClearSelection = s.roundActive && (s.phase === 'turn' || drawMe) && s.selected && s.selected.size > 0;
  const canPlayNow = myTurn || drawMe;
  ui.startButton.hidden = !!s.roundActive || !!s.awaitRoundConfirm;
  ui.playButton.disabled = actionLocked || !canPlayNow;
  ui.clearButton.disabled = actionLocked || !canClearSelection;
  ui.passButton.disabled = actionLocked || !myTurn;
  ui.raiseButton.disabled = actionLocked || !(myTurn && !s.players[me].raise && !s.players[me].raisePending && s.players[me].hand.length >= 5 && s.players[me].chips >= RAISE_COST);
  ui.raiseButton.textContent = s.players[me].raisePending ? 'レイズ待機中' : 'レイズ';
  ui.drawMinorButton.disabled = actionLocked || !(drawMe && s.minorDeck.length > 0 && myHandCount < START_HAND);
  ui.drawMajorButton.disabled = actionLocked || !(drawMe && s.majorDeck.length > 0 && myStars > 0 && myHandCount < START_HAND);
  if (ui.graveToggleButton) {
    if (s.pendingJudgment != null) {
      ui.graveToggleButton.textContent = '墓地（審判中）';
      ui.graveToggleButton.disabled = true;
    } else {
      ui.graveToggleButton.textContent = s.graveOpen ? '墓地を閉じる' : '墓地を見る';
      ui.graveToggleButton.disabled = actionLocked || !s.roundActive;
    }
  }
  ui.startButton.textContent = s.phase === 'done' ? '新しいゲームを開始' : (!s.roundActive && s.handNo > 0 ? '次の局を開始' : '新しい戦いを始める');
}

function render() { if (!s) return; resolveReversePersistSuspend(); enforceLeadTurnInvariant(); renderSummary(); renderSettlement(); renderOracleCard(); renderPlayers(); renderTrick(); renderHand(); renderJudgment(); updateButtons(); }

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

function beginNextRound() {
  setupHand();
  render();
  if (!s.openOracleRevealed) {
    oracleRevealDelayTimer = setTimeout(() => {
      oracleRevealDelayTimer = null;
      revealOracleWithFlip();
    }, 120);
  }
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
  p.hand.sort((a, b) => cStrength(a) - cStrength(b));
  s.selected.clear();
  log(`${pName(pi)}: 吊るされた男で小アルカナ1枚ドロー`);
  s.message = `${pName(pi)}: 吊るされた男を使用`;
  triggerKingdomActionFx(pi, '吊るされた男', { overlay: 'draw', durationMs: 760, cutin: true });
  render();
  return { ok: true };
}

function humanPlay() {
  if (!s || !s.roundActive) return;
  const me = s.players.findIndex((p) => p.human);
  const myTurn = s.phase === 'turn' && s.turn === me;
  const drawMe = s.phase === 'draw' && s.pendingDraw === me;
  if (!myTurn && !drawMe) return;
  if (drawMe) {
    s.pendingDraw = null;
    s.pendingDrawReason = null;
    s.phase = 'turn';
    s.turn = me;
    s.message = 'ドローせずに場へ出します。';
  }
  const sel = sanitizeSelected(me);
  if (!sel.length) { showPlayError('手札を選択してください。'); return; }
  if (myTurn && sel.length === 1) {
    const maybeHanged = s.players?.[me]?.hand?.[sel[0]];
    if (maybeHanged?.kind === 'major' && maybeHanged?.number === 12) {
      const used = useHangedManAction(me, sel);
      if (!used.ok) showPlayError(used.reason || '吊るされた男を使用できません。');
      return;
    }
  }
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
  applyPlay(me, built.play);
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
  ui.openOracle = document.getElementById('tarotKingdomOpenOracle');
  ui.hiddenOracle = document.getElementById('tarotKingdomHiddenOracle');
  ui.kingdomOverlay = document.getElementById('tarotKingdomEffectOverlay');
  ui.kingdomCutin = document.getElementById('tarotKingdomCutin');
  ui.stateText = document.getElementById('tarotKingdomStateText');
  ui.settlement = document.getElementById('tarotKingdomSettlement');
  ui.settlementBody = document.getElementById('tarotKingdomSettlementBody');
  ui.settlementConfirmButton = document.getElementById('tarotKingdomSettlementConfirmButton');
  ui.startButton = document.getElementById('tarotKingdomStartButton');
  ui.playButton = document.getElementById('tarotKingdomPlayButton');
  ui.clearButton = document.getElementById('tarotKingdomClearButton');
  ui.passButton = document.getElementById('tarotKingdomPassButton');
  ui.raiseButton = document.getElementById('tarotKingdomRaiseButton');
  ui.drawMinorButton = document.getElementById('tarotKingdomDrawMinorButton');
  ui.drawMajorButton = document.getElementById('tarotKingdomDrawMajorButton');
  ui.graveToggleButton = document.getElementById('tarotKingdomGraveToggleButton');
  ui.selectedEffect = document.getElementById('tarotKingdomSelectedEffect');
  ui.players = document.getElementById('tarotKingdomPlayers');
  ui.trick = document.getElementById('tarotKingdomTrick');
  ui.hand = document.getElementById('tarotKingdomHand');
  ui.log = document.getElementById('tarotKingdomLog');
  ui.judgmentArea = document.getElementById('tarotKingdomJudgmentArea');
  ui.judgmentTitle = document.getElementById('tarotKingdomJudgmentTitle');
  ui.judgmentOptions = document.getElementById('tarotKingdomJudgmentOptions');
  ui.judgmentSkipButton = document.getElementById('tarotKingdomJudgmentSkipButton');
  ui.startButton?.addEventListener('click', () => startOrNext());
  ui.playButton?.addEventListener('click', () => humanPlay());
  ui.clearButton?.addEventListener('click', () => clearSelectedCards(true));
  ui.passButton?.addEventListener('click', () => { if (s?.roundActive && s.phase === 'turn' && s.players[s.turn]?.human) passAction(s.turn); });
  ui.raiseButton?.addEventListener('click', () => { if (s?.roundActive && s.phase === 'turn' && s.players[s.turn]?.human) raiseAction(s.turn); });
  ui.drawMinorButton?.addEventListener('click', () => applyDrawChoice('minor'));
  ui.drawMajorButton?.addEventListener('click', () => applyDrawChoice('major'));
  ui.graveToggleButton?.addEventListener('click', () => toggleGraveyard());
  ui.judgmentSkipButton?.addEventListener('click', () => skipJudgmentPick());
  ui.settlementConfirmButton?.addEventListener('click', () => confirmRoundSettlement());
  bound = true;
}

export async function loadTarotKingdomPage() {
  bindUi();
  if (!s) resetMatch();
  render();
}

export function destroyTarotKingdomPage() {
  clearNpcTimer();
  clearOracleFlipTimers();
  clearCallCinematicTimer();
  clearRoundStartCinematicTimer();
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
      'is-kingdom-round-end'
    );
    ui.kingdomCutin.textContent = '';
  }
  ui.kingdomOverlay?.classList.remove('show', 'is-kingdom-raise', 'is-kingdom-clear', 'is-kingdom-draw', 'is-kingdom-roundend');
  ui.oracleCardWrap?.classList.remove('is-flipping');

  if (ui.trick) ui.trick.innerHTML = '';
  if (ui.hand) ui.hand.innerHTML = '';
  if (ui.selectedEffect) {
    ui.selectedEffect.textContent = '';
    ui.selectedEffect.hidden = true;
  }
  if (ui.players) ui.players.innerHTML = '';
  if (ui.log) ui.log.innerHTML = '';
  if (ui.judgmentOptions) ui.judgmentOptions.innerHTML = '';
  if (ui.judgmentArea) ui.judgmentArea.style.display = 'none';
  if (ui.settlementBody) ui.settlementBody.innerHTML = '';
  if (ui.settlement) ui.settlement.hidden = true;

  trickRenderKey = '';
  trickRenderToken += 1;
  npcActInFlight = false;
  s = null;
}
