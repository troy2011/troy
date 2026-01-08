# 島占領・建設システム 実装ドキュメント

## 概要

無人島の占領から建設までのプロセスを「アクション（占領）」と「シミュレーション（建設）」の2段階に分け、LINE LIFFの縦画面スマホUIに最適化したシステムです。

---

## 1. システムの全体フロー

### プレイヤーの思考フロー
```
発見 → 「お、あそこに中サイズの岩山があるぞ！」
　↓
接近 → 船を島に近づける
　↓
調査 → 「未開の島（中サイズ、岩山バイオーム）」という情報が出る
　↓
戦闘 → 「占領」ボタンを押すと、守護獣（巨大カニやスケルトン）とのバトル発生
　↓
占領 → 勝利すると島の中央に「プレイヤーの旗」が立つ
　↓
計画 → 「岩山ボーナスがあるから、沿岸砲2つにして要塞化しよう」
　↓
建設 → 建設メニューから施設を選択して建設開始
　↓
完成 → 時間が経過すると建物が完成
```

---

## 2. データ構造

### 島データ（Firestore: `islands` コレクション）

```javascript
{
  id: "random_001",
  type: "barren", // barren（無人島）, resource（資源島）, capital（首都）, world_tree（世界樹）
  size: "medium", // small, medium, large, giant
  coordinate: { x: 250, y: 300 },
  name: "無人島001",
  faction: "neutral", // 初期状態は中立
  ownerRace: null,
  ownerId: null, // 占領後はプレイヤーのPlayFabId

  // 新規フィールド
  biome: "rocky", // rocky（岩山）, forest（森林）, beach（砂浜）, volcanic（火山）, jungle（ジャングル）
  buildingSlots: {
    layout: "1x2", // 1x1, 1x2, 2x2, 3x3
    slots: 2 // 建設可能なスロット数
  },
  guardian: {
    type: "crab_giant", // crab_giant, skeleton_warrior, sea_serpent, kraken
    defeated: false // 守護獣を倒したかどうか
  },
  occupationStatus: "wild", // wild（野生）, occupied（占領済み）, sacred（聖域）, capital（首都）

  buildings: [
    {
      buildingId: "watchtower",
      slotIndex: 0,
      status: "completed", // constructing（建設中）, completed（完成）
      startTime: 1234567890000,
      level: 1
    }
  ],

  lastUpdated: Timestamp
}
```

### 守護獣の定義（[server/data/mapDataGen.js:75-80](server/data/mapDataGen.js#L75-L80)）

```javascript
const guardianTypes = {
  'crab_giant': {
    name: '巨大カニ',
    hp: 100,
    attack: 15,
    defense: 20,
    difficulty: 'easy'
  },
  'skeleton_warrior': {
    name: 'スケルトン戦士',
    hp: 150,
    attack: 25,
    defense: 15,
    difficulty: 'medium'
  },
  'sea_serpent': {
    name: '海蛇',
    hp: 200,
    attack: 30,
    defense: 25,
    difficulty: 'hard'
  },
  'kraken': {
    name: 'クラーケン',
    hp: 300,
    attack: 40,
    defense: 30,
    difficulty: 'very_hard'
  }
};
```

### バイオームボーナス（[server/data/mapDataGen.js:66-72](server/data/mapDataGen.js#L66-L72)）

| バイオーム | 効果カテゴリ | ボーナス | 説明 |
|-----------|------------|---------|------|
| rocky（岩山） | military | +20% | 軍事施設の耐久度+20% |
| forest（森林） | economic | +20% | 経済施設の生産量+20% |
| beach（砂浜） | support | -50% | 補助施設の建設時間-50% |
| volcanic（火山） | military | +30% | 防衛施設の攻撃力+30% |
| jungle（ジャングル） | economic | +15% | 資源生産+15% |

### 施設データ（[server/data/buildingDefs.js](server/data/buildingDefs.js)）

施設は3つのカテゴリに分類されます：

#### 軍事施設（Military）
- **見張り台** (1スロット): 視界範囲+10、敵接近時通知
- **沿岸砲台** (1スロット): 防衛力+30、攻撃範囲5グリッド
- **要塞** (2スロット): 防衛力+100、駐屯兵+50
- **造船所** (4スロット): 船の建造が可能、同時建造3隻

