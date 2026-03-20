// c:/Users/ikeda/my-liff-app/public/js/troy.js

import {
    getTroyStatus,
    joinTroy,
    sendTroyOrder,
    undoTroyLastOrder
} from './playfabClient.js';
import { getFirestore, doc, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { isKing, refreshKingNav, loadKingPage } from './nationKing.js';
import { decoratePlayerTriggerElement } from './playerProfile.js';

let _wired = false;
let _menuWired = false;
let _lastStatus = null;
let _checkoutSession = null;
let _menuActiveId = 'nonalcohol';
const _menuQtyByKey = new Map();
const _menuOptionByKey = new Map();
let _undoCountdownTimerId = 0;
let _favoriteDrinkEntries = [];
let _pendingAutoLeaveNotice = false;
let _pendingAutoLeaveTimerId = 0;
let _statusRoomUnsubscribe = null;
let _statusMembersUnsubscribe = null;
let _statusCheckoutUnsubscribe = null;
let _statusSnapshotState = {
    nation: null,
    isOpen: false,
    members: [],
    checkout: null
};

const TROY_MENU_IDS = ['favorite', 'nonalcohol', 'alcohol', 'food', 'points'];
const TROY_FAVORITES_STORAGE_PREFIX = 'troy-favorite-drinks:';
const TROY_GROUP_BY_NATION = {
    fire: 'nation_fire_island',
    earth: 'nation_earth_island',
    wind: 'nation_wind_island',
    water: 'nation_water_island'
};

const TROY_SPIRIT_MIXER_OPTIONS = ['コーラ', 'トニック', 'ジンジャー', 'ソーダ'];

function buildTroyItemSpritePath(fileName) {
    const normalized = String(fileName || '').trim();
    if (!normalized) return '';
    return `./Sprites/items/Food/${encodeURIComponent(normalized)}`;
}

const TROY_PRODUCT_MENUS = {
    drinks: {
        title: 'ドリンク',
        items: []
    },
    appetizer: {
        title: '貯蔵品 (軽いおつまみ)',
        items: []
    },
    dryfood: {
        title: '略奪品 (乾きもの)',
        items: [
            { concept: '船室のチョコ片', content: 'チョコ', price: 500, image: 'https://loremflickr.com/640/420/chocolate?lock=5147', emoji: '🍫', iconImage: buildTroyItemSpritePath('Dark Chocolate Bar.png') },
            { concept: '航海士のミックスナッツ', content: 'ミックスナッツ', price: 500, image: 'https://loremflickr.com/640/420/mixed,nuts?lock=5148', emoji: '🥜', iconImage: buildTroyItemSpritePath('Cashew.png') }
        ]
    },
    hotfood: {
        title: '船上の宴 (温かい料理)',
        items: [
            { concept: '黄金ポテト', content: 'フライドポテト', price: 500, image: 'https://loremflickr.com/640/420/french,fries?lock=5106', emoji: '🍟', iconImage: buildTroyItemSpritePath('Fries.png') },
            { concept: '海賊肉ナゲット', content: 'チキンナゲット', price: 500, image: 'https://loremflickr.com/640/420/chicken,nuggets?lock=5142', emoji: '🍗', iconImage: buildTroyItemSpritePath('Chicken Nuggets.png') },
            { concept: '甲板のピザパン', content: 'ピザトースト', price: 500, image: 'https://loremflickr.com/640/420/pizza,toast?lock=5143', emoji: '🍞', iconImage: buildTroyItemSpritePath('Pizza Cracker.png') },
            { concept: 'クラーケンの足', content: 'フランクフルト', price: 500, image: 'https://loremflickr.com/640/420/frankfurt,sausage?lock=5144', emoji: '🐙', iconImage: buildTroyItemSpritePath('Cooked Sausage.png') },
            { concept: '人魚のワッフル', content: 'ワッフル', price: 500, image: 'https://loremflickr.com/640/420/waffle?lock=5145', emoji: '🧇', iconImage: buildTroyItemSpritePath('Waffle.png') },
            { concept: '港のチュロス', content: 'チュロス', price: 500, image: 'https://loremflickr.com/640/420/churros?lock=5146', emoji: '🥨', iconImage: buildTroyItemSpritePath('Churro.png') },
            { concept: '夜更けの甲板ヌードル', content: 'カップラーメン', price: 500, image: 'https://loremflickr.com/640/420/cup,noodle?lock=5149', emoji: '🍜', iconImage: buildTroyItemSpritePath('Take Out.png') }
        ]
    },
    main: {
        title: '腹の糧 (主食)',
        items: []
    },
    points: {
        title: 'ポイント',
        items: [
            { concept: '600Ps', content: 'ポイント購入', price: 5000, image: 'https://loremflickr.com/640/420/coin?lock=5112' },
            { concept: '350Ps', content: 'ポイント購入', price: 3000, image: 'https://loremflickr.com/640/420/coin?lock=5113' },
            { concept: '100Ps', content: 'ポイント購入', price: 1000, image: 'https://loremflickr.com/640/420/coin?lock=5114' }
        ]
    }
};

const TROY_DAY_CAFE_DRINK_ITEMS = [
    { concept: '船長のブレンド', content: 'ホットコーヒー', price: 500, image: 'https://loremflickr.com/640/420/coffee?lock=5121' },
    { concept: '見張り台の一杯', content: 'アイスコーヒー', price: 500, image: 'https://loremflickr.com/640/420/iced,coffee?lock=5122' },
    { concept: '王室の茶会', content: 'ストレートティー', price: 500, image: 'https://loremflickr.com/640/420/tea?lock=5123' },
    { concept: '潮風ミルクティー', content: 'ロイヤルミルクティー', price: 500, image: 'https://loremflickr.com/640/420/milk,tea?lock=5124' },
    { concept: '港町ラテ', content: 'カフェラテ', price: 500, image: 'https://loremflickr.com/640/420/latte?lock=5125' },
    { concept: '宝箱ココア', content: 'ホットココア', price: 500, image: 'https://loremflickr.com/640/420/cocoa?lock=5126' }
];

const TROY_NON_ALCOHOL_EXTRA_ITEMS = [
    { concept: 'ソフトコーラ', content: 'コーラ', price: 500, image: 'https://loremflickr.com/640/420/cola?lock=5137', emoji: '🥤' },
    { concept: '港のジンジャー', content: 'ジンジャーエール', price: 500, image: 'https://loremflickr.com/640/420/ginger,ale?lock=5138', emoji: '🥤' },
    { concept: 'ノンアルコールビール', content: '瓶', price: 600, image: 'https://loremflickr.com/640/420/nonalcoholic,beer?lock=5140', emoji: '🍺' }
];

const TROY_ALCOHOL_ITEMS = [
    { concept: 'ラム', content: '割り物を選択', price: 500, mixers: TROY_SPIRIT_MIXER_OPTIONS, emoji: '🥃' },
    { concept: 'ウォッカ', content: '割り物を選択', price: 500, mixers: TROY_SPIRIT_MIXER_OPTIONS, emoji: '🥃' },
    { concept: 'テキーラ', content: '割り物を選択', price: 500, mixers: TROY_SPIRIT_MIXER_OPTIONS, emoji: '🥃' },
    { concept: 'ジン', content: '割り物を選択', price: 500, mixers: TROY_SPIRIT_MIXER_OPTIONS, emoji: '🥃' },
    { concept: 'リキュール', content: '割り物を選択', price: 500, mixers: TROY_SPIRIT_MIXER_OPTIONS, emoji: '🍸' },
    { concept: 'ビール', content: 'ジョッキ', price: 800, image: 'https://loremflickr.com/640/420/beer?lock=5141', emoji: '🍺' },
    { concept: 'ワインボトル', content: 'ボトル', price: 3000, image: 'https://loremflickr.com/640/420/wine,bottle?lock=5139', emoji: '🍷' }
];

function getNonAlcoholDrinkMenuData() {
    return {
        title: 'ノンアル',
        items: [...TROY_DAY_CAFE_DRINK_ITEMS, ...TROY_NON_ALCOHOL_EXTRA_ITEMS]
    };
}

function getAlcoholDrinkMenuData() {
    return {
        title: 'アルコール',
        items: TROY_ALCOHOL_ITEMS
    };
}

function isDrinkMenuId(menuId, item = null) {
    const sourceMenuId = String(menuId === 'favorite' ? (item?.menuId || '') : (menuId || '')).trim();
    return sourceMenuId === 'nonalcohol' || sourceMenuId === 'alcohol';
}

function buildFavoriteDrinkId(menuId, item, optionLabel = '') {
    const sourceMenuId = String(menuId === 'favorite' ? (item?.menuId || '') : (menuId || '')).trim();
    const concept = String(item?.concept || item?.name || '').trim().toLowerCase();
    const price = parseYenPrice(item?.price);
    const option = String(optionLabel || item?.optionLabel || '').trim().toLowerCase();
    return `${sourceMenuId}:${concept}:${price}:${option}`;
}

function sanitizeFavoriteDrinkEntry(entry = {}) {
    const menuId = String(entry?.menuId || '').trim();
    const concept = String(entry?.concept || entry?.name || '').trim();
    const price = parseYenPrice(entry?.price);
    if (!isDrinkMenuId(menuId) || !concept || !price) return null;
    const optionLabel = String(entry?.optionLabel || '').trim();
    return {
        favoriteId: String(entry?.favoriteId || buildFavoriteDrinkId(menuId, entry, optionLabel)).trim(),
        menuId,
        concept,
        content: String(entry?.content || '').trim(),
        price,
        image: String(entry?.image || '').trim(),
        emoji: String(entry?.emoji || '').trim(),
        iconImage: String(entry?.iconImage || '').trim(),
        optionLabel,
        savedAtMs: Math.max(0, Math.floor(Number(entry?.savedAtMs) || Date.now()))
    };
}

function getFavoriteStorageKey(playFabId = window.myPlayFabId) {
    const memberId = normalizePlayFabId(playFabId || '');
    return `${TROY_FAVORITES_STORAGE_PREFIX}${memberId || 'guest'}`;
}

function saveFavoriteDrinkEntries(playFabId = window.myPlayFabId) {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
        window.localStorage.setItem(getFavoriteStorageKey(playFabId), JSON.stringify(_favoriteDrinkEntries));
    } catch (error) {
        console.warn('[TroyFavorites] Save failed:', error);
    }
}

