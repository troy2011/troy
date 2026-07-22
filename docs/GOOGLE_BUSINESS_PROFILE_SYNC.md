# Googleビジネスプロフィール営業時間の自動同期

リフアプリ内の営業カレンダーから、対象店舗の Google Business Profile `specialHours`（特別営業時間）へ、許可された店舗スタッフが操作ごとに明示同意した場合だけ同期します。同意欄を選ばない保存・削除はアプリ内だけで完了し、Googleへの同期要求を作りません。

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
- アプリが管理対象とした日付のGoogle側の値が前回同期した内容から変わっている場合は、自動で元へ戻さず `conflict_requires_review` で停止します。初回本番反映時も既存値を基準として採用する前に停止します。許可された店舗スタッフが具体的な差分を確認し、新しい同意を行うまで更新しません。
- Google側に通常営業時間 `regularHours` がない店舗へは特別営業時間を設定できません。
- 王タブで登録できるのは今日から366日先まで、同じ日付には1件だけです。保存中の予定は最大80件で、直近7日分の過去予定も自動削除まではこの件数に含まれます。
- 許可された店舗スタッフ1人あたりの保存・削除は10分間に20回までです。上限時は少し待ってから再操作してください。

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
| `GOOGLE_BUSINESS_PROFILE_STAFF_PLAYFAB_IDS` | 必須 | 実店舗オーナー・許可スタッフのPlayFab IDをカンマ区切りで指定。未設定は全拒否 |
| `GOOGLE_BUSINESS_PROFILE_ALLOWED_LOCATION_NAME` | 必須 | 同期を許可する固定の `locations/{locationId}`。下記の同期先と一致しない場合は停止 |
| `GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION` | 運用上必須 | 1以上の整数。未設定・不正値はコード上 `1` になりますが、それに依存せず明示し、同期先・検証設定を変更するたびに必ず増やす |
| `GOOGLE_BUSINESS_PROFILE_LOCATION_NAME` | 必須 | `locations/{locationId}` |
| `GOOGLE_OAUTH_CLIENT_ID` | 必須 | OAuth 2.0 client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 必須 | OAuth 2.0 client secret |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | 必須 | 店舗管理者が許可したrefresh token |
| `GOOGLE_BUSINESS_PROFILE_VALIDATE_ONLY` | 任意 | `true` は検証のみで実際には更新しない |
| `GOOGLE_BUSINESS_PROFILE_VALIDATE_BEFORE_UPDATE` | 必須 | 本番更新前の検証PATCHを有効にする。安全上 `true` が必須 |
| `GOOGLE_BUSINESS_PROFILE_PRODUCTION_WRITES_ENABLED` | 必須 | 本番PATCHの二重許可。未設定・`false` は本番更新を拒否 |
| `GOOGLE_BUSINESS_PROFILE_REQUEST_TIMEOUT_MS` | 任意 | Google API 1リクエストのタイムアウト。既定10秒 |
| `GOOGLE_BUSINESS_PROFILE_CHANGE_DEBOUNCE_MS` | 任意 | 連続編集をまとめる待ち時間。既定8秒 |
| `GOOGLE_BUSINESS_PROFILE_MIN_UPDATE_INTERVAL_MS` | 任意 | Google更新間隔。既定・下限ともに15秒。通常は既定値を推奨 |
| `GOOGLE_BUSINESS_PROFILE_LEASE_MS` | 任意 | 複数サーバー間の同期リース。通常は自動算出値のまま変更不要 |

API利用が承認されるまでは `GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED=false`、`GOOGLE_BUSINESS_PROFILE_PRODUCTION_WRITES_ENABLED=false` のままにし、Google管理画面から手動更新します。承認後の安全な導入手順は、最初に `GOOGLE_BUSINESS_PROFILE_VALIDATE_ONLY=true`、`GOOGLE_BUSINESS_PROFILE_PRODUCTION_WRITES_ENABLED=false` でデプロイし、許可された店舗スタッフが将来日を1件確認・同意して `validated` を確認する流れです。本番更新はその確認後に限り、`VALIDATE_ONLY=false`、`PRODUCTION_WRITES_ENABLED=true`、`VALIDATE_BEFORE_UPDATE=true` の全条件を同時に満たして再デプロイします。Google公式APIにはsandboxがありません。

