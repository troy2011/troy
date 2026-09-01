# TROY 認証・権限境界監査

調査日: 2026-08-28
対象: 現在のリポジトリ、`AGENTS.md`、`docs/`
方針: アプリ本体の機能コードは変更せず、静的なコード追跡と既存テスト確認だけを実施した。

## 結論

サーバーの正規ログイン経路は、ブラウザが送る `lineUserId` を信用していない。LINE access token をサーバーが LINE Profile API で検証し、その応答の `userId` を PlayFab CustomID に使用している。この経路から別ユーザーを選ぶことはできない。

しかし、正規経路の後にブラウザが同じ LINE user ID を使って `PlayFab.ClientApi.LoginWithCustomID` を直接実行している。LINE token は PlayFab に渡らないため、既存 CustomID を知る第三者が同じ PlayFab Client API を呼べる構造である。実際に取得できる権限は PlayFab タイトル設定に依存するが、アカウントなりすまし境界として最優先で解消すべきである。

コードだけで直ちに悪用可能と確定した Critical は次の3系統である。

1. 認証なしの TROY スタッフ会計 API による PS・アイテム付与
2. 認証なしの島ダメージ API による建物破壊・他ユーザー資源減算・略奪
3. 認証なしのショップ API による価格改ざん・被害者の強制購入・PS移転

また、タロット探索の勝敗・順位・生存HP・レイドダメージをブラウザ申告から報酬へ反映しており、Firebase認証が通っていても報酬の正当性は保証されない。

## 監査の限界

- PlayFab、Firebase、LINE の管理画面と現在配備中の設定は取得していない。
- Firestore Security Rules はリポジトリに存在しない。現在配備中の Rules が安全か危険かは未確定である。
- RTDB は `firebase.json` が参照する `database.rules.json` を監査した。実配備版との一致は管理画面または Firebase CLI で別途確認が必要である。
- 専用の Codex Security レポートバックエンドはこの環境では利用できなかったため、同じ脅威モデル・source-to-sink・反証確認の手順でオフライン静的監査を行った。

## 修正状況

監査本文は発見時点の事実として残し、修正状態をここで追跡する。

| 項目 | 状態 | 更新日 | 内容 | 残る確認 |
| --- | --- | --- | --- | --- |
| S1-1 `/api/set-race` のclient EntityKey／未検証EntityToken fallback | 修正済み（未配備） | 2026-08-28 | Firebase認証済みPlayFab IDからサーバーで解決した`title_player_account`だけをGroups／starter Economy付与に使用。解決不能時は状態変更前にfail closedし、短い回数制限付きserver retryを行う | 本番PlayFabで新規アカウント直後のEntity解決とログを確認 |
| S1-2 ブラウザ直接`LoginWithCustomID` | 修正済み（未配備） | 2026-08-30 | Browser SDK、Client `LoginWithCustomID`、Client `GetUserReadOnlyData`を削除。起動データはFirebase認証済み`/api/player-bootstrap`へ移行し、SessionTicket／EntityTokenをブラウザへ保持しない。JS query versionとService Worker cache世代も更新 | PlayFab管理画面設定、発行済みsessionの失効・期限、実機で既存／新規／LIFF回帰 |
| S2 TROY staff会計APIのFirebase認証＋staff権限 | 現状維持（リスク受容・未修正） | 2026-08-31 | 現行のstaff routeを変更しない運用判断。監査で確認した無認証経路、client指定値、並行settle等の所見は解消していない | 公開到達性と運用上の補償統制を継続確認。方針変更時はFirebase認証＋server-side staff権限から再開 |

S1-2より下の監査本文は発見時点の経路を保存している。現行コードでは手順9のブラウザ再ログインはなく、Firebase認証後に `/api/player-bootstrap` が認証UIDと要求PlayFab IDを照合してReadOnly Dataを取得する。

S2は2026-08-31時点で機能コードを変更しない方針とした。この判断はC-1が安全になったことを意味しない。APIインベントリとC-1のコード根拠は現行リスクとして保持し、修正済みには分類しない。

## 1. LINE → PlayFab → Firebase 認証経路

### 実際の順序

1. `public/main.js:1437-1457` の `initializeLiff` がブラウザで `liff.init`、必要なら `liff.login`、`liff.getProfile`、`liff.getAccessToken` を実行する。
2. `public/main.js:1456-1468` が `/api/login-playfab` に `lineAccessToken` とクライアント取得のプロフィールを送る。
3. `server.js:1306-1318` は body の `lineUserId` を取り出さず、`verifyLineAccessToken` の結果だけを `CustomId` にする。
4. `server/auth.js:50-68` の `verifyLineAccessToken` が LINE `https://api.line.me/v2/profile` に Bearer token を送り、応答の `userId` を返す。
5. `server.js:1315-1318` が `PlayFabServer.LoginWithCustomID({ CustomId: verifiedLineUserId, CreateAccount: true })` を実行する。
6. `server.js:1325-1369` が Firestore `line_user_links` と PlayFab ReadOnly Data `lineUserId` を補助索引として保存する。
7. `server.js:1394-1401` が `PlayFabId` を Firebase UID とした custom token を作成し、ブラウザへ返す。
8. `public/main.js:1573-1579` が `signInWithCustomToken` を実行する。その後 Express API は Firebase ID token を使用する。
9. これとは別に `public/main.js:1479-1517` がブラウザから `PlayFab.ClientApi.LoginWithCustomID({ CustomId: myLineProfile.userId, CreateAccount: false })` を呼び、SessionTicket と EntityToken を `window` に保持する。

### 論点ごとの確定結果

