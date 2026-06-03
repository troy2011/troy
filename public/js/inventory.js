// c:/Users/ikeda/my-liff-app/public/js/inventory.js

import {
    getInventory as fetchInventory,
    getEquipment as fetchEquipment,
    equipItem as requestEquipItem,
    getTarotDecks as fetchTarotDecks,
    equipTarotCard as requestEquipTarotCard,
    unequipTarotCard as requestUnequipTarotCard,
    moveTarotDeckCard as requestMoveTarotDeckCard,
    useItem as requestUseItem,
    sellItem as requestSellItem
} from './playfabClient.js';
import { renderAvatar, preloadAvatarBaseSprites, preloadEquipmentSprites, resolveSpritePathByAvatarColor } from './avatar.js';
import * as Player from './player.js';
import {
    buildTarotCardMeta,
    compareTarotItems,
    getCanonicalTarotCategory,
    getMajorArcanaSuitInfo,
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
let myIsKing = false;
let myMeleeDeck = [];
let myShipDeck = [];
let myMeleeRole = null;
let myShipRole = null;
let activeInventoryPanel = 'items';
let activeInventoryGroup = 'Equipment';
let activeInventoryCategory = 'Weapon';
let lastInventoryFetchAt = 0;
let inventoryFetchPromise = null;
// カードレベルデータ: { [itemId]: { level, maxLevel, quantity, nextLevelCost } }
let cardLevelMap = {};

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
            { category: 'Shield', label: '盾' },
            { category: 'Offhand', label: '副手' },
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

const EQUIPMENT_FOCUS_SLOTS = Object.freeze([
    { slot: 'RightHand', label: '右手', empty: '武器なし', category: 'Weapon' },
    { slot: 'LeftHand', label: '左手', empty: '盾 / 副手なし', category: 'Shield' },
    { slot: 'Armor', label: '頭', empty: '防具なし', category: 'Armor' },
    { slot: 'Accessory', label: 'アクセ', empty: 'アクセなし', category: 'Accessory' }
]);
const EQUIPPABLE_INVENTORY_CATEGORIES = new Set(['Weapon', 'Shield', 'Offhand', 'Armor', 'Accessory']);

export function getActiveInventoryCategory() {
    return activeInventoryCategory;
}


function getInventoryGroupForCategory(category) {
    if (['Weapon', 'Shield', 'Offhand', 'Armor', 'Accessory'].includes(category)) return 'Equipment';
    if (['TarotMajor', 'TarotMinor'].includes(category)) return 'Tarot';
    if (category === 'Consumable') return 'Consumable';
    return 'All';
}

function getDefaultInventoryCategory(group) {
    return INVENTORY_GROUPS[group]?.category || 'All';
}

function renderInventoryTabControls() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.inventory-primary-tab-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.group === activeInventoryGroup);
    });

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
        section.classList.toggle('active', section.dataset.panel === activeInventoryPanel);
    });
    const tabContent = document.getElementById('tabContentInventory');
    if (tabContent) {
        tabContent.dataset.inventoryPanel = activeInventoryPanel;
        tabContent.dataset.inventoryGroup = activeInventoryGroup;
    }
    if (!options.scrollSwitcher) return;
    const switcher = document.getElementById('inventoryMobileSwitch');
    if (switcher) {
        switcher.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
}

function getInventoryItemByReference(itemRef) {
    if (!itemRef) return null;
    if (itemRef && typeof itemRef === 'object' && itemRef.customData) return itemRef;
    const displayInventory = getDisplayInventoryEntries();
    return displayInventory.find((inventoryItem) => inventoryItem.instances?.includes(itemRef))
        || displayInventory.find((inventoryItem) => inventoryItem.itemId === itemRef)
        || null;
}

function getDisplayInventoryEntries() {
    return [...myInventory];
}

function isCardInMeleeDeck(itemId) {
    return myMeleeDeck.includes(String(itemId || '').trim());
}

function isCardInShipDeck(itemId) {
    return myShipDeck.includes(String(itemId || '').trim());
}

function isCardInTarotDeck(itemId) {
    return isCardInMeleeDeck(itemId) || isCardInShipDeck(itemId);
}

function getCommonTarotDeck() {
    return Array.isArray(myMeleeDeck) ? myMeleeDeck : [];
}

function getCommonTarotRole() {
    return myMeleeRole || myShipRole || null;
}

