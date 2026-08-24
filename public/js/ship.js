// c:/Users/ikeda/my-liff-app/public/js/ship.js
// Client-side ship management with dead reckoning animation

import {
    getActiveShip as fetchActiveShip,
    setActiveShip as requestSetActiveShip,
    createShip as requestCreateShip,
    startShipVoyage as requestStartShipVoyage,
    stopShip as requestStopShip,
    upgradeShip as requestUpgradeShip,
    repairShip as requestRepairShip,
    getShipResourceStorage as requestShipResourceStorage,
    depositShipResources as requestDepositShipResources,
    saveShipResourcePreset as requestSaveShipResourcePreset,
    applyShipResourcePreset as requestApplyShipResourcePreset,
    getExplorationStatus as requestExplorationStatus,
    startExploration as requestStartExploration,
    getExplorationEncounter as requestExplorationEncounter,
    retreatExploration as requestRetreatExploration,
    claimExploration as requestClaimExploration,
    startTarotKingdomRaid as requestStartTarotKingdomRaid,
    finishTarotKingdomRaid as requestFinishTarotKingdomRaid,
    getTarotKingdomPetState as requestTarotKingdomPetState,
    rollTarotKingdomPetRound as requestRollTarotKingdomPetRound,
    chooseTarotKingdomPet as requestChooseTarotKingdomPet,
    getPlayerShipStatus as requestPlayerShipStatus,
    upgradePlayerShip as requestUpgradePlayerShip,
    renamePlayerShip as requestRenamePlayerShip,
    getInventory as fetchInventory,
    getPlayerShips as fetchPlayerShips,
    getShipsInView as fetchShipsInView,
    getShipAsset as fetchShipAsset,
    getShipPosition as fetchShipPosition
} from './playfabClient.js?v=20260731-online-rewards1';
import { showRpgMessage, rpgSay } from './rpgMessages.js';
import { bindModalClose } from './modalClose.js';
import { createRequestId } from './api.js';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { formatCurrencyLabel } from './config.js';
import * as Player from './player.js';
import * as Inventory from 'inventory';
import { buildAvatarLayerMarkup, renderAvatar, triggerAvatarAttackMotion } from './avatar.js';
import { PIXEL_MONSTERS_ROSTER } from './pixelMonstersManifest.js?v=20260811-monster-grounding2';

const EXPLORATION_ENEMY_DEFEAT_MODE_STORAGE_KEY = 'troy:exploration-enemy-defeat-mode';
const EXPLORATION_ENEMY_DEFEAT_MODE_DEFAULT = 'hp-zero';

function normalizeExplorationEnemyDefeatMode(value) {
    return value === 'hand-empty' ? 'hand-empty' : EXPLORATION_ENEMY_DEFEAT_MODE_DEFAULT;
}

function getExplorationEnemyDefeatMode() {
    try {
        return normalizeExplorationEnemyDefeatMode(
            window.localStorage?.getItem(EXPLORATION_ENEMY_DEFEAT_MODE_STORAGE_KEY)
        );
    } catch (_) {
        return EXPLORATION_ENEMY_DEFEAT_MODE_DEFAULT;
    }
}

function setExplorationEnemyDefeatMode(value) {
    const normalized = normalizeExplorationEnemyDefeatMode(value);
    try {
        window.localStorage?.setItem(EXPLORATION_ENEMY_DEFEAT_MODE_STORAGE_KEY, normalized);
    } catch (_) {
        // Storage may be unavailable in restricted browser contexts.
    }
    return normalized;
}

class LRUCache {
    constructor(maxSize = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    get(key) {
        if (!this.cache.has(key)) return null;
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            console.log(`[LRUCache] Evicted old entry: ${firstKey}`);
        }
        this.cache.set(key, value);
    }

    has(key) {
        return this.cache.has(key);
    }

    clear() {
        this.cache.clear();
    }

    get size() {
        return this.cache.size;
    }
}

let activeShipListeners = new Map(); // shipId -> unsubscribe
let playerShipsListener = null;
let shipsInViewListener = null;
let animationFrameId = null;

let cachedShipsData = new LRUCache(100);
let assetDataCache = new LRUCache(200);
const ASSET_CACHE_TTL = 5 * 60 * 1000;
let activeShipIdCache = null;
let activeShipOwnerIdCache = null;
let activeShipSharedCache = false;
const SHIP_LEVEL_CAP = 5;
const NATION_ALIAS = {
    wands: 'fire',
    pentacles: 'earth',
    swords: 'wind',
    cups: 'water'
};
const NATION_PRIMARY_RESOURCE_CODE = {
    fire: 'RR',
    earth: 'RG',
    wind: 'RY',
    water: 'RB'
};
const SHIP_BUILD_RESOURCE_COST_BY_CLASS = {
    explorer: { RT: 10, national: 25 },
    merchant: { RS: 1, national: 50 },
    fighter: { RS: 1, national: 50 },
    defender: { RS: 1, national: 50 }
};
const SHIP_UPGRADE_RESOURCE_COST_BY_CLASS = {
    explorer: {
        2: { RT: 5, national: 10 },
        3: { RT: 10, national: 15 },
        4: { RT: 15, national: 20 },
        5: { RT: 20, national: 25 }
    },
    default: {
        2: { national: 20 },
        3: { national: 30, RS: 1 },
        4: { national: 40, RS: 1 },
        5: { national: 50, RS: 1 }
    }
};
const SHIP_REPAIR_RESOURCE_COST_BY_TIER = {
    small: { RG: 1 }
};
const SHIP_REPAIR_RECOVERY_BY_TIER = {
    small: 0.25
};
const SHIP_RESOURCE_IDS = ['RR', 'RG', 'RY', 'RB', 'RT', 'RS'];
let shipResourceStorageCache = null;

function normalizeShipResourceMap(input) {
    const normalized = {};
    SHIP_RESOURCE_IDS.forEach((itemId) => {
        const amount = Number(input?.[itemId] || 0);
        normalized[itemId] = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0));
    });
    return normalized;
}

function sumShipResourceMap(input) {
    return SHIP_RESOURCE_IDS.reduce((sum, itemId) => sum + (Number(input?.[itemId] || 0) || 0), 0);
}

function normalizeNationKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;
    return NATION_ALIAS[raw] || raw;
}

function getCurrentPlayerNationKey() {
    const nation = window?.myAvatarBaseInfo?.Nation || window?.myAvatarBaseInfo?.nation || '';
    return normalizeNationKey(nation);
}

function normalizeShipClass(value) {
    return String(value || '').trim().toLowerCase();
}

function mergeCostEntries(entries) {
    const merged = new Map();
    (entries || []).forEach((entry) => {
        const itemId = String(entry?.ItemId || entry?.itemId || '').trim();
        const amount = Number(entry?.Amount ?? entry?.amount ?? 0) || 0;
        if (!itemId || amount <= 0) return;
        merged.set(itemId, (merged.get(itemId) || 0) + amount);
    });
    return Array.from(merged.entries()).map(([ItemId, Amount]) => ({ ItemId, Amount }));
}

function expandShipCostTemplate(template, nationKey) {
    if (!template || typeof template !== 'object') return [];
    const primaryCode = NATION_PRIMARY_RESOURCE_CODE[normalizeNationKey(nationKey)];
    const expanded = [];
    Object.entries(template).forEach(([code, rawAmount]) => {
        const amount = Number(rawAmount) || 0;
        if (amount <= 0) return;
        const itemId = code === 'national' ? primaryCode : code;
        if (!itemId) return;
        expanded.push({ ItemId: itemId, Amount: amount });
    });
    return mergeCostEntries(expanded);
}

function resolveCatalogShip(assetData) {
    if (!assetData || !window.shipCatalog) return null;
    if (assetData.ItemId && window.shipCatalog[assetData.ItemId]) return window.shipCatalog[assetData.ItemId];
    const shipType = assetData.ShipType;
    if (!shipType) return null;
    return Object.values(window.shipCatalog).find(item => item.DisplayName === shipType) || null;
}

function buildCostsFromCatalogItem(item) {
    if (!item) return [];
    const costs = [];
    const pushCost = (code, amount) => {
        const id = code ? String(code) : '';
        const value = Number(amount) || 0;
        if (!id || value <= 0) return;
        costs.push({ ItemId: id, Amount: value });
    };
    if (Array.isArray(item.PriceAmounts)) {
        item.PriceAmounts.forEach((entry) => {
            pushCost(entry?.ItemId || entry?.itemId, entry?.Amount ?? entry?.amount);
        });
    }
    if (costs.length === 0 && item.PriceOptions) {
        const options = Array.isArray(item.PriceOptions) ? item.PriceOptions : [item.PriceOptions];
        options.forEach((option) => {
            const prices = Array.isArray(option?.Prices) ? option.Prices : [];
            prices.forEach((price) => {
                const amounts = Array.isArray(price?.Amounts) ? price.Amounts : [];
                amounts.forEach((entry) => {
                    pushCost(entry?.ItemId || entry?.itemId, entry?.Amount ?? entry?.amount);
                });
            });
        });
    }
    if (costs.length === 0 && item.VirtualCurrencyPrices) {
        Object.entries(item.VirtualCurrencyPrices).forEach(([code, amount]) => {
            pushCost(code, amount);
        });
    }
    return costs;
}

function resolveLegacyUpgradeCosts(catalogItem, nextLevel) {
    const baseCosts = buildCostsFromCatalogItem(catalogItem);
    if (!baseCosts.length) return [];
    const multiplier = Math.max(1, Number(nextLevel) || 1);
    return baseCosts.map(entry => ({
        ...entry,
        Amount: Math.max(1, Math.round((Number(entry.Amount) || 0) * multiplier))
    }));
}

export function getShipBuildResourceCosts(shipSpec, nationKey = getCurrentPlayerNationKey()) {
    const shipClass = normalizeShipClass(shipSpec?.class || shipSpec?.Class);
    const fixedCosts = expandShipCostTemplate(SHIP_BUILD_RESOURCE_COST_BY_CLASS[shipClass], nationKey);
    if (fixedCosts.length > 0) return fixedCosts;
    return buildCostsFromCatalogItem(shipSpec);
}

export function getShipUpgradeResourceCosts(shipSpec, nextLevel, nationKey = getCurrentPlayerNationKey()) {
    const shipClass = normalizeShipClass(shipSpec?.class || shipSpec?.Class);
    const classCosts = SHIP_UPGRADE_RESOURCE_COST_BY_CLASS[shipClass] || SHIP_UPGRADE_RESOURCE_COST_BY_CLASS.default;
    const fixedCosts = expandShipCostTemplate(classCosts?.[nextLevel], nationKey);
    if (fixedCosts.length > 0) return fixedCosts;
    return resolveLegacyUpgradeCosts(shipSpec, nextLevel);
}

export function getShipRepairResourceCosts(tier = 'small') {
    const template = SHIP_REPAIR_RESOURCE_COST_BY_TIER[String(tier || 'small').trim().toLowerCase()];
    return expandShipCostTemplate(template, null);
}

export async function getShipResourceBalances(playFabId) {
    if (!playFabId) return {};
    const data = await fetchInventory(playFabId, { isSilent: true });
    return data?.virtualCurrency || {};
}

export async function getShipResourceStorage(playFabId, forceRefresh = false) {
    if (!playFabId) {
        return {
            activeShipId: null,
            homeResources: normalizeShipResourceMap({}),
            cargoResources: normalizeShipResourceMap({}),
            cargoCapacity: 0,
            cargoUsed: 0,
            preset: normalizeShipResourceMap({})
        };
    }
    if (!forceRefresh && shipResourceStorageCache?.playFabId === playFabId) {
        return shipResourceStorageCache.data;
    }
    const data = await requestShipResourceStorage(playFabId, { isSilent: true });
    const normalized = {
        activeShipId: data?.activeShipId || null,
        homeResources: normalizeShipResourceMap(data?.homeResources),
        cargoResources: normalizeShipResourceMap(data?.cargoResources),
        cargoCapacity: Number(data?.cargoCapacity || 0) || 0,
        cargoUsed: Number(data?.cargoUsed || 0) || 0,
        preset: normalizeShipResourceMap(data?.preset)
    };
    shipResourceStorageCache = { playFabId, data: normalized };
    return normalized;
}

function invalidateShipResourceStorage(playFabId = null) {
    if (!playFabId || shipResourceStorageCache?.playFabId === playFabId) {
        shipResourceStorageCache = null;
    }
}

function renderShipResourceSummary(resources, { balances = null, compact = false } = {}) {
    const current = normalizeShipResourceMap(resources);
    const owned = balances ? normalizeShipResourceMap(balances) : null;
    const visibleIds = SHIP_RESOURCE_IDS.filter((itemId) => (current[itemId] || 0) > 0 || (!compact && owned && (owned[itemId] || 0) > 0));
    if (!visibleIds.length) {
        return '<span style="color: var(--text-sub);">なし</span>';
    }
    return visibleIds.map((itemId) => {
        const amount = current[itemId] || 0;
        const ownedAmount = owned ? owned[itemId] || 0 : null;
        const tone = owned && amount > ownedAmount ? 'var(--danger-color)' : 'var(--text-color)';
        return `
            <span style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); font-size:12px;">
                <span style="font-weight:700; color:${tone};">${formatCurrencyLabel(itemId)} x${amount}</span>
                ${owned ? `<span style="color: var(--text-sub);">倉庫 ${ownedAmount}</span>` : ''}
            </span>
        `;
    }).join('');
}

