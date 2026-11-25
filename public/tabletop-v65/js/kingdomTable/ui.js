import { resolveTableLanguage, getTableLanguage, setTableLanguage, formatScoreHan, localizedLabel } from './tableLocale.js?v=2';
import { createTutorialMode, tutorialIndex, NAMES as TUTORIAL_NAMES } from './tutorialMode.js?v=named-han-locale-v2';
import { installTavernMenu } from './tavernMenu.js?v=match-return-cpu-v1';
import { tableSeatCues } from './turnOrder.js?v=field-owner-v1';
import { cardInspectDetails } from './cardAbility.js?v=pirate-ability-v1-named-han-v3';
import { installHandInspect } from './handInspect.js?v=hand-inspect-v1';
import { choiceFocusState, renderChoiceFocus } from './choiceFocus.js?v=quiet-abilities-v1';
import { ABILITY, playAbility } from './abilityNames.js?v=pirate-ability-v1';
import {roleFace} from './roleCinematic.js?v=sites-role-timing-v1';
// Tarot Kingdom, table version: the screen. You sit at seat 0; the other seats are computer players.
import * as Rules from './rules.js?v=suit-opposition-v1-named-han-v3';
import { roleName as ruleRoleName, roleHan } from './rules.js?v=suit-opposition-v1-named-han-v3';
import { createMatch, startRound, settleRound, ranking, seatHan, roundLabel, settlementHanBreakdown, formatHanEntry } from './match.js?v=named-han-locale-v2';
import { chooseAction, cpuActionDelay, isCpuOpening, CPU_OPENING_MS } from './ai.js?v=suit-opposition-v1-named-han-v3';
import { PIRATE_TAROT_ARTWORK_VERSION } from '../../assets/pirate-tarot/version.js';
import * as Fx from './effects.js?v=field-pose-v1';
import { multiCutBeatMs, flashRuleProp, cancelRulePropAnimations, renderRuleProps } from './ruleProps.js?v=table-cues-v4';
import {layoutRole,makeRoleJuice} from './roleJuicePlan.js?v=role-foley-v1';
import {animateRole} from './roleJuice.js?v=whisky-v2-field-pose-v1';
import {roleCheers} from './cheerPlan.js?v=viewer-cheers-opponent-reply-v1';
import { crowdPreviewActive, previewCrowdPlan } from './roleCrowdPreview.js?v=round-score-v1';
import {roleAccentKey} from './roleAccents.js?v=role-foley-v1';
import * as Sfx from './sfx.js?v=whisky-v2';
import { Music } from './music.js?v=victory-mix-v1';
import { bindMusicSession } from './musicSession.js?v=home-title-v1';
import { updateAcquisition, updateTurns } from './tableFeedback.js?v=1';
import { sortByNumber, displayHand, moveCard, installHandDrag } from './handOrder.js?v=suit-cycle-v1';
import { calculateRating, makeOpponents, RATING_RULES } from './rating.js';
import * as tableHostAdapter from './localTable.js?v=table-host-v1';
import { resolveTableHost } from './tableHost.js?v=table-host-v1';
import { getAvatar, avatarImage, createLocalAvatar, fitOpponentFanWidth, avatarGripClip } from './avatarArt.js?v=roster-kraken-ink-v1';
import { openingRoleName as ruleOpeningRoleName } from './roleRecordKey.js?v=piece-of-eight-v1';

let NAMES = ['あなた', 'カイ', 'ミナ', 'ロウ'];
const SUIT_NAME = { wand: 'ワンド', sword: 'ソード', cup: 'カップ', coin: 'ペンタクル' };
const MAJOR = ['愚者', '魔術師', '女教皇', '女帝', '皇帝', '法王', '恋人', '戦車', '力', '隠者', '運命', '正義',
    '吊人', '死神', '節制', '悪魔', '塔', '星', '月', '太陽', '審判', '世界'];
const ME = 0;
const PORTRAIT_ART = 'assets/tarot-kingdom-table/tavern-v2';
const SEAT_PORTRAITS = { 1: 'rogue', 2: 'captain', 3: 'sailor' };
const OPPONENT_HAND_POSES = {
    captain: { x: 0.55, y: 0.79, angle: 8 },
    sailor: { x: 0.47, y: 0.65, angle: 6 },
    rogue: { x: 0.40, y: 0.73, angle: -8 }
};
const OPPONENT_PORTRAIT_INK = {"avatar-0":[0.05,0.96406],"avatar-1":[0,1],"avatar-2":[0.01406,0.98125],"avatar-3":[0.02031,0.975],"avatar-4":[0,1],"avatar-5":[0.09375,0.90469],"avatar-6":[0.025,0.975],"avatar-7":[0.07344,0.92656],"avatar-8":[0.05937,0.83594],"avatar-9":[0.06406,0.93594],"avatar-10":[0.14063,0.86875],"avatar-11":[0.07813,0.92031],"avatar-12":[0.07813,0.92031],"avatar-13":[0.075,0.925],"avatar-14":[0.13906,0.86094],"avatar-15":[0.08438,0.91406],"avatar-16":[0.146875,0.8484375],"avatar-17":[0.03831,0.98992],"avatar-18":[0.14531,0.85313],"avatar-19":[0.17969,0.90469],"avatar-20":[0.08281,0.91406],"avatar-21":[0.12656,0.86406],"captain":[0.14844,0.85469],"rogue":[0.07187,0.9625],"sailor":[0.025,1]};
const OPPONENT_FAN = { minWidth: 12, maxWidth: 21, portraitWidthRatio: 0.14, angleStep: 8, spacingRatio: 0.16, plateOverlap: 7 };
// Avoid faces where the original pose holds cards high. Other grips are untouched.
const OPPONENT_FACE_CLEARANCE = {
    2: { x: 0.10, y: 0.10, angle: 66 },
    3: { x: 0.06, y: 0.10, angle: 46 },
    9: { x: 0.04, y: 0.08, angle: 44 },
    12: { x: 0.04, y: 0.08, angle: 40 },
    17: { x: 0.06, y: 0.08, angle: 62 },
    18: { x: 0.05, y: 0.13, angle: 56 },
    20: { x: 0.05, y: 0.12, angle: 62 },
    21: { x: 0.04, y: 0.07, angle: 55 },
};
const HAND_FAN_ANGLE_STEP = 1.5;
const HAND_FAN_CURVE_STEP = 2;
const VISIBLE_FIELD_PLAYS = 6;
// Base CPU pacing is shared with the server. Field sweep and winning-card holds are separate.
const WIN_CARD_HOLD_MS = 3000;
let pendingAgari=null;
// Han at or above these values get a bigger presentation.
const BIG_HAN = 4;
const LEGEND_HAN = 10;

// Pirate Tarot artwork, as served for the rest of the app (same version and delivery revision, so the cache is shared).
const ART_QUERY = `?v=${PIRATE_TAROT_ARTWORK_VERSION}&delivery=20261025`;
import {selectedCardEffect} from './selectedCardEffect.js?v=suit-opposition-v1-named-han-v3';

const { online, send, sendAction, returnToLobby, waitForCpuPresentation } =
    resolveTableHost(document.documentElement.dataset.tabletopHost, tableHostAdapter);

const ART_SUIT = { wand: 'wand', sword: 'sword', cup: 'cup', coin: 'pentacle' };
const ART_FACE = { 11: 'page', 12: 'knight', 13: 'queen', 14: 'king', 15: '1' };
const artId = (card) => (card.major ? `major-${card.num}` : `${ART_SUIT[card.suit]}-${ART_FACE[card.num] || card.num}`);
const artUrl = (card, size) => `/assets/pirate-tarot/${size}/${artId(card)}.webp${ART_QUERY}`;
const BACK_URL = `/assets/pirate-tarot/back.webp${ART_QUERY}`;

const $ = (id) => document.getElementById(id);
const localPortrait = createLocalAvatar(BACK_URL);
let practiceAvatar = null;
let displayedOnlineVictory = null;
let liveVictoryRound = null;
let restoredFinishedRound = null;
const resultIdentity = () => online.view ? `${online.view.code}:${match.played}` : match.round;
const displayedPracticeVictories = new WeakSet();
const seatAvatar = seat => online.view ? getAvatar(online.view.members[seat]?.avatarId) : seat === ME ? practiceAvatar : null;
const params = new URLSearchParams(location.search);
const tutorialChapter = tutorialIndex(params);
let tutorial = null;
const ratingPreview = false; // TROY local practice has no ranking or account.
let playerRating = RATING_RULES.initial;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const seatObserver = new ResizeObserver((entries) => {
    for (const { target } of entries) {
        positionOpponentHand(target);
        fitOpponentName(target);
    }
});

const HINTS_KEY = 'tarot-kingdom-table:turn-hints';
let turnHints = false;
try { turnHints = localStorage.getItem(HINTS_KEY) === 'on'; } catch { /* Device storage can be blocked. */ }

let match = null;
let selected = new Set();
let manualHandOrder = null;
let arranging = false;
let movingCard = null;
let timer = 0;
let pendingCpuAction = null;
let fieldSweep = null;
let resultTimer = 0;
let resultRoundKey = null;
let cpuExitPrompt = false;
let fast = false;
let seenEvents = 0;
let hint = '';
let acquisition = null;
let turnFeedback = null;
let feedbackGeneration = 0;
let propVisibilityGeneration = 0;
let fieldKey = '';
let zoomTrigger = null;
let inspectTrigger = null;
let graveTrigger = null;
// Where your played cards were in the hand, so they can fly from there to the field.
let playOrigins = new Map();

