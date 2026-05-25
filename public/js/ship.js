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
        return activeShipIdCache;
    }
    return null;
}

export async function setActiveShip(playFabId, shipId) {
    const result = await requestSetActiveShip(playFabId, shipId);
    if (result && result.success) {
        activeShipIdCache = result.activeShipId || shipId;
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
            window.dispatchEvent(new CustomEvent('ship:active-changed', { detail: { shipId: activeShipIdCache } }));
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
    merchant: 'マーチャント'
};

const EXPLORATION_BOSS_EMOJIS = {
    near_sea: ['🦀', '🦈', '🐙', '🐍'],
    coral_reef: ['🐡', '🪼', '🐙', '🦑'],
    storm_ocean: ['🐉', '👹', '🦈', '⚡'],
    ancient_ruins: ['🗿', '👻', '💀', '🐲'],
    default: ['👾', '👹', '🐉', '💀', '🦑', '🐲']
};

let currentPlayerShipProfile = null;
let explorationAutoRunning = false;

function normalizePlayerShipForm(form) {
    const key = String(form || 'boat').toLowerCase();
    return PLAYER_SHIP_LABELS[key] ? key : 'boat';
}

function pickExplorationBossEmoji(destinationId) {
    const key = String(destinationId || '').trim();
    const list = EXPLORATION_BOSS_EMOJIS[key] || EXPLORATION_BOSS_EMOJIS.default;
    return list[Math.floor(Math.random() * list.length)] || '👾';
}

function getPlayerShipClassName(form) {
    const key = normalizePlayerShipForm(form);
    return `home-player-ship-icon is-${key}`;
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

function renderPlayerShipWidget(ship) {
    const container = document.getElementById('homePlayerShipFrame');
    if (!container) return;
    currentPlayerShipProfile = ship || null;
    const form = normalizePlayerShipForm(ship?.form);
    const label = PLAYER_SHIP_LABELS[form] || 'ボート';
    const upgrades = Array.isArray(ship?.upgradeOptions) ? ship.upgradeOptions : [];
    const upgradeCosts = ship?.upgradeCosts || {};
    container.innerHTML = `
        <div class="home-player-ship-head">
            <span>相棒の船</span>
            <strong>${escapeHtml(label)}</strong>
        </div>
        <div class="home-player-ship-body">
            <div class="${getPlayerShipClassName(form)}" aria-hidden="true"></div>
            <div class="home-player-ship-meta">
                <div>段階 ${Number(ship?.stage || 1)}</div>
                <div>${escapeHtml(String(ship?.shipClass || 'common'))}</div>
            </div>
        </div>
        ${upgrades.length ? `
            <div class="home-player-ship-upgrades">
                ${upgrades.map((target) => {
                    const costLabel = formatShipUpgradeCost(upgradeCosts[target]);
                    return `<button type="button" data-player-ship-upgrade="${escapeHtml(target)}">${escapeHtml(PLAYER_SHIP_LABELS[target] || target)}へ${costLabel ? `<span>${escapeHtml(costLabel)}</span>` : ''}</button>`;
                }).join('')}
            </div>
        ` : '<div class="home-player-ship-final">最終形態</div>'}
    `;
    container.querySelectorAll('[data-player-ship-upgrade]').forEach((button) => {
        button.addEventListener('click', () => upgradePlayerShipProfile(String(button.getAttribute('data-player-ship-upgrade') || '')));
    });
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
        renderPlayerShipWidget(data?.ship || null);
        return data?.ship || null;
    } catch (error) {
        const container = document.getElementById('homePlayerShipFrame');
        if (container) container.innerHTML = '<div class="home-player-ship-empty">船情報を読み込めませんでした。</div>';
        return null;
    }
}

async function upgradePlayerShipProfile(targetForm) {
    const playFabId = window.myPlayFabId;
    if (!playFabId || !targetForm) return;
    const label = PLAYER_SHIP_LABELS[targetForm] || targetForm;
    if (!window.confirm(`${label}へ進化します。よろしいですか？`)) return;
    try {
        const beforeShip = currentPlayerShipProfile;
        const data = await requestUpgradePlayerShip(playFabId, targetForm, createRequestId('player-ship-upgrade'), { throwOnError: true });
        renderPlayerShipWidget(data?.ship || null);
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
        <div class="ship-exploration-report">
            <strong>${escapeHtml(report?.destinationName || '探索レポート')}</strong>
            <div>${lines || '探索レポートを確認しました。'}</div>
        </div>
    `;
}

function normalizeBossResult(value) {
    const result = String(value || 'none').toLowerCase();
    if (result === 'victory' || result === 'defeat') return result;
    return 'none';
}

function normalizeRewardRarity(value) {
    const rarity = String(value || 'common').trim().toLowerCase();
    return ['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(rarity) ? rarity : 'common';
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

function openTreasureButton(button, item) {
    if (!button || button.classList.contains('is-open')) return;
    const rarity = normalizeRewardRarity(item?.rarity || item?.Rarity);
    const name = String(item?.displayName || item?.DisplayName || item?.itemId || item?.ItemId || 'お宝');
    button.classList.add('is-opening');
    window.setTimeout(() => {
        button.classList.remove('is-opening');
        button.classList.add('is-open');
        const nameEl = button.querySelector('.exploration-treasure-name');
        if (nameEl) nameEl.textContent = name;
        button.setAttribute('aria-label', `${name} ${rarity}`);
        const overlay = button.closest('.exploration-treasure-overlay');
        if (overlay?.querySelectorAll('.exploration-treasure-box:not(.is-open)').length === 0) {
            const foot = overlay.querySelector('.exploration-treasure-foot');
            if (foot) foot.textContent = 'すべてのお宝を入手しました。';
        }
    }, 720);
}

function showExplorationTreasureReveal(rewards, options = {}) {
    const items = (Array.isArray(rewards) ? rewards : []).filter(Boolean);
    if (!items.length) return;
    const existing = document.querySelector('.exploration-treasure-overlay');
    existing?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'exploration-treasure-overlay';
    overlay.innerHTML = `
        <div class="exploration-treasure-dialog" role="dialog" aria-modal="true" aria-label="探索のお宝">
            <div class="exploration-treasure-head">
                <h3>探索のお宝</h3>
                <button type="button" class="exploration-treasure-close" aria-label="閉じる">×</button>
            </div>
            <div class="exploration-treasure-grid">
                ${items.map((item, index) => {
                    const rarity = normalizeRewardRarity(item.rarity || item.Rarity);
                    return `
                        <button type="button" class="exploration-treasure-box is-${rarity}" data-treasure-index="${index}" aria-label="宝箱 ${index + 1}">
                            <span class="exploration-treasure-chest"></span>
                            <span class="exploration-treasure-name">未開封</span>
                        </button>
                    `;
                }).join('')}
            </div>
            <div class="exploration-treasure-foot">${options.autoOpen ? '宝箱を回収中です。' : '宝箱を選んで開けてください。'}</div>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.exploration-treasure-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
    });
    overlay.querySelectorAll('[data-treasure-index]').forEach((button) => {
        button.addEventListener('click', () => {
            const index = Number(button.getAttribute('data-treasure-index') || 0);
            openTreasureButton(button, items[index] || {});
        });
    });
    if (options.autoOpen) {
        overlay.querySelectorAll('[data-treasure-index]').forEach((button, index) => {
            window.setTimeout(() => openTreasureButton(button, items[index] || {}), 420 + (index * 260));
        });
    }
}