function applyTarotDeckData(deckData) {
    const commonDeck = Array.isArray(deckData?.tarotDeck)
        ? deckData.tarotDeck
        : Array.isArray(deckData?.meleeDeck)
            ? deckData.meleeDeck
            : Array.isArray(deckData?.shipDeck)
                ? deckData.shipDeck
                : [];
    const commonRole = deckData?.tarotRole || deckData?.meleeRole || deckData?.shipRole || null;
    myMeleeDeck = commonDeck;
    myShipDeck = commonDeck;
    myMeleeRole = commonRole;
    myShipRole = commonRole;
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
    const bonusParts = [];
    if (bonus.Power) bonusParts.push(`攻+${bonus.Power}`);
    if (bonus.Defense) bonusParts.push(`防+${bonus.Defense}`);
    if (bonus.Agi) bonusParts.push(`敏+${bonus.Agi}`);
    if (bonus.Int) bonusParts.push(`知+${bonus.Int}`);
    const bonusText = bonusParts.length ? bonusParts.join(' / ') : '役ボーナスなし';
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
    if (canonicalCategory === 'TarotMajor') {
        return String(cd.ArcanaNumber ?? cd.CardNumber ?? '').trim();
    }
    return getTarotRankLabel(cd);
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
        const scale = Math.min(34 / (Number(sprite.width || 48) || 48), 54 / (Number(sprite.height || 80) || 80));
        setSpriteIcon(
            artEl,
            sprite.path,
            Number(sprite.index || 0) || 0,
            Number(sprite.width || 48) || 48,
            Number(sprite.height || 80) || 80,
            scale,
            null,
            null
        );
    } else {
        artEl.textContent = '🂠';
    }
    visualEl.appendChild(artEl);
}

function renderDeckGrid(gridEl, deckItemIds, deckType) {
    if (!gridEl) return;
    const playFabId = window.myPlayFabId || null;
    const MAX_SLOTS = 5;
    const cells = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
        const itemId = deckItemIds[i] || null;
        const item = itemId ? myInventory.find((inv) => inv.itemId === itemId) : null;
        const cell = document.createElement('div');
        cell.className = `tarot-loadout-card${item ? '' : ' is-empty'}`;
        if (item) {
            cell.classList.add('is-equipped');
            const entry = buildDeckCardEntry(item, itemId);
            if (entry.isArcana) cell.classList.add('is-arcana');
            cell.dataset.suit = entry.suitKey || 'none';
            const slotEl = document.createElement('div');
            slotEl.className = 'tarot-loadout-slot';
            slotEl.textContent = `${i + 1}`;
            const suitEl = document.createElement('div');
            suitEl.className = 'tarot-loadout-suit';
            suitEl.textContent = entry.suitLabel || '無属性';
            const visualEl = document.createElement('div');
            visualEl.className = 'tarot-loadout-visual';
            renderDeckCardSprite(visualEl, entry);
            const numberEl = document.createElement('div');
            numberEl.className = 'tarot-loadout-number';
            numberEl.textContent = entry.numberLabel || '';
            visualEl.appendChild(numberEl);
            const nameEl = document.createElement('div');
            nameEl.className = 'tarot-loadout-title';
            nameEl.textContent = entry.title;
            const metaEl = document.createElement('div');
            metaEl.className = 'tarot-loadout-detail';
            metaEl.textContent = entry.detail;
            const actionsEl = document.createElement('div');
            actionsEl.className = 'tarot-loadout-cell-actions';
            const moveLeftBtn = document.createElement('button');
            moveLeftBtn.type = 'button';
            moveLeftBtn.className = 'tarot-loadout-cell-move';
            moveLeftBtn.textContent = '←';
            moveLeftBtn.title = '前へ';
            moveLeftBtn.disabled = i <= 0;
            const moveRightBtn = document.createElement('button');
            moveRightBtn.type = 'button';
            moveRightBtn.className = 'tarot-loadout-cell-move';
            moveRightBtn.textContent = '→';
            moveRightBtn.title = '後ろへ';
            moveRightBtn.disabled = i >= deckItemIds.length - 1 || i >= MAX_SLOTS - 1;
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'tarot-loadout-cell-remove';
            removeBtn.textContent = '外す';
            if (playFabId) {
                moveLeftBtn.addEventListener('click', () => moveTarotCardInDeck(playFabId, itemId, deckType, 'left'));
                moveRightBtn.addEventListener('click', () => moveTarotCardInDeck(playFabId, itemId, deckType, 'right'));
                removeBtn.addEventListener('click', () => unequipTarotCardFromDeck(playFabId, itemId, deckType));
            }
            actionsEl.append(moveLeftBtn, moveRightBtn, removeBtn);
            cell.append(slotEl, suitEl, visualEl, nameEl, metaEl, actionsEl);
        } else {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'tarot-loadout-cell-empty';
            emptyEl.textContent = `スロット${i + 1}`;
            cell.appendChild(emptyEl);
        }
        cells.push(cell);
    }
    gridEl.innerHTML = '';
    cells.forEach((cell) => gridEl.appendChild(cell));
}