### 設定世代とrolling deploy

`GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION` は初回を `1` などの整数にし、次のいずれかを変更するたびに必ず整数を1以上増やしてください。

- `GOOGLE_BUSINESS_PROFILE_LOCATION_NAME`
- `GOOGLE_BUSINESS_PROFILE_ALLOWED_LOCATION_NAME`
- `GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED`
- `GOOGLE_BUSINESS_PROFILE_VALIDATE_ONLY`
- `GOOGLE_BUSINESS_PROFILE_VALIDATE_BEFORE_UPDATE`
- `GOOGLE_BUSINESS_PROFILE_PRODUCTION_WRITES_ENABLED`

同期処理は設定内容と世代番号を、同期要求と各営業予定の明示同意へ結び付けます。設定を変えた後は、許可された店舗スタッフが新しい設定を対象として各将来予定を再確認・再保存するまで本番同期しません。rolling deploy中は新しい高世代だけが設定を引き継ぎ、旧世代のサーバーは新設定の同期要求を処理しません。同じ世代番号のまま上記設定だけを変えると、新設定のworkerは `configuration_conflict` になりますが、rolling deploy中に残る旧設定のworkerは旧設定で動作を続ける可能性があります。競合検出を安全装置として当てにせず、設定変更と世代番号のincrementを必ず同じデプロイに含めてください。

## 編集権限と明示同意

営業カレンダーはNation別ではなく対象店舗用の `global` 1つです。アプリ内だけの保存・削除には認証済みPlayFab IDと `IsKing=true` を要求します。Googleへの反映、同期状態の確認、Google側との差分確認・承認には、さらにサーバー環境変数の固定店舗スタッフ許可リストへの一致を要求します。ゲーム内の役職だけでは実店舗のGoogle営業時間を変更できません。許可リストが未設定の場合もアプリ内だけの操作は継続できますが、Google関連操作はすべて拒否します。

保存・編集時は未選択が既定の同意欄で、対象店舗のGoogle ビジネス プロフィール「特別営業時間」へ反映する場合だけ内容を毎回確認して選択します。削除も、アプリ内削除を確認したあと、Google側から特別営業時間が削除・変更されることへの同意を別に確認します。Google反映を要求したとき、サーバーは `googleBusinessProfileConsent=true`、固定の同意文面version、操作ごとの `operationId` が揃わない要求をFirestoreへ書き込む前に拒否します。これらのGoogle反映用フィールドを送らない要求は、アプリ内だけの操作として明示的に記録します。

新規保存では `requestId` が必須です。ブラウザは新規入力ごとに生成し、通信失敗後の再送では同じ値を再利用します。サーバーはこの値から同じドキュメントIDを作るため、応答を受け取れなかった保存を再送しても予定が重複しません。編集は既存の `calendarId` を使用します。

保存・編集・削除の監査記録は、営業カレンダー本体と同じFirestore transactionで `troy_business_calendar_audit` collectionへ保存します。操作種別、対象ID、操作者のPlayFab IDとNation、Google反映を要求したか、固定許可リストによる認可、同意version、操作ID、対象location、変更前後の内容、実行時刻を確認できます。OAuth tokenやclient secretは保存しません。

この安全対策を導入する前に作成された予定、アプリ内だけで保存した予定、現在と異なる設定世代で同意した予定は、Google同期の入力から除外します。これらの予定だけを理由に同期全体を停止せず、その日付にすでにあるGoogle側の値を保持します。Googleでも管理する場合は、許可された店舗スタッフが各予定を画面で確認し、現在の設定を対象に改めて同意して再保存してください。Firestore上の一括backfillで同意済みに見せる運用は禁止します。

## 動作と障害時の扱い

