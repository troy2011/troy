const {
    PLAYER_CONTRIBUTION_STAT,
    PLAYER_DAILY_CONTRIBUTION_STAT,
    ensureDailyContributionVersionForToday,
    getJstDateKey
} = require('./contributionStats');
const { getUnlockedFeaturesBetween } = require('./featureUnlocks');

const PLAYER_LEVEL_STAT = 'Level';
const BASE_CONTRIBUTION_PER_LEVEL = 1500;

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

function applyDerivedPlayerLevelToStats(statsMap) {
    const nextStats = { ...(statsMap || {}) };
    const contributionTotal = getPlayerContributionTotal(nextStats);
    const progress = calculateLevelFromContribution(contributionTotal);
    nextStats[PLAYER_LEVEL_STAT] = progress.level;
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

    await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
        PlayFabId: playFabId,
        Statistics: [
            { StatisticName: PLAYER_CONTRIBUTION_STAT, Value: nextTotal },
            { StatisticName: PLAYER_DAILY_CONTRIBUTION_STAT, Value: nextDailyTotal },
            { StatisticName: PLAYER_LEVEL_STAT, Value: nextProgress.level }
        ]
    });

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
        ...nextProgress
    };
}

module.exports = {
    PLAYER_LEVEL_STAT,
    PLAYER_CONTRIBUTION_STAT,
    PLAYER_DAILY_CONTRIBUTION_STAT,
    BASE_CONTRIBUTION_PER_LEVEL,
    normalizeContribution,
    calculateLevelFromContribution,
    getPlayerContributionTotal,
    applyDerivedPlayerLevelToStats,
    buildStatsMapFromStatistics,
    addPlayerNationContribution
};
