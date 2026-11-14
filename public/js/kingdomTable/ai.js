// Tarot Kingdom, table version: a plain computer player. It only uses what a player at the table can see:
// its own hand, the field and the public state.
import { listMoves, options, numberKey } from './rules.js';

const BARRED = new Set([15, 16, 17, 18, 19, 21]);
const strength = (state, card) => (state.back ? 21 - card.num : card.num);

function groupSize(hand, card) {
    return hand.filter((c) => numberKey(c) === numberKey(card)).length;
}

// Lower is better: shed many cards, keep strong cards and matched sets for later.
function cost(state, hand, move) {
    if (move.cards.length === hand.length) return -1000;
    if (move.type !== 'normal') return -40 + move.role.rank * 2;
    const card = move.cards[0];
    const broken = groupSize(hand, card) - move.cards.length;
    const major = move.cards.some((c) => c.major) ? 3 : 0;
    return strength(state, card) + major + broken * 6 - move.cards.length * 4;
}

export function chooseAction(state, p) {
    const hand = state.players[p].hand;
    if (state.phase === 'trash') {
        const awkward = hand.find((c) => c.major && BARRED.has(c.num));
        const weakest = [...hand].sort((a, b) => a.num - b.num)[0];
        return { type: 'trash', id: (awkward || weakest).id };
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
