const PIXEL_MONSTERS_ROSTER = require('../public/Sprites/pixel-monsters/manifest.json');

const TAROT_KINGDOM_EXPLORATION_PROGRESS_KEY = 'TarotKingdomExplorationProgress';
const TAROT_KINGDOM_EXPLORATION_PROGRESS_VERSION = 3;
const TAROT_KINGDOM_STAGE_ENCOUNTER_VERSION = 3;
const TAROT_KINGDOM_STAGE_BEST_CHIPS_MAX = 999999;
const TAROT_KINGDOM_TOTAL_BEST_CHIPS_STAT = 'troy_tarot_kingdom_chip_total';

const MONSTER_BY_ID = new Map(
    PIXEL_MONSTERS_ROSTER.map((monster) => [String(monster?.id || '').trim(), monster])
);

const STAGE_ROWS = [
    {
        name: '珊瑚の浅瀬',
        battlefieldId: 'stage-01-coral-shallows',
        destinationImagePath: './Sprites/exploration_destinations/coral_lagoon.png',
        atmosphereTone: 'sunlit-coral',
        monsters: [
            ['ismartal-vol3-monster-04', 'balanced'],
            ['ismartal-vol1-monster-14', 'balanced'],
            ['ismartal-vol1-monster-01', 'guardian'],
            ['ismartal-vol1-monster-04', 'guardian']
        ]
    },
    {
        name: '双塔岩の海峡',
        battlefieldId: 'stage-02-windswept-deck',
        destinationImagePath: './Sprites/exploration_destinations/twin_sea_stacks.png',
        atmosphereTone: 'open-sea',
        monsters: [
            ['ismartal-vol1-monster-19', 'balanced'],
            ['ismartal-vol3-monster-05', 'caster'],
            ['ismartal-vol1-monster-18', 'swift'],
            ['ismartal-vol2-monster-01', 'guardian']
        ]
    },
    {
        name: '群礁の島道',
        battlefieldId: 'stage-03-island-causeway',
        destinationImagePath: './Sprites/exploration_destinations/reef_islets.png',
        atmosphereTone: 'tropical-wilds',
        monsters: [
            ['ismartal-vol2-monster-02', 'swift'],
            ['ismartal-vol2-monster-05', 'caster'],
            ['ismartal-vol1-monster-10', 'caster'],
            ['ismartal-vol2-monster-06', 'guardian']
        ]
    },
    {
        name: '月影の望楼島',
        battlefieldId: 'stage-04-moon-shadow-castle',
        destinationImagePath: './Sprites/exploration_destinations/watchtower_island.png',
        atmosphereTone: 'moonlit-watchtower',
        monsters: [
            ['ismartal-vol1-monster-17', 'swift'],
            ['ismartal-vol1-monster-12', 'swift'],
            ['ismartal-vol1-monster-16', 'swift'],
            ['ismartal-vol1-monster-06', 'brute']
        ]
    },
    {
        name: '翠石の隠れ入り江',
        battlefieldId: 'stage-05-emerald-jungle',
        destinationImagePath: './Sprites/exploration_destinations/hidden_lagoon.png',
        atmosphereTone: 'hidden-lagoon',
        monsters: [
            ['ismartal-vol2-monster-12', 'swift'],
            ['ismartal-vol1-monster-08', 'balanced'],
            ['ismartal-vol2-monster-10', 'guardian'],
            ['ismartal-vol2-monster-11', 'brute']
        ]
    },
    {
        name: '幽霊沼の夜',
        battlefieldId: 'stage-06-haunted-marsh',
        destinationImagePath: './Sprites/exploration_destinations/haunted_marsh.png',
        atmosphereTone: 'poison-mist',
        monsters: [
            ['ismartal-vol1-monster-03', 'caster'],
            ['ismartal-vol1-monster-13', 'swift'],
            ['ismartal-vol3-monster-07', 'brute'],
            ['ismartal-vol1-monster-20', 'caster']
        ]
    },
    {
        name: '海上砦突破戦',
        battlefieldId: 'stage-07-sea-fortress',
        destinationImagePath: './Sprites/exploration_destinations/sea_fortress.png',
        atmosphereTone: 'siege',
        monsters: [
            ['ismartal-vol2-monster-17', 'guardian'],
            ['ismartal-vol2-monster-04', 'brute'],
            ['ismartal-vol2-monster-09', 'guardian'],
            ['ismartal-vol2-monster-19', 'guardian']
        ]
    },
    {
        name: '蒼光の洞窟',
        battlefieldId: 'stage-08-azure-grotto',
        destinationImagePath: './Sprites/exploration_destinations/glowing_grotto.png',
        atmosphereTone: 'arcane-blue',
        monsters: [
            ['ismartal-vol1-monster-07', 'balanced'],
            ['ismartal-vol3-monster-06', 'caster'],
            ['ismartal-vol3-monster-08', 'guardian'],
            ['ismartal-vol1-monster-11', 'brute']
        ]
    },
    {
        name: '雷雨の廃港',
        battlefieldId: 'stage-09-steel-fleet',
        destinationImagePath: './Sprites/exploration_destinations/ruined_harbor.png',
        atmosphereTone: 'storm-ruined-harbor',
        monsters: [
            ['ismartal-vol1-monster-09', 'caster'],
            ['ismartal-vol2-monster-03', 'caster'],
            ['ismartal-vol3-monster-09', 'guardian'],
            ['ismartal-vol3-monster-03', 'caster']
        ]
    },
    {
        name: '獄炎の火山島',
        battlefieldId: 'stage-10-infernal-marsh',
        destinationImagePath: './Sprites/exploration_destinations/volcanic_island.png',
        atmosphereTone: 'volcanic-island',
        monsters: [
            ['ismartal-vol2-monster-08', 'swift'],
            ['ismartal-vol2-monster-18', 'caster'],
            ['ismartal-vol3-monster-02', 'caster'],
            ['ismartal-vol1-monster-15', 'brute']
        ]
    },
    {
        name: '終月の古代海門',
        battlefieldId: 'stage-11-eclipse-castle',
        destinationImagePath: './Sprites/exploration_destinations/ancient_sea_gate.png',
        atmosphereTone: 'eclipse-sea-gate',
        monsters: [
            ['ismartal-vol1-monster-02', 'caster'],
            ['ismartal-vol3-monster-01', 'guardian'],
            ['ismartal-vol2-monster-20', 'caster'],
            ['ismartal-vol3-monster-10', 'caster']
        ]
    }
];

