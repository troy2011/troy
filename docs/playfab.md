# PlayFab responsibilities

## 使用 API

`server/playfab.js` が PlayFab SDK の設定、callback API の Promise 化、title entity token の更新、PlayFab ID から entity key への解決を集約する。機能コードは async/await でこの層を使う。

ブラウザはPlayFab Client/Groups SDKを読み込まず、SessionTicket／EntityTokenを保持しない。プレイヤー本人の起動表示データはFirebase認証済み `/api/player-bootstrap` が取得し、PlayFabの状態変更はExpressのサーバー資格情報から行う。

- Economy V2: `PlayFabEconomy.GetInventoryItems`, `AddInventoryItems`, `SubtractInventoryItems`, `PurchaseInventoryItems`
- Player data/profile: `PlayFabServer` と `PlayFabAdmin` の ReadOnly/Internal Data、profile、display name
- Rankings/progression: Player Statistics と Leaderboard
- Shared ownership: PlayFab Groups と PlayFab Data Entity Objects
- Global configuration: Title Data
- Compatibility/admin flows: Legacy CloudScript

## Economy V2

通貨も item として扱う。既定では `PS` が画面上の G で、資源は `RR`, `RG`, `RY`, `RB`, `RT`, `RS`。実際の通貨 code は `VIRTUAL_CURRENCY_CODE` で上書き可能だが、コード中には `PS` を明示する店舗処理もあるため、変更は単純な env 切替ではない。

G／item の更新規則:

1. 対象 PlayFab ID から title player entity key を解決する。
2. Economy V2 request に必ず `Entity: { Id, Type }` を付ける。
3. 数量を整数・許容範囲に正規化し、所有・残高・価格をサーバーで再計算する。
4. 再試行可能な操作には安定した idempotency ID を付ける。
5. G 変更後に必要なら `ps_ranking` を実残高から更新する。クライアント申告残高を使わない。

プレイヤー向けEntityKeyは、Firebase認証済みPlayFab IDから`server/playfab.js`で解決する。ブラウザ送信のEntityKeyやEntityTokenを対象選択のfallbackにしない。新規アカウント直後の一時的な解決遅延は、回数制限付きのサーバー再試行で扱い、解決できない場合は状態変更前にfail closedする。

`/api/add-points` と `/api/use-points` は legacy route で、`ENABLE_LEGACY_POINT_ROUTES=true` のときだけ有効になる。新機能から使わない。

## Player Data

コードでは主にサーバー書込の ReadOnly Data を使用する。確認できる代表例は次のとおり。

- identity/profile: `lineUserId`, `Race`, `Nation`, `BaseDisplayName`
- onboarding: LINE friend bonus claim、starter state
- equipment/avatar: equipped slot、avatar style
- ship: `ActiveShipId`, `Ship_<shipId>`
- guild/nation helper state と各ゲームの進行状態

Internal Data は MP 回復時刻等、クライアントへ見せないサーバー状態に使われる。Statistics は能力値、貢献、ゲーム score、ランキングに使われる。

新しい key を追加するときは、名前、型、default、writer、reader、移行方法を変更説明に記録する。同じ概念を別 key で増やさない。

## Rankings

- `LEADERBOARD_NAME` の既定は `ps_ranking`
- 店舗ゲームは `troy_darts_countup_score`, `troy_billiards_rating`, `troy_karaoke_score` 等の Statistics
- タロットキングダムや貢献／level にも個別 Statistics がある

Gランキングは Economy 残高の派生値であり、Statistic 自体を G として増減しない。スコア更新 API は Firebase UID、王／スタッフ権限、対象 player、上限をサーバーで確認する。

## Groups、Entity Objects、Title Data

- PlayFab Groups: 国家／ギルドの membership
- Group Entity Objects: 国家王、税率、国庫、告知等の共有データ
- Title Data: `NationGroupIds`, `MapOccupationByMapId`, `WorldMapLayoutV1`, `WorldMapPlacementOpen` 等の全体設定／索引

Firestore に同名・関連情報があっても、membership と Entity Objects の正本は PlayFab。索引更新は国家／ギルド helper 経由で行う。

## CloudScript

`server/nation.js` は少なくとも以下の Legacy CloudScript handler を現在呼び出す。

- `SetNationAnnouncement`
- `GetNationKingPageData`
- `TransferNationKing`

これらは `playfab_cloudscript/legacy_cloudscript.js` の契約と一致させる。リポジトリ変更だけでは PlayFab 配備 revision は更新されないため、配備は別作業として明記し、revision と rollback を記録する。

`EffectProcessor.js` は `TestEffectProcessor` と `UseSkill` handler を定義するが、Express／クライアントからの直接呼出しは確認できない。未使用と断定せず、PlayFab 側の配備・PlayStream・ルールを確認する。

## 変更チェック

- legacy economy API を追加していないか
- `Entity` と entity type が正しいか
- amount の符号、整数、上限、残高不足を検証したか
- idempotency と途中失敗後の状態を試験したか
- PlayerData/Statistic/Title Data の全 reader を検索したか
- G と `ps_ranking`、PlayFab と Firestore 投影の同期失敗を扱ったか
- secret key、entity token、session ticket をログ／レスポンスへ出していないか
