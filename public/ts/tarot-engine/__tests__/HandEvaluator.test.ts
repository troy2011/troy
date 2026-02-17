import test from 'node:test';
import assert from 'node:assert/strict';

import { HandEvaluator, TarotCard, MinorSuit } from '../HandEvaluator';

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

test('Death(13): clone-like same suit/value collisions do not break evaluator and can yield Five of a Kind', () => {
    const evaluator = new HandEvaluator();
    const result = evaluator.evaluateHand({
        hand: [
            minor('h_wand_ace', 'Wand', 1),
            minor('h_wand_page', 'Wand', 11)
        ],
        board: [
            minor('b_pent_ace', 'Pentacle', 1),
            minor('b_pent_page', 'Pentacle', 11),
            minor('b_cup_ace', 'Cup', 1),
            minor('b_sword_ace', 'Sword', 1),
            minor('b_cup_9', 'Cup', 9)
        ],
        fateCard: arcana('f_death', 13)
    });

    assert.equal(result.rank, 'FiveKind');
    assert.equal(result.rankLabel, 'Five of a Kind');
    assert.equal(result.bestFive.length, 5);
});

test('Temperance(14): odd->even conversion enables step-2 straight detection', () => {
    const evaluator = new HandEvaluator();
    const input = {
        hand: [
            minor('h_wand_3', 'Wand', 3),
            minor('h_cup_5', 'Cup', 5)
        ],
        board: [
            minor('b_sword_7', 'Sword', 7),
            minor('b_pent_9', 'Pentacle', 9),
            minor('b_wand_11', 'Wand', 11),
            minor('b_cup_2', 'Cup', 2),
            minor('b_sword_4', 'Sword', 4)
        ],
        fateCard: arcana('f_temperance', 14)
    };
    const result = evaluator.evaluateHand(input);
    assert.ok(['Straight', 'StraightFlush'].includes(result.rank), `Expected straight family rank, got ${result.rank}`);
});

test('Baseline check: without Temperance, same cards are not forced into step-2 straight', () => {
    const evaluator = new HandEvaluator();
    const input = {
        hand: [
            minor('h_wand_3', 'Wand', 3),
            minor('h_cup_5', 'Cup', 5)
        ],
        board: [
            minor('b_sword_7', 'Sword', 7),
            minor('b_pent_9', 'Pentacle', 9),
            minor('b_wand_11', 'Wand', 11),
            minor('b_cup_2', 'Cup', 2),
            minor('b_sword_4', 'Sword', 4)
        ],
        fateCard: arcana('f_wheel', 10)
    };
    const result = evaluator.evaluateHand(input);
    assert.notEqual(result.rank, 'Straight');
    assert.notEqual(result.rank, 'StraightFlush');
});

