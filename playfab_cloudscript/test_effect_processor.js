/**
 * Effect Processor テストスクリプト
 * Node.js環境でEffectProcessorの動作を確認するためのテストコード
 *
 * 実行方法:
 * node playfab_cloudscript/test_effect_processor.js
 */

// PlayFab環境をシミュレートするためのモックlog関数
const log = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${msg}`)
};

// EffectProcessor.jsをコピー&ペーストするか、requireで読み込む
// ここでは簡略化のため、同じディレクトリにあると想定

/**
 * テストケース1: 基本的な物理ダメージ
 */
function testBasicDamage() {
  console.log("\n========== テスト1: 基本的な物理ダメージ ==========");

  const EffectProcessor = require('./EffectProcessor').EffectProcessor;
  const processor = new EffectProcessor();

  const effects = [
    {
      code: "DAMAGE_PHYSICS",
      params: { power: 100 },
      trigger: "ON_ACTIVATE"
    }
  ];

  const context = {
    attacker: { atk: 120, name: "勇者" },
    defender: { hp: 500, def: 20, name: "スライム" }
  };

  const result = processor.process(effects, context, "ON_ACTIVATE");

  console.log("結果:", JSON.stringify(result, null, 2));
  console.log(`${context.defender.name}の残りHP: ${context.defender.hp}`);

  // アサーション
  if (result.success && result.totalDamage > 0) {
    console.log("✓ テスト成功");
    return true;
  } else {
    console.log("✗ テスト失敗");
    return false;
  }
}

/**
 * テストケース2: 状態異常付与
 */
function testStatusEffect() {
  console.log("\n========== テスト2: 状態異常付与 (火傷) ==========");

  const EffectProcessor = require('./EffectProcessor').EffectProcessor;
  const processor = new EffectProcessor();

  const effects = [
    {
      code: "APPLY_STATUS",
      params: { id: "burn", chance: 1.0, duration: 3 },
      trigger: "ON_HIT"
    }
  ];

  const context = {
    attacker: { name: "火の魔法使い" },
    defender: { name: "氷の敵", statuses: [] }
  };

  const result = processor.process(effects, context, "ON_HIT");

  console.log("結果:", JSON.stringify(result, null, 2));
  console.log("付与された状態異常:", context.defender.statuses);

  if (result.success && context.defender.statuses.length > 0) {
    console.log("✓ テスト成功");
    return true;
  } else {
    console.log("✗ テスト失敗");
    return false;
  }
}

/**
 * テストケース3: 回復スキル
 */
function testHeal() {
  console.log("\n========== テスト3: 回復スキル ==========");

  const EffectProcessor = require('./EffectProcessor').EffectProcessor;
  const processor = new EffectProcessor();

  const effects = [
    {
      code: "HEAL",
      params: { amount: 200 },
      trigger: "ON_ACTIVATE"
    }
  ];

  const context = {
    attacker: { hp: 300, maxHp: 500, name: "僧侶" }
  };

  const beforeHp = context.attacker.hp;

  const result = processor.process(effects, context, "ON_ACTIVATE");

  console.log("結果:", JSON.stringify(result, null, 2));
  console.log(`回復前: ${beforeHp} → 回復後: ${context.attacker.hp}`);

  if (result.success && context.attacker.hp === 500) {
    console.log("✓ テスト成功");
    return true;
  } else {
    console.log("✗ テスト失敗");
    return false;
  }
}

/**
 * テストケース4: ステータスバフ
 */
function testBuff() {
  console.log("\n========== テスト4: ステータスバフ ==========");

  const EffectProcessor = require('./EffectProcessor').EffectProcessor;
  const processor = new EffectProcessor();

  const effects = [
    {
      code: "BUFF_STAT",
      params: { stat: "atk", value: 30, duration: 5, isPercent: true },
      trigger: "ON_ACTIVATE"
    }
  ];

  const context = {
    attacker: { atk: 100, name: "戦士" }
  };

  const beforeAtk = context.attacker.atk;

  const result = processor.process(effects, context, "ON_ACTIVATE");

  console.log("結果:", JSON.stringify(result, null, 2));
  console.log(`攻撃力: ${beforeAtk} → ${context.attacker.atk} (+30%)`);

  if (result.success && context.attacker.atk === 130) {
    console.log("✓ テスト成功");
    return true;
  } else {
    console.log("✗ テスト失敗");
    return false;
  }
}

/**
 * テストケース5: 資源生産（建物）
 */
function testEconomy() {
  console.log("\n========== テスト5: 資源生産 (建物) ==========");

  const EffectProcessor = require('./EffectProcessor').EffectProcessor;
  const processor = new EffectProcessor();

  const effects = [
    {
      code: "ECONOMY_GENERATE",
      params: { resource: "gold", amount: 100, interval: 3600 },
      trigger: "PASSIVE"
    }
  ];

  const context = {
    player: { resources: { gold: 500 } }
  };

  const beforeGold = context.player.resources.gold;

  const result = processor.process(effects, context, "PASSIVE");

  console.log("結果:", JSON.stringify(result, null, 2));
  console.log(`金: ${beforeGold} → ${context.player.resources.gold}`);

  if (result.success && context.player.resources.gold === 600) {
    console.log("✓ テスト成功");
    return true;
  } else {
    console.log("✗ テスト失敗");
    return false;
  }
}

/**
 * テストケース6: 複合効果（ダメージ + 状態異常）
 */
function testComboEffect() {
  console.log("\n========== テスト6: 複合効果 (ファイアーソード) ==========");

  const EffectProcessor = require('./EffectProcessor').EffectProcessor;
  const processor = new EffectProcessor();

  // ファイアーソードのエフェクト
  const fireSkillEffects = [
    {
      code: "DAMAGE_PHYSICS",
      params: { power: 150, element: "fire", critRate: 0.2 },
      trigger: "ON_ACTIVATE"
    },
    {
      code: "APPLY_STATUS",
      params: { id: "burn", chance: 1.0, duration: 3 },
      trigger: "ON_HIT"
    }
  ];

  const context = {
    attacker: { atk: 120, name: "勇者" },
    defender: { hp: 1000, def: 30, name: "ドラゴン", statuses: [] }
  };

  // 1. スキル発動時（ダメージ）
  console.log("\n--- フェーズ1: スキル発動 (ON_ACTIVATE) ---");
  const activateResult = processor.process(fireSkillEffects, context, "ON_ACTIVATE");
  console.log("ダメージ結果:", JSON.stringify(activateResult, null, 2));

  // 2. 命中時（状態異常付与）
  console.log("\n--- フェーズ2: 命中 (ON_HIT) ---");
  const hitResult = processor.process(fireSkillEffects, context, "ON_HIT");
  console.log("状態異常付与結果:", JSON.stringify(hitResult, null, 2));

  console.log(`\n最終状態:`);
  console.log(`  ${context.defender.name}の残りHP: ${context.defender.hp}`);
  console.log(`  付与された状態異常: ${JSON.stringify(context.defender.statuses)}`);

  if (activateResult.success && hitResult.success && context.defender.statuses.length > 0) {
    console.log("✓ テスト成功");
    return true;
  } else {
    console.log("✗ テスト失敗");
    return false;
  }
}

/**
 * テストケース7: トリガーフィルタリング
 */
function testTriggerFiltering() {
  console.log("\n========== テスト7: トリガーフィルタリング ==========");

  const EffectProcessor = require('./EffectProcessor').EffectProcessor;
  const processor = new EffectProcessor();

  const effects = [
    {
      code: "DAMAGE_PHYSICS",
      params: { power: 100 },
      trigger: "ON_ACTIVATE"
    },
    {
      code: "HEAL",
      params: { amount: 50 },
      trigger: "ON_TURN_START"
    },
    {
      code: "APPLY_STATUS",
      params: { id: "poison", chance: 1.0, duration: 2 },
      trigger: "ON_HIT"
    }
  ];

  const context = {
    attacker: { atk: 100, hp: 500 },
    defender: { hp: 500, statuses: [] }
  };

  console.log("\n--- ON_ACTIVATEトリガーのみ実行 ---");
  const activateResult = processor.process(effects, context, "ON_ACTIVATE");
  console.log(`実行されたエフェクト数: ${activateResult.effects.length}`);
  console.log(`合計ダメージ: ${activateResult.totalDamage}`);

  console.log("\n--- ON_TURN_STARTトリガーのみ実行 ---");
  const turnStartResult = processor.process(effects, context, "ON_TURN_START");
  console.log(`実行されたエフェクト数: ${turnStartResult.effects.length}`);
  console.log(`合計回復: ${turnStartResult.totalHeal}`);

  if (activateResult.effects.length === 1 && turnStartResult.effects.length === 1) {
    console.log("✓ テスト成功");
    return true;
  } else {
    console.log("✗ テスト失敗");
    return false;
  }
}

/**
 * テストケース8: エラーハンドリング
 */
function testErrorHandling() {
  console.log("\n========== テスト8: エラーハンドリング ==========");

  const EffectProcessor = require('./EffectProcessor').EffectProcessor;
  const processor = new EffectProcessor();

  // 不正なエフェクトコード
  const invalidEffects = [
    {
      code: "INVALID_CODE",
      params: {},
      trigger: "ON_ACTIVATE"
    }
  ];

  const context = {
    attacker: { atk: 100 },
    defender: { hp: 500 }
  };

  const result = processor.process(invalidEffects, context, "ON_ACTIVATE");

  console.log("結果:", JSON.stringify(result, null, 2));

  if (result.logs.some(log => log.includes("未知のエフェクトコード"))) {
    console.log("✓ テスト成功: 不正なコードを適切に処理");
    return true;
  } else {
    console.log("✗ テスト失敗");
    return false;
  }
}

/**
 * 全テストを実行
 */
function runAllTests() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════╗");
  console.log("║   Effect Processor テストスイート実行開始          ║");
  console.log("╚════════════════════════════════════════════════════╝");

  const tests = [
    { name: "基本的な物理ダメージ", fn: testBasicDamage },
    { name: "状態異常付与", fn: testStatusEffect },
    { name: "回復スキル", fn: testHeal },
    { name: "ステータスバフ", fn: testBuff },
    { name: "資源生産", fn: testEconomy },
    { name: "複合効果", fn: testComboEffect },
    { name: "トリガーフィルタリング", fn: testTriggerFiltering },
    { name: "エラーハンドリング", fn: testErrorHandling }
  ];

  let passed = 0;
  let failed = 0;

  tests.forEach((test, index) => {
    try {
      const result = test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`テスト "${test.name}" で例外が発生:`, error.message);
      failed++;
    }
  });

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════╗");
  console.log("║   テスト結果サマリー                               ║");
  console.log("╚════════════════════════════════════════════════════╝");
  console.log(`総テスト数: ${tests.length}`);
  console.log(`成功: ${passed} ✓`);
  console.log(`失敗: ${failed} ✗`);
  console.log(`成功率: ${((passed / tests.length) * 100).toFixed(1)}%`);
  console.log("\n");

  return failed === 0;
}

// メイン実行
if (require.main === module) {
  const success = runAllTests();
  process.exit(success ? 0 : 1);
}

module.exports = {
  testBasicDamage,
  testStatusEffect,
  testHeal,
  testBuff,
  testEconomy,
  testComboEffect,
  testTriggerFiltering,
  testErrorHandling,
  runAllTests
};
