# 海賊タロット：セルフ占いのローカル確認版

## 2026-10-23 実物版説明書の入口

セルフ占いのURL `/pirate-tarot.html` を維持し、[実物版説明書](tarot-kingdom-real-manual.md)への入口を追加。説明書は `/tarot-kingdom-real.html`。改訂1以降に採用・公開された初手救済と手札0枚の勝利優先を反映。スマホ320/390pxとPC、占い結果からの往復、JavaScriptなしの閲覧をローカル検証し、ユーザーの追加依頼により関連7ファイルを本番反映する。既存の公開記録と画像・解説・認証は維持する。

## 2026-10-22 本番反映用の追記

ユーザー承認を受け、公開済み main `e861a47206b1a98e1bb1b61e75e39cdeccad2675` から別のチェックアウトを作成し、今回の画像・セルフ占い関連だけを切り出した。元チェックアウトの未コミット変更は保持する。通常の公開先は `https://troy-xetw.onrender.com/`、セルフ占いは `/pirate-tarot.html`。

ユーザー用の日次占いはホームの「本日の運勢」で、実装は `public/js/tarotPoker.js`。カードをめくった後と受取済み結果の再表示に採用画像を表示し、逆位置を回転する。画像失敗時は従来のスプライトを残す。持ち物の所有タロット詳細、スタッフ占いの一覧と結果にも共通 helper を使用する。占い結果、報酬、所有判定、スタッフ認証・API、DBルールは変更していない。

公開時の既存キャッシュ対策として、index の main/ui/inventory と main/ui 内の tarot モジュール版番号を `20261022-pirate-tarot-artwork-v1` に更新した。セルフ占いデータの生成元ハッシュは改行をLFへ正規化して計算し、WindowsとGitチェックアウトの改行差だけで変動しないようにした。鑑定文の内容は同一。

公開候補上で、購入者・日次・持ち物・スタッフの31件と既存アプリの7件、計38件が成功した。CSS lint と文字コードチェックも成功。公開後の静的ファイル照合とブラウザ確認は別途デプロイ記録へ残す。実利用者の占い実行、報酬付与、LINE送信は公開検証でも行わない。購入者限定認証は追加していない。

以下は初回ローカル検証時の記録。

2026-10-22。既存TROY (`C:\Users\bartr\troy`) に追加。公開、push、deploy、外部LINE送信は未実施。

## 確認方法

購入者画面: `http://127.0.0.1:4195/pirate-tarot.html`

スタッフ画面の画像確認: `http://127.0.0.1:4195/tarot-reading.html`

確認用サーバーを起動する場合、TROYディレクトリで実行する。

```powershell
node scripts/playwright-static-server.js --port 4195 --root public
```

127.0.0.1のみで配信する既存テスト用静的サーバー。Express、`.env`、Firebase Admin、PlayFab、LINE client は起動しない。スタッフ画面の顧客一覧はこの静的サーバーでは使えない。

## 発見した既存機能と分離方針

- スタッフ画面: `public/tarot-reading.html`
- 78枚の定義、正逆位置のキーワード、解説、助言: `public/js/tarotReading.js`
- 顧客一覧とLINE送信: `server/tarotReading.js`
- 所持品のタロット詳細: `public/js/inventory.js`
- 既存のピクセルスプライトとカード属性処理: `public/js/tarotCards.js`

プロジェクト一覧から既存リポジトリを特定した。ローカル `.codex/memories` は空で、探索範囲の `.codex` に `memory_summary.md` は見つからず、Personal Contextも利用不可だった。チェックアウトの `AGENTS.md`、`docs/architecture.md`、`docs/testing.md`、認証監査とAPI一覧を確認した。チェックアウトの `.agents/skills` は存在せず、`.agents` 内に追加の案内はなかった。

購入者画面は、実物で引いたカードを選択する一枚引き専用。ランダム抽選はない。78枚の検索、スート別絞込み、正逆位置の明示選択、結果、選び直し、履歴の戻る・進むに対応する。氏名、相談内容、アカウント情報の入力や保存はない。

スタッフ用ブラウザ入口は購入者画面からimportしない。`scripts/build-pirate-self-readings.cjs` が初期化を実行せず解説テーブルだけを読み、`public/data/pirate-self-readings.json` に78枚×2方向を出力する。source SHA-256を保持し、再生成テストで正本との乖離を検出する。既存の一般向けガイダンスを流用し、テンプレートの主語を自分向けに置換。資金判断を直接促す助言3件だけを振返りの文章に差し替えた。相談別の未来予測や他人の本音判定は購入者版へ取り込んでいない。

## 認証・公開境界

購入者側は同一originの静的データと画像のみを読む。顧客一覧、LINE、認証、管理API、Firestore/RTDB/PlayFabを使用しない。既存サーバー・認証・DBルール・権限処理は変更していない。

既存 `server/tarotReading.js` の顧客一覧／送信APIは、ルート内のスタッフ認証が欠ける既知問題がある（`docs/security-auth-audit.md` のH-3参照）。今回の購入者画面はそれらへの呼出しやリンクを追加していない。この追加によって既存APIの安全性を保証するものではない。

**購入者限定の仕組みは未実装。** URLの所持、noindex、ボタンの非表示は購入証明にならない。公開前に、購入コードをサーバーで検証する方式等、購入者限定の方法、回数、共有URLの扱いを決める必要がある。今回の静的ファイルをそのままdeployすると、URLを知る人が利用でき、画像と文章も公開配信される。未決の制限をlocalStorage等で代用していない。

## 採用画像と対応

正本: `C:\Users\bartr\OneDrive\ドキュメント\PirateTarot\最新版\manifest.json` と同フォルダの `art/`。

