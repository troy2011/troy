(function initTarotKingdomWeaponRules(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root && typeof root === 'object') root.TarotKingdomWeaponRules = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createTarotKingdomWeaponRules() {
    'use strict';

    const BASE_VERSION = 1;
    const VERSION = 2;
    const WEAKNESS_MULTIPLIER = 1.25;
    const BACK_ROW_PHYSICAL_MULTIPLIER = 0.75;
    const JOB_PROFICIENCY_MULTIPLIER = 1.1;

    const PROFILES = Object.freeze({
        sword: Object.freeze({ family: 'blade', label: '剣', traitLabel: '安定斬撃', formation: 'front', statWeights: Object.freeze({ power: 1 }), damageRate: 1, accuracyPoints: 5, criticalPoints: 0, varianceMin: 1, varianceMax: 1, defenseIgnoreRate: 0, damageKind: 'physical' }),
        sword_big: Object.freeze({ family: 'blade', label: '大剣', traitLabel: '重剣', formation: 'front', statWeights: Object.freeze({ power: 1 }), damageRate: 1.18, accuracyPoints: -5, criticalPoints: 0, varianceMin: 1, varianceMax: 1, defenseIgnoreRate: 0, damageKind: 'physical' }),
        dagger: Object.freeze({ family: 'dagger', label: '短剣', traitLabel: '迅速な急襲', formation: 'front', statWeights: Object.freeze({ power: 0.65, speed: 0.35 }), damageRate: 0.88, accuracyPoints: 8, criticalPoints: 12, varianceMin: 1, varianceMax: 1, defenseIgnoreRate: 0, damageKind: 'physical', poisonChance: 0.12 }),
        axe: Object.freeze({ family: 'heavy', label: '斧', traitLabel: '荒々しい一撃', formation: 'front', statWeights: Object.freeze({ power: 1 }), damageRate: 1.1, accuracyPoints: -4, criticalPoints: 0, varianceMin: 0.85, varianceMax: 1.15, defenseIgnoreRate: 0.1, damageKind: 'physical' }),
        axe_big: Object.freeze({ family: 'heavy', label: '大斧', traitLabel: '破砕の大撃', formation: 'front', statWeights: Object.freeze({ power: 1 }), damageRate: 1.18, accuracyPoints: -8, criticalPoints: 0, varianceMin: 0.8, varianceMax: 1.2, defenseIgnoreRate: 0.15, damageKind: 'physical' }),
        blunt: Object.freeze({ family: 'heavy', label: 'ハンマー・鈍器', traitLabel: '装甲崩し', formation: 'front', statWeights: Object.freeze({ power: 1 }), damageRate: 1.05, accuracyPoints: -2, criticalPoints: 0, varianceMin: 0.9, varianceMax: 1.1, defenseIgnoreRate: 0.2, damageKind: 'physical' }),
        polearm: Object.freeze({ family: 'polearm', label: '槍', traitLabel: '長柄の猛突', formation: 'front', statWeights: Object.freeze({ power: 1 }), damageRate: 1.08, accuracyPoints: 2, criticalPoints: 0, varianceMin: 1, varianceMax: 1, defenseIgnoreRate: 0, damageKind: 'physical' }),
        gun: Object.freeze({ family: 'ranged', label: '銃', traitLabel: '貫通射撃', formation: 'back', statWeights: Object.freeze({ power: 0.45, equipmentPower: 0.55 }), damageRate: 0.92, accuracyPoints: 5, criticalPoints: 0, varianceMin: 1, varianceMax: 1, defenseIgnoreRate: 0.3, damageKind: 'physical', noAdvance: true }),
        gun_big: Object.freeze({ family: 'ranged', label: '大銃', traitLabel: '重火器', formation: 'back', statWeights: Object.freeze({ power: 0.4, equipmentPower: 0.6 }), damageRate: 1.05, accuracyPoints: -3, criticalPoints: 0, varianceMin: 1, varianceMax: 1, defenseIgnoreRate: 0.35, damageKind: 'physical', noAdvance: true }),
        bow: Object.freeze({ family: 'ranged', label: '弓', traitLabel: '遠隔射撃', formation: 'back', statWeights: Object.freeze({ power: 0.7, speed: 0.3 }), damageRate: 0.95, accuracyPoints: 5, criticalPoints: 0, varianceMin: 1, varianceMax: 1, defenseIgnoreRate: 0, damageKind: 'physical', noAdvance: true, legacyOnly: true }),
        staff: Object.freeze({ family: 'arcane', label: '杖', traitLabel: '魔導打撃', formation: 'front', statWeights: Object.freeze({ power: 0.2, intelligence: 0.8 }), damageRate: 0.82, accuracyPoints: 0, criticalPoints: 0, varianceMin: 1, varianceMax: 1, defenseIgnoreRate: 0, damageKind: 'magic' }),
        wand: Object.freeze({ family: 'arcane', label: 'ワンド', traitLabel: '魔導打撃', formation: 'front', statWeights: Object.freeze({ power: 0.2, intelligence: 0.8 }), damageRate: 0.82, accuracyPoints: 0, criticalPoints: 0, varianceMin: 1, varianceMax: 1, defenseIgnoreRate: 0, damageKind: 'magic' }),
        unarmed: Object.freeze({ family: 'martial', label: '素手', traitLabel: '練気連撃', formation: 'front', statWeights: Object.freeze({ power: 1 }), damageRate: 0.9, accuracyPoints: 3, criticalPoints: 0, varianceMin: 1, varianceMax: 1, defenseIgnoreRate: 0, damageKind: 'physical', visualHitCount: 2 })
    });

    const TAG_WEAK_FAMILIES = Object.freeze({
        soft: Object.freeze(['blade']),
        vital: Object.freeze(['dagger']),
        armored: Object.freeze(['heavy', 'ranged']),
        flying: Object.freeze(['polearm', 'ranged']),
        arcane: Object.freeze(['arcane']),
        plant: Object.freeze(['blade', 'heavy']),
        large: Object.freeze(['polearm']),
        unsteady: Object.freeze(['martial']),
        brittle: Object.freeze(['heavy'])
    });

    const TAG_LABELS = Object.freeze({
        soft: '軟体', vital: '急所', armored: '装甲', flying: '飛行', arcane: '魔性',
        plant: '植物', large: '大型', unsteady: '体勢不安定', brittle: '脆弱殻'
    });

    const JOB_PROFICIENCIES = Object.freeze({
        0: Object.freeze({ jobName: 'トリックスター', weaponTypes: Object.freeze(['dagger', 'gun']) }),
        1: Object.freeze({ jobName: '呪術師', weaponTypes: Object.freeze(['staff', 'wand']) }),
        2: Object.freeze({ jobName: '白魔道士', weaponTypes: Object.freeze(['staff', 'wand']) }),
        3: Object.freeze({ jobName: '結界師', weaponTypes: Object.freeze(['staff', 'wand']) }),
        4: Object.freeze({ jobName: 'ナイト', weaponTypes: Object.freeze(['sword', 'polearm']) }),
        5: Object.freeze({ jobName: '魔導士', weaponTypes: Object.freeze(['staff', 'wand']) }),
        6: Object.freeze({ jobName: '吟遊詩人', weaponTypes: Object.freeze(['dagger', 'gun']) }),
        7: Object.freeze({ jobName: 'バーサーカー', weaponTypes: Object.freeze(['sword_big', 'axe', 'axe_big']) }),
        8: Object.freeze({ jobName: 'モンク', weaponTypes: Object.freeze(['unarmed', 'blunt']) }),
        9: Object.freeze({ jobName: 'アサシン', weaponTypes: Object.freeze(['dagger']) }),
        10: Object.freeze({ jobName: 'ギャンブラー', weaponTypes: Object.freeze(['dagger', 'gun']) }),
        11: Object.freeze({ jobName: 'パラディン', weaponTypes: Object.freeze(['sword', 'blunt']) }),
        12: Object.freeze({ jobName: '守護者', weaponTypes: Object.freeze(['sword', 'blunt']) }),
        13: Object.freeze({ jobName: '死霊術師', weaponTypes: Object.freeze(['staff', 'wand']) }),
        14: Object.freeze({
            jobName: 'ものまねし',
            weaponTypes: Object.freeze([
                'sword', 'sword_big', 'dagger', 'axe', 'axe_big', 'blunt',
                'polearm', 'gun', 'gun_big', 'staff', 'wand', 'unarmed', 'bow'
            ])
        }),
        15: Object.freeze({ jobName: '暗黒騎士', weaponTypes: Object.freeze(['sword_big', 'axe_big']) }),
        16: Object.freeze({ jobName: '魔法剣士', weaponTypes: Object.freeze(['sword', 'wand']) }),
        17: Object.freeze({ jobName: 'ドルイド', weaponTypes: Object.freeze(['staff', 'wand']) }),
        18: Object.freeze({ jobName: '幻影騎士', weaponTypes: Object.freeze(['sword', 'polearm']) }),
        19: Object.freeze({ jobName: '魔導戦士', weaponTypes: Object.freeze(['sword', 'wand']) }),
        20: Object.freeze({ jobName: 'ビショップ', weaponTypes: Object.freeze(['staff', 'blunt']) }),
        21: Object.freeze({ jobName: '勇者', weaponTypes: Object.freeze(['sword', 'sword_big']) })
    });

    const MONSTER_TAGS = Object.freeze({
        'ismartal-vol3-monster-04': Object.freeze(['soft', 'arcane']),
        'ismartal-vol1-monster-14': Object.freeze(['soft', 'vital']),
        'ismartal-vol1-monster-01': Object.freeze(['armored']),
        'ismartal-vol1-monster-04': Object.freeze(['armored']),
        'ismartal-vol1-monster-19': Object.freeze(['soft', 'vital']),
        'ismartal-vol1-monster-17': Object.freeze(['flying', 'vital']),
        'ismartal-vol2-monster-05': Object.freeze(['unsteady', 'vital']),
        'ismartal-vol1-monster-10': Object.freeze(['plant', 'soft']),
        'ismartal-vol2-monster-06': Object.freeze(['plant', 'large']),
        'ismartal-vol1-monster-18': Object.freeze(['unsteady', 'vital']),
        'ismartal-vol1-monster-16': Object.freeze(['flying', 'vital']),
        'ismartal-vol2-monster-02': Object.freeze(['flying', 'unsteady']),
        'ismartal-vol3-monster-06': Object.freeze(['arcane', 'unsteady']),
        'ismartal-vol1-monster-06': Object.freeze(['flying', 'large']),
        'ismartal-vol2-monster-12': Object.freeze(['unsteady', 'vital']),
        'ismartal-vol1-monster-08': Object.freeze(['plant', 'unsteady']),
        'ismartal-vol2-monster-10': Object.freeze(['plant', 'large']),
        'ismartal-vol2-monster-11': Object.freeze(['flying', 'vital']),
        'ismartal-vol1-monster-03': Object.freeze(['brittle', 'arcane']),
        'ismartal-vol1-monster-13': Object.freeze(['soft', 'vital']),
        'ismartal-vol3-monster-07': Object.freeze(['arcane', 'unsteady']),
        'ismartal-vol1-monster-20': Object.freeze(['arcane']),
        'ismartal-vol2-monster-17': Object.freeze(['armored']),
        'ismartal-vol2-monster-04': Object.freeze(['armored']),
        'ismartal-vol2-monster-09': Object.freeze(['unsteady', 'vital']),
        'ismartal-vol2-monster-19': Object.freeze(['armored', 'vital']),
        'ismartal-vol1-monster-07': Object.freeze(['plant', 'soft']),
        'ismartal-vol2-monster-01': Object.freeze(['soft', 'arcane']),
        'ismartal-vol2-monster-03': Object.freeze(['flying', 'arcane']),
        'ismartal-vol3-monster-08': Object.freeze(['plant', 'armored']),
        'ismartal-vol1-monster-11': Object.freeze(['large', 'vital']),
        'ismartal-vol3-monster-05': Object.freeze(['soft', 'arcane']),
        'ismartal-vol1-monster-09': Object.freeze(['flying', 'arcane']),
        'ismartal-vol1-monster-12': Object.freeze(['flying', 'vital']),
        'ismartal-vol3-monster-09': Object.freeze(['large', 'vital']),
        'ismartal-vol3-monster-03': Object.freeze(['arcane']),
        'ismartal-vol2-monster-08': Object.freeze(['unsteady', 'vital']),
        'ismartal-vol2-monster-18': Object.freeze(['arcane']),
        'ismartal-vol3-monster-02': Object.freeze(['arcane']),
        'ismartal-vol1-monster-15': Object.freeze(['plant', 'large']),
        'ismartal-vol1-monster-02': Object.freeze(['flying', 'arcane']),
        'ismartal-vol3-monster-01': Object.freeze(['armored', 'brittle']),
        'ismartal-vol2-monster-20': Object.freeze(['soft', 'arcane']),
        'ismartal-vol3-monster-10': Object.freeze(['arcane'])
    });

    function normalizeWeaponType(value) {
        const key = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
        if (!key) return '';
        const aliases = {
            greatsword: 'sword_big', great_sword: 'sword_big', greataxe: 'axe_big', great_axe: 'axe_big',
            hammer: 'blunt', mace: 'blunt', club: 'blunt', spear: 'polearm', rifle: 'gun_big', cannon: 'gun_big',
            pistol: 'gun', rod: 'wand', fist: 'unarmed', fists: 'unarmed', shield: 'shield'
        };
        return aliases[key] || key;
    }

    function getWeaponProfile(value) {
        const weaponType = normalizeWeaponType(value);
        const profile = PROFILES[weaponType];
        return profile ? { weaponType, ...profile, statWeights: { ...profile.statWeights } } : null;
    }

    function normalizeOffensiveWeaponSlots(rawSlots) {
        const slots = (Array.isArray(rawSlots) ? rawSlots : [rawSlots])
            .map(normalizeWeaponType)
            .filter((weaponType) => weaponType && weaponType !== 'shield' && PROFILES[weaponType]);
        if (!slots.length) return ['unarmed'];
        return slots.slice(0, 2);
    }

    function resolveWeaponComponents(rawSlots) {
        const slots = normalizeOffensiveWeaponSlots(rawSlots);
        const weight = slots.length > 1 ? 0.5 : 1;
        return slots.map((weaponType, slotIndex) => ({
            ...getWeaponProfile(weaponType),
            slotIndex,
            weight
        }));
    }

    function resolveFormation(rawSlots) {
        const components = resolveWeaponComponents(rawSlots);
        return components.length > 0 && components.every((component) => component.formation === 'back')
            ? 'back'
            : 'front';
    }

    function getMonsterTags(monsterId) {
        return [...(MONSTER_TAGS[String(monsterId || '').trim()] || [])];
    }

    function getJobProficiency(guardianNumber) {
        const number = Math.floor(Number(guardianNumber));
        const definition = JOB_PROFICIENCIES[number];
        if (!definition) return null;
        return {
            number,
            jobName: definition.jobName,
            weaponTypes: [...definition.weaponTypes],
            multiplier: JOB_PROFICIENCY_MULTIPLIER
        };
    }

    function isJobProficientWithWeapon(guardianNumber, weaponType) {
        const definition = getJobProficiency(guardianNumber);
        const normalized = normalizeWeaponType(weaponType);
        return !!(definition && normalized && definition.weaponTypes.includes(normalized));
    }

    function getJobProficiencyWeaponLabels(guardianNumber) {
        const definition = getJobProficiency(guardianNumber);
        if (!definition) return [];
        return definition.weaponTypes
            .filter((weaponType) => weaponType !== 'bow')
            .map((weaponType) => PROFILES[weaponType]?.label || weaponType);
    }

    function getWeakFamiliesForTags(rawTags) {
        const families = new Set();
        (Array.isArray(rawTags) ? rawTags : []).forEach((tag) => {
            (TAG_WEAK_FAMILIES[String(tag || '').trim()] || []).forEach((family) => families.add(family));
        });
        return [...families];
    }

    function getMonsterWeakFamilies(monsterId) {
        return getWeakFamiliesForTags(getMonsterTags(monsterId));
    }

    function isWeaponFamilyWeak(family, rawTags) {
        return getWeakFamiliesForTags(rawTags).includes(String(family || '').trim());
    }

    return Object.freeze({
        BASE_VERSION,
        VERSION,
        WEAKNESS_MULTIPLIER,
        BACK_ROW_PHYSICAL_MULTIPLIER,
        JOB_PROFICIENCY_MULTIPLIER,
        PROFILES,
        TAG_WEAK_FAMILIES,
        TAG_LABELS,
        MONSTER_TAGS,
        JOB_PROFICIENCIES,
        normalizeWeaponType,
        getWeaponProfile,
        normalizeOffensiveWeaponSlots,
        resolveWeaponComponents,
        resolveFormation,
        getMonsterTags,
        getJobProficiency,
        isJobProficientWithWeapon,
        getJobProficiencyWeaponLabels,
        getWeakFamiliesForTags,
        getMonsterWeakFamilies,
        isWeaponFamilyWeak
    });
}));
