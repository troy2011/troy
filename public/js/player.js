// c:/Users/ikeda/my-liff-app/public/js/player.js

import {
    getPlayerStats as fetchPlayerStats,
    getPoints as fetchPoints,
    addPoints as requestAddPoints,
    usePoints as requestUsePoints,
    getRanking as fetchRanking,
    getBountyRanking as fetchBountyRanking,
    getNationTreasuryRanking as fetchNationTreasuryRanking
} from './playfabClient.js';
import { getNationLabel } from './nationLabels.js';

let myPlayerStats = {};
const LOW_PS_THRESHOLD = 200;

export function getMyPlayerStats() {
    return myPlayerStats;
}

export async function getPlayerStats(playFabId) {
    const data = await fetchPlayerStats(playFabId);
    if (data?.stats) {
        myPlayerStats = data.stats;
        updatePlayerStatsDisplay();
    }
}

function updatePlayerStatsDisplay() {
    const { HP = 0, MaxHP = 1, MP = 0, MaxMP = 1, Level = 1, ちから = 0, みのまもり = 0, すばやさ = 0, かしこさ = 0 } = myPlayerStats;
    document.getElementById('globalCurrentHP').innerText = HP;
    document.getElementById('globalMaxHP').innerText = MaxHP;
    document.getElementById('globalCurrentMP').innerText = MP;
    document.getElementById('globalMaxMP').innerText = MaxMP;
    document.getElementById('globalHpBar').style.width = `${(HP / MaxHP) * 100}%`;
    document.getElementById('globalMpBar').style.width = `${(MP / MaxMP) * 100}%`;
    document.getElementById('globalLevel').innerText = Level;
    document.getElementById('currentStr').innerText = ちから;
    document.getElementById('currentDef').innerText = みのまもり;
    document.getElementById('currentAgi').innerText = すばやさ;
    document.getElementById('currentInt').innerText = かしこさ;
}

export async function getPoints(playFabId) {
    const data = await fetchPoints(playFabId);
    if (data) {
        updatePointsDisplays(data.points);
    }
}

export async function addPoints(playFabId) {
    const data = await requestAddPoints(playFabId, 10);
    if (data) {
        updatePointsDisplays(data.newBalance);
        const pointMessageEl = document.getElementById('pointMessage');
        if (pointMessageEl) pointMessageEl.innerText = '10 Ps 追加しました！';
        await getRanking();
    }
}

export async function usePoints(playFabId) {
    const data = await requestUsePoints(playFabId, 5);
    if (data) {
        updatePointsDisplays(data.newBalance);
        const pointMessageEl = document.getElementById('pointMessage');
        if (pointMessageEl) pointMessageEl.innerText = '5 Ps 使いました！';
        await getRanking();
    }
}

function updatePointsDisplays(points) {
    const value = Number(points);
    if (!Number.isFinite(value)) return;
    animatePoints(document.getElementById('currentPoints'), value);
    animatePoints(document.getElementById('globalPoints'), value);
    const psCard = document.querySelector('.home-ps-card');
    if (psCard) {
        psCard.classList.toggle('is-low', value <= LOW_PS_THRESHOLD);
    }
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

export async function getRanking() {
    const rankingListEl = document.getElementById('rankingList');
    if (!rankingListEl) return;
    rankingListEl.innerHTML = '<li>（ランキングを読み込んでいます...）</li>';
    const data = await fetchRanking();
    if (data?.ranking) {
        const myDisplayName = window.myLineProfile?.displayName;
        rankingListEl.innerHTML = data.ranking.map(entry => {
            const isMyRank = myDisplayName && entry.displayName === myDisplayName;
            const iconSrc = entry.avatarUrl || 'https://placehold.co/40x40/4a5568/e2e8f0?text=?';
            return `<li${isMyRank ? ' class="myRank"' : ''}><img src="${iconSrc}" class="rank-icon" onerror="this.src='https://placehold.co/40x40/4a5568/e2e8f0?text=?'">${entry.displayName}(${entry.score}Ps)</li>`;
        }).join('') || '<li>（データがありません）</li>';
    }
}

export async function getBountyRanking() {
    const rankingListEl = document.getElementById('bountyRankingList');
    if (!rankingListEl) return;
    rankingListEl.innerHTML = '<li>（懸賞金ランキングを読み込んでいます...）</li>';
    const data = await fetchBountyRanking();
    if (data?.ranking) {
        const myDisplayName = window.myLineProfile?.displayName;
        rankingListEl.innerHTML = data.ranking.map(entry => {
            const isMyRank = myDisplayName && entry.displayName === myDisplayName;
            const iconSrc = entry.avatarUrl || 'https://placehold.co/40x40/4a5568/e2e8f0?text=?';
            return `<li${isMyRank ? ' class="myRank"' : ''}><img src="${iconSrc}" class="rank-icon" onerror="this.src='https://placehold.co/40x40/4a5568/e2e8f0?text=?'">${entry.displayName}(${entry.score}BT)</li>`;
        }).join('') || '<li>（データがありません）</li>';
    }
}

export async function getNationTreasuryRanking() {
    const rankingListEl = document.getElementById('treasuryRankingList');
    if (!rankingListEl) return;
    rankingListEl.innerHTML = '<li>（国庫ランキングを読み込んでいます...）</li>';
    const data = await fetchNationTreasuryRanking();
    if (data?.ranking) {
        rankingListEl.innerHTML = data.ranking.map((entry, index) => {
            const nationKey = String(entry.nation || '').toLowerCase();
            const label = getNationLabel(nationKey) || entry.nation || '不明';
            const value = Number(entry.treasuryPs || 0);
            return `<li>${label} (${value}Ps)</li>`;
        }).join('') || '<li>（データがありません）</li>';
    }
}

export function showRanking(type) {
    const psRankingArea = document.getElementById('psRankingArea');
    const bountyRankingArea = document.getElementById('bountyRankingArea');
    const treasuryRankingArea = document.getElementById('treasuryRankingArea');
    const btnPs = document.getElementById('btnShowPsRanking');
    const btnBounty = document.getElementById('btnShowBountyRanking');
    const btnTreasury = document.getElementById('btnShowTreasuryRanking');

    if (type === 'ps') {
        psRankingArea.style.display = 'block';
        bountyRankingArea.style.display = 'none';
        if (treasuryRankingArea) treasuryRankingArea.style.display = 'none';
        btnPs.classList.add('active');
        btnBounty.classList.remove('active');
        if (btnTreasury) btnTreasury.classList.remove('active');
        getRanking();
    } else if (type === 'bounty') {
        psRankingArea.style.display = 'none';
        bountyRankingArea.style.display = 'block';
        if (treasuryRankingArea) treasuryRankingArea.style.display = 'none';
        btnPs.classList.remove('active');
        btnBounty.classList.add('active');
        if (btnTreasury) btnTreasury.classList.remove('active');
        getBountyRanking();
    } else { // treasury
        psRankingArea.style.display = 'none';
        bountyRankingArea.style.display = 'none';
        if (treasuryRankingArea) treasuryRankingArea.style.display = 'block';
        btnPs.classList.remove('active');
        btnBounty.classList.remove('active');
        if (btnTreasury) btnTreasury.classList.add('active');
        getNationTreasuryRanking();
    }
}