async function showExplorationAutoSequence(startData, destinationId) {
    const ship = startData?.ship || currentPlayerShipProfile || {};
    const active = startData?.active || {};
    const form = normalizePlayerShipForm(ship.form);
    const destinationName = active.destinationName || destinationId || '探索先';
    const bossEmoji = pickExplorationBossEmoji(active.destinationId || destinationId);
    const homeFrame = document.getElementById('homePlayerShipFrame');
    const homeIcon = homeFrame?.querySelector('.home-player-ship-icon');
    const existing = document.querySelector('.exploration-sequence-overlay');
    existing?.remove();

    const overlay = document.createElement('div');
    overlay.className = `exploration-sequence-overlay is-${form}`;
    overlay.innerHTML = `
        <div class="exploration-sequence-dialog" role="dialog" aria-modal="true" aria-label="探索">
            <div class="exploration-sequence-scene">
                <div class="exploration-sequence-sky"></div>
                <div class="exploration-sequence-island" aria-hidden="true">🏝️</div>
                <div class="exploration-sequence-boss" aria-hidden="true">
                    <span>${escapeHtml(bossEmoji)}</span>
                    <small>BOSS</small>
                </div>
                <div class="exploration-sequence-ship is-${form}" aria-hidden="true"></div>
                <div class="exploration-sequence-chest" aria-hidden="true"></div>
            </div>
            <div class="exploration-sequence-copy">
                <strong>${escapeHtml(destinationName)}</strong>
                <span data-exploration-sequence-label>探索へ出発</span>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    homeFrame?.classList.add('is-exploring');
    homeIcon?.classList.add('is-exploring-sail');

    const label = overlay.querySelector('[data-exploration-sequence-label]');
    const setPhase = (phase, text) => {
        overlay.className = `exploration-sequence-overlay is-${form} is-${phase}`;
        if (label) label.textContent = text;
        homeIcon?.classList.remove('is-exploring-sail', 'is-exploring-up', 'is-exploring-left', 'is-exploring-battle');
        homeIcon?.classList.add(`is-exploring-${phase}`);
    };

    setPhase('sail', '波を越えて進行中');
    await wait(900);
    setPhase('up', '島影を発見');
    await wait(850);
    setPhase('left', '上陸地点へ回り込み');
    await wait(850);
    setPhase('battle', 'BOSSと遭遇');
    await wait(1050);
    setPhase('treasure', '宝箱を発見');
    await wait(900);

    overlay.remove();
    homeFrame?.classList.remove('is-exploring');
    homeIcon?.classList.remove('is-exploring-sail', 'is-exploring-up', 'is-exploring-left', 'is-exploring-battle', 'is-exploring-treasure');
}

function renderExplorationPanel(data, playFabId) {
    const panel = document.getElementById('shipExplorationPanel');
    if (!panel) return;
    const ship = data?.ship || null;
    const active = data?.active || null;
    const reports = Array.isArray(data?.reports) ? data.reports : [];
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
            <div class="ship-exploration-destination">
                <strong>${escapeHtml(active.destinationName || '探索中')}</strong>
                <div class="ship-exploration-meta">出航船: ${escapeHtml(active.shipName || '')}</div>
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
    const destinationHtml = destinations.length
        ? destinations.map((destination) => `
            <div class="ship-exploration-destination">
                <strong>${escapeHtml(destination.name)}</strong>
                <div class="ship-exploration-meta">${escapeHtml(destination.description || '')}</div>
                <div class="ship-exploration-meta">${Number(destination.cost || 0).toLocaleString('ja-JP')}G / 演出後すぐ完了 / BOSS: ${escapeHtml(destination.bossName || 'あり')}</div>
                <button type="button" class="ship-exploration-start" data-exploration-start="${escapeHtml(destination.id)}">探索開始</button>
            </div>
        `).join('')
        : '<div class="ship-exploration-empty">この船で行ける探索先がありません。</div>';
    panel.innerHTML = `
        ${head}
        <div class="ship-exploration-destinations">${destinationHtml}</div>
        ${reports.length ? `<div class="ship-exploration-reports">${reports.map(renderExplorationReport).join('')}</div>` : ''}
    `;
    panel.querySelectorAll('[data-exploration-start]').forEach((button) => {
        button.addEventListener('click', () => startExploration(playFabId, String(button.getAttribute('data-exploration-start') || '')));
    });
}

export async function loadExplorationPanel(playFabId) {
    const panel = document.getElementById('shipExplorationPanel');
    if (!panel || !playFabId) return;
    panel.innerHTML = '<div class="ship-exploration-empty">探索情報を読み込み中です。</div>';
    try {
        const data = await requestExplorationStatus(playFabId, { isSilent: true, throwOnError: true });
        renderExplorationPanel(data, playFabId);
    } catch (error) {
        panel.innerHTML = `<div class="ship-exploration-empty">${escapeHtml(error?.message || '探索情報を読み込めませんでした。')}</div>`;
    }
}

async function startExploration(playFabId, destinationId) {
    if (!destinationId) return;
    if (explorationAutoRunning) return;
    explorationAutoRunning = true;
    try {
        const data = await requestStartExploration(playFabId, destinationId, createRequestId('exploration-start'), { throwOnError: true });
        renderExplorationPanel(data, playFabId);
        await showExplorationAutoSequence(data, destinationId);
        await claimExploration(playFabId, { autoOpenTreasure: true });
    } catch (error) {
        showRpgMessage(error?.message || '探索を開始できませんでした。');
    } finally {
        explorationAutoRunning = false;
    }
}

async function claimExploration(playFabId, options = {}) {
    try {
        const data = await requestClaimExploration(playFabId, { throwOnError: true });
        renderExplorationPanel(data, playFabId);
        showExplorationTreasureReveal(getRewardItemsForReveal(data), { autoOpen: !!options.autoOpenTreasure });
        const report = data?.report;
        const bossResult = normalizeBossResult(report?.bossResult);
        const rewardName = report?.rewardItemName || data?.reward?.DisplayName || 'お宝';
        const rewardCount = report?.rewardCount ?? (data?.reward ? 1 : 0);
        const rewardSuffix = rewardCount > 0 ? `${rewardName}×${rewardCount}個を入手。` : '報酬は得られませんでした。';
        if (bossResult === 'defeat') {
            showRpgMessage(`BOSS「${report.bossName}」に敗北…HPを消費しました。${rewardSuffix}`, 3500);
        } else if (bossResult === 'victory') {
            showRpgMessage(`BOSS「${report.bossName}」を撃破！ ${rewardSuffix}`, 3500);
        } else {
            showRpgMessage(`探索レポートを確認しました。${rewardSuffix}`);
        }
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
        if (raw === 'Common Boat') return '手漕ぎボート(Common)';
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
    }
    await loadExplorationPanel(playFabId);

    const shipsRef = collection(firestore, 'ships');
    const q = query(shipsRef, where('playFabId', '==', playFabId));

    console.log('[DisplayPlayerShips] Starting realtime listener for playFabId:', playFabId);

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
                const assetData = shipId ? await getShipAsset(playFabId, shipId) : null;
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
                const assetData = shipId ? await getShipAsset(playFabId, shipId) : null;
                await addShipCard(container, shipId, firestoreData, assetData);
            } else if (change.type === 'modified') {
                console.log(`[DisplayPlayerShips] Ship modified: ${shipId}`);
                const assetData = shipId ? (cachedShipsData.get(shipId)?.assetData || await getShipAsset(playFabId, shipId)) : null;
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
