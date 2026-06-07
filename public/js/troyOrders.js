import { callApiWithLoader, createRequestId } from 'api';
import { getTroyMenuImage } from './troyMenuAssets.js';
import { STAFF_MENU_CUSTOM_CATEGORY_ALIASES, getTroyStaffMenu } from './troyMenuData.js';

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
const CUSTOM_ORDER_ITEM_NAME = '裏メニュー';
const CUSTOM_ORDER_PRICE_PRESETS = [100, 300, 500, 1000, 1500, 2000, 3000, 5000];
const CUSTOM_ORDER_PRICE_MIN = 100;
const CUSTOM_ORDER_PRICE_MAX = 100000;
const USUAL_ORDER_CATEGORY_ID = 'usual';
const USUAL_ORDER_CATEGORY_TITLE = 'いつもの';
const USUAL_ORDER_LIMIT = 8;

let refreshTimer = null;
let sseSource = null;
let sseFallbackTimer = null;
let lastData = null;
let busy = false;
let seenOrderIds = new Set();
let seenCustomerOrderRequestIds = new Set();
let hasRenderedOnce = false;
let hasRenderedCustomerRequestsOnce = false;
let pendingSettleCard = null;
let soundEnabled = false;
let selectedCustomerId = null;
let localTicketGroups = [];
let manualTicketOrder = [];
let ticketDragState = null;
let suppressNextTicketClick = false;

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

function normalizeStaffCustomMenuItems(data = lastData) {
    const items = Array.isArray(data?.menuCustomItems) ? data.menuCustomItems : [];
    return items.map((item) => {
        const rawMenuId = String(item?.menuId || '').trim().toLowerCase();
        const categoryId = STAFF_MENU_CUSTOM_CATEGORY_ALIASES[rawMenuId] || rawMenuId;
        const name = String(item?.concept || item?.name || '').trim().slice(0, 60);
        const note = String(item?.content || '').trim().slice(0, 80);
        const price = Math.max(0, Math.floor(Number(item?.price) || 0));
        const image = String(item?.iconImage || item?.image || '').trim();
        const emoji = String(item?.emoji || '').trim();
        if (!categoryId || !name || price <= 0) return null;
        return { categoryId, name, note, price, image, iconImage: image, emoji };
    }).filter(Boolean);
}

function normalizeUsualOrderItems(entry = {}) {
    return (Array.isArray(entry?.usualItems) ? entry.usualItems : [])
        .map((item) => {
            const name = String(item?.name || '').trim();
            const price = Math.max(0, Math.floor(Number(item?.price) || 0));
            const count = Math.max(0, Math.floor(Number(item?.count || item?.orderCount || 0)));
            if (!name || price <= 0) return null;
            return {
                name,
                price,
                note: count > 0 ? `過去${count}回` : '',
                categoryId: USUAL_ORDER_CATEGORY_ID
            };
        })
        .filter(Boolean)
        .slice(0, USUAL_ORDER_LIMIT);
}

function buildStaffMenu(data = lastData, customerEntry = null) {
    const categories = getTroyStaffMenu();
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    normalizeStaffCustomMenuItems(data).forEach((item) => {
        const category = categoryById.get(item.categoryId);
        if (!category) return;
        category.items.push({
            name: item.name,
            note: item.note,
            price: item.price,
            image: item.image,
            iconImage: item.iconImage,
            emoji: item.emoji,
            isCustom: true
        });
    });
    const usualItems = normalizeUsualOrderItems(customerEntry);
    if (usualItems.length) {
        categories.unshift({
            id: USUAL_ORDER_CATEGORY_ID,
            category: USUAL_ORDER_CATEGORY_TITLE,
            items: usualItems
        });
    }
    return categories;
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
    renderSalesBreakdown(data.troyTodaySales || {});
}

function normalizeSalesSummaryRows(rows = []) {
    return (Array.isArray(rows) ? rows : [])
        .map((row) => {
            const name = String(row?.name || row?.label || '').trim();
            const categoryId = String(row?.categoryId || row?.id || '').trim().toLowerCase();
            const quantity = Math.max(0, Math.floor(Number(row?.quantity) || 0));
            const total = Math.max(0, Math.floor(Number(row?.total) || 0));
            if (!name || quantity <= 0 || total <= 0) return null;
            return { categoryId, name, quantity, total };
        })
        .filter(Boolean)
        .sort((a, b) => (b.total - a.total) || (b.quantity - a.quantity) || a.name.localeCompare(b.name, 'ja'));
}

function buildSalesPayouts(sales = {}, categories = [], items = []) {
    const total = Math.max(0, Math.floor(Number(sales.total) || 0));
    const raw = sales.payouts && typeof sales.payouts === 'object' ? sales.payouts : null;
    if (raw) {
        return {
            total,
            chargeTotal: Math.max(0, Math.floor(Number(raw.chargeTotal ?? raw.dealerShare) || 0)),
            nonChargeTotal: Math.max(0, Math.floor(Number(raw.nonChargeTotal) || 0)),
            masterShare: Math.max(0, Math.floor(Number(raw.masterShare) || 0)),
            dealerShare: Math.max(0, Math.floor(Number(raw.dealerShare ?? raw.chargeTotal) || 0))
        };
    }
    const categoryChargeTotal = categories
        .filter((row) => row.categoryId === 'entry' || row.name === 'チャージ')
        .reduce((sum, row) => sum + row.total, 0);
    const itemChargeTotal = categoryChargeTotal > 0
        ? 0
        : items.filter((row) => row.name === '入店チャージ').reduce((sum, row) => sum + row.total, 0);
    const dealerShare = Math.min(total, categoryChargeTotal + itemChargeTotal);
    const nonChargeTotal = Math.max(0, total - dealerShare);
    return {
        total,
        chargeTotal: dealerShare,
        nonChargeTotal,
        masterShare: Math.floor(nonChargeTotal / 2),
        dealerShare
    };
}

function renderSalesList(rows, emptyText) {
    if (!rows.length) {
        return `<div class="troy-orders-sales-empty">${escapeHtml(emptyText)}</div>`;
    }
    return rows.slice(0, 8).map((row, index) => `
        <div class="troy-orders-sales-row">
            <span class="troy-orders-sales-rank">${index + 1}</span>
            <span class="troy-orders-sales-name">${escapeHtml(row.name)}</span>
            <span class="troy-orders-sales-quantity">x${row.quantity}</span>
            <strong>${formatYen(row.total)}</strong>
        </div>
    `).join('');
}

