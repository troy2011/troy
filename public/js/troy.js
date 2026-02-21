// c:/Users/ikeda/my-liff-app/public/js/troy.js

import {
    getTroyStatus,
    joinTroy,
    sendTroyCheckout
} from './playfabClient.js';
import { isKing, refreshKingNav, loadKingPage } from './nationKing.js';

let _wired = false;
let _menuWired = false;
let _pollTimer = null;
let _lastStatus = null;
let _orderTotal = 0;
let _orderItems = [];
let _pendingOrder = null;
let _checkoutSession = null;
let _checkoutLocked = false;
let _menuActiveId = 'drinks';
const _menuQuantityByKey = new Map();

const TROY_MENU_ORDER = ['drinks', 'appetizer', 'dryfood', 'hotfood', 'main', 'points'];
const TROY_MENU_BADGES = {
    drinks: ['昼夜切替', '人気'],
    appetizer: ['軽いおつまみ', 'おすすめ'],
    dryfood: ['乾きもの'],
    hotfood: ['温かい料理', '売れ筋'],
    main: ['主食', '船長おすすめ'],
    points: ['交換商品']
};

const TROY_PRODUCT_MENUS = {
    drinks: {
        title: 'ドリンク',
        items: []
    },
    appetizer: {
        title: '貯蔵品 (軽いおつまみ)',
        items: [
            { concept: '海賊の保存食', content: 'ミックスナッツ', price: 500, image: 'https://loremflickr.com/640/420/nuts?lock=5101' },
            { concept: '深海の黒真珠', content: 'チョコ', price: 600, image: 'https://loremflickr.com/640/420/chocolate?lock=5102' },
            { concept: '南国島からの略奪品', content: 'ドライフルーツ', price: 700, image: 'https://loremflickr.com/640/420/dried,fruit?lock=5103' },
            { concept: '人魚の涙', content: 'オリーブ＆ピクルス', price: 600, image: 'https://loremflickr.com/640/420/olive,pickle?lock=5104' }
        ]
    },
    dryfood: {
        title: '略奪品 (乾きもの)',
        items: [
            { concept: 'クラーケンの干し肉', content: 'ビーフジャーキー', price: 900, image: 'https://loremflickr.com/640/420/beef,jerky?lock=5105' }
        ]
    },
    hotfood: {
        title: '船上の宴 (温かい料理)',
        items: [
            { concept: '海底の黄金ポテト', content: 'フライドポテト', price: 700, image: 'https://loremflickr.com/640/420/french,fries?lock=5106' },
            { concept: '砲丸揚げ', content: 'チーズボール', price: 800, image: 'https://loremflickr.com/640/420/cheese,balls?lock=5107' },
            { concept: 'デッドマンズ・フィンガー', content: 'ソーセージ盛り合わせ', price: 1000, image: 'https://loremflickr.com/640/420/sausage?lock=5108' },
            { concept: '黒ひげピザ', content: 'ミックスピザ', price: 1300, image: 'https://loremflickr.com/640/420/pizza?lock=5109' },
            { concept: '密輸船のオイル煮', content: 'オイルサーディン', price: 900, image: 'https://loremflickr.com/640/420/sardine?lock=5110' }
        ]
    },
    main: {
        title: '腹の糧 (主食)',
        items: [
            { concept: '七つの海の戦利品', content: '本日のパスタ', price: 1100, image: 'https://loremflickr.com/640/420/pasta?lock=5111' },
            { concept: '黒潮の一皿', content: '海鮮リゾット', price: 1300, image: 'https://loremflickr.com/640/420/risotto,seafood?lock=5115' },
            { concept: '甲板炊き込み', content: 'ガーリックライス', price: 1000, image: 'https://loremflickr.com/640/420/garlic,rice?lock=5116' },
            { concept: '大砲火薬カレー', content: 'スパイスカレー', price: 1200, image: 'https://loremflickr.com/640/420/curry?lock=5117' }
        ]
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
    { concept: '船長のブレンド', content: 'ホットコーヒー', price: 600, image: 'https://loremflickr.com/640/420/coffee?lock=5121' },
    { concept: '見張り台の一杯', content: 'アイスコーヒー', price: 650, image: 'https://loremflickr.com/640/420/iced,coffee?lock=5122' },
    { concept: '王室の茶会', content: 'ストレートティー', price: 600, image: 'https://loremflickr.com/640/420/tea?lock=5123' },
    { concept: '潮風ミルクティー', content: 'ロイヤルミルクティー', price: 700, image: 'https://loremflickr.com/640/420/milk,tea?lock=5124' },
    { concept: '港町ラテ', content: 'カフェラテ', price: 750, image: 'https://loremflickr.com/640/420/latte?lock=5125' },
    { concept: '宝箱ココア', content: 'ホットココア', price: 700, image: 'https://loremflickr.com/640/420/cocoa?lock=5126' }
];

const TROY_NIGHT_DRINK_ITEMS = [
    { concept: '黒潮ラムコーク', content: 'ラムコーク', price: 900, image: 'https://loremflickr.com/640/420/rum,coke?lock=5131' },
    { concept: '航海士のハイボール', content: 'ハイボール', price: 850, image: 'https://loremflickr.com/640/420/highball?lock=5132' },
    { concept: '赤灯台ワイン', content: '赤ワイン', price: 950, image: 'https://loremflickr.com/640/420/red,wine?lock=5133' },
    { concept: '白波レモンサワー', content: 'レモンサワー', price: 820, image: 'https://loremflickr.com/640/420/lemon,sour?lock=5134' },
    { concept: '海賊ジントニック', content: 'ジントニック', price: 900, image: 'https://loremflickr.com/640/420/gin,tonic?lock=5135' },
    { concept: '月夜のモヒート', content: 'モヒート', price: 950, image: 'https://loremflickr.com/640/420/mojito?lock=5136' },
    { concept: 'ソフトコーラ', content: 'コーラ', price: 450, image: 'https://loremflickr.com/640/420/cola?lock=5137' },
    { concept: '港のジンジャー', content: 'ジンジャーエール', price: 450, image: 'https://loremflickr.com/640/420/ginger,ale?lock=5138' }
];

function isDayCafeHours(now = new Date()) {
    const hour = now.getHours();
    return hour >= 9 && hour < 16;
}

function getDrinkMenuData(now = new Date()) {
    const isDay = isDayCafeHours(now);
    return {
        title: isDay ? 'ドリンク (昼カフェ)' : 'ドリンク (夜バー)',
        items: isDay ? TROY_DAY_CAFE_DRINK_ITEMS : TROY_NIGHT_DRINK_ITEMS
    };
}

function getMenuDataById(menuId) {
    return menuId === 'drinks' ? getDrinkMenuData() : TROY_PRODUCT_MENUS[menuId];
}

function getMenuCategoryList() {
    return TROY_MENU_ORDER
        .map((id) => {
            const data = getMenuDataById(id);
            if (!data) return null;
            return { id, title: data.title };
        })
        .filter(Boolean);
}

function getMenuItemKey(menuId, item, index) {
    const concept = String(item?.concept || item?.name || '').trim();
    const content = String(item?.content || '').trim();
    return `${menuId}:${concept}:${content}:${index}`;
}

function getMenuItemQuantity(menuId, item, index) {
    const key = getMenuItemKey(menuId, item, index);
    const value = Number(_menuQuantityByKey.get(key));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function setMenuItemQuantity(menuId, item, index, quantity) {
    const key = getMenuItemKey(menuId, item, index);
    const next = Math.max(1, Math.floor(Number(quantity) || 1));
    _menuQuantityByKey.set(key, next);
    return next;
}

function getMenuItemBadges(menuId, item, index) {
    const labels = [];
    if (Array.isArray(item?.badges)) labels.push(...item.badges);
    if (!labels.length) {
        const defaults = TROY_MENU_BADGES[menuId] || [];
        if (index === 0 && defaults[1]) labels.push(defaults[1]);
        else if (defaults[0]) labels.push(defaults[0]);
        if (Number(item?.price || 0) >= 1200) labels.push('人気');
    }
    return labels.slice(0, 2);
}

function getMenuModalElements() {
    return {
        modal: document.getElementById('troyMenuModal'),
        title: document.getElementById('troyMenuModalTitle'),
        categories: document.getElementById('troyMenuModalCategories'),
        subnote: document.getElementById('troyMenuModalSubnote'),
        list: document.getElementById('troyMenuModalList'),
        close: document.getElementById('troyMenuModalClose'),
        cartCount: document.getElementById('troyMenuCartCount'),
        cartTotal: document.getElementById('troyMenuCartTotal'),
        goCheckout: document.getElementById('troyMenuOpenCheckout'),
        card: document.querySelector('#troyMenuModal .troy-menu-modal-card')
    };
}

function getOrderElements() {
    return {
        total: document.getElementById('troyOrderTotal'),
        list: document.getElementById('troyOrderList'),
        status: document.getElementById('troyCheckoutStatus'),
        checkoutBtn: document.getElementById('btnTroyCheckout')
    };
}

function isTroyMember(status, playFabId) {
    const members = status?.members;
    if (!Array.isArray(members) || !playFabId) return false;
    const target = String(playFabId).toLowerCase();
    return members.some((member) => String(member?.playFabId || member?.id || '').toLowerCase() === target);
}

function updateOrderAvailability(isMember) {
    const canOrder = isMember && !_checkoutLocked;
    if (!canOrder) {
        closeOrderModal();
    }
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

function updateMenuCartSummary() {
    const { cartCount, cartTotal } = getMenuModalElements();
    if (cartCount) {
        const items = _orderItems.reduce((sum, item) => sum + Math.max(1, Number(item?.quantity) || 1), 0);
        cartCount.textContent = `${items}点`;
    }
    if (cartTotal) {
        cartTotal.textContent = formatYen(_orderTotal);
    }
}

function renderOrderSummary() {
    const { total, list } = getOrderElements();
    if (total) total.textContent = formatYen(_orderTotal);
    updateMenuCartSummary();
    if (!list) return;
    list.innerHTML = '';
    if (!_orderItems.length) {
        const empty = document.createElement('div');
        empty.className = 'troy-checkout-empty';
        empty.textContent = '注文はまだありません';
        list.appendChild(empty);
        updateCheckoutStatus();
        return;
    }
    _orderItems.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'troy-checkout-item';
        const name = document.createElement('span');
        name.textContent = item.name;
        const price = document.createElement('span');
        price.textContent = formatYen(item.price * item.quantity);
        row.appendChild(name);
        row.appendChild(price);
        list.appendChild(row);
    });
    updateCheckoutStatus();
}

function updateCheckoutStatus() {
    const { status, checkoutBtn } = getOrderElements();
    const isMember = isTroyMember(_lastStatus, window.myPlayFabId);
    const pending = _checkoutLocked && _checkoutSession?.status === 'pending';
    if (status) {
        status.textContent = pending ? '承認待ち' : '未会計';
    }
    if (checkoutBtn) {
        const hasOrder = _orderTotal > 0;
        checkoutBtn.disabled = pending || !isMember || !hasOrder;
        checkoutBtn.textContent = pending ? '承認待ち' : '会計する';
    }
}

function applyCheckoutFromStatus(data) {
    const checkout = data?.checkout || null;
    const wasLocked = _checkoutLocked;
    const wasPending = _checkoutSession?.status === 'pending';

    if (checkout && checkout.status === 'pending') {
        _checkoutSession = checkout;
        _checkoutLocked = true;
        _orderItems = Array.isArray(checkout.items) ? checkout.items : [];
        _orderTotal = Number(checkout.total || 0);
        renderOrderSummary();
        return;
    }

    if (checkout && checkout.status === 'approved') {
        _checkoutSession = checkout;
        _checkoutLocked = false;
        resetOrderSummary();
        if (wasPending && typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('会計が承認されました。退店しました。');
        }
        return;
    }

    if (wasLocked && wasPending && !checkout) {
        _checkoutSession = null;
        _checkoutLocked = false;
        resetOrderSummary();
    }
}

function resetOrderSummary() {
    _orderTotal = 0;
    _orderItems = [];
    renderOrderSummary();
}

function addOrderItemLocal(name, price, quantity = 1) {
    const normalizedPrice = Number(price) || 0;
    if (!normalizedPrice) return;
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    _orderTotal += normalizedPrice * qty;
    _orderItems.push({ name, price: normalizedPrice, quantity: qty });
    renderOrderSummary();
}

function getOrderModalElements() {
    return {
        modal: document.getElementById('troyOrderModal'),
        name: document.getElementById('troyOrderItemName'),
        price: document.getElementById('troyOrderItemPrice'),
        close: document.getElementById('troyOrderModalClose'),
        confirm: document.getElementById('troyOrderConfirm'),
        cancel: document.getElementById('troyOrderCancel')
    };
}

function openOrderModal(item) {
    const { modal, name, price } = getOrderModalElements();
    if (!modal || !name || !price) return;
    _pendingOrder = item;
    name.textContent = item.name;
    price.textContent = formatYen(item.price);
    modal.style.display = 'flex';
}

function closeOrderModal() {
    const { modal } = getOrderModalElements();
    if (modal) modal.style.display = 'none';
    _pendingOrder = null;
}

async function confirmOrder(playFabId) {
    if (!_pendingOrder) return;
    if (_checkoutLocked) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('会計待ちのため注文を追加できません。');
        }
        closeOrderModal();
        return;
    }
    if (!isTroyMember(_lastStatus, playFabId)) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('入店してから注文できます。');
        } else {
            alert('入店してから注文できます。');
        }
        closeOrderModal();
        return;
    }
    const item = _pendingOrder;
    const quantity = item.quantity || 1;
    const nextTotal = _orderTotal + item.price * quantity;
    _orderTotal = nextTotal;
    _orderItems.push({ name: item.name, price: item.price, quantity });
    renderOrderSummary();
    closeOrderModal();
    if (typeof window.showRpgMessage === 'function') {
        window.showRpgMessage('注文を追加しました。');
    }
}

