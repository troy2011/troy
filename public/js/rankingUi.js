import { buildPlayerTriggerHtml } from './playerProfile.js';
import { getPlayerRankName } from './homePlayerStatus.js';

export const STORE_GAME_RANKING_UI = {
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
        label: 'タロットキングダム'
    },
    karaoke: {
        listId: 'karaokeRankingList',
        label: 'カラオケ採点'
    }
};

const FALLBACK_AVATAR = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#1f2937"/><circle cx="48" cy="38" r="18" fill="#64748b"/><path d="M18 82c6-16 19-24 30-24s24 8 30 24" fill="#94a3b8"/></svg>'
)}`;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function formatNumber(value) {
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

export function formatStoreGameRankingScore(entry, gameType) {
    const value = formatStoreGameScore(entry, gameType);
    return STORE_GAME_RANKING_UI[gameType]?.isRating ? `レート ${value}` : `${value}点`;
}

export function normalizeStoreGameRankingType(value) {
    const key = String(value || '').trim().toLowerCase();
    return STORE_GAME_RANKING_UI[key] ? key : 'darts_countup';
}

function getRankMedal(index) {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return '';
}

export function renderRankingState(message) {
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

export function formatPlayerLevelRankMeta(entry, index) {
    const rawLevel = Number(entry?.level ?? entry?.Level);
    const level = Number.isFinite(rawLevel) && rawLevel >= 1 ? Math.floor(rawLevel) : null;
    const rankName = String(entry?.crewRankTitle || entry?.rankName || entry?.rankTitle || '').trim()
        || (level ? getPlayerRankName(level) : '');
    if (level && rankName) return `Lv.${level} ${rankName}`;
    if (level) return `Lv.${level}`;
    if (rankName) return rankName;
    return `${index + 1}位`;
}

export function renderRankingRows(entries, options = {}) {
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
