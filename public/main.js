// c:/Users/ikeda/my-liff-app/public/main.js

import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithCustomToken } from "firebase/auth";
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { firebaseConfig, RACE_COLORS, formatCurrencyLabel } from 'config';
import { callApiWithLoader, promisifyPlayFab, buildApiUrl, createRequestId } from 'api';
import {
    showTab,
    showConfirmationModal,
    scheduleWorldMapPrefetch,
    launchTarotKingdomRescueBattle
} from 'ui';
import * as Player from 'player';
import * as Inventory from 'inventory';
import * as Guild from './js/guild.js';
import * as Ship from './js/ship.js?v=20260826-tutorial-reward-v1';
import * as Island from './js/island.js';
import * as NationKing from './js/nationKing.js?v=20260731-stage-score1';
import { initMapChat, initTroyChat } from './js/mapChat.js';
import { startNavalPvpBattle } from './js/navalPvpClient.js';
import { renderAvatar, preloadAvatarBaseSprites, playAvatarBodyMotion, stopAvatarBodyMotion } from './js/avatar.js';
import {
    installPlayerProfileInteractions,
    openPlayerProfile,
    refreshFavoritePlayersList,
    refreshHomePetCompanion
} from './js/playerProfile.js';
import { showRpgMessage, rpgSay } from './js/rpgMessages.js';
import { installPanelSlice25 } from './js/panelSlice25.js';
import {
    ensureAvatarStyleDefaults as requestEnsureAvatarStyleDefaults,
    convertTroyGoldToCoin,
    getPublicPlayerProfile,
    getTroyStatus,
    updateAvatarStyle as requestUpdateAvatarStyle
} from './js/playfabClient.js?v=20260826-tutorial-reward-v1';
import { FEATURE_UNLOCK_LEVELS, formatUnlockedFeatures, isFeatureUnlocked, normalizeLevel } from './js/featureUnlocks.js';
import { bindModalClose, bindTargetModalCloseButtons } from './js/modalClose.js';
import { startModalViewportTracking, stopModalViewportTracking } from './js/modalViewport.js';

import { getDatabase, onValue as onDatabaseValue, ref as databaseRef } from "firebase/database";
// --- グローバル変数 ---
window.myLineProfile = null;
window.myPlayFabId = null;
window.myAvatarBaseInfo = { Race: 'human', SkinColorIndex: 1, FacialHairStyleIndex: 1, Nation: 'fire' };
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
let dailyFortuneOpenPromise = null;
let dailyFortuneClaimEventBound = false;
const TAROT_MODULE_VERSION = '20260814-tutorial-choice-v1';
const TAROT_KINGDOM_RESCUE_VERSION = '20260825-enemy-return-walk-v1';
const DAILY_FORTUNE_CLAIMED_DAY_STORAGE_KEY = 'troy:daily-fortune-claimed-day';
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
const TROY_ENTRY_STAFF_CHIP_AMOUNT = 500;

installPlayerProfileInteractions();
installPanelSlice25();
bindTargetModalCloseButtons();

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
    water: 'blue',
    neutral: 'black'
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
    if (key === 'neutral') return '無国籍';
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

