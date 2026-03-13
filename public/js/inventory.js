// c:/Users/ikeda/my-liff-app/public/js/inventory.js

import {
    getInventory as fetchInventory,
    getEquipment as fetchEquipment,
    equipItem as requestEquipItem,
    manifestTarotCard as requestManifestTarotCard,
    studyTarotCard as requestStudyTarotCard,
    awakenMajorArcana as requestAwakenMajorArcana,
    useItem as requestUseItem,
    sellItem as requestSellItem,
    getShipResourceStorage as fetchShipResourceStorage
} from './playfabClient.js';
import { renderAvatar, preloadAvatarBaseSprites, preloadEquipmentSprites, resolveSpritePathByAvatarColor } from './avatar.js';
import * as Player from './player.js';
import { formatCurrencyLabel, getResourceSourceInfo, getResourceUsageInfo } from './config.js';
import {
    TAROT_MAJOR_SLOT,
    TAROT_MINOR_SLOTS,
    buildTarotCardMeta,
    buildTarotLoadoutEntry,
    buildTarotManifestation,
    compareTarotItems,
    getCanonicalTarotCategory,
    getTarotRankLabel,
    getTarotSpriteFrame,
    getTarotSlotLabel,
    getTarotSuitLabel,
    isTarotMajorCategory,
    isTarotManifestationData,
    isTarotMinorCategory,
    matchesInventoryCategory
} from './tarotCards.js';
import { summarizeTarotLoadoutRole } from './tarotRoles.js';

let myInventory = [];
let myCurrentEquipment = {};
let myVirtualCurrency = {};
let myExperience = 0;
let myIsKing = false;
let myTarotSkills = {};
let myTarotSkillByCard = {};
let myTarotAwakenings = {};
let myActiveTarotAwakening = null;
let activeInventoryPanel = 'loadout';
let activeInventoryGroup = 'All';
let activeInventoryCategory = 'All';
let activeManifestTargetSlot = null;
let lastInventoryFetchAt = 0;
let inventoryFetchPromise = null;
let myShipResourceStorage = {
    activeShipId: null,
    homeResources: {},
    cargoResources: {},
    cargoCapacity: 0,
    cargoUsed: 0
};

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
    Consumable: { label: '消耗品', category: 'Consumable', tabs: [] },
    Resource: { label: '資源', category: 'Resource', tabs: [] }
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
        { value: 'default', label: '札順' },
        { value: 'awakening_desc', label: '覚醒順' }
    ],
    TarotMinor: [
        { value: 'default', label: '札順' },
        { value: 'skill_level_desc', label: '術Lv順' }
    ],
    Consumable: [
        { value: 'default', label: 'おすすめ順' },
        { value: 'count_desc', label: '所持数順' }
    ],
    Resource: []
};

export function getActiveInventoryCategory() {
    return activeInventoryCategory;
}

function normalizeManifestTargetSlot(slot) {
    const normalized = String(slot || '').trim();
    if (!normalized) return null;
    if (normalized === 'Armor' || normalized === 'RightHand' || normalized === 'LeftHand' || normalized === 'Accessory') {
        return normalized;
    }
    if (normalized === 'armor') return 'Armor';
    if (normalized === 'rightHand') return 'RightHand';
    if (normalized === 'leftHand') return 'LeftHand';
    if (normalized === 'accessory') return 'Accessory';
    return null;
}

function getManifestTargetSlot() {
    return normalizeManifestTargetSlot(activeManifestTargetSlot);
}

export function setInventoryManifestTargetSlot(slot, options = {}) {
    activeManifestTargetSlot = normalizeManifestTargetSlot(slot);
    if (options.refresh && activeInventoryCategory === 'TarotMinor') {
        updateInventoryTabHint(activeInventoryCategory);
        renderInventoryGrid(activeInventoryCategory);
    }
}

function getInventoryGroupForCategory(category) {
    if (['Weapon', 'Shield', 'Offhand', 'Armor', 'Accessory'].includes(category)) return 'Equipment';
    if (['TarotMajor', 'TarotMinor'].includes(category)) return 'Tarot';
    if (category === 'Consumable') return 'Consumable';
    if (category === 'Resource') return 'Resource';
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
    return ['loadout', 'stats', 'items'].includes(panel) ? panel : 'loadout';
}

export function switchInventoryPanel(panel, options = {}) {
    if (typeof document === 'undefined') return;
    activeInventoryPanel = normalizeInventoryPanel(panel);
    document.querySelectorAll('.inventory-panel-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.panel === activeInventoryPanel);
    });
    document.querySelectorAll('#tabContentInventory .inventory-section').forEach((section) => {
        section.classList.toggle('active', section.dataset.panel === activeInventoryPanel);
    });
    const tabContent = document.getElementById('tabContentInventory');
    if (tabContent) {
        tabContent.dataset.inventoryPanel = activeInventoryPanel;
    }
    if (options.preserveScroll) return;
    const switcher = document.getElementById('inventoryMobileSwitch');
    if (switcher) {
        switcher.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
}

function getInventoryItemByReference(itemRef) {
    if (!itemRef) return null;
    if (itemRef && typeof itemRef === 'object' && itemRef.customData) return itemRef;
    return myInventory.find((inventoryItem) => inventoryItem.instances?.includes(itemRef))
        || myInventory.find((inventoryItem) => inventoryItem.itemId === itemRef)
        || null;
}

function isManifestationEntry(entry) {
    return !!(entry && typeof entry === 'object' && isTarotManifestationData(entry.customData));
}

function getTarotSkillStateForItem(itemId) {
    const key = String(itemId || '').trim();
    if (!key) return null;
    return myTarotSkillByCard?.[key] || null;
}

function getMajorAwakeningLevel(itemId) {
    const key = String(itemId || '').trim();
    if (!key) return 0;
    return Number(myTarotAwakenings?.[key] || 0) || 0;
}

