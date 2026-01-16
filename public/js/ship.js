// c:/Users/ikeda/my-liff-app/public/js/ship.js
// Client-side ship management with dead reckoning animation

import {
    getActiveShip as fetchActiveShip,
    setActiveShip as requestSetActiveShip,
    createShip as requestCreateShip,
    startShipVoyage as requestStartShipVoyage,
    stopShip as requestStopShip,
    getPlayerShips as fetchPlayerShips,
    getShipsInView as fetchShipsInView,
    getShipAsset as fetchShipAsset,
    getShipPosition as fetchShipPosition
} from './playfabClient.js';
import { showRpgMessage, rpgSay } from './rpgMessages.js';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

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

export async function startShipVoyage(shipId, playFabId, destination) {
    const data = await requestStartShipVoyage(shipId, playFabId, destination);

    if (data && data.success) {
        console.log(`[StartShipVoyage] Ship ${shipId} departing, ETA: ${data.travelTimeSeconds.toFixed(1)}s`);
        return data;
    }

    return null;
}

export async function stopShip(shipId) {
    const data = await requestStopShip(shipId);

    if (data && data.success) {
        console.log(`[StopShip] Ship ${shipId} stopped at (${data.currentPosition.x}, ${data.currentPosition.y})`);
        return data;
    }

    return null;
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

export function renderShipCard(ship) {
    const assetData = ship.assetData;
    const positionData = ship.positionData || {};
    const movement = positionData.movement || {};
    const currentPos = ship.currentPosition || positionData.position || { x: 0, y: 0 };
    const isActive = !!ship.isActive;

    const resolveCatalogShip = () => {
        if (!assetData || !window.shipCatalog) return null;
        if (assetData.ItemId && window.shipCatalog[assetData.ItemId]) return window.shipCatalog[assetData.ItemId];
        const shipType = assetData.ShipType;
        if (!shipType) return null;
        return Object.values(window.shipCatalog).find(item => item.DisplayName === shipType) || null;
    };

    const catalogItem = resolveCatalogShip();
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
            <div class="ship-card-actions">
                <button onclick="window.viewShipDetails('${ship.shipId}')">詳細</button>
                ${isMoving ? `
                <button data-variant="danger" onclick="window.stopShip('${ship.shipId}')">停止</button>
                ` : `
                <button data-variant="accent" onclick="window.startShipVoyageUI('${ship.shipId}')">出航</button>
                `}
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