function getJstDayKey(date = new Date()) {
    return new Date(date.getTime() + (9 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function hasClaimedDailyFortuneToday() {
    try {
        return localStorage.getItem(DAILY_FORTUNE_CLAIMED_DAY_STORAGE_KEY) === getJstDayKey();
    } catch {
        return false;
    }
}

function setDailyFortuneButtonClaimed(button, claimed) {
    if (!button) return;
    button.dataset.dailyFortuneClaimed = claimed ? 'true' : 'false';
    button.disabled = claimed;
    button.textContent = claimed ? '占い済み' : '占い';
    button.setAttribute('aria-label', claimed ? '本日の占いは完了しました' : '本日の占い');
}

function markDailyFortuneClaimed(dayKey = '') {
    const todayKey = getJstDayKey();
    const confirmedDayKey = String(dayKey || '').trim() || todayKey;
    if (confirmedDayKey !== todayKey) return;
    try {
        localStorage.setItem(DAILY_FORTUNE_CLAIMED_DAY_STORAGE_KEY, todayKey);
    } catch {
        // The in-memory button lock still prevents repeated draws in this session.
    }
    setDailyFortuneButtonClaimed(document.getElementById('btnDailyFortune'), true);
}

async function openDailyFortuneFromButton() {
    if (dailyFortuneOpenPromise) return dailyFortuneOpenPromise;
    const button = document.getElementById('btnDailyFortune');
    const originalText = button?.textContent || '占い';
    if (button?.dataset.dailyFortuneClaimed === 'true' || hasClaimedDailyFortuneToday()) {
        setDailyFortuneButtonClaimed(button, true);
        return;
    }
    if (!myPlayFabId) {
        showRpgMessage('ログイン完了後に占えます。', 2200);
        return;
    }
    if (button) {
        button.disabled = true;
        button.textContent = '占いを準備中...';
    }
    dailyFortuneOpenPromise = (async () => {
        const Tarot = await import(`./js/tarotPoker.js?v=${TAROT_MODULE_VERSION}`);
        if (Tarot && typeof Tarot.showDailyFortune === 'function') {
            await Tarot.showDailyFortune(myPlayFabId);
            return;
        }
        if (Tarot && typeof Tarot.showDailyFortunePromptOnLogin === 'function') {
            await Tarot.showDailyFortunePromptOnLogin(myPlayFabId);
        }
    })();
    try {
        await dailyFortuneOpenPromise;
    } catch (fortuneError) {
        console.warn('[dailyFortune] Failed to open fortune:', fortuneError);
        showRpgMessage('占いを開けませんでした。もう一度お試しください。', 2600);
    } finally {
        dailyFortuneOpenPromise = null;
        if (button) {
            const claimed = button.dataset.dailyFortuneClaimed === 'true' || hasClaimedDailyFortuneToday();
            if (claimed) {
                setDailyFortuneButtonClaimed(button, true);
            } else {
                button.disabled = false;
                button.textContent = originalText;
            }
        }
    }
}

function initDailyFortuneButton() {
    const button = document.getElementById('btnDailyFortune');
    if (!button) return;
    setDailyFortuneButtonClaimed(button, hasClaimedDailyFortuneToday());
    if (!dailyFortuneClaimEventBound) {
        dailyFortuneClaimEventBound = true;
        window.addEventListener('daily-fortune:claimed', (event) => {
            markDailyFortuneClaimed(event?.detail?.dayKey);
        });
    }
    if (button.dataset.dailyFortuneBound === 'true') return;
    button.dataset.dailyFortuneBound = 'true';
    button.addEventListener('click', () => {
        void openDailyFortuneFromButton();
    });
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
let homeRescueButtonBound = false;
let homeRescueRoomsCache = [];
let homeRescueRoomsPromise = null;
let homeRescueWatchUnsubscribe = null;
let homeRescueRoomWatchUnsubscribers = [];
let homeRescueWatchTimer = 0;
let homeCoinConvertBound = false;
let homeQrScanBound = false;
let homeExplorationPopupObserver = null;
let homePlunderQrTarget = null;
const HOME_PLUNDER_ENTRY_ENABLED = false;

function revealAppWrapper() {
    document.body?.classList.remove('app-booting');
    const splash = document.getElementById('bootSplash');
    if (splash) splash.hidden = true;
    const wrapper = document.getElementById('appWrapper');
    if (wrapper) wrapper.style.display = 'block';
}

function normalizeHomeTroyPlayFabId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/^playfab:/i, '').trim().toUpperCase();
}

function isCurrentPlayerInTroyStatus(status, playFabId = window.myPlayFabId) {
    if (!status?.isOpen || !playFabId) return false;
    const target = normalizeHomeTroyPlayFabId(playFabId);
    const members = Array.isArray(status?.members) ? status.members : [];
    return members.some((member) => normalizeHomeTroyPlayFabId(member?.playFabId || member?.id) === target);
}

function findTroyMemberByPlayFabId(status = window.__troyStatus, playFabId = '') {
    const target = normalizeHomeTroyPlayFabId(playFabId);
    if (!target) return null;
    const members = Array.isArray(status?.members) ? status.members : [];
    return members.find((member) => normalizeHomeTroyPlayFabId(member?.playFabId || member?.id) === target) || null;
}

function setHomePlunderQrTarget(playFabId, status = window.__troyStatus) {
    const normalized = normalizeHomeTroyPlayFabId(playFabId);
    if (!normalized) {
        homePlunderQrTarget = null;
        return null;
    }
    const member = findTroyMemberByPlayFabId(status, normalized);
    homePlunderQrTarget = {
        playFabId: normalized,
        displayName: member?.displayName || member?.name || normalized
    };
    window.__homePlunderQrTarget = { ...homePlunderQrTarget };
    return homePlunderQrTarget;
}

function getHomePlunderQrOpponent(status = window.__troyStatus, playFabId = window.myPlayFabId) {
    if (!homePlunderQrTarget?.playFabId) return null;
    const targetId = normalizeHomeTroyPlayFabId(homePlunderQrTarget.playFabId);
    if (!targetId || targetId === normalizeHomeTroyPlayFabId(playFabId)) return null;
    const member = findTroyMemberByPlayFabId(status, targetId);
    return {
        ...homePlunderQrTarget,
        playFabId: targetId,
        displayName: member?.displayName || member?.name || homePlunderQrTarget.displayName || targetId
    };
}

function getHomeCoinConvertElements() {
    return {
        panel: document.getElementById('homeCoinConvertPanel'),
        input: document.getElementById('homeCoinConvertAmount'),
        button: document.getElementById('btnHomeCoinConvert'),
        message: document.getElementById('homeCoinConvertMessage')
    };
}

function normalizeHomeCoinConvertAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 0;
    if (Math.floor(amount) !== amount) return 0;
    if (amount <= 0 || amount > 1000000) return 0;
    if (amount % 100 !== 0) return 0;
    return amount;
}

function setHomeCoinConvertMessage(message = '', tone = '') {
    const { message: messageEl } = getHomeCoinConvertElements();
    if (!messageEl) return;
    messageEl.textContent = message;
    messageEl.dataset.tone = tone || '';
}

function ensureTroyStaffChipConfirmOverlay() {
    let overlay = document.getElementById('troyStaffChipConfirmOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'troyStaffChipConfirmOverlay';
    overlay.className = 'troy-staff-chip-confirm-overlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="troy-staff-chip-confirm-card" role="dialog" aria-modal="true" aria-labelledby="troyStaffChipConfirmTitle">
            <div id="troyStaffChipConfirmTitle" class="troy-staff-chip-confirm-title">スタッフ確認</div>
            <div id="troyStaffChipConfirmAmount" class="troy-staff-chip-confirm-amount">0G</div>
            <div id="troyStaffChipConfirmNote" class="troy-staff-chip-confirm-note">スタッフからチップを受け取ってください</div>
            <button id="troyStaffChipConfirmButton" class="troy-staff-chip-confirm-button" type="button" aria-label="確認して閉じる">
                <img src="assets/ui/icons/046.png" alt="" aria-hidden="true">
            </button>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-lock');
    };
    bindModalClose(overlay.querySelector('#troyStaffChipConfirmButton'), close, {
        overlay,
        closeOnBackdrop: true,
        closeOnEscape: true
    });
    return overlay;
}

function showTroyStaffChipConfirm(options = {}) {
    const amount = Math.max(0, Math.floor(Number(options.amount) || 0));
    if (amount <= 0) return;
    const overlay = ensureTroyStaffChipConfirmOverlay();
    const titleEl = overlay.querySelector('#troyStaffChipConfirmTitle');
    const amountEl = overlay.querySelector('#troyStaffChipConfirmAmount');
    const noteEl = overlay.querySelector('#troyStaffChipConfirmNote');
    if (titleEl) titleEl.textContent = String(options.title || 'スタッフ確認');
    if (amountEl) amountEl.textContent = `${amount.toLocaleString('ja-JP')}G`;
    if (noteEl) noteEl.textContent = String(options.note || 'スタッフからチップを受け取ってください');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-lock');
    requestAnimationFrame(() => {
        overlay.querySelector('#troyStaffChipConfirmButton')?.focus();
    });
}

window.showTroyStaffChipConfirm = showTroyStaffChipConfirm;

function updateHomeCoinConvertPanel(status = window.__troyStatus) {
    const { panel, input, button } = getHomeCoinConvertElements();
    if (!panel) return;
    const available = isCurrentPlayerInTroyStatus(status);
    panel.hidden = !available;
    if (input) input.disabled = !available;
    if (button) button.disabled = !available;
    if (!available) setHomeCoinConvertMessage('');
}

function syncHomeExplorationButtonLabel(status = window.__troyStatus) {
    const explorationButton = document.getElementById('btnHomeExploration');
    const plunderButton = document.getElementById('btnHomePlunder');
    updateHomeCoinConvertPanel(status);
    if (!explorationButton && !plunderButton) return;
    const isInTroy = isCurrentPlayerInTroyStatus(status);
    if (explorationButton) {
        explorationButton.textContent = '探索';
        explorationButton.setAttribute('aria-label', '探索に出る');
    }
    if (plunderButton) {
        const label = '略奪休止中';
        plunderButton.hidden = true;
        plunderButton.disabled = true;
        plunderButton.textContent = label;
        plunderButton.setAttribute('aria-label', label);
        plunderButton.dataset.plunderPaused = 'true';
    }
}

async function submitHomeCoinConvert(playFabId = window.myPlayFabId) {
    const { input, button } = getHomeCoinConvertElements();
    if (!button || button.disabled) return;
    if (!isCurrentPlayerInTroyStatus(window.__troyStatus, playFabId)) {
        showRpgMessage(window.__troyStatus?.isOpen ? '入店してからチップ化できます。' : 'TROYはCLOSE中です。');
        updateHomeCoinConvertPanel();
        return;
    }

    const amount = normalizeHomeCoinConvertAmount(input?.value);
    if (!amount) {
        setHomeCoinConvertMessage('100G単位で入力してください。', 'error');
        return;
    }

    const previousText = button.textContent;
    button.disabled = true;
    button.textContent = '処理中';
    setHomeCoinConvertMessage('');

    try {
        const result = await convertTroyGoldToCoin(
            playFabId,
            amount,
            createRequestId('troy-customer-chip'),
            { throwOnError: true }
        );
        if (Number.isFinite(Number(result?.newBalance))) {
            const currentPointsEl = document.getElementById('currentPoints');
            if (currentPointsEl) currentPointsEl.innerText = String(Number(result.newBalance));
            const globalPointsEl = document.getElementById('globalPoints');
            if (globalPointsEl) globalPointsEl.innerText = String(Number(result.newBalance));
        }
        setHomeCoinConvertMessage(`${amount.toLocaleString('ja-JP')}Gをチップ化しました。スタッフからチップを受け取ってください。`, 'success');
        showTroyStaffChipConfirm({
            title: 'チップ化',
            amount,
            note: 'この画面をスタッフに見せてください'
        });
        showRpgMessage('チップ化しました。スタッフからチップを受け取ってください。');
    } catch (error) {
        console.warn('[HomeCoin] Customer chip conversion failed:', error);
        setHomeCoinConvertMessage(error?.message || 'チップ化に失敗しました。', 'error');
    } finally {
        button.disabled = !isCurrentPlayerInTroyStatus(window.__troyStatus, playFabId);
        button.textContent = previousText || 'チップ化';
    }
}

function initHomeCoinConvertPanel() {
    if (homeCoinConvertBound) return;
    const { input, button } = getHomeCoinConvertElements();
    if (!button && !input) return;
    if (button) {
        button.addEventListener('click', () => {
            void submitHomeCoinConvert(window.myPlayFabId);
        });
    }
    if (input) {
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void submitHomeCoinConvert(window.myPlayFabId);
        });
    }
    updateHomeCoinConvertPanel();
    homeCoinConvertBound = true;
}

