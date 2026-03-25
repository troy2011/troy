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
    getScaledSpriteStyle,
    getSpriteStyle,
    performSpin,
    stepActiveLineCount,
    setBetIndex,
    toggleHold
} from './spinTarotEngine.js';
import { createSpinTarotBoardRenderer } from './spinTarotPhaser.js?v=20260325a';

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

const DEFENSE_ROLE_PRIORITY = {
    RoyalStraightFlush: 10,
    StraightFlush: 9,
    FourKindHigh: 8,
    FourKindLow: 7,
    FullHouse: 6,
    Flush: 5,
    Straight: 4,
    ThreeKind: 3,
    TwoPair: 2,
    OnePair: 1,
    Miss: 0
};

const DEFENSE_ROLE_GUIDE = {
    OnePair: {
        icon: '♙',
        title: '民兵迎撃',
        short: 'PAWN GUARD',
        summary: 'ワンペアで民兵が前線を押し返す。',
        motion: 'march',
        role: 'guard',
        effect: 'spark'
    },
    TwoPair: {
        icon: '♘',
        title: '騎士突撃',
        short: 'KNIGHT CHARGE',
        summary: 'ツーペアで騎士が槍を揃えて突撃。',
        motion: 'rush',
        role: 'guard',
        effect: 'burst'
    },
    ThreeKind: {
        icon: '♗',
        title: '司祭砲撃',
        short: 'BISHOP SHOT',
        summary: 'スリーカードで司祭が一点突破の祈撃。',
        motion: 'clash',
        role: 'support',
        effect: 'spark'
    },
    Straight: {
        icon: '♘',
        title: '戦列進軍',
        short: 'FORMATION PUSH',
        summary: 'ストレートで横一列の隊列が前へ進む。',
        motion: 'rush',
        role: 'guard',
        effect: 'blink'
    },
    Flush: {
        icon: '🪄',
        title: '魔術斉射',
        short: 'MAGE BARRAGE',
        summary: 'フラッシュで同属性の魔術が降り注ぐ。',
        motion: 'hover',
        role: 'support',
        effect: 'spark'
    },
    FullHouse: {
        icon: '♘♗',
        title: '混成進軍',
        short: 'MIXED ASSAULT',
        summary: 'フルハウスで騎士と司祭が同時に踏み込む。',
        motion: 'rush',
        role: 'guard',
        effect: 'burst'
    },
    FourKindLow: {
        icon: '🎴',
        title: '大アルカナ砲撃',
        short: 'ARCANA BLAST',
        summary: '4カードで大アルカナが戦場へ介入。',
        motion: 'arcana',
        role: 'arcana',
        effect: 'burst'
    },
    FourKindHigh: {
        icon: '👑',
        title: '王権断罪',
        short: 'ROYAL JUDGEMENT',
        summary: '高位4カードで王権級の裁きが落ちる。',
        motion: 'arcana',
        role: 'arcana',
        effect: 'burst'
    },
    StraightFlush: {
        icon: '♕',
        title: '王国総攻撃',
        short: 'KINGDOM RUSH',
        summary: 'ストフラで王国軍が総出撃する。',
        motion: 'arcana',
        role: 'arcana',
        effect: 'burst'
    },
    RoyalStraightFlush: {
        icon: '🌍',
        title: '世界改変',
        short: 'WORLD BREAK',
        summary: 'ロイヤルで戦場の運命ごと塗り替える。',
        motion: 'arcana',
        role: 'arcana',
        effect: 'burst'
    },
    Miss: {
        icon: '👾',
        title: '敵前進',
        short: 'ENEMY PUSH',
        summary: 'ハズレ。敵が城へ迫る。',
        motion: 'rush',
        role: 'enemy',
        effect: 'blink'
    }
};