| 確認事項 | 結果 | 根拠 |
| --- | --- | --- |
| LINE user ID を誰が取得するか | ブラウザも取得するが、認証上の正本はサーバーが LINE Profile API から取得した値 | `public/main.js:1450-1457`, `server/auth.js:50-68` |
| LINE token を誰が検証するか | Express サーバー | `server.js:1311`, `server/auth.js:50-68` |
| CustomID との結合 | LINE 検証済み `userId` を Server `LoginWithCustomID` に渡す時点。Firestore/ReadOnly Data は後続の索引 | `server.js:1315-1369` |
| ブラウザ直接 `LoginWithCustomID` | 1か所。`initializeLiff` 内 | `public/main.js:1502-1517` |
| `CreateAccount` | サーバーは `true`、ブラウザ同梱呼び出しは `false` | `server.js:1315-1318`, `public/main.js:1502-1504` |
| body の任意 `lineUserId` でサーバーログイン | 不可。サーバーはそのフィールドを認証に使わない | `server.js:1306-1317` |
| 任意 CustomID の新規作成 | 同梱ブラウザ呼び出しは `false` なので作らない。サーバーは LINE 検証済みIDだけ `true`。第三者が Client API に `CreateAccount:true` を直接送った場合の可否は要管理画面・実機確認 | 上記2か所 |
| 既存アカウントなりすまし | サーバー経路では不可。Client API が現設定で有効なら、既存の正確な LINE user ID を知る者が PlayFab セッションを得る可能性が高い | `public/main.js:1502-1517` |
| PlayFab セッションから Firebase API への横展開 | 直接は不可。Express は PlayFab ticket ではなく Firebase ID token を検証する | `server/auth.js:87-131` |

ブラウザ内で確認できた直接 PlayFab Client API は `LoginWithCustomID` と `GetUserReadOnlyData` である（`public/main.js:1502-1517`, `public/main.js:2123-2128`）。ただし SessionTicket があれば、タイトル側で許可された他の Client/Entity API や配備中 CloudScript をUI外から呼べる可能性がある。`playfab_cloudscript/legacy_cloudscript.js` には `currentPlayerId` を権限主体にしたプロフィール・国家・王・Economy 関連 handler があるため、配備revisionとクライアント実行可否を確認する必要がある。

### PlayFab 管理画面で確認する項目

- ブラウザのハードコード Title ID `1A0BA` と `PLAYFAB_TITLE_ID` が同一タイトルか。
- Client `LoginWithCustomID` が有効か。`CreateAccount:true` の直接リクエストを受理するか。
- SessionTicket / EntityToken で利用可能な Client API と Entity/Groups 権限。
- Client から Legacy CloudScript を実行できるか、どの revision が配備されているか。
- CustomID を廃止・unlink・移行する方法、既存セッションの失効方法。

## 2. ブラウザからの Firestore 利用

リポジトリに `firestore.rules` はなく、`firebase.json` も RTDB の `database.rules.json` だけを指定している。したがって、現在配備されている Firestore Rules を確認できず安全性は未確定である。

### Collection別操作一覧

`deleteDoc` の直接呼び出しは見つからなかった。`setDoc` の上書きや `updateDoc` による論理削除は存在する。

| collection / document | read | create | update | delete | listen | 主な利用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| `notifications/{playFabId}/items` | - | - | - | - | あり | `public/main.js:1876-1881` |
| `troy_rooms/{group}/chat` | - | - | - | - | あり | `public/js/mapChat.js:134-165` |
| `troy_rooms/global` | - | - | - | - | あり | `public/js/troy.js:1619-1661` |
| `troy_rooms/global/members` | - | - | - | - | あり | `public/js/troy.js:1624-1658` |
| `battleRooms/{roomId}` | - | - | - | - | あり | `public/js/battleRoomClient.js:75-88` |
| `battleRooms/{roomId}/events` | - | - | - | - | あり | `public/js/battleRoomClient.js:91-105` |
| `battleRooms/{roomId}/positions/snapshot` | あり | - | あり（共有document内の自分のkey） | - | あり | `public/js/battleRoomClient.js:109-127`, `405-417` |
| `ships/{id}` / `ships` | あり | `setDoc` による作成可能 | あり。位置、移動、船ID、視界、同乗状態等 | - | あり | `public/WorldMapScene.js:1185-1189`, `2227-2255`, `3246-3247`, `5959-6287`, `6621-6655`; `public/js/ship.js:3967-3973`, `4207-4224`; `public/js/battleRoomClient.js:450-458` |
| `world_map` / `world_map_{mapId}` | 一覧取得 | - | あり。`ownerId`/`ownerNation` のクリアを含む | - | あり（建築中） | `public/WorldMapScene.js:1202-1205`, `1589-1592`, `5448-5458`, `6783-6803` |
| `shipRideRequests/{target}_{requester}` | あり | あり | あり。承認・拒否・取消 | - | あり | `public/WorldMapScene.js:3126-3247`, `3291-3349`。機能フラグは `public/WorldMapScene.js:18` で無効 |
| `ship_action_events` | - | あり | - | - | あり | `public/WorldMapScene.js:4147-4179`, `4343-4368`。現在の呼び出し元は未確認 |
| `islands` | - | - | - | - | あり | `public/WorldMapScene.js:6900-6927` |

### 最低限必要な Firestore Rules 制約