async function refreshHomeExplorationButtonLabel(playFabId = window.myPlayFabId) {
    syncHomeExplorationButtonLabel();
    if (!playFabId) return;
    try {
        const status = await getTroyStatus(playFabId, {}, { isSilent: true, throwOnError: true });
        if (status) {
            window.__troyStatus = status;
            syncHomeExplorationButtonLabel(status);
        }
    } catch (error) {
        console.warn('[home-exploration] Failed to refresh TROY status:', error);
    }
}

window.refreshHomeExplorationButtonLabel = refreshHomeExplorationButtonLabel;

function closeHomeExplorationPopup() {
    const panel = document.getElementById('shipExplorationPanel');
    if (!panel) return;
    panel.hidden = true;
    panel.classList.remove('is-popup');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-modal');
    document.body.classList.remove('home-exploration-popup-open');
    if (homeExplorationPopupObserver) {
        homeExplorationPopupObserver.disconnect();
        homeExplorationPopupObserver = null;
    }
}

window.closeHomeExplorationPopup = closeHomeExplorationPopup;

function ensureHomeExplorationPopupClose(panel) {
    if (!panel) return;
    let closeButton = panel.querySelector('[data-home-exploration-close]');
    if (!closeButton) {
        closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'home-exploration-popup-close ui-modal-close';
        closeButton.setAttribute('aria-label', '閉じる');
        closeButton.setAttribute('data-home-exploration-close', 'true');
    }
    bindModalClose(closeButton, closeHomeExplorationPopup, { icon: true });
    closeButton.textContent = '';
    const head = panel.querySelector('.ship-exploration-head');
    if (head) {
        head.append(closeButton);
    } else if (closeButton.parentElement !== panel) {
        panel.prepend(closeButton);
    } else if (panel.firstElementChild !== closeButton) {
        panel.prepend(closeButton);
    }
}

