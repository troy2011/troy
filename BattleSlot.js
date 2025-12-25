/**
 * BattleSlot クラス
 *
 * 装備アイテムの各スロットの状態を管理するクラス。
 * スロットタイプには以下の3種類がある:
 * - fixed: 固定スロット（初期シンボルがセット済み、変更不可）
 * - open: オープンスロット（自由にシンボルをセット可能）
 * - penalty: ペナルティスロット（マイナス効果のシンボルが固定）
 *
 * @class
 * @property {number} index - スロットのインデックス番号（0始まり）
 * @property {string} type - スロットのタイプ ('fixed', 'open', 'penalty')
 * @property {BattleSymbol|null} symbol - セットされているシンボル（未セットの場合null）
 *
 * @example
 * const slot = new BattleSlot({
 *   index: 0,
 *   type: 'fixed',
 *   symbol: new BattleSymbol({ id: 'slash', type: 'physics', element: 'none', power: 100 })
 * });
 */
class BattleSlot {
  /**
   * BattleSlotのコンストラクタ
   *
   * @param {Object} config - スロットの設定オブジェクト
   * @param {number} config.index - スロットのインデックス番号
   * @param {string} config.type - スロットのタイプ ('fixed', 'open', 'penalty')
   * @param {BattleSymbol|null} [config.symbol=null] - セットされているシンボル
   * @throws {Error} 必須パラメータが欠けている場合や、不正な値が指定された場合
   */
  constructor({ index, type, symbol = null }) {
    if (typeof index !== 'number' || index < 0) {
      throw new Error('BattleSlot: index must be a non-negative number');
    }
    if (!['fixed', 'open', 'penalty'].includes(type)) {
      throw new Error(`BattleSlot: invalid type "${type}". Must be fixed, open, or penalty`);
    }

    /**
     * @type {number}
     */
    this.index = index;

    /**
     * @type {string}
     */
    this.type = type;

    /**
     * @type {BattleSymbol|null}
     */
    this.symbol = symbol;
  }

  /**
   * スロットが固定スロットかどうかを判定
   *
   * @returns {boolean} 固定スロットの場合true
   */
  isFixed() {
    return this.type === 'fixed';
  }

  /**
   * スロットがオープンスロットかどうかを判定
   *
   * @returns {boolean} オープンスロットの場合true
   */
  isOpen() {
    return this.type === 'open';
  }

  /**
   * スロットがペナルティスロットかどうかを判定
   *
   * @returns {boolean} ペナルティスロットの場合true
   */
  isPenalty() {
    return this.type === 'penalty';
  }

  /**
   * スロットが空かどうかを判定
   *
   * @returns {boolean} シンボルがセットされていない場合true
   */
  isEmpty() {
    return this.symbol === null;
  }

  /**
   * スロットにシンボルをセット
   * 固定スロットとペナルティスロットには上書きできない
   *
   * @param {BattleSymbol} symbol - セットするシンボル
   * @returns {boolean} セットに成功した場合true
   * @throws {Error} 固定スロットまたはペナルティスロットに上書きしようとした場合
   */
  setSymbol(symbol) {
    if (this.isFixed()) {
      throw new Error('BattleSlot: cannot modify fixed slot');
    }
    if (this.isPenalty()) {
      throw new Error('BattleSlot: cannot modify penalty slot');
    }

    this.symbol = symbol;
    return true;
  }

  /**
   * スロットのシンボルをクリア
   * オープンスロットのみクリア可能
   *
   * @returns {boolean} クリアに成功した場合true
   * @throws {Error} 固定スロットまたはペナルティスロットをクリアしようとした場合
   */
  clearSymbol() {
    if (this.isFixed()) {
      throw new Error('BattleSlot: cannot clear fixed slot');
    }
    if (this.isPenalty()) {
      throw new Error('BattleSlot: cannot clear penalty slot');
    }

    this.symbol = null;
    return true;
  }

  /**
   * スロットの情報を文字列で返す
   *
   * @returns {string} スロット情報
   */
  toString() {
    const symbolInfo = this.symbol ? this.symbol.toString() : 'empty';
    return `BattleSlot[${this.index}](type:${this.type}, symbol:${symbolInfo})`;
  }

  /**
   * スロットのクローンを作成
   *
   * @returns {BattleSlot} 新しいBattleSlotインスタンス
   */
  clone() {
    return new BattleSlot({
      index: this.index,
      type: this.type,
      symbol: this.symbol ? this.symbol.clone() : null
    });
  }
}

// Node.js環境でのエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BattleSlot;
}
