# 島建設UIクライアント側実装ガイド

## 概要

島占領・建設システムのクライアント側UIが完成しました。このドキュメントでは、実装したUIコンポーネントの使い方と統合方法を説明します。

---

## 実装したファイル

### 1. [public/js/island.js](public/js/island.js)
島占領・建設システムのクライアント側ロジック

**主な機能**:
- 島への接近検出
- 占領処理
- 守護獣戦闘結果の送信
- プレイヤーが所有する島の取得
- 建設メニュー（Bottom Sheet）の表示
- 建設開始・完了チェック
- 建設進行タイマー管理

### 2. [public/css/island.css](public/css/island.css)
島建設UIのスタイルシート

**主な機能**:
- Bottom Sheetのアニメーション
- 建設スロットグリッドのレイアウト
- カテゴリタブのスタイル
- 建設進行表示（足場・クレーン）
- 完成通知モーダル

---

## 使用方法

### 1. HTMLにCSSとJSを追加

`public/index.html`に以下を追加：

```html
<head>
    <!-- 既存のCSS -->
    <link rel="stylesheet" href="css/island.css">
</head>

<body>
    <!-- 既存のコンテンツ -->

    <script type="module">
        import * as Island from './js/island.js';

        // グローバルに公開（必要に応じて）
        window.Island = Island;
    </script>
</body>
```

### 2. 建設メニューを表示

島をクリックした時に建設メニューを表示する例：

```javascript
import { showBuildingMenu, getIslandDetails } from './js/island.js';

// 島がクリックされた時
async function onIslandClicked(islandId) {
    // 島の詳細情報を取得
    const island = await getIslandDetails(islandId);

    if (island) {
        // プレイヤーIDを取得
        const playFabId = localStorage.getItem('playFabId');

        // 建設メニューを表示
        showBuildingMenu(island, playFabId);
    }
}
```

### 3. 島への接近検出

船が島に近づいた時に通知を表示する例：

```javascript
import { detectIslandApproach } from './js/island.js';

// 船の位置が更新されたとき
async function onShipPositionUpdate(shipId) {
    const result = await detectIslandApproach(shipId);

    if (result && result.nearbyIslands.length > 0) {
        // 近くの島がある場合、通知を表示
        const island = result.nearbyIslands[0];
        showIslandApproachNotification(island);
    }
}

function showIslandApproachNotification(island) {
    // 通知UIを表示（実装例）
    const notification = document.createElement('div');
    notification.className = 'island-notification';
    notification.innerHTML = `
        <h3>島を発見！</h3>
        <p>${island.name}（${island.size}、${island.biome}）</p>
        <button onclick="handleIslandOccupation('${island.id}')">調査する</button>
    `;
    document.body.appendChild(notification);
}
```

### 4. 島の占領処理

```javascript
import { startIslandOccupation, submitGuardianBattleResult } from './js/island.js';

async function handleIslandOccupation(islandId) {
    const playFabId = localStorage.getItem('playFabId');
    const result = await startIslandOccupation(playFabId, islandId);

    if (result.requiresBattle) {
        // 守護獣戦闘が必要
        const guardian = result.guardian;
        const battleResult = await startGuardianBattle(guardian);

        // 戦闘結果を送信
        const finalResult = await submitGuardianBattleResult(
            playFabId,
            islandId,
            battleResult.victory
        );

        if (finalResult.success && finalResult.result === 'victory') {
            // 占領成功！旗が立つ演出
            showOccupationSuccess(finalResult.island);
        }
    } else {
        // 即座に占領完了
        showOccupationSuccess(result.island);
    }
}

async function startGuardianBattle(guardian) {
    // 既存の白兵戦システムを使用
    // 例: battle.js の戦闘システムに遷移
    console.log('守護獣戦闘開始:', guardian);

    // 仮の戦闘結果（実際には戦闘システムから取得）
    return { victory: true };
}

function showOccupationSuccess(island) {
    // 占領成功の演出（旗が立つアニメーション）
    const modal = document.createElement('div');
    modal.className = 'occupation-success-modal';
    modal.innerHTML = `
        <div class="flag-animation">🚩</div>
        <h2>${island.name}を占領しました！</h2>
        <p>建設を開始できます。</p>
        <button onclick="Island.showBuildingMenu(${JSON.stringify(island)}, '${localStorage.getItem('playFabId')}')">建設メニューを開く</button>
    `;
    document.body.appendChild(modal);
}
```

### 5. プレイヤーの所有島一覧を表示

```javascript
import { getPlayerIslands } from './js/island.js';

async function showMyIslands() {
    const playFabId = localStorage.getItem('playFabId');
    const islands = await getPlayerIslands(playFabId);

    const listContainer = document.getElementById('myIslandsList');
    listContainer.innerHTML = islands.map(island => `
        <div class="island-card" onclick="Island.showBuildingMenu(${JSON.stringify(island)}, '${playFabId}')">
            <h3>${island.name}</h3>
            <p>サイズ: ${island.size}</p>
            <p>バイオーム: ${island.biome}</p>
            <p>建物数: ${island.buildings?.length || 0}/${island.buildingSlots.slots}</p>
        </div>
    `).join('');
}
```

---

## UIコンポーネントの詳細

### Bottom Sheet（建設メニュー）

**特徴**:
- 画面下部からスライドして表示
- 半透明のオーバーレイ
- スムーズなアニメーション
- スワイプダウンで閉じる（オプション）

