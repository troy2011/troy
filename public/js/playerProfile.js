import { renderAvatar } from './avatar.js';
import { getNationLabel } from './nationLabels.js';
import {
    transferPoints,
    getPublicPlayerProfile,
    getPlayerCompatibility,
    allocateStatPoints,
    getTarotKingdomPetState,
    renameTarotKingdomPet
} from './playfabClient.js';
import { createRequestId } from './api.js';
import { showRpgMessage } from './rpgMessages.js';
import { renderPixelMonsterCompanion } from './pixelMonsterCompanion.js?v=20260825-monster-motion-v1';
import { bindModalClose } from './modalClose.js';

const FAVORITE_PLAYERS_STORAGE_PREFIX = 'favorite-players:';
const MAX_FAVORITE_PLAYERS = 24;
const PROFILE_ALLOCATABLE_STATS = Object.freeze([
    { id: 'str', key: 'ちから', label: '力' },
    { id: 'def', key: 'みのまもり', label: '守' },
    { id: 'agi', key: 'すばやさ', label: '速' },
    { id: 'int', key: 'かしこさ', label: '知' },
    { id: 'vit', key: 'たいりょく', label: '体' }
]);

let playerProfileInstalled = false;
let activeProfileRequestToken = 0;
let activeProfile = null;
let pendingStatAllocation = {};
let statAllocationSaveInFlight = false;
let homePetRequestToken = 0;
let petRenameInFlight = false;
let compatibilityRequestToken = 0;

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
        compatibilityButton: document.getElementById('btnPlayerProfileCompatibility'),
        beautyButton: document.getElementById('btnPlayerProfileBeauty'),
        copyIdButton: document.getElementById('btnPlayerProfileCopyId'),
        statAllocation: document.getElementById('playerProfileStatAllocation'),
        destiny: document.getElementById('playerProfileDestiny'),
        personalityTraits: document.getElementById('playerProfilePersonalityTraits'),
        animalImage: document.getElementById('playerProfileAnimalImage'),
        animalName: document.getElementById('playerProfileAnimalName'),
        animalCore: document.getElementById('playerProfileAnimalCore'),
        animalMemory: document.getElementById('playerProfileAnimalMemory'),
        animalStrength: document.getElementById('playerProfileAnimalStrength'),
        animalWeakness: document.getElementById('playerProfileAnimalWeakness'),
        animalRelationships: document.getElementById('playerProfileAnimalRelationships'),
        animalAdvice: document.getElementById('playerProfileAnimalAdvice'),
        arcanaDay: document.getElementById('playerProfileArcanaDay'),
        arcanaDayOmen: document.getElementById('playerProfileArcanaDayOmen'),
        arcanaDayProphecy: document.getElementById('playerProfileArcanaDayProphecy'),
        destinyDetail: document.getElementById('playerProfileDestinyDetail'),
        destinyDisclaimer: document.getElementById('playerProfileDestinyDisclaimer'),
        destinyActions: document.getElementById('playerProfileDestinyActions'),
        destinyDetailButton: document.getElementById('btnPlayerProfileDestinyDetail'),
        destinyCopyButton: document.getElementById('btnPlayerProfileDestinyCopy'),
        compatibilitySummary: document.getElementById('playerProfileCompatibilitySummary'),
        compatibilityScore: document.getElementById('playerProfileCompatibilityScore'),
        compatibilityText: document.getElementById('playerProfileCompatibilityText'),
        compatibilityDetail: document.getElementById('btnPlayerProfileCompatibilityDetail'),
        pet: document.getElementById('playerProfilePetCompanion'),
        petName: document.getElementById('playerProfilePetName'),
        petRenameForm: document.getElementById('playerProfilePetRenameForm'),
        petNameInput: document.getElementById('playerProfilePetNameInput'),
        petRenameCancel: document.getElementById('btnPlayerProfilePetRenameCancel'),
        transferPanel: document.getElementById('playerProfileTransferPanel'),
        transferAmount: document.getElementById('playerProfileTransferAmount'),
        transferSubmit: document.getElementById('btnPlayerProfileTransferSubmit'),
        transferCancel: document.getElementById('btnPlayerProfileTransferCancel')
    };
}

