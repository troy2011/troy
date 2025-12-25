// island.js - Island occupation/building client logic
import { callApiWithLoader } from './api.js';
import { escapeHtml, msToTime, canPlayAudioElement } from './ui.js';

// Track construction timers per island
let constructionTimers = new Map();

export async function detectIslandApproach(shipId) {
    const response = await callApiWithLoader('/api/detect-island-approach', {
        shipId: shipId
    }, { isSilent: true });

    if (response && response.success) {
        return response;
    }

    return null;
}

export async function startIslandOccupation(playFabId, islandId) {
    const response = await callApiWithLoader('/api/start-island-occupation', {
        playFabId: playFabId,
        islandId: islandId
    });

    return response;
}

export async function submitGuardianBattleResult(playFabId, islandId, victory) {
    const response = await callApiWithLoader('/api/guardian-battle-result', {
        playFabId: playFabId,
        islandId: islandId,
        victory: victory
    });

    return response;
}

export async function getPlayerIslands(playFabId) {
    const response = await callApiWithLoader('/api/get-player-islands', {
        playFabId: playFabId
    }, { isSilent: true });

    if (response && response.success) {
        return response.islands;
    }

    return [];
}

export async function getIslandDetails(islandId) {
    const response = await callApiWithLoader('/api/get-island-details', {
        islandId: islandId
    }, { isSilent: true });

    if (response && response.success) {
        return response.island;
    }

    return null;
}

export async function startBuildingConstruction(playFabId, islandId, buildingId) {
    const response = await callApiWithLoader('/api/start-building-construction', {
        playFabId: playFabId,
        islandId: islandId,
        buildingId: buildingId
    });

    if (response && response.success) {
        startConstructionTimer(islandId, response.building.completionTime);
    }

    return response;
}

export async function upgradeIslandLevel(playFabId, islandId) {
    const response = await callApiWithLoader('/api/upgrade-island-level', {
        playFabId: playFabId,
        islandId: islandId
    });

    return response;
}

export async function checkBuildingCompletion(islandId) {
    const response = await callApiWithLoader('/api/check-building-completion', {
        islandId: islandId
    }, { isSilent: true });

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
    const islandLevel = Math.max(1, Math.trunc(Number(island.islandLevel) || 1));
    const isOwner = !!playFabId && island.ownerId === playFabId;
    const canUpgrade = isOwner && islandLevel < 5;
    const upgradeCostLabel = renderUpgradeCost(island.upgradeCost);

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

                ${canUpgrade ? `
                <div class="island-upgrade-section">
                    <button class="btn-upgrade" id="btnUpgradeIsland">
                        Lv ${islandLevel + 1} にアップグレード
                    </button>
                    <div class="upgrade-cost">コスト: ${upgradeCostLabel}</div>
                </div>
                ` : ''}

                ${island.occupationStatus !== 'demolished' && island.occupationStatus !== 'capital' && island.occupationStatus !== 'sacred' ? `
                <div class="demolish-section">
                    <button class="btn-demolish" id="btnDemolish">
                        この島を解体する
                    </button>
                    <p style="font-size: 12px; color: #ff6b6b; margin-top: 8px;">
                        24時間は再建できません。
                    </p>
                </div>
                ` : ''}

                <div class="building-status-panel" data-island-id="${island.id}">
                    ${renderCurrentBuilding(island)}
                </div>

                <div class="building-categories">
                    <button class="category-tab active" data-category="military">軍事</button>
                    <button class="category-tab" data-category="economic">経済</button>
                    <button class="category-tab" data-category="support">支援</button>
                </div>

                <div class="building-list" id="buildingList"></div>
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
    loadBuildingList('military', island);

    setTimeout(() => {
        sheet.classList.add('active');
    }, 10);
}

function renderCurrentBuilding(island) {
    const building = (island.buildings || []).find(b => b && b.status !== 'demolished') || null;
    if (!building) {
        return '<div class="building-empty">建物なし</div>';
    }

    const label = getBuildingName(building.buildingId || building.id || '');
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
                alert(result.error);
            }
        });
    }
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

async function fetchBuildingsForCategory(category, islandSize) {
    const mockBuildings = {
        military: [
            { id: 'watchtower', name: '監視塔', description: '周辺海域を監視する', buildTime: 1800, tags: ['size_small'] },
            { id: 'coastal_battery', name: '沿岸砲台', description: '敵船を迎撃する', buildTime: 3600, tags: ['size_small'] },
            { id: 'fortress', name: '要塞', description: '島を防衛する', buildTime: 7200, tags: ['size_medium'] }
        ],
        economic: [
            { id: 'warehouse', name: '倉庫', description: '資源を安全に保管する', buildTime: 1800, tags: ['size_small'] },
            { id: 'farm', name: '農場', description: '食料を生産する', buildTime: 2400, tags: ['size_small'] },
            { id: 'trading_post', name: '交易所', description: '交易を可能にする', buildTime: 5400, tags: ['size_medium'] }
        ],
        support: [
            { id: 'tavern', name: '酒場', description: '乗組員を募集する', buildTime: 1200, tags: ['size_small'] },
            { id: 'repair_dock', name: '修理ドック', description: '船をより早く修理する', buildTime: 3600, tags: ['size_medium'] },
            { id: 'lighthouse', name: '灯台', description: '航行を安全にする', buildTime: 2400, tags: ['size_small'] }
        ]
    };

    const list = mockBuildings[category] || [];
    const sizeTag = islandSize ? `size_${String(islandSize).toLowerCase()}` : null;
    if (!sizeTag) return list;

    return list.filter(item => !Array.isArray(item.tags) || item.tags.includes(sizeTag));
}

async function handleBuildingConstruction(buildingId, island) {
    const sheet = document.querySelector('.building-bottom-sheet');

    const playFabId = (typeof window !== 'undefined' && window.myPlayFabId)
        ? window.myPlayFabId
        : localStorage.getItem('playFabId');
    if (!playFabId) {
        alert('プレイヤー情報がありません');
        return;
    }

    const result = await startBuildingConstruction(playFabId, island.id, buildingId);

    if (result && result.success) {
        alert(result.message);
        sheet.classList.remove('active');
        setTimeout(() => sheet.remove(), 300);
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
        alert('LINEログインが必要です');
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
        alert('ヘルプ依頼を送信しました');
    } catch (error) {
        console.error('[RequestConstructionHelp] Error:', error);
        alert('共有に失敗しました');
    }
}

export async function helpConstruction(islandId, helperPlayFabId) {
    const response = await callApiWithLoader('/api/help-construction', {
        islandId: islandId,
        helperPlayFabId: helperPlayFabId
    });

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
        const response = await fetch('/api/get-constructing-islands');
        const data = await response.json();

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
        const response = await fetch('/api/demolish-island', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playFabId, islandId })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            showErrorNotification(data.error || '解体に失敗しました');
            return { success: false, error: data.error || 'リクエストに失敗しました' };
        }

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
        const response = await fetch('/api/check-island-rebuildable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ islandId })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('[CheckIslandRebuildable] Error:', error);
        return null;
    }
}

export async function rebuildIsland(playFabId, islandId) {
    try {
        const response = await fetch('/api/rebuild-island', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playFabId, islandId })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            showErrorNotification(data.error || data.message || '再建に失敗しました');
            return { success: false, error: data.error || data.message || 'リクエストに失敗しました' };
        }

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
        const response = await fetch('/api/get-demolished-islands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        const data = await response.json();

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
