const ROLE_SUMMON_CONFIG = Object.freeze({
    Straight: Object.freeze({ min: 5, max: 15, pool: 'entry' }),
    Flush: Object.freeze({ min: 6, max: 15, pool: 'entry' }),
    FullHouse: Object.freeze({ min: 1, max: 15, pool: 'middle' }),
    FourKind: Object.freeze({ min: 1, max: 15, pool: 'advanced' }),
    TheWorld: Object.freeze({ min: 21, max: 21, pool: 'advanced', fixedIndex: 5 }),
    StraightFlush: Object.freeze({ min: 5, max: 15, pool: 'legendary' }),
    FiveKind: Object.freeze({ min: 1, max: 15, pool: 'legendary' })
});

const EFFECT_PROFILES = Object.freeze({
    rupture: Object.freeze({ key: 'rupture', name: '破城強襲', category: 'attack' }),
    inferno: Object.freeze({ key: 'inferno', name: '爆炎砲撃', category: 'attack' }),
    barrage: Object.freeze({ key: 'barrage', name: '怒涛連撃', category: 'attack' }),
    bind: Object.freeze({ key: 'bind', name: '深海拘束', category: 'debuff' }),
    eclipse: Object.freeze({ key: 'eclipse', name: '奈落暗転', category: 'debuff' }),
    chaos: Object.freeze({ key: 'chaos', name: '亡霊攪乱', category: 'debuff' }),
    tide: Object.freeze({ key: 'tide', name: '生命潮', category: 'support' }),
    aegis: Object.freeze({ key: 'aegis', name: '海神障壁', category: 'support' }),
    command: Object.freeze({ key: 'command', name: '艦隊号令', category: 'support' })
});

function summon(id, name, pool, effectKey, options = {}) {
    const motionKey = [
        'flutter',
        'float',
        'bounce',
        'dash',
        'heavy',
        'coil',
        'stalk'
    ].includes(String(options.motionKey || ''))
        ? String(options.motionKey)
        : 'dash';
    return Object.freeze({
        id,
        name,
        src: `./Sprites/monsters/${id}.png`,
        pool,
        effectKey,
        flipX: options.flipX === true,
        motionKey,
        visualScale: Math.max(0.7, Math.min(1.4, Number(options.visualScale) || 1)),
        anchorX: Math.max(0, Math.min(100, Number(options.anchorX) || 50)),
        anchorY: Math.max(0, Math.min(100, Number(options.anchorY) || 100)),
        entryLift: Math.max(-12, Math.min(24, Number(options.entryLift) || 0)),
        attackReach: Math.max(18, Math.min(48, Number(options.attackReach) || 30)),
        attackLift: Math.max(-10, Math.min(16, Number(options.attackLift) || 0)),
        attackTilt: Math.max(-10, Math.min(10, Number(options.attackTilt) || -2)),
        effectDensity: Math.max(0.85, Math.min(1.35, Number(options.effectDensity) || 1))
    });
}

