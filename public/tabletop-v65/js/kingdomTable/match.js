// Tarot Kingdom, table version: a match of several rounds played for chips.
// Chips are match-local points. Online matches and ratings are authoritative on the server.
import { localizedLabel, formatScoreHan } from './tableLocale.js?v=5';
import { openingRoleName } from './roleRecordKey.js?v=piece-of-eight-finish-han-v1';
import { createRound, lastCardHan, roleName } from './rules.js?v=suit-opposition-v1-finish-han-v1';

export const CHIP_RULES = {
    startChips: 1000,
    cardRate: 10,      // chips per card left in hand, per han
    baseHan: 1,        // going out is worth one han before any role
    openingWinHan: 5,  // total for an opening win, before the dealer bonus
    aceHan: 1,         // a loser pays this many extra han for each minor ace left in hand
    dealerHan: 1,      // the dealer wins one han more, and pays one han more
    maxRoundsFactor: 2 // a match never runs longer than this many times its round count, however often dealers repeat
};

export function createMatch({ players = 4, rng = Math.random, rules = CHIP_RULES } = {}) {
    if (players !== 3 && players !== 4) throw new Error('players must be 3 or 4');
    return {
        seats: players, rng, rules,
        chips: Array.from({ length: players }, () => rules.startChips),
        dealer: 0, roundIndex: 0, rounds: players, repeats: 0, played: 0,
        round: null, lastResult: null, over: false
    };
}

export function startRound(match, deck = null) {
    if (match.over) return null;
    match.lastResult = null;
    match.round = createRound({ players: match.seats, dealer: match.dealer, rng: match.rng, deck });
    return match.round;
}

// Only preview a hidden last card for the player's own seat. Public counters must
// not reveal an opponent's conditional card before it is played.
export function seatHan(match, p, { preview = false } = {}) {
    if (match.round.openingWin && match.round.winner === p) {
        // Settled results keep their original score; older active matches use the new default.
        if (match.lastResult?.winner === p) return match.lastResult.winnerHan;
        return (match.rules.openingWinHan ?? CHIP_RULES.openingWinHan) + extraHan(match, p);
    }
    const bonus = preview || match.round.phase === 'over' ? lastCardHan(match.round, p) : 0;
    return match.rules.baseHan + match.round.han[p] + extraHan(match, p) + bonus;
}

// Han a seat carries whether it wins or loses: the dealer's seat.
function extraHan(match, p) {
    return match.round.dealer === p ? match.rules.dealerHan : 0;
}

// "Round 2", or "Round 2, repeat 1" while the dealer keeps the seat.
export function roundLabel(match) {
    const round = `第${Math.min(match.roundIndex + 1, match.rounds)}局`;
    return match.repeats ? `${round} ${match.repeats}本場` : round;
}

// Move the chips for a finished round and step to the next dealer.
// Each loser pays: cards left x (winner's han + own aces + one if dealer) x card rate.
// A dealer who wins keeps the seat and the round is played again (renchan).
export function settleRound(match) {
    const round = match.round;
    if (!round || round.phase !== 'over' || match.lastResult) return match.lastResult;
    const result = { winner: round.winner, winnerHan: 0, lastCardHan: 0, payments: [], delta: match.chips.map(() => 0), label: roundLabel(match), repeat: false };
    if (round.winner !== null) {
        const w = round.winner;
        result.lastCardHan = lastCardHan(round, w);
        result.winnerHan = seatHan(match, w);
        for (let p = 0; p < match.seats; p += 1) {
            if (p === w) continue;
            const hand = round.players[p].hand;
            const aces = hand.filter((c) => !c.major && c.num === 15).length;
            const han = result.winnerHan + aces * match.rules.aceHan + extraHan(match, p);
            const owed = hand.length * han * match.rules.cardRate;
            const paid = Math.min(match.chips[p], owed);
            match.chips[p] -= paid;
            match.chips[w] += paid;
            result.delta[p] -= paid;
            result.delta[w] += paid;
            result.payments.push({ from: p, cards: hand.length, aces, han, owed, paid });
        }
    }
    match.lastResult = result;
    match.played += 1;
    result.repeat = round.winner !== null && round.winner === round.dealer;
    if (result.repeat) {
        match.repeats += 1;
    } else {
        match.repeats = 0;
        match.roundIndex += 1;
        match.dealer = (match.dealer + 1) % match.seats;
    }
    // Compatibility only: settle already committed balances from older saved matches.
    const legacyBalance = Number.isSafeInteger(match.pot) && match.pot > 0 ? match.pot : 0;
    if (legacyBalance && round.winner !== null) {
        match.chips[round.winner] += legacyBalance;
        result.delta[round.winner] += legacyBalance;
    }
    match.over = match.roundIndex >= match.rounds || match.chips.some((c) => c <= 0)
        || match.played >= match.rounds * match.rules.maxRoundsFactor;
    if (legacyBalance && round.winner === null && match.over) {
        // Historical snapshots stored only the total, not an itemized ledger.
        for (let p = 0; p < match.seats; p += 1) {
            const share = Math.floor(legacyBalance / match.seats) + Number(p < legacyBalance % match.seats);
            match.chips[p] += share;
            result.delta[p] += share;
        }
    }
    // An active draw retains only the existing balance for later one-time settlement.
    if (!legacyBalance || round.winner !== null || match.over) delete match.pot;
    return result;
}

// Seats from first place to last. Equal chips keep seat order.
export function ranking(match) {
    return match.chips.map((chips, seat) => ({ seat, chips })).sort((a, b) => b.chips - a.chips || a.seat - b.seat);
}


// Use actual awarded events, not the last visible cards: a round can score several different roles.
export function settlementHanBreakdown(match, result) {
    const w = result?.winner;
    if (!Number.isInteger(w)) return [];
    const { round, rules } = match;
    const lines = [];
    const push = (label, han, count = 1) => { if (han) lines.push({ label, han, count }); };
    const parent = round.dealer === w ? rules.dealerHan : 0;
    if (round.openingWin) {
        push(openingRoleName(round.openingWin), result.winnerHan - parent);
    } else {
        const roles = new Map();
        for (const event of (round.events || [])) {
            if (event.type !== 'han' || event.by !== w || !Array.isArray(event.role?.tb) || event.add <= 0) continue;
            const label = roleName(event.role);
            const entry = roles.get(label) || { label, han: 0, count: 0 };
            entry.han += event.add;
            entry.count++;
            roles.set(label, entry);
        }
        lines.push(...roles.values());
        const clear = (round.majorClearHan || round.devilHan)?.[w] || 0;
        const justice = round.justiceHan?.[w] || 0;
        const devil = round.devilTransferHan?.[w] || 0;
        push('正義執行', justice, justice);
        const purification = round.temperanceHan?.[w] || 0;
        push('清めの盃', purification, purification);
        const triplets = round.tripletHan?.[w] || 0;
        push('スリーカード', triplets, triplets);
        push('役上がり', round.fiveCardFinishHan?.[w] || 0);
        push('大札流し', clear);
        const counted = lines.reduce((sum, item) => sum + item.han, 0);
        push('役の加点', (round.han[w] || 0) - counted - devil);
        push('切札', result.lastCardHan || 0);
        push('上がり', rules.baseHan);
        push('悪魔', devil);
    }
    push('親', parent);
    return lines;
}

export function formatHanEntry({ label, han, count }, language = 'ja') {
    return localizedLabel(label, language) + (count > 1 ? ' ×' + count : '') + ' ' + (han < 0 ? '−' : '') + formatScoreHan(Math.abs(han), language);
}