- すべてのブラウザ操作で `request.auth != null`。
- Firebase UID と PlayFab ID を同一とし、`notifications/{uid}` と `ships/{uid}` は原則 `request.auth.uid == uid`。
- self documentでも変更可能fieldを限定し、`playFabId`、owner、nation、権限、報酬、HP等を不変またはサーバー専用にする。
- `battleRooms` は参加者だけにreadを許可し、共有 `positions/snapshot` は自分のmap key以外のdiffを禁止する。可能なら1プレイヤー1documentへ分割する。
- `troy_rooms` とchatは意図した国・部屋のmembershipを要求する。
- `shipRideRequests` は requester/target の役割別に許可する遷移を限定し、第三者とcross-user ship writeを禁止する。
- `ship_action_events` は source を `request.auth.uid` に固定し、効果種別・対象・強度・時刻を制限する。報酬や戦闘正本には使わない。
- `world_map` の所有権変更はクライアント直書きを禁止し、認証済みサーバーAPIへ寄せる。
- 数値範囲、timestamp、追加/削除field、document size、query条件を検証する。
- Firebase Emulator で owner / other user / participant / nonparticipant / unauthenticated のallow-denyテストを持つ。

## 3. Realtime Database

### `navalPlunderRooms`

`database.rules.json:73-77` は、任意の `$roomId` に対して `.read` と `.write` を `auth != null` だけで許可する。したがって、このRulesが配備されていれば、認証済みユーザーは他人のルームを含むroom全体を作成・置換・削除できる。owner、participant、自分のfield、turn、HP、winner、reward、timestamp、schemaの制約はない。

ただし、現在のリポジトリ内には `navalPlunderRooms` のread/write利用箇所が存在しない。現行コードから永続報酬への到達は確認できず、現在の実害はnamespaceの完全性と、外部・旧版・将来クライアントがこのpathを使う場合の改ざんリスクである。

### `tarotKingdomRooms`

- open room indexは認証済みユーザーがreadでき、owner/hostだけがwriteできる。
- `presence/{uid}` は本人だけがwriteでき、`playFabId == auth.uid`、seat ownership、時刻範囲を検証する。
- `state`、`authorityState`、`privateHands` はhostだけがwriteする。
- private handはhostまたは該当seat ownerだけがreadする。
- participant actionは本人の新規actionだけを許し、seat、presence鮮度、revision、action type、時刻を検証する。
- 通常participantが別participantを書き換える、fresh seatを奪う、state/HP/turnを直接書く経路はRules上確認されなかった。

残る境界はhostがブラウザクライアントである点である。Rulesはhostのgame-semanticな正当性までは検証せず、構造制約内ならhostがstateを決定できる。また、`tests/tarot-kingdom-rtdb-rules.spec.js` はRules文字列の部分一致テストであり、Firebase Emulatorで実行する攻撃ケースではない。

### タロット報酬との照合

重大な問題はRTDBを改ざんしなくても成立する。`/api/exploration/claim` はFirebase認証を行うが、terminal RTDB state、winner、revision、action transcriptを読まず、bodyの `tarotOutcome`、`tarotStandings`、`jobAbpRounds` を報酬へ反映する（`server/exploration.js:3945-4015`, `4126-4139`, `4181-4185`, `4228-4257`, `4298-4319`）。`/api/exploration/raid-finish` もclient申告damageを最大1,000,000まで受け入れ、raid HPとfinisher rewardに使用する（`server/exploration.js:2855-2951`, `server/tarotKingdomRaid.js:120-129`）。

## 4. Express API 認証一覧

全252 APIルートの method、path、状態、認証証拠、権限語、外部システム、定義位置は [express-api-auth-inventory.md](./express-api-auth-inventory.md) に列挙した。

### 認証方式の分布

静的抽出では、155ルートに Firebase ID token 認証、3ルートに `x-admin-secret`、2ルートに署名付きassessment token、1ルートにLINE access token、93ルートはroute handler内に認証証拠がなかった。93件には公開read、410廃止route、handler関数内認証なども含むため、件数だけで脆弱性とは判断していない。

### 実装パターン

| パターン | 実際の認証 | 評価 |
| --- | --- | --- |
| `server/auth.js` を使う通常API | Firebase Admin `verifyIdToken`、UIDとbody PlayFab ID比較 | helperが呼ばれる限り安全。403 mismatchも実装済み |
| `inventory`, `exploration`, `nation`, `guild`, `ship`, `tarotDeck`, `events` の多く | module内 `requireAuthed*` wrapper | route単位の採用漏れが発生している |
| `card`, `npc-snapshot`, `battle-room` の多く | Express middlewareとして直接適用 | 比較的一貫しているが例外routeあり |
| `weekly-contest/open|close|season-end` | `x-admin-secret` | secret未設定時にfail-open |
| personality assessment answer | 署名付き短期token | Firebaseとは別の用途限定境界 |
| `island`, `shop`, `musicGame`, `tarotFortune`, `tarotReading`, `chat` | なし | 状態変更・特権操作を含み危険 |

### 認証なし／方式不一致で確認した主な状態変更route

- 島: `claim-island`, `damage-island-building`, capture一式、`create-island`, `rename-island`, `collect-resource`, `hot-spring-bath`, price/upgrade一式。
- shop: price一式、`sell-to-shop`, `buy-from-shop`, construction一式。
- TROY staff: order item status/quantity/remove/add/review/settle。`TROY_STAFF_CHECKOUT_ENABLED` は `server/nation.js:83` で常時true。
- music game: results create/update/void、skip、catalog exclusion/remove/refresh。
- tarot reading: official LINE send。
- tarot fortune: status/draw。
- chat/display: global/nearby send、display event。
- ship: `/api/start-ship-voyage` は `isNpc` をbodyで受け、任意ship documentを更新する。
- battle room resolve: 認証なしだが、expiry後にdefender勝利へ解決するだけで早期実行は409になる。現時点の直接悪用は限定的。
- `ensure-nation-group`: 認証なしでPlayFab Admin/Firestoreの国家group確保を起動できるがraceは固定mappingで操作は冪等的。
- 廃止済み `manifest-tarot-card`, `study-tarot-card`, `troy-convert-coin-to-gold` は410のみで状態変更しない。