export const TAROT_KINGDOM_SUMMONS = Object.freeze([
    summon('skeletal_parrot', '骸骨オウム', 'entry', 'command', { motionKey: 'flutter', visualScale: 1.02, entryLift: 15, attackReach: 34, attackLift: 9, attackTilt: -6 }),
    summon('lantern_wraith', 'ランタンの亡霊', 'entry', 'eclipse', { motionKey: 'float', visualScale: 1.04, entryLift: 11, attackReach: 25, attackLift: 7 }),
    summon('puffer_bomb', '爆弾フグ', 'entry', 'inferno', { motionKey: 'bounce', visualScale: 1.03, entryLift: 7, attackReach: 36, attackLift: -3, attackTilt: -7 }),
    summon('treasure_slime', '財宝スライム', 'entry', 'tide', { motionKey: 'bounce', visualScale: 1.06, attackReach: 22, attackLift: -2, attackTilt: 2 }),
    summon('coral_goblin', '珊瑚ゴブリン', 'entry', 'barrage', { motionKey: 'dash', visualScale: 1.06, attackReach: 42, attackLift: 2, attackTilt: -5 }),
    summon('mimic_chest', '宝箱ミミック', 'entry', 'rupture', { motionKey: 'bounce', visualScale: 1.08, attackReach: 38, attackLift: -4, attackTilt: -8 }),
    summon('zombie_raider', 'ゾンビ海賊', 'entry', 'chaos', { motionKey: 'stalk', visualScale: 1.09, attackReach: 31, attackTilt: -4 }),
    summon('drowned_buccaneer', '溺れし海賊', 'entry', 'chaos', { motionKey: 'stalk', visualScale: 1.1, entryLift: -2, attackReach: 34, attackTilt: -5 }),
    summon('crab_brute', '甲殻の暴れ者', 'entry', 'aegis', { motionKey: 'heavy', visualScale: 1.14, attackReach: 27, attackLift: -4, attackTilt: -3 }),

    summon('cursed_shipwheel', '呪いの舵輪', 'middle', 'chaos', { motionKey: 'float', visualScale: 1.08, entryLift: 13, attackReach: 30, attackLift: 5, attackTilt: -8, effectDensity: 1.08 }),
    summon('cannon_mimic', '大砲ミミック', 'middle', 'inferno', { motionKey: 'heavy', visualScale: 1.11, attackReach: 28, attackLift: -3, attackTilt: 3, effectDensity: 1.08 }),
    summon('kraken_pirate', '海賊クラーケン', 'middle', 'bind', { motionKey: 'coil', visualScale: 1.12, attackReach: 35, attackLift: 3, attackTilt: -5, effectDensity: 1.08 }),
    summon('blue_kraken', '深海クラーケン', 'middle', 'bind', { motionKey: 'coil', visualScale: 1.14, entryLift: 4, attackReach: 37, attackLift: 5, attackTilt: -6, effectDensity: 1.08 }),
    summon('shark_raider', '鮫の略奪者', 'middle', 'barrage', { motionKey: 'dash', visualScale: 1.15, attackReach: 46, attackLift: 1, attackTilt: -7, effectDensity: 1.08 }),
    summon('ghost_pirate', '幽霊海賊', 'middle', 'aegis', { motionKey: 'float', visualScale: 1.12, entryLift: 8, attackReach: 24, attackLift: 6, effectDensity: 1.08 }),
    summon('merfolk_lancer', '人魚の槍兵', 'middle', 'tide', { motionKey: 'dash', visualScale: 1.16, attackReach: 45, attackLift: 2, attackTilt: -4, effectDensity: 1.08 }),

    summon('treasure_hermit', '財宝ヤドカリ', 'advanced', 'aegis', { motionKey: 'heavy', visualScale: 1.16, attackReach: 25, attackLift: -5, attackTilt: -2, effectDensity: 1.18 }),
    summon('cannon_hermit', '砲台ヤドカリ', 'advanced', 'inferno', { motionKey: 'heavy', visualScale: 1.17, attackReach: 26, attackLift: -4, attackTilt: 4, effectDensity: 1.18 }),
    summon('manta_wraith', '亡霊マンタ', 'advanced', 'eclipse', { motionKey: 'flutter', visualScale: 1.17, entryLift: 17, attackReach: 36, attackLift: 11, attackTilt: -8, effectDensity: 1.18 }),
    summon('abyss_angler', '深淵アンコウ', 'advanced', 'eclipse', { motionKey: 'stalk', visualScale: 1.17, entryLift: 6, attackReach: 38, attackLift: 4, attackTilt: -5, effectDensity: 1.18 }),
    summon('skeleton_captain', '骸骨船長', 'advanced', 'command', { motionKey: 'dash', visualScale: 1.18, attackReach: 40, attackLift: 1, attackTilt: -4, effectDensity: 1.18 }),
    summon('anchor_golem', '錨ゴーレム', 'advanced', 'rupture', { motionKey: 'heavy', visualScale: 1.22, attackReach: 34, attackLift: -7, attackTilt: -6, effectDensity: 1.18 }),

    summon('storm_serpent', '嵐の海蛇', 'legendary', 'barrage', { motionKey: 'coil', visualScale: 1.24, entryLift: 10, attackReach: 46, attackLift: 10, attackTilt: -9, effectDensity: 1.3 }),
    summon('phantom_admiral', '亡霊提督', 'legendary', 'command', { motionKey: 'float', visualScale: 1.22, entryLift: 8, attackReach: 32, attackLift: 5, attackTilt: -3, effectDensity: 1.3 }),
    summon('chained_megalodon', '鎖縛のメガロドン', 'legendary', 'rupture', { motionKey: 'dash', visualScale: 1.28, entryLift: 5, attackReach: 48, attackLift: 5, attackTilt: -7, effectDensity: 1.3 }),
    summon('specter_whale', '亡霊クジラ', 'legendary', 'tide', { motionKey: 'float', visualScale: 1.3, entryLift: 13, attackReach: 34, attackLift: 8, attackTilt: -3, effectDensity: 1.3 }),
    summon('armored_kraken', '甲冑クラーケン', 'legendary', 'bind', { motionKey: 'coil', visualScale: 1.3, entryLift: 3, attackReach: 42, attackLift: 6, attackTilt: -8, effectDensity: 1.3 })
]);