function clampInteger(value, min, max, fallback = min) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}

const TAROT_KINGDOM_EXPLORATION_STAGES = Object.freeze(STAGE_ROWS.map((row, stageIndex) => {
    const stageNo = stageIndex + 1;
    return Object.freeze({
        version: 3,
        stageNo,
        id: `tarot_stage_${stageNo}`,
        name: row.name,
        battlefieldId: row.battlefieldId,
        atmosphereTone: row.atmosphereTone,
        imagePath: row.destinationImagePath,
        destinationImagePath: row.destinationImagePath,
        monsters: Object.freeze(row.monsters.map(([monsterId, archetype], roundIndex) => {
            const monster = MONSTER_BY_ID.get(monsterId);
            if (!monster || monster.isBoss === true) {
                throw new Error(`Invalid Tarot Kingdom stage monster: ${monsterId}`);
            }
            return Object.freeze({
                order: roundIndex + 1,
                monsterId,
                monsterName: String(monster.name || monsterId),
                archetype,
                threatLevel: stageIndex * 4 + roundIndex + 1,
                isBoss: false
            });
        }))
    });
}));

function getTarotKingdomExplorationStage(stageNo) {
    const safeStageNo = clampInteger(stageNo, 1, TAROT_KINGDOM_EXPLORATION_STAGES.length, 0);
    return TAROT_KINGDOM_EXPLORATION_STAGES[safeStageNo - 1] || null;
}

function getTarotKingdomShipStageCap(shipStage) {
    const stage = clampInteger(shipStage, 1, 3, 1);
    if (stage >= 3) return 11;
    if (stage === 2) return 8;
    return 4;
}

