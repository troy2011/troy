// c:/Users/ikeda/my-liff-app/public/js/ui.js

import * as Player from './player.js';
import * as Inventory from './inventory.js?v=20260604g';
import * as Ship from './ship.js';
import * as NationKing from './nationKing.js';
import * as Islands from './islands.js';
import { getNationAnnouncements } from './playfabClient.js';
import { loadHomeAnnouncements } from './homeAnnouncements.js';

let troyModule = null;
const ensureTroyModule = async () => {
    if (troyModule) return troyModule;
    troyModule = await import('./troy.js');
    return troyModule;
};

let companionModule = null;
const COMPANION_MODULE_VERSION = '20260604d';
const ensureCompanionModule = async () => {
    if (companionModule) return companionModule;
    companionModule = await import(`./companions.js?v=${COMPANION_MODULE_VERSION}`);
    return companionModule;
};

let tarotModule = null;
const TAROT_MODULE_VERSION = '20260323a';
const ensureTarotModule = async () => {
    if (tarotModule) return tarotModule;
    tarotModule = await import(`./tarotPoker.js?v=${TAROT_MODULE_VERSION}`);
    return tarotModule;
};

let tarotKingdomModule = null;
const TAROT_KINGDOM_MODULE_VERSION = '20260323a';
const ensureTarotKingdomModule = async () => {
    if (tarotKingdomModule) return tarotKingdomModule;
    tarotKingdomModule = await import(`./tarotKingdom.js?v=${TAROT_KINGDOM_MODULE_VERSION}`);
    return tarotKingdomModule;
};

let spinTarotModule = null;
const SPIN_TAROT_MODULE_VERSION = '20260325a';
const ensureSpinTarotModule = async () => {
    if (spinTarotModule) return spinTarotModule;
    spinTarotModule = await import(`./spinTarot.js?v=${SPIN_TAROT_MODULE_VERSION}`);
    return spinTarotModule;
};

let tarotModeBound = false;
let currentTarotMode = 'poker';
let tarotPokerLoaded = false;
let tarotKingdomLoaded = false;
let tarotSpinLoaded = false;

const ensureSpinTarotModeElements = () => {
    const selectRoot = document.getElementById('tarotGameSelectRoot');
    const switchRoot = selectRoot?.querySelector('.tarot-game-switch');
    if (switchRoot && !document.getElementById('tarotModeSpin')) {
        const button = document.createElement('button');
        button.id = 'tarotModeSpin';
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', 'false');
        button.textContent = 'Spin Tarot';
        switchRoot.appendChild(button);
    }

    const kingdomRoot = document.getElementById('tarotKingdomRoot');
    if (kingdomRoot && !document.getElementById('tarotSpinRoot')) {
        const spinRoot = document.createElement('div');
        spinRoot.id = 'tarotSpinRoot';
        spinRoot.className = 'content-area tarot-spin-root';
        spinRoot.style.display = 'none';
        kingdomRoot.insertAdjacentElement('afterend', spinRoot);
    }
};

const getTarotModeElements = () => {
    ensureSpinTarotModeElements();
    return {
        selectRoot: document.getElementById('tarotGameSelectRoot'),
        pokerButton: document.getElementById('tarotModePoker'),
        kingdomButton: document.getElementById('tarotModeKingdom'),
        spinButton: document.getElementById('tarotModeSpin'),
        pokerRoot: document.getElementById('tarotPokerRoot'),
        kingdomRoot: document.getElementById('tarotKingdomRoot'),
        spinRoot: document.getElementById('tarotSpinRoot')
    };
};

const showTarotModeSelection = () => {
    const { selectRoot, pokerRoot, kingdomRoot, spinRoot, pokerButton, kingdomButton, spinButton } = getTarotModeElements();
    if (selectRoot) {
        selectRoot.style.display = 'block';
    }
    if (pokerRoot) {
        pokerRoot.style.display = 'none';
    }
    if (kingdomRoot) {
        kingdomRoot.style.display = 'none';
    }
    if (spinRoot) {
        spinRoot.style.display = 'none';
    }
    if (pokerButton) {
        pokerButton.classList.remove('is-active');
        pokerButton.setAttribute('aria-selected', 'false');
    }
    if (kingdomButton) {
        kingdomButton.classList.remove('is-active');
        kingdomButton.setAttribute('aria-selected', 'false');
    }
    if (spinButton) {
        spinButton.classList.remove('is-active');
        spinButton.setAttribute('aria-selected', 'false');
    }
};

const applyTarotModeUi = (mode) => {
    const normalized = mode === 'kingdom' || mode === 'spin' ? mode : 'poker';
    const { selectRoot, pokerButton, kingdomButton, spinButton, pokerRoot, kingdomRoot, spinRoot } = getTarotModeElements();
    if (selectRoot) {
        selectRoot.style.display = 'none';
    }
    if (pokerRoot) {
        pokerRoot.style.display = normalized === 'poker' ? 'block' : 'none';
    }
    if (kingdomRoot) {
        kingdomRoot.style.display = normalized === 'kingdom' ? 'block' : 'none';
    }
    if (spinRoot) {
        spinRoot.style.display = normalized === 'spin' ? 'block' : 'none';
    }
    if (pokerButton) {
        pokerButton.classList.toggle('is-active', normalized === 'poker');
        pokerButton.setAttribute('aria-selected', normalized === 'poker' ? 'true' : 'false');
    }
    if (kingdomButton) {
        kingdomButton.classList.toggle('is-active', normalized === 'kingdom');
        kingdomButton.setAttribute('aria-selected', normalized === 'kingdom' ? 'true' : 'false');
    }
    if (spinButton) {
        spinButton.classList.toggle('is-active', normalized === 'spin');
        spinButton.setAttribute('aria-selected', normalized === 'spin' ? 'true' : 'false');
    }
};

