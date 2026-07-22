# Google Business Profile API 再申請準備

Googleは「内部品質チェック」の個別採点理由を公開していないため、変更なしで再申請せず、公開要件・APIポリシー・OAuth本番要件を確認できる状態にしてから申請する。

## 再申請判断

公式概要はBusiness Profile APIを、複数拠点や大規模なプロフィール管理を効率化する「large, tech-savvy businesses and third parties」向けと説明している。1店舗であること自体を不適格条件とはしていないが、当店の用途が内部品質チェックで再び不承認になる可能性は残る。拠点数や利用規模を誇張せず、下記の整備を完了してもAPIが事業運用上本当に必要な場合だけ再申請する。承認されるまではGoogle ビジネス プロフィール管理画面から営業時間を手動更新する。

## 公開要件チェック

`[x]` はリポジトリ内の実装確認を示す。GBP、OAuth、Search Consoleなど外部画面の項目は、再申請直前に改めて確認し、下記の非公開証跡を残してから完了にする。

- [ ] 確認済みで60日以上アクティブな実店舗プロフィールを管理していることを再確認する
- [ ] GBPのウェブサイト欄に、店舗を表す公開サイトが登録されていることを再確認する
- [ ] 店舗名、住所、電話、通常営業時間、カテゴリ、説明、メニューURLを登録していることを再確認する
- [x] 店舗サイトにNAP、営業時間、メニュー、アクセス、店舗基本情報を実装している
- [x] 営業時間同期ツールの目的・対象・権限・安全対策を公開している
- [x] プライバシーポリシーと利用規約を公開している
- [x] 同期権限をゲーム内役職だけでなく固定店舗スタッフ許可リストでも制限している
- [x] Google反映を選んだ保存・編集・削除ごとに、具体的な明示同意を必須にしている（アプリ内だけの操作とは分離）
- [x] Google側の変更を検出した場合、自動で元へ戻さず確認待ちで停止する
- [ ] 独自ドメインへ店舗サイトを移行し、GBP・canonical・JSON-LD・Search Consoleを統一する
- [ ] 独自ドメインの業務用メールをGoogleアカウント化し、GBPオーナーまたは管理者へ追加する
- [ ] OAuthホームページ、プライバシーポリシー、利用規約、承認済みドメインを独自ドメインへ統一する
- [ ] OAuthアプリ名を公開サイトと完全一致させ、ユーザーサポートメールとデベロッパー連絡先を独自ドメインの業務用メールへ変更する
- [ ] `business.manage` scope、Publishing status `Production`、未確認アプリ警告の有無、必要なOAuth verification状態を確認する
- [ ] 独自ドメインをSearch Consoleで所有権確認し、OAuthの承認済みドメインへ登録する
- [ ] 正式な事業者名または個人事業主名、責任者名、業務用メールを運営情報へ追加する
- [ ] 現在の外観、入口、店内、設備、スタッフ、メニューの実店舗写真を追加する
- [ ] 旧WixとSpaceMarketの名称・説明・URL・営業状態を現状と一致させるか、不要なページを終了する
- [ ] 旧掲載サイトにWi-Fi接続情報などの秘密情報が残っていないか確認し、削除する。現在も有効な認証情報が露出していた場合は変更する
- [ ] GBPの「現金のみ」「テラス席」「バーでの食事」などの属性を実態と照合する
- [ ] メニュー価格が税込・税別のどちらか、チャージ・席料・サービス料・設備利用料などの必須料金があるかを確認し、サイトとGBPへ明記する
- [ ] API申請に使うメールが対象GBPのオーナーまたは管理者であることを再確認する
- [ ] Cloudプロジェクト番号、対象location name、固定スタッフPlayFab IDを運用担当者が確認する
- [ ] 過去3か月の臨時営業時間変更件数、許可スタッフ数、手動二重入力で発生した実際の誤りを集計し、APIが必要な理由を誇張せず説明できるようにする

## 再申請証跡とデモ

個人情報、OAuth秘密情報、サポートケース番号を公開リポジトリへ保存しない。再申請ごとに非公開の管理台帳へ次を記録する。

- [ ] 確認日、確認者、本番URL、デプロイcommitを記録する
- [ ] GBPの確認済み状態、オーナー／管理者、NAP、属性、ウェブサイト、メニュー、写真の画面証跡を保存する
- [ ] OAuth同意画面のアプリ名、ホームページ、プライバシー、規約、サポートメール、デベロッパー連絡先、承認済みドメイン、Publishing status、scopeの画面証跡を保存する
- [ ] Search Consoleの独自ドメイン所有権とCloudプロジェクト番号の画面証跡を保存する
- [ ] 審査担当者向けに、他のデータへアクセスできない隔離済みデモ用スタッフアカウントとログイン手順を準備する
- [ ] デモ手順に、ローカル保存、操作ごとのGoogle同意、具体的差分表示、競合時の自動停止、検証モードを含める
- [ ] Googleからlive-equivalent demoまたは追加資料を求められた場合、指定期限（通常は依頼から7日以内）に安全に提供できる担当者を決める

