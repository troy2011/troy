// c:/Users/ikeda/my-liff-app/public/js/inventory.js

import {
    getInventory as fetchInventory,
    getEquipment as fetchEquipment,
    equipItem as requestEquipItem,
    getTarotDecks as fetchTarotDecks,
    equipTarotCard as requestEquipTarotCard,
    unequipTarotCard as requestUnequipTarotCard,
    replaceTarotCard as requestReplaceTarotCard,
    equipTarotGuardian as requestEquipTarotGuardian,
    unequipTarotGuardian as requestUnequipTarotGuardian,
    useItem as requestUseItem,
    sellItem as requestSellItem,
    sellItems as requestSellItems,
    previewEquipmentEnhancement as requestPreviewEquipmentEnhancement,
    applyEquipmentEnhancement as requestApplyEquipmentEnhancement,
    getBlackMarketListings as requestBlackMarketListings,
    createBlackMarketListing as requestCreateBlackMarketListing,
    cancelBlackMarketListing as requestCancelBlackMarketListing,
    buyBlackMarketListing as requestBuyBlackMarketListing
} from './playfabClient.js?v=20260821-tarot-deck-replace-v1';
import { renderAvatar, preloadAvatarBaseSprites, preloadEquipmentSprites, resolveSpritePathByAvatarColor } from './avatar.js';
import * as Player from './player.js';
import {
    preloadTarotBattleSkills,
    resolveTarotBattleSkill
} from './tarotBattleSkills.js';
import { formatTarotRoleBonus } from './tarotRoles.js';
import { bindModalClose, createModalCloseButton } from './modalClose.js';
import { startModalViewportTracking, stopModalViewportTracking } from './modalViewport.js';
import {
    TAROT_KINGDOM_ARCANA_EFFECT_CATALOG,
    TAROT_KINGDOM_ARCANA_AP_EFFECTS,
    TAROT_KINGDOM_ARCANA_EFFECTS_READY,
    getTarotKingdomGuardianDefinition,
    getTarotKingdomMinorApDefinition,
    getTarotKingdomMinorDefinition,
    getTarotKingdomCardLevelScale,
    getTarotKingdomFriendlyEffectText
} from './tarotKingdomEffects.js?v=20260821-guardian-job-names-v1';
import {
    buildTarotCardMeta,
    compareTarotItems,
    getCanonicalTarotCategory,
    getMajorArcanaSuitInfo,
    getTarotNumberBadge,
    getTarotRankNumber,
    getTarotRankLabel,
    getTarotSpriteFrame,
    getTarotSlotLabel,
    getTarotSuitLabel,
    isTarotMajorCategory,
    isTarotMinorCategory,
    matchesInventoryCategory
} from './tarotCards.js';

let myInventory = [];
let myCurrentEquipment = {};
let myVirtualCurrency = {};
let myExperience = 0;
let myExperienceProgress = null;
let myIsKing = false;
let myMeleeDeck = [];
let myShipDeck = [];
let myMeleeRole = null;
let myShipRole = null;
let myShipMajorArcana = [];
let myShipMajorArcanaLimit = 1;
let myTarotGuardian = null;
let activeInventoryPanel = 'items';
let activeInventoryGroup = 'Equipment';
let activeInventoryCategory = 'Hand';
let lastInventoryFetchAt = 0;
let inventoryFetchPromise = null;
let equipmentLoaded = false;
let equipmentFetchPromise = null;
let equipmentMutationInFlight = false;
let inventoryStickyResizeObserver = null;
let inventorySellSelectionMode = false;
let selectedInventorySellItemIds = new Set();
let inventorySearchQuery = '';
let blackMarketVisible = false;
let blackMarketListings = [];
let blackMarketMyActiveCount = 0;
let blackMarketMaxActiveListings = 5;
let blackMarketOriginsByItemId = {};
let blackMarketLoading = false;
let blackMarketPendingListingId = '';
let blackMarketCreatingItemId = '';
let blackMarketErrorMessage = '';
let blackMarketReturnFocusElement = null;
let equipmentEnhancementPreviewTimer = null;
let equipmentEnhancementRequestSerial = 0;
let equipmentEnhancementKeydownHandler = null;
// カードレベルデータ: { [itemId]: { level, maxLevel, quantity, duplicateCount, duplicateCost, canLevelUp } }
let cardLevelMap = {};
const tarotLevelUpInFlightItemIds = new Set();
let tarotBattleSkillsLoaded = false;
let selectedTarotLoadoutItemId = '';
let tarotLoadoutMutationPending = false;
let tarotDeckReplacementTargetItemId = '';
let arcanaResonanceCatalogReturnFocusElement = null;
let visibleInventoryDetailItems = [];
let itemDetailSwipeStart = null;

async function loadCardLevels() {
    try {
        const res = await fetch('/api/cards');
        if (!res.ok) return;
        const data = await res.json();
        cardLevelMap = {};
        (data.cards || []).forEach((c) => { cardLevelMap[c.itemId] = c; });
    } catch (err) {
        console.warn('[inventory] loadCardLevels failed:', err);
    }
}

async function loadTarotBattleSkillCache() {
    tarotBattleSkillsLoaded = await preloadTarotBattleSkills();
    return tarotBattleSkillsLoaded;
}

