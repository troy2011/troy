# 前世動物診断の運用

店舗画面の12問画像診断から、次の公開プロフィールを一人一回だけ確定します。

- MBTIの4軸を参考にした具体的な性格特徴
- 365種類から選ばれる前世の動物
- 動物の生態と性格傾向を重ねた「前世の記憶」
- 動物ごとに一対一で割り当てた、人生の分岐を予告する「アルカナの日」
- 診断済みプレイヤー同士の相性

この診断はMBTI公式診断ではありません。E/I・S/N・T/F・J/Pの4軸を使ったTROY独自のエンターテインメントです。

## 環境変数

- `PERSONALITY_ASSESSMENT_ENABLED=true`
- `PERSONALITY_ASSESSMENT_SIGNING_SECRET`: 回答トークン署名用の十分に長いランダム文字列
- `PERSONALITY_ASSESSMENT_TERMINAL_TOKEN`: 店舗端末確認用の24文字以上のランダム文字列

旧版からの無停止移行のため、従来の`SPECIAL_ABILITY_*`も一時的な予備値として読み込みます。Render側を上記3項へ移行した後は、従来キーを削除できます。診断結果の旧データは読み込みません。
従来の店舗端末URLに含まれる`abilityTerminal`も移行期間は受け付け、読み込み後すぐURLから除去します。

機能を有効にした店舗端末では、次のURLを一度開きます。端末セッションはブラウザへ保存されます。

```text
https://troy-xetw.onrender.com/tarot-reading.html?personalityTerminal=<PERSONALITY_ASSESSMENT_TERMINAL_TOKEN>
```

## 保存

- PlayFab ReadOnly Data（非公開）: `PersonalityDestinyV2`
- Firestore一回制ロック: `personality_assessments_v2/{playFabId}`

PlayFabへ保存するのは、バージョン、動物ID、確定時刻、結果ハッシュと内部判定値です。鑑定文はサーバー側のカタログから復元します。内部判定値、反応速度、候補順位、内部ベクトルはプロフィールAPIへ返しません。

本人と店舗画面には、特徴、前世の記憶、性格の核心、強み、偏りやすい点、人間関係、具体的な助言、アルカナの日の未来予知を含む完全版を表示します。他プレイヤーには、特徴、動物の本質、アルカナの日と短い予兆だけを表示します。

## 相性

相性は本人認証済みのプロフィール画面から利用します。二人の非公開な性格傾向と、各動物の関係特性を組み合わせ、恋愛・友情・仕事・衝突時の4項目を算出します。結果は入力順に左右されません。

## 保守コマンド

```bash
npm run personality:generate
npm run personality:images
npm run personality:audit
npm run personality:test
npm run personality:demo
```

`personality:generate`は365動物のV3個別鑑定データを再生成します。`personality:images`は作業用PNGを公開用768px WebPへ揃えます。生成後は必ず監査とテストを実行してください。監査は365件の前世記憶・未来予知・公開用予兆、日付、候補到達性、66,795組の相性、画像ファイルを検証します。
