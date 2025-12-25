/**
 * ========================================
 * 汎用エフェクトプロセッサー (Effect Processor)
 * ========================================
 * PlayFab CloudScript用のデータ駆動型エフェクト処理エンジン
 *
 * 目的:
 * - スキル、建物、アイテムなど、様々な効果を統一的に処理
 * - ハードコーディングを避け、カタログデータから動的に効果を実行
 * - トリガーベースの実行で、タイミングに応じた効果発動に対応
 */

/**
 * EffectType - 効果コード定数
 * カタログのCustomDataに記述する効果コードの定義
 */
const EffectType = {
  // 戦闘系エフェクト
  DAMAGE_PHYSICS: "DAMAGE_PHYSICS",     // 物理ダメージ計算
  DAMAGE_MAGIC: "DAMAGE_MAGIC",         // 魔法ダメージ計算
  HEAL: "HEAL",                         // HP回復
  BUFF_STAT: "BUFF_STAT",               // ステータス強化
  DEBUFF_STAT: "DEBUFF_STAT",           // ステータス弱体化
  APPLY_STATUS: "APPLY_STATUS",         // 状態異常付与

  // 経済系エフェクト
  ECONOMY_GENERATE: "ECONOMY_GENERATE", // 資源生産
  ECONOMY_CONSUME: "ECONOMY_CONSUME",   // 資源消費
  ECONOMY_BONUS: "ECONOMY_BONUS",       // 資源ボーナス

  // 特殊効果
  SUMMON_UNIT: "SUMMON_UNIT",           // ユニット召喚
  TELEPORT: "TELEPORT",                 // テレポート
  SHIELD: "SHIELD",                     // シールド付与
};

/**
 * TriggerType - トリガータイプ定数
 * 効果が発動するタイミングの定義
 */
const TriggerType = {
  ON_ACTIVATE: "ON_ACTIVATE",           // スキル/建物使用時
  ON_HIT: "ON_HIT",                     // 命中時
  ON_KILL: "ON_KILL",                   // 敵撃破時
  ON_DAMAGED: "ON_DAMAGED",             // ダメージ受けた時
  ON_TURN_START: "ON_TURN_START",       // ターン開始時
  ON_TURN_END: "ON_TURN_END",           // ターン終了時
  ON_DEATH: "ON_DEATH",                 // 死亡時
  PASSIVE: "PASSIVE",                   // 常時発動
};

/**
 * EffectProcessor - メイン処理クラス
 * エフェクトリストを受け取り、コンテキストに基づいて適切な処理を実行
 */
class EffectProcessor {
  constructor() {
    // ログ出力を有効にするかどうか
    this.enableLogging = true;

    // エフェクトハンドラマップ（code → 処理関数のマッピング）
    this.handlers = {
      [EffectType.DAMAGE_PHYSICS]: this._handleDamage.bind(this),
      [EffectType.DAMAGE_MAGIC]: this._handleMagicDamage.bind(this),
      [EffectType.HEAL]: this._handleHeal.bind(this),
      [EffectType.BUFF_STAT]: this._handleBuffStat.bind(this),
      [EffectType.DEBUFF_STAT]: this._handleDebuffStat.bind(this),
      [EffectType.APPLY_STATUS]: this._handleApplyStatus.bind(this),
      [EffectType.ECONOMY_GENERATE]: this._handleEconomy.bind(this),
      [EffectType.ECONOMY_CONSUME]: this._handleEconomyConsume.bind(this),
      [EffectType.ECONOMY_BONUS]: this._handleEconomyBonus.bind(this),
      [EffectType.SUMMON_UNIT]: this._handleSummonUnit.bind(this),
      [EffectType.TELEPORT]: this._handleTeleport.bind(this),
      [EffectType.SHIELD]: this._handleShield.bind(this),
    };
  }

