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
import { installPlayerProfileInteractions, refreshFavoritePlayersList } from './js/playerProfile.js';
import { showRpgMessage, rpgSay } from './js/rpgMessages.js';

import { getDatabase } from "firebase/database";
// --- グローバル変数 ---
window.myLineProfile = null;
window.myPlayFabId = null;
window.myAvatarBaseInfo = { Race: 'human', SkinColorIndex: 1, Nation: 'fire', IsGuest: false };
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
            AvatarColor: avatarColor || myAvatarBaseInfo.AvatarColor || 'brown',
            IsGuest: false
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
        text.textContent = `友だち追加特典は受け取り済みです。${state.claimedAmount || state.rewardAmount || 0} Ps を受け取りました。`;
        button.textContent = '受け取り済み';
        button.disabled = true;
        button.dataset.action = 'claimed';
        return;
    }

    if (state.friendFlag === true) {
        title.textContent = 'LINE公式アカウント';
        text.textContent = `友だち追加を確認しました。${state.rewardAmount || 0} Ps の特典を受け取れます。`;
        button.textContent = '特典を受け取る';
        button.disabled = false;
        button.dataset.action = 'claim';
        return;
    }

    title.textContent = 'LINE公式アカウント';
    if (state.addFriendUrl) {
        text.textContent = `${state.rewardAmount || 0} Ps の特典があります。友だち追加後にここで受け取れます。`;
        button.textContent = '友だち追加';
        button.disabled = false;
        button.dataset.action = 'friend';
        return;
    }
    text.textContent = `${state.rewardAmount || 0} Ps の特典があります。現在は友だち追加URLが未設定です。`;
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
    showRpgMessage(`${result?.rewardAmount || 0} Ps を受け取りました。`, 2600);
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