#### 経済施設（Economic）
- **倉庫** (1スロット): 保管容量+1000、略奪保護50%
- **農園** (1スロット): 食料生産+50/時、士気+10
- **交易所** (2スロット): 交易収入+20%、交易ルート+2
- **鉱山** (2スロット): 石材+30/時、鉄鉱+20/時、金貨+10/時
- **大市場** (4スロット): 交易収入+50%、交易ルート+5

#### 補助施設（Support）
- **酒場** (1スロット): 乗組員募集可能、士気+15
- **修理ドック** (2スロット): 修理速度2.0倍、コスト-30%
- **灯台** (1スロット): 航海速度+20%、視界+10グリッド
- **神殿** (4スロット): 全能力+10%、HP回復2.0倍

---

## 3. サーバー側API

### 3.1 島への接近を検出

**エンドポイント**: `POST /api/detect-island-approach`

**リクエスト**:
```json
{
  "shipId": "ship_001"
}
```

**レスポンス**:
```json
{
  "success": true,
  "nearbyIslands": [
    {
      "id": "random_001",
      "name": "無人島001",
      "size": "medium",
      "biome": "rocky",
      "distance": 2.5,
      "occupationStatus": "wild",
      "guardian": {
        "type": "crab_giant",
        "defeated": false
      }
    }
  ],
  "shipPosition": { "x": 250, "y": 300 }
}
```

### 3.2 島の占領を開始

**エンドポイント**: `POST /api/start-island-occupation`

**リクエスト**:
```json
{
  "playFabId": "ABCD1234",
  "islandId": "random_001"
}
```

**レスポンス（守護獣戦闘が必要な場合）**:
```json
{
  "success": false,
  "requiresBattle": true,
  "guardian": {
    "name": "巨大カニ",
    "hp": 100,
    "attack": 15,
    "defense": 20,
    "difficulty": "easy",
    "type": "crab_giant"
  },
  "island": {
    "id": "random_001",
    "name": "無人島001",
    "size": "medium",
    "biome": "rocky"
  }
}
```

**レスポンス（即座に占領完了の場合）**:
```json
{
  "success": true,
  "requiresBattle": false,
  "island": {
    "id": "random_001",
    "name": "無人島001",
    "size": "medium",
    "biome": "rocky",
    "buildingSlots": {
      "layout": "1x2",
      "slots": 2
    }
  }
}
```

### 3.3 守護獣戦闘の結果を処理

**エンドポイント**: `POST /api/guardian-battle-result`

**リクエスト**:
```json
{
  "playFabId": "ABCD1234",
  "islandId": "random_001",
  "victory": true
}
```

**レスポンス（勝利）**:
```json
{
  "success": true,
  "result": "victory",
  "message": "無人島001を占領しました！旗が立ちました。",
  "island": {
    "id": "random_001",
    "name": "無人島001",
    "size": "medium",
    "biome": "rocky",
    "buildingSlots": {
      "layout": "1x2",
      "slots": 2
    }
  }
}
```

### 3.4 プレイヤーが所有する島の一覧を取得

**エンドポイント**: `POST /api/get-player-islands`

**リクエスト**:
```json
{
  "playFabId": "ABCD1234"
}
```

**レスポンス**:
```json
{
  "success": true,
  "islands": [
    {
      "id": "random_001",
      "name": "無人島001",
      "size": "medium",
      "biome": "rocky",
      "buildingSlots": { "layout": "1x2", "slots": 2 },
      "buildings": [...]
    }
  ]
}
```

### 3.5 島の詳細情報を取得

**エンドポイント**: `POST /api/get-island-details`

**リクエスト**:
```json
{
  "islandId": "random_001"
}
```

**レスポンス**:
```json
{
  "success": true,
  "island": {
    "id": "random_001",
    "name": "無人島001",
    "size": "medium",
    "biome": "rocky",
    "buildingSlots": { "layout": "1x2", "slots": 2 },
    "buildings": [...],
    "biomeInfo": {
      "category": "military",
      "bonus": 0.2,
      "description": "軍事施設の耐久度+20%"
    }
  }
}
```

### 3.6 島に建設を開始

**エンドポイント**: `POST /api/start-building-construction`

**リクエスト**:
```json
{
  "playFabId": "ABCD1234",
  "islandId": "random_001",
  "buildingId": "watchtower",
  "slotIndex": 0
}
```

**レスポンス**:
```json
{
  "success": true,
  "building": {
    "buildingId": "watchtower",
    "slotIndex": 0,
    "status": "constructing",
    "startTime": 1234567890000,
    "completionTime": 1234569690000,
    "level": 1
  },
  "message": "見張り台の建設を開始しました。完成まで30分です。"
}
```

