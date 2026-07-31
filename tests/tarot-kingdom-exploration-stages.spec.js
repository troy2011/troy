const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const {
  TAROT_KINGDOM_EXPLORATION_STAGES,
  TAROT_KINGDOM_TOTAL_BEST_CHIPS_STAT,
  applyTarotKingdomMonsterDefeats,
  applyTarotKingdomStageClear,
  applyTarotKingdomStageBestChips,
  buildTarotKingdomStageEncounter,
  buildTarotKingdomStageList,
  calculateTarotKingdomStandings,
  getTarotKingdomShipStageCap,
  getTarotKingdomStageRewardWeights,
  getTarotKingdomTotalBestChips,
  normalizeTarotKingdomExplorationProgress
} = require('../server/tarotKingdomExplorationStages');
const {
  resolveActiveExplorationTarotEncounter,
  validateExplorationTransitionSupplies
} = require('../server/exploration').__test;
const roster = require('../public/Sprites/pixel-monsters/manifest.json');

test.describe('Tarot Kingdom fixed exploration stages', () => {
  test('11 stages contain four unique normal monsters in the approved order', () => {
    expect(TAROT_KINGDOM_EXPLORATION_STAGES).toHaveLength(11);
    const monsters = TAROT_KINGDOM_EXPLORATION_STAGES.flatMap((stage) => stage.monsters);
    expect(monsters).toHaveLength(44);
    expect(new Set(monsters.map((entry) => entry.monsterId)).size).toBe(44);
    expect(monsters.every((entry) => entry.isBoss === false)).toBeTruthy();
    expect(new Set(TAROT_KINGDOM_EXPLORATION_STAGES.map((stage) => stage.atmosphereTone)).size).toBe(11);
    expect(new Set(TAROT_KINGDOM_EXPLORATION_STAGES.map((stage) => stage.battlefieldId)).size).toBe(11);
    const destinationImages = TAROT_KINGDOM_EXPLORATION_STAGES.map((stage) => stage.imagePath);
    expect(TAROT_KINGDOM_EXPLORATION_STAGES.every((stage) => (
      stage.battlefieldId
      && stage.destinationImagePath === stage.imagePath
      && /^\.\/Sprites\/exploration_destinations\/.+\.png$/.test(stage.imagePath)
    ))).toBeTruthy();
    expect(new Set(destinationImages).size).toBe(11);
    expect(TAROT_KINGDOM_EXPLORATION_STAGES.map((stage) => stage.name)).toEqual([
      '珊瑚の浅瀬',
      '双塔岩の海峡',
      '群礁の島道',
      '月影の望楼島',
      '翠石の隠れ入り江',
      '幽霊沼の夜',
      '海上砦突破戦',
      '蒼光の洞窟',
      '雷雨の廃港',
      '獄炎の火山島',
      '終月の古代海門'
    ]);
    destinationImages.forEach((imagePath) => {
      expect(fs.existsSync(path.resolve(__dirname, '..', 'public', imagePath.replace(/^\.\//, '')))).toBeTruthy();
    });
    expect(monsters.map((entry) => entry.monsterName)).toEqual([
      'マシュロン', 'プルン', 'トゲマル', 'パピル',
      'モクモ', 'ツノガイ', 'リーフロ', 'ホタルビ',
      'ポルポ', 'ビズン', 'グールン', 'アクエル',
      'グリバト', 'フェリカ', 'ボーンテイル', 'ミドロ',
      'カブロン', 'リルフィ', 'モクリン', 'ガルネズ',
      'ルビット', 'ノッカ', 'コバット', 'モスガン',
      'ラムネロ', 'チュロ', 'フロス', 'ウッドラ',
      'グリモア', 'ガブリラ', 'ケロッツ', 'ネブラ',
      'メカノ', 'ゲルバット', 'ツキバネ', 'フレマ',
      'バクス', 'イグニス', 'キノガル', 'ヨミル',
      'トルネ', 'クロモ', 'グラヴァ', 'ノクス'
    ]);
    const excluded = new Set([
      'ismartal-vol2-monster-07',
      'ismartal-vol2-monster-15',
      'ismartal-vol2-monster-16',
      'ismartal-vol2-monster-14',
      'ismartal-vol2-monster-13',
      'ismartal-vol1-monster-05'
    ]);
    expect(monsters.some((entry) => excluded.has(entry.monsterId))).toBeFalsy();
    expect(roster.filter((entry) => entry.isBoss === true)).toHaveLength(3);
  });

  test('encounter v2 preserves stage order, background and three ordered supplies', () => {
    const encounter = buildTarotKingdomStageEncounter({
      explorationId: 'exp-stage-test',
      stageNo: 9,
      supplyQueue: [
        { itemId: 's1', displayName: '小', effectiveUnits: 1 },
        { itemId: 's2', displayName: '中', effectiveUnits: 2 },
        { itemId: 's3', displayName: '大', effectiveUnits: 3 },
        { itemId: 'ignored', effectiveUnits: 3 }
      ]
    });
    expect(encounter).toMatchObject({
      version: 2,
      explorationId: 'exp-stage-test',
      stageNo: 9,
      battlefieldId: 'stage-09-steel-fleet',
      atmosphereTone: 'storm-ruined-harbor',
      monsterName: 'メカノ'
    });
    expect(encounter.monsters.map((entry) => entry.monsterName)).toEqual([
      'メカノ', 'ゲルバット', 'ツキバネ', 'フレマ'
    ]);
    expect(encounter.supplyQueue.map((entry) => entry.itemId)).toEqual(['s1', 's2', 's3']);
  });

  test('an active stage upgrades a legacy single-monster encounter to its ordered four enemies', () => {
    const encounter = resolveActiveExplorationTarotEncounter({
      id: 'exp-legacy-stage',
      stageNo: 2,
      supplyQueue: [{ itemId: 'heal', displayName: '回復', effectiveUnits: 1 }],
      tarotEncounter: {
        version: 1,
        explorationId: 'exp-legacy-stage',
        monsterId: 'ismartal-vol1-monster-07',
        monsterName: 'マシュロン'
      }
    });

    expect(encounter.version).toBe(2);
    expect(encounter.stageNo).toBe(2);
    expect(encounter.monsters.map((entry) => entry.monsterName)).toEqual([
      'モクモ', 'ツノガイ', 'リーフロ', 'ホタルビ'
    ]);
    expect(encounter.supplyQueue).toHaveLength(1);
  });

  test('optional supplies retain selection order, enforce ownership and stop at three', () => {
    const available = [
      { itemId: 'small', displayName: '小回復', amount: 2, effectiveUnits: 1 },
      { itemId: 'large', displayName: '大回復', amount: 1, effectiveUnits: 3 }
    ];
    expect(validateExplorationTransitionSupplies([
      { itemId: 'large', quantity: 1 },
      { itemId: 'small', quantity: 2 }
    ], available)).toMatchObject({
      ok: true,
      supplyQueue: [
        { slot: 0, itemId: 'large', effectiveUnits: 3 },
        { slot: 1, itemId: 'small', effectiveUnits: 1 },
        { slot: 2, itemId: 'small', effectiveUnits: 1 }
      ]
    });
    expect(validateExplorationTransitionSupplies([
      { itemId: 'small', quantity: 3 }
    ], available).ok).toBeFalsy();
    expect(validateExplorationTransitionSupplies([
      { itemId: 'unknown', quantity: 1 }
    ], available).ok).toBeFalsy();
  });

  test('ship evolution caps stages at 4, 8 and 11', () => {
    expect(getTarotKingdomShipStageCap(1)).toBe(4);
    expect(getTarotKingdomShipStageCap(2)).toBe(8);
    expect(getTarotKingdomShipStageCap(3)).toBe(11);
    const progress = normalizeTarotKingdomExplorationProgress({ highestUnlockedStage: 11 });
    expect(buildTarotKingdomStageList(progress, 1).filter((stage) => stage.unlocked)).toHaveLength(4);
    expect(buildTarotKingdomStageList(progress, 2).filter((stage) => stage.unlocked)).toHaveLength(8);
    expect(buildTarotKingdomStageList(progress, 3).filter((stage) => stage.unlocked)).toHaveLength(11);
  });

  test('only a first or second place clear unlocks the next stage and retries are idempotent', () => {
    const initial = normalizeTarotKingdomExplorationProgress(null);
    const third = applyTarotKingdomStageClear(initial, 1, 3, 1000, 'exp-third');
    expect(third.highestUnlockedStage).toBe(1);
    expect(third.stages['1'].clearCount).toBe(1);
    const second = applyTarotKingdomStageClear(third, 1, 2, 2000, 'exp-second');
    expect(second.highestUnlockedStage).toBe(2);
    expect(second.stages['1'].bestRank).toBe(2);
    expect(second.stages['1'].clearCount).toBe(2);
    const retry = applyTarotKingdomStageClear(second, 1, 2, 3000, 'exp-second');
    expect(retry).toEqual(second);
  });

  test('personal monster defeats reveal only valid self kills and cleared stages reveal the full lineup', () => {
    const initial = normalizeTarotKingdomExplorationProgress(null);
    const withDefeat = applyTarotKingdomMonsterDefeats(initial, 1, [
      {
        roundNo: 1,
        playFabId: 'OWNER',
        isNpc: false,
        isPet: false,
        monsterId: 'ismartal-vol1-monster-07'
      },
      {
        roundNo: 2,
        playFabId: 'OTHER',
        isNpc: false,
        isPet: false,
        monsterId: 'ismartal-vol3-monster-04'
      },
      {
        roundNo: 3,
        playFabId: 'OWNER',
        isNpc: true,
        isPet: true,
        monsterId: 'ismartal-vol1-monster-01'
      },
      {
        roundNo: 4,
        playFabId: 'OWNER',
        isNpc: false,
        isPet: false,
        monsterId: 'ismartal-vol1-monster-01'
      }
    ], 'OWNER');

    expect(withDefeat.version).toBe(3);
    expect(withDefeat.defeatedMonsterIds).toEqual(['ismartal-vol1-monster-07']);
    const uncleared = buildTarotKingdomStageList(withDefeat, 1)[0];
    expect(uncleared.monsters.map((monster) => ({
      defeated: monster.defeatedByPlayer,
      revealed: monster.revealed
    }))).toEqual([
      { defeated: true, revealed: true },
      { defeated: false, revealed: false },
      { defeated: false, revealed: false },
      { defeated: false, revealed: false }
    ]);

    const clearedProgress = applyTarotKingdomStageClear(withDefeat, 1, 2, 2000, 'exp-clear');
    const cleared = buildTarotKingdomStageList(clearedProgress, 1)[0];
    expect(cleared.monsters.every((monster) => monster.revealed)).toBeTruthy();
    expect(cleared.monsters.filter((monster) => monster.defeatedByPlayer).map((monster) => monster.monsterId))
      .toEqual(['ismartal-vol1-monster-07']);
  });

  test('final chip ties share rank and reward weights follow stage bands', () => {
    const standings = calculateTarotKingdomStandings([
      { playerIndex: 0, playFabId: 'A', chips: 140 },
      { playerIndex: 1, playFabId: 'B', chips: 140 },
      { playerIndex: 2, playFabId: 'C', chips: 90 },
      { playerIndex: 3, isNpc: true, chips: 70 }
    ]);
    expect(standings.map((entry) => entry.rank)).toEqual([1, 1, 3, 4]);
    expect(getTarotKingdomStageRewardWeights(1, 1)).toEqual({ common: 65, rare: 35 });
    expect(getTarotKingdomStageRewardWeights(6, 2)).toEqual({ common: 58, rare: 32, epic: 10 });
    expect(getTarotKingdomStageRewardWeights(11, 1)).toEqual({
      common: 20,
      rare: 38,
      epic: 32,
      legendary: 10
    });
  });

  test('stage best chips only improve and their sum becomes the game ranking score', () => {
    const initial = normalizeTarotKingdomExplorationProgress({
      version: 2,
      highestUnlockedStage: 3,
      stages: {
        1: { bestRank: 2, clearCount: 1 },
        2: { bestRank: 1, clearCount: 1 }
      }
    });
    expect(initial.totalBestChips).toBe(0);

    const stageOne = applyTarotKingdomStageBestChips(initial, 1, 240);
    const lowerRetry = applyTarotKingdomStageBestChips(stageOne, 1, 180);
    const stageTwo = applyTarotKingdomStageBestChips(lowerRetry, 2, 315);

    expect(lowerRetry).toEqual(stageOne);
    expect(stageTwo.stages['1'].bestChips).toBe(240);
    expect(stageTwo.stages['2'].bestChips).toBe(315);
    expect(getTarotKingdomTotalBestChips(stageTwo)).toBe(555);
    expect(stageTwo.totalBestChips).toBe(555);
    expect(buildTarotKingdomStageList(stageTwo, 1).slice(0, 2).map((stage) => stage.bestChips))
      .toEqual([240, 315]);
    expect(TAROT_KINGDOM_TOTAL_BEST_CHIPS_STAT).toBe('troy_tarot_kingdom_chip_total');
  });
});
