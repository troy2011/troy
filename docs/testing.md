# Testing guide

## 現在の仕組み

- Playwright specs: `tests/*.spec.js`
- 共通 LIFF/Firebase/API mock: `tests/helpers/main-app-harness.js`
- Node test: `tests/music-game-server.test.cjs`, `tests/stylelint-rules.test.cjs` 等
- E2E config: `playwright.config.cjs`
- CSS lint: `npm run lint:css`
- encoding check: `npm run check:encoding`

`npm test` は `npm run test:e2e` を実行し、その pretest で CSS lint も実行する。本番 PlayFab／Firebase に書く script と通常テストを混同しない。

## 変更別の最低確認

| 変更 | 最低限の確認 |
| --- | --- |
| ドキュメントのみ | `npm run check:encoding`、リンク／path の目視、`git diff --check` |
| 共通 UI/HTML | `tests/main-app.spec.js` の対象 test、390x844 前後の mobile 表示、console error |
| CSS | `npm run lint:css`、対象画面 screenshot、重複 selector がないこと |
| API route | 対応 `*-routes.spec.js`、成功・400・401・403・外部 API 失敗 |
| 認証/LIFF | `tests/s1-browser-auth.spec.js`, `tests/main-app.spec.js`, `tests/line-friend-bonus.spec.js`、token なし・別 UID・expired token、PlayFab Browser API通信が0件であること |
| Economy/G/item | `tests/economy.spec.js`, inventory/shop/equipment 対応 spec、残高不足・二重送信・途中失敗 |
| Ship/island/map | ship/map/island 関連 spec、PlayFab 正本と Firestore 投影の片側失敗 |
| Tarot/RTDB | tarot 関連 spec と `tests/tarot-kingdom-rtdb-rules.spec.js`、host/guest/第三者、秘密情報分離 |
| Nation/guild/TROY | nation/guild/TROY 関連 spec、王/一般/別国家、idempotency、SSE 再接続 |
| Catalog/scripts | dry-run、対象件数、差分、明示承認なしに publish しない |

## セキュリティ回帰の共通ケース

状態変更 API には少なくとも次を用意する。

1. 有効な Firebase ID token と一致する PlayFab ID
2. Bearer token なし
3. token UID と body/path の PlayFab ID が異なる
4. 一般 player が王／staff 操作を要求
5. 同じ request ID の再送
6. PlayFab 成功後に Firestore が失敗、または逆
7. amount/score が負、0、小数、上限超過、文字列、極端な値
8. target item/ship/island/guild が本人所有でない

クライアント UI で button を隠すことは権限試験にならない。API を直接呼んだ試験を作る。

## Firebase Rules

Realtime Database rules は JSON 構造の静的 test がある。可能なら Firebase Emulator を使う実評価 test へ拡張する。

Firestore rules は現在リポジトリにないため、直接クライアント access の完全な回帰試験はできない。配備 rules を取り込んだ後、owner/participant/unauthenticated の emulator test を追加する。

## 実行例

PowerShell では対象を変数に定義してから使う。

```powershell
$spec = 'tests/economy.spec.js'
npx playwright test $spec
```

```powershell
$spec = 'tests/tarot-kingdom-rtdb-rules.spec.js'
npx playwright test $spec
```

```powershell
$script = 'lint:css'
npm run $script
```

全体確認:

```powershell
$script = 'test'
npm run $script
```

## テストを通すためにしてはいけないこと

- 認証・所有権・上限 validation を弱める
- flaky test を理由なく削除／skip する
- production fallback を mock 専用分岐にする
- `stylelint-baseline.json` を承認なしに更新する
- PlayFab catalog publish、Firebase deploy、migration、実ユーザーへの付与を通常 test として実行する
