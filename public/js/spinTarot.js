import {
    canSpin,
    createInitialState,
    describeEnemy,
    getBetInfo,
    getCardFace,
    getCardSpriteIndex,
    getLineChoices,
    getMajorArcana,
    getSpinTarotConfig,
    getSpriteStyle,
    performSpin,
    stepActiveLineCount,
    setBetIndex,
    toggleHold
} from './spinTarotEngine.js';

const CONFIG = getSpinTarotConfig();
const STYLE_ID = 'spinTarotStylesheet';

let root = null;
let state = null;
let spinning = false;
let cutin = null;
let cutinTimer = null;
let lastWinCoords = null;                  // recently‑winning cells for flash effect

// keyboard handler reference so we can remove it later
let keydownHandler = null;


export async function loadSpinTarotPage() {
    await ensureStylesheet();
    root = document.getElementById('tarotSpinRoot');
    if (!root) return;
    if (!state) state = createInitialState(CONFIG);
    bindKeyboard();
    render();
}


export function destroySpinTarotPage() {
    if (cutinTimer) {
        clearTimeout(cutinTimer);
        cutinTimer = null;
    }
    if (keydownHandler && typeof document !== 'undefined') {
        document.removeEventListener('keydown', keydownHandler);
        keydownHandler = null;
    }
    cutin = null;
    spinning = false;
    lastWinCoords = null;
    if (root) {
        root.innerHTML = '';
        root.classList.remove('spin-tarot-mounted', 'is-spinning');
    }
    root = null;
    state = null;
}


async function ensureStylesheet() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = './css/spin-tarot.css?v=20260306a';
    document.head.appendChild(link);
    await new Promise((resolve) => {
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', resolve, { once: true });
    });
}

function bindKeyboard() {
    if (keydownHandler) return;
    keydownHandler = (e) => {
        if (!state || spinning) return;
        switch (e.code) {
            case 'Space':
                handleSpin().catch((err) => console.error(err));
                e.preventDefault();
                break;
            case 'ArrowLeft':
                state = setBetIndex(state, state.betIndex - 1, CONFIG);
                render();
                e.preventDefault();
                break;
            case 'ArrowRight':
                state = setBetIndex(state, state.betIndex + 1, CONFIG);
                render();
                e.preventDefault();
                break;
            case 'ArrowUp':
                state = stepActiveLineCount(state, 1, CONFIG);
                render();
                e.preventDefault();
                break;
            case 'ArrowDown':
                state = stepActiveLineCount(state, -1, CONFIG);
                render();
                e.preventDefault();
                break;
            case 'KeyH':
                if (state.phase === 'hold') {
                    state = toggleHold(state, 2, CONFIG);
                    render();
                }
                break;
        }
    };
    document.addEventListener('keydown', keydownHandler);
}

