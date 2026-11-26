import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../public/tabletop-v65/js/kingdomTable/rules.js';

const byId = new Map(R.buildDeck().map(card => [card.id,card]));
const cards = ids => ids.split(' ').filter(Boolean).map(id => byId.get(id));
function game(hands, laid = '') {
    const state = R.createRound({ players: hands.length });
    Object.assign(state, {
        players: hands.map(ids => ({ hand: cards(ids), grave: [], exiled: [] })),
        phase: 'play', turn: 0, last: hands.length - 1, winner: null, openingWin: null,
        back: false, lock: null, cut: false, trashBy: null, passed: [], events: [],
        field: { kind: laid ? 'normal' : null, count: cards(laid).length, role: null,
            plays: laid ? [{ by: hands.length - 1, cards: cards(laid) }] : [] }
    });
    return state;
}
const autoPasses = s => s.events.filter(e => e.type === 'pass' && e.auto).map(e => e.by);

test('one or more short hands pass immediately; an equal hand retains the turn', () => {
    const s = game(['wand-7 cup-7 sword-2','wand-3','wand-4','wand-9 cup-9']);
    assert.equal(R.play(s,0,['wand-7','cup-7'],'normal').ok,true);
    assert.deepEqual(autoPasses(s),[1,2]);
    assert.equal(s.turn,3); assert.equal(s.field.count,2);
    assert.equal(R.resolveForcedPasses(s),false);
    assert.equal(R.play(s,3,['wand-9','cup-9'],'normal').ok,true);
    assert.equal(s.winner,3);
});

test('equal-size hand without matching numbers is not forced to pass', () => {
    const s = game(['wand-7 cup-7 sword-2','wand-3 cup-4','wand-9']);
    assert.equal(R.play(s,0,['wand-7','cup-7'],'normal').ok,true);
    assert.equal(s.turn,1); assert.deepEqual(autoPasses(s),[]);
    assert.equal(R.options(s,1).canPlay,false);
    assert.equal(R.pass(s,1).ok,true);
    assert.deepEqual(autoPasses(s),[2]);
    assert.equal(s.field.kind,null); assert.equal(s.turn,0);
});

test('four-card call on a single field still works; resulting five-card role auto-passes short hands', () => {
    const s = game(['sword-3 cup-4 wand-5 coin-7 wand-9','wand-2 cup-2 sword-2 coin-2','wand-3 cup-3 coin-3'],
        'cup-6');
    assert.equal(R.resolveForcedPasses(s),false);
    assert.equal(R.play(s,0,['sword-3','cup-4','wand-5','coin-7'],'call').ok,true);
    assert.deepEqual(autoPasses(s),[1,2]);
    assert.equal(s.field.kind,null); assert.equal(s.turn,0);
    assert.equal(s.han[0],1); assert.equal(R.resolveForcedPasses(s),false);
    assert.equal(s.events.filter(e => e.type === 'clear').length,1);
});

test('auto-pass never skips an empty field or a special-choice phase', () => {
    const s = game(['major-21','cup-2','cup-7']);
    assert.equal(R.resolveForcedPasses(s),false);
    const special = game(['wand-3','cup-2','cup-7'],'cup-3 coin-3');
    special.phase='give';
    assert.equal(R.resolveForcedPasses(special),false);
    assert.deepEqual(special.events,[]);
});
