import {
    canSpin,
    chooseArcana,
    createInitialState,
    describeEnemy,
    getBetInfo,
    getCardFace,
    getCardSpriteIndex,
    getLineChoices,
    getMajorArcana,
    getSpinTarotConfig,
    getSpinTarotStatusView,
    getSpriteStyle,
    performSpin,
    stepActiveLineCount,
    setBetIndex,
    toggleHold
} from './spinTarotEngine.js';
import { createSpinTarotBoardRenderer } from './spinTarotPhaser.js?v=20260323a';

const CONFIG = getSpinTarotConfig();
const STYLE_ID = 'spinTarotStylesheet';

let root = null;
let state = null;
let spinning = false;
let cutin = null;
let cutinTimer = null;
let lastWinCoords = null;                  // recently‑winning cells for flash effect
let lastPersistedStateJson = '';
let boardRenderer = null;
let boardRendererUnavailable = false;

// keyboard handler reference so we can remove it later
let keydownHandler = null;


export async function loadSpinTarotPage() {
    await ensureStylesheet();
    root = document.getElementById('tarotSpinRoot');
    if (!root) return;
    if (!state) state = loadPersistedState() || createInitialState(CONFIG);
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
    if (boardRenderer) {
        boardRenderer.destroy();
        boardRenderer = null;
    }
    boardRendererUnavailable = false;
    if (root) {
        root.innerHTML = '';
        root.classList.remove('spin-tarot-mounted', 'is-spinning', 'spin-tarot-phaser-active');
    }
    root = null;
    state = null;
}

function getStorageKey() {
    return String(CONFIG.adapters?.storageKey || 'spinTarotState.v2');
}

function loadPersistedState() {
    if (!CONFIG.adapters?.enablePersistence || typeof window === 'undefined' || !window.localStorage) return null;
    try {
        const raw = window.localStorage.getItem(getStorageKey());
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (Number(parsed.version) !== 2) return null;
        if (!Array.isArray(parsed.board) || !Array.isArray(parsed.holdMask) || !Array.isArray(parsed.lockedHolds)) return null;
        lastPersistedStateJson = raw;
        return parsed;
    } catch (_) {
        return null;
    }
}

function persistState(force = false) {
    if (!CONFIG.adapters?.enablePersistence || !state || typeof window === 'undefined' || !window.localStorage) return;
    try {
        const json = JSON.stringify(state);
        if (!force && json === lastPersistedStateJson) return;
        window.localStorage.setItem(getStorageKey(), json);
        lastPersistedStateJson = json;
    } catch (_) {
        // ignore quota / serialization failures
    }
}