// `?seed=` fixes the shuffle so a hand can be replayed.
function makeRng(salt = 0) {
    if (!params.has('seed')) return Math.random;
    let seed = (Number(params.get('seed')) ^ salt) >>> 0;
    return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const tableLanguage = () => resolveTableLanguage(getTableLanguage(), navigator.languages?.[0] || navigator.language);
const roleName = role => localizedLabel(ruleRoleName(role), tableLanguage());
const openingRoleName = parity => localizedLabel(ruleOpeningRoleName(parity), tableLanguage());
const justiceName = () => localizedLabel('正義執行', tableLanguage());
const temperanceName = () => localizedLabel('清めの杯', tableLanguage());

const rankText = card => !card.major && card.num === 15 ? 'A' : String(card.num);
const cardName = (card) => (card.major ? `大札${card.num} ${MAJOR[card.num]}` : `${SUIT_NAME[card.suit]}の${rankText(card)}`);
const sortHand = sortByNumber;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function artImage(src, className) {
    const image = el('img', className);
    image.src = src;
    image.alt = '';
    image.decoding = 'async';
    image.draggable = false;
    // The rank overlay stays readable if the picture cannot load.
    image.addEventListener('error', () => image.remove(), { once: true });
    return image;
}

// Fill the frame with artwork and keep only a compact rank over its top-left corner.
function cardNode(card, tag = 'div') {
    const node = el(tag, 'kt-card');
    node.dataset.suit = card.major ? 'major' : card.suit;
    // Use the rule engine's suit membership, including the magician's four suits.
    const suits = Rules.suitsOf(card);
    node.dataset.suits = suits.join(' ');
    node.dataset.suitCount = String(suits.length);
    node.dataset.card = card.id;
    const image = artImage(artUrl(card, 'thumbs'), 'kt-card-art');
    image.width = 160;
    image.height = 240;
    const rank = el('span', 'kt-card-rank');
    const value = el('span', 'kt-card-value');
    if (card.major && card.num >= 16 && card.num <= 19) {
        value.append(el('span', 'kt-card-major-digit', '1'), String(card.num % 10));
    } else value.textContent = rankText(card);
    rank.append(value);
    node.append(image, rank);
    if (tag === 'button') node.type = 'button';
    node.setAttribute('aria-label', cardName(card));
    node.title = cardName(card);
    return node;
}

function openZoom(card, trigger) {
    const zoom = $('ktZoom');
    zoomTrigger = trigger;
    const name = cardName(card);
    zoom.replaceChildren(artImage(artUrl(card, 'cards'), 'kt-zoom-art'), el('span', 'kt-zoom-name', name));
    zoom.setAttribute('aria-label', `${name}を閉じる`);
    zoom.hidden = false;
    zoom.focus({ preventScroll: true });
}

// A public card you can tap to see the full artwork.
function zoomableCard(card) {
    const node = cardNode(card, 'button');
    node.classList.add('is-zoomable');
    node.setAttribute('aria-label', `${cardName(card)}を大きく見る`);
    node.addEventListener('click', () => openZoom(card, node));
    return node;
}

function closeZoom() {
    $('ktZoom').hidden = true;
    const fallback = !$('ktGraveDialog').hidden ? $('ktGraveClose')
        : !$('ktDialog').hidden ? $('ktDialogActions').querySelector('button')
        : $('ktFieldCards').querySelector('button');
    (zoomTrigger?.isConnected ? zoomTrigger : fallback)?.focus({ preventScroll: true });
    zoomTrigger = null;
}

function openHandInspector(card, trigger) {
    const dialog = $('ktHandInspector');
    const details = $('ktInspectDetails');
    const { effects, flavor } = cardInspectDetails(card);
    inspectTrigger = trigger;
    $('ktInspectTitle').textContent = cardName(card);
    $('ktInspectArt').replaceChildren(artImage(artUrl(card, 'cards'), 'kt-inspect-image'));
    const rows = el('dl', 'kt-inspect-effects');
    for (const { label, text } of effects) {
        const row = el('div', 'kt-inspect-row');
        row.append(el('dt', 'kt-inspect-label', label + '：'), el('dd', 'kt-inspect-effect', text));
        rows.append(row);
    }
    details.replaceChildren(effects.length ? rows : el('p', 'kt-inspect-effect', '固有効果なし'));
    if (flavor) details.append(el('p', 'kt-inspect-flavor', flavor));
    dialog.showModal();
    details.scrollTop = 0;
}

$('ktInspectClose').addEventListener('click', () => $('ktHandInspector').close());
$('ktHandInspector').addEventListener('close', () => {
    if ($('ktHandInspector').open) return;
    const fallback = !$('ktDialog').hidden ? $('ktDialogActions').querySelector('button')
        : !$('ktGraveDialog').hidden ? $('ktGraveClose') : $('ktHand').querySelector('button') ?? $('ktSettings');
    (inspectTrigger?.isConnected && $('ktDialog').hidden && $('ktGraveDialog').hidden
        ? inspectTrigger : fallback)?.focus({ preventScroll: true });
    inspectTrigger = null;
});

function resetDrawFeedback() {
    acquisition = null;
    turnFeedback = null;
    feedbackGeneration++;
    for (const node of document.querySelectorAll('[data-kt-feedback]')) delete node.dataset.ktFeedback;
}

const drawnCard = () => match.round.players[ME].hand.find(card => card.id === acquisition?.id);
const acquiredCardLabel = () => ({ give: '受け取った札', devilCardTransfer: '交換で受け取った札',
    exchange: '交換で引いた札' })[acquisition?.source] ?? '引いた札';

function describe(event) {
    const who = event.by === undefined ? '' : NAMES[event.by];
    const dramatic = (event.type === 'cut' || event.type === 'back' || event.type === 'clear') ? namedConsequence(match?.round.events ?? [], event) : null;
    switch (event.type) {
    case 'deal': return '最初の手札を配りました';
    case 'start': return `最初の場札は ${cardName(event.cards[0])}`;
    case 'play': {
        if (event.kind === 'call') return `${who} がコール：${roleName(event.role)}`;
        if (event.kind === 'role') return `${who} が ${roleName(event.role)}`;
        return `${who} が ${event.cards.map(cardName).join('、')}`;
    }
    case 'pass': return `${who} はパス`;
    case 'draw': return event.by === ME && drawnCard() ? `引いた札：${cardName(drawnCard())}` : `${who} が1枚引いた`;
    case 'cede': return `${who} は初手を出せず、親を渡した`;
    case 'clear': return `${dramatic ? dramatic.label + '：' : ''}場が流れ、${who} が親`;
    case 'han': return `${who} の${roleName(event.role)}が通って +${event.add}翻`;
    case 'justiceHan': return `${who}：${justiceName()} +${formatScoreHan(event.add, tableLanguage())}`;
    case 'temperanceHan': return `${who}：${temperanceName()} +${formatScoreHan(event.add, tableLanguage())}`;
    case 'majorClear': return `${who} の大札${event.num}が場を流して +${event.add}翻`;
    case 'exchange': return event.by === ME && drawnCard() ? `交換で引いた札：${cardName(drawnCard())}` : `${who} が手札1枚を捨てて交換`;
    case 'devil': return `${who} の悪魔が通って +${event.add}翻`;

    case 'back': return dramatic ? dramatic.label + (event.on ? '：強弱が逆に' : '：強弱を元に戻す') : event.on ? '11バック：強弱が逆に' : '11バック解除';
    case 'lock': return `スートロック：${Rules.lockSuits(event.suit).map(suit => SUIT_NAME[suit]).join('・')}`;
    case 'unlock': return 'ロック解除';
    case 'reset': return ABILITY.clearance + '：効果をリセット';
    case 'cut': return dramatic ? dramatic.label + '：通常出しは世界のみ' : '8カット：コールかパスのみ';
    case 'skip': return `スキップ ${event.count}人`;
    case 'deathSwapStart': return `${who} が${event.devil ? ABILITY.devil : '死神の交換'}を発動`;
    case 'deathSwapComplete': return (event.devil ? ABILITY.devil : '死神の交換') + 'が終了';
    case 'deathDecree': return `${ABILITY.death}：${NAMES[event.from]} が${cardName(event.card)}を捨てた`;
    case 'devilHanTransfer': return `悪魔：${NAMES[event.from]} から ${who} へ1翻`;
    case 'give': return `${ABILITY.hang}：${who} が ${NAMES[event.to]} に手札1枚を渡した`;
    case 'trash': return `${who} が手札1枚を除外`;
    case 'retrieve': return `${ABILITY.resurrection}：${who} が ${NAMES[event.from]} の墓地から1枚回収`;
    case 'win': return event.openingWin ? `${who} の${openingRoleName(event.openingWin)}` : event.method === 'give' ? `${who} が札を渡して上がり` : event.method === 'trash' ? `${who} が除外で上がり` : `${who} が上がり${event.lastCardHan ? `：切札 +${event.lastCardHan}翻` : ''}`;
    case 'drawn': return '全員が出せず、引き分け';
    default: return '';
    }
}

function seatSlots() {
    return match.seats === 4
        ? [[1, $('ktSeatRight')], [2, $('ktSeatTop')], [3, $('ktSeatLeft')]]
        : [[1, $('ktSeatRight')], [2, $('ktSeatLeft')]];
}

function badges(seat) {
    const round = match.round;
    const list = [];
    if (round.dealer === seat) list.push(['親', 'dealer']);
    if (round.passed.includes(seat)) list.push(['パス', 'pass']);
    const host = el('span', 'kt-badges');
    host.append(...list.map(([text, kind]) => el('span', `kt-badge kt-badge-${kind}`, text)));
    return host;
}

const hanPill = (seat) => el('span', 'kt-han-pill', `${seatHan(match, seat, { preview: seat === ME })}翻`);

// Match the grip in the actual contained image, including the empty space around it.
function positionOpponentHand(host) {
    const portrait = host.querySelector('.kt-seat-portrait');
    if (!portrait?.naturalWidth || !host.clientWidth) return;
    const fan = host.querySelector('.kt-opponent-hand');
    const avatar = host.dataset.avatarId !== '' ? getAvatar(Number(host.dataset.avatarId)) : null;
    const pose = avatar ?? OPPONENT_HAND_POSES[host.dataset.portrait];
    const clearance = avatar && !avatar.registeredGrip && !avatar.redrawn && OPPONENT_FACE_CLEARANCE[avatar.id];
    if (!pose) return;
    const seat = host.getBoundingClientRect();
    if (getComputedStyle(host).getPropertyValue('--kt-seat-zoom-mode').trim() === '1') {
        const app = host.closest('.kt-app').getBoundingClientRect();
        const paintedWidth = Math.min(portrait.clientWidth, portrait.clientHeight * portrait.naturalWidth / portrait.naturalHeight);
        const spread = parseFloat(getComputedStyle(host).getPropertyValue('--kt-seat-art-spread')) || 0;
        const [inkLeft, inkRight] = OPPONENT_PORTRAIT_INK[host.dataset.portrait] ?? [0, 1];
        const lower = Math.max(0, app.left) + paintedWidth * (.5 - inkLeft) + 2;
        const upper = Math.min(document.documentElement.clientWidth, app.right) + paintedWidth * (.5 - inkRight) - 2;
        const center = Math.max(lower, Math.min(upper, seat.left + seat.width / 2 + spread));
        host.style.setProperty('--kt-art-center', (center - seat.left) + 'px');
    }
    const box = portrait.getBoundingClientRect();
    const scale = Math.min(box.width / portrait.naturalWidth, box.height / portrait.naturalHeight);
    const width = portrait.naturalWidth * scale;
    const height = portrait.naturalHeight * scale;
    const left = box.left - seat.left + (box.width - width) / 2;
    const top = box.top - seat.top + box.height - height;
    const panel = host.querySelector('.kt-seat-panel');
    // The nameplate covers the lower grip; leave every card visible above that edge.
    const gripY = Math.min(top + height * (pose.y + (clearance?.y ?? 0)), panel.offsetTop + OPPONENT_FAN.plateOverlap);
    const cardWidth = Math.max(OPPONENT_FAN.minWidth, Math.min(OPPONENT_FAN.maxWidth, width * OPPONENT_FAN.portraitWidthRatio));
    const gripX = left + width * (pose.x + (clearance?.x ?? 0));
    const angle = clearance?.angle ?? avatar?.opponentAngle ?? pose.angle;
    let fanWidth = cardWidth * (avatar?.fanScale ?? 1);
    if (host.classList.contains('kt-seat-right') || host.classList.contains('kt-seat-left')) {
        const app = host.closest('.kt-app').getBoundingClientRect();
        const right = host.classList.contains('kt-seat-right');
        const available = right ? Math.min(document.documentElement.clientWidth, app.right) - seat.left - gripX - 2
            : seat.left + gripX - Math.max(0, app.left) - 2;
        fanWidth = fitOpponentFanWidth(fanWidth, available, fan.children.length, right ? angle : -angle,
            avatar?.fanStep ?? OPPONENT_FAN.angleStep, avatar?.spacingRatio ?? OPPONENT_FAN.spacingRatio);
    }
    fan.style.left = `${gripX}px`;
    fan.style.top = `${gripY}px`;
    const fingers = host.querySelector('.kt-seat-grip');
    if (fingers && avatar?.gripMask) {
        fingers.style.clipPath = avatarGripClip(avatar.gripMask, {
            x: (box.width - width) / 2, y: box.height - height, width, height, unit: 'px',
        });
    }
    fan.style.setProperty('--kt-grip-angle', `${angle}deg`);
    fan.style.setProperty('--kt-opponent-card-width', `${fanWidth}px`);
}

function renderOpponentHand(host, count) {
    const fan = host.querySelector('.kt-opponent-hand');
    const changed = fan.dataset.count !== String(count);
    if (changed) {
        const avatar = host.dataset.avatarId === '' ? null : getAvatar(Number(host.dataset.avatarId));
        while (fan.children.length > count) fan.lastElementChild.remove();
        while (fan.children.length < count) {
            const back = artImage(BACK_URL, 'kt-fan-card');
            back.width = 80;
            back.height = 120;
            fan.append(back);
        }
        [...fan.children].forEach((back, index) => {
            const offset = index - (count - 1) / 2;
            back.style.setProperty('--kt-fan-angle', `${offset * (avatar?.fanStep ?? OPPONENT_FAN.angleStep)}deg`);
            back.style.setProperty('--kt-fan-offset', String(offset * (avatar?.spacingRatio ?? OPPONENT_FAN.spacingRatio)));
        });
        fan.dataset.count = String(count);
    }
    fan.hidden = count === 0;
    host.classList.toggle('is-last-card', count === 1);
    if (changed && host.classList.contains('kt-seat-right')) positionOpponentHand(host);
}

function fitOpponentName(host) {
    const slot = host.querySelector('.kt-seat-identity');
    const name = slot?.querySelector('.kt-seat-name');
    if (!name || !slot.clientWidth) return;
    name.style.fontSize = '';
    const width = name.getBoundingClientRect().width;
    if (width > slot.clientWidth) name.style.fontSize = Math.max(10, Math.floor(12 * slot.clientWidth / width * 10) / 10) + 'px';
    const overflow = name.getBoundingClientRect().width > slot.clientWidth;
    name.classList.toggle('is-overflowing', overflow);
    slot.querySelector('.kt-seat-name-full').hidden = !overflow;
}

function renderSeat(seat, host) {
    const round = match.round;
    const count = round.players[seat].hand.length;
    if (host.hidden) host.hidden = false;
    host.classList.toggle('is-turn', round.phase !== 'deathSwap' && round.phase !== 'over' && round.turn === seat);
    host.dataset.seat = String(seat);
    const avatar = seatAvatar(seat);
    const portraitKey = avatar ? 'avatar-' + avatar.id : SEAT_PORTRAITS[seat];
    // Keep portraits through counter updates, but rebind a slot when the seat count changes.
    if (host.dataset.portrait !== portraitKey || !host.querySelector('.kt-seat-panel')) {
        const portrait = artImage(avatar?.portrait ?? `${PORTRAIT_ART}/${SEAT_PORTRAITS[seat]}.webp`, 'kt-seat-portrait');
        portrait.width = 640;
        portrait.height = 560;
        const fan = el('div', 'kt-opponent-hand');
        fan.setAttribute('aria-hidden', 'true');
        const fingers = avatar?.gripMask
            ? [avatarImage(avatar.portrait, 'kt-seat-portrait kt-seat-grip')]
            : [];
        host.replaceChildren(portrait, fan, ...fingers, el('div', 'kt-seat-panel'));
        host.dataset.portrait = portraitKey;
        host.dataset.avatarId = avatar ? String(avatar.id) : '';
        portrait.addEventListener('load', () => positionOpponentHand(host), { once: true });
        seatObserver.observe(host);
    }
    const hand = el('span', 'kt-seat-hand');
    hand.append(el('span', 'kt-seat-hand-label', count === 1 ? 'あと' : '手札'), el('strong', 'kt-seat-count', String(count)), el('span', '', '枚'));
    const identity = el('div', 'kt-seat-identity');
    const name = el('strong', 'kt-seat-name', NAMES[seat]);
    const fullName = el('button', 'kt-seat-name-full', '名前を表示');
    fullName.type = 'button';
    fullName.hidden = true;
    fullName.setAttribute('aria-haspopup', 'dialog');
    fullName.setAttribute('aria-controls', 'ktSeatNameDialog');
    fullName.setAttribute('aria-label', (seat + 1) + '番席の名前を表示');
    fullName.addEventListener('click', () => {
        $('ktSeatNameText').textContent = name.textContent;
        $('ktSeatNameDialog').showModal();
    });
    identity.append(name, fullName);
    const details = el('div', 'kt-seat-details');
    details.append(el('span', 'kt-seat-chips kt-chip', String(match.chips[seat])), hanPill(seat));
    host.querySelector('.kt-seat-panel').replaceChildren(identity, details, hand, badges(seat));
    fitOpponentName(host);
    renderOpponentHand(host, count);
}

// Etched marks for active rules, with text so color never carries the meaning.
const FIELD_MARKS = {
    back: 'M5 3v10m-2-2 2 2 2-2M11 13V3m-2 2 2-2 2 2',
    lock: 'M8 5v8m-3-5h6M2 10c.5 2.8 2.8 4 6 4s5.5-1.2 6-4M2 10l2 1m10-1-2 1M9.5 3.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
    cut: 'M2 6h12M4 10h8M6 13h4',
};

function fieldMark(kind, text) {
    const ns = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(ns, 'svg');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', FIELD_MARKS[kind]);
    icon.append(path);
    const mark = el('span', 'kt-state-pill is-' + kind);
    mark.append(icon, el('span', 'kt-state-label', text));
    return mark;
}

function renderTableSeatCues(round) {
    const box = $('ktTurnOrder');
    const { current, owner } = tableSeatCues(round);
    for (const seat of [ME, ...seatSlots().map(([index]) => index)]) {
        const plate = seatPlate(seat);
        if (!plate) continue;
        // The active seat keeps the brighter cue if it also owns the field.
        const cue = seat === current ? 'current' : seat === owner ? 'owner' : '';
        if (cue && plate.dataset.turn !== cue) plate.dataset.turn = cue;
        else if (!cue && plate.hasAttribute('data-turn')) delete plate.dataset.turn;
    }
    const label = seat => NAMES[seat] || (seat + 1) + '番席';
    const message = [current === null ? '' : '手番：' + label(current),
        owner === null ? '' : '場の札：' + label(owner)].filter(Boolean).join('。');
    if (box.textContent !== message) box.textContent = message;
    box.hidden = !message;
}

function renderField() {
    const round = match.round;
    const host = $('ktFieldCards');
    const exileWin = round.phase === 'over' && round.lastPlay?.type === 'trash';
    // Show the final exiled card during the result pause without putting it back in the field state.
    const plays = exileWin ? [{ by: round.winner, cards: round.lastPlay.cards, exile: true }] : round.field.plays;
    const top = plays[plays.length - 1];
    const key = `${match.roundIndex}:${plays.length}:${top ? top.cards.map((c) => c.id).join(',') : ''}`;
    if (key !== fieldKey) {
        // Rebuilt only when the field changes, so the arrival movement plays once per play.
        fieldKey = key;
        // A called field card moves into that role; do not draw it twice underneath.
        const layers = plays.map((play, index) => ({
            cards: play.call ? [...plays[index - 1].cards, ...play.cards] : play.cards,
            index
        })).filter(({ index }) => !plays[index + 1]?.call).slice(-VISIBLE_FIELD_PLAYS);
        host.replaceChildren(...layers.map(({ cards, index }, layer) => {
            const current = index === plays.length - 1;
            const group = el('div', `kt-field-play ${current ? 'kt-field-top' : 'kt-field-past'}`);
            group.classList.toggle('is-wide', cards.length > 3);
            group.style.zIndex = String(layer);
            // Stable offsets keep a pile still while selecting a card or opening a dialog.
            const seed = cards.reduce((sum, card) => sum + card.num + (card.major ? 7 : Rules.SUITS.indexOf(card.suit)), 0);
            const depth = layers.length - layer - 1;
            const angle = current ? 0 : (seed % 7 - 3) * 0.45;
            group.style.setProperty('--kt-pile-angle', `${angle}deg`);
            group.style.setProperty('--kt-pile-x', `${current ? 0 : (seed * 7 % 11 - 5) * 1.4}px`);
            group.style.setProperty('--kt-pile-y', `${current ? 0 : depth * 1.5}px`);
            if (!current) group.setAttribute('aria-hidden', 'true');
            const role = cards.length===5 ? (current ? round.field.role : Rules.evaluateRole(cards)) : null;
            if (role && cards.length === 5) group.dataset.fieldFan = 'true';
            group.append(...layoutRole(cards,role).map(card => current ? zoomableCard(card) : cardNode(card)));
            return group;
        }));
        if (!layers.length) host.append(el('span', 'kt-field-empty', round.openingWin ? openingRoleName(round.openingWin) : '最初の札を出してください'));
    }
    if (!plays.length) {
        const choosingEffect = { exchange: '交換する手札を1枚選んでください', trash: '除外する手札を1枚選んでください', give: '渡す手札を1枚選んでください', deathSwap: '交換する手札を1枚選んでください', retrieve: '墓地から回収する札を選んでください' };
        host.querySelector('.kt-field-empty').textContent = round.openingWin ? openingRoleName(round.openingWin) : choosingEffect[round.phase] || '最初の札を出してください';
    }
    if (!top) {
        $('ktFieldOwner').textContent = round.openingWin ? `${NAMES[round.winner]} の最初の手札で成立` : round.phase === 'over' ? '' : `${NAMES[round.turn]} の${round.phase === 'exchange' ? '交換' : round.phase === 'trash' ? '除外' : round.phase === 'give' ? '札渡し' : round.phase === 'deathSwap' ? (round.effectTriggerCard?.num === 15 ? ABILITY.devil : '死神の交換') : round.phase === 'retrieve' ? '回収' : '初手'}`;
    } else {
        const lead = top.exile ? `${NAMES[top.by]} が除外して上がり`
            : round.phase === 'over' && round.winner === top.by ? `${NAMES[top.by]} の上がり札`
            : top.start ? '最初の場札' : `${NAMES[top.by]} の札`;
        const role = round.field.kind === 'role' ? round.field.role : null;
        const elemental = ['elemental', 'highElemental', 'quad'].includes(role?.high);
        const han = elemental ? roleHan(role) - (top.call ? Rules.CALL_HAN_PENALTY : 0) : null;
        $('ktFieldOwner').textContent = role ? `${lead}：${roleName(role)}${elemental ? `（${han}翻）` : ''}` : lead;
    }
    const state = [];
    if (round.back) state.push(['back', '11バック']);
    if (round.lock) state.push(['lock', `ロック ${Rules.lockSuits(round.lock).map(suit => SUIT_NAME[suit]).join('・')}`]);
    if (round.cut) state.push(['cut', '8カット']);
    const fieldState = $('ktFieldState');
    fieldState.replaceChildren(...state.map(([kind, text]) => fieldMark(kind, text)));
    fieldState.hidden = !state.length;
    fieldState.classList.toggle('kt-prop-state-only', Boolean(state.length));
    renderRuleProps($('ktRuleProps'), round, { motion: Fx.moving(), animateNew: true });
    $('ktGrave').disabled = round.phase === 'over';
}

function openGraveyard() {
    if (!match || !$('ktGraveDialog').hidden) return;
    cancelHandDrag();
    clearTimeout(timer);
    timer = 0;
    graveTrigger = document.activeElement;
    const round = match.round;
    const sections = [];
    function addSection(label, cards, zone) {
        const section = el('section', 'kt-grave-section');
        section.dataset.zone = zone;
        section.append(el('h3', '', `${label} · ${cards.length}枚`));
        if (cards.length) {
            const row = el('div', 'kt-grave-cards');
            row.append(...sortHand(cards).map(zoomableCard));
            section.append(row);
        } else section.append(el('p', 'kt-grave-empty', 'まだありません'));
        sections.push(section);
    }
    round.players.forEach((player, seat) => addSection(`${NAMES[seat]}の墓地`, player.grave, `grave-${seat}`));
    addSection('大札の除外', round.aside, 'aside');
    round.players.forEach((player, seat) => {
        if (player.exiled.length) addSection(`${NAMES[seat]}が手札から除外`, player.exiled, `exiled-${seat}`);
    });
    $('ktGraveBody').replaceChildren(...sections);
    $('ktGraveDialog').hidden = false;
    $('ktTable').inert = true;
    $('ktDialog').inert = true;
    $('ktGraveClose').focus();
}

function closeGraveyard() {
    $('ktGraveDialog').hidden = true;
    $('ktTable').inert = false;
    $('ktDialog').inert = false;
    if (graveTrigger?.isConnected) graveTrigger.focus({ preventScroll: true });
    graveTrigger = null;
    if (tutorial) tutorial.refresh();
    else if (match && match.round.phase !== 'over') after();
}

// The play the current selection would make, with the reason when it is not allowed.
function selectionPlay() {
    const round = match.round;
    const cards = round.players[ME].hand.filter((c) => selected.has(c.id));
    if (!cards.length) return { cards, res: { ok: false, reason: '' }, kind: 'normal' };
    const kind = cards.length === 5 ? 'role' : cards.length === 4 ? 'call' : 'normal';
    const check = kind === 'role' ? Rules.checkRole : kind === 'call' ? Rules.checkCall : Rules.checkNormal;
    return { cards, kind, res: check(round, ME, cards) };
}

function renderHand(moves = turnHints ? Rules.listMoves(match.round, ME) : []) {
    const round = match.round;
    const myTurn = round.phase === 'deathSwap' ? Rules.deathSwapCanChoose(round,ME) : round.turn === ME && round.phase !== 'over';
    const choosing = myTurn && round.phase === 'play';
    const giving = myTurn && ['give', 'deathSwap'].includes(round.phase);
    const exiling = myTurn && round.phase === 'trash' && !arranging;
    const ferrying = myTurn && round.phase==='ferry';
    const exchanging = myTurn && round.phase === 'exchange' && !arranging;
    const selectingEffect = giving || exiling || exchanging || ferrying;
    const eligible = new Set(exiling ? Rules.trashCandidates(round, ME).map(card => card.id)
        : exchanging ? Rules.exchangeCandidates(round, ME).map(card => card.id)
        : giving ? round.players[ME].hand.map(card => card.id)
        : ferrying ? Rules.ferryCandidates(round,ME).map(card=>card.id) : []);
    const hand = displayHand(round.players[ME].hand, manualHandOrder);
    localPortrait.paint(seatAvatar(ME), hand.length);
    if (manualHandOrder) manualHandOrder = hand.map(card => card.id);
    if (round.phase === 'over' || round.phase === 'retrieve' || ferrying || giving) arranging = false;
    if (!arranging) cancelHandDrag();
    if (!hand.some(card => card.id === movingCard)) movingCard = null;
    const host = $('ktHand');
    const handKey = hand.map((card) => card.id).join(',');
    // Keep the actual buttons while selecting: replacing them drops keyboard focus
    // and restarts the card movement before the selection can be seen.
    if (host.dataset.cards !== handKey) {
        cancelHandDrag();
        const existing = new Map([...host.children].map(node => [node.dataset.card, node]));
        const focus = host.contains(document.activeElement) ? document.activeElement : null;
        host.replaceChildren(...hand.map(card => existing.get(card.id) || cardNode(card, 'button')));
        focus?.focus({ preventScroll: true });
        host.dataset.cards = handKey;
    }
    const playable = new Set();
    if (choosing && turnHints && !arranging) for (const move of moves) for (const c of move.cards) playable.add(c.id);
    [...host.children].forEach((node, index) => {
        const card = hand[index];
        const offset = index - (hand.length - 1) / 2;
        node.style.setProperty('--kt-card-angle', `${offset * HAND_FAN_ANGLE_STEP}deg`);
        node.style.setProperty('--kt-card-offset', `${Math.abs(offset) * HAND_FAN_CURVE_STEP}px`);
        node.style.setProperty('--kt-card-order', String(index));
        node.classList.toggle('is-drawn', card.id === acquisition?.id);
        node.setAttribute('aria-label', `${cardName(card)}${card.id === acquisition?.id ? '（' + acquiredCardLabel() + '）' : ''}`);
        node.classList.toggle('is-selected', selected.has(card.id));
        node.classList.toggle('is-arrange-picked', arranging && movingCard === card.id);
        node.classList.toggle('is-ready', choosing && !arranging && !selected.size && playable.has(card.id));
        node.classList.toggle('is-playable', playable.has(card.id) || selectingEffect && eligible.has(card.id));
        node.classList.toggle('is-dim', !arranging && (choosing && !selected.size && playable.size > 0 && !playable.has(card.id) || selectingEffect && !eligible.has(card.id)));
        node.setAttribute('aria-pressed', String(arranging ? movingCard === card.id : selected.has(card.id)));
        // Keep visible own cards available to inspect even when ordinary play is unavailable.
        node.setAttribute('aria-disabled', String(round.phase === 'over' || round.phase === 'retrieve' || (!arranging && !myTurn) || selectingEffect && !eligible.has(card.id)));
        if (arranging) node.removeAttribute('aria-keyshortcuts');
        else node.setAttribute('aria-keyshortcuts', 'Shift+Enter');
    });
    $('ktHandCount').textContent = `${hand.length}枚`;
    host.classList.toggle('is-last-card', hand.length === 1 && round.phase !== 'over');
    const drawn = drawnCard();
    const drawNotice = !arranging && !selected.size && drawn;
    $('ktSelection').textContent = arranging ? '札を選び、横に移動' : selected.size ? `${selected.size}枚を選択中` : drawNotice ? `${acquiredCardLabel()}：${cardName(drawn)}` : myTurn ? (choosing ? 'タップで選択・長押しで詳細' : 'タップして選択') : '相手の手番';
    $('ktSelection').classList.toggle('kt-draw-notice', !!drawNotice);
    $('ktSelection').classList.toggle('is-turn-note', !!tutorial || (!myTurn && !arranging && !selected.size && !drawNotice));
    $('ktArrange').textContent = arranging ? '並べ替え完了' : '並べ替え';
    $('ktArrange').setAttribute('aria-pressed', String(arranging));
    $('ktArrange').disabled = round.phase === 'over' || round.phase === 'retrieve' || ferrying || giving;
    $('ktActions').hidden = arranging;
    $('ktArrangeActions').hidden = !arranging;
    const index = hand.findIndex(card => card.id === movingCard);
    $('ktMoveLeft').disabled = index <= 0;
    $('ktMoveRight').disabled = index < 0 || index >= hand.length - 1;
}

function moveHandCard(id, index) {
    const hand = displayHand(match.round.players[ME].hand, manualHandOrder);
    if (!arranging || !hand.some(card => card.id === id)) return;
    manualHandOrder = moveCard(hand, id, index);
    movingCard = id;
    renderHand();
}

const cancelHandDrag = installHandDrag($('ktHand'), {
    enabled: () => arranging,
    pick: id => { movingCard = id; renderHand(); },
    move: moveHandCard
});

installHandInspect($('ktHand'), {
    enabled: () => Boolean(match && !arranging && !$('ktHandInspector').open && $('ktZoom').hidden && $('ktDialog').hidden && $('ktGraveDialog').hidden),
    inspect: id => {
        const node = [...$('ktHand').children].find(card => card.dataset.card === id);
        const card = match?.round.players[ME].hand.find(owned => owned.id === id);
        if (!node || !card) return false;
        openHandInspector(card, node);
        return true;
    }
});

function renderAbilityFocus(round) {
    renderChoiceFocus(round, $('ktTable'), $('ktChoiceFocus'), choiceCardNode, round?.turn === ME);
}

function renderMe() {
    const round = match.round;
    $('ktMe').replaceChildren(el('strong', '', NAMES[ME]), el('span', 'kt-me-chips kt-chip', `${match.chips[ME]}`), hanPill(ME), badges(ME));
    if (online.view) $('ktMe').append(el('span', 'kt-player-rating', `レート${match.ratingResult?.rating ?? match.startRating}`));
    else if (ratingPreview) $('ktMe').append(el('span', 'kt-player-rating', `レート${playerRating}`));
    $('ktMe').classList.toggle('is-turn', round.phase !== 'deathSwap' && round.phase !== 'over' && round.turn === ME);
    if (round.players[ME].hand.length === 1 && round.phase !== 'over')
        $('ktMe').append(el('span', 'kt-last-card-flag', '残り1枚'));
    const avatar = seatAvatar(ME);
    if (avatar) $('ktMe').prepend(avatarImage(avatar.icon, 'kt-avatar-seat-icon'));
}

function renderActions() {
    const round = match.round;
    const mine = round.phase === 'deathSwap' ? Rules.deathSwapCanChoose(round,ME) : round.turn === ME;
    $('ktTable').dataset.ownPlay = String(mine && round.phase === 'play');
    const play = $('ktPlay');
    const pass = $('ktPass');
    const drawButton = $('ktDraw');
    if (mine && round.phase === 'ferry') {
        play.textContent='追加で出す';
        play.disabled=selected.size!==1||!Rules.ferryCandidates(round,ME).some(card=>selected.has(card.id));
        pass.textContent='見送る';pass.disabled=false;drawButton.disabled=true;
        return;
    }
    if (mine && round.phase === 'exchange') {
        play.textContent = '1枚交換する';
        play.disabled = selected.size !== 1 || !Rules.exchangeCandidates(round, ME).some(card => selected.has(card.id)) || !round.deck.length;
        pass.textContent = '交換しない'; pass.disabled = false; drawButton.disabled = true;
        return;
    }
    if (mine && round.phase === 'deathSwap') {
        play.textContent = 'この札で参加';
        play.disabled = selected.size !== 1 || !round.players[ME].hand.some(card => selected.has(card.id));
        pass.textContent = '参加しない'; pass.disabled = false; drawButton.disabled = true;
        return;
    }
    if (mine && round.phase === 'give') {
        play.textContent = round.players[ME].hand.length === 1 ? '渡して上がる' : '1枚渡す';
        play.disabled = selected.size !== 1 || !round.players[ME].hand.some(card => selected.has(card.id));
        pass.textContent = '渡さない'; pass.disabled = false; drawButton.disabled = true;
        return;
    }
    if (mine && round.phase === 'trash') {
        play.textContent = round.players[ME].hand.length === 1 ? '除外して上がる' : '除外する';
        play.disabled = selected.size !== 1 || !Rules.trashCandidates(round, ME).some(card => selected.has(card.id));
        pass.textContent = '除外しない';
        pass.disabled = false;
        drawButton.disabled = true;
        return;
    }
    const opts = Rules.options(round, ME);
    const pick = selectionPlay();
    play.textContent = pick.kind === 'call' ? 'コール' : pick.kind === 'role' ? '役を出す' : '出す';
    play.disabled = !(mine && round.phase === 'play' && pick.res.ok);
    pass.textContent = 'パス';
    pass.disabled = !opts.canPass;
    drawButton.disabled = !opts.canDraw;
}

function renderMessage(events, moves) {
    const round = match.round;
    const fresh = events.map(describe).filter(Boolean);
    const box = $('ktMessage');
    if (fresh.length) box.dataset.last = fresh.slice(-2).join(' ／ ');
    let text = box.dataset.last || '';
    if (round.phase === 'deathSwap' && !Rules.deathSwapCanChoose(round,ME)) text = '選択済み。ほかの参加者の選択を待っています。';
    if (round.phase === 'deathSwap' ? Rules.deathSwapCanChoose(round,ME) : round.phase !== 'over' && round.turn === ME) {
        const pick = selectionPlay();
        const bonus = Rules.lastCardHan(round, ME);
        if (round.phase === 'trash') text = round.trashKind === 'death'
            ? '死神の効果：コートカード（小札11〜14）を1枚だけ除外できます。最後の1枚も除外して上がれます。'
            : ABILITY.banish + '：手札を1枚だけ除外できます。最後の1枚も除外して上がれます。';
        else if (round.phase === 'deathSwap') {
            if (round.effectTriggerCard?.num === 15) {
                const actor = round.deathSwap?.seats?.[0] ?? round.last;
                const detail = actor === ME
                    ? '交換する札を1枚選ぶか、見送ります。見送り、かつ翻がある相手から1翻受け取ります。'
                    : '交換する札を1枚選ぶか、見送ります。見送ると、翻がある場合だけ悪魔を出した人に1翻渡します。';
                text = ABILITY.devil + '：' + detail;
            } else text = '死神の交換：渡す手札を1枚選ぶか、参加しないを押してください。選んだ人だけで交換します。';
        }
        else if (round.phase === 'give') text = `${ABILITY.hang}：${NAMES[round.giveTo]} に渡す手札を1枚選んでください。渡さないこともできます。`;
        else if (round.phase === 'exchange') text = '悪魔の効果：任意の手札を1枚捨て、山札から1枚引いて交換できます。見送ることもできます。';
        else if (round.phase==='ferry') {
            const next=Rules.ferryCandidates(round,ME).find(card=>selected.has(card.id));
            text=next&&round.players[ME].hand.length===1 ? 'この大札で上がると、切札 +1翻'
                : (next && selectedCardEffect(round,ME,[next],SUIT_NAME,{ferried:true})) || '死神：大札0〜12を1枚追加で出せます';
        }
        else if (hint) text = hint;
        else if (pick.cards.length && !pick.res.ok) text = pick.res.reason;
        else if (pick.cards.length === 1 && bonus) text = `この大札で上がると、切札 +${bonus}翻`;
        else if (pick.kind === 'normal' && pick.cards.length) text = selectedCardEffect(round, ME, pick.cards, SUIT_NAME).replace('正義執行', justiceName()).replace('清めの杯', temperanceName()) || text;
        else if (!pick.cards.length && round.phase === 'play' && !arranging) {
            const guide = !turnHints ? '札を選んでください'
                : moves.some(move => move.cards.length === 1) ? '光っている札を選んで「出す」'
                : moves.length ? '組み合わせで出せます。光っている札を選択'
                : round.field.kind ? '返せる札がありません。パスできます'
                : Rules.options(round, ME).canDraw ? '出せる札がありません。1枚引けます'
                : '出せる札がありません';
            // Keep fresh turn transitions and draw feedback, not stale descriptions.
            const context = drawnCard() && text ? text : events.filter(event => ['pass', 'clear', 'cede'].includes(event.type)).map(describe).at(-1);
            text = context ? `${context} ／ ${guide}` : guide;
        }
    }
    if (box.textContent !== text) {
        box.textContent = text;
        if ($('ktMessageDialog').open) $('ktMessageFull').textContent = text;
        updateMessageOverflow();
    }
}

function updateMessageOverflow() {
    if (tutorial) { $('ktMessageMore').hidden = true; return; }
    const box = $('ktMessage');
    $('ktMessageMore').hidden = box.scrollHeight <= box.clientHeight + 1;
}

if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateMessageOverflow).observe($('ktMessage'));
$('ktMessageMore').addEventListener('click', () => {
    $('ktMessageFull').textContent = $('ktMessage').textContent;
    $('ktMessageDialog').showModal();
});

