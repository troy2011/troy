// c:/Users/ikeda/my-liff-app/public/js/player.js

import {
    getPlayerStats as fetchPlayerStats,
    consumeVoyageMp as requestConsumeVoyageMp,
    recoverDockedMp as requestRecoverDockedMp,
    getPoints as fetchPoints,
    addPoints as requestAddPoints,
    usePoints as requestUsePoints,
    getRanking as fetchRanking,
    getBountyRanking as fetchBountyRanking,
    getNationTreasuryRanking as fetchNationTreasuryRanking,
    getStoreGameRanking as fetchStoreGameRanking
} from './playfabClient.js?v=20260830-s1-auth-v1';
import { formatCurrencyLabel } from './config.js';
import { getNationLabel } from './nationLabels.js';
import { renderHomePlayerStatus } from './homePlayerStatus.js';
import {
    STORE_GAME_RANKING_UI,
    formatNumber,
    formatPlayerLevelRankMeta,
    formatStoreGameRankingScore,
    normalizeStoreGameRankingType,
    renderRankingRows,
    renderRankingState
} from './rankingUi.js?v=20260731-stage-score1';

let myPlayerStats = {};
let myCrewRankInfo = null;
let rankingControlsWired = false;
const LOW_GOLD_THRESHOLD = 200;
const SPECIALTY_RESOURCE_IDS = ['RR', 'RG', 'RY', 'RB'];
const BOUNTY_UNIT_LABEL = 'ĐɃ';

export function getMyPlayerStats() {
    return myPlayerStats;
}

export function getMyCrewRankInfo() {
    return myCrewRankInfo;
}

export async function getPlayerStats(playFabId) {
    const data = await fetchPlayerStats(playFabId);
    if (data?.stats) {
        myPlayerStats = data.stats;
        myCrewRankInfo = data.crewRankInfo || null;
        updatePlayerStatsDisplay();
    }
    if (data?.dailyNationSpecialtyReward) {
        const reward = data.dailyNationSpecialtyReward;
        const itemLabel = formatCurrencyLabel(reward.itemId);
        const amount = Math.max(0, Math.floor(Number(reward.amount) || 0));
        const rank = Math.max(1, Math.floor(Number(reward.rank) || 1));
        const message = `本日の国特産品: ${itemLabel} +${amount}（国庫${rank}位）`;
        if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
            window.showRpgMessage(message);
        }
    }
}

function updatePlayerStatsDisplay() {
    renderHomePlayerStatus(myPlayerStats, myCrewRankInfo);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('player:stats-updated', { detail: { stats: { ...myPlayerStats } } }));
    }
}

function applyUpdatedStats(updatedStats) {
    if (!updatedStats || typeof updatedStats !== 'object') return;
    myPlayerStats = { ...myPlayerStats, ...updatedStats };
    updatePlayerStatsDisplay();
}

export async function consumeVoyageMp(playFabId, durationMs) {
    const data = await requestConsumeVoyageMp(playFabId, durationMs, { isSilent: true });
    if (data?.updatedStats) {
        applyUpdatedStats(data.updatedStats);
    }
    return data;
}

export async function recoverDockedMp(playFabId) {
    const data = await requestRecoverDockedMp(playFabId, { isSilent: true });
    if (data?.updatedStats) {
        applyUpdatedStats(data.updatedStats);
    }
    return data;
}

export async function getPoints(playFabId, options) {
    const data = await fetchPoints(playFabId, options);
    if (data) {
        updatePointsDisplays(data.points, data.virtualCurrency);
    }
    return data;
}

export function syncPointsDisplay(points) {
    updatePointsDisplays(points);
}

export function syncSpecialtyDisplay(virtualCurrency) {
    updateSpecialtyDisplays(virtualCurrency);
}

export async function addPoints(playFabId) {
    const data = await requestAddPoints(playFabId, 10);
    if (data) {
        updatePointsDisplays(data.newBalance);
        const pointMessageEl = document.getElementById('pointMessage');
        if (pointMessageEl) pointMessageEl.innerText = '10G追加しました！';
        await getRanking();
    }
}