const ensureTarotModeLoaded = async (mode, forceLoad = false) => {
    if (mode === 'spin') {
        if (!forceLoad && tarotSpinLoaded) return;
        const SpinTarot = await ensureSpinTarotModule();
        if (typeof SpinTarot.loadSpinTarotPage === 'function') {
            await SpinTarot.loadSpinTarotPage();
        }
        tarotSpinLoaded = true;
        return;
    }
    if (mode === 'kingdom') {
        if (!forceLoad && tarotKingdomLoaded) return;
        const Kingdom = await ensureTarotKingdomModule();
        if (typeof Kingdom.loadTarotKingdomPage === 'function') {
            await Kingdom.loadTarotKingdomPage();
        }
        tarotKingdomLoaded = true;
        return;
    }

    if (!forceLoad && tarotPokerLoaded) return;
    const Tarot = await ensureTarotModule();
    if (typeof Tarot.loadTarotPokerPage === 'function') {
        await Tarot.loadTarotPokerPage();
    }
    tarotPokerLoaded = true;
};

const setTarotMode = async (mode, options = {}) => {
    const { ensureLoaded = true, forceLoad = false } = options;
    const normalized = mode === 'kingdom' || mode === 'spin' ? mode : 'poker';
    currentTarotMode = normalized;
    applyTarotModeUi(normalized);
    if (ensureLoaded) {
        await ensureTarotModeLoaded(normalized, forceLoad);
    }
};

const bindTarotModeSwitch = () => {
    if (tarotModeBound) return;
    const { pokerButton, kingdomButton, spinButton } = getTarotModeElements();
    if (!pokerButton || !kingdomButton || !spinButton) return;

    pokerButton.addEventListener('click', () => {
        setTarotMode('poker', { ensureLoaded: true }).catch((error) => {
            console.error('[tarot] failed to switch to poker mode:', error);
        });
    });
    kingdomButton.addEventListener('click', () => {
        setTarotMode('kingdom', { ensureLoaded: true }).catch((error) => {
            console.error('[tarot] failed to switch to kingdom mode:', error);
        });
    });
    spinButton.addEventListener('click', () => {
        setTarotMode('spin', { ensureLoaded: true }).catch((error) => {
            console.error('[tarot] failed to switch to spin tarot mode:', error);
        });
    });
    tarotModeBound = true;
};

const prepareTarotTab = async () => {
    ensureSpinTarotModeElements();
    bindTarotModeSwitch();
    showTarotModeSelection();
};

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

const EMPTY_MAP_ID = 'empty';
const EMPTY_CELL_META = {
    mapId: EMPTY_MAP_ID,
    mapLabel: '未設置',
    tarotIndex: 110,
    label: ''
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

const WORLD_MAP_GRID = [
    [
        { mapId: 'pentacles', mapLabel: '地の国', tarotIndex: 110, nation: 'earth', label: '地の国', isCapital: true },
        { mapId: 'major_01', mapLabel: '1. 魔術師', tarotIndex: 110 },
        { mapId: 'major_06', mapLabel: '6. 恋人', tarotIndex: 110 },
        { mapId: 'major_04', mapLabel: '4. 皇帝', tarotIndex: 110 },
        { mapId: 'swords', mapLabel: '風の国', tarotIndex: 110, nation: 'wind', label: '風の国', isCapital: true }
    ],
    [
        { mapId: 'major_02', mapLabel: '2. 女教皇', tarotIndex: 110 },
        { mapId: 'major_11', mapLabel: '11. 正義', tarotIndex: 110 },
        { mapId: 'major_17', mapLabel: '17. 星', tarotIndex: 110 },
        { mapId: 'major_08', mapLabel: '8. 力', tarotIndex: 110 },
        { mapId: 'major_19', mapLabel: '19. 太陽', tarotIndex: 110 }
    ],
    [
        { mapId: 'major_07', mapLabel: '7. 戦車', tarotIndex: 110 },
        { mapId: 'major_12', mapLabel: '12. 吊るされた男', tarotIndex: 110 },
        { mapId: 'major_21', mapLabel: '21. 世界', tarotIndex: 80, label: '★ 21. 世界', isWorld: true },
        { mapId: 'major_10', mapLabel: '10. 運命の輪', tarotIndex: 110 },
        { mapId: 'major_16', mapLabel: '16. 塔', tarotIndex: 110 }
    ],
    [
        { mapId: 'major_09', mapLabel: '9. 隠者', tarotIndex: 110 },
        { mapId: 'major_14', mapLabel: '14. 節制', tarotIndex: 110 },
        { mapId: 'major_20', mapLabel: '20. 審判', tarotIndex: 110 },
        { mapId: 'major_13', mapLabel: '13. 死神', tarotIndex: 110 },
        { mapId: 'major_18', mapLabel: '18. 月', tarotIndex: 110 }
    ],
    [
        { mapId: 'cups', mapLabel: '水の国', tarotIndex: 110, nation: 'water', label: '水の国', isCapital: true },
        { mapId: 'major_05', mapLabel: '5. 法王', tarotIndex: 110 },
        { mapId: 'major_15', mapLabel: '15. 悪魔', tarotIndex: 110 },
        { mapId: 'major_03', mapLabel: '3. 女帝', tarotIndex: 110 },
        { mapId: 'wands', mapLabel: '火の国', tarotIndex: 110, nation: 'fire', label: '火の国', isCapital: true }
    ]
];

const WORLD_MAP_DEFAULT_LAYOUT = [
    'pentacles', EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, 'swords',
    EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID,
    EMPTY_MAP_ID, EMPTY_MAP_ID, 'major_00', EMPTY_MAP_ID, EMPTY_MAP_ID,
    EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID,
    'cups', EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, 'wands'
];
const WORLD_MAP_CELL_META = WORLD_MAP_GRID.flat().reduce((acc, cell) => {
    acc[cell.mapId] = { ...cell };
    return acc;
}, {});
WORLD_MAP_CELL_META[EMPTY_MAP_ID] = { ...EMPTY_CELL_META };
MAJOR_ARCANA.forEach((arcana) => {
    const mapId = `major_${String(arcana.number).padStart(2, '0')}`;
    const existing = WORLD_MAP_CELL_META[mapId] || { mapId };
    if (!existing.mapLabel) {
        existing.mapLabel = `${arcana.number}. ${arcana.name}`;
    }
    if (mapId === 'major_00' && !existing.label) {
        existing.label = existing.mapLabel;
    }
    existing.tarotIndex = 80 + arcana.number;
    WORLD_MAP_CELL_META[mapId] = existing;
});
const WORLD_MAP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, 21);
let worldMapLayoutCache = null;
let worldMapPlacementOpen = true;
let worldMapOccupationPrefetchPromise = null;
let worldMapPrefetchScheduled = false;

