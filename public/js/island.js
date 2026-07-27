// island.js - Island occupation/building client logic
import {
    detectIslandApproach as requestDetectIslandApproach,
    startIslandOccupation as requestStartIslandOccupation,
    guardianBattleResult as requestGuardianBattleResult,
    getPlayerIslands as fetchPlayerIslands,
    getIslandDetails as fetchIslandDetails,
    renameIsland as requestRenameIsland,
    getResourceStatus as fetchResourceStatus,
    collectResource as requestCollectResource,
    startBuildingConstruction as requestStartBuildingConstruction,
    upgradeIslandLevel as requestUpgradeIslandLevel,
    upgradeBuilding as requestUpgradeBuilding,
    checkBuildingCompletion as requestCheckBuildingCompletion,
    helpConstruction as requestHelpConstruction,
    getShopState as fetchShopState,
    setShopPricing as requestSetShopPricing,
    sellToShop as requestSellToShop,
    setShopItemPrice as requestSetShopItemPrice,
    buyFromShop as requestBuyFromShop,
    getBuildingsByCategory as fetchBuildingsByCategory,
    donateNationCurrency as requestDonateNationCurrency,
    hotSpringBath as requestHotSpringBath,
    setHotSpringPrice as requestSetHotSpringPrice,
    getConstructingIslands as fetchConstructingIslands,
    demolishIsland as requestDemolishIsland,
    checkIslandRebuildable as requestCheckIslandRebuildable,
    rebuildIsland as requestRebuildIsland,
    getDemolishedIslands as fetchDemolishedIslands,
    getInventory as fetchInventory,
    getEquipment as fetchEquipment
} from './playfabClient.js';
import { refreshResourceSummary } from './inventory.js';

