// Tarot Kingdom, table version: the screen. You sit at seat 0; the other seats are computer players.
import * as Rules from './rules.js';
import { ROLE_NAMES, ROLE_HAN } from './rules.js';
import { createMatch, startRound, settleRound, ranking, seatHan, roundLabel } from './match.js';
import { chooseAction } from './ai.js';
import { PIRATE_TAROT_ARTWORK_VERSION } from '../../assets/pirate-tarot/version.js';
import * as Fx from './effects.js';
import * as Sfx from './sfx.js';

const NAMES = ['あなた', 'カイ', 'ミナ', 'ロウ'];
const SUIT_MARK = { wand: '杖', sword: '剣', cup: '杯', coin: '☆' };
const SUIT_NAME = { wand: 'ワンド', sword: 'ソード', cup: 'カップ', coin: 'ペンタクル' };
const RANK = { 11: 'P', 12: 'N', 13: 'Q', 14: 'K', 15: 'A' };
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
const OPPONENT_FAN = { minWidth: 20, maxWidth: 34, portraitWidthRatio: 0.16, angleStep: 10, spacingRatio: 0.18, plateOverlap: 7 };
const HAND_FAN_ANGLE_STEP = 1.5;
const HAND_FAN_CURVE_STEP = 2;
// How long a computer seat thinks when nothing is being shown, and the pause after an effect before it moves.
const AI_STEP_MS = 850;
const AI_STEP_REDUCED_MS = 400;
const AFTER_EFFECT_MS = 120;
// Han at or above these values get a bigger presentation.
const BIG_HAN = 4;
const LEGEND_HAN = 10;

// Pirate Tarot artwork, as served for the rest of the app (same version and delivery revision, so the cache is shared).
const ART_QUERY = `?v=${PIRATE_TAROT_ARTWORK_VERSION}&delivery=20261025`;
const ART_SUIT = { wand: 'wand', sword: 'sword', cup: 'cup', coin: 'pentacle' };
const ART_FACE = { 11: 'page', 12: 'knight', 13: 'queen', 14: 'king', 15: '1' };
const artId = (card) => (card.major ? `major-${card.num}` : `${ART_SUIT[card.suit]}-${ART_FACE[card.num] || card.num}`);
const artUrl = (card, size) => `assets/pirate-tarot/${size}/${artId(card)}.webp${ART_QUERY}`;
const BACK_URL = `assets/pirate-tarot/back.webp${ART_QUERY}`;

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const seatObserver = new ResizeObserver((entries) => {
    for (const { target } of entries) positionOpponentHand(target);
});

let match = null;
let selected = new Set();
let timer = 0;
let fast = false;
let seenEvents = 0;
let hint = '';
let fieldKey = '';
let zoomTrigger = null;
// Where your played cards were in the hand, so they can fly from there to the field.
let playOrigins = new Map();
let lastTurn = -1;

// `?seed=` fixes the shuffle so a hand can be replayed.
function makeRng() {
    if (!params.has('seed')) return Math.random;
    let seed = Number(params.get('seed')) >>> 0;
    return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const rankText = (card) => (card.major ? String(card.num) : (RANK[card.num] || String(card.num)));
const cardName = (card) => (card.major ? `大札${card.num} ${MAJOR[card.num]}` : `${SUIT_NAME[card.suit]}の${rankText(card)}`);
const sortHand = (hand) => [...hand].sort((a, b) => (a.major - b.major) || (a.num - b.num) || String(a.suit).localeCompare(String(b.suit)));

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
    // The separate rank and suit label stays readable if the picture cannot load.
    image.addEventListener('error', () => image.remove(), { once: true });
    return image;
}

// Keep the labels outside the artwork. The thin frame alone carries the suit colour.
function cardNode(card, tag = 'div') {
    const node = el(tag, 'kt-card');
    node.dataset.suit = card.major ? 'major' : card.suit;
    node.dataset.card = card.id;
    const image = artImage(artUrl(card, 'thumbs'), 'kt-card-art');
    image.width = 160;
    image.height = 240;
    const rank = el('span', 'kt-card-rank', rankText(card));
    rank.append(el('span', 'kt-card-corner-suit', card.major ? '大' : SUIT_MARK[card.suit]));
    node.append(image, rank);
    if (tag === 'button') node.type = 'button';
    node.setAttribute('aria-label', cardName(card));
    node.title = cardName(card);
    return node;
}