### 共通middleware化の評価

可能であり、優先度が高い。`/api/login-playfab`、公開read、webhook等を明示的public routerに分離し、それ以外はFirebase認証をdefaultにする。認証middlewareは `req.authenticatedPlayFabId` を設定し、self操作はbody IDを捨てるか一致確認する。さらに `requireStaff`、`requireKing`、`requireInternalScheduler` を共通化する。現在の「各handlerが忘れずhelperを呼ぶ」設計は今回の採用漏れの直接原因である。

## 5. G・報酬・ランキング

### 正本と更新API

- Gの正本は PlayFab Economy V2 item `PS`。`server/economy.js:226-264` が `GetInventoryItems`、`AddInventoryItems`、`SubtractInventoryItems` を使う。
- `ps_ranking` は PlayFab statistic の派生値。`UpdatePlayerStatistics` でPS残高を複製する。
- 一般送金は Economy V2 transfer後、双方のPS残高を再読込してランキングを更新する（`server/economy.js:743-835`）。
- shop purchaseは `PurchaseInventoryItems` ではなく、PS減算、item加算、Firestore stock、owner PS、国庫を順番に処理する（`server/shop.js:645-679`）。
- black marketはoperation状態とidempotencyを持ち、refund/recoveryを実装しているが、PSランキング同期は一貫していない（`server/inventory.js:1991-2168`）。

### 主要な加減算・報酬経路

| 種別 | 主な経路 | `ps_ranking` |
| --- | --- | --- |
| 加算 | legacy add、LINE friend bonus、inventory売却、shop売却/owner売上、tarot fortune、exploration/TROY/battle報酬、guild withdrawal | 経路により更新あり／なし |
| 減算 | legacy use、送金、shop購入、gacha、upgrade/construction、guild deposit/founding、TROY gold-to-coin | 経路により更新あり／なし |
| purchase | shop、black market、gacha、島/船/建物upgrade | 複数サービスへの逐次write |
| ranking | `UpdatePlayerStatistics(... ps_ranking ...)` | Economy mutationとは非atomic |

### 確認した不整合経路

1. `server/economy.js:502-507`, `530-535` はPS更新後にranking更新する。後者だけ失敗するとPSは確定済みでHTTP 500となり、retry時に二重変更の可能性がある。legacy routeは既定で無効だが、環境変数で有効化できる。
2. `server/economy.js:773-835` は送金後のranking失敗を `postTransferSyncError` として成功応答する。PSは正しいがrankingが古い。
3. LINE friend bonusは `server.js:1610-1627` でPSを加算し残高を返すが、`ps_ranking` を更新しない。
4. shopの売買・owner売上は `server/shop.js:600-611`, `651-679` でPSを変更するがrankingを更新しない。
5. `server/island.js:1737-1755` の温泉支払・owner売上など、PS変更後に片側だけ／どちらもranking未同期の経路がある。
6. PS更新とFirestore stock、receipt、grant、国庫、rankingは共通transactionではない。例えばshop購入でPS減算成功後にitem grantまたはstock updateが失敗すると、500を返しても既にPSが減っている。全経路にdurable recovery recordがあるわけではない。
7. gachaは課金後のgrant失敗時にPS refundするが、refund後にrankingを再同期していない（`server/inventory.js:3578-3601`）。

PSが正本なのでランキング不整合はPS自体の改ざんではない。しかしランキング表示・順位報酬・再試行の安全性に影響する。共通の「PS操作→残高再読込→ranking同期失敗をdurable queueへ記録→reconciliation」workflowが必要である。

## 6. CSP

`server.js:472` の `express.static(public)` が `server.js:475-486` のCSP middlewareより先にある。Expressは静的fileが見つかるとそこで応答を終了するため、次の実効範囲になる。

| response | CSP header |
| --- | --- |
| `/` の `public/index.html`、既存HTML/JS/CSS/image | 付かない |
| `/js/tarot-engine/HandEvaluator`, `/js/tarot-engine/GameController` | CSPより前のrouteなので付かない |
| `/line/webhook`, `/line/qr/:lineUserId` | CSPより前のrouteなので付かない |
| `/display`, `/api/display-stream`, CSP後に登録されたAPI | 付く |
| staticで見つからず後段へ進む404/route | 原則付く |

さらにpolicyの `script-src` は `'unsafe-inline'` を許可している。今回XSS入口は確定していないため単独のコード実行脆弱性とは評価しないが、LIFF/Firebase/PlayFab tokenを持つ主要HTMLに防御が効いていない。

## 7. 重要度別所見

以下の各所見は、指定された7項目を同じ順序で記載する。

### 🔴 Critical

#### C-1. TROY staff会計APIでPS・itemを無認証付与できる

- 該当ファイル・関数: `server/nation.js:83`, `settleTroyCheckoutForRoom` (`5462-5600`), `/api/troy-orders/add-item` (`6050-6092`), `/settle` (`5967-5982`) ほかstaff route。
- 現在の処理フロー: 認証なしで任意price itemをopen room memberのcheckoutへ追加し、settleでclient指定 `chipReturnAmount` を最大1,000,000まで `AddInventoryItems(PS)` する。menu item/cashbackも付与し得る。
- なぜ問題か: server-side staff identityも価格・実決済証明もない。
- 実際に悪用可能か: 可能。TROYがopenで対象がmember、checkoutが存在することが前提。自分で正規入店した通常playerも無認証staff APIを直接叩ける。
- 推奨修正: 全staff routeにFirebase認証＋server管理staff allowlist/roleを必須化。price、chip return、representativeをserver orderから導出し、settlementを一意かつ先にreservationする。
- 影響範囲: TROY order UI、staff運用、PS、item、sales、contribution、notification、ランキング。

