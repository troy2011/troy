# Express API 認証インベントリ

最終更新日: 2026-09-01

この表はリポジトリ内の `app/router.get/post/put/patch/delete` から、`/api/` で始まる全ルートを静的抽出したものです。Google Business Profile営業時間同期の専用3ルートを廃止したため、現在は全252件です。

- Authentication はルート登録式とハンドラー本体に現れる認証証拠です。ヘルパー外部に隠れた認証や、認証なしのスタッフ画面という運用前提は別途 `docs/security-auth-audit.md` で評価します。
- State は GET を read、SSE/イベント購読を listen/read、POST 等は名前が明白な参照系だけ read、それ以外を state-change/command とした上で、危険候補を本文監査でコード追跡しています。
- Required role / authorization はコード追跡で確認した追加認可です。`staff intended, missing` は画面用途上staff操作だがserver-side認可が存在しないことを示します。`domain checks` はking、owner、guild role等の個別判定を含みます。
- Systems はそのハンドラーで直接参照される外部システムです。呼び出し先ヘルパー内の間接利用は本文監査のモジュール別説明を参照してください。
- TROY staff会計routeは2026-08-31の運用判断で現行のまま維持します。表の `none in route handler` / `staff intended, missing` は引き続き現行コードの事実であり、修正済みや安全確認済みを意味しません。

