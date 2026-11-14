// Rules of the table version of Tarot Kingdom, checked against public/tarot-kingdom-real.html.
// Run: node --test tests/kingdom-table-rules.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../public/js/kingdomTable/rules.js';
import * as M from '../public/js/kingdomTable/match.js';
import { chooseAction } from '../public/js/kingdomTable/ai.js';

const SUIT = { W: 'wand', S: 'sword', C: 'cup', O: 'coin' };
const RANK = { P: 11, N: 12, Q: 13, K: 14, A: 15 };
// 'S7' = seven of swords, 'CA' = ace of cups, 'M21' = the World.
function card(code) {
    if (code[0] === 'M') return { id: `major-${Number(code.slice(1))}`, major: true, num: Number(code.slice(1)), suit: null };
    const num = RANK[code.slice(1)] || Number(code.slice(1));
    return { id: `${SUIT[code[0]]}-${num}`, major: false, num, suit: SUIT[code[0]] };
}
const cards = (text) => (text ? text.split(' ').map(card) : []);
const ids = (text) => cards(text).map((c) => c.id);

// A table in mid-round: hands per seat, and optionally a field already lying there.
function table(hands, { field = '', by = hands.length - 1, turn = 0, deck = '' } = {}) {
    const state = {
        players: hands.map((hand) => ({ hand: cards(hand), grave: [], exiled: [] })),
        deck: cards(deck), aside: [], dealer: 0,
        field: { kind: null, count: 0, role: null, plays: [] },
        back: false, lock: null, cut: false, passed: [], trashBy: null, judgement: false, han: hands.map(() => 0),
        last: by, turn, drew: false, ceded: 0, phase: 'play', winner: null, lastPlay: null, events: []
    };
    if (field) {
        const laid = cards(field);
        state.field = { kind: 'normal', count: laid.length, role: null, plays: [{ by, cards: laid }] };
    }
    return state;
}
const ok = (res) => assert.equal(res.ok, true, res.reason);
const refused = (res) => assert.equal(res.ok, false);

test('the deck has 56 minor and 22 major cards and a deal leaves 8 cards each', () => {
    const deck = R.buildDeck();
    assert.equal(deck.length, 78);
    assert.equal(deck.filter((c) => c.major).length, 22);
    assert.equal(new Set(deck.map((c) => c.id)).size, 78);
    for (const players of [3, 4]) {
        const state = R.createRound({ players });
        assert.ok(state.players.every((p) => p.hand.length === 8));
        assert.equal(state.deck.length, 78 - players * 8 - 1);
    }
});

test('a stronger number of the same count answers the field', () => {
    const state = table(['S7 C5 W5', 'W2', 'W3'], { field: 'C6' });
    refused(R.play(state, 0, ids('C5')));
    refused(R.play(state, 0, ids('C5 W5')));
    ok(R.play(state, 0, ids('S7')));
    assert.equal(state.turn, 1);
});

test('an equal number needs a harmony pair, and a major card beats minors of the same number', () => {
    ok(R.checkNormal(table(['W7', 'W2'], { field: 'S7' }), 0, cards('W7')));
    refused(R.checkNormal(table(['C7', 'W2'], { field: 'S7' }), 0, cards('C7')));
    ok(R.checkNormal(table(['M7', 'W2'], { field: 'S7' }), 0, cards('M7')));
    refused(R.checkNormal(table(['S7', 'W2'], { field: 'M7' }), 0, cards('S7')));
});

test('the ace is the strongest minor and a lone ace cannot be answered by a major card', () => {
    ok(R.checkNormal(table(['CA', 'W2'], { field: 'SK' }), 0, cards('CA')));
    refused(R.checkNormal(table(['M20', 'W2'], { field: 'SA' }), 0, cards('M20')));
    refused(R.checkNormal(table(['SA M1', 'W2']), 0, cards('SA M1')));
});

test('five skips one seat per minor card and the major five skips two', () => {
    const one = table(['S5 W9', 'W2', 'W3', 'W4'], { field: 'C4' });
    ok(R.play(one, 0, ids('S5')));
    assert.equal(one.turn, 2);
    const three = table(['M5 W9', 'W2', 'W3'], { field: 'C4' });
    ok(R.play(three, 0, ids('M5')));
    assert.equal(three.turn, 0);
});

