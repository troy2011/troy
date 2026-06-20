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
    claimExploration as requestClaimExploration,
    getPlayerShipStatus as requestPlayerShipStatus,
    upgradePlayerShip as requestUpgradePlayerShip,
    renamePlayerShip as requestRenamePlayerShip,
    getInventory as fetchInventory,
    getPlayerShips as fetchPlayerShips,
    getShipsInView as fetchShipsInView,
    getShipAsset as fetchShipAsset,
    getShipPosition as fetchShipPosition
} from './playfabClient.js';
import { showRpgMessage, rpgSay } from './rpgMessages.js';
import { createRequestId } from './api.js';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { formatCurrencyLabel } from './config.js';
import * as Player from './player.js';
import * as Inventory from './inventory.js';
import { buildAvatarLayerMarkup, renderAvatar, triggerAvatarAttackMotion } from './avatar.js';

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
        overlay.querySelector('#payCancelBtn').addEventListener('click', () => {
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

const EXPLORATION_MONSTER_SPRITES = {
    skeleton_captain: { id: 'skeleton_captain', src: './Sprites/monsters/skeleton_captain.png', name: '骸骨船長' },
    ghost_pirate: { id: 'ghost_pirate', src: './Sprites/monsters/ghost_pirate.png', name: '幽霊海賊' },
    zombie_raider: { id: 'zombie_raider', src: './Sprites/monsters/zombie_raider.png', name: 'ゾンビ海賊' },
    drowned_buccaneer: { id: 'drowned_buccaneer', src: './Sprites/monsters/drowned_buccaneer.png', name: '濡れし海賊' },
    shark_raider: { id: 'shark_raider', src: './Sprites/monsters/shark_raider.png', name: '鮫の略奪者' },
    crab_brute: { id: 'crab_brute', src: './Sprites/monsters/crab_brute.png', name: '甲殻の暴れ者' },
    anchor_golem: { id: 'anchor_golem', src: './Sprites/monsters/anchor_golem.png', name: '錨ゴーレム' },
    cursed_shipwheel: { id: 'cursed_shipwheel', src: './Sprites/monsters/cursed_shipwheel.png', name: '呪いの舵輪' },
    mimic_chest: { id: 'mimic_chest', src: './Sprites/monsters/mimic_chest.png', name: '宝箱ミミック' },
    cannon_mimic: { id: 'cannon_mimic', src: './Sprites/monsters/cannon_mimic.png', name: '大砲ミミック' },
    blue_kraken: { id: 'blue_kraken', src: './Sprites/monsters/blue_kraken.png', name: '深海クラーケン' },
    kraken_pirate: { id: 'kraken_pirate', src: './Sprites/monsters/kraken_pirate.png', name: '海賊クラーケン' },
    lantern_wraith: { id: 'lantern_wraith', src: './Sprites/monsters/lantern_wraith.png', name: 'ランタンの亡霊' },
    skeletal_parrot: { id: 'skeletal_parrot', src: './Sprites/monsters/skeletal_parrot.png', name: '骸骨オウム' },
    puffer_bomb: { id: 'puffer_bomb', src: './Sprites/monsters/puffer_bomb.png', name: '爆弾フグ' },
    treasure_slime: { id: 'treasure_slime', src: './Sprites/monsters/treasure_slime.png', name: '財宝スライム' },
    coral_goblin: { id: 'coral_goblin', src: './Sprites/monsters/coral_goblin.png', name: '珊瑚ゴブリン' },
    merfolk_lancer: { id: 'merfolk_lancer', src: './Sprites/monsters/merfolk_lancer.png', name: '人魚の槍兵' },
    chained_megalodon: { id: 'chained_megalodon', src: './Sprites/monsters/chained_megalodon.png', name: '鎖縛のメガロドン' },
    specter_whale: { id: 'specter_whale', src: './Sprites/monsters/specter_whale.png', name: '亡霊クジラ' },
    armored_kraken: { id: 'armored_kraken', src: './Sprites/monsters/armored_kraken.png', name: '甲冑クラーケン' },
    phantom_admiral: { id: 'phantom_admiral', src: './Sprites/monsters/phantom_admiral.png', name: '亡霊提督' },
    abyss_angler: { id: 'abyss_angler', src: './Sprites/monsters/abyss_angler.png', name: '深淵アンコウ' },
    cannon_hermit: { id: 'cannon_hermit', src: './Sprites/monsters/cannon_hermit.png', name: '砲台ヤドカリ' },
    storm_serpent: { id: 'storm_serpent', src: './Sprites/monsters/storm_serpent.png', name: '嵐の海蛇' },
    manta_wraith: { id: 'manta_wraith', src: './Sprites/monsters/manta_wraith.png', name: '亡霊マンタ' },
    treasure_hermit: { id: 'treasure_hermit', src: './Sprites/monsters/treasure_hermit.png', name: '財宝ヤドカリ' }
};

const EXPLORATION_DESTINATION_BOSS_SPRITES = {
    near_sea: 'puffer_bomb',
    palm_islet: 'treasure_slime',
    coral_lagoon: 'coral_goblin',
    coral_passage: 'coral_goblin',
    old_lighthouse: 'ghost_pirate',
    sunken_trader: 'drowned_buccaneer',
    ship_graveyard: 'anchor_golem',
    pirate_cove: 'shark_raider',
    deep_maelstrom: 'merfolk_lancer',
    megalodon_reef: 'chained_megalodon',
    specter_whale_sea: 'specter_whale',
    armored_kraken_nest: 'armored_kraken',
    phantom_admiral_marsh: 'phantom_admiral',
    abyss_angler_vents: 'abyss_angler',
    cannon_hermit_fort: 'cannon_hermit',
    storm_serpent_current: 'storm_serpent',
    manta_wraith_grotto: 'manta_wraith',
    treasure_hermit_cave: 'treasure_hermit'
};

const EXPLORATION_BOSS_TIER_LABELS = {
    weak: '弱',
    medium: '中',
    strong: '強'
};

const EXPLORATION_BOSS_NAME_HINTS = [
    { keywords: ['霧', '亡霊', '幽霊', '灯台'], spriteId: 'ghost_pirate' },
    { keywords: ['宝箱', '箱', '漂流'], spriteId: 'mimic_chest' },
    { keywords: ['沈没', '錨', '番人'], spriteId: 'anchor_golem' },
    { keywords: ['大砲', '砲'], spriteId: 'cannon_mimic' },
    { keywords: ['鮫', 'サメ'], spriteId: 'shark_raider' },
    { keywords: ['クラーケン', '海獣'], spriteId: 'kraken_pirate' },
    { keywords: ['海賊', 'BOSS'], spriteId: 'skeleton_captain' }
];

const EXPLORATION_DEFAULT_BOSS_SPRITE_IDS = [
    'skeleton_captain',
    'ghost_pirate',
    'zombie_raider',
    'drowned_buccaneer',
    'shark_raider',
    'crab_brute',
    'anchor_golem',
    'cursed_shipwheel',
    'mimic_chest',
    'cannon_mimic',
    'blue_kraken',
    'kraken_pirate',
    'lantern_wraith',
    'skeletal_parrot',
    'puffer_bomb',
    'treasure_slime',
    'coral_goblin',
    'merfolk_lancer',
    'chained_megalodon',
    'specter_whale',
    'armored_kraken',
    'phantom_admiral',
    'abyss_angler',
    'cannon_hermit',
    'storm_serpent',
    'manta_wraith',
    'treasure_hermit'
];

const EXPLORATION_FALLBACK_BOSS_SPRITE = {
    id: 'boss',
    src: './Sprites/monsters/kraken_pirate.png',
    name: 'BOSS'
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

function getExplorationMonsterSprite(spriteId, bossName = '') {
    const sprite = EXPLORATION_MONSTER_SPRITES[spriteId] || EXPLORATION_FALLBACK_BOSS_SPRITE;
    return {
        ...sprite,
        name: String(bossName || sprite.name || 'BOSS')
    };
}

function getExplorationBossTierLabel(tier, fallback = '') {
    return EXPLORATION_BOSS_TIER_LABELS[String(tier || '').trim().toLowerCase()] || fallback;
}

function resolveExplorationBossSprite(destinationId, bossName, bossSpriteId = '') {
    const explicitSpriteId = String(bossSpriteId || '').trim();
    if (explicitSpriteId) return getExplorationMonsterSprite(explicitSpriteId, bossName);

    const key = String(destinationId || '').trim().toLowerCase();
    const normalizedName = String(bossName || '').trim();
    const destinationSpriteId = EXPLORATION_DESTINATION_BOSS_SPRITES[key];
    if (destinationSpriteId) return getExplorationMonsterSprite(destinationSpriteId, normalizedName);

    const hinted = EXPLORATION_BOSS_NAME_HINTS.find((hint) => hint.keywords.some((keyword) => normalizedName.includes(keyword)));
    if (hinted) return getExplorationMonsterSprite(hinted.spriteId, normalizedName);

    const source = normalizedName || key || 'boss';
    const index = Array.from(source).reduce((sum, char) => sum + char.codePointAt(0), 0) % EXPLORATION_DEFAULT_BOSS_SPRITE_IDS.length;
    return getExplorationMonsterSprite(EXPLORATION_DEFAULT_BOSS_SPRITE_IDS[index], normalizedName);
}

function renderExplorationBossImage(sprite, className = '', options = {}) {
    const classes = ['exploration-boss-image', className].filter(Boolean).join(' ');
    const alt = options.decorative ? '' : String(sprite?.name || 'BOSS');
    return `<img class="${escapeHtml(classes)}" src="${escapeHtml(sprite?.src || EXPLORATION_FALLBACK_BOSS_SPRITE.src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
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
        destination?.imagePath
        || destination?.destinationImagePath
        || destination?.destination_image_path
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
                <button type="button" class="ship-evolution-choice-close" aria-label="閉じる">×</button>
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
    overlay.querySelector('.ship-evolution-choice-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
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
            <button type="button" class="ship-evolution-close" aria-label="閉じる">×</button>
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
    overlay.querySelector('.ship-evolution-close')?.addEventListener('click', close);
    overlay.querySelector('.ship-evolution-ok')?.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
    });
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

function renderExplorationReport(report) {
    const lines = String(report?.reportText || '').split('\n').map(escapeHtml).join('<br>');
    return `
        <details class="ship-exploration-report">
            <summary>${escapeHtml(report?.destinationName || '探索レポート')}</summary>
            <div class="ship-exploration-report-body">${lines || '探索レポートを確認しました。'}</div>
        </details>
    `;
}

function renderExplorationDestinationBossPool(destination) {
    const bosses = Array.isArray(destination?.bosses) ? destination.bosses : [];
    if (bosses.length) {
        return bosses.map((boss) => {
            const label = boss.tierLabel || getExplorationBossTierLabel(boss.tier);
            const name = boss.name || boss.id || 'BOSS';
            return `${label ? `${label}: ` : ''}${name}`;
        }).join(' / ');
    }
    return destination?.bossName || 'あり';
}

function normalizeExplorationBossTier(tier) {
    const key = String(tier || '').trim().toLowerCase();
    return ['weak', 'medium', 'strong'].includes(key) ? key : 'unknown';
}

function renderExplorationDestinationBossChips(destination) {
    const bosses = Array.isArray(destination?.bosses) ? destination.bosses : [];
    const summary = renderExplorationDestinationBossPool(destination);
    if (!bosses.length) {
        return `
            <div class="ship-exploration-boss-list is-single" aria-label="BOSS: ${escapeHtml(summary)}">
                <span class="ship-exploration-boss-chip is-unknown">
                    <span class="ship-exploration-boss-avatar" aria-hidden="true"></span>
                    <b>BOSS</b>
                    <span>${escapeHtml(summary)}</span>
                </span>
            </div>
        `;
    }
    return `
        <div class="ship-exploration-boss-list" aria-label="BOSS: ${escapeHtml(summary)}">
            ${bosses.map((boss) => {
                const tier = normalizeExplorationBossTier(boss.tier);
                const label = boss.tierLabel || getExplorationBossTierLabel(boss.tier, 'BOSS');
                const name = String(boss.name || boss.id || 'BOSS');
                const sprite = getExplorationMonsterSprite(boss.spriteId || boss.id, name);
                return `
                    <span class="ship-exploration-boss-chip is-${tier}">
                        <span class="ship-exploration-boss-avatar" aria-hidden="true">
                            ${renderExplorationBossImage(sprite, 'ship-exploration-boss-image', { decorative: true })}
                        </span>
                        <b>${escapeHtml(label)}</b>
                        <span>${escapeHtml(name)}</span>
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

function getExplorationRequiredSupplyUnits(destination, paymentState) {
    const rarity = String(destination?.rarity || 'low').trim().toLowerCase();
    const requiredByRarity = paymentState?.requiredByRarity || {};
    const fromDestinationSupply = Number(destination?.requiredSupplyUnits);
    const fromDestination = Number(destination?.requiredConsumableCount);
    const fromPayment = Number(requiredByRarity[rarity]);
    const value = Number.isFinite(fromDestinationSupply) && fromDestinationSupply > 0
        ? fromDestinationSupply
        : Number.isFinite(fromDestination) && fromDestination > 0
        ? fromDestination
        : fromPayment;
    return Math.max(1, Math.floor(Number(value || 1) || 1));
}

function getExplorationRequiredConsumableCount(destination, paymentState) {
    return getExplorationRequiredSupplyUnits(destination, paymentState);
}

function getExplorationMaxSupplyUnits(requiredSupplyUnits, paymentState) {
    const extra = Math.max(0, Math.floor(Number(paymentState?.maxExtraSupplyUnits ?? 3) || 0));
    return Math.max(1, Math.floor(Number(requiredSupplyUnits || 1) || 1)) + extra;
}

function getExplorationConsumableTotal(paymentState) {
    return getExplorationPaymentConsumables(paymentState)
        .reduce((sum, item) => sum + (item.amount * item.effectiveUnits), 0);
}

function buildExplorationPaymentPreview(consumables, selected, requiredSupplyUnits) {
    const categoryCounts = {};
    const alcoholCategories = new Set();
    let totalUnits = 0;
    let totalMenuPrice = 0;
    let hasFood = false;
    let hasDrink = false;
    let hasCalmRoute = false;
    let hasPremium = false;
    consumables.forEach((item) => {
        const quantity = Math.max(0, Math.floor(Number(selected.get(item.itemId) || 0) || 0));
        if (quantity <= 0) return;
        const category = String(item.menuCategory || '').trim().toLowerCase() || 'unknown';
        categoryCounts[category] = (categoryCounts[category] || 0) + quantity;
        totalUnits += quantity * item.effectiveUnits;
        totalMenuPrice += quantity * item.menuPrice;
        if (category === 'food') hasFood = true;
        if (category && category !== 'food') hasDrink = true;
        if (['beer', 'gin', 'liqueur', 'rum', 'tequila', 'vodka', 'whisky'].includes(category)) alcoholCategories.add(category);
        if (category === 'soft' || category === 'mixer') hasCalmRoute = true;
        if (item.effectiveUnits >= 3) hasPremium = true;
    });
    const labels = [];
    if (hasFood && hasDrink) labels.push('食事と飲み物で敗北時の回収を支援');
    if (alcoholCategories.size >= 2) labels.push('酒種の多様性で攻勢を強化');
    if (hasCalmRoute) labels.push('割り材/ソフトで守りを安定');
    if (hasPremium) labels.push('高級品で宝箱の質を底上げ');
    if (totalUnits > requiredSupplyUnits) labels.push('余剰補給で探索精度を向上');
    return {
        totalUnits,
        totalMenuPrice,
        categoryCounts,
        labels
    };
}

function renderExplorationPaymentBadges(destination, {
    canUseDailyFree,
    hasPaymentState,
    requiredSupplyUnits
} = {}) {
    const cost = Number(destination?.cost || 0).toLocaleString('ja-JP');
    if (!hasPaymentState) {
        return canUseDailyFree
            ? `<span class="ship-exploration-badge is-free">本日無料</span><span class="ship-exploration-badge">通常${cost}G</span>`
            : `<span class="ship-exploration-badge">${cost}G</span>`;
    }
    if (canUseDailyFree) {
        return `
            <span class="ship-exploration-badge is-free">本日無料</span>
            <span class="ship-exploration-badge is-item">供給力${requiredSupplyUnits.toLocaleString('ja-JP')}</span>
            <span class="ship-exploration-badge">${cost}G</span>
        `;
    }
    return `
        <span class="ship-exploration-badge is-item">供給力${requiredSupplyUnits.toLocaleString('ja-JP')}</span>
        <span class="ship-exploration-badge">${cost}G</span>
    `;
}

function renderExplorationPaymentActions(destination, {
    isAvailable,
    canUseDailyFree,
    hasPaymentState,
    canPayWithConsumables,
    requiredSupplyUnits
} = {}) {
    const id = escapeHtml(destination?.id || '');
    const cost = Number(destination?.cost || 0).toLocaleString('ja-JP');
    if (!isAvailable) {
        return '<button type="button" class="ship-exploration-start" disabled aria-disabled="true">条件未達</button>';
    }
    if (!hasPaymentState) {
        return `<button type="button" class="ship-exploration-start" data-exploration-start="${id}">探索開始</button>`;
    }
    if (canUseDailyFree) {
        return `<button type="button" class="ship-exploration-start" data-exploration-start="${id}" data-exploration-payment-method="free">無料で探索開始</button>`;
    }
    return `
        <div class="ship-exploration-payment-actions">
            <button type="button" class="ship-exploration-start is-consumable" data-exploration-start="${id}" data-exploration-payment-method="consumable"${canPayWithConsumables ? '' : ' disabled aria-disabled="true"'}>${canPayWithConsumables ? '消耗品で探索' : `供給力${requiredSupplyUnits.toLocaleString('ja-JP')}不足`}</button>
            <button type="button" class="ship-exploration-start is-gold" data-exploration-start="${id}" data-exploration-payment-method="gold">${cost}Gで探索</button>
        </div>
    `;
}

function showExplorationConsumablePaymentDialog({ destination, paymentState }) {
    const requiredSupplyUnits = getExplorationRequiredSupplyUnits(destination, paymentState);
    const maxSupplyUnits = getExplorationMaxSupplyUnits(requiredSupplyUnits, paymentState);
    const consumables = getExplorationPaymentConsumables(paymentState);
    if (getExplorationConsumableTotal(paymentState) < requiredSupplyUnits) {
        showRpgMessage(`探索には供給力${requiredSupplyUnits.toLocaleString('ja-JP')}以上が必要です。`);
        return Promise.resolve(null);
    }
    return new Promise((resolve) => {
        const selected = new Map();
        const overlay = document.createElement('div');
        overlay.className = 'ship-exploration-payment-overlay';
        overlay.innerHTML = `
            <div class="ship-exploration-payment-dialog" role="dialog" aria-modal="true" aria-label="探索に使う消耗品">
                <div class="ship-exploration-payment-head">
                    <strong>${escapeHtml(destination?.name || '探索')}</strong>
                    <span>供給力 ${requiredSupplyUnits.toLocaleString('ja-JP')}以上を選択</span>
                </div>
                <div class="ship-exploration-payment-list" data-exploration-payment-list></div>
                <div class="ship-exploration-payment-summary" data-exploration-payment-summary></div>
                <div class="ship-exploration-payment-buttons">
                    <button type="button" data-exploration-payment-confirm disabled>出航する</button>
                    <button type="button" data-exploration-payment-cancel>キャンセル</button>
                </div>
            </div>
        `;
        const list = overlay.querySelector('[data-exploration-payment-list]');
        const summary = overlay.querySelector('[data-exploration-payment-summary]');
        const confirm = overlay.querySelector('[data-exploration-payment-confirm]');
        const cleanup = (result) => {
            overlay.remove();
            document.body.classList.remove('modal-lock');
            resolve(result);
        };
        const currentTotal = () => consumables.reduce((sum, item) => {
            const quantity = Math.max(0, Math.floor(Number(selected.get(item.itemId) || 0) || 0));
            return sum + quantity * item.effectiveUnits;
        }, 0);
        const render = () => {
            const total = currentTotal();
            const preview = buildExplorationPaymentPreview(consumables, selected, requiredSupplyUnits);
            list.innerHTML = consumables.map((item) => {
                const chosen = selected.get(item.itemId) || 0;
                const image = item.imagePath
                    ? `<span class="ship-exploration-payment-item-image"><img src="${escapeHtml(item.imagePath)}" alt=""></span>`
                    : '<span class="ship-exploration-payment-item-image" aria-hidden="true"></span>';
                const canAdd = chosen < item.amount && (total + item.effectiveUnits) <= maxSupplyUnits;
                const priceLabel = item.menuPrice > 0 ? ` / ${item.menuPrice.toLocaleString('ja-JP')}G` : '';
                return `
                    <div class="ship-exploration-payment-item" data-payment-item-id="${escapeHtml(item.itemId)}">
                        ${image}
                        <div class="ship-exploration-payment-item-copy">
                            <strong>${escapeHtml(item.displayName || item.itemId)}</strong>
                            <span>所持 ${item.amount.toLocaleString('ja-JP')} / 供給力 +${item.effectiveUnits.toLocaleString('ja-JP')}${priceLabel}</span>
                        </div>
                        <div class="ship-exploration-payment-stepper" aria-label="${escapeHtml(item.displayName || item.itemId)}の使用数">
                            <button type="button" data-payment-step="-1"${chosen <= 0 ? ' disabled' : ''}>-</button>
                            <span>${chosen.toLocaleString('ja-JP')}</span>
                            <button type="button" data-payment-step="1"${canAdd ? '' : ' disabled'}>+</button>
                        </div>
                    </div>
                `;
            }).join('');
            const surplus = Math.max(0, total - requiredSupplyUnits);
            const effectHtml = preview.labels.length
                ? `<div class="ship-exploration-payment-effects">${preview.labels.map((label) => `<span>${escapeHtml(label)}</span>`).join('')}</div>`
                : '';
            summary.innerHTML = `
                <div>供給力 ${total.toLocaleString('ja-JP')} / ${requiredSupplyUnits.toLocaleString('ja-JP')}（上限 ${maxSupplyUnits.toLocaleString('ja-JP')}）${surplus > 0 ? ` / 余剰 +${surplus.toLocaleString('ja-JP')}` : ''}</div>
                ${effectHtml}
            `;
            confirm.disabled = total < requiredSupplyUnits || total > maxSupplyUnits;
        };
        list.addEventListener('click', (event) => {
            const button = event.target.closest('[data-payment-step]');
            if (!button) return;
            const row = button.closest('[data-payment-item-id]');
            const itemId = String(row?.dataset?.paymentItemId || '');
            const item = consumables.find((entry) => entry.itemId === itemId);
            if (!item) return;
            const step = Number(button.dataset.paymentStep || 0);
            const total = currentTotal();
            const current = selected.get(itemId) || 0;
            const next = Math.max(0, Math.min(item.amount, current + step));
            if (step > 0 && total + item.effectiveUnits > maxSupplyUnits) return;
            if (next > 0) selected.set(itemId, next);
            else selected.delete(itemId);
            render();
        });
        confirm.addEventListener('click', () => {
            const total = currentTotal();
            if (total < requiredSupplyUnits || total > maxSupplyUnits) return;
            cleanup(Array.from(selected.entries()).map(([itemId, quantity]) => ({ itemId, quantity })));
        });
        overlay.querySelector('[data-exploration-payment-cancel]')?.addEventListener('click', () => cleanup(null));
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
            category: data.reward.Category || data.reward.category || ''
        }];
    }
    return [];
}

function renderExplorationRewardChests(count) {
    const total = Math.max(0, Math.floor(Number(count || 0)));
    if (!total) return '<span class="exploration-sequence-no-chest">なし</span>';
    const visible = Math.min(total, 3);
    const chests = Array.from({ length: visible }, (_, index) => (
        `<span class="exploration-sequence-mini-chest" data-exploration-sequence-chest style="--i:${index};"></span>`
    ));
    if (total > visible) {
        chests.push(`<span class="exploration-sequence-chest-more">+${(total - visible).toLocaleString('ja-JP')}</span>`);
    }
    return chests.join('');
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

function getExplorationBattleLogLines(report) {
    return String(report?.bossLog || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !line.includes('戦闘開始'))
        .slice(0, 4);
}

function getExplorationRewardName(item) {
    return String(item?.displayName || item?.DisplayName || item?.itemId || item?.ItemId || 'お宝');
}

function getExplorationRewardQuantity(item) {
    const value = Number(item?.quantity ?? item?.Quantity ?? item?.amount ?? item?.Amount ?? item?.count ?? item?.Count ?? 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
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

function showExplorationResultSummary(data, options = {}) {
    const report = data?.report || {};
    const bossResult = normalizeBossResult(report.bossResult);
    const reportDestinationId = report.destinationId || data?.active?.destinationId || data?.destinationId || '';
    const bossName = String(report.bossName || '遭遇なし');
    const bossSprite = resolveExplorationBossSprite(reportDestinationId, report.bossName, report.bossSpriteId);
    const bossTierLabel = report.bossTierLabel || getExplorationBossTierLabel(report.bossTier);
    const bossTierKey = normalizeExplorationBossTier(report.bossTier);
    const rewards = getRewardItemsForReveal(data);
    const rewardTotal = Number(report.rewardCount || rewards.length || 0);
    const chestAlreadyOpened = rewardTotal > 0 && options.chestOpened === true;
    const awaitsChestOpen = rewardTotal > 0 && !chestAlreadyOpened;
    const resultLabel = getExplorationBossResultLabel(bossResult);
    const bossResultSummary = bossTierLabel ? `${bossTierLabel}BOSS / ${resultLabel}` : resultLabel;
    const resultHint = rewardTotal > 0 ? `${rewardTotal.toLocaleString('ja-JP')}個のお宝を回収` : 'お宝は見つかりませんでした';
    const promptTitle = awaitsChestOpen ? '宝箱を開ける' : (rewardTotal > 0 ? '回収完了' : '回収なし');
    const promptText = awaitsChestOpen ? 'クリックして中身を確認してください。' : (rewardTotal > 0 ? '宝箱を開封し、戦利品を持ち帰りました。' : '航路を確認して帰還しました。');
    const rewardHtml = rewards.length
        ? rewards.map((item) => {
            const rarity = normalizeRewardRarity(item.rarity || item.Rarity);
            const quantity = getExplorationRewardQuantity(item);
            const quantityText = quantity > 1 ? `×${quantity.toLocaleString('ja-JP')}` : '';
            return `
                <li class="exploration-result-reward is-${rarity}">
                    <span class="exploration-result-reward-icon" aria-hidden="true"></span>
                    <strong>${escapeHtml(getExplorationRewardName(item))}</strong>
                    <span>${escapeHtml(getExplorationRarityLabel(rarity))}${quantityText}</span>
                </li>
            `;
        }).join('')
        : `
            <li class="exploration-result-reward is-empty">
                <span class="exploration-result-reward-icon" aria-hidden="true"></span>
                <strong>報酬なし</strong>
                <span>NONE</span>
            </li>
        `;
    const logLines = getExplorationBattleLogLines(report);
    const logHtml = logLines.length
        ? logLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')
        : '<div>静かな航路を抜けて探索を終えました。</div>';
    const existing = document.querySelector('.exploration-result-overlay');
    existing?.remove();

    const overlay = document.createElement('div');
    overlay.className = `exploration-result-overlay is-${bossResult} is-boss-${bossTierKey} ${awaitsChestOpen ? 'is-awaiting-open' : 'is-opened'}`;
    overlay.innerHTML = `
        <div class="exploration-result-dialog" role="dialog" aria-modal="true" aria-label="探索結果">
            <button type="button" class="exploration-result-close" aria-label="閉じる">×</button>
            <div class="exploration-result-head">
                <span data-exploration-result-state>${awaitsChestOpen ? '宝箱を発見' : resultLabel}</span>
                <strong>${escapeHtml(report.destinationName || '探索結果')}</strong>
                <small data-exploration-result-hint>${awaitsChestOpen ? '宝箱を開けて探索結果を確認' : resultHint}</small>
            </div>
            <div class="exploration-result-showcase ${rewardTotal > 0 ? 'has-rewards' : 'is-empty'}">
                <button type="button" class="exploration-result-chest-button" data-exploration-result-open aria-label="${awaitsChestOpen ? '宝箱を開ける' : '宝箱'}" ${awaitsChestOpen ? '' : 'disabled'}>
                    <span class="exploration-result-chest ${rewardTotal > 0 ? 'has-rewards' : 'is-empty'}" aria-hidden="true"></span>
                </button>
                <div class="exploration-result-prompt">
                    <b data-exploration-result-prompt-title>${promptTitle}</b>
                    <span data-exploration-result-prompt-text>${promptText}</span>
                </div>
            </div>
            <div class="exploration-result-details" data-exploration-result-details>
                <div class="exploration-result-boss-card" data-exploration-boss-id="${escapeHtml(bossSprite.id || '')}">
                    <div class="exploration-result-boss-art">
                        ${renderExplorationBossImage(bossSprite, 'exploration-result-boss-image')}
                    </div>
                    <div class="exploration-result-boss-copy">
                        <b>BOSS</b>
                        <strong>${escapeHtml(bossName)}</strong>
                        <span>${escapeHtml(bossResultSummary)}</span>
                    </div>
                </div>
                <div class="exploration-result-body">
                    <div>
                        <b>結果</b>
                        <span>${escapeHtml(getExplorationBossResultText(report, bossResult))}</span>
                    </div>
                    <div>
                        <b>お宝</b>
                        <span>${rewardTotal.toLocaleString('ja-JP')}個</span>
                    </div>
                </div>
                <ul class="exploration-result-rewards">${rewardHtml}</ul>
                <div class="exploration-result-log">${logHtml}</div>
                <div class="exploration-result-actions">
                    <button type="button" data-exploration-result-close>閉じる</button>
                    ${options.playFabId ? '<button type="button" data-exploration-result-next>次の探索</button>' : ''}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

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
            if (promptTitle) promptTitle.textContent = '回収完了';
            if (promptText) promptText.textContent = '宝箱を開封し、戦利品を持ち帰りました。';
        }, 760);
    };
    overlay.querySelector('.exploration-result-close')?.addEventListener('click', close);
    overlay.querySelector('[data-exploration-result-open]')?.addEventListener('click', openResult);
    overlay.querySelector('[data-exploration-result-close]')?.addEventListener('click', close);
    overlay.querySelector('[data-exploration-result-next]')?.addEventListener('click', () => {
        close();
        if (typeof window.openHomeExplorationPopup === 'function') {
            window.openHomeExplorationPopup();
        } else {
            loadExplorationPanel(options.playFabId);
        }
    });
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
    });
}

function handleExplorationClaimResult(data, playFabId, options = {}) {
    if (typeof window.closeHomeExplorationPopup === 'function') {
        window.closeHomeExplorationPopup();
    }
    renderExplorationPanel(data, playFabId);
    showExplorationResultSummary(data, { playFabId, chestOpened: options.chestOpened === true });
}

function isExplorationStartConflict(error) {
    const message = String(error?.message || '');
    return message.includes('HTTP 409') || message.includes('探索中です');
}

function buildRecoveredExplorationStartData(claimData, destinationId) {
    const report = claimData?.report || {};
    const destinationVisual = getExplorationDestinationVisual(report.destinationId || destinationId);
    return {
        ship: claimData?.ship || currentPlayerShipProfile || {},
        active: {
            destinationId: report.destinationId || destinationId,
            destinationName: report.destinationName || destinationVisual.label || '探索先',
            imagePath: report.imagePath || destinationVisual.imagePath || ''
        }
    };
}

async function recoverConflictedExploration(playFabId, destinationId) {
    showRpgMessage('前回の探索結果を回収しています。');
    const claimData = await requestClaimExploration(playFabId, { throwOnError: true });
    const recoveredStartData = buildRecoveredExplorationStartData(claimData, destinationId);
    const sequenceResult = await showExplorationAutoSequence(recoveredStartData, recoveredStartData.active.destinationId || destinationId, claimData);
    handleExplorationClaimResult(claimData, playFabId, sequenceResult);
    await loadExplorationPanel(playFabId);
}

async function showExplorationAutoSequence(startData, destinationId, claimData = null) {
    const ship = startData?.ship || currentPlayerShipProfile || {};
    const active = startData?.active || {};
    const form = normalizePlayerShipForm(ship.form);
    const guildSailColor = form === 'guild' ? resolveGuildShipSailColor(ship) : 'white';
    const guildLayers = form === 'guild' ? renderGuildShipLayers(ship) : '';
    const report = claimData?.report || {};
    const resolvedDestinationId = active.destinationId || report.destinationId || destinationId;
    const destinationVisual = getExplorationDestinationVisual(active.destinationId ? active : resolvedDestinationId);
    const destinationName = active.destinationName || report.destinationName || destinationVisual.label || '探索先';
    const bossResult = normalizeBossResult(report.bossResult);
    const bossSprite = resolveExplorationBossSprite(resolvedDestinationId, report.bossName, report.bossSpriteId);
    const bossTierLabel = report.bossTierLabel || getExplorationBossTierLabel(report.bossTier);
    const bossTierKey = normalizeExplorationBossTier(report.bossTier);
    const rewards = getRewardItemsForReveal(claimData);
    const rewardCount = Number(report.rewardCount || rewards.length || 0);
    const shipTrait = EXPLORATION_SHIP_TRAITS[form] || EXPLORATION_SHIP_TRAITS.boat;
    const battleLogLines = getExplorationBattleLogLines(report);
    const homeFrame = document.getElementById('homePlayerShipFrame');
    const homeIcon = homeFrame?.querySelector('.home-player-ship-icon');
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
                <div class="exploration-sequence-route" aria-hidden="true"></div>
                <div class="exploration-sequence-arrival" aria-hidden="true"></div>
                ${renderExplorationDestinationVisual(active.destinationId ? active : resolvedDestinationId, 'exploration-sequence-island', 'div')}
                <div class="exploration-sequence-boss" data-exploration-boss-id="${escapeHtml(bossSprite.id || '')}" aria-hidden="true">
                    ${renderExplorationBossImage(bossSprite, 'exploration-sequence-boss-image', { decorative: true })}
                    <small>BOSS</small>
                </div>
                ${renderExplorationBattleAvatarMarkup()}
                <div class="exploration-sequence-ship-effect" aria-hidden="true"></div>
                <div class="exploration-sequence-ship is-${form}" data-guild-sail-color="${escapeHtml(guildSailColor)}" aria-hidden="true">${guildLayers}</div>
                <div class="exploration-sequence-chests" aria-hidden="true">${renderExplorationRewardChests(rewardCount)}</div>
                <div class="exploration-sequence-log" aria-live="polite"></div>
            </div>
            <div class="exploration-sequence-copy">
                <strong>${escapeHtml(destinationName)}</strong>
                <span data-exploration-sequence-label>${escapeHtml(shipTrait.label)}</span>
            </div>
            <div class="exploration-sequence-progress" data-exploration-sequence-progress aria-hidden="true"></div>
        </div>
    `;
    document.body.appendChild(overlay);
    applyPlayerShipFrameDirection(overlay.querySelector('.exploration-sequence-ship'), form === 'guild' ? 'guild-right' : 'row2-a');
    renderCurrentExplorationBattleAvatar();
    homeFrame?.classList.add('is-exploring');
    homeIcon?.classList.add('is-exploring-sail');

    const label = overlay.querySelector('[data-exploration-sequence-label]');
    const logBox = overlay.querySelector('.exploration-sequence-log');
    const battleAvatar = overlay.querySelector(`#${EXPLORATION_BATTLE_AVATAR_PREFIX}`);
    const progressHint = overlay.querySelector('[data-exploration-sequence-progress]');
    const setPhase = (phase, text) => {
        overlay.className = `exploration-sequence-overlay is-${form} ${shipTrait.className} is-sky-${destinationVisual.sky} is-boss-${bossTierKey} is-${phase} is-result-${bossResult}`;
        if (label) label.textContent = text;
        homeIcon?.classList.remove('is-exploring-sail', 'is-exploring-up', 'is-exploring-left', 'is-exploring-battle', 'is-exploring-treasure');
        homeIcon?.classList.add(`is-exploring-${phase}`);
    };
    const setBattleLog = (count) => {
        if (!logBox) return;
        logBox.innerHTML = battleLogLines.slice(0, count).map((line) => `<div>${escapeHtml(line)}</div>`).join('');
    };
    const waitForSequence = async (minimumMs) => {
        if (progressHint) progressHint.hidden = false;
        await wait(minimumMs);
        if (progressHint) progressHint.hidden = true;
    };

    setPhase('sail', shipTrait.label);
    await waitForSequence(900);
    setPhase('up', `${destinationVisual.label}を発見`);
    await waitForSequence(760);
    setPhase('left', '上陸地点へ直進');
    await waitForSequence(700);
    setPhase('battle', bossResult === 'none' ? 'BOSSの気配を回避' : `${bossTierLabel ? `${bossTierLabel}BOSS` : 'BOSS'}「${report.bossName || '???'}」と交戦`);
    triggerAvatarAttackMotion(battleAvatar, { direction: 'left', duration: 520 });
    setBattleLog(2);
    await wait(420);
    triggerAvatarAttackMotion(battleAvatar, { direction: 'left', duration: 520 });
    setBattleLog(4);
    await waitForSequence(900);
    setPhase('treasure', rewardCount > 0 ? `宝箱${rewardCount}個を発見` : 'お宝は見つからなかった');
    if (rewardCount > 0) {
        overlay.classList.add('has-sequence-rewards');
        await waitForSequence(700);
        overlay.classList.add('is-opening-chest');
        if (label) label.textContent = '宝箱を開封中';
        await wait(760);
        overlay.classList.remove('is-opening-chest');
        overlay.classList.add('is-opened-chest');
        if (label) label.textContent = '戦利品を確認';
        await waitForSequence(360);
    } else {
        await waitForSequence(700);
    }

    overlay.remove();
    homeFrame?.classList.remove('is-exploring');
    homeIcon?.classList.remove('is-exploring-sail', 'is-exploring-up', 'is-exploring-left', 'is-exploring-battle', 'is-exploring-treasure');
    return { chestOpened: rewardCount > 0 };
}

function renderExplorationPanel(data, playFabId) {
    const panel = document.getElementById('shipExplorationPanel');
    if (!panel) return;
    const ship = data?.ship || null;
    const active = data?.active || null;
    const reports = Array.isArray(data?.reports) ? data.reports : [];
    const dailyFreeAvailable = data?.dailyFree?.available === true;
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
    if (active) {
        panel.innerHTML = `
            ${head}
            <div class="ship-exploration-destination is-active">
                <div class="ship-exploration-card-head">
                    ${renderExplorationDestinationVisual(active, 'ship-exploration-mapmark')}
                    <div class="ship-exploration-title-group">
                        <strong>${escapeHtml(active.destinationName || '探索中')}</strong>
                        <div class="ship-exploration-meta">出航船: ${escapeHtml(active.shipName || '')}</div>
                    </div>
                </div>
                <div class="ship-exploration-badges" aria-label="探索状態">
                    <span class="ship-exploration-badge is-active">探索中</span>
                    <span class="ship-exploration-badge">結果確認待ち</span>
                </div>
                <div class="ship-exploration-meta">演出完了後に結果を確認できます。</div>
                <div class="ship-exploration-actions">
                    <button type="button" data-exploration-claim>結果を見る</button>
                </div>
            </div>
            ${reports.length ? `<div class="ship-exploration-reports">${reports.map(renderExplorationReport).join('')}</div>` : ''}
        `;
        panel.querySelector('[data-exploration-claim]')?.addEventListener('click', () => claimExploration(playFabId));
        return;
    }
    const destinations = Array.isArray(data?.destinations) ? data.destinations : [];
    const paymentState = getExplorationPaymentState(data);
    const hasPaymentState = !!paymentState;
    const ownedConsumableTotal = getExplorationConsumableTotal(paymentState);
    const destinationHtml = destinations.length
        ? destinations.map((destination) => {
            const isDailyFreeDestination = destination?.dailyFreeEligible === true;
            const isAvailable = destination?.available !== false;
            const canUseDailyFree = dailyFreeAvailable && isDailyFreeDestination;
            const requiredSupplyUnits = getExplorationRequiredSupplyUnits(destination, paymentState);
            const canPayWithConsumables = ownedConsumableTotal >= requiredSupplyUnits;
            const rarityKey = String(destination?.rarity || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'low';
            const rarityLabel = destination?.rarityLabel || destination?.slotLabel || '探索先';
            const requirementLabel = destination?.requirementLabel || '船の進化が必要';
            const recommendedLevel = Math.max(0, Math.floor(Number(destination?.recommendedLevel || 0) || 0));
            return `
            <div class="ship-exploration-destination${isAvailable ? '' : ' is-locked'}" data-exploration-destination-id="${escapeHtml(destination.id)}">
                <div class="ship-exploration-card-head">
                    ${renderExplorationDestinationVisual(destination, 'ship-exploration-mapmark')}
                    <div class="ship-exploration-title-group">
                        <strong>${escapeHtml(destination.name)}</strong>
                        <div class="ship-exploration-meta">${escapeHtml(destination.description || '')}</div>
                    </div>
                </div>
                <div class="ship-exploration-badges" aria-label="探索条件">
                    ${renderExplorationPaymentBadges(destination, { canUseDailyFree, hasPaymentState, requiredSupplyUnits })}
                    <span class="ship-exploration-badge is-rarity is-rarity-${escapeHtml(rarityKey)}">${escapeHtml(rarityLabel)}</span>
                    ${recommendedLevel > 0 ? `<span class="ship-exploration-badge is-level">推奨Lv ${recommendedLevel.toLocaleString('ja-JP')}</span>` : ''}
                    ${isAvailable ? '' : `<span class="ship-exploration-badge is-locked">条件: ${escapeHtml(requirementLabel)}</span>`}
                </div>
                ${renderExplorationDestinationMetaChips(destination)}
                ${renderExplorationDestinationBossChips(destination)}
                ${renderExplorationPaymentActions(destination, { isAvailable, canUseDailyFree, hasPaymentState, canPayWithConsumables, requiredSupplyUnits })}
            </div>
        `;
        }).join('')
        : '<div class="ship-exploration-empty">この船で行ける探索先がありません。</div>';
    panel.innerHTML = `
        ${head}
        <div class="ship-exploration-destinations">${destinationHtml}</div>
        ${reports.length ? `<div class="ship-exploration-reports">${reports.map(renderExplorationReport).join('')}</div>` : ''}
    `;
    panel.querySelectorAll('[data-exploration-start]').forEach((button) => {
        button.addEventListener('click', async () => {
            const destinationId = String(button.getAttribute('data-exploration-start') || '');
            const destination = destinations.find((entry) => String(entry?.id || '') === destinationId) || null;
            const paymentMethod = String(button.getAttribute('data-exploration-payment-method') || '').trim();
            if (paymentMethod === 'consumable') {
                const paymentConsumables = await showExplorationConsumablePaymentDialog({ destination, paymentState });
                if (!paymentConsumables) return;
                startExploration(playFabId, destinationId, { paymentMethod, paymentConsumables });
                return;
            }
            startExploration(playFabId, destinationId, paymentMethod ? { paymentMethod } : {});
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
                    <span>本日の海域を確認しています</span>
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

export async function loadExplorationPanel(playFabId) {
    const panel = document.getElementById('shipExplorationPanel');
    if (!panel || !playFabId) return;
    panel.innerHTML = renderExplorationLoading();
    try {
        const data = await requestExplorationStatus(playFabId, { isSilent: true, throwOnError: true });
        renderExplorationPanel(data, playFabId);
    } catch (error) {
        panel.innerHTML = `<div class="ship-exploration-empty">${escapeHtml(error?.message || '探索情報を読み込めませんでした。')}</div>`;
    }
}

async function startExploration(playFabId, destinationId, payment = {}) {
    if (!destinationId) return;
    if (explorationAutoRunning) return;
    explorationAutoRunning = true;
    try {
        const startData = await requestStartExploration(playFabId, destinationId, createRequestId('exploration-start'), {
            throwOnError: true,
            payment
        });
        if (Number.isFinite(Number(startData?.balance))) {
            Player.syncPointsDisplay(Number(startData.balance));
            await Player.getRanking();
        } else {
            await Player.getPoints(playFabId, { isSilent: true });
            await Player.getRanking();
        }
        renderExplorationPanel(startData, playFabId);
        const claimData = await requestClaimExploration(playFabId, { throwOnError: true });
        const sequenceResult = await showExplorationAutoSequence(startData, destinationId, claimData);
        handleExplorationClaimResult(claimData, playFabId, sequenceResult);
    } catch (error) {
        if (isExplorationStartConflict(error)) {
            try {
                await recoverConflictedExploration(playFabId, destinationId);
            } catch (recoverError) {
                showRpgMessage(recoverError?.message || '前回の探索結果を回収できませんでした。');
            }
        } else {
            showRpgMessage(error?.message || '探索を開始できませんでした。');
        }
    } finally {
        explorationAutoRunning = false;
    }
}

async function claimExploration(playFabId) {
    try {
        const data = await requestClaimExploration(playFabId, { throwOnError: true });
        handleExplorationClaimResult(data, playFabId);
    } catch (error) {
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
