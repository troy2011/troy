// c:/Users/ikeda/my-liff-app/public/main.js

import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithCustomToken } from "firebase/auth";
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { firebaseConfig, RACE_COLORS, formatCurrencyLabel } from 'config';
import { callApiWithLoader, promisifyPlayFab, buildApiUrl, createRequestId } from 'api';
import { showTab, showConfirmationModal, scheduleWorldMapPrefetch } from 'ui';
import * as Player from 'player';
import * as Inventory from 'inventory';
import * as Guild from './js/guild.js';
import * as Ship from './js/ship.js';
import * as Island from './js/island.js';
import * as NationKing from './js/nationKing.js';
import { initMapChat, initTroyChat } from './js/mapChat.js';
import { enterBattleRoom } from './BattleRoomScene.js';
import { renderAvatar, preloadAvatarBaseSprites } from './js/avatar.js';
import { installPlayerProfileInteractions, openPlayerProfile, refreshFavoritePlayersList } from './js/playerProfile.js';
import { showRpgMessage, rpgSay } from './js/rpgMessages.js';
import { updateAvatarStyle as requestUpdateAvatarStyle } from './js/playfabClient.js';
import { FEATURE_UNLOCK_LEVELS, formatUnlockedFeatures, isFeatureUnlocked, normalizeLevel } from './js/featureUnlocks.js';

import { getDatabase } from "firebase/database";
// --- グローバル変数 ---
window.myLineProfile = null;
window.myPlayFabId = null;
window.myAvatarBaseInfo = { Race: 'human', SkinColorIndex: 1, Nation: 'fire' };
window.myEntityToken = null;
window.myPlayFabLoginInfo = null;
let playFabLoginInProgress = false;
let playFabLoginDone = false;
let playFabLoginPromise = null;
let lastFirebaseUid = null;
let initializeAppPromise = null;
let raceSelectionBound = false;
let authHandled = false;
let authUnsubscribe = null;
let transferNoticeUnsubscribe = null;
let transferNoticeReady = false;
let lastTransferNoticeId = null;
window.myPlayFabDisplayName = null;
let buildingMetaPromise = null;
let shipCatalogPromise = null;
let pendingAppInviteToken = '';
let pendingAppInviteInfo = null;
let pendingFixedInviteNation = '';
let lineFriendPromoState = null;
const TAROT_MODULE_VERSION = '20260323a';
const LIFF_CALLBACK_PARAM_KEYS = [
    'code',
    'state',
    'liffClientId',
    'redirectUri',
    'liffRedirectUri',
    'friendship_status_changed',
    'error',
    'error_description',
    'access_token',
    'id_token'
];
const LIFF_AUTH_RETRY_SESSION_KEY = 'troy:liff-auth-code-retry';
const NATION_LABEL_BY_KEY = {
    fire: '火',
    water: '水',
    wind: '風',
    earth: '地'
};
const VALID_NATION_KEYS = Object.freeze(Object.keys(NATION_LABEL_BY_KEY));
const LINE_FRIEND_BONUS_STORAGE_KEY = 'troy:line-friend-bonus-claimed';
const LINE_FRIEND_ENTRY_PROMPT_SESSION_KEY = 'troy:line-friend-entry-prompted';

installPlayerProfileInteractions();

const NATION_GROUP_BY_RACE = {
    Human: { island: 'fire', groupName: 'nation_fire_island' },
    Goblin: { island: 'water', groupName: 'nation_water_island' },
    Orc: { island: 'earth', groupName: 'nation_earth_island' },
    Elf: { island: 'wind', groupName: 'nation_wind_island' }
};


const AVATAR_COLOR_BY_NATION = {
    fire: 'red',
    earth: 'green',
    wind: 'yellow',
    water: 'blue'
};

function initHomeSurprises() {
}

function updateSeaToneByTime(date = new Date()) {
    const hour = date.getHours();
    let tone = 'night';
    if (hour >= 5 && hour < 9) tone = 'dawn';
    else if (hour >= 9 && hour < 16) tone = 'day';
    else if (hour >= 16 && hour < 20) tone = 'dusk';
    document.body.dataset.seaTone = tone;
}

function updateDisplayModeFlag() {
    const standaloneByMedia = window.matchMedia?.('(display-mode: standalone)')?.matches;
    const standaloneByNavigator = window.navigator?.standalone === true;
    const isStandalone = !!(standaloneByMedia || standaloneByNavigator);
    document.documentElement.classList.toggle('is-standalone', isStandalone);
    document.body?.classList.toggle('is-standalone', isStandalone);
}

async function registerServiceWorkerIfAvailable() {
    if (!('serviceWorker' in navigator)) return;
    const host = String(window.location.hostname || '');
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    if (!window.isSecureContext && !isLocalHost) return;
    try {
        const swReg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[pwa] service worker registered:', swReg.scope);
    } catch (error) {
        console.warn('[pwa] service worker registration failed:', error);
    }
}

function initPwaShell() {
    updateDisplayModeFlag();
    window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change', updateDisplayModeFlag);
    window.addEventListener('appinstalled', updateDisplayModeFlag);
    registerServiceWorkerIfAvailable();
}

async function ensureBuildingMetaLoaded() {
    if (window.buildingMetaById && Object.keys(window.buildingMetaById).length) {
        return window.buildingMetaById;
    }
    if (buildingMetaPromise) return buildingMetaPromise;
    buildingMetaPromise = (async () => {
        try {
            console.log('[ensureBuildingMetaLoaded] Fetching building meta...');
            const response = await fetch(buildApiUrl('/api/get-building-meta'));
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            window.buildingMetaById = await response.json();
            console.log('[ensureBuildingMetaLoaded] Building meta loaded:', window.buildingMetaById);
        } catch (e) {
            console.error('[ensureBuildingMetaLoaded] Failed to fetch building meta:', e);
            window.buildingMetaById = {};
        }
        return window.buildingMetaById;
    })();
    try {
        return await buildingMetaPromise;
    } finally {
        buildingMetaPromise = null;
    }
}

async function ensureShipCatalogLoaded() {
    if (window.shipCatalog && Object.keys(window.shipCatalog).length) {
        return window.shipCatalog;
    }
    if (shipCatalogPromise) return shipCatalogPromise;
    shipCatalogPromise = (async () => {
        try {
            console.log('[ensureShipCatalogLoaded] Fetching ship catalog...');
            const response = await fetch(buildApiUrl('/api/get-ship-catalog'));
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            window.shipCatalog = await response.json();
            console.log('[ensureShipCatalogLoaded] Ship catalog loaded:', window.shipCatalog);
        } catch (e) {
            console.error('[ensureShipCatalogLoaded] Failed to fetch ship catalog:', e);
            window.shipCatalog = {};
        }
        return window.shipCatalog;
    })();
    try {
        return await shipCatalogPromise;
    } finally {
        shipCatalogPromise = null;
    }
}

if (typeof window !== 'undefined') {
    window.ensureBuildingMetaLoaded = ensureBuildingMetaLoaded;
    window.ensureShipCatalogLoaded = ensureShipCatalogLoaded;
}

async function refreshPlayFabDisplayName(playFabId) {
    if (!playFabId) return;
    try {
        const result = await callApiWithLoader('/api/get-player-display-name', { playFabId }, { isSilent: true });
        const displayName = result?.displayName ? String(result.displayName) : '';
        if (!displayName) return;
        window.myPlayFabDisplayName = displayName;
        const nameEl = document.getElementById('globalPlayerName');
        if (nameEl) nameEl.innerText = displayName;
    } catch (error) {
        console.warn('[displayName] Failed to refresh display name:', error);
    }
}

function normalizeDisplayNameInput(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 25);
}

async function promptChangeDisplayName() {
    if (!myPlayFabId) return;
    const current = normalizeDisplayNameInput(window.myPlayFabDisplayName || document.getElementById('globalPlayerName')?.innerText || '');
    const next = normalizeDisplayNameInput(prompt('新しい名前を入力してください（3〜25文字）', current) || '');
    if (!next || next === current) return;
    if (next.length < 3) {
        showRpgMessage('名前は3文字以上で入力してください。', 2400);
        return;
    }
    try {
        const result = await callApiWithLoader('/api/update-player-display-name', {
            playFabId: myPlayFabId,
            displayName: next
        }, { throwOnError: true });
        const displayName = String(result?.displayName || next).trim();
        window.myPlayFabDisplayName = displayName;
        if (window.myLineProfile) window.myLineProfile.displayName = displayName;
        const nameEl = document.getElementById('globalPlayerName');
        if (nameEl) nameEl.innerText = displayName;
        showRpgMessage('名前を変更しました。', 2200);
    } catch (error) {
        showRpgMessage(error?.message || '名前変更に失敗しました。', 2600);
    }
}

function getAvatarColorForNation(nation) {
    const key = String(nation || '').toLowerCase();
    return AVATAR_COLOR_BY_NATION[key] || null;
}

function getNationLabel(nation) {
    const key = String(nation || '').toLowerCase();
    return NATION_LABEL_BY_KEY[key] || key || '不明';
}

function normalizeInviteToken(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
}

function normalizeNationKey(value) {
    const key = String(value || '').trim().toLowerCase();
    return VALID_NATION_KEYS.includes(key) ? key : '';
}

function getTroyEntryRequestFromUrl() {
    const params = new URLSearchParams(window.location.search || '');
    const action = String(params.get('action') || params.get('entry') || '').trim().toLowerCase();
    const troyFlag = String(params.get('troy') || '').trim().toLowerCase();
    const isEntry = action === 'troy-entry' || action === 'troy' || troyFlag === 'entry';
    if (!isEntry) return null;
    const nationRaw = String(params.get('nation') || params.get('troyNation') || '').trim().toLowerCase();
    const nation = ['fire', 'water', 'wind', 'earth'].includes(nationRaw) ? nationRaw : null;
    return { action: 'troy-entry', nation };
}

function getTroyEntryRequestFromQrValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        const action = String(parsed?.action || parsed?.type || parsed?.kind || '').trim().toLowerCase();
        const isEntry = action === 'troy-entry' || action === 'troy' || parsed?.troyEntry === true;
        if (!isEntry) return null;
        const nation = normalizeNationKey(parsed?.nation || parsed?.troyNation);
        return { action: 'troy-entry', nation: nation || null };
    } catch {
        // non-JSON QR payload
    }
    try {
        const url = new URL(raw);
        const params = url.searchParams;
        const action = String(params.get('action') || params.get('entry') || '').trim().toLowerCase();
        const troyFlag = String(params.get('troy') || '').trim().toLowerCase();
        const pathToken = String(url.pathname.split('/').filter(Boolean).pop() || '').trim().toLowerCase();
        const isEntry = action === 'troy-entry'
            || action === 'troy'
            || troyFlag === 'entry'
            || pathToken === 'troy-entry';
        if (!isEntry) return null;
        const nation = normalizeNationKey(params.get('nation') || params.get('troyNation'));
        return { action: 'troy-entry', nation: nation || null };
    } catch {
        const normalized = raw.toLowerCase();
        if (normalized === 'troy-entry' || normalized.startsWith('troy-entry:')) {
            const [, nationRaw = ''] = raw.split(':');
            const nation = normalizeNationKey(nationRaw);
            return { action: 'troy-entry', nation: nation || null };
        }
    }
    return null;
}

function normalizePlayFabIdFromQrValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    let candidate = raw.replace(/^playfab:/i, '').trim();
    try {
        const parsed = JSON.parse(raw);
        candidate = String(parsed?.playFabId || parsed?.playerId || parsed?.id || '').replace(/^playfab:/i, '').trim();
    } catch {
        try {
            const url = new URL(raw);
            candidate = String(
                url.searchParams.get('playFabId')
                || url.searchParams.get('playerId')
                || url.searchParams.get('id')
                || ''
            ).replace(/^playfab:/i, '').trim();
        } catch {
            // plain QR payload
        }
    }
    const normalized = candidate.toUpperCase();
    return /^[A-F0-9]{16,32}$/.test(normalized) ? normalized : '';
}

function shouldSkipDailyFortuneOnLogin() {
    return !!getTroyEntryRequestFromUrl();
}

async function showDailyFortunePromptAfterLogin() {
    if (shouldSkipDailyFortuneOnLogin()) return;
    try {
        const Tarot = await import(`./js/tarotPoker.js?v=${TAROT_MODULE_VERSION}`);
        if (Tarot && typeof Tarot.showDailyFortunePromptOnLogin === 'function') {
            await Tarot.showDailyFortunePromptOnLogin(myPlayFabId);
        }
    } catch (fortuneError) {
        console.warn('[dailyFortune] Failed to show login prompt:', fortuneError);
    }
}

function clearTroyEntryParamsFromUrl() {
    const url = new URL(window.location.href);
    ['action', 'entry', 'troy', 'nation', 'troyNation'].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, document.title, url.href);
}

function removeInviteTokenFromUrl() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('invite') && !url.searchParams.has('inviteNation')) return;
    url.searchParams.delete('invite');
    url.searchParams.delete('inviteNation');
    window.history.replaceState({}, document.title, url.href);
}

function syncPendingAppInviteTokenFromUrl() {
    const params = new URLSearchParams(window.location.search || '');
    pendingAppInviteToken = normalizeInviteToken(params.get('invite'));
    pendingFixedInviteNation = normalizeNationKey(params.get('inviteNation'));
    window.__pendingAppInviteToken = pendingAppInviteToken;
    window.__pendingFixedInviteNation = pendingFixedInviteNation;
    if (!pendingAppInviteToken && !pendingFixedInviteNation) {
        pendingAppInviteInfo = null;
    }
    return pendingAppInviteToken || pendingFixedInviteNation;
}