function renderTurnHints(events = []) {
    const moves = turnHints ? Rules.listMoves(match.round, ME) : [];
    renderHand(moves);
    renderMessage(events, moves);
}

// Draws the table and plays the effects for what happened since the last draw.
// Returns the presentation length for the result screen; CPU only waits for the field sweep.
function render() {
    const round = match.round;
    syncTableAudio();
    const events = round.events.slice(seenEvents);
    acquisition = updateAcquisition(acquisition, round.players[ME].hand, ME, events, round.phase === 'over');
    const feedback = updateTurns(turnFeedback, round, ME, events);
    turnFeedback = feedback.state;
    seenEvents = round.events.length;
    const fieldBefore = events.some(e => e.type === 'clear' || (e.type === 'play' && e.kind === 'call')) ? captureField() : [];
    // Once the last round is settled the label stays on it.
    $('ktRound').textContent = match.over ? `全${match.rounds}局` : `${roundLabel(match)} / ${match.rounds}`;
    $('ktDeck').textContent = String(round.deck.length);
    $('ktDeck').setAttribute('aria-label', `山札 残り${round.deck.length}枚`);
    // Hiding a live seat restarts the card-back fade on each room snapshot.
    const top = $('ktSeatTop');
    const hideTop = match.seats !== 4;
    if (top.hidden !== hideTop) top.hidden = hideTop;
    for (const [seat, host] of seatSlots()) renderSeat(seat, host);
    if(round.phase!=='over')for(const node of $('ktTable').querySelectorAll('.is-thrown'))node.classList.remove('is-thrown');
    renderField();
    renderAbilityFocus(round);
    renderMe();
    renderTableSeatCues(round);
    renderTurnHints(events);
    renderActions();
    renderSessionControls();
    if (tutorial) tutorial.paint();
    return playEffects(events, fieldBefore, feedback);
}