function renderSalesBreakdown(sales = {}) {
    const el = $('troyOrdersSalesBreakdown');
    if (!el) return;
    const panel = $('troyOrdersSalesPanel');
    const categories = normalizeSalesSummaryRows(sales.categories);
    const items = normalizeSalesSummaryRows(sales.items);
    const payouts = buildSalesPayouts(sales, categories, items);
    const hasRows = payouts.total > 0 || categories.length > 0 || items.length > 0;
    if (panel) panel.hidden = !hasRows;
    if (!hasRows) {
        el.innerHTML = '';
        return;
    }
    el.innerHTML = `
        <section class="troy-orders-payouts">
            <div class="troy-orders-payout-card is-master">
                <span>マスター取り分</span>
                <strong>${formatYen(payouts.masterShare)}</strong>
                <em>チャージ除外売上 ${formatYen(payouts.nonChargeTotal)} の半分</em>
            </div>
            <div class="troy-orders-payout-card is-dealer">
                <span>ディーラー取り分</span>
                <strong>${formatYen(payouts.dealerShare)}</strong>
                <em>チャージ代 ${formatYen(payouts.chargeTotal)}</em>
            </div>
        </section>
        <section class="troy-orders-sales-column">
            <div class="troy-orders-sales-column-head">
                <strong>カテゴリ別売上</strong>
                <span>${categories.length ? `${categories.length}種` : '未集計'}</span>
            </div>
            ${renderSalesList(categories, 'カテゴリ売上はまだありません。')}
        </section>
        <section class="troy-orders-sales-column">
            <div class="troy-orders-sales-column-head">
                <strong>商品別売上</strong>
                <span>${items.length ? `${items.length}品` : '未集計'}</span>
            </div>
            ${renderSalesList(items, '商品売上はまだありません。')}
        </section>
    `;
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
    if (/ラム|ウォッカ|テキーラ|ジン|リキュール|焼酎|ビール|ハイボール|カシス|ファジー|スプモーニ|サワー|ウイスキー|ワイン|コーラ|ジンジャー|オレンジ|グレープフルーツ|ウーロン|ノンアル|水割り|ソーダ|お茶|氷|レモン|トニック|ブルドッグ|モスコミュール/.test(name)) return 'drink';
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

function normalizeCustomerOrderRequests(data = lastData) {
    return (Array.isArray(data?.troyCustomerOrderRequests) ? data.troyCustomerOrderRequests : [])
        .map((request) => {
            const requestId = String(request?.requestId || '').trim();
            const playFabId = String(request?.playFabId || '').trim();
            const name = String(request?.name || '').trim();
            const status = String(request?.status || 'pending').trim().toLowerCase();
            const price = Math.max(0, Math.floor(Number(request?.price) || 0));
            const quantity = Math.max(1, Math.min(99, Math.floor(Number(request?.quantity) || 1)));
            if (!requestId || !playFabId || !name || price <= 0) return null;
            return {
                requestId,
                playFabId,
                displayName: String(request?.displayName || playFabId).trim(),
                status,
                name,
                price,
                quantity,
                lineTotal: Math.max(0, Math.floor(Number(request?.lineTotal) || price * quantity)),
                menuImage: String(request?.menuImage || request?.image || request?.iconImage || '').trim(),
                menuCategory: String(request?.menuCategory || '').trim(),
                menuCategoryLabel: String(request?.menuCategoryLabel || '').trim(),
                optionLabel: String(request?.optionLabel || '').trim(),
                sizeLabel: String(request?.sizeLabel || '').trim(),
                createdAtMs: Math.max(0, Math.floor(Number(request?.createdAtMs) || 0))
            };
        })
        .filter((request) => request && (request.status === 'pending' || request.status === 'processing'))
        .sort((a, b) => (a.createdAtMs - b.createdAtMs) || a.requestId.localeCompare(b.requestId));
}

function flashForNewCustomerOrderRequests(requests = []) {
    const pending = requests.filter((request) => request.status === 'pending');
    const nextIds = new Set(pending.map((request) => request.requestId));
    if (hasRenderedCustomerRequestsOnce) {
        const newRequests = pending.filter((request) => !seenCustomerOrderRequestIds.has(request.requestId));
        if (newRequests.length > 0) {
            document.body.classList.remove('is-new-order-flash');
            void document.body.offsetWidth;
            document.body.classList.add('is-new-order-flash');
            setTimeout(() => document.body.classList.remove('is-new-order-flash'), 1800);
            playOrderSound(pickOrderSoundKey(newRequests.map((request) => ({
                name: request.name,
                price: request.price,
                quantity: request.quantity,
                lineTotal: request.lineTotal
            }))));
        }
    }
    seenCustomerOrderRequestIds = nextIds;
    hasRenderedCustomerRequestsOnce = true;
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

function normalizeCustomerId(value) {
    return String(value || '').trim();
}

function createLocalGroupId(ids = []) {
    const seed = ids.map(normalizeCustomerId).filter(Boolean).join('-');
    return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${seed}`.slice(0, 96);
}

function getCustomerDisplayName(entry = {}) {
    return String(entry.displayName || entry.playFabId || 'Player');
}

function formatGroupName(entries = []) {
    const names = entries.map(getCustomerDisplayName).filter(Boolean);
    if (names.length <= 1) return names[0] || 'グループ';
    if (names.length === 2) return `${names[0]} と ${names[1]}`;
    return `${names[0]} と ${names[1]} 他${names.length - 2}名`;
}

function getCardKeyForCustomer(id) {
    return `customer:${normalizeCustomerId(id)}`;
}

function getCardKeyForGroup(groupId) {
    return `group:${String(groupId || '').trim()}`;
}

function cleanupLocalTicketGroups(entries = getCustomerEntries(lastData)) {
    const validIds = new Set(entries.map((entry) => normalizeCustomerId(entry.playFabId)).filter(Boolean));
    const usedIds = new Set();
    localTicketGroups = localTicketGroups
        .map((group) => {
            const memberIds = (Array.isArray(group.memberIds) ? group.memberIds : [])
                .map(normalizeCustomerId)
                .filter((id) => id && validIds.has(id) && !usedIds.has(id));
            memberIds.forEach((id) => usedIds.add(id));
            return { id: String(group.id || createLocalGroupId(memberIds)), memberIds };
        })
        .filter((group) => group.memberIds.length > 1);

    const validKeys = new Set(entries.map((entry) => getCardKeyForCustomer(entry.playFabId)));
    localTicketGroups.forEach((group) => {
        group.memberIds.forEach((id) => validKeys.delete(getCardKeyForCustomer(id)));
        validKeys.add(getCardKeyForGroup(group.id));
    });
    manualTicketOrder = manualTicketOrder.filter((key) => validKeys.has(key));
}

function getLocalTicketGroupById(groupId) {
    const id = String(groupId || '').trim();
    return localTicketGroups.find((group) => group.id === id) || null;
}

function getLocalTicketGroupByCustomerId(customerId) {
    const id = normalizeCustomerId(customerId);
    if (!id) return null;
    return localTicketGroups.find((group) => group.memberIds.includes(id)) || null;
}

function getLocalGroupEntriesByCustomerId(customerId) {
    const group = getLocalTicketGroupByCustomerId(customerId);
    if (!group) return [];
    return group.memberIds
        .map((id) => getCustomerEntryById(id))
        .filter(Boolean);
}

function getCardIdsFromTicket(ticket) {
    return String(ticket?.dataset?.customerIds || ticket?.dataset?.customerId || '')
        .split('|')
        .map(normalizeCustomerId)
        .filter(Boolean);
}

function getCardKeyFromTicket(ticket) {
    return String(ticket?.dataset?.cardKey || '').trim();
}

function getCurrentDisplayOrderKeys() {
    const grid = $('troyOrdersTicketGrid');
    const keys = [...(grid?.querySelectorAll('[data-open-ticket]') || [])]
        .map(getCardKeyFromTicket)
        .filter(Boolean);
    return keys.length ? keys : manualTicketOrder.slice();
}

function ensureManualOrderSeed() {
    if (manualTicketOrder.length) return;
    manualTicketOrder = getCurrentDisplayOrderKeys();
}

function mergeLocalTicketGroups(sourceTicket, targetTicket) {
    const sourceIds = getCardIdsFromTicket(sourceTicket);
    const targetIds = getCardIdsFromTicket(targetTicket);
    const mergedIds = [...targetIds, ...sourceIds].filter((id, index, ids) => id && ids.indexOf(id) === index);
    if (mergedIds.length < 2) return false;

    ensureManualOrderSeed();
    const sourceKey = getCardKeyFromTicket(sourceTicket);
    const targetKey = getCardKeyFromTicket(targetTicket);
    const existingGroup = [getLocalTicketGroupById(targetTicket?.dataset?.groupId), getLocalTicketGroupById(sourceTicket?.dataset?.groupId)]
        .find(Boolean);
    const groupId = existingGroup?.id || createLocalGroupId(mergedIds);
    const mergedSet = new Set(mergedIds);

    localTicketGroups = localTicketGroups.filter((group) => !group.memberIds.some((id) => mergedSet.has(id)));
    localTicketGroups.push({ id: groupId, memberIds: mergedIds });

    const groupKey = getCardKeyForGroup(groupId);
    const targetIndex = manualTicketOrder.indexOf(targetKey);
    const nextOrder = manualTicketOrder.filter((key) => key !== sourceKey && key !== targetKey && key !== groupKey);
    nextOrder.splice(targetIndex >= 0 ? targetIndex : nextOrder.length, 0, groupKey);
    manualTicketOrder = nextOrder;
    selectedCustomerId = mergedIds.includes(selectedCustomerId) ? mergedIds[0] : selectedCustomerId;
    render(lastData || {});
    return true;
}

function ungroupLocalTicketGroup(groupId) {
    const group = getLocalTicketGroupById(groupId);
    if (!group) return false;
    const groupKey = getCardKeyForGroup(group.id);
    const insertIndex = manualTicketOrder.indexOf(groupKey);
    localTicketGroups = localTicketGroups.filter((entry) => entry.id !== group.id);
    const customerKeys = group.memberIds.map(getCardKeyForCustomer);
    const nextOrder = manualTicketOrder.filter((key) => key !== groupKey && !customerKeys.includes(key));
    nextOrder.splice(insertIndex >= 0 ? insertIndex : nextOrder.length, 0, ...customerKeys);
    manualTicketOrder = nextOrder;
    render(lastData || {});
    return true;
}

function moveLocalTicketCard(sourceTicket, targetTicket, position = 'before') {
    const sourceKey = getCardKeyFromTicket(sourceTicket);
    const targetKey = getCardKeyFromTicket(targetTicket);
    if (!sourceKey || !targetKey || sourceKey === targetKey) return false;
    ensureManualOrderSeed();
    const nextOrder = manualTicketOrder.filter((key) => key !== sourceKey);
    const targetIndex = nextOrder.indexOf(targetKey);
    if (targetIndex < 0) return false;
    nextOrder.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, sourceKey);
    manualTicketOrder = nextOrder;
    render(lastData || {});
    return true;
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

function buildPosCategoryHtml(customerEntry = null) {
    const menuHtml = buildStaffMenu(lastData, customerEntry).map((cat, index) => {
        const btns = cat.items.map((item) => {
            const image = getTroyMenuImage(cat.id, item);
            const thumb = image
                ? `<span class="troy-orders-pos-thumb"><img src="${escapeHtml(image)}" alt="" loading="lazy"></span>`
                : `<span class="troy-orders-pos-thumb is-emoji" aria-hidden="true">${escapeHtml(item.emoji || '•')}</span>`;
            return `
            <button type="button" class="troy-orders-pos-btn"
                data-add-item
                data-item-name="${escapeHtml(item.name)}"
                data-item-price="${item.price}"
                data-item-image="${escapeHtml(image)}"
                data-item-category="${escapeHtml(cat.id)}"
                data-item-category-label="${escapeHtml(cat.category)}">
                ${thumb}
                <span class="troy-orders-pos-copy">
                    <strong class="troy-orders-pos-name">${escapeHtml(item.name)}</strong>
                    ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ''}
                </span>
                <span class="troy-orders-pos-price">${formatYen(item.price)}</span>
            </button>`;
        }).join('');
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
            <summary>${CUSTOM_ORDER_ITEM_NAME}</summary>
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
        const itemName = String(item.name || '商品').trim();
        const quantityControls = orderId && !/^troy-entry:/u.test(orderId) && !/入店|チャージ/u.test(itemName)
            ? `<span class="troy-orders-quantity-control"><em>x${quantity}</em><button type="button" data-increment-item data-order-id="${escapeHtml(orderId)}" aria-label="${escapeHtml(itemName)}の数量を増やす">+</button></span>`
            : `<span class="troy-orders-quantity-control is-locked"><em>x${quantity}</em></span>`;
        return `
            <div class="troy-orders-item-row${served ? ' is-served' : ''}">
                <span>${escapeHtml(itemName)}</span>
                ${quantityControls}
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

function buildTicketDisplayCards(entries = []) {
    cleanupLocalTicketGroups(entries);
    const entryById = new Map(entries.map((entry) => [normalizeCustomerId(entry.playFabId), entry]));
    const groupedIds = new Set();
    localTicketGroups.forEach((group) => group.memberIds.forEach((id) => groupedIds.add(id)));

    const naturalCards = [];
    const renderedGroups = new Set();
    entries.forEach((entry) => {
        const id = normalizeCustomerId(entry.playFabId);
        const group = getLocalTicketGroupByCustomerId(id);
        if (group) {
            if (renderedGroups.has(group.id)) return;
            renderedGroups.add(group.id);
            const groupEntries = group.memberIds.map((memberId) => entryById.get(memberId)).filter(Boolean);
            if (groupEntries.length > 0) {
                naturalCards.push({
                    type: 'group',
                    key: getCardKeyForGroup(group.id),
                    groupId: group.id,
                    entries: groupEntries
                });
            }
            return;
        }
        if (!groupedIds.has(id)) {
            naturalCards.push({
                type: 'single',
                key: getCardKeyForCustomer(id),
                groupId: '',
                entries: [entry]
            });
        }
    });

    const byKey = new Map(naturalCards.map((card) => [card.key, card]));
    const orderedCards = manualTicketOrder.map((key) => byKey.get(key)).filter(Boolean);
    naturalCards.forEach((card) => {
        if (!orderedCards.some((entry) => entry.key === card.key)) orderedCards.push(card);
    });
    manualTicketOrder = manualTicketOrder.filter((key) => byKey.has(key));
    return orderedCards;
}

function renderTicketCard(card, index) {
    const entries = Array.isArray(card?.entries) ? card.entries : [];
    const entry = entries[0] || {};
    const groupMode = card?.type === 'group' && entries.length > 1;
    const total = entries.reduce((sum, row) => sum + getEntryTotal(row), 0);
    const totalItems = entries.reduce((sum, row) => sum + getEntryTotalItems(row), 0);
    const grantTotal = entries.reduce((sum, row) => sum + Math.max(0, Number(row.grantTotal || row.checkout?.grantTotal) || 0), 0);
    const checkout = getEntryCheckout(entry);
    const orderedAt = formatTime(Math.max(...entries.map(getEntrySortTime), 0) || checkout.lastOrderedAtMs || checkout.createdAtMs || entry.joinedAtMs);
    const items = entries.flatMap(getEntryItems);
    const pendingServeCount = getPendingServeCount(items);
    const hasOrder = total > 0 || totalItems > 0;
    const ticketState = hasOrder
        ? (pendingServeCount > 0 ? `未提供 ${pendingServeCount}` : '会計待ち')
        : '未入力';
    const customerIds = entries.map((row) => normalizeCustomerId(row.playFabId)).filter(Boolean);
    const displayName = groupMode ? formatGroupName(entries) : getCustomerDisplayName(entry);
    const meta = [
        groupMode ? `グループ ${entries.length}名` : '',
        entry.rankName || '',
        Number(entry.level) > 0 ? `Lv.${Math.floor(Number(entry.level))}` : '',
        orderedAt,
        grantTotal ? `付与済み ${grantTotal.toLocaleString('ja-JP')}G` : ''
    ].filter(Boolean).join(' / ');

    return `
        <div role="button" tabindex="0" class="troy-orders-ticket${customerIds.includes(selectedCustomerId) ? ' is-selected' : ''}${hasOrder ? ' has-order' : ''}${groupMode ? ' is-grouped' : ''} is-tilt-${index % 2 ? 'right' : 'left'}"
            data-open-ticket
            data-card-key="${escapeHtml(card.key || '')}"
            data-customer-id="${escapeHtml(entry.playFabId || '')}"
            data-customer-ids="${escapeHtml(customerIds.join('|'))}"
            ${groupMode ? `data-group-id="${escapeHtml(card.groupId || '')}"` : ''}>
            <span class="troy-orders-ticket-pin"></span>
            <span class="troy-orders-ticket-kicker">伝票 ${String(index + 1).padStart(2, '0')}</span>
            <span class="troy-orders-ticket-name">${escapeHtml(displayName)}</span>
            <span class="troy-orders-ticket-meta">${escapeHtml(meta || '店内滞在中')}</span>
            <span class="troy-orders-ticket-preview">${renderTicketPreviewItems(items)}</span>
            <span class="troy-orders-ticket-foot">
                <strong>${hasOrder ? formatYen(total) : '未入力'}</strong>
                <em>${escapeHtml(ticketState)}</em>
            </span>
            ${groupMode ? `<button type="button" class="troy-orders-group-ungroup" data-ungroup-ticket data-group-id="${escapeHtml(card.groupId || '')}">グループ解除</button>` : ''}
        </div>
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
    grid.innerHTML = buildTicketDisplayCards(entries).map(renderTicketCard).join('');
}

function renderCustomerOrderRequests(requests = []) {
    const panel = $('troyOrdersCustomerRequestsPanel');
    const list = $('troyOrdersCustomerRequests');
    const count = $('troyOrdersCustomerRequestsCount');
    if (!panel || !list) return;
    const rows = normalizeCustomerOrderRequests({ troyCustomerOrderRequests: requests });
    panel.hidden = rows.length === 0;
    if (count) count.textContent = `${rows.length}件`;
    if (!rows.length) {
        list.innerHTML = '';
        return;
    }
    list.innerHTML = rows.map((request) => {
        const processing = request.status === 'processing';
        const quantityLabel = request.quantity > 1 ? ` x${request.quantity}` : '';
        const imageHtml = request.menuImage
            ? `<span class="troy-orders-request-thumb"><img src="${escapeHtml(request.menuImage)}" alt="" loading="lazy"></span>`
            : '<span class="troy-orders-request-thumb is-empty"></span>';
        return `
            <article class="troy-orders-request${processing ? ' is-processing' : ''}" data-customer-order-request-id="${escapeHtml(request.requestId)}">
                ${imageHtml}
                <div class="troy-orders-request-main">
                    <strong>${escapeHtml(request.name)}${quantityLabel}</strong>
                    <span>${escapeHtml(request.displayName)} / ${escapeHtml(formatTime(request.createdAtMs) || '--:--')}</span>
                </div>
                <div class="troy-orders-request-total">${formatYen(request.lineTotal)}</div>
                <div class="troy-orders-request-actions">
                    <button type="button" data-review-customer-order="accept" ${processing ? 'disabled' : ''}>受付</button>
                    <button type="button" class="is-cancel" data-review-customer-order="reject" ${processing ? 'disabled' : ''}>取消</button>
                </div>
            </article>
        `;
    }).join('');
}

function findSelectedCustomer() {
    if (!selectedCustomerId) return null;
    return getCustomerEntries(lastData).find((entry) => entry.playFabId === selectedCustomerId) || null;
}

function getCustomerEntryById(playFabId) {
    const id = String(playFabId || '').trim();
    if (!id) return null;
    return getCustomerEntries(lastData).find((entry) => entry.playFabId === id) || null;
}

function getGroupCheckoutCandidates(currentId) {
    const id = String(currentId || '').trim();
    const localGroupIds = new Set((getLocalTicketGroupByCustomerId(id)?.memberIds || []).map(normalizeCustomerId));
    return sortCustomerEntries(getCustomerEntries(lastData))
        .filter((entry) => String(entry.playFabId || '').trim() !== id)
        .filter((entry) => !localGroupIds.has(normalizeCustomerId(entry.playFabId)))
        .filter((entry) => getEntryTotal(entry) > 0);
}

function buildGroupCheckoutHtml(entry) {
    const localGroup = getLocalGroupEntriesByCustomerId(entry.playFabId);
    const hasLocalGroup = localGroup.length > 1;
    const candidates = getGroupCheckoutCandidates(entry.playFabId);
    if (!hasLocalGroup && !candidates.length) return '';
    const localRows = hasLocalGroup ? localGroup.map((groupEntry) => {
        const total = getEntryTotal(groupEntry);
        const totalItems = getEntryTotalItems(groupEntry);
        const meta = [
            totalItems ? `${totalItems}点` : '',
            Number(groupEntry.level) > 0 ? `Lv.${Math.floor(Number(groupEntry.level))}` : '',
            groupEntry.rankName || ''
        ].filter(Boolean).join(' / ');
        return `
            <div class="troy-orders-group-current-row">
                <span>
                    <strong>${escapeHtml(groupEntry.displayName || groupEntry.playFabId || 'Player')}</strong>
                    <em>${escapeHtml(meta || '店内滞在中')}</em>
                </span>
                <b>${total > 0 ? formatYen(total) : '未入力'}</b>
            </div>`;
    }).join('') : '';
    const rows = candidates.map((candidate) => {
        const total = getEntryTotal(candidate);
        const totalItems = getEntryTotalItems(candidate);
        const meta = [
            totalItems ? `${totalItems}点` : '',
            Number(candidate.level) > 0 ? `Lv.${Math.floor(Number(candidate.level))}` : '',
            candidate.rankName || ''
        ].filter(Boolean).join(' / ');
        return `
            <label class="troy-orders-group-row">
                <input type="checkbox" data-group-checkout data-group-customer-id="${escapeHtml(candidate.playFabId || '')}">
                <span>
                    <strong>${escapeHtml(candidate.displayName || candidate.playFabId || 'Player')}</strong>
                    <em>${escapeHtml(meta || '会計待ち')}</em>
                </span>
                <b>${formatYen(total)}</b>
            </label>`;
    }).join('');
    return `
        <details class="troy-orders-group-settle"${hasLocalGroup ? ' open' : ''}>
            <summary>グループ会計</summary>
            <div class="troy-orders-group-body">
                <div class="troy-orders-group-total">
                    <span>合算</span>
                    <strong data-group-total>${formatYen(getEntryTotal(entry))}</strong>
                    <em data-group-count>1名</em>
                </div>
                ${hasLocalGroup ? `
                    <div class="troy-orders-group-current">
                        <div class="troy-orders-group-current-head">
                            <span>現在のグループ</span>
                            <button type="button" data-ungroup-ticket data-group-id="${escapeHtml(getLocalTicketGroupByCustomerId(entry.playFabId)?.id || '')}">グループ解除</button>
                        </div>
                        <div class="troy-orders-group-current-list">${localRows}</div>
                    </div>
                ` : ''}
                ${rows ? `<div class="troy-orders-group-list">${rows}</div>` : ''}
            </div>
        </details>`;
}

function getGroupSettleTargets(card) {
    if (!card) return [];
    const primaryId = String(card.dataset.receiverId || '').trim();
    const ids = [];
    const localGroup = getLocalTicketGroupByCustomerId(primaryId);
    if (localGroup) {
        localGroup.memberIds.forEach((id) => {
            if (id && !ids.includes(id)) ids.push(id);
        });
    } else if (primaryId) {
        ids.push(primaryId);
    }
    card.querySelectorAll('[data-group-checkout]:checked').forEach((input) => {
        const id = String(input.dataset.groupCustomerId || '').trim();
        if (id && !ids.includes(id)) ids.push(id);
    });
    return ids
        .map((id) => getCustomerEntryById(id))
        .filter((entry) => entry && getEntryTotal(entry) > 0);
}

function updateGroupCheckoutSummary(card) {
    if (!card) return;
    const targets = getGroupSettleTargets(card);
    const total = targets.reduce((sum, entry) => sum + getEntryTotal(entry), 0);
    const count = targets.length;
    const totalEl = card.querySelector('[data-group-total]');
    const countEl = card.querySelector('[data-group-count]');
    const settleButton = card.querySelector('[data-settle]');
    const headerTotalEl = card.querySelector('.troy-orders-total');
    if (totalEl) totalEl.textContent = formatYen(total);
    if (countEl) countEl.textContent = `${count}名`;
    if (headerTotalEl) headerTotalEl.textContent = formatYen(total);
    if (settleButton) {
        settleButton.textContent = count > 1 ? 'グループ会計・退店' : '会計・退店';
        settleButton.disabled = total <= 0;
    }
}

function renderTicketDetail() {
    const detail = $('troyOrdersTicketDetail');
    if (!detail) return;
    const entry = findSelectedCustomer();
    if (!entry) {
        closeTicketDetail();
        return;
    }
    const localGroupEntries = getLocalGroupEntriesByCustomerId(entry.playFabId);
    const detailEntries = localGroupEntries.length > 1 ? localGroupEntries : [entry];
    const groupMode = detailEntries.length > 1;
    const total = detailEntries.reduce((sum, row) => sum + getEntryTotal(row), 0);
    const totalItems = detailEntries.reduce((sum, row) => sum + getEntryTotalItems(row), 0);
    const checkout = getEntryCheckout(entry);
    const status = String(checkout.status || entry.status || 'open').trim().toLowerCase();
    const orderedAt = formatTime(Math.max(...detailEntries.map(getEntrySortTime), 0) || checkout.lastOrderedAtMs || checkout.createdAtMs || entry.joinedAtMs);
    const items = getEntryItems(entry);
    const pendingServeCount = detailEntries.reduce((sum, row) => sum + getPendingServeCount(getEntryItems(row)), 0);
    const itemRows = renderOrderItemRows(entry);
    const groupCheckoutHtml = buildGroupCheckoutHtml(entry);
    const displayName = groupMode ? formatGroupName(detailEntries) : getCustomerDisplayName(entry);
    const meta = [
        groupMode ? `グループ ${detailEntries.length}名` : (status === 'pending' ? '確認待ち' : '店内伝票'),
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
                    <h2 data-ticket-customer-name>${escapeHtml(displayName)}</h2>
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
                    ${groupCheckoutHtml}
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
                    ${buildPosCategoryHtml(entry)}
                </div>
            </div>
        </section>
    `;
    updateGroupCheckoutSummary(detail.querySelector('[data-receiver-id]'));
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
    const customerOrderRequests = normalizeCustomerOrderRequests(data);
    const customers = sortCustomerEntries(getCustomerEntries(data));
    if (selectedCustomerId && !customers.some((entry) => entry.playFabId === selectedCustomerId)) {
        selectedCustomerId = null;
        const modal = $('troyOrdersTicketModal');
        if (modal) modal.hidden = true;
        document.body.classList.remove('is-troy-ticket-open');
    }
    flashForNewOrders(entries);
    flashForNewCustomerOrderRequests(customerOrderRequests);
    renderCustomerOrderRequests(customerOrderRequests);
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

async function reviewCustomerOrderRequest(button) {
    if (!button || busy) return;
    const row = button.closest('[data-customer-order-request-id]');
    const requestId = String(row?.dataset.customerOrderRequestId || '').trim();
    const action = String(button.dataset.reviewCustomerOrder || '').trim();
    if (!requestId || !action) return;
    busy = true;
    row?.classList.add('is-processing');
    row?.querySelectorAll('button').forEach((entry) => { entry.disabled = true; });
    try {
        await callApiWithLoader('/api/troy-orders/customer-request-review', {
            ...getRequestedNationPayload(),
            requestId,
            action
        }, { isSilent: true, throwOnError: true });
        await refreshOrders({ silent: true, force: true });
        setMessage(action === 'accept' ? '注文を受付して伝票に追加しました。' : '注文を取消しました。');
    } catch (error) {
        console.warn('[troy-orders] customer request review failed:', error);
        setMessage(`未確認注文を処理できませんでした: ${error?.message || error}`, true);
        row?.classList.remove('is-processing');
        row?.querySelectorAll('button').forEach((entry) => { entry.disabled = false; });
    } finally {
        busy = false;
    }
}

async function settleFromCard(card) {
    if (!card || busy) return;
    const receiverId = String(card.dataset.receiverId || '').trim();
    const targets = getGroupSettleTargets(card);
    const expectedTotal = targets.reduce((sum, entry) => sum + getEntryTotal(entry), 0);
    const chipReturnInput = card.querySelector('[data-chip-return]');
    const chipReturnAmount = Math.max(0, Math.floor(Number(chipReturnInput?.value || 0) || 0));
    if (!receiverId || expectedTotal <= 0 || !targets.length) return;
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
        const groupRequestId = createRequestId(targets.length > 1 ? 'troy-orders-group-settle' : 'troy-orders-settle');
        for (const target of targets) {
            const targetId = String(target.playFabId || '').trim();
            if (!targetId) continue;
            await callApiWithLoader('/api/troy-orders/settle', {
                ...getRequestedNationPayload(),
                receiverPlayFabId: targetId,
                settlementRepresentativePlayFabId: receiverId,
                expectedTotal: getEntryTotal(target),
                requestId: `${groupRequestId}:${targetId}`,
                chipReturnAmount: targetId === receiverId ? chipReturnAmount : 0
            }, { isSilent: true, throwOnError: true });
        }
        await refreshOrders({ silent: true, force: true });
        setMessage(targets.length > 1 ? 'グループ会計と退店処理を完了しました。' : '会計と退店処理を完了しました。');
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
    const image = String(button.dataset.itemImage || '').trim();
    const menuCategory = String(button.dataset.itemCategory || '').trim();
    const menuCategoryLabel = String(button.dataset.itemCategoryLabel || '').trim();
    if (!name) return;
    button.disabled = true;
    try {
        await callApiWithLoader('/api/troy-orders/add-item', {
            ...getRequestedNationPayload(),
            receiverPlayFabId: selectedCustomerId,
            name,
            price,
            quantity: 1,
            image,
            menuImage: image,
            menuCategory,
            menuCategoryLabel
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
        setMessage(`${CUSTOM_ORDER_ITEM_NAME}の金額は100円単位で入力してください。`, true);
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
            quantity: 1,
            menuCategory: 'custom',
            menuCategoryLabel: CUSTOM_ORDER_ITEM_NAME
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

async function incrementItemQuantityFromButton(button) {
    if (!button || busy) return;
    const card = button.closest('[data-receiver-id]');
    const receiverId = String(card?.dataset.receiverId || '').trim();
    const orderId = String(button.dataset.orderId || '').trim();
    if (!receiverId || !orderId) return;
    busy = true;
    button.disabled = true;
    try {
        await callApiWithLoader('/api/troy-orders/item-quantity', {
            ...getRequestedNationPayload(),
            receiverPlayFabId: receiverId,
            orderId,
            delta: 1
        }, { isSilent: true, throwOnError: true });
        await refreshOrders({ silent: true, force: true });
    } catch (error) {
        console.warn('[troy-orders] quantity update failed:', error);
        setMessage(`数量を更新できませんでした: ${error?.message || error}`, true);
    } finally {
        busy = false;
        button.disabled = false;
    }
}

function renderConfirmOrderRowsForEntry(entry, { includeCustomer = false } = {}) {
    const items = getEntryItems(entry);
    const rows = [];
    if (includeCustomer) {
        rows.push(`
            <div class="troy-orders-confirm-customer-row">
                <span>${escapeHtml(entry.displayName || entry.playFabId || 'Player')}</span>
                <strong>${formatYen(getEntryTotal(entry))}</strong>
            </div>
        `);
    }
    if (!items.length) {
        rows.push('<div class="troy-orders-confirm-item-row is-empty"><span>注文はありません</span><strong>¥0</strong></div>');
        return rows.join('');
    }
    items.forEach((item) => {
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const lineTotal = Math.max(0, Math.floor(Number(item.lineTotal ?? ((Number(item.price) || 0) * quantity)) || 0));
        const itemName = String(item.name || '商品').trim();
        rows.push(`
            <div class="troy-orders-confirm-item-row">
                <span>
                    <b>${escapeHtml(itemName)}</b>
                    <em>x${quantity}</em>
                </span>
                <strong>${formatYen(lineTotal)}</strong>
            </div>
        `);
    });
    return rows.join('');
}

function buildPaymentPresetAmounts(total) {
    const normalizedTotal = Math.max(0, Math.floor(Number(total) || 0));
    if (normalizedTotal <= 0) return [];
    const amounts = new Set([normalizedTotal]);
    [1000, 5000, 10000].forEach((unit) => {
        const rounded = Math.ceil(normalizedTotal / unit) * unit;
        if (rounded >= normalizedTotal) amounts.add(rounded);
    });
    if (normalizedTotal > 10000) {
        amounts.add(Math.ceil(normalizedTotal / 10000) * 10000);
    }
    return [...amounts].sort((left, right) => left - right).slice(0, 4);
}

function setConfirmSubmitState() {
    const modal = $('troyOrdersConfirmModal');
    const check = $('troyOrdersConfirmCheck');
    const submit = $('troyOrdersConfirmSubmit');
    const input = $('troyOrdersReceivedAmount');
    const changeEl = $('troyOrdersChangeAmount');
    const noteEl = $('troyOrdersPaymentNote');
    if (!modal || !submit) return;

    const total = Math.max(0, Math.floor(Number(modal.dataset.total || 0) || 0));
    const raw = String(input?.value || '').trim();
    const received = Math.max(0, Math.floor(Number(raw) || 0));
    const hasReceived = raw !== '';
    const shortage = hasReceived && received < total;
    const exact = hasReceived && received === total;
    const change = hasReceived && received >= total ? received - total : 0;

    if (changeEl) {
        changeEl.classList.toggle('is-shortage', shortage);
        changeEl.classList.toggle('is-ready', hasReceived && !shortage);
        changeEl.textContent = !hasReceived
            ? '-'
            : shortage
                ? `不足 ${formatYen(total - received)}`
                : formatYen(change);
    }
    if (noteEl) {
        noteEl.classList.toggle('is-shortage', shortage);
        noteEl.textContent = !hasReceived
            ? '預かり金額を入力してください'
            : shortage
                ? `あと ${formatYen(total - received)} 不足しています`
                : exact
                    ? 'ちょうどです'
                    : `${formatYen(change)} をお返しします`;
    }
    submit.disabled = !check?.checked || !hasReceived || shortage;
}

function openConfirmModal(card) {
    pendingSettleCard = card;
    const modal = $('troyOrdersConfirmModal');
    if (!modal || !card) return;
    const targets = getGroupSettleTargets(card);
    const groupMode = targets.length > 1;
    const primaryName = card.querySelector('[data-ticket-customer-name]')?.textContent || card.querySelector('h2')?.textContent || card.dataset.receiverId || '-';
    const name = groupMode ? `グループ会計（${targets.length}名）` : primaryName;
    const total = targets.reduce((sum, entry) => sum + getEntryTotal(entry), 0);
    const chipReturnAmount = Math.max(0, Math.floor(Number(card.querySelector('[data-chip-return]')?.value || 0) || 0));
    const itemRows = targets.map((entry) => renderConfirmOrderRowsForEntry(entry, { includeCustomer: groupMode }));
    if (chipReturnAmount > 0) {
        itemRows.push(`<div class="troy-orders-confirm-chip-row"><span>チップ返却</span><strong>${escapeHtml(formatGold(chipReturnAmount))}</strong></div>`);
    }
    $('troyOrdersConfirmName').textContent = name;
    $('troyOrdersConfirmTotal').textContent = formatYen(total);
    $('troyOrdersConfirmItems').innerHTML = itemRows.join('');
    modal.dataset.total = String(total);
    const input = $('troyOrdersReceivedAmount');
    if (input) input.value = '';
    const presets = $('troyOrdersPaymentPresets');
    if (presets) {
        presets.innerHTML = buildPaymentPresetAmounts(total)
            .map((amount, index) => `<button type="button" data-payment-preset="${amount}">${index === 0 ? 'ちょうど' : formatYen(amount)}</button>`)
            .join('');
    }
    const check = $('troyOrdersConfirmCheck');
    if (check) check.checked = false;
    setConfirmSubmitState();
    modal.hidden = false;
    requestAnimationFrame(() => input?.focus?.());
}

function closeConfirmModal() {
    pendingSettleCard = null;
    const modal = $('troyOrdersConfirmModal');
    if (modal) modal.hidden = true;
    if (modal) delete modal.dataset.total;
}

function getTicketDropMode(targetTicket, pointerX) {
    if (!targetTicket) return '';
    const rect = targetTicket.getBoundingClientRect();
    const edge = Math.min(58, rect.width * 0.24);
    if (pointerX <= rect.left + edge) return 'before';
    if (pointerX >= rect.right - edge) return 'after';
    return 'group';
}

function clearTicketDropHints() {
    document.querySelectorAll('.troy-orders-ticket.is-drop-group, .troy-orders-ticket.is-drop-before, .troy-orders-ticket.is-drop-after')
        .forEach((ticket) => ticket.classList.remove('is-drop-group', 'is-drop-before', 'is-drop-after'));
}

function updateTicketDropHint(targetTicket, mode) {
    clearTicketDropHints();
    if (!targetTicket || !mode) return;
    targetTicket.classList.add(mode === 'group' ? 'is-drop-group' : `is-drop-${mode}`);
}

function clearTicketDragState() {
    if (ticketDragState?.source) {
        ticketDragState.source.classList.remove('is-dragging');
        ticketDragState.source.style.transform = '';
        ticketDragState.source.style.pointerEvents = '';
    }
    document.body.classList.remove('is-troy-ticket-dragging');
    clearTicketDropHints();
    ticketDragState = null;
}

function startTicketDrag(event) {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-ungroup-ticket]')) return;
    const source = event.target.closest('[data-open-ticket]');
    if (!source || !source.isConnected) return;
    ticketDragState = {
        source,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        active: false
    };
    source.setPointerCapture?.(event.pointerId);
}

function moveTicketDrag(event) {
    if (!ticketDragState) return;
    const dx = event.clientX - ticketDragState.startX;
    const dy = event.clientY - ticketDragState.startY;
    ticketDragState.lastX = event.clientX;
    ticketDragState.lastY = event.clientY;
    if (!ticketDragState.active && Math.hypot(dx, dy) < 10) return;
    if (!ticketDragState.active) {
        ticketDragState.active = true;
        suppressNextTicketClick = true;
        ticketDragState.source.classList.add('is-dragging');
        ticketDragState.source.style.pointerEvents = 'none';
        document.body.classList.add('is-troy-ticket-dragging');
    }
    ticketDragState.source.style.transform = `translate(${dx}px, ${dy}px) rotate(0deg)`;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const targetTicket = hit instanceof Element ? hit.closest('[data-open-ticket]') : null;
    if (!targetTicket || targetTicket === ticketDragState.source) {
        updateTicketDropHint(null, '');
        return;
    }
    updateTicketDropHint(targetTicket, getTicketDropMode(targetTicket, event.clientX));
    event.preventDefault();
}

function finishTicketDrag(event) {
    if (!ticketDragState) return;
    const state = ticketDragState;
    const wasActive = state.active;
    state.source.style.pointerEvents = 'none';
    const hit = document.elementFromPoint(state.lastX, state.lastY);
    const targetTicket = hit instanceof Element ? hit.closest('[data-open-ticket]') : null;
    if (wasActive && targetTicket && targetTicket !== state.source) {
        const mode = getTicketDropMode(targetTicket, state.lastX);
        if (mode === 'group') {
            mergeLocalTicketGroups(state.source, targetTicket);
        } else {
            moveLocalTicketCard(state.source, targetTicket, mode);
        }
    }
    clearTicketDragState();
    if (wasActive) {
        event.preventDefault();
        window.setTimeout(() => { suppressNextTicketClick = false; }, 0);
    }
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
            manualTicketOrder = [];
            render(lastData || {});
        });
    }
    $('troyOrdersRefresh')?.addEventListener('click', () => refreshOrders({ silent: false }));
    $('troyOrdersOpenBtn')?.addEventListener('click', () => setTroyOpen(true));
    $('troyOrdersCloseBtn')?.addEventListener('click', () => setTroyOpen(false));
    $('troyOrdersCustomerRequests')?.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-review-customer-order]') : null;
        if (!target) return;
        void reviewCustomerOrderRequest(target);
    });
    const ticketGrid = $('troyOrdersTicketGrid');
    ticketGrid?.addEventListener('pointerdown', startTicketDrag);
    ticketGrid?.addEventListener('pointermove', moveTicketDrag);
    ticketGrid?.addEventListener('pointerup', finishTicketDrag);
    ticketGrid?.addEventListener('pointercancel', finishTicketDrag);
    ticketGrid?.addEventListener('click', (event) => {
        if (suppressNextTicketClick) {
            suppressNextTicketClick = false;
            event.preventDefault();
            return;
        }
        const target = event.target instanceof Element ? event.target : null;
        const ungroupButton = target?.closest('[data-ungroup-ticket]');
        if (ungroupButton) {
            event.preventDefault();
            ungroupLocalTicketGroup(ungroupButton.dataset.groupId || '');
            return;
        }
        const ticket = event.target instanceof Element ? event.target.closest('[data-open-ticket]') : null;
        if (!ticket) return;
        openTicketDetail(ticket.dataset.customerId || '');
    });
    ticketGrid?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.target instanceof Element && event.target.closest('[data-ungroup-ticket]')) return;
        const ticket = event.target instanceof Element ? event.target.closest('[data-open-ticket]') : null;
        if (!ticket) return;
        event.preventDefault();
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
        const incrementButton = target?.closest('[data-increment-item]');
        if (incrementButton) {
            void incrementItemQuantityFromButton(incrementButton);
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
        const ungroupButton = target?.closest('[data-ungroup-ticket]');
        if (ungroupButton) {
            ungroupLocalTicketGroup(ungroupButton.dataset.groupId || '');
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
            return;
        }
        if (target?.matches('[data-group-checkout]')) {
            updateGroupCheckoutSummary(target.closest('[data-receiver-id]'));
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !$('troyOrdersTicketModal')?.hidden) closeTicketDetail();
    });
    $('troyOrdersConfirmCancel')?.addEventListener('click', closeConfirmModal);
    $('troyOrdersConfirmCheck')?.addEventListener('change', () => {
        setConfirmSubmitState();
    });
    $('troyOrdersReceivedAmount')?.addEventListener('input', setConfirmSubmitState);
    $('troyOrdersPaymentPresets')?.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-payment-preset]') : null;
        if (!target) return;
        const input = $('troyOrdersReceivedAmount');
        if (input) input.value = String(Math.max(0, Math.floor(Number(target.dataset.paymentPreset) || 0)));
        setConfirmSubmitState();
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
