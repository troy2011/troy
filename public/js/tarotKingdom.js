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
const NPC_DELAY = 650;

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
let stateErrorTimer = null;
let kingdomCutinTimer = null;
let kingdomOverlayTimer = null;
let oracleRevealDelayTimer = null;
let oracleFlipSwapTimer = null;
let oracleFlipEndTimer = null;
const kingdomRowFxTimers = new Map();

const clearNpcTimer = () => { if (npcTimer) { clearTimeout(npcTimer); npcTimer = null; } };
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
const pName = (i) => s.players[i]?.name || `P${i + 1}`;
const hasAceMinor = (cards) => cards.some((c) => c.kind === 'minor' && c.number === 1);
const hasCourt = (c) => { const n = idNum(c); return n >= 11 && n <= 14; };
const openOracleRank = (majorCard) => (!majorCard ? null : (majorCard.number === 1 || majorCard.number === 15 ? 1 : (majorCard.number >= 2 && majorCard.number <= 14 ? majorCard.number : null)));
const suitsForCard = (c, role = false) => c.kind === 'minor' ? [c.suit] : (c.number === 1 ? SUITS.slice() : (SPECIAL_SUIT[c.number] ? [SPECIAL_SUIT[c.number]] : (c.number === 0 && role ? SUITS.slice() : ['None'])));
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

function getArcanaMatchNumber() {
  if (!s?.openOracleRevealed) return null;
  if (!s.openOracleCard || s.openOracleCard.kind !== 'major') return null;
  const n = Number(s.openOracleCard.number);
  return Number.isFinite(n) ? n : null;
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
  ui.kingdomOverlay.classList.remove('show', 'is-kingdom-raise', 'is-kingdom-clear', 'is-kingdom-draw');
  if (kind === 'raise') ui.kingdomOverlay.classList.add('is-kingdom-raise');
  else if (kind === 'clear') ui.kingdomOverlay.classList.add('is-kingdom-clear');
  else if (kind === 'draw') ui.kingdomOverlay.classList.add('is-kingdom-draw');
  void ui.kingdomOverlay.offsetWidth;
  ui.kingdomOverlay.classList.add('show');
  if (kingdomOverlayTimer) clearTimeout(kingdomOverlayTimer);
  kingdomOverlayTimer = setTimeout(() => {
    ui.kingdomOverlay?.classList.remove('show', 'is-kingdom-raise', 'is-kingdom-clear', 'is-kingdom-draw');
    kingdomOverlayTimer = null;
  }, 260);
}

function showKingdomCutin(playerIndex, label, options = {}) {
  if (!ui.kingdomCutin || !label) return;
  const ownerClass = getKingdomOwnerClass(playerIndex);
  const who = playerIndex == null ? '' : `${pName(playerIndex)} `;
  const cutinText = `${who}${label}`;
  ui.kingdomCutin.textContent = cutinText;
  ui.kingdomCutin.classList.remove('is-player', 'is-cpu', 'is-showdown-win', 'is-showdown-lose', 'is-showdown-draw');
  if (playerIndex != null) ui.kingdomCutin.classList.add(ownerClass);
  if (options.cutinClass) ui.kingdomCutin.classList.add(options.cutinClass);
  ui.kingdomCutin.classList.add('show');
  if (kingdomCutinTimer) clearTimeout(kingdomCutinTimer);
  kingdomCutinTimer = setTimeout(() => {
    ui.kingdomCutin?.classList.remove('show', 'is-player', 'is-cpu', 'is-showdown-win', 'is-showdown-lose', 'is-showdown-draw');
    kingdomCutinTimer = null;
  }, options.durationMs || 680);
}