**構成要素**:
1. **ヘッダー**: 島名と閉じるボタン
2. **島情報**: サイズ、バイオーム、ボーナス情報
3. **建設スロットグリッド**: 1x1, 1x2, 2x2のマス目表示
4. **カテゴリタブ**: 軍事、経済、補助の3つ
5. **施設リスト**: カテゴリごとの施設一覧

### 建設スロットグリッド

**レイアウト**:
- `1x1`: 1マス（小島）
- `1x2`: 横並び2マス（中島）
- `2x2`: 正方形4マス（大島）
- `3x3`: 正方形9マス（首都）

**状態表示**:
- **空きスロット**: 薄紫のグラデーション、「+」アイコン
- **選択中**: 水色の枠線、発光エフェクト
- **建設中**: 黄色の背景、足場（🏗️）アイコン、残り時間表示
- **完成**: 緑色の背景、施設アイコン、施設名

### カテゴリタブ

**カテゴリ**:
- ⚔️ **軍事**: 見張り台、沿岸砲台、要塞、造船所
- 💰 **経済**: 倉庫、農園、交易所、鉱山、大市場
- 🛠️ **補助**: 酒場、修理ドック、灯台、神殿

### 施設リスト

**表示項目**:
- 施設アイコン
- 施設名
- 説明文
- 建設時間
- 必要スロット数
- 「建設」ボタン

---

## 建設フロー

```
1. 島をクリック
   ↓
2. 建設メニュー（Bottom Sheet）が表示される
   ↓
3. 空きスロットを選択
   ↓
4. カテゴリタブから施設の種類を選択
   ↓
5. 施設リストから建設したい施設を選択
   ↓
6. 「建設」ボタンをクリック
   ↓
7. 建設開始（足場とクレーンが表示される）
   ↓
8. 1秒ごとに残り時間が更新される
   ↓
9. 完成時に通知が表示される
   ↓
10. 施設が完成（アイコンと名前が表示される）
```

---

## アニメーション

### 1. Bottom Sheetのスライドイン
```css
transform: translateY(100%) → translateY(0)
transition: 0.3s ease
```

### 2. スロット選択時のエフェクト
```css
border-color: #4ecdc4
box-shadow: 0 0 20px rgba(78, 205, 196, 0.5)
```

### 3. 建設中のアニメーション
```css
@keyframes construction-bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
}
```

### 4. 完成通知のフェードイン
```css
@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}
```

---

## カスタマイズ

### 1. 施設アイコンの変更

[island.js:getBuildingIcon()](public/js/island.js)関数を編集：

```javascript
function getBuildingIcon(buildingId) {
    const icons = {
        'watchtower': '🗼',
        'coastal_battery': '🎯',
        // 新しいアイコンを追加
        'custom_building': '🏛️'
    };
    return icons[buildingId] || '🏗️';
}
```

### 2. カラーテーマの変更

[island.css](public/css/island.css)を編集：

```css
.bottom-sheet-header {
    /* 紫のグラデーション → 別の色に変更 */
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
```

### 3. 建設時間の表示形式変更

[island.js:updateConstructionProgress()](public/js/island.js)関数を編集：

```javascript
function updateConstructionProgress(islandId, slotIndex, remainingTime) {
    const slotElement = document.querySelector(`[data-island-id="${islandId}"][data-slot-index="${slotIndex}"]`);
    if (!slotElement) return;

    const progressElement = slotElement.querySelector('.construction-timer');
    if (progressElement) {
        // カスタム形式に変更
        const minutes = Math.floor(remainingTime / 60000);
        const seconds = Math.floor((remainingTime % 60000) / 1000);
        progressElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}
```

---

## トラブルシューティング

### 1. Bottom Sheetが表示されない

**原因**: CSSファイルが読み込まれていない

**解決策**:
```html
<link rel="stylesheet" href="css/island.css">
```

### 2. 施設リストが空

**原因**: `fetchBuildingsForCategory`関数がモックデータを返している

**解決策**: サーバー側から施設データを取得するAPIを実装：

```javascript
async function fetchBuildingsForCategory(category, biome) {
    const response = await fetch('/api/get-buildings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, biome })
    });

    const data = await response.json();
    return data.buildings;
}
```

### 3. 建設タイマーが動作しない

**原因**: `completionTime`が未来の時刻になっていない

**解決策**: サーバー側で正しい完成時刻を計算していることを確認：

```javascript
const completionTime = Date.now() + buildTime * 1000;
```

---

## 次のステップ

1. **Phaser.jsとの統合**
   - マップシーン（WorldMapScene.js）に島クリックイベントを追加
   - 島のスプライトに対してクリックリスナーを設定

2. **守護獣戦闘との統合**
   - 既存の白兵戦システム（battle-client.js）を流用
   - 守護獣のステータスを戦闘システムに渡す

3. **建設完了の自動チェック**
   - アプリ起動時に建設中の施設をチェック
   - バックグラウンドで定期的にチェック

4. **ヘルプ要請機能**
   - LINEグループに建設状況をシェア
   - メンバーがヘルプボタンを押すと建設時間短縮

5. **施設の効果適用**
   - 完成した施設の効果をゲームシステムに反映
   - 例: 見張り台の視界範囲拡大、倉庫の容量増加

---

## まとめ

島建設UIのクライアント側実装が完了しました！

**実装した機能**:
- ✅ Bottom Sheet形式の建設メニュー
- ✅ グリッド・スロット方式の建設システム
- ✅ カテゴリタブによる施設選択
- ✅ 建設進行アニメーション（足場・クレーン）
- ✅ 建設完了通知
- ✅ レスポンシブデザイン（スマホ対応）

次は、これらのUIコンポーネントを既存のゲームシステム（Phaser.js、白兵戦システム）と統合していきましょう！