// A card you can tap to see the full artwork.
function zoomableCard(card) {
    const node = cardNode(card, 'button');
    node.classList.add('is-zoomable');
    node.setAttribute('aria-label', `${cardName(card)}を大きく見る`);
    node.addEventListener('click', () => {
        const zoom = $('ktZoom');
        zoomTrigger = node;
        zoom.replaceChildren(artImage(artUrl(card, 'cards'), 'kt-zoom-art'), el('span', 'kt-zoom-name', cardName(card)));
        zoom.hidden = false;
        zoom.focus();
    });
    return node;
}

function closeZoom() {
    $('ktZoom').hidden = true;
    const fallback = $('ktDialog').hidden ? $('ktFieldCards').querySelector('button') : $('ktDialogActions').querySelector('button');
    (zoomTrigger?.isConnected ? zoomTrigger : fallback)?.focus({ preventScroll: true });
    zoomTrigger = null;
}

function describe(event) {
    const who = event.by === undefined ? '' : NAMES[event.by];
    switch (event.type) {
    case 'start': return `最初の場札は ${cardName(event.cards[0])}`;
    case 'play': {
        if (event.kind === 'call') return `${who} がコール：${ROLE_NAMES[event.role.rank]}`;
        if (event.kind === 'role') return `${who} が ${ROLE_NAMES[event.role.rank]}`;
        return `${who} が ${event.cards.map(cardName).join('、')}`;
    }
    case 'pass': return `${who} はパス`;
    case 'draw': return `${who} が1枚引いた`;
    case 'cede': return `${who} は初手を出せず、親を渡した`;
    case 'clear': return `場が流れ、${who} が親`;
    case 'han': return `${who} の${ROLE_NAMES[event.role.rank]}が通って +${event.add}翻`;
    case 'back': return event.on ? '11バック：強弱が逆に' : '11バック解除';
    case 'lock': return `ロイヤルロック：${SUIT_NAME[event.suit]}`;
    case 'unlock': return 'ロック解除';
    case 'cut': return '8カット：コールかパスのみ';
    case 'skip': return `スキップ ${event.count}人`;
    case 'trash': return `${who} が手札1枚を除外`;
    case 'retrieve': return `${who} が ${NAMES[event.from]} の墓地から1枚回収`;
    case 'win': return `${who} が上がり`;
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

const hanPill = (seat) => el('span', 'kt-han-pill', `${seatHan(match, seat)}翻`);

// Match the grip in the actual contained image, including the empty space around it.
function positionOpponentHand(host) {
    const portrait = host.querySelector('.kt-seat-portrait');
    if (!portrait?.naturalWidth || !host.clientWidth) return;
    const fan = host.querySelector('.kt-opponent-hand');
    const pose = OPPONENT_HAND_POSES[host.dataset.portrait];
    const box = portrait.getBoundingClientRect();
    const seat = host.getBoundingClientRect();
    const scale = Math.min(box.width / portrait.naturalWidth, box.height / portrait.naturalHeight);
    const width = portrait.naturalWidth * scale;
    const height = portrait.naturalHeight * scale;
    const left = box.left - seat.left + (box.width - width) / 2;
    const top = box.top - seat.top + box.height - height;
    const panel = host.querySelector('.kt-seat-panel');
    // The nameplate covers the lower grip; leave every card visible above that edge.
    const gripY = Math.min(top + height * pose.y, host.clientHeight - panel.offsetHeight + OPPONENT_FAN.plateOverlap);
    const cardWidth = Math.max(OPPONENT_FAN.minWidth, Math.min(OPPONENT_FAN.maxWidth, width * OPPONENT_FAN.portraitWidthRatio));
    fan.style.left = `${left + width * pose.x}px`;
    fan.style.top = `${gripY}px`;
    fan.style.setProperty('--kt-opponent-card-width', `${cardWidth}px`);
    fan.style.setProperty('--kt-grip-angle', `${pose.angle}deg`);
}

function renderOpponentHand(host, count) {
    const fan = host.querySelector('.kt-opponent-hand');
    if (fan.dataset.count !== String(count)) {
        while (fan.children.length > count) fan.lastElementChild.remove();
        while (fan.children.length < count) {
            const back = artImage(BACK_URL, 'kt-fan-card');
            back.width = 80;
            back.height = 120;
            fan.append(back);
        }
        [...fan.children].forEach((back, index) => {
            const offset = index - (count - 1) / 2;
            back.style.setProperty('--kt-fan-angle', `${offset * OPPONENT_FAN.angleStep}deg`);
            back.style.setProperty('--kt-fan-offset', String(offset * OPPONENT_FAN.spacingRatio));
        });
        fan.dataset.count = String(count);
    }
    fan.hidden = count === 0;
    host.classList.toggle('is-last-card', count === 1);
}

function renderSeat(seat, host) {
    const round = match.round;
    const count = round.players[seat].hand.length;
    host.hidden = false;
    host.classList.toggle('is-turn', round.phase !== 'over' && round.turn === seat);
    host.dataset.seat = String(seat);
    // Keep portraits through counter updates, but rebind a slot when the seat count changes.
    if (host.dataset.portrait !== SEAT_PORTRAITS[seat] || !host.querySelector('.kt-seat-panel')) {
        const portrait = artImage(`${PORTRAIT_ART}/${SEAT_PORTRAITS[seat]}.webp`, 'kt-seat-portrait');
        portrait.width = 640;
        portrait.height = 560;
        const fan = el('div', 'kt-opponent-hand');
        fan.setAttribute('aria-hidden', 'true');
        host.replaceChildren(portrait, fan, el('div', 'kt-seat-panel'));
        host.dataset.portrait = SEAT_PORTRAITS[seat];
        portrait.addEventListener('load', () => positionOpponentHand(host), { once: true });
        seatObserver.observe(host);
    }
    const hand = el('span', 'kt-seat-hand');
    hand.append(el('span', 'kt-seat-hand-label', count === 1 ? 'あと' : '手札'), el('strong', 'kt-seat-count', String(count)), el('span', '', '枚'));
    host.querySelector('.kt-seat-panel').replaceChildren(el('strong', 'kt-seat-name', NAMES[seat]), hand,
        el('span', 'kt-seat-chips kt-chip', `${match.chips[seat]}`), hanPill(seat), badges(seat));
    renderOpponentHand(host, count);
}

function renderField() {
    const round = match.round;
    const host = $('ktFieldCards');
    const plays = round.field.plays;
    const top = plays[plays.length - 1];
    const key = `${match.roundIndex}:${plays.length}:${top ? top.cards.map((c) => c.id).join(',') : ''}`;
    if (key !== fieldKey) {
        // Rebuilt only when the field changes, so the arrival movement plays once per play.
        fieldKey = key;
        // A call is shown together with the field card it was joined to.
        const shown = !top ? [] : top.call ? [...plays[plays.length - 2].cards, ...top.cards] : top.cards;
        host.replaceChildren(...(shown.length ? shown.map(zoomableCard) : [el('span', 'kt-field-empty', '最初の札を出してください')]));
        host.classList.toggle('is-wide', shown.length > 3);
    }
    if (!top) {
        $('ktFieldOwner').textContent = round.phase === 'over' ? '' : `${NAMES[round.turn]} の初手`;
    } else {
        const lead = top.start ? '最初の場札' : `${NAMES[top.by]} の札`;
        $('ktFieldOwner').textContent = round.field.kind === 'role' ? `${lead}：${ROLE_NAMES[round.field.role.rank]}` : lead;
    }
    const state = [];
    if (round.back) state.push('11バック');
    if (round.lock) state.push(`ロック ${SUIT_NAME[round.lock]}`);
    if (round.cut) state.push('8カット');
    if (plays.length > 1) state.push(`重ね ${plays.length}`);
    $('ktFieldState').replaceChildren(...state.map((text) => el('span', 'kt-state-pill', text)));
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

function renderHand() {
    const round = match.round;
    const myTurn = round.turn === ME && round.phase !== 'over';
    const choosing = myTurn && round.phase === 'play';
    const hand = sortHand(round.players[ME].hand);
    const host = $('ktHand');
    const handKey = hand.map((card) => card.id).join(',');
    // Keep the actual buttons while selecting: replacing them drops keyboard focus
    // and restarts the card movement before the selection can be seen.
    if (host.dataset.cards !== handKey) {
        host.replaceChildren(...hand.map((card) => cardNode(card, 'button')));
        host.dataset.cards = handKey;
    }
    const playable = new Set();
    if (choosing) for (const move of Rules.listMoves(round, ME)) for (const c of move.cards) playable.add(c.id);
    [...host.children].forEach((node, index) => {
        const card = hand[index];
        const offset = index - (hand.length - 1) / 2;
        node.style.setProperty('--kt-card-angle', `${offset * HAND_FAN_ANGLE_STEP}deg`);
        node.style.setProperty('--kt-card-offset', `${Math.abs(offset) * HAND_FAN_CURVE_STEP}px`);
        node.style.setProperty('--kt-card-order', String(index));
        node.classList.toggle('is-selected', selected.has(card.id));
        node.classList.toggle('is-playable', playable.has(card.id));
        node.classList.toggle('is-dim', choosing && !playable.has(card.id));
        node.setAttribute('aria-pressed', String(selected.has(card.id)));
        node.disabled = !myTurn || round.phase === 'retrieve';
    });
    $('ktHandCount').textContent = `${hand.length}枚`;
    $('ktSelection').textContent = selected.size ? `${selected.size}枚を選択中` : myTurn ? 'タップして選択' : '相手の手番';
}

function renderMe() {
    const round = match.round;
    $('ktMe').replaceChildren(el('strong', '', NAMES[ME]), el('span', 'kt-me-chips kt-chip', `${match.chips[ME]}`), hanPill(ME), badges(ME));
    $('ktMe').classList.toggle('is-turn', round.phase !== 'over' && round.turn === ME);
}

function renderActions() {
    const round = match.round;
    const mine = round.turn === ME;
    const play = $('ktPlay');
    const pass = $('ktPass');
    const drawButton = $('ktDraw');
    if (mine && round.phase === 'trash') {
        play.textContent = '除外する';
        play.disabled = selected.size !== 1;
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

function renderMessage(events) {
    const round = match.round;
    const fresh = events.map(describe).filter(Boolean);
    const box = $('ktMessage');
    if (fresh.length) box.dataset.last = fresh.slice(-2).join(' ／ ');
    let text = box.dataset.last || '';
    if (round.phase !== 'over' && round.turn === ME) {
        const pick = selectionPlay();
        if (round.phase === 'trash') text = 'ナイトが通りました。手札を1枚除外できます。';
        else if (hint) text = hint;
        else if (pick.cards.length && !pick.res.ok) text = pick.res.reason;
        else if (!pick.cards.length) text = `${text ? `${text} ／ ` : ''}あなたの番です`;
    }
    box.textContent = text;
}

// Draws the table and plays the effects for what happened since the last draw.
// Returns how long those effects take, so the computer seats wait for them.
function render() {
    const round = match.round;
    const events = round.events.slice(seenEvents);
    seenEvents = round.events.length;
    const fieldBefore = events.length ? captureField() : [];
    // Once the last round is settled the label stays on it.
    $('ktRound').textContent = match.over ? `全${match.rounds}局` : `${roundLabel(match)} / ${match.rounds}`;
    $('ktPot').textContent = `場 ${match.pot}`;
    $('ktDeck').textContent = `山札 ${round.deck.length}`;
    for (const [seat, host] of seatSlots()) renderSeat(seat, host);
    renderField();
    renderMe();
    renderHand();
    renderActions();
    renderMessage(events);
    return playEffects(events, fieldBefore);
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
    return [...$('ktFieldCards').querySelectorAll('.kt-card')].map((node) => ({ node: node.cloneNode(true), rect: node.getBoundingClientRect() }));
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
function flyPlay(event, at, floating) {
    const nodes = event.cards.map((card) => $('ktFieldCards').querySelector(`[data-card="${card.id}"]`));
    const source = event.by === ME ? null : handBox(event.by);
    const fieldWidth = rectOf($('ktFieldCards').querySelector('.kt-card'))?.width || 72;
    const centre = fieldCentre();
    event.cards.forEach((card, index) => {
        const node = nodes[index];
        const offset = (index - (event.cards.length - 1) / 2) * (fieldWidth * 0.75);
        const to = node ? rectOf(node) : Fx.boxAt({ x: centre.x + offset, y: centre.y }, fieldWidth, fieldWidth * 1.5);
        const from = (event.by === ME && playOrigins.get(card.id)) || source || to;
        if (node) node.classList.add('is-arriving');
        const ghost = cardNode(card);
        const landed = Fx.fly(ghost, from, to, { duration: 320, delay: at + index * 60, keep: !node, spin: event.by === ME ? 0 : -12 });
        landed.then(() => {
            if (node?.isConnected) {
                node.classList.remove('is-arriving');
                node.classList.add('is-landed');
            }
        });
        if (!node) floating.push({ node: ghost, rect: to });
    });
    const landing = at + 320 + (event.cards.length - 1) * 60;
    const strong = event.kind !== 'normal' || event.cards.length >= 2 || event.cards.some((card) => card.major && card.num === 21);
    Fx.later(landing, () => {
        Fx.impact(nodes[0] ? rectOf(nodes[0]) : Fx.boxAt(centre, fieldWidth, fieldWidth * 1.5), { strong });
        if (strong) Fx.shake($('ktFelt'), event.kind === 'normal' ? 4 : 7);
    });
    Sfx.play('card', landing / 1000);
    return landing;
}

function roleBanner(event, at) {
    const han = ROLE_HAN[event.role.rank] - (event.kind === 'call' ? 1 : 0);
    const tier = han >= LEGEND_HAN ? 'legend' : han >= BIG_HAN ? 'big' : 'normal';
    const label = event.kind === 'call' ? `コール！${ROLE_NAMES[event.role.rank]}` : `${ROLE_NAMES[event.role.rank]}！`;
    Fx.later(at, () => {
        const length = Fx.banner(label, rectOf($('ktFelt')), tier, `${NAMES[event.by]}　場を流せば +${han}翻`);
        if (tier !== 'normal') Fx.later(120, () => Fx.flash(tier === 'legend' ? 'white' : 'gold'));
        return length;
    });
    Sfx.play(tier === 'legend' ? 'legend' : 'role', at / 1000);
    return tier === 'legend' ? 1300 : 950;
}

const STAMPS = {
    cut: ['8カット', 'red', 'slash'],
    back: ['11バック', 'purple', 'stamp'],
    skip: ['スキップ', 'blue', 'stamp'],
    lock: ['ロック', 'gold', 'stamp'],
    unlock: ['ロック解除', 'gold', 'stamp'],
    trash: ['除外', 'red', 'stamp'],
    retrieve: ['回収', 'purple', 'stamp']
};

// Plays the effects of one batch of events in order and returns the total time.
function playEffects(events, fieldBefore) {
    if (!events.length || !Fx.active()) return 0;
    const round = match.round;
    const floating = [];
    let at = 0;
    for (const event of events) {
        switch (event.type) {
        case 'start': {
            const hand = [...$('ktHand').children];
            const dealt = Fx.deal(hand, deckBox());
            hand.forEach((_, index) => Sfx.play('deal', (120 + index * 55) / 1000));
            const first = $('ktFieldCards').querySelector('.kt-card');
            if (first) {
                first.classList.add('is-arriving');
                Fx.fly(backCard(), deckBox(), rectOf(first), { duration: 320, delay: dealt }).then(() => {
                    first.classList.remove('is-arriving');
                    first.classList.add('is-landed');
                });
                Sfx.play('card', (dealt + 320) / 1000);
            }
            at = Math.max(at, dealt + 360);
            break;
        }
        case 'play':
            if (event.kind !== 'normal' && Fx.moving()) at += roleBanner(event, at) * 0.55;
            else if (event.kind !== 'normal') at += roleBanner(event, at);
            at = Math.max(at, flyPlay(event, at, floating));
            break;
        case 'pass':
            Fx.later(at, () => { const plate = rectOf(seatPlate(event.by)); if (plate) Fx.bubble('パス', plate); });
            Sfx.play('pass', at / 1000);
            break;
        case 'cede':
            Fx.later(at, () => { const plate = rectOf(seatPlate(event.by)); if (plate) Fx.bubble('親を渡す', plate); });
            break;
        case 'draw': {
            const to = handBox(event.by);
            if (Fx.moving() && to) Fx.fly(backCard(), deckBox(), Fx.boxAt({ x: to.left + to.width / 2, y: to.top + to.height / 2 }, 30, 45), { duration: 300, delay: at });
            Sfx.play('deal', at / 1000);
            at += 220;
            break;
        }
        case 'clear': {
            const leaving = [...fieldBefore.filter(({ node }) => !floating.some((f) => f.node.dataset.card === node.dataset.card)), ...floating];
            fieldBefore = [];
            floating.length = 0;
            if (leaving.length) {
                Fx.later(at, () => Fx.sweep(leaving));
                Sfx.play('clear', at / 1000);
                at += 380;
            }
            break;
        }
        case 'han': {
            const tier = event.add >= LEGEND_HAN ? 'legend' : event.add >= BIG_HAN ? 'big' : 'gold';
            // The swept field is empty now, so the han rises from its middle and flies to the seat.
            Fx.later(at, () => Fx.orb(`+${event.add}翻`, Fx.boxAt(fieldCentre(), 10, 10), seatHanPill(event.by), tier));
            Sfx.play('han', at / 1000, Math.min(4, 1 + Math.ceil(event.add / 3)));
            at += 1000;
            break;
        }
        case 'win': {
            Fx.later(at, () => {
                const plate = rectOf(seatPlate(event.by));
                if (!plate) return;
                Fx.stamp('上がり！', { x: plate.left + plate.width / 2, y: plate.top - 6 }, event.by === ME ? 'legend' : 'gold', { big: true });
                if (event.by === ME) Fx.flash('gold');
                Fx.shake($('ktFelt'), 6);
            });
            Sfx.play(event.by === ME ? 'win' : 'lose', at / 1000);
            at += 700;
            break;
        }
        case 'drawn':
            Fx.later(at, () => Fx.banner('引き分け', rectOf($('ktFelt')), 'normal', '場のチップは次の局へ'));
            at += 950;
            break;
        default: {
            const stamp = STAMPS[event.type];
            if (!stamp) break;
            Fx.later(at, () => Fx.stamp(stamp[0], stampPoint(), stamp[1]));
            Sfx.play(stamp[2], at / 1000);
            at += 380;
        }
        }
    }
    // Your turn: a light passes over your hand.
    if (round.phase === 'play' && round.turn === ME && lastTurn !== ME) {
        Fx.later(at, () => Fx.sweepLight(rectOf($('ktHand'))));
        Sfx.play('turn', at / 1000);
    }
    lastTurn = round.phase === 'over' ? -1 : round.turn;
    playOrigins = new Map();
    return at;
}

// Chips fly from every loser, and the pot, to the winner; the counters run with them.
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
    if (result.pot) end = Math.max(end, Fx.coins(rectOf($('ktPot')), winnerPlate, 8, start + 200));
    const winnerChips = counters.get(result.winner);
    Fx.later(start + 300, () => Fx.countUp(winnerChips, match.chips[result.winner] - result.delta[result.winner], match.chips[result.winner], Math.max(400, end - start - 300)));
    Fx.later(end, () => Fx.pop(winnerChips));
    // Without movement nothing flies; the numbers change at once.
    return Fx.moving() ? end + 250 : start;
}

function closeDialog() {
    $('ktDialog').hidden = true;
}

function openDialog(title, body, actions) {
    $('ktDialogTitle').textContent = title;
    $('ktDialogBody').replaceChildren(...body);
    $('ktDialogActions').replaceChildren(...actions.map(([label, run, main]) => {
        const button = el('button', main ? 'kt-button kt-button-main' : 'kt-button', label);
        button.type = 'button';
        button.addEventListener('click', run);
        return button;
    }));
    $('ktDialog').hidden = false;
    $('ktDialogActions').querySelector('button')?.focus();
}

function showRetrieve() {
    const round = match.round;
    const body = [el('p', '', '審判の効果です。ほかの人の墓地から小札を1枚、手札に戻せます。')];
    round.players.forEach((player, seat) => {
        if (seat === ME || !player.grave.length) return;
        body.push(el('p', 'kt-dialog-label', `${NAMES[seat]} の墓地`));
        const row = el('div', 'kt-dialog-cards');
        row.append(...sortHand(player.grave).map((card) => {
            const node = cardNode(card, 'button');
            node.addEventListener('click', () => {
                closeDialog();
                Rules.retrieve(round, ME, card.id);
                after();
            });
            return node;
        }));
        body.push(row);
    });
    openDialog('墓地から回収', body, [['回収しない', () => { closeDialog(); Rules.retrieve(round, ME, null); after(); }]]);
}

function showResult(result) {
    const round = match.round;
    const rules = match.rules;
    const body = [];
    if (result.winner === null) {
        body.push(el('p', '', '全員が初手を出せず、引き分けです。場のチップは次の局に持ち越します。'));
    } else {
        const w = result.winner;
        const parts = [`上がり${rules.baseHan}`];
        if (round.han[w]) parts.push(`役${round.han[w]}`);
        if (round.dealer === w) parts.push(`親${rules.dealerHan}`);
        const head = el('p', 'kt-result-head');
        head.append(el('strong', '', `${NAMES[w]} の上がり`), el('span', 'kt-han-pill kt-han-pill-big', `${result.winnerHan}翻`));
        body.push(head, el('p', 'kt-result-note', parts.join(' ＋ ')));
        for (const pay of result.payments) {
            const extra = [];
            if (pay.aces) extra.push(`A${pay.aces}枚 +${pay.aces * rules.aceHan}`);
            if (round.dealer === pay.from) extra.push(`親 +${rules.dealerHan}`);
            const row = el('div', 'kt-result-row');
            const text = el('p', '', `${NAMES[pay.from]}：${pay.cards}枚 × ${pay.han}翻${extra.length ? `（${extra.join('、')}）` : ''} × ${rules.cardRate} ＝ `);
            text.append(el('strong', 'kt-chip', `${pay.paid}`));
            if (pay.paid < pay.owed) text.append(`（持ち分まで）`);
            const left = el('div', 'kt-dialog-cards');
            left.append(...sortHand(round.players[pay.from].hand).map(zoomableCard));
            row.append(text, left);
            body.push(row);
        }
        const pot = el('p', 'kt-result-pot', `場のチップも ${NAMES[w]} へ：`);
        pot.append(el('strong', 'kt-chip', `${result.pot}`));
        body.push(pot);
    }
    const table = el('ul', 'kt-score');
    match.chips.forEach((chips, seat) => {
        const delta = result.delta[seat];
        const item = el('li', '', NAMES[seat]);
        item.append(el('span', 'kt-chip', `${chips}`));
        if (delta) item.append(el('span', delta > 0 ? 'kt-delta kt-delta-up' : 'kt-delta kt-delta-down', `${delta > 0 ? '+' : ''}${delta}`));
        table.append(item);
    });
    body.push(table);
    // The changes count up from zero once the dialog is open.
    Fx.later(150, () => table.querySelectorAll('.kt-delta').forEach((node) => {
        const value = Number(node.textContent);
        Fx.countUp(node, 0, value, 650, (n) => `${n > 0 ? '+' : ''}${n}`);
    }));
    if (!match.over) {
        if (result.repeat) body.push(el('p', 'kt-dialog-label', `親の ${NAMES[result.winner]} が上がったので、親を続けます（連荘）。`));
        openDialog(`${result.label}の結果`, body, [[result.repeat ? '連荘：次へ' : '次の局へ', () => { closeDialog(); beginRound(); }, true]]);
        return;
    }
    const order = ranking(match);
    body.push(el('p', 'kt-dialog-label', match.chips.some((c) => c <= 0) ? 'チップが尽きた人が出たので、ここで終了です。' : '全局が終わりました。'));
    const final = el('ol', 'kt-score kt-score-final');
    for (const entry of order) {
        const item = el('li', '', NAMES[entry.seat]);
        item.append(el('span', 'kt-chip', `${entry.chips}`));
        final.append(item);
    }
    body.push(final);
    if (Fx.active()) {
        if (order[0].seat === ME) { Fx.confetti(); Sfx.play('win', 0.1); } else Sfx.play('lose', 0.1);
    }
    openDialog(order[0].seat === ME ? 'あなたの勝ち' : `${NAMES[order[0].seat]} の勝ち`, body, [
        ['もう一度', () => { closeDialog(); begin(match.seats); }, true],
        ['人数を選び直す', () => { closeDialog(); $('ktTable').hidden = true; $('ktSetup').hidden = false; }]
    ]);
}

function act(seat, action) {
    const round = match.round;
    if (action.type === 'play') return Rules.play(round, seat, action.ids, action.kind);
    if (action.type === 'pass') return Rules.pass(round, seat);
    if (action.type === 'draw') return Rules.draw(round, seat);
    if (action.type === 'cede') return Rules.cede(round, seat);
    if (action.type === 'trash') return Rules.trash(round, seat, action.id);
    return Rules.retrieve(round, seat, action.id);
}

function step() {
    timer = 0;
    const round = match.round;
    if (round.phase === 'over') return;
    const seat = round.turn;
    if (seat === ME) {
        // The only forced move you have: handing the lead on when you cannot open.
        if (Rules.options(round, ME).mustCede) { Rules.cede(round, ME); after(); }
        return;
    }
    act(seat, chooseAction(round, seat));
    after();
}

function after() {
    const round = match.round;
    selected = new Set([...selected].filter((id) => round.players[ME].hand.some((c) => c.id === id)));
    if (round.phase === 'over') {
        const result = settleRound(match);
        const shown = playSettlement(result, render());
        const current = match;
        // The result opens once the chips have landed.
        Fx.later(shown, () => { if (match === current) showResult(result); });
        return;
    }
    const effects = render();
    if (round.turn === ME) {
        if (round.phase === 'retrieve') { showRetrieve(); return; }
        if (round.phase === 'play' && !Rules.options(round, ME).mustCede) return;
        if (round.phase === 'trash') return;
    }
    clearTimeout(timer);
    const pause = fast ? 60 : reducedMotion() ? AI_STEP_REDUCED_MS : AI_STEP_MS;
    timer = setTimeout(step, Math.max(pause, effects ? effects + AFTER_EFFECT_MS : 0));
}

function beginRound() {
    selected = new Set();
    seenEvents = 0;
    hint = '';
    fieldKey = '';
    delete $('ktMessage').dataset.last;
    startRound(match);
    after();
}

function begin(seats) {
    clearTimeout(timer);
    Fx.cancelAll();
    lastTurn = -1;
    match = createMatch({ players: seats, rng: makeRng() });
    for (const id of ['ktSeatTop', 'ktSeatLeft', 'ktSeatRight']) $(id).hidden = true;
    $('ktSetup').hidden = true;
    $('ktTable').hidden = false;
    $('ktFelt').dataset.seats = String(seats);
    beginRound();
}

$('ktHero').append(...[{ major: true, num: 10 }, { major: true, num: 21 }, { major: false, num: 15, suit: 'sword' }]
    .map((card) => artImage(artUrl(card, 'thumbs'), 'kt-hero-card')));

$('ktZoom').addEventListener('click', closeZoom);

function renderSoundButton() {
    const on = Sfx.isOn();
    $('ktSound').setAttribute('aria-pressed', String(on));
    $('ktSound').setAttribute('aria-label', on ? '効果音：オン' : '効果音：オフ');
}
renderSoundButton();
$('ktSound').addEventListener('click', () => {
    Sfx.setOn(!Sfx.isOn());
    renderSoundButton();
    Sfx.play('chip');
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('ktZoom').hidden) {
        event.preventDefault();
        closeZoom();
        return;
    }
    const modal = !$('ktZoom').hidden ? $('ktZoom') : !$('ktDialog').hidden ? $('ktDialog') : null;
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
    if (!node || node.disabled) return;
    const id = node.dataset.card;
    if (match.round.phase === 'trash') selected = new Set(selected.has(id) ? [] : [id]);
    else if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    hint = '';
    render();
});

$('ktStart').addEventListener('click', () => {
    fast = $('ktFast').checked || params.has('fast');
    // Fast play skips every effect, sound included.
    Fx.setQuiet(fast);
    if (!fast) Sfx.unlock();
    begin(Number(document.querySelector('input[name="ktSeats"]:checked').value));
});

$('ktPlay').addEventListener('click', () => {
    const round = match.round;
    if (round.turn !== ME) return;
    if (round.phase === 'trash') {
        const res = Rules.trash(round, ME, [...selected][0]);
        if (!res.ok) { hint = res.reason; render(); return; }
        selected = new Set();
        after();
        return;
    }
    const pick = selectionPlay();
    const origins = new Map(pick.cards.map((card) => [card.id, rectOf($('ktHand').querySelector(`[data-card="${card.id}"]`))]));
    const res = Rules.play(round, ME, pick.cards.map((c) => c.id), pick.kind);
    if (!res.ok) { hint = res.reason; render(); return; }
    playOrigins = origins;
    selected = new Set();
    after();
});

$('ktPass').addEventListener('click', () => {
    const round = match.round;
    if (round.turn !== ME) return;
    const res = round.phase === 'trash' ? Rules.trash(round, ME, null) : Rules.pass(round, ME);
    if (!res.ok) return;
    selected = new Set();
    after();
});

$('ktDraw').addEventListener('click', () => {
    if (Rules.draw(match.round, ME).ok) after();
});