async function openHomeExplorationPopup() {
    const panel = document.getElementById('shipExplorationPanel');
    if (!panel) return;
    panel.hidden = false;
    panel.classList.add('is-popup');
    panel.setAttribute('role', 'dialog');
    panel.removeAttribute('aria-modal');
    document.body.classList.add('home-exploration-popup-open');
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

window.openHomeExplorationPopup = openHomeExplorationPopup;

function closeHomeRescuePopup() {
    const overlay = document.getElementById('homeRescueOverlay');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.classList.remove('is-joining');
    document.body.classList.remove('home-rescue-popup-open');
}

function setHomeRescueStatus(message, className = '') {
    const list = document.getElementById('homeRescueList');
    if (!list) return;
    list.innerHTML = '';
    const status = document.createElement('div');
    status.className = `home-rescue-status${className ? ` ${className}` : ''}`;
    status.textContent = message;
    list.appendChild(status);
}

function formatHomeRescueAge(createdAt) {
    const elapsedMs = Math.max(0, Date.now() - Number(createdAt || 0));
    const elapsedMinutes = Math.floor(elapsedMs / 60000);
    if (elapsedMinutes <= 0) return 'たった今';
    return `${Math.min(99, elapsedMinutes)}分前`;
}

async function joinHomeRescueRoom(room, triggerButton) {
    const overlay = document.getElementById('homeRescueOverlay');
    if (!overlay || !room?.roomId) return;
    overlay.classList.add('is-joining');
    overlay.querySelectorAll('button').forEach((button) => {
        button.disabled = true;
    });
    if (triggerButton) {
        triggerButton.textContent = '接続中';
        triggerButton.setAttribute('aria-busy', 'true');
    }
    try {
        closeHomeRescuePopup();
        const onlineShip = await Ship.getOnlineBattleShipProfile(String(window.myPlayFabId || ''));
        const kingdomResult = await launchTarotKingdomRescueBattle({ ...room, onlineShip });
        if (kingdomResult?.status === 'completed' && kingdomResult?.mode === 'online') {
            try {
                await Ship.claimOnlineExplorationReward(
                    String(window.myPlayFabId || ''),
                    String(room.ownerPlayFabId || ''),
                    kingdomResult
                );
            } catch (rewardError) {
                console.warn('[home-rescue] Failed to show participant reward:', rewardError);
                showRpgMessage('報酬の確認に失敗しました。探索画面からもう一度確認してください。');
            }
        }
    } catch (error) {
        console.warn('[home-rescue] Failed to join rescue room:', error);
        showRpgMessage(error?.message || '救難信号へ参加できませんでした。');
    } finally {
        overlay.classList.remove('is-joining');
        overlay.querySelectorAll('button').forEach((button) => {
            button.disabled = false;
        });
        triggerButton?.removeAttribute('aria-busy');
    }
}

function renderHomeRescueRooms(rooms = []) {
    const list = document.getElementById('homeRescueList');
    if (!list) return;
    list.innerHTML = '';
    if (!rooms.length) {
        setHomeRescueStatus('現在、救難信号はありません。', 'is-empty');
        return;
    }
    rooms.forEach((room) => {
        const article = document.createElement('article');
        article.className = 'home-rescue-room';

        const copy = document.createElement('div');
        copy.className = 'home-rescue-room-copy';
        const stage = document.createElement('span');
        stage.className = 'home-rescue-room-stage';
        stage.textContent = room.stageNo > 0 ? `STAGE ${room.stageNo}` : 'EXPLORATION';
        const destination = document.createElement('strong');
        destination.textContent = room.destinationName || '探索先不明';
        const monster = document.createElement('span');
        monster.className = 'home-rescue-room-monster';
        monster.textContent = `${room.monsterName || 'モンスター'}が出現`;
        const meta = document.createElement('small');
        const hostLabel = room.hostName ? `${room.hostName}　` : '';
        meta.textContent = `${hostLabel}${room.memberCount}/4　${formatHomeRescueAge(room.createdAt)}`;
        copy.append(stage, destination, monster, meta);

        const joinButton = document.createElement('button');
        joinButton.type = 'button';
        joinButton.className = 'home-rescue-join';
        joinButton.textContent = '参加';
        joinButton.setAttribute(
            'aria-label',
            `${room.destinationName || '探索先'}の${room.monsterName || 'モンスター'}戦へ参加`
        );
        joinButton.addEventListener('click', () => {
            void joinHomeRescueRoom(room, joinButton);
        });
        article.append(copy, joinButton);
        list.appendChild(article);
    });
}

function syncHomeRescueButton(rooms = homeRescueRoomsCache) {
    const button = document.getElementById('btnHomeRescue');
    if (!button) return;
    const count = Array.isArray(rooms) ? rooms.length : 0;
    button.hidden = count <= 0;
    button.dataset.rescueCount = String(count);
    button.setAttribute(
        'aria-label',
        count > 0 ? `救難信号を確認（${count}件）` : '救難信号を確認'
    );
}

async function loadHomeRescueRooms() {
    if (homeRescueRoomsPromise) return homeRescueRoomsPromise;
    homeRescueRoomsPromise = (async () => {
        const Kingdom = await import(`./js/tarotKingdom.js?v=${TAROT_KINGDOM_RESCUE_VERSION}`);
        if (typeof Kingdom.listTarotKingdomRescueRooms !== 'function') {
            throw new Error('救難信号の一覧を取得できません。');
        }
        const rooms = await Kingdom.listTarotKingdomRescueRooms();
        homeRescueRoomsCache = Array.isArray(rooms) ? rooms : [];
        syncHomeRescueButton(homeRescueRoomsCache);
        return homeRescueRoomsCache;
    })();
    try {
        return await homeRescueRoomsPromise;
    } finally {
        homeRescueRoomsPromise = null;
    }
}

async function refreshHomeRescueRooms() {
    const refreshButton = document.getElementById('homeRescueRefresh');
    setHomeRescueStatus('救難信号を受信中です。', 'is-loading');
    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.setAttribute('aria-busy', 'true');
    }
    try {
        const rooms = await loadHomeRescueRooms();
        renderHomeRescueRooms(rooms);
    } catch (error) {
        console.warn('[home-rescue] Failed to load rescue rooms:', error);
        setHomeRescueStatus(error?.message || '救難信号を受信できませんでした。', 'is-error');
    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.removeAttribute('aria-busy');
        }
    }
}

async function openHomeRescuePopup() {
    closeHomeExplorationPopup();
    const overlay = document.getElementById('homeRescueOverlay');
    if (!overlay) return;
    overlay.hidden = false;
    document.body.classList.add('home-rescue-popup-open');
    await refreshHomeRescueRooms();
}

window.closeHomeRescuePopup = closeHomeRescuePopup;
window.openHomeRescuePopup = openHomeRescuePopup;

function scheduleHomeRescueSignalRefresh() {
    window.clearTimeout(homeRescueWatchTimer);
    homeRescueWatchTimer = window.setTimeout(() => {
        homeRescueWatchTimer = 0;
        void loadHomeRescueRooms().catch((error) => {
            console.warn('[home-rescue] Failed to update rescue notification:', error);
        });
    }, 80);
}

function watchHomeRescueRoomAvailability(openRooms = {}) {
    homeRescueRoomWatchUnsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') unsubscribe();
    });
    homeRescueRoomWatchUnsubscribers = [];
    Object.entries(openRooms || {}).forEach(([roomId, room]) => {
        if (room?.kind !== 'exploration-rescue') return;
        ['presence', 'state'].forEach((childPath) => {
            const unsubscribe = onDatabaseValue(
                databaseRef(db, `tarotKingdomRooms/${roomId}/${childPath}`),
                scheduleHomeRescueSignalRefresh,
                (error) => {
                    console.warn(`[home-rescue] Failed to watch ${childPath}:`, error);
                }
            );
            homeRescueRoomWatchUnsubscribers.push(unsubscribe);
        });
    });
}

function startHomeRescueSignalWatcher() {
    if (!db || !window.__tkUid) return;
    if (typeof homeRescueWatchUnsubscribe === 'function') {
        homeRescueWatchUnsubscribe();
        homeRescueWatchUnsubscribe = null;
    }
    homeRescueRoomWatchUnsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') unsubscribe();
    });
    homeRescueRoomWatchUnsubscribers = [];
    homeRescueWatchUnsubscribe = onDatabaseValue(
        databaseRef(db, 'tarotKingdomMatch/openRooms'),
        (snapshot) => {
            watchHomeRescueRoomAvailability(snapshot.exists() ? (snapshot.val() || {}) : {});
            scheduleHomeRescueSignalRefresh();
        },
        (error) => {
            console.warn('[home-rescue] Rescue signal watcher stopped:', error);
        }
    );
}

async function loadHomePlunderPublicProfiles(opponent) {
    const selfId = window.myPlayFabId;
    const opponentId = opponent?.playFabId;
    const fallbackOpponent = {
        playFabId: opponentId,
        displayName: opponent?.displayName || opponentId,
        playerShip: opponent?.playerShip || null
    };
    const fallbackSelf = {
        playFabId: selfId,
        displayName: window.myPlayFabDisplayName || window.myLineProfile?.displayName || selfId,
        playerShip: null
    };
    const safeLoad = async (targetId, fallback) => {
        if (!selfId || !targetId) return fallback;
        try {
            const data = await getPublicPlayerProfile(selfId, targetId, { isSilent: true, throwOnError: true });
            return data?.profile || fallback;
        } catch (error) {
            console.warn('[HomePlunder] Failed to load public profile:', targetId, error);
            return fallback;
        }
    };
    const [selfProfile, opponentProfile] = await Promise.all([
        safeLoad(selfId, fallbackSelf),
        safeLoad(opponentId, fallbackOpponent)
    ]);
    return { selfProfile, opponentProfile };
}