async function levelUpCard(itemId) {
    const safeItemId = String(itemId || '').trim();
    if (!safeItemId || tarotLevelUpInFlightItemIds.has(safeItemId)) return;
    tarotLevelUpInFlightItemIds.add(safeItemId);
    try {
        const res = await fetch('/api/cards/levelup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: safeItemId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || 'レベルアップ失敗');
        cardLevelMap[safeItemId] = {
            ...(cardLevelMap[safeItemId] || {}),
            level: data.newLevel,
            maxLevel: data.maxLevel,
            quantity: data.quantity,
            duplicateCount: data.duplicateCount,
            duplicateCost: data.duplicateCost,
            canLevelUp: data.canLevelUp === true,
        };
        const playFabId = window.myPlayFabId || null;
        if (playFabId) {
            await getInventory(playFabId, { force: true });
        } else {
            renderInventoryGrid(activeInventoryCategory);
            renderTarotDeckPanels();
        }
        const detailModal = document.getElementById('itemDetailModal');
        const detailItem = getDisplayInventoryEntries().find((entry) => String(entry?.itemId || '') === safeItemId);
        if (detailModal?.style.display !== 'none' && !detailModal?.hidden && detailItem) {
            showItemDetailModal(detailItem);
        }
        const materialsConsumed = Math.max(1, Math.floor(Number(data.materialsConsumed) || 1));
        showInventoryFeedback(`同名カードを${materialsConsumed}枚消費して Lv.${data.newLevel} に上昇！`);
    } catch (err) {
        const playFabId = window.myPlayFabId || null;
        await Promise.all([
            loadCardLevels(),
            playFabId ? getInventory(playFabId, { force: true }) : Promise.resolve(),
        ]).catch((refreshError) => {
            console.warn('[inventory] card level recovery refresh failed:', refreshError);
        });
        showInventoryFeedback(err.message, true);
    } finally {
        tarotLevelUpInFlightItemIds.delete(safeItemId);
    }
}

export async function levelUpTarotCard(itemId) {
    return levelUpCard(itemId);
}

function showInventoryFeedback(msg, isError = false) {
    const el = document.getElementById('inventoryGrid');
    if (!el) return;
    const fb = document.createElement('div');
    fb.className = `inventory-feedback${isError ? ' is-error' : ''}`;
    fb.textContent = msg;
    el.prepend(fb);
    setTimeout(() => fb.remove(), 3000);
}

function normalizeBlackMarketPrice(value) {
    const price = Number(value);
    if (!Number.isInteger(price) || price < 1 || price > 9999) return 0;
    return price;
}

function getBlackMarketOriginSummary(itemId) {
    return blackMarketOriginsByItemId?.[String(itemId || '').trim()] || null;
}

function getBlackMarketOriginDisplay(itemId) {
    const summary = getBlackMarketOriginSummary(itemId);
    return String(summary?.displayText || '').trim();
}

function createBlackMarketButton(label, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `inventory-sell-control-btn ${className || ''}`.trim();
    button.textContent = label;
    if (typeof onClick === 'function') {
        button.addEventListener('click', onClick);
    }
    return button;
}

function ensureInventoryActionDialog() {
    if (typeof document === 'undefined') return null;
    let dialog = document.getElementById('inventoryActionDialog');
    if (dialog) return dialog;

    dialog = document.createElement('div');
    dialog.id = 'inventoryActionDialog';
    dialog.className = 'inventory-action-dialog';
    dialog.hidden = true;
    dialog.innerHTML = `
        <div class="inventory-action-dialog-sheet" role="dialog" aria-modal="true" aria-labelledby="inventoryActionDialogTitle">
            <h3 id="inventoryActionDialogTitle"></h3>
            <p class="inventory-action-dialog-message"></p>
            <label class="inventory-action-dialog-field">
                <span></span>
                <input class="inventory-action-dialog-input" type="number" min="1" max="9999" inputmode="numeric">
            </label>
            <div class="inventory-action-dialog-error" aria-live="polite"></div>
            <div class="inventory-action-dialog-actions">
                <button type="button" class="inventory-action-dialog-cancel">キャンセル</button>
                <button type="button" class="inventory-action-dialog-confirm">OK</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    return dialog;
}

function showInventoryActionDialog(options = {}) {
    const dialog = ensureInventoryActionDialog();
    if (!dialog) return Promise.resolve({ confirmed: true, value: options.defaultValue || '' });
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const titleEl = dialog.querySelector('#inventoryActionDialogTitle');
    const messageEl = dialog.querySelector('.inventory-action-dialog-message');
    const fieldEl = dialog.querySelector('.inventory-action-dialog-field');
    const fieldLabelEl = fieldEl?.querySelector('span');
    const inputEl = dialog.querySelector('.inventory-action-dialog-input');
    const errorEl = dialog.querySelector('.inventory-action-dialog-error');
    const cancelBtn = dialog.querySelector('.inventory-action-dialog-cancel');
    const confirmBtn = dialog.querySelector('.inventory-action-dialog-confirm');

    titleEl.textContent = options.title || '確認';
    messageEl.textContent = options.message || '';
    errorEl.textContent = '';
    cancelBtn.textContent = options.cancelLabel || 'キャンセル';
    confirmBtn.textContent = options.confirmLabel || 'OK';
    confirmBtn.disabled = false;

    const wantsInput = options.input === true;
    fieldEl.hidden = !wantsInput;
    if (wantsInput) {
        fieldLabelEl.textContent = options.inputLabel || '価格';
        inputEl.value = String(options.defaultValue ?? '1');
        inputEl.min = String(options.min ?? 1);
        inputEl.max = String(options.max ?? 9999);
    } else {
        inputEl.value = '';
    }

    dialog.hidden = false;
    startModalViewportTracking(dialog, 'inventory-action');
    document.body.classList.add('modal-lock');
    if (wantsInput) {
        requestAnimationFrame(() => {
            inputEl.focus();
            inputEl.select();
        });
    } else {
        requestAnimationFrame(() => confirmBtn.focus());
    }

    return new Promise((resolve) => {
        const cleanup = (result) => {
            dialog.hidden = true;
            stopModalViewportTracking(dialog);
            dialog.removeEventListener('click', handleBackdropClick);
            document.removeEventListener('keydown', handleKeydown, true);
            cancelBtn.removeEventListener('click', handleCancel);
            confirmBtn.removeEventListener('click', handleConfirm);
            syncModalLockState();
            if (previousFocus?.isConnected) previousFocus.focus();
            resolve(result);
        };
        const handleCancel = () => cleanup({ confirmed: false, value: '' });
        const handleBackdropClick = (event) => {
            if (event.target === dialog) handleCancel();
        };
        const handleKeydown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                handleCancel();
            }
            if (event.key === 'Enter' && wantsInput) {
                event.preventDefault();
                handleConfirm();
            }
            if (event.key === 'Tab') {
                const focusable = wantsInput
                    ? [inputEl, cancelBtn, confirmBtn]
                    : [cancelBtn, confirmBtn];
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        const handleConfirm = () => {
            const value = wantsInput ? inputEl.value : '';
            if (typeof options.validate === 'function') {
                const error = options.validate(value);
                if (error) {
                    errorEl.textContent = error;
                    inputEl.focus();
                    inputEl.select();
                    return;
                }
            }
            confirmBtn.disabled = true;
            cleanup({ confirmed: true, value });
        };

        cancelBtn.addEventListener('click', handleCancel);
        confirmBtn.addEventListener('click', handleConfirm);
        dialog.addEventListener('click', handleBackdropClick);
        document.addEventListener('keydown', handleKeydown, true);
    });
}

function syncInventoryStickyMetrics() {
    if (typeof document === 'undefined') return;
    const tabContent = document.getElementById('tabContentInventory');
    const switcher = document.getElementById('inventoryMobileSwitch');
    if (!tabContent || !switcher) return;
    const switchHeight = Math.ceil(switcher.getBoundingClientRect().height || 0);
    tabContent.style.setProperty('--inventory-switch-sticky-height', `${switchHeight}px`);
}

function bindInventoryStickyMetrics() {
    if (typeof document === 'undefined') return;
    const switcher = document.getElementById('inventoryMobileSwitch');
    if (!switcher) return;
    bindInventoryTabKeyboardNavigation(switcher);
    syncInventoryStickyMetrics();
    if (typeof ResizeObserver !== 'undefined') {
        if (inventoryStickyResizeObserver) {
            inventoryStickyResizeObserver.disconnect();
        }
        inventoryStickyResizeObserver = new ResizeObserver(() => syncInventoryStickyMetrics());
        inventoryStickyResizeObserver.observe(switcher);
    }
    if (typeof window !== 'undefined' && window.__inventoryStickyMetricsBound !== true) {
        window.__inventoryStickyMetricsBound = true;
        window.addEventListener('resize', syncInventoryStickyMetrics);
    }
}
const ITEM_SPRITE_PRESETS = Object.freeze([
    { idPrefixes: ['accessory_', 'offhand_'], path: './Sprites/items/icons.png', width: 16, height: 16, cols: 16, twoHanded: false },
    { idPrefixes: ['hat_black_'], path: './Sprites/wardrobe/cloth/hat_black.png', width: 32, height: 32, cols: 10, twoHanded: false },
    { idPrefixes: ['hat_straw_'], path: './Sprites/wardrobe/cloth/hat_straw.png', width: 32, height: 32, cols: 5, twoHanded: false },
    { idPrefixes: ['leather01_'], path: './Sprites/wardrobe/leather/leather01.png', width: 32, height: 32, cols: 10, twoHanded: false },
    { idPrefixes: ['leather02_'], path: './Sprites/wardrobe/leather/leather02.png', width: 32, height: 48, cols: 4, twoHanded: false },
    { idPrefixes: ['metal_black_'], path: './Sprites/wardrobe/metal/metal_black.png', width: 32, height: 48, cols: 10, twoHanded: false },
    { idPrefixes: ['metal_'], path: './Sprites/wardrobe/metal/metal.png', width: 32, height: 32, cols: 10, twoHanded: false },
    { idPrefixes: ['shield_'], path: './Sprites/weapons/melee weapons/shield.png', width: 32, height: 32, cols: 10, twoHanded: false },
    { idPrefixes: ['sword_big_'], path: './Sprites/weapons/melee weapons/sword_big.png', width: 32, height: 48, cols: 10, twoHanded: true },
    { idPrefixes: ['sword_'], path: './Sprites/weapons/melee weapons/sword.png', width: 32, height: 32, cols: 7, twoHanded: false },
    { idPrefixes: ['dagger_'], path: './Sprites/weapons/melee weapons/dagger.png', width: 32, height: 32, cols: 7, twoHanded: false },
    { idPrefixes: ['axe_big_'], path: './Sprites/weapons/melee weapons/axe_big.png', width: 32, height: 48, cols: 5, twoHanded: true },
    { idPrefixes: ['axe_'], path: './Sprites/weapons/melee weapons/axe.png', width: 32, height: 32, cols: 10, twoHanded: false },
    { idPrefixes: ['blunt_'], path: './Sprites/weapons/melee weapons/blunt.png', width: 32, height: 32, cols: 10, twoHanded: false },
    { idPrefixes: ['polearm_'], path: './Sprites/weapons/melee weapons/polearm.png', width: 32, height: 64, cols: 12, twoHanded: true },
    { idPrefixes: ['staff_'], path: './Sprites/weapons/magic weapons/staff.png', width: 32, height: 64, cols: 13, twoHanded: false, weaponType: 'staff' },
    { idPrefixes: ['wand_'], path: './Sprites/weapons/magic weapons/wand.png', width: 32, height: 32, cols: 6, twoHanded: false, weaponType: 'staff' },
    { idPrefixes: ['gun_big_'], path: './Sprites/weapons/ranged weapons/pistol_big.png', width: 64, height: 32, cols: 5, twoHanded: true },
    { idPrefixes: ['gun_'], path: './Sprites/weapons/ranged weapons/pistol.png', width: 32, height: 32, cols: 4, twoHanded: false }
]);

function resolveInventorySpritePreset(itemOrData) {
    const data = itemOrData?.customData || itemOrData || {};
    const itemId = String(itemOrData?.itemId || data?.ItemId || data?.FriendlyId || '').trim().toLowerCase();
    const spritePath = String(data?.sprite_path || '').trim().toLowerCase();
    return ITEM_SPRITE_PRESETS.find((preset) =>
        (spritePath && spritePath === String(preset.path).toLowerCase())
        || preset.idPrefixes.some((prefix) => itemId.startsWith(prefix))
    ) || null;
}

function normalizeInventorySpriteFrame(path, width = 32, height = 32, itemOrData = null) {
    const preset = resolveInventorySpritePreset(itemOrData || { sprite_path: path });
    if (preset) {
        return {
            width: preset.width,
            height: preset.height,
            cols: preset.cols,
            path: preset.path
        };
    }
    return {
        width: Number(width) || 32,
        height: Number(height) || 32,
        cols: undefined,
        path
    };
}

function isTwoHandedInventoryWeapon(itemOrData) {
    const data = itemOrData?.customData || itemOrData || {};
    if (getCanonicalTarotCategory(data.Category) !== 'Weapon') return false;
    if (data?.TwoHanded === true || String(data?.TwoHanded || '').trim().toLowerCase() === 'true') {
        return true;
    }
    const preset = resolveInventorySpritePreset(itemOrData);
    if (preset && typeof preset.twoHanded === 'boolean') {
        return preset.twoHanded;
    }
    return Number(data?.sprite_w || 0) > 32 || Number(data?.sprite_h || 0) > 32;
}

const INVENTORY_GROUPS = {
    All: { label: '全部', category: 'All', tabs: [] },
    Equipment: {
        label: '装備',
        category: 'Hand',
        tabs: [
            { category: 'Hand', label: '手装備' },
            { category: 'Armor', label: '防具' },
            { category: 'Accessory', label: 'アクセ' }
        ]
    },
    Tarot: {
        label: 'タロット',
        category: 'TarotMajor',
        tabs: [
            { category: 'TarotMajor', label: '大アルカナ' },
            { category: 'TarotMinor', label: '小アルカナ' }
        ]
    },
    Consumable: { label: '消耗品', category: 'Consumable', tabs: [] }
};

const INVENTORY_SORT_OPTIONS = {
    All: [
        { value: 'default', label: 'おすすめ順' },
        { value: 'power_desc', label: '攻撃力順' },
        { value: 'defense_desc', label: '防御力順' },
        { value: 'magic_desc', label: '術補順' },
        { value: 'count_desc', label: '所持数順' }
    ],
    Weapon: [
        { value: 'default', label: 'おすすめ順' },
        { value: 'power_desc', label: '攻撃力順' }
    ],
    Hand: [
        { value: 'power_desc', label: '攻撃力順' }
    ],
    Shield: [
        { value: 'default', label: 'おすすめ順' },
        { value: 'defense_desc', label: '防御力順' }
    ],
    LeftHand: [
        { value: 'default', label: 'おすすめ順' },
        { value: 'defense_desc', label: '防御力順' },
        { value: 'magic_desc', label: '術補順' },
        { value: 'heal_desc', label: '回復順' }
    ],
    Offhand: [
        { value: 'default', label: 'おすすめ順' },
        { value: 'magic_desc', label: '術補順' },
        { value: 'heal_desc', label: '回復順' }
    ],
    Armor: [
        { value: 'default', label: 'おすすめ順' },
        { value: 'defense_desc', label: '防御力順' }
    ],
    Accessory: [
        { value: 'default', label: 'おすすめ順' },
        { value: 'power_desc', label: '攻撃力順' },
        { value: 'defense_desc', label: '防御力順' }
    ],
    TarotMajor: [
        { value: 'default', label: '札順' }
    ],
    TarotMinor: [
        { value: 'default', label: '札順' }
    ],
    Consumable: [
        { value: 'default', label: 'おすすめ順' },
        { value: 'count_desc', label: '所持数順' }
    ]
};

const EQUIPPABLE_INVENTORY_CATEGORIES = new Set(['Weapon', 'Shield', 'Offhand', 'Armor', 'Accessory']);

export function getActiveInventoryCategory() {
    return activeInventoryCategory;
}


function getInventoryGroupForCategory(category) {
    if (['Hand', 'Weapon', 'Shield', 'Offhand', 'LeftHand', 'Armor', 'Accessory'].includes(category)) return 'Equipment';
    if (['TarotMajor', 'TarotMinor'].includes(category)) return 'Tarot';
    if (category === 'Consumable') return 'Consumable';
    return 'All';
}

function matchesInventoryDisplayCategory(itemCategory, selectedCategory) {
    if (selectedCategory === 'Hand') {
        const canonicalCategory = getCanonicalTarotCategory(itemCategory);
        return canonicalCategory === 'Weapon' || canonicalCategory === 'Shield' || canonicalCategory === 'Offhand';
    }
    if (selectedCategory === 'LeftHand') {
        const canonicalCategory = getCanonicalTarotCategory(itemCategory);
        return canonicalCategory === 'Shield' || canonicalCategory === 'Offhand';
    }
    return matchesInventoryCategory(itemCategory, selectedCategory);
}

function getDefaultInventoryCategory(group) {
    return INVENTORY_GROUPS[group]?.category || 'All';
}

function renderInventoryTabControls() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('inventoryTabs');
    if (!container) return;
    const tabs = INVENTORY_GROUPS[activeInventoryGroup]?.tabs || [];
    if (!tabs.length) {
        container.innerHTML = '';
        container.dataset.group = '';
        container.hidden = true;
        return;
    }
    container.dataset.group = activeInventoryGroup;
    container.hidden = false;
    container.setAttribute('role', 'tablist');
    container.setAttribute('aria-label', `${INVENTORY_GROUPS[activeInventoryGroup]?.label || '持ち物'}の分類`);
    container.innerHTML = tabs.map((tab) => `
        <button class="inventory-tab-btn${tab.category === activeInventoryCategory ? ' active' : ''}" data-category="${tab.category}" type="button" role="tab" aria-selected="${tab.category === activeInventoryCategory ? 'true' : 'false'}">${tab.label}</button>
    `).join('');
    container.querySelectorAll('.inventory-tab-btn').forEach((button) => {
        button.addEventListener('click', () => switchInventoryTab(button.dataset.category));
    });
    bindInventoryTabKeyboardNavigation(container);
}

function bindInventoryTabKeyboardNavigation(container) {
    if (!container || container.dataset.inventoryTabKeyboardBound === 'true') return;
    container.dataset.inventoryTabKeyboardBound = 'true';
    container.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const current = event.target.closest('[role="tab"]');
        if (!current || !container.contains(current)) return;
        const tabs = [...container.querySelectorAll('[role="tab"]')]
            .filter((tab) => !tab.hidden && !tab.disabled);
        const currentIndex = tabs.indexOf(current);
        if (currentIndex < 0 || !tabs.length) return;
        let nextIndex = currentIndex;
        if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        event.preventDefault();
        tabs[nextIndex].focus();
        tabs[nextIndex].click();
    });
}

function getVisibleModalCount() {
    if (typeof document === 'undefined') return 0;
    const overlayCount = Array.from(document.querySelectorAll('.modal-overlay')).filter((modal) => {
        if (!modal) return false;
        const display = String(modal.style?.display || '').trim().toLowerCase();
        return display === 'flex' || modal.classList.contains('active');
    }).length;
    const inventoryDialog = document.getElementById('inventoryActionDialog');
    const blackMarketPanel = document.getElementById('blackMarketPanel');
    return overlayCount
        + (inventoryDialog && !inventoryDialog.hidden ? 1 : 0)
        + (blackMarketPanel && !blackMarketPanel.hidden ? 1 : 0);
}

function syncModalLockState() {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('modal-lock', getVisibleModalCount() > 0);
}

const MODAL_VIEWPORT_PREFIX_BY_ID = Object.freeze({
    itemDetailModal: 'item-detail',
    arcanaResonanceCatalogModal: 'arcana-resonance',
    sellConfirmationModal: 'sell-confirmation'
});

function hideModal(modal) {
    if (!modal) return;
    stopModalViewportTracking(modal);
    modal.style.display = 'none';
    syncModalLockState();
}

function showModal(modal) {
    if (!modal) return;
    modal.style.display = 'flex';
    const propertyPrefix = MODAL_VIEWPORT_PREFIX_BY_ID[modal.id];
    if (propertyPrefix) startModalViewportTracking(modal, propertyPrefix);
    syncModalLockState();
}

export function closeItemDetailModal() {
    itemDetailSwipeStart = null;
    hideModal(document.getElementById('itemDetailModal'));
}

function updateItemDetailNavigation(item) {
    const modal = document.getElementById('itemDetailModal');
    const navigation = modal?.querySelector('.item-detail-navigation');
    const previousButton = navigation?.querySelector('.item-detail-navigation-previous');
    const nextButton = navigation?.querySelector('.item-detail-navigation-next');
    if (!modal || !navigation || !previousButton || !nextButton) return;

    const currentKey = getInventoryEntryKey(item);
    const currentIndex = visibleInventoryDetailItems.findIndex((entry) => getInventoryEntryKey(entry) === currentKey);
    const canNavigate = currentIndex >= 0 && visibleInventoryDetailItems.length > 1;
    navigation.hidden = !canNavigate;
    modal.dataset.detailEntryKey = currentKey;
    if (!canNavigate) return;

    const previousItem = visibleInventoryDetailItems[(currentIndex - 1 + visibleInventoryDetailItems.length) % visibleInventoryDetailItems.length];
    const nextItem = visibleInventoryDetailItems[(currentIndex + 1) % visibleInventoryDetailItems.length];
    previousButton.setAttribute('aria-label', `前の持ち物: ${previousItem.name || 'アイテム'}`);
    previousButton.title = previousItem.name || '前の持ち物';
    nextButton.setAttribute('aria-label', `次の持ち物: ${nextItem.name || 'アイテム'}`);
    nextButton.title = nextItem.name || '次の持ち物';
}

function navigateItemDetail(direction) {
    const modal = document.getElementById('itemDetailModal');
    const currentKey = String(modal?.dataset.detailEntryKey || '');
    const currentIndex = visibleInventoryDetailItems.findIndex((entry) => getInventoryEntryKey(entry) === currentKey);
    if (currentIndex < 0 || visibleInventoryDetailItems.length < 2) return;

    const offset = direction === 'previous' ? -1 : 1;
    const targetIndex = (currentIndex + offset + visibleInventoryDetailItems.length) % visibleInventoryDetailItems.length;
    showItemDetailModal(visibleInventoryDetailItems[targetIndex]);
}

function bindItemDetailNavigation(modal) {
    if (!modal || modal.dataset.detailNavigationBound === 'true') return;
    modal.dataset.detailNavigationBound = 'true';
    modal.querySelector('.item-detail-navigation-previous')?.addEventListener('click', () => navigateItemDetail('previous'));
    modal.querySelector('.item-detail-navigation-next')?.addEventListener('click', () => navigateItemDetail('next'));

    const sheet = modal.querySelector('.item-detail-sheet');
    sheet?.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' || event.isPrimary === false) return;
        if (event.target.closest('button, input, select, textarea, a, summary')) return;
        itemDetailSwipeStart = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            at: performance.now()
        };
    });
    sheet?.addEventListener('pointerup', (event) => {
        const start = itemDetailSwipeStart;
        itemDetailSwipeStart = null;
        if (!start || start.pointerId !== event.pointerId) return;
        const deltaX = event.clientX - start.x;
        const deltaY = event.clientY - start.y;
        const elapsed = performance.now() - start.at;
        if (Math.abs(deltaX) < 52 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25 || elapsed > 700) return;
        event.preventDefault();
        navigateItemDetail(deltaX < 0 ? 'next' : 'previous');
    });
    sheet?.addEventListener('pointercancel', () => {
        itemDetailSwipeStart = null;
    });
}

function normalizeInventoryPanel(panel) {
    return ['loadout', 'tarot', 'items'].includes(panel) ? panel : 'loadout';
}

export function switchInventoryPanel(panel, options = {}) {
    if (typeof document === 'undefined') return;
    activeInventoryPanel = normalizeInventoryPanel(panel);
    document.querySelectorAll('.inventory-panel-btn').forEach((button) => {
        const groupSwitch = button.dataset.inventoryGroupSwitch;
        const isActive = groupSwitch
            ? (activeInventoryPanel === 'items' && activeInventoryGroup === groupSwitch)
                || (activeInventoryPanel === 'tarot' && groupSwitch === 'Tarot')
            : button.dataset.panel === activeInventoryPanel;
        button.classList.toggle('active', isActive);
        if (button.getAttribute('role') === 'tab') {
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }
    });
    document.querySelectorAll('#tabContentInventory .inventory-section').forEach((section) => {
        const sectionPanel = section.dataset.panel;
        const shouldShow = sectionPanel === activeInventoryPanel
            || (sectionPanel === 'items' && activeInventoryPanel === 'tarot')
            || (sectionPanel === 'loadout' && activeInventoryPanel === 'items' && activeInventoryGroup === 'Equipment');
        section.classList.toggle('active', shouldShow);
        section.hidden = !shouldShow;
    });
    const tabContent = document.getElementById('tabContentInventory');
    if (tabContent) {
        tabContent.dataset.inventoryPanel = activeInventoryPanel;
        tabContent.dataset.inventoryGroup = activeInventoryGroup;
    }
    bindInventoryStickyMetrics();
    bindEquipmentSlotInteractions();
    if (!options.scrollSwitcher) return;
    const switcher = document.getElementById('inventoryMobileSwitch');
    if (switcher) {
        switcher.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
}

export function scrollInventoryItemsIntoView(options = {}) {
    if (typeof document === 'undefined') return;
    const tabs = document.getElementById('inventoryTabs');
    const grid = document.getElementById('inventoryGrid');
    const section = document.querySelector('#tabContentInventory .inventory-section[data-panel="items"]');
    const tabsVisible = tabs
        && tabs.hidden !== true
        && window.getComputedStyle(tabs).display !== 'none';
    const target = (tabsVisible ? tabs : null) || grid || section;
    if (!target) return;
    const behavior = options.behavior || 'smooth';
    requestAnimationFrame(() => {
        const switcher = document.getElementById('inventoryMobileSwitch');
        const switcherBottom = Math.max(0, Math.ceil(switcher?.getBoundingClientRect().bottom || 0));
        const gap = Math.max(0, Number(options.gap ?? 10) || 0);
        const targetTop = target.getBoundingClientRect().top + window.scrollY - switcherBottom - gap;
        window.scrollTo({ top: Math.max(0, targetTop), behavior });
    });
}

function getTargetInventoryCategoryForEquipmentSlot(slotElement) {
    const slotType = slotElement?.dataset?.slot || '';
    if (slotType === 'majorarcana') return 'TarotMajor';
    if (slotType === 'rightHand' || slotType === 'leftHand') return 'Hand';
    if (slotType === 'armor') return 'Armor';
    if (slotType === 'accessory') return 'Accessory';
    return 'All';
}

function handleEquipmentSlotSelect(slotElement) {
    const targetCategory = getTargetInventoryCategoryForEquipmentSlot(slotElement);
    if (targetCategory !== 'All') {
        switchInventoryTab(targetCategory);
    } else {
        switchInventoryGroup('Equipment', { panel: 'items' });
    }
    scrollInventoryItemsIntoView({ behavior: 'smooth' });
}

export function bindEquipmentSlotInteractions() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('#tabContentInventory .equip-slot').forEach((slot) => {
        if (slot.dataset.inventoryScrollBound === 'true') return;
        slot.dataset.inventoryScrollBound = 'true';
        slot.setAttribute('role', 'button');
        slot.tabIndex = 0;
        slot.addEventListener('click', () => handleEquipmentSlotSelect(slot));
        slot.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            handleEquipmentSlotSelect(slot);
        });
    });
}

function getInventoryItemByReference(itemRef) {
    if (!itemRef) return null;
    if (itemRef && typeof itemRef === 'object' && itemRef.customData) return itemRef;
    const referenceIds = getEquipmentReferenceIds(itemRef);
    if (!referenceIds.length) return null;
    const displayInventory = getDisplayInventoryEntries();
    const stackId = getEquipmentReferenceStackId(itemRef);
    if (stackId) {
        const exact = displayInventory.find((inventoryItem) => getInventoryStackIds(inventoryItem).includes(stackId));
        if (exact) return exact;
    }
    return displayInventory.find((inventoryItem) => {
        const itemIds = getInventoryItemReferenceIds(inventoryItem);
        return referenceIds.some((referenceId) => itemIds.includes(referenceId));
    })
        || null;
}

function getEquipmentReferenceStackId(value) {
    if (!value || typeof value !== 'object') return '';
    return String(
        value.stackId
        || value.StackId
        || value.instanceId
        || value.InstanceId
        || value.itemInstanceId
        || value.ItemInstanceId
        || ''
    ).trim();
}

function getEquipmentReferenceItemId(value) {
    if (!value) return '';
    if (typeof value !== 'object') return String(value || '').trim();
    return String(value.itemId || value.ItemId || value.id || value.Id || value?.Item?.Id || '').trim();
}

function getInventoryStackIds(item) {
    return [
        item?.stackId,
        ...(Array.isArray(item?.instances) ? item.instances : []),
        ...(Array.isArray(item?.stacks) ? item.stacks.map((stack) => stack?.stackId) : [])
    ].map((value) => String(value || '').trim()).filter(Boolean);
}

function getEquipmentReferenceIds(value) {
    if (!value) return [];
    if (typeof value !== 'object') {
        const id = String(value || '').trim();
        return id ? [id] : [];
    }
    const refs = [
        value.itemId,
        value.ItemId,
        value.id,
        value.Id,
        value.instanceId,
        value.InstanceId,
        value.instanceID,
        value.InstanceID,
        value.itemInstanceId,
        value.ItemInstanceId,
        value.ItemInstanceID,
        value?.Item?.Id,
        value?.Item?.itemId
    ];
    return refs
        .map((ref) => String(ref || '').trim())
        .filter(Boolean);
}

function getInventoryItemReferenceIds(item) {
    const refs = [
        item?.itemId,
        item?.ItemId,
        item?.id,
        item?.Id,
        ...(Array.isArray(item?.instances) ? item.instances : []),
        item?.instanceId,
        item?.InstanceId,
        item?.itemInstanceId,
        item?.ItemInstanceId
    ];
    return refs
        .map((ref) => String(ref || '').trim())
        .filter(Boolean);
}

const TAROT_DECK_MINOR_SUIT_ORDER = Object.freeze({ wand: 1, sword: 2, cup: 3, pentacle: 4 });
const TAROT_DECK_MINOR_FACE_RANKS = Object.freeze({ A: 1, ACE: 1, PAGE: 11, KNIGHT: 12, QUEEN: 13, KING: 14 });

function getTarotDeckItemSortKey(itemId) {
    const item = myInventory.find((entry) => getInventoryItemReferenceIds(entry).includes(itemId));
    const data = item?.customData || {};
    const fallback = String(itemId || '').match(/^(?:tarot[_-])?minor[_-](wand|sword|cup|pentacle)[_-]0*(\d{1,2})$/i);
    const rawSuitKey = String(data.ArcanaSuit || data.Suit || fallback?.[1] || '').trim().toLowerCase();
    const suitKey = { wands: 'wand', swords: 'sword', cups: 'cup', pentacles: 'pentacle' }[rawSuitKey] || rawSuitKey;
    const rawRank = String(data.ArcanaRank || data.Rank || data.CardRank || data.CardNumber || fallback?.[2] || '').trim();
    const numericRank = Number(rawRank);
    return {
        suitOrder: TAROT_DECK_MINOR_SUIT_ORDER[suitKey] || 99,
        rankOrder: Number.isFinite(numericRank) ? numericRank : (TAROT_DECK_MINOR_FACE_RANKS[rawRank.toUpperCase()] || 99),
        itemId: String(itemId || '')
    };
}

function sortTarotDeckItemIds(deckItemIds) {
    const uniqueItemIds = [];
    (Array.isArray(deckItemIds) ? deckItemIds : []).forEach((value) => {
        const itemId = String(value || '').trim();
        if (itemId && !uniqueItemIds.includes(itemId)) uniqueItemIds.push(itemId);
    });
    return uniqueItemIds.sort((leftItemId, rightItemId) => {
        const left = getTarotDeckItemSortKey(leftItemId);
        const right = getTarotDeckItemSortKey(rightItemId);
        return (left.suitOrder - right.suitOrder)
            || (left.rankOrder - right.rankOrder)
            || left.itemId.localeCompare(right.itemId);
    });
}

function getDisplayInventoryEntries() {
    return [...myInventory];
}

function normalizeInventorySearchQuery(value) {
    return String(value || '').trim().toLocaleLowerCase();
}

function getInventorySearchText(item) {
    const data = item?.customData || {};
    return [
        item?.name,
        item?.description,
        item?.itemId,
        data?.DisplayName,
        data?.Description,
        getInventoryCategoryLabel(data?.Category)
    ].filter(Boolean).join(' ').toLocaleLowerCase();
}

function matchesInventorySearch(item) {
    return !inventorySearchQuery || getInventorySearchText(item).includes(inventorySearchQuery);
}

function syncInventorySearchControls() {
    const input = document.getElementById('inventorySearch');
    const clear = document.getElementById('inventorySearchClear');
    if (input && input.value !== inventorySearchQuery) input.value = inventorySearchQuery;
    if (clear) clear.hidden = !inventorySearchQuery;
}

export function setInventorySearchQuery(value) {
    const nextQuery = normalizeInventorySearchQuery(value);
    if (inventorySearchQuery === nextQuery) {
        syncInventorySearchControls();
        return;
    }
    inventorySearchQuery = nextQuery;
    syncInventorySearchControls();
    renderInventoryGrid(activeInventoryCategory);
}

if (typeof window !== 'undefined') {
    window.addEventListener('inventory:search-query', (event) => {
        setInventorySearchQuery(event.detail?.value || '');
    });
}

function isCardInMeleeDeck(itemId) {
    return myMeleeDeck.includes(String(itemId || '').trim());
}

function isCardInShipDeck(itemId) {
    return myShipMajorArcana.includes(String(itemId || '').trim());
}

function isCardInTarotDeck(itemId) {
    return isCardInMeleeDeck(itemId);
}

function isTarotInventoryCategory(category) {
    const canonicalCategory = getCanonicalTarotCategory(category);
    return canonicalCategory === 'TarotMajor' || canonicalCategory === 'TarotMinor';
}

function getCommonTarotDeck() {
    return sortTarotDeckItemIds(myMeleeDeck);
}

function getTarotDeckReplacementTargetItemId() {
    const itemId = String(tarotDeckReplacementTargetItemId || '').trim();
    return getCommonTarotDeck().includes(itemId) ? itemId : '';
}

function clearTarotDeckReplacementTarget() {
    tarotDeckReplacementTargetItemId = '';
}

function getCommonTarotRole() {
    return myMeleeRole || myShipRole || null;
}

function isShipMajorArcanaEquipped(itemId) {
    return String(myTarotGuardian?.itemId || '') === String(itemId || '').trim();
}

function getShipMajorArcanaPosition(itemId) {
    return isShipMajorArcanaEquipped(itemId) ? 1 : 0;
}

function isShipMajorArcanaFull() {
    return !!myTarotGuardian;
}

function applyTarotDeckData(deckData) {
    const commonDeck = sortTarotDeckItemIds(Array.isArray(deckData?.tarotDeck)
        ? deckData.tarotDeck
        : Array.isArray(deckData?.meleeDeck)
            ? deckData.meleeDeck
            : Array.isArray(deckData?.shipDeck)
                ? deckData.shipDeck
                : []);
    const commonRole = deckData?.tarotRole || deckData?.meleeRole || deckData?.shipRole || null;
    myMeleeDeck = commonDeck;
    myShipDeck = commonDeck;
    myMeleeRole = commonRole;
    myShipRole = commonRole;
    myTarotGuardian = deckData?.guardian && typeof deckData.guardian === 'object'
        ? { ...deckData.guardian }
        : null;
    myShipMajorArcana = myTarotGuardian?.itemId ? [String(myTarotGuardian.itemId)] : [];
    myShipMajorArcanaLimit = 1;
    if (!getTarotDeckReplacementTargetItemId()) clearTarotDeckReplacementTarget();
}

function setTarotLoadoutMutationPending(isPending) {
    const tabContent = document.getElementById('tabContentInventory');
    if (tabContent) {
        tabContent.classList.toggle('is-tarot-loadout-pending', isPending);
        tabContent.setAttribute('aria-busy', isPending ? 'true' : 'false');
    }
    ['meleeDeckGrid', 'guardianArcanaGrid'].forEach((id) => {
        document.getElementById(id)?.classList.toggle('is-busy', isPending);
    });
}

async function runTarotLoadoutMutation(operation, fallbackMessage) {
    if (tarotLoadoutMutationPending) {
        showInventoryFeedback('タロットデッキを更新中です。', true);
        return null;
    }
    tarotLoadoutMutationPending = true;
    setTarotLoadoutMutationPending(true);
    try {
        return await operation();
    } catch (error) {
        const rawMessage = String(error?.message || '');
        const message = rawMessage.includes('GuardianChanged')
            ? '守護アルカナの状態が更新されました。もう一度確認してください。'
            : (rawMessage || fallbackMessage);
        showInventoryFeedback(message || 'タロットデッキを更新できませんでした。', true);
        return null;
    } finally {
        tarotLoadoutMutationPending = false;
        setTarotLoadoutMutationPending(false);
    }
}

function renderDeckRolePanel(roleEl, deckRole) {
    if (!roleEl) return;
    const role = deckRole?.role || deckRole || null;
    if (!role?.key) {
        roleEl.innerHTML = `
            <div class="tarot-loadout-role-label">現在の役</div>
            <div class="tarot-loadout-role-main">未成立</div>
            <div class="tarot-loadout-role-bonus">役ボーナスなし</div>
            <div class="tarot-loadout-role-hint">5枚の札が揃うと役判定されます。</div>
        `;
        return;
    }
    const bonus = deckRole.bonus || {};
    const explicitBonusText = String(deckRole.bonusText || bonus.bonusText || '').trim();
    const bonusParts = [];
    if (bonus.Power) bonusParts.push(`攻+${bonus.Power}`);
    if (bonus.Defense) bonusParts.push(`防+${bonus.Defense}`);
    if (bonus.Agi) bonusParts.push(`敏+${bonus.Agi}`);
    if (bonus.Int) bonusParts.push(`知+${bonus.Int}`);
    const bonusText = explicitBonusText || (bonusParts.length ? bonusParts.join(' / ') : '役ボーナスなし');
    const suitLabel = role.resolvedSuitLabel ? ` (${role.resolvedSuitLabel})` : '';
    roleEl.innerHTML = `
        <div class="tarot-loadout-role-label">現在の役</div>
        <div class="tarot-loadout-role-main">${role.label || role.key}${suitLabel}</div>
        <div class="tarot-loadout-role-bonus">${bonusText}</div>
    `;
}

function getDeckCardSuitKey(item, canonicalCategory) {
    const cd = item?.customData || {};
    if (canonicalCategory === 'TarotMajor') {
        return getMajorArcanaSuitInfo(cd).key || 'none';
    }
    return String(cd.ArcanaSuit || cd.Suit || '').trim().toLowerCase() || 'none';
}

function getDeckCardNumberLabel(item, canonicalCategory) {
    const cd = item?.customData || {};
    const badgeLabel = getTarotNumberBadge(cd);
    if (badgeLabel) return badgeLabel;
    if (canonicalCategory === 'TarotMajor') {
        return String(cd.ArcanaNumber ?? cd.CardNumber ?? '').trim();
    }
    return getTarotRankLabel(cd);
}

function normalizeTarotSuitKeyForBadge(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'wands') return 'wand';
    if (raw === 'swords') return 'sword';
    if (raw === 'cups') return 'cup';
    if (raw === 'pentacles') return 'pentacle';
    if (raw === 'wand' || raw === 'sword' || raw === 'cup' || raw === 'pentacle' || raw === 'all') return raw;
    return 'none';
}

function createTarotNumberBadge(numberLabel, suitKey) {
    const label = String(numberLabel || '').trim();
    if (!label) return null;
    const badge = document.createElement('span');
    badge.className = `tarot-number-badge is-${normalizeTarotSuitKeyForBadge(suitKey)}`;
    badge.textContent = label;
    badge.setAttribute('aria-hidden', 'true');
    return badge;
}

function createTarotNumberBadgeForItem(item, canonicalCategory = '') {
    const cd = item?.customData || item || {};
    const category = canonicalCategory || getCanonicalTarotCategory(cd.Category);
    if (category !== 'TarotMajor' && category !== 'TarotMinor') return null;
    const numberLabel = getTarotNumberBadge(cd);
    const suitKey = category === 'TarotMajor'
        ? getMajorArcanaSuitInfo(cd).key
        : (cd.ArcanaSuit || cd.Suit);
    return createTarotNumberBadge(numberLabel, suitKey);
}

function buildDeckCardEntry(item, itemId) {
    const cd = item?.customData || {};
    const canonicalCategory = getCanonicalTarotCategory(cd.Category);
    const suitKey = getDeckCardSuitKey(item, canonicalCategory);
    const suitLabel = getTarotSuitLabel(cd) || '無属性';
    const numberLabel = getDeckCardNumberLabel(item, canonicalCategory);
    const roleName = String(cd.ArcanaRole || cd.RoleName || '').trim();
    const rankLabel = canonicalCategory === 'TarotMinor' ? getTarotRankLabel(cd) : '';
    const detail = canonicalCategory === 'TarotMajor'
        ? [suitLabel, roleName].filter(Boolean).join(' / ')
        : [suitLabel, rankLabel].filter(Boolean).join(' / ');
    return {
        title: item?.name || cd.DisplayName || itemId || 'タロットカード',
        detail: detail || (canonicalCategory === 'TarotMajor' ? '大アルカナ' : '小アルカナ'),
        sprite: getTarotSpriteFrame(item),
        suitKey,
        suitLabel,
        numberLabel,
        isArcana: canonicalCategory === 'TarotMajor'
    };
}

function renderDeckCardSprite(visualEl, entry) {
    if (!visualEl) return;
    const sprite = entry?.sprite;
    const artEl = document.createElement('div');
    artEl.className = 'tarot-loadout-art';
    if (sprite?.path) {
        setSpriteIcon(
            artEl,
            sprite.path,
            Number(sprite.index || 0) || 0,
            Number(sprite.width || 48) || 48,
            Number(sprite.height || 80) || 80,
            1,
            null,
            null
        );
    } else {
        artEl.textContent = '🂠';
    }
    visualEl.appendChild(artEl);
}

function createTarotLoadoutVisual(entry, className = 'tarot-loadout-visual') {
    const visualEl = document.createElement('span');
    visualEl.className = className;
    renderDeckCardSprite(visualEl, entry);
    const numberBadge = createTarotNumberBadge(entry?.numberLabel, entry?.suitKey);
    if (numberBadge) visualEl.appendChild(numberBadge);
    return visualEl;
}

function normalizeSelectedTarotLoadout(deckItemIds) {
    const deck = Array.isArray(deckItemIds) ? deckItemIds.filter(Boolean) : [];
    if (!deck.includes(selectedTarotLoadoutItemId)) {
        selectedTarotLoadoutItemId = deck[0] || '';
    }
    return selectedTarotLoadoutItemId;
}

function renderDeckGrid(gridEl, deckItemIds) {
    if (!gridEl) return;
    const MAX_SLOTS = 5;
    const filledCount = Math.min(deckItemIds.length, MAX_SLOTS);
    const selectedItemId = normalizeSelectedTarotLoadout(deckItemIds);
    gridEl.dataset.deckCount = String(filledCount);
    gridEl.dataset.deckComplete = filledCount >= MAX_SLOTS ? 'true' : 'false';
    gridEl.setAttribute('aria-label', `タロットデッキ ${filledCount}/${MAX_SLOTS}`);
    const cells = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
        const itemId = deckItemIds[i] || null;
        const item = itemId
            ? myInventory.find((entry) => getInventoryItemReferenceIds(entry).includes(itemId))
            : null;
        const cell = document.createElement('button');
        cell.className = `tarot-loadout-card${item ? '' : ' is-empty'}`;
        cell.type = 'button';
        cell.dataset.slotIndex = String(i);
        cell.setAttribute('aria-label', `タロットデッキ ${i + 1}枚目`);
        if (item) {
            cell.classList.add('is-equipped');
            const entry = buildDeckCardEntry(item, itemId);
            if (entry.isArcana) cell.classList.add('is-arcana');
            cell.dataset.suit = entry.suitKey || 'none';
            cell.title = entry.title;
            cell.classList.toggle('is-selected', itemId === selectedItemId);
            cell.setAttribute('aria-label', `${entry.title}の共鳴効果を表示`);
            cell.setAttribute('aria-pressed', itemId === selectedItemId ? 'true' : 'false');
            cell.addEventListener('click', () => {
                selectedTarotLoadoutItemId = itemId;
                renderDeckGrid(gridEl, getCommonTarotDeck());
                renderTarotDeckEffectList(document.getElementById('meleeDeckEffectList'), getCommonTarotDeck());
            });
            cell.append(createTarotLoadoutVisual(entry));
            const slotBadge = document.createElement('span');
            slotBadge.className = 'tarot-loadout-slot-badge';
            slotBadge.textContent = String(i + 1);
            slotBadge.setAttribute('aria-hidden', 'true');
            cell.appendChild(slotBadge);
        } else {
            cell.dataset.targetCategory = 'TarotMinor';
            cell.setAttribute('aria-label', `タロットデッキ ${i + 1}枚目に追加するカードを選ぶ`);
            cell.addEventListener('click', () => openTarotDeckCandidateList('TarotMinor'));
            const emptyEl = document.createElement('div');
            emptyEl.className = 'tarot-loadout-cell-empty';
            emptyEl.setAttribute('aria-hidden', 'true');
            cell.appendChild(emptyEl);
        }
        cells.push(cell);
    }
    gridEl.innerHTML = '';
    cells.forEach((cell) => gridEl.appendChild(cell));
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => syncInventoryStickyMetrics());
    } else {
        syncInventoryStickyMetrics();
    }
}

function renderShipMajorArcanaGrid(gridEl) {
    if (!gridEl) return;
    const maxSlots = 1;
    const filledCount = myTarotGuardian?.itemId ? 1 : 0;
    gridEl.hidden = false;
    gridEl.dataset.deckCount = String(filledCount);
    gridEl.dataset.deckComplete = filledCount >= maxSlots ? 'true' : 'false';
    gridEl.setAttribute('aria-label', `守護アルカナ ${filledCount}/${maxSlots}`);
    const cells = [];
    for (let i = 0; i < maxSlots; i++) {
        const itemId = myTarotGuardian?.itemId || null;
        const item = itemId ? myInventory.find((inv) => inv.itemId === itemId) : null;
        const cell = document.createElement('button');
        cell.className = `tarot-loadout-card${item ? ' is-arcana' : ' is-empty'}`;
        cell.type = 'button';
        cell.dataset.slotIndex = String(i);
        cell.setAttribute('aria-label', item ? `${item.name || itemId}の詳細を開く` : '守護アルカナ 空き');
        if (item) {
            cell.classList.add('is-equipped');
            const entry = buildDeckCardEntry(item, itemId);
            cell.dataset.suit = entry.suitKey || 'none';
            cell.title = entry.title;
            cell.addEventListener('click', () => showItemDetailModal(item));
            cell.append(createTarotLoadoutVisual(entry));
        } else {
            cell.dataset.targetCategory = 'TarotMajor';
            cell.setAttribute('aria-label', '守護アルカナに設定するカードを選ぶ');
            cell.addEventListener('click', () => openTarotDeckCandidateList('TarotMajor'));
            const emptyEl = document.createElement('div');
            emptyEl.className = 'tarot-loadout-cell-empty';
            emptyEl.setAttribute('aria-hidden', 'true');
            cell.appendChild(emptyEl);
        }
        cells.push(cell);
    }
    gridEl.innerHTML = '';
    cells.forEach((cell) => gridEl.appendChild(cell));
}

function openTarotDeckCandidateList(category, options = {}) {
    const isMajor = category === 'TarotMajor';
    const replacementTargetItemId = category === 'TarotMinor'
        ? String(options.replacementTargetItemId || '').trim()
        : '';
    tarotDeckReplacementTargetItemId = replacementTargetItemId;
    switchInventoryTab(category);
    requestAnimationFrame(() => {
        scrollInventoryItemsIntoView({ behavior: 'smooth' });
        const firstCard = document.querySelector('#inventoryGrid .inventory-item-detail-trigger');
        firstCard?.focus({ preventScroll: true });
        const targetItem = replacementTargetItemId
            ? myInventory.find((entry) => String(entry?.itemId || '') === replacementTargetItemId)
            : null;
        showInventoryFeedback(isMajor
            ? '守護に設定する大アルカナを選んでください。'
            : (targetItem
                ? `「${targetItem.name || '選択したカード'}」と入れ替えるカードを選んでください。`
                : 'デッキに追加する小アルカナを選んでください。'));
    });
}

function openTarotDeckReplacementList(itemId) {
    const targetItemId = String(itemId || '').trim();
    if (!getCommonTarotDeck().includes(targetItemId)) {
        showInventoryFeedback('入れ替えるカードがデッキにありません。', true);
        return;
    }
    openTarotDeckCandidateList('TarotMinor', { replacementTargetItemId: targetItemId });
}

function findInventoryTarotCard(definition, type) {
    return myInventory.find((item) => {
        const data = item?.customData || {};
        const category = getCanonicalTarotCategory(data.Category);
        if (type === 'major') {
            const itemIdNumber = String(item?.itemId || '').match(/(?:major|arcana)[_-]?0*(\d{1,2})/i)?.[1];
            return category === 'TarotMajor'
                && Number(data.ArcanaNumber ?? data.Number ?? itemIdNumber) === Number(definition.number);
        }
        return category === 'TarotMinor'
            && String(data.ArcanaSuit || data.Suit || '').toLowerCase() === String(definition.suit || '').toLowerCase()
            && getTarotRankNumber(data) === Number(definition.rank);
    }) || null;
}

const TAROT_LOADOUT_SUIT_LABELS = Object.freeze({
    Cup: '杯',
    Wand: '杖',
    Sword: '剣',
    Pentacle: '貨'
});

const TAROT_GUARDIAN_ATTRIBUTE_LABELS = Object.freeze({
    light: '光属性',
    dark: '闇属性',
    neutral: '無属性'
});

function getInventoryCardLevel(itemId) {
    return Math.max(1, Number(cardLevelMap[String(itemId || '')]?.level) || 1);
}

function getCardDuplicateCount(levelData) {
    return Math.max(0, Math.floor(Number(levelData?.duplicateCount) || 0));
}

function getCardDuplicateCost(levelData) {
    return Math.max(1, Math.floor(Number(levelData?.duplicateCost) || 1));
}

function canLevelUpTarotCard(levelData) {
    return Boolean(levelData)
        && Number(levelData.level) < Number(levelData.maxLevel)
        && (levelData.canLevelUp === true || getCardDuplicateCount(levelData) >= getCardDuplicateCost(levelData));
}

function getTarotLevelUpAction(levelData, itemId) {
    if (!levelData || Number(levelData.level) >= Number(levelData.maxLevel)) return null;
    if (!canLevelUpTarotCard(levelData)) {
        const duplicateCost = getCardDuplicateCost(levelData);
        return {
            label: `予備カードが不足（${getCardDuplicateCount(levelData)}/${duplicateCost}）`,
            tone: 'disabled',
            disabled: true,
            title: `同じカードの予備が${duplicateCost}枚必要です。最後の1枚は残ります。`
        };
    }
    const duplicateCost = getCardDuplicateCost(levelData);
    return {
        label: `Lvアップ（同名${duplicateCost}枚）`,
        tone: 'levelup',
        run: () => levelUpCard(itemId)
    };
}

function renderTarotLoadoutEmpty(root, message) {
    if (!root) return;
    const empty = document.createElement('p');
    empty.className = 'tarot-loadout-effect-empty';
    empty.textContent = message;
    root.replaceChildren(empty);
}

function createTarotLoadoutEffectRow(item, itemId, slotIndex) {
    const data = item?.customData || {};
    const suit = String(data.ArcanaSuit || data.Suit || '');
    const rank = getTarotRankNumber(data);
    const definition = getTarotKingdomMinorApDefinition(suit, rank)
        || getTarotKingdomMinorDefinition(suit, rank);
    const level = getInventoryCardLevel(itemId);
    const scale = getTarotKingdomCardLevelScale(level);
    const suitName = String(definition?.suit || suit || 'None');
    const preview = document.createElement('article');
    preview.className = 'tarot-loadout-effect-row';
    preview.dataset.suit = suitName.toLowerCase();
    preview.dataset.slotIndex = String(slotIndex);
    const copy = document.createElement('span');
    copy.className = 'tarot-loadout-effect-copy';
    const kicker = document.createElement('span');
    kicker.className = 'tarot-loadout-effect-kicker';
    kicker.textContent = `${TAROT_LOADOUT_SUIT_LABELS[definition?.suit] || '札'} ${getTarotRankLabel({ ArcanaRank: rank })}`;
    const name = document.createElement('strong');
    name.className = 'tarot-loadout-effect-name';
    name.textContent = definition?.name || item?.name || '共鳴効果';
    const meta = document.createElement('small');
    meta.className = 'tarot-loadout-effect-meta';
    meta.textContent = `枠${slotIndex + 1} · Lv${level}${level > 1 ? ` · 数値×${scale.toFixed(2)}` : ''}`;
    const effect = document.createElement('span');
    effect.className = 'tarot-loadout-effect-text';
    effect.textContent = definition ? String(definition.effect || getTarotKingdomFriendlyEffectText(definition)) : '効果データ未登録';
    const rSummary = document.createElement('small');
    rSummary.className = 'tarot-loadout-effect-r';
    rSummary.textContent = definition?.apCost === 'all'
        ? '消費AP：すべて'
        : `消費AP：${Math.max(0, Number(definition?.apCost) || 0)}`;
    copy.append(kicker, name, meta, effect, rSummary);

    const actions = document.createElement('div');
    actions.className = 'tarot-loadout-effect-actions';
    const actionSpecs = [
        ['詳細', 'カード詳細を開く', true, () => showItemDetailModal(item)],
        ['入れ替え', 'このカードを入れ替える', true, () => openTarotDeckReplacementList(itemId)],
        ['外す', 'デッキから外す', true, () => unequipTarotCardFromDeck(window.myPlayFabId || null, itemId, 'tarot')]
    ];
    actionSpecs.forEach(([label, ariaLabel, enabled, run]) => {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = `tarot-loadout-effect-action${label === '外す' ? ' is-remove' : ''}${label === '詳細' ? ' is-detail' : ''}${label === '入れ替え' ? ' is-replace' : ''}`;
        action.textContent = label;
        action.disabled = !enabled;
        action.setAttribute('aria-label', ariaLabel);
        action.addEventListener('click', run);
        actions.appendChild(action);
    });
    preview.append(copy, actions);
    return preview;
}

function renderTarotDeckEffectList(root, deckItemIds) {
    if (!root) return;
    const deck = (Array.isArray(deckItemIds) ? deckItemIds : []).slice(0, 5);
    const selectedItemId = normalizeSelectedTarotLoadout(deck);
    const slotIndex = deck.indexOf(selectedItemId);
    const item = myInventory.find((entry) => entry.itemId === selectedItemId);
    if (!item || slotIndex < 0) {
        renderTarotLoadoutEmpty(root, '小アルカナをセットすると、ここに共鳴効果が表示されます。');
        return;
    }
    root.replaceChildren(createTarotLoadoutEffectRow(item, selectedItemId, slotIndex));
}

function renderGuardianArcanaEffectList(root) {
    if (!root) return;
    const itemId = String(myTarotGuardian?.itemId || '');
    const item = itemId ? myInventory.find((entry) => entry.itemId === itemId) : null;
    if (!item) {
        renderTarotLoadoutEmpty(root, '大アルカナを1枚セットすると、守護パッシブが表示されます。');
        return;
    }
    const data = item.customData || {};
    const matchedNumber = itemId.match(/(?:major|arcana)[_-]?0*(\d{1,2})/i)?.[1];
    const number = Number(data.ArcanaNumber ?? data.Number ?? matchedNumber);
    const definition = getTarotKingdomGuardianDefinition(number);
    const level = getInventoryCardLevel(itemId);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tarot-guardian-effect-summary';
    button.dataset.attribute = String(definition?.attribute || 'neutral');
    button.setAttribute('aria-label', `${item.name || '守護アルカナ'}の守護能力を詳しく見る`);
    button.addEventListener('click', () => showItemDetailModal(item));

    const entry = buildDeckCardEntry(item, itemId);
    const visual = createTarotLoadoutVisual(entry, 'tarot-loadout-effect-card is-guardian');

    const copy = document.createElement('span');
    copy.className = 'tarot-guardian-effect-copy';
    const kicker = document.createElement('span');
    kicker.className = 'tarot-guardian-effect-kicker';
    kicker.textContent = TAROT_GUARDIAN_ATTRIBUTE_LABELS[definition?.attribute] || '無属性';
    const title = document.createElement('strong');
    title.className = 'tarot-guardian-effect-name';
    title.textContent = definition?.passiveName || item.name || `大アルカナ ${number}`;
    const meta = document.createElement('small');
    meta.className = 'tarot-guardian-effect-meta';
    meta.textContent = `守護中 · Lv${level}`;

    const passive = document.createElement('span');
    passive.className = 'tarot-guardian-effect-line is-passive';
    const passiveLabel = document.createElement('b');
    passiveLabel.textContent = '守護';
    const passiveText = document.createElement('span');
    passiveText.textContent = definition?.passive || '効果データ未登録';
    passive.append(passiveLabel, passiveText);

    copy.append(kicker, title, meta, passive);

    const chevron = document.createElement('span');
    chevron.className = 'tarot-loadout-effect-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '›';
    button.append(visual, copy, chevron);
    root.replaceChildren(button);
}

function closeArcanaResonanceCatalog(options = {}) {
    const modal = document.getElementById('arcanaResonanceCatalogModal');
    if (!modal) return;
    const restoreFocus = options.restoreFocus !== false;
    const returnFocusElement = arcanaResonanceCatalogReturnFocusElement;
    modal.setAttribute('aria-hidden', 'true');
    hideModal(modal);
    if (restoreFocus && returnFocusElement?.isConnected) {
        requestAnimationFrame(() => returnFocusElement.focus());
    }
    arcanaResonanceCatalogReturnFocusElement = null;
}

function openArcanaResonanceCatalog() {
    let modal = document.getElementById('arcanaResonanceCatalogModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'arcanaResonanceCatalogModal';
        modal.className = 'modal-overlay arcana-resonance-catalog';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <section class="arcana-resonance-sheet" role="dialog" aria-modal="true" aria-labelledby="arcanaResonanceCatalogTitle">
                <header class="arcana-resonance-head">
                    <div>
                        <h3 id="arcanaResonanceCatalogTitle">タロット効果一覧</h3>
                        <p>小アルカナの共鳴と大アルカナの守護能力</p>
                    </div>
                    <button type="button" class="arcana-resonance-close ui-modal-close" aria-label="タロット効果一覧を閉じる"></button>
                 </header>
                 <nav class="arcana-resonance-tabs" aria-label="アルカナ分類"></nav>
                 <nav class="arcana-resonance-filters" aria-label="所持状態"></nav>
                 <div class="arcana-resonance-list"></div>
            </section>
        `;
        document.body.appendChild(modal);
        bindModalClose(modal.querySelector('.arcana-resonance-close'), closeArcanaResonanceCatalog, {
            overlay: modal,
            closeOnBackdrop: true,
            icon: true
        });
        modal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeArcanaResonanceCatalog();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = Array.from(modal.querySelectorAll('button:not(:disabled), [tabindex="0"]'))
                .filter((element) => !element.closest('[hidden]'));
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
    }
    const tabs = [
        ['Cup', 'カップ'],
        ['Wand', 'ワンド'],
        ['Sword', 'ソード'],
        ['Pentacle', 'ペンタクル'],
        ['Major', '大アルカナ']
    ];
    const tabRoot = modal.querySelector('.arcana-resonance-tabs');
    const filterRoot = modal.querySelector('.arcana-resonance-filters');
    const listRoot = modal.querySelector('.arcana-resonance-list');
    let activeTab = 'Cup';
    let activeFilter = 'all';
    const renderTab = (tabKey) => {
        activeTab = tabKey;
        tabRoot.querySelectorAll('button').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.tab === tabKey);
        });
        filterRoot.querySelectorAll('button').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.filter === activeFilter);
        });
        const definitions = tabKey === 'Major'
            ? TAROT_KINGDOM_ARCANA_EFFECT_CATALOG.guardian
            : TAROT_KINGDOM_ARCANA_AP_EFFECTS.minor.filter((entry) => entry.suit === tabKey);
        listRoot.innerHTML = '';
        definitions.forEach((definition) => {
            const item = findInventoryTarotCard(definition, tabKey === 'Major' ? 'major' : 'minor');
            const level = Math.max(1, Number(cardLevelMap[item?.itemId]?.level) || 1);
            const scale = getTarotKingdomCardLevelScale(level);
            const equipped = tabKey === 'Major'
                ? isShipMajorArcanaEquipped(item?.itemId)
                : isCardInTarotDeck(item?.itemId);
            if (activeFilter === 'owned' && !item) return;
            if (activeFilter === 'equipped' && !equipped) return;
            const row = document.createElement('article');
            row.className = `arcana-resonance-row${equipped ? ' is-equipped' : ''}${item ? '' : ' is-unowned'}`;
            row.dataset.suit = tabKey.toLowerCase();
            const stateLabel = equipped ? '装備中' : (item ? `Lv${level}` : '未所持');
            row.innerHTML = tabKey === 'Major'
                ? `<div class="arcana-resonance-title"><strong>${definition.number}. ${definition.passiveName}</strong><span>${stateLabel}</span></div>
                   <p><b>${definition.passiveName}</b>：${definition.passive}</p>
                   <small>${item ? `現在Lvの数値倍率 ×${scale.toFixed(2)}` : '入手後に守護アルカナへ設定できます'}</small>`
                : `<div class="arcana-resonance-title"><strong>${getTarotRankLabel({ ArcanaRank: definition.rank })} ${definition.name}</strong><span>${stateLabel}</span></div>
                   <p>${String(definition.effect || '')}</p>
                   <small>消費AP：${definition.apCost === 'all' ? 'すべて' : Math.max(0, Number(definition.apCost) || 0)}${item ? ` · 現在Lvの数値倍率 ×${scale.toFixed(2)}` : ' · 入手後に共鳴デッキへ設定できます'}</small>`;
            if (item) {
                const openDetail = () => {
                    closeArcanaResonanceCatalog({ restoreFocus: false });
                    showItemDetailModal(item);
                };
                row.tabIndex = 0;
                row.setAttribute('role', 'button');
                row.setAttribute('aria-label', `${item.name || definition.name}の詳細を開く`);
                row.addEventListener('click', openDetail);
                row.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    openDetail();
                });
            }
            listRoot.appendChild(row);
        });
        if (!listRoot.children.length) {
            const empty = document.createElement('p');
            empty.className = 'arcana-resonance-empty';
            empty.textContent = activeFilter === 'equipped' ? 'この分類には装備中の札がありません。' : '該当する札がありません。';
            listRoot.appendChild(empty);
        }
    };
    tabRoot.innerHTML = '';
    tabs.forEach(([key, label], index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.tab = key;
        button.textContent = label;
        button.addEventListener('click', () => renderTab(key));
        tabRoot.appendChild(button);
        if (index === 0) button.classList.add('is-active');
    });
    filterRoot.innerHTML = '';
    [['all', '全て'], ['owned', '所持'], ['equipped', '装備中']].forEach(([key, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.filter = key;
        button.textContent = label;
        button.classList.toggle('is-active', key === activeFilter);
        button.addEventListener('click', () => {
            activeFilter = key;
            renderTab(activeTab);
        });
        filterRoot.appendChild(button);
    });
    renderTab('Cup');
    arcanaResonanceCatalogReturnFocusElement = document.activeElement;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'false');
    showModal(modal);
    requestAnimationFrame(() => modal.querySelector('.arcana-resonance-close')?.focus());
}

