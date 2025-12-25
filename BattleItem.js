/**
 * BattleItem クラス
 *
 * バトルで使用される装備アイテム（武器、船など）を表すクラス。
 * PlayFabのカタログJSONからデータをロードし、スロットとシンボルの管理を行う。
 *
 * @class
 * @property {string} itemId - アイテムの一意なID
 * @property {string} itemClass - アイテムのクラス（例: 'Weapon', 'Ship'）
 * @property {Array<string>} tags - アイテムのタグ配列（武器種、種族、クラスなど）
 * @property {Array<BattleSlot>} slots - スロットの配列
 *
 * @example
 * const item = BattleItem.fromPlayFabJson({
 *   ItemId: 'sword_001',
 *   ItemClass: 'Weapon',
 *   Tags: ['weapon', 'wep_type_sword', 'human'],
 *   CustomData: '{"slots":[{"index":0,"type":"fixed","symbolId":"slash"}]}'
 * });
 */
class BattleItem {
  /**
   * BattleItemのコンストラクタ
   *
   * @param {Object} config - アイテムの設定オブジェクト
   * @param {string} config.itemId - アイテムID
   * @param {string} config.itemClass - アイテムクラス
   * @param {Array<string>} config.tags - タグ配列
   * @param {Array<BattleSlot>} config.slots - スロット配列
   */
  constructor({ itemId, itemClass, tags = [], slots = [] }) {
    if (!itemId) {
      throw new Error('BattleItem: itemId is required');
    }

    /**
     * @type {string}
     */
    this.itemId = itemId;

    /**
     * @type {string}
     */
    this.itemClass = itemClass || 'Unknown';

    /**
     * @type {Array<string>}
     */
    this.tags = tags;

    /**
     * @type {Array<BattleSlot>}
     */
    this.slots = slots;
  }

  /**
   * PlayFabのカタログJSON形式からBattleItemインスタンスを生成する静的メソッド
   *
   * PlayFabのCustomDataフィールドには、スロット定義がJSON文字列として格納されている想定。
   * CustomDataのフォーマット例:
   * {
   *   "slots": [
   *     {"index": 0, "type": "fixed", "symbolId": "slash"},
   *     {"index": 1, "type": "open"},
   *     {"index": 2, "type": "penalty", "symbolId": "slow"}
   *   ]
   * }
   *
   * @param {Object} json - PlayFabカタログアイテムのJSONオブジェクト
   * @param {string} json.ItemId - アイテムID
   * @param {string} json.ItemClass - アイテムクラス
   * @param {Array<string>} json.Tags - タグ配列
   * @param {string} [json.CustomData] - カスタムデータ（JSON文字列）
   * @param {Object} [symbolRegistry={}] - シンボルIDからBattleSymbolへのマップ（シンボル解決用）
   * @returns {BattleItem} 生成されたBattleItemインスタンス
   *
   * @example
   * const symbolRegistry = {
   *   'slash': new BattleSymbol({ id: 'slash', type: 'physics', element: 'none', power: 100 })
   * };
   * const item = BattleItem.fromPlayFabJson(playfabJson, symbolRegistry);
   */
  static fromPlayFabJson(json, symbolRegistry = {}) {
    const itemId = json.ItemId;
    const itemClass = json.ItemClass;
    const tags = json.Tags || [];

    let slots = [];

    // CustomDataをパースしてスロット情報を取得
    if (json.CustomData) {
      try {
        const customData = JSON.parse(json.CustomData);

        if (customData.slots && Array.isArray(customData.slots)) {
          slots = customData.slots.map(slotData => {
            const symbol = slotData.symbolId && symbolRegistry[slotData.symbolId]
              ? symbolRegistry[slotData.symbolId]
              : null;

            return new BattleSlot({
              index: slotData.index,
              type: slotData.type,
              symbol: symbol
            });
          });
        }
      } catch (e) {
        console.warn(`BattleItem.fromPlayFabJson: Failed to parse CustomData for ${itemId}`, e);
      }
    }

    return new BattleItem({
      itemId,
      itemClass,
      tags,
      slots
    });
  }

