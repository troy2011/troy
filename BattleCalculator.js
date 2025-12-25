/**
 * BattleCalculator クラス
 *
 * バトル判定ロジック詳細仕様書(v12.0)に基づき、戦闘の判定とダメージ計算を行うクラス。
 * 以下の3つのPhaseを実装:
 * - Phase 1: 戦術じゃんけん (剛・速・技)
 * - Phase 2: 属性相性 (火・風・地・水)
 * - Phase 3: 物理相性 (斬・打・銃・魔法 vs 軽・中・重装備)
 *
 * @class
 */
class BattleCalculator {
  /**
   * 戦術タイプの定義
   * 剛(強) > 速 > 技 > 剛(強) の三すくみ関係
   */
  static TACTICS = {
    POWER: 'power',    // 剛 (👊)
    SPEED: 'speed',    // 速 (✋)
    SKILL: 'skill'     // 技 (✌️)
  };

  /**
   * 戦術じゃんけんの結果
   */
  static TACTICS_RESULT = {
    WIN: 'WIN',
    LOSE: 'LOSE',
    DRAW: 'DRAW'
  };

  /**
   * 属性タイプの定義
   * 火 > 風 > 地 > 水 > 火 の循環関係
   */
  static ELEMENTS = {
    FIRE: 'fire',      // 🔥 火
    WIND: 'wind',      // 🍃 風
    EARTH: 'earth',    // 🪨 地
    WATER: 'water',    // 💧 水
    NONE: 'none'       // 無属性
  };

  /**
   * 攻撃タイプの定義
   */
  static ATTACK_TYPES = {
    SLASH: 'slash',    // 🗡️ 斬撃
    STRIKE: 'strike',  // 🔨 打撃
    SHOT: 'shot',      // 🔫 銃撃
    MAGIC: 'magic'     // 🪄 魔法
  };

  /**
   * 防具タイプの定義
   */
  static ARMOR_TYPES = {
    LIGHT: 'light',    // 軽装 (布・服)
    MEDIUM: 'medium',  // 中装 (革・軽金属)
    HEAVY: 'heavy'     // 重装 (鉄・岩)
  };

  /**
   * Phase 1: 戦術じゃんけんの判定
   *
   * 中リールのシンボル同士で勝負し、このターンの状態を決定する。
   * ルール: 剛 > 速 > 技 > 剛
   *
   * @param {BattleSymbol|Object} playerSymbol - プレイヤーの戦術シンボル
   * @param {BattleSymbol|Object} enemySymbol - 敵の戦術シンボル
   * @returns {Object} 戦術じゃんけんの結果
   * @returns {string} return.result - 勝敗結果 ('WIN', 'LOSE', 'DRAW')
   * @returns {boolean} return.guardBreak - ガードブレイク状態か (勝利時に敵に付与)
   * @returns {boolean} return.stunned - スタン状態か (勝利時に敵に付与)
   * @returns {number} return.attackBuff - 攻撃力バフ倍率 (勝利時 1.2, 通常 1.0, 敗北時 0.9)
   * @returns {number} return.defenseBuff - 防御力バフ倍率 (勝利時 1.1, 通常 1.0, 敗北時 0.0はガードブレイク)
   *
   * @example
   * const playerSymbol = { effect: { tactics: 'power' } };
   * const enemySymbol = { effect: { tactics: 'speed' } };
   * const result = BattleCalculator.resolveTactics(playerSymbol, enemySymbol);
   * // result.result === 'WIN', result.guardBreak === true
   */
  static resolveTactics(playerSymbol, enemySymbol) {
    // シンボルから戦術タイプを取得
    const playerTactics = this._getTacticsType(playerSymbol);
    const enemyTactics = this._getTacticsType(enemySymbol);

    // 同じ戦術の場合は引き分け
    if (playerTactics === enemyTactics) {
      return {
        result: this.TACTICS_RESULT.DRAW,
        guardBreak: false,
        stunned: false,
        attackBuff: 1.0,
        defenseBuff: 1.0
      };
    }

    // 勝敗判定: 剛 > 速 > 技 > 剛
    const isPlayerWin = this._checkTacticsWin(playerTactics, enemyTactics);

    if (isPlayerWin) {
      // プレイヤー勝利: 敵にデバフ付与、自分にバフ
      return {
        result: this.TACTICS_RESULT.WIN,
        guardBreak: true,   // 敵のガードブレイク
        stunned: false,      // スタンはオプション (実装により追加可能)
        attackBuff: 1.2,     // 攻撃力 +20%
        defenseBuff: 1.1     // 防御力 +10%
      };
    } else {
      // プレイヤー敗北: 自分にデバフ付与
      return {
        result: this.TACTICS_RESULT.LOSE,
        guardBreak: false,
        stunned: false,
        attackBuff: 0.9,     // 攻撃力 -10%
        defenseBuff: 0.0     // 防御無効 (ガードブレイク)
      };
    }
  }

