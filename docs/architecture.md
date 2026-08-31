# TROY architecture

最終更新日: 2026-08-30。ここでは実コードで確認できた現状を記す。履歴資料にある構想ではなく、`server.js` と現在のモジュールを基準にする。

## 全体像

TROY は単一の Express プロセスが静的クライアントと API を提供する構成である。ブラウザは LIFF で LINE にログインし、サーバーが LINE access token を検証して PlayFab アカウントへ結び付ける。その後、PlayFab ID を UID とした Firebase custom token で Firebase Auth にログインする。

データは用途で分割されている。

- PlayFab: プレイヤーの恒久データ、Economy V2 inventory、統計、ランキング、国家／ギルドの Entity/Group data、Title Data、Legacy CloudScript
- Cloud Firestore: 共有ワールドと位置、運用中のルーム／イベント／店舗状態、LINE 対応索引、通知
- Realtime Database: タロットキングダムと海戦の低遅延ルーム状態
- クライアント: 表示、一時状態、好み。恒久報酬の正本にはしない

Firebase Functions のディレクトリはなく、CloudScript 以外のバックエンド処理は Express サーバーで実行される。

## 実行時フロー

1. `public/index.html` が Firebase Web SDK、LIFF SDK と `public/main.js` を読み込む。PlayFab Browser SDK は読み込まない。
2. `initializeLiff()` が LIFF ID を初期化し、未ログインなら LINE login へ遷移する。
3. クライアントが LIFF access token を `/api/login-playfab` に送る。
4. サーバーは LINE profile API で token を検証し、検証結果の LINE user ID を `LoginWithCustomID` の CustomId に使う。
5. サーバーは PlayFab ID を UID とする Firebase custom token を返す。クライアントは Firebase Auth に sign-in する。
6. `public/js/api.js` は同一 origin の `/api/*` へ Firebase ID token を Bearer token として付与する。
7. 起動表示用のReadOnly Dataは、Firebase認証後に `/api/player-bootstrap` が認証UIDからPlayFab IDを確定して取得する。
8. 状態変更 API は `requireAuthenticatedPlayFabId` で token UID と要求対象 ID を照合し、サーバー資格情報で PlayFab／Firebase を更新する。

詳細と現状の懸念は `docs/liff.md` を参照する。

## サーバー構成

`server.js` が Firebase Admin、PlayFab、LINE client、カタログキャッシュを初期化し、機能モジュールへ依存を渡す。主な機能群は次のとおり。

- プレイヤー／経済: `economy.js`, `inventory.js`, `equipmentEnhancement.js`, `statAllocation.js`, `playerLevel.js`, `shop.js`, `gacha.js`
- 共有世界: `map.js`, `island.js`, `building.js`, `resourceStorage.js`, `routes/shipRoutes.js`
- 国家／ギルド／店舗: `nation.js`, `routes/guildRoutes.js`, `events.js`, `chat.js`, `troyCalendarGoogleSync.js`, `musicGame.js`
- タロット／戦闘: `exploration.js`, `tarot*.js`, `routes/battleRoutes.js`, `routes/battleRoomRoutes.js`, `routes/cardRoutes.js`
- 外部連携: `auth.js`, `lineFriendBonus.js`, `googleBusinessProfile.js`

`server.js` と一部機能ファイルは大きく、特に `server/nation.js`、`server/exploration.js` は複数機能を持つ。全面分割は行わず、変更する責務の周囲だけを小さく保つ。

## クライアント構成

React 等は使わず、`public/index.html`、`public/main.js` と ES modules が DOM を直接操作する。Phaser はマップやゲーム画面の一部で使われる。主要なまとまりは次のとおり。

- 起動／認証／共通画面: `main.js`, `js/api.js`, `js/config.js`, `js/ui.js`
- マップ／船／島: `WorldMapScene.js`, `js/ship.js`, `js/island.js`, `js/islands.js`
- プレイヤー／経済: `js/player*.js`, `js/inventory.js`, `js/rankingUi.js`
- 国家／ギルド／TROY 店舗: `js/nationKing.js`, `js/guild*.js`, `js/troy*.js`
- タロット: `js/tarot*.js`, `js/spinTarot*.js`, `js/tarot-engine/`

`public/style.css` と `public/js/tarotKingdom.js` は非常に大きい。共有 selector や共有状態を変更するときは、全参照を調べて対象 spec を先に決める。

## Source of Truth と投影

