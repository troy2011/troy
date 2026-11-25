// Tarot Kingdom, table version: the card rules of one round.
// Table rules: public/tarot-kingdom-table-rules.html.
// Pure logic: no DOM, no storage, no network. Chips are handled in match.js.

export const SUITS = ['wand', 'sword', 'cup', 'coin'];
export const HAND_LIMIT = 8;
// Same-rank minors can answer only across the two reciprocal element pairs.
export const EQUAL_NUMBER_COUNTER = Object.freeze({ wand: 'cup', cup: 'wand', sword: 'coin', coin: 'sword' });
const MAJOR_SUITS = { 1: SUITS, 16: ['sword'], 17: ['cup'], 18: ['coin'], 19: ['wand'] };
export const aceCounterMajor = suit => [16, 17, 18, 19].find(num => MAJOR_SUITS[num].includes(suit));
const ACE_SUIT_NAME = { sword: 'ソード', cup: 'カップ', coin: 'ペンタクル', wand: 'ワンド' };
const OPENING_BARRED = new Set([16, 17, 18, 19, 21]);
export const LAST_CARD_HAN = 1;
export const MAJOR_CLEAR_HAN = 1;
export const DEVIL_CLEAR_HAN = MAJOR_CLEAR_HAN; // Compatibility with saved pre-High rounds.
export const HIGH_ROLE_HAN = Object.freeze({ straight: 3, flush: 3, fullHouse: 4, quad: 10, elemental: 10, highElemental: 12, five: 15, world: 15 });
const HIGH_ROLE_NAMES = Object.freeze({ straight: 'ハイストレート', flush: 'ハイフラッシュ', fullHouse: 'ハイフルハウス', quad: 'エレメンタル', elemental: 'エレメンタル', highElemental: 'ハイエレメンタル', five: 'ハイファイブカード', world: 'ハイワールド' });
// Han earned when a five-card role clears the field (or goes out), by roleRank(). A role made by a call earns one less.
export const ROLE_HAN = [0, 2, 2, 3, 4, 5, 5, 10, 10, 12];
export const CALL_HAN_PENALTY = 1;
export const ROLE_NAMES = ['', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ザ・ワールド', 'ストレートフラッシュ', 'ファイブカード', 'ロイヤルストレートフラッシュ', 'ハイエレメンタル'];

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
export const isCourtCard = card => !card.major && card.num >= 11 && card.num <= 14;
export const lockSuits = lock => Array.isArray(lock) ? lock : lock ? [lock] : [];
export const exchangeCandidates = (state, p) => handOf(state, p);
export const ferryCandidates = (state,p) => handOf(state,p).filter(card => card.major && card.num >= 0 && card.num <= 12
    && (!state.lock || suitsOf(card).some(suit=>lockSuits(state.lock).includes(suit))));
export function trashCandidates(state, p) {
    return state.trashKind === 'death' ? handOf(state, p).filter(isCourtCard) : handOf(state, p);
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
    if (cards.length !== 5 || new Set(cards.map(card => card.id)).size !== 5) return null;
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
    const aces = cards.filter(card => isMinor(card, 15)).length;
    if (aces === 4) {
        const fifth = cards.find(card => !isMinor(card, 15));
        if (isMajor(fifth, 15)) return { rank: 7, tb: [15], high: 'five' };
        return { rank: 4, tb: [15, fifth.num], high: 'elemental' };
    }
    if (allMajor && [16, 17, 18, 19].every(num => desc.includes(num))) {
        return desc[0] === 21 ? { rank: 5, tb: desc, high: 'world' } : { rank: 9, tb: desc, high: 'highElemental' };
    }
    const suitFlush = !fool && SUITS.some((suit) => cards.every((c) => suitsOf(c).includes(suit)));

    if (groups.length === 1 && rest.length >= 4) return { rank: 7, tb: [groups[0].num] };
    if (straightTop && suitFlush) return { rank: 6, tb: [straightTop] };
    if (allMajor && cards.some((c) => isMajor(c, 21))) return { rank: 5, tb: desc };
    if (groups[0].n + (fool ? 1 : 0) >= 4) return { rank: 4, tb: [groups[0].num, groups[1] ? groups[1].num : 0] };
    if (groups.length === 2 && (fool ? groups[0].n === 2 : groups[0].n === 3)) {
        const [a, b] = fool ? [...groups].sort((x, y) => y.num - x.num) : groups;
        return { rank: 3, tb: [a.num, b.num], ...(aces === 3 ? { high: 'fullHouse' } : {}) };
    }
    if (suitFlush || allMajor) return { rank: 2, tb: desc,
        ...(suitFlush && cards.filter(card => card.major).length === 1
            && cards.some(card => card.major && card.num >= 16 && card.num <= 19) ? { high: 'flush' } : {}) };
    if (straightTop) return { rank: 1, tb: [straightTop], ...(straightTop >= 15 ? { high: 'straight' } : {}) };
    return null;
}

// Keep the stored ranks unchanged: a 15-high straight flush is 11-12-13-14-A.
// Its derived role ID also recognizes games saved before the royal role existed.
export function roleRank(role) {
    return role.rank === 6 && role.tb[0] === 15 ? 8 : role.rank;
}
export const roleName = role => HIGH_ROLE_NAMES[role.high] || ROLE_NAMES[roleRank(role)];
export const roleHan = role => HIGH_ROLE_HAN[role.high] ?? ROLE_HAN[roleRank(role)];
export function roleStrength(role) {
    const rank = roleRank(role);
    if (role.high === 'elemental' || role.high === 'quad') return 4.5;
    if (rank === 9) return 7.5;
    if (rank === 7) return 6;
    if (rank === 6) return 7;
    if (rank === 8) return 8;
    return rank;
}
export function compareRoles(a, b) {
    return roleStrength(a) - roleStrength(b) || compareLists(a.tb, b.tb);
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

function isLastOpeningCard(state, p, cards) {
    return cards.length === 1 && handOf(state, p).length === 1
        && cards[0].major && OPENING_BARRED.has(cards[0].num);
}

// Before going out this is a private preview; afterwards use the recorded bonus.
export function lastCardHan(state, p) {
    if (state.phase === 'over') return state.winner === p ? (state.lastCardHan || 0) : 0;
    const hand = handOf(state, p), card = hand[0];
    const eligible = hand.length === 1 && card.major;
    return eligible && checkNormal(state, p, hand).ok ? LAST_CARD_HAN : 0;
}

// One to three cards of the same number, led or laid on a field of the same size.
export function checkNormal(state, p, cards) {
    if (!cards.length || cards.length > 3) return no('通常出しは同じ数字を1〜3枚です');
    if (!ownCards(state, p, cards)) return no('手札にない札です');
    if (new Set(cards.map(numberKey)).size !== 1) return no('同じ数字の札をそろえてください');
    const special = cards.find((c) => c.major && OPENING_BARRED.has(c.num));
    if (!state.field.kind) {
        if (special && !isLastOpeningCard(state, p, cards)) return no('この大札は初手に出せません');
        return YES;
    }
    if (state.field.kind === 'role') return no('5枚役の場には5枚役で返します');
    if (cards.length !== state.field.count) return no(`場と同じ${state.field.count}枚で出してください`);
    const top = fieldTop(state);
    const card = cards[0];
    const playHasMajor = cards.some((c) => c.major);
    const fieldHasMajor = top.some((c) => c.major);
    const world = isMajor(card, 21);
    const loneAce = cards.length === 1 && isMinor(top[0], 15);
    const devilAgainstAce = loneAce && isMajor(card, 15);
    if (state.cut && !(world && isMajor(top[0], 8))) return no('8のあとはコールかパスだけです');
    if (playHasMajor && top.every(c => isMinor(c, 15))
        && !devilAgainstAce && !(loneAce && card.num === aceCounterMajor(top[0].suit))) {
        if (!loneAce) return no('小札Aの複数枚には大札を混ぜて返せません');
        const counter = aceCounterMajor(top[0].suit);
        return no(state.back
            ? '11バック中は、この大札で小札Aに返せません。'
            : `この大札では小札Aに返せません（${ACE_SUIT_NAME[top[0].suit]}は大札${counter}）。`);
    }
    if (state.lock && !cards.every((c) => suitsOf(c).some(suit => lockSuits(state.lock).includes(suit)) || isMajor(c, 14))) return no('ロック中はそのスートで返します');
    if (world) {
        if (!top[0].major) return no('世界は大札1枚の場に出します');
        if (state.back) return no('11バック中は世界を出せません');
        return YES;
    }
    // Flip only the Ace–Devil matchup; neither card's number changes.
    if (devilAgainstAce) return state.back ? YES : no('通常時は悪魔より小札Aが強いです');
    if (isMinor(card, 15) && isMajor(top[0], 15)) return state.back ? no('11バック中は小札Aより悪魔が強いです') : YES;
    if (special && !isMajor(card, 15) && !suitsOf(top[0]).includes(MAJOR_SUITS[card.num][0])) return no('この大札は対応するスートの1枚場に出します');
    const mine = card.num;
    const theirs = top[0].num;
    if (mine !== theirs) {
        if (state.back ? mine < theirs : mine > theirs) return YES;
        return no(state.back ? '11バック中は弱い数字で返します' : 'より強い数字で返します');
    }
    if (playHasMajor) return YES;
    if (fieldHasMajor) return no('大札入りの同値には小札だけで返せません');
    const counters = new Set(top.map(c => EQUAL_NUMBER_COUNTER[c.suit]));
    return cards.some(c => counters.has(c.suit)) ? YES : no('同じ数字は、反発するスートか大札で返せます');
}

// Five hand cards as a role: led, or laid on a weaker role.
export function checkRole(state, p, cards) {
    if (cards.length !== 5 || !ownCards(state, p, cards)) return no('5枚役は手札5枚で作ります');
    const role = evaluateRole(cards);
    if (!role) return no('5枚役になっていません');
    if (!state.field.kind) return { ok: true, role };
    if (state.field.kind !== 'role') return no('通常出しの場に手札だけの5枚役は重ねられません');
    const d = compareRoles(role, state.field.role);
    if (d > 0) return { ok: true, role };
    return no('場より強い役が必要です');
}

// Four hand cards joined to a single field card as a role.
export function checkCall(state, p, cards) {
    if (cards.length !== 4 || !ownCards(state, p, cards)) return no('コールは手札4枚で行います');
    if (state.field.kind !== 'normal' || state.field.count !== 1) return no('コールは1枚の場にだけできます');
    const base = fieldTop(state)[0];
    const role = evaluateRole([base, ...cards]);
    if (!role) return no('場札と合わせて5枚役になっていません');
    if (base.major && role.rank !== 5 && role.rank !== 9) return no('大札の場はザ・ワールド系かハイエレメンタルだけコールできます');
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
    const add = roleHan(state.field.role) - (top.call ? CALL_HAN_PENALTY : 0);
    state.han[top.by] += add;
    note(state, { type: 'han', by: top.by, add, total: state.han[top.by], role: state.field.role, call: !!top.call });
}
const nextSeat = (state, seat) => (seat + (state.direction === -1 ? -1 : 1) + state.players.length) % state.players.length;

function startLead(state, p) {
    state.turn = p;
    state.drew = false;
    state.phase = 'play';
    delete state.effectTriggerCard;
}

function finishClear(state) {
    const p = state.last;
    if (state.judgement) {
        state.judgement = false;
        const trigger = state.judgementTriggerCard;
        delete state.judgementTriggerCard;
        const room = handOf(state, p).length < HAND_LIMIT;
        if (room && state.players.some((pl, i) => i !== p && pl.grave.some(card => !card.major))) {
            state.phase = 'retrieve';
            state.turn = p;
            state.effectTriggerCard = trigger;
            return;
        }
    }
    startLead(state, p);
}

function awardMajorClearHan(state) {
    const top = state.field.plays.at(-1), card = top?.cards[0];
    if (state.field.kind !== 'normal' || top?.start || top?.by !== state.last || top.cards.length !== 1
        || !card.major || card.num < 16) return;
    const p = state.last;
    state.han[p] += MAJOR_CLEAR_HAN;
    // Seed from old Devil bonuses, so a live saved round retains an accurate breakdown.
    state.majorClearHan ??= state.devilHan?.slice() || state.players.map(() => 0);
    state.majorClearHan[p] += MAJOR_CLEAR_HAN;
    note(state, { type: 'majorClear', by: p, num: card.num, add: MAJOR_CLEAR_HAN, total: state.han[p] });
}

// The recipient is fixed when the table clears, before the player's choice.
function giftRecipient(state, from) {
    let recipient = null, fewest = Infinity;
    for (let seat = nextSeat(state, from); seat !== from; seat = nextSeat(state, seat)) {
        const count = handOf(state, seat).length;
        if (count > 0 && count < fewest && state.winner !== seat) {
            recipient = seat;
            fewest = count;
        }
    }
    return recipient;
}

function clearField(state, byPass) {
    awardRoleHan(state);
    awardMajorClearHan(state);
    const top = state.field.plays.at(-1);
    const ownNormal = byPass && state.field.kind === 'normal' && !top?.start && top?.by === state.last;
    const death = ownNormal && top.cards.length === 1 && isMajor(top.cards[0], 13);
    const devil = ownNormal && top.cards.length === 1 && isMajor(top.cards[0], 15) ? top.cards[0] : null;
    if (death) discardStrongestCourts(state, state.last);
    for (const play of state.field.plays) {
        for (const c of play.cards) (c.major ? state.aside : state.players[play.by].grave).push(c);
    }
    const trash = byPass && state.trashBy === state.last && handOf(state, state.last).length > 0;
    const hangedMan = trash && top?.cards.some(card => isMajor(card, 12));
    state.giveTo = hangedMan ? giftRecipient(state, state.last) : null;
    state.field = { kind: null, count: 0, role: null, plays: [] };
    state.back = false;
    state.lock = null;
    state.cut = false;
    state.passed = [];
    state.trashBy = null;
    state.trashKind = null;
    state.ceded = 0;
    note(state, { type: 'clear', by: state.last });
    if (state.giveTo !== null) {
        state.effectTriggerCard = top.cards.find(card => isMajor(card, 12));
        state.phase = 'give';
        state.turn = state.last;
        return;
    }
    if (trash && !hangedMan) {
        state.effectTriggerCard = top?.cards.find(card => isMinor(card, 12));
        state.trashKind = 'knight';
        state.phase = 'trash';
        state.turn = state.last;
        return;
    }
    if (devil && beginDevilSwap(state, state.last, devil)) return;
    finishClear(state);
}

function discardStrongestCourts(state, actor) {
    for (let seat = nextSeat(state,actor); seat !== actor; seat = nextSeat(state,seat)) {
        const hand = handOf(state,seat);
        if (hand.length <= 1) continue;
        let strongest = null;
        for (const card of hand)
            if (!card.major && card.num >= 11 && card.num <= 14
                && (!strongest || (state.back ? card.num < strongest.num : card.num > strongest.num))) strongest = card;
        if (!strongest) continue;
        takeFromHand(state,seat,[strongest]);
        state.players[seat].grave.push(strongest);
        note(state,{type:'deathDecree',by:actor,from:seat,card:strongest});
    }
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
    if (cards.some(card => isMajor(card, 11)) && state.direction !== -1) {
        state.direction = -1;
        note(state, { type: 'reverse', by: p, num: 11 });
    }
    if (key === 11) { state.back = !state.back; note(state, { type: 'back', on: state.back }); }
    if (isMajor(cards[0], 20)) { state.back = !state.back; state.judgement = true; state.judgementTriggerCard = cards[0]; note(state, { type: 'back', on: state.back }); }
    if (cards.some(card => isMajor(card, 14))
        && (state.lock || state.back || state.direction === -1 || state.judgement)) {
        state.lock = null;
        state.back = false;
        state.direction = 1;
        state.judgement = false;
        delete state.judgementTriggerCard;
        note(state, { type: 'reset', by: p });
    }
    if (prevTop && cards.length === 1 && (isMinor(cards[0], 13) || isMinor(cards[0], 14))
        && prevTop.length === 1 && suitsOf(prevTop[0]).includes(cards[0].suit) && !state.lock) {
        state.lock = cards[0].suit;
        note(state, { type: 'lock', suit: state.lock });
    }
    state.trashBy = cards.some(card => card.num === 12) ? p : null;
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
    return commitPlay(state,p,cards,kind,res);
}

// Resolve a pending exchange without revealing anyone's selection to the table.
export function deathSwapCanChoose(state, p) {
    if (state.phase !== 'deathSwap') return false;
    const pending = state.deathSwap;
    return pending ? pending.seats.includes(p) && !Object.hasOwn(pending.choices,p) : p === 0 && state.deathSwapCanChoose === true;
}

export function deathSwap(state, p, id) {
    const pending = state.deathSwap;
    if (!pending || !deathSwapCanChoose(state,p))
        return no('今は交換する札を選べません');
    const selected = id == null ? null : typeof id === 'string' && resolveCards(state, p, [id]);
    if (selected === false || (id != null && !selected)) return no('手札から交換する札を1枚選んでください');
    const choices = {...pending.choices, [p]: selected ? selected[0].id : null};
    const outstanding = pending.seats.filter(seat => !Object.hasOwn(choices,seat));
    if (outstanding.length) {
        pending.choices = choices;
        state.turn = outstanding[0]; // simulation order only, not a constraint on who may choose
        return YES;
    }
    const participants = pending.seats.flatMap(seat => choices[seat] == null ? [] : [{seat, card: handOf(state, seat).find(c => c.id === choices[seat])}]);
    if (participants.some(({card}) => !card)) return no('交換する札が手札にありません');
    if (participants.length > 1) {
        for (const {seat,card} of participants) takeFromHand(state, seat, [card]);
        participants.forEach(({seat,card},i) => {
            const to = participants[(i + 1) % participants.length].seat;
            handOf(state, to).push(card);
            // Only the public route, never the card identity, is needed for the animation.
            if (pending.mode === 'devil') note(state, {type:'devilCardTransfer',by:pending.seats[0],from:seat,to});
        });
        (state.privateGifts ??= []).push(...participants.map(({card}) => card.id));
    }
    const actor = pending.seats[0];
    const devil = pending.mode === 'devil';
    if (devil) {
        for (const seat of pending.seats) {
            if (seat === actor || choices[seat] !== null || state.han[seat] <= 0) continue;
            state.devilTransferHan ??= state.players.map(() => 0);
            state.han[seat]--;
            state.han[actor]++;
            state.devilTransferHan[seat]--;
            state.devilTransferHan[actor]++;
            note(state,{type:'devilHanTransfer',by:actor,from:seat});
        }
    }
    delete state.deathSwap;
    delete state.effectTriggerCard;
    state.phase = 'play';
    note(state, {type:'deathSwapComplete',by:actor,devil});
    if (devil) finishClear(state);
    else advance(state, actor, 0);
    return YES;
}

function beginDevilSwap(state, p, card) {
    const seats = [p];
    for (let seat = nextSeat(state,p); seat !== p; seat = nextSeat(state,seat))
        if (handOf(state,seat).length && state.winner !== seat) seats.push(seat);
    if (seats.length < 2) return false;
    state.trashBy = null;
    state.trashKind = null;
    state.deathSwap = { seats, choices: {}, mode: 'devil' };
    state.effectTriggerCard = card;
    state.turn = p;
    state.phase = 'deathSwap';
    note(state, {type:'deathSwapStart',by:p,devil:true});
    return true;
}

// Resolve only a legacy ferry choice already pending in a saved round.
export function ferry(state,p,id) {
    if(state.phase!=='ferry'||state.turn!==p)return no('今は追加で出せません');
    if(id==null){state.phase='play';advance(state,p,0);return YES;}
    const card=ferryCandidates(state,p).find(candidate=>candidate.id===id);
    if(!card)return no('手札の大札0〜12を1枚選んでください');
    state.phase='play';
    return commitPlay(state,p,[card],'normal',YES,true);
}

function commitPlay(state,p,cards,kind,res,ferried=false) {
    // Record the bonus while the final card and its legal target still exist.
    const finishingBonus = kind === 'normal' ? (ferried && handOf(state,p).length===1 ? LAST_CARD_HAN : lastCardHan(state,p)) : 0;
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
        state.lastCardHan = finishingBonus;
        note(state, { type: 'win', by: p, lastCardHan: state.lastCardHan });
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

// Legacy Death choices remain resolvable after deploying the new suit-lock effect.
export function trash(state, p, id) {
    if (state.phase !== 'trash' || state.turn !== p) return no('今は除外できません');
    const death = state.trashKind === 'death';
    if (id) {
        const cards = resolveCards(state, p, [id]);
        if (!cards) return no('その札は除外できません');
        if (death && !isCourtCard(cards[0])) return no('死神で除外できるのは小札11〜14です');
        takeFromHand(state, p, cards);
        state.players[p].exiled.push(cards[0]);
        note(state, { type: 'trash', by: p });
        if (!handOf(state, p).length) {
            state.phase = 'over'; state.winner = p; state.lastCardHan = 0; state.judgement = false; state.trashKind = null;
            delete state.effectTriggerCard; delete state.judgementTriggerCard;
            // Cards remain authoritative in exiled; lastPlay retains the public winning-card proof.
            state.lastPlay = { by: p, type: 'trash', role: null, cards };
            note(state, { type: 'win', by: p, lastCardHan: 0, method: 'trash' });
            return YES;
        }
    }
    state.trashKind = null;
    if (death) { delete state.effectTriggerCard; state.phase = 'play'; advance(state, p, 0); }
    else finishClear(state);
    return YES;
}

// Hanged Man passes one owned card to the recipient fixed at the clear.
export function give(state, p, id) {
    if (state.phase !== 'give' || state.turn !== p) return no('今は札を渡せません');
    const to = state.giveTo;
    if (!Number.isInteger(to) || to === p || !state.players[to] || !handOf(state, to).length)
        return no('札を渡せる相手がいません');
    if (id !== null && id !== undefined) {
        const cards = typeof id === 'string' && resolveCards(state, p, [id]);
        if (!cards) return no('手札から渡す札を1枚選んでください');
        takeFromHand(state, p, cards);
        handOf(state, to).push(cards[0]);
        (state.privateGifts ??= []).push(cards[0].id);
        // Seat indices only: the face is available through the recipient's private hand.
        note(state, { type: 'give', by: p, to });
        if (!handOf(state, p).length) {
            state.phase = 'over'; state.winner = p; state.lastCardHan = 0; state.judgement = false; state.giveTo = null;
            delete state.effectTriggerCard; delete state.judgementTriggerCard;
            state.lastPlay = { by: p, type: 'give', role: null };
            note(state, { type: 'win', by: p, lastCardHan: 0, method: 'give' });
            return YES;
        }
    }
    state.giveTo = null;
    finishClear(state);
    return YES;
}

// Devil swaps one chosen card for an unknown deck card. Validate everything before moving either card.
export function exchange(state, p, id) {
    if (state.phase !== 'exchange' || state.turn !== p) return no('今は交換できません');
    if (id !== null && id !== undefined) {
        const cards = resolveCards(state, p, [id]);
        if (!cards) return no('その札は交換できません');
        if (!state.deck.length) return no('山札がありません');
        takeFromHand(state, p, cards);
        state.players[p].grave.push(cards[0]);
        handOf(state, p).push(state.deck.pop());
        note(state, { type: 'exchange', by: p, cards });
    }
    finishClear(state);
    return YES;
}

// After Judgement: take one minor card from another player's graveyard, or decline with null.
export function retrieve(state, p, id) {
    if (state.phase !== 'retrieve' || state.turn !== p) return no('今は回収できません');
    if (id) {
        const owner = state.players.findIndex((pl, i) => i !== p && pl.grave.some((c) => c.id === id && !c.major));
        if (owner < 0 || handOf(state, p).length >= HAND_LIMIT) return no('その札は回収できません');
        const grave = state.players[owner].grave;
        handOf(state, p).push(grave.splice(grave.findIndex((c) => c.id === id), 1)[0]);
        note(state, { type: 'retrieve', by: p, from: owner });
    }
    startLead(state, p);
    return YES;
}

// Only the original eight cards can qualify. Ace keeps its separate number key.
export function openingHandParity(hand) {
    if (hand.length !== HAND_LIMIT || new Set(hand.map(numberKey)).size !== HAND_LIMIT) return null;
    const parity = hand[0].num % 2;
    return hand.every(card => card.num % 2 === parity) ? (parity === 0 ? 'even' : 'odd') : null;
}

// Deal eight cards each, check opening wins, then turn the dealer's first field card.
// `deck` (top of the deck last) fixes the order for tests.
export function createRound({ players = 4, dealer = 0, rng = Math.random, deck = null } = {}) {
    if (players !== 3 && players !== 4) throw new Error('players must be 3 or 4');
    const state = {
        players: Array.from({ length: players }, () => ({ hand: [], grave: [], exiled: [] })),
        deck: deck ? deck.slice() : shuffle(buildDeck(), rng),
        aside: [], dealer,
        field: { kind: null, count: 0, role: null, plays: [] },
        back: false, lock: null, cut: false, direction: 1, passed: [], trashBy: null, trashKind: null, giveTo: null, judgement: false,
        han: Array.from({ length: players }, () => 0), majorClearHan: Array.from({ length: players }, () => 0), devilHan: Array.from({ length: players }, () => 0), lastCardHan: 0,
        last: dealer, turn: dealer, drew: false, ceded: 0, phase: 'play', winner: null, openingWin: null, lastPlay: null, events: []
    };
    for (let i = 0; i < HAND_LIMIT; i += 1) {
        for (let k = 0; k < players; k += 1) state.players[(dealer + k) % players].hand.push(state.deck.pop());
    }
    // Resolve simultaneous qualifying hands in dealing order, before any field effect.
    for (let offset = 0; offset < players; offset += 1) {
        const seat = (dealer + offset) % players;
        const parity = openingHandParity(handOf(state, seat));
        if (!parity) continue;
        state.phase = 'over'; state.winner = seat; state.turn = seat; state.last = seat; state.openingWin = parity;
        note(state, { type: 'deal', by: dealer });
        note(state, { type: 'win', by: seat, lastCardHan: 0, openingWin: parity });
        return state;
    }
    const first = state.deck.pop();
    state.field = { kind: 'normal', count: 1, role: null, plays: [{ by: dealer, cards: [first], start: true }] };
    note(state, { type: 'start', by: dealer, cards: [first] });
    applyNormalEffects(state, dealer, [first], null, true);
    // The turned card is excluded from the knight's trash.
    state.trashBy = null;
    return state;
}