- 許可された店舗スタッフがGoogle反映を選び、内容を確認・同意して保存または削除すると、日付一意・件数・操作回数の判定、営業カレンダー、監査、同期要求を同じFirestore transactionへ原子的に確定し、HTTP応答後にGoogleへの同期を開始します。Google側で一時障害が起きても、保存済みの営業カレンダーは失われません。Google反映を選ばない操作は同期要求を作りません。
- 連続編集は既定8秒の窓でまとめ、Google更新は15秒以上空けます。この間隔は環境変数でも15秒未満にはできません。複数のアプリサーバーが起動していてもFirestore leaseを取れた1台だけが処理します。
- 同期前に現在の `regularHours,specialHours` を取得し、アプリ管理外の日付を残して配列全体を再構成します。
- 差分がなければPATCHしません。
- `queued` は営業カレンダーの変更が保存され、Googleへの反映待ちになった状態です。別の同期処理が実行中の場合も、先行処理の完了後に最新内容を再照合します。
- 王画面は保存後10秒、さらに15秒、20秒後に同期状態を短時間確認し、最大45秒まで `synced`、`validated`、`blocked` などの最終結果へ表示を更新します。画面を閉じても同期処理自体は継続します。
- 本番PATCHを送る前に確定した429、5xx、通信障害では `retrying` となり、指数バックオフで非同期に自動再試行します。PATCH送信後に結果を確認できない場合は同じ更新を自動再送せず、`conflict_requires_review` で停止します。
- 検証モードでGoogleの検証に成功すると `validated` になります。これは送信内容が有効という意味で、Google上の営業時間を更新した状態ではありません。
- 400系の時刻検証エラー、権限不足、location誤設定は自動再試行を止め、王画面に確認が必要な旨を表示します。
- 1分ごとのdurable outbox drainが未処理状態を再確認します。サーバー再起動やプロセス内タイマーの取りこぼしがあっても、永続化済みの同期要求を別の稼働サーバーが回収します。
- 起動時・日次処理は新しい同期要求を作りません。明示同意済みで永続化された未処理・再試行中の要求だけを回収します。
- アプリが管理する対象日について、前回適用した特別営業時間と現在のGoogle側の値が異なる場合は `conflict_requires_review` で停止し、自動PATCHしません。スタッフはGoogle APIからその時点の具体的な値と送信予定値を取得して画面で比較した後に限り承認できます。確認スナップショットは24時間で失効し、承認時にもGoogleの現在値を再取得して一致を検証します。
- 同期状態は Firestore の `integration_states/troy_google_business_profile_special_hours` に保存します。OAuthの秘密値や、Google APIから取得した具体的な特別営業時間の内容は永続保存しません。

Google側の反映は即時表示されない場合や、Googleの審査対象になる場合があります。

### 同期状態

| 状態 | 意味 |
| --- | --- |
| `queued` | 営業カレンダーは保存済みで、Googleへの反映待ち |
| `syncing` | Googleの現在値を取得し、差分を同期中 |
| `retrying` | 一時障害のため、次回時刻に自動再試行予定 |
| `validated` | 検証モードで成功。Google上のデータは未更新 |
| `synced` | Google Business Profile APIへの更新後、APIから同じ特別営業時間を再取得でき、Google提案・処理待ち差分がないことを確認済み。検索・マップの公開表示への反映には時間がかかる場合がある |
| `up_to_date` | Google側と一致していたため更新不要 |
| `blocked` | 設定・権限・入力エラー。修正後に再同期が必要 |
| `configuration_conflict` | 設定を変えたのに世代番号が同じ。世代を増やして再デプロイが必要 |
| `conflict_requires_review` | 初回本番基準の採用待ち、またはアプリ管理対象日のGoogle側の値が前回同期内容から変化。店舗スタッフが差分確認と再同意を行うまで自動更新しない |

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
| HTTP 403（店舗スタッフ） | `GOOGLE_BUSINESS_PROFILE_STAFF_PLAYFAB_IDS` と認証済みPlayFab IDを確認する |
| 明示同意エラー | UIで日付・時間・状態とGoogle反映先を確認し、同意欄を選択して新しい操作IDで再実行する |
| `conflict_requires_review` | Google側の変更内容を確認し、自動上書きせず店舗スタッフが採用内容を決めて再同意する |

APIの利用制限: [Google Business Profile API limits](https://developers.google.com/my-business/content/limits)
