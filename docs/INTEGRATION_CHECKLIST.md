# 島占領・建設システム 統合チェックリスト

このドキュメントは、島占領・建設システムが正しく統合されているかを確認するためのチェックリストです。

---

## ✅ 完了した統合作業

### サーバー側

- [x] **島データ構造の拡張** ([server/data/mapDataGen.js](server/data/mapDataGen.js))
  - バイオーム（rocky, forest, beach, volcanic, jungle）
  - 建設スロット（1x1, 1x2, 2x2, 3x3）
  - 守護獣情報（crab_giant, skeleton_warrior, sea_serpent, kraken）
  - 占領ステータス（wild, occupied, sacred, capital）

- [x] **施設定義** ([server/data/buildingDefs.js](server/data/buildingDefs.js))
  - 軍事施設: 見張り台、沿岸砲台、要塞、造船所
  - 経済施設: 倉庫、農園、交易所、鉱山、大市場
  - 補助施設: 酒場、修理ドック、灯台、神殿

- [x] **島占領・建設API** ([server/routes/shipRoutes.js:537-1074](server/routes/shipRoutes.js#L537-L1074))
  - 島接近検出
  - 島占領開始
  - 守護獣戦闘結果処理
  - プレイヤー所有島一覧取得
  - 島詳細情報取得
  - 建設開始
  - 建設完了チェック
  - 建設ヘルプ（時間短縮）
  - 建設中島一覧取得

### クライアント側

- [x] **島システムモジュール** ([public/js/island.js](public/js/island.js))
  - 826行のクライアント側ロジック
  - Bottom Sheet UI制御
  - 建設進行管理
  - タイマー更新
  - LINE共有機能
  - 建設音再生機能

- [x] **島建設CSS** ([public/css/island.css](public/css/island.css))
  - 680行以上のスタイル定義
  - Bottom Sheetアニメーション
  - 建設スロットグリッド
  - カテゴリタブ
  - 建設進行表示
  - 完成通知モーダル
  - 旗・花火・スパークルアニメーション

### Phaser.js統合

- [x] **WorldMapScene 拡張** ([public/WorldMapScene.js](public/WorldMapScene.js))
  - 建設中の島を定期チェック（30秒ごと）
  - マップ上に足場・クレーンを表示
  - パーティクルエフェクト（粉塵）
  - 島クリック時の建設メニュー表示
  - シーン破棄時のクリーンアップ

### メインアプリ統合

- [x] **HTML統合** ([public/index.html:14](public/index.html#L14))
  - island.css の読み込み

- [x] **メインスクリプト統合** ([public/main.js](public/main.js))
  - Island モジュールのインポート（行15）
  - URLパラメータ処理（ヘルプ要請）（行80-88）
  - グローバルスコープへの公開（行387）

---

## 🔍 動作確認チェックリスト

### 1. サーバー起動確認

```bash
cd c:\Users\ikeda\my-liff-app
node server.js
```

**確認項目**:
- [ ] サーバーが正常に起動する
- [ ] Firestoreに接続できる
- [ ] PlayFabに接続できる
- [ ] エラーログが出ていない

### 2. マップ表示確認

**確認項目**:
- [ ] 地図タブに切り替えられる
- [ ] 島が表示される
- [ ] 船が表示される
- [ ] 島をクリックできる
- [ ] コンソールにエラーが出ていない

### 3. 建設中の島表示確認

**テスト手順**:
1. ブラウザのコンソールで以下を実行:
```javascript
// テスト用に短時間の建設を開始（300秒 = 5分）
await Island.startConstruction('yourPlayFabId', 'island_001', 'watchtower', 0);
```

2. 地図タブに切り替え

**確認項目**:
- [ ] 30秒以内にマップ上に足場（🏗️）が表示される
- [ ] 足場が上下にバウンスする
- [ ] クレーンが左右に回転する
- [ ] パーティクル（粉塵）が表示される
- [ ] ⚠️ 建設音が再生される（音声ファイル追加後）

### 4. 建設メニュー表示確認

**テスト手順**:
1. 船を自分の島に接近させる
2. 島をクリック

**確認項目**:
- [ ] Bottom Sheetが下からスライドして表示される
- [ ] 島名が表示される
- [ ] 建設スロットグリッドが表示される
- [ ] カテゴリタブ（軍事・経済・補助）が表示される
- [ ] 施設リストが表示される
- [ ] 「建設」ボタンが表示される

### 5. 建設開始確認

**テスト手順**:
1. 建設メニューから空きスロットを選択
2. カテゴリタブで「軍事」を選択
3. 「見張り台」の「建設」ボタンをクリック

**確認項目**:
- [ ] スロットが黄色になる
- [ ] 足場アイコン（🏗️）が表示される
- [ ] 残り時間が表示される
- [ ] タイマーが1秒ごとに減少する
- [ ] 「ヘルプ要請」ボタンが表示される

### 6. ヘルプ要請確認

**テスト手順**:
1. 建設中のスロットの「ヘルプ要請」ボタンをクリック

**確認項目**:
- [ ] LINEの共有画面が表示される
- [ ] Flex Messageのプレビューが表示される
- [ ] 「建設を手伝ってください！」というメッセージが表示される
- [ ] 「手伝う」ボタンが表示される

### 7. ヘルプ実行確認

**テスト手順**:
1. 別のプレイヤーがヘルプリンクをクリック
   - URLの例: `https://your-app.com?action=help&islandId=island_001&slotIndex=0`

**確認項目**:
- [ ] 「ヘルプありがとう！」というメッセージが表示される
- [ ] 残り時間が短縮される
- [ ] ヘルプ人数が増加する（例: 「👥 1人」→「👥 2人」）
- [ ] 最大50%まで短縮される

### 8. 完成通知確認

**テスト手順**:
1. 建設時間が経過するまで待つ（または短時間でテスト）

**確認項目**:
- [ ] 完成通知モーダルが表示される
- [ ] 旗（🚩）が下から上へ上昇する
- [ ] スパークル（✨）が点滅する
- [ ] 花火のアニメーションが表示される
- [ ] 「🎉 建設完了！」というメッセージが表示される
- [ ] 建設音が停止する
- [ ] マップから足場・クレーンが削除される
- [ ] スロットに施設アイコンと名前が表示される

---

## ⚠️ 必要なタスク

### 音声ファイルの追加

**ファイル**:
- `public/audio/construction.mp3`
- `public/audio/construction.ogg`

**詳細**: [public/audio/AUDIO_FILES_NEEDED.md](public/audio/AUDIO_FILES_NEEDED.md)

**推奨音源**:
- 効果音ラボ: https://soundeffect-lab.info/
- 魔王魂: https://maou.audio/
- Freesound: https://freesound.org/

**追加後の確認**:
```javascript
// ブラウザのコンソールで実行
Island.playConstructionSound(true);
// → トンテンカンという音が再生されることを確認
```

---

## 🔧 オプションタスク

### 守護獣戦闘システムとの統合

現状、守護獣戦闘は未統合です。既存の白兵戦システム ([public/battle-client.js](public/battle-client.js)) と統合する場合は以下を実装:

**ファイル**: [public/js/island.js](public/js/island.js)

```javascript
// 既存の startIslandOccupation() を拡張
async function startIslandOccupation(playFabId, islandId) {
    const result = await /* API call */;

    if (result.requiresBattle) {
        // 守護獣戦闘を開始（battle-client.js を使用）
        const battleResult = await startGuardianBattle({
            enemy: result.guardian,
            // ... 戦闘パラメータ
        });

        // 戦闘結果をサーバーに送信
        await submitGuardianBattleResult(playFabId, islandId, battleResult.victory);
    }
}
```

---

## 📊 パフォーマンステスト

### メモリ使用量確認

**確認手順**:
1. Chrome DevTools → Performance タブ
2. 「地図」タブを開く
3. 5分間放置
4. メモリ使用量をチェック

**合格基準**:
- メモリリークがないこと
- 使用量が安定していること

### CPU使用率確認

**確認手順**:
1. Chrome DevTools → Performance タブ
2. 建設中の島が10個ある状態で記録開始
3. 1分間記録

**合格基準**:
- CPU使用率が常時50%以下
- フレームレートが30fps以上

### ネットワーク使用量確認

**確認手順**:
1. Chrome DevTools → Network タブ
2. 建設チェックの頻度を確認

**合格基準**:
- 30秒ごとに1リクエスト（`/api/get-constructing-islands`）
- レスポンスサイズが10KB以下

---

## 🐛 既知の問題

### なし

現時点で既知の問題はありません。

---

## 📝 バージョン情報

- **実装日**: 2025-12-12
- **実装者**: Claude Sonnet 4.5
- **サーバー側コード**: 完了
- **クライアント側コード**: 完了
- **統合**: 完了
- **音声ファイル**: 未追加（要対応）

---

## 📚 関連ドキュメント

1. [ISLAND_OCCUPATION_SYSTEM.md](ISLAND_OCCUPATION_SYSTEM.md) - サーバー側実装ドキュメント
2. [ISLAND_UI_IMPLEMENTATION.md](ISLAND_UI_IMPLEMENTATION.md) - クライアント側実装ガイド
3. [CONSTRUCTION_FEATURES_COMPLETE.md](CONSTRUCTION_FEATURES_COMPLETE.md) - 建設進行機能完了レポート
4. [ISLAND_SYSTEM_INTEGRATION_COMPLETE.md](ISLAND_SYSTEM_INTEGRATION_COMPLETE.md) - 統合完了レポート
5. [public/audio/AUDIO_FILES_NEEDED.md](public/audio/AUDIO_FILES_NEEDED.md) - 音声ファイル要件

---

## ✅ 統合完了確認

**すべてのチェック項目を確認したら、このセクションにチェックを入れてください**:

- [ ] サーバーが正常に起動する
- [ ] マップが表示される
- [ ] 建設中の島が表示される（足場・クレーン）
- [ ] 建設メニューが表示される
- [ ] 建設が開始できる
- [ ] ヘルプ要請ができる
- [ ] ヘルプによる時間短縮が機能する
- [ ] 完成通知が表示される
- [ ] ⚠️ 建設音が再生される（音声ファイル追加後）
- [ ] パフォーマンステストに合格

**すべて完了したら、システムは本番環境にデプロイ可能です！** 🎉

---

最終更新: 2025-12-12