function devilResult(events, complete) {
    // Each swap resolves atomically, so these events are in the same batch as completion.
    const previous = events.slice(0, events.indexOf(complete)).findLastIndex(event => event.type === 'deathSwapComplete');
    const deltas = events.slice(previous + 1, events.indexOf(complete)).filter(event => event.by === complete.by);
    return {
        cards: deltas.filter(event => event.type === 'devilCardTransfer'),
        han: deltas.filter(event => event.type === 'devilHanTransfer')
    };
}

// ---- Effects -------------------------------------------------------------

const rectOf = (node) => node?.getBoundingClientRect();

function seatHost(seat) {
    return seatSlots().find(([s]) => s === seat)?.[1] || null;
}

// The name plate of a seat: where bubbles, stamps and chips go.
function seatPlate(seat) {
    return seat === ME ? $('ktMe') : seatHost(seat)?.querySelector('.kt-seat-panel');
}

function seatHanPill(seat) {
    return seatPlate(seat)?.querySelector('.kt-han-pill');
}

// Where a seat's cards come from: your hand, or the backs an opponent is holding.
function handBox(seat) {
    if (seat === ME) return rectOf($('ktHand'));
    const fan = seatHost(seat)?.querySelector('.kt-opponent-hand');
    return fan && !fan.hidden ? rectOf(fan) : rectOf(seatPlate(seat));
}

function captureField() {
    if (!Fx.moving()) return [];
    return [...$('ktFieldCards').querySelectorAll('.kt-card')].map(node => {
        const ghost = node.cloneNode(true);
        ghost.classList.remove('is-arriving','is-landed');
        return {node:ghost,rect:Fx.fieldCardPose(node)};
    });
}