async function showShipCargoPresetEditor(playFabId) {
    const storage = await getShipResourceStorage(playFabId, true);
    return new Promise((resolve) => {
        const draft = normalizeShipResourceMap(storage.preset);
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(0,0,0,0.72)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '20px';
        overlay.style.zIndex = '10012';

        const panel = document.createElement('div');
        panel.style.width = 'min(94vw, 460px)';
        panel.style.maxHeight = '80vh';
        panel.style.overflowY = 'auto';
        panel.style.background = 'var(--panel-bg, #111827)';
        panel.style.border = '1px solid rgba(255,255,255,0.12)';
        panel.style.borderRadius = '16px';
        panel.style.boxShadow = '0 24px 60px rgba(0,0,0,0.45)';
        panel.style.padding = '18px';

        const capacity = Number(storage.cargoCapacity || 0) || 0;
        const renderRows = () => {
            const total = sumShipResourceMap(draft);
            panel.innerHTML = `
                <div style="font-size:18px; font-weight:700; margin-bottom:8px;">マイセット編集</div>
                <div style="font-size:13px; color:var(--text-sub); margin-bottom:12px;">船倉へ一括補充する目標数を設定します。容量 ${total}/${capacity}</div>
                <div style="display:grid; gap:10px; margin-bottom:14px;">
                    ${SHIP_RESOURCE_IDS.map((itemId) => `
                        <div style="display:grid; grid-template-columns: 1fr auto; gap:10px; align-items:center; padding:10px 12px; border-radius:12px; background:rgba(255,255,255,0.04);">
                            <div>
                                <div style="font-weight:700;">${formatCurrencyLabel(itemId)}</div>
                                <div style="font-size:12px; color:var(--text-sub);">倉庫 ${storage.homeResources[itemId] || 0}</div>
                            </div>
                            <div style="display:inline-flex; align-items:center; gap:8px;">
                                <button data-item="${itemId}" data-delta="-1" style="width:36px; height:36px; border:none; border-radius:10px; background:#374151; color:#fff; font-weight:700;">−</button>
                                <span style="min-width:48px; text-align:center; font-weight:700;">${draft[itemId] || 0}</span>
                                <button data-item="${itemId}" data-delta="1" style="width:36px; height:36px; border:none; border-radius:10px; background:var(--accent-color); color:#fff; font-weight:700;">＋</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div style="display:flex; gap:10px;">
                    <button data-role="save" style="flex:1; background:var(--accent-color); color:#fff; padding:12px; border:none; border-radius:10px;">保存</button>
                    <button data-role="cancel" style="flex:1; background:#374151; color:#fff; padding:12px; border:none; border-radius:10px;">閉じる</button>
                </div>
            `;
            panel.querySelectorAll('button[data-item]').forEach((button) => {
                button.addEventListener('click', () => {
                    const itemId = button.dataset.item;
                    const delta = Number(button.dataset.delta || 0) || 0;
                    const nextValue = Math.max(0, (draft[itemId] || 0) + delta);
                    const otherTotal = total - (draft[itemId] || 0);
                    if (delta > 0 && capacity > 0 && otherTotal + nextValue > capacity) {
                        showRpgMessage(`船倉容量を超えます（${capacity}）`);
                        return;
                    }
                    draft[itemId] = nextValue;
                    renderRows();
                });
            });
            panel.querySelector('[data-role="save"]').addEventListener('click', async () => {
                try {
                    const saved = await requestSaveShipResourcePreset(playFabId, draft);
                    invalidateShipResourceStorage(playFabId);
                    await getShipResourceStorage(playFabId, true);
                    showRpgMessage('マイセットを保存しました。');
                    cleanup(saved?.preset || draft);
                } catch (error) {
                    showRpgMessage(error?.message || 'マイセットの保存に失敗しました。');
                }
            });
            panel.querySelector('[data-role="cancel"]').addEventListener('click', () => cleanup(null));
        };

        const cleanup = (result) => {
            overlay.remove();
            resolve(result);
        };

        renderRows();
        overlay.appendChild(panel);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) cleanup(null);
        });
        document.body.appendChild(overlay);
    });
}

export async function depositActiveShipResources(playFabId, shipId = null) {
    if (!playFabId) return null;
    try {
        const result = await requestDepositShipResources(playFabId, shipId, { isSilent: true });
        invalidateShipResourceStorage(playFabId);
        if (result?.success) {
            showRpgMessage('船倉の資源をすべて倉庫へ預けました。');
            await displayPlayerShips(playFabId);
            return result;
        }
        showRpgMessage(result?.error || '資源の預け入れに失敗しました。');
        return null;
    } catch (error) {
        showRpgMessage(error?.message || '資源の預け入れに失敗しました。');
        return null;
    }
}

export async function applyActiveShipPreset(playFabId, shipId = null) {
    if (!playFabId) return null;
    try {
        const result = await requestApplyShipResourcePreset(playFabId, shipId, { isSilent: true });
        invalidateShipResourceStorage(playFabId);
        if (result?.success) {
            const moved = sumShipResourceMap(result.transferred);
            showRpgMessage(moved > 0 ? `マイセットで${moved}個補充しました。` : '補充できる資源がありません。');
            await displayPlayerShips(playFabId);
            return result;
        }
        showRpgMessage(result?.error || 'マイセット補充に失敗しました。');
        return null;
    } catch (error) {
        showRpgMessage(error?.message || 'マイセット補充に失敗しました。');
        return null;
    }
}

export function getShipResourceShortages(costs, balances) {
    const currentBalances = balances || {};
    return (costs || []).map((entry) => {
        const itemId = String(entry?.ItemId || entry?.itemId || '').trim();
        const required = Number(entry?.Amount ?? entry?.amount ?? 0) || 0;
        const owned = Number(currentBalances[itemId] || 0) || 0;
        const shortage = Math.max(0, required - owned);
        return shortage > 0 ? { ItemId: itemId, required, owned, shortage } : null;
    }).filter(Boolean);
}

export function hasEnoughShipResources(costs, balances) {
    return getShipResourceShortages(costs, balances).length === 0;
}

function formatCostLabel(costs) {
    if (!Array.isArray(costs) || costs.length === 0) return '不明';
    return costs.map(cost => `${formatCurrencyLabel(cost.ItemId)} x${cost.Amount}`).join(' / ');
}

export function renderShipResourceCostHtml(costs, balances = null) {
    if (!Array.isArray(costs) || costs.length === 0) {
        return '<span style="color: var(--text-sub);">費用なし</span>';
    }
    const currentBalances = balances || {};
    return costs.map((cost) => {
        const itemId = String(cost?.ItemId || cost?.itemId || '').trim();
        const required = Number(cost?.Amount ?? cost?.amount ?? 0) || 0;
        const owned = Number(currentBalances[itemId] || 0) || 0;
        const enough = balances == null || owned >= required;
        const color = enough ? 'var(--text-color)' : 'var(--danger-color)';
        const ownedLabel = balances == null ? '' : `<span style="color:${color}; font-size:12px;">所持 ${owned}</span>`;
        return `
            <span style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08);">
                <span style="font-weight:700; color:${color};">${formatCurrencyLabel(itemId)} x${required}</span>
                ${ownedLabel}
            </span>
        `;
    }).join('');
}

async function showShipSpendConfirmation({ title, subtitle = '', costs, balances, confirmLabel = 'Confirm' }) {
    return new Promise((resolve) => {
        const shortages = getShipResourceShortages(costs, balances);
        const canAfford = shortages.length === 0;
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(0,0,0,0.68)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '20px';
        overlay.style.zIndex = '10010';

        const panel = document.createElement('div');
        panel.style.width = 'min(92vw, 420px)';
        panel.style.background = 'var(--panel-bg, #111827)';
        panel.style.border = '1px solid rgba(255,255,255,0.12)';
        panel.style.borderRadius = '16px';
        panel.style.boxShadow = '0 24px 60px rgba(0,0,0,0.45)';
        panel.style.padding = '18px';
        panel.innerHTML = `
            <div style="font-size:18px; font-weight:700; margin-bottom:8px;">${title}</div>
            ${subtitle ? `<div style="font-size:13px; color:var(--text-sub); margin-bottom:12px;">${subtitle}</div>` : ''}
            <div style="font-size:13px; color:var(--text-sub); margin-bottom:8px;">必要資源</div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">${renderShipResourceCostHtml(costs, balances)}</div>
            ${canAfford ? '' : `<div style="font-size:13px; color:var(--danger-color); margin-bottom:12px;">不足: ${shortages.map((entry) => `${formatCurrencyLabel(entry.ItemId)} ${entry.shortage}`).join(' / ')}</div>`}
            <div style="display:flex; gap:10px;">
                <button data-role="confirm" style="flex:1; background: ${canAfford ? 'var(--accent-color)' : '#4b5563'}; color: white; padding: 12px; border-radius: 10px; border: none; cursor: ${canAfford ? 'pointer' : 'not-allowed'};" ${canAfford ? '' : 'disabled'}>${confirmLabel}</button>
                <button data-role="cancel" style="flex:1; background:#374151; color:white; padding:12px; border-radius:10px; border:none; cursor:pointer;">キャンセル</button>
            </div>
        `;
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const cleanup = (result) => {
            overlay.remove();
            resolve(result);
        };

        panel.querySelector('[data-role="confirm"]').addEventListener('click', () => cleanup(canAfford));
        panel.querySelector('[data-role="cancel"]').addEventListener('click', () => cleanup(false));
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) cleanup(false);
        });
    });
}

export async function getActiveShipId(playFabId) {
    const result = await fetchActiveShip(playFabId, { isSilent: true });
    if (result && result.success) {
        activeShipIdCache = result.activeShipId || null;
        activeShipOwnerIdCache = result.shipOwnerPlayFabId || playFabId || null;
        activeShipSharedCache = !!result.isSharedShip || !!result.isGuildShip || !!result.guildShip;
        return activeShipIdCache;
    }
    activeShipIdCache = null;
    activeShipOwnerIdCache = playFabId || null;
    activeShipSharedCache = false;
    return null;
}

export async function setActiveShip(playFabId, shipId) {
    const result = await requestSetActiveShip(playFabId, shipId);
    if (result && result.success) {
        activeShipIdCache = result.activeShipId || shipId;
        activeShipOwnerIdCache = result.shipOwnerPlayFabId || activeShipOwnerIdCache || playFabId || null;
        activeShipSharedCache = !!result.isSharedShip || !!result.isGuildShip || !!result.guildShip;
        invalidateShipResourceStorage(playFabId);

        const container = document.getElementById('playerShipsContainer');
        if (container) {
            container.querySelectorAll('.ship-card').forEach((card) => {
                const id = card.dataset.shipId;
                const isActive = id === activeShipIdCache;
                const badge = card.querySelector('[data-role="active-badge"]');
                const btn = card.querySelector('[data-role="active-button"]');
                if (badge) badge.style.display = isActive ? '' : 'none';
                if (btn) {
                    btn.disabled = isActive;
                    btn.textContent = isActive ? '使用中' : '使用する';
                }
            });
        }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('ship:active-changed', {
                detail: {
                    shipId: activeShipIdCache,
                    shipOwnerPlayFabId: activeShipOwnerIdCache,
                    isSharedShip: activeShipSharedCache
                }
            }));
        }
        await loadExplorationPanel(playFabId);
        return result;
    }
    return null;
}

export function calculateCurrentPosition(movement, staticPosition) {
    if (!movement || !movement.isMoving) {
        return staticPosition || { x: 0, y: 0 };
    }

    const now = Date.now();
    const departureTime = movement.departureTime;
    const arrivalTime = movement.arrivalTime;
    const departurePos = movement.departurePos;
    const destinationPos = movement.destinationPos;

    if (now >= arrivalTime) {
        return destinationPos;
    }

    const totalTime = arrivalTime - departureTime;
    const elapsedTime = now - departureTime;
    const progress = Math.max(0, Math.min(1, elapsedTime / totalTime));

    const currentX = departurePos.x + (destinationPos.x - departurePos.x) * progress;
    const currentY = departurePos.y + (destinationPos.y - departurePos.y) * progress;

    return { x: currentX, y: currentY };
}

export async function createShip(playFabId, shipItemId, context) {
    const shipSpec = window?.shipCatalog?.[shipItemId] || null;
    const balances = context?.resourceBalances || await getShipResourceBalances(playFabId);
    const costs = getShipBuildResourceCosts(shipSpec, context?.nationKey || getCurrentPlayerNationKey());
    const confirmed = await showShipSpendConfirmation({
        title: `${shipSpec?.DisplayName || '船'}を建造`,
        subtitle: '必要資源を消費して船を建造します。',
        costs,
        balances,
        confirmLabel: '建造する'
    });
    if (!confirmed) return null;

    const data = await requestCreateShip(
        playFabId,
        shipItemId,
        context?.mapId || null,
        context?.islandId || null
    );

    if (data && data.success) {
        console.log(`[CreateShip] Created ship ${data.shipId}`);
        const shipName = data.shipData?.ShipType || '船';
        showRpgMessage(rpgSay.shipCreated(shipName));
        return data;
    }

    return null;
}

export function selectPaymentMethod(message = '支払い方法を選択してください') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(0,0,0,0.6)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '9999';

        const panel = document.createElement('div');
        panel.style.background = '#111';
        panel.style.border = '1px solid rgba(255,255,255,0.15)';
        panel.style.borderRadius = '10px';
        panel.style.padding = '16px';
        panel.style.minWidth = '240px';
        panel.style.color = '#fff';
        panel.innerHTML = `
            <div style="font-size:14px; margin-bottom:12px;">${message}</div>
            <div style="display:flex; gap:8px;">
                <button id="payWithPsBtn" style="flex:1; padding:8px;">ゴールドで支払う</button>
                <button id="payWithResourceBtn" style="flex:1; padding:8px;">資源で支払う</button>
            </div>
            <div style="margin-top:10px; text-align:right;">
                <button id="payCancelBtn" style="padding:6px 10px;">キャンセル</button>
            </div>
        `;
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const cleanup = () => {
            overlay.remove();
        };

        overlay.querySelector('#payWithPsBtn').addEventListener('click', () => {
            cleanup();
            resolve('ps');
        });
        overlay.querySelector('#payWithResourceBtn').addEventListener('click', () => {
            cleanup();
            resolve('resource');
        });
        bindModalClose(overlay.querySelector('#payCancelBtn'), () => {
            cleanup();
            resolve(null);
        });
    });
}

export async function startShipVoyage(shipId, playFabId, destination) {
    const data = await requestStartShipVoyage(shipId, playFabId, destination);

    if (data && data.success) {
        console.log(`[StartShipVoyage] Ship ${shipId} departing, ETA: ${data.travelTimeSeconds.toFixed(1)}s`);
        return data;
    }

    return null;
}

export async function stopShip(shipId, playFabId) {
    const data = await requestStopShip(shipId, playFabId);

    if (data && data.success) {
        console.log(`[StopShip] Ship ${shipId} stopped at (${data.currentPosition.x}, ${data.currentPosition.y})`);
        return data;
    }

    return null;
}

export async function legacyUpgradeShip_unused(playFabId, shipId) {
    if (!playFabId || !shipId) return null;
    const assetData = await getShipAsset(playFabId, shipId, true);
    if (!assetData) return null;

    const currentLevel = Number(assetData?.Level) || 1;
    if (currentLevel >= SHIP_LEVEL_CAP) {
        showRpgMessage('この船は既に最大レベルです。');
        return null;
    }

    const catalogItem = resolveCatalogShip(assetData);
    const nextLevel = currentLevel + 1;
    const costs = getShipUpgradeResourceCosts(catalogItem || assetData, nextLevel, getCurrentPlayerNationKey());
    const balances = await getShipResourceBalances(playFabId);
    const confirmed = await showShipSpendConfirmation({
        title: `Lv${nextLevel}へ強化`,
        subtitle: '必要資源を消費して船を強化します。',
        costs,
        balances,
        confirmLabel: '強化する'
    });
    if (!confirmed) return null;

    const upgradeResult = await requestUpgradeShip(playFabId, shipId);
    if (upgradeResult && upgradeResult.success) {
        assetDataCache.set(shipId, { data: upgradeResult.shipData, timestamp: Date.now() });
        cachedShipsData.set(shipId, {
            ...(cachedShipsData.get(shipId) || {}),
            assetData: upgradeResult.shipData
        });
        showRpgMessage(`Ship upgraded to Lv${upgradeResult.level}.`);
        await displayPlayerShips(playFabId);
        return upgradeResult;
    }
    return null;
    const paymentMethod = await selectPaymentMethod(`船をLv${nextLevel}に強化しますか？\n費用: ${costLabel}`);
    if (!paymentMethod) return null;

    const data = await requestUpgradeShip(playFabId, shipId, paymentMethod);
    if (data && data.success) {
        assetDataCache.set(shipId, { data: data.shipData, timestamp: Date.now() });
        cachedShipsData.set(shipId, {
            ...(cachedShipsData.get(shipId) || {}),
            assetData: data.shipData
        });
        showRpgMessage(`船がLv${data.level}になりました！`);
        await displayPlayerShips(playFabId);
        return data;
    }
    return null;
}

export async function upgradeShip(playFabId, shipId) {
    if (!playFabId || !shipId) return null;

    const assetData = await getShipAsset(playFabId, shipId, true);
    if (!assetData) return null;

    const currentLevel = Number(assetData?.Level) || 1;
    if (currentLevel >= SHIP_LEVEL_CAP) {
        showRpgMessage('この船はすでに最大レベルです。');
        return null;
    }

    const catalogItem = resolveCatalogShip(assetData);
    const nextLevel = currentLevel + 1;
    const costs = getShipUpgradeResourceCosts(catalogItem || assetData, nextLevel, getCurrentPlayerNationKey());
    const balances = await getShipResourceBalances(playFabId);
    const confirmed = await showShipSpendConfirmation({
        title: `Lv${nextLevel}へ強化`,
        subtitle: '必要資源を消費して船を強化します。',
        costs,
        balances,
        confirmLabel: '強化する'
    });
    if (!confirmed) return null;

    const upgradeResult = await requestUpgradeShip(playFabId, shipId);
    if (!upgradeResult || !upgradeResult.success) return null;

    assetDataCache.set(shipId, { data: upgradeResult.shipData, timestamp: Date.now() });
    cachedShipsData.set(shipId, {
        ...(cachedShipsData.get(shipId) || {}),
        assetData: upgradeResult.shipData
    });
    showRpgMessage(`船がLv${upgradeResult.level}になりました。`);
    await displayPlayerShips(playFabId);
    return upgradeResult;
}

export async function repairShip(playFabId, shipId, tier = 'small') {
    if (!playFabId || !shipId) return null;

    const assetData = await getShipAsset(playFabId, shipId, true);
    if (!assetData) return null;

    const maxHp = Number(assetData?.Stats?.MaxHP || 0) || 0;
    const currentHp = Number.isFinite(Number(assetData?.Stats?.CurrentHP))
        ? Number(assetData?.Stats?.CurrentHP)
        : maxHp;
    if (maxHp > 0 && currentHp >= maxHp) {
        showRpgMessage('この船はすでに最大HPです。');
        return null;
    }

    const normalizedTier = String(tier || 'small').trim().toLowerCase();
    const costs = getShipRepairResourceCosts(normalizedTier);
    const balances = normalizeShipResourceMap(assetData?.ResourceCargo);
    const recoverRatio = Number(SHIP_REPAIR_RECOVERY_BY_TIER[normalizedTier] || 0.25);
    const confirmed = await showShipSpendConfirmation({
        title: '船を小修理',
        subtitle: `${formatCostLabel(costs)}を消費して、最大HPの${Math.round(recoverRatio * 100)}%を回復します（船倉消費）。`,
        costs,
        balances,
        confirmLabel: '修理する'
    });
    if (!confirmed) return null;

    try {
        const repairResult = await requestRepairShip(playFabId, shipId, normalizedTier);
        if (!repairResult || !repairResult.success) return null;

        assetDataCache.set(shipId, { data: repairResult.shipData, timestamp: Date.now() });
        cachedShipsData.set(shipId, {
            ...(cachedShipsData.get(shipId) || {}),
            assetData: repairResult.shipData
        });
        showRpgMessage(repairResult.repairedHp > 0
            ? `船を小修理しました（HP +${repairResult.repairedHp}）`
            : 'この船はすでに最大HPです。');
        await displayPlayerShips(playFabId);
        return repairResult;
    } catch (error) {
        showRpgMessage(error?.message || '船の修理に失敗しました。');
        return null;
    }
}

export async function getPlayerShips(playFabId) {
    const data = await fetchPlayerShips(playFabId, { isSilent: true });

    if (data && data.success) {
        return data.ships;
    }

    return [];
}

export async function getShipsInView(centerX, centerY, radius, mapId = null) {
    const data = await fetchShipsInView(centerX, centerY, radius, mapId || null, { isSilent: true });

    if (data && data.success) {
        return data.ships;
    }

    return [];
}

export async function getShipAsset(playFabId, shipId, forceRefresh = false) {
    const cacheKey = shipId;

    if (!forceRefresh) {
        const cached = assetDataCache.get(cacheKey);
        if (cached) {
            const now = Date.now();
            if ((now - cached.timestamp) < ASSET_CACHE_TTL) {
                console.log(`[GetShipAsset] Cache hit for ${shipId}`);
                return cached.data;
            } else {
                console.log(`[GetShipAsset] Cache expired for ${shipId}`);
            }
        }
    }

    console.log(`[GetShipAsset] Fetching from API for ${shipId}`);
    const data = await fetchShipAsset(playFabId, shipId, { isSilent: true });

    if (data && data.success) {
        assetDataCache.set(cacheKey, {
            data: data.shipData,
            timestamp: Date.now()
        });
        return data.shipData;
    }

    return null;
}

export async function getShipPosition(shipId) {
    const data = await fetchShipPosition(shipId, { isSilent: true });

    if (data && data.success) {
        return data.positionData;
    }

    return null;
}

export function formatETA(arrivalTime) {
    const now = Date.now();
    const remainingMs = arrivalTime - now;

    if (remainingMs <= 0) {
        return '到着済み';
    }

    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes > 0) {
        return `あと${minutes}分${seconds}秒`;
    }
    return `あと${seconds}秒`;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function formatExplorationDuration(ms) {
    const totalMinutes = Math.max(1, Math.round(Number(ms || 0) / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) return `${hours}時間${minutes}分`;
    if (hours > 0) return `${hours}時間`;
    return `${minutes}分`;
}

function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const PLAYER_SHIP_LABELS = {
    boat: 'ボート',
    explorer: 'エクスプローラー',
    defender: 'ディフェンダー',
    fighter: 'ファイター',
    merchant: 'マーチャント',
    guild: 'ギルドシップ'
};

const HOME_PLAYER_SHIP_LABELS = {
    boat: 'ボート',
    explorer: '探索船',
    defender: '守備船',
    fighter: '戦闘船',
    merchant: '商船',
    guild: 'ギルドシップ'
};

const EXPLORATION_DESTINATION_VISUALS = {
    near_sea: { island: '🏝️', sky: 'day', label: '近海の漂流箱', imagePath: './Sprites/exploration_destinations/near_sea_drift_crate.png' },
    palm_islet: { island: '🏝️', sky: 'day', label: '椰子の小島', imagePath: './Sprites/exploration_destinations/palm_islet.png' },
    coral_lagoon: { island: '🪸', sky: 'day', label: '珊瑚の潟', imagePath: './Sprites/exploration_destinations/coral_lagoon.png' },
    coral_passage: { island: '🪸', sky: 'day', label: '珊瑚礁の抜け道', imagePath: './Sprites/exploration_destinations/coral_passage_reef.png' },
    old_lighthouse: { island: '🗼', sky: 'mist', label: '古代灯台跡', imagePath: './Sprites/exploration_destinations/old_lighthouse_ruins.png' },
    sunken_trader: { island: '🚢', sky: 'deep', label: '沈没商船', imagePath: './Sprites/exploration_destinations/sunken_trader_wreck.png' },
    ship_graveyard: { island: '⚓', sky: 'mist', label: '船の墓場', imagePath: './Sprites/exploration_destinations/ship_graveyard.png' },
    pirate_cove: { island: '⛰️', sky: 'storm', label: '海賊の隠れ家', imagePath: './Sprites/exploration_destinations/pirate_cove_hideout.png' },
    deep_maelstrom: { island: '🌀', sky: 'deep', label: '深海の渦', imagePath: './Sprites/exploration_destinations/deep_maelstrom_whirlpool.png' },
    megalodon_reef: { island: '🦈', sky: 'storm', label: '鎖鮫の暗礁', imagePath: './Sprites/exploration_destinations/shark_fin.png' },
    specter_whale_sea: { island: '🐋', sky: 'mist', label: '亡霊鯨の海域', imagePath: './Sprites/exploration_destinations/whale_tail.png' },
    armored_kraken_nest: { island: '🐙', sky: 'deep', label: '甲冑クラーケンの巣', imagePath: './Sprites/exploration_destinations/kraken_tentacles.png' },
    phantom_admiral_marsh: { island: '👻', sky: 'mist', label: '亡霊提督の沼海', imagePath: './Sprites/exploration_destinations/haunted_marsh.png' },
    abyss_angler_vents: { island: '💧', sky: 'deep', label: '深淵アンコウの海底孔', imagePath: './Sprites/exploration_destinations/bubble_vents.png' },
    cannon_hermit_fort: { island: '🏰', sky: 'storm', label: '砲台ヤドカリの海上砦', imagePath: './Sprites/exploration_destinations/sea_fortress.png' },
    storm_serpent_current: { island: '🌊', sky: 'storm', label: '嵐海蛇の交差海流', imagePath: './Sprites/exploration_destinations/cross_current.png' },
    manta_wraith_grotto: { island: '✨', sky: 'deep', label: '亡霊マンタの青光洞', imagePath: './Sprites/exploration_destinations/glowing_grotto.png' },
    treasure_hermit_cave: { island: '💎', sky: 'deep', label: '財宝ヤドカリの宝洞窟', imagePath: './Sprites/exploration_destinations/treasure_cave.png' },
    default: { island: '🏝️', sky: 'day', label: '未知の海域', imagePath: './Sprites/exploration_destinations/palm_islet.png' }
};

const EXPLORATION_DESTINATION_ALIASES = {
    harbor_edge: 'near_sea',
    harbor_edge_island: 'near_sea',
    near_sea_drift_crate: 'near_sea',
    palm_islet: 'palm_islet',
    coral_lagoon: 'coral_lagoon',
    coral_passage_reef: 'coral_passage',
    pirate_cove_hideout: 'pirate_cove',
    old_lighthouse_ruins: 'old_lighthouse',
    sunken_trader_wreck: 'sunken_trader',
    ship_graveyard: 'ship_graveyard',
    deep_maelstrom_whirlpool: 'deep_maelstrom',
    shark_fin: 'megalodon_reef',
    whale_tail: 'specter_whale_sea',
    kraken_tentacles: 'armored_kraken_nest',
    haunted_marsh: 'phantom_admiral_marsh',
    bubble_vents: 'abyss_angler_vents',
    sea_fortress: 'cannon_hermit_fort',
    cross_current: 'storm_serpent_current',
    glowing_grotto: 'manta_wraith_grotto',
    treasure_cave: 'treasure_hermit_cave'
};

const EXPLORATION_SHIP_TRAITS = {
    boat: { label: '慎重に接近', className: 'is-boat-run' },
    explorer: { label: '追い風で高速接近', className: 'is-explorer-run' },
    defender: { label: '防壁を展開', className: 'is-defender-run' },
    fighter: { label: '砲撃態勢', className: 'is-fighter-run' },
    merchant: { label: '大きな積荷で回収', className: 'is-merchant-run' },
    guild: { label: '王の旗艦で接近', className: 'is-defender-run' }
};

let currentPlayerShipProfile = null;
let explorationAutoRunning = false;
let currentTarotKingdomPet = null;
let currentExplorationStages = [];
let tarotKingdomPetOfferDialogPromise = null;
let explorationReturnSequence = null;

const EXPLORATION_RETURN_MIN_MS = 900;
// All exploration destination PNGs use a 12px transparent export gutter.
// Compensate at the rendered scale so the visible artwork, not its canvas, aligns to the scene.
const EXPLORATION_DESTINATION_ART_TRANSPARENT_GUTTER = 12;

function setCurrentTarotKingdomPet(currentPet = null) {
    currentTarotKingdomPet = currentPet && typeof currentPet === 'object'
        ? { ...currentPet }
        : null;
    window.dispatchEvent(new CustomEvent('tarot-kingdom:pet-changed', {
        detail: { currentPet: currentTarotKingdomPet }
    }));
}

const HOME_PLAYER_SHIP_FRAME_SIZE = 64;
const HOME_PLAYER_SHIP_DIRECTION_FRAME_SPAN = HOME_PLAYER_SHIP_FRAME_SIZE * 3;
const HOME_PLAYER_SHIP_DIRECTIONS = [
    { key: 'row0-a', spriteY: 0, frameOffsetX: 0 },
    { key: 'row0-b', spriteY: 0, frameOffsetX: -HOME_PLAYER_SHIP_DIRECTION_FRAME_SPAN },
    { key: 'row1-a', spriteY: -64, frameOffsetX: 0 },
    { key: 'row1-b', spriteY: -64, frameOffsetX: -HOME_PLAYER_SHIP_DIRECTION_FRAME_SPAN },
    { key: 'row2-a', spriteY: -128, frameOffsetX: 0 },
    { key: 'row2-b', spriteY: -128, frameOffsetX: -HOME_PLAYER_SHIP_DIRECTION_FRAME_SPAN },
    { key: 'row3-a', spriteY: -192, frameOffsetX: 0 },
    { key: 'row3-b', spriteY: -192, frameOffsetX: -HOME_PLAYER_SHIP_DIRECTION_FRAME_SPAN }
];
const HOME_PLAYER_SHIP_LEFT_DIRECTION_KEY = 'row1-a';
const HOME_GUILD_SHIP_LEFT_DIRECTION_KEY = 'guild-left';
const HOME_GUILD_SHIP_DIRECTIONS = [
    { key: 'guild-down', spriteY: 0, frameOffsetX: 0 },
    { key: 'guild-left', spriteY: -64, frameOffsetX: 0 },
    { key: 'guild-right', spriteY: -128, frameOffsetX: 0 },
    { key: 'guild-up', spriteY: -192, frameOffsetX: 0 }
];
const GUILD_SHIP_SAIL_COLOR_OFFSETS = {
    white: 0,
    red: 3,
    blue: 6,
    yellow: 9,
    green: 12
};
const GUILD_SHIP_SAIL_COLOR_BY_NATION = {
    fire: 'red',
    water: 'blue',
    wind: 'yellow',
    earth: 'green'
};

function normalizePlayerShipForm(form) {
    const key = String(form || 'boat').toLowerCase();
    return PLAYER_SHIP_LABELS[key] ? key : 'boat';
}

function normalizeExplorationDestinationVisualKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    const underscored = raw.replace(/-/g, '_');
    return EXPLORATION_DESTINATION_ALIASES[raw]
        || EXPLORATION_DESTINATION_ALIASES[underscored]
        || (EXPLORATION_DESTINATION_VISUALS[raw] ? raw : '')
        || (EXPLORATION_DESTINATION_VISUALS[underscored] ? underscored : '')
        || 'default';
}

function getExplorationDestinationVisual(destinationOrId) {
    const destination = destinationOrId && typeof destinationOrId === 'object' ? destinationOrId : null;
    const key = normalizeExplorationDestinationVisualKey(destination?.id || destination?.destinationId || destinationOrId);
    const visual = EXPLORATION_DESTINATION_VISUALS[key] || EXPLORATION_DESTINATION_VISUALS.default;
    const imagePath = String(
        destination?.destinationImagePath
        || destination?.destination_image_path
        || destination?.imagePath
        || destination?.image_path
        || destination?.visualImagePath
        || visual.imagePath
        || ''
    ).trim();
    return {
        ...visual,
        imagePath
    };
}

function renderExplorationDestinationVisual(destinationOrId, className, tagName = 'span') {
    const visual = getExplorationDestinationVisual(destinationOrId);
    const tag = tagName === 'div' ? 'div' : 'span';
    const classes = [className, visual.imagePath ? 'has-image' : 'has-emoji'].filter(Boolean).join(' ');
    const content = visual.imagePath
        ? `<img src="${escapeHtml(visual.imagePath)}" alt="" loading="lazy" decoding="async">`
        : escapeHtml(visual.island);
    return `<${tag} class="${escapeHtml(classes)}" aria-hidden="true" data-exploration-destination-visual>${content}</${tag}>`;
}

function alignExplorationSequenceIslandArtwork(overlay) {
    const island = overlay?.querySelector('.exploration-sequence-island.has-image');
    const image = island?.querySelector('img');
    if (!island || !image) return;

    const applyVisibleArtworkOffset = () => {
        const imageWidth = Number(image.naturalWidth) || 0;
        const imageHeight = Number(image.naturalHeight) || 0;
        const islandWidth = island.clientWidth;
        const islandHeight = island.clientHeight;
        if (imageWidth <= 0 || imageHeight <= 0 || islandWidth <= 0 || islandHeight <= 0) return;

        const renderedScale = Math.min(islandWidth / imageWidth, islandHeight / imageHeight);
        const artworkBottomInset = EXPLORATION_DESTINATION_ART_TRANSPARENT_GUTTER * renderedScale;
        island.style.setProperty('--exploration-island-art-bottom-offset', `${artworkBottomInset.toFixed(3)}px`);
    };

    if (image.complete) applyVisibleArtworkOffset();
    image.addEventListener('load', applyVisibleArtworkOffset, { once: true });
}

function getPlayerShipClassName(form) {
    const key = normalizePlayerShipForm(form);
    return `home-player-ship-icon is-${key}`;
}

function normalizeGuildShipSailColor(value) {
    const key = String(value || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(GUILD_SHIP_SAIL_COLOR_OFFSETS, key) ? key : 'white';
}

function resolveGuildShipSailColor(ship) {
    const direct = normalizeGuildShipSailColor(ship?.appearance?.color || ship?.sailColor);
    if (direct !== 'white') return direct;
    const nationColor = GUILD_SHIP_SAIL_COLOR_BY_NATION[String(ship?.nationKey || ship?.nation || '').trim().toLowerCase()];
    return normalizeGuildShipSailColor(nationColor || direct);
}

function renderGuildShipLayers(ship) {
    const color = resolveGuildShipSailColor(ship);
    return `
        <span class="home-guild-ship-layer is-hull" aria-hidden="true"></span>
        <span class="home-guild-ship-layer is-sail-bottom is-${color}" aria-hidden="true"></span>
        <span class="home-guild-ship-layer is-sail-middle is-${color}" aria-hidden="true"></span>
        <span class="home-guild-ship-layer is-sail-top is-${color}" aria-hidden="true"></span>
    `;
}

function createOnlineBattleShipProfile(ship) {
    if (!ship || typeof ship !== 'object') return null;
    const form = normalizePlayerShipForm(ship.form);
    return {
        form,
        sailColor: form === 'guild' ? resolveGuildShipSailColor(ship) : 'white'
    };
}

function withPlayerShipStatusContext(status, fallbackPlayFabId) {
    const ship = status?.ship || null;
    if (!ship) return null;
    const isSharedShip = Boolean(ship.isSharedShip ?? status?.isSharedShip);
    return {
        ...ship,
        shipId: ship.shipId || ship.ShipId || ship.id || status?.shipId || status?.activeShipId || ship.guildShipId || null,
        shipOwnerPlayFabId: ship.shipOwnerPlayFabId || status?.shipOwnerPlayFabId || fallbackPlayFabId || null,
        isSharedShip,
        guildId: ship.guildId || status?.guildId || null,
        guildName: ship.guildName || status?.guildName || '',
        kingShipName: ship.kingShipName || status?.kingShipName || '',
        captainName: ship.captainName || status?.captainName || ''
    };
}

function isSharedPlayerShipProfile(ship) {
    return Boolean(ship?.isSharedShip || ship?.isGuildShip || ship?.guildShip || ship?.sharedForPlayFabId);
}

function getPlayerShipOwnerLabel(ship) {
    if (ship?.isGuildShip || ship?.guildShip) {
        const kingShipName = String(ship?.kingShipName || '').trim();
        if (kingShipName) return kingShipName;
        const captainName = String(ship?.captainName || '').trim();
        if (ship?.isNationGuild && captainName) return `${captainName}の船`;
        const guildName = String(ship?.guildName || '').trim();
        return guildName ? `${guildName}の船` : 'ギルドシップ';
    }
    if (!isSharedPlayerShipProfile(ship)) return '自分の船';
    const ownerName = String(
        ship?.captainName
        || ship?.ownerDisplayName
        || ship?.ownerName
        || ship?.guildCaptainName
        || ''
    ).trim();
    if (ownerName) return `${ownerName}の船`;
    const guildName = String(ship?.guildName || '').trim();
    return guildName ? `${guildName}の船` : '仲間の船';
}

function parseCssPixelValue(value, fallback = 0) {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getHomePlayerShipGroupX(icon) {
    if (!icon) return 0;
    const styles = window.getComputedStyle(icon);
    const groupX = parseCssPixelValue(styles.getPropertyValue('--player-ship-group-x'), Number.NaN);
    if (Number.isFinite(groupX)) return groupX;
    const spriteX = parseCssPixelValue(styles.getPropertyValue('--player-ship-sprite-x'), -HOME_PLAYER_SHIP_FRAME_SIZE);
    return spriteX + HOME_PLAYER_SHIP_FRAME_SIZE;
}

function getHomePlayerShipDirectionKey(icon) {
    const key = icon?.dataset.playerShipDirection || (icon?.classList?.contains('is-guild') ? HOME_GUILD_SHIP_LEFT_DIRECTION_KEY : HOME_PLAYER_SHIP_LEFT_DIRECTION_KEY);
    const directions = icon?.classList?.contains('is-guild') ? HOME_GUILD_SHIP_DIRECTIONS : HOME_PLAYER_SHIP_DIRECTIONS;
    return directions.some((direction) => direction.key === key) ? key : directions[0].key;
}

function getHomePlayerShipDirection(directionKey) {
    return HOME_GUILD_SHIP_DIRECTIONS.find((direction) => direction.key === directionKey)
        || HOME_PLAYER_SHIP_DIRECTIONS.find((direction) => direction.key === directionKey)
        || HOME_PLAYER_SHIP_DIRECTIONS[0];
}

function applyPlayerShipFrameDirection(icon, directionKey) {
    if (!icon) return null;
    const direction = getHomePlayerShipDirection(directionKey);
    const firstFrameX = getHomePlayerShipGroupX(icon) + direction.frameOffsetX;
    const restingFrameX = firstFrameX - HOME_PLAYER_SHIP_FRAME_SIZE;
    icon.dataset.playerShipDirection = direction.key;
    icon.style.setProperty('--player-ship-animation-x', `${firstFrameX}px`);
    icon.style.setProperty('--player-ship-sprite-x', `${restingFrameX}px`);
    icon.style.setProperty('--player-ship-sprite-y', `${direction.spriteY}px`);
    if (icon.classList.contains('is-guild')) {
        const color = normalizeGuildShipSailColor(icon.dataset.guildSailColor);
        const sailFirstFrameX = -(GUILD_SHIP_SAIL_COLOR_OFFSETS[color] || 0) * HOME_PLAYER_SHIP_FRAME_SIZE;
        icon.style.setProperty('--guild-hull-animation-x', '0px');
        icon.style.setProperty('--guild-hull-frame-x', `-${HOME_PLAYER_SHIP_FRAME_SIZE}px`);
        icon.style.setProperty('--guild-sail-animation-x', `${sailFirstFrameX}px`);
        icon.style.setProperty('--guild-sail-frame-x', `${sailFirstFrameX - HOME_PLAYER_SHIP_FRAME_SIZE}px`);
        icon.style.setProperty('--guild-top-y', `${direction.spriteY}px`);
    }
    return direction;
}

function openHomePlayerShipDetails(event) {
    const icon = event?.currentTarget;
    const frame = icon?.closest('#homePlayerShipFrame');
    if (!icon || frame?.classList.contains('is-exploring')) return;
    const shipId = String(icon.dataset.playerShipId || currentPlayerShipProfile?.shipId || currentPlayerShipProfile?.guildShipId || '').trim();
    if (!shipId) {
        showRpgMessage('船情報を取得できませんでした。');
        return;
    }
    if (typeof window.viewShipDetails === 'function') {
        window.viewShipDetails(shipId, currentPlayerShipProfile || {});
    }
}

function handleHomePlayerShipTapKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openHomePlayerShipDetails(event);
}

function formatShipUpgradeCost(costs) {
    const entries = Array.isArray(costs) ? costs : [];
    if (!entries.length) return '';
    return entries.map((cost) => {
        const id = String(cost?.ItemId || cost?.itemId || '').toUpperCase();
        const amount = Number(cost?.Amount ?? cost?.amount ?? 0) || 0;
        return id === 'PS' ? `${amount.toLocaleString('ja-JP')}G` : `${id}×${amount.toLocaleString('ja-JP')}`;
    }).join(' / ');
}

function getShipEvolutionButtonCostLabel(upgrades, upgradeCosts) {
    const labels = [];
    const seen = new Set();
    (Array.isArray(upgrades) ? upgrades : []).forEach((target) => {
        const targetForm = normalizePlayerShipForm(target);
        const costLabel = formatShipUpgradeCost(upgradeCosts?.[targetForm] || upgradeCosts?.[target]);
        if (!costLabel || seen.has(costLabel)) return;
        seen.add(costLabel);
        labels.push(costLabel);
    });
    if (!labels.length) return '';
    if (labels.length === 1) return labels[0];
    return `${labels[0]}〜`;
}

function renderShipEvolutionChoiceOptions(upgrades, upgradeCosts) {
    return upgrades.map((target) => {
        const targetForm = normalizePlayerShipForm(target);
        const label = PLAYER_SHIP_LABELS[targetForm] || targetForm;
        const costLabel = formatShipUpgradeCost(upgradeCosts[targetForm] || upgradeCosts[target]);
        return `
            <button type="button" data-player-ship-choice="${escapeHtml(targetForm)}">
                <strong>${escapeHtml(label)}</strong>
                ${costLabel ? `<span>${escapeHtml(costLabel)}</span>` : ''}
            </button>
        `;
    }).join('');
}

function showShipEvolutionChoice(upgrades, upgradeCosts) {
    const choices = (Array.isArray(upgrades) ? upgrades : []).map(normalizePlayerShipForm).filter(Boolean);
    if (!choices.length) return;
    if (choices.length === 1) {
        upgradePlayerShipProfile(choices[0]);
        return;
    }

    const existing = document.querySelector('.ship-evolution-choice-overlay');
    existing?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'ship-evolution-choice-overlay';
    overlay.innerHTML = `
        <div class="ship-evolution-choice-dialog" role="dialog" aria-modal="true" aria-label="進化先を選択">
            <div class="ship-evolution-choice-head">
                <strong>進化先</strong>
                <button type="button" class="ship-evolution-choice-close ui-modal-close" aria-label="閉じる"></button>
            </div>
            <div class="ship-evolution-choice-list">
                ${renderShipEvolutionChoiceOptions(choices, upgradeCosts || {})}
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    const hadModalLock = document.body.classList.contains('modal-lock');
    document.body.classList.add('modal-lock');

    const close = () => {
        overlay.remove();
        if (!hadModalLock) document.body.classList.remove('modal-lock');
    };
    bindModalClose(overlay.querySelector('.ship-evolution-choice-close'), close, {
        overlay,
        closeOnBackdrop: true,
        closeOnEscape: true,
        icon: true
    });
    overlay.querySelectorAll('[data-player-ship-choice]').forEach((button) => {
        button.addEventListener('click', () => {
            const target = String(button.getAttribute('data-player-ship-choice') || '');
            close();
            upgradePlayerShipProfile(target);
        });
    });
}

function renderPlayerShipWidget(ship) {
    const container = document.getElementById('homePlayerShipFrame');
    if (!container) return;
    currentPlayerShipProfile = ship || null;
    const form = normalizePlayerShipForm(ship?.form);
    const label = PLAYER_SHIP_LABELS[form] || 'ボート';
    const shipName = String(ship?.name || label).trim() || label;
    const isSharedShip = isSharedPlayerShipProfile(ship);
    const ownerLabel = getPlayerShipOwnerLabel(ship);
    const upgrades = Array.isArray(ship?.upgradeOptions) ? ship.upgradeOptions : [];
    const upgradeCosts = ship?.upgradeCosts || {};
    const evolveCostLabel = getShipEvolutionButtonCostLabel(upgrades, upgradeCosts);
    const guildSailColor = form === 'guild' ? resolveGuildShipSailColor(ship) : 'white';
    const guildLayers = form === 'guild' ? renderGuildShipLayers(ship) : '';
    const detailsShipId = ship?.shipId || ship?.ShipId || ship?.id || ship?.guildShipId || '';
    container.classList.toggle('is-shared-ship', isSharedShip);
    container.innerHTML = `
        <div class="home-player-ship-owner" data-player-ship-owner>${escapeHtml(ownerLabel)}</div>
        <div class="home-player-ship-head">
            <button type="button" class="home-player-ship-name" data-player-ship-rename ${isSharedShip ? 'disabled aria-disabled="true"' : ''}>${escapeHtml(shipName)}</button>
        </div>
        <div class="home-player-ship-body">
            <div class="${getPlayerShipClassName(form)}" data-player-ship-tap data-player-ship-id="${escapeHtml(detailsShipId)}" data-guild-sail-color="${escapeHtml(guildSailColor)}" role="button" tabindex="0" aria-label="船情報を開く">${guildLayers}</div>
        </div>
        ${upgrades.length ? `
            <div class="home-player-ship-upgrades">
                <button type="button" data-player-ship-evolve ${isSharedShip ? 'disabled aria-disabled="true"' : ''}>
                    <span class="home-player-ship-evolve-main">進化</span>
                    ${evolveCostLabel ? `<span class="home-player-ship-evolve-cost">${escapeHtml(evolveCostLabel)}</span>` : ''}
                </button>
            </div>
        ` : '<div class="home-player-ship-final">完成</div>'}
    `;
    if (!isSharedShip) {
        container.querySelector('[data-player-ship-evolve]')?.addEventListener('click', () => showShipEvolutionChoice(upgrades, upgradeCosts));
        container.querySelector('[data-player-ship-rename]')?.addEventListener('click', renamePlayerShipProfile);
    }
    const shipIcon = container.querySelector('[data-player-ship-tap]');
    applyPlayerShipFrameDirection(shipIcon, form === 'guild' ? HOME_GUILD_SHIP_LEFT_DIRECTION_KEY : HOME_PLAYER_SHIP_LEFT_DIRECTION_KEY);
    shipIcon?.addEventListener('click', openHomePlayerShipDetails);
    shipIcon?.addEventListener('keydown', handleHomePlayerShipTapKeydown);
}

async function renamePlayerShipProfile() {
    const playFabId = window.myPlayFabId;
    if (!playFabId || !currentPlayerShipProfile) return;
    if (isSharedPlayerShipProfile(currentPlayerShipProfile)) {
        showRpgMessage('他プレイヤーの船は名前を変更できません。');
        return;
    }
    const currentName = String(currentPlayerShipProfile.name || '').trim();
    const input = window.prompt('船の名前を入力してください（16文字まで）', currentName);
    if (input === null) return;
    const name = String(input || '').trim();
    if (!name) {
        showRpgMessage('船の名前を入力してください。');
        return;
    }
    if (name.length > 16) {
        showRpgMessage('船の名前は16文字までです。');
        return;
    }
    try {
        const data = await requestRenamePlayerShip(playFabId, name, { throwOnError: true });
        renderPlayerShipWidget(withPlayerShipStatusContext(data, playFabId));
        showRpgMessage(`船の名前を「${name}」にしました。`);
    } catch (error) {
        showRpgMessage(error?.message || '船の名前を変更できませんでした。');
    }
}

function showShipEvolutionReveal(beforeShip, afterShip) {
    const afterForm = normalizePlayerShipForm(afterShip?.form);
    const beforeForm = normalizePlayerShipForm(beforeShip?.form);
    const afterLabel = PLAYER_SHIP_LABELS[afterForm] || '船';
    const beforeLabel = PLAYER_SHIP_LABELS[beforeForm] || '船';
    const existing = document.querySelector('.ship-evolution-overlay');
    existing?.remove();

    const overlay = document.createElement('div');
    overlay.className = `ship-evolution-overlay is-${afterForm}`;
    overlay.innerHTML = `
        <div class="ship-evolution-dialog" role="dialog" aria-modal="true" aria-label="船の進化">
            <button type="button" class="ship-evolution-close ui-modal-close" aria-label="閉じる"></button>
            <div class="ship-evolution-stage">
                <div class="ship-evolution-wake"></div>
                <div class="ship-evolution-ship is-before is-${beforeForm}" aria-hidden="true"></div>
                <div class="ship-evolution-light" aria-hidden="true"></div>
                <div class="ship-evolution-ship is-after is-${afterForm}" aria-hidden="true"></div>
                <div class="ship-evolution-bursts" aria-hidden="true">
                    ${Array.from({ length: 16 }, (_, index) => `<span style="--i:${index};"></span>`).join('')}
                </div>
            </div>
            <div class="ship-evolution-copy">
                <span>${escapeHtml(beforeLabel)}</span>
                <strong>${escapeHtml(afterLabel)}へ進化</strong>
            </div>
            <button type="button" class="ship-evolution-ok">閉じる</button>
        </div>
    `;
    document.body.appendChild(overlay);
    const hadModalLock = document.body.classList.contains('modal-lock');
    document.body.classList.add('modal-lock');

    const close = () => {
        overlay.remove();
        if (!hadModalLock) document.body.classList.remove('modal-lock');
    };
    bindModalClose(overlay.querySelector('.ship-evolution-close'), close, {
        overlay,
        closeOnBackdrop: true,
        closeOnEscape: true,
        icon: true
    });
    bindModalClose(overlay.querySelector('.ship-evolution-ok'), close);
    window.setTimeout(() => {
        overlay.classList.add('is-finished');
    }, 1800);
}

export async function loadPlayerShipProfile(playFabId) {
    if (!playFabId) return null;
    try {
        const data = await requestPlayerShipStatus(playFabId, { isSilent: true, throwOnError: true });
        const ship = withPlayerShipStatusContext(data, playFabId);
        renderPlayerShipWidget(ship);
        return ship;
    } catch (error) {
        const container = document.getElementById('homePlayerShipFrame');
        if (container) {
            container.classList.remove('is-shared-ship');
            container.innerHTML = '<div class="home-player-ship-empty">船情報を読み込めませんでした。</div>';
        }
        return null;
    }
}

export async function getOnlineBattleShipProfile(playFabId = window.myPlayFabId) {
    const normalizedPlayFabId = String(playFabId || '').trim();
    const currentOwnerId = String(currentPlayerShipProfile?.shipOwnerPlayFabId || '').trim();
    if (
        currentPlayerShipProfile
        && (!normalizedPlayFabId || !currentOwnerId || currentOwnerId === normalizedPlayFabId)
    ) {
        return createOnlineBattleShipProfile(currentPlayerShipProfile);
    }
    if (!normalizedPlayFabId) return null;
    try {
        const data = await requestPlayerShipStatus(normalizedPlayFabId, { isSilent: true, throwOnError: true });
        return createOnlineBattleShipProfile(withPlayerShipStatusContext(data, normalizedPlayFabId));
    } catch (error) {
        console.warn('[ship] online battle ship profile could not be loaded:', error);
        return null;
    }
}

async function upgradePlayerShipProfile(targetForm) {
    const playFabId = window.myPlayFabId;
    if (!playFabId || !targetForm) return;
    if (isSharedPlayerShipProfile(currentPlayerShipProfile)) {
        showRpgMessage('他プレイヤーの船は進化できません。');
        return;
    }
    const label = PLAYER_SHIP_LABELS[targetForm] || targetForm;
    if (!window.confirm(`${label}へ進化します。よろしいですか？`)) return;
    try {
        const beforeShip = currentPlayerShipProfile;
        const data = await requestUpgradePlayerShip(playFabId, targetForm, createRequestId('player-ship-upgrade'), { throwOnError: true });
        const ship = withPlayerShipStatusContext(data, playFabId);
        renderPlayerShipWidget(ship);
        showShipEvolutionReveal(beforeShip, data?.ship || { form: targetForm });
        await loadExplorationPanel(playFabId);
        showRpgMessage(`船が${label}へ進化しました。`);
    } catch (error) {
        showRpgMessage(error?.message || '船を進化できませんでした。');
    }
}

function hashExplorationMonsterSeed(value) {
    return String(value || '').split('').reduce((hash, ch) => (
        ((hash << 5) - hash + ch.charCodeAt(0)) >>> 0
    ), 0);
}

function selectExplorationTarotMonster(report = {}, destinationId = '') {
    const requestedId = String(report?.monsterId || report?.tarotMonsterId || '').trim();
    const requested = PIXEL_MONSTERS_ROSTER.find((monster) => monster.id === requestedId);
    if (requested) return requested;
    const tier = normalizeExplorationBossTier(report?.bossTier || report?.tier);
    const candidates = tier === 'strong'
        ? PIXEL_MONSTERS_ROSTER.filter((monster) => monster.isBoss === true)
        : PIXEL_MONSTERS_ROSTER.filter((monster) => monster.isBoss !== true);
    const pool = candidates.length ? candidates : PIXEL_MONSTERS_ROSTER;
    const seed = hashExplorationMonsterSeed([
        destinationId,
        report?.bossId || report?.id || report?.bossSpriteId || report?.name || report?.bossName,
        tier
    ].join(':'));
    return pool[seed % pool.length] || PIXEL_MONSTERS_ROSTER[0] || null;
}

// Idle先頭フレームの不透明画素範囲。探索リストでは、攻撃・死亡モーション由来の
// 透明余白ではなく実際のモンスター本体を基準に倍率と中央位置を揃える。
const EXPLORATION_MONSTER_IDLE_ART_BOUNDS = Object.freeze({
    'ismartal-vol1-monster-01': [1, 11, 39, 34],
    'ismartal-vol1-monster-02': [11, 8, 31, 45],
    'ismartal-vol1-monster-03': [30, 9, 49, 36],
    'ismartal-vol1-monster-04': [10, 7, 49, 37],
    'ismartal-vol1-monster-05': [22, 32, 33, 45],
    'ismartal-vol1-monster-06': [30, 1, 68, 33],
    'ismartal-vol1-monster-07': [33, 34, 52, 59],
    'ismartal-vol1-monster-08': [15, 4, 47, 23],
    'ismartal-vol1-monster-09': [0, 6, 32, 42],
    'ismartal-vol1-monster-10': [17, 5, 43, 21],
    'ismartal-vol1-monster-11': [21, 5, 67, 36],
    'ismartal-vol1-monster-12': [10, 13, 39, 34],
    'ismartal-vol1-monster-13': [36, 10, 64, 36],
    'ismartal-vol1-monster-14': [25, 4, 51, 35],
    'ismartal-vol1-monster-15': [29, 15, 71, 62],
    'ismartal-vol1-monster-16': [9, 22, 49, 48],
    'ismartal-vol1-monster-17': [12, 13, 37, 28],
    'ismartal-vol1-monster-18': [27, 21, 56, 43],
    'ismartal-vol1-monster-19': [16, 17, 36, 31],
    'ismartal-vol1-monster-20': [1, 5, 63, 34],
    'ismartal-vol2-monster-01': [26, 42, 62, 57],
    'ismartal-vol2-monster-02': [36, 25, 64, 59],
    'ismartal-vol2-monster-03': [7, 4, 59, 65],
    'ismartal-vol2-monster-04': [21, 12, 47, 44],
    'ismartal-vol2-monster-05': [23, 35, 57, 59],
    'ismartal-vol2-monster-06': [0, 0, 62, 32],
    'ismartal-vol2-monster-07': [11, 24, 157, 112],
    'ismartal-vol2-monster-08': [24, 25, 43, 59],
    'ismartal-vol2-monster-09': [3, 5, 32, 42],
    'ismartal-vol2-monster-10': [19, 31, 65, 66],
    'ismartal-vol2-monster-11': [5, 4, 32, 39],
    'ismartal-vol2-monster-12': [52, 14, 83, 36],
    'ismartal-vol2-monster-13': [32, 51, 60, 66],
    'ismartal-vol2-monster-14': [20, 39, 65, 57],
    'ismartal-vol2-monster-15': [48, 2, 241, 104],
    'ismartal-vol2-monster-16': [53, 53, 114, 143],
    'ismartal-vol2-monster-17': [38, 49, 78, 79],
    'ismartal-vol2-monster-18': [31, 12, 57, 46],
    'ismartal-vol2-monster-19': [15, 10, 59, 42],
    'ismartal-vol2-monster-20': [7, 5, 38, 33],
    'ismartal-vol3-monster-01': [21, 40, 58, 73],
    'ismartal-vol3-monster-02': [3, 7, 32, 51],
    'ismartal-vol3-monster-03': [5, 2, 42, 46],
    'ismartal-vol3-monster-04': [8, 15, 27, 31],
    'ismartal-vol3-monster-05': [9, 12, 49, 36],
    'ismartal-vol3-monster-06': [24, 31, 44, 59],
    'ismartal-vol3-monster-07': [16, 1, 42, 33],
    'ismartal-vol3-monster-08': [12, 17, 38, 47],
    'ismartal-vol3-monster-09': [34, 36, 62, 68],
    'ismartal-vol3-monster-10': [14, 16, 50, 54]
});

function renderExplorationPixelMonster(
    monster,
    className = '',
    {
        maxWidth = 120,
        maxHeight = 100,
        compactMaxWidth = maxWidth,
        compactMaxHeight = maxHeight,
        fitVisibleArt = false
    } = {}
) {
    const idle = monster?.animations?.idle;
    if (!monster || !idle?.src) return '';
    const frameWidth = Math.max(1, Number(monster.frameWidth) || 1);
    const frameHeight = Math.max(1, Number(monster.frameHeight) || 1);
    const pixelScale = Math.max(1, Number(monster.pixelScale) || 2);
    const columns = Math.max(1, Number(idle.columns) || 1);
    const rows = Math.max(1, Math.ceil((Number(idle.frameCount) || 1) / columns));
    const displayWidth = frameWidth * pixelScale;
    const displayHeight = frameHeight * pixelScale;
    const artBounds = fitVisibleArt
        ? EXPLORATION_MONSTER_IDLE_ART_BOUNDS[monster.id]
        : null;
    const artLeft = Math.max(0, Math.min(frameWidth, Number(artBounds?.[0]) || 0));
    const artTop = Math.max(0, Math.min(frameHeight, Number(artBounds?.[1]) || 0));
    const artRight = Math.max(artLeft + 1, Math.min(frameWidth, Number(artBounds?.[2]) || frameWidth));
    const artBottom = Math.max(artTop + 1, Math.min(frameHeight, Number(artBounds?.[3]) || frameHeight));
    const artDisplayWidth = (artRight - artLeft) * pixelScale;
    const artDisplayHeight = (artBottom - artTop) * pixelScale;
    const idleAnchor = monster.idleAnchor && typeof monster.idleAnchor === 'object'
        ? monster.idleAnchor
        : {};
    const anchorMode = idleAnchor.mode === 'air' ? 'air' : 'ground';
    const previewBaseline = fitVisibleArt ? (anchorMode === 'air' ? 8 : 4) : (anchorMode === 'air' ? 18 : 5);
    const compactPreviewBaseline = fitVisibleArt ? (anchorMode === 'air' ? 7 : 4) : (anchorMode === 'air' ? 12 : 4);
    const previewArtMaxHeight = Math.max(1, maxHeight - (fitVisibleArt ? previewBaseline : 0));
    const compactArtMaxHeight = Math.max(1, compactMaxHeight - (fitVisibleArt ? compactPreviewBaseline : 0));
    const previewScale = Math.min(1, maxWidth / artDisplayWidth, previewArtMaxHeight / artDisplayHeight);
    const compactPreviewScale = Math.min(
        1,
        compactMaxWidth / artDisplayWidth,
        compactArtMaxHeight / artDisplayHeight
    );
    const anchorX = fitVisibleArt
        ? (artLeft + artRight) / 2
        : Math.max(0, Math.min(frameWidth, Number(idleAnchor.x) || (frameWidth / 2)));
    const anchorY = fitVisibleArt
        ? artBottom
        : Math.max(0, Math.min(frameHeight, Number(idleAnchor.y) || frameHeight));
    const getAnchorOffsetX = (scale) => ((frameWidth / 2) - anchorX) * pixelScale * scale;
    const getAnchorBottom = (scale, baseline) => (
        baseline
        - ((frameHeight - anchorY) * pixelScale * scale)
    );
    const style = [
        `width:${displayWidth}px`,
        `height:${displayHeight}px`,
        `background-image:url('${escapeHtml(idle.src)}')`,
        `background-size:${frameWidth * columns * pixelScale}px ${frameHeight * rows * pixelScale}px`,
        'background-position:0 0',
        `--exploration-monster-scale:${previewScale}`,
        `--exploration-monster-compact-scale:${compactPreviewScale}`,
        `--exploration-monster-anchor-offset-x:${getAnchorOffsetX(previewScale)}px`,
        `--exploration-monster-compact-anchor-offset-x:${getAnchorOffsetX(compactPreviewScale)}px`,
        `--exploration-monster-result-bottom:${getAnchorBottom(previewScale, previewBaseline)}px`,
        `--exploration-monster-compact-result-bottom:${getAnchorBottom(compactPreviewScale, compactPreviewBaseline)}px`,
        'transform:scale(var(--exploration-monster-scale))'
    ].join(';');
    return `<span class="exploration-pixel-monster ${escapeHtml(className)}${monster.isBoss === true ? ' is-boss' : ''}" data-monster-anchor="${anchorMode}" style="${style}" aria-hidden="true"></span>`;
}

function renderExplorationStageMonsters(stage = {}) {
    const monsters = Array.isArray(stage?.monsters) ? stage.monsters.slice(0, 4) : [];
    if (!monsters.length) return '';
    const stageCleared = Math.max(0, Number(stage?.clearCount) || 0) > 0;
    return `
        <div class="ship-exploration-stage-monsters" aria-label="出現モンスター">
            ${monsters.map((entry) => {
                const monsterId = String(entry?.monsterId || '').trim();
                const monster = PIXEL_MONSTERS_ROSTER.find((candidate) => candidate.id === monsterId) || null;
                const defeated = entry?.defeatedByPlayer === true;
                const revealed = entry?.revealed === true || stageCleared || defeated;
                const label = revealed ? String(entry?.monsterName || monster?.name || 'モンスター') : '？？？';
                return `
                    <div class="ship-exploration-stage-monster${revealed ? ' is-revealed' : ' is-silhouette'}${defeated ? ' is-defeated' : ''}"
                        data-monster-id="${escapeHtml(monsterId)}"
                        aria-label="${escapeHtml(defeated ? `${label}・討伐済み` : label)}">
                        <div class="ship-exploration-stage-monster-visual">
                             ${renderExplorationPixelMonster(monster, 'ship-exploration-stage-monster-sprite', {
                                 maxWidth: 50,
                                 maxHeight: 46,
                                 compactMaxWidth: 42,
                                 compactMaxHeight: 40,
                                 fitVisibleArt: true
                             })}
                            ${defeated ? '<span class="ship-exploration-stage-monster-defeat" aria-label="討伐済み">討</span>' : ''}
                        </div>
                        <span class="ship-exploration-stage-monster-name">${escapeHtml(label)}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function animateExplorationPetIdle(node, monster) {
    const animation = monster?.animations?.idle;
    if (!node || !animation) return () => {};
    const frameWidth = Math.max(1, Number(monster.frameWidth) || 1);
    const frameHeight = Math.max(1, Number(monster.frameHeight) || 1);
    const pixelScale = Math.max(1, Number(monster.pixelScale) || 2);
    const columns = Math.max(1, Number(animation.columns) || 1);
    const frameCount = Math.max(1, Number(animation.frameCount) || 1);
    const intervalMs = Math.max(60, Math.round(1000 / Math.max(1, Number(animation.fps) || 10)));
    if (frameCount <= 1 || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true) {
        return () => {};
    }
    let frame = 0;
    const timerId = window.setInterval(() => {
        if (!node.isConnected) {
            window.clearInterval(timerId);
            return;
        }
        frame = (frame + 1) % frameCount;
        const col = frame % columns;
        const row = Math.floor(frame / columns);
        node.style.backgroundPosition = `-${col * frameWidth * pixelScale}px -${row * frameHeight * pixelScale}px`;
    }, intervalMs);
    return () => window.clearInterval(timerId);
}

async function showTarotKingdomPetOffer(offer, playFabId) {
    if (!offer?.offerId || !offer?.monsterId || !playFabId) return null;
    if (tarotKingdomPetOfferDialogPromise) return tarotKingdomPetOfferDialogPromise;
    const monster = PIXEL_MONSTERS_ROSTER.find((entry) => entry.id === offer.monsterId);
    if (!monster || monster.isBoss === true) return null;
    const currentPet = offer.currentPet && typeof offer.currentPet === 'object' ? offer.currentPet : null;
    const currentMonster = currentPet
        ? PIXEL_MONSTERS_ROSTER.find((entry) => entry.id === currentPet.monsterId)
        : null;
    const promise = new Promise((resolve) => {
        document.querySelector('.tarot-pet-offer-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.className = 'tarot-pet-offer-overlay';
        overlay.innerHTML = `
            <div class="tarot-pet-offer-dialog" role="dialog" aria-modal="true" aria-label="モンスター加入">
                <div class="tarot-pet-offer-stage">
                    ${renderExplorationPixelMonster(monster, 'tarot-pet-offer-monster', { maxWidth: 150, maxHeight: 126 })}
                </div>
                <div class="tarot-pet-offer-message">
                    <p>なんと　${escapeHtml(offer.monsterName || monster.name)}が<br>
                    おきあがり　なかまに　なりたそうに<br>
                    こちらをみている！</p>
                    <p>なかまに　してあげますか？</p>
                </div>
                ${currentMonster ? `
                    <div class="tarot-pet-offer-replace">
                        <span class="tarot-pet-offer-current">
                            ${renderExplorationPixelMonster(currentMonster, 'tarot-pet-offer-current-monster', { maxWidth: 58, maxHeight: 48 })}
                        </span>
                        <span>「はい」で ${escapeHtml(currentPet.monsterName || currentMonster.name)} と入れ替え</span>
                    </div>
                ` : ''}
                <div class="tarot-pet-offer-actions">
                    <button type="button" data-tarot-pet-choice="yes">▶ はい</button>
                    <button type="button" data-tarot-pet-choice="no">いいえ</button>
                </div>
                <div class="tarot-pet-offer-status" role="status" aria-live="polite"></div>
            </div>
        `;
        document.body.appendChild(overlay);
        const hadModalLock = document.body.classList.contains('modal-lock');
        document.body.classList.add('modal-lock');
        const animationStops = [];
        const candidateNode = overlay.querySelector('.tarot-pet-offer-monster');
        if (candidateNode) animationStops.push(animateExplorationPetIdle(candidateNode, monster));
        const currentNode = overlay.querySelector('.tarot-pet-offer-current-monster');
        if (currentNode && currentMonster) animationStops.push(animateExplorationPetIdle(currentNode, currentMonster));
        const buttons = Array.from(overlay.querySelectorAll('[data-tarot-pet-choice]'));
        const status = overlay.querySelector('.tarot-pet-offer-status');
        const finish = (result) => {
            animationStops.forEach((stop) => stop());
            overlay.remove();
            if (!hadModalLock) document.body.classList.remove('modal-lock');
            resolve(result);
        };
        buttons.forEach((button) => {
            button.addEventListener('click', async () => {
                const accept = button.dataset.tarotPetChoice === 'yes';
                buttons.forEach((candidate) => { candidate.disabled = true; });
                if (status) status.textContent = '返事を伝えています...';
                try {
                    const result = await requestChooseTarotKingdomPet(playFabId, offer.offerId, accept, {
                        isSilent: true,
                        throwOnError: true
                    });
                    if (status) {
                        status.textContent = accept
                            ? `${offer.monsterName || monster.name}が なかまに くわわった！`
                            : `${offer.monsterName || monster.name}は しずかに たちさった。`;
                    }
                    window.setTimeout(() => finish(result), 900);
                } catch (error) {
                    if (status) status.textContent = error?.message || '返事を伝えられませんでした。もう一度選んでください。';
                    buttons.forEach((candidate) => { candidate.disabled = false; });
                    overlay.querySelector('[data-tarot-pet-choice="yes"]')?.focus();
                }
            });
        });
        window.requestAnimationFrame(() => {
            overlay.querySelector('[data-tarot-pet-choice="yes"]')?.focus();
        });
    });
    tarotKingdomPetOfferDialogPromise = promise;
    try {
        return await promise;
    } finally {
        if (tarotKingdomPetOfferDialogPromise === promise) tarotKingdomPetOfferDialogPromise = null;
    }
}

function renderExplorationDestinationBossPool(destination) {
    const bosses = Array.isArray(destination?.bosses) ? destination.bosses : [];
    if (bosses.length) {
        return bosses.map((boss) => {
            const monster = selectExplorationTarotMonster({
                bossId: boss.id,
                bossTier: boss.tier,
                bossName: boss.name
            }, destination?.id);
            const type = monster?.isBoss === true ? 'BOSS' : 'MONSTER';
            return `${type}: ${monster?.name || '???'}`;
        }).join(' / ');
    }
    const monster = selectExplorationTarotMonster({ bossId: destination?.id, bossTier: 'weak' }, destination?.id);
    return `MONSTER: ${monster?.name || '???'}`;
}

function normalizeExplorationBossTier(tier) {
    const key = String(tier || '').trim().toLowerCase();
    return ['weak', 'medium', 'strong'].includes(key) ? key : 'unknown';
}

function renderExplorationDestinationBossChips(destination) {
    const bosses = Array.isArray(destination?.bosses) ? destination.bosses : [];
    const summary = renderExplorationDestinationBossPool(destination);
    if (!bosses.length) {
        const monster = selectExplorationTarotMonster({ bossId: destination?.id, bossTier: 'weak' }, destination?.id);
        return `
            <div class="ship-exploration-boss-list is-single" aria-label="遭遇候補: ${escapeHtml(summary)}">
                <span class="ship-exploration-boss-chip is-unknown">
                    <span class="ship-exploration-boss-avatar" aria-hidden="true">
                        ${renderExplorationPixelMonster(monster, 'ship-exploration-boss-image', { maxWidth: 34, maxHeight: 34 })}
                    </span>
                    <b>MONSTER</b>
                    <span>${escapeHtml(monster?.name || '???')}</span>
                </span>
            </div>
        `;
    }
    return `
        <div class="ship-exploration-boss-list" aria-label="遭遇候補: ${escapeHtml(summary)}">
            ${bosses.map((boss) => {
                const tier = normalizeExplorationBossTier(boss.tier);
                const monster = selectExplorationTarotMonster({
                    bossId: boss.id,
                    bossTier: boss.tier,
                    bossName: boss.name
                }, destination?.id);
                const type = monster?.isBoss === true ? 'BOSS' : 'MONSTER';
                return `
                    <span class="ship-exploration-boss-chip is-${tier}">
                        <span class="ship-exploration-boss-avatar" aria-hidden="true">
                            ${renderExplorationPixelMonster(monster, 'ship-exploration-boss-image', { maxWidth: 34, maxHeight: 34 })}
                        </span>
                        <b>${type}</b>
                        <span>${escapeHtml(monster?.name || '???')}</span>
                    </span>
                `;
            }).join('')}
        </div>
    `;
}

function renderExplorationDestinationMetaChips(destination) {
    const chips = [
        destination?.slotLabel ? { className: 'is-slot', label: destination.slotLabel } : null,
        destination?.riskLabel ? { className: 'is-risk', label: destination.riskLabel } : null,
        destination?.rewardHint ? { className: 'is-reward', label: destination.rewardHint } : null
    ].filter(Boolean);
    if (!chips.length) return '';
    return `
        <div class="ship-exploration-role-chips" aria-label="探索特徴">
            ${chips.map((chip) => `<span class="ship-exploration-role-chip ${chip.className}">${escapeHtml(chip.label)}</span>`).join('')}
        </div>
    `;
}

function getExplorationPaymentState(data) {
    if (Array.isArray(data?.explorationSupplies)) {
        return { consumables: data.explorationSupplies };
    }
    return data?.explorationPayment && typeof data.explorationPayment === 'object'
        ? data.explorationPayment
        : null;
}

function getTroyMenuSupplyUnitsFromPrice(menuPrice) {
    const price = Math.max(0, Math.floor(Number(menuPrice || 0) || 0));
    if (price >= 2000) return 3;
    if (price >= 1000) return 2;
    return 1;
}

function getExplorationPaymentConsumables(paymentState) {
    return Array.isArray(paymentState?.consumables)
        ? paymentState.consumables
            .map((item) => {
                const menuPrice = Math.max(0, Math.floor(Number(item?.menuPrice ?? item?.MenuPrice ?? 0) || 0));
                const explicitUnits = Math.floor(Number(item?.effectiveUnits ?? item?.EffectiveUnits ?? 0) || 0);
                return {
                    itemId: String(item?.itemId || item?.ItemId || '').trim(),
                    catalogItemId: String(item?.catalogItemId || item?.CatalogItemId || '').trim(),
                    displayName: String(item?.displayName || item?.DisplayName || item?.itemId || '').trim(),
                    amount: Math.max(0, Math.floor(Number(item?.amount ?? item?.Amount ?? 0) || 0)),
                    imagePath: String(item?.imagePath || item?.sprite_path || item?.image_path || '').trim(),
                    menuCategory: String(item?.menuCategory || item?.MenuCategory || '').trim().toLowerCase(),
                    menuPrice,
                    effectiveUnits: explicitUnits > 0
                        ? Math.max(1, Math.min(3, explicitUnits))
                        : getTroyMenuSupplyUnitsFromPrice(menuPrice)
                };
            })
            .filter((item) => item.itemId && item.amount > 0)
        : [];
}

function showExplorationBattleModeDialog({ stage }) {
    const stageNo = Math.max(1, Math.floor(Number(stage?.stageNo) || 1));
    const destinationId = String(stage?.id || stage?.destinationId || '').trim();
    const stageName = String(stage?.name || stage?.destinationName || `ステージ${stageNo}`);
    const firstStageMonster = Array.isArray(stage?.monsters) ? stage.monsters[0] : null;
    const stageMonster = selectExplorationTarotMonster({
        ...(stage || {}),
        monsterId: String(firstStageMonster?.monsterId || firstStageMonster?.id || stage?.monsterId || '')
    }, destinationId);
    const canOfferTutorial = stageNo === 1 && stageMonster?.isBoss !== true;
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'ship-exploration-payment-overlay';
        overlay.innerHTML = `
            <div class="ship-exploration-payment-dialog is-battle-mode" role="dialog" aria-modal="true" aria-label="プレイ方法">
                <section class="exploration-battle-mode-choice" data-exploration-battle-mode-choice aria-label="プレイ方法">
                    <div class="exploration-battle-mode-head">
                        <span>STAGE ${stageNo}</span>
                        <strong>${escapeHtml(stageName)}</strong>
                    </div>
                    <div class="exploration-battle-mode-actions">
                        <button type="button" class="is-offline" data-exploration-battle-mode="offline" aria-label="オフラインで出航">
                            <span>オフライン</span>
                            <small>傭兵とすぐに開始</small>
                        </button>
                        <button type="button" class="is-online" data-exploration-battle-mode="online" aria-label="オンラインで出航">
                            <span>オンライン</span>
                            <small>救難信号を発信</small>
                        </button>
                        <button type="button" class="is-cancel" data-exploration-battle-mode="cancel">キャンセル</button>
                    </div>
                </section>
            </div>
        `;
        const modeChoice = overlay.querySelector('[data-exploration-battle-mode-choice]');
        const cleanup = (result) => {
            overlay.remove();
            document.body.classList.remove('modal-lock');
            resolve(result);
        };
        const showTutorialChoice = () => {
            const head = modeChoice?.querySelector('.exploration-battle-mode-head');
            const actions = modeChoice?.querySelector('.exploration-battle-mode-actions');
            if (!head || !actions) {
                cleanup({ battleMode: 'offline', tutorialEnabled: false });
                return;
            }
            head.innerHTML = `
                <span>STAGE ${stageNo}</span>
                <strong>チュートリアルを開始しますか？</strong>
            `;
            actions.innerHTML = `
                <button type="button" data-exploration-tutorial="yes" aria-label="チュートリアルを開始">
                    <span>はい</span>
                    <small>遊び方を確認</small>
                </button>
                <button type="button" data-exploration-tutorial="no" aria-label="チュートリアルを開始しない">
                    <span>いいえ</span>
                    <small>通常戦で開始</small>
                </button>
                <button type="button" class="is-cancel" data-exploration-battle-mode="cancel">キャンセル</button>
            `;
        };
        modeChoice?.addEventListener('click', (event) => {
            const tutorialButton = event.target.closest('[data-exploration-tutorial]');
            if (tutorialButton) {
                cleanup({
                    battleMode: 'offline',
                    tutorialEnabled: tutorialButton.getAttribute('data-exploration-tutorial') === 'yes'
                });
                return;
            }
            const modeButton = event.target.closest('[data-exploration-battle-mode]');
            if (!modeButton) return;
            const mode = modeButton.getAttribute('data-exploration-battle-mode');
            if (mode === 'cancel') {
                cleanup(null);
                return;
            }
            if (mode === 'offline' && canOfferTutorial) {
                showTutorialChoice();
                return;
            }
            cleanup({ battleMode: mode === 'online' ? 'online' : 'offline', tutorialEnabled: false });
        });
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) cleanup(null);
        });
        document.body.appendChild(overlay);
        document.body.classList.add('modal-lock');
        modeChoice?.querySelector('button')?.focus();
    });
}