async function loadWorldMapLayout() {
    try {
        const res = await fetch('/api/get-world-map-layout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        if (!res.ok) throw new Error('Failed to fetch map layout');
        const data = await res.json();
        if (typeof data?.placementOpen === 'boolean') {
            worldMapPlacementOpen = data.placementOpen;
        } else {
            worldMapPlacementOpen = true;
        }
        const layout = Array.isArray(data?.layout) ? data.layout : null;
        if (layout && layout.length === WORLD_MAP_DEFAULT_LAYOUT.length) {
            worldMapLayoutCache = layout.slice();
            if (typeof window !== 'undefined') {
                window.__worldMapLayoutCache = worldMapLayoutCache.slice();
            }
            return worldMapLayoutCache;
        }
    } catch (error) {
        // ignore and fallback
    }
    worldMapPlacementOpen = true;
    worldMapLayoutCache = WORLD_MAP_DEFAULT_LAYOUT.slice();
    if (typeof window !== 'undefined') {
        window.__worldMapLayoutCache = worldMapLayoutCache.slice();
    }
    return worldMapLayoutCache;
}

function renderWorldMapGrid(layout = WORLD_MAP_DEFAULT_LAYOUT) {
    const container = document.getElementById('worldMapGrid');
    if (!container) return;
    if (typeof window !== 'undefined' && Array.isArray(layout) && layout.length === WORLD_MAP_DEFAULT_LAYOUT.length) {
        window.__worldMapLayoutCache = layout.slice();
    }
    container.innerHTML = '';
    let letterIndex = 0;
    layout.forEach((mapId, index) => {
        const cellData = WORLD_MAP_CELL_META[mapId] || { mapId };
        const cell = document.createElement('div');
        cell.className = 'world-map-modal-cell';
        if (cellData.isCapital) cell.classList.add('is-capital');
        if (cellData.isWorld) cell.classList.add('is-world');
        if (cellData.mapId === EMPTY_MAP_ID) cell.classList.add('is-empty');
        if (cellData.mapId) cell.dataset.mapId = cellData.mapId;
        if (cellData.mapLabel) cell.dataset.mapLabel = cellData.mapLabel;
        if (cellData.tarotIndex !== undefined) cell.dataset.tarotIndex = String(cellData.tarotIndex);
        if (cellData.nation) cell.dataset.nation = cellData.nation;
        cell.dataset.index = String(index);
        const isCorner = !!cellData.isCapital;
        if (!isCorner && letterIndex < WORLD_MAP_LETTERS.length) {
            cell.dataset.letter = WORLD_MAP_LETTERS[letterIndex];
            letterIndex += 1;
        }
        const labelText = cellData.label || '';
        if (labelText) {
            const label = document.createElement('span');
            label.className = 'world-map-modal-label';
            label.textContent = labelText;
            cell.appendChild(label);
        }
        container.appendChild(cell);
    });
}

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

const TAROT_SPRITE_SRC = 'Sprites/Buildings/tarot.png';
let tarotSpriteMetaPromise = null;
let tarotSpriteImage = null;

function prefetchWorldMapOccupationMap() {
    if (typeof window === 'undefined') return null;
    if (window.__worldMapOccupationMap) return Promise.resolve(window.__worldMapOccupationMap);
    if (worldMapOccupationPrefetchPromise) return worldMapOccupationPrefetchPromise;
    const layout = (worldMapLayoutCache && worldMapLayoutCache.length === WORLD_MAP_DEFAULT_LAYOUT.length)
        ? worldMapLayoutCache
        : WORLD_MAP_DEFAULT_LAYOUT;
    const mapIds = layout.filter(id => id && id !== EMPTY_MAP_ID);
    if (!mapIds.length) return Promise.resolve({});
    worldMapOccupationPrefetchPromise = fetch('/api/get-map-occupation-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapIds })
    })
        .then((res) => {
            if (!res.ok) throw new Error('Failed to get occupation map');
            return res.json();
        })
        .then((data) => {
            const map = data?.map || {};
            window.__worldMapOccupationMap = map;
            window.__worldMapOccupationFetchedAt = Date.now();
            return map;
        })
        .catch(() => ({}));
    return worldMapOccupationPrefetchPromise;
}