function renderTarotDeckPanels() {
    const guardianPanel = document.getElementById('guardianArcanaPanel');
    if (guardianPanel) guardianPanel.hidden = false;
    renderDeckRolePanel(document.getElementById('meleeDeckRole'), getCommonTarotRole());
    renderDeckGrid(document.getElementById('meleeDeckGrid'), getCommonTarotDeck());
    renderShipMajorArcanaGrid(document.getElementById('guardianArcanaGrid'));
    renderTarotDeckEffectList(document.getElementById('meleeDeckEffectList'), getCommonTarotDeck());
    renderGuardianArcanaEffectList(document.getElementById('guardianArcanaEffectList'));
    const catalogButton = document.getElementById('openArcanaResonanceCatalog');
    if (catalogButton && catalogButton.dataset.catalogBound !== 'true') {
        catalogButton.dataset.catalogBound = 'true';
        catalogButton.addEventListener('click', openArcanaResonanceCatalog);
    }
}

function getInventoryTabHint(category) {
    if (category === 'TarotMajor') {
        return '大アルカナは1枚だけ守護アルカナに設定できます。';
    }
    if (category === 'TarotMinor') {
        const targetItemId = getTarotDeckReplacementTargetItemId();
        if (targetItemId) {
            const targetItem = myInventory.find((item) => String(item?.itemId || '') === targetItemId);
            return `「${targetItem?.name || '選択したカード'}」と入れ替えるカードを選んでください。`;
        }
        return '小アルカナは5枚までデッキに編成できます。';
    }
    if (category === 'Hand') {
        return '武器・盾・左手補助から、装備する手を選べます。';
    }
    if (category === 'Accessory') {
        return 'アクセサリーは1個装備できます。';
    }
    if (category === 'LeftHand') {
        return '盾と左手用の補助装備です。盾は右手にも装備できます。';
    }
    if (category === 'Offhand') {
        return '副手は左手に装備する補助装備です。';
    }
    if (category === 'Weapon') {
        return '右手と左手に装備できる武器です。';
    }
    if (category === 'Shield') {
        return '盾は右手と左手に装備できます。';
    }
    if (category === 'Armor') {
        return '防具は頭装備として1個装備できます。';
    }
    return '';
}

function updateInventoryTabHint(category) {
    const hintEl = document.getElementById('inventoryTabHint');
    if (!hintEl) return;
    const hintText = getInventoryTabHint(category);
    hintEl.textContent = hintText;
    hintEl.hidden = !hintText;
}

function updateInventorySortOptions(category) {
    const sortEl = document.getElementById('inventorySort');
    if (!sortEl) return;
    const options = INVENTORY_SORT_OPTIONS[category] || INVENTORY_SORT_OPTIONS.All;
    const currentValue = sortEl.value;
    sortEl.innerHTML = options.map((option) => `<option value="${option.value}">${option.label}</option>`).join('');
    const nextValue = options.some((option) => option.value === currentValue)
        ? currentValue
        : (options[0]?.value || 'default');
    sortEl.value = nextValue;
    sortEl.disabled = false;
    sortEl.style.visibility = 'visible';
}

function getEmptyInventoryMessage(category) {
    if (category === 'TarotMajor') {
        return '大アルカナはまだありません。獲得すると守護アルカナに設定できます。';
    }
    if (category === 'TarotMinor') {
        return '小アルカナはまだありません。本日の占いで正位置を引くとカードを獲得できます。';
    }
    if (category === 'Hand') {
        return '手に装備できる武器・盾・補助装備はまだありません。';
    }
    if (category === 'Accessory') {
        return 'このカテゴリのアクセサリーはまだありません。';
    }
    if (category === 'LeftHand') {
        return '左手装備はまだありません。';
    }
    if (category === 'Offhand') {
        return 'このカテゴリの副手はまだありません。';
    }
    return 'このカテゴリのアイテムはありません。';
}

function getInventoryCategoryLabel(category) {
    if (category === 'Hand') return '手装備';
    if (category === 'LeftHand') return '左手';
    const canonicalCategory = getCanonicalTarotCategory(category);
    if (canonicalCategory === 'TarotMajor') return '大アルカナ';
    if (canonicalCategory === 'TarotMinor') return '小アルカナ';
    if (canonicalCategory === 'Weapon') return '武器';
    if (canonicalCategory === 'Shield') return '盾';
    if (canonicalCategory === 'Offhand') return '副手';
    if (canonicalCategory === 'Armor') return '防具';
    if (canonicalCategory === 'Accessory') return 'アクセ';
    if (canonicalCategory === 'Consumable') return '消耗品';
    return canonicalCategory || '不明';
}

