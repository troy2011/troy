# Testing guide

## 現在の仕組み

- Playwright specs: `tests/*.spec.js`
- 共通 LIFF/Firebase/API mock: `tests/helpers/main-app-harness.js`
- Node test: `tests/music-game-server.test.cjs`, `tests/stylelint-rules.test.cjs` 等
- E2E config: `playwright.config.cjs`
- CSS lint: `npm run lint:css`
- encoding check: `npm run check:encoding`

`npm test` は `npm run test:e2e` を実行し、その pretest で CSS lint も実行する。本番 PlayFab／Firebase に書く script と通常テストを混同しない。

## 変更別の最低確認

| 変更 | 最低限の確認 |
| --- | --- |
| ドキュメントのみ | `npm run check:encoding`、リンク／path の目視、`git diff --check` |
| 共通 UI/HTML | `tests/main-app.spec.js` の対象 test、390x844 前後の mobile 表示、console error |
| CSS | `npm run lint:css`、対象画面 screenshot、重複 selector がないこと |
| API route | 対応 `*-routes.spec.js`、成功・400・401・403・外部 API 失敗 |
| 認証/LIFF | `tests/s1-browser-auth.spec.js`, `tests/main-app.spec.js`, `tests/line-friend-bonus.spec.js`、token なし・別 UID・expired token、PlayFab Browser API通信が0件であること |
| Economy/G/item | `tests/economy.spec.js`, inventory/shop/equipment 対応 spec、残高不足・二重送信・途中失敗 |
| Ship/island/map | ship/map/island 関連 spec、PlayFab 正本と Firestore 投影の片側失敗 |
| Tarot/RTDB | tarot 関連 spec と `tests/tarot-kingdom-rtdb-rules.spec.js`、host/guest/第三者、秘密情報分離 |
| Nation/guild/TROY | nation/guild/TROY 関連 spec、王/一般/別国家、idempotency、SSE 再接続 |
| Catalog/scripts | dry-run、対象件数、差分、明示承認なしに publish しない |

## セキュリティ回帰の共通ケース

状態変更 API には少なくとも次を用意する。

1. 有効な Firebase ID token と一致する PlayFab ID
2. Bearer token なし
3. token UID と body/path の PlayFab ID が異なる
4. 一般 player が王／staff 操作を要求
5. 同じ request ID の再送
6. PlayFab 成功後に Firestore が失敗、または逆
7. amount/score が負、0、小数、上限超過、文字列、極端な値
8. target item/ship/island/guild が本人所有でない

クライアント UI で button を隠すことは権限試験にならない。API を直接呼んだ試験を作る。

## Firebase Rules

Realtime Database rules は JSON 構造の静的 test がある。可能なら Firebase Emulator を使う実評価 test へ拡張する。

Firestore rules は現在リポジトリにないため、直接クライアント access の完全な回帰試験はできない。配備 rules を取り込んだ後、owner/participant/unauthenticated の emulator test を追加する。

## 実行例

PowerShell では対象を変数に定義してから使う。

```powershell
$spec = 'tests/economy.spec.js'
npx playwright test $spec
```

```powershell
$spec = 'tests/tarot-kingdom-rtdb-rules.spec.js'
npx playwright test $spec
```

```powershell
$script = 'lint:css'
npm run $script
```

全体確認:

```powershell
$script = 'test'
npm run $script
```

## テストを通すためにしてはいけないこと

- 認証・所有権・上限 validation を弱める
- flaky test を理由なく削除／skip する
- production fallback を mock 専用分岐にする
- `stylelint-baseline.json` を承認なしに更新する
- PlayFab catalog publish、Firebase deploy、migration、実ユーザーへの付与を通常 test として実行する

## AI Test Architecture

2026-09-05: Phase 1 の最小 PoC を追加。本番のアプリ・認証・報酬仕様は変更しない。監査上の既知問題（`security-auth-audit.md`）の修正／安全性保証ではない。

