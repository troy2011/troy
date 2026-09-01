# TROY repository rules

このファイルは、Codex が作業開始時に読む簡潔なルールブックである。詳細は `docs/architecture.md`、`docs/playfab.md`、`docs/firebase.md`、`docs/liff.md`、`docs/testing.md` を参照する。認証・権限の既知問題は `docs/security-auth-audit.md`、全API一覧は `docs/express-api-auth-inventory.md` を正本とする。

## プロジェクト概要

TROY は LINE LIFF 上で動くスマートフォン向けゲーム／実店舗連携アプリである。プレイヤーは国家・ギルド・船・島を持ち、探索、戦闘、タロット系ゲーム、資源・装備・G の経済、ランキング、実店舗イベントや注文機能を利用する。

## 技術構成

- Node.js / CommonJS、Express 5 の単一サーバー (`server.js`, `server/`)
- Vanilla JavaScript ES modules と HTML/CSS (`public/`)、一部 Phaser 3
- LINE LIFF SDK と `@line/bot-sdk`
- Microsoft PlayFab SDK: Economy V2、Player Data、Statistics、Groups、Data、Title Data、Legacy CloudScript
- Firebase Admin SDK と Firebase Web SDK: Authentication、Cloud Firestore、Realtime Database
- Playwright による E2E／ルート試験、Node test によるツール試験、Stylelint
- TypeScript は `public/ts/tarot-engine/` の限定的なソースに使用

React、Next.js、Firestore Functions は現在の実装にはない。存在しない技術を前提に設計しない。

## 重要なディレクトリ

- `server.js`: 起動、Firebase/PlayFab/LINE 初期化、認証、依存注入、ルート登録
- `server/`: 機能別サーバーロジック。`server/routes/` は戦闘・ギルド・船等のルート
- `public/`: LIFF クライアント、共通 UI、ゲーム画面、静的アセット
- `playfab_cloudscript/`: 現在も一部が呼ばれる Legacy CloudScript とエフェクト処理候補
- `playfab_catalog/`, `catalog_v2_items.json`: Economy V2 カタログ資料／同期元
- `database.rules.json`: Realtime Database ルール。Firestore ルールではない
- `scripts/`: カタログ同期、監査、画像処理、ローカル補助
- `tests/`: Playwright／Node テスト
- `docs/`: アーキテクチャと機能資料。`*_COMPLETE.md` 等は履歴資料であり現行仕様とは限らない

## データ責務と正本

| データ | Source of Truth | 補足 |
| --- | --- | --- |
| LINE 本人性 | LINE API で検証したアクセストークン | クライアント送信の `lineUserId` やプロフィールを信用しない |
| API のログイン主体 | Firebase Auth の ID token | UID は PlayFab ID。サーバーで token と要求 PlayFab ID を照合する |
| G (`PS`)・資源通貨・所持品 | PlayFab Economy V2 inventory | `ps_ranking` は検索用の派生統計で残高の正本ではない |
| PlayerData、装備、恒久成長 | PlayFab ReadOnly/Internal Data と Statistics | 更新はサーバー側のみ。キー追加・意味変更はスキーマ変更として扱う |
| ランキング | PlayFab Statistics | G ランキング値は Economy 残高から同期される派生値 |
| 国家／ギルドのメンバーと共有データ | PlayFab Groups / Entity Objects | Firestore の対応文書は検索・運用用の投影または索引 |
| 船の所有・能力・積荷 | PlayFab Player Data / Economy | Firestore `ships` は位置・見た目・オンライン投影。HP 等の複製値を正本にしない |
| 島・ワールド・店舗・共有進行状態 | Cloud Firestore | 具体的なコレクションと例外は `docs/firebase.md` を参照 |
| タロットオンラインルーム | Firebase Realtime Database | `database.rules.json` とクライアント／サーバーの双方を同時に確認する |
| LIFF とブラウザ状態 | 画面制御と一時設定のみ | localStorage/sessionStorage を報酬、G、勝敗、クールダウンの権威にしない |

同じ値を別サービスへ保存する場合、片方を正本、他方をキャッシュ／索引／投影と明記し、書込関数と再同期方法を一本化する。詳細は `docs/architecture.md`。

## セキュリティルール