  /**
   * process - エフェクトリストを処理するメインメソッド
   * @param {Array} effectList - 効果の配列 [{ code, params, trigger }, ...]
   * @param {Object} context - 実行コンテキスト
   * @param {string} currentTrigger - 現在のトリガータイプ（省略時は全て実行）
   * @returns {Object} 処理結果 { success, results, logs }
   */
  process(effectList, context, currentTrigger = null) {
    const results = {
      success: true,
      effects: [],
      logs: [],
      totalDamage: 0,
      totalHeal: 0,
      statusesApplied: [],
      resourcesGenerated: {},
    };

    if (!effectList || !Array.isArray(effectList)) {
      this._log(results, "警告: effectListが配列ではありません");
      results.success = false;
      return results;
    }

    // エフェクトリストをループ処理
    for (let i = 0; i < effectList.length; i++) {
      const effect = effectList[i];

      // トリガーチェック（指定されている場合のみフィルタリング）
      if (currentTrigger && effect.trigger && effect.trigger !== currentTrigger) {
        continue; // このトリガーでは実行しない
      }

      // エフェクトコードの検証
      if (!effect.code) {
        this._log(results, `エフェクト[${i}]: codeが指定されていません`);
        continue;
      }

      // ハンドラの取得
      const handler = this.handlers[effect.code];
      if (!handler) {
        this._log(results, `エフェクト[${i}]: 未知のエフェクトコード "${effect.code}"`);
        continue;
      }

      try {
        // エフェクト実行
        this._log(results, `エフェクト実行: ${effect.code} (trigger: ${effect.trigger || "any"})`);
        const effectResult = handler(effect.params || {}, context);

        results.effects.push({
          code: effect.code,
          trigger: effect.trigger,
          result: effectResult,
        });

        // 結果の集計
        this._aggregateResults(results, effect.code, effectResult);

      } catch (error) {
        this._log(results, `エフェクト[${i}] 実行エラー: ${error.message}`);
        results.success = false;
      }
    }

    return results;
  }

  /**
   * _handleDamage - 物理ダメージ処理
   * @param {Object} params - { power, element, critRate, armorPenetration }
   * @param {Object} context - { attacker, defender, battleState, ... }
   */
  _handleDamage(params, context) {
    const attacker = context.attacker || {};
    const defender = context.defender || {};

    // 基礎ダメージ計算: スキルパワー × 攻撃者の攻撃力
    let baseDamage = (params.power || 100) * (attacker.atk || 1) / 100;

    // 属性ダメージ補正（オプション）
    if (params.element && defender.resistance) {
      const resistance = defender.resistance[params.element] || 1.0;
      baseDamage *= (2.0 - resistance); // 抵抗力が高いほどダメージ減少
    }

    // クリティカル判定
    const critRate = params.critRate || 0.05;
    const isCritical = Math.random() < critRate;
    if (isCritical) {
      baseDamage *= 2.0;
    }

    // 防御力計算
    const defense = defender.def || 0;
    const armorPenetration = params.armorPenetration || 0;
    const effectiveDefense = Math.max(0, defense - armorPenetration);

    // 最終ダメージ
    const finalDamage = Math.max(1, Math.floor(baseDamage - effectiveDefense * 0.5));

    // ディフェンダーのHP減算（contextが許可している場合）
    if (defender.hp !== undefined) {
      defender.hp = Math.max(0, defender.hp - finalDamage);
    }

    return {
      damage: finalDamage,
      isCritical: isCritical,
      element: params.element || "physical",
      targetHp: defender.hp,
    };
  }

  /**
   * _handleMagicDamage - 魔法ダメージ処理
   */
  _handleMagicDamage(params, context) {
    const attacker = context.attacker || {};
    const defender = context.defender || {};

    let baseDamage = (params.power || 100) * (attacker.magic || 1) / 100;

    // 魔法抵抗
    const magicResist = defender.magicResist || 0;
    const finalDamage = Math.max(1, Math.floor(baseDamage * (1 - magicResist / 100)));

    if (defender.hp !== undefined) {
      defender.hp = Math.max(0, defender.hp - finalDamage);
    }

    return {
      damage: finalDamage,
      type: "magic",
      element: params.element || "arcane",
      targetHp: defender.hp,
    };
  }

