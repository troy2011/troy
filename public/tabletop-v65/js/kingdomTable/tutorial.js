// Tarot Kingdom tutorial page. The script and the rules live in tutorialScript.js and rules.js.
import * as Rules from './rules.js?v=sites-death-devil-v1';
import { roleName } from './rules.js?v=sites-death-devil-v1';
import { seatHan } from './match.js?v=sites-death-devil-v1';
import { PIRATE_TAROT_ARTWORK_VERSION } from '../../assets/pirate-tarot/version.js';
import { CHAPTERS, ME, NAMES, startChapter, currentStep, chapterDone, perform, performCpu } from './tutorialScript.js?v=pirate-ability-v1';

const SUIT_NAME = { wand: 'ワンド', sword: 'ソード', cup: 'カップ', coin: 'ペンタクル' };
const MAJOR = ['愚者', '魔術師', '女教皇', '女帝', '皇帝', '法王', '恋人', '戦車', '力', '隠者', '運命の輪', '正義',
    '吊るされた男', '死神', '節制', '悪魔', '塔', '星', '月', '太陽', '審判', '世界'];
const ART_SUIT = { wand: 'wand', sword: 'sword', cup: 'cup', coin: 'pentacle' };
const ART_FACE = { 11: 'page', 12: 'knight', 13: 'queen', 14: 'king', 15: '1' };
const ART_QUERY = `?v=${PIRATE_TAROT_ARTWORK_VERSION}&delivery=20261025`;
const DONE_KEY = 'tarot-kingdom-tutorial:done';

const $ = id => document.getElementById(id);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const rankText = card => !card.major && card.num === 15 ? 'A' : String(card.num);
const cardName = card => card.major ? `大札${card.num} ${MAJOR[card.num]}` : `${SUIT_NAME[card.suit]}の${rankText(card)}`;
const artId = card => card.major ? `major-${card.num}` : `${ART_SUIT[card.suit]}-${ART_FACE[card.num] || card.num}`;
const byNumber = cards => cards.slice().sort((a, b) => a.num - b.num || Number(a.major) - Number(b.major) || Rules.SUITS.indexOf(a.suit) - Rules.SUITS.indexOf(b.suit));

let session = null;
let selected = new Set();
let seenEvents = 0;
let waiting = null;    // { text, then } while the player reads an explanation
let timer = 0;
let coachKey = '';

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function cardNode(card, tag = 'div') {
    const node = el(tag, 'kt-card');
    node.dataset.suit = card.major ? 'major' : card.suit;
    const suits = Rules.suitsOf(card);
    node.dataset.suits = suits.join(' ');
    node.dataset.suitCount = String(suits.length);
    node.dataset.card = card.id;
    const image = el('img', 'kt-card-art');
    image.src = `/assets/pirate-tarot/thumbs/${artId(card)}.webp${ART_QUERY}`;
    image.alt = '';
    image.width = 160;
    image.height = 240;
    image.decoding = 'async';
    image.addEventListener('error', () => image.remove(), { once: true });
    const rank = el('span', 'kt-card-rank');
    const value = el('span', 'kt-card-value');
    if (card.major && card.num >= 16 && card.num <= 19) value.append(el('span', 'kt-card-major-digit', '1'), String(card.num % 10));
    else value.textContent = rankText(card);
    rank.append(value);
    node.append(image, rank);
    if (tag === 'button') node.type = 'button';
    node.setAttribute('aria-label', cardName(card));
    node.title = cardName(card);
    return node;
}

