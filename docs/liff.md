# LIFF, LINE login, and API authentication

## 現在のログインフロー

実装は `public/main.js`, `server.js`, `server/auth.js`, `public/js/api.js` にまたがる。

1. `public/main.js` が `liff.init()` を実行する。
2. 未ログインなら `liff.login()`、ログイン済みなら `liff.getProfile()` と `liff.getAccessToken()` を呼ぶ。
3. `/api/login-playfab` へ access token と表示用 profile を送る。
4. サーバーは受信した `lineUserId` を信用せず、LINE profile API (`/v2/profile`) に access token を提示して user ID を取得する。
5. 検証済み LINE user ID を PlayFab CustomId として `PlayFabServer.LoginWithCustomID` する。
6. サーバーは profile/display name/avatar、`line_user_links`、PlayFab ReadOnly `lineUserId` を同期し、PlayFab ID を UID とする Firebase custom token を返す。
7. ブラウザは Firebase Auth の `signInWithCustomToken` を行う。
8. `public/js/api.js` が同一 origin `/api/*` へ Firebase ID token を Bearer header として付ける。
9. `/api/player-bootstrap` が認証UIDに結び付いたPlayFab ReadOnly Dataだけを起動表示用に返す。
10. サーバーは `admin.auth().verifyIdToken()` し、UID と request body の PlayFab ID を照合する。

LINE 友だち bonus は access token で friendship API をサーバーから確認し、PlayFab ReadOnly claim flag と Economy V2 idempotency ID で重複付与を防ぐ。

## 各識別子の役割

- LINE user ID: LINE 側の主体。保存値だけで本人確認しない
- PlayFab ID: ゲーム側 player key
- Firebase UID: 現在は PlayFab ID と同じ値。API token と Firebase Rules の主体
- PlayFab entity key: Economy V2／Entity API の対象。PlayFab ID と同一とは限らない
- LINE display name/avatar: 表示用 profile。権限判定に使わない

`line_user_links/{lineUserId}` は LINE webhook や店舗機能から PlayFab ID を引く索引であり、認証 token の代わりではない。

## API 認証ルール

- `/api/login-playfab` だけが Firebase Bearer token なしで開始できる。
- 公開 read-only endpoint は必要性を明示する。
- player state を読む endpoint は privacy と IDOR を検討し、必要なら本人／公開 profile field のみに絞る。
- state mutation は必ず `requireAuthenticatedPlayFabId` または同等の middleware を使う。
- body の `playFabId`, `targetId`, role, nation, king flag をそのまま採用しない。
- LINE webhook は channel secret による署名検証を通す。channel access token は送信用であり署名検証の代わりではない。

## 現在の重要な懸念

### PlayFab Client CustomID 再ログイン（修正済み・未配備）

発見時は、Firebase sign-in 後にブラウザが `PlayFab.ClientApi.LoginWithCustomID` を再実行し、entity token と session ticket を `window` に保持していた。2026-08-30のS1-2で直接ログイン、Browser SDK読込、Client `GetUserReadOnlyData` を削除し、起動データはFirebase認証済み `/api/player-bootstrap` へ移した。新規ユーザーの `/api/set-race` もブラウザのEntityKey／EntityTokenを要求しない。

コードから新しいPlayFab browser sessionは発行されない。修正前に発行済みのSessionTicket／EntityTokenはコード配備だけでは失効しないため、PlayFab管理画面で有効期限・失効方法・Client CustomID login・CloudScript権限を確認する。

配備では、先に `/api/player-bootstrap` を含むサーバーを出し、その後 `main.js` と `playfabClient.js` の新しいquery versionおよびService Worker cache世代を出す。最後にテストタイトルで確認してからPlayFabのClient CustomID policyを閉じる。既存ユーザーのPlayFab ID／Firebase UIDを保つため、Server Custom IDへのprovider置換はこの変更に含めない。

### origin と API base

`public/js/api.js` は同一 origin の `/api/*` にだけ Firebase token を付ける。S1-2では、単一Expressが静的クライアントとAPIを配信する現行構成に合わせて `API_BASE_URL` を相対URLへ変更した。将来別originへ分離する場合は、任意originへtokenを漏らさないallowlistとCORSを同じ変更で設計する。

### 公開設定

Firebase Web config と LIFF ID はクライアントに置かれる公開識別子であり、secret ではない。安全性は Firebase Rules、authorized domain、LIFF endpoint/scope、サーバー検証で確保する。PlayFab secret、LINE channel secret、service account は絶対にクライアントへ置かない。

## 変更チェック

- LINE access token を必ず LINE API で検証したか
- client profile と server-verified profile を混同していないか
- Firebase UID と要求 PlayFab ID を照合したか
- LIFF scope、redirect URL、external browser/in-client の双方を確認したか
- API base が変わっても Bearer token と CORS が正しく働くか
- logout/token expiration/retry で別 player の状態を再利用しないか
- LINE webhook の signature verification を通るか
