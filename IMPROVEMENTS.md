# 船システムの改善案

## 1. 地理クエリの実装（最優先）

### 問題点
現在の実装では全船舶を取得して範囲チェックしているため、船の数が増えると効率が悪化します。

### 解決策: Geohash + Firestore複合クエリ

```javascript
// ships.js に追加
import { geohashForLocation, geohashQueryBounds } from 'geofire-common';

/**
 * 船の位置を更新時にgeohashも保存
 */
async function updateShipPositionWithGeohash(shipId, position) {
    const hash = geohashForLocation([position.y, position.x]);

    await db.collection('ships').doc(shipId).update({
        position: position,
        geohash: hash, // 地理インデックス
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * 視界内の船を効率的に取得
 */
export function watchShipsInViewOptimized(centerX, centerY, radius, onShipsUpdate) {
    const firestore = window.firestore;
    const center = [centerY, centerX];
    const radiusInM = radius * 100; // タイルをメートルに変換（要調整）

    // Geohashの範囲を計算
    const bounds = geohashQueryBounds(center, radiusInM);
    const promises = [];

    // 各Geohash範囲に対してクエリを作成
    for (const b of bounds) {
        const q = query(
            collection(firestore, 'ships'),
            orderBy('geohash'),
            startAt(b[0]),
            endAt(b[1])
        );
        promises.push(getDocs(q));
    }

    // 結果を統合
    Promise.all(promises).then((snapshots) => {
        const shipsInView = [];

        for (const snap of snapshots) {
            snap.forEach((doc) => {
                const shipData = doc.data();
                const currentPos = calculateCurrentPosition(shipData.movement, shipData.position);

                // 正確な距離チェック（Geohashは近似値なので）
                const distance = Math.sqrt(
                    Math.pow(currentPos.x - centerX, 2) +
                    Math.pow(currentPos.y - centerY, 2)
                );

                if (distance <= radius) {
                    shipsInView.push({
                        shipId: shipData.shipId,
                        playFabId: shipData.playFabId,
                        position: currentPos,
                        appearance: shipData.appearance,
                        movement: shipData.movement
                    });
                }
            });
        }

        onShipsUpdate(shipsInView);
    });
}
```

**効果:**
- 読み取り回数が1/100以下に削減（1000隻 → 10隻程度）
- レスポンス時間が大幅改善
- Firebase課金が劇的に削減

---

## 2. PlayFab資産データの過剰取得

### 問題点
```javascript
// 毎回PlayFabからフル資産データを取得
const assetData = await getShipAsset(playFabId, firestoreData.shipId);
```

- Firestoreが更新されるたびにPlayFabにリクエスト
- 必要ないデータ（装備、積荷など）も取得
- ネットワーク負荷が高い

### 解決策: 段階的データロード + キャッシング

```javascript
// ship.js

// PlayFab資産データのキャッシュ（TTL: 5分）
const assetDataCache = new Map(); // shipId -> { data, timestamp }
const CACHE_TTL = 5 * 60 * 1000; // 5分

/**
 * 最小限の船データのみ取得（表示用）
 */
async function getShipAssetLight(playFabId, shipId) {
    // キャッシュチェック
    const cached = assetDataCache.get(shipId);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }

    // 必要最小限のデータのみ取得
    const data = await callApiWithLoader('/api/get-ship-asset-light', {
        playFabId: playFabId,
        shipId: shipId,
        fields: ['ShipType', 'Stats'] // 装備や積荷は不要
    }, { isSilent: true });

    if (data && data.success) {
        assetDataCache.set(shipId, {
            data: data.shipData,
            timestamp: Date.now()
        });
        return data.shipData;
    }

    return null;
}

/**
 * 詳細データは詳細モーダルを開いた時のみ取得
 */
async function getShipAssetFull(playFabId, shipId) {
    return await callApiWithLoader('/api/get-ship-asset', {
        playFabId: playFabId,
        shipId: shipId
    });
}
```

