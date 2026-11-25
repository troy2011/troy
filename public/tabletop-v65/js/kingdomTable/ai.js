// Tarot Kingdom, table version: a plain computer player. It only uses what a player at the table can see:
// its own hand, the field and the public state.
import { listMoves, options, numberKey, evaluateRole, suitsOf, roleStrength, trashCandidates, exchangeCandidates, ferryCandidates } from './rules.js?v=suit-opposition-v1-named-han-v3';
import { selectedCardEffect } from './selectedCardEffect.js?v=suit-opposition-v1-named-han-v3';
import { cpuLevel } from './rating.js';

export const CPU_TURN_MS = 500;
export const CPU_PASS_MS = 250;
export const CPU_OPENING_MS = 1000;
const PLAYER_ACTIONS = new Set(['play', 'pass', 'draw', 'cede']);
export function isCpuOpening(round) {
    return !!round?.events.some(event => event.type === 'start') &&
        !round.events.some(event => PLAYER_ACTIONS.has(event.type));
}
export function cpuActionDelay(action, round, seat, random = Math.random) {
    const between = (min, max) => Math.round(min + (max - min) * random());
    if (isCpuOpening(round)) return CPU_OPENING_MS;
    if (action.type === 'pass') return between(180, 340);
    if (action.type === 'play' && action.kind === 'call') {
        // Often no extra pause; the longer pauses vary, so they don't announce a call.
        return random() < 0.45 ? between(280, 520) : between(650, 1750);
    }
    if (round && (action.type === 'ferry' && action.id || action.type === 'play' && action.kind === 'normal')) {
        const ids = action.type === 'ferry' ? [action.id] : action.ids;
        const cards = ids.map(id => round.players[seat].hand.find(card => card.id === id)).filter(Boolean);
        if (selectedCardEffect(round, seat, cards, { wand: 'wand', sword: 'sword', cup: 'cup', coin: 'coin' },
                { ferried: action.type === 'ferry' })) return between(360, 1600);
    }
    return between(360, 820);
}

const BARRED = new Set([15, 16, 17, 18, 19, 21]);
const strength = (state, card) => (state.back ? 21 - card.num : card.num);

function groupSize(hand, card) {
    return hand.filter((c) => numberKey(c) === numberKey(card)).length;
}

// Lower is better: shed many cards, keep strong cards and matched sets for later.
function cost(state, hand, move) {
    if (move.cards.length === hand.length) return -1000;
    if (move.type !== 'normal') return -40 + roleStrength(move.role) * 2;
    const card = move.cards[0];
    const broken = groupSize(hand, card) - move.cards.length;
    const major = move.cards.some((c) => c.major) ? 3 : 0;
    return strength(state, card) + major + broken * 6 - move.cards.length * 4;
}

function chooseStandardAction(state, p) {
    const hand = state.players[p].hand;
    if (state.phase === 'trash') {
        const candidates = trashCandidates(state, p);
        const awkward = candidates.find((c) => c.major && BARRED.has(c.num));
        const weakest = [...candidates].sort((a, b) => a.num - b.num)[0];
        return { type: 'trash', id: (awkward || weakest)?.id ?? null };
    }
    // Taking a card back makes the hand longer, so the computer leaves the graveyards alone.
    if (state.phase === 'retrieve') return { type: 'retrieve', id: null };
    const opts = options(state, p);
    if (opts.mustCede) return { type: 'cede' };
    const moves = listMoves(state, p);
    if (!moves.length) return opts.canDraw ? { type: 'draw' } : { type: 'pass' };
    const best = moves.reduce((a, b) => (cost(state, hand, b) < cost(state, hand, a) ? b : a));
    // Hold a top card back while the hand is still long and passing is allowed.
    if (opts.canPass && best.type === 'normal' && hand.length >= 5 && best.cards.length < hand.length
        && strength(state, best.cards[0]) >= 15) return { type: 'pass' };
    return { type: 'play', ids: best.cards.map((c) => c.id), kind: best.type };
}

const asPlay = move => ({ type: 'play', ids: move.cards.map(card => card.id), kind: move.type });

// Estimate how many future leads are needed, preserving pairs and five-card roles.
// At most eight cards means this small subset search stays bounded.
function handPlan(hand) {
    const full = (1 << hand.length) - 1, valid = [];
    for (let mask = 1; mask <= full; mask += 1) {
        const group = hand.filter((_, index) => mask & (1 << index));
        if ((group.length <= 3 && new Set(group.map(numberKey)).size === 1)
            || (group.length === 5 && evaluateRole(group))) valid.push(mask);
    }
    const memo = new Map([[0, 0]]);
    function leads(mask) {
        if (memo.has(mask)) return memo.get(mask);
        const first = mask & -mask;
        let best = hand.length;
        for (const group of valid) {
            if ((group & first) && (mask & group) === group) best = Math.min(best, 1 + leads(mask ^ group));
        }
        memo.set(mask, best);
        return best;
    }
    return remaining => leads(hand.reduce((mask, card, index) => remaining.has(card.id) ? mask | (1 << index) : mask, 0));
}

function plannedCost(state, p, move, leads) {
    const played = new Set(move.cards.map(card => card.id));
    const rest = state.players[p].hand.filter(card => !played.has(card.id));
    if (!rest.length) return -10000;
    let score = leads(new Set(rest.map(card => card.id))) * 100 + rest.length * 12;
    const awkward = rest.filter(card => card.major && BARRED.has(card.num)).length;
    if (rest.length > 1) score += awkward * 14;
    if (move.type !== 'normal') return score - roleStrength(move.role) * 2;
    const card = move.cards[0];
    const threat = state.players.some((player, seat) => seat !== p && player.hand.length <= 2);
    const power = strength(state, card);
    // With an opponent close to going out, spend control cards rather than saving them.
    score += threat ? -power * 0.7 : power * 0.25;
    const canLead = rest.length === 1 || rest.some(card => !card.major || !BARRED.has(card.num));
    if (canLead && (card.num === 8 || (card.major && card.num === 21))) score -= 24;
    if (card.num === 5) score -= threat ? 12 : 5;
    if (card.num === 11 || (card.major && card.num === 20)) {
        const average = rest.reduce((sum, card) => sum + card.num, 0) / rest.length;
        score += state.back ? (9 - average) * 0.8 : (average - 9) * 0.8;
    }
    return score;
}