function describe(event) {
    const who = NAMES[event.by] ?? '';
    switch (event.type) {
    case 'start': return `最初の場札：${cardName(event.cards[0])}`;
    case 'play': return event.kind === 'call' ? `${who} がコール：${roleName(event.role)}`
        : event.kind === 'role' ? `${who} が ${roleName(event.role)}` : `${who} が ${event.cards.map(cardName).join('、')}`;
    case 'pass': return `${who} はパス`;
    case 'clear': return `場が流れ、${who} が親`;
    case 'han': return `${who} の${roleName(event.role)}が通って +${event.add}翻`;
    case 'majorClear': return `${who} の大札${event.num}が場を流して +${event.add}翻`;
    case 'reverse': return '手番が逆回り';
    case 'back': return event.on ? '11バック：強弱が逆に' : '11バック解除';
    case 'lock': return `ロック：${Rules.lockSuits(event.suit).map(s => SUIT_NAME[s]).join('・')}`;
    case 'reset': return '節制：効果をリセット';
    case 'cut': return '8カット：コールかパスのみ';
    case 'skip': return `スキップ ${event.count}人`;
    case 'win': return `${who} が上がり${event.lastCardHan ? `：切札 +${event.lastCardHan}翻` : ''}`;
    default: return '';
    }
}

function doneChapters() {
    try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')); } catch { return new Set(); }
}
function markDone(id) {
    const done = doneChapters();
    done.add(id);
    try { localStorage.setItem(DONE_KEY, JSON.stringify([...done])); } catch { /* This visit only. */ }
}

function renderMenu() {
    const done = doneChapters();
    $('ttChapters').replaceChildren(...CHAPTERS.map((chapter, index) => {
        const item = el('li');
        const button = el('button', 'kt-button');
        button.type = 'button';
        button.dataset.chapter = String(index);
        const label = el('span');
        label.append(el('span', '', chapter.title), el('br'), el('small', '', `${chapter.steps.filter(s => s.seat === ME).length}手`));
        button.append(el('span', 'tt-chapter-no', `第${index + 1}章`), label, el('span', 'tt-chapter-done', done.has(chapter.id) ? '済' : ''));
        button.addEventListener('click', () => openChapter(index));
        item.append(button);
        return item;
    }));
}

function showMenu() {
    clearTimeout(timer);
    session = null;
    closeDialog();
    renderMenu();
    $('ttTable').hidden = true;
    $('ttMenu').hidden = false;
    $('ttChapters').querySelector('button')?.focus({ preventScroll: true });
}

function openDialog(title, body, actions) {
    $('ttDialogTitle').textContent = title;
    $('ttDialogBody').replaceChildren(...body);
    $('ttDialogActions').replaceChildren(...actions.map(([label, run, main]) => {
        const button = el('button', main ? 'kt-button kt-button-main' : 'kt-button', label);
        button.type = 'button';
        button.addEventListener('click', run);
        return button;
    }));
    $('ttDialog').hidden = false;
    $('ttTable').inert = true;
    $('ttDialogActions').querySelector('button')?.focus();
}
function closeDialog() {
    $('ttDialog').hidden = true;
    $('ttTable').inert = false;
}

function openChapter(index) {
    clearTimeout(timer);
    session = startChapter(index);
    selected = new Set();
    seenEvents = 0;
    waiting = null;
    coachKey = '';
    $('ttMenu').hidden = true;
    $('ttTable').dataset.chapter = String(index);
    $('ttTable').hidden = false;
    $('ttEvent').textContent = '';
    render();
    openDialog(`第${index + 1}章 ${session.chapter.title}`, [el('p', '', session.chapter.intro)], [['始める', () => { closeDialog(); flow(); }, true]]);
}

function seatBadges(seat) {
    const round = session.match.round;
    const list = [];
    if (round.dealer === seat) list.push(el('span', 'tt-badge', '親'));
    if (round.passed.includes(seat)) list.push(el('span', 'tt-badge is-pass', 'パス'));
    return list;
}

