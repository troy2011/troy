/**
 * BattleSymbol クラス
 *
 * 装備のスロットにセットされる「技」や「効果」を表すクラス。
 * バトルシンボルは物理技、魔法技、パッシブ効果の3種類に分類される。
 *
 * @class
 * @property {string} id - シンボルの一意なID
 * @property {string} type - シンボルのタイプ ('physics', 'magic', 'passive')
 * @property {string} element - 属性 (例: 'fire', 'water', 'earth', 'wind', 'light', 'dark', 'none')
 * @property {number} power - シンボルの威力値
 * @property {Object} effect - シンボルの効果定義オブジェクト
 *
 * @example
 * const symbol = new BattleSymbol({
 *   id: 'slash_fire',
 *   type: 'physics',
 *   element: 'fire',
 *   power: 120,
 *   effect: { damageMultiplier: 1.2, burnChance: 0.3 }
 * });
 */
class BattleSymbol {
  /**
   * BattleSymbolのコンストラクタ
   *
   * @param {Object} config - シンボルの設定オブジェクト
   * @param {string} config.id - シンボルの一意なID
   * @param {string} config.type - シンボルのタイプ ('physics', 'magic', 'passive')
   * @param {string} config.element - 属性
   * @param {number} config.power - 威力値
   * @param {Object} config.effect - 効果定義オブジェクト
   * @throws {Error} 必須パラメータが欠けている場合
   */
  constructor({ id, type, element, power, effect }) {
    if (!id) {
      throw new Error('BattleSymbol: id is required');
    }
    if (!['physics', 'magic', 'passive'].includes(type)) {
      throw new Error(`BattleSymbol: invalid type "${type}". Must be physics, magic, or passive`);
    }

    /**
     * @type {string}
     */
    this.id = id;

    /**
     * @type {string}
     */
    this.type = type;

    /**
     * @type {string}
     */
    this.element = element || 'none';

    /**
     * @type {number}
     */
    this.power = power || 0;

    /**
     * @type {Object}
     */
    this.effect = effect || {};
  }

  /**
   * シンボルが物理系かどうかを判定
   *
   * @returns {boolean} 物理系の場合true
   */
  isPhysics() {
    return this.type === 'physics';
  }

  /**
   * シンボルが魔法系かどうかを判定
   *
   * @returns {boolean} 魔法系の場合true
   */
  isMagic() {
    return this.type === 'magic';
  }

  /**
   * シンボルがパッシブ系かどうかを判定
   *
   * @returns {boolean} パッシブ系の場合true
   */
  isPassive() {
    return this.type === 'passive';
  }

  /**
   * シンボルの情報を文字列で返す
   *
   * @returns {string} シンボル情報
   */
  toString() {
    return `BattleSymbol[${this.id}](type:${this.type}, element:${this.element}, power:${this.power})`;
  }

  /**
   * シンボルのクローンを作成
   *
   * @returns {BattleSymbol} 新しいBattleSymbolインスタンス
   */
  clone() {
    return new BattleSymbol({
      id: this.id,
      type: this.type,
      element: this.element,
      power: this.power,
      effect: JSON.parse(JSON.stringify(this.effect))
    });
  }
}

// Node.js環境でのエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BattleSymbol;
}