function clearPendingAppInviteState({ removeFromUrl = false } = {}) {
    pendingAppInviteToken = '';
    pendingFixedInviteNation = '';
    pendingAppInviteInfo = null;
    window.__pendingAppInviteToken = '';
    window.__pendingFixedInviteNation = '';
    if (removeFromUrl) {
        removeInviteTokenFromUrl();
    }
}

async function getPendingAppInviteInfo(force = false) {
    syncPendingAppInviteTokenFromUrl();
    const token = pendingAppInviteToken;
    const fixedNation = pendingFixedInviteNation;
    if (fixedNation) {
        const key = `fixed:${fixedNation}`;
        if (!force && pendingAppInviteInfo?.token === key) {
            return pendingAppInviteInfo.valid ? pendingAppInviteInfo : null;
        }
        pendingAppInviteInfo = {
            token: key,
            valid: true,
            fixedNation: true,
            inviterDisplayName: 'TROY',
            inviterPlayFabId: '',
            nation: fixedNation,
            expiresAtMs: 0
        };
        return pendingAppInviteInfo;
    }
    if (!token) return null;
    if (!force && pendingAppInviteInfo?.token === token) {
        return pendingAppInviteInfo.valid ? pendingAppInviteInfo : null;
    }
    const info = await callApiWithLoader('/api/get-app-invite-info', {
        inviteToken: token
    }, { isSilent: true });
    if (!info?.valid) {
        pendingAppInviteInfo = { token, valid: false };
        return null;
    }
    pendingAppInviteInfo = {
        token,
        valid: true,
        inviterDisplayName: info.inviterDisplayName || '招待プレイヤー',
        inviterPlayFabId: info.inviterPlayFabId || '',
        nation: String(info.nation || '').toLowerCase(),
        expiresAtMs: Number(info.expiresAtMs || 0) || 0
    };
    return pendingAppInviteInfo;
}

async function updateRaceInviteMessage() {
    const inviteEl = document.getElementById('raceInviteMessage');
    if (!inviteEl) return;
    const inviteInfo = await getPendingAppInviteInfo();
    if (!inviteInfo?.valid) {
        inviteEl.style.display = 'none';
        inviteEl.innerText = '';
        return;
    }
    const inviterName = inviteInfo.inviterDisplayName || '招待プレイヤー';
    inviteEl.innerText = `${inviterName} の招待により、所属国は「${getNationLabel(inviteInfo.nation)}の国」に固定されます。種族だけ選んでください。`;
    inviteEl.style.display = 'block';
}

async function copyTextToClipboard(text) {
    const value = String(text || '');
    if (!value) throw new Error('コピーする内容がありません');
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}

async function createAndCopyInviteLink() {
    const nation = normalizeNationKey(window.myAvatarBaseInfo?.Nation || window.myAvatarBaseInfo?.nation);
    if (!nation) throw new Error('所属国が未設定のため招待URLを作れません');
    const url = new URL(window.location.origin || window.location.href);
    url.pathname = '/';
    url.search = '';
    url.searchParams.set('inviteNation', nation);
    const inviteUrl = url.href;
    await copyTextToClipboard(inviteUrl);
    showRpgMessage(`招待URLをコピーしました。相手は ${getNationLabel(nation)}の国 で開始します。`, 2600);
}

async function applyPendingAppInviteForExistingAccount() {
    const inviteInfo = await getPendingAppInviteInfo();
    if (!inviteInfo?.valid || !inviteInfo.nation || !myPlayFabId) return null;
    const result = await callApiWithLoader('/api/apply-app-invite', {
        playFabId: myPlayFabId,
        inviteToken: inviteInfo.fixedNation ? '' : pendingAppInviteToken,
        inviteNation: inviteInfo.fixedNation ? inviteInfo.nation : '',
        displayName: window.myLineProfile?.displayName || ''
    }, { isSilent: true, throwOnError: true });
    if (result?.skipped && result?.reason === 'IsKing') {
        showRpgMessage('王アカウントのため、招待URLによる所属国変更は行いません。', 2600);
        return result;
    }
    const nation = normalizeNationKey(result?.nation);
    if (nation) {
        const avatarColor = getAvatarColorForNation(nation);
        myAvatarBaseInfo = {
            ...myAvatarBaseInfo,
            Nation: nation,
            AvatarColor: avatarColor || myAvatarBaseInfo.AvatarColor || 'brown'
        };
        window.myAvatarBaseInfo = myAvatarBaseInfo;
    }
    if (result?.changed) {
        showRpgMessage(`${getNationLabel(nation)}の国へ所属を変更しました。`, 2600);
    }
    return result;
}

function getStoredLineFriendClaimMarker() {
    try {
        return String(window.localStorage.getItem(LINE_FRIEND_BONUS_STORAGE_KEY) || '').trim();
    } catch (_) {
        return '';
    }
}

function setStoredLineFriendClaimMarker(value) {
    try {
        if (!value) {
            window.localStorage.removeItem(LINE_FRIEND_BONUS_STORAGE_KEY);
            return;
        }
        window.localStorage.setItem(LINE_FRIEND_BONUS_STORAGE_KEY, String(value));
    } catch (_) {
    }
}

async function fetchLineFriendBonusStatus() {
    if (!myPlayFabId) return null;
    return callApiWithLoader('/api/get-line-friend-bonus-status', {
        playFabId: myPlayFabId
    }, { isSilent: true });
}

async function getLiffFriendshipFlag() {
    if (typeof liff === 'undefined' || typeof liff.getFriendship !== 'function') {
        return null;
    }
    try {
        const friendship = await liff.getFriendship();
        return friendship?.friendFlag === true;
    } catch (error) {
        console.warn('[line-friend] Failed to get LIFF friendship:', error);
        return null;
    }
}

function hasPromptedLineFriendForEntry() {
    try {
        return window.sessionStorage.getItem(LINE_FRIEND_ENTRY_PROMPT_SESSION_KEY) === '1';
    } catch (_) {
        return false;
    }
}

function markLineFriendEntryPrompted() {
    try {
        window.sessionStorage.setItem(LINE_FRIEND_ENTRY_PROMPT_SESSION_KEY, '1');
    } catch (_) {
    }
}

async function promptLineOfficialFriendBeforeTroyEntry() {
    if (hasPromptedLineFriendForEntry()) return;
    const friendFlag = await getLiffFriendshipFlag();
    if (friendFlag === true) return;
    if (typeof liff === 'undefined' || typeof liff.requestFriendship !== 'function') {
        return;
    }
    markLineFriendEntryPrompted();
    try {
        showRpgMessage('TROYの案内を受け取るため、LINE公式アカウントの追加画面を開きます。', 2600);
        await liff.requestFriendship();
        const nextFriendFlag = await getLiffFriendshipFlag();
        if (nextFriendFlag === true) {
            try {
                await claimLineFriendBonus();
            } catch (claimError) {
                console.warn('[line-friend] Failed to auto claim friend bonus after TROY entry prompt:', claimError);
                showRpgMessage('LINE公式アカウントの友だち追加を確認しました。特典はホーム画面から受け取れます。', 2600);
                void refreshLineFriendPromo();
            }
        } else {
            showRpgMessage('友だち追加はあとからホーム画面でもできます。', 2200);
        }
    } catch (error) {
        console.warn('[line-friend] Failed to request friendship before TROY entry:', error);
        showRpgMessage('友だち追加画面を開けませんでした。入店後にホーム画面から追加できます。', 2600);
    }
}

function renderLineFriendPromo(state) {
    lineFriendPromoState = state || null;
    const card = document.getElementById('lineFriendPromo');
    const title = document.getElementById('lineFriendPromoTitle');
    const text = document.getElementById('lineFriendPromoText');
    const button = document.getElementById('btnLineFriendPromoAction');
    if (!card || !title || !text || !button) return;

    if (!state || !state.eligible) {
        card.hidden = true;
        button.disabled = false;
        button.dataset.action = '';
        return;
    }

    card.hidden = false;
    button.disabled = false;
    if (state.claimed) {
        title.textContent = 'LINE公式アカウント';
        text.textContent = `友だち追加特典は受け取り済みです。${state.claimedAmount || state.rewardAmount || 0}G を受け取りました。`;
        button.textContent = '受け取り済み';
        button.disabled = true;
        button.dataset.action = 'claimed';
        return;
    }

    if (state.friendFlag === true) {
        title.textContent = 'LINE公式アカウント';
        text.textContent = `友だち追加を確認しました。${state.rewardAmount || 0}G の特典を受け取れます。`;
        button.textContent = '特典を受け取る';
        button.disabled = false;
        button.dataset.action = 'claim';
        return;
    }

    title.textContent = 'LINE公式アカウント';
    if (state.addFriendUrl) {
        text.textContent = `${state.rewardAmount || 0}G の特典があります。友だち追加後にここで受け取れます。`;
        button.textContent = '友だち追加';
        button.disabled = false;
        button.dataset.action = 'friend';
        return;
    }
    text.textContent = `${state.rewardAmount || 0}G の特典があります。現在は友だち追加URLが未設定です。`;
    button.textContent = '準備中';
    button.disabled = true;
    button.dataset.action = 'friend-pending';
}

async function refreshLineFriendPromo() {
    const status = await fetchLineFriendBonusStatus();
    if (!status?.eligible) {
        renderLineFriendPromo(null);
        return;
    }
    const friendFlag = await getLiffFriendshipFlag();
    const claimedMarker = getStoredLineFriendClaimMarker();
    const nextState = {
        ...status,
        friendFlag,
        claimed: !!status.claimed || (!!claimedMarker && claimedMarker === String(status.claimedAt || claimedMarker))
    };
    nextState.claimedAmount = status.claimedAmount || status.rewardAmount || 0;
    renderLineFriendPromo(nextState);
}

async function claimLineFriendBonus() {
    const accessToken = typeof liff?.getAccessToken === 'function' ? String(liff.getAccessToken() || '').trim() : '';
    if (!accessToken) {
        throw new Error('LINEアクセストークンを取得できませんでした');
    }
    const result = await callApiWithLoader('/api/claim-line-friend-bonus', {
        playFabId: myPlayFabId,
        lineAccessToken: accessToken
    }, { throwOnError: true });
    if (result?.claimedAt) {
        setStoredLineFriendClaimMarker(result.claimedAt);
    }
    if (Number.isFinite(result?.newBalance)) {
        Player.syncPointsDisplay(result.newBalance);
    } else {
        await Player.getPoints(myPlayFabId);
    }
    await refreshLineFriendPromo();
    showRpgMessage(`${result?.rewardAmount || 0}G を受け取りました。`, 2600);
}

function openLineFriendUrl() {
    const url = String(lineFriendPromoState?.addFriendUrl || '').trim();
    if (!url) {
        throw new Error('友だち追加URLが未設定です');
    }
    if (typeof liff !== 'undefined' && typeof liff.openWindow === 'function') {
        liff.openWindow({ url, external: true });
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

async function handleLineFriendPromoAction() {
    const action = String(document.getElementById('btnLineFriendPromoAction')?.dataset.action || '');
    if (!action || action === 'claimed') return;
    if (action === 'friend') {
        openLineFriendUrl();
        showRpgMessage('友だち追加後、もう一度このボタンを押してください。', 2600);
        return;
    }
    if (action === 'claim') {
        await claimLineFriendBonus();
    }
}

function buildCleanLiffUrl() {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of LIFF_CALLBACK_PARAM_KEYS) {
        if (url.searchParams.has(key)) {
            url.searchParams.delete(key);
            changed = true;
        }
    }
    return {
        href: url.href,
        changed
    };
}

function clearLiffRetryMarker() {
    try {
        window.sessionStorage.removeItem(LIFF_AUTH_RETRY_SESSION_KEY);
    } catch (_) {
    }
}

function canRetryLiffAuthCodeRecovery() {
    try {
        return window.sessionStorage.getItem(LIFF_AUTH_RETRY_SESSION_KEY) !== '1';
    } catch (_) {
        return true;
    }
}

function markLiffAuthCodeRecoveryAttempt() {
    try {
        window.sessionStorage.setItem(LIFF_AUTH_RETRY_SESSION_KEY, '1');
    } catch (_) {
    }
}

function stripLiffCallbackParamsFromHistory() {
    const cleanUrl = buildCleanLiffUrl();
    if (!cleanUrl.changed) return cleanUrl;
    window.history.replaceState({}, document.title, cleanUrl.href);
    return cleanUrl;
}

// main.js は export しないため、RACE_COLORS を window に登録
window.RACE_COLORS = RACE_COLORS;

// perf=1 をURLに付けると初期化の所要時間をconsoleに出します
const __perfEnabled = new URLSearchParams(window.location.search).has('perf');
const __perfStart = performance.now();
function __perfLog(label) {
    if (!__perfEnabled) return;
    console.log(`[perf] ${label}: ${Math.round(performance.now() - __perfStart)}ms`);
}

// PlayFab Client SDK の設定
PlayFab.settings.titleId = '1A0BA';

// --- 初期化フロー ---

let homeExplorationButtonBound = false;
let homeExplorationPopupObserver = null;

function closeHomeExplorationPopup() {
    const panel = document.getElementById('shipExplorationPanel');
    if (!panel) return;
    panel.hidden = true;
    panel.classList.remove('is-popup');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-modal');
    document.body.classList.remove('modal-lock');
    if (homeExplorationPopupObserver) {
        homeExplorationPopupObserver.disconnect();
        homeExplorationPopupObserver = null;
    }
}

function ensureHomeExplorationPopupClose(panel) {
    if (!panel || panel.querySelector('[data-home-exploration-close]')) return;
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'home-exploration-popup-close';
    closeButton.setAttribute('aria-label', '閉じる');
    closeButton.setAttribute('data-home-exploration-close', 'true');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', closeHomeExplorationPopup);
    panel.prepend(closeButton);
}

async function openHomeExplorationPopup() {
    const panel = document.getElementById('shipExplorationPanel');
    if (!panel) return;
    panel.hidden = false;
    panel.classList.add('is-popup');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    document.body.classList.add('modal-lock');
    panel.innerHTML = '<div class="ship-exploration-empty">探索情報を読み込み中です。</div>';
    ensureHomeExplorationPopupClose(panel);
    if (!homeExplorationPopupObserver) {
        homeExplorationPopupObserver = new MutationObserver(() => ensureHomeExplorationPopupClose(panel));
        homeExplorationPopupObserver.observe(panel, { childList: true });
    }
    const playFabId = window.myPlayFabId || '';
    if (!playFabId) {
        panel.innerHTML = '<div class="ship-exploration-empty">プレイヤー情報を読み込み中です。</div>';
        ensureHomeExplorationPopupClose(panel);
        return;
    }
    await Ship.loadExplorationPanel(playFabId);
    ensureHomeExplorationPopupClose(panel);
}

function initHomeExplorationButton() {
    if (homeExplorationButtonBound) return;
    const button = document.getElementById('btnHomeExploration');
    if (!button) return;
    button.addEventListener('click', () => {
        void openHomeExplorationPopup();
    });
    homeExplorationButtonBound = true;
}

document.addEventListener('DOMContentLoaded', () => {
    initHomeSurprises();
    initHomeExplorationButton();
    updateSeaToneByTime();
    initPwaShell();
    syncPendingAppInviteTokenFromUrl();
    setInterval(updateSeaToneByTime, 15 * 60 * 1000);
    initializeLiff();
});

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);
const firestore = getFirestore(firebaseApp); // Firestore インスタンス
window.__firebaseAuth = auth;
window.__tkDb = db;
window.__tkUid = null;