const fieldCentre = () => {
    const rect = rectOf($('ktFieldCards'));
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};
// Stamps sit low on the field so they do not cover the cards.
const stampPoint = () => {
    const rect = rectOf($('ktFieldState'));
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

// Cards leave the deck as a small card, not at the size of the deck label.
function deckBox() {
    const rect = rectOf($('ktDeck'));
    return Fx.boxAt({ x: rect.left + 10, y: rect.top + rect.height / 2 }, 16, 24);
}

function backCard() {
    const back = artImage(BACK_URL, 'kt-fx-back');
    back.width = 80;
    back.height = 120;
    return back;
}

// Cards of one play fly from the hand or seat to the field. When the field was cleared by the same play
// (two eights, the World) they land on screen only and are swept away with the rest.
function measureTransientPlay(cards, fan) {
    const field = $('ktFieldCards');
    const group = el('div', 'kt-field-play kt-field-top kt-field-measure');
    group.setAttribute('aria-hidden', 'true');
    if (fan) group.dataset.fieldFan = 'true';
    group.append(...cards.map(card=>cardNode(card)));
    field.append(group);
    const slots = [...group.children].map(Fx.fieldCardPose);
    group.remove();
    return slots;
}

function flyPlay(event, at, floating, sweepBefore, finishing=false, accent = false) {
    const nodes = event.cards.map((card) => $('ktFieldCards').querySelector(`[data-card="${card.id}"]`));
    const fan = event.by === ME ? null : handBox(event.by);
    const source = fan ? Fx.boxAt({x:fan.left+fan.width/2,y:fan.top+fan.height/2},30,45) : null;
    const centre = fieldCentre();
    const transient = Fx.moving() && nodes.some(node=>!node) ? measureTransientPlay(event.cards,event.cards.length===5) : [];
    const fieldWidth = rectOf($('ktFieldCards').querySelector('.kt-field-top .kt-card'))?.width || 56;
    const arrivals=[];
    const last=finishing&&Fx.moving()?event.cards.length-1:-1;
    let impactUntil=null;
    const singleWin=finishing && event.kind==='normal' && event.cards.length===1;
    event.cards.forEach((card, index) => {
        const node = nodes[index];
        const offset = (index - (event.cards.length - 1) / 2) * (fieldWidth * 0.75);
        const to = (node && Fx.moving() ? Fx.fieldCardPose(node) : rectOf(node)) || transient[index] || Fx.boxAt({ x: centre.x + offset, y: centre.y }, fieldWidth, fieldWidth * 1.5);
        const from = (event.by === ME && playOrigins.get(card.id)) || source || to;
        if (node) node.classList.add('is-arriving');
        const ghost = cardNode(card);
        const agari=index===last;
        const launch=(delay)=>{
            if(agari){
                ghost.classList.add('kt-fx-agari-slam');
                Fx.later(delay+Fx.AGARI_SLAM_MS-160,()=>Sfx.roleSound('finishWindup'));
                return Fx.slam(ghost,from,to,{...Fx.AGARI_FLIGHT,duration:Fx.AGARI_SLAM_MS,delay,spin:-8,keep:!node});
            }
            return Fx.fly(ghost,from,to,{duration:240,delay,keep:!node,spin:event.by===ME?0:-12});
        };
        const finish = () => {
            if (node?.isConnected) {
                node.classList.remove('is-arriving');
                node.classList.add('is-landed');
            }
            if(agari&&(node?.isConnected||ghost.isConnected)){
                Fx.agariStrike(to,$('ktFelt'),$('ktApp'),event.by===ME);
                if (accent) impactUntil = Sfx.playTableImpact('role');
                else if (!singleWin) Sfx.roleSound('finish');
            }
            if (agari && singleWin) Sfx.playTableImpact('single');
        };
        const delay = at + index * 20 + (agari?Fx.AGARI_PAUSE_MS:0);
        arrivals.push(sweepBefore
            ? Fx.untilPresentationReady(resolve=>Fx.after(delay,sweepBefore,()=>launch(0).then(finish).then(resolve))) : launch(delay).then(finish));
        if (!node) floating.push({ node: ghost, rect: to, pending: true });
    });
    const landing = at + (last<0?240:Fx.AGARI_PAUSE_MS+Fx.AGARI_SLAM_MS) + (event.cards.length - 1) * 20;
    const strong = event.kind !== 'normal' || event.cards.length >= 2 || event.cards.some((card) => card.major && card.num === 21);
    if(last<0)Fx.after(landing, sweepBefore, () => {
        Fx.impact(nodes[0] ? rectOf(nodes[0]) : Fx.boxAt(centre, fieldWidth, fieldWidth * 1.5), { strong });
        if (strong) Fx.shake($('ktFelt'), event.kind === 'normal' ? 4 : 7);
        if (singleWin) Sfx.playTableImpact('single');
    });
    if(last<0&&!accent&&!singleWin)Sfx.play('card', landing / 1000);
    return { landing, arrived:Promise.all(arrivals), impactUntil:()=>impactUntil };
}

function revisedRolePlay(event,at,sweepBefore,fieldBefore,finishing,cheer) {
    const plays=match.round.field.plays;
    const top=plays.at(-1);
    if(!top || top.by!==event.by || top.cards.length!==event.cards.length || !event.cards.every(card=>top.cards.some(c=>c.id===card.id)))return null;
    const taken=event.kind==='call'?plays.at(-2)?.cards[0]:null;
    const cards=taken?[taken,...event.cards]:event.cards;
    const plan=makeRoleJuice(event,cards,taken);
    if(!plan)return null;
    const nodes=new Map([...$('ktFieldCards').querySelectorAll('.kt-field-top .kt-card')].map(node=>[node.dataset.card,node]));
    if(!cards.every(card=>nodes.has(card.id)))return null;
    const borrowedFrom=taken?fieldBefore.find(({node})=>node.dataset.card===taken.id)?.rect:null;
    const mine=event.by===ME;
    // Resolve card origins now: the renderer can clear the hand map while a previous sweep finishes.
    const origins=new Map(playOrigins);
    const alreadyPaced=online.view ? online.view.members[event.by]?.cpu===true : !mine;
    const effect=animateRole(plan,{nodes,alreadyPaced,table:$('ktFelt'),cardNode,mine,source:mine?null:handBox(event.by),
        origin:card=>mine?origins.get(card.id):null,borrowedFrom,at,sweepBefore,legacy:(playSound)=>roleBanner(event,0,playSound),finishing,app:$('ktApp'),
        cheer,face:roleFace(seatAvatar(event.by),SEAT_PORTRAITS[event.by],PORTRAIT_ART)});
    if(effect.ready)gateFieldSweep(effect.ready);
    return effect;
}

function roleBanner(event, at, playSound = true) {
    const han = roleHan(event.role) - (event.kind === 'call' ? 1 : 0);
    const tier = han >= LEGEND_HAN ? 'legend' : han >= BIG_HAN ? 'big' : 'normal';
    const label = event.kind === 'call' ? `コール！${roleName(event.role)}` : `${roleName(event.role)}！`;
    Fx.later(at, () => {
        const length = Fx.banner(label, rectOf($('ktFelt')), tier, `${NAMES[event.by]}　場を流せば +${han}翻`);
        if (tier !== 'normal') Fx.later(120, () => Fx.flash(tier === 'legend' ? 'white' : 'gold'));
        return length;
    });
    if(playSound)Sfx.play(tier === 'legend' ? 'legend' : 'role', at / 1000);
    return tier === 'legend' ? 1300 : 950;
}

const STAMPS = {
    cut: ['8カット', 'red', 'slash'],
    back: ['11バック', 'purple', 'stamp'],
    skip: ['スキップ', 'blue', 'stamp'],
    lock: ['ロック', 'gold', 'stamp'],
    unlock: ['ロック解除', 'gold', 'stamp'],
    reset: ['効果リセット', 'gold', 'stamp'],
    trash: ['除外', 'red', 'stamp'],
    give: [ABILITY.hang, 'blue', 'stamp'],
    deathSwapStart: ['交換', 'purple', 'stamp'],
    deathDecree: [ABILITY.death, 'purple', 'stamp'],
    retrieve: [ABILITY.resurrection, 'purple', 'stamp']
};

function gateFieldSweep(wait) {
    if (!wait) return;
    const sweep = fieldSweep ? Promise.all([fieldSweep, wait]) : wait;
    fieldSweep = sweep;
    sweep.then(() => { if (fieldSweep === sweep) fieldSweep = null; });
    if (online.view) waitForCpuPresentation(sweep);
}

// Original losing-hand throw, with only local visible faces and cosmetic opponent backs.
function throwAgariHands(winner) {
    if(!Fx.moving())return;
    const thrown=[],round=match.round;
    for(let seat=0;seat<match.seats;seat++){
        if(seat===winner||!round.players[seat].hand.length)continue;
        if(seat===ME){
            const hand=$('ktHand');
            for(const node of hand.querySelectorAll('.kt-card'))thrown.push({node:node.cloneNode(true),rect:rectOf(node)});
            hand.classList.add('is-thrown');
            continue;
        }
        const box=handBox(seat);
        if(!box)continue;
        const count=Math.min(8,round.players[seat].hand.length);
        for(let i=0;i<count;i++){
            const x=box.left+box.width/2+(i-(count-1)/2)*7;
            thrown.push({node:backCard(),rect:Fx.boxAt({x,y:box.top+box.height/2},30,45)});
        }
        seatHost(seat)?.querySelector('.kt-opponent-hand')?.classList.add('is-thrown');
    }
    Fx.toss(thrown);
}

// Plays the effects of one batch of events in order and returns the total time.
const abilityEventBoundary = new Set(['play','pass','draw','cede','start','deathSwapComplete']);
function playConsequences(events, start) {
    const end = events.findIndex((event, index) => index >= start && abilityEventBoundary.has(event.type));
    return events.slice(start, end < 0 ? events.length : end);
}
// Find one existing rule event to carry the automatic ability's name. World
// and a multiple-card Might Cut resolve as clear events rather than stamps.
function namedConsequence(events, event) {
    const index = events.indexOf(event);
    if (index <= 0) return null;
    const cause = events.slice(0, index).findLastIndex(e => abilityEventBoundary.has(e.type));
    if (cause < 0) return null;
    const consequences = playConsequences(events, cause + 1);
    const { label } = playAbility(events[cause], consequences) || {};
    const first = type => consequences.find(e => e.type === type);
    const cue = label === ABILITY.mighty ? first('cut') || first('clear')
        : label === ABILITY.justice ? first('back')
        : label === ABILITY.clearance ? first('reset')
        : label === ABILITY.world ? first('clear') : null;
    if (event === cue) return { label, announce: true };
    return null;
}

function ruleImpactAnchors(play, floating) {
    return play.cards.map(card => {
        const settled = $('ktFieldCards').querySelector('[data-card="' + card.id + '"]');
        return settled || floating.find(({node})=>node.dataset.card === card.id)?.rect;
    }).filter(Boolean);
}

function playEffects(events, fieldBefore, feedback) {
    if (!events.length || !Fx.active()) return 0;
    const propGeneration = feedbackGeneration;
    const incomingPropsAudible = !document.hidden;
    const visibility = propVisibilityGeneration;
    const propCue = (kind, suit) => {
        if (incomingPropsAudible && visibility === propVisibilityGeneration && propGeneration === feedbackGeneration && match && Fx.active()) Sfx.playRuleProp(kind, suit);
    };
    const round = match.round;
    const floating = [];
    let at = 0;
    let sweepBefore = fieldSweep;
    let arrived = null;
    const win=events.find(event=>event.type==='win');
    const finisher=win&&!win.openingWin&&!['trash','give'].includes(win.method)
        ? events.findLast(event=>event.type==='play'&&event.by===win.by) : null;
    const order = match.over ? ranking(match) : [];
    const ownVictory = order[0]?.seat === ME && order[0].chips > (order[1]?.chips ?? -Infinity);
    if (ownVictory && resultIdentity() !== restoredFinishedRound && (win || events.some(event=>event.type==='drawn'))) liveVictoryRound = resultIdentity();
    const cheerArgs = {from:round.events.length - events.length, silent:finisher, viewer:ME};
    const cheers = roleCheers(round.events, cheerArgs);
    const preview = crowdPreviewActive ? previewCrowdPlan(round.events, cheerArgs) : null;
    const cheerFor = event => preview?.get(event) ?? cheers.get(event);
    for (const event of events) {
        switch (event.type) {
        case 'deal':
        case 'start': {
            const hand = [...$('ktHand').children];
            const dealt = Fx.deal(hand, deckBox());
            hand.forEach((_, index) => Sfx.play('deal', (120 + index * 55) / 1000));
            const first = $('ktFieldCards').querySelector('.kt-field-top .kt-card');
            if (first) {
                first.classList.add('is-arriving');
                arrived=Fx.fly(backCard(), deckBox(), Fx.fieldCardPose(first), { duration: 320, delay: dealt }).then(() => {
                    first.classList.remove('is-arriving');
                    first.classList.add('is-landed');
                });
                Sfx.play('card', (dealt + 320) / 1000);
            }
            at = Math.max(at, dealt + 360);
            if (event.type === 'start' && online.view?.members[round.turn]?.cpu && isCpuOpening(round)) {
                gateFieldSweep(Fx.untilPresentationReady(done => Fx.after(0, arrived, () => Fx.later(CPU_OPENING_MS, done))));
            }
            break;
        }
        case 'play': {
            const revised=event.kind!=='normal'?revisedRolePlay(event,at,sweepBefore,fieldBefore,event===finisher,cheerFor(event)):null;
            if(revised!==null){at=Math.max(at,revised.span);sweepBefore=fieldSweep;arrived=revised.ready;break;}
            const accent=event.kind!=='normal' && roleAccentKey(event.role);
            if (event.kind !== 'normal') roleBanner(event, at, !accent);
            const flight=flyPlay(event,at,floating,sweepBefore,event===finisher,accent);
            if(accent)void flight.arrived.then(()=>Sfx.completeRole(event.role,flight.impactUntil(),cheerFor(event)));
            at=Math.max(at,flight.landing);
            arrived=flight.arrived;
            break;
        }
        case 'pass':
            Fx.after(at,sweepBefore,()=>{ const plate=rectOf(seatPlate(event.by)); if(plate)Fx.bubble('パス',plate); Sfx.play('pass', 0, event.by === ME); });
            break;
        case 'cede':
            Fx.after(at,sweepBefore,()=>{ const plate=rectOf(seatPlate(event.by)); if(plate)Fx.bubble('親を渡す',plate); });
            break;
        case 'draw': {
            const drawn = event.by === ME ? drawnCard() : null;
            const target = drawn ? $('ktHand').querySelector(`[data-card="${drawn.id}"]`) : null;
            const to = target ? rectOf(target) : handBox(event.by);
            const flyDraw=delay=>{ if(Fx.moving()&&to)Fx.fly(drawn?cardNode(drawn):backCard(),deckBox(),target?to:Fx.boxAt({x:to.left+to.width/2,y:to.top+to.height/2},30,45),{duration:300,delay}); Sfx.play('deal',delay/1000); };
            if(sweepBefore) Fx.after(at,sweepBefore,()=>flyDraw(0));
            else flyDraw(at);
            at += 220;
            break;
        }
        case 'clear': {
            const named = namedConsequence(events, event);
            if (named?.announce) Fx.after(0, arrived || sweepBefore,
                () => Fx.stamp(named.label, stampPoint(), 'gold', {ruleCue:true, compact:true}));
            const cause = events.slice(0, events.indexOf(event)).findLast(c=>abilityEventBoundary.has(c.type));
            const multiCut = cause?.type === 'play' && cause.kind === 'normal' && cause.cards.length >= 2 && cause.cards.every(card=>card.num === 8);
            if (multiCut && !events.slice(events.indexOf(cause)+1, events.indexOf(event)).some(entry=>entry.type === 'cut')) {
                if (Fx.moving()) {
                    const anchors = ruleImpactAnchors(cause, floating);
                    const ready = arrived || sweepBefore;
                    arrived = Fx.untilPresentationReady(done=>Fx.after(0,ready,()=>{
                        const finish = flashRuleProp($('ktRuleProps'), anchors, () => propCue('cut'));
                        if (finish) finish.then(done); else done();
                    }));
                } else for (let i = 0; i < cause.cards.length; i++) Fx.after(i * multiCutBeatMs, arrived || sweepBefore, () => propCue('cut'));
            }
            const leaving = [...fieldBefore.filter(({ node }) => !floating.some((f) => f.node.dataset.card === node.dataset.card)), ...floating];
            fieldBefore = [];
            floating.length = 0;
            if (leaving.length) {
                const ready = arrived || sweepBefore;
                gateFieldSweep(Fx.queueSweep(leaving, at, ready));
                sweepBefore = fieldSweep;
                if (!multiCut) Fx.after(at, ready, () => Sfx.play('clear'));
                at += Fx.sweepDuration(leaving.length);
            }
            break;
        }
        case 'deathSwapComplete': {
            if (!event.devil) break;
            const {cards, han} = devilResult(events, event);
            const rect = rectOf($('ktFelt'));
            const cue = () => {
                if (rect) Fx.banner(ABILITY.devil, rect, 'legend',
                    (cards.length ? cards.length + '人で札を交換' : '札の交換なし') +
                    (han.length ? ' ・ ' + NAMES[event.by] + 'に+' + han.length + '翻' : ' ・ 翻の移動なし'));
                Sfx.play('stamp');
                for (const {from,to} of cards) {
                    const a = handBox(from), b = handBox(to);
                    if (a && b) {
                        const cardBox = box => Fx.boxAt({x:box.left+box.width/2, y:box.top+box.height/2}, 38, 57);
                        Fx.fly(backCard(), cardBox(a), cardBox(b), {duration:530, delay:190, spin:12});
                    }
                }
                for (const {from,by} of han) {
                    const source = seatHanPill(from);
                    if (source) {
                        Fx.bubble('−1翻', rectOf(source));
                        Fx.orb('+1翻', rectOf(source), seatHanPill(by), 'legend');
                    }
                }
            };
            const dependencies = arrived && sweepBefore ? Promise.all([arrived,sweepBefore]) : arrived || sweepBefore;
            if (Fx.moving()) {
                gateFieldSweep(Fx.untilPresentationReady(done => Fx.after(at, dependencies, () => {
                    cue();
                    Fx.later(1200, done);
                })));
                sweepBefore = fieldSweep;
                arrived = fieldSweep;
            } else Fx.after(at, dependencies, cue);
            break;
        }
        case 'justiceHan':
        case 'temperanceHan': {
            const show = () => {
                Fx.orb((event.type === 'justiceHan' ? justiceName() : temperanceName()) + ' +' + formatScoreHan(event.add, tableLanguage()), Fx.boxAt(fieldCentre(), 10, 10), seatHanPill(event.by), 'gold');
                Sfx.play('han');
            };
            Fx.after(at, arrived || sweepBefore, show);
            break;
        }
        case 'majorClear':
        case 'devil':
        case 'han': {
            const tier = event.add >= LEGEND_HAN ? 'legend' : event.add >= BIG_HAN ? 'big' : 'gold';
            // The swept field is empty now, so the han rises from its middle and flies to the seat.
            Fx.later(at, () => Fx.orb(`+${event.add}翻`, Fx.boxAt(fieldCentre(), 10, 10), seatHanPill(event.by), tier));
            Sfx.play('han', at / 1000, Math.min(4, 1 + Math.ceil(event.add / 3)));
            at += 1000;
            break;
        }
        case 'win': {
            const winnerHan = match.lastResult?.winner === event.by ? match.lastResult.winnerHan : undefined;
            const cheerVariant = match.played + event.by;
            const moving=Fx.moving();
            const dependencies=arrived&&sweepBefore?Promise.all([arrived,sweepBefore]):arrived||sweepBefore;
            const beat={at:null,promise:null};
            const announce=()=>{
                const plate=rectOf(seatPlate(event.by));
                if(plate)Fx.stamp('上がり！',{x:plate.left+plate.width/2,y:plate.top-6},event.by===ME?'legend':'gold',{big:true});
                if(event.by===ME)Fx.flash('gold');
                Fx.shake($('ktFelt'),6);
                // The local sole match result already has its own distinct J cheer.
                if (!ownVictory) Sfx.playRoundVictory(event.by === ME, cheerVariant, winnerHan);
                if(event.by!==ME) Sfx.roleSound('lose');
                if(moving)Fx.later(260,()=>{
                    throwAgariHands(event.by);
                    Sfx.roleSound('toss');
                });
                beat.at=performance.now();
            };
            if(moving){
                pendingAgari=beat;
                beat.promise=Fx.untilPresentationReady(done=>Fx.after(finisher?.kind==='normal'?0:at,dependencies,()=>{
                    announce();
                    done();
                }));
            }else Fx.later(at,announce);
            at+=moving?1250:700;
            break;
        }
        case 'drawn':
            Fx.later(at, () => Fx.banner('引き分け', rectOf($('ktFelt')), 'normal'));
            at += 950;
            break;
        default: {
            const stamp = STAMPS[event.type];
            if (!stamp) break;
            const label=event.type==='deathSwapStart'&&event.devil?ABILITY.devil:event.type==='back'&&!event.on?'11バック解除':event.type==='reset'?ABILITY.clearance:stamp[0];
            const display=onDone=>{
                const named = ['cut','back','reset'].includes(event.type) && namedConsequence(events, event);
                const propKind = ['cut','lock','back'].includes(event.type) ? event.type : null;
                if (propKind && event.on !== false) propCue(propKind, event.suit);
                if ((propKind && !named?.announce) || named?.announce === false || (event.type === 'deathSwapStart' && event.devil && round.phase === 'deathSwap')) {
                    if (onDone) Fx.later(380, onDone);
                } else Fx.stamp(named?.label || label,stampPoint(),stamp[1],{ruleCue:true,compact:!!named,onDone});
                if (!propKind && event.type !== 'unlock') Sfx.play(stamp[2]);
            };
            const dependencies=arrived&&sweepBefore?Promise.all([arrived,sweepBefore]):arrived||sweepBefore;
            if(Fx.moving()){
                // Rules are already applied. Show the readable cue after the physical landing and
                // retire it before the next CPU action; no wait for unrelated decorative animations.
                gateFieldSweep(Fx.untilPresentationReady(done=>Fx.after(at,dependencies,()=>display(done))));
                sweepBefore=fieldSweep;
            }else Fx.after(0,dependencies,()=>display());
            at += 380;
        }
        }
    }
    // Present once per genuine transition; do not block ordinary actions or the CPU.
    const generation = feedbackGeneration;
    const current = () => feedbackGeneration === generation && match && !document.hidden && Fx.active();
    const pulse = (node, cue) => {
        if (!node) return;
        node.dataset.ktFeedback = cue;
        Fx.later(750, () => { if (node.dataset.ktFeedback === cue) delete node.dataset.ktFeedback; });
    };
    if (feedback.lastSeats.length) Fx.after(at, sweepBefore, () => {
        if (!current() || match.round.phase === 'over') return;
        const seats = feedback.lastSeats.filter(seat => match.round.players[seat]?.hand.length === 1);
        if (!seats.length) return;
        Sfx.play('last-card');
        for (const seat of seats) pulse(seat === ME ? $('ktMe') : seatHost(seat), 'last-card');
    });
    if (feedback.ownEntered) Fx.after(at + (feedback.lastSeats.length ? 240 : 0) + (events.some(event => event.type === 'pass' && event.by !== ME) ? 115 : 0), sweepBefore, () => {
        if (!current() || match.round.phase !== 'play' || match.round.turn !== ME) return;
        pulse($('ktMe'), 'own-turn');
        if (Fx.moving()) Fx.sweepLight(rectOf($('ktHand')));
        Sfx.play('turn');
    });
    playOrigins = new Map();
    return at;
}

// Chips fly from every loser to the winner; the counters run with them.
function playSettlement(result, start) {
    if (result.winner === null || !Fx.moving()) return start;
    const winnerPlate = rectOf(seatPlate(result.winner));
    let end = start;
    const counters = new Map();
    for (let seat = 0; seat < match.seats; seat += 1) {
        const node = seat === ME ? $('ktMe').querySelector('.kt-chip') : seatPlate(seat)?.querySelector('.kt-seat-chips');
        if (node) {
            counters.set(seat, node);
            // Show the chips from before the payment until the coins arrive.
            node.textContent = String(match.chips[seat] - result.delta[seat]);
        }
    }
    result.payments.forEach((pay, index) => {
        if (!pay.paid) return;
        const from = rectOf(seatPlate(pay.from));
        const delay = start + index * 160;
        const coinsEnd = Fx.coins(from, winnerPlate, Math.min(12, Math.max(3, Math.round(pay.paid / 40))), delay);
        Fx.later(delay, () => Fx.countUp(counters.get(pay.from), match.chips[pay.from] + pay.paid, match.chips[pay.from], 600));
        for (let i = 0; i < 4; i += 1) Sfx.play('chip', (delay + 300 + i * 90) / 1000);
        end = Math.max(end, coinsEnd);
    });
    const winnerChips = counters.get(result.winner);
    Fx.later(start + 300, () => Fx.countUp(winnerChips, match.chips[result.winner] - result.delta[result.winner], match.chips[result.winner], Math.max(400, end - start - 300)));
    Fx.later(end, () => Fx.pop(winnerChips));
    // Without movement nothing flies; the numbers change at once.
    return Fx.moving() ? end + 250 : start;
}

const VICTORY_MOVIE_IDS = new Set([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]);
// Only these already-published IDs required a second immutable rendition.
const FULL_HEIGHT_MOVIE_V2 = new Set([4,5,6,7,8,9,10,11]);
const VICTORY_MOVIE_DIR = new URL('../../assets/tarot-kingdom-table/victory-media', import.meta.url).pathname;
function victoryMovie(avatar, still, startBgm) {
    const id = String(avatar.id).padStart(2, '0');
    const file = VICTORY_MOVIE_DIR + '/victory-' + id + (avatar.id === 1 ? '-v3' : FULL_HEIGHT_MOVIE_V2.has(avatar.id) ? '-v2' : '-v1');
    const block = el('section', 'kt-victory-video');
    const frame = el('div', 'kt-victory-frame');
    const poster = avatarImage(file + '.webp', 'kt-victory-poster', avatar.name + 'の勝利');
    poster.addEventListener('error', () => { poster.src = still; }, { once: true });
    frame.append(poster);
    block.append(frame);
    const showing = () => block.isConnected && !$('ktDialog').hidden;
    queueMicrotask(() => {
        if (!showing()) return;
        if (reducedMotion() || document.hidden) { startBgm(); return; }
        const player = el('video', 'kt-victory-player');
        player.playsInline = true;
        player.controls = false;
        player.disablePictureInPicture = true;
        player.muted = !Sfx.isOn();
        player.volume = 0.28;
        player.setAttribute('aria-label', avatar.name + 'の勝利ムービー');
        const current = () => showing() && player.isConnected;
        let begun = false;
        const launchBgm = () => {
            if (begun || !showing()) return;
            begun = true;
            startBgm();
        };
        // Start in sync with the movie, but never hold music for a slow or blocked stream.
        const wait = setTimeout(launchBgm, 1400);
        const restore = () => {
            clearTimeout(wait);
            if (!current()) return;
            player.pause();
            player.remove();
            poster.hidden = false;
            launchBgm();
        };
        player.addEventListener('playing', () => {
            clearTimeout(wait);
            if (!current() || document.hidden) { player.pause(); return; }
            poster.hidden = true;
            launchBgm();
        });
        player.addEventListener('error', restore, { once: true });
        frame.insertBefore(player, poster);
        player.src = file + '.mp4';
        void player.play().catch(async () => {
            if (!current()) return;
            if (!player.muted && !document.hidden) {
                player.muted = true;
                try { await player.play(); return; } catch { /* Keep the poster if blocked. */ }
            }
            restore();
        });
    });
    return block;
}

function pauseVictoryMovie() { $('ktDialogBody').querySelector('.kt-victory-player')?.pause(); }
window.addEventListener('pagehide', pauseVictoryMovie);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) { propVisibilityGeneration++; pauseVictoryMovie(); }
});