function getInventoryListTitle(category) {
    if (category === 'All') return '持ち物';
    return getInventoryCategoryLabel(category);
}

function countInventoryEntriesForDisplay(items) {
    return items.reduce((sum, item) => sum + Math.max(1, Number(item?.count || 1) || 1), 0);
}

function renderInventoryListSummary(category, filteredItems) {
    if (typeof document === 'undefined') return;
    const titleEl = document.getElementById('inventoryItemsTitle');
    if (titleEl) {
        titleEl.textContent = getInventoryListTitle(category);
    }

    const summaryEl = document.getElementById('inventoryListSummary');
    if (!summaryEl) return;
    summaryEl.replaceChildren();
    if (!inventorySearchQuery) {
        summaryEl.hidden = true;
        return;
    }
    summaryEl.hidden = false;
    summaryEl.textContent = `${countInventoryEntriesForDisplay(filteredItems)}件`;
}

function getSelectedInventorySellEntries() {
    return getDisplayInventoryEntries()
        .filter((item) => selectedInventorySellItemIds.has(getInventoryEntryKey(item)))
        .map((item) => ({ item, amount: getInventorySellableCount(item) }))
        .filter((entry) => entry.amount > 0);
}

function pruneInventorySellSelection() {
    const sellableIds = new Set(
        getDisplayInventoryEntries()
            .filter(isInventoryItemSellable)
            .map(getInventoryEntryKey)
            .filter(Boolean)
    );
    selectedInventorySellItemIds = new Set(
        [...selectedInventorySellItemIds].filter((itemKey) => sellableIds.has(itemKey))
    );
}

function toggleInventorySellSelection(item) {
    const itemId = String(item?.itemId || '').trim();
    const itemKey = getInventoryEntryKey(item);
    if (!itemId) return true;
    if (!isInventoryItemSellable(item)) {
        showInventoryFeedback('このアイテムは売却できません。', true);
        return true;
    }
    if (selectedInventorySellItemIds.has(itemKey)) {
        selectedInventorySellItemIds.delete(itemKey);
    } else {
        selectedInventorySellItemIds.add(itemKey);
    }
    renderInventoryGrid(activeInventoryCategory);
    return true;
}

function setInventorySellSelectionMode(isActive) {
    inventorySellSelectionMode = isActive === true;
    if (!inventorySellSelectionMode) selectedInventorySellItemIds.clear();
    renderInventoryGrid(activeInventoryCategory);
}

function renderInventorySellControls(visibleItems = []) {
    if (typeof document === 'undefined') return;
    const controls = document.getElementById('inventorySellControls');
    const selectionBar = document.getElementById('inventorySelectionBar');
    if (!controls || !selectionBar) return;
    controls.innerHTML = '';
    selectionBar.replaceChildren();
    selectionBar.hidden = true;
    pruneInventorySellSelection();
    document.getElementById('tabContentInventory')?.classList.toggle('is-sell-selection-active', inventorySellSelectionMode);

    if (inventorySellSelectionMode) {
        controls.hidden = true;
        const selectedEntries = getSelectedInventorySellEntries();
        const selectedCount = selectedEntries.reduce((sum, entry) => sum + entry.amount, 0);

        const endSelectionButton = document.createElement('button');
        endSelectionButton.type = 'button';
        endSelectionButton.className = 'inventory-sell-control-btn is-cancel';
        endSelectionButton.textContent = '終了';
        endSelectionButton.addEventListener('click', () => setInventorySellSelectionMode(false));
        selectionBar.appendChild(endSelectionButton);

        const summary = document.createElement('span');
        summary.className = 'inventory-selection-summary';
        summary.textContent = `${selectedCount}個 ${selectedCount}G`;
        selectionBar.appendChild(summary);

        const selectVisibleButton = document.createElement('button');
        selectVisibleButton.type = 'button';
        selectVisibleButton.className = 'inventory-sell-control-btn';
        selectVisibleButton.textContent = '全選択';
        selectVisibleButton.addEventListener('click', () => {
            visibleItems.filter(isInventoryItemEligibleForBulkSellSelect).forEach((item) => {
                selectedInventorySellItemIds.add(getInventoryEntryKey(item));
            });
            renderInventoryGrid(activeInventoryCategory);
        });
        selectionBar.appendChild(selectVisibleButton);

        const sellButton = document.createElement('button');
        sellButton.type = 'button';
        sellButton.className = 'inventory-sell-control-btn is-sell';
        sellButton.textContent = `売却 ${selectedCount}G`;
        sellButton.disabled = selectedCount <= 0;
        sellButton.addEventListener('click', () => {
            sellSelectedInventoryItems();
        });
        selectionBar.appendChild(sellButton);
        selectionBar.hidden = false;
        return;
    }

    controls.hidden = false;

    const marketButton = createBlackMarketButton('闇市', '', async () => {
        blackMarketReturnFocusElement = marketButton;
        blackMarketVisible = true;
        blackMarketErrorMessage = '';
        renderBlackMarketPanel();
        await loadBlackMarketListings({ force: true });
    });
    controls.appendChild(marketButton);

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'inventory-sell-control-btn';
    toggleButton.textContent = '選択売却';
    toggleButton.addEventListener('click', () => {
        setInventorySellSelectionMode(true);
    });
    controls.appendChild(toggleButton);
}

function getBlackMarketPanelElement() {
    let panel = document.getElementById('blackMarketPanel');
    if (!panel) {
        panel = document.createElement('section');
        panel.id = 'blackMarketPanel';
        panel.className = 'black-market-panel';
        panel.hidden = true;
        panel.setAttribute('aria-live', 'polite');
    }
    if (panel && panel.parentElement !== document.body) {
        document.body.appendChild(panel);
    }
    if (panel && panel.dataset.dismissBound !== 'true') {
        panel.dataset.dismissBound = 'true';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'blackMarketTitle');
        panel.addEventListener('click', (event) => {
            if (event.target !== panel) return;
            closeBlackMarketPanel();
        });
        panel.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeBlackMarketPanel();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = Array.from(panel.querySelectorAll('button:not(:disabled), [href], input:not(:disabled)'))
                .filter((element) => !element.hidden);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
    }
    return panel;
}

function closeBlackMarketPanel() {
    blackMarketVisible = false;
    blackMarketErrorMessage = '';
    renderBlackMarketPanel();
    const returnFocus = blackMarketReturnFocusElement;
    blackMarketReturnFocusElement = null;
    const focusTarget = returnFocus?.isConnected
        ? returnFocus
        : document.querySelector('#inventorySellControls .inventory-sell-control-btn');
    if (focusTarget instanceof HTMLElement) focusTarget.focus();
}

function createBlackMarketListingItem(listing) {
    const item = {
        itemId: listing.itemId,
        name: listing.itemName || listing.itemId,
        description: listing.description || listing.itemData?.Description || '',
        customData: listing.itemData || {}
    };
    const row = document.createElement('article');
    row.className = 'black-market-listing';
    row.dataset.listingId = listing.listingId;

    const iconFrame = document.createElement('div');
    iconFrame.className = 'black-market-listing-icon';
    const icon = document.createElement('div');
    try {
        setInventoryIcon(
            icon,
            getInventorySpriteFrame(item),
            1,
            item.customData?.Category,
            window.myAvatarBaseInfo?.AvatarColor
        );
    } catch (error) {
        console.warn('[black-market] item icon render failed:', error);
        icon.className = 'black-market-listing-icon-fallback';
        icon.textContent = '?';
    }
    iconFrame.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'black-market-listing-body';
    const title = document.createElement('strong');
    const enhancementBonus = Math.max(0, Math.floor(Number(listing?.displayProperties?.equipmentEnhancement?.bonus) || 0));
    title.textContent = `${item.name}${enhancementBonus > 0 ? ` +${enhancementBonus}` : ''}`;
    const seller = document.createElement('span');
    seller.className = 'black-market-listing-seller';
    seller.textContent = `出品者: ${listing.sellerDisplayName || listing.sellerPlayFabId || 'Player'}`;
    body.append(title, seller);
    const originText = String(listing.originDisplayName || '').trim();
    if (originText) {
        const origin = document.createElement('small');
        origin.textContent = `初代所有者: ${originText}`;
        body.appendChild(origin);
    }
    const pendingLabel = {
        creating: '出品処理を再試行中',
        cancelling: '返却処理を再試行中',
        buying: '精算処理を再試行中'
    }[listing.status] || '';
    if (pendingLabel) {
        const pending = document.createElement('small');
        pending.className = 'black-market-listing-pending';
        pending.textContent = pendingLabel;
        body.appendChild(pending);
    }

    const action = document.createElement('button');
    action.type = 'button';
    action.className = `black-market-listing-action${pendingLabel ? ' is-pending' : (listing.isMine ? ' is-cancel' : ' is-buy')}`;
    const isPending = blackMarketPendingListingId === String(listing.listingId || '');
    action.textContent = pendingLabel ? '復旧中' : (isPending ? '処理中' : (listing.isMine ? '取り消す' : '購入'));
    action.disabled = blackMarketLoading || isPending || !!pendingLabel;
    if (isPending) action.setAttribute('aria-busy', 'true');
    action.addEventListener('click', async () => {
        if (action.disabled) return;
        if (listing.isMine) {
            await cancelBlackMarketListing(listing.listingId);
        } else {
            await buyBlackMarketListing(listing.listingId, listing.price);
        }
    });

    const trade = document.createElement('div');
    trade.className = 'black-market-listing-trade';
    const price = document.createElement('strong');
    price.className = 'black-market-listing-price';
    price.textContent = `${listing.price}G`;
    trade.append(price, action);

    row.append(iconFrame, body, trade);
    return row;
}

function renderBlackMarketPanel() {
    if (typeof document === 'undefined') return;
    const panel = getBlackMarketPanelElement();
    if (!panel) return;
    panel.hidden = !blackMarketVisible;
    if (!blackMarketVisible) {
        stopModalViewportTracking(panel);
        panel.innerHTML = '';
        syncModalLockState();
        return;
    }

    startModalViewportTracking(panel, 'black-market');
    document.body.classList.add('modal-lock');
    panel.innerHTML = '';
    panel.setAttribute('aria-busy', blackMarketLoading ? 'true' : 'false');
    const sheet = document.createElement('div');
    sheet.className = 'black-market-sheet';

    const head = document.createElement('div');
    head.className = 'black-market-panel-head';
    const title = document.createElement('h3');
    title.id = 'blackMarketTitle';
    title.textContent = '闇市';
    const count = document.createElement('span');
    count.className = 'black-market-listing-count';
    count.textContent = `出品 ${blackMarketMyActiveCount}/${blackMarketMaxActiveListings}`;
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'black-market-refresh';
    refresh.setAttribute('aria-label', '闇市を更新');
    refresh.title = '更新';
    refresh.disabled = blackMarketLoading;
    refresh.addEventListener('click', () => loadBlackMarketListings({ force: true }));
    const close = createModalCloseButton({ className: 'black-market-close', label: '闇市を閉じる' });
    close.title = '閉じる';
    bindModalClose(close, closeBlackMarketPanel, { icon: true });
    head.append(title, count, refresh, close);
    sheet.appendChild(head);

    const body = document.createElement('div');
    body.className = 'black-market-body';
    sheet.appendChild(body);
    panel.appendChild(sheet);
    requestAnimationFrame(() => close.focus());

    if (blackMarketLoading) {
        const loading = document.createElement('p');
        loading.className = 'black-market-empty';
        loading.textContent = '読み込み中...';
        body.appendChild(loading);
        return;
    }

    if (blackMarketErrorMessage) {
        const error = document.createElement('p');
        error.className = 'black-market-empty is-error';
        error.textContent = blackMarketErrorMessage;
        body.appendChild(error);
        return;
    }

    if (!blackMarketListings.length) {
        const empty = document.createElement('p');
        empty.className = 'black-market-empty';
        empty.textContent = '出品はありません。';
        body.appendChild(empty);
        return;
    }

    const list = document.createElement('div');
    list.className = 'black-market-list';
    blackMarketListings.forEach((listing) => {
        try {
            list.appendChild(createBlackMarketListingItem(listing));
        } catch (error) {
            console.warn('[black-market] listing render failed:', error);
            const fallback = document.createElement('article');
            fallback.className = 'black-market-listing is-error';
            fallback.textContent = `${listing?.itemName || listing?.itemId || '商品'}を表示できません。`;
            list.appendChild(fallback);
        }
    });
    body.appendChild(list);
}

async function loadBlackMarketListings(options = {}) {
    const playFabId = window.myPlayFabId || null;
    if (!playFabId) {
        blackMarketErrorMessage = 'ログイン情報を取得できません。';
        renderBlackMarketPanel();
        return null;
    }
    blackMarketLoading = true;
    blackMarketErrorMessage = '';
    renderBlackMarketPanel();
    try {
        const data = await requestBlackMarketListings(playFabId, { isSilent: options.isSilent === true });
        blackMarketListings = Array.isArray(data?.listings) ? data.listings : [];
        blackMarketMyActiveCount = Number(data?.myActiveCount ?? blackMarketMyActiveCount) || 0;
        blackMarketMaxActiveListings = Number(data?.maxActiveListings ?? blackMarketMaxActiveListings) || 5;
        return data;
    } catch (error) {
        blackMarketErrorMessage = error?.message || '闇市の取得に失敗しました。';
        showInventoryFeedback(blackMarketErrorMessage, true);
        return null;
    } finally {
        blackMarketLoading = false;
        renderBlackMarketPanel();
    }
}

function getInventoryLayout(category) {
    if (category === 'TarotMajor' || category === 'TarotMinor') return 'tarot';
    if (['Hand', 'Weapon', 'Shield', 'Offhand', 'LeftHand', 'Armor', 'Accessory'].includes(category)) return 'equipment';
    if (category === 'Consumable') return 'consumable';
    if (category === 'All') return 'mixed';
    return 'mixed';
}

function getInventoryCategoryOrder(category) {
    const canonicalCategory = getCanonicalTarotCategory(category);
    if (canonicalCategory === 'Weapon') return 1;
    if (canonicalCategory === 'Shield') return 2;
    if (canonicalCategory === 'Offhand') return 3;
    if (canonicalCategory === 'Armor') return 4;
    if (canonicalCategory === 'Accessory') return 5;
    if (canonicalCategory === 'TarotMajor') return 6;
    if (canonicalCategory === 'TarotMinor') return 7;
    if (canonicalCategory === 'Consumable') return 8;
    return 99;
}

function getInventoryStatValue(itemData, statKey) {
    const statAliases = {
        Power: ['Power', 'Atk'],
        Defense: ['Defense', 'Def'],
        MagicPower: ['MagicPower', 'Int', 'Intelligence'],
        HealPower: ['HealPower', 'HealingPower']
    };
    const keys = statAliases[statKey] || [statKey];
    return Number(keys.map((key) => itemData?.[key]).find((value) => value !== undefined && value !== null) ?? 0) || 0;
}

function compareInventoryItemsDefault(a, b, selectedCategory) {
    const leftCategory = getCanonicalTarotCategory(a?.customData?.Category);
    const rightCategory = getCanonicalTarotCategory(b?.customData?.Category);
    if (selectedCategory === 'All' && leftCategory !== rightCategory) {
        return getInventoryCategoryOrder(leftCategory) - getInventoryCategoryOrder(rightCategory);
    }
    if ((selectedCategory === 'Hand' || selectedCategory === 'LeftHand') && leftCategory !== rightCategory) {
        return getInventoryCategoryOrder(leftCategory) - getInventoryCategoryOrder(rightCategory);
    }
    if ((leftCategory === 'TarotMajor' && rightCategory === 'TarotMajor')
        || (leftCategory === 'TarotMinor' && rightCategory === 'TarotMinor')) {
        return compareTarotItems(a, b);
    }

    const focusCategory = selectedCategory === 'All' || selectedCategory === 'LeftHand' ? leftCategory : selectedCategory;
    if (focusCategory === 'Weapon') {
        const powerDiff = getInventoryStatValue(b?.customData, 'Power') - getInventoryStatValue(a?.customData, 'Power');
        if (powerDiff !== 0) return powerDiff;
    }
    if (focusCategory === 'Shield' || focusCategory === 'Armor') {
        const defenseDiff = getInventoryStatValue(b?.customData, 'Defense') - getInventoryStatValue(a?.customData, 'Defense');
        if (defenseDiff !== 0) return defenseDiff;
    }
    if (focusCategory === 'Offhand') {
        const magicDiff = getInventoryStatValue(b?.customData, 'MagicPower') - getInventoryStatValue(a?.customData, 'MagicPower');
        if (magicDiff !== 0) return magicDiff;
        const healDiff = getInventoryStatValue(b?.customData, 'HealPower') - getInventoryStatValue(a?.customData, 'HealPower');
        if (healDiff !== 0) return healDiff;
    }
    if (focusCategory === 'Accessory') {
        const total = (item) => ['Power', 'Defense', 'Agi', 'Int']
            .reduce((sum, key) => sum + getInventoryStatValue(item?.customData, key), 0);
        const totalDiff = total(b) - total(a);
        if (totalDiff !== 0) return totalDiff;
    }
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'ja');
}

function isInventoryItemEquipped(item) {
    return Object.entries(myCurrentEquipment || {})
        .filter(([slot]) => slot !== 'MajorArcana')
        .some(([, equippedValue]) => isEquipmentReferenceMatch(item, equippedValue));
}

function isInventoryEquipmentCategory(category) {
    return EQUIPPABLE_INVENTORY_CATEGORIES.has(getCanonicalTarotCategory(category));
}

function isEquipmentReferenceMatch(item, equippedValue) {
    if (!item || !equippedValue) return false;
    const itemId = String(item?.itemId || '').trim();
    const equippedItemId = getEquipmentReferenceItemId(equippedValue);
    if (equippedItemId && equippedItemId !== itemId) return false;
    const equippedStackId = getEquipmentReferenceStackId(equippedValue);
    if (equippedStackId) return getInventoryStackIds(item).includes(equippedStackId);
    return !!equippedItemId && equippedItemId === itemId;
}

function getItemEffectSummary(effect) {
    if (!effect || typeof effect !== 'object') return '';
    const effectType = String(effect.Type || '').trim();
    const amount = Number(effect.Amount || 0) || 0;
    if (!effectType) return '';
    const suffix = amount ? ` ${amount}` : '';
    return `${effectType}${suffix}`.trim();
}

function getInventoryCardSubtitle(item, canonicalCategory) {
    const cd = item?.customData || {};
    if (canonicalCategory === 'TarotMajor') {
        const parts = [String(cd.ArcanaRole || '').trim(), getTarotSuitLabel(cd)].filter(Boolean);
        return parts.join(' / ');
    }
    if (canonicalCategory === 'TarotMinor') {
        const parts = [getTarotSuitLabel(cd), getTarotRankLabel(cd)].filter(Boolean);
        return parts.join(' / ');
    }
    if (canonicalCategory === 'Offhand') {
        const parts = [];
        if (cd.MagicPower) parts.push(`術補 ${cd.MagicPower}`);
        if (cd.HealPower) parts.push(`回復 ${cd.HealPower}`);
        if (cd.CastRate) parts.push(`詠唱 ${cd.CastRate}`);
        return parts.join(' / ') || '左手の術補装備';
    }
    if (canonicalCategory === 'Consumable') {
        return getItemEffectSummary(cd.Effect) || String(item?.description || '').trim() || '消耗アイテム';
    }
    const statParts = [];
    if (cd.Power) statParts.push(`攻 ${cd.Power}`);
    if (cd.Defense) statParts.push(`${canonicalCategory === 'Shield' ? '盾' : '防'} ${cd.Defense}`);
    if (cd.Agi) statParts.push(`速 ${cd.Agi}`);
    if (cd.Int) statParts.push(`賢 ${cd.Int}`);
    if (cd.MagicPower) statParts.push(`術補 ${cd.MagicPower}`);
    if (cd.HealPower) statParts.push(`回復 ${cd.HealPower}`);
    if (statParts.length) return statParts.join(' / ');
    return String(item?.description || '').trim() || '詳細を見る';
}

function getInventoryCardChips(item, canonicalCategory) {
    const cd = item?.customData || {};
    const chips = [];
    if (canonicalCategory === 'TarotMajor') {
        const number = Number(cd.ArcanaNumber ?? cd.CardNumber);
        if (Number.isFinite(number)) chips.push(`No.${number}`);
        const lvd = cardLevelMap[item.itemId];
        if (lvd) chips.push(`Lv.${lvd.level} / ${lvd.maxLevel}`);
        if (isShipMajorArcanaEquipped(item.itemId)) chips.push('守護装備');
        else chips.push('未装備');
        return chips.slice(0, 3);
    }
    if (canonicalCategory === 'TarotMinor') {
        const lvd = cardLevelMap[item.itemId];
        if (lvd) chips.push(`Lv.${lvd.level} / ${lvd.maxLevel}`);
        if (isCardInTarotDeck(item.itemId)) chips.push('デッキ');
        else chips.push('未セット');
        const keyword = String(cd.SkillKeyword || cd.ArcanaKeyword || '').trim();
        if (keyword) chips.push(keyword);
        return chips.slice(0, 3);
    }
    if (canonicalCategory === 'Consumable') {
        const effectSummary = getItemEffectSummary(cd.Effect);
        if (effectSummary) chips.push(effectSummary);
        return chips.slice(0, 2);
    }
    const statChips = [
        cd.Power ? `攻 ${cd.Power}` : '',
        cd.Defense ? `${canonicalCategory === 'Shield' ? '盾' : '防'} ${cd.Defense}` : '',
        cd.Agi ? `速 ${cd.Agi}` : '',
        cd.Int ? `賢 ${cd.Int}` : '',
        cd.MagicPower ? `術補 ${cd.MagicPower}` : '',
        cd.HealPower ? `回復 ${cd.HealPower}` : '',
        cd.CastRate ? `詠唱 ${cd.CastRate}` : '',
        cd.MpEfficiency ? `MP効率 ${cd.MpEfficiency}` : '',
        cd.StatusRate ? `状態 ${cd.StatusRate}` : ''
    ].filter(Boolean);
    return statChips.slice(0, 3);
}

function getInventoryCardFooter(item, canonicalCategory) {
    const cd = item?.customData || {};
    if (canonicalCategory === 'TarotMajor') {
        const role = String(cd.ArcanaRole || '').trim();
        const lvd = cardLevelMap[item?.itemId];
        const deckText = isShipMajorArcanaEquipped(item?.itemId)
            ? '守護アルカナ装備中'
            : (isShipMajorArcanaFull() ? '装備中の守護アルカナと入れ替え' : '守護アルカナに設定できます');
        if (!lvd) return role ? `${role} — ${deckText}` : deckText;
        if (lvd.level >= lvd.maxLevel) return `${deckText} — MAX LV`;
        const duplicateCost = getCardDuplicateCost(lvd);
        return getCardDuplicateCount(lvd) >= duplicateCost
            ? `${deckText} — 次Lv: 同名カード${duplicateCost}枚`
            : `${deckText} — 次Lvには同名カード${duplicateCost}枚が必要`;
    }
    if (canonicalCategory === 'TarotMinor') {
        const lvd = cardLevelMap[item?.itemId];
        if (lvd && lvd.level >= lvd.maxLevel) return 'MAX LV';
        if (lvd) {
            const duplicateCost = getCardDuplicateCost(lvd);
            return getCardDuplicateCount(lvd) >= duplicateCost
                ? `次Lv: 同名カード${duplicateCost}枚`
                : `次Lvには同名カード${duplicateCost}枚が必要`;
        }
        if (isCardInTarotDeck(item?.itemId)) return 'タロットデッキにセット中';
        return 'デッキに追加できます';
    }
    if (canonicalCategory === 'Consumable') {
        if (isTroyMenuConsumableItem(item)) return 'TROYの会計で受け取ったメニューです。';
        return String(item?.description || '').trim() || '使うと効果を発揮します。';
    }
    if (canonicalCategory === 'Offhand') {
        return '杖と組み合わせると術が伸びます。';
    }
    return '';
}

function createInventoryBadge(label, tone = '') {
    const badge = document.createElement('span');
    badge.className = `inventory-item-badge${tone ? ` is-${tone}` : ''}`;
    badge.textContent = label;
    return badge;
}

function createInventoryChip(label, tone = '') {
    const chip = document.createElement('span');
    chip.className = `inventory-item-chip${tone ? ` is-${tone}` : ''}`;
    chip.textContent = label;
    return chip;
}

function isTroyMenuConsumableItem(item) {
    const cd = item?.customData || {};
    return cd.TroyMenuConsumable === true
        || String(cd.TroyMenuConsumable || cd.IsTroyMenuConsumable || '').trim().toLowerCase() === 'true'
        || String(cd.FriendlyId || item?.itemId || '').trim().toLowerCase().startsWith('troy_menu_');
}