export function chooseAction(state, p, { rating, random = Math.random } = {}) {
    if(state.phase==='ferry'){
        const next=ferryCandidates(state,p).sort((a,b)=>a.num-b.num)[0];
        return {type:'ferry',id:next?.id??null};
    }
    const hand = state.players[p].hand;
    if (state.phase === 'exchange') {
        const next = { ...state, phase: 'play' };
        if (!state.deck.length || listMoves(next, p).some(move => move.cards.length === hand.length)) return { type: 'exchange', id: null };
        const plans = handPlan(hand), before = plans(new Set(hand.map(card => card.id)));
        // Keep completed sets/roles. The deck order and other hands are never inspected.
        const loose = exchangeCandidates(state, p).filter(card => plans(new Set(hand.filter(other => other.id !== card.id).map(other => other.id))) < before);
        const best = loose.sort((a, b) => Number(b.major && BARRED.has(b.num)) - Number(a.major && BARRED.has(a.num)) || a.num - b.num)[0];
        return { type: 'exchange', id: best?.id ?? null };
    }
    if (state.phase === 'give' || state.phase === 'deathSwap') {
        const plans = handPlan(hand);
        const score = card => plans(new Set(hand.filter(other => other.id !== card.id).map(other => other.id)))
            + strength(state, card) / 100;
        const card = hand.reduce((best, next) => !best || score(next) < score(best) ? next : best, null);
        return { type: state.phase, id: card?.id ?? null };
    }
    const candidates = state.phase === 'trash' ? trashCandidates(state, p) : [];
    if (state.phase === 'trash' && !candidates.length) return { type: 'trash', id: null };
    // Exile a final minor now. A final major can instead be played on the empty field for kirifuda.
    if (state.phase === 'trash' && hand.length === 1) return { type: 'trash', id: hand[0].major ? null : hand[0].id };
    // A knight clear keeps the lead; Death courts may also leave a useful final major.
    if (state.phase === 'trash' && hand.length === 2 && hand.some(card => card.major)) {
        const minor = candidates.find(card => !card.major);
        if (minor) return { type: 'trash', id: minor.id };
    }
    if (rating === undefined) return chooseStandardAction(state, p);
    const profile = cpuLevel(rating);
    const level = profile.blend && random() < profile.blend ? profile.upper : profile.lower;
    if (state.phase === 'trash') {
        if (level < 2) return chooseStandardAction(state, p);
        const plans = handPlan(hand);
        const best = candidates.reduce((a, b) => {
            const score = card => plans(new Set(hand.filter(other => other.id !== card.id).map(other => other.id)))
                + (card.major && BARRED.has(card.num) ? -0.2 : 0);
            return score(b) < score(a) ? b : a;
        });
        if (state.trashKind === 'death') {
            const before = plans(new Set(hand.map(card => card.id)));
            const after = plans(new Set(hand.filter(card => card.id !== best.id).map(card => card.id)));
            if (after > before) return { type: 'trash', id: null };
        }
        return { type: 'trash', id: best.id };
    }
    if (state.phase === 'retrieve') {
        if (level < 2) return { type: 'retrieve', id: null };
        // Declining gives this player the empty-field lead, so do not miss an immediate finish.
        const nextPlay = { ...state, phase: 'play' };
        if (listMoves(nextPlay, p).some(move => move.cards.length === hand.length)) return { type: 'retrieve', id: null };
        const available = state.players.flatMap((player, seat) => seat === p ? [] : player.grave.filter(card => !card.major));
        const useful = available.filter(card => hand.some(held => numberKey(held) === numberKey(card)
            || (Math.abs(held.num - card.num) <= 2 && suitsOf(held).some(suit => suitsOf(card).includes(suit)))));
        if (!useful.length) return { type: 'retrieve', id: null };
        const best = useful.sort((a, b) => a.num - b.num)[0];
        const combined = [...hand, best];
        const plan = handPlan(combined);
        const before = plan(new Set(hand.map(card => card.id)));
        const after = plan(new Set(combined.map(card => card.id)));
        if (after > before) return { type: 'retrieve', id: null };
        return { type: 'retrieve', id: best.id };
    }
    const opts = options(state, p);
    if (opts.mustCede) return { type: 'cede' };
    const moves = listMoves(state, p);
    const winning = moves.find(move => move.cards.length === hand.length);
    if (winning) return asPlay(winning);
    if (!moves.length) return opts.canDraw ? { type: 'draw' } : { type: 'pass' };
    if (level === 1) return chooseStandardAction(state, p);
    if (level === 0) {
        if (opts.canPass && random() < 0.18) return { type: 'pass' };
        return asPlay(moves[Math.floor(random() * moves.length)]);
    }
    if (level === 2) {
        const best = moves.reduce((a, b) => b.cards.length > a.cards.length
            || (b.cards.length === a.cards.length && strength(state, b.cards[0]) < strength(state, a.cards[0])) ? b : a);
        return asPlay(best);
    }
    const leads = handPlan(hand);
    const best = moves.reduce((a, b) => plannedCost(state, p, b, leads) < plannedCost(state, p, a, leads) ? b : a);
    return asPlay(best);
}