- クライアントの PlayFab ID、LINE user ID、金額、報酬、勝敗、スコア、乱数結果、所有権、王／スタッフ権限を信用しない。
- 状態変更 API は Firebase ID token を検証し、認証 UID と対象 PlayFab ID を照合する。公開読取 API 以外で認証を省略しない。
- G (`PS`) と資源は Economy V2 の `GetInventoryItems` / `AddInventoryItems` / `SubtractInventoryItems` / `PurchaseInventoryItems` を使う。全要求に `Entity: { Id, Type }` を含める。
- Economy V2 に legacy `PlayFabClient` / `PlayFabServer` economy API を使わない。Player Data、Statistics 等の非 Economy API は対象外。
- 報酬付与と決済はサーバー権威、整数化、上限確認、所有権確認、可能な限り idempotency ID 付きで行う。
- `.env`、PlayFab secret、LINE channel secret/token、Firebase service account をログ、クライアント、Git に出さない。Firebase Web config と LIFF ID は公開識別子であり、秘密の代わりにはならない。
- Firestore／RTDB の直接クライアントアクセスを追加・変更するときはルールを同じ変更で確認する。Firestore ルールは現在このリポジトリに無いため、統合担当の承認なしに直接書込を増やさない。
- CloudScript、Firebase ルール、認証境界、G、報酬、ランキングの変更は必ず統合担当と該当データ担当がレビューする。

## コーディング方針

- 初心者が追える可読性を最優先し、過度な抽象化を避ける。
- 巨大関数を増やさず、既存モジュールの責務に沿って小さく分ける。ただし必要以上にファイルやクラスを増やさない。
- 意味の分かる名前と名前付き定数を使い、マジックナンバーを避ける。
- コメントは処理の再説明ではなく「なぜ必要か」「どの正本を守るか」を中心に書く。
- 既存の動く処理を理由なく全面書き換えしない。古い・重複・未使用に見えるコードは利用箇所とデプロイ状況を確認し、勝手に削除しない。
- PlayFab 呼び出し元は async/await と `try/catch` を使う。SDK callback の Promise 化は `server/playfab.js` 等の中央ラッパーに限定する。
- Firestore の負荷を増やす前に PlayFab の既存正本／索引で解決できないか確認する。ただし、PlayFab へ無秩序にリアルタイム状態を複製しない。

## Codex タスク分担

担当はサービス名だけで切らず、機能のまとまりで 6 担当に分ける。各タスクは原則として一つの担当を主担当にする。

### 1. 統合・基盤・セキュリティ

- 主対象: `server.js`, `server/auth.js`, `server/playfab.js`, `public/js/api.js`, `public/js/config.js`, `firebase.json`, `database.rules.json`, `package.json`, `AGENTS.md`, `docs/`
- 可: 認証・API契約・依存注入・設定・共通データ境界・統合テストの調整
- 不可: 機能仕様や報酬値を単独判断で変更
- 共有必須: API、env、認証、DB/PlayerData、Source of Truth、共通レスポンスの変更

### 2. クライアント基盤・LIFF・共通 UI

- 主対象: `public/index.html`, `public/main.js`, `public/style.css`, `public/css/`, `public/js/api.js`, `public/js/ui.js`, `public/js/modal*.js`, `public/js/panelSlice25.js`, PWA ファイル
- 可: LIFF 起動、画面遷移、共通コンポーネント、アクセシビリティ、表示のみの改善
- 不可: クライアントだけで報酬・所有権・勝敗を確定、認証方式や API 契約を単独変更
- 共有必須: DOM ID、共有 CSS、LIFF scope/ID、認証フロー、共通イベント名の変更

### 3. プレイヤー・PlayFab 経済・成長

- 主対象: `server/economy.js`, `server/inventory.js`, `server/equipmentEnhancement.js`, `server/statAllocation.js`, `server/playerLevel.js`, `server/gacha.js`, `server/shop*.js`, `server/resourceStorage.js`, 対応する `public/js/inventory.js`, `player*.js`, `rankingUi.js`, カタログと同期 scripts
- 可: Economy V2、所持品、G/資源、装備、能力値、ランキング派生値の実装と試験
- 不可: 認証、国家・ギルド共有データ、Firestore 世界状態を単独変更
- 共有必須: currency/item ID、PlayerData key、Statistic name、報酬、価格、カタログ schema の変更