function getInventoryStandaloneImagePath(item) {
    const cd = item?.customData || {};
    return String(cd.image_path || cd.ImagePath || cd.MenuImagePath || cd.iconImage || '').trim();
}

function getInventoryRarityTone(item) {
    const cd = item?.customData || {};
    const category = getCanonicalTarotCategory(cd.Category);
    if (category === 'TarotMajor') return 'red';
    if (['Weapon', 'Armor', 'Shield'].includes(category)) {
        const equipmentRarity = String(item?.enhancement?.rarity || '').trim().toLowerCase();
        if (equipmentRarity === 'legendary') return 'red';
        if (equipmentRarity === 'epic') return 'purple';
        if (equipmentRarity === 'rare') return 'blue';
        if (equipmentRarity === 'common') return 'green';
    }

    const score = Math.max(
        getInventoryStatValue(cd, 'Power'),
        getInventoryStatValue(cd, 'Defense'),
        getInventoryStatValue(cd, 'MagicPower'),
        getInventoryStatValue(cd, 'HealPower')
    );
    if (score > 0) {
        if (category === 'TarotMinor') {
            if (score >= 15) return 'purple';
            if (score >= 8) return 'blue';
            return 'green';
        }
        if (score >= 60) return 'red';
        if (score >= 35) return 'purple';
        if (score >= 18) return 'blue';
        return 'green';
    }

    const raw = String(cd.Rarity || cd.rarity || cd.Rare || item?.rarity || item?.Rarity || '').trim().toLowerCase();
    if (raw === 'legendary' || raw === 'lgd' || raw === 'red') return 'red';
    if (raw === 'epic' || raw === 'purple') return 'purple';
    if (raw === 'rare' || raw === 'blue') return 'blue';
    return 'green';
}

function getPrimaryInventoryCardStats(item, canonicalCategory) {
    const cd = item?.customData || {};
    const category = canonicalCategory || getCanonicalTarotCategory(cd.Category);
    const pick = (key, tone, ariaLabel) => {
        const value = getInventoryStatValue(cd, key);
        return value ? { value, tone, ariaLabel } : null;
    };

    if (isTarotInventoryCategory(category)) {
        const stats = [];
        const lvd = cardLevelMap[item?.itemId];
        if (lvd?.level) {
            stats.push({ value: `Lv${lvd.level}`, tone: 'level', ariaLabel: 'Level' });
        }
        return stats;
    }

    if (!isInventoryEquipmentCategory(category)) return [];

    if (category === 'Weapon') {
        return [pick('Power', 'power', 'Power')].filter(Boolean);
    }
    if (category === 'Shield' || category === 'Armor') {
        return [pick('Defense', 'defense', category === 'Shield' ? 'Shield performance' : 'Defense')].filter(Boolean);
    }
    if (category === 'Offhand') {
        return [pick('MagicPower', 'magic', 'Magic power') || pick('HealPower', 'heal', 'Heal power')].filter(Boolean);
    }
    if (category === 'Accessory') {
        return [
            pick('Power', 'power', 'Power'),
            pick('Defense', 'defense', 'Defense'),
            pick('Agi', 'agility', 'Agility'),
            pick('Int', 'magic', 'Intelligence'),
            pick('MagicPower', 'magic', 'Magic power'),
            pick('HealPower', 'heal', 'Heal power')
        ]
            .filter(Boolean)
            .sort((left, right) => Number(right.value) - Number(left.value))
            .slice(0, 2);
    }

    return [
        pick('Power', 'power', 'Power'),
        pick('Defense', 'defense', 'Defense'),
        pick('MagicPower', 'magic', 'Magic power'),
        pick('HealPower', 'heal', 'Heal power')
    ].filter(Boolean).slice(0, 2);
}

function createInventoryStatBadges(item, canonicalCategory = '') {
    const stats = getPrimaryInventoryCardStats(item, canonicalCategory);
    const enhancementBonus = isInventoryEquipmentCategory(canonicalCategory)
        ? Math.max(0, Math.floor(Number(item?.enhancement?.bonus) || 0))
        : 0;
    if (!stats.length && enhancementBonus <= 0) return null;
    const rarityTone = getInventoryRarityTone(item);

    const wrap = document.createElement('div');
    wrap.className = 'inventory-item-stat-badges';
    stats.forEach((stat) => {
        const badge = document.createElement('span');
        badge.className = `inventory-item-stat-badge is-${stat.tone} is-${rarityTone}`;
        badge.textContent = String(stat.value);
        if (stat.ariaLabel) {
            badge.setAttribute('aria-label', `${stat.ariaLabel} ${stat.value}`);
        }
        wrap.appendChild(badge);
    });
    if (enhancementBonus > 0) {
        const badge = document.createElement('span');
        badge.className = 'inventory-item-stat-badge is-enhancement';
        badge.textContent = `+${enhancementBonus}`;
        badge.setAttribute('aria-label', `強化 +${enhancementBonus}`);
        wrap.appendChild(badge);
    }
    return wrap;
}

function getEquippedSlotsForItem(item) {
    return Object.entries(myCurrentEquipment || {})
        .filter(([slot]) => slot !== 'MajorArcana')
        .filter(([, equippedValue]) => isEquipmentReferenceMatch(item, equippedValue))
        .map(([slot]) => slot);
}

function getInventoryOwnedCount(item) {
    const count = Number(item?.count ?? 0) || 0;
    if (count > 0) return count;
    if (Array.isArray(item?.instances) && item.instances.length > 0) return item.instances.length;
    return item ? 1 : 0;
}

function isInventoryStackEquipped(itemId, stackId) {
    const safeItemId = String(itemId || '').trim();
    const safeStackId = String(stackId || '').trim();
    if (!safeStackId) return false;
    return Object.values(myCurrentEquipment || {}).some((equippedValue) => {
        const equippedStackId = getEquipmentReferenceStackId(equippedValue);
        if (equippedStackId !== safeStackId) return false;
        const equippedItemId = getEquipmentReferenceItemId(equippedValue);
        return !equippedItemId || equippedItemId === safeItemId;
    });
}

function getPreferredInventoryStackId(item, options = {}) {
    const itemId = String(item?.itemId || '').trim();
    const stackIds = getInventoryStackIds(item);
    if (options.preferEquipped === true) {
        const equipped = stackIds.find((stackId) => isInventoryStackEquipped(itemId, stackId));
        if (equipped) return equipped;
    }
    const available = stackIds.find((stackId) => (
        options.allowEquipped === true || !isInventoryStackEquipped(itemId, stackId)
    ));
    return available || stackIds[0] || '';
}

function getInventoryEntryKey(item) {
    return `${String(item?.itemId || '').trim()}::${String(item?.stackId || '').trim() || 'group'}`;
}

function getInventoryReservedCount(item) {
    const itemId = String(item?.itemId || '').trim();
    if (!itemId) return 0;
    let reserved = Object.entries(myCurrentEquipment || {})
        .filter(([slot]) => slot !== 'MajorArcana')
        .filter(([, equippedValue]) => isEquipmentReferenceMatch(item, equippedValue))
        .length;
    if (isCardInTarotDeck(itemId)) reserved += 1;
    if (isShipMajorArcanaEquipped(itemId)) reserved += 1;
    return reserved;
}

function getInventorySellableCount(item) {
    if (!item?.itemId) return 0;
    return Math.max(0, getInventoryOwnedCount(item) - getInventoryReservedCount(item));
}

function isInventoryItemSellable(item) {
    return getInventorySellableCount(item) > 0;
}

function isInventoryItemEligibleForBulkSellSelect(item) {
    return isInventoryItemSellable(item) && getInventoryReservedCount(item) <= 0;
}

function isTwoHandedWeapon(item) {
    return isTwoHandedInventoryWeapon(item);
}


function getEquipmentSlotForCategory(canonicalCategory) {
    if (canonicalCategory === 'Weapon') return 'RightHand';
    if (canonicalCategory === 'Shield' || canonicalCategory === 'Offhand') return 'LeftHand';
    if (canonicalCategory === 'Armor') return 'Armor';
    if (canonicalCategory === 'Accessory') return 'Accessory';
    return null;
}

function getEquipmentCompareStatPairs(item, currentItem, canonicalCategory) {
    const nextData = item?.customData || {};
    const currentData = currentItem?.customData || {};
    return [
        ['Power', '攻'],
        ['Defense', canonicalCategory === 'Shield' ? '盾' : '防'],
        ['Agi', '速'],
        ['Int', '賢'],
        ['MagicPower', '術'],
        ['HealPower', '回'],
        ['CastRate', '詠'],
        ['MpEfficiency', 'MP'],
        ['StatusRate', '状']
    ]
        .map(([key, label]) => {
            const current = getInventoryStatValue(currentData, key);
            const next = getInventoryStatValue(nextData, key);
            if (!current && !next) return null;
            return { key, label, current, next, delta: next - current };
        })
        .filter(Boolean)
        .slice(0, 5);
}

function getEquipmentSlotLabel(slot) {
    const labels = {
        RightHand: '右手',
        LeftHand: '左手',
        Armor: '頭装備',
        Accessory: 'アクセサリー'
    };
    return labels[slot] || '装備';
}

function appendItemDetailEquipmentComparison(statsEl, item, canonicalCategory, options = {}) {
    const slot = options.slot || getEquipmentSlotForCategory(canonicalCategory);
    if (!slot) return;
    const equippedRef = myCurrentEquipment?.[slot];
    const currentItem = equippedRef ? getInventoryItemByReference(equippedRef) : null;
    const currentRef = currentItem?.instances?.[0] || currentItem?.itemId || '';
    const itemRef = item?.instances?.[0] || item?.itemId || '';
    if (!currentItem || String(currentRef) === String(itemRef)) return;

    const detailLabels = {
        Power: '攻撃比較',
        Defense: canonicalCategory === 'Shield' ? '盾性能比較' : '防御比較',
        Agi: 'すばやさ比較',
        Int: 'かしこさ比較',
        MagicPower: '術補比較',
        HealPower: '回復比較',
        CastRate: '詠唱比較',
        MpEfficiency: 'MP効率比較',
        StatusRate: '状態比較'
    };
    const tones = { Power: 'power', Defense: 'defense', Agi: 'agility', Int: 'magic' };
    getEquipmentCompareStatPairs(item, currentItem, canonicalCategory)
        .filter((stat) => stat.delta !== 0)
        .forEach((stat) => {
            const deltaText = `${stat.delta > 0 ? '+' : ''}${stat.delta}`;
            const label = detailLabels[stat.key] || `${stat.label}比較`;
            appendItemDetailStat(
                statsEl,
                options.prefix ? `${options.prefix}${label}` : label,
                `${stat.current} → ${stat.next} (${deltaText})`,
                tones[stat.key] || ''
            );
        });
}

function appendItemDetailEquipmentComparisons(statsEl, item, canonicalCategory) {
    const canCompareBothHands = (canonicalCategory === 'Shield')
        || (canonicalCategory === 'Weapon' && !isTwoHandedInventoryWeapon(item));
    if (!canCompareBothHands) {
        appendItemDetailEquipmentComparison(statsEl, item, canonicalCategory);
        return;
    }
    ['RightHand', 'LeftHand'].forEach((slot) => {
        appendItemDetailEquipmentComparison(statsEl, item, canonicalCategory, {
            slot,
            prefix: `${getEquipmentSlotLabel(slot)} `
        });
    });
}

function getInventoryQuickAction(item, canonicalCategory) {
    const playFabId = window.myPlayFabId || null;
    if (!playFabId) return null;
    const equippedSlots = getEquippedSlotsForItem(item);
    const itemId = item?.itemId;
    const instanceId = item?.instances?.[0];
    const stackId = getPreferredInventoryStackId(item);

    if (canonicalCategory === 'Weapon') {
        if (isTwoHandedWeapon(item)) {
            if (equippedSlots.includes('RightHand')) {
                return { label: '外す', tone: 'remove', run: () => equipItem(playFabId, null, 'RightHand') };
            }
            return { label: '両手', tone: 'equip', run: () => equipItem(playFabId, itemId, 'RightHand', stackId) };
        }
        if (equippedSlots.includes('RightHand')) {
            return { label: '外す', tone: 'remove', run: () => equipItem(playFabId, null, 'RightHand') };
        }
        if (equippedSlots.includes('LeftHand')) {
            return { label: '外す', tone: 'remove', run: () => equipItem(playFabId, null, 'LeftHand') };
        }
        return { label: '右手', tone: 'equip', run: () => equipItem(playFabId, itemId, 'RightHand', stackId) };
    }
    if (canonicalCategory === 'Shield') {
        if (equippedSlots.includes('RightHand')) {
            return { label: '外す', tone: 'remove', run: () => equipItem(playFabId, null, 'RightHand') };
        }
        if (equippedSlots.includes('LeftHand')) {
            return { label: '外す', tone: 'remove', run: () => equipItem(playFabId, null, 'LeftHand') };
        }
        return { label: '左手', tone: 'equip', run: () => equipItem(playFabId, itemId, 'LeftHand', stackId) };
    }
    if (canonicalCategory === 'Offhand') {
        if (equippedSlots.includes('LeftHand')) {
            return { label: '外す', tone: 'remove', run: () => equipItem(playFabId, null, 'LeftHand') };
        }
        return { label: '左手', tone: 'equip', run: () => equipItem(playFabId, itemId, 'LeftHand', stackId) };
    }
    if (canonicalCategory === 'Armor') {
        if (equippedSlots.includes('Armor')) {
            return { label: '外す', tone: 'remove', run: () => equipItem(playFabId, null, 'Armor') };
        }
        return { label: '装備', tone: 'equip', run: () => equipItem(playFabId, itemId, 'Armor', stackId) };
    }
    if (canonicalCategory === 'Accessory') {
        if (equippedSlots.includes('Accessory')) {
            return { label: '外す', tone: 'remove', run: () => equipItem(playFabId, null, 'Accessory') };
        }
        return { label: '装備', tone: 'equip', run: () => equipItem(playFabId, itemId, 'Accessory', stackId) };
    }
    if (canonicalCategory === 'TarotMajor') {
        if (isShipMajorArcanaEquipped(itemId)) {
            return { label: '守護から外す', tone: 'remove', run: () => unequipShipMajorArcana(playFabId, itemId) };
        }
        return { label: isShipMajorArcanaFull() ? '守護を入替' : '守護に設定', tone: 'equip', run: () => equipShipMajorArcana(playFabId, itemId) };
    }
    if (canonicalCategory === 'TarotMinor') {
        if (isCardInTarotDeck(itemId)) {
            return { label: '外す', tone: 'remove', run: () => unequipTarotCardFromDeck(playFabId, itemId, 'tarot') };
        }
        const levelUpAction = getTarotLevelUpAction(cardLevelMap[itemId], itemId);
        if (levelUpAction?.tone === 'levelup') return levelUpAction;
        if (getCommonTarotDeck().length < 5) {
            return { label: '追加', tone: 'equip', run: () => equipTarotCardToDeck(playFabId, itemId, 'tarot') };
        }
        return null;
    }
    if (canonicalCategory === 'Consumable' && instanceId) {
        return { label: '使う', tone: 'use', run: () => useItem(playFabId, instanceId, itemId) };
    }
    return null;
}

function getInventoryQuickActions(item, canonicalCategory) {
    const playFabId = window.myPlayFabId || null;
    const primary = getInventoryQuickAction(item, canonicalCategory);
    if (!playFabId || (canonicalCategory !== 'TarotMajor' && canonicalCategory !== 'TarotMinor')) {
        return primary ? [primary] : [];
    }

    const itemId = item?.itemId;
    const actions = [];

    if (canonicalCategory === 'TarotMajor') {
        const equipped = isShipMajorArcanaEquipped(itemId);
        actions.push(equipped
            ? { label: '守護から外す', tone: 'remove', run: () => unequipShipMajorArcana(playFabId, itemId) }
            : { label: isShipMajorArcanaFull() ? '守護を入替' : '守護に設定', tone: 'equip', run: () => equipShipMajorArcana(playFabId, itemId) });
        const levelUpAction = getTarotLevelUpAction(cardLevelMap[itemId], itemId);
        if (levelUpAction) actions.push(levelUpAction);
        return actions;
    }

    const inDeck = isCardInTarotDeck(itemId);
    actions.push(inDeck
        ? { label: '外す', tone: 'remove', run: () => unequipTarotCardFromDeck(playFabId, itemId, 'tarot') }
        : { label: '追加', tone: getCommonTarotDeck().length < 5 ? 'equip' : 'disabled', disabled: getCommonTarotDeck().length >= 5, run: () => equipTarotCardToDeck(playFabId, itemId, 'tarot') });

    const levelUpAction = getTarotLevelUpAction(cardLevelMap[itemId], itemId);
    if (levelUpAction) actions.push(levelUpAction);

    return actions;
}

function createInventoryCell(item, requestedCategory) {
    const cd = item?.customData || {};
    const canonicalCategory = getCanonicalTarotCategory(cd.Category);
    const isTarotCard = isTarotInventoryCategory(canonicalCategory);
    const isEquipmentCard = isInventoryEquipmentCategory(canonicalCategory);
    const tarotDeckReplacementTargetItemId = requestedCategory === 'TarotMinor'
        ? getTarotDeckReplacementTargetItemId()
        : '';
    const isTarotDeckReplacementMode = Boolean(tarotDeckReplacementTargetItemId);
    const itemId = String(item?.itemId || '').trim();
    const isTarotDeckReplacementCandidate = isTarotDeckReplacementMode
        && itemId !== tarotDeckReplacementTargetItemId
        && !isCardInTarotDeck(itemId);
    const layout = requestedCategory === 'All'
        ? 'mixed'
        : getInventoryLayout(requestedCategory);
    const cell = document.createElement('div');
    cell.className = `inventory-item-cell inventory-item-cell--${layout}`;
    cell.dataset.layout = layout;
    cell.dataset.category = canonicalCategory || 'Unknown';
    cell.title = item?.name || '不明なアイテム';
    const quickActions = (!isTarotCard && !isEquipmentCard)
        ? getInventoryQuickActions(item, canonicalCategory)
        : [];
    const quickAction = quickActions[0] || null;
    const rarityTone = getInventoryRarityTone(item);
    cell.classList.add(`is-rarity-${rarityTone}`);
    if (isTarotCard) {
        cell.classList.add('is-tarot-card');
        cell.dataset.suit = getDeckCardSuitKey(item, canonicalCategory);
        cell.dataset.deckState = canonicalCategory === 'TarotMajor'
            ? (isShipMajorArcanaEquipped(item?.itemId) ? 'equipped' : (isShipMajorArcanaFull() ? 'full' : 'available'))
            : (isCardInTarotDeck(item?.itemId)
            ? 'equipped'
            : (getCommonTarotDeck().length >= 5 ? 'full' : 'available'));
    }
    if (isTarotDeckReplacementMode) {
        cell.dataset.tarotReplacement = isTarotDeckReplacementCandidate ? 'candidate' : 'unavailable';
        cell.classList.add(isTarotDeckReplacementCandidate ? 'is-tarot-replacement-candidate' : 'is-tarot-replacement-unavailable');
    }
    if (isEquipmentCard) {
        cell.classList.add('is-equipment-card');
        cell.dataset.equipmentState = isInventoryItemEquipped(item) ? 'equipped' : 'available';
    }
    if (quickAction?.tone) {
        cell.classList.add(`has-${quickAction.tone}`);
    }
    if (inventorySellSelectionMode) {
        const sellableCount = getInventorySellableCount(item);
        const isSellSelected = selectedInventorySellItemIds.has(getInventoryEntryKey(item));
        cell.classList.add('is-sell-mode');
        cell.dataset.sellableCount = String(sellableCount);
        if (sellableCount > 0) {
            cell.classList.add('is-sellable');
        } else {
            cell.classList.add('is-not-sellable');
        }
        if (isSellSelected) {
            cell.classList.add('is-sell-selected');
        }
    }
    const isTarotDeckEquipped = canonicalCategory === 'TarotMinor'
        && isCardInTarotDeck(item?.itemId);
    const isShipMajorEquipped = canonicalCategory === 'TarotMajor'
        && isShipMajorArcanaEquipped(item?.itemId);
    const isEquipped = isInventoryItemEquipped(item) || isTarotDeckEquipped || isShipMajorEquipped;
    const isEquipmentEquipped = isEquipped && isInventoryEquipmentCategory(canonicalCategory);
    if (isEquipped) {
        cell.classList.add('is-equipped');
    }
    if (isEquipmentEquipped) {
        cell.classList.add('is-equipment-equipped');
    }
    cell.addEventListener('click', (event) => {
        if (event.target.closest('.inventory-sell-check, .inventory-item-quick-action')) return;
        if (isTarotDeckReplacementMode) {
            if (itemId === tarotDeckReplacementTargetItemId) {
                clearTarotDeckReplacementTarget();
                updateInventoryTabHint(activeInventoryCategory);
                renderInventoryGrid(activeInventoryCategory);
                showInventoryFeedback('カードの入れ替えを中止しました。');
                return;
            }
            if (!isTarotDeckReplacementCandidate) {
                showInventoryFeedback('デッキ中のカードは入れ替え候補にできません。', true);
                return;
            }
            replaceTarotCardInDeck(window.myPlayFabId || null, tarotDeckReplacementTargetItemId, itemId);
            return;
        }
        showItemDetailModal(item);
    });
    if (inventorySellSelectionMode) {
        const sellCheck = document.createElement('button');
        sellCheck.type = 'button';
        sellCheck.className = 'inventory-sell-check';
        sellCheck.textContent = selectedInventorySellItemIds.has(getInventoryEntryKey(item)) ? '✓' : '';
        sellCheck.disabled = !isInventoryItemSellable(item);
        sellCheck.setAttribute('aria-label', `${item?.name || 'アイテム'}を売却選択`);
        sellCheck.setAttribute('aria-pressed', selectedInventorySellItemIds.has(getInventoryEntryKey(item)) ? 'true' : 'false');
        sellCheck.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleInventorySellSelection(item);
        });
        cell.appendChild(sellCheck);
    }

    const head = document.createElement('div');
    head.className = 'inventory-item-head';
    head.appendChild(createInventoryBadge(getInventoryCategoryLabel(canonicalCategory), canonicalCategory.toLowerCase()));

    const headMeta = document.createElement('div');
    headMeta.className = 'inventory-item-head-meta';
    let tarotCountBadge = null;
    const enhancementBonus = Math.max(0, Math.floor(Number(item?.enhancement?.bonus) || 0));
    if (enhancementBonus > 0) {
        cell.classList.add('is-enhanced');
    }
    if (isEquipmentEquipped) {
        headMeta.appendChild(createInventoryBadge('装備中', 'active'));
    }
    if (isTarotDeckEquipped) {
        headMeta.appendChild(createInventoryBadge(`枠${getTarotDeckPosition(item.itemId)}`, 'equipped'));
    }
    if (isShipMajorEquipped) {
        headMeta.appendChild(createInventoryBadge('守護', 'equipped'));
    }
    if ((Number(item?.count || 0) || 0) > 1) {
        if (isTarotCard) {
            tarotCountBadge = createInventoryBadge(`×${item.count}`, 'count');
        } else {
            headMeta.appendChild(createInventoryBadge(`x${item.count}`, 'count'));
        }
    }
    head.appendChild(headMeta);
    cell.appendChild(head);

    const statBadges = createInventoryStatBadges(item, canonicalCategory);
    if (statBadges) {
        cell.classList.add('has-stat-badges');
        if (!isTarotCard) {
            cell.appendChild(statBadges);
        }
    }

    const main = document.createElement('div');
    main.className = 'inventory-item-main';

    const iconFrame = document.createElement('div');
    iconFrame.className = 'inventory-item-icon-frame';
    const iconDiv = document.createElement('div');
    iconDiv.className = 'inventory-item-icon';
    const spriteFrame = getInventorySpriteFrame(item);
    setInventoryIcon(
        iconDiv,
        spriteFrame,
        1,
        spriteFrame.category,
        window.myAvatarBaseInfo?.AvatarColor
    );
    iconFrame.appendChild(iconDiv);
    const tarotNumberBadge = createTarotNumberBadgeForItem(item, canonicalCategory);
    if (tarotNumberBadge) iconFrame.appendChild(tarotNumberBadge);
    if (isTarotCard && statBadges) iconFrame.appendChild(statBadges);
    if (tarotCountBadge) iconFrame.appendChild(tarotCountBadge);
    main.appendChild(iconFrame);

    const copy = document.createElement('div');
    copy.className = 'inventory-item-copy';
    const nameEl = document.createElement('div');
    nameEl.className = 'inventory-item-name';
    nameEl.textContent = item?.name || '不明なアイテム';
    copy.appendChild(nameEl);

    const subtitle = getInventoryCardSubtitle(item, canonicalCategory);
    if (subtitle) {
        const subtitleEl = document.createElement('div');
        subtitleEl.className = 'inventory-item-subtitle';
        subtitleEl.textContent = subtitle;
        copy.appendChild(subtitleEl);
    }

    const chips = getInventoryCardChips(item, canonicalCategory);
    if (chips.length) {
        const chipRow = document.createElement('div');
        chipRow.className = 'inventory-item-chip-row';
        chips.forEach((chipLabel) => chipRow.appendChild(createInventoryChip(chipLabel)));
        copy.appendChild(chipRow);
    }

    const footer = getInventoryCardFooter(item, canonicalCategory);
    if (footer) {
        const footerEl = document.createElement('div');
        footerEl.className = 'inventory-item-footer';
        footerEl.textContent = footer;
        copy.appendChild(footerEl);
    }

    main.appendChild(copy);
    cell.appendChild(main);

    if (!isTarotCard && !isEquipmentCard && quickActions.length) {
        const tail = document.createElement('div');
        tail.className = 'inventory-item-tail';
        if (quickActions.length) {
            const actionWrap = document.createElement('div');
            actionWrap.className = 'inventory-item-actions';
            quickActions.forEach((action) => {
                const actionButton = document.createElement('button');
                actionButton.type = 'button';
                actionButton.className = `inventory-item-quick-action is-${action.tone || 'default'}`;
                actionButton.textContent = action.label;
                actionButton.disabled = !!action.disabled;
                actionButton.addEventListener('click', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (action.disabled) return;
                    await action.run();
                });
                actionWrap.appendChild(actionButton);
            });
            tail.appendChild(actionWrap);
        }
        cell.appendChild(tail);
    }

    const detailTrigger = document.createElement('button');
    detailTrigger.type = 'button';
    detailTrigger.className = 'inventory-item-detail-trigger';
    detailTrigger.setAttribute('aria-label', `${item?.name || 'アイテム'}の詳細を表示`);
    cell.appendChild(detailTrigger);

    return cell;
}