// グローバルスコープに登録（WorldMapSceneで使用）
window.firestore = firestore;

async function initializeLiff() {
    try {
        __perfLog('initializeLiff start');
        await liff.init({ liffId: "2008427313-jg0DYMVb" });
        __perfLog('liff.init done');
        clearLiffRetryMarker();
        stripLiffCallbackParamsFromHistory();
        if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: buildCleanLiffUrl().href });
            return;
        }

        const profile = await liff.getProfile();
        __perfLog('liff.getProfile done');
        myLineProfile = profile;
        window.myLineProfile = profile; // グローバルスコープにも設定
        document.getElementById('globalPlayerName').innerText = myLineProfile.displayName;

        const loginData = await callApiWithLoader('/api/login-playfab', {
            lineAccessToken: typeof liff.getAccessToken === 'function' ? liff.getAccessToken() : '',
            lineUserId: myLineProfile.userId,
            displayName: myLineProfile.displayName,
            pictureUrl: myLineProfile.pictureUrl,
            ...(getTroyEntryRequestFromUrl()
                ? {
                    action: 'troy-entry',
                    troyEntry: true,
                    ...(getTroyEntryRequestFromUrl().nation ? { troyNation: getTroyEntryRequestFromUrl().nation } : {})
                }
                : {})
        });
        __perfLog('login-playfab API done');

        if (!loginData) throw new Error('PlayFabログインAPIエラー');
        myPlayFabId = loginData.playFabId;
        window.myPlayFabId = loginData.playFabId; // グローバルスコープにも設定
        window.__resolvedTroyEntryNation = loginData.troyEntryNation || null;

        // --- PlayFab & Firebase Login ---
        authUnsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                if (authHandled) return;
                authHandled = true;
                if (typeof authUnsubscribe === 'function') {
                    authUnsubscribe();
                    authUnsubscribe = null;
                }
                if (lastFirebaseUid === user.uid && playFabLoginDone) {
                    return;
                }
                lastFirebaseUid = user.uid;
                __perfLog('firebase auth state: user');
                console.log("Firebase authenticated successfully. User UID:", user.uid);
                window.__tkUid = user.uid;

                // PlayFab Client SDKにログイン（多重実行ガード）
                if (!playFabLoginPromise) {
                    playFabLoginPromise = (async () => {
                        if (playFabLoginInProgress || playFabLoginDone) return null;
                        playFabLoginInProgress = true;
                        try {
                            const pfLogin = await promisifyPlayFab(PlayFab.ClientApi.LoginWithCustomID, {
                                CustomId: myLineProfile.userId, CreateAccount: false
                            });
                            __perfLog('PlayFab ClientApi.LoginWithCustomID done');
                            const entityKey = pfLogin?.EntityToken?.Entity || null;
                            const entityToken = pfLogin?.EntityToken?.EntityToken || PlayFab?._internalSettings?.entityToken || null;
                            const sessionTicket = pfLogin?.SessionTicket || null;
                            window.myEntityToken = entityToken;
                            window.myPlayFabLoginInfo = {
                                playFabId: pfLogin?.PlayFabId || myPlayFabId || null,
                                entityKey,
                                entityToken,
                                sessionTicket,
                                newlyCreated: !!pfLogin?.NewlyCreated,
                                settingsForUser: pfLogin?.SettingsForUser || null
                            };
                            playFabLoginDone = true;
                            return pfLogin;
                        } finally {
                            playFabLoginInProgress = false;
                        }
                    })();
                }
                try {
                    await playFabLoginPromise;
                } catch (error) {
                    playFabLoginPromise = null;
                    playFabLoginDone = false;
                    throw error;
                }
                void refreshPlayFabDisplayName(myPlayFabId);

                if (loginData.needsRaceSelection) {
                    document.getElementById('appWrapper').style.display = 'block';
                    autoAssignRace();
                } else {
                    const troyEntryRequest = getTroyEntryRequestFromUrl();
                    await applyPendingAppInviteForExistingAccount();
                    clearPendingAppInviteState({ removeFromUrl: true });
                    await initializeAppFeatures();
                    __perfLog('initializeAppFeatures done');
                    document.getElementById('appWrapper').style.display = 'block';
                    void NationKing.refreshKingNav(myPlayFabId);

                    // Check for help request URL parameters
                    const urlParams = new URLSearchParams(window.location.search);
                    if (urlParams.get('action') === 'help') {
                        const islandId = urlParams.get('islandId');
                        if (islandId) {
                            await Island.helpConstruction(islandId, myPlayFabId);
                        }
                    }

                    await showTab('home', { playFabId: myPlayFabId, race: myAvatarBaseInfo.Race || 'human', nation: myAvatarBaseInfo.Nation });
                    __perfLog('showTab(home) done');
                    await handleTroyEntryRequest(troyEntryRequest, { clearUrl: true });
                    await showDailyFortunePromptAfterLogin();
                    scheduleWorldMapPrefetch();
                    const prefetchHeavy = () => {
                        ensureBuildingMetaLoaded();
                        ensureShipCatalogLoaded();
                    };
                    if (typeof requestIdleCallback === 'function') {
                        requestIdleCallback(() => prefetchHeavy());
                    } else {
                        setTimeout(prefetchHeavy, 800);
                    }
                    subscribeTransferNotifications(myPlayFabId);
                }
            }
        });

        if (loginData.firebaseToken) {
            __perfLog('calling signInWithCustomToken');
            signInWithCustomToken(auth, loginData.firebaseToken).catch(error => {
                console.error("Firebase sign-in failed:", error);
                document.getElementById('appWrapper').style.display = 'block';
                document.getElementById('globalPlayerName').innerText = '認証エラー';
            });
        } else {
            console.warn("Firebase token not provided. Running in limited mode.");
            if (loginData.needsRaceSelection) {
                autoAssignRace();
            } else {
                clearPendingAppInviteState({ removeFromUrl: true });
            }
            document.getElementById('appWrapper').style.display = 'block';
        }

    } catch (error) {
        const errorMessage = String(error?.message || error || '');
        if (/invalid authorization code/i.test(errorMessage)) {
            const cleanUrl = buildCleanLiffUrl();
            if (cleanUrl.changed && canRetryLiffAuthCodeRecovery()) {
                markLiffAuthCodeRecoveryAttempt();
                console.warn('[liff] Detected stale authorization code. Reloading with a clean callback URL.');
                window.location.replace(cleanUrl.href);
                return;
            }
        }
        console.error('Error:', error);
        document.getElementById('appWrapper').style.display = 'block';
        document.getElementById('globalPlayerName').innerText = '初期化エラー';
    }
}