function getTarotStudyActionLabel(itemId) {
    const skill = getTarotSkillStateForItem(itemId);
    if (!skill) return 'この札で術を習得';
    if ((Number(skill.level || 0) || 0) >= (Number(skill.maxLevel || 5) || 5)) return 'この札は最大まで修めた';
    return `この札で術を強化 Lv${skill.level}→${Math.min((Number(skill.maxLevel || 5) || 5), (Number(skill.level || 0) || 0) + 1)}`;
}

function normalizeTarotSkillWeapon(value) {
    const key = String(value || '').trim().toLowerCase();
    if (!key) return '';
    if (key === 'wand') return 'staff';
    if (key === 'spear') return 'polearm';
    if (['book', 'orb', 'catalyst', 'relic', 'tome'].includes(key)) return 'staff';
    return key;
}

function resolveBattleWeaponType(item) {
    const itemData = item?.customData || item || {};
    const manifestWeapon = String(itemData?.ManifestWeaponType || itemData?.ManifestedWeaponType || '').trim().toLowerCase();
    if (manifestWeapon) return normalizeTarotSkillWeapon(manifestWeapon);
    const itemId = String(item?.itemId || itemData?.ItemId || '').trim().toLowerCase();
    const category = String(itemData?.Category || '').trim();
    if (category === 'Shield') return 'shield';
    if (category === 'Weapon') {
        if (itemId.includes('staff') || itemId.includes('wand')) return 'staff';
        if (itemId.includes('polearm') || itemId.includes('spear')) return 'polearm';
        if (itemId.includes('dagger') || itemId.includes('knife')) return 'dagger';
        if (itemId.includes('sword')) return 'sword';
        if (itemId.includes('axe')) return 'axe';
        if (itemId.includes('blunt') || itemId.includes('mace') || itemId.includes('hammer') || itemId.includes('club')) return 'blunt';
        if (itemId.includes('gun') || itemId.includes('bow') || itemId.includes('rifle')) return 'gun';
    }
    return '';
}

function getCurrentBattleWeaponTypes() {
    const types = new Set();
    ['RightHand', 'LeftHand'].forEach((slot) => {
        const item = getInventoryItemByReference(myCurrentEquipment?.[slot]);
        const type = resolveBattleWeaponType(item);
        if (type) types.add(type);
    });
    return types;
}

function isTarotSkillUsableNow(skill, equippedTypes = getCurrentBattleWeaponTypes()) {
    if (!skill || typeof skill !== 'object') return false;
    const type = String(skill.type || skill.skillType || '').trim().toLowerCase();
    const requiredWeapon = normalizeTarotSkillWeapon(skill.weapon || skill.skillWeapon || skill.requiredWeapon || '');
    if (!requiredWeapon) return type !== 'magic' || equippedTypes.has('staff');
    return equippedTypes.has(requiredWeapon);
}

function getTarotSkillRequirementLabel(skill) {
    const requiredWeapon = normalizeTarotSkillWeapon(skill?.weapon || skill?.skillWeapon || skill?.requiredWeapon || '');
    if (!requiredWeapon) return '装備条件なし';
    if (requiredWeapon === 'staff') return '杖で発動';
    if (requiredWeapon === 'shield') return '盾で有効';
    if (requiredWeapon === 'polearm') return '槍で発動';
    if (requiredWeapon === 'dagger') return '短剣で発動';
    if (requiredWeapon === 'blunt') return '打撃で発動';
    if (requiredWeapon === 'gun') return '銃で発動';
    return `${requiredWeapon}で発動`;
}

function getTarotSkillEffectLabel(skill) {
    const type = String(skill?.type || skill?.skillType || '').trim().toLowerCase();
    if (type === 'magic') {
        const kind = String(skill?.magicKind || 'attack').trim().toLowerCase();
        const mpCost = Number(skill?.mpCost || 0) || 0;
        const powerRate = Math.max(0, Math.round(((Number(skill?.powerMultiplier || 1) || 1) - 1) * 100));
        if (kind === 'heal') {
            const healBelow = Math.round((Number(skill?.healBelow || 0) || 0) * 100);
            return `MP${mpCost} / 回復 ${powerRate}% / HP${healBelow}%以下`;
        }
        const minRange = Number(skill?.minRange || 1) || 1;
        const maxRange = Number(skill?.maxRange || minRange) || minRange;
        return `MP${mpCost} / 威力 ${powerRate}% / 射程${minRange}-${maxRange}`;
    }
    if (type === 'weapon') {
        const proc = Math.round((Number(skill?.procChance || 0) || 0) * 100);
        const powerRate = Math.max(0, Math.round(((Number(skill?.powerMultiplier || 1) || 1) - 1) * 100));
        return `発動 ${proc}% / 威力 ${powerRate}%`;
    }
    const bonusRate = Math.max(0, Math.round(((Number(skill?.powerMultiplier || 1) || 1) - 1) * 100));
    return `常在補正 ${bonusRate}%`;
}