正本の78枚すべてのSHA-256を照合した。S3 v1、P10 v1、P6 v5は正式な採用記録とも一致。恋人は「女性が天を見上げる版v1」を維持。未採用の決闘v5、統一枠の確認案、版未確定の裏面は使っていない。

`scripts/build-pirate-tarot-art.cjs` で、原画を変更せず `public/assets/pirate-tarot/` にWebPを作る。全縦横比を保ち、トリミング・色変更・再生成を行わない。今回は採用原画の全体を表示し、カード名・番号はUI側に付ける。古い完成枠との組合せで最新採用原画が欠けることを避けた。

| 元のID | TROYのID |
| --- | --- |
| major-00〜21 | major-0〜21 |
| wands-01〜14 | wand-1〜10 / page / knight / queen / king |
| cups-01〜14 | cup-1〜10 / page / knight / queen / king |
| swords-01〜14 | sword-1〜10 / page / knight / queen / king |
| coins-01〜14 | pentacle-1〜10 / page / knight / queen / king |

重複・欠落なしの78IDと、156画像のファイルハッシュ・寸法比をテストする。公開用manifestは相対原画パスと採用版・ハッシュのみを保持し、ダウンロード元やローカル認証情報を含めない。

| 資産 | 合計バイト | 仕様 |
| --- | ---: | --- |
| 採用PNG原画78枚 | 226,212,338 | 参照のみ、アプリには複製しない |
| カード用WebP78枚 | 11,653,906 | 幅640px、quality82 |
| 一覧用WebP78枚 | 813,812 | 幅160px、quality74 |
| 軽量版合計 | 12,467,718 | 原画比で約94.5%削減 |

初回スマホ撮影時にブラウザが先読みしたサムネイルは48枚・495,098バイト。全画像にloading属性と寸法を設定し、一覧はlazy、選択済みの詳細はeagerで読む。ブラウザの先読み範囲により実際の初期取得枚数は変わる。文章JSONは99,572バイト。画像不達時にもカード名と操作は残る。

| 代表例 | 原画PNG | カード用WebP | サムネイル |
| --- | ---: | ---: | ---: |
| 恋人 | 2,822,993 | 179,874 | 13,572 |
| ソード3 | 2,705,897 | 142,734 | 8,608 |
| 金貨6 | 4,455,038 | 132,442 | 10,140 |
| 金貨10 | 2,830,148 | 183,106 | 12,528 |

4枚を実表示幅240pxで原画と並べて目視確認した。主要な構図・小物・採用内容は識別可能。圧縮は不可逆であり、印刷用途は引き続き原画を使う。

既存表示では、スタッフ一覧／選択結果（1枚・3枚）と所持カード詳細に再利用した。戦闘・デッキ一覧等の小さなピクセルスプライトは、既存ゲームの視認性とルールを保つため維持。共通画像helperは `public/js/pirateTarotArtwork.js`。既存ファイルの変更はスタッフHTMLのCSS/script追加、index HTMLのCSS追加、inventory.jsのimportと詳細表示呼出しだけ。スタッフ占い本体とゲーム実装は変更していない。

## 検証

Browserプラグインが提供されていないため、既存Playwright/Chromiumを使用。制限環境からlocalhostの起動待ちが進まなかったため、その試験専用プロセスだけを停止し、通常権限で同じ静的試験を実行した。

- 30件成功: `tests/pirate-tarot-self.spec.js`、`tests/tarot-reading.spec.js`、`tests/tarot-reading-content.spec.js`。
- 4件成功: 既存main-appの「tarot deck and list」「tarot cards preview」「a full tarot deck」「tarot detail shows」。既存specを作業フォルダへコピーし、helper解決先とスクリーンショット出力先だけ変更して実行。
- 新規6件は画像読込み完了を待つ条件を加えて再実行し成功。撮影はさらにdecode完了を待ち、390×844と1440×1000で実施。
- ページタイトル、非空DOM、エラーoverlayなし、水平はみ出しなし、関連console/pageerrorなし。
- 正逆位置必須、連打で履歴を重複作成しない、戻る・進む、結果reload後の選び直し、カード変更で向きを再確認、スート・和名・全角番号・コート11〜14の検索を検証。
- JSON読込み失敗からの再試行、画像不達時の操作継続を検証。
- 購入者画面の管理API・外部通信は0件。スタッフ送信試験はmockのみ、実LINE送信なし。
- `npm run lint:css`、`npm run check:encoding` 成功。未追跡の新規ソースも別途UTF-8/BOMなしと構文を確認。

全体 `npm test` は未実施。実機Safari、LINE内ブラウザ、実購入者認証、実API・DB・LINE送信、本番配信、印刷色校は未検証。

## 証拠と残る判断

ローカル証拠: `C:\Users\bartr\Documents\Codex\2026-10-22\task\evidence\`。スクリーンショット、原画比較、ブラウザ通信件数、保護対象ハッシュ、反映ファイル一覧を保存。

Library: `self-preview-overview.png` / `libfile_607da45c393c81919ca94ba292e3737b` / version0。購入者の検索・向き確認・結果を一枚にしたスクリーンショット。個人情報を含まない。

未決: 購入者限定の方法、利用回数、URL共有、公開タイミング、必要なら確定後の枠付き画像への切替、裏面の採用版。公開前に既存スタッフAPIの境界も別途確認する。

取り消す場合は、このタスクの追加ファイルだけを外し、上記3既存ファイルの追加行だけを除く。開始時スナップショットを丸ごと復元して他のユーザー変更を消さないこと。Gitのcommit・stash・reset等は実行していない。