function normalizeTarotKingdomExplorationProgress(value) {
    let parsed = value;
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            parsed = null;
        }
    }
    const rawStages = parsed?.stages && typeof parsed.stages === 'object' ? parsed.stages : {};
    const stages = {};
    Object.entries(rawStages).forEach(([key, raw]) => {
        const stageNo = clampInteger(key, 1, 11, 0);
        if (!stageNo || !raw || typeof raw !== 'object') return;
        stages[String(stageNo)] = {
            bestRank: clampInteger(raw.bestRank, 1, 4, 4),
            bestChips: clampInteger(raw.bestChips, 0, TAROT_KINGDOM_STAGE_BEST_CHIPS_MAX, 0),
            clearCount: Math.max(0, Math.floor(Number(raw.clearCount) || 0)),
            firstClearedAtMs: Math.max(0, Math.floor(Number(raw.firstClearedAtMs) || 0)),
            lastClearedAtMs: Math.max(0, Math.floor(Number(raw.lastClearedAtMs) || 0)),
            lastExplorationId: String(raw.lastExplorationId || '').trim().slice(0, 128)
        };
    });
    const highestFromStages = Math.max(1, ...Object.keys(stages).map((key) => Number(key) || 1));
    const validMonsterIds = new Set(
        TAROT_KINGDOM_EXPLORATION_STAGES.flatMap((stage) => (
            stage.monsters.map((monster) => monster.monsterId)
        ))
    );
    const defeatedMonsterIds = Array.from(new Set(
        (Array.isArray(parsed?.defeatedMonsterIds) ? parsed.defeatedMonsterIds : [])
            .map((monsterId) => String(monsterId || '').trim())
            .filter((monsterId) => validMonsterIds.has(monsterId))
    ));
    const totalBestChips = Object.values(stages).reduce((sum, stage) => (
        sum + clampInteger(stage?.bestChips, 0, TAROT_KINGDOM_STAGE_BEST_CHIPS_MAX, 0)
    ), 0);
    return {
        version: TAROT_KINGDOM_EXPLORATION_PROGRESS_VERSION,
        highestUnlockedStage: clampInteger(
            Math.max(Number(parsed?.highestUnlockedStage) || 1, highestFromStages),
            1,
            11,
            1
        ),
        stages,
        defeatedMonsterIds,
        totalBestChips
    };
}

async function readTarotKingdomExplorationProgress(playFabId, { promisifyPlayFab, PlayFabServer } = {}) {
    if (!playFabId || typeof promisifyPlayFab !== 'function' || !PlayFabServer?.GetUserReadOnlyData) {
        return normalizeTarotKingdomExplorationProgress(null);
    }
    const response = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [TAROT_KINGDOM_EXPLORATION_PROGRESS_KEY]
    });
    return normalizeTarotKingdomExplorationProgress(
        response?.Data?.[TAROT_KINGDOM_EXPLORATION_PROGRESS_KEY]?.Value
    );
}

async function writeTarotKingdomExplorationProgress(
    playFabId,
    progress,
    { promisifyPlayFab, PlayFabServer } = {}
) {
    if (!playFabId || typeof promisifyPlayFab !== 'function' || !PlayFabServer?.UpdateUserReadOnlyData) {
        throw new Error('Tarot Kingdom exploration progress storage is unavailable.');
    }
    const normalized = normalizeTarotKingdomExplorationProgress(progress);
    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: {
            [TAROT_KINGDOM_EXPLORATION_PROGRESS_KEY]: JSON.stringify(normalized)
        }
    });
    return normalized;
}

function applyTarotKingdomStageClear(progress, stageNo, rank, now = Date.now(), explorationId = '') {
    const normalized = normalizeTarotKingdomExplorationProgress(progress);
    const stage = getTarotKingdomExplorationStage(stageNo);
    const safeRank = clampInteger(rank, 1, 4, 4);
    if (!stage) return normalized;
    const key = String(stage.stageNo);
    const previous = normalized.stages[key] || null;
    const safeExplorationId = String(explorationId || '').trim().slice(0, 128);
    if (safeExplorationId && previous?.lastExplorationId === safeExplorationId) return normalized;
    const completedAtMs = Math.max(1, Math.floor(Number(now) || Date.now()));
    const nextHighest = safeRank <= 2
        ? Math.min(11, Math.max(normalized.highestUnlockedStage, stage.stageNo + 1))
        : normalized.highestUnlockedStage;
    return normalizeTarotKingdomExplorationProgress({
        version: TAROT_KINGDOM_EXPLORATION_PROGRESS_VERSION,
        highestUnlockedStage: nextHighest,
        defeatedMonsterIds: normalized.defeatedMonsterIds,
        stages: {
            ...normalized.stages,
            [key]: {
                bestRank: previous ? Math.min(previous.bestRank, safeRank) : safeRank,
                bestChips: previous?.bestChips || 0,
                clearCount: Math.max(0, Number(previous?.clearCount) || 0) + 1,
                firstClearedAtMs: previous?.firstClearedAtMs || completedAtMs,
                lastClearedAtMs: completedAtMs,
                lastExplorationId: safeExplorationId
            }
        }
    });
}