function renderTarotProgressPanels() {
    const awakeningEl = document.getElementById('activeTarotAwakeningPanel');
    if (awakeningEl) {
        const awakening = myActiveTarotAwakening;
        if (!awakening?.itemId) {
            awakeningEl.innerHTML = `
                <div class="tarot-combat-card-label">装備中の大アルカナ効果</div>
                <div class="tarot-combat-card-title">未装着</div>
                <div class="tarot-combat-card-body">体に大アルカナを装備すると、覚醒段階に応じた常在効果が反映されます。</div>
            `;
        } else {
            const detailLines = Array.isArray(awakening.detailLines) && awakening.detailLines.length
                ? awakening.detailLines.map((line) => `<div class="tarot-awakening-line">${line}</div>`).join('')
                : '<div class="tarot-awakening-line">現在の覚醒効果はありません。</div>';
            awakeningEl.innerHTML = `
                <div class="tarot-combat-card-label">装備中の大アルカナ効果</div>
                <div class="tarot-combat-card-title">${awakening.name}</div>
                <div class="tarot-combat-card-body">${awakening.summary || '装備者に常在効果を与えます。'}</div>
                <div class="tarot-awakening-level">覚醒 Lv${Number(awakening.level || 0) || 0} / ${Number(awakening.maxLevel || 5) || 5}</div>
                <div class="tarot-awakening-lines">${detailLines}</div>
            `;
        }
    }

    const skillsEl = document.getElementById('tarotSkillListPanel');
    if (!skillsEl) return;
    const skills = Object.values(myTarotSkills || {}).sort((left, right) => {
        const typeOrder = { passive: 1, weapon: 2, magic: 3 };
        const diff = (typeOrder[String(left?.type || '').trim().toLowerCase()] || 99)
            - (typeOrder[String(right?.type || '').trim().toLowerCase()] || 99);
        if (diff !== 0) return diff;
        const levelDiff = (Number(right?.level || 0) || 0) - (Number(left?.level || 0) || 0);
        if (levelDiff !== 0) return levelDiff;
        return String(left?.name || '').localeCompare(String(right?.name || ''), 'ja');
    });
    if (!skills.length) {
        skillsEl.innerHTML = `
            <div class="tarot-combat-card-label">習得済みの術</div>
            <div class="tarot-combat-card-title">未習得</div>
            <div class="tarot-combat-card-body">小アルカナから習得した術がここに並びます。現在の装備で使える術は強調表示されます。</div>
        `;
        return;
    }
    const equippedTypes = getCurrentBattleWeaponTypes();
    const usableCount = skills.filter((skill) => isTarotSkillUsableNow(skill, equippedTypes)).length;
    const renderedSkills = skills.map((skill) => {
        const isUsable = isTarotSkillUsableNow(skill, equippedTypes);
        const typeLabel = String(skill?.skillTypeLabel || skill?.type || '術').trim();
        return `
            <div class="tarot-skill-entry ${isUsable ? 'is-usable' : 'is-waiting'}">
                <div class="tarot-skill-entry-head">
                    <div class="tarot-skill-entry-name">${skill.name || '術'}</div>
                    <div class="tarot-skill-entry-level">Lv${Number(skill.level || 0) || 0}</div>
                </div>
                <div class="tarot-skill-entry-meta">
                    <span>${typeLabel}</span>
                    <span>${getTarotSkillRequirementLabel(skill)}</span>
                    <span class="is-status">${isUsable ? '現在使用可' : '装備待ち'}</span>
                </div>
                <div class="tarot-skill-entry-body">${getTarotSkillEffectLabel(skill)}</div>
            </div>
        `;
    }).join('');
    skillsEl.innerHTML = `
        <div class="tarot-combat-card-label">習得済みの術</div>
        <div class="tarot-combat-card-title">現在使える術 ${usableCount} / ${skills.length}</div>
        <div class="tarot-skill-summary">
            <div class="tarot-skill-summary-chip">右手 / 左手: ${Array.from(equippedTypes).join(' / ') || 'なし'}</div>
            <div class="tarot-skill-summary-chip">使用可: ${usableCount}</div>
        </div>
        <div class="tarot-skill-list">${renderedSkills}</div>
    `;
}

function getInventoryTabHint(category) {
    if (['All', 'Weapon', 'Shield', 'Armor', 'Consumable'].includes(category)) {
        return '';
    }
    if (category === 'Resource') {
        return '船倉と倉庫の資源をまとめて確認できます。必要ならここから一括預け入れや補充を行います。';
    }
    if (category === 'TarotMajor') {
        return '体は必須です。大アルカナは外せませんが、別の大アルカナに変更できます。';
    }
    if (category === 'TarotMinor') {
        const targetSlot = getManifestTargetSlot();
        if (targetSlot) {
            return `${getTarotSlotLabel(targetSlot)}に具現化する小アルカナを選んでください。具現化するとカードを1枚消費します。`;
        }
        return '小アルカナは頭・右手・左手・アクセサリーへ具現化します。具現化するとカードを1枚消費します。';
    }
    if (category === 'Accessory') {
        return 'アクセサリーは通常装備としても使えます。小アルカナのアクセサリー具現とは別の入手手段です。';
    }
    if (category === 'Offhand') {
        return '副手は左手に装備します。魔導書やオーブなど、盾とは別系統の補助装備です。';
    }
    return '大アルカナで体を切り替え、小アルカナで4部位を具現化します。';
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
    sortEl.disabled = category === 'Resource';
    sortEl.style.visibility = category === 'Resource' ? 'hidden' : 'visible';
}

