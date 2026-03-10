const { getMajorArcanaTitle } = require('./tarotCards');

const MAX_MAJOR_AWAKEN_LEVEL = 5;

const DEFAULT_AWAKENING_CONFIG = {
    summary: '装備者の資質を底上げする。',
    baseStats: {},
    perLevelStats: {},
    battle: {}
};

const MAJOR_ARCANA_AWAKENINGS = {
    'arcana-0': {
        summary: '先手と身のこなしを強化する。',
        baseStats: { Agi: 1, CastRate: 1 },
        perLevelStats: { Agi: 1 },
        battle: {
            damageTakenReductionBase: 0.01,
            damageTakenReductionPerLevel: 0.01,
            dashBonusBase: 0.02,
            dashBonusPerLevel: 0.01,
            evadeBonusBase: 0.02,
            evadeBonusPerLevel: 0.01,
            skillProcBonusBase: 0.01,
            skillProcBonusPerLevel: 0.01
        }
    },
    'arcana-1': {
        summary: '杖魔法と詠唱を強化する。',
        baseStats: { Int: 1, MagicPower: 2, CastRate: 1 },
        perLevelStats: { MagicPower: 1, CastRate: 1 },
        battle: {
            magicAttackBoostBase: 0.06,
            magicAttackBoostPerLevel: 0.03,
            basicMagicBoostBase: 0.04,
            basicMagicBoostPerLevel: 0.02,
            mpCostRateReductionBase: 0.02,
            mpCostRateReductionPerLevel: 0.01,
            magicPreferenceBase: 0.12,
            magicPreferencePerLevel: 0.05
        }
    },
    'arcana-2': {
        summary: '回復と魔法防御を強化する。',
        baseStats: { Int: 1, HealPower: 2 },
        perLevelStats: { HealPower: 1 },
        battle: {
            healBoostBase: 0.08,
            healBoostPerLevel: 0.03,
            magicDefenseBonusBase: 2,
            magicDefenseBonusPerLevel: 1,
            healThresholdBonusBase: 0.04,
            healThresholdBonusPerLevel: 0.02,
            healPreferenceBase: 0.12,
            healPreferencePerLevel: 0.04
        }
    },
    'arcana-3': {
        summary: '継戦力と守りを整える。',
        baseStats: { Defense: 1, HealPower: 1 },
        perLevelStats: { Defense: 1 },
        battle: {
            damageTakenReductionBase: 0.03,
            damageTakenReductionPerLevel: 0.01,
            healBoostBase: 0.03,
            healBoostPerLevel: 0.02
        }
    },
    'arcana-4': {
        summary: '物理火力と突破力を強化する。',
        baseStats: { Power: 2, Defense: 1 },
        perLevelStats: { Power: 1 },
        battle: {
            attackBoostBase: 0.06,
            attackBoostPerLevel: 0.03,
            dashBonusBase: 0.01,
            dashBonusPerLevel: 0.01
        }
    },
    'arcana-5': {
        summary: '支援と耐性を強化する。',
        baseStats: { Defense: 1, HealPower: 1, StatusRate: 1 },
        perLevelStats: { HealPower: 1, StatusRate: 1 },
        battle: {
            healBoostBase: 0.04,
            healBoostPerLevel: 0.02,
            damageTakenReductionBase: 0.02,
            damageTakenReductionPerLevel: 0.01,
            magicDefenseBonusBase: 1,
            magicDefenseBonusPerLevel: 1
        }
    },
    'arcana-6': {
        summary: '連携と魔力循環を整える。',
        baseStats: { Agi: 1, Int: 1, MpEfficiency: 1 },
        perLevelStats: { MpEfficiency: 1 },
        battle: {
            attackBoostBase: 0.02,
            attackBoostPerLevel: 0.02,
            magicAttackBoostBase: 0.02,
            magicAttackBoostPerLevel: 0.02,
            skillProcBonusBase: 0.01,
            skillProcBonusPerLevel: 0.01
        }
    },
    'arcana-7': {
        summary: '突進と槍戦を強化する。',
        baseStats: { Power: 1, Agi: 1 },
        perLevelStats: { Power: 1, Agi: 1 },
        battle: {
            attackBoostBase: 0.04,
            attackBoostPerLevel: 0.03,
            dashBonusBase: 0.02,
            dashBonusPerLevel: 0.01,
            lungeBonusBase: 0.02,
            lungeBonusPerLevel: 0.01
        }
    },
    'arcana-8': {
        summary: '近接の押し合いに強くなる。',
        baseStats: { Power: 2 },
        perLevelStats: { Power: 1, Defense: 1 },
        battle: {
            attackBoostBase: 0.05,
            attackBoostPerLevel: 0.02,
            damageTakenReductionBase: 0.02,
            damageTakenReductionPerLevel: 0.01
        }
    },
    'arcana-9': {
        summary: '高位魔法とMP効率を強化する。',
        baseStats: { Int: 2, MagicPower: 1 },
        perLevelStats: { MagicPower: 1, MpEfficiency: 1 },
        battle: {
            magicAttackBoostBase: 0.05,
            magicAttackBoostPerLevel: 0.03,
            mpCostRateReductionBase: 0.03,
            mpCostRateReductionPerLevel: 0.01,
            magicPreferenceBase: 0.08,
            magicPreferencePerLevel: 0.04
        }
    },
    'arcana-10': {
        summary: '発動率と流れを引き寄せる。',
        baseStats: { Agi: 1, StatusRate: 1 },
        perLevelStats: { StatusRate: 1 },
        battle: {
            skillProcBonusBase: 0.03,
            skillProcBonusPerLevel: 0.01,
            repositionBonusBase: 0.01,
            repositionBonusPerLevel: 0.01,
            snipeBonusBase: 0.01,
            snipeBonusPerLevel: 0.01
        }
    },
    'arcana-11': {
        summary: '裁きの構えで守りを固める。',
        baseStats: { Defense: 1, Int: 1 },
        perLevelStats: { Defense: 1 },
        battle: {
            damageTakenReductionBase: 0.03,
            damageTakenReductionPerLevel: 0.01,
            magicDefenseBonusBase: 2,
            magicDefenseBonusPerLevel: 1,
            skillProcBonusBase: 0.01,
            skillProcBonusPerLevel: 0.01
        }
    },
    'arcana-12': {
        summary: '耐えて整える後半型になる。',
        baseStats: { Defense: 1, MpEfficiency: 1 },
        perLevelStats: { Defense: 1, HealPower: 1 },
        battle: {
            damageTakenReductionBase: 0.04,
            damageTakenReductionPerLevel: 0.01,
            healThresholdBonusBase: 0.05,
            healThresholdBonusPerLevel: 0.02
        }
    },
    'arcana-13': {
        summary: '瀕死の敵を仕留めやすくなる。',
        baseStats: { Power: 1, MagicPower: 1 },
        perLevelStats: { Power: 1, MagicPower: 1 },
        battle: {
            attackBoostBase: 0.02,
            attackBoostPerLevel: 0.02,
            magicAttackBoostBase: 0.02,
            magicAttackBoostPerLevel: 0.02,
            executeThresholdBase: 0.18,
            executeThresholdPerLevel: 0.02,
            executeBoostBase: 0.12,
            executeBoostPerLevel: 0.03
        }
    },
    'arcana-14': {
        summary: 'MP効率と回復を両立する。',
        baseStats: { HealPower: 1, CastRate: 1, MpEfficiency: 1 },
        perLevelStats: { HealPower: 1, MpEfficiency: 1 },
        battle: {
            healBoostBase: 0.05,
            healBoostPerLevel: 0.03,
            mpCostRateReductionBase: 0.03,
            mpCostRateReductionPerLevel: 0.01
        }
    },
    'arcana-15': {
        summary: '高火力と状態付与を伸ばす。',
        baseStats: { Power: 2, MagicPower: 1, StatusRate: 1 },
        perLevelStats: { Power: 1, MagicPower: 1 },
        battle: {
            attackBoostBase: 0.05,
            attackBoostPerLevel: 0.03,
            magicAttackBoostBase: 0.05,
            magicAttackBoostPerLevel: 0.03,
            skillProcBonusBase: 0.01,
            skillProcBonusPerLevel: 0.01
        }
    },
    'arcana-16': {
        summary: '一撃の破壊力を底上げする。',
        baseStats: { Power: 2, MagicPower: 2 },
        perLevelStats: { Power: 1 },
        battle: {
            attackBoostBase: 0.06,
            attackBoostPerLevel: 0.03,
            magicAttackBoostBase: 0.04,
            magicAttackBoostPerLevel: 0.02,
            skillProcBonusBase: 0.02,
            skillProcBonusPerLevel: 0.01
        }
    },
    'arcana-17': {
        summary: '回復と詠唱の安定感を高める。',
        baseStats: { HealPower: 2, CastRate: 1 },
        perLevelStats: { HealPower: 1, CastRate: 1 },
        battle: {
            healBoostBase: 0.06,
            healBoostPerLevel: 0.03,
            magicAttackBoostBase: 0.03,
            magicAttackBoostPerLevel: 0.02,
            healThresholdBonusBase: 0.03,
            healThresholdBonusPerLevel: 0.01
        }
    },
    'arcana-18': {
        summary: '幻惑と回避を強化する。',
        baseStats: { Agi: 2, StatusRate: 1 },
        perLevelStats: { Agi: 1, StatusRate: 1 },
        battle: {
            damageTakenReductionBase: 0.02,
            damageTakenReductionPerLevel: 0.01,
            evadeBonusBase: 0.02,
            evadeBonusPerLevel: 0.01,
            skillProcBonusBase: 0.02,
            skillProcBonusPerLevel: 0.01
        }
    },
    'arcana-19': {
        summary: '安定した攻撃と前進を強化する。',
        baseStats: { Power: 2, CastRate: 1 },
        perLevelStats: { Power: 1, CastRate: 1 },
        battle: {
            attackBoostBase: 0.05,
            attackBoostPerLevel: 0.03,
            magicAttackBoostBase: 0.03,
            magicAttackBoostPerLevel: 0.02,
            dashBonusBase: 0.01,
            dashBonusPerLevel: 0.01
        }
    },
    'arcana-20': {
        summary: '復帰しやすい支援型になる。',
        baseStats: { Defense: 1, HealPower: 1, MpEfficiency: 1 },
        perLevelStats: { Defense: 1, HealPower: 1 },
        battle: {
            healBoostBase: 0.05,
            healBoostPerLevel: 0.02,
            damageTakenReductionBase: 0.02,
            damageTakenReductionPerLevel: 0.01,
            healThresholdBonusBase: 0.04,
            healThresholdBonusPerLevel: 0.02
        }
    },
    'arcana-21': {
        summary: '全能型として全体を底上げする。',
        baseStats: { Power: 1, Defense: 1, Agi: 1, Int: 1, MagicPower: 1, HealPower: 1 },
        perLevelStats: { Agi: 1, Int: 1 },
        battle: {
            attackBoostBase: 0.03,
            attackBoostPerLevel: 0.02,
            magicAttackBoostBase: 0.03,
            magicAttackBoostPerLevel: 0.02,
            healBoostBase: 0.03,
            healBoostPerLevel: 0.02,
            damageTakenReductionBase: 0.02,
            damageTakenReductionPerLevel: 0.01
        }
    }
};