## 実店舗写真の準備

AI生成画像、ストック写真、過度な合成は店舗写真として使わない。現在の実店舗を撮影し、次を用意する。

- 昼と夜の外観（店名看板と建物全体が分かるもの）
- 道路や駐車位置から入口までの導線、住所・入口が確認できるもの
- 店内全景、カウンター、客席、主要設備
- 実際に提供している代表的なドリンク・フードと現行メニュー
- 掲載同意を得たスタッフ写真

顔、車両番号、予約情報、決済端末、Wi-Fi認証情報、QRコードなど不要な個人情報・秘密情報が写り込んでいないか確認する。写真が揃った後、GBPへ追加し、許可を得た同じ実写のうち1枚をサイトのOG画像とJSON-LD `image` に設定する。

## 再申請時の用途説明（日本語案）

当店は、千葉県富里市で営業する確認済み実店舗「海賊酒場TROY」のオーナーです。本プロジェクト「海賊酒場TROY 営業時間同期」は、当店が所有・管理する1店舗について、臨時営業・臨時休業・貸切による一般営業休止（Google上は休業）をGoogle ビジネス プロフィールの特別営業時間へ正確に反映する社内ツールです。

API利用承認後、My Business Business Information APIでは、サーバーに固定した当店1店舗の `regularHours` と `specialHours` だけを読み取り、更新対象は同じ店舗の `specialHours` だけにします。Google連携の利用者はサーバー側の固定許可リストに登録した店舗オーナーまたは許可スタッフに限定し、Google反映を選んだ各保存・編集・削除の前に対象日・時刻・休業状態と反映先を確認して、具体的かつ明示的に同意します。Google反映を選ばない操作はアプリ内だけで完了し、API更新要求を作りません。

第三者店舗、クチコミ、Q&A、投稿、広告、リード獲得には使用せず、APIを第三者へ提供・再販売・間接提供しません。アプリが管理対象とした日付のGoogle側の値が前回同期内容から変更されている場合は自動上書きせず、店舗スタッフの確認待ちで停止します。OAuth秘密情報はサーバーのSecretとして保管し、更新者・同意・対象日・アプリに入力された変更前後を操作監査に、Google同期の状態と結果を連携状態に記録します。Google APIから取得した具体的な営業時間は永続保存しません。

## Business justification (English draft)

We own and operate one verified physical location, Pirates Bar TROY in Tomisato, Chiba, Japan. This project is a first-party internal tool used only to keep temporary opening hours, temporary closures, and private-event closures accurate on the Google Business Profile that we own and manage.

If API access is approved, the tool will read only `regularHours` and `specialHours` for one server-configured location and will update only `specialHours` for that same location. Google integration access is restricted by a server-side allowlist to the business owner and explicitly authorized store staff. Before each create, edit, or delete action that requests a Google update, the staff member reviews the exact date, hours, closure state, and Google destination and gives specific express consent. Actions that do not opt in remain local to the application and create no API update request.

We do not manage third-party locations and do not use the APIs for reviews, Q&A, posts, ads, lead generation, resale, or indirect access. If the Google-side value for a date managed by our tool differs from the last value applied by our tool, synchronization stops for staff review instead of automatically reverting that date. OAuth secrets remain server-side, and we retain an audit record of authorization, consent, and app-entered intended changes and results. Concrete hours returned by the Google API are not stored persistently.

## 現在の確認用URL（再申請には使用しない）

以下は実装確認用の共有Renderドメインであり、5つすべてを所有・確認済みの独自ドメインへ置換するまで再申請しない。

- 公式店舗サイト: `https://troy-xetw.onrender.com/shop/`
- 店舗・運営情報: `https://troy-xetw.onrender.com/shop/about.html`
- 営業時間同期の説明: `https://troy-xetw.onrender.com/shop/business-profile-sync.html`
- プライバシーポリシー: `https://troy-xetw.onrender.com/shop/privacy.html`
- 利用規約: `https://troy-xetw.onrender.com/shop/terms.html`

独自ドメイン移行時は、全ページのcanonical、OG URL・画像、JSON-LDの `@id`・`url`・`logo`・`menu`、sitemapの全 `loc`、robotsのSitemap、GBPのウェブサイト・メニューURL、OAuthのホームページ・プライバシー・利用規約・承認済みドメイン、Search Console所有権を同一ドメインへ更新してから上記URL欄を差し替える。

## 公式資料

- [API利用前提と再申請](https://developers.google.com/my-business/content/prereqs)
- [Business Profile API overview](https://developers.google.com/my-business/content/overview)
- [APIポリシー](https://developers.google.com/my-business/content/policies)
- [FAQ](https://developers.google.com/my-business/content/faq)
- [OAuthホームページ要件](https://support.google.com/cloud/answer/13807376)

再申請の公式な待機日数は公表されていない。上記の未完了項目を完了し、GBP・サイト・OAuth設定へ反映されたことを確認してから申請する。
