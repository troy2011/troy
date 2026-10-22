const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadKingdomEngine } = require('./helpers/kingdom-engine-vm.cjs');
let api;
const major = n => ({ id: 'major-' + n, kind: 'major', suit: 'None', number: n });
const minor = (n, suit = 'Wand') => ({ id: suit + '-' + n, kind: 'minor', suit, number: n });
const rules = { openingRescueVersion: 1 };
function scenario(hands, extra = {}) { return api.scenario({ withTrick: false, playerCount: hands.length, handsBySeat: hands, rules, drawDeck: [], ...extra }); }
const legal = (pi = 0) => api.legal(pi);
before(async () => { ({ api } = await loadKingdomEngine(path.resolve(__dirname, '..'))); });
test('new ordinary matches opt in while missing/legacy rule flags remain off after network restoration', () => {
    assert.equal(api.freshState().rules.openingRescueVersion, 1);
    scenario([[minor(2)], [minor(3)], [minor(4)]]);
    const payload = api.publicState();
    assert.equal(api.deserialize(payload).rules.openingRescueVersion, 1);
    delete payload.state.rules.openingRescueVersion;
    assert.equal(api.deserialize(payload).rules.openingRescueVersion, 0);
});
test('a unique 78-card deck has only six blocked opening cards, below the unchanged eight-card cap', () => {
    const deck = api.deck();
    assert.equal(deck.length, 78);
    assert.equal(new Set(deck.map(c => c.id)).size, 78);
    const blocked = [];
    for (const card of deck) {
        const reserve = major(card.kind === 'major' && card.number === 15 ? 16 : 15);
        scenario([[card, reserve], [minor(3)], [minor(4)]]);
        if (!api.set(0, [0]).validation.ok)
            blocked.push(card.number);
    }
    assert.deepEqual(blocked.sort((a, b) => a - b), [15, 16, 17, 18, 19, 21]);
});
for (const n of [15, 16, 17, 18, 19, 21])
    test('last-card opening exception for major ' + n + ' is checked before drawing', () => {
        scenario([[major(n)], [minor(2)], [minor(3)]], { drawDeck: [major(20)] });
        assert.equal(api.set(0, [0]).validation.ok, true);
        api.resolveLeader(0);
        assert.equal(api.state().turn, 0);
        assert.equal(api.state().players[0].hand.length, 1);
        assert.equal(api.metrics().forcedDraws, 0);
    });
test('World cannot open with two cards, including when the older special-rule feature is off', () => {
    scenario([[major(21), minor(2)], [minor(3)], [minor(4)]]);
    assert.equal(api.set(0, [0]).validation.ok, false);
    scenario([[major(21), minor(2)], [minor(3)], [minor(4)]], { rules: { ...rules, majorArcanaSpecialVersion: 0 } });
    assert.equal(api.set(0, [0]).validation.ok, false);
});
test('last card does not bypass another leader or an overplay condition', () => {
    scenario([[major(15)], [minor(3)], [minor(4)]], { turnIndex: 1 });
    assert.equal(api.set(0, [0]).validation.ok, false);
    scenario([[major(16)], [minor(3)], [minor(4)]]);
    const state = api.state();
    state.trick = { type: 'set', count: 1, cardsTable: [minor(2, 'Cup')], owner: 1, number: 2, setPower: 2 };
    assert.equal(api.set(0, [0]).validation.ok, false);
});
test('World keeps its existing overplay and reverse restrictions', () => {
    scenario([[major(21)], [minor(3)], [minor(4)]]);
    const state = api.state();
    state.trick = { type: 'set', count: 1, cardsTable: [major(10)], owner: 1, number: 10, setPower: 10 };
    assert.equal(api.set(0, [0]).validation.ok, true);
    state.reverse = true;
    assert.equal(api.set(0, [0]).validation.ok, false);
    state.reverse = false;
    state.trick.cardsTable = [minor(10)];
    assert.equal(api.set(0, [0]).validation.ok, false);
});
test('blocked parent draws one, stays if legal, and is not knocked out on a third blocked draw', () => {
    scenario([[major(15), major(16)], [minor(3)], [minor(4)]], { drawDeck: [minor(6)], forcedDrawStreakBySeat: [2, 0, 0] });
    const hp = api.state().players[0].hp;
    api.resolveLeader(0);
    assert.equal(api.metrics().leaderDraws, 1);
    assert.equal(api.metrics().forcedDrawKos, 0);
    assert.equal(api.state().players[0].hp, hp);
    assert.equal(api.state().turn, 0);
    assert.ok(legal().length > 0);
});
test('parent advances when the one drawn card still cannot open', () => {
    scenario([[major(15), major(16)], [minor(3)], [minor(4)]], { drawDeck: [major(17)] });
    api.resolveLeader(0);
    assert.equal(api.metrics().leaderDraws, 1);
    assert.equal(api.state().turn, 1);
    assert.equal(api.state().leadRequiredOwner, 1);
});
test('all blocked and empty deck uses the already defined draw/retry, with no invented winner', () => {
    scenario([[major(15), major(16)], [major(17), major(18)], [major(19), major(21)]]);
    api.resolveLeader(0);
    assert.equal(api.state().transition.kind, 'roundDrawRetry');
    assert.equal(api.metrics().retryReason, 'draw-no-opening-no-refill');
    assert.equal(api.metrics().forcedDraws, 0);
    assert.equal(api.metrics().leaderPasses, 3);
    assert.deepEqual(Array.from(api.state().blockedLeaderSeats), [0, 1, 2]);
});
test('empty deck alone does not end a round when the parent can legally open', () => {
    scenario([[minor(6), major(15)], [minor(3)], [minor(4)]]);
    api.resolveLeader(0);
    assert.equal(api.state().phase, 'turn');
    assert.equal(api.state().turn, 0);
    assert.equal(api.state().transition, null);
    assert.equal(api.metrics().forcedDraws, 0);
});
test('with an empty deck a blocked parent hands over to the next legal parent without declaring a draw', () => {
    scenario([[major(15), major(16)], [minor(3), minor(7)], [minor(4), minor(8)]]);
    api.resolveLeader(0);
    assert.equal(api.state().turn, 1);
    assert.equal(api.state().leadRequiredOwner, 1);
    assert.equal(api.state().transition, null);
    assert.equal(api.metrics().leaderPasses, 1);
    assert.equal(api.metrics().forcedDraws, 0);
});
for (const n of [5, 15, 21])
    test('legal final ' + n + ' wins before card effects or attacks', () => {
        scenario([[major(n)], [minor(3)], [minor(4)]], { drawDeck: [minor(9)] });
        const cards = api.state().drawDeck.length, hp = api.state().battle.enemy.hp;
        const play = legal().find(p => p.cardsHand[0].number === n);
        assert.ok(play);
        api.play(0, play);
        assert.equal(api.state().phase, 'roundOutCinematic');
        assert.equal(api.state().turn, 0);
        assert.equal(api.state().battle.outcome, 'victory');
        assert.equal(api.state().battle.enemy.hp, hp);
        assert.equal(api.metrics().forcedDraws, 0);
        assert.equal(api.state().drawDeck.length, cards);
        assert.equal(api.state().skipNotice, null);
    });
