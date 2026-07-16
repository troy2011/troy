# Googleビジネスプロフィール営業時間の自動同期

リフアプリの「王」タブにある営業カレンダーを正として、対象店舗の Google Business Profile `specialHours`（特別営業時間）へ一方向同期します。

## 同期される内容

| 王タブの状態 | Google Business Profile |
| --- | --- |
| `営業 (open)` | 入力した OPEN / CLOSE を特別営業時間として公開 |
| `休業 (closed)` | 終日休業 |
| `貸切 (private)` | 一般客向けには終日休業 |
| `仮予定 (tentative)` | 特別営業時間を公開せず、Googleの通常営業時間に戻す |

- `title` と `note` は Google の営業時間フィールドに対応項目がないため同期しません。
- 同じ日付の予定が複数ある場合は、`updatedAtMs` が最新の予定を採用します。
- 日をまたぐ営業は翌日の `endDate` として送ります。Googleの仕様上、翌日の終了時刻は 11:59 まで、1期間は24時間未満です。
- アプリが一度管理した日付はアプリを正とします。それ以外の日付にGoogle側で手入力された特別営業時間は保持します。
- Google側に通常営業時間 `regularHours` がない店舗へは特別営業時間を設定できません。
- 王タブで登録できるのは今日から366日先まで、同じ日付には1件だけです。保存中の予定は最大80件で、直近7日分の過去予定も自動削除まではこの件数に含まれます。
- 王1人あたりの保存・削除は10分間に20回までです。上限時は少し待ってから再操作してください。

