// island.js - Island occupation/building client logic
import {
    detectIslandApproach as requestDetectIslandApproach,
    startIslandOccupation as requestStartIslandOccupation,
    guardianBattleResult as requestGuardianBattleResult,
    getPlayerIslands as fetchPlayerIslands,
    getIslandDetails as fetchIslandDetails,
    getResourceStatus as fetchResourceStatus,
    collectResource as requestCollectResource,
    startBuildingConstruction as requestStartBuildingConstruction,
    upgradeIslandLevel as requestUpgradeIslandLevel,
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
    getInventory as fetchInventory
} from './playfabClient.js';
import * as Player from './player.js';
import { escapeHtml, msToTime, canPlayAudioElement } from './ui.js';
import { showRpgMessage, rpgSay } from './rpgMessages.js';

// Track construction timers per island
let constructionTimers = new Map();

const SHOP_BUILDINGS = {
    weapon_shop: { title: '武器屋', categories: ['Weapon'] },
    armor_shop: { title: '防具屋', categories: ['Armor', 'Shield'] },
    item_shop: { title: '道具屋', categories: ['Consumable'] }
};

function getShopConfig(buildingId) {
    return buildingId ? SHOP_BUILDINGS[buildingId] || null : null;
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
    const response = await requestStartBuildingConstruction(
        playFabId,
        islandId,
        buildingId,
        window.__currentMapId || null,
        null,
        options
    );

    if (response && response.success) {
        if (response.building?.status === 'completed') {
            showCompletionNotification(islandId);
            showRpgMessage(rpgSay.buildCompleted());
        } else {
            startConstructionTimer(islandId, response.building.completionTime);
            showRpgMessage(rpgSay.buildStarted(response.building?.displayName || response.building?.buildingName || buildingId));
        }
    }

    return response;
}

