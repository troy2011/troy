// c:/Users/ikeda/my-liff-app/public/js/player.js

import {
    getPlayerStats as fetchPlayerStats,
    recoverHpResource as requestRecoverHpResource,
    recoverMpResource as requestRecoverMpResource,
    consumeVoyageMp as requestConsumeVoyageMp,
    recoverDockedMp as requestRecoverDockedMp,
    getPoints as fetchPoints,
    addPoints as requestAddPoints,
    usePoints as requestUsePoints,
    getRanking as fetchRanking,
    getBountyRanking as fetchBountyRanking,
    getNationTreasuryRanking as fetchNationTreasuryRanking,
    getStoreGameRanking as fetchStoreGameRanking
} from './playfabClient.js';
import { formatCurrencyLabel } from './config.js';
import { getNationLabel } from './nationLabels.js';
import { buildPlayerTriggerHtml } from './playerProfile.js';

let myPlayerStats = {};
const LOW_GOLD_THRESHOLD = 200;
const SPECIALTY_RESOURCE_IDS = ['RR', 'RG', 'RY', 'RB'];
const FALLBACK_AVATAR = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#1f2937"/><circle cx="48" cy="38" r="18" fill="#64748b"/><path d="M18 82c6-16 19-24 30-24s24 8 30 24" fill="#94a3b8"/></svg>'
)}`;

export function getMyPlayerStats() {
    return myPlayerStats;
}

function getPlayerRankName(level) {
    const value = Math.max(1, Math.floor(Number(level) || 1));
    if (value >= 41) return '海賊王';
    if (value >= 31) return '提督';
    if (value >= 21) return '船長';
    if (value >= 11) return '航海士';
    return '見習い';
}

function getPlayerRankBenefits(level) {
    const value = Math.max(1, Math.floor(Number(level) || 1));
    if (value >= 41) return ['ドリンクサイズアップ回数制限なし', '店内ゲーム遊び放題'];
    if (value >= 31) return ['ドリンクサイズアップ回数制限なし'];
    if (value >= 21) return ['ドリンクサイズアップ1回', '専用ジョッキ（店内専用）'];
    if (value >= 11) return ['ドリンクサイズアップ1回', '入店時に階級表示'];
    return ['通常サービス', '入店表示のみ'];
}

export async function getPlayerStats(playFabId) {
    const data = await fetchPlayerStats(playFabId);
    if (data?.stats) {
        myPlayerStats = data.stats;
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
    const { HP = 0, MaxHP = 1, MP = 0, MaxMP = 1, Level = 1, ちから = 0, みのまもり = 0, すばやさ = 0, かしこさ = 0 } = myPlayerStats;
    const rankName = getPlayerRankName(Level);
    document.getElementById('globalCurrentHP').innerText = HP;
    document.getElementById('globalMaxHP').innerText = MaxHP;
    document.getElementById('globalCurrentMP').innerText = MP;
    document.getElementById('globalMaxMP').innerText = MaxMP;
    document.getElementById('globalHpBar').style.width = `${(HP / MaxHP) * 100}%`;
    document.getElementById('globalMpBar').style.width = `${(MP / MaxMP) * 100}%`;
    document.getElementById('globalLevel').innerText = Level;
    const rankBadgeEl = document.getElementById('globalRankBadge');
    if (rankBadgeEl) rankBadgeEl.innerText = rankName;
    const benefitEl = document.getElementById('homeRankBenefit');
    if (benefitEl) benefitEl.innerText = getPlayerRankBenefits(Level).join(' / ');
    document.getElementById('currentStr').innerText = ちから;
    document.getElementById('currentDef').innerText = みのまもり;
    document.getElementById('currentAgi').innerText = すばやさ;
    document.getElementById('currentInt').innerText = かしこさ;
    const hpRecoverBtn = document.getElementById('btnRecoverHP');
    const mpRecoverBtn = document.getElementById('btnRecoverMP');
    if (hpRecoverBtn) hpRecoverBtn.disabled = HP >= MaxHP;
    if (mpRecoverBtn) mpRecoverBtn.disabled = MP >= MaxMP;
}

function applyUpdatedStats(updatedStats) {
    if (!updatedStats || typeof updatedStats !== 'object') return;
    myPlayerStats = { ...myPlayerStats, ...updatedStats };
    updatePlayerStatsDisplay();
}

export async function recoverHpResource(playFabId) {
    const data = await requestRecoverHpResource(playFabId);
    if (data?.updatedStats) {
        applyUpdatedStats(data.updatedStats);
    }
    return data;
}

export async function recoverMpResource(playFabId) {
    const data = await requestRecoverMpResource(playFabId);
    if (data?.updatedStats) {
        applyUpdatedStats(data.updatedStats);
    }
    return data;
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

export async function getPoints(playFabId) {
    const data = await fetchPoints(playFabId);
    if (data) {
        updatePointsDisplays(data.points, data.virtualCurrency);
    }
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

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString('ja-JP');
}

function getRankMedal(index) {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return '';
}

function renderRankingState(message) {
    return `<li class="ranking-state">${escapeHtml(message)}</li>`;
}

function renderRankingAvatar({ avatarUrl, label }) {
    if (avatarUrl) {
        const src = escapeHtml(avatarUrl);
        const alt = escapeHtml(label || 'avatar');
        return `<img src="${src}" alt="${alt}" class="rank-icon ranking-avatar" onerror="this.src='${FALLBACK_AVATAR}'">`;
    }
    const text = escapeHtml(String(label || '?').trim().slice(0, 1) || '?');
    return `<div class="ranking-avatar ranking-avatar-fallback" aria-hidden="true">${text}</div>`;
}

function renderRankingRows(entries, options = {}) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return renderRankingState(options.emptyMessage || '（データがありません）');
    }
    const myDisplayName = window.myLineProfile?.displayName;
    return entries.map((entry, index) => {
        const rank = index + 1;
        const name = options.getName ? options.getName(entry, index) : (entry.displayName || '不明');
        const score = options.getScore ? options.getScore(entry, index) : 0;
        const meta = options.getMeta ? options.getMeta(entry, index) : '';
        const playerId = options.getPlayerId ? options.getPlayerId(entry, index) : (entry.playFabId || entry.PlayFabId || '');
        const avatarUrl = options.getAvatar ? options.getAvatar(entry, index) : entry.avatarUrl;
        const avatarLabel = options.getAvatarLabel ? options.getAvatarLabel(entry, index) : name;
        const medal = getRankMedal(index);
        const isMyRank = options.isMyRank ? options.isMyRank(entry, index, myDisplayName) : (myDisplayName && entry.displayName === myDisplayName);
        const podiumClass = rank <= 3 ? ` ranking-row-top ranking-row-top-${rank}` : '';
        return `
            <li class="ranking-row${isMyRank ? ' myRank' : ''}${podiumClass}">
                <div class="ranking-rank-badge">
                    <span class="ranking-rank-medal">${medal || '#'}</span>
                    <span class="ranking-rank-number">${rank}</span>
                </div>
                ${renderRankingAvatar({ avatarUrl, label: avatarLabel })}
                <div class="ranking-row-main">
                    <div class="ranking-row-name">${buildPlayerTriggerHtml(playerId, name, { className: 'player-link-inline' })}</div>
                    <div class="ranking-row-meta">${escapeHtml(meta || (isMyRank ? 'あなたの順位' : `${rank}位`))}</div>
                </div>
                <div class="ranking-row-score">
                    <span class="ranking-row-score-value">${escapeHtml(score)}</span>
                </div>
            </li>
        `;
    }).join('');
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
            getMeta: (entry, index) => (index < 3 ? '上位ランカー' : '総資産ランキング'),
            getPlayerId: (entry) => entry.playFabId || ''
        });
        return;
    }
    rankingListEl.innerHTML = renderRankingState('（ランキングを取得できませんでした）');
}

export async function getBountyRanking() {
    const rankingListEl = document.getElementById('bountyRankingList');
    if (!rankingListEl) return;
    rankingListEl.innerHTML = renderRankingState('（日次貢献度ランキングを読み込んでいます...）');
    const data = await fetchBountyRanking();
    if (data?.ranking) {
        rankingListEl.innerHTML = renderRankingRows(data.ranking, {
            getName: (entry) => entry.displayName || '冒険者',
            getScore: (entry) => `${formatNumber(entry.contribution ?? entry.score)} 貢献`,
            getMeta: (entry, index) => (index < 3 ? '本日の上位貢献者' : '日次ランキング'),
            getPlayerId: (entry) => entry.playFabId || ''
        });
        return;
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
    const safeType = gameType === 'karaoke' ? 'karaoke' : 'darts_countup';
    const rankingListEl = document.getElementById(safeType === 'karaoke' ? 'karaokeRankingList' : 'dartsRankingList');
    if (!rankingListEl) return;
    const loadingLabel = safeType === 'karaoke' ? 'カラオケ採点' : 'ダーツカウントアップ';
    rankingListEl.innerHTML = renderRankingState(`（${loadingLabel}ランキングを読み込んでいます...）`);
    const data = await fetchStoreGameRanking(safeType);
    if (data?.ranking) {
        rankingListEl.innerHTML = renderRankingRows(data.ranking, {
            emptyMessage: '（まだ記録がありません）',
            getName: (entry) => entry.displayName || '冒険者',
            getScore: (entry) => `${formatNumber(entry.score)}点`,
            getMeta: (entry, index) => (index < 3 ? `${loadingLabel} 上位記録` : `${loadingLabel}ランキング`),
            getPlayerId: (entry) => entry.playFabId || ''
        });
        return;
    }
    rankingListEl.innerHTML = renderRankingState('（ランキングを取得できませんでした）');
}

export function showRanking(type) {
    const psRankingArea = document.getElementById('psRankingArea');
    const bountyRankingArea = document.getElementById('bountyRankingArea');
    const treasuryRankingArea = document.getElementById('treasuryRankingArea');
    const dartsRankingArea = document.getElementById('dartsRankingArea');
    const karaokeRankingArea = document.getElementById('karaokeRankingArea');
    const btnPs = document.getElementById('btnShowPsRanking');
    const btnBounty = document.getElementById('btnShowBountyRanking');
    const btnTreasury = document.getElementById('btnShowTreasuryRanking');
    const btnDarts = document.getElementById('btnShowDartsRanking');
    const btnKaraoke = document.getElementById('btnShowKaraokeRanking');

    const setActive = (activeBtn) => {
        [btnPs, btnBounty, btnTreasury, btnDarts, btnKaraoke].forEach((btn) => {
            if (btn) btn.classList.toggle('active', btn === activeBtn);
        });
    };

    const showArea = (activeArea) => {
        [psRankingArea, bountyRankingArea, treasuryRankingArea, dartsRankingArea, karaokeRankingArea].forEach((area) => {
            if (area) area.style.display = area === activeArea ? 'block' : 'none';
        });
    };

    if (type === 'ps') {
        showArea(psRankingArea);
        setActive(btnPs);
        getRanking();
    } else if (type === 'bounty') {
        showArea(bountyRankingArea);
        setActive(btnBounty);
        getBountyRanking();
    } else if (type === 'darts') {
        showArea(dartsRankingArea);
        setActive(btnDarts);
        getStoreGameRanking('darts_countup');
    } else if (type === 'karaoke') {
        showArea(karaokeRankingArea);
        setActive(btnKaraoke);
        getStoreGameRanking('karaoke');
    } else { // treasury
        showArea(treasuryRankingArea);
        setActive(btnTreasury);
        getNationTreasuryRanking();
    }
}
