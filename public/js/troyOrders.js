import { callApiWithLoader, createRequestId } from 'api';

const FALLBACK_REFRESH_MS = 10000;
const SORT_STORAGE_KEY = 'troy-orders-sort-mode';

let refreshTimer = null;
let sseSource = null;
let sseFallbackTimer = null;
let lastData = null;
let busy = false;
let seenOrderIds = new Set();
let hasRenderedOnce = false;
let pendingSettleCard = null;

function $(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatYen(value) {
    return `¥${Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('ja-JP')}`;
}

function formatTime(ms) {
    const value = Number(ms) || 0;
    if (!value) return '';
    return new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function getRequestedNationPayload() {
    const params = new URLSearchParams(window.location.search);
    const nation = String(params.get('troyNation') || params.get('nation') || '').trim().toLowerCase();
    return ['fire', 'water', 'wind', 'earth'].includes(nation) ? { troyNation: nation } : {};
}

function setMessage(text, isError = false) {
    const el = $('troyOrdersMessage');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
    el.hidden = !text;
}

function hasNationParam() {
    const params = new URLSearchParams(window.location.search);
    const nation = String(params.get('troyNation') || params.get('nation') || '').trim().toLowerCase();
    return ['fire', 'water', 'wind', 'earth'].includes(nation);
}

function setSummary(data = {}) {
    const open = !!data.troyOpen;
    $('troyOrdersOpenState').textContent = open ? 'OPEN' : 'CLOSE';
    $('troyOrdersOpenState').className = open ? 'is-open' : 'is-close';
    const entries = Array.isArray(data.troyPendingCheckouts) ? data.troyPendingCheckouts : [];
    $('troyOrdersPendingCount').textContent = `${entries.length}件`;
    $('troyOrdersTodaySales').textContent = formatYen(data.troyTodaySales?.total || 0);
    $('troyOrdersUpdatedAt').textContent = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

    const openBtn = $('troyOrdersOpenBtn');
    const closeBtn = $('troyOrdersCloseBtn');
    const nationSelect = $('troyOrdersNationSelect');
    if (openBtn) openBtn.hidden = open;
    if (closeBtn) closeBtn.hidden = !open;
    if (nationSelect) nationSelect.hidden = open || hasNationParam();
}

async function setTroyOpen(nextOpen) {
    if (busy) return;
    if (!nextOpen) {
        const entries = Array.isArray(lastData?.troyPendingCheckouts) ? lastData.troyPendingCheckouts : [];
        if (entries.length > 0 && !confirm(`お会計待ちが ${entries.length}件 います。TROYをCLOSEしますか？`)) return;
    }
    const nationPayload = getRequestedNationPayload();
    if (nextOpen && !nationPayload.troyNation) {
        const selected = $('troyOrdersNationSelect')?.value || '';
        if (selected) nationPayload.troyNation = selected;
    }
    busy = true;
    const btn = nextOpen ? $('troyOrdersOpenBtn') : $('troyOrdersCloseBtn');
    const prev = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = '処理中...'; }
    try {
        await callApiWithLoader('/api/troy-orders/set-open', {
            ...nationPayload,
            isOpen: nextOpen
        }, { isSilent: true, throwOnError: true });
        setMessage(nextOpen ? 'TROYをOPENにしました。' : 'TROYをCLOSEにしました。');
        await refreshOrders({ silent: true });
    } catch (error) {
        setMessage(`営業状態を変更できませんでした: ${error?.message || error}`, true);
    } finally {
        busy = false;
        if (btn) { btn.disabled = false; btn.textContent = prev; }
    }
}

function getSortMode() {
    const selectValue = $('troyOrdersSort')?.value || '';
    if (['oldest', 'newest', 'name'].includes(selectValue)) return selectValue;
    return getStoredSortMode();
}

function getStoredSortMode() {
    try {
        const stored = localStorage.getItem(SORT_STORAGE_KEY) || '';
        if (['oldest', 'newest', 'name'].includes(stored)) return stored;
    } catch (_) {
    }
    return 'oldest';
}

function sortEntries(entries = []) {
    const rows = [...entries];
    const mode = getSortMode();
    if (mode === 'newest') {
        rows.sort((a, b) => (Number(b.lastOrderedAtMs || b.createdAtMs) || 0) - (Number(a.lastOrderedAtMs || a.createdAtMs) || 0));
    } else if (mode === 'name') {
        rows.sort((a, b) => String(a.displayName || a.playFabId || '').localeCompare(String(b.displayName || b.playFabId || ''), 'ja'));
    } else {
        rows.sort((a, b) => (Number(a.createdAtMs || a.lastOrderedAtMs) || 0) - (Number(b.createdAtMs || b.lastOrderedAtMs) || 0));
    }
    return rows;
}

function collectOrderIds(entries = []) {
    const ids = new Set();
    entries.forEach((entry) => {
        (Array.isArray(entry.items) ? entry.items : []).forEach((item) => {
            const id = String(item.orderId || '').trim();
            if (id) ids.add(id);
        });
    });
    return ids;
}

function flashForNewOrders(entries = []) {
    const nextIds = collectOrderIds(entries);
    if (hasRenderedOnce) {
        const hasNew = [...nextIds].some((id) => !seenOrderIds.has(id));
        if (hasNew) {
            document.body.classList.remove('is-new-order-flash');
            void document.body.offsetWidth;
            document.body.classList.add('is-new-order-flash');
            setTimeout(() => document.body.classList.remove('is-new-order-flash'), 1800);
        }
    }
    seenOrderIds = nextIds;
    hasRenderedOnce = true;
}

function updateServeSummary(entries = []) {
    let pending = 0;
    let served = 0;
    entries.forEach((entry) => {
        (Array.isArray(entry.items) ? entry.items : []).forEach((item) => {
            if (String(item.status || '').toLowerCase() === 'served' || Number(item.servedAtMs) > 0) served += 1;
            else pending += 1;
        });
    });
    const el = $('troyOrdersServeSummary');
    if (el) el.textContent = `未提供 ${pending}件 / 提供済み ${served}件`;
}

function renderCheckoutCard(entry) {
    const total = Math.max(0, Number(entry.total) || 0);
    const totalItems = Math.max(0, Number(entry.totalItems) || 0);
    const grantTotal = Math.max(0, Number(entry.grantTotal) || 0);
    const status = String(entry.status || 'open').trim().toLowerCase();
    const orderedAt = formatTime(entry.lastOrderedAtMs || entry.createdAtMs);
    const items = Array.isArray(entry.items) ? entry.items : [];
    const pendingServeCount = items.filter((item) => !(String(item.status || '').toLowerCase() === 'served' || Number(item.servedAtMs) > 0)).length;
    const itemRows = items.map((item) => {
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const orderId = String(item.orderId || '').trim();
        const served = String(item.status || '').toLowerCase() === 'served' || Number(item.servedAtMs) > 0;
        return `
            <div class="troy-orders-item-row${served ? ' is-served' : ''}">
                <span>${escapeHtml(item.name || '注文')}</span>
                <em>${quantity > 1 ? `x${quantity}` : ''}</em>
                <strong>${formatYen(item.lineTotal || ((Number(item.price) || 0) * quantity))}</strong>
                ${orderId ? `<button type="button" data-toggle-served data-order-id="${escapeHtml(orderId)}" data-served="${served ? 'true' : 'false'}">${served ? '提供済み' : '未提供'}</button>` : '<i></i>'}
            </div>
        `;
    }).join('');
    const meta = [
        status === 'pending' ? '確認待ち' : '未会計',
        orderedAt,
        totalItems ? `${totalItems}点` : '',
        grantTotal ? `付与済み ${grantTotal.toLocaleString('ja-JP')}G` : ''
    ].filter(Boolean).join(' / ');

    return `
        <article class="troy-orders-card" data-receiver-id="${escapeHtml(entry.playFabId)}" data-amount="${total}">
            <div class="troy-orders-card-head">
                <div>
                    <h2>${escapeHtml(entry.displayName || entry.playFabId || 'Player')}</h2>
                    <p>${escapeHtml(meta)}</p>
                </div>
                <div class="troy-orders-total-wrap">
                    <div class="troy-orders-total">${formatYen(total)}</div>
                    <span class="${pendingServeCount > 0 ? 'is-pending-serve' : 'is-served-all'}">${pendingServeCount > 0 ? `未提供 ${pendingServeCount}` : '全て提供済み'}</span>
                </div>
            </div>
            <div class="troy-orders-items">${itemRows || '<div class="troy-orders-item-row"><span>注文内容なし</span></div>'}</div>
            <div class="troy-orders-settle">
                <label>
                    <span>預かりコイン</span>
                    <input type="number" min="0" step="1" inputmode="numeric" value="0" data-coin-deposit>
                    <b>G</b>
                </label>
                <button type="button" data-settle>お会計する</button>
            </div>
        </article>
    `;
}

function render(data = {}) {
    lastData = data;
    setSummary(data);
    const list = $('troyOrdersList');
    const empty = $('troyOrdersEmpty');
    const entries = Array.isArray(data.troyPendingCheckouts) ? data.troyPendingCheckouts : [];
    flashForNewOrders(entries);
    updateServeSummary(entries);
    if (!entries.length) {
        list.innerHTML = '';
        empty.hidden = false;
        return;
    }
    empty.hidden = true;
    list.innerHTML = sortEntries(entries).map(renderCheckoutCard).join('');
}

async function refreshOrders({ silent = true } = {}) {
    if (busy) return;
    try {
        const data = await callApiWithLoader('/api/troy-orders/list', getRequestedNationPayload(), { isSilent: silent, throwOnError: true });
        setMessage('');
        render(data || {});
    } catch (error) {
        console.warn('[troy-orders] refresh failed:', error);
        setMessage('注文リストを取得できませんでした。通信状態を確認してください。', true);
    }
}

async function settleFromCard(card) {
    if (!card || busy) return;
    const receiverId = String(card.dataset.receiverId || '').trim();
    const expectedTotal = Math.max(0, Math.floor(Number(card.dataset.amount) || 0));
    const coinInput = card.querySelector('[data-coin-deposit]');
    const coinDepositAmount = Math.max(0, Math.floor(Number(coinInput?.value || 0) || 0));
    if (!receiverId || expectedTotal <= 0) return;
    const confirmCheck = $('troyOrdersConfirmCheck');
    if (confirmCheck && !confirmCheck.checked) {
        openConfirmModal(card);
        return;
    }

    busy = true;
    card.classList.add('is-busy');
    try {
        await callApiWithLoader('/api/troy-orders/settle', {
            ...getRequestedNationPayload(),
            receiverPlayFabId: receiverId,
            expectedTotal,
            requestId: createRequestId('troy-orders-settle'),
            coinDepositAmount
        }, { isSilent: true, throwOnError: true });
        setMessage('お会計しました。');
        await refreshOrders({ silent: true });
    } catch (error) {
        console.warn('[troy-orders] settle failed:', error);
        setMessage(`お会計できませんでした: ${error?.message || error}`, true);
    } finally {
        busy = false;
        card.classList.remove('is-busy');
    }
}

async function toggleServedFromButton(button) {
    if (!button || busy) return;
    const card = button.closest('.troy-orders-card');
    const receiverId = String(card?.dataset.receiverId || '').trim();
    const orderId = String(button.dataset.orderId || '').trim();
    const nextServed = button.dataset.served !== 'true';
    if (!receiverId || !orderId) return;
    busy = true;
    button.disabled = true;
    try {
        await callApiWithLoader('/api/troy-orders/item-status', {
            ...getRequestedNationPayload(),
            receiverPlayFabId: receiverId,
            orderId,
            served: nextServed
        }, { isSilent: true, throwOnError: true });
        await refreshOrders({ silent: true });
    } catch (error) {
        console.warn('[troy-orders] status update failed:', error);
        setMessage(`提供状態を更新できませんでした: ${error?.message || error}`, true);
    } finally {
        busy = false;
        button.disabled = false;
    }
}

function openConfirmModal(card) {
    pendingSettleCard = card;
    const modal = $('troyOrdersConfirmModal');
    if (!modal || !card) return;
    const name = card.querySelector('h2')?.textContent || card.dataset.receiverId || '-';
    const total = Math.max(0, Math.floor(Number(card.dataset.amount) || 0));
    const itemsHtml = [...card.querySelectorAll('.troy-orders-item-row')].map((row) => {
        const nameEl = row.querySelector('span');
        const priceEl = row.querySelector('strong');
        return `<div><span>${escapeHtml(nameEl?.textContent || '')}</span><strong>${escapeHtml(priceEl?.textContent || '')}</strong></div>`;
    }).join('');
    $('troyOrdersConfirmName').textContent = name;
    $('troyOrdersConfirmTotal').textContent = formatYen(total);
    $('troyOrdersConfirmItems').innerHTML = itemsHtml;
    const check = $('troyOrdersConfirmCheck');
    const submit = $('troyOrdersConfirmSubmit');
    if (check) check.checked = false;
    if (submit) submit.disabled = true;
    modal.hidden = false;
}

function closeConfirmModal() {
    pendingSettleCard = null;
    const modal = $('troyOrdersConfirmModal');
    if (modal) modal.hidden = true;
}

function buildStreamUrl() {
    const params = getRequestedNationPayload();
    const url = new URL('/api/troy-orders/stream', window.location.origin);
    if (params.troyNation) url.searchParams.set('troyNation', params.troyNation);
    return url.toString();
}

function stopSSEStream() {
    if (sseFallbackTimer) { clearTimeout(sseFallbackTimer); sseFallbackTimer = null; }
    if (sseSource) { sseSource.close(); sseSource = null; }
}

function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
        if (document.visibilityState === 'visible') {
            void refreshOrders({ silent: true });
        }
    }, FALLBACK_REFRESH_MS);
}

