export const FEATURE_UNLOCK_LEVELS = {
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
export const FEATURE_UNLOCK_LABELS = {
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

export function normalizeLevel(value) {
    return Math.max(1, Math.floor(Number(value) || 1));
}

export function isFeatureUnlocked(featureKey, level) {
    const requiredLevel = FEATURE_UNLOCK_LEVELS[featureKey];
    if (!requiredLevel) return true;
    return normalizeLevel(level) >= requiredLevel;
}

export function formatUnlockedFeatures(features) {
    const rows = Array.isArray(features) ? features : [];
    if (!rows.length) return '';
    return `解放: ${rows.map((entry) => entry?.label || FEATURE_UNLOCK_LABELS[entry?.key] || entry?.key).filter(Boolean).join(' / ')}`;
}