function flashKingdomPlayerRowAction(playerIndex, label) {
  const row = ui.players?.querySelector?.(`[data-player-index="${playerIndex}"]`);
  if (!row || !label) return;
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
  if (!ui.score || typeof document === 'undefined') return;
  const sourceEl = options.fromPot ? ui.score : (getKingdomPlayerAnchor(playerIndex) || ui.hand || ui.score);
  const targetEl = options.targetPlayerIndex != null
    ? (getKingdomPlayerAnchor(options.targetPlayerIndex) || ui.score)
    : ui.score;
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
    if (c.kind === 'minor') return [{ src: c, v: c.number === 1 ? 15 : c.number, raw: c.number, suit: c.suit }];
    if (c.number === 0) {
      const out = [];
      for (let raw = 1; raw <= 15; raw += 1) SUITS.forEach((suit) => out.push({ src: c, v: raw === 1 ? 15 : raw, raw, suit }));
      return out;
    }
    if (c.number === 1) return SUITS.map((suit) => ({ src: c, v: 1, raw: 1, suit }));
    const s2 = suitsForCard(c, true)[0] || 'None';
    return [{ src: c, v: c.number === 14 ? 14 : Number(c.number || 0), raw: Number(c.number || 0), suit: s2 }];
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
    players: PLAYERS.map((p) => ({ ...p, chips: START_CHIPS, hand: [], discard: [], rateBonus: 0, raise: false, bet: 0, stars: 0 })),
    handNo: 0,
    dealer: 0,
    turn: 0,
    phase: 'idle',
    roundActive: false,
    trick: null,
    lastPlay: null,
    pass: [false, false, false, false],
    callOnly: false,
    lock: null,
    reverse: false,
    reversePersist: false,
    minorDeck: [],
    majorDeck: [],
    openOracleCard: null,
    openOracle: null,
    openOracleRevealed: false,
    hiddenOracleCard: null,
    pendingDraw: null,
    pendingJudgment: null,
    graveOpen: false,
    selected: new Set(),
    pot: 0,
    logs: [],
    message: '「新しい戦いを始める」を押してください。',
    champion: null
  };
}

function clearRoundState() {
  s.trick = null;
  s.lastPlay = null;
  s.pass = [false, false, false, false];
  s.callOnly = false;
  s.lock = null;
  if (!s.reversePersist) s.reverse = false;
  s.pendingDraw = null;
  s.pendingJudgment = null;
  s.graveOpen = false;
  s.selected.clear();
  s.players.forEach((p) => { p.hand = []; p.discard = []; p.rateBonus = 0; p.raise = false; p.bet = 0; });
}

function resetMatch() {
  s = initState();
  trickRenderKey = '';
  trickRenderToken += 1;
  if (stateErrorTimer) { clearTimeout(stateErrorTimer); stateErrorTimer = null; }
  clearOracleFlipTimers();
  if (kingdomCutinTimer) { clearTimeout(kingdomCutinTimer); kingdomCutinTimer = null; }
  if (kingdomOverlayTimer) { clearTimeout(kingdomOverlayTimer); kingdomOverlayTimer = null; }
  kingdomRowFxTimers.forEach((timerId) => clearTimeout(timerId));
  kingdomRowFxTimers.clear();
  ui.kingdomCutin?.classList.remove('show', 'is-player', 'is-cpu', 'is-showdown-win', 'is-showdown-lose', 'is-showdown-draw');
  ui.kingdomOverlay?.classList.remove('show', 'is-kingdom-raise', 'is-kingdom-clear', 'is-kingdom-draw');
  s.openOracleCard = shuf(mkMajor())[0] || null;
  s.openOracle = openOracleRank(s.openOracleCard);
  s.openOracleRevealed = false;
}

function setupHand() {
  clearNpcTimer();
  clearRoundState();
  s.roundActive = true;
  s.phase = 'turn';
  s.minorDeck = shuf(mkMinor());
  s.majorDeck = shuf(mkMajor());
  for (let r = 0; r < START_HAND; r += 1) for (let i = 0; i < 4; i += 1) {
    const p = (s.dealer + i) % 4;
    const c = s.minorDeck.pop();
    if (c) s.players[p].hand.push(c);
  }
  s.players.forEach((p) => p.hand.sort((a, b) => cStrength(a) - cStrength(b)));
  // 局開始時、全員に星を1つ付与
  s.players.forEach((p) => { p.stars = Math.max(0, Number(p.stars) || 0) + 1; });
  s.turn = s.dealer;
  s.message = `${pName(s.dealer)}が親です。カードを出してください。`;
  log(`第${s.handNo + 1}局開始 / 親: ${pName(s.dealer)}`);
  scheduleNpc();
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
  if (![1, 2, 3].includes(sel.length)) return { ok: false, reason: '通常出しは1〜3枚です。' };
  const cards = sel.map((i) => p.hand[i]).filter(Boolean);
  if (cards.length !== sel.length) return { ok: false, reason: '選択が不正です。' };
  const n = idNum(cards[0]);
  if (!cards.every((c) => idNum(c) === n)) return { ok: false, reason: '同じ数値で揃えてください。' };
  if (s.lock?.suit && !cards.every((c) => suitsForCard(c, false).includes(s.lock.suit))) return { ok: false, reason: `スート縛り: ${SUIT_LABEL[s.lock.suit]}` };
  if (s.lock?.min != null && cards.length === 1 && cStrength(cards[0]) <= s.lock.min) return { ok: false, reason: `${s.lock.min}より強いカードが必要です。` };
  const suitTier = Math.max(...cards.map((c) => Math.max(...suitsForCard(c, false).map((x) => suitTierForCard(c, x)))));
  const setPower = Math.max(...cards.map((c) => cStrength(c)));
  return { ok: true, play: { type: 'set', owner: pi, count: cards.length, selected: sel.slice(), cardsHand: cards.slice(), cardsTable: cards.slice(), number: n, setPower, suitTier } };
}