test('one eight leaves only a call or a pass; two eights clear the field at once', () => {
    const cut = table(['S8 W9', 'W9 CA', 'W3'], { field: 'C4' });
    ok(R.play(cut, 0, ids('S8')));
    assert.equal(cut.cut, true);
    refused(R.play(cut, 1, ids('CA')));
    ok(R.pass(cut, 1));
    const clear = table(['S8 W8 W9', 'W2', 'W3'], { field: 'C4 O4' });
    ok(R.play(clear, 0, ids('S8 W8')));
    assert.equal(clear.field.kind, null);
    assert.equal(clear.turn, 0);
});

test('eleven turns the order round until the field is cleared', () => {
    const state = table(['SP W9', 'W2 CK', 'W3'], { field: 'C4' });
    ok(R.play(state, 0, ids('SP')));
    assert.equal(state.back, true);
    refused(R.play(state, 1, ids('CK')));
    ok(R.play(state, 1, ids('W2')));
    ok(R.pass(state, 2));
    ok(R.pass(state, 0));
    assert.equal(state.back, false);
    assert.equal(state.turn, 1);
});

test('a lone knight passed round lets its player remove a card, but never the last one', () => {
    const state = table(['SN W9 W2', 'W2', 'W3'], { field: 'C4' });
    ok(R.play(state, 0, ids('SN')));
    ok(R.pass(state, 1));
    ok(R.pass(state, 2));
    assert.equal(state.phase, 'trash');
    ok(R.trash(state, 0, 'wand-2'));
    assert.deepEqual(state.players[0].exiled.map((c) => c.id), ['wand-2']);
    assert.equal(state.phase, 'play');
    const last = table(['SN W9', 'W2', 'W3'], { field: 'C4' });
    ok(R.play(last, 0, ids('SN')));
    ok(R.pass(last, 1));
    ok(R.pass(last, 2));
    assert.equal(last.phase, 'play');
});

test('a queen or king on its own suit locks the suit until Temperance or a clear', () => {
    const state = table(['SQ W9', 'CK SK M14', 'W3'], { field: 'S4' });
    ok(R.play(state, 0, ids('SQ')));
    assert.equal(state.lock, 'sword');
    refused(R.checkNormal(state, 1, cards('CK')));
    ok(R.checkNormal(state, 1, cards('SK')));
    ok(R.play(state, 1, ids('M14')));
    assert.equal(state.lock, null);
});

test('the Devil answers a lone court card even during back; tower to sun need their suit', () => {
    const back = table(['M15 W2', 'W3'], { field: 'SK' });
    back.back = true;
    ok(R.checkNormal(back, 0, cards('M15')));
    refused(R.checkNormal(table(['M15 W2', 'W3'], { field: 'S9' }), 0, cards('M15')));
    ok(R.checkNormal(table(['M16 W2', 'W3'], { field: 'S9' }), 0, cards('M16')));
    refused(R.checkNormal(table(['M16 W2', 'W3'], { field: 'C9' }), 0, cards('M16')));
    refused(R.checkNormal(table(['M16 W2', 'W3']), 0, cards('M16')));
});

test('the World answers a lone major card, clears the field, and is refused during back', () => {
    const state = table(['M21 W2', 'W3', 'W4'], { field: 'M10' });
    refused(R.checkNormal(table(['M21 W2', 'W3'], { field: 'S7' }), 0, cards('M21')));
    ok(R.play(state, 0, ids('M21')));
    assert.equal(state.field.kind, null);
    assert.equal(state.turn, 0);
    assert.equal(state.aside.length, 2);
    const back = table(['M21 W2', 'W3'], { field: 'M10' });
    back.back = true;
    refused(R.checkNormal(back, 0, cards('M21')));
    const cut = table(['M21 W2', 'W3'], { field: 'M8' });
    cut.cut = true;
    ok(R.checkNormal(cut, 0, cards('M21')));
});

test('Judgement flips the order and lets whoever clears that field take a minor card from another graveyard', () => {
    const state = table(['M20 W9', 'W2', 'W3'], { field: 'C4', by: 1 });
    state.players[1].grave.push(card('S6'));
    ok(R.play(state, 0, ids('M20')));
    assert.equal(state.back, true);
    ok(R.pass(state, 1));
    ok(R.pass(state, 2));
    assert.equal(state.phase, 'retrieve');
    refused(R.retrieve(state, 0, 'wand-2'));
    ok(R.retrieve(state, 0, 'sword-6'));
    assert.ok(state.players[0].hand.some((c) => c.id === 'sword-6'));
    assert.equal(state.phase, 'play');
});