function getEmptyInventoryMessage(category) {
    if (category === 'Resource') {
        return '表示できる資源がありません。';
    }
    if (category === 'TarotMajor') {
        return '大アルカナはまだありません。初期の体は国に応じて自動で装着されます。';
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
    if (canonicalCategory === 'Resource') return '資源';
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
    const instanceId = item?.instances?.[0];
    const itemId = item?.itemId;
    return Object.values(myCurrentEquipment || {}).some((equippedValue) => equippedValue === instanceId || equippedValue === itemId);
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
        const parts = [String(cd.ArcanaRole || '').trim(), `宿り ${getTarotSuitLabel(cd)}`.trim()].filter(Boolean);
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
    if (isTarotManifestationData(cd)) {
        const parts = [String(cd.MajorArcanaName || '').trim(), String(cd.ArcanaSuitLabel || '').trim()].filter(Boolean);
        return parts.join(' / ');
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
        const awakeningLevel = getMajorAwakeningLevel(item.itemId);
        if (awakeningLevel > 0) chips.push(`覚醒Lv${awakeningLevel}`);
        const passive = String(cd.PassiveName || cd.ArcanaPassive || '').trim();
        if (passive) chips.push(passive);
        return chips.slice(0, 3);
    }
    if (canonicalCategory === 'TarotMinor') {
        const learnedSkill = getTarotSkillStateForItem(item.itemId);
        if (learnedSkill) {
            chips.push(`術Lv${learnedSkill.level}`);
            chips.push(isTarotSkillUsableNow(learnedSkill) ? '発動可' : '装備待ち');
        } else {
            chips.push('未習得');
        }
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
        if (myActiveTarotAwakening?.itemId === item?.itemId) {
            return myActiveTarotAwakening.summary || '装着中の加護が有効です。';
        }
        return String(cd.ArcanaRole || '').trim();
    }
    if (canonicalCategory === 'TarotMinor') {
        const learnedSkill = getTarotSkillStateForItem(item?.itemId);
        if (learnedSkill) {
            return learnedSkill.name || getTarotSkillRequirementLabel(learnedSkill);
        }
        return '1枚で術を習得';
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

function getEquippedSlotsForItem(item) {
    const instanceId = item?.instances?.[0];
    const itemId = item?.itemId;
    return Object.entries(myCurrentEquipment || {})
        .filter(([, equippedValue]) => equippedValue === instanceId || equippedValue === itemId)
        .map(([slot]) => slot);
}

function isTwoHandedWeapon(item) {
    const cd = item?.customData || {};
    return getCanonicalTarotCategory(cd.Category) === 'Weapon'
        && (Number(cd.sprite_w || 0) > 32 || Number(cd.sprite_h || 0) > 32);
}

function getPreferredManifestSlot() {
    const targetSlot = getManifestTargetSlot();
    if (targetSlot) return targetSlot;
    return TAROT_MINOR_SLOTS.find((slot) => !myCurrentEquipment?.[slot]) || null;
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
    let slot = null;
    if (canonicalCategory === 'Weapon') slot = 'RightHand';
    if (canonicalCategory === 'Shield' || canonicalCategory === 'Offhand') slot = 'LeftHand';
    if (canonicalCategory === 'Armor') slot = 'Armor';
    if (canonicalCategory === 'Accessory') slot = 'Accessory';
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
        const isCurrentMajor = String(myCurrentEquipment?.[TAROT_MAJOR_SLOT] || '').trim() === String(itemId || '').trim();
        const awakeningLevel = getMajorAwakeningLevel(itemId);
        if (isCurrentMajor && (Number(item?.count || 0) || 0) > 1 && awakeningLevel < 5) {
            return { label: '覚醒+1', tone: 'awaken', run: () => awakenMajorArcana(playFabId, itemId) };
        }
        if (!isCurrentMajor) {
            return { label: '体変更', tone: 'equip', run: () => equipItem(playFabId, itemId, TAROT_MAJOR_SLOT) };
        }
        return null;
    }
    if (canonicalCategory === 'TarotMinor') {
        const learnedSkill = getTarotSkillStateForItem(itemId);
        const maxLevel = Number(learnedSkill?.maxLevel || 5) || 5;
        const preferredSlot = getPreferredManifestSlot();
        if (preferredSlot) {
            const hasCurrentManifest = !!myCurrentEquipment?.[preferredSlot];
            const actionLabel = hasCurrentManifest
                ? `${getTarotSlotLabel(preferredSlot)}上書き`
                : `${getTarotSlotLabel(preferredSlot)}具現`;
            return { label: actionLabel, tone: 'manifest', run: () => manifestTarotCard(playFabId, itemId, preferredSlot) };
        }
        if (!learnedSkill || (Number(learnedSkill.level || 0) || 0) < maxLevel) {
            return { label: learnedSkill ? '術強化' : '術化', tone: 'study', run: () => studyTarotCard(playFabId, itemId) };
        }
        return null;
    }
    if (canonicalCategory === 'Consumable' && instanceId) {
        return { label: '使う', tone: 'use', run: () => useItem(playFabId, instanceId, itemId) };
    }
    return null;
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
    cell.onclick = () => showItemDetailModal(item);
    const compareSummary = getInventoryComparisonSummary(item, canonicalCategory);
    const quickAction = getInventoryQuickAction(item, canonicalCategory);
    if (compareSummary?.tone) {
        cell.classList.add(`is-${compareSummary.tone}`);
    }
    if (quickAction?.tone) {
        cell.classList.add(`has-${quickAction.tone}`);
    }
    if (isInventoryItemEquipped(item)) {
        cell.classList.add('is-equipped');
    }

    const head = document.createElement('div');
    head.className = 'inventory-item-head';
    head.appendChild(createInventoryBadge(getInventoryCategoryLabel(canonicalCategory), canonicalCategory.toLowerCase()));

    const headMeta = document.createElement('div');
    headMeta.className = 'inventory-item-head-meta';
    const isEquipped = isInventoryItemEquipped(item);
    if (canonicalCategory === 'TarotMajor' && String(myCurrentEquipment?.[TAROT_MAJOR_SLOT] || '').trim() === String(item.itemId || '').trim()) {
        headMeta.appendChild(createInventoryBadge('体', 'active'));
    } else if (isEquipped) {
        headMeta.appendChild(createInventoryBadge('装備中', 'active'));
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

    main.appendChild(copy);
    cell.appendChild(main);

    if (compareSummary || quickAction) {
        const tail = document.createElement('div');
        tail.className = 'inventory-item-tail';
        if (compareSummary) {
            const compareEl = document.createElement('div');
            compareEl.className = `inventory-item-compare is-${compareSummary.tone || 'flat'}`;
            compareEl.textContent = compareSummary.text;
            tail.appendChild(compareEl);
        }
        if (quickAction) {
            const actionButton = document.createElement('button');
            actionButton.type = 'button';
            actionButton.className = `inventory-item-quick-action is-${quickAction.tone || 'default'}`;
            actionButton.textContent = quickAction.label;
            actionButton.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await quickAction.run();
            });
            tail.appendChild(actionButton);
        }
        cell.appendChild(tail);
    }

    return cell;
}

function getManifestationOverwriteSlots(slot, itemId) {
    const targets = [];
    const normalizedSlot = String(slot || '').trim();
    if (isManifestationEntry(myCurrentEquipment?.[normalizedSlot])) {
        targets.push(getTarotSlotLabel(normalizedSlot));
    }
    const nextItem = getInventoryItemByReference(itemId);
    const cd = nextItem?.customData || {};
    const isTwoHanded = normalizedSlot === 'RightHand'
        && !isTarotMajorCategory(cd.Category)
        && !isTarotMinorCategory(cd.Category)
        && (Number(cd.sprite_w || 0) > 32 || Number(cd.sprite_h || 0) > 32);
    if (isTwoHanded && isManifestationEntry(myCurrentEquipment?.LeftHand)) {
        targets.push(getTarotSlotLabel('LeftHand'));
    }
    return [...new Set(targets)];
}

function getEquipActionLabel(slot, defaultLabel) {
    return isManifestationEntry(myCurrentEquipment?.[slot])
        ? `${getTarotSlotLabel(slot)}を上書き装備`
        : defaultLabel;
}

export function getMyInventory() {
    return myInventory;
}

export function getMyCurrentEquipment() {
    return myCurrentEquipment;
}

function renderResourceSummary() {
    const container = document.getElementById('resourceSummaryRows');
    if (!container) return;

    const mapping = ['RR', 'RG', 'RY', 'RB', 'RT', 'RS'];
    const renderChipList = (resources) => mapping.map(code => {
        const value = Number(resources?.[code] || 0);
        const usage = getResourceUsageInfo(code);
        const source = getResourceSourceInfo(code);
        return `
            <div class="resource-chip" title="${usage.detail} / ${source}">
                <span class="resource-chip-main">${formatCurrencyLabel(code)}<b>${value}</b></span>
                <span class="resource-chip-meta">${usage.short}</span>
            </div>
        `;
    }).join('');

    const shipSubtitle = myShipResourceStorage?.activeShipId
        ? `船倉 ${Number(myShipResourceStorage?.cargoUsed || 0)}/${Number(myShipResourceStorage?.cargoCapacity || 0)}`
        : '船倉（アクティブ船なし）';
    const hasActiveShip = !!myShipResourceStorage?.activeShipId;

    container.innerHTML = `
        <div class="resource-summary-section">
            <div class="resource-summary-subtitle">${shipSubtitle}</div>
            <div class="resource-summary-grid">${renderChipList(myShipResourceStorage?.cargoResources || {})}</div>
        </div>
        <div class="resource-summary-section">
            <div class="resource-summary-subtitle">倉庫</div>
            <div class="resource-summary-grid">${renderChipList(myVirtualCurrency || {})}</div>
        </div>
        <div class="resource-summary-actions">
            <button type="button" class="resource-summary-btn" id="btnResourceDepositAll" ${hasActiveShip ? '' : 'disabled'}>全部預ける</button>
            <button type="button" class="resource-summary-btn" id="btnResourceApplyPreset" ${hasActiveShip ? '' : 'disabled'}>マイセット補充</button>
        </div>
    `;

    const depositBtn = container.querySelector('#btnResourceDepositAll');
    if (depositBtn) {
        depositBtn.addEventListener('click', handleDepositAllResourcesClick);
    }
    const presetBtn = container.querySelector('#btnResourceApplyPreset');
    if (presetBtn) {
        presetBtn.addEventListener('click', handleApplyResourcePresetClick);
    }
}

function normalizeResourceSummaryMap(resourceMap) {
    const mapping = ['RR', 'RG', 'RY', 'RB', 'RT', 'RS'];
    const normalized = {};
    mapping.forEach((code) => {
        normalized[code] = Math.max(0, Math.trunc(Number(resourceMap?.[code] || 0)));
    });
    return normalized;
}

async function syncShipResourceSummary(playFabId) {
    if (!playFabId) {
        myShipResourceStorage = {
            activeShipId: null,
            homeResources: normalizeResourceSummaryMap(myVirtualCurrency),
            cargoResources: normalizeResourceSummaryMap({}),
            cargoCapacity: 0,
            cargoUsed: 0
        };
        return;
    }
    const data = await fetchShipResourceStorage(playFabId, { isSilent: true });
    if (!data?.success) {
        return;
    }
    myShipResourceStorage = {
        activeShipId: data.activeShipId || null,
        homeResources: normalizeResourceSummaryMap(data.homeResources),
        cargoResources: normalizeResourceSummaryMap(data.cargoResources),
        cargoCapacity: Math.max(0, Math.trunc(Number(data.cargoCapacity || 0))),
        cargoUsed: Math.max(0, Math.trunc(Number(data.cargoUsed || 0)))
    };
    myVirtualCurrency = { ...myVirtualCurrency, ...normalizeResourceSummaryMap(data.homeResources) };
}

function applyShipResourceSummaryResponse(data) {
    if (!data) return;
    myShipResourceStorage = {
        activeShipId: data.activeShipId || data.shipId || myShipResourceStorage?.activeShipId || null,
        homeResources: normalizeResourceSummaryMap(data.homeResources),
        cargoResources: normalizeResourceSummaryMap(data.cargoResources),
        cargoCapacity: Math.max(0, Math.trunc(Number(data.cargoCapacity || myShipResourceStorage?.cargoCapacity || 0))),
        cargoUsed: Math.max(0, Math.trunc(Number(data.cargoUsed || 0)))
    };
    myVirtualCurrency = { ...myVirtualCurrency, ...normalizeResourceSummaryMap(data.homeResources) };
}

async function handleDepositAllResourcesClick() {
    const playFabId = window.myPlayFabId || null;
    if (!playFabId || !myShipResourceStorage?.activeShipId) return;
    const cargoUsed = Number(myShipResourceStorage?.cargoUsed || 0);
    if (cargoUsed <= 0) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('船倉に預ける資源がありません。');
        }
        return;
    }
    const data = await depositShipResources(playFabId, myShipResourceStorage.activeShipId);
    if (!data?.success) return;
    applyShipResourceSummaryResponse(data);
    renderResourceSummary();
    if (typeof window.showRpgMessage === 'function') {
        window.showRpgMessage('船倉の資源を倉庫へ預けました。');
    }
}