### 3.7 建設完了をチェック

**エンドポイント**: `POST /api/check-building-completion`

**リクエスト**:
```json
{
  "islandId": "random_001",
  "slotIndex": 0
}
```

**レスポンス（まだ完成していない場合）**:
```json
{
  "success": true,
  "completed": false,
  "remainingTime": 900,
  "message": "まだ完成していません。残り15分0秒です。"
}
```

**レスポンス（完成した場合）**:
```json
{
  "success": true,
  "completed": true,
  "building": {
    "buildingId": "watchtower",
    "slotIndex": 0,
    "status": "completed",
    "level": 1
  },
  "message": "建設が完了しました！"
}
```

---

## 4. クライアント側実装（TODO）

以下の機能をクライアント側で実装する必要があります：

### 4.1 島接近検出UI
- 船が島に近づいたら「島発見！」通知を表示
- 「調査する」ボタンを表示
- 島の基本情報（名前、サイズ、バイオーム）を表示

### 4.2 占領UI
- 「占領」ボタンを表示
- 守護獣がいる場合、守護獣情報を表示
- 「戦闘開始」ボタンで既存の白兵戦システムに遷移

### 4.3 建設UI（Bottom Sheet）
- 画面下部からスライドして出てくるメニュー
- 島のグリッド表示（1x1, 1x2, 2x2のマス目）
- カテゴリタブ（軍事、経済、補助）
- 施設リスト（アイコン、名前、建設時間、コスト、効果）
- 「建設開始」ボタン

### 4.4 建設進行表示
- 建設中は島の上に「足場」と「クレーン」を表示
- 進捗バーと残り時間を表示
- 「ヘルプ要請」ボタン（LINEグループにシェア）
- 完成時に「完成！」アニメーションと旗の演出

---

## 5. 実装済み機能

✅ 島データ構造の拡張（バイオーム、建設スロット、守護獣情報）
✅ 守護獣の定義
✅ バイオームボーナスの定義
✅ 施設データの定義（種類、サイズ、効果、バイオーム制限）
✅ 島接近検出API
✅ 島占領開始API
✅ 守護獣戦闘結果処理API
✅ プレイヤー所有島一覧取得API
✅ 島詳細情報取得API
✅ 建設開始API
✅ 建設完了チェックAPI

---

## 6. 未実装機能（クライアント側）

⏳ 島接近検出UI
⏳ 占領UI
⏳ 守護獣戦闘UI（既存の白兵戦システムとの統合）
⏳ 建設UIコンポーネント（Bottom Sheet）
⏳ 建設スロットグリッド表示
⏳ 建設進行アニメーション（足場、クレーン）
⏳ 完成演出（旗が立つアニメーション）
⏳ ヘルプ要請機能（LINE共有）

---

## 7. 次のステップ

1. **マップデータの初期化**
   - [server/data/mapDataGen.js](server/data/mapDataGen.js)を使って島データを生成
   - Firestoreの`islands`コレクションにデータを投入

2. **クライアント側UIの実装**
   - 島接近検出UIから順番に実装
   - Bottom Sheet形式の建設メニュー
   - 建設進行アニメーション

3. **既存システムとの統合**
   - 守護獣戦闘を既存の白兵戦システムに統合
   - マップ表示に島の状態（野生/占領済み）を反映

4. **テストとバランス調整**
   - 守護獣の強さ調整
   - 建設時間の調整
   - バイオームボーナスの効果確認

---

## 8. 参考ファイル

- [server/data/mapDataGen.js](server/data/mapDataGen.js) - 島データ生成スクリプト
- [server/data/buildingDefs.js](server/data/buildingDefs.js) - 施設データ定義
- [server/routes/shipRoutes.js:537-957](server/routes/shipRoutes.js#L537-L957) - 島占領・建設API
- [FIRESTORE_INDEX_SETUP.md](FIRESTORE_INDEX_SETUP.md) - Firestoreインデックス設定

---

## まとめ

島占領・建設システムのサーバー側実装が完了しました！

**主な特徴**:
- 🗺️ バイオームごとの戦略性（岩山は軍事向き、森林は経済向き）
- ⚔️ 守護獣との戦闘（既存の白兵戦システムを流用）
- 🏗️ グリッド・スロット方式の建設システム
- ⏱️ 時間経過による建設完成
- 🚩 占領演出（旗が立つ）

次はクライアント側のUIを実装して、プレイヤーが実際に島を占領・建設できるようにしましょう！


