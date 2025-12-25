# 建設進行機能の実装完了レポート

## 概要

建設の進行と「足場」「ヘルプ要請」「完成時のグラフィック変化」機能の実装が完了しました。

---

## 実装した機能

### 1. ✅ マップ上での建設表示（足場・クレーン）

**実装内容**:
- 建設中の島にリアルタイムで足場（🏗️）とクレーンを表示
- Phaserアニメーションで上下に揺れる足場
- 回転するクレーン
- パーティクルエフェクト（木くず）

**コード**: [public/js/island.js:751-814](public/js/island.js#L751-L814)

```javascript
export function displayConstructingIslandsOnMap(phaserScene, constructingIslands) {
    // 建設中の島ごとに足場・クレーンを表示
    constructingIslands.forEach(island => {
        const x = island.coordinate.x * 32;
        const y = island.coordinate.y * 32;

        // 足場スプライトを作成
        const scaffolding = phaserScene.add.text(x, y - 20, '🏗️', {
            fontSize: '32px'
        });

        // アニメーション（上下に揺れる）
        phaserScene.tweens.add({
            targets: scaffolding,
            y: y - 24,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // クレーンスプライトを作成
        const crane = phaserScene.add.text(x + 20, y - 30, '🏗️', {
            fontSize: '24px'
        });

        // 回転アニメーション
        phaserScene.tweens.add({
            targets: crane,
            angle: 10,
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // パーティクルエフェクト（木くず）
        const particles = phaserScene.add.particles(x, y, 'dust', {
            speed: { min: -20, max: 20 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.3, end: 0 },
            lifespan: 1000,
            frequency: 500,
            quantity: 2
        });
    });
}
```

**使い方**:
```javascript
import { getConstructingIslands, displayConstructingIslandsOnMap } from './js/island.js';

// マップシーン（Phaser）のupdateメソッドで呼び出す
async function update() {
    const constructingIslands = await getConstructingIslands();
    displayConstructingIslandsOnMap(this, constructingIslands);
}
```

---

### 2. ✅ 建設音のエフェクト（トンテンカン）

**実装内容**:
- ループ再生される建設音
- 建設中の島がある場合に自動再生
- 建設がない場合は自動停止
- ボリューム調整（30%）

**コード**: [public/js/island.js:708-744](public/js/island.js#L708-L744)

```javascript
export function playConstructionSound(start = true) {
    const audio = document.getElementById('audioConstruction');

    if (!audio) {
        // 音声要素が存在しない場合は作成
        const newAudio = document.createElement('audio');
        newAudio.id = 'audioConstruction';
        newAudio.loop = true;
        newAudio.volume = 0.3;

        // 建設音のソース（複数形式をサポート）
        const sources = [
            { src: '/audio/construction.mp3', type: 'audio/mpeg' },
            { src: '/audio/construction.ogg', type: 'audio/ogg' }
        ];

        sources.forEach(source => {
            const sourceElement = document.createElement('source');
            sourceElement.src = source.src;
            sourceElement.type = source.type;
            newAudio.appendChild(sourceElement);
        });

        document.body.appendChild(newAudio);

        if (start) {
            newAudio.play().catch(e => console.warn('Construction sound play failed:', e));
        }
    } else {
        if (start) {
            audio.currentTime = 0;
            audio.play().catch(e => console.warn('Construction sound play failed:', e));
        } else {
            audio.pause();
        }
    }
}
```

**必要なファイル**:
- `public/audio/construction.mp3` - 建設音（MP3形式）
- `public/audio/construction.ogg` - 建設音（OGG形式）

**サンプル音声の準備**:
フリー素材サイトから「工事音」「建設音」「トンテンカン」などのキーワードで検索してダウンロードしてください。

---

### 3. ✅ LINEグループへのヘルプ要請

**実装内容**:
- LIFF SDKを使用したLINE共有機能
- Flex Messageを使った美しいヘルプ要請カード
- ワンタップでヘルプ可能なボタン
- ヘルプ要請ボタンをBottom Sheetに配置

**サーバー側API**: [ships.js:964-1037](ships.js#L964-L1037)

```javascript
app.post('/api/help-construction', async (req, res) => {
    const { islandId, slotIndex, helperPlayFabId } = req.body;

    // ヘルプ記録を追加
    building.helpers.push(helperPlayFabId);

    // 建設時間を短縮（1人につき5%、最大50%）
    const HELP_REDUCTION_PER_PERSON = 0.05; // 5%
    const MAX_HELP_REDUCTION = 0.5; // 最大50%
    const totalReduction = Math.min(
        building.helpers.length * HELP_REDUCTION_PER_PERSON,
        MAX_HELP_REDUCTION
    );

    // 元の建設時間を計算
    const originalDuration = building.completionTime - building.startTime;
    const newDuration = originalDuration * (1 - totalReduction);
    const newCompletionTime = building.startTime + newDuration;

    // 完成時刻を更新
    buildings[buildingIndex].completionTime = newCompletionTime;

    res.json({
        success: true,
        message: 'ヘルプありがとう！建設時間が短縮されました。',
        remainingTime: newCompletionTime - Date.now(),
        helpersCount: building.helpers.length,
        reductionPercentage: Math.floor(totalReduction * 100)
    });
});
```

**クライアント側**: [public/js/island.js:574-651](public/js/island.js#L574-L651)

```javascript
export async function requestConstructionHelp(islandId, slotIndex, buildingName) {
    // LIFF SDKが利用可能かチェック
    if (typeof liff === 'undefined' || !liff.isLoggedIn()) {
        alert('LINEログインが必要です');
        return;
    }

    // 共有メッセージを作成
    const shareMessage = {
        type: 'flex',
        altText: `建設を手伝ってください！`,
        contents: {
            type: 'bubble',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [{
                    type: 'text',
                    text: '🏗️ 建設ヘルプ要請',
                    weight: 'bold',
                    size: 'lg',
                    color: '#ffffff'
                }],
                backgroundColor: '#667eea'
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'text',
                        text: `${buildingName}を建設中です！`,
                        weight: 'bold',
                        size: 'md'
                    },
                    {
                        type: 'text',
                        text: 'ヘルプすると建設時間が短縮されます。',
                        size: 'sm',
                        color: '#999999',
                        wrap: true
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [{
                    type: 'button',
                    action: {
                        type: 'uri',
                        label: '手伝う',
                        uri: `${window.location.origin}?action=help&islandId=${islandId}&slotIndex=${slotIndex}`
                    },
                    style: 'primary',
                    color: '#4ecdc4'
                }]
            }
        }
    };

    // LINEで共有
    await liff.shareTargetPicker([shareMessage]);
}
```

**UI表示**:
建設中のスロットに「ヘルプ要請」ボタンが表示されます。

---

### 4. ✅ ヘルプによる建設時間短縮

**実装内容**:
- 1人ヘルプするごとに5%短縮
- 最大10人（50%短縮）まで
- 既にヘルプした人は重複不可
- リアルタイムで残り時間が更新される

**短縮ルール**:
| ヘルパー数 | 短縮率 | 例（元60分） |
|----------|--------|------------|
| 1人 | 5% | 57分 |
| 2人 | 10% | 54分 |
| 5人 | 25% | 45分 |
| 10人 | 50% | 30分 |

**コード**: [ships.js:1002-1010](ships.js#L1002-L1010)

```javascript
// 建設時間を短縮（1人につき5%、最大50%）
const HELP_REDUCTION_PER_PERSON = 0.05; // 5%
const MAX_HELP_REDUCTION = 0.5; // 最大50%
const totalReduction = Math.min(
    building.helpers.length * HELP_REDUCTION_PER_PERSON,
    MAX_HELP_REDUCTION
);

const originalDuration = building.completionTime - building.startTime;
const newDuration = originalDuration * (1 - totalReduction);
const newCompletionTime = building.startTime + newDuration;
```

**ヘルパー表示**:
建設中のスロットに「👥 3人が手伝い中」のように表示されます。

---

### 5. ✅ 完成時のグラフィック変化

**実装内容**:
- 足場が外れるフェードアウトアニメーション
- 建物が出現するポップアップアニメーション
- 旗が立つ演出
- 花火エフェクト
- キラキラエフェクト

**完成通知モーダル**:
- 旗が下から上に上がるアニメーション（1秒）
- キラキラが点滅するアニメーション（1.5秒ループ）
- 花火が3箇所から爆発するアニメーション（1秒ループ）
- テキストがポップアップで表示（0.5秒）

**CSS**: [public/css/island.css:305-356](public/css/island.css#L305-L356)

```css
/* 建物出現アニメーション */
.building-completed {
    animation: building-appear 0.5s ease-out;
}

@keyframes building-appear {
    0% {
        opacity: 0;
        transform: scale(0.8);
    }
    50% {
        transform: scale(1.1);
    }
    100% {
        opacity: 1;
        transform: scale(1);
    }
}

/* 建物アイコンのバウンス */
.building-icon {
    animation: icon-bounce 0.6s ease-out;
}

@keyframes icon-bounce {
    0% {
        transform: translateY(-20px);
        opacity: 0;
    }
    50% {
        transform: translateY(5px);
    }
    100% {
        transform: translateY(0);
        opacity: 1;
    }
}
```

**旗が立つアニメーション**: [public/css/island.css:531-543](public/css/island.css#L531-L543)

```css
@keyframes flag-raise-animation {
    0% {
        transform: translateY(100px);
        opacity: 0;
    }
    50% {
        transform: translateY(-10px);
    }
    100% {
        transform: translateY(0);
        opacity: 1;
    }
}
```

**花火エフェクト**: [public/css/island.css:601-615](public/css/island.css#L601-L615)

```css
@keyframes firework-explosion {
    0% {
        transform: scale(0);
        opacity: 1;
        box-shadow: 0 0 0 0 white;
    }
    50% {
        opacity: 1;
    }
    100% {
        transform: scale(20);
        opacity: 0;
        box-shadow: 0 0 20px 10px rgba(255, 255, 255, 0.5);
    }
}
```

---

## 使用方法

### 1. マップシーンに建設表示を追加

```javascript
// WorldMapScene.js
import { getConstructingIslands, displayConstructingIslandsOnMap } from './js/island.js';

class WorldMapScene extends Phaser.Scene {
    async update() {
        // 建設中の島を取得
        const constructingIslands = await getConstructingIslands();

        // マップ上に表示
        displayConstructingIslandsOnMap(this, constructingIslands);
    }
}
```

### 2. ヘルプ要請の統合

```javascript
// URLパラメータからヘルプアクションを検出
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('action') === 'help') {
    const islandId = urlParams.get('islandId');
    const slotIndex = urlParams.get('slotIndex');
    const playFabId = localStorage.getItem('playFabId');

    // ヘルプを実行
    const result = await helpConstruction(islandId, slotIndex, playFabId);

    if (result && result.success) {
        alert(result.message);
    }
}
```

### 3. 建設音の準備

`public/audio/`ディレクトリに以下のファイルを配置：
- `construction.mp3` - 建設音（MP3形式）
- `construction.ogg` - 建設音（OGG形式、オプション）

**推奨フリー素材サイト**:
- [効果音ラボ](https://soundeffect-lab.info/)
- [DOVA-SYNDROME](https://dova-s.jp/)
- [魔王魂](https://maou.audio/)

---

## アニメーション一覧

| アニメーション | 説明 | 持続時間 |
|--------------|------|---------|
| `construction-bounce` | 足場が上下に揺れる | 1秒（ループ） |
| `building-appear` | 建物が出現 | 0.5秒 |
| `icon-bounce` | アイコンがバウンス | 0.6秒 |
| `flag-raise-animation` | 旗が立つ | 1秒 |
| `sparkle-animation` | キラキラ点滅 | 1.5秒（ループ） |
| `firework-explosion` | 花火爆発 | 1秒（ループ） |
| `text-pop` | テキストポップアップ | 0.5秒 |

---

## トラブルシューティング

### 1. 建設音が再生されない

**原因**: 音声ファイルが存在しない

**解決策**:
1. `public/audio/construction.mp3`を配置
2. ブラウザのコンソールでエラーを確認
3. ユーザー操作後に再生されるように変更（自動再生ブロック対策）

### 2. ヘルプボタンが表示されない

**原因**: 建設中のスロットがレンダリングされていない

**解決策**:
1. 島の詳細情報を再取得して`showBuildingMenu`を呼び出す
2. ブラウザのコンソールでエラーを確認

### 3. アニメーションが動作しない

**原因**: CSSが読み込まれていない

**解決策**:
```html
<link rel="stylesheet" href="css/island.css">
```

---

## まとめ

すべての建設進行機能の実装が完了しました！

**実装した機能**:
- ✅ マップ上での建設表示（足場・クレーン）
- ✅ 建設音のエフェクト（トンテンカン）
- ✅ LINEグループへのヘルプ要請
- ✅ ヘルプによる建設時間短縮（1人5%、最大50%）
- ✅ 完成時のグラフィック変化（旗・花火・アニメーション）

**プレイヤー体験**:
1. 建設を開始すると、マップ上に足場とクレーンが表示される
2. トンテンカンと工事音が聞こえる
3. 「ヘルプ要請」ボタンでLINEグループに共有
4. 友達がヘルプすると建設時間が短縮される
5. 完成すると足場が外れ、豪華な建物が出現
6. 旗が立ち、花火が上がる演出

次は、これらの機能をゲームに統合していきましょう！