### 4. ワールド・国家・ギルド・実店舗

- 主対象: `server/island.js`, `map.js`, `building.js`, `nation.js`, `events.js`, `chat.js`, `troy*.js`, `guildShipSharing.js`, `server/routes/guildRoutes.js`, `shipRoutes.js`, `territoryRoutes.js`, `weeklyContestRoutes.js`, `public/WorldMapScene.js`, 対応する island/ship/nation/guild/troy UI
- 可: Firestore の共有世界、船の投影、国家・ギルド、店舗イベント／注文の実装と試験
- 不可: PlayFab 正本を Firestore に移す、G/権限/CloudScript 契約を単独変更
- 共有必須: コレクション、ドキュメント ID、PlayFab Group Object、Title Data、船・島の正本境界の変更

### 5. タロット・戦闘・探索ゲーム

- 主対象: `server/exploration.js`, `server/tarot*.js`, `server/routes/battle*.js`, `cardRoutes.js`, `public/js/tarot*.js`, `spinTarot*.js`, `public/ts/tarot-engine/`, `playfab_cloudscript/EffectProcessor*`, 対応 CSS/HTML/data
- 可: ゲームルール、戦闘、探索、カード、RTDB ルーム処理と決定的なテスト
- 不可: クライアント／ルームホストの申告だけで恒久報酬を付与、RTDB ルールを単独変更
- 共有必須: 勝敗・報酬検証、乱数、RTDB schema/rules、PlayerData/Statistic、CloudScript デプロイ契約の変更

### 6. QA・ツール・ドキュメント

- 主対象: `tests/`, `playwright.config.cjs`, `scripts/`, `tools/`, Stylelint 設定、`docs/`
- 可: 回帰テスト、fixture/harness、検証 scripts、現行実装に沿う文書更新
- 不可: テストを通す目的で本番仕様を変える、lint baseline を勝手に更新、破壊的な本番同期 script を実行
- 共有必須: fixture の共通契約、テスト前提、カタログ publish/migration、既存テスト削除

統合担当は担当境界、共有契約、正本データ、マージ順、横断レビュー、最終テストを管理する。対象ファイルが重なる場合は先に主担当を一人決め、同じファイルを並行編集しない。

## 変更時ルール

1. 変更前に呼出元、保存先、認証、既存テストを `rg` で追う。
2. API path/body/response、DB collection/path/schema、PlayerData key、Statistic、item/currency ID、認証、保存場所を変える場合は、依存箇所と移行・後方互換・rollback を記録する。
3. 二重書込を追加しない。必要なら正本、派生先、失敗時の再同期を同じ変更に含める。
4. 古い実装・重複を発見しても利用実態を確認するまで削除しない。CloudScript はリポジトリ参照だけでなく PlayFab 側の配備確認も必要。
5. ユーザーの未コミット変更を上書き・整形・削除しない。無関係な変更は混ぜない。
6. 各コマンドは変数を定義してから使う。PowerShell の `$` を不要にエスケープしない。ファイルは UTF-8 BOM なしを維持する。

## CSS 保守

- 変更前に対象要素へ当たる全ルールを検索し、canonical rule をその場で直す。
- 後置き重複 selector、同一 simple selector の反復、`!important`、不要な specificity 上昇で解決しない。
- 編集範囲の古い宣言と重複 selector は整理する。意図的な state/breakpoint/theme override は base rule の近くに置く。
- CSS 変更後は `npm run lint:css`。`stylelint-baseline.json` は明示承認なしに更新しない。

## テスト方針

- 最小: 変更ファイルに対応する Playwright spec または Node test、`npm run check:encoding`。
- CSS 変更: `npm run lint:css` と対象画面の mobile viewport 確認。
- 認証/API/DB/PlayFab/RTDB 変更: 成功、未認証、別ユーザー ID、重複要求、失敗途中、再試行を確認。
- G/報酬/ランキング変更: 増減、残高不足、上限、idempotency、派生ランキング同期を確認。
- 共有契約や広範囲変更: 最後に `npm test`。秘密情報や本番 publish を必要とする script は自動実行しない。
- 詳細な対応表は `docs/testing.md` を参照する。