async function ensureStylesheet() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = './css/spin-tarot.css?v=20260323c';
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
            case 'Digit1':
                if (Array.isArray(state.pendingArcanaChoices) && state.pendingArcanaChoices.length) {
                    applyArcanaChoice(0);
                    e.preventDefault();
                }
                break;
            case 'Digit2':
                if (Array.isArray(state.pendingArcanaChoices) && state.pendingArcanaChoices.length > 1) {
                    applyArcanaChoice(1);
                    e.preventDefault();
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
    const statusView = getSpinTarotStatusView(state, CONFIG);
    const hitCells = getHitCellSet();
    const enemy = state.battle;
    const zoneText = enemy
        ? '敵襲中'
        : state.zone
            ? `${state.zone.label} ${state.zone.spinsRemaining}/${state.zone.totalSpins}`
            : state.premium
                ? '報酬区間'
                : '待機';
    const premiumText = state.premium ? `${state.premium.label} ${state.premium.spinsRemaining}G` : '通常抽選';
    const hasArcanaChoice = Array.isArray(state.pendingArcanaChoices) && state.pendingArcanaChoices.length > 0;
    const modeChipText = statusView.modeTurns > 0
        ? `${statusView.modeIcon} ${statusView.modeLabel} ${statusView.modeTurns}G`
        : `${statusView.modeIcon} ${statusView.modeLabel}`;
    const modeHudText = statusView.modeTurns > 0
        ? `${statusView.modeIcon} ${getCompactModeLabel(statusView.modeKey)} ${statusView.modeTurns}G`
        : `${statusView.modeIcon} ${getCompactModeLabel(statusView.modeKey)}`;
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
    const latestLog = Array.isArray(state.logs) && state.logs.length ? state.logs[0] : 'No events yet.';
    const progressSummary = buildProgressSummary(statusView);
    const monitorView = buildMonitorView({
        statusView,
        activeArcana,
        modeChipText,
        zoneText,
        premiumText,
        latestLog,
        boardSubtitle
    });
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
                        <div class="spin-tarot-hud-chip">${escapeHtml(modeHudText)}</div>
                    </div>
                </section>

                <section class="spin-tarot-monitor spin-tarot-monitor--${escapeHtml(monitorView.theme)}">
                    <div class="spin-tarot-monitor-bezel">
                        <div class="spin-tarot-monitor-leds" aria-hidden="true">
                            <span></span><span></span><span></span>
                        </div>
                        <div class="spin-tarot-monitor-screen">
                            <div class="spin-tarot-monitor-screen-inner">
                                <div class="spin-tarot-monitor-topline">
                                    <span class="spin-tarot-monitor-mode">${escapeHtml(monitorView.mode)}</span>
                                    <span class="spin-tarot-monitor-zone">${escapeHtml(monitorView.zone)}</span>
                                </div>
                                <div class="spin-tarot-monitor-headline">${escapeHtml(monitorView.headline)}</div>
                                <div class="spin-tarot-monitor-subline">${escapeHtml(monitorView.subline)}</div>
                                <div class="spin-tarot-monitor-metrics">
                                    ${monitorView.metrics.map((metric) => renderMonitorMetric(metric.label, metric.value)).join('')}
                                </div>
                                <div class="spin-tarot-monitor-marquee-wrap">
                                    <div class="spin-tarot-monitor-marquee">
                                        <span>${escapeHtml(monitorView.ticker)}</span>
                                        <span>${escapeHtml(monitorView.ticker)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="spin-tarot-arcana-panel">
                    <div class="spin-tarot-arcana-art" data-sprite-index="${80 + Number(state.currentArcana?.number || 1)}"></div>
                    <div class="spin-tarot-arcana-copy">
                        <div class="spin-tarot-arcana-kicker">${escapeHtml(modeChipText)}</div>
                        <div class="spin-tarot-board-title">${activeArcana.icon} ${escapeHtml(state.currentArcana?.label || '1. 魔術師')}</div>
                        <div class="spin-tarot-arcana-text">${escapeHtml(state.currentArcana?.summary || activeArcana.summary || '')}</div>
                        <div class="spin-tarot-quick-grid">
                            ${renderMiniChip('神託', getSuitBadge(state.previewSuit))}
                            ${renderMiniChip('予兆', `${statusView.omenGauge}/${statusView.omenGaugeMax}`)}
                            ${renderMiniChip('女王', `${statusView.queenGauge}/${statusView.queenGaugeMax}`)}
                            ${renderMiniChip('王', `${statusView.kingGauge}/${statusView.kingGaugeMax}`)}
                            ${renderMiniChip('RANK', String(state.nationRank || 1))}
                            ${renderMiniChip('人口', String(state.population || 0))}
                            ${renderMiniChip('騎士', String(state.knights || 0))}
                            ${renderMiniChip('司祭', String(state.bishops || 0))}
                            ${renderMiniChip('魔術', String(state.mages || 0))}
                            ${renderMiniChip('特化', buildRushSummary(statusView, premiumText))}
                        </div>
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
                        <div class="spin-tarot-board-stack">
                            <div class="spin-tarot-board">
                                ${state.board.map((row, rowIndex) => row.map((card, reel) => renderCard(card, rowIndex, reel, hitCells.has(`${rowIndex}:${reel}`))).join('')).join('')}
                            </div>
                            <div id="spinTarotBoardPhaser" class="spin-tarot-board-phaser" aria-hidden="true"></div>
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

                    ${showResultStrip ? renderResultStrip(statusView) : ''}

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

                ${hasArcanaChoice ? `
                    <section class="spin-tarot-battle-box spin-tarot-arcana-choice-box">
                        <div class="spin-tarot-battle-title">CHOOSE NEXT ARCANA</div>
                        <div class="spin-tarot-battle-meta">Keep your current flow or switch into a new major arcana.</div>
                        ${renderArcanaChoices(state.pendingArcanaChoices)}
                    </section>
                ` : ''}

                <section class="spin-tarot-foot">
                    <details class="spin-tarot-collapse" open>
                        <summary>
                            <span class="spin-tarot-collapse-title">PROGRESS</span>
                            <span class="spin-tarot-collapse-summary">${escapeHtml(progressSummary)}</span>
                        </summary>
                        <div class="spin-tarot-collapse-body">
                            <div class="spin-tarot-quick-grid spin-tarot-progress-grid">
                                ${renderMiniChip(statusView.modeKey === 'cz' ? 'CZ POWER' : 'CZ NEXT', statusView.modeKey === 'cz' ? `${statusView.czPower}/${statusView.czTarget}` : String(statusView.nextCzIn))}
                                ${renderMiniChip(statusView.queenModeSpins > 0 ? 'QUEEN G' : 'QUEEN NEXT', statusView.queenModeSpins > 0 ? `${statusView.queenModeSpins}G` : String(statusView.nextQueenIn))}
                                ${renderMiniChip(statusView.kingModeSpins > 0 ? 'KING G' : 'KING NEXT', statusView.kingModeSpins > 0 ? `${statusView.kingModeSpins}G` : String(statusView.nextKingIn))}
                                ${renderMiniChip('MISS', String(statusView.missStreak))}
                                ${renderMiniChip('ARCANA', `${statusView.spinsUntilArcanaShift}G`)}
                                ${renderMiniChip('TREASURE CD', String(statusView.treasureCooldownSpins || 0))}
                                ${renderMiniChip('OMEN SUIT', getSuitBadge(state.previewSuit))}
                            </div>
                        </div>
                    </details>
                    <details class="spin-tarot-collapse">
                        <summary>
                            <span class="spin-tarot-collapse-title">EVENT LOG</span>
                            <span class="spin-tarot-collapse-summary">${escapeHtml(latestLog)}</span>
                        </summary>
                        <div class="spin-tarot-collapse-body">
                            <div class="spin-tarot-log">
                                ${renderLogEntries(state.logs)}
                            </div>
                        </div>
                    </details>
                </section>
            </div>
        </div>
    `;

    root.querySelectorAll('[data-sprite-index]').forEach((node) => {
        const style = getSpriteStyle(Number(node.getAttribute('data-sprite-index') || 0));
        Object.assign(node.style, style);
    });
    bindEvents();
    syncBoardRenderer(hitCells);
    persistState();
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
        lastPersistedStateJson = '';
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
    root.querySelectorAll('[data-arcana-choice]').forEach((button) => {
        button.addEventListener('click', () => {
            applyArcanaChoice(Number(button.getAttribute('data-arcana-choice') || 0));
        });
    });
}

function syncBoardRenderer(hitCells = getHitCellSet()) {
    if (!root || !state || boardRendererUnavailable) return;
    const container = root.querySelector('#spinTarotBoardPhaser');
    if (!container) return;
    if (!boardRenderer) {
        try {
            boardRenderer = createSpinTarotBoardRenderer({
                container,
                onReady: () => {
                    if (!root) return;
                    boardRenderer?.update(buildBoardRenderState(getHitCellSet()));
                    syncBoardRendererVisibility();
                }
            });
        } catch (error) {
            boardRendererUnavailable = true;
            console.error('[spin-tarot] phaser board disabled:', error);
            return;
        }
    }
    boardRenderer.attach(container);
    boardRenderer.update(buildBoardRenderState(hitCells));
    syncBoardRendererVisibility();
}

function syncBoardRendererVisibility() {
    if (!root) return;
    const rendererReady = !!boardRenderer?.isReady();
    // Keep Phaser in front only during the actual spin and the short win showcase.
    // Static hold / battle screens read better with the DOM cards as the primary board.
    const showPhaserPrimary = rendererReady && (spinning || !!lastWinCoords);
    root.classList.toggle('spin-tarot-phaser-active', showPhaserPrimary);
}

function applyArcanaChoice(choiceIndex) {
    state = chooseArcana(state, choiceIndex, CONFIG);
    if (state?.lastCutin) queueCutin(state.lastCutin);
    render();
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
    if (result.events?.preAlert) vibrateOnce(65);
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

function buildBoardRenderState(hitCells = getHitCellSet()) {
    const statusView = getSpinTarotStatusView(state, CONFIG);
    const revealOutcome = !spinning;
    const activeHitCells = revealOutcome ? hitCells : new Set();
    const flashCells = revealOutcome ? (lastWinCoords || new Set()) : new Set();
    const winningLines = revealOutcome ? (state?.lineResults || [])
        .filter((line) => line.kind !== 'Miss')
        .map((line) => ({
            id: String(line.id || ''),
            kind: String(line.kind || ''),
            coords: (line.coords || []).map((coord) => ({ row: coord.row, reel: coord.reel }))
        })) : [];
    const lineSweepKey = winningLines.length
        ? `${state?.spinCount || 0}:${winningLines.map((line) => `${line.id}:${line.kind}`).join('|')}:${state?.totalPayout || 0}:${state?.lastAttackDamage || 0}`
        : '';
    const resultInfo = revealOutcome ? getBoardResultInfo() : { text: '', tone: 'idle', pulseKey: '' };
    return {
        spinning,
        isBattle: !!state?.battle,
        isHoldPhase: state?.phase === 'hold',
        hasWin: revealOutcome && (state?.lineResults || []).some((line) => line.kind !== 'Miss'),
        modeKey: statusView.modeKey,
        modeLabel: statusView.modeLabel,
        modeIcon: statusView.modeIcon,
        stageHint: getBoardStageHint(),
        resultText: resultInfo.text,
        resultTone: resultInfo.tone,
        resultPulseKey: resultInfo.pulseKey,
        winningLines,
        lineSweepKey,
        cards: state.board.flatMap((row, rowIndex) => row.map((card, reel) => buildBoardCardState(card, rowIndex, reel, activeHitCells, flashCells)))
    };
}

function getBoardStageHint() {
    if (spinning) return 'REELS SPINNING...';
    if (state?.battle) return describeEnemy(state.battle);
    if (state?.phase === 'hold') return 'KEEP / HOLD the center line';
    if (state?.lineSummaries?.length) return state.lineSummaries[0];
    if (state?.lastEffects?.[0]) return state.lastEffects[0];
    return getSuitBadge(state?.previewSuit);
}

function getBoardResultInfo() {
    if (state?.phase === 'hold') {
        return { text: 'HOLD & DRAW', tone: 'hold', pulseKey: '' };
    }
    if (Number(state?.totalPayout || 0) > 0) {
        return {
            text: `+${state.totalPayout} COIN`,
            tone: 'win',
            pulseKey: `coin:${state.spinCount}:${state.totalPayout}`
        };
    }
    if (Number(state?.lastTreasureCoins || 0) > 0) {
        return {
            text: `TREASURE +${state.lastTreasureCoins}`,
            tone: 'treasure',
            pulseKey: `treasure:${state.spinCount}:${state.lastTreasureCoins}`
        };
    }
    if (Number(state?.lastAttackDamage || 0) > 0) {
        return {
            text: `ATK ${state.lastAttackDamage}`,
            tone: 'win',
            pulseKey: `atk:${state.spinCount}:${state.lastAttackDamage}`
        };
    }
    if (Number(state?.lastEnemyDamage || 0) > 0) {
        return {
            text: `CASTLE -${state.lastEnemyDamage}`,
            tone: 'danger',
            pulseKey: `dmg:${state.spinCount}:${state.lastEnemyDamage}`
        };
    }
    return { text: '', tone: 'idle', pulseKey: '' };
}

function buildBoardCardState(card, row, reel, hitCells, flashCells) {
    const isBlank = !card || card.kind === 'blank';
    return {
        kind: card?.kind || 'blank',
        suit: card?.suit || '',
        spriteIndex: getCardSpriteIndex(card),
        title: isBlank
            ? ''
            : card?.kind === 'major'
                ? 'ARCANA'
                : getCardTitle(card),
        face: isBlank
            ? ''
            : card?.kind === 'major'
                ? String(card?.number || '')
                : getCardFace(card),
        heldCore: row === 1 && !!state?.holdMask?.[reel],
        isHit: hitCells.has(`${row}:${reel}`),
        isFlash: flashCells.has(`${row}:${reel}`)
    };
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

function renderMiniChip(key, value) {
    return `
        <div class="spin-tarot-mini-chip">
            <div class="spin-tarot-mini-key">${escapeHtml(key)}</div>
            <div class="spin-tarot-mini-value">${escapeHtml(value)}</div>
        </div>
    `;
}

function renderMonitorMetric(label, value) {
    return `
        <div class="spin-tarot-monitor-metric">
            <div class="spin-tarot-monitor-metric-label">${escapeHtml(label)}</div>
            <div class="spin-tarot-monitor-metric-value">${escapeHtml(value)}</div>
        </div>
    `;
}

function buildMonitorView({ statusView, activeArcana, modeChipText, zoneText, premiumText, latestLog, boardSubtitle }) {
    const metrics = buildMonitorMetrics(statusView, premiumText);
    const resultInfo = getBoardResultInfo();
    let theme = 'normal';
    let headline = 'SPIN TAROT';
    let subline = boardSubtitle || latestLog || '';

    if (cutin?.label) {
        theme = 'impact';
        headline = cutin.label;
        subline = cutin.text || subline;
    } else if (Array.isArray(state?.pendingArcanaChoices) && state.pendingArcanaChoices.length) {
        theme = 'arcana';
        headline = 'CHOOSE NEXT ARCANA';
        subline = 'Keep the current flow or switch into a new major arcana.';
    } else if (spinning) {
        theme = 'spin';
        headline = 'REEL DRIVE';
        subline = 'Watch the omen and wait for the stop.';
    } else if (state?.battle) {
        theme = 'danger';
        headline = `${state.battle.emoji || '⚔️'} ${state.battle.label || 'DEFENSE BATTLE'}`;
        subline = `Enemy HP ${state.battle.hp}/${state.battle.maxHp}  ATK ${state.battle.attack}`;
    } else if (resultInfo.text) {
        theme = resultInfo.tone === 'danger'
            ? 'danger'
            : resultInfo.tone === 'treasure'
                ? 'treasure'
                : 'reward';
        headline = resultInfo.text;
        subline = state?.lineSummaries?.[0] || boardSubtitle || latestLog || '';
    } else if (state?.phase === 'hold') {
        theme = 'hold';
        headline = 'HOLD & DRAW';
        subline = 'Lock the center line you want to carry into the draw.';
    } else if (statusView?.modeKey === 'cz') {
        theme = 'cz';
        headline = 'DEFENSE CHANCE ZONE';
        subline = `CZ POWER ${statusView.czPower}/${statusView.czTarget}`;
    } else if (statusView?.modeKey === 'queen-rush' || statusView?.modeKey === 'king-rush' || statusView?.modeKey === 'dual-rush') {
        theme = 'rush';
        headline = `${statusView.modeIcon} ${statusView.modeLabel}`;
        subline = premiumText !== '通常抽選' ? premiumText : (state?.lastEffects?.[0] || activeArcana.summary || '');
    } else if (statusView?.modeKey === 'high' || statusView?.modeKey === 'hint') {
        theme = 'omen';
        headline = `${statusView.modeIcon} ${statusView.modeLabel}`;
        subline = `Approaching ${getSuitBadge(state.previewSuit)} / CZ in ${statusView.nextCzIn}`;
    } else if (statusView?.modeKey === 'treasure') {
        theme = 'treasure';
        headline = premiumText.toUpperCase();
        subline = 'Bonus spins with coin chests and calm seas.';
    } else {
        theme = 'normal';
        headline = `${activeArcana.icon} ${state?.currentArcana?.label || '1. 魔術師'}`;
        subline = activeArcana.summary || boardSubtitle || latestLog || '';
    }

    return {
        theme,
        mode: modeChipText,
        zone: zoneText,
        headline,
        subline,
        metrics,
        ticker: buildMonitorTicker(latestLog, metrics)
    };
}

function buildMonitorMetrics(statusView, premiumText) {
    const metrics = [
        { label: 'OMEN', value: `${statusView.omenGauge}/${statusView.omenGaugeMax}` },
        { label: state?.battle ? 'TARGET' : 'SUIT', value: state?.battle ? `${state.battle.hp}/${state.battle.maxHp}` : getSuitBadge(state.previewSuit) },
        { label: statusView.modeKey === 'cz' ? 'CZ' : 'NEXT CZ', value: statusView.modeKey === 'cz' ? `${statusView.czPower}/${statusView.czTarget}` : String(statusView.nextCzIn) },
        { label: 'RUSH', value: buildRushSummary(statusView, premiumText) }
    ];
    if (Number(state?.totalPayout || 0) > 0) {
        metrics[0] = { label: 'PAYOUT', value: `+${state.totalPayout}` };
    } else if (Number(state?.lastTreasureCoins || 0) > 0) {
        metrics[0] = { label: 'TREASURE', value: `+${state.lastTreasureCoins}` };
    } else if (Number(state?.lastEnemyDamage || 0) > 0) {
        metrics[0] = { label: 'DAMAGE', value: `-${state.lastEnemyDamage}` };
    }
    return metrics;
}

function buildMonitorTicker(latestLog, metrics) {
    const metricText = metrics.map((metric) => `${metric.label} ${metric.value}`).join('  //  ');
    const lead = latestLog || 'No events yet.';
    return `${lead}  //  ${metricText}  //  ${lead}`;
}

function renderArcanaChoices(choices) {
    if (!Array.isArray(choices) || !choices.length) return '';
    return `
        <div class="spin-tarot-arcana-choice-row">
            ${choices.map((arcana, index) => `
                <button class="spin-tarot-arcana-choice-btn" data-arcana-choice="${index}">
                    <span class="spin-tarot-arcana-choice-kicker">${escapeHtml(arcana.icon || '')} OPTION ${index + 1}</span>
                    <span class="spin-tarot-arcana-choice-title">${escapeHtml(arcana.label || `${arcana.number}. ARCANA`)}</span>
                    <span class="spin-tarot-arcana-choice-text">${escapeHtml(arcana.summary || '')}</span>
                </button>
            `).join('')}
        </div>
    `;
}

function renderResultStrip(statusView) {
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
        ? 'Choose the center line, then DRAW.'
        : hasPayout
            ? `${state.lineSummaries[0] || 'Role hit'} / payout ${state.totalPayout}`
            : hasTreasure
                ? `Treasure +${state.lastTreasureCoins} coins`
                : hasAttack
                    ? `Attack ${state.lastAttackDamage} damage`
                    : hasDamage
                        ? `Castle -${state.lastEnemyDamage} damage`
                        : (state.lineSummaries[0] || 'Pick a center line and HOLD');
    const detailItems = [
        hasPayout ? `COIN ${state.totalPayout}` : '',
        hasAttack ? `ATK ${state.lastAttackDamage}` : '',
        hasDamage ? `DMG ${state.lastEnemyDamage}` : '',
        hasTreasure ? `TREASURE ${state.lastTreasureCoins}` : '',
        statusView?.modeKey === 'cz'
            ? `CZ ${statusView.czPower}/${statusView.czTarget}`
            : `CZ NEXT ${statusView?.nextCzIn ?? 0}`,
        statusView?.queenModeSpins > 0
            ? `QUEEN ${statusView.queenModeSpins}G`
            : `QUEEN ${statusView?.nextQueenIn ?? 0}`,
        statusView?.kingModeSpins > 0
            ? `KING ${statusView.kingModeSpins}G`
            : `KING ${statusView?.nextKingIn ?? 0}`,
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

function renderLogEntries(logs) {
    if (!Array.isArray(logs) || !logs.length) {
        return '<div class="spin-tarot-log-entry">No events yet.</div>';
    }
    return logs
        .map((entry) => `<div class="spin-tarot-log-entry">${escapeHtml(entry)}</div>`)
        .join('');
}

function buildProgressSummary(statusView) {
    if (statusView.modeKey === 'cz') {
        return `CZ ${statusView.czPower}/${statusView.czTarget} / QUEEN ${statusView.nextQueenIn} / KING ${statusView.nextKingIn}`;
    }
    const rushParts = [];
    if (statusView.queenModeSpins > 0) rushParts.push(`QUEEN ${statusView.queenModeSpins}G`);
    if (statusView.kingModeSpins > 0) rushParts.push(`KING ${statusView.kingModeSpins}G`);
    if (statusView.treasureCooldownSpins > 0) rushParts.push(`TREASURE CD ${statusView.treasureCooldownSpins}`);
    if (!rushParts.length) rushParts.push(`CZ ${statusView.nextCzIn}`);
    return `${rushParts.join(' / ')} / QUEEN ${statusView.nextQueenIn} / KING ${statusView.nextKingIn}`;
}

function buildRushSummary(statusView, premiumText) {
    const parts = [];
    if (statusView.queenModeSpins > 0) parts.push(`QUEEN ${statusView.queenModeSpins}G`);
    if (statusView.kingModeSpins > 0) parts.push(`KING ${statusView.kingModeSpins}G`);
    if (statusView.modeKey === 'cz') parts.push(`CZ ${statusView.czPower}/${statusView.czTarget}`);
    if (!parts.length && state?.premium) parts.push(premiumText);
    if (!parts.length) parts.push('IDLE');
    return parts.join(' / ');
}

function getCompactModeLabel(modeKey) {
    if (modeKey === 'boss') return 'BOSS';
    if (modeKey === 'battle') return '防衛戦';
    if (modeKey === 'treasure') return 'BONUS';
    if (modeKey === 'cz') return 'CZ';
    if (modeKey === 'high') return '高確';
    if (modeKey === 'hint') return '前兆';
    if (modeKey === 'queen-rush') return '星告';
    if (modeKey === 'king-rush') return '王権';
    if (modeKey === 'dual-rush') return '双冠';
    if (modeKey === 'gameover') return '崩壊';
    return '通常';
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
        vibratePattern([60, 40, 90]);
        return;
    }
    if (Number(state.totalPayout || 0) > 0 || Number(state.lastAttackDamage || 0) > 0) {
        vibratePattern([50, 35, 70]);
        return;
    }
    if (Number(state.lastEnemyDamage || 0) > 0) {
        vibrateOnce(55);
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