| 領域 | 正本 | 投影／索引 | 書込窓口 |
| --- | --- | --- | --- |
| G (`PS`)・資源・所持品 | PlayFab Economy V2 | PlayFab `ps_ranking` statistic、UI表示 | `server/economy.js` の共通 helper と機能側の idempotent transaction |
| プレイヤー属性・装備・進行 | PlayFab ReadOnly/Internal Data、Statistics | public profile response | 各サーバーモジュール。クライアント直接更新は禁止 |
| LINE とゲームIDの結合 | 検証済み LINE token から決まる PlayFab login | Firestore `line_user_links`、PlayFab ReadOnly `lineUserId` | `/api/login-playfab` |
| 国家／ギルド membership | PlayFab Groups | Firestore `nation_groups`、Title Data `NationGroupIds` | `ensureNationGroupExists` と国家／ギルドルート |
| 船 asset・所有・積荷 | PlayFab `Ship_<id>` 等と Economy | Firestore `ships` の位置・見た目・active alias | `shipRoutes`／`resourceStorage` |
| 島・地形・建物・資源 | Firestore world map documents | PlayFab ReadOnly Data の owned-map ID 索引 | `server/island.js` |
| 世界マップ配置・占領 | PlayFab Title Data | Firestore の個別マップ／島状態 | `server/nation.js`, `server/map.js` |
| 店舗／カレンダー／注文 | Firestore `troy_rooms` と subcollections | 集計・監査文書 | `server/events.js`, `server/nation.js` |
| タロットオンラインルーム | Realtime Database | Firestore/PlayFab の恒久報酬・履歴 | `public/js/tarotKingdom.js` と検証 API |

## 確認できた二重管理

### G 残高と `ps_ranking`

G は Economy item `PS` が正本だが、ランキング表示用に `ps_ranking` statistic へ残高を複写している。送金・付与等の複数経路が個別に statistic を更新するため、例外や新規経路で同期漏れが起こり得る。新規 G 更新は中央 helper を通し、将来は残高からランキングを再構築できる管理処理を用意する。

### LINE 対応情報

`line_user_links/{lineUserId}` と PlayFab ReadOnly `lineUserId` に同じ結合情報がある。本人性の正本は保存値ではなく、そのログイン時に LINE API が検証した token である。Firestore は LINE webhook 等から PlayFab ID を引く索引、ReadOnly 値はゲーム側からの参照／監査用と扱う。

### 国家グループ ID

PlayFab Group 自体に加え、Firestore `nation_groups` と Title Data `NationGroupIds` が group ID を保持する。membership と Group Object は PlayFab が正本で、二つの索引は `ensureNationGroupExists` 経由でのみ更新する。片方だけを直接直さない。

### 船

PlayFab の `Ship_<id>` に恒久 asset、Firestore `ships` に位置・見た目・移動と active alias がある。HP 等の一部が Firestore に投影される経路もある。恒久値の判定は PlayFab を使い、Firestore の更新失敗を PlayFab 所有権の変更として扱わない。

### 所有マップ索引

島・建物本体は Firestore にあり、PlayFab ReadOnly Data に owned map ID の索引がある。削除・所有権移動では双方を一つのサーバー処理で更新し、途中失敗を記録して修復可能にする。

## 現在のリスクと未確定事項

優先度が高い順に確認する。

1. Firestore をクライアントが直接読み書きするが、Firestore security rules がリポジトリにない。配備中ルールを取得し、コード管理と emulator test の対象にする必要がある。
2. ブラウザのPlayFab Client CustomID再ログインは2026-08-30のS1-2で削除した。ただし修正前に発行済みのSessionTicket／EntityToken、Client CustomID loginの管理画面設定、配備中CloudScript権限はリポジトリ外なので確認と必要な失効が残る。
3. `database.rules.json` の `navalPlunderRooms` は、認証済みユーザーならルーム全体を読み書きできる。所有者・参加者・schema の制約がなく、勝敗や報酬へ接続するなら危険である。
4. 認証は全 API 共通 middleware ではなく各 handler で呼ぶ方式である。状態変更ルートの追加時に検証漏れが起きやすいため、ルート単位の認証監査が必要である。
5. `express.static` が CSP middleware より先に登録されている。静的 HTML 応答に意図した CSP が付くか実環境で確認し、必要なら順序を直す。
6. G とランキング、国家 group index、船／島の投影は途中失敗でドリフトし得る。再同期・監査手順が不足している。
7. Legacy CloudScript は国家王権限の処理で現在も呼ばれる一方、`EffectProcessor.js` はローカル test と handler 定義しかリポジトリ参照がなく、PlayFab 配備状況はコードだけでは判断できない。削除前に管理画面の revision を確認する。
8. `public/js/shipSkillClient.js` は cooldown を localStorage に置く。報酬や対戦結果へ影響する skill では、サーバー側 cooldown／効果検証が別途必要である。
9. Firebase Web config、API base URL、LIFF ID がクライアントに固定されている。公開値であること自体は secret 漏えいではないが、環境切替と誤接続のリスクがある。

## 並行開発の境界

`AGENTS.md` の 6 担当を使う。PlayFab／Firebase／LIFF を独立した機能担当にしない理由は、ほぼすべてのユーザー機能が複数サービスをまたぐためである。サービス専門性は統合レビュー条件として残し、主担当は機能の end-to-end フローを所有する。

同じファイル、とくに `server.js`、`server/nation.js`、`server/exploration.js`、`public/main.js`、`public/style.css`、`public/js/tarotKingdom.js` を複数タスクで同時編集しない。共通契約変更を先に統合し、その後に利用側を並列化する。
