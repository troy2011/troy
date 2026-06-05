import { callApiWithLoader, createRequestId } from 'api';

const DRINK_SIZE_OPTIONS = [
    { suffix: 'S', price: 500 },
    { suffix: 'M', price: 700 },
    { suffix: '海賊ジョッキ', price: 1000 }
];

function buildSizedDrinkItems(names = []) {
    return names.flatMap((name) => DRINK_SIZE_OPTIONS.map((size) => ({
        name: `${name} ${size.suffix}`,
        price: size.price
    })));
}

const STAFF_MENU = [
    { category: 'ビール・ハイボール', items: [
        { name: '瓶ビール（ハートランド）', price: 700 },
        ...buildSizedDrinkItems([
            'ハイボール（角）',
            'シャンディガフ（ビール+ジンジャーエール）'
        ]),
        { name: 'ノンアルコール瓶ビール（ハイネケン）', price: 700 }
    ]},
    { category: 'ジンベース', items: buildSizedDrinkItems([
        'ジントニック（+トニック）',
        'ジンバック（+ジンジャーエール）',
        'ジンリッキー（+ソーダ）'
    ])},
    { category: 'ウォッカベース', items: buildSizedDrinkItems([
        'モスコミュール（+ジンジャーエール）',
        'スクリュードライバー（+オレンジ）',
        'ウォッカトニック（+トニック）',
        'ブルドッグ（+グレープフルーツ）'
    ])},
    { category: 'ラムベース', items: buildSizedDrinkItems([
        'キューバリブレ（+コーラ）',
        'ラムバック（+ジンジャーエール）'
    ])},
    { category: 'テキーラベース', items: buildSizedDrinkItems([
        'テキーラサンライズ（+オレンジ）',
        'メキシコーラ（+コーラ）'
    ])},
    { category: 'リキュール・その他', items: buildSizedDrinkItems([
        'カシスオレンジ',
        'カシスソーダ',
        'カシスウーロン',
        'ファジーネーブル（ピーチ+オレンジ）',
        'スプモーニ（カンパリ+グレープフルーツ+トニック）',
        'レモンサワー',
        'グレープフルーツサワー'
    ])},
    { category: 'ウイスキー・焼酎・ワイン', items: [
        ...buildSizedDrinkItems([
            'ウイスキー（ロック）',
            'ウイスキー（水割り）'
        ]),
        { name: 'キンミヤボトル', price: 2500 },
        { name: '黒霧ボトル', price: 3000 },
        ...buildSizedDrinkItems([
            '焼酎 お茶割り',
            '焼酎 ウーロン割り',
            '焼酎 ソーダ割り',
            '焼酎 芋',
            '焼酎 麦',
            '焼酎 米',
            '焼酎 しそ',
            'グラスワイン（赤）',
            'グラスワイン（白）'
        ])
    ]},
    { category: '割り物', items: [
        { name: 'お茶', price: 600 },
        { name: 'ウーロン', price: 600 },
        { name: 'ソーダ 1本', price: 300 },
        { name: '水 1本', price: 300 }
    ]},
    { category: '酒場のフード', items: [
        { name: '漬けチーズ', price: 500 },
        { name: 'うずらの味玉', price: 500 },
        { name: 'ナゲット', price: 500 },
        { name: '韓国のり', price: 300 },
        { name: '梅水晶', price: 500 }
    ]},
    { category: 'ソフトドリンク', items: [
        { name: 'ウーロン茶', price: 400 },
        { name: 'オレンジジュース', price: 400 },
        { name: 'グレープフルーツジュース', price: 400 },
        { name: 'コーラ', price: 400 },
        { name: 'ジンジャーエール', price: 400 }
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
const CUSTOM_ORDER_ITEM_NAME = 'その他';
const CUSTOM_ORDER_PRICE_PRESETS = [100, 300, 500, 1000, 1500, 2000, 3000, 5000];
const CUSTOM_ORDER_PRICE_MIN = 100;
const CUSTOM_ORDER_PRICE_MAX = 100000;

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

function formatGold(value) {
    return `${Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('ja-JP')}G`;
}

function normalizeCustomOrderPrice(value) {
    const raw = Math.floor(Number(value) || 0);
    if (raw < CUSTOM_ORDER_PRICE_MIN) return 0;
    return Math.min(CUSTOM_ORDER_PRICE_MAX, Math.floor(raw / 100) * 100);
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

function renderCoinConversionLogs(logs = []) {
    const el = $('troyOrdersCoinLog');
    if (!el) return;
    const rows = Array.isArray(logs) ? logs : [];
    if (!rows.length) {
        el.innerHTML = '<div class="troy-orders-coin-log-empty">チップ化ログはまだありません。</div>';
        return;
    }
    el.innerHTML = rows.slice(0, 12).map((entry) => `
        <div class="troy-orders-coin-log-row">
            <div class="troy-orders-coin-log-name">${escapeHtml(entry.displayName || entry.playFabId || 'お客様')}</div>
            <div class="troy-orders-coin-log-time">${escapeHtml(formatTime(entry.timestampMs) || '-')}</div>
            <div class="troy-orders-coin-log-amount">${escapeHtml(formatGold(entry.amount))}</div>
        </div>
    `).join('');
}

async function setTroyOpen(nextOpen) {
    if (busy) return;
    if (!nextOpen) {
        const entries = Array.isArray(lastData?.troyPendingCheckouts) ? lastData.troyPendingCheckouts : [];
        if (entries.length > 0 && !confirm(`会計待ちの伝票が ${entries.length}件 あります。TROYをCLOSEしますか？`)) return;
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
        await refreshOrders({ silent: true, force: true });
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

function getCheckoutEntries(data = lastData) {
    return Array.isArray(data?.troyPendingCheckouts) ? data.troyPendingCheckouts : [];
}

function getMemberEntries(data = lastData) {
    return Array.isArray(data?.troyMembers) ? data.troyMembers : [];
}

function getCustomerEntries(data = lastData) {
    const checkouts = getCheckoutEntries(data);
    const checkoutById = new Map(checkouts.map((entry) => [entry.playFabId, entry]));
    const rows = [];
    getMemberEntries(data).forEach((member) => {
        const checkout = checkoutById.get(member.playFabId) || null;
        rows.push({
            ...member,
            checkout,
            total: Math.max(0, Number(checkout?.total) || 0),
            totalItems: Math.max(0, Number(checkout?.totalItems) || 0)
        });
    });
    checkouts.forEach((checkout) => {
        if (rows.some((entry) => entry.playFabId === checkout.playFabId)) return;
        rows.push({
            ...checkout,
            checkout,
            total: Math.max(0, Number(checkout.total) || 0),
            totalItems: Math.max(0, Number(checkout.totalItems) || 0)
        });
    });
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
    if (/漬け|うずら|ナゲット|韓国のり|梅水晶|ポテ|チョコ|ナッツ|フライ|ピザ|フランク|ワッフル|チュロス|ラーメン/.test(name)) return 'food';
    if (/ラム|ウォッカ|テキーラ|ジン|リキュール|焼酎|ビール|ハイボール|カシス|ファジー|スプモーニ|サワー|ウイスキー|ワイン|コーラ|ジンジャー|オレンジ|グレープフルーツ|ウーロン|ノンアル|水割り|ソーダ|お茶|レモン|トニック|ブルドッグ|モスコミュール/.test(name)) return 'drink';
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
    if (el) el.textContent = `伝票 ${entries.length}件 / 未提供 ${pending}件 / 提供済み ${served}件`;
}

function getEntryCheckout(entry = {}) {
    return entry.checkout || entry;
}

function getEntryItems(entry = {}) {
    const checkout = getEntryCheckout(entry);
    return Array.isArray(checkout.items) ? checkout.items : [];
}

function getEntryTotal(entry = {}) {
    const checkout = getEntryCheckout(entry);
    return Math.max(0, Number(checkout.total ?? entry.total) || 0);
}

function getEntryTotalItems(entry = {}) {
    const checkout = getEntryCheckout(entry);
    return Math.max(0, Number(checkout.totalItems ?? entry.totalItems) || 0);
}

function getEntrySortTime(entry = {}) {
    const checkout = getEntryCheckout(entry);
    return Number(checkout.lastOrderedAtMs || checkout.createdAtMs || entry.lastOrderedAtMs || entry.createdAtMs || entry.joinedAtMs) || 0;
}

function sortCustomerEntries(entries = []) {
    const rows = [...entries];
    const mode = getSortMode();
    if (mode === 'newest') {
        rows.sort((a, b) => getEntrySortTime(b) - getEntrySortTime(a));
    } else if (mode === 'name') {
        rows.sort((a, b) => String(a.displayName || a.playFabId || '').localeCompare(String(b.displayName || b.playFabId || ''), 'ja'));
    } else {
        rows.sort((a, b) => getEntrySortTime(a) - getEntrySortTime(b));
    }
    return rows;
}

function getPendingServeCount(items = []) {
    return items.filter((item) => !(String(item.status || '').toLowerCase() === 'served' || Number(item.servedAtMs) > 0)).length;
}

function buildPosCategoryHtml() {
    const menuHtml = STAFF_MENU.map((cat, index) => {
        const btns = cat.items.map((item) => `
            <button type="button" class="troy-orders-pos-btn"
                data-add-item
                data-item-name="${escapeHtml(item.name)}"
                data-item-price="${item.price}">
                ${escapeHtml(item.name)}<span>${formatYen(item.price)}</span>
            </button>`).join('');
        return `
            <details class="troy-orders-pos-category"${index === 0 ? ' open' : ''}>
                <summary>${escapeHtml(cat.category)}</summary>
                <div class="troy-orders-pos-items">${btns}</div>
            </details>`;
    }).join('');
    const presetButtons = CUSTOM_ORDER_PRICE_PRESETS.map((price) => `
        <button type="button" data-custom-price-preset="${price}">${formatYen(price)}</button>
    `).join('');
    return `${menuHtml}
        <details class="troy-orders-pos-category troy-orders-custom-category">
            <summary>その他</summary>
            <div class="troy-orders-custom-item">
                <div class="troy-orders-custom-price-row">
                    <button type="button" data-custom-price-step="-500">-500</button>
                    <button type="button" data-custom-price-step="-100">-100</button>
                    <label>
                        <span>金額</span>
                        <input type="number" min="100" max="${CUSTOM_ORDER_PRICE_MAX}" step="100" inputmode="numeric" value="500" data-custom-price>
                    </label>
                    <button type="button" data-custom-price-step="100">+100</button>
                    <button type="button" data-custom-price-step="500">+500</button>
                </div>
                <button type="button" class="troy-orders-custom-add" data-add-custom-item>${CUSTOM_ORDER_ITEM_NAME}を追加</button>
                <div class="troy-orders-custom-presets">${presetButtons}</div>
            </div>
        </details>`;
}

function renderOrderItemRows(entry) {
    return getEntryItems(entry).map((item) => {
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const orderId = String(item.orderId || '').trim();
        const served = String(item.status || '').toLowerCase() === 'served' || Number(item.servedAtMs) > 0;
        return `
            <div class="troy-orders-item-row${served ? ' is-served' : ''}">
                <span>${escapeHtml(item.name || '商品')}</span>
                <em>${quantity > 1 ? `x${quantity}` : ''}</em>
                <strong>${formatYen(item.lineTotal || ((Number(item.price) || 0) * quantity))}</strong>
                ${orderId ? `<button type="button" data-toggle-served data-order-id="${escapeHtml(orderId)}" data-served="${served ? 'true' : 'false'}">${served ? '提供済み' : '未提供'}</button>` : '<i></i>'}
            </div>
        `;
    }).join('');
}

function renderTicketPreviewItems(items = []) {
    if (!items.length) {
        return '<span class="troy-orders-ticket-note">まだ商品はありません</span>';
    }
    const rows = items.slice(-3).reverse().map((item) => {
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const quantityLabel = quantity > 1 ? ` x${quantity}` : '';
        return `<span class="troy-orders-ticket-item"><span>${escapeHtml(item.name || '商品')}${quantityLabel}</span><strong>${formatYen(item.lineTotal || ((Number(item.price) || 0) * quantity))}</strong></span>`;
    }).join('');
    return `<span class="troy-orders-ticket-items">${rows}</span>`;
}

function renderTicketCard(entry, index) {
    const total = getEntryTotal(entry);
    const totalItems = getEntryTotalItems(entry);
    const grantTotal = Math.max(0, Number(entry.grantTotal || entry.checkout?.grantTotal) || 0);
    const checkout = getEntryCheckout(entry);
    const orderedAt = formatTime(checkout.lastOrderedAtMs || checkout.createdAtMs || entry.joinedAtMs);
    const items = getEntryItems(entry);
    const pendingServeCount = getPendingServeCount(items);
    const hasOrder = total > 0 || totalItems > 0;
    const ticketState = hasOrder
        ? (pendingServeCount > 0 ? `未提供 ${pendingServeCount}` : '会計待ち')
        : '未入力';
    const meta = [
        entry.rankName || '',
        Number(entry.level) > 0 ? `Lv.${Math.floor(Number(entry.level))}` : '',
        orderedAt,
        grantTotal ? `付与済み ${grantTotal.toLocaleString('ja-JP')}G` : ''
    ].filter(Boolean).join(' / ');

    return `
        <button type="button" class="troy-orders-ticket${entry.playFabId === selectedCustomerId ? ' is-selected' : ''}${hasOrder ? ' has-order' : ''} is-tilt-${index % 2 ? 'right' : 'left'}"
            data-open-ticket
            data-customer-id="${escapeHtml(entry.playFabId || '')}">
            <span class="troy-orders-ticket-pin"></span>
            <span class="troy-orders-ticket-kicker">伝票 ${String(index + 1).padStart(2, '0')}</span>
            <span class="troy-orders-ticket-name">${escapeHtml(entry.displayName || entry.playFabId || 'Player')}</span>
            <span class="troy-orders-ticket-meta">${escapeHtml(meta || '店内滞在中')}</span>
            <span class="troy-orders-ticket-preview">${renderTicketPreviewItems(items)}</span>
            <span class="troy-orders-ticket-foot">
                <strong>${hasOrder ? formatYen(total) : '未入力'}</strong>
                <em>${escapeHtml(ticketState)}</em>
            </span>
        </button>
    `;
}

function renderTicketGrid(entries = []) {
    const grid = $('troyOrdersTicketGrid');
    const empty = $('troyOrdersEmpty');
    if (!grid) return;
    if (!entries.length) {
        grid.innerHTML = '';
        if (empty) empty.hidden = false;
        return;
    }
    if (empty) empty.hidden = true;
    grid.innerHTML = entries.map(renderTicketCard).join('');
}

function findSelectedCustomer() {
    if (!selectedCustomerId) return null;
    return getCustomerEntries(lastData).find((entry) => entry.playFabId === selectedCustomerId) || null;
}

function renderTicketDetail() {
    const detail = $('troyOrdersTicketDetail');
    if (!detail) return;
    const entry = findSelectedCustomer();
    if (!entry) {
        closeTicketDetail();
        return;
    }
    const total = getEntryTotal(entry);
    const totalItems = getEntryTotalItems(entry);
    const checkout = getEntryCheckout(entry);
    const status = String(checkout.status || entry.status || 'open').trim().toLowerCase();
    const orderedAt = formatTime(checkout.lastOrderedAtMs || checkout.createdAtMs || entry.joinedAtMs);
    const items = getEntryItems(entry);
    const pendingServeCount = getPendingServeCount(items);
    const itemRows = renderOrderItemRows(entry);
    const meta = [
        status === 'pending' ? '確認待ち' : '店内伝票',
        orderedAt,
        totalItems ? `${totalItems}点` : '',
        Number(entry.level) > 0 ? `Lv.${Math.floor(Number(entry.level))}` : '',
        entry.rankName || ''
    ].filter(Boolean).join(' / ');

    detail.innerHTML = `
        <section class="troy-orders-ticket-detail" data-receiver-id="${escapeHtml(entry.playFabId || '')}" data-amount="${total}">
            <div class="troy-orders-ticket-detail-head">
                <div>
                    <div class="troy-orders-ticket-detail-kicker">大きな伝票</div>
                    <h2 data-ticket-customer-name>${escapeHtml(entry.displayName || entry.playFabId || 'Player')}</h2>
                    <p>${escapeHtml(meta || '店内滞在中')}</p>
                </div>
                <div class="troy-orders-total-wrap">
                    <div class="troy-orders-total">${formatYen(total)}</div>
                    <span class="${pendingServeCount > 0 ? 'is-pending-serve' : 'is-served-all'}">${pendingServeCount > 0 ? `未提供 ${pendingServeCount}` : (items.length ? '全て提供済み' : '未入力')}</span>
                </div>
            </div>

            <div class="troy-orders-ticket-detail-layout">
                <div class="troy-orders-ticket-current">
                    <div class="troy-orders-subhead">
                        <strong>現在の伝票</strong>
                        <span>${totalItems ? `${totalItems}点` : '商品なし'}</span>
                    </div>
                    <div class="troy-orders-items">${itemRows || '<div class="troy-orders-item-row is-empty"><span>注文を追加してください</span></div>'}</div>
                    <div class="troy-orders-settle">
                        <label>
                            <span>チップ返却</span>
                            <input type="number" min="0" step="100" inputmode="numeric" value="0" data-chip-return>
                            <b>G</b>
                        </label>
                        <button type="button" data-settle ${total > 0 ? '' : 'disabled'}>会計・退店</button>
                    </div>
                </div>
                <div class="troy-orders-ticket-menu">
                    <div class="troy-orders-subhead">
                        <strong>注文追加</strong>
                        <span>商品を選択</span>
                    </div>
                    ${buildPosCategoryHtml()}
                </div>
            </div>
        </section>
    `;
}

function openTicketDetail(customerId) {
    selectedCustomerId = customerId || null;
    if (!findSelectedCustomer()) {
        selectedCustomerId = null;
        return;
    }
    renderTicketGrid(sortCustomerEntries(getCustomerEntries(lastData)));
    renderTicketDetail();
    const modal = $('troyOrdersTicketModal');
    if (modal) modal.hidden = false;
    document.body.classList.add('is-troy-ticket-open');
}

function closeTicketDetail() {
    const modal = $('troyOrdersTicketModal');
    if (modal) modal.hidden = true;
    selectedCustomerId = null;
    document.body.classList.remove('is-troy-ticket-open');
    renderTicketGrid(sortCustomerEntries(getCustomerEntries(lastData)));
}

function render(data = {}) {
    lastData = data;
    setSummary(data);
    renderCoinConversionLogs(data.troyCoinConversionLogs);
    const entries = getCheckoutEntries(data);
    const customers = sortCustomerEntries(getCustomerEntries(data));
    if (selectedCustomerId && !customers.some((entry) => entry.playFabId === selectedCustomerId)) {
        selectedCustomerId = null;
        const modal = $('troyOrdersTicketModal');
        if (modal) modal.hidden = true;
        document.body.classList.remove('is-troy-ticket-open');
    }
    flashForNewOrders(entries);
    updateServeSummary(entries);
    renderTicketGrid(customers);
    if (!$('troyOrdersTicketModal')?.hidden && selectedCustomerId) {
        renderTicketDetail();
    }
}

async function refreshOrders({ silent = true, force = false } = {}) {
    if (busy && !force) return;
    try {
        const data = await callApiWithLoader('/api/troy-orders/list', getRequestedNationPayload(), { isSilent: silent, throwOnError: true });
        setMessage('');
        render(data || {});
    } catch (error) {
        console.warn('[troy-orders] refresh failed:', error);
        setMessage('会計レジを取得できませんでした。通信状態を確認してください。', true);
    }
}

async function settleFromCard(card) {
    if (!card || busy) return;
    const receiverId = String(card.dataset.receiverId || '').trim();
    const expectedTotal = Math.max(0, Math.floor(Number(card.dataset.amount) || 0));
    const chipReturnInput = card.querySelector('[data-chip-return]');
    const chipReturnAmount = Math.max(0, Math.floor(Number(chipReturnInput?.value || 0) || 0));
    if (!receiverId || expectedTotal <= 0) return;
    if (chipReturnAmount > 0 && (chipReturnAmount % 100 !== 0 || chipReturnAmount > 1000000)) {
        setMessage('チップ返却は100G単位、100万Gまでで入力してください。', true);
        return;
    }
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
            chipReturnAmount
        }, { isSilent: true, throwOnError: true });
        await refreshOrders({ silent: true, force: true });
        setMessage('会計と退店処理を完了しました。');
    } catch (error) {
        console.warn('[troy-orders] settle failed:', error);
        setMessage(`会計できませんでした: ${error?.message || error}`, true);
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
        await refreshOrders({ silent: true, force: true });
    } catch (error) {
        setMessage(`商品を追加できませんでした: ${error?.message || error}`, true);
    } finally {
        button.disabled = false;
    }
}

function getCustomPriceInput(source) {
    const root = source?.closest?.('.troy-orders-custom-item') || $('troyOrdersTicketDetail');
    return root?.querySelector?.('[data-custom-price]') || null;
}

function setCustomPrice(input, value) {
    if (!input) return 0;
    const normalized = normalizeCustomOrderPrice(value) || CUSTOM_ORDER_PRICE_MIN;
    input.value = String(normalized);
    return normalized;
}

function adjustCustomPrice(button) {
    const input = getCustomPriceInput(button);
    const current = normalizeCustomOrderPrice(input?.value) || CUSTOM_ORDER_PRICE_MIN;
    const delta = Math.floor(Number(button?.dataset?.customPriceStep) || 0);
    setCustomPrice(input, current + delta);
}

function applyCustomPricePreset(button) {
    const input = getCustomPriceInput(button);
    setCustomPrice(input, button?.dataset?.customPricePreset);
}

async function addCustomItemToCheckout(button) {
    if (!button || !selectedCustomerId) return;
    const input = getCustomPriceInput(button);
    const price = normalizeCustomOrderPrice(input?.value);
    if (price <= 0) {
        setMessage('その他の金額は100円単位で入力してください。', true);
        input?.focus();
        return;
    }
    setCustomPrice(input, price);
    button.disabled = true;
    try {
        await callApiWithLoader('/api/troy-orders/add-item', {
            ...getRequestedNationPayload(),
            receiverPlayFabId: selectedCustomerId,
            name: CUSTOM_ORDER_ITEM_NAME,
            price,
            quantity: 1
        }, { isSilent: true, throwOnError: true });
        await refreshOrders({ silent: true, force: true });
    } catch (error) {
        setMessage(`商品を追加できませんでした: ${error?.message || error}`, true);
    } finally {
        button.disabled = false;
    }
}

async function toggleServedFromButton(button) {
    if (!button || busy) return;
    const card = button.closest('[data-receiver-id]');
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
        await refreshOrders({ silent: true, force: true });
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
    const name = card.querySelector('[data-ticket-customer-name]')?.textContent || card.querySelector('h2')?.textContent || card.dataset.receiverId || '-';
    const total = Math.max(0, Math.floor(Number(card.dataset.amount) || 0));
    const chipReturnAmount = Math.max(0, Math.floor(Number(card.querySelector('[data-chip-return]')?.value || 0) || 0));
    const itemRows = [...card.querySelectorAll('.troy-orders-item-row')].map((row) => {
        const nameEl = row.querySelector('span');
        const priceEl = row.querySelector('strong');
        return `<div><span>${escapeHtml(nameEl?.textContent || '')}</span><strong>${escapeHtml(priceEl?.textContent || '')}</strong></div>`;
    });
    if (chipReturnAmount > 0) {
        itemRows.push(`<div><span>チップ返却</span><strong>${escapeHtml(formatGold(chipReturnAmount))}</strong></div>`);
    }
    $('troyOrdersConfirmName').textContent = name;
    $('troyOrdersConfirmTotal').textContent = formatYen(total);
    $('troyOrdersConfirmItems').innerHTML = itemRows.join('');
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
    $('troyOrdersTicketGrid')?.addEventListener('click', (event) => {
        const ticket = event.target instanceof Element ? event.target.closest('[data-open-ticket]') : null;
        if (!ticket) return;
        openTicketDetail(ticket.dataset.customerId || '');
    });
    $('troyOrdersTicketClose')?.addEventListener('click', closeTicketDetail);
    $('troyOrdersTicketModal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) closeTicketDetail();
    });
    $('troyOrdersTicketDetail')?.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const addItemButton = target?.closest('[data-add-item]');
        if (addItemButton) {
            void addItemToCheckout(addItemButton);
            return;
        }
        const servedButton = target?.closest('[data-toggle-served]');
        if (servedButton) {
            void toggleServedFromButton(servedButton);
            return;
        }
        const customStepButton = target?.closest('[data-custom-price-step]');
        if (customStepButton) {
            adjustCustomPrice(customStepButton);
            return;
        }
        const customPresetButton = target?.closest('[data-custom-price-preset]');
        if (customPresetButton) {
            applyCustomPricePreset(customPresetButton);
            return;
        }
        const customAddButton = target?.closest('[data-add-custom-item]');
        if (customAddButton) {
            void addCustomItemToCheckout(customAddButton);
            return;
        }
        const settleButton = target?.closest('[data-settle]');
        if (!settleButton) return;
        openConfirmModal(settleButton.closest('[data-receiver-id]'));
    });
    $('troyOrdersTicketDetail')?.addEventListener('change', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.matches('[data-custom-price]')) {
            setCustomPrice(target, target.value);
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !$('troyOrdersTicketModal')?.hidden) closeTicketDetail();
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
