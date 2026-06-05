const STAT_ALLOCATION_POINTS_PER_LEVEL = 5;

const ALLOCATABLE_STATS = Object.freeze([
    { id: 'str', stat: 'ちから', spentStat: 'StatPointSpent_Str', label: '力' },
    { id: 'def', stat: 'みのまもり', spentStat: 'StatPointSpent_Def', label: '守' },
    { id: 'agi', stat: 'すばやさ', spentStat: 'StatPointSpent_Agi', label: '速' },
    { id: 'int', stat: 'かしこさ', spentStat: 'StatPointSpent_Int', label: '知' }
]);

function normalizeNonNegativeInteger(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

function normalizeLevel(value) {
    return Math.max(1, normalizeNonNegativeInteger(value) || 1);
}

function getStatAllocationEarnedPoints(level) {
    return Math.max(0, (normalizeLevel(level) - 1) * STAT_ALLOCATION_POINTS_PER_LEVEL);
}

function calculateStatAllocationState(statsMap = {}) {
    const level = normalizeLevel(statsMap.Level);
    const totalEarned = getStatAllocationEarnedPoints(level);
    const stats = {};
    let totalAllocated = 0;

    ALLOCATABLE_STATS.forEach((entry) => {
        const allocated = normalizeNonNegativeInteger(statsMap[entry.spentStat]);
        totalAllocated += allocated;
        stats[entry.id] = {
            id: entry.id,
            stat: entry.stat,
            label: entry.label,
            value: normalizeNonNegativeInteger(statsMap[entry.stat]),
            allocated
        };
    });

    return {
        pointsPerLevel: STAT_ALLOCATION_POINTS_PER_LEVEL,
        level,
        totalEarned,
        totalAllocated,
        availablePoints: Math.max(0, totalEarned - totalAllocated),
        stats
    };
}

function normalizeStatAllocationDeltas(rawAllocations = {}) {
    const normalized = {};
    ALLOCATABLE_STATS.forEach((entry) => {
        const rawValue = rawAllocations?.[entry.id] ?? rawAllocations?.[entry.stat];
        const value = normalizeNonNegativeInteger(rawValue);
        if (value > 0) {
            normalized[entry.id] = value;
        }
    });
    return normalized;
}

function getStatAllocationDeltaTotal(deltas = {}) {
    return Object.values(deltas).reduce((sum, value) => sum + normalizeNonNegativeInteger(value), 0);
}

function applyStatAllocationDeltas(statsMap = {}, deltas = {}) {
    const nextStats = { ...(statsMap || {}) };
    const statistics = [];

    ALLOCATABLE_STATS.forEach((entry) => {
        const delta = normalizeNonNegativeInteger(deltas[entry.id]);
        if (delta <= 0) return;
        const nextValue = normalizeNonNegativeInteger(nextStats[entry.stat]) + delta;
        const nextSpent = normalizeNonNegativeInteger(nextStats[entry.spentStat]) + delta;
        nextStats[entry.stat] = nextValue;
        nextStats[entry.spentStat] = nextSpent;
        statistics.push({ StatisticName: entry.stat, Value: nextValue });
        statistics.push({ StatisticName: entry.spentStat, Value: nextSpent });
    });

    return { stats: nextStats, statistics };
}

module.exports = {
    STAT_ALLOCATION_POINTS_PER_LEVEL,
    ALLOCATABLE_STATS,
    calculateStatAllocationState,
    normalizeStatAllocationDeltas,
    getStatAllocationDeltaTotal,
    applyStatAllocationDeltas
};