function clampLevel(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeMajorAwakeningLevel(value) {
    return clampLevel(Number(value || 0) || 0, 0, MAX_MAJOR_AWAKEN_LEVEL);
}

function addScaledStats(result, source, multiplier) {
    Object.entries(source || {}).forEach(([key, value]) => {
        const amount = (Number(value || 0) || 0) * multiplier;
        if (!amount) return;
        result[key] = (Number(result[key] || 0) || 0) + amount;
    });
}

function scaleStatBonuses(config, level) {
    const result = {};
    addScaledStats(result, config?.baseStats, 1);
    addScaledStats(result, config?.perLevelStats, level);
    return result;
}

function scaleBattleValue(config, key, level) {
    const base = Number(config?.battle?.[`${key}Base`] || 0) || 0;
    const perLevel = Number(config?.battle?.[`${key}PerLevel`] || 0) || 0;
    return base + (perLevel * level);
}

function formatPercent(value) {
    return `${Math.round(value * 100)}%`;
}

function buildBattleBonuses(config, level) {
    const attackBoost = scaleBattleValue(config, 'attackBoost', level);
    const magicAttackBoost = scaleBattleValue(config, 'magicAttackBoost', level);
    const healBoost = scaleBattleValue(config, 'healBoost', level);
    const damageTakenReduction = scaleBattleValue(config, 'damageTakenReduction', level);
    const mpCostRateReduction = scaleBattleValue(config, 'mpCostRateReduction', level);
    const executeBoost = scaleBattleValue(config, 'executeBoost', level);
    return {
        attackMultiplier: 1 + attackBoost,
        magicAttackMultiplier: 1 + magicAttackBoost,
        healMultiplier: 1 + healBoost,
        damageTakenMultiplier: Math.max(0.72, 1 - damageTakenReduction),
        magicDefenseBonus: Math.max(0, Math.round(scaleBattleValue(config, 'magicDefenseBonus', level))),
        dashBonus: scaleBattleValue(config, 'dashBonus', level),
        evadeBonus: scaleBattleValue(config, 'evadeBonus', level),
        knockbackBonus: scaleBattleValue(config, 'knockbackBonus', level),
        chargeBonus: scaleBattleValue(config, 'chargeBonus', level),
        lungeBonus: scaleBattleValue(config, 'lungeBonus', level),
        repositionBonus: scaleBattleValue(config, 'repositionBonus', level),
        snipeBonus: scaleBattleValue(config, 'snipeBonus', level),
        skillProcBonus: scaleBattleValue(config, 'skillProcBonus', level),
        mpCostRate: Math.max(0.65, 1 - mpCostRateReduction),
        healThresholdBonus: scaleBattleValue(config, 'healThresholdBonus', level),
        castRangeBonus: Math.max(0, Math.round(scaleBattleValue(config, 'castRangeBonus', level))),
        basicMagicMultiplier: 1 + scaleBattleValue(config, 'basicMagicBoost', level),
        executeThreshold: scaleBattleValue(config, 'executeThreshold', level),
        executeMultiplier: 1 + executeBoost,
        magicPreference: scaleBattleValue(config, 'magicPreference', level),
        healPreference: scaleBattleValue(config, 'healPreference', level)
    };
}

function buildDetailLines(stats, battle) {
    const lines = [];
    const statLabels = {
        Power: '攻撃',
        Defense: '防御',
        Agi: '速さ',
        Int: '賢さ',
        MagicPower: '術補',
        HealPower: '回復補',
        MpEfficiency: 'MP効率',
        CastRate: '詠唱',
        StatusRate: '付与率'
    };
    Object.entries(statLabels).forEach(([key, label]) => {
        const amount = Number(stats?.[key] || 0) || 0;
        if (!amount) return;
        lines.push(`${label} +${amount}`);
    });
    const attackRate = Number(battle?.attackMultiplier || 1) - 1;
    const magicRate = Number(battle?.magicAttackMultiplier || 1) - 1;
    const healRate = Number(battle?.healMultiplier || 1) - 1;
    const damageCut = 1 - (Number(battle?.damageTakenMultiplier || 1) || 1);
    const basicMagicRate = Number(battle?.basicMagicMultiplier || 1) - 1;
    const skillProc = Number(battle?.skillProcBonus || 0) || 0;
    const healThreshold = Number(battle?.healThresholdBonus || 0) || 0;
    const mpCostRate = 1 - (Number(battle?.mpCostRate || 1) || 1);
    const executeThreshold = Number(battle?.executeThreshold || 0) || 0;
    const executeRate = Number(battle?.executeMultiplier || 1) - 1;
    if (attackRate > 0) lines.push(`物理与ダメ ${formatPercent(attackRate)}`);
    if (magicRate > 0) lines.push(`魔法与ダメ ${formatPercent(magicRate)}`);
    if (healRate > 0) lines.push(`回復量 ${formatPercent(healRate)}`);
    if (damageCut > 0) lines.push(`被ダメ -${formatPercent(damageCut)}`);
    if (Number(battle?.magicDefenseBonus || 0) > 0) lines.push(`魔法防御 +${battle.magicDefenseBonus}`);
    if (basicMagicRate > 0) lines.push(`魔力弾 ${formatPercent(basicMagicRate)}`);
    if (skillProc > 0) lines.push(`発動率 +${formatPercent(skillProc)}`);
    if (healThreshold > 0) lines.push(`回復判断 +${formatPercent(healThreshold)}`);
    if (mpCostRate > 0) lines.push(`MP消費 -${formatPercent(mpCostRate)}`);
    if (executeThreshold > 0 && executeRate > 0) {
        lines.push(`瀕死追撃 ${formatPercent(executeThreshold)} / 与ダメ ${formatPercent(executeRate)}`);
    }
    return lines.slice(0, 6);
}

function getMajorArcanaAwakeningConfig(itemId) {
    const key = String(itemId || '').trim();
    return MAJOR_ARCANA_AWAKENINGS[key] || DEFAULT_AWAKENING_CONFIG;
}

function getMajorArcanaAwakeningState(majorItem, awakenings) {
    if (!majorItem) return null;
    const itemData = majorItem?.customData || majorItem || {};
    const itemId = String(majorItem?.itemId || itemData?.ItemId || itemData?.FriendlyId || '').trim();
    if (!itemId) return null;
    const level = normalizeMajorAwakeningLevel(awakenings?.[itemId]);
    const config = getMajorArcanaAwakeningConfig(itemId);
    const stats = scaleStatBonuses(config, level);
    const battle = buildBattleBonuses(config, level);
    return {
        itemId,
        name: getMajorArcanaTitle(majorItem),
        level,
        maxLevel: MAX_MAJOR_AWAKEN_LEVEL,
        summary: String(config.summary || DEFAULT_AWAKENING_CONFIG.summary),
        stats,
        battle,
        detailLines: buildDetailLines(stats, battle)
    };
}

module.exports = {
    MAX_MAJOR_AWAKEN_LEVEL,
    getMajorArcanaAwakeningConfig,
    getMajorArcanaAwakeningState,
    normalizeMajorAwakeningLevel
};