| Method | Path | State | Authentication | Required role / authorization | Systems | Source |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/display-stream` | listen/read | none in route handler | no global admin role | - | `server.js:530` |
| POST | `/api/display-event` | state-change/command | none in route handler | no global admin role | - | `server.js:555` |
| POST | `/api/login-playfab` | state-change/command | LINE access token | no global admin role | PlayFab, Firestore, LINE | `server.js:1292` |
| POST | `/api/player-bootstrap` | read | Firebase ID token (UID = PlayFab ID) | self only | PlayFab | `server.js:1399` |
| POST | `/api/get-app-invite-info` | read | none in route handler | no global admin role | PlayFab | `server.js:1425` |
| POST | `/api/apply-app-invite` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server.js:1448` |
| POST | `/api/get-line-friend-bonus-status` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, LINE | `server.js:1569` |
| POST | `/api/claim-line-friend-bonus` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, LINE | `server.js:1589` |
| POST | `/api/create-app-invite` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server.js:1654` |
| POST | `/api/set-race` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore, LINE | `server.js:1702` |
| POST | `/api/get-global-chat` | read | none in route handler | no global admin role | - | `server/chat.js:26` |
| POST | `/api/send-global-chat` | state-change | none in route handler | no global admin role | - | `server/chat.js:31` |
| POST | `/api/get-nearby-chat` | read | none in route handler | no global admin role | - | `server/chat.js:46` |
| POST | `/api/send-nearby-chat` | state-change | none in route handler | no global admin role | - | `server/chat.js:63` |
| POST | `/api/get-points` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/economy.js:466` |
| POST | `/api/add-points` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/economy.js:491` |
| POST | `/api/use-points` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/economy.js:519` |
| POST | `/api/get-ranking` | read | none in route handler | no global admin role | PlayFab | `server/economy.js:550` |
| POST | `/api/get-bounty-ranking` | read | none in route handler | no global admin role | PlayFab, Firestore | `server/economy.js:582` |
| POST | `/api/get-store-game-ranking` | read | none in route handler | no global admin role | PlayFab | `server/economy.js:604` |
| POST | `/api/king-update-store-game-score` | state-change/command | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab | `server/economy.js:650` |
| POST | `/api/transfer-points` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/economy.js:744` |
| POST | `/api/get-player-display-name` | read | none in route handler | no global admin role | PlayFab | `server/economy.js:852` |
| POST | `/api/update-player-display-name` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/economy.js:870` |
| POST | `/api/troy-calendar/list` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/events.js:529` |
| POST | `/api/troy-calendar/save` | state-change | Firebase ID token (UID = PlayFab ID) | domain checks | PlayFab, Firestore | `server/events.js:555` |
| POST | `/api/troy-calendar/delete` | state-change | Firebase ID token (UID = PlayFab ID) | domain checks | PlayFab, Firestore | `server/events.js:749` |
| POST | `/api/events/list` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/events.js:837` |
| POST | `/api/events/create` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/events.js:860` |
| POST | `/api/events/join` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/events.js:930` |
| POST | `/api/events/approve` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/events.js:1014` |
| POST | `/api/reservations/list` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/events.js:1060` |
| POST | `/api/reservations/create` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/events.js:1083` |
| POST | `/api/reservations/review` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/events.js:1141` |
| POST | `/api/reservations/cancel` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/events.js:1168` |
| POST | `/api/tarot-kingdom/job-abp/round` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/exploration.js:2411` |
| POST | `/api/exploration/status` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | - | `server/exploration.js:2727` |
| POST | `/api/tarot-kingdom/raid/status` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | - | `server/exploration.js:2740` |
| POST | `/api/tarot-kingdom/raid/start` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | Firestore | `server/exploration.js:2756` |
| POST | `/api/tarot-kingdom/raid/finish` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/exploration.js:2855` |
| POST | `/api/tarot-kingdom/pet-state` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/exploration.js:2970` |
| POST | `/api/tarot-kingdom/pet-name` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/exploration.js:2988` |
| POST | `/api/tarot-kingdom/pet-round-roll` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/exploration.js:3024` |
| POST | `/api/tarot-kingdom/pet-choice` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/exploration.js:3150` |
| POST | `/api/player-ship/status` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/exploration.js:3185` |
| POST | `/api/player-ship/upgrade` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/exploration.js:3207` |
| POST | `/api/player-ship/name` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/exploration.js:3279` |
| POST | `/api/player-ship/major-arcana/equip` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/exploration.js:3339` |
| POST | `/api/player-ship/major-arcana/unequip` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/exploration.js:3381` |
| POST | `/api/player-ship/major-arcana/move` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/exploration.js:3415` |
| POST | `/api/exploration/start` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/exploration.js:3450` |
| POST | `/api/exploration/stage-join` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/exploration.js:3640` |
| POST | `/api/exploration/stage-party-sync` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/exploration.js:3707` |
| POST | `/api/exploration/retreat` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore, RTDB | `server/exploration.js:3757` |
| POST | `/api/exploration/encounter` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | Firestore | `server/exploration.js:3885` |
| POST | `/api/exploration/claim` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/exploration.js:3945` |
| POST | `/api/equipment-enhancement/preview` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:2449` |
| POST | `/api/equipment-enhancement/apply` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:2465` |
| POST | `/api/get-inventory` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:2482` |
| POST | `/api/equip-item` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:2588` |
| POST | `/api/get-equipment` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:2767` |
| POST | `/api/get-player-public-profile` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/inventory.js:2804` |
| POST | `/api/preview-tarot-manifestation` | read | none in route handler | no global admin role | - | `server/inventory.js:2931` |
| POST | `/api/manifest-tarot-card` | state-change/command | none in route handler | no global admin role | - | `server/inventory.js:2935` |
| POST | `/api/study-tarot-card` | state-change/command | none in route handler | no global admin role | - | `server/inventory.js:2939` |
| POST | `/api/get-stats` | read + state maintenance | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:2944` |
| POST | `/api/allocate-stat-points` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:2989` |
| POST | `/api/update-avatar-style` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:3039` |
| POST | `/api/ensure-avatar-style-defaults` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:3108` |
| POST | `/api/recover-hp-resource` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:3154` |
| POST | `/api/recover-mp-resource` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:3179` |
| POST | `/api/consume-voyage-mp` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:3204` |
| POST | `/api/recover-docked-mp` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:3266` |
| POST | `/api/use-item` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:3330` |
| POST | `/api/sell-item` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:3417` |
| POST | `/api/sell-items` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:3455` |
| POST | `/api/black-market/list` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:3492` |
| POST | `/api/black-market/origins` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:3507` |
| POST | `/api/black-market/create` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:3521` |
| POST | `/api/black-market/cancel` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:3539` |
| POST | `/api/black-market/buy` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:3554` |
| POST | `/api/pull-gacha` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/inventory.js:3572` |
| POST | `/api/claim-island` | state-change | none in route handler | no global admin role | PlayFab, Firestore | `server/island.js:910` |
| POST | `/api/damage-island-building` | state-change | none in route handler | no global admin role | PlayFab, Firestore | `server/island.js:968` |
| POST | `/api/start-island-capture` | state-change | none in route handler | no global admin role | - | `server/island.js:1102` |
| POST | `/api/join-island-capture` | state-change | none in route handler | no global admin role | - | `server/island.js:1123` |
| POST | `/api/cancel-island-capture` | state-change | none in route handler | no global admin role | - | `server/island.js:1144` |
| POST | `/api/complete-island-capture` | state-change | none in route handler | no global admin role | Firestore | `server/island.js:1161` |
| POST | `/api/create-island` | state-change | none in route handler | no global admin role | PlayFab, Firestore | `server/island.js:1230` |
| POST | `/api/get-owned-islands` | read | none in route handler | no global admin role | PlayFab, Firestore | `server/island.js:1351` |
| POST | `/api/get-island-details` | read | none in route handler | no global admin role | PlayFab, Firestore | `server/island.js:1406` |
| POST | `/api/rename-island` | state-change | none in route handler | no global admin role | PlayFab, Firestore | `server/island.js:1516` |
| POST | `/api/get-resource-status` | read + state initialization | none in route handler | no global admin role | Firestore | `server/island.js:1571` |
| POST | `/api/collect-resource` | state-change/command | none in route handler | no global admin role | PlayFab, Firestore | `server/island.js:1622` |
| POST | `/api/hot-spring-bath` | state-change/command | none in route handler | no global admin role | PlayFab, Firestore | `server/island.js:1689` |
| POST | `/api/set-hot-spring-price` | state-change | none in route handler | no global admin role | Firestore | `server/island.js:1765` |
| POST | `/api/upgrade-island-level` | state-change | none in route handler | no global admin role | PlayFab, Firestore | `server/island.js:1796` |
| POST | `/api/upgrade-building` | state-change | none in route handler | no global admin role | PlayFab, Firestore | `server/island.js:1937` |
| GET | `/api/get-constructing-islands` | read | none in route handler | no global admin role | Firestore | `server/island.js:2086` |
| GET | `/api/troy-music-game/bootstrap` | read | none in route handler | staff intended, missing | PlayFab, Firestore | `server/musicGame.js:442` |
| POST | `/api/troy-music-game/results` | state-change/command | none in route handler | staff intended, missing | PlayFab, Firestore | `server/musicGame.js:465` |
| POST | `/api/troy-music-game/results/update` | state-change | none in route handler | staff intended, missing | PlayFab, Firestore | `server/musicGame.js:502` |
| POST | `/api/troy-music-game/results/void-latest` | state-change | none in route handler | staff intended, missing | PlayFab, Firestore | `server/musicGame.js:532` |
| POST | `/api/troy-music-game/skip` | state-change | none in route handler | staff intended, missing | PlayFab, Firestore | `server/musicGame.js:555` |
| POST | `/api/troy-music-game/catalog/exclusions` | state-change | none in route handler | staff intended, missing | PlayFab, Firestore | `server/musicGame.js:582` |
| POST | `/api/troy-music-game/catalog/exclusions/remove` | state-change | none in route handler | staff intended, missing | Firestore | `server/musicGame.js:615` |
| POST | `/api/troy-music-game/catalog/refresh` | state-change | none in route handler | staff intended, missing | PlayFab, Firestore | `server/musicGame.js:629` |
| POST | `/api/get-nation-group` | read | none in route handler | no global admin role | PlayFab, Firestore | `server/nation.js:3060` |
| POST | `/api/ensure-nation-group` | state-change/command | none in route handler | bootstrap/internal intended, missing | PlayFab, Firestore | `server/nation.js:3082` |
| POST | `/api/get-nation-announcements` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/nation.js:3130` |
| POST | `/api/set-nation-announcement` | state-change | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab | `server/nation.js:3145` |
| POST | `/api/get-nation-king-page` | read | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab, Firestore | `server/nation.js:3175` |
| GET | `/api/troy-bounty-ranking` | read | none in route handler | no global admin role | - | `server/nation.js:3299` |
| POST | `/api/king-set-grant-multiplier` | state-change/command | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab, Firestore | `server/nation.js:3312` |
| POST | `/api/get-capital-war-state` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/nation.js:3336` |
| POST | `/api/nation-war-capital-action` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/nation.js:3364` |
| POST | `/api/nation-war-deploy` | state-change/command | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab, Firestore | `server/nation.js:3559` |
| POST | `/api/nation-war-prepare-strike` | state-change/command | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab, Firestore | `server/nation.js:3620` |
| POST | `/api/nation-war-intercept` | state-change/command | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab, Firestore | `server/nation.js:3702` |
| POST | `/api/nation-war-raid-treasury` | state-change/command | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab, Firestore | `server/nation.js:3769` |
| POST | `/api/king-transfer` | state-change/command | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab, Firestore | `server/nation.js:3890` |
| POST | `/api/king-set-troy-open` | state-change/command | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab, Firestore, LINE | `server/nation.js:3987` |
| POST | `/api/king-update-menu` | state-change/command | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab, Firestore | `server/nation.js:4028` |
| POST | `/api/get-troy-status` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/nation.js:4083` |
| POST | `/api/troy-join` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/nation.js:4128` |
| POST | `/api/troy-leave` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/nation.js:4247` |
| POST | `/api/get-troy-chat` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/nation.js:4273` |
| POST | `/api/send-troy-chat` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/nation.js:4317` |
| POST | `/api/troy-convert-gold-to-coin` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/nation.js:4669` |
| POST | `/api/troy-convert-coin-to-gold` | state-change/command | none in route handler | no global admin role | - | `server/nation.js:4733` |
| POST | `/api/king-troy-return-coin` | state-change/command | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab, Firestore | `server/nation.js:4737` |
| POST | `/api/king-grant-ps` | state-change/command | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab, Firestore | `server/nation.js:4840` |
| POST | `/api/king-direct-grant-ps` | state-change/command | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab, Firestore | `server/nation.js:4951` |
| POST | `/api/troy-orders/list` | read | none in route handler | staff intended, missing | - | `server/nation.js:5744` |
| POST | `/api/troy-orders/item-status` | state-change | none in route handler | staff intended, missing | PlayFab, Firestore | `server/nation.js:5766` |
| POST | `/api/troy-orders/item-quantity` | state-change/command | none in route handler | staff intended, missing | PlayFab, Firestore | `server/nation.js:5816` |
| POST | `/api/troy-orders/remove-item` | state-change | none in route handler | staff intended, missing | PlayFab, Firestore | `server/nation.js:5893` |
| POST | `/api/troy-orders/settle` | state-change | none in route handler | staff intended, missing | - | `server/nation.js:5967` |
| POST | `/api/troy-orders/set-open` | state-change | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab, Firestore, LINE | `server/nation.js:5985` |
| POST | `/api/troy-orders/customer-request` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/nation.js:6017` |
| POST | `/api/troy-orders/customer-request-review` | state-change/command | none in route handler | staff intended, missing | - | `server/nation.js:6037` |
| POST | `/api/troy-orders/add-item` | state-change | none in route handler | staff intended, missing | PlayFab, Firestore | `server/nation.js:6050` |
| GET | `/api/troy-orders/stream` | listen/read | none in route handler | staff intended, missing | PlayFab, Firestore | `server/nation.js:6095` |
| POST | `/api/king-exile` | state-change/command | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab, Firestore | `server/nation.js:6242` |
| POST | `/api/donate-nation-currency` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/nation.js:6365` |
| POST | `/api/get-map-occupation` | read | none in route handler | no global admin role | PlayFab | `server/nation.js:6420` |
| POST | `/api/get-map-occupation-map` | read | none in route handler | no global admin role | PlayFab | `server/nation.js:6433` |
| POST | `/api/get-world-map-layout` | read | none in route handler | no global admin role | PlayFab | `server/nation.js:6453` |
| POST | `/api/swap-world-map-cells` | state-change/command | Firebase ID token (UID = PlayFab ID) | king/domain role check | PlayFab, Firestore | `server/nation.js:6464` |
| POST | `/api/get-nation-treasury-ranking` | read | none in route handler | no global admin role | Firestore | `server/nation.js:6526` |
| POST | `/api/get-nation-levels` | read | none in route handler | no global admin role | PlayFab, Firestore | `server/nation.js:6536` |
| GET | `/api/personality-assessment/config` | read | none in route handler | no global admin role | - | `server/personalityAssessment.js:355` |
| POST | `/api/personality-assessment/status` | read + repair/cleanup | none in route handler | no global admin role | PlayFab | `server/personalityAssessment.js:365` |
| POST | `/api/personality-assessment/start` | state-change | signed assessment token | no global admin role | PlayFab | `server/personalityAssessment.js:400` |
| POST | `/api/personality-assessment/answer` | state-change | signed assessment token | no global admin role | PlayFab | `server/personalityAssessment.js:443` |
| POST | `/api/player-compatibility` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/personalityAssessment.js:521` |
| POST | `/api/battle-room/create` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore, LINE | `server/routes/battleRoomRoutes.js:300` |
| POST | `/api/battle-room/join` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/battleRoomRoutes.js:362` |
| POST | `/api/battle-room/damage-building` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/battleRoomRoutes.js:406` |
| POST | `/api/battle-room/collect-arcana` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/battleRoomRoutes.js:463` |
| POST | `/api/battle-room/strike-symbol` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/battleRoomRoutes.js:526` |
| POST | `/api/battle-room/report-kill` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/battleRoomRoutes.js:624` |
| POST | `/api/battle-room/move` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/battleRoomRoutes.js:670` |
| POST | `/api/battle-room/attack-player` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/battleRoomRoutes.js:686` |
| POST | `/api/battle-room/respawn` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/battleRoomRoutes.js:750` |
| POST | `/api/battle-room/resolve` | state-change | none in route handler | no global admin role | PlayFab, Firestore | `server/routes/battleRoomRoutes.js:791` |
| GET | `/api/battle-room/active/:territoryId` | read | none in route handler | no global admin role | Firestore | `server/routes/battleRoomRoutes.js:810` |
| GET | `/api/battle-room/:roomId` | read | none in route handler | no global admin role | Firestore | `server/routes/battleRoomRoutes.js:822` |
| POST | `/api/tarot-kingdom/combat-profiles` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/battleRoutes.js:675` |
| GET | `/api/tarot-battle-skills` | read | none in route handler | no global admin role | - | `server/routes/cardRoutes.js:127` |
| GET | `/api/cards` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/cardRoutes.js:135` |
| POST | `/api/cards/levelup` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/cardRoutes.js:157` |
| POST | `/api/get-guild-info` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:960` |
| POST | `/api/get-guild-invite-info` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:1077` |
| POST | `/api/crew-recruitment/list` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/guildRoutes.js:1163` |
| POST | `/api/crew-recruitment/save` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:1239` |
| POST | `/api/crew-recruitment/apply` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:1277` |
| POST | `/api/create-guild` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/guildRoutes.js:1362` |
| POST | `/api/join-guild` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:1586` |
| POST | `/api/leave-guild` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:1708` |
| POST | `/api/get-guild-members` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:1771` |
| POST | `/api/update-guild-member-role` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:1883` |
| POST | `/api/remove-guild-member` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:1941` |
| POST | `/api/get-guild-applications` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:1997` |
| POST | `/api/approve-guild-application` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:2093` |
| POST | `/api/reject-guild-application` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:2191` |
| POST | `/api/get-guild-chat` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:2250` |
| POST | `/api/send-guild-chat` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:2274` |
| POST | `/api/get-guild-warehouse` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:2344` |
| POST | `/api/donate-to-guild-warehouse` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:2375` |
| POST | `/api/deposit-guild-currency` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:2455` |
| POST | `/api/withdraw-guild-currency` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:2516` |
| POST | `/api/withdraw-from-guild-warehouse` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:2579` |
| POST | `/api/get-guild-ranking` | read | none in route handler | no global admin role | PlayFab | `server/routes/guildRoutes.js:2644` |
| POST | `/api/add-guild-exp` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/guildRoutes.js:2670` |
| POST | `/api/npc-snapshot/update` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/npcSnapshotRoutes.js:54` |
| GET | `/api/npc-snapshot/:playFabId` | read | none in route handler | no global admin role | Firestore | `server/routes/npcSnapshotRoutes.js:74` |
| GET | `/api/npc-snapshot/nation/:nation` | read | none in route handler | no global admin role | Firestore | `server/routes/npcSnapshotRoutes.js:96` |
| POST | `/api/get-active-ship` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/shipRoutes.js:820` |
| POST | `/api/set-active-ship` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/shipRoutes.js:850` |
| GET | `/api/get-ship-catalog` | read | none in route handler | no global admin role | - | `server/routes/shipRoutes.js:967` |
| POST | `/api/create-ship` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/shipRoutes.js:979` |
| POST | `/api/upgrade-ship` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/shipRoutes.js:1235` |
| POST | `/api/consume-ship-broadside` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/shipRoutes.js:1316` |
| POST | `/api/repair-ship` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/shipRoutes.js:1357` |
| POST | `/api/get-ship-resource-storage` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/shipRoutes.js:1457` |
| POST | `/api/deposit-ship-resources` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/shipRoutes.js:1509` |
| POST | `/api/save-ship-resource-preset` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/shipRoutes.js:1552` |
| POST | `/api/apply-ship-resource-preset` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/shipRoutes.js:1568` |
| POST | `/api/respawn-ship` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/routes/shipRoutes.js:1738` |
| POST | `/api/get-ship-asset` | read | none in route handler | no global admin role | PlayFab | `server/routes/shipRoutes.js:1765` |
| POST | `/api/get-ship-asset-light` | read | none in route handler | no global admin role | PlayFab | `server/routes/shipRoutes.js:1818` |
| POST | `/api/get-ship-position` | read | none in route handler | no global admin role | Firestore | `server/routes/shipRoutes.js:1879` |
| POST | `/api/start-ship-voyage` | state-change | none in route handler | internal NPC authority intended, missing | Firestore | `server/routes/shipRoutes.js:1905` |
| POST | `/api/stop-ship` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/shipRoutes.js:1971` |
| POST | `/api/get-player-ships` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/shipRoutes.js:2018` |
| POST | `/api/get-ships-in-view` | read | none in route handler | no global admin role | Firestore | `server/routes/shipRoutes.js:2089` |
| GET | `/api/territory` | read | none in route handler | no global admin role | - | `server/routes/territoryRoutes.js:64` |
| GET | `/api/territory/:territoryId` | read | none in route handler | no global admin role | - | `server/routes/territoryRoutes.js:75` |
| GET | `/api/territory/:territoryId/history` | read | none in route handler | no global admin role | Firestore | `server/routes/territoryRoutes.js:90` |
| GET | `/api/weekly-contest/status` | read | none in route handler | no global admin role | - | `server/routes/weeklyContestRoutes.js:153` |
| GET | `/api/weekly-contest/season` | read | none in route handler | no global admin role | Firestore | `server/routes/weeklyContestRoutes.js:172` |
| POST | `/api/weekly-contest/damage` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab, Firestore | `server/routes/weeklyContestRoutes.js:197` |
| POST | `/api/weekly-contest/open` | state-change | x-admin-secret | admin/internal | Firestore | `server/routes/weeklyContestRoutes.js:218` |
| POST | `/api/weekly-contest/close` | state-change | x-admin-secret | admin/internal | Firestore | `server/routes/weeklyContestRoutes.js:259` |
| POST | `/api/weekly-contest/season-end` | state-change | x-admin-secret | admin/internal | - | `server/routes/weeklyContestRoutes.js:333` |
| GET | `/api/weekly-contest/passives/:nation` | read | none in route handler | no global admin role | Firestore | `server/routes/weeklyContestRoutes.js:350` |
| POST | `/api/get-shop-state` | read + state initialization | none in route handler | no global admin role | Firestore | `server/shop.js:446` |
| POST | `/api/set-shop-pricing` | state-change | none in route handler | no global admin role | Firestore | `server/shop.js:509` |
| POST | `/api/set-shop-item-price` | state-change | none in route handler | no global admin role | Firestore | `server/shop.js:541` |
| POST | `/api/sell-to-shop` | state-change | none in route handler | no global admin role | PlayFab, Firestore | `server/shop.js:576` |
| POST | `/api/buy-from-shop` | state-change | none in route handler | no global admin role | PlayFab, Firestore | `server/shop.js:620` |
| POST | `/api/start-building-construction` | state-change | none in route handler | no global admin role | PlayFab, Firestore | `server/shop.js:687` |
| POST | `/api/check-building-completion` | state-change when due | none in route handler | no global admin role | Firestore | `server/shop.js:990` |
| POST | `/api/help-construction` | state-change/command | none in route handler | no global admin role | PlayFab, Firestore | `server/shop.js:1066` |
| GET | `/api/get-building-meta` | read | none in route handler | no global admin role | - | `server/shop.js:1128` |
| POST | `/api/get-buildings-by-category` | read | none in route handler | no global admin role | PlayFab, Firestore | `server/shop.js:1140` |
| POST | `/api/tarot-deck-get` | read | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/tarotDeck.js:462` |
| POST | `/api/tarot-deck-preset-save` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/tarotDeck.js:483` |
| POST | `/api/tarot-deck-preset-apply` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/tarotDeck.js:511` |
| POST | `/api/tarot-deck-equip` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/tarotDeck.js:552` |
| POST | `/api/tarot-deck-unequip` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/tarotDeck.js:584` |
| POST | `/api/tarot-deck-replace` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/tarotDeck.js:613` |
| POST | `/api/tarot-guardian-equip` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/tarotDeck.js:643` |
| POST | `/api/tarot-guardian-unequip` | state-change/command | Firebase ID token (UID = PlayFab ID) | no global admin role | PlayFab | `server/tarotDeck.js:678` |
| POST | `/api/tarot-fortune-status` | read | none in route handler | no global admin role | PlayFab | `server/tarotFortune.js:1381` |
| POST | `/api/tarot-fortune-draw` | state-change/command | none in route handler | no global admin role | PlayFab, LINE | `server/tarotFortune.js:1402` |
| GET | `/api/tarot-job-mastery` | read | Firebase ID token (via `sendState`) | no global admin role | - | `server/tarotKingdomJobMastery.js:227` |
| POST | `/api/tarot-job-mastery` | read | Firebase ID token (via `sendState`) | no global admin role | - | `server/tarotKingdomJobMastery.js:228` |
| POST | `/api/tarot-job-mastery/select` | state-change | Firebase ID token (UID = PlayFab ID) | no global admin role | - | `server/tarotKingdomJobMastery.js:229` |
| GET | `/api/tarot-reading/customers` | read | none in route handler | staff/reader intended, missing | - | `server/tarotReading.js:200` |
| POST | `/api/tarot-reading/send` | state-change | none in route handler | staff/reader intended, missing | LINE | `server/tarotReading.js:213` |
