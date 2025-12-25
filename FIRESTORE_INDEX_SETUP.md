# Firestore インデックス設定ガイド

## 概要

Geohashを使った地理クエリを有効にするため、Firestoreに複合インデックスを設定する必要があります。

---

## 必要なインデックス

### 1. `ships` コレクション用インデックス

**コレクションID**: `ships`
**フィールド**: `geohash` (昇順)
**クエリスコープ**: コレクション

このインデックスは以下のクエリで使用されます：
```javascript
db.collection('ships')
  .orderBy('geohash')
  .startAt(bound[0])
  .endAt(bound[1])
```

---

## 設定方法

### 方法1: Firebase Console（推奨）

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. プロジェクトを選択
3. 左メニューから「Firestore Database」を選択
4. 上部タブから「インデックス」を選択
5. 「複合」タブをクリック
6. 「インデックスを作成」をクリック
7. 以下の設定を入力：
   - **コレクションID**: `ships`
   - **インデックスを追加するフィールド**:
     - フィールド: `geohash`
     - 並び順: `昇順`
   - **クエリスコープ**: `コレクション`
8. 「作成」をクリック

**注意**: インデックスの構築には数分かかる場合があります。

---

### 方法2: firestore.indexes.json（自動デプロイ用）

プロジェクトのルートに `firestore.indexes.json` ファイルを作成：

```json
{
  "indexes": [
    {
      "collectionGroup": "ships",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "geohash",
          "order": "ASCENDING"
        }
      ]
    }
  ],
  "fieldOverrides": []
}
```

その後、以下のコマンドでデプロイ：
```bash
firebase deploy --only firestore:indexes
```

---

### 方法3: エラーログから自動作成

アプリを実行すると、インデックスが不足している場合、Firebaseが自動的にエラーログに作成リンクを表示します：

```
Error: 9 FAILED_PRECONDITION: The query requires an index.
You can create it here: https://console.firebase.google.com/...
```

このリンクをクリックすると、必要なインデックスが自動的に設定されます。

---

## インデックス構築の確認

### ステータス確認

Firebase Console の「インデックス」タブで、以下のステータスを確認できます：
- 🟡 **構築中**: インデックスは作成中です（数分かかる場合があります）
- 🟢 **有効**: インデックスは使用可能です
- 🔴 **エラー**: インデックスの作成に失敗しました

### 動作確認

インデックスが有効になったら、以下のテストを実行：

```bash
# サーバーを起動
npm start
```

ブラウザのコンソールで以下のログを確認：
```
[GetShipsInView] Geohash bounds for radius 50: 2 queries
[GetShipsInView] Found 3 ships in view (optimized with geohash)
```

エラーが出なければ成功です！

---

## パフォーマンス向上の効果

### 改善前（全船舶スキャン）
- 船の総数: 1000隻
- Firestore読み取り: **1000回**
- レスポンス時間: 2-3秒

### 改善後（Geohashクエリ）
- 船の総数: 1000隻
- Firestore読み取り: **10-20回**（視界内の船のみ）
- レスポンス時間: 0.1-0.3秒

**読み取り回数が99%削減！**

---

## トラブルシューティング

### 問題1: "The query requires an index" エラー

**原因**: インデックスが作成されていない、または構築中

**解決策**:
1. Firebase Consoleでインデックスのステータスを確認
2. 「構築中」の場合は完了まで待つ（通常5-10分）
3. エラーログのリンクから直接作成

### 問題2: インデックス作成後もエラーが出る

**原因**: インデックスの構築が完了していない可能性

**解決策**:
1. Firebase Consoleで「有効」になっているか確認
2. ブラウザのキャッシュをクリア
3. サーバーを再起動

### 問題3: クエリ結果が空になる

**原因**: 既存の船データに `geohash` フィールドがない

**解決策**:
既存の船データに geohash を追加するマイグレーションスクリプトを実行：

```javascript
// migration-add-geohash.js
const admin = require('firebase-admin');
const { geohashForLocation } = require('geofire-common');

admin.initializeApp();
const db = admin.firestore();

async function migrateShips() {
    const snapshot = await db.collection('ships').get();

    for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!data.geohash && data.position) {
            const geohash = geohashForLocation([data.position.y, data.position.x]);
            await doc.ref.update({ geohash: geohash });
            console.log(`Updated ship ${doc.id} with geohash: ${geohash}`);
        }
    }

    console.log('Migration completed!');
}

migrateShips();
```

実行：
```bash
node migration-add-geohash.js
```

---

## 参考資料

- [Firebase公式ドキュメント: インデックス管理](https://firebase.google.com/docs/firestore/query-data/indexing)
- [geofire-common ライブラリ](https://github.com/firebase/geofire-js)
- [Geohashの仕組み](https://en.wikipedia.org/wiki/Geohash)

---

## まとめ

✅ `ships` コレクションに `geohash` フィールドのインデックスを作成
✅ インデックスが「有効」になるまで待つ（5-10分）
✅ 動作確認でエラーがないことを確認

これで、Geohashを使った高速な地理クエリが有効になります！