### 調査結果と段階導入

| 領域 | 現在確認できること | 未確認・制約 |
| --- | --- | --- |
| 共通 UI / ホーム / 店舗 / 所持品 | 本物の HTML / ES modules に対する DOM 操作。既存 `main-app`, `home-v3`, `troy-orders`, inventory 系 spec がある | DOM の表示残高は Economy V2 の正本ではない |
| LIFF / LINE / PlayFab / Firebase Auth | `main.js:initializeLiff` → login-playfab → Firebase sign-in → player-bootstrap → home を SDK/API fixture で実行 | 実 LIFF 内外ブラウザ、LINE token 検証、PlayFab 設定、実 Firebase token の検証は別試験 |
| Firestore / RTDB | `main-app-harness.js` の SDK mock。RTDB はメモリ内値・listener、Firestore は空 snapshot が中心 | 配備 Rules、競合、実 listener 数、実データ永続化は検証しない。Firestore Rules は repo にない |
| Console / Network / ロード | 新 PoC で error、pageerror、API status、コア契約、実行中 API、spinner、ホーム ready を取得 | 監視は指定チェックポイントまで。後で始まる全バックグラウンド処理の完了を保証しない |
| タロット | 既存の専用 spec / preview harness で局所状態・戦闘を検証できる | `tarotKingdom.js` の `kingdomNpcRandom` / `kingdomCombatRandom` と直接 `Math.random` が混在。全ゲームの seed 再現は未実装 |
| Phaser / 海戦 / ワールド | `WorldMapScene.js` は Phaser.Scene。既存 map spec あり | 今回は `Game.js` を stub 化。canvas の敵・座標・animation・loaded assets は DOM から確定不可 |

導入順:

1. **今回**: ホーム起動、共通 DTO、監視、条件待機、fixture 障害→修復再実行、モバイル撮影。
2. **認証**: 新規ユーザー、LIFF redirect、期限切れ、Firebase sign-in 失敗／UID 不一致等の fixture。実環境検証は別 LINE channel / PlayFab title / Firebase project と権限を確認してから。
3. **主要画面**: 店舗・所持品・国家・共通モーダルの named scenario と API 契約を追加。全画面 pixel-perfect 固定は避け、重要画像／操作要素と選択した screenshot を確認。
4. **ゲーム**: タロット、海戦、Phaser の読み取り DTO（scene 名 enum、座標、phase、animation idle 等）を責務別に設計。Phaser オブジェクト全体は公開しない。報酬を決める API と DB Rules は別のサーバー／Emulator 試験で検証。

時刻は `Date.now()` が探索期限・船 cooldown・animation 等に使われる。既存 harness の `fixedHour` は見た目の昼夜だけ。今回は全体 Clock / RNG 抽象化を導入しない。次段階で必要な箇所だけテスト用 `page.clock` や純粋関数への入力注入を検討し、本番 query / global から seed・時刻・勝敗を変更できる機能は作らない。

### 構成と本番との分離

- `playwright.ai.config.cjs`: `npm run test:ai` 専用。明示された production / その他の NODE_ENV は拒否。test/development または未指定時のみテスト環境を設定する。
- `scripts/playwright-static-server.js`: public のみを配信、固定 `127.0.0.1:4187`。既存サーバーを再利用しないため、そのポートの Express に誤接続しない。Express、`.env`、Admin SDK はこの runner では起動しない。
- `tests/helpers/troy-ai-harness.cjs`: 既存 `installBaseAppMocks` を再利用、fixture 以外の外部 HTTP と未定義 API は 501 で遮断。静的 GET 以外の同 origin 要求も通さない。WebSocket は接続を転送せず close、Service Worker は block、Chromium の外部 DNS 解決も無効。
- `tests/helpers/troy-debug-bridge.cjs`: test/development + `TROY_AI_TEST=1` + 上記 exact origin の三条件。さらに runner からの注入が必要。public / server からの import はなく、本番配信物に Bridge を追加しない。URL パラメータや localStorage だけで有効化できない。
- `tests/fixtures/troy-ai-scenarios.cjs`: synthetic `PF_PLAYWRIGHT` のみ。LINE/PlayFab/Firebase を実際には呼ばず、Auth mock は signed-out から fixture token による sign-in を経る。国家 human/fire、250 G の表示、船／ギルドなし。SDK mock の書込はローカルメモリまたは no-op であり、本番書込にはならない。
- `tests/ai-app-poc.test.cjs`: 操作、期待値比較、正常／障害再現、基盤自身のガード試験。

