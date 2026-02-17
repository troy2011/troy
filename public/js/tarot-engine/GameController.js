import { HandEvaluator } from './HandEvaluator.js';
const FATE_ACTION_NUMBERS = new Set([2, 5, 9, 12, 19, 20]);
const DEFAULT_WHEEL_MUTATION_POOL = [0, 1, 3, 4, 6, 7, 8, 11, 13, 14, 15, 16, 17, 18, 21];
const MINOR_SUITS = ['Wand', 'Pentacle', 'Cup', 'Sword'];
function randomPick(list, rng) {
    if (!list.length) {
        throw new Error('randomPick called with empty list.');
    }
    const index = Math.max(0, Math.min(list.length - 1, Math.floor(rng() * list.length)));
    return list[index];
}
function cloneCard(card) {
    return { ...card };
}
function createMinorDeck() {
    const deck = [];
    let id = 1;
    for (const suit of MINOR_SUITS) {
        for (let number = 1; number <= 14; number += 1) {
            deck.push({
                id: `minor_${id++}`,
                number,
                suit,
                isArcana: false,
                effectType: 'None'
            });
        }
    }
    return deck;
}
function createMajorDeck() {
    const deck = [];
    for (let number = 0; number <= 21; number += 1) {
        deck.push({
            id: `arcana_${number}`,
            number,
            suit: number === 1 ? 'All' : 'None',
            isArcana: true,
            effectType: number === 21 ? 'World' : number === 20 ? 'Judgment' : number === 0 ? 'Fool' : 'None'
        });
    }
    return deck;
}
function shuffleCards(cards, rng) {
    const out = cards.map(cloneCard);
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}
function cardPowerForSwap(card) {
    if (!card)
        return 0;
    return Number(card.number) || 0;
}
function highestHandIndex(hand) {
    if (!hand.length)
        return 0;
    let maxIdx = 0;
    let maxValue = cardPowerForSwap(hand[0]);
    for (let i = 1; i < hand.length; i += 1) {
        const value = cardPowerForSwap(hand[i]);
        if (value > maxValue) {
            maxValue = value;
            maxIdx = i;
        }
    }
    return maxIdx;
}
export class GameController {
    constructor(options = {}) {
        this.rng = options.rng || Math.random;
        this.evaluator = new HandEvaluator();
        this.forcedFateCard = options.forcedFateCard ? cloneCard(options.forcedFateCard) : null;
        this.forcedDeck = Array.isArray(options.forcedDeck) ? options.forcedDeck.map(cloneCard) : null;
        this.wheelMutationPool = (options.wheelMutationPool && options.wheelMutationPool.length > 0)
            ? options.wheelMutationPool.slice()
            : DEFAULT_WHEEL_MUTATION_POOL.slice();
        const playerOrder = (options.playerIds && options.playerIds.length > 0)
            ? options.playerIds.slice()
            : ['player', 'cpu'];
        this.state = this.createEmptyState(playerOrder);
    }
    createEmptyState(playerOrder) {
        const players = {};
        for (const id of playerOrder) {
            players[id] = {
                id,
                hand: [],
                discard: [],
                folded: false,
                hasBetOrCall: false,
                canFold: true,
                revealHandIndex: null
            };
        }
        const dummyFate = {
            id: 'arcana_dummy',
            number: 0,
            suit: 'None',
            isArcana: true,
            effectType: 'Fool'
        };
        return {
            phase: 'idle',
            players,
            playerOrder,
            deck: [],
            fateCard: dummyFate,
            activeFateCard: dummyFate,
            boardVisible: [],
            boardHiddenRiver: null,
            previewRiverCard: null,
            canUseJudgmentSwap: false,
            pendingFateActionSource: null,
            logs: [],
            showdownResult: null
        };
    }
    log(message) {
        this.state.logs.push(message);
    }
    draw() {
        if (!this.state.deck.length) {
            throw new Error('Deck is empty.');
        }
        const card = this.state.deck.pop();
        if (!card) {
            throw new Error('Deck pop failed.');
        }
        return card;
    }
    activeFateNumber() {
        return Number(this.state.activeFateCard.number);
    }
    shouldRunFateAction() {
        return FATE_ACTION_NUMBERS.has(this.activeFateNumber());
    }
    dealInitialHands() {
        const dealCount = this.activeFateNumber() === 5 ? 3 : 2;
        for (let i = 0; i < dealCount; i += 1) {
            for (const id of this.state.playerOrder) {
                this.state.players[id].hand.push(this.draw());
            }
        }
        this.log(`Preflop deal: ${dealCount} cards each.`);
    }
    revealFlop() {
        for (let i = 0; i < 3; i += 1) {
            this.state.boardVisible.push(this.draw());
        }
        this.log('Flop opened.');
    }
    revealTurnCard() {
        this.state.boardVisible.push(this.draw());
        this.log('Turn opened.');
    }
    revealRiverCard() {
        const river = this.draw();
        if (this.activeFateNumber() === 18) {
            this.state.boardHiddenRiver = river;
            this.log('River is hidden by The Moon.');
            return;
        }
        this.state.boardVisible.push(river);
        this.log('River opened.');
    }
    revealStarExtraCard() {
        this.state.boardVisible.push(this.draw());
        this.log('The Star: extra community card opened.');
    }
    mutateFateByWheel() {
        const n = this.activeFateNumber();
        if (n !== 10)
            return;
        const chosen = randomPick(this.wheelMutationPool, this.rng);
        this.state.activeFateCard = {
            id: `${this.state.fateCard.id}__mutated_${chosen}`,
            number: chosen,
            suit: chosen === 1 ? 'All' : 'None',
            isArcana: true,
            effectType: chosen === 21 ? 'World' : chosen === 20 ? 'Judgment' : chosen === 0 ? 'Fool' : 'None'
        };
        this.log(`Wheel of Fortune mutated into ${chosen}.`);
    }
    getState() {
        return JSON.parse(JSON.stringify(this.state));
    }
    startRound() {
        const baseDeck = this.forcedDeck ? this.forcedDeck.map(cloneCard) : shuffleCards(createMinorDeck(), this.rng);
        const majorDeck = createMajorDeck();
        const fateCard = this.forcedFateCard ? cloneCard(this.forcedFateCard) : cloneCard(randomPick(majorDeck, this.rng));
        this.state = this.createEmptyState(this.state.playerOrder);
        this.state.deck = baseDeck;
        this.state.fateCard = fateCard;
        this.state.activeFateCard = cloneCard(fateCard);
        this.state.phase = 'preflop-bet';
        this.state.canUseJudgmentSwap = false;
        this.state.pendingFateActionSource = null;
        this.dealInitialHands();
        this.log(`Fate card: ${fateCard.number}`);
        return this.getState();
    }
    registerPlayerAction(playerId, action) {
        const player = this.state.players[playerId];
        if (!player) {
            throw new Error(`Unknown player: ${playerId}`);
        }
        if (action === 'fold' && !player.canFold) {
            throw new Error('Fold is locked by The Devil.');
        }
        if (action === 'fold') {
            player.folded = true;
            this.log(`${playerId} folded.`);
            return this.getState();
        }
        if (action === 'bet' || action === 'call' || action === 'raise') {
            player.hasBetOrCall = true;
            if (this.activeFateNumber() === 15) {
                player.canFold = false;
            }
        }
        this.log(`${playerId} action: ${action}`);
        return this.getState();
    }
    completeBettingRound() {
        switch (this.state.phase) {
            case 'preflop-bet':
                this.revealFlop();
                this.state.phase = 'flop-bet';
                return this.getState();
            case 'flop-bet':
                if (this.shouldRunFateAction()) {
                    this.state.phase = 'fate-action';
                    this.state.pendingFateActionSource = 'flop';
                    this.log('Entering Fate Action phase (after flop).');
                    return this.getState();
                }
                this.revealTurnCard();
                this.mutateFateByWheel();
                if (this.shouldRunFateAction()) {
                    this.state.phase = 'fate-action';
                    this.state.pendingFateActionSource = 'turn';
                    this.log('Entering Fate Action phase (after turn mutation).');
                    return this.getState();
                }
                this.state.phase = 'turn-bet';
                return this.getState();
            case 'turn-bet':
                this.revealRiverCard();
                this.state.phase = 'river-bet';
                return this.getState();
            case 'river-bet':
                if (this.activeFateNumber() === 17) {
                    this.revealStarExtraCard();
                    this.state.phase = 'river-bet-2';
                }
                else {
                    this.state.phase = 'showdown';
                }
                return this.getState();
            case 'river-bet-2':
                this.state.phase = 'showdown';
                return this.getState();
            default:
                throw new Error(`Cannot complete betting round in phase: ${this.state.phase}`);
        }
    }
    runFateAction(input = {}) {
        if (this.state.phase !== 'fate-action') {
            throw new Error(`Fate action can only run in fate-action phase. Current: ${this.state.phase}`);
        }
        const fateNumber = this.activeFateNumber();
        if (fateNumber === 2) {
            for (const id of this.state.playerOrder) {
                const idx = input.revealByPlayer?.[id];
                this.state.players[id].revealHandIndex = Number.isFinite(idx) ? idx : null;
            }
            this.log('High Priestess reveal option updated.');
        }
        else if (fateNumber === 9) {
            this.state.previewRiverCard = this.state.deck.length ? cloneCard(this.state.deck[this.state.deck.length - 1]) : null;
            this.log('Hermit previewed the future river card.');
        }
        else if (fateNumber === 12) {
            for (const id of this.state.playerOrder) {
                const player = this.state.players[id];
                if (!player.hand.length || !this.state.deck.length)
                    continue;
                const handIdx = highestHandIndex(player.hand);
                const handCard = player.hand[handIdx];
                const top = this.draw();
                player.hand[handIdx] = top;
                this.state.deck.unshift(handCard);
            }
            this.log('Hanged Man forced highest-card swap.');
        }
        else if (fateNumber === 19) {
            for (const id of this.state.playerOrder) {
                const player = this.state.players[id];
                if (this.state.deck.length) {
                    player.hand.push(this.draw());
                }
                if (!player.hand.length)
                    continue;
                const discardIndexRaw = input.discardByPlayer?.[id];
                const discardIndex = Number.isFinite(discardIndexRaw)
                    ? Math.max(0, Math.min(player.hand.length - 1, Math.floor(discardIndexRaw)))
                    : highestHandIndex(player.hand);
                const discarded = player.hand.splice(discardIndex, 1)[0];
                if (discarded) {
                    player.discard.push(discarded);
                }
            }
            this.log('The Sun resolved draw-then-discard.');
        }
        else if (fateNumber === 20) {
            for (const id of this.state.playerOrder) {
                const player = this.state.players[id];
                if (player.hand.length) {
                    const discardIndexRaw = input.discardByPlayer?.[id];
                    const discardIndex = Number.isFinite(discardIndexRaw)
                        ? Math.max(0, Math.min(player.hand.length - 1, Math.floor(discardIndexRaw)))
                        : highestHandIndex(player.hand);
                    const discarded = player.hand.splice(discardIndex, 1)[0];
                    if (discarded) {
                        player.discard.push(discarded);
                    }
                }
                if (this.state.deck.length) {
                    player.hand.push(this.draw());
                }
            }
            this.state.canUseJudgmentSwap = true;
            this.log('Judgment resolved discard-then-draw. Grave swap enabled for showdown.');
        }
        else if (fateNumber === 5) {
            this.log('Hierophant action phase is a no-op (preflop deal already modified).');
        }
        else {
            this.log('No-op fate action.');
        }
        if (this.state.pendingFateActionSource === 'flop') {
            const wasWheel = this.activeFateNumber() === 10;
            this.revealTurnCard();
            this.mutateFateByWheel();
            if (wasWheel && this.shouldRunFateAction()) {
                this.state.phase = 'fate-action';
                this.state.pendingFateActionSource = 'turn';
                this.log('Entering Fate Action phase (after turn mutation).');
                return this.getState();
            }
            this.state.phase = 'turn-bet';
            this.state.pendingFateActionSource = null;
            return this.getState();
        }
        this.state.phase = 'turn-bet';
        this.state.pendingFateActionSource = null;
        return this.getState();
    }
    resolveShowdown(judgmentSwapCardByPlayer = {}) {
        if (this.state.phase !== 'showdown') {
            throw new Error(`Showdown can only resolve in showdown phase. Current: ${this.state.phase}`);
        }
        if (this.state.boardHiddenRiver) {
            this.state.boardVisible.push(this.state.boardHiddenRiver);
            this.state.boardHiddenRiver = null;
        }
        const board = this.state.boardVisible.map(cloneCard);
        const evaluations = {};
        let winnerIds = [];
        let bestInput = null;
        let bestEval = null;
        for (const id of this.state.playerOrder) {
            const player = this.state.players[id];
            if (player.folded)
                continue;
            if (this.state.canUseJudgmentSwap) {
                const swapId = judgmentSwapCardByPlayer[id];
                if (swapId) {
                    const graveIdx = player.discard.findIndex((card) => card.id === swapId);
                    if (graveIdx >= 0 && player.hand.length > 0) {
                        const graveCard = player.discard.splice(graveIdx, 1)[0];
                        const handIdx = highestHandIndex(player.hand);
                        const handCard = player.hand.splice(handIdx, 1)[0];
                        player.hand.push(graveCard);
                        player.discard.push(handCard);
                    }
                }
            }
            const input = {
                hand: player.hand.map(cloneCard),
                board,
                fateCard: cloneCard(this.state.activeFateCard)
            };
            const evaluation = this.evaluator.evaluateHand(input);
            evaluations[id] = evaluation;
            if (!bestEval || !bestInput) {
                bestEval = evaluation;
                bestInput = input;
                winnerIds = [id];
                continue;
            }
            const cmp = this.evaluator.compareInputs(input, bestInput);
            if (cmp.cmp > 0) {
                bestEval = evaluation;
                bestInput = input;
                winnerIds = [id];
            }
            else if (cmp.cmp === 0) {
                winnerIds.push(id);
            }
        }
        const result = {
            winnerIds,
            evaluations
        };
        this.state.showdownResult = result;
        this.state.phase = 'done';
        this.log(`Showdown resolved. Winners: ${winnerIds.join(', ') || 'none'}`);
        return result;
    }
}