  /**
   * _handleHeal - HP回復処理
   */
  _handleHeal(params, context) {
    const target = context.target || context.attacker || {};

    const healAmount = params.amount || 50;
    const maxHp = target.maxHp || 1000;

    if (target.hp !== undefined) {
      const beforeHp = target.hp;
      target.hp = Math.min(maxHp, target.hp + healAmount);
      const actualHeal = target.hp - beforeHp;

      return {
        heal: actualHeal,
        targetHp: target.hp,
        overheal: healAmount - actualHeal,
      };
    }

    return { heal: healAmount };
  }

  /**
   * _handleBuffStat - ステータス強化処理
   */
  _handleBuffStat(params, context) {
    const target = context.target || context.attacker || {};
    const stat = params.stat; // "atk", "def", "speed" など
    const value = params.value || 0;
    const duration = params.duration || 3;
    const isPercent = params.isPercent || false;

    if (!stat) {
      return { error: "stat パラメータが必要です" };
    }

    // バフの適用
    if (target[stat] !== undefined) {
      const originalValue = target[stat];
      const buffValue = isPercent ? originalValue * (value / 100) : value;
      target[stat] += buffValue;

      return {
        stat: stat,
        buffValue: buffValue,
        duration: duration,
        newValue: target[stat],
      };
    }

    return { stat, value, duration };
  }

  /**
   * _handleDebuffStat - ステータス弱体化処理
   */
  _handleDebuffStat(params, context) {
    const target = context.defender || {};
    const stat = params.stat;
    const value = params.value || 0;
    const duration = params.duration || 3;

    if (!stat || !target[stat]) {
      return { error: "無効なstatまたはターゲット" };
    }

    const originalValue = target[stat];
    target[stat] = Math.max(0, target[stat] - value);

    return {
      stat: stat,
      debuffValue: value,
      duration: duration,
      newValue: target[stat],
    };
  }

  /**
   * _handleApplyStatus - 状態異常付与処理
   */
  _handleApplyStatus(params, context) {
    const target = context.defender || context.target || {};
    const statusId = params.id;
    const chance = params.chance || 1.0;
    const duration = params.duration || 3;

    if (!statusId) {
      return { error: "status id が必要です" };
    }

    // 確率判定
    const applied = Math.random() < chance;

    if (applied) {
      // ターゲットにステータスリストがなければ初期化
      if (!target.statuses) {
        target.statuses = [];
      }

      target.statuses.push({
        id: statusId,
        duration: duration,
        appliedAt: Date.now(),
      });

      return {
        statusId: statusId,
        applied: true,
        duration: duration,
        chance: chance,
      };
    }

    return {
      statusId: statusId,
      applied: false,
      chance: chance,
    };
  }

  /**
   * _handleEconomy - 資源生産処理（建物用）
   */
  _handleEconomy(params, context) {
    const player = context.player || {};
    const resourceType = params.resource || "gold";
    const amount = params.amount || 10;
    const interval = params.interval || 3600; // 秒単位

    // プレイヤーの資源を増加
    if (!player.resources) {
      player.resources = {};
    }

    if (!player.resources[resourceType]) {
      player.resources[resourceType] = 0;
    }

    player.resources[resourceType] += amount;

    return {
      resource: resourceType,
      amount: amount,
      total: player.resources[resourceType],
      interval: interval,
    };
  }

  /**
   * _handleEconomyConsume - 資源消費処理
   */
  _handleEconomyConsume(params, context) {
    const player = context.player || {};
    const resourceType = params.resource || "gold";
    const amount = params.amount || 10;

    if (!player.resources || !player.resources[resourceType]) {
      return { error: "資源が不足しています", resource: resourceType };
    }

    if (player.resources[resourceType] < amount) {
      return {
        error: "資源が不足しています",
        resource: resourceType,
        required: amount,
        current: player.resources[resourceType],
      };
    }

    player.resources[resourceType] -= amount;

    return {
      resource: resourceType,
      consumed: amount,
      remaining: player.resources[resourceType],
    };
  }