async function handleApplyResourcePresetClick() {
    const playFabId = window.myPlayFabId || null;
    if (!playFabId || !myShipResourceStorage?.activeShipId) return;
    const data = await applyShipResourcePreset(playFabId, myShipResourceStorage.activeShipId);
    if (!data?.success) return;
    applyShipResourceSummaryResponse(data);
    renderResourceSummary();
    const movedTotal = Object.values(data.transferred || {}).reduce((sum, value) => sum + (Number(value || 0) || 0), 0);
    if (typeof window.showRpgMessage === 'function') {
        window.showRpgMessage(movedTotal > 0 ? 'マイセットぶんを船倉へ補充しました。' : '補充できる資源がありませんでした。');
    }
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

function updateExperienceUI() {
    const rankEl = document.getElementById('homeExpRank');
    const progressEl = document.getElementById('homeExpProgress');
    const neededEl = document.getElementById('homeExpNeeded');
    const fillEl = document.getElementById('homeExpFill');
    if (!rankEl || !progressEl || !neededEl || !fillEl) return;

    const data = calculateLevelFromExp(myExperience);
    const ratio = data.expNeeded > 0 ? Math.min(1, data.expInto / data.expNeeded) : 0;
    const rankName = getRankName(data.level, myIsKing);

    rankEl.textContent = rankName;
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
    const data = await fetchInventory(playFabId);
    if (data) {
        const contributionValue = data.contribution ?? data.experience ?? 0;
        myInventory = data.inventory;
        myVirtualCurrency = data.virtualCurrency || {};
        myExperience = Number(contributionValue || 0);
        myIsKing = !!data.isKing;
        myTarotSkills = data.tarotSkills || {};
        myTarotSkillByCard = data.tarotSkillByCard || {};
        myTarotAwakenings = data.tarotAwakenings || {};
        myActiveTarotAwakening = data.activeTarotAwakening || null;
        Player.syncPointsDisplay(Number(myVirtualCurrency?.PS || 0));
        preloadAvatarBaseSprites(window.myAvatarBaseInfo);
        preloadEquipmentSprites(myCurrentEquipment, myInventory, window.myAvatarBaseInfo?.AvatarColor);
    }
    await syncShipResourceSummary(playFabId);
    await getEquipment(playFabId);
    renderInventoryTabControls();
    updateInventorySortOptions(getActiveInventoryCategory());
    renderInventoryGrid(getActiveInventoryCategory());
    renderResourceSummary();
    updateExperienceUI();
    renderTarotProgressPanels();
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
        await syncShipResourceSummary(playFabId);
        renderResourceSummary();
        updateExperienceUI();
        renderTarotProgressPanels();
        return;
    }
    const data = await fetchInventory(playFabId);
    if (data) {
        const contributionValue = data.contribution ?? data.experience ?? 0;
        if (Array.isArray(data.inventory)) {
            myInventory = data.inventory;
        }
        myVirtualCurrency = data.virtualCurrency || {};
        myExperience = Number(contributionValue || 0);
        myIsKing = !!data.isKing;
        myTarotSkills = data.tarotSkills || {};
        myTarotSkillByCard = data.tarotSkillByCard || {};
        myTarotAwakenings = data.tarotAwakenings || {};
        myActiveTarotAwakening = data.activeTarotAwakening || null;
        Player.syncPointsDisplay(Number(myVirtualCurrency?.PS || 0));
        await syncShipResourceSummary(playFabId);
        preloadAvatarBaseSprites(window.myAvatarBaseInfo);
        preloadEquipmentSprites(myCurrentEquipment, myInventory, window.myAvatarBaseInfo?.AvatarColor);
        renderInventoryTabControls();
        updateInventorySortOptions(getActiveInventoryCategory());
        renderResourceSummary();
        updateExperienceUI();
        if (Array.isArray(data.inventory)) {
            renderAvatar('avatar', window.myAvatarBaseInfo, myCurrentEquipment, myInventory, false);
            renderAvatar('home-avatar', window.myAvatarBaseInfo, myCurrentEquipment, myInventory, false);
            updateEquipmentBonusDisplay();
            renderTarotProgressPanels();
        }
        lastInventoryFetchAt = Date.now();
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
    const overwriteSlots = getManifestationOverwriteSlots(slot, itemId);
    if (overwriteSlots.length > 0) {
        const actionLabel = itemId ? '上書きされます' : '失われます';
        const confirmText = `${overwriteSlots.join(' / ')}の具現化装備は${actionLabel}。\n続けますか？`;
        if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(confirmText)) {
            return;
        }
    }
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

export async function manifestTarotCard(playFabId, itemId, slot) {
    const slotLabel = getTarotSlotLabel(slot);
    const hasCurrentEquipment = !!myCurrentEquipment?.[slot];
    const confirmText = hasCurrentEquipment
        ? `${slotLabel}の現在の装備を上書きして具現化します。\nカードは1枚消失します。実行しますか？`
        : `${slotLabel}に具現化します。\nカードは1枚消失します。実行しますか？`;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(confirmText)) {
        return;
    }

    const data = await requestManifestTarotCard(playFabId, itemId, slot);
    if (data !== null) {
        setInventoryManifestTargetSlot(null);
        await getInventory(playFabId, { force: true });
        const modal = document.getElementById('itemDetailModal');
        if (modal) {
            closeItemDetailModal();
        }
        if (typeof window.showRpgMessage === 'function') {
            const title = data?.manifestation?.name || `${slotLabel}の具現化`;
            window.showRpgMessage(`${title} を具現化した。`);
        }
    }
}