async function initializeAppFeatures() {
    if (initializeAppPromise) return initializeAppPromise;
    initializeAppPromise = (async () => {
        console.log('[initializeAppFeatures] Starting initialization...');

    // --- UI event bindings ---
    document.getElementById('btnGetStats').addEventListener('click', () => Player.getPlayerStats(myPlayFabId));
    document.getElementById('btnScanPay').addEventListener('click', startScanAndPay);
    document.getElementById('btnCoinConvert').addEventListener('click', () => openCoinConvertModal('gold_to_coin'));
    document.getElementById('btnCoinGoldConvert')?.addEventListener('click', () => {
        showRpgMessage('チップ返却は王が操作します。MY QRを提示してください。', 2600);
    });
    document.getElementById('btnCancelCoinConvert').addEventListener('click', closeCoinConvertModal);
    document.getElementById('btnConfirmCoinConvert').addEventListener('click', confirmCoinConvert);
    document.getElementById('btnScanEquipmentGacha')?.addEventListener('click', startScanEquipmentGacha);
    document.getElementById('btnCopyInviteLink').addEventListener('click', async () => {
        try {
            await createAndCopyInviteLink();
        } catch (error) {
            console.error('[invite] Failed to create invite link:', error);
            showRpgMessage(`招待URLを作れませんでした: ${error?.message || error}`, 2600);
        }
    });
    document.getElementById('btnLineFriendPromoAction').addEventListener('click', async () => {
        try {
            await handleLineFriendPromoAction();
        } catch (error) {
            console.error('[line-friend] Promo action failed:', error);
            showRpgMessage(`LINE特典を処理できませんでした: ${error?.message || error}`, 2600);
        }
    });
    document.querySelectorAll('.transfer-quick-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const amount = Number(btn.dataset.amount || 0);
            const targetId = String(btn.dataset.target || 'transferAmount');
            const input = document.getElementById(targetId);
            if (!input || !Number.isFinite(amount)) return;
            if (amount === 0) {
                input.value = '0';
                return;
            }
            const current = Number(input.value || 0);
            input.value = String((Number.isFinite(current) ? current : 0) + amount);
        });
    });

    initMapChat(myPlayFabId);
    initTroyChat(myPlayFabId);

    // ── バトルルームシート ──────────────────────────────────
    const battleRoomSheet     = document.getElementById('battleRoomSheet');
    const battleRoomSheetClose = document.getElementById('battleRoomSheetClose');
    const battleRoomCreateBtn  = document.getElementById('battleRoomCreateBtn');
    const battleRoomJoinBtn    = document.getElementById('battleRoomJoinBtn');
    const battleRoomMsg        = document.getElementById('battleRoomMsg');

    function openBattleRoomSheet(territoryId) {
        if (!battleRoomSheet) return;
        battleRoomSheet.dataset.territoryId = territoryId || '';
        battleRoomSheet.setAttribute('aria-hidden', 'false');
        battleRoomSheet.classList.add('is-open');
        if (battleRoomMsg) battleRoomMsg.textContent = '';
    }
    function closeBattleRoomSheet() {
        if (!battleRoomSheet) return;
        battleRoomSheet.setAttribute('aria-hidden', 'true');
        battleRoomSheet.classList.remove('is-open');
    }

    battleRoomSheetClose?.addEventListener('click', closeBattleRoomSheet);

    battleRoomCreateBtn?.addEventListener('click', async () => {
        const territoryId = battleRoomSheet?.dataset.territoryId || '';
        if (battleRoomMsg) battleRoomMsg.textContent = 'ルームを作成中...';
        try {
            const scene = window.worldMapScene;
            await enterBattleRoom(scene, { playFabId: myPlayFabId, territoryId, nation: myAvatarBaseInfo?.Nation || null, mode: 'create' });
            closeBattleRoomSheet();
        } catch (err) {
            if (battleRoomMsg) battleRoomMsg.textContent = err.message || '作成失敗';
        }
    });

    battleRoomJoinBtn?.addEventListener('click', async () => {
        const territoryId = battleRoomSheet?.dataset.territoryId || '';
        if (battleRoomMsg) battleRoomMsg.textContent = '参戦中...';
        try {
            const scene = window.worldMapScene;
            await enterBattleRoom(scene, { playFabId: myPlayFabId, territoryId, nation: myAvatarBaseInfo?.Nation || null, mode: 'join' });
            closeBattleRoomSheet();
        } catch (err) {
            if (battleRoomMsg) battleRoomMsg.textContent = err.message || '参戦失敗';
        }
    });

    window.openBattleRoomSheet = openBattleRoomSheet;
    window.closeBattleRoomSheet = closeBattleRoomSheet;

    // ── バトルタブ：領海カード描画 ──────────────────────────────
    const ELEMENT_LABEL = { fire: '炎', wind: '風', water: '水', earth: '大地' };

    async function loadBattleTab() {
        const list   = document.getElementById('battleTerritoryList');
        const banner = document.getElementById('weeklyContestBanner');
        if (!list) return;
        list.innerHTML = '<div class="battle-territory-loading">読み込み中...</div>';
        try {
            const [terrRes, contestRes] = await Promise.all([
                fetch('/api/territory'),
                fetch('/api/weekly-contest/status'),
            ]);
            const terrData    = await terrRes.json();
            const contestData = contestRes.ok ? await contestRes.json() : null;

            if (banner) renderContestBanner(banner, contestData);
            renderTerritoryCards(list, terrData.territories || [], contestData);
        } catch {
            list.innerHTML = '<div class="battle-territory-loading">読み込みに失敗しました</div>';
        }
    }

    const NATION_LABEL = { fire: '炎', water: '水', wind: '風', earth: '大地' };

    function renderContestBanner(banner, contest) {
        banner.removeAttribute('hidden');
        banner.innerHTML = '';

        if (!contest || contest.status !== 'open') {
            banner.classList.remove('is-open');
            const nextAt = contest?.nextWindowAt
                ? new Date(contest.nextWindowAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })
                : '日曜 21:00 JST';
            banner.innerHTML = `<div class="weekly-contest-banner-next">次の争奪ウィンドウ: <strong>${nextAt}</strong></div>`;
            return;
        }

        banner.classList.add('is-open');
        const c      = contest.contest;
        const dmg    = c.damageByNation || {};
        const total  = Math.max(1, Object.values(dmg).reduce((s, v) => s + v, 0));
        const endMs  = c.windowEnd?._seconds ? c.windowEnd._seconds * 1000 : null;
        const remain = endMs ? Math.max(0, Math.ceil((endMs - Date.now()) / 60000)) : null;
        const timerText = remain !== null ? `残り ${remain} 分` : '';

        const nations = ['fire', 'water', 'wind', 'earth'];
        const barsHtml = nations.map((n) => {
            const val = dmg[n] || 0;
            const pct = Math.round((val / total) * 100);
            return `
                <div class="weekly-contest-damage-row">
                    <span class="weekly-contest-damage-nation">${NATION_LABEL[n] || n}</span>
                    <div class="weekly-contest-damage-track">
                        <div class="weekly-contest-damage-fill ${n}" style="width:${pct}%"></div>
                    </div>
                    <span class="weekly-contest-damage-val">${val.toLocaleString()}</span>
                </div>`;
        }).join('');

        banner.innerHTML = `
            <div class="weekly-contest-banner-header">
                <span class="weekly-contest-banner-title">週次争奪 — 開催中</span>
                <span class="weekly-contest-banner-timer">${timerText}</span>
            </div>
            <div class="weekly-contest-banner-territory">${c.territoryName || c.territoryId}</div>
            <div class="weekly-contest-damage-label">国家別ダメージ</div>
            <div class="weekly-contest-damage-bars">${barsHtml}</div>
        `;

        // 1分ごとにタイマー更新
        if (remain !== null) {
            clearInterval(banner._timerInterval);
            banner._timerInterval = setInterval(() => {
                const r = Math.max(0, Math.ceil((endMs - Date.now()) / 60000));
                const el = banner.querySelector('.weekly-contest-banner-timer');
                if (el) el.textContent = `残り ${r} 分`;
                if (r <= 0) clearInterval(banner._timerInterval);
            }, 60000);
        }
    }

    function renderTerritoryCards(container, territories, contest) {
        container.innerHTML = '';
        const contestedId = contest?.status === 'open' ? contest.contest?.territoryId : null;
        territories.forEach((t) => {
            const ownerText = t.ownerNation
                ? `占領中: ${t.ownerDisplayName || t.ownerNation}`
                : '無所属';
            const elemLabel = ELEMENT_LABEL[t.element] || t.element || '';
            const isContested = t.territoryId === contestedId;
            const card = document.createElement('div');
            card.className = 'battle-territory-card' + (isContested ? ' is-contested' : '');
            card.innerHTML = `
                <div class="battle-territory-card-left">
                    <span class="battle-territory-symbol">${t.symbol || '⚔'}</span>
                </div>
                <div class="battle-territory-card-body">
                    <div class="battle-territory-name">
                        ${t.name}${isContested ? '<span class="battle-territory-contest-badge">争奪中</span>' : ''}
                    </div>
                    <div class="battle-territory-meta">
                        <span class="battle-territory-arcana">${t.arcanaName}</span>
                        <span class="battle-territory-element battle-element-${t.element}">${elemLabel}</span>
                    </div>
                    <div class="battle-territory-owner ${t.ownerNation ? 'is-occupied' : ''}">${ownerText}</div>
                </div>
                <div class="battle-territory-card-right">
                    <button class="battle-territory-btn" type="button"
                        data-territory-id="${t.territoryId}">侵攻する</button>
                </div>
            `;
            card.querySelector('.battle-territory-btn').addEventListener('click', () => {
                openBattleRoomSheet(t.territoryId);
            });
            container.appendChild(card);
        });
    }

    window.addEventListener('tab:battle-visible', () => loadBattleTab());

    document.querySelectorAll('.inventory-panel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.inventoryGroupSwitch) {
                const group = btn.dataset.inventoryGroupSwitch;
                Inventory.switchInventoryGroup(group, { panel: group === 'Tarot' ? 'tarot' : 'items' });
                return;
            }
            Inventory.switchInventoryPanel(btn.dataset.panel);
        });
    });
    document.getElementById('inventorySort').addEventListener('change', () => {
        const currentCategory = Inventory.getActiveInventoryCategory();
        Inventory.renderInventoryGrid(currentCategory);
    });

    document.getElementById('btnGetRanking').addEventListener('click', Player.getRanking);
    document.getElementById('btnShowPsRanking')?.addEventListener('click', () => Player.showRanking('ps'));
    document.getElementById('btnShowDartsRanking')?.addEventListener('click', () => Player.showRanking('darts'));
    document.getElementById('btnShowKaraokeRanking')?.addEventListener('click', () => Player.showRanking('karaoke'));
    document.getElementById('btnGetDartsRanking')?.addEventListener('click', () => Player.getStoreGameRanking('darts_countup'));
    document.getElementById('btnGetKaraokeRanking')?.addEventListener('click', () => Player.getStoreGameRanking('karaoke'));
    document.getElementById('btnHomeScanQr')?.addEventListener('click', startHomeQrScan);
    initHomeExplorationButton();
    document.getElementById('globalPlayerName')?.addEventListener('click', promptChangeDisplayName);
    document.getElementById('btnCreateGuild').addEventListener('click', () => Guild.showCreateGuildModal());
    document.getElementById('btnConfirmCreateGuild').addEventListener('click', () => {
        const guildName = document.getElementById('guildNameInput').value;
        Guild.createGuild(myPlayFabId, guildName);
    });
    document.getElementById('btnCancelCreateGuild').addEventListener('click', () => {
        document.getElementById('guildCreateModal').style.display = 'none';
    });
    document.getElementById('btnScanJoinGuild').addEventListener('click', () => Guild.scanJoinGuild(myPlayFabId));
    document.getElementById('btnLeaveGuild').addEventListener('click', () => Guild.leaveGuild(myPlayFabId));
    document.getElementById('btnViewGuildMembers').addEventListener('click', () => Guild.showGuildMembers(myPlayFabId));
    document.getElementById('btnViewGuildChat').addEventListener('click', () => Guild.showGuildChat(myPlayFabId));
    document.getElementById('btnViewGuildWarehouse').addEventListener('click', () => Guild.showGuildWarehouse(myPlayFabId));
    document.getElementById('btnViewGuildApplications').addEventListener('click', () => Guild.showGuildApplications(myPlayFabId));
    document.getElementById('btnSendGuildChat').addEventListener('click', () => Guild.sendGuildChatMessage(myPlayFabId));
    document.getElementById('guildChatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') Guild.sendGuildChatMessage(myPlayFabId);
    });

    // 船関連のイベントリスナー
    const createShipBtn = document.getElementById('btnCreateShip');
    if (createShipBtn) {
        createShipBtn.addEventListener('click', showCreateShipModal);
    }
    document.getElementById('btnConfirmCreateShip').addEventListener('click', () => confirmCreateShip(myPlayFabId));
    document.getElementById('shipTypeSelect').addEventListener('change', updateShipTypeDetails);
    document.querySelectorAll('[data-avatar-style-action]').forEach((button) => {
        button.addEventListener('click', () => randomizeAvatarStyle(String(button.getAttribute('data-avatar-style-action') || '')));
    });
    window.addEventListener('player:stats-updated', (event) => {
        const level = normalizeLevel(event?.detail?.stats?.Level || 1);
        window.myAvatarBaseInfo = { ...window.myAvatarBaseInfo, level };
        myAvatarBaseInfo = window.myAvatarBaseInfo;
        renderAvatarStylePanel();
    });

    // QRコード生成
    new QRious({ element: document.getElementById('myQrCanvas'), value: myPlayFabId, size: 150 });

    // --- 初期データ取得 ---
    const initPromises = [
        (async () => {
            await updateAvatarBaseInfo();
            renderAvatarStylePanel();
        })()
    ];

    try {
        await Promise.all(initPromises);
    } catch (e) {
        console.warn('[initializeAppFeatures] One or more initialization tasks failed:', e);
    }
    refreshFavoritePlayersList();
    void refreshLineFriendPromo();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            void refreshLineFriendPromo();
        }
    });

    if (typeof window !== 'undefined' && typeof window.initializeBattleSystem === 'function') {
        window.initializeBattleSystem({
            myPlayFabId,
            myCurrentEquipment: Inventory.getMyCurrentEquipment(),
            myInventory: Inventory.getMyInventory(),
            callApiWithLoader,
            renderAvatar,
            getMyCurrentEquipment: Inventory.getMyCurrentEquipment,
            getMyInventory: Inventory.getMyInventory,
            db
        });
    } else {
        console.warn('[initializeAppFeatures] initializeBattleSystem not found');
    }

        console.log('[initializeAppFeatures] Initialization complete (async tasks running).');
    })();
    try {
        return await initializeAppPromise;
    } catch (error) {
        initializeAppPromise = null;
        throw error;
    }
}

function subscribeTransferNotifications(playFabId) {
    if (!firestore || !playFabId) return;
    if (typeof transferNoticeUnsubscribe === 'function') {
        transferNoticeUnsubscribe();
        transferNoticeUnsubscribe = null;
    }
    transferNoticeReady = false;
    lastTransferNoticeId = null;

    const notifQuery = query(
        collection(firestore, 'notifications', playFabId, 'items'),
        orderBy('createdAt', 'desc'),
        limit(5)
    );
    transferNoticeUnsubscribe = onSnapshot(notifQuery, (snapshot) => {
        if (!transferNoticeReady) {
            const firstDoc = snapshot.docs[0];
            if (firstDoc) {
                lastTransferNoticeId = firstDoc.id;
            }
            transferNoticeReady = true;
            return;
        }
        snapshot.docChanges().forEach((change) => {
            if (change.type !== 'added') return;
            if (change.doc.id === lastTransferNoticeId) return;
            lastTransferNoticeId = change.doc.id;
            const data = change.doc.data() || {};
            const amount = Number(data.amount || 0);
            const currency = String(data.currency || 'PS');
            const currencyLabel = formatCurrencyLabel(currency);
            if (amount <= 0) return;
            const noticeType = String(data.type || '');
            const noticeMessage = noticeType === 'king_coin_return'
                ? `ゴールド化されました: ${amount} ${currencyLabel}`
                : `送金を受け取りました: ${amount} ${currencyLabel}`;
            if (typeof showRpgMessage === 'function') {
                showRpgMessage(noticeMessage);
            } else {
                const pointMessageEl = document.getElementById('pointMessage');
                if (pointMessageEl) pointMessageEl.innerText = noticeMessage;
            }
            if (Number.isFinite(Number(data.balanceAfter))) {
                const nextBalance = Number(data.balanceAfter);
                const globalPointsEl = document.getElementById('globalPoints');
                if (globalPointsEl) globalPointsEl.innerText = nextBalance;
                const currentPointsEl = document.getElementById('currentPoints');
                if (currentPointsEl) currentPointsEl.innerText = nextBalance;
            } else {
                void Player.getPoints(playFabId);
            }
        });
    });
}

// --- UI制御系 ---


async function ensureNationGroupForRace(raceName) {
    const mapping = NATION_GROUP_BY_RACE[raceName];
    if (!mapping) throw new Error('Invalid raceName');
    const info = await callApiWithLoader('/api/ensure-nation-group', { raceName }, { isSilent: true });
    if (info && info.groupId) {
        return { groupId: info.groupId, groupName: mapping.groupName, created: !!info.created };
    }
    throw new Error('Failed to ensure nation group');
}


const _RACE_BY_NATION = { fire: 'Human', water: 'Goblin', earth: 'Orc', wind: 'Elf' };