  /**
   * _handleEconomyBonus - 資源ボーナス処理
   */
  _handleEconomyBonus(params, context) {
    const player = context.player || {};
    const resourceType = params.resource || "gold";
    const multiplier = params.multiplier || 1.5;
    const duration = params.duration || 3600;

    return {
      resource: resourceType,
      multiplier: multiplier,
      duration: duration,
      message: `${resourceType}の生産量が${multiplier}倍になります（${duration}秒間）`,
    };
  }

  /**
   * _handleSummonUnit - ユニット召喚処理
   */
  _handleSummonUnit(params, context) {
    const unitId = params.unitId;
    const count = params.count || 1;
    const duration = params.duration || null;

    return {
      unitId: unitId,
      count: count,
      duration: duration,
      message: `${unitId} を ${count}体召喚しました`,
    };
  }

  /**
   * _handleTeleport - テレポート処理
   */
  _handleTeleport(params, context) {
    const target = context.target || context.attacker || {};
    const x = params.x;
    const y = params.y;

    if (x !== undefined && y !== undefined) {
      const oldPosition = { x: target.x, y: target.y };
      target.x = x;
      target.y = y;

      return {
        from: oldPosition,
        to: { x, y },
        message: "テレポートしました",
      };
    }

    return { error: "座標が指定されていません" };
  }

  /**
   * _handleShield - シールド付与処理
   */
  _handleShield(params, context) {
    const target = context.target || context.attacker || {};
    const amount = params.amount || 100;
    const duration = params.duration || 3;

    if (!target.shield) {
      target.shield = 0;
    }

    target.shield += amount;

    return {
      shieldAmount: amount,
      totalShield: target.shield,
      duration: duration,
    };
  }

  /**
   * _aggregateResults - 処理結果の集計
   */
  _aggregateResults(results, code, effectResult) {
    if (effectResult.damage) {
      results.totalDamage += effectResult.damage;
    }

    if (effectResult.heal) {
      results.totalHeal += effectResult.heal;
    }

    if (effectResult.statusId && effectResult.applied) {
      results.statusesApplied.push(effectResult.statusId);
    }

    if (effectResult.resource && effectResult.amount) {
      if (!results.resourcesGenerated[effectResult.resource]) {
        results.resourcesGenerated[effectResult.resource] = 0;
      }
      results.resourcesGenerated[effectResult.resource] += effectResult.amount;
    }
  }

  /**
   * _log - ログ出力ヘルパー
   */
  _log(results, message) {
    if (this.enableLogging) {
      results.logs.push(message);
      log.info(message); // PlayFab CloudScript用のログ関数
    }
  }
}

// =========================================
// 使用例 (Usage Example)
// =========================================

/**
 * スキル発動のシミュレーション例
 */