test('going out comes before the effect of the cards, the World included', () => {
    const eight = table(['S8', 'W2', 'W3'], { field: 'C4' });
    ok(R.play(eight, 0, ids('S8')));
    assert.equal(eight.phase, 'over');
    assert.equal(eight.winner, 0);
    const world = table(['M21', 'W2', 'W3']);
    ok(R.play(world, 0, ids('M21')));
    assert.equal(world.winner, 0);
});

test('a parent on an empty field cannot pass, may draw once, and hands the lead on when unable to open', () => {
    const state = table(['M16 M17', 'W2', 'W3'], { deck: 'M18' });
    assert.deepEqual(R.options(state, 0), { canPlay: false, canPass: false, canDraw: true, mustCede: false });
    ok(R.draw(state, 0));
    assert.equal(R.options(state, 0).mustCede, true);
    ok(R.cede(state, 0));
    assert.equal(state.turn, 1);
    const stuck = table(['M16 M17', 'M18 M19', 'M15 M21']);
    ok(R.cede(stuck, 0));
    ok(R.cede(stuck, 1));
    ok(R.cede(stuck, 2));
    assert.equal(stuck.phase, 'over');
    assert.equal(stuck.winner, null);
});

test('a pass is forgotten once someone plays, and the field clears when all others have passed', () => {
    const state = table(['S9 W2', 'W3 CK', 'W4 CA'], { field: 'C4' });
    ok(R.pass(state, 0));
    ok(R.play(state, 1, ids('CK')));
    assert.deepEqual(state.passed, []);
    ok(R.play(state, 2, ids('CA')));
    ok(R.pass(state, 0));
    ok(R.pass(state, 1));
    assert.equal(state.field.kind, null);
    assert.equal(state.turn, 2);
    assert.deepEqual(state.players[1].grave.map((c) => c.id), ['cup-14']);
});

test('five-card roles are ranked as in the manual', () => {
    const rank = (text) => R.evaluateRole(cards(text))?.rank;
    assert.equal(rank('S3 C4 W5 O6 S7'), 1);
    assert.equal(rank('SA C2 W3 O4 S5'), 1);
    assert.equal(rank('SQ CK WA O2 S3'), undefined);
    assert.equal(rank('S3 S9 S5 SK S7'), 2);
    assert.equal(rank('M2 M3 M9 M10 M13'), 2);
    assert.equal(rank('S3 C3 W3 O6 S6'), 3);
    assert.equal(rank('S3 C3 W3 O3 S6'), 4);
    assert.equal(rank('M21 M3 M9 M10 M13'), 5);
    assert.equal(rank('S3 S4 S5 S6 S7'), 6);
    assert.equal(rank('S3 C3 W3 O3 M3'), 7);
    assert.equal(rank('S3 C3 W3 O3 M0'), 7);
    assert.equal(rank('S3 C4 M0 O6 S7'), 1);
    assert.equal(rank('S3 S4 M0 S6 S7'), 1);
    assert.equal(rank('S3 C3 M0 O6 S6'), 3);
    assert.equal(rank('S3 C4 W9 O6 S7'), undefined);
    assert.ok(R.compareRoles(R.evaluateRole(cards('S3 C4 W5 O6 S7')), R.evaluateRole(cards('S4 C5 W6 O7 S8'))) < 0);
    assert.ok(R.compareRoles(R.evaluateRole(cards('S3 C3 W3 O6 S6')), R.evaluateRole(cards('S9 S2 S5 SK S7'))) > 0);
});

test('a role is led or laid on a weaker role, never on a normal field', () => {
    const lead = table(['S3 C4 W5 O6 S7 W9', 'W2', 'W3']);
    ok(R.play(lead, 0, ids('S3 C4 W5 O6 S7')));
    assert.equal(lead.field.kind, 'role');
    refused(R.play(lead, 1, ids('W2')));
    const over = table(['S3 C4 W5 O6 S7 W9', 'W2', 'W3'], { field: 'C2' });
    refused(R.play(over, 0, ids('S3 C4 W5 O6 S7'), 'role'));
});