async function submitCheckout(playFabId) {
    if (_checkoutLocked) return;
    if (!isTroyMember(_lastStatus, playFabId)) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('入店してから会計できます。');
        } else {
            alert('入店してから会計できます。');
        }
        return;
    }
    if (!_orderItems.length || _orderTotal <= 0) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('会計する注文がありません。');
        } else {
            alert('会計する注文がありません。');
        }
        return;
    }
    try {
        const result = await sendTroyCheckout(playFabId, {
            items: _orderItems,
            total: _orderTotal,
            displayName: getDisplayName()
        });
        if (result?.checkout) {
            _checkoutSession = result.checkout;
            _checkoutLocked = true;
            renderOrderSummary();
            updateOrderAvailability(isTroyMember(_lastStatus, playFabId));
            if (typeof window.showRpgMessage === 'function') {
                window.showRpgMessage('会計を送信しました。承認待ちです。');
            }
        }
    } catch (error) {
        console.warn('[TroyCheckout] Failed:', error?.message || error);
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('会計送信に失敗しました。');
        } else {
            alert('会計送信に失敗しました。');
        }
    }
}

function canAddOrderFromMenu() {
    if (!isTroyMember(_lastStatus, window.myPlayFabId)) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('入店後に注文できます。');
        } else {
            alert('入店後に注文できます。');
        }
        return false;
    }
    if (_checkoutLocked) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('会計待ちのため新規注文はできません。');
        }
        return false;
    }
    return true;
}