function loadFavoriteDrinkEntries(playFabId = window.myPlayFabId) {
    if (typeof window === 'undefined' || !window.localStorage) {
        _favoriteDrinkEntries = [];
        return;
    }
    try {
        const raw = window.localStorage.getItem(getFavoriteStorageKey(playFabId));
        const parsed = raw ? JSON.parse(raw) : [];
        _favoriteDrinkEntries = (Array.isArray(parsed) ? parsed : [])
            .map((entry) => sanitizeFavoriteDrinkEntry(entry))
            .filter(Boolean)
            .sort((a, b) => b.savedAtMs - a.savedAtMs);
    } catch (error) {
        console.warn('[TroyFavorites] Load failed:', error);
        _favoriteDrinkEntries = [];
    }
}

function buildFavoriteDrinkEntry(menuId, item, optionLabel = '') {
    const sourceMenuId = String(menuId === 'favorite' ? (item?.menuId || '') : (menuId || '')).trim();
    const normalizedOption = String(optionLabel || item?.optionLabel || '').trim();
    return sanitizeFavoriteDrinkEntry({
        favoriteId: buildFavoriteDrinkId(sourceMenuId, item, normalizedOption),
        menuId: sourceMenuId,
        concept: String(item?.concept || item?.name || '').trim(),
        content: normalizedOption
            ? `割り物: ${normalizedOption}`
            : String(item?.content || '').trim(),
        price: parseYenPrice(item?.price),
        image: item?.image,
        emoji: item?.emoji || getMenuItemEmoji(item),
        iconImage: item?.iconImage || '',
        optionLabel: normalizedOption,
        savedAtMs: Date.now()
    });
}

