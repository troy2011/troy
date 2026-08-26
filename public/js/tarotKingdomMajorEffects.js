export const TAROT_KINGDOM_ELEMENTS = Object.freeze([
    'fire', 'water', 'wind', 'earth', 'light', 'dark', 'neutral'
]);

export const TAROT_KINGDOM_ELEMENT_LABELS = Object.freeze({
    fire: '火',
    water: '水',
    wind: '風',
    earth: '地',
    light: '光',
    dark: '闇',
    neutral: '無'
});

export const TAROT_KINGDOM_MAJOR_SKILLS = Object.freeze({
    0: Object.freeze({ name: 'カオスディレクション', tone: 'chaos' }),
    1: Object.freeze({ name: 'エレメンタルコンボ', tone: 'elemental' }),
    2: Object.freeze({ name: 'ディバインサンクチュアリ', tone: 'holy' }),
    3: Object.freeze({ name: 'ガイアの恵み', tone: 'nature' }),
    4: Object.freeze({ name: '絶対王政', tone: 'authority' }),
    5: Object.freeze({ name: 'ドグマティックバリア', tone: 'barrier' }),
    6: Object.freeze({ name: 'シンクロリンク', tone: 'link' }),
    7: Object.freeze({ name: '突撃陣形', tone: 'charge' }),
    8: Object.freeze({ name: 'インミュータブル・ウィル', tone: 'will' }),
    9: Object.freeze({ name: 'アナライズ・サイレンス', tone: 'silence' }),
    10: Object.freeze({ name: 'クリティカルシフト', tone: 'fortune' }),
    11: Object.freeze({ name: 'カルマリターン', tone: 'justice' }),
    12: Object.freeze({ name: 'ペナンス・コンバート', tone: 'penance' }),
    13: Object.freeze({ name: 'サクリファイス・リバース', tone: 'death' }),
    14: Object.freeze({ name: 'トランスミュート', tone: 'temperance' }),
    15: Object.freeze({ name: 'ブラッドペクト', tone: 'devil' }),
    16: Object.freeze({ name: 'カタストロフィ', tone: 'tower' }),
    17: Object.freeze({ name: 'ウィッシング・ドロップ', tone: 'star' }),
    18: Object.freeze({ name: 'ミラージュ・幻影陣', tone: 'moon' }),
    19: Object.freeze({ name: 'ソーラーフレア', tone: 'sun' }),
    20: Object.freeze({ name: 'ラスト・レクイエム', tone: 'judgment' }),
    21: Object.freeze({ name: 'タイム・ストップ / ザ・ワールド', tone: 'world' })
});

const LEGACY_MONSTER_IDS_BY_NATIVE_ELEMENT = Object.freeze({
    fire: Object.freeze([
        'ismartal-vol1-monster-09', 'ismartal-vol2-monster-11', 'ismartal-vol3-monster-07',
        'ismartal-vol1-monster-11', 'ismartal-vol1-monster-15', 'ismartal-vol1-monster-06',
        'ismartal-vol2-monster-18', 'ismartal-vol2-monster-19', 'ismartal-vol3-monster-02',
        'ismartal-vol3-monster-06', 'ismartal-vol3-monster-10'
    ]),
    water: Object.freeze([
        'ismartal-vol3-monster-04', 'ismartal-vol1-monster-04', 'ismartal-vol1-monster-14',
        'ismartal-vol1-monster-20', 'ismartal-vol1-monster-12', 'ismartal-vol1-monster-13',
        'ismartal-vol2-monster-08', 'ismartal-vol2-monster-01', 'ismartal-vol1-monster-02',
        'ismartal-vol2-monster-12', 'ismartal-vol2-monster-20', 'ismartal-vol2-monster-15'
    ]),
    wind: Object.freeze([
        'ismartal-vol2-monster-02', 'ismartal-vol3-monster-05', 'ismartal-vol1-monster-10',
        'ismartal-vol2-monster-06', 'ismartal-vol2-monster-05', 'ismartal-vol1-monster-17',
        'ismartal-vol2-monster-03', 'ismartal-vol1-monster-18', 'ismartal-vol1-monster-19',
        'ismartal-vol1-monster-16', 'ismartal-vol3-monster-03', 'ismartal-vol1-monster-05'
    ]),
    earth: Object.freeze([
        'ismartal-vol1-monster-07', 'ismartal-vol1-monster-01', 'ismartal-vol1-monster-03',
        'ismartal-vol2-monster-04', 'ismartal-vol1-monster-08', 'ismartal-vol2-monster-09',
        'ismartal-vol2-monster-10', 'ismartal-vol2-monster-17', 'ismartal-vol3-monster-08',
        'ismartal-vol3-monster-09', 'ismartal-vol3-monster-01', 'ismartal-vol2-monster-13',
        'ismartal-vol2-monster-14', 'ismartal-vol2-monster-07', 'ismartal-vol2-monster-16'
    ])
});

