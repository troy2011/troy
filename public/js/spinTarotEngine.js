import { SPIN_TAROT_CONFIG, SPIN_TAROT_MAJOR_ARCANA, SPIN_TAROT_SPRITE_CONFIG } from './spinTarotConfig.js';

const SUIT_KEYS = SPIN_TAROT_CONFIG.suits.map((suit) => suit.key);
const HORIZONTAL_LINE_IDS = new Set(['top', 'mid', 'bot']);
const HAND_STRENGTH = {
    Miss: 0,
    OnePair: 1,
    TwoPair: 2,
    ThreeKind: 3,
    Straight: 4,
    Flush: 5,
    FullHouse: 6,
    FourKindLow: 7,
    FourKindHigh: 8,
    StraightFlush: 9,
    RoyalStraightFlush: 10
};

const CARD_POOL = buildCardPool(SPIN_TAROT_CONFIG);
const POKER_STRAIGHTS = [
    [10, 11, 12, 13, 1],
    [9, 10, 11, 12, 13],
    [8, 9, 10, 11, 12],
    [7, 8, 9, 10, 11],
    [6, 7, 8, 9, 10],
    [5, 6, 7, 8, 9],
    [4, 5, 6, 7, 8],
    [3, 4, 5, 6, 7],
    [2, 3, 4, 5, 6],
    [1, 2, 3, 4, 5]
];

export function getSpinTarotConfig() {
    return SPIN_TAROT_CONFIG;
}

export function getMajorArcana(number) {
    return SPIN_TAROT_MAJOR_ARCANA[Number(number)] || SPIN_TAROT_MAJOR_ARCANA[1];
}

export function getSpriteStyle(index) {
    const safeIndex = Math.max(0, Number(index) || 0);
    const cols = Math.floor(SPIN_TAROT_SPRITE_CONFIG.sheetWidth / SPIN_TAROT_SPRITE_CONFIG.tileWidth);
    const x = (safeIndex % cols) * SPIN_TAROT_SPRITE_CONFIG.tileWidth;
    const y = Math.floor(safeIndex / cols) * SPIN_TAROT_SPRITE_CONFIG.tileHeight;
    return {
        backgroundImage: `url('${SPIN_TAROT_SPRITE_CONFIG.src}')`,
        backgroundSize: `${SPIN_TAROT_SPRITE_CONFIG.sheetWidth}px ${SPIN_TAROT_SPRITE_CONFIG.sheetHeight}px`,
        backgroundPosition: `-${x}px -${y}px`
    };
}

export function getCardSpriteIndex(card) {
    if (!card || card.kind === 'blank') return SPIN_TAROT_SPRITE_CONFIG.backIndex;
    if (card.kind === 'major') return SPIN_TAROT_SPRITE_CONFIG.majorArcanaOffset + Number(card.number || 0);
    const number = Math.max(1, Math.min(13, Number(card.rank || card.number || 1))) - 1;
    if (card.suit === 'Wand') return number;
    if (card.suit === 'Pentacle') return 20 + number;
    if (card.suit === 'Cup') return 40 + number;
    if (card.suit === 'Sword') return 60 + number;
    return SPIN_TAROT_SPRITE_CONFIG.backIndex;
}

export function getCardFace(card) {
    if (!card || card.kind === 'blank') return '▒';
    if (card.isWild) return 'W';
    const rank = Number(card.rank || 0);
    if (rank === 1) return 'A';
    if (rank === 11) return 'J';
    if (rank === 12) return 'Q';
    if (rank === 13) return 'K';
    return String(rank || '?');
}

export function getCardText(card) {
    if (!card || card.kind === 'blank') return '待機';
    if (card.isWild) return 'WILD';
    return `${getSuitMeta(card.suit)?.icon || '🃏'} ${getCardFace(card)}`;
}

export function getSpinTarotStatusView(state, config = SPIN_TAROT_CONFIG) {
    const progression = config.progression || {};
    const queenGaugeMax = Math.max(1, Number(progression.queenModeThreshold || 48));
    const kingGaugeMax = Math.max(1, Number(progression.kingModeThreshold || 48));
    const omenGaugeMax = Math.max(1, Number(progression.omenGaugeMax || 100));
    const czThreshold = Math.max(1, Number(progression.czThreshold || omenGaugeMax));
    const omenGauge = clamp(Number(state?.omenGauge) || 0, 0, omenGaugeMax);
    const queenGauge = clamp(Number(state?.queenGauge) || 0, 0, queenGaugeMax);
    const kingGauge = clamp(Number(state?.kingGauge) || 0, 0, kingGaugeMax);
    const arcanaCycle = Math.max(1, Number(config?.majorArcana?.changeEverySpins) || 5);
    const spinsUntilArcanaShift = Math.max(1, arcanaCycle - (Math.max(0, Number(state?.spinCount) || 0) % arcanaCycle));
    let modeKey = String(state?.mode || 'normal');
    let modeLabel = '通常';
    let modeIcon = '🌊';
    let modeTurns = 0;

    if (state?.gameOver) {
        modeKey = 'gameover';
        modeLabel = '城壁崩壊';
        modeIcon = '💀';
    } else if (state?.battle) {
        modeKey = state.battle.isBoss ? 'boss' : 'battle';
        modeLabel = state.battle.isBoss ? '超強敵防衛戦' : '防衛戦';
        modeIcon = '⚔️';
    } else if (state?.premium?.type === 'treasure') {
        modeKey = 'treasure';
        modeLabel = state.premium.label || '宝島';
        modeIcon = '🎁';
        modeTurns = Math.max(0, Number(state.premium.spinsRemaining) || 0);
    } else if (modeKey === 'cz') {
        modeLabel = '防衛準備CZ';
        modeIcon = '🎯';
        modeTurns = Math.max(0, Number(state.modeSpinsRemaining) || 0);
    } else if (modeKey === 'high') {
        modeLabel = '高確';
        modeIcon = '⚡';
    } else if (modeKey === 'hint') {
        modeLabel = '前兆';
        modeIcon = '🔮';
    } else if (state?.queenModeSpins > 0 && state?.kingModeSpins > 0) {
        modeKey = 'dual-rush';
        modeLabel = '双冠加護';
        modeIcon = '👑';
    } else if (state?.queenModeSpins > 0) {
        modeKey = 'queen-rush';
        modeLabel = '星告の加護';
        modeIcon = '👑';
    } else if (state?.kingModeSpins > 0) {
        modeKey = 'king-rush';
        modeLabel = '王権ラッシュ';
        modeIcon = '🦁';
    }

    return {
        modeKey,
        modeLabel,
        modeIcon,
        modeTurns,
        omenGauge,
        omenGaugeMax,
        nextCzIn: modeKey === 'cz' ? 0 : Math.max(0, czThreshold - omenGauge),
        queenGauge,
        queenGaugeMax,
        nextQueenIn: Math.max(0, queenGaugeMax - queenGauge),
        kingGauge,
        kingGaugeMax,
        nextKingIn: Math.max(0, kingGaugeMax - kingGauge),
        queenModeSpins: Math.max(0, Number(state?.queenModeSpins) || 0),
        kingModeSpins: Math.max(0, Number(state?.kingModeSpins) || 0),
        missStreak: Math.max(0, Number(state?.missStreak) || 0),
        treasureCooldownSpins: Math.max(0, Number(state?.treasureCooldownSpins) || 0),
        czPower: Math.max(0, Number(state?.czPower) || 0),
        czTarget: Math.max(1, Number(progression.czTarget) || 100),
        spinsUntilArcanaShift
    };
}

export function createInitialState(config = SPIN_TAROT_CONFIG) {
    const zone = pickZone(config);
    const currentArcana = rollMajorArcana(config, 'normal', config.kingdomRank.minRank);
    return {
        version: 2,
        board: createBlankBoard(config),
        holdMask: Array(config.board.reels).fill(false),
        lockedHolds: Array(config.board.reels).fill(false),
        phase: 'deal',
        mode: 'normal',
        modeSpinsRemaining: 0,
        deck: [],
        coins: config.startingResources.coins,
        totalPayout: 0,
        lastBetCost: 0,
        betIndex: 0,
        activeLineCount: config.lineSelection?.defaultActiveLines || config.board.paylines.length,
        spinCount: 0,
        turnCount: 0,
        castleHp: config.startingResources.castleHp,
        castleMaxHp: config.startingResources.castleMaxHp,
        population: 18,
        knights: 2,
        bishops: 0,
        mages: 0,
        queenGauge: 0,
        kingGauge: 0,
        rankGauge: 0,
        nationRank: config.kingdomRank.minRank,
        zone,
        battle: null,
        premium: null,
        currentArcana,
        pendingArcanaChoices: null,
        treasureCooldownSpins: 0,
        omenGauge: 0,
        czPower: 0,
        missStreak: 0,
        queenModeSpins: 0,
        kingModeSpins: 0,
        pendingGuaranteeRole: null,
        pendingSuitFilter: null,
        confuseTurns: 0,
        preAlert: false,
        attackMultiplier: 1,
        lineResults: [],
        lineSummaries: [],
        lastDefenseActions: [],
        lastCutin: null,
        lastOutcome: null,
        lastEffects: [],
        lastAttackDamage: 0,
        lastEnemyDamage: 0,
        lastTreasureCoins: 0,
        omenBreak: false,
        previewSuit: rollPreviewSuit(),
        logs: [
            `新しい遠征開始。次の襲来は ${zone.label} ${zone.spinsRemaining}G。`,
            `${currentArcana.label} が中央に灯った。`,
            'BET と有効ラインを決めて DEAL。'
        ],
        gameOver: false
    };
}

export function cloneState(state) {
    return {
        ...state,
        board: state.board.map((row) => row.map(cloneCard)),
        holdMask: state.holdMask.slice(),
        lockedHolds: state.lockedHolds.slice(),
        deck: Array.isArray(state.deck) ? state.deck.map((card) => cloneCard(card)) : [],
        zone: state.zone ? { ...state.zone } : null,
        battle: state.battle ? { ...state.battle } : null,
        premium: state.premium ? { ...state.premium } : null,
        currentArcana: state.currentArcana ? { ...state.currentArcana } : null,
        pendingArcanaChoices: Array.isArray(state.pendingArcanaChoices) ? state.pendingArcanaChoices.map((arcana) => ({ ...arcana })) : null,
        treasureCooldownSpins: Math.max(0, Number(state.treasureCooldownSpins) || 0),
        lineResults: Array.isArray(state.lineResults) ? state.lineResults.map((item) => ({ ...item, coords: item.coords?.map((coord) => ({ ...coord })) || [] })) : [],
        lineSummaries: Array.isArray(state.lineSummaries) ? state.lineSummaries.slice() : [],
        lastDefenseActions: Array.isArray(state.lastDefenseActions) ? state.lastDefenseActions.map((item) => ({ ...item })) : [],
        lastCutin: state.lastCutin ? { ...state.lastCutin } : null,
        lastEffects: Array.isArray(state.lastEffects) ? state.lastEffects.slice() : [],
        logs: Array.isArray(state.logs) ? state.logs.slice() : []
    };
}