function isFavoriteDrink(menuId, item, optionLabel = '') {
    const favoriteId = buildFavoriteDrinkId(menuId, item, optionLabel);
    return !!favoriteId && _favoriteDrinkEntries.some((entry) => entry.favoriteId === favoriteId);
}

function toggleFavoriteDrink(menuId, item, optionLabel = '') {
    if (!isDrinkMenuId(menuId, item)) return false;
    const entry = buildFavoriteDrinkEntry(menuId, item, optionLabel);
    if (!entry?.favoriteId) return false;
    const existingIndex = _favoriteDrinkEntries.findIndex((row) => row.favoriteId === entry.favoriteId);
    if (existingIndex >= 0) {
        _favoriteDrinkEntries.splice(existingIndex, 1);
        saveFavoriteDrinkEntries();
        return false;
    }
    _favoriteDrinkEntries = [entry, ..._favoriteDrinkEntries].slice(0, 24);
    saveFavoriteDrinkEntries();
    return true;
}

function getFavoriteDrinkMenuData() {
    return {
        title: 'いつもの',
        items: _favoriteDrinkEntries.map((entry) => ({ ...entry }))
    };
}

function getFoodMenuData() {
    return {
        title: 'フード',
        items: [
            ...TROY_PRODUCT_MENUS.appetizer.items,
            ...TROY_PRODUCT_MENUS.dryfood.items,
            ...TROY_PRODUCT_MENUS.hotfood.items,
            ...TROY_PRODUCT_MENUS.main.items
        ]
    };
}

function getMenuDataById(menuId) {
    switch (menuId) {
        case 'favorite':
            return getFavoriteDrinkMenuData();
        case 'nonalcohol':
            return getNonAlcoholDrinkMenuData();
        case 'alcohol':
            return getAlcoholDrinkMenuData();
        case 'food':
            return getFoodMenuData();
        default:
            return TROY_PRODUCT_MENUS[menuId];
    }
}

function getMenuCategoryList() {
    return TROY_MENU_IDS
        .map((id) => ({ id, data: getMenuDataById(id) }))
        .filter((entry) => !!entry.data)
        .map((entry) => ({ id: entry.id, title: entry.data.title }));
}

function getMenuItemKey(menuId, item, index) {
    return `${menuId}:${index}:${item?.concept || ''}:${item?.content || ''}`;
}

function getMenuItemOption(menuId, item, index) {
    if (!Array.isArray(item?.mixers) || !item.mixers.length) return '';
    const key = getMenuItemKey(menuId, item, index);
    const current = String(_menuOptionByKey.get(key) || '').trim();
    return item.mixers.includes(current) ? current : item.mixers[0];
}

function setMenuItemOption(menuId, item, index, value) {
    if (!Array.isArray(item?.mixers) || !item.mixers.length) return '';
    const key = getMenuItemKey(menuId, item, index);
    const normalized = item.mixers.includes(String(value || '').trim()) ? String(value).trim() : item.mixers[0];
    _menuOptionByKey.set(key, normalized);
    return normalized;
}

function getMenuItemQty(menuId, item, index) {
    const key = getMenuItemKey(menuId, item, index);
    const value = Number(_menuQtyByKey.get(key));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function setMenuItemQty(menuId, item, index, qty) {
    const key = getMenuItemKey(menuId, item, index);
    const next = Math.max(1, Math.floor(Number(qty) || 1));
    _menuQtyByKey.set(key, next);
    return next;
}

function setTopMenuCategoryState(activeId) {
    const menuButtons = Array.from(document.querySelectorAll('.troy-menu-item-button[data-menu-id]'));
    menuButtons.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.menuId === activeId);
    });
}

function getMenuModalElements() {
    return {
        modal: document.getElementById('troyMenuModal'),
        title: document.getElementById('troyMenuModalTitle'),
        categories: document.getElementById('troyMenuModalCategories'),
        subnote: document.getElementById('troyMenuModalSubnote'),
        list: document.getElementById('troyMenuModalList'),
        close: document.getElementById('troyMenuModalClose'),
        card: document.querySelector('#troyMenuModal .troy-menu-modal-card')
    };
}

function isTroyMember(status, playFabId) {
    const members = status?.members;
    if (!Array.isArray(members) || !playFabId) return false;
    const target = String(playFabId).toLowerCase();
    return members.some((member) => String(member?.playFabId || member?.id || '').toLowerCase() === target);
}

function updateOrderAvailability() {
    updateCheckoutStatus();
}

function updateTroyRoleUI() {
    const kingControls = document.getElementById('troyKingControls');
    const menuSection = document.getElementById('troyMenuSection');
    const isKingUser = isKing();

    if (kingControls) {
        kingControls.style.display = isKingUser ? 'block' : 'none';
    }
    if (menuSection) {
        menuSection.style.display = 'block';
    }
}

function formatYen(value) {
    const amount = Number(value) || 0;
    return `¥${amount.toLocaleString('ja-JP')}`;
}

function updatePointsDisplays(points) {
    const value = Number(points);
    if (!Number.isFinite(value)) return;
    const currentPointsEl = document.getElementById('currentPoints');
    if (currentPointsEl) currentPointsEl.innerText = String(value);
    const globalPointsEl = document.getElementById('globalPoints');
    if (globalPointsEl) globalPointsEl.innerText = String(value);
}

function parseYenPrice(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
    const raw = String(value || '').replace(/[^\d]/g, '');
    const amount = Number(raw);
    return Number.isFinite(amount) ? amount : 0;
}