function renderTarotDeckPanels() {
    const shipPanel = document.getElementById('shipDeckPanel');
    if (shipPanel) shipPanel.hidden = true;
    renderDeckRolePanel(document.getElementById('meleeDeckRole'), getCommonTarotRole());
    renderDeckGrid(document.getElementById('meleeDeckGrid'), getCommonTarotDeck(), 'tarot');
}

function getInventoryTabHint(category) {
    if (category === 'TarotMajor') {
        return '大アルカナはカードとしてタロットデッキに追加できます。';
    }
    if (category === 'TarotMinor') {
        return '小アルカナはタロットデッキに追加できます。';
    }
    if (category === 'Accessory') {
        return 'アクセサリーは通常装備として使えます。';
    }
    if (category === 'Offhand') {
        return '副手は左手に装備します。魔導書やオーブなど、盾とは別系統の補助装備です。';
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
        return '大アルカナはまだありません。獲得するとデッキに追加できます。';
    }
    if (category === 'TarotMinor') {
        return '小アルカナはまだありません。本日の占いで正位置を引くとカードを獲得できます。';
    }
    if (category === 'Accessory') {
        return 'このカテゴリのアクセサリーはまだありません。';
    }
    if (category === 'Offhand') {
        return 'このカテゴリの副手はまだありません。';
    }
    return 'このカテゴリのアイテムはありません。';
}

function getInventoryCategoryLabel(category) {
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

function getInventoryLayout(category) {
    if (category === 'TarotMajor' || category === 'TarotMinor') return 'mixed';
    if (['Weapon', 'Shield', 'Offhand', 'Armor', 'Accessory'].includes(category)) return 'mixed';
    if (category === 'Consumable') return 'mixed';
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
    if ((leftCategory === 'TarotMajor' && rightCategory === 'TarotMajor')
        || (leftCategory === 'TarotMinor' && rightCategory === 'TarotMinor')) {
        return compareTarotItems(a, b);
    }

    const focusCategory = selectedCategory === 'All' ? leftCategory : selectedCategory;
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
    const instanceId = item.instances?.[0];
    const itemId = item.itemId;
    return Boolean((instanceId && equippedValue === instanceId) || (itemId && equippedValue === itemId));
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
        if (isCardInTarotDeck(item.itemId)) chips.push('デッキ');
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
        const deckText = isCardInTarotDeck(item?.itemId)
            ? 'タロットデッキにセット中'
            : 'デッキに追加できます';
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

function getEquipmentFocusStats(item) {
    if (!item) return '';
    const cd = item.customData || {};
    const parts = [
        cd.Power ? `攻 ${cd.Power}` : '',
        cd.Defense ? `防 ${cd.Defense}` : '',
        cd.MagicPower ? `術 ${cd.MagicPower}` : '',
        cd.HealPower ? `回 ${cd.HealPower}` : '',
        cd.CastRate ? `詠 ${cd.CastRate}` : ''
    ].filter(Boolean);
    return parts.slice(0, 3).join(' / ');
}

function createInventoryFocusHeader(title, meta) {
    const header = document.createElement('div');
    header.className = 'inventory-focus-header';
    const titleEl = document.createElement('div');
    titleEl.className = 'inventory-focus-title';
    titleEl.textContent = title;
    const metaEl = document.createElement('div');
    metaEl.className = 'inventory-focus-meta';
    metaEl.textContent = meta;
    header.append(titleEl, metaEl);
    return header;
}

function scrollInventoryCandidatesIntoView() {
    const tabsEl = document.getElementById('inventoryTabs');
    const gridEl = document.getElementById('inventoryGrid');
    (tabsEl || gridEl)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function renderEquipmentFocusPanel(panel) {
    panel.appendChild(createInventoryFocusHeader('現在の装備', 'スロットを押すと候補を絞り込みます'));
    const slotGrid = document.createElement('div');
    slotGrid.className = 'inventory-focus-slot-grid';

    EQUIPMENT_FOCUS_SLOTS.forEach((slotDef) => {
        const equippedRef = myCurrentEquipment?.[slotDef.slot];
        const item = equippedRef ? getInventoryItemByReference(equippedRef) : null;
        const category = item ? getCanonicalTarotCategory(item.customData?.Category) : slotDef.category;
        const button = document.createElement('div');
        button.role = 'button';
        button.tabIndex = 0;
        button.className = `inventory-focus-slot${item ? ' is-filled' : ''}`;
        button.dataset.slot = slotDef.slot;
        const selectSlot = () => {
            switchInventoryTab(category || slotDef.category);
            scrollInventoryCandidatesIntoView();
        };
        button.addEventListener('click', selectSlot);
        button.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            selectSlot();
        });

        const label = document.createElement('span');
        label.className = 'inventory-focus-slot-label';
        label.textContent = slotDef.label;
        const name = document.createElement('strong');
        name.textContent = item?.name || slotDef.empty;
        const stats = document.createElement('span');
        stats.className = 'inventory-focus-slot-stats';
        stats.textContent = item ? (getEquipmentFocusStats(item) || getInventoryCategoryLabel(category)) : '未装備';
        button.append(label, name, stats);
        slotGrid.appendChild(button);

        if (item) {
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'inventory-focus-slot-remove';
            removeButton.textContent = '外す';
            removeButton.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!window.myPlayFabId) return;
                await equipItem(window.myPlayFabId, null, slotDef.slot);
            });
            button.appendChild(removeButton);
        }
    });

    const quickTabs = document.createElement('div');
    quickTabs.className = 'inventory-focus-actions';
    INVENTORY_GROUPS.Equipment.tabs.forEach((tab) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `inventory-focus-chip${tab.category === activeInventoryCategory ? ' active' : ''}`;
        button.textContent = tab.label;
        button.addEventListener('click', () => {
            switchInventoryTab(tab.category);
            scrollInventoryCandidatesIntoView();
        });
        quickTabs.appendChild(button);
    });

    panel.append(slotGrid, quickTabs);
}