**効果:**
- PlayFabリクエストが1/10以下に削減
- UIの応答速度が向上
- サーバー負荷が軽減

---

## 3. Firestore onSnapshot の重複処理

### 問題点
```javascript
playerShipsListener = onSnapshot(q, async (snapshot) => {
    // Firestoreが更新されるたびにPlayFabに並列リクエスト
    const ships = await Promise.all(
        firestoreShips.map(async (firestoreData) => {
            const assetData = await getShipAsset(...); // 重い
        })
    );
});
```

- Firestoreの小さな変更でも全船舶のPlayFabデータを再取得
- ネットワーク帯域を無駄に消費

### 解決策: 差分更新の実装

```javascript
let previousShipIds = new Set();

playerShipsListener = onSnapshot(q, async (snapshot) => {
    const currentShipIds = new Set();
    const changes = [];

    // 差分を検出
    snapshot.docChanges().forEach((change) => {
        changes.push({
            type: change.type, // 'added', 'modified', 'removed'
            data: change.doc.data()
        });
    });

    // 変更されたものだけ更新
    for (const change of changes) {
        if (change.type === 'added' || change.type === 'modified') {
            const assetData = await getShipAssetLight(playFabId, change.data.shipId);
            updateShipCard(change.data.shipId, change.data, assetData);
        } else if (change.type === 'removed') {
            removeShipCard(change.data.shipId);
        }
    }
});

/**
 * 個別の船カードを更新（全体再描画しない）
 */
function updateShipCard(shipId, positionData, assetData) {
    let card = document.querySelector(`[data-ship-id="${shipId}"]`);

    if (!card) {
        // 新規作成
        const container = document.getElementById('playerShipsContainer');
        card = document.createElement('div');
        container.appendChild(card);
    }

    // カードの内容を更新
    const currentPos = calculateCurrentPosition(positionData.movement, positionData.position);
    card.outerHTML = renderShipCard({
        shipId, assetData, positionData, currentPosition: currentPos
    });

    // キャッシュ更新
    cachedShipsData.set(shipId, { positionData, assetData });
}
```

**効果:**
- 変更された船のみ更新（全体再描画なし）
- ちらつきがなくなる
- パフォーマンスが大幅向上

---

## 4. アニメーションの最適化

### 問題点
```javascript
// 全ての船カードをDOM検索
const shipCards = container.querySelectorAll('.ship-card');
shipCards.forEach((card) => {
    const shipId = card.dataset.shipId;
    const cachedData = cachedShipsData.get(shipId);
    // ...
});
```

- 毎フレーム（60fps）DOMクエリを実行
- パフォーマンスボトルネックになる可能性

### 解決策: 仮想DOM + WebWorker

```javascript
// shipAnimationWorker.js（WebWorker）
self.onmessage = function(e) {
    const { shipsData, currentTime } = e.data;
    const updates = [];

    for (const [shipId, data] of Object.entries(shipsData)) {
        if (!data.movement.isMoving) continue;

        const movement = data.movement;
        const totalTime = movement.arrivalTime - movement.departureTime;
        const elapsedTime = currentTime - movement.departureTime;
        const progress = Math.max(0, Math.min(100, (elapsedTime / totalTime) * 100));

        updates.push({
            shipId: shipId,
            progress: progress,
            eta: formatETA(movement.arrivalTime, currentTime)
        });
    }

    self.postMessage(updates);
};

// ship.js
const animationWorker = new Worker('shipAnimationWorker.js');
const shipElements = new Map(); // shipId -> DOM要素（キャッシュ）

function startShipAnimationOptimized() {
    function animate() {
        // WebWorkerで計算
        animationWorker.postMessage({
            shipsData: Object.fromEntries(cachedShipsData),
            currentTime: Date.now()
        });
    }

    animationWorker.onmessage = function(e) {
        const updates = e.data;

        // 計算結果をDOMに反映（メインスレッド）
        for (const update of updates) {
            const elements = shipElements.get(update.shipId);
            if (elements) {
                elements.progressBar.style.width = `${update.progress}%`;
                elements.etaText.textContent = update.eta;
            }
        }

        if (updates.length > 0) {
            animationFrameId = requestAnimationFrame(animate);
        }
    };

    animate();
}
```

