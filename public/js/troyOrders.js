import { callApiWithLoader, createRequestId } from 'api';

const STAFF_MENU = [
    { category: 'アルコール', items: [
        { name: 'ラム', price: 500 },
        { name: 'ウォッカ', price: 500 },
        { name: 'テキーラ', price: 500 },
        { name: 'ジン', price: 500 },
        { name: 'リキュール', price: 500 },
        { name: '焼酎（キンミヤ）', price: 500 },
        { name: 'ビール（ハートランド）', price: 600 },
        { name: 'グラスワイン', price: 500 },
        { name: 'ワインボトル', price: 3000 },
    ]},
    { category: 'ノンアル', items: [
        { name: 'コーラ', price: 400 },
        { name: 'ジンジャーエール', price: 400 },
        { name: 'オレンジジュース', price: 400 },
        { name: 'ウーロン茶', price: 400 },
        { name: 'ノンアルビール（ハイネケン）', price: 500 },
    ]},
    { category: '料理', items: [
        { name: 'ポテチ', price: 400 },
        { name: 'チョコ', price: 500 },
        { name: 'ミックスナッツ', price: 500 },
        { name: 'フライドポテト', price: 500 },
        { name: 'チキンナゲット', price: 500 },
        { name: 'ピザトースト', price: 500 },
        { name: 'フランクフルト', price: 500 },
        { name: 'ワッフル', price: 500 },
        { name: 'チュロス', price: 500 },
        { name: 'カップラーメン', price: 500 },
    ]},
    { category: 'ボトル', items: [
        { name: 'キンミヤ（720ml）', price: 2800 },
        { name: '水割りセット', price: 500 },
        { name: 'ソーダ / お茶割り用', price: 600 },
        { name: 'カットレモン', price: 100 },
    ]},
];

const FALLBACK_REFRESH_MS = 10000;
const SORT_STORAGE_KEY = 'troy-orders-sort-mode';
const SOUND_STORAGE_KEY = 'troy-orders-sound-enabled';
const ORDER_SOUND_SOURCES = {
    default: '/audio/order-count-1-missile.mp3',
    drink: '/audio/order-count-2-cannon.mp3',
    food: '/audio/order-count-3-sniper.mp3',
    premium: '/audio/order-count-4-rocket-launcher.mp3',
    entry: '/audio/order-count-5-plus-battlefield.mp3'
};
const ORDER_SOUND_BY_COUNT_TIER = ['default', 'drink', 'food', 'premium', 'entry'];

let refreshTimer = null;
let sseSource = null;
let sseFallbackTimer = null;
let lastData = null;
let busy = false;
let seenOrderIds = new Set();
let hasRenderedOnce = false;
let pendingSettleCard = null;
let soundEnabled = false;
let selectedCustomerId = null;

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
    if (openBtn) openBtn.hidden = open;
    if (closeBtn) closeBtn.hidden = !open;
}