function renderTarotFocusPanel(panel) {
    panel.appendChild(createInventoryFocusHeader('現在のタロットデッキ', 'デッキとカード候補を同じ画面で確認できます'));
    const deckGrid = document.createElement('div');
    deckGrid.className = 'inventory-focus-deck-grid';
    [
        { label: 'タロットデッキ', deck: getCommonTarotDeck(), role: getCommonTarotRole() }
    ].forEach((deckDef) => {
        const deck = Array.isArray(deckDef.deck) ? deckDef.deck : [];
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'inventory-focus-deck';
        card.addEventListener('click', () => switchInventoryPanel('tarot', { scrollSwitcher: true }));
        const roleLabel = deckDef.role?.role?.label || '未成立';
        const cardNames = deck
            .map((itemId) => getInventoryItemByReference(itemId)?.name || '')
            .filter(Boolean)
            .slice(0, 2)
            .join(' / ');
        const labelEl = document.createElement('span');
        labelEl.textContent = deckDef.label;
        const countEl = document.createElement('strong');
        countEl.textContent = `${deck.length}/5枚`;
        const roleEl = document.createElement('em');
        roleEl.textContent = roleLabel;
        const cardsEl = document.createElement('small');
        cardsEl.textContent = cardNames || '未セット';
        card.append(labelEl, countEl, roleEl, cardsEl);
        deckGrid.appendChild(card);
    });

    const quickTabs = document.createElement('div');
    quickTabs.className = 'inventory-focus-actions';
    INVENTORY_GROUPS.Tarot.tabs.forEach((tab) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `inventory-focus-chip${tab.category === activeInventoryCategory ? ' active' : ''}`;
        button.textContent = tab.label;
        button.addEventListener('click', () => {
            switchInventoryTab(tab.category);
            scrollInventoryCandidatesIntoView();
        });
        quickTabs.appendChild(button);
    });

    const manageButton = document.createElement('button');
    manageButton.type = 'button';
    manageButton.className = 'inventory-focus-chip';
    manageButton.textContent = 'デッキ管理';
    manageButton.addEventListener('click', () => switchInventoryPanel('tarot', { scrollSwitcher: true }));
    quickTabs.appendChild(manageButton);

    panel.append(deckGrid, quickTabs);
}

function renderInventoryFocusPanel() {
    if (typeof document === 'undefined') return;
    const panel = document.getElementById('inventoryFocusPanel');
    if (!panel) return;
    panel.innerHTML = '';
    panel.hidden = activeInventoryGroup !== 'Tarot' && activeInventoryGroup !== 'All';
    if (panel.hidden) return;
    renderTarotFocusPanel(panel);
}

