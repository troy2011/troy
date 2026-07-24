import { ref, get, set, update, push, remove, onValue, onChildAdded, onDisconnect, runTransaction, serverTimestamp } from 'firebase/database';
import { decoratePlayerTriggerElement } from './playerProfile.js';
import { getMyPlayerStats, getMyCrewRankInfo } from './player.js';
import { getMyInventory, getMyCurrentEquipment, getMyTarotBattleDeckSnapshot } from './inventory.js';
import { getPlayerRankName } from './homePlayerStatus.js';
import {
  getTarotKingdomCombatProfiles,
  getTarotKingdomPetState,
  joinExplorationStage
} from './playfabClient.js';
import { PIXEL_MONSTERS_ROSTER } from './pixelMonstersManifest.js?v=20260724h';
import {
  calculateTarotKingdomIncomingDamage,
  calculateTarotKingdomPlayerAttack,
  createTarotKingdomExplorationNpcCharacter,
  createTarotKingdomNpcCharacter,
  createTarotKingdomPetCharacter,
  getTarotKingdomPetAiStyle,
  normalizeTarotKingdomCharacter
} from './tarotKingdomCombat.js';
import {
  TAROT_KINGDOM_STATUS_ICON_INDEX,
  getTarotKingdomPhysicalScale,
  isTarotKingdomDeckMatch,
  normalizeTarotKingdomTarotDeck,
  normalizeTarotKingdomWeaponTypes,
  resolveTarotKingdomResonance,
  resolveTarotKingdomWeaponEffect
} from './tarotKingdomEffects.js';
import {
  TAROT_KINGDOM_SUMMONS,
  auditTarotKingdomSummonRegistry,
  buildTarotKingdomSummonEffectSteps,
  getTarotKingdomSummonById,
  resolveTarotKingdomSummon
} from './tarotKingdomSummons.js';
import {
  TAROT_KINGDOM_BATTLEFIELDS,
  createTarotKingdomBattlefieldSnapshot,
  getTarotKingdomBattlefieldById
} from './tarotKingdomBattlefields.js';
import {
  calculateTarotKingdomHitChance,
  calculateTarotKingdomEnemyMitigatedDamage,
  createTarotKingdomEnemyCombatProfile,
  getTarotKingdomEnemyAilmentChance
} from './tarotKingdomEnemies.js';
import {
  flashCombatAvatarHurt,
  getCombatWeaponMotionProfile,
  playCombatAvatarAttack,
  renderCombatAvatar,
  resetCombatAvatarState,
  setCombatAvatarKo,
  setCombatAvatarVictory
} from './avatarCombat.js?v=20260724-death-sheet-1';

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
  16: 'Sword',
  17: 'Cup',
  18: 'Pentacle',
  19: 'Wand'
};
const MAJOR_SUIT_GATE_NUMBERS = new Set([16, 17, 18, 19]);
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

function normalizeKingdomPlayerCount(value, fallback = PLAYERS.length) {
  return Math.max(3, Math.min(PLAYERS.length, Math.floor(Number(value) || fallback)));
}

function getKingdomPlayerCount(state = s) {
  if (Array.isArray(state?.players) && state.players.length >= 3) {
    return normalizeKingdomPlayerCount(state.players.length);
  }
  return normalizeKingdomPlayerCount(state?.rules?.playerCount);
}

function getKingdomSeatIndexes(state = s) {
  return Array.from({ length: getKingdomPlayerCount(state) }, (_, index) => index);
}

function getKingdomInitialPlayerTemplates() {
  const context = kingdomExplorationSession?.context || null;
  if (context?.mode !== 'offline') return PLAYERS;
  const pet = context.currentPet && typeof context.currentPet === 'object' ? context.currentPet : null;
  const roster = PLAYERS.slice(0, 3).map((player) => ({ ...player }));
  if (pet?.monsterId) {
    roster.splice(1, 0, {
      id: 'pet',
      name: String(pet.monsterName || pet.monsterId || 'ペット'),
      isNpc: true,
      isPet: true,
      pet: { ...pet },
      aiStyle: getTarotKingdomPetAiStyle(pet)
    });
  }
  return roster;
}

function getKingdomMercenaryOrdinal(players, playerIndex) {
  const list = Array.isArray(players) ? players : [];
  let ordinal = 0;
  for (let index = 0; index <= playerIndex && index < list.length; index += 1) {
    const player = list[index];
    if (index !== getLocalPlayerIndex() && player?.isPet !== true) ordinal += 1;
  }
  return Math.max(1, ordinal);
}

const NPC_AI_STYLE = {
  CAUTIOUS: 'cautious',
  BALANCED: 'balanced',
  AGGRESSIVE: 'aggressive'
};

const DEFAULT_INITIAL_HAND_SIZE = 8;
const DEFAULT_HAND_LIMIT = 8;
const LEGACY_HAND_SIZE = 6;
const KINGDOM_RULES_VERSION = 10;
const TOTAL_HANDS = 4;
const START_CHIPS = 100;
const A_PENALTY = 1;
const ROUND_START_CINEMATIC_MS = 980;
const ROUND_OUT_CINEMATIC_MS = 1080;
const KINGDOM_RUSH_MONSTER_PLAYBACK_RATE = 0.32;
const KINGDOM_ENEMY_DUST_DURATION_MS = 330;
const GAME_FINAL_CINEMATIC_MS = 2800;
const PRESENCE_AWAY_GRACE_MS = 30000;
const OPENING_HAND_FLIP_START_DELAY_MS = 90;
const OPENING_HAND_FLIP_MS = 170;
const OPENING_HAND_FLIP_GAP_MS = 45;
const DRAW_HAND_FLIP_REVEAL_DELAY_MS = 90;
const DRAW_HAND_FLIP_MS = 220;
const KINGDOM_NORMAL_ATTACK_MS = 900;
// The pet host already uses the same 1.02 combat scale as player avatars.
// Keep the sprite at 1.0 so every pet receives that single shared multiplier.
const KINGDOM_PET_DISPLAY_SCALE = 1;
const KINGDOM_PET_OFFSET_Y_BY_MONSTER_ID = Object.freeze({
  'ismartal-vol2-monster-05': 0,
  'ismartal-vol2-monster-17': 0,
  'ismartal-vol3-monster-09': 0
});
const KINGDOM_SKILL_ATTACK_MS = 1800;
const KINGDOM_SUMMON_ATTACK_MS = 4500;
const KINGDOM_SUMMON_PARTY_HIDE_MS = 550;
const KINGDOM_SUMMON_PARTY_RETURN_MS = 3900;
const KINGDOM_SUMMON_HUD_RETURN_MS = 4200;
const KINGDOM_NORMAL_HIT_STOP_MS = 80;
const KINGDOM_SKILL_HIT_STOP_MS = 120;
const KINGDOM_NORMAL_HP_TWEEN_MS = 240;
const KINGDOM_SKILL_HP_TWEEN_MS = 320;
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
const KINGDOM_SUMMON_EFFECT_VISUALS = Object.freeze({
  rupture: Object.freeze({ category: 'attack', choreography: 'ground-break' }),
  inferno: Object.freeze({ category: 'attack', choreography: 'fire-projectile' }),
  barrage: Object.freeze({ category: 'attack', choreography: 'multi-strike' }),
  bind: Object.freeze({ category: 'debuff', choreography: 'water-bind' }),
  eclipse: Object.freeze({ category: 'debuff', choreography: 'shadow-eclipse' }),
  chaos: Object.freeze({ category: 'debuff', choreography: 'ghost-spiral' }),
  tide: Object.freeze({ category: 'support', choreography: 'life-wave' }),
  aegis: Object.freeze({ category: 'support', choreography: 'golden-barrier' }),
  command: Object.freeze({ category: 'support', choreography: 'fleet-command' })
});
const KINGDOM_NET_SCHEMA_VERSION = 10;
const KINGDOM_PRIVATE_STATE_VERSION = 2;
const KINGDOM_NET_STATE_WRITE_DELAY = 90;
const TK_MATCH_ROOT = 'tarotKingdomMatch';
const TK_FALLBACK_AUTO_ROOM_COUNT = 6;
const TK_OPEN_ROOM_HEARTBEAT_MS = 10000;
const TK_OPEN_ROOM_STALE_MS = 45000;
const TK_PRESENCE_HEARTBEAT_MS = 25000;
const TK_PRESENCE_STALE_MS = 90000;
const TK_PRESENCE_FUTURE_TOLERANCE_MS = 15000;
const TK_SEAT_CLAIM_GRACE_MS = 15000;
const KINGDOM_MOBILE_BREAKPOINT = 640;
const KINGDOM_MOBILE_MIN_HEIGHT = 420;
const KINGDOM_MOBILE_BOTTOM_GAP = 8;
const KINGDOM_FALLBACK_PLAYER_MAX_HP = 100;
const KINGDOM_BATTLE_EVENT_LIMIT = 12;
const KINGDOM_DEFAULT_MONSTER_ID = 'ismartal-vol3-monster-01';
const KINGDOM_DEFAULT_MONSTER = PIXEL_MONSTERS_ROSTER.find((monster) => (
  monster.id === KINGDOM_DEFAULT_MONSTER_ID
)) || PIXEL_MONSTERS_ROSTER[0];
const KINGDOM_MONSTER_ROSTER = PIXEL_MONSTERS_ROSTER.map((monster) => ({ ...monster }));
const KINGDOM_DEMO_MONSTER_ROSTER = PIXEL_MONSTERS_ROSTER.map((monster) => ({ ...monster }));

const ui = {};
let s = null;
let bound = false;
let npcTimer = null;
let trickRenderKey = '';
let trickRenderIdentityKey = '';
let trickRenderToken = 0;
let trickSwapTimer = null;
let pendingKingdomCardDealFx = null;
const kingdomCardDealFxNodes = new Set();
let stateErrorTimer = null;
let kingdomCutinTimer = null;
let kingdomOverlayTimer = null;
let kingdomTrickSceneFlashKind = '';
let kingdomTrickSceneFlashTimer = null;
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
let kingdomNpcRandom = Math.random;
let kingdomCombatRandom = Math.random;
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
let kingdomLocalPriorityKind = '';
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
let netPrivateHandUnsub = null;
let netPresenceUnsub = null;
let netHostUidUnsub = null;
let netOpenRoomsUnsub = null;
let netActionWriteTimer = null;
let netOpenRoomHeartbeatTimer = null;
let netPresenceHeartbeatTimer = null;
let netLastStateHash = '';
let netBootPromise = null;
let netRoomStateReady = false;
let netLocalPrivateHandPayload = null;
let netHostHydrationPromise = null;
let netHostAuthorityReady = false;
let netHostHydrationRetryTimer = null;
const netHandledActionKeys = new Set();
let netPresenceByUid = {};
let netOpenRoomsCache = {};
let netOpenRoomIndexEnabled = true;
let netManualOfflineMode = false;
let netForceCreateRoom = false;
let netJoinedExplorationMeta = null;
let kingdomStartMode = '';
let kingdomViewportSyncQueued = false;
let kingdomViewportWatchBound = false;
let kingdomMonsterFrameTimer = null;
let kingdomMonsterFrameGeneration = 0;
let kingdomMonsterAnimationKey = '';
const kingdomPetAnimationTimers = new Map();
let kingdomBattleVisualResetTimer = null;
let kingdomBattleVisualEventKey = '';
let kingdomEnemyFinisherTimer = null;
let kingdomEnemyFinisherTimerKey = '';
let kingdomDemoEnemyId = '';
let kingdomDemoPetId = '';
let kingdomExplorationMonsterId = '';
let kingdomExplorationSession = null;
let kingdomBattleAvatarEventKey = '';
let kingdomBattleTerminalFxEventKey = '';
let kingdomBattleHurtEventKey = '';
let kingdomBattleDamageEventKey = '';
const kingdomBattlefieldPreloadPromises = new Map();
let kingdomBattlePhaseTimerKey = '';
const kingdomBattlePhaseTimers = new Set();
let kingdomTransitionTimer = null;
let kingdomSummonPreloadStarted = false;
let kingdomCharacterLoadPromise = null;
let kingdomRoundStartPromise = null;
let kingdomStateGeneration = 0;
let presenceGraceTimer = null;
const presenceGraceBySeat = Array.from({ length: 4 }, () => ({ uid: null, name: '', playFabId: '', until: 0 }));
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
  presenceRef: null,
  presenceDisconnect: null,
  hostDisconnect: null,
  openRoomDisconnect: null
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
const clearKingdomTransitionTimer = () => {
  if (kingdomTransitionTimer) {
    clearTimeout(kingdomTransitionTimer);
    kingdomTransitionTimer = null;
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
const isMajorSuitGateCard = (card) => (
  card?.kind === 'major' && MAJOR_SUIT_GATE_NUMBERS.has(Number(card?.number))
);
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
  if (n === 14) return [14];
  return [n];
};
const setNumberOptions = (card) => {
  if (!card) return [0];
  return [Number(card.number || 0)];
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
const pPlayFabId = (i) => String(s?.players?.[i]?.playFabId || '').trim();
function appendPlayerNameNode(container, label, playFabId) {
  if (!container) return null;
  const nameNode = document.createElement('span');
  nameNode.textContent = String(label || 'Player');
  if (playFabId) {
    decoratePlayerTriggerElement(nameNode, playFabId, { className: 'player-link-inline' });
  }
  container.appendChild(nameNode);
  return nameNode;
}
function setInlinePlayerLabel(container, prefix, playerIndex, suffix = '') {
  if (!container) return;
  container.textContent = '';
  if (prefix) container.append(prefix);
  appendPlayerNameNode(container, pName(playerIndex), pPlayFabId(playerIndex));
  if (suffix) container.append(suffix);
}
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
function usesDeferredKingdomGrave(state = s) {
  return Number(normalizeKingdomRules(state?.rules).graveTimingVersion) >= 1;
}
function getOwnedKingdomTrickCards(play) {
  if (!play || !Array.isArray(play.cardsTable)) return [];
  const fallbackOwner = Number.isInteger(Number(play.owner)) ? Number(play.owner) : 0;
  const owners = Array.isArray(play.tableOwners) ? play.tableOwners : [];
  const lastSeat = Math.max(0, getKingdomPlayerCount() - 1);
  return play.cardsTable.map((card, index) => {
    const owner = Number.isInteger(Number(owners[index])) ? Number(owners[index]) : fallbackOwner;
    return { owner: Math.max(0, Math.min(lastSeat, owner)), card };
  }).filter((entry) => !!entry.card);
}
function queueKingdomTrickForGrave(play, retainedCards = []) {
  if (!play) return;
  if (!Array.isArray(s.trickPile)) s.trickPile = [];
  const retained = Array.isArray(retainedCards) ? retainedCards.slice() : [];
  getOwnedKingdomTrickCards(play).forEach((entry) => {
    const retainedIndex = retained.findIndex((card) => isSameCardIdentity(card, entry.card));
    if (retainedIndex >= 0) {
      retained.splice(retainedIndex, 1);
      return;
    }
    s.trickPile.push(entry);
  });
}
function flushKingdomTrickToGrave() {
  queueKingdomTrickForGrave(s.trick);
  const pile = Array.isArray(s.trickPile) ? s.trickPile.slice() : [];
  s.trickPile = [];
  let minorCount = 0;
  pile.forEach((entry) => {
    const owner = Number(entry?.owner);
    const card = entry?.card;
    if (!Number.isInteger(owner) || !s.players?.[owner] || card?.kind !== 'minor') return;
    s.players[owner].discard.push(card);
    minorCount += 1;
  });
  if (minorCount > 0) log(`場の小アルカナ${minorCount}枚を墓地へ移動`);
  return minorCount;
}
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
  return suitsForCard(card, false).reduce(
    (mask, suit) => mask | (SUIT_MASK[String(suit || 'None')] || SUIT_MASK.None),
    SUIT_MASK.None
  );
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
const mkDrawDeck = () => [...mkMinor(), ...mkMajor()];
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

function getKingdomCardEffectDescription(card) {
  if (!card) return '';
  const n = Number(card.number || 0);
  if (card.kind === 'major') {
    const usesMajorGateRules = areKingdomMajorArcanaGateRulesEnabled();
    const usesMajorSpecialRules = areKingdomMajorArcanaSpecialRulesEnabled();
    const majorEffectMap = {
      0: '5枚役のみ数値ワイルド（フラッシュ化なし）',
      1: 'オールスート / 数値1固定',
      5: '5スキップ',
      8: '8カット',
      11: '11バック',
      14: '14ロック解除',
      15: usesMajorSpecialRules ? 'コート専用 / 11バック無視' : '',
      16: usesMajorGateRules
        ? (usesMajorSpecialRules ? '同スート場専用 / 初手不可' : 'ソード場限定（A・上がり不可）')
        : '単騎時はソード14扱い',
      17: usesMajorGateRules
        ? (usesMajorSpecialRules ? '同スート場専用 / 初手不可' : 'カップ場限定（A・上がり不可）')
        : '単騎時はカップ14扱い',
      18: usesMajorGateRules
        ? (usesMajorSpecialRules ? '同スート場専用 / 初手不可' : 'ペンタクル場限定（A・上がり不可）')
        : '単騎時はペンタクル14扱い',
      19: usesMajorGateRules
        ? (usesMajorSpecialRules ? '同スート場専用 / 初手不可' : 'ワンド場限定（A・上がり不可）')
        : '単騎時はワンド14扱い',
      20: usesMajorSpecialRules
        ? 'A不可 / 11バック / 墓地回収'
        : '11バック / この場を流した人が墓地から小アルカナ1枚回収',
      21: usesMajorSpecialRules ? '単独で即クリア / 強制ドロー' : '単騎でどんな場札にも返せる'
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

function setLocalPriorityMessage(text, holdMs = 1800, kind = '') {
  if (kingdomLocalPriorityTimer) {
    clearTimeout(kingdomLocalPriorityTimer);
    kingdomLocalPriorityTimer = null;
  }
  kingdomLocalPriorityMessage = String(text || '').trim();
  kingdomLocalPriorityKind = String(kind || '').trim();
  if (s) renderSummary();
  if (!kingdomLocalPriorityMessage || holdMs <= 0) return;
  const current = kingdomLocalPriorityMessage;
  kingdomLocalPriorityTimer = setTimeout(() => {
    kingdomLocalPriorityTimer = null;
    if (kingdomLocalPriorityMessage !== current) return;
    kingdomLocalPriorityMessage = '';
    kingdomLocalPriorityKind = '';
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
  return buildSelectedCardInfoMessage(playerIndex, selectedIndexes) || '';
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
    if (card?.kind === 'major' && Number(card?.number) === 20) {
      return areKingdomMajorArcanaSpecialRulesEnabled()
        ? '選択: 審判 / A不可・11バック・墓地回収'
        : '審判：11バック＋流し手が小アルカナ1枚回収';
    }
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
  setLocalPriorityMessage(detail, 2400, 'play-error');
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

function resolveKingdomActionCutinPresentation(playerIndex, label, options = {}) {
  const text = String(label || '').trim();
  const cutinClass = String(options.cutinClass || '');
  const explicitKeyword = String(options.keyword || '').trim().toUpperCase();
  let keyword = explicitKeyword || 'ACTION';
  let tone = String(options.tone || '').trim() || 'action';

  if (!explicitKeyword) {
    const choose = (value, nextTone) => {
      keyword = value;
      tone = nextTone;
    };
    if (/is-showdown-lose|敗北|全滅|DEFEAT/i.test(`${cutinClass} ${text}`)) choose('DEFEAT', 'defeat');
    else if (/is-showdown-draw|引き分け|再戦/i.test(`${cutinClass} ${text}`)) choose('DRAW', 'draw');
    else if (/is-showdown-win|is-kingdom-round-out|is-kingdom-grand-win|総取り|出し切り|優勝|勝利|WINNER|CHAMPION/i.test(`${cutinClass} ${text}`)) choose('VICTORY', 'victory');
    else if (/審判回収/.test(text)) choose('RECLAIM', 'reclaim');
    else if (/審判スキップ/.test(text)) choose('SKIP', 'skip');
    else if (/共鳴/.test(text)) choose('RESONANCE', 'resonance');
    else if (/ロック解除|反転解除/.test(text)) choose('BREAK', 'break');
    else if (/14ロック|is-kingdom-lock/.test(`${cutinClass} ${text}`)) choose('LOCK', 'lock');
    else if (/11バック|反転|is-kingdom-reverse/.test(`${cutinClass} ${text}`)) choose('REVERSE', 'reverse');
    else if (/8カット|is-kingdom-cut/.test(`${cutinClass} ${text}`)) choose('CUT', 'cut');
    else if (/5スキップ|is-kingdom-skip/.test(`${cutinClass} ${text}`)) choose('SKIP', 'skip');
    else if (/コール|is-kingdom-call/.test(`${cutinClass} ${text}`)) choose('CALL', 'call');
    else if (/パス/.test(text)) choose('DEFEND', 'defend');
    else if (/ドロー/.test(text)) choose('DRAW', 'draw');
    else if (/ラスト|LAST/i.test(text)) choose('LAST', 'last');
    else if (/ターン|YOUR TURN/i.test(text)) choose('TURN', 'turn');
    else if (/クリア|CLEAR/i.test(text)) choose('CLEAR', 'clear');
  }

  return {
    keyword,
    actorName: String(options.actorName || (playerIndex == null ? 'SYSTEM' : pName(playerIndex))),
    tone,
    durationMs: Math.max(320, Number(options.durationMs) || 680),
    sourceIndex: playerIndex == null ? null : Math.max(0, Math.min(3, Number(playerIndex) || 0))
  };
}

function positionKingdomActionCutin(presentation) {
  const cutin = ui.kingdomCutin;
  const stage = ui.battleStage;
  if (!cutin || !stage) return;
  const sourceIndex = presentation?.sourceIndex;
  let anchorY = stage.clientHeight * 0.42;
  if (sourceIndex != null) {
    const actor = ui.battleParty?.querySelector?.(`[data-player-index="${sourceIndex}"]`)
      || document.getElementById(`tarotKingdomBattleAvatar-${sourceIndex}`);
    const stageRect = stage.getBoundingClientRect?.();
    const actorRect = actor?.getBoundingClientRect?.();
    if (stageRect && actorRect && actorRect.height > 0) {
      anchorY = actorRect.top - stageRect.top + (actorRect.height / 2);
    }
  }
  const clampedY = Math.max(50, Math.min(Math.max(50, stage.clientHeight - 50), anchorY));
  cutin.style.setProperty('--tk-action-cutin-y', `${Math.round(clampedY)}px`);
  cutin.dataset.sourceIndex = sourceIndex == null ? '' : String(sourceIndex);
}

function showKingdomCutin(playerIndex, label, options = {}) {
  if (!ui.kingdomCutin || !label) return;
  const presentation = resolveKingdomActionCutinPresentation(playerIndex, label, options);
  const ownerClass = playerIndex == null ? '' : getKingdomOwnerClass(playerIndex);
  const actor = document.createElement('small');
  actor.className = 'tarot-action-cutin-actor';
  actor.textContent = presentation.actorName;
  const keyword = document.createElement('strong');
  keyword.className = 'tarot-action-cutin-keyword';
  keyword.textContent = presentation.keyword;

  ui.kingdomCutin.className = 'tarot-cutin';
  if (ownerClass) ui.kingdomCutin.classList.add(ownerClass);
  if (options.cutinClass) ui.kingdomCutin.classList.add(options.cutinClass);
  ui.kingdomCutin.classList.add(`is-tone-${presentation.tone}`);
  ui.kingdomCutin.replaceChildren(actor, keyword);
  ui.kingdomCutin.setAttribute('aria-label', `${presentation.actorName} ${presentation.keyword}`);
  ui.kingdomCutin.setAttribute('aria-hidden', 'false');
  ui.kingdomCutin.style.setProperty('--tk-action-cutin-duration', `${presentation.durationMs}ms`);
  positionKingdomActionCutin(presentation);
  ui.kingdomCutin.classList.remove('show');
  void ui.kingdomCutin.offsetWidth;
  ui.kingdomCutin.classList.add('show');
  if (kingdomCutinTimer) clearTimeout(kingdomCutinTimer);
  kingdomCutinTimer = setTimeout(() => {
    ui.kingdomCutin?.classList.remove('show');
    ui.kingdomCutin?.setAttribute('aria-hidden', 'true');
    kingdomCutinTimer = null;
  }, presentation.durationMs);
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
    if (options.className) {
      String(options.className)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((className) => coin.classList.add(className));
    }
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
  triggerKingdomActionFx(playerIndex, 'CHAMPION', {
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
  const battleAvatar = document.getElementById(`tarotKingdomBattleAvatar-${Number(playerIndex)}`);
  const battleAvatarPoint = getElementCenterPoint(battleAvatar);
  if (battleAvatarPoint) return battleAvatarPoint;
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

function snapshotKingdomFxRect(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom
  };
}

function clearKingdomCardDealFx() {
  pendingKingdomCardDealFx = null;
  kingdomCardDealFxNodes.forEach((node) => node?.remove?.());
  kingdomCardDealFxNodes.clear();
}

function captureKingdomCardDealFx(playerIndex, play) {
  if (String(play?.type || '') !== 'set') return null;
  const hand = s?.players?.[playerIndex]?.hand;
  if (!Array.isArray(hand) || hand.length <= 0) return null;
  const selectedIds = Array.isArray(play?.selectedIds) ? play.selectedIds.filter(Boolean) : [];
  const selectedIndexes = selectedIds.length > 0
    ? selectedIds.map((id) => hand.findIndex((card) => card?.id === id))
    : (Array.isArray(play?.selected) ? play.selected.map(Number) : []);
  const targetNodes = Array.from(ui.trick?.children || []).slice(0, Math.max(1, selectedIndexes.length));
  const targetRects = targetNodes.map(snapshotKingdomFxRect).filter(Boolean);
  const firstTarget = targetRects[0] || snapshotKingdomFxRect(ui.trick);
  const sourcePoint = getKingdomPlaySourcePoint(playerIndex);
  const fallbackWidth = Math.max(32, Number(firstTarget?.width) || 64) * 0.72;
  const fallbackHeight = Math.max(50, Number(firstTarget?.height) || 102) * 0.72;
  const fallbackRect = sourcePoint ? {
    left: sourcePoint.x - (fallbackWidth / 2),
    top: sourcePoint.y - (fallbackHeight / 2),
    width: fallbackWidth,
    height: fallbackHeight,
    right: sourcePoint.x + (fallbackWidth / 2),
    bottom: sourcePoint.y + (fallbackHeight / 2)
  } : null;
  const sourceRects = selectedIndexes.map((cardIndex) => {
    const handNode = isLocalPlayer(playerIndex)
      ? ui.hand?.querySelector?.(`.tarot-card[data-card-index="${cardIndex}"]`)
      : null;
    return snapshotKingdomFxRect(handNode) || fallbackRect;
  });
  return {
    actorIndex: playerIndex,
    playToken: getKingdomPlayToken(play),
    sourceRects,
    targetRects,
    capturedAt: Date.now()
  };
}

function playKingdomCardDealFx(playerIndex, cards, capturedFx = null) {
  if (typeof document === 'undefined' || !Array.isArray(cards) || cards.length <= 0) return 0;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (reducedMotion) return 80;

  const targetNodes = Array.from(ui.trick?.children || []).slice(0, cards.length);
  const liveTargetRects = targetNodes.map(snapshotKingdomFxRect);
  const targetRects = liveTargetRects.some(Boolean)
    ? liveTargetRects
    : (Array.isArray(capturedFx?.targetRects) ? capturedFx.targetRects : []);
  const fallbackPoint = getKingdomPlaySourcePoint(playerIndex);
  const durationMs = 390;
  const staggerMs = 58;

  cards.forEach((card, index) => {
    const targetRect = targetRects[index] || targetRects[0];
    if (!targetRect) return;
    const targetWidth = Math.max(28, Number(targetRect.width) || 64);
    const targetHeight = Math.max(44, Number(targetRect.height) || 102);
    const fallbackWidth = targetWidth * 0.72;
    const fallbackHeight = targetHeight * 0.72;
    const sourceRect = capturedFx?.sourceRects?.[index] || (fallbackPoint ? {
      left: fallbackPoint.x - (fallbackWidth / 2),
      top: fallbackPoint.y - (fallbackHeight / 2),
      width: fallbackWidth,
      height: fallbackHeight
    } : targetRect);
    const sourceWidth = Math.max(24, Number(sourceRect?.width) || fallbackWidth);
    const sourceHeight = Math.max(38, Number(sourceRect?.height) || fallbackHeight);
    const startLeft = Number(sourceRect?.left) || targetRect.left;
    const startTop = Number(sourceRect?.top) || targetRect.top;
    const dx = targetRect.left - startLeft;
    const dy = targetRect.top - startTop;
    const targetScaleX = targetWidth / sourceWidth;
    const targetScaleY = targetHeight / sourceHeight;
    const midScaleX = 1 + ((targetScaleX - 1) * 0.58);
    const midScaleY = 1 + ((targetScaleY - 1) * 0.58);
    const rotation = (index - ((cards.length - 1) / 2)) * 2.4;
    const delayMs = index * staggerMs;

    const ghost = cardNode(card, { clickable: false });
    ghost.disabled = false;
    ghost.tabIndex = -1;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.dataset.actorIndex = String(playerIndex);
    ghost.classList.remove('is-clickable', 'is-static', 'is-selected', 'is-entering', 'is-call-arriving', 'is-leaving');
    ghost.classList.add('tarot-kingdom-card-deal-ghost');
    ghost.style.left = `${startLeft}px`;
    ghost.style.top = `${startTop}px`;
    ghost.style.width = `${sourceWidth}px`;
    ghost.style.minWidth = `${sourceWidth}px`;
    ghost.style.height = `${sourceHeight}px`;
    ghost.style.minHeight = `${sourceHeight}px`;
    ghost.style.setProperty('--tarot-card-w', `${sourceWidth}px`);
    ghost.style.setProperty('--tarot-card-h', `${sourceHeight}px`);
    document.body.appendChild(ghost);
    kingdomCardDealFxNodes.add(ghost);

    const flight = ghost.animate([
      {
        offset: 0,
        opacity: 0.78,
        transform: `translate3d(0, 0, 0) rotateZ(${rotation * -0.45}deg) scale(1, 1)`,
        filter: 'brightness(1) saturate(1) drop-shadow(0 5px 5px rgba(0, 0, 0, 0.72))'
      },
      {
        offset: 0.18,
        opacity: 1,
        transform: `translate3d(${dx * 0.14}px, ${(dy * 0.12) - 16}px, 0) rotateZ(${rotation}deg) scale(1.04, 1.04)`,
        filter: 'brightness(1.18) saturate(1.1) drop-shadow(0 12px 10px rgba(0, 0, 0, 0.64))'
      },
      {
        offset: 0.68,
        opacity: 1,
        transform: `translate3d(${dx * 0.7}px, ${(dy * 0.68) - 24}px, 0) rotateZ(${rotation * 0.38}deg) scale(${midScaleX}, ${midScaleY})`,
        filter: 'brightness(1.1) saturate(1.06) drop-shadow(0 15px 12px rgba(0, 0, 0, 0.7))'
      },
      {
        offset: 1,
        opacity: 1,
        transform: `translate3d(${dx}px, ${dy}px, 0) rotateZ(0deg) scale(${targetScaleX}, ${targetScaleY})`,
        filter: 'brightness(1.28) saturate(1.08) drop-shadow(0 4px 5px rgba(0, 0, 0, 0.78))'
      }
    ], {
      duration: durationMs,
      delay: delayMs,
      easing: 'cubic-bezier(0.18, 0.78, 0.2, 1)',
      fill: 'forwards'
    });
    const removeGhost = () => {
      kingdomCardDealFxNodes.delete(ghost);
      ghost.remove();
    };
    flight.addEventListener?.('finish', removeGhost, { once: true });
    flight.addEventListener?.('cancel', removeGhost, { once: true });

    const ring = document.createElement('span');
    ring.className = 'tarot-kingdom-card-land-ring';
    ring.setAttribute('aria-hidden', 'true');
    ring.style.left = `${targetRect.left + (targetWidth / 2)}px`;
    ring.style.top = `${targetRect.top + (targetHeight / 2)}px`;
    ring.style.width = `${targetWidth * 0.9}px`;
    ring.style.height = `${targetHeight * 0.62}px`;
    document.body.appendChild(ring);
    kingdomCardDealFxNodes.add(ring);
    const ringFx = ring.animate([
      { opacity: 0, transform: 'translate(-50%, -50%) scale(0.45)' },
      { offset: 0.2, opacity: 0.92, transform: 'translate(-50%, -50%) scale(0.72)' },
      { opacity: 0, transform: 'translate(-50%, -50%) scale(1.34)' }
    ], {
      duration: 240,
      delay: delayMs + durationMs - 70,
      easing: 'cubic-bezier(0.18, 0.78, 0.24, 1)',
      fill: 'forwards'
    });
    const removeRing = () => {
      kingdomCardDealFxNodes.delete(ring);
      ring.remove();
    };
    ringFx.addEventListener?.('finish', removeRing, { once: true });
    ringFx.addEventListener?.('cancel', removeRing, { once: true });
  });
  return durationMs + (Math.max(0, cards.length - 1) * staggerMs);
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
  const theWorld = Array.isArray(src)
    && src.length === 5
    && src.every((card) => card?.kind === 'major')
    && src.some((card) => Number(card?.number) === 21);
  let key = null, primary = [];
  if ((grp[0]?.n || 0) >= 5) { key = 'FiveKind'; primary = [grp[0].v]; }
  else if (st && flush) { key = 'StraightFlush'; primary = [st]; }
  else if (theWorld) { key = 'TheWorld'; primary = [21]; }
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
  return best;
}

function cloneKingdomSnapshotValue(value, fallback = {}) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch (_) {
    return fallback;
  }
}

function getKingdomEquipmentReferenceIds(reference) {
  if (!reference) return [];
  if (typeof reference === 'string' || typeof reference === 'number') return [String(reference).trim()].filter(Boolean);
  return [
    reference.itemId,
    reference.ItemId,
    reference.id,
    reference.Id,
    reference.instanceId,
    reference.InstanceId,
    reference.itemInstanceId,
    reference.ItemInstanceId,
    reference.stackId,
    reference.StackId
  ].map((entry) => String(entry || '').trim()).filter(Boolean);
}

function getKingdomItemData(item) {
  if (!item || typeof item !== 'object') return {};
  const displayProperties = item.DisplayProperties || item.displayProperties || {};
  return item.customData || item.CustomData || displayProperties.customData || displayProperties || item;
}

function findKingdomItemReference(reference, itemSource) {
  if (reference && typeof reference === 'object' && (reference.customData || reference.CustomData)) return reference;
  const ids = getKingdomEquipmentReferenceIds(reference);
  if (!ids.length) return null;
  const rows = Array.isArray(itemSource) ? itemSource : Object.values(itemSource || {});
  return rows.find((item) => {
    const itemIds = getKingdomEquipmentReferenceIds(item);
    if (item?.instances && Array.isArray(item.instances)) itemIds.push(...item.instances.map((entry) => String(entry || '')));
    return ids.some((id) => itemIds.includes(id));
  }) || null;
}

function readKingdomItemNumber(item, keys) {
  const data = getKingdomItemData(item);
  for (const key of keys) {
    const value = Number(data?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function deriveLoadedKingdomEquipmentStats(equipment, itemSource) {
  const totals = { Power: 0, Defense: 0, Agi: 0, Int: 0 };
  const add = (reference, options = {}) => {
    const item = findKingdomItemReference(reference, itemSource);
    const itemData = getKingdomItemData(item);
    const isShield = String(itemData?.Category || '').trim().toLowerCase() === 'shield'
      || String(itemData?.WeaponType || itemData?.weaponType || '').trim().toLowerCase() === 'shield'
      || getKingdomEquipmentReferenceIds(item)[0]?.toLowerCase().includes('shield');
    const defense = readKingdomItemNumber(item, ['Defense', 'Def']);
    totals.Power += readKingdomItemNumber(item, ['Power', 'Atk', 'Attack']);
    totals.Agi += readKingdomItemNumber(item, ['Agi', 'Speed']);
    totals.Int += readKingdomItemNumber(item, ['Int', 'Intelligence']);
    if (options.replaceDefense) totals.Defense = defense;
    else if (!isShield) totals.Defense += defense;
  };
  add(equipment?.RightHand);
  add(equipment?.LeftHand);
  add(equipment?.Armor, { replaceDefense: true });
  add(equipment?.Accessory);
  return totals;
}

function resolveLoadedKingdomWeaponReference(reference, itemSource) {
  const item = findKingdomItemReference(reference, itemSource);
  const data = getKingdomItemData(item);
  const explicit = String(data?.WeaponType || data?.weaponType || data?.Type || '').trim().toLowerCase();
  if (explicit) return explicit;
  const category = String(data?.Category || '').trim().toLowerCase();
  if (category === 'shield') return 'shield';
  const id = getKingdomEquipmentReferenceIds(reference)[0]?.toLowerCase() || '';
  if (id.includes('axe_big') || id.includes('greataxe')) return 'axe_big';
  if (id.includes('sword_big') || id.includes('greatsword')) return 'sword_big';
  if (id.includes('gun_big') || id.includes('rifle') || id.includes('cannon')) return 'gun_big';
  if (id.includes('axe')) return 'axe';
  if (id.includes('wand')) return 'wand';
  if (id.includes('staff')) return 'staff';
  if (id.includes('dagger')) return 'dagger';
  if (id.includes('polearm') || id.includes('spear')) return 'polearm';
  if (id.includes('gun') || id.includes('pistol') || id.includes('rifle')) return 'gun';
  if (id.includes('bow')) return 'bow';
  if (id.includes('mace') || id.includes('hammer') || id.includes('blunt') || id.includes('club')) return 'blunt';
  if (id.includes('shield')) return 'shield';
  if (id.includes('sword')) return 'sword';
  return 'unarmed';
}

function resolveLoadedKingdomWeaponTypes(equipment, itemSource) {
  return normalizeTarotKingdomWeaponTypes([
    resolveLoadedKingdomWeaponReference(equipment?.RightHand, itemSource),
    resolveLoadedKingdomWeaponReference(equipment?.LeftHand, itemSource)
  ].filter((weapon) => weapon && weapon !== 'unarmed'));
}

function resolveLoadedKingdomWeaponType(equipment, itemSource) {
  return resolveLoadedKingdomWeaponTypes(equipment, itemSource)[0] || 'unarmed';
}

function buildLoadedLocalKingdomCharacter() {
  const stats = getMyPlayerStats?.() || {};
  const hasLoadedStats = ['MaxHP', 'HP', 'ちから', 'みのまもり', 'かしこさ', 'すばやさ', 'Level']
    .some((key) => Object.prototype.hasOwnProperty.call(stats, key));
  if (!hasLoadedStats || (!Number(stats.MaxHP) && !Number(stats.HP))) return null;
  const equipment = cloneKingdomSnapshotValue(getMyCurrentEquipment?.() || {}, {});
  const itemSource = cloneKingdomSnapshotValue(getMyInventory?.() || [], []);
  const equipmentStats = deriveLoadedKingdomEquipmentStats(equipment, itemSource);
  const level = Math.max(1, Math.floor(Number(stats.Level) || 1));
  const crewRankInfo = getMyCrewRankInfo?.() || null;
  return normalizeTarotKingdomCharacter({
    version: 2,
    source: 'playfab',
    playFabId: String(window.myPlayFabId || '').trim(),
    displayName: String(window.myPlayFabDisplayName || window.myLineProfile?.displayName || 'あなた').trim() || 'あなた',
    level,
    rankLabel: String(crewRankInfo?.crewRankTitle || getPlayerRankName(level) || `Lv${level}`),
    avatarBase: cloneKingdomSnapshotValue(window.myAvatarBaseInfo || {
      Race: 'human', AvatarColor: 'brown', SkinColorIndex: 1, FaceIndex: 1,
      HairStyleIndex: 1, HairColorIndex: 1, FacialHairStyleIndex: 0, level
    }),
    equipment,
    itemSource,
    tarotDeck: cloneKingdomSnapshotValue(getMyTarotBattleDeckSnapshot?.() || [], []),
    combat: {
      maxHp: Number(stats.MaxHP || stats.HP),
      power: (Number(stats.ちから) || 0) + equipmentStats.Power,
      defense: (Number(stats.みのまもり) || 0) + equipmentStats.Defense,
      intelligence: (Number(stats.かしこさ) || 0) + equipmentStats.Int,
      speed: (Number(stats.すばやさ ?? stats.Agi ?? stats.Speed) || 0) + equipmentStats.Agi,
      weaponType: resolveLoadedKingdomWeaponType(equipment, itemSource),
      weaponTypes: resolveLoadedKingdomWeaponTypes(equipment, itemSource)
    }
  });
}

function buildPreviewKingdomCharacter() {
  return normalizeTarotKingdomCharacter({
    version: 2,
    source: 'preview',
    playFabId: 'preview-player',
    displayName: String(window.myPlayFabDisplayName || 'Preview'),
    level: 12,
    rankLabel: 'プレビュー騎士',
    avatarBase: {
      Race: 'human', AvatarColor: 'brown', SkinColorIndex: 2, FaceIndex: 1,
      HairStyleIndex: 3, HairColorIndex: 2, FacialHairStyleIndex: 0, level: 12
    },
    equipment: { RightHand: 'sword_2', LeftHand: 'shield_1' },
    itemSource: {
      sword_2: { itemId: 'sword_2', customData: { Category: 'Weapon', WeaponType: 'sword', sprite_index: '2' } },
      shield_1: { itemId: 'shield_1', customData: { Category: 'Shield', WeaponType: 'shield', sprite_index: '1' } }
    },
    tarotDeck: [
      { suit: 'Sword', rank: 1, skillName: '風切り', effectClass: 'attack', power: 80, priority: true },
      { suit: 'Sword', rank: 5, skillName: '乱気流', effectClass: 'attack', power: 60, effectCodes: [{ type: 'confusion', chance: 0.3 }] },
      { suit: 'Cup', rank: 3, skillName: '雫の祝福', effectClass: 'support', effectCodes: [{ type: 'healOrCleanseBurn', target: 'self', value: 10 }] },
      { suit: 'Pentacle', rank: 8, skillName: '地鳴り', effectClass: 'attack', power: 90, effectCodes: [{ type: 'fear', chance: 0.25 }] },
      { suit: 'Wand', rank: 10, skillName: '大火球', effectClass: 'attack', power: 130, effectCodes: [{ type: 'burn', chance: 0.4 }] }
    ],
    combat: { maxHp: 124, power: 42, defense: 31, intelligence: 27, speed: 25, weaponType: 'sword', weaponTypes: ['sword', 'shield'] }
  });
}

function hasFrozenKingdomCharacters(state = s) {
  return !!(
    state?.characterSnapshotReady
    && Array.isArray(state?.players)
    && state.players.length === getKingdomPlayerCount(state)
    && state.players.every((player) => player?.character?.combat?.maxHp > 0)
  );
}

function getKingdomCharacterRosterFingerprint(state = s) {
  if (!Array.isArray(state?.players)) return '';
  return JSON.stringify(state.players.map((player, seat) => ({
    seat,
    isNpc: !!player?.isNpc,
    uid: String(player?.uid || '').trim(),
    playFabId: String(player?.playFabId || '').trim()
  })));
}

function applyFrozenKingdomCharacters(characters, targetState = s) {
  if (!targetState || s !== targetState || !Array.isArray(characters) || characters.length !== targetState.players.length) return false;
  targetState.players.forEach((player, index) => {
    const character = normalizeTarotKingdomCharacter(characters[index], {
      displayName: player.name || `P${index + 1}`
    });
    player.character = cloneKingdomSnapshotValue(character, character);
    player.name = character.displayName;
    if (character.playFabId) player.playFabId = character.playFabId;
    player.maxHp = character.combat.maxHp;
    player.hp = character.combat.maxHp;
  });
  targetState.characterSnapshotReady = true;
  targetState.characterSnapshotCreatedAt = Date.now();
  return true;
}

async function prepareKingdomCharacterSnapshots(options = {}) {
  if (!s) return false;
  if (hasFrozenKingdomCharacters() && options.force !== true) return true;
  if (kingdomCharacterLoadPromise) return kingdomCharacterLoadPromise;
  const targetState = s;
  const targetGeneration = kingdomStateGeneration;
  const rosterFingerprint = getKingdomCharacterRosterFingerprint(targetState);
  const isCurrentState = () => s === targetState && kingdomStateGeneration === targetGeneration;
  const isCurrentRoster = () => isCurrentState()
    && getKingdomCharacterRosterFingerprint(targetState) === rosterFingerprint;
  const loadPromise = (async () => {
    const online = options.online === true && isNetModeActive();
    const profileLoader = typeof options.profileLoader === 'function'
      ? options.profileLoader
      : getTarotKingdomCombatProfiles;
    const humanSeats = targetState.players
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => !player.isNpc);
    let humanCharacters = [];
    if (window.__TAROT_KINGDOM_PREVIEW__ === true && typeof options.profileLoader !== 'function') {
      humanCharacters = humanSeats.map(({ index }) => index === 0
        ? buildPreviewKingdomCharacter()
        : createTarotKingdomNpcCharacter({ seat: Math.max(1, index), level: 12, displayName: targetState.players[index]?.name }));
    } else {
      const requesterPlayFabId = String(options.requesterPlayFabId || window.myPlayFabId || '').trim();
      const targetPlayFabIds = humanSeats.map(({ player }) => String(player.playFabId || '').trim());
      if (online && (!requesterPlayFabId || targetPlayFabIds.some((id) => !id))) {
        if (!isCurrentState()) return false;
        targetState.characterSnapshotReady = false;
        targetState.message = 'キャラクター情報を取得できない参加者がいます。参加状態を確認して再取得してください。';
        return false;
      }
      if (requesterPlayFabId && targetPlayFabIds.length > 0 && targetPlayFabIds.every(Boolean)) {
        try {
          const response = await profileLoader(requesterPlayFabId, targetPlayFabIds, {
            isSilent: true,
            roomId: online ? tkNet.roomId : ''
          });
          const rows = Array.isArray(response?.characters) ? response.characters : [];
          const byId = new Map(rows.map((character) => [String(character?.playFabId || '').trim(), character]));
          humanCharacters = humanSeats.map(({ player }) => byId.get(String(player.playFabId || '').trim()) || null);
        } catch (error) {
          console.warn('[tarotKingdom] combat profile load failed:', error);
          humanCharacters = [];
        }
        if (!isCurrentRoster()) {
          if (isCurrentState()) {
            targetState.characterSnapshotReady = false;
            targetState.message = '参加者が変更されました。最新メンバーで戦闘プロフィールを再取得してください。';
          }
          return false;
        }
      }
      if (!online && humanSeats.length === 1 && (!humanCharacters[0])) {
        humanCharacters = [buildLoadedLocalKingdomCharacter()];
      }
      if (humanCharacters.length !== humanSeats.length || humanCharacters.some((character) => !character)) {
        if (!isCurrentState()) return false;
        targetState.characterSnapshotReady = false;
        targetState.message = online
          ? '戦闘プロフィールの取得に失敗しました。再取得してから開始してください。'
          : 'キャラクター能力・装備が未読込です。ホームへ戻って読み込み後に再試行してください。';
        return false;
      }
    }

    const levelBySeat = new Map();
    humanSeats.forEach(({ index }, rowIndex) => {
      levelBySeat.set(index, Math.max(1, Number(humanCharacters[rowIndex]?.level) || 1));
    });
    const averageLevel = Math.max(1, Math.round(
      Array.from(levelBySeat.values()).reduce((sum, level) => sum + level, 0) / Math.max(1, levelBySeat.size)
    ));
    if (!isCurrentRoster()) {
      if (isCurrentState()) {
        targetState.characterSnapshotReady = false;
        targetState.message = '参加者が変更されました。最新メンバーで戦闘プロフィールを再取得してください。';
      }
      return false;
    }
    const characters = targetState.players.map((player, index) => {
      const humanRow = humanSeats.findIndex((entry) => entry.index === index);
      if (humanRow >= 0) return humanCharacters[humanRow];
      if (kingdomExplorationSession) {
        if (player?.isPet) {
          return createTarotKingdomPetCharacter({
            pet: player.pet || kingdomExplorationSession.context?.currentPet,
            level: levelBySeat.get(getLocalPlayerIndex()) || averageLevel
          });
        }
        return createTarotKingdomExplorationNpcCharacter({
          seat: getKingdomMercenaryOrdinal(targetState.players, index),
          level: levelBySeat.get(getLocalPlayerIndex()) || averageLevel,
          playerAvatarBase: humanCharacters[0]?.avatarBase || {}
        });
      }
      return createTarotKingdomNpcCharacter({
        seat: Math.max(1, Math.min(3, index)),
        level: online ? averageLevel : (levelBySeat.get(getLocalPlayerIndex()) || averageLevel),
        displayName: player.name || `NPC${index}`
      });
    });
    return applyFrozenKingdomCharacters(characters, targetState);
  })();
  kingdomCharacterLoadPromise = loadPromise;
  try {
    return await loadPromise;
  } finally {
    if (kingdomCharacterLoadPromise === loadPromise) kingdomCharacterLoadPromise = null;
  }
}

function getKingdomMonsterConfig(monsterId = '') {
  const normalizedId = String(monsterId || '');
  const productionMatch = KINGDOM_MONSTER_ROSTER.find((entry) => entry.id === normalizedId);
  if (productionMatch) return productionMatch;
  const demoMatch = KINGDOM_DEMO_MONSTER_ROSTER.find((entry) => entry.id === normalizedId);
  if (demoMatch) return demoMatch;
  return KINGDOM_MONSTER_ROSTER[0];
}

function getKingdomDemoMonsterOptions() {
  if (window.__TAROT_KINGDOM_PREVIEW__ !== true) return [];
  return KINGDOM_DEMO_MONSTER_ROSTER.map((monster) => ({
    id: monster.id,
    name: monster.name,
    volume: Number(monster.volume) || 0,
    number: Number(monster.number) || 0,
    sizeClass: String(monster.sizeClass || 'normal'),
    isBoss: monster.isBoss === true
  }));
}

function getKingdomDemoPetOptions() {
  return getKingdomDemoMonsterOptions().filter((monster) => monster.isBoss !== true);
}

function getKingdomDemoBattlefieldOptions() {
  if (window.__TAROT_KINGDOM_PREVIEW__ !== true) return [];
  return Object.values(TAROT_KINGDOM_BATTLEFIELDS).map((battlefield) => ({
    id: battlefield.id,
    label: battlefield.label,
    shipSide: battlefield.shipSide
  }));
}

async function setKingdomDemoBattlefield(battlefieldId = '') {
  if (window.__TAROT_KINGDOM_PREVIEW__ !== true || !s?.battle) return false;
  const battlefield = getTarotKingdomBattlefieldById(battlefieldId);
  await preloadKingdomBattlefieldImage(battlefield.id);
  s.battle.battlefield = createTarotKingdomBattlefieldSnapshot('', battlefield.id);
  render();
  return true;
}

function setKingdomDemoEnemy(monsterId = '') {
  if (window.__TAROT_KINGDOM_PREVIEW__ !== true) return false;
  const monster = KINGDOM_DEMO_MONSTER_ROSTER.find((entry) => entry.id === String(monsterId || ''));
  if (!monster) return false;
  kingdomDemoEnemyId = monster.id;
  if (s?.battle?.enemy) {
    const combatProfile = Number(s.rules?.enemyCombatVersion ?? 1) >= 1
      ? createTarotKingdomEnemyCombatProfile(monster, s.handNo)
      : createLegacyKingdomEnemyCombatProfile(s.handNo);
    s.battle.enemy = {
      ...s.battle.enemy,
      id: monster.id,
      name: monster.name,
      maxHp: combatProfile.maxHp,
      hp: combatProfile.maxHp,
      passDamage: combatProfile.passDamage,
      areaDamage: combatProfile.areaDamage,
      defense: combatProfile.defense,
      speed: combatProfile.speed,
      archetype: combatProfile.archetype,
      ailment: combatProfile.ailment,
      rushStartedAtSeq: null,
      defeatedAtSeq: null,
      finishedAt: null,
      petrifiedUntilClear: false,
      areaAttackSealedUntilClear: false
    };
    clearKingdomBattleEffects();
  }
  kingdomMonsterAnimationKey = '';
  clearKingdomMonsterFrameTimer();
  clearKingdomEnemyFinisherTimer();
  const idleAnimation = monster.animations?.idle;
  if (ui.battleEnemySprite && idleAnimation) {
    setKingdomMonsterFrame(ui.battleEnemySprite, monster, idleAnimation, 0);
  }
  render();
  return true;
}

function setKingdomDemoPet(monsterId = '') {
  if (window.__TAROT_KINGDOM_PREVIEW__ !== true) return false;
  const normalizedId = String(monsterId || '').trim();
  const monster = normalizedId
    ? KINGDOM_DEMO_MONSTER_ROSTER.find((entry) => (
        entry.id === normalizedId && entry.isBoss !== true
      ))
    : null;
  if (normalizedId && !monster) return false;
  const battlefield = cloneKingdomSnapshotValue(s?.battle?.battlefield, null);
  kingdomDemoPetId = monster?.id || '';
  buildTarotKingdomDebugBattleState({
    playerCount: 4,
    pet: monster
      ? {
          monsterId: monster.id,
          monsterName: monster.name,
          number: Number(monster.number) || 1,
          volume: Number(monster.volume) || 1
        }
      : null,
    handCounts: [8, 8, 8, 8],
    withTrick: false,
    turnIndex: 0,
    enableNpcSeats: true
  });
  if (battlefield && s?.battle) {
    s.battle.battlefield = battlefield;
    render();
  }
  if (ui.demoPetSelect && ui.demoPetSelect.value !== kingdomDemoPetId) {
    ui.demoPetSelect.value = kingdomDemoPetId;
  }
  return true;
}

function getKingdomMonsterAnimationDurationMs(monsterId = '', animationName = 'idle') {
  const monster = getKingdomMonsterConfig(monsterId);
  const animation = monster?.animations?.[animationName] || monster?.animations?.idle;
  const frameCount = Math.max(1, Number(animation?.frameCount) || 1);
  const fps = Math.max(1, Number(animation?.fps) || 12);
  return Math.max(1, Math.round((frameCount / fps) * 1000));
}

function createLegacyKingdomEnemyCombatProfile(roundIndex = 0) {
  const safeRoundIndex = Math.max(0, Math.min(TOTAL_HANDS - 1, Number(roundIndex) || 0));
  return {
    maxHp: 420 + (safeRoundIndex * 80),
    passDamage: 18 + (safeRoundIndex * 2),
    areaDamage: 10 + (safeRoundIndex * 2),
    defense: 0,
    speed: 0,
    archetype: 'legacy',
    ailment: null
  };
}

function normalizeKingdomExplorationStageState(value = null) {
  if (!value || typeof value !== 'object') return null;
  const stageNo = Math.max(1, Math.min(11, Math.floor(Number(value.stageNo) || 1)));
  const monsters = (Array.isArray(value.monsters) ? value.monsters : [])
    .slice(0, TOTAL_HANDS)
    .map((entry, index) => {
      const monsterId = String(entry?.monsterId || entry?.id || '').trim();
      const monster = KINGDOM_MONSTER_ROSTER.find((candidate) => candidate.id === monsterId);
      if (!monster || monster.isBoss === true) return null;
      return {
        order: index + 1,
        monsterId,
        monsterName: String(entry?.monsterName || monster.name),
        archetype: String(entry?.archetype || 'balanced'),
        threatLevel: Math.max(1, Math.min(44, Math.floor(
          Number(entry?.threatLevel) || (((stageNo - 1) * TOTAL_HANDS) + index + 1)
        ))),
        isBoss: false
      };
    })
    .filter(Boolean);
  if (monsters.length !== TOTAL_HANDS) return null;
  const supplyQueue = (Array.isArray(value.supplyQueue) ? value.supplyQueue : [])
    .slice(0, TOTAL_HANDS - 1)
    .map((entry, index) => ({
      slot: index,
      itemId: String(entry?.itemId || ''),
      displayName: String(entry?.displayName || entry?.name || '補給品'),
      effectiveUnits: Math.max(1, Math.min(3, Math.floor(Number(entry?.effectiveUnits) || 1)))
    }));
  const appliedSupplyTransitions = Array.from(new Set(
    (Array.isArray(value.appliedSupplyTransitions) ? value.appliedSupplyTransitions : [])
      .map((entry) => Math.floor(Number(entry)))
      .filter((entry) => entry >= 1 && entry < TOTAL_HANDS)
  ));
  const finishers = (Array.isArray(value.finishers) ? value.finishers : [])
    .slice(0, TOTAL_HANDS)
    .map((entry) => ({
      roundNo: Math.max(1, Math.min(TOTAL_HANDS, Math.floor(Number(entry?.roundNo) || 1))),
      playerIndex: Math.max(0, Math.floor(Number(entry?.playerIndex) || 0)),
      playFabId: String(entry?.playFabId || ''),
      isNpc: entry?.isNpc === true,
      monsterId: String(entry?.monsterId || '')
    }));
  return {
    version: 1,
    stageNo,
    stageId: String(value.stageId || `tarot_stage_${stageNo}`),
    stageName: String(value.stageName || value.destinationName || `STAGE ${stageNo}`),
    battlefieldId: String(value.battlefieldId || ''),
    atmosphereTone: String(value.atmosphereTone || ''),
    monsters,
    supplyQueue,
    appliedSupplyTransitions,
    usedSupplies: Array.isArray(value.usedSupplies)
      ? value.usedSupplies.slice(0, TOTAL_HANDS - 1).map((entry) => ({ ...entry }))
      : [],
    finishers,
    lastSupplyResult: value.lastSupplyResult && typeof value.lastSupplyResult === 'object'
      ? { ...value.lastSupplyResult }
      : null
  };
}

function getKingdomStageMonster(roundIndex = 0, stageState = s?.stage) {
  const stage = normalizeKingdomExplorationStageState(stageState);
  if (!stage) return null;
  const safeRoundIndex = Math.max(0, Math.min(TOTAL_HANDS - 1, Math.floor(Number(roundIndex) || 0)));
  return stage.monsters[safeRoundIndex] || null;
}

function applyKingdomStageTransitionSupply() {
  const stage = normalizeKingdomExplorationStageState(s?.stage);
  if (!stage || Number(s?.handNo || 0) <= 0) return null;
  const transitionNo = Math.max(1, Math.min(TOTAL_HANDS - 1, Math.floor(Number(s.handNo) || 1)));
  if (stage.appliedSupplyTransitions.includes(transitionNo)) {
    s.stage = stage;
    return stage.lastSupplyResult;
  }
  stage.appliedSupplyTransitions.push(transitionNo);
  const supply = stage.supplyQueue[transitionNo - 1] || null;
  if (!supply) {
    stage.lastSupplyResult = {
      transitionNo,
      used: false,
      healRate: 0
    };
    s.stage = stage;
    return stage.lastSupplyResult;
  }
  const healRate = Math.max(0.1, Math.min(0.3, supply.effectiveUnits * 0.1));
  const healed = s.players.map((player, playerIndex) => {
    const maxHp = Math.max(
      1,
      Math.floor(Number(player?.character?.combat?.maxHp) || Number(player.maxHp) || KINGDOM_FALLBACK_PLAYER_MAX_HP)
    );
    const hpBefore = Math.max(0, Math.min(maxHp, Math.floor(Number(player.hp) || 0)));
    const amount = Math.max(1, Math.round(maxHp * healRate));
    const hpAfter = hpBefore <= 0 ? amount : Math.min(maxHp, hpBefore + amount);
    player.maxHp = maxHp;
    player.hp = hpAfter;
    return { playerIndex, hpBefore, hpAfter, amount: hpAfter - hpBefore, revived: hpBefore <= 0 };
  });
  const result = {
    transitionNo,
    used: true,
    itemId: supply.itemId,
    displayName: supply.displayName,
    effectiveUnits: supply.effectiveUnits,
    healRate,
    healed
  };
  stage.usedSupplies.push(result);
  stage.lastSupplyResult = result;
  s.stage = stage;
  log(`${supply.displayName}: パーティーのHPを${Math.round(healRate * 100)}%回復`);
  return result;
}

function createKingdomBattleState(
  roundIndex = 0,
  active = false,
  destinationId = '',
  enemyCombatVersion = 1,
  playerCount = PLAYERS.length,
  stageState = s?.stage
) {
  const safeRoundIndex = Math.max(0, Math.min(TOTAL_HANDS - 1, Number(roundIndex) || 0));
  const normalizedStage = normalizeKingdomExplorationStageState(stageState);
  const stageMonster = getKingdomStageMonster(safeRoundIndex, normalizedStage);
  const resolvedDestinationId = String(
    destinationId || kingdomExplorationSession?.context?.destinationId || ''
  ).trim();
  const battlefield = createTarotKingdomBattlefieldSnapshot(
    resolvedDestinationId,
    normalizedStage?.battlefieldId || kingdomExplorationSession?.context?.battlefieldId || ''
  );
  const selectedExplorationMonster = kingdomExplorationMonsterId
    ? KINGDOM_MONSTER_ROSTER.find((entry) => entry.id === kingdomExplorationMonsterId)
    : null;
  const selectedDemoMonster = window.__TAROT_KINGDOM_PREVIEW__ === true && kingdomDemoEnemyId
    ? KINGDOM_DEMO_MONSTER_ROSTER.find((entry) => entry.id === kingdomDemoEnemyId)
    : null;
  const stageMonsterConfig = stageMonster
    ? KINGDOM_MONSTER_ROSTER.find((entry) => entry.id === stageMonster.monsterId)
    : null;
  const monster = stageMonsterConfig || selectedExplorationMonster || selectedDemoMonster || KINGDOM_DEFAULT_MONSTER;
  const combatProfile = Number(enemyCombatVersion) >= 1
    ? createTarotKingdomEnemyCombatProfile(monster, safeRoundIndex, stageMonster
      ? {
          stageVersion: 1,
          stageNo: normalizedStage.stageNo,
          roundNo: safeRoundIndex + 1,
          threatLevel: stageMonster.threatLevel,
          archetype: stageMonster.archetype
        }
      : {})
    : createLegacyKingdomEnemyCombatProfile(safeRoundIndex);
  const maxHp = combatProfile.maxHp;
  return {
    version: 3,
    active: !!active,
    outcome: null,
    resultReason: null,
    roundIndex: safeRoundIndex,
    eventSeq: 0,
    events: [],
    battlefield,
    effects: {
      enemy: {},
      party: {},
      players: Array.from({ length: normalizeKingdomPlayerCount(playerCount) }, () => ({})),
      enemyAttackedSinceClear: false
    },
    enemy: {
      id: monster.id,
      name: monster.name,
      maxHp,
      hp: maxHp,
      rushStartedAtSeq: null,
      defeatedAtSeq: null,
      finishedAt: null,
      petrifiedUntilClear: false,
      areaAttackSealedUntilClear: false,
      passDamage: combatProfile.passDamage,
      areaDamage: combatProfile.areaDamage,
      defense: combatProfile.defense,
      speed: combatProfile.speed,
      archetype: combatProfile.archetype,
      threatLevel: Math.max(0, Math.floor(Number(combatProfile.threatLevel) || 0)),
      ailment: combatProfile.ailment
    }
  };
}

function normalizeKingdomBattleState(
  rawBattle,
  roundIndex = 0,
  active = false,
  enemyCombatVersion = 1,
  playerCount = PLAYERS.length,
  stageState = null
) {
  const safePlayerCount = normalizeKingdomPlayerCount(playerCount);
  const base = createKingdomBattleState(roundIndex, active, '', enemyCombatVersion, safePlayerCount, stageState);
  const incoming = rawBattle && typeof rawBattle === 'object' ? rawBattle : {};
  const incomingBattlefield = incoming.battlefield && typeof incoming.battlefield === 'object'
    ? incoming.battlefield
    : {};
  const battlefield = createTarotKingdomBattlefieldSnapshot(
    String(incomingBattlefield.destinationId || base.battlefield.destinationId || ''),
    String(incomingBattlefield.id || base.battlefield.id || '')
  );
  const incomingEnemy = incoming.enemy && typeof incoming.enemy === 'object' ? incoming.enemy : {};
  const monster = getKingdomMonsterConfig(String(incomingEnemy.id || base.enemy.id));
  const maxHp = Math.max(1, Math.floor(Number(incomingEnemy.maxHp) || base.enemy.maxHp));
  const hp = Math.max(0, Math.min(maxHp, Math.floor(Number(incomingEnemy.hp ?? maxHp) || 0)));
  const outcome = ['victory', 'defeat'].includes(String(incoming.outcome || ''))
    ? String(incoming.outcome)
    : null;
  const events = Array.isArray(incoming.events)
    ? incoming.events.filter((event) => event && typeof event === 'object').slice(-KINGDOM_BATTLE_EVENT_LIMIT)
    : [];
  const incomingEffects = incoming.effects && typeof incoming.effects === 'object' ? incoming.effects : {};
  const normalizeEffectBucket = (bucket) => {
    const source = bucket && typeof bucket === 'object' ? bucket : {};
    const normalized = {};
    Object.entries(source).forEach(([key, effect]) => {
      if (!effect || typeof effect !== 'object') return;
      normalized[String(key)] = {
        ...effect,
        key: String(effect.key || key),
        potency: Math.max(0, Number(effect.potency) || 0),
        charges: effect.charges == null ? null : Math.max(0, Math.floor(Number(effect.charges) || 0)),
        sourceIndex: Number.isInteger(Number(effect.sourceIndex)) ? Number(effect.sourceIndex) : null
      };
    });
    return normalized;
  };
  return {
    ...base,
    ...incoming,
    version: 3,
    active: outcome ? false : (incoming.active == null ? !!active : !!incoming.active),
    outcome,
    resultReason: outcome ? String(incoming.resultReason || '') : null,
    roundIndex: Math.max(0, Math.floor(Number(incoming.roundIndex) || Number(roundIndex) || 0)),
    eventSeq: Math.max(0, Math.floor(Number(incoming.eventSeq) || 0)),
    events,
    battlefield,
    effects: {
      enemy: normalizeEffectBucket(incomingEffects.enemy),
      party: normalizeEffectBucket(incomingEffects.party),
      players: Array.from({ length: safePlayerCount }, (_, index) => normalizeEffectBucket(incomingEffects.players?.[index])),
      enemyAttackedSinceClear: !!incomingEffects.enemyAttackedSinceClear
    },
    enemy: {
      ...base.enemy,
      ...incomingEnemy,
      id: monster.id,
      name: String(incomingEnemy.name || monster.name),
      maxHp,
      hp,
      rushStartedAtSeq: incomingEnemy.rushStartedAtSeq != null && Number.isInteger(Number(incomingEnemy.rushStartedAtSeq))
        ? Math.max(1, Number(incomingEnemy.rushStartedAtSeq))
        : (
          hp <= 0 && !outcome && incomingEnemy.defeatedAtSeq != null && Number.isInteger(Number(incomingEnemy.defeatedAtSeq))
            ? Math.max(1, Number(incomingEnemy.defeatedAtSeq))
            : null
        ),
      defeatedAtSeq: outcome === 'victory' && incomingEnemy.defeatedAtSeq != null && Number.isInteger(Number(incomingEnemy.defeatedAtSeq))
        ? Math.max(1, Number(incomingEnemy.defeatedAtSeq))
        : null,
      finishedAt: outcome === 'victory' && Number.isFinite(Number(incomingEnemy.finishedAt))
        ? Math.max(0, Number(incomingEnemy.finishedAt))
        : null,
      petrifiedUntilClear: !!incomingEnemy.petrifiedUntilClear,
      areaAttackSealedUntilClear: !!incomingEnemy.areaAttackSealedUntilClear,
      passDamage: Math.max(0, Math.floor(Number(incomingEnemy.passDamage) || base.enemy.passDamage)),
      areaDamage: Math.max(0, Math.floor(Number(incomingEnemy.areaDamage) || base.enemy.areaDamage)),
      defense: enemyCombatVersion >= 1
        ? Math.max(0, Math.floor(Number(incomingEnemy.defense ?? base.enemy.defense) || 0))
        : Math.max(0, Math.floor(Number(incomingEnemy.defense) || 0)),
      speed: enemyCombatVersion >= 1
        ? Math.max(1, Math.floor(Number(incomingEnemy.speed ?? base.enemy.speed) || 1))
        : Math.max(0, Math.floor(Number(incomingEnemy.speed) || 0)),
      archetype: String(incomingEnemy.archetype || (enemyCombatVersion >= 1 ? base.enemy.archetype : 'legacy')),
      ailment: enemyCombatVersion >= 1 && (incomingEnemy.ailment || base.enemy.ailment)
        ? cloneKingdomSnapshotValue(incomingEnemy.ailment || base.enemy.ailment, null)
        : null
    }
  };
}

function resetKingdomBattleForRound() {
  if (!s) return;
  const preserveExplorationHp = !!normalizeKingdomExplorationStageState(s.stage) && Number(s.handNo || 0) > 0;
  if (preserveExplorationHp) applyKingdomStageTransitionSupply();
  s.players.forEach((player) => {
    const maxHp = Math.max(
      1,
      Math.floor(Number(player?.character?.combat?.maxHp) || Number(player.maxHp) || KINGDOM_FALLBACK_PLAYER_MAX_HP)
    );
    player.maxHp = maxHp;
    player.hp = preserveExplorationHp
      ? Math.max(0, Math.min(maxHp, Math.floor(Number(player.hp) || 0)))
      : maxHp;
  });
  s.battle = createKingdomBattleState(
    s.handNo,
    true,
    '',
    Number(s.rules?.enemyCombatVersion ?? 1),
    getKingdomPlayerCount(),
    s.stage
  );
  kingdomExplorationMonsterId = String(s.battle?.enemy?.id || kingdomExplorationMonsterId);
  const enemy = s.battle.enemy;
  const stageLabel = s.stage ? `STAGE ${s.stage.stageNo} / ENEMY ${s.handNo + 1}/${TOTAL_HANDS}` : 'BATTLE START';
  log(`${stageLabel}: ${enemy.name} HP ${enemy.hp}`);
}

function areKingdomCombatEffectsEnabled(state = s) {
  return Number(state?.rules?.combatEffectsVersion || 0) >= 1;
}

function areKingdomSummonsEnabled(state = s) {
  return Number(state?.rules?.summonVersion || 0) >= 1;
}

function areKingdomEnemyCombatStatsEnabled(state = s) {
  return Number(state?.rules?.enemyCombatVersion || 0) >= 1;
}

function areKingdomMajorArcanaGateRulesEnabled(state = s) {
  return Number(state?.rules?.majorArcanaGateVersion || 0) >= 1;
}

function areKingdomMajorArcanaSpecialRulesEnabled(state = s) {
  return Number(state?.rules?.majorArcanaSpecialVersion || 0) >= 1;
}

function getKingdomSkillAttackDuration(effectCount = 0, state = s) {
  if (areKingdomSummonsEnabled(state)) return KINGDOM_SUMMON_ATTACK_MS;
  return KINGDOM_SKILL_ATTACK_MS + (Math.max(0, Math.floor(Number(effectCount) || 0)) * 220);
}

function ensureKingdomBattleEffects(state = s) {
  if (!state?.battle) return null;
  if (!state.battle.effects || typeof state.battle.effects !== 'object') {
    state.battle.effects = {
      enemy: {},
      party: {},
      players: Array.from({ length: getKingdomPlayerCount(state) }, () => ({})),
      enemyAttackedSinceClear: false
    };
  }
  if (!state.battle.effects.enemy || typeof state.battle.effects.enemy !== 'object') state.battle.effects.enemy = {};
  if (!state.battle.effects.party || typeof state.battle.effects.party !== 'object') state.battle.effects.party = {};
  if (!Array.isArray(state.battle.effects.players)) {
    state.battle.effects.players = Array.from({ length: getKingdomPlayerCount(state) }, () => ({}));
  }
  state.battle.effects.players = getKingdomSeatIndexes(state).map((index) => {
    const bucket = state.battle.effects.players[index];
    return bucket && typeof bucket === 'object' ? bucket : {};
  });
  return state.battle.effects;
}

function getKingdomEffectBucket(targetType, targetIndex = null, state = s) {
  const effects = ensureKingdomBattleEffects(state);
  if (!effects) return null;
  if (targetType === 'enemy') return effects.enemy;
  if (targetType === 'party') return effects.party;
  if (targetType === 'player' && Number.isInteger(Number(targetIndex))) {
    return effects.players[Math.max(0, Math.min(getKingdomPlayerCount(state) - 1, Number(targetIndex)))];
  }
  return null;
}

function setKingdomBattleEffect(targetType, key, effect = {}, targetIndex = null) {
  const bucket = getKingdomEffectBucket(targetType, targetIndex);
  if (!bucket || !key) return null;
  const previous = bucket[key] && typeof bucket[key] === 'object' ? bucket[key] : null;
  const potency = Math.max(Number(previous?.potency) || 0, Number(effect.potency) || 0);
  const incomingCharges = effect.charges == null ? null : Math.max(0, Math.floor(Number(effect.charges) || 0));
  const previousCharges = previous?.charges == null ? null : Math.max(0, Math.floor(Number(previous.charges) || 0));
  const charges = incomingCharges == null && previousCharges == null
    ? null
    : Math.max(incomingCharges || 0, previousCharges || 0);
  bucket[key] = {
    ...(previous || {}),
    ...effect,
    key,
    potency,
    charges,
    appliedSeq: Math.max(1, Number(s?.battle?.eventSeq || 0) + 1),
    expiresOn: String(effect.expiresOn || previous?.expiresOn || 'clear')
  };
  return bucket[key];
}

function consumeKingdomBattleEffect(targetType, key, targetIndex = null) {
  const bucket = getKingdomEffectBucket(targetType, targetIndex);
  const effect = bucket?.[key];
  if (!effect) return null;
  if (effect.charges == null) {
    delete bucket[key];
    return effect;
  }
  effect.charges = Math.max(0, Math.floor(Number(effect.charges) || 0) - 1);
  if (effect.charges <= 0) delete bucket[key];
  return effect;
}

function clearKingdomBattleEffects() {
  if (!s?.battle) return;
  const current = ensureKingdomBattleEffects();
  const persistentPlayers = getKingdomSeatIndexes().map((playerIndex) => Object.fromEntries(
    Object.entries(current?.players?.[playerIndex] || {}).filter(([, effect]) => (
      effect && String(effect.expiresOn || 'clear') !== 'clear'
    ))
  ));
  s.battle.effects = {
    enemy: {},
    party: {},
    players: persistentPlayers,
    enemyAttackedSinceClear: false
  };
}

function getKingdomNegativeStatusKey(bucket = {}) {
  return ['paralysis', 'poison', 'burn', 'blind', 'fear', 'confusion', 'wet', 'weaken', 'vulnerable']
    .find((key) => bucket?.[key]) || '';
}

function rollKingdomEffect(chance, actorIndex = null) {
  let resolvedChance = Math.max(0, Math.min(1, Number(chance) || 0));
  if (Number.isInteger(Number(actorIndex))) {
    const modifier = getKingdomEffectBucket('player', Number(actorIndex))?.statusChanceUp;
    if (modifier) {
      resolvedChance = Math.max(0, Math.min(0.95, resolvedChance + ((Number(modifier.potency) || 0) / 100)));
      consumeKingdomBattleEffect('player', 'statusChanceUp', Number(actorIndex));
    }
  }
  const roll = Math.max(0, Math.min(0.999999, Number(kingdomCombatRandom?.()) || 0));
  return { success: roll < resolvedChance, roll, chance: resolvedChance };
}

function resolveKingdomEnemyAilmentPotency(ailment, attackKind = 'single') {
  if (!ailment) return 0;
  if (Number.isFinite(Number(ailment.potency))) return Math.max(0, Number(ailment.potency));
  const enemy = s?.battle?.enemy;
  const baseDamage = attackKind === 'area'
    ? Number(enemy?.areaDamage)
    : Number(enemy?.passDamage);
  return Math.max(1, Math.floor(
    Math.max(1, baseDamage || 1) * Math.max(0, Number(ailment.potencyRate) || 0)
  ));
}

function applyKingdomEnemyAilments(attackKind, targetIndexes = []) {
  const enemy = s?.battle?.enemy;
  const ailment = enemy?.ailment;
  if (!ailment || !areKingdomCombatEffectsEnabled()) return [];
  const scope = String(ailment.scope || 'single');
  if (attackKind === 'single' && !['single', 'both'].includes(scope)) return [];
  if (attackKind === 'area' && !['area', 'both'].includes(scope)) return [];
  const chance = getTarotKingdomEnemyAilmentChance(ailment);
  const potency = resolveKingdomEnemyAilmentPotency(ailment, attackKind);
  const results = [];
  Array.from(new Set(targetIndexes.map(Number).filter(Number.isInteger))).forEach((targetIndex) => {
    if (!isKingdomBattlePlayerConscious(targetIndex)) return;
    const check = rollKingdomEffect(chance);
    const result = {
      kind: 'enemy-ailment',
      source: 'enemy',
      sourceMonsterId: String(enemy.id || ''),
      targetType: 'player',
      targetIndex,
      statusKey: String(ailment.statusKey || ''),
      label: String(ailment.label || ''),
      potency,
      charges: Math.max(1, Math.floor(Number(ailment.charges) || 1)),
      chance: check.chance,
      roll: check.roll,
      success: check.success
    };
    if (result.success && result.statusKey) {
      setKingdomBattleEffect('player', result.statusKey, {
        source: 'enemy',
        sourceMonsterId: result.sourceMonsterId,
        label: result.label,
        potency,
        charges: result.charges,
        expiresOn: 'action'
      }, targetIndex);
      log(`${enemy.name} → ${pName(targetIndex)}: ${result.label}`);
    }
    results.push(result);
  });
  return results;
}

function rollKingdomCombatAccuracy(attackerSpeed, defenderSpeed, accuracyPenalty = 0) {
  const chance = calculateTarotKingdomHitChance(attackerSpeed, defenderSpeed, accuracyPenalty);
  const roll = Math.max(0, Math.min(0.999999, Number(kingdomCombatRandom?.()) || 0));
  return {
    success: roll < chance,
    chance,
    roll
  };
}

function resolveKingdomPlayerAttackImpairment(playerIndex, options = {}) {
  const bucket = getKingdomEffectBucket('player', playerIndex) || {};
  if (bucket.paralysis) {
    const effect = consumeKingdomBattleEffect('player', 'paralysis', playerIndex);
    return {
      blocked: true,
      missed: false,
      cancelsAllEffects: true,
      statusKey: 'paralysis',
      label: String(effect?.label || '攻撃不能')
    };
  }
  if (options.checkAccuracy === false) {
    return { blocked: false, missed: false, cancelsAllEffects: false, statusKey: '', label: '' };
  }
  const blind = bucket.blind;
  const accuracyPenalty = blind
    ? Math.max(0, Math.min(0.7, (Number(blind.potency) || 0) / 100))
    : 0;
  if (!areKingdomEnemyCombatStatsEnabled()) {
    if (!blind) {
      return {
        blocked: false,
        missed: false,
        cancelsAllEffects: false,
        statusKey: '',
        label: '',
        hitChance: 1,
        roll: null
      };
    }
    const roll = Math.max(0, Math.min(0.999999, Number(kingdomCombatRandom?.()) || 0));
    consumeKingdomBattleEffect('player', 'blind', playerIndex);
    const missed = roll < accuracyPenalty;
    return {
      blocked: missed,
      missed,
      cancelsAllEffects: false,
      statusKey: missed ? 'blind' : '',
      label: missed ? '暗闇で攻撃ミス' : '',
      hitChance: 1 - accuracyPenalty,
      roll
    };
  }
  const attackerSpeed = Math.max(0, Number(s.players?.[playerIndex]?.character?.combat?.speed) || 0);
  const defenderSpeed = Math.max(0, Number(s.battle?.enemy?.speed) || 0);
  const accuracy = rollKingdomCombatAccuracy(attackerSpeed, defenderSpeed, accuracyPenalty);
  if (blind) {
    consumeKingdomBattleEffect('player', 'blind', playerIndex);
  }
  if (!accuracy.success) {
    return {
      blocked: true,
      missed: true,
      cancelsAllEffects: false,
      statusKey: blind ? 'blind' : 'evasion',
      label: blind ? '暗闇で攻撃ミス' : `${s.battle?.enemy?.name || '敵'}が回避`,
      hitChance: accuracy.chance,
      roll: accuracy.roll
    };
  }
  return {
    blocked: false,
    missed: false,
    cancelsAllEffects: false,
    statusKey: '',
    label: '',
    hitChance: accuracy.chance,
    roll: accuracy.roll
  };
}

function applyKingdomPlayerAilmentDamage(playerIndex) {
  const player = s?.players?.[playerIndex];
  const bucket = getKingdomEffectBucket('player', playerIndex) || {};
  if (!player || Number(player.hp) <= 0) return [];
  const results = [];
  ['poison', 'burn'].forEach((statusKey) => {
    const effect = bucket[statusKey];
    if (!effect || Number(player.hp) <= 0) return;
    const before = Math.max(0, Number(player.hp) || 0);
    const amount = Math.min(before, Math.max(1, Math.floor(Number(effect.potency) || 1)));
    player.hp = Math.max(0, before - amount);
    consumeKingdomBattleEffect('player', statusKey, playerIndex);
    results.push({
      kind: 'player-status-damage',
      source: 'enemy',
      targetType: 'player',
      targetIndex: playerIndex,
      playerIndex,
      statusKey,
      label: statusKey === 'poison' ? '毒' : '火傷',
      amount,
      damage: amount,
      hpBefore: before,
      hpAfter: player.hp,
      success: true
    });
  });
  return results;
}

function applyKingdomOutgoingDamageBonuses(damage, actorIndex) {
  let total = Math.max(0, Math.floor(Number(damage) || 0));
  const effects = ensureKingdomBattleEffects();
  const applied = [];
  const enemyBreak = effects?.enemy?.break;
  if (enemyBreak) {
    const potency = Math.max(0, Math.min(100, Number(enemyBreak.potency) || 0));
    total = Math.floor(total * (1 + (potency / 100)));
    applied.push({ kind: 'break', potency });
    consumeKingdomBattleEffect('enemy', 'break');
  }
  const partyBonus = effects?.party?.nextAttackUp;
  if (partyBonus) {
    const potency = Math.max(0, Math.min(100, Number(partyBonus.potency) || 0));
    total = Math.floor(total * (1 + (potency / 100)));
    applied.push({ kind: 'nextAttackUp', potency });
    consumeKingdomBattleEffect('party', 'nextAttackUp');
  }
  const actorBonus = getKingdomEffectBucket('player', actorIndex)?.nextEffectUp;
  if (actorBonus) {
    const potency = Math.max(0, Math.min(100, Number(actorBonus.potency) || 0));
    total = Math.floor(total * (1 + (potency / 100)));
    applied.push({ kind: 'nextEffectUp', potency });
    consumeKingdomBattleEffect('player', 'nextEffectUp', actorIndex);
  }
  const actorWandBonus = getKingdomEffectBucket('player', actorIndex)?.nextWandUp;
  if (actorWandBonus) {
    const potency = Math.max(0, Math.min(100, Number(actorWandBonus.potency) || 0));
    total = Math.floor(total * (1 + (potency / 100)));
    applied.push({ kind: 'nextWandUp', potency });
    consumeKingdomBattleEffect('player', 'nextWandUp', actorIndex);
  }
  const actorFlatBonus = getKingdomEffectBucket('player', actorIndex)?.nextEffectFlat;
  if (actorFlatBonus) {
    const potency = Math.max(0, Math.floor(Number(actorFlatBonus.potency) || 0));
    total += potency;
    applied.push({ kind: 'nextEffectFlat', potency });
    consumeKingdomBattleEffect('player', 'nextEffectFlat', actorIndex);
  }
  return { damage: total, applied };
}

function applyKingdomEffectStep(step, actorIndex, context = {}) {
  if (!step || !s?.battle) return null;
  const result = {
    source: String(step.source || context.source || 'effect'),
    kind: String(step.kind || 'effect'),
    label: String(step.label || '効果'),
    targetType: String(step.targetType || 'enemy'),
    targetIndex: Number.isInteger(Number(step.targetIndex)) ? Number(step.targetIndex) : null,
    statusKey: String(step.statusKey || ''),
    success: true
  };
  if (step.kind === 'damage' || step.kind === 'magic' || step.kind === 'effective' || step.kind === 'multi-hit') {
    const enemy = s.battle.enemy;
    const before = Math.max(0, Number(enemy.hp) || 0);
    const outgoing = applyKingdomOutgoingDamageBonuses(step.amount, actorIndex);
    const mitigated = calculateTarotKingdomEnemyMitigatedDamage(
      outgoing.damage,
      enemy.defense
    );
    const amount = Math.min(before, Math.max(0, mitigated));
    enemy.hp = Math.max(0, before - amount);
    result.amount = amount;
    result.hpBefore = before;
    result.hpAfter = enemy.hp;
    result.hitCount = Math.max(1, Math.floor(Number(step.hitCount) || 1));
    result.appliedBonuses = outgoing.applied;
    return result;
  }
  if (step.kind === 'heal' || step.kind === 'heal-percent') {
    const targetIndex = Number.isInteger(result.targetIndex) ? result.targetIndex : actorIndex;
    const player = s.players?.[targetIndex];
    if (!player || Number(player.hp) <= 0) return { ...result, success: false, amount: 0 };
    const before = Math.max(0, Number(player.hp) || 0);
    const maxHp = Math.max(1, Number(player.maxHp) || 1);
    const requested = step.kind === 'heal-percent'
      ? Math.max(1, Math.floor(maxHp * (Math.max(0, Number(step.percent) || 0) / 100)))
      : Math.max(0, Math.floor(Number(step.amount) || 0));
    player.hp = Math.min(maxHp, before + requested);
    result.targetIndex = targetIndex;
    result.amount = player.hp - before;
    result.hpBefore = before;
    result.hpAfter = player.hp;
    return result;
  }
  if (step.kind === 'cleanse' || step.kind === 'heal-or-cleanse' || step.kind === 'heal-cleanse') {
    const targetIndex = Number.isInteger(result.targetIndex) ? result.targetIndex : actorIndex;
    const bucket = getKingdomEffectBucket('player', targetIndex);
    const normalizeStatusKey = (value) => {
      const key = String(value || '').trim().toLowerCase();
      if (key === 'flood') return 'wet';
      if (key === 'accuracy') return 'blind';
      return key;
    };
    const requestedKeys = [step.statusKey, ...(Array.isArray(step.statusKeys) ? step.statusKeys : [])]
      .map(normalizeStatusKey)
      .filter(Boolean);
    const statusKey = requestedKeys.find((key) => bucket?.[key]) || getKingdomNegativeStatusKey(bucket);
    if (statusKey && bucket?.[statusKey]) {
      delete bucket[statusKey];
      result.targetIndex = targetIndex;
      result.statusKey = statusKey;
      result.amount = 1;
    } else if (step.kind === 'heal-or-cleanse' || step.kind === 'heal-cleanse') {
      return applyKingdomEffectStep({
        ...step,
        kind: 'heal-percent',
        percent: Number(step.percent) || 0,
        targetIndex
      }, actorIndex, context);
    } else {
      result.success = false;
      result.amount = 0;
    }
    if (step.kind === 'heal-cleanse' && Number(step.percent) > 0) {
      const healResult = applyKingdomEffectStep({ ...step, kind: 'heal-percent', targetIndex }, actorIndex, context);
      result.healAmount = Number(healResult?.amount) || 0;
      result.hpBefore = healResult?.hpBefore;
      result.hpAfter = healResult?.hpAfter;
    }
    return result;
  }
  if (step.kind === 'conditional-percent-damage') {
    const condition = String(step.conditionStatus || '').toLowerCase();
    const bucket = getKingdomEffectBucket('enemy');
    if (condition && !bucket?.[condition]) return { ...result, success: false, amount: 0 };
    const enemy = s.battle.enemy;
    const before = Math.max(0, Number(enemy.hp) || 0);
    const amount = Math.min(before, Math.max(0, Math.floor(Number(enemy.maxHp || 0) * ((Number(step.percent) || 0) / 100))));
    enemy.hp = Math.max(0, before - amount);
    return { ...result, amount, hpBefore: before, hpAfter: enemy.hp };
  }
  if (step.kind === 'drain') {
    const damageDone = Math.max(0, Number(context.resonanceDamage) || 0);
    return applyKingdomEffectStep({
      ...step,
      kind: 'heal',
      targetType: 'player',
      targetIndex: actorIndex,
      amount: Math.floor(damageDone * Math.max(0, Math.min(1, Number(step.rate) || 0)))
    }, actorIndex, context);
  }
  if (step.kind === 'dispel') {
    const bucket = getKingdomEffectBucket(result.targetType, result.targetIndex);
    if (result.statusKey && bucket?.[result.statusKey]) {
      delete bucket[result.statusKey];
      result.amount = 1;
    } else {
      result.success = false;
      result.amount = 0;
    }
    return result;
  }
  if (step.kind === 'status') {
    const check = step.chance == null ? { success: true, chance: 1, roll: 0 } : rollKingdomEffect(step.chance, actorIndex);
    result.success = check.success;
    result.chance = check.chance;
    result.roll = check.roll;
    if (check.success && result.statusKey) {
      setKingdomBattleEffect(result.targetType, result.statusKey, {
        potency: Math.max(0, Number(step.potency) || 0),
        charges: step.charges == null ? null : Math.max(1, Math.floor(Number(step.charges) || 1)),
        sourceIndex: actorIndex,
        rank: Number(step.rank) || null,
        label: result.label
      }, result.targetIndex);
    }
    return result;
  }
  if (step.kind === 'guard' || step.kind === 'buff') {
    if (!result.statusKey) return { ...result, success: false };
    setKingdomBattleEffect(result.targetType, result.statusKey, {
      potency: Math.max(0, Number(step.potency) || 0),
      charges: step.charges == null ? null : Math.max(1, Math.floor(Number(step.charges) || 1)),
      sourceIndex: actorIndex,
      coverIndex: Number.isInteger(Number(step.coverIndex)) ? Number(step.coverIndex) : null,
      label: result.label
    }, result.targetIndex);
    return result;
  }
  return result;
}

function applyKingdomSecondaryEffects(playerIndex, play, options = {}) {
  if (!areKingdomCombatEffectsEnabled() || !s?.battle || !s.players?.[playerIndex]) {
    return { results: [], damage: 0, heal: 0, effectCount: 0, resonance: null, weapon: null, summon: null };
  }
  const character = s.players[playerIndex].character || {};
  const submittedCards = Array.isArray(play?.cardsHand) ? play.cardsHand : [];
  const roleCards = Array.isArray(play?.cardsTable) ? play.cardsTable : submittedCards;
  const rebuiltRole = String(play?.type || '') === 'role' && roleCards.length === 5
    ? (evalRole(roleCards, null) || play?.role || null)
    : null;
  const summon = areKingdomSummonsEnabled() && rebuiltRole
    ? resolveTarotKingdomSummon(rebuiltRole)
    : null;
  const context = {
    actorIndex: playerIndex,
    playType: String(play?.type || ''),
    cards: submittedCards,
    character,
    players: s.players,
    enemy: s.battle.enemy,
    effects: ensureKingdomBattleEffects(),
    enemyAttackedSinceClear: !!s.battle.effects?.enemyAttackedSinceClear
  };
  const weapon = resolveTarotKingdomWeaponEffect(context);
  const resonance = resolveTarotKingdomResonance(context);
  const results = [];
  let resonanceDamage = 0;
  if (weapon && !(options.enemyAttackMissed && weapon.targetType === 'enemy')) {
    const result = applyKingdomEffectStep(weapon, playerIndex, { source: 'weapon' });
    if (result) results.push(result);
  }
  if (resonance) {
    resonance.steps.forEach((step) => {
      if (options.enemyAttackMissed && step.targetType === 'enemy') return;
      const result = applyKingdomEffectStep(step, playerIndex, { source: 'resonance', resonanceDamage });
      if (!result) return;
      results.push({ ...result, skillName: resonance.skillName, cardId: resonance.cardId });
      if (result.targetType === 'enemy' && Number(result.amount) > 0) resonanceDamage += Number(result.amount);
    });
  }
  if (summon) {
    const declaredRate = Number(play?.role?.effectiveRate);
    const rebuiltRate = Number(rebuiltRole?.effectiveRate);
    const tableRate = Number(ROLE_RATE[rebuiltRole?.key]);
    const roleRate = Math.max(
      1,
      Number.isFinite(declaredRate)
        ? declaredRate
        : (Number.isFinite(rebuiltRate) ? rebuiltRate : (Number.isFinite(tableRate) ? tableRate : 1))
    );
    const summonSteps = buildTarotKingdomSummonEffectSteps(summon, {
      roleRate,
      intelligence: Number(character?.combat?.intelligence) || 0
    });
    summonSteps.forEach((step) => {
      if (options.enemyAttackMissed && step.targetType === 'enemy') return;
      if (step.kind === 'heal-party-percent') {
        s.players.forEach((player, targetIndex) => {
          if (!player || Number(player.hp) <= 0) return;
          const result = applyKingdomEffectStep({
            ...step,
            kind: 'heal-percent',
            targetType: 'player',
            targetIndex
          }, playerIndex, { source: 'summon' });
          if (result) results.push({ ...result, summonId: summon.id, summonName: summon.name });
        });
        return;
      }
      if (step.targetType === 'enemy' && Number(s.battle.enemy?.hp) <= 0) return;
      const result = applyKingdomEffectStep(step, playerIndex, { source: 'summon' });
      if (result) results.push({ ...result, summonId: summon.id, summonName: summon.name });
    });
  }
  return {
    results,
    damage: results.filter((entry) => entry.targetType === 'enemy').reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0),
    heal: results.filter((entry) => entry.targetType === 'player' && ['heal', 'heal-percent'].includes(entry.kind))
      .reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0),
    effectCount: (weapon ? 1 : 0) + (resonance ? 1 : 0) + (summon ? 1 : 0),
    resonance,
    weapon,
    summon
  };
}

function isKingdomBattleActive(state = s) {
  return !!(state?.roundActive && state?.battle?.active && !state?.battle?.outcome);
}

function isKingdomBattlePlayerConscious(playerIndex, state = s) {
  const player = state?.players?.[playerIndex];
  if (!player) return false;
  if (!isKingdomBattleActive(state)) return true;
  return Math.max(0, Number(player.hp) || 0) > 0;
}

function isKingdomBattlePlayerActionable(playerIndex, state = s) {
  const player = state?.players?.[playerIndex];
  if (!player || !Array.isArray(player.hand) || player.hand.length <= 0) return false;
  return isKingdomBattlePlayerConscious(playerIndex, state);
}

function canKingdomEnemyAttack(state = s) {
  return !!(
    isKingdomBattleActive(state)
    && state?.battle?.enemy
    && Math.max(0, Number(state.battle.enemy.hp) || 0) > 0
  );
}

function applyKingdomEnemyConfusionAttack(attackKind) {
  if (!s?.reverse || !canKingdomEnemyAttack()) return null;
  if (kingdomCombatRandom() >= 0.5) return null;
  const enemy = s.battle.enemy;
  const before = Math.max(0, Number(enemy.hp) || 0);
  const baseDamage = attackKind === 'area' ? enemy.areaDamage : enemy.passDamage;
  const damage = Math.max(1, Math.floor(Number(baseDamage) || 0));
  enemy.hp = Math.max(0, before - damage);
  const enemyDown = enemy.hp <= 0;
  const event = pushKingdomBattleEvent('enemy-self', {
    attackKind,
    damage,
    hpBefore: before,
    hpAfter: enemy.hp,
    enemyHpBefore: before,
    enemyHp: enemy.hp,
    enemyDown,
    label: `${enemy.name}は混乱して自分を攻撃 ${damage}ダメージ`
  });
  if (enemyDown && enemy.rushStartedAtSeq == null) enemy.rushStartedAtSeq = event.seq;
  log(`${enemy.name}: 混乱により自分へ${damage}ダメージ`);
  if (enemyDown) log(`${enemy.name}: HP 0。RUSH TIMEへ移行し、以後の敵攻撃を停止`);
  return event;
}

function applyKingdomEnemyPreAttack(attackKind) {
  if (!canKingdomEnemyAttack()) return { stopped: true, event: null, effects: [] };
  const enemy = s.battle.enemy;
  const bucket = getKingdomEffectBucket('enemy') || {};
  const effects = [];
  ['poison', 'burn'].forEach((statusKey) => {
    const status = bucket[statusKey];
    if (!status || enemy.hp <= 0) return;
    const before = Math.max(0, Number(enemy.hp) || 0);
    const damage = Math.min(before, Math.max(1, Math.floor(Number(status.potency) || 1)));
    enemy.hp = Math.max(0, before - damage);
    effects.push({ kind: 'status-damage', statusKey, amount: damage, hpBefore: before, hpAfter: enemy.hp });
  });
  if (enemy.hp <= 0) {
    const event = pushKingdomBattleEvent('enemy-status', {
      attackKind,
      effects,
      damage: effects.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0),
      enemyDown: true,
      hpBefore: effects[0]?.hpBefore ?? 0,
      hpAfter: 0,
      label: `${enemy.name}は状態異常ダメージで行動不能`
    });
    if (enemy.rushStartedAtSeq == null) enemy.rushStartedAtSeq = event.seq;
    log(`${enemy.name}: 状態異常ダメージでHP 0。RUSH TIMEへ移行`);
    return { stopped: true, event, effects };
  }
  if (enemy.petrifiedUntilClear) {
    log(`${enemy.name}: 石化中のため${attackKind === 'area' ? '全体攻撃' : '反撃'}不能`);
    const statusDamage = effects.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0);
    return { stopped: true, event: effects.length ? pushKingdomBattleEvent('enemy-status', {
      attackKind, effects, damage: statusDamage, hpBefore: effects[0]?.hpBefore, hpAfter: enemy.hp, label: `${enemy.name} 石化中`
    }) : null, effects };
  }
  const stopKey = bucket.paralysis ? 'paralysis' : (bucket.fear ? 'fear' : '');
  if (stopKey) {
    consumeKingdomBattleEffect('enemy', stopKey);
    const label = stopKey === 'paralysis' ? '麻痺' : '恐怖';
    effects.push({ kind: 'skip', statusKey: stopKey, amount: 1 });
    const statusDamage = effects.reduce((sum, entry) => sum + (entry.kind === 'status-damage' ? Math.max(0, Number(entry.amount) || 0) : 0), 0);
    const event = pushKingdomBattleEvent('enemy-status', {
      attackKind, effects, damage: statusDamage, hpBefore: effects.find((entry) => entry.hpBefore != null)?.hpBefore,
      hpAfter: enemy.hp, label: `${enemy.name}は${label}で攻撃できない`
    });
    log(`${enemy.name}: ${label}により攻撃中止`);
    return { stopped: true, event, effects };
  }
  if (bucket.confusion) {
    consumeKingdomBattleEffect('enemy', 'confusion');
    if (kingdomCombatRandom() < 0.5) {
      const before = Math.max(0, Number(enemy.hp) || 0);
      const baseDamage = attackKind === 'area' ? enemy.areaDamage : enemy.passDamage;
      const damage = Math.min(before, Math.max(1, Math.floor(Number(baseDamage) || 0)));
      enemy.hp = Math.max(0, before - damage);
      effects.push({ kind: 'status-self-damage', statusKey: 'confusion', amount: damage, hpBefore: before, hpAfter: enemy.hp });
      const event = pushKingdomBattleEvent('enemy-self', {
        attackKind, damage, hpBefore: before, hpAfter: enemy.hp, enemyHpBefore: before, enemyHp: enemy.hp,
        enemyDown: enemy.hp <= 0, effects, label: `${enemy.name}は混乱して自分を攻撃 ${damage}ダメージ`
      });
      if (enemy.hp <= 0 && enemy.rushStartedAtSeq == null) enemy.rushStartedAtSeq = event.seq;
      return { stopped: true, event, effects };
    }
  }
  return { stopped: false, event: null, effects };
}

function getKingdomEnemyAttackMultiplier() {
  const bucket = getKingdomEffectBucket('enemy') || {};
  const applied = [];
  let multiplier = 1;
  ['blind', 'wet', 'weaken'].forEach((statusKey) => {
    const effect = bucket[statusKey];
    if (!effect) return;
    const potency = Math.max(0, Math.min(80, Number(effect.potency) || 0));
    multiplier *= Math.max(0.2, 1 - (potency / 100));
    applied.push({ kind: statusKey, potency });
    if (effect.charges != null) consumeKingdomBattleEffect('enemy', statusKey);
  });
  return { multiplier, applied };
}

function resolveKingdomPlayerDefense(playerIndex, baseDamage) {
  const player = s.players[playerIndex];
  const bucket = getKingdomEffectBucket('player', playerIndex) || {};
  const defense = Math.max(0, Number(player?.character?.combat?.defense) || 0);
  const effects = [];
  const evasion = bucket.evasion;
  if (evasion) {
    const chance = Math.max(0, Math.min(0.95, (Number(evasion.potency) || 0) / 100));
    consumeKingdomBattleEffect('player', 'evasion', playerIndex);
    if (kingdomCombatRandom() < chance) return { damage: 0, effects: [{ kind: 'evasion', potency: Math.round(chance * 100) }] };
  }
  let damage = calculateTarotKingdomIncomingDamage(baseDamage, defense);
  const guard = bucket.guard;
  if (guard) {
    const potency = Math.max(0, Math.min(80, Number(guard.potency) || 0));
    damage = Math.max(1, Math.floor(damage * (1 - (potency / 100))));
    effects.push({ kind: 'guard', potency });
    consumeKingdomBattleEffect('player', 'guard', playerIndex);
  }
  return { damage, effects };
}

function resolveKingdomEnemyAttackAccuracy(playerIndex) {
  if (!areKingdomEnemyCombatStatsEnabled()) {
    return { success: true, chance: 1, roll: null, effect: null };
  }
  const attackerSpeed = Math.max(0, Number(s?.battle?.enemy?.speed) || 0);
  const defenderSpeed = Math.max(0, Number(s?.players?.[playerIndex]?.character?.combat?.speed) || 0);
  const accuracy = rollKingdomCombatAccuracy(attackerSpeed, defenderSpeed);
  return {
    ...accuracy,
    effect: accuracy.success
      ? null
      : {
        kind: 'speed-evasion',
        targetIndex: playerIndex,
        label: '回避',
        hitChance: accuracy.chance,
        roll: accuracy.roll
      }
  };
}

function applyKingdomCounter(playerIndex) {
  const counter = getKingdomEffectBucket('player', playerIndex)?.counter;
  if (!counter || !s?.battle?.enemy || s.battle.enemy.hp <= 0) return null;
  consumeKingdomBattleEffect('player', 'counter', playerIndex);
  const combat = s.players?.[playerIndex]?.character?.combat || {};
  const raw = Math.max(1, Math.floor((Number(counter.potency) || 1) * 0.2 * getTarotKingdomPhysicalScale(combat.power)));
  const before = Math.max(0, Number(s.battle.enemy.hp) || 0);
  const mitigated = calculateTarotKingdomEnemyMitigatedDamage(raw, s.battle.enemy.defense);
  const amount = Math.min(before, mitigated);
  s.battle.enemy.hp = Math.max(0, before - amount);
  return { kind: 'counter', sourceIndex: playerIndex, amount, hpBefore: before, hpAfter: s.battle.enemy.hp };
}

function pushKingdomBattleEvent(type, details = {}) {
  if (!s?.battle) return null;
  const seq = Math.max(0, Number(s.battle.eventSeq) || 0) + 1;
  const event = {
    seq,
    type: String(type || 'info'),
    at: Date.now(),
    ...details
  };
  s.battle.eventSeq = seq;
  const events = Array.isArray(s.battle.events) ? s.battle.events.slice() : [];
  events.push(event);
  s.battle.events = events.slice(-KINGDOM_BATTLE_EVENT_LIMIT);
  return event;
}

function getKingdomBattleDamageForPlay(playerIndex, play) {
  const handCards = Array.isArray(play?.cardsHand) ? play.cardsHand : [];
  const tableCards = Array.isArray(play?.cardsTable) ? play.cardsTable : handCards;
  const combat = normalizeTarotKingdomCharacter(s?.players?.[playerIndex]?.character || {}, {
    combat: { maxHp: s?.players?.[playerIndex]?.maxHp || KINGDOM_FALLBACK_PLAYER_MAX_HP }
  }).combat;
  if (String(play?.type || '') === 'role' && tableCards.length === 5) {
    const rebuiltRole = evalRole(tableCards, null) || play?.role || null;
    const declaredRate = Number(play?.role?.effectiveRate);
    const rebuiltRate = Number(rebuiltRole?.effectiveRate);
    const tableRate = Number(ROLE_RATE[rebuiltRole?.key]);
    const rawRoleRate = Number.isFinite(declaredRate)
      ? declaredRate
      : (Number.isFinite(rebuiltRate) ? rebuiltRate : (Number.isFinite(tableRate) ? tableRate : 1));
    const roleRate = Math.max(1, rawRoleRate);
    const result = calculateTarotKingdomPlayerAttack({
      isSkill: true,
      roleRate,
      intelligence: combat.intelligence
    });
    return {
      ...result,
      kind: 'skill',
      label: `${getRoleDisplayLabel({ ...play, role: rebuiltRole || play?.role })}スキル`
    };
  }
  const count = Math.max(1, Math.min(3, handCards.length || Number(play?.count) || 1));
  const keyPower = tableCards.reduce((max, card) => Math.max(max, cStrength(card)), 0);
  const result = calculateTarotKingdomPlayerAttack({
    cardCount: count,
    maxCardStrength: keyPower,
    power: combat.power
  });
  return {
    ...result,
    kind: 'attack',
    label: `${count}枚攻撃`
  };
}

function applyKingdomPlayerAttack(playerIndex, play) {
  if (!isKingdomBattleActive() || !s?.battle?.enemy) return null;
  const enemy = s.battle.enemy;
  const before = Math.max(0, Number(enemy.hp) || 0);
  const attack = getKingdomBattleDamageForPlay(playerIndex, play);
  const impairment = resolveKingdomPlayerAttackImpairment(playerIndex, { checkAccuracy: before > 0 });
  if (before <= 0) {
    const secondary = impairment.cancelsAllEffects
      ? { results: [], damage: 0, heal: 0, effectCount: 0, resonance: null, weapon: null, summon: null }
      : applyKingdomSecondaryEffects(playerIndex, play, { enemyAttackMissed: impairment.missed });
    const statusDamage = applyKingdomPlayerAilmentDamage(playerIndex);
    const effects = [
      ...(impairment.blocked ? [{
        kind: 'attack-impairment',
        targetType: 'player',
        targetIndex: playerIndex,
        statusKey: impairment.statusKey,
        label: impairment.label,
        success: true
      }] : []),
      ...secondary.results,
      ...statusDamage
    ];
    const event = pushKingdomBattleEvent(attack.kind, {
      actorIndex: playerIndex,
      damage: 0,
      baseDamage: 0,
      hpBefore: 0,
      hpAfter: 0,
      enemyHp: 0,
      enemyDown: true,
      attackStopped: true,
      attackBlocked: impairment.blocked,
      attackMissed: impairment.missed,
      hitChance: impairment.hitChance ?? null,
      accuracyRoll: impairment.roll ?? null,
      rushTime: true,
      targetIndexes: statusDamage.map((entry) => entry.playerIndex),
      damages: statusDamage.map((entry) => ({
        playerIndex: entry.playerIndex,
        damage: entry.amount,
        hpBefore: entry.hpBefore,
        hpAfter: entry.hpAfter
      })),
      knockedOutIndexes: Number(s.players?.[playerIndex]?.hp) <= 0 ? [playerIndex] : [],
      effects,
      effectCount: secondary.effectCount,
      resonanceName: secondary.resonance?.skillName || '',
      summon: secondary.summon,
      summonEffectName: secondary.summon?.effectName || '',
      label: impairment.blocked
        ? `${pName(playerIndex)} ${impairment.label}（カード提出成立）`
        : (secondary.summon
          ? `${pName(playerIndex)} 召喚・${secondary.summon.name}（RUSH TIME）`
          : `${pName(playerIndex)} ${attack.label}（RUSH TIME）`)
    });
    if (enemy.rushStartedAtSeq == null) enemy.rushStartedAtSeq = event.seq;
    log(`${pName(playerIndex)}: ${attack.label}（${enemy.name}はRUSH TIME）`);
    return event;
  }
  const outgoing = impairment.blocked
    ? { damage: 0, applied: [] }
    : applyKingdomOutgoingDamageBonuses(attack.damage, playerIndex);
  const baseDamage = impairment.blocked
    ? 0
    : calculateTarotKingdomEnemyMitigatedDamage(outgoing.damage, enemy.defense);
  enemy.hp = Math.max(0, before - baseDamage);
  const secondary = impairment.cancelsAllEffects
    ? { results: [], damage: 0, heal: 0, effectCount: 0, resonance: null, weapon: null, summon: null }
    : applyKingdomSecondaryEffects(playerIndex, play, { enemyAttackMissed: impairment.missed });
  const statusDamage = applyKingdomPlayerAilmentDamage(playerIndex);
  const damage = Math.max(0, before - Math.max(0, Number(enemy.hp) || 0));
  const enemyDown = enemy.hp <= 0;
  const effects = [
    ...(impairment.blocked ? [{
      kind: 'attack-impairment',
      targetType: 'player',
      targetIndex: playerIndex,
      statusKey: impairment.statusKey,
      label: impairment.label,
      success: true
    }] : []),
    ...secondary.results,
    ...statusDamage
  ];
  const event = pushKingdomBattleEvent(attack.kind, {
    actorIndex: playerIndex,
    damage,
    baseDamage: Math.min(before, baseDamage),
    secondaryDamage: secondary.damage,
    hpBefore: before,
    hpAfter: enemy.hp,
    enemyHpBefore: before,
    enemyHp: enemy.hp,
    enemyDown,
    attackBlocked: impairment.blocked,
    attackMissed: impairment.missed,
    hitChance: impairment.hitChance ?? null,
    accuracyRoll: impairment.roll ?? null,
    targetIndexes: statusDamage.map((entry) => entry.playerIndex),
    damages: statusDamage.map((entry) => ({
      playerIndex: entry.playerIndex,
      damage: entry.amount,
      hpBefore: entry.hpBefore,
      hpAfter: entry.hpAfter
    })),
    knockedOutIndexes: Number(s.players?.[playerIndex]?.hp) <= 0 ? [playerIndex] : [],
    effects,
    effectCount: secondary.effectCount,
    resonanceName: secondary.resonance?.skillName || '',
    weaponEffectName: secondary.weapon?.label || '',
    summon: secondary.summon,
    summonEffectName: secondary.summon?.effectName || '',
    appliedBonuses: outgoing.applied,
    label: impairment.blocked
      ? `${pName(playerIndex)} ${impairment.label}（カード提出成立）`
      : (secondary.summon
        ? `${pName(playerIndex)} 召喚・${secondary.summon.name} ${damage}ダメージ`
        : `${pName(playerIndex)} ${attack.label} ${damage}ダメージ`)
  });
  if (enemyDown && (enemy.rushStartedAtSeq == null || !Number.isInteger(Number(enemy.rushStartedAtSeq)))) {
    enemy.rushStartedAtSeq = event.seq;
  }
  log(`${pName(playerIndex)} -> ${enemy.name}: ${attack.label} ${damage}ダメージ`);
  if (enemyDown) {
    log(`${enemy.name}: HP 0。RUSH TIMEへ移行し、以後の敵攻撃を停止`);
  }
  return event;
}

function applyKingdomEnemySingleAttack(playerIndex) {
  if (!isKingdomBattlePlayerConscious(playerIndex)) return null;
  if (!canKingdomEnemyAttack()) return null;
  const preAttack = applyKingdomEnemyPreAttack('single');
  if (preAttack.stopped) return preAttack.event;
  const confusionEvent = applyKingdomEnemyConfusionAttack('single');
  if (confusionEvent) return confusionEvent;
  const partyEffects = getKingdomEffectBucket('party') || {};
  const cover = partyEffects.cover;
  const summonGuard = partyEffects.summonGuard;
  let targetIndex = playerIndex;
  let coverReduction = 0;
  if (cover && Number.isInteger(Number(cover.coverIndex)) && isKingdomBattlePlayerConscious(Number(cover.coverIndex))) {
    targetIndex = Number(cover.coverIndex);
    coverReduction = Math.max(0, Math.min(50, Number(cover.potency) || 0));
    consumeKingdomBattleEffect('party', 'cover');
  }
  const summonReduction = summonGuard ? Math.max(0, Math.min(45, Number(summonGuard.potency) || 0)) : 0;
  if (summonGuard) consumeKingdomBattleEffect('party', 'summonGuard');
  const player = s.players[targetIndex];
  const weakening = getKingdomEnemyAttackMultiplier();
  const guardReduction = Math.max(coverReduction, summonReduction);
  const reducedBase = Math.max(1, Math.floor(Number(s.battle.enemy.passDamage || 0) * weakening.multiplier * (1 - (guardReduction / 100))));
  const accuracy = resolveKingdomEnemyAttackAccuracy(targetIndex);
  const defended = accuracy.success
    ? resolveKingdomPlayerDefense(targetIndex, reducedBase)
    : { damage: 0, effects: accuracy.effect ? [accuracy.effect] : [] };
  const damage = defended.damage;
  const before = Math.max(0, Number(player.hp) || 0);
  player.hp = Math.max(0, before - damage);
  const knockedOut = player.hp <= 0;
  const counter = damage > 0 ? applyKingdomCounter(targetIndex) : null;
  const effects = [...preAttack.effects, ...weakening.applied, ...defended.effects];
  const inflicted = damage > 0
    ? applyKingdomEnemyAilments('single', [targetIndex])
    : [];
  effects.push(...inflicted);
  if (coverReduction > 0) effects.push({ kind: 'cover', potency: coverReduction, originalTargetIndex: playerIndex });
  if (summonReduction > 0) effects.push({ kind: 'summonGuard', potency: summonReduction });
  if (counter) effects.push(counter);
  ensureKingdomBattleEffects().enemyAttackedSinceClear = true;
  const event = pushKingdomBattleEvent('enemy-single', {
    targetIndexes: [targetIndex],
    damages: [{
      playerIndex: targetIndex,
      damage,
      hpBefore: before,
      hpAfter: player.hp,
      missed: !accuracy.success,
      hitChance: accuracy.chance,
      accuracyRoll: accuracy.roll
    }],
    knockedOutIndexes: knockedOut ? [targetIndex] : [],
    effects,
    label: accuracy.success
      ? `${s.battle.enemy.name}の反撃 → ${pName(targetIndex)} ${damage}ダメージ`
      : `${pName(targetIndex)}が回避`
  });
  if (counter && s.battle.enemy.hp <= 0 && s.battle.enemy.rushStartedAtSeq == null) s.battle.enemy.rushStartedAtSeq = event.seq;
  log(`${s.battle.enemy.name} -> ${pName(targetIndex)}: 反撃 ${damage}ダメージ`);
  if (knockedOut) {
    if (isLocalPlayer(targetIndex)) s.selected.clear();
    log(`${pName(targetIndex)}: 戦闘不能（以後は強制スキップ）`);
  }
  return event;
}

function applyKingdomEnemyAreaAttack() {
  if (s?.battle?.enemy?.areaAttackSealedUntilClear) {
    log(`${s.battle.enemy.name}: 5スキップにより全体攻撃封印`);
    return null;
  }
  if (!canKingdomEnemyAttack()) return null;
  const preAttack = applyKingdomEnemyPreAttack('area');
  if (preAttack.stopped) return preAttack.event;
  const confusionEvent = applyKingdomEnemyConfusionAttack('area');
  if (confusionEvent) return confusionEvent;
  const damages = [];
  const knockedOutIndexes = [];
  const eventEffects = [...preAttack.effects];
  const weakening = getKingdomEnemyAttackMultiplier();
  eventEffects.push(...weakening.applied);
  const areaGuard = getKingdomEffectBucket('party')?.areaGuard;
  const areaReduction = areaGuard ? Math.max(0, Math.min(50, Number(areaGuard.potency) || 0)) : 0;
  if (areaGuard) {
    eventEffects.push({ kind: 'areaGuard', potency: areaReduction });
    consumeKingdomBattleEffect('party', 'areaGuard');
  }
  const summonGuard = getKingdomEffectBucket('party')?.summonGuard;
  const summonReduction = summonGuard ? Math.max(0, Math.min(45, Number(summonGuard.potency) || 0)) : 0;
  if (summonGuard) {
    eventEffects.push({ kind: 'summonGuard', potency: summonReduction });
    consumeKingdomBattleEffect('party', 'summonGuard');
  }
  const guardReduction = Math.max(areaReduction, summonReduction);
  const reducedBase = Math.max(1, Math.floor(Number(s.battle.enemy.areaDamage || 0) * weakening.multiplier * (1 - (guardReduction / 100))));
  s.players.forEach((player, playerIndex) => {
    if (!isKingdomBattlePlayerConscious(playerIndex)) return;
    const accuracy = resolveKingdomEnemyAttackAccuracy(playerIndex);
    const defended = accuracy.success
      ? resolveKingdomPlayerDefense(playerIndex, reducedBase)
      : { damage: 0, effects: accuracy.effect ? [accuracy.effect] : [] };
    const damage = defended.damage;
    const before = Math.max(0, Number(player.hp) || 0);
    player.hp = Math.max(0, before - damage);
    damages.push({
      playerIndex,
      damage,
      hpBefore: before,
      hpAfter: player.hp,
      effects: defended.effects,
      missed: !accuracy.success,
      hitChance: accuracy.chance,
      accuracyRoll: accuracy.roll
    });
    eventEffects.push(...defended.effects.map((effect) => ({ ...effect, targetIndex: playerIndex })));
    if (player.hp <= 0) {
      knockedOutIndexes.push(playerIndex);
      if (isLocalPlayer(playerIndex)) s.selected.clear();
    }
  });
  if (!damages.length) return null;
  eventEffects.push(...applyKingdomEnemyAilments(
    'area',
    damages.filter((entry) => entry.damage > 0).map((entry) => entry.playerIndex)
  ));
  ensureKingdomBattleEffects().enemyAttackedSinceClear = true;
  damages.forEach((entry) => {
    if (entry.damage <= 0) return;
    const counter = applyKingdomCounter(entry.playerIndex);
    if (counter) eventEffects.push(counter);
  });
  const event = pushKingdomBattleEvent('enemy-area', {
    targetIndexes: damages.map((entry) => entry.playerIndex),
    damages,
    knockedOutIndexes,
    effects: eventEffects,
    label: `${s.battle.enemy.name}の全体攻撃`
  });
  if (s.battle.enemy.hp <= 0 && s.battle.enemy.rushStartedAtSeq == null) s.battle.enemy.rushStartedAtSeq = event.seq;
  log(`${s.battle.enemy.name}: ターン更新時の全体攻撃`);
  knockedOutIndexes.forEach((playerIndex) => {
    log(`${pName(playerIndex)}: 戦闘不能（以後は強制スキップ）`);
  });
  return event;
}

function isKingdomPartyDefeated(state = s) {
  return !!(
    isKingdomBattleActive(state)
    && Array.isArray(state?.players)
    && state.players.length > 0
    && state.players.every((_, index) => !isKingdomBattlePlayerConscious(index, state))
  );
}

function finishKingdomBattleDefeat() {
  if (!s?.battle || s.battle.outcome) return false;
  clearNpcTimer();
  clearCallCinematicTimer();
  clearPendingTurnAdvanceAfterTrick();
  clearKingdomTransitionTimer();
  s.transition = null;
  s.battle.active = false;
  s.battle.outcome = 'defeat';
  s.battle.resultReason = 'party-defeated';
  pushKingdomBattleEvent('defeat', { label: 'パーティ全滅' });
  s.roundActive = false;
  s.phase = 'done';
  s.awaitRoundConfirm = false;
  s.pendingDraw = null;
  s.pendingJudgment = null;
  s.selected.clear();
  s.roundSettlement = null;
  s.champion = null;
  s.message = '全員が戦闘不能になりました。モンスター戦敗北。';
  log(s.message);
  return true;
}

function startKingdomTerminalEnemyTransition(actorIndex, attackEvents = []) {
  if (!s?.battle || s.battle.outcome !== 'defeat') return null;
  const defeatEvent = (Array.isArray(s.battle.events) ? s.battle.events : [])
    .slice().reverse().find((event) => event?.type === 'defeat');
  const orderedEvents = [...attackEvents, defeatEvent].filter(Boolean);
  const eventSeqs = orderedEvents.map((event) => Number(event.seq)).filter(Number.isFinite);
  const duration = orderedEvents.reduce((total, event) => total + getKingdomBattleEventDuration(event), 0);
  const eventTimelineSpecs = buildKingdomEnemyTimelineSpecs(attackEvents);
  const primaryTimeline = eventTimelineSpecs[String(attackEvents?.[0]?.seq || '')] || null;
  s.phase = 'resolvingEnemy';
  s.message = `${s.battle.enemy.name}の攻撃を解決中...`;
  return setKingdomTransition('terminalEnemyResponse', actorIndex, duration, {
    eventSeqs,
    ...(primaryTimeline ? { timeline: primaryTimeline, eventTimelineSpecs } : {}),
    terminalOutcome: 'defeat'
  });
}

function markKingdomBattleVictory(winnerIndex) {
  if (!s?.battle || s.battle.outcome) return;
  const enemy = s.battle.enemy;
  const hpBefore = Math.max(0, Number(enemy?.hp) || 0);
  if (enemy) enemy.hp = 0;
  s.battle.active = false;
  s.battle.outcome = 'victory';
  s.battle.resultReason = 'hand-empty';
  const victoryEvent = pushKingdomBattleEvent('victory', {
    actorIndex: winnerIndex,
    finisher: true,
    hpBefore,
    hpAfter: 0,
    enemyHpBefore: hpBefore,
    enemyHp: 0,
    deathAnimation: 'death',
    deathDurationMs: getKingdomMonsterAnimationDurationMs(enemy?.id, 'death'),
    dustDurationMs: KINGDOM_ENEMY_DUST_DURATION_MS,
    label: `${pName(winnerIndex)}が出し切り！ BATTLE WIN`
  });
  if (enemy && victoryEvent) {
    if (enemy.rushStartedAtSeq == null) enemy.rushStartedAtSeq = victoryEvent.seq;
    enemy.defeatedAtSeq = victoryEvent.seq;
    enemy.finishedAt = victoryEvent.at;
  }
  if (s.stage) {
    const stage = normalizeKingdomExplorationStageState(s.stage);
    const winner = s.players?.[winnerIndex];
    const roundNo = Math.max(1, Math.min(TOTAL_HANDS, Number(s.handNo || 0) + 1));
    if (stage && winner && !stage.finishers.some((entry) => entry.roundNo === roundNo)) {
      stage.finishers.push({
        roundNo,
        playerIndex: winnerIndex,
        playFabId: String(winner.playFabId || ''),
        isNpc: winner.isNpc === true,
        monsterId: String(enemy?.id || '')
      });
      s.stage = stage;
    }
  }
}

function normalizeKingdomRules(
  rawRules = null,
  fallbackHandSize = DEFAULT_HAND_LIMIT,
  fallbackCombatEffectsVersion = 1,
  fallbackSummonVersion = 1,
  fallbackGraveTimingVersion = 1,
  fallbackEnemyCombatVersion = 1,
  fallbackMajorArcanaGateVersion = 1,
  fallbackMajorArcanaSpecialVersion = 1,
  fallbackStageVersion = 0
) {
  const incoming = rawRules && typeof rawRules === 'object' ? rawRules : {};
  const fallback = Math.max(1, Math.min(20, Math.floor(Number(fallbackHandSize) || DEFAULT_HAND_LIMIT)));
  const initialHandSize = Math.max(
    1,
    Math.min(20, Math.floor(Number(incoming.initialHandSize) || fallback))
  );
  const handLimit = Math.max(
    initialHandSize,
    Math.min(20, Math.floor(Number(incoming.handLimit) || fallback))
  );
  return {
    version: KINGDOM_RULES_VERSION,
    initialHandSize,
    handLimit,
    playerCount: normalizeKingdomPlayerCount(incoming.playerCount, PLAYERS.length),
    combatEffectsVersion: Math.max(
      0,
      Math.min(1, Math.floor(Number(incoming.combatEffectsVersion ?? fallbackCombatEffectsVersion) || 0))
    ),
    summonVersion: Math.max(
      0,
      Math.min(1, Math.floor(Number(incoming.summonVersion ?? fallbackSummonVersion) || 0))
    ),
    graveTimingVersion: Math.max(
      0,
      Math.min(1, Math.floor(Number(incoming.graveTimingVersion ?? fallbackGraveTimingVersion) || 0))
    ),
    enemyCombatVersion: Math.max(
      0,
      Math.min(1, Math.floor(Number(incoming.enemyCombatVersion ?? fallbackEnemyCombatVersion) || 0))
    ),
    majorArcanaGateVersion: Math.max(
      0,
      Math.min(1, Math.floor(Number(incoming.majorArcanaGateVersion ?? fallbackMajorArcanaGateVersion) || 0))
    ),
    majorArcanaSpecialVersion: Math.max(
      0,
      Math.min(1, Math.floor(Number(incoming.majorArcanaSpecialVersion ?? fallbackMajorArcanaSpecialVersion) || 0))
    ),
    stageVersion: Math.max(
      0,
      Math.min(1, Math.floor(Number(incoming.stageVersion ?? fallbackStageVersion) || 0))
    )
  };
}

function getKingdomInitialHandSize(state = s) {
  return normalizeKingdomRules(state?.rules, DEFAULT_INITIAL_HAND_SIZE).initialHandSize;
}

function getKingdomHandLimit(state = s) {
  return normalizeKingdomRules(state?.rules, DEFAULT_HAND_LIMIT).handLimit;
}

function initState() {
  const playerTemplates = getKingdomInitialPlayerTemplates();
  const rules = normalizeKingdomRules({
    playerCount: playerTemplates.length
  });
  return {
    rules,
    players: playerTemplates.map((p) => ({
      ...p,
      chips: START_CHIPS,
      hand: [],
      discard: [],
      bet: 0,
      stars: 0,
      character: null,
      maxHp: KINGDOM_FALLBACK_PLAYER_MAX_HP,
      hp: KINGDOM_FALLBACK_PLAYER_MAX_HP
    })),
    handNo: 0,
    turnCount: 0,
    dealer: 0,
    turn: 0,
    phase: 'idle',
    roundActive: false,
    openingDealRevealCount: 0,
    openingDealFlipIndex: -1,
    trick: null,
    trickPile: [],
    leadRequiredOwner: null,
    lastPlay: null,
    pass: playerTemplates.map(() => false),
    callOnly: false,
    lock: null,
    trickForcedCount: 0,
    judgmentRecoveryPending: false,
    reverse: false,
    drawDeck: [],
    pendingDraw: null,
    pendingDrawReason: null,
    pendingJudgment: null,
    pendingJudgmentFollowup: null,
    blockedLeaderSeats: [],
    callMergeFx: null,
    trickDefeatFx: null,
    trickTransitionKind: null,
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
    champion: null,
    revision: 0,
    processedActionIds: [],
    transition: null,
    characterSnapshotReady: false,
    characterSnapshotCreatedAt: 0,
    stage: null,
    battle: createKingdomBattleState(0, false, '', rules.enemyCombatVersion, playerTemplates.length, null)
  };
}

function clearRoundState() {
  clearSettlementGainFx();
  clearRoundStartCinematicTimer();
  clearOpeningDealTimers();
  clearDrawHandFlipTimers();
  clearLocalInfoMessage(false);
  clearKingdomTrickSceneFlash(false);
  clearKingdomTransitionTimer();
  s.transition = null;
  kingdomLocalGraveOpen = false;
  localHandSortDrawLock = false;
  s.trick = null;
  s.trickPile = [];
  s.leadRequiredOwner = null;
  s.lastPlay = null;
  s.pass = s.players.map(() => false);
  s.callOnly = false;
  s.lock = null;
  s.trickForcedCount = 0;
  s.judgmentRecoveryPending = false;
  s.reverse = false;
  s.pendingDraw = null;
  s.pendingDrawReason = null;
  s.pendingJudgment = null;
  s.pendingJudgmentFollowup = null;
  s.blockedLeaderSeats = [];
  s.callMergeFx = null;
  s.trickDefeatFx = null;
  s.trickTransitionKind = null;
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
  if (getLocalPlayerIndex() < 0) return;
  clearYourTurnBadge();
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

function getTarotKingdomDebugMode() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search || '');
  return String(params.get('tkdebug') || '').trim().toLowerCase();
}

function getTarotKingdomDebugWinnerIndex() {
  if (typeof window === 'undefined') return 0;
  const params = new URLSearchParams(window.location.search || '');
  const parsed = Number(params.get('tkwinner'));
  if (!Number.isInteger(parsed)) return 0;
  return Math.max(0, Math.min(PLAYERS.length - 1, parsed));
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

function isFreshKingdomPresence(info, now = Date.now()) {
  const updatedAt = Number(info?.updatedAt);
  return Number.isFinite(updatedAt)
    && updatedAt > 0
    && updatedAt <= now + TK_PRESENCE_FUTURE_TOLERANCE_MS
    && now - updatedAt <= TK_PRESENCE_STALE_MS;
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
  return Object.values(obj).filter((info) => isFreshKingdomPresence(info)).length;
}

async function registerOpenRoomIndex(db, roomId, ownerUid) {
  if (!netOpenRoomIndexEnabled) return;
  const normalizedOwnerUid = String(ownerUid || '').trim();
  if (!normalizedOwnerUid || !isNetModeActive() || !tkNet.isHost || tkNet.uid !== normalizedOwnerUid) {
    throw new Error('Open room index requires the current room host.');
  }
  const now = Date.now();
  const explorationContext = kingdomExplorationSession?.context || null;
  const isExplorationRescue = explorationContext?.mode === 'online';
  try {
    await set(ref(db, `${TK_MATCH_ROOT}/openRooms/${roomId}`), {
      roomId,
      ownerUid: normalizedOwnerUid,
      kind: isExplorationRescue ? 'exploration-rescue' : 'match',
      monsterName: isExplorationRescue ? String(explorationContext?.monsterName || '').slice(0, 16) : '',
      destinationName: isExplorationRescue ? String(explorationContext?.destinationName || '').slice(0, 24) : '',
      explorationId: isExplorationRescue ? String(explorationContext?.explorationId || '').slice(0, 128) : '',
      ownerPlayFabId: isExplorationRescue ? String(window.myPlayFabId || '').slice(0, 128) : '',
      stageNo: isExplorationRescue ? Math.max(0, Math.floor(Number(explorationContext?.stageNo) || 0)) : 0,
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
      continue;
    }
    const roomPath = `tarotKingdomRooms/${roomId}`;
    const stateSnap = await get(ref(db, `${roomPath}/state`));
    const payload = stateSnap.exists() ? stateSnap.val() : null;
    const inProgress = isRoomInProgressFromStatePayload(payload);
    const presenceSnap = await get(ref(db, `${roomPath}/presence`));
    const presenceMap = presenceSnap.exists() ? (presenceSnap.val() || {}) : {};
    const count = Object.values(presenceMap).filter((info) => isFreshKingdomPresence(info)).length;
    const hostUidSnap = await get(ref(db, `${roomPath}/meta/hostUid`));
    const hostUid = hostUidSnap.exists() ? String(hostUidSnap.val() || '') : '';
    const hasLiveHost = !hostUid || isFreshKingdomPresence(presenceMap?.[hostUid]);
    if (inProgress || count >= 4 || count <= 0 || !hasLiveHost) {
      continue;
    }
    netJoinedExplorationMeta = item?.kind === 'exploration-rescue'
      ? { roomId, ...item }
      : null;
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
    const count = Object.values(presenceMap).filter((info) => isFreshKingdomPresence(info)).length;
    const hostUidSnap = await get(ref(db, `${roomPath}/meta/hostUid`)).catch(() => null);
    const hostUid = hostUidSnap?.exists?.() ? String(hostUidSnap.val() || '') : '';
    const hasLiveHost = !hostUid || isFreshKingdomPresence(presenceMap?.[hostUid]);
    if (inProgress || count >= 4) continue;
    if (count <= 0) return roomId;
    if (hasLiveHost) return roomId;
  }
  return `tk_auto_${Math.floor(Math.random() * TK_FALLBACK_AUTO_ROOM_COUNT)}`;
}

async function findOrCreateAutoRoomId(db) {
  const joinable = await pickJoinableOpenRoom(db);
  if (joinable) return joinable;
  netJoinedExplorationMeta = null;
  if (!netOpenRoomIndexEnabled) {
    return pickJoinableFallbackRoom(db);
  }
  // The index is intentionally published only after presence and host election.
  // Publishing here would let a non-host reserve or overwrite matchmaking rows.
  return generateTarotKingdomRoomId();
}

function isNetModeActive() {
  return !!(tkNet.enabled && tkNet.db && tkNet.roomPath && tkNet.uid);
}

function isHostAuthority() {
  return !isNetModeActive() || (!!tkNet.isHost && netHostAuthorityReady);
}

function createKingdomHiddenCardSlots(count) {
  const safeCount = Math.max(0, Math.min(80, Math.floor(Number(count) || 0)));
  return Array.from({ length: safeCount }, () => null);
}

function serializeKingdomAuthorityStateForNet() {
  if (!s) return null;
  const drawDeck = cloneKingdomSnapshotValue(s.drawDeck || [], []);
  return {
    version: KINGDOM_PRIVATE_STATE_VERSION,
    revision: Math.max(0, Math.floor(Number(s.revision) || 0)),
    handsBySeat: Object.fromEntries(s.players.map((player, seat) => {
      const cards = cloneKingdomSnapshotValue(player?.hand || [], []);
      return [`seat${seat}`, {
        handCount: cards.length,
        ...(cards.length > 0 ? { cards } : {})
      }];
    })),
    drawDeck: {
      count: drawDeck.length,
      ...(drawDeck.length > 0 ? { cards: drawDeck } : {})
    },
    drawFlipCardId: String(s.drawFlipCardId || '')
  };
}

function serializeKingdomPrivateHandsForNet() {
  if (!s) return {};
  const revision = Math.max(0, Math.floor(Number(s.revision) || 0));
  return Object.fromEntries(s.players.map((player, seat) => {
    const cards = cloneKingdomSnapshotValue(player?.hand || [], []);
    const ownsDrawFlip = Number(s.drawFlipPlayer) === seat;
    return [String(seat), {
      version: KINGDOM_PRIVATE_STATE_VERSION,
      revision,
      seat,
      handCount: cards.length,
      ...(cards.length > 0 ? { cards } : {}),
      drawFlipCardId: ownsDrawFlip ? String(s.drawFlipCardId || '') : ''
    }];
  }));
}

function normalizeKingdomPrivateHandPayload(payload, seat, expectedRevision = null) {
  if (!payload || typeof payload !== 'object') return null;
  const normalizedSeat = Number(payload.seat);
  const revision = Number(payload.revision);
  const handCount = Number(payload.handCount);
  const cards = Array.isArray(payload.cards)
    ? payload.cards
    : (handCount === 0 && payload.cards == null ? [] : null);
  if (
    ![1, KINGDOM_PRIVATE_STATE_VERSION].includes(Number(payload.version))
    || !Number.isInteger(normalizedSeat)
    || normalizedSeat !== Number(seat)
    || !Number.isInteger(revision)
    || revision < 0
    || (expectedRevision != null && revision !== Number(expectedRevision))
    || !cards
    || cards.length > 80
    || !Number.isInteger(handCount)
    || handCount !== cards.length
    || cards.some((card) => !card || typeof card !== 'object')
  ) {
    return null;
  }
  return {
    version: KINGDOM_PRIVATE_STATE_VERSION,
    revision,
    seat: normalizedSeat,
    handCount,
    cards: cloneKingdomSnapshotValue(cards, []),
    drawFlipCardId: String(payload.drawFlipCardId || '')
  };
}

function applyKingdomPrivateHandPayload(targetState, payload, seat) {
  if (!targetState?.players?.[seat]) return false;
  const normalized = normalizeKingdomPrivateHandPayload(payload, seat, targetState.revision);
  if (!normalized) return false;
  targetState.players[seat].hand = normalized.cards;
  if (Number(targetState.drawFlipPlayer) === Number(seat)) {
    targetState.drawFlipCardId = normalized.drawFlipCardId;
  }
  return true;
}

function isKingdomLocalPrivateStateReady(targetState = s) {
  if (!isNetModeActive() || Number(targetState?.privateStateVersion) <= 0) return true;
  if (tkNet.isHost) return netHostAuthorityReady;
  const seat = Number(tkNet.localSeat);
  if (!Number.isInteger(seat) || seat < 0 || seat >= Number(targetState?.players?.length || 0)) return false;
  return !!normalizeKingdomPrivateHandPayload(netLocalPrivateHandPayload, seat, targetState.revision);
}

function applyKingdomAuthorityState(targetState, payload) {
  if (!targetState || !payload || typeof payload !== 'object') return false;
  const revision = Number(payload.revision);
  const handsBySeat = payload.handsBySeat && typeof payload.handsBySeat === 'object'
    ? payload.handsBySeat
    : null;
  const readCollection = (row, countKey) => {
    if (!row || typeof row !== 'object') return null;
    const count = Number(row[countKey]);
    const cards = Array.isArray(row.cards)
      ? row.cards
      : (count === 0 && row.cards == null ? [] : null);
    if (
      !Number.isInteger(count)
      || count < 0
      || count > 80
      || !cards
      || cards.length !== count
      || cards.some((card) => !card || typeof card !== 'object')
    ) return null;
    return cards;
  };
  const hands = targetState.players.map((_, seat) => readCollection(handsBySeat?.[`seat${seat}`], 'handCount'));
  const currentDrawDeck = readCollection(payload.drawDeck, 'count');
  const legacyMinorDeck = currentDrawDeck ? null : readCollection(payload.minorDeck, 'count');
  const legacyMajorDeck = currentDrawDeck ? null : readCollection(payload.majorDeck, 'count');
  const drawDeck = currentDrawDeck || (
    legacyMinorDeck && legacyMajorDeck
      ? [...legacyMajorDeck, ...legacyMinorDeck]
      : null
  );
  if (
    ![1, KINGDOM_PRIVATE_STATE_VERSION].includes(Number(payload.version))
    || !Number.isInteger(revision)
    || revision !== Math.max(0, Math.floor(Number(targetState.revision) || 0))
    || hands.some((hand) => !hand)
    || !drawDeck
  ) {
    return false;
  }
  targetState.players.forEach((player, seat) => {
    player.hand = cloneKingdomSnapshotValue(hands[seat], []);
  });
  targetState.drawDeck = cloneKingdomSnapshotValue(drawDeck, []);
  targetState.drawFlipCardId = String(payload.drawFlipCardId || '');
  return true;
}

function serializeStateForNet() {
  if (!s) return null;
  const next = JSON.parse(JSON.stringify(s, (key, value) => {
    if (value instanceof Set) return [];
    return value;
  }));
  next.privateStateVersion = KINGDOM_PRIVATE_STATE_VERSION;
  next.players.forEach((player) => {
    player.handCount = Array.isArray(player.hand) ? player.hand.length : 0;
    delete player.hand;
  });
  next.drawDeckCount = Array.isArray(next.drawDeck) ? next.drawDeck.length : 0;
  delete next.drawDeck;
  delete next.drawFlipCardId;
  next.selected = [];
  delete next.graveOpen;
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
  const incomingSchema = Math.max(1, Math.floor(Number(payload.schema) || 1));
  const incomingRules = {
    ...(rawState.rules && typeof rawState.rules === 'object' ? rawState.rules : {})
  };
  if (incomingSchema < 7) incomingRules.majorArcanaGateVersion = 0;
  if (incomingSchema < 8) incomingRules.majorArcanaSpecialVersion = 0;
  if (incomingSchema < 10) incomingRules.stageVersion = 0;
  nextState.rules = normalizeKingdomRules(
    incomingRules,
    incomingSchema < 4 ? LEGACY_HAND_SIZE : DEFAULT_HAND_LIMIT,
    incomingSchema < 5 ? 0 : 1,
    incomingSchema < 6 ? 0 : 1,
    Object.prototype.hasOwnProperty.call(rawState.rules || {}, 'graveTimingVersion') ? 1 : 0,
    Object.prototype.hasOwnProperty.call(rawState.rules || {}, 'enemyCombatVersion') ? 1 : 0,
    incomingSchema < 7 ? 0 : 1,
    incomingSchema < 8 ? 0 : 1,
    incomingSchema < 10 ? 0 : 1
  );
  [
    'graveOpen',
    'reversePersist',
    'reversePersistSuspendOwner',
    'openOracleCard',
    'openOracle',
    'openOracleRevealed',
    'hiddenOracleCard',
    'hiddenOracleRevealed',
    'hermitPreview',
    'starDrainAuraOwner'
  ].forEach((key) => delete nextState[key]);
  if (nextState.roundSettlement && typeof nextState.roundSettlement === 'object') {
    delete nextState.roundSettlement.oracleHits;
    if (Array.isArray(nextState.roundSettlement.rows)) {
      nextState.roundSettlement.rows.forEach((row) => {
        if (row && typeof row === 'object') delete row.oracleHits;
      });
    }
  }

  const incomingPlayers = Array.isArray(rawState.players) ? rawState.players : [];
  const desiredPlayerCount = normalizeKingdomPlayerCount(
    nextState.rules.playerCount,
    incomingPlayers.length || base.players.length
  );
  nextState.rules.playerCount = desiredPlayerCount;
  const playerBases = Array.from({ length: desiredPlayerCount }, (_, index) => (
    base.players[index] || PLAYERS[index] || PLAYERS[PLAYERS.length - 1]
  ));
  nextState.players = playerBases.map((playerBase, idx) => {
    const incoming = (incomingPlayers[idx] && typeof incomingPlayers[idx] === 'object')
      ? incomingPlayers[idx]
      : {};
    const bet = Number(incoming.bet);
    const stars = Number(incoming.stars);
    const incomingCharacter = incoming.character && typeof incoming.character === 'object'
      ? normalizeTarotKingdomCharacter(incoming.character, {
        displayName: incoming.name || playerBase.name,
        playFabId: incoming.playFabId || '',
        combat: { maxHp: incoming.maxHp || KINGDOM_FALLBACK_PLAYER_MAX_HP }
      })
      : null;
    const maxHp = Math.max(
      1,
      Math.floor(Number(incomingCharacter?.combat?.maxHp) || Number(incoming.maxHp) || KINGDOM_FALLBACK_PLAYER_MAX_HP)
    );
    const hp = Math.max(0, Math.min(maxHp, Math.floor(Number(incoming.hp ?? maxHp) || 0)));
    return {
      ...playerBase,
      ...incoming,
      hand: Array.isArray(incoming.hand)
        ? incoming.hand
        : createKingdomHiddenCardSlots(incoming.handCount),
      discard: Array.isArray(incoming.discard) ? incoming.discard : [],
      bet: Number.isFinite(bet) ? bet : Number(playerBase.bet || 0),
      stars: Number.isFinite(stars) ? stars : Number(playerBase.stars || 0),
      character: incomingCharacter,
      maxHp,
      hp
    };
  });

  if (Array.isArray(rawState.drawDeck)) {
    nextState.drawDeck = rawState.drawDeck;
  } else if (rawState.drawDeckCount != null) {
    nextState.drawDeck = createKingdomHiddenCardSlots(rawState.drawDeckCount);
  } else {
    const legacyMinor = Array.isArray(rawState.minorDeck)
      ? rawState.minorDeck
      : createKingdomHiddenCardSlots(rawState.minorDeckCount);
    const legacyMajor = Array.isArray(rawState.majorDeck)
      ? rawState.majorDeck
      : createKingdomHiddenCardSlots(rawState.majorDeckCount);
    nextState.drawDeck = [...legacyMajor, ...legacyMinor];
  }

  const incomingPass = Array.isArray(rawState.pass) ? rawState.pass : [];
  nextState.pass = nextState.players.map((_, idx) => !!incomingPass[idx]);
  nextState.blockedLeaderSeats = Array.isArray(rawState.blockedLeaderSeats)
    ? Array.from(new Set(rawState.blockedLeaderSeats
      .map((value) => Math.floor(Number(value)))
      .filter((value) => value >= 0 && value < nextState.players.length)))
    : [];
  nextState.pendingJudgmentFollowup = ['clear', 'world'].includes(String(rawState.pendingJudgmentFollowup || ''))
    ? String(rawState.pendingJudgmentFollowup)
    : null;
  nextState.logs = Array.isArray(rawState.logs) ? rawState.logs : [];
  nextState.trickPile = Array.isArray(rawState.trickPile)
    ? rawState.trickPile.map((entry) => ({
      owner: Math.max(0, Math.min(nextState.players.length - 1, Math.floor(Number(entry?.owner) || 0))),
      card: entry?.card
    })).filter((entry) => !!entry.card)
    : [];
  nextState.selected = new Set();
  nextState.revision = Math.max(0, Math.floor(Number(rawState.revision) || 0));
  nextState.processedActionIds = Array.isArray(rawState.processedActionIds)
    ? rawState.processedActionIds.map((value) => String(value || '')).filter(Boolean).slice(-32)
    : [];
  nextState.transition = rawState.transition && typeof rawState.transition === 'object'
    ? {
      ...rawState.transition,
      kind: String(rawState.transition.kind || ''),
      actorIndex: Number.isInteger(Number(rawState.transition.actorIndex)) ? Number(rawState.transition.actorIndex) : null,
      startedAt: Math.max(0, Number(rawState.transition.startedAt) || 0),
      endsAt: Math.max(0, Number(rawState.transition.endsAt) || 0),
      playToken: String(rawState.transition.playToken || ''),
      timeline: normalizeKingdomTransitionTimeline(
        rawState.transition.timeline,
        Math.max(0, Number(rawState.transition.startedAt) || 0),
        Math.max(0, Number(rawState.transition.endsAt) || 0)
      ),
      eventTimelines: Object.fromEntries(Object.entries(rawState.transition.eventTimelines || {}).map(([seq, timeline]) => [
        String(seq),
        normalizeKingdomTransitionTimeline(
          timeline,
          Math.max(0, Number(timeline?.startedAt) || Number(rawState.transition.startedAt) || 0),
          Math.max(0, Number(timeline?.endsAt) || Number(rawState.transition.endsAt) || 0)
        )
      ]).filter(([, timeline]) => !!timeline))
    }
    : null;
  nextState.characterSnapshotReady = !!rawState.characterSnapshotReady
    && nextState.players.every((player) => !!player.character);
  nextState.stage = incomingSchema >= 10
    ? normalizeKingdomExplorationStageState(rawState.stage)
    : null;
  nextState.battle = normalizeKingdomBattleState(
    rawState.battle,
    nextState.handNo,
    nextState.roundActive,
    nextState.rules.enemyCombatVersion,
    nextState.players.length,
    nextState.stage
  );
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
      await registerOpenRoomIndex(tkNet.db, tkNet.roomId, tkNet.uid);
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
  if (!isNetModeActive() || !tkNet.isHost || !netHostAuthorityReady || !netRoomStateReady || !s) return;
  const payload = serializeStateForNet();
  const authorityState = serializeKingdomAuthorityStateForNet();
  const privateHands = serializeKingdomPrivateHandsForNet();
  if (!payload || !authorityState) return;
  const hash = JSON.stringify({ state: payload.state, authorityState, privateHands });
  if (!force && hash === netLastStateHash) return;
  netLastStateHash = hash;
  try {
    if (KINGDOM_TRACE_ENABLED) {
      console.debug(`[TK-NET] publish state room=${tkNet.roomId} phase=${s.phase} turn=${s.turn} force=${force}`);
    }
    const writes = {
      state: payload,
      authorityState
    };
    Object.entries(privateHands).forEach(([seat, privateHand]) => {
      writes[`privateHands/${seat}`] = privateHand;
    });
    // Public state and its matching private revision must commit together. A
    // host disconnect between separate writes would otherwise leave a new host
    // unable to reconstruct the authoritative hands/decks.
    await update(ref(tkNet.db, tkNet.roomPath), writes);
    await syncOpenRoomIndex();
  } catch (error) {
    console.warn('[tarotKingdom] failed to publish room state:', error);
  }
}

function queueStatePublish(force = false) {
  if (!isNetModeActive() || !tkNet.isHost || !netHostAuthorityReady || !netRoomStateReady) return;
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
  if (presenceGraceTimer) {
    clearTimeout(presenceGraceTimer);
    presenceGraceTimer = null;
  }
  const fallbackNames = ['あなた', 'NPC1', 'NPC2', 'NPC3'];
  const seatTaken = [null, null, null, null];
  Object.entries(netPresenceByUid || {}).forEach(([uid, info]) => {
    if (!isFreshKingdomPresence(info)) return;
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
      name: localName,
      playFabId: tkNet.uid
    };
  }

  const now = Date.now();
  for (let i = 0; i < s.players.length; i += 1) {
    const p = s.players[i];
    const occ = seatTaken[i];
    if (occ) {
      const occName = String(occ.displayName || occ.name || fallbackNames[i] || `P${i + 1}`);
      p.isNpc = false;
      if (!s.characterSnapshotReady) p.name = occName;
      p.uid = occ.uid || null;
      if (!s.characterSnapshotReady) p.playFabId = String(occ.uid || '').trim();
      presenceGraceBySeat[i] = {
        uid: p.uid,
        name: String(p.name || occName),
        playFabId: String(p.playFabId || occ.uid || '').trim(),
        until: now + PRESENCE_AWAY_GRACE_MS
      };
      continue;
    }
    const grace = presenceGraceBySeat[i];
    if (grace && Number(grace.until || 0) > now) {
      p.isNpc = false;
      p.name = String(grace.name || fallbackNames[i] || `P${i + 1}`);
      p.uid = grace.uid || null;
      p.playFabId = String(grace.playFabId || '').trim();
      continue;
    }
    p.isNpc = true;
    if (s.characterSnapshotReady && p.character) {
      p.uid = null;
      presenceGraceBySeat[i] = { uid: null, name: p.name, playFabId: p.playFabId, until: 0 };
      continue;
    }
    p.name = fallbackNames[i] || `NPC${i}`;
    p.uid = null;
    p.playFabId = '';
    presenceGraceBySeat[i] = { uid: null, name: '', playFabId: '', until: 0 };
  }

  const nextGraceExpiry = presenceGraceBySeat
    .map((slot, index) => ({ index, until: Number(slot.until || 0) }))
    .filter(({ index, until }) => !seatTaken[index] && until > now)
    .reduce((earliest, entry) => Math.min(earliest, entry.until), Number.POSITIVE_INFINITY);
  if (Number.isFinite(nextGraceExpiry)) {
    presenceGraceTimer = setTimeout(() => {
      presenceGraceTimer = null;
      if (!s || !isNetModeActive()) return;
      applyPresenceToPlayers();
      if (tkNet.isHost) queueStatePublish(true);
      scheduleNpc();
      render();
    }, Math.max(20, nextGraceExpiry - Date.now() + 20));
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
  const rescueLabel = String(item?.monsterName || item?.destinationName || '').trim();
  const roomLabel = item?.kind === 'exploration-rescue'
    ? `救難 ${rescueLabel || `#${idShort}`}`
    : `#${idShort}`;
  return `${roomLabel} ${seatText}${ageText}${suffix}`;
}

function getActiveSeatCount() {
  const taken = new Set();
  Object.values(netPresenceByUid || {}).forEach((info) => {
    if (!isFreshKingdomPresence(info)) return;
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
    const wasHost = !!tkNet.isHost;
    const hostRef = ref(tkNet.db, `${tkNet.roomPath}/meta/hostUid`);
    const result = await runTransaction(hostRef, (currentValue) => {
      const current = String(currentValue || '').trim();
      const hostMissingFromPresence = !!current && !isFreshKingdomPresence(netPresenceByUid?.[current]);
      if (!current || (forceTakeover && hostMissingFromPresence)) return tkNet.uid;
      return currentValue;
    }, { applyLocally: false });
    const committedHost = String(result?.snapshot?.val?.() || '').trim();
    tkNet.hostUid = committedHost;
    tkNet.isHost = committedHost === tkNet.uid;
    if (!tkNet.isHost) netHostAuthorityReady = false;
    if (!wasHost && tkNet.isHost) {
      await armKingdomHostDisconnectHooks();
      if (netRoomStateReady) await activateKingdomPromotedHost();
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

  // Preferred path: claim one seat-owner lease atomically. Each transaction
  // targets a single protected child, so RTDB rules can bind it to auth.uid.
  try {
    const seatByUidRef = ref(tkNet.db, `${tkNet.roomPath}/meta/seatByUid/${tkNet.uid}`);
    const [existingSeatSnapshot, roomStateSnapshot, presenceSnapshot] = await Promise.all([
      get(seatByUidRef),
      get(ref(tkNet.db, `${tkNet.roomPath}/state`)),
      get(ref(tkNet.db, `${tkNet.roomPath}/presence`))
    ]);
    const existingSeat = existingSeatSnapshot.exists() ? Number(existingSeatSnapshot.val()) : -1;
    if (
      (!Number.isInteger(existingSeat) || existingSeat < 0 || existingSeat >= 4)
      && roomStateSnapshot.exists()
      && isRoomInProgressFromStatePayload(roomStateSnapshot.val())
    ) {
      tkNet.localSeat = -1;
      return -1;
    }
    const presence = presenceSnapshot.exists() ? (presenceSnapshot.val() || {}) : {};
    const candidates = [existingSeat, 0, 1, 2, 3]
      .filter((seat, index, values) => Number.isInteger(seat) && seat >= 0 && seat < 4 && values.indexOf(seat) === index);

    for (const seat of candidates) {
      const ownerRef = ref(tkNet.db, `${tkNet.roomPath}/meta/seatOwners/${seat}`);
      const result = await runTransaction(ownerRef, (currentValue) => {
        const currentUid = String(
          currentValue && typeof currentValue === 'object' ? currentValue.uid : currentValue
        ).trim();
        const leaseUpdatedAt = Number(currentValue?.updatedAt || 0);
        const claimIsYoung = leaseUpdatedAt > 0 && Date.now() - leaseUpdatedAt <= TK_SEAT_CLAIM_GRACE_MS;
        if (
          currentUid
          && currentUid !== tkNet.uid
          && (claimIsYoung || isFreshKingdomPresence(presence[currentUid]))
        ) return;
        return { uid: tkNet.uid, updatedAt: Date.now() };
      }, { applyLocally: false });
      const owner = result?.snapshot?.val?.();
      const ownerUid = String(owner && typeof owner === 'object' ? owner.uid : owner || '').trim();
      if (ownerUid !== tkNet.uid) continue;
      await set(seatByUidRef, seat);
      tkNet.localSeat = seat;
      return seat;
    }
    tkNet.localSeat = -1;
    return -1;
  } catch (error) {
    if (!isPermissionDeniedError(error)) throw error;
    console.warn('[tarotKingdom] seatByUid permission denied. fallback to presence-based seat assignment.');
  }

  // Fallback path: atomically reserve a seat in presence. A read-then-write fallback
  // can assign the same seat to simultaneous joiners, so do not use one here.
  try {
    const presenceRef = ref(tkNet.db, `${tkNet.roomPath}/presence`);
    const result = await runTransaction(presenceRef, (currentValue) => {
      const current = currentValue && typeof currentValue === 'object' ? { ...currentValue } : {};
      const existing = Number(current?.[tkNet.uid]?.seat);
      if (Number.isInteger(existing) && existing >= 0 && existing < 4) return current;
      const used = new Set(
        Object.values(current)
          .filter((value) => isFreshKingdomPresence(value))
          .map((value) => Number(value?.seat))
          .filter((value) => Number.isInteger(value) && value >= 0 && value < 4)
      );
      const seat = pickSeat(used);
      if (seat < 0) return;
      current[tkNet.uid] = {
        uid: tkNet.uid,
        seat,
        displayName: tkNet.localPlayerName,
        playFabId: String(window.myPlayFabId || tkNet.uid),
        updatedAt: Date.now()
      };
      return current;
    }, { applyLocally: false });
    const committed = result?.snapshot?.val?.() || {};
    const seat = Number(committed?.[tkNet.uid]?.seat);
    tkNet.localSeat = Number.isInteger(seat) && seat >= 0 && seat < 4 ? seat : -1;
    return tkNet.localSeat;
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      console.warn('[tarotKingdom] atomic presence seat reservation was denied.');
      tkNet.localSeat = -1;
      return -1;
    }
    throw error;
  }
}

function createKingdomActionId() {
  const cryptoId = globalThis.crypto?.randomUUID?.();
  return cryptoId || `tk-action-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function rememberKingdomActionId(actionId) {
  if (!s || !actionId) return;
  const ids = Array.isArray(s.processedActionIds) ? s.processedActionIds.slice() : [];
  ids.push(String(actionId));
  s.processedActionIds = Array.from(new Set(ids)).slice(-32);
}

function rebuildKingdomPlayFromAction(seat, payload) {
  const player = s?.players?.[seat];
  const selectedCardIds = Array.isArray(payload?.selectedCardIds)
    ? payload.selectedCardIds.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  if (!player || selectedCardIds.length < 1 || selectedCardIds.length > 5) {
    return { ok: false, reason: '提出カードが不正です。' };
  }
  if (new Set(selectedCardIds).size !== selectedCardIds.length) {
    return { ok: false, reason: '同じカードが重複しています。' };
  }
  const indexes = selectedCardIds.map((cardId) => player.hand.findIndex((card) => String(card?.id || '') === cardId));
  if (indexes.some((index) => index < 0) || new Set(indexes).size !== indexes.length) {
    return { ok: false, reason: '現在の手札にないカードです。' };
  }
  const playMode = selectedCardIds.length === 4
    ? 'call'
    : (selectedCardIds.length === 5 ? 'role' : 'set');
  let built;
  if (playMode === 'call') built = buildCallPlay(seat, indexes);
  else if (playMode === 'role') built = buildRolePlay(seat, indexes);
  else if (playMode === 'set') built = buildSetPlay(seat, indexes);
  else return { ok: false, reason: '提出種別が不正です。' };
  if (!built?.ok || !built.play) return built || { ok: false, reason: '役を再構築できません。' };
  const validationMode = playMode === 'call' ? 'call' : 'normal';
  const validation = validatePlay(built.play, validationMode);
  if (!validation.ok) return validation;
  built.play.actionId = String(payload.actionId || '');
  return { ok: true, play: built.play };
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

function clearKingdomHostHydrationRetry() {
  if (netHostHydrationRetryTimer) {
    clearTimeout(netHostHydrationRetryTimer);
    netHostHydrationRetryTimer = null;
  }
}

function scheduleKingdomHostHydrationRetry() {
  clearKingdomHostHydrationRetry();
  if (!isNetModeActive() || !tkNet.isHost || netHostAuthorityReady) return;
  netHostHydrationRetryTimer = setTimeout(() => {
    netHostHydrationRetryTimer = null;
    if (!isNetModeActive() || !tkNet.isHost || netHostAuthorityReady) return;
    activateKingdomPromotedHost().catch((error) => {
      console.warn('[tarotKingdom] host authority retry failed:', error);
    });
  }, 1200);
}

function cancelKingdomDisconnectHook(key) {
  const hook = tkNet?.[key] || null;
  if (!hook) return;
  tkNet[key] = null;
  try {
    const pending = hook.cancel?.();
    pending?.catch?.(() => {});
  } catch (_) {
    // Best-effort cleanup for a connection that may already be gone.
  }
}

async function armKingdomHostDisconnectHooks() {
  if (!isNetModeActive() || !tkNet.isHost) return;
  const db = tkNet.db;
  const roomPath = tkNet.roomPath;
  const roomId = tkNet.roomId;
  const uid = tkNet.uid;

  if (!tkNet.hostDisconnect) {
    const hook = onDisconnect(ref(db, `${roomPath}/meta/hostUid`));
    tkNet.hostDisconnect = hook;
    try {
      await hook.remove();
    } catch (_) {
      if (tkNet.hostDisconnect === hook) tkNet.hostDisconnect = null;
    }
    if (!isNetModeActive() || !tkNet.isHost || tkNet.uid !== uid || tkNet.roomPath !== roomPath) {
      try { await hook.cancel?.(); } catch (_) { /* ignore */ }
      if (tkNet.hostDisconnect === hook) tkNet.hostDisconnect = null;
    }
  }

  if (netOpenRoomIndexEnabled && !tkNet.openRoomDisconnect && isNetModeActive() && tkNet.isHost) {
    const hook = onDisconnect(ref(db, `${TK_MATCH_ROOT}/openRooms/${roomId}`));
    tkNet.openRoomDisconnect = hook;
    try {
      await hook.remove();
    } catch (_) {
      if (tkNet.openRoomDisconnect === hook) tkNet.openRoomDisconnect = null;
    }
    if (!isNetModeActive() || !tkNet.isHost || tkNet.uid !== uid || tkNet.roomPath !== roomPath) {
      try { await hook.cancel?.(); } catch (_) { /* ignore */ }
      if (tkNet.openRoomDisconnect === hook) tkNet.openRoomDisconnect = null;
    }
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
  if (typeof netPrivateHandUnsub === 'function') {
    netPrivateHandUnsub();
    netPrivateHandUnsub = null;
  }
  if (typeof netPresenceUnsub === 'function') {
    netPresenceUnsub();
    netPresenceUnsub = null;
  }
  if (typeof netOpenRoomsUnsub === 'function') {
    netOpenRoomsUnsub();
    netOpenRoomsUnsub = null;
  }
  netHostHydrationPromise = null;
  stopHostActionListener();
}

function validateKingdomActionEnvelope(payload, key = '') {
  if (!s || !payload || typeof payload !== 'object') {
    return { ok: false, reason: 'invalid-payload' };
  }
  const seat = payload.seat;
  const uid = String(payload.uid || '').trim();
  const type = String(payload.type || '');
  const actionId = String(payload.actionId || '').trim();
  const expectedRevision = payload.expectedRevision;
  const presenceInfo = netPresenceByUid?.[uid] || null;
  const presenceSeat = Number(presenceInfo?.seat);
  const occupyingUid = Number.isInteger(seat) ? String(s.players?.[seat]?.uid || '').trim() : '';
  if (
    !uid
    || !Number.isInteger(seat)
    || seat < 0
    || seat >= 4
    || !isFreshKingdomPresence(presenceInfo)
    || presenceSeat !== seat
    || occupyingUid !== uid
  ) {
    return { ok: false, reason: 'seat-owner-mismatch' };
  }
  if (!actionId) {
    return { ok: false, reason: 'invalid-action-id' };
  }
  if (s.processedActionIds?.includes(actionId)) {
    return { ok: false, reason: 'duplicate-action' };
  }
  if (s.transition && ['play', 'pass', 'draw', 'judgmentPick', 'judgmentSkip'].includes(type)) {
    return { ok: false, reason: 'transition-locked' };
  }
  if (!Number.isInteger(expectedRevision) || expectedRevision !== Math.max(0, Number(s.revision) || 0)) {
    return { ok: false, reason: 'stale-revision' };
  }
  return { ok: true, seat, uid, type, actionId, expectedRevision };
}

async function handleHostRoomAction(payload, key) {
  if (!isNetModeActive() || !tkNet.isHost || !s || !payload || typeof payload !== 'object') return;
  const cleanup = () => {
    if (key) remove(ref(tkNet.db, `${tkNet.roomPath}/actions/${key}`)).catch(() => {});
  };
  const envelope = validateKingdomActionEnvelope(payload, key);
  if (!envelope.ok) {
    cleanup();
    return;
  }
  const { seat, type, actionId } = envelope;
  if (KINGDOM_TRACE_ENABLED) {
    console.debug(`[TK-NET] host action key=${key} type=${type} seat=${seat} phase=${s.phase} turn=${s.turn}`);
  }
  let accepted = false;
  switch (type) {
    case 'startOrNext':
      // The host applies start locally. Remote participants cannot start or restart the room.
      break;
    case 'confirmRound':
      if (s.awaitRoundConfirm) {
        confirmRoundSettlement();
        accepted = true;
      }
      break;
    case 'play': {
      if (!s.roundActive) break;
      const fromDrawChoice = s.phase === 'draw' && s.pendingDraw === seat;
      if (!(fromDrawChoice || (s.phase === 'turn' && s.turn === seat))) break;
      if (!isKingdomBattlePlayerConscious(seat)) break;
      const rebuilt = rebuildKingdomPlayFromAction(seat, payload);
      if (!rebuilt.ok) break;
      if (fromDrawChoice) {
        s.pendingDraw = null;
        s.pendingDrawReason = null;
        s.phase = 'turn';
        s.turn = seat;
      }
      applyPlay(seat, rebuilt.play);
      accepted = true;
      break;
    }
    case 'pass':
      if (s.roundActive && s.phase === 'turn' && s.turn === seat) {
        passAction(seat);
        accepted = true;
      }
      break;
    case 'draw':
      if (s.roundActive && s.phase === 'draw' && s.pendingDraw === seat && isKingdomBattlePlayerConscious(seat)) {
        applyDrawChoice();
        accepted = true;
      }
      break;
    case 'judgmentPick':
      if (s.roundActive && s.phase === 'judgment' && s.pendingJudgment === seat && isKingdomBattlePlayerConscious(seat)) {
        applyJudgmentPick(Number(payload.owner), Number(payload.cardIndex));
        accepted = true;
      }
      break;
    case 'judgmentSkip':
      if (s.roundActive && s.phase === 'judgment' && s.pendingJudgment === seat && isKingdomBattlePlayerConscious(seat)) {
        skipJudgmentPick();
        accepted = true;
      }
      break;
    default:
      break;
  }
  if (accepted) {
    rememberKingdomActionId(actionId);
    queueStatePublish(true);
  }
  cleanup();
}

function startHostActionListener() {
  if (!isNetModeActive() || !tkNet.isHost || !netHostAuthorityReady || !netRoomStateReady) {
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
    handleHostRoomAction(payload, key).catch((error) => {
      console.warn('[tarotKingdom] host action failed:', error);
    });
  });
}

async function hydrateKingdomHostAuthorityFromRoom(targetState = s) {
  if (!isNetModeActive() || !tkNet.isHost || !targetState) return false;
  if (Number(targetState.privateStateVersion) <= 0) return true;
  const roomPath = tkNet.roomPath;
  const uid = tkNet.uid;
  const snapshot = await get(ref(tkNet.db, `${roomPath}/authorityState`));
  if (
    !isNetModeActive()
    || !tkNet.isHost
    || tkNet.uid !== uid
    || tkNet.roomPath !== roomPath
    || s !== targetState
    || !snapshot.exists()
  ) return false;
  return applyKingdomAuthorityState(targetState, snapshot.val());
}

async function activateKingdomPromotedHost() {
  if (!isNetModeActive() || !tkNet.isHost || !netRoomStateReady) return false;
  if (netHostHydrationPromise) return netHostHydrationPromise;
  const roomPath = tkNet.roomPath;
  const uid = tkNet.uid;
  netHostAuthorityReady = false;
  stopHostActionListener();
  const hydration = (async () => {
    try {
      // Refresh public state first so the authority snapshot is matched against
      // the same revision even if takeover races an in-flight publication.
      const stateSnapshot = await get(ref(tkNet.db, `${roomPath}/state`));
      if (
        !isNetModeActive()
        || !tkNet.isHost
        || tkNet.uid !== uid
        || tkNet.roomPath !== roomPath
      ) return false;
      if (stateSnapshot.exists()) applyRemoteRoomState(stateSnapshot.val());
      const hydrated = await hydrateKingdomHostAuthorityFromRoom(s);
      if (!hydrated) {
        if (s) {
          s.message = '対戦の非公開状態を復旧できません。再同期を待っています。';
          render();
        }
        scheduleKingdomHostHydrationRetry();
        return false;
      }
      netHostAuthorityReady = true;
      clearKingdomHostHydrationRetry();
      netHandledActionKeys.clear();
      startHostActionListener();
      scheduleOpenRoomHeartbeat();
      recoverKingdomHostProgress();
      queueStatePublish(true);
      return true;
    } catch (error) {
      console.warn('[tarotKingdom] host authority hydration failed:', error);
      scheduleKingdomHostHydrationRetry();
      return false;
    }
  })();
  netHostHydrationPromise = hydration;
  try {
    return await hydration;
  } finally {
    if (netHostHydrationPromise === hydration) netHostHydrationPromise = null;
  }
}

function applyRemoteRoomState(payload) {
  if (netManualOfflineMode) return;
  const next = deserializeStateFromNet(payload);
  if (!next) return;
  clearLocalInfoMessage(false);
  const localSeat = Number(tkNet.localSeat);
  if (
    Number(next.privateStateVersion) > 0
    && Number.isInteger(localSeat)
    && localSeat >= 0
    && localSeat < next.players.length
  ) {
    applyKingdomPrivateHandPayload(next, netLocalPrivateHandPayload, localSeat);
  }
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
  kingdomStateGeneration += 1;
  kingdomCharacterLoadPromise = null;
  kingdomRoundStartPromise = null;
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
  netHostUidUnsub = onValue(hostUidRef, async (snap) => {
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
      try {
        await armKingdomHostDisconnectHooks();
      } catch (error) {
        console.warn('[tarotKingdom] failed to arm host disconnect cleanup:', error);
      }
      if (!prevHost) {
        netHostAuthorityReady = false;
        netHandledActionKeys.clear();
      }
      if (netRoomStateReady) {
        if (!prevHost) {
          try {
            await activateKingdomPromotedHost();
          } catch (error) {
            console.warn('[tarotKingdom] promoted host activation failed:', error);
          }
        } else if (netHostAuthorityReady) {
          startHostActionListener();
          scheduleOpenRoomHeartbeat();
          recoverKingdomHostProgress();
        }
      }
    } else {
      netHostAuthorityReady = false;
      clearKingdomHostHydrationRetry();
      if (prevHost) {
        cancelKingdomDisconnectHook('hostDisconnect');
        cancelKingdomDisconnectHook('openRoomDisconnect');
      }
      stopHostActionListener();
      clearOpenRoomHeartbeatTimer();
    }
  });

  const presenceRef = ref(tkNet.db, `${tkNet.roomPath}/presence`);
  netPresenceUnsub = onValue(presenceRef, (snapshot) => {
    netPresenceByUid = snapshot.exists() ? (snapshot.val() || {}) : {};
    if (!tkNet.isHost && tkNet.hostUid && !isFreshKingdomPresence(netPresenceByUid[tkNet.hostUid])) {
      claimHostIfNeeded(true).catch((error) => {
        console.warn('[tarotKingdom] host takeover failed:', error);
      });
    }
    if (s) {
      applyPresenceToPlayers();
      if (tkNet.isHost && netRoomStateReady) queueStatePublish();
      render();
    }
  });

  const stateRef = ref(tkNet.db, `${tkNet.roomPath}/state`);
  netStateUnsub = onValue(stateRef, (snapshot) => {
    if (tkNet.isHost) return;
    if (!snapshot.exists()) return;
    netRoomStateReady = true;
    applyRemoteRoomState(snapshot.val());
  });

  const privateSeat = Number(tkNet.localSeat);
  if (Number.isInteger(privateSeat) && privateSeat >= 0 && privateSeat < 4) {
    const subscribedRoomPath = tkNet.roomPath;
    const privateHandRef = ref(tkNet.db, `${subscribedRoomPath}/privateHands/${privateSeat}`);
    netPrivateHandUnsub = onValue(privateHandRef, (snapshot) => {
      if (tkNet.roomPath !== subscribedRoomPath || Number(tkNet.localSeat) !== privateSeat) return;
      netLocalPrivateHandPayload = snapshot.exists() ? snapshot.val() : null;
      if (
        !tkNet.isHost
        && s
        && Number(s.privateStateVersion) > 0
        && applyKingdomPrivateHandPayload(s, netLocalPrivateHandPayload, privateSeat)
      ) {
        render();
      }
    }, (error) => {
      console.warn('[tarotKingdom] private hand subscription failed:', error);
    });
  }

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
  clearKingdomHostHydrationRetry();
  clearOpenRoomHeartbeatTimer();
  clearPresenceHeartbeatTimer();
  cancelKingdomDisconnectHook('presenceDisconnect');
  cancelKingdomDisconnectHook('hostDisconnect');
  cancelKingdomDisconnectHook('openRoomDisconnect');
  if (netActionWriteTimer) {
    clearTimeout(netActionWriteTimer);
    netActionWriteTimer = null;
  }
  if (presenceGraceTimer) {
    clearTimeout(presenceGraceTimer);
    presenceGraceTimer = null;
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
  tkNet.presenceDisconnect = null;
  tkNet.hostDisconnect = null;
  tkNet.openRoomDisconnect = null;
  netPresenceByUid = {};
  presenceGraceBySeat.forEach((slot) => {
    slot.uid = null;
    slot.name = '';
    slot.playFabId = '';
    slot.until = 0;
  });
  netOpenRoomsCache = {};
  netHandledActionKeys.clear();
  netLastStateHash = '';
  netBootPromise = null;
  netRoomStateReady = false;
  netLocalPrivateHandPayload = null;
  netHostHydrationPromise = null;
  netHostAuthorityReady = false;
  netForceCreateRoom = false;
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
    const forceCreateRoom = netForceCreateRoom;
    netForceCreateRoom = false;
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
      if (forceCreateRoom || explicitRoomId) netJoinedExplorationMeta = null;
      let roomId = forceCreateRoom
        ? generateTarotKingdomRoomId()
        : (explicitRoomId || await findOrCreateAutoRoomId(db));
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
      netRoomStateReady = false;
      netLocalPrivateHandPayload = null;
      netHostAuthorityReady = false;

      await ensureSeatAssignment();
      if (tkNet.localSeat < 0 && !explicitRoomId) {
        roomId = generateTarotKingdomRoomId();
        tkNet.roomId = roomId;
        tkNet.roomPath = `tarotKingdomRooms/${roomId}`;
        await ensureSeatAssignment();
      }
      if (tkNet.localSeat < 0) {
        teardownTarotKingdomNetwork();
        tkNet.localSeat = 0;
        return;
      }
      const presenceRef = ref(db, `${tkNet.roomPath}/presence/${tkNet.uid}`);
      tkNet.presenceRef = presenceRef;
      const presencePayload = {
        uid: tkNet.uid,
        seat: tkNet.localSeat,
        displayName: tkNet.localPlayerName,
        playFabId: String(window.myPlayFabId || tkNet.uid),
        updatedAt: serverTimestamp()
      };
      try {
        const disc = onDisconnect(presenceRef);
        tkNet.presenceDisconnect = disc;
        await disc.remove();
      } catch (_) {
        tkNet.presenceDisconnect = null;
      }
      // Publish this client before attempting host election. Otherwise a second
      // joiner can observe the freshly claimed host as absent and steal the
      // lease during the initial connection window.
      await set(presenceRef, presencePayload);
      netPresenceByUid[tkNet.uid] = { ...presencePayload, updatedAt: Date.now() };
      schedulePresenceHeartbeat();
      if (
        netJoinedExplorationMeta?.kind === 'exploration-rescue'
        && String(netJoinedExplorationMeta.roomId || '') === roomId
      ) {
        const localPlayFabId = String(window.myPlayFabId || tkNet.uid || '').trim();
        const ownerPlayFabId = String(netJoinedExplorationMeta.ownerPlayFabId || '').trim();
        const explorationId = String(netJoinedExplorationMeta.explorationId || '').trim();
        if (localPlayFabId && ownerPlayFabId && explorationId && localPlayFabId !== ownerPlayFabId) {
          await joinExplorationStage(localPlayFabId, ownerPlayFabId, explorationId, {
            isSilent: true,
            throwOnError: true
          });
        }
      }

      await claimHostIfNeeded();

      if (tkNet.isHost) {
        netHandledActionKeys.clear();
        await armKingdomHostDisconnectHooks();
      }
      startRoomSubscriptions();

      if (tkNet.isHost) {
        const roomStateSnap = await get(ref(db, `${tkNet.roomPath}/state`));
        if (!roomStateSnap.exists()) {
          resetMatch();
          applyPresenceToPlayers();
          netRoomStateReady = true;
          netHostAuthorityReady = true;
          startHostActionListener();
          scheduleOpenRoomHeartbeat();
          await publishStateToRoom(true);
        } else {
          applyRemoteRoomState(roomStateSnap.val());
          applyPresenceToPlayers();
          const hydrated = await hydrateKingdomHostAuthorityFromRoom(s);
          if (!hydrated) throw new Error('Tarot Kingdom private authority state is unavailable.');
          netRoomStateReady = true;
          netHostAuthorityReady = true;
          startHostActionListener();
          scheduleOpenRoomHeartbeat();
          recoverKingdomHostProgress();
          queueStatePublish(true);
        }
        await syncOpenRoomIndex();
      } else {
        const roomStateSnap = await get(ref(db, `${tkNet.roomPath}/state`));
        if (roomStateSnap.exists()) {
          netRoomStateReady = true;
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
  clearKingdomTransitionTimer();
  clearKingdomCardDealFx();
  kingdomStateGeneration += 1;
  kingdomCharacterLoadPromise = null;
  kingdomRoundStartPromise = null;
  resetKingdomBattleAvatarVisuals({ remove: true });
  clearKingdomMonsterFrameTimer();
  clearKingdomEnemyFinisherTimer();
  kingdomMonsterAnimationKey = '';
  kingdomBattleVisualEventKey = '';
  kingdomBattleTerminalFxEventKey = '';
  if (kingdomBattleVisualResetTimer) {
    clearTimeout(kingdomBattleVisualResetTimer);
    kingdomBattleVisualResetTimer = null;
  }
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
  if (ui.kingdomCutin) {
    ui.kingdomCutin.className = 'tarot-cutin';
    ui.kingdomCutin.replaceChildren();
    ui.kingdomCutin.setAttribute('aria-hidden', 'true');
  }
  setKingdomSummonCinematicState(false);
  ui.battleStage?.querySelector(':scope > .tarot-kingdom-skill-cutin')?.remove();
  ui.kingdomOverlay?.classList.remove('show', 'is-kingdom-clear', 'is-kingdom-draw', 'is-kingdom-roundend', 'is-kingdom-call', 'is-kingdom-call-freeze');
  if (!isNetModeActive()) {
    tkNet.localSeat = 0;
    const fallbackName = String(window.myPlayFabDisplayName || window.myLineProfile?.displayName || 'あなた');
    s.players.forEach((p, idx) => {
      p.isNpc = idx !== tkNet.localSeat;
      if (idx === tkNet.localSeat) {
        p.name = fallbackName;
        p.playFabId = String(window.myPlayFabId || '').trim();
      } else if (p.isPet) {
        p.name = String(p.pet?.monsterName || p.name || 'ペット');
        p.playFabId = '';
      } else {
        p.name = kingdomExplorationSession?.context?.mode === 'offline'
          ? `はぐれ海賊${getKingdomMercenaryOrdinal(s.players, idx)}`
          : (idx === 1 ? 'NPC1' : (idx === 2 ? 'NPC2' : 'NPC3'));
        p.playFabId = '';
      }
    });
  } else {
    applyPresenceToPlayers();
  }
}

function buildTarotKingdomDebugMatchDoneState(options = {}) {
  const st = initState();
  const winnerIndex = Math.max(0, Math.min(PLAYERS.length - 1, Number(options.winnerIndex) || 0));
  const humanName = String(
    options.humanName
    || window.myPlayFabDisplayName
    || window.myLineProfile?.displayName
    || 'あなた'
  ).trim() || 'あなた';
  const baseChips = [96, 88, 74, 102];
  const finalChips = baseChips.slice(0, PLAYERS.length);
  finalChips[winnerIndex] = 140;
  st.players = PLAYERS.map((player, index) => ({
    ...player,
    name: index === 0 ? humanName : (player.name || `NPC${index}`),
    playFabId: index === 0 ? String(window.myPlayFabId || '').trim() : '',
    chips: Math.max(0, Number(finalChips[index]) || START_CHIPS),
    hand: [],
    discard: [],
    bet: 0,
    stars: 0
  }));
  st.phase = 'done';
  st.roundActive = false;
  st.awaitRoundConfirm = false;
  st.handNo = TOTAL_HANDS;
  st.turn = winnerIndex;
  st.champion = winnerIndex;
  st.pot = 0;
  st.pass = [false, false, false, false];
  st.trick = null;
  st.callOnly = false;
  st.lock = null;
  const totalGain = 40;
  const winnerName = st.players[winnerIndex]?.name || `P${winnerIndex + 1}`;
  const winnerFinalChips = Math.max(0, Number(st.players[winnerIndex]?.chips) || 0);
  const winnerStartChips = Math.max(0, winnerFinalChips - totalGain);
  const rows = st.players
    .map((player, index) => ({ player, index }))
    .filter(({ index }) => index !== winnerIndex)
    .map(({ player, index }, rowIndex) => {
      const pay = rowIndex === 0 ? 18 : (rowIndex === 1 ? 12 : 10);
      const payerFinalChips = Math.max(0, Number(player.chips) || 0);
      return {
        payerIndex: index,
        payerName: player.name,
        pay,
        payerStartChips: payerFinalChips + pay,
        payerFinalChips,
        displayPayerChips: payerFinalChips
      };
    });
  st.roundSettlement = {
    winnerIndex,
    winnerName,
    totalGain,
    displayTotalGain: totalGain,
    winnerStartChips,
    winnerFinalChips,
    displayWinnerChips: winnerFinalChips,
    starBonus: 0,
    rows,
    potAward: 0,
    coinEvents: [],
    coinFxDispatched: true,
    matchDone: true
  };
  st.logs = [
    'デバッグ終局状態を読み込みました。',
    `${winnerName} が優勝。再戦ボタンの表示確認用 state です。`
  ];
  st.message = `デバッグ終局: ${winnerName} が優勝。ヘッダー右側の再戦ボタンを確認してください。`;
  return st;
}

function injectTarotKingdomDebugMatchDone(options = {}) {
  activateKingdomOfflineMode({
    renderNow: false,
    message: 'デバッグ終局状態を準備しています...'
  });
  clearSettlementGainFx();
  clearPendingTurnAdvanceAfterTrick();
  clearCallCinematicTimer();
  clearRoundStartCinematicTimer();
  clearRoundOutCinematicTimer();
  clearOpeningDealTimers();
  clearDrawHandFlipTimers();
  clearYourTurnBadge();
  s = buildTarotKingdomDebugMatchDoneState(options);
  trickRenderKey = '';
  trickRenderIdentityKey = '';
  trickRenderToken += 1;
  kingdomLocalInfoMessage = '';
  kingdomLocalPriorityMessage = '';
  lastHumanTurnActive = false;
  applyPresenceToPlayers();
  render();
  return s;
}

function snapshotTarotKingdomDebugState() {
  if (!s) return null;
  return JSON.parse(JSON.stringify(s, (_key, value) => (
    value instanceof Set ? Array.from(value) : value
  )));
}

function buildTarotKingdomDebugBattleState(options = {}) {
  clearNpcTimer();
  clearCallCinematicTimer();
  clearRoundOutCinematicTimer();
  clearOpeningDealTimers();
  clearKingdomTransitionTimer();
  kingdomCombatRandom = () => 0.5;
  s = initState();
  if (options.rules) s.rules = normalizeKingdomRules(options.rules);
  if (options.stage && typeof options.stage === 'object') {
    s.stage = normalizeKingdomExplorationStageState(options.stage);
    if (s.stage) {
      s.rules = normalizeKingdomRules({ ...s.rules, stageVersion: 1 });
    }
  }
  const debugPlayerCount = normalizeKingdomPlayerCount(
    options.playerCount,
    Array.isArray(options.handsBySeat) && options.handsBySeat.length >= 3
      ? options.handsBySeat.length
      : s.players.length
  );
  if (debugPlayerCount !== s.players.length) {
    s.players = s.players.slice(0, debugPlayerCount);
    s.rules = normalizeKingdomRules({ ...s.rules, playerCount: debugPlayerCount });
    s.pass = s.players.map(() => false);
  }
  tkNet.localSeat = 0;
  const previewCharacter = buildPreviewKingdomCharacter();
  const debugPet = options.pet && typeof options.pet === 'object' ? options.pet : null;
  if (debugPet?.monsterId) {
    const mercenaries = s.players.slice(1, 3).map((player) => ({ ...player }));
    s.players = [
      { ...s.players[0] },
      {
        id: 'pet',
        name: String(debugPet.monsterName || debugPet.monsterId),
        isNpc: true,
        isPet: true,
        pet: { ...debugPet },
        aiStyle: getTarotKingdomPetAiStyle(debugPet)
      },
      ...mercenaries
    ];
    s.rules = normalizeKingdomRules({ ...s.rules, playerCount: s.players.length });
    s.pass = s.players.map(() => false);
  }
  const characters = s.players.map((_player, index) => {
    if (index === 0) return previewCharacter;
    if (index === 1 && debugPet?.monsterId) {
      return createTarotKingdomPetCharacter({ pet: debugPet, level: 12 });
    }
    return createTarotKingdomNpcCharacter({
      seat: getKingdomMercenaryOrdinal(s.players, index),
      level: 12
    });
  });
  applyFrozenKingdomCharacters(characters);

  const sourceCards = mkMinor();
  const handCounts = Array.isArray(options.handCounts) ? options.handCounts : [];
  const handsBySeat = Array.isArray(options.handsBySeat) ? options.handsBySeat : [];
  const discardsBySeat = Array.isArray(options.discardsBySeat) ? options.discardsBySeat : [];
  const hpBySeat = Array.isArray(options.hpBySeat) ? options.hpBySeat : [];
  const combatBySeat = Array.isArray(options.combatBySeat) ? options.combatBySeat : [];
  const handLimit = getKingdomHandLimit();
  s.players.forEach((player, index) => {
    const count = Math.max(0, Math.min(handLimit, Math.floor(Number(handCounts[index] ?? handLimit) || 0)));
    player.hand = Array.isArray(handsBySeat[index])
      ? handsBySeat[index].slice(0, handLimit).map((card) => ({ ...card }))
      : sourceCards.slice(index * handLimit, (index * handLimit) + count).map((card) => ({ ...card }));
    player.discard = Array.isArray(discardsBySeat[index])
      ? discardsBySeat[index].map((card) => ({ ...card }))
      : [];
    player.isNpc = options.enableNpcSeats === true
      ? index !== tkNet.localSeat
      : player.isPet === true;
    player.uid = `debug-uid-${index}`;
    player.character = normalizeTarotKingdomCharacter({
      ...player.character,
      combat: { ...player.character.combat, ...(combatBySeat[index] || {}) }
    });
    player.maxHp = player.character.combat.maxHp;
    player.hp = Math.max(0, Math.min(
      player.maxHp,
      Math.floor(Number(hpBySeat[index] ?? player.maxHp) || 0)
    ));
    if (Array.isArray(options.chipsBySeat)) {
      player.chips = Number(options.chipsBySeat[index] ?? player.chips) || 0;
    }
  });
  const debugPresenceTime = Date.now();
  netPresenceByUid = Object.fromEntries(s.players.map((player, seat) => [player.uid, {
    uid: player.uid,
    seat,
    updatedAt: debugPresenceTime
  }]));

  s.handNo = Math.max(0, Math.min(TOTAL_HANDS - 1, Math.floor(Number(options.handNo) || 0)));
  s.roundActive = true;
  s.phase = 'turn';
  const lastSeat = Math.max(0, s.players.length - 1);
  s.turn = Math.max(0, Math.min(lastSeat, Math.floor(Number(options.turnIndex) || 0)));
  s.dealer = Math.max(0, Math.min(lastSeat, Math.floor(Number(options.dealerIndex) || 0)));
  s.pass = s.players.map((_, index) => !!options.pass?.[index]);
  const usedHandIds = new Set(s.players.flatMap((player) => player.hand.map((card) => String(card?.id || ''))));
  s.drawDeck = Array.isArray(options.drawDeck)
    ? options.drawDeck.map((card) => ({ ...card }))
    : mkDrawDeck().filter((card) => !usedHandIds.has(String(card.id))).map((card) => ({ ...card }));
  s.revision = Math.max(0, Math.floor(Number(options.revision) || 0));
  s.processedActionIds = Array.isArray(options.processedActionIds)
    ? options.processedActionIds.map(String)
    : [];
  s.battle = createKingdomBattleState(
    s.handNo,
    true,
    String(options.destinationId || ''),
    Number(s.rules?.enemyCombatVersion ?? 1),
    s.players.length
  );
  if (Object.prototype.hasOwnProperty.call(options, 'enemyHp')) {
    s.battle.enemy.hp = Math.max(0, Math.min(
      s.battle.enemy.maxHp,
      Math.floor(Number(options.enemyHp) || 0)
    ));
  }
  if (Object.prototype.hasOwnProperty.call(options, 'enemyDefense')) {
    s.battle.enemy.defense = Math.max(0, Math.floor(Number(options.enemyDefense) || 0));
  }
  if (Object.prototype.hasOwnProperty.call(options, 'enemySpeed')) {
    s.battle.enemy.speed = Math.max(0, Math.floor(Number(options.enemySpeed) || 0));
  }
  if (Object.prototype.hasOwnProperty.call(options, 'enemyAilment')) {
    s.battle.enemy.ailment = options.enemyAilment && typeof options.enemyAilment === 'object'
      ? cloneKingdomSnapshotValue(options.enemyAilment, null)
      : null;
  }

  if (options.withTrick === false) {
    s.trick = null;
    s.lastPlay = null;
  } else {
    const leaderIndex = Math.max(0, Math.min(3, Math.floor(Number(options.leaderIndex) || 0)));
    const tableCard = options.tableCard && typeof options.tableCard === 'object'
      ? { ...options.tableCard }
      : { id: 'tk_debug_table', kind: 'minor', suit: 'Wand', number: 1 };
    const openingPlay = {
      type: 'set', owner: leaderIndex, count: 1, selected: [], selectedIds: [],
      cardsHand: [tableCard], cardsTable: [tableCard], tableOwners: [leaderIndex],
      number: idNum(tableCard), setPower: cStrength(tableCard),
      suitMask: suitMaskForCards([tableCard]),
      suitTier: Math.max(...suitsForCard(tableCard, false).map((suit) => suitTierForCard(tableCard, suit)))
    };
    s.trick = openingPlay;
    s.lastPlay = openingPlay;
  }
  s.message = '戦闘統合テスト';
  render();
  return snapshotTarotKingdomDebugState();
}

function playTarotKingdomDebugCard(playerIndex, options = {}) {
  const index = Math.max(0, Math.min(3, Number(playerIndex) || 0));
  const player = s?.players?.[index];
  if (!player?.hand?.length) return snapshotTarotKingdomDebugState();
  if (options.emptyHand === true) player.hand = [player.hand[0]];
  const card = player.hand[0];
  const play = {
    type: 'set', owner: index, count: 1, selected: [0], selectedIds: [card.id],
    cardsHand: [card], cardsTable: [card], tableOwners: [index],
    number: idNum(card), setPower: cStrength(card),
    suitMask: suitMaskForCards([card]),
    suitTier: Math.max(...suitsForCard(card, false).map((suit) => suitTierForCard(card, suit)))
  };
  s.phase = 'turn';
  s.turn = index;
  applyPlay(index, play);
  if (options.resolve !== false && s?.transition) {
    s.transition.endsAt = 0;
    resolveKingdomTransition();
  }
  return snapshotTarotKingdomDebugState();
}

function auditKingdomPrivateStateRoundTrip(options = {}) {
  if (!s) buildTarotKingdomDebugBattleState();
  const emptySeat = Number.isInteger(Number(options.emptySeat)) ? Number(options.emptySeat) : -1;
  if (emptySeat >= 0 && emptySeat < s.players.length) s.players[emptySeat].hand = [];
  if (options.emptyDecks === true) {
    s.drawDeck = [];
  }
  s.drawFlipPlayer = 0;
  s.drawFlipCardId = String(s.players[0]?.hand?.[0]?.id || '');

  const publicPayload = serializeStateForNet();
  const authorityState = serializeKingdomAuthorityStateForNet();
  const privateHands = serializeKingdomPrivateHandsForNet();
  const publicState = publicPayload?.state || {};
  const publicRoundTrip = deserializeStateFromNet(publicPayload);
  const localBefore = publicRoundTrip?.players?.[0]?.hand?.slice() || [];
  const localApplied = applyKingdomPrivateHandPayload(publicRoundTrip, privateHands['0'], 0);
  const localAfter = publicRoundTrip?.players?.[0]?.hand?.slice() || [];
  const hostRoundTrip = deserializeStateFromNet(publicPayload);
  const hostHydrated = applyKingdomAuthorityState(hostRoundTrip, authorityState);
  const stalePrivate = { ...privateHands['0'], revision: Number(privateHands['0']?.revision || 0) + 1 };
  const staleRejected = !applyKingdomPrivateHandPayload(deserializeStateFromNet(publicPayload), stalePrivate, 0);
  const secretIds = [
    ...s.players.flatMap((player) => (player.hand || []).map((card) => card?.id)),
    ...s.drawDeck.map((card) => card?.id),
    s.drawFlipCardId
  ].filter(Boolean).map(String);
  const publicText = JSON.stringify(publicPayload);
  return {
    publicHasNoSecretKeys: Array.isArray(publicState.players)
      && publicState.players.every((player) => !Object.prototype.hasOwnProperty.call(player, 'hand'))
      && !Object.prototype.hasOwnProperty.call(publicState, 'drawDeck')
      && !Object.prototype.hasOwnProperty.call(publicState, 'drawFlipCardId')
      && !Object.prototype.hasOwnProperty.call(publicState, 'openOracleCard')
      && !Object.prototype.hasOwnProperty.call(publicState, 'hiddenOracleCard'),
    publicContainsSecretCardId: secretIds.some((id) => publicText.includes(id)),
    publicHandCounts: publicState.players?.map((player) => Number(player.handCount) || 0) || [],
    publicDeckCount: Number(publicState.drawDeckCount) || 0,
    localBeforeWasRedacted: localBefore.every((card) => card == null),
    localApplied,
    localAfterCount: localAfter.length,
    localAfterHasCards: localAfter.every((card) => !!card?.id),
    staleRejected,
    hostHydrated,
    hostHandCounts: hostRoundTrip?.players?.map((player) => player.hand.length) || [],
    hostDeckCount: hostRoundTrip?.drawDeck?.length || 0,
    authorityHasAllSeats: [0, 1, 2, 3].every((seat) => !!authorityState?.handsBySeat?.[`seat${seat}`]),
    privateSeatIsolation: !JSON.stringify(privateHands['1'] || {}).includes(String(s.players[0]?.hand?.[0]?.id || '__none__'))
  };
}

function buildKingdomDebugDeckWithOpening(majorNumber) {
  const deck = mkDrawDeck();
  const targetIndex = deck.findIndex((card) => card.kind === 'major' && Number(card.number) === Number(majorNumber));
  if (targetIndex < 0) return deck;
  const [target] = deck.splice(targetIndex, 1);
  const openingIndex = (deck.length + 1) - (getKingdomInitialHandSize() * PLAYERS.length) - 1;
  deck.splice(Math.max(0, openingIndex), 0, target);
  return deck;
}

function auditKingdomMajorArcanaRules() {
  const deck = mkDrawDeck();
  const ids = deck.map((card) => String(card.id || ''));
  const dealDeck = shuf(deck);
  const dealt = [];
  for (let round = 0; round < getKingdomInitialHandSize(); round += 1) {
    for (let seat = 0; seat < PLAYERS.length; seat += 1) dealt.push(dealDeck.pop());
  }
  const opening = dealDeck.pop();
  const dealtIds = [...dealt, opening].filter(Boolean).map((card) => String(card.id || ''));

  const major = (number) => ({ ...mkMajor().find((card) => Number(card.number) === Number(number)) });
  const minor = (id, suit, number) => ({ id, kind: 'minor', suit, number });
  const validWorldCards = [major(21), major(2), major(3), major(4), major(6)];
  const worldWithout21 = [major(2), major(3), major(4), major(6), major(7)];
  const worldWithMinor = [major(21), major(2), major(3), major(4), minor('world-minor', 'Wand', 6)];
  const foolStraight = evalRole([
    major(0),
    minor('fool-10', 'Wand', 10),
    minor('fool-11', 'Cup', 11),
    minor('fool-12', 'Sword', 12),
    minor('fool-13', 'Pentacle', 13)
  ]);
  const magicianStraightFlush = evalRole([
    major(1),
    minor('magician-2', 'Wand', 2),
    minor('magician-3', 'Wand', 3),
    minor('magician-4', 'Wand', 4),
    minor('magician-5', 'Wand', 5)
  ]);
  const majorSuits = Object.fromEntries(
    Array.from({ length: 22 }, (_, number) => [number, suitsForCard(major(number), false)])
  );
  const majorSuitMasks = Object.fromEntries(
    Array.from({ length: 22 }, (_, number) => [number, suitMaskForCard(major(number))])
  );

  const openingEffects = {};
  [5, 8, 11, 14, 20].forEach((number) => {
    buildTarotKingdomDebugBattleState({ withTrick: false, dealerIndex: 0 });
    setupHand({ drawDeck: buildKingdomDebugDeckWithOpening(number) });
    openingEffects[number] = {
      openingNumber: Number(s.lastPlay?.cardsTable?.[0]?.number),
      turn: s.turn,
      callOnly: !!s.callOnly,
      reverse: !!s.reverse,
      lockSuit: s.lock?.suit || null,
      judgmentPending: !!s.judgmentRecoveryPending,
      petrified: !!s.battle?.enemy?.petrifiedUntilClear,
      areaSealed: !!s.battle?.enemy?.areaAttackSealedUntilClear
    };
  });

  const effectlessNumbers = [2, 3, 4, 6, 7, 9, 10, 12, 13, 15];
  const effectless = effectlessNumbers.every((number) => {
    buildTarotKingdomDebugBattleState({ withTrick: false });
    const fx = applySetEffects({ owner: 0, cardsHand: [major(number)], prevLeadSuit: 'Wand' });
    return !fx.forceClear
      && !fx.keepTurn
      && fx.skip === 0
      && !s.callOnly
      && !s.reverse
      && !s.lock
      && !s.judgmentRecoveryPending
      && !s.battle?.enemy?.petrifiedUntilClear
      && !s.battle?.enemy?.areaAttackSealedUntilClear;
  });

  buildTarotKingdomDebugBattleState({ withTrick: false });
  applySetEffects({ owner: 0, cardsHand: [major(14)], prevLeadSuit: 'Wand' });
  const major14LockSuit = s.lock?.suit || null;
  buildTarotKingdomDebugBattleState({ withTrick: false });
  applySetEffects({
    owner: 0,
    cardsHand: [minor('minor-14-lock', 'Wand', 14)],
    prevLeadSuit: 'Wand'
  });
  const minor14LockSuit = s.lock?.suit || null;
  buildTarotKingdomDebugBattleState({
    withTrick: false,
    handsBySeat: [[major(14), minor('temperance-reserve', 'Sword', 3)]]
  });
  s.lock = { suit: 'Cup', min: null };
  const major14Index = s.players[0].hand.findIndex(
    (card) => card?.kind === 'major' && Number(card?.number) === 14
  );
  const major14UnlockPlay = buildSetPlay(0, [major14Index]);
  if (major14UnlockPlay.ok) applySetEffects(major14UnlockPlay.play);
  const major14Unlock = {
    playableThroughLock: !!major14UnlockPlay.ok,
    lockSuit: s.lock?.suit || null
  };
  buildTarotKingdomDebugBattleState({ withTrick: false });
  s.reverse = true;
  applySetEffects({ owner: 0, cardsHand: [major(20)], prevLeadSuit: 'Wand' });
  const judgmentToggle = { reverse: s.reverse, pending: s.judgmentRecoveryPending };
  buildTarotKingdomDebugBattleState({ withTrick: false });
  const twoCardMajorCutFx = applySetEffects({
    owner: 0,
    cardsHand: [major(8), minor('minor-8-cut', 'Wand', 8)],
    prevLeadSuit: 'Wand'
  });
  const twoCardMajorCut = {
    forceClear: twoCardMajorCutFx.forceClear,
    petrified: !!s.battle?.enemy?.petrifiedUntilClear
  };

  buildTarotKingdomDebugBattleState({
    withTrick: false,
    handsBySeat: [[major(2), major(3), major(4), major(21)]]
  });
  s.players[0].stars = 1;
  const callBase = major(6);
  s.trick = {
    type: 'set', owner: 1, count: 1, cardsHand: [callBase], cardsTable: [callBase], tableOwners: [1],
    number: 6, setPower: 6, suitMask: suitMaskForCards([callBase]), suitTier: 0
  };
  s.lastPlay = s.trick;
  const worldCall = buildCallPlay(0, [0, 1, 2, 3]);

  buildTarotKingdomDebugBattleState({ withTrick: false, handsBySeat: [[major(16), major(21)]] });
  const towerSingle = buildSetPlay(0, [0]);
  const worldSingle = buildSetPlay(0, [1]);
  const strongTable = minor('strong-table', 'Cup', 14);
  s.trick = {
    type: 'set', owner: 1, count: 1, cardsHand: [strongTable], cardsTable: [strongTable], tableOwners: [1],
    number: 14, setPower: 14, suitMask: suitMaskForCards([strongTable]), suitTier: SUIT_TIER.Cup
  };
  const worldSingleValid = worldSingle.ok ? validatePlay(worldSingle.play, 'normal') : { ok: false };
  buildTarotKingdomDebugBattleState({
    withTrick: false,
    rules: { majorArcanaGateVersion: 0 },
    handsBySeat: [[major(16), minor('legacy-tower-reserve', 'Cup', 3)]]
  });
  const legacyTowerIndex = s.players[0].hand.findIndex(isMajorSuitGateCard);
  const legacyTowerSingle = buildSetPlay(0, [legacyTowerIndex]);

  const auditMajorSuitGate = (fieldCards, handCards = [major(16), minor('tower-reserve', 'Cup', 3)]) => {
    buildTarotKingdomDebugBattleState({ withTrick: false, handsBySeat: [handCards] });
    if (Array.isArray(fieldCards) && fieldCards.length) {
      const fieldNumber = idNum(fieldCards[0]);
      s.trick = {
        type: 'set',
        owner: 1,
        count: fieldCards.length,
        cardsHand: fieldCards.slice(),
        cardsTable: fieldCards.slice(),
        tableOwners: fieldCards.map(() => 1),
        number: fieldNumber,
        setPower: setRankFromNumber(fieldNumber),
        suitMask: suitMaskForCards(fieldCards),
        suitTier: Math.max(...fieldCards.flatMap((card) => (
          suitsForCard(card, false).map((suit) => suitTierForCard(card, suit))
        )))
      };
      s.lastPlay = s.trick;
    }
    const towerIndex = s.players[0].hand.findIndex(
      (card) => card?.kind === 'major' && Number(card?.number) === 16
    );
    const built = buildSetPlay(0, [towerIndex]);
    const valid = built.ok ? validatePlay(built.play, 'normal') : built;
    return {
      ok: !!valid.ok,
      reason: String(valid.reason || ''),
      setPower: built.play?.setPower ?? null
    };
  };
  const towerSameSuit = auditMajorSuitGate([minor('tower-field-sword', 'Sword', 10)]);
  const towerDifferentSuit = auditMajorSuitGate([minor('tower-field-cup', 'Cup', 10)]);
  const towerOnAce = auditMajorSuitGate([minor('tower-field-ace', 'Sword', 1)]);
  const towerOnPair = auditMajorSuitGate([
    minor('tower-field-pair-sword', 'Sword', 10),
    minor('tower-field-pair-cup', 'Cup', 10)
  ]);
  const towerOnEmpty = auditMajorSuitGate(null);
  const towerLastFinish = auditMajorSuitGate(
    [minor('tower-field-last', 'Sword', 10)],
    [major(16)]
  );
  buildTarotKingdomDebugBattleState({
    withTrick: false,
    handsBySeat: [[major(15), major(16), major(17), major(18), major(19)]]
  });
  const gateRoleBuild = buildRolePlay(0, [0, 1, 2, 3, 4]);
  const gateRoleValid = gateRoleBuild.ok ? validatePlay(gateRoleBuild.play, 'normal') : gateRoleBuild;
  const majorSuitGate = {
    sameSuit: towerSameSuit,
    differentSuit: towerDifferentSuit,
    ace: towerOnAce,
    pair: towerOnPair,
    empty: towerOnEmpty,
    lastFinish: towerLastFinish,
    role: {
      ok: !!gateRoleValid.ok,
      key: gateRoleBuild.play?.role?.key || null
    }
  };

  buildTarotKingdomDebugBattleState({ withTrick: false });
  const roleEffectFx = applySetEffects({
    owner: 0,
    cardsHand: [major(5), major(8), major(11), major(14), major(20)],
    prevLeadSuit: 'Wand'
  });

  return {
    deck: {
      count: deck.length,
      minorCount: deck.filter((card) => card.kind === 'minor').length,
      majorCount: deck.filter((card) => card.kind === 'major').length,
      uniqueCount: new Set(ids).size,
      dealtCount: dealt.length,
      openingFromSameDeck: !!opening,
      openingAndHandsUnique: new Set(dealtIds).size === dealtIds.length,
      remainingCount: dealDeck.length
    },
    openingEffects,
    majorSuits,
    majorSuitMasks,
    roles: {
      validWorld: evalRole(validWorldCards),
      worldWithout21: evalRole(worldWithout21),
      worldWithMinor: evalRole(worldWithMinor),
      fourMajors: evalRole(validWorldCards.slice(0, 4)),
      foolStraight,
      magicianStraightFlush,
      worldCallOk: !!worldCall.ok,
      worldCallRole: worldCall.play?.role || null,
      towerSinglePower: towerSingle.play?.setPower ?? null,
      legacyTowerSinglePower: legacyTowerSingle.play?.setPower ?? null,
      worldSingleValid: !!worldSingleValid.ok
    },
    effectless,
    major14LockSuit,
    minor14LockSuit,
    major14Unlock,
    majorSuitGate,
    judgmentToggle,
    twoCardMajorCut,
    roleEffectsSuppressed: !roleEffectFx.forceClear
      && roleEffectFx.skip === 0
      && !s.callOnly
      && !s.reverse
      && !s.lock
      && !s.judgmentRecoveryPending
  };
}

function auditKingdomJudgmentRules() {
  const major20 = { ...mkMajor().find((card) => Number(card.number) === 20) };
  const effectlessMajor = { ...mkMajor().find((card) => Number(card.number) === 2) };
  const candidate = { id: 'judgment-candidate', kind: 'minor', suit: 'Cup', number: 9 };
  const replacement = { id: 'judgment-overwrite', kind: 'minor', suit: 'Sword', number: 12 };

  buildTarotKingdomDebugBattleState({ withTrick: false, handCounts: [8, 8, 4, 8] });
  s.players[0].discard = [candidate];
  applySetEffects({ owner: 0, cardsHand: [major20], prevLeadSuit: 'Wand' });
  s.trick = {
    type: 'set', owner: 1, count: 1, cardsHand: [replacement], cardsTable: [replacement], tableOwners: [1],
    number: 12, setPower: 12, suitMask: suitMaskForCards([replacement]), suitTier: SUIT_TIER.Sword
  };
  s.lastPlay = s.trick;
  clearTrick(2);
  const afterOvertakenClear = {
    pendingJudgment: s.pendingJudgment,
    reverse: s.reverse,
    handCount: s.players[2].hand.length
  };
  applyJudgmentPick(0, 0);
  const afterPick = {
    pendingDraw: s.pendingDraw,
    handCount: s.players[2].hand.length,
    candidateRemaining: s.players[0].discard.some((card) => card.id === candidate.id)
  };
  const starsBeforeDraw = s.players[2].stars;
  applyDrawChoice();
  const afterDraw = {
    handCount: s.players[2].hand.length,
    drawnKind: s.players[2].hand.at(-1)?.kind || null,
    stars: s.players[2].stars,
    starsBefore: starsBeforeDraw
  };

  buildTarotKingdomDebugBattleState({ withTrick: false, handCounts: [8, 8, 8, 8] });
  s.players[0].discard = [{ ...candidate }];
  applySetEffects({ owner: 0, cardsHand: [major20], prevLeadSuit: 'Wand' });
  s.trick = s.lastPlay = {
    type: 'set', owner: 1, count: 1, cardsHand: [replacement], cardsTable: [replacement], tableOwners: [1],
    number: 12, setPower: 12, suitMask: suitMaskForCards([replacement]), suitTier: SUIT_TIER.Sword
  };
  clearTrick(2);
  const fullHand = {
    pendingJudgment: s.pendingJudgment,
    pendingDraw: s.pendingDraw,
    candidateRemaining: s.players[0].discard.some((card) => card.id === candidate.id)
  };

  buildTarotKingdomDebugBattleState({ withTrick: false, handCounts: [8, 8, 4, 8] });
  applySetEffects({ owner: 0, cardsHand: [major20], prevLeadSuit: 'Wand' });
  s.trick = s.lastPlay = {
    type: 'set', owner: 1, count: 1, cardsHand: [effectlessMajor], cardsTable: [effectlessMajor], tableOwners: [1],
    number: idNum(effectlessMajor), setPower: cStrength(effectlessMajor),
    suitMask: suitMaskForCards([effectlessMajor]),
    suitTier: Math.max(...suitsForCard(effectlessMajor, false).map((suit) => suitTierForCard(effectlessMajor, suit)))
  };
  clearTrick(2);
  const noCandidate = { pendingJudgment: s.pendingJudgment, pendingDraw: s.pendingDraw };

  buildTarotKingdomDebugBattleState({ withTrick: false, handsBySeat: [[major20]] });
  const finishingPlay = buildSetPlay(0, [0]);
  const finishingValidation = finishingPlay.ok
    ? validatePlay(finishingPlay.play, 'normal')
    : finishingPlay;
  const handZero = {
    outcome: s.battle?.outcome || null,
    reason: s.battle?.resultReason || null,
    judgmentPending: !!s.judgmentRecoveryPending,
    pendingJudgment: s.pendingJudgment,
    playAllowed: !!finishingValidation.ok,
    validationReason: String(finishingValidation.reason || '')
  };

  buildTarotKingdomDebugBattleState({
    withTrick: false,
    handCounts: [8, 8, 4, 4],
    hpBySeat: [100, 100, 0, 100]
  });
  s.players[0].discard = [{ ...candidate }];
  applySetEffects({ owner: 0, cardsHand: [major20], prevLeadSuit: 'Wand' });
  s.trick = s.lastPlay = {
    type: 'set', owner: 1, count: 1, cardsHand: [replacement], cardsTable: [replacement], tableOwners: [1],
    number: 12, setPower: 12, suitMask: suitMaskForCards([replacement]), suitTier: SUIT_TIER.Sword
  };
  clearTrick(2);
  const koClearer = { pendingJudgment: s.pendingJudgment, resolvedTurn: s.turn };

  return { afterOvertakenClear, afterPick, afterDraw, fullHand, noCandidate, handZero, koClearer };
}

function auditKingdomMajorArcanaSpecialRules() {
  const major = (number, suffix = '') => ({
    ...mkMajor().find((card) => Number(card.number) === Number(number)),
    id: `special-major-${number}${suffix}`
  });
  const minor = (id, suit, number) => ({ id, kind: 'minor', suit, number });
  const validateSingle = ({
    hand,
    field = null,
    reverse = false,
    lock = null,
    fieldCards = null,
    rules = null
  }) => {
    buildTarotKingdomDebugBattleState({
      withTrick: !!field,
      tableCard: field || undefined,
      handsBySeat: [hand],
      rules: rules || undefined
    });
    s.reverse = !!reverse;
    s.lock = lock;
    if (Array.isArray(fieldCards) && fieldCards.length) {
      const number = idNum(fieldCards[0]);
      s.trick = s.lastPlay = {
        type: 'set',
        owner: 1,
        count: fieldCards.length,
        cardsHand: fieldCards.slice(),
        cardsTable: fieldCards.slice(),
        tableOwners: fieldCards.map(() => 1),
        number,
        setPower: setRankFromNumber(number),
        suitMask: suitMaskForCards(fieldCards),
        suitTier: Math.max(...fieldCards.flatMap((card) => (
          suitsForCard(card, false).map((suit) => suitTierForCard(card, suit))
        )))
      };
    }
    return rebuildKingdomPlayFromAction(0, { selectedCardIds: [hand[0].id] });
  };

  const court = minor('special-court-p', 'Cup', 11);
  const numberTen = minor('special-number-10', 'Cup', 10);
  const majorJustice = major(11, '-field');
  const devilHand = () => [major(15), minor('special-devil-reserve', 'Wand', 2)];
  const devil = {
    court: validateSingle({ hand: devilHand(), field: court }),
    reverseCourt: validateSingle({ hand: devilHand(), field: court, reverse: true }),
    numberTen: validateSingle({ hand: devilHand(), field: numberTen }),
    majorCourtNumber: validateSingle({ hand: devilHand(), field: majorJustice }),
    empty: validateSingle({ hand: devilHand() }),
    pair: validateSingle({
      hand: devilHand(),
      field: court,
      fieldCards: [court, minor('special-court-n', 'Sword', 11)]
    }),
    locked: validateSingle({ hand: devilHand(), field: court, lock: { suit: 'Cup', min: null } })
  };

  const judgmentHand = () => [major(20), minor('special-judgment-reserve', 'Wand', 2)];
  const judgment = {
    onMinorAce: validateSingle({
      hand: judgmentHand(),
      field: minor('special-minor-ace', 'Sword', 1)
    }),
    onMagician: validateSingle({ hand: judgmentHand(), field: major(1, '-field') }),
    finish: validateSingle({ hand: [major(20)], field: minor('special-judgment-k', 'Cup', 14) })
  };

  const finish = {
    ace: validateSingle({
      hand: [minor('special-finish-ace', 'Wand', 1)],
      field: minor('special-finish-k', 'Cup', 14)
    }),
    world: validateSingle({
      hand: [major(21)],
      field: minor('special-finish-world-k', 'Cup', 14)
    }),
    tower: validateSingle({
      hand: [major(16)],
      field: minor('special-finish-tower', 'Sword', 10)
    }),
    leaveAce: validateSingle({
      hand: [
        minor('special-leave-2', 'Wand', 2),
        minor('special-leave-ace', 'Cup', 1)
      ]
    })
  };
  const schema7Rules = { majorArcanaGateVersion: 1, majorArcanaSpecialVersion: 0 };
  const schema7Compatibility = {
    devilOnNumberTen: validateSingle({
      hand: devilHand(),
      field: numberTen,
      rules: schema7Rules
    }),
    judgmentFinish: validateSingle({
      hand: [major(20, '-schema7')],
      field: minor('special-schema7-judgment-field', 'Cup', 14),
      rules: schema7Rules
    }),
    worldFinish: validateSingle({
      hand: [major(21, '-schema7')],
      field: minor('special-schema7-world-field', 'Cup', 14),
      rules: schema7Rules
    }),
    towerFinish: validateSingle({
      hand: [major(16, '-schema7')],
      field: minor('special-schema7-tower-field', 'Sword', 10),
      rules: schema7Rules
    })
  };
  buildTarotKingdomDebugBattleState({
    withTrick: false,
    handsBySeat: [[major(21), major(20), major(2), major(3), major(4)]]
  });
  const worldRole = rebuildKingdomPlayFromAction(0, {
    selectedCardIds: s.players[0].hand.map((card) => card.id)
  });
  finish.worldRole = { ok: !!worldRole.ok, roleKey: worldRole.play?.role?.key || null };

  const worldCard = major(21);
  const worldReserve = minor('special-world-reserve', 'Wand', 3);
  const forcedCard = minor('special-world-forced', 'Cup', 9);
  buildTarotKingdomDebugBattleState({
    tableCard: minor('special-world-field', 'Sword', 14),
    handsBySeat: [[worldCard, worldReserve]],
    drawDeck: [forcedCard]
  });
  const worldBefore = {
    hand: s.players[0].hand.length,
    deck: s.drawDeck.length,
    stars: s.players[0].stars
  };
  const worldPlay = rebuildKingdomPlayFromAction(0, { selectedCardIds: [worldCard.id] });
  if (worldPlay.ok) {
    applyPlay(0, worldPlay.play);
    if (s.transition) s.transition.endsAt = 0;
    resolveKingdomTransition();
  }
  const worldSingle = {
    ok: !!worldPlay.ok,
    handBefore: worldBefore.hand,
    handAfter: s.players[0].hand.length,
    deckBefore: worldBefore.deck,
    deckAfter: s.drawDeck.length,
    starsBefore: worldBefore.stars,
    starsAfter: s.players[0].stars,
    trickCleared: !s.trick,
    turn: s.turn,
    phase: s.phase
  };

  buildTarotKingdomDebugBattleState({
    tableCard: minor('special-world-empty-field', 'Sword', 14),
    handsBySeat: [[major(21), minor('special-world-empty-reserve', 'Wand', 3)]],
    drawDeck: []
  });
  const emptyDeckWorld = rebuildKingdomPlayFromAction(0, {
    selectedCardIds: [s.players[0].hand[0].id]
  });
  if (emptyDeckWorld.ok) {
    applyPlay(0, emptyDeckWorld.play);
    if (s.transition) s.transition.endsAt = 0;
    resolveKingdomTransition();
  }
  const worldEmptyDeck = {
    ok: !!emptyDeckWorld.ok,
    handCount: s.players[0].hand.length,
    deckCount: s.drawDeck.length,
    trickCleared: !s.trick,
    phase: s.phase
  };

  buildTarotKingdomDebugBattleState({
    tableCard: minor('special-world-judgment-field', 'Sword', 14),
    handsBySeat: [[major(21), minor('special-world-judgment-reserve', 'Wand', 3)]],
    discardsBySeat: [[minor('special-world-judgment-candidate', 'Cup', 6)]],
    drawDeck: [minor('special-world-judgment-forced', 'Pentacle', 7)]
  });
  s.judgmentRecoveryPending = true;
  const judgmentWorldPlay = rebuildKingdomPlayFromAction(0, {
    selectedCardIds: [s.players[0].hand[0].id]
  });
  if (judgmentWorldPlay.ok) {
    applyPlay(0, judgmentWorldPlay.play);
    if (s.transition) s.transition.endsAt = 0;
    resolveKingdomTransition();
  }
  const worldJudgmentOrder = {
    handCountAfterForcedDraw: s.players[0].hand.length,
    deckCount: s.drawDeck.length,
    pendingJudgment: s.pendingJudgment,
    followup: s.pendingJudgmentFollowup
  };

  buildTarotKingdomDebugBattleState({
    withTrick: false,
    handsBySeat: [[major(16)]],
    drawDeck: [minor('special-leader-draw', 'Cup', 2)]
  });
  resolveEmptyFieldLeader(0);
  const forcedLeaderDraw = {
    turn: s.turn,
    handCount: s.players[0].hand.length,
    deckCount: s.drawDeck.length,
    legal: hasLegalKingdomOpening(0),
    blocked: s.blockedLeaderSeats.slice(),
    battleEventCount: s.battle.events.length
  };

  const fullBlockedHand = [16, 17, 18, 19, 16, 17, 18, 19].map((number, index) => (
    major(number, `-blocked-${index}`)
  ));
  buildTarotKingdomDebugBattleState({
    withTrick: false,
    handsBySeat: [
      fullBlockedHand,
      [minor('special-transfer-2', 'Cup', 2)],
      [minor('special-transfer-3', 'Sword', 3)],
      [minor('special-transfer-4', 'Wand', 4)]
    ],
    drawDeck: [minor('special-transfer-deck', 'Pentacle', 9)]
  });
  resolveEmptyFieldLeader(0);
  const parentTransfer = {
    turn: s.turn,
    firstHandCount: s.players[0].hand.length,
    deckCount: s.drawDeck.length,
    blocked: s.blockedLeaderSeats.slice(),
    battleEventCount: s.battle.events.length
  };

  buildTarotKingdomDebugBattleState({
    withTrick: false,
    handNo: 2,
    dealerIndex: 2,
    chipsBySeat: [210, 190, 170, 150],
    handsBySeat: [[major(16)], [major(17)], [major(18)], [major(19)]],
    drawDeck: []
  });
  s.players.forEach((player, index) => { player.stars = index + 2; });
  const retryBefore = {
    handNo: s.handNo,
    dealer: s.dealer,
    chips: s.players.map((player) => player.chips),
    stars: s.players.map((player) => player.stars),
    enemyMaxHp: s.battle.enemy.maxHp
  };
  resolveEmptyFieldLeader(0);
  const retryTransition = {
    phase: s.phase,
    kind: s.transition?.kind || null,
    blocked: s.blockedLeaderSeats.slice()
  };
  if (s.transition) s.transition.endsAt = 0;
  resolveKingdomTransition();
  const retryAfter = {
    handNo: s.handNo,
    dealer: s.dealer,
    chips: s.players.map((player) => player.chips),
    stars: s.players.map((player) => player.stars),
    enemyMaxHp: s.battle.enemy.maxHp,
    phase: s.phase,
    handCounts: s.players.map((player) => player.hand.length)
  };

  buildTarotKingdomDebugBattleState({
    turnIndex: 1,
    leaderIndex: 0,
    tableCard: minor('special-enemy-retry-field', 'Cup', 4),
    pass: [false, false, true, true],
    handsBySeat: [[major(16)], [major(17)], [major(18)], [major(19)]],
    drawDeck: []
  });
  passAction(1);
  const retryAfterEnemy = {
    initialTransition: s.transition?.kind || null,
    resumePhase: s.transition?.resumePhase || null,
    nextTransition: null,
    finalPhase: null
  };
  if (s.transition) s.transition.endsAt = 0;
  resolveKingdomTransition();
  retryAfterEnemy.nextTransition = s.transition?.kind || null;
  if (s.transition) s.transition.endsAt = 0;
  resolveKingdomTransition();
  retryAfterEnemy.finalPhase = s.phase;

  const descriptions = Object.fromEntries([15, 16, 17, 18, 19, 20, 21].map((number) => [
    number,
    getKingdomCardEffectDescription(major(number, '-description'))
  ]));

  return {
    devil,
    judgment,
    finish,
    schema7Compatibility,
    worldSingle,
    worldEmptyDeck,
    worldJudgmentOrder,
    forcedLeaderDraw,
    parentTransfer,
    retryBefore,
    retryTransition,
    retryAfter,
    retryAfterEnemy,
    descriptions
  };
}

function exposeTarotKingdomBattleDebugTools(target) {
  if (window.__TAROT_KINGDOM_PREVIEW__ !== true) return;
  Object.assign(target, {
    battleScenario: (options = {}) => buildTarotKingdomDebugBattleState(options),
    battleDealScenario: (playerCount = 4) => {
      buildTarotKingdomDebugBattleState({
        playerCount: normalizeKingdomPlayerCount(playerCount),
        handCounts: Array.from({ length: normalizeKingdomPlayerCount(playerCount) }, () => 0),
        withTrick: false
      });
      s.players.forEach((player) => {
        player.hand = [];
        player.discard = [];
      });
      setupHand({ drawDeck: mkDrawDeck(), preserveStars: true });
      return snapshotTarotKingdomDebugState();
    },
    battleState: () => snapshotTarotKingdomDebugState(),
    battleDemoEnemies: () => getKingdomDemoMonsterOptions(),
    battleSetDemoEnemy: (monsterId) => ({
      ok: setKingdomDemoEnemy(monsterId),
      state: snapshotTarotKingdomDebugState()
    }),
    battleDemoPets: () => getKingdomDemoPetOptions(),
    battleSetDemoPet: (monsterId = '') => ({
      ok: setKingdomDemoPet(monsterId),
      state: snapshotTarotKingdomDebugState()
    }),
    battleSetCombatRandom: (randomValue = 0.5) => {
      const value = Math.max(0, Math.min(0.999999, Number(randomValue) || 0));
      kingdomCombatRandom = () => value;
      return value;
    },
    battleSetEffects: (effects = {}) => {
      if (!s?.battle) return null;
      s.battle.effects = cloneKingdomSnapshotValue(effects, {});
      ensureKingdomBattleEffects();
      render();
      return snapshotTarotKingdomDebugState();
    },
    battlePass: (playerIndex) => {
      const index = Math.max(0, Math.min(3, Number(playerIndex) || 0));
      s.phase = 'turn';
      s.turn = index;
      passAction(index);
      return snapshotTarotKingdomDebugState();
    },
    battleClearTrick: (leaderIndex = s?.lastPlay?.owner ?? 0) => {
      const index = Math.max(0, Math.min(3, Number(leaderIndex) || 0));
      clearTrick(index);
      return snapshotTarotKingdomDebugState();
    },
    battlePlayOne: (playerIndex, options = {}) => playTarotKingdomDebugCard(playerIndex, options),
    battlePlayCards: (playerIndex, selectedCardIds = [], options = {}) => {
      const index = Math.max(0, Math.min(3, Number(playerIndex) || 0));
      const rebuilt = rebuildKingdomPlayFromAction(index, { selectedCardIds });
      if (!rebuilt.ok) return { ok: false, reason: rebuilt.reason || 'invalid-play', state: snapshotTarotKingdomDebugState() };
      s.phase = 'turn';
      s.turn = index;
      applyPlay(index, rebuilt.play);
      if (options.resolve === true && s?.transition) {
        s.transition.endsAt = 0;
        resolveKingdomTransition();
      }
      return { ok: true, state: snapshotTarotKingdomDebugState() };
    },
    battlePublicState: () => cloneKingdomSnapshotValue(serializeStateForNet(), null),
    battleRender: () => {
      render();
      return snapshotTarotKingdomDebugState();
    },
    battleResolveTransition: () => {
      if (s?.transition) s.transition.endsAt = 0;
      resolveKingdomTransition();
      return snapshotTarotKingdomDebugState();
    },
    battleFinishRound: (winnerIndex = 0) => {
      const index = Math.max(0, Math.min(3, Number(winnerIndex) || 0));
      markKingdomBattleVictory(index);
      finishRound(index);
      return snapshotTarotKingdomDebugState();
    },
    battleNextRound: () => {
      confirmRoundSettlement();
      return snapshotTarotKingdomDebugState();
    },
    battleDeserialize: (payload) => {
      s = deserializeStateFromNet(payload);
      return snapshotTarotKingdomDebugState();
    },
    battlePrivateStateAudit: (options = {}) => auditKingdomPrivateStateRoundTrip(options),
    battleMajorArcanaAudit: () => auditKingdomMajorArcanaRules(),
    battleMajorArcanaSpecialAudit: () => auditKingdomMajorArcanaSpecialRules(),
    battleJudgmentAudit: () => auditKingdomJudgmentRules(),
    battleSummonAudit: () => auditTarotKingdomSummonRegistry(),
    battleSummonResolve: (role = {}) => cloneKingdomSnapshotValue(
      resolveTarotKingdomSummon(role),
      null
    ),
    battleSummonEffectSteps: (summonState = {}, context = {}) => cloneKingdomSnapshotValue(
      buildTarotKingdomSummonEffectSteps(summonState, context),
      []
    ),
    battleSummonVisuals: () => cloneKingdomSnapshotValue(KINGDOM_SUMMON_EFFECT_VISUALS, {}),
    battleShowActionCutin: (playerIndex = 0, label = 'ターン', options = {}) => {
      const index = playerIndex == null
        ? null
        : Math.max(0, Math.min(3, Number(playerIndex) || 0));
      const presentation = resolveKingdomActionCutinPresentation(index, label, options);
      showKingdomCutin(index, label, options);
      return cloneKingdomSnapshotValue(presentation, null);
    },
    battleRebuildAction: (seat, payload = {}) => rebuildKingdomPlayFromAction(Number(seat), payload),
    battleLegalOpening: (seat = 0) => hasLegalKingdomOpening(
      Math.max(0, Math.min(3, Number(seat) || 0))
    ),
    battleResolveLeader: (seat = 0) => {
      const index = Math.max(0, Math.min(3, Number(seat) || 0));
      resolveEmptyFieldLeader(index);
      return snapshotTarotKingdomDebugState();
    },
    battleCardEffectDescription: (card = null) => getKingdomCardEffectDescription(card),
    battleRememberAction: (actionId) => {
      rememberKingdomActionId(actionId);
      return snapshotTarotKingdomDebugState();
    },
    battleValidateEnvelope: (payload = {}) => validateKingdomActionEnvelope(payload, ''),
    battleDamageForPlay: (playerIndex, play) => getKingdomBattleDamageForPlay(Number(playerIndex), play),
    battleCombatTimeline: (variant = 'attack', weaponType = 'sword') => buildKingdomCombatTimeline(
      variant === 'skill' ? 'skill' : 'attack',
      weaponType
    ),
    battleNpcObservation: (playerIndex = 1) => cloneKingdomSnapshotValue(
      createNpcObservation(Math.max(0, Math.min(3, Number(playerIndex) || 0))),
      null
    ),
    battleNpcDecision: (playerIndex = 1, randomValue = 0.5) => {
      const index = Math.max(0, Math.min(3, Number(playerIndex) || 0));
      const decision = npcDecide(index, {
        randomSource: () => Math.max(0, Math.min(0.999999, Number(randomValue) || 0))
      });
      return cloneKingdomSnapshotValue(decision, null);
    },
    battleNpcDrawPlan: (playerIndex = 1) => {
      const index = Math.max(0, Math.min(3, Number(playerIndex) || 0));
      const wasNpc = !!s?.players?.[index]?.isNpc;
      if (s?.players?.[index]) s.players[index].isNpc = true;
      const plan = npcChooseDrawPlan(index);
      if (s?.players?.[index]) s.players[index].isNpc = wasNpc;
      return plan;
    },
    battleNpcJudgmentChoice: (playerIndex = 1, randomValue = 0.5) => cloneKingdomSnapshotValue(
      chooseNpcJudgmentOption(
        Math.max(0, Math.min(3, Number(playerIndex) || 0)),
        () => Math.max(0, Math.min(0.999999, Number(randomValue) || 0))
      ),
      null
    ),
    battleStartTwice: async () => {
      activateKingdomOfflineMode({ renderNow: false, message: '二重開始テスト' });
      const results = await Promise.all([startOrNext(), startOrNext()]);
      return { results, state: snapshotTarotKingdomDebugState() };
    },
    battleRunFourRounds: async () => {
      activateKingdomOfflineMode({ renderNow: false, message: '4局通しテスト' });
      await startOrNext();
      const snapshotCreatedAt = s.characterSnapshotCreatedAt;
      const rounds = [];
      for (let roundIndex = 0; roundIndex < TOTAL_HANDS; roundIndex += 1) {
        clearOpeningDealTimers();
        s.players.forEach((player) => { player.hp = 1; });
        markKingdomBattleVictory(0);
        finishRound(0);
        rounds.push({
          completedHandNo: s.handNo,
          matchDone: isKingdomMatchDoneState(s),
          characterSnapshotCreatedAt: s.characterSnapshotCreatedAt
        });
        if (roundIndex < TOTAL_HANDS - 1) {
          confirmRoundSettlement();
          clearOpeningDealTimers();
          rounds[rounds.length - 1].nextRound = {
            enemyMaxHp: s.battle?.enemy?.maxHp,
            enemyPassDamage: s.battle?.enemy?.passDamage,
            enemyAreaDamage: s.battle?.enemy?.areaDamage,
            hpBySeat: s.players.map((player) => player.hp),
            maxHpBySeat: s.players.map((player) => player.maxHp)
          };
        }
      }
      return { snapshotCreatedAt, rounds, state: snapshotTarotKingdomDebugState() };
    },
    battleRejectRosterChangeDuringProfileLoad: async () => {
      clearOpeningDealTimers();
      kingdomStateGeneration += 1;
      kingdomCharacterLoadPromise = null;
      s = initState();
      tkNet.localSeat = 0;
      s.players.forEach((player, index) => {
        player.isNpc = index !== 0;
        player.uid = index === 0 ? 'profile-a' : null;
        player.playFabId = index === 0 ? 'profile-a' : '';
      });
      let releaseProfile;
      const profileGate = new Promise((resolve) => { releaseProfile = resolve; });
      const pending = prepareKingdomCharacterSnapshots({
        force: true,
        online: false,
        requesterPlayFabId: 'profile-a',
        profileLoader: async (_requesterId, targetIds) => {
          await profileGate;
          return {
            characters: targetIds.map((playFabId) => ({
              ...buildPreviewKingdomCharacter(),
              playFabId,
              displayName: playFabId
            }))
          };
        }
      });
      await Promise.resolve();
      s.players[1].isNpc = false;
      s.players[1].uid = 'profile-b';
      s.players[1].playFabId = 'profile-b';
      releaseProfile();
      const applied = await pending;
      return {
        applied,
        characterSnapshotReady: s.characterSnapshotReady,
        message: s.message,
        secondSeatHasCharacter: !!s.players[1].character
      };
    }
  });
}

function exposeTarotKingdomDebugTools() {
  if (typeof window === 'undefined') return;
  const debugTools = {
    matchDone: (options = {}) => injectTarotKingdomDebugMatchDone(options),
    reset: (message = 'オンラインかオフラインを選択してください。') => {
      returnToKingdomModeChoice(message);
      return s;
    }
  };
  exposeTarotKingdomBattleDebugTools(debugTools);
  window.TarotKingdomDebug = debugTools;
}

function enforceLeadTurnInvariant() {
  if (!s || !s.roundActive) return;
  if (s.phase !== 'turn') return;
  if (s.trick) {
    s.leadRequiredOwner = null;
    return;
  }
  if (s.leadRequiredOwner == null) s.leadRequiredOwner = s.turn;
  if (!isKingdomBattlePlayerActionable(s.leadRequiredOwner)) {
    const nextLeader = nextAlive(s.leadRequiredOwner, 1, false);
    if (nextLeader != null) s.leadRequiredOwner = nextLeader;
  }
  if (s.turn !== s.leadRequiredOwner) s.turn = s.leadRequiredOwner;
}

function setupHand(options = {}) {
  clearNpcTimer();
  clearOpeningDealTimers();
  clearRoundState();
  s.revision = Math.max(0, Number(s.revision) || 0) + 1;
  resetKingdomBattleForRound();
  clearLocalAutoFold();
  kingdomLocalAutoFoldPrevReverse = false;
  s.roundActive = true;
  s.phase = 'openingDeal';
  s.leadRequiredOwner = null;
  s.turnCount = 1;
  s.drawDeck = Array.isArray(options.drawDeck)
    ? options.drawDeck.map((card) => ({ ...card }))
    : shuf(mkDrawDeck());
  const initialHandSize = getKingdomInitialHandSize();
  const playerCount = getKingdomPlayerCount();
  for (let r = 0; r < initialHandSize; r += 1) for (let i = 0; i < playerCount; i += 1) {
    const p = (s.dealer + i) % playerCount;
    const c = s.drawDeck.pop();
    if (c) s.players[p].hand.push(c);
  }
  s.players.forEach((p) => p.hand.sort((a, b) => cStrength(a) - cStrength(b)));
  if (!options.preserveStars) {
    s.players.forEach((p) => { p.stars = Math.max(0, Number(p.stars) || 0) + 1; });
  }
  log(`${options.retryDraw ? '引き分け再戦' : `第${s.handNo + 1}局開始`} / 親: ${pName(s.dealer)}`);

  const opening = s.drawDeck.pop();
  if (opening) {
    const openingSetNumber = (
      isMajorSuitGateCard(opening) && !areKingdomMajorArcanaGateRulesEnabled()
    ) ? 14 : idNum(opening);
    const openingSetPower = setRankFromNumber(openingSetNumber);
    if (!usesDeferredKingdomGrave() && opening.kind === 'minor') {
      s.players[s.dealer].discard.push(opening);
    }
    const openingPlay = {
      type: 'set',
      owner: s.dealer,
      count: 1,
      selected: [],
      cardsHand: [opening],
      cardsTable: [opening],
      tableOwners: [s.dealer],
      number: openingSetNumber,
      setPower: openingSetPower,
      suitMask: suitMaskForCards([opening]),
      suitTier: Math.max(...suitsForCard(opening, false).map((x) => suitTierForCard(opening, x)))
    };
    if (isMajorSuitGateCard(opening) && !areKingdomMajorArcanaGateRulesEnabled()) {
      opening.displayNumberOverride = 14;
    }
    s.pass = s.players.map(() => false);
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
  const playerCount = getKingdomPlayerCount();
  let found = 0;
  for (let st = 1; st <= playerCount * 5; st += 1) {
    const idx = (from + st) % playerCount;
    if (!isKingdomBattlePlayerActionable(idx)) continue;
    if (onlyNotPassed && s.pass[idx]) continue;
    found += 1;
    if (found >= steps) return idx;
  }
  return null;
}

function allOthersPassed(lastPlayer) {
  for (let i = 0; i < getKingdomPlayerCount(); i += 1) {
    if (i === lastPlayer) continue;
    if (!isKingdomBattlePlayerActionable(i)) continue;
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
  const isTemperanceSingle = cards.length === 1
    && cards[0]?.kind === 'major'
    && Number(cards[0]?.number) === 14;
  if (forcedCount > 0 && sel.length !== forcedCount && !isWorldSingle) {
    return { ok: false, reason: `${forcedCount}枚出しのみ有効です。` };
  }
  let n = chooseSetNumberCandidate(cards, !!s.reverse);
  if (n == null) return { ok: false, reason: '同じ数値で揃えてください。' };
  if (
    cards.length === 1
    && isMajorSuitGateCard(cards[0])
    && !areKingdomMajorArcanaGateRulesEnabled()
  ) {
    n = 14;
  }
  if (s.lock?.suit && !isWorldSingle && !isTemperanceSingle && !cards.every((c) => suitsForCard(c, false).includes(s.lock.suit))) {
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
  if (sel.length !== 4) return { ok: false, reason: 'コールは手札4枚です。' };
  const cards = sel.map((i) => p.hand[i]).filter(Boolean);
  if (cards.length !== 4) return { ok: false, reason: '選択が不正です。' };
  const role = evalRole([base, ...cards], s.lock?.suit || null);
  if (!role || role.strength < ROLE_ST.Straight) return { ok: false, reason: 'コール成立しません。' };
  if (base.kind === 'major' && role.key !== 'TheWorld') {
    return { ok: false, reason: '場の大アルカナはザ・ワールドでのみコールできます。' };
  }
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

function isMinorCourtCard(card) {
  const number = Number(card?.number);
  return !!card && card.kind === 'minor' && number >= 11 && number <= 14;
}

function isMajorNumberCard(card, number) {
  return !!card && card.kind === 'major' && Number(card.number) === Number(number);
}

function isSingleMajorSetPlay(play, number) {
  const cards = Array.isArray(play?.cardsHand) ? play.cardsHand.filter(Boolean) : [];
  return play?.type === 'set' && cards.length === 1 && isMajorNumberCard(cards[0], number);
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

function getFinishRuleViolation(play) {
  const remaining = getRemainingHandAfterPlay(play);
  if (!Array.isArray(remaining)) return null;
  const played = Array.isArray(play?.cardsHand) ? play.cardsHand : [];

  if (areKingdomMajorArcanaSpecialRulesEnabled()) {
    if (remaining.length !== 0 || play?.type !== 'set') return null;
    if (played.length > 0 && played.every(isMinorAceCard)) {
      return 'A上がりは禁止です。';
    }
    if (isSingleMajorSetPlay(play, 20)) {
      return '審判20の単独上がりは禁止です。';
    }
    if (isSingleMajorSetPlay(play, 21)) {
      return '世界21の単独上がりは禁止です。';
    }
    return null;
  }

  // schema 7までの進行中対戦は従来の上がり制限を維持する。
  // 手札がまだ残る場合に、残りがAのみになる出し方は禁止
  if (remaining.length > 0 && remaining.every(isMinorAceCard)) {
    return '手札がAだけ残る出し方はできません。';
  }
  // 最後の1手をAのみで上がる（A上がり）を禁止
  if (remaining.length === 0 && played.length > 0 && played.every(isMinorAceCard)) {
    return 'A上がりは禁止です。';
  }
  if (
    areKingdomMajorArcanaGateRulesEnabled()
    &&
    remaining.length === 0
    && play?.type === 'set'
    && played.length === 1
    && isMajorSuitGateCard(played[0])
  ) {
    return '大アルカナ16〜19で上がることはできません。';
  }
  return null;
}

function getMajorSpecialPlayViolation(play, mode) {
  if (!areKingdomMajorArcanaSpecialRulesEnabled()) return null;
  if (mode === 'call' || play?.type !== 'set') return null;
  const played = Array.isArray(play?.cardsHand) ? play.cardsHand.filter(Boolean) : [];
  const devilCards = played.filter((card) => isMajorNumberCard(card, 15));
  if (devilCards.length) {
    if (played.length !== 1 || devilCards.length !== 1) {
      return '悪魔15は通常出しでは1枚だけ選択してください。';
    }
    const fieldCards = Array.isArray(s.trick?.cardsTable) ? s.trick.cardsTable.filter(Boolean) : [];
    if (
      !s.trick
      || s.trick.type !== 'set'
      || Number(s.trick.count) !== 1
      || fieldCards.length !== 1
      || !isMinorCourtCard(fieldCards[0])
    ) {
      return '悪魔15は小アルカナのコート札（P・N・Q・K）にだけ出せます。';
    }
  }
  if (isSingleMajorSetPlay(play, 20)) {
    const fieldCards = Array.isArray(s.trick?.cardsTable) ? s.trick.cardsTable.filter(Boolean) : [];
    if (
      s.trick?.type === 'set'
      && Number(s.trick?.count) === 1
      && fieldCards.length === 1
      && isMinorAceCard(fieldCards[0])
    ) {
      return '審判20はAには出せません。';
    }
  }
  return null;
}

function isDevilCourtOverride(play, mode) {
  if (!areKingdomMajorArcanaSpecialRulesEnabled() || mode === 'call') return false;
  if (!isSingleMajorSetPlay(play, 15)) return false;
  const fieldCards = Array.isArray(s.trick?.cardsTable) ? s.trick.cardsTable.filter(Boolean) : [];
  return s.trick?.type === 'set'
    && Number(s.trick?.count) === 1
    && fieldCards.length === 1
    && isMinorCourtCard(fieldCards[0]);
}

function getMajorSuitGateViolation(play, mode) {
  if (!areKingdomMajorArcanaGateRulesEnabled()) return null;
  if (mode === 'call' || play?.type !== 'set') return null;
  const played = Array.isArray(play?.cardsHand) ? play.cardsHand.filter(Boolean) : [];
  const gateCards = played.filter(isMajorSuitGateCard);
  if (!gateCards.length) return null;
  if (played.length !== 1 || gateCards.length !== 1) {
    return '大アルカナ16〜19は通常出しでは1枚だけ選択してください。';
  }
  if (!s.trick) {
    return '大アルカナ16〜19は場が空のときは出せません。';
  }
  const fieldCards = Array.isArray(s.trick?.cardsTable) ? s.trick.cardsTable.filter(Boolean) : [];
  if (s.trick?.type !== 'set' || Number(s.trick?.count) !== 1 || fieldCards.length !== 1) {
    return '大アルカナ16〜19は場が1枚札のときだけ出せます。';
  }
  const fieldCard = fieldCards[0];
  if (isMinorAceCard(fieldCard)) {
    return '大アルカナ16〜19はAには出せません。';
  }
  const requiredSuit = suitsForCard(gateCards[0], false).find((suit) => suit && suit !== 'None');
  const fieldSuits = suitsForCard(fieldCard, false);
  if (!requiredSuit || !fieldSuits.includes(requiredSuit)) {
    return `同じスートの1枚札にだけ出せます（${SUIT_LABEL[requiredSuit] || 'スートなし'}）。`;
  }
  return null;
}

function validatePlay(play, mode) {
  const finishRuleViolation = getFinishRuleViolation(play);
  if (finishRuleViolation) return { ok: false, reason: finishRuleViolation };
  const majorSuitGateViolation = getMajorSuitGateViolation(play, mode);
  if (majorSuitGateViolation) return { ok: false, reason: majorSuitGateViolation };
  const majorSpecialPlayViolation = getMajorSpecialPlayViolation(play, mode);
  if (majorSpecialPlayViolation) return { ok: false, reason: majorSpecialPlayViolation };
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
    if (base?.kind === 'major' && play?.role?.key !== 'TheWorld') {
      return { ok: false, reason: '場の大アルカナはザ・ワールドでのみコールできます。' };
    }
    return (s.trick.type === 'set' && s.trick.count === 1) ? { ok: true } : { ok: false, reason: 'コール対象は1枚場札のみです。' };
  }
  const expectedSetCount = Math.max(0, Number(s.trickForcedCount || 0)) || Number(s.trick.count || 0);
  if (play.type !== s.trick.type) {
    return s.trick.type === 'role'
      ? { ok: false, reason: '場は5枚役です。5枚で場より強い役を作ってください。' }
      : { ok: false, reason: `場は${expectedSetCount}枚出しです。同じ枚数を選択してください。` };
  }
  if (play.type === 'set') {
    if (play.count !== expectedSetCount) {
      return { ok: false, reason: `場は${expectedSetCount}枚出しです。${expectedSetCount}枚を選択してください。` };
    }
  } else if (play.count !== s.trick.count) {
    return { ok: false, reason: '場は5枚役です。5枚を選択してください。' };
  }
  if (play.type === 'set') {
    if (isDevilCourtOverride(play, mode)) return { ok: true };
    const c = setCmp(play.setPower ?? play.number, s.trick.setPower ?? s.trick.number);
    if (c > 0) return { ok: true };
    if (c < 0) {
      return {
        ok: false,
        reason: s.reverse
          ? '11バック中は、場札より小さい数値が必要です。'
          : '場札より大きい数値が必要です。'
      };
    }
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
  if (!actor || !isNpcPlayer(playerIndex)) return 'draw';
  if ((s?.drawDeck?.length || 0) <= 0) return 'skip';
  if (actor.hand.length >= getKingdomHandLimit()) return 'skip';
  const aiStyle = getNpcAiStyle(playerIndex);
  const observation = createNpcObservation(playerIndex);
  if (!observation) return 'draw';
  const knownIds = new Set(observation.hand.map((card) => String(card?.id || '')).filter(Boolean));
  observation.discards.forEach((entry) => {
    if (entry?.card?.id) knownIds.add(String(entry.card.id));
  });
  (observation.trick?.cardsTable || []).forEach((card) => {
    if (card?.id) knownIds.add(String(card.id));
  });
  (observation.trickPile || []).forEach((entry) => {
    if (entry?.card?.id) knownIds.add(String(entry.card.id));
  });
  const unseen = mkDrawDeck().filter((card) => !knownIds.has(String(card.id)));
  if (!unseen.length) return 'skip';
  const base = getNpcHandPotential(observation.hand, observation.lock?.suit || null);
  let improved = 0;
  let gainTotal = 0;
  unseen.forEach((card) => {
    const after = getNpcHandPotential([...observation.hand, card], observation.lock?.suit || null);
    const gain = after.score - base.score;
    if (gain >= 14 || after.roleCount > base.roleCount || after.legalPathCount > base.legalPathCount + 1) {
      improved += 1;
      gainTotal += Math.max(0, gain);
    }
  });
  const improvementChance = improved / unseen.length;
  const averageGain = improved > 0 ? gainTotal / improved : 0;
  const threshold = aiStyle === NPC_AI_STYLE.CAUTIOUS ? 0.28 : (aiStyle === NPC_AI_STYLE.AGGRESSIVE ? 0.1 : 0.18);
  if (base.roleCount > 0 && aiStyle !== NPC_AI_STYLE.AGGRESSIVE) return 'skip';
  return improvementChance >= threshold || averageGain >= 50 ? 'draw' : 'skip';
}

function resetBlockedLeaderCycle() {
  if (!s) return;
  s.blockedLeaderSeats = [];
}

function getActionableKingdomSeats() {
  return getKingdomSeatIndexes().filter((index) => isKingdomBattlePlayerActionable(index));
}

function hasLegalKingdomOpening(playerIndex) {
  if (!s || s.trick || !isKingdomBattlePlayerActionable(playerIndex)) return false;
  return setMoves(playerIndex).length > 0 || roleMoves(playerIndex).length > 0;
}

function drawOneKingdomMixedCard(playerIndex, reason = 'forced') {
  const actor = s?.players?.[playerIndex];
  if (!actor || actor.hand.length >= getKingdomHandLimit() || s.drawDeck.length <= 0) return null;
  const card = s.drawDeck.pop() || null;
  if (!card) return null;
  s.revision = Math.max(0, Number(s.revision) || 0) + 1;
  actor.hand.push(card);
  startDrawHandFlip(playerIndex, card);
  onPlayerDrewCard(playerIndex, 1200);
  const reasonLabel = reason === 'world' ? '世界の強制ドロー' : '親の強制ドロー';
  log(`${pName(playerIndex)}: ${reasonLabel}（${card.kind === 'major' ? '大' : '小'}アルカナ）`);
  triggerKingdomActionFx(playerIndex, reason === 'world' ? '世界・強制ドロー' : '強制ドロー', {
    overlay: isLocalPlayer(playerIndex) ? 'draw' : null,
    durationMs: 620,
    cutin: true
  });
  return card;
}

function startKingdomDrawRetry() {
  if (!s || s.transition?.kind === 'roundDrawRetry') return;
  clearNpcTimer();
  s.roundActive = true;
  s.phase = 'roundDraw';
  s.pendingDraw = null;
  s.pendingDrawReason = null;
  s.pendingJudgment = null;
  s.pendingJudgmentFollowup = null;
  s.selected.clear();
  s.message = '引き分け・再戦';
  log(`第${s.handNo + 1}局は引き分け。同じ親・同じ局数で再戦`);
  triggerKingdomActionFx(s.dealer, '引き分け・再戦', {
    overlay: 'action',
    durationMs: 900,
    cutin: true
  });
  setKingdomTransition('roundDrawRetry', s.dealer, 900);
  render();
}

function resolveEmptyFieldLeader(playerIndex) {
  if (!s || !s.roundActive || s.trick) return false;
  if (!areKingdomMajorArcanaSpecialRulesEnabled()) {
    finalizeDrawPhaseToTurn(playerIndex);
    s.message = `${pName(playerIndex)}が親です。`;
    scheduleNpc();
    render();
    return true;
  }

  let current = Number(playerIndex);
  for (let guard = 0; guard < 256; guard += 1) {
    const actionable = getActionableKingdomSeats();
    if (!actionable.length) {
      finishKingdomBattleDefeat();
      render();
      return false;
    }
    if (!actionable.includes(current)) {
      current = nextAlive(current, 1, false);
      if (current == null) {
        finishKingdomBattleDefeat();
        render();
        return false;
      }
    }

    s.phase = 'turn';
    s.turn = current;
    s.leadRequiredOwner = current;
    s.pendingDraw = null;
    s.pendingDrawReason = null;

    if (hasLegalKingdomOpening(current)) {
      resetBlockedLeaderCycle();
      s.message = `${pName(current)}が親です。`;
      scheduleNpc();
      render();
      return true;
    }

    const drawn = drawOneKingdomMixedCard(current, 'blocked-leader');
    if (drawn && hasLegalKingdomOpening(current)) {
      resetBlockedLeaderCycle();
      s.message = `${pName(current)}がドローして親を継続`;
      scheduleNpc();
      render();
      return true;
    }

    const visited = Array.isArray(s.blockedLeaderSeats) ? s.blockedLeaderSeats : [];
    if (!visited.includes(current)) visited.push(current);
    s.blockedLeaderSeats = visited;
    log(`${pName(current)}: 初手を作れないため親流れ`);

    const allVisited = actionable.every((seat) => visited.includes(seat));
    const anyoneCanDraw = s.drawDeck.length > 0
      && actionable.some((seat) => s.players[seat].hand.length < getKingdomHandLimit());
    if (allVisited && (s.drawDeck.length <= 0 || !anyoneCanDraw)) {
      startKingdomDrawRetry();
      return false;
    }

    const nextLeader = nextAlive(current, 1, false);
    if (nextLeader == null || nextLeader === current) {
      startKingdomDrawRetry();
      return false;
    }
    current = nextLeader;
  }

  startKingdomDrawRetry();
  return false;
}

function startPostClearLeaderFlow(playerIndex) {
  if (
    areKingdomMajorArcanaSpecialRulesEnabled()
    && !s.trick
    && !hasLegalKingdomOpening(playerIndex)
  ) {
    resolveEmptyFieldLeader(playerIndex);
    return;
  }
  resetBlockedLeaderCycle();
  drawChoiceStart(playerIndex, 'clear');
}

function completeJudgmentFollowup(playerIndex) {
  const followup = String(s?.pendingJudgmentFollowup || 'clear');
  s.pendingJudgmentFollowup = null;
  if (followup === 'world' && areKingdomMajorArcanaSpecialRulesEnabled()) {
    resolveEmptyFieldLeader(playerIndex);
    return;
  }
  startPostClearLeaderFlow(playerIndex);
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
  if (!s.trick && hasLegalKingdomOpening(playerIndex)) resetBlockedLeaderCycle();
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
  const handLimit = getKingdomHandLimit();
  traceKingdomFlow(
    'drawChoiceStart.enter',
    `player=${playerIndex} hand=${actor?.hand?.length ?? 0} drawDeck=${s.drawDeck.length}`
  );
  if ((actor?.hand?.length || 0) >= handLimit) {
    traceKingdomFlow('drawChoiceStart.skip.fullHand', `player=${playerIndex}`);
    finalizeDrawPhaseToTurn(playerIndex);
    s.message = `${pName(playerIndex)}は手札上限(${handLimit}枚)のためドローできません。`;
    log(`${pName(playerIndex)}: 手札上限のためドローなし`);
    scheduleNpc();
    render();
    return;
  }
  s.pendingDraw = playerIndex;
  s.pendingDrawReason = reason;
  traceKingdomFlow('drawChoiceStart.pending', `player=${playerIndex} drawDeck=${s.drawDeck.length}`);
  if (s.drawDeck.length <= 0) {
    traceKingdomFlow('drawChoiceStart.skip.noDeck', `player=${playerIndex}`);
    finalizeDrawPhaseToTurn(playerIndex); s.message = `${pName(playerIndex)}が親です。`; scheduleNpc(); render(); return;
  }
  s.phase = 'draw'; s.message = `${pName(playerIndex)}: 混合山札から1枚ドロー可能`;
  traceKingdomFlow('drawChoiceStart.waitChoice', `player=${playerIndex}`);
  render();
  if (isNpcPlayer(playerIndex)) scheduleNpc();
}

function judgmentOptions() {
  const out = [];
  s.players.forEach((p, owner) => p.discard.forEach((card, cardIndex) => {
    if (card?.kind === 'minor') out.push({ owner, cardIndex, card });
  }));
  return out;
}

function judgmentStart(playerIndex, options = {}) {
  s.pendingJudgmentFollowup = options.followup === 'world' ? 'world' : 'clear';
  const player = s.players?.[playerIndex];
  if (!player || player.hand.length >= getKingdomHandLimit()) {
    log('審判: 手札上限のため回収なし');
    completeJudgmentFollowup(playerIndex);
    return;
  }
  const opts = judgmentOptions();
  if (!opts.length) { log('審判: 回収候補なし'); completeJudgmentFollowup(playerIndex); return; }
  s.pendingJudgment = playerIndex; s.phase = 'judgment'; s.message = `${pName(playerIndex)}: 審判で墓地回収`;
  render();
  if (isNpcPlayer(playerIndex)) scheduleNpc();
}

function clearTrick(leader, options = {}) {
  clearCallCinematicTimer();
  const worldForcedDraw = !!options.worldForcedDraw && areKingdomMajorArcanaSpecialRulesEnabled();
  const resolvedLeader = isKingdomBattlePlayerActionable(leader)
    ? leader
    : nextAlive(leader, 1, false);
  if (resolvedLeader == null) {
    finishKingdomBattleDefeat();
    render();
    return;
  }
  s._traceFlowId = (kingdomTraceFlowSeed += 1);
  traceKingdomFlow('clearTrick.enter', `leader=${leader} resolvedLeader=${resolvedLeader}`);
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
  const hadJudgment = !!s.judgmentRecoveryPending;
  traceKingdomFlow('clearTrick.stateReset', `hadJudgment=${hadJudgment}`);
  if (usesDeferredKingdomGrave()) flushKingdomTrickToGrave();
  s.trickForcedCount = 0;
  s.judgmentRecoveryPending = false;
  s.trickDefeatFx = null;
  s.trickTransitionKind = 'clearSweep';
  s.trick = null;
  s.lastPlay = null;
  if (s.battle?.enemy) {
    s.battle.enemy.petrifiedUntilClear = false;
    s.battle.enemy.areaAttackSealedUntilClear = false;
  }
  clearKingdomBattleEffects();
  s.pass = s.players.map(() => false);
  s.callOnly = false;
  s.lock = null;
  s.leadRequiredOwner = resolvedLeader;
  s.reverse = false;
  s.turn = resolvedLeader;

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

  if (worldForcedDraw) {
    const worldCard = drawOneKingdomMixedCard(resolvedLeader, 'world');
    if (!worldCard) log(`${pName(resolvedLeader)}: 世界の強制ドローなし（山札切れ）`);
  }
  if (hadJudgment) {
    traceKingdomFlow('clearTrick.next', 'judgmentStart');
    judgmentStart(resolvedLeader, { followup: worldForcedDraw ? 'world' : 'clear' });
    return;
  }
  if (worldForcedDraw) {
    traceKingdomFlow('clearTrick.next', 'worldLeaderFlow');
    resolveEmptyFieldLeader(resolvedLeader);
    return;
  }
  traceKingdomFlow('clearTrick.next', 'drawChoiceStart');
  startPostClearLeaderFlow(resolvedLeader);
}
function applySetEffects(play) {
  const cards = play.cardsHand;
  if (cards.length > 3) return { forceClear: false, keepTurn: false, skip: 0 };
  let forceClear = false, skip = 0;
  const has = (n) => cards.some((c) => idNum(c) === n);
  const hasMajor = (n) => cards.some((c) => c.kind === 'major' && c.number === n);
  if (has(5)) {
    skip = cards.length; log(`${pName(play.owner)}: 5スキップ x${cards.length}`);
    if (s.battle?.enemy) s.battle.enemy.areaAttackSealedUntilClear = true;
    triggerKingdomActionFx(play.owner, `5スキップ x${cards.length}`, { overlay: 'action', durationMs: 780, cutin: true, cutinClass: 'is-kingdom-skip' });
    triggerKingdomTrickSceneFlash('skip', 760 + (Math.max(1, cards.length) * 120));
  }
  if (has(8)) {
    if (s.battle?.enemy) s.battle.enemy.petrifiedUntilClear = true;
    if (cards.length >= 2) {
      forceClear = true; s.callOnly = false; log(`${pName(play.owner)}: 8カットでクリア`);
      triggerKingdomActionFx(play.owner, '8カット', { overlay: 'clear', durationMs: 860, cutin: true, cutinClass: 'is-kingdom-cut' });
      triggerKingdomTrickSceneFlash('cut', 980);
    } else {
      s.callOnly = true; log(`${pName(play.owner)}: 8カット（コール猶予）`);
      triggerKingdomActionFx(play.owner, '8カット', { overlay: 'action', durationMs: 780, cutin: true, cutinClass: 'is-kingdom-cut' });
      triggerKingdomTrickSceneFlash('cut', 840);
    }
  } else s.callOnly = false;
  if (has(11) || hasMajor(20)) {
    const effectName = hasMajor(20) ? '審判' : '11バック';
    if (s.reverse) {
      s.reverse = false;
      log(`${pName(play.owner)}: ${effectName}で11バック解除`);
      triggerKingdomActionFx(play.owner, `${effectName}: 反転解除`, { overlay: 'action', durationMs: 820, cutin: true, cutinClass: 'is-kingdom-reverse' });
    } else {
      s.reverse = true;
      log(`${pName(play.owner)}: ${effectName}で11バック`);
      triggerKingdomActionFx(play.owner, `${effectName}: 11バック`, { overlay: 'action', durationMs: 820, cutin: true, cutinClass: 'is-kingdom-reverse' });
    }
    if (hasMajor(20)) s.judgmentRecoveryPending = true;
  }
  if (hasMajor(14) && cards.length === 1) {
    if (s.lock?.suit) {
      s.lock = null;
      log(`${pName(play.owner)}: 節制で14ロック解除`);
      triggerKingdomActionFx(play.owner, 'ロック解除', { overlay: 'action', durationMs: 820, cutin: true, cutinClass: 'is-kingdom-lock' });
    }
  } else if (has(14) && cards.length === 1) {
    const cur = cards[0];
    const prevSuit = (play?.prevLeadSuit && play.prevLeadSuit !== 'None') ? play.prevLeadSuit : null;
    if (prevSuit && suitsForCard(cur, false).includes(prevSuit)) {
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
  return { forceClear, keepTurn: false, skip };
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
  const starBonusBase = Math.max(0, Number(winner.stars) || 0);
  const starBonusTotal = starBonusBase;
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
    rows: [],
    coinEvents: [],
    coinFxDispatched: false,
    bonusCoinFx: null,
    potAward: 0,
    totalGain: 0,
    displayTotalGain: 0,
    matchDone: false
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
  s.reverse = false;
  s.players.forEach((p) => { p.stars = 0; });
  s.handNo += 1;
  if (s.handNo >= TOTAL_HANDS) {
    settlement.matchDone = true;
    let top = 0; s.players.forEach((p, i) => { if (s.players[i].chips > s.players[top].chips) top = i; });
    s.champion = top;
    s.phase = 'done';
    s.awaitRoundConfirm = false;
    triggerKingdomGrandWinnerFx(top);
    s.message = `ゲーム終了！ 優勝: ${s.players[top].name} (${s.players[top].chips}チップ)`;
    log(s.message);
    render();
    return;
  }
  s.dealer = (s.dealer + 1) % getKingdomPlayerCount();
  s.awaitRoundConfirm = true;
  s.message = `${winner.name}が第${roundNo}局に勝利。清算を確認して次局へ進んでください。次局の親: ${pName(s.dealer)}。`;
  render();
}

function applyDrawChoice() {
  traceKingdomFlow('applyDrawChoice.enter', 'deck=mixed');
  const pi = s.pendingDraw;
  if (pi == null) {
    traceKingdomFlow('applyDrawChoice.abort', 'reason=noPendingDraw');
    return;
  }
  const actor = s.players[pi];
  const handLimit = getKingdomHandLimit();
  if (!actor) {
    traceKingdomFlow('applyDrawChoice.abort', `reason=noActor player=${pi}`);
    return;
  }
  if ((actor.hand?.length || 0) >= handLimit) {
    traceKingdomFlow('applyDrawChoice.abort', `reason=fullHand player=${pi}`);
    finalizeDrawPhaseToTurn(pi);
    s.message = `${pName(pi)}は手札上限(${handLimit}枚)のためドローできません。`;
    log(`${pName(pi)}: 手札上限のためドローなし`);
    scheduleNpc();
    render();
    return;
  }
  if (isLocalPlayer(pi)) s.selected.clear();
  s.revision = Math.max(0, Number(s.revision) || 0) + 1;
  const c = s.drawDeck.pop() || null;
  traceKingdomFlow('applyDrawChoice.drawn', `player=${pi} deck=mixed card=${c ? `${c.kind}:${c.suit}:${c.number}` : 'none'}`);
  if (c) {
    actor.hand.push(c);
    startDrawHandFlip(pi, c);
    onPlayerDrewCard(pi, 1200);
    log(`${pName(pi)}: ${c.kind === 'major' ? '大' : '小'}アルカナをドロー`);
  }
  const drawByHuman = isLocalPlayer(pi);
  triggerKingdomActionFx(pi, 'ドロー', {
    overlay: drawByHuman ? 'draw' : null,
    durationMs: 620,
    cutin: true
  });
  finalizeDrawPhaseToTurn(pi); s.message = `${pName(pi)}が親です。`;
  traceKingdomFlow('applyDrawChoice.exit', `player=${pi} hand=${actor.hand.length}`);
  scheduleNpc(); render();
}

function applyJudgmentPick(owner, cardIndex) {
  const pi = s.pendingJudgment;
  if (pi == null) return;
  if ((s.players?.[pi]?.hand?.length || 0) >= getKingdomHandLimit()) {
    s.pendingJudgment = null;
    log(`${pName(pi)}: 手札上限のため審判回収なし`);
    completeJudgmentFollowup(pi);
    return;
  }
  const poolOwner = s.players[owner];
  if (!poolOwner || cardIndex < 0 || cardIndex >= poolOwner.discard.length) return;
  const card = poolOwner.discard[cardIndex];
  if (!card || card.kind !== 'minor') return;
  poolOwner.discard.splice(cardIndex, 1);
  s.revision = Math.max(0, Number(s.revision) || 0) + 1;
  s.players[pi].hand.push(card);
  startDrawHandFlip(pi, card);
  onPlayerDrewCard(pi, 1100);
  s.pendingJudgment = null;
  log(`${pName(pi)}: 審判で ${getCardNameLabel(card)} を回収`);
  triggerKingdomActionFx(pi, '審判回収', { overlay: 'draw', durationMs: 700, cutin: true });
  completeJudgmentFollowup(pi);
}

function skipJudgmentPick() {
  const pi = s.pendingJudgment;
  if (pi == null) return;
  s.revision = Math.max(0, Number(s.revision) || 0) + 1;
  s.pendingJudgment = null;
  log(`${pName(pi)}: 審判回収をスキップ`);
  triggerKingdomActionFx(pi, '審判スキップ', { overlay: 'draw', durationMs: 520, cutin: true });
  completeJudgmentFollowup(pi);
}

function getKingdomPlayToken(play) {
  return String(play?.playToken || play?.actionId || '').trim();
}

function ensureKingdomPlayToken(play, playerIndex) {
  if (!play || typeof play !== 'object') return '';
  const existing = getKingdomPlayToken(play);
  if (existing) return existing;
  const token = `tk-play-${Date.now()}-${playerIndex}-${Math.random().toString(36).slice(2, 9)}`;
  play.playToken = token;
  return token;
}

function buildKingdomCombatTimeline(variant, weaponType = 'sword', effectCount = 0) {
  const effectTailMs = Math.max(0, Math.floor(Number(effectCount) || 0)) * 220;
  const isSkill = variant === 'skill';
  if (isSkill) {
    if (areKingdomSummonsEnabled()) {
      return {
        version: 2,
        variant: 'skill',
        motionOffsetMs: 1300,
        impactOffsetMs: 3000,
        hpRevealOffsetMs: 3160,
        hpTweenEndOffsetMs: 3600,
        effectOffsetMs: 3600,
        durationMs: KINGDOM_SUMMON_ATTACK_MS
      };
    }
    return {
      version: 1,
      variant: 'skill',
      motionOffsetMs: 520,
      impactOffsetMs: 1080,
      hpRevealOffsetMs: 1200,
      hpTweenEndOffsetMs: 1520,
      effectOffsetMs: 1560,
      durationMs: KINGDOM_SKILL_ATTACK_MS + effectTailMs
    };
  }
  const profile = getCombatWeaponMotionProfile(weaponType || 'sword');
  const weaponWindow = Math.min(540, Math.max(240, Number(profile?.duration) || 380));
  const impactRatio = Math.max(0.3, Math.min(0.78, Number(profile?.impactRatio) || 0.58));
  const impactOffsetMs = Math.min(560, Math.max(300, Math.round(180 + (weaponWindow * impactRatio))));
  const hpRevealOffsetMs = impactOffsetMs + KINGDOM_NORMAL_HIT_STOP_MS;
  return {
    version: 1,
    variant: 'attack',
    motionOffsetMs: 180,
    impactOffsetMs,
    hpRevealOffsetMs,
    hpTweenEndOffsetMs: hpRevealOffsetMs + KINGDOM_NORMAL_HP_TWEEN_MS,
    effectOffsetMs: hpRevealOffsetMs + KINGDOM_NORMAL_HP_TWEEN_MS + 40,
    durationMs: KINGDOM_NORMAL_ATTACK_MS + effectTailMs
  };
}

function buildKingdomEnemyTimelineSpecs(events = []) {
  const specs = {};
  let cursor = 0;
  (Array.isArray(events) ? events : []).filter(Boolean).forEach((event) => {
    const type = String(event?.type || 'enemy-single');
    const durationMs = getKingdomBattleEventDuration(event);
    const isArea = type === 'enemy-area';
    specs[String(event.seq)] = {
      version: 1,
      variant: type,
      startOffsetMs: cursor,
      impactOffsetMs: isArea ? 320 : 240,
      hpRevealOffsetMs: isArea ? 400 : 320,
      hpTweenEndOffsetMs: isArea ? 640 : 520,
      durationMs
    };
    cursor += durationMs;
  });
  return specs;
}

function normalizeKingdomTransitionTimeline(rawTimeline, startedAt, endsAt) {
  if (!rawTimeline || typeof rawTimeline !== 'object') return null;
  const start = Math.max(0, Number(startedAt) || 0);
  const end = Math.max(start, Number(endsAt) || start);
  const absolute = (key, offsetKey, fallback) => {
    const direct = Number(rawTimeline[key]);
    if (Number.isFinite(direct) && direct >= start) return Math.min(end, direct);
    const offset = Number(rawTimeline[offsetKey]);
    return Math.min(end, start + Math.max(0, Number.isFinite(offset) ? offset : fallback));
  };
  const impactAt = absolute('impactAt', 'impactOffsetMs', 0);
  const motionAt = Math.min(impactAt, absolute('motionAt', 'motionOffsetMs', 0));
  const hpRevealAt = Math.max(impactAt, absolute('hpRevealAt', 'hpRevealOffsetMs', impactAt - start));
  const hpTweenEndsAt = Math.max(hpRevealAt, absolute(
    'hpTweenEndsAt',
    'hpTweenEndOffsetMs',
    hpRevealAt - start
  ));
  const effectAt = Math.max(hpTweenEndsAt, absolute('effectAt', 'effectOffsetMs', hpTweenEndsAt - start));
  return {
    version: Math.max(1, Math.min(2, Math.floor(Number(rawTimeline.version) || 1))),
    variant: ['skill', 'attack', 'enemy-single', 'enemy-area', 'enemy-self', 'enemy-status'].includes(String(rawTimeline.variant || ''))
      ? String(rawTimeline.variant)
      : 'attack',
    startedAt: start,
    motionAt,
    impactAt,
    hpRevealAt,
    hpTweenEndsAt,
    effectAt,
    endsAt: end
  };
}

function setKingdomTransition(kind, actorIndex, durationMs, details = {}) {
  if (!s) return null;
  s.revision = Math.max(0, Number(s.revision) || 0) + 1;
  const duration = Math.max(0, Math.floor(Number(durationMs) || 0));
  const safeDetails = details && typeof details === 'object' ? { ...details } : {};
  const requestedStartedAt = Number(safeDetails.startedAt);
  const startedAt = Number.isFinite(requestedStartedAt) && requestedStartedAt > 0
    ? requestedStartedAt
    : Date.now();
  delete safeDetails.startedAt;
  const endsAt = startedAt + duration;
  const primaryTimelineEndsAt = safeDetails.timeline?.durationMs != null
    ? Math.min(endsAt, startedAt + Math.max(0, Number(safeDetails.timeline.durationMs) || 0))
    : endsAt;
  const timeline = normalizeKingdomTransitionTimeline(safeDetails.timeline, startedAt, primaryTimelineEndsAt);
  delete safeDetails.timeline;
  const eventTimelineSpecs = safeDetails.eventTimelineSpecs && typeof safeDetails.eventTimelineSpecs === 'object'
    ? safeDetails.eventTimelineSpecs
    : null;
  delete safeDetails.eventTimelineSpecs;
  const eventTimelines = {};
  if (eventTimelineSpecs) {
    Object.entries(eventTimelineSpecs).forEach(([seq, spec]) => {
      if (!spec || typeof spec !== 'object') return;
      const eventStartedAt = startedAt + Math.max(0, Number(spec.startOffsetMs) || 0);
      const eventEndsAt = Math.min(endsAt, eventStartedAt + Math.max(0, Number(spec.durationMs) || 0));
      const normalized = normalizeKingdomTransitionTimeline(spec, eventStartedAt, eventEndsAt);
      if (normalized) eventTimelines[String(seq)] = normalized;
    });
  }
  s.transition = {
    kind: String(kind || ''),
    actorIndex: Number.isInteger(Number(actorIndex)) ? Number(actorIndex) : null,
    startedAt,
    endsAt,
    ...safeDetails,
    ...(timeline ? { timeline } : {}),
    ...(Object.keys(eventTimelines).length ? { eventTimelines } : {})
  };
  scheduleKingdomTransitionResolution();
  return s.transition;
}

function scheduleKingdomTransitionResolution() {
  clearKingdomTransitionTimer();
  if (!s?.transition || !isHostAuthority()) return;
  const waitMs = Math.max(0, Number(s.transition.endsAt || 0) - Date.now());
  kingdomTransitionTimer = setTimeout(() => {
    kingdomTransitionTimer = null;
    resolveKingdomTransition();
  }, Math.min(2147483647, waitMs + 12));
}

function resolveKingdomTransition() {
  if (!s?.transition || !isHostAuthority()) return false;
  const transition = { ...s.transition };
  if (Date.now() + 4 < Number(transition.endsAt || 0)) {
    scheduleKingdomTransitionResolution();
    return false;
  }
  s.transition = null;
  s.revision = Math.max(0, Number(s.revision) || 0) + 1;
  const actorIndex = Number(transition.actorIndex);
  if (transition.kind === 'play' || transition.kind === 'call') {
    const play = s.lastPlay;
    if (!play || (transition.playToken && getKingdomPlayToken(play) !== transition.playToken)) {
      s.phase = 'turn';
      enforceLeadTurnInvariant();
      s.message = `${pName(s.turn)}のターン`;
      scheduleNpc();
      render();
    } else {
      if (transition.kind === 'call') s.callMergeFx = null;
      continueAfterPlay(actorIndex, play);
    }
  } else if (transition.kind === 'roundOut') {
    finishRound(actorIndex);
  } else if (transition.kind === 'roundDrawRetry') {
    setupHand({ preserveStars: true, retryDraw: true });
    render();
    if (s?.roundActive) playOpeningDealCinematic();
  } else if (transition.kind === 'enemyResponse') {
    s.phase = String(transition.resumePhase || 'turn');
    if (transition.resumeTurn != null && Number.isInteger(Number(transition.resumeTurn))) s.turn = Number(transition.resumeTurn);
    s.pendingDraw = transition.resumePendingDraw != null && Number.isInteger(Number(transition.resumePendingDraw))
      ? Number(transition.resumePendingDraw)
      : null;
    s.pendingDrawReason = transition.resumePendingDrawReason || null;
    s.pendingJudgment = transition.resumePendingJudgment != null && Number.isInteger(Number(transition.resumePendingJudgment))
      ? Number(transition.resumePendingJudgment)
      : null;
    s.message = String(transition.resumeMessage || `${pName(s.turn)}のターン`);
    if (s.phase === 'roundDraw') {
      startKingdomDrawRetry();
      return true;
    }
    scheduleNpc();
    render();
  } else if (transition.kind === 'terminalEnemyResponse') {
    s.phase = 'done';
    s.message = '全員が戦闘不能になりました。モンスター戦敗北。';
    render();
  }
  if (isNetModeActive() && tkNet.isHost) queueStatePublish(true);
  return true;
}

function recoverKingdomHostProgress() {
  if (!s || !isHostAuthority()) return;
  if (s.transition) {
    if (Number(s.transition.endsAt || 0) <= Date.now()) resolveKingdomTransition();
    else scheduleKingdomTransitionResolution();
    return;
  }
  if (!s.roundActive) return;
  if (s.phase === 'openingDeal') {
    playRoundStartCinematic();
    return;
  }
  if (s.phase === 'openingCinematic') {
    s.phase = 'turn';
    s.message = `${pName(s.turn)}のターン`;
    scheduleNpc();
    render();
    return;
  }
  if (s.phase === 'callCinematic' && s.lastPlay) {
    const actorIndex = Number(s.lastPlay.owner);
    const attackEvent = (Array.isArray(s?.battle?.events) ? s.battle.events : [])
      .slice().reverse().find((event) => Number(event?.actorIndex) === actorIndex && event?.type === 'skill');
    const effectCount = Math.max(0, Number(attackEvent?.effectCount) || 0);
    const duration = getKingdomSkillAttackDuration(effectCount);
    const startedAt = Number(s.callMergeFx?.startedAt || Date.now());
    setKingdomTransition('call', actorIndex, duration, {
      startedAt,
      playToken: ensureKingdomPlayToken(s.lastPlay, actorIndex),
      eventSeqs: attackEvent ? [attackEvent.seq] : [],
      roleKey: String(s.lastPlay?.role?.key || ''),
      summonId: String(attackEvent?.summon?.id || ''),
      timeline: buildKingdomCombatTimeline('skill', s.players?.[actorIndex]?.character?.combat?.weaponType || 'sword', effectCount)
    });
    scheduleKingdomTransitionResolution();
    return;
  }
  if (s.phase === 'roundOutCinematic') {
    setKingdomTransition('roundOut', Number(s.turn), 0);
    scheduleKingdomTransitionResolution();
    return;
  }
  if (s.phase === 'roundDraw') {
    setKingdomTransition('roundDrawRetry', Number(s.dealer), 0);
    scheduleKingdomTransitionResolution();
    return;
  }
  if (
    s.phase === 'turn'
    && !s.trick
    && areKingdomMajorArcanaSpecialRulesEnabled()
  ) {
    resolveEmptyFieldLeader(s.turn);
  }
}

function continueAfterPlay(pi, play) {
  if (!s || !s.players?.[pi]) return;
  const playToken = getKingdomPlayToken(play);
  if (playToken && getKingdomPlayToken(s.lastPlay) !== playToken) return;
  if (!playToken && (s.lastPlay !== play || s.trick !== play)) return;
  const p = s.players[pi];
  if (play?.type === 'role' && play?.call) {
    // コール成立後は、場にかかっている効果を全解除する。
    s.callOnly = false; // 8カット（コール猶予）
    s.lock = null; // 14ロック / 節制ロック
    s.reverse = false; // 11バック
    if (s.battle?.enemy) {
      s.battle.enemy.petrifiedUntilClear = false;
      s.battle.enemy.areaAttackSealedUntilClear = false;
    }
    clearKingdomBattleEffects();
  }
  if (
    areKingdomMajorArcanaSpecialRulesEnabled()
    && isSingleMajorSetPlay(play, 21)
  ) {
    applySetEffects(play);
    clearTrick(pi, { worldForcedDraw: true });
    return;
  }
  if (p.hand.length <= 0) {
    if (play?.type === 'role') {
      p.stars = Math.max(0, Number(p.stars) || 0) + 1;
      applyRoleRewardOnClear(pi);
    }
    markKingdomBattleVictory(pi);
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
  setKingdomTransition('roundOut', winnerIndex, ROUND_OUT_CINEMATIC_MS);
  render();
}

function applyPlay(pi, play, retryDepth = 0) {
  clearCallCinematicTimer();
  if (s?.transition) return;
  if (!isKingdomBattlePlayerConscious(pi)) {
    passAction(pi);
    return;
  }
  const p = s.players[pi];
  const playToken = ensureKingdomPlayToken(play, pi);
  const capturedCardDealFx = captureKingdomCardDealFx(pi, play);
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
  s.revision = Math.max(0, Number(s.revision) || 0) + 1;
  pendingKingdomCardDealFx = capturedCardDealFx
    ? { ...capturedCardDealFx, playToken }
    : null;
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
  if (
    !areKingdomMajorArcanaGateRulesEnabled()
    && play.type === 'set'
    && Number(play.count || 0) === 1
    && isMajorSuitGateCard(play.cardsTable?.[0])
  ) {
    play.cardsTable[0].displayNumberOverride = 14;
    if (play.cardsHand?.[0]) play.cardsHand[0].displayNumberOverride = 14;
  }
  if (usesDeferredKingdomGrave()) {
    queueKingdomTrickForGrave(prevTrick, isCallPlay && prevLeadCard ? [prevLeadCard] : []);
  } else {
    // 旧対戦は従来どおり提出時に墓地へ送り、対戦終了まで互換動作を維持する。
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
  }
  if (play.call) {
    p.stars = Math.max(0, (Number(p.stars) || 0) - 1);
  }
  if (isLocalPlayer(pi)) s.selected.clear();
  s.pass = s.players.map(() => false);
  if (!prevTrick) resetBlockedLeaderCycle();
  s.trick = play;
  s.trickDefeatFx = pickTrickDefeatFx(play, prevTrick);
  s.trickTransitionKind = isCallPlay
    ? 'callSteal'
    : (play?.type === 'role' && String(prevTrick?.type || '') === 'role' ? 'roleClash' : 'normal');
  play.prevLeadSuit = prevLeadSuit;
  s.leadRequiredOwner = null;
  s.lastPlay = play;
  s.turn = pi;
  const attackEvent = applyKingdomPlayerAttack(pi, play);
  if (p.hand.length === 1) {
    triggerKingdomRowActionFx(pi, 'LAST 1', 920);
    triggerKingdomActionFx(pi, 'ラスト1枚', { overlay: 'action', durationMs: 820, cutin: true });
  }
  const callFxLevel = isCallPlay ? getKingdomCallFxLevel(play?.role?.key) : 0;
  const effectCount = Math.max(0, Number(attackEvent?.effectCount) || 0);
  const callCinematicMs = isCallPlay ? getKingdomSkillAttackDuration(effectCount) : 0;
  s.callMergeFx = isCallPlay
    ? { owner: pi, startedAt: Date.now(), level: callFxLevel, roleKey: String(play?.role?.key || '') }
    : null;
  log(`${p.name}: ${play.type === 'set' ? `${play.count}枚出し` : getRoleDisplayLabel(play)}`);
  const actionLabel = play.type === 'set'
    ? `${play.count}枚出し`
    : getRoleDisplayLabel(play);
  triggerKingdomActionFx(pi, actionLabel, {
    overlay: isRolePlay ? null : 'action',
    overlayHoldMs: null,
    durationMs: isCallPlay ? Math.max(980, callCinematicMs - 120) : (isRolePlay ? 980 : 700),
    cutin: false,
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
    setKingdomTransition('call', pi, callCinematicMs, {
      playToken,
      eventSeqs: attackEvent ? [attackEvent.seq] : [],
      roleKey: String(play?.role?.key || ''),
      summonId: String(attackEvent?.summon?.id || ''),
      timeline: buildKingdomCombatTimeline('skill', p?.character?.combat?.weaponType || 'sword', effectCount)
    });
    render();
    return;
  }
  clearPendingTurnAdvanceAfterTrick();
  s.phase = 'resolvingPlay';
  const attackVariant = isRolePlay ? 'skill' : 'attack';
  const attackTimeline = buildKingdomCombatTimeline(attackVariant, p?.character?.combat?.weaponType || 'sword', effectCount);
  setKingdomTransition('play', pi, attackTimeline.durationMs, {
    playToken,
    eventSeqs: attackEvent ? [attackEvent.seq] : [],
    roleKey: String(play?.role?.key || ''),
    summonId: String(attackEvent?.summon?.id || ''),
    timeline: attackTimeline
  });
  render();
}

function passAction(pi) {
  if (s?.transition) return;
  if (!isKingdomBattlePlayerConscious(pi)) {
    const next = nextAlive(pi, 1, true) ?? nextAlive(pi, 1, false);
    if (next == null) {
      finishKingdomBattleDefeat();
      render();
      return;
    }
    s.revision = Math.max(0, Number(s.revision) || 0) + 1;
    s.pass[pi] = true;
    if (isLocalPlayer(pi)) s.selected.clear();
    log(`${pName(pi)}: 戦闘不能のため強制スキップ`);
    s.turn = next;
    s.message = `${pName(pi)}は戦闘不能。${pName(next)}のターン`;
    scheduleNpc();
    render();
    return;
  }
  if (!s.trick) {
    if (areKingdomMajorArcanaSpecialRulesEnabled()) {
      resolveEmptyFieldLeader(pi);
      return;
    }
    // フェイルセーフ: まれに親ターン復帰時に場札が空のまま進行することがあるため、
    // その場合は親ドロー手順へ戻して進行停止を回避する。
    if (s?.roundActive && s.phase === 'turn' && s.turn === pi) {
      const actor = s.players?.[pi];
      if (actor && actor.hand.length < getKingdomHandLimit() && s.drawDeck.length > 0) {
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
  s.revision = Math.max(0, Number(s.revision) || 0) + 1;
  s.pass[pi] = true; log(`${pName(pi)}: パス`);
  if (isLocalPlayer(pi)) s.selected.clear();
  const passByHuman = isLocalPlayer(pi);
  triggerKingdomActionFx(pi, 'パス', { overlay: passByHuman ? 'action' : null, durationMs: 480, cutin: true });
  const singleAttackEvent = applyKingdomEnemySingleAttack(pi);
  if (isKingdomPartyDefeated()) {
    finishKingdomBattleDefeat();
    startKingdomTerminalEnemyTransition(pi, [singleAttackEvent].filter(Boolean));
    render();
    return;
  }
  const leader = s.lastPlay?.owner;
  if (leader != null && allOthersPassed(leader)) {
    log('全員パスでクリア');
    const areaAttackEvent = applyKingdomEnemyAreaAttack();
    if (isKingdomPartyDefeated()) {
      finishKingdomBattleDefeat();
      startKingdomTerminalEnemyTransition(pi, [singleAttackEvent, areaAttackEvent].filter(Boolean));
      render();
      return;
    }
    clearTrick(leader);
    if (singleAttackEvent || areaAttackEvent) {
      const resume = {
        resumePhase: s.phase,
        resumeTurn: s.turn,
        resumePendingDraw: s.pendingDraw,
        resumePendingDrawReason: s.pendingDrawReason,
        resumePendingJudgment: s.pendingJudgment,
        resumeMessage: s.message
      };
      clearNpcTimer();
      s.phase = 'resolvingEnemy';
      s.message = `${s.battle.enemy.name}の全体攻撃...`;
      const eventSeqs = [singleAttackEvent?.seq, areaAttackEvent?.seq].filter(Number.isFinite);
      const responseDuration = (singleAttackEvent ? 540 : 0) + (areaAttackEvent ? 720 : 0);
      const responseEvents = [singleAttackEvent, areaAttackEvent].filter(Boolean);
      const eventTimelineSpecs = buildKingdomEnemyTimelineSpecs(responseEvents);
      const primaryTimeline = eventTimelineSpecs[String(responseEvents[0]?.seq || '')] || null;
      setKingdomTransition('enemyResponse', pi, responseDuration, {
        ...resume,
        eventSeqs,
        ...(primaryTimeline ? { timeline: primaryTimeline, eventTimelineSpecs } : {})
      });
      render();
    }
    return;
  }
  s.turn = nextAlive(pi, 1, true) ?? (leader ?? pi);
  s.message = `${pName(s.turn)}のターン`;
  if (singleAttackEvent) {
    const resumeMessage = s.message;
    clearNpcTimer();
    s.phase = 'resolvingEnemy';
    s.message = `${s.battle.enemy.name}の反撃...`;
    const eventTimelineSpecs = buildKingdomEnemyTimelineSpecs([singleAttackEvent]);
    setKingdomTransition('enemyResponse', pi, 540, {
      resumePhase: 'turn',
      resumeTurn: s.turn,
      resumeMessage,
      eventSeqs: [singleAttackEvent.seq],
      timeline: eventTimelineSpecs[String(singleAttackEvent.seq)],
      eventTimelineSpecs
    });
    render();
    return;
  }
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
  return p.hand.length >= Math.max(5, getKingdomInitialHandSize() - 1) || turnNo <= 3;
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

function createNpcObservation(playerIndex) {
  const player = s?.players?.[playerIndex];
  if (!player) return null;
  return {
    playerIndex,
    hand: cloneKingdomSnapshotValue(player.hand, []),
    trick: cloneKingdomSnapshotValue(s.trick, null),
    trickPile: cloneKingdomSnapshotValue(s.trickPile, []),
    discards: (s.players || []).flatMap((entry, owner) => (
      (Array.isArray(entry?.discard) ? entry.discard : []).map((card) => ({ owner, card: cloneKingdomSnapshotValue(card, null) }))
    )),
    drawDeckCount: Math.max(0, Number(s.drawDeck?.length) || 0),
    handCounts: (s.players || []).map((entry) => Math.max(0, Number(entry?.hand?.length) || 0)),
    turn: Number(s.turn),
    reverse: !!s.reverse,
    lock: cloneKingdomSnapshotValue(s.lock, null),
    callOnly: !!s.callOnly,
    stars: Math.max(0, Number(player.stars) || 0),
    pendingDrawReason: String(s.pendingDrawReason || '')
  };
}

function getNpcHandPotential(cards, lockSuit = null) {
  const hand = Array.isArray(cards) ? cards.filter(Boolean) : [];
  const numberCounts = new Map();
  const suitCounts = new Map(SUITS.map((suit) => [suit, 0]));
  const values = new Set();
  hand.forEach((card) => {
    roleNumberOptions(card).forEach((raw) => {
      const value = setRankFromNumber(raw);
      if (value > 0) values.add(value);
      numberCounts.set(value, (numberCounts.get(value) || 0) + 1);
    });
    suitsForCard(card, true).forEach((suit) => {
      if (suitCounts.has(suit)) suitCounts.set(suit, (suitCounts.get(suit) || 0) + 1);
    });
  });
  let roleCount = 0;
  let strongestRole = 0;
  if (hand.length >= 5) {
    comb(hand.map((_, index) => index), 5).forEach((pick) => {
      const role = evalRole(pick.map((index) => hand[index]), lockSuit || null);
      if (!role) return;
      roleCount += 1;
      strongestRole = Math.max(strongestRole, Number(role.strength) || 0);
    });
  }
  const pairPaths = Array.from(numberCounts.values()).reduce((total, count) => (
    total + (count >= 2 ? 1 : 0) + (count >= 3 ? 1 : 0)
  ), 0);
  const flushSeed = Math.max(0, ...suitCounts.values());
  const sortedValues = Array.from(values).sort((a, b) => a - b);
  let straightSeed = 0;
  for (let start = 1; start <= 11; start += 1) {
    let matches = 0;
    for (let value = start; value < start + 5; value += 1) {
      if (values.has(value) || (value === 1 && values.has(15))) matches += 1;
    }
    straightSeed = Math.max(straightSeed, matches);
  }
  const majorCount = hand.filter((card) => card?.kind === 'major').length;
  const worldSeed = hand.some((card) => card?.kind === 'major' && Number(card.number) === 21)
    ? Math.min(5, majorCount)
    : 0;
  const legalPathCount = hand.length + pairPaths + roleCount;
  const score = (roleCount * 92)
    + (strongestRole * 28)
    + (pairPaths * 22)
    + (Math.max(0, flushSeed - 2) * 14)
    + (Math.max(0, straightSeed - 2) * 16)
    + (worldSeed * 15)
    + (legalPathCount * 2);
  return {
    score,
    roleCount,
    strongestRole,
    pairPaths,
    flushSeed,
    straightSeed,
    worldSeed,
    legalPathCount
  };
}

function getNpcControlScore(play, observation, style) {
  if (play?.type !== 'set' || Number(play?.count || 0) > 3) return 0;
  const numbers = new Set((play.cardsHand || []).map((card) => idNum(card)));
  const nextSeat = (Number(observation.playerIndex) + 1) % Math.max(1, observation.handCounts.length);
  const opponentAtOne = observation.handCounts.some((count, index) => index !== observation.playerIndex && count === 1);
  const nextOpponentAtOne = observation.handCounts[nextSeat] === 1;
  let score = 0;
  if (numbers.has(5)) score += 190 + (Number(play.count || 1) * 35);
  if (numbers.has(8)) score += Number(play.count || 0) >= 2 ? 330 : 175;
  if (numbers.has(11) || (play.cardsHand || []).some((card) => card?.kind === 'major' && Number(card.number) === 20)) {
    score += 155;
  }
  if (numbers.has(14) && Number(play.count || 0) === 1) {
    const leadSuit = observation.trick?.cardsTable?.[0]
      ? suitsForCard(observation.trick.cardsTable[0], false)[0]
      : null;
    if (leadSuit && suitsForCard(play.cardsHand?.[0], false).includes(leadSuit)) score += 175;
  }
  if (opponentAtOne && score > 0) score += 210;
  if (nextOpponentAtOne && score > 0) score += 170;
  if (style === NPC_AI_STYLE.CAUTIOUS) score *= 1.16;
  if (style === NPC_AI_STYLE.AGGRESSIVE) score *= 0.88;
  return score;
}

function getNpcCombatEffectScore(playerIndex, play) {
  if (!areKingdomCombatEffectsEnabled() || !s?.players?.[playerIndex]) return 0;
  const character = s.players[playerIndex].character || {};
  const neutralPlayers = s.players.map(() => ({ hp: 100, maxHp: 100 }));
  const context = {
    actorIndex: playerIndex,
    playType: String(play?.type || ''),
    cards: Array.isArray(play?.cardsHand) ? play.cardsHand : [],
    character,
    players: neutralPlayers,
    enemy: { hp: 100, maxHp: 100 },
    effects: { enemy: {}, party: {}, players: s.players.map(() => ({})) },
    enemyAttackedSinceClear: false
  };
  const weapon = resolveTarotKingdomWeaponEffect(context);
  const resonance = resolveTarotKingdomResonance(context);
  return (Math.max(0, Number(weapon?.score) || 0) * 1.4)
    + (Math.max(0, Number(resonance?.score) || 0) * 1.8);
}

function scoreNpcPlay(playerIndex, play, observation, reserveContext = null) {
  const style = getNpcAiStyle(playerIndex);
  const playedIds = new Set((play?.cardsHand || []).map((card) => String(card?.id || '')).filter(Boolean));
  const remaining = observation.hand.filter((card) => !playedIds.has(String(card?.id || '')));
  const playedCount = Math.max(0, observation.hand.length - remaining.length);
  const worldRestoresOneCard = areKingdomMajorArcanaSpecialRulesEnabled()
    && isSingleMajorSetPlay(play, 21)
    && Number(observation.drawDeckCount || 0) > 0
    && remaining.length < getKingdomHandLimit();
  const effectivePlayedCount = Math.max(0, playedCount - (worldRestoresOneCard ? 1 : 0));
  if (remaining.length === 0) return { score: 1000000, immediateWin: true, remaining, potential: getNpcHandPotential([]) };

  const potential = getNpcHandPotential(remaining, observation.lock?.suit || null);
  const reserve = getNpcPlayReserveStats(play, reserveContext);
  const stats = getNpcPlayCardStats(play);
  const opponentAtOne = observation.handCounts.some((count, index) => index !== playerIndex && count === 1);
  const shedWeight = style === NPC_AI_STYLE.AGGRESSIVE ? 205 : (style === NPC_AI_STYLE.CAUTIOUS ? 125 : 165);
  const potentialWeight = style === NPC_AI_STYLE.CAUTIOUS ? 1.28 : (style === NPC_AI_STYLE.AGGRESSIVE ? 0.72 : 1);
  let score = effectivePlayedCount * shedWeight;
  score += potential.score * potentialWeight;
  score += getNpcControlScore(play, observation, style);
  score += getNpcCombatEffectScore(playerIndex, play);
  if (play?.type === 'role') score += 270 + ((Number(play?.role?.strength) || 0) * 32);
  if (opponentAtOne) {
    score += play?.type === 'role' ? 185 : 0;
    score += effectivePlayedCount >= 2 ? 80 : 0;
    score += Math.max(0, Number(play?.setPower ?? play?.number ?? 0)) * 3;
  }
  score -= reserve.preserveBias * (style === NPC_AI_STYLE.CAUTIOUS ? 2.2 : (style === NPC_AI_STYLE.AGGRESSIVE ? 0.72 : 1.35));
  score -= stats.majorCount * (style === NPC_AI_STYLE.AGGRESSIVE ? 12 : 30);
  score -= stats.aceCount * (style === NPC_AI_STYLE.AGGRESSIVE ? 8 : 22);
  if (play?.call) score -= style === NPC_AI_STYLE.AGGRESSIVE ? 8 : 26;
  score -= Math.max(0, stats.totalStrength) * 0.18;
  return { score, immediateWin: false, remaining, potential };
}

function getNpcPlayStableKey(play) {
  return `${play?.type || ''}:${(play?.cardsHand || []).map((card) => card?.id || '').sort().join(',')}:${play?.role?.key || ''}`;
}

function chooseNpcWeightedCandidate(scored, randomSource = kingdomNpcRandom) {
  if (!Array.isArray(scored) || !scored.length) return null;
  const ordered = scored.slice().sort((left, right) => (
    right.score - left.score || getNpcPlayStableKey(left.play).localeCompare(getNpcPlayStableKey(right.play))
  ));
  if (ordered[0]?.immediateWin) return ordered[0];
  const best = Number(ordered[0].score) || 0;
  const tolerance = Math.max(2, Math.abs(best) * 0.02);
  const finalists = ordered.filter((entry) => best - Number(entry.score || 0) <= tolerance);
  if (finalists.length <= 1) return finalists[0] || ordered[0];
  const floor = Math.min(...finalists.map((entry) => Number(entry.score) || 0));
  const weights = finalists.map((entry) => 1 + Math.max(0, Number(entry.score || 0) - floor));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const sample = Math.max(0, Math.min(0.999999, Number(randomSource?.()) || 0)) * total;
  let cursor = 0;
  for (let index = 0; index < finalists.length; index += 1) {
    cursor += weights[index];
    if (sample < cursor) return finalists[index];
  }
  return finalists[finalists.length - 1];
}

function npcDecide(pi, options = {}) {
  const aiStyle = getNpcAiStyle(pi);
  const p = s.players[pi], calls = callMoves(pi), sets = setMoves(pi), roles = roleMoves(pi);
  const reserveContext = createNpcReserveContext(pi, calls, roles, sets);
  const observation = createNpcObservation(pi);
  if (s.callOnly) {
    if (!calls.length) return { action: 'pass' };
    const scoredCalls = calls.map((play) => ({ play, ...scoreNpcPlay(pi, play, observation, reserveContext) }));
    const pickedCall = chooseNpcWeightedCandidate(scoredCalls, options.randomSource || kingdomNpcRandom);
    return pickedCall ? { action: 'play', play: pickedCall.play, score: pickedCall.score } : { action: 'pass' };
  }
  const all = [...calls, ...roles, ...sets];
  if (!all.length) return { action: 'pass' };
  const scored = all.map((play) => ({ play, ...scoreNpcPlay(pi, play, observation, reserveContext) }));
  const picked = chooseNpcWeightedCandidate(scored, options.randomSource || kingdomNpcRandom);
  return picked
    ? { action: 'play', play: picked.play, score: picked.score }
    : { action: 'pass' };
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

  if (areKingdomMajorArcanaSpecialRulesEnabled()) {
    resolveEmptyFieldLeader(pi);
    return true;
  }
  if (p.hand.length < getKingdomHandLimit() && s.drawDeck.length > 0) {
    traceKingdomFlow('recoverNpcNoTrickState.drawChoice', `player=${pi}`);
    drawChoiceStart(pi);
    return true;
  }
  return false;
}

function chooseNpcJudgmentOption(playerIndex, randomSource = kingdomNpcRandom) {
  const observation = createNpcObservation(playerIndex);
  const scoredOptions = judgmentOptions().map((entry) => {
    const potential = getNpcHandPotential(
      [...(observation?.hand || []), entry.card],
      observation?.lock?.suit || null
    );
    return {
      ...entry,
      score: potential.score + (potential.legalPathCount * 5) - (entry.card?.kind === 'major' ? 20 : 0)
    };
  }).sort((left, right) => (
    right.score - left.score || String(left.card?.id || '').localeCompare(String(right.card?.id || ''))
  ));
  if (!scoredOptions.length) return null;
  const bestScore = Number(scoredOptions[0]?.score) || 0;
  const bestCandidates = scoredOptions.filter((entry) => (
    bestScore - Number(entry.score || 0) <= Math.max(2, Math.abs(bestScore) * 0.02)
  ));
  if (bestCandidates.length <= 1) return bestCandidates[0] || scoredOptions[0];
  const sample = Math.max(0, Math.min(0.999999, Number(randomSource?.()) || 0));
  return bestCandidates[Math.min(bestCandidates.length - 1, Math.floor(sample * bestCandidates.length))];
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
    if (!isKingdomBattlePlayerConscious(dpi)) {
      s.pendingDraw = null;
      s.pendingDrawReason = null;
      s.phase = 'turn';
      s.turn = dpi;
      passAction(dpi);
      return;
    }
    const plan = npcChooseDrawPlan(dpi);
    traceKingdomFlow('npcAct.drawPhase', `player=${dpi} plan=${plan} reason=${s.pendingDrawReason || 'normal'}`);
    if (plan === 'skip') {
      skipDrawChoice(dpi, s.pendingDrawReason === 'clear' ? 'クリア後は攻め継続' : '戦術');
      return;
    }
    applyDrawChoice();
    return;
  }
  if (s.phase === 'judgment' && s.pendingJudgment != null) {
    const judgmentPlayer = s.pendingJudgment;
    if (!isKingdomBattlePlayerConscious(judgmentPlayer)) {
      s.pendingJudgment = null;
      s.phase = 'turn';
      s.turn = judgmentPlayer;
      passAction(judgmentPlayer);
      return;
    }
    traceKingdomFlow('npcAct.judgmentPhase', `player=${judgmentPlayer}`);
    const best = chooseNpcJudgmentOption(judgmentPlayer, kingdomNpcRandom);
    if (best && s.players[judgmentPlayer].hand.length < getKingdomHandLimit()) {
      applyJudgmentPick(best.owner, best.cardIndex);
    } else {
      skipJudgmentPick();
    }
    return;
  }
  if (s.phase !== 'turn') { traceKingdomFlow('npcAct.abort', 'reason=notTurnPhase'); return; }
  const pi = s.turn, p = s.players[pi];
  if (!p || !isNpcPlayer(pi)) { traceKingdomFlow('npcAct.abort', `reason=invalidOrHuman turn=${pi}`); return; }
  if (!isKingdomBattlePlayerConscious(pi)) {
    passAction(pi);
    return;
  }
  if (!s.trick && recoverNpcNoTrickState(pi)) { traceKingdomFlow('npcAct.recoverNoTrick', `player=${pi}`); return; }
  if (!s.trick) {
    const leadSetMoves = setMoves(pi);
    const leadRoleMoves = roleMoves(pi);
    if (!leadSetMoves.length && !leadRoleMoves.length) {
      if (areKingdomMajorArcanaSpecialRulesEnabled()) {
        resolveEmptyFieldLeader(pi);
        return;
      }
      if (p.hand.length < getKingdomHandLimit() && s.drawDeck.length > 0) {
        log(`${pName(pi)}: 親ターンで有効手なし→ドローへ`);
        drawChoiceStart(pi);
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
  if (s.phase === 'turn' && !isKingdomBattlePlayerConscious(s.turn)) {
    const skippedPlayer = s.turn;
    scheduleNpcTimer(120, () => passAction(skippedPlayer));
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
  if (opt.playable) el.classList.add('is-playable');
  if (opt.selected) el.classList.add('is-selected');
  if (opt.resonant) el.classList.add('is-resonant');
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
  if (opt.resonant) {
    const resonance = document.createElement('span');
    resonance.className = 'tarot-card-resonance-mark';
    resonance.textContent = '✦';
    resonance.setAttribute('aria-label', '装備カード共鳴');
    el.appendChild(resonance);
  }
  if (opt.onClick) el.addEventListener('click', opt.onClick);
  return el;
}

function isKingdomMatchDoneState(state = s) {
  if (!state) return false;
  const terminalSettlement = state.roundSettlement;
  if (terminalSettlement?.matchDone) return true;
  if (
    terminalSettlement
    && !state.awaitRoundConfirm
    && !state.roundActive
    && String(state.phase || '') === 'roundEnd'
    && Number(state.handNo || 0) >= TOTAL_HANDS - 1
  ) {
    return true;
  }
  if (String(state.phase || '') === 'done') return true;
  if (state.champion != null) return true;
  return Number(state.handNo || 0) >= TOTAL_HANDS;
}

function normalizeKingdomTerminalState(state = s) {
  if (!state) return false;
  const isBattleDefeat = state?.battle?.outcome === 'defeat';
  const hasTerminalMarker =
    !!state.roundSettlement?.matchDone ||
    (
      !!state.roundSettlement
      && !state.awaitRoundConfirm
      && !state.roundActive
      && String(state.phase || '') === 'roundEnd'
      && Number(state.handNo || 0) >= TOTAL_HANDS - 1
    ) ||
    String(state.phase || '') === 'done' ||
    state.champion != null ||
    Number(state.handNo || 0) >= TOTAL_HANDS;
  if (!hasTerminalMarker) return false;

  let changed = false;
  if (String(state.phase || '') !== 'done') {
    state.phase = 'done';
    changed = true;
  }
  if (state.roundActive) {
    state.roundActive = false;
    changed = true;
  }
  if (state.awaitRoundConfirm) {
    state.awaitRoundConfirm = false;
    changed = true;
  }
  if (state.pendingDraw != null) {
    state.pendingDraw = null;
    changed = true;
  }
  if (state.pendingJudgment != null) {
    state.pendingJudgment = null;
    changed = true;
  }
  if (state.selected?.size) {
    state.selected.clear();
    changed = true;
  }
  if (isBattleDefeat && state.champion != null) {
    state.champion = null;
    changed = true;
  }
  if (!isBattleDefeat && state.champion == null && Array.isArray(state.players) && state.players.length > 0) {
    let top = 0;
    state.players.forEach((player, index) => {
      if ((Number(player?.chips) || 0) > (Number(state.players[top]?.chips) || 0)) top = index;
    });
    state.champion = top;
    changed = true;
  }
  if (!String(state.message || '').trim() && isBattleDefeat) {
    state.message = '全員が戦闘不能になりました。モンスター戦敗北。';
    changed = true;
  } else if (!String(state.message || '').trim() && state.champion != null && state.players?.[state.champion]) {
    const championName = String(state.players[state.champion].name || `NPC${Number(state.champion) + 1}`);
    const championChips = Math.max(0, Number(state.players[state.champion].chips) || 0);
    state.message = `ゲーム終了！ 優勝: ${championName} (${championChips}チップ)`;
    changed = true;
  }
  return changed;
}

function buildKingdomExplorationResult(status = 'completed') {
  const localSeat = getLocalPlayerIndex();
  const monster = getKingdomMonsterConfig(String(s?.battle?.enemy?.id || kingdomExplorationMonsterId));
  const defeated = s?.battle?.outcome === 'defeat';
  const stage = normalizeKingdomExplorationStageState(s?.stage);
  const victoryEvent = (Array.isArray(s?.battle?.events) ? s.battle.events : [])
    .slice()
    .reverse()
    .find((event) => event?.type === 'victory' && event?.finisher === true);
  const finisherIndex = Number(victoryEvent?.actorIndex);
  const finisherPlayer = Number.isInteger(finisherIndex) ? s?.players?.[finisherIndex] : null;
  const mode = kingdomExplorationSession?.context?.mode === 'online' ? 'online' : 'offline';
  const finishers = stage
    ? stage.finishers.map((entry) => ({ ...entry, mode }))
    : [];
  const finalFinisher = stage
    ? (finishers.find((entry) => entry.roundNo === TOTAL_HANDS) || null)
    : (
      status === 'completed' && !defeated && victoryEvent && finisherPlayer
        ? {
            roundNo: TOTAL_HANDS,
            playerIndex: finisherIndex,
            playFabId: String(finisherPlayer.playFabId || ''),
            isNpc: finisherPlayer.isNpc === true,
            monsterId: String(monster?.id || ''),
            mode
          }
        : null
    );
  const standings = (Array.isArray(s?.players) ? s.players : []).map((player, playerIndex) => ({
    playerIndex,
    playFabId: String(player?.playFabId || ''),
    displayName: String(player?.name || `P${playerIndex + 1}`),
    isNpc: player?.isNpc === true,
    chips: Math.floor(Number(player?.chips) || 0)
  }));
  return {
    status,
    completed: status === 'completed',
    outcome: defeated ? 'defeat' : (status === 'completed' ? 'victory' : status),
    championIndex: s?.champion != null && Number.isInteger(Number(s.champion)) ? Number(s.champion) : null,
    localPlayerIndex: localSeat,
    monsterId: String(monster?.id || kingdomExplorationMonsterId || ''),
    monsterName: String(monster?.name || s?.battle?.enemy?.name || ''),
    isBoss: monster?.isBoss === true,
    battlefieldId: String(s?.battle?.battlefield?.id || ''),
    explorationId: String(kingdomExplorationSession?.context?.explorationId || ''),
    destinationId: String(kingdomExplorationSession?.context?.destinationId || ''),
    destinationName: String(kingdomExplorationSession?.context?.destinationName || ''),
    stageNo: stage?.stageNo || Number(kingdomExplorationSession?.context?.stageNo) || null,
    stageId: String(stage?.stageId || kingdomExplorationSession?.context?.stageId || ''),
    finishers,
    standings,
    mode,
    finisher: finalFinisher
  };
}

function settleKingdomExplorationSession(status = 'completed') {
  const session = kingdomExplorationSession;
  if (!session) return null;
  const result = buildKingdomExplorationResult(status);
  kingdomExplorationSession = null;
  kingdomExplorationMonsterId = '';
  document.body?.classList.remove('tarot-kingdom-exploration-session');
  document.body?.removeAttribute('data-tarot-kingdom-exploration-id');
  document.body?.removeAttribute('data-tarot-kingdom-destination-id');
  document.body?.removeAttribute('data-tarot-kingdom-battlefield-id');
  document.body?.removeAttribute('data-tarot-kingdom-atmosphere-tone');
  document.body?.removeAttribute('data-tarot-kingdom-entry-mode');
  window.dispatchEvent(new CustomEvent('tarot-kingdom:exploration-complete', { detail: result }));
  session.resolve(result);
  return result;
}

function getKingdomSettlementActionState(state = s) {
  if (!state) return null;
  const isMatchDone = isKingdomMatchDoneState(state);
  if (isMatchDone) {
    if (kingdomExplorationSession) {
      return {
        kind: 'explorationComplete',
        label: '探索結果へ',
        disabled: false
      };
    }
    let disabled = false;
    let label = 'もう一度ゲームを始める';
    if (kingdomStartMode === 'online') {
      if (!isNetModeActive()) {
        label = 'オンライン接続をやり直す';
      } else if (!tkNet.isHost) {
        label = 'ホストの再開を待機中';
        disabled = true;
      } else {
        label = '同じメンバーでもう一度ゲームを始める';
      }
    }
    return {
      kind: 'restart',
      label,
      disabled
    };
  }

  const canConfirm = !!state.awaitRoundConfirm && !state.roundActive && Number(state.handNo || 0) < TOTAL_HANDS;
  if (!canConfirm) return null;
  return {
    kind: 'confirm',
    label: '確認して次の局へ',
    disabled: false
  };
}

function clearKingdomMonsterFrameTimer() {
  kingdomMonsterFrameGeneration += 1;
  if (kingdomMonsterFrameTimer) {
    clearInterval(kingdomMonsterFrameTimer);
    kingdomMonsterFrameTimer = null;
  }
}

function clearKingdomPetAnimationTimers() {
  kingdomPetAnimationTimers.forEach((timerId) => clearInterval(timerId));
  kingdomPetAnimationTimers.clear();
  if (!ui.battleParty) return;
  ui.battleParty.querySelectorAll('.tarot-kingdom-battle-pet-sprite').forEach((sprite) => {
    delete sprite.dataset.animationKey;
  });
}

function clearKingdomEnemyFinisherTimer() {
  if (kingdomEnemyFinisherTimer) {
    clearTimeout(kingdomEnemyFinisherTimer);
    kingdomEnemyFinisherTimer = null;
  }
  kingdomEnemyFinisherTimerKey = '';
}

function resetKingdomBattleAvatarVisuals(options = {}) {
  const avatars = ui.battleParty
    ? Array.from(ui.battleParty.querySelectorAll('.tarot-kingdom-battle-player-avatar'))
    : [];
  avatars.forEach((avatar) => resetCombatAvatarState(avatar, { resumeIdle: false }));
  kingdomBattleAvatarEventKey = '';
  kingdomBattleHurtEventKey = '';
  kingdomBattleDamageEventKey = '';
  clearKingdomPetAnimationTimers();
  clearKingdomBattlePhaseTimers();
  if (options.remove === true && ui.battleParty) ui.battleParty.innerHTML = '';
}

function setKingdomPetFrame(node, monster, animation, frameIndex) {
  if (!node || !monster || !animation) return;
  const width = Math.max(1, Number(monster.frameWidth) || 48);
  const height = Math.max(1, Number(monster.frameHeight) || 48);
  const columns = Math.max(1, Number(animation.columns) || 1);
  const frameCount = Math.max(1, Number(animation.frameCount) || 1);
  const rows = Math.max(1, Math.ceil(frameCount / columns));
  const frame = Math.max(0, Math.min(frameCount - 1, Math.floor(Number(frameIndex) || 0)));
  const col = frame % columns;
  const row = Math.floor(frame / columns);
  const scale = KINGDOM_PET_DISPLAY_SCALE;
  const renderedWidth = width * scale;
  const idleAnchor = monster.idleAnchor && typeof monster.idleAnchor === 'object'
    ? monster.idleAnchor
    : {};
  const anchorMode = idleAnchor.mode === 'air' ? 'air' : 'ground';
  node.style.width = `${width}px`;
  node.style.height = `${height}px`;
  node.style.backgroundImage = `url('${animation.src}')`;
  node.style.backgroundSize = `${columns * width}px ${rows * height}px`;
  node.style.backgroundPosition = `-${col * width}px -${row * height}px`;
  node.style.backgroundRepeat = 'no-repeat';
  node.style.imageRendering = String(monster.renderMode || 'pixel') === 'illustration' ? 'auto' : 'pixelated';
  node.style.setProperty('--tarot-kingdom-pet-scale', String(scale));
  node.style.setProperty('--tarot-kingdom-pet-scale-x', monster.flipX === true ? '-1' : '1');
  node.style.setProperty('--tarot-kingdom-pet-scale-y', monster.flipY === true ? '-1' : '1');
  const configuredOffsetY = Object.prototype.hasOwnProperty.call(
    KINGDOM_PET_OFFSET_Y_BY_MONSTER_ID,
    String(monster.id || '')
  )
    ? KINGDOM_PET_OFFSET_Y_BY_MONSTER_ID[String(monster.id || '')]
    : Number(monster.battleOffsetY) || 0;
  node.style.setProperty(
    '--tarot-kingdom-pet-offset-y',
    `${Math.max(-24, Math.min(24, configuredOffsetY))}px`
  );
  node.dataset.monsterId = String(monster.id || '');
  node.dataset.monsterAnchor = anchorMode;
  const host = node.closest('.tarot-kingdom-battle-player-avatar');
  if (host) {
    host.dataset.monsterAnchor = anchorMode;
    host.style.setProperty('--tarot-kingdom-pet-shadow-bottom', anchorMode === 'air' ? '-8px' : '1px');
    host.style.setProperty('--tarot-kingdom-pet-shadow-width', `${Math.max(36, Math.min(68, Math.round(renderedWidth * 0.72)))}px`);
  }
}

function playKingdomPetAnimation(node, monster, animationName, generationKey = '') {
  const animation = monster?.animations?.[animationName] || monster?.animations?.idle;
  if (!node || !monster || !animation) return;
  const key = `${monster.id}:${animationName}:${generationKey}`;
  if (node.dataset.animationKey === key) return;
  const oldTimer = kingdomPetAnimationTimers.get(node);
  if (oldTimer) clearInterval(oldTimer);
  kingdomPetAnimationTimers.delete(node);
  node.dataset.animationKey = key;
  node.dataset.animationName = animationName;
  const frameCount = Math.max(1, Number(animation.frameCount) || 1);
  const intervalMs = Math.max(50, Math.round(1000 / Math.max(1, Number(animation.fps) || 10)));
  let frame = 0;
  setKingdomPetFrame(node, monster, animation, frame);
  if (frameCount <= 1 || prefersKingdomReducedMotion()) {
    if (!animation.loop) setKingdomPetFrame(node, monster, animation, frameCount - 1);
    return;
  }
  const timerId = setInterval(() => {
    if (!node.isConnected || node.dataset.animationKey !== key) {
      clearInterval(timerId);
      kingdomPetAnimationTimers.delete(node);
      return;
    }
    frame += 1;
    if (frame >= frameCount) {
      if (animation.loop) {
        frame = 0;
      } else {
        frame = frameCount - 1;
        clearInterval(timerId);
        kingdomPetAnimationTimers.delete(node);
      }
    }
    setKingdomPetFrame(node, monster, animation, frame);
  }, intervalMs);
  kingdomPetAnimationTimers.set(node, timerId);
}

function setKingdomMonsterFrame(node, monster, animation, frameIndex) {
  if (!node || !monster || !animation) return;
  const width = Math.max(1, Number(monster.frameWidth) || 81);
  const height = Math.max(1, Number(monster.frameHeight) || 84);
  const columns = Math.max(1, Number(animation.columns) || 1);
  const frameCount = Math.max(1, Number(animation.frameCount) || 1);
  const rows = Math.max(1, Math.ceil(frameCount / columns));
  const safeFrame = Math.max(0, Math.min(frameCount - 1, Number(frameIndex) || 0));
  const col = safeFrame % columns;
  const row = Math.floor(safeFrame / columns);
  node.style.width = `${width}px`;
  node.style.height = `${height}px`;
  node.style.backgroundImage = `url('${animation.src}')`;
  node.style.backgroundSize = `${columns * width}px ${rows * height}px`;
  node.style.backgroundPosition = `-${col * width}px -${row * height}px`;
  node.style.backgroundRepeat = 'no-repeat';
  const idleAnchor = monster.idleAnchor && typeof monster.idleAnchor === 'object'
    ? monster.idleAnchor
    : {};
  const anchorX = Math.max(0, Math.min(width, Number(idleAnchor.x) || (width / 2)));
  const anchorY = Math.max(0, Math.min(height, Number(idleAnchor.y) || height));
  node.style.setProperty('--tarot-kingdom-enemy-frame-height', `${height}px`);
  node.style.setProperty('--tarot-kingdom-enemy-anchor-x', `${anchorX}px`);
  node.style.setProperty('--tarot-kingdom-enemy-anchor-y', `${anchorY}px`);
  const battleOffsetY = Math.max(-height, Math.min(height, Number(monster.battleOffsetY) || 0));
  const flipX = monster.flipX === true;
  const flipY = monster.flipY === true;
  node.style.setProperty('--tarot-kingdom-enemy-offset-y', `${battleOffsetY}px`);
  node.style.setProperty('--tarot-kingdom-enemy-facing-scale-x', flipX ? '1' : '-1');
  node.style.setProperty('--tarot-kingdom-enemy-scale-y', flipY ? '-1' : '1');
  node.style.setProperty(
    '--tarot-kingdom-enemy-origin-y',
    `${flipY ? (height / 2) : anchorY}px`
  );
  node.dataset.monsterFlipX = flipX ? 'true' : 'false';
  node.dataset.monsterFlipY = flipY ? 'true' : 'false';
  const anchorMode = idleAnchor.mode === 'air' ? 'air' : 'ground';
  node.dataset.monsterAnchor = anchorMode;
  const displayWidth = Number(monster.displayWidth);
  if (Number.isFinite(displayWidth) && displayWidth > 0) {
    node.style.setProperty('--tarot-kingdom-enemy-scale', String(displayWidth / width));
  } else {
    node.style.removeProperty('--tarot-kingdom-enemy-scale');
  }
  const shadowHost = node.parentElement?.classList.contains('tarot-kingdom-battle-enemy-visual')
    ? node.parentElement
    : null;
  if (shadowHost) {
    const renderedWidth = Number.isFinite(displayWidth) && displayWidth > 0
      ? displayWidth
      : width * Math.max(1, Number(monster.pixelScale) || 2);
    const shadowWidth = Math.max(
      anchorMode === 'air' ? 46 : 54,
      Math.min(anchorMode === 'air' ? 150 : 196, Math.round(renderedWidth * (anchorMode === 'air' ? 0.55 : 0.72)))
    );
    const shadowHeight = Math.max(9, Math.min(24, Math.round(shadowWidth * 0.14)));
    shadowHost.dataset.monsterAnchor = anchorMode;
    shadowHost.style.setProperty('--tarot-kingdom-enemy-shadow-width', `${shadowWidth}px`);
    shadowHost.style.setProperty('--tarot-kingdom-enemy-shadow-height', `${shadowHeight}px`);
    shadowHost.style.setProperty('--tarot-kingdom-enemy-shadow-bottom', anchorMode === 'air' ? '-12px' : '-2px');
    shadowHost.style.setProperty('--tarot-kingdom-enemy-shadow-opacity', anchorMode === 'air' ? '0.46' : '0.76');
    shadowHost.style.setProperty('--tarot-kingdom-enemy-shadow-blur', anchorMode === 'air' ? '4px' : '2px');
  }
  const renderMode = String(monster.renderMode || 'pixel');
  node.dataset.monsterRender = renderMode;
  node.style.imageRendering = renderMode === 'illustration' ? 'auto' : '';
}

function playKingdomMonsterAnimation(animationName, generationKey = '', options = {}) {
  const node = ui.battleEnemySprite;
  const enemyId = String(s?.battle?.enemy?.id || '');
  const monster = getKingdomMonsterConfig(enemyId);
  const animation = monster?.animations?.[animationName] || monster?.animations?.idle;
  if (!node || !monster || !animation) return;
  const playbackRate = Math.max(0.1, Math.min(2, Number(options.playbackRate) || 1));
  const key = `${monster.id}:${animationName}:${generationKey}:rate-${playbackRate}`;
  if (kingdomMonsterAnimationKey === key) return;
  kingdomMonsterAnimationKey = key;
  clearKingdomMonsterFrameTimer();
  const frameGeneration = kingdomMonsterFrameGeneration;
  const frameCount = Math.max(1, Number(animation.frameCount) || 1);
  const intervalMs = Math.max(
    32,
    Math.round(1000 / (Math.max(1, Number(animation.fps) || 12) * playbackRate))
  );
  const elapsedMs = Math.max(0, Number(options.elapsedMs) || 0);
  let frame = animation.loop
    ? Math.floor(elapsedMs / intervalMs) % frameCount
    : Math.min(frameCount - 1, Math.floor(elapsedMs / intervalMs));
  setKingdomMonsterFrame(node, monster, animation, frame);
  if (frameCount <= 1) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true) {
    setKingdomMonsterFrame(node, monster, animation, animation.loop ? 0 : frameCount - 1);
    return;
  }
  if (!animation.loop && frame >= frameCount - 1) return;
  const frameTimer = setInterval(() => {
    const activeEnemyId = String(s?.battle?.enemy?.id || '');
    if (
      frameGeneration !== kingdomMonsterFrameGeneration
      || node !== ui.battleEnemySprite
      || monster.id !== activeEnemyId
    ) {
      clearInterval(frameTimer);
      if (kingdomMonsterFrameTimer === frameTimer) kingdomMonsterFrameTimer = null;
      return;
    }
    frame += 1;
    if (frame >= frameCount) {
      if (animation.loop) {
        frame = 0;
      } else {
        frame = frameCount - 1;
        clearInterval(frameTimer);
        if (kingdomMonsterFrameTimer === frameTimer) kingdomMonsterFrameTimer = null;
      }
    }
    setKingdomMonsterFrame(node, monster, animation, frame);
  }, intervalMs);
  kingdomMonsterFrameTimer = frameTimer;
}

function prefersKingdomReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

function clearKingdomBattlePhaseTimers() {
  kingdomBattlePhaseTimers.forEach((timerId) => clearTimeout(timerId));
  kingdomBattlePhaseTimers.clear();
  kingdomBattlePhaseTimerKey = '';
}

function getKingdomBattleTimelineForEvent(event) {
  const transition = s?.transition;
  const eventTimeline = transition?.eventTimelines?.[String(event?.seq || '')];
  const timeline = eventTimeline || transition?.timeline;
  if (!event || !timeline || typeof timeline !== 'object') return null;
  const eventSeqs = Array.isArray(transition.eventSeqs) ? transition.eventSeqs.map(Number) : [];
  if (!eventSeqs.includes(Number(event.seq))) return null;
  return normalizeKingdomTransitionTimeline(
    timeline,
    Number(timeline.startedAt) || transition.startedAt,
    Number(timeline.endsAt) || transition.endsAt
  );
}

function getKingdomBattleTimelinePhase(timeline, now = Date.now()) {
  if (!timeline) return 'idle';
  if (prefersKingdomReducedMotion()) return 'final';
  if (now < Number(timeline.impactAt || 0)) return 'charge';
  if (now < Number(timeline.hpRevealAt || 0)) return 'hit-stop';
  if (now < Number(timeline.hpTweenEndsAt || 0)) return 'damage';
  if (now < Number(timeline.effectAt || timeline.endsAt || 0)) return 'recover';
  if (now < Number(timeline.endsAt || 0)) return 'effect';
  return 'final';
}

function scheduleKingdomBattleTimelineRenders(event, timeline) {
  if (!event || !timeline) {
    clearKingdomBattlePhaseTimers();
    return;
  }
  const key = `${event.seq}:${timeline.version}:${timeline.impactAt}:${timeline.hpRevealAt}:${timeline.hpTweenEndsAt}:${timeline.endsAt}`;
  if (kingdomBattlePhaseTimerKey === key) return;
  clearKingdomBattlePhaseTimers();
  kingdomBattlePhaseTimerKey = key;
  if (prefersKingdomReducedMotion()) return;
  const now = Date.now();
  const boundaries = [timeline.motionAt, timeline.impactAt, timeline.hpRevealAt, timeline.hpTweenEndsAt, timeline.effectAt, timeline.endsAt];
  for (let tick = Number(timeline.hpRevealAt || 0) + 32; tick < Number(timeline.hpTweenEndsAt || 0); tick += 32) {
    boundaries.push(tick);
  }
  boundaries.forEach((boundary) => {
    const waitMs = Math.max(0, Number(boundary || 0) - now);
    if (waitMs <= 0) return;
    const timerId = setTimeout(() => {
      kingdomBattlePhaseTimers.delete(timerId);
      renderKingdomBattleStage();
    }, Math.min(2147483647, waitMs + 8));
    kingdomBattlePhaseTimers.add(timerId);
  });
}

function interpolateKingdomBattleHp(hpBefore, hpAfter, timeline, now = Date.now()) {
  const after = Math.max(0, Number(hpAfter) || 0);
  if (!timeline || prefersKingdomReducedMotion() || now >= Number(timeline.hpTweenEndsAt || 0)) return after;
  const before = Math.max(after, Number(hpBefore) || 0);
  if (now < Number(timeline.hpRevealAt || 0)) return before;
  const duration = Math.max(1, Number(timeline.hpTweenEndsAt || 0) - Number(timeline.hpRevealAt || 0));
  const ratio = Math.max(0, Math.min(1, (now - Number(timeline.hpRevealAt || 0)) / duration));
  return Math.max(after, Math.round(before + ((after - before) * ratio)));
}

function getKingdomEnemyVisualHp(logicalHp, maxHp, event, eventIsActive, timeline) {
  if (!eventIsActive || !timeline || !['attack', 'skill', 'enemy-self', 'enemy-status'].includes(String(event?.type || ''))) {
    return logicalHp;
  }
  const before = Number(event.hpBefore ?? event.enemyHpBefore);
  const after = Number(event.hpAfter ?? event.enemyHp);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return logicalHp;
  return Math.max(0, Math.min(maxHp, interpolateKingdomBattleHp(before, after, timeline)));
}

function getKingdomBattleEventDuration(event) {
  const type = String(event?.type || '');
  if (type === 'skill') return getKingdomSkillAttackDuration(event?.effectCount);
  if (type === 'attack') return KINGDOM_NORMAL_ATTACK_MS;
  if (type === 'enemy-area') return 720;
  if (type === 'enemy-single' || type === 'enemy-self') return 540;
  if (type === 'enemy-status') return 420;
  if (type === 'victory' || type === 'defeat') return 1200;
  return 0;
}

function getKingdomBattleFeedClass(type) {
  const key = String(type || 'info');
  if (key === 'skill') return 'is-skill';
  if (key === 'attack') return 'is-attack';
  if (key === 'enemy-single' || key === 'enemy-area' || key === 'enemy-self' || key === 'enemy-status') return 'is-enemy';
  if (key === 'victory') return 'is-victory';
  if (key === 'defeat') return 'is-defeat';
  return 'is-info';
}

const KINGDOM_STATUS_LABEL = Object.freeze({
  burn: '火傷', wet: '水浸し', fear: '恐怖', confusion: '混乱', poison: '毒', paralysis: '攻撃不能',
  blind: '暗闇', weaken: '弱体', vulnerable: '脆弱', break: '崩し', guard: '防御', areaGuard: '全体防御',
  cover: '身代わり', summonGuard: '海神障壁', counter: '反撃', evasion: '回避', nextAttackUp: '攻撃強化', nextEffectUp: '効果強化',
  nextWandUp: 'ワンド強化', nextEffectFlat: '威力強化', statusChanceUp: '付与強化', petrified: '石化', areaSeal: '全体封印'
});

function createKingdomStatusIcon(statusKey) {
  const normalizedKey = statusKey === 'petrified'
    ? 'paralysis'
    : (['areaSeal', 'summonGuard'].includes(statusKey) ? 'guard' : statusKey);
  const index = Number(TAROT_KINGDOM_STATUS_ICON_INDEX[normalizedKey]);
  if (!Number.isFinite(index)) return null;
  const col = index % 16;
  const row = Math.floor(index / 16);
  const icon = document.createElement('span');
  icon.className = 'melee-feedback-icon tarot-kingdom-status-icon';
  icon.dataset.statusKey = statusKey;
  icon.style.setProperty('--icon-col-pos', `${(col / 15) * 100}%`);
  icon.style.setProperty('--icon-row-pos', `${(row / 63) * 100}%`);
  icon.setAttribute('role', 'img');
  icon.setAttribute('aria-label', KINGDOM_STATUS_LABEL[statusKey] || statusKey);
  icon.title = KINGDOM_STATUS_LABEL[statusKey] || statusKey;
  return icon;
}

function renderKingdomStatusTray(container, bucket = {}, extraKeys = []) {
  if (!container) return;
  let tray = container.querySelector(':scope > .tarot-kingdom-status-tray');
  if (!tray) {
    tray = document.createElement('div');
    tray.className = 'tarot-kingdom-status-tray';
    container.appendChild(tray);
  }
  const keys = [...Object.keys(bucket || {}), ...(Array.isArray(extraKeys) ? extraKeys : [])]
    .filter((key, index, all) => all.indexOf(key) === index && Number.isFinite(Number(
      TAROT_KINGDOM_STATUS_ICON_INDEX[key === 'petrified'
        ? 'paralysis'
        : (['areaSeal', 'summonGuard'].includes(key) ? 'guard' : key)]
    )));
  const renderKey = keys.join('|');
  tray.classList.toggle('is-empty', keys.length === 0);
  if (tray.dataset.renderKey === renderKey) return;
  tray.dataset.renderKey = renderKey;
  tray.innerHTML = '';
  keys.forEach((key) => {
    const icon = createKingdomStatusIcon(key);
    if (icon) tray.appendChild(icon);
  });
}

function ensureKingdomBattlePlayerRow(playerIndex) {
  if (!ui.battleParty) return null;
  let row = ui.battleParty.querySelector(`[data-player-index="${playerIndex}"]`);
  if (row) return row;
  row = document.createElement('div');
  row.className = 'tarot-kingdom-battle-player';
  row.dataset.playerIndex = String(playerIndex);

  const avatar = document.createElement('div');
  avatar.id = `tarotKingdomBattleAvatar-${playerIndex}`;
  avatar.className = 'tarot-kingdom-battle-player-avatar avatar-combat-actor';
  avatar.dataset.facing = 'right';
  avatar.dataset.avatarIdle = 'true';
  avatar.setAttribute('aria-hidden', 'true');

  const info = document.createElement('div');
  info.className = 'tarot-kingdom-battle-player-info';
  const header = document.createElement('div');
  header.className = 'tarot-kingdom-battle-player-header';
  const name = document.createElement('div');
  name.className = 'tarot-kingdom-battle-player-name';
  const rank = document.createElement('div');
  rank.className = 'tarot-kingdom-battle-player-rank';
  header.appendChild(name);
  header.appendChild(rank);

  const hpWrap = document.createElement('div');
  hpWrap.className = 'tarot-kingdom-battle-player-hp';
  const hpTrack = document.createElement('div');
  hpTrack.className = 'tarot-kingdom-battle-player-hp-track';
  hpTrack.setAttribute('role', 'progressbar');
  hpTrack.setAttribute('aria-valuemin', '0');
  const hpFill = document.createElement('div');
  hpFill.className = 'tarot-kingdom-battle-player-hp-fill';
  hpTrack.appendChild(hpFill);
  hpWrap.appendChild(hpTrack);

  const handCount = document.createElement('div');
  handCount.className = 'tarot-kingdom-battle-player-hand-count';
  info.appendChild(header);
  info.appendChild(hpWrap);
  info.appendChild(handCount);
  row.appendChild(avatar);
  row.appendChild(info);
  ui.battleParty.appendChild(row);
  return row;
}

function playKingdomBattleAvatarEvent(event, eventIsActive, eventKey) {
  if (!event || !eventIsActive) return;
  const type = String(event.type || '');
  if (type === 'attack' || type === 'skill') {
    const timeline = getKingdomBattleTimelineForEvent(event);
    if (timeline && Date.now() + 8 < Number(timeline.motionAt || timeline.startedAt || 0)) return;
    if (kingdomBattleAvatarEventKey === eventKey) return;
    kingdomBattleAvatarEventKey = eventKey;
    if (timeline && Date.now() >= Number(timeline.impactAt || 0)) return;
    const actorIndex = Number(event.actorIndex);
    const avatar = document.getElementById(`tarotKingdomBattleAvatar-${actorIndex}`);
    if (s?.players?.[actorIndex]?.isPet) return;
    const weaponType = s?.players?.[actorIndex]?.character?.combat?.weaponType || 'sword';
    playCombatAvatarAttack(avatar, weaponType, { direction: 'left' }).catch(() => {});
    return;
  }
  if (type === 'enemy-single' || type === 'enemy-area') {
    const timeline = getKingdomBattleTimelineForEvent(event);
    const phase = getKingdomBattleTimelinePhase(timeline);
    if (timeline && !prefersKingdomReducedMotion() && !['damage', 'recover'].includes(phase)) return;
    if (kingdomBattleHurtEventKey === eventKey) return;
    kingdomBattleHurtEventKey = eventKey;
    const targets = Array.isArray(event.targetIndexes) ? event.targetIndexes : [];
    targets.forEach((targetIndex) => {
      if (s?.players?.[Number(targetIndex)]?.isPet) return;
      const avatar = document.getElementById(`tarotKingdomBattleAvatar-${Number(targetIndex)}`);
      flashCombatAvatarHurt(avatar, {
        duration: type === 'enemy-area' ? 420 : 300,
        allowDefeated: true
      });
    });
  }
}

function getKingdomBattleVisualHp(playerIndex, logicalHp, maxHp, activeEvent, eventIsActive) {
  const timeline = getKingdomBattleTimelineForEvent(activeEvent);
  const healingEffects = Array.isArray(activeEvent?.effects)
    ? activeEvent.effects.filter((entry) => (
        Number(entry?.targetIndex) === playerIndex
        && entry?.targetType === 'player'
        && Number(entry?.hpAfter) > Number(entry?.hpBefore)
      ))
    : [];
  if (eventIsActive && timeline && healingEffects.length > 0) {
    const before = Number(healingEffects[0].hpBefore);
    const after = Number(healingEffects[healingEffects.length - 1].hpAfter);
    if (Date.now() < Number(timeline.effectAt || timeline.endsAt || 0)) return Math.max(0, Math.min(maxHp, before));
    return Math.max(0, Math.min(maxHp, after));
  }
  const activeDamage = Array.isArray(activeEvent?.damages)
    ? activeEvent.damages.find((entry) => Number(entry?.playerIndex) === playerIndex)
    : null;
  if (eventIsActive && timeline && activeDamage) {
    const visualHp = interpolateKingdomBattleHp(activeDamage.hpBefore, activeDamage.hpAfter, timeline);
    return Math.max(0, Math.min(maxHp, visualHp));
  }
  const transitionKind = String(s?.transition?.kind || '');
  if (!eventIsActive || !['enemyResponse', 'terminalEnemyResponse'].includes(transitionKind)) return logicalHp;
  const eventSeqs = Array.isArray(s.transition?.eventSeqs) ? s.transition.eventSeqs.map(Number) : [];
  const activeSeqIndex = eventSeqs.indexOf(Number(activeEvent?.seq));
  if (activeSeqIndex < 0 || activeSeqIndex >= eventSeqs.length - 1) return logicalHp;
  const events = Array.isArray(s?.battle?.events) ? s.battle.events : [];
  let visualHp = logicalHp;
  for (let index = eventSeqs.length - 1; index > activeSeqIndex; index -= 1) {
    const laterEvent = events.find((event) => Number(event?.seq) === eventSeqs[index]);
    const damage = Array.isArray(laterEvent?.damages)
      ? laterEvent.damages.find((entry) => Number(entry?.playerIndex) === playerIndex)
      : null;
    if (!damage) continue;
    const hpBefore = Number(damage.hpBefore);
    visualHp = Number.isFinite(hpBefore)
      ? hpBefore
      : visualHp + Math.max(0, Number(damage.damage) || 0);
  }
  return Math.max(0, Math.min(maxHp, visualHp));
}

function renderKingdomBattleParty(activeEvent = null, eventIsActive = false, eventKey = '') {
  if (!ui.battleParty) return;
  ui.battleParty.dataset.playerCount = String(getKingdomPlayerCount());
  const timeline = getKingdomBattleTimelineForEvent(activeEvent);
  const phase = getKingdomBattleTimelinePhase(timeline);
  const targetIndexes = eventIsActive
    && (!timeline || ['damage', 'recover', 'final'].includes(phase))
    && Array.isArray(activeEvent?.targetIndexes)
    ? activeEvent.targetIndexes.map((value) => Number(value))
    : [];
  const victoryEvent = (Array.isArray(s?.battle?.events) ? s.battle.events : [])
    .slice().reverse().find((event) => event?.type === 'victory');
  const winnerIndex = Number(victoryEvent?.actorIndex);
  s.players.forEach((player, playerIndex) => {
    const row = ensureKingdomBattlePlayerRow(playerIndex);
    if (!row) return;
    const character = normalizeTarotKingdomCharacter(player.character || {}, {
      displayName: player.name || `P${playerIndex + 1}`,
      playFabId: player.playFabId || '',
      combat: { maxHp: player.maxHp || KINGDOM_FALLBACK_PLAYER_MAX_HP }
    });
    const maxHp = Math.max(1, Number(player.maxHp) || character.combat.maxHp || KINGDOM_FALLBACK_PLAYER_MAX_HP);
    const logicalHp = Math.max(0, Math.min(maxHp, Number(player.hp) || 0));
    const hp = getKingdomBattleVisualHp(playerIndex, logicalHp, maxHp, activeEvent, eventIsActive);
    const hpRate = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    const conscious = hp > 0;
    row.classList.toggle('is-turn', !!(s.roundActive && s.turn === playerIndex && conscious));
    row.classList.toggle('is-ko', !conscious);
    row.classList.toggle('is-hit', targetIndexes.includes(playerIndex));
    row.classList.toggle('is-battle-charging', eventIsActive && Number(activeEvent?.actorIndex) === playerIndex && phase === 'charge');
    row.classList.toggle('is-battle-hit-stop', eventIsActive && Number(activeEvent?.actorIndex) === playerIndex && phase === 'hit-stop');

    const avatar = row.querySelector('.tarot-kingdom-battle-player-avatar');
    const isPet = player.isPet === true || character.source === 'pet';
    row.classList.toggle('is-pet', isPet);
    if (avatar) avatar.classList.toggle('is-pet', isPet);
    if (isPet && avatar) {
      const monsterId = String(player.pet?.monsterId || character.monsterId || '');
      const monster = getKingdomMonsterConfig(monsterId);
      let sprite = avatar.querySelector(':scope > .tarot-kingdom-battle-pet-sprite');
      if (!sprite) {
        avatar.replaceChildren();
        sprite = document.createElement('div');
        sprite.className = 'tarot-kingdom-battle-pet-sprite';
        sprite.setAttribute('aria-hidden', 'true');
        avatar.appendChild(sprite);
      }
      let animationName = conscious ? 'idle' : 'death';
      if (conscious && eventIsActive && ['attack', 'skill'].includes(String(activeEvent?.type || ''))
        && Number(activeEvent?.actorIndex) === playerIndex) {
        animationName = 'attack';
      } else if (conscious && eventIsActive && ['enemy-single', 'enemy-area'].includes(String(activeEvent?.type || ''))
        && targetIndexes.includes(playerIndex)) {
        animationName = 'hurt';
      }
      playKingdomPetAnimation(
        sprite,
        monster,
        animationName,
        animationName === 'idle' ? 'idle' : `${eventKey}:${conscious ? 'alive' : 'ko'}`
      );
    } else {
      const petSprite = avatar?.querySelector(':scope > .tarot-kingdom-battle-pet-sprite');
      if (petSprite) {
        const timerId = kingdomPetAnimationTimers.get(petSprite);
        if (timerId) clearInterval(timerId);
        kingdomPetAnimationTimers.delete(petSprite);
        petSprite.remove();
      }
      const characterKey = `${Number(s.characterSnapshotCreatedAt || 0)}:${playerIndex}:${character.playFabId || character.source}`;
      if (avatar && avatar.dataset.characterKey !== characterKey) {
        avatar.dataset.characterKey = characterKey;
        renderCombatAvatar(avatar, character.avatarBase, character.equipment, character.itemSource, {
          prefix: avatar.id,
          isOpponent: false,
          resetState: true
        });
      }
      setCombatAvatarKo(avatar, !conscious, { side: 'player' });
      setCombatAvatarVictory(
        avatar,
        !!(s.battle?.outcome === 'victory' && Number.isInteger(winnerIndex) && winnerIndex === playerIndex),
        { side: 'player' }
      );
    }

    const name = row.querySelector('.tarot-kingdom-battle-player-name');
    const nameKey = `${character.displayName}:${character.playFabId}`;
    if (name && name.dataset.nameKey !== nameKey) {
      name.dataset.nameKey = nameKey;
      name.innerHTML = '';
      appendPlayerNameNode(name, character.displayName, character.playFabId);
    }
    const rank = row.querySelector('.tarot-kingdom-battle-player-rank');
    if (rank) {
      const rankLabel = String(character.rankLabel || '');
      rank.textContent = /\bLv\s*\d+/i.test(rankLabel)
        ? rankLabel
        : `Lv${character.level} · ${rankLabel}`;
    }
    const hpFill = row.querySelector('.tarot-kingdom-battle-player-hp-fill');
    if (hpFill) hpFill.style.width = `${hpRate}%`;
    const hpTrack = row.querySelector('.tarot-kingdom-battle-player-hp-track');
    if (hpTrack) {
      hpTrack.setAttribute('aria-label', `${character.displayName}のHP`);
      hpTrack.setAttribute('aria-valuemax', String(maxHp));
      hpTrack.setAttribute('aria-valuenow', String(hp));
    }
    const handCount = row.querySelector('.tarot-kingdom-battle-player-hand-count');
    if (handCount) handCount.textContent = `残り手札 ${player.hand.length}枚`;
    renderKingdomStatusTray(row, getKingdomEffectBucket('player', playerIndex) || {});
    let healNumber = row.querySelector(':scope > .tarot-kingdom-heal-number');
    const healing = Array.isArray(activeEvent?.effects)
      ? activeEvent.effects.filter((entry) => Number(entry?.targetIndex) === playerIndex && entry?.targetType === 'player' && Number(entry?.amount) > 0 && String(entry?.kind || '').startsWith('heal'))
      : [];
    const showHeal = eventIsActive && ['effect', 'recover', 'final'].includes(phase) && healing.length > 0;
    if (showHeal) {
      if (!healNumber) {
        healNumber = document.createElement('div');
        healNumber.className = 'tarot-kingdom-heal-number';
        row.appendChild(healNumber);
      }
      healNumber.textContent = `+${healing.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0)}`;
    } else {
      healNumber?.remove();
    }
  });
  Array.from(ui.battleParty.querySelectorAll('.tarot-kingdom-battle-player')).forEach((row) => {
    if (Number(row.dataset.playerIndex) >= s.players.length) row.remove();
  });
  playKingdomBattleAvatarEvent(activeEvent, eventIsActive, eventKey);
}

function renderKingdomBattleFeed() {
  if (!ui.battleFeed) return;
  const events = Array.isArray(s?.battle?.events) ? s.battle.events.slice(-3).reverse() : [];
  const feedKey = events.length
    ? events.map((event) => `${event?.seq || 0}:${event?.type || ''}:${event?.label || ''}`).join('|')
    : 'guide';
  if (ui.battleFeed.dataset.feedKey === feedKey) return;
  ui.battleFeed.dataset.feedKey = feedKey;
  ui.battleFeed.innerHTML = '';
  if (!events.length) {
    const guide = document.createElement('div');
    guide.className = 'tarot-kingdom-battle-event is-info';
    guide.textContent = 'カード提出で攻撃 · 5枚役でスキル · パスで反撃';
    ui.battleFeed.appendChild(guide);
    return;
  }
  events.forEach((event) => {
    const row = document.createElement('div');
    row.className = `tarot-kingdom-battle-event ${getKingdomBattleFeedClass(event.type)}`;
    row.textContent = String(event.label || event.type || 'BATTLE');
    ui.battleFeed.appendChild(row);
  });
}

function renderKingdomSecondaryEffectBanner(event, eventIsActive, phase) {
  if (!ui.battleStage) return;
  let node = ui.battleStage.querySelector(':scope > .tarot-kingdom-effect-banner');
  const resonanceName = String(event?.resonanceName || '').trim();
  const weaponName = String(event?.weaponEffectName || '').trim();
  const show = !!(eventIsActive && (resonanceName || weaponName) && (phase === 'effect' || phase === 'recover' || prefersKingdomReducedMotion()));
  if (!show) {
    node?.remove();
    return;
  }
  if (!node) {
    node = document.createElement('div');
    node.className = 'tarot-kingdom-effect-banner';
    node.setAttribute('aria-live', 'polite');
    ui.battleStage.appendChild(node);
  }
  node.textContent = resonanceName ? `共鳴・${resonanceName}` : weaponName;
}

function getKingdomRoleVisualClass(roleKey) {
  const key = String(roleKey || '');
  const classes = {
    Straight: 'is-role-straight',
    Flush: 'is-role-flush',
    FullHouse: 'is-role-full-house',
    FourKind: 'is-role-four-kind',
    TheWorld: 'is-role-world',
    StraightFlush: 'is-role-straight-flush',
    FiveKind: 'is-role-five-kind'
  };
  return classes[key] || 'is-role-straight';
}

function preloadKingdomSummonArt() {
  if (kingdomSummonPreloadStarted || typeof Image !== 'function') return;
  kingdomSummonPreloadStarted = true;
  const load = () => {
    TAROT_KINGDOM_SUMMONS.forEach((summon) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = summon.src;
    });
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(load, { timeout: 1800 });
  else setTimeout(load, 0);
}

function getKingdomSummonVisualProfile(effectKey) {
  const key = String(effectKey || '').trim();
  return KINGDOM_SUMMON_EFFECT_VISUALS[key]
    || Object.freeze({ category: 'attack', choreography: 'magic-impact' });
}

function setKingdomSummonCinematicState(active, elapsedMs = 0, effectKey = '', category = '') {
  const targets = [ui.root, ui.battleStage].filter(Boolean);
  if (active && ui.kingdomCutin?.classList.contains('show')) {
    ui.kingdomCutin.classList.remove('show');
    ui.kingdomCutin.setAttribute('aria-hidden', 'true');
    if (kingdomCutinTimer) {
      clearTimeout(kingdomCutinTimer);
      kingdomCutinTimer = null;
    }
  }
  targets.forEach((target) => {
    target.classList.toggle('is-summon-cinematic', !!active);
    if (active) {
      target.style.setProperty('--summon-elapsed', `${-Math.min(KINGDOM_SUMMON_ATTACK_MS, Math.max(0, elapsedMs))}ms`);
      target.dataset.summonEffect = String(effectKey || '');
      target.dataset.summonCategory = String(category || '');
    } else {
      target.style.removeProperty('--summon-elapsed');
      delete target.dataset.summonEffect;
      delete target.dataset.summonCategory;
    }
  });
}

function renderKingdomSkillCutin(event, eventIsActive, phase) {
  if (!ui.battleStage) return;
  let cutin = ui.battleStage.querySelector(':scope > .tarot-kingdom-skill-cutin');
  const show = !!(
    eventIsActive
    && String(event?.type || '') === 'skill'
    && s?.lastPlay?.type === 'role'
    && Number(s.lastPlay.owner) === Number(event.actorIndex)
  );
  const summonState = event?.summon && typeof event.summon === 'object' ? event.summon : null;
  const summonArt = summonState ? getTarotKingdomSummonById(summonState.id) : null;
  const effectKey = String(summonState?.effectKey || summonArt?.effectKey || '').trim();
  const visualProfile = getKingdomSummonVisualProfile(effectKey);
  const isSummon = !!(show && summonArt && areKingdomSummonsEnabled());
  const timeline = show ? getKingdomBattleTimelineForEvent(event) : null;
  const elapsedMs = show
    ? Math.max(0, Date.now() - Number(timeline?.startedAt || event?.at || Date.now()))
    : 0;
  setKingdomSummonCinematicState(
    isSummon,
    elapsedMs,
    isSummon ? effectKey : '',
    isSummon ? visualProfile.category : ''
  );
  if (!show) {
    cutin?.remove();
    return;
  }
  const roleKey = String(s.lastPlay?.role?.key || s.transition?.roleKey || 'Straight');
  const cards = (Array.isArray(s.lastPlay?.cardsTable) ? s.lastPlay.cardsTable : []).slice(0, 5);
  const renderKey = `${event.seq}:${roleKey}:${summonArt?.id || ''}:${cards.map((card) => card?.id || '').join(',')}`;
  if (!cutin) {
    cutin = document.createElement('div');
    cutin.className = 'tarot-kingdom-skill-cutin';
    cutin.setAttribute('aria-live', 'polite');
    ui.battleStage.appendChild(cutin);
  }
  cutin.className = `tarot-kingdom-skill-cutin ${getKingdomRoleVisualClass(roleKey)} is-phase-${phase}${isSummon ? ` is-summon is-summon-${effectKey} is-summon-${visualProfile.category}` : ''}`;
  cutin.dataset.effectKey = isSummon ? effectKey : '';
  cutin.dataset.effectCategory = isSummon ? visualProfile.category : '';
  cutin.dataset.choreography = isSummon ? visualProfile.choreography : '';
  cutin.style.setProperty('--summon-elapsed', `${-Math.min(KINGDOM_SUMMON_ATTACK_MS, elapsedMs)}ms`);
  if (cutin.dataset.renderKey === renderKey) return;
  cutin.dataset.renderKey = renderKey;
  cutin.innerHTML = '';
  const title = document.createElement('strong');
  title.className = 'tarot-kingdom-skill-cutin-title';
  title.textContent = getRoleDisplayLabel(s.lastPlay);
  const fan = document.createElement('div');
  fan.className = 'tarot-kingdom-skill-card-fan';
  cards.forEach((card, index) => {
    const node = cardNode(card, { clickable: false });
    const offset = index - 2;
    node.style.setProperty('--skill-card-index', String(index));
    node.style.setProperty('--skill-card-angle', `${offset * 5}deg`);
    node.style.setProperty('--skill-card-lift', `${offset * offset * 1.5}px`);
    node.style.setProperty('--skill-card-converge-x', `${-offset * 52}px`);
    fan.appendChild(node);
  });
  cutin.appendChild(title);
  cutin.appendChild(fan);
  if (isSummon) {
    cutin.dataset.partyHideAt = String(KINGDOM_SUMMON_PARTY_HIDE_MS);
    cutin.dataset.partyReturnAt = String(KINGDOM_SUMMON_PARTY_RETURN_MS);
    cutin.dataset.hudReturnAt = String(KINGDOM_SUMMON_HUD_RETURN_MS);
    cutin.setAttribute(
      'aria-label',
      `${getRoleDisplayLabel(s.lastPlay)} 召喚 ${summonArt.name} ${String(summonState.effectName || '')}`.trim()
    );
    const seal = document.createElement('div');
    seal.className = 'tarot-kingdom-summon-seal';
    seal.setAttribute('aria-hidden', 'true');
    const portal = document.createElement('div');
    portal.className = 'tarot-kingdom-summon-portal';
    portal.setAttribute('aria-hidden', 'true');
    const figure = document.createElement('figure');
    figure.className = 'tarot-kingdom-summon-figure';
    figure.style.setProperty('--summon-scale', String(summonArt.visualScale || 1));
    figure.style.setProperty('--summon-anchor-x', `${summonArt.anchorX || 50}%`);
    figure.style.setProperty('--summon-anchor-y', `${summonArt.anchorY || 100}%`);
    if (summonArt.flipX) figure.classList.add('is-flipped');
    const image = document.createElement('img');
    image.className = 'tarot-kingdom-summon-art';
    image.src = summonArt.src;
    image.alt = summonArt.name;
    image.decoding = 'async';
    image.loading = 'eager';
    figure.appendChild(image);
    const copy = document.createElement('div');
    copy.className = 'tarot-kingdom-summon-copy';
    const summonName = document.createElement('strong');
    summonName.className = 'tarot-kingdom-summon-name';
    summonName.textContent = `召喚・${summonArt.name}`;
    const effectName = document.createElement('span');
    effectName.className = 'tarot-kingdom-summon-technique';
    effectName.textContent = String(summonState.effectName || '');
    copy.append(summonName, effectName);
    const effectField = document.createElement('div');
    effectField.className = `tarot-kingdom-summon-effect is-effect-${effectKey}`;
    effectField.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 7; index += 1) {
      const node = document.createElement('i');
      node.className = 'tarot-kingdom-summon-effect-node';
      node.style.setProperty('--effect-node-index', String(index));
      node.style.setProperty('--effect-node-delay', `${index * 38}ms`);
      node.style.setProperty('--effect-node-barrage-top', `${22 + (index * 7)}%`);
      node.style.setProperty('--effect-node-angle', `${-12 + (index * 3)}deg`);
      node.style.setProperty('--effect-node-bind-left', `${12 + (index * 3)}%`);
      node.style.setProperty('--effect-node-bind-top', `${25 + (index * 2)}%`);
      node.style.setProperty('--effect-node-bind-width', `${18 + (index * 2)}%`);
      node.style.setProperty('--effect-node-chaos-left', `${12 + (index * 5)}%`);
      node.style.setProperty('--effect-node-chaos-top', `${28 + ((index % 3) * 12)}%`);
      node.style.setProperty('--effect-node-chaos-size', `${18 + (index * 2)}px`);
      node.style.setProperty('--effect-node-chaos-x', `${index * -7}px`);
      node.style.setProperty('--effect-node-chaos-y', `${index * 4}px`);
      effectField.appendChild(node);
    }
    const impact = document.createElement('div');
    impact.className = 'tarot-kingdom-summon-impact';
    impact.setAttribute('aria-hidden', 'true');
    cutin.append(seal, portal, figure, copy, effectField, impact);
  } else {
    cutin.removeAttribute('aria-label');
  }
}

function renderKingdomBattleDamageNumber(event, eventIsActive, phase) {
  if (!ui.battleEnemy) return;
  let node = ui.battleEnemy.querySelector(':scope > .tarot-kingdom-damage-number');
  const missed = !!(
    ['attack', 'skill'].includes(String(event?.type || ''))
    && event?.attackMissed
  );
  const show = !!(
    eventIsActive
    && ['attack', 'skill', 'enemy-self', 'enemy-status'].includes(String(event?.type || ''))
    && ['damage', 'recover'].includes(phase)
    && (Number(event?.damage) > 0 || missed)
  );
  if (!show) {
    node?.remove();
    if (!eventIsActive || phase === 'final') kingdomBattleDamageEventKey = '';
    return;
  }
  const key = `${event.seq}:${event.type}:${event.damage}:${missed ? 'miss' : 'hit'}`;
  if (!node) {
    node = document.createElement('div');
    node.className = 'tarot-kingdom-damage-number';
    node.setAttribute('aria-hidden', 'true');
    ui.battleEnemy.appendChild(node);
  }
  node.className = [
    'tarot-kingdom-damage-number',
    event.type === 'skill' ? 'is-skill' : '',
    missed ? 'is-miss' : ''
  ].filter(Boolean).join(' ');
  node.textContent = missed
    ? 'MISS'
    : String(Math.max(0, Math.floor(Number(event.damage) || 0)));
  if (kingdomBattleDamageEventKey !== key) {
    kingdomBattleDamageEventKey = key;
    node.classList.remove('is-show');
    requestAnimationFrame(() => node?.classList.add('is-show'));
  } else {
    node.classList.add('is-show');
  }
}

function preloadKingdomBattlefieldImage(battlefieldId = '') {
  const battlefield = getTarotKingdomBattlefieldById(battlefieldId);
  const imagePath = String(battlefield.imagePath || '');
  if (!imagePath || typeof Image !== 'function') return Promise.resolve(false);
  if (kingdomBattlefieldPreloadPromises.has(imagePath)) {
    return kingdomBattlefieldPreloadPromises.get(imagePath);
  }
  const preload = new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = imagePath;
    if (image.complete) resolve(image.naturalWidth > 0);
  });
  kingdomBattlefieldPreloadPromises.set(imagePath, preload);
  return preload;
}

function renderKingdomBattlefield(battle = null) {
  const arena = ui.battleArena;
  if (!arena) return;
  const snapshot = battle?.battlefield && typeof battle.battlefield === 'object'
    ? battle.battlefield
    : {};
  const battlefield = getTarotKingdomBattlefieldById(snapshot.id);
  const imagePath = String(battlefield.imagePath || '');

  ui.battleStage.dataset.battlefieldId = battlefield.id;
  ui.battleStage.dataset.battlefieldSurface = battlefield.surface;
  ui.battleStage.classList.toggle('is-ship-side-battlefield', battlefield.shipSide);
  arena.dataset.battlefieldId = battlefield.id;
  arena.dataset.battlefieldSurface = battlefield.surface;
  arena.classList.toggle('is-ship-side-battlefield', battlefield.shipSide);
  arena.style.setProperty('--tarot-kingdom-battlefield-image', `url("${imagePath}")`);
  arena.style.setProperty('--tarot-kingdom-battlefield-position', battlefield.backgroundPosition);
  arena.style.setProperty('--tarot-kingdom-ground-start', `${battlefield.groundStartPercent}%`);
  arena.setAttribute('aria-label', `${battlefield.label}の戦場`);

  void preloadKingdomBattlefieldImage(battlefield.id);
}

function renderKingdomBattleStage() {
  if (!ui.battleStage) return;
  const shouldShow = !!(
    s?.battle?.enemy
    && s.characterSnapshotReady
    && (s.roundActive || Number(s.handNo || 0) > 0 || !!s.battle.outcome)
  );
  ui.root?.classList.toggle('is-battle-active', shouldShow);
  ui.battleStage.hidden = !shouldShow;
  if (!shouldShow) {
    clearKingdomMonsterFrameTimer();
    clearKingdomEnemyFinisherTimer();
    clearKingdomBattlePhaseTimers();
    return;
  }
  preloadKingdomSummonArt();
  const battle = s.battle;
  renderKingdomBattlefield(battle);
  const enemy = battle.enemy;
  const monsterConfig = getKingdomMonsterConfig(enemy.id);
  const enemyIsBoss = monsterConfig?.isBoss === true;
  const maxHp = Math.max(1, Number(enemy.maxHp) || 1);
  const logicalHp = Math.max(0, Math.min(maxHp, Number(enemy.hp) || 0));
  let hp = logicalHp;
  let hpRate = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const events = Array.isArray(battle.events) ? battle.events : [];
  const lastEvent = events[events.length - 1] || null;
  let visualEvent = lastEvent;
  let duration = getKingdomBattleEventDuration(visualEvent);
  let elapsed = visualEvent ? Math.max(0, Date.now() - Number(visualEvent.at || 0)) : Number.POSITIVE_INFINITY;
  const transitionEventSeqs = ['enemyResponse', 'terminalEnemyResponse'].includes(String(s?.transition?.kind || ''))
    && Array.isArray(s.transition.eventSeqs)
    ? s.transition.eventSeqs.map(Number).filter(Number.isFinite)
    : [];
  if (transitionEventSeqs.length > 0) {
    const transitionElapsed = Math.max(0, Date.now() - Number(s.transition.startedAt || Date.now()));
    let cursor = 0;
    for (const seq of transitionEventSeqs) {
      const candidate = events.find((event) => Number(event?.seq) === seq);
      if (!candidate) continue;
      const candidateDuration = getKingdomBattleEventDuration(candidate);
      if (transitionElapsed < cursor + candidateDuration || seq === transitionEventSeqs[transitionEventSeqs.length - 1]) {
        visualEvent = candidate;
        duration = candidateDuration;
        elapsed = Math.max(0, transitionElapsed - cursor);
        break;
      }
      cursor += candidateDuration;
    }
  }
  const eventKey = visualEvent ? `${visualEvent.seq}:${visualEvent.type}` : `round-${battle.roundIndex}`;
  const timeline = getKingdomBattleTimelineForEvent(visualEvent);
  const eventIsActive = !!(
    visualEvent
    && duration > 0
    && (timeline ? Date.now() < Number(timeline.endsAt || 0) : elapsed < duration)
  );
  const timelinePhase = getKingdomBattleTimelinePhase(timeline);
  scheduleKingdomBattleTimelineRenders(visualEvent, timeline);
  hp = getKingdomEnemyVisualHp(logicalHp, maxHp, visualEvent, eventIsActive, timeline);
  hpRate = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const victoryEvent = events.slice().reverse().find((event) => event?.type === 'victory') || null;
  const enemyFinisherActive = !!(
    battle.outcome === 'victory'
    && battle.resultReason === 'hand-empty'
    && victoryEvent
  );
  const finisherStartedAt = Math.max(0, Number(victoryEvent?.at) || Number(enemy.finishedAt) || Date.now());
  const finisherElapsed = enemyFinisherActive ? Math.max(0, Date.now() - finisherStartedAt) : 0;
  const deathDurationMs = Math.max(
    1,
    Number(victoryEvent?.deathDurationMs)
      || getKingdomMonsterAnimationDurationMs(enemy.id, 'death')
  );
  const enemyDustActive = enemyFinisherActive && finisherElapsed >= deathDurationMs;
  const enemyRushTime = logicalHp <= 0 && !enemyFinisherActive && !battle.outcome;
  if (enemyFinisherActive && finisherElapsed < deathDurationMs) {
    const finisherTimerKey = `${victoryEvent.seq}:${finisherStartedAt}:${deathDurationMs}`;
    if (kingdomEnemyFinisherTimerKey !== finisherTimerKey) {
      clearKingdomEnemyFinisherTimer();
      kingdomEnemyFinisherTimerKey = finisherTimerKey;
      kingdomEnemyFinisherTimer = setTimeout(() => {
        kingdomEnemyFinisherTimer = null;
        renderKingdomBattleStage();
      }, Math.max(20, deathDurationMs - finisherElapsed + 8));
    }
  } else if (!enemyFinisherActive) {
    clearKingdomEnemyFinisherTimer();
  }

  const terminalDefeatIsSequencing = String(s?.transition?.kind || '') === 'terminalEnemyResponse';
  const defeatPresentationVisible = battle.outcome === 'defeat'
    && (!terminalDefeatIsSequencing || String(visualEvent?.type || '') === 'defeat');
  ui.battleStage.classList.toggle('is-victory', battle.outcome === 'victory');
  ui.battleStage.classList.toggle('is-defeat', defeatPresentationVisible);
  ui.battleStage.classList.toggle('is-battle-charging', eventIsActive && timelinePhase === 'charge');
  ui.battleStage.classList.toggle('is-battle-hit-stop', eventIsActive && timelinePhase === 'hit-stop');
  ui.battleStage.classList.toggle('is-battle-damage', eventIsActive && timelinePhase === 'damage');
  ui.battleStage.classList.toggle('is-battle-skill', eventIsActive && String(visualEvent?.type || '') === 'skill');
  ui.battleStage.classList.toggle('is-rush-time', enemyRushTime);
  ui.battleStage.classList.toggle('is-enemy-finisher', enemyFinisherActive);
  if (defeatPresentationVisible && kingdomBattleTerminalFxEventKey !== eventKey) {
    kingdomBattleTerminalFxEventKey = eventKey;
    triggerKingdomActionFx(0, 'BATTLE DEFEAT', {
      overlay: 'roundend',
      durationMs: 1300,
      cutin: true,
      cutinClass: 'is-showdown-lose'
    });
  }
  ui.battleEnemy?.classList.toggle('is-boss', enemyIsBoss);
  if (ui.battleEnemyEyebrow) ui.battleEnemyEyebrow.textContent = enemyIsBoss ? 'BOSS' : 'MONSTER';
  if (ui.battleEnemyName) ui.battleEnemyName.textContent = String(enemy.name || 'MONSTER');
  if (ui.battleEnemySprite) ui.battleEnemySprite.setAttribute('aria-label', String(enemy.name || 'MONSTER'));
  if (ui.demoEnemySelect && ui.demoEnemySelect.value !== String(enemy.id || '')) {
    ui.demoEnemySelect.value = String(enemy.id || '');
  }
  if (ui.demoBattlefieldSelect && ui.demoBattlefieldSelect.value !== String(battle.battlefield?.id || '')) {
    ui.demoBattlefieldSelect.value = String(battle.battlefield?.id || '');
  }
  if (ui.battleEnemyHpText) ui.battleEnemyHpText.textContent = `HP ${hp} / ${maxHp}`;
  if (ui.battleEnemyHpFill) ui.battleEnemyHpFill.style.width = `${hpRate}%`;
  if (ui.battleEnemyHpTrack) {
    ui.battleEnemyHpTrack.setAttribute('aria-valuemin', '0');
    ui.battleEnemyHpTrack.setAttribute('aria-valuemax', String(maxHp));
    ui.battleEnemyHpTrack.setAttribute('aria-valuenow', String(hp));
  }

  const enemyActing = eventIsActive && ['enemy-single', 'enemy-area'].includes(String(visualEvent?.type || ''));
  const enemyHurt = eventIsActive
    && ['attack', 'skill', 'enemy-self', 'enemy-status'].includes(String(visualEvent?.type || ''))
    && (!timeline || prefersKingdomReducedMotion() || ['damage', 'recover'].includes(timelinePhase))
    && !enemyFinisherActive;
  const enemyDefeated = enemyFinisherActive;
  const enemyPetrified = !!enemy.petrifiedUntilClear && !enemyDefeated && !enemyRushTime;
  const enemyConfused = !!s.reverse && !enemyDefeated && !enemyRushTime;
  const enemyAreaSealed = !!enemy.areaAttackSealedUntilClear && !enemyDefeated && !enemyRushTime;
  [ui.battleEnemy, ui.battleEnemySprite].forEach((node) => {
    node?.classList.toggle('is-attacking', enemyActing);
    node?.classList.toggle('is-hurt', enemyHurt);
    node?.classList.toggle('is-defeated', enemyDefeated);
    node?.classList.toggle('is-rush-time', enemyRushTime);
    node?.classList.toggle('is-finisher-defeat', enemyFinisherActive);
    node?.classList.toggle('is-dusting', enemyDustActive);
    node?.classList.toggle('is-petrified', enemyPetrified);
    node?.classList.toggle('is-confused', enemyConfused);
    node?.classList.toggle('is-area-sealed', enemyAreaSealed);
  });

  const animationName = enemyFinisherActive
    ? 'death'
    : (enemyActing ? 'attack' : (enemyHurt ? 'hurt' : 'idle'));
  const monsterAnimationGeneration = enemyFinisherActive
    ? `${battle.roundIndex}:finisher:${Number(enemy.defeatedAtSeq) || Number(victoryEvent?.seq) || 0}`
    : (enemyRushTime
      ? `${battle.roundIndex}:rush:${Number(enemy.rushStartedAtSeq) || 0}`
      : `${battle.roundIndex}:${eventKey}:${animationName}`);
  if (enemyPetrified) clearKingdomMonsterFrameTimer();
  else {
    playKingdomMonsterAnimation(animationName, monsterAnimationGeneration, {
      playbackRate: enemyRushTime ? KINGDOM_RUSH_MONSTER_PLAYBACK_RATE : 1,
      elapsedMs: enemyFinisherActive ? finisherElapsed : 0
    });
  }
  renderKingdomSkillCutin(visualEvent, eventIsActive, timelinePhase);
  renderKingdomSecondaryEffectBanner(visualEvent, eventIsActive, timelinePhase);
  renderKingdomBattleDamageNumber(visualEvent, eventIsActive, timelinePhase);
  renderKingdomBattleParty(visualEvent, eventIsActive, eventKey);
  renderKingdomStatusTray(ui.battleParty, getKingdomEffectBucket('party') || {});
  renderKingdomStatusTray(ui.battleEnemy, getKingdomEffectBucket('enemy') || {}, [
    ...(enemy.petrifiedUntilClear ? ['petrified'] : []),
    ...(enemy.areaAttackSealedUntilClear ? ['areaSeal'] : []),
    ...(s.reverse ? ['confusion'] : [])
  ]);
  renderKingdomBattleFeed();

  if (eventIsActive && kingdomBattleVisualEventKey !== eventKey) {
    kingdomBattleVisualEventKey = eventKey;
    if (kingdomBattleVisualResetTimer) clearTimeout(kingdomBattleVisualResetTimer);
    kingdomBattleVisualResetTimer = setTimeout(() => {
      kingdomBattleVisualResetTimer = null;
      kingdomBattleVisualEventKey = '';
      renderKingdomBattleStage();
    }, Math.max(20, duration - elapsed + 20));
  } else if (!eventIsActive && kingdomBattleVisualEventKey) {
    kingdomBattleVisualEventKey = '';
  }
}

function renderPlayers() {
  const settlementData = s?.roundSettlement || null;
  const isMatchDone = isKingdomMatchDoneState(s);
  const showRankingMedals = isMatchDone && s?.battle?.outcome !== 'defeat';
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
        ? Math.max(0, Number(settlementData.starBonus) || 0)
        : 0
    );
    appendPlayerNameNode(left, p.name, String(p.playFabId || '').trim());
    if (starCount > 0) {
      const stars = document.createElement('span');
      stars.textContent = ` ${'⭐'.repeat(starCount)}`;
      left.appendChild(stars);
    }
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
  let dealSettleNextRender = false;
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
        setInlinePlayerLabel(ui.trickOwner, '場札主: ', owner, ` 手札${handCount}${roleSuffix}`);
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
  const appendFieldSlots = (fromIndex = 0) => {
    for (let slotIndex = Math.max(0, fromIndex); slotIndex < 5; slotIndex += 1) {
      const slot = document.createElement('span');
      slot.className = 'tarot-kingdom-field-slot';
      slot.dataset.slotIndex = String(slotIndex);
      slot.setAttribute('aria-hidden', 'true');
      ui.trick.appendChild(slot);
    }
  };
  const renderNow = () => {
    ui.trick.classList.remove('is-hit-stop');
    ui.trick.innerHTML = '';
    if (!cards.length) {
      appendFieldSlots(0);
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
      } else if (dealSettleNextRender) {
        node.classList.add('is-deal-settling');
        animDelayMs = idx * 44;
        animDurationMs = 220;
        node.style.animationDelay = `${animDelayMs}ms`;
        node.style.animationDuration = `${animDurationMs}ms`;
      } else if (ramSettleFirstCard && idx === 0) {
        animDelayMs = 0;
        animDurationMs = 0;
      } else {
        node.classList.add('is-entering');
        animDelayMs = idx * (s.callMergeFx ? 104 : 54);
        animDurationMs = 420;
        node.style.animationDelay = `${animDelayMs}ms`;
        node.style.animationDuration = `${animDurationMs}ms`;
      }
      let cleaned = false;
      const clearAnimState = () => {
        if (cleaned) return;
        cleaned = true;
        node.classList.remove('is-entering');
        node.classList.remove('is-call-arriving');
        node.classList.remove('is-deal-settling');
        node.style.animationDelay = '';
        node.style.animationDuration = '';
      };
      node.addEventListener('animationend', clearAnimState, { once: true });
      // animationend が来ない環境でも透明のまま残らないようにする。
      setTimeout(clearAnimState, animDelayMs + animDurationMs + 120);
      ui.trick.appendChild(node);
    });
    appendFieldSlots(Math.min(cards.length, 5));
    ramSettleFirstCard = false;
    dealSettleNextRender = false;
  };

  if (nextKey === trickRenderKey) {
    const hasVisibleNode = !!ui.trick.querySelector('.tarot-card:not(.is-entering):not(.is-call-arriving):not(.is-undealt), .tarot-kingdom-field-slot');
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

  const isNormalSetDeal = cards.length > 0
    && String(currentPlay?.type || '') === 'set'
    && (transitionKind === 'normal' || String(s?.transition?.kind || '') === 'play');
  if (isNormalSetDeal) {
    trickRenderToken += 1;
    const swapToken = trickRenderToken;
    const runIfCurrent = (fn) => {
      if (swapToken !== trickRenderToken) return;
      fn();
    };
    const currentPlayToken = getKingdomPlayToken(currentPlay);
    const capturedFx = pendingKingdomCardDealFx
      && (!pendingKingdomCardDealFx.playToken || pendingKingdomCardDealFx.playToken === currentPlayToken)
      ? pendingKingdomCardDealFx
      : null;
    pendingKingdomCardDealFx = null;
    const dealDurationMs = playKingdomCardDealFx(callOwner, cards, capturedFx);
    const exitDurationMs = 170;
    const exitStaggerMs = 22;
    const exitTailMs = Math.max(0, (prevCards.length - 1) * exitStaggerMs);
    ui.trick.classList.remove('is-hit-stop');
    prevCards.forEach((node, idx) => {
      if (!node) return;
      node.classList.remove('is-entering', 'is-call-arriving', 'is-leaving', 'is-defeat-transition', 'is-field-replacing');
      clearArcanaDefeatPatternClasses(node);
      node.classList.add('is-deal-displaced');
      node.style.animationDelay = `${idx * exitStaggerMs}ms`;
      node.style.setProperty('--deal-displace-ms', `${exitDurationMs}ms`);
    });
    const swapDelayMs = Math.max(
      exitDurationMs + exitTailMs + 24,
      Math.max(120, dealDurationMs - 34)
    );
    trickSwapTimer = setTimeout(() => {
      if (swapToken !== trickRenderToken) return;
      trickSwapTimer = null;
      runIfCurrent(() => {
        dealSettleNextRender = true;
        renderNow();
        resolvePendingAfterTrick();
      });
    }, swapDelayMs);
    return;
  }

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
    // 同期復帰など移動元を再現できない場合も、新しい場札交代演出へ統一する。
    const exitDurationMs = 170;
    const exitStaggerMs = 22;
    const exitTailMs = Math.max(0, (prevCards.length - 1) * exitStaggerMs);
    const runIfCurrent = (fn) => {
      if (swapToken !== trickRenderToken) return;
      fn();
    };
    ui.trick.classList.remove('is-hit-stop');
    prevCards.forEach((node, idx) => {
      if (!node) return;
      node.classList.remove('is-entering', 'is-call-arriving', 'is-leaving', 'is-defeat-transition', 'is-field-replacing');
      clearArcanaDefeatPatternClasses(node);
      node.classList.add('is-deal-displaced');
      node.style.animationDelay = `${idx * exitStaggerMs}ms`;
      node.style.setProperty('--deal-displace-ms', `${exitDurationMs}ms`);
    });
    trickSwapTimer = setTimeout(() => {
      if (swapToken !== trickRenderToken) return;
      trickSwapTimer = null;
      runIfCurrent(() => {
        dealSettleNextRender = true;
        renderNow();
        resolvePendingAfterTrick();
      });
    }, exitDurationMs + exitTailMs + 24);
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

function getPlayableHandCardIndexes(playerIndex) {
  const playableIndexes = new Set();
  const hand = s?.players?.[playerIndex]?.hand;
  if (!Array.isArray(hand) || hand.length <= 0) return playableIndexes;

  const canCallContext = !!(s.trick && s.trick.type === 'set' && s.trick.count === 1);
  const evaluateSelection = (selectedIndexes) => {
    let built = null;
    let mode = 'normal';
    if (canCallContext && selectedIndexes.length === 4) {
      built = buildCallPlay(playerIndex, selectedIndexes);
      mode = 'call';
    } else if (selectedIndexes.length === 5) {
      built = buildRolePlay(playerIndex, selectedIndexes);
    } else if (selectedIndexes.length >= 1 && selectedIndexes.length <= 3) {
      built = buildSetPlay(playerIndex, selectedIndexes);
    }
    if (!built?.ok) return;
    const validation = validatePlay(built.play, mode);
    if (!validation?.ok) return;
    selectedIndexes.forEach((index) => playableIndexes.add(index));
  };

  const selectedIndexes = [];
  const visitSelections = (startIndex, remainingCount) => {
    if (remainingCount <= 0) {
      evaluateSelection(selectedIndexes.slice());
      return;
    }
    for (let index = startIndex; index <= hand.length - remainingCount; index += 1) {
      selectedIndexes.push(index);
      visitSelections(index + 1, remainingCount - 1);
      selectedIndexes.pop();
    }
  };

  for (let count = 1; count <= Math.min(5, hand.length); count += 1) {
    visitSelections(0, count);
  }
  return playableIndexes;
}

function renderHand() {
  ui.hand.innerHTML = '';
  if (ui.handCount) ui.handCount.textContent = '0';
  ui.hand.dataset.handCount = '0';
  ui.hand.setAttribute('aria-label', 'あなたの手札 0枚');
  const me = getLocalPlayerIndex();
  if (me < 0 || !s.players?.[me]) return;
  const hand = Array.isArray(s.players[me].hand) ? s.players[me].hand : [];
  if (ui.handCount) ui.handCount.textContent = String(hand.length);
  ui.hand.dataset.handCount = String(hand.length);
  ui.hand.setAttribute('aria-label', `あなたの手札 ${hand.length}枚`);
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
  const canCommit = isKingdomBattlePlayerConscious(me)
    && ((s.roundActive && s.phase === 'turn' && s.turn === me) || drawMe);
  const playableIndexes = canCommit ? getPlayableHandCardIndexes(me) : new Set();
  const canSelect = !!(
    s.roundActive
    && !inOpeningDeal
    && isKingdomLocalPrivateStateReady()
    && isKingdomBattlePlayerConscious(me)
    && Array.isArray(s.players[me]?.hand)
    && s.players[me].hand.length > 0
  );
  const onHandTap = (idx) => {
    if (!canSelect) {
      showPlayError('今は手札を選択できません。');
      return;
    }
    if (s.selected.has(idx)) {
      s.selected.delete(idx);
    } else if (s.selected.size >= 5) {
      showPlayError('選択できるカードは5枚までです。');
      return;
    } else {
      s.selected.add(idx);
    }
    sanitizeSelected(me);
    clearLocalInfoMessage(false);
    render();
  };
  hand.forEach((c, i) => {
    const isDrawFlipTarget = drawFlipActive && c?.id && String(c.id) === drawFlipCardId;
    let showCard = inOpeningDeal
      ? ((i < openingRevealCount || i === openingFlipIndex) ? c : null)
      : c;
    if (isDrawFlipTarget && now < drawFlipRevealAt) {
      showCard = null;
    }
    const node = cardNode(showCard, {
      clickable: canSelect,
      playable: !!showCard && playableIndexes.has(i),
      selected: selected.includes(i),
      resonant: !!showCard && normalizeTarotKingdomTarotDeck(s.players?.[me]?.character?.tarotDeck || [])
        .some((entry) => isTarotKingdomDeckMatch(showCard, entry)),
      onClick: () => onHandTap(i)
    });
    node.dataset.cardIndex = String(i);
    node.style.setProperty('--hand-index', String(i));
    node.setAttribute('aria-pressed', selected.includes(i) ? 'true' : 'false');
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
  const localPlayerIndex = getLocalPlayerIndex();
  const localIsJudging = s.pendingJudgment != null
    && Number(s.pendingJudgment) === Number(localPlayerIndex);
  if (localIsJudging) {
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
  const human = inJudgment && Number(s.pendingJudgment) === getLocalPlayerIndex();
  const forceVisible = human;
  const visible = forceVisible || !!kingdomLocalGraveOpen;
  if (!visible) {
    ui.judgmentArea.style.display = 'none';
    ui.judgmentOptions.innerHTML = '';
    return;
  }

  ui.judgmentArea.style.display = 'block';
  ui.judgmentOptions.innerHTML = '';

  if (ui.judgmentTitle) {
    ui.judgmentTitle.textContent = human
      ? '審判: 墓地から回収するカードを選択'
      : '墓地（場から取り除かれたカード）';
  }
  ui.judgmentSkipButton.style.display = human ? '' : 'none';
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

function renderSummary() {
  const me = getLocalPlayerIndex();
  const localSelected = me >= 0 ? sanitizeSelected(me) : [];
  const localStateOverride = me >= 0 ? buildLocalStateTextOverride(me, localSelected) : '';
  const turnText = s.roundActive ? `\nTurn ${Math.max(1, Number(s.turnCount) || 1)}` : '';
  const stage = normalizeKingdomExplorationStageState(s.stage);
  ui.round.textContent = stage
    ? `STAGE ${stage.stageNo}\nENEMY ${Math.min(s.handNo + 1, TOTAL_HANDS)} / ${TOTAL_HANDS}${turnText}`
    : `Round ${Math.min(s.handNo + 1, TOTAL_HANDS)} / ${TOTAL_HANDS}${turnText}`;
  if (ui.turn) {
    if (s.roundActive) {
      setInlinePlayerLabel(ui.turn, '', s.turn, 'の手番');
    } else {
      ui.turn.textContent = '待機中';
    }
  }
  if (ui.reverseChip) {
    const showReverse = !!s.roundActive && !!s.reverse;
    ui.reverseChip.hidden = !showReverse;
    ui.reverseChip.style.display = showReverse ? '' : 'none';
    ui.reverseChip.textContent = '11バック中';
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
    const hasPlayError = kingdomLocalPriorityKind === 'play-error' && !!kingdomLocalPriorityMessage;
    const selectionLabel = hasPlayError
      ? kingdomLocalPriorityMessage
      : (localSelected.length > 0
        ? (buildSelectedCardInfoMessage(me, localSelected) || `${localSelected.length}枚選択中`)
        : 'カードを選択してください');
    ui.selectedEffect.textContent = selectionLabel;
    ui.selectedEffect.hidden = false;
    ui.selectedEffect.classList.toggle('has-selection', localSelected.length > 0);
    ui.selectedEffect.classList.toggle('is-error', hasPlayError);
  }
  if (ui.score) ui.score.textContent = '';
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
  const actionState = getKingdomSettlementActionState(s);
  const isMatchDone = actionState?.kind === 'restart';
  const show = !!data || isMatchDone;
  ui.root?.classList.remove('is-settlement-open');
  ui.root?.classList.toggle('has-settlement-action', !!actionState);
  if (!show) {
    if (confirmButton) {
      confirmButton.hidden = true;
      confirmButton.disabled = true;
    }
    return;
  }

  if (data) dispatchSettlementCoinFxIfNeeded(data);

  if (confirmButton) {
    confirmButton.hidden = !actionState;
    confirmButton.disabled = actionState ? !!actionState.disabled : true;
    if (actionState) confirmButton.textContent = actionState.label;
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
    ui.playButton.textContent = '防御';
    ui.playButton.classList.remove('is-attack', 'is-minor-draw');
    ui.playButton.classList.add('is-defense');
    ui.clearButton.disabled = true;
    if (ui.foldButton) {
      ui.foldButton.disabled = true;
      ui.foldButton.textContent = 'フォールド';
      ui.foldButton.classList.remove('is-major-draw');
    }
    if (ui.graveToggleButton) ui.graveToggleButton.disabled = true;
    return;
  }
  const inCallCinematic = s.phase === 'callCinematic';
  const inOpeningCinematic = s.phase === 'openingCinematic';
  const inOpeningDeal = s.phase === 'openingDeal';
  const actionLocked = inCallCinematic || inOpeningCinematic || inOpeningDeal || !!s.transition
    || !!kingdomCharacterLoadPromise
    || !isKingdomLocalPrivateStateReady()
    || s.phase === 'resolvingPlay' || s.phase === 'resolvingEnemy' || s.phase === 'roundOutCinematic';
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
  const battleConscious = isKingdomBattlePlayerConscious(me);
  const myTurn = battleConscious && s.roundActive && s.phase === 'turn' && s.turn === me;
  const drawMe = battleConscious && s.roundActive && s.phase === 'draw' && s.pendingDraw === me;
  const canDraw = drawMe && s.drawDeck.length > 0 && myHandCount < getKingdomHandLimit();
  const hasSelected = !!(s.selected && s.selected.size > 0);
  const canClearSelection = hasSelected;
  const canToggleSort = !hasSelected && myHandCount > 1;
  const canPlayNow = myTurn || drawMe;
  const isConnectingOnline = isKingdomOnlineConnecting();
  const needsCharacterRetry = !s.characterSnapshotReady
    && /(取得に失敗|取得できない|未読込)/.test(String(s.message || ''));
  const showModeControls = showModeChoice;
  if (ui.modeControls) {
    ui.modeControls.hidden = !showModeControls;
  }
  if (ui.startOnlineButton) {
    const showOnlineButton = window.__TAROT_KINGDOM_PREVIEW__ !== true && showModeChoice;
    const isExplorationRescue = kingdomExplorationSession?.context?.mode === 'online';
    let onlineLabel = isExplorationRescue ? '救難信号を発信' : 'オンライン対戦を探す';
    let onlineDisabled = actionLocked;
    if (kingdomStartMode === 'online') {
      if (isConnectingOnline) {
        onlineLabel = isExplorationRescue ? '救難信号を発信中' : 'オンライン接続中';
        onlineDisabled = true;
      } else if (!netMode) {
        onlineLabel = isExplorationRescue ? '救難信号を再送信' : 'オンライン対戦を再試行';
      } else if (!tkNet.isHost) {
        onlineLabel = 'ホストの開始を待機中';
        onlineDisabled = true;
      } else if (isLobbyReadyToStart) {
        onlineLabel = needsCharacterRetry
          ? '戦闘プロフィールを再取得'
          : (hasVacancy
            ? (isExplorationRescue ? '救難を締め切って戦闘開始' : '受付を止めて戦いを始める')
            : (isExplorationRescue ? '救援隊で戦闘開始' : 'オンライン対戦を開始'));
      } else {
        onlineLabel = isExplorationRescue ? '救難信号を再送信' : 'オンライン対戦を再試行';
      }
    }
    ui.startOnlineButton.hidden = !showOnlineButton;
    ui.startOnlineButton.disabled = !showOnlineButton || onlineDisabled;
    ui.startOnlineButton.textContent = onlineLabel;
    ui.startOnlineButton.classList.toggle('is-selected', kingdomStartMode === 'online');
  }
  if (ui.startOfflineButton) {
    const showOfflineButton = showModeChoice;
    const isExplorationRescue = kingdomExplorationSession?.context?.mode === 'online';
    let offlineLabel = kingdomExplorationSession ? '傭兵召集で開始' : 'オフラインで始める';
    let offlineDisabled = actionLocked;
    if (kingdomStartMode === 'online') {
      if (isConnectingOnline) {
        offlineLabel = isExplorationRescue ? '傭兵召集へ切替' : '接続をやめる';
      } else if (netMode) {
        offlineLabel = isExplorationRescue
          ? '傭兵召集へ切替'
          : (tkNet.isHost ? 'オンライン受付をやめる' : '待機をやめる');
      }
    } else if (kingdomStartMode === 'offline' && needsCharacterRetry) {
      offlineLabel = 'キャラクター情報を再取得';
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
    const actionIsAttack = hasSelected;
    const actionIsDraw = !actionIsAttack && drawMe;
    ui.playButton.textContent = actionIsAttack ? '攻撃' : (actionIsDraw ? 'ドロー' : '防御');
    ui.playButton.disabled = actionIsAttack
      ? (actionLocked || !canPlayNow)
      : (actionIsDraw ? (actionLocked || !canDraw) : (actionLocked || !myTurn));
    ui.playButton.classList.toggle('is-attack', actionIsAttack);
    ui.playButton.classList.toggle('is-defense', !actionIsAttack && !actionIsDraw);
    ui.playButton.classList.toggle('is-minor-draw', actionIsDraw);
  }
  if (ui.clearButton) {
    ui.clearButton.textContent = hasSelected
      ? '選択解除'
      : (localHandSortMode === HAND_SORT_MODE.SUIT ? '数値順' : 'スート順');
    ui.clearButton.disabled = actionLocked || !(canClearSelection || canToggleSort);
  }
  if (ui.foldButton) {
    if (drawMe) {
      ui.foldButton.textContent = 'フォールド';
      ui.foldButton.disabled = true;
    } else {
      ui.foldButton.textContent = kingdomLocalAutoFold ? 'フォールド中' : 'フォールド';
      ui.foldButton.disabled = kingdomLocalAutoFold
        ? false
        : (actionLocked || !(s.roundActive && s.phase === 'turn' && !!s.trick));
    }
    ui.foldButton.classList.toggle('is-ready', !!(!ui.foldButton.disabled && (drawMe || kingdomLocalAutoFold || myTurn)));
    ui.foldButton.classList.toggle('is-active', !drawMe && kingdomLocalAutoFold);
    ui.foldButton.classList.remove('is-major-draw');
  }
  const actionReadyPhase = myTurn || drawMe;
  const popupButtons = [ui.graveToggleButton, ui.foldButton, ui.playButton];
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
    const updateGraveButtonLabel = (label) => {
      ui.graveToggleButton.setAttribute('aria-label', label);
      const labelNode = ui.graveToggleButton.querySelector('.tarot-kingdom-battle-menu-label');
      if (labelNode) labelNode.textContent = label;
    };
    const localIsJudging = s.pendingJudgment != null
      && Number(s.pendingJudgment) === getLocalPlayerIndex();
    if (localIsJudging) {
      updateGraveButtonLabel('墓地（審判中）');
      ui.graveToggleButton.disabled = true;
    } else {
      updateGraveButtonLabel(kingdomLocalGraveOpen ? '墓地を閉じる' : '墓地を見る');
      ui.graveToggleButton.disabled = !s.roundActive;
    }
  }
}

function render() {
  if (!s) return;
  normalizeKingdomTerminalState(s);
  const stage = normalizeKingdomExplorationStageState(s.stage);
  if (stage?.atmosphereTone) {
    document.body?.setAttribute('data-tarot-kingdom-atmosphere-tone', stage.atmosphereTone);
  } else if (!kingdomExplorationSession) {
    document.body?.removeAttribute('data-tarot-kingdom-atmosphere-tone');
  }
  queueSyncKingdomViewportHeight();
  syncLocalAutoFoldState();
  enforceLeadTurnInvariant();
  renderSummary();
  setOpenRoomsVisibility(shouldShowOpenRoomsLobby());
  renderKingdomBattleStage();
  renderPlayers();
  renderSettlement();
  renderTrick();
  renderHand();
  renderJudgment();
  updateButtons();
  processLocalAutoFold();
  syncHumanTurnCueState();
  scheduleKingdomTransitionResolution();
  if (isNetModeActive() && tkNet.isHost) {
    scheduleOpenRoomHeartbeat();
    queueStatePublish();
  } else {
    clearOpenRoomHeartbeatTimer();
  }
}

function beginNextRound() {
  setupHand();
  render();
  if (s?.roundActive) playOpeningDealCinematic();
}

function confirmRoundSettlement() {
  if (!s || !s.awaitRoundConfirm) return;
  if (s.handNo >= TOTAL_HANDS || isKingdomMatchDoneState(s)) return;
  s.awaitRoundConfirm = false;
  s.roundSettlement = null;
  beginNextRound();
}

async function startOrNext() {
  const restartingDoneMatch = !s || isKingdomMatchDoneState(s);
  if (restartingDoneMatch) {
    resetMatch();
  }
  if (!s || s.awaitRoundConfirm) return;
  if (s.roundActive || s.handNo >= TOTAL_HANDS) return true;
  if (kingdomRoundStartPromise) return kingdomRoundStartPromise;
  const targetState = s;
  const targetGeneration = kingdomStateGeneration;
  const startPromise = (async () => {
    targetState.message = 'キャラクター能力・装備を固定しています...';
    const profileLoad = prepareKingdomCharacterSnapshots({ online: kingdomStartMode === 'online' });
    render();
    const ready = await profileLoad;
    if (s !== targetState || kingdomStateGeneration !== targetGeneration) return false;
    if (!ready) {
      render();
      if (isNetModeActive() && tkNet.isHost) queueStatePublish(true);
      return false;
    }
    if (targetState.roundActive || targetState.awaitRoundConfirm || targetState.handNo >= TOTAL_HANDS) return true;
    beginNextRound();
    if (isNetModeActive() && tkNet.isHost) {
      queueStatePublish(true);
    }
    return true;
  })();
  kingdomRoundStartPromise = startPromise;
  try {
    return await startPromise;
  } finally {
    if (kingdomRoundStartPromise === startPromise) kingdomRoundStartPromise = null;
  }
}

function canStartKingdomRoundFromLobby() {
  if (!s) return false;
  if (s.awaitRoundConfirm) return false;
  if (s.roundActive) return false;
  if (isKingdomMatchDoneState(s)) return false;
  return Number(s.handNo || 0) < TOTAL_HANDS;
}

async function activateKingdomOnlineMode() {
  if (window.__TAROT_KINGDOM_PREVIEW__ === true) {
    kingdomStartMode = 'offline';
    netManualOfflineMode = true;
    if (!s) resetMatch();
    s.message = 'プレビューではオフライン対戦をお試しください。';
    render();
    return;
  }
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

async function activateAndStartKingdomOfflineMode() {
  activateKingdomOfflineMode({
    renderNow: false,
    message: 'オフライン対戦を開始しています...'
  });
  if (!s) return;
  if (canStartKingdomRoundFromLobby()) {
    await startOrNext();
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
    if (kingdomExplorationSession?.context?.mode === 'online') {
      netForceCreateRoom = true;
    }
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

async function handleKingdomOfflineStartClick() {
  if (!s) return;
  const inOnlineLobby = shouldShowOpenRoomsLobby();
  if (kingdomStartMode === 'online' && inOnlineLobby && (isKingdomOnlineConnecting() || isNetModeActive())) {
    if (kingdomExplorationSession?.context?.mode === 'online') {
      kingdomExplorationSession.context.mode = 'offline';
      document.body?.setAttribute('data-tarot-kingdom-entry-mode', 'offline');
      await activateAndStartKingdomOfflineMode();
      return;
    }
    returnToKingdomModeChoice('オンライン受付を終了しました。');
    return;
  }
  await activateAndStartKingdomOfflineMode();
}

async function handleKingdomRestartClick() {
  if (!isKingdomMatchDoneState(s)) return;
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
  await startOrNext();
}

function clearOpenRoomHeartbeatTimer() {
  if (netOpenRoomHeartbeatTimer) {
    clearTimeout(netOpenRoomHeartbeatTimer);
    netOpenRoomHeartbeatTimer = null;
  }
}

function clearPresenceHeartbeatTimer() {
  if (netPresenceHeartbeatTimer) {
    clearTimeout(netPresenceHeartbeatTimer);
    netPresenceHeartbeatTimer = null;
  }
}

function schedulePresenceHeartbeat() {
  clearPresenceHeartbeatTimer();
  if (!isNetModeActive() || !tkNet.presenceRef) return;
  netPresenceHeartbeatTimer = setTimeout(async () => {
    netPresenceHeartbeatTimer = null;
    if (!isNetModeActive() || !tkNet.presenceRef) return;
    try {
      await set(ref(tkNet.db, `${tkNet.roomPath}/presence/${tkNet.uid}/updatedAt`), serverTimestamp());
      if (netPresenceByUid?.[tkNet.uid]) netPresenceByUid[tkNet.uid].updatedAt = Date.now();
    } catch (_) {
      // The presence subscription and onDisconnect hook remain authoritative.
    }
    schedulePresenceHeartbeat();
  }, TK_PRESENCE_HEARTBEAT_MS);
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
  const actionType = String(action?.type || '');
  if (
    ['play', 'pass', 'draw', 'judgmentPick', 'judgmentSkip'].includes(actionType)
    && !isKingdomLocalPrivateStateReady()
  ) {
    showPlayError('手札を安全に同期しています。少し待って再実行してください。');
    return false;
  }
  const enrichedAction = {
    ...action,
    actionId: String(action?.actionId || createKingdomActionId()),
    expectedRevision: Math.max(0, Number(s?.revision) || 0)
  };
  if (!isNetModeActive() || tkNet.isHost) {
    await localApply?.(enrichedAction);
    queueStatePublish();
    return true;
  }
  const ok = await sendRoomAction(enrichedAction);
  if (!ok) {
    showPlayError('通信に失敗しました。少し待って再実行してください。');
  }
  return ok;
}

function humanPlay() {
  if (!s || !s.roundActive) return;
  if (!isKingdomLocalPrivateStateReady()) {
    showPlayError('手札を安全に同期しています。少し待って再実行してください。');
    return;
  }
  const me = getLocalPlayerIndex();
  if (me < 0 || !s.players?.[me]) return;
  if (!isKingdomBattlePlayerConscious(me)) {
    s.selected.clear();
    showPlayError('戦闘不能中はカードを出せません。');
    render();
    return;
  }
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
    { type: 'play', selectedCardIds: built.play.selectedIds.slice() },
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
  ui.kingdomOverlay = document.getElementById('tarotKingdomEffectOverlay');
  ui.kingdomCutin = document.getElementById('tarotKingdomCutin');
  ui.stateText = document.getElementById('tarotKingdomStateText');
  ui.battleStage = document.getElementById('tarotKingdomBattleStage');
  ui.battleArena = ui.battleStage?.querySelector('.tarot-kingdom-battle-arena') || null;
  ui.battleEnemy = ui.battleStage?.querySelector('.tarot-kingdom-battle-enemy') || null;
  ui.battleEnemyEyebrow = ui.battleEnemy?.querySelector('.tarot-kingdom-battle-eyebrow') || null;
  ui.battleEnemyName = document.getElementById('tarotKingdomEnemyName');
  ui.battleEnemyHpText = document.getElementById('tarotKingdomEnemyHpText');
  ui.battleEnemyHpFill = document.getElementById('tarotKingdomEnemyHpFill');
  ui.battleEnemyHpTrack = ui.battleStage?.querySelector('.tarot-kingdom-battle-hp') || null;
  ui.battleEnemySprite = document.getElementById('tarotKingdomEnemySprite');
  ui.demoEnemySelect = document.getElementById('tarotKingdomDemoEnemySelect');
  ui.demoBattlefieldSelect = document.getElementById('tarotKingdomDemoBattlefieldSelect');
  ui.demoPetSelect = document.getElementById('tarotKingdomDemoPetSelect');
  if (ui.demoBattlefieldSelect && window.__TAROT_KINGDOM_PREVIEW__ === true) {
    const battlefieldOptions = getKingdomDemoBattlefieldOptions().map((battlefield) => {
      const option = document.createElement('option');
      option.value = battlefield.id;
      option.textContent = battlefield.shipSide ? `${battlefield.label}（船上）` : battlefield.label;
      return option;
    });
    ui.demoBattlefieldSelect.replaceChildren(...battlefieldOptions);
    ui.demoBattlefieldSelect.value = 'moonlit-ruins';
    ui.demoBattlefieldSelect.addEventListener('change', () => {
      void setKingdomDemoBattlefield(ui.demoBattlefieldSelect.value);
    });
  }
  if (ui.demoEnemySelect && window.__TAROT_KINGDOM_PREVIEW__ === true) {
    const demoOptions = getKingdomDemoMonsterOptions();
    const optionGroups = [1, 2, 3].map((volume) => {
      const group = document.createElement('optgroup');
      group.label = `Pixel Monsters Vol.${volume}`;
      demoOptions.filter((monster) => monster.volume === volume).forEach((monster) => {
        const option = document.createElement('option');
        option.value = monster.id;
        option.textContent = `#${String(monster.number).padStart(2, '0')} ${monster.name}`;
        group.appendChild(option);
      });
      return group;
    });
    ui.demoEnemySelect.replaceChildren(...optionGroups);
    ui.demoEnemySelect.value = kingdomDemoEnemyId || KINGDOM_MONSTER_ROSTER[0].id;
    ui.demoEnemySelect.addEventListener('change', () => {
      setKingdomDemoEnemy(ui.demoEnemySelect.value);
    });
  }
  if (ui.demoPetSelect && window.__TAROT_KINGDOM_PREVIEW__ === true) {
    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = 'なし';
    const demoPetOptions = getKingdomDemoPetOptions();
    const optionGroups = [1, 2, 3].map((volume) => {
      const group = document.createElement('optgroup');
      group.label = `Pixel Monsters Vol.${volume}`;
      demoPetOptions.filter((monster) => monster.volume === volume).forEach((monster) => {
        const option = document.createElement('option');
        option.value = monster.id;
        option.textContent = `#${String(monster.number).padStart(2, '0')} ${monster.name}`;
        group.appendChild(option);
      });
      return group;
    });
    ui.demoPetSelect.replaceChildren(noneOption, ...optionGroups);
    ui.demoPetSelect.value = kingdomDemoPetId;
    ui.demoPetSelect.addEventListener('change', () => {
      setKingdomDemoPet(ui.demoPetSelect.value);
    });
  }
  ui.battleFeed = document.getElementById('tarotKingdomBattleFeed');
  ui.battleParty = document.getElementById('tarotKingdomBattleParty');
  if (ui.kingdomCutin && ui.battleStage && ui.kingdomCutin.parentElement !== ui.battleStage) {
    ui.battleStage.appendChild(ui.kingdomCutin);
  }
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
  ui.graveToggleButton = document.getElementById('tarotKingdomGraveToggleButton');
  ui.selectedEffect = document.getElementById('tarotKingdomSelectedEffect');
  ui.yourTurnBadge = document.getElementById('tarotKingdomYourTurnBadge');
  ui.players = document.getElementById('tarotKingdomPlayers');
  ui.trick = document.getElementById('tarotKingdomTrick');
  ui.hand = document.getElementById('tarotKingdomHand');
  ui.handCount = document.getElementById('tarotKingdomHandCount');
  ui.log = document.getElementById('tarotKingdomLog');
  ui.judgmentArea = document.getElementById('tarotKingdomJudgmentArea');
  ui.judgmentTitle = document.getElementById('tarotKingdomJudgmentTitle');
  ui.judgmentOptions = document.getElementById('tarotKingdomJudgmentOptions');
  ui.judgmentSkipButton = document.getElementById('tarotKingdomJudgmentSkipButton');
  exposeTarotKingdomDebugTools();
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
    handleKingdomOfflineStartClick().catch((error) => {
      console.warn('[tarotKingdom] offline start click failed:', error);
      if (s) {
        s.message = 'オフライン開始に失敗しました。能力・装備の読込を確認してください。';
        render();
      }
    });
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
  ui.clearButton?.addEventListener('click', () => {
    if (s?.selected && s.selected.size > 0) {
      clearSelectedCards(true);
      return;
    }
    toggleLocalHandSortMode();
  });
  const requestHumanDraw = () => {
    const me = getLocalPlayerIndex();
    requestHostAction({ type: 'draw' }, () => {
      if (s?.phase === 'draw' && s.pendingDraw === me) applyDrawChoice();
    }).catch((error) => {
      console.warn('[tarotKingdom] draw action failed:', error);
    });
  };
  ui.playButton?.addEventListener('click', () => {
    const me = getLocalPlayerIndex();
    if (s?.selected && s.selected.size > 0) {
      humanPlay();
      return;
    }
    if (s?.roundActive && s.phase === 'draw' && s.pendingDraw === me) {
      requestHumanDraw();
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
    const actionState = getKingdomSettlementActionState(s);
    if (!actionState) return;
    if (actionState.kind === 'explorationComplete') {
      settleKingdomExplorationSession('completed');
      return;
    }
    if (actionState.kind === 'restart') {
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
  if (getTarotKingdomDebugMode() === 'done') {
    injectTarotKingdomDebugMatchDone({
      winnerIndex: getTarotKingdomDebugWinnerIndex()
    });
    return;
  }
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

export async function startTarotKingdomExplorationBattle(context = {}) {
  bindUi();
  if (kingdomExplorationSession) {
    settleKingdomExplorationSession('replaced');
  }
  const requestedStageMonsters = Array.isArray(context?.monsters) ? context.monsters : [];
  const requestedMonsterId = String(
    requestedStageMonsters[0]?.monsterId || context?.monsterId || ''
  ).trim();
  const monster = KINGDOM_MONSTER_ROSTER.find((entry) => entry.id === requestedMonsterId) || KINGDOM_DEFAULT_MONSTER;
  kingdomExplorationMonsterId = monster.id;
  const destinationId = String(context?.destinationId || '').trim();
  const requestedMode = context?.mode === 'online' ? 'online' : 'offline';
  const battlefield = createTarotKingdomBattlefieldSnapshot(
    destinationId,
    String(context?.battlefieldId || '')
  );
  await preloadKingdomBattlefieldImage(battlefield.id);
  let currentPet = context?.currentPet && typeof context.currentPet === 'object'
    ? cloneKingdomSnapshotValue(context.currentPet, null)
    : null;
  if (requestedMode === 'offline' && !currentPet) {
    const playFabId = String(window.myPlayFabId || '').trim();
    if (playFabId) {
      try {
        const petState = await getTarotKingdomPetState(playFabId, { isSilent: true });
        currentPet = petState?.currentPet && typeof petState.currentPet === 'object'
          ? cloneKingdomSnapshotValue(petState.currentPet, null)
          : null;
      } catch (error) {
        console.warn('[tarotKingdom] pet roster load failed; starting three-player exploration:', error);
      }
    }
  }
  const normalizedContext = {
    explorationId: String(context?.explorationId || ''),
    destinationId,
    destinationName: String(context?.destinationName || ''),
    stageNo: Math.max(0, Math.min(11, Math.floor(Number(context?.stageNo) || 0))),
    stageId: String(context?.stageId || ''),
    atmosphereTone: String(context?.atmosphereTone || ''),
    battlefieldId: battlefield.id,
    monsterId: monster.id,
    monsterName: monster.name,
    isBoss: monster.isBoss === true,
    monsters: requestedStageMonsters.map((entry) => ({ ...entry })),
    supplyQueue: Array.isArray(context?.supplyQueue)
      ? context.supplyQueue.slice(0, TOTAL_HANDS - 1).map((entry) => ({ ...entry }))
      : [],
    mode: requestedMode,
    currentPet: requestedMode === 'offline' ? currentPet : null
  };
  const completion = new Promise((resolve) => {
    kingdomExplorationSession = { context: normalizedContext, resolve };
  });
  document.body?.classList.add('tarot-kingdom-exploration-session');
  if (normalizedContext.explorationId) {
    document.body?.setAttribute('data-tarot-kingdom-exploration-id', normalizedContext.explorationId);
  }
  if (normalizedContext.destinationId) {
    document.body?.setAttribute('data-tarot-kingdom-destination-id', normalizedContext.destinationId);
  }
  document.body?.setAttribute('data-tarot-kingdom-battlefield-id', normalizedContext.battlefieldId);
  if (normalizedContext.atmosphereTone) {
    document.body?.setAttribute('data-tarot-kingdom-atmosphere-tone', normalizedContext.atmosphereTone);
  }
  document.body?.setAttribute('data-tarot-kingdom-entry-mode', normalizedContext.mode);
  resetMatch();
  const applyExplorationStageToCurrentState = () => {
    const stage = normalizeKingdomExplorationStageState({
      version: 1,
      stageNo: normalizedContext.stageNo,
      stageId: normalizedContext.stageId,
      stageName: normalizedContext.destinationName,
      battlefieldId: normalizedContext.battlefieldId,
      atmosphereTone: normalizedContext.atmosphereTone,
      monsters: normalizedContext.monsters,
      supplyQueue: normalizedContext.supplyQueue
    });
    if (!stage || !s) return null;
    s.stage = stage;
    s.rules = normalizeKingdomRules({
      ...s.rules,
      stageVersion: 1
    });
    s.battle = createKingdomBattleState(
      0,
      false,
      normalizedContext.destinationId,
      Number(s.rules.enemyCombatVersion || 1),
      s.players.length,
      stage
    );
    return stage;
  };
  applyExplorationStageToCurrentState();
  try {
    if (requestedMode === 'online') {
      teardownTarotKingdomNetwork();
      netForceCreateRoom = true;
      if (s) {
        s.message = `${normalizedContext.destinationName || '島'} STAGE ${normalizedContext.stageNo || 1}へ進攻。救難信号を準備しています...`;
        render();
      }
      await activateKingdomOnlineMode();
      applyExplorationStageToCurrentState();
      if (s && isNetModeActive() && tkNet.isHost) {
        const rescueTarget = [normalizedContext.destinationName, monster.name]
            .filter(Boolean)
            .filter((value, index, values) => values.indexOf(value) === index)
            .join('・');
        s.message = `救難信号を発信中。${rescueTarget || '探索先'}への救援を待っています。`;
        render();
        queueStatePublish(true);
      }
    } else {
      activateKingdomOfflineMode({
        renderNow: false,
        message: `${normalizedContext.destinationName || '島'} STAGE ${normalizedContext.stageNo || 1}・ENEMY 1/${TOTAL_HANDS}: ${monster.name}`
      });
      applyExplorationStageToCurrentState();
      await startOrNext();
    }
  } catch (error) {
    settleKingdomExplorationSession('failed');
    throw error;
  }
  return completion;
}

export function destroyTarotKingdomPage() {
  if (kingdomExplorationSession) {
    settleKingdomExplorationSession('cancelled');
  }
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
  clearKingdomTransitionTimer();
  clearKingdomCardDealFx();
  kingdomStateGeneration += 1;
  kingdomCharacterLoadPromise = null;
  kingdomRoundStartPromise = null;
  resetKingdomBattleAvatarVisuals({ remove: true });
  clearKingdomMonsterFrameTimer();
  clearKingdomEnemyFinisherTimer();
  kingdomMonsterAnimationKey = '';
  kingdomBattleVisualEventKey = '';
  kingdomBattleTerminalFxEventKey = '';
  if (kingdomBattleVisualResetTimer) {
    clearTimeout(kingdomBattleVisualResetTimer);
    kingdomBattleVisualResetTimer = null;
  }
  clearNpcTimer();
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
    ui.kingdomCutin.className = 'tarot-cutin';
    ui.kingdomCutin.replaceChildren();
    ui.kingdomCutin.setAttribute('aria-hidden', 'true');
    ui.kingdomCutin.style.removeProperty('--tk-action-cutin-y');
    ui.kingdomCutin.style.removeProperty('--tk-action-cutin-duration');
  }
  ui.kingdomOverlay?.classList.remove('show', 'is-kingdom-clear', 'is-kingdom-draw', 'is-kingdom-roundend', 'is-kingdom-call', 'is-kingdom-call-freeze');

  if (ui.trick) ui.trick.innerHTML = '';
  if (ui.hand) ui.hand.innerHTML = '';
  if (ui.handCount) ui.handCount.textContent = '0';
  ui.root?.classList.remove('is-battle-active', 'is-summon-cinematic');
  ui.root?.style.removeProperty('--summon-elapsed');
  if (ui.root) {
    delete ui.root.dataset.summonEffect;
    delete ui.root.dataset.summonCategory;
  }
  ui.battleStage?.classList.remove('is-summon-cinematic');
  ui.battleStage?.style.removeProperty('--summon-elapsed');
  if (ui.battleStage) {
    delete ui.battleStage.dataset.summonEffect;
    delete ui.battleStage.dataset.summonCategory;
    ui.battleStage.querySelector(':scope > .tarot-kingdom-skill-cutin')?.remove();
  }
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