function showExplorationStageSupplyDialog({ stage, paymentState }) {
    const consumables = getExplorationPaymentConsumables(paymentState);
    return new Promise((resolve) => {
        const selectedIds = [];
        const overlay = document.createElement('div');
        overlay.className = 'ship-exploration-payment-overlay';
        overlay.innerHTML = `
            <div class="ship-exploration-payment-dialog is-stage-supply" role="dialog" aria-modal="true" aria-label="局間補給品">
                <div class="ship-exploration-payment-head">
                    <strong>STAGE ${Math.max(1, Number(stage?.stageNo) || 1)}　${escapeHtml(stage?.name || '')}</strong>
                    <span>局間に使う補給品を順番に3個まで選択（任意）</span>
                </div>
                <div class="ship-exploration-payment-summary" data-stage-supply-slots></div>
                <div class="ship-exploration-payment-list" data-stage-supply-list></div>
                <div class="ship-exploration-payment-buttons">
                    <button type="button" data-stage-supply-confirm>補給なしで出航</button>
                    <button type="button" data-stage-supply-cancel>キャンセル</button>
                </div>
            </div>
        `;
        const list = overlay.querySelector('[data-stage-supply-list]');
        const slots = overlay.querySelector('[data-stage-supply-slots]');
        const confirm = overlay.querySelector('[data-stage-supply-confirm]');
        const cleanup = (result) => {
            overlay.remove();
            document.body.classList.remove('modal-lock');
            resolve(result);
        };
        const render = () => {
            const selectedCounts = selectedIds.reduce((map, itemId) => {
                map.set(itemId, (map.get(itemId) || 0) + 1);
                return map;
            }, new Map());
            slots.innerHTML = `
                <div class="ship-exploration-stage-supply-slots" aria-label="使用順">
                    ${Array.from({ length: 3 }, (_, index) => {
                        const itemId = selectedIds[index] || '';
                        const item = consumables.find((entry) => entry.itemId === itemId);
                        return `<span class="${item ? 'is-filled' : ''}">${index + 1}. ${item ? escapeHtml(item.displayName) : 'なし'}</span>`;
                    }).join('')}
                </div>
            `;
            list.innerHTML = consumables.length
                ? consumables.map((item) => {
                    const chosen = selectedCounts.get(item.itemId) || 0;
                    const canAdd = selectedIds.length < 3 && chosen < item.amount;
                    const image = item.imagePath
                        ? `<span class="ship-exploration-payment-item-image"><img src="${escapeHtml(item.imagePath)}" alt=""></span>`
                        : '<span class="ship-exploration-payment-item-image" aria-hidden="true"></span>';
                    return `
                        <div class="ship-exploration-payment-item" data-stage-supply-item="${escapeHtml(item.itemId)}">
                            ${image}
                            <div class="ship-exploration-payment-item-copy">
                                <strong>${escapeHtml(item.displayName || item.itemId)}</strong>
                                <span>所持 ${item.amount} / 全体HP ${item.effectiveUnits * 10}%回復</span>
                            </div>
                            <div class="ship-exploration-payment-stepper">
                                <button type="button" data-stage-supply-remove${chosen > 0 ? '' : ' disabled'}>−</button>
                                <span>${chosen}</span>
                                <button type="button" data-stage-supply-add${canAdd ? '' : ' disabled'}>＋</button>
                            </div>
                        </div>
                    `;
                }).join('')
                : '<div class="ship-exploration-empty">使用できる補給品はありません。補給なしで出航できます。</div>';
            confirm.textContent = selectedIds.length > 0
                ? `${selectedIds.length}個を積んで出航`
                : '補給なしで出航';
        };
        list.addEventListener('click', (event) => {
            const row = event.target.closest('[data-stage-supply-item]');
            if (!row) return;
            const itemId = String(row.dataset.stageSupplyItem || '');
            if (event.target.closest('[data-stage-supply-add]')) {
                const item = consumables.find((entry) => entry.itemId === itemId);
                const selectedCount = selectedIds.filter((entry) => entry === itemId).length;
                if (item && selectedIds.length < 3 && selectedCount < item.amount) selectedIds.push(itemId);
            } else if (event.target.closest('[data-stage-supply-remove]')) {
                const index = selectedIds.lastIndexOf(itemId);
                if (index >= 0) selectedIds.splice(index, 1);
            }
            render();
        });
        confirm.addEventListener('click', () => {
            cleanup(selectedIds.map((itemId) => ({ itemId, quantity: 1 })));
        });
        overlay.querySelector('[data-stage-supply-cancel]')?.addEventListener('click', () => cleanup(null));
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) cleanup(null);
        });
        document.body.appendChild(overlay);
        document.body.classList.add('modal-lock');
        render();
    });
}

