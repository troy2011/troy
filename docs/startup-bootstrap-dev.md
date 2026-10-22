# TROY 起動改善・ローカル開発版

> 以下は公開前の開発検証記録です。統合公開時の範囲と確認は [startup-kingdom-release.md](startup-kingdom-release.md) を参照。

公開済み `2c385002b1c9d075d17c696ad691349e189f3992` を基準に、`dev/startup-bootstrap` へ分離した。元の41件の変更とKingdom開発コピーは変更していない。push・deploy・本番/有料プラン変更なし。

## 変更

- importmapで `inventory` / `ui` と相対URLを同じ版付きURLへ統一。初回の各2取得を各1取得にし、共有状態も同一モジュールへ揃えた。
- Noto Sans JPの字体・400/700/900指定は維持。フォントCSSを非ブロッキングにし、JavaScript無効時のstylesheetも残した。既存のdisplay=swapと同じく、取得中は一時的に代替字体になる。
- 起動画像は原寸941×1672のAVIF、192,639バイトへ変換。原本WebP257,450バイトを保持。AVIF非対応時と読込失敗時は原本へ戻る。位置・object-fit・構図は変更していない。
- 開発用静的サーバーにAVIFのMIMEを追加。再生成スクリプトと対象テストを追加。
- 認証・API・データ・報酬・LINE送信・ゲーム規則・タロット画像・Service Workerは変更なし。

## 比較条件と実測

前後とも家PC Chromium、同じ127.0.0.1:4213のHTTPサーバー、同じBrotli quality 5・ETag・max-age=0、390×844・DPR1。各条件3回の中央値。初回は新規ブラウザコンテキスト、再読込は同じコンテキストのpage.reload。SWは双方とも遮断してHTTPキャッシュを比較した。スマホ模擬は下り1.6Mbps・上り750kbps・遅延150ms・CPU4倍低速。実機値や本番への改善量ではない。

実LIFF SDKの非ログイン初期化まで実行し、LINE認証画面への遷移要求を204へ置換して停止。アプリAPIは全て遮断。実ログイン後の操作可能時刻は測っていない。「表示」は起動画像のFCP、「引渡し」はLINE遷移要求時点。転送量はその後network-idleまでの素材も含め、フォントを後から読むだけの分を削減扱いにしていない。

| 条件 | 表示 秒 前→後 | LINE引渡し 秒 前→後 | 転送バイト 前→後 | 要求数 前→後 |
| --- | --- | --- | --- | --- |
| 通常・初回 | 0.156→0.108 | 0.472→0.562 | 1,642,900→1,515,479 | 81→79 |
| 通常・再読込 | 0.032→0.032 | 0.114→0.105 | 20,546→19,885 | 80→78 |
| スマホ模擬・初回 | 3.068→3.064 | 9.704→8.872 | 1,640,891→1,515,492 | 81→79 |
| スマホ模擬・再読込 | 0.432→0.432 | 2.030→2.012 | 20,545→19,908 | 80→78 |

スマホ初回転送は125,399バイト（約7.6%）削減、引渡しは約0.83秒短縮。表示と再読込はほぼ同等。通常回線の引渡しは約0.09秒増えており、短縮は確認できない。外部SDK応答を含む少数標本のため、全環境で速くなるとは断定しない。タロットカード/サムネイルの起動取得は全試行0件。最終HTMLと計測時HTMLのSHA-256一致を確認した。

試行したSDKのdefer化はスマホ初表示を遅らせたため取り消した。縮小WebPも細部が甘く見えたため採用せず、原寸AVIFへ置換した。試行値は最終値へ混ぜていない。

## 検証

- 最終版の対象21件成功。モジュール同一性・相対importからの持ち物状態・画面往復・ログイン初期化1回・SDK順序・DPR1/2/3・AVIF非対応/失敗時の原本フォールバック、既存プロフィール・旧PWA世代更新を含む。
- 共有モジュールとフォント変更後の全体回帰は789件を停止上限なしで実行し、777成功・12失敗・未実行0・runnerエラー0。最終の画像形式切替前に行った全体回帰であり、形式切替後は上記21件を再検証した。
- 12失敗は全て基準版で再現済みの既存ケース。ホーム構成、地図メッセージ、装備位置、デッキプリセット、探索背景/奥行き/床位置、敵帰還時間、既存ルール版、固定リリース文字列。期待値緩和や無関係な修正なし。全体greenとはしない。
- 同じ日時・字体・テストデータでホームを撮影。位置・寸法・字体・色は一致し、画像差分は左枠角の2×3px範囲、全987,480色チャンネル中11（最大差9/255）の描画差だけだった。起動画像の前後も保存。原本画像を上書きせず、再生成時にも元のSHAを検証。
- CSS lint、文字コード、git diff --check成功。実ユーザー・実LINEログイン・本番API・実機・本番での短縮量は未検証。

## 再現

このチェックアウトで、既存依存を使う場合:

```powershell
$env:NODE_PATH = 'C:/Users/bartr/troy/node_modules'
node scripts/process-boot-title.cjs
node C:/Users/bartr/troy/node_modules/@playwright/test/cli.js test tests/startup-bootstrap.spec.js tests/profile-cache-startup.spec.js tests/profile-cache-pwa-upgrade.spec.js
npm run lint:css
npm run check:encoding
```

比較環境は `C:/Users/bartr/Documents/Codex/2026-10-22/task` にある `benchmark-troy-startup.cjs` と `measure-troy-startup.cjs`。同じ場所で `node benchmark-troy-startup.cjs` を実行。基準コピー `troy-tarot-release` と本開発コピーを同じ配信コードで測り、`evidence/troy-startup-improvement/` へ保存する。外部は公開SDK/フォントの読取だけで、アプリAPIと認証遷移は遮断される。

根拠データは同フォルダーの `summary.json`、各 `*-measurements.json`、`full-regression.json`、`final-targeted.json`、`visual-comparison.json`、`startup-before-after.png`。

## 変更ファイル

`public/index.html`、`public/assets/ui/boot/title.avif`、`scripts/process-boot-title.cjs`、`scripts/playwright-static-server.js`、`tests/startup-bootstrap.spec.js`、本書。共通CSS/JavaScript本体とSWには変更を加えていない。
