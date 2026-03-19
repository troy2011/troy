import { renderAvatar } from './avatar.js';
import { getNationLabel } from './nationLabels.js';
import { getPublicPlayerProfile } from './playfabClient.js';

let playerProfileInstalled = false;
let activeProfileRequestToken = 0;

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (match) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[match]);
}

function getPlayerProfileModalElements() {
    return {
        modal: document.getElementById('playerProfileModal'),
        name: document.getElementById('playerProfileName'),
        nation: document.getElementById('playerProfileNation'),
        meta: document.getElementById('playerProfileMeta'),
        equipment: document.getElementById('playerProfileEquipment'),
        close: document.getElementById('btnClosePlayerProfile')
    };
}

function syncModalLockState() {
    if (typeof document === 'undefined') return;
    const hasVisibleModal = Array.from(document.querySelectorAll('.modal-overlay')).some((modal) => {
        if (!modal) return false;
        const display = String(modal.style?.display || '').trim().toLowerCase();
        return display === 'flex' || modal.classList.contains('active');
    });
    document.body.classList.toggle('modal-lock', hasVisibleModal);
}

function showModal(modal) {
    if (!modal) return;
    modal.style.display = 'flex';
    syncModalLockState();
}

export function closePlayerProfileModal() {
    const { modal } = getPlayerProfileModalElements();
    if (!modal) return;
    modal.style.display = 'none';
    syncModalLockState();
}

function bindModalEvents() {
    const { modal, close } = getPlayerProfileModalElements();
    if (close && !close.dataset.profileBound) {
        close.dataset.profileBound = 'true';
        close.addEventListener('click', () => closePlayerProfileModal());
    }
    if (modal && !modal.dataset.profileBound) {
        modal.dataset.profileBound = 'true';
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closePlayerProfileModal();
        });
    }
}

function renderEquipmentRows(rows = []) {
    const { equipment } = getPlayerProfileModalElements();
    if (!equipment) return;
    if (!Array.isArray(rows) || rows.length <= 0) {
        equipment.innerHTML = '<div class="player-profile-empty">公開できる装備情報がありません。</div>';
        return;
    }
    equipment.innerHTML = rows.map((row) => `
        <div class="player-profile-equip-row">
            <span>${escapeHtml(row?.label || '')}</span>
            <strong>${escapeHtml(row?.name || '未装備')}</strong>
        </div>
    `).join('');
}

function renderProfile(profile = {}) {
    const { name, nation, meta } = getPlayerProfileModalElements();
    if (name) name.textContent = String(profile.displayName || profile.playFabId || 'Player');
    if (nation) {
        const nationKey = String(profile.nation || '').trim().toLowerCase();
        nation.textContent = nationKey ? `所属: ${getNationLabel(nationKey) || nationKey}` : '所属: 不明';
    }
    if (meta) {
        meta.textContent = `ID: ${String(profile.playFabId || '').trim() || '-'}`;
    }
    renderEquipmentRows(Array.isArray(profile.equipmentList) ? profile.equipmentList : []);
    renderAvatar(
        'playerProfileAvatar',
        profile.avatarBase || {},
        profile.equipment || {},
        profile.itemSource || {},
        false
    );
}

function renderLoadingState(targetPlayFabId = '') {
    const { name, nation, meta, equipment } = getPlayerProfileModalElements();
    if (name) name.textContent = '読込中...';
    if (nation) nation.textContent = '';
    if (meta) meta.textContent = targetPlayFabId ? `ID: ${targetPlayFabId}` : '';
    if (equipment) {
        equipment.innerHTML = '<div class="player-profile-empty">プレイヤー情報を読み込んでいます。</div>';
    }
}

function renderErrorState(message) {
    const { nation, equipment } = getPlayerProfileModalElements();
    if (nation) nation.textContent = '';
    if (equipment) {
        equipment.innerHTML = `<div class="player-profile-empty">${escapeHtml(message || 'プレイヤー情報を取得できませんでした。')}</div>`;
    }
}

export async function openPlayerProfile(targetPlayFabId, options = {}) {
    const requesterPlayFabId = String(options.playFabId || window.myPlayFabId || '').trim();
    const targetId = String(targetPlayFabId || '').trim();
    if (!requesterPlayFabId || !targetId) return;
    bindModalEvents();
    const { modal } = getPlayerProfileModalElements();
    if (!modal) return;
    renderLoadingState(targetId);
    showModal(modal);
    const requestToken = ++activeProfileRequestToken;
    try {
        const data = await getPublicPlayerProfile(requesterPlayFabId, targetId, { isSilent: true });
        if (requestToken !== activeProfileRequestToken) return;
        if (!data?.profile) {
            renderErrorState(data?.error || 'プレイヤー情報を取得できませんでした。');
            return;
        }
        renderProfile(data.profile);
    } catch (error) {
        if (requestToken !== activeProfileRequestToken) return;
        renderErrorState(error?.message || 'プレイヤー情報を取得できませんでした。');
    }
}

export function decoratePlayerTriggerElement(element, playFabId, options = {}) {
    if (!element) return element;
    const targetId = String(playFabId || '').trim();
    if (options.label != null) {
        element.textContent = String(options.label || '');
    }
    if (!targetId) return element;
    element.dataset.playerPlayfabId = targetId;
    element.classList.add('player-link');
    if (options.className) {
        String(options.className).split(/\s+/).filter(Boolean).forEach((className) => element.classList.add(className));
    }
    if (!['BUTTON', 'A'].includes(String(element.tagName || '').toUpperCase())) {
        element.setAttribute('role', 'button');
        if (!element.hasAttribute('tabindex')) element.tabIndex = 0;
    }
    if (!element.getAttribute('title')) {
        element.setAttribute('title', 'プレイヤー情報を見る');
    }
    return element;
}

export function buildPlayerTriggerHtml(playFabId, label, options = {}) {
    const targetId = String(playFabId || '').trim();
    const text = escapeHtml(label || 'Player');
    if (!targetId) return `<span>${text}</span>`;
    const classes = ['player-link'];
    if (options.className) classes.push(...String(options.className).split(/\s+/).filter(Boolean));
    return `<button type="button" class="${escapeHtml(classes.join(' '))}" data-player-playfab-id="${escapeHtml(targetId)}" title="プレイヤー情報を見る">${text}</button>`;
}

export function installPlayerProfileInteractions() {
    if (playerProfileInstalled || typeof document === 'undefined') return;
    playerProfileInstalled = true;
    bindModalEvents();
    document.addEventListener('click', (event) => {
        const trigger = event.target?.closest?.('[data-player-playfab-id]');
        if (!trigger) return;
        event.preventDefault();
        void openPlayerProfile(trigger.dataset.playerPlayfabId);
    });
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const trigger = event.target?.closest?.('[data-player-playfab-id]');
        if (!trigger) return;
        event.preventDefault();
        void openPlayerProfile(trigger.dataset.playerPlayfabId);
    });
}

if (typeof window !== 'undefined') {
    window.openPlayerProfile = openPlayerProfile;
    window.decoratePlayerTriggerElement = decoratePlayerTriggerElement;
}