function buildRolePlay(pi, sel) {
  const p = s.players[pi];
  if (sel.length !== 5) return { ok: false, reason: '役は5枚選択です。' };
  const cards = sel.map((i) => p.hand[i]).filter(Boolean);
  if (cards.length !== 5) return { ok: false, reason: '選択が不正です。' };
  const role = evalRole(cards, s.lock?.suit || null);
  if (!role || role.strength < ROLE_ST.Straight) return { ok: false, reason: 'ストレート以上が必要です。' };
  return { ok: true, play: { type: 'role', owner: pi, count: 5, selected: sel.slice(), cardsHand: cards.slice(), cardsTable: cards.slice(), role, call: false } };
}

function buildCallPlay(pi, sel) {
  const p = s.players[pi];
  const stars = Math.max(0, Number(p?.stars) || 0);
  if (stars <= 0) return { ok: false, reason: '星がないためコールできません。' };
  const base = s.trick?.cardsTable?.[0];
  if (!base) return { ok: false, reason: '場札がありません。' };
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
  return { ok: true, play: { type: 'role', owner: pi, count: 5, selected: sel.slice(), cardsHand: cards.slice(), cardsTable: [base, ...cards], role, call: true } };
}

function isMinorAceCard(card) {
  return !!card && card.kind === 'minor' && Number(card.number) === 1;
}

