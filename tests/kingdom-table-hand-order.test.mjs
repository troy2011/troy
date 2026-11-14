import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck } from '../public/js/kingdomTable/rules.js';
import { sortByNumber, displayHand, moveCard } from '../public/js/kingdomTable/handOrder.js';

const deck = buildDeck();
const cards = ids => ids.map(id => deck.find(card => card.id === id));
const ids = hand => hand.map(card => card.id);

test('major and minor cards share ascending numeric order without mutating the hand', () => {
    const hand = cards(['major-16', 'wand-8', 'major-0', 'cup-2', 'major-2', 'sword-15', 'major-1']);
    const before = ids(hand);
    assert.deepEqual(ids(sortByNumber(hand)), ['major-0', 'major-1', 'cup-2', 'major-2', 'wand-8', 'sword-15', 'major-16']);
    assert.deepEqual(ids(hand), before);
});

test('manual order survives removed cards and adds new cards at the end', () => {
    const order = ['major-16', 'cup-2', 'wand-8'];
    const hand = cards(['wand-8', 'major-16', 'major-1', 'cup-4']);
    assert.deepEqual(ids(displayHand(hand, order)), ['major-16', 'wand-8', 'major-1', 'cup-4']);
    assert.deepEqual(order, ['major-16', 'cup-2', 'wand-8']);
});

test('moving a card works in both directions and keeps every other card in order', () => {
    const hand = cards(['major-1', 'cup-2', 'wand-8', 'major-16']);
    assert.deepEqual(moveCard(hand, 'major-16', 0), ['major-16', 'major-1', 'cup-2', 'wand-8']);
    assert.deepEqual(moveCard(hand, 'major-1', 3), ['cup-2', 'wand-8', 'major-16', 'major-1']);
    assert.deepEqual(ids(hand), ['major-1', 'cup-2', 'wand-8', 'major-16']);
});

test('movement stops at the ends and ignores a card no longer in the hand', () => {
    const hand = cards(['major-1', 'cup-2', 'major-16']);
    assert.deepEqual(moveCard(hand, 'major-16', -1), ['major-16', 'major-1', 'cup-2']);
    assert.deepEqual(moveCard(hand, 'major-1', 99), ['cup-2', 'major-16', 'major-1']);
    assert.deepEqual(moveCard(hand, 'wand-8', 1), ids(hand));
});

test('returning to numeric order and starting a new round discard the manual order', () => {
    assert.deepEqual(ids(displayHand(cards(['major-16', 'cup-2', 'major-1']), null)), ['major-1', 'cup-2', 'major-16']);
    assert.deepEqual(ids(displayHand(cards(['major-7', 'sword-3']), ['major-16'])), ['sword-3', 'major-7']);
});