function normalizeBossResult(value) {
    const result = String(value || 'none').toLowerCase();
    if (result === 'victory' || result === 'defeat' || result === 'escaped' || result === 'draw') return result;
    return 'none';
}

function normalizeRewardRarity(value) {
    const rarity = String(value || 'common').trim().toLowerCase();
    return ['common', 'rare', 'epic', 'legendary'].includes(rarity) ? rarity : 'common';
}

function getRewardItemsForReveal(data) {
    const fromReport = Array.isArray(data?.report?.rewardItems) ? data.report.rewardItems : [];
    if (fromReport.length) return fromReport;
    if (Array.isArray(data?.rewardItems) && data.rewardItems.length) return data.rewardItems;
    if (data?.reward) {
        return [{
            itemId: data.reward.ItemId || data.reward.itemId || '',
            displayName: data.reward.DisplayName || data.reward.displayName || data.reward.ItemId || 'お宝',
            rarity: data.reward.Rarity || data.reward.rarity || 'common',
            category: data.reward.Category || data.reward.category || '',
            quantity: data.reward.Quantity ?? data.reward.quantity ?? 1,
            imagePath: data.reward.ImagePath || data.reward.imagePath || data.reward.image_path || '',
            spritePath: data.reward.SpritePath || data.reward.spritePath || data.reward.sprite_path || '',
            spriteIndex: data.reward.SpriteIndex ?? data.reward.spriteIndex ?? data.reward.sprite_index ?? 0,
            spriteWidth: data.reward.SpriteWidth ?? data.reward.spriteWidth ?? data.reward.sprite_w ?? 32,
            spriteHeight: data.reward.SpriteHeight ?? data.reward.spriteHeight ?? data.reward.sprite_h ?? 32
        }];
    }
    return [];
}

