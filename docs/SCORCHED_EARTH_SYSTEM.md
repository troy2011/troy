# 破壊と再建システム（Scorched Earth）実装完了レポート

## 概要

島の破壊と再建システムが完成しました。このシステムにより、敵に占領された島を戦略的に破壊して一定期間使用不可にしたり、クールダウン期間後に再建して再利用したりできるようになります。

---

## 実装した機能

### ✅ サーバー側API（4個）

#### 1. `/api/demolish-island` - 島を破壊
- **機能**: 所有している島を更地にして、24時間建設不可にする
- **制限**: 首都（capital）と聖域（sacred）は破壊不可
- **効果**:
  - すべての建物が削除される
  - `occupationStatus` が `demolished` になる
  - `rebuildableAt` （再建可能時刻）が設定される

**リクエスト**:
```json
{
  "playFabId": "ABCD1234",
  "islandId": "random_001"
}
```

**レスポンス**:
```json
{
  "success": true,
  "message": "無人島001を破壊しました。瓦礫の山となり、24時間後に再建可能になります。",
  "island": {
    "id": "random_001",
    "name": "無人島001",
    "occupationStatus": "demolished",
    "rebuildableAt": 1702345678000
  }
}
```

#### 2. `/api/check-island-rebuildable` - 再建可能かチェック
- **機能**: 島が再建可能な状態かを確認
- **戻り値**: 再建可能フラグと残り時間

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
  "rebuildable": false,
  "remainingTime": 43200000,
  "message": "無人島001は再建まであと43200秒です。"
}
```

#### 3. `/api/rebuild-island` - 島を再建
- **機能**: クールダウン期間が経過した島を再び建設可能な状態にする
- **制限**: クールダウン期間（24時間）が経過している必要がある

**リクエスト**:
```json
{
  "playFabId": "ABCD1234",
  "islandId": "random_001"
}
```

**レスポンス**:
```json
{
  "success": true,
  "message": "無人島001を再建しました。建設を開始できます。",
  "island": {
    "id": "random_001",
    "name": "無人島001",
    "size": "medium",
    "biome": "rocky",
    "buildingSlots": { "layout": "1x2", "slots": 2 },
    "occupationStatus": "occupied",
    "buildings": []
  }
}
```

#### 4. `/api/get-demolished-islands` - 破壊された島の一覧取得
- **機能**: マップ上に表示するために、すべての破壊された島を取得
- **データ**: 残り時間と再建可能フラグを含む

**レスポンス**:
```json
{
  "success": true,
  "islands": [
    {
      "id": "random_001",
      "name": "無人島001",
      "coordinate": { "x": 250, "y": 300 },
      "size": "medium",
      "biome": "rocky",
      "demolishedBy": "ABCD1234",
      "rebuildableAt": 1702345678000,
      "remainingTime": 43200000,
      "rebuildable": false
    }
  ]
}
```

---

### ✅ クライアント側実装

#### 1. 破壊機能（[public/js/island.js:890-952](public/js/island.js#L890-L952)）

```javascript
// 島を破壊する
export async function demolishIsland(playFabId, islandId) {
    const response = await fetch('/api/demolish-island', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playFabId, islandId })
    });

    const data = await response.json();

    if (data.success) {
        showDemolishNotification(data.island);
    }

    return data;
}
```

**破壊通知モーダル**:
- 💥 アイコンと震えるアニメーション
- 赤いグラデーション背景
- 「24時間後に再建可能になります」というメッセージ

#### 2. 再建機能（[public/js/island.js:975-1033](public/js/island.js#L975-L1033)）

```javascript
// 島を再建する
export async function rebuildIsland(playFabId, islandId) {
    const response = await fetch('/api/rebuild-island', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playFabId, islandId })
    });

    const data = await response.json();

    if (data.success) {
        showRebuildNotification(data.island);
    }

    return data;
}
```

**再建通知モーダル**:
- 🏗️ アイコンと ✨ スパークル
- 緑のグラデーション背景
- 「再び建設できます」というメッセージ

#### 3. 瓦礫の山の表示（[public/js/island.js:1060-1117](public/js/island.js#L1060-L1117)）

```javascript
export function displayDemolishedIslandsOnMap(phaserScene, demolishedIslands) {
    demolishedIslands.forEach(island => {
        const x = island.coordinate.x * 32;
        const y = island.coordinate.y * 32;

        // 瓦礫のアイコン
        const rubbleIcon = island.rebuildable ? '🔨' : '💀';
        const rubble = phaserScene.add.text(x, y, rubbleIcon, {
            fontSize: '48px',
            stroke: '#000000',
            strokeThickness: 4
        });

        // 脈打つアニメーション
        phaserScene.tweens.add({
            targets: rubble,
            alpha: 0.5,
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // 残り時間を表示
        if (!island.rebuildable) {
            const hours = Math.floor(remainingTime / (1000 * 60 * 60));
            const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
            const timeText = phaserScene.add.text(x, y + 30, `${hours}:${minutes}`, {
                fontSize: '16px',
                fill: '#ff6b6b'
            });
        }
    });
}
```

**表示内容**:
- **クールダウン中**: 💀アイコン + 残り時間表示（HH:MM形式）
- **再建可能**: 🔨アイコン
- アルファ値が脈打つアニメーション（0.7 ↔ 0.5）

#### 4. 建設メニューへの破壊ボタン追加（[public/js/island.js:303-313](public/js/island.js#L303-L313)）

```html
<!-- 破壊ボタン（首都・聖域でない場合のみ表示） -->
<div class="demolish-section">
    <button class="btn-demolish" id="btnDemolish">
        🔥 この島を破壊する（更地にする）
    </button>
    <p style="font-size: 12px; color: #ff6b6b;">
        ⚠️ 破壊すると24時間建設不可になります。
    </p>
</div>
```

**確認ダイアログ**（[public/js/island.js:475-481](public/js/island.js#L475-L481)）:
```javascript
const confirmed = confirm(
    `本当に「${island.name}」を破壊しますか？\n\n` +
    `⚠️ 警告:\n` +
    `・すべての建物が削除されます\n` +
    `・24時間は再建できません\n` +
    `・この操作は取り消せません`
);
```

---

### ✅ CSS スタイリング（[public/css/island.css:735-811](public/css/island.css#L735-L811)）

#### 破壊ボタンのスタイル

```css
.btn-demolish {
    background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: bold;
    box-shadow: 0 4px 8px rgba(231, 76, 60, 0.3);
    transition: all 0.3s ease;
}

.btn-demolish:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 12px rgba(231, 76, 60, 0.4);
}
```

#### 破壊アニメーション

```css
.demolish-icon {
    font-size: 64px;
    animation: demolish-shake 0.5s ease-out;
}

@keyframes demolish-shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
    20%, 40%, 60%, 80% { transform: translateX(10px); }
}
```

#### 瓦礫の山のスタイル

```css
.island-demolished {
    filter: grayscale(80%) brightness(0.5);
    position: relative;
}