export function setBetIndex(state, betIndex, config = SPIN_TAROT_CONFIG) {
    const next = cloneState(state);
    if (next.phase === 'hold') return next;
    next.betIndex = clamp(Number(betIndex) || 0, 0, config.betLevels.length - 1);
    return next;
}

export function setActiveLineCount(state, activeLineCount, config = SPIN_TAROT_CONFIG) {
    const next = cloneState(state);
    if (next.phase === 'hold') return next;
    next.activeLineCount = normalizeActiveLineCount(activeLineCount, config);
    return next;
}

export function stepActiveLineCount(state, direction, config = SPIN_TAROT_CONFIG) {
    const next = cloneState(state);
    if (next.phase === 'hold') return next;
    const choices = getLineChoices(config);
    const current = normalizeActiveLineCount(next.activeLineCount, config);
    const currentIndex = Math.max(0, choices.indexOf(current));
    const step = Number(direction) >= 0 ? 1 : -1;
    next.activeLineCount = choices[clamp(currentIndex + step, 0, choices.length - 1)];
    return next;
}

export function getLineChoices(config = SPIN_TAROT_CONFIG) {
    return getAllowedLineCounts(config);
}

export function toggleHold(state, column, config = SPIN_TAROT_CONFIG) {
    const next = cloneState(state);
    if (next.phase !== 'hold') return next;
    const reel = clamp(Number(column) || 0, 0, config.board.reels - 1);
    if (next.lockedHolds[reel]) return next;
    const centerCard = next.board[1]?.[reel];
    if (!centerCard || centerCard.kind === 'blank') return next;
    next.holdMask[reel] = !next.holdMask[reel];
    syncHoldPreview(next, config);
    pushLog(next, `${reel + 1}列目を ${next.holdMask[reel] ? 'HOLD' : '解除'}。`, config);
    return next;
}

export function startNewRun(config = SPIN_TAROT_CONFIG) {
    return createInitialState(config);
}

export function chooseArcana(state, choiceIndex, config = SPIN_TAROT_CONFIG) {
    const next = cloneState(state);
    if (!Array.isArray(next.pendingArcanaChoices) || !next.pendingArcanaChoices.length) return next;
    const picked = next.pendingArcanaChoices[clamp(Number(choiceIndex) || 0, 0, next.pendingArcanaChoices.length - 1)];
    if (!picked) return next;
    next.currentArcana = { ...picked };
    next.pendingArcanaChoices = null;
    next.lastCutin = buildCutin(picked.number, `${picked.label} を継承`);
    next.lastEffects = [`ARCANA SHIFT: ${picked.label}`];
    pushLog(next, `${picked.label} を選択。`, config);
    return next;
}

export function getBetInfo(state, config = SPIN_TAROT_CONFIG) {
    return config.betLevels[state.betIndex] || config.betLevels[0];
}

export function getDealCost(state, config = SPIN_TAROT_CONFIG) {
    const betInfo = getBetInfo(state, config);
    return Number(betInfo.cost || 0) * Number(state.activeLineCount || config.lineSelection?.defaultActiveLines || 1);
}

export function canSpin(state, config = SPIN_TAROT_CONFIG) {
    if (state.gameOver) return false;
    if (Array.isArray(state.pendingArcanaChoices) && state.pendingArcanaChoices.length) return false;
    if (state.phase === 'hold') return true;
    return state.coins >= getDealCost(state, config);
}

export function performSpin(currentState, config = SPIN_TAROT_CONFIG) {
    const state = cloneState(currentState);
    const betInfo = getBetInfo(state, config);
    if (state.gameOver) {
        return { ok: false, state, reason: 'game-over' };
    }
    if (Array.isArray(state.pendingArcanaChoices) && state.pendingArcanaChoices.length) {
        return { ok: false, state, reason: 'arcana-choice-pending' };
    }
    const events = {
        preAlert: false,
        cutin: null,
        notes: []
    };

    if (state.phase !== 'hold') {
        const dealCost = getDealCost(state, config);
        if (state.coins < dealCost) {
            pushLog(state, 'コイン不足で DEAL できない。', config);
            return { ok: false, state, reason: 'coin-shortage' };
        }
        state.coins -= dealCost;
        state.lastBetCost = dealCost;
        state.totalPayout = 0;
        state.lastAttackDamage = 0;
        state.lastEnemyDamage = 0;
        state.lastTreasureCoins = 0;
        state.attackMultiplier = 1;
        state.lineResults = [];
        state.lineSummaries = [];
        state.lastDefenseActions = [];
        state.lastEffects = [];
        state.lastCutin = null;
        state.omenBreak = false;
        state.preAlert = false;
        state.holdMask = Array(config.board.reels).fill(false);
        state.deck = createShuffledDeck(config);
        state.board = dealOpeningBoard(state, config);
        // fool arcana makes center tile wild immediately
        if (state.currentArcana?.foolWild) {
            const center = Math.floor((config.board.reels || 5) / 2);
            state.board[1][center] = { kind: 'minor', suit: 'Wand', rank: 0, isWild: true };
            pushLog(state, '愚者の力で中央がワイルドになった！', config);
        }
        state.phase = 'hold';
        pushLog(state, `DEAL ${dealCost} 枚。中央ラインに配札。`, config);
        events.notes.push('dealt');
        return { ok: true, state, events };
    }

    state.spinCount += 1;
    state.turnCount += 1;
    state.totalPayout = 0;
    state.lastAttackDamage = 0;
    state.lastEnemyDamage = 0;
    state.lastTreasureCoins = 0;
    state.attackMultiplier = 1;
    state.lineResults = [];
    state.lineSummaries = [];
    state.lastDefenseActions = [];
    state.lastEffects = [];
    state.lastCutin = null;
    state.omenBreak = false;
    state.preAlert = shouldTriggerPreAlert(state, config);
    events.preAlert = state.preAlert;

    maybeStartPremium(state, config, events);

    if (triggerFreezeIfNeeded(state, config, betInfo, events)) {
        state.phase = 'deal';
        state.deck = [];
        state.holdMask = Array(config.board.reels).fill(false);
        finalizePostSpinState(state, config);
        return { ok: true, state, events };
    }

    const drawOptions = buildDrawOptions(state, config);
    state.board = spinBoard(state, config, drawOptions);

    let evaluation = evaluateBoard(state.board, state, config, betInfo);

    // world arcana generates an automatic jackpot / victory
    if (state.currentArcana?.worldJackpot) {
        // ensure royal straight flush if not present
        if (!evaluation.hasRole || evaluation.bestStrength < HAND_STRENGTH.RoyalStraightFlush) {
            state.board = buildRoyalStraightFlushBoard(config);
            evaluation = evaluateBoard(state.board, state, config, betInfo);
        }
        const bonus = Math.floor(1000 * Number(betInfo.cost || 1));
        state.coins += bonus;
        state.totalPayout += bonus;
        state.nationRank = config.kingdomRank.maxRank;
        state.lastEffects.push('世界ジャックポットが発動！');
        events.notes.push('world-jackpot');
    }

    if (!evaluation.hasRole && state.currentArcana?.redrawOnMiss) {
        state.board = spinBoard(state, config, drawOptions);
        evaluation = evaluateBoard(state.board, state, config, betInfo);
        state.lastEffects.push('運命の輪が再抽選を発動');
        events.notes.push('wheel-redraw');
    }

    if (!evaluation.hasRole && hasHeldRank(state, config.minorArcana.mysteryWild.holdRank)) {
        state.board = applyMysteryWild(state.board, state);
        evaluation = evaluateBoard(state.board, state, config, betInfo);
        if (evaluation.hasRole) {
            state.lastEffects.push('2の逆転がワイルド化');
            events.notes.push('mystery-wild');
        }
    }

    if (!evaluation.hasRole && hasHeldRank(state, config.minorArcana.skipNudge.holdRank)) {
        const nudgeResult = applySkipNudge(state.board, state, config, drawOptions);
        state.board = nudgeResult.board;
        evaluation = evaluateBoard(state.board, state, config, betInfo);
        if (evaluation.hasRole) {
            state.lastEffects.push(`5のスキップで ${nudgeResult.detail}`);
            events.notes.push('skip-nudge');
        }
    }

    if (state.pendingGuaranteeRole === 'TwoPair' && evaluation.bestStrength < HAND_STRENGTH.TwoPair) {
        forceGuaranteedTwoPair(state, config, drawOptions);
        evaluation = evaluateBoard(state.board, state, config, betInfo);
        state.lastEffects.push('吊るされた男の保証が発動');
        events.notes.push('guarantee-two-pair');
    }
    state.pendingGuaranteeRole = null;

    if (hasHeldRank(state, config.minorArcana.cascade.holdRank)) {
        const cascadeResult = applyCascade(state.board, state, evaluation, config, drawOptions, betInfo);
        state.board = cascadeResult.board;
        state.attackMultiplier = cascadeResult.multiplier;
        evaluation = cascadeResult.evaluation;
        if (cascadeResult.destroyedCount > 0) {
            state.lastEffects.push(`8の破壊で ${cascadeResult.destroyedCount} 枚破壊`);
            events.notes.push('cascade');
        }
    }

    const omenSuit = state.battle?.suitKey || state.previewSuit;
    const dominantSuit = getDominantSuit(state.board);
    if (evaluation.hasRole && omenSuit && dominantSuit && dominantSuit !== omenSuit) {
        state.omenBreak = true;
        state.attackMultiplier *= 1.3;
        evaluation.totalPayout = Math.floor(evaluation.totalPayout * 1.4);
        state.lastEffects.push('法則崩れが発生');
        events.notes.push('omen-break');
    }

    state.lineResults = evaluation.lineResults;
    state.lineSummaries = evaluation.lineResults
        .filter((line) => line.kind !== 'Miss')
        .map((line) => `${line.label}:${line.roleLabel}`);
    state.totalPayout = evaluation.totalPayout;
    state.coins += state.totalPayout;

    applyCourtGrowth(state, evaluation, config, betInfo);
    resolveArcanaOnWin(state, evaluation, config, betInfo);
    resolveRushModeBonuses(state, evaluation, config, betInfo);
    resolveBattleAndProgress(state, evaluation, config, betInfo, events);

    if (!state.battle && !state.premium && !events.notes.includes('battle-ended')) {
        advanceZone(state, config, events);
    }

    applySpinFlowProgress(state, evaluation, config, events);

    if (!state.battle && !state.premium && state.spinCount % config.majorArcana.changeEverySpins === 0) {
        state.pendingArcanaChoices = buildArcanaChoices(state, config);
        pushLog(state, '次の大アルカナを選択。', config);
        if (!events.cutin) {
            events.cutin = buildCutin(state.currentArcana.number, '次の大アルカナを選択');
        }
    }

    state.phase = 'deal';
    state.deck = [];
    state.holdMask = Array(config.board.reels).fill(false);
    finalizePostSpinState(state, config);
    return { ok: true, state, events };
}

