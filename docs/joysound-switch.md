# キョクナビのSwitch用リンク

## 目的と範囲

Androidで、QR接続したキョクナビのSwitchモードを使って抽選曲の詳細を開き、キョクナビ内で予約を確定する。TROYが予約を送信したり、接続情報を取得・保存したりする変更ではない。スタッフ認証、サーバーAPI、Firestoreカタログ、スコア確定の契約は変更しない。

## 調査根拠（2026-10-19）

- [任天堂の接続案内](https://support.nintendo.com/jp/switch/software/karaoke.html)は、Switchを多機能モードにし、キョクナビでQRコードを読んで検索・予約する手順を示す。外部からの曲指定URLの仕様書ではない。
- [Google Playのパッケージ](https://play.google.com/store/apps/details?id=jp.co.xing.spnavi)に対応するAndroid 5.0.14の配布ファイルを静的に調査した。ファイルは[第三者の配布元](https://apkpure.net/%E3%82%AB%E3%83%A9%E3%82%AA%E3%82%B1%E4%BA%88%E7%B4%84-%E3%82%AD%E3%83%A7%E3%82%AF%E3%83%8A%E3%83%93joysound/jp.co.xing.spnavi/download)から取得し、インストール・実行はしていない。SHA-256は `264e8e45d2f82739a849bf3cc2a64dd7e37785dd15786a4dbdc325cacbb6c7bf`。公式署名との照合およびユーザー端末のバージョン確認は未実施。
- `InteractionActivity.x` の `view=songDetails` 分岐は `slc`、`naviGrpId`、`backAppScheme` を読む。`backAppScheme` がない場合、曲詳細を通常モードで開くためのモード切替確認を経由する。`backAppScheme` がある場合は `InteractionSongActivity` を使う。
- `InteractionSongActivity` と親画面の初期化は、現在の接続モード（保存キー `jp.co.xing.spnavi.PREF_SWITCH_MODE`、値 `SX` がSwitch用）を読み、通常モードへの変更を要求しない。曲詳細画面にもSwitch用表示と曲番号解決の分岐がある。
- 調査したAndroid版では `backAppScheme` の値は戻り先URLとしては使用されず、外部呼出し用画面の選択に使われる。TROYはブラウザのスキームである `https` を渡す。ブラウザへの復帰はAndroidの戻る操作で行う。

この挙動は静的調査からの判断であり、公開された互換性保証や実機での動作確認ではない。iOS版の同等処理は確認できていないため、iOSではこのリンクを使わず曲名コピーを提供する。

## クライアントの契約

AndroidのSwitch用リンクは次の形式とする。

```text
intent://navigation?view=songDetails&slc={songNumber}&backAppScheme=https#Intent;scheme=xgi-js-spnavi;package=jp.co.xing.spnavi;end
```

`naviGrpId`、曲名、歌手名は渡さない。店舗用のグループIDを固定せず、キョクナビが現在のSwitch用カタログから `slc` を解決する経路を使う。配信されていない曲を通常版など別の曲に自動置換しない。予約確定と配信可否の判断はキョクナビ内で行う。

ブラウザはキョクナビの接続状態を読めない。リンク操作で「接続維持成功」「予約成功」とは表示しない。曲名コピーを併設し、非対応OSではコピーのみを表示する。

## 検証と切り戻し

PlaywrightではAndroidのUser-Agentで抽選し、ボタン操作が `slc` と `backAppScheme` を持つIntentを送ること、店舗用IDを含めないこと、結果保存を発生させないことを検証する。iOS/デスクトップではSwitch用Intentを送らない。

実機では、使用中のAndroid版のバージョンを確認し、SwitchとのQR接続後に既知の配信曲で曲詳細を開く。モード解除確認が出ないこと、接続が維持されること、曲・歌手・曲タイプが一致することを確認する。実際の予約操作はユーザーが行う。調査中に本番の予約や接続変更を自動実行していない。

問題があれば `buildJoysoundSwitchNaviUrl` を空文字列を返す実装に戻し、HTMLのモジュール版も更新する。Switch用は曲名コピーに戻り、通常モードを開く店舗用リンクへはフォールバックしない。サーバーAPIとDBの移行は不要。