function applyTarotKingdomStageBestChips(progress, stageNo, chips) {
    const normalized = normalizeTarotKingdomExplorationProgress(progress);
    const stage = getTarotKingdomExplorationStage(stageNo);
    if (!stage) return normalized;
    const key = String(stage.stageNo);
    const previous = normalized.stages[key] || null;
    const bestChips = clampInteger(chips, 0, TAROT_KINGDOM_STAGE_BEST_CHIPS_MAX, 0);
    if (bestChips <= Number(previous?.bestChips || 0)) return normalized;
    return normalizeTarotKingdomExplorationProgress({
        ...normalized,
        stages: {
            ...normalized.stages,
            [key]: {
                bestRank: previous?.bestRank || 4,
                bestChips,
                clearCount: Math.max(0, Number(previous?.clearCount) || 0),
                firstClearedAtMs: Math.max(0, Number(previous?.firstClearedAtMs) || 0),
                lastClearedAtMs: Math.max(0, Number(previous?.lastClearedAtMs) || 0),
                lastExplorationId: String(previous?.lastExplorationId || '')
            }
        }
    });
}

function getTarotKingdomTotalBestChips(progress) {
    return normalizeTarotKingdomExplorationProgress(progress).totalBestChips;
}

function applyTarotKingdomMonsterDefeats(progress, stageNo, finishers = [], playFabId = '') {
    const normalized = normalizeTarotKingdomExplorationProgress(progress);
    const stage = getTarotKingdomExplorationStage(stageNo);
    const ownerId = String(playFabId || '').trim();
    if (!stage || !ownerId) return normalized;
    const monsterByRound = new Map(
        stage.monsters.map((monster) => [monster.order, monster.monsterId])
    );
    const defeated = new Set(normalized.defeatedMonsterIds);
    (Array.isArray(finishers) ? finishers : []).forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        if (entry.isNpc === true || entry.isPet === true) return;
        if (String(entry.playFabId || '').trim() !== ownerId) return;
        const roundNo = Math.floor(Number(entry.roundNo));
        if (!Number.isInteger(roundNo) || roundNo < 1 || roundNo > 4) return;
        const expectedMonsterId = monsterByRound.get(roundNo);
        const monsterId = String(entry.monsterId || '').trim();
        if (!expectedMonsterId || monsterId !== expectedMonsterId) return;
        defeated.add(monsterId);
    });
    return {
        ...normalized,
        version: TAROT_KINGDOM_EXPLORATION_PROGRESS_VERSION,
        defeatedMonsterIds: Array.from(defeated)
    };
}

function buildTarotKingdomStageList(progress, shipStage) {
    const normalized = normalizeTarotKingdomExplorationProgress(progress);
    const shipStageCap = getTarotKingdomShipStageCap(shipStage);
    const defeatedMonsterIds = new Set(normalized.defeatedMonsterIds);
    return TAROT_KINGDOM_EXPLORATION_STAGES.map((stage) => {
        const record = normalized.stages[String(stage.stageNo)] || null;
        const stageCleared = Number(record?.clearCount) > 0;
        const progressionUnlocked = stage.stageNo <= normalized.highestUnlockedStage;
        const shipUnlocked = stage.stageNo <= shipStageCap;
        return {
            ...stage,
            monsters: stage.monsters.map((monster) => {
                const defeatedByPlayer = defeatedMonsterIds.has(monster.monsterId);
                return {
                    ...monster,
                    defeatedByPlayer,
                    revealed: stageCleared || defeatedByPlayer
                };
            }),
            bestRank: record?.bestRank || null,
            bestChips: record?.bestChips || 0,
            clearCount: record?.clearCount || 0,
            progressionUnlocked,
            shipUnlocked,
            unlocked: progressionUnlocked && shipUnlocked,
            lockReason: !progressionUnlocked
                ? '前のステージで2位以内に入ると解放'
                : (!shipUnlocked ? '船を進化させると解放' : '')
        };
    });
}