const EXPLORATION_BATTLE_AVATAR_PREFIX = 'exploration-battle-avatar';

function renderExplorationBattleAvatarMarkup() {
    return `
        <div id="${EXPLORATION_BATTLE_AVATAR_PREFIX}" class="exploration-sequence-avatar avatar-combat-actor" aria-hidden="true">
            ${buildAvatarLayerMarkup(EXPLORATION_BATTLE_AVATAR_PREFIX)}
        </div>
    `;
}

function renderCurrentExplorationBattleAvatar() {
    const avatarBase = window.myAvatarBaseInfo || { Race: 'human', SkinColorIndex: 1, AvatarColor: 'brown' };
    let equipment = {};
    let itemSource = {};
    try {
        equipment = Inventory.getMyCurrentEquipment?.() || {};
        itemSource = Inventory.getMyInventory?.() || {};
    } catch (error) {
        console.warn('[exploration] failed to read current avatar equipment:', error);
    }
    renderAvatar(EXPLORATION_BATTLE_AVATAR_PREFIX, avatarBase, equipment, itemSource, false);
}

function getExplorationRewardName(item) {
    return String(item?.displayName || item?.DisplayName || item?.itemId || item?.ItemId || 'お宝');
}

function getExplorationRewardQuantity(item) {
    const value = Number(item?.quantity ?? item?.Quantity ?? item?.amount ?? item?.Amount ?? item?.count ?? item?.Count ?? 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
}

const EXPLORATION_REWARD_REVEAL_OFFSETS = Object.freeze([
    { x: 0, y: -32 },
    { x: -62, y: -10 },
    { x: 62, y: -10 },
    { x: -40, y: -46 },
    { x: 40, y: -46 }
]);

function getExplorationRewardQuantityText(item) {
    const quantity = getExplorationRewardQuantity(item);
    return quantity > 1 ? ` ×${quantity.toLocaleString('ja-JP')}` : '';
}

function getExplorationRewardDisplayLabel(item) {
    return `${getExplorationRewardName(item)}${getExplorationRewardQuantityText(item)}`;
}

function getExplorationRewardAcquisitionText(rewards) {
    const items = Array.isArray(rewards) ? rewards : [];
    if (!items.length) return '戦利品を手に入れた！';
    const primaryLabel = getExplorationRewardDisplayLabel(items[0]);
    return items.length === 1
        ? `${primaryLabel}を手に入れた！`
        : `${primaryLabel}ほか${items.length - 1}種を手に入れた！`;
}

function renderExplorationRewardReveal(rewards) {
    return rewards.slice(0, EXPLORATION_REWARD_REVEAL_OFFSETS.length).map((item, index) => {
        const rarity = normalizeRewardRarity(item.rarity || item.Rarity);
        const offset = EXPLORATION_REWARD_REVEAL_OFFSETS[index];
        const quantityText = getExplorationRewardQuantityText(item).trim();
        return `
            <div class="exploration-result-loot-card is-${rarity}" style="--loot-x: ${offset.x}px; --loot-y: ${offset.y}px; --loot-delay: ${index * 90}ms;">
                <span class="exploration-result-loot-icon-frame">
                    <span class="exploration-result-loot-icon" data-exploration-result-loot-icon="${index}" aria-hidden="true"><span class="exploration-result-loot-fallback">✦</span></span>
                    ${quantityText ? `<span class="exploration-result-loot-count">${escapeHtml(quantityText)}</span>` : ''}
                </span>
            </div>
        `;
    }).join('');
}

function getExplorationRarityLabel(rarity) {
    return {
        common: 'COMMON',
        rare: 'RARE',
        epic: 'EPIC',
        legendary: 'LEGEND'
    }[normalizeRewardRarity(rarity)] || 'COMMON';
}

function getExplorationBossResultLabel(bossResult) {
    if (bossResult === 'victory') return '勝利';
    if (bossResult === 'defeat') return '撤退';
    if (bossResult === 'escaped' || bossResult === 'draw') return '離脱';
    return '発見';
}

function getExplorationBossResultText(report, bossResult) {
    if (bossResult === 'victory') return '撃破成功、HP全回復';
    if (bossResult === 'defeat') return '敗北、HP全回復';
    if (bossResult === 'escaped' || bossResult === 'draw') return '決着なし、HP全回復';
    return report?.bossName ? '接触なし、HP全回復' : '戦闘なし、HP全回復';
}

export function beginExplorationReturnSequence(result = {}) {
    if (explorationReturnSequence?.overlay?.isConnected) return explorationReturnSequence;

    const existing = document.querySelector('.exploration-sequence-overlay');
    existing?.remove();

    const ship = currentPlayerShipProfile || {};
    const form = normalizePlayerShipForm(ship.form);
    const guildSailColor = form === 'guild' ? resolveGuildShipSailColor(ship) : 'white';
    const guildLayers = form === 'guild' ? renderGuildShipLayers(ship) : '';
    const destinationName = String(result?.destinationName || '探索先').trim() || '探索先';
    const overlay = document.createElement('div');
    overlay.className = `exploration-sequence-overlay is-${form} is-sky-deep is-voyage is-returning`;
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-busy', 'true');
    overlay.innerHTML = `
        <div class="exploration-sequence-dialog" role="dialog" aria-modal="true" aria-label="宝を持って帰還中">
            <div class="exploration-sequence-scene">
                <div class="exploration-sequence-compass" aria-hidden="true"></div>
                <div class="exploration-sequence-sky"></div>
                <div class="exploration-sequence-horizon" aria-hidden="true"></div>
                <div class="exploration-sequence-ship-effect" aria-hidden="true"></div>
                <div class="exploration-sequence-ship is-${form}" data-guild-sail-color="${escapeHtml(guildSailColor)}" aria-hidden="true">${guildLayers}</div>
            </div>
            <div class="exploration-sequence-copy">
                <strong data-exploration-return-title>宝を積んで帰還中</strong>
                <span data-exploration-return-status>${escapeHtml(destinationName)}の戦利品を確認しています...</span>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    applyPlayerShipFrameDirection(
        overlay.querySelector('.exploration-sequence-ship'),
        form === 'guild' ? HOME_GUILD_SHIP_LEFT_DIRECTION_KEY : HOME_PLAYER_SHIP_LEFT_DIRECTION_KEY
    );

    const shouldOpenHome = document.body?.dataset.currentTab !== 'home'
        && typeof window.showTab === 'function';
    const navigationPromise = shouldOpenHome
        ? Promise.resolve().then(() => window.showTab('home')).catch((error) => {
            console.warn('[exploration] return navigation failed:', error);
        })
        : Promise.resolve();
    explorationReturnSequence = {
        overlay,
        startedAt: Date.now(),
        navigationPromise
    };
    return explorationReturnSequence;
}

export async function finishExplorationReturnSequence() {
    const sequence = explorationReturnSequence;
    if (!sequence) return;
    const remainingMs = Math.max(0, EXPLORATION_RETURN_MIN_MS - (Date.now() - sequence.startedAt));
    await Promise.all([sequence.navigationPromise, wait(remainingMs)]);
    if (explorationReturnSequence === sequence) explorationReturnSequence = null;
    sequence.overlay?.remove();
}

function showExplorationResultSummary(data, options = {}) {
    const report = data?.report || {};
    const kingdomResult = options?.kingdomResult || null;
    const stageNo = Math.max(0, Math.floor(Number(report?.stageNo) || 0));
    const stageRank = Math.max(0, Math.min(4, Math.floor(Number(report?.stageRank) || 0)));
    const stageResultMonsterId = String(report?.monsterId || kingdomResult?.monsterId || '').trim();
    const stageResultMonster = stageNo > 0
        ? PIXEL_MONSTERS_ROSTER.find((entry) => entry.id === stageResultMonsterId)
        : null;
    const kingdomMonster = stageResultMonster || options?.kingdomMonster || null;
    const bossResult = normalizeBossResult(
        kingdomResult?.status === 'completed' ? kingdomResult.outcome : report.bossResult
    );
    const reportDestinationId = report.destinationId || data?.active?.destinationId || data?.destinationId || '';
    const monsterIsBoss = kingdomMonster?.isBoss === true || kingdomResult?.isBoss === true;
    const destinationSource = {
        id: reportDestinationId,
        destinationId: reportDestinationId,
        imagePath: report.imagePath || data?.active?.imagePath || data?.imagePath || ''
    };
    const destinationVisual = getExplorationDestinationVisual(destinationSource);
    const destinationName = String(
        report.destinationName
        || data?.active?.destinationName
        || data?.destinationName
        || destinationVisual.label
        || '探索先'
    );
    const destinationTypeLabel = stageNo > 0 ? `STAGE ${stageNo}` : 'DESTINATION';
    const bossTierKey = kingdomMonster ? (monsterIsBoss ? 'strong' : 'weak') : normalizeExplorationBossTier(report.bossTier);
    const rewards = getRewardItemsForReveal(data);
    const rewardTotal = Number(report.rewardCount || rewards.length || 0);
    const rewardAcquisitionText = getExplorationRewardAcquisitionText(rewards);
    const chestAlreadyOpened = rewardTotal > 0 && options.chestOpened === true;
    const awaitsChestOpen = rewardTotal > 0 && !chestAlreadyOpened;
    const resultLabel = getExplorationBossResultLabel(bossResult);
    const destinationResultSummary = `${destinationTypeLabel} / ${resultLabel}`;
    const resultHint = rewardTotal > 0 ? `${rewardTotal.toLocaleString('ja-JP')}個のお宝を回収` : 'お宝は見つかりませんでした';
    const promptTitle = awaitsChestOpen ? '宝箱を開ける' : (rewardTotal > 0 ? rewardAcquisitionText : '回収なし');
    const promptText = awaitsChestOpen ? 'クリックして中身を確認してください。' : (rewardTotal > 0 ? '宝箱を開封し、戦利品を持ち帰りました。' : '航路を確認して帰還しました。');
    const highestUnlockedStage = Math.max(0, Math.floor(Number(data?.progress?.highestUnlockedStage) || 0));
    const canDepartNextStage = stageNo > 0 && highestUnlockedStage > stageNo && bossResult !== 'defeat';
    const nextExplorationLabel = canDepartNextStage ? '次のステージへ出航' : 'ステージ選択へ';
    const petProgress = data?.petProgress && typeof data.petProgress === 'object' ? data.petProgress : null;
    const currentPet = data?.currentPet && typeof data.currentPet === 'object' ? data.currentPet : null;
    const petDisplayName = String(
        currentPet?.displayName || currentPet?.nickname || currentPet?.monsterName || 'ペット'
    ).trim() || 'ペット';
    const petExperienceGained = Math.max(0, Math.floor(Number(petProgress?.gainedExperience) || 0));
    const petLevel = Math.max(1, Math.floor(Number(petProgress?.level || currentPet?.level) || 1));
    const petPreviousLevel = Math.max(1, Math.floor(Number(petProgress?.previousLevel || petLevel) || 1));
    const petProgressHtml = petExperienceGained > 0
        ? `
            <div>
                <b>ペット</b>
                <span>${escapeHtml(petDisplayName)} ${petLevel > petPreviousLevel
                    ? `Lv${petPreviousLevel} → Lv${petLevel}`
                    : `Lv${petLevel}`} / EXP +${petExperienceGained.toLocaleString('ja-JP')}</span>
            </div>
        `
        : '';
    const rewardHtml = rewards.length
        ? rewards.map((item) => {
            const rarity = normalizeRewardRarity(item.rarity || item.Rarity);
            const quantityText = getExplorationRewardQuantityText(item).trim();
            return `
                <li class="exploration-result-reward is-${rarity}">
                    <strong>${escapeHtml(getExplorationRewardName(item))}</strong>
                    <span>${escapeHtml(getExplorationRarityLabel(rarity))}${quantityText}</span>
                </li>
            `;
        }).join('')
        : `
            <li class="exploration-result-reward is-empty">
                <strong>報酬なし</strong>
                <span>NONE</span>
            </li>
        `;
    const logLines = [
        `${destinationName}を探索。`,
        bossResult === 'defeat'
            ? 'パーティは全滅し、探索先から撤退した。'
            : 'タロットキングダムを終え、探索を完了した。',
        ...(petExperienceGained > 0
            ? [`${petDisplayName}が${petExperienceGained.toLocaleString('ja-JP')}EXPを獲得${petLevel > petPreviousLevel ? `し、Lv${petLevel}になった` : 'した'}。`]
            : [])
    ];
    const logHtml = logLines.length
        ? logLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')
        : '<div>静かな航路を抜けて探索を終えました。</div>';
    const existing = document.querySelector('.exploration-result-overlay');
    existing?.remove();

    const overlay = document.createElement('div');
    overlay.className = `exploration-result-overlay is-${bossResult} is-boss-${bossTierKey} ${awaitsChestOpen ? 'is-awaiting-open' : 'is-opened'}`;
    overlay.innerHTML = `
        <div class="exploration-result-dialog" role="dialog" aria-modal="true" aria-label="探索結果">
            <button type="button" class="exploration-result-close ui-modal-close" aria-label="閉じる"></button>
            <div class="exploration-result-head">
                <span data-exploration-result-state>${awaitsChestOpen ? '宝箱を発見' : resultLabel}</span>
                <strong>${escapeHtml(destinationName)}</strong>
                <small data-exploration-result-hint>${awaitsChestOpen ? '宝箱を開けて探索結果を確認' : resultHint}</small>
            </div>
            <div class="exploration-result-showcase ${rewardTotal > 0 ? 'has-rewards' : 'is-empty'}">
                <button type="button" class="exploration-result-chest-button" data-exploration-result-open aria-label="${awaitsChestOpen ? '宝箱を開ける' : '宝箱'}" ${awaitsChestOpen ? '' : 'disabled'}>
                    <span class="exploration-result-chest ${rewardTotal > 0 ? 'has-rewards' : 'is-empty'}" aria-hidden="true"></span>
                </button>
                ${rewardTotal > 0 ? `<div class="exploration-result-loot-reveal" data-exploration-result-loot-reveal aria-hidden="true">${renderExplorationRewardReveal(rewards)}</div>` : ''}
                <div class="exploration-result-prompt">
                    <b data-exploration-result-prompt-title>${promptTitle}</b>
                    <span data-exploration-result-prompt-text>${promptText}</span>
                </div>
            </div>
            <div class="exploration-result-details" data-exploration-result-details>
                <div class="exploration-result-destination-card" data-exploration-destination-id="${escapeHtml(reportDestinationId)}">
                    <div class="exploration-result-destination-art">
                        ${renderExplorationDestinationVisual(destinationSource, 'exploration-result-destination-image', 'div')}
                    </div>
                    <div class="exploration-result-destination-copy">
                        <b>${destinationTypeLabel}</b>
                        <strong>${escapeHtml(destinationName)}</strong>
                        <span>${escapeHtml(destinationResultSummary)}</span>
                    </div>
                </div>
                <div class="exploration-result-body">
                    <div>
                        <b>結果</b>
                        <span>${stageRank > 0 ? `${stageRank}位 / ` : ''}${escapeHtml(kingdomResult?.status === 'completed'
                            ? (bossResult === 'defeat' ? 'タロットキングダム敗北' : 'タロットキングダム勝利')
                            : getExplorationBossResultText(report, bossResult))}</span>
                    </div>
                    <div>
                        <b>お宝</b>
                        <span>${rewardTotal.toLocaleString('ja-JP')}個</span>
                    </div>
                    ${petProgressHtml}
                </div>
                <ul class="exploration-result-rewards">${rewardHtml}</ul>
                <div class="exploration-result-log">${logHtml}</div>
                <div class="exploration-result-actions">
                    <button type="button" data-exploration-result-close>閉じる</button>
                    ${options.playFabId ? `<button type="button" data-exploration-result-next>${nextExplorationLabel}</button>` : ''}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-exploration-result-loot-icon]').forEach((icon, index) => {
        const rendered = Inventory.renderInventoryItemIconPreview?.(icon, rewards[index], { maxSize: 68 });
        if (!rendered) icon.classList.add('is-fallback');
    });

    const close = () => overlay.remove();
    const openResult = () => {
        if (!awaitsChestOpen || overlay.classList.contains('is-opening') || overlay.classList.contains('is-opened')) return;
        const openButton = overlay.querySelector('[data-exploration-result-open]');
        const state = overlay.querySelector('[data-exploration-result-state]');
        const hint = overlay.querySelector('[data-exploration-result-hint]');
        const promptTitle = overlay.querySelector('[data-exploration-result-prompt-title]');
        const promptText = overlay.querySelector('[data-exploration-result-prompt-text]');
        if (openButton) openButton.disabled = true;
        if (promptTitle) promptTitle.textContent = '開封中';
        if (promptText) promptText.textContent = '宝箱を開けています。';
        overlay.classList.add('is-opening');
        window.setTimeout(() => {
            overlay.classList.remove('is-awaiting-open', 'is-opening');
            overlay.classList.add('is-opened');
            if (state) state.textContent = resultLabel;
            if (hint) hint.textContent = resultHint;
            if (rewardTotal > 0) Inventory.markInventoryItemsAsNew?.(rewards);
            if (promptTitle) promptTitle.textContent = rewardAcquisitionText;
            if (promptText) promptText.textContent = '持ち物リストでNEWを確認できます。';
        }, 760);
    };
    bindModalClose(overlay.querySelector('.exploration-result-close'), close, {
        overlay,
        closeOnBackdrop: true,
        closeOnEscape: true,
        icon: true
    });
    overlay.querySelector('[data-exploration-result-open]')?.addEventListener('click', openResult);
    bindModalClose(overlay.querySelector('[data-exploration-result-close]'), close);
    overlay.querySelector('[data-exploration-result-next]')?.addEventListener('click', () => {
        close();
        if (typeof window.openHomeExplorationPopup === 'function') {
            window.openHomeExplorationPopup();
        } else {
            loadExplorationPanel(options.playFabId);
        }
    });
}