function getRemainingHandAfterPlay(play) {
  const owner = Number(play?.owner);
  const hand = s?.players?.[owner]?.hand;
  if (!Array.isArray(hand)) return null;
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
  if (s.callOnly && mode !== 'call') return { ok: false, reason: '8カット中: コールかパスのみ。' };
  if (mode === 'call') {
    const actor = s.players?.[Number(play?.owner)];
    const stars = Math.max(0, Number(actor?.stars) || 0);
    if (stars <= 0) return { ok: false, reason: '星がないためコールできません。' };
    return (s.trick.type === 'set' && s.trick.count === 1) ? { ok: true } : { ok: false, reason: 'コール対象は1枚場札のみです。' };
  }
  if (play.type !== s.trick.type || play.count !== s.trick.count) return { ok: false, reason: '場と同じ形式/枚数で。' };
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

function applyRoleRewardOnClear(playerIndex) {
  const play = s.lastPlay;
  if (!play || play.type !== 'role' || play.owner !== playerIndex) return;
  const p = s.players[playerIndex];
  const add = Number(play.role?.effectiveRate ?? play.role?.baseRate ?? 0);
  if (add <= 0) { log(`${p.name}: ${play.role.label}（レート加算なし）`); return; }
  if (p.chips < add) { log(`${p.name}: ${play.role.label}（チップ不足で加算なし）`); return; }
  p.chips -= add; p.rateBonus += add; p.bet += add; s.pot += add;
  log(`${p.name}: ${play.role.label}成立 +${add}レート / 同額ベット`);
  playKingdomCoinEffect(playerIndex, Math.min(8, Math.max(3, add + 2)), '🪙');
}

function drawChoiceStart(playerIndex) {
  s.selected.clear();
  s.pendingDraw = playerIndex;
  if (s.minorDeck.length <= 0 && s.majorDeck.length <= 0) {
    s.pendingDraw = null; s.phase = 'turn'; s.message = `${pName(playerIndex)}が親です。`; scheduleNpc(); render(); return;
  }
  s.phase = 'draw'; s.message = `${pName(playerIndex)}: 小 or 大アルカナを1枚ドロー`;
  render();
  if (!s.players[playerIndex].human) {
    clearNpcTimer();
    npcTimer = setTimeout(() => {
      const stars = Math.max(0, Number(s.players[playerIndex].stars) || 0);
      const useMajor = s.majorDeck.length > 0 && stars > 0 && (s.players[playerIndex].hand.length <= 5 || Math.random() < 0.35);
      applyDrawChoice(useMajor ? 'major' : 'minor');
    }, NPC_DELAY);
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
  if (!opts.length) { log('審判: 回収候補なし'); drawChoiceStart(playerIndex); return; }
  s.pendingJudgment = playerIndex; s.phase = 'judgment'; s.message = `${pName(playerIndex)}: 審判で墓地回収`;
  render();
  if (!s.players[playerIndex].human) {
    clearNpcTimer();
    npcTimer = setTimeout(() => {
      const pick = opts.slice().sort((a, b) => cStrength(b.card) - cStrength(a.card))[0];
      if (pick) applyJudgmentPick(pick.owner, pick.cardIndex); else skipJudgmentPick();
    }, NPC_DELAY);
  }
}

function clearTrick(leader) {
  if (s.players[leader]) {
    s.players[leader].stars = Math.max(0, Number(s.players[leader].stars) || 0) + 1;
  }
  applyRoleRewardOnClear(leader);
  const hadJudgment = !!(s.lastPlay && s.lastPlay.type === 'set' && s.lastPlay.owner === leader && s.lastPlay.cardsHand.some((c) => c.kind === 'major' && c.number === 20));
  s.trick = null; s.lastPlay = null; s.pass = [false, false, false, false]; s.callOnly = false; s.lock = null;
  if (!s.reversePersist) s.reverse = false;
  s.turn = leader;
  triggerKingdomActionFx(leader, 'クリア', { overlay: 'clear', durationMs: 760, cutin: false });
  if (hadJudgment) { judgmentStart(leader); return; }
  drawChoiceStart(leader);
}

function applySetEffects(play) {
  const cards = play.cardsHand;
  if (cards.length > 3) return { forceClear: false, keepTurn: false, skip: 0 };
  let forceClear = false, keepTurn = false, skip = 0;
  const has = (n) => cards.some((c) => idNum(c) === n);
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
    s.reverse = true;
    if (cards.some((c) => c.kind === 'major' && c.number === 11)) {
      s.reversePersist = true; log(`${pName(play.owner)}: 大アルカナ11でゲーム終了まで11バック`);
      triggerKingdomActionFx(play.owner, '大アルカナ11バック', { overlay: 'action', durationMs: 920, cutin: true, cutinClass: 'is-kingdom-reverse' });
    } else {
      log(`${pName(play.owner)}: 11バック`);
      triggerKingdomActionFx(play.owner, '11バック', { overlay: 'action', durationMs: 820, cutin: true, cutinClass: 'is-kingdom-reverse' });
    }
  }
  if (has(14) && cards.length === 1 && s.trick?.cardsTable?.[0]) {
    const cur = cards[0], prev = s.trick.cardsTable[0], prevSuit = suitsForCard(prev, false)[0] || 'None';
    if (cur.kind === 'major' && cur.number === 14) {
      s.lock = { suit: prevSuit, min: cStrength(cur) }; log(`${pName(play.owner)}: 節制ロック (${SUIT_LABEL[prevSuit]})`);
      triggerKingdomActionFx(play.owner, '節制ロック', { overlay: 'action', durationMs: 860, cutin: true, cutinClass: 'is-kingdom-lock' });
    }
    else if (suitsForCard(cur, false).includes(prevSuit)) {
      s.lock = { suit: prevSuit, min: null }; log(`${pName(play.owner)}: 14ロック (${SUIT_LABEL[prevSuit]})`);
      triggerKingdomActionFx(play.owner, '14ロック', { overlay: 'action', durationMs: 820, cutin: true, cutinClass: 'is-kingdom-lock' });
    }
  }
  return { forceClear, keepTurn, skip };
}

function finishRound(winnerIndex) {
  clearNpcTimer();
  s.roundActive = false; s.phase = 'roundEnd'; s.selected.clear(); s.pendingDraw = null; s.pendingJudgment = null;
  const winner = s.players[winnerIndex];
  s.hiddenOracleCard = s.minorDeck.pop() || null;
  const hidden = s.hiddenOracleCard ? idNum(s.hiddenOracleCard) : null;
  const oracleHits = winner.discard.reduce((a, c) => a + ((s.openOracle != null && idNum(c) === s.openOracle) || (hidden != null && idNum(c) === hidden) ? 1 : 0), 0);
  const raiseBonus = winner.raise ? 1 : 0;
  let fxDelayMs = 120;
  log(`${winner.name}がアウト！ 清算開始`);
  s.players.forEach((loser, i) => {
    if (i === winnerIndex) return;
    const remain = loser.hand.length;
    const rate = 1 + winner.rateBonus + raiseBonus + oracleHits + (hasAceMinor(loser.hand) ? A_PENALTY : 0);
    const pay = remain * rate;
    loser.chips -= pay; winner.chips += pay;
    log(`${loser.name} -> ${winner.name}: ${pay}（${remain}枚 x レート${rate}）`);
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
    log(`${winner.name}がPOT ${potAward}獲得`);
    playKingdomCoinEffect(winnerIndex, getKingdomMoneyBagCountByPot(potAward), '💰', {
      fromPot: true,
      targetPlayerIndex: winnerIndex,
      className: 'is-payout',
      delayMs: fxDelayMs + 80
    });
    s.pot = 0;
  }
  s.players.forEach((p) => { p.stars = 0; });
  s.handNo += 1;
  if (s.handNo >= TOTAL_HANDS) {
    let top = 0; s.players.forEach((p, i) => { if (s.players[i].chips > s.players[top].chips) top = i; });
    s.champion = top; s.phase = 'done'; s.message = `ゲーム終了！ 優勝: ${s.players[top].name} (${s.players[top].chips}チップ)`; log(s.message); render(); return;
  }
  s.dealer = (s.dealer + 1) % 4;
  s.message = `${winner.name}が勝利。次局の親: ${pName(s.dealer)}。`;
  render();
}

function applyDrawChoice(deckType) {
  const pi = s.pendingDraw;
  if (pi == null) return;
  const actor = s.players[pi];
  if (!actor) return;
  s.selected.clear();
  let use = deckType;
  if (use === 'major' && s.majorDeck.length <= 0) use = 'minor';
  if (use === 'minor' && s.minorDeck.length <= 0) use = 'major';

  // 大アルカナドローは星1消費。星不足なら人間は選べず、NPCは可能なら小アルカナへフォールバック。
  if (use === 'major') {
    const stars = Math.max(0, Number(actor.stars) || 0);
    if (stars <= 0) {
      if (!actor.human && s.minorDeck.length > 0) {
        use = 'minor';
      } else if (actor.human) {
        s.message = '星が足りないため大アルカナを引けません。';
        render();
        return;
      } else {
        s.pendingDraw = null;
        s.phase = 'turn';
        s.message = `${pName(pi)}が親です。`;
        scheduleNpc();
        render();
        return;
      }
    }
  }

  const c = use === 'major' ? (s.majorDeck.pop() || null) : (s.minorDeck.pop() || null);
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
  s.pendingDraw = null; s.phase = 'turn'; s.message = `${pName(pi)}が親です。`;
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
  drawChoiceStart(pi);
}

function skipJudgmentPick() {
  const pi = s.pendingJudgment;
  if (pi == null) return;
  s.pendingJudgment = null;
  log(`${pName(pi)}: 審判回収をスキップ`);
  triggerKingdomActionFx(pi, '審判スキップ', { overlay: 'draw', durationMs: 520, cutin: false });
  drawChoiceStart(pi);
}

function applyPlay(pi, play) {
  const p = s.players[pi];
  const removed = removeHand(p, play.selected);
  play.cardsHand = removed.slice();
  if (play.type === 'set') play.cardsTable = removed.slice();
  else if (play.type === 'role' && play.call) { const base = s.trick?.cardsTable?.[0]; play.cardsTable = base ? [base, ...removed] : removed.slice(); }
  else play.cardsTable = removed.slice();
  // 大アルカナは墓地へ送らない（場からは取り除かれるが墓地には残さない）
  p.discard.push(...removed.filter((c) => c?.kind !== 'major'));
  if (play.call) {
    p.stars = Math.max(0, (Number(p.stars) || 0) - 1);
  }
  s.selected.clear();
  s.pass = [false, false, false, false];
  s.trick = play; s.lastPlay = play; s.turn = pi;
  log(`${p.name}: ${play.type === 'set' ? `${play.count}枚出し` : `${play.role.label}${play.call ? '（コール）' : ''}`}`);
  const actionLabel = play.type === 'set'
    ? `${play.count}枚出し`
    : (play.call ? 'コール' : (play.role?.label || '役出し'));
  const isCallPlay = !!play.call;
  triggerKingdomActionFx(pi, actionLabel, {
    overlay: 'action',
    durationMs: isCallPlay ? 980 : 700,
    cutin: isCallPlay,
    cutinClass: isCallPlay ? 'is-kingdom-call' : undefined,
    delayMs: isCallPlay ? 180 : 0
  });
  if (p.hand.length <= 0) { finishRound(pi); return; }
  if (play.type === 'set') {
    const fx = applySetEffects(play);
    if (fx.forceClear) { clearTrick(pi); return; }
    if (fx.keepTurn) { s.turn = pi; s.message = `${p.name}のターン継続`; scheduleNpc(); render(); return; }
    s.turn = nextAlive(pi, 1 + Math.max(0, fx.skip), false) ?? pi;
  } else s.turn = nextAlive(pi, 1, false) ?? pi;
  s.message = `${pName(s.turn)}のターン`;
  scheduleNpc(); render();
}

function passAction(pi) {
  if (!s.trick) { s.message = '場が空のためパスできません。'; render(); return; }
  s.pass[pi] = true; log(`${pName(pi)}: パス`);
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
  if (p.hand.length !== 4) { s.message = 'レイズは手札4枚のときのみ。'; render(); return; }
  if (p.chips < RAISE_COST) { s.message = 'チップ不足でレイズ不可。'; render(); return; }
  p.raise = true; p.chips -= RAISE_COST; p.bet += RAISE_COST; s.pot += RAISE_COST;
  log(`${p.name}: レイズ宣言 (+1ベット)`); s.message = `${p.name}がレイズ宣言`;
  triggerKingdomActionFx(pi, 'レイズ', { overlay: 'raise', durationMs: 760, cutin: true, coinCount: 6 });
  render();
}

function setMoves(pi) {
  const p = s.players[pi], by = new Map(), out = [];
  p.hand.forEach((c, idx) => { const list = by.get(idNum(c)) || []; list.push(idx); by.set(idNum(c), list); });
  by.forEach((idxs) => {
    for (let n = 1; n <= Math.min(3, idxs.length); n += 1) {
      comb(idxs, n).forEach((pick) => {
        const b = buildSetPlay(pi, pick), v = b.ok ? validatePlay(b.play, 'normal') : { ok: false };
        if (b.ok && v.ok) out.push(b.play);
      });
    }
  });
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
  if (!p.raise && p.hand.length === 4 && p.chips >= RAISE_COST && Math.random() < 0.28) return { action: 'raise' };
  all.sort((a, b) => {
    if (a.type === 'role' && b.type === 'set') return -1;
    if (a.type === 'set' && b.type === 'role') return 1;
    if (a.type === 'role' && b.type === 'role') return compareRole(b.role, a.role);
    return setCmp(b.setPower ?? b.number, a.setPower ?? a.number) || (b.suitTier - a.suitTier);
  });
  return { action: 'play', play: all[0] };
}

function npcAct() {
  if (!s || !s.roundActive) return;
  if (s.phase === 'draw' && s.pendingDraw != null) {
    const dpi = s.pendingDraw;
    const p = s.players[dpi];
    const stars = Math.max(0, Number(p?.stars) || 0);
    const useMajor = s.majorDeck.length > 0 && stars > 0 && ((p?.hand?.length || 0) <= 5 || Math.random() < 0.35);
    applyDrawChoice(useMajor ? 'major' : 'minor');
    return;
  }
  if (s.phase === 'judgment' && s.pendingJudgment != null) { skipJudgmentPick(); return; }
  if (s.phase !== 'turn') return;
  const pi = s.turn, p = s.players[pi];
  if (!p || p.human) return;
  const d = npcDecide(pi);
  if (d.action === 'raise') {
    raiseAction(pi);
    const d2 = npcDecide(pi);
    if (d2.action === 'play' && d2.play) applyPlay(pi, d2.play); else passAction(pi);
    return;
  }
  if (d.action === 'play' && d.play) applyPlay(pi, d.play); else passAction(pi);
}

function scheduleNpc() {
  clearNpcTimer();
  if (!s || !s.roundActive) return;
  if (s.phase === 'draw' && s.pendingDraw != null && !s.players[s.pendingDraw].human) { npcTimer = setTimeout(() => npcAct(), NPC_DELAY); return; }
  if (s.phase === 'judgment' && s.pendingJudgment != null && !s.players[s.pendingJudgment].human) { npcTimer = setTimeout(() => npcAct(), NPC_DELAY); return; }
  if (s.phase !== 'turn') return;
  if (!s.players[s.turn]?.human) npcTimer = setTimeout(() => npcAct(), NPC_DELAY);
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
    const right = document.createElement('div'); right.className = 'tarot-kingdom-player-meta'; right.textContent = `手札${p.hand.length} / ${p.chips}チップ / B${p.bet}`;
    if (p.raise) { const t = document.createElement('span'); t.className = 'tarot-kingdom-flag'; t.textContent = 'RAISE'; right.appendChild(t); }
    if (p.rateBonus > 0) { const t = document.createElement('span'); t.className = 'tarot-kingdom-flag is-rate'; t.textContent = `+R${p.rateBonus}`; right.appendChild(t); }
    row.appendChild(left); row.appendChild(right); ui.players.appendChild(row);
  });
}