function loadTarotSpriteMeta() {
    if (tarotSpriteMetaPromise) return tarotSpriteMetaPromise;
    tarotSpriteMetaPromise = new Promise((resolve) => {
        const img = tarotSpriteImage || new Image();
        tarotSpriteImage = img;
        const resolveMeta = () => {
            const expectedWidth = 48 * 10;
            const expectedHeight = 80 * 12;
            const usesPadding = img.naturalWidth !== expectedWidth || img.naturalHeight !== expectedHeight;
            const tileWidth = usesPadding ? 48 : img.naturalWidth / 10;
            const tileHeight = usesPadding ? 80 : img.naturalHeight / 12;
            resolve({
                width: img.naturalWidth,
                height: img.naturalHeight,
                tileWidth,
                tileHeight
            });
        };
        if (img.complete && img.naturalWidth) {
            resolveMeta();
            return;
        }
        img.onload = resolveMeta;
        img.onerror = () => resolve(null);
        if (!img.src) {
            img.decoding = 'async';
            img.src = TAROT_SPRITE_SRC;
        }
    });
    if (typeof window !== 'undefined') {
        window.__tarotSpriteMetaPromise = tarotSpriteMetaPromise;
        window.__tarotSpriteImage = tarotSpriteImage;
    }
    return tarotSpriteMetaPromise;
}

function preloadTarotSprite() {
    if (tarotSpriteImage) return;
    tarotSpriteImage = new Image();
    tarotSpriteImage.decoding = 'async';
    tarotSpriteImage.src = TAROT_SPRITE_SRC;
    if (typeof window !== 'undefined') {
        window.__tarotSpriteImage = tarotSpriteImage;
    }
}

export function scheduleWorldMapPrefetch() {
    if (worldMapPrefetchScheduled || typeof document === 'undefined') return;
    worldMapPrefetchScheduled = true;
    const start = () => {
        const run = () => {
            renderWorldMapGrid();
            prefetchWorldMapOccupationMap();
            loadWorldMapLayout().then((layout) => {
                renderWorldMapGrid(layout);
                prefetchWorldMapOccupationMap();
            });
            preloadTarotSprite();
            loadTarotSpriteMeta();
        };
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => run());
        } else {
            setTimeout(run, 50);
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
}

if (typeof window !== 'undefined') {
    window.scheduleWorldMapPrefetch = scheduleWorldMapPrefetch;
}

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

function showWorldMapSwapConfirm(message = '') {
    const modal = document.getElementById('worldMapSwapModal');
    const messageEl = document.getElementById('worldMapSwapMessage');
    const confirmBtn = document.getElementById('worldMapSwapConfirm');
    const cancelBtn = document.getElementById('worldMapSwapCancel');
    if (!modal || !messageEl || !confirmBtn || !cancelBtn) {
        return Promise.resolve(false);
    }
    messageEl.textContent = message || '配置を入れ替えますか？';
    modal.style.display = 'flex';
    return new Promise((resolve) => {
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        newConfirmBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            resolve(true);
        });
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        newCancelBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            resolve(false);
        });
    });
}