export async function usePoints(playFabId) {
    const data = await requestUsePoints(playFabId, 5);
    if (data) {
        updatePointsDisplays(data.newBalance);
        const pointMessageEl = document.getElementById('pointMessage');
        if (pointMessageEl) pointMessageEl.innerText = '5G使いました！';
        await getRanking();
    }
}

function updatePointsDisplays(points, virtualCurrency = null) {
    const value = Number(points);
    if (!Number.isFinite(value)) return;
    const currentPointsEl = document.getElementById('currentPoints');
    animatePoints(currentPointsEl, value);
    triggerVaultSlide(currentPointsEl);
    animatePoints(document.getElementById('globalPoints'), value);
    const psCard = document.querySelector('.home-ps-card');
    if (psCard) {
        psCard.classList.toggle('is-low', value <= LOW_GOLD_THRESHOLD);
    }
    if (virtualCurrency) updateSpecialtyDisplays(virtualCurrency);
}

function updateSpecialtyDisplays(virtualCurrency = {}) {
    SPECIALTY_RESOURCE_IDS.forEach((itemId) => {
        const el = document.getElementById(`homeSpecialty${itemId}`);
        if (!el) return;
        const value = Math.max(0, Math.floor(Number(virtualCurrency?.[itemId]) || 0));
        el.innerText = value.toLocaleString('ja-JP');
    });
}