function renderTrick() {
  const cards = s.trick?.cardsTable || [];
  const nextKey = cards.length
    ? cards.map((c) => c?.id || `${c?.kind || ''}:${c?.suit || ''}:${c?.number ?? ''}`).join('|')
    : '__empty__';
  if (nextKey === trickRenderKey) return;
  trickRenderKey = nextKey;

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
      const node = cardNode(c);
      node.classList.add('is-entering');
      node.style.animationDelay = `${idx * 78}ms`;
      node.addEventListener('animationend', () => {
        node.classList.remove('is-entering');
        node.style.animationDelay = '';
      }, { once: true });
      ui.trick.appendChild(node);
    });
  };

  const leavingCards = Array.from(ui.trick.querySelectorAll('.tarot-card'));
  const leavingEmpty = Array.from(ui.trick.querySelectorAll('.tarot-kingdom-empty'));
  if (!leavingCards.length && !leavingEmpty.length) {
    renderNow();
    return;
  }

  const token = ++trickRenderToken;
  leavingCards.forEach((el) => el.classList.add('is-leaving'));
  leavingEmpty.forEach((el) => el.classList.add('is-leaving'));
  setTimeout(() => {
    if (token !== trickRenderToken) return;
    renderNow();
  }, 140);
}

function renderHand() {
  ui.hand.innerHTML = '';
  const me = s.players.findIndex((p) => p.human);
  const selected = sanitizeSelected(me);
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
  ui.round.textContent = `局 ${Math.min(s.handNo + 1, TOTAL_HANDS)} / ${TOTAL_HANDS}`;
  ui.turn.textContent = s.roundActive ? `${pName(s.turn)}の手番` : '待機中';
  if (ui.reverseChip) {
    ui.reverseChip.hidden = !s.reverse;
    ui.reverseChip.textContent = s.reversePersist ? '11バック中（永続）' : '11バック中';
  }
  ui.root?.classList.toggle('is-reverse', !!s.reverse);
  ui.stateText.textContent = s.message || '';
  ui.score.textContent = `POT ${s.pot} / ${s.players.map((p) => `${p.name}:${p.chips}`).join('  ')}`;
  if (!s.openOracleCard) ui.openOracle.textContent = '表: なし';
  else if (!s.openOracleRevealed) ui.openOracle.textContent = '表: 未公開';
  else ui.openOracle.textContent = `表: ${getCardNameLabel(s.openOracleCard)} ${s.openOracle != null ? `(オラクル ${getCardNumberLabel({ kind: 'minor', number: s.openOracle, suit: 'None' })})` : '(表オラクルなし)'}`;
  ui.hiddenOracle.textContent = s.hiddenOracleCard ? `裏: ${getCardNameLabel(s.hiddenOracleCard)} (${getCardNumberLabel(s.hiddenOracleCard)})` : '裏: 未公開';
  ui.log.innerHTML = s.logs.slice(-28).map((m) => `<div class="tarot-log-row">${m}</div>`).join('');
  ui.log.scrollTop = ui.log.scrollHeight;
}