function startSSEStream() {
    stopSSEStream();
    stopAutoRefresh();
    if (typeof EventSource === 'undefined') {
        startAutoRefresh();
        return;
    }
    sseSource = new EventSource(buildStreamUrl());

    sseFallbackTimer = setTimeout(() => {
        if (sseSource && sseSource.readyState !== EventSource.OPEN) {
            console.warn('[troy-orders-sse] connection timeout, falling back to polling');
            stopSSEStream();
            startAutoRefresh();
        }
    }, 10000);

    sseSource.onmessage = (event) => {
        if (sseFallbackTimer) { clearTimeout(sseFallbackTimer); sseFallbackTimer = null; }
        try {
            const data = JSON.parse(event.data);
            setMessage('');
            render(data);
        } catch (e) {
            console.warn('[troy-orders-sse] parse error:', e);
        }
    };

    sseSource.onerror = () => {
        if (sseSource?.readyState === EventSource.CLOSED) {
            sseSource = null;
            startAutoRefresh();
        }
    };
}

function stopAutoRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

document.addEventListener('DOMContentLoaded', async () => {
    const sortEl = $('troyOrdersSort');
    if (sortEl) {
        sortEl.value = getStoredSortMode();
        sortEl.addEventListener('change', () => {
            try {
                localStorage.setItem(SORT_STORAGE_KEY, sortEl.value);
            } catch (_) {
            }
            render(lastData || {});
        });
    }
    $('troyOrdersRefresh')?.addEventListener('click', () => refreshOrders({ silent: false }));
    $('troyOrdersOpenBtn')?.addEventListener('click', () => setTroyOpen(true));
    $('troyOrdersCloseBtn')?.addEventListener('click', () => setTroyOpen(false));
    $('troyOrdersList')?.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const servedButton = target?.closest('[data-toggle-served]');
        if (servedButton) {
            void toggleServedFromButton(servedButton);
            return;
        }
        const settleButton = target?.closest('[data-settle]');
        if (!settleButton) return;
        openConfirmModal(settleButton.closest('.troy-orders-card'));
    });
    $('troyOrdersConfirmCancel')?.addEventListener('click', closeConfirmModal);
    $('troyOrdersConfirmCheck')?.addEventListener('change', () => {
        const submit = $('troyOrdersConfirmSubmit');
        if (submit) submit.disabled = !$('troyOrdersConfirmCheck')?.checked;
    });
    $('troyOrdersConfirmSubmit')?.addEventListener('click', async () => {
        const card = pendingSettleCard;
        closeConfirmModal();
        await settleFromCard(card);
    });

    try {
        $('troyOrdersAuthName').textContent = 'ログイン不要';
        await refreshOrders({ silent: false });
        startSSEStream();
    } catch (error) {
        console.error('[troy-orders] init failed:', error);
        setMessage(`初期化できませんでした: ${error?.message || error}`, true);
    }
});