  /**
   * シンボルから戦術タイプを取得する内部メソッド
   *
   * @private
   * @param {BattleSymbol|Object} symbol - シンボルオブジェクト
   * @returns {string} 戦術タイプ ('power', 'speed', 'skill')
   */
  static _getTacticsType(symbol) {
    if (!symbol || !symbol.effect || !symbol.effect.tactics) {
      // デフォルトは'skill'
      return this.TACTICS.SKILL;
    }
    return symbol.effect.tactics;
  }

  /**
   * 戦術じゃんけんの勝敗判定
   *
   * @private
   * @param {string} playerTactics - プレイヤーの戦術
   * @param {string} enemyTactics - 敵の戦術
   * @returns {boolean} プレイヤーが勝利した場合true
   */
  static _checkTacticsWin(playerTactics, enemyTactics) {
    const { POWER, SPEED, SKILL } = this.TACTICS;

    // 剛 > 速
    if (playerTactics === POWER && enemyTactics === SPEED) return true;
    // 速 > 技
    if (playerTactics === SPEED && enemyTactics === SKILL) return true;
    // 技 > 剛
    if (playerTactics === SKILL && enemyTactics === POWER) return true;

    return false;
  }

  /**
   * Phase 2 & 3: 属性相性と物理相性の倍率計算
   *
   * @param {BattleSymbol|Object} attackSymbol - 攻撃側のシンボル
   * @param {BattleItem|Object} defenseArmor - 防御側の防具データ
   * @returns {Object} 相性倍率
   * @returns {number} return.elementalMod - 属性相性倍率 (0.5, 1.0, 1.5)
   * @returns {number} return.physicsMod - 物理相性倍率 (0.8, 1.0, 1.2)
   *
   * @example
   * const attackSymbol = { element: 'fire', effect: { attackType: 'slash' } };
   * const defenseArmor = { tags: ['element_wind', 'armor_type_light'] };
   * const mods = BattleCalculator.resolveModifiers(attackSymbol, defenseArmor);
   * // mods.elementalMod === 1.5 (火 > 風)
   * // mods.physicsMod === 1.2 (斬撃 > 軽装)
   */
  static resolveModifiers(attackSymbol, defenseArmor) {
    const elementalMod = this._calculateElementalModifier(attackSymbol, defenseArmor);
    const physicsMod = this._calculatePhysicsModifier(attackSymbol, defenseArmor);

    return {
      elementalMod,
      physicsMod
    };
  }

  /**
   * 属性相性倍率の計算 (Phase 2)
   *
   * 関係: 火 > 風 > 地 > 水 > 火
   * 倍率:
   * - 有利 (Weak): x1.5
   * - 同属性 (Resist): x0.5
   * - その他: x1.0
   *
   * @private
   * @param {BattleSymbol|Object} attackSymbol - 攻撃シンボル
   * @param {BattleItem|Object} defenseArmor - 防具
   * @returns {number} 属性相性倍率
   */
  static _calculateElementalModifier(attackSymbol, defenseArmor) {
    const attackElement = this._getElement(attackSymbol);
    const defenseElement = this._getArmorElement(defenseArmor);

    // 無属性の場合は等倍
    if (attackElement === this.ELEMENTS.NONE || defenseElement === this.ELEMENTS.NONE) {
      return 1.0;
    }

    // 同属性の場合は軽減
    if (attackElement === defenseElement) {
      return 0.5;
    }

    // 有利属性の判定: 火 > 風 > 地 > 水 > 火
    if (this._checkElementalAdvantage(attackElement, defenseElement)) {
      return 1.5;
    }

    // それ以外は等倍
    return 1.0;
  }

  /**
   * シンボルから属性を取得
   *
   * @private
   * @param {BattleSymbol|Object} symbol - シンボル
   * @returns {string} 属性
   */
  static _getElement(symbol) {
    if (!symbol || !symbol.element) {
      return this.ELEMENTS.NONE;
    }
    return symbol.element;
  }