これは信頼できるテストコードの誤接続を防ぐ仕組みで、悪意ある任意 Node.js コードを隔離する OS sandbox ではない。runner から本番用 credential や storageState を読み込まない。既存の別テスト群にこの通信ガードを自動適用したわけではない。

### Debug Bridge と待機条件

テストページのコンソール／Playwright evaluate から:

```javascript
await window.__TROY_DEBUG__.getState();
window.__TROY_DEBUG__.getAuthState();
window.__TROY_DEBUG__.getGameState();
await window.__TROY_DEBUG__.getNetworkSummary();
```

状態は新しい DTO として返し、ネストまで freeze する。実オブジェクト参照・setter は返さない。公開するのは screen enum、認証観測 boolean、ready、spinner、表示 G など。LIFF profile / PlayFab identity の存在は**観測**であって実サーバーの認証証明ではない。ID・名前は出さず、未観測の inventory/listener/Phaser/progress は `null` とする。

`authReady` / `appReady` には UID 観測の一致と、login-playfab / player-bootstrap の正常契約完了が必要。ホームが見えても bootstrap が失敗していれば ready にしない。実際の `main.js` は bootstrap 失敗後も表示が進むため、この区別が必要。

共通 helper:

- `createTroyAiSession`: 注入・監視・通信ガードを navigation **前**に設定する。
- `waitForTroyReady`: ホーム、認証、コア API 契約、spinner を条件待機する。
- `getTroyDebugState`: 安全な状態取得。
- `assertTroyHealthy`: API in-flight / contract 完了を待ち、未知 error、遮断、HTTP/API 失敗、連打を拒否する。RTDB のような長時間接続を含む万能 networkidle ではない。
- `writeTroyReport`: DTO・API結果・原因候補ファイル・期待値と screenshot を保存する。

G はアニメーション途中の値になり得るため、シナリオでは 250 に到達するまで待つ。固定 sleep は使わない。home の再クリックも実際の DOM 操作で行う。

### Console / Network / 契約 / レポート

未知の `console.error` はすべて検出。uncaught exception / unhandled rejection は Chromium の `pageerror` で検出する。警告は失敗扱いしないが、error の包括 allowlist はない。オンライン font だけは通信せず空 CSS fixture にし、システムフォントで表示する（本番フォントの見た目試験ではない）。

API はソース内の固定 `/api/...` リテラルに一致する path と method/status のみ記録する。不明な path は置換し、query、URL の userinfo、header、body、raw response、raw console message/stack は保存しない。コア API だけ response をメモリ内で検査し、必須 field 型・error 形式・success:false を検証。bootstrap 要求の fixture Bearer 一致は boolean のみ記録する。これはサーバーの token 検証試験ではない。他 API は `not-checked` と明記する。

request / error の詳細は各最大40件、総 error / API failure カウンターは維持する。直近ログ内で同じ API が1秒に4回以上なら連打として検出するが、業務上の二重決済の証明ではない。401/403/404/429/500、malformed 200、未定義 API、秘密文字列を含む console、例外／rejection、Bridge freeze を基盤テストで確認する。