Google公式仕様: [SpecialHours](https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations#SpecialHours)、[locations.patch](https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations/patch)

## 初回セットアップ

### 1. Business Profile APIの利用承認を得る

Google CloudのOrganization配下にプロジェクトを用意し、Google Business Profile APIのBasic API Accessを申請します。申請者は、ウェブサイトが登録された確認済み・有効なBusiness Profileを60日以上管理している必要があります。未承認プロジェクトではAPIの割り当てが0になり、呼び出せません。

- [利用前提とアクセス申請](https://developers.google.com/my-business/content/prereqs)
- [Basic setup](https://developers.google.com/my-business/content/basic-setup)

承認後、Google公式のBasic setupに従い、次の8 APIを有効化します。

- Google My Business API
- My Business Account Management API
- My Business Lodging API
- My Business Place Actions API
- My Business Notifications API
- My Business Verifications API
- My Business Business Information API
- My Business Q&A API

### 2. OAuth 2.0認証情報を作る

対象店舗のオーナーまたは管理者であるGoogleアカウントから、次のscopeへのオフラインアクセスを一度許可し、refresh tokenを取得します。

```text
https://www.googleapis.com/auth/business.manage
```

公式手順: [Implement OAuth with Business Profile APIs](https://developers.google.com/my-business/content/implement-oauth)

client secret と refresh token はブラウザへ渡さず、RenderのSecret環境変数だけに保存してください。リポジトリや `.env` をコミットしてはいけません。

OAuth同意画面を `External / Testing` のまま運用すると、このscopeのrefresh tokenは通常7日で失効します。運用開始前にPublishing statusを本番へ移し、refresh tokenを失効・漏えい時に再発行してRender側をローテーションできる担当者と手順を決めてください。

### 3. 店舗のlocation nameを確認する

OAuth用の3変数をローカル環境へ設定後、次を実行します。

```powershell
npm run gbp:list-locations
```

一覧から「海賊酒場TROY」の `name`（`locations/123456789...` 形式）を選び、`GOOGLE_BUSINESS_PROFILE_LOCATION_NAME` に設定します。Googleマップの短縮URLやPlace IDではなく、このlocation nameを使います。

### 4. Renderへ環境変数を設定する

| 変数 | 必須 | 値 |
| --- | --- | --- |
| `GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED` | 必須 | `true` で明示的に同期を許可 |
| `GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION` | 運用上必須 | 1以上の整数。未設定・不正値はコード上 `1` になりますが、それに依存せず明示し、同期先・検証設定を変更するたびに必ず増やす |
| `GOOGLE_BUSINESS_PROFILE_LOCATION_NAME` | 必須 | `locations/{locationId}` |
| `GOOGLE_OAUTH_CLIENT_ID` | 必須 | OAuth 2.0 client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 必須 | OAuth 2.0 client secret |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | 必須 | 店舗管理者が許可したrefresh token |
| `GOOGLE_BUSINESS_PROFILE_VALIDATE_ONLY` | 任意 | `true` は検証のみで実際には更新しない |
| `GOOGLE_BUSINESS_PROFILE_VALIDATE_BEFORE_UPDATE` | 任意 | 既定 `false`。`true` は本更新前にも検証PATCHを行うため、更新リクエスト数が2倍になる |
| `GOOGLE_BUSINESS_PROFILE_REQUEST_TIMEOUT_MS` | 任意 | Google API 1リクエストのタイムアウト。既定10秒 |
| `GOOGLE_BUSINESS_PROFILE_CHANGE_DEBOUNCE_MS` | 任意 | 連続編集をまとめる待ち時間。既定8秒 |
| `GOOGLE_BUSINESS_PROFILE_MIN_UPDATE_INTERVAL_MS` | 任意 | Google更新間隔。既定・下限ともに15秒。通常は既定値を推奨 |
| `GOOGLE_BUSINESS_PROFILE_LEASE_MS` | 任意 | 複数サーバー間の同期リース。通常は自動算出値のまま変更不要 |

安全な導入手順は、最初に `GOOGLE_BUSINESS_PROFILE_VALIDATE_ONLY=true` でデプロイし、Googleの現在値と意図的に異なる将来日を王タブで1件保存して `validated` を確認した後、`false` へ変更して再デプロイする流れです。差分がない場合は `up_to_date` となり、検証PATCH自体を行いません。Google公式APIにはsandboxがありません。

### 設定世代とrolling deploy

`GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION` は初回を `1` などの整数にし、次のいずれかを変更するたびに必ず整数を1以上増やしてください。

- `GOOGLE_BUSINESS_PROFILE_LOCATION_NAME`
- `GOOGLE_BUSINESS_PROFILE_VALIDATE_ONLY`
- `GOOGLE_BUSINESS_PROFILE_VALIDATE_BEFORE_UPDATE`

同期処理は設定内容と世代番号を結び付けます。rolling deploy中は新しい高世代だけが設定を引き継ぎ、旧世代のサーバーは新設定の同期要求を処理しません。同じ世代番号のまま上記設定だけを変えると、新設定のworkerは `configuration_conflict` になりますが、rolling deploy中に残る旧設定のworkerは旧設定で動作を続ける可能性があります。競合検出を安全装置として当てにせず、設定変更と世代番号のincrementを必ず同じデプロイに含めてください。

## 編集権限

現行の営業カレンダーはNation別ではなく `global` の1つです。Nationが設定され、PlayFabの `IsKing` が有効なユーザーは、所属Nationにかかわらず全員がこのglobal営業カレンダーを保存・削除できます。その変更がGoogle Business Profileにも同期されるため、現在は全Nationの王が対象店舗の特別営業時間を変更できる仕様です。店舗ごと・Nationごとに権限を分離する仕組みではありません。

新規保存では `requestId` が必須です。ブラウザは新規入力ごとに生成し、通信失敗後の再送では同じ値を再利用します。サーバーはこの値から同じドキュメントIDを作るため、応答を受け取れなかった保存を再送しても予定が重複しません。編集は既存の `calendarId` を使用します。

保存・編集・削除の監査記録は、営業カレンダー本体と同じFirestore transactionで `troy_business_calendar_audit` collectionへ保存します。操作種別、対象ID、操作者のPlayFab IDとNation、変更前後の内容、実行時刻を確認できます。

## 動作と障害時の扱い

- 王タブで保存または削除すると、日付一意・件数・操作回数の判定、営業カレンダー、監査、同期要求を同じFirestore transactionへ原子的に確定し、HTTP応答後にGoogleへの同期を開始します。Google側で一時障害が起きても、保存済みの営業カレンダーは失われません。
- 連続編集は既定8秒の窓でまとめ、Google更新は15秒以上空けます。この間隔は環境変数でも15秒未満にはできません。複数のアプリサーバーが起動していてもFirestore leaseを取れた1台だけが処理します。
- 同期前に現在の `regularHours,specialHours` を取得し、アプリ管理外の日付を残して配列全体を再構成します。
- 差分がなければPATCHしません。
- `queued` は営業カレンダーの変更が保存され、Googleへの反映待ちになった状態です。別の同期処理が実行中の場合も、先行処理の完了後に最新内容を再照合します。
- 王画面は保存後10秒、さらに15秒、20秒後に同期状態を短時間確認し、最大45秒まで `synced`、`validated`、`blocked` などの最終結果へ表示を更新します。画面を閉じても同期処理自体は継続します。
- 429、5xx、通信障害では `retrying` となり、指数バックオフで非同期に自動再試行します。次の保存操作が成功するまで待つ必要はありません。
- 検証モードでGoogleの検証に成功すると `validated` になります。これは送信内容が有効という意味で、Google上の営業時間を更新した状態ではありません。
- 400系の時刻検証エラー、権限不足、location誤設定は自動再試行を止め、王画面に確認が必要な旨を表示します。
- 1分ごとのdurable outbox drainが未処理状態を再確認します。サーバー再起動やプロセス内タイマーの取りこぼしがあっても、永続化済みの同期要求を別の稼働サーバーが回収します。
- 起動15秒後と毎日04:41（JST）にも全体を再照合します。
- 同期状態は Firestore の `integration_states/troy_google_business_profile_special_hours` に保存します。OAuthの秘密値は保存しません。

Google側の反映は即時表示されない場合や、Googleの審査対象になる場合があります。

### 同期状態

| 状態 | 意味 |
| --- | --- |
| `queued` | 営業カレンダーは保存済みで、Googleへの反映待ち |
| `syncing` | Googleの現在値を取得し、差分を同期中 |
| `retrying` | 一時障害のため、次回時刻に自動再試行予定 |
| `validated` | 検証モードで成功。Google上のデータは未更新 |
| `synced` | Google Business Profileへ更新済み |
| `up_to_date` | Google側と一致していたため更新不要 |
| `blocked` | 設定・権限・入力エラー。修正後に再同期が必要 |
| `configuration_conflict` | 設定を変えたのに世代番号が同じ。世代を増やして再デプロイが必要 |

## 主なエラー

| 状態 | 確認内容 |
| --- | --- |
| `GBP_REGULAR_HOURS_REQUIRED` | Google Business Profileで通常営業時間を先に設定する |
| HTTP 401 | refresh tokenの失効、OAuth clientの不一致 |
| HTTP 403 | API利用承認、API有効化、店舗のowner/manager権限 |
| HTTP 404 | `GOOGLE_BUSINESS_PROFILE_LOCATION_NAME` |
| `GBP_VALIDATION_ERROR` | 日付・時刻・状態を確認する。日またぎは翌日11:59まで、24時間未満にする |
| HTTP 400 / `INVALID_ARGUMENT` | Googleのエラー詳細を確認する。`OVERLAPPED_SPECIAL_HOURS` が含まれる場合は同日内の重複を解消する |
| `GBP_CALENDAR_LIMIT_EXCEEDED` | 将来の同期対象が500件を超えている。古い・重複予定を整理する |
| `configuration_conflict` | `GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION`を増やし、設定変更と同時に再デプロイする |

APIの利用制限: [Google Business Profile API limits](https://developers.google.com/my-business/content/limits)