function render() {
    // ensure tips on controls
    if (!root || !state) return;
    const betInfo = getBetInfo(state, CONFIG);
    const activeArcana = getMajorArcana(state.currentArcana?.number);
    const hitCells = getHitCellSet();
    const enemy = state.battle;
    const zoneText = state.zone ? `${state.zone.label} ${state.zone.spinsRemaining}/${state.zone.totalSpins}` : '防衛戦';
    const premiumText = state.premium ? `${state.premium.label} ${state.premium.spinsRemaining}G` : '通常抽選';
    const leadRole = state.phase === 'hold'
        ? '中央ラインで HOLD を選択'
        : (state.lineSummaries[0] || '中央5枚を選んで HOLD');
    const leadEffect = state.lastEffects[0] || '演出なし';
    const isHoldPhase = state.phase === 'hold';
    const mainActionLabel = isHoldPhase ? 'DRAW/SPIN' : 'DEAL';
    const hasWin = (state.lineResults || []).some((line) => line.kind !== 'Miss');
    const showBattleStrip = !!enemy;
    const showResultStrip = isHoldPhase
        || Number(state.totalPayout || 0) > 0
        || Number(state.lastAttackDamage || 0) > 0
        || Number(state.lastEnemyDamage || 0) > 0
        || Number(state.lastTreasureCoins || 0) > 0;
    const boardSubtitle = enemy
        ? (leadEffect !== '演出なし' ? `${describeEnemy(enemy)} / ${leadEffect}` : describeEnemy(enemy))
        : isHoldPhase
            ? '残したい列だけ KEEP / HOLD'
            : hasWin
                ? (state.lineSummaries[0] || '')
                : (leadEffect !== '演出なし' ? leadEffect : '');
    const lineChoices = getLineChoices(CONFIG);
    const currentLineIndex = Math.max(0, lineChoices.indexOf(state.activeLineCount));
    const canDecreaseLines = !isHoldPhase && currentLineIndex > 0;
    const canIncreaseLines = !isHoldPhase && currentLineIndex < lineChoices.length - 1;

    root.classList.add('spin-tarot-mounted');
    root.classList.toggle('is-spinning', spinning);
    root.innerHTML = `
        <div class="spin-tarot-shell ${hasWin ? 'has-win' : ''} ${enemy ? 'is-battle-active' : ''}">
            ${renderCutin()}
            <div class="spin-tarot-viewport">
                <section class="spin-tarot-header">
                    <div class="spin-tarot-hud">
                        <div class="spin-tarot-hud-chip">🪙 ${state.coins}</div>
                        <div class="spin-tarot-hud-chip">🏰 ${Math.max(0, state.castleHp)}/${state.castleMaxHp}</div>
                        <div class="spin-tarot-hud-chip">🎚 ${zoneText}</div>
                        <div class="spin-tarot-hud-chip">🎯 LINES ${state.activeLineCount}</div>
                        <div class="spin-tarot-hud-chip">${enemy ? '⚔ 防衛戦' : `🎁 ${escapeHtml(premiumText)}`}</div>
                    </div>
                </section>

                <section class="spin-tarot-slot-panel spin-tarot-main-stage">
                    <div class="spin-tarot-board-wrap">
                        <div class="spin-tarot-board-head">
                            <div class="spin-tarot-board-kicker">${isHoldPhase ? 'CHOOSE YOUR HOLD' : (enemy ? '⚔ DEFENSE PHASE' : '🎰 SPIN POKER CORE')}</div>
                            <div class="spin-tarot-board-title">${escapeHtml(leadRole)}</div>
                            <div class="spin-tarot-stage-pills">
                                <span>${activeArcana.icon} ${escapeHtml(state.currentArcana?.label || '1. 魔術師')}</span>
                                <span>${enemy ? '⚔ 防衛戦' : `🔭 ${escapeHtml(getSuitBadge(state.previewSuit))}`}</span>
                                <span>${isHoldPhase ? '🫳 HOLD PHASE' : '🎲 DEAL PHASE'}</span>
                            </div>
                            ${boardSubtitle ? `<div class="spin-tarot-board-subtitle">${escapeHtml(boardSubtitle)}</div>` : ''}
                        </div>
                        <div class="spin-tarot-board">
                            ${state.board.map((row, rowIndex) => row.map((card, reel) => renderCard(card, rowIndex, reel, hitCells.has(`${rowIndex}:${reel}`))).join('')).join('')}
                        </div>
                        <div class="spin-tarot-hold-row">
                            ${state.board[1].map((card, reel) => `
                                <button class="spin-tarot-hold-btn ${state.holdMask[reel] ? 'is-held' : ''} ${state.lockedHolds[reel] ? 'is-locked' : ''}"
                                    data-hold-index="${reel}" ${(spinning || !isHoldPhase || state.lockedHolds[reel] || card.kind === 'blank') ? 'disabled' : ''}>
                                    ${state.lockedHolds[reel] ? 'LOCK' : state.holdMask[reel] ? 'HOLD' : 'KEEP'}
                                </button>
                            `).join('')}
                        </div>
                    </div>

                    ${showBattleStrip ? `
                        <div class="spin-tarot-battle-box spin-tarot-battle-strip ${enemy ? 'is-danger' : ''}">
                            <div class="spin-tarot-battle-title">${describeEnemy(enemy)}</div>
                            <div class="spin-tarot-bar"><span style="width:${percent(enemy.hp, enemy.maxHp)}%"></span></div>
                            <div class="spin-tarot-battle-meta">ENEMY HP ${enemy.hp}/${enemy.maxHp}</div>
                        </div>
                    ` : ''}

                    ${showResultStrip ? renderResultStrip() : ''}

                    <div class="spin-tarot-controls">
                        <div class="spin-tarot-line-controls">
                            <button class="spin-tarot-step-btn" title="ライン減少 (↑/↓キーでも変更)" data-line-step="-1" ${canDecreaseLines ? '' : 'disabled'}>-</button>
                            <div class="spin-tarot-line-readout">
                                <span>有効ライン</span>
                                <strong>${state.activeLineCount}</strong>
                            </div>
                            <button class="spin-tarot-step-btn" title="ライン増加 (↑/↓キーでも変更)" data-line-step="1" ${canIncreaseLines ? '' : 'disabled'}>+</button>
                        </div>

                        <div class="spin-tarot-bet-row">
                            ${CONFIG.betLevels.map((entry, index) => `
                                <button class="spin-tarot-bet-btn ${index === state.betIndex ? 'is-active' : ''}" title="ベット ${index+1} (←/→キーでも変更)" data-bet-index="${index}" ${spinning || isHoldPhase ? 'disabled' : ''}>
                                    ${escapeHtml(entry.label)}
                                </button>
                            `).join('')}
                        </div>
                        <div class="spin-tarot-action-row">
                            <button id="spinTarotNewRun" class="spin-tarot-ghost-btn" ${spinning ? 'disabled' : ''}>NEW RUN</button>
                            <button id="spinTarotSpinButton" class="spin-tarot-spin-btn" title="スペースキーでスピン/ディール" ${(spinning || !canSpin(state, CONFIG)) ? 'disabled' : ''}>${mainActionLabel}</button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    `;

    root.querySelectorAll('[data-sprite-index]').forEach((node) => {
        const style = getSpriteStyle(Number(node.getAttribute('data-sprite-index') || 0));
        Object.assign(node.style, style);
    });
    bindEvents();
}