test('a call joins four hand cards to a single field card and lifts cut, back and lock', () => {
    const state = table(['S3 C4 W5 O7 W9', 'W2', 'W3'], { field: 'C6' });
    state.cut = true;
    state.back = true;
    ok(R.play(state, 0, ids('S3 C4 W5 O7')));
    assert.equal(state.field.kind, 'role');
    assert.equal(state.field.role.rank, 1);
    assert.equal(state.cut, false);
    assert.equal(state.back, false);
    const holding = table(['S3 C4 W5 O7 W6', 'W2', 'W3'], { field: 'C6' });
    refused(R.checkCall(holding, 0, cards('S3 C4 W5 O7')));
    const strongest = table(['S3 S4 S5 S7 W9', 'W2', 'W3'], { field: 'SK' });
    refused(R.checkCall(strongest, 0, cards('S3 S4 S5 S7')));
    const major = table(['M2 M3 M4 M6 W9', 'W2', 'W3'], { field: 'M10' });
    refused(R.checkCall(major, 0, cards('M2 M3 M4 M6')));
    const worldCall = table(['M2 M3 M4 M21 W9', 'W2', 'W3'], { field: 'M10' });
    ok(R.checkCall(worldCall, 0, cards('M2 M3 M4 M21')));
});

test('a call with the last four cards wins', () => {
    const state = table(['S3 C4 W5 O7', 'W2', 'W3'], { field: 'C6' });
    ok(R.play(state, 0, ids('S3 C4 W5 O7')));
    assert.equal(state.winner, 0);
});

// Lead five cards as a role (or call on `field`), let the others pass, and report the han earned.
function hanFor(five, field = '') {
    const state = table([`${five} W9`, 'W2', 'W3'], { field });
    ok(R.play(state, 0, ids(five)));
    ok(R.pass(state, 1));
    ok(R.pass(state, 2));
    assert.equal(state.field.kind, null);
    return state.han[0];
}

test('a role that clears the field adds han: 2, 2, 3, 4, 5, and 10 for the rest', () => {
    assert.equal(hanFor('S3 C4 W5 O6 S7'), 2);
    assert.equal(hanFor('S3 S9 S5 SK S7'), 2);
    assert.equal(hanFor('S3 C3 W3 O6 S6'), 3);
    assert.equal(hanFor('S3 C3 W3 O3 S6'), 4);
    assert.equal(hanFor('S3 S4 S5 S6 S7'), 5);
    assert.equal(hanFor('M21 M3 M9 M10 M13'), 10);
    assert.equal(hanFor('S3 C3 W3 O3 M3'), 10);
});

test('a role made by a call earns one han less, and a beaten role earns nothing', () => {
    assert.equal(hanFor('S3 C4 W5 O7', 'C6'), 1);
    assert.equal(hanFor('S3 C3 W3 O6', 'S6'), 2);
    const state = table(['S3 C4 W5 O6 S7 W9', 'S4 C5 W6 O7 S8 W2', 'W3']);
    ok(R.play(state, 0, ids('S3 C4 W5 O6 S7')));
    ok(R.play(state, 1, ids('S4 C5 W6 O7 S8')));
    ok(R.pass(state, 2));
    ok(R.pass(state, 0));
    assert.deepEqual(state.han, [0, 2, 0]);
    const normal = table(['S9 W9', 'W2', 'W3'], { field: 'C4' });
    ok(R.play(normal, 0, ids('S9')));
    ok(R.pass(normal, 1));
    ok(R.pass(normal, 2));
    assert.deepEqual(normal.han, [0, 0, 0]);
});

test('going out with a role counts its han', () => {
    const state = table(['S3 C3 W3 O6 S6', 'W2', 'W3']);
    ok(R.play(state, 0, ids('S3 C3 W3 O6 S6')));
    assert.equal(state.winner, 0);
    assert.equal(state.han[0], 3);
});