function getCompatibilityModalElements() {
    return {
        modal: document.getElementById('playerCompatibilityModal'),
        title: document.getElementById('playerCompatibilityTitle'),
        close: document.getElementById('btnClosePlayerCompatibility'),
        targetField: document.getElementById('playerCompatibilityTargetField'),
        target: document.getElementById('playerCompatibilityTarget'),
        status: document.getElementById('playerCompatibilityStatus'),
        result: document.getElementById('playerCompatibilityResult'),
        overall: document.getElementById('playerCompatibilityOverall'),
        overallText: document.getElementById('playerCompatibilityOverallText'),
        scores: document.getElementById('playerCompatibilityScores'),
        strength: document.getElementById('playerCompatibilityStrength'),
        friction: document.getElementById('playerCompatibilityFriction'),
        advice: document.getElementById('playerCompatibilityAdvice')
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
    if (nationKey === 'neutral') return '無国籍';
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
        compatibilityButton,
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
    if (compatibilityButton) {
        compatibilityButton.disabled = !loaded;
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

function getProfilePetDisplayName(currentPet = activeProfile?.currentPet) {
    return String(
        currentPet?.nickname
        || currentPet?.displayName
        || currentPet?.monsterName
        || 'ペット'
    ).trim() || 'ペット';
}

function canRenameActiveProfilePet() {
    const myPlayFabId = getCurrentUserPlayFabId();
    const targetPlayFabId = String(activeProfile?.playFabId || '').trim();
    return !!(
        myPlayFabId
        && targetPlayFabId
        && activeProfile?.loaded
        && activeProfile?.currentPet
        && myPlayFabId === targetPlayFabId
    );
}

function setProfilePetRenameOpen(open) {
    const { petName, petRenameForm, petNameInput } = getPlayerProfileModalElements();
    const shouldOpen = open === true && canRenameActiveProfilePet() && !petRenameInFlight;
    if (petRenameForm) petRenameForm.hidden = !shouldOpen;
    if (petName) petName.hidden = shouldOpen || !activeProfile?.currentPet;
    if (!shouldOpen || !petNameInput) return;
    petNameInput.value = getProfilePetDisplayName();
    requestAnimationFrame(() => {
        petNameInput.focus();
        petNameInput.select();
    });
}

function renderProfilePet(currentPet = null) {
    const { pet, petName, petRenameForm, petNameInput } = getPlayerProfileModalElements();
    const hasPet = renderPixelMonsterCompanion(pet, currentPet);
    pet?.closest('.player-profile-avatar-shell')?.classList.toggle('has-pet-companion', hasPet);
    if (petName) {
        petName.hidden = !hasPet;
        const petLevel = Math.max(1, Math.floor(Number(currentPet?.level) || 1));
        const petExperience = Math.max(0, Math.floor(Number(currentPet?.experience) || 0));
        const experienceToNextLevel = Math.max(0, Math.floor(Number(currentPet?.experienceToNextLevel) || 0));
        petName.textContent = hasPet ? `${getProfilePetDisplayName(currentPet)} Lv${petLevel}` : '';
        petName.disabled = !hasPet || !canRenameActiveProfilePet();
        petName.title = hasPet
            ? `Lv${petLevel} EXP ${petExperience}/${experienceToNextLevel || 'MAX'}${petName.disabled ? '' : '・クリックして名前変更'}`
            : 'ペット名';
        petName.setAttribute(
            'aria-label',
            petName.disabled
                ? `${getProfilePetDisplayName(currentPet)} Lv${petLevel}（ペット名）`
                : `${getProfilePetDisplayName(currentPet)} Lv${petLevel}・ペット名を変更`
        );
    }
    if (pet) {
        pet.classList.toggle('is-renamable', hasPet && canRenameActiveProfilePet());
        if (hasPet && canRenameActiveProfilePet()) {
            pet.setAttribute('role', 'button');
            pet.setAttribute('tabindex', '0');
            pet.setAttribute('title', 'クリックして名前変更');
        } else {
            pet.removeAttribute('role');
            pet.removeAttribute('tabindex');
            pet.removeAttribute('title');
        }
    }
    if (petRenameForm) petRenameForm.hidden = true;
    if (petNameInput) {
        petNameInput.value = hasPet ? getProfilePetDisplayName(currentPet) : '';
        petNameInput.disabled = false;
    }
    return hasPet;
}

async function saveProfilePetName() {
    const { petNameInput, petRenameForm } = getPlayerProfileModalElements();
    if (!canRenameActiveProfilePet() || petRenameInFlight) return;
    const nickname = String(petNameInput?.value || '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!nickname || Array.from(nickname).length > 12) {
        showRpgMessage('ペット名は1～12文字で入力してください。', 2400);
        petNameInput?.focus();
        return;
    }
    petRenameInFlight = true;
    if (petNameInput) petNameInput.disabled = true;
    petRenameForm?.querySelectorAll('button').forEach((button) => {
        button.disabled = true;
    });
    try {
        const playFabId = getCurrentUserPlayFabId();
        const result = await renameTarotKingdomPet(playFabId, nickname, {
            throwOnError: true,
            isSilent: true
        });
        const currentPet = result?.currentPet && typeof result.currentPet === 'object'
            ? result.currentPet
            : null;
        if (!currentPet) throw new Error('ペット情報を更新できませんでした。');
        activeProfile.currentPet = currentPet;
        renderProfilePet(currentPet);
        window.dispatchEvent(new CustomEvent('tarot-kingdom:pet-changed', {
            detail: { currentPet }
        }));
        showRpgMessage(`${getProfilePetDisplayName(currentPet)} に名前を変更しました。`, 2200);
    } catch (error) {
        showRpgMessage(error?.message || 'ペット名を変更できませんでした。', 2600);
        if (petNameInput) petNameInput.disabled = false;
        petRenameForm?.querySelectorAll('button').forEach((button) => {
            button.disabled = false;
        });
    } finally {
        petRenameInFlight = false;
    }
}

export function closePlayerProfileModal() {
    const { modal } = getPlayerProfileModalElements();
    if (!modal) return;
    closeCompatibilityModal();
    setTransferPanelOpen(false);
    setProfilePetRenameOpen(false);
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

function buildDestinyReadingText(destinyProfile) {
    const animal = destinyProfile?.animal || {};
    const day = destinyProfile?.arcanaDay || {};
    return [
        '前世動物診断',
        `特徴: ${destinyProfile?.traits || ''}`,
        `前世の動物: ${animal.name || ''}`,
        `前世の記憶: ${animal.pastLifeMemory || ''}`,
        `性格の核心: ${animal.core || ''}`,
        `強み: ${animal.strength || ''}`,
        `偏りやすい点: ${animal.weakness || ''}`,
        `人との関わり方: ${animal.relationships || ''}`,
        `今の人生で活かす方法: ${animal.advice || ''}`,
        `アルカナの日: ${day.label || ''}`,
        `人生の分岐点の予言: ${day.prophecy || ''}`,
        destinyProfile?.disclaimer || ''
    ].filter((line) => !line.endsWith(': ')).join('\n');
}

async function handleCopyDestinyReading() {
    if (!activeProfile?.destinyProfile?.animal?.pastLifeMemory) return;
    try {
        await copyText(buildDestinyReadingText(activeProfile.destinyProfile));
        showRpgMessage('鑑定書をコピーしました。', 2200);
    } catch (error) {
        showRpgMessage(`鑑定書のコピーに失敗しました: ${error?.message || error}`, 2600);
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
    await transferPoints(myPlayFabId, targetPlayFabId, amount, { requestId, throwOnError: true });
    setTransferPanelOpen(false);
    showRpgMessage(`${targetName} に ${amount}G送りました。`, 2600);
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
        compatibilityButton,
        compatibilityDetail,
        destinyDetail,
        destinyDetailButton,
        destinyCopyButton,
        beautyButton,
        copyIdButton,
        transferCancel,
        transferSubmit,
        pet,
        petName,
        petRenameForm,
        petRenameCancel
    } = getPlayerProfileModalElements();
    bindModalClose(close, closePlayerProfileModal, {
        overlay: modal,
        closeOnBackdrop: true,
        closeOnEscape: true
    });
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
    if (compatibilityButton && !compatibilityButton.dataset.profileBound) {
        compatibilityButton.dataset.profileBound = 'true';
        compatibilityButton.addEventListener('click', openCompatibilityModal);
    }
    if (compatibilityDetail && !compatibilityDetail.dataset.profileBound) {
        compatibilityDetail.dataset.profileBound = 'true';
        compatibilityDetail.addEventListener('click', openCompatibilityModal);
    }
    if (destinyDetailButton && !destinyDetailButton.dataset.profileBound) {
        destinyDetailButton.dataset.profileBound = 'true';
        destinyDetailButton.addEventListener('click', () => {
            if (!destinyDetail) return;
            destinyDetail.hidden = !destinyDetail.hidden;
            destinyDetailButton.textContent = destinyDetail.hidden ? '詳しい鑑定を見る' : '詳しい鑑定を閉じる';
        });
    }
    if (destinyCopyButton && !destinyCopyButton.dataset.profileBound) {
        destinyCopyButton.dataset.profileBound = 'true';
        destinyCopyButton.addEventListener('click', () => void handleCopyDestinyReading());
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
    if (pet && !pet.dataset.profileRenameBound) {
        pet.dataset.profileRenameBound = 'true';
        pet.addEventListener('click', () => setProfilePetRenameOpen(true));
        pet.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            setProfilePetRenameOpen(true);
        });
    }
    if (petName && !petName.dataset.profileRenameBound) {
        petName.dataset.profileRenameBound = 'true';
        petName.addEventListener('click', () => setProfilePetRenameOpen(true));
    }
    if (petRenameForm && !petRenameForm.dataset.profileRenameBound) {
        petRenameForm.dataset.profileRenameBound = 'true';
        petRenameForm.addEventListener('submit', (event) => {
            event.preventDefault();
            void saveProfilePetName();
        });
    }
    if (petRenameCancel && !petRenameCancel.dataset.profileRenameBound) {
        petRenameCancel.dataset.profileRenameBound = 'true';
        petRenameCancel.addEventListener('click', () => setProfilePetRenameOpen(false));
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

    const compatibilityElements = getCompatibilityModalElements();
    bindModalClose(compatibilityElements.close, closeCompatibilityModal, {
        overlay: compatibilityElements.modal,
        closeOnBackdrop: true,
        closeOnEscape: true
    });
    if (compatibilityElements.target && !compatibilityElements.target.dataset.compatibilityBound) {
        compatibilityElements.target.dataset.compatibilityBound = 'true';
        compatibilityElements.target.addEventListener('change', () => {
            const selectedName = compatibilityElements.target.selectedOptions?.[0]?.textContent || '';
            if (compatibilityElements.title) {
                compatibilityElements.title.textContent = selectedName && compatibilityElements.target.value
                    ? `あなた × ${selectedName}`
                    : 'プレイヤー相性';
            }
            void loadCompatibility(compatibilityElements.target.value, { showDetail: true });
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
        <div class="player-profile-stat-alloc-sub">Lvアップごとに${normalizeProfileStatValue(allocation.pointsPerLevel || 5)}pt獲得 / 体1ptで最大HP+${normalizeProfileStatValue(allocation.hpPerVitality || 4)}</div>
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
        ['知', stats?.かしこさ],
        ['体', stats?.たいりょく],
        ['HP', stats?.MaxHP]
    ];
    statsEl.innerHTML = rows.map(([label, value]) => `
        <div class="player-profile-stat">
            <span>${escapeHtml(label)}</span>
            <strong>${normalizeProfileStatValue(value)}</strong>
        </div>
    `).join('');
}

function clearProfileCompatibilitySummary() {
    const { compatibilitySummary, compatibilityScore, compatibilityText } = getPlayerProfileModalElements();
    if (compatibilitySummary) compatibilitySummary.hidden = true;
    if (compatibilityScore) compatibilityScore.textContent = '';
    if (compatibilityText) compatibilityText.textContent = '';
}

function renderProfileDestiny(destinyProfile) {
    const {
        destiny,
        personalityTraits,
        animalImage,
        animalName,
        animalCore,
        animalMemory,
        animalStrength,
        animalWeakness,
        animalRelationships,
        animalAdvice,
        arcanaDay,
        arcanaDayOmen,
        arcanaDayProphecy,
        destinyDetail,
        destinyDisclaimer,
        destinyActions,
        destinyDetailButton
    } = getPlayerProfileModalElements();
    if (!destiny) return;
    const traits = String(destinyProfile?.traits || '').trim();
    const animal = destinyProfile?.animal || {};
    const day = destinyProfile?.arcanaDay || {};
    const dayLabel = String(day.label || '').trim();
    const valid = traits
        && String(animal.name || '').trim()
        && String(animal.core || '').trim()
        && dayLabel
        && String(day.omen || '').trim();
    if (!valid) {
        destiny.hidden = true;
        if (personalityTraits) personalityTraits.textContent = '';
        if (animalImage) animalImage.removeAttribute('src');
        if (animalName) animalName.textContent = '';
        if (animalCore) animalCore.textContent = '';
        if (arcanaDay) arcanaDay.textContent = '';
        if (arcanaDayOmen) arcanaDayOmen.textContent = '';
        if (destinyDetail) destinyDetail.hidden = true;
        if (destinyActions) destinyActions.hidden = true;
        clearProfileCompatibilitySummary();
        return;
    }
    destiny.hidden = false;
    if (personalityTraits) personalityTraits.textContent = traits;
    if (animalImage) {
        animalImage.src = String(animal.imageUrl || '');
        animalImage.alt = `${animal.name}の前世動物画`;
    }
    if (animalName) animalName.textContent = animal.name;
    if (animalCore) animalCore.textContent = animal.core;
    if (arcanaDay) arcanaDay.textContent = dayLabel;
    if (arcanaDayOmen) arcanaDayOmen.textContent = String(day.omen || '');
    const hasFullReading = Boolean(animal.pastLifeMemory && animal.strength && animal.weakness && animal.relationships && animal.advice && day.prophecy);
    if (animalMemory) animalMemory.textContent = hasFullReading ? animal.pastLifeMemory : '';
    if (animalStrength) animalStrength.textContent = hasFullReading ? animal.strength : '';
    if (animalWeakness) animalWeakness.textContent = hasFullReading ? animal.weakness : '';
    if (animalRelationships) animalRelationships.textContent = hasFullReading ? animal.relationships : '';
    if (animalAdvice) animalAdvice.textContent = hasFullReading ? animal.advice : '';
    if (arcanaDayProphecy) arcanaDayProphecy.textContent = hasFullReading ? String(day.prophecy || '') : '';
    if (destinyDisclaimer) destinyDisclaimer.textContent = hasFullReading ? String(destinyProfile?.disclaimer || '') : '';
    if (destinyDetail) destinyDetail.hidden = true;
    if (destinyActions) destinyActions.hidden = !hasFullReading;
    if (destinyDetailButton) destinyDetailButton.textContent = '詳しい鑑定を見る';
}

function renderCompatibilitySummary(compatibility) {
    const { compatibilitySummary, compatibilityScore, compatibilityText } = getPlayerProfileModalElements();
    if (!compatibilitySummary || !compatibility) {
        clearProfileCompatibilitySummary();
        return;
    }
    compatibilitySummary.hidden = false;
    if (compatibilityScore) compatibilityScore.textContent = `${Math.round(Number(compatibility.overall) || 0)}点`;
    if (compatibilityText) compatibilityText.textContent = String(compatibility.summary || '');
}

function renderCompatibilityDetail(compatibility) {
    const { result, status, overall, overallText, scores, strength, friction, advice } = getCompatibilityModalElements();
    if (!compatibility) {
        if (result) result.hidden = true;
        return;
    }
    if (result) result.hidden = false;
    if (status) status.textContent = '';
    if (overall) overall.textContent = `${Math.round(Number(compatibility.overall) || 0)}点`;
    if (overallText) overallText.textContent = String(compatibility.summary || '');
    if (scores) {
        scores.innerHTML = Object.values(compatibility.categories || {}).map((entry) => `
            <div class="player-compatibility-score">
                <span>${escapeHtml(entry?.label || '')}</span>
                <strong>${Math.round(Number(entry?.score) || 0)}点</strong>
                <p>${escapeHtml(entry?.summary || '')}</p>
            </div>
        `).join('');
    }
    if (strength) strength.textContent = String(compatibility.strength || '');
    if (friction) friction.textContent = String(compatibility.friction || '');
    if (advice) advice.textContent = String(compatibility.advice || '');
}

async function loadCompatibility(targetPlayFabId, { showDetail = false, showSummary = false } = {}) {
    const myPlayFabId = getCurrentUserPlayFabId();
    const targetId = String(targetPlayFabId || '').trim();
    const requestToken = ++compatibilityRequestToken;
    const { status, result } = getCompatibilityModalElements();
    if (!myPlayFabId || !targetId || myPlayFabId === targetId) {
        if (showDetail && status) status.textContent = '相手を選んでください。';
        if (showDetail && result) result.hidden = true;
        if (showSummary) clearProfileCompatibilitySummary();
        return null;
    }
    if (showDetail && status) status.textContent = '相性を読み解いています。';
    if (showDetail && result) result.hidden = true;
    try {
        const response = await getPlayerCompatibility(myPlayFabId, targetId, { isSilent: true });
        if (requestToken !== compatibilityRequestToken) return null;
        if (!response?.available || !response?.compatibility) {
            const reason = String(response?.reason || '相性を表示できません。');
            if (showDetail && status) status.textContent = reason;
            if (showSummary) clearProfileCompatibilitySummary();
            return null;
        }
        if (showDetail) renderCompatibilityDetail(response.compatibility);
        if (showSummary) renderCompatibilitySummary(response.compatibility);
        return response.compatibility;
    } catch (error) {
        if (requestToken !== compatibilityRequestToken) return null;
        if (showDetail && status) status.textContent = error?.message || '相性を表示できません。';
        if (showSummary) clearProfileCompatibilitySummary();
        return null;
    }
}

function closeCompatibilityModal() {
    const { modal } = getCompatibilityModalElements();
    if (!modal) return;
    compatibilityRequestToken += 1;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    syncModalLockState();
}

function populateCompatibilityTargets() {
    const { target, targetField, title, status, result } = getCompatibilityModalElements();
    if (!target || !targetField) return '';
    const favorites = loadFavoritePlayers();
    target.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = favorites.length ? 'お気に入りから選択' : 'お気に入りがありません';
    target.appendChild(placeholder);
    favorites.forEach((entry) => {
        const option = document.createElement('option');
        option.value = entry.playFabId;
        option.textContent = entry.displayName || entry.playFabId;
        target.appendChild(option);
    });
    target.disabled = favorites.length === 0;
    targetField.hidden = false;
    if (title) title.textContent = 'プレイヤー相性';
    if (status) status.textContent = favorites.length ? '相手を選んでください。' : '先に相手のプロフィールをお気に入りへ追加してください。';
    if (result) result.hidden = true;
    return '';
}

function openCompatibilityModal() {
    const { modal, title, targetField, status, result } = getCompatibilityModalElements();
    if (!modal || !activeProfile?.loaded) return;
    showModal(modal);
    modal.setAttribute('aria-hidden', 'false');
    if (result) result.hidden = true;
    const myPlayFabId = getCurrentUserPlayFabId();
    const targetId = String(activeProfile.playFabId || '').trim();
    if (targetId === myPlayFabId) {
        populateCompatibilityTargets();
        return;
    }
    if (title) title.textContent = `あなた × ${activeProfile.displayName || targetId}`;
    if (targetField) targetField.hidden = true;
    if (status) status.textContent = '相性を読み解いています。';
    void loadCompatibility(targetId, { showDetail: true });
}

const PROFILE_SHIP_LABELS = {
    boat: 'ボート',
    explorer: 'エクスプローラー',
    defender: 'ディフェンダー',
    fighter: 'ファイター',
    merchant: 'マーチャント',
    guild: '王の船'
};

const PROFILE_GUILD_SHIP_COLOR_BY_NATION = {
    fire: 'red',
    water: 'blue',
    wind: 'yellow',
    earth: 'green'
};

function getProfileGuildShipLayers(ship = {}) {
    const directColor = String(ship?.appearance?.color || ship?.sailColor || '').trim().toLowerCase();
    const nationColor = PROFILE_GUILD_SHIP_COLOR_BY_NATION[String(ship?.nationKey || ship?.nation || '').trim().toLowerCase()];
    const color = ['red', 'blue', 'yellow', 'green'].includes(directColor)
        ? directColor
        : (nationColor || 'white');
    return `
        <span class="home-guild-ship-layer is-hull" aria-hidden="true"></span>
        <span class="home-guild-ship-layer is-sail-bottom is-${color}" aria-hidden="true"></span>
        <span class="home-guild-ship-layer is-sail-middle is-${color}" aria-hidden="true"></span>
        <span class="home-guild-ship-layer is-sail-top is-${color}" aria-hidden="true"></span>
    `;
}

function renderProfileShip(ship) {
    const el = document.getElementById('playerProfileShip');
    if (!el) return;
    if (!ship) {
        el.innerHTML = '';
        return;
    }
    const requestedForm = String(ship.form || 'boat').toLowerCase();
    const form = Object.prototype.hasOwnProperty.call(PROFILE_SHIP_LABELS, requestedForm) ? requestedForm : 'boat';
    const label = String(ship.name || ship.kingShipName || PROFILE_SHIP_LABELS[form] || 'ボート').trim();
    const guildLayers = form === 'guild' ? getProfileGuildShipLayers(ship) : '';
    el.innerHTML = `
        <div class="player-profile-ship-icon is-${escapeHtml(form)}" aria-hidden="true">${guildLayers}</div>
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
        destinyProfile: profile.destinyProfile || null,
        currentPet: profile.currentPet || null,
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
    renderProfileDestiny(activeProfile.destinyProfile);
    renderEquipmentRows(Array.isArray(profile.equipmentList) ? profile.equipmentList : []);
    renderProfileShip(profile.playerShip || null);
    renderAvatar(
        'playerProfileAvatar',
        profile.avatarBase || {},
        profile.equipment || {},
        profile.itemSource || {},
        false
    );
    renderProfilePet(activeProfile.currentPet);
    if (syncFavoriteSnapshot(activeProfile)) {
        refreshFavoritePlayersList();
    }
    updateProfileActionState();
    const myPlayFabId = getCurrentUserPlayFabId();
    if (activeProfile.playFabId && activeProfile.playFabId !== myPlayFabId) {
        void loadCompatibility(activeProfile.playFabId, { showSummary: true });
    } else {
        clearProfileCompatibilitySummary();
    }
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
        destinyProfile: null,
        currentPet: null,
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
    renderProfileDestiny(null);
    compatibilityRequestToken += 1;
    clearProfileCompatibilitySummary();
    renderProfilePet(null);
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
    renderProfileDestiny(null);
    compatibilityRequestToken += 1;
    clearProfileCompatibilitySummary();
    if (activeProfile) activeProfile.currentPet = null;
    renderProfilePet(null);
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

export function renderHomePetCompanion(currentPet = null) {
    const target = document.getElementById('homePetCompanion');
    const hasPet = renderPixelMonsterCompanion(target, currentPet);
    document.getElementById('homeShipStage')?.classList.toggle('has-pet-companion', hasPet);
    return hasPet;
}

export async function refreshHomePetCompanion(playFabId = getCurrentUserPlayFabId()) {
    const ownerId = String(playFabId || '').trim();
    const requestToken = ++homePetRequestToken;
    if (!ownerId) {
        renderHomePetCompanion(null);
        return null;
    }
    try {
        const result = await getTarotKingdomPetState(ownerId, { isSilent: true });
        if (requestToken !== homePetRequestToken) return null;
        const currentPet = result?.currentPet && typeof result.currentPet === 'object'
            ? result.currentPet
            : null;
        renderHomePetCompanion(currentPet);
        return currentPet;
    } catch {
        if (requestToken === homePetRequestToken) renderHomePetCompanion(null);
        return null;
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
    window.addEventListener('tarot-kingdom:pet-changed', (event) => {
        renderHomePetCompanion(event?.detail?.currentPet || null);
    });
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
    window.refreshHomePetCompanion = refreshHomePetCompanion;
}
