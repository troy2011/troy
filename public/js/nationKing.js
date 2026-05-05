// c:/Users/ikeda/my-liff-app/public/js/nationKing.js

import {
    getNationKingPage,
    deployNationWarWeapon,
    prepareNationWarStrike,
    respondNationWarIntercept,
    raidNationTreasury,
    setNationAnnouncement,
    grantPs,
    settleTroyCheckout,
    setTroyOpen,
    kingUpdateMenu
} from './playfabClient.js';
import { createRequestId } from './api.js';
import { buildPlayerTriggerHtml } from './playerProfile.js';
import { formatCurrencyLabel } from './config.js';

let _isKing = false;
let _lastPageData = null;
let _hasKingCheck = false;

function _setMessage(text, isError = false) {
    const el = document.getElementById('kingPageMessage');
    if (!el) return;
    el.style.color = isError ? 'var(--danger-color)' : 'var(--accent-color)';
    el.innerText = text || '';
}

function _formatEpochMs(ms) {
    if (!ms) return '';
    try {
        return new Date(ms).toLocaleString();
    } catch {
        return '';
    }
}

function _escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _formatTreasuryAmount(amount, currency, direction = 'in') {
    const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
    const sign = direction === 'out' ? '-' : '+';
    return `${sign}${safeAmount.toLocaleString()} ${formatCurrencyLabel(currency || 'PS')}`;
}

function _formatRatePercentFromBps(rateBps) {
    const safeBps = Math.max(0, Math.floor(Number(rateBps) || 0));
    return `${(safeBps / 100).toFixed(safeBps % 100 === 0 ? 0 : 2)}%`;
}

function _renderTreasuryOverview(summary = [], entries = []) {
    const summaryEl = document.getElementById('kingTreasurySummary');
    const entriesEl = document.getElementById('kingTreasuryEntries');
    if (summaryEl) {
        if (Array.isArray(summary) && summary.length) {
            summaryEl.innerHTML = summary.map((row) => `
                <div class="king-treasury-summary-chip is-${row.direction === 'out' ? 'out' : 'in'}">
                    <span>${_escapeHtml(row.label || '国庫更新')}</span>
                    <strong>${_escapeHtml(_formatTreasuryAmount(row.totalAmount, row.currency, row.direction))}</strong>
                    <span>${Math.max(1, Number(row.count) || 1)}件</span>
                </div>
            `).join('');
        } else {
            summaryEl.innerHTML = '';
        }
    }
    if (entriesEl) {
        if (Array.isArray(entries) && entries.length) {
            entriesEl.innerHTML = entries.map((entry) => {
                const meta = [_formatEpochMs(entry.timestampMs), entry.actorName || entry.actorId || '', entry.note || '']
                    .filter(Boolean)
                    .join(' / ');
                return `
                    <div class="king-treasury-entry">
                        <div class="king-treasury-entry-main">${_escapeHtml(entry.label || '国庫更新')}</div>
                        <div class="king-treasury-entry-amount is-${entry.direction === 'out' ? 'out' : 'in'}">${_escapeHtml(_formatTreasuryAmount(entry.amount, entry.currency, entry.direction))}</div>
                        <div class="king-treasury-entry-meta">${_escapeHtml(meta || '履歴情報なし')}</div>
                    </div>
                `;
            }).join('');
        } else {
            entriesEl.innerHTML = '';
        }
    }
}