const SUMMON_BY_ID = new Map(TAROT_KINGDOM_SUMMONS.map((entry) => [entry.id, entry]));
const SUMMON_POOLS = new Map();
TAROT_KINGDOM_SUMMONS.forEach((entry) => {
    const list = SUMMON_POOLS.get(entry.pool) || [];
    list.push(entry);
    SUMMON_POOLS.set(entry.pool, list);
});

function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, finiteNumber(value, min)));
}

export function getTarotKingdomSummonRoleNumber(role = {}) {
    const primary = Array.isArray(role?.primary) ? role.primary : [];
    if (!primary.length) return 0;
    return primary.reduce((total, value, index) => (
        total + (finiteNumber(value, 0) / (16 ** index))
    ), 0);
}

export function resolveTarotKingdomSummon(role = {}) {
    const roleKey = String(role?.key || '').trim();
    const config = ROLE_SUMMON_CONFIG[roleKey];
    if (!config) return null;
    const pool = SUMMON_POOLS.get(config.pool) || [];
    if (!pool.length) return null;
    const roleNumber = getTarotKingdomSummonRoleNumber(role);
    const fixedIndex = Number(config.fixedIndex);
    const index = Number.isInteger(fixedIndex)
        ? Math.max(0, Math.min(pool.length - 1, fixedIndex))
        : Math.max(0, Math.min(
            pool.length - 1,
            Math.floor(
                clamp(
                    (roleNumber - config.min) / ((config.max + 1) - config.min),
                    0,
                    0.999999
                ) * pool.length
            )
        ));
    const selected = pool[index];
    const effect = EFFECT_PROFILES[selected.effectKey] || null;
    return {
        version: 1,
        id: selected.id,
        name: selected.name,
        src: selected.src,
        pool: selected.pool,
        poolIndex: index,
        roleKey,
        roleNumber,
        effectKey: selected.effectKey,
        effectName: effect?.name || '',
        effectCategory: effect?.category || '',
        flipX: selected.flipX,
        motionKey: selected.motionKey,
        visualScale: selected.visualScale,
        anchorX: selected.anchorX,
        anchorY: selected.anchorY,
        entryLift: selected.entryLift,
        attackReach: selected.attackReach,
        attackLift: selected.attackLift,
        attackTilt: selected.attackTilt,
        effectDensity: selected.effectDensity
    };
}

export function getTarotKingdomSummonById(id) {
    return SUMMON_BY_ID.get(String(id || '').trim()) || null;
}