function getMenuItemEmoji(item) {
    const text = `${item?.concept || ''} ${item?.content || ''}`;
    if (text.includes('ラム') || text.includes('ウォッカ') || text.includes('テキーラ') || text.includes('ジン')) return '🥃';
    if (text.includes('リキュール')) return '🍸';
    if (text.includes('ワインボトル')) return '🍷';
    if (text.includes('ポイント購入') || text.includes('Ps')) return '🪙';
    if (text.includes('コーヒー') || text.includes('ラテ') || text.includes('ココア')) return '☕';
    if (text.includes('ティー') || text.includes('紅茶')) return '🫖';
    if (text.includes('ワイン')) return '🍷';
    if (text.includes('ラムコーク') || text.includes('ハイボール') || text.includes('サワー') || text.includes('ジントニック') || text.includes('モヒート')) return '🍹';
    if (text.includes('コーラ') || text.includes('ジンジャー')) return '🥤';
    if (text.includes('ナッツ')) return '🥜';
    if (text.includes('チョコ')) return '🍫';
    if (text.includes('ドライフルーツ')) return '🍍';
    if (text.includes('オリーブ') || text.includes('ピクルス')) return '🫒';
    if (text.includes('ジャーキー')) return '🥩';
    if (text.includes('ポテト')) return '🍟';
    if (text.includes('チーズ')) return '🧀';
    if (text.includes('ソーセージ')) return '🌭';
    if (text.includes('ピザ')) return '🍕';
    if (text.includes('サーディン')) return '🐟';
    if (text.includes('パスタ')) return '🍝';
    if (text.includes('リゾット')) return '🥘';
    if (text.includes('ライス')) return '🍚';
    if (text.includes('カレー')) return '🍛';
    return '🍽️';
}

function getMenuItemHeroImage(item) {
    return String(item?.iconImage || '').trim();
}

function setTroyMenuHeroLoaded(hero, loaded) {
    if (!hero) return;
    hero.classList.toggle('has-image', loaded === true);
}

function getMenuSubnote(menuId) {
    switch (menuId) {
        case 'favorite':
            return '★ お気に入り登録したドリンクだけを並べています。割り物を指定した注文は、その組み合わせのまま呼び出せます。';
        case 'nonalcohol':
            return '🥤 ノンアルは500円中心。ノンアルコールビールは600円です。注文ごとにPSが付与され、支払いは最後にまとめます。';
        case 'alcohol':
            return '🍸 ベース酒は500円。ビール800円、ワインボトル3000円です。注文ごとにPSが付与され、支払いは最後にまとめます。';
        case 'food':
            return '🍴 フードはすべて500円。数量を選んでそのまま注文できます。PSは注文時に付与されます。';
        case 'points':
            return '🪙 ポイント購入も商品ごとに個別送信されます。PSは注文時に付与されます。';
        default:
            return '🍴 数量を選んでそのまま注文できます。PSは注文時に付与、支払いは最後にまとめます。';
    }
}

function getOrderItemName(item, optionLabel = '') {
    if (optionLabel) return `${item?.concept || item?.name || '商品'} × ${optionLabel}`;
    return item?.content ? `${item.concept} (${item.content})` : (item?.concept || item?.name || '商品');
}

function normalizeCheckoutItems(items = []) {
    return (Array.isArray(items) ? items : [])
        .map((item) => {
            const name = String(item?.name || item?.itemName || '').trim();
            const quantity = Math.max(1, Math.floor(Number(item?.quantity) || 1));
            const price = Math.max(0, Math.floor(Number(item?.price) || 0));
            if (!name || !price) return null;
            return {
                name,
                quantity,
                price,
                grantedPs: Math.max(0, Math.floor(Number(item?.grantedPs) || 0)),
                cashbackRateBps: Math.max(0, Math.floor(Number(item?.cashbackRateBps) || 0)),
                orderId: String(item?.orderId || '').trim(),
                orderedAtMs: Math.max(0, Math.floor(Number(item?.orderedAtMs) || 0)),
                undoUntilMs: Math.max(0, Math.floor(Number(item?.undoUntilMs) || 0)),
                lineTotal: Math.max(0, Math.floor(Number(item?.lineTotal) || (price * quantity)))
            };
        })
        .filter(Boolean);
}

function sanitizeCheckoutSession(checkout = null) {
    if (!checkout || typeof checkout !== 'object') return null;
    const items = normalizeCheckoutItems(checkout.items);
    const status = String(checkout.status || '').trim().toLowerCase();
    return {
        status,
        total: Math.max(0, Math.floor(Number(checkout.total) || items.reduce((sum, item) => sum + item.lineTotal, 0))),
        totalItems: Math.max(0, Math.floor(Number(checkout.totalItems) || items.reduce((sum, item) => sum + item.quantity, 0))),
        grantTotal: Math.max(0, Math.floor(Number(checkout.grantTotal) || items.reduce((sum, item) => sum + item.grantedPs, 0))),
        items,
        createdAt: toMillis(checkout.createdAt),
        updatedAt: toMillis(checkout.updatedAt),
        lastOrderedAt: toMillis(checkout.lastOrderedAt)
    };
}

function clearUndoCountdownTimer() {
    if (_undoCountdownTimerId) {
        clearTimeout(_undoCountdownTimerId);
        _undoCountdownTimerId = 0;
    }
}

function clearPendingAutoLeaveNotice() {
    _pendingAutoLeaveNotice = false;
    if (_pendingAutoLeaveTimerId) {
        clearTimeout(_pendingAutoLeaveTimerId);
        _pendingAutoLeaveTimerId = 0;
    }
}

function schedulePendingAutoLeaveNotice() {
    clearPendingAutoLeaveNotice();
    _pendingAutoLeaveNotice = true;
    _pendingAutoLeaveTimerId = window.setTimeout(() => {
        _pendingAutoLeaveNotice = false;
        _pendingAutoLeaveTimerId = 0;
    }, 1500);
}

