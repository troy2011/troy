// Tarot Kingdom, table version: a match of several rounds played for chips.
// Chips exist only inside this page. They are not G, are never sent anywhere and buy nothing.
import { createRound } from './rules.js';

export const CHIP_RULES = {
    startChips: 1000,
    ante: 20,          // paid by every seat into the pot at the start of a round
    cardRate: 10,      // chips per card left in hand, per han
    baseHan: 1,        // going out is worth one han before any role
    aceHan: 1,         // a loser pays this many extra han for each minor ace left in hand
    dealerHan: 1,      // the dealer wins one han more, and pays one han more
    maxRoundsFactor: 2 // a match never runs longer than this many times its round count, however often dealers repeat
};

export function createMatch({ players = 4, rng = Math.random, rules = CHIP_RULES } = {}) {
    if (players !== 3 && players !== 4) throw new Error('players must be 3 or 4');
    return {
        seats: players, rng, rules,
        chips: Array.from({ length: players }, () => rules.startChips),
        pot: 0, dealer: 0, roundIndex: 0, rounds: players, repeats: 0, played: 0,
        round: null, lastResult: null, over: false
    };
}

export function startRound(match, deck = null) {
    if (match.over) return null;
    for (let p = 0; p < match.seats; p += 1) {
        const paid = Math.min(match.chips[p], match.rules.ante);
        match.chips[p] -= paid;
        match.pot += paid;
    }
    match.lastResult = null;
    match.round = createRound({ players: match.seats, dealer: match.dealer, rng: match.rng, deck });
    return match.round;
}

// The han a seat would win with if it went out now:
// one for going out, the roles it cleared the field with, and one more for the dealer.
export function seatHan(match, p) {
    return match.rules.baseHan + match.round.han[p] + extraHan(match, p);
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
    const result = { winner: round.winner, winnerHan: 0, payments: [], pot: 0, delta: match.chips.map(() => 0), label: roundLabel(match), repeat: false };
    if (round.winner !== null) {
        const w = round.winner;
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
        result.pot = match.pot;
        match.chips[w] += match.pot;
        result.delta[w] += match.pot;
        match.pot = 0;
    }
    // A drawn round leaves the pot for the next one.
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
    match.over = match.roundIndex >= match.rounds || match.chips.some((c) => c <= 0)
        || match.played >= match.rounds * match.rules.maxRoundsFactor;
    return result;
}

// Seats from first place to last. Equal chips keep seat order.
export function ranking(match) {
    return match.chips.map((chips, seat) => ({ seat, chips })).sort((a, b) => b.chips - a.chips || a.seat - b.seat);
}
