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

export async function loadOwnedIslands(playFabId) {
    const container = document.getElementById('islandListContainer');
    if (!container) return;
    container.innerHTML = '<div style="font-size:12px; color: var(--text-sub);">読み込み中...</div>';

    const data = await callApiWithLoader('/api/get-owned-islands', { playFabId });
    if (!data || !Array.isArray(data.islands)) {
        container.innerHTML = '<div style="font-size:12px; color: var(--text-sub);">取得に失敗しました。</div>';
        return;
    }
    if (data.islands.length === 0) {
        container.innerHTML = '<div style="font-size:12px; color: var(--text-sub);">所有している島がありません。</div>';
        return;
    }

    const rows = data.islands.map((island) => {
        const id = escapeHtml(island.id);
        const name = escapeHtml(island.name || '名称未設定');
        const size = escapeHtml(island.size || '-');
        const biome = escapeHtml(formatBiome(island.biome));
        const coord = escapeHtml(formatCoord(island.coordinate));
        const building = escapeHtml(getActiveBuildingName(island));
        return `
            <div class="island-row" data-island-id="${id}" style="background: rgba(0,0,0,0.25); padding: 10px; border-radius: 8px; margin-bottom: 10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                    <div style="font-weight:700;">${name}</div>
                    <button class="btn-island-focus" data-island-id="${id}" style="background: var(--accent-color); padding: 6px 10px; border-radius: 6px; border: none; color: #fff; font-size: 12px;">地図で開く</button>
                </div>
                <div style="font-size:12px; color: var(--text-sub); margin-top: 6px;">位置: ${coord} / サイズ: ${size}</div>
                <div style="font-size:12px; color: var(--text-sub); margin-top: 2px;">バイオーム: ${biome} / 建物: ${building}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = rows;

    container.querySelectorAll('.btn-island-focus').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const islandId = btn.getAttribute('data-island-id');
            if (!islandId) return;
            await window.showTab('map');
            const scene = getScene();
            if (scene && typeof scene.focusIslandById === 'function') {
                scene.focusIslandById(islandId);
            }
        });
    });
}