function getEquipActionLabel(slot, defaultLabel) {
    return myCurrentEquipment?.[slot]
        ? `${getEquipmentSlotLabel(slot)}に入替`
        : defaultLabel;
}

export function getMyInventory() {
    return myInventory;
}

export function getMyCurrentEquipment() {
    return myCurrentEquipment;
}

export function getMyTarotBattleDeckSnapshot() {
    return getCommonTarotDeck().map((itemId, slot) => {
        const item = myInventory.find((entry) => String(entry?.itemId || '') === String(itemId));
        const itemData = item?.customData || {};
        const skill = resolveTarotBattleSkill(itemId, itemData) || {};
        return {
            ...skill,
            slot,
            itemId: String(itemId || ''),
            suit: skill.suit || itemData.ArcanaSuit || itemData.Suit || '',
            rank: skill.rank ?? getTarotRankNumber(itemData) ?? null,
            cardLevel: Math.max(1, Number(cardLevelMap[itemId]?.level) || 1),
            skillName: skill.skillName || itemData.DisplayName || item?.name || String(itemId || ''),
            effectCodes: Array.isArray(skill.effectCodes) ? skill.effectCodes : []
        };
    });
}

export function getMyTarotGuardianSnapshot() {
    if (!myTarotGuardian) return null;
    const itemId = String(myTarotGuardian.itemId || '').trim();
    if (!itemId) return null;
    return {
        ...myTarotGuardian,
        itemId,
        cardLevel: Math.max(1, Number(cardLevelMap[itemId]?.level) || Number(myTarotGuardian.cardLevel) || 1)
    };
}

async function loadCurrentEquipment(playFabId, options = {}) {
    const force = options && options.force === true;
    if (equipmentFetchPromise && !force) return equipmentFetchPromise;
    if (equipmentFetchPromise && force) {
        try {
            await equipmentFetchPromise;
        } catch (_error) {
            // Ignore the stale equipment request and continue with a fresh request.
        }
    }
    equipmentFetchPromise = (async () => {
        const data = await fetchEquipment(playFabId, { isSilent: options.isSilent === true });
        if (data?.equipment) {
            myCurrentEquipment = data.equipment;
        }
        equipmentLoaded = true;
        return data;
    })();
    try {
        return await equipmentFetchPromise;
    } finally {
        equipmentFetchPromise = null;
    }
}

function calculateLevelFromExp(expValue) {
    const baseExp = 1500;
    let level = 1;
    let remaining = Math.max(0, Math.floor(Number(expValue) || 0));
    for (let i = 0; i < 10000; i++) {
        const rank = Math.floor(level / 10);
        const needed = baseExp * (2 ** rank);
        if (remaining < needed) {
            return { level, expInto: remaining, expNeeded: needed, rank };
        }
        remaining -= needed;
        level += 1;
    }
    return { level, expInto: 0, expNeeded: baseExp, rank: Math.floor(level / 10) };
}

function normalizeExperienceProgress(progress, expValue) {
    const fallback = calculateLevelFromExp(expValue);
    if (!progress || typeof progress !== 'object') return fallback;
    const level = Math.max(1, Math.floor(Number(progress.level) || fallback.level));
    const expNeeded = Math.max(1, Math.floor(Number(progress.expNeeded) || fallback.expNeeded));
    const expInto = Math.max(0, Math.min(expNeeded, Math.floor(Number(progress.expInto) || fallback.expInto)));
    const rank = Math.max(0, Math.floor(Number(progress.rank) || Math.floor(level / 10)));
    return { level, expInto, expNeeded, rank };
}

function getRankName(level, isKing) {
    if (isKing) return '王';
    if (level >= 51) return '海賊王';
    if (level >= 41) return '提督';
    if (level >= 21) return '船長';
    if (level >= 11) return '航海士';
    return '見習い';
}

function getRankTier(level, isKing) {
    if (isKing) return 'king';
    if (level >= 51) return 'pirate-king';
    if (level >= 41) return 'admiral';
    if (level >= 21) return 'captain';
    if (level >= 11) return 'navigator';
    return 'apprentice';
}

function updateExperienceUI() {
    const rankEl = document.getElementById('homeExpRank');
    const progressEl = document.getElementById('homeExpProgress');
    const neededEl = document.getElementById('homeExpNeeded');
    const fillEl = document.getElementById('homeExpFill');
    if (!rankEl || !progressEl || !neededEl || !fillEl) return;

    const data = myExperienceProgress || calculateLevelFromExp(myExperience);
    const ratio = data.expNeeded > 0 ? Math.min(1, data.expInto / data.expNeeded) : 0;
    const rankName = getRankName(data.level, myIsKing);
    const rankTier = getRankTier(data.level, myIsKing);

    rankEl.textContent = rankName;
    rankEl.closest('.home-exp-rank')?.setAttribute('data-rank-tier', rankTier);
    progressEl.textContent = String(data.expInto);
    neededEl.textContent = String(data.expNeeded);
    fillEl.style.width = `${Math.round(ratio * 100)}%`;
}

export async function getInventory(playFabId, options = {}) {
    const now = Date.now();
    const force = options && options.force === true;
    if (inventoryFetchPromise && !force) return inventoryFetchPromise;
    if (inventoryFetchPromise && force) {
        try {
            await inventoryFetchPromise;
        } catch (_error) {
            // Ignore the stale fetch result and continue with a fresh request.
        }
    }
    if (!force && now - lastInventoryFetchAt < 1500) return;
    inventoryFetchPromise = (async () => {
    document.getElementById('inventoryGrid').innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">（持ち物を読み込んでいます...）</p>';
    const [data, deckData] = await Promise.all([
        fetchInventory(playFabId),
        fetchTarotDecks(playFabId, { isSilent: true }),
        loadTarotBattleSkillCache(),
        TAROT_KINGDOM_ARCANA_EFFECTS_READY
    ]);
    if (data) {
        const contributionValue = data.contribution ?? data.experience ?? 0;
        myInventory = data.inventory;
        myVirtualCurrency = data.virtualCurrency || {};
        blackMarketOriginsByItemId = data.blackMarketOrigins || {};
        blackMarketMyActiveCount = Number(data.blackMarketMyActiveCount ?? blackMarketMyActiveCount) || 0;
        blackMarketMaxActiveListings = Number(data.blackMarketMaxActiveListings ?? blackMarketMaxActiveListings) || 5;
        myExperience = Number(contributionValue || 0);
        myExperienceProgress = normalizeExperienceProgress(data.contributionProgress, myExperience);
        myIsKing = !!data.isKing;
        Player.syncPointsDisplay(Number(myVirtualCurrency?.PS || 0));
        Player.syncSpecialtyDisplay(myVirtualCurrency);
        preloadAvatarBaseSprites(window.myAvatarBaseInfo);
        preloadEquipmentSprites(myCurrentEquipment, myInventory, window.myAvatarBaseInfo?.AvatarColor);
    }
    if (deckData?.ok) {
        applyTarotDeckData(deckData);
    }
    await getEquipment(playFabId, { isSilent: true });
    renderInventoryTabControls();
    updateInventorySortOptions(getActiveInventoryCategory());
    renderInventoryGrid(getActiveInventoryCategory());
    updateExperienceUI();
    renderTarotDeckPanels();
    updateInventoryTabHint(getActiveInventoryCategory());
    switchInventoryPanel(activeInventoryPanel, { preserveScroll: true });
    lastInventoryFetchAt = Date.now();
    })();
    try {
        return await inventoryFetchPromise;
    } finally {
        inventoryFetchPromise = null;
    }
}

export async function refreshResourceSummary(playFabId, options = {}) {
    const now = Date.now();
    const force = options && options.force === true;
    if (!force && now - lastInventoryFetchAt < 1500 && equipmentLoaded) {
        updateExperienceUI();
        renderTarotDeckPanels();
        return;
    }
    const shouldLoadEquipment = force || !equipmentLoaded;
    const equipmentRequest = shouldLoadEquipment
        ? loadCurrentEquipment(playFabId, { isSilent: true, force }).catch((error) => {
            console.warn('[inventory] equipment summary refresh failed:', error);
            return null;
        })
        : Promise.resolve(null);
    const [data, deckData] = await Promise.all([
        fetchInventory(playFabId),
        fetchTarotDecks(playFabId, { isSilent: true }),
        equipmentRequest,
        loadTarotBattleSkillCache()
    ]);
    if (data) {
        const contributionValue = data.contribution ?? data.experience ?? 0;
        if (Array.isArray(data.inventory)) {
            myInventory = data.inventory;
        }
        myVirtualCurrency = data.virtualCurrency || {};
        blackMarketOriginsByItemId = data.blackMarketOrigins || {};
        blackMarketMyActiveCount = Number(data.blackMarketMyActiveCount ?? blackMarketMyActiveCount) || 0;
        blackMarketMaxActiveListings = Number(data.blackMarketMaxActiveListings ?? blackMarketMaxActiveListings) || 5;
        myExperience = Number(contributionValue || 0);
        myExperienceProgress = normalizeExperienceProgress(data.contributionProgress, myExperience);
        myIsKing = !!data.isKing;
        Player.syncPointsDisplay(Number(myVirtualCurrency?.PS || 0));
        Player.syncSpecialtyDisplay(myVirtualCurrency);
        preloadAvatarBaseSprites(window.myAvatarBaseInfo);
        preloadEquipmentSprites(myCurrentEquipment, myInventory, window.myAvatarBaseInfo?.AvatarColor);
        renderInventoryTabControls();
        updateInventorySortOptions(getActiveInventoryCategory());
        renderInventoryGrid(getActiveInventoryCategory());
        updateExperienceUI();
        if (Array.isArray(data.inventory)) {
            renderAvatar('avatar', window.myAvatarBaseInfo, myCurrentEquipment, myInventory, false);
            renderAvatar('home-avatar', window.myAvatarBaseInfo, myCurrentEquipment, myInventory, false);
            updateEquipmentBonusDisplay();
        }
        lastInventoryFetchAt = Date.now();
    }
    if (deckData?.ok) {
        applyTarotDeckData(deckData);
        renderTarotDeckPanels();
    }
    renderTarotDeckPanels();
}

export async function getEquipment(playFabId, options = {}) {
    await loadCurrentEquipment(playFabId, options);
    updateEquipmentAndAvatarDisplay();
}

function isEquipmentReferenceForItem(ref, itemId, stackId = '') {
    if (!ref || getEquipmentReferenceItemId(ref) !== String(itemId || '').trim()) return false;
    const referenceStackId = getEquipmentReferenceStackId(ref);
    const requestedStackId = String(stackId || '').trim();
    return !requestedStackId || !referenceStackId || referenceStackId === requestedStackId;
}

async function confirmEquipmentMutation(itemId, slot, stackId, fromSlot = '') {
    if (!itemId || !['RightHand', 'LeftHand'].includes(slot)) return true;

    const candidate = getInventoryItemByReference({ itemId, stackId });
    const candidateName = candidate?.name || String(itemId || '装備');
    const targetRef = myCurrentEquipment?.[slot] || null;
    let displacedSlot = '';
    let displacedRef = null;

    if (fromSlot) {
        if (targetRef && !isEquipmentReferenceForItem(targetRef, itemId, stackId)) {
            displacedSlot = slot;
            displacedRef = targetRef;
        }
    } else if (slot === 'RightHand' && isTwoHandedInventoryWeapon(candidate) && myCurrentEquipment?.LeftHand) {
        displacedSlot = 'LeftHand';
        displacedRef = myCurrentEquipment.LeftHand;
    } else if (slot === 'LeftHand') {
        const rightHandItem = getInventoryItemByReference(myCurrentEquipment?.RightHand);
        if (rightHandItem && isTwoHandedInventoryWeapon(rightHandItem)) {
            displacedSlot = 'RightHand';
            displacedRef = myCurrentEquipment.RightHand;
        }
    }

    if (!displacedRef) return true;

    const displacedItem = getInventoryItemByReference(displacedRef);
    const displacedName = displacedItem?.name || getEquipmentReferenceItemId(displacedRef) || '現在の装備';
    const actionText = fromSlot
        ? `「${displacedName}」を${getEquipmentSlotLabel(displacedSlot)}から外し、「${candidateName}」を${getEquipmentSlotLabel(slot)}へ移動しますか？`
        : `「${displacedName}」を${getEquipmentSlotLabel(displacedSlot)}から外し、「${candidateName}」を${getEquipmentSlotLabel(slot)}に装備しますか？`;
    const result = await showInventoryActionDialog({
        title: '装備を入れ替え',
        message: actionText,
        confirmLabel: '入れ替える'
    });
    return result.confirmed === true;
}

function disableItemDetailActions() {
    const states = [];
    document.querySelectorAll('#itemDetailButtons .item-detail-action').forEach((button) => {
        states.push({ button, disabled: button.disabled });
        button.disabled = true;
    });
    return states;
}

function restoreItemDetailActions(states) {
    states.forEach(({ button, disabled }) => {
        if (button.isConnected) button.disabled = disabled;
    });
}

function refreshOpenItemDetail(itemId, stackId = '', detailEntryKey = '') {
    const modal = document.getElementById('itemDetailModal');
    if (!modal || modal.style.display === 'none' || modal.hidden) return;
    const refreshedItem = (detailEntryKey
        ? getDisplayInventoryEntries().find((entry) => getInventoryEntryKey(entry) === detailEntryKey)
        : null)
        || getInventoryItemByReference({ itemId, stackId });
    if (refreshedItem) {
        showItemDetailModal(refreshedItem);
    } else {
        closeItemDetailModal();
    }
}

export async function equipItem(playFabId, itemId, slot, stackId = '', options = {}) {
    if (!playFabId || equipmentMutationInFlight) return null;
    const fromSlot = String(options.fromSlot || '').trim();
    if (itemId && !(await confirmEquipmentMutation(itemId, slot, stackId, fromSlot))) return null;

    const modal = document.getElementById('itemDetailModal');
    const detailEntryKey = String(modal?.dataset?.detailEntryKey || '');
    const actionStates = disableItemDetailActions();
    equipmentMutationInFlight = true;
    try {
        const data = await requestEquipItem(playFabId, itemId, slot, { stackId, fromSlot });
        if (data !== null) {
            await getInventory(playFabId, { force: true });
            refreshOpenItemDetail(itemId, stackId, detailEntryKey);
        }
        return data;
    } finally {
        equipmentMutationInFlight = false;
        restoreItemDetailActions(actionStates);
    }
}

export async function equipTarotCardToDeck(playFabId, itemId, deckType) {
    const deckLabel = 'タロットデッキ';
    const data = await runTarotLoadoutMutation(
        () => requestEquipTarotCard(playFabId, itemId, 'tarot'),
        'タロットデッキに追加できませんでした。'
    );
    if (data?.ok) {
        applyTarotDeckData(data);
        renderTarotDeckPanels();
        renderInventoryGrid(activeInventoryCategory);
        updateEquipmentBonusDisplay();
        closeItemDetailModal();
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage(`${deckLabel}に追加した。`);
        }
    }
}

export async function unequipTarotCardFromDeck(playFabId, itemId, deckType) {
    const deckLabel = 'タロットデッキ';
    const data = await runTarotLoadoutMutation(
        () => requestUnequipTarotCard(playFabId, itemId, 'tarot'),
        'タロットデッキから外せませんでした。'
    );
    if (data?.ok) {
        applyTarotDeckData(data);
        renderTarotDeckPanels();
        renderInventoryGrid(activeInventoryCategory);
        updateEquipmentBonusDisplay();
        closeItemDetailModal();
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage(`${deckLabel}から外した。`);
        }
    }
}

async function replaceTarotCardInDeck(playFabId, replacedCardItemId, itemId) {
    const data = await runTarotLoadoutMutation(
        () => requestReplaceTarotCard(playFabId, replacedCardItemId, itemId),
        'タロットデッキを入れ替えられませんでした。'
    );
    if (data?.ok) {
        applyTarotDeckData(data);
        clearTarotDeckReplacementTarget();
        selectedTarotLoadoutItemId = String(itemId || '').trim();
        renderTarotDeckPanels();
        updateInventoryTabHint(activeInventoryCategory);
        renderInventoryGrid(activeInventoryCategory);
        updateEquipmentBonusDisplay();
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('タロットデッキを入れ替えた。');
        }
    }
}

async function refreshShipMajorArcanaState(playFabId) {
    const deckData = await fetchTarotDecks(playFabId).catch(() => null);
    if (deckData?.ok) applyTarotDeckData(deckData);
    renderTarotDeckPanels();
    renderInventoryGrid(activeInventoryCategory);
}

export async function equipShipMajorArcana(playFabId, itemId, slotIndex = null) {
    const expectedGuardianItemId = String(myTarotGuardian?.itemId || '').trim();
    if (expectedGuardianItemId && expectedGuardianItemId !== String(itemId || '').trim()) {
        const result = await showInventoryActionDialog({
            title: '守護アルカナを入れ替え',
            message: '現在の守護アルカナをこのカードに入れ替えますか？',
            confirmLabel: '入れ替える'
        });
        if (!result.confirmed) return;
    }
    const data = await runTarotLoadoutMutation(
        () => requestEquipTarotGuardian(playFabId, itemId, expectedGuardianItemId),
        '守護アルカナを装備できませんでした。'
    );
    if (!data) {
        await refreshShipMajorArcanaState(playFabId);
        return;
    }
    if (data?.ok) {
        applyTarotDeckData(data);
        renderTarotDeckPanels();
        renderInventoryGrid(activeInventoryCategory);
        updateEquipmentBonusDisplay();
        closeItemDetailModal();
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('守護アルカナを装備した。');
        }
    }
}

export async function unequipShipMajorArcana(playFabId, itemId, slotIndex = null) {
    const expectedGuardianItemId = String(itemId || myTarotGuardian?.itemId || '').trim();
    if (!expectedGuardianItemId || !isShipMajorArcanaEquipped(expectedGuardianItemId)) {
        showInventoryFeedback('守護アルカナの状態が更新されました。もう一度確認してください。', true);
        await refreshShipMajorArcanaState(playFabId);
        return;
    }
    const result = await showInventoryActionDialog({
        title: '守護アルカナを外す',
        message: '守護アルカナを外しますか？',
        confirmLabel: '外す'
    });
    if (!result.confirmed) return;
    const data = await runTarotLoadoutMutation(
        () => requestUnequipTarotGuardian(playFabId, expectedGuardianItemId),
        '守護アルカナを外せませんでした。'
    );
    if (!data) {
        await refreshShipMajorArcanaState(playFabId);
        return;
    }
    if (data?.ok) {
        applyTarotDeckData(data);
        renderTarotDeckPanels();
        renderInventoryGrid(activeInventoryCategory);
        updateEquipmentBonusDisplay();
        closeItemDetailModal();
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('守護アルカナを外した。');
        }
    }
}

export async function moveShipMajorArcana(playFabId, itemId, direction) {
    await refreshShipMajorArcanaState(playFabId);
}

export async function useItem(playFabId, itemInstanceId, itemId) {
    const data = await requestUseItem(playFabId, itemInstanceId, itemId);
    if (data) {
        document.getElementById('pointMessage').innerText = data.message;
        await getInventory(playFabId, { force: true });
        await Player.getPlayerStats(playFabId);
        // アイテム詳細モーダルを閉じる
        const modal = document.getElementById('itemDetailModal');
        if (modal) {
            closeItemDetailModal();
        }
    }
}

export async function sellItem(playFabId, itemInstanceId, itemId) {
    const data = await requestSellItem(playFabId, itemInstanceId, itemId);
    if (data) {
        await getInventory(playFabId, { force: true });
        await Player.getPoints(playFabId);
        document.getElementById('pointMessage').innerText = data.message || '';
    }
}

export async function sellSelectedInventoryItems() {
    const playFabId = window.myPlayFabId || null;
    if (!playFabId) return;
    const selectedEntries = getSelectedInventorySellEntries();
    const selectedCount = selectedEntries.reduce((sum, entry) => sum + entry.amount, 0);
    if (selectedCount <= 0) {
        showInventoryFeedback('売却するアイテムを選んでください。', true);
        return;
    }
    const confirmed = await showInventoryActionDialog({
        title: 'まとめて売却',
        message: `${selectedCount}個を${selectedCount}Gで売却しますか？`,
        confirmLabel: '売却'
    });
    if (!confirmed.confirmed) return;

    const payload = selectedEntries.map((entry) => ({
        itemId: entry.item.itemId,
        stackId: String(entry.item.stackId || '').trim() || undefined,
        amount: entry.amount
    }));
    const data = await requestSellItems(playFabId, payload);
    if (data) {
        selectedInventorySellItemIds.clear();
        await getInventory(playFabId, { force: true });
        await Player.getPoints(playFabId);
        document.getElementById('pointMessage').innerText = data.message || '';
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage(data.message || `${selectedCount}個を売却した。`);
        }
    }
}

async function refreshInventoryAfterBlackMarketAction(message = '') {
    const playFabId = window.myPlayFabId || null;
    if (!playFabId) return;
    await getInventory(playFabId, { force: true });
    await Player.getPoints(playFabId);
    if (blackMarketVisible) {
        await loadBlackMarketListings({ force: true, isSilent: true });
    }
    if (message) {
        showInventoryFeedback(message);
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage(message);
        }
    }
}

async function showBlackMarketListingPrompt(item) {
    const playFabId = window.myPlayFabId || null;
    if (!playFabId || !item?.itemId) return;
    if (getInventorySellableCount(item) <= 0) {
        showInventoryFeedback('このアイテムは出品できません。', true);
        return;
    }
    if (blackMarketMyActiveCount >= blackMarketMaxActiveListings) {
        showInventoryFeedback(`闇市に出せるのは${blackMarketMaxActiveListings}個までです。`, true);
        return;
    }
    const result = await showInventoryActionDialog({
        title: '闇市に出品',
        message: `${item.name || 'アイテム'}の価格を1-9999Gの整数で入力してください。`,
        input: true,
        inputLabel: '価格',
        defaultValue: '1',
        min: 1,
        max: 9999,
        confirmLabel: '出品',
        validate: (value) => (normalizeBlackMarketPrice(value) ? '' : '価格は1-9999Gの整数で入力してください。')
    });
    if (!result.confirmed) return;
    const price = normalizeBlackMarketPrice(result.value);
    if (!price) {
        showInventoryFeedback('価格は1-9999Gの整数で入力してください。', true);
        return;
    }
    const stackId = getPreferredInventoryStackId(item);
    if (!stackId) {
        showInventoryFeedback('出品する個体を特定できません。再読み込みしてください。', true);
        return;
    }
    blackMarketCreatingItemId = getInventoryEntryKey(item);
    try {
        const data = await requestCreateBlackMarketListing(playFabId, item.itemId, stackId, price);
        blackMarketVisible = true;
        closeItemDetailModal();
        await refreshInventoryAfterBlackMarketAction(data?.message || '闇市に出品しました。');
    } finally {
        blackMarketCreatingItemId = '';
    }
}