function bindEvents() {
    root.querySelector('#spinTarotSpinButton')?.addEventListener('click', () => {
        handleSpin().catch((error) => console.error('[spin-tarot] spin failed:', error));
    });
    root.querySelector('#spinTarotNewRun')?.addEventListener('click', () => {
        if (cutinTimer) {
            clearTimeout(cutinTimer);
            cutinTimer = null;
        }
        state = createInitialState(CONFIG);
        cutin = null;
        render();
    });
    root.querySelectorAll('[data-bet-index]').forEach((button) => {
        button.addEventListener('click', () => {
            state = setBetIndex(state, Number(button.getAttribute('data-bet-index') || 0), CONFIG);
            render();
        });
    });
    root.querySelectorAll('[data-line-step]').forEach((button) => {
        button.addEventListener('click', () => {
            const step = Number(button.getAttribute('data-line-step') || 0);
            state = stepActiveLineCount(state, step, CONFIG);
            render();
        });
    });
    root.querySelectorAll('[data-hold-index]').forEach((button) => {
        button.addEventListener('click', () => {
            state = toggleHold(state, Number(button.getAttribute('data-hold-index') || 0), CONFIG);
            render();
        });
    });
}

async function handleSpin() {
    if (spinning || !state) return;
    const result = performSpin(state, CONFIG);
    state = result.state;
    if (!result.ok) {
        render();
        return;
    }
    spinning = true;
    if (result.events?.preAlert) vibrateOnce(38);
    render();
    await wait(CONFIG.ui.spinBounceMs);
    spinning = false;
    triggerOutcomeHaptics();
    if (result.events?.cutin) queueCutin(result.events.cutin);

    // flash winning cards
    const hasWin = (state.lineResults || []).some((line) => line.kind !== 'Miss');
    if (hasWin) {
        lastWinCoords = getHitCellSetFromState(state);
        setTimeout(() => {
            lastWinCoords = null;
            render();
        }, 800);
    }

    render();
}

function queueCutin(nextCutin) {
    cutin = nextCutin;
    if (cutinTimer) clearTimeout(cutinTimer);
    cutinTimer = setTimeout(() => {
        cutin = null;
        cutinTimer = null;
        render();
    }, CONFIG.ui.cutinMs);
}

function renderCutin() {
    if (!cutin) return '';
    return `
        <div class="spin-tarot-cutin">
            <div class="spin-tarot-cutin-art" data-sprite-index="${80 + Number(cutin.number || 0)}"></div>
            <div class="spin-tarot-cutin-copy">
                <div class="spin-tarot-cutin-title">${escapeHtml(cutin.label)}</div>
                <div class="spin-tarot-cutin-text">${escapeHtml(cutin.text || '')}</div>
            </div>
        </div>
    `;
}

function renderCard(card, row, reel, isHit) {
    const coordKey = `${row}:${reel}`;
    const isFlash = lastWinCoords && lastWinCoords.has(coordKey);
    const classes = [
        'tarot-card',
        'spin-tarot-board-card',
        getCardSuitClass(card),
        card?.kind === 'major' ? 'is-arcana' : '',
        card?.isWild ? 'all-suit spin-tarot-board-card--wild' : '',
        card?.kind === 'blank' ? 'is-hidden is-blank' : '',
        'is-static',
        row === 1 ? 'is-center' : '',
        isHit ? 'is-hit' : '',
        isFlash ? 'win-flash' : '',
        state.holdMask[reel] && row === 1 ? 'is-held-core' : ''
    ].filter(Boolean).join(' ');
    const numberLabel = card?.kind === 'blank'
        ? ''
        : card?.isWild
            ? 'W'
            : getCardFace(card);
    return `
        <div class="${classes}" style="--reel-index:${reel}; --row-index:${row};">
            <span class="tarot-card-art" data-sprite-index="${getCardSpriteIndex(card)}"></span>
            <span class="tarot-card-title">${escapeHtml(getCardTitle(card))}</span>
            <span class="tarot-card-number">${escapeHtml(numberLabel)}</span>
        </div>
    `;
}