#### C-2. 島ダメージ・占領・資源処理がbodyのPlayFab IDを信用する

- 該当ファイル・関数: `server/island.js:804-898` の `initializeIslandRoutes` / `applyMyHomeStorageDamage`、`/api/damage-island-building` (`968-1038`)、claim/capture/create/upgrade系。
- 現在の処理フロー: 認証なしで `playFabId` と上限のない `damage` を受け、Firestore HPを減らす。home破壊時はdefenderのEconomy資源を減らし、指定attackerの船cargoへlootを保存する。
- なぜ問題か: actor、damage、battle成立、cooldownがserverで証明されない。
- 実際に悪用可能か: 可能。island/building IDと被害者/攻撃者IDが分かれば、無認証で建物破壊・資源消失・略奪を起こせる。
- 推奨修正: Firebase UIDからactorを導出し、damageをserver保有battle/action recordから計算。operation ID、cooldown、上限、reconciliationを持たせる。
- 影響範囲: island/capture UI、world map Firestore、Economy資源、ship cargo、国境・所有権。

#### C-3. shop APIで価格改ざん・他ユーザーの強制支出ができる

- 該当ファイル・関数: `server/shop.js:349-350` の `initializeShopRoutes`、`set-shop-pricing` (`509-537`)、`sell-to-shop` (`576-616`)、`buy-from-shop` (`620-683`) ほかconstruction系。
- 現在の処理フロー: owner判定はbody `playFabId == island.ownerId` だけ。buyはbody指定playerからPSを引き、itemを与え、island ownerへ売上を加算する。
- なぜ問題か: caller identityとowner/buyerの同意がない。攻撃者所有shopの価格を上げて被害者IDでbuyすればPSをownerへ移せる。
- 実際に悪用可能か: 可能。stockと被害者残高等の前提はあるが、認証は不要。
- 推奨修正: 全routeをFirebase認証し、actorをtoken UIDに固定。owner操作、buyer操作を分離し、price policy・idempotency・purchase recoveryを導入する。
- 影響範囲: shop UI、island、PS、inventory、stock、tax、nation treasury、ranking。

### 🟠 High

#### H-1. LINE user IDがPlayFab Clientの再利用可能なログイン秘密になる

- 該当ファイル・関数: `public/main.js:843-844`, `initializeLiff` 内 `LoginWithCustomID` (`1502-1517`)。
- 現在の処理フロー: LINE検証済みserver login後、ブラウザがLINE user IDだけでPlayFabへ再ログインしSessionTicket/EntityTokenを得る。
- なぜ問題か: LINE user IDは識別子であり所有証明ではない。LINE tokenとのcryptographic bindingがPlayFab直接経路にない。
- 実際に悪用可能か: PlayFab titleがClient CustomID loginを許可し、攻撃者が既存の正確なLINE user IDを知れば可能性が高い。Firebase APIへの直接横展開はできない。最終確認は要管理画面・実機確認。
- 推奨修正: browser CustomID loginを削除し、LINE検証後の短期・一回限りserver credentialまたは正式identity provider連携でPlayFab credentialを取得する。既存CustomID/sessionを移行・失効する。
- 影響範囲: `public/main.js`、PlayFab client read、EntityToken依存機能、Legacy CloudScript、ログイン移行。

#### H-2. タロット勝敗・順位・HP・raid damageのclient申告が永続報酬へ到達する

- 該当ファイル・関数: `public/js/playfabClient.js:933-962`, `public/js/ship.js:2637-2646`, `server/exploration.js:3945-4393`, raid finish `2855-2951`。
- 現在の処理フロー: 認証済みclientが `victory`、standings、survivors、damageを送る。serverはactive exploration/participant/idempotencyを確認するがterminal RTDB stateやaction transcriptを検証せず、Economy item、ABP、clear/stat、finisher rewardへ使う。
- なぜ問題か: 認証は「誰か」だけを証明し、「本当に勝ったか」を証明しない。
- 実際に悪用可能か: 可能。自分のactive explorationまたはraid attemptがあれば、UIを介さず勝利・高damageを申告できる。shared explorationはpersisted participantであることが必要。
- 推奨修正: server-authoritative battle engine、またはseed/nonce/roster/monotonic revision付きaction transcriptをserverで再計算・検証し、winner/standings/survivor/damageをserver導出する。
- 影響範囲: Tarot Kingdom online、exploration、raid、Economy reward、ABP、pet、statistics、tests。

#### H-3. tarot-reading sendが公式LINE botを無認証利用する

- 該当ファイル・関数: `server/tarotReading.js:200-288` のcustomers/send route。
- 現在の処理フロー: bodyでactive customerとtextを選び、privileged Firestore mappingからLINE IDを解決し、`lineClient.pushMessage` する。
- なぜ問題か: trusted official accountのsender権限にstaff認証がない。
- 実際に悪用可能か: 可能。対象はopen TROY roomのLINE連携customerに限られるが、phishing、harassment、quota消費ができる。
- 推奨修正: Firebase＋staff/reader role、server-created reading session、recipient binding、一回限りrequest ID、template/length/rate limit、監査log。
- 影響範囲: tarot reading UI、LINE Messaging API、customer privacy、運用。

