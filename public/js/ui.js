// c:/Users/ikeda/my-liff-app/public/js/ui.js

import * as Player from './player.js';
import * as Inventory from './inventory.js';
import * as Guild from './guild.js';
import * as Ship from './ship.js';
import * as NationKing from './nationKing.js';
import * as Islands from './islands.js';
import { getNationKingPage } from './playfabClient.js';

const TAROT_AREAS = [
    { id: 'wands', label: 'ワンド' },
    { id: 'pentacles', label: 'ペンタクル' },
    { id: 'swords', label: 'ソード' },
    { id: 'cups', label: 'カップ' },
    { id: 'joker', label: 'joker' }
];

const MAJOR_ARCANA = [
    { number: 0, name: '愚者' },
    { number: 1, name: '魔術師' },
    { number: 2, name: '女教皇' },
    { number: 3, name: '女帝' },
    { number: 4, name: '皇帝' },
    { number: 5, name: '教皇' },
    { number: 6, name: '恋人' },
    { number: 7, name: '戦車' },
    { number: 8, name: '力' },
    { number: 9, name: '隠者' },
    { number: 10, name: '運命の輪' },
    { number: 11, name: '正義' },
    { number: 12, name: '吊るされた男' },
    { number: 13, name: '死神' },
    { number: 14, name: '節制' },
    { number: 15, name: '悪魔' },
    { number: 16, name: '塔' },
    { number: 17, name: '星' },
    { number: 18, name: '月' },
    { number: 19, name: '太陽' },
    { number: 20, name: '審判' },
    { number: 21, name: '世界' }
];

const MAJOR_ARCANA_BY_AREA = {
    wands: [4, 8, 15, 19],
    pentacles: [5, 9, 12, 16],
    swords: [3, 10, 11, 17],
    cups: [2, 7, 14, 18],
    joker: [0, 1, 6, 13, 20, 21]
};

const AREA_BY_NATION = {
    fire: 'wands',
    earth: 'pentacles',
    wind: 'swords',
    water: 'cups',
    neutral: 'joker'
};
const ENTRY_SIDE_BY_NATION = {
    fire: 'south',
    earth: 'east',
    wind: 'north',
    water: 'west'
};
const AREA_LABEL_BY_ID = TAROT_AREAS.reduce((acc, area) => {
    acc[area.id] = area.label;
    return acc;
}, {});