document.addEventListener('DOMContentLoaded', () => {
    initHomeSurprises();
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
                    await handleTroyEntryRequestAfterLogin();
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
    document.getElementById('btnRecoverHP').addEventListener('click', async () => {
        const result = await Player.recoverHpResource(myPlayFabId);
        if (result?.message) showRpgMessage(result.message, 2200);
    });
    document.getElementById('btnRecoverMP').addEventListener('click', async () => {
        const result = await Player.recoverMpResource(myPlayFabId);
        if (result?.message) showRpgMessage(result.message, 2200);
    });
    document.getElementById('btnScanPay').addEventListener('click', startScanAndPay);
    document.getElementById('btnCoinConvert').addEventListener('click', () => openCoinConvertModal('gold_to_coin'));
    document.getElementById('btnCoinGoldConvert')?.addEventListener('click', () => openCoinConvertModal('coin_to_gold'));
    document.getElementById('btnCancelCoinConvert').addEventListener('click', closeCoinConvertModal);
    document.getElementById('btnConfirmCoinConvert').addEventListener('click', confirmCoinConvert);
    document.getElementById('btnScanEquipmentGacha')?.addEventListener('click', startScanEquipmentGacha);
    document.getElementById('btnCreateGuestAvatar')?.addEventListener('click', () => showRaceModal({ completeGuestRegistration: true }));
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

    document.querySelectorAll('.inventory-primary-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => Inventory.switchInventoryGroup(btn.dataset.group));
    });
    document.querySelectorAll('.inventory-panel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.inventoryGroupSwitch) {
                Inventory.switchInventoryGroup(btn.dataset.inventoryGroupSwitch);
                return;
            }
            Inventory.switchInventoryPanel(btn.dataset.panel);
        });
    });
    document.querySelectorAll('[data-inventory-group-jump]').forEach(btn => {
        btn.addEventListener('click', () => Inventory.switchInventoryGroup(btn.dataset.inventoryGroupJump));
    });
    document.getElementById('inventorySort').addEventListener('change', () => {
        const currentCategory = Inventory.getActiveInventoryCategory();
        Inventory.renderInventoryGrid(currentCategory);
    });

    // 装備スロットのクリックイベント（インベントリタブに移動してフィルタリング）
    document.querySelectorAll('.equip-slot').forEach(slot => {
        slot.addEventListener('click', async () => {
            const slotType = slot.dataset.slot;
            const currentEquipment = Inventory.getMyCurrentEquipment();
            const inventoryItems = Inventory.getMyInventory();
            const slotKeyMap = {
                rightHand: 'RightHand',
                leftHand: 'LeftHand',
                armor: 'Armor',
                accessory: 'Accessory',
                majorarcana: 'MajorArcana'
            };
            const currentSlotKey = slotKeyMap[slotType] || '';
            const currentEntry = currentSlotKey ? currentEquipment?.[currentSlotKey] : null;
            const currentItem = (currentEntry && typeof currentEntry === 'object' && currentEntry.customData)
                ? currentEntry
                : inventoryItems.find((item) => item.instances?.includes(currentEntry))
                    || inventoryItems.find((item) => item.itemId === currentEntry)
                    || null;
            const currentCategory = String(currentItem?.customData?.Category || '').trim();
            let targetCategory = 'All';

            if (slotType === 'majorarcana') {
                targetCategory = 'TarotMajor';
            } else if (currentCategory === 'Weapon' || currentCategory === 'Shield' || currentCategory === 'Offhand' || currentCategory === 'Armor' || currentCategory === 'Accessory') {
                targetCategory = currentCategory;
            } else if (currentCategory === 'TarotMajor' || currentCategory === 'MajorArcana' || currentCategory === 'TarotArcanaMajor') {
                targetCategory = 'TarotMajor';
            } else if (slotType === 'rightHand') {
                targetCategory = 'Weapon';
            } else if (slotType === 'leftHand') {
                targetCategory = 'Offhand';
            } else if (slotType === 'armor') {
                targetCategory = 'Armor';
            } else if (slotType === 'accessory') {
                targetCategory = 'Accessory';
            }

            // インベントリタブに移動
            await showTab('inventory', { playFabId: myPlayFabId, race: myAvatarBaseInfo.Race, nation: myAvatarBaseInfo.Nation });
            Inventory.switchInventoryPanel('items', { preserveScroll: true });

            // カテゴリタブを切り替え
            if (targetCategory !== 'All') {
                Inventory.switchInventoryTab(targetCategory);
            }
        });
    });
    document.getElementById('btnGetRanking').addEventListener('click', Player.getRanking);
    document.getElementById('btnShowPsRanking').addEventListener('click', () => Player.showRanking('ps'));
    document.getElementById('btnShowBountyRanking').addEventListener('click', () => Player.showRanking('bounty'));
    document.getElementById('btnShowTreasuryRanking').addEventListener('click', () => Player.showRanking('treasury'));
    document.getElementById('btnGetTreasuryRanking').addEventListener('click', Player.getNationTreasuryRanking);
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

    // QRコード生成
    new QRious({ element: document.getElementById('myQrCanvas'), value: myPlayFabId, size: 150 });

    // --- 初期データ取得 ---
    const initPromises = [
        (async () => {
            await updateAvatarBaseInfo();
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
            if (typeof showRpgMessage === 'function') {
                showRpgMessage(`送金を受け取りました: ${amount} ${currencyLabel}`);
            } else {
                const pointMessageEl = document.getElementById('pointMessage');
                if (pointMessageEl) pointMessageEl.innerText = `送金を受け取りました: ${amount} ${currencyLabel}`;
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

function isGuestUser() {
    return window.myAvatarBaseInfo?.IsGuest === true
        || String(window.myAvatarBaseInfo?.IsGuest || '').toLowerCase() === 'true';
}

function updateGuestAvatarPrompt() {
    const prompt = document.getElementById('guestAvatarPrompt');
    if (!prompt) return;
    prompt.hidden = !isGuestUser();
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
    const data = await callApiWithLoader('/api/set-race', {
        playFabId: myPlayFabId,
        raceName,
        isKing: !!groupInfo.created,
        entityKey,
        entityToken: window.myEntityToken,
        displayName,
        inviteToken: inviteInfo?.valid && !inviteInfo.fixedNation ? pendingAppInviteToken : '',
        inviteNation: inviteInfo?.valid && inviteInfo.fixedNation ? inviteInfo.nation : '',
        completeGuestRegistration: false
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
                myAvatarBaseInfo = { ...myAvatarBaseInfo, Nation: String(nation).toLowerCase(), AvatarColor: avatarColor, IsGuest: false };
                window.myAvatarBaseInfo = myAvatarBaseInfo;
            }
        }
        await initializeAppFeatures();
        await NationKing.refreshKingNav(myPlayFabId);
        updateGuestAvatarPrompt();
        const nameForLine = displayName || '旅人';
        if (!window.__pendingFirstMapMessages) window.__pendingFirstMapMessages = [];
        window.__pendingFirstMapMessages.push(rpgSay.kingGreeting(nameForLine));
        if (data?.starterAssets?.granted?.includes('ship_common_boat')) {
            window.__pendingFirstMapMessages.push(rpgSay.shipGained());
        }
        await showTab('home', { playFabId: myPlayFabId, race: raceName.toLowerCase(), nation });
        await showDailyFortunePromptAfterLogin();
    } else {
        console.error('[autoAssignRace] set-race returned null, falling back to manual modal');
        showRaceModal();
    }
}

function showRaceModal(options = {}) {
    const completeGuestRegistration = !!options.completeGuestRegistration;
    document.getElementById('raceModal').style.display = 'flex';
    const titleEl = document.getElementById('raceModalTitle');
    const descriptionEl = document.getElementById('raceModalDescription');
    if (titleEl) titleEl.innerText = completeGuestRegistration ? 'アバター作成' : '種族選択';
    if (descriptionEl) {
        descriptionEl.innerText = completeGuestRegistration
            ? '所属国は入店時の国を引き継ぎます'
            : '一度選ぶと変更できません';
    }
    const nameInput = document.getElementById('raceDisplayNameInput');
    if (nameInput) {
        nameInput.value = window.myLineProfile?.displayName || '';
    }
    if (completeGuestRegistration) {
        const inviteMessageEl = document.getElementById('raceInviteMessage');
        if (inviteMessageEl) {
            inviteMessageEl.style.display = 'none';
            inviteMessageEl.innerText = '';
        }
    } else {
        void updateRaceInviteMessage();
    }

    const handleRaceSelection = async (event) => {
        if (event.target.tagName !== 'BUTTON') return;
        const raceButtonsContainer = document.getElementById('raceButtons');
        raceButtonsContainer.removeEventListener('click', handleRaceSelection);

        const raceName = event.target.dataset.race;
        const raceMessageEl = document.getElementById('raceMessage');
        const inviteInfo = completeGuestRegistration ? null : await getPendingAppInviteInfo();
        let groupInfo = { created: false };
        if (raceMessageEl) {
            raceMessageEl.innerText = completeGuestRegistration
                ? '（アバターを作成中...）'
                : (inviteInfo?.valid ? '（招待された国へ所属を設定中...）' : '（国グループを準備中...）');
        }
        if (!completeGuestRegistration && !inviteInfo?.valid) {
            groupInfo = await ensureNationGroupForRace(raceName);
        }
        if (raceMessageEl) raceMessageEl.innerText = '（初期ステータスを設定中...）';
        const entityKey = window.myPlayFabLoginInfo?.entityKey || null;
        if (!entityKey || !entityKey.Id || !entityKey.Type) throw new Error('Entity key not available');
        const displayName = (document.getElementById('raceDisplayNameInput')?.value || '').trim();
        const data = await callApiWithLoader('/api/set-race', {
            playFabId: myPlayFabId,
            raceName: raceName,
            isKing: !!groupInfo.created,
            entityKey,
            entityToken: window.myEntityToken,
            displayName: displayName || window.myLineProfile?.displayName || '',
            inviteToken: inviteInfo?.valid && !inviteInfo.fixedNation ? pendingAppInviteToken : '',
            inviteNation: inviteInfo?.valid && inviteInfo.fixedNation ? inviteInfo.nation : '',
            completeGuestRegistration
        });
        if (raceMessageEl) raceMessageEl.innerText = '（島と船を準備中...）';
        if (data !== null) {
            document.getElementById('raceModal').style.display = 'none';
            if (!completeGuestRegistration) {
                clearPendingAppInviteState({ removeFromUrl: true });
            }
            if (displayName) {
                document.getElementById('globalPlayerName').innerText = displayName;
            }
            await initializeAppFeatures();
            await NationKing.refreshKingNav(myPlayFabId);
            if (completeGuestRegistration) {
                await updateAvatarBaseInfo();
                updateGuestAvatarPrompt();
                showRpgMessage('アバターを作成しました。', 2400);
                const playerInfo = {
                    playFabId: myPlayFabId,
                    race: String(raceName || '').toLowerCase(),
                    nation: myAvatarBaseInfo.Nation || data?.nation?.Nation || null
                };
                await showTab('home', playerInfo);
                return;
            }
            const nation = data?.nation?.Nation || null;
            if (nation) {
                const avatarColor = getAvatarColorForNation(nation);
                if (avatarColor) {
                    myAvatarBaseInfo = {
                        ...myAvatarBaseInfo,
                        Nation: String(nation).toLowerCase(),
                        AvatarColor: avatarColor,
                        IsGuest: false
                    };
                    window.myAvatarBaseInfo = myAvatarBaseInfo;
                }
            }
            updateGuestAvatarPrompt();
            const nameForLine = displayName || window.myLineProfile?.displayName || '旅人';
            if (!window.__pendingFirstMapMessages) window.__pendingFirstMapMessages = [];
            window.__pendingFirstMapMessages.push(rpgSay.kingGreeting(nameForLine));
            if (data?.starterAssets?.granted?.includes('ship_common_boat')) {
                window.__pendingFirstMapMessages.push(rpgSay.shipGained());
            }
            const playerInfo = { playFabId: myPlayFabId, race: raceName.toLowerCase(), nation };
            await showTab('home', playerInfo);
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
        Keys: ["Race", "Nation", "NationChangedAt", "AvatarColor", "SkinColorIndex", "FaceIndex", "HairStyleIndex", "HairColorIndex", "IsGuest"]
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
                IsGuest: String(result.Data.IsGuest?.Value || '').toLowerCase() === 'true'
            };
            window.myAvatarBaseInfo = myAvatarBaseInfo;
            preloadAvatarBaseSprites(myAvatarBaseInfo);
            updateGuestAvatarPrompt();

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

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9200;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:16px;';
        overlay.innerHTML = `
            <div style="background:#1e293b;border-radius:18px;padding:28px 20px 20px;width:100%;max-width:320px;color:#f1f5f9;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.6);">
                <div style="font-size:11px;letter-spacing:0.1em;color:#94a3b8;margin-bottom:10px;font-weight:700;">TROY COIN</div>
                <div style="font-size:17px;font-weight:700;margin-bottom:6px;">Gをコインに変換しますか？</div>
                <div style="color:#94a3b8;font-size:13px;margin-bottom:18px;">所持: <strong style="color:#fbbf24;">${goldBalance.toLocaleString('ja-JP')} G</strong></div>
                <select id="__troyEntryCoinSel" style="width:100%;padding:11px 10px;border-radius:10px;background:#0f172a;border:1px solid #334155;color:#f1f5f9;font-size:15px;margin-bottom:18px;appearance:auto;">
                    ${options.join('')}
                </select>
                <div style="display:flex;gap:10px;">
                    <button id="__troyEntryCoinSkip" type="button" style="flex:1;padding:13px 0;border-radius:10px;border:none;background:#334155;color:#cbd5e1;font-size:14px;cursor:pointer;">このまま入店</button>
                    <button id="__troyEntryCoinOk" type="button" style="flex:1;padding:13px 0;border-radius:10px;border:none;background:#f59e0b;color:#0f172a;font-size:14px;font-weight:700;cursor:pointer;">変換して入店</button>
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

async function handleKingTroyToggle(entryRequest) {
    const nationPayload = entryRequest.nation ? { troyNation: entryRequest.nation } : {};
    const status = await callApiWithLoader('/api/troy-orders/list', nationPayload, { isSilent: true });
    const isCurrentlyOpen = !!status?.troyOpen;

    const confirmed = await new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9200;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:16px;';
        const actionLabel = isCurrentlyOpen ? 'CLOSE' : 'OPEN';
        const btnColor = isCurrentlyOpen ? '#ef4444' : '#22c55e';
        overlay.innerHTML = `
            <div style="background:#1e293b;border-radius:18px;padding:28px 20px 20px;width:100%;max-width:300px;color:#f1f5f9;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.6);">
                <div style="font-size:11px;letter-spacing:0.1em;color:#94a3b8;margin-bottom:10px;font-weight:700;">TROY 王</div>
                <div style="font-size:17px;font-weight:700;margin-bottom:20px;">TROYを${actionLabel}にしますか？</div>
                <div style="display:flex;gap:10px;">
                    <button id="__troyKingCancel" type="button" style="flex:1;padding:13px 0;border-radius:10px;border:none;background:#334155;color:#cbd5e1;font-size:14px;cursor:pointer;">キャンセル</button>
                    <button id="__troyKingOk" type="button" style="flex:1;padding:13px 0;border-radius:10px;border:none;background:${btnColor};color:#fff;font-size:14px;font-weight:700;cursor:pointer;">${actionLabel}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('#__troyKingCancel').addEventListener('click', () => { document.body.removeChild(overlay); resolve(false); });
        overlay.querySelector('#__troyKingOk').addEventListener('click', () => { document.body.removeChild(overlay); resolve(true); });
    });

    if (!confirmed) return;
    const payload = { isOpen: !isCurrentlyOpen };
    if (!isCurrentlyOpen && entryRequest.nation) payload.troyNation = entryRequest.nation;
    await callApiWithLoader('/api/troy-orders/set-open', payload, { isSilent: true, throwOnError: true });
    showRpgMessage(isCurrentlyOpen ? 'TROYをCLOSEにしました。' : 'TROYをOPENにしました。', 2400);
    await NationKing.refreshKingNav(myPlayFabId);
}

async function handleTroyEntryRequestAfterLogin() {
    const entryRequest = getTroyEntryRequestFromUrl();
    if (!entryRequest || !myPlayFabId) return;
    try {
        if (NationKing.isKing()) {
            await handleKingTroyToggle(entryRequest);
            return;
        }
        const joinBody = {
            playFabId: myPlayFabId,
            displayName: window.myLineProfile?.displayName || window.myPlayFabDisplayName || ''
        };
        const resolvedEntryNation = window.__resolvedTroyEntryNation || entryRequest.nation || null;
        if (resolvedEntryNation) joinBody.troyNation = resolvedEntryNation;
        const result = await callApiWithLoader('/api/troy-join', joinBody, { throwOnError: true });
        window.__troyEntryNation = result.nation || resolvedEntryNation || null;

        // Get fresh balance (includes entry bonus if granted)
        const { points: goldBalance } = await Player.getPoints(myPlayFabId, { isSilent: true }) || {};
        let convertedAmount = 0;
        if ((goldBalance || 0) >= 100) {
            const convertAmount = await promptCoinConvertBeforeEntry(goldBalance);
            if (convertAmount >= 100) {
                try {
                    await callApiWithLoader('/api/troy-convert-gold-to-coin', {
                        playFabId: myPlayFabId,
                        amount: convertAmount,
                        requestId: createRequestId('troy-gold-to-coin')
                    }, { isSilent: true, throwOnError: true });
                    convertedAmount = convertAmount;
                } catch (_) {
                    showRpgMessage('コイン変換に失敗しました。', 2200);
                }
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
        if (convertedAmount > 0) parts.push(`${convertedAmount.toLocaleString('ja-JP')}G をコインに変換`);
        showRpgMessage(parts.join(' / '), 2800);
    } catch (error) {
        const detail = String(error?.message || error || '');
        const message = detail.includes('TroyClosed')
            ? '現在TROYはCLOSE中です。'
            : '入店処理に失敗しました。店員にお声がけください。';
        showRpgMessage(message, 3200);
    } finally {
        clearTroyEntryParamsFromUrl();
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

function openCoinConvertModal(mode = 'gold_to_coin') {
    coinConvertMode = mode === 'coin_to_gold' ? 'coin_to_gold' : 'gold_to_coin';
    const amount = getTransferAmountValue();
    const pointMessageEl = document.getElementById('pointMessage');
    if (amount <= 0) {
        if (pointMessageEl) pointMessageEl.innerText = coinConvertMode === 'coin_to_gold'
            ? 'ゴールド化する金額を入力してください。'
            : 'コイン化する金額を入力してください。';
        return;
    }
    const titleEl = document.getElementById('coinConvertTitle');
    const amountEl = document.getElementById('coinConvertAmount');
    const textEl = document.getElementById('coinConvertText');
    const resultEl = document.getElementById('coinConvertResult');
    const confirmBtn = document.getElementById('btnConfirmCoinConvert');
    const isGoldize = coinConvertMode === 'coin_to_gold';
    if (titleEl) titleEl.innerText = isGoldize ? 'ゴールド化' : 'コイン化';
    if (amountEl) amountEl.innerText = `${amount.toLocaleString('ja-JP')}G`;
    if (textEl) textEl.innerText = isGoldize
        ? '店内コインをゴールドに戻します。入店後にコイン化した合計を超えた分だけ経験値が増えます。'
        : '店内コインに交換します。';
    if (resultEl) resultEl.innerText = '';
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerText = isGoldize ? '確認してゴールド化' : '確認してコイン化';
    }
    const modal = document.getElementById('coinConvertModal');
    if (modal) modal.style.display = 'flex';
}

function closeCoinConvertModal() {
    const modal = document.getElementById('coinConvertModal');
    if (modal) modal.style.display = 'none';
}

async function confirmCoinConvert() {
    const amount = getTransferAmountValue();
    const resultEl = document.getElementById('coinConvertResult');
    const confirmBtn = document.getElementById('btnConfirmCoinConvert');
    const isGoldize = coinConvertMode === 'coin_to_gold';
    if (amount <= 0) {
        if (resultEl) resultEl.innerText = '金額を入力してください。';
        return;
    }
    const previousLabel = confirmBtn?.innerText || '';
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerText = '処理中...';
    }
    try {
        const endpoint = isGoldize ? '/api/troy-convert-coin-to-gold' : '/api/troy-convert-gold-to-coin';
        const data = await callApiWithLoader(endpoint, {
            playFabId: myPlayFabId,
            amount,
            requestId: createRequestId(isGoldize ? 'troy-coin-to-gold' : 'troy-gold-to-coin')
        });
        if (!data) throw new Error(isGoldize ? 'ゴールド化に失敗しました。' : 'コイン化に失敗しました。');
        const contributionAmount = Math.max(0, Math.floor(Number(data.contributionAmount) || 0));
        const contributionNote = isGoldize && contributionAmount > 0
            ? ` / 経験値 +${contributionAmount.toLocaleString('ja-JP')}`
            : '';
        const message = isGoldize
            ? `${amount.toLocaleString('ja-JP')}Gをゴールド化しました。${contributionNote}`
            : `${amount.toLocaleString('ja-JP')}Gをコイン化しました。`;
        if (resultEl) resultEl.innerText = message;
        document.getElementById('pointMessage').innerText = message;
        const amountInput = document.getElementById('transferAmount');
        if (amountInput) amountInput.value = '0';
        await Player.getPoints(myPlayFabId);
        await Player.getRanking();
        setTimeout(closeCoinConvertModal, 1200);
    } catch (error) {
        const message = error?.message || error?.error || (isGoldize ? 'ゴールド化に失敗しました。' : 'コイン化に失敗しました。');
        if (resultEl) resultEl.innerText = message;
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerText = previousLabel || (isGoldize ? '確認してゴールド化' : '確認してコイン化');
        }
    }
}

// --- 船管理機能 ---

// ハードコードされた船情報を削除し、代わりに window.shipCatalog を使用します。

let shipCreateInFlight = false;
let shipCreateContext = null;
let shipCreateBalances = null;

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
