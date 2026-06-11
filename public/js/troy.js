// c:/Users/ikeda/my-liff-app/public/js/troy.js

import {
    getTroyStatus,
    joinTroy,
    getTroyCalendar,
    createTroyCustomerOrderRequest,
    convertTroyGoldToCoin,
    createReservation as requestCreateReservation
} from './playfabClient.js';
import { createRequestId } from './api.js';
import { getFirestore, doc, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { getTroyMenuCategoryImage, getTroyMenuImage } from './troyMenuAssets.js';
import { TROY_BOTTLE_ITEMS, TROY_MENU_IDS, TROY_PRODUCT_MENUS } from './troyMenuData.js';

let _wired = false;
let _menuWired = false;
let _menuBoardWired = false;
let _lastStatus = null;
let _menuActiveId = 'beer';
let _menuBoardActiveId = 'beer';
let _menuBoardOrderDraft = null;
const _menuQtyByKey = new Map();
const _menuOptionByKey = new Map();
const _menuSizeByKey = new Map();
let _undoCountdownTimerId = 0;
let _favoriteDrinkEntries = [];
let _pendingAutoLeaveNotice = false;
let _pendingAutoLeaveTimerId = 0;
let _menuDisabled = [];
let _menuSpecials = [];
let _menuCustomItems = [];
let _businessCalendar = [];
let _selectedReservationCalendarEntry = null;
let _statusRoomUnsubscribe = null;
let _statusMembersUnsubscribe = null;
let _menuBoardOriginalAnchor = null;
let _statusSnapshotState = {
    nation: null,
    isOpen: false,
    members: [],
    menuDisabled: [],
    menuSpecials: [],
    menuCustomItems: []
};

const TROY_ORDER_ENTRY_ENABLED = true;
const TROY_FAVORITES_STORAGE_PREFIX = 'troy-favorite-drinks:';
const TROY_GLOBAL_ROOM_ID = 'global';
const TROY_CALENDAR_DIRECT_LIMIT = 3;

function isFavoritableMenuId(menuId, item = null) {
    const sourceMenuId = String(menuId === 'favorite' ? (item?.menuId || '') : (menuId || '')).trim();
    return TROY_MENU_IDS.includes(sourceMenuId) && sourceMenuId !== 'favorite' && sourceMenuId !== 'bottle';
}

function getItemOptionChoices(item = null) {
    return Array.isArray(item?.mixers) ? item.mixers : [];
}

function getItemOptionFieldLabel(item = null) {
    const label = String(item?.optionLabelName || '').trim();
    return label || '割り物';
}

function getItemSizeChoices(item = null) {
    return Array.isArray(item?.sizeOptions) ? item.sizeOptions : [];
}

function normalizeSizeLabel(item = null, value = '') {
    const choices = getItemSizeChoices(item);
    if (!choices.length) return '';
    const raw = String(value || '').trim();
    return choices.some((choice) => String(choice.label) === raw) ? raw : String(choices[0].label);
}

function getItemEffectivePrice(item = null, sizeLabel = '') {
    const choices = getItemSizeChoices(item);
    const normalizedSize = normalizeSizeLabel(item, sizeLabel || item?.sizeLabel || '');
    const selected = choices.find((choice) => String(choice.label) === normalizedSize);
    return parseYenPrice(selected?.price || item?.price);
}

function buildFavoriteDrinkId(menuId, item, optionLabel = '', sizeLabel = '') {
    const sourceMenuId = String(menuId === 'favorite' ? (item?.menuId || '') : (menuId || '')).trim();
    const concept = String(item?.concept || item?.name || '').trim().toLowerCase();
    const size = normalizeSizeLabel(item, sizeLabel || item?.sizeLabel || '').toLowerCase();
    const price = getItemEffectivePrice(item, sizeLabel || item?.sizeLabel || '');
    const option = String(optionLabel || item?.optionLabel || '').trim().toLowerCase();
    return `${sourceMenuId}:${concept}:${price}:${option}:${size}`;
}

function sanitizeFavoriteDrinkEntry(entry = {}) {
    const menuId = String(entry?.menuId || '').trim();
    const concept = String(entry?.concept || entry?.name || '').trim();
    const price = parseYenPrice(entry?.price);
    if (!isFavoritableMenuId(menuId) || !concept || !price) return null;
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
        sizeLabel: String(entry?.sizeLabel || '').trim(),
        sizeOptions: Array.isArray(entry?.sizeOptions) ? entry.sizeOptions : [],
        optionLabelName: String(entry?.optionLabelName || '').trim(),
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

function buildFavoriteDrinkEntry(menuId, item, optionLabel = '', sizeLabel = '') {
    const sourceMenuId = String(menuId === 'favorite' ? (item?.menuId || '') : (menuId || '')).trim();
    const normalizedOption = String(optionLabel || item?.optionLabel || '').trim();
    const normalizedSize = normalizeSizeLabel(item, sizeLabel || item?.sizeLabel || '');
    const detailParts = [];
    if (normalizedOption) detailParts.push(`${getItemOptionFieldLabel(item)}: ${normalizedOption}`);
    else if (item?.content) detailParts.push(String(item.content).trim());
    if (normalizedSize) detailParts.push(`サイズ: ${normalizedSize}`);
    return sanitizeFavoriteDrinkEntry({
        favoriteId: buildFavoriteDrinkId(sourceMenuId, item, normalizedOption, normalizedSize),
        menuId: sourceMenuId,
        concept: String(item?.concept || item?.name || '').trim(),
        content: detailParts.filter(Boolean).join(' / '),
        price: getItemEffectivePrice(item, normalizedSize),
        image: item?.image,
        emoji: item?.emoji || getMenuItemEmoji(item),
        iconImage: getTroyMenuImage(sourceMenuId, item),
        optionLabel: normalizedOption,
        sizeLabel: normalizedSize,
        sizeOptions: getItemSizeChoices(item),
        optionLabelName: getItemOptionFieldLabel(item),
        savedAtMs: Date.now()
    });
}

function isFavoriteDrink(menuId, item, optionLabel = '', sizeLabel = '') {
    const favoriteId = buildFavoriteDrinkId(menuId, item, optionLabel, sizeLabel);
    return !!favoriteId && _favoriteDrinkEntries.some((entry) => entry.favoriteId === favoriteId);
}

function toggleFavoriteDrink(menuId, item, optionLabel = '', sizeLabel = '') {
    if (!isFavoritableMenuId(menuId, item)) return false;
    const entry = buildFavoriteDrinkEntry(menuId, item, optionLabel, sizeLabel);
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
    return TROY_PRODUCT_MENUS.food;
}

function getCustomMenuItems(menuId) {
    const targetMenuId = String(menuId || '').trim();
    return (Array.isArray(_menuCustomItems) ? _menuCustomItems : [])
        .filter((item) => String(item?.menuId || '').trim() === targetMenuId)
        .map((item) => ({
            concept: String(item?.concept || item?.name || '').trim(),
            content: String(item?.content || '').trim(),
            price: Math.max(0, Math.floor(Number(item?.price) || 0)),
            emoji: String(item?.emoji || '').trim(),
            image: String(item?.image || '').trim(),
            iconImage: String(item?.iconImage || item?.image || '').trim(),
            isCustomMenuItem: true
        }))
        .filter((item) => item.concept && item.price > 0);
}

function getMenuDataById(menuId) {
    const withCustomItems = (data) => {
        if (!data) return null;
        return {
            ...data,
            items: [...(Array.isArray(data.items) ? data.items : []), ...getCustomMenuItems(menuId)]
        };
    };
    switch (menuId) {
        case 'favorite':
            return getFavoriteDrinkMenuData();
        case 'food':
            return withCustomItems(getFoodMenuData());
        case 'bottle':
            return withCustomItems({ title: 'BOTTLE MENU', items: TROY_BOTTLE_ITEMS });
        case 'specials':
            return _menuSpecials.length > 0
                ? { title: 'おすすめ', items: _menuSpecials.map((s) => ({ concept: s.name, content: '', price: s.price, emoji: s.emoji || '⭐' })) }
                : null;
        default:
            return withCustomItems(TROY_PRODUCT_MENUS[menuId]);
    }
}

function getMenuCategoryList() {
    const ids = _menuSpecials.length > 0 ? ['specials', ...TROY_MENU_IDS] : TROY_MENU_IDS;
    return ids
        .map((id) => ({ id, data: getMenuDataById(id) }))
        .filter((entry) => !!entry.data)
        .map((entry) => ({ id: entry.id, title: entry.data.title }));
}

function getMenuItemKey(menuId, item, index) {
    return `${menuId}:${index}:${item?.concept || ''}:${item?.content || ''}`;
}

function getMenuItemOption(menuId, item, index) {
    const choices = getItemOptionChoices(item);
    if (!choices.length) return '';
    const key = getMenuItemKey(menuId, item, index);
    const current = String(_menuOptionByKey.get(key) || '').trim();
    return choices.includes(current) ? current : choices[0];
}

function setMenuItemOption(menuId, item, index, value) {
    const choices = getItemOptionChoices(item);
    if (!choices.length) return '';
    const key = getMenuItemKey(menuId, item, index);
    const normalized = choices.includes(String(value || '').trim()) ? String(value).trim() : choices[0];
    _menuOptionByKey.set(key, normalized);
    return normalized;
}

function getMenuItemSize(menuId, item, index) {
    const choices = getItemSizeChoices(item);
    if (!choices.length) return '';
    const key = getMenuItemKey(menuId, item, index);
    return normalizeSizeLabel(item, _menuSizeByKey.get(key));
}

function setMenuItemSize(menuId, item, index, value) {
    const choices = getItemSizeChoices(item);
    if (!choices.length) return '';
    const key = getMenuItemKey(menuId, item, index);
    const normalized = normalizeSizeLabel(item, value);
    _menuSizeByKey.set(key, normalized);
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

function ensureTroyMenuBoardAnchor(tab, menuBoard) {
    if (_menuBoardOriginalAnchor?.parentNode === tab) return _menuBoardOriginalAnchor;
    _menuBoardOriginalAnchor = document.createComment('troy-menu-board-original-position');
    tab.insertBefore(_menuBoardOriginalAnchor, menuBoard);
    return _menuBoardOriginalAnchor;
}

function updateTroyMenuBoardPlacement() {
    const tab = document.getElementById('tabContentTroy');
    const menuBoard = document.getElementById('troyMenuBoardSection');
    if (!tab || !menuBoard) return;

    const anchor = ensureTroyMenuBoardAnchor(tab, menuBoard);
    if (canUseTroyMenu()) {
        if (tab.firstElementChild !== menuBoard) {
            tab.insertBefore(menuBoard, tab.firstElementChild);
        }
        return;
    }

    if (anchor.parentNode === tab && anchor.nextSibling !== menuBoard) {
        tab.insertBefore(menuBoard, anchor.nextSibling);
    }
}

function updateOrderAvailability() {
    updateTroyStatusInline();
    setMenuButtonsEnabled(canUseTroyMenu());
    updateTroyCoinConvertPanel();
    renderTroyMenuBoard();
    updateTroyPrimaryAction();
    applyOrderEntryClosedPrimaryState();
}

function canUseTroyMenu(playFabId = window.myPlayFabId) {
    return TROY_ORDER_ENTRY_ENABLED && !!_lastStatus?.isOpen && isTroyMember(_lastStatus, playFabId);
}

function setMenuButtonsEnabled(enabled) {
    const menuButtons = Array.from(document.querySelectorAll('.troy-menu-item-button[data-menu-id]'));
    menuButtons.forEach((button) => {
        button.classList.toggle('is-disabled', !enabled);
        button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    });
}

function showTroyNotice(message) {
    if (typeof window.showRpgMessage === 'function') {
        window.showRpgMessage(message);
        return;
    }
    alert(message);
}

function scrollTroyEntryIntoView() {
    const entrySection = document.getElementById('troyEntrySection');
    const primaryCard = document.getElementById('troyPrimaryActionCard');
    (entrySection || primaryCard)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function clickTroyJoinButton() {
    const joinBtn = document.getElementById('btnTroyJoin');
    if (!joinBtn || joinBtn.disabled) return;
    joinBtn.click();
}

function updateTroyRoleUI() {
    const menuSection = document.getElementById('troyMenuSection');
    if (menuSection) {
        menuSection.style.display = 'none';
    }
    const menuList = document.querySelector('#troyMenuSection .troy-menu-list');
    if (menuList) {
        menuList.hidden = true;
    }
    const menuModal = document.getElementById('troyMenuModal');
    if (menuModal) {
        menuModal.hidden = true;
        menuModal.style.display = 'none';
    }
    const openTabCard = document.getElementById('troyOpenTabCard');
    if (openTabCard) openTabCard.hidden = true;
    const orderStatus = document.getElementById('troyOrderStatusInline');
    if (orderStatus) orderStatus.hidden = false;
    applyOrderEntryClosedPrimaryState();
}

function applyOrderEntryClosedPrimaryState() {
    if (TROY_ORDER_ENTRY_ENABLED) return;
    const title = document.getElementById('troyPrimaryActionTitle');
    const meta = document.getElementById('troyPrimaryActionMeta');
    const button = document.getElementById('btnTroyPrimaryAction');
    if (!title || !meta || !button || !_lastStatus?.isOpen) return;

    const isMember = isTroyMember(_lastStatus, window.myPlayFabId);
    if (!isMember) {
        title.textContent = '入店できます';
        meta.textContent = 'ご注文はスタッフにお伝えください。';
        button.textContent = '入店';
        button.disabled = false;
        return;
    }
    title.textContent = '入店中';
    meta.textContent = 'ご注文はスタッフにお伝えください。';
    button.textContent = '入店済み';
    button.disabled = true;
}

function formatYen(value) {
    const amount = Number(value) || 0;
    return `¥${amount.toLocaleString('ja-JP')}`;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getMenuBoardCategoryList() {
    return getMenuCategoryList().filter((entry) => entry.id !== 'favorite');
}

function getMenuBoardPriceText(item = null) {
    const sizeChoices = getItemSizeChoices(item);
    if (sizeChoices.length) {
        const prices = sizeChoices.map((choice) => parseYenPrice(choice.price)).filter((price) => price > 0);
        const minPrice = prices.length ? Math.min(...prices) : 0;
        return minPrice > 0 ? `${formatYen(minPrice)}〜` : 'サイズ選択';
    }
    const price = parseYenPrice(item?.price);
    return price > 0 ? formatYen(price) : 'ASK';
}

function getMenuBoardDetailText(item = null) {
    const parts = [];
    const content = String(item?.content || '').trim();
    if (content && !/選択$/.test(content)) parts.push(content);
    const optionChoices = getItemOptionChoices(item);
    if (optionChoices.length) {
        parts.push(`${getItemOptionFieldLabel(item)}: ${optionChoices.join(' / ')}`);
    }
    return parts.join(' ・ ');
}

function createMenuBoardIcon(item = null, menuId = '') {
    const icon = document.createElement('div');
    icon.className = 'troy-menu-board-icon';
    const iconImage = getTroyMenuImage(menuId, item);
    if (iconImage) {
        const image = document.createElement('img');
        image.src = iconImage;
        image.alt = '';
        image.loading = 'lazy';
        icon.classList.add('has-image');
        icon.appendChild(image);
    } else {
        icon.textContent = item?.emoji || getMenuItemEmoji(item);
    }
    icon.setAttribute('aria-hidden', 'true');
    return icon;
}

function createMenuBoardCategoryIcon(menuId = '') {
    const icon = document.createElement('span');
    icon.className = 'troy-menu-board-tab-icon';
    icon.setAttribute('aria-hidden', 'true');
    const iconImage = getTroyMenuCategoryImage(menuId);
    if (iconImage) {
        const image = document.createElement('img');
        image.src = iconImage;
        image.alt = '';
        image.loading = 'lazy';
        icon.appendChild(image);
    }
    return icon;
}

function getMenuBoardItemFromRow(row) {
    if (!row) return null;
    const menuId = String(row.dataset.menuId || '').trim();
    const index = Math.floor(Number(row.dataset.itemIndex));
    const data = getMenuDataById(menuId);
    const item = Array.isArray(data?.items) && Number.isFinite(index) ? data.items[index] : null;
    return item ? { menuId, index, item } : null;
}

function canShowMenuBoardOrderControls(menuId, item = null) {
    if (!TROY_ORDER_ENTRY_ENABLED) return false;
    if (!menuId || menuId === 'favorite' || menuId === 'specials') return false;
    if (item?.isCustomMenuItem || item?.disabled) return false;
    return getItemEffectivePrice(item, normalizeSizeLabel(item, item?.sizeLabel || '')) > 0;
}

function getMenuBoardOrderElements() {
    return {
        modal: document.getElementById('troyMenuBoardOrderModal'),
        card: document.querySelector('#troyMenuBoardOrderModal .troy-menu-board-order-card'),
        close: document.getElementById('troyMenuBoardOrderClose'),
        icon: document.getElementById('troyMenuBoardOrderIcon'),
        title: document.getElementById('troyMenuBoardOrderTitle'),
        detail: document.getElementById('troyMenuBoardOrderDetail'),
        optionField: document.getElementById('troyMenuBoardOrderOptionField'),
        optionLabel: document.getElementById('troyMenuBoardOrderOptionLabel'),
        option: document.getElementById('troyMenuBoardOrderOption'),
        sizeField: document.getElementById('troyMenuBoardOrderSizeField'),
        sizes: document.getElementById('troyMenuBoardOrderSizes'),
        qty: document.getElementById('troyMenuBoardOrderQty'),
        total: document.getElementById('troyMenuBoardOrderTotal'),
        submit: document.getElementById('troyMenuBoardOrderSubmit')
    };
}

function setTroyMenuBoardOrderModalVisible(visible) {
    const { modal } = getMenuBoardOrderElements();
    if (!modal) return;
    modal.hidden = !visible;
    document.body.classList.toggle('modal-lock', !!visible);
    if (!visible) _menuBoardOrderDraft = null;
}

function updateMenuBoardOrderTotal() {
    const { total, qty } = getMenuBoardOrderElements();
    if (!total || !_menuBoardOrderDraft) return;
    const quantity = Math.max(1, Math.floor(Number(qty?.value) || 1));
    const sizeLabel = String(_menuBoardOrderDraft.sizeLabel || '').trim();
    const price = getItemEffectivePrice(_menuBoardOrderDraft.item, sizeLabel);
    total.textContent = `${formatYen(price * quantity)} / x${quantity}`;
}

function renderMenuBoardOrderIcon(container, item, menuId) {
    if (!container) return;
    container.innerHTML = '';
    const iconImage = getTroyMenuImage(menuId, item);
    if (iconImage) {
        const image = document.createElement('img');
        image.src = iconImage;
        image.alt = '';
        image.loading = 'lazy';
        container.classList.add('has-image');
        container.appendChild(image);
    } else {
        container.classList.remove('has-image');
        container.textContent = item?.emoji || getMenuItemEmoji(item);
    }
}

function openMenuBoardOrderModal(row) {
    const found = getMenuBoardItemFromRow(row);
    if (!found) return;
    if (!canUseTroyMenu()) {
        showTroyNotice(_lastStatus?.isOpen ? '入店してから注文できます。' : 'TROYはCLOSE中です。');
        if (_lastStatus?.isOpen) scrollTroyEntryIntoView();
        return;
    }

    const { menuId, index, item } = found;
    const nameText = String(item?.concept || item?.name || '').trim();
    if (!canShowMenuBoardOrderControls(menuId, item) || _menuDisabled.includes(nameText)) return;

    const elements = getMenuBoardOrderElements();
    if (!elements.modal) return;
    const optionChoices = getItemOptionChoices(item);
    const sizeChoices = getItemSizeChoices(item);
    const optionLabel = getMenuItemOption(menuId, item, index);
    const sizeLabel = getMenuItemSize(menuId, item, index);
    const quantity = getMenuItemQty(menuId, item, index);
    _menuBoardOrderDraft = { menuId, index, item, optionLabel, sizeLabel };

    renderMenuBoardOrderIcon(elements.icon, item, menuId);
    if (elements.title) elements.title.textContent = nameText || '商品';
    if (elements.detail) elements.detail.textContent = getMenuBoardDetailText(item) || ' ';

    if (elements.optionField && elements.option) {
        elements.option.innerHTML = '';
        elements.optionField.hidden = optionChoices.length <= 0;
        if (elements.optionLabel) elements.optionLabel.textContent = getItemOptionFieldLabel(item);
        optionChoices.forEach((choice) => {
            const option = document.createElement('option');
            option.value = String(choice || '');
            option.textContent = String(choice || '');
            option.selected = option.value === optionLabel;
            elements.option.appendChild(option);
        });
    }

    if (elements.sizeField && elements.sizes) {
        elements.sizes.innerHTML = '';
        elements.sizeField.hidden = sizeChoices.length <= 0;
        sizeChoices.forEach((choice) => {
            const label = String(choice?.label || '').trim();
            if (!label) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'troy-menu-board-size-choice';
            button.dataset.troyMenuBoardSize = label;
            button.classList.toggle('is-active', label === sizeLabel);
            button.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(formatYen(choice.price))}</strong>`;
            elements.sizes.appendChild(button);
        });
    }

    if (elements.qty) {
        elements.qty.innerHTML = '';
        for (let value = 1; value <= 9; value += 1) {
            const option = document.createElement('option');
            option.value = String(value);
            option.textContent = `x${value}`;
            option.selected = value === quantity;
            elements.qty.appendChild(option);
        }
    }

    if (elements.submit) {
        elements.submit.disabled = false;
        elements.submit.textContent = '注文する';
    }
    updateMenuBoardOrderTotal();
    setTroyMenuBoardOrderModalVisible(true);
}

async function submitMenuBoardOrder() {
    const { option, qty, submit } = getMenuBoardOrderElements();
    if (!_menuBoardOrderDraft || !submit || submit.disabled) return;
    if (!canUseTroyMenu()) {
        showTroyNotice(_lastStatus?.isOpen ? '入店してから注文できます。' : 'TROYはCLOSE中です。');
        setTroyMenuBoardOrderModalVisible(false);
        if (_lastStatus?.isOpen) scrollTroyEntryIntoView();
        return;
    }

    const { menuId, index, item } = _menuBoardOrderDraft;
    const optionLabel = option && !option.closest('[hidden]') ? setMenuItemOption(menuId, item, index, option.value) : getMenuItemOption(menuId, item, index);
    const sizeLabel = _menuBoardOrderDraft.sizeLabel ? setMenuItemSize(menuId, item, index, _menuBoardOrderDraft.sizeLabel) : getMenuItemSize(menuId, item, index);
    const quantity = qty ? setMenuItemQty(menuId, item, index, qty.value) : getMenuItemQty(menuId, item, index);
    const previousText = submit.textContent;
    submit.disabled = true;
    submit.textContent = '送信中';

    try {
        await createTroyCustomerOrderRequest(window.myPlayFabId, {
            troyNation: resolveTroyNationKey(),
            menuId,
            concept: String(item?.concept || item?.name || '').trim(),
            content: String(item?.content || '').trim(),
            optionLabel,
            sizeLabel,
            quantity,
            displayName: getDisplayName(),
            requestId: createRequestId('troy-customer-order')
        }, { throwOnError: true });
        submit.textContent = '送信済み';
        setTroyMenuBoardOrderModalVisible(false);
        showTroyNotice('スタッフに注文を送りました。受付までお待ちください。');
    } catch (error) {
        console.warn('[TroyOrder] Customer request failed:', error);
        submit.textContent = previousText || '注文する';
        submit.disabled = false;
        showTroyNotice(error?.message || '注文を送信できませんでした。');
    }
}

function renderTroyMenuBoard() {
    const tabsEl = document.getElementById('troyMenuBoardCategoryTabs');
    const listEl = document.getElementById('troyMenuBoardList');
    if (!listEl) return;

    const categories = getMenuBoardCategoryList();
    const fallback = categories.find((entry) => entry.id === 'beer') || categories[0] || null;
    if (!categories.some((entry) => entry.id === _menuBoardActiveId)) {
        _menuBoardActiveId = fallback?.id || 'beer';
    }

    if (tabsEl) {
        tabsEl.innerHTML = '';
        categories.forEach((entry) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'troy-menu-board-tab';
            button.dataset.menuId = entry.id;
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-selected', entry.id === _menuBoardActiveId ? 'true' : 'false');
            button.classList.toggle('is-active', entry.id === _menuBoardActiveId);
            const label = document.createElement('span');
            label.className = 'troy-menu-board-tab-label';
            label.textContent = entry.title;
            button.append(createMenuBoardCategoryIcon(entry.id), label);
            tabsEl.appendChild(button);
        });
    }

    const data = getMenuDataById(_menuBoardActiveId);
    const items = Array.isArray(data?.items) ? data.items : [];
    listEl.innerHTML = '';
    if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'troy-calendar-empty';
        empty.textContent = '表示できるメニューがありません。';
        listEl.appendChild(empty);
        return;
    }

    items.forEach((item, index) => {
        const row = document.createElement('article');
        row.className = 'troy-menu-board-item';
        row.dataset.menuId = _menuBoardActiveId;
        row.dataset.itemIndex = String(index);
        const nameText = String(item?.concept || item?.name || '').trim();
        const isSoldOut = _menuDisabled.includes(nameText);
        const canOrderItem = canShowMenuBoardOrderControls(_menuBoardActiveId, item) && !isSoldOut;
        row.classList.toggle('is-sold-out', isSoldOut);
        row.classList.toggle('is-orderable', canOrderItem);
        if (canOrderItem) {
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
        }

        const body = document.createElement('div');
        body.className = 'troy-menu-board-body';

        const name = document.createElement('div');
        name.className = 'troy-menu-board-name';
        name.textContent = nameText || '商品';

        const detailText = getMenuBoardDetailText(item);
        const detail = document.createElement('div');
        detail.className = 'troy-menu-board-detail';
        detail.textContent = detailText || ' ';

        body.append(name, detail);

        const priceWrap = document.createElement('div');
        priceWrap.className = 'troy-menu-board-price-wrap';

        const price = document.createElement('div');
        price.className = 'troy-menu-board-price';
        price.textContent = getMenuBoardPriceText(item);
        priceWrap.appendChild(price);

        if (isSoldOut) {
            const badge = document.createElement('div');
            badge.className = 'troy-menu-board-badge';
            badge.textContent = 'SOLD OUT';
            priceWrap.appendChild(badge);
        } else if (item?.disabled && !parseYenPrice(item?.price)) {
            const badge = document.createElement('div');
            badge.className = 'troy-menu-board-badge is-ask';
            badge.textContent = 'STAFF';
            priceWrap.appendChild(badge);
        } else if (canOrderItem) {
            const badge = document.createElement('div');
            badge.className = 'troy-menu-board-badge is-select';
            badge.textContent = '選択';
            priceWrap.appendChild(badge);
        }

        row.append(createMenuBoardIcon(item, _menuBoardActiveId), body, priceWrap);
        listEl.appendChild(row);
    });
}

function wireTroyMenuBoard() {
    if (_menuBoardWired) return;
    _menuBoardWired = true;
    const tabsEl = document.getElementById('troyMenuBoardCategoryTabs');
    if (tabsEl) {
        tabsEl.addEventListener('click', (event) => {
            const button = event.target?.closest?.('.troy-menu-board-tab[data-menu-id]');
            if (!button) return;
            _menuBoardActiveId = button.dataset.menuId || _menuBoardActiveId;
            renderTroyMenuBoard();
        });
    }
    const listEl = document.getElementById('troyMenuBoardList');
    if (listEl) {
        listEl.addEventListener('click', (event) => {
            const row = event.target?.closest?.('.troy-menu-board-item.is-orderable');
            if (!row) return;
            openMenuBoardOrderModal(row);
        });
        listEl.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const row = event.target?.closest?.('.troy-menu-board-item.is-orderable');
            if (!row) return;
            event.preventDefault();
            openMenuBoardOrderModal(row);
        });
    }
    const orderModal = document.getElementById('troyMenuBoardOrderModal');
    if (orderModal) {
        orderModal.addEventListener('click', (event) => {
            if (event.target === orderModal || event.target?.closest?.('#troyMenuBoardOrderClose')) {
                setTroyMenuBoardOrderModalVisible(false);
                return;
            }
            const sizeButton = event.target?.closest?.('[data-troy-menu-board-size]');
            if (sizeButton && _menuBoardOrderDraft) {
                _menuBoardOrderDraft.sizeLabel = String(sizeButton.dataset.troyMenuBoardSize || '').trim();
                orderModal.querySelectorAll('[data-troy-menu-board-size]').forEach((button) => {
                    button.classList.toggle('is-active', button === sizeButton);
                });
                updateMenuBoardOrderTotal();
                return;
            }
            if (event.target?.closest?.('#troyMenuBoardOrderSubmit')) {
                void submitMenuBoardOrder();
            }
        });
        orderModal.addEventListener('change', (event) => {
            if (event.target?.matches?.('#troyMenuBoardOrderQty')) {
                updateMenuBoardOrderTotal();
            }
        });
    }
    renderTroyMenuBoard();
}

function formatTroyCalendarDate(ms) {
    const value = Number(ms || 0);
    if (!value) return '';
    return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short'
    }).format(new Date(value));
}

function toTroyReservationDateTimeValue(entry) {
    const date = String(entry?.date || '').trim();
    const openTime = String(entry?.openTime || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(openTime)) {
        return `${date}T${openTime}`;
    }
    const value = Number(entry?.startsAtMs || 0);
    if (!value) return '';
    const d = new Date(value);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getTroyCalendarStatusLabel(status) {
    switch (String(status || '').toLowerCase()) {
        case 'closed': return '休業';
        case 'private': return '貸切';
        case 'tentative': return '仮予定';
        default: return '営業';
    }
}

function renderTroyBusinessCalendarItem(entry) {
    const status = String(entry?.status || 'open').toLowerCase();
    const canReserve = status === 'open';
    const time = status === 'closed'
        ? '休業'
        : `${entry.openTime || '--:--'}-${entry.closeTime || '--:--'}`;
    const note = entry.note ? `<div class="troy-calendar-note">${escapeHtml(entry.note)}</div>` : '';
    return `
        <div class="troy-calendar-item is-${escapeHtml(status)}${canReserve ? ' is-reservable' : ''}" ${canReserve ? `data-troy-calendar-reserve="${escapeHtml(entry.id || '')}" role="button" tabindex="0"` : ''}>
            <div class="troy-calendar-date">${escapeHtml(formatTroyCalendarDate(entry.startsAtMs))}</div>
            <div class="troy-calendar-main">
                <div class="troy-calendar-title-row">
                    <strong>${escapeHtml(entry.title || 'TROY営業')}</strong>
                    <span class="troy-calendar-status">${escapeHtml(getTroyCalendarStatusLabel(status))}</span>
                </div>
                <div class="troy-calendar-time">${escapeHtml(time)}</div>
                ${note}
                ${canReserve ? '<div class="troy-calendar-reserve-hint">クリックして予約申請</div>' : ''}
            </div>
        </div>
    `;
}

function renderTroyBusinessCalendar(entries = _businessCalendar) {
    const listEl = document.getElementById('troyBusinessCalendarList');
    const metaEl = document.getElementById('troyBusinessCalendarMeta');
    if (!listEl) return;
    const rows = Array.isArray(entries) ? entries : [];
    if (metaEl) {
        metaEl.textContent = rows.length ? `今後の営業予定 ${rows.length}件` : '今後の営業予定';
    }
    if (!rows.length) {
        listEl.innerHTML = '<div class="troy-calendar-empty">営業予定はまだありません。</div>';
        return;
    }
    const directEntries = rows.slice(0, TROY_CALENDAR_DIRECT_LIMIT);
    const collapsedEntries = rows.slice(TROY_CALENDAR_DIRECT_LIMIT);
    const collapsedBlock = collapsedEntries.length
        ? `
            <details class="troy-calendar-collapsed">
                <summary>他の営業予定 ${collapsedEntries.length}件</summary>
                <div class="troy-calendar-collapsed-list">
                    ${collapsedEntries.map(renderTroyBusinessCalendarItem).join('')}
                </div>
            </details>
        `
        : '';
    listEl.innerHTML = `${directEntries.map(renderTroyBusinessCalendarItem).join('')}${collapsedBlock}`;
}

async function loadTroyBusinessCalendar(playFabId) {
    renderTroyBusinessCalendar([]);
    try {
        const result = await getTroyCalendar(playFabId, {}, { isSilent: true });
        _businessCalendar = Array.isArray(result?.calendar) ? result.calendar : [];
        renderTroyBusinessCalendar(_businessCalendar);
    } catch (error) {
        console.warn('[TroyCalendar] Failed:', error?.message || error);
        const listEl = document.getElementById('troyBusinessCalendarList');
        if (listEl) listEl.innerHTML = '<div class="troy-calendar-empty">営業予定を読み込めませんでした。</div>';
    }
}

function updateTroyReservationPurposeHelp() {
    const purposeEl = document.getElementById('reservationPurpose');
    const partySizeEl = document.getElementById('reservationPartySize');
    const helpEl = document.getElementById('reservationPrivateHelp');
    if (!helpEl) return;
    const isPrivate = purposeEl?.value === 'private';
    helpEl.style.display = isPrivate ? '' : 'none';
    if (isPrivate && partySizeEl && Number(partySizeEl.value || 0) < 10) {
        partySizeEl.value = '10';
    }
}

function openTroyReservationForm(entry) {
    if (!entry || String(entry.status || 'open').toLowerCase() !== 'open') return;
    _selectedReservationCalendarEntry = entry;
    const panel = document.getElementById('troyReservationPanel');
    const selectedEl = document.getElementById('troyReservationSelectedDate');
    const startsAtEl = document.getElementById('reservationStartsAt');
    if (selectedEl) {
        selectedEl.textContent = `${formatTroyCalendarDate(entry.startsAtMs)} ${entry.openTime || '--:--'}-${entry.closeTime || '--:--'} の予約`;
    }
    if (startsAtEl) {
        startsAtEl.value = toTroyReservationDateTimeValue(entry);
    }
    updateTroyReservationPurposeHelp();
    if (panel) {
        panel.hidden = false;
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

async function submitTroyReservation(playFabId) {
    const startsAt = document.getElementById('reservationStartsAt')?.value || '';
    const partySize = document.getElementById('reservationPartySize')?.value || 1;
    const purpose = document.getElementById('reservationPurpose')?.value || 'visit';
    const note = document.getElementById('reservationNote')?.value || '';
    const selectedDate = String(_selectedReservationCalendarEntry?.date || '').trim();
    if (selectedDate && !String(startsAt || '').startsWith(`${selectedDate}T`)) {
        showTroyNotice('選択した営業日の時間で予約してください。');
        return;
    }
    try {
        const data = await requestCreateReservation(playFabId, {
            startsAt,
            startsAtMs: Date.parse(startsAt),
            partySize,
            purpose,
            note,
            nation: window.myAvatarBaseInfo?.Nation || window.myAvatarBaseInfo?.nation || '',
            displayName: window.myPlayFabDisplayName || '',
            requestId: createRequestId('troy-reservation-create')
        }, { throwOnError: true });
        if (data?.success) {
            const noteEl = document.getElementById('reservationNote');
            const panel = document.getElementById('troyReservationPanel');
            if (noteEl) noteEl.value = '';
            if (panel) panel.hidden = true;
            _selectedReservationCalendarEntry = null;
            showTroyNotice('予約申請を送信しました。王の承認後に確定します。');
        }
    } catch (error) {
        showTroyNotice(error?.message || '予約申請に失敗しました。');
    }
}

function updatePointsDisplays(points) {
    const value = Number(points);
    if (!Number.isFinite(value)) return;
    const currentPointsEl = document.getElementById('currentPoints');
    if (currentPointsEl) currentPointsEl.innerText = String(value);
    const globalPointsEl = document.getElementById('globalPoints');
    if (globalPointsEl) globalPointsEl.innerText = String(value);
}

function getTroyCoinConvertElements() {
    return {
        panel: document.getElementById('troyCoinConvertPanel'),
        input: document.getElementById('troyCoinConvertAmount'),
        button: document.getElementById('btnTroyCoinConvert'),
        message: document.getElementById('troyCoinConvertMessage')
    };
}

function normalizeTroyCoinConvertAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 0;
    if (Math.floor(amount) !== amount) return 0;
    if (amount <= 0 || amount > 1000000) return 0;
    if (amount % 100 !== 0) return 0;
    return amount;
}

function setTroyCoinConvertMessage(message = '', tone = '') {
    const { message: messageEl } = getTroyCoinConvertElements();
    if (!messageEl) return;
    messageEl.textContent = message;
    messageEl.dataset.tone = tone || '';
}

function updateTroyCoinConvertPanel() {
    const { panel, input, button } = getTroyCoinConvertElements();
    if (!panel) return;
    const available = canUseTroyMenu();
    panel.hidden = !available;
    if (input) input.disabled = !available;
    if (button) button.disabled = !available;
    if (!available) setTroyCoinConvertMessage('');
}

async function submitTroyCoinConvert(playFabId = window.myPlayFabId) {
    const { input, button } = getTroyCoinConvertElements();
    if (!button || button.disabled) return;
    if (!canUseTroyMenu(playFabId)) {
        showTroyNotice(_lastStatus?.isOpen ? '入店してからチップ化できます。' : 'TROYはCLOSE中です。');
        updateTroyCoinConvertPanel();
        return;
    }

    const amount = normalizeTroyCoinConvertAmount(input?.value);
    if (!amount) {
        setTroyCoinConvertMessage('100G単位で入力してください。', 'error');
        return;
    }

    const previousText = button.textContent;
    button.disabled = true;
    button.textContent = '処理中';
    setTroyCoinConvertMessage('');

    try {
        const result = await convertTroyGoldToCoin(
            playFabId,
            amount,
            createRequestId('troy-customer-chip'),
            { throwOnError: true }
        );
        if (Number.isFinite(Number(result?.newBalance))) {
            updatePointsDisplays(Number(result.newBalance));
        }
        setTroyCoinConvertMessage(`${amount.toLocaleString('ja-JP')}Gをチップ化しました。スタッフからチップを受け取ってください。`, 'success');
        showTroyNotice('チップ化しました。スタッフからチップを受け取ってください。');
    } catch (error) {
        console.warn('[TroyCoin] Customer chip conversion failed:', error);
        setTroyCoinConvertMessage(error?.message || 'チップ化に失敗しました。', 'error');
    } finally {
        button.disabled = !canUseTroyMenu(playFabId);
        button.textContent = previousText || 'チップ化';
    }
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
    if (text.includes('ゴールド購入') || text.includes('ゴールド')) return '🪙';
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

function getMenuSubnote(menuId) {
    switch (menuId) {
        case 'favorite':
            return '★ お気に入り';
        case 'beer':
            return '⚓ ビール・ハイボール';
        case 'gin':
            return '⚔ ジンベース';
        case 'vodka':
            return '☠ ウォッカベース';
        case 'rum':
            return '🌴 ラムベース';
        case 'tequila':
            return '🔥 テキーラベース';
        case 'liqueur':
            return '🍷 リキュール・その他';
        case 'whisky':
            return '🥃 ウイスキー・焼酎・ワイン';
        case 'soft':
            return '🥤 ソフトドリンク';
        case 'bottle':
            return '🍾 BOTTLE MENU';
        case 'food':
            return '🍴 酒場のフード';
        default:
            return '';
    }
}

function getOrderItemName(item, optionLabel = '', sizeLabel = '') {
    const concept = item?.concept || item?.name || '商品';
    const parts = [];
    if (optionLabel) {
        const optionFieldLabel = getItemOptionFieldLabel(item);
        parts.push(optionFieldLabel === '割り物' ? `× ${optionLabel}` : optionLabel);
    } else if (item?.content) {
        parts.push(item.content);
    }
    const normalizedSize = normalizeSizeLabel(item, sizeLabel || item?.sizeLabel || '');
    if (normalizedSize) parts.push(normalizedSize);
    return parts.length ? `${concept} (${parts.join(' / ')})` : concept;
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

function updateTroyStatusInline() {
    const status = document.getElementById('troyOrderStatusInline');
    if (!status) return;
    if (!_lastStatus?.isOpen) {
        status.textContent = 'TROYはCLOSE中です。';
        status.classList.remove('is-pending');
        return;
    }
    status.textContent = isTroyMember(_lastStatus, window.myPlayFabId)
        ? '入店中です。ご注文はスタッフにお伝えください。'
        : '入店できます。ご注文はスタッフにお伝えください。';
    status.classList.remove('is-pending');
}

function updateTroyPrimaryAction() {
    const card = document.getElementById('troyPrimaryActionCard');
    const title = document.getElementById('troyPrimaryActionTitle');
    const meta = document.getElementById('troyPrimaryActionMeta');
    const button = document.getElementById('btnTroyPrimaryAction');
    if (!card || !title || !meta || !button) return;

    const isOpen = !!_lastStatus?.isOpen;
    const isMember = isTroyMember(_lastStatus, window.myPlayFabId);

    card.classList.toggle('is-open', isOpen);
    card.classList.toggle('is-member', isMember);
    button.disabled = false;

    if (!isOpen) {
        title.textContent = 'TROYはCLOSE中';
        meta.textContent = 'OPENになると入店できます。';
        button.textContent = 'CLOSE';
        button.disabled = true;
        return;
    }
    if (!isMember) {
        title.textContent = '入店できます';
        meta.textContent = 'ご注文はスタッフにお伝えください。';
        button.textContent = '入店';
        return;
    }
    title.textContent = '入店中';
    meta.textContent = 'ご注文はスタッフにお伝えください。';
    button.textContent = '入店済み';
    button.disabled = true;
}

async function submitQuickCheckout(playFabId, item = {}, quantity = 1) {
    if (!canUseTroyMenu(playFabId)) {
        showTroyNotice(_lastStatus?.isOpen ? '入店してから注文できます。' : 'TROYはCLOSE中です。');
        return;
    }
    const menuId = String(item?.menuId || _menuActiveId || _menuBoardActiveId || '').trim();
    try {
        await createTroyCustomerOrderRequest(playFabId, {
            troyNation: resolveTroyNationKey(),
            menuId,
            concept: String(item?.concept || item?.name || '').trim(),
            content: String(item?.content || '').trim(),
            optionLabel: String(item?.optionLabel || '').trim(),
            sizeLabel: String(item?.sizeLabel || '').trim(),
            quantity,
            displayName: getDisplayName(),
            requestId: createRequestId('troy-customer-order')
        }, { throwOnError: true });
        showTroyNotice('スタッフに注文を送りました。受付までお待ちください。');
    } catch (error) {
        console.warn('[TroyOrder] Customer request failed:', error);
        showTroyNotice(error?.message || '注文を送信できませんでした。');
    }
}
function openMenuModal(menuId) {
    if (!TROY_ORDER_ENTRY_ENABLED) {
        showTroyNotice('ご注文はスタッフにお伝えください。');
        return;
    }
    if (!canUseTroyMenu()) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage(_lastStatus?.isOpen ? '入店してから注文できます。' : 'TROYはCLOSE中です。');
        }
        return;
    }
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
            ? 'お気に入り登録したドリンクとフードがここに表示されます。'
            : '表示できる商品がありません。';
        list.appendChild(empty);
        modal.style.display = 'flex';
        return;
    }
    data.items.forEach((item, index) => {
        const cardEl = document.createElement('article');
        cardEl.className = 'troy-menu-modal-item';
        const isSoldOut = _menuDisabled.includes(item.concept);

        const hero = document.createElement('div');
        hero.className = 'troy-menu-modal-emoji';
        const heroImage = getTroyMenuImage(menuId, item);
        if (heroImage) {
            const image = document.createElement('img');
            image.src = heroImage;
            image.alt = '';
            image.loading = 'lazy';
            hero.classList.add('has-image');
            hero.appendChild(image);
        } else {
            hero.textContent = item.emoji || getMenuItemEmoji(item);
        }
        hero.setAttribute('aria-hidden', 'true');

        const body = document.createElement('div');
        body.className = 'troy-menu-modal-item-body';

        const concept = document.createElement('div');
        concept.className = 'troy-menu-modal-item-name';
        concept.textContent = item.concept || item.name || '';

        const content = document.createElement('div');
        content.className = 'troy-menu-modal-item-content';
        content.textContent = item.content || '';

        let optionLabel = menuId === 'favorite' ? String(item?.optionLabel || '').trim() : '';
        let sizeLabel = normalizeSizeLabel(item, menuId === 'favorite' ? String(item?.sizeLabel || '').trim() : '');
        let optionRow = null;
        const optionChoices = getItemOptionChoices(item);
        if (optionChoices.length) {
            optionRow = document.createElement('div');
            optionRow.className = 'troy-menu-modal-option-row';

            const optionLabelEl = document.createElement('label');
            optionLabelEl.className = 'troy-menu-modal-option-label';
            optionLabelEl.textContent = getItemOptionFieldLabel(item);

            const optionSelect = document.createElement('select');
            optionSelect.className = 'troy-menu-mix-select';
            optionChoices.forEach((option) => {
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

        let sizeRow = null;
        const sizeChoices = getItemSizeChoices(item);
        if (sizeChoices.length) {
            sizeRow = document.createElement('div');
            sizeRow.className = 'troy-menu-modal-option-row';

            const sizeLabelEl = document.createElement('label');
            sizeLabelEl.className = 'troy-menu-modal-option-label';
            sizeLabelEl.textContent = 'サイズ';

            const sizeSelect = document.createElement('select');
            sizeSelect.className = 'troy-menu-mix-select';
            sizeChoices.forEach((choice) => {
                const optionEl = document.createElement('option');
                optionEl.value = choice.label;
                optionEl.textContent = `${choice.label} / ${formatYen(choice.price)}`;
                sizeSelect.appendChild(optionEl);
            });
            sizeSelect.value = getMenuItemSize(menuId, item, index);
            sizeLabel = sizeSelect.value;
            sizeSelect.addEventListener('change', () => {
                sizeLabel = setMenuItemSize(menuId, item, index, sizeSelect.value);
                price.textContent = formatYen(getItemEffectivePrice(item, sizeLabel));
                syncFavoriteButton();
            });
            sizeRow.append(sizeLabelEl, sizeSelect);
        }

        const meta = document.createElement('div');
        meta.className = 'troy-menu-modal-item-meta';

        const price = document.createElement('span');
        price.className = 'troy-menu-modal-price';
        price.textContent = item.disabled && !item.price ? 'ASK' : formatYen(getItemEffectivePrice(item, sizeLabel));

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
        const isUnavailable = !!item.disabled || !item.price;
        quickBtn.textContent = isUnavailable ? 'スタッフまで' : '注文する';
        quickBtn.disabled = !canUseTroyMenu() || isSoldOut || isUnavailable;
        if (isSoldOut) {
            cardEl.classList.add('is-sold-out');
            minusBtn.disabled = true;
            plusBtn.disabled = true;
        }
        if (isUnavailable) {
            minusBtn.disabled = true;
            plusBtn.disabled = true;
        }

        let favoriteBtn = null;
        const syncFavoriteButton = () => {
            if (!favoriteBtn) return;
            const active = isFavoriteDrink(menuId, item, optionLabel, sizeLabel);
            favoriteBtn.classList.toggle('is-active', active);
            favoriteBtn.textContent = active ? '★ お気に入り' : 'お気に入り';
        };

        if (isFavoritableMenuId(menuId, item)) {
            favoriteBtn = document.createElement('button');
            favoriteBtn.type = 'button';
            favoriteBtn.className = 'troy-menu-favorite-btn';
            favoriteBtn.addEventListener('click', () => {
                const active = toggleFavoriteDrink(menuId, item, optionLabel, sizeLabel);
                syncFavoriteButton();
                if (_menuActiveId === 'favorite') {
                    openMenuModal('favorite');
                }
                if (typeof window.showRpgMessage === 'function') {
                    window.showRpgMessage(active ? 'お気に入りに追加しました。' : 'お気に入りから外しました。');
                }
            });
        }

        const syncQty = () => {
            const qty = getMenuItemQty(menuId, item, index);
            qtyDisplay.textContent = `${qty}`;
            minusBtn.disabled = isUnavailable || qty <= 1;
            plusBtn.disabled = isUnavailable;
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
            await submitQuickCheckout(window.myPlayFabId, { ...item, optionLabel, sizeLabel }, qty);
        });

        syncQty();
        syncFavoriteButton();
        if (favoriteBtn) actions.append(favoriteBtn);
        actions.append(minusBtn, qtyDisplay, plusBtn, quickBtn);
        meta.append(price, actions);
        body.append(concept);
        if (item.content) body.append(content);
        if (optionRow) body.append(optionRow);
        if (sizeRow) body.append(sizeRow);
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
    if (!TROY_ORDER_ENTRY_ENABLED) return;
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
            if (!TROY_ORDER_ENTRY_ENABLED) {
                showTroyNotice('ご注文はスタッフにお伝えください。');
                return;
            }
            if (!canUseTroyMenu()) {
                const message = _lastStatus?.isOpen ? '入店すると注文できます。' : 'TROYはCLOSE中です。';
                showTroyNotice(message);
                if (_lastStatus?.isOpen) scrollTroyEntryIntoView();
                return;
            }
            _menuActiveId = targetMenuId;
            setTopMenuCategoryState(targetMenuId);
            openMenuModal(targetMenuId);
        });
    });
    setTopMenuCategoryState(_menuActiveId);
    updateOrderAvailability();
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
        || window.__troyEntryNation
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
}

function publishSnapshotStatus() {
    renderStatus({
        nation: _statusSnapshotState.nation,
        isOpen: !!_statusSnapshotState.isOpen,
        members: Array.isArray(_statusSnapshotState.members) ? _statusSnapshotState.members : [],
        menuDisabled: Array.isArray(_statusSnapshotState.menuDisabled) ? _statusSnapshotState.menuDisabled : [],
        menuSpecials: Array.isArray(_statusSnapshotState.menuSpecials) ? _statusSnapshotState.menuSpecials : [],
        menuCustomItems: Array.isArray(_statusSnapshotState.menuCustomItems) ? _statusSnapshotState.menuCustomItems : []
    });
}

function applyMenuState(menuDisabled, menuSpecials, menuCustomItems) {
    if (Array.isArray(menuDisabled)) _menuDisabled = menuDisabled;
    if (Array.isArray(menuSpecials)) _menuSpecials = menuSpecials;
    if (Array.isArray(menuCustomItems)) _menuCustomItems = menuCustomItems;
    renderTroyMenuBoard();
}

function attachStatusSubscription(playFabId, nationKey = resolveTroyNationKey()) {
    stopStatusSubscription();
    const memberId = normalizePlayFabId(playFabId);
    if (!memberId) return false;
    const db = getFirestore();
    const roomRef = doc(db, 'troy_rooms', TROY_GLOBAL_ROOM_ID);
    const membersQuery = query(collection(roomRef, 'members'), orderBy('joinedAt', 'asc'), limit(50));

    _statusSnapshotState = {
        nation: nationKey,
        isOpen: false,
        members: [],
        menuDisabled: [],
        menuSpecials: [],
        menuCustomItems: []
    };

    const handleSnapshotError = (label, error) => {
        console.warn(`[Troy] ${label} snapshot failed:`, error);
        stopStatusSubscription();
    };

    _statusRoomUnsubscribe = onSnapshot(roomRef, (snapshot) => {
        const roomData = snapshot.data() || {};
        _statusSnapshotState.nation = String(roomData.nation || nationKey || '').trim().toLowerCase();
        _statusSnapshotState.isOpen = !!roomData.isOpen;
        _statusSnapshotState.menuDisabled = Array.isArray(roomData.menuDisabled) ? roomData.menuDisabled : [];
        _statusSnapshotState.menuSpecials = Array.isArray(roomData.menuSpecials) ? roomData.menuSpecials : [];
        _statusSnapshotState.menuCustomItems = Array.isArray(roomData.menuCustomItems) ? roomData.menuCustomItems : [];
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

    publishSnapshotStatus();
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
    const count = document.createElement('div');
    count.className = 'troy-entry-count';
    count.textContent = `現在 ${entries.length} 名入店中`;
    list.appendChild(count);
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
    applyMenuState(data?.menuDisabled, data?.menuSpecials, data?.menuCustomItems);
    updateTroyMenuBoardPlacement();
    updateOrderAvailability();
    updateTroyPrimaryAction();
    updateTroyRoleUI();
}

async function refreshStatus(playFabId, options = {}) {
    if (!playFabId) return;
    const data = await getTroyStatus(playFabId, { troyNation: resolveTroyNationKey() }, options);
    if (data) renderStatus(data);
}

function wireHandlers(playFabId) {
    if (_wired) return;
    _wired = true;

    const { joinBtn } = getTroyElements();
    if (joinBtn) {
        joinBtn.addEventListener('click', async () => {
            if (joinBtn.disabled) return;
            const name = getDisplayName();
            const wasMember = isTroyMember(_lastStatus, playFabId);
            const previousText = joinBtn.textContent;
            joinBtn.disabled = true;
            joinBtn.textContent = '入店中...';
            try {
                const result = await joinTroy(playFabId, name, { troyNation: resolveTroyNationKey() });
                if (result) {
                    await refreshStatus(playFabId, { isSilent: true });
                    const joinedNation = _lastStatus?.nation || resolveTroyNationKey();
                    if (joinedNation !== _statusSnapshotState?.nation) {
                        attachStatusSubscription(playFabId, joinedNation);
                    }
                    const isMember = isTroyMember(_lastStatus, playFabId);
                    if (!wasMember && isMember && typeof window.showRpgMessage === 'function') {
                        window.showRpgMessage('入店しました。');
                    }
                }
            } finally {
                joinBtn.disabled = false;
                joinBtn.textContent = previousText || '入店';
            }
        });
    }

    const primaryBtn = document.getElementById('btnTroyPrimaryAction');
    if (primaryBtn) {
        primaryBtn.addEventListener('click', () => {
            if (!_lastStatus?.isOpen) return;
            if (!isTroyMember(_lastStatus, playFabId)) {
                clickTroyJoinButton();
            }
        });
    }

    const calendarList = document.getElementById('troyBusinessCalendarList');
    if (calendarList) {
        const openFromTarget = (target) => {
            const card = target?.closest?.('[data-troy-calendar-reserve]');
            if (!card) return;
            const id = String(card.getAttribute('data-troy-calendar-reserve') || '');
            const entry = _businessCalendar.find((item) => String(item?.id || '') === id);
            if (entry) openTroyReservationForm(entry);
        };
        calendarList.addEventListener('click', (event) => openFromTarget(event.target));
        calendarList.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const card = event.target?.closest?.('[data-troy-calendar-reserve]');
            if (!card) return;
            openFromTarget(card);
            event.preventDefault();
        });
    }

    const reservationBtn = document.getElementById('btnCreateReservation');
    if (reservationBtn) {
        reservationBtn.addEventListener('click', () => submitTroyReservation(window.myPlayFabId || playFabId));
    }
    const cancelReservationBtn = document.getElementById('btnCancelTroyReservation');
    if (cancelReservationBtn) {
        cancelReservationBtn.addEventListener('click', () => {
            const panel = document.getElementById('troyReservationPanel');
            if (panel) panel.hidden = true;
            _selectedReservationCalendarEntry = null;
        });
    }
    const reservationPurpose = document.getElementById('reservationPurpose');
    if (reservationPurpose) reservationPurpose.addEventListener('change', updateTroyReservationPurposeHelp);

    const coinConvertBtn = document.getElementById('btnTroyCoinConvert');
    if (coinConvertBtn) {
        coinConvertBtn.addEventListener('click', () => submitTroyCoinConvert(window.myPlayFabId || playFabId));
    }
    const coinConvertInput = document.getElementById('troyCoinConvertAmount');
    if (coinConvertInput) {
        coinConvertInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void submitTroyCoinConvert(window.myPlayFabId || playFabId);
        });
    }
}
export async function loadTroyPage(playFabId) {
    loadFavoriteDrinkEntries(playFabId);
    wireHandlers(playFabId);
    wireTroyMenuBoard();
    wireMenuPopups();
    updateTroyRoleUI();
    await loadTroyBusinessCalendar(playFabId);
    await refreshStatus(playFabId);
    updateTroyRoleUI();
    attachStatusSubscription(playFabId, _lastStatus?.nation || resolveTroyNationKey());
}