function updateButtons() {
  const me = s.players.findIndex((p) => p.human);
  const myStars = Math.max(0, Number(s.players[me]?.stars) || 0);
  const myTurn = s.roundActive && s.phase === 'turn' && s.turn === me;
  const drawMe = s.roundActive && s.phase === 'draw' && s.pendingDraw === me;
  const canClearSelection = s.roundActive && (s.phase === 'turn' || drawMe) && s.selected && s.selected.size > 0;
  const canPlayNow = myTurn || drawMe;
  ui.startButton.hidden = !!s.roundActive;
  ui.playButton.disabled = !canPlayNow;
  ui.clearButton.disabled = !canClearSelection;
  ui.passButton.disabled = !myTurn;
  ui.raiseButton.disabled = !(myTurn && !s.players[me].raise && s.players[me].hand.length === 4 && s.players[me].chips >= RAISE_COST);
  ui.drawMinorButton.disabled = !(drawMe && s.minorDeck.length > 0);
  ui.drawMajorButton.disabled = !(drawMe && s.majorDeck.length > 0 && myStars > 0);
  if (ui.graveToggleButton) {
    if (s.pendingJudgment != null) {
      ui.graveToggleButton.textContent = '墓地（審判中）';
      ui.graveToggleButton.disabled = true;
    } else {
      ui.graveToggleButton.textContent = s.graveOpen ? '墓地を閉じる' : '墓地を見る';
      ui.graveToggleButton.disabled = !s.roundActive;
    }
  }
  ui.startButton.textContent = s.phase === 'done' ? '新しいゲームを開始' : (!s.roundActive && s.handNo > 0 ? '次の局を開始' : '新しい戦いを始める');
}

