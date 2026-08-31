# Firebase responsibilities

TROY は同じ Firebase project で Authentication、Cloud Firestore、Realtime Database を使う。それぞれの役割を混同しない。

## Authentication

サーバーが PlayFab ID を UID とする Firebase custom token を生成する。ブラウザは custom token で sign-in し、API には Firebase ID token を送る。したがって `auth.uid` は LINE user ID ではなく正規化された PlayFab ID である。

Firebase Auth は API／Firebase Rules で使うセッション主体であり、PlayFab の inventory や PlayerData の代替ではない。

## Cloud Firestore

確認できる主要な保存領域:

- identity/index: `line_user_links`
- world: `world_map_<mapId>`, `world_map`, `islands`, `ships`, `shipRideRequests`, `ship_action_events`
- social/nation: `nation_groups`、guild recruitment 関連、`notifications`
- TROY/store: `troy_rooms` と `events`, `members`, `checkouts`, `customerOrderRequests`, `coinConversions`, `orderStats` 等の subcollections
- combat: `battleRooms`, `territories`, `weeklyContests`, `playerCards`, `playerCardLevelOperations`, `player_explorations`
- operations: `tarot_reading_logs`、music game `songs`/`versions`、性格診断や監査関連

コレクション名の一部は定数／動的 path で作られる。schema 変更前に `.collection(`、`doc(`、query、index 資料を検索する。

### Firestore の正本境界

- 共有位置、ルーム、イベント、店舗操作、オンライン投影は Firestore
- G、item、恒久 ship asset、PlayerData、membership は PlayFab
- `ships` の HP／active 情報等は PlayFab データの投影を含む。Firestore 値だけで所有・報酬を判断しない
- `nation_groups` は PlayFab Group への索引／運用投影。Group membership を Firestore だけで変更しない

### ルール管理上の注意

現在の `firebase.json` は Realtime Database の `database.rules.json` だけを指定しており、Firestore rules ファイルはリポジトリにない。一方、`WorldMapScene.js` 等は Firestore をクライアントから直接操作する。配備中ルールを確認できるまで、クライアント直接書込の追加や security assumption の変更をしない。

今後は配備中 rules を取得し、リポジトリ管理、Firebase emulator test、必要 index の文書化を行う。Admin SDK は rules を bypass するため、サーバー API 自身の認証・権限検証も別途必要である。

## Realtime Database

`database.rules.json` で確認できる root:

- `tarotKingdomMatch/openRooms`: 公開中ルーム索引
- `tarotKingdomRooms/<roomId>`: meta、presence、公開 state、host-only authority state、seat ごとの private hand、actions
- `navalPlunderRooms/<roomId>`: 海戦ルーム

Tarot Kingdom では Firebase UID と seat ownership を結び、公開 state に秘密の手札／deck を含めない validation がある。ルール変更時は `tests/tarot-kingdom-rtdb-rules.spec.js` を必ず更新・実行する。

`navalPlunderRooms` は現状 `auth != null` だけで room 全体の read/write を許す。参加者、所有者、操作種別、timestamp、schema の制約を追加するまで、恒久報酬の権威として使わない。

## 負荷と整合性

- 高頻度の位置／presence 更新は必要な field と範囲 query に限定する。
- listener は画面破棄時に unsubscribe する。
- 同じプレイヤー恒久値を Firestore に新設する前に PlayFab の既存正本を確認する。
- cross-service transaction は存在しないため、PlayFab 成功／Firestore 失敗と逆の順序を設計し、idempotency、状態フラグ、修復手段を用意する。
- batch/transaction を使っても PlayFab まで atomic にはならないことを明記する。

## 変更チェック

- `auth.uid` が PlayFab ID である前提を守ったか
- Admin API route で対象 ID と認証 UID／role を再確認したか
- クライアント直接 access には配備 rules が対応するか
- query に必要な index と上限があるか
- listener cleanup と offline/retry があるか
- PlayFab 正本との二重書込、途中失敗、再同期を扱ったか