export async function studyTarotCard(playFabId, itemId) {
    const skill = getTarotSkillStateForItem(itemId);
    const actionText = skill
        ? `${skill.name} を Lv${skill.level} から強化します。\nカードは1枚消失します。実行しますか？`
        : 'この小アルカナを消費して術を習得します。\nカードは1枚消失します。実行しますか？';
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(actionText)) {
        return;
    }
    const data = await requestStudyTarotCard(playFabId, itemId);
    if (data !== null) {
        await getInventory(playFabId, { force: true });
        const modal = document.getElementById('itemDetailModal');
        if (modal) {
            closeItemDetailModal();
        }
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage(data?.message || '術を修めた。');
        }
    }
}

export async function awakenMajorArcana(playFabId, itemId) {
    const currentLevel = getMajorAwakeningLevel(itemId);
    const confirmText = currentLevel > 0
        ? `この大アルカナを1枚消費して覚醒 Lv${currentLevel} を Lv${currentLevel + 1} にします。\n実行しますか？`
        : 'この大アルカナを1枚消費して覚醒を始めます。\n実行しますか？';
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(confirmText)) {
        return;
    }
    const data = await requestAwakenMajorArcana(playFabId, itemId);
    if (data !== null) {
        await getInventory(playFabId, { force: true });
        const modal = document.getElementById('itemDetailModal');
        if (modal) {
            closeItemDetailModal();
        }
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage(data?.message || '大アルカナが覚醒した。');
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
    switchInventoryPanel('items', { preserveScroll: true });
    activeInventoryCategory = category || 'All';
    activeInventoryGroup = getInventoryGroupForCategory(activeInventoryCategory);
    if (activeInventoryCategory !== 'TarotMinor') {
        setInventoryManifestTargetSlot(null);
    }
    renderInventoryTabControls();
    updateInventorySortOptions(activeInventoryCategory);
    updateInventoryTabHint(activeInventoryCategory);
    renderInventoryGrid(activeInventoryCategory);
}