function closeDialog() {
    pauseVictoryMovie();
    $('ktDialog').hidden = true;
    $('ktDialog').classList.remove('is-retrieve', 'is-victory', 'is-round-result', 'is-match-loss', 'is-match-tie');
}

function openDialog(title, body, actions, mode = '', context = '') {
    $('ktDialog').classList.toggle('is-retrieve', mode === 'retrieve');
    $('ktDialog').classList.toggle('is-victory', mode === 'victory');
    const scrollBody = $('ktDialogBody');
    $('ktDialog').classList.toggle('is-round-result', mode === 'round-result');
    for (const attr of ['tabindex', 'role', 'aria-label']) scrollBody.removeAttribute(attr);
    if (mode === 'round-result') {
        scrollBody.tabIndex = 0;
        scrollBody.setAttribute('role', 'region');
        scrollBody.setAttribute('aria-label', '局結果の明細');
    }
    $('ktDialog').classList.toggle('is-match-loss', mode === 'match-loss');
    $('ktDialog').classList.toggle('is-match-tie', mode === 'match-tie');
    $('ktDialogTitle').textContent = title;
    if (context) $('ktDialogTitle').append(el('small', 'kt-round-context', context));
    pauseVictoryMovie();
    $('ktDialogBody').replaceChildren(...body);
    $('ktDialogActions').replaceChildren(...actions.map(([label, run, main]) => {
        const button = el('button', main ? 'kt-button kt-button-main' : 'kt-button', label);
        button.type = 'button';
        button.addEventListener('click', run);
        return button;
    }));
    $('ktDialog').hidden = false;
    $('ktDialogActions').querySelector('button')?.focus({ preventScroll: true });
    $('ktDialog').querySelector('.kt-dialog-box').scrollTop = 0;
    $('ktDialogBody').scrollTop = 0;
}

function trapRoundResultTab(event) {
    const dialog = $('ktDialog');
    if (event.key !== 'Tab' || dialog.hidden || !dialog.classList.contains('is-round-result')) return;
    const stops = [...dialog.querySelectorAll('button:not([disabled]), summary, [tabindex="0"]')].filter(node => node.getClientRects().length);
    const first = stops.at(0), last = stops.at(-1);
    const next = event.shiftKey && event.target === first ? last : !event.shiftKey && event.target === last ? first : null;
    if (next) { event.preventDefault(); next.focus(); }
}
$('ktDialog').addEventListener('keydown', trapRoundResultTab);

function isRatedCpuMatch(view) {
    return view?.match && view.owner && view.members.length > 1
        && view.members.slice(1).every(member => member.cpu);
}

function canExitCpu() {
    if (!match) return false;
    if (!online.view) return !match.over;
    const view = online.view;
    return view.status === 'playing' && view.owner && view.members.slice(1).every(member => member.cpu);
}

function renderSessionControls() {
    if (tutorial) { $('ktExitCpu').hidden = true; return; }
    const allowed = canExitCpu();
    $('ktExitCpu').hidden = !allowed;
    $('ktExitCpu').textContent = online.view ? 'CPU戦を終了' : '練習を終了';
}

function cpuExitActions() {
    return canExitCpu() ? [[online.view ? 'CPU戦を終了' : '練習を終了', requestCpuExit]] : [];
}

function leaveTable() {
    liveVictoryRound = null; restoredFinishedRound = null; Sfx.cancelCheers();
    resetDrawFeedback();
    clearTimeout(timer); timer = 0;
    cancelResultPresentation(); Fx.cancelAll(); cancelRulePropAnimations($('ktRuleProps')); cancelHandDrag();
    cpuExitPrompt = false; online.paused = false; closeDialog();
    selected.clear(); match = null; onlineRoundKey = '';
    $('ktOnlinePlayStatus').hidden = true; $('ktExitCpu').hidden = true;
    $('ktTable').hidden = true; $('ktSetup').hidden = false;
}

function requestCpuExit() {
    if (!canExitCpu() || cpuExitPrompt) return;
    cpuExitPrompt = true; online.paused = true;
    clearTimeout(timer); timer = 0; cancelResultPresentation(); Fx.cancelAll(); cancelRulePropAnimations($('ktRuleProps'), true);
    const rated = !!online.view;
    const body = [el('p', '', rated
        ? 'CPU全員への敗北としてレートを更新し、この対戦を終了します。退出後は友人の部屋を作成・参加できます。'
        : '練習を終了して戻ります。レートは変わりません。')];
    if (rated) {
        const preview = calculateRating({ playerRating: match.startRating, opponentRatings: match.opponentRatings,
            playerChips: 0, opponentChips: match.opponentRatings.map(() => 1) });
        body.push(el('p', 'kt-dialog-label', `レート ${preview.previous} → ${preview.rating}（${preview.change > 0 ? '+' : ''}${preview.change}）`));
    }
    const notice = el('p', ''); notice.setAttribute('role', 'status'); body.push(notice);
    openDialog(rated ? 'CPU戦を途中終了しますか？' : '練習を終了しますか？', body, [
        ['対戦を続ける', () => { cpuExitPrompt = false; online.paused = false; closeDialog(); after(); }],
        [rated ? '降参して退出' : '終了して戻る', async () => {
            if (!rated) { leaveTable(); return; }
            if (online.busy) { notice.textContent = '通信中です。少し待ってから、もう一度押してください。'; return; }
            const buttons = [...$('ktDialogActions').querySelectorAll('button')]; buttons.forEach(button => { button.disabled = true; });
            const left = await send('leave');
            if (cpuExitPrompt && online.view) {
                notice.textContent = left ? '状態が更新されました。もう一度操作してください。' : '退出できませんでした。接続を確認して、もう一度お試しください。';
                buttons.forEach(button => { button.disabled = false; });
            }
        }, true]
    ]);
}

function choiceCardNode(card) {
    const node = cardNode(card);
    node.querySelector('.kt-card-art').src = artUrl(card, 'cards');
    node.setAttribute('role', 'img');
    return node;
}

function showRetrieve() {
    const round = match.round;
    const hand = el('section', 'kt-retrieve-hand');
    hand.setAttribute('aria-label', '現在の手札');
    const handCards = el('div', 'kt-dialog-cards');
    handCards.append(...displayHand(round.players[ME].hand, manualHandOrder).map(zoomableCard));
    hand.append(el('p', 'kt-dialog-label', `現在の手札（${round.players[ME].hand.length}枚）`), handCards);
    const choices = el('section', 'kt-retrieve-options');
    choices.setAttribute('aria-label', '墓地の回収候補');
    const body = [el('p', 'kt-retrieve-description', '審判の効果です。手札を確認しながら、ほかの人の墓地から小札を1枚選べます。'), hand, choices];
    const { trigger, label } = choiceFocusState(round);
    if (trigger) {
        const focalCard = el('div', 'kt-retrieve-trigger');
        focalCard.append(choiceCardNode(trigger));
        if (label) focalCard.append(el('strong', 'kt-choice-label', label));
        body.unshift(focalCard);
    }
    round.players.forEach((player, seat) => {
        if (seat === ME || !player.grave.some(card => !card.major)) return;
        choices.append(el('p', 'kt-dialog-label', `${NAMES[seat]} の墓地`));
        const row = el('div', 'kt-dialog-cards');
        row.append(...sortHand(player.grave.filter(card => !card.major)).map((card) => {
            const node = cardNode(card, 'button');
            node.addEventListener('click', () => {
                closeDialog();
                if (online.view) { sendAction({ type: 'retrieve', id: card.id }); return; }
                Rules.retrieve(round, ME, card.id);
                after();
            });
            return node;
        }));
        choices.append(row);
    });
    openDialog('回収する札を選ぶ', body, [['回収しない', () => { closeDialog(); if (online.view) { sendAction({ type: 'retrieve', id: null }); return; } Rules.retrieve(round, ME, null); after(); }], ...cpuExitActions()], 'retrieve');
}