#### H-4. music-game管理routeが固定staff identityで無認証

- 該当ファイル・関数: `server/musicGame.js:434-649`、`staffPlayFabId = 'staff-portal'`。
- 現在の処理フロー: unauth callerがresult create/update/void、skip、catalog exclusion/remove/refreshを実行し、全て `staff-portal` と記録される。
- なぜ問題か: individual staff identityもroleもなくaudit attributionが虚偽になる。
- 実際に悪用可能か: 可能。公開API到達だけで店内game結果とcatalogを改ざんできる。
- 推奨修正: 全routeにFirebase＋staff allowlist/custom claim。authenticated staff IDを記録し、refresh rate limitとimmutable audit logを追加する。
- 影響範囲: music game UI、Firestore results/catalog/issues、外部catalog fetch、運用log。

#### H-5. `ADMIN_SECRET` 未設定時にweekly contest管理routeがfail-open

- 該当ファイル・関数: `server/routes/weeklyContestRoutes.js:218-220`, `259-261`, `333-335`、scheduler `server/weeklyContestScheduler.js:18-21`。
- 現在の処理フロー: headerと `process.env.ADMIN_SECRET` が不一致なら拒否する。両方 `undefined` なら比較が一致し、routeを通す。
- なぜ問題か: credential未設定が管理者認証なしに変わる。
- 実際に悪用可能か: 環境変数未設定時は可能。現在のproduction値は要外部設定確認。
- 推奨修正: startupで十分な長さのsecretを必須化し、route側もsecret空なら必ず拒否。可能ならservice identity/署名requestへ移行する。
- 影響範囲: weekly contest、territory、season reward、scheduler、deploy secrets。

#### H-6. NPC voyage開始routeが無認証で任意ship documentを更新する

- 該当ファイル・関数: `server/routes/shipRoutes.js:1905-1965` の `/api/start-ship-voyage`。
- 現在の処理フロー: body `isNpc:true`、任意 `shipId`、destination、speedを受け、owner/NPC属性を検証せずFirestore movementを更新する。
- なぜ問題か: `isNpc` はcaller申告であり、対象ship ownership確認がない。
- 実際に悪用可能か: 可能。ship IDを知ればplayer shipを含むdocumentを任意destination/speedで移動状態にできる。
- 推奨修正: internal scheduler専用認証、server-side NPC flag確認、destination/speed policy、operation IDを追加する。
- 影響範囲: ship movement、world map、NPC scheduler、Firestore queries。

#### H-7. Tarot fortuneが任意PlayFab IDを無認証で日次claimする

- 該当ファイル・関数: `server/tarotFortune.js:1378-1509`。
- 現在の処理フロー: body PlayFab IDのfortune recordを読み、カード/PS/bounty rewardを付与し、日次済み状態とrankingを書く。
- なぜ問題か: target accountとcallerを結ぶ認証がない。
- 実際に悪用可能か: 可能。被害者の選択前に日次drawを消費し、結果・fragment・rewardを勝手に確定できる。reward自体は被害者へ入るため直接窃取ではない。
- 推奨修正: status/drawともFirebase認証し、targetをtoken UIDに固定。claim marker reservationとgrantをidempotent workflowにする。
- 影響範囲: fortune UI、PlayFab ReadOnly Data、Economy reward、bounty、ranking。

### 🟡 Medium

#### M-1. `ps_ranking` がPS mutationと一貫して同期されない

- 該当ファイル・関数: `server/economy.js:502-535`, `743-835`; `server.js:1610-1627`; `server/shop.js:600-679`; `server/island.js:1737-1755`; `server/inventory.js:3578-3601`。
- 現在の処理フロー: Economy V2 PS更新とstatistic更新が別callで、更新しない経路や失敗を非fatalにする経路がある。
- なぜ問題か: rankingが正本PSとずれ、retryで二重処理も起き得る。
- 実際に悪用可能か: legitimate route選択で古い高rankingを維持できる場合がある。PS自体を直接増やす問題ではない。
- 推奨修正: 共通PS workflow、durable sync queue、定期full reconciliation、idempotencyを全routeへ。
- 影響範囲: Economy全体、leaderboard、ranking reward、UI、運用修復。

#### M-2. CSPが主要static HTMLに付かない

- 該当ファイル・関数: `server.js:472-486`。
- 現在の処理フロー: staticが先にresponseを終え、CSP middlewareへ到達しない。到達するpolicyも `'unsafe-inline'` を許可する。
- なぜ問題か: tokenを持つ主要pageでXSS防御層が働かない。
- 実際に悪用可能か: 今回は独立XSS入口を確定していないため、単独悪用ではなく防御不足。
- 推奨修正: security headersを全route/staticより前へ移動し、nonce/hashへ段階移行。`object-src`, `base-uri`, `frame-ancestors` 等も追加する。
- 影響範囲: 全HTML/asset/API、inline script、CDN許可、LIFF/Firebase/PlayFab SDK。

#### M-3. `navalPlunderRooms` は全認証userがroom全体を書ける

- 該当ファイル・関数: `database.rules.json:73-77`。
- 現在の処理フロー: `auth != null` だけで全room read/write。
- なぜ問題か: owner/participant/field/state transition/schemaの境界がない。
- 実際に悪用可能か: Rulesが配備されていればroom storageの置換・削除は可能。ただし現repoにconsumerがなく報酬到達は未確認。
- 推奨修正: 未使用ならdeny。使用するならchild単位owner/participant規則、immutable fields、server-only winner/reward、Emulator攻撃testを追加する。
- 影響範囲: RTDB rules、legacy/future naval client、room migration。

