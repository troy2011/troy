const FEATURE_UNLOCK_LEVELS = {
    hairVisible: 2,
    haircut: 4,
    skinChange: 6,
    faceChange: 8,
    facialHairVisible: 21,
    facialHairRemove: 21,
    facialHairChange: 21,
    shipPurchase: 10,
    exploration: 10
};
const FEATURE_UNLOCK_LABELS = {
    hairVisible: '髪型表示',
    haircut: '髪型ランダム変更（散髪）',
    skinChange: '肌色ランダム変更（美容）',
    faceChange: '顔ランダム変更（整形）',
    facialHairVisible: 'ひげ表示',
    facialHairRemove: 'ひげ脱毛',
    facialHairChange: 'フェイシャルエステ',
    shipPurchase: '船建造',
    exploration: '探索'
};

function normalizeLevel(value) {
    return Math.max(1, Math.floor(Number(value) || 1));
}

function isFeatureUnlocked(featureKey, level) {
    const requiredLevel = FEATURE_UNLOCK_LEVELS[featureKey];
    if (!requiredLevel) return true;
    return normalizeLevel(level) >= requiredLevel;
}

function getUnlockedFeaturesBetween(previousLevel, nextLevel) {
    const before = normalizeLevel(previousLevel);
    const after = normalizeLevel(nextLevel);
    if (after <= before) return [];
    return Object.entries(FEATURE_UNLOCK_LEVELS)
        .filter(([, requiredLevel]) => requiredLevel > before && requiredLevel <= after)
        .map(([key, requiredLevel]) => ({
            key,
            level: requiredLevel,
            label: FEATURE_UNLOCK_LABELS[key] || key
        }));
}

module.exports = {
    FEATURE_UNLOCK_LEVELS,
    FEATURE_UNLOCK_LABELS,
    normalizeLevel,
    isFeatureUnlocked,
    getUnlockedFeaturesBetween
};
