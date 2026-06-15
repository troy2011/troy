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
} from './playfabClient.js';
import { formatCurrencyLabel } from './config.js';
import { getNationLabel } from './nationLabels.js';
import { buildPlayerTriggerHtml } from './playerProfile.js';

let myPlayerStats = {};
let myCrewRankInfo = null;
let rankingControlsWired = false;
const LOW_GOLD_THRESHOLD = 200;
const SPECIALTY_RESOURCE_IDS = ['RR', 'RG', 'RY', 'RB'];
const BOUNTY_UNIT_LABEL = 'ĐɃ';
const STORE_GAME_RANKING_UI = {
    darts_countup: {
        listId: 'dartsRankingList',
        label: 'ダーツカウントアップ'
    },
    billiards: {
        listId: 'billiardsRankingList',
        label: 'ビリヤード',
        isRating: true
    },
    game: {
        listId: 'gameRankingList',
        label: 'ゲーム',
        isRating: true
    },
    karaoke: {
        listId: 'karaokeRankingList',
        label: 'カラオケ採点'
    }
};
const FALLBACK_AVATAR = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#1f2937"/><circle cx="48" cy="38" r="18" fill="#64748b"/><path d="M18 82c6-16 19-24 30-24s24 8 30 24" fill="#94a3b8"/></svg>'
)}`;

export function getMyPlayerStats() {
    return myPlayerStats;
}

export function getMyCrewRankInfo() {
    return myCrewRankInfo;
}

function getPlayerRankName(level) {
    const value = Math.max(1, Math.floor(Number(level) || 1));
    if (value >= 41) return '海賊王';
    if (value >= 31) return '提督';
    if (value >= 21) return '船長';
    if (value >= 11) return '航海士';
    return '見習い';
}

function getPlayerRankBenefitItems(level) {
    const value = Math.max(1, Math.floor(Number(level) || 1));
    const sizeUpOnce = {
        label: '1杯サイズUP',
        title: '入店中、対象ドリンクを1杯だけ大きいサイズにできます'
    };
    const sizeUpUnlimited = {
        label: 'サイズUP無制限',
        title: '入店中、対象ドリンクを何杯でもサイズアップできます'
    };
    if (value >= 41) {
        return [
            sizeUpUnlimited,
            { label: '店内ゲーム遊び放題', title: '入店中、対象の店内ゲームを自由に遊べます' }
        ];
    }
    if (value >= 31) return [sizeUpUnlimited];
    if (value >= 21) {
        return [
            sizeUpOnce,
            { label: '専用海賊ジョッキ', title: '店内で専用の海賊ジョッキを使えます' }
        ];
    }
    if (value >= 11) {
        return [
            sizeUpOnce,
            { label: '階級表示', title: '入店時の表示に階級が出ます' }
        ];
    }
    return [{ label: '通常サービス', title: '通常の店内サービスです' }];
}

function renderHomeRankBenefits(element, level, crewRoleLabel) {
    if (!element) return;
    const items = [];
    const roleLabel = String(crewRoleLabel || '').trim();
    if (roleLabel) {
        items.push({
            label: roleLabel,
            title: `海賊団の役職: ${roleLabel}`,
            className: 'is-role'
        });
    }
    items.push(...getPlayerRankBenefitItems(level));

    element.replaceChildren();
    element.setAttribute('aria-label', items.map((item) => item.title || item.label).join('、'));
    items.forEach((item) => {
        const chip = document.createElement('span');
        chip.className = `home-rank-benefit-chip ${item.className || ''}`.trim();
        chip.textContent = item.label;
        chip.title = item.title || item.label;
        chip.setAttribute('aria-label', item.title || item.label);
        element.appendChild(chip);
    });
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
    const { Level = 1, ちから = 0, みのまもり = 0, すばやさ = 0, かしこさ = 0 } = myPlayerStats;
    const rankName = myCrewRankInfo?.crewRankTitle || getPlayerRankName(Level);
    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.innerText = value;
    };
    setText('globalLevel', Level);
    const rankBadgeEl = document.getElementById('globalRankBadge');
    if (rankBadgeEl) rankBadgeEl.innerText = rankName;
    const benefitEl = document.getElementById('homeRankBenefit');
    renderHomeRankBenefits(benefitEl, Level, myCrewRankInfo?.crewRoleLabel);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('player:stats-updated', { detail: { stats: { ...myPlayerStats } } }));
    }
    setText('homeStatStr', ちから);
    setText('homeStatDef', みのまもり);
    setText('homeStatAgi', すばやさ);
    setText('homeStatInt', かしこさ);
    setText('currentStr', ちから);
    setText('currentDef', みのまもり);
    setText('currentAgi', すばやさ);
    setText('currentInt', かしこさ);
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

function formatStoreGameScore(entry, gameType) {
    const storedScore = Number(entry?.score || 0);
    const scoreScale = Math.max(1, Math.floor(Number(entry?.scoreScale) || (gameType === 'karaoke' ? 1000 : 1)));
    if (gameType === 'karaoke') {
        return (storedScore / scoreScale).toLocaleString('ja-JP', {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3
        });
    }
    return formatNumber(storedScore);
}

function formatStoreGameRankingScore(entry, gameType) {
    const value = formatStoreGameScore(entry, gameType);
    return STORE_GAME_RANKING_UI[gameType]?.isRating ? `レート ${value}` : `${value}点`;
}

function normalizeStoreGameRankingType(value) {
    const key = String(value || '').trim().toLowerCase();
    return STORE_GAME_RANKING_UI[key] ? key : 'darts_countup';
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

function formatPlayerLevelRankMeta(entry, index) {
    const rawLevel = Number(entry?.level ?? entry?.Level);
    const level = Number.isFinite(rawLevel) && rawLevel >= 1 ? Math.floor(rawLevel) : null;
    const rankName = String(entry?.crewRankTitle || entry?.rankName || entry?.rankTitle || '').trim()
        || (level ? getPlayerRankName(level) : '');
    if (level && rankName) return `Lv.${level} ${rankName}`;
    if (level) return `Lv.${level}`;
    if (rankName) return rankName;
    return `${index + 1}位`;
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
