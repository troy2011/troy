const {
    PLAYER_CONTRIBUTION_STAT,
    PLAYER_DAILY_CONTRIBUTION_STAT,
    ensureDailyContributionVersionForToday,
    getJstDateKey
} = require('./contributionStats');
const { getUnlockedFeaturesBetween } = require('./featureUnlocks');

const PLAYER_LEVEL_STAT = 'Level';
const PLAYER_VITALITY_STAT = 'たいりょく';
const BASE_CONTRIBUTION_PER_LEVEL = 1500;
const PIRATE_KING_LEVEL = 51;
const PLAYER_BASE_MAX_HP = 60;
const PLAYER_MAX_HP_PER_LEVEL = 4;
const PLAYER_MAX_HP_PER_VITALITY = 4;
const DEFAULT_PLAYER_VITALITY = 5;

function normalizeContribution(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
}

function calculateLevelFromContribution(totalContribution) {
    let level = 1;
    let remaining = normalizeContribution(totalContribution);
    for (let i = 0; i < 10000; i += 1) {
        const rank = Math.floor(level / 10);
        const needed = BASE_CONTRIBUTION_PER_LEVEL * (2 ** rank);
        if (remaining < needed) {
            return { level, expInto: remaining, expNeeded: needed, rank };
        }
        remaining -= needed;
        level += 1;
    }
    return { level, expInto: 0, expNeeded: BASE_CONTRIBUTION_PER_LEVEL, rank: Math.floor(level / 10) };
}

function getPlayerContributionTotal(statsMap) {
    return normalizeContribution(statsMap?.[PLAYER_CONTRIBUTION_STAT]);
}

function normalizePlayerStat(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : fallback;
}

function hasExplicitPlayerVitality(statsMap = {}) {
    return [PLAYER_VITALITY_STAT, '体', 'Vitality', 'VIT']
        .some((key) => Number.isFinite(Number(statsMap?.[key])));
}

function getPlayerVitality(statsMap = {}) {
    for (const key of [PLAYER_VITALITY_STAT, '体', 'Vitality', 'VIT']) {
        const numeric = Number(statsMap?.[key]);
        if (Number.isFinite(numeric)) return Math.max(0, Math.floor(numeric));
    }

    // 旧データでは種族ごとの初期MaxHP（通常5、オーク15）が保存されていた。
    // 低い旧MaxHPだけを体の初期値として読み替え、種族差を維持する。
    const legacyMaxHp = normalizePlayerStat(statsMap?.MaxHP, 0);
    if (legacyMaxHp > 0 && legacyMaxHp <= 15) return legacyMaxHp;
    return DEFAULT_PLAYER_VITALITY;
}

function calculatePlayerMaxHp(statsMap = {}, levelOverride = null) {
    const level = Math.max(1, normalizePlayerStat(levelOverride ?? statsMap?.[PLAYER_LEVEL_STAT], 1));
    const vitality = getPlayerVitality(statsMap);
    const calculated = PLAYER_BASE_MAX_HP
        + ((level - 1) * PLAYER_MAX_HP_PER_LEVEL)
        + (vitality * PLAYER_MAX_HP_PER_VITALITY);
    const savedMaxHp = normalizePlayerStat(statsMap?.MaxHP, 0);
    return Math.max(1, calculated, savedMaxHp);
}

function applyDerivedPlayerLevelToStats(statsMap) {
    const nextStats = { ...(statsMap || {}) };
    const contributionTotal = getPlayerContributionTotal(nextStats);
    const progress = calculateLevelFromContribution(contributionTotal);
    nextStats[PLAYER_LEVEL_STAT] = progress.level;
    const hadExplicitVitality = hasExplicitPlayerVitality(nextStats);
    const savedMaxHp = normalizePlayerStat(nextStats.MaxHP, 0);
    const vitality = getPlayerVitality(nextStats);
    const maxHp = calculatePlayerMaxHp({ ...nextStats, [PLAYER_VITALITY_STAT]: vitality }, progress.level);
    const rawCurrentHp = Number(nextStats.HP ?? nextStats.CurrentHP);
    let currentHp = Number.isFinite(rawCurrentHp)
        ? Math.max(0, Math.min(maxHp, Math.floor(rawCurrentHp)))
        : maxHp;

    // 旧初期HPを持つプレイヤーは、現在のHP率を保って新しい最大HPへ移行する。
    if (!hadExplicitVitality && savedMaxHp > 0 && savedMaxHp <= 15 && currentHp <= savedMaxHp) {
        currentHp = Math.max(0, Math.min(maxHp, Math.round(maxHp * (currentHp / savedMaxHp))));
    }

    nextStats[PLAYER_VITALITY_STAT] = vitality;
    nextStats.MaxHP = maxHp;
    nextStats.HP = currentHp;
    if (Object.prototype.hasOwnProperty.call(nextStats, 'CurrentHP')) {
        nextStats.CurrentHP = currentHp;
    }
    return {
        stats: nextStats,
        contributionTotal,
        ...progress
    };
}

function buildStatsMapFromStatistics(statistics) {
    const statsMap = {};
    if (Array.isArray(statistics)) {
        statistics.forEach((stat) => {
            statsMap[stat.StatisticName] = stat.Value;
        });
    }
    return statsMap;
}