function renderSeats() {
    const round = session.match.round;
    $('ttSeats').replaceChildren(...[1, 2].map(seat => {
        const box = el('div', 'tt-seat');
        box.dataset.seat = String(seat);
        box.classList.toggle('is-turn', round.phase !== 'over' && round.turn === seat);
        box.append(el('strong', '', NAMES[seat]), el('span', 'tt-count', `手札${round.players[seat].hand.length}枚`),
            el('span', 'kt-han-pill', `${seatHan(session.match, seat)}翻`), ...seatBadges(seat));
        return box;
    }));
    const mine = $('ttMe');
    mine.classList.toggle('is-turn', round.phase !== 'over' && round.turn === ME);
    mine.replaceChildren(el('strong', '', NAMES[ME]), el('span', 'tt-count', `手札${round.players[ME].hand.length}枚`),
        el('span', 'kt-han-pill', `${seatHan(session.match, ME, { preview: true })}翻`), ...seatBadges(ME));
}

function renderField() {
    const round = session.match.round;
    const plays = round.field.plays;
    const top = plays.at(-1);
    const cards = top ? (top.call ? [...plays.at(-2).cards, ...top.cards] : top.cards) : [];
    const host = $('ttFieldCards');
    const key = cards.map(c => c.id).join(',');
    if (host.dataset.cards !== key) {
        host.replaceChildren(...(cards.length ? cards.map(c => cardNode(c)) : [el('span', 'tt-field-empty', round.phase === 'over' ? '' : '場は空です')]));
        host.dataset.cards = key;
    }
    host.classList.toggle('is-wide', cards.length > 3);
    $('ttFieldOwner').textContent = !top ? (round.phase === 'over' ? `${NAMES[round.winner]} の上がり` : `${NAMES[round.turn]} が親（初手）`)
        : `${top.start ? '最初の場札' : round.phase === 'over' && round.winner === top.by ? `${NAMES[top.by]} の上がり札` : `${NAMES[top.by]} の札`}${round.field.kind === 'role' ? `：${roleName(round.field.role)}` : ''}`;
    const state = [];
    if (round.direction === -1) state.push('逆回り（この局）');
    if (round.back) state.push('11バック');
    if (round.lock) state.push(`ロック ${Rules.lockSuits(round.lock).map(s => SUIT_NAME[s]).join('・')}`);
    if (round.cut) state.push('8カット');
    $('ttFieldState').replaceChildren(...state.map(text => el('span', 'kt-state-pill', text)));
}

function setCoach(text, key) {
    const coach = $('ttCoach');
    $('ttCoachText').textContent = text;
    if (key !== coachKey) {
        coachKey = key;
        coach.classList.remove('is-fresh');
        void coach.offsetWidth;
        coach.classList.add('is-fresh');
        $('ttCoachHint').textContent = '';
    }
}