export function buildTarotKingdomSummonEffectSteps(summonState, context = {}) {
    const effectKey = String(summonState?.effectKey || '').trim();
    const roleRate = Math.max(1, Math.min(5, Math.floor(finiteNumber(context.roleRate, 1))));
    const intelligence = Math.max(0, finiteNumber(context.intelligence, 0));
    const summonScale = 1 + (Math.min(200, intelligence) / 200);
    const levelScale = Number(context.growthVersion) >= 1
        ? 1 + (Math.min(100, Math.max(0, Math.floor(finiteNumber(context.level, 1)) - 1)) / 100)
        : 1;
    const equipmentScale = Number(context.growthVersion) >= 1
        ? 1 + (Math.min(100, Math.max(0, finiteNumber(context.equipmentMagicPower, 0))) / 200)
        : 1;
    const base = Math.max(1, Math.floor(
        (16 + (roleRate * 8)) * summonScale * levelScale * equipmentScale
    ));
    const source = 'summon';
    const label = String(summonState?.effectName || EFFECT_PROFILES[effectKey]?.name || '召喚効果');
    if (effectKey === 'rupture') {
        return [
            { source, kind: 'damage', label, targetType: 'enemy', amount: base },
            {
                source,
                kind: 'status',
                label: '崩し',
                targetType: 'enemy',
                statusKey: 'break',
                potency: Math.min(40, 15 + (roleRate * 5)),
                chance: 1,
                charges: 1
            }
        ];
    }
    if (effectKey === 'inferno') {
        return [
            { source, kind: 'damage', label, targetType: 'enemy', amount: Math.max(1, Math.floor(base * 0.8)) },
            {
                source,
                kind: 'status',
                label: '火傷',
                targetType: 'enemy',
                statusKey: 'burn',
                potency: Math.max(1, Math.floor(base * 0.35)),
                chance: 1
            }
        ];
    }
    if (effectKey === 'barrage') {
        return [{
            source,
            kind: 'multi-hit',
            label,
            targetType: 'enemy',
            amount: Math.max(1, Math.floor(base * 1.2)),
            hitCount: Math.min(4, 2 + Math.floor(roleRate / 2))
        }];
    }
    if (effectKey === 'bind') {
        return [{
            source,
            kind: 'status',
            label,
            targetType: 'enemy',
            statusKey: 'paralysis',
            potency: 1,
            chance: 1,
            charges: 1
        }];
    }
    if (effectKey === 'eclipse') {
        return [{
            source,
            kind: 'status',
            label,
            targetType: 'enemy',
            statusKey: 'blind',
            potency: Math.min(40, 15 + (roleRate * 5)),
            chance: 1
        }];
    }
    if (effectKey === 'chaos') {
        return [{
            source,
            kind: 'status',
            label,
            targetType: 'enemy',
            statusKey: 'confusion',
            potency: 1,
            chance: 1
        }];
    }
    if (effectKey === 'tide') {
        return [{
            source,
            kind: 'heal-party-percent',
            label,
            targetType: 'party',
            percent: Math.min(14, 4 + (roleRate * 2))
        }];
    }
    if (effectKey === 'aegis') {
        return [{
            source,
            kind: 'guard',
            label,
            targetType: 'party',
            statusKey: 'summonGuard',
            potency: Math.min(45, 20 + (roleRate * 5)),
            charges: 1
        }];
    }
    if (effectKey === 'command') {
        return [{
            source,
            kind: 'buff',
            label,
            targetType: 'party',
            statusKey: 'nextAttackUp',
            potency: Math.min(40, 15 + (roleRate * 5)),
            charges: 1
        }];
    }
    return [];
}

export function auditTarotKingdomSummonRegistry() {
    const ids = TAROT_KINGDOM_SUMMONS.map((entry) => entry.id);
    return {
        count: ids.length,
        uniqueCount: new Set(ids).size,
        pools: Object.fromEntries(Array.from(SUMMON_POOLS.entries()).map(([key, value]) => [key, value.length])),
        effectCounts: TAROT_KINGDOM_SUMMONS.reduce((out, entry) => {
            const category = EFFECT_PROFILES[entry.effectKey]?.category || 'unknown';
            out[category] = (out[category] || 0) + 1;
            return out;
        }, {})
    };
}