async function autoAssignRace() {
    const ALL_RACES = Object.keys(NATION_GROUP_BY_RACE);
    const inviteInfo = await getPendingAppInviteInfo();
    let raceName, groupInfo = { created: false };

    if (inviteInfo?.valid && inviteInfo.nation) {
        raceName = _RACE_BY_NATION[inviteInfo.nation] || ALL_RACES[Math.floor(Math.random() * ALL_RACES.length)];
    } else {
        raceName = ALL_RACES[Math.floor(Math.random() * ALL_RACES.length)];
        groupInfo = await ensureNationGroupForRace(raceName);
    }

    const entityKey = window.myPlayFabLoginInfo?.entityKey || null;
    if (!entityKey || !entityKey.Id || !entityKey.Type) throw new Error('Entity key not available');
    const displayName = window.myLineProfile?.displayName || '';
    const troyEntryRequest = getTroyEntryRequestFromUrl();
    const data = await callApiWithLoader('/api/set-race', {
        playFabId: myPlayFabId,
        raceName,
        isKing: !!groupInfo.created,
        entityKey,
        entityToken: window.myEntityToken,
        displayName,
        inviteToken: inviteInfo?.valid && !inviteInfo.fixedNation ? pendingAppInviteToken : '',
        inviteNation: inviteInfo?.valid && inviteInfo.fixedNation ? inviteInfo.nation : ''
    });

    if (data !== null) {
        clearPendingAppInviteState({ removeFromUrl: true });
        if (displayName) {
            document.getElementById('globalPlayerName').innerText = displayName;
        }
        const nation = data?.nation?.Nation || null;
        if (nation) {
            const avatarColor = getAvatarColorForNation(nation);
            if (avatarColor) {
                myAvatarBaseInfo = { ...myAvatarBaseInfo, Nation: String(nation).toLowerCase(), AvatarColor: avatarColor };
                window.myAvatarBaseInfo = myAvatarBaseInfo;
            }
        }
        await initializeAppFeatures();
        await NationKing.refreshKingNav(myPlayFabId);
        const nameForLine = displayName || '旅人';
        if (!window.__pendingFirstMapMessages) window.__pendingFirstMapMessages = [];
        window.__pendingFirstMapMessages.push(rpgSay.kingGreeting(nameForLine));
        if (data?.starterAssets?.granted?.includes('ship_common_boat')) {
            window.__pendingFirstMapMessages.push(rpgSay.shipGained());
        }
        await showTab('home', { playFabId: myPlayFabId, race: raceName.toLowerCase(), nation });
        await handleTroyEntryRequest(troyEntryRequest, { clearUrl: true });
        await showDailyFortunePromptAfterLogin();
    } else {
        console.error('[autoAssignRace] set-race returned null, falling back to manual modal');
        showRaceModal();
    }
}

function showRaceModal() {
    document.getElementById('raceModal').style.display = 'flex';
    const titleEl = document.getElementById('raceModalTitle');
    const descriptionEl = document.getElementById('raceModalDescription');
    if (titleEl) titleEl.innerText = '種族選択';
    if (descriptionEl) descriptionEl.innerText = '一度選ぶと変更できません';
    const nameInput = document.getElementById('raceDisplayNameInput');
    if (nameInput) {
        nameInput.value = window.myLineProfile?.displayName || '';
    }
    void updateRaceInviteMessage();

    const handleRaceSelection = async (event) => {
        if (event.target.tagName !== 'BUTTON') return;
        const raceButtonsContainer = document.getElementById('raceButtons');
        raceButtonsContainer.removeEventListener('click', handleRaceSelection);

        const raceName = event.target.dataset.race;
        const raceMessageEl = document.getElementById('raceMessage');
        const inviteInfo = await getPendingAppInviteInfo();
        let groupInfo = { created: false };
        if (raceMessageEl) {
            raceMessageEl.innerText = inviteInfo?.valid ? '（招待された国へ所属を設定中...）' : '（国グループを準備中...）';
        }
        if (!inviteInfo?.valid) {
            groupInfo = await ensureNationGroupForRace(raceName);
        }
        if (raceMessageEl) raceMessageEl.innerText = '（初期ステータスを設定中...）';
        const entityKey = window.myPlayFabLoginInfo?.entityKey || null;
        if (!entityKey || !entityKey.Id || !entityKey.Type) throw new Error('Entity key not available');
        const displayName = (document.getElementById('raceDisplayNameInput')?.value || '').trim();
        const troyEntryRequest = getTroyEntryRequestFromUrl();
        const data = await callApiWithLoader('/api/set-race', {
            playFabId: myPlayFabId,
            raceName: raceName,
            isKing: !!groupInfo.created,
            entityKey,
            entityToken: window.myEntityToken,
            displayName: displayName || window.myLineProfile?.displayName || '',
            inviteToken: inviteInfo?.valid && !inviteInfo.fixedNation ? pendingAppInviteToken : '',
            inviteNation: inviteInfo?.valid && inviteInfo.fixedNation ? inviteInfo.nation : ''
        });
        if (raceMessageEl) raceMessageEl.innerText = '（島と船を準備中...）';
        if (data !== null) {
            document.getElementById('raceModal').style.display = 'none';
            clearPendingAppInviteState({ removeFromUrl: true });
            if (displayName) {
                document.getElementById('globalPlayerName').innerText = displayName;
            }
            await initializeAppFeatures();
            await NationKing.refreshKingNav(myPlayFabId);
            const nation = data?.nation?.Nation || null;
            if (nation) {
                const avatarColor = getAvatarColorForNation(nation);
                if (avatarColor) {
                    myAvatarBaseInfo = {
                        ...myAvatarBaseInfo,
                        Nation: String(nation).toLowerCase(),
                        AvatarColor: avatarColor
                    };
                    window.myAvatarBaseInfo = myAvatarBaseInfo;
                }
            }
            const nameForLine = displayName || window.myLineProfile?.displayName || '旅人';
            if (!window.__pendingFirstMapMessages) window.__pendingFirstMapMessages = [];
            window.__pendingFirstMapMessages.push(rpgSay.kingGreeting(nameForLine));
            if (data?.starterAssets?.granted?.includes('ship_common_boat')) {
                window.__pendingFirstMapMessages.push(rpgSay.shipGained());
            }
            const playerInfo = { playFabId: myPlayFabId, race: raceName.toLowerCase(), nation };
            await showTab('home', playerInfo);
            await handleTroyEntryRequest(troyEntryRequest, { clearUrl: true });
            await showDailyFortunePromptAfterLogin();
        } else {
            document.getElementById('raceMessage').innerText = 'エラーが発生しました。';
            raceButtonsContainer.addEventListener('click', handleRaceSelection);
        }
    };

    const raceButtonsContainer = document.getElementById('raceButtons');
    if (!raceSelectionBound) {
        raceSelectionBound = true;
        raceButtonsContainer.addEventListener('click', async (event) => {
            try {
                await handleRaceSelection(event);
            } finally {
                raceSelectionBound = false;
            }
        }, { once: true });
    }
}

// --- アバター表示ロジック ---

function showNationChangedNotice() {
    if (document.getElementById('nationChangedNotice')) return;
    const notice = document.createElement('div');
    notice.id = 'nationChangedNotice';
    notice.style.cssText = [
        'position: fixed',
        'left: 12px',
        'right: 12px',
        'bottom: 84px',
        'z-index: 9999',
        'background: rgba(17,24,39,0.95)',
        'border: 1px solid #334155',
        'color: #fff',
        'padding: 12px 14px',
        'border-radius: 10px',
        'font-size: 12px',
        'display: flex',
        'align-items: center',
        'justify-content: space-between',
        'gap: 12px'
    ].join(';');
    notice.innerHTML = `
        <div>国が変わりました。再読み込みしてください。</div>
        <button id="nationChangedReload" style="background: var(--accent-color); color: #fff; border: none; padding: 6px 10px; border-radius: 6px; font-size: 12px;">再読み込み</button>
    `;
    document.body.appendChild(notice);

    const btn = document.getElementById('nationChangedReload');
    if (btn) {
        btn.addEventListener('click', () => {
            notice.remove();
            location.reload();
        });
    }
}

async function updateAvatarBaseInfo() {
    console.log('[updateAvatarBaseInfo] Fetching user data from PlayFab...');
    const result = await callApiWithLoader(PlayFab.ClientApi.GetUserReadOnlyData, {
        PlayFabId: myPlayFabId,
        Keys: ["Race", "Nation", "NationChangedAt", "AvatarColor", "SkinColorIndex", "FaceIndex", "HairStyleIndex", "HairColorIndex"]
    }, { isSilent: true });

        if (result && result.Data) {
            const nation = (result.Data.Nation?.Value || '').toLowerCase();
            const nationChangedAt = String(result.Data.NationChangedAt?.Value || '');
            const nationColor = getAvatarColorForNation(nation);
            myAvatarBaseInfo = {
                Race: (result.Data.Race?.Value || 'Human').toLowerCase(),
                Nation: nation,
                AvatarColor: nationColor || result.Data.AvatarColor?.Value || 'brown',
                SkinColorIndex: parseInt(result.Data.SkinColorIndex?.Value, 10) || 1,
                FaceIndex: parseInt(result.Data.FaceIndex?.Value, 10) || 1,
                HairStyleIndex: parseInt(result.Data.HairStyleIndex?.Value, 10) || 1,
                HairColorIndex: parseInt(result.Data.HairColorIndex?.Value, 10) || 1,
                level: getCurrentPlayerLevel()
            };
            window.myAvatarBaseInfo = myAvatarBaseInfo;
            preloadAvatarBaseSprites(myAvatarBaseInfo);

            if (nationChangedAt) {
            const seenAt = String(localStorage.getItem('nationChangedAtSeen') || '');
            if (nationChangedAt !== seenAt) {
                localStorage.setItem('nationChangedAtSeen', nationChangedAt);
                showNationChangedNotice();
            }
        }
    }
}

// --- 機能別ロジック ---