function formatUndoCountdown(ms) {
    const totalSeconds = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = `${totalSeconds % 60}`.padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function getUndoEligibleLastOrder(checkout = _checkoutSession, nowMs = Date.now()) {
    const session = sanitizeCheckoutSession(checkout);
    if (String(session?.status || '') !== 'open') return null;
    const lastItem = Array.isArray(session?.items) ? session.items[session.items.length - 1] : null;
    if (!lastItem) return null;
    if (!lastItem.orderId || !lastItem.undoUntilMs || nowMs > lastItem.undoUntilMs) return null;
    if (String(lastItem.name || '').trim() === '入店チャージ') return null;
    return lastItem;
}

function renderOpenTabCard() {
    const metaEl = document.getElementById('troyOpenTabMeta');
    const listEl = document.getElementById('troyOpenTabList');
    const undoBtn = document.getElementById('btnTroyUndoLastOrder');
    if (!metaEl || !listEl || !undoBtn) return;

    clearUndoCountdownTimer();
    const session = sanitizeCheckoutSession(_checkoutSession);
    const checkoutStatus = String(session?.status || '').trim().toLowerCase();
    const hasOpenTab = (checkoutStatus === 'open' || checkoutStatus === 'pending') && Array.isArray(session?.items) && session.items.length > 0;

    if (!hasOpenTab) {
        metaEl.textContent = '未会計の注文はありません。';
        listEl.innerHTML = '<div class="troy-open-tab-empty">注文するとここに明細が表示されます。会計後は自動で退店します。</div>';
        undoBtn.disabled = true;
        undoBtn.textContent = '最後の1件を取り消す';
        return;
    }

    const totalLabel = `${checkoutStatus === 'pending' ? '旧会計待ち' : '未会計'} ${session.totalItems}点 / ${formatYen(session.total)}`;
    metaEl.textContent = session.grantTotal > 0 ? `${totalLabel} / 付与済み ${session.grantTotal} Ps` : totalLabel;
    listEl.innerHTML = '';

    const items = session.items.slice().reverse();
    items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'troy-open-tab-item';
        if (index === 0) row.classList.add('is-latest');

        const main = document.createElement('div');
        main.className = 'troy-open-tab-item-main';

        const name = document.createElement('div');
        name.className = 'troy-open-tab-item-name';
        name.textContent = item.name;

        const detail = document.createElement('div');
        detail.className = 'troy-open-tab-item-meta';
        const detailParts = [];
        if (item.orderedAtMs > 0) {
            detailParts.push(new Date(item.orderedAtMs).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
        }
        detailParts.push(`${item.quantity}点`);
        if (item.grantedPs > 0) {
            detailParts.push(`+${item.grantedPs} Ps`);
        }
        if (index === 0) {
            detailParts.push('最新');
        }
        detail.textContent = detailParts.join(' / ');

        const total = document.createElement('div');
        total.className = 'troy-open-tab-item-total';
        total.textContent = formatYen(item.lineTotal);

        main.append(name, detail);
        row.append(main, total);
        listEl.appendChild(row);
    });

    const undoItem = getUndoEligibleLastOrder(session);
    if (undoItem) {
        undoBtn.disabled = false;
        undoBtn.textContent = `最後の1件を取り消す (${formatUndoCountdown(undoItem.undoUntilMs - Date.now())})`;
        _undoCountdownTimerId = window.setTimeout(() => {
            _undoCountdownTimerId = 0;
            renderOpenTabCard();
        }, 1000);
        return;
    }

    undoBtn.disabled = true;
    undoBtn.textContent = checkoutStatus === 'pending'
        ? '最後の1件を取り消す'
        : '最後の1件を取り消せません';
}

function updateCheckoutStatus() {
    const status = document.getElementById('troyOrderStatusInline');
    const session = sanitizeCheckoutSession(_checkoutSession);
    _checkoutSession = session;
    renderOpenTabCard();
    if (!status) return;
    const checkoutStatus = String(session?.status || '').trim().toLowerCase();
    const hasOpenTab = checkoutStatus === 'open' || checkoutStatus === 'pending';
    if (hasOpenTab) {
        const items = Array.isArray(session?.items) ? session.items : [];
        const total = Number(session?.total || 0);
        const totalItems = Math.max(0, Number(session?.totalItems) || items.reduce((sum, item) => sum + Math.max(1, Number(item?.quantity) || 1), 0));
        const grantTotal = Math.max(0, Number(session?.grantTotal) || 0);
        if (checkoutStatus === 'pending') {
            status.textContent = `旧会計待ち: ${totalItems}点 / ${formatYen(total)}${grantTotal > 0 ? ` / 付与済み ${grantTotal} Ps` : ''}`;
        } else {
            status.textContent = `未会計: ${totalItems}点 / ${formatYen(total)}${grantTotal > 0 ? ` / 付与済み ${grantTotal} Ps` : ''}`;
        }
        status.classList.add('is-pending');
        return;
    }
    status.textContent = '注文ごとにPSが即時付与されます。支払いは最後にまとめて行います。';
    status.classList.remove('is-pending');
}

function applyCheckoutFromStatus(data) {
    const checkout = sanitizeCheckoutSession(data?.checkout || null);
    const previousStatus = String(_checkoutSession?.status || '').trim().toLowerCase();
    const nextStatus = String(checkout?.status || '').trim().toLowerCase();
    const stillMember = isTroyMember(data, window.myPlayFabId);

    if (checkout && (nextStatus === 'open' || nextStatus === 'pending')) {
        clearPendingAutoLeaveNotice();
        _checkoutSession = checkout;
        updateCheckoutStatus();
        return;
    }

    if ((previousStatus === 'open' || previousStatus === 'pending') && !checkout && !stillMember) {
        clearPendingAutoLeaveNotice();
        closeMenuModal();
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('会計が完了しました。退店しました。');
        }
    } else if ((previousStatus === 'open' || previousStatus === 'pending') && !checkout && stillMember) {
        schedulePendingAutoLeaveNotice();
    } else if (!checkout && !stillMember && _pendingAutoLeaveNotice) {
        clearPendingAutoLeaveNotice();
        closeMenuModal();
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('会計が完了しました。退店しました。');
        }
    } else if (stillMember) {
        clearPendingAutoLeaveNotice();
    }

    _checkoutSession = null;
    updateCheckoutStatus();
}

