# Google Business Profile 営業時間連携（廃止済み）

## 現在の状態

TROY営業カレンダーとGoogle Business Profileの特別営業時間を同期する機能は、API利用が成立しなかったため2026年9月1日に廃止した。

- TROYアプリ内の営業カレンダーは引き続き利用する。
- Google Business Profileの営業時間はGoogleの管理画面で手動管理する。
- TROYサーバーからBusiness Profile APIの読み取り・更新は行わない。
- OAuth、同期worker、同期確認API、王画面のGoogle同意・差分確認UIは削除済み。
- Googleマップへの通常の外部リンクは本連携に含まれず、引き続き利用できる。

## 過去データ

Firestoreの既存営業予定や `integration_states/troy_google_business_profile_special_hours` に残る過去のGoogle連携フィールドは、運用データを破壊しないため自動削除しない。現行コードはこれらを読み取らず、今後の営業予定保存でも新規作成しない。

Google連携用に設定していた環境変数やOAuth認証情報は、各本番環境の設定画面で不要になったことを確認してから削除・失効する。秘密情報そのものはリポジトリへ記録しない。