async function cancelBlackMarketListing(listingId) {
    const playFabId = window.myPlayFabId || null;
    if (!playFabId || !listingId) return;
    const result = await showInventoryActionDialog({
        title: '出品取り消し',
        message: 'この出品を取り消しますか？',
        confirmLabel: '取り消す'
    });
    if (!result.confirmed) return;
    blackMarketPendingListingId = String(listingId);
    renderBlackMarketPanel();
    try {
        const data = await requestCancelBlackMarketListing(playFabId, listingId);
        await refreshInventoryAfterBlackMarketAction(data?.message || '出品を取り消しました。');
    } finally {
        blackMarketPendingListingId = '';
        renderBlackMarketPanel();
    }
}

async function buyBlackMarketListing(listingId, price) {
    const playFabId = window.myPlayFabId || null;
    if (!playFabId || !listingId) return;
    const result = await showInventoryActionDialog({
        title: '闇市で購入',
        message: `${price}Gで購入しますか？`,
        confirmLabel: '購入'
    });
    if (!result.confirmed) return;
    blackMarketPendingListingId = String(listingId);
    renderBlackMarketPanel();
    try {
        const data = await requestBuyBlackMarketListing(playFabId, listingId);
        await refreshInventoryAfterBlackMarketAction(data?.message || '闇市で購入しました。');
    } finally {
        blackMarketPendingListingId = '';
        renderBlackMarketPanel();
    }
}

export function switchInventoryTab(category) {
    activeInventoryCategory = category || 'All';
    if (activeInventoryCategory !== 'TarotMinor') clearTarotDeckReplacementTarget();
    activeInventoryGroup = getInventoryGroupForCategory(activeInventoryCategory);
    switchInventoryPanel(activeInventoryGroup === 'Tarot' ? 'tarot' : 'items', { preserveScroll: true });
    renderInventoryTabControls();
    updateInventorySortOptions(activeInventoryCategory);
    updateInventoryTabHint(activeInventoryCategory);
    renderInventoryGrid(activeInventoryCategory);
}

export function switchInventoryGroup(group, options = {}) {
    activeInventoryGroup = INVENTORY_GROUPS[group] ? group : 'All';
    const currentGroup = getInventoryGroupForCategory(activeInventoryCategory);
    if (currentGroup !== activeInventoryGroup) {
        activeInventoryCategory = getDefaultInventoryCategory(activeInventoryGroup);
    }
    if (activeInventoryCategory !== 'TarotMinor') clearTarotDeckReplacementTarget();
    const targetPanel = options.panel || (activeInventoryGroup === 'Tarot' ? 'tarot' : 'items');
    switchInventoryPanel(targetPanel, { preserveScroll: true });
    renderInventoryTabControls();
    updateInventorySortOptions(activeInventoryCategory);
    updateInventoryTabHint(activeInventoryCategory);
    renderInventoryGrid(activeInventoryCategory);
    if (targetPanel === 'tarot') {
        renderTarotDeckPanels();
    }
    if (group === 'Tarot' || group === 'All') {
        loadCardLevels().then(() => renderInventoryGrid(activeInventoryCategory));
    }
}

export function renderInventoryGrid(category) {
    const gridEl = document.getElementById('inventoryGrid');
    const layout = getInventoryLayout(category);

    gridEl.innerHTML = '';
    gridEl.dataset.layout = layout;
    gridEl.dataset.category = category || 'All';
    const tarotDeckReplacementTargetItemId = category === 'TarotMinor'
        ? getTarotDeckReplacementTargetItemId()
        : '';
    if (tarotDeckReplacementTargetItemId) {
        gridEl.dataset.tarotReplacementTarget = tarotDeckReplacementTargetItemId;
    } else {
        delete gridEl.dataset.tarotReplacementTarget;
    }
    updateInventorySortOptions(category);
    syncInventorySearchControls();

    const displayInventory = getDisplayInventoryEntries();
    const categoryItems = (category === 'All')
        ? displayInventory
        : displayInventory.filter(item => matchesInventoryDisplayCategory(item.customData?.Category, category));
    const filtered = categoryItems.filter(matchesInventorySearch);
    renderInventoryListSummary(category, filtered);

    const sortOrder = document.getElementById('inventorySort').value;
    const sorted = [...filtered].sort((a, b) => {
        if (sortOrder === 'power_desc') {
            const diff = getInventoryStatValue(b.customData, 'Power') - getInventoryStatValue(a.customData, 'Power');
            if (diff !== 0) return diff;
            return compareInventoryItemsDefault(a, b, category);
        }
        if (sortOrder === 'defense_desc') {
            const diff = (b.customData?.Defense || 0) - (a.customData?.Defense || 0);
            if (diff !== 0) return diff;
            return compareInventoryItemsDefault(a, b, category);
        }
        if (sortOrder === 'magic_desc') {
            const diff = (b.customData?.MagicPower || 0) - (a.customData?.MagicPower || 0);
            if (diff !== 0) return diff;
            return compareInventoryItemsDefault(a, b, category);
        }
        if (sortOrder === 'heal_desc') {
            const diff = (b.customData?.HealPower || 0) - (a.customData?.HealPower || 0);
            if (diff !== 0) return diff;
            return compareInventoryItemsDefault(a, b, category);
        }
        if (sortOrder === 'count_desc') {
            const diff = (Number(b.count || 0) || 0) - (Number(a.count || 0) || 0);
            if (diff !== 0) return diff;
            return compareInventoryItemsDefault(a, b, category);
        }
        const leftCategory = getCanonicalTarotCategory(a.customData?.Category);
        const rightCategory = getCanonicalTarotCategory(b.customData?.Category);
        if ((leftCategory === 'TarotMajor' && rightCategory === 'TarotMajor')
            || (leftCategory === 'TarotMinor' && rightCategory === 'TarotMinor')) {
            return compareTarotItems(a, b);
        }
        return compareInventoryItemsDefault(a, b, category);
    });
    visibleInventoryDetailItems = sorted;
    renderInventorySellControls(sorted);
    renderBlackMarketPanel();

    if (sorted.length === 0) {
        gridEl.innerHTML = `<p style="grid-column: 1 / -1; text-align: center;">${getEmptyInventoryMessage(category)}</p>`;
        syncInventoryStickyMetrics();
        return;
    }

    sorted.forEach(item => {
        gridEl.appendChild(createInventoryCell(item, category));
    });
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => syncInventoryStickyMetrics());
    } else {
        syncInventoryStickyMetrics();
    }
}

function setSpriteIcon(element, imageUrl, spriteIndex, spriteWidth = 32, spriteHeight = 32, scale = 1, itemCategory = null, avatarColor = null) {
    if (!element || !imageUrl || spriteIndex < 0) {
        if (element) {
            element.style.backgroundImage = 'none';
            element.style.width = '';
            element.style.height = '';
            element.style.backgroundSize = '';
            element.style.backgroundPosition = '';
            element.style.backgroundRepeat = '';
        }
        return;
    }

    const resolvedPath = resolveSpritePathByAvatarColor(imageUrl, itemCategory, avatarColor);
    const candidates = (resolvedPath && resolvedPath !== imageUrl) ? [resolvedPath, imageUrl] : [imageUrl];
    const normalizedSize = normalizeInventorySpriteFrame(imageUrl, spriteWidth, spriteHeight, { sprite_path: imageUrl });
    spriteWidth = normalizedSize.width;
    spriteHeight = normalizedSize.height;

    const tryLoad = (index) => {
        if (index >= candidates.length) {
            element.style.backgroundImage = 'none';
            return;
        }
        const currentPath = candidates[index];
        const img = new Image();
        img.onload = () => {
            element.style.backgroundImage = `url('${currentPath}')`;
            element.style.width = `${spriteWidth * scale}px`;
            element.style.height = `${spriteHeight * scale}px`;
            element.style.backgroundSize = `${img.width * scale}px ${img.height * scale}px`;
            element.style.backgroundRepeat = 'no-repeat';
            element.style.display = 'block';
            element.style.flex = '0 0 auto';
            element.style.margin = '0 auto';
            element.style.imageRendering = 'pixelated';

            const sheetColumns = Math.max(1, Math.floor(img.width / spriteWidth));
            const col = spriteIndex % sheetColumns;
            const row = Math.floor(spriteIndex / sheetColumns);
            const posX = -(col * spriteWidth * scale);
            const posY = -(row * spriteHeight * scale);
            element.style.backgroundPosition = `${posX}px ${posY}px`;
        };
        img.onerror = () => {
            tryLoad(index + 1);
        };
        img.src = currentPath;
    };

    tryLoad(0);
}

function setInventoryIcon(element, spriteFrame, scale = 1, itemCategory = null, avatarColor = null) {
    if (!element) return;
    element.replaceChildren();
    element.classList.toggle('is-image-icon', !!spriteFrame?.imagePath);
    if (spriteFrame?.imagePath) {
        element.style.backgroundImage = 'none';
        element.style.width = '';
        element.style.height = '';
        element.style.backgroundSize = '';
        element.style.backgroundPosition = '';
        element.style.backgroundRepeat = '';
        element.style.display = '';
        element.style.flex = '';
        element.style.margin = '';
        element.style.imageRendering = 'auto';
        const img = document.createElement('img');
        img.src = spriteFrame.imagePath;
        img.alt = '';
        img.loading = 'lazy';
        element.appendChild(img);
        return;
    }
    setSpriteIcon(
        element,
        spriteFrame?.path,
        Number(spriteFrame?.index || 0) || 0,
        Number(spriteFrame?.width || 32) || 32,
        Number(spriteFrame?.height || 32) || 32,
        scale,
        itemCategory,
        avatarColor
    );
}

function getInventorySpriteFrame(item) {
    const cd = item?.customData || {};
    const canonicalCategory = getCanonicalTarotCategory(cd.Category);
    if (canonicalCategory === 'TarotMajor' || canonicalCategory === 'TarotMinor') {
        const tarotFrame = getTarotSpriteFrame(item);
        if (tarotFrame?.path) {
            return {
                path: tarotFrame.path,
                index: Number(tarotFrame.index || 0) || 0,
                width: Number(tarotFrame.width || 48) || 48,
                height: Number(tarotFrame.height || 80) || 80,
                category: cd.Category
            };
        }
    }
    const standaloneImagePath = getInventoryStandaloneImagePath(item);
    if (standaloneImagePath) {
        return {
            path: standaloneImagePath,
            imagePath: standaloneImagePath,
            index: 0,
            width: 64,
            height: 64,
            category: cd.Category
        };
    }
    const frameSize = normalizeInventorySpriteFrame(
        cd.sprite_path,
        parseInt(cd.sprite_w, 10) || 32,
        parseInt(cd.sprite_h, 10) || 32,
        item
    );
    return {
        path: frameSize.path || cd.sprite_path,
        index: parseInt(cd.sprite_index, 10) || 0,
        width: frameSize.width,
        height: frameSize.height,
        category: cd.Category
    };
}

function createItemDetailMetaChip(label, tone = '') {
    const chip = document.createElement('span');
    chip.className = `item-detail-meta-chip${tone ? ` is-${tone}` : ''}`;
    chip.textContent = label;
    return chip;
}

function createItemDetailStatRow(label, value, tone = '') {
    const row = document.createElement('div');
    row.className = `item-detail-stat-row${tone ? ` is-${tone}` : ''}`;
    const labelEl = document.createElement('span');
    labelEl.className = 'item-detail-stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('strong');
    valueEl.className = 'item-detail-stat-value';
    valueEl.textContent = String(value);
    row.append(labelEl, valueEl);
    return row;
}

function appendItemDetailStat(statsEl, label, value, tone = '') {
    if (value === undefined || value === null || value === '') return;
    statsEl.appendChild(createItemDetailStatRow(label, value, tone));
}

function appendTarotMetaStats(statsEl, itemData) {
    buildTarotCardMeta(itemData).forEach((line) => {
        const parts = String(line || '').split(':');
        if (parts.length > 1) {
            appendItemDetailStat(statsEl, parts.shift().trim(), parts.join(':').trim(), 'tarot');
        } else if (line) {
            appendItemDetailStat(statsEl, 'カード', line, 'tarot');
        }
    });
}

function getTarotDeckPosition(itemId) {
    const deck = getCommonTarotDeck();
    const index = deck.findIndex((entry) => String(entry || '') === String(itemId || ''));
    return index >= 0 ? index + 1 : 0;
}

function getCurrentTarotRoleText() {
    const deckRole = getCommonTarotRole();
    const role = deckRole?.role || deckRole || null;
    if (!role?.key) {
        return {
            roleText: '未成立',
            bonusText: '5枚揃うと役パッシブが発動します。'
        };
    }
    const suitLabel = role.resolvedSuitLabel ? ` (${role.resolvedSuitLabel})` : '';
    const bonusText = String(deckRole?.bonusText || deckRole?.bonus?.bonusText || '').trim()
        || formatTarotRoleBonus(deckRole?.bonus);
    return {
        roleText: `${role.label || role.key}${suitLabel}`,
        bonusText
    };
}

function appendTarotCombatRow(parent, label, value, tone = '') {
    if (value === undefined || value === null || value === '') return;
    const row = document.createElement('div');
    row.className = `item-detail-tarot-row${tone ? ` is-${tone}` : ''}`;
    const labelEl = document.createElement('span');
    labelEl.className = 'item-detail-tarot-row-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('strong');
    valueEl.className = 'item-detail-tarot-row-value';
    valueEl.textContent = String(value);
    row.append(labelEl, valueEl);
    parent.appendChild(row);
}

function removeTarotCombatDetailSection() {
    document.getElementById('itemDetailTarotCombat')?.remove();
}

function renderTarotCombatDetailSection(item, itemData) {
    removeTarotCombatDetailSection();
    const descriptionEl = document.getElementById('itemDetailDescription');
    if (!descriptionEl) return;

    const canonicalCategory = getCanonicalTarotCategory(itemData?.Category);
    if (canonicalCategory === 'TarotMajor') {
        const position = getShipMajorArcanaPosition(item?.itemId);
        const itemId = String(item?.itemId || '');
        const matchedNumber = itemId.match(/(?:major|arcana)[_-]?0*(\d{1,2})/i)?.[1];
        const number = Number(itemData?.ArcanaNumber ?? itemData?.Number ?? matchedNumber);
        const definition = getTarotKingdomGuardianDefinition(number);
        const level = Math.max(1, Number(cardLevelMap[itemId]?.level) || 1);
        const section = document.createElement('section');
        section.id = 'itemDetailTarotCombat';
        section.className = 'item-detail-tarot-combat';

        const title = document.createElement('div');
        title.className = 'item-detail-tarot-combat-title';
        const heading = document.createElement('strong');
        heading.textContent = definition?.passiveName || '守護アルカナ';
        const state = document.createElement('span');
        state.textContent = `Lv${level} · ${position > 0 ? '守護中' : '未装備'}`;
        title.append(heading, state);
        section.appendChild(title);

        const rows = document.createElement('div');
        rows.className = 'item-detail-tarot-rows';
        appendTarotCombatRow(rows, '守護', definition?.passive || '効果データ未登録', 'skill');
        section.appendChild(rows);

        descriptionEl.insertAdjacentElement('afterend', section);
        return;
    }

    const suit = String(itemData?.ArcanaSuit || itemData?.Suit || '');
    const rank = getTarotRankNumber(itemData);
    const resonance = getTarotKingdomMinorApDefinition(suit, rank)
        || getTarotKingdomMinorDefinition(suit, rank);
    const level = Math.max(1, Number(cardLevelMap[item?.itemId]?.level) || 1);
    const deckPosition = getTarotDeckPosition(item?.itemId);
    const section = document.createElement('section');
    section.id = 'itemDetailTarotCombat';
    section.className = 'item-detail-tarot-combat';

    const title = document.createElement('div');
    title.className = 'item-detail-tarot-combat-title';
    const heading = document.createElement('strong');
    heading.textContent = resonance?.name || '小アルカナ共鳴';
    const state = document.createElement('span');
    state.textContent = `Lv${level} · ${deckPosition > 0 ? `枠${deckPosition}` : '未セット'}`;
    title.append(heading, state);
    section.appendChild(title);

    const rows = document.createElement('div');
    rows.className = 'item-detail-tarot-rows';
    appendTarotCombatRow(rows, '効果', resonance ? String(resonance.effect || getTarotKingdomFriendlyEffectText(resonance)) : '効果データ未登録', 'skill');
    if (resonance) {
        appendTarotCombatRow(rows, '消費AP', resonance.apCost === 'all' ? 'すべて' : String(Math.max(0, Number(resonance.apCost) || 0)), 'stat');
    }
    section.appendChild(rows);

    descriptionEl.insertAdjacentElement('afterend', section);
}

function createItemDetailActionButton(label, tone, run, options = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `item-detail-action${tone ? ` is-${tone}` : ''}`;
    button.textContent = label;
    button.disabled = !!options.disabled;
    if (options.ariaLabel) button.setAttribute('aria-label', options.ariaLabel);
    if (options.title) button.title = options.title;
    if (typeof run === 'function') {
        button.addEventListener('click', async () => {
            if (button.disabled) return;
            await run();
        });
    }
    return button;
}