function addMenuOrderItem(item, quantity, priceValue) {
    if (!priceValue || !canAddOrderFromMenu()) return;
    const safeQty = Math.max(1, Math.floor(Number(quantity) || 1));
    const orderName = item.content ? `${item.concept} (${item.content})` : (item.concept || item.name);
    addOrderItemLocal(orderName, priceValue, safeQty);
    if (typeof window.showRpgMessage === 'function') {
        window.showRpgMessage(`${orderName} x${safeQty} を追加しました。`);
    }
}

function setMenuCategoryButtonState(activeId) {
    const menuButtons = Array.from(document.querySelectorAll('.troy-menu-item-button[data-menu-id]'));
    menuButtons.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.menuId === activeId);
    });
}

function openMenuModal(menuId) {
    const fallbackId = TROY_MENU_ORDER.includes(_menuActiveId) ? _menuActiveId : 'drinks';
    _menuActiveId = TROY_MENU_ORDER.includes(menuId) ? menuId : fallbackId;
    const data = getMenuDataById(_menuActiveId);
    if (!data) return;

    const { modal, title, categories, subnote, list, card } = getMenuModalElements();
    if (!modal || !list) return;

    const isDay = isDayCafeHours();
    if (card) {
        card.classList.toggle('is-day', isDay);
        card.classList.toggle('is-night', !isDay);
    }
    if (title) title.textContent = data.title;
    if (subnote) {
        subnote.textContent = isDay
            ? '昼営業: カフェドリンク / 夜営業: バーのドリンク。カテゴリを切り替えて選べます。'
            : '夜営業: バーのドリンク提供中。カテゴリを切り替えて選べます。';
    }

    if (categories) {
        categories.innerHTML = '';
        getMenuCategoryList().forEach((category) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'troy-menu-modal-category-btn';
            button.textContent = category.title;
            button.classList.toggle('is-active', category.id === _menuActiveId);
            button.addEventListener('click', () => openMenuModal(category.id));
            categories.appendChild(button);
        });
    }

    list.innerHTML = '';
    data.items.forEach((item, index) => {
        const priceValue = parseYenPrice(item.price);
        const row = document.createElement('div');
        row.className = 'troy-menu-card';

        const thumb = document.createElement('div');
        thumb.className = 'troy-menu-card-thumb';

        const img = document.createElement('img');
        img.className = 'troy-menu-card-image';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = item.content ? `${item.concept} ${item.content}` : (item.concept || 'menu item');
        if (item.image) {
            img.src = item.image;
            img.addEventListener('error', () => {
                img.style.display = 'none';
            });
        } else {
            img.style.display = 'none';
        }

        const emoji = document.createElement('div');
        emoji.className = 'troy-menu-card-emoji';
        emoji.textContent = item.emoji || getMenuItemEmoji(item);
        emoji.setAttribute('aria-hidden', 'true');

        thumb.appendChild(img);
        thumb.appendChild(emoji);

        const badges = getMenuItemBadges(_menuActiveId, item, index);
        if (badges.length) {
            const badgeWrap = document.createElement('div');
            badgeWrap.className = 'troy-menu-card-badges';
            badges.forEach((label) => {
                const badge = document.createElement('span');
                badge.className = 'troy-menu-card-badge';
                badge.textContent = label;
                badgeWrap.appendChild(badge);
            });
            thumb.appendChild(badgeWrap);
        }

        const body = document.createElement('div');
        body.className = 'troy-menu-card-body';

        const concept = document.createElement('div');
        concept.className = 'troy-menu-card-name';
        concept.textContent = item.concept || item.name || '';

        const content = document.createElement('div');
        content.className = 'troy-menu-card-content';
        content.textContent = item.content || '';

        const price = document.createElement('span');
        price.className = 'troy-menu-card-price';
        price.textContent = formatYen(item.price);

        const controls = document.createElement('div');
        controls.className = 'troy-menu-card-controls';

        const qtyWrap = document.createElement('div');
        qtyWrap.className = 'troy-menu-card-qty';

        const minus = document.createElement('button');
        minus.type = 'button';
        minus.className = 'troy-menu-card-qty-btn';
        minus.textContent = '-';

        const qtyValue = document.createElement('span');
        qtyValue.className = 'troy-menu-card-qty-value';
        qtyValue.textContent = String(getMenuItemQuantity(_menuActiveId, item, index));

        const plus = document.createElement('button');
        plus.type = 'button';
        plus.className = 'troy-menu-card-qty-btn';
        plus.textContent = '+';

        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'troy-menu-card-add';
        addButton.textContent = 'カゴに追加';

        minus.addEventListener('click', (event) => {
            event.stopPropagation();
            const current = getMenuItemQuantity(_menuActiveId, item, index);
            qtyValue.textContent = String(setMenuItemQuantity(_menuActiveId, item, index, current - 1));
        });

        plus.addEventListener('click', (event) => {
            event.stopPropagation();
            const current = getMenuItemQuantity(_menuActiveId, item, index);
            qtyValue.textContent = String(setMenuItemQuantity(_menuActiveId, item, index, current + 1));
        });

        addButton.addEventListener('click', (event) => {
            event.stopPropagation();
            const quantity = getMenuItemQuantity(_menuActiveId, item, index);
            addMenuOrderItem(item, quantity, priceValue);
            updateMenuCartSummary();
        });

        qtyWrap.appendChild(minus);
        qtyWrap.appendChild(qtyValue);
        qtyWrap.appendChild(plus);
        controls.appendChild(qtyWrap);
        controls.appendChild(addButton);

        body.appendChild(concept);
        if (item.content) body.appendChild(content);
        body.appendChild(price);
        body.appendChild(controls);

        row.appendChild(thumb);
        row.appendChild(body);
        list.appendChild(row);
    });

    setMenuCategoryButtonState(_menuActiveId);
    updateMenuCartSummary();
    modal.style.display = 'flex';
}