function getPrimaryBoardRowIndex(board) {
    const rowCount = Array.isArray(board) && board.length ? board.length : 1;
    return Math.max(0, Math.floor((rowCount - 1) / 2));
}


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
    link.href = './css/spin-tarot.css?v=20260325a';
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
    const defenseView = buildDefenseView(activeArcana);
    const primaryBoardRowIndex = getPrimaryBoardRowIndex(state.board);
    const primaryBoardRow = Array.isArray(state.board?.[primaryBoardRowIndex]) ? state.board[primaryBoardRowIndex] : [];
    const leadRole = state.phase === 'hold'
        ? '5枚の手札から HOLD を選択'
        : (state.lineSummaries[0] || '5枚の手札を選んで HOLD');
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
    const resolvedLeadRole = isHoldPhase ? leadRole : (defenseView.lead || leadRole);
    const resolvedBoardSubtitle = enemy
        ? (defenseView.hasRole ? `${describeEnemy(enemy)} / ${defenseView.detail}` : boardSubtitle)
        : isHoldPhase
            ? boardSubtitle
            : hasWin
                ? (defenseView.detail || boardSubtitle)
                : boardSubtitle;
    const latestLog = Array.isArray(state.logs) && state.logs.length ? state.logs[0] : 'No events yet.';
    const progressSummary = buildProgressSummary(statusView);
    const monitorView = buildMonitorView({
        statusView,
        activeArcana,
        modeChipText,
        zoneText,
        premiumText,
        latestLog,
        boardSubtitle: resolvedBoardSubtitle,
        defenseView
    });
    const lineChoices = getLineChoices(CONFIG);
    const currentLineIndex = Math.max(0, lineChoices.indexOf(state.activeLineCount));
    const canDecreaseLines = !isHoldPhase && currentLineIndex > 0;
    const canIncreaseLines = !isHoldPhase && currentLineIndex < lineChoices.length - 1;
    const showLineControls = lineChoices.length > 1;

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
                        <div class="spin-tarot-hud-chip">🎯 HAND ${state.activeLineCount}</div>
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
                                <div class="spin-tarot-monitor-lane spin-tarot-monitor-lane--${escapeHtml(monitorView.theme)}">
                                    <div class="spin-tarot-monitor-lane-title">${escapeHtml(monitorView.title)}</div>
                                    <div class="spin-tarot-monitor-sky">
                                        ${monitorView.skyIcons.map((icon, index) => renderMonitorSkyIcon(icon, index)).join('')}
                                    </div>
                                    <div class="spin-tarot-monitor-wave">
                                        ${monitorView.enemyWave.map((node, index) => renderMonitorWaveNode(node, index)).join('')}
                                    </div>
                                    <div class="spin-tarot-monitor-castle-wrap ${escapeHtml(monitorView.castleTone || '')}">
                                        <span class="spin-tarot-monitor-castle">🏰</span>
                                        <span class="spin-tarot-monitor-castle-guard">🛡️</span>
                                    </div>
                                    <div class="spin-tarot-monitor-garrison">
                                        ${monitorView.garrison.map((unit) => renderMonitorGarrisonUnit(unit)).join('')}
                                    </div>
                                    <div class="spin-tarot-monitor-threat">
                                        <span class="spin-tarot-monitor-threat-fill is-${escapeHtml(monitorView.threatTone || 'danger')}" style="width:${Math.max(0, Math.min(100, Number(monitorView.threatPercent) || 0))}%;"></span>
                                    </div>
                                    <div class="spin-tarot-monitor-actor-layer">
                                        ${monitorView.actors.map((actor, index) => renderMonitorActor(actor, index)).join('')}
                                    </div>
                                    <div class="spin-tarot-monitor-effect-layer">
                                        ${monitorView.effects.map((effect, index) => renderMonitorEffect(effect, index)).join('')}
                                    </div>
                                </div>
                                <div class="spin-tarot-monitor-readout">
                                    <div class="spin-tarot-monitor-subline">${escapeHtml(monitorView.caption)}</div>
                                    <div class="spin-tarot-monitor-badges">
                                        ${monitorView.badges.map((badge) => renderMonitorBadge(badge)).join('')}
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
                            <div class="spin-tarot-board-title">${escapeHtml(resolvedLeadRole)}</div>
                            <div class="spin-tarot-stage-pills">
                                <span>${activeArcana.icon} ${escapeHtml(state.currentArcana?.label || '1. 魔術師')}</span>
                                <span>${enemy ? '⚔ 防衛戦' : `🔭 ${escapeHtml(getSuitBadge(state.previewSuit))}`}</span>
                                <span>${isHoldPhase ? '🫳 HOLD PHASE' : '🎲 DEAL PHASE'}</span>
                            </div>
                            ${resolvedBoardSubtitle ? `<div class="spin-tarot-board-subtitle">${escapeHtml(resolvedBoardSubtitle)}</div>` : ''}
                        </div>
                        <div class="spin-tarot-board-stack">
                            <div class="spin-tarot-board">
                                ${state.board.map((row, rowIndex) => row.map((card, reel) => renderCard(card, rowIndex, reel, hitCells.has(`${rowIndex}:${reel}`))).join('')).join('')}
                            </div>
                            <div id="spinTarotBoardPhaser" class="spin-tarot-board-phaser" aria-hidden="true"></div>
                        </div>
                        <div class="spin-tarot-hold-row">
                            ${primaryBoardRow.map((card, reel) => `
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
                        ${showLineControls ? `
                            <div class="spin-tarot-line-controls">
                                <button class="spin-tarot-step-btn" title="ライン減少 (↑/↓キーでも変更)" data-line-step="-1" ${canDecreaseLines ? '' : 'disabled'}>-</button>
                                <div class="spin-tarot-line-readout">
                                    <span>有効ライン</span>
                                    <strong>${state.activeLineCount}</strong>
                                </div>
                                <button class="spin-tarot-step-btn" title="ライン増加 (↑/↓キーでも変更)" data-line-step="1" ${canIncreaseLines ? '' : 'disabled'}>+</button>
                            </div>
                        ` : ''}

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
        const spriteIndex = Number(node.getAttribute('data-sprite-index') || 0);
        const rect = node.getBoundingClientRect();
        const scaledWidth = rect.width || node.clientWidth || parseFloat(window.getComputedStyle(node).width) || 0;
        const scaledHeight = rect.height || node.clientHeight || parseFloat(window.getComputedStyle(node).height) || 0;
        const style = node.classList.contains('spin-tarot-arcana-art') || node.classList.contains('spin-tarot-cutin-art')
            ? getScaledSpriteStyle(spriteIndex, scaledWidth, scaledHeight)
            : getSpriteStyle(spriteIndex);
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
    const defenseView = buildDefenseView(getMajorArcana(state?.currentArcana?.number));
    if (spinning) return 'REELS SPINNING...';
    if (state?.battle) return describeEnemy(state.battle);
    if (state?.phase === 'hold') return 'Choose cards to HOLD';
    if (defenseView?.hasRole) return defenseView.lead;
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

function getDefenseRoleGuide(kind) {
    return DEFENSE_ROLE_GUIDE[String(kind || 'Miss')] || DEFENSE_ROLE_GUIDE.Miss;
}

function getPrimaryDefenseLine(lines) {
    const roleLines = Array.isArray(lines) ? lines.filter((line) => line && line.kind && line.kind !== 'Miss') : [];
    if (!roleLines.length) return null;
    return roleLines
        .slice()
        .sort((left, right) => {
            const priorityDiff = (DEFENSE_ROLE_PRIORITY[right.kind] || 0) - (DEFENSE_ROLE_PRIORITY[left.kind] || 0);
            if (priorityDiff !== 0) return priorityDiff;
            return Number(right.multiplier || 0) - Number(left.multiplier || 0);
        })[0] || null;
}

function buildDefenseView(activeArcana) {
    const actionQueue = Array.isArray(state?.lastDefenseActions)
        ? state.lastDefenseActions.filter((action) => action && (action.label || action.short || action.icon))
        : [];
    const roleLines = Array.isArray(state?.lineResults)
        ? state.lineResults.filter((line) => line && line.kind && line.kind !== 'Miss')
        : [];
    const primaryLine = getPrimaryDefenseLine(roleLines);
    const supportLines = primaryLine
        ? roleLines.filter((line) => line !== primaryLine).slice(0, 2)
        : [];
    const primaryGuide = getDefenseRoleGuide(primaryLine?.kind || 'Miss');
    const supportGuides = supportLines.map((line) => getDefenseRoleGuide(line.kind));
    const unitBadges = [
        state?.knights > 0 ? `♘${state.knights}` : '',
        state?.bishops > 0 ? `♗${state.bishops}` : '',
        state?.mages > 0 ? `🪄${state.mages}` : '',
        state?.population > 0 ? `♙${state.population}` : ''
    ].filter(Boolean).join(' ');
    const attackText = Number(state?.lastAttackDamage || 0) > 0 ? `ATK ${state.lastAttackDamage}` : '';
    const damageText = Number(state?.lastEnemyDamage || 0) > 0 ? `CASTLE -${state.lastEnemyDamage}` : '';

    if (actionQueue.length) {
        const primaryAction = actionQueue[0];
        const supportActions = actionQueue.slice(1, 3);
        const isEnemyPush = String(primaryAction?.role || '') === 'enemy';
        const weaknessText = primaryAction?.weaknessHit
            ? `${primaryAction.weaknessIcon || '🪄'} ${primaryAction.weaknessLabel || 'WEAK'} x${Number(primaryAction.weaknessMultiplier || 1).toFixed(2)}`
            : '';
        const actors = actionQueue.slice(0, 3).map((action, index) => ({
            emoji: action.icon || '⚔️',
            side: isEnemyPush && index === 0 ? 'right' : 'left',
            slot: index,
            motion: action.motion || (isEnemyPush ? 'rush' : 'march'),
            role: action.role || (isEnemyPush ? 'enemy' : 'support'),
            size: index === 0 ? 30 : 22,
            bottom: index === 0 ? 10 : (22 - (index * 4)),
            delayMs: index * 110,
            travel: action.motion === 'rush' ? 34 : 16,
            durationMs: index === 0 ? 760 : 620,
            once: true
        }));
        if (activeArcana?.icon && !actors.some((actor) => actor.emoji === activeArcana.icon)) {
            actors.push({
                emoji: activeArcana.icon,
                side: 'left',
                slot: actors.length,
                motion: 'hover',
                role: 'arcana',
                size: 22,
                bottom: 28,
                delayMs: 80,
                travel: 10,
                durationMs: 720,
                once: true
            });
        }
        return {
            hasRole: !isEnemyPush,
            lead: `${primaryAction.icon || '⚔️'} ${primaryAction.label || primaryAction.short || 'ATTACK'}`,
            detail: [
                primaryAction.detail,
                weaknessText,
                supportActions.length ? `Support ${supportActions.map((action) => action.icon || '✨').join(' ')}` : '',
                attackText || damageText,
                unitBadges
            ].filter(Boolean).join(' / '),
            short: primaryAction.short || primaryAction.label || 'ATTACK',
            primaryGuide: {
                icon: primaryAction.icon || '⚔️',
                title: primaryAction.label || primaryAction.short || 'ATTACK',
                short: primaryAction.short || primaryAction.label || 'ATTACK',
                motion: primaryAction.motion || 'rush',
                role: primaryAction.role || 'support',
                effect: primaryAction.motion === 'blink' ? 'blink' : (primaryAction.motion === 'treasure' ? 'spark' : 'burst')
            },
            supportGuides: supportActions.map((action) => ({
                icon: action.icon || '✨',
                title: action.label || action.short || 'SUPPORT',
                short: action.short || action.label || 'SUPPORT',
                motion: action.motion || 'march',
                role: action.role || 'support',
                effect: action.motion === 'blink' ? 'blink' : 'spark'
            })),
            badges: [
                primaryAction.short || primaryAction.label || 'ATTACK',
                weaknessText,
                attackText || damageText,
                unitBadges
            ].filter(Boolean),
            actors,
            effects: [
                {
                    emoji: isEnemyPush ? '⚡' : '💥',
                    side: isEnemyPush ? 'left' : 'center',
                    slot: 1,
                    motion: isEnemyPush ? 'blink' : 'burst',
                    size: 18,
                    delayMs: isEnemyPush ? 120 : 180,
                    durationMs: 520,
                    once: true
                }
            ]
        };
    }

    if (!primaryLine) {
        return {
            hasRole: false,
            lead: state?.battle ? '👾 敵前進' : '🫧 索敵中',
            detail: state?.battle
                ? `${describeEnemy(state.battle)} が城へ迫る。`
                : `次の敵 ${getSuitBadge(state?.previewSuit)} を警戒。`,
            short: state?.battle ? 'ENEMY PUSH' : 'SCOUT',
            badges: [damageText, unitBadges].filter(Boolean),
            actors: [],
            effects: []
        };
    }

    const supportText = supportGuides.length
        ? ` / 援護 ${supportGuides.map((guide) => guide.icon).join(' ')}`
        : '';
    const detailParts = [
        primaryGuide.summary,
        roleLines.length > 1 ? `${roleLines.length}ライン同時成立` : '',
        attackText || damageText,
        unitBadges
    ].filter(Boolean);
    const actors = [
        {
            emoji: primaryGuide.icon,
            side: 'left',
            slot: 0,
            motion: primaryGuide.motion,
            role: primaryGuide.role,
            size: primaryGuide.role === 'arcana' ? 34 : 30,
            bottom: primaryGuide.role === 'arcana' ? 18 : 10,
            travel: primaryGuide.motion === 'rush' ? 38 : 18,
            durationMs: 760,
            once: true
        }
    ];

    supportGuides.forEach((guide, index) => {
        actors.push({
            emoji: guide.icon,
            side: 'left',
            slot: index + 1,
            motion: guide.motion,
            role: guide.role,
            size: 22,
            bottom: 22 - (index * 4),
            delayMs: 100 + (index * 120),
            travel: guide.motion === 'rush' ? 28 : 14,
            durationMs: 620,
            once: true
        });
    });

    if (activeArcana?.icon) {
        actors.push({
            emoji: activeArcana.icon,
            side: 'left',
            slot: supportGuides.length + 1,
            motion: primaryGuide.role === 'arcana' ? 'arcana' : 'hover',
            role: 'arcana',
            size: 22,
            bottom: 28,
            delayMs: 80,
            travel: 10,
            durationMs: 720,
            once: true
        });
    }

    const effects = [
        {
            emoji: primaryGuide.effect === 'burst' ? '💥' : primaryGuide.effect === 'blink' ? '⚡' : '✨',
            side: primaryGuide.effect === 'burst' ? 'center' : 'right',
            slot: 1,
            motion: primaryGuide.effect,
            size: 18,
            delayMs: 180,
            durationMs: 520,
            once: true
        }
    ];

    return {
        hasRole: true,
        primaryLine,
        lead: `${primaryGuide.icon} ${primaryGuide.title}`,
        detail: `${detailParts.join(' / ')}${supportText}`,
        short: primaryGuide.short,
        primaryGuide,
        supportGuides,
        badges: [
            primaryGuide.short,
            attackText,
            unitBadges
        ].filter(Boolean),
        actors,
        effects
    };
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

function renderMonitorBadge(badge = {}) {
    const toneClass = badge.tone ? `is-${String(badge.tone).trim()}` : '';
    return `
        <div class="spin-tarot-monitor-badge ${escapeHtml(toneClass)}">
            <span class="spin-tarot-monitor-badge-icon">${escapeHtml(badge.icon || '✨')}</span>
            <span class="spin-tarot-monitor-badge-text">${escapeHtml(badge.text || '')}</span>
        </div>
    `;
}

function formatMonitorCount(value) {
    const count = Math.max(0, Math.floor(Number(value) || 0));
    if (count >= 100) return '99+';
    if (count >= 10) return String(count);
    return String(count);
}

function renderMonitorGarrisonUnit(unit = {}) {
    const classes = [
        'spin-tarot-monitor-garrison-unit',
        unit.active ? 'is-active' : 'is-idle',
        unit.tone ? `is-${String(unit.tone).trim()}` : ''
    ].filter(Boolean).join(' ');
    return `
        <span class="${escapeHtml(classes)}">
            <span class="spin-tarot-monitor-garrison-icon">${escapeHtml(unit.icon || '⚔️')}</span>
            <span class="spin-tarot-monitor-garrison-count">${escapeHtml(formatMonitorCount(unit.count))}</span>
        </span>
    `;
}

function renderMonitorWaveNode(node = {}, index = 0) {
    const classes = [
        'spin-tarot-monitor-wave-node',
        node.active ? 'is-active' : 'is-idle',
        node.tone ? `is-${String(node.tone).trim()}` : ''
    ].filter(Boolean).join(' ');
    const size = Math.max(10, Number(node.size) || 14);
    return `
        <span class="${escapeHtml(classes)}" style="font-size:${size}px; animation-delay:${index * 90}ms;">
            ${escapeHtml(node.icon || '👾')}
        </span>
    `;
}

function renderMonitorSkyIcon(icon, index) {
    const left = 120 + (index * 56);
    const top = 6 + ((index % 2) * 8);
    return `
        <span class="spin-tarot-monitor-sky-icon" style="left:${left}px; top:${top}px; animation-delay:${index * 180}ms;">
            ${escapeHtml(icon)}
        </span>
    `;
}

function renderMonitorActor(actor = {}, index = 0) {
    const size = Math.max(18, Number(actor.size) || 28);
    const bottom = Number(actor.bottom);
    const slot = Number.isFinite(Number(actor.slot)) ? Number(actor.slot) : index;
    const side = actor.side === 'left' ? 'left' : 'right';
    const horizontal = side === 'left'
        ? `left:${82 + (slot * 36)}px;`
        : `right:${18 + (slot * 52)}px;`;
    const vertical = `bottom:${Number.isFinite(bottom) ? bottom : 12}px;`;
    const delay = `animation-delay:${Math.max(0, Number(actor.delayMs) || (index * 120))}ms;`;
    const travel = `--actor-travel:${Math.max(8, Number(actor.travel) || (actor.motion === 'rush' ? 42 : 18))}px;`;
    const duration = Number(actor.durationMs) > 0 ? `animation-duration:${Math.max(120, Number(actor.durationMs))}ms;` : '';
    const classes = [
        'spin-tarot-monitor-actor',
        side === 'left' ? 'is-ally' : 'is-foe',
        actor.once ? 'is-once' : '',
        actor.motion ? `is-${String(actor.motion).trim()}` : '',
        actor.role ? `is-${String(actor.role).trim()}` : ''
    ].filter(Boolean).join(' ');
    return `
        <span class="${escapeHtml(classes)}" style="${horizontal}${vertical}font-size:${size}px;${delay}${travel}${duration}">
            ${escapeHtml(actor.emoji || '✨')}
        </span>
    `;
}

function renderMonitorEffect(effect = {}, index = 0) {
    const size = Math.max(14, Number(effect.size) || 22);
    const slot = Number.isFinite(Number(effect.slot)) ? Number(effect.slot) : index;
    const side = effect.side === 'left' ? 'left' : (effect.side === 'center' ? 'center' : 'right');
    let horizontal = '';
    if (side === 'left') {
        horizontal = `left:${92 + (slot * 28)}px;`;
    } else if (side === 'center') {
        horizontal = `left:calc(50% + ${(slot - 1) * 28}px);`;
    } else {
        horizontal = `right:${28 + (slot * 30)}px;`;
    }
    const vertical = `top:${Number.isFinite(Number(effect.top)) ? Number(effect.top) : 10 + ((index % 2) * 18)}px;`;
    const delay = `animation-delay:${Math.max(0, Number(effect.delayMs) || (index * 140))}ms;`;
    const duration = Number(effect.durationMs) > 0 ? `animation-duration:${Math.max(120, Number(effect.durationMs))}ms;` : '';
    const classes = [
        'spin-tarot-monitor-effect',
        effect.once ? 'is-once' : '',
        effect.motion ? `is-${String(effect.motion).trim()}` : ''
    ].filter(Boolean).join(' ');
    return `
        <span class="${escapeHtml(classes)}" style="${horizontal}${vertical}font-size:${size}px;${delay}${duration}">
            ${escapeHtml(effect.emoji || '✨')}
        </span>
    `;
}

function compactMonitorText(value, fallback = '', maxLength = 52) {
    const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(8, maxLength - 1))}…`;
}

function getSuitIconOnly(suitKey) {
    const suit = CONFIG.suits.find((entry) => entry.key === suitKey);
    return suit?.icon || '🔮';
}

function getPreviewNation(suitKey) {
    const key = String(suitKey || '').trim();
    if (!key) return null;
    return CONFIG.enemyNations?.[key] || null;
}

function getEnemyWaveIcons(enemy, fallback = '👾') {
    const icons = Array.isArray(enemy?.waveIcons)
        ? enemy.waveIcons.map((icon) => String(icon || '').trim()).filter(Boolean)
        : [];
    if (icons.length) return icons;
    const main = String(enemy?.emoji || fallback).trim();
    return [main || fallback];
}

function getEnemyDisplayEmoji(enemy, variant = 0, fallback = '👾') {
    const icons = getEnemyWaveIcons(enemy, fallback);
    return icons[Math.max(0, Number(variant) || 0) % icons.length] || fallback;
}

function getMonitorGarrisonActivity(defenseView = null) {
    const active = new Set();
    const textPool = [];
    const pushText = (value) => {
        const text = String(value || '').trim().toUpperCase();
        if (text) textPool.push(text);
    };
    if (defenseView?.primaryGuide) {
        pushText(defenseView.primaryGuide.title);
        pushText(defenseView.primaryGuide.short);
        pushText(defenseView.primaryGuide.icon);
        pushText(defenseView.primaryGuide.role);
    }
    if (Array.isArray(defenseView?.supportGuides)) {
        defenseView.supportGuides.forEach((guide) => {
            pushText(guide?.title);
            pushText(guide?.short);
            pushText(guide?.icon);
            pushText(guide?.role);
        });
    }
    const joined = textPool.join(' ');
    if (/PAWN|MARCH/.test(joined)) active.add('pawn');
    if (/KNIGHT|FORMATION|CAVALRY|KINGDOM|RUSH|MIXED/.test(joined)) active.add('knight');
    if (/BISHOP|JUSTICE|PIERCE|JUDGE|TOWER|MIXED/.test(joined)) active.add('bishop');
    if (/MAGE|MAGIC|NOVA/.test(joined)) active.add('mage');
    if (/ARCANA|ROYAL|WORLD/.test(joined)) {
        active.add('pawn');
        active.add('knight');
        active.add('bishop');
        active.add('mage');
    }
    if (!active.size && defenseView?.hasRole) {
        const role = String(defenseView?.primaryGuide?.role || '').trim().toLowerCase();
        if (role === 'guard') {
            active.add('pawn');
            active.add('knight');
        } else if (role === 'support') {
            active.add('bishop');
            active.add('mage');
        } else if (role === 'arcana') {
            active.add('pawn');
            active.add('knight');
            active.add('bishop');
            active.add('mage');
        }
    }
    return active;
}

function buildMonitorGarrison(defenseView = null) {
    const activeUnits = getMonitorGarrisonActivity(defenseView);
    const hasBattleRole = !!(defenseView?.hasRole && activeUnits.size);
    return [
        {
            key: 'pawn',
            icon: '♙',
            count: state?.population || 0,
            tone: 'guard',
            active: Number(state?.population || 0) > 0 && (hasBattleRole ? activeUnits.has('pawn') : !state?.battle)
        },
        {
            key: 'knight',
            icon: '♘',
            count: state?.knights || 0,
            tone: 'guard',
            active: Number(state?.knights || 0) > 0 && (hasBattleRole ? activeUnits.has('knight') : !state?.battle)
        },
        {
            key: 'bishop',
            icon: '♗',
            count: state?.bishops || 0,
            tone: 'support',
            active: Number(state?.bishops || 0) > 0 && (hasBattleRole ? activeUnits.has('bishop') : !state?.battle)
        },
        {
            key: 'mage',
            icon: '🪄',
            count: state?.mages || 0,
            tone: 'support',
            active: Number(state?.mages || 0) > 0 && (hasBattleRole ? activeUnits.has('mage') : !state?.battle)
        }
    ];
}

function buildMonitorEnemyWave(statusView, previewNation, previewSuitIcon) {
    if (Array.isArray(state?.pendingArcanaChoices) && state.pendingArcanaChoices.length) {
        return state.pendingArcanaChoices.slice(0, 4).map((arcana, index) => ({
            icon: arcana?.icon || '🎴',
            tone: 'rush',
            active: index === 0,
            size: index === 0 ? 15 : 13
        }));
    }
    if (state?.premium?.type === 'treasure' || Number(state?.lastTreasureCoins || 0) > 0) {
        return ['📦', '🪙', '✨', '📦'].map((icon, index) => ({
            icon,
            tone: 'reward',
            active: index < 3,
            size: icon === '✨' ? 11 : 14
        }));
    }
    if (state?.battle) {
        const baseIcons = getEnemyWaveIcons(state.battle, state.battle.emoji || previewNation?.emoji || previewSuitIcon || '👾');
        const count = state.battle.isBoss ? 5 : Math.max(2, Math.min(4, Math.ceil((Number(state.battle.hp || 0) / Math.max(1, Number(state.battle.maxHp || 1))) * 4)));
        const wave = Array.from({ length: count }, (_, index) => ({
            icon: state.battle.isBoss && index === 0
                ? (baseIcons[0] || state.battle.emoji || '🐉')
                : baseIcons[index % baseIcons.length],
            tone: 'danger',
            active: index < Math.max(1, count - 1),
            size: state.battle.isBoss && index === 0 ? 14 : 13
        }));
        if (wave.length > 1 && state.battle.weaknessType) {
            wave[wave.length - 1] = {
                icon: state.battle.weaknessIcon || '🎯',
                tone: 'reward',
                active: true,
                size: 13
            };
        }
        return wave;
    }
    const previewIcons = getEnemyWaveIcons(previewNation, previewSuitIcon || '👾');
    const count = statusView?.modeKey === 'cz'
        ? 5
        : statusView?.modeKey === 'high'
            ? 4
            : statusView?.modeKey === 'hint'
                ? 3
                : 2;
    return Array.from({ length: count }, (_, index) => ({
        icon: previewIcons[index % previewIcons.length],
        tone: statusView?.modeKey === 'high' || statusView?.modeKey === 'cz' ? 'danger' : 'neutral',
        active: index === 0 || statusView?.modeKey === 'high' || statusView?.modeKey === 'cz',
        size: 12
    }));
}

function buildMonitorThreatPercent(statusView) {
    if (Array.isArray(state?.pendingArcanaChoices) && state.pendingArcanaChoices.length) return 100;
    if (state?.premium?.type === 'treasure' || Number(state?.lastTreasureCoins || 0) > 0) return 100;
    if (state?.battle) return percent(state.battle.hp, state.battle.maxHp);
    if (statusView?.modeKey === 'cz') return percent(statusView.czPower, statusView.czTarget);
    if (statusView?.modeKey === 'high') return 82;
    if (statusView?.modeKey === 'hint') return 58;
    if (statusView?.modeKey === 'queen-rush' || statusView?.modeKey === 'king-rush' || statusView?.modeKey === 'dual-rush') return 68;
    const next = Math.max(0, Number(statusView?.nextCzIn ?? 0));
    return Math.max(14, Math.min(72, 72 - (next * 3)));
}

function buildMonitorThreatTone(statusView) {
    if (state?.premium?.type === 'treasure' || Number(state?.lastTreasureCoins || 0) > 0) return 'reward';
    if (Array.isArray(state?.pendingArcanaChoices) && state.pendingArcanaChoices.length) return 'rush';
    if (state?.battle || statusView?.modeKey === 'cz' || statusView?.modeKey === 'high' || statusView?.modeKey === 'hint') return 'danger';
    if (statusView?.modeKey === 'queen-rush' || statusView?.modeKey === 'king-rush' || statusView?.modeKey === 'dual-rush') return 'rush';
    return 'neutral';
}

function buildMonitorRushChip(statusView, premiumText) {
    const parts = [];
    if (statusView.queenModeSpins > 0) parts.push(`Q${statusView.queenModeSpins}G`);
    if (statusView.kingModeSpins > 0) parts.push(`K${statusView.kingModeSpins}G`);
    if (statusView.modeKey === 'cz') parts.push(`CZ ${statusView.czPower}`);
    if (!parts.length && state?.premium?.spinsRemaining > 0) {
        parts.push(`${state.premium.spinsRemaining}G`);
    }
    if (!parts.length && premiumText && premiumText !== '通常抽選') {
        parts.push(compactMonitorText(premiumText, '', 12));
    }
    if (!parts.length) parts.push('IDLE');
    return parts.join(' / ');
}

function buildMonitorView({ statusView, activeArcana, modeChipText, zoneText, premiumText, latestLog, boardSubtitle, defenseView = null }) {
    const resultInfo = getBoardResultInfo();
    const previewNation = getPreviewNation(state?.previewSuit);
    const previewSuitIcon = getSuitIconOnly(state?.previewSuit);
    const rushChip = buildMonitorRushChip(statusView, premiumText);
    const baseCaption = compactMonitorText(boardSubtitle || latestLog || activeArcana.summary || '');
    const defense = defenseView || buildDefenseView(activeArcana);
    const view = {
        theme: 'normal',
        mode: modeChipText,
        zone: zoneText,
        title: state?.currentArcana?.label || 'SPIN TAROT',
        caption: baseCaption,
        castleTone: 'is-ready',
        garrison: buildMonitorGarrison(defense),
        enemyWave: buildMonitorEnemyWave(statusView, previewNation, previewSuitIcon),
        threatPercent: buildMonitorThreatPercent(statusView),
        threatTone: buildMonitorThreatTone(statusView),
        skyIcons: [activeArcana.icon || '✨', previewSuitIcon],
        actors: [
            { emoji: activeArcana.icon || '✨', side: 'left', slot: 0, motion: 'hover', role: 'arcana', size: 24, bottom: 28 },
            { emoji: getEnemyDisplayEmoji(previewNation, 0, previewSuitIcon || '👾'), slot: 1, motion: 'march', role: 'enemy', size: 30 }
        ],
        effects: [
            { emoji: '✨', side: 'center', slot: 1, motion: 'spark', size: 18 }
        ],
        badges: [
            { icon: '🪙', text: String(state?.coins || 0), tone: 'reward' },
            { icon: previewNation?.emoji || previewSuitIcon, text: statusView.modeKey === 'cz' ? `CZ ${statusView.czPower}/${statusView.czTarget}` : `CZ ${statusView.nextCzIn}G` },
            { icon: '👑', text: rushChip, tone: statusView.queenModeSpins > 0 || statusView.kingModeSpins > 0 ? 'rush' : '' }
        ]
    };
    if (cutin?.label) {
        view.theme = 'impact';
        view.title = cutin.label;
        view.caption = compactMonitorText(cutin.text, baseCaption);
        view.castleTone = 'is-arcana';
        view.skyIcons = ['⚡', activeArcana.icon || '✨', '🌠'];
        view.actors = [
            { emoji: activeArcana.icon || '🎴', side: 'left', slot: 1, motion: 'arcana', role: 'arcana', size: 42, bottom: 12, travel: 12 },
            { emoji: '⚡', slot: 0, motion: 'rush', role: 'enemy', size: 24, bottom: 30, travel: 24 },
            { emoji: '✨', slot: 2, motion: 'hover', role: 'support', size: 22, bottom: 24 }
        ];
        view.effects = [
            { emoji: '💥', side: 'center', slot: 1, motion: 'burst', size: 24 },
            { emoji: '✨', side: 'right', slot: 0, motion: 'spark', size: 18 }
        ];
        view.badges = [
            { icon: '🎴', text: compactMonitorText(state?.currentArcana?.label || 'ARCANA', '', 14), tone: 'rush' },
            { icon: '⚡', text: 'CUT-IN', tone: 'danger' },
            { icon: '👑', text: rushChip, tone: 'rush' }
        ];
    } else if (Array.isArray(state?.pendingArcanaChoices) && state.pendingArcanaChoices.length) {
        const choices = state.pendingArcanaChoices.slice(0, 3);
        view.theme = 'arcana';
        view.title = '大アルカナ選択';
        view.caption = '今の流れを維持するか、新しい運命へ乗り換える。';
        view.castleTone = 'is-arcana';
        view.skyIcons = choices.map((arcana) => arcana.icon || '🎴');
        view.actors = choices.map((arcana, index) => ({
            emoji: arcana.icon || '🎴',
            slot: index,
            motion: index === 1 ? 'arcana' : 'hover',
            role: 'arcana',
            size: index === 1 ? 40 : 30,
            bottom: index === 1 ? 10 : 18,
            travel: 10
        }));
        view.effects = [
            { emoji: '🔀', side: 'center', slot: 1, motion: 'burst', size: 22 }
        ];
        view.badges = [
            { icon: '🎴', text: `${choices.length}択`, tone: 'rush' },
            { icon: '🌀', text: `${statusView.spinsUntilArcanaShift}G` },
            { icon: '👑', text: rushChip, tone: 'rush' }
        ];
    } else if (spinning) {
        view.theme = 'spin';
        view.title = 'リール回転';
        view.caption = compactMonitorText(`右から運命が流れ込む / ${previewNation?.label || getSuitBadge(state.previewSuit)}`, baseCaption);
        view.castleTone = 'is-alert';
        view.skyIcons = [previewSuitIcon, '✨', '🎴'];
        view.actors = [
            { emoji: '🎴', slot: 0, motion: 'spin', role: 'card', size: 28, bottom: 24, travel: 16 },
            { emoji: '🎴', slot: 1, motion: 'spin', role: 'card', size: 30, bottom: 14, delayMs: 90, travel: 18 },
            { emoji: getEnemyDisplayEmoji(previewNation, 1, previewSuitIcon || '👾'), slot: 2, motion: 'march', role: 'enemy', size: 28, bottom: 12, delayMs: 180, travel: 22 }
        ];
        view.effects = [
            { emoji: '🌀', side: 'center', slot: 1, motion: 'spark', size: 18 },
            { emoji: previewSuitIcon, side: 'right', slot: 0, motion: 'blink', size: 18 }
        ];
        view.badges = [
            { icon: '🪙', text: String(state?.coins || 0), tone: 'reward' },
            { icon: '🎴', text: `${state?.activeLineCount || 0} HAND` },
            { icon: previewSuitIcon, text: `CZ ${statusView.nextCzIn}G` }
        ];
    } else if (state?.battle) {
        view.theme = 'danger';
        view.title = `${state.battle.label || '防衛戦'} 襲来`;
        view.caption = `城HP ${state.castleHp}/${state.castleMaxHp} / 敵HP ${state.battle.hp}/${state.battle.maxHp} / ATK ${state.battle.attack}`;
        view.castleTone = 'is-danger';
        view.skyIcons = ['🌩️', previewSuitIcon, '🔥'];
        view.actors = [
            { emoji: '🛡️', side: 'left', slot: 0, motion: 'guard', role: 'guard', size: 22, bottom: 10, travel: 10 },
            { emoji: getEnemyDisplayEmoji(state.battle, 0, state.battle.emoji || '👹'), slot: state.battle.isBoss ? 0 : 1, motion: state.battle.isBoss ? 'boss' : 'rush', role: 'enemy', size: state.battle.isBoss ? 40 : 34, bottom: 10, travel: state.battle.isBoss ? 30 : 42, durationMs: 900, once: true },
            { emoji: '⚔️', side: 'center', slot: 1, motion: 'clash', role: 'support', size: 22, bottom: 18, delayMs: 100, travel: 14, durationMs: 560, once: true }
        ];
        view.effects = [
            { emoji: '💥', side: 'center', slot: 1, motion: 'burst', size: 24, delayMs: 150, durationMs: 520, once: true },
            { emoji: '🔥', side: 'left', slot: 0, motion: 'blink', size: 18, top: 22, durationMs: 520, once: true }
        ];
        view.badges = [
            { icon: '🛡️', text: `${state.castleHp}/${state.castleMaxHp}`, tone: 'reward' },
            { icon: state.battle.emoji || '👹', text: `${state.battle.hp}/${state.battle.maxHp}`, tone: 'danger' },
            { icon: '⚔️', text: String(state.battle.attack), tone: 'danger' }
        ];
    } else if (resultInfo.text) {
        view.theme = resultInfo.tone === 'danger'
            ? 'danger'
            : resultInfo.tone === 'treasure'
                ? 'treasure'
                : 'reward';
        view.title = resultInfo.text;
        view.caption = compactMonitorText(state?.lineSummaries?.[0], baseCaption);
        view.castleTone = resultInfo.tone === 'danger' ? 'is-danger' : 'is-reward';
        if (Number(state?.lastTreasureCoins || 0) > 0) {
            view.skyIcons = ['✨', '🪙', '🏝️'];
            view.actors = [
                { emoji: '📦', slot: 1, motion: 'treasure', role: 'reward', size: 34, bottom: 12, travel: 18 },
                { emoji: '🪙', slot: 0, motion: 'reward', role: 'reward', size: 28, bottom: 22, delayMs: 80, travel: 14 },
                { emoji: '⛵', slot: 2, motion: 'march', role: 'support', size: 24, bottom: 20, delayMs: 120, travel: 12 }
            ];
            view.effects = [
                { emoji: '✨', side: 'center', slot: 1, motion: 'spark', size: 20 },
                { emoji: '💰', side: 'right', slot: 0, motion: 'burst', size: 20 }
            ];
            view.badges = [
                { icon: '📦', text: `+${state.lastTreasureCoins}`, tone: 'reward' },
                { icon: '🏝️', text: `${state?.premium?.spinsRemaining || 0}G` },
                { icon: '👑', text: rushChip, tone: 'rush' }
            ];
        } else if (Number(state?.lastEnemyDamage || 0) > 0) {
            view.skyIcons = ['🌩️', '🔥', previewSuitIcon];
            view.actors = [
                { emoji: getEnemyDisplayEmoji(previewNation, 0, '👹'), slot: 1, motion: 'rush', role: 'enemy', size: 34, bottom: 12, travel: 38 },
                { emoji: '💥', side: 'center', slot: 1, motion: 'burst', role: 'support', size: 22, bottom: 20, delayMs: 60, travel: 10 }
            ];
            view.effects = [
                { emoji: '🔥', side: 'left', slot: 0, motion: 'blink', size: 18, top: 24 },
                { emoji: '⚠️', side: 'center', slot: 1, motion: 'spark', size: 18 }
            ];
            view.badges = [
                { icon: '🛡️', text: `${state.castleHp}/${state.castleMaxHp}` },
                { icon: '💥', text: `-${state.lastEnemyDamage}`, tone: 'danger' },
                { icon: previewNation?.emoji || previewSuitIcon, text: previewNation?.label || getSuitBadge(state.previewSuit), tone: 'danger' }
            ];
        } else {
            view.skyIcons = ['✨', '🪙', activeArcana.icon || '🎴'];
            view.actors = [
                { emoji: '🪙', slot: 0, motion: 'reward', role: 'reward', size: 28, bottom: 20, travel: 14 },
                { emoji: activeArcana.icon || '✨', side: 'left', slot: 0, motion: 'hover', role: 'arcana', size: 24, bottom: 28, travel: 10 },
                { emoji: '⚔️', slot: 2, motion: 'clash', role: 'support', size: 22, bottom: 14, delayMs: 90, travel: 16 }
            ];
            view.effects = [
                { emoji: '✨', side: 'center', slot: 1, motion: 'spark', size: 20 },
                { emoji: '💰', side: 'right', slot: 0, motion: 'burst', size: 18 }
            ];
            view.badges = [
                { icon: '🪙', text: `+${state.totalPayout || 0}`, tone: 'reward' },
                { icon: '⚔️', text: state.lastAttackDamage ? `ATK ${state.lastAttackDamage}` : compactMonitorText(state?.lineSummaries?.[0], '', 12) },
                { icon: '👑', text: rushChip, tone: 'rush' }
            ];
        }
    } else if (state?.phase === 'hold') {
        view.theme = 'hold';
        view.title = 'HOLD & DRAW';
        view.caption = '5枚から KEEP を選び、決めたら DRAW / SPIN。';
        view.castleTone = 'is-ready';
        view.skyIcons = ['🎴', activeArcana.icon || '✨', previewSuitIcon];
        view.actors = [
            { emoji: '🖐️', side: 'left', slot: 0, motion: 'guard', role: 'support', size: 22, bottom: 8, travel: 10 },
            { emoji: '🎯', side: 'center', slot: 1, motion: 'spark', role: 'support', size: 20, bottom: 22, delayMs: 120, travel: 10 },
            { emoji: '🎴', slot: 1, motion: 'hover', role: 'card', size: 30, bottom: 14, delayMs: 80, travel: 12 }
        ];
        view.effects = [
            { emoji: '✨', side: 'center', slot: 1, motion: 'spark', size: 18 }
        ];
        view.badges = [
            { icon: '🎯', text: `${state?.activeLineCount || 0} HAND` },
            { icon: '🖐️', text: '5-CARD HOLD' },
            { icon: '👑', text: rushChip, tone: 'rush' }
        ];
    } else if (statusView?.modeKey === 'cz') {
        view.theme = 'cz';
        view.title = '防衛準備CZ';
        view.caption = `右から敵影が近づく / CZ POWER ${statusView.czPower}/${statusView.czTarget}`;
        view.castleTone = 'is-alert';
        view.skyIcons = ['🌀', previewSuitIcon, '⚠️'];
        view.actors = [
            { emoji: getEnemyDisplayEmoji(previewNation, 0, '👾'), slot: 1, motion: 'march', role: 'enemy', size: 30, bottom: 10, travel: 24 },
            { emoji: '🛡️', side: 'left', slot: 0, motion: 'guard', role: 'guard', size: 22, bottom: 8, travel: 10 },
            { emoji: '🌀', side: 'center', slot: 1, motion: 'hover', role: 'support', size: 22, bottom: 22, delayMs: 80, travel: 12 }
        ];
        view.effects = [
            { emoji: '⚠️', side: 'right', slot: 0, motion: 'blink', size: 18 },
            { emoji: '✨', side: 'center', slot: 1, motion: 'spark', size: 16 }
        ];
        view.badges = [
            { icon: '🌀', text: `${statusView.czPower}/${statusView.czTarget}`, tone: 'danger' },
            { icon: previewSuitIcon, text: getSuitBadge(state.previewSuit) },
            { icon: '👑', text: rushChip, tone: 'rush' }
        ];
    } else if (statusView?.modeKey === 'queen-rush' || statusView?.modeKey === 'king-rush' || statusView?.modeKey === 'dual-rush') {
        view.theme = 'rush';
        view.title = statusView.modeLabel;
        view.caption = compactMonitorText(premiumText !== '通常抽選' ? premiumText : (state?.lastEffects?.[0] || activeArcana.summary || ''), baseCaption);
        view.castleTone = 'is-rush';
        view.skyIcons = ['👑', '✨', '⚡'];
        view.actors = [
            { emoji: '👑', side: 'left', slot: 1, motion: 'arcana', role: 'reward', size: 32, bottom: 20, travel: 10 },
            { emoji: '⚔️', slot: 1, motion: 'clash', role: 'support', size: 22, bottom: 18, delayMs: 100, travel: 16 },
            { emoji: getEnemyDisplayEmoji(previewNation, 1, previewSuitIcon || '👾'), slot: 2, motion: 'march', role: 'enemy', size: 26, bottom: 10, delayMs: 180, travel: 18 }
        ];
        view.effects = [
            { emoji: '✨', side: 'center', slot: 1, motion: 'spark', size: 18 },
            { emoji: '💫', side: 'right', slot: 0, motion: 'burst', size: 18 }
        ];
        view.badges = [
            { icon: '👑', text: rushChip, tone: 'rush' },
            { icon: '🌀', text: `${statusView.nextCzIn}G` },
            { icon: previewSuitIcon, text: getSuitBadge(state.previewSuit) }
        ];
    } else if (statusView?.modeKey === 'high' || statusView?.modeKey === 'hint') {
        view.theme = 'omen';
        view.title = `${previewNation?.label || getSuitBadge(state.previewSuit)} 接近`;
        view.caption = `右から敵影 / CZまで ${statusView.nextCzIn}G`;
        view.castleTone = 'is-alert';
        view.skyIcons = ['⚠️', previewSuitIcon, '🌫️'];
        view.actors = [
            { emoji: getEnemyDisplayEmoji(previewNation, 0, '👾'), slot: 1, motion: 'march', role: 'enemy', size: 30, bottom: 10, travel: statusView.modeKey === 'high' ? 28 : 18 },
            { emoji: previewSuitIcon, slot: 0, motion: 'hover', role: 'support', size: 22, bottom: 28, delayMs: 80, travel: 12 }
        ];
        view.effects = [
            { emoji: '⚠️', side: 'right', slot: 0, motion: 'blink', size: 18 },
            { emoji: '…', side: 'center', slot: 1, motion: 'spark', size: 18 }
        ];
        view.badges = [
            { icon: previewSuitIcon, text: getSuitBadge(state.previewSuit) },
            { icon: '🌀', text: `${statusView.nextCzIn}G` },
            { icon: '👑', text: rushChip, tone: 'rush' }
        ];
    } else if (statusView?.modeKey === 'treasure') {
        view.theme = 'treasure';
        view.title = state?.premium?.label || premiumText || '宝島';
        view.caption = '右から宝箱とボーナス船が流れ込む。';
        view.castleTone = 'is-reward';
        view.skyIcons = ['🏝️', '✨', '🪙'];
        view.actors = [
            { emoji: '📦', slot: 0, motion: 'treasure', role: 'reward', size: 34, bottom: 12, travel: 16 },
            { emoji: '⛵', slot: 2, motion: 'march', role: 'support', size: 24, bottom: 18, delayMs: 120, travel: 12 },
            { emoji: '🪙', slot: 1, motion: 'reward', role: 'reward', size: 24, bottom: 28, delayMs: 60, travel: 10 }
        ];
        view.effects = [
            { emoji: '✨', side: 'center', slot: 1, motion: 'spark', size: 18 },
            { emoji: '💰', side: 'right', slot: 0, motion: 'burst', size: 18 }
        ];
        view.badges = [
            { icon: '🏝️', text: `${state?.premium?.spinsRemaining || 0}G`, tone: 'reward' },
            { icon: '📦', text: `CD ${statusView.treasureCooldownSpins || 0}` },
            { icon: '👑', text: rushChip, tone: 'rush' }
        ];
    } else {
        view.theme = 'normal';
        view.title = state?.currentArcana?.label || 'SPIN TAROT';
        view.caption = compactMonitorText(activeArcana.summary || boardSubtitle || latestLog || '', baseCaption);
    }

    if (defense.hasRole && state?.battle) {
        view.theme = Number(state?.lastAttackDamage || 0) > 0 ? 'reward' : 'danger';
        view.title = defense.lead;
        view.caption = compactMonitorText(`${defense.detail} / ENEMY ${state.battle.hp}/${state.battle.maxHp}`, baseCaption);
        view.actors = [
            ...defense.actors,
            {
                emoji: getEnemyDisplayEmoji(state.battle, 0, state.battle.emoji || previewNation?.emoji || previewSuitIcon || '👾'),
                slot: state.battle.isBoss ? 0 : 1,
                motion: Number(state?.lastAttackDamage || 0) > 0 ? 'stagger' : (state.battle.isBoss ? 'boss' : 'rush'),
                role: 'enemy',
                size: state.battle.isBoss ? 40 : 34,
                bottom: 10,
                travel: Number(state?.lastAttackDamage || 0) > 0 ? (state.battle.isBoss ? 34 : 28) : (state.battle.isBoss ? 30 : 42),
                delayMs: Number(state?.lastAttackDamage || 0) > 0 ? 180 : 0,
                durationMs: Number(state?.lastAttackDamage || 0) > 0 ? 620 : 900,
                once: true
            }
        ];
        view.effects = [
            ...defense.effects,
            { emoji: Number(state?.lastAttackDamage || 0) > 0 ? '💥' : '⚡', side: 'center', slot: 1, motion: Number(state?.lastAttackDamage || 0) > 0 ? 'burst' : 'blink', size: 20, delayMs: Number(state?.lastAttackDamage || 0) > 0 ? 220 : 120, durationMs: 520, once: true }
        ];
        if (Array.isArray(state?.lastDefenseActions) && state.lastDefenseActions.some((action) => action?.weaknessHit)) {
            view.effects.push({
                emoji: state.battle.weaknessIcon || '🎯',
                side: 'right',
                slot: 2,
                motion: 'spark',
                size: 18,
                delayMs: 260,
                durationMs: 480,
                once: true
            });
        }
        view.badges = [
            { icon: defense.primaryGuide?.icon || '⚔️', text: defense.short, tone: 'reward' },
            { icon: state.battle.emoji || previewNation?.emoji || previewSuitIcon, text: `${state.battle.hp}/${state.battle.maxHp}`, tone: 'danger' },
            { icon: '⚔️', text: Number(state?.lastAttackDamage || 0) > 0 ? `ATK ${state.lastAttackDamage}` : 'ENGAGE', tone: Number(state?.lastAttackDamage || 0) > 0 ? 'reward' : 'danger' }
        ];
    } else if (state?.lastBattleOutcome?.type === 'victory') {
        const defeated = state.lastBattleOutcome;
        view.theme = 'reward';
        view.title = `${defeated.label} 撃破`;
        view.caption = compactMonitorText(`城を守り切った。敵を吹き飛ばし ${defeated.reward || 0} coin を獲得。`, baseCaption);
        view.castleTone = 'is-reward';
        view.skyIcons = ['✨', defeated.emoji || '👾', '🪙'];
        view.actors = [
            { emoji: '🛡️', side: 'left', slot: 0, motion: 'guard', role: 'guard', size: 22, bottom: 10, travel: 10, durationMs: 520, once: true },
            { emoji: defense.primaryGuide?.icon || '⚔️', side: 'left', slot: 1, motion: 'clash', role: 'support', size: 24, bottom: 18, delayMs: 80, travel: 12, durationMs: 540, once: true },
            { emoji: defeated.emoji || '👾', slot: defeated.isBoss ? 0 : 1, motion: 'defeat', role: 'enemy', size: defeated.isBoss ? 42 : 34, bottom: 10, travel: defeated.isBoss ? 56 : 46, delayMs: 140, durationMs: 880, once: true }
        ];
        view.effects = [
            { emoji: '💥', side: 'center', slot: 1, motion: 'burst', size: 24, durationMs: 520, once: true },
            { emoji: '✨', side: 'right', slot: 0, motion: 'spark', size: 18, delayMs: 120, durationMs: 480, once: true },
            { emoji: '🪙', side: 'right', slot: 1, motion: 'burst', size: 18, delayMs: 180, durationMs: 520, once: true }
        ];
        if (defeated.weaknessHit) {
            view.effects.push({
                emoji: defeated.weaknessIcon || '🎯',
                side: 'right',
                slot: 2,
                motion: 'spark',
                size: 18,
                delayMs: 200,
                durationMs: 480,
                once: true
            });
        }
        view.badges = [
            { icon: defeated.emoji || '👾', text: 'DEFEATED', tone: 'reward' },
            { icon: '🪙', text: `+${defeated.reward || 0}`, tone: 'reward' },
            { icon: defense.primaryGuide?.icon || '⚔️', text: defense.short, tone: 'reward' }
        ];
    } else if (defense.hasRole && resultInfo.text && !Number(state?.lastTreasureCoins || 0) && !Number(state?.lastEnemyDamage || 0)) {
        view.title = defense.lead;
        view.caption = compactMonitorText(defense.detail, baseCaption);
        view.actors = [
            ...defense.actors,
            {
                emoji: getEnemyDisplayEmoji(previewNation, 1, previewSuitIcon || '👾'),
                slot: 2,
                motion: 'march',
                role: 'enemy',
                size: 28,
                bottom: 12,
                delayMs: 120,
                travel: 20
            }
        ];
        view.effects = [...defense.effects];
        view.badges = [
            { icon: defense.primaryGuide?.icon || '🎴', text: defense.short, tone: 'reward' },
            { icon: '🪙', text: Number(state?.totalPayout || 0) > 0 ? `+${state.totalPayout}` : 'ROLE HIT', tone: 'reward' },
            { icon: '⚔️', text: Number(state?.lastAttackDamage || 0) > 0 ? `ATK ${state.lastAttackDamage}` : `${(state?.lineResults || []).filter((line) => line.kind !== 'Miss').length} HIT`, tone: 'reward' }
        ];
    }

    if (state?.battle?.weaknessType && Array.isArray(view.badges) && view.badges.length < 4) {
        view.badges.push({
            icon: state.battle.weaknessIcon || '🎯',
            text: state.battle.weaknessLabel || `${String(state.battle.weaknessType).toUpperCase()} WEAK`,
            tone: 'reward'
        });
    }

    return view;
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
    const defenseView = buildDefenseView(getMajorArcana(state?.currentArcana?.number));
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
        ? 'Choose cards to HOLD, then DRAW.'
        : hasPayout
            ? `${defenseView.hasRole ? defenseView.lead : (state.lineSummaries[0] || 'Role hit')} / payout ${state.totalPayout}`
            : hasTreasure
                ? `Treasure +${state.lastTreasureCoins} coins`
                : hasAttack
                    ? `${defenseView.hasRole ? defenseView.lead : 'Attack'} ${state.lastAttackDamage} damage`
                    : hasDamage
                        ? `Castle -${state.lastEnemyDamage} damage`
                        : (defenseView.hasRole ? defenseView.detail : (state.lineSummaries[0] || 'Pick cards to HOLD'));
    const detailItems = [
        defenseView.hasRole ? defenseView.short : '',
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
