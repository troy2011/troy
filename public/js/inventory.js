// c:/Users/ikeda/my-liff-app/public/js/inventory.js

import {
    getInventory as fetchInventory,
    getEquipment as fetchEquipment,
    equipItem as requestEquipItem,
    getTarotDecks as fetchTarotDecks,
    getPlayerShipStatus as fetchPlayerShipStatus,
    getShipSkillStatus as fetchShipSkillStatus,
    equipTarotCard as requestEquipTarotCard,
    unequipTarotCard as requestUnequipTarotCard,
    moveTarotDeckCard as requestMoveTarotDeckCard,
    equipShipMajorArcana as requestEquipShipMajorArcana,
    unequipShipMajorArcana as requestUnequipShipMajorArcana,
    moveShipMajorArcana as requestMoveShipMajorArcana,
    useItem as requestUseItem,
    sellItem as requestSellItem
} from './playfabClient.js';
import { renderAvatar, preloadAvatarBaseSprites, preloadEquipmentSprites, resolveSpritePathByAvatarColor } from './avatar.js';
import * as Player from './player.js';
import {
    preloadTarotBattleSkills,
    resolveTarotBattleSkill
} from './tarotBattleSkills.js';
import { formatTarotRoleBonus } from './tarotRoles.js';
import { getMajorArcanaShipGear } from './majorArcanaShipGear.js';
import {
    buildTarotCardMeta,
    compareTarotItems,
    getCanonicalTarotCategory,
    getMajorArcanaSuitInfo,
    getTarotNumberBadge,
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
let myShipMajorArcanaSkills = [];
let myPlayerShipProfile = null;
let activeInventoryPanel = 'items';
let activeInventoryGroup = 'Equipment';
let activeInventoryCategory = 'Weapon';
let lastInventoryFetchAt = 0;
let inventoryFetchPromise = null;
let equipmentLoaded = false;
let equipmentFetchPromise = null;
let inventoryStickyResizeObserver = null;
// カードレベルデータ: { [itemId]: { level, maxLevel, quantity, nextLevelCost } }
let cardLevelMap = {};
let tarotBattleSkillsLoaded = false;

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
    try {
        const res = await fetch('/api/cards/levelup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'レベルアップ失敗');
        cardLevelMap[itemId] = {
            ...(cardLevelMap[itemId] || {}),
            level: data.newLevel,
            maxLevel: data.maxLevel,
            nextLevelCost: data.newLevel < data.maxLevel ? (data.newLevel + 1) * 10 : null,
        };
        renderInventoryGrid(activeInventoryCategory);
        showInventoryFeedback(`Lv.${data.newLevel} に上昇！（残シャード: ${data.shardsAfter}）`);
    } catch (err) {
        showInventoryFeedback(err.message, true);
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

function syncInventoryStickyMetrics() {
    if (typeof document === 'undefined') return;
    const tabContent = document.getElementById('tabContentInventory');
    const switcher = document.getElementById('inventoryMobileSwitch');
    if (!tabContent || !switcher) return;
    const switchHeight = Math.ceil(switcher.getBoundingClientRect().height || 0);
    const activePinnedPanel = tabContent.querySelector('.inventory-section.active[data-panel="tarot"]')
        || tabContent.querySelector('.avatar-card.inventory-section.active');
    const pinnedPanelHeight = Math.ceil(activePinnedPanel?.getBoundingClientRect().height || 0);
    tabContent.style.setProperty('--inventory-switch-sticky-height', `${switchHeight}px`);
    tabContent.style.setProperty('--inventory-loadout-sticky-height', `${pinnedPanelHeight}px`);
}

function bindInventoryStickyMetrics() {
    if (typeof document === 'undefined') return;
    const switcher = document.getElementById('inventoryMobileSwitch');
    if (!switcher) return;
    syncInventoryStickyMetrics();
    if (typeof ResizeObserver !== 'undefined') {
        if (inventoryStickyResizeObserver) {
            inventoryStickyResizeObserver.disconnect();
        }
        inventoryStickyResizeObserver = new ResizeObserver(() => syncInventoryStickyMetrics());
        inventoryStickyResizeObserver.observe(switcher);
        const tabContent = document.getElementById('tabContentInventory');
        const activePinnedPanel = tabContent?.querySelector('.inventory-section.active[data-panel="tarot"]')
            || tabContent?.querySelector('.avatar-card.inventory-section.active');
        if (activePinnedPanel) {
            inventoryStickyResizeObserver.observe(activePinnedPanel);
        }
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
        category: 'Weapon',
        tabs: [
            { category: 'Weapon', label: '武器' },
            { category: 'LeftHand', label: '左手' },
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
    if (['Weapon', 'Shield', 'Offhand', 'LeftHand', 'Armor', 'Accessory'].includes(category)) return 'Equipment';
    if (['TarotMajor', 'TarotMinor'].includes(category)) return 'Tarot';
    if (category === 'Consumable') return 'Consumable';
    return 'All';
}

function matchesInventoryDisplayCategory(itemCategory, selectedCategory) {
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
    container.innerHTML = tabs.map((tab) => `
        <button class="inventory-tab-btn${tab.category === activeInventoryCategory ? ' active' : ''}" data-category="${tab.category}" type="button">${tab.label}</button>
    `).join('');
    container.querySelectorAll('.inventory-tab-btn').forEach((button) => {
        button.addEventListener('click', () => switchInventoryTab(button.dataset.category));
    });
}

function getVisibleModalCount() {
    if (typeof document === 'undefined') return 0;
    return Array.from(document.querySelectorAll('.modal-overlay')).filter((modal) => {
        if (!modal) return false;
        const display = String(modal.style?.display || '').trim().toLowerCase();
        return display === 'flex' || modal.classList.contains('active');
    }).length;
}

function syncModalLockState() {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('modal-lock', getVisibleModalCount() > 0);
}

function hideModal(modal) {
    if (!modal) return;
    modal.style.display = 'none';
    syncModalLockState();
}

function showModal(modal) {
    if (!modal) return;
    modal.style.display = 'flex';
    syncModalLockState();
}

export function closeItemDetailModal() {
    hideModal(document.getElementById('itemDetailModal'));
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
    const slotKeyMap = {
        rightHand: 'RightHand',
        leftHand: 'LeftHand',
        armor: 'Armor',
        accessory: 'Accessory',
        majorarcana: 'MajorArcana'
    };
    const currentSlotKey = slotKeyMap[slotType] || '';
    const currentEntry = currentSlotKey ? myCurrentEquipment?.[currentSlotKey] : null;
    const currentItem = getInventoryItemByReference(currentEntry);
    const currentCategory = String(currentItem?.customData?.Category || '').trim();

    if (slotType === 'majorarcana') return 'TarotMajor';
    if (slotType === 'leftHand' && (currentCategory === 'Shield' || currentCategory === 'Offhand')) {
        return 'LeftHand';
    }
    if (currentCategory === 'Weapon' || currentCategory === 'Armor' || currentCategory === 'Accessory') {
        return currentCategory;
    }
    if (currentCategory === 'TarotMajor' || currentCategory === 'MajorArcana' || currentCategory === 'TarotArcanaMajor') {
        return 'TarotMajor';
    }
    if (slotType === 'rightHand') return 'Weapon';
    if (slotType === 'leftHand') return 'LeftHand';
    if (slotType === 'armor') return 'Armor';
    if (slotType === 'accessory') return 'Accessory';
    return 'All';
}

function handleEquipmentSlotSelect(slotElement) {
    const targetCategory = getTargetInventoryCategoryForEquipmentSlot(slotElement);
    switchInventoryPanel('items', { preserveScroll: true });
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
    return displayInventory.find((inventoryItem) => {
        const itemIds = getInventoryItemReferenceIds(inventoryItem);
        return referenceIds.some((referenceId) => itemIds.includes(referenceId));
    })
        || null;
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

function getTarotDeckCardNumberValue(item) {
    const cd = item?.customData || {};
    const category = getCanonicalTarotCategory(cd.Category);
    if (category === 'TarotMajor') {
        const number = Number(cd.ArcanaNumber ?? cd.CardNumber);
        return Number.isFinite(number) ? number : 999;
    }
    if (category === 'TarotMinor') {
        const raw = String(cd.ArcanaRank || cd.Rank || cd.CardRank || cd.CardNumber || '').trim();
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) return parsed;
        const faceOrder = {
            A: 1,
            ACE: 1,
            PAGE: 11,
            KNIGHT: 12,
            QUEEN: 13,
            KING: 14
        };
        return faceOrder[raw.toUpperCase()] || 999;
    }
    return 999;
}

function sortTarotDeckItemIds(deckItemIds) {
    return (Array.isArray(deckItemIds) ? deckItemIds : [])
        .map((itemId, index) => ({ itemId: String(itemId || '').trim(), index }))
        .filter((entry) => entry.itemId)
        .map((entry) => entry.itemId);
}

function getDisplayInventoryEntries() {
    return [...myInventory];
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

function getCommonTarotRole() {
    return myMeleeRole || myShipRole || null;
}

function isShipMajorArcanaEquipped(itemId) {
    return myShipMajorArcana.includes(String(itemId || '').trim());
}

function getShipMajorArcanaPosition(itemId) {
    const index = myShipMajorArcana.findIndex((entry) => String(entry || '') === String(itemId || ''));
    return index >= 0 ? index + 1 : 0;
}

function isShipMajorArcanaFull() {
    return myShipMajorArcana.length >= myShipMajorArcanaLimit;
}

function getShipMajorArcanaSkill(itemId) {
    return myShipMajorArcanaSkills.find((skill) => String(skill?.cardItemId || '') === String(itemId || '')) || null;
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
}

function applyPlayerShipStatusData(shipStatus) {
    const ship = shipStatus?.ship || shipStatus || {};
    myPlayerShipProfile = ship || null;
    const limit = Number(ship?.majorArcanaSlotLimit || ship?.stage || 1) || 1;
    myShipMajorArcanaLimit = Math.max(1, Math.min(3, Math.floor(limit)));
    const ids = Array.isArray(ship?.majorArcanaItemIds)
        ? ship.majorArcanaItemIds
        : Array.isArray(ship?.majorArcana)
            ? ship.majorArcana.map((entry) => entry?.itemId).filter(Boolean)
            : [];
    myShipMajorArcana = ids.map((id) => String(id || '').trim()).filter(Boolean).slice(0, myShipMajorArcanaLimit);
    myShipDeck = [...myShipMajorArcana];
}

function applyShipSkillStatusData(skillStatus) {
    myShipMajorArcanaSkills = Array.isArray(skillStatus?.skills)
        ? skillStatus.skills.filter((skill) => skill && !skill.error)
        : [];
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

function renderDeckGrid(gridEl, deckItemIds) {
    if (!gridEl) return;
    const MAX_SLOTS = 5;
    const filledCount = Math.min(deckItemIds.length, MAX_SLOTS);
    gridEl.dataset.deckCount = String(filledCount);
    gridEl.dataset.deckComplete = filledCount >= MAX_SLOTS ? 'true' : 'false';
    gridEl.setAttribute('aria-label', `タロットデッキ ${filledCount}/${MAX_SLOTS}`);
    const cells = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
        const itemId = deckItemIds[i] || null;
        const item = itemId ? myInventory.find((inv) => inv.itemId === itemId) : null;
        const cell = document.createElement(item ? 'button' : 'div');
        cell.className = `tarot-loadout-card${item ? '' : ' is-empty'}`;
        if (item) {
            cell.type = 'button';
        }
        cell.setAttribute('aria-label', `タロットデッキ ${i + 1}枚目`);
        if (item) {
            cell.classList.add('is-equipped');
            const entry = buildDeckCardEntry(item, itemId);
            if (entry.isArcana) cell.classList.add('is-arcana');
            cell.dataset.suit = entry.suitKey || 'none';
            cell.title = entry.title;
            cell.setAttribute('aria-label', `${entry.title}の詳細を開く`);
            cell.addEventListener('click', () => showItemDetailModal(item));
            const visualEl = document.createElement('div');
            visualEl.className = 'tarot-loadout-visual';
            renderDeckCardSprite(visualEl, entry);
            const numberBadge = createTarotNumberBadge(entry.numberLabel, entry.suitKey);
            if (numberBadge) visualEl.appendChild(numberBadge);
            cell.append(visualEl);
        } else {
            cell.setAttribute('aria-label', `タロットデッキ ${i + 1}枚目 空き`);
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
    const maxSlots = Math.max(1, Math.min(3, Number(myShipMajorArcanaLimit || 1) || 1));
    const filledCount = Math.min(myShipMajorArcana.length, maxSlots);
    gridEl.dataset.deckCount = String(filledCount);
    gridEl.dataset.deckComplete = filledCount >= maxSlots ? 'true' : 'false';
    gridEl.setAttribute('aria-label', `船の大アルカナ装備 ${filledCount}/${maxSlots}`);
    const cells = [];
    for (let i = 0; i < maxSlots; i++) {
        const itemId = myShipMajorArcana[i] || null;
        const item = itemId ? myInventory.find((inv) => inv.itemId === itemId) : null;
        const cell = document.createElement(item ? 'button' : 'div');
        cell.className = `tarot-loadout-card${item ? ' is-arcana' : ' is-empty'}`;
        cell.setAttribute('aria-label', item ? `${item.name || itemId}の詳細を開く` : `大アルカナ装備 ${i + 1}枠目 空き`);
        if (item) {
            cell.type = 'button';
            cell.classList.add('is-equipped');
            const entry = buildDeckCardEntry(item, itemId);
            cell.dataset.suit = entry.suitKey || 'none';
            cell.title = entry.title;
            cell.addEventListener('click', () => showItemDetailModal(item));
            const visualEl = document.createElement('div');
            visualEl.className = 'tarot-loadout-visual';
            renderDeckCardSprite(visualEl, entry);
            const numberBadge = createTarotNumberBadge(entry.numberLabel, entry.suitKey);
            if (numberBadge) visualEl.appendChild(numberBadge);
            cell.append(visualEl);
        } else {
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

function renderTarotDeckPanels() {
    const shipPanel = document.getElementById('shipDeckPanel');
    if (shipPanel) shipPanel.hidden = false;
    renderDeckRolePanel(document.getElementById('meleeDeckRole'), getCommonTarotRole());
    renderDeckGrid(document.getElementById('meleeDeckGrid'), getCommonTarotDeck());
    renderShipMajorArcanaGrid(document.getElementById('shipMajorArcanaGrid'));
}

function getInventoryTabHint(category) {
    if (category === 'TarotMajor') {
        return '大アルカナは使用中の船に装備します。進化段階で装備枠が増えます。';
    }
    if (category === 'TarotMinor') {
        return 'カードをタップするとデッキへ追加/解除できます。デッキは5枚までです。';
    }
    if (category === 'Accessory') {
        return '候補をタップすると装備/解除できます。詳細はカード下部の i ボタンから確認できます。';
    }
    if (category === 'LeftHand') {
        return '候補をタップすると左手に装備/解除できます。詳細はカード下部の i ボタンから確認できます。';
    }
    if (category === 'Offhand') {
        return '候補をタップすると左手に装備/解除できます。副手は盾とは別系統の補助装備です。';
    }
    if (category === 'Weapon') {
        return '候補をタップすると右手に装備/解除できます。詳細はカード下部の i ボタンから確認できます。';
    }
    if (category === 'Shield') {
        return '候補をタップすると左手に装備/解除できます。詳細はカード下部の i ボタンから確認できます。';
    }
    if (category === 'Armor') {
        return '候補をタップすると装備/解除できます。詳細はカード下部の i ボタンから確認できます。';
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
        return '大アルカナはまだありません。獲得すると船に装備できます。';
    }
    if (category === 'TarotMinor') {
        return '小アルカナはまだありません。本日の占いで正位置を引くとカードを獲得できます。';
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
    const group = getInventoryGroupForCategory(category);
    if (group === 'Equipment') return '装備候補';
    if (group === 'Tarot') return 'タロット候補';
    if (group === 'Consumable') return '消耗品';
    return '持ち物一覧';
}

function countInventoryEntriesForDisplay(items) {
    return items.reduce((sum, item) => sum + Math.max(1, Number(item?.count || 1) || 1), 0);
}

function renderInventoryListSummary(category, filteredItems, allItems) {
    if (typeof document === 'undefined') return;
    const titleEl = document.getElementById('inventoryItemsTitle');
    if (titleEl) {
        titleEl.textContent = getInventoryListTitle(category);
    }

    const summaryEl = document.getElementById('inventoryListSummary');
    if (!summaryEl) return;

    const filtered = Array.isArray(filteredItems) ? filteredItems : [];
    const all = Array.isArray(allItems) ? allItems : [];
    const equippedCount = Object.values(myCurrentEquipment || {}).filter(Boolean).length;
    const deckCount = getCommonTarotDeck().length;
    const chips = [
        ['表示', category === 'All' ? '全部' : getInventoryCategoryLabel(category)],
        ['種類', `${filtered.length}`],
        ['総数', `${countInventoryEntriesForDisplay(filtered)}`],
        ['装備', `${equippedCount}/4`],
        ['デッキ', `${deckCount}/5`]
    ];
    if (category !== 'All') {
        chips.splice(3, 0, ['全体', `${all.length}`]);
    }

    summaryEl.replaceChildren(...chips.map(([label, value]) => {
        const chip = document.createElement('span');
        chip.className = 'inventory-summary-chip';
        const labelEl = document.createElement('small');
        labelEl.textContent = label;
        const valueEl = document.createElement('strong');
        valueEl.textContent = value;
        chip.append(labelEl, valueEl);
        return chip;
    }));
}

function getInventoryLayout(category) {
    if (category === 'TarotMajor' || category === 'TarotMinor') return 'tarot';
    if (['Weapon', 'Shield', 'Offhand', 'LeftHand', 'Armor', 'Accessory'].includes(category)) return 'equipment';
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
    return Number(itemData?.[statKey] ?? 0) || 0;
}

function compareInventoryItemsDefault(a, b, selectedCategory) {
    const leftCategory = getCanonicalTarotCategory(a?.customData?.Category);
    const rightCategory = getCanonicalTarotCategory(b?.customData?.Category);
    if (selectedCategory === 'All' && leftCategory !== rightCategory) {
        return getInventoryCategoryOrder(leftCategory) - getInventoryCategoryOrder(rightCategory);
    }
    if (selectedCategory === 'LeftHand' && leftCategory !== rightCategory) {
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
    const itemRefs = getInventoryItemReferenceIds(item);
    const equippedRefs = getEquipmentReferenceIds(equippedValue);
    return equippedRefs.some((equippedRef) => itemRefs.includes(equippedRef));
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
    if (cd.Defense) statParts.push(`防 ${cd.Defense}`);
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
        if (isShipMajorArcanaEquipped(item.itemId)) chips.push('船装備');
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
        cd.Defense ? `防 ${cd.Defense}` : '',
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
            ? `船装備${getShipMajorArcanaPosition(item?.itemId)}枠目`
            : (isShipMajorArcanaFull() ? '船装備枠が満杯' : '船に装備できます');
        if (!lvd) return role ? `${role} — ${deckText}` : deckText;
        if (lvd.level >= lvd.maxLevel) return `${deckText} — MAX LV`;
        return `${deckText} — 次Lv: ${lvd.nextLevelCost}⚔シャード`;
    }
    if (canonicalCategory === 'TarotMinor') {
        const lvd = cardLevelMap[item?.itemId];
        if (lvd && lvd.level >= lvd.maxLevel) return 'MAX LV';
        if (lvd && lvd.nextLevelCost) return `次Lv: ${lvd.nextLevelCost}⚔シャード`;
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
        return [pick('Defense', 'defense', 'Defense')].filter(Boolean);
    }
    if (category === 'Offhand') {
        return [pick('MagicPower', 'magic', 'Magic power') || pick('HealPower', 'heal', 'Heal power')].filter(Boolean);
    }
    if (category === 'Accessory') {
        return [
            pick('Power', 'power', 'Power'),
            pick('Defense', 'defense', 'Defense'),
            pick('MagicPower', 'magic', 'Magic power'),
            pick('HealPower', 'heal', 'Heal power')
        ].filter(Boolean).slice(0, 2);
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
    if (!stats.length) return null;
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

function isTwoHandedWeapon(item) {
    return isTwoHandedInventoryWeapon(item);
}


function getPrimaryDiffForCategory(item, canonicalCategory, currentItem) {
    const cd = item?.customData || {};
    const currentData = currentItem?.customData || {};
    if (!currentItem) return 0;
    if (canonicalCategory === 'Weapon') return getInventoryStatValue(cd, 'Power') - getInventoryStatValue(currentData, 'Power');
    if (canonicalCategory === 'Shield' || canonicalCategory === 'Armor') return getInventoryStatValue(cd, 'Defense') - getInventoryStatValue(currentData, 'Defense');
    if (canonicalCategory === 'Offhand') {
        const magicDiff = getInventoryStatValue(cd, 'MagicPower') - getInventoryStatValue(currentData, 'MagicPower');
        if (magicDiff !== 0) return magicDiff;
        return getInventoryStatValue(cd, 'HealPower') - getInventoryStatValue(currentData, 'HealPower');
    }
    if (canonicalCategory === 'Accessory') {
        const powerDiff = getInventoryStatValue(cd, 'Power') - getInventoryStatValue(currentData, 'Power');
        if (powerDiff !== 0) return powerDiff;
        return getInventoryStatValue(cd, 'Defense') - getInventoryStatValue(currentData, 'Defense');
    }
    return 0;
}

function getInventoryComparisonSummary(item, canonicalCategory) {
    const slot = getEquipmentSlotForCategory(canonicalCategory);
    if (!slot) return null;

    const slotLabel = getTarotSlotLabel(slot);
    const equippedRef = myCurrentEquipment?.[slot];
    const currentItem = equippedRef ? getInventoryItemByReference(equippedRef) : null;
    const currentRef = currentItem?.instances?.[0] || currentItem?.itemId || '';
    const itemRef = item?.instances?.[0] || item?.itemId || '';
    if (!currentItem) {
        return { text: `${slotLabel}は空き`, tone: 'open' };
    }
    if (String(currentRef) === String(itemRef)) {
        return { text: `${slotLabel}に装備中`, tone: 'equipped' };
    }

    const currentData = currentItem.customData || {};
    const nextData = item.customData || {};
    const pairs = [
        ['Power', '攻'],
        ['Defense', '防'],
        ['MagicPower', '術'],
        ['HealPower', '回'],
        ['CastRate', '詠']
    ];
    const diffs = pairs
        .map(([key, label]) => {
            const delta = getInventoryStatValue(nextData, key) - getInventoryStatValue(currentData, key);
            if (!delta) return '';
            return `${label}${delta > 0 ? '+' : ''}${delta}`;
        })
        .filter(Boolean)
        .slice(0, 3);
    const primaryDiff = getPrimaryDiffForCategory(item, canonicalCategory, currentItem);
    if (!diffs.length) {
        return { text: `${slotLabel}比 変化なし`, tone: 'flat' };
    }
    return {
        text: `${slotLabel}比 ${diffs.join(' ')}`,
        tone: primaryDiff > 0 ? 'up' : primaryDiff < 0 ? 'down' : 'flat'
    };
}

function getEquipmentSlotForCategory(canonicalCategory) {
    if (canonicalCategory === 'Weapon') return 'RightHand';
    if (canonicalCategory === 'Shield' || canonicalCategory === 'Offhand') return 'LeftHand';
    if (canonicalCategory === 'Armor') return 'Armor';
    if (canonicalCategory === 'Accessory') return 'Accessory';
    return null;
}

function getEquipmentCompareStatPairs(item, currentItem) {
    const nextData = item?.customData || {};
    const currentData = currentItem?.customData || {};
    return [
        ['Power', '攻'],
        ['Defense', '防'],
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

function createEquipmentComparisonBlock(item, canonicalCategory) {
    const slot = getEquipmentSlotForCategory(canonicalCategory);
    if (!slot) return null;
    const equippedRef = myCurrentEquipment?.[slot];
    const currentItem = equippedRef ? getInventoryItemByReference(equippedRef) : null;
    const currentRef = currentItem?.instances?.[0] || currentItem?.itemId || '';
    const itemRef = item?.instances?.[0] || item?.itemId || '';
    if (currentItem && String(currentRef) === String(itemRef)) return null;

    const wrap = document.createElement('div');
    wrap.className = 'inventory-equipment-compare';

    const rows = document.createElement('div');
    rows.className = 'inventory-equipment-compare-rows';

    const currentRow = document.createElement('div');
    currentRow.className = 'inventory-equipment-compare-row';
    const currentLabel = document.createElement('span');
    currentLabel.textContent = '現在';
    const currentName = document.createElement('strong');
    currentName.textContent = currentItem?.name || '未装備';
    currentRow.append(currentLabel, currentName);

    const nextRow = document.createElement('div');
    nextRow.className = 'inventory-equipment-compare-row is-next';
    const nextLabel = document.createElement('span');
    nextLabel.textContent = '候補';
    const nextName = document.createElement('strong');
    nextName.textContent = item?.name || '不明なアイテム';
    nextRow.append(nextLabel, nextName);
    rows.append(currentRow, nextRow);
    wrap.appendChild(rows);

    const stats = getEquipmentCompareStatPairs(item, currentItem);
    if (stats.length) {
        const statRow = document.createElement('div');
        statRow.className = 'inventory-equipment-compare-stats';
        stats.forEach((stat) => {
            const statEl = document.createElement('span');
            statEl.className = stat.delta > 0 ? 'is-up' : stat.delta < 0 ? 'is-down' : 'is-flat';
            const deltaText = stat.delta ? ` (${stat.delta > 0 ? '+' : ''}${stat.delta})` : '';
            statEl.textContent = `${stat.label} ${stat.current}->${stat.next}${deltaText}`;
            statRow.appendChild(statEl);
        });
        wrap.appendChild(statRow);
    }
    return wrap;
}

function getInventoryQuickAction(item, canonicalCategory) {
    const playFabId = window.myPlayFabId || null;
    if (!playFabId) return null;
    const equippedSlots = getEquippedSlotsForItem(item);
    const itemId = item?.itemId;
    const instanceId = item?.instances?.[0];

    if (canonicalCategory === 'Weapon') {
        if (isTwoHandedWeapon(item)) {
            if (equippedSlots.includes('RightHand')) {
                return { label: '外す', tone: 'remove', run: () => equipItem(playFabId, null, 'RightHand') };
            }
            return { label: '両手', tone: 'equip', run: () => equipItem(playFabId, itemId, 'RightHand') };
        }
        if (equippedSlots.includes('RightHand')) {
            return { label: '外す', tone: 'remove', run: () => equipItem(playFabId, null, 'RightHand') };
        }
        if (equippedSlots.includes('LeftHand')) {
            return { label: '外す', tone: 'remove', run: () => equipItem(playFabId, null, 'LeftHand') };
        }
        return { label: '右手', tone: 'equip', run: () => equipItem(playFabId, itemId, 'RightHand') };
    }
    if (canonicalCategory === 'Shield' || canonicalCategory === 'Offhand') {
        if (equippedSlots.includes('LeftHand')) {
            return { label: '外す', tone: 'remove', run: () => equipItem(playFabId, null, 'LeftHand') };
        }
        return { label: '左手', tone: 'equip', run: () => equipItem(playFabId, itemId, 'LeftHand') };
    }
    if (canonicalCategory === 'Armor') {
        if (equippedSlots.includes('Armor')) {
            return { label: '外す', tone: 'remove', run: () => equipItem(playFabId, null, 'Armor') };
        }
        return { label: '装備', tone: 'equip', run: () => equipItem(playFabId, itemId, 'Armor') };
    }
    if (canonicalCategory === 'Accessory') {
        if (equippedSlots.includes('Accessory')) {
            return { label: '外す', tone: 'remove', run: () => equipItem(playFabId, null, 'Accessory') };
        }
        return { label: '装備', tone: 'equip', run: () => equipItem(playFabId, itemId, 'Accessory') };
    }
    if (canonicalCategory === 'TarotMajor') {
        if (isShipMajorArcanaEquipped(itemId)) {
            return { label: '外す', tone: 'remove', run: () => unequipShipMajorArcana(playFabId, itemId) };
        }
        if (!isShipMajorArcanaFull()) {
            return { label: '船装備', tone: 'equip', run: () => equipShipMajorArcana(playFabId, itemId) };
        }
        const lvd = cardLevelMap[itemId];
        if (lvd && lvd.level < lvd.maxLevel) {
            return { label: `Lv↑ (${lvd.nextLevelCost}⚔)`, tone: 'levelup', run: () => levelUpCard(itemId) };
        }
        return null;
    }
    if (canonicalCategory === 'TarotMinor') {
        if (isCardInTarotDeck(itemId)) {
            return { label: '外す', tone: 'remove', run: () => unequipTarotCardFromDeck(playFabId, itemId, 'tarot') };
        }
        const lvd = cardLevelMap[itemId];
        if (lvd && lvd.level < lvd.maxLevel) {
            return { label: `Lv↑ (${lvd.nextLevelCost}⚔)`, tone: 'levelup', run: () => levelUpCard(itemId) };
        }
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
            ? { label: '船から外す', tone: 'remove', run: () => unequipShipMajorArcana(playFabId, itemId) }
            : { label: '船に装備', tone: isShipMajorArcanaFull() ? 'disabled' : 'equip', disabled: isShipMajorArcanaFull(), run: () => equipShipMajorArcana(playFabId, itemId) });
        const position = getShipMajorArcanaPosition(itemId);
        if (position > 1) actions.push({ label: '前へ', tone: 'move', run: () => moveShipMajorArcana(playFabId, itemId, 'left') });
        if (position > 0 && position < myShipMajorArcana.length) actions.push({ label: '後へ', tone: 'move', run: () => moveShipMajorArcana(playFabId, itemId, 'right') });
        const lvd = cardLevelMap[itemId];
        if (lvd && lvd.level < lvd.maxLevel) {
            actions.push({ label: `Lv↑ (${lvd.nextLevelCost}⚔)`, tone: 'levelup', run: () => levelUpCard(itemId) });
        }
        return actions;
    }

    const inDeck = isCardInTarotDeck(itemId);
    actions.push(inDeck
        ? { label: '外す', tone: 'remove', run: () => unequipTarotCardFromDeck(playFabId, itemId, 'tarot') }
        : { label: '追加', tone: getCommonTarotDeck().length < 5 ? 'equip' : 'disabled', disabled: getCommonTarotDeck().length >= 5, run: () => equipTarotCardToDeck(playFabId, itemId, 'tarot') });

    const lvd = cardLevelMap[itemId];
    if (lvd && lvd.level < lvd.maxLevel) {
        actions.push({ label: `Lv↑ (${lvd.nextLevelCost}⚔)`, tone: 'levelup', run: () => levelUpCard(itemId) });
    }

    return actions;
}

function createInventoryCell(item, requestedCategory) {
    const cd = item?.customData || {};
    const canonicalCategory = getCanonicalTarotCategory(cd.Category);
    const isTarotCard = isTarotInventoryCategory(canonicalCategory);
    const isEquipmentCard = isInventoryEquipmentCategory(canonicalCategory);
    const layout = requestedCategory === 'All'
        ? 'mixed'
        : getInventoryLayout(requestedCategory);
    const cell = document.createElement('div');
    cell.className = `inventory-item-cell inventory-item-cell--${layout}`;
    cell.dataset.layout = layout;
    cell.dataset.category = canonicalCategory || 'Unknown';
    cell.title = item?.name || '不明なアイテム';
    cell.setAttribute('role', 'button');
    cell.tabIndex = 0;
    const compareSummary = getInventoryComparisonSummary(item, canonicalCategory);
    const quickActions = getInventoryQuickActions(item, canonicalCategory);
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
    if (isEquipmentCard) {
        cell.classList.add('is-equipment-card');
        cell.dataset.equipmentState = isInventoryItemEquipped(item) ? 'equipped' : 'available';
    }
    if (compareSummary?.tone) {
        cell.classList.add(`is-${compareSummary.tone}`);
    }
    if (quickAction?.tone) {
        cell.classList.add(`has-${quickAction.tone}`);
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
    cell.addEventListener('click', () => showItemDetailModal(item));
    cell.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        showItemDetailModal(item);
    });

    const head = document.createElement('div');
    head.className = 'inventory-item-head';
    head.appendChild(createInventoryBadge(getInventoryCategoryLabel(canonicalCategory), canonicalCategory.toLowerCase()));

    const headMeta = document.createElement('div');
    headMeta.className = 'inventory-item-head-meta';
    let tarotCountBadge = null;
    if (isEquipmentEquipped) {
        headMeta.appendChild(createInventoryBadge('装備中', 'active'));
    }
    if (isTarotDeckEquipped) {
        headMeta.appendChild(createInventoryBadge('E', 'equipped'));
    }
    if (isShipMajorEquipped) {
        headMeta.appendChild(createInventoryBadge('船', 'equipped'));
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

    const equipmentComparison = createEquipmentComparisonBlock(item, canonicalCategory);
    if (equipmentComparison) {
        copy.appendChild(equipmentComparison);
    }

    main.appendChild(copy);
    cell.appendChild(main);

    if (!isTarotCard && !isEquipmentCard && (compareSummary || quickActions.length)) {
        const tail = document.createElement('div');
        tail.className = 'inventory-item-tail';
        if (compareSummary) {
            const compareEl = document.createElement('div');
            compareEl.className = `inventory-item-compare is-${compareSummary.tone || 'flat'}`;
            compareEl.textContent = compareSummary.text;
            tail.appendChild(compareEl);
        }
        if (quickActions.length) {
            const actionWrap = document.createElement('div');
            actionWrap.className = 'inventory-item-actions';
            if (isTarotCard || isEquipmentCard) {
                const detailButton = document.createElement('button');
                detailButton.type = 'button';
                detailButton.className = 'inventory-item-quick-action is-detail';
                detailButton.textContent = '詳細';
                detailButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    showItemDetailModal(item);
                });
                actionWrap.appendChild(detailButton);
            }
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

    return cell;
}

function getEquipActionLabel(slot, defaultLabel) {
    return defaultLabel;
}

export function getMyInventory() {
    return myInventory;
}

export function getMyCurrentEquipment() {
    return myCurrentEquipment;
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
    const [data, deckData, shipStatus, shipSkillStatus] = await Promise.all([
        fetchInventory(playFabId),
        fetchTarotDecks(playFabId, { isSilent: true }),
        fetchPlayerShipStatus(playFabId, { isSilent: true }).catch(() => null),
        fetchShipSkillStatus(playFabId, { isSilent: true }).catch(() => null),
        loadTarotBattleSkillCache()
    ]);
    if (data) {
        const contributionValue = data.contribution ?? data.experience ?? 0;
        myInventory = data.inventory;
        myVirtualCurrency = data.virtualCurrency || {};
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
    if (shipStatus?.success || shipStatus?.ship) {
        applyPlayerShipStatusData(shipStatus);
    }
    if (shipSkillStatus?.success) {
        applyShipSkillStatusData(shipSkillStatus);
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
    const [data, deckData, shipStatus, shipSkillStatus] = await Promise.all([
        fetchInventory(playFabId),
        fetchTarotDecks(playFabId, { isSilent: true }),
        fetchPlayerShipStatus(playFabId, { isSilent: true }).catch(() => null),
        fetchShipSkillStatus(playFabId, { isSilent: true }).catch(() => null),
        equipmentRequest,
        loadTarotBattleSkillCache()
    ]);
    if (data) {
        const contributionValue = data.contribution ?? data.experience ?? 0;
        if (Array.isArray(data.inventory)) {
            myInventory = data.inventory;
        }
        myVirtualCurrency = data.virtualCurrency || {};
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
    if (shipStatus?.success || shipStatus?.ship) {
        applyPlayerShipStatusData(shipStatus);
    }
    if (shipSkillStatus?.success) {
        applyShipSkillStatusData(shipSkillStatus);
    }
    renderTarotDeckPanels();
}

export async function getEquipment(playFabId, options = {}) {
    await loadCurrentEquipment(playFabId, options);
    updateEquipmentAndAvatarDisplay();
}

export async function equipItem(playFabId, itemId, slot) {
    const data = await requestEquipItem(playFabId, itemId, slot);
    if (data !== null) {
        await getInventory(playFabId, { force: true }); // インベントリと装備を再取得して表示を更新
        // アイテム詳細モーダルを閉じる
        const modal = document.getElementById('itemDetailModal');
        if (modal) {
            closeItemDetailModal();
        }
    }
}

export async function equipTarotCardToDeck(playFabId, itemId, deckType) {
    const deckLabel = 'タロットデッキ';
    const data = await requestEquipTarotCard(playFabId, itemId, 'tarot');
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
    const data = await requestUnequipTarotCard(playFabId, itemId, 'tarot');
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

export async function moveTarotCardInDeck(playFabId, itemId, deckType, direction) {
    const deckLabel = 'タロットデッキ';
    const data = await requestMoveTarotDeckCard(playFabId, itemId, 'tarot', direction);
    if (data?.ok) {
        applyTarotDeckData(data);
        renderTarotDeckPanels();
        renderInventoryGrid(activeInventoryCategory);
        updateEquipmentBonusDisplay();
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage(`${deckLabel}の順番を変更した。`);
        }
    }
}

async function refreshShipMajorArcanaState(playFabId) {
    const [shipStatus, shipSkillStatus] = await Promise.all([
        fetchPlayerShipStatus(playFabId, { isSilent: true }).catch(() => null),
        fetchShipSkillStatus(playFabId, { isSilent: true }).catch(() => null)
    ]);
    if (shipStatus?.success || shipStatus?.ship) {
        applyPlayerShipStatusData(shipStatus);
    }
    if (shipSkillStatus?.success) {
        applyShipSkillStatusData(shipSkillStatus);
    }
    renderTarotDeckPanels();
    renderInventoryGrid(activeInventoryCategory);
}

export async function equipShipMajorArcana(playFabId, itemId, slotIndex = null) {
    const data = await requestEquipShipMajorArcana(playFabId, itemId, Number.isInteger(slotIndex) ? slotIndex : null);
    if (data?.success || data?.ship) {
        applyPlayerShipStatusData(data);
        await refreshShipMajorArcanaState(playFabId);
        updateEquipmentBonusDisplay();
        closeItemDetailModal();
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('船に大アルカナを装備した。');
        }
    }
}

export async function unequipShipMajorArcana(playFabId, itemId, slotIndex = null) {
    const data = await requestUnequipShipMajorArcana(playFabId, itemId, Number.isInteger(slotIndex) ? slotIndex : null);
    if (data?.success || data?.ship) {
        applyPlayerShipStatusData(data);
        await refreshShipMajorArcanaState(playFabId);
        updateEquipmentBonusDisplay();
        closeItemDetailModal();
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('船から大アルカナを外した。');
        }
    }
}

export async function moveShipMajorArcana(playFabId, itemId, direction) {
    const data = await requestMoveShipMajorArcana(playFabId, itemId, direction);
    if (data?.success || data?.ship) {
        applyPlayerShipStatusData(data);
        await refreshShipMajorArcanaState(playFabId);
        updateEquipmentBonusDisplay();
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('船の大アルカナ装備順を変更した。');
        }
    }
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
    }
}

export function switchInventoryTab(category) {
    activeInventoryCategory = category || 'All';
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
    updateInventorySortOptions(category);

    const displayInventory = getDisplayInventoryEntries();
    const filtered = (category === 'All')
        ? displayInventory
        : displayInventory.filter(item => matchesInventoryDisplayCategory(item.customData?.Category, category));
    renderInventoryListSummary(category, filtered, displayInventory);

    const sortOrder = document.getElementById('inventorySort').value;
    const sorted = [...filtered].sort((a, b) => {
        if (sortOrder === 'power_desc') {
            const diff = (b.customData?.Power || 0) - (a.customData?.Power || 0);
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

function createTarotCombatChip(label, tone = '') {
    const chip = document.createElement('span');
    chip.className = `item-detail-tarot-chip${tone ? ` is-${tone}` : ''}`;
    chip.textContent = label;
    return chip;
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
        const skill = getShipMajorArcanaSkill(item?.itemId);
        const shipGear = skill?.shipGear || getMajorArcanaShipGear(item?.itemId, itemData);
        const suitInfo = getMajorArcanaSuitInfo(itemData);
        const section = document.createElement('section');
        section.id = 'itemDetailTarotCombat';
        section.className = 'item-detail-tarot-combat';

        const title = document.createElement('div');
        title.className = 'item-detail-tarot-combat-title';
        const heading = document.createElement('strong');
        heading.textContent = shipGear?.equipmentName || shipGear?.shipGearName || 'アルカナ艤装';
        const state = document.createElement('span');
        state.textContent = position > 0 ? `船装備${position}枠目` : '未装備';
        title.append(heading, state);
        section.appendChild(title);

        const chips = document.createElement('div');
        chips.className = 'item-detail-tarot-chips';
        chips.appendChild(createTarotCombatChip(position > 0 ? `装備枠 ${position}/${myShipMajorArcanaLimit}` : `空き ${myShipMajorArcana.length}/${myShipMajorArcanaLimit}`, position > 0 ? 'order' : 'muted'));
        chips.appendChild(createTarotCombatChip(`属性 ${suitInfo.label || '無属性'}`, suitInfo.key || 'none'));
        if (shipGear?.gearPartLabel) chips.appendChild(createTarotCombatChip(`部位 ${shipGear.gearPartLabel}`, 'equip'));
        if (shipGear?.arcanaElementLabel) chips.appendChild(createTarotCombatChip(`艤装属性 ${shipGear.arcanaElementLabel}`, shipGear.arcanaElement || 'effect'));
        chips.appendChild(createTarotCombatChip('略奪戦用', 'cooldown'));
        if (shipGear?.roleLabel || skill?.role) chips.appendChild(createTarotCombatChip(shipGear?.roleLabel || skill.role, 'effect'));
        section.appendChild(chips);

        const rows = document.createElement('div');
        rows.className = 'item-detail-tarot-rows';
        if (shipGear || skill) {
            appendTarotCombatRow(rows, '船装備名', shipGear?.equipmentName || shipGear?.shipGearName || 'アルカナ艤装', 'skill');
            appendTarotCombatRow(rows, '部位', shipGear?.gearPartLabel || '艤装');
            appendTarotCombatRow(rows, '装備属性', shipGear?.arcanaElementLabel || '無属性');
            appendTarotCombatRow(rows, '必殺艤装', shipGear?.ultimateName || skill?.ultimateName || skill?.skillName || 'アルカナ艤装', 'skill');
            appendTarotCombatRow(rows, '発動条件', shipGear?.trigger || '略奪戦中に自動発動');
            appendTarotCombatRow(rows, '略奪戦効果', shipGear?.shortDescription || skill?.navalEffectDescription || skill?.description || '');
        } else {
            appendTarotCombatRow(rows, '必殺艤装', position > 0 ? '読込中' : '船に装備すると略奪戦で有効', 'skill');
        }
        appendTarotCombatRow(rows, '装備枠', `ボート1 / エクスプローラー2 / 最終進化3`);
        section.appendChild(rows);

        descriptionEl.insertAdjacentElement('afterend', section);
        return;
    }

    const skill = resolveTarotBattleSkill(item?.itemId, itemData);
    const deckPosition = getTarotDeckPosition(item?.itemId);
    const roleInfo = getCurrentTarotRoleText();
    const section = document.createElement('section');
    section.id = 'itemDetailTarotCombat';
    section.className = 'item-detail-tarot-combat';

    const title = document.createElement('div');
    title.className = 'item-detail-tarot-combat-title';
    const heading = document.createElement('strong');
    heading.textContent = '戦闘での使い方';
    const state = document.createElement('span');
    state.textContent = deckPosition > 0 ? `デッキ${deckPosition}枚目` : '未セット';
    title.append(heading, state);
    section.appendChild(title);

    const chips = document.createElement('div');
    chips.className = 'item-detail-tarot-chips';
    chips.appendChild(createTarotCombatChip(deckPosition > 0 ? `発動順 ${deckPosition}` : '未セット', deckPosition > 0 ? 'order' : 'muted'));
    if (skill?.element) chips.appendChild(createTarotCombatChip(`属性 ${skill.element}`, skill.elementKey || 'none'));
    if (skill?.cooldown !== undefined) chips.appendChild(createTarotCombatChip(`CT ${skill.cooldown}`, 'cooldown'));
    if (skill?.effectClass) chips.appendChild(createTarotCombatChip(skill.effectClass, 'effect'));
    section.appendChild(chips);

    const rows = document.createElement('div');
    rows.className = 'item-detail-tarot-rows';
    if (skill) {
        appendTarotCombatRow(rows, 'スキル', skill.skillName || 'カード効果', 'skill');
        appendTarotCombatRow(rows, '効果', skill.effectClass || '特殊');
        appendTarotCombatRow(rows, '対象', skill.target || '敵1体/自分');
        appendTarotCombatRow(rows, '威力/回復', [skill.damageTier, skill.healTier].filter(Boolean).join(' / '));
        appendTarotCombatRow(rows, '状態異常', [skill.status, skill.successRate].filter(Boolean).join(' / '));
        appendTarotCombatRow(rows, '説明', skill.description || '');
    } else {
        appendTarotCombatRow(rows, 'スキル', tarotBattleSkillsLoaded ? '未設定' : '読込中', 'skill');
        appendTarotCombatRow(rows, '説明', tarotBattleSkillsLoaded
            ? 'このカードの戦闘スキルデータはまだ登録されていません。'
            : '戦闘スキル情報を取得中です。');
    }
    appendTarotCombatRow(rows, '発動ルール', '戦闘開始は1枚目から。使用後CT中は通常行動。');
    appendTarotCombatRow(rows, '現在の役', `${roleInfo.roleText} / ${roleInfo.bonusText}`);
    section.appendChild(rows);

    descriptionEl.insertAdjacentElement('afterend', section);
}

function createItemDetailActionButton(label, tone, run, options = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `item-detail-action${tone ? ` is-${tone}` : ''}`;
    button.textContent = label;
    button.disabled = !!options.disabled;
    if (typeof run === 'function') {
        button.addEventListener('click', async () => {
            if (button.disabled) return;
            await run();
        });
    }
    return button;
}

function showItemDetailModal(item) {
    const modal = document.getElementById('itemDetailModal');
    const cd = item.customData || {};
    const instanceId = item.instances?.[0];
    const canonicalCategory = getCanonicalTarotCategory(cd.Category);
    const isTarotCard = isTarotMajorCategory(canonicalCategory) || isTarotMinorCategory(canonicalCategory);
    const isEquipmentItem = isInventoryEquipmentCategory(canonicalCategory);
    const detailKind = isTarotCard ? 'tarot' : (isEquipmentItem ? 'equipment' : 'item');
    const spriteFrame = getInventorySpriteFrame(item);
    const iconEl = document.getElementById('itemDetailIcon');
    const metaEl = document.getElementById('itemDetailMeta');

    modal.dataset.detailKind = detailKind;
    modal.dataset.detailCategory = canonicalCategory || 'Unknown';

    setInventoryIcon(
        iconEl,
        spriteFrame,
        isTarotCard ? 1 : 1.2,
        spriteFrame.category,
        window.myAvatarBaseInfo?.AvatarColor
    );
    document.getElementById('itemDetailName').innerText = item.name;
    document.getElementById('itemDetailCategory').innerText = getInventoryCategoryLabel(canonicalCategory);
    document.getElementById('itemDetailDescription').innerText = isTarotCard
        ? (isTarotMajorCategory(canonicalCategory)
            ? '大アルカナは船に装備し、船スキルと探索BOSS戦前の弱体化に使用します。'
            : '小アルカナデッキの順番で発動する戦闘カードです。役は5枚構成で戦闘開始時に反映されます。')
        : (item.description || '説明がありません。');
    if (isTarotCard) {
        renderTarotCombatDetailSection(item, cd);
    } else {
        removeTarotCombatDetailSection();
    }

    if (metaEl) {
        metaEl.innerHTML = '';
        metaEl.appendChild(createItemDetailMetaChip(getInventoryCategoryLabel(canonicalCategory), detailKind));
        if (isEquipmentItem && isInventoryItemEquipped(item)) {
            metaEl.appendChild(createItemDetailMetaChip('装備中', 'equipped'));
        }
        if (isTarotCard) {
            if (isTarotMajorCategory(canonicalCategory)) {
                metaEl.appendChild(createItemDetailMetaChip(isShipMajorArcanaEquipped(item.itemId) ? '船に装備中' : '船未装備', isShipMajorArcanaEquipped(item.itemId) ? 'equipped' : 'muted'));
            } else {
                metaEl.appendChild(createItemDetailMetaChip(isCardInTarotDeck(item.itemId) ? 'デッキセット中' : '未セット', isCardInTarotDeck(item.itemId) ? 'equipped' : 'muted'));
            }
        }
        const count = Number(item?.count || 0) || 0;
        if (count > 1) {
            metaEl.appendChild(createItemDetailMetaChip(`所持 ${count}`, 'count'));
        }
    }

    const statsEl = document.getElementById('itemDetailStats');
    statsEl.innerHTML = '';
    appendItemDetailStat(statsEl, '攻撃力', cd.Power, 'power');
    appendItemDetailStat(statsEl, '防御力', cd.Defense, 'defense');
    appendItemDetailStat(statsEl, 'かしこさ', cd.Int, 'magic');
    appendItemDetailStat(statsEl, '術補', cd.MagicPower, 'magic');
    appendItemDetailStat(statsEl, '回復補正', cd.HealPower, 'heal');
    appendItemDetailStat(statsEl, '詠唱補正', cd.CastRate);
    appendItemDetailStat(statsEl, 'MP効率', cd.MpEfficiency);
    appendItemDetailStat(statsEl, '状態付与', cd.StatusRate);
    if (cd.Effect) {
        const effectText = typeof cd.Effect === 'object'
            ? [cd.Effect.Type, cd.Effect.Amount].filter(Boolean).join(' ')
            : String(cd.Effect);
        appendItemDetailStat(statsEl, '効果', effectText);
    }
    appendTarotMetaStats(statsEl, cd);
    if (isTarotMajorCategory(canonicalCategory)) {
        const position = getShipMajorArcanaPosition(item.itemId);
        appendItemDetailStat(statsEl, '船装備', position > 0 ? `${position}枠目` : '未装備', 'tarot');
    }
    if (isTarotMinorCategory(canonicalCategory)) {
        appendItemDetailStat(statsEl, '小アルカナデッキ', isCardInTarotDeck(item.itemId) ? 'セット中' : '未セット', 'tarot');
    }

    if (isTarotCard) {
        const lvd = cardLevelMap[item.itemId];
        if (lvd) {
            appendItemDetailStat(statsEl, 'カードLv', `Lv.${lvd.level} / MaxLv.${lvd.maxLevel}`, 'level');
            appendItemDetailStat(statsEl, '重複数', `${lvd.quantity}枚`);
            if (lvd.level < lvd.maxLevel) {
                appendItemDetailStat(statsEl, '次Lvコスト', `${lvd.nextLevelCost}⚔シャード`, 'level');
            } else {
                appendItemDetailStat(statsEl, '育成', 'MAX LV 到達', 'level');
            }
        }
    }
    if (!statsEl.children.length) {
        const empty = document.createElement('div');
        empty.className = 'item-detail-empty';
        empty.textContent = '表示できるステータスはありません。';
        statsEl.appendChild(empty);
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
    const playFabId = window.myPlayFabId || null;
    const isEquipped = (slot) => {
        const equippedValue = myCurrentEquipment[slot];
        return isEquipmentReferenceMatch(item, equippedValue);
    };

    if (cd.Category === 'Weapon') {
        const isTwoHanded = isTwoHandedInventoryWeapon(item);
        if (isTwoHanded) {
            if (isEquipped('RightHand')) {
                addAction('外す', 'remove', () => equipItem(playFabId, null, 'RightHand'));
            } else {
                addAction('両手装備', 'equip', () => equipItem(playFabId, equipItemId, 'RightHand'));
            }
        } else {
            const ownedCount = getInventoryOwnedCount(item);
            const isRightEquipped = isEquipped('RightHand');
            const isLeftEquipped = isEquipped('LeftHand');
            const cannotEquipRight = !isRightEquipped && isLeftEquipped && ownedCount < 2;
            const cannotEquipLeft = !isLeftEquipped && isRightEquipped && ownedCount < 2;
            if (cannotEquipRight || cannotEquipLeft) {
                appendActionNote('同じ片手武器を両手に装備するには2本必要です。');
            }
            if (isEquipped('RightHand')) {
                addAction('右手を外す', 'remove', () => equipItem(playFabId, null, 'RightHand'));
            } else if (cannotEquipRight) {
                addAction('右手装備（2本必要）', 'disabled', null, { disabled: true });
            } else {
                addAction(getEquipActionLabel('RightHand', '右手装備'), 'equip', () => equipItem(playFabId, equipItemId, 'RightHand'));
            }
            if (isEquipped('LeftHand')) {
                addAction('左手を外す', 'remove', () => equipItem(playFabId, null, 'LeftHand'));
            } else if (cannotEquipLeft) {
                addAction('左手装備（2本必要）', 'disabled', null, { disabled: true });
            } else {
                addAction(getEquipActionLabel('LeftHand', '左手装備'), 'equip', () => equipItem(playFabId, equipItemId, 'LeftHand'));
            }
        }
    } else if (cd.Category === 'Shield' || cd.Category === 'Offhand') {
        if (cd.Category === 'Offhand') {
            appendActionNote('副手は左手専用です。杖や魔法寄りの装備と相性が良い補助枠です。');
        }
        if (isEquipped('LeftHand')) {
            addAction('左手を外す', 'remove', () => equipItem(playFabId, null, 'LeftHand'));
        } else {
            addAction(getEquipActionLabel('LeftHand', '左手装備'), 'equip', () => equipItem(playFabId, equipItemId, 'LeftHand'));
        }
    } else if (cd.Category === 'Armor') {
        if (isEquipped('Armor')) {
            addAction('外す', 'remove', () => equipItem(playFabId, null, 'Armor'));
        } else {
            addAction(getEquipActionLabel('Armor', '装備'), 'equip', () => equipItem(playFabId, equipItemId, 'Armor'));
        }
    } else if (cd.Category === 'Accessory') {
        if (isEquipped('Accessory')) {
            addAction('外す', 'remove', () => equipItem(playFabId, null, 'Accessory'));
        } else {
            addAction(getEquipActionLabel('Accessory', '装備'), 'equip', () => equipItem(playFabId, equipItemId, 'Accessory'));
        }
    } else if (isTarotMajorCategory(canonicalCategory)) {
        appendActionNote(`船の大アルカナ装備枠: ${myShipMajorArcana.length}/${myShipMajorArcanaLimit}`);
        const position = getShipMajorArcanaPosition(equipItemId);
        if (position > 0) {
            addAction('船から外す', 'remove', () => unequipShipMajorArcana(playFabId, equipItemId));
            if (position > 1) addAction('前へ', 'move', () => moveShipMajorArcana(playFabId, equipItemId, 'left'));
            if (position < myShipMajorArcana.length) addAction('後へ', 'move', () => moveShipMajorArcana(playFabId, equipItemId, 'right'));
        } else if (!isShipMajorArcanaFull()) {
            addAction('船に装備', 'equip', () => equipShipMajorArcana(playFabId, equipItemId));
        } else {
            addAction('船装備枠が満杯', 'disabled', null, { disabled: true });
        }
    } else if (isTarotMinorCategory(canonicalCategory)) {
        appendActionNote('小アルカナデッキにセットできます。');
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

    if (isTarotCard) {
        const lvd = cardLevelMap[equipItemId];
        if (lvd && lvd.level < lvd.maxLevel) {
            addAction(`Lvアップ（${lvd.nextLevelCost}⚔）`, 'levelup', () => levelUpCard(equipItemId));
        }
    }

    if (cd.SellPrice > 0) {
        addAction(`売却 ${cd.SellPrice}G`, 'sell', () => showSellConfirmationModal(instanceId, item.itemId));
    }

    showModal(modal);
}

export function showSellConfirmationModal(itemInstanceId, itemId) {
    const item = myInventory.find(i => i.itemId === itemId);
    if (!item?.customData?.SellPrice) return;

    document.getElementById('sellItemName').innerText = item.name;
    document.getElementById('sellItemPrice').innerText = item.customData.SellPrice;
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
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.onclick = () => { hideModal(modal); };
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