function render() {
    const round = session.match.round;
    const step = currentStep(session);
    const fresh = round.events.slice(seenEvents).map(describe).filter(Boolean);
    seenEvents = round.events.length;
    if (fresh.length) $('ttEvent').textContent = fresh.slice(-2).join(' ／ ');
    const playerStep = !waiting && step?.seat === ME && round.turn === ME;
    $('ttChapterTitle').textContent = `第${session.index + 1}章 ${session.chapter.title}`;
    const mine = session.chapter.steps.filter(s => s.seat === ME);
    const doneMine = session.chapter.steps.slice(0, session.step).filter(s => s.seat === ME).length;
    $('ttProgress').textContent = `${Math.min(doneMine + (playerStep ? 1 : 0), mine.length)} / ${mine.length}`;
    document.body.dataset.ttStep = `${session.index}:${session.step}${waiting ? ':read' : ''}`;
    renderSeats();
    renderField();

    const targets = new Set(playerStep && step.type === 'play' ? step.cards : []);
    const hand = byNumber(round.players[ME].hand);
    const host = $('ttHand');
    const existing = new Map([...host.children].map(node => [node.dataset.card, node]));
    host.replaceChildren(...hand.map(card => existing.get(card.id) || cardNode(card, 'button')));
    for (const node of host.children) {
        const id = node.dataset.card;
        node.classList.toggle('is-target', targets.has(id) && !selected.has(id));
        node.classList.toggle('is-selected', selected.has(id));
        node.classList.toggle('is-other', playerStep && step.type === 'play' && !targets.has(id));
        node.setAttribute('aria-pressed', String(selected.has(id)));
        node.disabled = !playerStep || step.type !== 'play';
    }
    const play = $('ttPlay'), passButton = $('ttPass');
    const kind = step?.cards.length === 5 ? 'role' : step?.cards.length === 4 ? 'call' : 'normal';
    play.textContent = playerStep && step.type === 'play' ? (kind === 'call' ? 'コール' : kind === 'role' ? '役を出す' : '出す') : '出す';
    const complete = playerStep && step.type === 'play' && step.cards.every(id => selected.has(id)) && selected.size === step.cards.length;
    play.classList.toggle('is-target', complete);
    passButton.classList.toggle('is-target', playerStep && step.type === 'pass');
    play.disabled = !playerStep;
    passButton.disabled = !playerStep;

    $('ttNext').hidden = !waiting;
    if (waiting) setCoach(waiting.text, `read:${session.index}:${session.step}`);
    else if (playerStep) setCoach(step.before, `step:${session.index}:${session.step}`);
    else if (round.phase !== 'over') setCoach(`${NAMES[round.turn]} の番です…`, `cpu:${session.index}:${session.step}`);
}

// Advance through computer steps until the player must act or read.
function flow() {
    clearTimeout(timer);
    if (!session || waiting) return;
    if (chapterDone(session)) { finishChapter(); return; }
    const step = currentStep(session);
    render();
    if (step.seat === ME) return;
    timer = setTimeout(() => {
        const res = performCpu(session);
        if (!res.ok) throw new Error(`Tutorial script step failed: ${res.reason}`);
        afterStep(step);
    }, reducedMotion() ? 450 : 800);
}

function afterStep(step) {
    if (step.after) {
        waiting = { text: step.after };
        render();
        if ($('ttTable').contains(document.activeElement) || document.activeElement === document.body) $('ttNext').focus({ preventScroll: true });
        return;
    }
    flow();
}

function hint(text) {
    $('ttCoachHint').textContent = text;
}

function finishChapter() {
    render();
    markDone(session.chapter.id);
    const index = session.index;
    const last = index === CHAPTERS.length - 1;
    const body = [];
    if (session.result) body.push(...resultBody(session.result));
    body.push(el('p', '', session.chapter.outro));
    if (session.chapter.table) body.push(roleTable());
    if (last) body.push(el('p', 'kt-dialog-label', 'チュートリアルはこれで終わりです。練習で実際に遊んでみましょう。'));
    const actions = last
        ? [['卓上戦へ', () => { location.href = 'tarot-kingdom-table.html'; }, true], ['章を選ぶ', showMenu]]
        : [['次の章へ', () => { closeDialog(); openChapter(index + 1); }, true], ['章を選ぶ', showMenu]];
    openDialog(last ? 'チュートリアル完了' : `第${index + 1}章 クリア`, body, actions);
}