function ensureEquipmentEnhancementModal() {
    let modal = document.getElementById('equipmentEnhancementModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'equipmentEnhancementModal';
    modal.className = 'equipment-enhancement-modal';
    modal.hidden = true;
    modal.innerHTML = `
        <section class="equipment-enhancement-sheet" role="dialog" aria-modal="true" aria-labelledby="equipmentEnhancementTitle">
            <header class="equipment-enhancement-head">
                <h3 id="equipmentEnhancementTitle">装備強化</h3>
                <button type="button" class="equipment-enhancement-close ui-modal-close" aria-label="閉じる" title="閉じる"></button>
            </header>
            <div class="equipment-enhancement-base"></div>
            <div class="equipment-enhancement-result" aria-live="polite"></div>
            <div class="equipment-enhancement-materials"></div>
            <div class="equipment-enhancement-error" aria-live="polite"></div>
            <footer class="equipment-enhancement-actions">
                <button type="button" class="equipment-enhancement-cancel">キャンセル</button>
                <button type="button" class="equipment-enhancement-apply">強化する</button>
            </footer>
        </section>
    `;
    document.body.appendChild(modal);
    return modal;
}

function closeEquipmentEnhancementModal() {
    const modal = document.getElementById('equipmentEnhancementModal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    stopModalViewportTracking(modal);
    if (equipmentEnhancementPreviewTimer) clearTimeout(equipmentEnhancementPreviewTimer);
    equipmentEnhancementPreviewTimer = null;
    equipmentEnhancementRequestSerial += 1;
    if (equipmentEnhancementKeydownHandler) {
        document.removeEventListener('keydown', equipmentEnhancementKeydownHandler, true);
        equipmentEnhancementKeydownHandler = null;
    }
    document.body.classList.remove('modal-lock');
}

function isSameInventoryEntry(left, right) {
    return getInventoryEntryKey(left) === getInventoryEntryKey(right);
}

function getEquipmentEnhancementCandidates(baseItem) {
    const baseEnhancement = baseItem?.enhancement || {};
    return myInventory
        .filter((item) => item?.materialEligible === true)
        .filter((item) => item?.enhancement?.category === baseEnhancement.category)
        .filter((item) => item?.enhancement?.family === baseEnhancement.family)
        .map((item) => {
            const ownedCount = getInventoryOwnedCount(item);
            const reservedCount = getInventoryReservedCount(item);
            const baseReserve = isSameInventoryEntry(item, baseItem) && !isInventoryItemEquipped(baseItem) ? 1 : 0;
            const storedBonus = Math.max(0, Math.floor(Number(item?.enhancement?.storedBonus ?? item?.enhancement?.bonus) || 0));
            const reportedContribution = Math.floor(Number(item?.enhancement?.contribution) || 0);
            return {
                item,
                key: getInventoryEntryKey(item),
                available: Math.max(0, ownedCount - reservedCount - baseReserve),
                contribution: reportedContribution > 0 ? reportedContribution : 1 + storedBonus
            };
        })
        .filter((candidate) => candidate.available > 0)
        .sort((left, right) => {
            const contributionDiff = left.contribution - right.contribution;
            if (contributionDiff !== 0) return contributionDiff;
            return String(left.item?.name || '').localeCompare(String(right.item?.name || ''), 'ja');
        });
}

function buildEquipmentEnhancementMaterialSelections(candidates, selectedByKey, baseItemId, baseStackId) {
    const selections = [];
    for (const candidate of candidates) {
        let remaining = Math.max(0, Math.floor(Number(selectedByKey.get(candidate.key)) || 0));
        if (remaining <= 0) continue;
        const stacks = Array.isArray(candidate.item?.stacks) ? candidate.item.stacks : [];
        for (const stack of stacks) {
            const stackId = String(stack?.stackId || '').trim();
            if (!stackId) continue;
            const stackCount = Math.max(0, Math.floor(Number(stack?.count) || 0));
            const itemId = String(candidate.item?.itemId || '').trim();
            const isBaseStack = itemId === baseItemId && stackId === baseStackId;
            const baseReserve = isBaseStack ? 1 : 0;
            const equippedReserve = isInventoryStackEquipped(itemId, stackId) && !isBaseStack ? stackCount : 0;
            const usable = Math.max(0, stackCount - baseReserve - equippedReserve);
            const amount = Math.min(remaining, usable);
            if (amount > 0) {
                selections.push({ itemId, stackId, amount });
                remaining -= amount;
            }
            if (remaining <= 0) break;
        }
        if (remaining > 0) return [];
    }
    return selections;
}

function createEquipmentEnhancementIcon(item) {
    const frame = document.createElement('div');
    frame.className = 'equipment-enhancement-icon';
    const icon = document.createElement('div');
    const spriteFrame = getInventorySpriteFrame(item);
    setInventoryIcon(icon, spriteFrame, 1, spriteFrame.category, window.myAvatarBaseInfo?.AvatarColor);
    frame.appendChild(icon);
    return frame;
}

function makeEquipmentEnhancementRequestId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `enhance_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function showEquipmentEnhancementModal(baseItem) {
    const playFabId = window.myPlayFabId || null;
    const baseEnhancement = baseItem?.enhancement || {};
    const baseItemId = String(baseItem?.itemId || '').trim();
    const baseStackId = getPreferredInventoryStackId(baseItem, { preferEquipped: true, allowEquipped: true });
    if (!playFabId || !baseItem?.materialEligible || !baseItemId || !baseStackId) {
        showInventoryFeedback('この装備は強化できません。', true);
        return;
    }

    const modal = ensureEquipmentEnhancementModal();
    const baseEl = modal.querySelector('.equipment-enhancement-base');
    const resultEl = modal.querySelector('.equipment-enhancement-result');
    const materialsEl = modal.querySelector('.equipment-enhancement-materials');
    const errorEl = modal.querySelector('.equipment-enhancement-error');
    const closeButton = modal.querySelector('.equipment-enhancement-close');
    const cancelButton = modal.querySelector('.equipment-enhancement-cancel');
    const applyButton = modal.querySelector('.equipment-enhancement-apply');
    const candidates = getEquipmentEnhancementCandidates(baseItem);
    const selectedByKey = new Map();
    let serverPreview = null;
    let previewPending = false;
    let applying = false;

    const statLabel = baseEnhancement.primaryStat === 'Power'
        ? '攻撃力'
        : (getCanonicalTarotCategory(baseEnhancement.category) === 'Shield' ? '盾性能' : '防御力');
    const baseName = document.createElement('div');
    baseName.className = 'equipment-enhancement-base-name';
    baseName.appendChild(createEquipmentEnhancementIcon(baseItem));
    const baseCopy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${baseItem.name}${baseEnhancement.bonus > 0 ? ` +${baseEnhancement.bonus}` : ''}`;
    const stat = document.createElement('span');
    stat.textContent = `${statLabel} ${baseEnhancement.effectiveValue}`;
    baseCopy.append(title, stat);
    baseName.appendChild(baseCopy);
    baseEl.replaceChildren(baseName);

    const getLocalContribution = () => candidates.reduce((total, candidate) => (
        total + ((selectedByKey.get(candidate.key) || 0) * candidate.contribution)
    ), 0);

    const updateResult = () => {
        const contribution = getLocalContribution();
        const target = serverPreview?.targetValue ?? (Number(baseEnhancement.effectiveValue || 0) + contribution);
        resultEl.innerHTML = '';
        const current = document.createElement('span');
        current.textContent = `${statLabel} ${baseEnhancement.effectiveValue}`;
        const arrow = document.createElement('span');
        arrow.className = 'equipment-enhancement-arrow';
        arrow.textContent = '→';
        const next = document.createElement('strong');
        next.textContent = contribution > 0 ? String(target) : '-';
        const bonus = document.createElement('span');
        bonus.className = 'equipment-enhancement-gain';
        bonus.textContent = contribution > 0 ? `+${contribution}` : '素材未選択';
        resultEl.append(current, arrow, next, bonus);
        applyButton.disabled = applying || contribution <= 0;
    };

    const schedulePreview = () => {
        if (equipmentEnhancementPreviewTimer) clearTimeout(equipmentEnhancementPreviewTimer);
        serverPreview = null;
        errorEl.textContent = '';
        const selections = buildEquipmentEnhancementMaterialSelections(candidates, selectedByKey, baseItemId, baseStackId);
        if (!selections.length) {
            previewPending = false;
            updateResult();
            return;
        }
        previewPending = true;
        updateResult();
        const requestSerial = ++equipmentEnhancementRequestSerial;
        equipmentEnhancementPreviewTimer = setTimeout(async () => {
            try {
                const preview = await requestPreviewEquipmentEnhancement(playFabId, baseItemId, baseStackId, selections, {
                    isSilent: true,
                    throwOnError: true
                });
                if (requestSerial !== equipmentEnhancementRequestSerial || modal.hidden) return;
                serverPreview = preview?.ok ? preview : null;
            } catch (error) {
                if (requestSerial !== equipmentEnhancementRequestSerial || modal.hidden) return;
                errorEl.textContent = error?.message || '強化内容を確認できません。';
            } finally {
                if (requestSerial === equipmentEnhancementRequestSerial) {
                    previewPending = false;
                    updateResult();
                }
            }
        }, 180);
    };

    const renderMaterials = () => {
        materialsEl.innerHTML = '';
        const heading = document.createElement('h4');
        heading.textContent = '素材';
        materialsEl.appendChild(heading);
        if (!candidates.length) {
            const empty = document.createElement('p');
            empty.className = 'equipment-enhancement-empty';
            empty.textContent = '使用できる同系統装備がありません。';
            materialsEl.appendChild(empty);
            return;
        }
        const list = document.createElement('div');
        list.className = 'equipment-enhancement-material-list';
        candidates.forEach((candidate) => {
            const row = document.createElement('div');
            row.className = 'equipment-enhancement-material';
            row.appendChild(createEquipmentEnhancementIcon(candidate.item));
            const copy = document.createElement('div');
            copy.className = 'equipment-enhancement-material-copy';
            const name = document.createElement('strong');
            const materialBonus = Math.max(0, Number(candidate.item?.enhancement?.bonus) || 0);
            name.textContent = `${candidate.item.name}${materialBonus > 0 ? ` +${materialBonus}` : ''}`;
            const meta = document.createElement('span');
            const rarity = String(candidate.item?.enhancement?.rarity || 'common').trim().toUpperCase();
            meta.textContent = `所持 ${candidate.available} / ${rarity} / 強化 +${candidate.contribution}`;
            copy.append(name, meta);
            row.appendChild(copy);

            const stepper = document.createElement('div');
            stepper.className = 'equipment-enhancement-stepper';
            const decrease = document.createElement('button');
            decrease.type = 'button';
            decrease.textContent = '−';
            decrease.setAttribute('aria-label', `${candidate.item.name}を減らす`);
            const count = document.createElement('output');
            const selected = Math.max(0, Number(selectedByKey.get(candidate.key)) || 0);
            count.textContent = String(selected);
            const increase = document.createElement('button');
            increase.type = 'button';
            increase.textContent = '+';
            increase.setAttribute('aria-label', `${candidate.item.name}を増やす`);
            const remainingCapacity = 99 - Number(baseEnhancement.effectiveValue || 0) - getLocalContribution();
            decrease.disabled = applying || selected <= 0;
            increase.disabled = applying || selected >= candidate.available || candidate.contribution > remainingCapacity;
            decrease.addEventListener('click', () => {
                selectedByKey.set(candidate.key, Math.max(0, selected - 1));
                serverPreview = null;
                renderMaterials();
                schedulePreview();
            });
            increase.addEventListener('click', () => {
                selectedByKey.set(candidate.key, selected + 1);
                serverPreview = null;
                renderMaterials();
                schedulePreview();
            });
            stepper.append(decrease, count, increase);
            row.appendChild(stepper);
            list.appendChild(row);
        });
        materialsEl.appendChild(list);
    };

    const close = () => closeEquipmentEnhancementModal();
    bindModalClose(closeButton, close, {
        overlay: modal,
        closeOnBackdrop: true,
        icon: true,
        isOpen: () => !modal.hidden && !applying
    });
    bindModalClose(cancelButton, close);
    applyButton.onclick = async () => {
        const selections = buildEquipmentEnhancementMaterialSelections(candidates, selectedByKey, baseItemId, baseStackId);
        if (!selections.length || applying) return;
        applying = true;
        applyButton.textContent = '強化中...';
        renderMaterials();
        updateResult();
        errorEl.textContent = '';
        try {
            const result = await requestApplyEquipmentEnhancement(
                playFabId,
                baseItemId,
                baseStackId,
                selections,
                makeEquipmentEnhancementRequestId(),
                { throwOnError: true }
            );
            close();
            await getInventory(playFabId, { force: true });
            const targetBonus = result?.targetBonus ?? serverPreview?.targetBonus ?? baseEnhancement.bonus;
            const message = `${baseItem.name}を+${targetBonus}に強化しました。`;
            showInventoryFeedback(message);
            if (typeof window.showRpgMessage === 'function') window.showRpgMessage(message);
        } catch (error) {
            applying = false;
            applyButton.textContent = '強化する';
            errorEl.textContent = error?.message || '装備の強化に失敗しました。';
            renderMaterials();
            updateResult();
        }
    };

    closeItemDetailModal();
    modal.hidden = false;
    startModalViewportTracking(modal, 'equipment-enhancement');
    document.body.classList.add('modal-lock');
    equipmentEnhancementKeydownHandler = (event) => {
        if (event.key === 'Escape' && !applying) {
            event.preventDefault();
            close();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(modal.querySelectorAll('button:not(:disabled)')).filter((element) => !element.hidden);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };
    document.addEventListener('keydown', equipmentEnhancementKeydownHandler, true);
    renderMaterials();
    updateResult();
    requestAnimationFrame(() => closeButton.focus());
}

function showItemDetailModal(item) {
    const modal = document.getElementById('itemDetailModal');
    if (!modal || !item) return;
    const wasOpen = modal.style.display === 'flex';
    bindItemDetailNavigation(modal);
    const cd = item.customData || {};
    const instanceId = item.instances?.[0];
    const canonicalCategory = getCanonicalTarotCategory(cd.Category);
    const isTarotCard = isTarotMajorCategory(canonicalCategory) || isTarotMinorCategory(canonicalCategory);
    const isEquipmentItem = isInventoryEquipmentCategory(canonicalCategory);
    const detailKind = isTarotCard ? 'tarot' : (isEquipmentItem ? 'equipment' : 'item');
    const spriteFrame = getInventorySpriteFrame(item);
    const iconEl = document.getElementById('itemDetailIcon');
    const metaEl = document.getElementById('itemDetailMeta');
    const categoryEl = document.getElementById('itemDetailCategory');

    modal.dataset.detailKind = detailKind;
    modal.dataset.detailCategory = canonicalCategory || 'Unknown';
    if (isTarotCard) {
        modal.dataset.tarotSuit = normalizeTarotSuitKeyForBadge(getDeckCardSuitKey(item, canonicalCategory));
    } else {
        delete modal.dataset.tarotSuit;
    }

    setInventoryIcon(
        iconEl,
        spriteFrame,
        isTarotCard ? 1 : 1.2,
        spriteFrame.category,
        window.myAvatarBaseInfo?.AvatarColor
    );
    const enhancementBonus = Math.max(0, Math.floor(Number(item?.enhancement?.bonus) || 0));
    document.getElementById('itemDetailName').innerText = `${item.name}${enhancementBonus > 0 ? ` +${enhancementBonus}` : ''}`;
    if (categoryEl) {
        categoryEl.innerText = isTarotMajorCategory(canonicalCategory)
            ? `大アルカナ · ${getTarotNumberBadge(cd) || '―'}`
            : isTarotMinorCategory(canonicalCategory)
                ? `${getTarotSuitLabel(cd) || '小アルカナ'} · ${getTarotRankLabel(cd) || '―'}`
                : getInventoryCategoryLabel(canonicalCategory);
    }
    document.getElementById('itemDetailDescription').innerText = isTarotCard ? '' : (item.description || '説明がありません。');
    if (isTarotCard) {
        renderTarotCombatDetailSection(item, cd);
    } else {
        removeTarotCombatDetailSection();
    }

    if (metaEl) {
        metaEl.innerHTML = '';
        if (!isTarotCard) {
            metaEl.appendChild(createItemDetailMetaChip(getInventoryCategoryLabel(canonicalCategory), detailKind));
        }
        if (isEquipmentItem && isInventoryItemEquipped(item)) {
            metaEl.appendChild(createItemDetailMetaChip('装備中', 'equipped'));
        }
        if (enhancementBonus > 0) {
            metaEl.appendChild(createItemDetailMetaChip(`強化 +${enhancementBonus}`, 'enhanced'));
        }
        if (isTarotCard) {
            const cardLevel = getInventoryCardLevel(item.itemId);
            metaEl.appendChild(createItemDetailMetaChip(`Lv${cardLevel}`, 'tarot'));
            const levelData = cardLevelMap[item.itemId];
            if (levelData && levelData.level < levelData.maxLevel) {
                metaEl.appendChild(createItemDetailMetaChip(
                    `素材 ${getCardDuplicateCount(levelData)}/${getCardDuplicateCost(levelData)}`,
                    'count'
                ));
            }
            if (isTarotMajorCategory(canonicalCategory)) {
                metaEl.appendChild(createItemDetailMetaChip(isShipMajorArcanaEquipped(item.itemId) ? '守護中' : '未装備', isShipMajorArcanaEquipped(item.itemId) ? 'equipped' : 'muted'));
            } else {
                const deckPosition = getTarotDeckPosition(item.itemId);
                metaEl.appendChild(createItemDetailMetaChip(deckPosition > 0 ? `枠${deckPosition}` : '未セット', deckPosition > 0 ? 'equipped' : 'muted'));
            }
        }
        const count = Number(item?.count || 0) || 0;
        if (count > 1) {
            metaEl.appendChild(createItemDetailMetaChip(`所持 ${count}`, 'count'));
        }
    }

    const statsEl = document.getElementById('itemDetailStats');
    statsEl.innerHTML = '';
    if (!isTarotCard) {
        appendItemDetailStat(statsEl, '攻撃力', cd.Power, 'power');
        appendItemDetailStat(statsEl, canonicalCategory === 'Shield' ? '盾性能' : '防御力', cd.Defense, 'defense');
        appendItemDetailStat(statsEl, 'すばやさ', cd.Agi, 'agility');
        appendItemDetailStat(statsEl, 'かしこさ', cd.Int, 'magic');
        appendItemDetailStat(statsEl, '術補', cd.MagicPower, 'magic');
        appendItemDetailStat(statsEl, '回復補正', cd.HealPower, 'heal');
        appendItemDetailStat(statsEl, '詠唱補正', cd.CastRate);
        appendItemDetailStat(statsEl, 'MP効率', cd.MpEfficiency);
        appendItemDetailStat(statsEl, '状態付与', cd.StatusRate);
        if (enhancementBonus > 0 && item?.enhancement?.primaryStat) {
            const baseStatLabel = item.enhancement.primaryStat === 'Power'
                ? '基本攻撃力'
                : (canonicalCategory === 'Shield' ? '基本盾性能' : '基本防御力');
            appendItemDetailStat(statsEl, baseStatLabel, item.enhancement.baseValue, 'enhancement');
            appendItemDetailStat(statsEl, '強化値', `+${enhancementBonus}`, 'enhancement');
        }
        if (cd.Effect) {
            const effectText = typeof cd.Effect === 'object'
                ? [cd.Effect.Type, cd.Effect.Amount].filter(Boolean).join(' ')
                : String(cd.Effect);
            appendItemDetailStat(statsEl, '効果', effectText);
        }
        appendItemDetailEquipmentComparison(statsEl, item, canonicalCategory);
        appendTarotMetaStats(statsEl, cd);
        const originDisplay = getBlackMarketOriginDisplay(item.itemId);
        if (originDisplay) {
            appendItemDetailStat(statsEl, '初代所有者', originDisplay, 'origin');
        }
        if (!statsEl.children.length) {
            const empty = document.createElement('div');
            empty.className = 'item-detail-empty';
            empty.textContent = '表示できるステータスはありません。';
            statsEl.appendChild(empty);
        }
    }

    const buttonsEl = document.getElementById('itemDetailButtons');
    buttonsEl.innerHTML = '';
    const appendActionNote = (text) => {
        const note = document.createElement('div');
        note.className = 'item-detail-action-note';
        note.textContent = text;
        buttonsEl.appendChild(note);
    };
    const addAction = (label, tone, run, options = {}) => {
        buttonsEl.appendChild(createItemDetailActionButton(label, tone, run, options));
    };
    const equipItemId = item.itemId;
    const equipStackId = getPreferredInventoryStackId(item);
    const playFabId = window.myPlayFabId || null;
    const isEquipped = (slot) => {
        const equippedValue = myCurrentEquipment[slot];
        return isEquipmentReferenceMatch(item, equippedValue);
    };
    const addOneHandedActions = () => {
        const ownedCount = getInventoryOwnedCount(item);
        const isRightEquipped = isEquipped('RightHand');
        const isLeftEquipped = isEquipped('LeftHand');
        const equippedStackId = getPreferredInventoryStackId(item, { preferEquipped: true });
        if (isRightEquipped && isLeftEquipped) {
            addAction('右手を外す', 'remove', () => equipItem(playFabId, null, 'RightHand'));
            addAction('左手を外す', 'remove', () => equipItem(playFabId, null, 'LeftHand'));
        } else if (isRightEquipped) {
            addAction('右手を外す', 'remove', () => equipItem(playFabId, null, 'RightHand'));
            if (ownedCount < 2) {
                addAction('左手へ移動', 'equip', () => equipItem(
                    playFabId,
                    equipItemId,
                    'LeftHand',
                    equippedStackId,
                    { fromSlot: 'RightHand' }
                ));
            } else {
                addAction(getEquipActionLabel('LeftHand', '左手装備'), 'equip', () => equipItem(playFabId, equipItemId, 'LeftHand', equipStackId));
            }
        } else if (isLeftEquipped) {
            if (ownedCount < 2) {
                addAction('右手へ移動', 'equip', () => equipItem(
                    playFabId,
                    equipItemId,
                    'RightHand',
                    equippedStackId,
                    { fromSlot: 'LeftHand' }
                ));
            } else {
                addAction(getEquipActionLabel('RightHand', '右手装備'), 'equip', () => equipItem(playFabId, equipItemId, 'RightHand', equipStackId));
            }
            addAction('左手を外す', 'remove', () => equipItem(playFabId, null, 'LeftHand'));
        } else {
            addAction(getEquipActionLabel('RightHand', '右手装備'), 'equip', () => equipItem(playFabId, equipItemId, 'RightHand', getPreferredInventoryStackId(item)));
            addAction(getEquipActionLabel('LeftHand', '左手装備'), 'equip', () => equipItem(playFabId, equipItemId, 'LeftHand', getPreferredInventoryStackId(item)));
        }
    };

    if (cd.Category === 'Weapon') {
        const isTwoHanded = isTwoHandedInventoryWeapon(item);
        if (isTwoHanded) {
            if (isEquipped('RightHand')) {
                addAction('両手を外す', 'remove', () => equipItem(playFabId, null, 'RightHand'));
            } else {
                addAction(getEquipActionLabel('RightHand', '両手装備'), 'equip', () => equipItem(playFabId, equipItemId, 'RightHand', equipStackId));
            }
        } else {
            addOneHandedActions();
        }
    } else if (cd.Category === 'Shield') {
        addOneHandedActions();
    } else if (cd.Category === 'Offhand') {
        appendActionNote('副手は左手専用です。杖や魔法寄りの装備と相性が良い補助枠です。');
        if (isEquipped('LeftHand')) {
            addAction('左手を外す', 'remove', () => equipItem(playFabId, null, 'LeftHand'));
        } else {
            addAction(getEquipActionLabel('LeftHand', '左手装備'), 'equip', () => equipItem(playFabId, equipItemId, 'LeftHand', equipStackId));
        }
    } else if (cd.Category === 'Armor') {
        if (isEquipped('Armor')) {
            addAction('外す', 'remove', () => equipItem(playFabId, null, 'Armor'));
        } else {
            addAction(getEquipActionLabel('Armor', '装備'), 'equip', () => equipItem(playFabId, equipItemId, 'Armor', equipStackId));
        }
    } else if (cd.Category === 'Accessory') {
        if (isEquipped('Accessory')) {
            addAction('外す', 'remove', () => equipItem(playFabId, null, 'Accessory'));
        } else {
            addAction(getEquipActionLabel('Accessory', '装備'), 'equip', () => equipItem(playFabId, equipItemId, 'Accessory', equipStackId));
        }
    } else if (isTarotMajorCategory(canonicalCategory)) {
        const position = getShipMajorArcanaPosition(equipItemId);
        if (position > 0) {
            addAction('守護から外す', 'remove', () => unequipShipMajorArcana(playFabId, equipItemId));
        } else {
            addAction(isShipMajorArcanaFull() ? '守護を入れ替え' : '守護に設定', 'equip', () => equipShipMajorArcana(playFabId, equipItemId));
        }
    } else if (isTarotMinorCategory(canonicalCategory)) {
        if (isCardInTarotDeck(equipItemId)) {
            addAction('デッキから外す', 'remove', () => unequipTarotCardFromDeck(playFabId, equipItemId, 'tarot'));
        } else if (getCommonTarotDeck().length < 5) {
            addAction('デッキに追加', 'equip', () => equipTarotCardToDeck(playFabId, equipItemId, 'tarot'));
        } else {
            addAction('タロットデッキ満杯', 'disabled', null, { disabled: true });
        }
    } else if (cd.Category === 'Consumable') {
        addAction('使う', 'use', () => useItem(playFabId, instanceId, item.itemId));
    }

    if (['Weapon', 'Armor', 'Shield'].includes(cd.Category)) {
        if (item?.materialEligible === true && Number(item?.enhancement?.effectiveValue || 0) < 99) {
            addAction('強化', 'enhance', () => showEquipmentEnhancementModal(item));
        } else if (Number(item?.enhancement?.effectiveValue || 0) >= 99) {
            appendActionNote('強化上限 99');
        }
    }

    if (isTarotCard) {
        const lvd = cardLevelMap[equipItemId];
        const levelUpAction = getTarotLevelUpAction(lvd, equipItemId);
        if (levelUpAction) addAction(levelUpAction.label, levelUpAction.tone, levelUpAction.run, levelUpAction);
    }

    if (getInventorySellableCount(item) > 0 && isTarotCard) {
        const management = document.createElement('details');
        management.className = 'item-detail-management';
        const summary = document.createElement('summary');
        summary.textContent = 'カード管理';
        const managementActions = document.createElement('div');
        managementActions.className = 'item-detail-management-actions';
        const marketDisabled = blackMarketMyActiveCount >= blackMarketMaxActiveListings;
        const marketBusy = blackMarketCreatingItemId === getInventoryEntryKey(item);
        if (marketDisabled) {
            const note = document.createElement('div');
            note.className = 'item-detail-action-note';
            note.textContent = `闇市 出品 ${blackMarketMyActiveCount}/${blackMarketMaxActiveListings}`;
            managementActions.appendChild(note);
        }
        managementActions.appendChild(createItemDetailActionButton(
            marketBusy ? '出品中' : '闇市に出す',
            marketDisabled || marketBusy ? 'disabled' : 'market',
            () => showBlackMarketListingPrompt(item),
            { disabled: marketDisabled || marketBusy }
        ));
        managementActions.appendChild(createItemDetailActionButton('売却 1G', 'sell', () => showSellConfirmationModal(instanceId, item.itemId)));
        management.append(summary, managementActions);
        buttonsEl.appendChild(management);
    } else if (getInventorySellableCount(item) > 0) {
        const marketDisabled = blackMarketMyActiveCount >= blackMarketMaxActiveListings;
        const marketBusy = blackMarketCreatingItemId === getInventoryEntryKey(item);
        if (marketDisabled) {
            appendActionNote(`闇市 出品 ${blackMarketMyActiveCount}/${blackMarketMaxActiveListings}`);
        }
        addAction(marketBusy ? '出品中' : '闇市に出す', marketDisabled || marketBusy ? 'disabled' : 'market', () => showBlackMarketListingPrompt(item), { disabled: marketDisabled || marketBusy });
        addAction('売却 1G', 'sell', () => showSellConfirmationModal(instanceId, item.itemId));
    }

    updateItemDetailNavigation(item);
    if (wasOpen) {
        const sheet = modal.querySelector('.item-detail-sheet');
        if (sheet) sheet.scrollTop = 0;
    }
    showModal(modal);
}

export function showSellConfirmationModal(itemInstanceId, itemId) {
    const item = myInventory.find((entry) => (
        entry.itemId === itemId
        && (!itemInstanceId || getInventoryStackIds(entry).includes(String(itemInstanceId)))
    )) || myInventory.find((entry) => entry.itemId === itemId);
    if (!item || getInventorySellableCount(item) <= 0) return;

    const enhancementBonus = Math.max(0, Math.floor(Number(item?.enhancement?.bonus) || 0));
    document.getElementById('sellItemName').innerText = enhancementBonus > 0
        ? `${item.name} +${enhancementBonus}（強化値も失われます）`
        : item.name;
    document.getElementById('sellItemPrice').innerText = '1';
    const modal = document.getElementById('sellConfirmationModal');
    showModal(modal);

    const confirmBtn = document.getElementById('btnConfirmSell');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.onclick = () => {
        hideModal(modal);
        window.sellItem(itemInstanceId, itemId);
    };

    const cancelBtn = document.getElementById('btnCancelSell');
    bindModalClose(cancelBtn, () => { hideModal(modal); }, {
        overlay: modal,
        closeOnBackdrop: true,
        closeOnEscape: true
    });
}

function updateEquipmentAndAvatarDisplay() {
    // Update avatar visuals after equipment change.
    // Re-render avatar after inventory refresh.
    renderAvatar('avatar', window.myAvatarBaseInfo, myCurrentEquipment, myInventory, false);
    renderAvatar('home-avatar', window.myAvatarBaseInfo, myCurrentEquipment, myInventory, false);
    updateEquipmentBonusDisplay();
    renderTarotDeckPanels();
}

function updateEquipmentBonusDisplay() {
    const bonuses = getEquipmentBonuses();
    setBonusValue('currentStrBonus', bonuses.str);
    setBonusValue('currentDefBonus', bonuses.def);
    setBonusValue('currentAgiBonus', bonuses.agi);
    setBonusValue('currentIntBonus', bonuses.int);
}

function setBonusValue(elementId, value) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const displayValue = Number.isFinite(value) ? value : 0;
    el.textContent = `+${displayValue}`;
    el.classList.toggle('is-zero', displayValue === 0);
}

function getEquipmentBonuses() {
    const bonuses = { str: 0, def: 0, agi: 0, int: 0 };
    const equippedIds = Object.values(myCurrentEquipment || {}).filter(Boolean);

    equippedIds.forEach((entry) => {
        const item = getInventoryItemByReference(entry);
        if (!item || !item.customData) return;
        const cd = item.customData;

        const atk = parseInt(cd.Atk ?? cd.Power ?? 0, 10) || 0;
        const def = parseInt(cd.Def ?? cd.Defense ?? 0, 10) || 0;
        const agi = parseInt(cd.Agi ?? cd.Speed ?? 0, 10) || 0;
        const intel = parseInt(cd.Int ?? cd.Intelligence ?? 0, 10) || 0;

        bonuses.str += atk;
        bonuses.def += def;
        bonuses.agi += agi;
        bonuses.int += intel;
    });

    const meleeBonus = myMeleeRole?.bonus || {};
    bonuses.str += Number(meleeBonus.Power || 0) || 0;
    bonuses.def += Number(meleeBonus.Defense || 0) || 0;
    bonuses.agi += Number(meleeBonus.Agi || 0) || 0;
    bonuses.int += Number(meleeBonus.Int || 0) || 0;
    const shipBonus = myShipRole?.bonus || {};
    bonuses.str += Number(shipBonus.Power || 0) || 0;
    bonuses.def += Number(shipBonus.Defense || 0) || 0;
    bonuses.agi += Number(shipBonus.Agi || 0) || 0;
    bonuses.int += Number(shipBonus.Int || 0) || 0;

    return bonuses;
}