function getEquippedSlotsForItem(item) {
    return Object.entries(myCurrentEquipment || {})
        .filter(([slot]) => slot !== 'MajorArcana')
        .filter(([, equippedValue]) => isEquipmentReferenceMatch(item, equippedValue))
        .map(([slot]) => slot);
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
            return { label: '両手装備', tone: 'equip', run: () => equipItem(playFabId, itemId, 'RightHand') };
        }
        if (equippedSlots.includes('RightHand')) {
            return { label: '右手解除', tone: 'remove', run: () => equipItem(playFabId, null, 'RightHand') };
        }
        if (equippedSlots.includes('LeftHand')) {
            return { label: '左手解除', tone: 'remove', run: () => equipItem(playFabId, null, 'LeftHand') };
        }
        return { label: '右手装備', tone: 'equip', run: () => equipItem(playFabId, itemId, 'RightHand') };
    }
    if (canonicalCategory === 'Shield' || canonicalCategory === 'Offhand') {
        if (equippedSlots.includes('LeftHand')) {
            return { label: '左手解除', tone: 'remove', run: () => equipItem(playFabId, null, 'LeftHand') };
        }
        return { label: '左手装備', tone: 'equip', run: () => equipItem(playFabId, itemId, 'LeftHand') };
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
        if (isCardInTarotDeck(itemId)) {
            return { label: 'デッキから外す', tone: 'remove', run: () => unequipTarotCardFromDeck(playFabId, itemId, 'tarot') };
        }
        if (getCommonTarotDeck().length < 5) {
            return { label: 'デッキに追加', tone: 'equip', run: () => equipTarotCardToDeck(playFabId, itemId, 'tarot') };
        }
        const lvd = cardLevelMap[itemId];
        if (lvd && lvd.level < lvd.maxLevel) {
            return { label: `Lv↑ (${lvd.nextLevelCost}⚔)`, tone: 'levelup', run: () => levelUpCard(itemId) };
        }
        return null;
    }
    if (canonicalCategory === 'TarotMinor') {
        if (isCardInTarotDeck(itemId)) {
            return { label: 'デッキから外す', tone: 'remove', run: () => unequipTarotCardFromDeck(playFabId, itemId, 'tarot') };
        }
        const lvd = cardLevelMap[itemId];
        if (lvd && lvd.level < lvd.maxLevel) {
            return { label: `Lv↑ (${lvd.nextLevelCost}⚔)`, tone: 'levelup', run: () => levelUpCard(itemId) };
        }
        if (getCommonTarotDeck().length < 5) {
            return { label: 'デッキに追加', tone: 'equip', run: () => equipTarotCardToDeck(playFabId, itemId, 'tarot') };
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
    const inDeck = isCardInTarotDeck(itemId);
    const actions = [];

    actions.push(inDeck
        ? { label: 'デッキから外す', tone: 'remove', run: () => unequipTarotCardFromDeck(playFabId, itemId, 'tarot') }
        : { label: 'デッキに追加', tone: getCommonTarotDeck().length < 5 ? 'equip' : 'disabled', disabled: getCommonTarotDeck().length >= 5, run: () => equipTarotCardToDeck(playFabId, itemId, 'tarot') });

    const lvd = cardLevelMap[itemId];
    if (lvd && lvd.level < lvd.maxLevel) {
        actions.push({ label: `Lv↑ (${lvd.nextLevelCost}⚔)`, tone: 'levelup', run: () => levelUpCard(itemId) });
    }

    return actions;
}

function createInventoryCell(item, requestedCategory) {
    const cd = item?.customData || {};
    const canonicalCategory = getCanonicalTarotCategory(cd.Category);
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
    cell.onclick = () => showItemDetailModal(item);
    cell.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        showItemDetailModal(item);
    });
    const compareSummary = getInventoryComparisonSummary(item, canonicalCategory);
    const quickActions = getInventoryQuickActions(item, canonicalCategory);
    const quickAction = quickActions[0] || null;
    if (compareSummary?.tone) {
        cell.classList.add(`is-${compareSummary.tone}`);
    }
    if (quickAction?.tone) {
        cell.classList.add(`has-${quickAction.tone}`);
    }
    const isTarotDeckEquipped = (canonicalCategory === 'TarotMajor' || canonicalCategory === 'TarotMinor')
        && isCardInTarotDeck(item?.itemId);
    const isEquipped = isInventoryItemEquipped(item) || isTarotDeckEquipped;
    const isEquipmentEquipped = isEquipped && isInventoryEquipmentCategory(canonicalCategory);
    if (isEquipped) {
        cell.classList.add('is-equipped');
    }
    if (isEquipmentEquipped) {
        cell.classList.add('is-equipment-equipped');
    }

    const head = document.createElement('div');
    head.className = 'inventory-item-head';
    head.appendChild(createInventoryBadge(getInventoryCategoryLabel(canonicalCategory), canonicalCategory.toLowerCase()));

    const headMeta = document.createElement('div');
    headMeta.className = 'inventory-item-head-meta';
    if (isEquipmentEquipped) {
        headMeta.appendChild(createInventoryBadge('装備中', 'active'));
    }
    if (isTarotDeckEquipped) {
        headMeta.appendChild(createInventoryBadge('E', 'equipped'));
    }
    if ((Number(item?.count || 0) || 0) > 1) {
        headMeta.appendChild(createInventoryBadge(`x${item.count}`, 'count'));
    }
    head.appendChild(headMeta);
    cell.appendChild(head);

    const main = document.createElement('div');
    main.className = 'inventory-item-main';

    const iconFrame = document.createElement('div');
    iconFrame.className = 'inventory-item-icon-frame';
    const iconDiv = document.createElement('div');
    iconDiv.className = 'inventory-item-icon';
    const spriteFrame = getInventorySpriteFrame(item);
    setSpriteIcon(
        iconDiv,
        spriteFrame.path,
        spriteFrame.index,
        spriteFrame.width,
        spriteFrame.height,
        1,
        spriteFrame.category,
        window.myAvatarBaseInfo?.AvatarColor
    );
    iconFrame.appendChild(iconDiv);
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

    if (compareSummary || quickActions.length) {
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

function calculateLevelFromExp(expValue) {
    const baseExp = 100;
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

function getRankName(level, isKing) {
    if (isKing) return '王';
    if (level >= 41) return '海賊王';
    if (level >= 31) return '提督';
    if (level >= 21) return '船長';
    if (level >= 11) return '航海士';
    return '見習い';
}

function getRankTier(level, isKing) {
    if (isKing) return 'king';
    if (level >= 41) return 'pirate-king';
    if (level >= 31) return 'admiral';
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

    const data = calculateLevelFromExp(myExperience);
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
        fetchTarotDecks(playFabId, { isSilent: true })
    ]);
    if (data) {
        const contributionValue = data.contribution ?? data.experience ?? 0;
        myInventory = data.inventory;
        myVirtualCurrency = data.virtualCurrency || {};
        myExperience = Number(contributionValue || 0);
        myIsKing = !!data.isKing;
        Player.syncPointsDisplay(Number(myVirtualCurrency?.PS || 0));
        Player.syncSpecialtyDisplay(myVirtualCurrency);
        preloadAvatarBaseSprites(window.myAvatarBaseInfo);
        preloadEquipmentSprites(myCurrentEquipment, myInventory, window.myAvatarBaseInfo?.AvatarColor);
    }
    if (deckData?.ok) {
        applyTarotDeckData(deckData);
    }
    await getEquipment(playFabId);
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
    if (!force && now - lastInventoryFetchAt < 1500) {
        updateExperienceUI();
        renderTarotDeckPanels();
        return;
    }
    const [data, deckData] = await Promise.all([
        fetchInventory(playFabId),
        fetchTarotDecks(playFabId, { isSilent: true })
    ]);
    if (data) {
        const contributionValue = data.contribution ?? data.experience ?? 0;
        if (Array.isArray(data.inventory)) {
            myInventory = data.inventory;
        }
        myVirtualCurrency = data.virtualCurrency || {};
        myExperience = Number(contributionValue || 0);
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
}

export async function getEquipment(playFabId) {
    const data = await fetchEquipment(playFabId);
    if (data?.equipment) {
        myCurrentEquipment = data.equipment;
    }
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
    switchInventoryPanel('items', { preserveScroll: true });
    renderInventoryTabControls();
    updateInventorySortOptions(activeInventoryCategory);
    updateInventoryTabHint(activeInventoryCategory);
    renderInventoryGrid(activeInventoryCategory);
}

export function switchInventoryGroup(group) {
    activeInventoryGroup = INVENTORY_GROUPS[group] ? group : 'All';
    const currentGroup = getInventoryGroupForCategory(activeInventoryCategory);
    if (currentGroup !== activeInventoryGroup) {
        activeInventoryCategory = getDefaultInventoryCategory(activeInventoryGroup);
    }
    switchInventoryPanel('items', { preserveScroll: true });
    renderInventoryTabControls();
    updateInventorySortOptions(activeInventoryCategory);
    updateInventoryTabHint(activeInventoryCategory);
    renderInventoryGrid(activeInventoryCategory);
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
    renderInventoryFocusPanel();

    const displayInventory = getDisplayInventoryEntries();
    const filtered = (category === 'All')
        ? displayInventory
        : displayInventory.filter(item => matchesInventoryCategory(item.customData?.Category, category));

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
        return;
    }

    sorted.forEach(item => {
        gridEl.appendChild(createInventoryCell(item, category));
    });
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

function showItemDetailModal(item) {
    const modal = document.getElementById('itemDetailModal');
    const cd = item.customData || {};
    const instanceId = item.instances?.[0];
    const canonicalCategory = getCanonicalTarotCategory(cd.Category);
    const spriteFrame = getInventorySpriteFrame(item);
    const appendStatLine = (html) => {
        statsEl.innerHTML += `${statsEl.innerHTML ? '<br>' : ''}${html}`;
    };

    setSpriteIcon(
        document.getElementById('itemDetailIcon'),
        spriteFrame.path,
        spriteFrame.index,
        spriteFrame.width,
        spriteFrame.height,
        1,
        spriteFrame.category,
        window.myAvatarBaseInfo?.AvatarColor
    );
    document.getElementById('itemDetailName').innerText = item.name;
    document.getElementById('itemDetailCategory').innerText = getInventoryCategoryLabel(canonicalCategory);
    document.getElementById('itemDetailDescription').innerText = item.description || '説明がありません。';

    const statsEl = document.getElementById('itemDetailStats');
    statsEl.innerHTML = '';
    if (cd.Power) appendStatLine(`<span>攻撃力: <strong>${cd.Power}</strong></span>`);
    if (cd.Defense) appendStatLine(`<span>防御力: <strong>${cd.Defense}</strong></span>`);
    if (cd.Int) appendStatLine(`<span>かしこさ: <strong>${cd.Int}</strong></span>`);
    if (cd.MagicPower) appendStatLine(`<span>術補: <strong>${cd.MagicPower}</strong></span>`);
    if (cd.HealPower) appendStatLine(`<span>回復補正: <strong>${cd.HealPower}</strong></span>`);
    if (cd.CastRate) appendStatLine(`<span>詠唱補正: <strong>${cd.CastRate}</strong></span>`);
    if (cd.MpEfficiency) appendStatLine(`<span>MP効率: <strong>${cd.MpEfficiency}</strong></span>`);
    if (cd.StatusRate) appendStatLine(`<span>状態付与: <strong>${cd.StatusRate}</strong></span>`);
    if (cd.Effect) appendStatLine(`<span>効果: <strong>${cd.Effect.Type} ${cd.Effect.Amount}</strong></span>`);
    buildTarotCardMeta(cd).forEach((line) => {
        appendStatLine(`<span>${line}</span>`);
    });
    if (isTarotMajorCategory(canonicalCategory)) {
        appendStatLine(isCardInTarotDeck(item.itemId)
            ? '<span>タロットデッキ: <strong>セット中</strong></span>'
            : '<span>タロットデッキ: <strong>未セット</strong></span>');
    }
    if (isTarotMinorCategory(canonicalCategory)) {
        appendStatLine(isCardInTarotDeck(item.itemId)
            ? '<span>タロットデッキ: <strong>セット中</strong></span>'
            : '<span>タロットデッキ: <strong>未セット</strong></span>');
    }

    if (isTarotMajorCategory(canonicalCategory) || isTarotMinorCategory(canonicalCategory)) {
        const lvd = cardLevelMap[item.itemId];
        if (lvd) {
            appendStatLine(`<span>カードLv: <strong>Lv.${lvd.level} / MaxLv.${lvd.maxLevel}</strong></span>`);
            appendStatLine(`<span>重複数: <strong>${lvd.quantity}枚</strong></span>`);
            if (lvd.level < lvd.maxLevel) {
                appendStatLine(`<span>次Lvコスト: <strong>${lvd.nextLevelCost}⚔シャード</strong></span>`);
            } else {
                appendStatLine('<span>育成: <strong>MAX LV 到達</strong></span>');
            }
        }
    }

    const buttonsEl = document.getElementById('itemDetailButtons');
    buttonsEl.innerHTML = '';
    const appendActionNote = (text) => {
        buttonsEl.innerHTML += `<div class="item-detail-action-note">${text}</div>`;
    };
    const equipItemId = item.itemId;
    const isEquipped = (slot) => {
        const equippedValue = myCurrentEquipment[slot];
        return isEquipmentReferenceMatch(item, equippedValue);
    };

    if (cd.Category === 'Weapon') {
        const isTwoHanded = isTwoHandedInventoryWeapon(item);
        if (isTwoHanded) {
            if (isEquipped('RightHand')) {
                buttonsEl.innerHTML += '<button onclick="window.equipItem(null, \'RightHand\')">\u5916\u3059</button>';
            } else {
                buttonsEl.innerHTML += `<button onclick="window.equipItem('${equipItemId}', 'RightHand')">\u4e21\u624b\u88c5\u5099</button>`;
            }
        } else {
            if (isEquipped('RightHand')) {
                buttonsEl.innerHTML += '<button onclick="window.equipItem(null, \'RightHand\')">\u53f3\u624b\u3092\u5916\u3059</button>';
            } else {
                buttonsEl.innerHTML += `<button onclick="window.equipItem('${equipItemId}', 'RightHand')">${getEquipActionLabel('RightHand', '\u53f3\u624b\u88c5\u5099')}</button>`;
            }
            if (isEquipped('LeftHand')) {
                buttonsEl.innerHTML += '<button onclick="window.equipItem(null, \'LeftHand\')">\u5de6\u624b\u3092\u5916\u3059</button>';
            } else {
                buttonsEl.innerHTML += `<button onclick="window.equipItem('${equipItemId}', 'LeftHand')">${getEquipActionLabel('LeftHand', '\u5de6\u624b\u88c5\u5099')}</button>`;
            }
        }
    } else if (cd.Category === 'Shield' || cd.Category === 'Offhand') {
        if (cd.Category === 'Offhand') {
            appendActionNote('副手は左手専用です。杖や魔法寄りの装備と相性が良い補助枠です。');
        }
        if (isEquipped('LeftHand')) {
            buttonsEl.innerHTML += '<button onclick="window.equipItem(null, \'LeftHand\')">\u5de6\u624b\u3092\u5916\u3059</button>';
        } else {
            buttonsEl.innerHTML += `<button onclick="window.equipItem('${equipItemId}', 'LeftHand')">${getEquipActionLabel('LeftHand', '\u5de6\u624b\u88c5\u5099')}</button>`;
        }
    } else if (cd.Category === 'Armor') {
        if (isEquipped('Armor')) {
            buttonsEl.innerHTML += '<button onclick="window.equipItem(null, \'Armor\')">\u5916\u3059</button>';
        } else {
            buttonsEl.innerHTML += `<button onclick="window.equipItem('${equipItemId}', 'Armor')">${getEquipActionLabel('Armor', '\u88c5\u5099')}</button>`;
        }
    } else if (cd.Category === 'Accessory') {
        if (isEquipped('Accessory')) {
            buttonsEl.innerHTML += '<button onclick="window.equipItem(null, \'Accessory\')">\u5916\u3059</button>';
        } else {
            buttonsEl.innerHTML += `<button onclick="window.equipItem('${equipItemId}', 'Accessory')">${getEquipActionLabel('Accessory', '装備')}</button>`;
        }
    } else if (isTarotMajorCategory(canonicalCategory) || isTarotMinorCategory(canonicalCategory)) {
        appendActionNote('カードとしてタロットデッキに追加できます。');
        if (isCardInTarotDeck(equipItemId)) {
            buttonsEl.innerHTML += `<button onclick="window.unequipTarotCardFromDeck('${equipItemId}', 'tarot')">デッキから外す</button>`;
        } else if (getCommonTarotDeck().length < 5) {
            buttonsEl.innerHTML += `<button onclick="window.equipTarotCardToDeck('${equipItemId}', 'tarot')">デッキに追加</button>`;
        } else {
            buttonsEl.innerHTML += '<button disabled>タロットデッキ満杯</button>';
        }
    } else if (cd.Category === 'Consumable') {
        buttonsEl.innerHTML += `<button class="use-button" onclick="window.useItem('${instanceId}', '${item.itemId}')">\u4f7f\u3046</button>`;
    }

    if (isTarotMajorCategory(canonicalCategory) || isTarotMinorCategory(canonicalCategory)) {
        const lvd = cardLevelMap[equipItemId];
        if (lvd && lvd.level < lvd.maxLevel) {
            buttonsEl.innerHTML += `<button class="inventory-item-quick-action is-levelup" onclick="window.levelUpCard('${equipItemId}')">Lvアップ（${lvd.nextLevelCost}⚔）</button>`;
        }
    }

    if (cd.SellPrice > 0) {
        buttonsEl.innerHTML += `<button style="background: #a0aec0;" onclick="window.showSellConfirmationModal('${instanceId}', '${item.itemId}')">\u58f2\u5374</button>`;
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
        const item = (entry && typeof entry === 'object' && entry.customData)
            ? entry
            : myInventory.find(i => i.instances && i.instances.includes(entry))
                || myInventory.find(i => i.itemId === entry);
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