function resultBody(result) {
    const match = session.match, round = match.round, rules = match.rules, w = result.winner;
    const parts = [`上がり${rules.baseHan}`];
    const clear = round.majorClearHan?.[w] || 0;
    if (round.han[w] - clear) parts.push(`役${round.han[w] - clear}`);
    if (clear) parts.push(`大札流し${clear}`);
    if (result.lastCardHan) parts.push(`切札${result.lastCardHan}`);
    if (round.dealer === w) parts.push(`親${rules.dealerHan}`);
    const head = el('p', 'kt-result-head');
    head.append(el('strong', '', `${NAMES[w]} の上がり`), el('span', 'kt-han-pill kt-han-pill-big', `${result.winnerHan}翻`));
    const out = [head, el('p', 'kt-result-note', parts.join(' ＋ '))];
    for (const pay of result.payments) {
        const extra = [];
        if (pay.aces) extra.push(`A${pay.aces}枚 +${pay.aces * rules.aceHan}`);
        if (round.dealer === pay.from) extra.push(`親 +${rules.dealerHan}`);
        const text = el('p', 'kt-result-row', `${NAMES[pay.from]}：${pay.cards}枚 × ${pay.han}翻${extra.length ? `（${extra.join('、')}）` : ''} × ${rules.cardRate} ＝ `);
        text.append(el('strong', 'kt-chip', String(pay.paid)));
        out.push(text);
    }
    const pot = el('p', 'kt-result-pot', `場のチップ（各自20枚）も ${NAMES[w]} へ：`);
    pot.append(el('strong', 'kt-chip', String(result.pot)));
    out.push(pot);
    return out;
}

function roleTable() {
    const rows = [['ストレート', '2翻（ハイ：3翻）'], ['フラッシュ', '2翻（ハイ：3翻）'], ['フルハウス', '3翻（ハイ：4翻）'], ['フォーカード', '4翻'], ['エレメンタル', '10翻'], ['ザ・ワールド', '5翻（ハイ：15翻）'],
        ['ファイブカード', '10翻（ハイ：15翻）'], ['ストレートフラッシュ', '5翻'], ['ハイエレメンタル', '12翻'], ['ロイヤルストレートフラッシュ', '10翻']];

    const table = el('table', 'tt-table-han');
    table.append(el('caption', 'kt-dialog-label', '5枚役で場を流したときの翻（弱い順）'));
    const body = el('tbody');
    for (const [name, han] of rows) {
        const row = el('tr');
        const th = el('th', '', name);
        th.scope = 'row';
        row.append(th, el('td', '', han));
        body.append(row);
    }
    table.append(body);
    const notes = el('ul', 'tt-rules');
    notes.append(el('li', '', 'コールで作った役は1翻少なくなります。'),
        el('li', '', '大札0（愚者）は5枚役で好きな数字の代わりになります。'),
        el('li', '', 'エレメンタルは小札Aを4枚ともう1枚。悪魔15ならハイファイブカードです。'),
        el('li', '', 'ハイエレメンタルは大札16〜19ともう1枚の大札。世界21ならハイワールドです。'));
    const wrap = el('div');
    wrap.append(table, notes);
    return wrap;
}

$('ttHand').addEventListener('click', event => {
    const node = event.target.closest('.kt-card');
    if (!node || node.disabled || !session) return;
    const step = currentStep(session);
    const id = node.dataset.card;
    if (!step.cards.includes(id)) { hint('その札ではありません。光っている札を選んでください。'); return; }
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    hint('');
    render();
});

$('ttPlay').addEventListener('click', () => {
    if (!session || waiting) return;
    const step = currentStep(session);
    const res = perform(session, { seat: ME, type: 'play', ids: [...selected] });
    if (!res.ok) { hint(res.reason); render(); return; }
    selected = new Set();
    afterStep(step);
});

$('ttPass').addEventListener('click', () => {
    if (!session || waiting) return;
    const step = currentStep(session);
    const res = perform(session, { seat: ME, type: 'pass' });
    if (!res.ok) { hint(res.reason); return; }
    selected = new Set();
    afterStep(step);
});

$('ttNext').addEventListener('click', () => {
    waiting = null;
    flow();
});
$('ttRestart').addEventListener('click', () => { if (session) openChapter(session.index); });
$('ttBack').addEventListener('click', showMenu);

document.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || $('ttDialog').hidden) return;
    const buttons = [...$('ttDialog').querySelectorAll('button')];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

renderMenu();
const start = new URLSearchParams(location.search).get('chapter');
if (start !== null && CHAPTERS[Number(start) - 1]) openChapter(Number(start) - 1);