function testEffectProcessor() {
  log.info("========== Effect Processor Test Start ==========");

  // エフェクトプロセッサーのインスタンス作成
  const processor = new EffectProcessor();

  // テストデータ: 火属性スキル（物理ダメージ + 火傷付与）
  const fireSkillEffects = [
    {
      code: "DAMAGE_PHYSICS",
      params: { power: 150, element: "fire", critRate: 0.2 },
      trigger: "ON_ACTIVATE"
    },
    {
      code: "APPLY_STATUS",
      params: { id: "burn", chance: 0.4, duration: 3 },
      trigger: "ON_HIT"
    }
  ];

  // 戦闘コンテキスト
  const battleContext = {
    attacker: {
      id: "player_001",
      name: "勇者",
      atk: 120,
      magic: 80,
      hp: 500,
      maxHp: 500,
    },
    defender: {
      id: "enemy_001",
      name: "ドラゴン",
      hp: 1000,
      maxHp: 1000,
      def: 50,
      resistance: { fire: 0.8, ice: 1.2 }, // 火耐性あり
      statuses: [],
    },
    battleState: {
      turn: 3,
      weather: "sunny",
    }
  };

  // エフェクト実行（スキル発動時）
  log.info("\n--- スキル発動 (ON_ACTIVATE) ---");
  const activateResult = processor.process(fireSkillEffects, battleContext, "ON_ACTIVATE");
  log.info("結果: " + JSON.stringify(activateResult, null, 2));

  // エフェクト実行（命中時）
  log.info("\n--- 攻撃命中 (ON_HIT) ---");
  const hitResult = processor.process(fireSkillEffects, battleContext, "ON_HIT");
  log.info("結果: " + JSON.stringify(hitResult, null, 2));

  // 建物効果のテスト: 金鉱（資源生産）
  log.info("\n--- 建物効果テスト: 金鉱 ---");
  const buildingEffects = [
    {
      code: "ECONOMY_GENERATE",
      params: { resource: "gold", amount: 100, interval: 3600 },
      trigger: "PASSIVE"
    }
  ];

  const economyContext = {
    player: {
      id: "player_001",
      resources: { gold: 500, wood: 200 }
    }
  };

  const economyResult = processor.process(buildingEffects, economyContext, "PASSIVE");
  log.info("結果: " + JSON.stringify(economyResult, null, 2));

  // 複合効果のテスト: 回復 + バフ
  log.info("\n--- 複合効果テスト: 回復 + 攻撃力バフ ---");
  const buffSkillEffects = [
    {
      code: "HEAL",
      params: { amount: 200 },
      trigger: "ON_ACTIVATE"
    },
    {
      code: "BUFF_STAT",
      params: { stat: "atk", value: 30, duration: 5, isPercent: true },
      trigger: "ON_ACTIVATE"
    }
  ];

  const buffResult = processor.process(buffSkillEffects, battleContext, "ON_ACTIVATE");
  log.info("結果: " + JSON.stringify(buffResult, null, 2));
  log.info("攻撃者の新しい攻撃力: " + battleContext.attacker.atk);

  log.info("\n========== Effect Processor Test End ==========");

  return {
    activateResult,
    hitResult,
    economyResult,
    buffResult,
  };
}

// PlayFab CloudScript のハンドラ関数として登録
handlers.TestEffectProcessor = function(args, context) {
  return testEffectProcessor();
};

// スキル使用のCloudScript実装例
handlers.UseSkill = function(args, context) {
  const playFabId = currentPlayerId;
  const skillId = args.skillId;
  const targetId = args.targetId;

  // スキルのカタログデータを取得
  const catalogRequest = {
    CatalogVersion: "skills_catalog",
    ItemIds: [skillId]
  };

  const catalogResult = server.GetCatalogItems(catalogRequest);

  if (!catalogResult.Catalog || catalogResult.Catalog.length === 0) {
    return { error: "スキルが見つかりません" };
  }

  const skillData = catalogResult.Catalog[0];
  const customData = JSON.parse(skillData.CustomData || "{}");
  const effects = customData.effects || [];

  // 戦闘コンテキストの構築（実際のゲームではデータベースから取得）
  const battleContext = {
    attacker: {
      id: playFabId,
      atk: 100,
      hp: 500,
      maxHp: 500,
    },
    defender: {
      id: targetId,
      hp: 800,
      maxHp: 800,
      def: 30,
    }
  };

  // エフェクト処理
  const processor = new EffectProcessor();
  const result = processor.process(effects, battleContext, "ON_ACTIVATE");

  return {
    success: true,
    skillId: skillId,
    effectResult: result,
    battleContext: battleContext,
  };
};

// モジュールエクスポート（PlayFab外でのテスト用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    EffectProcessor,
    EffectType,
    TriggerType,
    testEffectProcessor,
  };
}