function renderResultStrip() {
    const hasPayout = Number(state?.totalPayout || 0) > 0;
    const hasAttack = Number(state?.lastAttackDamage || 0) > 0;
    const hasDamage = Number(state?.lastEnemyDamage || 0) > 0;
    const hasTreasure = Number(state?.lastTreasureCoins || 0) > 0;
    const isHoldPhase = state?.phase === 'hold';
    const classes = [
        'spin-tarot-result-strip',
        hasPayout || hasAttack ? 'is-win' : '',
        hasDamage ? 'is-danger' : '',
        hasTreasure ? 'is-treasure' : '',
        isHoldPhase ? 'is-hold' : ''
    ].filter(Boolean).join(' ');
    const leadText = isHoldPhase
        ? '中央ラインを固定して DRAW へ'
        : hasPayout
            ? `${state.lineSummaries[0] || '役成立'} / 配当 ${state.totalPayout}`
            : hasTreasure
                ? `宝箱 ${state.lastTreasureCoins} 枚を獲得`
                : hasAttack
                    ? `攻撃 ${state.lastAttackDamage} ダメージ`
                    : hasDamage
                        ? `城壁 ${state.lastEnemyDamage} ダメージ`
                        : (state.lineSummaries[0] || '中央5枚を選んで HOLD');
    const detailItems = [
        hasPayout ? `🎯 ${state.totalPayout}` : '',
        hasAttack ? `⚔ ${state.lastAttackDamage}` : '',
        hasDamage ? `💥 ${state.lastEnemyDamage}` : '',
        hasTreasure ? `🎁 ${state.lastTreasureCoins}` : '',
        state.lastEffects[0] || ''
    ].filter(Boolean);
    return `
        <div class="${classes}">
            <div class="spin-tarot-result-main">${escapeHtml(leadText)}</div>
            <div class="spin-tarot-result-meta">
                ${detailItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
            </div>
        </div>
    `;
}

function getHitCellSet() {
    const set = new Set();
    (state.lineResults || [])
        .filter((line) => line.kind !== 'Miss')
        .forEach((line) => line.coords.forEach((coord) => set.add(`${coord.row}:${coord.reel}`)));
    return set;
}

function getHitCellSetFromState(st) {
    const set = new Set();
    (st.lineResults || [])
        .filter((line) => line.kind !== 'Miss')
        .forEach((line) => line.coords.forEach((coord) => set.add(`${coord.row}:${coord.reel}`)));
    return set;
}

function getSuitBadge(suitKey) {
    if (!suitKey) return 'なし';
    const suit = CONFIG.suits.find((entry) => entry.key === suitKey);
    if (!suit) return String(suitKey);
    return `${suit.icon} ${suit.label}`;
}

function getCardSuitClass(card) {
    if (!card || card.kind === 'blank') return 'none';
    if (card.isWild) return 'all-suit';
    if (card.suit === 'Wand') return 'wand';
    if (card.suit === 'Sword') return 'sword';
    if (card.suit === 'Cup') return 'cup';
    if (card.suit === 'Pentacle') return 'pentacle';
    return 'none';
}

function getCardTitle(card) {
    if (!card || card.kind === 'blank') return 'VOID';
    if (card.isWild) return 'WILD';
    const suit = CONFIG.suits.find((entry) => entry.key === card.suit);
    return suit?.label || 'CARD';
}

function percent(value, max) {
    const safeMax = Math.max(1, Number(max || 1));
    return Math.max(0, Math.min(100, Math.floor((Number(value || 0) / safeMax) * 100)));
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function vibrateOnce(ms = 30) {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
            navigator.vibrate(Math.max(10, Number(ms) || 30));
        } catch (_) {
            // no-op
        }
    }
}

function vibratePattern(pattern) {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
            navigator.vibrate(pattern);
        } catch (_) {
            // no-op
        }
    }
}

function triggerOutcomeHaptics() {
    if (!state || state.phase === 'hold') return;
    if (Number(state.totalPayout || 0) >= 20 || Number(state.lastTreasureCoins || 0) > 0) {
        vibratePattern([18, 24, 34]);
        return;
    }
    if (Number(state.totalPayout || 0) > 0 || Number(state.lastAttackDamage || 0) > 0) {
        vibratePattern([16, 18, 24]);
        return;
    }
    if (Number(state.lastEnemyDamage || 0) > 0) {
        vibrateOnce(26);
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