**効果:**
- メインスレッドの負荷が軽減
- UIがより滑らかに
- 大量の船でもスムーズ

---

## 5. セキュリティの問題

### 問題点
```javascript
// クライアントから直接Firestoreにアクセス
const shipsRef = collection(firestore, 'ships');
const q = query(shipsRef, where('playFabId', '==', playFabId));
```

- Firestoreセキュリティルールに完全依存
- 不正なクエリを防げない可能性

### 解決策: Firestore Security Rulesの強化

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /ships/{shipId} {
      // 読み取り: 認証済みユーザーのみ
      allow read: if request.auth != null;

      // 書き込み: サーバーのみ（Admin SDK）
      allow write: if false;

      // 自分の船のみ詳細が見える
      allow get: if request.auth != null &&
                    (resource.data.playFabId == request.auth.uid ||
                     distance(request.auth.token.location, resource.data.position) < 1000);
    }
  }
}
```

---

## 6. エラーハンドリングの不足

### 問題点
- ネットワークエラー時の再接続ロジックがない
- Firestore接続切断時の処理が不十分

### 解決策: リトライロジックとフォールバック

```javascript
function displayPlayerShipsWithRetry(playFabId, retryCount = 0) {
    const MAX_RETRIES = 3;

    try {
        playerShipsListener = onSnapshot(q,
            async (snapshot) => { /* ... */ },
            (error) => {
                console.error('[DisplayPlayerShips] Listener error:', error);

                if (retryCount < MAX_RETRIES) {
                    console.log(`Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
                    setTimeout(() => {
                        displayPlayerShipsWithRetry(playFabId, retryCount + 1);
                    }, 2000 * Math.pow(2, retryCount)); // Exponential backoff
                } else {
                    // フォールバック: REST APIで取得
                    fallbackToRestApi(playFabId);
                }
            }
        );
    } catch (error) {
        console.error('Failed to start listener:', error);
    }
}

async function fallbackToRestApi(playFabId) {
    const ships = await getPlayerShips(playFabId); // 既存のREST API
    // 静的な表示（リアルタイム更新なし）
}
```

---

## 7. メモリリークの可能性

### 問題点
```javascript
let cachedShipsData = new Map();
```

- キャッシュが無限に増える可能性
- 古いデータが削除されない

### 解決策: LRUキャッシュの実装

```javascript
class LRUCache {
    constructor(maxSize = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    get(key) {
        if (!this.cache.has(key)) return null;

        // アクセスされたら末尾に移動（LRU）
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // 最も古いエントリを削除
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
}

let cachedShipsData = new LRUCache(100); // 最大100隻
```

---

## 優先度付きの実装ロードマップ

### 🔴 **最優先（すぐに実装すべき）**
1. **Geohash地理クエリ** - スケーラビリティの根本問題
2. **PlayFab資産データのキャッシング** - 不要なリクエストを削減
3. **差分更新** - ちらつきとパフォーマンス改善

### 🟡 **中優先（近いうちに実装）**
4. **エラーハンドリング強化** - 安定性向上
5. **LRUキャッシュ** - メモリリーク防止
6. **Firestore Security Rules** - セキュリティ強化

### 🟢 **低優先（余裕があれば）**
7. **WebWorkerアニメーション** - 大規模環境での最適化

---

## コスト試算（参考）

### 現在の実装
- プレイヤー数: 1000人
- 船の総数: 3000隻
- Firestore読み取り: 3000 × 100回/日 = **300,000回/日**
- 月額コスト: 約$10-20

### 改善後の実装
- 同じ条件
- Firestore読み取り: 10 × 100回/日 = **1,000回/日**
- 月額コスト: 約$0.1-0.5

**99%のコスト削減が可能！**