for (const count of [3, 4])
    test('major 5 still skips two people with ' + count + ' seats', () => {
        scenario(Array.from({ length: count }, (_, i) => [minor(i + 2), minor(i + 7, 'Cup')]));
        const result = api.effects({ type: 'set', owner: 0, cardsHand: [major(5)], cardsTable: [major(5)] });
        assert.equal(result.skip, 2);
        assert.deepEqual(Array.from(api.state().skipNotice.targetIndexes), [1, 2]);
    });
test('exploration stage and tutorial reject the new last-card exception even if a flag is present', () => {
    for (const extra of [{ stage: { stageNo: 1, stageId: 'tarot_stage_1' } }, { tutorialEnabled: true }]) {
        scenario([[major(15)], [minor(3)], [minor(4)]]);
        Object.assign(api.state(), extra);
        assert.equal(api.set(0, [0]).validation.ok, false);
    }
    scenario([[major(15)], [minor(3)], [minor(4)]]);
    api.setExploration({ mode: 'offline' });
    assert.equal(api.set(0, [0]).validation.ok, false);
    api.setExploration(null);
});
test('legacy combat retains third-draw KO and last-card opening prohibition', () => {
    scenario([[major(15), major(16)], [minor(3)], [minor(4)]], { rules: { openingRescueVersion: 0 }, drawDeck: [major(17)], forcedDrawStreakBySeat: [2, 0, 0] });
    api.resolveLeader(0);
    assert.equal(api.state().players[0].hp, 0);
    assert.equal(api.metrics().forcedDrawKos, 1);
});
test('host action rebuilding enforces the same World rule and rejects stale card ids', () => {
    scenario([[major(21)], [minor(3)], [minor(4)]]);
    assert.equal(api.rebuild(0, ['major-21']).ok, true);
    assert.equal(api.rebuild(0, ['not-in-hand']).ok, false);
    api.state().rules.openingRescueVersion = 0;
    assert.equal(api.rebuild(0, ['major-21']).ok, false);
});
test('exploration still applies the existing third-forced-draw knockout', () => {
    scenario([[major(15), major(16)], [minor(3)], [minor(4)]], { drawDeck: [major(17)], forcedDrawStreakBySeat: [2, 0, 0] });
    api.state().stage = { stageNo: 1 };
    api.resolveLeader(0);
    assert.equal(api.state().players[0].hp, 0);
    assert.equal(api.metrics().forcedDrawKos, 1);
});
test('a five-card empty-hand victory preserves the existing role star and arcana-point reward', () => {
    scenario([[minor(2), minor(3, 'Cup'), minor(4, 'Sword'), minor(5, 'Pentacle'), minor(6)], [minor(7)], [minor(8)]]);
    const player = api.state().players[0];
    const stars = player.stars, points = player.arcanaPoints;
    const play = legal().find(play => play.type === 'role' && play.cardsHand.length === 5);
    assert.ok(play);
    const rate = Number(play.role.effectiveRate ?? play.role.baseRate);
    api.play(0, play);
    assert.equal(api.state().phase, 'roundOutCinematic');
    assert.equal(player.stars, stars + 1 + rate);
    assert.equal(player.arcanaPoints, points + 1 + rate);
});