async function waitForContainerSize(container, timeoutMs = 5000) {
    if (!container) return false;
    if (container.clientWidth > 0 && container.clientHeight > 0) return true;

    return await new Promise((resolve) => {
        let done = false;
        let observer = null;
        const finish = (ready) => {
            if (done) return;
            done = true;
            if (observer) observer.disconnect();
            resolve(ready);
        };

        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => {
                if (container.clientWidth > 0 && container.clientHeight > 0) {
                    finish(true);
                }
            });
            observer.observe(container);
        }

        const start = Date.now();
        const tick = () => {
            if (container.clientWidth > 0 && container.clientHeight > 0) {
                finish(true);
                return;
            }
            if (Date.now() - start >= timeoutMs) {
                finish(false);
                return;
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

const getEntrySideForNation = (nation) => {
    const key = String(nation || '').toLowerCase();
    const side = ENTRY_SIDE_BY_NATION[key];
    if (side) return side;
    const options = ['north', 'south', 'east', 'west'];
    return options[Math.floor(Math.random() * options.length)];
};

function showMapSelectModal(playerInfo) {
    const modal = document.getElementById('mapSelectModal');
    if (!modal) return;
    const areaList = document.getElementById('mapSelectAreaList');
    const arcanaList = document.getElementById('mapSelectArcanaList');
    const title = document.getElementById('mapSelectTitle');
    if (!areaList || !arcanaList) return;

    let currentArea = null;
    const renderAreas = () => {
        currentArea = null;
        if (title) title.textContent = '海域を選択';
        areaList.innerHTML = '';
        arcanaList.innerHTML = '';
        TAROT_AREAS.forEach((area) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'map-select-button';
            btn.className = 'map-select-button';
            btn.textContent = area.label;
            btn.dataset.area = area.id;
            btn.addEventListener('click', () => renderArcana(area.id));
            areaList.appendChild(btn);
        });
    };

    const renderArcana = (areaId) => {
        currentArea = areaId;
        const areaLabel = TAROT_AREAS.find(a => a.id === areaId)?.label || areaId;
        if (title) title.textContent = `${areaLabel}の海域`;
        areaList.innerHTML = '';
        arcanaList.innerHTML = '';
        const baseBtn = document.createElement('button');
        baseBtn.type = 'button';
        baseBtn.className = 'map-select-button';
        baseBtn.dataset.area = areaId;
        baseBtn.textContent = `${areaLabel}の国マップ`;
        baseBtn.addEventListener('click', () => {
            const mapId = areaId;
            hideMapSelectModal();
            showTab('map', playerInfo, { skipMapSelect: true, mapId, mapLabel: `${areaLabel}の国マップ` });
        });
        arcanaList.appendChild(baseBtn);
        const arcanaNumbers = MAJOR_ARCANA_BY_AREA[areaId] || [];
        arcanaNumbers.forEach((num) => {
            const entry = MAJOR_ARCANA.find(a => a.number === num);
            const label = entry ? `${entry.number}: ${entry.name}` : String(num);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            btn.dataset.arcana = String(num);
            btn.dataset.area = areaId;
            btn.addEventListener('click', () => {
                const mapId = `major_${String(num).padStart(2, '0')}`;
                hideMapSelectModal();
                showTab('map', playerInfo, { skipMapSelect: true, mapId, mapLabel: label });
            });
            arcanaList.appendChild(btn);
        });
        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'map-select-button map-select-button--ghost';
        backBtn.textContent = '海域へ戻る';
        backBtn.addEventListener('click', renderAreas);
        arcanaList.appendChild(backBtn);
    };

    renderAreas();
    modal.style.display = 'flex';
}

function hideMapSelectModal() {
    const modal = document.getElementById('mapSelectModal');
    if (!modal) return;
    modal.style.display = 'none';
}

let gameInstance = null;
let launchGameFn = null;
const tabLoaded = { home: false, ships: false, map: false, islands: false, qr: false, inventory: false, ranking: false, king: false };
const audioAvailabilityCache = new Map();
const audioAvailabilityInFlight = new Set();

export function msToTime(durationMs) {
    if (durationMs <= 0) return "0秒";
    const seconds = Math.floor((durationMs / 1000) % 60);
    const minutes = Math.floor((durationMs / (1000 * 60)) % 60);
    const hours = Math.floor((durationMs / (1000 * 60 * 60)));
    let parts = [];
    if (hours > 0) parts.push(hours + "時間");
    if (minutes > 0) parts.push(minutes + "分");
    if (seconds > 0 || parts.length === 0) parts.push(seconds + "秒");
    return parts.join("");
}

export function playSound(audioId) {
    const audio = document.getElementById(audioId);
    if (!audio || !canPlayAudioElement(audio)) return;
    audio.currentTime = 0;
    audio.play().catch(e => console.warn(`Audio play failed (${audioId}):`, e));
}

export function canPlayAudioElement(audio) {
    if (!audio) return false;
    const urls = collectAudioUrls(audio);
    if (urls.length === 0) return false;

    for (const url of urls) {
        const cached = audioAvailabilityCache.get(url);
        if (cached === true) return true;
        if (cached === undefined) scheduleAudioCheck(url);
    }

    return false;
}

function collectAudioUrls(audio) {
    const urls = [];
    if (audio.currentSrc) urls.push(audio.currentSrc);
    if (audio.src && String(audio.src).trim() !== '') urls.push(audio.src);
    const sources = Array.from(audio.querySelectorAll('source'));
    sources.forEach((source) => {
        if (source.src && String(source.src).trim() !== '') urls.push(source.src);
    });
    return urls.map(normalizeAudioUrl);
}

function normalizeAudioUrl(url) {
    try {
        return new URL(url, window.location.href).toString();
    } catch {
        return String(url);
    }
}

function scheduleAudioCheck(url) {
    if (audioAvailabilityCache.has(url) || audioAvailabilityInFlight.has(url)) return;
    audioAvailabilityInFlight.add(url);
    fetch(url, { method: 'HEAD', cache: 'no-store' })
        .then(res => audioAvailabilityCache.set(url, res.ok))
        .catch(() => audioAvailabilityCache.set(url, false))
        .finally(() => audioAvailabilityInFlight.delete(url));
}

export function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (match) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[match]);
}

