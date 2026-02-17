import test from 'node:test';
import assert from 'node:assert/strict';

import { GameController } from '../GameController';
import { TarotCard, MinorSuit } from '../HandEvaluator';

function minor(id: string, suit: MinorSuit, number: number): TarotCard {
    return {
        id,
        suit,
        number,
        isArcana: false,
        effectType: 'None'
    };
}

function arcana(id: string, number: number): TarotCard {
    return {
        id,
        suit: number === 1 ? 'All' : 'None',
        number,
        isArcana: true,
        effectType: number === 21 ? 'World' : number === 20 ? 'Judgment' : number === 0 ? 'Fool' : 'None'
    };
}

function testDeck(size = 80): TarotCard[] {
    const suits: MinorSuit[] = ['Wand', 'Pentacle', 'Cup', 'Sword'];
    const out: TarotCard[] = [];
    let id = 1;
    while (out.length < size) {
        for (const suit of suits) {
            for (let n = 1; n <= 14; n += 1) {
                out.push(minor(`d_${id++}`, suit, n));
                if (out.length >= size) return out;
            }
        }
    }
    return out;
}

test('Pope(5): preflop deal is 3 cards per player', () => {
    const controller = new GameController({
        playerIds: ['p1', 'p2'],
        forcedFateCard: arcana('f_pope', 5),
        forcedDeck: testDeck()
    });
    const state = controller.startRound();
    assert.equal(state.phase, 'preflop-bet');
    assert.equal(state.players.p1.hand.length, 3);
    assert.equal(state.players.p2.hand.length, 3);
});

test('Judgment(20): enters Fate Action after flop bet and returns to turn-bet after action', () => {
    const controller = new GameController({
        playerIds: ['p1', 'p2'],
        forcedFateCard: arcana('f_judgment', 20),
        forcedDeck: testDeck()
    });
    controller.startRound();
    let state = controller.completeBettingRound(); // preflop -> flop-bet
    assert.equal(state.phase, 'flop-bet');
    state = controller.completeBettingRound(); // flop-bet -> fate-action
    assert.equal(state.phase, 'fate-action');
    assert.equal(state.pendingFateActionSource, 'flop');

    state = controller.runFateAction({
        discardByPlayer: { p1: 0, p2: 0 }
    });
    assert.equal(state.phase, 'turn-bet');
    assert.equal(state.canUseJudgmentSwap, true);
});

test('Moon(18): river is hidden until showdown', () => {
    const controller = new GameController({
        playerIds: ['p1', 'p2'],
        forcedFateCard: arcana('f_moon', 18),
        forcedDeck: testDeck()
    });
    controller.startRound();
    controller.completeBettingRound(); // preflop -> flop-bet
    controller.completeBettingRound(); // flop-bet -> turn-bet
    let state = controller.completeBettingRound(); // turn-bet -> river-bet (hidden river)
    assert.equal(state.phase, 'river-bet');
    assert.equal(state.boardVisible.length, 4);
    assert.ok(state.boardHiddenRiver, 'expected hidden river card to exist');

    state = controller.completeBettingRound(); // river-bet -> showdown
    assert.equal(state.phase, 'showdown');
    const showdown = controller.resolveShowdown();
    assert.ok(showdown.winnerIds.length >= 1);
    const doneState = controller.getState();
    assert.equal(doneState.phase, 'done');
    assert.equal(doneState.boardVisible.length >= 5, true);
});