function render() { if (!s) return; renderSummary(); renderOracleCard(); renderPlayers(); renderTrick(); renderHand(); renderJudgment(); updateButtons(); }

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

function startOrNext() {
  if (!s || s.phase === 'done') resetMatch();
  if (!s.roundActive && s.handNo < TOTAL_HANDS) {
    setupHand();
    render();
    if (!s.openOracleRevealed) {
      oracleRevealDelayTimer = setTimeout(() => {
        oracleRevealDelayTimer = null;
        revealOracleWithFlip();
      }, 120);
    }
  }
}

function humanPlay() {
  if (!s || !s.roundActive) return;
  const me = s.players.findIndex((p) => p.human);
  const myTurn = s.phase === 'turn' && s.turn === me;
  const drawMe = s.phase === 'draw' && s.pendingDraw === me;
  if (!myTurn && !drawMe) return;
  if (drawMe) {
    s.pendingDraw = null;
    s.phase = 'turn';
    s.turn = me;
    s.message = 'ドローせずに場へ出します。';
  }
  const sel = sanitizeSelected(me);
  if (!sel.length) { showPlayError('手札を選択してください。'); return; }
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
  ui.score = document.getElementById('tarotKingdomScore');
  ui.oracleCardWrap = document.getElementById('tarotKingdomOracleCardWrap');
  ui.oracleCard = document.getElementById('tarotKingdomOracleCard');
  ui.openOracle = document.getElementById('tarotKingdomOpenOracle');
  ui.hiddenOracle = document.getElementById('tarotKingdomHiddenOracle');
  ui.kingdomOverlay = document.getElementById('tarotKingdomEffectOverlay');
  ui.kingdomCutin = document.getElementById('tarotKingdomCutin');
  ui.stateText = document.getElementById('tarotKingdomStateText');
  ui.startButton = document.getElementById('tarotKingdomStartButton');
  ui.playButton = document.getElementById('tarotKingdomPlayButton');
  ui.clearButton = document.getElementById('tarotKingdomClearButton');
  ui.passButton = document.getElementById('tarotKingdomPassButton');
  ui.raiseButton = document.getElementById('tarotKingdomRaiseButton');
  ui.drawMinorButton = document.getElementById('tarotKingdomDrawMinorButton');
  ui.drawMajorButton = document.getElementById('tarotKingdomDrawMajorButton');
  ui.graveToggleButton = document.getElementById('tarotKingdomGraveToggleButton');
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
  bound = true;
}

export async function loadTarotKingdomPage() {
  bindUi();
  if (!s) resetMatch();
  render();
}