.island-demolished::after {
    content: '💀';
    font-size: 48px;
    animation: rubble-pulse 2s ease-in-out infinite;
}
```

---

### ✅ Phaser.js 統合（[public/WorldMapScene.js](public/WorldMapScene.js)）

#### 初期化（行78-80）

```javascript
// 破壊された島を表示するためのスプライト配列
this.demolishedSprites = [];
this.demolishedCheckInterval = null;
```

#### 定期チェック開始（行230-231）

```javascript
// 10. 破壊された島を定期的にチェックして表示
this.startDemolishedCheck();
```

#### チェック処理（行1267-1304）

```javascript
startDemolishedCheck() {
    // 初回チェック
    this.updateDemolishedDisplay();

    // 30秒ごとに破壊された島をチェック
    this.demolishedCheckInterval = setInterval(() => {
        this.updateDemolishedDisplay();
    }, 30000);
}

async updateDemolishedDisplay() {
    const demolishedIslands = await window.Island.getDemolishedIslands();

    if (demolishedIslands && demolishedIslands.length > 0) {
        window.Island.displayDemolishedIslandsOnMap(this, demolishedIslands);
    } else {
        // スプライトをクリア
        if (this.demolishedSprites) {
            this.demolishedSprites.forEach(sprite => sprite.destroy());
            this.demolishedSprites = [];
        }
    }
}
```

#### クリーンアップ（行1332-1341）

```javascript
// 破壊チェックのタイマーをクリア
if (this.demolishedCheckInterval) {
    clearInterval(this.demolishedCheckInterval);
}

// 破壊スプライトを削除
if (this.demolishedSprites) {
    this.demolishedSprites.forEach(sprite => sprite.destroy());
    this.demolishedSprites = [];
}
```

---

## データフロー

### 破壊フロー

```
1. プレイヤーが自分の島の建設メニューを開く
   ↓
2. 「🔥 この島を破壊する（更地にする）」ボタンをクリック
   ↓
3. 確認ダイアログが表示される
   - 「すべての建物が削除されます」
   - 「24時間は再建できません」
   - 「この操作は取り消せません」
   ↓
4. 「OK」をクリック
   ↓
5. サーバーに /api/demolish-island リクエスト
   ↓
6. Firestore の島データを更新
   - occupationStatus: 'demolished'
   - buildings: [] （すべて削除）
   - demolishedAt: 現在時刻
   - rebuildableAt: 現在時刻 + 24時間
   ↓
7. 破壊成功の通知モーダル表示
   - 💥 アイコンと震えるアニメーション
   - 「瓦礫の山となりました」
   ↓
8. マップ上に瓦礫のアイコン（💀）が表示される
   ↓