async function refreshExplorationRewardInventory(data) {
    if (!getRewardItemsForReveal(data).length || typeof window.refreshInventory !== 'function') return;
    try {
        await window.refreshInventory({ force: true });
    } catch (error) {
        console.warn('[exploration] reward inventory refresh failed:', error);
    }
}

async function handleExplorationClaimResult(data, playFabId, options = {}) {
    if (typeof window.closeHomeExplorationPopup === 'function') {
        window.closeHomeExplorationPopup();
    }
    await refreshExplorationRewardInventory(data);
    if (data?.currentPet && typeof data.currentPet === 'object') {
        window.dispatchEvent(new CustomEvent('tarot-kingdom:pet-changed', {
            detail: { currentPet: data.currentPet }
        }));
    }
    renderExplorationPanel(data, playFabId);
    await finishExplorationReturnSequence();
    showExplorationResultSummary(data, {
        playFabId,
        chestOpened: options.chestOpened === true,
        kingdomMonster: options.kingdomMonster || null,
        kingdomResult: options.kingdomResult || null
    });
}

export async function claimOnlineExplorationReward(playFabId, ownerPlayFabId, kingdomResult = {}) {
    const safePlayFabId = String(playFabId || '').trim();
    const safeOwnerPlayFabId = String(ownerPlayFabId || '').trim();
    const explorationId = String(kingdomResult?.explorationId || '').trim();
    if (
        !safePlayFabId
        || !safeOwnerPlayFabId
        || !explorationId
        || kingdomResult?.mode !== 'online'
        || kingdomResult?.status !== 'completed'
    ) return null;
    beginExplorationReturnSequence(kingdomResult);

    let lastError = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
            const claimData = await requestClaimExploration(safePlayFabId, {
                throwOnError: true,
                isSilent: true,
                ownerPlayFabId: safeOwnerPlayFabId,
                tarotOutcome: kingdomResult.outcome,
                explorationId,
                tarotFinisher: kingdomResult.finisher,
                tarotFinishers: kingdomResult.finishers,
                tarotStandings: kingdomResult.standings
            });
            await handleExplorationClaimResult(claimData, safePlayFabId, { kingdomResult });
            return claimData;
        } catch (error) {
            lastError = error;
            const message = String(error?.message || '');
            const retryable = message.includes('HTTP 400')
                || message.includes('HTTP 409')
                || message.includes('確認中')
                || message.includes('探索がありません');
            if (!retryable || attempt >= 5) break;
            await wait(450 + attempt * 150);
        }
    }
    await finishExplorationReturnSequence();
    throw lastError || new Error('探索報酬を確認できませんでした。');
}

function isExplorationStartConflict(error) {
    const message = String(error?.message || '');
    return message.includes('HTTP 409') || message.includes('探索中です');
}

function buildRecoveredExplorationStartData(explorationData, destinationId) {
    const active = explorationData?.active || {};
    const encounter = explorationData?.encounter || active?.encounter || {};
    const resolvedDestinationId = active.destinationId || encounter.destinationId || destinationId;
    const destinationVisual = getExplorationDestinationVisual(resolvedDestinationId);
    return {
        ship: explorationData?.ship || currentPlayerShipProfile || {},
        active: {
            ...active,
            destinationId: resolvedDestinationId,
            destinationName: active.destinationName || encounter.destinationName || destinationVisual.label || '探索先',
            imagePath: active.imagePath || destinationVisual.imagePath || ''
        }
    };
}

async function recoverConflictedExploration(playFabId, destinationId, options = {}) {
    showRpgMessage('前回の探索を再開します。');
    const encounterData = await requestExplorationEncounter(playFabId, { throwOnError: true });
    const recoveredStartData = buildRecoveredExplorationStartData(encounterData, destinationId);
    const sequenceResult = await showExplorationAutoSequence(
        recoveredStartData,
        recoveredStartData.active.destinationId || destinationId,
        encounterData,
        options.stage,
        {
            battleMode: options.battleMode === 'online' ? 'online' : 'offline',
            tutorialEnabled: options.tutorialEnabled === true,
            skipDeparture: true,
            autoStartOnline: true,
            startRequiresOnlineParty: options.battleMode === 'online'
        }
    );
    if (!sequenceResult?.cancelled && sequenceResult?.kingdomResult?.status === 'completed') {
        beginExplorationReturnSequence(sequenceResult.kingdomResult);
    }
    const retreated = await completeExplorationRetreat(playFabId, sequenceResult);
    if (!retreated && !sequenceResult?.cancelled) {
        const claimData = await requestClaimExploration(playFabId, {
            throwOnError: true,
            tarotOutcome: sequenceResult.kingdomResult?.outcome,
            explorationId: sequenceResult.kingdomResult?.explorationId,
            tarotFinisher: sequenceResult.kingdomResult?.finisher,
            tarotFinishers: sequenceResult.kingdomResult?.finishers,
            tarotStandings: sequenceResult.kingdomResult?.standings
        });
        if (claimData?.petOffer) await showTarotKingdomPetOffer(claimData.petOffer, playFabId);
        handleExplorationClaimResult(claimData, playFabId, sequenceResult);
    } else if (!retreated) {
        renderExplorationPanel(encounterData, playFabId);
    }
    await loadExplorationPanel(playFabId);
}