export function switchInventoryGroup(group) {
    switchInventoryPanel('items', { preserveScroll: true });
    activeInventoryGroup = INVENTORY_GROUPS[group] ? group : 'All';
    const currentGroup = getInventoryGroupForCategory(activeInventoryCategory);
    if (currentGroup !== activeInventoryGroup) {
        activeInventoryCategory = getDefaultInventoryCategory(activeInventoryGroup);
    }
    if (activeInventoryCategory !== 'TarotMinor') {
        setInventoryManifestTargetSlot(null);
    }
    renderInventoryTabControls();
    updateInventorySortOptions(activeInventoryCategory);
    updateInventoryTabHint(activeInventoryCategory);
    renderInventoryGrid(activeInventoryCategory);
}

export function renderInventoryGrid(category) {
    const gridEl = document.getElementById('inventoryGrid');
    const resourceSummaryEl = document.getElementById('resourceSummary');
    const sortEl = document.getElementById('inventorySort');
    const isResourceCategory = category === 'Resource';
    const layout = getInventoryLayout(category);

    gridEl.innerHTML = '';
    gridEl.dataset.layout = layout;
    gridEl.dataset.category = category || 'All';
    updateInventorySortOptions(category);
    if (resourceSummaryEl) {
        resourceSummaryEl.style.display = isResourceCategory ? 'block' : 'none';
    }

    if (isResourceCategory) {
        return;
    }

    const filtered = (category === 'All')
        ? myInventory
        : myInventory.filter(item => matchesInventoryCategory(item.customData?.Category, category));

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
        if (sortOrder === 'awakening_desc') {
            const diff = getMajorAwakeningLevel(b.itemId) - getMajorAwakeningLevel(a.itemId);
            if (diff !== 0) return diff;
            return compareInventoryItemsDefault(a, b, category);
        }
        if (sortOrder === 'skill_level_desc') {
            const leftSkill = getTarotSkillStateForItem(a.itemId);
            const rightSkill = getTarotSkillStateForItem(b.itemId);
            const diff = (Number(rightSkill?.level || 0) || 0) - (Number(leftSkill?.level || 0) || 0);
            if (diff !== 0) return diff;
            const usableDiff = Number(isTarotSkillUsableNow(rightSkill)) - Number(isTarotSkillUsableNow(leftSkill));
            if (usableDiff !== 0) return usableDiff;
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
        const instanceId = item.instances?.[0];
        if (!instanceId) return;
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
    return {
        path: cd.sprite_path,
        index: parseInt(cd.sprite_index, 10) || 0,
        width: parseInt(cd.sprite_w, 10) || 32,
        height: parseInt(cd.sprite_h, 10) || 32,
        category: cd.Category
    };
}

function showItemDetailModal(item) {
    const modal = document.getElementById('itemDetailModal');
    const cd = item.customData || {};
    const instanceId = item.instances?.[0];
    const canonicalCategory = getCanonicalTarotCategory(cd.Category);
    const spriteFrame = getInventorySpriteFrame(item);
    const isCurrentMajorEquipped = String(myCurrentEquipment?.[TAROT_MAJOR_SLOT] || '').trim() === String(item.itemId || '').trim();
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
        const awakeningLevel = getMajorAwakeningLevel(item.itemId);
        appendStatLine(`<span>覚醒: <strong>Lv${awakeningLevel}</strong> / 5</span>`);
        if (isCurrentMajorEquipped) {
            if (myActiveTarotAwakening?.itemId === item.itemId) {
                appendStatLine(`<span>覚醒効果: <strong>${myActiveTarotAwakening.summary || '常在効果'}</strong></span>`);
                (myActiveTarotAwakening.detailLines || []).slice(0, 4).forEach((line) => {
                    appendStatLine(`<span>${line}</span>`);
                });
            }
            appendStatLine('<span>装着中の体を残したまま覚醒するには、予備の大アルカナが1枚必要です。</span>');
        }
    }
    if (isTarotMinorCategory(canonicalCategory)) {
        const learnedSkill = getTarotSkillStateForItem(item.itemId);
        const majorArcanaItem = getInventoryItemByReference(myCurrentEquipment[TAROT_MAJOR_SLOT]);
        const targetManifestSlot = getManifestTargetSlot();
        if (majorArcanaItem?.name) {
            appendStatLine(`<span>現在の体: <strong>${majorArcanaItem.name}</strong></span>`);
        }
        if (learnedSkill) {
            appendStatLine(`<span>習得術: <strong>${learnedSkill.name}</strong></span>`);
            appendStatLine(`<span>術熟練: <strong>Lv${learnedSkill.level}</strong> / ${learnedSkill.maxLevel || 5}</span>`);
            appendStatLine(`<span>現在: <strong>${isTarotSkillUsableNow(learnedSkill) ? '使用可' : '装備待ち'}</strong></span>`);
        } else {
            appendStatLine('<span>未習得: この札を1枚使うと対応する術を習得できます。</span>');
        }
        const previewSlots = targetManifestSlot ? [targetManifestSlot] : TAROT_MINOR_SLOTS;
        previewSlots.forEach((slot) => {
            const manifestation = buildTarotManifestation(slot, majorArcanaItem, item);
            if (!manifestation.title) return;
            appendStatLine(`<span>${getTarotSlotLabel(slot)}具現: <strong>${manifestation.title}</strong></span>`);
        });
        appendStatLine('<span>具現後は既存武具の姿と性能で装備化されます。</span>');
        appendStatLine('<span>具現化すると元のカードは消失します。</span>');
    }

    const buttonsEl = document.getElementById('itemDetailButtons');
    buttonsEl.innerHTML = '';
    const appendActionNote = (text) => {
        buttonsEl.innerHTML += `<div class="item-detail-action-note">${text}</div>`;
    };
    const equipItemId = item.itemId;
    const isEquipped = (slot) => {
        const equippedValue = myCurrentEquipment[slot];
        return equippedValue === instanceId || equippedValue === equipItemId;
    };

    if (cd.Category === 'Weapon') {
        const isTwoHanded = cd.sprite_w > 32 || cd.sprite_h > 32;
        if (isTwoHanded) {
            const hasManifestOverwrite = getManifestationOverwriteSlots('RightHand', equipItemId).length > 0;
            if (hasManifestOverwrite) {
                appendActionNote('両手装備にすると、右手と左手の具現化装備は上書きされます。');
            }
            if (isEquipped('RightHand')) {
                buttonsEl.innerHTML += '<button onclick="window.equipItem(null, \'RightHand\')">\u5916\u3059</button>';
            } else {
                const label = hasManifestOverwrite ? '両手を上書き装備' : '\u4e21\u624b\u88c5\u5099';
                buttonsEl.innerHTML += `<button onclick="window.equipItem('${equipItemId}', 'RightHand')">${label}</button>`;
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
    } else if (isTarotMajorCategory(canonicalCategory)) {
        appendActionNote('体は外せません。別の大アルカナを選ぶと体だけを切り替えます。');
        if (isEquipped(TAROT_MAJOR_SLOT)) {
            buttonsEl.innerHTML += `<button disabled>${getTarotSlotLabel(TAROT_MAJOR_SLOT)}に装着中</button>`;
        } else {
            buttonsEl.innerHTML += `<button onclick="window.equipItem('${equipItemId}', '${TAROT_MAJOR_SLOT}')">${getTarotSlotLabel(TAROT_MAJOR_SLOT)}を変更</button>`;
        }
        const awakeningLevel = getMajorAwakeningLevel(equipItemId);
        const needsReserveCopy = isCurrentMajorEquipped;
        const canAwaken = awakeningLevel < 5 && item.count > (needsReserveCopy ? 1 : 0);
        appendActionNote('大アルカナの重複は覚醒素材になります。覚醒するとカードを1枚消費します。');
        if (awakeningLevel >= 5) {
            buttonsEl.innerHTML += '<button disabled>覚醒最大</button>';
        } else if (canAwaken) {
            buttonsEl.innerHTML += `<button onclick="window.awakenMajorArcana('${equipItemId}')">覚醒 +1</button>`;
        } else {
            buttonsEl.innerHTML += `<button disabled>${needsReserveCopy ? '予備1枚が必要' : '覚醒素材不足'}</button>`;
        }
    } else if (isTarotMinorCategory(canonicalCategory)) {
        appendActionNote('小アルカナを具現化するとカードを1枚消費し、既存武具の姿と性能で装備化されます。選んだ部位の現在装備は上書きされます。');
        const learnedSkill = getTarotSkillStateForItem(equipItemId);
        const canStudy = !learnedSkill || (Number(learnedSkill.level || 0) || 0) < (Number(learnedSkill.maxLevel || 5) || 5);
        const targetManifestSlot = getManifestTargetSlot();
        appendActionNote('小アルカナは具現化素材にも、術の習得・強化素材にも使えます。');
        if (targetManifestSlot) {
            appendActionNote(`今は ${getTarotSlotLabel(targetManifestSlot)} に具現化する札を選択中です。`);
        }
        const manifestationSlots = targetManifestSlot ? [targetManifestSlot] : TAROT_MINOR_SLOTS;
        manifestationSlots.forEach((slot) => {
            const slotLabel = getTarotSlotLabel(slot);
            const hasCurrentManifest = !!myCurrentEquipment?.[slot];
            const actionLabel = hasCurrentManifest ? `${slotLabel}を上書き具現` : `${slotLabel}に具現化`;
            buttonsEl.innerHTML += `<button onclick="window.manifestTarotCard('${equipItemId}', '${slot}')">${actionLabel}</button>`;
        });
        if (canStudy) {
            buttonsEl.innerHTML += `<button onclick="window.studyTarotCard('${equipItemId}')">${getTarotStudyActionLabel(equipItemId)}</button>`;
        } else {
            buttonsEl.innerHTML += '<button disabled>この札の術は最大</button>';
        }
    } else if (cd.Category === 'Consumable') {
        buttonsEl.innerHTML += `<button class="use-button" onclick="window.useItem('${instanceId}', '${item.itemId}')">\u4f7f\u3046</button>`;
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
    renderTarotProgressPanels();
    renderResourceSummary();
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

    const tarotEntries = [
        buildTarotLoadoutEntry(TAROT_MAJOR_SLOT, getInventoryItemByReference(myCurrentEquipment?.[TAROT_MAJOR_SLOT])),
        ...TAROT_MINOR_SLOTS.map((slot) => buildTarotLoadoutEntry(slot, myCurrentEquipment?.[slot] || null))
    ];
    const tarotRole = summarizeTarotLoadoutRole(tarotEntries);
    const roleBonus = tarotRole?.bonus || {};
    bonuses.str += Number(roleBonus.power || 0) || 0;
    bonuses.def += Number(roleBonus.defense || 0) || 0;
    bonuses.agi += Number(roleBonus.agi || 0) || 0;
    bonuses.int += Number(roleBonus.int || 0) || 0;
    bonuses.str += Number(myActiveTarotAwakening?.stats?.Power || 0) || 0;
    bonuses.def += Number(myActiveTarotAwakening?.stats?.Defense || 0) || 0;
    bonuses.agi += Number(myActiveTarotAwakening?.stats?.Agi || 0) || 0;
    bonuses.int += Number(myActiveTarotAwakening?.stats?.Int || 0) || 0;

    return bonuses;
}