async function submitQuickCheckout(playFabId, item, quantity = 1, options = {}) {
    if (!isTroyMember(_lastStatus, playFabId)) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('入店してから注文できます。');
        } else {
            alert('入店してから注文できます。');
        }
        return;
    }
    const orderName = getOrderItemName(item, item.optionLabel);
    const normalizedPrice = parseYenPrice(item?.price);
    const normalizedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
    if (!normalizedPrice) return;
    try {
        const checkoutTotal = normalizedPrice * normalizedQuantity;
        const result = await sendTroyOrder(playFabId, {
            itemName: orderName,
            price: normalizedPrice,
            quantity: normalizedQuantity,
            total: checkoutTotal,
            displayName: getDisplayName()
        });
        if (result?.checkout) {
            _checkoutSession = result.checkout;
            updateCheckoutStatus();
            updateOrderAvailability();
            if (options.closeMenu !== false) {
                closeMenuModal();
            }
            if (typeof window.showRpgMessage === 'function') {
                const grantValue = Math.max(0, Number(result?.grantAmount) || 0);
                const grantLabel = result?.grantError
                    ? 'PS付与失敗 / '
                    : (grantValue > 0 ? `+${grantValue} Ps / ` : '');
                const defaultMessage = `${orderName} を注文しました。${grantLabel}未会計 ${formatYen(Number(result?.checkout?.total || checkoutTotal))}`;
                window.showRpgMessage(options.successMessage || defaultMessage);
            }
        }
    } catch (error) {
        console.warn('[TroyOrder] Failed:', error?.message || error);
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage(options.failureMessage || '注文の送信に失敗しました。');
        } else {
            alert(options.failureMessage || '注文の送信に失敗しました。');
        }
    }
}

async function handleUndoLastOrder(playFabId) {
    const lastItem = getUndoEligibleLastOrder(_checkoutSession);
    if (!lastItem) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('取り消せる注文がありません。');
        }
        return;
    }
    try {
        const result = await undoTroyLastOrder(playFabId, { isSilent: true, throwOnError: true });
        _checkoutSession = result?.checkout || null;
        updateCheckoutStatus();
        const undoneName = String(result?.undoneItem?.name || lastItem.name || '注文').trim();
        if (typeof window.showRpgMessage === 'function') {
            const total = Number(result?.checkout?.total || 0);
            const label = total > 0 ? `未会計 ${formatYen(total)}` : '伝票を空にしました。';
            window.showRpgMessage(`${undoneName} を取り消しました。${label}`);
        }
    } catch (error) {
        console.warn('[TroyUndo] Failed:', error?.message || error);
        const message = (() => {
            const detail = String(error?.message || '').trim();
            if (detail.includes('付与済みPSを消費しているため取り消せません')) return detail;
            if (detail.includes('CheckoutChanged')) return '注文内容が更新されたため、もう一度確認してください。';
            if (detail.includes('UndoExpired')) return '取り消し可能時間を過ぎました。';
            if (detail.includes('入店チャージは取り消せません')) return '入店チャージは取り消せません。';
            return '最後の1件の取り消しに失敗しました。';
        })();
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage(message);
        } else {
            alert(message);
        }
    }
}

