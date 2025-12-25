# 汎用エフェクトプロセッサー (Effect Processor)

PlayFab CloudScript用のデータ駆動型エフェクト処理エンジンです。

## 概要

このシステムは、スキル、建物、アイテムなどの多様な効果を統一的に処理するためのエンジンです。個別の効果ごとにハードコーディングする代わりに、PlayFabのカタログ（CustomData）に定義されたJSONデータから効果を動的に実行します。

## 主な特徴

- **データ駆動型**: ロジックとデータを分離し、カタログ編集だけで新しい効果を追加可能
- **トリガーベース**: ON_ACTIVATE、ON_HIT、ON_TURN_STARTなど、様々なタイミングで効果発動
- **拡張性**: 新しい効果タイプを簡単に追加できる設計
- **コンテキスト対応**: 攻撃側・防御側のステータスを参照した計算が可能

## エフェクトタイプ一覧

### 戦闘系エフェクト

| コード | 説明 | パラメータ例 |
|-------|------|------------|
| `DAMAGE_PHYSICS` | 物理ダメージ | `{ power: 100, element: "fire", critRate: 0.2 }` |
| `DAMAGE_MAGIC` | 魔法ダメージ | `{ power: 150, element: "ice" }` |
| `HEAL` | HP回復 | `{ amount: 200 }` |
| `BUFF_STAT` | ステータス強化 | `{ stat: "atk", value: 30, duration: 5, isPercent: true }` |
| `DEBUFF_STAT` | ステータス弱体化 | `{ stat: "def", value: 20, duration: 3 }` |
| `APPLY_STATUS` | 状態異常付与 | `{ id: "burn", chance: 0.3, duration: 3 }` |

### 経済系エフェクト

| コード | 説明 | パラメータ例 |
|-------|------|------------|
| `ECONOMY_GENERATE` | 資源生産 | `{ resource: "gold", amount: 100, interval: 3600 }` |
| `ECONOMY_CONSUME` | 資源消費 | `{ resource: "wood", amount: 50 }` |
| `ECONOMY_BONUS` | 資源ボーナス | `{ resource: "gold", multiplier: 1.5, duration: 3600 }` |

### 特殊効果

| コード | 説明 | パラメータ例 |
|-------|------|------------|
| `SUMMON_UNIT` | ユニット召喚 | `{ unitId: "skeleton", count: 3, duration: 60 }` |
| `TELEPORT` | テレポート | `{ x: 100, y: 200 }` |
| `SHIELD` | シールド付与 | `{ amount: 200, duration: 5 }` |

## トリガータイプ一覧

| トリガー | 説明 | 使用例 |
|---------|------|--------|
| `ON_ACTIVATE` | スキル/建物使用時 | スキル発動時のダメージ |
| `ON_HIT` | 命中時 | 追加効果（状態異常など） |
| `ON_KILL` | 敵撃破時 | 撃破ボーナス |
| `ON_DAMAGED` | ダメージ受けた時 | カウンター攻撃 |
| `ON_TURN_START` | ターン開始時 | 毒ダメージ、継続回復 |
| `ON_TURN_END` | ターン終了時 | バフ・デバフの更新 |
| `ON_DEATH` | 死亡時 | 爆発、復活 |
| `PASSIVE` | 常時発動 | 建物の資源生産 |

## カタログデータ形式

PlayFabのカタログアイテムのCustomDataに以下の形式でエフェクトを定義します。

```json
{
  "effects": [
    {
      "code": "DAMAGE_PHYSICS",
      "params": {
        "power": 150,
        "element": "fire",
        "critRate": 0.2,
        "armorPenetration": 10
      },
      "trigger": "ON_ACTIVATE"
    },
    {
      "code": "APPLY_STATUS",
      "params": {
        "id": "burn",
        "chance": 0.4,
        "duration": 3
      },
      "trigger": "ON_HIT"
    }
  ]
}
```

## 使用例

### 1. 基本的なスキル使用

```javascript
// EffectProcessorのインスタンス作成
const processor = new EffectProcessor();

// スキルデータ（カタログから取得）
const skillEffects = [
  {
    code: "DAMAGE_PHYSICS",
    params: { power: 120, element: "lightning" },
    trigger: "ON_ACTIVATE"
  }
];

// 戦闘コンテキスト
const context = {
  attacker: {
    id: "player_001",
    atk: 100,
    hp: 500,
    maxHp: 500
  },
  defender: {
    id: "enemy_001",
    hp: 800,
    def: 30
  }
};

// エフェクト実行
const result = processor.process(skillEffects, context, "ON_ACTIVATE");

console.log(result.totalDamage); // 合計ダメージ
console.log(result.logs); // 実行ログ
```

### 2. 建物の資源生産

```javascript
const buildingEffects = [
  {
    code: "ECONOMY_GENERATE",
    params: {
      resource: "gold",
      amount: 100,
      interval: 3600
    },
    trigger: "PASSIVE"
  }
];

const context = {
  player: {
    id: "player_001",
    resources: { gold: 500 }
  }
};

const result = processor.process(buildingEffects, context, "PASSIVE");
console.log(context.player.resources.gold); // 600
```

### 3. 複合効果スキル（ダメージ + 回復）