保存先は Git 対象外 `tmp/ai-test-results/`（既存 `npm test` の出力と分離）。`passed.json/png`、`expected-failure.json/png`、`repaired.json/png` または `failed.json/png`。スクリーンショットは synthetic ページのみ、名前と QR をマスク。trace / HAR / video は無効。Playwright 自身が作るエラー context 等を含めて「フォルダ全体が秘密除去済み」とは扱わず、共有は上記の専用 JSON と目視済み画像に限定する。

失敗時は短いレポートの API・contract・sourceHints からコードを `rg` で追い、修正後に**同じ named scenario**を再実行する。PoC の 503 は意図的な fixture 障害であり、本番バグを修正したという意味ではない。想定障害を検出できなければテスト自体が失敗する。

### Codex での実行方法

```powershell
npm run test:ai
npm run test:ai -- --headed
npm run test:ai -- --debug --grep "real client"
npm run check:encoding
```

runner が静的サーバーと Chromium を起動・停止する。`--debug` はローカル fixture 内で操作／Bridge を調べる場合のみ。既存全体試験は `npm test`、PoC は分離された `npm run test:ai` をそれぞれ実行する。Bridge/fixture の追加に実 PlayFab ユーザー作成や Firebase deploy は必要ない。

### 基盤のセキュリティ確認範囲

- 新しい Express debug API、任意 Player ID / G / item / win の変更メソッド、PlayFab 管理操作、Rules bypass、staff PIN 読取は追加していない。
- production 環境・opt-in なし・別 origin を拒否し、Bridge 注入なしの本物の public ページで global が存在しないことを試験する。受信確認用の別ローカル HTTP サーバーに対する POST / WebSocket が実際に0件であることも試験する。
- DTO / 専用 network JSON に synthetic の秘密・ID・名前が漏れないことを試験する。既存本体の Console に秘密が絶対に出ないと保証するものではなく、未知メッセージは採取しない。
- 実サービスの認証・権限・配備 Rules、Phaser 内部、seed 再現、サーバー正本の整合性は今回未検証。既存監査の「発見／未確認／要管理画面確認」は維持する。

### 初回導入時の検証記録（2026-09-05）

PoC は8試験の3回反復が成功。モバイル画像を目視確認し、意図的503の失敗レポートと fixture 修復後の成功を確認した。CSS lint、encoding check も成功（新規 `.cjs` は既存 encoding script の対象外なので、別途 UTF-8 / BOM なしを検査）。

既存 `npm test` は **717成功・11失敗**。今回の唯一の既存 helper 変更（export 追加）を一時的に外し、本体・失敗 spec・helper が HEAD と同じことを `git diff` で確認してから、`--last-failed` で11件を再実行した。結果は **10失敗再現・1成功**。確認後 export は復元した。全体テストを green と扱わず、以下を別途調査する。本番機能や既存テストの期待値は今回変更していない。

| 既存 spec | 初回失敗 | 再確認の内容 |
| --- | --- | --- |
| `main-app.spec.js:8152` | 1 | 装備 UI の position: static 期待に対して relative。再現 |
| `map-tab.spec.js:155` | 1 | 非王の制限文言と、本拠地マップの制限文言の優先順。再現 |
| `tarot-deck-presets.spec.js:8` | 1 | モバイルの guardian 操作要素の可視性。再現 |
| `tarot-kingdom-battlefields.spec.js:167,287,329` | 4 | 戦場設定、敵の depth、390/900px の床位置の期待との差。再現 |
| `tarot-kingdom-character-battle-ui.spec.js:1048,1775` | 2 | 古い武器読込の競合は再実行成功（非決定的要因は未確定）。敵の帰路フレーム順は再現 |
| `tarot-kingdom-major-effects.spec.js:492` | 1 | schema 23 / 現行 major rules の期待との差。再現 |
| `tarot-kingdom-preview-isolation.spec.js:95` | 1 | main.js の旧 release 固定値を期待するテストと現行 HTML が不一致。再現 |