function animatePoints(element, target) {
    if (!element) return;
    const current = Number(String(element.innerText || '').replace(/[^\d.-]/g, ''));
    const start = Number.isFinite(current) ? current : 0;
    if (start === target) {
        element.innerText = String(target);
        return;
    }
    const startTime = performance.now();
    const duration = 550;
    const step = (now) => {
        const t = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const next = Math.round(start + (target - start) * eased);
        element.innerText = String(next);
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function triggerVaultSlide(element) {
    if (!element) return;
    element.classList.remove('slide');
    void element.offsetWidth;
    element.classList.add('slide');
    setTimeout(() => element.classList.remove('slide'), 520);
}

export async function getRanking() {
    const rankingListEl = document.getElementById('rankingList');
    if (!rankingListEl) return;
    rankingListEl.innerHTML = renderRankingState('（ランキングを読み込んでいます...）');
    const data = await fetchRanking();
    if (data?.ranking) {
        rankingListEl.innerHTML = renderRankingRows(data.ranking, {
            getName: (entry) => entry.displayName || '冒険者',
            getScore: (entry) => `${formatNumber(entry.score)}G`,
            getMeta: formatPlayerLevelRankMeta,
            getPlayerId: (entry) => entry.playFabId || ''
        });
        return;
    }
    rankingListEl.innerHTML = renderRankingState('（ランキングを取得できませんでした）');
}

export async function getBountyRanking() {
    const rankingListEl = document.getElementById('bountyRankingList');
    if (!rankingListEl) return;
    rankingListEl.innerHTML = renderRankingState('（懸賞金ランキングを読み込んでいます...）');
    try {
        const data = await fetchBountyRanking();
        if (data?.ranking) {
            rankingListEl.innerHTML = renderRankingRows(data.ranking, {
                emptyMessage: '（まだ懸賞金がありません）',
                getName: (entry) => entry.displayName || '冒険者',
                getScore: (entry) => `${formatNumber(entry.bounty ?? entry.score)} ${BOUNTY_UNIT_LABEL}`,
                getMeta: formatPlayerLevelRankMeta,
                getPlayerId: (entry) => entry.playFabId || ''
            });
            return;
        }
    } catch (error) {
        console.warn('[ranking] bounty ranking load failed:', error?.message || error);
    }
    rankingListEl.innerHTML = renderRankingState('（ランキングを取得できませんでした）');
}

export async function getNationTreasuryRanking() {
    const rankingListEl = document.getElementById('treasuryRankingList');
    if (!rankingListEl) return;
    rankingListEl.innerHTML = renderRankingState('（国庫ランキングを読み込んでいます...）');
    const data = await fetchNationTreasuryRanking();
    if (data?.ranking) {
        rankingListEl.innerHTML = renderRankingRows(data.ranking, {
            getName: (entry) => {
                const nationKey = String(entry.nation || '').toLowerCase();
                return getNationLabel(nationKey) || entry.nation || '不明';
            },
            getScore: (entry) => `${formatNumber(entry.treasuryPs)}G`,
            getMeta: (entry, index) => (index === 0 ? '最も潤う王国' : '国庫ランキング'),
            getAvatar: () => '',
            getAvatarLabel: (entry) => {
                const nationKey = String(entry.nation || '').toLowerCase();
                return (getNationLabel(nationKey) || entry.nation || '国').slice(0, 1);
            },
            getPlayerId: () => '',
            isMyRank: () => false
        });
        return;
    }
    rankingListEl.innerHTML = renderRankingState('（ランキングを取得できませんでした）');
}

export async function getStoreGameRanking(gameType = 'darts_countup') {
    const safeType = normalizeStoreGameRankingType(gameType);
    const config = STORE_GAME_RANKING_UI[safeType];
    const rankingListEl = document.getElementById(config.listId);
    if (!rankingListEl) return;
    rankingListEl.innerHTML = renderRankingState(`（${config.label}ランキングを読み込んでいます...）`);
    const data = await fetchStoreGameRanking(safeType);
    if (data?.ranking) {
        rankingListEl.innerHTML = renderRankingRows(data.ranking, {
            emptyMessage: '（まだ記録がありません）',
            getName: (entry) => entry.displayName || '冒険者',
            getScore: (entry) => formatStoreGameRankingScore(entry, safeType),
            getMeta: formatPlayerLevelRankMeta,
            getPlayerId: (entry) => entry.playFabId || ''
        });
        return;
    }
    rankingListEl.innerHTML = renderRankingState('（ランキングを取得できませんでした）');
}

function getRankingViewEntries() {
    return [
        ['ps', {
            areaId: 'psRankingArea',
            buttonId: 'btnShowPsRanking',
            refreshButtonId: 'btnGetRanking',
            load: getRanking
        }],
        ['bounty', {
            areaId: 'bountyRankingArea',
            buttonId: 'btnShowBountyRanking',
            refreshButtonId: 'btnGetBountyRanking',
            load: getBountyRanking
        }],
        ['darts', {
            areaId: 'dartsRankingArea',
            buttonId: 'btnShowDartsRanking',
            refreshButtonId: 'btnGetDartsRanking',
            load: () => getStoreGameRanking('darts_countup')
        }],
        ['billiards', {
            areaId: 'billiardsRankingArea',
            buttonId: 'btnShowBilliardsRanking',
            refreshButtonId: 'btnGetBilliardsRanking',
            load: () => getStoreGameRanking('billiards')
        }],
        ['karaoke', {
            areaId: 'karaokeRankingArea',
            buttonId: 'btnShowKaraokeRanking',
            refreshButtonId: 'btnGetKaraokeRanking',
            load: () => getStoreGameRanking('karaoke')
        }],
        ['game', {
            areaId: 'gameRankingArea',
            buttonId: 'btnShowGameRanking',
            refreshButtonId: 'btnGetGameRanking',
            load: () => getStoreGameRanking('game')
        }]
    ];
}

function wireRankingControls() {
    if (rankingControlsWired || typeof document === 'undefined') return;
    rankingControlsWired = true;
    getRankingViewEntries().forEach(([type, config]) => {
        const tabButton = document.getElementById(config.buttonId);
        if (tabButton) {
            tabButton.addEventListener('click', () => {
                showRanking(type);
            });
        }
        const refreshButton = document.getElementById(config.refreshButtonId);
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                config.load();
            });
        }
    });
}

export async function loadRankingTab() {
    wireRankingControls();
    const activeEntry = getRankingViewEntries().find(([, config]) => (
        document.getElementById(config.buttonId)?.classList.contains('active')
    ));
    await showRanking(activeEntry?.[0] || 'ps');
}

export async function showRanking(type) {
    wireRankingControls();
    const entries = getRankingViewEntries();
    const activeEntry = entries.find(([key]) => key === type) || entries[0];
    const activeConfig = activeEntry[1];

    entries.forEach(([, config]) => {
        const area = document.getElementById(config.areaId);
        if (area) area.style.display = config === activeConfig ? 'block' : 'none';
        const button = document.getElementById(config.buttonId);
        if (button) button.classList.toggle('active', config === activeConfig);
    });

    await activeConfig.load();
}