function selectPaymentMethod(message = '支払い方法を選択してください') {
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
import * as Player from './player.js';
import { escapeHtml, msToTime, canPlayAudioElement } from './ui.js';
import { formatCurrencyLabel, getResourceSourceInfo, getResourceUsageInfo } from './config.js';
import * as Ship from './ship.js?v=20260727-island-visual1';
import { showRpgMessage, rpgSay } from './rpgMessages.js';

// Track construction timers per island
let constructionTimers = new Map();

const SHOP_BUILDINGS = {
    weapon_shop: { title: '武器屋', categories: ['Weapon'] },
    armor_shop: { title: '防具屋', categories: ['Armor', 'Shield', 'Offhand'] },
    item_shop: { title: '道具屋', categories: ['Consumable'] }
};

function getShopItemCategory(item) {
    return item?.customData?.Category || item?.category || null;
}

function getShopItemName(item) {
    return item?.name || item?.customData?.DisplayName || item?.itemId || 'なし';
}

function parseShopItemStat(item, keys) {
    for (const key of keys) {
        const raw = item?.customData?.[key] ?? item?.[key];
        const value = Number.parseInt(raw, 10);
        if (Number.isFinite(value)) return value;
    }
    return 0;
}

function getShopPrimaryStat(item) {
    const category = getShopItemCategory(item);
    if (category === 'Weapon') {
        return { label: '攻撃', value: parseShopItemStat(item, ['Attack', 'Atk', 'Power', 'primaryStatValue']) };
    }
    if (category === 'Offhand') {
        return { label: '術補', value: parseShopItemStat(item, ['MagicPower', 'Int', 'Intelligence', 'primaryStatValue']) };
    }
    if (category === 'Armor' || category === 'Shield') {
        return { label: '防御', value: parseShopItemStat(item, ['Defense', 'Def', 'primaryStatValue']) };
    }
    return null;
}

function buildEquippedItemLookup(inventory, equipment) {
    const byItemId = new Map();
    (Array.isArray(inventory) ? inventory : []).forEach((item) => {
        if (item?.itemId && !byItemId.has(item.itemId)) {
            byItemId.set(item.itemId, item);
        }
    });
    return {
        RightHand: byItemId.get(equipment?.RightHand || '') || null,
        LeftHand: byItemId.get(equipment?.LeftHand || '') || null,
        Armor: byItemId.get(equipment?.Armor || '') || null
    };
}

function getPreferredEquipSlotForShopItem(item) {
    const slot = item?.preferredEquipSlot || null;
    if (slot) return slot;
    const category = getShopItemCategory(item);
    if (category === 'Weapon') return 'RightHand';
    if (category === 'Shield') return 'LeftHand';
    if (category === 'Offhand') return 'LeftHand';
    if (category === 'Armor') return 'Armor';
    return null;
}

function renderShopComparison(item, equippedLookup) {
    const stat = getShopPrimaryStat(item);
    const slot = getPreferredEquipSlotForShopItem(item);
    if (!stat || !slot) return '';
    const currentItem = equippedLookup?.[slot] || null;
    const currentStat = currentItem ? getShopPrimaryStat(currentItem) : null;
    const currentValue = Number(currentStat?.value || 0);
    const delta = stat.value - currentValue;
    const deltaColor = delta > 0 ? '#7ef29a' : delta < 0 ? '#ff8d8d' : 'rgba(255,255,255,0.72)';
    const deltaPrefix = delta > 0 ? '+' : '';
    const slotLabel = slot === 'Armor' ? '装備中' : slot === 'LeftHand' ? '左手' : '右手';
    return `
        <div class="shop-compare-row" style="margin-top:4px; font-size:12px; color:rgba(255,255,255,0.82);">
            <div>${slotLabel}: ${escapeHtml(getShopItemName(currentItem))} (${stat.label}${currentValue})</div>
            <div style="color:${deltaColor}; font-weight:700;">比較: ${deltaPrefix}${delta}</div>
        </div>
    `;
}

const FIXED_BUILDING_RESOURCE_COSTS = {
    my_house: {
        1: [{ code: 'RT', amount: 2 }],
        2: [{ code: 'RT', amount: 3 }],
        3: [{ code: 'RT', amount: 5 }, { code: 'RS', amount: 1 }],
        4: [{ code: 'RT', amount: 7 }, { code: 'RS', amount: 1 }],
        5: [{ code: 'RT', amount: 9 }, { code: 'RS', amount: 2 }]
    },
    watchtower: {
        1: [{ code: 'RT', amount: 2 }],
        2: [{ code: 'RT', amount: 2 }],
        3: [{ code: 'RT', amount: 4 }, { code: 'RS', amount: 1 }]
    },
    teslatower: {
        1: [{ code: 'RT', amount: 2 }],
        2: [{ code: 'RT', amount: 2 }],
        3: [{ code: 'RT', amount: 4 }, { code: 'RS', amount: 1 }]
    },
    coastal_battery: {
        1: [{ code: 'RT', amount: 2 }, { code: 'RS', amount: 1 }]
    },
    dragon_gate: {
        1: [{ code: 'RT', amount: 7 }, { code: 'RS', amount: 2 }]
    },
    shipyard: {
        1: [{ code: 'RT', amount: 8 }, { code: 'RS', amount: 2 }]
    },
    farm: {
        1: [{ code: 'RT', amount: 3 }]
    },
    weapon_shop: {
        1: [{ code: 'RT', amount: 4 }]
    },
    armor_shop: {
        1: [{ code: 'RT', amount: 4 }]
    },
    item_shop: {
        1: [{ code: 'RT', amount: 3 }]
    },
    tavern: {
        1: [{ code: 'RT', amount: 2 }]
    },
    inn: {
        1: [{ code: 'RT', amount: 4 }]
    },
    hot_spring: {
        1: [{ code: 'RT', amount: 4 }]
    },
    repair_dock: {
        1: [{ code: 'RT', amount: 5 }, { code: 'RS', amount: 1 }]
    },
    temple: {
        1: [{ code: 'RT', amount: 10 }, { code: 'RS', amount: 2 }],
        2: [{ code: 'RT', amount: 12 }, { code: 'RS', amount: 3 }],
        3: [{ code: 'RT', amount: 15 }, { code: 'RS', amount: 4 }]
    },
    goddess_statue: {
        1: [{ code: 'RT', amount: 6 }, { code: 'RS', amount: 1 }]
    },
    arcana_fool_tavern: {
        1: [{ code: 'RT', amount: 5 }, { code: 'RS', amount: 1 }]
    },
    arcana_magician_school: {
        1: [{ code: 'RT', amount: 8 }, { code: 'RS', amount: 2 }]
    },
    arcana_priestess_fountain_palace: {
        1: [{ code: 'RT', amount: 8 }, { code: 'RS', amount: 2 }]
    },
    arcana_empress_garden: {
        1: [{ code: 'RT', amount: 8 }, { code: 'RS', amount: 2 }]
    },
    arcana_emperor_training: {
        1: [{ code: 'RT', amount: 8 }, { code: 'RS', amount: 2 }]
    },
    arcana_hierophant_lab: {
        1: [{ code: 'RT', amount: 9 }, { code: 'RS', amount: 2 }]
    },
    arcana_lovers_palace: {
        1: [{ code: 'RT', amount: 9 }, { code: 'RS', amount: 2 }]
    },
    arcana_chariot_factory: {
        1: [{ code: 'RT', amount: 9 }, { code: 'RS', amount: 2 }]
    },
    arcana_strength_fortress: {
        1: [{ code: 'RT', amount: 9 }, { code: 'RS', amount: 2 }]
    },
    arcana_hermit_lodge: {
        1: [{ code: 'RT', amount: 10 }, { code: 'RS', amount: 2 }]
    },
    arcana_wheel_casino: {
        1: [{ code: 'RT', amount: 10 }, { code: 'RS', amount: 2 }]
    },
    arcana_justice_court: {
        1: [{ code: 'RT', amount: 10 }, { code: 'RS', amount: 2 }]
    },
    arcana_hanged_altar: {
        1: [{ code: 'RT', amount: 10 }, { code: 'RS', amount: 2 }]
    },
    arcana_death_mausoleum: {
        1: [{ code: 'RT', amount: 10 }, { code: 'RS', amount: 2 }]
    },
    arcana_temperance_spring: {
        1: [{ code: 'RT', amount: 10 }, { code: 'RS', amount: 2 }]
    },
    arcana_devil_black_market: {
        1: [{ code: 'RT', amount: 12 }, { code: 'RS', amount: 3 }]
    },
    arcana_tower_judgement: {
        1: [{ code: 'RT', amount: 11 }, { code: 'RS', amount: 2 }]
    },
    arcana_star_observatory: {
        1: [{ code: 'RT', amount: 12 }, { code: 'RS', amount: 3 }]
    },
    arcana_moon_shrine: {
        1: [{ code: 'RT', amount: 12 }, { code: 'RS', amount: 3 }]
    },
    arcana_sun_temple: {
        1: [{ code: 'RT', amount: 11 }, { code: 'RS', amount: 2 }]
    },
    arcana_judgement_belltower: {
        1: [{ code: 'RT', amount: 13 }, { code: 'RS', amount: 3 }]
    },
    arcana_world_tree: {
        1: [{ code: 'RT', amount: 15 }, { code: 'RS', amount: 4 }]
    }
};

function getShopConfig(buildingId) {
    return buildingId ? SHOP_BUILDINGS[buildingId] || null : null;
}

function getBuildingFixedResourceCost(buildingId, targetLevel = 1) {
    const table = FIXED_BUILDING_RESOURCE_COSTS[String(buildingId || '').trim()];
    if (!table) return [];
    const entries = table[Math.max(1, Math.trunc(Number(targetLevel) || 1))] || [];
    return entries
        .map((entry) => ({
            code: String(entry?.code || '').trim(),
            amount: Number(entry?.amount ?? 0) || 0
        }))
        .filter((entry) => entry.code && entry.amount > 0);
}

function getActiveBuildingEntry(island) {
    const list = Array.isArray(island?.buildings) ? island.buildings : [];
    return list.find((b) => b && b.status !== 'demolished') || null;
}

async function confirmFixedResourceSpend({ title, message, costs, confirmLabel = '実行する' }) {
    const entries = Array.isArray(costs) ? costs.filter((entry) => entry?.code && Number(entry?.amount) > 0) : [];
    if (!entries.length) return true;

    let balances = null;
    try {
        const inventory = await fetchInventory(window.myPlayFabId || null, { isSilent: true });
        balances = inventory?.virtualCurrency || null;
    } catch (_error) {
        balances = null;
    }

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(0,0,0,0.72)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '16px';
        overlay.style.zIndex = '10000';

        const canJudge = !!balances;
        const rows = entries.map((entry) => {
            const current = canJudge ? Number(balances?.[entry.code] || 0) : null;
            const shortage = current === null ? 0 : Math.max(0, entry.amount - current);
            return {
                ...entry,
                current,
                shortage,
                label: formatCurrencyLabel(entry.code) || entry.code,
                source: getResourceSourceInfo(entry.code)
            };
        });
        const hasShortage = rows.some((entry) => entry.shortage > 0);

        const panel = document.createElement('div');
        panel.style.background = '#0f172a';
        panel.style.border = '1px solid rgba(148,163,184,0.24)';
        panel.style.borderRadius = '14px';
        panel.style.padding = '16px';
        panel.style.width = 'min(100%, 360px)';
        panel.style.color = '#fff';
        panel.style.boxShadow = '0 18px 40px rgba(0,0,0,0.45)';

        const rowHtml = rows.map((entry) => {
            const currentText = entry.current === null ? '所持: ?' : `所持: ${entry.current}`;
            const statusText = entry.shortage > 0 ? `不足: ${entry.shortage}` : 'OK';
            const statusColor = entry.shortage > 0 ? '#f87171' : '#86efac';
            return `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 0; border-bottom:1px solid rgba(148,163,184,0.12);">
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <div style="font-weight:700;">${escapeHtml(entry.label)}</div>
                        <div style="font-size:11px; color:#94a3b8;">入手: ${escapeHtml(entry.source)}</div>
                        <div style="font-size:12px; color:#94a3b8;">必要: ${entry.amount} / ${escapeHtml(currentText)}</div>
                    </div>
                    <div style="font-size:12px; font-weight:700; color:${statusColor};">${escapeHtml(statusText)}</div>
                </div>
            `;
        }).join('');

        panel.innerHTML = `
            <div style="font-size:15px; font-weight:800; margin-bottom:8px;">${escapeHtml(title || '必要資源')}</div>
            <div style="font-size:12px; color:#cbd5e1; margin-bottom:12px; line-height:1.5;">${escapeHtml(message || '必要な資源を確認してください。')}</div>
            <div style="border-top:1px solid rgba(148,163,184,0.12); border-bottom:1px solid rgba(148,163,184,0.12); margin-bottom:12px;">${rowHtml}</div>
            <div style="display:flex; gap:8px; justify-content:flex-end;">
                <button id="fixedCostCancelBtn" style="padding:8px 12px; background:#475569;">キャンセル</button>
                <button id="fixedCostConfirmBtn" style="padding:8px 12px;" ${hasShortage ? 'disabled' : ''}>${escapeHtml(confirmLabel)}</button>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const close = (value) => {
            overlay.remove();
            resolve(value);
        };

        panel.querySelector('#fixedCostCancelBtn')?.addEventListener('click', () => close(false));
        panel.querySelector('#fixedCostConfirmBtn')?.addEventListener('click', () => close(!hasShortage));
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) close(false);
        });
    });
}

export async function detectIslandApproach(shipId) {
    const response = await requestDetectIslandApproach(window.myPlayFabId || null, shipId, { isSilent: true });

    if (response && response.success) {
        return response;
    }

    return null;
}

export async function startIslandOccupation(playFabId, islandId) {
    const response = await requestStartIslandOccupation(playFabId, islandId, window.__currentMapId || null);

    return response;
}

export async function submitGuardianBattleResult(playFabId, islandId, victory) {
    const response = await requestGuardianBattleResult(playFabId, islandId, victory);

    return response;
}

export async function getPlayerIslands(playFabId) {
    const response = await fetchPlayerIslands(playFabId, { isSilent: true });

    if (response && response.success) {
        return response.islands;
    }

    return [];
}

export async function getIslandDetails(islandId) {
    const response = await fetchIslandDetails(islandId, window.__currentMapId || null, window.myPlayFabId || null, { isSilent: true });

    if (response && response.success) {
        return response.island;
    }

    return null;
}

export async function renameIsland(playFabId, islandId, name) {
    const response = await requestRenameIsland(playFabId, islandId, window.__currentMapId || null, name, { isSilent: true });
    if (response && response.success) {
        return response;
    }
    return null;
}


const RESOURCE_BIOME_CURRENCY = { volcanic: 'RR', rocky: 'RG', mushroom: 'RY', lake: 'RB', forest: 'RT', sacred: 'RS' };
const RESOURCE_BIOME_JP = {
    '火山': 'volcanic',
    '岩場': 'rocky',
    'キノコ': 'mushroom',
    '湖': 'lake',
    '森林': 'forest',
    '聖地': 'sacred'
};

function getResourceCurrencyForBiome(biome) {
    const raw = String(biome || '').trim();
    if (!raw) return null;
    const normalized = RESOURCE_BIOME_JP[raw] || raw.toLowerCase();
    return RESOURCE_BIOME_CURRENCY[normalized] || null;
}

function formatMs(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '0秒';
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `${minutes}分${seconds}秒`;
    return `${seconds}秒`;
}

async function getResourceStatus(playFabId, islandId) {
    const mapId = window.__currentMapId || null;
    if (!mapId) {
        showRpgMessage('マップ情報が読み込めませんでした。再読み込みしてください。');
        return null;
    }
    const response = await fetchResourceStatus(playFabId, islandId, mapId, { isSilent: true });
    if (response && response.success) return response;
    return null;
}

async function collectResource(playFabId, islandId) {
    const mapId = window.__currentMapId || null;
    if (!mapId) {
        showRpgMessage('マップ情報が読み込めませんでした。再読み込みしてください。');
        return null;
    }
    const response = await requestCollectResource(playFabId, islandId, mapId);
    return response;
}


export async function startBuildingConstruction(playFabId, islandId, buildingId, options = {}) {
    const fixedCosts = getBuildingFixedResourceCost(buildingId, 1);
    let paymentMethod = 'resource';
    if (fixedCosts.length) {
        const confirmed = await confirmFixedResourceSpend({
            title: '建設確認',
            message: `${buildingId} の建設に必要な資源です。`,
            costs: fixedCosts,
            confirmLabel: '建設する'
        });
        if (!confirmed) return null;
    } else {
        paymentMethod = await selectPaymentMethod('支払い方法を選択してください');
        if (!paymentMethod) return null;
    }
    const response = await requestStartBuildingConstruction(
        playFabId,
        islandId,
        buildingId,
        window.__currentMapId || null,
        null,
        { ...options, paymentMethod }
    );

    if (response && response.success) {
        if (response.building?.status === 'completed') {
            showCompletionNotification(islandId);
            if (response.occupiedByBuild) {
                showRpgMessage('この島を占領した');
            } else {
                showRpgMessage(rpgSay.buildCompleted());
            }
        } else {
            startConstructionTimer(islandId, response.building.completionTime);
            if (response.occupiedByBuild) {
                showRpgMessage('この島を占領した');
            } else {
                showRpgMessage(rpgSay.buildStarted(response.building?.displayName || response.building?.buildingName || buildingId));
            }
        }
    }

    return response;
}

export async function upgradeIslandLevel(playFabId, islandId) {
    const island = await getIslandDetails(islandId);
    const currentLevel = Math.max(1, Math.trunc(Number(island?.islandLevel) || 1));
    const fixedCosts = getBuildingFixedResourceCost('my_house', currentLevel + 1);
    let paymentMethod = 'resource';
    if (fixedCosts.length) {
        const confirmed = await confirmFixedResourceSpend({
            title: 'マイハウス強化',
            message: '次の強化に必要な資源です。',
            costs: fixedCosts,
            confirmLabel: '強化する'
        });
        if (!confirmed) return null;
    } else {
        paymentMethod = await selectPaymentMethod('支払い方法を選択してください');
        if (!paymentMethod) return null;
    }
    const response = await requestUpgradeIslandLevel(playFabId, islandId, window.__currentMapId || null, paymentMethod);

    if (response && response.success) {
        const buildingId = response.buildingId || '';
        const name = buildingId ? buildingId : 'マイハウス';
        const level = Number(response.nextLevel || 0) || null;
        showRpgMessage(rpgSay.buildUpgraded(name, level, '能力が上昇した！'));
    }
    return response;
}

export async function upgradeBuilding(playFabId, islandId) {
    const island = await getIslandDetails(islandId);
    const activeBuilding = getActiveBuildingEntry(island);
    const rawId = String(activeBuilding?.buildingId || activeBuilding?.id || '').trim();
    const currentLevel = Math.max(1, Math.trunc(Number(activeBuilding?.level) || 1));
    const fixedCosts = getBuildingFixedResourceCost(rawId, currentLevel + 1);
    let paymentMethod = 'resource';
    if (fixedCosts.length) {
        const confirmed = await confirmFixedResourceSpend({
            title: '建物強化',
            message: `${rawId} の次の強化に必要な資源です。`,
            costs: fixedCosts,
            confirmLabel: '強化する'
        });
        if (!confirmed) return null;
    } else {
        paymentMethod = await selectPaymentMethod('支払い方法を選択してください');
        if (!paymentMethod) return null;
    }
    const response = await requestUpgradeBuilding(playFabId, islandId, window.__currentMapId || null, paymentMethod);
    if (response && response.success) {
        const buildingId = response.buildingId || '';
        const name = buildingId ? buildingId : '建物';
        const level = Number(response.nextLevel || 0) || null;
        showRpgMessage(rpgSay.buildUpgraded(name, level, '能力が上昇した！'));
    }
    return response;
}

export async function checkBuildingCompletion(islandId) {
    const response = await requestCheckBuildingCompletion(islandId, window.__currentMapId || null, { isSilent: true });

    return response;
}

function startConstructionTimer(islandId, completionTime) {
    const timerKey = `${islandId}`;

    if (constructionTimers.has(timerKey)) {
        clearInterval(constructionTimers.get(timerKey));
    }

    const timerId = setInterval(async () => {
        const now = Date.now();
        const remaining = completionTime - now;

        if (remaining <= 0) {
            clearInterval(timerId);
            constructionTimers.delete(timerKey);

            const result = await checkBuildingCompletion(islandId);
            if (result && result.success && result.completed) {
                showCompletionNotification(islandId);
            }
        } else {
            updateConstructionProgress(islandId, remaining);
        }
    }, 1000);

    constructionTimers.set(timerKey, timerId);
}

function updateConstructionProgress(islandId, remainingTime) {
    const progressElement = document.querySelector(`[data-island-id="${islandId}"] .construction-timer`);
    if (progressElement) {
        progressElement.textContent = `残り ${msToTime(remainingTime)}`;
    }
}

function showCompletionNotification(islandId) {
    playConstructionSound(false);
    showRpgMessage(rpgSay.buildCompleted());

    const modal = document.createElement('div');
    modal.className = 'completion-modal';
    modal.innerHTML = `
        <div class="completion-overlay"></div>
        <div class="completion-content">
            <div class="completion-animation">
                <div class="flag-raise">完了</div>
                <div class="sparkles">***</div>
            </div>
            <h2>建設完了</h2>
            <p>建設が完了しました。</p>
            <div class="completion-fireworks">
                <div class="firework"></div>
                <div class="firework"></div>
                <div class="firework"></div>
            </div>
            <button class="btn-primary" type="button">確認</button>
        </div>
    `;
    document.body.appendChild(modal);

    const audio = document.getElementById('audioSuccess');
    if (audio && canPlayAudioElement(audio)) {
        audio.play().catch(e => console.warn('Audio play failed:', e));
    }

    updateSlotGraphics(islandId);

    const button = modal.querySelector('button');
    if (button) {
        button.addEventListener('click', () => modal.remove());
    }

    setTimeout(() => {
        if (modal.parentElement) {
            modal.remove();
        }
    }, 5000);
}

function updateSlotGraphics(islandId) {
    const statusElement = document.querySelector(`[data-island-id="${islandId}"] .building-status`);
    if (statusElement) {
        statusElement.textContent = '完了';
    }
}

export function showBuildingMenu(island, playFabId) {
    const existingSheet = document.querySelector('.building-bottom-sheet');
    if (existingSheet) {
        existingSheet.remove();
    }

    const sheet = document.createElement('div');
    sheet.className = 'building-bottom-sheet';
    const safeCloseSheet = () => {
        sheet.classList.remove('active');
        setTimeout(() => sheet.remove(), 300);
    };
    const islandLevel = Math.max(1, Math.trunc(Number(island.islandLevel) || 1));
    const resourceCurrency = getResourceCurrencyForBiome(island.biome);
    const isHarvestable = !!resourceCurrency;
    const resourceUsageInfo = isHarvestable ? getResourceUsageInfo(resourceCurrency) : null;
    const resourceSourceInfo = isHarvestable ? getResourceSourceInfo(resourceCurrency) : null;
    const hasBuilding = (island.buildings || []).some(b => b && b.status !== 'demolished');
    const isStarterIsland = island?.starterIsland === true;
    const playerNation = (() => {
        const explicit = String(window.__phaserPlayerInfo?.nation || window.__phaserPlayerInfo?.Nation || '').toLowerCase();
        if (explicit) return explicit;
        const color = String(window.myAvatarBaseInfo?.AvatarColor || '').toLowerCase();
        const mapping = {
            red: 'fire',
            green: 'earth',
            yellow: 'wind',
            purple: 'wind',
            black: 'neutral',
            blue: 'water'
        };
        return mapping[color] || null;
    })();
    const islandNation = String(island.nation || '').toLowerCase();
    const isOwnNation = !!playerNation && !!islandNation && playerNation === islandNation;
    const isEnemyNation = !!playerNation && !!islandNation && playerNation !== islandNation;

    const isOwner = !!playFabId && island.ownerId === playFabId;
    const canUpgrade = isOwner && hasBuilding && !isHarvestable && islandLevel < 5;
    const upgradeCostLabel = renderUpgradeCost(island.upgradeCost);
    const buildingUpgradeCostLabel = renderUpgradeCost(island.buildingUpgradeCost);
    const buildingUpgradeLevel = Number(island.buildingUpgradeLevel || 0);
    const buildingUpgradeAvailable = island.buildingUpgradeAvailable === true && buildingUpgradeLevel > 0;
    const buildingUpgradeReason = island.buildingUpgradeReason || null;
    const activeBuilding = (island.buildings || []).find(b => b && b.status !== 'demolished') || null;
    const activeBuildingId = activeBuilding ? (activeBuilding.buildingId || activeBuilding.id || '') : '';
    const shopConfig = getShopConfig(activeBuildingId);
    const allowShipBuild = isOwnNation && activeBuildingId === 'capital';
    const allowHotSpring = isOwnNation && activeBuildingId === 'hot_spring';
    const allowMyHouseShips = isOwner && activeBuildingId === 'my_house';
    const maxNameLength = 24;
    const renameSectionHtml = isOwner ? `
        <div class="resource-section">
            <div class="resource-title">島名変更</div>
            <div class="resource-row">
                <input id="islandRenameInput" type="text" maxlength="${maxNameLength}" value="${escapeHtml(island.name || '')}"
                    style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.3); color: #fff;">
            </div>
            <div class="resource-row" style="justify-content: space-between; gap: 8px;">
                <span style="font-size: 12px; color: var(--text-sub);">最大${maxNameLength}文字</span>
                <button class="btn-upgrade" id="btnRenameIsland">変更</button>
            </div>
        </div>
    ` : '';

    if ((isStarterIsland || island.allowMyHouseRebuild) && !isHarvestable && !hasBuilding) {
        sheet.innerHTML = `
            <div class="bottom-sheet-overlay"></div>
            <div class="bottom-sheet-content">
                <div class="bottom-sheet-header">
                    <h2>${escapeHtml(island.name)}</h2>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="bottom-sheet-body">
                    <div class="island-info">
                        <div class="info-row">
                            <span class="label">サイズ:</span>
                            <span class="value">${getSizeLabel(island.size)}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">バイオーム:</span>
                            <span class="value">${getBiomeLabel(island.biome)}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">レベル:</span>
                            <span class="value">Lv ${islandLevel}</span>
                        </div>
                    </div>
                    <div class="building-status-panel" data-island-id="${island.id}">
                        ${renderCurrentBuilding(island)}
                    </div>
                    <div class="building-actions">
                        <div class="resource-title">マイハウス建築</div>
                        <div class="resource-row">${isStarterIsland ? 'チュートリアル用の建物です。' : 'マイハウス未所持のため建築できます。'}</div>
                        <div class="resource-row">
                            <button class="btn-build" id="btnBuildMyHouse">マイハウスを建てる</button>
                        </div>
                    </div>
                    ${renameSectionHtml}
                </div>
            </div>
        `;
        document.body.appendChild(sheet);
        const stopPhaser = (e) => {
            if (!e) return;
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        };
        ['pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click'].forEach((type) => {
            sheet.addEventListener(type, stopPhaser);
        });
        sheet.addEventListener('touchmove', (e) => {
            stopPhaser(e);
        }, { passive: true });
    const closeBtn = sheet.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', safeCloseSheet);
    }
        const buildBtn = sheet.querySelector('#btnBuildMyHouse');
        if (buildBtn) {
            buildBtn.addEventListener('click', async () => {
                if (!playFabId) {
                    showRpgMessage('建設を行うにはログインが必要です。');
                    return;
                }
                buildBtn.disabled = true;
                buildBtn.textContent = '処理中...';
                const result = await startBuildingConstruction(playFabId, island.id, 'my_house', { tutorial: true });
                if (result && result.success) {
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem('tutorialFirstIslandDone', 'true');
                    }
                    if (typeof window.showRpgMessage === 'function') {
                        const msg = window.rpgSay?.tutorialHouseBuilt
                            ? window.rpgSay.tutorialHouseBuilt()
                            : 'マイハウスが建った！';
                        window.showRpgMessage(msg);
                    }
                    const refreshed = await getIslandDetails(island.id);
                    if (refreshed) showBuildingMenu(refreshed, playFabId);
                } else {
                    buildBtn.disabled = false;
                    buildBtn.textContent = 'マイハウスを建てる';
                }
            });
        }
        const renameBtn = sheet.querySelector('#btnRenameIsland');
        if (renameBtn) {
            renameBtn.addEventListener('click', async () => {
                const input = sheet.querySelector('#islandRenameInput');
                if (!input) return;
                const newName = String(input.value || '').replace(/\s+/g, ' ').trim();
                if (!newName) {
                    showRpgMessage('島名を入力してください。');
                    return;
                }
                if (newName.length > maxNameLength) {
                    showRpgMessage(`島名は${maxNameLength}文字以内にしてください。`);
                    return;
                }
                renameBtn.disabled = true;
                renameBtn.textContent = '変更中...';
                const result = await renameIsland(playFabId, island.id, newName);
                renameBtn.disabled = false;
                renameBtn.textContent = '変更';
                if (!result || !result.success) {
                    showRpgMessage('島名の変更に失敗しました。');
                    return;
                }
                island.name = result.name;
                const header = sheet.querySelector('.bottom-sheet-header h2');
                if (header) header.textContent = result.name;
                if (window.worldMapScene?.islandObjects?.has(island.id)) {
                    const islandObj = window.worldMapScene.islandObjects.get(island.id);
                    if (islandObj) {
                        islandObj.name = result.name;
                        if (islandObj.nameText) islandObj.nameText.setText(result.name);
                    }
                }
                showRpgMessage('島名を変更しました。');
            });
        }
        setTimeout(() => {
            sheet.classList.add('active');
        }, 10);
        return;
    }

    sheet.innerHTML = `
        <div class="bottom-sheet-overlay"></div>
        <div class="bottom-sheet-content">
            <div class="bottom-sheet-header">
                <h2>${escapeHtml(island.name)}</h2>
                <button class="close-btn">&times;</button>
            </div>
            <div class="bottom-sheet-body">
                <div class="island-info">
                    <div class="info-row">
                        <span class="label">サイズ:</span>
                        <span class="value">${getSizeLabel(island.size)}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">バイオーム:</span>
                        <span class="value">${getBiomeLabel(island.biome)}</span>
                    </div>
                    ${island.biomeInfo ? `
                    <div class="info-row biome-bonus">
                        <span class="label">ボーナス:</span>
                        <span class="value">${escapeHtml(island.biomeInfo.description)}</span>
                    </div>
                    ` : ''}
                    <div class="info-row">
                        <span class="label">レベル:</span>
                        <span class="value">Lv ${islandLevel}</span>
                    </div>
                </div>

                ${isHarvestable ? `
                <div class="resource-section">
                    <div class="resource-title">資源</div>
                    <div class="resource-row">資源: <b>${escapeHtml(formatCurrencyLabel(resourceCurrency))}</b></div>
                    <div class="resource-row">用途: ${escapeHtml(resourceUsageInfo?.detail || '')}</div>
                    <div class="resource-row">入手: ${escapeHtml(resourceSourceInfo || '')}</div>
                    <div class="resource-row" id="resourceStatus">読み込み中...</div>
                    <button class="btn-harvest" id="btnHarvestResource">採取する</button>
                </div>
                ` : ''}

                ${renameSectionHtml}

                ${canUpgrade ? `
                <div class="island-upgrade-section">
                    <button class="btn-upgrade" id="btnUpgradeIsland">
                        Lv ${islandLevel + 1} にアップグレード
                    </button>
                    <div class="upgrade-cost">コスト: ${upgradeCostLabel}</div>
                </div>
                ` : ''}

                ${(hasBuilding && !isHarvestable && (isOwner || !isOwnNation) && island.occupationStatus !== 'demolished' && island.occupationStatus !== 'capital' && island.occupationStatus !== 'sacred') ? `
                <div class="demolish-section">
                    <button class="btn-demolish" id="btnDemolish">
                        この島を解体する
                    </button>
                    <p style="font-size: 12px; color: #ff6b6b; margin-top: 8px;">
                        24時間は再建できません。
                    </p>
                </div>
                ` : ''}

                ${(!isHarvestable && !hasBuilding) ? `
                <div class="building-status-panel" data-island-id="${island.id}">
                    ${renderCurrentBuilding(island)}
                </div>

                <div class="building-categories">
                    <button class="category-tab active" data-category="military">軍事</button>
                    <button class="category-tab" data-category="economic">経済</button>
                    <button class="category-tab" data-category="support">支援</button>
                </div>

                <div class="building-list" id="buildingList"></div>
                ` : ''}

                ${(hasBuilding && isOwnNation) ? `
                <div class="building-status-panel" data-island-id="${island.id}">
                    ${renderCurrentBuilding(island)}
                </div>
                ${shopConfig ? `
                <div class="building-actions">
                    <div class="resource-title">${escapeHtml(shopConfig.title)}</div>
                    <div class="resource-row" style="display:flex; gap:8px; margin-bottom:8px;">
                        <button class="btn-build shop-tab active" data-tab="sell">販売</button>
                        <button class="btn-build shop-tab" data-tab="buy">購入</button>
                    </div>
                    ${isOwner ? `
                    <div class="island-upgrade-section" style="margin-bottom:12px;">
                        <button class="btn-upgrade" id="btnBuildingUpgrade" ${buildingUpgradeAvailable ? '' : 'disabled'}>
                            ${buildingUpgradeAvailable ? `Lv ${buildingUpgradeLevel} に強化` : '強化不可'}
                        </button>
                        <div class="upgrade-cost">
                            ${buildingUpgradeAvailable ? `コスト: ${buildingUpgradeCostLabel}` : getBuildingUpgradeReasonText(buildingUpgradeReason)}
                        </div>
                    </div>
                    ` : `
                    <div class="island-upgrade-section" style="margin-bottom:12px;">
                        <button class="btn-upgrade" id="btnBuildingUpgrade" disabled>強化</button>
                        <div class="upgrade-cost">オーナーのみ実行できます</div>
                    </div>
                    `}
                    ${isOwner ? `
                    <div class="resource-row" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <label>買い取り倍率 <input id="shopBuyMultiplier" type="number" step="0.1" min="0.1" max="5" value="0.7" style="width:80px;"></label>
                        <label>販売倍率 <input id="shopSellMultiplier" type="number" step="0.1" min="0.1" max="5" value="1.2" style="width:80px;"></label>
                        <button class="btn-build" id="btnSaveShopPricing">価格設定</button>
                    </div>
                    ` : ''}
                    <div class="resource-row shop-panel" data-panel="sell">
                        <div id="shopSellList">読み込み中...</div>
                    </div>
                    <div class="resource-row shop-panel" data-panel="buy" style="display:none;">
                        <div id="shopBuyList">読み込み中...</div>
                    </div>
                </div>
                ` : `
                <div class="building-actions">
                    <div class="resource-title">自国の建物</div>
                    <div class="resource-row">利用できる行動</div>
                    <div class="resource-row" style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button class="btn-build" id="btnBuildingRepair">修理</button>
                        <button class="btn-build" id="btnBuildingUpgrade" ${isOwner && buildingUpgradeAvailable ? '' : 'disabled'}>
                            ${isOwner ? '強化' : '強化(不可)'}
                        </button>
                        ${allowShipBuild ? `<button class="btn-build" id="btnBuildingAction">特殊</button>` : ''}
                    </div>
                    <div class="upgrade-cost" style="margin-top:8px;">
                        ${isOwner
                            ? (buildingUpgradeAvailable ? `コスト: ${buildingUpgradeCostLabel}` : getBuildingUpgradeReasonText(buildingUpgradeReason))
                            : 'オーナーのみ実行できます'}
                    </div>
                </div>
                `}
                ` : ''}

                ${(hasBuilding && isOwnNation && allowHotSpring) ? `
                <div class="building-actions">
                    <div class="resource-title">温泉</div>
                    <div class="resource-row">入浴（${Number(island.hotSpringPrice || 200)}G）でHPを回復</div>
                    ${isOwner ? `
                    <div class="resource-row" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <label>価格 <input id="hotSpringPriceInput" type="number" min="1" step="1" value="${Number(island.hotSpringPrice || 200)}" style="width:80px;"></label>
                        <button class="btn-build" id="btnSaveHotSpringPrice">価格設定</button>
                    </div>
                    ` : ''}
                    <div class="resource-row">
                        <button class="btn-build" id="btnHotSpringBath">入浴</button>
                    </div>
                </div>
                ` : ''}

                ${(hasBuilding && isOwnNation && allowShipBuild) ? `
                <div class="building-actions">
                    <div class="resource-title">首都の特殊アクション</div>
                    <div class="resource-row" style="margin-bottom:8px;">国庫への寄付</div>
                    <div class="resource-row" style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                        ${renderNationDonateRows()}
                    </div>
                    <div class="resource-row" style="margin-top:10px;">
                        <button class="btn-build" id="btnCapitalCreateShip">新造船</button>
                    </div>
                </div>
                ` : ''}

                ${allowMyHouseShips ? `
                <div class="building-actions">
                    <div class="resource-title">保有船舶</div>
                    <div class="resource-row" id="myHouseShipsContainer">
                        <div style="text-align: center; color: var(--text-sub); padding: 20px;">読み込み中...</div>
                    </div>
                </div>
                ` : ''}

                ${(hasBuilding && isEnemyNation) ? `
                <div class="building-status-panel" data-island-id="${island.id}">
                    ${renderCurrentBuilding(island)}
                </div>
                <div class="building-actions">
                    <div class="resource-title">敵国の建物</div>
                    <div class="resource-row">破壊</div>
                    <div class="resource-row">
                        <button class="btn-build" id="btnAttackBuilding">攻撃</button>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;

    document.body.appendChild(sheet);

    const stopPhaser = (e) => {
        if (!e) return;
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    };

    ['pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click'].forEach((type) => {
        sheet.addEventListener(type, stopPhaser);
    });

    sheet.addEventListener('touchmove', (e) => {
        stopPhaser(e);
    }, { passive: true });

    setupBuildingMenuEvents(sheet, island, playFabId, safeCloseSheet);
    if (!isHarvestable && !hasBuilding) {
        loadBuildingList('military', island);
    }

    setTimeout(() => {
        sheet.classList.add('active');
    }, 10);
}

function renderCurrentBuilding(island) {
    const building = (island.buildings || []).find(b => b && b.status !== 'demolished') || null;
    if (!building) {
        return '<div class="building-empty">建物なし</div>';
    }

    const baseName = getBuildingName(building.buildingId || building.id || '');
    const level = Number(building.level);
    const label = Number.isFinite(level) && level > 0 ? `${baseName} LV${level}` : baseName;
    const status = building.status === 'constructing' ? '建設中' : '完了';
    const remainingMs = Math.max(0, (Number(building.completionTime) || 0) - Date.now());
    const timer = building.status === 'constructing'
        ? `<div class="construction-timer" data-island-id="${island.id}">残り ${msToTime(remainingMs)}</div>`
        : '';

    return `
        <div class="building-current">
            <div class="building-icon">${getBuildingIcon(building.buildingId || building.id || '')}</div>
            <div class="building-name">${escapeHtml(label)}</div>
            <div class="building-status">${status}</div>
            ${timer}
        </div>
    `;
}

function setupBuildingMenuEvents(sheet, island, playFabId, closeSheetFn) {
    const closeSheet = (typeof closeSheetFn === 'function')
        ? closeSheetFn
        : (() => {
            sheet.classList.remove('active');
            setTimeout(() => sheet.remove(), 300);
        });
    sheet.querySelector('.close-btn').addEventListener('click', closeSheet);

    sheet.querySelector('.bottom-sheet-overlay').addEventListener('click', closeSheet);

    sheet.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            sheet.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const category = tab.dataset.category;
            loadBuildingList(category, island);
        });
    });

    const demolishBtn = sheet.querySelector('#btnDemolish');
    if (demolishBtn) {
        demolishBtn.addEventListener('click', async () => {
            const confirmed = confirm(
                `"${island.name}" を解体しますか?\n\n` +
                `建物は全て削除されます。\n` +
                `24時間は再建できません。\n` +
                `この操作は取り消せません。`
            );

            if (!confirmed) return;

            const result = await demolishIsland(playFabId, island.id);
            if (result && result.success) {
                sheet.classList.remove('active');
                setTimeout(() => sheet.remove(), 300);
            }
        });
    }

    const upgradeBtn = sheet.querySelector('#btnUpgradeIsland');
    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', async () => {
            const result = await upgradeIslandLevel(playFabId, island.id);
            if (result && result.success) {
                const refreshed = await getIslandDetails(island.id);
                if (refreshed) {
                    sheet.classList.remove('active');
                    setTimeout(() => sheet.remove(), 200);
                    showBuildingMenu(refreshed, playFabId);
                }
            } else if (result && result.error) {
                showRpgMessage(result.error);
            }
        });
    }

    const renameBtn = sheet.querySelector('#btnRenameIsland');
    if (renameBtn) {
        renameBtn.addEventListener('click', async () => {
            const input = sheet.querySelector('#islandRenameInput');
            if (!input) return;
            const newName = String(input.value || '').replace(/\s+/g, ' ').trim();
            if (!newName) {
                showRpgMessage('島名を入力してください。');
                return;
            }
            const maxLength = Number(input.getAttribute('maxlength')) || 24;
            if (newName.length > maxLength) {
                showRpgMessage(`島名は${maxLength}文字以内にしてください。`);
                return;
            }
            renameBtn.disabled = true;
            renameBtn.textContent = '変更中...';
            const result = await renameIsland(playFabId, island.id, newName);
            renameBtn.disabled = false;
            renameBtn.textContent = '変更';
            if (!result || !result.success) {
                showRpgMessage('島名の変更に失敗しました。');
                return;
            }
            island.name = result.name;
            const header = sheet.querySelector('.bottom-sheet-header h2');
            if (header) header.textContent = result.name;
            if (window.worldMapScene?.islandObjects?.has(island.id)) {
                const islandObj = window.worldMapScene.islandObjects.get(island.id);
                if (islandObj) {
                    islandObj.name = result.name;
                    if (islandObj.nameText) islandObj.nameText.setText(result.name);
                }
            }
            showRpgMessage('島名を変更しました。');
        });
    }

    const active = (island.buildings || []).find(b => b && b.status !== 'demolished') || null;
    const activeId = active ? (active.buildingId || active.id || '') : '';
    const shopConfig = getShopConfig(activeId);
    const shopTabs = sheet.querySelectorAll('.shop-tab');
    if (shopTabs && shopTabs.length > 0) {
        shopTabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                shopTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.tab;
                sheet.querySelectorAll('.shop-panel').forEach(panel => {
                    panel.style.display = (panel.dataset.panel === target) ? 'block' : 'none';
                });
            });
        });
    }

    const savePricingBtn = sheet.querySelector('#btnSaveShopPricing');
    if (savePricingBtn) {
        savePricingBtn.addEventListener('click', async () => {
            const buyValue = Number(sheet.querySelector('#shopBuyMultiplier')?.value || 0.7);
            const sellValue = Number(sheet.querySelector('#shopSellMultiplier')?.value || 1.2);
            const result = await requestSetShopPricing(playFabId, island.id, buyValue, sellValue, window.__currentMapId || null);
            if (result && result.success) {
                await loadShopPanels(sheet, island, shopConfig, playFabId);
            } else if (result?.error) {
                showRpgMessage(result.error);
            }
        });
    }

    if (shopConfig) {
        loadShopPanels(sheet, island, shopConfig, playFabId);
    }

    const resourceStatusEl = sheet.querySelector('#resourceStatus');
    const harvestBtn = sheet.querySelector('#btnHarvestResource');
    if (resourceStatusEl && harvestBtn) {
        const resourceCurrency = getResourceCurrencyForBiome(island.biome);
        let latestStatus = null;
        const updateResourceStatus = async () => {
            resourceStatusEl.textContent = '読み込み中...';
            const status = await getResourceStatus(playFabId, island.id);
            if (!status || !status.success) {
                resourceStatusEl.textContent = '情報の取得に失敗しました。';
                harvestBtn.disabled = true;
                return;
            }
            latestStatus = status;
            const available = Number(status.available || 0);
            const capacity = Number(status.capacity || 0);
            const nextInMs = Number(status.nextInMs || 0);
            if (available > 0) {
                resourceStatusEl.textContent = `採取可能: ${available} / 容量: ${capacity}`;
            } else {
                resourceStatusEl.textContent = `次の採取まで: ${formatMs(nextInMs)}`;
            }
            harvestBtn.disabled = available <= 0;
        };

        harvestBtn.addEventListener('click', async () => {
            if (latestStatus && Number(latestStatus.available || 0) <= 0) {
                await updateResourceStatus();
                return;
            }
            harvestBtn.disabled = true;
            resourceStatusEl.textContent = '採取中...';
            const result = await collectResource(playFabId, island.id);
            if (result && result.success) {
                const amount = Number(result.amount || 0);
                resourceStatusEl.textContent = amount > 0
                    ? `採取しました: ${amount}`
                    : '採取できる資源がありません。';
                if (amount > 0) {
                    showRpgMessage(rpgSay.resourceGained(resourceCurrency, amount));
                }
            } else {
                resourceStatusEl.textContent = result?.error || '採取に失敗しました。';
            }
            await updateResourceStatus();
        });

        updateResourceStatus();
    }

    const attackBuildingBtn = sheet.querySelector('#btnAttackBuilding');
    if (attackBuildingBtn) {
        attackBuildingBtn.addEventListener('click', async () => {
            if (window.worldMapScene && typeof window.worldMapScene.damageBuildingOnIsland === 'function') {
                await window.worldMapScene.damageBuildingOnIsland(island.id, 300);
            } else {
                showRpgMessage('攻撃機能は準備中です。');
            }
        });
    }

    const repairBtn = sheet.querySelector('#btnBuildingRepair');
    if (repairBtn) {
        repairBtn.addEventListener('click', () => {
            showRpgMessage('修理アクションは準備中です。');
        });
    }

    const upgradeBuildingBtn = sheet.querySelector('#btnBuildingUpgrade');
    if (upgradeBuildingBtn) {
        upgradeBuildingBtn.addEventListener('click', async () => {
            if (upgradeBuildingBtn.disabled) return;
            const result = await upgradeBuilding(playFabId, island.id);
            if (result && result.success) {
                const refreshed = await getIslandDetails(island.id);
                if (refreshed) {
                    sheet.classList.remove('active');
                    setTimeout(() => sheet.remove(), 200);
                    showBuildingMenu(refreshed, playFabId);
                }
            } else if (result && result.error) {
                showRpgMessage(result.error);
            }
        });
    }

    const specialBtn = sheet.querySelector('#btnBuildingAction');
    if (specialBtn) {
        specialBtn.addEventListener('click', () => {
            if (typeof window.showCreateShipModal === 'function') {
                closeSheet();
                window.showCreateShipModal({ islandId: island.id, mapId: window.__currentMapId || null });
                return;
            }
        });
    }

    const capitalCreateBtn = sheet.querySelector('#btnCapitalCreateShip');
    if (capitalCreateBtn) {
        capitalCreateBtn.addEventListener('click', () => {
            if (typeof window.showCreateShipModal === 'function') {
                closeSheet();
                window.showCreateShipModal({ islandId: island.id, mapId: window.__currentMapId || null });
                return;
            }
        });
    }

    const myHouseShips = sheet.querySelector('#myHouseShipsContainer');
    if (myHouseShips) {
        Ship.displayPlayerShipsInContainer(playFabId, myHouseShips);
    }

    const hotSpringBtn = sheet.querySelector('#btnHotSpringBath');
    if (hotSpringBtn) {
        hotSpringBtn.addEventListener('click', async () => {
            hotSpringBtn.disabled = true;
            const result = await requestHotSpringBath(playFabId, island.id, window.__currentMapId || null);
            if (result && result.success) {
                showRpgMessage('温泉で体力が回復した！');
                await Promise.all([
                    Player.getPlayerStats(playFabId),
                    refreshResourceSummary(playFabId, { force: true })
                ]);
            } else if (result?.error) {
                showRpgMessage(result.error);
            }
            hotSpringBtn.disabled = false;
        });
    }

    const saveHotSpringBtn = sheet.querySelector('#btnSaveHotSpringPrice');
    if (saveHotSpringBtn) {
        saveHotSpringBtn.addEventListener('click', async () => {
            const priceInput = sheet.querySelector('#hotSpringPriceInput');
            const priceValue = Number(priceInput?.value || 0);
            const result = await requestSetHotSpringPrice(playFabId, island.id, priceValue, window.__currentMapId || null);
            if (result && result.success) {
                showRpgMessage('温泉の価格を更新しました。');
                priceInput.value = String(result.price || priceValue);
            } else if (result?.error) {
                showRpgMessage(result.error);
            }
        });
    }

    sheet.querySelectorAll('.btn-nation-donate').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const currency = btn.dataset.currency;
            const input = sheet.querySelector(`.nation-donate-input[data-currency="${currency}"]`);
            const amount = Number(input?.value || 0);
            if (!currency) return;
            if (!Number.isFinite(amount) || amount <= 0) {
                showRpgMessage('寄付額を入力してください。');
                return;
            }
            const result = await requestDonateNationCurrency(playFabId, currency, amount);
            if (result && result.success) {
                input.value = '0';
                await Promise.all([
                    Player.getPlayerStats(playFabId),
                    refreshResourceSummary(playFabId, { force: true })
                ]);
                showRpgMessage('寄付しました。');
            } else if (result?.error) {
                showRpgMessage(result.error);
            }
        });
    });
}

async function loadBuildingList(category, island) {
    const listContainer = document.getElementById('buildingList');
    if (!listContainer) return;

    listContainer.innerHTML = '<div class="loading">読み込み中...</div>';

    try {
        const playFabId = (typeof window !== 'undefined' && window.myPlayFabId)
            ? window.myPlayFabId
            : localStorage.getItem('playFabId');
        const [buildings, inventoryResult] = await Promise.all([
            fetchBuildingsForCategory(category, island.size),
            playFabId ? fetchInventory(playFabId, { isSilent: true }) : Promise.resolve(null)
        ]);
        const balances = inventoryResult?.virtualCurrency || {};
        const hasBuilding = (island.buildings || []).some(b => b && b.status !== 'demolished');

        listContainer.innerHTML = buildings.map(building => `
            <div class="building-item" data-building-id="${building.id}">
                <div class="building-icon">${getBuildingIcon(building.id)}</div>
                <div class="building-details">
                    <div class="building-name">${escapeHtml(building.name)}</div>
                    <div class="building-description">${escapeHtml(building.description)}</div>
                    <div class="building-stats">
                        <span class="stat">時間 ${Math.floor(building.buildTime / 60)}分</span>
                        <span class="stat">サイズ: ${getSizeLabelFromTag(building.tags)}</span>
                    </div>
                    ${renderBuildingCost(building, balances)}
                    ${renderBuildingConditionReason(building)}
                </div>
                <button class="btn-build" data-building-id="${building.id}" ${getBuildButtonDisabled(building, balances, hasBuilding) ? 'disabled' : ''}>${getBuildButtonLabelResolved(building, balances, hasBuilding)}</button>
            </div>
        `).join('');

        listContainer.querySelectorAll('.btn-build').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const buildingId = e.target.dataset.buildingId;
                await handleBuildingConstruction(buildingId, island);
            });
        });
    } catch (error) {
        console.error('[LoadBuildingList] Error:', error);
        listContainer.innerHTML = '<div class="error">建物の読み込みに失敗しました</div>';
    }
}

function normalizeCostEntries(costs) {
    const source = Array.isArray(costs)
        ? costs.map((entry) => ({
            code: String(entry?.code || entry?.ItemId || '').trim(),
            amount: Number(entry?.amount ?? entry?.Amount ?? 0)
        }))
        : Object.entries(costs || {}).map(([code, amount]) => ({
            code: String(code || '').trim(),
            amount: Number(amount)
        }));
    const entries = source.filter(entry => entry.code && Number.isFinite(entry.amount) && entry.amount > 0);
    return entries;
}

function getBuildingConstructionCosts(building) {
    const fixedCosts = getBuildingFixedResourceCost(building?.id || building?.buildingId || '', 1);
    return fixedCosts.length ? fixedCosts : normalizeCostEntries(building?.cost || {});
}

function isCostAffordable(costs, balances) {
    const entries = normalizeCostEntries(costs);
    if (!entries.length) return true;
    return entries.every(entry => Number(balances?.[entry.code] || 0) >= entry.amount);
}

function formatCostLabel(costs, balances) {
    const entries = normalizeCostEntries(costs);
    if (!entries.length) return '無料';
    return entries.map(entry => {
        const balance = Number(balances?.[entry.code] || 0);
        const label = formatCurrencyLabel(entry.code);
        return `${label} ${entry.amount} (所持 ${balance})`;
    }).join(' / ');
}

function renderBuildingCost(building, balances) {
    const costs = getBuildingConstructionCosts(building);
    const affordable = isCostAffordable(costs, balances);
    const costLabel = formatCostLabel(costs, balances);
    return `
        <div class="building-cost ${affordable ? '' : 'insufficient'}">
            コスト: ${costLabel}${affordable ? '' : ' / 不足'}
        </div>
    `;
}

function getBuildButtonDisabled(building, balances, hasBuilding) {
    if (hasBuilding) return true;
    if (building?.meetsCondition === false) return true;
    return !isCostAffordable(getBuildingConstructionCosts(building), balances);
}

function getBuildButtonLabel(building, balances, hasBuilding) {
    if (hasBuilding) return '建設済み';
    if (building?.meetsCondition === false) return '条件未達';
    return isCostAffordable(building?.cost, balances) ? '建設' : '不足';
}

function getBuildButtonLabelResolved(building, balances, hasBuilding) {
    if (hasBuilding) return '建設済み';
    if (building?.meetsCondition === false) return '条件未達';
    return isCostAffordable(getBuildingConstructionCosts(building), balances) ? '建設' : '不足';
}

function renderBuildingConditionReason(building) {
    if (!building || building.meetsCondition !== false) return '';
    const reason = building.conditionReason || '建設条件を満たしていません';
    return `<div class="building-reason">${escapeHtml(reason)}</div>`;
}

async function loadShopPanels(sheet, island, shopConfig, playFabId) {
    const sellList = sheet.querySelector('#shopSellList');
    const buyList = sheet.querySelector('#shopBuyList');
    if (!sellList || !buyList) return;
    sellList.innerHTML = '読み込み中...';
    buyList.innerHTML = '読み込み中...';
    try {
        const [shopState, inventoryResult, equipmentResult] = await Promise.all([
            fetchShopState(island.id, window.__currentMapId || null, { isSilent: true }),
            fetchInventory(playFabId, { isSilent: true }),
            fetchEquipment(playFabId, { isSilent: true }).catch(() => ({ equipment: {} }))
        ]);
        const pricing = shopState?.pricing || { buyMultiplier: 0.7, sellMultiplier: 1.2, itemPrices: {} };
        const itemPrices = pricing.itemPrices || {};
        const buyInput = sheet.querySelector('#shopBuyMultiplier');
        const sellInput = sheet.querySelector('#shopSellMultiplier');
        if (buyInput) buyInput.value = String(pricing.buyMultiplier);
        if (sellInput) sellInput.value = String(pricing.sellMultiplier);

        const inventory = Array.isArray(inventoryResult?.inventory) ? inventoryResult.inventory : [];
        const allowed = shopConfig?.categories || [];
        const equippedLookup = buildEquippedItemLookup(inventory, equipmentResult?.equipment || {});
        const sellItems = inventory.filter(item => {
            const category = item?.customData?.Category || null;
            return !allowed.length || (category && allowed.includes(category));
        });
        if (!sellItems.length) {
            sellList.innerHTML = '<div>売れるアイテムがありません。</div>';
        } else {
            sellList.innerHTML = sellItems.map(item => {
                const sellPrice = Number(item?.customData?.SellPrice || 0);
                const fixedBuy = Number.isFinite(Number(itemPrices?.[item.itemId]?.buyPrice)) ? Number(itemPrices[item.itemId].buyPrice) : null;
                const price = fixedBuy != null ? fixedBuy : Math.floor(sellPrice * Number(pricing.buyMultiplier || 0));
                const instanceId = item.instances?.[0] || '';
                const comparison = renderShopComparison(item, equippedLookup);
                const ownerControls = shopState?.ownerId === playFabId
                    ? `
                        <div class="shop-price-row" style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                            <label>買い取り
                                <input class="shop-item-buy" data-item-id="${item.itemId}" type="number" step="1" min="0" value="${fixedBuy != null ? fixedBuy : ''}" style="width:80px;">
                            </label>
                            <label>販売
                                <input class="shop-item-sell" data-item-id="${item.itemId}" type="number" step="1" min="0" value="${Number.isFinite(Number(itemPrices?.[item.itemId]?.sellPrice)) ? Number(itemPrices[item.itemId].sellPrice) : ''}" style="width:80px;">
                            </label>
                            <button class="btn-build btn-save-item-price" data-item-id="${item.itemId}">保存</button>
                        </div>
                    `
                    : '';
                return `
                    <div class="building-item" style="margin-bottom:8px;">
                        <div class="building-details">
                            <div class="building-name">${escapeHtml(item.name)}</div>
                            ${comparison}
                            <div class="building-description">在庫: ${item.count} / 買い取り: ${price}G</div>
                        </div>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <button class="btn-build btn-sell-to-shop" data-instance-id="${instanceId}" data-item-id="${item.itemId}" ${price > 0 ? '' : 'disabled'}>売る</button>
                        </div>
                        ${ownerControls}
                    </div>
                `;
            }).join('');
        }

        const shopInventory = Array.isArray(shopState?.inventory) ? shopState.inventory : [];
        if (!shopInventory.length) {
            buyList.innerHTML = '<div>在庫がありません。</div>';
        } else {
            buyList.innerHTML = shopInventory.map(item => {
                const fixedSell = Number.isFinite(Number(item.fixedSellPrice)) ? Number(item.fixedSellPrice) : null;
                const base = Number(item.buyPrice || item.sellPrice || 0);
                const price = fixedSell != null ? fixedSell : Math.floor(base * Number(pricing.sellMultiplier || 0));
                const primaryStat = getShopPrimaryStat(item);
                const statLine = primaryStat
                    ? `<div class="building-description">${primaryStat.label}: ${primaryStat.value}</div>`
                    : '';
                const descriptionLine = item?.description
                    ? `<div class="building-description">${escapeHtml(item.description)}</div>`
                    : '';
                const comparison = renderShopComparison(item, equippedLookup);
                const ownerControls = shopState?.ownerId === playFabId
                    ? `
                        <div class="shop-price-row" style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                            <label>買い取り
                                <input class="shop-item-buy" data-item-id="${item.itemId}" type="number" step="1" min="0" value="${Number.isFinite(Number(itemPrices?.[item.itemId]?.buyPrice)) ? Number(itemPrices[item.itemId].buyPrice) : ''}" style="width:80px;">
                            </label>
                            <label>販売
                                <input class="shop-item-sell" data-item-id="${item.itemId}" type="number" step="1" min="0" value="${fixedSell != null ? fixedSell : ''}" style="width:80px;">
                            </label>
                            <button class="btn-build btn-save-item-price" data-item-id="${item.itemId}">保存</button>
                        </div>
                    `
                    : '';
                return `
                    <div class="building-item" style="margin-bottom:8px;">
                        <div class="building-details">
                            <div class="building-name">${escapeHtml(item.name)}</div>
                            ${statLine}
                            ${descriptionLine}
                            ${comparison}
                            <div class="building-description">在庫: ${item.count} / 価格: ${price}G</div>
                        </div>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <button class="btn-build btn-buy-from-shop" data-item-id="${item.itemId}" ${price > 0 ? '' : 'disabled'}>買う</button>
                        </div>
                        ${ownerControls}
                    </div>
                `;
            }).join('');
        }

        sellList.querySelectorAll('.btn-sell-to-shop').forEach(btn => {
            btn.addEventListener('click', async () => {
                const instanceId = btn.dataset.instanceId;
                const itemId = btn.dataset.itemId;
                if (!instanceId || !itemId) return;
                await requestSellToShop(playFabId, island.id, instanceId, itemId, 1, window.__currentMapId || null);
                await loadShopPanels(sheet, island, shopConfig, playFabId);
            });
        });

        const savePriceButtons = sheet.querySelectorAll('.btn-save-item-price');
        savePriceButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
                const itemId = btn.dataset.itemId;
                if (!itemId) return;
                const buyInput = sheet.querySelector(`.shop-item-buy[data-item-id="${itemId}"]`);
                const sellInput = sheet.querySelector(`.shop-item-sell[data-item-id="${itemId}"]`);
                const buyValue = Number(buyInput?.value || 0);
                const sellValue = Number(sellInput?.value || 0);
                await requestSetShopItemPrice(playFabId, island.id, itemId, buyValue, sellValue, window.__currentMapId || null);
                await loadShopPanels(sheet, island, shopConfig, playFabId);
            });
        });

        buyList.querySelectorAll('.btn-buy-from-shop').forEach(btn => {
            btn.addEventListener('click', async () => {
                const itemId = btn.dataset.itemId;
                if (!itemId) return;
                await requestBuyFromShop(playFabId, island.id, itemId, 1, window.__currentMapId || null);
                await loadShopPanels(sheet, island, shopConfig, playFabId);
            });
        });
    } catch (error) {
        console.error('[LoadShopPanels] Error:', error);
        sellList.innerHTML = '<div>読み込みに失敗しました。</div>';
        buyList.innerHTML = '<div>読み込みに失敗しました。</div>';
    }
}

async function fetchBuildingsForCategory(category, islandSize) {
    const response = await fetchBuildingsByCategory(category, islandSize, window.__currentMapId || null, { isSilent: true });
    const list = Array.isArray(response?.buildings) ? response.buildings : [];
    return list;
}

async function handleBuildingConstruction(buildingId, island) {
    const sheet = document.querySelector('.building-bottom-sheet');

    const playFabId = (typeof window !== 'undefined' && window.myPlayFabId)
        ? window.myPlayFabId
        : localStorage.getItem('playFabId');
    if (!playFabId) {
        showRpgMessage('プレイヤー情報がありません');
        return;
    }

    try {
        const result = await startBuildingConstruction(playFabId, island.id, buildingId);
        if (result && result.success) {
            if (result.message) showRpgMessage(result.message);
            sheet.classList.remove('active');
            setTimeout(() => sheet.remove(), 300);
        } else if (result) {
            showRpgMessage(result.error || result.message || '建設に失敗しました。');
        }
    } catch (error) {
        const message = error?.message || '建設に失敗しました。';
        showRpgMessage(message);
        console.error('[handleBuildingConstruction] Error:', error);
    }
}

function getSizeLabel(size) {
    const labels = {
        small: '小',
        medium: '中',
        large: '大',
        giant: '巨大'
    };
    return labels[size] || size;
}

function renderUpgradeCost(costs) {
    const entries = Object.entries(costs || {}).filter(([, amount]) => Number(amount) > 0);
    if (entries.length === 0) return '無料';
    return entries
        .map(([code, amount]) => `${escapeHtml(String(code))} ${Number(amount)}`)
        .join(', ');
}

function getBuildingUpgradeReasonText(reason) {
    switch (reason) {
        case 'NoBuilding':
            return '建物がありません';
        case 'NotCompleted':
            return '建設中は強化できません';
        case 'MaxLevel':
            return '既に最大Lvです';
        case 'UseIslandUpgrade':
            return 'マイハウスは島Lvアップで強化します';
        case 'BuildingSpecMissing':
            return '強化情報が見つかりません';
        default:
            return '強化条件を満たしていません';
    }
}

function renderNationDonateRows() {
    const currencies = [
        { code: 'PS', label: formatCurrencyLabel('PS') },
        { code: 'RR', label: formatCurrencyLabel('RR') },
        { code: 'RG', label: formatCurrencyLabel('RG') },
        { code: 'RY', label: formatCurrencyLabel('RY') },
        { code: 'RB', label: formatCurrencyLabel('RB') },
        { code: 'RT', label: formatCurrencyLabel('RT') },
        { code: 'RS', label: formatCurrencyLabel('RS') }
    ];
    return currencies.map((entry) => `
        <div style="display:flex; gap:6px; align-items:center;">
            <label style="display:flex; gap:6px; align-items:center; width:100%;">
                <span style="min-width:48px;">${entry.label}</span>
                <input class="nation-donate-input" data-currency="${entry.code}" type="number" min="0" step="1" value="0" style="width:100%; padding:6px; border-radius:6px; border:1px solid var(--border-color); background:#111827; color:#fff; font-size:12px;">
            </label>
            <button class="btn-build btn-nation-donate" data-currency="${entry.code}">寄付</button>
        </div>
    `).join('');
}

function getSizeLabelFromTag(tags) {
    const list = Array.isArray(tags) ? tags : [];
    const sizeTag = list.find(tag => typeof tag === 'string' && tag.startsWith('size_')) || '';
    const size = sizeTag.replace('size_', '');
    return getSizeLabel(size) || sizeTag || '不明';
}

function getBiomeLabel(biome) {
    if (biome == null) return 'なし';
    const labels = {
        rocky: '岩場',
        forest: '森林',
        beach: '浜辺',
        volcanic: '火山',
        jungle: 'ジャングル',
        mushroom: 'キノコ',
        lake: '湖',
        ocean: '海',
        sacred: '聖地'
    };
    return labels[biome] || biome;
}

function getBuildingIcon(buildingId) {
    const baseId = String(buildingId || '').replace(/_lv\d+$/, '');
    if (baseId.startsWith('arcana_')) return '🃏';
    const icons = {
        watchtower: 'W',
        coastal_battery: 'C',
        dragon_gate: 'D',
        farm: 'F',
        tavern: 'T',
        repair_dock: 'R',
        shipyard: 'S',
        temple: 'P'
    };
    return icons[buildingId] || 'B';
}

function getBuildingName(buildingId) {
    if (buildingId === 'my_house') return 'マイハウス';
    const baseId = String(buildingId || '').replace(/_lv\d+$/, '');
    if (baseId !== buildingId) {
        return getBuildingName(baseId);
    }
    const names = {
        watchtower: '監視塔',
        coastal_battery: '沿岸砲台',
        dragon_gate: '竜撃砲門',
        farm: '農場',
        tavern: '酒場',
        repair_dock: '修理ドック',
        shipyard: '造船所',
        temple: '神殿',
        goddess_statue: '女神像',
        arcana_fool_tavern: '海賊酒場',
        arcana_magician_school: '魔法学校',
        arcana_priestess_fountain_palace: '聖泉宮殿',
        arcana_empress_garden: '温室庭園',
        arcana_emperor_training: '訓練所',
        arcana_hierophant_lab: '魔法研究所',
        arcana_lovers_palace: '恋人の宮殿',
        arcana_chariot_factory: '戦車工廠',
        arcana_strength_fortress: '城塞',
        arcana_hermit_lodge: '隠者の館',
        arcana_wheel_casino: '地下カジノ',
        arcana_justice_court: '裁判所',
        arcana_hanged_altar: '供物台',
        arcana_death_mausoleum: '納骨堂',
        arcana_temperance_spring: '癒しの泉',
        arcana_devil_black_market: '黒市',
        arcana_tower_judgement: '裁きの塔',
        arcana_star_observatory: '天文台',
        arcana_moon_shrine: '氷霧の社',
        arcana_sun_temple: '太陽神殿',
        arcana_judgement_belltower: '鐘楼',
        arcana_world_tree: '世界樹'
    };
    return names[buildingId] || buildingId;
}

export async function requestConstructionHelp(islandId, buildingName) {
    if (typeof liff === 'undefined' || !liff.isLoggedIn()) {
        showRpgMessage('LINEログインが必要です');
        return;
    }

    try {
        const shareMessage = {
            type: 'flex',
            altText: '建設ヘルプ依頼',
            contents: {
                type: 'bubble',
                header: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        {
                            type: 'text',
                            text: '建設ヘルプ',
                            weight: 'bold',
                            size: 'lg',
                            color: '#ffffff'
                        }
                    ],
                    backgroundColor: '#667eea'
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        {
                            type: 'text',
                            text: `${buildingName} を建設中`,
                            weight: 'bold',
                            size: 'md',
                            margin: 'md'
                        },
                        {
                            type: 'text',
                            text: '手伝うと建設時間が短縮されます。',
                            size: 'sm',
                            color: '#999999',
                            margin: 'md',
                            wrap: true
                        }
                    ]
                },
                footer: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        {
                            type: 'button',
                            action: {
                                type: 'uri',
                                label: '手伝う',
                                uri: `${window.location.origin}?action=help&islandId=${islandId}`
                            },
                            style: 'primary',
                            color: '#4ecdc4'
                        }
                    ]
                }
            }
        };

        await liff.shareTargetPicker([shareMessage]);
        showRpgMessage('ヘルプ依頼を送信しました');
    } catch (error) {
        console.error('[RequestConstructionHelp] Error:', error);
        showRpgMessage('共有に失敗しました');
    }
}

export async function helpConstruction(islandId, playFabId) {
    const response = await requestHelpConstruction(islandId, playFabId, window.__currentMapId || null);

    if (response && response.success) {
        const timerKey = `${islandId}`;
        const existingTimer = constructionTimers.get(timerKey);
        if (existingTimer) {
            clearInterval(existingTimer);
            constructionTimers.delete(timerKey);
        }

        const newCompletionTime = Number(response.building?.completionTime) || Date.now();
        startConstructionTimer(islandId, newCompletionTime);
    }

    return response;
}

export async function getConstructingIslands() {
    try {
        const mapId = window.__currentMapId || '';
        const data = await fetchConstructingIslands(mapId || null);

        if (data && data.success) {
            return data.islands;
        }

        return [];
    } catch (error) {
        console.error('[GetConstructingIslands] Error:', error);
        return [];
    }
}

export function playConstructionSound(start = true) {
    const audio = document.getElementById('audioConstruction');

    if (!audio) {
        return;
    }

    if (start) {
        if (!canPlayAudioElement(audio)) return;
        audio.currentTime = 0;
        audio.play().catch(e => console.warn('Construction sound play failed:', e));
    } else {
        audio.pause();
    }
}

export function displayConstructingIslandsOnMap(phaserScene, constructingIslands) {
    if (phaserScene.constructionSprites) {
        phaserScene.constructionSprites.forEach(sprite => sprite.destroy());
    }
    phaserScene.constructionSprites = [];

    constructingIslands.forEach(island => {
        const x = island.coordinate.x * 32;
        const y = island.coordinate.y * 32;

        const scaffolding = phaserScene.add.text(x, y - 20, '建設中', {
            fontSize: '16px'
        });
        scaffolding.setOrigin(0.5);

        phaserScene.tweens.add({
            targets: scaffolding,
            y: y - 24,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        phaserScene.constructionSprites.push(scaffolding);
    });

    if (constructingIslands.length > 0) {
        playConstructionSound(true);
    } else {
        playConstructionSound(false);
    }
}

export function cleanupConstructionTimers() {
    constructionTimers.forEach(timerId => clearInterval(timerId));
    constructionTimers.clear();
    playConstructionSound(false);
}

export async function demolishIsland(playFabId, islandId) {
    try {
        const data = await requestDemolishIsland(playFabId, islandId, window.__currentMapId || null);

        if (data.success) {
            showDemolishNotification(data.island);
        } else {
            showErrorNotification(data.error || '解体に失敗しました');
        }

        return data;
    } catch (error) {
        console.error('[DemolishIsland] Error:', error);
        showErrorNotification('解体に失敗しました');
        return { success: false, error: error?.message || '通信エラー' };
    }
}

function showDemolishNotification(island) {
    showRpgMessage(rpgSay.islandDemolished(island?.name || '島'));
    const modal = document.createElement('div');
    modal.className = 'completion-modal';
    modal.innerHTML = `
        <div class="completion-overlay"></div>
        <div class="completion-content" style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);">
            <div class="completion-animation">
                <div class="demolish-icon">解体済み</div>
            </div>
            <h2>島を解体しました</h2>
            <p>${escapeHtml(island.name)} は瓦礫になりました。</p>
            <p style="font-size: 14px; color: rgba(255, 255, 255, 0.8);">24時間後に再建できます。</p>
            <button class="btn-primary" type="button">確認</button>
        </div>
    `;
    document.body.appendChild(modal);

    const timeoutId = setTimeout(() => {
        if (modal.parentElement) modal.remove();
    }, 5000);

    const button = modal.querySelector('button');
    if (button) {
        button.addEventListener('click', () => {
            clearTimeout(timeoutId);
            modal.remove();
        });
    }
}

export async function checkIslandRebuildable(islandId) {
    try {
        return await requestCheckIslandRebuildable(window.myPlayFabId || null, islandId, window.__currentMapId || null);
    } catch (error) {
        console.error('[CheckIslandRebuildable] Error:', error);
        return null;
    }
}

export async function rebuildIsland(playFabId, islandId) {
    try {
        const data = await requestRebuildIsland(playFabId, islandId, window.__currentMapId || null);

        if (data.success) {
            showRebuildNotification(data.island);
        } else {
            showErrorNotification(data.error || data.message || '再建に失敗しました');
        }

        return data;
    } catch (error) {
        console.error('[RebuildIsland] Error:', error);
        showErrorNotification('再建に失敗しました');
        return { success: false, error: error?.message || '通信エラー' };
    }
}

function showRebuildNotification(island) {
    showRpgMessage(rpgSay.islandRebuilt(island?.name || '島'));
    const modal = document.createElement('div');
    modal.className = 'completion-modal';
    modal.innerHTML = `
        <div class="completion-overlay"></div>
        <div class="completion-content" style="background: linear-gradient(135deg, #27ae60 0%, #229954 100%);">
            <div class="completion-animation">
                <div class="flag-raise">再建完了</div>
                <div class="sparkles">***</div>
            </div>
            <h2>島を再建しました</h2>
            <p>${escapeHtml(island.name)} が再び使えるようになりました。</p>
            <button class="btn-primary" type="button">確認</button>
        </div>
    `;
    document.body.appendChild(modal);

    const timeoutId = setTimeout(() => {
        if (modal.parentElement) modal.remove();
    }, 5000);

    const button = modal.querySelector('button');
    if (button) {
        button.addEventListener('click', () => {
            clearTimeout(timeoutId);
            modal.remove();
        });
    }
}

function showErrorNotification(message) {
    const modal = document.createElement('div');
    modal.className = 'completion-modal';
    modal.innerHTML = `
        <div class="completion-overlay"></div>
        <div class="completion-content" style="background: linear-gradient(135deg, #3a3a3a 0%, #1f1f1f 100%);">
            <h2 style="margin-top: 0;">エラー</h2>
            <p>${escapeHtml(message)}</p>
            <button class="btn-primary" type="button">閉じる</button>
        </div>
    `;
    document.body.appendChild(modal);

    const timeoutId = setTimeout(() => {
        if (modal.parentElement) modal.remove();
    }, 5000);

    const button = modal.querySelector('button');
    if (button) {
        button.addEventListener('click', () => {
            clearTimeout(timeoutId);
            modal.remove();
        });
    }
}

export async function getDemolishedIslands() {
    try {
        const data = await fetchDemolishedIslands(window.myPlayFabId || null);

        if (data.success) {
            return data.islands;
        }

        return [];
    } catch (error) {
        console.error('[GetDemolishedIslands] Error:', error);
        return [];
    }
}

export function displayDemolishedIslandsOnMap(phaserScene, demolishedIslands) {
    if (phaserScene.demolishedSprites) {
        phaserScene.demolishedSprites.forEach(sprite => sprite.destroy());
    }
    phaserScene.demolishedSprites = [];

    demolishedIslands.forEach(island => {
        const x = island.coordinate.x * 32;
        const y = island.coordinate.y * 32;

        const rubbleIcon = island.rebuildable ? '再建' : '廃墟';
        const rubble = phaserScene.add.text(x, y, rubbleIcon, {
            fontSize: '16px',
            stroke: '#000000',
            strokeThickness: 2
        });
        rubble.setOrigin(0.5);
        rubble.setDepth(4);
        rubble.setAlpha(0.7);

        phaserScene.tweens.add({
            targets: rubble,
            alpha: 0.5,
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        if (!island.rebuildable && island.remainingTime > 0) {
            const hours = Math.floor(island.remainingTime / (1000 * 60 * 60));
            const minutes = Math.floor((island.remainingTime % (1000 * 60 * 60)) / (1000 * 60));
            const timeText = phaserScene.add.text(x, y + 30, `${hours}:${String(minutes).padStart(2, '0')}`, {
                fontSize: '16px',
                fill: '#ff6b6b',
                stroke: '#000000',
                strokeThickness: 3,
                fontWeight: 'bold'
            });
            timeText.setOrigin(0.5);
            timeText.setDepth(4);

            phaserScene.demolishedSprites.push(timeText);
        }

        phaserScene.demolishedSprites.push(rubble);
    });
}


// Expose island helpers for non-module callers.
window.Island = window.Island || {};
window.Island.showBuildingMenu = showBuildingMenu;
window.Island.getIslandDetails = getIslandDetails;
