# 特殊能力判定の運用

## 公開前の状態

特殊能力判定は既定で無効です。通常の店舗占いURLを開いても入口は表示されません。

有効化にはRenderの環境変数へ次の3件を設定します。

- `SPECIAL_ABILITY_ENABLED=true`
- `SPECIAL_ABILITY_SIGNING_SECRET`: 判定データ署名用の十分に長いランダム文字列
- `SPECIAL_ABILITY_TERMINAL_TOKEN`: 店舗端末確認用の24文字以上のランダム文字列

## 店舗端末の登録

店舗端末では、次の形式のURLを一度開きます。

```text
https://troy-xetw.onrender.com/tarot-reading.html?abilityTerminal=<SPECIAL_ABILITY_TERMINAL_TOKEN>
```

トークンはURL欄から直ちに消え、端末のタブ内へ12時間有効なセッションとして保存されます。トークン付きURLは一般公開せず、店舗端末の初期設定だけに使います。

## 保存と公開範囲

- 判定が正常に確定した時だけ、一人一回を消費します。
- 判定途中の回答はFirestoreへ保存しません。
- PlayFabの公開ReadOnly Dataには確定した能力を保存します。
- 他人のプロフィールへ表示する情報は「能力名」と「効果」だけです。
- 内部タイプ、系統、回答、反応時間、採点値はAPIから返しません。

## 内容更新時の確認

```powershell
npm run special-ability:generate
npm run special-ability:audit
npm run special-ability:test
```

監査は365能力、16タイプと33系統組み合わせ、12問48画像、画像寸法と重複、能力文の重複と類似を検査します。