export function describeEnemy(enemy) {
    if (!enemy) return '平穏';
    return `${enemy.emoji} ${enemy.label}`;
}

function buildCardPool(config) {
    const pool = [];
    config.suits.forEach((suit) => {
        for (const rank of config.deck?.ranks || []) {
            pool.push({
                suit: suit.key,
                rank,
                weight: Number(config.rankWeights[rank] || 1) * Number(suit.weight || 1)
            });
        }
    });
    return pool;
}

function buildDrawOptions(state, config) {
    const currentArcana = getMajorArcana(state.currentArcana?.number);
    const suitFilter = Array.isArray(state.pendingSuitFilter) && state.pendingSuitFilter.length
        ? state.pendingSuitFilter.slice()
        : Array.isArray(currentArcana.suitFilter) && currentArcana.suitFilter.length
            ? currentArcana.suitFilter.slice()
            : null;
    return {
        suitFilter,
        config,
        state
    };
}

function createOpeningBoard(config, drawOptions = null) {
    const board = createBlankBoard(config);
    for (let reel = 0; reel < config.board.reels; reel += 1) {
        board[1][reel] = drawCard(drawOptions || { config });
    }
    return board;
}

function createShuffledDeck(config) {
    const deck = CARD_POOL.map((card) => createMinorCard(card.suit, card.rank));
    for (let index = deck.length - 1; index > 0; index -= 1) {
        const swapIndex = randomInt(0, index);
        [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
    }
    return deck;
}

function dealOpeningBoard(state, config) {
    const board = createBlankBoard(config);
    const drawOptions = buildDrawOptions(state, config);
    for (let reel = 0; reel < config.board.reels; reel += 1) {
        board[1][reel] = drawCard(drawOptions);
    }
    state.board = board;
    syncHoldPreview(state, config);
    return state.board;
}

function createBlankBoard(config) {
    return Array.from({ length: config.board.rows }, () => Array.from({ length: config.board.reels }, () => createBlankCard()));
}

function buildRoyalStraightFlushBoard(config) {
    // put a royal straight flush on the center row, suit chosen arbitrarily
    const board = createBlankBoard(config);
    const suit = config.suits[0]?.key || 'Wand';
    const ranks = [10, 11, 12, 13, 1];
    for (let reel = 0; reel < config.board.reels; reel += 1) {
        board[1][reel] = createMinorCard(suit, ranks[reel % ranks.length]);
    }
    return board;
}

function createBlankCard() {
    return { kind: 'blank', suit: 'None', rank: 0 };
}

function cloneCard(card) {
    return card ? { ...card } : createBlankCard();
}

function createMinorCard(suit, rank, extra = {}) {
    return {
        kind: 'minor',
        suit,
        rank,
        ...extra
    };
}

function drawCard(options = {}) {
    const config = options.config || SPIN_TAROT_CONFIG;
    const state = options.state || null;
    if (state && Array.isArray(state.deck) && state.deck.length > 0) {
        const matchIndex = findDeckCardIndex(state.deck, options);
        if (matchIndex >= 0) {
            const [picked] = state.deck.splice(matchIndex, 1);
            return cloneCard(picked);
        }
        const [picked] = state.deck.splice(0, 1);
        return cloneCard(picked);
    }
    const suitFilter = Array.isArray(options.suitFilter) && options.suitFilter.length
        ? new Set(options.suitFilter)
        : null;
    const pool = CARD_POOL.filter((card) => !suitFilter || suitFilter.has(card.suit));
    const pick = weightedPick(pool);
    return createMinorCard(pick.suit, pick.rank);
}

function drawSpecificCard(options = {}, criteria = {}) {
    const state = options.state || null;
    if (!state || !Array.isArray(state.deck) || state.deck.length === 0) {
        return null;
    }
    const targetRanks = Array.isArray(criteria.ranks) ? new Set(criteria.ranks.map((rank) => Number(rank))) : null;
    const targetSuits = Array.isArray(criteria.suits) ? new Set(criteria.suits) : null;
    const index = state.deck.findIndex((card) => {
        if (!card || card.kind === 'blank') return false;
        if (targetRanks && !targetRanks.has(Number(card.rank || 0))) return false;
        if (targetSuits && !targetSuits.has(card.suit)) return false;
        return true;
    });
    if (index < 0) return null;
    const [picked] = state.deck.splice(index, 1);
    return cloneCard(picked);
}

function findDeckCardIndex(deck, options = {}) {
    const suitFilter = Array.isArray(options.suitFilter) && options.suitFilter.length
        ? new Set(options.suitFilter)
        : null;
    return deck.findIndex((card) => !suitFilter || suitFilter.has(card.suit));
}

function weightedPick(entries) {
    const total = entries.reduce((sum, entry) => sum + Number(entry.weight || 0), 0);
    const threshold = Math.random() * total;
    let cursor = 0;
    for (const entry of entries) {
        cursor += Number(entry.weight || 0);
        if (cursor >= threshold) return entry;
    }
    return entries[entries.length - 1];
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getAllowedLineCounts(config) {
    const configured = Array.isArray(config.lineSelection?.allowedCounts) && config.lineSelection.allowedCounts.length
        ? config.lineSelection.allowedCounts
        : null;
    const counts = configured
        ? configured
        : Array.from(
            { length: (config.lineSelection?.maxActiveLines || config.board.paylines.length) - (config.lineSelection?.minActiveLines || 1) + 1 },
            (_, index) => (config.lineSelection?.minActiveLines || 1) + index
        );
    return Array.from(new Set(
        counts
            .map((value) => clamp(Number(value) || 0, config.lineSelection?.minActiveLines || 1, config.lineSelection?.maxActiveLines || config.board.paylines.length))
            .filter((value) => value >= 1 && value <= config.board.paylines.length)
    )).sort((left, right) => left - right);
}

function normalizeActiveLineCount(activeLineCount, config) {
    const choices = getAllowedLineCounts(config);
    const requested = Number(activeLineCount) || config.lineSelection?.defaultActiveLines || choices[choices.length - 1];
    let closest = choices[0];
    let smallestGap = Math.abs(closest - requested);
    choices.forEach((value) => {
        const gap = Math.abs(value - requested);
        if (gap < smallestGap || (gap === smallestGap && value > closest)) {
            closest = value;
            smallestGap = gap;
        }
    });
    return closest;
}

function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function getRankStrength(rank) {
    const numericRank = Number(rank || 0);
    return numericRank === 1 ? 14 : numericRank;
}

function getRankOrder(config = SPIN_TAROT_CONFIG) {
    return (config.deck?.ranks || [])
        .slice()
        .sort((left, right) => getRankStrength(right) - getRankStrength(left));
}

function isHighRank(rank) {
    const numericRank = Number(rank || 0);
    return numericRank === 1 || numericRank >= 11;
}

function isRoyalGrowthRank(rank) {
    const numericRank = Number(rank || 0);
    return numericRank === 1 || numericRank >= 11;
}

function chance(probability) {
    return Math.random() < Number(probability || 0);
}

function pickZone(config) {
    const entries = Object.entries(config.zones).map(([key, zone]) => ({
        key,
        label: zone.label,
        weight: zone.probability,
        minSpins: zone.minSpins,
        maxSpins: zone.maxSpins
    }));
    const picked = weightedPick(entries);
    const spins = randomInt(picked.minSpins, picked.maxSpins);
    return {
        key: picked.key,
        label: picked.label,
        totalSpins: spins,
        spinsRemaining: spins
    };
}

function rollPreviewSuit() {
    return SUIT_KEYS[randomInt(0, SUIT_KEYS.length - 1)];
}

function rollMajorArcana(config, mode, nationRank) {
    let pool = config.majorArcana.normalPool.slice();
    if (mode === 'battle') {
        const tier = getRankTier(config, nationRank);
        pool = config.majorArcana.battlePoolByTier[tier] || pool;
    }
    if (mode === 'freeze') {
        pool = config.majorArcana.freezePool.slice();
    }
    const number = pool[randomInt(0, pool.length - 1)];
    const meta = getMajorArcana(number);
    return {
        number,
        label: `${number}. ${meta.name}`,
        icon: meta.icon,
        summary: meta.summary,
        ...meta
    };
}

function buildArcanaChoices(state, config) {
    const currentNumber = Number(state.currentArcana?.number || 1);
    const keepArcana = state.currentArcana ? { ...state.currentArcana } : rollMajorArcana(config, 'normal', state.nationRank);
    let challenger = rollMajorArcana(config, 'normal', state.nationRank);
    let guard = 0;
    while (challenger.number === currentNumber && guard < 8) {
        challenger = rollMajorArcana(config, 'normal', state.nationRank);
        guard += 1;
    }
    const choices = [keepArcana, challenger].map((arcana) => ({ ...arcana }));
    if (chance(0.5)) choices.reverse();
    return choices;
}

function getRankTier(config, nationRank) {
    const rank = Number(nationRank || config.kingdomRank.minRank);
    const match = config.kingdomRank.tierThresholds.find((entry) => rank >= entry.minRank && rank <= entry.maxRank);
    return match?.tier || 1;
}

function spinBoard(state, config, drawOptions) {
    const board = createBlankBoard(config);
    for (let reel = 0; reel < config.board.reels; reel += 1) {
        const held = state.holdMask[reel];
        const center = state.board[1]?.[reel];
        if (held && center && center.kind !== 'blank') {
            for (let row = 0; row < config.board.rows; row += 1) {
                board[row][reel] = createMinorCard(center.suit, center.rank, { isHeldSync: true });
            }
            continue;
        }
        for (let row = 0; row < config.board.rows; row += 1) {
            board[row][reel] = drawCard(drawOptions);
        }
    }
    return board;
}

function syncHoldPreview(state, config) {
    if (state.phase !== 'hold') return;
    for (let reel = 0; reel < config.board.reels; reel += 1) {
        const center = state.board[1]?.[reel];
        if (state.holdMask[reel] && center && center.kind !== 'blank') {
            state.board[0][reel] = createMinorCard(center.suit, center.rank, { isHeldSync: true });
            state.board[2][reel] = createMinorCard(center.suit, center.rank, { isHeldSync: true });
        } else {
            state.board[0][reel] = createBlankCard();
            state.board[2][reel] = createBlankCard();
        }
    }
}

function hasHeldRank(state, rank) {
    return state.holdMask.some((held, reel) => held && Number(state.board[1]?.[reel]?.rank || 0) === Number(rank));
}

function applyMysteryWild(board, state) {
    const nextBoard = board.map((row) => row.map(cloneCard));
    for (let reel = 0; reel < state.holdMask.length; reel += 1) {
        if (!state.holdMask[reel]) continue;
        if (Number(state.board[1]?.[reel]?.rank || 0) !== 2) continue;
        for (let row = 0; row < nextBoard.length; row += 1) {
            nextBoard[row][reel] = {
                ...nextBoard[row][reel],
                isWild: true,
                sourceRank: 2
            };
        }
    }
    return nextBoard;
}

function applySkipNudge(board, state, config, drawOptions) {
    const nextBoard = board.map((row) => row.map(cloneCard));
    const openReels = [];
    for (let reel = 0; reel < config.board.reels; reel += 1) {
        if (!state.holdMask[reel]) openReels.push(reel);
    }
    openReels.forEach((reel) => {
        const direction = chance(0.5) ? -1 : 1;
        const shift = randomInt(config.minorArcana.skipNudge.minShift, config.minorArcana.skipNudge.maxShift);
        const column = [nextBoard[0][reel], nextBoard[1][reel], nextBoard[2][reel]];
        const strip = [
            drawCard(drawOptions),
            drawCard(drawOptions),
            ...column.map(cloneCard),
            drawCard(drawOptions),
            drawCard(drawOptions)
        ];
        const start = clamp(2 + (direction * shift), 0, strip.length - 3);
        for (let row = 0; row < 3; row += 1) {
            nextBoard[row][reel] = cloneCard(strip[start + row]);
        }
    });

    let evaluation = evaluateBoard(nextBoard, state, config, { level: 1, cost: 1 });
    if (!evaluation.hasRole) {
        const midRanks = nextBoard[1].map((card) => Number(card.rank || 0)).filter(Boolean);
        const targetRank = getMostCommonRank(midRanks) || pickRandomDeckRank(config);
        const targetReels = openReels.length >= 2 ? openReels.slice(0, 2) : openReels.slice(0, 1);
        if (targetReels.length >= 1) {
            nextBoard[1][targetReels[0]] = drawSpecificCard(drawOptions, { ranks: [targetRank] }) || drawCard(drawOptions);
        }
        if (targetReels.length >= 2) {
            nextBoard[1][targetReels[1]] = drawSpecificCard(drawOptions, { ranks: [targetRank] }) || drawCard(drawOptions);
        } else if (targetReels.length === 1) {
            const buddyReel = targetReels[0] === 0 ? 1 : 0;
            nextBoard[1][buddyReel] = drawSpecificCard(drawOptions, { ranks: [targetRank] }) || drawCard(drawOptions);
        }
    }

    return {
        board: nextBoard,
        detail: '滑り込みで役を補正'
    };
}

function applyCascade(board, state, evaluation, config, drawOptions, betInfo) {
    const nextBoard = board.map((row) => row.map(cloneCard));
    const protectedCells = new Set();
    evaluation.lineResults
        .filter((line) => line.kind !== 'Miss')
        .forEach((line) => {
            line.coords.forEach((coord) => protectedCells.add(coordKey(coord.row, coord.reel)));
        });

    let destroyedCount = 0;
    for (let row = 0; row < config.board.rows; row += 1) {
        for (let reel = 0; reel < config.board.reels; reel += 1) {
            if (state.holdMask[reel]) continue;
            if (protectedCells.size > 0 && protectedCells.has(coordKey(row, reel))) continue;
            nextBoard[row][reel] = drawCard(drawOptions);
            destroyedCount += 1;
        }
    }
    const multiplier = destroyedCount > 0
        ? clamp(1 + (destroyedCount * config.minorArcana.cascade.multiplierStep), 1, 9)
        : 1;
    const reevaluated = evaluateBoard(nextBoard, state, config, betInfo);
    reevaluated.totalPayout *= multiplier;
    return {
        board: nextBoard,
        evaluation: reevaluated,
        destroyedCount,
        multiplier
    };
}

function forceGuaranteedTwoPair(state, config, drawOptions) {
    const targetRanks = [pickRandomDeckRank(config, 6, 10), pickRandomHighDeckRank(config)];
    for (let reel = 0; reel < config.board.reels; reel += 1) {
        if (reel <= 1) {
            state.board[1][reel] = drawSpecificCard(drawOptions, { ranks: [targetRanks[0]] }) || drawCard(drawOptions);
        } else if (reel <= 3) {
            state.board[1][reel] = drawSpecificCard(drawOptions, { ranks: [targetRanks[1]] }) || drawCard(drawOptions);
        } else {
            state.board[1][reel] = drawCard(drawOptions);
        }
    }
}

function pickRandomDeckRank(config, min = 1, max = 13) {
    const ranks = (config.deck?.ranks || []).filter((rank) => rank >= min && rank <= max);
    if (!ranks.length) return min;
    return ranks[randomInt(0, ranks.length - 1)];
}

function pickRandomHighDeckRank(config) {
    const ranks = (config.deck?.ranks || []).filter((rank) => isHighRank(rank));
    if (!ranks.length) return 13;
    return ranks[randomInt(0, ranks.length - 1)];
}
function evaluateBoard(board, state, config, betInfo) {
    const activePaylines = getActivePaylines(state, config);
    const lineResults = activePaylines.map((line) => {
        const cards = line.rows.map((row, reel) => board[row][reel]);
        const coords = line.rows.map((row, reel) => ({ row, reel }));
        const hand = evaluateHand(cards, { maxBet: betInfo.level === config.betLevels[config.betLevels.length - 1].level });
        return {
            id: line.id,
            label: line.label,
            rows: line.rows.slice(),
            coords,
            cards,
            ...hand
        };
    });
    const roleLines = lineResults.filter((line) => line.kind !== 'Miss');
    const totalMultiplier = roleLines.reduce((sum, line) => sum + line.multiplier, 0);
    return {
        lineResults,
        bestLine: roleLines.sort(compareLines)[0] || null,
        hasRole: roleLines.length > 0,
        bestStrength: roleLines.reduce((max, line) => Math.max(max, HAND_STRENGTH[line.kind] || 0), 0),
        totalMultiplier,
        totalPayout: Math.max(0, Math.floor(totalMultiplier * Number(betInfo.cost || 0)))
    };
}

function compareLines(left, right) {
    const strengthDiff = (HAND_STRENGTH[right.kind] || 0) - (HAND_STRENGTH[left.kind] || 0);
    if (strengthDiff !== 0) return strengthDiff;
    return (right.multiplier || 0) - (left.multiplier || 0);
}

function evaluateHand(cards, options = {}) {
    const normals = cards.filter((card) => card && card.kind !== 'blank' && !card.isWild);
    const wildCount = cards.filter((card) => card?.isWild).length;
    const rankCounts = countBy(normals, (card) => Number(card.rank || 0));
    const suitSet = new Set(normals.map((card) => card.suit));
    const maxBet = !!options.maxBet;

    const straightFlush = findStraightFlush(normals, wildCount);
    if (straightFlush) {
        if (straightFlush.isRoyal && maxBet) {
            return buildHandResult('RoyalStraightFlush', straightFlush.suit, 4000);
        }
        return buildHandResult('StraightFlush', straightFlush.suit, 500);
    }

    const fourKind = findFourKind(rankCounts, wildCount, SPIN_TAROT_CONFIG);
    if (fourKind) {
        return buildHandResult(isHighRank(fourKind.rank) ? 'FourKindHigh' : 'FourKindLow', fourKind.rank, isHighRank(fourKind.rank) ? 150 : 50);
    }

    if (findFullHouse(rankCounts, wildCount)) {
        return buildHandResult('FullHouse', '', 10);
    }

    if (findFlush(normals, suitSet, wildCount)) {
        return buildHandResult('Flush', '', 7);
    }

    if (findStraight(normals, wildCount)) {
        return buildHandResult('Straight', '', 5);
    }

    if (findThreeKind(rankCounts, wildCount)) {
        return buildHandResult('ThreeKind', '', 3);
    }

    if (findTwoPair(rankCounts, wildCount)) {
        return buildHandResult('TwoPair', '', 1);
    }

    if (findOnePair(rankCounts, wildCount)) {
        return buildHandResult('OnePair', '', 0);
    }

    return buildHandResult('Miss', '', 0);
}

function buildHandResult(kind, detail, multiplier) {
    return {
        kind,
        roleLabel: SPIN_TAROT_CONFIG.payoutTable[kind]?.label || 'ハズレ',
        detail,
        multiplier,
        strength: HAND_STRENGTH[kind] || 0
    };
}

function countBy(items, mapper) {
    const counts = new Map();
    items.forEach((item) => {
        const key = mapper(item);
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
}

function findStraightFlush(normals, wildCount) {
    if (normals.length === 0 && wildCount === 5) {
        return { suit: 'Wand', isRoyal: true };
    }
    if (new Set(normals.map((card) => card.suit)).size > 1) return null;
    const straight = findStraightPattern(normals, wildCount);
    if (!straight) return null;
    return {
        suit: normals[0]?.suit || 'Wand',
        isRoyal: straight.isRoyal
    };
}

function findFourKind(rankCounts, wildCount, config = SPIN_TAROT_CONFIG) {
    for (const rank of getRankOrder(config)) {
        if ((rankCounts.get(rank) || 0) + wildCount >= 4) {
            return { rank };
        }
    }
    return null;
}

function findFullHouse(rankCounts, wildCount) {
    const ranks = getRankOrder();
    for (const tripleRank of ranks) {
        for (const pairRank of ranks) {
            if (tripleRank === pairRank) continue;
            let needed = Math.max(0, 3 - (rankCounts.get(tripleRank) || 0));
            needed += Math.max(0, 2 - (rankCounts.get(pairRank) || 0));
            const otherRanks = Array.from(rankCounts.keys()).filter((rank) => rank !== tripleRank && rank !== pairRank);
            if (otherRanks.length > 0) continue;
            if (needed <= wildCount) return true;
        }
    }
    return false;
}

function findFlush(normals, suitSet, wildCount) {
    if (normals.length === 0) return true;
    if (suitSet.size > 1) return false;
    return normals.length + wildCount >= 5;
}

function findStraight(normals, wildCount) {
    return !!findStraightPattern(normals, wildCount);
}

function findStraightPattern(normals, wildCount) {
    const ranks = normals.map((card) => Number(card.rank || 0)).filter(Boolean);
    if (new Set(ranks).size !== ranks.length) return null;
    for (const sequence of POKER_STRAIGHTS) {
        const target = new Set(sequence);
        if (!ranks.every((rank) => target.has(rank))) continue;
        const missing = sequence.filter((rank) => !ranks.includes(rank)).length;
        if (missing <= wildCount && (ranks.length + wildCount) >= 5) {
            return {
                sequence,
                isRoyal: sequence[0] === 10 && sequence[4] === 1
            };
        }
    }
    return null;
}

function findThreeKind(rankCounts, wildCount) {
    for (const rank of getRankOrder()) {
        if ((rankCounts.get(rank) || 0) + wildCount >= 3) return true;
    }
    return false;
}

function findTwoPair(rankCounts, wildCount) {
    const ranks = getRankOrder();
    for (let firstIndex = 0; firstIndex < ranks.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < ranks.length; secondIndex += 1) {
            const first = ranks[firstIndex];
            const second = ranks[secondIndex];
            const need = Math.max(0, 2 - (rankCounts.get(first) || 0))
                + Math.max(0, 2 - (rankCounts.get(second) || 0));
            if (need <= wildCount) return true;
        }
    }
    return false;
}

function findOnePair(rankCounts, wildCount) {
    for (const rank of getRankOrder()) {
        if ((rankCounts.get(rank) || 0) + wildCount >= 2) return true;
    }
    return false;
}

function getDominantSuit(board) {
    const counts = new Map();
    board.flat().forEach((card) => {
        if (!card || card.kind === 'blank' || card.isWild) return;
        counts.set(card.suit, (counts.get(card.suit) || 0) + 1);
    });
    const sorted = Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
    return sorted[0]?.[0] || null;
}

function getMostCommonRank(ranks) {
    const counts = new Map();
    ranks.forEach((rank) => counts.set(rank, (counts.get(rank) || 0) + 1));
    return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || null;
}

function getActivePaylines(state, config) {
    const count = normalizeActiveLineCount(state?.activeLineCount, config);
    return config.board.paylines.slice(0, count);
}
function applyCourtGrowth(state, evaluation, config, betInfo) {
    const courtCards = state.board.flat().filter((card) => isRoyalGrowthRank(card?.rank) && !card?.isWild);
    const statMultiplier = Number(betInfo.statMultiplier || 1);
    const queenBoost = Number(state.currentArcana?.queenMultiplier || 1);
    const kingBoost = Number(state.currentArcana?.kingMultiplier || 1);

    courtCards.forEach((card) => {
        if (Number(card.rank || 0) === 11) {
            state.population += config.statusGrowth[11].population * statMultiplier;
        } else if (Number(card.rank || 0) === 12) {
            state.knights += config.statusGrowth[12].knights * statMultiplier;
        } else if (Number(card.rank || 0) === 13) {
            const gain = config.statusGrowth[13].rankGauge * statMultiplier;
            state.rankGauge += gain;
            state.queenGauge += config.statusGrowth[13].queenGauge * statMultiplier * queenBoost;
        } else if (Number(card.rank || 0) === 1) {
            const gain = config.statusGrowth[1].rankGauge * statMultiplier;
            state.rankGauge += gain;
            state.kingGauge += config.statusGrowth[1].kingGauge * statMultiplier * kingBoost;
        }
    });

    const flushLines = evaluation.lineResults.filter((line) => line.kind === 'Flush' || line.kind === 'StraightFlush' || line.kind === 'RoyalStraightFlush').length;
    if (flushLines > 0) {
        state.mages += flushLines * config.statusGrowth.flushMageGain * statMultiplier;
    }
    updateNationRank(state, config);
}

function updateNationRank(state, config) {
    while (state.rankGauge >= config.kingdomRank.gaugePerRank && state.nationRank < config.kingdomRank.maxRank) {
        state.rankGauge -= config.kingdomRank.gaugePerRank;
        state.nationRank += 1;
        state.castleMaxHp += 8;
        state.castleHp = Math.min(state.castleMaxHp, state.castleHp + 8);
        state.lastEffects.push(`国家ランク ${state.nationRank} へ上昇`);
    }
}


// determine a multiplier based on how strong the hand was; at bare minimum 1
function getArcanaStrength(evaluation, betInfo) {
    // use totalMultiplier which is sum of line.multiplier values
    const multiplier = (evaluation && evaluation.totalMultiplier) || 0;
    return Math.max(1, multiplier);
}

function getOmenGainByResult(evaluation, config = SPIN_TAROT_CONFIG) {
    const progression = config.progression || {};
    if (!evaluation?.hasRole) return Number(progression.missOmenGain || 0);
    if (evaluation.bestStrength >= HAND_STRENGTH.FullHouse) return Number(progression.premiumOmenGain || 0);
    if (evaluation.bestStrength >= HAND_STRENGTH.ThreeKind) return Number(progression.strongOmenGain || 0);
    if (evaluation.bestStrength >= HAND_STRENGTH.TwoPair) return Number(progression.twoPairOmenGain || 0);
    return Number(progression.replayOmenGain || 0);
}

function getCzPowerGainByResult(evaluation, config = SPIN_TAROT_CONFIG) {
    const progression = config.progression || {};
    if (!evaluation?.hasRole) return Number(progression.czMissGain || 0);
    if (evaluation.bestStrength >= HAND_STRENGTH.ThreeKind) return Number(progression.czStrongGain || 0);
    return Number(progression.czReplayGain || 0);
}

function calculateBattleReward(state, config, battle, damageHint = 0) {
    const progression = config.progression || {};
    const baseReward = Number(progression.guaranteedBattleRewardCoins || 0);
    const rankReward = Math.max(0, Number(state.nationRank || 0)) * Number(progression.battleRewardPerRank || 0);
    const bossBonus = battle?.isBoss ? Number(progression.bossBattleRewardBonus || 0) : 0;
    const damageBonus = Math.min(18, Math.max(0, Math.floor(Number(damageHint || 0) * 0.08)));
    return Math.max(
        1,
        Math.floor((baseReward + rankReward + bossBonus + damageBonus) * Number(config.combat.battleRewardMultiplier || 1))
    );
}

function setBaseModeByOmenGauge(state, config = SPIN_TAROT_CONFIG, previousMode = 'normal') {
    const progression = config.progression || {};
    const nextMode = Number(state.omenGauge || 0) >= Number(progression.highThreshold || 65)
        ? 'high'
        : Number(state.omenGauge || 0) >= Number(progression.hintThreshold || 30)
            ? 'hint'
            : 'normal';
    if (nextMode !== previousMode) {
        if (nextMode === 'high') {
            pushLog(state, '気配が強まり、高確へ移行。', config);
            state.lastEffects.push('高確へ移行');
        } else if (nextMode === 'hint') {
            pushLog(state, '前兆が走る。', config);
            state.lastEffects.push('前兆へ移行');
        } else if (previousMode === 'cz') {
            pushLog(state, '防衛準備CZが終了。', config);
        }
    }
    state.mode = nextMode;
    state.modeSpinsRemaining = 0;
}

function launchBattleFromSuit(state, config, events, suitKey, sourceLabel = '') {
    const pickedSuit = suitKey && SUIT_KEYS.includes(suitKey) ? suitKey : rollPreviewSuit();
    const nation = config.enemyNations[pickedSuit];
    if (!nation) return false;
    state.battle = {
        suitKey: pickedSuit,
        label: nation.label,
        emoji: nation.emoji,
        hp: nation.hp + Math.floor(state.nationRank * 4),
        maxHp: nation.hp + Math.floor(state.nationRank * 4),
        attack: nation.attack + Math.floor(state.nationRank * 0.8),
        healRatio: nation.healRatio,
        fortifyRatio: nation.fortifyRatio,
        holdLockChance: nation.holdLockChance,
        isBoss: false
    };
    state.currentArcana = rollMajorArcana(config, 'battle', state.nationRank);
    state.previewSuit = pickedSuit;
    state.mode = 'normal';
    state.modeSpinsRemaining = 0;
    state.czPower = 0;
    state.omenGauge = 0;
    pushLog(
        state,
        sourceLabel
            ? `${sourceLabel}成功。${nation.label} が襲来。${nation.summary}。`
            : `${nation.label} が襲来。${nation.summary}。`,
        config
    );
    if (!events.cutin) events.cutin = buildCutin(state.currentArcana.number, `${nation.label} 防衛戦`);
    return true;
}

function resolveRushModeBonuses(state, evaluation, config, betInfo) {
    if (!evaluation?.hasRole) return;
    const statMultiplier = Number(betInfo?.statMultiplier || 1);
    if (state.queenModeSpins > 0) {
        const heal = Math.max(2, 4 * statMultiplier);
        state.castleHp = Math.min(state.castleMaxHp, state.castleHp + heal);
        state.lastEffects.push(`星告の加護 +${heal}回復`);
    }
    if (state.kingModeSpins > 0) {
        state.attackMultiplier *= 1.2;
        const bonus = Math.max(1, Math.floor(Number(state.totalPayout || 0) * 0.2));
        state.totalPayout += bonus;
        state.coins += bonus;
        state.lastEffects.push(`王権ラッシュ +${bonus}枚`);
    }
}

function tickRushModes(state, config) {
    if (state.queenModeSpins > 0) {
        state.queenModeSpins = Math.max(0, Number(state.queenModeSpins || 0) - 1);
        if (state.queenModeSpins === 0) pushLog(state, '星告の加護が終了。', config);
    }
    if (state.kingModeSpins > 0) {
        state.kingModeSpins = Math.max(0, Number(state.kingModeSpins || 0) - 1);
        if (state.kingModeSpins === 0) pushLog(state, '王権ラッシュが終了。', config);
    }
}

function maybeUnlockRushModes(state, config) {
    const progression = config.progression || {};
    const queenThreshold = Math.max(1, Number(progression.queenModeThreshold || 48));
    const kingThreshold = Math.max(1, Number(progression.kingModeThreshold || 48));
    const queenSpins = Math.max(1, Number(progression.queenModeSpins || 8));
    const kingSpins = Math.max(1, Number(progression.kingModeSpins || 8));
    while (Number(state.queenGauge || 0) >= queenThreshold) {
        state.queenGauge -= queenThreshold;
        state.queenModeSpins = Math.max(Number(state.queenModeSpins || 0), queenSpins);
        state.lastEffects.push('星告の加護突入');
        pushLog(state, `星告の加護へ突入。${queenSpins}G継続。`, config);
    }
    while (Number(state.kingGauge || 0) >= kingThreshold) {
        state.kingGauge -= kingThreshold;
        state.kingModeSpins = Math.max(Number(state.kingModeSpins || 0), kingSpins);
        state.lastEffects.push('王権ラッシュ突入');
        pushLog(state, `王権ラッシュへ突入。${kingSpins}G継続。`, config);
    }
}

function applySpinFlowProgress(state, evaluation, config, events) {
    const progression = config.progression || {};
    const previousMode = String(state.mode || 'normal');
    const previousModeSpins = Math.max(0, Number(state.modeSpinsRemaining) || 0);
    state.treasureCooldownSpins = Math.max(0, Number(state.treasureCooldownSpins || 0) - 1);

    if (!evaluation?.hasRole) {
        state.missStreak = Math.max(0, Number(state.missStreak || 0)) + 1;
        state.queenGauge += Number(progression.missQueenGain || 0);
        state.kingGauge += Number(progression.missKingGain || 0);
    } else {
        state.missStreak = 0;
        if (evaluation.bestStrength >= HAND_STRENGTH.OnePair) {
            state.queenGauge += Number(progression.replayQueenGain || 0);
        }
        if (evaluation.bestStrength >= HAND_STRENGTH.ThreeKind) {
            state.kingGauge += Number(progression.strongKingGain || 0);
        }
    }

    tickRushModes(state, config);
    maybeUnlockRushModes(state, config);

    if (state.battle || state.premium || state.gameOver) return;

    const omenMax = Math.max(1, Number(progression.omenGaugeMax || 100));
    let omenGain = getOmenGainByResult(evaluation, config);
    if (state.queenModeSpins > 0) omenGain += 4;
    if (!evaluation?.hasRole) omenGain += Math.min(8, Math.max(0, Number(state.missStreak || 0) - 2));
    state.omenGauge = clamp((Number(state.omenGauge) || 0) + omenGain, 0, omenMax);

    if (previousMode === 'cz') {
        state.mode = 'cz';
        state.modeSpinsRemaining = Math.max(0, previousModeSpins - 1);
        state.czPower = clamp(
            (Number(state.czPower) || 0) + getCzPowerGainByResult(evaluation, config),
            0,
            Math.max(1, Number(progression.czTarget || 100))
        );
        if (
            Number(state.czPower || 0) >= Number(progression.czTarget || 100)
            || evaluation.bestStrength >= HAND_STRENGTH.ThreeKind
        ) {
            state.lastEffects.push('防衛準備CZ突破');
            launchBattleFromSuit(state, config, events, state.previewSuit, '防衛準備CZ');
            return;
        }
        if (state.modeSpinsRemaining <= 0) {
            pushLog(state, '防衛準備CZ失敗。', config);
            state.czPower = 0;
            setBaseModeByOmenGauge(state, config, previousMode);
            return;
        }
        return;
    }

    if (Number(state.omenGauge || 0) >= Number(progression.czThreshold || 100)) {
        state.mode = 'cz';
        state.modeSpinsRemaining = Math.max(1, Number(progression.czSpins || 3));
        state.czPower = getCzPowerGainByResult(evaluation, config);
        state.omenGauge = 0;
        state.lastEffects.push('防衛準備CZ突入');
        pushLog(state, `防衛準備CZへ突入。${state.modeSpinsRemaining}G以内に敵襲を引き寄せろ。`, config);
        if (!events.cutin) events.cutin = buildCutin(11, '防衛準備CZ');
        return;
    }

    setBaseModeByOmenGauge(state, config, previousMode);
}

function resolveArcanaOnWin(state, evaluation, config, betInfo) {
    if (!evaluation.hasRole) return;
    const arcana = getMajorArcana(state.currentArcana?.number);
    const strength = getArcanaStrength(evaluation, betInfo);
    const horizontalHits = evaluation.lineResults.filter((line) => line.kind !== 'Miss' && HORIZONTAL_LINE_IDS.has(line.id)).length;
    const diagonalHits = evaluation.lineResults.filter((line) => line.kind !== 'Miss' && !HORIZONTAL_LINE_IDS.has(line.id)).length;

    if (arcana.mageGain) {
        state.mages += Math.floor(arcana.mageGain * strength * Number(betInfo.statMultiplier || 1));
    }
    if (arcana.bishopGain) {
        state.bishops += Math.floor(arcana.bishopGain * strength);
    }
    if (arcana.castleHeal) {
        state.castleHp = Math.min(state.castleMaxHp, state.castleHp + Math.floor(arcana.castleHeal * strength));
    }
    if (arcana.unitHeal) {
        const heal = Math.floor(arcana.unitHeal * strength);
        state.knights += heal;
        state.bishops += heal;
        state.mages += heal;
        state.population += heal;
    }
    if (arcana.populationGain) {
        state.population += Math.floor(arcana.populationGain * strength);
    }
    if (arcana.moraleBoost) {
        // apply morale as additional multiplier on attack for this spin
        state.attackMultiplier *= 1 + (arcana.moraleBoost - 1) * strength;
    }
    if (arcana.payoutMultiplier) {
        const bonus = Math.floor(state.totalPayout * (arcana.payoutMultiplier - 1) * strength);
        state.totalPayout += bonus;
        state.coins += bonus;
    }
    if (arcana.guaranteeRole) {
        const hpCost = Math.max(1, Math.floor(state.castleMaxHp * Number(arcana.hpCostRatio || 0)));
        state.castleHp = Math.max(1, state.castleHp - hpCost);
        state.pendingGuaranteeRole = arcana.guaranteeRole;
    }
    if (Array.isArray(arcana.suitFilter) && arcana.suitFilter.length) {
        state.pendingSuitFilter = arcana.suitFilter.slice();
    } else {
        state.pendingSuitFilter = null;
    }
    if (arcana.confuseTurns) {
        state.confuseTurns = Math.max(state.confuseTurns, arcana.confuseTurns);
    }
    if (horizontalHits > 0 && (arcana.horizontalKnightBurst || arcana.horizontalJusticeBurst || arcana.horizontalTowerBurst)) {
        state.lastEffects.push('横ライン大砲が発動');
    }
    if (diagonalHits > 0 && (arcana.diagonalBishopBurst || arcana.diagonalDevilBurst || arcana.diagonalJudgementBurst)) {
        state.lastEffects.push('斜め貫通魔法が発動');
    }
}


function resolveBattleAndProgress(state, evaluation, config, betInfo, events) {
    if (state.premium?.type === 'treasure') {
        const treasureGain = randomInt(config.combat.treasureChestMin, config.combat.treasureChestMax) * Number(betInfo.cost || 1);
        state.coins += treasureGain;
        state.lastTreasureCoins = treasureGain;
        state.lastDefenseActions = [
            createDefenseAction({
                code: 'treasure-chest',
                icon: '📦',
                label: 'TREASURE CHEST',
                short: 'TREASURE',
                detail: `Treasure recovered: +${treasureGain} coin.`,
                role: 'reward',
                motion: 'treasure',
                tone: 'reward',
                damage: treasureGain
            })
        ];
        pushLog(state, `宝島の宝箱から ${treasureGain} 枚獲得。`, config);
        state.premium.spinsRemaining -= 1;
        if (state.premium.spinsRemaining <= 0) {
            state.premium = null;
            state.treasureCooldownSpins = Math.max(0, Number(config.progression?.treasureCooldownSpins || 0));
            pushLog(state, '宝島ゾーン終了。', config);
        }
    }

    if (!state.battle) return;

    const playerDamage = evaluation.hasRole
        ? computePlayerDamage(state, evaluation, config, betInfo)
        : 0;

    if (evaluation.hasRole && playerDamage > 0) {
        const reducedDamage = Math.max(
            config.combat.minimumBattleDamage,
            Math.floor(playerDamage * (1 - Number(state.battle.fortifyRatio || 0)))
        );
        state.lastAttackDamage = reducedDamage;
        state.battle.hp = Math.max(0, state.battle.hp - reducedDamage);
        pushLog(state, `あなたの攻撃 ${reducedDamage} ダメージ。`, config);
        if (state.currentArcana?.lifestealRatio) {
            const heal = Math.max(1, Math.floor(reducedDamage * state.currentArcana.lifestealRatio));
            state.castleHp = Math.min(state.castleMaxHp, state.castleHp + heal);
        }
    }

    if (state.battle.hp <= 0) {
        const reward = calculateBattleReward(state, config, state.battle, state.lastAttackDamage);
        state.coins += reward;
        pushLog(state, `${state.battle.label} を撃破。報酬 ${reward} 枚。`, config);
        if (state.battle.isBoss) {
            events.cutin = buildCutin(21, 'ドラゴン討伐ボーナス');
        }
        state.battle = null;
        state.zone = pickZone(config);
        state.previewSuit = rollPreviewSuit();
        state.currentArcana = rollMajorArcana(config, 'normal', state.nationRank);
        state.lockedHolds = Array(config.board.reels).fill(false);
        events.notes.push('battle-ended');
        return;
    }

    if (!evaluation.hasRole && !state.premium?.type) {
        if (state.confuseTurns > 0) {
            const reflect = Math.max(config.combat.minimumBattleDamage, Math.floor(state.battle.attack * 0.8));
            state.battle.hp = Math.max(0, state.battle.hp - reflect);
            state.confuseTurns = Math.max(0, state.confuseTurns - 1);
            state.lastDefenseActions = [
                createDefenseAction({
                    code: 'confuse-reflect',
                    icon: '🌀',
                    label: 'CONFUSE REFLECT',
                    short: 'REFLECT',
                    detail: `${state.battle.label} hurts itself for ${reflect} damage.`,
                    role: 'support',
                    motion: 'clash',
                    tone: 'reward',
                    damage: reflect
                })
            ];
            pushLog(state, `${state.battle.label} が幻惑で自滅 ${reflect} ダメージ。`, config);
        } else {
            let damage = Math.max(1, state.battle.attack + config.combat.enemyMissDamageBase);
            const shieldRatio = clamp((state.population / 1000) * config.combat.populationShieldRatio, 0, config.combat.maxCarryShield);
            damage = Math.max(1, Math.floor(damage * (1 - shieldRatio)));
            state.castleHp = Math.max(0, state.castleHp - damage);
            state.lastEnemyDamage = damage;
            state.lastDefenseActions = [
                createDefenseAction({
                    code: 'enemy-push',
                    icon: state.battle.emoji || '👾',
                    label: 'ENEMY PUSH',
                    short: 'PUSH',
                    detail: `${state.battle.label} breaks through for ${damage} damage.`,
                    role: 'enemy',
                    motion: state.battle.isBoss ? 'boss' : 'rush',
                    tone: 'danger',
                    damage
                })
            ];
            pushLog(state, `${state.battle.label} の攻撃で城壁 -${damage}。`, config);
            if (state.battle.healRatio > 0) {
                const heal = Math.max(1, Math.floor(state.battle.maxHp * state.battle.healRatio));
                state.battle.hp = Math.min(state.battle.maxHp, state.battle.hp + heal);
                pushLog(state, `${state.battle.label} が ${heal} 回復。`, config);
            }
            if (state.battle.holdLockChance > 0 && chance(state.battle.holdLockChance)) {
                state.lockedHolds = state.lockedHolds.map(() => false);
                const lockCount = randomInt(1, 2);
                for (let index = 0; index < lockCount; index += 1) {
                    state.lockedHolds[randomInt(0, state.lockedHolds.length - 1)] = true;
                }
                pushLog(state, 'ワンドの妨害で HOLD が封じられた。', config);
            } else {
                state.lockedHolds = state.lockedHolds.map(() => false);
            }
        }
    }

    if (state.battle && state.battle.hp <= 0) {
        const reward = calculateBattleReward(state, config, state.battle, config.combat.minimumBattleDamage);
        state.coins += reward;
        pushLog(state, `${state.battle.label} が崩れ落ちた。報酬 ${reward} 枚。`, config);
        state.battle = null;
        state.zone = pickZone(config);
        state.previewSuit = rollPreviewSuit();
        state.currentArcana = rollMajorArcana(config, 'normal', state.nationRank);
        state.lockedHolds = Array(config.board.reels).fill(false);
        events.notes.push('battle-ended');
        return;
    }

    if (state.castleHp <= 0) {
        state.castleHp = 0;
        state.gameOver = true;
        const refund = Math.floor(state.coins * config.progression.lossRefundRatio);
        state.coins = refund;
        state.lastDefenseActions = [
            createDefenseAction({
                code: 'castle-fall',
                icon: '🏚️',
                label: 'CASTLE FALL',
                short: 'FALL',
                detail: `The castle falls. Coins reset to ${refund}.`,
                role: 'enemy',
                motion: 'boss',
                tone: 'danger',
                damage: 0
            })
        ];
        state.lastCutin = buildCutin(13, '城壁崩壊');
        pushLog(state, `敗北。残コインは ${refund} 枚に圧縮。`, config);
    }
}

function createDefenseAction(action = {}) {
    return {
        code: String(action.code || '').trim(),
        icon: String(action.icon || '⚔️'),
        label: String(action.label || 'ATTACK'),
        short: String(action.short || action.label || 'ATTACK'),
        detail: String(action.detail || action.label || 'Attack').trim(),
        role: String(action.role || 'support'),
        motion: String(action.motion || 'rush'),
        tone: String(action.tone || ''),
        damage: Math.max(0, Math.floor(Number(action.damage) || 0)),
        handKind: String(action.handKind || '').trim(),
        lineId: String(action.lineId || '').trim()
    };
}

function buildLineDefenseAction(line, state, config, betInfo) {
    const lineMultiplier = Math.max(1, Number(line?.multiplier || 0));
    const statMultiplier = Math.max(1, Number(betInfo?.statMultiplier || 1));
    const population = Math.max(0, Number(state?.population || 0));
    const knights = Math.max(0, Number(state?.knights || 0));
    const bishops = Math.max(0, Number(state?.bishops || 0));
    const mages = Math.max(0, Number(state?.mages || 0));
    const base = Math.max(1, Number(config?.combat?.lineAttackBase || 0));
    const knightPower = Math.max(1, Number(config?.combat?.knightPower || 1));
    const bishopPower = Math.max(1, Number(config?.combat?.bishopPower || 1));
    const magePower = Math.max(1, Number(config?.combat?.magePower || 1));
    const kind = String(line?.kind || 'Miss');
    const shared = {
        handKind: kind,
        lineId: String(line?.id || '')
    };

    switch (kind) {
        case 'OnePair':
            return createDefenseAction({
                ...shared,
                code: 'pawn-guard',
                icon: '♙',
                label: 'PAWN GUARD',
                short: 'PAWN GUARD',
                detail: 'Militia brace the gate and chip the front line.',
                role: 'guard',
                motion: 'march',
                tone: 'reward',
                damage: (base + Math.floor(population * 0.08) + (lineMultiplier * 2)) * statMultiplier
            });
        case 'TwoPair':
            return createDefenseAction({
                ...shared,
                code: 'knight-charge',
                icon: '♘',
                label: 'KNIGHT CHARGE',
                short: 'KNIGHT',
                detail: 'Twin signals send the knights charging forward.',
                role: 'guard',
                motion: 'rush',
                tone: 'reward',
                damage: (base + Math.floor(knights * knightPower * 0.35) + (lineMultiplier * 4)) * statMultiplier
            });
        case 'ThreeKind':
            return createDefenseAction({
                ...shared,
                code: 'bishop-shot',
                icon: '♗',
                label: 'BISHOP SHOT',
                short: 'BISHOP',
                detail: 'A focused bishop volley pierces the enemy file.',
                role: 'support',
                motion: 'clash',
                tone: 'reward',
                damage: (base + Math.floor((bishopPower * 1.4) + (bishops * 3)) + (lineMultiplier * 5)) * statMultiplier
            });
        case 'Straight':
            return createDefenseAction({
                ...shared,
                code: 'formation-push',
                icon: '♘',
                label: 'FORMATION PUSH',
                short: 'PUSH',
                detail: 'The whole formation surges down the lane.',
                role: 'guard',
                motion: 'rush',
                tone: 'reward',
                damage: (base * 2 + Math.floor(knights * knightPower * 0.5) + (lineMultiplier * 6)) * statMultiplier
            });
        case 'Flush':
            return createDefenseAction({
                ...shared,
                code: 'mage-barrage',
                icon: '🪄',
                label: 'MAGE BARRAGE',
                short: 'MAGE',
                detail: 'Aligned suits become a single magical bombardment.',
                role: 'support',
                motion: 'hover',
                tone: 'reward',
                damage: (base * 2 + Math.floor(mages * magePower * 0.6) + (lineMultiplier * 7)) * statMultiplier
            });
        case 'FullHouse':
            return createDefenseAction({
                ...shared,
                code: 'mixed-assault',
                icon: '♘♗',
                label: 'MIXED ASSAULT',
                short: 'MIXED',
                detail: 'Knights and bishops strike in one combined push.',
                role: 'guard',
                motion: 'rush',
                tone: 'reward',
                damage: (base * 3 + Math.floor(knights * knightPower * 0.3) + Math.floor(bishops * bishopPower * 0.25) + (lineMultiplier * 8)) * statMultiplier
            });
        case 'FourKindLow':
            return createDefenseAction({
                ...shared,
                code: 'arcana-blast',
                icon: '🎴',
                label: 'ARCANA BLAST',
                short: 'ARCANA',
                detail: 'The major arcana fires directly into the siege line.',
                role: 'arcana',
                motion: 'arcana',
                tone: 'reward',
                damage: (base * 4 + Math.floor(mages * magePower * 0.35) + (lineMultiplier * 12) + 20) * statMultiplier
            });
        case 'FourKindHigh':
            return createDefenseAction({
                ...shared,
                code: 'royal-judgement',
                icon: '👑',
                label: 'ROYAL JUDGEMENT',
                short: 'ROYAL',
                detail: 'A royal decree crashes down on the front line.',
                role: 'arcana',
                motion: 'arcana',
                tone: 'reward',
                damage: (base * 5 + Math.floor(bishops * bishopPower * 0.4) + (lineMultiplier * 14) + 28) * statMultiplier
            });
        case 'StraightFlush':
            return createDefenseAction({
                ...shared,
                code: 'kingdom-rush',
                icon: '♕',
                label: 'KINGDOM RUSH',
                short: 'KINGDOM',
                detail: 'The kingdom army floods the lane in one wave.',
                role: 'arcana',
                motion: 'arcana',
                tone: 'reward',
                damage: (base * 6 + Math.floor(knights * knightPower * 0.45) + Math.floor(mages * magePower * 0.45) + (lineMultiplier * 18) + 36) * statMultiplier
            });
        case 'RoyalStraightFlush':
            return createDefenseAction({
                ...shared,
                code: 'world-break',
                icon: '🌍',
                label: 'WORLD BREAK',
                short: 'WORLD',
                detail: 'Reality itself bends and crushes the enemy advance.',
                role: 'arcana',
                motion: 'arcana',
                tone: 'reward',
                damage: (base * 10 + (lineMultiplier * 32) + 80) * statMultiplier
            });
        default:
            return createDefenseAction({
                ...shared,
                code: 'enemy-push',
                icon: '👾',
                label: 'ENEMY PUSH',
                short: 'PUSH',
                detail: 'No formation. The enemy marches closer.',
                role: 'enemy',
                motion: 'rush',
                tone: 'danger',
                damage: 0
            });
    }
}

function buildArcanaDefenseActions(state, winLines, arcana, config, betInfo, strength) {
    const actions = [];
    const horizontalHits = winLines.filter((line) => HORIZONTAL_LINE_IDS.has(line.id)).length;
    const diagonalHits = winLines.filter((line) => !HORIZONTAL_LINE_IDS.has(line.id)).length;
    const statMultiplier = Math.max(1, Number(betInfo?.statMultiplier || 1));

    if (horizontalHits > 0 && arcana.horizontalKnightBurst) {
        actions.push(createDefenseAction({
            code: 'arcana-knight-burst',
            icon: arcana.icon || '🎴',
            label: 'ARCANA CAVALRY',
            short: 'CAVALRY',
            detail: 'Horizontal lines ignite a cavalry burst.',
            role: 'arcana',
            motion: 'arcana',
            tone: 'reward',
            damage: Math.floor(horizontalHits * Number(config.combat.knightPower || 1) * arcana.horizontalKnightBurst * strength * statMultiplier)
        }));
    }
    if (horizontalHits > 0 && arcana.horizontalJusticeBurst) {
        actions.push(createDefenseAction({
            code: 'arcana-justice-burst',
            icon: arcana.icon || '⚖️',
            label: 'JUSTICE VOLLEY',
            short: 'JUSTICE',
            detail: 'The arcana punishes every horizontal hit.',
            role: 'arcana',
            motion: 'arcana',
            tone: 'reward',
            damage: Math.floor(horizontalHits * Number(config.combat.bishopPower || 1) * arcana.horizontalJusticeBurst * strength)
        }));
    }
    if (horizontalHits > 0 && arcana.horizontalTowerBurst) {
        actions.push(createDefenseAction({
            code: 'arcana-tower-burst',
            icon: arcana.icon || '🗼',
            label: 'TOWER COLLAPSE',
            short: 'TOWER',
            detail: 'The lane erupts in a tower-scale blast.',
            role: 'arcana',
            motion: 'arcana',
            tone: 'reward',
            damage: Math.floor(horizontalHits * Number(config.combat.bishopPower || 1) * arcana.horizontalTowerBurst * strength)
        }));
    }
    if (diagonalHits > 0 && arcana.diagonalBishopBurst) {
        actions.push(createDefenseAction({
            code: 'arcana-bishop-burst',
            icon: arcana.icon || '♗',
            label: 'DIAGONAL PIERCE',
            short: 'PIERCE',
            detail: 'Diagonal lines trigger a piercing bishop spell.',
            role: 'arcana',
            motion: 'clash',
            tone: 'reward',
            damage: Math.floor(diagonalHits * Number(config.combat.bishopPower || 1) * arcana.diagonalBishopBurst * strength)
        }));
    }
    if (diagonalHits > 0 && arcana.diagonalDevilBurst) {
        actions.push(createDefenseAction({
            code: 'arcana-devil-burst',
            icon: arcana.icon || '😈',
            label: 'DEVIL SLASH',
            short: 'DEVIL',
            detail: 'A cursed diagonal slash tears through the siege.',
            role: 'arcana',
            motion: 'clash',
            tone: 'reward',
            damage: Math.floor(diagonalHits * Number(config.combat.bishopPower || 1) * arcana.diagonalDevilBurst * strength)
        }));
    }
    if (diagonalHits > 0 && arcana.diagonalJudgementBurst) {
        actions.push(createDefenseAction({
            code: 'arcana-judgement-burst',
            icon: arcana.icon || '⚖️',
            label: 'JUDGEMENT STRIKE',
            short: 'JUDGE',
            detail: 'Judgement chains across the diagonal lane.',
            role: 'arcana',
            motion: 'arcana',
            tone: 'reward',
            damage: Math.floor(diagonalHits * Number(config.combat.bishopPower || 1) * arcana.diagonalJudgementBurst * strength)
        }));
    }
    if (arcana.magicNova) {
        actions.push(createDefenseAction({
            code: 'arcana-magic-nova',
            icon: arcana.icon || '🪄',
            label: 'MAGIC NOVA',
            short: 'NOVA',
            detail: 'Stored mana detonates into a wide nova.',
            role: 'arcana',
            motion: 'hover',
            tone: 'reward',
            damage: Math.floor(Math.max(1, Number(state.mages || 0)) * Number(config.combat.magePower || 1) * arcana.magicNova * strength)
        }));
    }
    if (arcana.deathCounter) {
        const shiftedCourts = state.board.flat().filter((card) => isRoyalGrowthRank(card?.rank)).length;
        actions.push(createDefenseAction({
            code: 'arcana-death-counter',
            icon: arcana.icon || '☠️',
            label: 'DEATH COUNTER',
            short: 'COUNTER',
            detail: 'Court cards turn into a deathly counterattack.',
            role: 'arcana',
            motion: 'arcana',
            tone: 'reward',
            damage: Math.floor(shiftedCourts * arcana.deathCounter * 6 * strength)
        }));
    }
    if (arcana.worldJackpot && state.battle) {
        actions.push(createDefenseAction({
            code: 'arcana-world-break',
            icon: arcana.icon || '🌍',
            label: 'WORLD BREAK',
            short: 'WORLD',
            detail: 'The arcana ends the siege in one impossible strike.',
            role: 'arcana',
            motion: 'arcana',
            tone: 'reward',
            damage: Math.max(0, Number(state.battle.hp || 0))
        }));
    }
    return actions.filter((action) => action.damage > 0);
}

function computePlayerDamage(state, evaluation, config, betInfo) {
    const winLines = evaluation.lineResults.filter((line) => line.kind !== 'Miss');
    if (winLines.length === 0) {
        state.lastDefenseActions = [];
        return 0;
    }
    const strength = evaluation.totalMultiplier || 1;
    const arcana = getMajorArcana(state.currentArcana?.number);
    const actions = [
        ...winLines.map((line) => buildLineDefenseAction(line, state, config, betInfo)),
        ...buildArcanaDefenseActions(state, winLines, arcana, config, betInfo, strength)
    ];
    let damage = actions.reduce((sum, action) => sum + Math.max(0, Number(action.damage || 0)), 0);

    damage *= Number(betInfo.statMultiplier || 1);
    damage = Math.floor(damage * Number(state.attackMultiplier || 1));
    if (state.omenBreak) {
        damage = Math.floor(damage * 1.25);
    }
    state.lastDefenseActions = actions
        .map((action) => ({
            ...action,
            damage: Math.max(0, Math.floor(Number(action.damage || 0)))
        }))
        .sort((left, right) => Number(right.damage || 0) - Number(left.damage || 0));
    return Math.max(config.combat.minimumBattleDamage, damage);
}

function maybeStartPremium(state, config, events) {
    if (state.battle || state.premium) return;
    if (String(state.mode || '') === 'cz') return;
    const baseMode = String(state.mode || 'normal');
    const bossProbability = Number(config.premiumEvents.bossRaid.probability || 0)
        * (baseMode === 'high' ? 1.4 : baseMode === 'hint' ? 1.15 : 1)
        * (state.kingModeSpins > 0 ? 1.45 : 1);
    const treasureProbability = Number(config.premiumEvents.treasureIsland.probability || 0)
        * (baseMode === 'high' ? 1.3 : baseMode === 'hint' ? 1.1 : 1)
        * (state.queenModeSpins > 0 ? 1.6 : 1);
    if (chance(bossProbability)) {
        const boss = config.premiumEvents.bossRaid.enemy;
        state.battle = {
            suitKey: 'Boss',
            label: boss.label,
            emoji: boss.emoji,
            hp: boss.hp,
            maxHp: boss.hp,
            attack: boss.attack,
            healRatio: boss.healRatio,
            fortifyRatio: boss.fortifyRatio,
            holdLockChance: boss.holdLockChance,
            isBoss: true
        };
        state.currentArcana = rollMajorArcana(config, 'battle', state.nationRank);
        state.previewSuit = 'Boss';
        state.mode = 'normal';
        state.modeSpinsRemaining = 0;
        state.czPower = 0;
        state.omenGauge = 0;
        state.lastEffects.push(config.premiumEvents.bossRaid.label);
        events.cutin = buildCutin(16, '超強敵ドラゴン乱入');
        return;
    }
    if (Number(state.treasureCooldownSpins || 0) <= 0 && chance(treasureProbability)) {
        state.premium = {
            type: 'treasure',
            label: config.premiumEvents.treasureIsland.label,
            spinsRemaining: randomInt(config.premiumEvents.treasureIsland.minSpins, config.premiumEvents.treasureIsland.maxSpins)
        };
        state.mode = 'normal';
        state.modeSpinsRemaining = 0;
        state.czPower = 0;
        state.omenGauge = Math.max(0, Number(state.omenGauge || 0) - 28);
        state.lastEffects.push(config.premiumEvents.treasureIsland.label);
        events.cutin = buildCutin(17, '宝島エピソードボーナス');
    }
}

function triggerFreezeIfNeeded(state, config, betInfo, events) {
    const baseMode = String(state.mode || 'normal');
    const freezeProbability = Number(config.premiumEvents.freeze.probability || 0)
        * (baseMode === 'high' ? 1.35 : baseMode === 'hint' ? 1.1 : 1)
        * (state.kingModeSpins > 0 || state.queenModeSpins > 0 ? 1.25 : 1);
    if (!chance(freezeProbability)) return false;
    const frozenArcana = rollMajorArcana(config, 'freeze', state.nationRank);
    state.currentArcana = frozenArcana;
    state.mode = 'normal';
    state.modeSpinsRemaining = 0;
    state.czPower = 0;
    state.omenGauge = 0;
    state.lastCutin = buildCutin(frozenArcana.number, `${frozenArcana.label} ロングフリーズ`);
    events.cutin = state.lastCutin;

    const jackpot = Math.floor(config.premiumEvents.freeze.jackpotMultiplier * Number(betInfo.cost || 1) * Number(betInfo.statMultiplier || 1));
    state.coins += jackpot;
    state.totalPayout = jackpot;
    state.lastEffects.push('ロングフリーズでジャックポット');
    pushLog(state, `${frozenArcana.label} のフリーズで ${jackpot} 枚獲得。`, config);
    // apply foolWild immediately if present
    if (frozenArcana.foolWild) {
        const center = Math.floor((config.board.reels || 5) / 2);
        if (state.board && state.board[1]) {
            state.board[1][center] = { kind: 'minor', suit: 'Wand', rank: 0, isWild: true };
            pushLog(state, 'フリーズ中に愚者が現れ、中央がワイルドになった！', config);
        }
    }

    if (frozenArcana.worldJackpot || frozenArcana.globalVictory) {
        // global victory: crank nation rank to max and prepare next battle as tier3
        state.nationRank = config.kingdomRank.maxRank;
        state.lastEffects.push('世界の力が炸裂し、敵国を圧倒！次バトルはランク3から開始。');
        pushLog(state, '次のバトルもランク3からスタートする。', config);
    }

    if (state.battle) {
        state.lastAttackDamage = state.battle.hp;
        state.battle.hp = 0;
        resolveBattleAndProgress(state, { hasRole: true, lineResults: [] }, config, betInfo, events);
    }
    return true;
}

function shouldTriggerPreAlert(state, config) {
    if (state.battle?.isBoss) return true;
    if (state.pendingGuaranteeRole) return true;
    if (hasHeldRank(state, 8) || hasHeldRank(state, 2)) return chance(config.premiumEvents.preAlertVibrateProbability * 1.4);
    return chance(config.premiumEvents.preAlertVibrateProbability);
}

function advanceZone(state, config, events) {
    if (!state.zone) {
        state.zone = pickZone(config);
        return;
    }
    if (String(state.mode || '') === 'cz') return;
    state.zone.spinsRemaining = Math.max(0, state.zone.spinsRemaining - 1);
    if (state.zone.spinsRemaining > 0) return;

    const progression = config.progression || {};
    const highThreshold = Number(progression.highThreshold || 65);
    const czTarget = Math.max(1, Number(progression.czTarget || 100));
    const shouldRouteToCz = (
        Number(state.omenGauge || 0) >= highThreshold
        || String(state.mode || '') === 'high'
        || state.queenModeSpins > 0
        || state.kingModeSpins > 0
    );
    if (shouldRouteToCz) {
        state.mode = 'cz';
        state.modeSpinsRemaining = Math.max(1, Number(progression.czSpins || 3));
        state.czPower = Math.max(Number(state.czPower || 0), Math.floor(czTarget * 0.35));
        state.lastEffects.push('防衛準備CZ突入');
        pushLog(state, `ゾーン終端で防衛準備CZへ。${state.modeSpinsRemaining}Gの間に敵襲を引き寄せろ。`, config);
        if (!events.cutin) events.cutin = buildCutin(11, '防衛準備CZ');
        return;
    }

    const suitKey = state.previewSuit && SUIT_KEYS.includes(state.previewSuit) ? state.previewSuit : rollPreviewSuit();
    launchBattleFromSuit(state, config, events, suitKey);
    state.zone = null;
}

function finalizePostSpinState(state, config) {
    if (state.pendingSuitFilter && !Array.isArray(state.pendingSuitFilter)) {
        state.pendingSuitFilter = null;
    }
    if (!state.lineSummaries.length && !state.gameOver) {
        state.lineSummaries = ['ハズレ'];
    }
    if (state.totalPayout > 0) {
        pushLog(state, `配当 ${state.totalPayout} 枚。`, config);
    }
    if (state.battle) {
        pushLog(state, `${describeEnemy(state.battle)} HP ${state.battle.hp}/${state.battle.maxHp}`, config);
    }
}

function buildCutin(number, text) {
    const arcana = getMajorArcana(number);
    return {
        number,
        text,
        label: `${number}. ${arcana.name}`,
        icon: arcana.icon
    };
}

function pushLog(state, message, config) {
    if (!message) return;
    state.logs = [message, ...state.logs].slice(0, config.progression.logLimit);
}

function coordKey(row, reel) {
    return `${row}:${reel}`;
}

function getSuitMeta(suitKey) {
    return SPIN_TAROT_CONFIG.suits.find((suit) => suit.key === suitKey) || null;
}
