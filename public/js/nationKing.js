// c:/Users/ikeda/my-liff-app/public/js/nationKing.js

import {
    getNationKingPage,
    deployNationWarWeapon,
    prepareNationWarStrike,
    respondNationWarIntercept,
    raidNationTreasury,
    setNationAnnouncement,
    directGrantPs,
    kingReturnTroyCoin,
    kingUpdateStoreGameScore,
    setTroyOpen,
    kingUpdateMenu,
    getReservations,
    reviewReservation,
    getTroyCalendar,
    saveTroyCalendarEntry,
    deleteTroyCalendarEntry
} from './playfabClient.js';
import { createRequestId } from './api.js';
import { buildPlayerTriggerHtml } from './playerProfile.js';
import { formatUnlockedFeatures } from './featureUnlocks.js';

let _isKing = false;
let _lastPageData = null;
let _hasKingCheck = false;
const STORE_GAME_LABELS = {
    darts_countup: 'ダーツカウントアップ',
    billiards: 'ビリヤード',
    game: 'ゲーム',
    karaoke: 'カラオケ採点'
};
const STORE_GAME_RATING_TYPES = new Set(['billiards', 'game']);
const KING_SECTION_IDS = new Set(['ops', 'store', 'calendar', 'menu', 'notice']);

function _getStoreGameOptionsHtml(selected = 'darts_countup') {
    const current = String(selected || 'darts_countup').trim().toLowerCase();
    return Object.entries(STORE_GAME_LABELS).map(([value, label]) => (
        `<option value="${_escapeHtml(value)}"${value === current ? ' selected' : ''}>${_escapeHtml(label)}</option>`
    )).join('');
}

function _getStoreGameOpponentOptionsHtml(members = [], currentPlayFabId = '') {
    const current = String(currentPlayFabId || '').trim();
    const options = (Array.isArray(members) ? members : [])
        .map((member) => ({
            playFabId: String(member?.playFabId || member?.id || '').trim(),
            displayName: String(member?.displayName || member?.playFabId || member?.id || 'Player').trim()
        }))
        .filter((member) => member.playFabId && member.playFabId !== current);
    if (!options.length) return '<option value="">対戦相手なし</option>';
    return [
        '<option value="">負けた相手を選択</option>',
        ...options.map((member) => (
            `<option value="${_escapeHtml(member.playFabId)}">${_escapeHtml(member.displayName)}</option>`
        ))
    ].join('');
}

function _setMessage(text, isError = false) {
    const el = document.getElementById('kingPageMessage');
    if (!el) return;
    el.style.color = isError ? 'var(--danger-color)' : 'var(--accent-color)';
    el.innerText = text || '';
}

function _setKingSectionActive(sectionId = 'store') {
    const safeId = KING_SECTION_IDS.has(String(sectionId || '')) ? String(sectionId) : 'store';
    document.querySelectorAll('[data-king-section-tab]').forEach((button) => {
        const id = String(button.getAttribute('data-king-section-tab') || '').trim();
        const active = id === safeId;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.setAttribute('tabindex', active ? '0' : '-1');
    });
    document.querySelectorAll('[data-king-section-panel]').forEach((panel) => {
        const id = String(panel.getAttribute('data-king-section-panel') || '').trim();
        panel.hidden = id !== safeId;
    });
}

function _ensureKingSectionActive(defaultSectionId = 'store') {
    const active = document.querySelector('[data-king-section-tab].is-active');
    const activeId = String(active?.getAttribute('data-king-section-tab') || '').trim();
    _setKingSectionActive(KING_SECTION_IDS.has(activeId) ? activeId : defaultSectionId);
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
        const playFabId = String(member.playFabId || member.id || '').trim();
        const level = Math.max(1, Math.floor(Number(member.level) || 1));
        const rankName = String(member.rankName || '見習い').trim();
        const rankBenefits = Array.isArray(member.rankBenefits)
            ? member.rankBenefits.map((entry) => String(entry || '').trim()).filter(Boolean)
            : [];
        const benefitText = rankBenefits.length ? rankBenefits.join(' / ') : '通常サービス';
        const displayName = String(member.displayName || playFabId || 'Player').trim();
        const opponentOptionsHtml = _getStoreGameOpponentOptionsHtml(rows, playFabId);
        return `
            <div class="troy-entry-item is-king-entry" data-troy-entry-player="${_escapeHtml(playFabId)}">
                <div class="troy-entry-row">
                    <div class="troy-entry-main">
                        <b>${buildPlayerTriggerHtml(playFabId, displayName, { className: 'player-link-inline' })}</b>
                        <span class="troy-entry-rank">Lv.${level} ${_escapeHtml(rankName)}</span>
                        <span class="troy-entry-benefit">${_escapeHtml(benefitText)}</span>
                        <span>${_escapeHtml(joinedAt)}</span>
                    </div>
                    <div class="king-direct-grant-controls">
                        <input type="number" class="king-direct-grant-input" min="100" step="100" inputmode="numeric" value="100" data-direct-grant-amount="${_escapeHtml(playFabId)}" aria-label="付与G" />
                        <button type="button" class="btn-muted king-direct-grant-btn" data-direct-grant="${_escapeHtml(playFabId)}">付与</button>
                    </div>
                </div>
                <div class="king-chip-return-panel">
                    <span class="king-chip-return-label">チップ返却</span>
                    <div class="king-chip-return-controls">
                        <div class="transfer-input-row king-chip-return-input-row">
                            <input type="number" min="1" step="1" inputmode="numeric" placeholder="返却G" value="0" data-chip-return-amount="${_escapeHtml(playFabId)}" aria-label="${_escapeHtml(displayName)}への返却G" />
                            <span>G</span>
                        </div>
                        <button type="button" class="btn-muted king-chip-return-btn" data-chip-return="${_escapeHtml(playFabId)}" data-chip-return-name="${_escapeHtml(displayName)}">返却</button>
                    </div>
                </div>
                <details class="king-store-game-inline">
                    <summary>店内ゲーム採点</summary>
                    <div class="king-store-game-inline-form" data-store-game-form="${_escapeHtml(playFabId)}" data-store-game-name="${_escapeHtml(displayName)}">
                        <div class="king-store-game-inline-grid">
                            <label>
                                <span class="troy-admin-field-label">種目</span>
                                <select class="admin-input" data-store-game-type>
                                    ${_getStoreGameOptionsHtml()}
                                </select>
                            </label>
                            <label data-store-game-score-field>
                                <span class="troy-admin-field-label">点数</span>
                                <input type="number" min="1" step="1" placeholder="例: 701" class="admin-input" data-store-game-score />
                            </label>
                            <label class="king-store-game-opponent-field" data-store-game-opponent-field hidden>
                                <span class="troy-admin-field-label">負けた相手</span>
                                <select class="admin-input" data-store-game-opponent>
                                    ${opponentOptionsHtml}
                                </select>
                            </label>
                        </div>
                        <div class="king-store-game-inline-actions">
                            <button type="button" class="btn-open king-store-game-inline-save" data-store-game-save="${_escapeHtml(playFabId)}" data-store-game-name="${_escapeHtml(displayName)}">点数を保存</button>
                        </div>
                    </div>
                </details>
            </div>
        `;
    }).join('');
    listEl.querySelectorAll('.king-store-game-inline-form').forEach((form) => {
        _syncStoreGameForm(form);
    });
}

