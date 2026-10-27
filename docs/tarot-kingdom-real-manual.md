# 実物版説明書のWeb入口

2026-10-23。セルフ占いの既存URL `/pirate-tarot.html` を維持し、`/tarot-kingdom-real.html` への通常リンクを追加した。実物版の一局の出し切り対戦用。認証・API・保存データ・ゲームエンジン・原画は変更していない。

## 採用基準

印刷用説明書「改訂1」だけを最新版として転載しない。改訂1の制作後に通常対戦の初手救済が採用・公開されているため、カード進行は改訂1を基礎にし、次の公開版の差分を反映した。

- 公開commit: `0cd7e095d98aeb40a2b37c39328f39edc7e82f0b`
- 公開記録: `C:/Users/bartr/Documents/Codex/2026-10-22/task/evidence/startup-kingdom-deployment/completion.json`。2026-10-23 JSTに公開内容照合済みとの記録。
- 採用ソース: `C:/Users/bartr/Documents/Codex/2026-10-22/task/troy-startup-kingdom-release/public/js/tarotKingdom.js`
- 上記ソースSHA-256: `dcc72069e49be4845057f1e7db6ef09095ead335ab7dd636bd00af6bedb51de4`
- 差分の説明: 同チェックアウトの `docs/kingdom-opening-rescue-dev.md` と `docs/startup-kingdom-release.md`。
- 旧印刷稿: `C:/Users/bartr/Documents/Codex/2026-10-22/task-2/output/pdf/build_rule_sheet_v1.py`、`rule-sheet-text.txt`、`mode-verification-revision-1.txt`。旧PDFは書き換えず、最新版へのリンクとしても掲載しない。
- 実物カード表記: `C:/Users/bartr/OneDrive/ドキュメント/PirateTarot/最新版/完成版/編集用/index-rules.json` と印刷稿で照合済みの78枚表記（A/P/N/Q/K）。コインとペンタクルは同じスートとして併記。

元の作業チェックアウトの `public/js/tarotKingdom.js` は旧SHA `9a8d9ece5ad8d5a3fc72d2eb981813b3dc5a3cc793d99841139de3b1f00ac1c9` のまま。今回そのファイルを更新すると他作業へ干渉するため、上記の公開専用コピーと公開記録を根拠にした。

## 改訂1から反映したルール

1. 空の場の親が最後の1枚なら、初手制限を解除。15〜19・21もドロー前に出せる。場札への重ね出し条件は解除しない。
2. 初手不能なら、山札と手札上限を満たすときに1枚引く。まだ出せないなら次の人へ親を渡す。3回ドローの行動不能は採らず、回数記録も不要。
3. 合法な提出で手札0枚なら札効果より先に勝利する。世界21も同じ。12トラッシュによる除外は提出ではなく、最後の1枚は除外できない。
4. 全員初手不能かつ山札切れ／補充不能なら引き分け・配り直し。山札がなくても合法手があれば続行。

5スキップ、8、11バック、12トラッシュ、ロイヤルロック、5枚役の7段階、コール制限、調和、墓地の出し手は既存のまま。新しいバランス調整や初回用の省略ルールは足していない。探索・HP戦闘・人物／ペット能力・4局チップ清算は実物版の説明に取り込まない。

## 画面と検証方法

目次のアンカー、本文16px以上、折り返す役一覧、用語、初手救済の例を静的HTMLで表示。説明書はJavaScriptなしで読める。外部字体・CDN・APIへの接続なし。既存の占いJavaScript・履歴処理は変更しない。ブラウザの「戻る」で占い結果に戻れる。

Browser plugin not available のため、既存Playwright/Chromiumを使用する。

~~~powershell
$env:TAROT_MANUAL_EVIDENCE = '<リポジトリ外の撮影保存先>'
node node_modules/@playwright/test/cli.js test tests/tarot-kingdom-real.spec.js tests/pirate-tarot-self.spec.js --project=chromium --reporter=list --output '<リポジトリ外の試験出力先>'
npm run lint:css
npm run check:encoding
~~~

ローカル確認の起動:

~~~powershell
node scripts/playwright-static-server.js --port 4195 --root public
~~~

入口: `http://127.0.0.1:4195/pirate-tarot.html`。説明書: `http://127.0.0.1:4195/tarot-kingdom-real.html`。今回の依頼はローカル検証まで。push・deploy・実LINE送信は行わない。

## 確認結果

- Playwright対象11件成功（既存セルフ占い6件＋説明書5件）。320×844、390×844、1440×1000で目次9リンク、展開、戻り先、本文16px、水平はみ出しなしを確認。
- 占い結果→説明書→ブラウザで戻ると、ソード3・逆位置と本文を復元。既存の78枚・156解説・検索・正逆・再選択・履歴・読込失敗からの再試行も成功。
- JavaScript無効のブラウザでも、説明書本文・目次・詳細の展開を確認。対象ページの関連console/pageerror・外部通信・API呼出しなし。既存スタッフ画面の試験はmockのみ。
- 採用ソース側の既存Node境界試験26件を再実行し成功。最後1枚の6種、世界の重ね条件、3回でも脱落なし、山札切れ、勝利優先を照合。公開版ソースのSHA-256も再確認。
- 正式SVG78枚のA/P/N/Q/K・大札主数字を再照合。副スートは正式 `index-rules.json` に一致。
- `npm run lint:css`、`npm run check:encoding` 成功。後者は追跡ファイルのみを読むため、今回の未追跡7ファイルは別途UTF-8・BOMなしも確認。
- 撮影を目視確認。証拠は `C:/Users/bartr/.codex/visualizations/2026/10/17/01a14bd2-845c-75a3-936c-d0620142bd05/tarot-kingdom-manual/`。

最初の画面試験では、本文サイズを測るlocatorが12pxの章番号を選んでいた。本文の段落を測るよう試験を修正し、説明書5件を再実行して成功。実機Safari/LINE内ブラウザ・紙の対戦は未検証。全体 `npm test` は今回の静的説明書追加では実行していない。

取り消す場合はセルフページの `rulebook-entry` のnavとその4つのCSSルール、および今回の説明書HTML/CSS・専用spec・この文書だけを外す。ユーザーの既存セルフ占い成果や他の未コミット変更は残す。