function showWorldMapModal(playerInfo) {
    const modal = document.getElementById('mapLoadingOverlay');
    if (!modal) return;
    const grid = modal.querySelector('#worldMapGrid');
    const statusEl = modal.querySelector('#mapLoadingStatus');
    const isKingUser = !!(NationKing?.isKing && NationKing.isKing());
    const fixedMapIds = new Set(['wands', 'swords', 'cups', 'pentacles']);
    let swapSelection = null;
    const swapErrorMessages = {
        NotKing: '王のみ入れ替えできます。',
        PlacementClosed: '配置変更の期間外です。',
        FixedMapCannotSwap: '本拠地マップは入れ替えできません。',
        NotOwnedByNation: '自国が占領している海域同士のみ入れ替えできます。',
        MapNotInLayout: '選択した海域がレイアウトに存在しません。',
        LayoutNotConfigured: '配置データが未設定です。',
        EmptySwapNotAllowed: '空きマス同士は入れ替えできません。',
        InvalidSwapIndex: '配置の位置情報が不正です。'
    };
    const escapeSelector = (value) => {
        if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
        return String(value).replace(/["\\]/g, '\\$&');
    };
    const getCellLabel = (mapId) => {
        if (!grid || !mapId) return String(mapId || '');
        if (mapId === EMPTY_MAP_ID) return '空きマス';
        const selector = `[data-map-id="${escapeSelector(mapId)}"]`;
        const cell = grid.querySelector(selector);
        return cell?.dataset?.mapLabel || cell?.textContent || String(mapId);
    };
    const applyTarotIndex = (cell, tarotIndex, spriteMeta) => {
        if (!Number.isFinite(tarotIndex) || tarotIndex < 0) return;
        const col = tarotIndex % 10;
        const row = Math.floor(tarotIndex / 10);
        const tileWidth = spriteMeta?.tileWidth || 48;
        const tileHeight = spriteMeta?.tileHeight || 80;
        const image = (typeof window !== 'undefined' && window.__tarotSpriteImage) ? window.__tarotSpriteImage : null;
        const sheetWidth = spriteMeta?.width || image?.naturalWidth || tileWidth * 10;
        const sheetHeight = spriteMeta?.height || image?.naturalHeight || tileHeight * 12;
        cell.style.setProperty('--tarot-sheet-w', `${sheetWidth}px`);
        cell.style.setProperty('--tarot-sheet-h', `${sheetHeight}px`);
        cell.style.setProperty('--tarot-tile-w', `${tileWidth}px`);
        cell.style.setProperty('--tarot-tile-h', `${tileHeight}px`);
        cell.style.setProperty('--tarot-x', `${col * tileWidth}px`);
        cell.style.setProperty('--tarot-y', `${row * tileHeight}px`);
        cell.classList.add('has-tarot');
    };
    const applyNationLevels = (levels, spriteMeta) => {
        const cells = modal.querySelectorAll('.world-map-modal-cell');
        const baseByNation = { fire: 0, earth: 20, water: 40, wind: 60 };
        const clampLevel = (value) => {
            const num = Math.floor(Number(value) || 1);
            return Math.max(1, Math.min(14, num));
        };
        cells.forEach((cell) => {
            const nation = String(cell.dataset.nation || '').trim();
            if (nation && baseByNation[nation] !== undefined) {
                const levelRaw = levels?.[nation]?.nationLevel ?? levels?.[nation]?.level ?? 1;
                const level = clampLevel(levelRaw);
                applyTarotIndex(cell, baseByNation[nation] + (level - 1), spriteMeta);
                return;
            }
            const tarotIndexRaw = cell.dataset.tarotIndex;
            if (tarotIndexRaw) {
                applyTarotIndex(cell, Number(tarotIndexRaw), spriteMeta);
            }
        });
    };
    if (grid) {
        grid.querySelectorAll('.world-map-modal-cell').forEach(el => el.classList.remove('is-selected'));
    }
    const applyOccupationColors = (cells) => {
        const nationClassByKey = {
            fire: 'is-occupied-fire',
            water: 'is-occupied-water',
            earth: 'is-occupied-earth',
            wind: 'is-occupied-wind',
            neutral: 'is-occupied-neutral'
        };
        cells.forEach((cell) => {
            Object.values(nationClassByKey).forEach(cls => cell.classList.remove(cls));
        });
        const mapIds = [];
        const fallbackByMapId = {};
        cells.forEach((cell) => {
            const mapId = cell.dataset.mapId;
            if (!mapId) return;
            if (mapId === EMPTY_MAP_ID) {
                cell.classList.add(nationClassByKey.neutral);
                return;
            }
            mapIds.push(mapId);
            fallbackByMapId[mapId] = String(cell.dataset.nation || '').toLowerCase();
        });
        const applyFromMap = (occupationMap) => {
            cells.forEach((cell) => {
                const mapId = cell.dataset.mapId;
                if (!mapId || mapId === EMPTY_MAP_ID) return;
                const fallback = fallbackByMapId[mapId] || '';
                const nationKey = String(occupationMap?.[mapId] || fallback || '').toLowerCase() || 'neutral';
                const cls = nationClassByKey[nationKey] || nationClassByKey.neutral;
                cell.classList.add(cls);
            });
        };
        const now = Date.now();
        const cached = window.__worldMapOccupationMap;
        const cachedAt = Number(window.__worldMapOccupationFetchedAt || 0);
        const cacheFresh = cached && cachedAt && now - cachedAt < 60000;
        if (cacheFresh) {
            applyFromMap(cached);
            return Promise.resolve();
        }
        if (!mapIds.length) return Promise.resolve();
        return fetch('/api/get-map-occupation-map', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mapIds })
        })
            .then((res) => {
                if (!res.ok) throw new Error('Failed to get occupation map');
                return res.json();
            })
            .then((data) => {
                const map = data?.map || {};
                window.__worldMapOccupationMap = map;
                window.__worldMapOccupationFetchedAt = Date.now();
                applyFromMap(map);
            })
            .catch(() => {
                applyFromMap(null);
            });
    };
    const highlightCurrentCell = (cells) => {
        const mapId = String(window.__currentMapId || '');
        const mapLabel = String(window.__currentMapLabel || '');
        let matched = false;
        let matchedCell = null;
        cells.forEach((cell) => cell.classList.remove('is-current'));
        if (mapId) {
            cells.forEach((cell) => {
                if (matched) return;
                if (cell.dataset.mapId && cell.dataset.mapId === mapId) {
                    cell.classList.add('is-current');
                    matched = true;
                    matchedCell = cell;
                }
            });
        }
        if (matched) return;
        if (mapId) {
            const emptyCellIdMatch = mapId.match(/^empty_cell_(\d{1,2})$/);
            if (emptyCellIdMatch) {
                const targetIndex = Number(emptyCellIdMatch[1]);
                cells.forEach((cell) => {
                    if (matched) return;
                    const idx = Number(cell.dataset.index);
                    if (Number.isInteger(idx) && idx === targetIndex) {
                        cell.classList.add('is-current');
                        matched = true;
                        matchedCell = cell;
                    }
                });
            }
        }
        if (matched) return;
        if (mapLabel) {
            const seaLabelMatch = mapLabel.match(/^未開拓海域\s+([A-Z])$/);
            if (seaLabelMatch) {
                const targetLetter = seaLabelMatch[1].toUpperCase();
                cells.forEach((cell) => {
                    if (matched) return;
                    if (String(cell.dataset.letter || '').toUpperCase() === targetLetter) {
                        cell.classList.add('is-current');
                        matched = true;
                        matchedCell = cell;
                    }
                });
            }
        }
        if (matched) return;
        if (mapLabel) {
            const majorMatch = mapId.match(/major_(\d{2})/);
            const majorNumber = majorMatch ? Number(majorMatch[1]) : null;
            cells.forEach((cell) => {
                if (matched) return;
                const labelKey = String(cell.dataset.mapLabel || '').trim();
                if (!labelKey) return;
                if (mapLabel.includes(labelKey)) {
                    cell.classList.add('is-current');
                    matched = true;
                    matchedCell = cell;
                    return;
                }
                if (!matched && Number.isFinite(majorNumber)) {
                    const numMatch = labelKey.match(/^(\d+)\./);
                    if (numMatch && Number(numMatch[1]) === majorNumber) {
                        cell.classList.add('is-current');
                        matched = true;
                        matchedCell = cell;
                    }
                }
            });
        }
        return matchedCell;
    };
    const setZoomOrigin = (worldEl, targetCell) => {
        if (!worldEl) return;
        if (!targetCell) {
            worldEl.style.transformOrigin = '50% 50%';
            return;
        }
        const worldRect = worldEl.getBoundingClientRect();
        const cellRect = targetCell.getBoundingClientRect();
        if (!worldRect.width || !worldRect.height) {
            worldEl.style.transformOrigin = '50% 50%';
            return;
        }
        const centerX = cellRect.left + cellRect.width / 2 - worldRect.left;
        const centerY = cellRect.top + cellRect.height / 2 - worldRect.top;
        const originX = Math.max(0, Math.min(100, (centerX / worldRect.width) * 100));
        const originY = Math.max(0, Math.min(100, (centerY / worldRect.height) * 100));
        worldEl.style.transformOrigin = `${originX}% ${originY}%`;
    };
    if (!modal.dataset.bound) {
        modal.dataset.bound = 'true';
        const closeModal = () => {
            modal.classList.remove('is-modal');
            modal.style.opacity = '';
            modal.style.pointerEvents = '';
            const mapContainer = document.getElementById('tabContentMap');
            if (mapContainer?.classList.contains('map-ready')) {
                modal.style.display = 'none';
            }
            document.body.classList.remove('modal-lock');
        };
        const closeBtn = document.getElementById('mapLoadingClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal();
            }
        });
        if (grid && !grid.dataset.swapBound) {
            grid.dataset.swapBound = 'true';
            grid.addEventListener('click', async (event) => {
                if (!modal.classList.contains('is-modal')) return;
                if (!isKingUser) {
                    if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
                        window.showRpgMessage('王のみ配置を入れ替えできます。');
                    }
                    return;
                }
                if (!worldMapPlacementOpen) {
                    if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
                        window.showRpgMessage('配置変更の期間外です。');
                    }
                    return;
                }
                const cell = event.target.closest('.world-map-modal-cell');
                if (!cell) return;
                const mapId = cell.dataset.mapId;
                if (!mapId) return;
                const mapIndex = Number(cell.dataset.index);
                if (!Number.isFinite(mapIndex)) {
                    if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
                        window.showRpgMessage('配置の位置情報が不正です。');
                    }
                    return;
                }
                if (fixedMapIds.has(mapId)) {
                    if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
                        window.showRpgMessage('本拠地マップは入れ替えできません。');
                    }
                    return;
                }
                if (!swapSelection) {
                    swapSelection = { mapId, index: mapIndex };
                    grid.querySelectorAll('.world-map-modal-cell').forEach(el => el.classList.remove('is-selected'));
                    cell.classList.add('is-selected');
                    return;
                }
                if (swapSelection?.index === mapIndex) {
                    swapSelection = null;
                    cell.classList.remove('is-selected');
                    return;
                }
                const fromMapId = swapSelection.mapId;
                const fromIndex = swapSelection.index;
                const toMapId = mapId;
                const toIndex = mapIndex;
                swapSelection = null;
                grid.querySelectorAll('.world-map-modal-cell').forEach(el => el.classList.remove('is-selected'));
                if (fromMapId === EMPTY_MAP_ID && toMapId === EMPTY_MAP_ID) {
                    if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
                        window.showRpgMessage('空きマス同士は入れ替えできません。');
                    }
                    return;
                }
                try {
                    const fromLabel = getCellLabel(fromMapId);
                    const toLabel = getCellLabel(toMapId);
                    const confirmed = await showWorldMapSwapConfirm(`${fromLabel} と ${toLabel} を入れ替えます。よろしいですか？`);
                    if (!confirmed) return;
                    const res = await fetch('/api/swap-world-map-cells', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            playFabId: playerInfo?.playFabId || null,
                            fromMapId,
                            toMapId,
                            fromIndex,
                            toIndex
                        })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        const errorCode = data?.error;
                        const message = swapErrorMessages[errorCode] || data?.message || '入れ替えに失敗しました。';
                        throw new Error(message);
                    }
                    const layout = Array.isArray(data?.layout) ? data.layout : null;
                    if (layout && layout.length === WORLD_MAP_DEFAULT_LAYOUT.length) {
                        worldMapLayoutCache = layout.slice();
                        renderWorldMapGrid(worldMapLayoutCache);
                    }
                    showWorldMapModal(playerInfo);
                } catch (error) {
                    if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
                        window.showRpgMessage(error?.message || '入れ替えに失敗しました。');
                    }
                }
            });
        }
        modal.dataset.closeHandler = 'true';
    }
    document.body.classList.add('modal-lock');
    modal.classList.add('is-modal');
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';
    const world = modal.querySelector('.map-loading-world');
    if (world) {
        world.classList.remove('is-animating');
        world.style.transform = 'scale(1)';
        world.style.opacity = '1';
    }
    const getLayoutKey = (layout) => (Array.isArray(layout) ? layout.join('|') : '');
    const renderLayoutIfNeeded = (layout) => {
        if (!grid) return;
        const key = getLayoutKey(layout);
        if (grid.dataset.layoutKey === key) return;
        renderWorldMapGrid(layout);
        grid.dataset.layoutKey = key;
    };
    const refreshGrid = () => {
        const layout = worldMapLayoutCache && worldMapLayoutCache.length === WORLD_MAP_DEFAULT_LAYOUT.length
            ? worldMapLayoutCache
            : WORLD_MAP_DEFAULT_LAYOUT;
        renderLayoutIfNeeded(layout);
    };
    if (grid) {
        grid.style.visibility = '';
    }
    if (statusEl) {
        statusEl.classList.add('is-hidden');
    }
    refreshGrid();
    loadWorldMapLayout().then((layout) => {
        renderLayoutIfNeeded(layout);
    }).finally(() => {
        loadTarotSpriteMeta().then((spriteMeta) => {
            const cells = modal.querySelectorAll('.world-map-modal-cell');
            const world = modal.querySelector('.map-loading-world');
            if (spriteMeta) {
                applyNationLevels(null, spriteMeta);
            }
            fetch('/api/get-nation-levels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            })
                .then((response) => {
                    if (!response.ok) throw new Error('Failed to fetch levels');
                    return response.json();
                })
                .then((data) => applyNationLevels(data?.levels || {}, spriteMeta))
                .catch(() => applyNationLevels(null, spriteMeta))
                .finally(() => {
                    applyOccupationColors(cells).finally(() => {
                        const currentCell = highlightCurrentCell(cells);
                        setZoomOrigin(world, currentCell);
                        if (grid) grid.style.visibility = '';
                        if (statusEl) statusEl.classList.add('is-hidden');
                        modal.dataset.worldMapReady = 'true';
                    });
                });
        });
    });
}