#### M-4. Chat/display eventのauthorが無認証・client指定

- 該当ファイル・関数: `server/chat.js:24-78`, `server.js:530-560`。
- 現在の処理フロー: bodyのplayFabId/displayName/eventをそのままprocess memory/SSEへ流す。
- なぜ問題か: 他player/system impersonationとspamができる。
- 実際に悪用可能か: 可能。永続DBではなくbuffer上限200のため影響は表示・運用に限定される。
- 推奨修正: Firebase認証、server profileから名前導出、system eventはinternal only、length/rate limit。
- 影響範囲: chat UI、display SSE、moderation。

#### M-5. Economy purchase/rewardが複数systemの非atomic逐次write

- 該当ファイル・関数: `server/shop.js:645-679`, `server/inventory.js:1991-2168`, `server/nation.js:5462-5688` など。
- 現在の処理フロー: PS、item、stock、receipt、treasury、rankingを順番に更新。経路ごとにrefund/idempotency/recoveryの強さが違う。
- なぜ問題か: 中間失敗後の500やretryが支払済み・未付与、二重付与、stale stockを作る。
- 実際に悪用可能か: network/service failureで現実に発生可能。意図的なtiming悪用は再現未実施。
- 推奨修正: durable operation state machine、全step idempotency、補償処理、reconciliation。black marketの既存patternを参考に共通化する。
- 影響範囲: shop、inventory、TROY、guild、island、rank、notifications。

#### M-6. API認証がdefault-denyではなくrouteごとの手動採用

- 該当ファイル・関数: `server/auth.js:104-131` と各 `initialize*Routes`。
- 現在の処理フロー: 強い共通helperはあるが、各handlerが明示的に呼ぶ。initializerでdependencyを受け取らないmoduleもある。
- なぜ問題か: 新規routeや例外routeで採用漏れが繰り返される。
- 実際に悪用可能か: 今回のCritical/High route群が実例。
- 推奨修正: public routerを限定列挙し、残り `/api` をglobal Firebase auth。role middlewareとauth contract testを追加する。
- 影響範囲: 全Express route、client auth timing、tests、scheduler/webhook。

#### M-7. LINE/PlayFab identifierを外部QR serviceへ渡す

- 該当ファイル・関数: `server.js:443-452` の `/line/qr/:lineUserId`。
- 現在の処理フロー: unauth URLのLINE IDからmappingを引き、`TROY:<PlayFabId>` または `LINE:<lineUserId>` を `api.qrserver.com` queryへ入れてredirectする。
- なぜ問題か: persistent identifierが第三者へ渡り、既知LINE IDからlink有無・PlayFab IDを確認できる。
- 実際に悪用可能か: LINE IDを既に知ることが前提。enumerationは高entropy IDのため困難。
- 推奨修正: QRをlocal生成し、短期opaque redeem tokenだけをencode。ownership/signatureを確認する。
- 影響範囲: LINE rich menu、QR UX、line_user_links、privacy。

#### M-8. Tarot hostはclient authorityで、RTDB Rules testは実行評価ではない

- 該当ファイル・関数: `database.rules.json:46-68`, `public/js/tarotKingdom.js:16135-16900`, `tests/tarot-kingdom-rtdb-rules.spec.js`。
- 現在の処理フロー: host clientだけがstate/private/authorityを書く。testはRules文字列の期待fragmentを確認する。
- なぜ問題か: malicious hostのsemantic forgeryと複合Rules評価を防げない。
- 実際に悪用可能か: 非host bypassは未確認。hostによるmatch fairness改ざんは構造上可能だが、永続報酬は別のH-2経路が先に問題。
- 推奨修正: Emulator allow/deny test、server-verifiable outcome、host migration/stale seat attack test。
- 影響範囲: Tarot online、RTDB schema/rules、tests、reward claim。

### 🟢 問題なし

#### N-1. 正規 `/api/login-playfab` はbodyの任意LINE user IDを信用しない

- 該当ファイル・関数: `server.js:1306-1318`, `server/auth.js:50-68`。
- 現在の処理フロー: LINE tokenをProfile APIで検証し、応答user IDをCustomIDにする。
- なぜ問題ではないか: callerがbodyに別user IDを書いてもaccount selectionに使われない。
- 実際に悪用可能か: この経路では不可。
- 推奨修正: この性質をintegration testで固定し、bodyの不要なprofile field送信を減らす。
- 影響範囲: login API/testのみ。

#### N-2. `requireAuthenticatedPlayFabId` は呼ばれたrouteでcross-accountを拒否する

- 該当ファイル・関数: `server/auth.js:87-131`。
- 現在の処理フロー: Firebase ID tokenをverifyし、UIDを正規化し、expected PlayFab IDと不一致なら403。
- なぜ問題ではないか: PlayFab ticketやbody IDだけで認証を通せない。
- 実際に悪用可能か: helper自体のbypassは未確認。
- 推奨修正: helperをdefault適用し、revocation policyが必要なら `checkRevoked` とsession方針を追加する。
- 影響範囲: 全protected API。

#### N-3. LINE webhookは署名検証しsecret未設定時もfail-closed

- 該当ファイル・関数: `server.js:287-305`。
- 現在の処理フロー: raw bodyと `x-line-signature` をchannel secretで検証してからJSON parse/処理する。
- なぜ問題ではないか: 偽webhookを本文処理前に401で拒否し、secretなしは500で停止する。
- 実際に悪用可能か: code上の署名bypassは未確認。
- 推奨修正: 現状維持し、LINE consoleのsecret/endpointとfailure monitoringを確認する。
- 影響範囲: LINE webhook運用。

