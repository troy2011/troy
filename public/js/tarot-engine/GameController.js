import { HandEvaluator } from './HandEvaluator.js';
const FATE_ACTION_NUMBERS = new Set([2, 5, 9, 12, 19, 20]);
const DEFAULT_WHEEL_MUTATION_POOL = [0, 1, 3, 4, 6, 7, 8, 11, 13, 14, 15, 16, 17, 18, 21];
const MINOR_SUITS = ['Wand', 'Pentacle', 'Cup', 'Sword'];
const ARCANA_SPECIAL_SUIT = {
    2: 'Cup',
    3: 'Pentacle',
    4: 'Wand',
    5: 'Sword',
    6: 'Cup',
    7: 'Sword',
    8: 'Wand',
    9: 'Pentacle',
    11: 'Sword',
    12: 'Pentacle',
    13: 'Cup',
    14: 'Wand',
    16: 'Sword',
    17: 'Cup',
    18: 'Pentacle',
    19: 'Wand'
};
function randomPick(list, rng) {
    if (!list.length) {
        throw new Error('randomPick: 空リストは選択できません。');
    }
    const index = Math.max(0, Math.min(list.length - 1, Math.floor(rng() * list.length)));
    return list[index];
}
function cloneCard(card) {
    return card ? { ...card } : null;
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
            suit: fateArcanaSuitForNumber(number),
            isArcana: true,
            effectType: number === 21 ? 'World' : number === 20 ? 'Judgment' : number === 0 ? 'Fool' : 'None'
        });
    }
    return deck;
}
function fateArcanaSuitForNumber(number) {
    if (number === 1) return 'All';
    if (ARCANA_SPECIAL_SUIT[number]) return ARCANA_SPECIAL_SUIT[number];
    return 'None';
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
function normalizeDiscardIndex(hand, discardIndexRaw) {
    if (!Array.isArray(hand) || hand.length <= 0) {
        return 0;
    }
    if (Number.isFinite(discardIndexRaw)) {
        return Math.max(0, Math.min(hand.length - 1, Math.floor(discardIndexRaw)));
    }
    return highestHandIndex(hand);
}
function normalizeJudgmentSwapEntry(raw) {
    if (!raw)
        return { graveCardId: null, handCardId: null };
    if (typeof raw === 'string') {
        return { graveCardId: raw, handCardId: null };
    }
    if (typeof raw === 'object') {
        const graveCardId = typeof raw.graveCardId === 'string'
            ? raw.graveCardId
            : (typeof raw.cardId === 'string' ? raw.cardId : null);
        const handCardId = typeof raw.handCardId === 'string' ? raw.handCardId : null;
        return { graveCardId, handCardId };
    }
    return { graveCardId: null, handCardId: null };
}
function findHandIndexByCardId(hand, cardId) {
    if (!Array.isArray(hand) || !hand.length || !cardId)
        return -1;
    return hand.findIndex((card) => card?.id === cardId);
}
export class GameController {
    constructor(options = {}) {
        this.rng = options.rng || Math.random;
        this.evaluator = new HandEvaluator();
        this.enableFateCard = options.enableFateCard !== false;
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
        return {
            phase: 'idle',
            players,
            playerOrder,
            deck: [],
            fateCard: null,
            activeFateCard: null,
            boardVisible: [],
            boardHiddenRiver: null,
            previewRiverCard: null,
            canUseJudgmentSwap: false,
            pendingFateDiscardMode: null,
            pendingFateDiscardPlayers: [],
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
            throw new Error('山札が空です。');
        }
        const card = this.state.deck.pop();
        if (!card) {
            throw new Error('山札からの取得に失敗しました。');
        }
        return card;
    }
    activeFateNumber() {
        const effectNumber = Number(this.state.activeFateCard?.effectNumber);
        if (Number.isFinite(effectNumber)) {
            return effectNumber;
        }
        return Number(this.state.activeFateCard?.number);
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
        this.log(`プリフロップ配札: 各${dealCount}枚`);
    }
    revealFlop() {
        for (let i = 0; i < 3; i += 1) {
            this.state.boardVisible.push(this.draw());
        }
        this.log('フロップを公開。');
    }
    revealTurnCard() {
        this.state.boardVisible.push(this.draw());
        this.log('ターンを公開。');
    }
    revealRiverCard() {
        const river = this.draw();
        if (this.activeFateNumber() === 18) {
            this.state.boardHiddenRiver = river;
            this.log('月の効果: リバーを伏せて進行。');
            return;
        }
        this.state.boardVisible.push(river);
        this.log('リバーを公開。');
    }
    revealStarExtraCard() {
        this.state.boardVisible.push(this.draw());
        this.log('星の効果: 追加の場札を公開。');
    }
    mutateFateByWheel() {
        const n = this.activeFateNumber();
        if (n !== 10)
            return;
        const chosen = randomPick(this.wheelMutationPool, this.rng);
        this.state.activeFateCard = {
            id: `${this.state.fateCard.id}__mutated_${chosen}`,
            number: 10,
            effectNumber: chosen,
            suit: fateArcanaSuitForNumber(chosen),
            isArcana: true,
            effectType: chosen === 21 ? 'World' : chosen === 20 ? 'Judgment' : chosen === 0 ? 'Fool' : 'None'
        };
        this.log(`運命の輪: 効果が ${chosen} に変異（表示は10のまま）。`);
    }
    getState() {
        return JSON.parse(JSON.stringify(this.state));
    }
    startRound() {
        const baseDeck = this.forcedDeck ? this.forcedDeck.map(cloneCard) : shuffleCards(createMinorDeck(), this.rng);
        const majorDeck = createMajorDeck();
        const fateCard = this.enableFateCard
            ? (this.forcedFateCard ? cloneCard(this.forcedFateCard) : cloneCard(randomPick(majorDeck, this.rng)))
            : null;
        this.state = this.createEmptyState(this.state.playerOrder);
        this.state.deck = baseDeck;
        this.state.fateCard = fateCard;
        this.state.activeFateCard = cloneCard(fateCard);
        this.state.phase = 'preflop-bet';
        this.state.canUseJudgmentSwap = false;
        this.state.pendingFateActionSource = null;
        this.dealInitialHands();
        if (fateCard) {
            this.log(`運命カード ${fateCard.number}`);
        } else {
            this.log('大アルカナなしモード');
        }
        return this.getState();
    }
    registerPlayerAction(playerId, action) {
        const player = this.state.players[playerId];
        if (!player) {
            throw new Error(`不明なプレイヤー: ${playerId}`);
        }
        if (action === 'fold' && !player.canFold) {
            throw new Error('悪魔の効果でフォールドできません。');
        }
        if (action === 'fold') {
            player.folded = true;
            this.log(`${playerId}: フォールド`);
            return this.getState();
        }
        if (action === 'bet' || action === 'call' || action === 'raise') {
            player.hasBetOrCall = true;
            if (this.activeFateNumber() === 15) {
                player.canFold = false;
            }
        }
        const actionJa = action === 'check'
            ? 'チェック'
            : action === 'call'
                ? 'コール'
                : action === 'bet'
                    ? 'ベット'
                    : action === 'raise'
                        ? 'レイズ'
                        : action === 'fold'
                            ? 'フォールド'
                            : String(action);
        this.log(`${playerId}: ${actionJa}`);
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
                    this.log('運命アクションフェーズへ移行（フロップ後）。');
                    return this.getState();
                }
                this.revealTurnCard();
                this.mutateFateByWheel();
                if (this.shouldRunFateAction()) {
                    this.state.phase = 'fate-action';
                    this.state.pendingFateActionSource = 'turn';
                    this.log('運命アクションフェーズへ移行（ターン変異後）。');
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
                throw new Error(`このフェーズではベットラウンド完了できません: ${this.state.phase}`);
        }
    }
    runFateAction(input = {}) {
        if (this.state.phase !== 'fate-action') {
            throw new Error(`運命アクションは運命アクションフェーズ（fate-action）のみ実行可能です。現在: ${this.state.phase}`);
        }
        const fateNumber = this.activeFateNumber();
        if (fateNumber === 2) {
            for (const id of this.state.playerOrder) {
                const idx = input.revealByPlayer?.[id];
                this.state.players[id].revealHandIndex = Number.isFinite(idx) ? idx : null;
            }
            this.log('女教皇: 公開オプションを更新。');
        }
        else if (fateNumber === 9) {
            // Hermit always previews the river card (5th community card).
            // Deck top is at the end because draw() uses pop().
            // - After flop fate-action: next draw is turn, so river is 2nd from top.
            // - After turn mutation fate-action: next draw is river, so river is top.
            const source = this.state.pendingFateActionSource;
            const offset = source === 'flop' ? 2 : 1;
            const idx = this.state.deck.length - offset;
            this.state.previewRiverCard = idx >= 0 ? cloneCard(this.state.deck[idx]) : null;
            this.log('隠者: 未来のリバーカードを予見。');
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
            this.log('吊るされた男: 最高数値カードを強制交換。');
        }
        else if (fateNumber === 19) {
            const pending = new Set();
            const hasPendingSun = this.state.pendingFateDiscardMode === 'sun';
            const pendingFromState = hasPendingSun
                ? new Set(Array.isArray(this.state.pendingFateDiscardPlayers) ? this.state.pendingFateDiscardPlayers : [])
                : null;
            this.state.pendingFateDiscardMode = 'sun';
            for (const id of this.state.playerOrder) {
                if (hasPendingSun && pendingFromState && !pendingFromState.has(id)) {
                    continue;
                }
                const player = this.state.players[id];
                if (!hasPendingSun && this.state.deck.length) {
                    player.hand.push(this.draw());
                }
                if (!player.hand.length)
                    continue;
                const discardIndexRaw = input.discardByPlayer?.[id];
                const allowPlayerChoice = input.allowPlayerChoice !== false;
                const waitForPlayerChoice = id === 'player' && allowPlayerChoice && !Number.isFinite(discardIndexRaw);
                if (waitForPlayerChoice) {
                    pending.add(id);
                    continue;
                }
                const discardIndex = normalizeDiscardIndex(player.hand, discardIndexRaw);
                const discarded = player.hand.splice(discardIndex, 1)[0];
                if (discarded) {
                    player.discard.push(discarded);
                }
            }
            this.state.pendingFateDiscardPlayers = Array.from(pending);
            if (this.state.pendingFateDiscardPlayers.length > 0) {
                this.log('太陽: プレイヤーの捨て札選択待ち。');
                return this.getState();
            }
            this.state.pendingFateDiscardMode = null;
            this.state.pendingFateDiscardPlayers = [];
            this.log('太陽: 引いてから捨てる処理を解決。');
        }
        else if (fateNumber === 20) {
            const pending = new Set();
            const hasPendingJudgment = this.state.pendingFateDiscardMode === 'judgment';
            const pendingFromState = hasPendingJudgment
                ? new Set(Array.isArray(this.state.pendingFateDiscardPlayers) ? this.state.pendingFateDiscardPlayers : [])
                : null;
            this.state.pendingFateDiscardMode = 'judgment';
            for (const id of this.state.playerOrder) {
                if (hasPendingJudgment && pendingFromState && !pendingFromState.has(id)) {
                    continue;
                }
                const player = this.state.players[id];
                const discardIndexRaw = input.discardByPlayer?.[id];
                const allowPlayerChoice = input.allowPlayerChoice !== false;
                const waitForPlayerChoice = id === 'player'
                    && player.hand.length > 0
                    && allowPlayerChoice
                    && !Number.isFinite(discardIndexRaw);
                if (waitForPlayerChoice) {
                    pending.add(id);
                    continue;
                }
                if (player.hand.length) {
                    const discardIndex = normalizeDiscardIndex(player.hand, discardIndexRaw);
                    const discarded = player.hand.splice(discardIndex, 1)[0];
                    if (discarded) {
                        player.discard.push(discarded);
                    }
                }
                if (this.state.deck.length) {
                    player.hand.push(this.draw());
                }
            }
            this.state.pendingFateDiscardPlayers = Array.from(pending);
            if (this.state.pendingFateDiscardPlayers.length > 0) {
                this.log('審判: プレイヤーの捨て札選択待ち。');
                return this.getState();
            }
            this.state.pendingFateDiscardMode = null;
            this.state.pendingFateDiscardPlayers = [];
            this.state.canUseJudgmentSwap = true;
            this.log('審判: 捨てて引く処理を解決。ショーダウンで墓地交換可能。');
        }
        else if (fateNumber === 5) {
            this.log('法王: 追加アクションなし（配札時に反映済み）。');
        }
        else {
            this.log('運命アクションなし。');
        }
        if (this.state.pendingFateActionSource === 'flop') {
            const wasWheel = this.activeFateNumber() === 10;
            this.revealTurnCard();
            this.mutateFateByWheel();
            if (wasWheel && this.shouldRunFateAction()) {
                this.state.phase = 'fate-action';
                this.state.pendingFateActionSource = 'turn';
                this.log('運命アクションフェーズへ移行（ターン変異後）。');
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
            throw new Error(`ショーダウンはショーダウンフェーズ（showdown）のみ実行可能です。現在: ${this.state.phase}`);
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
                const swapEntry = normalizeJudgmentSwapEntry(judgmentSwapCardByPlayer[id]);
                const swapId = swapEntry.graveCardId;
                if (swapId) {
                    const graveIdx = player.discard.findIndex((card) => card.id === swapId);
                    if (graveIdx >= 0 && player.hand.length > 0) {
                        const graveCard = player.discard.splice(graveIdx, 1)[0];
                        const handIdxById = findHandIndexByCardId(player.hand, swapEntry.handCardId);
                        const handIdx = handIdxById >= 0 ? handIdxById : highestHandIndex(player.hand);
                        const handCard = player.hand.splice(handIdx, 1)[0];
                        player.hand.push(graveCard);
                        player.discard.push(handCard);
                    }
                }
            }
            const input = {
                hand: player.hand.map(cloneCard),
                board,
                fateCard: this.state.activeFateCard ? cloneCard(this.state.activeFateCard) : undefined
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
        this.log(`ショーダウン解決。勝者: ${winnerIds.join(', ') || 'なし'}`);
        return result;
    }
}