const MONSTER_IDS_BY_NATIVE_ELEMENT = Object.freeze({
    fire: Object.freeze([
        'ismartal-vol1-monster-09', 'ismartal-vol2-monster-11', 'ismartal-vol1-monster-11',
        'ismartal-vol1-monster-15', 'ismartal-vol2-monster-18', 'ismartal-vol2-monster-19',
        'ismartal-vol3-monster-02', 'ismartal-vol3-monster-06'
    ]),
    water: Object.freeze([
        'ismartal-vol3-monster-04', 'ismartal-vol1-monster-04', 'ismartal-vol1-monster-14',
        'ismartal-vol1-monster-20', 'ismartal-vol1-monster-13', 'ismartal-vol2-monster-08',
        'ismartal-vol2-monster-01', 'ismartal-vol2-monster-12'
    ]),
    wind: Object.freeze([
        'ismartal-vol2-monster-02', 'ismartal-vol3-monster-05', 'ismartal-vol1-monster-10',
        'ismartal-vol2-monster-06', 'ismartal-vol1-monster-17', 'ismartal-vol2-monster-03',
        'ismartal-vol1-monster-18', 'ismartal-vol1-monster-19', 'ismartal-vol3-monster-03'
    ]),
    earth: Object.freeze([
        'ismartal-vol1-monster-07', 'ismartal-vol1-monster-01', 'ismartal-vol2-monster-04',
        'ismartal-vol1-monster-08', 'ismartal-vol2-monster-09', 'ismartal-vol2-monster-10',
        'ismartal-vol3-monster-08', 'ismartal-vol3-monster-01', 'ismartal-vol2-monster-13',
        'ismartal-vol2-monster-14', 'ismartal-vol2-monster-07'
    ]),
    light: Object.freeze([
        'ismartal-vol1-monster-12', 'ismartal-vol2-monster-05',
        'ismartal-vol1-monster-16', 'ismartal-vol2-monster-16'
    ]),
    dark: Object.freeze([
        'ismartal-vol1-monster-02', 'ismartal-vol1-monster-03', 'ismartal-vol1-monster-06',
        'ismartal-vol2-monster-15', 'ismartal-vol2-monster-20', 'ismartal-vol3-monster-07',
        'ismartal-vol3-monster-09', 'ismartal-vol3-monster-10'
    ]),
    neutral: Object.freeze([
        'ismartal-vol1-monster-05', 'ismartal-vol2-monster-17'
    ])
});

const CYCLIC_WEAKNESS_BY_NATIVE_ELEMENT = Object.freeze({
    fire: 'water',
    water: 'earth',
    earth: 'wind',
    wind: 'fire',
    light: 'dark',
    dark: 'light',
    neutral: ''
});

const WEAKNESS_BY_NATIVE_ELEMENT = Object.freeze({
    fire: 'water',
    water: 'fire',
    wind: 'earth',
    earth: 'wind',
    light: 'dark',
    dark: 'light',
    neutral: ''
});

const FOUR_ELEMENT_KEYS = new Set(['fire', 'wind', 'earth', 'water']);
const CYCLIC_RESISTANCE_BY_NATIVE_ELEMENT = Object.freeze({
    fire: 'wind',
    wind: 'earth',
    earth: 'water',
    water: 'fire'
});

const RESISTANCE_BY_NATIVE_ELEMENT = Object.freeze({
    fire: 'fire',
    water: 'water',
    wind: 'wind',
    earth: 'earth'
});

function createAffinityRegistry(
    groups,
    weaknessByNative = WEAKNESS_BY_NATIVE_ELEMENT,
    resistanceByNative = RESISTANCE_BY_NATIVE_ELEMENT
) {
    return Object.freeze(Object.fromEntries(
        Object.entries(groups).flatMap(([native, monsterIds]) => (
            monsterIds.map((monsterId) => [
                monsterId,
                Object.freeze({
                    native,
                    weak: weaknessByNative[native] || '',
                    resist: native === 'neutral'
                        ? ''
                        : (resistanceByNative[native] || native)
                })
            ])
        ))
    ));
}