#### N-4. Tarot RTDBで通常participantのcross-user writeは制限される

- 該当ファイル・関数: `database.rules.json:17-68`。
- 現在の処理フロー: UID、seat ownership、presence freshness、host role、action schemaでwrite/readを分離する。
- なぜ問題ではないか: 非hostが他participant presence、private hand、authoritative stateを書く許可は見つからない。
- 実際に悪用可能か: reviewed Rules上の直接bypassは未確認。
- 推奨修正: Emulator testで実効性を固定する。host authority問題はM-8/H-2として別管理。
- 影響範囲: RTDB rules/tests。

#### N-5. PSの正本はEconomy V2であり`ps_ranking`ではない

- 該当ファイル・関数: `AGENTS.md`, `docs/playfab.md`, `server/economy.js:226-264`。
- 現在の処理フロー: balanceはEconomy V2 inventoryから集計し、rankingはPlayFab statisticへ派生複製する。
- なぜ問題ではないか: stale rankingがPS残高そのものを変更しない設計境界は明確。
- 実際に悪用可能か: ranking driftはM-1だが、statisticをPS正本として支出する経路は確認されなかった。
- 推奨修正: 現状の正本定義を維持し、派生同期だけを共通化する。
- 影響範囲: Economy/ranking。

### ⚪ 要外部設定確認

#### E-1. PlayFab login・Client API・CloudScript設定

- 該当ファイル・関数: `public/main.js:843-844,1502-1517`, `server.js:457-460`, `playfab_cloudscript/legacy_cloudscript.js`。
- 現在の処理フロー: client/server title設定が別sourceで、browserはCustomID sessionを要求する。
- なぜ確認が必要か: login provider、Client API、CloudScript revision/permissionはrepoにない。
- 実際に悪用可能か: H-1の最終権限と任意CustomID新規作成可否は管理画面・実機次第。
- 推奨確認: title一致、CustomID create/login、Client/Entity permission、CloudScript deployment、session revoke。
- 影響範囲: PlayFab全体、login migration。

#### E-2. 配備中Firestore Security Rules

- 該当ファイル・関数: `firebase.json`, browser Firestore利用一覧。
- 現在の処理フロー: browserが直接read/listen/writeするが、repoにRulesがない。
- なぜ確認が必要か: allow/denyは配備Rulesだけが決める。
- 実際に悪用可能か: 現在は断定不可。permissiveならcross-user ship/world/battle/ride改ざんに直結する。
- 推奨確認: production Rulesをexportし、差分なしでsource controlへ追加後、Emulator test。
- 影響範囲: Firebase deploy、全browser Firestore機能。

#### E-3. 配備中RTDB RulesとFirebase project整合

- 該当ファイル・関数: `database.rules.json`, `firebase.json`, `public/js/config.js`, server Firebase service account初期化。
- 現在の処理フロー: browser configとAdmin credentialが別sourceで、repo Rulesをdeploy可能。
- なぜ確認が必要か: production projectと実Rulesがrepoと一致する保証がない。
- 実際に悪用可能か: `navalPlunderRooms` はrepo Rulesが配備済みなら可能。project mismatchはauth/deny/別tenant影響。
- 推奨確認: project ID、database URL、Rules release hash、service account project、Auth provider/authorized domain。
- 影響範囲: Firebase Auth/Firestore/RTDB。

#### E-4. LINE/LIFF設定

- 該当ファイル・関数: `public/main.js:1437-1457`, `server/auth.js:50-68`。
- 現在の処理フロー: hard-coded LIFF IDでtokenを取得し、serverはProfile API成功をidentity proofにする。
- なぜ確認が必要か: provider/channel、endpoint、scope、external browser、期待audienceの管理設定はrepo外。
- 実際に悪用可能か: 別channel token受理などの可否は現コードだけで断定不可。
- 推奨確認: LIFF ID所属、channel/provider一致、redirect/endpoint URL、scope、token validation policy。
- 影響範囲: LINE login、rich menu、friend bonus。

#### E-5. `ADMIN_SECRET` とorigin/deploy設定

- 該当ファイル・関数: weekly contest route、`public/js/config.js:14-16`, `public/js/api.js:7-49`。
- 監査時点の処理フロー: admin secretはenv、API baseは固定Render URL、Firebase tokenはsame-origin `/api/*` にだけ付与していた。S1-2では単一Express構成に合わせてAPI baseを相対same-originへ変更済み（未配備）。
- なぜ確認が必要か: secret有無・強度と実page originはrepoから決まらない。
- 実際に悪用可能か: secret未設定ならH-5。cross-originならprotected APIはtokenなしで失敗し、unauth routeだけ動く。
- 推奨確認: non-empty secret、page/API same origin、CORS、TLS、actual response headers。
- 影響範囲: contest scheduler、全API auth、deployment。

## 最初に修正するべき3項目

1. **ブラウザ直接 `LoginWithCustomID` を停止し、PlayFab管理画面でClient CustomID/CloudScript権限を即時確認する。** 2026-08-30にコード修正済み（未配備）。管理画面確認と既発行sessionの扱いは未完了。
2. **TROY staff会計routeを閉じ、Firebase＋staff roleなしでは1件も処理しないようにする。** 現状は最大1,000,000 PSのclient指定付与が可能で、最も直接的な通貨mint経路である。2026-08-31の運用判断により現時点では現状維持とするが、リスク自体は未解消である。
3. **島・shopの全状態変更routeをdefault認証へ移し、actor/damage/priceをserverで導出する。** 他ユーザー資源破壊・略奪・強制支出を同時に止める。

次点は、タロット探索・raid報酬からclient申告勝敗/damageを排除することである。