export async function showTab(tabId, playerInfo, options = {}) {
    console.log('[showTab] Called with tabId:', tabId, 'playerInfo:', playerInfo);
    const currentActiveTab = document.querySelector('.nav-button.active');
    const mapLoadLabel = null;

    const mapSelectOptions = {
        skipMapSelect: !!options.skipMapSelect,
        mapId: options.mapId || null,
        mapLabel: options.mapLabel || null
    };
    if (tabId === 'map' && mapSelectOptions.mapId) {
        const prevMapId = window.__currentMapId;
        if (prevMapId && prevMapId !== mapSelectOptions.mapId) {
            window.__pendingMapSpawn = {
                mapId: mapSelectOptions.mapId,
                side: getEntrySideForNation(playerInfo?.nation)
            };
        }
        if (prevMapId && prevMapId !== mapSelectOptions.mapId && gameInstance) {
            gameInstance.destroy(true);
            gameInstance = null;
            tabLoaded.map = false;
        }
        window.__currentMapId = mapSelectOptions.mapId;
        window.__currentMapLabel = mapSelectOptions.mapLabel || mapSelectOptions.mapId;
    }
    if (tabId === 'map' && !mapSelectOptions.skipMapSelect) {
        if (!window.__currentMapId && playerInfo?.nation) {
            const areaId = AREA_BY_NATION[String(playerInfo.nation).toLowerCase()];
            if (areaId) {
                const label = AREA_LABEL_BY_ID[areaId] || areaId;
                await showTab('map', playerInfo, { skipMapSelect: true, mapId: areaId, mapLabel: `${label}の国マップ` });
                if (mapLoadLabel) console.timeEnd(mapLoadLabel);
                return;
            }
        }
        if (currentActiveTab && currentActiveTab.id === 'navMap') {
            showMapSelectModal(playerInfo);
            if (mapLoadLabel) console.timeEnd(mapLoadLabel);
            return;
        }
    }
    if (tabId === 'map' && tabLoaded.map && !gameInstance) {
        tabLoaded.map = false;
    }

    const showKingAnnouncementOnMap = async () => {
        if (!playerInfo?.playFabId) return;
        try {
            const data = await getNationKingPage(playerInfo.playFabId, { isSilent: true });
            const msg = data?.announcement?.message;
            if (msg && typeof window.showRpgMessage === 'function') {
                window.showRpgMessage(`王の告知：${msg}`);
            }
        } catch (error) {
            console.warn('[showTab] Failed to load king announcement:', error);
        }
    };

    if (tabId === 'map') {
        await showKingAnnouncementOnMap();
    }

    // 船タブから離れる場合はリスナーをクリーンアップ
    if (currentActiveTab && currentActiveTab.id === 'navShips' && tabId !== 'ships') {
        console.log('[showTab] Leaving ships tab, cleaning up listeners');
        Ship.cleanupShipListeners();
        tabLoaded.ships = false;
    }

    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-button').forEach(el => el.classList.remove('active'));

    const contentEl = document.getElementById(`tabContent${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
    if (contentEl) contentEl.style.display = 'block';

    const navEl = document.getElementById(`nav${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
    if (navEl) navEl.classList.add('active');

    try {
        if (!tabLoaded[tabId]) {
            console.log(`Loading data for tab: ${tabId}`);
            switch (tabId) {
                case 'home':
                    await Player.getPlayerStats(playerInfo.playFabId);
                    await Player.getPoints(playerInfo.playFabId);
                    await Inventory.refreshResourceSummary(playerInfo.playFabId);
                    break;
                case 'ships':
                    if (!playerInfo || !playerInfo.playFabId) {
                        console.warn('[showTab] ships tab requires playFabId');
                        break;
                    }
                    await Ship.displayPlayerShips(playerInfo.playFabId);
                    break;
                case 'inventory':
                    await Inventory.getInventory(playerInfo.playFabId);
                    await Player.getPoints(playerInfo.playFabId);
                    break;
                case 'islands':
                    if (!playerInfo || !playerInfo.playFabId) {
                        console.warn('[showTab] islands tab requires playFabId');
                        break;
                    }
                    await Islands.loadOwnedIslands(playerInfo.playFabId);
                    break;
                case 'ranking':
                    await Player.getRanking();
                    break;
                case 'king':
                    await NationKing.loadKingPage(playerInfo.playFabId);
                    break;
                case 'qr':
                    await Player.getPoints(playerInfo.playFabId);
                    await Inventory.refreshResourceSummary(playerInfo.playFabId);
                    await Guild.loadGuildInfo(playerInfo.playFabId);
                    break;
                case 'map': {
                    const triggerFirstMapMessages = () => {
                        if (window.__firstMapRpgShown) return;
                        const pending = Array.isArray(window.__pendingFirstMapMessages)
                            ? window.__pendingFirstMapMessages.slice()
                            : [];
                        if (!pending.length) {
                            window.__firstMapRpgShown = true;
                            return;
                        }
                        window.__firstMapRpgShown = true;
                        window.__pendingFirstMapMessages = [];
                        let delay = 300;
                        pending.forEach((msg) => {
                            if (!msg) return;
                            setTimeout(() => {
                                if (typeof window.showRpgMessage === 'function') {
                                    window.showRpgMessage(msg);
                                }
                            }, delay);
                            delay += 1200;
                        });
                    };
                    triggerFirstMapMessages();
                    if (mapSelectOptions.mapId) {
                        if (window.__currentMapId && window.__currentMapId !== mapSelectOptions.mapId && gameInstance) {
                            gameInstance.destroy(true);
                            gameInstance = null;
                            tabLoaded.map = false;
                        }
                        window.__currentMapId = mapSelectOptions.mapId;
                        window.__currentMapLabel = mapSelectOptions.mapLabel || mapSelectOptions.mapId;
                    }
                        if (gameInstance) {
                            tabLoaded[tabId] = true;
                            // ゲームが既に存在する場合は、リサイズして再表示
                            await new Promise(resolve => requestAnimationFrame(resolve));
                        const container = document.getElementById('phaser-container');
                        if (container && gameInstance.scale) {
                            gameInstance.scale.resize(container.clientWidth, container.clientHeight);
                        }
                        const scene = gameInstance.scene?.getScene('WorldMapScene');
                        if (scene && scene.scene) {
                            if (scene.scene.isSleeping()) {
                                scene.scene.wake();
                            } else if (scene.scene.isPaused()) {
                                scene.scene.resume();
                            } else if (!scene.scene.isActive()) {
                                scene.scene.start();
                            }
                            if (typeof scene.setMapReady === 'function' && scene.islandObjects?.size) {
                                scene.setMapReady(true);
                            }
                            if (window.__pendingFirstMapNav?.islandId) {
                                const targetId = window.__pendingFirstMapNav.islandId;
                                if (typeof scene.setNavigationTarget === 'function') {
                                    const setOk = scene.setNavigationTarget(targetId);
                                    if (setOk) {
                                        window.__pendingFirstMapNav = null;
                                    }
                                }
                            }
                        }
                        if (gameInstance?.loop?.wake) {
                            gameInstance.loop.wake();
                        }
                        if (gameInstance?.renderer?.snapshot) {
                            gameInstance.renderer.snapshot(() => {});
                        }
                return; // Don't launch twice
            }
                    const container = document.getElementById('phaser-container');
                    const containerReady = await waitForContainerSize(container, 5000);
                    if (!container || !containerReady) {
                        console.error('[Phaser] Container still has zero dimensions after waiting.');
                        break;
                    }

                    console.log("Launching Phaser game with playerInfo:", playerInfo);
                    if (!launchGameFn) {
                        const gameModule = await import('../Game.js');
                        launchGameFn = gameModule.launchGame;
                    }
                    const infoWithMap = mapSelectOptions.mapId
                        ? { ...playerInfo, mapId: mapSelectOptions.mapId, mapLabel: mapSelectOptions.mapLabel }
                        : playerInfo;
                    gameInstance = launchGameFn('phaser-container', infoWithMap);
                    if (gameInstance) {
                        Object.defineProperty(window, 'gameInstance', { get: () => gameInstance });
                    }
                    break;
                }
            }
            tabLoaded[tabId] = true;
        }

        if (tabId === 'map' && gameInstance) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const container = document.getElementById('phaser-container');
            if (container && gameInstance.scale) {
                gameInstance.scale.resize(container.clientWidth, container.clientHeight);
            }
            const scene = gameInstance.scene?.getScene('WorldMapScene');
            if (scene && scene.scene) {
                if (scene.scene.isSleeping()) {
                    scene.scene.wake();
                } else if (scene.scene.isPaused()) {
                    scene.scene.resume();
                } else if (!scene.scene.isActive()) {
                    scene.scene.start();
                }
                if (typeof scene.setMapReady === 'function' && scene.islandObjects?.size) {
                    scene.setMapReady(true);
                }
                if (window.__pendingFirstMapNav?.islandId) {
                    const targetId = window.__pendingFirstMapNav.islandId;
                    if (typeof scene.setNavigationTarget === 'function') {
                        const setOk = scene.setNavigationTarget(targetId);
                        if (setOk) {
                            window.__pendingFirstMapNav = null;
                        }
                    }
                }
            }
            if (gameInstance?.loop?.wake) {
                gameInstance.loop.wake();
            }
            if (gameInstance?.renderer?.snapshot) {
                gameInstance.renderer.snapshot(() => {});
            }
            if (gameInstance?.scale?.refresh) {
                gameInstance.scale.refresh();
            }
            const canvas = gameInstance?.canvas;
            if (canvas && canvas.style) {
                const prev = canvas.style.transform;
                canvas.style.transform = 'translateZ(0)';
                requestAnimationFrame(() => {
                    canvas.style.transform = prev || '';
                });
            }
            setTimeout(() => {
                if (gameInstance?.renderer?.snapshot) {
                    gameInstance.renderer.snapshot(() => {});
                }
            }, 50);
        }
    } catch (error) {
        console.error(`Failed to load data for tab ${tabId}:`, error);
    }
    // no-op
}

export function showConfirmationModal(amount, receiverId, receiverName, onConfirm) {
    playSound('audioCoin');
    document.getElementById('modalAmount').innerText = `${amount}Ps`;
    const label = receiverName || receiverId;
    document.getElementById('modalReceiverId').innerText = label;
    const modal = document.getElementById('confirmationModal');
    modal.style.display = 'flex';

    const confirmBtn = document.getElementById('btnConfirmTransfer');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        onConfirm();
    });

    const cancelBtn = document.getElementById('btnCancelTransfer');
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        document.getElementById('pointMessage').innerText = "キャンセルしました。";
    });
}
