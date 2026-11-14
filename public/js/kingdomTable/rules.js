// Tarot Kingdom, table version: the card rules of one round.
// Source of the rules: public/tarot-kingdom-real.html (2026-10-23 edition).
// Pure logic: no DOM, no storage, no network. Chips are handled in match.js.

export const SUITS = ['wand', 'sword', 'cup', 'coin'];
export const HAND_LIMIT = 8;
const HARMONY = { wand: 'sword', sword: 'wand', cup: 'coin', coin: 'cup' };
const MAJOR_SUITS = { 1: SUITS, 16: ['sword'], 17: ['cup'], 18: ['coin'], 19: ['wand'] };
const OPENING_BARRED = new Set([15, 16, 17, 18, 19, 21]);
// Han earned when a five-card role clears the field (or goes out), by role rank. A role made by a call earns one less.
export const ROLE_HAN = [0, 2, 2, 3, 4, 10, 5, 10];
export const CALL_HAN_PENALTY = 1;
export const ROLE_NAMES = ['', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ザ・ワールド', 'ストレートフラッシュ', 'ファイブカード'];

// Minor cards: num 2..14, ace is 15. Major cards: num 0..21.
export function buildDeck() {
    const deck = [];
    for (const suit of SUITS) for (let num = 2; num <= 15; num += 1) deck.push({ id: `${suit}-${num}`, major: false, num, suit });
    for (let num = 0; num <= 21; num += 1) deck.push({ id: `major-${num}`, major: true, num, suit: null });
    return deck;
}

export function shuffle(cards, rng = Math.random) {
    const list = cards.slice();
    for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

// The minor ace and the major 1 or 15 are different numbers even where their strength matches.
export const numberKey = (card) => (!card.major && card.num === 15 ? 'A' : card.num);
export const suitsOf = (card) => (card.major ? (MAJOR_SUITS[card.num] || []) : [card.suit]);
const isMinor = (card, num) => !card.major && card.num === num;
const isMajor = (card, num) => card.major && card.num === num;

function hasHarmony(a, b) {
    return a.some((x) => suitsOf(x).some((suit) => b.some((y) => suitsOf(y).includes(HARMONY[suit]))));
}

function compareLists(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
        const d = (a[i] ?? -1) - (b[i] ?? -1);
        if (d) return d;
    }
    return 0;
}

// Best five-card role of exactly five cards, or null.
export function evaluateRole(cards) {
    if (cards.length !== 5) return null;
    const fool = cards.some((c) => isMajor(c, 0));
    const rest = cards.filter((c) => !isMajor(c, 0));
    const desc = cards.map((c) => c.num).sort((a, b) => b - a);
    const allMajor = cards.every((c) => c.major);
    const counts = new Map();
    for (const c of rest) {
        const key = numberKey(c);
        const entry = counts.get(key) || { n: 0, num: c.num };
        entry.n += 1;
        counts.set(key, entry);
    }
    const groups = [...counts.values()].sort((a, b) => b.n - a.n || b.num - a.num);

    let straightTop = 0;
    const variants = [rest.map((c) => c.num)];
    // The ace counts as 1 only in A-2-3-4-5.
    if (rest.some((c) => isMinor(c, 15))) variants.push(rest.map((c) => (isMinor(c, 15) ? 1 : c.num)));
    for (const values of variants) {
        if (new Set(values).size !== values.length) continue;
        const min = Math.min(...values);
        const max = Math.max(...values);
        if (max - min > 4 || (!fool && max - min !== 4)) continue;
        straightTop = Math.max(straightTop, fool ? Math.max(max, Math.min(21, min + 4)) : max);
    }
    const suitFlush = !fool && SUITS.some((suit) => cards.every((c) => suitsOf(c).includes(suit)));

    if (groups.length === 1 && rest.length >= 4) return { rank: 7, tb: [groups[0].num] };
    if (straightTop && suitFlush) return { rank: 6, tb: [straightTop] };
    if (allMajor && cards.some((c) => isMajor(c, 21))) return { rank: 5, tb: desc };
    if (groups[0].n + (fool ? 1 : 0) >= 4) return { rank: 4, tb: [groups[0].num, groups[1] ? groups[1].num : 0] };
    if (groups.length === 2 && (fool ? groups[0].n === 2 : groups[0].n === 3)) {
        const [a, b] = fool ? [...groups].sort((x, y) => y.num - x.num) : groups;
        return { rank: 3, tb: [a.num, b.num] };
    }
    if (suitFlush || allMajor) return { rank: 2, tb: desc };
    if (straightTop) return { rank: 1, tb: [straightTop] };
    return null;
}

export function compareRoles(a, b) {
    return a.rank - b.rank || compareLists(a.tb, b.tb);
}

const fieldTop = (state) => state.field.plays[state.field.plays.length - 1].cards;
const fieldCards = (state) => state.field.plays.flatMap((play) => play.cards);
const handOf = (state, p) => state.players[p].hand;
const no = (reason) => ({ ok: false, reason });
const YES = { ok: true };

function ownCards(state, p, cards) {
    const hand = handOf(state, p);
    return new Set(cards.map((c) => c.id)).size === cards.length && cards.every((c) => hand.some((h) => h.id === c.id));
}

// One to three cards of the same number, led or laid on a field of the same size.
export function checkNormal(state, p, cards) {
    if (!cards.length || cards.length > 3) return no('通常出しは同じ数字を1〜3枚です');
    if (!ownCards(state, p, cards)) return no('手札にない札です');
    if (new Set(cards.map(numberKey)).size !== 1) return no('同じ数字の札をそろえてください');
    const special = cards.find((c) => c.major && OPENING_BARRED.has(c.num));
    if (!state.field.kind) {
        if (special && handOf(state, p).length !== 1) return no('この大札は初手に出せません');
        return YES;
    }
    if (state.field.kind === 'role') return no('5枚役の場には5枚役で返します');
    if (cards.length !== state.field.count) return no(`場と同じ${state.field.count}枚で出してください`);
    const top = fieldTop(state);
    const card = cards[0];
    const playHasMajor = cards.some((c) => c.major);
    const fieldHasMajor = top.some((c) => c.major);
    const world = isMajor(card, 21);
    if (state.cut && !(world && isMajor(top[0], 8))) return no('8のあとはコールかパスだけです');
    if (playHasMajor && top.every((c) => isMinor(c, 15))) return no('小札Aには大札で返せません');
    if (state.lock && !cards.every((c) => suitsOf(c).includes(state.lock) || isMajor(c, 14))) return no('ロック中はそのスートで返します');
    if (world) {
        if (!top[0].major) return no('世界は大札1枚の場に出します');
        if (state.back) return no('11バック中は世界を出せません');
        return YES;
    }
    if (isMajor(card, 15)) {
        return !top[0].major && top[0].num >= 11 && top[0].num <= 14 ? YES : no('悪魔はP・N・Q・Kの1枚場に出します');
    }
    if (special && !suitsOf(top[0]).includes(MAJOR_SUITS[card.num][0])) return no('この大札は対応するスートの1枚場に出します');
    const mine = card.num;
    const theirs = top[0].num;
    if (mine !== theirs) {
        if (state.back ? mine < theirs : mine > theirs) return YES;
        return no(state.back ? '11バック中は弱い数字で返します' : 'より強い数字で返します');
    }
    if (playHasMajor && !fieldHasMajor) return YES;
    if (fieldHasMajor && !playHasMajor) return no('大札入りの同値には小札だけで返せません');
    return hasHarmony(cards, top) ? YES : no('同じ数字は調和のスートがあれば返せます');
}

// Five hand cards as a role: led, or laid on a weaker role.
export function checkRole(state, p, cards) {
    if (cards.length !== 5 || !ownCards(state, p, cards)) return no('5枚役は手札5枚で作ります');
    const role = evaluateRole(cards);
    if (!role) return no('5枚役になっていません');
    if (!state.field.kind) return { ok: true, role };
    if (state.field.kind !== 'role') return no('通常出しの場に手札だけの5枚役は重ねられません');
    const d = compareRoles(role, state.field.role);
    if (d > 0 || (d === 0 && hasHarmony(cards, fieldCards(state).slice(-5)))) return { ok: true, role };
    return no('場より強い役が必要です');
}

// Four hand cards joined to a single field card as a role.
export function checkCall(state, p, cards) {
    if (cards.length !== 4 || !ownCards(state, p, cards)) return no('コールは手札4枚で行います');
    if (state.field.kind !== 'normal' || state.field.count !== 1) return no('コールは1枚の場にだけできます');
    const base = fieldTop(state)[0];
    const role = evaluateRole([base, ...cards]);
    if (!role) return no('場札と合わせて5枚役になっていません');
    if (base.major && role.rank !== 5) return no('大札の場にコールできるのはザ・ワールドだけです');
    const hand = handOf(state, p);
    if ((role.rank === 1 || role.rank === 6) && hand.some((c) => numberKey(c) === numberKey(base))) {
        return no('場札と同じ数字を持っているとストレートのコールはできません');
    }
    if (role.rank === 2 || role.rank === 6) {
        if (suitsOf(base).some((suit) => hand.filter((c) => suitsOf(c).includes(suit)).length >= 5)) {
            return no('そのスートを5枚以上持っているとフラッシュのコールはできません');
        }
        if (cards.every((c) => c.num < base.num)) return no('場札が最強になるフラッシュのコールはできません');
    }
    return { ok: true, role };
}

function combinations(list, size) {
    const out = [];
    const walk = (start, picked) => {
        if (picked.length === size) { out.push(picked.slice()); return; }
        for (let i = start; i <= list.length - (size - picked.length); i += 1) {
            picked.push(list[i]);
            walk(i + 1, picked);
            picked.pop();
        }
    };
    walk(0, []);
    return out;
}

// Every play the player could make now.
export function listMoves(state, p) {
    if (state.phase !== 'play' || state.turn !== p) return [];
    const hand = handOf(state, p);
    const moves = [];
    const groups = new Map();
    for (const c of hand) groups.set(numberKey(c), [...(groups.get(numberKey(c)) || []), c]);
    for (const group of groups.values()) {
        for (let size = 1; size <= Math.min(3, group.length); size += 1) {
            for (const cards of combinations(group, size)) if (checkNormal(state, p, cards).ok) moves.push({ type: 'normal', cards });
        }
    }
    if (hand.length >= 5 && state.field.kind !== 'normal') {
        for (const cards of combinations(hand, 5)) {
            const res = checkRole(state, p, cards);
            if (res.ok) moves.push({ type: 'role', cards, role: res.role });
        }
    }
    if (hand.length >= 4 && state.field.kind === 'normal' && state.field.count === 1) {
        for (const cards of combinations(hand, 4)) {
            const res = checkCall(state, p, cards);
            if (res.ok) moves.push({ type: 'call', cards, role: res.role });
        }
    }
    return moves;
}

// What the player to move may do. A parent on an empty field never passes.
export function options(state, p) {
    const none = { canPlay: false, canPass: false, canDraw: false, mustCede: false };
    if (state.phase !== 'play' || state.turn !== p) return none;
    const canPlay = listMoves(state, p).length > 0;
    if (state.field.kind) return { ...none, canPlay, canPass: true };
    const canDraw = !state.drew && state.deck.length > 0 && handOf(state, p).length < HAND_LIMIT;
    return { ...none, canPlay, canDraw, mustCede: !canPlay && !canDraw };
}

const note = (state, event) => { state.events.push(event); };

// The role lying on top of the field has held: its player's han goes up.
function awardRoleHan(state) {
    if (state.field.kind !== 'role') return;
    const top = state.field.plays[state.field.plays.length - 1];
    const add = ROLE_HAN[state.field.role.rank] - (top.call ? CALL_HAN_PENALTY : 0);
    state.han[top.by] += add;
    note(state, { type: 'han', by: top.by, add, total: state.han[top.by], role: state.field.role, call: !!top.call });
}
const nextSeat = (state, seat) => (seat + 1) % state.players.length;

function startLead(state, p) {
    state.turn = p;
    state.drew = false;
    state.phase = 'play';
}

function finishClear(state) {
    const p = state.last;
    if (state.judgement) {
        state.judgement = false;
        const room = handOf(state, p).length < HAND_LIMIT;
        if (room && state.players.some((pl, i) => i !== p && pl.grave.length)) {
            state.phase = 'retrieve';
            state.turn = p;
            return;
        }
    }
    startLead(state, p);
}

function clearField(state, byPass) {
    awardRoleHan(state);
    for (const play of state.field.plays) {
        for (const c of play.cards) (c.major ? state.aside : state.players[play.by].grave).push(c);
    }
    const trash = byPass && state.trashBy === state.last && handOf(state, state.last).length > 1;
    state.field = { kind: null, count: 0, role: null, plays: [] };
    state.back = false;
    state.lock = null;
    state.cut = false;
    state.passed = [];
    state.trashBy = null;
    state.ceded = 0;
    note(state, { type: 'clear', by: state.last });
    if (trash) {
        state.phase = 'trash';
        state.turn = state.last;
        return;
    }
    finishClear(state);
}

function advance(state, from, skip) {
    let seat = from;
    for (let i = 0; i <= skip; i += 1) seat = nextSeat(state, seat);
    for (let i = 0; i < state.players.length && state.passed.includes(seat); i += 1) seat = nextSeat(state, seat);
    state.turn = seat;
}

// Number effects of a normal play. `laidOn` is true when the cards answered a field or were turned at the deal.
function applyNormalEffects(state, p, cards, prevTop, laidOn) {
    const key = numberKey(cards[0]);
    if (isMajor(cards[0], 21) && laidOn) { clearField(state, false); return; }
    if (key === 11) { state.back = !state.back; note(state, { type: 'back', on: state.back }); }
    if (isMajor(cards[0], 20)) { state.back = !state.back; state.judgement = true; note(state, { type: 'back', on: state.back }); }
    if (isMajor(cards[0], 14) && state.lock) { state.lock = null; note(state, { type: 'unlock' }); }
    if (prevTop && cards.length === 1 && (isMinor(cards[0], 13) || isMinor(cards[0], 14))
        && prevTop.length === 1 && suitsOf(prevTop[0]).includes(cards[0].suit) && !state.lock) {
        state.lock = cards[0].suit;
        note(state, { type: 'lock', suit: state.lock });
    }
    state.trashBy = cards.length === 1 && isMinor(cards[0], 12) ? p : null;
    if (key === 8) {
        if (cards.length >= 2) { clearField(state, false); return; }
        state.cut = true;
        note(state, { type: 'cut' });
    }
    const skip = cards.reduce((sum, c) => sum + (c.num === 5 ? (c.major ? 2 : 1) : 0), 0);
    if (skip) note(state, { type: 'skip', count: skip });
    advance(state, p, skip);
}

function takeFromHand(state, p, cards) {
    const ids = new Set(cards.map((c) => c.id));
    state.players[p].hand = handOf(state, p).filter((c) => !ids.has(c.id));
}

function resolveCards(state, p, ids) {
    const hand = handOf(state, p);
    const cards = ids.map((id) => hand.find((c) => c.id === id));
    return cards.every(Boolean) ? cards : null;
}

// Play the cards with the given ids. `type` is 'normal', 'role' or 'call'; without it the count decides.
export function play(state, p, ids, type) {
    if (state.phase !== 'play' || state.turn !== p) return no('今は出せません');
    const cards = resolveCards(state, p, ids);
    if (!cards) return no('手札にない札です');
    const kind = type || (cards.length === 5 ? 'role' : cards.length === 4 ? 'call' : 'normal');
    const res = kind === 'role' ? checkRole(state, p, cards) : kind === 'call' ? checkCall(state, p, cards) : checkNormal(state, p, cards);
    if (!res.ok) return res;
    const prevTop = state.field.kind ? fieldTop(state) : null;
    takeFromHand(state, p, cards);
    state.field.plays.push({ by: p, cards, call: kind === 'call' });
    state.last = p;
    state.passed = [];
    state.ceded = 0;
    state.lastPlay = { by: p, type: kind, role: res.role || null };
    note(state, { type: 'play', by: p, kind, cards, role: res.role || null });
    if (kind === 'normal') {
        state.field.kind = 'normal';
        state.field.count = cards.length;
    } else {
        state.field.kind = 'role';
        state.field.count = 5;
        state.field.role = res.role;
    }
    if (!handOf(state, p).length) {
        // Going out comes before any effect of the cards. A role that goes out counts as having held.
        awardRoleHan(state);
        state.phase = 'over';
        state.winner = p;
        note(state, { type: 'win', by: p });
        return YES;
    }
    if (kind === 'normal') {
        applyNormalEffects(state, p, cards, prevTop, !!prevTop);
        return YES;
    }
    if (kind === 'call') {
        state.cut = false;
        state.back = false;
        state.lock = null;
    }
    state.trashBy = null;
    advance(state, p, 0);
    return YES;
}

export function pass(state, p) {
    if (!options(state, p).canPass) return no('今はパスできません');
    state.passed.push(p);
    note(state, { type: 'pass', by: p });
    if (state.players.every((_, i) => i === state.last || state.passed.includes(i))) clearField(state, true);
    else advance(state, p, 0);
    return YES;
}

export function draw(state, p) {
    if (!options(state, p).canDraw) return no('今は引けません');
    handOf(state, p).push(state.deck.pop());
    state.drew = true;
    note(state, { type: 'draw', by: p });
    return YES;
}

// A parent who cannot open, even after drawing, hands the lead to the next seat.
export function cede(state, p) {
    if (!options(state, p).mustCede) return no('親を渡す場面ではありません');
    state.ceded += 1;
    note(state, { type: 'cede', by: p });
    if (state.ceded >= state.players.length) {
        state.phase = 'over';
        state.winner = null;
        note(state, { type: 'drawn' });
        return YES;
    }
    startLead(state, nextSeat(state, p));
    return YES;
}

// After a lone minor knight was passed round: remove one hand card from the game, or decline with null.
export function trash(state, p, id) {
    if (state.phase !== 'trash' || state.turn !== p) return no('今は除外できません');
    if (id) {
        const cards = resolveCards(state, p, [id]);
        if (!cards || handOf(state, p).length <= 1) return no('その札は除外できません');
        takeFromHand(state, p, cards);
        state.players[p].exiled.push(cards[0]);
        note(state, { type: 'trash', by: p });
    }
    finishClear(state);
    return YES;
}

// After Judgement: take one minor card from another player's graveyard, or decline with null.
export function retrieve(state, p, id) {
    if (state.phase !== 'retrieve' || state.turn !== p) return no('今は回収できません');
    if (id) {
        const owner = state.players.findIndex((pl, i) => i !== p && pl.grave.some((c) => c.id === id));
        if (owner < 0 || handOf(state, p).length >= HAND_LIMIT) return no('その札は回収できません');
        const grave = state.players[owner].grave;
        handOf(state, p).push(grave.splice(grave.findIndex((c) => c.id === id), 1)[0]);
        note(state, { type: 'retrieve', by: p, from: owner });
    }
    startLead(state, p);
    return YES;
}

// Deal eight cards each and turn the top of the deck as the dealer's first field card.
// `deck` (top of the deck last) fixes the order for tests.
export function createRound({ players = 4, dealer = 0, rng = Math.random, deck = null } = {}) {
    if (players !== 3 && players !== 4) throw new Error('players must be 3 or 4');
    const state = {
        players: Array.from({ length: players }, () => ({ hand: [], grave: [], exiled: [] })),
        deck: deck ? deck.slice() : shuffle(buildDeck(), rng),
        aside: [], dealer,
        field: { kind: null, count: 0, role: null, plays: [] },
        back: false, lock: null, cut: false, passed: [], trashBy: null, judgement: false,
        han: Array.from({ length: players }, () => 0),
        last: dealer, turn: dealer, drew: false, ceded: 0, phase: 'play', winner: null, lastPlay: null, events: []
    };
    for (let i = 0; i < HAND_LIMIT; i += 1) {
        for (let k = 0; k < players; k += 1) state.players[(dealer + k) % players].hand.push(state.deck.pop());
    }
    const first = state.deck.pop();
    state.field = { kind: 'normal', count: 1, role: null, plays: [{ by: dealer, cards: [first], start: true }] };
    note(state, { type: 'start', by: dealer, cards: [first] });
    applyNormalEffects(state, dealer, [first], null, true);
    // The turned card is excluded from the knight's trash.
    state.trashBy = null;
    return state;
}