export async function upgradeIslandLevel(playFabId, islandId) {
    const response = await requestUpgradeIslandLevel(playFabId, islandId, window.__currentMapId || null);

    if (response && response.success) {
        const buildingId = response.buildingId || '';
        const name = buildingId ? buildingId : 'マイハウス';
        showRpgMessage(rpgSay.buildUpgraded(name));
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
    const hasBuilding = (island.buildings || []).some(b => b && b.status !== 'demolished');
    const isStarterIsland = island?.starterIsland === true;
    const playerNation = (() => {
        const explicit = String(window.__phaserPlayerInfo?.nation || window.__phaserPlayerInfo?.Nation || '').toLowerCase();
        if (explicit) return explicit;
        const color = String(window.myAvatarBaseInfo?.AvatarColor || '').toLowerCase();
        const mapping = {
            red: 'fire',
            green: 'earth',
            purple: 'wind',
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
    const activeBuilding = (island.buildings || []).find(b => b && b.status !== 'demolished') || null;
    const activeBuildingId = activeBuilding ? (activeBuilding.buildingId || activeBuilding.id || '') : '';
    const shopConfig = getShopConfig(activeBuildingId);
    const allowShipBuild = isOwnNation && activeBuildingId === 'capital';
    const allowHotSpring = isOwnNation && activeBuildingId === 'hot_spring';

    if (isStarterIsland && !isHarvestable && !hasBuilding) {
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
                        <div class="resource-row">チュートリアル用の建物です。</div>
                        <div class="resource-row">
                            <button class="btn-build" id="btnBuildMyHouse">マイハウスを建てる</button>
                        </div>
                    </div>
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
                    <div class="resource-row">資源: <b>${resourceCurrency}</b></div>
                    <div class="resource-row" id="resourceStatus">読み込み中...</div>
                    <button class="btn-harvest" id="btnHarvestResource">採取する</button>
                </div>
                ` : ''}

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
                        <button class="btn-build" id="btnBuildingUpgrade">強化</button>
                        ${allowShipBuild ? `<button class="btn-build" id="btnBuildingAction">特殊</button>` : ''}
                    </div>
                </div>
                `}
                ` : ''}

                ${(hasBuilding && isOwnNation && allowHotSpring) ? `
                <div class="building-actions">
                    <div class="resource-title">温泉</div>
                    <div class="resource-row">入浴（${Number(island.hotSpringPrice || 200)} Ps）でHPを回復</div>
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

    setupBuildingMenuEvents(sheet, island, playFabId);
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

function setupBuildingMenuEvents(sheet, island, playFabId) {
    sheet.querySelector('.close-btn').addEventListener('click', () => {
        sheet.classList.remove('active');
        setTimeout(() => sheet.remove(), 300);
    });

    sheet.querySelector('.bottom-sheet-overlay').addEventListener('click', () => {
        sheet.classList.remove('active');
        setTimeout(() => sheet.remove(), 300);
    });

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
        upgradeBuildingBtn.addEventListener('click', () => {
            showRpgMessage('強化アクションは準備中です。');
        });
    }

    const specialBtn = sheet.querySelector('#btnBuildingAction');
    if (specialBtn) {
        specialBtn.addEventListener('click', () => {
            if (typeof window.showCreateShipModal === 'function') {
                safeCloseSheet();
                window.showCreateShipModal({ islandId: island.id, mapId: window.__currentMapId || null });
                return;
            }
            if (typeof window.showTab === 'function') {
                void window.showTab('ships');
            }
        });
    }

    const capitalCreateBtn = sheet.querySelector('#btnCapitalCreateShip');
    if (capitalCreateBtn) {
        capitalCreateBtn.addEventListener('click', () => {
            if (typeof window.showCreateShipModal === 'function') {
                safeCloseSheet();
                window.showCreateShipModal({ islandId: island.id, mapId: window.__currentMapId || null });
                return;
            }
            if (typeof window.showTab === 'function') {
                void window.showTab('ships');
            }
        });
    }

    const hotSpringBtn = sheet.querySelector('#btnHotSpringBath');
    if (hotSpringBtn) {
        hotSpringBtn.addEventListener('click', async () => {
            hotSpringBtn.disabled = true;
            const result = await requestHotSpringBath(playFabId, island.id, window.__currentMapId || null);
            if (result && result.success) {
                showRpgMessage('温泉で体力が回復した！');
                await Player.getPlayerStats(playFabId);
                await Player.getPoints(playFabId);
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
        const buildings = await fetchBuildingsForCategory(category, island.size);
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
                </div>
                <button class="btn-build" data-building-id="${building.id}" ${hasBuilding ? 'disabled' : ''}>${hasBuilding ? '建設済み' : '建設'}</button>
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

async function loadShopPanels(sheet, island, shopConfig, playFabId) {
    const sellList = sheet.querySelector('#shopSellList');
    const buyList = sheet.querySelector('#shopBuyList');
    if (!sellList || !buyList) return;
    sellList.innerHTML = '読み込み中...';
    buyList.innerHTML = '読み込み中...';
    try {
        const [shopState, inventoryResult] = await Promise.all([
            fetchShopState(island.id, window.__currentMapId || null, { isSilent: true }),
            fetchInventory(playFabId, { isSilent: true })
        ]);
        const pricing = shopState?.pricing || { buyMultiplier: 0.7, sellMultiplier: 1.2, itemPrices: {} };
        const itemPrices = pricing.itemPrices || {};
        const buyInput = sheet.querySelector('#shopBuyMultiplier');
        const sellInput = sheet.querySelector('#shopSellMultiplier');
        if (buyInput) buyInput.value = String(pricing.buyMultiplier);
        if (sellInput) sellInput.value = String(pricing.sellMultiplier);

        const inventory = Array.isArray(inventoryResult?.inventory) ? inventoryResult.inventory : [];
        const allowed = shopConfig?.categories || [];
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
                            <div class="building-description">在庫: ${item.count} / 買い取り: ${price} Ps</div>
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
                            <div class="building-description">在庫: ${item.count} / 価格: ${price} Ps</div>
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

function renderNationDonateRows() {
    const currencies = [
        { code: 'PS', label: 'Ps' },
        { code: 'RR', label: '火' },
        { code: 'RG', label: '石' },
        { code: 'RY', label: 'キノコ' },
        { code: 'RB', label: '水' },
        { code: 'RT', label: '木の枝' },
        { code: 'RS', label: '木' }
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
    const icons = {
        watchtower: 'W',
        coastal_battery: 'C',
        fortress: 'F',
        warehouse: 'W',
        farm: 'F',
        trading_post: 'T',
        tavern: 'T',
        repair_dock: 'R',
        lighthouse: 'L',
        shipyard: 'S',
        mine: 'M',
        temple: 'P',
        grand_market: 'G'
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
        fortress: '要塞',
        warehouse: '倉庫',
        farm: '農場',
        trading_post: '交易所',
        tavern: '酒場',
        repair_dock: '修理ドック',
        lighthouse: '灯台',
        shipyard: '造船所',
        mine: '鉱山',
        temple: '神殿',
        grand_market: '大市場'
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

export async function helpConstruction(islandId, helperPlayFabId) {
    const response = await requestHelpConstruction(islandId, helperPlayFabId, window.__currentMapId || null);

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
        const newAudio = document.createElement('audio');
        newAudio.id = 'audioConstruction';
        newAudio.loop = true;
        newAudio.volume = 0.3;

        const sources = [
            { src: '/audio/construction.mp3', type: 'audio/mpeg' },
            { src: '/audio/construction.ogg', type: 'audio/ogg' }
        ];

        sources.forEach(source => {
            const sourceElement = document.createElement('source');
            sourceElement.src = source.src;
            sourceElement.type = source.type;
            newAudio.appendChild(sourceElement);
        });

        document.body.appendChild(newAudio);

        if (start && canPlayAudioElement(newAudio)) {
            newAudio.play().catch(e => console.warn('Construction sound play failed:', e));
        }
    } else {
        if (start) {
            if (!canPlayAudioElement(audio)) return;
            audio.currentTime = 0;
            audio.play().catch(e => console.warn('Construction sound play failed:', e));
        } else {
            audio.pause();
        }
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