// 5. その他（ステータス、送金）
function promptCoinConvertBeforeEntry(goldBalance) {
    return new Promise((resolve) => {
        const maxConvert = Math.floor(goldBalance / 100) * 100;
        const options = [];
        for (let v = maxConvert; v >= 100; v -= 100) {
            options.push(`<option value="${v}">${v.toLocaleString('ja-JP')} G</option>`);
        }
        const canConvert = options.length > 0;

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9200;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:16px;';
        overlay.innerHTML = `
            <div role="dialog" aria-modal="true" aria-label="入店前のチップ確認" style="background:#1e293b;border-radius:18px;padding:26px 20px 20px;width:100%;max-width:340px;color:#f1f5f9;text-align:left;box-shadow:0 8px 32px rgba(0,0,0,0.6);">
                <div style="font-size:11px;letter-spacing:0.1em;color:#94a3b8;margin-bottom:10px;font-weight:700;text-align:center;">TROY CHIP</div>
                <div style="font-size:18px;font-weight:800;margin-bottom:8px;text-align:center;">入店前にチップを用意しますか？</div>
                <div style="color:#cbd5e1;font-size:13px;line-height:1.6;margin-bottom:14px;text-align:center;">店内で使う分だけ、Gからチップへ交換できます。</div>
                <div style="display:flex;justify-content:space-between;gap:12px;color:#94a3b8;font-size:13px;margin-bottom:10px;">
                    <span>所持G</span>
                    <strong style="color:#fbbf24;">${goldBalance.toLocaleString('ja-JP')} G</strong>
                </div>
                ${canConvert ? `
                    <label for="__troyEntryCoinSel" style="display:block;color:#cbd5e1;font-size:12px;font-weight:700;margin-bottom:6px;">チップ化する金額</label>
                    <select id="__troyEntryCoinSel" style="width:100%;padding:11px 10px;border-radius:10px;background:#0f172a;border:1px solid #334155;color:#f1f5f9;font-size:15px;margin-bottom:8px;appearance:auto;">
                        ${options.join('')}
                    </select>
                    <div style="color:#94a3b8;font-size:12px;line-height:1.5;margin-bottom:18px;">あとからホーム画面でもチップ化できます。</div>
                ` : '<div style="color:#fca5a5;font-size:13px;line-height:1.5;margin-bottom:18px;text-align:center;">100G単位でチップ化できるGがありません。</div>'}
                <div style="display:flex;gap:10px;">
                    <button id="__troyEntryCoinSkip" type="button" style="flex:1;padding:13px 0;border-radius:10px;border:none;background:#334155;color:#cbd5e1;font-size:14px;cursor:pointer;">そのまま入店</button>
                    <button id="__troyEntryCoinOk" type="button" ${canConvert ? '' : 'disabled'} style="flex:1;padding:13px 0;border-radius:10px;border:none;background:#f59e0b;color:#0f172a;font-size:14px;font-weight:700;cursor:pointer:${canConvert ? 'pointer' : 'not-allowed'};opacity:${canConvert ? '1' : '0.55'};">チップ化して入店</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#__troyEntryCoinSkip').addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve(0);
        });
        overlay.querySelector('#__troyEntryCoinOk').addEventListener('click', () => {
            const sel = overlay.querySelector('#__troyEntryCoinSel');
            const amount = Math.floor(Number(sel?.value || 0) / 100) * 100;
            document.body.removeChild(overlay);
            resolve(amount >= 100 ? amount : 0);
        });
    });
}

async function handleTroyEntryRequest(entryRequest, options = {}) {
    if (!entryRequest || !myPlayFabId) return;
    try {
        await promptLineOfficialFriendBeforeTroyEntry();
        const joinBody = {
            playFabId: myPlayFabId,
            displayName: window.myLineProfile?.displayName || window.myPlayFabDisplayName || '',
            pictureUrl: window.myLineProfile?.pictureUrl || ''
        };
        const resolvedEntryNation = window.__resolvedTroyEntryNation || entryRequest.nation || null;
        if (resolvedEntryNation) joinBody.troyNation = resolvedEntryNation;
        const result = await callApiWithLoader('/api/troy-join', joinBody, { throwOnError: true });
        window.__troyEntryNation = result.nation || resolvedEntryNation || null;

        // Get fresh balance (includes entry bonus if granted)
        const { points: goldBalance } = await Player.getPoints(myPlayFabId, { isSilent: true }) || {};
        let convertedAmount = 0;
        const convertAmount = await promptCoinConvertBeforeEntry(goldBalance || 0);
        if (convertAmount >= 100) {
            try {
                await callApiWithLoader('/api/troy-convert-gold-to-coin', {
                    playFabId: myPlayFabId,
                    amount: convertAmount,
                    requestId: createRequestId('troy-gold-to-coin')
                }, { isSilent: true, throwOnError: true });
                convertedAmount = convertAmount;
            } catch (error) {
                showRpgMessage(formatCoinActionError(error, 'チップ化に失敗しました。'), 3200);
            }
        }

        await showTab('troy', {
            playFabId: myPlayFabId,
            race: myAvatarBaseInfo.Race || 'human',
            nation: result.nation || resolvedEntryNation
        });

        const parts = [];
        if (result?.entryChargeCreated) parts.push('TROYに入店しました');
        else parts.push('TROYに入店済みです');
        if (result?.entryBonusGranted > 0) parts.push(`${result.entryBonusGranted}G 獲得`);
        if (convertedAmount > 0) parts.push(`${convertedAmount.toLocaleString('ja-JP')}G をチップに変換`);
        showRpgMessage(parts.join(' / '), 2800);
    } catch (error) {
        const detail = String(error?.message || error || '');
        const message = detail.includes('TroyClosed')
            ? '現在TROYはCLOSE中です。'
            : '入店処理に失敗しました。店員にお声がけください。';
        showRpgMessage(message, 3200);
    } finally {
        if (options.clearUrl) clearTroyEntryParamsFromUrl();
    }
}


function getTransferAmountValue() {
    const amount = Math.max(0, Math.floor(Number(document.getElementById('transferAmount')?.value) || 0));
    return Number.isFinite(amount) ? amount : 0;
}

async function startScanAndPay() {
    if (!liff.isInClient()) {
        document.getElementById('pointMessage').innerText = 'QRスキャンはLINEアプリ内でのみ利用できます。';
        return;
    }
    try {
        const result = await liff.scanCodeV2();
        if (result && result.value) {
            const amount = getTransferAmountValue();
            if (amount <= 0) {
                document.getElementById('pointMessage').innerText = '金額を入力してください。';
                return;
            }
            let receiverName = '';
            try {
                const profile = await callApiWithLoader('/api/get-player-display-name', { playFabId: result.value }, { isSilent: true });
                receiverName = String(profile?.displayName || '').trim();
            } catch {
                receiverName = '';
            }
            showConfirmationModal(amount, result.value, receiverName, async () => {
                const fromEntityKey = window.myPlayFabLoginInfo?.entityKey || null;
                const requestId = createRequestId('transfer');
                const data = await callApiWithLoader('/api/transfer-points', {
                    fromId: myPlayFabId,
                    toId: result.value,
                    amount,
                    fromEntityKey,
                    requestId
                });
                if (data) {
                    const bountyNote = data.bountyShortage
                        ? '（相手の懸賞金が不足していたため、BTの移動は一部だけ）'
                        : '';
                    document.getElementById('pointMessage').innerText = `${amount}G送りました！${bountyNote}`;
                    const amountInput = document.getElementById('transferAmount');
                    if (amountInput) amountInput.value = '0';
                    const transferCard = document.querySelector('.home-transfer-card');
                    if (transferCard) {
                        transferCard.classList.remove('shake');
                        void transferCard.offsetWidth;
                        transferCard.classList.add('shake');
                    }
                    await Player.getPoints(myPlayFabId);
                    await Player.getRanking();
                }
            });
        }
    } catch (e) {
        document.getElementById('pointMessage').innerText = "スキャン失敗: " + e.message;
    }
}

function getEquipmentGachaElements() {
    return {
        button: document.getElementById('btnScanEquipmentGacha'),
        chest: document.getElementById('equipmentGachaChest'),
        result: document.getElementById('equipmentGachaResult')
    };
}

function setEquipmentGachaChestState(state) {
    const chest = getEquipmentGachaElements().chest;
    if (!chest) return;
    chest.classList.remove('is-idle', 'is-opening', 'is-open');
    chest.classList.add(`is-${state || 'idle'}`);
}

function normalizeEquipmentGachaQrValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = JSON.parse(raw);
        const type = String(parsed?.type || parsed?.kind || parsed?.action || '').trim().toLowerCase();
        if (type) return type;
    } catch {
        // non-JSON QR payload
    }
    try {
        const url = new URL(raw);
        return String(
            url.searchParams.get('gacha')
            || url.searchParams.get('type')
            || url.searchParams.get('action')
            || url.hash.replace(/^#/, '')
            || url.pathname.split('/').filter(Boolean).pop()
            || ''
        ).trim().toLowerCase();
    } catch {
        return raw.toLowerCase();
    }
}

function isEquipmentGachaQrValue(value) {
    const normalized = normalizeEquipmentGachaQrValue(value);
    return [
        'equipment-gacha',
        'equip-gacha',
        'equipment',
        'gacha',
        'treasure',
        'treasure-chest',
        'troy:equipment-gacha',
        'troy:gacha:equipment',
        'gacha:equipment'
    ].includes(normalized) || normalized.startsWith('equipment-gacha:');
}

async function scanQrValue() {
    if (typeof liff.scanCodeV2 === 'function') {
        const result = await liff.scanCodeV2();
        return result && result.value ? String(result.value).trim() : '';
    }
    if (typeof liff.scanCode === 'function') {
        const result = await liff.scanCode();
        return result && result.value ? String(result.value).trim() : '';
    }
    throw new Error('この環境では QR 読み取りが利用できません。');
}

async function startHomeQrScan() {
    const button = document.getElementById('btnHomeScanQr');
    if (!liff.isInClient()) {
        showRpgMessage('QRスキャンはLINEアプリ内でのみ利用できます。', 2600);
        return;
    }
    if (!myPlayFabId) {
        showRpgMessage('ログイン後に利用できます。', 2400);
        return;
    }
    const previousLabel = button?.innerText || '';
    if (button) {
        button.disabled = true;
        button.innerText = '読み取り中...';
    }
    try {
        const qrValue = await scanQrValue();
        if (!qrValue) {
            showRpgMessage('QRを読み取れませんでした。', 2400);
            return;
        }

        const entryRequest = getTroyEntryRequestFromQrValue(qrValue);
        if (entryRequest) {
            await handleTroyEntryRequest(entryRequest);
            return;
        }

        if (isEquipmentGachaQrValue(qrValue)) {
            showRpgMessage('装備品ガチャQRは、持ち物タブの宝箱から読み込んでください。', 3200);
            return;
        }

        const targetPlayFabId = normalizePlayFabIdFromQrValue(qrValue);
        if (targetPlayFabId) {
            await openPlayerProfile(targetPlayFabId);
            return;
        }

        showRpgMessage('このQRはアプリで処理できません。', 2600);
    } catch (error) {
        showRpgMessage(`QR読み取りに失敗しました: ${error?.message || error}`, 3000);
    } finally {
        if (button) {
            button.disabled = false;
            button.innerText = previousLabel || 'QRを読み込む';
        }
    }
}

async function startScanEquipmentGacha() {
    const { button, result } = getEquipmentGachaElements();
    if (!liff.isInClient()) {
        if (result) result.innerText = 'QRスキャンはLINEアプリ内でのみ利用できます。';
        return;
    }
    if (!myPlayFabId) {
        if (result) result.innerText = 'ログイン後に利用できます。';
        return;
    }

    const previousLabel = button?.innerText || '';
    if (button) {
        button.disabled = true;
        button.innerText = 'QRを読み取り中...';
    }
    if (result) result.innerText = '';
    setEquipmentGachaChestState('idle');

    try {
        const qrValue = await scanQrValue();
        if (!isEquipmentGachaQrValue(qrValue)) {
            if (result) result.innerText = '装備品ガチャ用のQRコードではありません。';
            return;
        }

        if (button) button.innerText = '宝箱を開封中...';
        setEquipmentGachaChestState('opening');
        await new Promise((resolve) => setTimeout(resolve, 720));

        const data = await callApiWithLoader('/api/pull-gacha', { playFabId: myPlayFabId }, { throwOnError: true });
        const grantedItem = Array.isArray(data?.grantedItems) ? data.grantedItems[0] : null;
        const itemId = grantedItem?.ItemId || grantedItem?.Item?.Id || '';
        const itemName = String(grantedItem?.DisplayName || grantedItem?.Name || itemId || '装備品').trim();

        setEquipmentGachaChestState('open');
        if (result) result.innerText = `${itemName} を手に入れました。`;
        showRpgMessage(`${itemName} を手に入れた。`, 2600);
        await Inventory.getInventory(myPlayFabId, { force: true });
        await Player.getPoints(myPlayFabId);
        await Inventory.refreshResourceSummary(myPlayFabId);
    } catch (error) {
        console.error('[equipment-gacha] failed:', error);
        setEquipmentGachaChestState('idle');
        if (result) result.innerText = error?.message || '装備品ガチャに失敗しました。';
    } finally {
        if (button) {
            button.disabled = false;
            button.innerText = previousLabel || 'QRを読み込んで開ける';
        }
    }
}

let coinConvertMode = 'gold_to_coin';
const TROY_COIN_RETURN_QR_VALUE = 'troy:coin-return';

function isTroyCoinReturnQrValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;
    if (raw.toLowerCase() === TROY_COIN_RETURN_QR_VALUE) return true;
    try {
        const url = new URL(raw, window.location.origin);
        const action = String(url.searchParams.get('action') || url.searchParams.get('troy') || '').trim().toLowerCase();
        return url.pathname.endsWith('/troy-coin-return.html') || action === 'coin-return' || action === 'troy-coin-return';
    } catch (_) {
        return false;
    }
}

function formatCoinActionError(error, fallback = 'コイン処理に失敗しました。') {
    const raw = String(error?.message || error?.errorMessage || error?.error || error || '').trim();
    const message = raw
        .replace(/^通信エラー:\s*/, '')
        .replace(/\s*\(HTTP\s+\d+\)\s*$/i, '')
        .trim();
    if (!message) return fallback;
    if (message.includes('ゴールドが不足') || message.includes('InsufficientFunds')) {
        return 'ゴールドが不足しています。';
    }
    if (message.includes('100G単位')) {
        return message;
    }
    if (message.includes('requestId is required')) {
        return '処理IDの発行に失敗しました。画面を再読み込みしてもう一度お試しください。';
    }
    if (message.includes('TroyClosed')) {
        return '現在TROYはCLOSE中です。';
    }
    if (message.includes('NotInTroy')) {
        return '入店状態を確認できません。もう一度入店してください。';
    }
    if (message.includes('Authentication required')) {
        return 'ログイン状態を確認できません。再ログインしてください。';
    }
    if (message.includes('コイン返却は王') || message.includes('チップ返却は王')) {
        return 'チップ返却は王の操作画面から行ってください。';
    }
    return message;
}

function openCoinConvertModal(mode = 'gold_to_coin') {
    coinConvertMode = mode === 'coin_to_gold' ? 'coin_to_gold' : 'gold_to_coin';
    const amount = getTransferAmountValue();
    const pointMessageEl = document.getElementById('pointMessage');
    if (amount <= 0) {
        if (pointMessageEl) pointMessageEl.innerText = coinConvertMode === 'coin_to_gold'
            ? '返却するチップ金額を入力してください。'
            : 'チップ化する金額を入力してください。';
        return;
    }
    if (amount % 100 !== 0) {
        if (pointMessageEl) pointMessageEl.innerText = 'チップ化は100G単位で入力してください。';
        return;
    }
    const titleEl = document.getElementById('coinConvertTitle');
    const amountEl = document.getElementById('coinConvertAmount');
    const textEl = document.getElementById('coinConvertText');
    const resultEl = document.getElementById('coinConvertResult');
    const confirmBtn = document.getElementById('btnConfirmCoinConvert');
    const isGoldize = coinConvertMode === 'coin_to_gold';
    if (titleEl) titleEl.innerText = isGoldize ? 'チップ返却' : 'チップ化';
    if (amountEl) amountEl.innerText = `${amount.toLocaleString('ja-JP')}G`;
    if (textEl) textEl.innerText = isGoldize
        ? '店員の返却用QRコードを読み取り、店内チップをゴールドに戻します。入店後にチップ化した合計を超えた分だけ経験値が増えます。'
        : '店内チップに交換します。';
    if (resultEl) resultEl.innerText = '';
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerText = isGoldize ? '返却用QRを読み取る' : '確認してチップ化';
    }
    const modal = document.getElementById('coinConvertModal');
    if (modal) modal.style.display = 'flex';
}

function closeCoinConvertModal() {
    const modal = document.getElementById('coinConvertModal');
    if (modal) modal.style.display = 'none';
}

function showCoinConvertReceipt(amount) {
    const mainEl = document.getElementById('coinConvertMain');
    const receiptEl = document.getElementById('coinConvertReceipt');
    const staffAmountEl = document.getElementById('coinConvertReceiptAmountStaff');
    const receivedBtn = document.getElementById('btnCoinConvertReceived');
    if (mainEl) mainEl.hidden = true;
    if (receiptEl) receiptEl.hidden = false;
    if (staffAmountEl) staffAmountEl.innerText = `${Math.max(0, Math.floor(Number(amount) || 0)).toLocaleString('ja-JP')}G`;
    if (receivedBtn && !receivedBtn.dataset.bound) {
        receivedBtn.dataset.bound = 'true';
        receivedBtn.addEventListener('click', closeCoinConvertModal);
    }
}

async function confirmCoinConvert() {
    const amount = getTransferAmountValue();
    const resultEl = document.getElementById('coinConvertResult');
    const confirmBtn = document.getElementById('btnConfirmCoinConvert');
    const mainEl = document.getElementById('coinConvertMain');
    const receiptEl = document.getElementById('coinConvertReceipt');
    const isGoldize = coinConvertMode === 'coin_to_gold';
    if (mainEl) mainEl.hidden = false;
    if (receiptEl) receiptEl.hidden = true;
    if (amount <= 0) {
        if (resultEl) resultEl.innerText = '金額を入力してください。';
        return;
    }
    if (amount % 100 !== 0) {
        if (resultEl) resultEl.innerText = 'チップ化は100G単位で入力してください。';
        return;
    }
    const previousLabel = confirmBtn?.innerText || '';
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerText = '処理中...';
    }
    try {
        const endpoint = isGoldize ? '/api/troy-convert-coin-to-gold' : '/api/troy-convert-gold-to-coin';
        let coinReturnQrToken = '';
        if (isGoldize) {
            if (!liff.isInClient()) throw new Error('チップ返却QRの読み取りはLINEアプリ内でのみ利用できます。');
            if (resultEl) resultEl.innerText = '店員の返却用QRコードを読み取ってください。';
            if (confirmBtn) confirmBtn.innerText = 'QRを読み取り中...';
            coinReturnQrToken = await scanQrValue();
            if (!isTroyCoinReturnQrValue(coinReturnQrToken)) {
                throw new Error('チップ返却用QRコードではありません。');
            }
        }
        const data = await callApiWithLoader(endpoint, {
            playFabId: myPlayFabId,
            amount,
            coinReturnQrToken,
            requestId: createRequestId(isGoldize ? 'troy-coin-to-gold' : 'troy-gold-to-coin')
        }, { throwOnError: true });
        if (!data) throw new Error(isGoldize ? 'チップ返却に失敗しました。' : 'チップ化に失敗しました。');
        const contributionAmount = Math.max(0, Math.floor(Number(data.contributionAmount) || 0));
        const contributionNote = isGoldize && contributionAmount > 0
            ? ` / 経験値 +${contributionAmount.toLocaleString('ja-JP')}`
            : '';
        const unlockNote = isGoldize ? formatUnlockedFeatures(data.contribution?.unlockedFeatures) : '';
        const levelNote = isGoldize && data.contribution?.leveledUp
            ? `\nLv.${data.contribution.previousLevel} → Lv.${data.contribution.level}${unlockNote ? `\n${unlockNote}` : ''}`
            : '';
        const message = (isGoldize
            ? `${amount.toLocaleString('ja-JP')}Gをチップ返却しました。${contributionNote}`
            : `${amount.toLocaleString('ja-JP')}Gをチップ化しました。`) + levelNote;
        if (resultEl) resultEl.innerText = message;
        document.getElementById('pointMessage').innerText = message;
        const amountInput = document.getElementById('transferAmount');
        if (amountInput) amountInput.value = '0';
        await Player.getPoints(myPlayFabId);
        await Player.getRanking();
        if (isGoldize) {
            setTimeout(closeCoinConvertModal, 1200);
        } else {
            showCoinConvertReceipt(amount);
        }
    } catch (error) {
        const message = formatCoinActionError(error, isGoldize ? 'チップ返却に失敗しました。' : 'チップ化に失敗しました。');
        if (resultEl) resultEl.innerText = message;
        const pointMessageEl = document.getElementById('pointMessage');
        if (pointMessageEl) pointMessageEl.innerText = message;
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerText = previousLabel || (isGoldize ? '返却用QRを読み取る' : '確認してチップ化');
        }
    }
}

// --- 船管理機能 ---

// ハードコードされた船情報を削除し、代わりに window.shipCatalog を使用します。

let shipCreateInFlight = false;
let shipCreateContext = null;
let shipCreateBalances = null;
let avatarStyleSaveInFlight = false;

function getCurrentPlayerLevel() {
    return normalizeLevel(Player.getMyPlayerStats?.()?.Level || window.myAvatarBaseInfo?.level || 1);
}

function renderAvatarStylePanel() {
    const panel = document.getElementById('avatarStylePanel');
    if (!panel) return;
    const level = getCurrentPlayerLevel();
    const hairUnlocked = isFeatureUnlocked('haircut', level);
    const faceUnlocked = isFeatureUnlocked('faceChange', level);
    const skinUnlocked = isFeatureUnlocked('skinChange', level);
    const actionState = { haircut: hairUnlocked, face: faceUnlocked, skin: skinUnlocked };
    panel.querySelectorAll('[data-avatar-style-action]').forEach((button) => {
        const action = String(button.getAttribute('data-avatar-style-action') || '');
        button.disabled = avatarStyleSaveInFlight || !actionState[action];
    });

    const summaryEl = document.getElementById('avatarStyleUnlockSummary');
    if (summaryEl) summaryEl.textContent = `Lv.${level}`;
    const noticeEl = document.getElementById('avatarStyleNotice');
    if (noticeEl) {
        const notes = [
            level >= FEATURE_UNLOCK_LEVELS.hairVisible ? '髪型表示: 開放済み' : `髪型表示: Lv.${FEATURE_UNLOCK_LEVELS.hairVisible}`,
            hairUnlocked ? '散髪: 開放済み' : `散髪: Lv.${FEATURE_UNLOCK_LEVELS.haircut}`,
            skinUnlocked ? '美容: 開放済み' : `美容: Lv.${FEATURE_UNLOCK_LEVELS.skinChange}`,
            faceUnlocked ? '整形: 開放済み' : `整形: Lv.${FEATURE_UNLOCK_LEVELS.faceChange}`
        ];
        noticeEl.textContent = notes.join(' / ');
    }
}

async function randomizeAvatarStyle(action) {
    if (avatarStyleSaveInFlight || !window.myPlayFabId) return;
    const level = getCurrentPlayerLevel();
    const featureByAction = { haircut: 'haircut', skin: 'skinChange', face: 'faceChange' };
    const labelByAction = { haircut: '散髪', skin: '美容', face: '整形' };
    const feature = featureByAction[action];
    if (!feature || !isFeatureUnlocked(feature, level)) {
        showRpgMessage(`${labelByAction[action] || '美容室'}はLv.${FEATURE_UNLOCK_LEVELS[feature] || FEATURE_UNLOCK_LEVELS.haircut}から利用できます。`);
        return;
    }
    const cost = action === 'face' ? 1000 : 500;
    const confirmed = window.confirm(`${labelByAction[action]}を行いますか？\n${cost}Gを消費して、現在とは違う見た目にランダム変更します。`);
    if (!confirmed) return;
    avatarStyleSaveInFlight = true;
    renderAvatarStylePanel();
    try {
        const result = await requestUpdateAvatarStyle(window.myPlayFabId, {
            action,
            requestId: createRequestId(`avatar-${action}`)
        }, { throwOnError: true });
        if (result?.success) {
            window.myAvatarBaseInfo = { ...window.myAvatarBaseInfo, ...result.avatarStyle, level };
            myAvatarBaseInfo = window.myAvatarBaseInfo;
            preloadAvatarBaseSprites(myAvatarBaseInfo);
            renderAvatar('avatar', myAvatarBaseInfo, Inventory.getMyCurrentEquipment?.() || {}, Inventory.getMyInventory?.() || {}, false);
            renderAvatar('home-avatar', myAvatarBaseInfo, Inventory.getMyCurrentEquipment?.() || {}, Inventory.getMyInventory?.() || {}, false);
            showRpgMessage(`${labelByAction[action]}で見た目を変更しました。-${result.cost || cost}G`);
        }
    } catch (error) {
        showRpgMessage(error?.message || '見た目の変更に失敗しました。');
    } finally {
        avatarStyleSaveInFlight = false;
        renderAvatarStylePanel();
    }
}

function blockMapClicksForModal(modalEl) {
    if (!modalEl || modalEl.dataset?.blockMapClicks === 'true') return;
    const stopPhaser = (e) => {
        if (!e) return;
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    };
    ['pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click', 'wheel'].forEach((type) => {
        modalEl.addEventListener(type, stopPhaser);
    });
    modalEl.addEventListener('touchmove', (e) => {
        stopPhaser(e);
    }, { passive: true });
    modalEl.dataset.blockMapClicks = 'true';
}

async function showCreateShipModal(context) {
    const level = getCurrentPlayerLevel();
    if (!isFeatureUnlocked('shipPurchase', level)) {
        showRpgMessage(`船の建造はLv.${FEATURE_UNLOCK_LEVELS.shipPurchase}から利用できます。`);
        return;
    }
    shipCreateContext = context || null;
    shipCreateBalances = await Ship.getShipResourceBalances(window.myPlayFabId);
    const selectEl = document.getElementById('shipTypeSelect');
    selectEl.innerHTML = ''; // 既存のオプションをクリア

    await ensureShipCatalogLoaded();

    if (!window.shipCatalog || Object.keys(window.shipCatalog).length === 0) {
        selectEl.innerHTML = '<option value="">利用可能な船がありません</option>';
        document.getElementById('shipTypeDetails').innerHTML = '船の情報を取得できませんでした。';
        document.getElementById('btnConfirmCreateShip').disabled = true;
        return;
    }

    document.getElementById('btnConfirmCreateShip').disabled = false;

    // カタログから船のリストを<option>として追加（種族制限あり）
    const myRace = String(window.myAvatarBaseInfo?.Race || '').toLowerCase().trim();
    for (const itemId in window.shipCatalog) {
        const ship = window.shipCatalog[itemId];
        const shipRace = String(ship?.race || ship?.Race || '').toLowerCase().trim();
        if (shipRace && shipRace !== 'common' && myRace && shipRace !== myRace) {
            continue;
        }
        const option = document.createElement('option');
        option.value = itemId;
        option.textContent = ship.DisplayName;
        selectEl.appendChild(option);
    }

    if (!selectEl.options.length) {
        selectEl.innerHTML = '<option value="">建造できる船がありません</option>';
        document.getElementById('shipTypeDetails').innerHTML = '現在の種族で建造できる船がありません。';
        document.getElementById('btnConfirmCreateShip').disabled = true;
        return;
    }

    const modal = document.getElementById('shipCreateModal');
    blockMapClicksForModal(modal);
    modal.style.display = 'flex';
    // 最初の項目で詳細を更新
    updateShipTypeDetails();
}

if (typeof window !== 'undefined') {
    window.showCreateShipModal = showCreateShipModal;
}

function updateShipTypeDetails() {
    const shipItemId = document.getElementById('shipTypeSelect').value;
    if (!shipItemId || !window.shipCatalog[shipItemId]) {
        document.getElementById('shipTypeDetails').innerHTML = '';
        document.getElementById('btnConfirmCreateShip').disabled = true;
        return;
    }

    const info = window.shipCatalog[shipItemId];
    const currencyPrices = {};
    if (Array.isArray(info.PriceAmounts)) {
        info.PriceAmounts.forEach((entry) => {
            const key = entry?.ItemId || entry?.itemId;
            if (!key) return;
            currencyPrices[key] = Number(entry.Amount || 0);
        });
    }
    if (Object.keys(currencyPrices).length === 0 && info.VirtualCurrencyPrices) {
        Object.assign(currencyPrices, info.VirtualCurrencyPrices);
    }
    const costDisplays = Object.entries(currencyPrices)
        .filter(([, amount]) => Number(amount) > 0)
        .map(([code, amount]) => `${Number(amount)} ${formatCurrencyLabel(code)}`);
    const costString = costDisplays.length > 0 ? costDisplays.join(' + ') : '無料';

    const resourceCosts = Ship.getShipBuildResourceCosts(info);
    const shortages = Ship.getShipResourceShortages(resourceCosts, shipCreateBalances || {});
    const canAfford = shortages.length === 0;
    document.getElementById('btnConfirmCreateShip').disabled = !canAfford;

    const domainLabel = (() => {
        switch (info.Domain) {
            case 'sea_underwater': return '海中';
            case 'air': return '飛空';
            case 'sea_surface':
            default: return '海上';
        }
    })();

    const catalogVision = Number(info.VisionRange);
    const visionValue = Number.isFinite(catalogVision) ? catalogVision : Number(info?.Stats?.VisionRange || 0);
    const actionInfo = (() => {
        if (typeof window === 'undefined' || !window.SHIP_ACTIONS) return null;
        const key = String(shipItemId || '').toLowerCase();
        const friendlyId = String(info?.FriendlyId || info?.friendlyId || '').toLowerCase();
        return window.SHIP_ACTIONS[key] || (friendlyId ? window.SHIP_ACTIONS[friendlyId] : null);
    })();
    const actionLabel = actionInfo?.label || 'なし';
    const actionDescription = actionInfo?.description || '';

    const shortageLine = canAfford
        ? '<div style="margin-top: 8px; color: var(--hp-color);">Resources ready</div>'
        : `<div style="margin-top: 8px; color: var(--danger-color);">Missing: ${shortages.map((entry) => `${formatCurrencyLabel(entry.ItemId)} ${entry.shortage}`).join(' / ')}</div>`;

    document.getElementById('shipTypeDetails').innerHTML = `
        <div>タイプ: ${domainLabel}</div>
        <div>HP: ${info.MaxHP}</div>
        <div>速度: ${info.Speed} タイル/秒</div>
        <div>視覚距離: ${visionValue}</div>
        <div>積荷容量: ${info.CargoCapacity}</div>
        <div>乗組員: ${info.CrewCapacity}人</div>
        <div>アクション: ${actionLabel}</div>
        ${actionDescription ? `<div style="font-size: 12px; color: var(--text-sub);">効果: ${actionDescription}</div>` : ''}
        <div style="margin-top: 8px; color: var(--accent-color);">建造費用: ${costString}</div>
    `;
    document.getElementById('shipTypeDetails').innerHTML = `
        <div>Type: ${domainLabel}</div>
        <div>HP: ${info.MaxHP}</div>
        <div>Speed: ${info.Speed} tile/s</div>
        <div>Vision: ${visionValue}</div>
        <div>Cargo: ${info.CargoCapacity}</div>
        <div>Crew: ${info.CrewCapacity}</div>
        <div>Action: ${actionLabel}</div>
        ${actionDescription ? `<div style="font-size: 12px; color: var(--text-sub);">Effect: ${actionDescription}</div>` : ''}
        <div style="margin-top: 8px; color: var(--accent-color);">Required resources</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">${Ship.renderShipResourceCostHtml(resourceCosts, shipCreateBalances || {})}</div>
        ${shortageLine}
    `;
}

async function legacyConfirmCreateShip_unused(playFabId) {
    if (shipCreateInFlight) return;
    if (!shipCreateContext || !shipCreateContext.islandId || !shipCreateContext.mapId) {
        showRpgMessage('Cannot determine where to build this ship.');
        return;
    }
    const shipItemId = document.getElementById('shipTypeSelect').value;
    if (!shipItemId) {
        showRpgMessage('Select a ship first.');
        return;
    }
    const confirmBtn = document.getElementById('btnConfirmCreateShip');
    shipCreateInFlight = true;
    if (confirmBtn) confirmBtn.disabled = true;
    try {
        shipCreateBalances = await Ship.getShipResourceBalances(playFabId);
        const selectedSpec = window.shipCatalog?.[shipItemId] || null;
        const resourceCosts = Ship.getShipBuildResourceCosts(selectedSpec);
        const shortages = Ship.getShipResourceShortages(resourceCosts, shipCreateBalances || {});
        if (shortages.length > 0) {
            updateShipTypeDetails();
            showRpgMessage(`Missing resources: ${shortages.map((entry) => `${formatCurrencyLabel(entry.ItemId)} ${entry.shortage}`).join(' / ')}`);
            return;
        }
        const createResult = await Ship.createShip(playFabId, shipItemId, {
            ...(shipCreateContext || {}),
            resourceBalances: shipCreateBalances,
            nationKey: window.myAvatarBaseInfo?.Nation || window.myAvatarBaseInfo?.nation || null
        });
        if (createResult) {
            document.getElementById('shipCreateModal').style.display = 'none';
            shipCreateContext = null;
            shipCreateBalances = null;
            showRpgMessage(`Ship created: ${window.shipCatalog[shipItemId].DisplayName}`);
            try {
                await Ship.setActiveShip(playFabId, createResult.shipId);
            } catch (e) {
                console.warn('[confirmCreateShip] Failed to set active ship:', e);
            }
            await Player.getPoints(playFabId);
        }
    } finally {
        shipCreateInFlight = false;
        if (confirmBtn) confirmBtn.disabled = false;
    }
    return;

    try {
        const paymentMethod = await Ship.selectPaymentMethod('支払い方法を選択してください');
        if (!paymentMethod) return;
        shipCreateContext.paymentMethod = paymentMethod;
        const data = await Ship.createShip(playFabId, shipItemId, shipCreateContext);
        if (data) {
            document.getElementById('shipCreateModal').style.display = 'none';
            shipCreateContext = null;
            showRpgMessage(`Ship created: ${window.shipCatalog[shipItemId].DisplayName}`);
            try {
                await Ship.setActiveShip(playFabId, data.shipId);
            } catch (e) {
                console.warn('[confirmCreateShip] Failed to set active ship:', e);
            }
            await Player.getPoints(playFabId); // ??????
        }
    } finally {
        shipCreateInFlight = false;
        if (confirmBtn) confirmBtn.disabled = false;
    }
}
async function confirmCreateShip(playFabId) {
    if (shipCreateInFlight) return;
    if (!shipCreateContext || !shipCreateContext.islandId || !shipCreateContext.mapId) {
        showRpgMessage('Cannot determine where to build this ship.');
        return;
    }

    const shipItemId = document.getElementById('shipTypeSelect').value;
    if (!shipItemId) {
        showRpgMessage('Select a ship first.');
        return;
    }

    const confirmBtn = document.getElementById('btnConfirmCreateShip');
    shipCreateInFlight = true;
    if (confirmBtn) confirmBtn.disabled = true;

    try {
        shipCreateBalances = await Ship.getShipResourceBalances(playFabId);
        const selectedSpec = window.shipCatalog?.[shipItemId] || null;
        const resourceCosts = Ship.getShipBuildResourceCosts(selectedSpec);
        const shortages = Ship.getShipResourceShortages(resourceCosts, shipCreateBalances || {});
        if (shortages.length > 0) {
            updateShipTypeDetails();
            showRpgMessage(`Missing resources: ${shortages.map((entry) => `${formatCurrencyLabel(entry.ItemId)} ${entry.shortage}`).join(' / ')}`);
            return;
        }

        const createResult = await Ship.createShip(playFabId, shipItemId, {
            ...(shipCreateContext || {}),
            resourceBalances: shipCreateBalances,
            nationKey: window.myAvatarBaseInfo?.Nation || window.myAvatarBaseInfo?.nation || null
        });

        if (!createResult) return;

        document.getElementById('shipCreateModal').style.display = 'none';
        shipCreateContext = null;
        shipCreateBalances = null;
        showRpgMessage(`Ship created: ${window.shipCatalog[shipItemId].DisplayName}`);

        try {
            await Ship.setActiveShip(playFabId, createResult.shipId);
        } catch (error) {
            console.warn('[confirmCreateShip] Failed to set active ship:', error);
        }

        await Player.getPoints(playFabId);
    } finally {
        shipCreateInFlight = false;
        if (confirmBtn) confirmBtn.disabled = false;
    }
}


async function viewShipDetails(shipId) {
    const positionData = await Ship.getShipPosition(shipId);
    if (!positionData) return;

    const assetData = await Ship.getShipAsset(myPlayFabId, shipId);
    const currentPos = Ship.calculateCurrentPosition(positionData.movement, positionData.position);

    const catalogItem = (() => {
        if (!window.shipCatalog || !assetData) return null;
        if (assetData.ItemId && window.shipCatalog[assetData.ItemId]) return window.shipCatalog[assetData.ItemId];
        if (assetData.ShipType) {
            return Object.values(window.shipCatalog).find(item => item.DisplayName === assetData.ShipType) || null;
        }
        return null;
    })();
    const catalogVision = catalogItem ? Number(catalogItem.VisionRange) : Number.NaN;
    const visionValue = Number.isFinite(catalogVision)
        ? catalogVision
        : Number(assetData?.Stats?.VisionRange || 0);
    const actionInfo = (() => {
        if (typeof window === 'undefined' || !window.SHIP_ACTIONS) return null;
        const itemId = String(assetData?.ItemId || '').toLowerCase();
        const friendlyId = String(catalogItem?.FriendlyId || catalogItem?.friendlyId || '').toLowerCase();
        return window.SHIP_ACTIONS[itemId] || (friendlyId ? window.SHIP_ACTIONS[friendlyId] : null);
    })();
    const actionLabel = actionInfo?.label || 'なし';
    const actionDescription = actionInfo?.description || '';

    document.getElementById('shipDetailsContent').innerHTML = `
        <div style="margin-bottom: 16px;">
            <h3>${assetData ? assetData.ShipType : '不明'}</h3>
            <div style="font-size: 12px; color: var(--text-sub);">${shipId}</div>
        </div>
        ${assetData ? `
        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 4px; margin-bottom: 12px;">
            <h4>ステータス</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; margin-top: 8px;">
                <div>タイプ: ${(() => { switch (assetData.Domain) { case 'sea_underwater': return '海中'; case 'air': return '飛空'; case 'sea_surface': default: return '海上'; } })()}</div>
                <div>HP: <span style="color: var(--hp-color);">${assetData.Stats.CurrentHP}/${assetData.Stats.MaxHP}</span></div>
                <div>速度: ${assetData.Stats.Speed}</div>
                <div>視覚距離: ${visionValue}</div>
                <div>積荷: ${assetData.Cargo.length}/${assetData.Stats.CargoCapacity}</div>
                <div>乗組員: ${assetData.Crew.length}/${assetData.Stats.CrewCapacity}</div>
                <div>アクション: ${actionLabel}</div>
            </div>
            ${actionDescription ? `<div style="margin-top: 8px; font-size: 12px; color: var(--text-sub);">効果: ${actionDescription}</div>` : ''}
        </div>
        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 4px; margin-bottom: 12px;">
            <h4>装備</h4>
            <div style="font-size: 13px; margin-top: 8px;">
                <div>大砲: ${assetData.Equipment.Cannon || 'なし'}</div>
                <div>帆: ${assetData.Equipment.Sail || 'なし'}</div>
                <div>船体: ${assetData.Equipment.Hull || 'なし'}</div>
                <div>錨: ${assetData.Equipment.Anchor || 'なし'}</div>
            </div>
        </div>
        ` : ''}
        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 4px;">
            <h4>位置情報</h4>
            <div style="font-size: 13px; margin-top: 8px;">
                <div>現在位置: (${Math.round(currentPos.x)}, ${Math.round(currentPos.y)})</div>
                <div>状態: ${positionData.movement.isMoving ? '航海中' : '停泊中'}</div>
                ${positionData.movement.isMoving ? `
                <div style="margin-top: 8px;">
                    <div>出発地: (${Math.round(positionData.movement.departurePos.x)}, ${Math.round(positionData.movement.departurePos.y)})</div>
                    <div>目的地: (${Math.round(positionData.movement.destinationPos.x)}, ${Math.round(positionData.movement.destinationPos.y)})</div>
                    <div>到着予定: ${Ship.formatETA(positionData.movement.arrivalTime)}</div>
                </div>
                ` : ''}
            </div>
        </div>
    `;

    document.getElementById('shipDetailsModal').style.display = 'flex';
}

async function stopShip(shipId) {
    if (!confirm('この船を停止しますか？')) return;

    const data = await Ship.stopShip(shipId, myPlayFabId);
    if (data) {
        showRpgMessage('船を停止しました');
        await Ship.displayPlayerShips(myPlayFabId);
    }
}

async function startShipVoyageUI(shipId) {
    if (!shipId) return;
    try {
        const result = await Ship.setActiveShip(myPlayFabId, shipId);
        if (result && result.success) {
            showRpgMessage('船を乗り換えました。');
            await Ship.displayPlayerShips(myPlayFabId);
            return;
        }
    } catch (error) {
        console.warn('[startShipVoyageUI] Failed to switch ship:', error);
    }
    showRpgMessage('船の乗り換えに失敗しました。');
}


// --- グローバルスコープへの登録 ---
// HTMLのonclick属性から呼び出せるように、モジュールスコープ内の関数をwindowオブジェクトに登録します。
window.showTab = (tabId) => showTab(tabId, { playFabId: myPlayFabId, race: myAvatarBaseInfo.Race, nation: myAvatarBaseInfo.Nation });
window.equipItem = (itemId, slot) => Inventory.equipItem(myPlayFabId, itemId, slot);
window.equipTarotCardToDeck = (itemId, deckType) => Inventory.equipTarotCardToDeck(myPlayFabId, itemId, deckType);
window.unequipTarotCardFromDeck = (itemId, deckType) => Inventory.unequipTarotCardFromDeck(myPlayFabId, itemId, deckType);
window.moveTarotCardInDeck = (itemId, deckType, direction) => Inventory.moveTarotCardInDeck(myPlayFabId, itemId, deckType, direction);
window.levelUpCard = (itemId) => Inventory.levelUpTarotCard(itemId);
window.useShipSkillCard = (cardItemId, skillName) => window.worldMapScene?.useShipSkillCard(cardItemId, skillName);
window.closeItemDetailModal = Inventory.closeItemDetailModal;
window.refreshInventory = (options = {}) => Inventory.getInventory(myPlayFabId, options);
window.useItem = (instanceId, itemId) => Inventory.useItem(myPlayFabId, instanceId, itemId);
window.sellItem = (instanceId, itemId) => Inventory.sellItem(myPlayFabId, instanceId, itemId);
window.showSellConfirmationModal = Inventory.showSellConfirmationModal;
window.viewShipDetails = viewShipDetails;
window.stopShip = stopShip;
window.startShipVoyageUI = startShipVoyageUI;
window.setActiveShip = (shipId) => Ship.setActiveShip(myPlayFabId, shipId);
window.Island = Island;