async function showExplorationDepartureLoading({
    stage,
    destinationId,
    battleMode,
    tutorialEnabled = false,
    preparationPromise
}) {
    const ship = currentPlayerShipProfile || {};
    const form = normalizePlayerShipForm(ship.form);
    const guildSailColor = form === 'guild' ? resolveGuildShipSailColor(ship) : 'white';
    const guildLayers = form === 'guild' ? renderGuildShipLayers(ship) : '';
    const destinationVisual = getExplorationDestinationVisual(stage || destinationId);
    const destinationName = String(stage?.name || destinationVisual.label || '探索先');
    const stageMonsters = Array.isArray(stage?.monsters) ? stage.monsters : [];
    const firstStageMonster = stageMonsters[0] || null;
    const stageReport = {
        ...(stage || {}),
        monsterId: String(firstStageMonster?.monsterId || firstStageMonster?.id || stage?.monsterId || '')
    };
    const kingdomMonster = selectExplorationTarotMonster(stageReport, destinationId);
    const bossTierKey = normalizeExplorationBossTier(stage?.bossTier || stage?.tier);
    const shipTrait = EXPLORATION_SHIP_TRAITS[form] || EXPLORATION_SHIP_TRAITS.boat;
    const homeFrame = document.getElementById('homePlayerShipFrame');
    const homeIcon = homeFrame?.querySelector('.home-player-ship-icon');
    const existing = document.querySelector('.exploration-sequence-overlay');
    existing?.remove();

    const overlay = document.createElement('div');
    overlay.className = `exploration-sequence-overlay is-${form} ${shipTrait.className} is-sky-${destinationVisual.sky} is-boss-${bossTierKey}`;
    overlay.innerHTML = `
        <div class="exploration-sequence-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(destinationName)}へ出航">
            <div class="exploration-sequence-scene">
                <div class="exploration-sequence-compass" aria-hidden="true"></div>
                <div class="exploration-sequence-sky"></div>
                <div class="exploration-sequence-horizon" aria-hidden="true"></div>
                <div class="exploration-sequence-arrival" aria-hidden="true"></div>
                ${renderExplorationDestinationVisual(stage || destinationId, 'exploration-sequence-island', 'div')}
                <div class="exploration-sequence-boss" data-exploration-sequence-boss>
                    ${renderExplorationPixelMonster(kingdomMonster, 'exploration-sequence-boss-image', { maxWidth: 58, maxHeight: 54 })}
                    <small>${kingdomMonster?.isBoss === true ? 'BOSS' : 'MONSTER'}</small>
                </div>
                <div class="exploration-sequence-ship-effect" aria-hidden="true"></div>
                <div class="exploration-sequence-ship is-${form}" data-exploration-party-ship data-exploration-party-role="host" data-guild-sail-color="${escapeHtml(guildSailColor)}" aria-hidden="true">${guildLayers}</div>
            </div>
            <div class="exploration-sequence-copy">
                <strong>${escapeHtml(destinationName)}</strong>
                <span data-exploration-sequence-label>${escapeHtml(shipTrait.label)}</span>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    alignExplorationSequenceIslandArtwork(overlay);
    const departureStartedAt = Date.now();
    const sequenceScene = overlay.querySelector('.exploration-sequence-scene');
    const hostShip = overlay.querySelector('[data-exploration-party-role="host"]');
    applyPlayerShipFrameDirection(hostShip, form === 'guild' ? 'guild-right' : 'row2-a');
    const syncOnlinePartyShips = (participants = []) => {
        if (battleMode !== 'online' || !overlay.isConnected || !sequenceScene) return;
        const normalizedParticipants = (Array.isArray(participants) ? participants : [])
            .filter((entry) => Number.isInteger(Number(entry?.seat)))
            .sort((left, right) => Number(left.seat) - Number(right.seat));
        const localPlayFabId = String(window.myPlayFabId || '').trim();
        const hostParticipant = normalizedParticipants.find((entry) => entry?.isHost === true)
            || normalizedParticipants.find((entry) => (
                localPlayFabId && String(entry?.playFabId || '').trim() === localPlayFabId
            ));
        if (hostParticipant && hostShip) {
            hostShip.dataset.partySeat = String(hostParticipant.seat);
            hostShip.dataset.partyPlayFabId = String(hostParticipant.playFabId || '');
        }
        const guestParticipants = normalizedParticipants
            .filter((entry) => entry !== hostParticipant && entry?.ship)
            .slice(0, 3);
        const activeSeats = new Set(guestParticipants.map((entry) => String(entry.seat)));
        sequenceScene.querySelectorAll('[data-exploration-party-role="guest"]').forEach((node) => {
            if (!activeSeats.has(String(node.dataset.partySeat || ''))) node.remove();
        });
        guestParticipants.forEach((participant, index) => {
            const seat = String(participant.seat);
            const participantShip = createOnlineBattleShipProfile(participant.ship);
            if (!participantShip) return;
            const participantForm = participantShip.form;
            const position = index + 1;
            let node = sequenceScene.querySelector(
                `[data-exploration-party-role="guest"][data-party-seat="${seat}"]`
            );
            const expectedFormClass = `is-${participantForm}`;
            const partyShipClassName = `exploration-sequence-ship ${expectedFormClass} is-party-member is-party-position-${position}`;
            if (node && !node.classList.contains(expectedFormClass)) {
                node.remove();
                node = null;
            }
            if (!node) {
                node = document.createElement('div');
                node.className = partyShipClassName;
                node.setAttribute('aria-hidden', 'true');
                node.dataset.explorationPartyShip = '';
                node.dataset.explorationPartyRole = 'guest';
                node.dataset.partySeat = seat;
                node.dataset.partyPlayFabId = String(participant.playFabId || '');
                node.dataset.guildSailColor = participantShip.sailColor;
                node.innerHTML = participantForm === 'guild'
                    ? renderGuildShipLayers(participantShip)
                    : '';
                node.style.setProperty(
                    '--exploration-ship-voyage-delay',
                    `${-Math.min(2879, Math.max(0, Date.now() - departureStartedAt))}ms`
                );
                sequenceScene.appendChild(node);
                applyPlayerShipFrameDirection(node, participantForm === 'guild' ? 'guild-right' : 'row2-a');
            }
            node.className = partyShipClassName;
        });
    };
    homeFrame?.classList.add('is-exploring');
    homeIcon?.classList.add('is-exploring-sail');

    let releaseBattleStart = () => {};
    const startBarrier = new Promise((resolve) => {
        releaseBattleStart = resolve;
    });
    let markEntryReady = () => {};
    let markEntryFailed = () => {};
    const entryReadyPromise = new Promise((resolve) => {
        markEntryReady = () => resolve({ ready: true });
        markEntryFailed = (error) => resolve({ error });
    });
    const preparedStatePromise = Promise.resolve(preparationPromise)
        .then((prepared) => {
            const battlePromise = showExplorationAutoSequence(
                prepared.startData,
                destinationId,
                prepared.encounterData,
                stage,
                {
                    battleMode,
                    tutorialEnabled,
                    skipDeparture: true,
                    autoStartOnline: true,
                    startRequiresOnlineParty: battleMode === 'online',
                    startBarrier,
                    onEntryReady: markEntryReady,
                    onOnlinePartyChange: syncOnlinePartyShips
                }
            );
            battlePromise.catch(markEntryFailed);
            return { value: { ...prepared, battlePromise } };
        })
        .catch((error) => ({ error }));
    const label = overlay.querySelector('[data-exploration-sequence-label]');
    const setPhase = (phase, text) => {
        const voyageClass = ['sail', 'up', 'left', 'arrival'].includes(phase) ? ' is-voyage' : '';
        overlay.className = `exploration-sequence-overlay is-${form} ${shipTrait.className} is-sky-${destinationVisual.sky} is-boss-${bossTierKey}${voyageClass} is-${phase}`;
        if (label) label.textContent = text;
        homeIcon?.classList.remove('is-exploring-sail', 'is-exploring-up', 'is-exploring-left', 'is-exploring-arrival');
        homeIcon?.classList.add(`is-exploring-${phase}`);
    };

    try {
        setPhase('sail', battleMode === 'online' ? '救難信号と海図を準備中' : shipTrait.label);
        await wait(900);
        setPhase('up', `${destinationVisual.label}を発見`);
        await wait(760);
        setPhase('left', battleMode === 'online' ? '救援隊を受付中' : '戦闘データを読み込み中');
        await wait(700);
        setPhase('arrival', `${destinationVisual.label}に到着`);
        await wait(520);
        releaseBattleStart();

        if (label) {
            label.textContent = battleMode === 'online'
                ? '救援隊を編成して戦闘を開始します'
                : '戦闘を開始します';
        }
        const preparedState = await preparedStatePromise;
        if (preparedState.error) throw preparedState.error;
        const entryState = await Promise.race([
            entryReadyPromise,
            preparedState.value.battlePromise.then(
                () => ({ ready: true }),
                (error) => ({ error })
            )
        ]);
        if (entryState.error) throw entryState.error;
        await wait(180);
        return preparedState.value;
    } finally {
        releaseBattleStart();
        overlay.remove();
        homeFrame?.classList.remove('is-exploring');
        homeIcon?.classList.remove('is-exploring-sail', 'is-exploring-up', 'is-exploring-left', 'is-exploring-arrival');
    }
}

async function showExplorationAutoSequence(startData, destinationId, encounterData = null, selectedStage = null, options = {}) {
    const ship = startData?.ship || currentPlayerShipProfile || {};
    const active = startData?.active || {};
    const form = normalizePlayerShipForm(ship.form);
    const guildSailColor = form === 'guild' ? resolveGuildShipSailColor(ship) : 'white';
    const guildLayers = form === 'guild' ? renderGuildShipLayers(ship) : '';
    const rawReport = encounterData?.encounter || encounterData?.active?.encounter || encounterData?.report || {};
    const requestedStageNo = Math.max(0, Math.floor(Number(
        rawReport?.stageNo || active?.stageNo || selectedStage?.stageNo
    ) || 0));
    const cachedStage = currentExplorationStages.find((entry) => (
        Number(entry?.stageNo) === requestedStageNo
    )) || null;
    const stageFallback = selectedStage && typeof selectedStage === 'object'
        ? selectedStage
        : (cachedStage || {});
    const reportedMonsters = Array.isArray(rawReport?.monsters) ? rawReport.monsters.slice(0, 4) : [];
    const fallbackMonsters = Array.isArray(stageFallback?.monsters) ? stageFallback.monsters.slice(0, 4) : [];
    const stageMonsters = reportedMonsters.length === 4 ? reportedMonsters : fallbackMonsters;
    const firstStageMonster = stageMonsters[0] || null;
    const report = {
        ...stageFallback,
        ...rawReport,
        stageNo: requestedStageNo || Math.max(0, Math.floor(Number(stageFallback?.stageNo) || 0)),
        stageId: String(rawReport?.stageId || active?.stageId || stageFallback?.id || ''),
        destinationId: String(
            rawReport?.destinationId || active?.destinationId || stageFallback?.id || destinationId || ''
        ),
        destinationName: String(
            rawReport?.destinationName || active?.destinationName || stageFallback?.name || ''
        ),
        battlefieldId: String(
            rawReport?.battlefieldId || active?.battlefieldId || stageFallback?.battlefieldId || ''
        ),
        atmosphereTone: String(
            rawReport?.atmosphereTone || active?.atmosphereTone || stageFallback?.atmosphereTone || ''
        ),
        monsters: stageMonsters,
        ...(stageMonsters.length === 4
            ? {
                version: Math.max(2, Number(rawReport?.version) || 0),
                monsterId: String(firstStageMonster?.monsterId || firstStageMonster?.id || ''),
                monsterName: String(firstStageMonster?.monsterName || firstStageMonster?.name || ''),
                isBoss: false
            }
            : {})
    };
    const resolvedDestinationId = active.destinationId || report.destinationId || destinationId;
    const destinationVisual = getExplorationDestinationVisual(active.destinationId ? active : resolvedDestinationId);
    const destinationName = active.destinationName || report.destinationName || destinationVisual.label || '探索先';
    const bossResult = normalizeBossResult(report.bossResult);
    const bossTierKey = normalizeExplorationBossTier(report.bossTier);
    const kingdomMonster = selectExplorationTarotMonster(report, resolvedDestinationId);
    if (!kingdomMonster || typeof window.launchTarotKingdomExplorationBattle !== 'function') {
        throw new Error('タロットキングダムの探索連携を開始できません。');
    }
    const shipTrait = EXPLORATION_SHIP_TRAITS[form] || EXPLORATION_SHIP_TRAITS.boat;
    const homeFrame = document.getElementById('homePlayerShipFrame');
    const homeIcon = homeFrame?.querySelector('.home-player-ship-icon');
    const encounterLabel = Number(report?.version) >= 2
        ? `STAGE ${Math.max(1, Number(report?.stageNo) || 1)}`
        : (kingdomMonster.isBoss === true ? 'BOSS ENCOUNTER' : 'MONSTER ENCOUNTER');
    const launchBattle = async (battleMode, tutorialEnabled = false) => {
        const stageNo = Math.max(0, Math.floor(Number(report?.stageNo) || 0));
        const explorationId = String(report.explorationId || report.id || active.id || '');
        const ownerPlayFabId = String(window.myPlayFabId || window.myPlayFabLoginInfo?.playFabId || '').trim();
        const kingdomResult = await window.launchTarotKingdomExplorationBattle({
            explorationId,
            destinationId: String(resolvedDestinationId || ''),
            destinationName,
            monsterId: kingdomMonster.id,
            monsterName: kingdomMonster.name,
            isBoss: kingdomMonster.isBoss === true,
            stageNo,
            stageId: String(report?.stageId || ''),
            battlefieldId: String(report?.battlefieldId || active?.battlefieldId || ''),
            atmosphereTone: String(report?.atmosphereTone || active?.atmosphereTone || ''),
            monsters: stageMonsters,
            supplyQueue: Array.isArray(report?.supplyQueue) ? report.supplyQueue : [],
            mode: battleMode,
            tutorialEnabled,
            enemyDefeatMode: getExplorationEnemyDefeatMode(),
            currentPet: currentTarotKingdomPet,
            onlineShip: createOnlineBattleShipProfile(ship),
            startRequiresOnlineParty: options?.startRequiresOnlineParty === true,
            autoStartOnline: options.autoStartOnline === true,
            startBarrier: options.startBarrier,
            onEntryReady: options.onEntryReady,
            onOnlinePartyChange: options.onOnlinePartyChange,
            onRaidEncounter: battleMode === 'online' && ownerPlayFabId
                ? async (roomId) => requestStartTarotKingdomRaid(
                    ownerPlayFabId,
                    roomId,
                    { isSilent: true, throwOnError: true }
                )
                : null,
            onRoundFinished: battleMode === 'offline' && ownerPlayFabId
                ? async (finisher) => {
                    const roll = await requestRollTarotKingdomPetRound(
                        ownerPlayFabId,
                        explorationId,
                        { ...finisher, mode: 'offline' },
                        { isSilent: true, throwOnError: true }
                    );
                    if (roll?.petOffer) {
                        const choice = await showTarotKingdomPetOffer(roll.petOffer, ownerPlayFabId);
                        if (choice?.currentPet && typeof choice.currentPet === 'object') {
                            setCurrentTarotKingdomPet(choice.currentPet);
                        }
                    }
                    return roll;
                }
                : null
        });
        const raidResult = kingdomResult?.raid || null;
        if (raidResult?.attemptId) {
            await finishTarotKingdomRaidResult(ownerPlayFabId, raidResult);
        }
        const retreatedInKingdom = kingdomResult?.status === 'retreated';
        return {
            chestOpened: false,
            battleMode,
            kingdomMonster,
            explorationId,
            kingdomResult,
            retreated: retreatedInKingdom,
            raidEncountered: !!raidResult?.attemptId,
            cancelled: !!raidResult?.attemptId || kingdomResult?.status !== 'completed'
        };
    };
    const presetBattleMode = options.battleMode === 'online'
        ? 'online'
        : (options.battleMode === 'offline' ? 'offline' : '');
    if (options.skipDeparture === true && presetBattleMode) {
        return launchBattle(presetBattleMode, options.tutorialEnabled === true);
    }
    const existing = document.querySelector('.exploration-sequence-overlay');
    existing?.remove();

    const overlay = document.createElement('div');
    overlay.className = `exploration-sequence-overlay is-${form} ${shipTrait.className} is-sky-${destinationVisual.sky} is-boss-${bossTierKey}`;
    overlay.innerHTML = `
        <div class="exploration-sequence-dialog" role="dialog" aria-modal="true" aria-label="探索">
            <div class="exploration-sequence-scene">
                <div class="exploration-sequence-compass" aria-hidden="true"></div>
                <div class="exploration-sequence-sky"></div>
                <div class="exploration-sequence-horizon" aria-hidden="true"></div>
                <div class="exploration-sequence-arrival" aria-hidden="true"></div>
                ${renderExplorationDestinationVisual(active.destinationId ? active : resolvedDestinationId, 'exploration-sequence-island', 'div')}
                <div class="exploration-sequence-boss" data-exploration-sequence-boss>
                    ${renderExplorationPixelMonster(kingdomMonster, 'exploration-sequence-boss-image', { maxWidth: 58, maxHeight: 54 })}
                    <small>${kingdomMonster.isBoss === true ? 'BOSS' : 'MONSTER'}</small>
                </div>
                <div class="exploration-sequence-ship-effect" aria-hidden="true"></div>
                <div class="exploration-sequence-ship is-${form}" data-guild-sail-color="${escapeHtml(guildSailColor)}" aria-hidden="true">${guildLayers}</div>
            </div>
            <div class="exploration-sequence-copy">
                <strong>${escapeHtml(destinationName)}</strong>
                <span data-exploration-sequence-label>${escapeHtml(shipTrait.label)}</span>
            </div>
            <section class="exploration-battle-mode-choice" data-exploration-battle-mode-choice hidden aria-label="迎撃準備">
                <div class="exploration-battle-mode-head">
                    <span>${encounterLabel}</span>
                    <strong>${escapeHtml(`${kingdomMonster.name}が現れた`)}</strong>
                </div>
                <div class="exploration-battle-mode-actions">
                    <button type="button" class="is-offline" data-exploration-battle-mode="offline" aria-label="傭兵召集（オフライン）">
                        <span>傭兵召集</span>
                        <small>オフライン</small>
                    </button>
                    <button type="button" class="is-online" data-exploration-battle-mode="online" aria-label="救難信号（オンライン）">
                        <span>救難信号</span>
                        <small>オンライン</small>
                    </button>
                    <button type="button" class="is-cancel" data-exploration-battle-mode="retreat">撤退</button>
                </div>
            </section>
        </div>
    `;
    document.body.appendChild(overlay);
    alignExplorationSequenceIslandArtwork(overlay);
    applyPlayerShipFrameDirection(overlay.querySelector('.exploration-sequence-ship'), form === 'guild' ? 'guild-right' : 'row2-a');
    renderCurrentExplorationBattleAvatar();
    homeFrame?.classList.add('is-exploring');
    homeIcon?.classList.add('is-exploring-sail');

    const label = overlay.querySelector('[data-exploration-sequence-label]');
    const setPhase = (phase, text) => {
        const voyageClass = ['sail', 'up', 'left', 'arrival'].includes(phase) ? ' is-voyage' : '';
        overlay.className = `exploration-sequence-overlay is-${form} ${shipTrait.className} is-sky-${destinationVisual.sky} is-boss-${bossTierKey}${voyageClass} is-${phase} is-result-${bossResult}`;
        if (label) label.textContent = text;
        homeIcon?.classList.remove('is-exploring-sail', 'is-exploring-up', 'is-exploring-left', 'is-exploring-arrival', 'is-exploring-encounter-choice', 'is-exploring-battle', 'is-exploring-treasure');
        homeIcon?.classList.add(`is-exploring-${phase}`);
    };
    const waitForSequence = async (minimumMs) => {
        await wait(minimumMs);
    };

    setPhase('sail', shipTrait.label);
    await waitForSequence(900);
    setPhase('up', `${destinationVisual.label}を発見`);
    await waitForSequence(760);
    setPhase('left', '上陸地点へ直進');
    await waitForSequence(700);
    setPhase('arrival', `${destinationVisual.label}に到着`);
    await waitForSequence(520);
    const modeChoice = overlay.querySelector('[data-exploration-battle-mode-choice]');
    const battleMode = await new Promise((resolve) => {
        let selected = false;
        modeChoice.hidden = false;
        setPhase('encounter-choice', `${kingdomMonster.name}が出現`);
        modeChoice.querySelectorAll('[data-exploration-battle-mode]').forEach((button) => {
            button.addEventListener('click', () => {
                if (selected) return;
                selected = true;
                const requestedMode = button.getAttribute('data-exploration-battle-mode');
                const mode = requestedMode === 'online' ? 'online' : (requestedMode === 'retreat' ? 'retreat' : 'offline');
                modeChoice.dataset.selectedMode = mode;
                modeChoice.querySelectorAll('button').forEach((candidate) => {
                    candidate.disabled = true;
                });
                button.classList.add('is-selected');
                if (label) {
                    label.textContent = mode === 'online'
                        ? '救難信号を発信中'
                        : (mode === 'retreat' ? '島から撤退します' : '傭兵を召集中');
                }
                resolve(mode);
            }, { once: true });
        });
    });
    const stageNo = Math.max(0, Math.floor(Number(report?.stageNo) || 0));
    let tutorialEnabled = false;
    const canOfferTutorial = battleMode === 'offline'
        && stageNo === 1
        && kingdomMonster.isBoss !== true;
    if (canOfferTutorial) {
        const modeHead = modeChoice.querySelector('.exploration-battle-mode-head');
        const modeActions = modeChoice.querySelector('.exploration-battle-mode-actions');
        if (modeHead && modeActions) {
            modeHead.replaceChildren();
            const stageLabel = document.createElement('span');
            stageLabel.textContent = 'STAGE 1';
            const question = document.createElement('strong');
            question.textContent = 'チュートリアルを開始しますか？';
            modeHead.append(stageLabel, question);
            modeActions.replaceChildren();
            const createTutorialButton = (enabled, labelText, detailText) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.setAttribute('data-exploration-tutorial', enabled ? 'yes' : 'no');
                button.setAttribute('aria-label', enabled ? 'チュートリアルを開始' : 'チュートリアルを開始しない');
                const buttonLabel = document.createElement('span');
                buttonLabel.textContent = labelText;
                const buttonDetail = document.createElement('small');
                buttonDetail.textContent = detailText;
                button.append(buttonLabel, buttonDetail);
                return button;
            };
            modeActions.append(
                createTutorialButton(true, 'はい', '遊び方を確認'),
                createTutorialButton(false, 'いいえ', '通常戦で開始')
            );
            delete modeChoice.dataset.selectedMode;
            setPhase('encounter-choice', 'チュートリアルを選択');
            tutorialEnabled = await new Promise((resolve) => {
                let selected = false;
                modeChoice.querySelectorAll('[data-exploration-tutorial]').forEach((button) => {
                    button.addEventListener('click', () => {
                        if (selected) return;
                        selected = true;
                        const enabled = button.getAttribute('data-exploration-tutorial') === 'yes';
                        modeChoice.dataset.tutorialEnabled = enabled ? 'true' : 'false';
                        modeChoice.querySelectorAll('button').forEach((candidate) => {
                            candidate.disabled = true;
                        });
                        button.classList.add('is-selected');
                        if (label) label.textContent = enabled ? '遊び方を確認します' : '通常戦を開始します';
                        resolve(enabled);
                    }, { once: true });
                });
            });
        }
    }
    await wait(180);
    overlay.remove();
    homeFrame?.classList.remove('is-exploring');
    homeIcon?.classList.remove('is-exploring-sail', 'is-exploring-up', 'is-exploring-left', 'is-exploring-arrival', 'is-exploring-encounter-choice', 'is-exploring-battle', 'is-exploring-treasure');
    if (battleMode === 'retreat') {
        return {
            chestOpened: false,
            battleMode,
            kingdomMonster,
            explorationId: String(report.explorationId || report.id || active.id || ''),
            kingdomResult: { status: 'cancelled' },
            retreated: true,
            cancelled: true
        };
    }
    return launchBattle(battleMode, tutorialEnabled);
}

async function completeExplorationRetreat(playFabId, sequenceResult) {
    if (sequenceResult?.retreated !== true) return false;
    const retreatData = await requestRetreatExploration(
        playFabId,
        sequenceResult.explorationId,
        { throwOnError: true }
    );
    renderExplorationPanel(retreatData, playFabId);
    showRpgMessage('探索から撤退しました。');
    return true;
}

async function finishTarotKingdomRaidResult(playFabId, raidResult) {
    if (!playFabId || !raidResult?.attemptId) return null;
    const finishData = await requestFinishTarotKingdomRaid(
        playFabId,
        raidResult.attemptId,
        {
            damageDealt: raidResult.damageDealt,
            finisher: raidResult.finisher
        },
        { isSilent: true, throwOnError: true }
    );
    const resolution = finishData?.resolution || {};
    if (resolution.defeatedNow) {
        const rewardName = String(finishData?.reward?.displayName || '').trim();
        showRpgMessage(
            rewardName
                ? `${raidResult.bossName}を　たおした！\n${rewardName}を　てにいれた！`
                : `${raidResult.bossName}を　たおした！`
        );
    } else if (raidResult.escaped) {
        showRpgMessage(
            `${raidResult.bossName}は　にげだした！\n`
            + `${Math.max(0, Number(resolution.appliedDamage) || 0).toLocaleString('ja-JP')}ダメージを　あたえた！`
        );
    } else {
        showRpgMessage(
            `${raidResult.bossName}に ${Math.max(0, Number(resolution.appliedDamage) || 0).toLocaleString('ja-JP')}ダメージ！`
        );
    }
    return finishData;
}

function renderExplorationPanel(data, playFabId) {
    const panel = document.getElementById('shipExplorationPanel');
    if (!panel) return;
    const ship = data?.ship || null;
    const active = data?.active || null;
    if (!ship) {
        panel.innerHTML = '<div class="ship-exploration-empty">探索には使用中の船が必要です。</div>';
        return;
    }
    const head = `
        <div class="ship-exploration-head">
            <h3>探索</h3>
            <span class="ship-exploration-meta">使用中: ${escapeHtml(ship.shipName || ship.shipId || '船')}</span>
        </div>
    `;
    const enemyDefeatMode = getExplorationEnemyDefeatMode();
    const explorationSettings = `
        <details class="ship-exploration-settings">
            <summary>探索設定</summary>
            <fieldset>
                <legend>敵HPが0になった後</legend>
                <label>
                    <input type="radio" name="explorationEnemyDefeatMode" value="hp-zero"
                        ${enemyDefeatMode === 'hp-zero' ? 'checked' : ''}>
                    <span>その時点でクリア</span>
                </label>
                <label>
                    <input type="radio" name="explorationEnemyDefeatMode" value="hand-empty"
                        ${enemyDefeatMode === 'hand-empty' ? 'checked' : ''}>
                    <span>手札0まで続行</span>
                </label>
            </fieldset>
        </details>
    `;
    const rescueCheck = `
        <div class="ship-exploration-rescue-check">
            <div class="ship-exploration-rescue-copy">
                <strong>救難信号</strong>
                <span>参加できる船団を確認</span>
            </div>
            <button type="button" data-exploration-rescue-check>救難チェック</button>
        </div>
    `;
    const bindRescueCheck = () => {
        panel.querySelector('[data-exploration-rescue-check]')?.addEventListener('click', () => {
            if (typeof window.openHomeRescuePopup === 'function') {
                void window.openHomeRescuePopup();
            }
        });
    };
    const bindExplorationSettings = () => {
        panel.querySelectorAll('input[name="explorationEnemyDefeatMode"]').forEach((input) => {
            input.addEventListener('change', () => {
                if (!input.checked) return;
                setExplorationEnemyDefeatMode(input.value);
            });
        });
    };
    if (active) {
        panel.innerHTML = `
            ${head}
            ${explorationSettings}
            ${rescueCheck}
            <div class="ship-exploration-destination is-active">
                <div class="ship-exploration-card-head">
                    ${renderExplorationDestinationVisual(active, 'ship-exploration-mapmark')}
                    <div class="ship-exploration-title-group">
                        <strong>${escapeHtml(active.destinationName || '探索中')}</strong>
                        <div class="ship-exploration-meta">出航船: ${escapeHtml(active.shipName || '')}</div>
                    </div>
                </div>
                <div class="ship-exploration-badges" aria-label="探索状態">
                    <span class="ship-exploration-badge is-active">航海中</span>
                </div>
                <div class="ship-exploration-actions">
                    <button type="button" data-exploration-claim>出航</button>
                    <button type="button" class="ship-exploration-retreat" data-exploration-retreat
                        aria-label="探索を中止してステージ選択へ戻る">撤退</button>
                </div>
            </div>
        `;
        bindExplorationSettings();
        bindRescueCheck();
        panel.querySelector('[data-exploration-claim]')?.addEventListener('click', () => claimExploration(playFabId, active));
        panel.querySelector('[data-exploration-retreat]')?.addEventListener('click', async (event) => {
            if (explorationAutoRunning) return;
            const explorationId = String(active.id || '').trim();
            if (!explorationId) {
                showRpgMessage('撤退する探索を確認できませんでした。');
                return;
            }
            const triggerButton = event.currentTarget;
            const actionButtons = Array.from(panel.querySelectorAll('.ship-exploration-actions button'));
            const previousLabels = actionButtons.map((button) => button.textContent || '');
            explorationAutoRunning = true;
            actionButtons.forEach((button) => {
                button.disabled = true;
            });
            triggerButton.textContent = '撤退中';
            try {
                await completeExplorationRetreat(playFabId, {
                    explorationId,
                    retreated: true
                });
            } catch (error) {
                showRpgMessage(error?.message || '探索から撤退できませんでした。');
            } finally {
                explorationAutoRunning = false;
                actionButtons.forEach((button, index) => {
                    if (!button.isConnected) return;
                    button.disabled = false;
                    button.textContent = previousLabels[index] || button.textContent;
                });
            }
        });
        return;
    }
    const stages = Array.isArray(data?.stages) ? data.stages : [];
    if (stages.length > 0) currentExplorationStages = stages.map((stage) => ({ ...stage }));
    const paymentState = getExplorationPaymentState(data);
    const destinationHtml = stages.length
        ? stages.map((stage) => {
            const isAvailable = stage?.unlocked === true;
            const bestRank = Math.max(0, Math.floor(Number(stage?.bestRank) || 0));
            const bestRankLabel = bestRank > 0 ? `最高 ${bestRank}位` : '未踏';
            const bestChips = Math.max(0, Math.floor(Number(stage?.bestChips) || 0));
            const bestChipsLabel = bestChips > 0 ? `BEST ${bestChips.toLocaleString('ja-JP')}チップ` : 'BEST ---';
            const stageNo = Math.max(1, Math.floor(Number(stage?.stageNo) || 1));
            return `
                <div class="ship-exploration-destination ship-exploration-stage${isAvailable ? '' : ' is-locked'}"
                    data-exploration-stage-no="${stageNo}"
                    data-exploration-destination-id="${escapeHtml(stage.id || '')}">
                    <div class="ship-exploration-card-head">
                        ${renderExplorationDestinationVisual(stage, 'ship-exploration-mapmark')}
                        <div class="ship-exploration-title-group">
                            <span class="ship-exploration-stage-label">STAGE ${stageNo}</span>
                            <strong>${escapeHtml(stage.name || `ステージ${stageNo}`)}</strong>
                            <div class="ship-exploration-meta">${bestRankLabel} / ${bestChipsLabel} / CLEAR ${Math.max(0, Number(stage.clearCount) || 0)}</div>
                        </div>
                    </div>
                    ${renderExplorationStageMonsters(stage)}
                    ${isAvailable ? '' : `
                        <div class="ship-exploration-badges" aria-label="探索条件">
                            <span class="ship-exploration-badge is-locked">${escapeHtml(stage.lockReason || 'LOCKED')}</span>
                        </div>
                    `}
                    <div class="ship-exploration-actions">
                        <button type="button" class="ship-exploration-start"
                            data-exploration-start="${escapeHtml(stage.id || '')}"
                            data-exploration-stage="${stageNo}"
                            ${isAvailable ? '' : 'disabled aria-disabled="true"'}>${isAvailable ? '出航' : 'LOCKED'}</button>
                    </div>
                </div>
            `;
        }).join('')
        : '<div class="ship-exploration-empty">探索ステージを読み込めませんでした。</div>';
    panel.innerHTML = `
        ${head}
        ${explorationSettings}
        ${rescueCheck}
        <div class="ship-exploration-destinations">${destinationHtml}</div>
    `;
    bindExplorationSettings();
    bindRescueCheck();
    panel.querySelectorAll('[data-exploration-start]').forEach((button) => {
        button.addEventListener('click', async () => {
            const destinationId = String(button.getAttribute('data-exploration-start') || '');
            const stageNo = Math.max(1, Math.floor(Number(button.getAttribute('data-exploration-stage')) || 1));
            const stage = stages.find((entry) => Number(entry?.stageNo) === stageNo) || null;
            const supplies = await showExplorationStageSupplyDialog({ stage, paymentState });
            if (!supplies) return;
            const modeSelection = await showExplorationBattleModeDialog({ stage });
            if (!modeSelection) return;
            void startExploration(
                playFabId,
                destinationId,
                { stageNo, supplies, stage, ...modeSelection },
                button
            );
        });
    });
}

function renderExplorationLoading() {
    return `
        <div class="ship-exploration-loading" role="status" aria-live="polite">
            <div class="ship-exploration-loading-head">
                <span class="ship-exploration-loading-compass" aria-hidden="true"></span>
                <div>
                    <strong>探索情報を読み込み中です</strong>
                    <span>解放済みステージを確認しています</span>
                </div>
            </div>
            <div class="ship-exploration-loading-route" aria-hidden="true">
                <span></span><span></span><span></span>
            </div>
            <div class="ship-exploration-loading-lines" aria-hidden="true">
                <i></i><i></i><i></i>
            </div>
        </div>
    `;
}

function renderExplorationLoadError(panel, error, playFabId) {
    if (!panel) return;
    panel.innerHTML = `
        <div class="ship-exploration-load-error" role="alert">
            <span>${escapeHtml(error?.message || '探索情報を読み込めませんでした。')}</span>
            <button type="button" data-exploration-retry>再読み込み</button>
        </div>
    `;
    panel.querySelector('[data-exploration-retry]')?.addEventListener('click', (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = '読み込み中';
        void loadExplorationPanel(playFabId);
    });
}

function setExplorationStartButtonsPending(triggerButton, pending) {
    const panel = document.getElementById('shipExplorationPanel');
    if (!panel || !triggerButton) return;
    if (pending) {
        const requestKey = createRequestId('exploration-ui');
        panel.querySelectorAll('[data-exploration-start]').forEach((button) => {
            button.dataset.explorationPendingKey = requestKey;
            button.dataset.explorationPreviousLabel = button.textContent || '';
            button.dataset.explorationPreviousDisabled = button.disabled ? 'true' : 'false';
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
        });
        triggerButton.textContent = '出航準備中';
        triggerButton.classList.add('is-loading');
        triggerButton.dataset.explorationPendingKey = requestKey;
        return;
    }
    const requestKey = triggerButton.dataset.explorationPendingKey || '';
    if (!requestKey) return;
    panel.querySelectorAll(`[data-exploration-pending-key="${requestKey}"]`).forEach((button) => {
        button.disabled = button.dataset.explorationPreviousDisabled === 'true';
        button.removeAttribute('aria-busy');
        button.classList.remove('is-loading');
        button.textContent = button.dataset.explorationPreviousLabel || button.textContent;
        delete button.dataset.explorationPreviousLabel;
        delete button.dataset.explorationPreviousDisabled;
        delete button.dataset.explorationPendingKey;
    });
}

export async function loadExplorationPanel(playFabId) {
    const panel = document.getElementById('shipExplorationPanel');
    if (!panel || !playFabId) return;
    panel.innerHTML = renderExplorationLoading();
    try {
        const [data, petState] = await Promise.all([
            requestExplorationStatus(playFabId, { isSilent: true, throwOnError: true }),
            requestTarotKingdomPetState(playFabId, { isSilent: true, throwOnError: true }).catch(() => null)
        ]);
        setCurrentTarotKingdomPet(petState?.currentPet || null);
        renderExplorationPanel(data, playFabId);
        if (petState?.pendingOffer) {
            const choice = await showTarotKingdomPetOffer(petState.pendingOffer, playFabId);
            if (choice?.currentPet && typeof choice.currentPet === 'object') {
                setCurrentTarotKingdomPet(choice.currentPet);
            }
        }
    } catch (error) {
        renderExplorationLoadError(panel, error, playFabId);
    }
}

async function startExploration(playFabId, destinationId, payment = {}, triggerButton = null) {
    if (!destinationId) return;
    if (explorationAutoRunning) return;
    explorationAutoRunning = true;
    setExplorationStartButtonsPending(triggerButton, true);
    try {
        const stageNo = Math.max(1, Math.floor(Number(payment?.stageNo) || 1));
        const battleMode = payment?.battleMode === 'online' ? 'online' : 'offline';
        const preparationPromise = (async () => {
            const startData = await requestStartExploration(playFabId, stageNo, createRequestId('exploration-start'), {
                throwOnError: true,
                supplies: Array.isArray(payment?.supplies) ? payment.supplies : []
            });
            renderExplorationPanel(startData, playFabId);
            const encounterData = await requestExplorationEncounter(playFabId, { throwOnError: true });
            return { startData, encounterData };
        })();
        const prepared = await showExplorationDepartureLoading({
            stage: payment?.stage,
            destinationId,
            battleMode,
            tutorialEnabled: payment?.tutorialEnabled === true,
            preparationPromise
        });
        const sequenceResult = await prepared.battlePromise;
        if (!sequenceResult?.cancelled && sequenceResult?.kingdomResult?.status === 'completed') {
            beginExplorationReturnSequence(sequenceResult.kingdomResult);
        }
        const retreated = await completeExplorationRetreat(playFabId, sequenceResult);
        if (!retreated && !sequenceResult?.cancelled) {
            const claimData = await requestClaimExploration(playFabId, {
                throwOnError: true,
                tarotOutcome: sequenceResult.kingdomResult?.outcome,
                explorationId: sequenceResult.kingdomResult?.explorationId,
                tarotFinisher: sequenceResult.kingdomResult?.finisher,
                tarotFinishers: sequenceResult.kingdomResult?.finishers,
                tarotStandings: sequenceResult.kingdomResult?.standings
            });
            if (claimData?.petOffer) await showTarotKingdomPetOffer(claimData.petOffer, playFabId);
            await handleExplorationClaimResult(claimData, playFabId, sequenceResult);
        } else if (!retreated) {
            renderExplorationPanel(encounterData, playFabId);
        }
    } catch (error) {
        await finishExplorationReturnSequence();
        if (isExplorationStartConflict(error)) {
            try {
                await recoverConflictedExploration(playFabId, destinationId, payment);
            } catch (recoverError) {
                showRpgMessage(recoverError?.message || '前回の探索結果を回収できませんでした。');
            }
        } else {
            showRpgMessage(error?.message || '探索を開始できませんでした。');
        }
    } finally {
        setExplorationStartButtonsPending(triggerButton, false);
        explorationAutoRunning = false;
    }
}

async function claimExploration(playFabId, active = null) {
    try {
        const stageNo = Math.max(1, Math.floor(Number(active?.stageNo) || 1));
        const stage = currentExplorationStages.find((entry) => Number(entry?.stageNo) === stageNo) || active || {};
        const modeSelection = await showExplorationBattleModeDialog({ stage });
        if (!modeSelection) return;
        const destinationId = String(active?.destinationId || stage?.id || '');
        const preparationPromise = requestExplorationEncounter(playFabId, { throwOnError: true })
            .then((encounterData) => ({
                encounterData,
                startData: buildRecoveredExplorationStartData(
                    encounterData,
                    encounterData?.encounter?.destinationId || destinationId
                )
            }));
        const prepared = await showExplorationDepartureLoading({
            stage,
            destinationId,
            battleMode: modeSelection.battleMode,
            tutorialEnabled: modeSelection.tutorialEnabled,
            preparationPromise
        });
        const sequenceResult = await prepared.battlePromise;
        if (!sequenceResult?.cancelled && sequenceResult?.kingdomResult?.status === 'completed') {
            beginExplorationReturnSequence(sequenceResult.kingdomResult);
        }
        const retreated = await completeExplorationRetreat(playFabId, sequenceResult);
        if (!retreated && !sequenceResult?.cancelled) {
            const claimData = await requestClaimExploration(playFabId, {
                throwOnError: true,
                tarotOutcome: sequenceResult.kingdomResult?.outcome,
                explorationId: sequenceResult.kingdomResult?.explorationId,
                tarotFinisher: sequenceResult.kingdomResult?.finisher,
                tarotFinishers: sequenceResult.kingdomResult?.finishers,
                tarotStandings: sequenceResult.kingdomResult?.standings
            });
            if (claimData?.petOffer) await showTarotKingdomPetOffer(claimData.petOffer, playFabId);
            await handleExplorationClaimResult(claimData, playFabId, sequenceResult);
        } else if (!retreated) {
            renderExplorationPanel(prepared.encounterData, playFabId);
        }
    } catch (error) {
        await finishExplorationReturnSequence();
        showRpgMessage(error?.message || '探索結果を確認できませんでした。');
    }
}

export function renderShipCard(ship) {
    const assetData = ship.assetData;
    const positionData = ship.positionData || {};
    const movement = positionData.movement || {};
    const currentPos = ship.currentPosition || positionData.position || { x: 0, y: 0 };
    const isActive = !!ship.isActive;

    const catalogItem = resolveCatalogShip(assetData);
    const actionInfo = (() => {
        if (typeof window === 'undefined' || !window.SHIP_ACTIONS) return null;
        const itemId = String(assetData?.ItemId || '').toLowerCase();
        const friendlyId = String(catalogItem?.FriendlyId || catalogItem?.friendlyId || '').toLowerCase();
        return window.SHIP_ACTIONS[itemId] || (friendlyId ? window.SHIP_ACTIONS[friendlyId] : null);
    })();
    const actionLabel = actionInfo?.label || 'なし';
    const actionDescription = actionInfo?.description || '';
    const shipName = (() => {
        if (catalogItem?.DisplayName) return catalogItem.DisplayName;
        if (assetData?.DisplayName) return assetData.DisplayName;
        const raw = assetData?.ShipType;
        if (raw === 'Common Boat') return 'ボート';
        return raw || '不明';
    })();

    const positionLabel = (() => {
        const x = Number(currentPos?.x);
        const y = Number(currentPos?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return '未設定';
        return `(${Math.round(x)}, ${Math.round(y)})`;
    })();

    const isMoving = !!movement.isMoving;
    const eta = isMoving ? formatETA(movement.arrivalTime) : '停泊中';
    const shipLevel = Number(assetData?.Level) || 1;
    const canUpgrade = shipLevel < SHIP_LEVEL_CAP;
    const currentHp = Number(assetData?.Stats?.CurrentHP ?? 0);
    const maxHp = Number(assetData?.Stats?.MaxHP ?? 0);
    const canRepair = maxHp > 0 && currentHp < maxHp;
    const shipCargoResources = normalizeShipResourceMap(assetData?.ResourceCargo);
    const shipCargoUsed = sumShipResourceMap(shipCargoResources);
    const shipCargoCapacity = Number(assetData?.Stats?.CargoCapacity || 0) || 0;
    const nextUpgradeCosts = canUpgrade
        ? getShipUpgradeResourceCosts(catalogItem || assetData, shipLevel + 1, getCurrentPlayerNationKey())
        : [];
    const nextUpgradeCostHtml = canUpgrade
        ? `
            <div style="margin-top: 12px;">
                <div style="font-size: 12px; color: var(--text-sub); margin-bottom: 6px;">次の強化</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">${renderShipResourceCostHtml(nextUpgradeCosts)}</div>
            </div>
        `
        : '';
    const shipCargoHtml = isActive
        ? `
            <div style="margin-top: 12px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                    <div style="font-size: 12px; color: var(--text-sub);">船倉資源</div>
                    <div style="font-size: 12px; color: var(--text-sub);">${shipCargoUsed}/${shipCargoCapacity}</div>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;">${renderShipResourceSummary(shipCargoResources, { compact: true })}</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                    <button data-variant="accent" onclick="window.depositShipResources('${ship.shipId}')">全部預ける</button>
                    <button data-variant="accent" onclick="window.applyShipCargoPreset('${ship.shipId}')">マイセット補充</button>
                    <button onclick="window.editShipCargoPreset()">マイセット編集</button>
                </div>
            </div>
        `
        : '';

    return `
        <div class="ship-card" data-ship-id="${ship.shipId}">
            <div class="ship-card-header">
                <div>
                    <div class="ship-card-title">
                        <span class="ship-card-name">${shipName}</span>
                        <span data-role="active-badge" class="ship-card-active" style="display:${isActive ? 'inline-flex' : 'none'};">使用中</span>
                    </div>
                    <div class="ship-card-id">${ship.shipId}</div>
                </div>
                <div class="ship-card-status">
                    <strong>${isMoving ? '航海中' : '停泊中'}</strong>
                    <div>${eta}</div>
                </div>
            </div>
            <div class="ship-card-meta">
                <div><span>Lv:</span> <b>${shipLevel}</b></div>
                <div><span>HP:</span> <b>${assetData?.Stats?.CurrentHP ?? 0}/${assetData?.Stats?.MaxHP ?? 0}</b></div>
                <div><span>速度:</span> <b>${assetData?.Stats?.Speed ?? 0}</b></div>
                <div><span>視覚距離:</span> <b>${(() => {
                    if (!assetData) return 0;
                    const catalogVision = catalogItem ? Number(catalogItem.VisionRange) : Number.NaN;
                    if (Number.isFinite(catalogVision)) return catalogVision;
                    return assetData?.Stats?.VisionRange || 0;
                })()}</b></div>
                <div><span>位置:</span> <b>${positionLabel}</b></div>
                <div><span>積荷:</span> <b>${assetData?.Cargo?.length ?? 0}/${assetData?.Stats?.CargoCapacity ?? 0}</b></div>
                <div><span>アクション:</span> <b>${actionLabel}</b></div>
                ${actionDescription ? `<div style="grid-column: 1 / -1; font-size: 12px; color: var(--text-sub);">効果: ${actionDescription}</div>` : ''}
            </div>
            ${isMoving ? `
            <div style="margin-top: 12px;">
                <div style="font-size: 12px; color: var(--text-sub); margin-bottom: 4px;">
                    航路: (${Math.round(movement.departurePos?.x || 0)}, ${Math.round(movement.departurePos?.y || 0)})
                    → (${Math.round(movement.destinationPos?.x || 0)}, ${Math.round(movement.destinationPos?.y || 0)})
                </div>
                <div style="background: rgba(0,0,0,0.3); height: 6px; border-radius: 3px; overflow: hidden;">
                    <div style="
                        background: linear-gradient(90deg, var(--accent-color), var(--hp-color));
                        height: 100%;
                        width: ${calculateProgress(movement)}%;
                        transition: width 1s linear;
                    "></div>
                </div>
            </div>
            ` : ''}
            ${nextUpgradeCostHtml}
            ${shipCargoHtml}
            <div class="ship-card-actions">
                <button onclick="window.viewShipDetails('${ship.shipId}')">詳細</button>
                ${isMoving ? `
                <button data-variant="danger" onclick="window.stopShip('${ship.shipId}')">停止</button>
                ` : `
                <button data-variant="accent" onclick="window.startShipVoyageUI('${ship.shipId}')">出航</button>
                `}
                ${canUpgrade ? `
                <button data-variant="accent" onclick="window.upgradeShip('${ship.shipId}')">強化</button>
                ` : `
                <button disabled>Lv最大</button>
                `}
                <button data-variant="accent" onclick="window.repairShip('${ship.shipId}')" ${canRepair ? '' : 'disabled'}>
                    ${canRepair ? '小修理' : '満タン'}
                </button>
                <button data-role="active-button" onclick="window.setActiveShip('${ship.shipId}')" ${isActive ? 'disabled' : ''}>
                    ${isActive ? '使用中' : '使用する'}
                </button>
            </div>
        </div>
    `;
}

function calculateProgress(movement) {
    if (!movement || !movement.isMoving) return 0;

    const now = Date.now();
    const totalTime = movement.arrivalTime - movement.departureTime;
    const elapsedTime = now - movement.departureTime;
    const progress = Math.max(0, Math.min(100, (elapsedTime / totalTime) * 100));

    return progress;
}

export async function displayPlayerShips(playFabId) {
    return displayPlayerShipsWithRetry(playFabId, 0);
}

export async function displayPlayerShipsInContainer(playFabId, container) {
    return displayPlayerShipsWithRetry(playFabId, 0, container);
}

async function displayPlayerShipsWithRetry(playFabId, retryCount = 0, targetContainer = null) {
    const MAX_RETRIES = 3;
    const container = targetContainer || document.getElementById('playerShipsContainer');
    if (!container) {
        console.warn('[DisplayPlayerShips] Container not found');
        return;
    }

    if (playerShipsListener) {
        console.log('[DisplayPlayerShips] Stopping existing listener');
        playerShipsListener();
        playerShipsListener = null;
    }

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    const firestore = window.firestore;
    if (!firestore) {
        console.error('[DisplayPlayerShips] Firestore not initialized');
        container.innerHTML = '<div style="text-align: center; color: var(--text-sub); padding: 20px;">Firestoreが初期化されていません</div>';
        return;
    }
    if (!playFabId) {
        console.warn('[DisplayPlayerShips] playFabId is missing');
        container.innerHTML = '<div style="text-align: center; color: var(--text-sub); padding: 20px;">ログイン情報が取得できませんでした</div>';
        return;
    }

    try {
        await getActiveShipId(playFabId);
    } catch (e) {
        console.warn('[DisplayPlayerShips] Failed to get active ship:', e);
        activeShipOwnerIdCache = playFabId;
        activeShipSharedCache = false;
    }
    await loadExplorationPanel(playFabId);

    const shipOwnerPlayFabId = activeShipOwnerIdCache || playFabId;
    const shipsRef = collection(firestore, 'ships');
    const q = query(shipsRef, where('playFabId', '==', shipOwnerPlayFabId));

    console.log('[DisplayPlayerShips] Starting realtime listener for playFabId:', playFabId, 'shipOwner:', shipOwnerPlayFabId);

    playerShipsListener = onSnapshot(q, async (snapshot) => {
        console.log('[DisplayPlayerShips] Snapshot received, changes:', snapshot.docChanges().length);

        const shipDocs = snapshot.docs.filter((doc) => {
            const data = doc.data() || {};
            const id = data.shipId || data.ShipId || doc.id;
            return typeof id === 'string' && id.startsWith('ship_') && doc.id === id;
        });

        if (shipDocs.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: var(--text-sub); padding: 20px;">船を所有していません</div>';
            cachedShipsData.clear();
            return;
        }

        if (!container.querySelector('.ship-card')) {
            container.innerHTML = '';
            cachedShipsData.clear();
            for (const doc of shipDocs) {
                const firestoreData = doc.data();
                const shipId = firestoreData.shipId || firestoreData.ShipId || doc.id;
                const assetData = shipId ? await getShipAsset(shipOwnerPlayFabId, shipId) : null;
                await addShipCard(container, shipId, firestoreData, assetData);
            }
            return;
        }

        const changes = snapshot.docChanges();
        let hasAnyMovingShips = false;

        const processedShipIds = new Set();
        for (const change of changes) {
            const firestoreData = change.doc.data();
            const shipId = firestoreData.shipId || firestoreData.ShipId || change.doc.id;
            if (typeof shipId !== 'string' || !shipId.startsWith('ship_')) {
                continue;
            }
            if (change.doc.id !== shipId) {
                continue;
            }
            if (processedShipIds.has(shipId)) {
                continue;
            }
            processedShipIds.add(shipId);

            if (change.type === 'added') {
                console.log(`[DisplayPlayerShips] Ship added: ${shipId}`);
                const assetData = shipId ? await getShipAsset(shipOwnerPlayFabId, shipId) : null;
                await addShipCard(container, shipId, firestoreData, assetData);
            } else if (change.type === 'modified') {
                console.log(`[DisplayPlayerShips] Ship modified: ${shipId}`);
                const assetData = shipId ? (cachedShipsData.get(shipId)?.assetData || await getShipAsset(shipOwnerPlayFabId, shipId)) : null;
                await updateShipCard(container, shipId, firestoreData, assetData);
            } else if (change.type === 'removed') {
                console.log(`[DisplayPlayerShips] Ship removed: ${shipId}`);
                removeShipCard(container, shipId);
                cachedShipsData.set(shipId, null);
            }
        }

        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.movement && data.movement.isMoving) {
                hasAnyMovingShips = true;
            }
        });

        if (hasAnyMovingShips) {
            startShipAnimation();
        } else {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        }
    }, (error) => {
        console.error('[DisplayPlayerShips] Listener error:', error);

        if (retryCount < MAX_RETRIES) {
            const backoffDelay = 2000 * Math.pow(2, retryCount);
            console.log(`[DisplayPlayerShips] Retrying in ${backoffDelay}ms... (${retryCount + 1}/${MAX_RETRIES})`);

            container.innerHTML = `<div style="text-align: center; color: var(--text-sub); padding: 20px;">接続エラーが発生しました。${backoffDelay/1000}秒後に再試行します...</div>`;

            setTimeout(() => {
                displayPlayerShipsWithRetry(playFabId, retryCount + 1);
            }, backoffDelay);
        } else {
            console.error('[DisplayPlayerShips] Max retries reached, falling back to REST API');
            container.innerHTML = `
                <div style="text-align: center; color: var(--danger-color); padding: 20px;">
                    <div>リアルタイム接続に失敗しました</div>
                    <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: var(--accent-color); color: white; border: none; border-radius: 4px; cursor: pointer;">
                        再読み込み
                    </button>
                </div>
            `;

            fallbackToRestApi(playFabId, container);
        }
    });
}

async function fallbackToRestApi(playFabId, container) {
    try {
        console.log('[FallbackToRestApi] Using REST API as fallback');
        const ships = await getPlayerShips(playFabId);

        if (ships.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: var(--text-sub); padding: 20px;">船を所有していません</div>';
            return;
        }

        container.innerHTML = `
            <div style="background: rgba(255, 200, 0, 0.1); border: 1px solid rgba(255, 200, 0, 0.3); border-radius: 4px; padding: 12px; margin-bottom: 12px;">
                注意: リアルタイム更新に失敗したため、手動で再読み込みしてください。
            </div>
        ` + ships.map(ship => renderShipCard(ship)).join('');
    } catch (error) {
        console.error('[FallbackToRestApi] Failed:', error);
        container.innerHTML = '<div style="text-align: center; color: var(--danger-color); padding: 20px;">データの取得に失敗しました</div>';
    }
}

async function addShipCard(container, shipId, positionData, assetData) {
    const currentPos = calculateCurrentPosition(positionData.movement, positionData.position);

    cachedShipsData.set(shipId, { positionData, assetData });

    const shipData = {
        shipId,
        assetData,
        positionData,
        currentPosition: currentPos,
        isActive: shipId === activeShipIdCache
    };

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = renderShipCard(shipData);
    container.appendChild(tempDiv.firstElementChild);
}

async function updateShipCard(container, shipId, positionData, assetData) {
    const card = container.querySelector(`[data-ship-id="${shipId}"]`);
    if (!card) {
        await addShipCard(container, shipId, positionData, assetData);
        return;
    }

    const currentPos = calculateCurrentPosition(positionData.movement, positionData.position);

    cachedShipsData.set(shipId, { positionData, assetData });

    const shipData = {
        shipId,
        assetData,
        positionData,
        currentPosition: currentPos,
        isActive: shipId === activeShipIdCache
    };

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = renderShipCard(shipData);
    card.replaceWith(tempDiv.firstElementChild);
}

function removeShipCard(container, shipId) {
    const card = container.querySelector(`[data-ship-id="${shipId}"]`);
    if (card) {
        card.remove();
    }
}

function startShipAnimation() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    function animate() {
        const container = document.getElementById('playerShipsContainer');
        if (!container) {
            animationFrameId = null;
            return;
        }

        const shipCards = container.querySelectorAll('.ship-card');
        let hasAnyMovingShips = false;

        shipCards.forEach((card) => {
            const shipId = card.dataset.shipId;
            const cachedData = cachedShipsData.get(shipId);

            if (!cachedData || !cachedData.positionData.movement.isMoving) {
                return;
            }

            hasAnyMovingShips = true;

            const movement = cachedData.positionData.movement;
            const now = Date.now();
            const totalTime = movement.arrivalTime - movement.departureTime;
            const elapsedTime = now - movement.departureTime;
            const progress = Math.max(0, Math.min(100, (elapsedTime / totalTime) * 100));

            const progressBar = card.querySelector('[style*="background: linear-gradient"]');
            if (progressBar) {
                progressBar.style.transition = 'none';
                progressBar.style.width = `${progress}%`;
            }

            const etaElement = card.querySelector('[style*="margin-top: 4px"]');
            if (etaElement && movement.arrivalTime) {
                const remainingMs = movement.arrivalTime - now;
                if (remainingMs <= 0) {
                    etaElement.textContent = '到着済み';
                } else {
                    const totalSeconds = Math.floor(remainingMs / 1000);
                    const minutes = Math.floor(totalSeconds / 60);
                    const seconds = totalSeconds % 60;
                    etaElement.textContent = minutes > 0 ? `あと${minutes}分${seconds}秒` : `あと${seconds}秒`;
                }
            }
        });

        if (hasAnyMovingShips) {
            animationFrameId = requestAnimationFrame(animate);
        } else {
            animationFrameId = null;
        }
    }

    animate();
}

export function watchShipsInView(centerX, centerY, radius, onShipsUpdate, mapId = null) {
    console.log('[WatchShipsInView] Starting listener for area:', centerX, centerY, 'radius:', radius, 'mapId:', mapId);

    if (shipsInViewListener) {
        shipsInViewListener();
        shipsInViewListener = null;
    }

    const firestore = window.firestore;
    if (!firestore) {
        console.error('[WatchShipsInView] Firestore not initialized');
        return null;
    }

    const shipsRef = collection(firestore, 'ships');
    const mapFilter = mapId ? where('mapId', '==', mapId) : null;

    shipsInViewListener = onSnapshot(mapFilter ? query(shipsRef, mapFilter) : shipsRef, (snapshot) => {
        console.log('[WatchShipsInView] Snapshot received, total ships:', snapshot.size);

        const shipsInView = [];
        snapshot.forEach((doc) => {
            const shipData = doc.data();
            const currentPos = calculateCurrentPosition(shipData.movement, shipData.position);
            const distance = Math.sqrt(
                Math.pow(currentPos.x - centerX, 2) +
                Math.pow(currentPos.y - centerY, 2)
            );

            if (distance <= radius) {
                shipsInView.push({
                    shipId: shipData.shipId,
                    playFabId: shipData.playFabId,
                    position: currentPos,
                    appearance: shipData.appearance,
                    movement: shipData.movement
                });
            }
        });

        console.log('[WatchShipsInView] Ships in view:', shipsInView.length);

        if (onShipsUpdate) {
            onShipsUpdate(shipsInView);
        }
    }, (error) => {
        console.error('[WatchShipsInView] Listener error:', error);
    });

    return shipsInViewListener;
}

export function cleanupShipListeners() {
    console.log('[CleanupShipListeners] Cleaning up all listeners and animations');

    if (playerShipsListener) {
        playerShipsListener();
        playerShipsListener = null;
    }

    if (shipsInViewListener) {
        shipsInViewListener();
        shipsInViewListener = null;
    }

    activeShipListeners.forEach((unsubscribe) => {
        unsubscribe();
    });
    activeShipListeners.clear();

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    cachedShipsData.clear();
}

if (typeof window !== 'undefined') {
    window.upgradeShip = (shipId) => {
        const playFabId = window.myPlayFabId || window.myPlayFabLoginInfo?.playFabId;
        return upgradeShip(playFabId, shipId);
    };
    window.repairShip = (shipId) => {
        const playFabId = window.myPlayFabId || window.myPlayFabLoginInfo?.playFabId;
        return repairShip(playFabId, shipId);
    };
    window.depositShipResources = (shipId) => {
        const playFabId = window.myPlayFabId || window.myPlayFabLoginInfo?.playFabId;
        return depositActiveShipResources(playFabId, shipId);
    };
    window.applyShipCargoPreset = (shipId) => {
        const playFabId = window.myPlayFabId || window.myPlayFabLoginInfo?.playFabId;
        return applyActiveShipPreset(playFabId, shipId);
    };
    window.editShipCargoPreset = () => {
        const playFabId = window.myPlayFabId || window.myPlayFabLoginInfo?.playFabId;
        return showShipCargoPresetEditor(playFabId);
    };
}
