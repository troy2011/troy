# 卓上戦の共有範囲

TROYの `public/tabletop-v65/` が、共通盤面および依存関係を確認したゲームロジックの正本です。Sitesは同じファイルを `public/` に置きます。新しい版を作るときは、両方の画面からCSSを重ねずに、正本の定義を編集します。

- `node scripts/tabletop-shared.cjs --export-sites <新規の作業用フォルダ>` は、明示した共有ファイルだけをSitesのディレクトリ構成で出力します。既存の作業フォルダは上書きしません。
- `node scripts/tabletop-shared.cjs --verify-sites <Sitesの作業フォルダ>` は、一覧の全ファイルをバイト単位で照合します。LF改行を保ち、場札CSSの相対素材や共通JSの静的な依存も一覧に含めます。
- HTMLの `data-tabletop-host` と各入口のアダプターが一致した場合のみ、同じ `resolveTableHost` が接続を渡します。TROYのローカル実装とSitesのオンライン実装は別ファイルに残り、認証や認可を変更しません。
- 手札の操作、役の判定、得点・CPU・チュートリアルのシナリオは共有済みです。メニュー、アバターや履歴、音楽・歓声の配信、および入口と一体になっている画面コードはまだこの同期範囲に含めません。

### Rule-prop assets and lifecycle

Both entry points now resolve the same relative material directories and use the same render, reveal, flash, and teardown implementation. Sites queues the reveal until an online card lands; TROY can reveal an immediately settled local state using the common fade. The host still controls whether a fresh event is audible and has its own mixer. A lock cue selects the first recognized suit when more than one is present; invalid events are silent.
