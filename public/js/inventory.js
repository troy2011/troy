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
    getTarotSlotLabel,
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
let lastInventoryFetchAt = 0;
let inventoryFetchPromise = null;
let myShipResourceStorage = {
    activeShipId: null,
    homeResources: {},
    cargoResources: {},
    cargoCapacity: 0,
    cargoUsed: 0
};

function getActiveInventoryCategory() {
    if (typeof document === 'undefined') return 'All';
    const active = document.querySelector('.inventory-tab-btn.active');
    return active?.dataset?.category || 'All';
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
    if (category === 'Resource') {
        return '船倉と倉庫の資源をまとめて確認できます。必要ならここから一括預け入れや補充を行います。';
    }
    if (category === 'TarotMajor') {
        return '体は必須です。大アルカナは外せませんが、別の大アルカナに変更できます。';
    }
    if (category === 'TarotMinor') {
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
    hintEl.textContent = getInventoryTabHint(category);
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
    if (inventoryFetchPromise) return inventoryFetchPromise;
    const force = options && options.force === true;
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
    document.querySelectorAll('.inventory-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    updateInventoryTabHint(category);
    renderInventoryGrid(category);
}

export function renderInventoryGrid(category) {
    const gridEl = document.getElementById('inventoryGrid');
    const resourceSummaryEl = document.getElementById('resourceSummary');
    const sortEl = document.getElementById('inventorySort');
    const isResourceCategory = category === 'Resource';

    gridEl.innerHTML = '';
    if (resourceSummaryEl) {
        resourceSummaryEl.style.display = isResourceCategory ? 'block' : 'none';
    }
    if (sortEl) {
        sortEl.disabled = isResourceCategory;
        sortEl.style.visibility = isResourceCategory ? 'hidden' : 'visible';
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
            return (b.customData?.Power || 0) - (a.customData?.Power || 0);
        }
        if (sortOrder === 'defense_desc') {
            return (b.customData?.Defense || 0) - (a.customData?.Defense || 0);
        }
        const leftCategory = getCanonicalTarotCategory(a.customData?.Category);
        const rightCategory = getCanonicalTarotCategory(b.customData?.Category);
        if ((leftCategory === 'TarotMajor' && rightCategory === 'TarotMajor')
            || (leftCategory === 'TarotMinor' && rightCategory === 'TarotMinor')) {
            return compareTarotItems(a, b);
        }
        return 0; // default
    });

    if (sorted.length === 0) {
        gridEl.innerHTML = `<p style="grid-column: 1 / -1; text-align: center;">${getEmptyInventoryMessage(category)}</p>`;
        return;
    }

    sorted.forEach(item => {
        const instanceId = item.instances?.[0];
        if (!instanceId) return;

        const cell = document.createElement('div');
        cell.className = 'inventory-item-cell';
        cell.onclick = () => showItemDetailModal(item);

        const iconDiv = document.createElement('div');
        iconDiv.className = 'inventory-item-icon';
        cell.appendChild(iconDiv);

        const cd = item.customData || {};
        setSpriteIcon(iconDiv, cd.sprite_path, parseInt(cd.sprite_index, 10) || 0, parseInt(cd.sprite_w, 10) || 32, parseInt(cd.sprite_h, 10) || 32, 1, cd.Category, window.myAvatarBaseInfo?.AvatarColor);

        if (item.count > 1) {
            const countSpan = document.createElement('span');
            countSpan.className = 'inventory-item-count';
            countSpan.innerText = `x${item.count}`;
            cell.appendChild(countSpan);
        }
        const equippedValues = Object.values(myCurrentEquipment || {}).filter(Boolean);
        if (equippedValues.includes(instanceId) || equippedValues.includes(item.itemId)) {
            const equippedSpan = document.createElement('span');
            equippedSpan.className = 'inventory-item-equipped-mark';
            equippedSpan.innerText = 'E';
            cell.appendChild(equippedSpan);
        }
        gridEl.appendChild(cell);
    });
}

function setSpriteIcon(element, imageUrl, spriteIndex, spriteWidth = 32, spriteHeight = 32, scale = 1, itemCategory = null, avatarColor = null) {
    if (!element || !imageUrl || spriteIndex < 0) {
        if (element) element.style.backgroundImage = 'none';
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

function showItemDetailModal(item) {
    const modal = document.getElementById('itemDetailModal');
    const cd = item.customData || {};
    const instanceId = item.instances?.[0];
    const canonicalCategory = getCanonicalTarotCategory(cd.Category);
    const isCurrentMajorEquipped = String(myCurrentEquipment?.[TAROT_MAJOR_SLOT] || '').trim() === String(item.itemId || '').trim();
    const appendStatLine = (html) => {
        statsEl.innerHTML += `${statsEl.innerHTML ? '<br>' : ''}${html}`;
    };

    setSpriteIcon(document.getElementById('itemDetailIcon'), cd.sprite_path, parseInt(cd.sprite_index, 10) || 0, parseInt(cd.sprite_w, 10) || 32, parseInt(cd.sprite_h, 10) || 32, 1, cd.Category, window.myAvatarBaseInfo?.AvatarColor);
    document.getElementById('itemDetailName').innerText = item.name;
    document.getElementById('itemDetailCategory').innerText = canonicalCategory === 'TarotMajor'
        ? '大アルカナ'
        : canonicalCategory === 'TarotMinor'
            ? '小アルカナ'
            : cd.Category === 'Offhand'
                ? '副手'
            : (cd.Category || '不明');
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
        TAROT_MINOR_SLOTS.forEach((slot) => {
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
        appendActionNote('小アルカナは具現化素材にも、術の習得・強化素材にも使えます。');
        if (canStudy) {
            buttonsEl.innerHTML += `<button onclick="window.studyTarotCard('${equipItemId}')">${getTarotStudyActionLabel(equipItemId)}</button>`;
        } else {
            buttonsEl.innerHTML += '<button disabled>この札の術は最大</button>';
        }
        TAROT_MINOR_SLOTS.forEach((slot) => {
            const slotLabel = getTarotSlotLabel(slot);
            const hasCurrentManifest = !!myCurrentEquipment?.[slot];
            const actionLabel = hasCurrentManifest ? `${slotLabel}を上書き具現` : `${slotLabel}に具現化`;
            buttonsEl.innerHTML += `<button onclick="window.manifestTarotCard('${equipItemId}', '${slot}')">${actionLabel}</button>`;
        });
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