async function startHomePlunderBattle(options = {}) {
    if (!HOME_PLUNDER_ENTRY_ENABLED) {
        showRpgMessage('船バトルと白兵戦は現在休止中です。');
        return false;
    }
    const button = document.getElementById('btnHomePlunder');
    if (!isCurrentPlayerInTroyStatus(window.__troyStatus)) {
        showRpgMessage('略奪はTROY滞在中に利用できます。');
        syncHomeExplorationButtonLabel();
        return;
    }

    if (!options.useExistingQrTarget) {
        showRpgMessage('対戦相手のQRを読み込んでください。', 2600);
        await startHomeQrScan({
            button,
            plunderOnly: true,
            loadingLabel: 'QR読み取り中...'
        });
        return;
    }

    const opponent = getHomePlunderQrOpponent(window.__troyStatus, window.myPlayFabId);
    if (!opponent?.playFabId) {
        showRpgMessage('相手のMY QRを読み取ってから略奪してください。');
        return;
    }

    if (typeof window.startBattleWithOpponent !== 'function') {
        showRpgMessage('白兵戦の準備ができていません。少し待ってから試してください。');
        return;
    }
    if (!window.__tkUid || !db) {
        showRpgMessage('リアルタイム対戦の接続準備中です。少し待ってから試してください。');
        return;
    }

    showRpgMessage('QR相手とのリアルタイム海戦に接続します。');
    try {
        const { selfProfile, opponentProfile } = await loadHomePlunderPublicProfiles(opponent);
        await startNavalPvpBattle({
            db,
            uid: window.__tkUid,
            selfId: window.myPlayFabId,
            selfName: window.myPlayFabDisplayName || window.myLineProfile?.displayName || window.myPlayFabId,
            selfProfile,
            opponentId: opponent.playFabId,
            opponentName: opponent.displayName || opponent.playFabId,
            opponentProfile,
            // 接舷成立時のみ既存の白兵戦へ移行する
            onBoarding: (opponentId, battleContext = null) => {
                Promise.resolve(window.startBattleWithOpponent(opponentId || opponent.playFabId, battleContext)).catch((error) => {
                    console.warn('[HomePlunder] Failed to start melee battle:', error);
                    showRpgMessage(error?.message || '白兵戦の開始に失敗しました。');
                });
            }
        });
    } catch (error) {
        console.warn('[HomePlunder] Failed to start realtime naval battle:', error);
        showRpgMessage(error?.message || 'リアルタイム海戦の開始に失敗しました。');
        return;
    }
    if (button) syncHomeExplorationButtonLabel();
}

function initHomeExplorationButton() {
    if (homeExplorationButtonBound && homeRescueButtonBound) return;
    const explorationButton = document.getElementById('btnHomeExploration');
    const rescueButton = document.getElementById('btnHomeRescue');
    const plunderButton = document.getElementById('btnHomePlunder');
    if (!explorationButton && !rescueButton && !plunderButton) return;
    syncHomeExplorationButtonLabel();
    if (!homeExplorationButtonBound) {
        explorationButton?.addEventListener('click', () => {
            closeHomeRescuePopup();
            void openHomeExplorationPopup();
        });
        homeExplorationButtonBound = true;
    }
    if (!homeRescueButtonBound) {
        rescueButton?.addEventListener('click', () => {
            void openHomeRescuePopup();
        });
        bindModalClose(document.getElementById('homeRescueClose'), closeHomeRescuePopup, {
            overlay: document.getElementById('homeRescueOverlay'),
            closeOnBackdrop: true,
            closeOnEscape: true,
            icon: true
        });
        document.getElementById('homeRescueRefresh')?.addEventListener('click', () => {
            void refreshHomeRescueRooms();
        });
        homeRescueButtonBound = true;
    }
    plunderButton?.addEventListener('click', () => {
        if (!isCurrentPlayerInTroyStatus(window.__troyStatus)) {
            syncHomeExplorationButtonLabel();
            return;
        }
        if (!HOME_PLUNDER_ENTRY_ENABLED) {
            showRpgMessage('略奪は準備中です。');
            return;
        }
        void startHomePlunderBattle();
    });
    window.addEventListener('troy:status-updated', (event) => {
        syncHomeExplorationButtonLabel(event?.detail?.status || window.__troyStatus);
    });
}

function initHomeQrScanButton() {
    if (homeQrScanBound) return;
    const button = document.getElementById('btnHomeScanQr');
    if (!button) return;
    button.addEventListener('click', startHomeQrScan);
    homeQrScanBound = true;
}

function bindAvatarStyleActionButtons(root = document) {
    root.querySelectorAll('[data-avatar-style-action]').forEach((button) => {
        if (button.dataset.avatarStyleActionBound === 'true') return;
        button.dataset.avatarStyleActionBound = 'true';
        button.addEventListener('click', () => randomizeAvatarStyle(String(button.getAttribute('data-avatar-style-action') || '')));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initHomeSurprises();
    initHomeExplorationButton();
    initHomeCoinConvertPanel();
    initHomeQrScanButton();
    initDailyFortuneButton();
    initHomeAvatarStyleModal();
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

function isTarotKingdomPreviewContext() {
    if (window.__TAROT_KINGDOM_PREVIEW__ === true) return true;
    const pathname = String(window.location?.pathname || '').toLowerCase();
    return pathname.endsWith('/tarot-kingdom-preview.html');
}

async function initializeLiff() {
    if (isTarotKingdomPreviewContext()) return;
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
        void refreshHomeExplorationButtonLabel(myPlayFabId);
        void refreshHomePetCompanion(myPlayFabId);

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
                startHomeRescueSignalWatcher();

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
                    revealAppWrapper();
                    autoAssignRace();
                } else {
                    const troyEntryRequest = getTroyEntryRequestFromUrl();
                    await applyPendingAppInviteForExistingAccount();
                    clearPendingAppInviteState({ removeFromUrl: true });
                    await initializeAppFeatures();
                    __perfLog('initializeAppFeatures done');
                    revealAppWrapper();
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
                revealAppWrapper();
                document.getElementById('globalPlayerName').innerText = '認証エラー';
            });
        } else {
            console.warn("Firebase token not provided. Running in limited mode.");
            if (loginData.needsRaceSelection) {
                autoAssignRace();
            } else {
                clearPendingAppInviteState({ removeFromUrl: true });
            }
            revealAppWrapper();
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
        revealAppWrapper();
        document.getElementById('globalPlayerName').innerText = '初期化エラー';
    }
}