function closeMenuModal() {
    const { modal } = getMenuModalElements();
    if (modal) modal.style.display = 'none';
}

function wireMenuPopups() {
    if (_menuWired) return;
    _menuWired = true;
    const { modal, close, goCheckout } = getMenuModalElements();
    const orderModal = getOrderModalElements();
    if (close) {
        close.addEventListener('click', closeMenuModal);
    }
    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeMenuModal();
        });
    }
    if (orderModal.close) {
        orderModal.close.addEventListener('click', closeOrderModal);
    }
    if (orderModal.cancel) {
        orderModal.cancel.addEventListener('click', closeOrderModal);
    }
    if (orderModal.modal) {
        orderModal.modal.addEventListener('click', (event) => {
            if (event.target === orderModal.modal) closeOrderModal();
        });
    }
    const menuButtons = Array.from(document.querySelectorAll('.troy-menu-item-button[data-menu-id]'));
    menuButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const menuId = button.dataset.menuId;
            _menuActiveId = menuId;
            openMenuModal(menuId);
        });
    });
    if (goCheckout) {
        goCheckout.addEventListener('click', () => {
            closeMenuModal();
            const checkoutCard = document.getElementById('troyCheckoutCard');
            if (checkoutCard) {
                checkoutCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }
    if (orderModal.confirm) {
        orderModal.confirm.addEventListener('click', () => {
            confirmOrder(window.myPlayFabId);
        });
    }
    setMenuCategoryButtonState(_menuActiveId);
    renderOrderSummary();
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
        const meta = document.createElement('span');
        meta.textContent = member.joinedAt ? new Date(member.joinedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
        row.appendChild(name);
        row.appendChild(meta);
        list.appendChild(row);
    });
}

function renderStatus(data) {
    _lastStatus = data;
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
    const isMember = isTroyMember(data, window.myPlayFabId);
    applyCheckoutFromStatus(data);
    updateOrderAvailability(isMember);
    if (!isMember && !_checkoutLocked) {
        resetOrderSummary();
    }
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
    const { checkoutBtn } = getOrderElements();
    if (joinBtn) {
        joinBtn.addEventListener('click', async () => {
            const name = getDisplayName();
            const wasMember = isTroyMember(_lastStatus, playFabId);
            const result = await joinTroy(playFabId, name);
            if (result) {
                await refreshStatus(playFabId, { isSilent: true });
                const isMember = isTroyMember(_lastStatus, playFabId);
                if (!wasMember && isMember) {
                    const entryPrice = 500;
                    addOrderItemLocal('入店チャージ', entryPrice, 1);
                }
            }
        });
    }
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', async () => {
            await submitCheckout(playFabId);
        });
    }
}

function startPolling(playFabId) {
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(() => {
        const tab = document.getElementById('tabContentTroy');
        if (!tab || tab.style.display === 'none') return;
        refreshStatus(playFabId, { isSilent: true });
    }, 5000);
}

export async function loadTroyPage(playFabId) {
    wireHandlers(playFabId);
    wireMenuPopups();
    const isKingUser = await refreshKingNav(playFabId);
    if (isKingUser) {
        await loadKingPage(playFabId);
    }
    await refreshStatus(playFabId);
    updateTroyRoleUI();
    startPolling(playFabId);
}