test('chips: losers pay cards left x the winner han, plus one han per ace they still hold', () => {
    const match = M.createMatch({ players: 3 });
    const start = match.rules.startChips;
    M.startRound(match);
    assert.equal(match.pot, 60);
    match.round = table(['S9', 'W2 M3', 'W3 CA SA'], { field: 'C4' });
    match.round.han[0] = 2;
    ok(R.play(match.round, 0, ids('S9')));
    const result = M.settleRound(match);
    // Seat 0 is the dealer: one han more.
    assert.equal(result.winnerHan, 4);
    assert.deepEqual(result.payments.map((p) => [p.cards, p.han, p.paid]), [[2, 4, 80], [3, 6, 180]]);
    assert.equal(match.chips[0], start - 20 + 80 + 180 + 60);
    assert.equal(match.chips.reduce((a, b) => a + b, 0), start * 3);
    assert.equal(M.settleRound(match), result);
});

test('chips: a dealer who wins keeps the seat and replays the round; otherwise the seat moves on', () => {
    const match = M.createMatch({ players: 3 });
    M.startRound(match);
    match.round = table(['S9', 'W2', 'W3'], { field: 'C4' });
    ok(R.play(match.round, 0, ids('S9')));
    const kept = M.settleRound(match);
    assert.equal(kept.repeat, true);
    assert.deepEqual([match.dealer, match.roundIndex, match.repeats], [0, 0, 1]);
    assert.equal(M.roundLabel(match), '第1局 1本場');
    M.startRound(match);
    match.round = table(['S9 W9', 'CK', 'W3'], { field: 'C4' });
    ok(R.play(match.round, 0, ids('S9')));
    ok(R.play(match.round, 1, ids('CK')));
    const moved = M.settleRound(match);
    assert.equal(moved.repeat, false);
    assert.deepEqual([match.dealer, match.roundIndex, match.repeats], [1, 1, 0]);
    // However often dealers repeat, a match ends after twice its round count.
    const long = M.createMatch({ players: 3 });
    for (let n = 0; n < 6; n += 1) {
        assert.equal(long.over, false);
        M.startRound(long);
        long.round = table(['S9', 'W2', 'W3'], { field: 'C4' });
        ok(R.play(long.round, 0, ids('S9')));
        M.settleRound(long);
    }
    assert.equal(long.over, true);
});

test('chips: a drawn round carries the pot over and a seat never pays more than it holds', () => {
    const match = M.createMatch({ players: 3 });
    M.startRound(match);
    match.round = table(['M16 M17', 'M18 M19', 'M15 M21']);
    R.cede(match.round, 0);
    R.cede(match.round, 1);
    R.cede(match.round, 2);
    assert.equal(M.settleRound(match).winner, null);
    assert.equal(match.pot, 60);
    M.startRound(match);
    assert.equal(match.pot, 120);
    match.chips[1] = 5;
    match.round = table(['S9', 'W2 M3 M4 M5', 'W3'], { field: 'C4' });
    ok(R.play(match.round, 0, ids('S9')));
    M.settleRound(match);
    assert.equal(match.chips[1], 0);
    assert.equal(match.over, true);
    assert.equal(M.ranking(match)[0].seat, 0);
});

test('computer-only matches always end, keep all 78 cards and all chips, and never make an illegal move', () => {
    let seed = 11;
    const rng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let n = 0; n < 60; n += 1) {
        const match = M.createMatch({ players: n % 2 ? 3 : 4, rng });
        while (!match.over) {
            const state = M.startRound(match);
            for (let step = 0; state.phase !== 'over'; step += 1) {
                assert.ok(step < 2000, 'round did not end');
                const p = state.turn;
                const a = chooseAction(state, p);
                const res = a.type === 'play' ? R.play(state, p, a.ids, a.kind) : a.type === 'pass' ? R.pass(state, p)
                    : a.type === 'draw' ? R.draw(state, p) : a.type === 'cede' ? R.cede(state, p)
                        : a.type === 'trash' ? R.trash(state, p, a.id) : R.retrieve(state, p, a.id);
                ok(res);
            }
            const count = state.players.reduce((sum, pl) => sum + pl.hand.length + pl.grave.length + pl.exiled.length, 0)
                + state.deck.length + state.aside.length + state.field.plays.reduce((sum, pl) => sum + pl.cards.length, 0);
            assert.equal(count, 78);
            M.settleRound(match);
            assert.equal(match.chips.reduce((a, b) => a + b, 0) + match.pot, match.seats * match.rules.startChips);
        }
    }
});