let gameInstance = null;
let launchGameFn = null;
const tabLoaded = { home: false, troy: false, companions: false, tarot: false, ships: false, battle: false, map: false, islands: false, qr: false, inventory: false, ranking: false, king: false };
const audioAvailabilityCache = new Map();
const audioAvailabilityInFlight = new Set();
let bottomNavRevealed = false;

function revealBottomNavAfterHomeReady() {
    if (bottomNavRevealed) return;
    bottomNavRevealed = true;
    const body = document.body;
    if (body) {
        body.classList.add('tabs-ready');
    }
    const nav = document.getElementById('bottomNav');
    if (nav) {
        nav.setAttribute('aria-hidden', 'false');
    }
}

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

function updateHomeAvatarSeaTone() {
    if (typeof document === 'undefined') return;
    const hour = new Date().getHours();
    const tone = hour % 2 === 1 ? 'day' : 'night';
    if (document.body) {
        document.body.dataset.seaTone = tone;
    }
    const heroCard = document.querySelector('.home-hero-card');
    if (heroCard) {
        heroCard.dataset.seaTone = tone;
    }
    const shipStage = document.getElementById('homeShipStage');
    if (shipStage) {
        shipStage.dataset.seaTone = tone;
    }
    const avatar = document.getElementById('home-avatar');
    if (avatar) {
        avatar.removeAttribute('data-sea-tone');
    }
}