9. 30秒ごとに残り時間が更新される
```

### 再建フロー

```
1. 24時間経過後、瓦礫のアイコンが💀から🔨に変わる
   ↓
2. プレイヤーが島をクリック
   ↓
3. 「再建可能です」というメッセージが表示される
   ↓
4. サーバーに /api/rebuild-island リクエスト
   ↓
5. Firestore の島データを更新
   - occupationStatus: 'occupied'
   - demolishedAt, rebuildableAt: 削除
   - buildings: [] （空の状態）
   ↓
6. 再建成功の通知モーダル表示
   - 🏗️ アイコンと ✨ スパークル
   - 「再び建設できます」
   ↓
7. マップから瓦礫のアイコンが消える
   ↓
8. 島が通常の状態に戻り、建設メニューが開けるようになる
```

---

## 戦略的な使い方

### 1. 敵の重要拠点を奪った場合

**シナリオ**: 敵の造船所のある島を占領した

**選択肢**:
- **維持する**: そのまま所有して造船所を使う
- **破壊する**: 造船所を破壊して敵が二度と使えないようにする

**破壊のメリット**:
- 敵が奪い返しても24時間は使えない
- 戦略的に重要な施設を無効化できる
- 敵の反撃を遅らせることができる

### 2. 防衛が困難な島

**シナリオ**: 前線の島を敵に奪われそう

**戦略**:
- 敵が奪う直前に自分で破壊する
- 敵が奪っても瓦礫の山しか手に入らない
- 24時間後に奪い返して再建する

**焦土作戦（Scorched Earth）**:
- 敵に何も残さない
- 時間を稼いで主力を再編成
- 反撃の機会を作る

### 3. 島の再配置

**シナリオ**: 島の立地が悪い、または戦略を変更したい

**手順**:
1. 現在の島を破壊
2. 24時間のクールダウン期間中に別の島を占領
3. クールダウン期間後、必要に応じて再建

---

## 使用方法

### ブラウザコンソールでのテスト

#### 島を破壊
```javascript
await Island.demolishIsland('yourPlayFabId', 'island_001');
```

#### 再建可能かチェック
```javascript
const result = await Island.checkIslandRebuildable('island_001');
console.log('再建可能:', result.rebuildable);
console.log('残り時間:', result.remainingTime, 'ms');
```

#### 島を再建
```javascript
await Island.rebuildIsland('yourPlayFabId', 'island_001');
```

#### 破壊された島の一覧を取得
```javascript
const demolishedIslands = await Island.getDemolishedIslands();
console.log('破壊された島:', demolishedIslands.length, '個');
```

---

## パフォーマンス最適化

### チェック頻度の調整

デフォルトでは30秒ごとにチェックしますが、調整可能：

```javascript
// WorldMapScene.js:1275 を編集
this.demolishedCheckInterval = setInterval(() => {
    this.updateDemolishedDisplay();
}, 60000); // 60秒に変更
```

### クールダウン期間の変更

デフォルトでは24時間ですが、テスト用に短縮可能：

```javascript
// server/routes/ships.js:1111 を編集
const DEMOLISH_COOLDOWN = 24 * 60 * 60 * 1000; // 24時間
// ↓ テスト用に5分に変更
const DEMOLISH_COOLDOWN = 5 * 60 * 1000; // 5分
```

---

## トラブルシューティング

### Q: 破壊ボタンが表示されない

**A**: 以下を確認してください
- 島の所有者が自分か？
- 島の種類が首都（capital）または聖域（sacred）ではないか？
- 建設メニューが正しく読み込まれているか？

### Q: 瓦礫のアイコンが表示されない

**A**: 以下を確認してください
1. マップタブを開いているか？
2. 30秒以上経過したか？（自動更新は30秒ごと）
3. ブラウザのコンソールにエラーが出ていないか？

### Q: 再建できない

**A**: 以下を確認してください
- クールダウン期間（24時間）が経過しているか？
- 残り時間は瓦礫のアイコンの下に表示されます
- コンソールで `await Island.checkIslandRebuildable('island_id')` を実行して確認

---

## まとめ

破壊と再建システム（Scorched Earth）の実装が完了しました！

**実装した機能**:
- ✅ 島の破壊機能（24時間クールダウン）
- ✅ 島の再建機能（クールダウン期間後）
- ✅ 瓦礫の山の視覚表現（💀アイコン + 残り時間）
- ✅ マップ上での自動表示（30秒ごと更新）
- ✅ 破壊・再建の通知モーダル
- ✅ 建設メニューへの破壊ボタン追加
- ✅ 首都・聖域の保護

**戦略的な価値**:
- 敵の重要拠点を無効化できる
- 防衛が困難な島を焦土化できる
- 24時間という時間制限が緊張感を生む
- 奪還と再建の駆け引きが生まれる

次は、実際にゲームをプレイして、敵の島を破壊・再建してみましょう！💥🏗️