function _formatCalendarDate(ms) {
    const value = Number(ms || 0);
    if (!value) return '';
    return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short'
    }).format(new Date(value));
}

function _calendarStatusLabel(status) {
    switch (String(status || '').toLowerCase()) {
        case 'closed': return '休業';
        case 'private': return '貸切';
        case 'tentative': return '仮予定';
        default: return '営業';
    }
}

function _reservationStatusLabel(status) {
    switch (String(status || '').toLowerCase()) {
        case 'approved': return '承認済み';
        case 'rejected': return '却下';
        case 'cancelled': return 'キャンセル';
        default: return '申請中';
    }
}

function _formatReservationDate(ms) {
    const value = Number(ms || 0);
    if (!value) return '-';
    return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(value));
}

function _renderKingReservations(reservations = []) {
    const mount = document.getElementById('kingTroyReservationMount');
    if (!mount) return;
    const rows = Array.isArray(reservations) ? reservations : [];
    const activeRows = rows
        .filter((reservation) => ['pending', 'approved'].includes(String(reservation?.status || 'pending')))
        .sort((a, b) => {
            const statusWeight = (status) => (String(status || 'pending') === 'pending' ? 0 : 1);
            const diff = statusWeight(a.status) - statusWeight(b.status);
            if (diff) return diff;
            return Number(a.startsAtMs || 0) - Number(b.startsAtMs || 0);
        });

    mount.innerHTML = `
        <div class="troy-admin-label">予約申請</div>
        <div class="troy-admin-help">LINEで届いた店舗予約はここで承認または却下できます。</div>
        <div class="king-reservation-list">
            ${activeRows.length ? activeRows.map((reservation) => {
                const status = String(reservation?.status || 'pending').toLowerCase();
                const canReview = !!reservation?.canReview;
                const purpose = String(reservation?.purposeLabel || reservation?.purpose || '予約').trim();
                return `
                    <div class="king-reservation-card is-${_escapeHtml(status)}" data-reservation-id="${_escapeHtml(reservation.id)}">
                        <div class="king-reservation-head">
                            <strong>${_escapeHtml(_formatReservationDate(reservation.startsAtMs))}</strong>
                            <span class="king-reservation-status">${_escapeHtml(_reservationStatusLabel(status))}</span>
                        </div>
                        <div class="king-reservation-meta">
                            <span>申請者: ${_escapeHtml(reservation.displayName || 'Player')}</span>
                            <span>人数: ${Math.max(0, Number(reservation.partySize) || 0)}名</span>
                            <span>用途: ${_escapeHtml(purpose)}</span>
                        </div>
                        ${reservation.note ? `<div class="king-reservation-note">${_escapeHtml(reservation.note)}</div>` : ''}
                        ${canReview ? `
                            <div class="king-reservation-actions">
                                <button type="button" class="btn-open" data-reservation-review="${_escapeHtml(reservation.id)}" data-reservation-approve="true">承認</button>
                                <button type="button" class="btn-muted" data-reservation-review="${_escapeHtml(reservation.id)}" data-reservation-approve="false">却下</button>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('') : '<div class="troy-calendar-empty">予約申請はありません。</div>'}
        </div>
    `;
}

function _renderKingTroyCalendar(entries = []) {
    const mount = document.getElementById('kingTroyCalendarMount');
    if (!mount) return;
    const rows = Array.isArray(entries) ? entries : [];
    mount.innerHTML = `
        <div class="troy-admin-label">営業カレンダー</div>
        <div id="kingTroyCalendarList" class="troy-calendar-list">
            ${rows.length ? rows.map((entry) => {
                const status = String(entry?.status || 'open').toLowerCase();
                const time = status === 'closed' ? '休業' : `${entry.openTime || '--:--'}-${entry.closeTime || '--:--'}`;
                return `
                    <div class="troy-calendar-item is-${_escapeHtml(status)}">
                        <div class="troy-calendar-date">${_escapeHtml(_formatCalendarDate(entry.startsAtMs))}</div>
                        <div class="troy-calendar-main">
                            <div class="troy-calendar-title-row">
                                <strong>${_escapeHtml(entry.title || 'TROY営業')}</strong>
                                <span class="troy-calendar-status">${_escapeHtml(_calendarStatusLabel(status))}</span>
                            </div>
                            <div class="troy-calendar-time">${_escapeHtml(time)}</div>
                            ${entry.note ? `<div class="troy-calendar-note">${_escapeHtml(entry.note)}</div>` : ''}
                            <div class="troy-calendar-actions">
                                <button type="button" class="btn-muted" data-calendar-edit="${_escapeHtml(entry.id)}">編集</button>
                                <button type="button" class="btn-muted" data-calendar-delete="${_escapeHtml(entry.id)}">削除</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('') : '<div class="troy-calendar-empty">営業予定はまだありません。</div>'}
        </div>
        <div class="troy-admin-field-label">営業予定を追加・編集</div>
        <input id="kingTroyCalendarId" type="hidden" />
        <div class="troy-admin-grid troy-calendar-form-grid">
            <div>
                <div class="troy-admin-field-label">日付</div>
                <input id="kingTroyCalendarDate" type="date" class="admin-input" />
            </div>
            <div>
                <div class="troy-admin-field-label">OPEN</div>
                <input id="kingTroyCalendarOpenTime" type="time" class="admin-input" value="21:00" />
            </div>
            <div>
                <div class="troy-admin-field-label">CLOSE</div>
                <input id="kingTroyCalendarCloseTime" type="time" class="admin-input" value="23:59" />
            </div>
            <div>
                <div class="troy-admin-field-label">状態</div>
                <select id="kingTroyCalendarStatus" class="admin-input">
                    <option value="open">営業</option>
                    <option value="tentative">仮予定</option>
                    <option value="private">貸切</option>
                    <option value="closed">休業</option>
                </select>
            </div>
        </div>
        <div class="troy-admin-grid">
            <div>
                <div class="troy-admin-field-label">タイトル</div>
                <input id="kingTroyCalendarTitle" type="text" class="admin-input" maxlength="80" placeholder="例: 通常営業" />
            </div>
            <div>
                <div class="troy-admin-field-label">メモ</div>
                <input id="kingTroyCalendarNote" type="text" class="admin-input" maxlength="300" placeholder="例: 21時から混雑予定" />
            </div>
        </div>
        <div class="troy-admin-actions">
            <button id="btnKingTroyCalendarSave" class="btn-open">保存</button>
            <button id="btnKingTroyCalendarClear" class="btn-muted">クリア</button>
        </div>
    `;
}

async function _loadKingTroyCalendar(playFabId, nation) {
    try {
        const result = await getTroyCalendar(playFabId, {}, { isSilent: true });
        const calendar = result?.calendar || [];
        if (_lastPageData) _lastPageData.troyCalendar = calendar;
        _renderKingTroyCalendar(calendar);
    } catch (error) {
        const mount = document.getElementById('kingTroyCalendarMount');
        if (mount) mount.innerHTML = '<div class="troy-calendar-empty">営業予定を読み込めませんでした。</div>';
        console.warn('[KingTroyCalendar] load failed:', error?.message || error);
    }
}

async function _loadKingReservations(playFabId) {
    try {
        const result = await getReservations(playFabId, { isSilent: true });
        const reservations = Array.isArray(result?.reservations) ? result.reservations : [];
        if (_lastPageData) _lastPageData.reservations = reservations;
        _renderKingReservations(reservations);
    } catch (error) {
        const mount = document.getElementById('kingTroyReservationMount');
        if (mount) mount.innerHTML = '<div class="troy-calendar-empty">予約申請を読み込めませんでした。</div>';
        console.warn('[KingReservations] load failed:', error?.message || error);
    }
}

function _clearCalendarForm() {
    const idEl = document.getElementById('kingTroyCalendarId');
    const dateEl = document.getElementById('kingTroyCalendarDate');
    const openEl = document.getElementById('kingTroyCalendarOpenTime');
    const closeEl = document.getElementById('kingTroyCalendarCloseTime');
    const statusEl = document.getElementById('kingTroyCalendarStatus');
    const titleEl = document.getElementById('kingTroyCalendarTitle');
    const noteEl = document.getElementById('kingTroyCalendarNote');
    if (idEl) idEl.value = '';
    if (dateEl) dateEl.value = '';
    if (openEl) openEl.value = '21:00';
    if (closeEl) closeEl.value = '23:59';
    if (statusEl) statusEl.value = 'open';
    if (titleEl) titleEl.value = '';
    if (noteEl) noteEl.value = '';
}

const _KING_MENU_CATEGORY_OPTIONS = [
    { id: 'beer', label: 'ビール・ハイボール' },
    { id: 'gin', label: 'ジンベース' },
    { id: 'vodka', label: 'ウォッカベース' },
    { id: 'rum', label: 'ラムベース' },
    { id: 'tequila', label: 'テキーラベース' },
    { id: 'liqueur', label: 'リキュール・その他' },
    { id: 'whisky', label: 'ウイスキー・焼酎・ワイン' },
    { id: 'mixer', label: '割り物' },
    { id: 'food', label: '酒場のフード' },
    { id: 'soft', label: 'ソフトドリンク' }
];

const _KING_MENU_CATEGORY_LABELS = new Map([
    ..._KING_MENU_CATEGORY_OPTIONS.map((option) => [option.id, option.label]),
    ['bottle', 'ウイスキー・焼酎・ワイン']
]);

function _renderMenuManagement(data) {
    const customListEl = document.getElementById('kingMenuCustomList');
    const customCategoryEl = document.getElementById('kingMenuCustomCategory');
    const customItems = Array.isArray(data?.menuCustomItems) ? data.menuCustomItems : [];

    if (customCategoryEl && !customCategoryEl.dataset.initialized) {
        customCategoryEl.innerHTML = _KING_MENU_CATEGORY_OPTIONS
            .map((option) => `<option value="${_escapeHtml(option.id)}">${_escapeHtml(option.label)}</option>`)
            .join('');
        customCategoryEl.dataset.initialized = 'true';
    }

    if (customListEl) {
        if (!customItems.length) {
            customListEl.innerHTML = '<div class="king-menu-specials-empty">追加したスタッフ用オーダーメニューはありません。</div>';
        } else {
            customListEl.innerHTML = customItems.map((item) => {
                const menuId = String(item?.menuId || '').trim();
                const category = _KING_MENU_CATEGORY_LABELS.get(menuId) || menuId;
                const note = [category, String(item?.content || '').trim()].filter(Boolean).join(' / ');
                return `
                    <div class="king-menu-special-row">
                        <span class="king-menu-special-emoji">${_escapeHtml(item.emoji || '🍽')}</span>
                        <span class="king-menu-special-name">${_escapeHtml(item.concept || item.name || '')}<small>${_escapeHtml(note)}</small></span>
                        <span class="king-menu-special-price">¥${Math.max(0, Number(item.price) || 0).toLocaleString('ja-JP')}</span>
                        <button type="button" class="btn-muted king-menu-special-remove" data-custom-remove="${_escapeHtml(item.id)}">削除</button>
                    </div>
                `;
            }).join('');
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

function _extractErrorMessage(error, fallback = 'ゴールドの付与に失敗しました。') {
    if (!error) return fallback;
    const raw = typeof error === 'string'
        ? error
        : (error.message || error.errorMessage || error.error || '');
    const message = String(raw || '')
        .replace(/^通信エラー:\s*/, '')
        .replace(/\s*\(HTTP\s+\d+\)\s*$/i, '')
        .trim();
    if (!message) return fallback;
    if (message.includes('requestId is required')) return '処理IDの発行に失敗しました。画面を再読み込みしてもう一度お試しください。';
    if (message.includes('NotInTroy')) return '入店リストにいないプレイヤーです。入店状態を確認してください。';
    if (message.includes('NotKingForOpenTroy')) return 'TROYの開閉に失敗しました。状態を再読み込みしてもう一度お試しください。';
    if (message.includes('NotKing')) return '王のみ操作できます。';
    if (message.includes('Authentication required')) return 'ログイン状態を確認できません。再ログインしてください。';
    if (message.includes('EntityKeyNotFound')) return '受取人のアカウントが見つかりません。';
    return message;
}

function _formatStoreGameScore(score, gameType) {
    const value = Number(score || 0);
    if (gameType === 'karaoke') {
        return value.toLocaleString('ja-JP', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    }
    return Math.floor(value).toLocaleString('ja-JP');
}

function _getStoreGameLabel(gameType) {
    return STORE_GAME_LABELS[String(gameType || '').trim().toLowerCase()] || STORE_GAME_LABELS.darts_countup;
}

function _isStoreGameRatingType(gameType) {
    return STORE_GAME_RATING_TYPES.has(String(gameType || '').trim().toLowerCase());
}

function _syncStoreGameForm(form) {
    if (!form) return;
    const typeEl = form.querySelector('[data-store-game-type]');
    const scoreEl = form.querySelector('[data-store-game-score]');
    const scoreField = form.querySelector('[data-store-game-score-field]');
    const opponentEl = form.querySelector('[data-store-game-opponent]');
    const opponentField = form.querySelector('[data-store-game-opponent-field]');
    const saveBtn = form.querySelector('[data-store-game-save]');
    const gameType = String(typeEl?.value || 'darts_countup');
    const isRating = _isStoreGameRatingType(gameType);
    form.classList.toggle('is-rating', isRating);
    if (scoreField) scoreField.hidden = isRating;
    if (opponentField) opponentField.hidden = !isRating;
    if (scoreEl) {
        const isKaraoke = gameType === 'karaoke';
        scoreEl.step = isKaraoke ? '0.001' : '1';
        scoreEl.min = isKaraoke ? '0.001' : '1';
        scoreEl.placeholder = isKaraoke ? '例: 90.568' : '例: 701';
        scoreEl.required = !isRating;
    }
    if (opponentEl) {
        opponentEl.required = isRating;
    }
    if (saveBtn && !saveBtn.disabled) {
        saveBtn.textContent = isRating ? '勝利を記録' : '点数を保存';
    }
}

function _syncStoreGameScoreInput(typeEl, scoreEl) {
    const form = typeEl?.closest?.('.king-store-game-inline-form')
        || scoreEl?.closest?.('.king-store-game-inline-form');
    if (form) {
        _syncStoreGameForm(form);
        return;
    }
    if (!scoreEl) return;
    const isKaraoke = String(typeEl?.value || '') === 'karaoke';
    scoreEl.step = isKaraoke ? '0.001' : '1';
    scoreEl.min = isKaraoke ? '0.001' : '1';
    scoreEl.placeholder = isKaraoke ? '例: 90.568' : '例: 701';
}

function _resolveTroyEntryNation() {
    return String(
        _lastPageData?.nation
        || _lastPageData?.troyNation
        || window.myAvatarBaseInfo?.Nation
        || window.myAvatarBaseInfo?.nation
        || 'fire'
    ).trim().toLowerCase();
}

function _buildTroyEntryQrUrl() {
    const url = new URL(window.location.pathname || '/', window.location.origin);
    url.searchParams.set('action', 'troy-entry');
    url.searchParams.set('troyNation', _resolveTroyEntryNation());
    return url.toString();
}

function _setKingTroyEntryQrModalVisible(visible) {
    const modal = document.getElementById('kingTroyEntryQrModal');
    if (!modal) return;
    modal.style.display = visible ? 'flex' : 'none';
    modal.classList.toggle('active', !!visible);
    modal.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function _syncTroyEntryQrButton(isOpen) {
    const button = document.getElementById('btnKingTroyEntryQr');
    if (!button) return;
    button.style.display = isOpen ? '' : 'none';
    button.disabled = !isOpen;
}

function _showTroyEntryQr() {
    if (!_lastPageData?.troyOpen) {
        _setMessage('TROYがOPEN中の時だけ入店QRを表示できます。', true);
        _setKingTroyEntryQrModalVisible(false);
        return;
    }
    const canvas = document.getElementById('kingTroyEntryQrCanvas');
    const valueEl = document.getElementById('kingTroyEntryQrValue');
    const url = _buildTroyEntryQrUrl();
    if (valueEl) valueEl.value = url;
    if (!canvas || typeof window.QRious !== 'function') {
        _setMessage('QR生成ライブラリを読み込めませんでした。', true);
        return;
    }
    new window.QRious({
        element: canvas,
        value: url,
        size: 300,
        background: 'white',
        foreground: '#111827',
        level: 'H'
    });
    _setKingTroyEntryQrModalVisible(true);
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
    const troyStatusEl = document.getElementById('kingTroyStatus');

    if (currentEl) currentEl.innerText = (data.announcement && data.announcement.message) ? data.announcement.message : '(未設定)';
    if (metaEl) {
        const updatedAt = (data.announcement && data.announcement.updatedAt) ? _formatEpochMs(data.announcement.updatedAt) : '';
        const memberCount = (typeof data.memberCount === 'number') ? ` / メンバー数: ${data.memberCount}` : '';
        metaEl.innerText = updatedAt ? `更新: ${updatedAt}${memberCount}` : (memberCount ? memberCount.trim() : '');
    }
    if (inputEl) inputEl.value = (data.announcement && data.announcement.message) ? data.announcement.message : '';
    if (troyControlsEl) troyControlsEl.style.display = 'block';

    _renderTroyMembers(data.troyMembers);
    _renderMenuManagement(data);
    await _loadKingTroyCalendar(playFabId, data.nation);
    await _loadKingReservations(playFabId);
    const isOpen = !!data.troyOpen;
    if (troyStatusEl) {
        if (troyStatusEl) troyStatusEl.innerText = isOpen ? 'OPEN' : 'CLOSE';
        if (troyStatusEl) troyStatusEl.classList.toggle('is-open', isOpen);
    }
    _syncTroyEntryQrButton(isOpen);
    _ensureKingSectionActive(isOpen ? 'store' : 'ops');
    if (!isOpen) _setKingTroyEntryQrModalVisible(false);
    _renderNationWar(data.war);

    _wireHandlers(playFabId);
}

let _wired = false;
function _wireHandlers(playFabId) {
    if (_wired) return;
    _wired = true;

    const saveBtn = document.getElementById('btnKingSaveAnnouncement');
    const reloadBtn2 = document.getElementById('btnKingReload2');
    const inputEl = document.getElementById('kingAnnouncementInput');
    const troyOpenBtn = document.getElementById('btnKingTroyOpen');
    const troyCloseBtn = document.getElementById('btnKingTroyClose');
    const troyEntryQrBtn = document.getElementById('btnKingTroyEntryQr');
    const troyEntryQrModal = document.getElementById('kingTroyEntryQrModal');
    const troyEntryQrCloseBtn = document.getElementById('btnKingTroyEntryQrClose');
    const troyEntryQrCopyBtn = document.getElementById('btnKingTroyEntryQrCopy');
    const troyStatusEl = document.getElementById('kingTroyStatus');
    const warSectionEl = document.getElementById('kingWarSection');
    const warDeployWeaponEl = document.getElementById('kingWarDeployWeapon');
    const warStrikeWeaponEl = document.getElementById('kingWarStrikeWeapon');
    const warTargetNationEl = document.getElementById('kingWarTargetNation');
    const warTargetPartEl = document.getElementById('kingWarTargetPart');
    const warDeployBtn = document.getElementById('btnKingWarDeploy');
    const warStrikeBtn = document.getElementById('btnKingWarStrike');
    const calendarPanelEl = document.getElementById('kingSectionPanelCalendar');
    const troyEntryListEl = document.getElementById('kingTroyEntryList');
    const kingSectionTabsEl = document.getElementById('kingSectionTabs');

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

    if (reloadBtn2) {
        reloadBtn2.addEventListener('click', async () => {
            await loadKingPage(playFabId);
        });
    }

    if (kingSectionTabsEl) {
        kingSectionTabsEl.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const button = target?.closest?.('[data-king-section-tab]');
            if (!button) return;
            _setKingSectionActive(button.getAttribute('data-king-section-tab') || 'store');
        });
    }

    if (troyEntryListEl) {
        troyEntryListEl.addEventListener('click', async (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const storeGameSaveBtn = target ? target.closest('[data-store-game-save]') : null;
            if (storeGameSaveBtn) {
                const targetPlayFabId = String(storeGameSaveBtn.getAttribute('data-store-game-save') || '').trim();
                const form = storeGameSaveBtn.closest('.king-store-game-inline-form');
                const typeEl = form?.querySelector('[data-store-game-type]');
                const scoreEl = form?.querySelector('[data-store-game-score]');
                const opponentEl = form?.querySelector('[data-store-game-opponent]');
                const gameType = String(typeEl?.value || 'darts_countup');
                const isRating = _isStoreGameRatingType(gameType);
                const score = Number(scoreEl?.value) || 0;
                const opponentPlayFabId = String(opponentEl?.value || '').trim();
                if (!targetPlayFabId) {
                    _setMessage('採点対象が不正です。', true);
                    return;
                }
                if (isRating && !opponentPlayFabId) {
                    _setMessage('負けた相手を選択してください。', true);
                    opponentEl?.focus();
                    return;
                }
                if (!isRating && (!score || score <= 0)) {
                    _setMessage('点数を入力してください。', true);
                    scoreEl?.focus();
                    return;
                }
                const previous = storeGameSaveBtn.textContent;
                storeGameSaveBtn.disabled = true;
                storeGameSaveBtn.textContent = '保存中...';
                if (typeEl) typeEl.disabled = true;
                if (scoreEl) scoreEl.disabled = true;
                if (opponentEl) opponentEl.disabled = true;
                try {
                    const payload = isRating ? { opponentPlayFabId } : score;
                    const result = await kingUpdateStoreGameScore(playFabId, targetPlayFabId, gameType, payload, { isSilent: true, throwOnError: true });
                    const label = result?.label || _getStoreGameLabel(gameType);
                    const name = result?.displayName || String(storeGameSaveBtn.getAttribute('data-store-game-name') || '').trim() || targetPlayFabId;
                    if (isRating) {
                        const opponentName = result?.opponentDisplayName || opponentEl?.selectedOptions?.[0]?.textContent || opponentPlayFabId;
                        const previousRating = _formatStoreGameScore(result?.previousRating || 1000, gameType);
                        const rating = _formatStoreGameScore(result?.rating || result?.score || 0, gameType);
                        const opponentPreviousRating = _formatStoreGameScore(result?.opponentPreviousRating || 1000, gameType);
                        const opponentRating = _formatStoreGameScore(result?.opponentRating || 0, gameType);
                        _setMessage(`${label}: ${name} が ${opponentName} に勝利。レート ${previousRating}→${rating} / ${opponentName} ${opponentPreviousRating}→${opponentRating}`);
                    } else {
                        _setMessage(`${label}: ${name} の記録を ${_formatStoreGameScore(result?.score || score, gameType)}点で保存しました。`);
                        if (scoreEl) scoreEl.value = '';
                    }
                } catch (error) {
                    _setMessage(_extractErrorMessage(error, '店内ゲームの点数更新に失敗しました。'), true);
                } finally {
                    storeGameSaveBtn.disabled = false;
                    storeGameSaveBtn.textContent = previous;
                    if (typeEl) typeEl.disabled = false;
                    if (scoreEl) scoreEl.disabled = false;
                    if (opponentEl) opponentEl.disabled = false;
                    _syncStoreGameForm(form);
                }
                return;
            }

            const chipReturnBtn = target ? target.closest('[data-chip-return]') : null;
            if (chipReturnBtn) {
                const receiverPlayFabId = String(chipReturnBtn.getAttribute('data-chip-return') || '').trim();
                const receiverName = String(chipReturnBtn.getAttribute('data-chip-return-name') || '').trim() || receiverPlayFabId;
                const amountEl = receiverPlayFabId
                    ? troyEntryListEl.querySelector(`[data-chip-return-amount="${CSS.escape(receiverPlayFabId)}"]`)
                    : null;
                const amount = Math.floor(Number(amountEl?.value) || 0);
                if (!receiverPlayFabId) {
                    _setMessage('返却対象が不正です。', true);
                    return;
                }
                if (!amount || amount <= 0 || amount > 1000000) {
                    _setMessage('返却チップ総額は1G以上、100万Gまでで入力してください。', true);
                    amountEl?.focus();
                    return;
                }
                if (!confirm(`${receiverName} に ${amount.toLocaleString('ja-JP')}Gをチップ返却します。よろしいですか？`)) return;
                const previous = chipReturnBtn.textContent;
                chipReturnBtn.disabled = true;
                if (amountEl) amountEl.disabled = true;
                chipReturnBtn.textContent = '処理中...';
                try {
                    const requestId = createRequestId('king-troy-return-coin');
                    const result = await kingReturnTroyCoin(playFabId, receiverPlayFabId, amount, requestId, { isSilent: true, throwOnError: true });
                    const contributionAmount = Math.max(0, Math.floor(Number(result?.contributionAmount) || 0));
                    const contributionNote = contributionAmount > 0 ? ` / 経験値 +${contributionAmount.toLocaleString('ja-JP')}` : '';
                    const debtMessage = String(result?.contributionDebtMessage || '').trim();
                    const debtNote = debtMessage ? ` / ${debtMessage}` : '';
                    const contribution = result?.contribution || {};
                    const unlockNote = formatUnlockedFeatures(contribution.unlockedFeatures);
                    const levelNote = contribution.leveledUp
                        ? `\nLv.${contribution.previousLevel} → Lv.${contribution.level}${unlockNote ? `\n${unlockNote}` : ''}`
                        : '';
                    const successMessage = `${receiverName} に ${amount.toLocaleString('ja-JP')}Gをチップ返却しました。${contributionNote}${debtNote}${levelNote}`;
                    if (amountEl) amountEl.value = '0';
                    await loadKingPage(playFabId);
                    _setMessage(successMessage);
                } catch (error) {
                    _setMessage(_extractErrorMessage(error, 'チップ返却に失敗しました。'), true);
                    chipReturnBtn.disabled = false;
                    if (amountEl) amountEl.disabled = false;
                    chipReturnBtn.textContent = previous;
                }
                return;
            }

            const button = target ? target.closest('[data-direct-grant]') : null;
            if (!button) return;
            const receiverPlayFabId = String(button.getAttribute('data-direct-grant') || '').trim();
            const input = receiverPlayFabId
                ? troyEntryListEl.querySelector(`[data-direct-grant-amount="${CSS.escape(receiverPlayFabId)}"]`)
                : null;
            const amount = Math.floor(Number(input?.value) || 0);
            if (!receiverPlayFabId) {
                _setMessage('付与対象が不正です。', true);
                return;
            }
            if (amount <= 0 || amount % 100 !== 0) {
                _setMessage('付与額は100刻みで入力してください。', true);
                return;
            }
            if (!confirm(`${amount.toLocaleString('ja-JP')}Gを財源なしで付与します。よろしいですか？`)) return;

            const previous = button.textContent;
            button.setAttribute('disabled', 'disabled');
            if (input) input.setAttribute('disabled', 'disabled');
            button.textContent = '処理中...';
            try {
                const requestId = createRequestId('king-direct-grant');
                const result = await directGrantPs(playFabId, receiverPlayFabId, amount, requestId, { isSilent: true, throwOnError: true });
                if (!result?.success) {
                    throw new Error('G付与の完了を確認できませんでした。');
                }
                const contribution = result?.contribution || {};
                const unlockNote = formatUnlockedFeatures(contribution.unlockedFeatures);
                const levelNote = contribution.leveledUp
                    ? `\nLv.${contribution.previousLevel} → Lv.${contribution.level}${unlockNote ? `\n${unlockNote}` : ''}`
                    : (contribution.level ? ` / Lv.${contribution.level}` : '');
                _setMessage(`${Math.max(0, Number(result?.grantAmount) || amount).toLocaleString('ja-JP')}Gを財源なしで付与しました。経験値も加算済みです${levelNote}。`);
                await loadKingPage(playFabId);
            } catch (error) {
                _setMessage(_extractErrorMessage(error, 'G付与に失敗しました。'), true);
                button.removeAttribute('disabled');
                if (input) input.removeAttribute('disabled');
                button.textContent = previous;
            }
        });
        troyEntryListEl.addEventListener('change', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const typeEl = target?.matches?.('[data-store-game-type]') ? target : null;
            if (!typeEl) return;
            const form = typeEl.closest('.king-store-game-inline-form');
            _syncStoreGameForm(form);
        });
    }

    if (troyOpenBtn) {
        troyOpenBtn.addEventListener('click', async () => {
            try {
                const result = await setTroyOpen(playFabId, true, { throwOnError: true });
                if (result) {
                    if (troyStatusEl) troyStatusEl.innerText = 'OPEN';
                    if (troyStatusEl) troyStatusEl.classList.add('is-open');
                    _syncTroyEntryQrButton(true);
                    await loadKingPage(playFabId);
                    _setMessage('TROYをOPENにしました。');
                }
            } catch (error) {
                _setMessage(_extractErrorMessage(error, 'OPENに失敗しました。'), true);
            }
        });
    }

    if (troyCloseBtn) {
        troyCloseBtn.addEventListener('click', async () => {
            try {
                const result = await setTroyOpen(playFabId, false, { throwOnError: true });
                if (result) {
                    if (troyStatusEl) troyStatusEl.innerText = 'CLOSE';
                    if (troyStatusEl) troyStatusEl.classList.remove('is-open');
                    _syncTroyEntryQrButton(false);
                    _setKingTroyEntryQrModalVisible(false);
                    await loadKingPage(playFabId);
                    _setMessage('TROYをCLOSEにしました。');
                }
            } catch (error) {
                _setMessage(_extractErrorMessage(error, 'CLOSEに失敗しました。'), true);
            }
        });
    }

    if (troyEntryQrBtn) {
        troyEntryQrBtn.addEventListener('click', () => {
            _showTroyEntryQr();
        });
    }

    if (troyEntryQrCloseBtn) {
        troyEntryQrCloseBtn.addEventListener('click', () => {
            _setKingTroyEntryQrModalVisible(false);
        });
    }

    if (troyEntryQrModal) {
        troyEntryQrModal.addEventListener('click', (event) => {
            if (event.target === troyEntryQrModal) {
                _setKingTroyEntryQrModalVisible(false);
            }
        });
    }

    if (troyEntryQrCopyBtn) {
        troyEntryQrCopyBtn.addEventListener('click', async () => {
            const url = String(document.getElementById('kingTroyEntryQrValue')?.value || _buildTroyEntryQrUrl()).trim();
            try {
                await navigator.clipboard?.writeText(url);
                _setMessage('入店QRのURLをコピーしました。');
            } catch {
                _setMessage('URLをコピーできませんでした。画面のURL欄を使用してください。', true);
            }
        });
    }

    if (calendarPanelEl) {
        calendarPanelEl.addEventListener('click', async (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return;

            const reservationReviewBtn = target.closest('[data-reservation-review]');
            if (reservationReviewBtn) {
                const reservationId = String(reservationReviewBtn.getAttribute('data-reservation-review') || '').trim();
                const approve = String(reservationReviewBtn.getAttribute('data-reservation-approve') || 'true') !== 'false';
                if (!reservationId) return;
                const previous = reservationReviewBtn.textContent;
                reservationReviewBtn.setAttribute('disabled', 'disabled');
                reservationReviewBtn.textContent = approve ? '承認中...' : '却下中...';
                try {
                    await reviewReservation(playFabId, reservationId, approve, { isSilent: true });
                    await _loadKingReservations(playFabId);
                    _setMessage(approve ? '予約を承認しました。' : '予約を却下しました。');
                } catch (error) {
                    _setMessage(_extractErrorMessage(error, approve ? '予約の承認に失敗しました。' : '予約の却下に失敗しました。'), true);
                    reservationReviewBtn.removeAttribute('disabled');
                    reservationReviewBtn.textContent = previous;
                }
                return;
            }

            const editBtn = target.closest('[data-calendar-edit]');
            if (editBtn) {
                const id = String(editBtn.getAttribute('data-calendar-edit') || '');
                const entry = (_lastPageData?.troyCalendar || []).find((row) => String(row.id) === id);
                if (!entry) return;
                const idEl = document.getElementById('kingTroyCalendarId');
                const dateEl = document.getElementById('kingTroyCalendarDate');
                const openEl = document.getElementById('kingTroyCalendarOpenTime');
                const closeEl = document.getElementById('kingTroyCalendarCloseTime');
                const statusEl = document.getElementById('kingTroyCalendarStatus');
                const titleEl = document.getElementById('kingTroyCalendarTitle');
                const noteEl = document.getElementById('kingTroyCalendarNote');
                if (idEl) idEl.value = entry.id || '';
                if (dateEl) dateEl.value = entry.date || '';
                if (openEl) openEl.value = entry.openTime || '21:00';
                if (closeEl) closeEl.value = entry.closeTime || '23:59';
                if (statusEl) statusEl.value = entry.status || 'open';
                if (titleEl) titleEl.value = entry.title || '';
                if (noteEl) noteEl.value = entry.note || '';
                return;
            }

            const deleteBtn = target.closest('[data-calendar-delete]');
            if (deleteBtn) {
                const id = String(deleteBtn.getAttribute('data-calendar-delete') || '');
                if (!id || !confirm('この営業予定を削除しますか？')) return;
                const previous = deleteBtn.textContent;
                deleteBtn.setAttribute('disabled', 'disabled');
                deleteBtn.textContent = '削除中...';
                try {
                    await deleteTroyCalendarEntry(playFabId, id, { isSilent: true });
                    await loadKingPage(playFabId);
                    _setMessage('営業予定を削除しました。');
                } catch (error) {
                    _setMessage(_extractErrorMessage(error, '営業予定の削除に失敗しました。'), true);
                    deleteBtn.removeAttribute('disabled');
                    deleteBtn.textContent = previous;
                }
                return;
            }

            if (target.closest('#btnKingTroyCalendarClear')) {
                _clearCalendarForm();
                return;
            }

            const saveCalendarBtn = target.closest('#btnKingTroyCalendarSave');
            if (saveCalendarBtn) {
                const payload = {
                    calendarId: String(document.getElementById('kingTroyCalendarId')?.value || '').trim(),
                    date: String(document.getElementById('kingTroyCalendarDate')?.value || '').trim(),
                    openTime: String(document.getElementById('kingTroyCalendarOpenTime')?.value || '21:00').trim(),
                    closeTime: String(document.getElementById('kingTroyCalendarCloseTime')?.value || '23:59').trim(),
                    status: String(document.getElementById('kingTroyCalendarStatus')?.value || 'open').trim(),
                    title: String(document.getElementById('kingTroyCalendarTitle')?.value || '').trim(),
                    note: String(document.getElementById('kingTroyCalendarNote')?.value || '').trim()
                };
                if (!payload.date) {
                    _setMessage('営業日を入力してください。', true);
                    return;
                }
                const previous = saveCalendarBtn.textContent;
                saveCalendarBtn.setAttribute('disabled', 'disabled');
                saveCalendarBtn.textContent = '保存中...';
                try {
                    await saveTroyCalendarEntry(playFabId, payload, { isSilent: true });
                    _clearCalendarForm();
                    await loadKingPage(playFabId);
                    _setMessage('営業予定を保存しました。');
                } catch (error) {
                    _setMessage(_extractErrorMessage(error, '営業予定の保存に失敗しました。'), true);
                    saveCalendarBtn.removeAttribute('disabled');
                    saveCalendarBtn.textContent = previous;
                }
            }
        });
    }

    const menuCustomListEl = document.getElementById('kingMenuCustomList');
    if (menuCustomListEl) {
        menuCustomListEl.addEventListener('click', async (event) => {
            const btn = event.target instanceof Element ? event.target.closest('[data-custom-remove]') : null;
            if (!btn) return;
            const id = String(btn.getAttribute('data-custom-remove') || '').trim();
            if (!id) return;
            btn.disabled = true;
            btn.textContent = '処理中...';
            try {
                await kingUpdateMenu(playFabId, { action: 'removeCustom', id }, { isSilent: true });
                await loadKingPage(playFabId);
            } catch (error) {
                _setMessage(_extractErrorMessage(error, 'スタッフ用オーダーメニューの削除に失敗しました。'), true);
                btn.disabled = false;
                btn.textContent = '削除';
            }
        });
    }

    const addCustomBtn = document.getElementById('btnKingMenuAddCustom');
    if (addCustomBtn) {
        addCustomBtn.addEventListener('click', async () => {
            const categoryEl = document.getElementById('kingMenuCustomCategory');
            const nameEl = document.getElementById('kingMenuCustomName');
            const contentEl = document.getElementById('kingMenuCustomContent');
            const priceEl = document.getElementById('kingMenuCustomPrice');
            const emojiEl = document.getElementById('kingMenuCustomEmoji');
            const menuId = String(categoryEl?.value || '').trim();
            const name = String(nameEl?.value || '').trim();
            const content = String(contentEl?.value || '').trim();
            const price = Math.max(0, Math.floor(Number(priceEl?.value) || 0));
            const emoji = String(emojiEl?.value || '').trim() || '🍽';
            if (!menuId) { _setMessage('カテゴリを選択してください。', true); return; }
            if (!name) { _setMessage('商品名を入力してください。', true); return; }
            if (!price) { _setMessage('金額を入力してください。', true); return; }
            const previous = addCustomBtn.textContent;
            addCustomBtn.disabled = true;
            addCustomBtn.textContent = '追加中...';
            try {
                await kingUpdateMenu(playFabId, { action: 'addCustom', menuId, name, content, price, emoji }, { isSilent: true });
                if (nameEl) nameEl.value = '';
                if (contentEl) contentEl.value = '';
                if (priceEl) priceEl.value = '';
                if (emojiEl) emojiEl.value = '';
                await loadKingPage(playFabId);
                _setMessage('スタッフ用オーダーメニューを追加しました。');
            } catch (error) {
                _setMessage(_extractErrorMessage(error, 'スタッフ用オーダーメニューの追加に失敗しました。'), true);
            } finally {
                addCustomBtn.disabled = false;
                addCustomBtn.textContent = previous;
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