function _renderPendingTroyCheckouts(entries = []) {
    const listEl = document.getElementById('kingPendingCheckoutList');
    if (!listEl) return;
    const rows = Array.isArray(entries) ? entries : [];
    if (!rows.length) {
        listEl.innerHTML = '<div class="king-pending-checkout-empty">お会計待ちのお客様はいません。</div>';
        return;
    }
    listEl.innerHTML = rows.map((entry) => {
        const total = Math.max(0, Number(entry.total) || 0);
        const totalItems = Math.max(0, Number(entry.totalItems) || 0);
        const grantTotal = Math.max(0, Number(entry.grantTotal) || 0);
        const status = String(entry.status || 'open').trim().toLowerCase();
        const meta = [
            status === 'pending' ? '確認待ち' : 'お会計前',
            _formatEpochMs(entry.lastOrderedAtMs || entry.createdAtMs),
            totalItems ? `${totalItems}点` : ''
        ].filter(Boolean).join(' / ');
        const grantMeta = grantTotal > 0
            ? `ゴールド渡し済み ${grantTotal.toLocaleString('ja-JP')}G`
            : (status === 'pending' ? 'ゴールドはお会計時に渡されます' : '');
        const items = (Array.isArray(entry.items) ? entry.items : []).slice(0, 4).map((item) => `
            <div class="king-pending-checkout-item-row">
                <span>${_escapeHtml(item.name || '')}${Number(item.quantity || 0) > 1 ? ` x${Math.max(1, Number(item.quantity) || 1)}` : ''}</span>
                <strong>¥${Math.max(0, Number(item.lineTotal) || 0).toLocaleString('ja-JP')}</strong>
            </div>
        `).join('');
        return `
            <div class="king-pending-checkout-card">
                <div class="king-pending-checkout-head">
                    <div class="king-pending-checkout-main">
                        <strong>${buildPlayerTriggerHtml(entry.playFabId, entry.displayName || entry.playFabId || 'Player', { className: 'player-link-inline' })}</strong>
                        <span>${_escapeHtml(meta || '未会計')}</span>
                        ${grantMeta ? `<span>${_escapeHtml(grantMeta)}</span>` : ''}
                    </div>
                    <div class="king-pending-checkout-total">¥${total.toLocaleString('ja-JP')}</div>
                </div>
                <div class="king-pending-checkout-items">${items || `<div class="king-pending-checkout-item-row"><span>${_escapeHtml(entry.summary || '注文内容なし')}</span></div>`}</div>
                <details class="king-coin-deposit-details">
                    <summary>預かりコインあり</summary>
                    <label class="king-coin-deposit-row">
                        <span class="king-coin-deposit-label">預かり額</span>
                        <input type="number" class="king-coin-deposit-input" min="0" step="1" inputmode="numeric" value="0" data-coin-deposit-input="true" aria-label="預かりコイン">
                        <span class="king-coin-deposit-unit">G</span>
                    </label>
                    <div class="king-coin-deposit-help">店内コインをゴールド化する時だけ入力</div>
                </details>
                <div class="king-pending-checkout-actions">
                    <button type="button" class="btn-open" data-pending-settle="true" data-checkout-status="${_escapeHtml(status)}" data-receiver-id="${_escapeHtml(entry.playFabId)}" data-amount="${total}">
                        お会計する
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function _renderTroyMembers(members = []) {
    const listEl = document.getElementById('kingTroyEntryList');
    const emptyEl = document.getElementById('kingTroyEntryEmpty');
    if (!listEl || !emptyEl) return;
    const rows = Array.isArray(members) ? members : [];
    listEl.innerHTML = '';
    if (!rows.length) {
        emptyEl.style.display = 'block';
        return;
    }
    emptyEl.style.display = 'none';
    listEl.innerHTML = rows.map((member) => {
        const joinedAt = _formatEpochMs(member.joinedAtMs || member.joinedAt);
        return `
            <div class="troy-entry-item">
                <b>${buildPlayerTriggerHtml(member.playFabId, member.displayName || member.playFabId || 'Player', { className: 'player-link-inline' })}</b>
                <span>${_escapeHtml(joinedAt)}</span>
            </div>
        `;
    }).join('');
}

const _KING_MENU_ITEM_GROUPS = [
    {
        category: 'アルコール 🍸',
        items: ['ラム', 'ウォッカ', 'テキーラ', 'ジン', 'リキュール', '焼酎（キンミヤ）', 'ビール（ハートランド）', 'グラスワイン', 'ワインボトル']
    },
    {
        category: 'ノンアルコール 🥤',
        items: ['コーラ', 'ジンジャーエール', 'オレンジジュース', 'ウーロン茶', 'ノンアルコールビール（ハイネケン）']
    },
    {
        category: '温かい料理 🍟',
        items: ['フライドポテト', 'チキンナゲット', 'ピザトースト', 'フランクフルト', 'ワッフル', 'チュロス', 'カップラーメン']
    },
    {
        category: '乾きもの 🥜',
        items: ['ポテチ', 'チョコ', 'ミックスナッツ']
    },
    {
        category: 'ボトルキープ 🍶',
        items: ['キンミヤ焼酎（720ml）']
    },
    {
        category: 'ボトル用セット 🧊',
        items: ['水割りセット', 'ソーダ / お茶割り用', 'カットレモン']
    }
];

function _renderMenuManagement(data) {
    const disableListEl = document.getElementById('kingMenuDisableList');
    const specialsListEl = document.getElementById('kingMenuSpecialsList');
    const disabled = Array.isArray(data?.menuDisabled) ? data.menuDisabled : [];
    const specials = Array.isArray(data?.menuSpecials) ? data.menuSpecials : [];

    if (disableListEl) {
        disableListEl.innerHTML = _KING_MENU_ITEM_GROUPS.map((group) => `
            <div class="king-menu-group">
                <div class="king-menu-group-label">${_escapeHtml(group.category)}</div>
                <div class="king-menu-toggle-row">
                    ${group.items.map((concept) => {
                        const isSoldOut = disabled.includes(concept);
                        return `<button type="button" class="king-menu-toggle-btn${isSoldOut ? ' is-sold-out' : ''}" data-menu-toggle="${_escapeHtml(concept)}">${_escapeHtml(concept)}</button>`;
                    }).join('')}
                </div>
            </div>
        `).join('');
    }

    if (specialsListEl) {
        if (!specials.length) {
            specialsListEl.innerHTML = '<div class="king-menu-specials-empty">おすすめは未設定です。</div>';
        } else {
            specialsListEl.innerHTML = specials.map((s) => `
                <div class="king-menu-special-row">
                    <span class="king-menu-special-emoji">${_escapeHtml(s.emoji || '⭐')}</span>
                    <span class="king-menu-special-name">${_escapeHtml(s.name)}</span>
                    <span class="king-menu-special-price">¥${Math.max(0, Number(s.price) || 0).toLocaleString('ja-JP')}</span>
                    <button type="button" class="btn-muted king-menu-special-remove" data-special-remove="${_escapeHtml(s.id)}">削除</button>
                </div>
            `).join('');
        }
    }
}

function _formatDuration(ms) {
    const safeMs = Math.max(0, Math.floor(Number(ms) || 0));
    if (!safeMs) return '0秒';
    const totalSeconds = Math.ceil(safeMs / 1000);
    if (totalSeconds < 60) return `${totalSeconds}秒`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60) return seconds ? `${minutes}分${seconds}秒` : `${minutes}分`;
    const hours = Math.floor(minutes / 60);
    const remainMinutes = minutes % 60;
    return remainMinutes ? `${hours}時間${remainMinutes}分` : `${hours}時間`;
}

function _renderNationWar(war = null) {
    const sectionEl = document.getElementById('kingWarSection');
    const detailsEl = document.getElementById('kingWarDetails');
    const capitalEl = document.getElementById('kingWarCapital');
    const activeEl = document.getElementById('kingWarActiveSystems');
    const incomingEl = document.getElementById('kingWarIncoming');
    const enemiesEl = document.getElementById('kingWarEnemies');
    const globalLogsEl = document.getElementById('kingWarGlobalLogs');
    const nationLogsEl = document.getElementById('kingWarNationLogs');
    const deploySelectEl = document.getElementById('kingWarDeployWeapon');
    const strikeWeaponEl = document.getElementById('kingWarStrikeWeapon');
    const strikeTargetNationEl = document.getElementById('kingWarTargetNation');
    const strikeTargetPartEl = document.getElementById('kingWarTargetPart');
    const summaryEl = document.getElementById('kingWarSummary');
    if (!sectionEl) return;
    if (!war) {
        sectionEl.style.display = 'none';
        if (detailsEl) detailsEl.style.display = 'none';
        return;
    }
    sectionEl.style.display = '';
    if (detailsEl) detailsEl.style.display = '';
    if (summaryEl) {
        const capture = war.capitalCapture || null;
        const captureText = capture?.raidUnlocked
            ? '国庫襲撃可能'
            : capture?.raidCooldownActive
                ? `再襲撃防衛中 ${_formatDuration(capture.raidCooldownRemainingMs)}`
            : capture?.status === 'capturing'
                ? `首都制圧中 ${capture.queueCount || 0}/${capture.slotLimit || 0}`
                : capture?.breached
                    ? '上陸可能'
                    : '外郭健在';
        summaryEl.innerText = `${war.nationLabel || ''} / ${war.nationModelLabel || ''} / ${captureText}`;
    }
    if (capitalEl) {
        const capture = war.capitalCapture || null;
        const captureCard = capture ? `
            <div class="king-war-capital-chip is-${_escapeHtml(capture.raidUnlocked ? 'low' : (capture.breached ? 'medium' : 'high'))}">
                <div class="king-war-capital-label">首都制圧</div>
                <div class="king-war-capital-value">${capture.raidUnlocked ? '完了' : `${Math.max(0, Math.round((Number(capture.progressRatio) || 0) * 100))}%`}</div>
                <div class="king-war-capital-band">${_escapeHtml(capture.raidUnlocked ? '襲撃可' : (capture.raidCooldownActive ? '防衛再編中' : (capture.breached ? '上陸可' : '未突破')))}</div>
            </div>
        ` : '';
        capitalEl.innerHTML = captureCard + (Array.isArray(war.capitalStatus) ? war.capitalStatus : []).map((entry) => `
            <div class="king-war-capital-chip is-${_escapeHtml(entry.band?.key || 'medium')}">
                <div class="king-war-capital-label">${_escapeHtml(entry.label || '')}</div>
                <div class="king-war-capital-value">${Math.max(0, Number(entry.value) || 0)}%</div>
                <div class="king-war-capital-band">${_escapeHtml(entry.band?.label || '')}</div>
            </div>
        `).join('');
    }
    if (activeEl) {
        const systems = Array.isArray(war.activeSystems) ? war.activeSystems : [];
        activeEl.innerHTML = systems.length ? systems.map((entry) => `
            <div class="king-war-system-card">
                <div class="king-war-system-main">
                    <strong>${_escapeHtml(entry.label || '')}</strong>
                    <span>${_escapeHtml(entry.description || '')}</span>
                </div>
                <div class="king-war-system-meta">
                    <span>${_escapeHtml(entry.role || '')}</span>
                    ${entry.ammoRemaining > 0 ? `<span>残弾 ${Math.max(0, Number(entry.ammoRemaining) || 0)}</span>` : ''}
                    <span>${_escapeHtml(_formatDuration(entry.remainingMs))}</span>
                </div>
            </div>
        `).join('') : '<div class="king-war-empty">配備中の兵器はありません。</div>';
    }
    if (incomingEl) {
        const incomingList = Array.isArray(war.incoming) ? war.incoming : [];
        const interceptorOptions = Array.isArray(war.interceptorOptions) ? war.interceptorOptions : [];
        incomingEl.innerHTML = incomingList.length ? incomingList.map((entry) => `
            <div class="king-war-incoming-card">
                <div class="king-war-incoming-title">${_escapeHtml(entry.weaponName || '飛来物')}</div>
                <div class="king-war-incoming-meta">
                    <span>識別 ${_escapeHtml(entry.identifyLabel || '不明')}</span>
                    <span>命中見込み ${_escapeHtml(entry.hitOutlookLabel || '不明')}</span>
                    <span>デコイ疑い ${_escapeHtml(entry.decoyRiskLabel || '不明')}</span>
                    <span>狙い ${_escapeHtml(entry.targetLabel || '不明')}</span>
                    <span>到達まで ${_escapeHtml(_formatDuration(entry.remainingMs))}</span>
                </div>
                <div class="king-war-intercept-row">
                    <select class="king-war-select king-war-intercept-system" data-incoming-id="${_escapeHtml(entry.id)}">
                        <option value="">迎撃兵器を選択</option>
                        ${interceptorOptions.map((option) => `<option value="${_escapeHtml(option.id)}">${_escapeHtml(option.label)}</option>`).join('')}
                    </select>
                    <button type="button" class="king-war-action-btn is-attack" data-war-action="intercept" data-incoming-id="${_escapeHtml(entry.id)}">迎撃する</button>
                    <button type="button" class="king-war-action-btn is-muted" data-war-action="skip" data-incoming-id="${_escapeHtml(entry.id)}">見送る</button>
                </div>
            </div>
        `).join('') : '<div class="king-war-empty">現在の飛来警報はありません。</div>';
    }
    if (enemiesEl) {
        const rows = Array.isArray(war.enemyNations) ? war.enemyNations : [];
        enemiesEl.innerHTML = rows.length ? rows.map((entry) => `
            <div class="king-war-enemy-card">
                <div class="king-war-enemy-head">
                    <strong>${_escapeHtml(entry.label || '')}</strong>
                    <span>国庫 ${Number(entry.treasuryPs || 0).toLocaleString()}G</span>
                </div>
                <div class="king-war-enemy-parts">
                    ${(Array.isArray(entry.capitalStatus) ? entry.capitalStatus : []).map((part) => `
                        <span class="king-war-enemy-part is-${_escapeHtml(part.band?.key || 'medium')}">${_escapeHtml(part.label || '')} ${Math.max(0, Number(part.value) || 0)}%</span>
                    `).join('')}
                </div>
                <div class="king-war-enemy-foot">
                    <span>${entry.raidEligible ? `襲撃可能 / 推定 ${Number(entry.raidExpectedPs || 0).toLocaleString()}G` : `襲撃不可 / 推定 ${Number(entry.raidRatePercent || 0).toLocaleString()}%`} / ${entry.capitalCapture?.raidUnlocked ? '制圧完了' : (entry.capitalCapture?.raidCooldownActive ? `再襲撃防衛中 ${_formatDuration(entry.capitalCapture.raidCooldownRemainingMs)}` : (entry.capitalCapture?.status === 'capturing' ? `制圧中 ${entry.capitalCapture.queueCount || 0}/${entry.capitalCapture.slotLimit || 0}` : (entry.capitalCapture?.breached ? '上陸可' : '未突破')))}</span>
                    <button type="button" class="king-war-action-btn is-attack" data-war-action="raid" data-target-nation="${_escapeHtml(entry.nation)}" ${entry.raidEligible ? '' : 'disabled'}>国庫襲撃</button>
                </div>
            </div>
        `).join('') : '<div class="king-war-empty">敵国の首都情報はまだありません。</div>';
    }
    if (globalLogsEl) {
        const rows = Array.isArray(war.logs?.global) ? war.logs.global : [];
        globalLogsEl.innerHTML = rows.length ? rows.map((entry) => `
            <div class="king-war-log-entry">
                <div class="king-war-log-main">${_escapeHtml(entry.summary || '')}</div>
                <div class="king-war-log-meta">${_escapeHtml(_formatEpochMs(entry.createdAtMs))}</div>
            </div>
        `).join('') : '<div class="king-war-empty">全体戦況ログはまだありません。</div>';
    }
    if (nationLogsEl) {
        const rows = Array.isArray(war.logs?.nation) ? war.logs.nation : [];
        nationLogsEl.innerHTML = rows.length ? rows.map((entry) => `
            <div class="king-war-log-entry">
                <div class="king-war-log-main">${_escapeHtml(entry.summary || '')}</div>
                <div class="king-war-log-meta">${_escapeHtml([_formatEpochMs(entry.createdAtMs), entry.details].filter(Boolean).join(' / '))}</div>
            </div>
        `).join('') : '<div class="king-war-empty">自国戦況ログはまだありません。</div>';
    }
    if (deploySelectEl) {
        const rows = Array.isArray(war.deployWeapons) ? war.deployWeapons : [];
        deploySelectEl.innerHTML = rows.length ? rows.map((entry) => `
            <option value="${_escapeHtml(entry.id)}">${_escapeHtml(entry.label)} / ${Number(entry.costPs || 0).toLocaleString()}G${entry.cooldownRemainingMs > 0 ? ` / CT ${_escapeHtml(_formatDuration(entry.cooldownRemainingMs))}` : ''}</option>
        `).join('') : '<option value="">配備可能な兵器がありません</option>';
    }
    if (strikeWeaponEl) {
        const rows = Array.isArray(war.strikeWeapons) ? war.strikeWeapons : [];
        strikeWeaponEl.innerHTML = rows.length ? rows.map((entry) => `
            <option value="${_escapeHtml(entry.id)}">${_escapeHtml(entry.label)} / ${Number(entry.costPs || 0).toLocaleString()}G${entry.cooldownRemainingMs > 0 ? ` / CT ${_escapeHtml(_formatDuration(entry.cooldownRemainingMs))}` : ''}</option>
        `).join('') : '<option value="">攻撃兵器がありません</option>';
    }
    if (strikeTargetNationEl) {
        strikeTargetNationEl.innerHTML = (Array.isArray(war.targetOptions) ? war.targetOptions : []).map((entry) => `
            <option value="${_escapeHtml(entry.value)}">${_escapeHtml(entry.label)}</option>
        `).join('');
    }
    if (strikeTargetPartEl && !strikeTargetPartEl.options.length) {
        strikeTargetPartEl.innerHTML = `
            <option value="airDefense">防空</option>
            <option value="walls" selected>城壁</option>
            <option value="vault">金庫</option>
            <option value="command">指揮</option>
        `;
    }
}

function _grantPreview(amount, rateBps) {
    const gross = Math.max(0, Math.floor(Number(amount) || 0));
    const safeRateBps = Math.max(0, Math.floor(Number(rateBps) || 0));
    const grant = Math.floor(gross * (safeRateBps / 10000));
    return { gross, grant, rateBps: safeRateBps };
}

function _extractErrorMessage(error, fallback = 'ゴールドの付与に失敗しました。') {
    if (!error) return fallback;
    if (typeof error === 'string') return error;
    return error.message || error.errorMessage || fallback;
}

async function _scanQrValue() {
    if (!window.liff) throw new Error('LIFF が初期化されていません。');
    if (typeof window.liff.scanCodeV2 === 'function') {
        const r = await window.liff.scanCodeV2();
        return r && r.value ? String(r.value).trim() : '';
    }
    if (typeof window.liff.scanCode === 'function') {
        const r = await window.liff.scanCode();
        return r && r.value ? String(r.value).trim() : '';
    }
    throw new Error('この環境では QR 読み取り（scanCode）が利用できません。');
}

export function isKing() {
    return _isKing;
}

export function hasKingCheck() {
    return _hasKingCheck;
}

export function getLastPageData() {
    return _lastPageData;
}

export async function refreshKingNav(playFabId) {
    const nav = document.getElementById('navKing');
    if (!nav) return false;

    try {
        const data = await getNationKingPage(playFabId, { isSilent: true });
        _isKing = !!(data && !data.notInNation);
        _lastPageData = _isKing ? data : null;
    } catch (error) {
        _isKing = false;
        _lastPageData = null;
    }
    _hasKingCheck = true;
    nav.style.display = _isKing ? '' : 'none';
    return _isKing;
}

export async function loadKingPage(playFabId, options = {}) {
    _setMessage('');

    const data = options?.useCache
        ? _lastPageData
        : await getNationKingPage(playFabId);
    if (!data || data.notInNation) {
        if (options?.useCache && _isKing) {
            _setMessage('王ページデータをまだ取得できていません。再ログイン後にもう一度開いてください。', true);
            _wireHandlers(playFabId);
            return;
        }
        _isKing = false;
        _hasKingCheck = true;
        _lastPageData = null;
        const nav = document.getElementById('navKing');
        if (nav) nav.style.display = 'none';
        return;
    }
    _isKing = true;
    _hasKingCheck = true;
    _lastPageData = data;

    const currentEl = document.getElementById('kingAnnouncementCurrent');
    const metaEl = document.getElementById('kingAnnouncementMeta');
    const inputEl = document.getElementById('kingAnnouncementInput');
    const troyControlsEl = document.getElementById('troyKingControls');
    const treasuryEl = document.getElementById('kingTreasuryInfo');
    const cashbackRateEl = document.getElementById('kingCashbackRateInfo');
    const todaySalesEl = document.getElementById('kingTroyTodaySales');
    const salesSummaryEl = document.getElementById('kingTroySalesSummary');
    const pendingCountEl = document.getElementById('kingTroyPendingCount');
    const previewEl = document.getElementById('kingGrantPreview');
    const grantAmountEl = document.getElementById('kingGrantAmount');
    const troyStatusEl = document.getElementById('kingTroyStatus');
    const grantCardEl = document.getElementById('kingGrantCard');
    const manualGrantDetailsEl = document.getElementById('kingManualGrantDetails');

    if (currentEl) currentEl.innerText = (data.announcement && data.announcement.message) ? data.announcement.message : '(未設定)';
    if (metaEl) {
        const updatedAt = (data.announcement && data.announcement.updatedAt) ? _formatEpochMs(data.announcement.updatedAt) : '';
        const memberCount = (typeof data.memberCount === 'number') ? ` / メンバー数: ${data.memberCount}` : '';
        metaEl.innerText = updatedAt ? `更新: ${updatedAt}${memberCount}` : (memberCount ? memberCount.trim() : '');
    }
    if (inputEl) inputEl.value = (data.announcement && data.announcement.message) ? data.announcement.message : '';
    if (troyControlsEl) troyControlsEl.style.display = 'block';
    const ordersLink = document.querySelector('.troy-order-page-link');
    if (ordersLink && data.nation) {
        ordersLink.href = `/troy-orders.html?nation=${encodeURIComponent(data.nation)}`;
    }

    if (treasuryEl) {
        const treasuryPs = (typeof data.treasuryPs === 'number') ? data.treasuryPs : 0;
        treasuryEl.innerText = `国庫: ${treasuryPs}G`;
    }
    if (cashbackRateEl) {
        const rank = Math.max(1, Number(data.treasuryRank) || 1);
        cashbackRateEl.innerText = `${_formatRatePercentFromBps(data.troyCashbackRateBps)} / 国庫${rank}位`;
    }
    if (todaySalesEl) {
        const salesTotal = Math.max(0, Number(data?.troyTodaySales?.total) || 0);
        const salesCount = Math.max(0, Number(data?.troyTodaySales?.count) || 0);
        todaySalesEl.innerText = `本日の売上: ¥${salesTotal.toLocaleString('ja-JP')}${salesCount > 0 ? ` / ${salesCount}会計` : ''}`;
    }
    if (salesSummaryEl) {
        const salesTotal = Math.max(0, Number(data?.troyTodaySales?.total) || 0);
        salesSummaryEl.innerText = `¥${salesTotal.toLocaleString('ja-JP')}`;
    }
    if (pendingCountEl) {
        const pendingCount = Array.isArray(data?.troyPendingCheckouts) ? data.troyPendingCheckouts.length : 0;
        pendingCountEl.innerText = `${pendingCount}件`;
        pendingCountEl.classList.toggle('has-pending', pendingCount > 0);
    }
    _renderTreasuryOverview(data.treasurySummary, data.treasuryRecentEntries);
    _renderTroyMembers(data.troyMembers);
    _renderPendingTroyCheckouts(data.troyPendingCheckouts);
    _renderMenuManagement(data);
    if (troyStatusEl || grantCardEl) {
        const isOpen = !!data.troyOpen;
        if (troyStatusEl) troyStatusEl.innerText = isOpen ? 'OPEN' : 'CLOSE';
        if (troyStatusEl) troyStatusEl.classList.toggle('is-open', isOpen);
        if (grantCardEl) grantCardEl.style.display = isOpen ? '' : 'none';
        if (manualGrantDetailsEl) manualGrantDetailsEl.style.display = isOpen ? '' : 'none';
    }
    if (previewEl && grantAmountEl) {
        const p = _grantPreview(grantAmountEl.value, data.troyCashbackRateBps);
        previewEl.innerText = p.gross > 0
            ? `お客様: ${p.grant}G / 国庫: ${p.gross}G / 還元率: ${_formatRatePercentFromBps(p.rateBps)}`
            : '';
    }
    _renderNationWar(data.war);

    _wireHandlers(playFabId);
}

let _wired = false;
function _wireHandlers(playFabId) {
    if (_wired) return;
    _wired = true;

    const saveBtn = document.getElementById('btnKingSaveAnnouncement');
    const reloadBtn = document.getElementById('btnKingReload');
    const reloadBtn2 = document.getElementById('btnKingReload2');
    const inputEl = document.getElementById('kingAnnouncementInput');
    const grantReceiverEl = document.getElementById('kingGrantReceiverId');
    const grantAmountEl = document.getElementById('kingGrantAmount');
    const grantBtn = document.getElementById('btnKingGrantPs');
    const troyOpenBtn = document.getElementById('btnKingTroyOpen');
    const troyCloseBtn = document.getElementById('btnKingTroyClose');
    const troyStatusEl = document.getElementById('kingTroyStatus');
    const grantCardEl = document.getElementById('kingGrantCard');
    const manualGrantDetailsEl = document.getElementById('kingManualGrantDetails');
    const pendingCheckoutEl = document.getElementById('kingPendingCheckoutList');
    const scanReceiverBtn = document.getElementById('btnKingScanReceiver');
    const clearReceiverBtn = document.getElementById('btnKingClearReceiver');
    const previewEl = document.getElementById('kingGrantPreview');
    const warSectionEl = document.getElementById('kingWarSection');
    const warDeployWeaponEl = document.getElementById('kingWarDeployWeapon');
    const warStrikeWeaponEl = document.getElementById('kingWarStrikeWeapon');
    const warTargetNationEl = document.getElementById('kingWarTargetNation');
    const warTargetPartEl = document.getElementById('kingWarTargetPart');
    const warDeployBtn = document.getElementById('btnKingWarDeploy');
    const warStrikeBtn = document.getElementById('btnKingWarStrike');

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const message = inputEl ? String(inputEl.value || '') : '';
            const result = await setNationAnnouncement(playFabId, message);
            if (result) {
                _setMessage('告知を更新しました。');
                await loadKingPage(playFabId);
            }
        });
    }

    if (reloadBtn) {
        reloadBtn.addEventListener('click', async () => {
            await loadKingPage(playFabId);
        });
    }

    if (reloadBtn2) {
        reloadBtn2.addEventListener('click', async () => {
            await loadKingPage(playFabId);
        });
    }

    if (grantAmountEl && previewEl) {
        grantAmountEl.addEventListener('input', () => {
            const rateBps = _lastPageData && Number.isFinite(Number(_lastPageData.troyCashbackRateBps))
                ? Number(_lastPageData.troyCashbackRateBps)
                : 0;
            const p = _grantPreview(grantAmountEl.value, rateBps);
            previewEl.innerText = p.gross > 0
                ? `お客様: ${p.grant}G / 国庫: ${p.gross}G / 還元率: ${_formatRatePercentFromBps(p.rateBps)}`
                : '';
        });
    }

    if (scanReceiverBtn && grantReceiverEl) {
        scanReceiverBtn.addEventListener('click', async () => {
            try {
                const value = await _scanQrValue();
                if (value) grantReceiverEl.value = value;
            } catch (e) {
                _setMessage(e.message || String(e), true);
            }
        });
    }

    if (clearReceiverBtn && grantReceiverEl) {
        clearReceiverBtn.addEventListener('click', () => {
            grantReceiverEl.value = '';
        });
    }

    if (grantBtn) {
        grantBtn.addEventListener('click', async () => {
            const receiverPlayFabId = grantReceiverEl ? String(grantReceiverEl.value || '').trim() : '';
            const amount = grantAmountEl ? Number(grantAmountEl.value) : 0;
            if (!receiverPlayFabId) {
                _setMessage('お客様のIDが入力されていません。', true);
                return;
            }
            if (!amount || amount <= 0) {
                _setMessage('金額は1以上を入力してください。', true);
                return;
            }
            if (!confirm(`¥${Math.floor(amount)} を受け取り、お客様にゴールドを渡します。よろしいですか？`)) return;

            const nextAmount = Math.floor(amount);
            const previousLabel = grantBtn.innerText;
            grantBtn.disabled = true;
            grantBtn.innerText = '処理中...';
            _setMessage('');
            try {
                const requestId = createRequestId('king-grant');
                const result = await grantPs(playFabId, receiverPlayFabId, nextAmount, requestId);
                if (result) {
                    const rankLabel = Math.max(1, Number(result.treasuryRank) || 1);
                    const baseMessage = `ゴールドを渡しました（お客様: ${result.grantAmount}G / 国庫: ${result.receivedAmount}G / 還元率: ${_formatRatePercentFromBps(result.cashbackRateBps)} / 国庫${rankLabel}位）。`;
                    if (result.treasuryUpdated === false) {
                        _setMessage(`${baseMessage} 国庫更新に失敗しました: ${result.treasuryError || 'Unknown error'}`, true);
                    } else {
                        _setMessage(baseMessage);
                    }
                    if (grantAmountEl) {
                        grantAmountEl.value = '0';
                    }
                    if (previewEl) {
                        previewEl.innerText = '';
                    }
                    await loadKingPage(playFabId);
                }
            } catch (error) {
                _setMessage(_extractErrorMessage(error), true);
            } finally {
                grantBtn.disabled = false;
                grantBtn.innerText = previousLabel;
            }
        });
    }

    if (pendingCheckoutEl) {
        pendingCheckoutEl.addEventListener('click', async (event) => {
            const button = event.target instanceof Element ? event.target.closest('[data-pending-settle="true"]') : null;
            if (!button) return;
            const receiverPlayFabId = String(button.getAttribute('data-receiver-id') || '').trim();
            const expectedTotal = Math.max(0, Math.floor(Number(button.getAttribute('data-amount')) || 0));
            const checkoutStatus = String(button.getAttribute('data-checkout-status') || 'open').trim().toLowerCase();
            const card = button.closest('.king-pending-checkout-card');
            const depositInput = card?.querySelector('[data-coin-deposit-input="true"]');
            const coinDepositAmount = Math.max(0, Math.floor(Number(depositInput?.value) || 0));
            if (!receiverPlayFabId || expectedTotal <= 0) {
                _setMessage('会計対象の情報が不正です。', true);
                return;
            }
            const depositNote = coinDepositAmount > 0
                ? `\n預かりコイン ${coinDepositAmount.toLocaleString('ja-JP')}G をゴールド化します。`
                : '';
            const confirmMessage = checkoutStatus === 'pending'
                ? `¥${expectedTotal.toLocaleString('ja-JP')} の会計を確定してゴールドを渡しますか？${depositNote}`
                : `現金 ¥${expectedTotal.toLocaleString('ja-JP')} を受け取り済みにしますか？${depositNote}`;
            if (!confirm(confirmMessage)) return;

            const previous = button.innerText;
            button.setAttribute('disabled', 'disabled');
            if (depositInput) depositInput.setAttribute('disabled', 'disabled');
            button.innerText = '処理中...';
            try {
                const requestId = createRequestId('king-settle-troy-checkout');
                const result = await settleTroyCheckout(playFabId, receiverPlayFabId, expectedTotal, requestId, { coinDepositAmount });
                const rankLabel = Number.isFinite(Number(result?.treasuryRank)) ? Math.max(1, Number(result.treasuryRank)) : null;
                const grantLabel = Math.max(0, Number(result?.grantAmount) || 0);
                const coinDepositLabel = Math.max(0, Number(result?.coinDepositAmount) || coinDepositAmount);
                const grantNote = grantLabel > 0
                    ? ` / ゴールド追加付与: ${grantLabel}G / 還元率: ${_formatRatePercentFromBps(result?.cashbackRateBps || 0)}`
                    : '';
                const coinDepositNote = coinDepositLabel > 0 ? ` / 預かりコイン: ${coinDepositLabel.toLocaleString('ja-JP')}G` : '';
                const rankNote = rankLabel ? ` / 国庫${rankLabel}位` : '';
                const todaySalesTotal = Math.max(0, Number(result?.troyTodaySales?.total) || 0);
                const todaySalesNote = todaySalesTotal > 0 ? ` / 本日売上: ¥${todaySalesTotal.toLocaleString('ja-JP')}` : '';
                _setMessage(`お会計しました（国庫: ${result?.receivedAmount || expectedTotal}G${grantNote}${coinDepositNote}${rankNote}${todaySalesNote}）。`);
                await loadKingPage(playFabId);
            } catch (error) {
                _setMessage(_extractErrorMessage(error, 'お会計に失敗しました。'), true);
            } finally {
                button.removeAttribute('disabled');
                if (depositInput) depositInput.removeAttribute('disabled');
                button.innerText = previous;
            }
        });
    }

    if (troyOpenBtn) {
        troyOpenBtn.addEventListener('click', async () => {
            const result = await setTroyOpen(playFabId, true);
            if (result) {
                if (troyStatusEl) troyStatusEl.innerText = 'OPEN';
                if (troyStatusEl) troyStatusEl.classList.add('is-open');
                if (grantCardEl) grantCardEl.style.display = '';
                if (manualGrantDetailsEl) manualGrantDetailsEl.style.display = '';
                await loadKingPage(playFabId);
                _setMessage('TROYをOPENにしました。');
            }
        });
    }

    if (troyCloseBtn) {
        troyCloseBtn.addEventListener('click', async () => {
            const pendingCount = Array.isArray(_lastPageData?.troyPendingCheckouts) ? _lastPageData.troyPendingCheckouts.length : 0;
            if (pendingCount > 0) {
                const ok = confirm(`お会計待ちが ${pendingCount}件 います。TROYをCLOSEしますか？`);
                if (!ok) return;
            }
            const result = await setTroyOpen(playFabId, false);
            if (result) {
                if (troyStatusEl) troyStatusEl.innerText = 'CLOSE';
                if (troyStatusEl) troyStatusEl.classList.remove('is-open');
                if (grantCardEl) grantCardEl.style.display = 'none';
                if (manualGrantDetailsEl) manualGrantDetailsEl.style.display = 'none';
                await loadKingPage(playFabId);
                _setMessage('TROYをCLOSEにしました。');
            }
        });
    }

    const menuDisableListEl = document.getElementById('kingMenuDisableList');
    if (menuDisableListEl) {
        menuDisableListEl.addEventListener('click', async (event) => {
            const btn = event.target instanceof Element ? event.target.closest('[data-menu-toggle]') : null;
            if (!btn) return;
            const concept = String(btn.getAttribute('data-menu-toggle') || '').trim();
            if (!concept) return;
            const previous = btn.textContent;
            btn.disabled = true;
            btn.textContent = '処理中...';
            try {
                await kingUpdateMenu(playFabId, { action: 'toggleDisabled', concept }, { isSilent: true });
                await loadKingPage(playFabId);
            } catch (error) {
                _setMessage(_extractErrorMessage(error, 'メニューの更新に失敗しました。'), true);
                btn.disabled = false;
                btn.textContent = previous;
            }
        });
    }

    const menuSpecialsListEl = document.getElementById('kingMenuSpecialsList');
    if (menuSpecialsListEl) {
        menuSpecialsListEl.addEventListener('click', async (event) => {
            const btn = event.target instanceof Element ? event.target.closest('[data-special-remove]') : null;
            if (!btn) return;
            const id = String(btn.getAttribute('data-special-remove') || '').trim();
            if (!id) return;
            btn.disabled = true;
            btn.textContent = '処理中...';
            try {
                await kingUpdateMenu(playFabId, { action: 'removeSpecial', id }, { isSilent: true });
                await loadKingPage(playFabId);
            } catch (error) {
                _setMessage(_extractErrorMessage(error, 'おすすめの削除に失敗しました。'), true);
                btn.disabled = false;
                btn.textContent = '削除';
            }
        });
    }

    const addSpecialBtn = document.getElementById('btnKingMenuAddSpecial');
    if (addSpecialBtn) {
        addSpecialBtn.addEventListener('click', async () => {
            const nameEl = document.getElementById('kingMenuSpecialName');
            const priceEl = document.getElementById('kingMenuSpecialPrice');
            const emojiEl = document.getElementById('kingMenuSpecialEmoji');
            const name = String(nameEl?.value || '').trim();
            const price = Math.max(0, Math.floor(Number(priceEl?.value) || 0));
            const emoji = String(emojiEl?.value || '').trim() || '⭐';
            if (!name) { _setMessage('商品名を入力してください。', true); return; }
            if (!price) { _setMessage('金額を入力してください。', true); return; }
            const previous = addSpecialBtn.textContent;
            addSpecialBtn.disabled = true;
            addSpecialBtn.textContent = '追加中...';
            try {
                await kingUpdateMenu(playFabId, { action: 'addSpecial', name, price, emoji }, { isSilent: true });
                if (nameEl) nameEl.value = '';
                if (priceEl) priceEl.value = '';
                if (emojiEl) emojiEl.value = '';
                await loadKingPage(playFabId);
                _setMessage('おすすめを追加しました。');
            } catch (error) {
                _setMessage(_extractErrorMessage(error, 'おすすめの追加に失敗しました。'), true);
            } finally {
                addSpecialBtn.disabled = false;
                addSpecialBtn.textContent = previous;
            }
        });
    }

    if (warDeployBtn && warDeployWeaponEl) {
        warDeployBtn.addEventListener('click', async () => {
            const weaponId = String(warDeployWeaponEl.value || '').trim();
            if (!weaponId) {
                _setMessage('配備する兵器を選んでください。', true);
                return;
            }
            const previous = warDeployBtn.innerText;
            warDeployBtn.disabled = true;
            warDeployBtn.innerText = '配備中...';
            try {
                await deployNationWarWeapon(playFabId, weaponId);
                _setMessage('兵器を配備しました。');
                await loadKingPage(playFabId);
            } catch (error) {
                _setMessage(_extractErrorMessage(error, '兵器の配備に失敗しました。'), true);
            } finally {
                warDeployBtn.disabled = false;
                warDeployBtn.innerText = previous;
            }
        });
    }

    if (warStrikeBtn && warStrikeWeaponEl && warTargetNationEl && warTargetPartEl) {
        warStrikeBtn.addEventListener('click', async () => {
            const weaponId = String(warStrikeWeaponEl.value || '').trim();
            const targetNation = String(warTargetNationEl.value || '').trim();
            const targetPart = String(warTargetPartEl.value || '').trim();
            if (!weaponId || !targetNation || !targetPart) {
                _setMessage('攻撃兵器・対象国・狙う部位を選んでください。', true);
                return;
            }
            const previous = warStrikeBtn.innerText;
            warStrikeBtn.disabled = true;
            warStrikeBtn.innerText = '準備中...';
            try {
                await prepareNationWarStrike(playFabId, weaponId, targetNation, targetPart);
                _setMessage('攻撃準備を開始しました。');
                await loadKingPage(playFabId);
            } catch (error) {
                _setMessage(_extractErrorMessage(error, '攻撃準備に失敗しました。'), true);
            } finally {
                warStrikeBtn.disabled = false;
                warStrikeBtn.innerText = previous;
            }
        });
    }

    if (warSectionEl) {
        warSectionEl.addEventListener('click', async (event) => {
            const button = event.target instanceof Element ? event.target.closest('[data-war-action]') : null;
            if (!button) return;
            const action = String(button.getAttribute('data-war-action') || '').trim().toLowerCase();
            const incomingId = String(button.getAttribute('data-incoming-id') || '').trim();
            const targetNation = String(button.getAttribute('data-target-nation') || '').trim();
            if (!action) return;
            if ((action === 'intercept' || action === 'skip') && !incomingId) return;
            if (action === 'raid' && !targetNation) return;
            const previous = button.innerText;
            button.setAttribute('disabled', 'disabled');
            button.innerText = action === 'intercept' ? '迎撃中...' : action === 'raid' ? '襲撃中...' : '更新中...';
            try {
                if (action === 'raid') {
                    const result = await raidNationTreasury(playFabId, targetNation);
                    const rewardCount = Number(result?.participantRewardCount || 0);
                    const rewardSuffix = rewardCount > 0
                        ? ` 参加者へタロットカード ${rewardCount} 枚を配布しました。`
                        : '';
                    _setMessage(`国庫襲撃を実行しました。${rewardSuffix}`);
                    await loadKingPage(playFabId);
                    return;
                }
                let interceptSystemId = '';
                if (action === 'intercept') {
                    const select = warSectionEl.querySelector(`.king-war-intercept-system[data-incoming-id="${incomingId}"]`);
                    interceptSystemId = select ? String(select.value || '').trim() : '';
                    if (!interceptSystemId) {
                        throw new Error('迎撃兵器を選んでください。');
                    }
                }
                await respondNationWarIntercept(playFabId, incomingId, action, interceptSystemId);
                _setMessage(action === 'intercept' ? '迎撃命令を出しました。' : '迎撃を見送りました。');
                await loadKingPage(playFabId);
            } catch (error) {
                _setMessage(_extractErrorMessage(error, '迎撃判断の更新に失敗しました。'), true);
            } finally {
                button.removeAttribute('disabled');
                button.innerText = previous;
            }
        });
    }
}
