import { renderAvatar } from './avatar.js';
import { getNationLabel } from './nationLabels.js';
import { transferPoints, getPublicPlayerProfile, allocateStatPoints } from './playfabClient.js';
import { createRequestId } from './api.js';
import { showRpgMessage } from './rpgMessages.js';

const FAVORITE_PLAYERS_STORAGE_PREFIX = 'favorite-players:';
const MAX_FAVORITE_PLAYERS = 24;
const PROFILE_ALLOCATABLE_STATS = Object.freeze([
    { id: 'str', key: 'ちから', label: '力' },
    { id: 'def', key: 'みのまもり', label: '守' },
    { id: 'agi', key: 'すばやさ', label: '速' },
    { id: 'int', key: 'かしこさ', label: '知' }
]);

let playerProfileInstalled = false;
let activeProfileRequestToken = 0;
let activeProfile = null;
let pendingStatAllocation = {};
let statAllocationSaveInFlight = false;

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (match) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[match]);
}

function getCurrentUserPlayFabId() {
    return String(window.myPlayFabId || '').trim();
}

function getPlayerProfileModalElements() {
    return {
        modal: document.getElementById('playerProfileModal'),
        name: document.getElementById('playerProfileName'),
        nation: document.getElementById('playerProfileNation'),
        meta: document.getElementById('playerProfileMeta'),
        stats: document.getElementById('playerProfileStats'),
        equipment: document.getElementById('playerProfileEquipment'),
        close: document.getElementById('btnClosePlayerProfile'),
        transferButton: document.getElementById('btnPlayerProfileTransfer'),
        favoriteButton: document.getElementById('btnPlayerProfileFavorite'),
        beautyButton: document.getElementById('btnPlayerProfileBeauty'),
        copyIdButton: document.getElementById('btnPlayerProfileCopyId'),
        statAllocation: document.getElementById('playerProfileStatAllocation'),
        transferPanel: document.getElementById('playerProfileTransferPanel'),
        transferAmount: document.getElementById('playerProfileTransferAmount'),
        transferSubmit: document.getElementById('btnPlayerProfileTransferSubmit'),
        transferCancel: document.getElementById('btnPlayerProfileTransferCancel')
    };
}

function getFavoritePlayersElements() {
    return {
        section: document.getElementById('favoritePlayersSection'),
        list: document.getElementById('favoritePlayersList'),
        empty: document.getElementById('favoritePlayersEmpty')
    };
}

function getFavoritePlayersStorageKey(playFabId) {
    const ownerId = String(playFabId || '').trim();
    return ownerId ? `${FAVORITE_PLAYERS_STORAGE_PREFIX}${ownerId}` : '';
}

function normalizeFavoritePlayerEntry(entry = {}) {
    const playFabId = String(entry.playFabId || '').trim();
    if (!playFabId) return null;
    return {
        playFabId,
        displayName: String(entry.displayName || playFabId).trim() || playFabId,
        nation: String(entry.nation || '').trim().toLowerCase(),
        updatedAt: Number(entry.updatedAt || Date.now()) || Date.now()
    };
}

function loadFavoritePlayers(playFabId = getCurrentUserPlayFabId()) {
    const storageKey = getFavoritePlayersStorageKey(playFabId);
    if (!storageKey || typeof window === 'undefined' || !window.localStorage) return [];
    try {
        const raw = window.localStorage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : [];
        return (Array.isArray(parsed) ? parsed : [])
            .map((entry) => normalizeFavoritePlayerEntry(entry))
            .filter(Boolean)
            .slice(0, MAX_FAVORITE_PLAYERS);
    } catch (error) {
        console.warn('[playerProfile] Failed to read favorite players:', error);
        return [];
    }
}

function saveFavoritePlayers(entries, playFabId = getCurrentUserPlayFabId()) {
    const storageKey = getFavoritePlayersStorageKey(playFabId);
    if (!storageKey || typeof window === 'undefined' || !window.localStorage) return;
    const normalized = (Array.isArray(entries) ? entries : [])
        .map((entry) => normalizeFavoritePlayerEntry(entry))
        .filter(Boolean)
        .slice(0, MAX_FAVORITE_PLAYERS);
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(normalized));
    } catch (error) {
        console.warn('[playerProfile] Failed to save favorite players:', error);
    }
}

function isFavoritePlayer(targetPlayFabId, playFabId = getCurrentUserPlayFabId()) {
    const targetId = String(targetPlayFabId || '').trim();
    return !!targetId && loadFavoritePlayers(playFabId).some((entry) => entry.playFabId === targetId);
}