function openMenuModal(menuId) {
    const data = getMenuDataById(menuId);
    if (!data) return;
    _menuActiveId = menuId;
    setTopMenuCategoryState(menuId);

    const {
        modal,
        title,
        categories,
        subnote,
        list,
        card
    } = getMenuModalElements();
    if (!modal || !list) return;

    if (title) title.textContent = `Menu / ${data.title}`;
    if (subnote) subnote.textContent = getMenuSubnote(menuId);
    if (card) card.dataset.menuId = menuId;

    if (categories) {
        categories.innerHTML = '';
        getMenuCategoryList().forEach((category) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'troy-menu-modal-cat-btn';
            if (category.id === menuId) button.classList.add('is-active');
            button.textContent = category.title;
            button.addEventListener('click', () => openMenuModal(category.id));
            categories.appendChild(button);
        });
    }

    list.innerHTML = '';
    if (!Array.isArray(data.items) || data.items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'troy-menu-modal-empty';
        empty.textContent = menuId === 'favorite'
            ? 'お気に入り登録したドリンクがここに表示されます。'
            : '表示できる商品がありません。';
        list.appendChild(empty);
        modal.style.display = 'flex';
        return;
    }
    data.items.forEach((item, index) => {
        const cardEl = document.createElement('article');
        cardEl.className = 'troy-menu-modal-item';

        const hero = document.createElement('div');
        hero.className = 'troy-menu-modal-emoji';
        hero.setAttribute('aria-hidden', 'true');
        const heroFallback = document.createElement('span');
        heroFallback.className = 'troy-menu-modal-hero-fallback';
        heroFallback.textContent = item.emoji || getMenuItemEmoji(item);
        hero.appendChild(heroFallback);
        const heroImage = getMenuItemHeroImage(item);
        if (heroImage) {
            const heroImg = document.createElement('img');
            heroImg.className = 'troy-menu-modal-hero-image';
            heroImg.alt = '';
            heroImg.loading = 'eager';
            heroImg.decoding = 'async';
            heroImg.addEventListener('load', () => {
                setTroyMenuHeroLoaded(hero, true);
            });
            heroImg.addEventListener('error', () => {
                setTroyMenuHeroLoaded(hero, false);
                heroImg.remove();
            }, { once: true });
            heroImg.src = heroImage;
            hero.appendChild(heroImg);
            if (heroImg.complete && heroImg.naturalWidth > 0) {
                setTroyMenuHeroLoaded(hero, true);
            }
        }

        const body = document.createElement('div');
        body.className = 'troy-menu-modal-item-body';

        const concept = document.createElement('div');
        concept.className = 'troy-menu-modal-item-name';
        concept.textContent = item.concept || item.name || '';

        const content = document.createElement('div');
        content.className = 'troy-menu-modal-item-content';
        content.textContent = item.content || '';

        let optionLabel = menuId === 'favorite' ? String(item?.optionLabel || '').trim() : '';
        let optionRow = null;
        if (Array.isArray(item.mixers) && item.mixers.length) {
            optionRow = document.createElement('div');
            optionRow.className = 'troy-menu-modal-option-row';

            const optionLabelEl = document.createElement('label');
            optionLabelEl.className = 'troy-menu-modal-option-label';
            optionLabelEl.textContent = '割り物';

            const optionSelect = document.createElement('select');
            optionSelect.className = 'troy-menu-mix-select';
            item.mixers.forEach((option) => {
                const optionEl = document.createElement('option');
                optionEl.value = option;
                optionEl.textContent = option;
                optionSelect.appendChild(optionEl);
            });
            optionSelect.value = getMenuItemOption(menuId, item, index);
            optionLabel = optionSelect.value;
            optionSelect.addEventListener('change', () => {
                optionLabel = setMenuItemOption(menuId, item, index, optionSelect.value);
                syncFavoriteButton();
            });
            optionRow.append(optionLabelEl, optionSelect);
        }

        const meta = document.createElement('div');
        meta.className = 'troy-menu-modal-item-meta';

        const price = document.createElement('span');
        price.className = 'troy-menu-modal-price';
        price.textContent = formatYen(item.price);

        const actions = document.createElement('div');
        actions.className = 'troy-menu-modal-item-actions';

        const minusBtn = document.createElement('button');
        minusBtn.type = 'button';
        minusBtn.className = 'troy-menu-qty-btn';
        minusBtn.textContent = '−';

        const qtyDisplay = document.createElement('span');
        qtyDisplay.className = 'troy-menu-qty';

        const plusBtn = document.createElement('button');
        plusBtn.type = 'button';
        plusBtn.className = 'troy-menu-qty-btn';
        plusBtn.textContent = '＋';

        const quickBtn = document.createElement('button');
        quickBtn.type = 'button';
        quickBtn.className = 'troy-menu-quick-btn';
        quickBtn.textContent = '注文する';

        let favoriteBtn = null;
        const syncFavoriteButton = () => {
            if (!favoriteBtn) return;
            const active = isFavoriteDrink(menuId, item, optionLabel);
            favoriteBtn.classList.toggle('is-active', active);
            favoriteBtn.textContent = active ? '★ いつもの' : '☆ いつもの';
        };

        if (isDrinkMenuId(menuId, item)) {
            favoriteBtn = document.createElement('button');
            favoriteBtn.type = 'button';
            favoriteBtn.className = 'troy-menu-favorite-btn';
            favoriteBtn.addEventListener('click', () => {
                const active = toggleFavoriteDrink(menuId, item, optionLabel);
                syncFavoriteButton();
                if (_menuActiveId === 'favorite') {
                    openMenuModal('favorite');
                }
                if (typeof window.showRpgMessage === 'function') {
                    window.showRpgMessage(active ? '「いつもの」に追加しました。' : '「いつもの」から外しました。');
                }
            });
        }

        const syncQty = () => {
            const qty = getMenuItemQty(menuId, item, index);
            qtyDisplay.textContent = `${qty}`;
            minusBtn.disabled = qty <= 1;
        };

        minusBtn.addEventListener('click', () => {
            const next = getMenuItemQty(menuId, item, index) - 1;
            setMenuItemQty(menuId, item, index, next);
            syncQty();
        });

        plusBtn.addEventListener('click', () => {
            const next = getMenuItemQty(menuId, item, index) + 1;
            setMenuItemQty(menuId, item, index, next);
            syncQty();
        });

        quickBtn.addEventListener('click', async () => {
            const qty = getMenuItemQty(menuId, item, index);
            await submitQuickCheckout(window.myPlayFabId, { ...item, optionLabel }, qty);
        });

        syncQty();
        syncFavoriteButton();
        if (favoriteBtn) actions.append(favoriteBtn);
        actions.append(minusBtn, qtyDisplay, plusBtn, quickBtn);
        meta.append(price, actions);
        body.append(concept);
        if (item.content) body.append(content);
        if (optionRow) body.append(optionRow);
        body.append(meta);
        cardEl.append(hero, body);
        list.appendChild(cardEl);
    });

    modal.style.display = 'flex';
}

function closeMenuModal() {
    const { modal } = getMenuModalElements();
    if (modal) modal.style.display = 'none';
}

function wireMenuPopups() {
    if (_menuWired) return;
    _menuWired = true;
    const { modal, close } = getMenuModalElements();
    if (close) {
        close.addEventListener('click', closeMenuModal);
    }
    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeMenuModal();
        });
    }
    const menuButtons = Array.from(document.querySelectorAll('.troy-menu-item-button[data-menu-id]'));
    menuButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const targetMenuId = button.dataset.menuId;
            if (!targetMenuId) return;
            _menuActiveId = targetMenuId;
            setTopMenuCategoryState(targetMenuId);
            openMenuModal(targetMenuId);
        });
    });
    setTopMenuCategoryState(_menuActiveId);
    updateCheckoutStatus();
}

function getTroyElements() {
    return {
        badge: document.getElementById('troyOpenBadge'),
        section: document.getElementById('troyEntrySection'),
        list: document.getElementById('troyEntryList'),
        empty: document.getElementById('troyEntryEmpty'),
        joinBtn: document.getElementById('btnTroyJoin')
    };
}

function getDisplayName() {
    return window.myPlayFabDisplayName || window.myLineProfile?.displayName || window.myPlayFabId || 'Player';
}

function normalizePlayFabId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/^playfab:/i, '').trim().toUpperCase();
}

function resolveTroyNationKey() {
    return String(
        _lastStatus?.nation
        || window.myAvatarBaseInfo?.Nation
        || window.myAvatarBaseInfo?.nation
        || ''
    ).trim().toLowerCase();
}

