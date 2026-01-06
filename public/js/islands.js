// c:/Users/ikeda/my-liff-app/public/js/islands.js
import { callApiWithLoader } from './api.js';

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (match) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[match]);
}

function formatCoord(coord) {
    if (!coord || !Number.isFinite(coord.x) || !Number.isFinite(coord.y)) return '-';
    return `${coord.x}, ${coord.y}`;
}

function formatBiome(biome) {
    if (!biome) return '-';
    return String(biome);
}

function getActiveBuildingName(island) {
    const buildings = Array.isArray(island?.buildings) ? island.buildings : [];
    const active = buildings.find(b => b && b.status !== 'demolished') || null;
    const name = active?.displayName || active?.buildingName || active?.buildingId || '';
    return name || '-';
}

function getScene() {
    const game = window.gameInstance;
    if (!game || !game.scene) return null;
    return game.scene.getScene('WorldMapScene');
}

let _ownedIslands = [];

function getDistanceToIsland(scene, island) {
    if (!scene || !scene.playerShip) return Number.POSITIVE_INFINITY;
    if (island?.mapId && window.__currentMapId && island.mapId !== window.__currentMapId) {
        return Number.POSITIVE_INFINITY;
    }
    const coord = island?.coordinate;
    if (!coord || !Number.isFinite(coord.x) || !Number.isFinite(coord.y)) return Number.POSITIVE_INFINITY;
    const centerX = (coord.x + 0.5) * 32;
    const centerY = (coord.y + 0.5) * 32;
    const dx = scene.playerShip.x - centerX;
    const dy = scene.playerShip.y - centerY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getPlayerInfoFallback() {
    const avatar = window.myAvatarBaseInfo || {};
    return {
        playFabId: window.myPlayFabId || null,
        race: avatar.Race || avatar.race || null,
        nation: avatar.Nation || avatar.nation || null
    };
}

function sortIslands(list, sortKey) {
    const scene = getScene();
    const copied = list.slice();
    if (sortKey === 'name') {
        copied.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja'));
        return copied;
    }
    if (sortKey === 'level') {
        copied.sort((a, b) => {
            const la = Number(a.islandLevel || 0);
            const lb = Number(b.islandLevel || 0);
            return lb - la;
        });
        return copied;
    }
    copied.sort((a, b) => getDistanceToIsland(scene, a) - getDistanceToIsland(scene, b));
    return copied;
}

function renderIslands(list) {
    const container = document.getElementById('islandListContainer');
    if (!container) return;
    if (!list || list.length === 0) {
        container.innerHTML = '<div style="font-size:12px; color: var(--text-sub);">所有している島がありません。</div>';
        return;
    }

    const rows = list.map((island) => {
        const id = escapeHtml(island.id);
        const name = escapeHtml(island.name || '名称未設定');
        const size = escapeHtml(island.size || '-');
        const biome = escapeHtml(formatBiome(island.biome));
        const coord = escapeHtml(formatCoord(island.coordinate));
        const building = escapeHtml(getActiveBuildingName(island));
        const level = escapeHtml(island.islandLevel || '-');
        return `
            <div class="island-row" data-island-id="${id}" style="background: rgba(0,0,0,0.25); padding: 10px; border-radius: 8px; margin-bottom: 10px; cursor: pointer;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                    <div style="font-weight:700;">${name}</div>
                    <div style="display:flex; gap:6px;">
                        <button class="btn-island-focus" data-island-id="${id}" style="background: var(--accent-color); padding: 6px 10px; border-radius: 6px; border: none; color: #fff; font-size: 12px;">地図で開く</button>
                        <button class="btn-island-nav" data-island-id="${id}" style="background: #0ea5e9; padding: 6px 10px; border-radius: 6px; border: none; color: #fff; font-size: 12px;">ナビ</button>
                    </div>
                </div>
                <div style="font-size:12px; color: var(--text-sub); margin-top: 6px;">位置: ${coord} / サイズ: ${size} / Lv: ${level}</div>
                <div style="font-size:12px; color: var(--text-sub); margin-top: 2px;">バイオーム: ${biome} / 建物: ${building}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = rows;

    container.querySelectorAll('.island-row').forEach((row) => {
        row.addEventListener('click', async (event) => {
            if (event.target && event.target.classList.contains('btn-island-focus')) return;
            const islandId = row.getAttribute('data-island-id');
            if (!islandId) return;
            const island = _ownedIslands.find(entry => entry.id === islandId);
            const mapId = island?.mapId || null;
            const playerInfo = window.__phaserPlayerInfo || getPlayerInfoFallback();
            if (mapId && window.__currentMapId !== mapId) {
                await window.showTab('map', playerInfo, { skipMapSelect: true, mapId, mapLabel: mapId });
            } else {
                await window.showTab('map', playerInfo);
            }
            const scene = getScene();
            if (scene && typeof scene.focusIslandById === 'function') {
                scene.focusIslandById(islandId);
            }
            if (scene && typeof scene.openBuildingMenuById === 'function') {
                scene.openBuildingMenuById(islandId);
            }
        });
    });

    container.querySelectorAll('.btn-island-focus').forEach((btn) => {
        btn.addEventListener('click', async (event) => {
            event.stopPropagation();
            const islandId = btn.getAttribute('data-island-id');
            if (!islandId) return;
            const island = _ownedIslands.find(entry => entry.id === islandId);
            const mapId = island?.mapId || null;
            const playerInfo = window.__phaserPlayerInfo || getPlayerInfoFallback();
            if (mapId && window.__currentMapId !== mapId) {
                await window.showTab('map', playerInfo, { skipMapSelect: true, mapId, mapLabel: mapId });
            } else {
                await window.showTab('map', playerInfo);
            }
            const scene = getScene();
            if (scene && typeof scene.focusIslandById === 'function') {
                scene.focusIslandById(islandId);
            }
            if (scene && typeof scene.openBuildingMenuById === 'function') {
                scene.openBuildingMenuById(islandId);
            }
        });
    });

    container.querySelectorAll('.btn-island-nav').forEach((btn) => {
        btn.addEventListener('click', async (event) => {
            event.stopPropagation();
            const islandId = btn.getAttribute('data-island-id');
            if (!islandId) return;
            const island = _ownedIslands.find(entry => entry.id === islandId);
            const mapId = island?.mapId || null;
            const playerInfo = window.__phaserPlayerInfo || getPlayerInfoFallback();
            if (mapId && window.__currentMapId !== mapId) {
                await window.showTab('map', playerInfo, { skipMapSelect: true, mapId, mapLabel: mapId });
            } else {
                await window.showTab('map', playerInfo);
            }
            const scene = getScene();
            if (scene && typeof scene.setNavigationTarget === 'function') {
                scene.setNavigationTarget(islandId);
            }
        });
    });
}

export async function loadOwnedIslands(playFabId) {
    const container = document.getElementById('islandListContainer');
    if (!container) return;
    container.innerHTML = '<div style="font-size:12px; color: var(--text-sub);">読み込み中...</div>';

    const data = await callApiWithLoader('/api/get-owned-islands', { playFabId });
    if (!data || !Array.isArray(data.islands)) {
        container.innerHTML = '<div style="font-size:12px; color: var(--text-sub);">取得に失敗しました。</div>';
        return;
    }
    _ownedIslands = data.islands.slice();
    const select = document.getElementById('islandSortSelect');
    const sortKey = select ? String(select.value || 'distance') : 'distance';
    renderIslands(sortIslands(_ownedIslands, sortKey));

    if (select && !select.dataset.wired) {
        select.dataset.wired = '1';
        select.addEventListener('change', () => {
            const key = String(select.value || 'distance');
            renderIslands(sortIslands(_ownedIslands, key));
        });
    }
}