const LEGACY_AFFINITY_BY_MONSTER_ID = createAffinityRegistry(
    LEGACY_MONSTER_IDS_BY_NATIVE_ELEMENT,
    CYCLIC_WEAKNESS_BY_NATIVE_ELEMENT,
    CYCLIC_RESISTANCE_BY_NATIVE_ELEMENT
);
const CYCLIC_AFFINITY_BY_MONSTER_ID = createAffinityRegistry(
    MONSTER_IDS_BY_NATIVE_ELEMENT,
    CYCLIC_WEAKNESS_BY_NATIVE_ELEMENT,
    CYCLIC_RESISTANCE_BY_NATIVE_ELEMENT
);
const AFFINITY_BY_MONSTER_ID = createAffinityRegistry(MONSTER_IDS_BY_NATIVE_ELEMENT);

export function getTarotKingdomMajorSkill(number) {
    const skill = TAROT_KINGDOM_MAJOR_SKILLS[Math.max(0, Math.min(21, Math.floor(Number(number) || 0)))];
    return skill ? { ...skill } : null;
}

export function getTarotKingdomEnemyAffinity(monsterId = '', version = 3) {
    const registry = Number(version) >= 3
        ? AFFINITY_BY_MONSTER_ID
        : (Number(version) >= 2 ? CYCLIC_AFFINITY_BY_MONSTER_ID : LEGACY_AFFINITY_BY_MONSTER_ID);
    const affinity = registry[String(monsterId || '').trim()];
    return affinity ? { ...affinity } : { native: '', weak: '', resist: '' };
}

export function getTarotKingdomElementMultiplier(monsterOrAffinity, element, version = 2) {
    const affinity = monsterOrAffinity && typeof monsterOrAffinity === 'object'
        ? {
            native: String(monsterOrAffinity.native || ''),
            weak: String(monsterOrAffinity.weak || ''),
            resist: String(monsterOrAffinity.resist || '')
        }
        : getTarotKingdomEnemyAffinity(monsterOrAffinity, version);
    const normalizedElement = String(element || '').trim().toLowerCase();
    if (normalizedElement && normalizedElement === affinity.weak) {
        return { multiplier: FOUR_ELEMENT_KEYS.has(affinity.native) ? 1.5 : 1.3, reaction: 'weak', ...affinity };
    }
    if (normalizedElement && normalizedElement === affinity.resist) {
        return { multiplier: FOUR_ELEMENT_KEYS.has(affinity.native) ? 0.6 : 0.8, reaction: 'resist', ...affinity };
    }
    if (
        FOUR_ELEMENT_KEYS.has(affinity.native)
        && FOUR_ELEMENT_KEYS.has(normalizedElement)
        && normalizedElement !== affinity.native
    ) {
        return { multiplier: 0.85, reaction: 'clash', ...affinity };
    }
    return { multiplier: 1, reaction: '', ...affinity };
}

export function auditTarotKingdomMajorEffects(monsterIds = []) {
    const skills = Array.from({ length: 22 }, (_, number) => getTarotKingdomMajorSkill(number));
    const requestedIds = Array.isArray(monsterIds) ? monsterIds.map(String) : [];
    return {
        skillCount: skills.filter(Boolean).length,
        skillNames: skills.map((skill) => skill?.name || ''),
        affinityCount: Object.keys(AFFINITY_BY_MONSTER_ID).length,
        elements: [...TAROT_KINGDOM_ELEMENTS],
        affinities: Object.fromEntries(Object.entries(AFFINITY_BY_MONSTER_ID).map(([monsterId, affinity]) => (
            [monsterId, { ...affinity }]
        ))),
        missingMonsterIds: requestedIds.filter((monsterId) => !AFFINITY_BY_MONSTER_ID[monsterId]),
        invalidAffinities: Object.entries(AFFINITY_BY_MONSTER_ID)
            .filter(([, affinity]) => (
                !TAROT_KINGDOM_ELEMENTS.includes(affinity.native)
                || (affinity.native === 'neutral'
                    ? affinity.weak !== '' || affinity.resist !== ''
                    : !TAROT_KINGDOM_ELEMENTS.includes(affinity.weak)
                        || !TAROT_KINGDOM_ELEMENTS.includes(affinity.resist)
                        || affinity.weak === affinity.resist)
            ))
            .map(([monsterId]) => monsterId)
    };
}