  /**
   * 防具から属性を取得 (タグから判定)
   *
   * @private
   * @param {BattleItem|Object} armor - 防具
   * @returns {string} 属性
   */
  static _getArmorElement(armor) {
    if (!armor || !armor.tags || !Array.isArray(armor.tags)) {
      return this.ELEMENTS.NONE;
    }

    // タグから element_xxx を検索
    const elementTag = armor.tags.find(tag => tag.startsWith('element_'));
    if (!elementTag) {
      return this.ELEMENTS.NONE;
    }

    // element_fire → fire
    return elementTag.replace('element_', '');
  }

  /**
   * 属性の有利判定
   *
   * @private
   * @param {string} attackElement - 攻撃属性
   * @param {string} defenseElement - 防御属性
   * @returns {boolean} 攻撃属性が有利な場合true
   */
  static _checkElementalAdvantage(attackElement, defenseElement) {
    const { FIRE, WIND, EARTH, WATER } = this.ELEMENTS;

    // 火 > 風
    if (attackElement === FIRE && defenseElement === WIND) return true;
    // 風 > 地
    if (attackElement === WIND && defenseElement === EARTH) return true;
    // 地 > 水
    if (attackElement === EARTH && defenseElement === WATER) return true;
    // 水 > 火
    if (attackElement === WATER && defenseElement === FIRE) return true;

    return false;
  }

  /**
   * 物理相性倍率の計算 (Phase 3)
   *
   * 攻撃タイプと防具タイプの相性表:
   * - 🗡️ 斬撃: 軽装に有利(x1.2)、重装に不利(x0.8)
   * - 🔨 打撃: 重装に有利(x1.2)、中装に不利(x0.8)
   * - 🔫 銃撃: 中装に有利(x1.2)、軽装に不利(x0.8)
   * - 🪄 魔法: 重装に有利(x1.2)、魔法耐性に不利(x0.8)
   *
   * @private
   * @param {BattleSymbol|Object} attackSymbol - 攻撃シンボル
   * @param {BattleItem|Object} defenseArmor - 防具
   * @returns {number} 物理相性倍率
   */
  static _calculatePhysicsModifier(attackSymbol, defenseArmor) {
    const attackType = this._getAttackType(attackSymbol);
    const armorType = this._getArmorType(defenseArmor);

    // 攻撃タイプごとの相性判定
    switch (attackType) {
      case this.ATTACK_TYPES.SLASH:
        // 斬撃: 軽装に有利、重装に不利
        if (armorType === this.ARMOR_TYPES.LIGHT) return 1.2;
        if (armorType === this.ARMOR_TYPES.HEAVY) return 0.8;
        break;

      case this.ATTACK_TYPES.STRIKE:
        // 打撃: 重装に有利、中装に不利
        if (armorType === this.ARMOR_TYPES.HEAVY) return 1.2;
        if (armorType === this.ARMOR_TYPES.MEDIUM) return 0.8;
        break;

      case this.ATTACK_TYPES.SHOT:
        // 銃撃: 中装に有利、軽装に不利
        if (armorType === this.ARMOR_TYPES.MEDIUM) return 1.2;
        if (armorType === this.ARMOR_TYPES.LIGHT) return 0.8;
        break;

      case this.ATTACK_TYPES.MAGIC:
        // 魔法: 重装に有利、魔法耐性防具に不利
        if (armorType === this.ARMOR_TYPES.HEAVY) return 1.2;
        // 魔法耐性はタグで判定
        if (defenseArmor && defenseArmor.tags && defenseArmor.tags.includes('magic_resist')) {
          return 0.8;
        }
        break;
    }

    return 1.0;
  }

  /**
   * シンボルから攻撃タイプを取得
   *
   * @private
   * @param {BattleSymbol|Object} symbol - シンボル
   * @returns {string} 攻撃タイプ
   */
  static _getAttackType(symbol) {
    if (!symbol || !symbol.effect || !symbol.effect.attackType) {
      // デフォルトは斬撃
      return this.ATTACK_TYPES.SLASH;
    }
    return symbol.effect.attackType;
  }

  /**
   * 防具から防具タイプを取得 (タグから判定)
   *
   * @private
   * @param {BattleItem|Object} armor - 防具
   * @returns {string} 防具タイプ
   */
  static _getArmorType(armor) {
    if (!armor || !armor.tags || !Array.isArray(armor.tags)) {
      return this.ARMOR_TYPES.MEDIUM;
    }

    // タグから armor_type_xxx を検索
    if (armor.tags.includes('armor_type_light')) return this.ARMOR_TYPES.LIGHT;
    if (armor.tags.includes('armor_type_medium')) return this.ARMOR_TYPES.MEDIUM;
    if (armor.tags.includes('armor_type_heavy')) return this.ARMOR_TYPES.HEAVY;

    return this.ARMOR_TYPES.MEDIUM;
  }