function cancelResultPresentation() {
    pendingAgari=null;
    clearTimeout(resultTimer);
    resultTimer = 0;
    resultRoundKey = null;
}

function queueResult(result, effects) {
    const key = resultIdentity();
    // A room refresh must neither cancel this pause nor start it over.
    if (resultRoundKey === key) return;
    const beat=pendingAgari;
    cancelResultPresentation();
    resultRoundKey = key;
    if (match?.over) Music.prepare('victory');
    const pause = result.winner === null ? effects : Math.max(WIN_CARD_HOLD_MS, effects);
    const start=performance.now();
    const schedule=()=>{
        if(resultRoundKey!==key)return;
        const due=Math.max(start+pause,beat?.at==null?0:beat.at+WIN_CARD_HOLD_MS);
        resultTimer=setTimeout(()=>{
            resultTimer=0;
            if(resultRoundKey===key&&match?.round.phase==='over')showResult(match.lastResult);
        },Math.max(0,due-performance.now()));
    };
    if(beat?.promise)beat.promise.then(schedule);
    else schedule();
}

function showResult(result) {
    const round = match.round;
    const rules = match.rules;
    const body = [];
    // Where the summary ends: the chip totals go right after it, above the card-by-card details, so they are seen without scrolling.
    let summaryEnd = 0;
    if (result.winner === null) {
        body.push(el('p', '', '全員が初手を出せず、引き分けです。'));
        summaryEnd = body.length;
    } else {
        const w = result.winner;
        const notes = el('ul', 'kt-result-note kt-han-breakdown');
        const language = tableLanguage();
        notes.lang = language;
        notes.setAttribute('aria-label', language === 'en' ? 'Han breakdown' : '翻の内訳');
        notes.append(...settlementHanBreakdown(match, result).map(entry => el('li', '', formatHanEntry(entry, language))));
        const exileWin = round.lastPlay?.type === 'trash' && round.lastPlay.by === w;
        const giftWin = round.lastPlay?.type === 'give' && round.lastPlay.by === w;
        const head = el('p', 'kt-result-head');
        head.append(el('strong', '', `${NAMES[w]} の${round.openingWin ? openingRoleName(round.openingWin) : exileWin ? '除外上がり' : giftWin ? '札渡しで上がり' : '上がり'}`), el('span', 'kt-han-pill kt-han-pill-big', `${formatScoreHan(result.winnerHan, language)}`));
        body.push(head, notes);
        summaryEnd = body.length;
        const finalPlay = round.field.plays.at(-1);
        const proof = round.openingWin ? round.players[w].hand : exileWin ? round.lastPlay.cards : finalPlay?.by === w ? finalPlay.cards : null;
        if (proof) {
            const winningCards = el('section', '');
            winningCards.setAttribute('aria-label', round.openingWin ? '配札上がりの手札' : '上がり札');
            const cards = el('div', 'kt-dialog-cards');
            cards.append(...proof.map(zoomableCard));
            winningCards.append(el('p', 'kt-dialog-label', round.openingWin ? `${openingRoleName(round.openingWin)}・数字の重複なし（${proof.length}枚）` : exileWin ? '除外した上がり札' : '上がり札'), cards);
            body.push(winningCards);
        }
        for (const pay of result.payments) {
            const extra = [];
            if (pay.aces) extra.push(`A${pay.aces}枚 +${pay.aces * rules.aceHan}`);
            if (round.dealer === pay.from) extra.push(`親 +${rules.dealerHan}`);
            const row = el('div', 'kt-result-row');
            const text = el('p', '', `${NAMES[pay.from]}：${pay.cards}枚 × ${pay.han}翻${extra.length ? `（${extra.join('、')}）` : ''} × ${rules.cardRate} ＝ `);
            text.append(el('strong', 'kt-chip', `${pay.paid}`));
            if (pay.paid < pay.owed) text.append(`（持ち分まで）`);
            const left = el('div', 'kt-dialog-cards');
            const losingHand = round.players[pay.from].hand;
            const visible = losingHand.filter(card => card.id && (pay.from === ME || !round.privateGifts?.includes(card.id)));
            left.append(...sortHand(visible).map(zoomableCard));
            for (let masked = visible.length; masked < losingHand.length; masked++) left.append(backCard());
            row.append(text, left);
            body.push(row);
        }
    }
    const table = el('ul', 'kt-score');
    match.chips.forEach((chips, seat) => {
        const delta = result.delta[seat];
        const item = el('li', '', NAMES[seat]);
        item.append(el('span', 'kt-chip', `${chips}`));
        if (delta) item.append(el('span', delta > 0 ? 'kt-delta kt-delta-up' : 'kt-delta kt-delta-down', `${delta > 0 ? '+' : ''}${delta}`));
        table.append(item);
    });
    // The match-end screen adds pictures above everything, so remember what the summary follows.
    const anchor = body[summaryEnd - 1];
    const roundStart = body[0];
    const summary = [table];
    // The changes count up from zero once the dialog is open.
    Fx.later(150, () => table.querySelectorAll('.kt-delta').forEach((node) => {
        const value = Number(node.textContent);
        Fx.countUp(node, 0, value, 650, (n) => `${n > 0 ? '+' : ''}${n}`);
    }));
    if (!match.over) {
        if (result.repeat) summary.push(el('p', 'kt-dialog-label', '親の上がりで、連荘します。'));
        const hero = el('section', 'kt-round-hero');
        hero.append(...body.slice(0, summaryEnd));
        const ledger = el('section', 'kt-round-ledger');
        ledger.append(el('h3', '', 'チップ残高'), ...summary);
        if (result.winner !== null) table.children[result.winner]?.classList.add('is-round-winner');
        const proof = body[summaryEnd]?.tagName === 'SECTION' ? body[summaryEnd] : null;
        proof?.classList.add('kt-round-proof');
        const detailNodes = body.slice(summaryEnd).filter(node => node !== proof);
        const details = detailNodes.length ? el('details', 'kt-round-details') : null;
        details?.append(el('summary', '', '得点の内訳・残り手札'), ...detailNodes);
        const roundLedger = [hero, ledger];
        if (proof) roundLedger.push(proof);
        if (details) roundLedger.push(details);
        openDialog('局の結果', roundLedger, [
            [result.repeat ? '連荘：次へ' : '次の局へ', () => { closeDialog(); beginRound(); }, true],
            ['墓地・除外を見る', openGraveyard],
            ...cpuExitActions()
        ], 'round-result', `${result.label} / 全${match.rounds}局`);
        return;
    }
    const order = ranking(match);
    const avatar = seatAvatar(ME);
    const room = online.view?.code;
    const leaders = order.filter(({ chips }) => chips === order[0]?.chips);
    const tiedLead = leaders.length > 1;
    const ownLead = leaders.some(({ seat }) => seat === ME);
    const soleVictory = ownLead && !tiedLead;
    const clashTitle = soleVictory ? '勝利' : ownLead ? '同率1位' : '敗北';
    const clashMode = soleVictory ? 'victory' : ownLead ? 'match-tie' : 'match-loss';
    const viewerRank = order.findIndex(({ chips }) => chips === match.chips[ME]) + 1;
    const musicKey = room ? 'room:' + room : match;
    const finalMatch = resultIdentity();
    const startVictoryBgm = () => { if (match?.over && resultIdentity() === finalMatch) Music.scene('victory', musicKey); };
    let movieStartsMusic = false;
    if (avatar && soleVictory &&
        (room ? displayedOnlineVictory !== room : !displayedPracticeVictories.has(match))) {
        if (room) displayedOnlineVictory = room;
        else displayedPracticeVictories.add(match);
        const still = avatar.victoryStill ?? avatar.portrait;
        movieStartsMusic = VICTORY_MOVIE_IDS.has(avatar.id);
        body.unshift(movieStartsMusic ? victoryMovie(avatar, still, startVictoryBgm)
            : avatarImage(reducedMotion() ? still : avatar.victory, 'kt-avatar-victory', avatar.name + 'の勝利'));
    }
    if (movieStartsMusic) Music.scene(null);
    else Music.scene(soleVictory ? 'victory' : ownLead ? null : 'defeat', musicKey);
    const reward = online.view && Number.isSafeInteger(match.earnedCoins) && match.earnedCoins > 0
        ? el('p', 'kt-avatar-earned', `アバターコイン +${match.earnedCoins}枚`) : null;
    if (reward && soleVictory) body.unshift(reward);
    const ending = [el('p', 'kt-dialog-label kt-victory-complete', match.chips.some((c) => c <= 0) ? 'チップが尽きた人が出たので、ここで終了です。' : '全局が終わりました。')];
    const final = el('ol', 'kt-score kt-score-final');
    for (const entry of order) {
        const item = el('li', !soleVictory && entry.seat === ME ? 'kt-final-own' : '', soleVictory ? NAMES[entry.seat] : '');
        if (!soleVictory) {
            const place = order.findIndex(({ chips }) => chips === entry.chips) + 1;
            item.append(el('span', 'kt-final-place', `${place}位`), el('span', 'kt-final-name', NAMES[entry.seat]));
        }
        item.append(el('span', 'kt-chip', `${entry.chips}`));
        final.append(item);
    }
    ending.push(final);
    if (!soleVictory) {
        const overview = el('div', 'kt-final-overview');
        const leadersLabel = leaders.map(({ seat }) => NAMES[seat]).join('、');
        overview.append(el('p', 'kt-final-viewer-rank', `あなたの順位：${viewerRank}位`),
            el('p', 'kt-final-leaders', `${tiedLead ? '同率1位' : '勝者'}：${leadersLabel}`));
        ending.unshift(overview);
        final.setAttribute('aria-label', '最終順位');
    }
    const settlement = !soleVictory && (reward || match.ratingResult) ? el('div', 'kt-final-settlement') : null;
    if (reward && settlement) settlement.append(reward);
    if (match.ratingResult) {
        const change = match.ratingResult.change;
        const rating = el('p', 'kt-rating-result', `${online.view ? 'レート' : '仮レート'} ${match.ratingResult.previous} → ${match.ratingResult.rating}`);
        rating.append(el('strong', change >= 0 ? 'kt-delta-up' : 'kt-delta-down', `（${change > 0 ? '+' : ''}${change}）`));
        if (settlement) settlement.append(rating);
        else ending.push(rating);
    }
    if (settlement) ending.push(settlement);
    body.splice(body.indexOf(anchor) + 1, 0, ...summary);
    // The match's outcome first; the last round's own result follows under its own rule.
    roundStart.classList.add('kt-result-last');
    const roundAt = body.indexOf(roundStart);
    if (!soleVictory || avatar) {
        const lastRound = el('details', soleVictory ? 'kt-victory-last-round' : 'kt-final-last-round');
        lastRound.append(el('summary', '', '最終局の内訳'), ...body.splice(roundAt));
        body.push(lastRound);
    }
    body.splice(roundAt, 0, ...ending);
    if (Fx.active()) {
        if (soleVictory) {
            Fx.confetti();
            if (liveVictoryRound === resultIdentity()) { liveVictoryRound = null; Sfx.playMatchVictory(); }
        } else if (!ownLead) Sfx.play('lose', 0.1);
    }
    if (online.view) {
        openDialog(clashTitle, body, [
            ['ロビーへ戻る', () => {
                const ratedCpu = isRatedCpuMatch(online.view);
                closeDialog(); returnToLobby();
                if (ratedCpu) showCpuLobbyAfterMatch();
            }, true],
            ['墓地・除外を見る', openGraveyard]
        ], clashMode);
        return;
    }
    openDialog(clashTitle, body, [
        ['もう一度', () => { closeDialog(); begin(match.seats); }, true],
        ['人数を選び直す', () => { closeDialog(); $('ktTable').hidden = true; $('ktSetup').hidden = false; }],
        ['墓地・除外を見る', openGraveyard]
    ], clashMode);
}

function act(seat, action) {
    const round = match.round;
    if (action.type === 'play') return Rules.play(round, seat, action.ids, action.kind);
    if (action.type === 'pass') return Rules.pass(round, seat);
    if (action.type === 'draw') return Rules.draw(round, seat);
    if (action.type === 'cede') return Rules.cede(round, seat);
    if (action.type === 'exchange') return Rules.exchange(round, seat, action.id);
    if (action.type === 'ferry') return Rules.ferry(round,seat,action.id);
    if (action.type === 'deathSwap') return Rules.deathSwap(round, seat, action.id);
    if (action.type === 'give') return Rules.give(round, seat, action.id);
    if (action.type === 'trash') return Rules.trash(round, seat, action.id);
    return Rules.retrieve(round, seat, action.id);
}

function practiceCpuAction(round) {
    if (!pendingCpuAction || pendingCpuAction.round !== round || pendingCpuAction.turn !== round.turn
        || pendingCpuAction.phase !== round.phase || pendingCpuAction.eventCount !== round.events.length) {
        const seat = round.turn;
        const action = chooseAction(round, seat, match.opponentRatings ? { rating: match.opponentRatings[seat - 1], random: match.cpuRandom } : {});
        pendingCpuAction = { round, turn: seat, phase: round.phase, eventCount: round.events.length, action,
            delay: cpuActionDelay(action, round, seat) };
    }
    return pendingCpuAction.action;
}

function step() {
    if (online.view) return;
    timer = 0;
    if (cpuExitPrompt || !$('ktGraveDialog').hidden) return;
    const round = match.round;
    if (round.phase === 'over') return;
    const seat = round.turn;
    if (seat !== ME && fieldSweep) {
        fieldSweep.then(() => { if (match?.round === round && !timer && !online.view) step(); });
        return;
    }
    if (seat === ME) {
        // The only forced move you have: handing the lead on when you cannot open.
        if (Rules.options(round, ME).mustCede) { Rules.cede(round, ME); after(); }
        return;
    }
    act(seat, practiceCpuAction(round));
    pendingCpuAction = null;
    after();
}