function parseBooleanFlag(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

async function syncPirateKingNationStatus(playFabId, deps, level) {
    if (!playFabId || Math.max(1, Math.floor(Number(level) || 1)) < PIRATE_KING_LEVEL) {
        return { updated: false, reason: 'NotPirateKing' };
    }
    const { promisifyPlayFab, PlayFabServer } = deps || {};
    if (typeof promisifyPlayFab !== 'function' || !PlayFabServer) {
        throw new Error('Missing PlayFab dependencies for pirate king nation sync');
    }
    const readOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: ['IsKing', 'Nation', 'AvatarColor']
    });
    if (parseBooleanFlag(readOnly?.Data?.IsKing?.Value)) {
        return { updated: false, reason: 'NationKing' };
    }
    const currentNation = String(readOnly?.Data?.Nation?.Value || '').trim().toLowerCase();
    const currentAvatarColor = String(readOnly?.Data?.AvatarColor?.Value || '').trim().toLowerCase();
    if (currentNation === 'neutral' && currentAvatarColor === 'black') {
        return { updated: false, reason: 'AlreadySynced', nation: 'neutral', avatarColor: 'black' };
    }
    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: {
            Nation: 'neutral',
            AvatarColor: 'black',
            NationChangedAt: String(Date.now())
        }
    });
    return { updated: true, nation: 'neutral', avatarColor: 'black' };
}

async function addPlayerNationContribution(playFabId, amount, deps, options = {}) {
    const value = normalizeContribution(amount);
    if (!playFabId || value <= 0) {
        const baseStats = options.statsMap || {};
        const derived = applyDerivedPlayerLevelToStats(baseStats);
        return { updated: false, ...derived };
    }

    const { promisifyPlayFab, PlayFabServer } = deps || {};
    if (typeof promisifyPlayFab !== 'function' || !PlayFabServer) {
        throw new Error('Missing PlayFab dependencies for nation contribution update');
    }

    const todayKey = getJstDateKey(options.nowMs);
    let dailyState = { todayKey };
    try {
        dailyState = await ensureDailyContributionVersionForToday(deps, {
            todayKey,
            nowMs: options.nowMs
        });
    } catch (error) {
        console.warn('[nation-contribution] Daily rollover skipped:', error?.errorMessage || error?.message || error);
    }
    let statsMap = options.statsMap;
    if (!statsMap) {
        const statsResult = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, {
            PlayFabId: playFabId
        });
        statsMap = buildStatsMapFromStatistics(statsResult?.Statistics);
    }

    const currentTotal = getPlayerContributionTotal(statsMap);
    const currentLevel = Math.max(1, Math.floor(Number(statsMap?.[PLAYER_LEVEL_STAT]) || 1));
    const nextTotal = currentTotal + value;
    const nextProgress = calculateLevelFromContribution(nextTotal);
    const currentDailyTotal = normalizeContribution(statsMap?.[PLAYER_DAILY_CONTRIBUTION_STAT]);
    const nextDailyTotal = currentDailyTotal + value;
    const currentDerivedStats = applyDerivedPlayerLevelToStats(statsMap).stats;
    const nextDerivedStats = applyDerivedPlayerLevelToStats({
        ...currentDerivedStats,
        [PLAYER_CONTRIBUTION_STAT]: nextTotal
    }).stats;
    const maxHpGain = Math.max(0, nextDerivedStats.MaxHP - currentDerivedStats.MaxHP);
    nextDerivedStats.HP = Math.min(
        nextDerivedStats.MaxHP,
        Math.max(0, Number(currentDerivedStats.HP) || 0) + maxHpGain
    );

    await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
        PlayFabId: playFabId,
        Statistics: [
            { StatisticName: PLAYER_CONTRIBUTION_STAT, Value: nextTotal },
            { StatisticName: PLAYER_DAILY_CONTRIBUTION_STAT, Value: nextDailyTotal },
            { StatisticName: PLAYER_LEVEL_STAT, Value: nextProgress.level },
            { StatisticName: PLAYER_VITALITY_STAT, Value: nextDerivedStats[PLAYER_VITALITY_STAT] },
            { StatisticName: 'MaxHP', Value: nextDerivedStats.MaxHP },
            { StatisticName: 'HP', Value: nextDerivedStats.HP }
        ]
    });

    let pirateKingNationStatus = null;
    if (nextProgress.level >= PIRATE_KING_LEVEL) {
        try {
            pirateKingNationStatus = await syncPirateKingNationStatus(playFabId, deps, nextProgress.level);
        } catch (error) {
            pirateKingNationStatus = { updated: false, error: error?.errorMessage || error?.message || String(error) };
            console.warn('[nation-contribution] Pirate king nation sync failed:', pirateKingNationStatus.error);
        }
    }

    return {
        updated: true,
        dayKey: dailyState.todayKey,
        contributionTotal: nextTotal,
        dailyContributionTotal: nextDailyTotal,
        previousContributionTotal: currentTotal,
        previousDailyContributionTotal: currentDailyTotal,
        previousLevel: currentLevel,
        leveledUp: nextProgress.level > currentLevel,
        unlockedFeatures: getUnlockedFeaturesBetween(currentLevel, nextProgress.level),
        pirateKingNationStatus,
        ...nextProgress
    };
}

module.exports = {
    PLAYER_LEVEL_STAT,
    PLAYER_VITALITY_STAT,
    PLAYER_CONTRIBUTION_STAT,
    PLAYER_DAILY_CONTRIBUTION_STAT,
    BASE_CONTRIBUTION_PER_LEVEL,
    PIRATE_KING_LEVEL,
    PLAYER_BASE_MAX_HP,
    PLAYER_MAX_HP_PER_LEVEL,
    PLAYER_MAX_HP_PER_VITALITY,
    DEFAULT_PLAYER_VITALITY,
    normalizeContribution,
    calculateLevelFromContribution,
    getPlayerContributionTotal,
    getPlayerVitality,
    calculatePlayerMaxHp,
    applyDerivedPlayerLevelToStats,
    buildStatsMapFromStatistics,
    syncPirateKingNationStatus,
    addPlayerNationContribution
};