export async function showTab(tabId, playerInfo, options = {}) {
    console.log('[showTab] Called with tabId:', tabId, 'playerInfo:', playerInfo);
    const currentActiveTab = document.querySelector('.nav-button.active');
    const currentTabId = document.body?.dataset.currentTab || null;
    const mapLoadLabel = null;
    const homeExplorationPanel = document.getElementById('shipExplorationPanel');
    if (tabId !== 'home'
        && homeExplorationPanel
        && !homeExplorationPanel.hidden
        && homeExplorationPanel.classList.contains('is-popup')
        && typeof window.closeHomeExplorationPopup === 'function') {
        window.closeHomeExplorationPopup();
    }

    const mapSelectOptions = {
        skipMapSelect: !!options.skipMapSelect,
        mapId: options.mapId || null,
        mapLabel: options.mapLabel || null,
        entrySide: options.entrySide || null
    };
    if (tabId === 'map' && mapSelectOptions.mapId) {
        const prevMapId = window.__currentMapId;
        if (prevMapId && prevMapId !== mapSelectOptions.mapId) {
            window.__pendingMapSpawn = {
                mapId: mapSelectOptions.mapId,
                side: mapSelectOptions.entrySide || getEntrySideForNation(playerInfo?.nation)
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
    if (tabId === 'map') {
        scheduleWorldMapPrefetch();
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
        if (currentTabId === 'map') {
            showWorldMapModal(playerInfo);
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
            const data = await getNationAnnouncements(playerInfo.playFabId, { isSilent: true });
            const msg = Array.isArray(data?.announcements)
                ? data.announcements.map((entry) => String(entry?.message || '').trim()).filter(Boolean)[0]
                : '';
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

    if (tabId === 'king') {
        if (!playerInfo?.playFabId) {
            console.warn('[showTab] king tab requires playFabId');
            return;
        }
        if (!NationKing.isKing()) {
            console.warn('[showTab] king tab is not allowed for this user');
            await showTab('home', playerInfo, { skipMapSelect: true });
            return;
        }
    }

    // 船タブから離れる場合はリスナーをクリーンアップ
    if (currentActiveTab && currentActiveTab.id === 'navShips' && tabId !== 'ships') {
        console.log('[showTab] Leaving ships tab, cleaning up listeners');
        Ship.cleanupShipListeners();
        tabLoaded.ships = false;
    }

    if (currentActiveTab && currentActiveTab.id === 'navTarot' && tabId !== 'tarot') {
        console.log('[showTab] Leaving tarot tab, destroying tarot games');
        try {
            if (tarotPokerLoaded) {
                const Tarot = await ensureTarotModule();
                if (typeof Tarot.destroyTarotPokerPage === 'function') {
                    Tarot.destroyTarotPokerPage();
                }
                tarotPokerLoaded = false;
            }
            if (tarotKingdomLoaded) {
                const Kingdom = await ensureTarotKingdomModule();
                if (typeof Kingdom.destroyTarotKingdomPage === 'function') {
                    Kingdom.destroyTarotKingdomPage();
                }
                tarotKingdomLoaded = false;
            }
            if (tarotSpinLoaded) {
                const SpinTarot = await ensureSpinTarotModule();
                if (typeof SpinTarot.destroySpinTarotPage === 'function') {
                    SpinTarot.destroySpinTarotPage();
                }
                tarotSpinLoaded = false;
            }
        } catch (error) {
            console.warn('[showTab] Failed to destroy tarot modules:', error);
        }
        currentTarotMode = 'poker';
        showTarotModeSelection();
        tabLoaded.tarot = false;
    }

    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-button').forEach(el => el.classList.remove('active'));

    const contentEl = document.getElementById(`tabContent${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
    if (contentEl) contentEl.style.display = 'block';

    const navProxyMap = {
        islands: 'map',
        qr: 'home'
    };
    const navTargetId = navProxyMap[tabId] || tabId;
    const navEl = document.getElementById(`nav${navTargetId.charAt(0).toUpperCase() + navTargetId.slice(1)}`);
    if (navEl) navEl.classList.add('active');
    if (document.body) {
        document.body.dataset.currentTab = tabId;
    }
    if (typeof window !== 'undefined' && tabId === 'map') {
        window.dispatchEvent(new CustomEvent('tab:map-visible', {
            detail: { tabId, playerInfo, options }
        }));
    }
    if (tabId !== 'map') {
        window.scrollTo({ top: 0, behavior: 'auto' });
    }

    try {
        if (!tabLoaded[tabId]) {
            console.log(`Loading data for tab: ${tabId}`);
            switch (tabId) {
                case 'home':
                    await Promise.allSettled([
                        Player.getPoints(playerInfo.playFabId),
                        Player.getPlayerStats(playerInfo.playFabId),
                        Inventory.refreshResourceSummary(playerInfo.playFabId),
                        Ship.loadPlayerShipProfile(playerInfo.playFabId),
                        Ship.loadExplorationPanel(playerInfo.playFabId)
                    ]);
                    break;
                case 'troy':
                    {
                        const Troy = await ensureTroyModule();
                        await Troy.loadTroyPage(playerInfo.playFabId);
                    }
                    break;
                case 'companions':
                    {
                        const Companions = await ensureCompanionModule();
                        await Companions.loadCompanionsPage(playerInfo.playFabId);
                    }
                    break;
                case 'tarot':
                    {
                        await prepareTarotTab();
                    }
                    break;
                case 'ships':
                    if (!playerInfo || !playerInfo.playFabId) {
                        console.warn('[showTab] ships tab requires playFabId');
                        break;
                    }
                    if (typeof window.ensureShipCatalogLoaded === 'function') {
                        await window.ensureShipCatalogLoaded();
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
                    await Player.loadRankingTab();
                    break;
                case 'king':
                    await NationKing.loadKingPage(playerInfo.playFabId, { useCache: true });
                    break;
                case 'qr':
                    await Player.getPoints(playerInfo.playFabId);
                    await Inventory.refreshResourceSummary(playerInfo.playFabId);
                    break;
                case 'battle':
                    window.dispatchEvent(new CustomEvent('tab:battle-visible', { detail: { playerInfo } }));
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
                    if (typeof window.ensureBuildingMetaLoaded === 'function') {
                        await window.ensureBuildingMetaLoaded();
                    }
                    if (typeof window.ensureShipCatalogLoaded === 'function') {
                        await window.ensureShipCatalogLoaded();
                    }
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
                        Object.defineProperty(window, 'gameInstance', {
                            configurable: true,
                            get: () => gameInstance
                        });
                    }
                    break;
                }
            }
            tabLoaded[tabId] = true;
        } else if (tabId === 'troy') {
            const Troy = await ensureTroyModule();
            await Troy.loadTroyPage(playerInfo.playFabId);
        } else if (tabId === 'companions') {
            const Companions = await ensureCompanionModule();
            await Companions.loadCompanionsPage(playerInfo.playFabId);
        }

        if (tabId === 'home') {
            await loadHomeAnnouncements(playerInfo.playFabId);
            updateHomeAvatarSeaTone();
            revealBottomNavAfterHomeReady();
        }

        if (tabId === 'tarot') {
            bindTarotModeSwitch();
            showTarotModeSelection();
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
        if (tabId === 'home' && typeof window.refreshHomeExplorationButtonLabel === 'function') {
            void window.refreshHomeExplorationButtonLabel(playerInfo.playFabId);
        }
    } catch (error) {
        console.error(`Failed to load data for tab ${tabId}:`, error);
    }
    // no-op
}

export function showConfirmationModal(amount, receiverId, receiverName, onConfirm) {
    playSound('audioCoin');
    document.getElementById('modalAmount').innerText = `${amount}G`;
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

export function showMapTransitionModal(options = [], onSelect = () => {}) {
    const modal = document.getElementById('mapTransitionModal');
    const list = document.getElementById('mapTransitionOptions');
    const cancelBtn = document.getElementById('mapTransitionCancel');
    if (!modal || !list || !cancelBtn) return;
    list.innerHTML = '';
    const entries = Array.isArray(options) ? options : [];
    if (entries.length === 0) return;
    entries.forEach((entry) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const label = entry.label || entry.mapLabel || entry.mapId || '移動';
        btn.textContent = label;
        btn.addEventListener('click', () => {
            modal.style.display = 'none';
            document.body.classList.remove('modal-lock');
            onSelect(entry);
        });
        list.appendChild(btn);
    });
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        document.body.classList.remove('modal-lock');
        onSelect(null);
    });
    modal.style.display = 'flex';
    document.body.classList.add('modal-lock');
}

if (typeof window !== 'undefined') {
    window.showMapTransitionModal = showMapTransitionModal;
}