```javascript
const vampireSkillEffects = [
  {
    code: "DAMAGE_PHYSICS",
    params: { power: 100 },
    trigger: "ON_ACTIVATE"
  },
  {
    code: "HEAL",
    params: { amount: 50 },
    trigger: "ON_HIT"
  }
];

// ON_ACTIVATE時
const damageResult = processor.process(vampireSkillEffects, context, "ON_ACTIVATE");

// ON_HIT時（命中したら回復）
const healResult = processor.process(vampireSkillEffects, context, "ON_HIT");
```

### 4. PlayFab CloudScriptでの実装例

```javascript
handlers.UseSkill = function(args, context) {
  const playFabId = currentPlayerId;
  const skillId = args.skillId;

  // カタログからスキルデータを取得
  const catalogResult = server.GetCatalogItems({
    CatalogVersion: "skills_catalog",
    ItemIds: [skillId]
  });

  if (!catalogResult.Catalog || catalogResult.Catalog.length === 0) {
    return { error: "スキルが見つかりません" };
  }

  const skillData = catalogResult.Catalog[0];
  const customData = JSON.parse(skillData.CustomData || "{}");
  const effects = customData.effects || [];

  // 戦闘コンテキストの構築
  const battleContext = {
    attacker: {
      id: playFabId,
      atk: 100,
      hp: 500
    },
    defender: {
      id: args.targetId,
      hp: 800,
      def: 30
    }
  };

  // エフェクト処理
  const processor = new EffectProcessor();
  const result = processor.process(effects, battleContext, "ON_ACTIVATE");

  return {
    success: true,
    effectResult: result,
    battleContext: battleContext
  };
};
```

## カタログ設定例

### 攻撃スキル: ファイアーソード

```json
{
  "ItemId": "skill_fire_sword",
  "DisplayName": "ファイアーソード",
  "Description": "炎を纏った剣で斬りつけ、確率で火傷を付与する",
  "CustomData": "{\"effects\":[{\"code\":\"DAMAGE_PHYSICS\",\"params\":{\"power\":150,\"element\":\"fire\",\"critRate\":0.15},\"trigger\":\"ON_ACTIVATE\"},{\"code\":\"APPLY_STATUS\",\"params\":{\"id\":\"burn\",\"chance\":0.3,\"duration\":3},\"trigger\":\"ON_HIT\"}]}"
}
```

### 回復スキル: グレートヒール

```json
{
  "ItemId": "skill_great_heal",
  "DisplayName": "グレートヒール",
  "Description": "大量のHPを回復する",
  "CustomData": "{\"effects\":[{\"code\":\"HEAL\",\"params\":{\"amount\":300},\"trigger\":\"ON_ACTIVATE\"}]}"
}
```

### 建物: 金鉱

```json
{
  "ItemId": "building_gold_mine",
  "DisplayName": "金鉱",
  "Description": "1時間ごとに金を100生産する",
  "CustomData": "{\"effects\":[{\"code\":\"ECONOMY_GENERATE\",\"params\":{\"resource\":\"gold\",\"amount\":100,\"interval\":3600},\"trigger\":\"PASSIVE\"}]}"
}
```

### バフスキル: 戦士の雄叫び

```json
{
  "ItemId": "skill_warrior_cry",
  "DisplayName": "戦士の雄叫び",
  "Description": "味方全体の攻撃力を30%上昇させる",
  "CustomData": "{\"effects\":[{\"code\":\"BUFF_STAT\",\"params\":{\"stat\":\"atk\",\"value\":30,\"duration\":5,\"isPercent\":true},\"trigger\":\"ON_ACTIVATE\"}]}"
}
```

## 拡張方法

新しいエフェクトタイプを追加する場合:

1. **EffectType定数に追加**
```javascript
const EffectType = {
  // 既存の定義...
  YOUR_NEW_EFFECT: "YOUR_NEW_EFFECT",
};
```

2. **ハンドラ関数を実装**
```javascript
_handleYourNewEffect(params, context) {
  // 処理ロジック
  return {
    // 結果
  };
}
```

3. **コンストラクタにマッピング追加**
```javascript
this.handlers = {
  // 既存のマッピング...
  [EffectType.YOUR_NEW_EFFECT]: this._handleYourNewEffect.bind(this),
};
```

## テスト

PlayFab CloudScriptエディタで以下を実行:

```javascript
handlers.TestEffectProcessor = function(args, context) {
  const processor = new EffectProcessor();

  // テストコード
  const testEffects = [
    {
      code: "DAMAGE_PHYSICS",
      params: { power: 100 },
      trigger: "ON_ACTIVATE"
    }
  ];

  const testContext = {
    attacker: { atk: 100 },
    defender: { hp: 500, def: 20 }
  };

  const result = processor.process(testEffects, testContext, "ON_ACTIVATE");

  return result;
};
```

## 注意事項

- **パフォーマンス**: 大量のエフェクトを一度に処理する場合は、処理時間に注意してください
- **データ検証**: カタログデータは信頼できるソースから取得することを推奨します
- **エラーハンドリング**: 本番環境では適切なエラーハンドリングを実装してください
- **ログ**: `enableLogging`フラグでログ出力を制御できます

## ライセンス

プロジェクト内での自由な使用・改変が可能です。