function addFavoritePlayer(profile, playFabId = getCurrentUserPlayFabId()) {
    const nextEntry = normalizeFavoritePlayerEntry({
        playFabId: profile?.playFabId,
        displayName: profile?.displayName,
        nation: profile?.nation,
        updatedAt: Date.now()
    });
    if (!nextEntry) return false;
    const nextEntries = loadFavoritePlayers(playFabId).filter((entry) => entry.playFabId !== nextEntry.playFabId);
    nextEntries.unshift(nextEntry);
    saveFavoritePlayers(nextEntries, playFabId);
    return true;
}

function removeFavoritePlayer(targetPlayFabId, playFabId = getCurrentUserPlayFabId()) {
    const targetId = String(targetPlayFabId || '').trim();
    if (!targetId) return false;
    const prevEntries = loadFavoritePlayers(playFabId);
    const nextEntries = prevEntries.filter((entry) => entry.playFabId !== targetId);
    if (nextEntries.length === prevEntries.length) return false;
    saveFavoritePlayers(nextEntries, playFabId);
    return true;
}

function syncFavoriteSnapshot(profile, playFabId = getCurrentUserPlayFabId()) {
    const targetId = String(profile?.playFabId || '').trim();
    if (!targetId) return false;
    const nextEntries = loadFavoritePlayers(playFabId);
    const index = nextEntries.findIndex((entry) => entry.playFabId === targetId);
    if (index < 0) return false;
    nextEntries[index] = {
        ...nextEntries[index],
        displayName: String(profile?.displayName || nextEntries[index].displayName || targetId).trim() || targetId,
        nation: String(profile?.nation || nextEntries[index].nation || '').trim().toLowerCase(),
        updatedAt: Date.now()
    };
    saveFavoritePlayers(nextEntries, playFabId);
    return true;
}

function getFavoritePlayerMetaText(entry) {
    const nationKey = String(entry?.nation || '').trim().toLowerCase();
    return nationKey ? `${getNationLabel(nationKey) || nationKey}の国` : '所属国未設定';
}