function after() {
    const round = match.round;
    selected = new Set([...selected].filter((id) => round.players[ME].hand.some((c) => c.id === id)));
    if (round.phase === 'trash' && round.turn === ME) selected = new Set([...selected].filter(id => Rules.trashCandidates(round, ME).some(card => card.id === id)));
    if (round.phase==='ferry' && round.turn===ME) selected=new Set([...selected].filter(id=>Rules.ferryCandidates(round,ME).some(card=>card.id===id)));
    if (cpuExitPrompt) { render(); return; }
    if (online.view) {
        if ($('ktDialog').classList.contains('is-retrieve') && (round.phase !== 'retrieve' || round.turn !== ME)) closeDialog();
        const effects = render();
        if (round.phase === 'over') {
            queueResult(match.lastResult, effects);
        } else if (round.turn === ME && round.phase === 'retrieve') showRetrieve();
        else if (round.turn === ME && Rules.options(round, ME).mustCede) sendAction({ type: 'cede' });
        return;
    }
    if (round.phase === 'over') {
        const result = settleRound(match);
        if (ratingPreview && match.over && !match.ratingResult) {
            match.ratingResult = calculateRating({ playerRating: match.startRating, opponentRatings: match.opponentRatings,
                playerChips: match.chips[ME], opponentChips: match.chips.slice(1) });
            playerRating = match.ratingResult.rating;
            $('ktRatingValue').textContent = String(playerRating);
        }
        const shown = playSettlement(result, render());
        // Keep the final play visible, including in fast and reduced-motion modes.
        queueResult(result, shown);
        return;
    }
    const dealing = round.events.slice(seenEvents).some(event => event.type === 'deal' || event.type === 'start');
    const effects = render();
    if (round.turn === ME) {
        if (round.phase === 'retrieve') { showRetrieve(); return; }
        if (round.phase === 'play' && !Rules.options(round, ME).mustCede) return;
        if (['trash','exchange','ferry','give','deathSwap'].includes(round.phase)) return;
    }
    clearTimeout(timer);
    if (round.turn !== ME) practiceCpuAction(round);
    const pause = fast ? 60 : round.turn === ME ? 500 : pendingCpuAction.delay;
    const openingResponse = !fast && dealing && round.turn !== ME && isCpuOpening(round);
    timer = setTimeout(step, openingResponse ? effects + pause : dealing ? Math.max(pause, effects) : pause);
}

function beginRound() {
    resetDrawFeedback();
    cancelResultPresentation();
    if (online.view) { send('next'); return; }
    cancelHandDrag();
    manualHandOrder = null;
    arranging = false;
    movingCard = null;
    selected = new Set();
    seenEvents = 0;
    hint = '';
    fieldKey = '';
    delete $('ktMessage').dataset.last;
    const round = startRound(match);
    after();
}

function begin(seats) {
    practiceAvatar = getAvatar(null);
    NAMES = ['あなた', 'カイ', 'ミナ', 'ロウ'];
    clearTimeout(timer);
    Fx.cancelAll(); cancelRulePropAnimations($('ktRuleProps'), true);
    match = createMatch({ players: seats, rng: makeRng() });
    if (ratingPreview) {
        match.startRating = playerRating;
        match.cpuRandom = makeRng(0x6b746162);
        match.opponentRatings = makeOpponents(playerRating, seats, match.cpuRandom);
        match.ratingResult = null;
    }
    $('ktSetup').hidden = true;
    $('ktTable').hidden = false;
    $('ktFelt').dataset.seats = String(seats);
    beginRound();
}

$('ktRatingSetup').hidden = !ratingPreview;

$('ktZoom').addEventListener('click', closeZoom);
$('ktGrave').addEventListener('click', openGraveyard);
$('ktGraveClose').addEventListener('click', closeGraveyard);
$('ktGraveDialog').addEventListener('click', event => {
    if (event.target === $('ktGraveDialog')) closeGraveyard();
});

const settingsDialog = $('ktSettingsDialog');
const localeSetting = $('ktTableLanguage');
localeSetting.value = getTableLanguage();
localeSetting.addEventListener('change', () => {
    if (setTableLanguage(localeSetting.value) && match && !$('ktTable').hidden) render();
});
const turnHintsInput = $('ktTurnHints');
turnHintsInput.checked = turnHints;
$('ktSettings').addEventListener('click', () => {
    $('ktArrange').hidden = !!tutorial;
    renderSessionControls();
    settingsDialog.showModal();
});
settingsDialog.addEventListener('close', () => {
    $('ktArrange').hidden = true;
    $('ktExitCpu').hidden = true;
});
const showCpuLobbyAfterMatch = installTavernMenu(settingsDialog);
turnHintsInput.addEventListener('change', () => {
    turnHints = turnHintsInput.checked;
    try { localStorage.setItem(HINTS_KEY, turnHints ? 'on' : 'off'); } catch { /* Apply for this visit. */ }
    if (match) renderTurnHints();
});

function syncTableAudio() {
    const atTable = !$('ktTable').hidden;
    Sfx.setTableAudio(atTable && !!match?.round && match.round.phase !== 'over' && !match.over);
    if (!atTable) Music.scene('title');
    else if (match?.round && !match.over) Music.scene('match');
}
new MutationObserver(syncTableAudio).observe($('ktTable'),{attributes:true,attributeFilter:['hidden']});

function renderSoundButton() {
    const on = Sfx.isOn();
    $('nvSoundSetting').checked = on;
}
renderSoundButton();
bindMusicSession({ player: Music, checkbox: $('ktMusicSetting'), syncScene: syncTableAudio });
// Online audio, like practice audio, requires a trusted user gesture.
$('ktTable').addEventListener('click',()=>{if(Fx.active())Sfx.unlock();},{capture:true});
$('nvSoundSetting').addEventListener('change', event => setSoundOn(event.target.checked));
function setSoundOn(on) {
    Sfx.setOn(on);
    renderSoundButton();
    Sfx.play('chip');
}

document.addEventListener('keydown', (event) => {
    if ($('ktHandInspector').open) return; // The native modal handles Escape and focus.
    if (event.key === 'Escape' && !$('ktZoom').hidden) {
        event.preventDefault();
        closeZoom();
        return;
    }
    if (event.key === 'Escape' && !$('ktGraveDialog').hidden) {
        event.preventDefault();
        closeGraveyard();
        return;
    }
    if (event.key === 'Escape' && cpuExitPrompt) {
        event.preventDefault(); $('ktDialogActions').querySelector('button')?.click(); return;
    }
    const modal = !$('ktZoom').hidden ? $('ktZoom') : !$('ktGraveDialog').hidden ? $('ktGraveDialog') : !$('ktDialog').hidden ? $('ktDialog') : null;
    if (event.key !== 'Tab' || !modal) return;
    const buttons = modal.id === 'ktZoom' ? [modal] : [...modal.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
        event.preventDefault();
        first?.focus();
    }
});

$('ktHand').addEventListener('click', (event) => {
    const node = event.target.closest('.kt-card');
    if (!node || node.getAttribute('aria-disabled') === 'true') return;
    const id = node.dataset.card;
    if (tutorial && !tutorial.selectAllowed(id)) return;
    if (arranging) { movingCard = id; renderHand(); return; }
    if (['trash','exchange','ferry','give','deathSwap'].includes(match.round.phase)) selected = new Set(selected.has(id) ? [] : [id]);
    else if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    hint = '';
    render();
});

function setHandArranging(value) {
    if (!match) return;
    cancelHandDrag();
    arranging = value;
    movingCard = null;
    renderHand();
    const focus = arranging ? $('ktHand').querySelector('button:not(:disabled)') : $('ktSettings');
    focus?.focus({preventScroll:true});
}
$('ktArrange').addEventListener('click', () => {
    settingsDialog.close();
    setHandArranging(!arranging);
});
$('ktArrangeDone').addEventListener('click', () => setHandArranging(false));
$('ktSortHand').addEventListener('click', () => {
    cancelHandDrag();
    manualHandOrder = null;
    renderHand();
});
function shiftMovingCard(direction) {
    const hand = displayHand(match.round.players[ME].hand, manualHandOrder);
    const index = hand.findIndex(card => card.id === movingCard);
    if (index >= 0) moveHandCard(movingCard, index + direction);
}
$('ktMoveLeft').addEventListener('click', () => shiftMovingCard(-1));
$('ktMoveRight').addEventListener('click', () => shiftMovingCard(1));
$('ktHand').addEventListener('keydown', event => {
    if (!arranging) return;
    if (event.key === 'Escape') { event.preventDefault(); setHandArranging(false); return; }
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const node = event.target.closest('.kt-card');
    if (!node || node.disabled) return;
    event.preventDefault();
    movingCard = node.dataset.card;
    shiftMovingCard(event.key === 'ArrowLeft' ? -1 : 1);
    node.focus({ preventScroll: true });
});

$('ktExitCpu').addEventListener('click', () => { settingsDialog.close(); requestCpuExit(); });

$('ktStart').addEventListener('click', () => {
    fast = $('ktFast').checked || params.has('fast');
    // Fast play skips every effect, sound included.
    Fx.setQuiet(fast);
    if (!fast) Sfx.unlock();
    begin(Number(document.querySelector('input[name="ktSeats"]:checked').value));
});

$('ktPlay').addEventListener('click', () => {
    if (tutorial) { tutorial.act('play'); return; }
    const round = match.round;
    if (round.phase === 'deathSwap' ? !Rules.deathSwapCanChoose(round,ME) : round.turn !== ME) return;
    if (online.view) {
        const pick = selectionPlay();
        if((pick?.kind!=='normal'||round.phase==='ferry')&&pick?.cards)playOrigins=new Map(pick.cards.map(card=>[card.id,rectOf($('ktHand').querySelector('[data-card="'+card.id+'"]'))]));
        sendAction(['trash', 'exchange', 'ferry', 'give', 'deathSwap'].includes(round.phase) ? { type: round.phase, id: [...selected][0] } : { type: 'play', ids: pick.cards.map(c => c.id), kind: pick.kind });
        return;
    }
    if (['trash','exchange','ferry','give','deathSwap'].includes(round.phase)) {
        if(round.phase==='ferry')playOrigins=new Map([...selected].map(id=>[id,rectOf($('ktHand').querySelector('[data-card="'+id+'"]'))]));
        const res = Rules[round.phase](round, ME, [...selected][0]);
        if (!res.ok) { hint = res.reason; render(); return; }
        selected = new Set();
        after();
        return;
    }
    const pick = selectionPlay();
    const origins = new Map(pick.cards.map((card) => [card.id, rectOf($('ktHand').querySelector(`[data-card="${card.id}"]`))]));
    const eventStart = round.events.length;
    const res = Rules.play(round, ME, pick.cards.map((c) => c.id), pick.kind);
    if (!res.ok) { hint = res.reason; render(); return; }
    playOrigins = origins;
    selected = new Set();
    after();
});

$('ktPass').addEventListener('click', () => {
    if (tutorial) { tutorial.act('pass'); return; }
    const round = match.round;
    if (round.phase === 'deathSwap' ? !Rules.deathSwapCanChoose(round,ME) : round.turn !== ME) return;
    if (online.view) { sendAction({ type: ['trash', 'exchange', 'ferry', 'give', 'deathSwap'].includes(round.phase) ? round.phase : 'pass', id: null }); return; }
    const res = ['trash', 'exchange', 'ferry', 'give', 'deathSwap'].includes(round.phase) ? Rules[round.phase](round, ME, null) : Rules.pass(round, ME);
    if (!res.ok) return;
    selected = new Set();
    after();
});

$('ktDraw').addEventListener('click', () => {
    if (tutorial) { return; }
    if (online.view) { sendAction({ type: 'draw' }); return; }
    if (Rules.draw(match.round, ME).ok) after();
});

let onlineRoundKey = '';
online.onView = view => {
    if (!view.match) return;
    if (cpuExitPrompt && view.status !== 'playing') { cpuExitPrompt = false; online.paused = false; closeDialog(); }
    clearTimeout(timer);
    match = view.match;
    if (view.status === 'finished' && !onlineRoundKey.startsWith(view.code + ':')) restoredFinishedRound = resultIdentity();
    NAMES = view.members.map((member, index) => index === 0 ? 'あなた' : member.name);
    const roundKey = `${view.code}:${match.played - (match.round.phase === 'over' ? 1 : 0)}`;
    if (onlineRoundKey !== roundKey) {
        // A reload renders the current board; never replay old field sweeps or hold up the CPU.
        const resumed = !onlineRoundKey.startsWith(view.code + ':') && (match.round.phase === 'over' || match.round.events.some(event =>
            ['play', 'pass', 'draw', 'cede', 'exchange', 'trash', 'give', 'deathSwapComplete', 'retrieve'].includes(event.type)));
        Fx.cancelAll(); cancelRulePropAnimations($('ktRuleProps'), true);
        resetDrawFeedback();
        onlineRoundKey = roundKey;
        cancelResultPresentation();
        selected.clear(); manualHandOrder = null; seenEvents = resumed ? match.round.events.length : 0; fieldKey = ''; if (!cpuExitPrompt) closeDialog();
    }
    $('ktSetup').hidden = true; $('ktTable').hidden = false;
    $('ktFelt').dataset.seats = String(match.seats);
    after();
};
online.onExit = leaveTable;
// A shared-link room can arrive while this module is loading.
if (online.view?.match) online.onView(online.view);

if (tutorialChapter !== null) {
    tutorial = createTutorialMode({
        loadMatch: scripted => {
            clearTimeout(timer); timer = 0;
            Fx.cancelAll(); cancelRulePropAnimations($("ktRuleProps"));
            cancelResultPresentation();
            resetDrawFeedback();
            selected = new Set();
            arranging = false;
            manualHandOrder = null;
            fieldKey = '';
            seenEvents = scripted.round.events.length;
            match = scripted;
            NAMES = TUTORIAL_NAMES;
            practiceAvatar = getAvatar(null);
            $('ktSetup').hidden = true;
            $('ktTable').hidden = false;
            $('ktTable').classList.add('kt-live-tutorial');
            $('ktFelt').dataset.seats = String(match.seats);
            $('ktTutorialHeader').hidden = false;
            $('ktTutorialCoach').hidden = false;
            $('ktArrange').hidden = true;
            $('ktOnlinePlayStatus').hidden = true;
            $('ktExitCpu').hidden = true;
            $('ktSelection').setAttribute('aria-hidden', 'true');
            $('ktHand').setAttribute('aria-describedby', 'ktHandStatus ktTutorialText');
            $('ktMessage').hidden = true;
            $('ktMessageMore').hidden = true;
            $('ktTable').querySelector('.kt-bar-status').hidden = true;
            for (const id of ['ktPass','ktPlay']) $(id).setAttribute('aria-describedby','ktTutorialText');
        },
        render, openDialog, closeDialog,
        selection: () => [...selected],
        applyOrigins: ids => {
            playOrigins = new Map(ids.map(id=>[id,rectOf($('ktHand').querySelector('[data-card="'+id+'"]'))]));
        },
        clearSelection: () => { selected = new Set(); }
    });
    tutorial.launch(tutorialChapter);
}