function buildTarotKingdomStageEncounter({
    explorationId = '',
    stageNo = 1,
    supplyQueue = [],
    selectedAtMs = Date.now()
} = {}) {
    const stage = getTarotKingdomExplorationStage(stageNo);
    if (!stage) return null;
    return {
        version: TAROT_KINGDOM_STAGE_ENCOUNTER_VERSION,
        explorationId: String(explorationId || '').trim().slice(0, 128),
        stageNo: stage.stageNo,
        stageId: stage.id,
        destinationId: stage.id,
        destinationName: stage.name,
        battlefieldId: stage.battlefieldId,
        atmosphereTone: stage.atmosphereTone,
        monsterId: stage.monsters[0].monsterId,
        monsterName: stage.monsters[0].monsterName,
        isBoss: false,
        monsters: stage.monsters.map((monster) => ({ ...monster })),
        supplyQueue: Array.isArray(supplyQueue) ? supplyQueue.slice(0, 3) : [],
        selectedAtMs: Math.max(0, Math.floor(Number(selectedAtMs) || 0))
    };
}

function calculateTarotKingdomStandings(entries = []) {
    const normalized = (Array.isArray(entries) ? entries : [])
        .map((entry, index) => ({
            playerIndex: Math.max(0, Math.floor(Number(entry?.playerIndex ?? index) || 0)),
            playFabId: String(entry?.playFabId || '').trim(),
            isNpc: entry?.isNpc === true,
            chips: Math.floor(Number(entry?.chips) || 0)
        }));
    return normalized.map((entry) => ({
        ...entry,
        rank: 1 + normalized.filter((other) => other.chips > entry.chips).length
    }));
}

const STAGE_REWARD_WEIGHTS = Object.freeze({
    early: Object.freeze({
        1: { common: 65, rare: 35 },
        2: { common: 80, rare: 20 },
        3: { common: 92, rare: 8 },
        4: { common: 98, rare: 2 }
    }),
    middle: Object.freeze({
        1: { common: 40, rare: 42, epic: 18 },
        2: { common: 58, rare: 32, epic: 10 },
        3: { common: 75, rare: 21, epic: 4 },
        4: { common: 88, rare: 10, epic: 2 }
    }),
    late: Object.freeze({
        1: { common: 20, rare: 38, epic: 32, legendary: 10 },
        2: { common: 35, rare: 40, epic: 20, legendary: 5 },
        3: { common: 55, rare: 32, epic: 12, legendary: 1 },
        4: { common: 72, rare: 23, epic: 4.5, legendary: 0.5 }
    })
});

function getTarotKingdomStageRewardWeights(stageNo, rank) {
    const safeStageNo = clampInteger(stageNo, 1, 11, 1);
    const safeRank = clampInteger(rank, 1, 4, 4);
    const band = safeStageNo <= 4 ? 'early' : (safeStageNo <= 8 ? 'middle' : 'late');
    return { ...STAGE_REWARD_WEIGHTS[band][safeRank] };
}

module.exports = {
    TAROT_KINGDOM_EXPLORATION_PROGRESS_KEY,
    TAROT_KINGDOM_EXPLORATION_PROGRESS_VERSION,
    TAROT_KINGDOM_STAGE_BEST_CHIPS_MAX,
    TAROT_KINGDOM_EXPLORATION_STAGES,
    TAROT_KINGDOM_STAGE_ENCOUNTER_VERSION,
    TAROT_KINGDOM_TOTAL_BEST_CHIPS_STAT,
    STAGE_REWARD_WEIGHTS,
    applyTarotKingdomStageClear,
    applyTarotKingdomStageBestChips,
    applyTarotKingdomMonsterDefeats,
    buildTarotKingdomStageEncounter,
    buildTarotKingdomStageList,
    calculateTarotKingdomStandings,
    getTarotKingdomExplorationStage,
    getTarotKingdomShipStageCap,
    getTarotKingdomStageRewardWeights,
    getTarotKingdomTotalBestChips,
    normalizeTarotKingdomExplorationProgress,
    readTarotKingdomExplorationProgress,
    writeTarotKingdomExplorationProgress
};