export function refreshFavoritePlayersList() {
    const { section, list, empty } = getFavoritePlayersElements();
    if (!section || !list || !empty) return;
    const playFabId = getCurrentUserPlayFabId();
    if (!playFabId) {
        section.hidden = true;
        list.innerHTML = '';
        empty.hidden = true;
        return;
    }
    const entries = loadFavoritePlayers(playFabId);
    section.hidden = false;
    if (!entries.length) {
        list.innerHTML = '';
        empty.hidden = false;
        return;
    }
    empty.hidden = true;
    list.innerHTML = entries.map((entry) => `
        <button type="button" class="favorite-player-card" data-player-playfab-id="${escapeHtml(entry.playFabId)}" title="プレイヤー情報を見る">
            <span class="favorite-player-card-name">${escapeHtml(entry.displayName || entry.playFabId)}</span>
            <span class="favorite-player-card-meta">${escapeHtml(getFavoritePlayerMetaText(entry))}</span>
        </button>
    `).join('');
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

function setTransferPanelOpen(open) {
    const { transferPanel, transferAmount } = getPlayerProfileModalElements();
    if (!transferPanel) return;
    transferPanel.hidden = !open;
    if (!open && transferAmount) transferAmount.value = '0';
}

function updateProfileActionState() {
    const {
        transferButton,
        favoriteButton,
        beautyButton,
        copyIdButton
    } = getPlayerProfileModalElements();
    const myPlayFabId = getCurrentUserPlayFabId();
    const targetPlayFabId = String(activeProfile?.playFabId || '').trim();
    const loaded = !!(targetPlayFabId && activeProfile?.loaded);
    const isTargetSelf = !!(myPlayFabId && targetPlayFabId && targetPlayFabId === myPlayFabId);
    const favoriteActive = !!(loaded && !isTargetSelf && isFavoritePlayer(targetPlayFabId, myPlayFabId));

    if (transferButton) {
        transferButton.hidden = isTargetSelf;
        transferButton.disabled = !loaded || isTargetSelf;
        transferButton.textContent = 'G';
        transferButton.setAttribute('aria-label', 'ゴールド送金');
        transferButton.setAttribute('title', 'ゴールド送金');
    }
    if (favoriteButton) {
        favoriteButton.hidden = isTargetSelf;
        favoriteButton.disabled = !loaded || isTargetSelf;
        favoriteButton.classList.toggle('is-active', favoriteActive);
        favoriteButton.textContent = favoriteActive ? '♥' : '♡';
        favoriteButton.setAttribute('aria-pressed', favoriteActive ? 'true' : 'false');
        favoriteButton.setAttribute('aria-label', favoriteActive ? 'お気に入りから外す' : 'お気に入りに追加');
        favoriteButton.setAttribute('title', favoriteActive ? 'お気に入り済み' : 'お気に入り');
    }
    if (beautyButton) {
        beautyButton.hidden = !isTargetSelf;
        beautyButton.disabled = !loaded || !isTargetSelf;
    }
    if (copyIdButton) {
        copyIdButton.disabled = !targetPlayFabId;
    }
    if (isTargetSelf || !loaded) {
        setTransferPanelOpen(false);
    }
}

export function closePlayerProfileModal() {
    const { modal } = getPlayerProfileModalElements();
    if (!modal) return;
    setTransferPanelOpen(false);
    modal.style.display = 'none';
    syncModalLockState();
}

async function copyText(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
}

async function handleCopyProfileId() {
    const targetPlayFabId = String(activeProfile?.playFabId || '').trim();
    if (!targetPlayFabId) return;
    try {
        await copyText(targetPlayFabId);
        showRpgMessage('PlayFab ID をコピーしました。', 2200);
    } catch (error) {
        showRpgMessage(`IDコピーに失敗しました: ${error?.message || error}`, 2600);
    }
}

function handleFavoriteToggle() {
    const myPlayFabId = getCurrentUserPlayFabId();
    const targetPlayFabId = String(activeProfile?.playFabId || '').trim();
    if (!myPlayFabId || !targetPlayFabId || !activeProfile?.loaded || myPlayFabId === targetPlayFabId) return;
    const exists = isFavoritePlayer(targetPlayFabId, myPlayFabId);
    const changed = exists
        ? removeFavoritePlayer(targetPlayFabId, myPlayFabId)
        : addFavoritePlayer(activeProfile, myPlayFabId);
    if (!changed) return;
    updateProfileActionState();
    refreshFavoritePlayersList();
    showRpgMessage(exists ? 'お気に入りから外しました。' : 'お気に入りに追加しました。', 2200);
}

function handleBeautySalonOpen() {
    const myPlayFabId = getCurrentUserPlayFabId();
    const targetPlayFabId = String(activeProfile?.playFabId || '').trim();
    if (!myPlayFabId || !targetPlayFabId || !activeProfile?.loaded || myPlayFabId !== targetPlayFabId) return;
    const openSalon = window.openAvatarStyleModal || window.showAvatarStyleModal;
    if (typeof openSalon !== 'function') {
        showRpgMessage('美容室を開けません。', 2200);
        return;
    }
    closePlayerProfileModal();
    openSalon();
}

async function executeProfileTransfer(amount) {
    const myPlayFabId = getCurrentUserPlayFabId();
    const targetPlayFabId = String(activeProfile?.playFabId || '').trim();
    const targetName = String(activeProfile?.displayName || targetPlayFabId).trim() || targetPlayFabId;
    const requestId = createRequestId('profile-transfer');
    const data = await transferPoints(myPlayFabId, targetPlayFabId, amount, { requestId, throwOnError: true });
    setTransferPanelOpen(false);
    const bountyNote = data?.bountyShortage
        ? ' 賞金は不足分を除いて移動しました。'
        : '';
    showRpgMessage(`${targetName} に ${amount}G送りました。${bountyNote}`.trim(), 2600);
    const Player = await import('./player.js');
    await Player.getPoints(myPlayFabId);
    await Player.getRanking();
}

async function handleProfileTransferSubmit() {
    const myPlayFabId = getCurrentUserPlayFabId();
    const targetPlayFabId = String(activeProfile?.playFabId || '').trim();
    const amountValue = Number.parseInt(String(getPlayerProfileModalElements().transferAmount?.value || '0'), 10);
    if (!myPlayFabId || !targetPlayFabId || !activeProfile?.loaded) return;
    if (targetPlayFabId === myPlayFabId) {
        showRpgMessage('自分自身には送金できません。', 2200);
        return;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
        showRpgMessage('送金額を入力してください。', 2200);
        return;
    }
    const targetName = String(activeProfile?.displayName || targetPlayFabId).trim() || targetPlayFabId;
    const { showConfirmationModal } = await import('./ui.js');
    showConfirmationModal(amountValue, targetPlayFabId, targetName, () => {
        void executeProfileTransfer(amountValue).catch((error) => {
            showRpgMessage(error?.message || '送金に失敗しました。', 2600);
        });
    });
}

function bindModalEvents() {
    const {
        modal,
        close,
        transferButton,
        favoriteButton,
        beautyButton,
        copyIdButton,
        transferCancel,
        transferSubmit
    } = getPlayerProfileModalElements();
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
    if (transferButton && !transferButton.dataset.profileBound) {
        transferButton.dataset.profileBound = 'true';
        transferButton.addEventListener('click', () => {
            if (transferButton.disabled) return;
            const panel = getPlayerProfileModalElements().transferPanel;
            setTransferPanelOpen(!!panel?.hidden);
        });
    }
    if (favoriteButton && !favoriteButton.dataset.profileBound) {
        favoriteButton.dataset.profileBound = 'true';
        favoriteButton.addEventListener('click', () => handleFavoriteToggle());
    }
    if (beautyButton && !beautyButton.dataset.profileBound) {
        beautyButton.dataset.profileBound = 'true';
        beautyButton.addEventListener('click', () => handleBeautySalonOpen());
    }
    if (copyIdButton && !copyIdButton.dataset.profileBound) {
        copyIdButton.dataset.profileBound = 'true';
        copyIdButton.addEventListener('click', () => {
            void handleCopyProfileId();
        });
    }
    if (transferCancel && !transferCancel.dataset.profileBound) {
        transferCancel.dataset.profileBound = 'true';
        transferCancel.addEventListener('click', () => setTransferPanelOpen(false));
    }
    if (transferSubmit && !transferSubmit.dataset.profileBound) {
        transferSubmit.dataset.profileBound = 'true';
        transferSubmit.addEventListener('click', () => {
            void handleProfileTransferSubmit();
        });
    }
    if (modal && !modal.dataset.profileTransferQuickBound) {
        modal.dataset.profileTransferQuickBound = 'true';
        modal.addEventListener('click', (event) => {
            const button = event.target?.closest?.('[data-profile-transfer-amount]');
            if (!button) return;
            const amount = Number.parseInt(String(button.dataset.profileTransferAmount || '0'), 10) || 0;
            const { transferAmount } = getPlayerProfileModalElements();
            if (!transferAmount) return;
            transferAmount.value = String(Math.max(0, amount));
        });
    }
    if (modal && !modal.dataset.profileStatAllocationBound) {
        modal.dataset.profileStatAllocationBound = 'true';
        modal.addEventListener('click', (event) => {
            const saveButton = event.target?.closest?.('[data-profile-stat-alloc-save]');
            if (saveButton) {
                void savePendingStatAllocation();
                return;
            }
            const button = event.target?.closest?.('[data-profile-stat-alloc]');
            if (!button) return;
            const statId = String(button.dataset.profileStatAlloc || '');
            const delta = Number.parseInt(String(button.dataset.profileStatDelta || '0'), 10) || 0;
            adjustPendingStatAllocation(statId, delta);
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

function normalizeProfileStatValue(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

function getProfileIsSelf() {
    const myPlayFabId = getCurrentUserPlayFabId();
    const targetPlayFabId = String(activeProfile?.playFabId || '').trim();
    return !!(myPlayFabId && targetPlayFabId && myPlayFabId === targetPlayFabId);
}

function getPendingStatAllocationTotal() {
    return Object.values(pendingStatAllocation || {}).reduce(
        (sum, value) => sum + normalizeProfileStatValue(value),
        0
    );
}

function getPendingStatAllocationMap() {
    return PROFILE_ALLOCATABLE_STATS.reduce((map, entry) => {
        const value = normalizeProfileStatValue(pendingStatAllocation?.[entry.id]);
        if (value > 0) map[entry.id] = value;
        return map;
    }, {});
}

function renderStatAllocationPanel() {
    const { statAllocation: panel } = getPlayerProfileModalElements();
    if (!panel) return;
    const allocation = activeProfile?.statAllocation || null;
    const isSelf = getProfileIsSelf();
    if (!isSelf || !allocation) {
        panel.hidden = true;
        panel.innerHTML = '';
        pendingStatAllocation = {};
        return;
    }

    const availablePoints = normalizeProfileStatValue(allocation.availablePoints);
    if (availablePoints <= 0) {
        panel.hidden = true;
        panel.innerHTML = '';
        pendingStatAllocation = {};
        return;
    }
    const pendingTotal = getPendingStatAllocationTotal();
    const remainingPoints = Math.max(0, availablePoints - pendingTotal);
    const stats = activeProfile?.stats || {};
    const rows = PROFILE_ALLOCATABLE_STATS.map((entry) => {
        const pending = normalizeProfileStatValue(pendingStatAllocation?.[entry.id]);
        const currentValue = normalizeProfileStatValue(stats?.[entry.key]);
        const nextValue = currentValue + pending;
        const minusDisabled = statAllocationSaveInFlight || pending <= 0 ? ' disabled' : '';
        const plusDisabled = statAllocationSaveInFlight || remainingPoints <= 0 ? ' disabled' : '';
        return `
            <div class="player-profile-stat-alloc-row">
                <span class="player-profile-stat-alloc-label">${escapeHtml(entry.label)}</span>
                <strong class="player-profile-stat-alloc-value">${nextValue}</strong>
                <span class="player-profile-stat-alloc-pending">${pending > 0 ? `+${pending}` : ''}</span>
                <div class="player-profile-stat-alloc-controls">
                    <button type="button" data-profile-stat-alloc="${escapeHtml(entry.id)}" data-profile-stat-delta="-1"${minusDisabled}>-</button>
                    <button type="button" data-profile-stat-alloc="${escapeHtml(entry.id)}" data-profile-stat-delta="1"${plusDisabled}>+</button>
                </div>
            </div>
        `;
    }).join('');
    const saveDisabled = statAllocationSaveInFlight || pendingTotal <= 0 ? ' disabled' : '';
    panel.hidden = false;
    panel.innerHTML = `
        <div class="player-profile-stat-alloc-head">
            <span>ステータスポイント</span>
            <b>${remainingPoints}pt</b>
        </div>
        <div class="player-profile-stat-alloc-sub">Lvアップごとに${normalizeProfileStatValue(allocation.pointsPerLevel || 5)}pt獲得</div>
        <div class="player-profile-stat-alloc-list">${rows}</div>
        <button type="button" class="player-profile-stat-alloc-save" data-profile-stat-alloc-save="true"${saveDisabled}>
            ${statAllocationSaveInFlight ? '保存中...' : '割り振りを保存'}
        </button>
    `;
}

function adjustPendingStatAllocation(statId, delta) {
    if (statAllocationSaveInFlight) return;
    const target = PROFILE_ALLOCATABLE_STATS.find((entry) => entry.id === statId);
    if (!target) return;
    const allocation = activeProfile?.statAllocation || null;
    if (!getProfileIsSelf() || !allocation) return;
    const change = Math.trunc(Number(delta) || 0);
    if (!change) return;
    const availablePoints = normalizeProfileStatValue(allocation.availablePoints);
    const pendingTotal = getPendingStatAllocationTotal();
    const currentPending = normalizeProfileStatValue(pendingStatAllocation?.[statId]);
    if (change > 0 && pendingTotal >= availablePoints) return;
    if (change < 0 && currentPending <= 0) return;
    pendingStatAllocation = {
        ...pendingStatAllocation,
        [statId]: Math.max(0, currentPending + change)
    };
    renderStatAllocationPanel();
}

async function savePendingStatAllocation() {
    if (statAllocationSaveInFlight || !getProfileIsSelf()) return;
    const allocations = getPendingStatAllocationMap();
    const total = getPendingStatAllocationTotal();
    if (total <= 0) return;
    const playFabId = getCurrentUserPlayFabId();
    if (!playFabId) return;
    statAllocationSaveInFlight = true;
    renderStatAllocationPanel();
    try {
        const data = await allocateStatPoints(playFabId, allocations, { throwOnError: true });
        activeProfile = {
            ...(activeProfile || {}),
            stats: data?.stats || activeProfile?.stats || {},
            statAllocation: data?.statAllocation || activeProfile?.statAllocation || null
        };
        pendingStatAllocation = {};
        renderProfileStats(activeProfile.stats);
        renderStatAllocationPanel();
        showRpgMessage(`${Number(data?.allocatedPoints || total) || total}ptを割り振りました。`, 2200);
        try {
            const Player = await import('./player.js');
            await Player.getPlayerStats(playFabId);
        } catch (refreshError) {
            console.warn('[playerProfile] Failed to refresh stats after allocation:', refreshError);
        }
    } catch (error) {
        showRpgMessage(error?.message || 'ステータスの割り振りに失敗しました。', 2600);
    } finally {
        statAllocationSaveInFlight = false;
        renderStatAllocationPanel();
    }
}

function renderProfileStats(stats = {}) {
    const { stats: statsEl } = getPlayerProfileModalElements();
    if (!statsEl) return;
    const rows = [
        ['力', stats?.ちから],
        ['守', stats?.みのまもり],
        ['速', stats?.すばやさ],
        ['知', stats?.かしこさ]
    ];
    statsEl.innerHTML = rows.map(([label, value]) => `
        <div class="player-profile-stat">
            <span>${escapeHtml(label)}</span>
            <strong>${normalizeProfileStatValue(value)}</strong>
        </div>
    `).join('');
}

const PROFILE_SHIP_LABELS = {
    boat: 'ボート',
    explorer: 'エクスプローラー',
    defender: 'ディフェンダー',
    fighter: 'ファイター',
    merchant: 'マーチャント'
};

function renderProfileShip(ship) {
    const el = document.getElementById('playerProfileShip');
    if (!el) return;
    if (!ship) {
        el.innerHTML = '';
        return;
    }
    const form = String(ship.form || 'boat').toLowerCase();
    const label = PROFILE_SHIP_LABELS[form] || 'ボート';
    el.innerHTML = `
        <div class="player-profile-ship-icon is-${escapeHtml(form)}" aria-hidden="true"></div>
        <div class="player-profile-ship-name">${escapeHtml(label)}</div>
        <div class="player-profile-ship-meta">段階 ${Number(ship.stage || 1)}</div>
    `;
}

function renderProfile(profile = {}) {
    const { name, nation, meta } = getPlayerProfileModalElements();
    activeProfile = {
        playFabId: String(profile.playFabId || '').trim(),
        displayName: String(profile.displayName || profile.playFabId || 'Player'),
        nation: String(profile.nation || '').trim().toLowerCase(),
        stats: profile.stats || {},
        statAllocation: profile.statAllocation || null,
        loaded: true
    };
    if (name) name.textContent = activeProfile.displayName;
    if (nation) {
        nation.textContent = activeProfile.nation
            ? `所属国: ${getNationLabel(activeProfile.nation) || activeProfile.nation}`
            : '所属国: 未設定';
    }
    if (meta) {
        const level = Math.max(1, Math.floor(Number(profile.level || profile.avatarBase?.level || 1) || 1));
        meta.textContent = `ID: ${activeProfile.playFabId || '-'} / Lv.${level}`;
    }
    renderProfileStats(activeProfile.stats);
    renderStatAllocationPanel();
    renderEquipmentRows(Array.isArray(profile.equipmentList) ? profile.equipmentList : []);
    renderProfileShip(profile.playerShip || null);
    renderAvatar(
        'playerProfileAvatar',
        profile.avatarBase || {},
        profile.equipment || {},
        profile.itemSource || {},
        false
    );
    if (syncFavoriteSnapshot(activeProfile)) {
        refreshFavoritePlayersList();
    }
    updateProfileActionState();
}

function renderLoadingState(targetPlayFabId = '') {
    const { name, nation, meta, stats, equipment, statAllocation } = getPlayerProfileModalElements();
    pendingStatAllocation = {};
    activeProfile = {
        playFabId: String(targetPlayFabId || '').trim(),
        displayName: '',
        nation: '',
        stats: {},
        statAllocation: null,
        loaded: false
    };
    if (name) name.textContent = '読み込み中...';
    if (nation) nation.textContent = '';
    if (meta) meta.textContent = targetPlayFabId ? `ID: ${targetPlayFabId}` : '';
    if (stats) stats.innerHTML = '';
    if (statAllocation) {
        statAllocation.hidden = true;
        statAllocation.innerHTML = '';
    }
    if (equipment) {
        equipment.innerHTML = '<div class="player-profile-empty">プレイヤー情報を読み込んでいます。</div>';
    }
    setTransferPanelOpen(false);
    updateProfileActionState();
}

function renderErrorState(message) {
    const { nation, stats, equipment, statAllocation } = getPlayerProfileModalElements();
    if (nation) nation.textContent = '';
    if (stats) stats.innerHTML = '';
    if (statAllocation) {
        statAllocation.hidden = true;
        statAllocation.innerHTML = '';
    }
    if (equipment) {
        equipment.innerHTML = `<div class="player-profile-empty">${escapeHtml(message || 'プレイヤー情報を取得できませんでした。')}</div>`;
    }
    updateProfileActionState();
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
    refreshFavoritePlayersList();
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
    window.refreshFavoritePlayersList = refreshFavoritePlayersList;
}