  /**
   * 最終ダメージ計算
   *
   * 仕様書の「3. ダメージ計算式」を実装:
   * FinalDamage =
   *   (BasePower * AttackBuff)      // 基礎威力 x バフ
   *   - (Defense * GuardMod)        // 防御力 (ガード成功時のみ適用)
   *   * ElementalMod                // 属性倍率 (0.5 ~ 1.5)
   *   * PhysicsMod                  // 物理相性 (0.8 ~ 1.2)
   *   * CriticalMod;                // クリティカル (1.5 or 1.0)
   *
   * @param {Object} attacker - 攻撃側のデータ
   * @param {BattleSymbol|Object} attacker.symbol - 攻撃シンボル
   * @param {number} attacker.basePower - 基礎攻撃力
   * @param {number} [attacker.criticalRate=0] - クリティカル率 (0.0 ~ 1.0)
   * @param {Object} defender - 防御側のデータ
   * @param {BattleItem|Object} defender.armor - 防具
   * @param {number} defender.defense - 防御力
   * @param {BattleSymbol|Object} defender.tacticsSymbol - 戦術シンボル (Phase 1用)
   * @param {Object} battleState - 戦闘状態
   * @param {string} battleState.tacticsResult - 戦術じゃんけんの結果 ('WIN', 'LOSE', 'DRAW')
   * @param {boolean} [battleState.guardBreak=false] - ガードブレイク状態か
   * @param {number} [battleState.attackBuff=1.0] - 攻撃バフ倍率
   * @param {number} [battleState.defenseBuff=1.0] - 防御バフ倍率
   * @returns {Object} ダメージ計算結果
   * @returns {number} return.finalDamage - 最終ダメージ
   * @returns {boolean} return.isCritical - クリティカルヒットしたか
   * @returns {number} return.elementalMod - 属性倍率
   * @returns {number} return.physicsMod - 物理相性倍率
   * @returns {Object} return.breakdown - 計算内訳 (デバッグ用)
   *
   * @example
   * const attacker = {
   *   symbol: new BattleSymbol({ id: 'slash', type: 'physics', element: 'fire', power: 100 }),
   *   basePower: 150,
   *   criticalRate: 0.2
   * };
   * const defender = {
   *   armor: defenseArmor,
   *   defense: 50,
   *   tacticsSymbol: enemyTacticsSymbol
   * };
   * const battleState = {
   *   tacticsResult: 'WIN',
   *   guardBreak: true,
   *   attackBuff: 1.2,
   *   defenseBuff: 0.0
   * };
   * const result = BattleCalculator.calculateDamage(attacker, defender, battleState);
   */
  static calculateDamage(attacker, defender, battleState) {
    // Phase 2 & 3: 属性・物理相性の取得
    const modifiers = this.resolveModifiers(attacker.symbol, defender.armor);

    // 基礎威力
    const basePower = attacker.basePower || 0;
    const symbolPower = (attacker.symbol && attacker.symbol.power) || 0;
    const totalBasePower = basePower + symbolPower;

    // 攻撃バフ適用
    const attackBuff = battleState.attackBuff || 1.0;
    const buffedPower = totalBasePower * attackBuff;

    // 防御力計算
    let defense = defender.defense || 0;
    const defenseBuff = battleState.defenseBuff !== undefined ? battleState.defenseBuff : 1.0;

    // ガードブレイク時は防御力を0にする
    if (battleState.guardBreak || defenseBuff === 0.0) {
      defense = 0;
    } else {
      defense = defense * defenseBuff;
    }

    // クリティカル判定
    const criticalRate = attacker.criticalRate || 0;
    const isCritical = Math.random() < criticalRate;
    const criticalMod = isCritical ? 1.5 : 1.0;

    // 最終ダメージ計算
    let finalDamage = (buffedPower - defense) * modifiers.elementalMod * modifiers.physicsMod * criticalMod;

    // ダメージは最低1
    if (finalDamage < 1) {
      finalDamage = 1;
    }

    // 計算結果を返す
    return {
      finalDamage: Math.floor(finalDamage),
      isCritical,
      elementalMod: modifiers.elementalMod,
      physicsMod: modifiers.physicsMod,
      breakdown: {
        basePower: totalBasePower,
        attackBuff,
        buffedPower,
        defense,
        defenseBuff,
        criticalMod,
        elementalMod: modifiers.elementalMod,
        physicsMod: modifiers.physicsMod
      }
    };
  }
}

// Node.js環境でのエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BattleCalculator;
}