function toMillis(value) {
    if (value?.toMillis) return value.toMillis();
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function stopStatusSubscription() {
    if (_statusRoomUnsubscribe) {
        _statusRoomUnsubscribe();
        _statusRoomUnsubscribe = null;
    }
    if (_statusMembersUnsubscribe) {
        _statusMembersUnsubscribe();
        _statusMembersUnsubscribe = null;
    }
    if (_statusCheckoutUnsubscribe) {
        _statusCheckoutUnsubscribe();
        _statusCheckoutUnsubscribe = null;
    }
}

function publishSnapshotStatus() {
    renderStatus({
        nation: _statusSnapshotState.nation,
        isOpen: !!_statusSnapshotState.isOpen,
        members: Array.isArray(_statusSnapshotState.members) ? _statusSnapshotState.members : [],
        checkout: _statusSnapshotState.checkout || null
    });
}

function attachStatusSubscription(playFabId, nationKey = resolveTroyNationKey()) {
    stopStatusSubscription();
    const groupName = TROY_GROUP_BY_NATION[String(nationKey || '').toLowerCase()];
    const memberId = normalizePlayFabId(playFabId);
    if (!groupName || !memberId) return false;
    const db = getFirestore();
    const roomRef = doc(db, 'troy_rooms', groupName);
    const membersQuery = query(collection(roomRef, 'members'), orderBy('joinedAt', 'asc'), limit(50));
    const checkoutRef = doc(roomRef, 'checkouts', memberId);

    _statusSnapshotState = {
        nation: nationKey,
        isOpen: false,
        members: [],
        checkout: null
    };

    const handleSnapshotError = (label, error) => {
        console.warn(`[Troy] ${label} snapshot failed:`, error);
        stopStatusSubscription();
    };

    _statusRoomUnsubscribe = onSnapshot(roomRef, (snapshot) => {
        _statusSnapshotState.isOpen = !!snapshot.data()?.isOpen;
        publishSnapshotStatus();
    }, (error) => handleSnapshotError('room', error));

    _statusMembersUnsubscribe = onSnapshot(membersQuery, (snapshot) => {
        _statusSnapshotState.members = snapshot.docs.map((entry) => {
            const data = entry.data() || {};
            return {
                playFabId: entry.id,
                displayName: data.displayName || entry.id,
                joinedAt: toMillis(data.joinedAt)
            };
        });
        publishSnapshotStatus();
    }, (error) => handleSnapshotError('members', error));

    _statusCheckoutUnsubscribe = onSnapshot(checkoutRef, (snapshot) => {
        if (!snapshot.exists()) {
            _statusSnapshotState.checkout = null;
            publishSnapshotStatus();
            return;
        }
        const data = snapshot.data() || {};
        _statusSnapshotState.checkout = {
            status: data.status || 'open',
            total: Number(data.total || 0),
            totalItems: Math.max(0, Number(data.totalItems) || 0),
            grantTotal: Math.max(0, Number(data.grantTotal) || 0),
            items: Array.isArray(data.items) ? data.items : [],
            createdAt: toMillis(data.createdAt),
            updatedAt: toMillis(data.updatedAt),
            lastOrderedAt: toMillis(data.lastOrderedAt)
        };
        publishSnapshotStatus();
    }, (error) => handleSnapshotError('checkout', error));

    return true;
}

function renderEntryList(members) {
    const { list, empty } = getTroyElements();
    if (!list || !empty) return;
    list.innerHTML = '';
    const entries = Array.isArray(members) ? members : [];
    if (entries.length === 0) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    entries.forEach((member) => {
        const row = document.createElement('div');
        row.className = 'troy-entry-item';
        const name = document.createElement('b');
        name.textContent = member.displayName || member.playFabId || 'Player';
        decoratePlayerTriggerElement(name, member.playFabId, { className: 'player-link-inline' });
        const meta = document.createElement('span');
        meta.textContent = member.joinedAt ? new Date(member.joinedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
        row.appendChild(name);
        row.appendChild(meta);
        list.appendChild(row);
    });
}

function renderStatus(data) {
    _lastStatus = data;
    if (typeof window !== 'undefined') {
        window.__troyStatus = data;
    }
    const { badge, section } = getTroyElements();
    if (badge) {
        const isOpen = !!data?.isOpen;
        badge.textContent = isOpen ? 'OPEN' : 'CLOSE';
        badge.classList.toggle('open', isOpen);
    }
    if (section) {
        section.style.display = data?.isOpen ? 'block' : 'none';
    }
    if (!data?.isOpen) {
        renderEntryList([]);
    } else {
        renderEntryList(data?.members);
    }
    applyCheckoutFromStatus(data);
    updateOrderAvailability();
    updateTroyRoleUI();
}

async function refreshStatus(playFabId, options = {}) {
    if (!playFabId) return;
    const data = await getTroyStatus(playFabId, options);
    if (data) renderStatus(data);
}

function wireHandlers(playFabId) {
    if (_wired) return;
    _wired = true;

    const { joinBtn } = getTroyElements();
    const undoBtn = document.getElementById('btnTroyUndoLastOrder');
    if (joinBtn) {
        joinBtn.addEventListener('click', async () => {
            const name = getDisplayName();
            const wasMember = isTroyMember(_lastStatus, playFabId);
            const result = await joinTroy(playFabId, name);
            if (result) {
                await refreshStatus(playFabId, { isSilent: true });
                attachStatusSubscription(playFabId, _lastStatus?.nation || resolveTroyNationKey());
                const isMember = isTroyMember(_lastStatus, playFabId);
                if (!wasMember && isMember) {
                    await submitQuickCheckout(playFabId, { concept: '入店チャージ', price: 500 }, 1, {
                        closeMenu: false,
                        successMessage: '入店しました。入店チャージを注文しました。',
                        failureMessage: '入店チャージの送信に失敗しました。'
                    });
                }
            }
        });
    }
    if (undoBtn) {
        undoBtn.addEventListener('click', async () => {
            if (undoBtn.disabled) return;
            await handleUndoLastOrder(playFabId);
        });
    }
}

export async function loadTroyPage(playFabId) {
    loadFavoriteDrinkEntries(playFabId);
    wireHandlers(playFabId);
    wireMenuPopups();
    const isKingUser = await refreshKingNav(playFabId);
    if (isKingUser) {
        await loadKingPage(playFabId);
    }
    await refreshStatus(playFabId);
    updateTroyRoleUI();
    attachStatusSubscription(playFabId, _lastStatus?.nation || resolveTroyNationKey());
}
