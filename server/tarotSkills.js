const TROY_SKILLS_DATA_KEY = 'troySkills';
const LEGACY_TROY_SKILLS_DATA_KEY = 'troyQuestSkills';
const TAROT_AWAKENINGS_DATA_KEY = 'ArcanaAwakenings';
const MINOR_SKILL_MAX_LEVEL = 5;
const MAJOR_AWAKEN_MAX_LEVEL = 5;

const SUIT_LABELS = {
    wand: 'ワンド',
    sword: 'ソード',
    cup: 'カップ',
    pentacle: 'ペンタクル'
};

const FACE_LABELS = {
    PAGE: 'ペイジ',
    KNIGHT: 'ナイト',
    QUEEN: 'クイーン',
    KING: 'キング'
};

function parseJsonValue(rawValue, fallback = {}) {
    if (!rawValue) return fallback;
    if (typeof rawValue === 'object') return rawValue;
    try {
        const parsed = JSON.parse(rawValue);
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function normalizeSuitKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'wands') return 'wand';
    if (raw === 'swords') return 'sword';
    if (raw === 'cups') return 'cup';
    if (raw === 'pentacles') return 'pentacle';
    return raw;
}

function normalizeRankValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
    return raw.toUpperCase();
}

function getRankNumber(itemData) {
    const normalized = normalizeRankValue(
        itemData?.ArcanaRank
        ?? itemData?.Rank
        ?? itemData?.CardRank
        ?? itemData?.CardNumber
    );
    if (typeof normalized === 'number') return normalized;
    const faceOrder = {
        PAGE: 11,
        KNIGHT: 12,
        QUEEN: 13,
        KING: 14
    };
    return faceOrder[normalized] || 1;
}

function getRankKey(itemData) {
    const normalized = normalizeRankValue(
        itemData?.ArcanaRank
        ?? itemData?.Rank
        ?? itemData?.CardRank
        ?? itemData?.CardNumber
    );
    return typeof normalized === 'number' ? String(normalized) : String(normalized || '1');
}

function getRankLabel(itemData) {
    const normalized = normalizeRankValue(
        itemData?.ArcanaRank
        ?? itemData?.Rank
        ?? itemData?.CardRank
        ?? itemData?.CardNumber
    );
    if (typeof normalized === 'number') {
        return normalized === 1 ? 'A' : String(normalized);
    }
    return FACE_LABELS[normalized] || String(normalized || 'A');
}

function clampValue(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getMinorSkillConfig(suitKey) {
    const key = normalizeSuitKey(suitKey);
    if (key === 'wand') {
        return {
            type: 'magic',
            weapon: 'staff',
            magicKind: 'attack',
            nameSuffix: '魔弾',
            skillTypeLabel: '攻撃術'
        };
    }
    if (key === 'cup') {
        return {
            type: 'magic',
            weapon: 'staff',
            magicKind: 'heal',
            nameSuffix: '祈り',
            skillTypeLabel: '祝福術'
        };
    }
    if (key === 'sword') {
        return {
            type: 'weapon',
            weapon: 'sword',
            nameSuffix: '剣技',
            skillTypeLabel: '斬撃術'
        };
    }
    return {
        type: 'passive',
        weapon: 'shield',
        nameSuffix: '護り',
        skillTypeLabel: '防護術'
    };
}

function getMinorSkillId(itemId, itemData) {
    const suitKey = normalizeSuitKey(itemData?.ArcanaSuit || itemData?.Suit);
    const rankKey = getRankKey(itemData);
    const sourceId = String(itemId || '').trim();
    if (sourceId) return `tarot-skill-${sourceId}`;
    return `tarot-skill-${suitKey}-${rankKey}`;
}

function buildMinorSkillState(itemId, itemData, level = 1, currentState = null) {
    const suitKey = normalizeSuitKey(itemData?.ArcanaSuit || itemData?.Suit);
    const suitLabel = SUIT_LABELS[suitKey] || String(itemData?.ArcanaSuit || itemData?.Suit || '').trim();
    const rankNumber = getRankNumber(itemData);
    const rankLabel = getRankLabel(itemData);
    const config = getMinorSkillConfig(suitKey);
    const resolvedLevel = clampValue(Number(level || 1) || 1, 1, MINOR_SKILL_MAX_LEVEL);
    const cardName = String(itemData?.DisplayName || itemId || `${suitLabel}${rankLabel}`).trim();
    const keyword = String(itemData?.ArcanaKeyword || itemData?.SkillKeyword || '').trim();
    const skillId = getMinorSkillId(itemId, itemData);
    const state = {
        id: skillId,
        sourceItemId: String(itemId || '').trim(),
        sourceCardName: cardName,
        sourceSuit: suitKey,
        sourceSuitLabel: suitLabel,
        sourceRank: getRankKey(itemData),
        sourceRankLabel: rankLabel,
        skillTypeLabel: String(itemData?.ArcanaSkillType || itemData?.SkillType || config.skillTypeLabel).trim(),
        keyword,
        type: config.type,
        weapon: config.weapon,
        name: `${cardName}・${config.nameSuffix}`,
        level: resolvedLevel,
        maxLevel: MINOR_SKILL_MAX_LEVEL,
        copiesSpent: Math.max(resolvedLevel, Number(currentState?.copiesSpent || 0) || 0),
        updatedAt: new Date().toISOString()
    };

    if (config.type === 'magic') {
        const baseMpCost = config.magicKind === 'heal'
            ? 4 + Math.floor(rankNumber / 3)
            : 5 + Math.floor(rankNumber / 2);
        const basePower = config.magicKind === 'heal'
            ? 0.95 + (rankNumber * 0.035)
            : 1.02 + (rankNumber * 0.045);
        state.magicKind = config.magicKind;
        state.mpCost = Math.max(3, baseMpCost + Math.floor((resolvedLevel - 1) / 2));
        state.powerMultiplier = Number((basePower + ((resolvedLevel - 1) * (config.magicKind === 'heal' ? 0.07 : 0.08))).toFixed(3));
        state.minRange = 1;
        state.maxRange = rankNumber >= 12 ? 3 : 2;
        if (config.magicKind === 'heal') {
            state.healBelow = Number(clampValue(0.45 + (rankNumber * 0.015) + ((resolvedLevel - 1) * 0.02), 0.45, 0.8).toFixed(3));
        }
    } else if (config.type === 'weapon') {
        state.procChance = Number(clampValue(0.12 + (rankNumber * 0.012) + ((resolvedLevel - 1) * 0.03), 0.12, 0.65).toFixed(3));
        state.powerMultiplier = Number((1.05 + (rankNumber * 0.03) + ((resolvedLevel - 1) * 0.06)).toFixed(3));
    } else if (config.type === 'passive') {
        state.procChance = 0;
        state.powerMultiplier = Number((1 + ((resolvedLevel - 1) * 0.02)).toFixed(3));
    }

    return state;
}

function mapSkillsBySourceItem(skills) {
    const result = {};
    Object.values(skills || {}).forEach((entry) => {
        const key = String(entry?.sourceItemId || '').trim();
        if (!key) return;
        result[key] = entry;
    });
    return result;
}

module.exports = {
    TROY_SKILLS_DATA_KEY,
    LEGACY_TROY_SKILLS_DATA_KEY,
    TAROT_AWAKENINGS_DATA_KEY,
    MINOR_SKILL_MAX_LEVEL,
    MAJOR_AWAKEN_MAX_LEVEL,
    parseJsonValue,
    normalizeSuitKey,
    getRankKey,
    getRankLabel,
    getMinorSkillId,
    buildMinorSkillState,
    mapSkillsBySourceItem
};