async function initializeAppFeatures() {
    if (initializeAppPromise) return initializeAppPromise;
    initializeAppPromise = (async () => {
        console.log('[initializeAppFeatures] Starting initialization...');

    // --- UI event bindings ---
    document.getElementById('btnGetStats').addEventListener('click', () => Player.getPlayerStats(myPlayFabId));
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
    initMapChat(myPlayFabId);
    initTroyChat(myPlayFabId);
    initHomeCoinConvertPanel();

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
                    <button class="battle-territory-btn" type="button" data-territory-id="${t.territoryId}" disabled>停止中</button>
                </div>
            `;
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
    document.getElementById('inventorySearch')?.addEventListener('input', (event) => {
        window.dispatchEvent(new CustomEvent('inventory:search-query', {
            detail: { value: event.currentTarget.value }
        }));
    });
    document.getElementById('inventorySearchClear')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('inventory:search-query', { detail: { value: '' } }));
        document.getElementById('inventorySearch')?.focus();
    });

    document.getElementById('btnGetRanking').addEventListener('click', Player.getRanking);
    document.getElementById('btnShowPsRanking')?.addEventListener('click', () => Player.showRanking('ps'));
    document.getElementById('btnShowDartsRanking')?.addEventListener('click', () => Player.showRanking('darts'));
    document.getElementById('btnShowKaraokeRanking')?.addEventListener('click', () => Player.showRanking('karaoke'));
    document.getElementById('btnGetDartsRanking')?.addEventListener('click', () => Player.getStoreGameRanking('darts_countup'));
    document.getElementById('btnGetKaraokeRanking')?.addEventListener('click', () => Player.getStoreGameRanking('karaoke'));
    document.getElementById('btnGetBountyRanking')?.addEventListener('click', () => Player.getBountyRanking());
    document.getElementById('btnGetBilliardsRanking')?.addEventListener('click', () => Player.getStoreGameRanking('billiards'));
    document.getElementById('btnGetGameRanking')?.addEventListener('click', () => Player.getStoreGameRanking('game'));
    initHomeQrScanButton();
    initHomeExplorationButton();
    initDailyFortuneButton();
    initHomeAvatarStyleModal();
    document.getElementById('globalPlayerName')?.addEventListener('click', promptChangeDisplayName);
    document.getElementById('btnCreateGuild').addEventListener('click', () => Guild.showCreateGuildModal());
    document.getElementById('btnConfirmCreateGuild').addEventListener('click', () => {
        const guildName = document.getElementById('guildNameInput').value;
        Guild.createGuild(myPlayFabId, guildName);
    });
    const guildCreateModal = document.getElementById('guildCreateModal');
    bindModalClose(document.getElementById('btnCancelCreateGuild'), () => {
        guildCreateModal.style.display = 'none';
    }, {
        overlay: guildCreateModal,
        closeOnBackdrop: true,
        closeOnEscape: true
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
    bindAvatarStyleActionButtons();
    window.addEventListener('player:stats-updated', (event) => {
        const level = normalizeLevel(event?.detail?.stats?.Level || 1);
        window.myAvatarBaseInfo = {
            ...window.myAvatarBaseInfo,
            level,
            ...(level >= 51 ? { Nation: 'neutral', AvatarColor: 'black' } : {})
        };
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
            playAvatarBodyMotion,
            stopAvatarBodyMotion,
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
        Keys: ["Race", "Nation", "NationChangedAt", "AvatarColor", "SkinColorIndex", "FaceIndex", "HairStyleIndex", "FacialHairStyleIndex", "HairColorIndex"]
    }, { isSilent: true });

        if (result && result.Data) {
            const parseAvatarStyleIndex = (value, fallback = 1, min = 1) => {
                const parsed = parseInt(value, 10);
                return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
            };
            const isAvatarStyleUnset = (value) => value === undefined || value === null || String(value).trim() === '';
            const avatarStyleDefaultKeys = ['HairStyleIndex', 'FacialHairStyleIndex'];
            let ensuredAvatarStyle = {};
            if (avatarStyleDefaultKeys.some((key) => isAvatarStyleUnset(result.Data[key]?.Value))) {
                try {
                    const defaults = await requestEnsureAvatarStyleDefaults(myPlayFabId, {
                        isSilent: true,
                        throwOnError: true
                    });
                    ensuredAvatarStyle = defaults?.avatarStyle || {};
                } catch (error) {
                    console.warn('[updateAvatarBaseInfo] ensure avatar defaults failed:', error?.message || error);
                }
            }
            const readAvatarStyleValue = (key) => ensuredAvatarStyle[key] ?? result.Data[key]?.Value;
            const currentLevel = getCurrentPlayerLevel();
            const isPirateKing = currentLevel >= 51;
            const nation = isPirateKing ? 'neutral' : (result.Data.Nation?.Value || '').toLowerCase();
            const nationChangedAt = String(result.Data.NationChangedAt?.Value || '');
            const nationColor = getAvatarColorForNation(nation);
            myAvatarBaseInfo = {
                Race: (result.Data.Race?.Value || 'Human').toLowerCase(),
                Nation: nation,
                AvatarColor: isPirateKing ? 'black' : (nationColor || result.Data.AvatarColor?.Value || 'brown'),
                SkinColorIndex: parseAvatarStyleIndex(result.Data.SkinColorIndex?.Value),
                FaceIndex: parseAvatarStyleIndex(result.Data.FaceIndex?.Value),
                HairStyleIndex: parseAvatarStyleIndex(readAvatarStyleValue('HairStyleIndex')),
                HairColorIndex: parseAvatarStyleIndex(result.Data.HairColorIndex?.Value),
                FacialHairStyleIndex: parseAvatarStyleIndex(readAvatarStyleValue('FacialHairStyleIndex'), 1, 0),
                level: currentLevel
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

        await showTab('troy', {
            playFabId: myPlayFabId,
            race: myAvatarBaseInfo.Race || 'human',
            nation: result.nation || resolvedEntryNation
        });

        const parts = [];
        if (result?.alreadyEntered) parts.push('TROYに入店済みです');
        else {
            parts.push('TROYに入店しました');
            const instructionMessage = String(result?.entryInstructionMessage || '').trim()
                || `スタッフからチップ${TROY_ENTRY_STAFF_CHIP_AMOUNT.toLocaleString('ja-JP')}を受け取ってください`;
            parts.push(instructionMessage);
        }
        if (result?.entryChargeError) parts.push('入店チャージ未登録');
        if (result?.entryBonusGranted > 0) parts.push(`${result.entryBonusGranted}G 獲得`);
        showRpgMessage(parts.join(' / '), 2800);
        const entryStaffChipAmount = Math.max(0, Math.floor(Number(result?.entryStaffChipAmount ?? TROY_ENTRY_STAFF_CHIP_AMOUNT) || 0));
        if (!result?.alreadyEntered && entryStaffChipAmount > 0) {
            showTroyStaffChipConfirm({
                title: '入店チップ',
                amount: entryStaffChipAmount,
                note: 'この画面をスタッフに見せてください'
            });
        }
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

async function startHomeQrScan(options = {}) {
    const button = options.button || document.getElementById('btnHomeScanQr');
    const plunderOnly = Boolean(options.plunderOnly);
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
        button.innerText = options.loadingLabel || '読み取り中...';
    }
    try {
        const qrValue = await scanQrValue();
        if (!qrValue) {
            showRpgMessage('QRを読み取れませんでした。', 2400);
            return;
        }

        const entryRequest = getTroyEntryRequestFromQrValue(qrValue);
        if (entryRequest) {
            if (plunderOnly) {
                showRpgMessage('対戦相手のMY QRを読み込んでください。', 2600);
                return;
            }
            await handleTroyEntryRequest(entryRequest);
            return;
        }

        if (isEquipmentGachaQrValue(qrValue)) {
            if (plunderOnly) {
                showRpgMessage('対戦相手のMY QRを読み込んでください。', 2600);
                return;
            }
            showRpgMessage('装備品ガチャQRは、持ち物タブの宝箱から読み込んでください。', 3200);
            return;
        }

        const targetPlayFabId = normalizePlayFabIdFromQrValue(qrValue);
        if (targetPlayFabId) {
            if (normalizeHomeTroyPlayFabId(targetPlayFabId) === normalizeHomeTroyPlayFabId(myPlayFabId)) {
                showRpgMessage('自分のプロフィールです。', 2600);
                return;
            }
            if (isCurrentPlayerInTroyStatus(window.__troyStatus, myPlayFabId) && HOME_PLUNDER_ENTRY_ENABLED) {
                const target = setHomePlunderQrTarget(targetPlayFabId);
                showRpgMessage(`${target.displayName || target.playFabId}を捕捉しました。海戦を開始します。`, 2600);
                await startHomePlunderBattle({ useExistingQrTarget: true });
                return;
            }
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

// --- 船管理機能 ---

// ハードコードされた船情報を削除し、代わりに window.shipCatalog を使用します。

let shipCreateInFlight = false;
let shipCreateContext = null;
let shipCreateBalances = null;
let avatarStyleSaveInFlight = false;
const AVATAR_STYLE_COSTS = { haircut: 100, skin: 300, face: 800, facialHairRemove: 1000, facialHair: 1000 };

function getCurrentPlayerLevel() {
    return normalizeLevel(Player.getMyPlayerStats?.()?.Level || window.myAvatarBaseInfo?.level || 1);
}

function hasVisibleModalExcept(exceptModal = null) {
    return Array.from(document.querySelectorAll('.modal-overlay')).some((modal) => {
        if (!modal || modal === exceptModal) return false;
        const display = String(modal.style?.display || '').trim().toLowerCase();
        return display === 'flex' || modal.classList.contains('active');
    });
}

function openAvatarStyleModal() {
    const modal = document.getElementById('avatarStyleModal');
    if (!modal) return;
    bindAvatarStyleActionButtons(modal);
    renderAvatarStylePanel();
    modal.style.display = 'flex';
    startModalViewportTracking(modal, 'avatar-style');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-lock');
    document.getElementById('btnCloseAvatarStyleModal')?.focus?.();
}

function closeAvatarStyleModal() {
    const modal = document.getElementById('avatarStyleModal');
    if (!modal) return;
    stopModalViewportTracking(modal);
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    if (!hasVisibleModalExcept(modal)) {
        document.body.classList.remove('modal-lock');
    }
}

function openOwnPlayerProfileFromAvatar() {
    const playFabId = String(window.myPlayFabId || '').trim();
    if (!playFabId) {
        showRpgMessage('プレイヤー情報を取得できません。', 2200);
        return;
    }
    void openPlayerProfile(playFabId);
}

function initHomeAvatarStyleModal() {
    const avatar = document.getElementById('home-avatar');
    const modal = document.getElementById('avatarStyleModal');
    const closeBtn = document.getElementById('btnCloseAvatarStyleModal');
    if (avatar && avatar.dataset.playerProfileTriggerBound !== 'true') {
        avatar.dataset.playerProfileTriggerBound = 'true';
        avatar.addEventListener('click', openOwnPlayerProfileFromAvatar);
        avatar.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            openOwnPlayerProfileFromAvatar();
        });
    }
    bindModalClose(closeBtn, closeAvatarStyleModal, {
        overlay: modal,
        closeOnBackdrop: true,
        closeOnEscape: true,
        isOpen: () => String(modal?.style?.display || '').trim().toLowerCase() === 'flex'
    });
}

if (typeof window !== 'undefined') {
    window.openAvatarStyleModal = openAvatarStyleModal;
    window.showAvatarStyleModal = openAvatarStyleModal;
}

function renderAvatarStylePanel() {
    const panel = document.getElementById('avatarStylePanel');
    if (!panel) return;
    const level = getCurrentPlayerLevel();
    const hairUnlocked = isFeatureUnlocked('haircut', level);
    const faceUnlocked = isFeatureUnlocked('faceChange', level);
    const skinUnlocked = isFeatureUnlocked('skinChange', level);
    const facialHairUnlocked = isFeatureUnlocked('facialHairChange', level);
    const actionState = {
        haircut: hairUnlocked,
        face: faceUnlocked,
        skin: skinUnlocked,
        facialHairRemove: facialHairUnlocked,
        facialHair: facialHairUnlocked
    };
    panel.querySelectorAll('[data-avatar-style-action]').forEach((button) => {
        const action = String(button.getAttribute('data-avatar-style-action') || '');
        button.disabled = avatarStyleSaveInFlight || !actionState[action];
        const priceEl = button.querySelector('span');
        if (priceEl && AVATAR_STYLE_COSTS[action]) priceEl.textContent = `${AVATAR_STYLE_COSTS[action]}G`;
    });

    const summaryEl = document.getElementById('avatarStyleUnlockSummary');
    if (summaryEl) summaryEl.textContent = `Lv.${level}`;
    const noticeEl = document.getElementById('avatarStyleNotice');
    if (noticeEl) {
        const notes = [
            level >= FEATURE_UNLOCK_LEVELS.hairVisible ? '髪型表示: 開放済み' : `髪型表示: Lv.${FEATURE_UNLOCK_LEVELS.hairVisible}`,
            hairUnlocked ? '散髪: 開放済み' : `散髪: Lv.${FEATURE_UNLOCK_LEVELS.haircut}`,
            skinUnlocked ? '美容: 開放済み' : `美容: Lv.${FEATURE_UNLOCK_LEVELS.skinChange}`,
            faceUnlocked ? '整形: 開放済み' : `整形: Lv.${FEATURE_UNLOCK_LEVELS.faceChange}`,
            level >= FEATURE_UNLOCK_LEVELS.facialHairVisible ? 'ひげ表示: 開放済み' : `ひげ表示: Lv.${FEATURE_UNLOCK_LEVELS.facialHairVisible}`,
            facialHairUnlocked ? 'ひげメニュー: 開放済み' : `ひげメニュー: Lv.${FEATURE_UNLOCK_LEVELS.facialHairChange}`
        ];
        noticeEl.textContent = notes.join(' / ');
    }
}

async function randomizeAvatarStyle(action) {
    if (avatarStyleSaveInFlight || !window.myPlayFabId) return;
    const level = getCurrentPlayerLevel();
    const featureByAction = {
        haircut: 'haircut',
        skin: 'skinChange',
        face: 'faceChange',
        facialHairRemove: 'facialHairRemove',
        facialHair: 'facialHairChange'
    };
    const labelByAction = {
        haircut: '散髪',
        skin: '美容',
        face: '整形',
        facialHairRemove: 'ひげ脱毛',
        facialHair: 'フェイシャルエステ'
    };
    const feature = featureByAction[action];
    if (!feature || !isFeatureUnlocked(feature, level)) {
        showRpgMessage(`${labelByAction[action] || '美容室'}はLv.${FEATURE_UNLOCK_LEVELS[feature] || FEATURE_UNLOCK_LEVELS.haircut}から利用できます。`);
        return;
    }
    const cost = AVATAR_STYLE_COSTS[action] || 0;
    const descriptionByAction = {
        facialHairRemove: `${cost}Gを消費して、ひげをなくします。`,
        facialHair: `${cost}Gを消費して、ひげをランダム変更します。`
    };
    const description = descriptionByAction[action] || `${cost}Gを消費して、現在とは違う見た目にランダム変更します。`;
    const confirmed = window.confirm(`${labelByAction[action]}を行いますか？\n${description}`);
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
            showRpgMessage(`${labelByAction[action]}を行いました。-${result.cost || cost}G`);
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


async function viewShipDetails(shipId, fallbackShip = {}) {
    let positionData = null;
    try {
        positionData = await Ship.getShipPosition(shipId);
    } catch (error) {
        console.warn('[viewShipDetails] Ship position unavailable:', error?.message || error);
    }

    let assetData = null;
    try {
        assetData = await Ship.getShipAsset(myPlayFabId, shipId);
    } catch (error) {
        console.warn('[viewShipDetails] Ship asset unavailable:', error?.message || error);
    }
    const movement = positionData?.movement || {};
    const currentPos = positionData
        ? Ship.calculateCurrentPosition(movement, positionData.position || { x: 0, y: 0 })
        : null;

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
    const shipTitle = assetData?.ShipType
        || fallbackShip?.shipName
        || fallbackShip?.name
        || fallbackShip?.form
        || '船情報';

    document.getElementById('shipDetailsContent').innerHTML = `
        <div style="margin-bottom: 16px;">
            <h3>${shipTitle}</h3>
            <div style="font-size: 12px; color: var(--text-sub);">${shipId}</div>
        </div>
        ${assetData ? `
        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 4px; margin-bottom: 12px;">
            <h4>ステータス</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; margin-top: 8px;">
                <div>タイプ: ${(() => { switch (assetData.Domain) { case 'sea_underwater': return '海中'; case 'air': return '飛空'; case 'sea_surface': default: return '海上'; } })()}</div>
                <div>HP: <span style="color: var(--hp-color);">${assetData.Stats?.CurrentHP ?? '-'}/${assetData.Stats?.MaxHP ?? '-'}</span></div>
                <div>速度: ${assetData.Stats?.Speed ?? '-'}</div>
                <div>視覚距離: ${visionValue}</div>
                <div>積荷: ${Array.isArray(assetData.Cargo) ? assetData.Cargo.length : 0}/${assetData.Stats?.CargoCapacity ?? '-'}</div>
                <div>乗組員: ${Array.isArray(assetData.Crew) ? assetData.Crew.length : 0}/${assetData.Stats?.CrewCapacity ?? '-'}</div>
                <div>アクション: ${actionLabel}</div>
            </div>
            ${actionDescription ? `<div style="margin-top: 8px; font-size: 12px; color: var(--text-sub);">効果: ${actionDescription}</div>` : ''}
        </div>
        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 4px; margin-bottom: 12px;">
            <h4>装備</h4>
            <div style="font-size: 13px; margin-top: 8px;">
                <div>大砲: ${assetData.Equipment?.Cannon || 'なし'}</div>
                <div>帆: ${assetData.Equipment?.Sail || 'なし'}</div>
                <div>船体: ${assetData.Equipment?.Hull || 'なし'}</div>
                <div>錨: ${assetData.Equipment?.Anchor || 'なし'}</div>
            </div>
        </div>
        ` : ''}
        <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 4px;">
            <h4>位置情報</h4>
            <div style="font-size: 13px; margin-top: 8px;">
                ${currentPos ? `
                <div>現在位置: (${Math.round(currentPos.x)}, ${Math.round(currentPos.y)})</div>
                <div>状態: ${movement.isMoving ? '航海中' : '停泊中'}</div>
                ${movement.isMoving ? `
                <div style="margin-top: 8px;">
                    <div>出発地: (${Math.round(movement.departurePos?.x || 0)}, ${Math.round(movement.departurePos?.y || 0)})</div>
                    <div>目的地: (${Math.round(movement.destinationPos?.x || 0)}, ${Math.round(movement.destinationPos?.y || 0)})</div>
                    <div>到着予定: ${Ship.formatETA(movement.arrivalTime)}</div>
                </div>
                ` : ''}
                ` : '<div>位置情報は未登録です。</div>'}
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
window.levelUpCard = (itemId) => Inventory.levelUpTarotCard(itemId);
window.useShipSkillCard = (cardItemId, skillName) => window.worldMapScene?.useShipSkillCard(cardItemId, skillName);
window.closeItemDetailModal = Inventory.closeItemDetailModal;
const itemDetailModal = document.getElementById('itemDetailModal');
bindModalClose(itemDetailModal?.querySelector('.item-detail-corner-close'), Inventory.closeItemDetailModal, {
    overlay: itemDetailModal,
    closeOnBackdrop: true,
    closeOnEscape: true,
    icon: true
});
bindModalClose(itemDetailModal?.querySelector('.item-detail-close'), Inventory.closeItemDetailModal);
window.refreshInventory = (options = {}) => Inventory.getInventory(myPlayFabId, options);
window.useItem = (instanceId, itemId) => Inventory.useItem(myPlayFabId, instanceId, itemId);
window.sellItem = (instanceId, itemId) => Inventory.sellItem(myPlayFabId, instanceId, itemId);
window.showSellConfirmationModal = Inventory.showSellConfirmationModal;
window.viewShipDetails = viewShipDetails;
window.stopShip = stopShip;
window.startShipVoyageUI = startShipVoyageUI;
window.setActiveShip = (shipId) => Ship.setActiveShip(myPlayFabId, shipId);
window.Island = Island;
