import {
    canSpin,
    createInitialState,
    describeEnemy,
    getBetInfo,
    getCardFace,
    getCardSpriteIndex,
    getCardText,
    getMajorArcana,
    getSpinTarotConfig,
    getSpriteStyle,
    performSpin,
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

export async function loadSpinTarotPage() {
    await ensureStylesheet();
    root = document.getElementById('tarotSpinRoot');
    if (!root) return;
    if (!state) state = createInitialState(CONFIG);
    render();
}

export function destroySpinTarotPage() {
    if (cutinTimer) {
        clearTimeout(cutinTimer);
        cutinTimer = null;
    }
    cutin = null;
    spinning = false;
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

function render() {
    if (!root || !state) return;
    const betInfo = getBetInfo(state, CONFIG);
    const activeArcana = getMajorArcana(state.currentArcana?.number);
    const hitCells = getHitCellSet();
    const enemy = state.battle;
    const zoneText = state.zone ? `${state.zone.label} ${state.zone.spinsRemaining}/${state.zone.totalSpins}` : '防衛戦';
    const premiumText = state.premium ? `BONUS: ${state.premium.label} ${state.premium.spinsRemaining}G` : 'BONUS: 通常';

    root.classList.add('spin-tarot-mounted');
    root.classList.toggle('is-spinning', spinning);
    root.innerHTML = `
        <div class="spin-tarot-shell">
            <section class="spin-tarot-stage">
                <div class="spin-tarot-stage-top">
                    <div class="spin-tarot-hud">
                        <div class="spin-tarot-hud-chip">🪙 ${state.coins}</div>
                        <div class="spin-tarot-hud-chip">🏰 ${Math.max(0, state.castleHp)}/${state.castleMaxHp}</div>
                        <div class="spin-tarot-hud-chip">🎚 ${zoneText}</div>
                    </div>
                    <div class="spin-tarot-battle-box ${enemy ? 'is-danger' : ''}">
                        <div class="spin-tarot-battle-title">${enemy ? describeEnemy(enemy) : `予告スート ${getSuitBadge(state.previewSuit)}`}</div>
                        <div class="spin-tarot-bar"><span style="width:${percent(enemy ? enemy.hp : state.castleHp, enemy ? enemy.maxHp : state.castleMaxHp)}%"></span></div>
                        <div class="spin-tarot-battle-meta">${enemy ? `ENEMY HP ${enemy.hp}/${enemy.maxHp}` : premiumText}</div>
                    </div>
                </div>

                <div class="spin-tarot-arcana-panel">
                    <div class="spin-tarot-arcana-art" data-sprite-index="${80 + Number(state.currentArcana?.number || 1)}"></div>
                    <div class="spin-tarot-arcana-copy">
                        <div class="spin-tarot-arcana-kicker">${activeArcana.icon} MAJOR ARCANA</div>
                        <div class="spin-tarot-arcana-title">${escapeHtml(state.currentArcana?.label || '1. 魔術師')}</div>
                        <div class="spin-tarot-arcana-text">${escapeHtml(state.currentArcana?.summary || '')}</div>
                        <div class="spin-tarot-arcana-tags">
                            <span>${state.omenBreak ? '⚠️ 法則崩れ' : '🔭 予告中'}</span>
                            <span>${state.pendingGuaranteeRole ? '🪢 保証待機' : '🃏 通常抽選'}</span>
                            <span>${state.attackMultiplier > 1 ? `✖ ${state.attackMultiplier}` : '✦ 等倍'}</span>
                        </div>
                    </div>
                    ${renderCutin()}
                </div>

                <div class="spin-tarot-kingdom-grid">
                    <div class="spin-tarot-stat-card">
                        <h3>王国ステータス</h3>
                        <div class="spin-tarot-stat-list">
                            ${renderStat('👥 人口', state.population)}
                            ${renderStat('🛡 騎士', state.knights)}
                            ${renderStat('🧙 魔法使い', state.mages)}
                            ${renderStat('♗ ビショップ', state.bishops)}
                            ${renderStat('👸 女帝', state.queenGauge)}
                            ${renderStat('🤴 皇帝', state.kingGauge)}
                            ${renderStat('🏅 国家ランク', state.nationRank)}
                        </div>
                    </div>
                    <div class="spin-tarot-stat-card">
                        <h3>最新結果</h3>
                        <div class="spin-tarot-stat-list">
                            ${renderStat('💰 BET', `${betInfo.label}`)}
                            ${renderStat('🎯 配当', state.totalPayout)}
                            ${renderStat('⚔ 与ダメ', state.lastAttackDamage)}
                            ${renderStat('💥 被ダメ', state.lastEnemyDamage)}
                            ${renderStat('🎁 宝箱', state.lastTreasureCoins)}
                            ${renderStat('📜 役', (state.lineSummaries[0] || '待機'))}
                            ${renderStat('🪄 演出', (state.lastEffects[0] || 'なし'))}
                        </div>
                    </div>
                </div>
            </section>

            <section class="spin-tarot-slot-panel">
                <div class="spin-tarot-controls">
                    <div class="spin-tarot-bet-row">
                        ${CONFIG.betLevels.map((entry, index) => `
                            <button class="spin-tarot-bet-btn ${index === state.betIndex ? 'is-active' : ''}" data-bet-index="${index}" ${spinning ? 'disabled' : ''}>
                                ${escapeHtml(entry.label)}
                            </button>
                        `).join('')}
                    </div>
                    <div class="spin-tarot-action-row">
                        <button id="spinTarotNewRun" class="spin-tarot-ghost-btn" ${spinning ? 'disabled' : ''}>NEW RUN</button>
                        <button id="spinTarotSpinButton" class="spin-tarot-spin-btn" ${(spinning || !canSpin(state, CONFIG)) ? 'disabled' : ''}>SPIN</button>
                    </div>
                </div>

                <div class="spin-tarot-board-wrap">
                    <div class="spin-tarot-board">
                        ${state.board.map((row, rowIndex) => row.map((card, reel) => renderCard(card, rowIndex, reel, hitCells.has(`${rowIndex}:${reel}`))).join('')).join('')}
                    </div>
                    <div class="spin-tarot-hold-row">
                        ${state.board[1].map((card, reel) => `
                            <button class="spin-tarot-hold-btn ${state.holdMask[reel] ? 'is-held' : ''} ${state.lockedHolds[reel] ? 'is-locked' : ''}"
                                data-hold-index="${reel}" ${(spinning || state.lockedHolds[reel] || card.kind === 'blank') ? 'disabled' : ''}>
                                ${state.lockedHolds[reel] ? 'LOCK' : state.holdMask[reel] ? 'HOLD' : 'KEEP'}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div class="spin-tarot-foot">
                    <div class="spin-tarot-line-box">
                        <h3>9ライン常時有効</h3>
                        <div class="spin-tarot-line-list">
                            ${(state.lineSummaries.length ? state.lineSummaries : ['中央5枚を選んで HOLD']).map((line) => `<span>${escapeHtml(line)}</span>`).join('')}
                        </div>
                    </div>
                    <div class="spin-tarot-line-box">
                        <h3>バトルログ</h3>
                        <div class="spin-tarot-log">
                            ${state.logs.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
                        </div>
                    </div>
                </div>
            </section>
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
    if (result.events?.cutin) queueCutin(result.events.cutin);
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
    const classes = [
        'spin-tarot-card',
        row === 1 ? 'is-center' : '',
        isHit ? 'is-hit' : '',
        card?.isWild ? 'is-wild' : '',
        card?.kind === 'blank' ? 'is-blank' : '',
        state.holdMask[reel] && row === 1 ? 'is-held-core' : ''
    ].filter(Boolean).join(' ');
    return `
        <div class="${classes}">
            <div class="spin-tarot-card-art" data-sprite-index="${getCardSpriteIndex(card)}"></div>
            <div class="spin-tarot-card-top">${escapeHtml(getCardText(card))}</div>
            <div class="spin-tarot-card-face">${escapeHtml(getCardFace(card))}</div>
        </div>
    `;
}

function renderStat(label, value) {
    return `<div class="spin-tarot-stat-row"><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function getHitCellSet() {
    const set = new Set();
    (state.lineResults || [])
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

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