async function setTroyOpen(nextOpen) {
    if (busy) return;
    if (!nextOpen) {
        const entries = Array.isArray(lastData?.troyPendingCheckouts) ? lastData.troyPendingCheckouts : [];
        if (entries.length > 0 && !confirm(`お会計待ちが ${entries.length}件 います。TROYをCLOSEしますか？`)) return;
    }
    const nationPayload = getRequestedNationPayload();
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

function getStoredSoundEnabled() {
    try {
        return localStorage.getItem(SOUND_STORAGE_KEY) === 'true';
    } catch (_) {
        return false;
    }
}

function setStoredSoundEnabled(enabled) {
    try {
        localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch (_) {
    }
}

function updateSoundToggle() {
    const btn = $('troyOrdersSoundToggle');
    if (!btn) return;
    btn.textContent = soundEnabled ? 'Sound ON' : 'Sound OFF';
    btn.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
    btn.classList.toggle('is-enabled', soundEnabled);
}

function getOrderSoundKeyByCount(orderCountToday = 0) {
    const count = Math.max(1, Math.floor(Number(orderCountToday) || 1));
    if (count >= 5) return ORDER_SOUND_BY_COUNT_TIER[4];
    return ORDER_SOUND_BY_COUNT_TIER[count - 1] || 'default';
}

function getOrderSoundKey(item = {}) {
    const name = String(item.name || '').trim();
    const orderId = String(item.orderId || '').trim();
    const orderCountToday = Math.max(0, Math.floor(Number(item.orderCountToday) || 0));
    if (orderCountToday > 0) return getOrderSoundKeyByCount(orderCountToday);
    const price = Math.max(0, Number(item.lineTotal) || (Number(item.price) || 0) * Math.max(1, Number(item.quantity) || 1));
    if (orderId.startsWith('troy-entry:') || /入店|チャージ/.test(name)) return 'entry';
    if (price >= 2800 || /ボトル|キンミヤ|ゴールド購入|5000G|3000G|2000G/.test(name)) return 'premium';
    if (/ポテ|チョコ|ナッツ|フライ|ナゲット|ピザ|フランク|ワッフル|チュロス|ラーメン/.test(name)) return 'food';
    if (/ラム|ウォッカ|テキーラ|ジン|リキュール|焼酎|ビール|ワイン|コーラ|ジンジャー|オレンジ|ウーロン|ノンアル|水割り|ソーダ|お茶|レモン|トニック/.test(name)) return 'drink';
    return 'default';
}

function pickOrderSoundKey(items = []) {
    const ranked = items
        .map(getOrderSoundKey)
        .map((key) => ORDER_SOUND_BY_COUNT_TIER.indexOf(key))
        .filter((index) => index >= 0);
    if (ranked.length > 0) {
        return ORDER_SOUND_BY_COUNT_TIER[Math.max(...ranked)] || 'default';
    }
    return 'default';
}

function playOrderSound(key = 'default') {
    if (!soundEnabled || typeof Audio === 'undefined') return;
    const src = ORDER_SOUND_SOURCES[key] || ORDER_SOUND_SOURCES.default;
    try {
        const audio = new Audio(src);
        audio.volume = 0.9;
        const result = audio.play();
        if (result?.catch) result.catch((error) => console.warn('[troy-orders-sound] play blocked:', error));
    } catch (error) {
        console.warn('[troy-orders-sound] play failed:', error);
    }
}

function collectOrderItems(entries = []) {
    const rows = [];
    entries.forEach((entry) => {
        (Array.isArray(entry.items) ? entry.items : []).forEach((item) => {
            const rawId = String(item.orderId || '').trim();
            const id = rawId || `${entry.playFabId || ''}:${item.name || ''}:${item.orderedAtMs || ''}:${item.lineTotal || ''}`;
            if (id) rows.push({ id, item });
        });
    });
    return rows;
}

function flashForNewOrders(entries = []) {
    const nextItems = collectOrderItems(entries);
    const nextIds = new Set(nextItems.map((row) => row.id));
    if (hasRenderedOnce) {
        const newItems = nextItems.filter((row) => !seenOrderIds.has(row.id)).map((row) => row.item);
        if (newItems.length > 0) {
            document.body.classList.remove('is-new-order-flash');
            void document.body.offsetWidth;
            document.body.classList.add('is-new-order-flash');
            setTimeout(() => document.body.classList.remove('is-new-order-flash'), 1800);
            playOrderSound(pickOrderSoundKey(newItems));
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

function buildPosCategoryHtml() {
    return STAFF_MENU.map((cat) => {
        const btns = cat.items.map((item) => `
            <button type="button" class="troy-orders-pos-btn"
                data-add-item
                data-item-name="${escapeHtml(item.name)}"
                data-item-price="${item.price}">
                ${escapeHtml(item.name)}<span>${formatYen(item.price)}</span>
            </button>`).join('');
        return `
            <details class="troy-orders-pos-category">
                <summary>${escapeHtml(cat.category)}</summary>
                <div class="troy-orders-pos-items">${btns}</div>
            </details>`;
    }).join('');
}

function rebuildPosMenu() {
    const el = $('troyOrdersPosMenu');
    if (!el) return;
    if (!selectedCustomerId) {
        el.hidden = true;
        el.innerHTML = '';
        return;
    }
    const entries = Array.isArray(lastData?.troyPendingCheckouts) ? lastData.troyPendingCheckouts : [];
    const selected = entries.find((e) => e.playFabId === selectedCustomerId);
    if (!selected) {
        el.hidden = true;
        el.innerHTML = '';
        return;
    }
    const total = Math.max(0, Number(selected.total) || 0);
    const name = escapeHtml(selected.displayName || selected.playFabId || 'Player');
    el.innerHTML = `
        <div id="troyOrdersPosMenuHeader" class="troy-orders-pos-menu-header">
            <span>選択中: <strong>${name}</strong></span>
            <span>合計 <strong>${formatYen(total)}</strong></span>
        </div>
        ${buildPosCategoryHtml()}
    `;
    el.hidden = false;
}

function updatePosMenuHeader() {
    const header = $('troyOrdersPosMenuHeader');
    if (!header || !selectedCustomerId) return;
    const entries = Array.isArray(lastData?.troyPendingCheckouts) ? lastData.troyPendingCheckouts : [];
    const selected = entries.find((e) => e.playFabId === selectedCustomerId);
    if (!selected) {
        selectedCustomerId = null;
        rebuildPosMenu();
        return;
    }
    const total = Math.max(0, Number(selected.total) || 0);
    const name = escapeHtml(selected.displayName || selected.playFabId || 'Player');
    header.innerHTML = `<span>選択中: <strong>${name}</strong></span><span>合計 <strong>${formatYen(total)}</strong></span>`;
}

function updateCustomerSelector(entries) {
    const el = $('troyOrdersCustomerSelector');
    if (!el) return;
    if (!entries.length) {
        el.innerHTML = '<span class="troy-orders-no-customers">お客様なし</span>';
        return;
    }
    const label = '<span class="troy-orders-selector-label">客を選択:</span>';
    const chips = entries.map((entry) => {
        const isSelected = entry.playFabId === selectedCustomerId;
        const total = Math.max(0, Number(entry.total) || 0);
        const name = escapeHtml(entry.displayName || entry.playFabId || 'Player');
        const chip = total > 0 ? `${name} ▸ ${formatYen(total)}` : name;
        return `<button type="button" class="troy-orders-customer-chip${isSelected ? ' is-selected' : ''}" data-customer-chip data-customer-id="${escapeHtml(entry.playFabId)}">${chip}</button>`;
    }).join('');
    el.innerHTML = `${label}<div class="troy-orders-chips">${chips}</div>`;
}

function selectCustomer(customerId) {
    selectedCustomerId = customerId || null;
    const entries = Array.isArray(lastData?.troyPendingCheckouts) ? lastData.troyPendingCheckouts : [];
    updateCustomerSelector(entries);
    rebuildPosMenu();
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
    updateCustomerSelector(entries);
    updatePosMenuHeader();
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

async function addItemToCheckout(button) {
    if (!button || !selectedCustomerId) return;
    const name = String(button.dataset.itemName || '').trim();
    const price = Math.max(0, Math.floor(Number(button.dataset.itemPrice) || 0));
    if (!name) return;
    button.disabled = true;
    try {
        await callApiWithLoader('/api/troy-orders/add-item', {
            ...getRequestedNationPayload(),
            receiverPlayFabId: selectedCustomerId,
            name,
            price,
            quantity: 1
        }, { isSilent: true, throwOnError: true });
    } catch (error) {
        setMessage(`注文を追加できませんでした: ${error?.message || error}`, true);
    } finally {
        button.disabled = false;
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
    soundEnabled = getStoredSoundEnabled();
    updateSoundToggle();
    $('troyOrdersSoundToggle')?.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        setStoredSoundEnabled(soundEnabled);
        updateSoundToggle();
        if (soundEnabled) playOrderSound('default');
    });

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
    $('troyOrdersCustomerSelector')?.addEventListener('click', (event) => {
        const chip = event.target instanceof Element ? event.target.closest('[data-customer-chip]') : null;
        if (!chip) return;
        selectCustomer(chip.dataset.customerId || '');
    });
    $('troyOrdersPosMenu')?.addEventListener('click', (event) => {
        const addItemButton = event.target instanceof Element ? event.target.closest('[data-add-item]') : null;
        if (!addItemButton) return;
        void addItemToCheckout(addItemButton);
    });
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