  /**
   * 指定されたシンボルがこのアイテムに装着可能かどうかを判定
   *
   * 装着制限ルール（バトル判定ロジック詳細仕様書 v12.0 準拠）:
   * 1. 物理系シンボル (type === 'physics') の場合:
   *    - アイテムのTagsに含まれる武器種タグ (wep_type_xxx) とシンボルの要求武器種が一致する必要がある
   *    - シンボルに weaponTypes プロパティがある場合、そのいずれかがアイテムのタグに含まれていること
   * 2. 魔法系シンボル (type === 'magic') の場合:
   *    - 武器種制限なし（すべてのアイテムに装着可能）
   * 3. パッシブ系シンボル (type === 'passive') の場合:
   *    - 武器種制限なし（すべてのアイテムに装着可能）
   *
   * @param {BattleSymbol} symbol - 装着可能かチェックするシンボル
   * @returns {boolean} 装着可能な場合true
   *
   * @example
   * const sword = new BattleItem({
   *   itemId: 'sword_001',
   *   tags: ['weapon', 'wep_type_sword']
   * });
   * const slashSymbol = new BattleSymbol({
   *   id: 'slash',
   *   type: 'physics',
   *   effect: { weaponTypes: ['wep_type_sword'] }
   * });
   * console.log(sword.canEquipSymbol(slashSymbol)); // true
   */
  canEquipSymbol(symbol) {
    if (!symbol) {
      return false;
    }

    // 魔法系とパッシブ系は武器種制限なし
    if (symbol.isMagic() || symbol.isPassive()) {
      return true;
    }

    // 物理系シンボルの場合、武器種チェック
    if (symbol.isPhysics()) {
      // シンボルのeffectにweaponTypesが定義されている場合
      if (symbol.effect && Array.isArray(symbol.effect.weaponTypes)) {
        const requiredTypes = symbol.effect.weaponTypes;

        // アイテムのタグに、いずれかの要求武器種が含まれているかチェック
        return requiredTypes.some(weaponType => this.tags.includes(weaponType));
      }

      // weaponTypesが定義されていない場合は、武器種制限なしとして扱う
      return true;
    }

    // その他の場合は装着不可
    return false;
  }

  /**
   * アイテムのタグに特定のタグが含まれているかチェック
   *
   * @param {string} tag - チェックするタグ
   * @returns {boolean} タグが含まれている場合true
   */
  hasTag(tag) {
    return this.tags.includes(tag);
  }

  /**
   * 武器種タグを取得
   *
   * @returns {Array<string>} 武器種タグの配列（wep_type_xxxの形式）
   */
  getWeaponTypes() {
    return this.tags.filter(tag => tag.startsWith('wep_type_'));
  }

  /**
   * 指定されたインデックスのスロットを取得
   *
   * @param {number} index - スロットのインデックス
   * @returns {BattleSlot|null} スロット（存在しない場合null）
   */
  getSlot(index) {
    return this.slots.find(slot => slot.index === index) || null;
  }

  /**
   * すべてのオープンスロットを取得
   *
   * @returns {Array<BattleSlot>} オープンスロットの配列
   */
  getOpenSlots() {
    return this.slots.filter(slot => slot.isOpen());
  }

  /**
   * すべての固定スロットを取得
   *
   * @returns {Array<BattleSlot>} 固定スロットの配列
   */
  getFixedSlots() {
    return this.slots.filter(slot => slot.isFixed());
  }

  /**
   * すべてのペナルティスロットを取得
   *
   * @returns {Array<BattleSlot>} ペナルティスロットの配列
   */
  getPenaltySlots() {
    return this.slots.filter(slot => slot.isPenalty());
  }

  /**
   * アイテムの情報を文字列で返す
   *
   * @returns {string} アイテム情報
   */
  toString() {
    return `BattleItem[${this.itemId}](class:${this.itemClass}, tags:${this.tags.join(',')}, slots:${this.slots.length})`;
  }

  /**
   * アイテムのクローンを作成
   *
   * @returns {BattleItem} 新しいBattleItemインスタンス
   */
  clone() {
    return new BattleItem({
      itemId: this.itemId,
      itemClass: this.itemClass,
      tags: [...this.tags],
      slots: this.slots.map(slot => slot.clone())
    });
  }
}

// Node.js環境でのエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BattleItem;
}
