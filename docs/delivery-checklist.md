# 納品チェックリスト

クライアント（美容室オーナー様）へ納品する前に、上から順に確認します。

- 本番 URL: https://line-reservation-bot-two.vercel.app
- 管理画面: https://line-reservation-bot-two.vercel.app/admin

> **パスワード・API キー・トークン・LINE ユーザーIDは、このファイル・GitHub・チャットに書かないでください。**
> 管理画面のパスワードは、パスワードマネージャーの共有機能など**安全な方法で別送**します。

---

## 1. システム

- [ ] Vercel の本番デプロイが成功している（Deployments が Ready）
- [ ] GitHub の `main` に最新のコードが反映されている（ローカルと `origin/main` が一致）
- [ ] LINE Developers の Webhook URL が本番 URL（`/api/line/webhook`）になっている
- [ ] 「Webhookの利用」が ON、「検証」ボタンが成功する
- [ ] LINE Official Account Manager で「応答メッセージ」が OFF、Webhook が ON
- [ ] Supabase に接続できている（管理画面で FAQ・会話ログが表示される）
- [ ] Claude に接続できている（LINE で FAQ にある質問をすると自動回答が返る）

## 2. 管理画面

- [ ] `/admin` を開くとログイン画面に移動し、正しいパスワードでログインできる
- [ ] 間違ったパスワードではログインできない
- [ ] ログアウトできる
- [ ] FAQ管理: 追加・編集・公開/非公開・並び替え・削除ができる
- [ ] メニュー・料金: 追加・編集・公開/非公開・並び替え・削除ができる
- [ ] 会話ログ: 一覧・詳細・「スタッフ確認あり」の絞り込みが表示できる。お客様は末尾4文字で表示される
- [ ] お知らせ配信: 画面が表示され、下書きを保存できる

## 3. 動作テスト

- [ ] オーナー以外の LINE アカウントから FAQ にある質問を送ると、FAQ にもとづく回答が返る
- [ ] 画像・スタンプを送ると「テキストメッセージのみ対応しています。」が返る
- [ ] （任意・送信枠を1通使う）FAQ に無い質問を送ると、スタッフ確認の定型文が返り、オーナーの LINE に通知が届く
- [ ] 上のやり取りが会話ログに記録されている
- [ ] スマートフォン（幅 約400px）で管理画面が崩れずに操作できる
- [ ] `npm run type-check` / `lint` / `test` / `build` がすべて成功する

## 4. セキュリティ

- [ ] API キー・トークン・パスワードが GitHub（コード・履歴・ドキュメント）に含まれていない
- [ ] `.env.local` が `.gitignore` の対象で、Git に含まれていない（Git にあるのは値が空の `.env.example` のみ）
- [ ] Vercel の環境変数8個が **Production のみ**に登録されている（Preview / Development には秘密情報なし）
- [ ] どの環境変数にも `NEXT_PUBLIC_` が付いていない
- [ ] Supabase の4テーブルで RLS が有効・ポリシー0件（[deploy-checklist.md](deploy-checklist.md) 3-1 の SQL）
- [ ] 管理画面のパスワードが本番用の長いランダム値（12文字以上、推奨16文字以上）で、開発用と別
- [ ] `ADMIN_SESSION_SECRET` が本番用の32文字以上のランダム値で、開発用と別
- [ ] ログイン試行回数の制限（Vercel Firewall）を設定した、または使えない場合の対応を記録した

## 5. ドキュメント

- [ ] [README.md](../README.md) — 概要・構成・工夫した点
- [ ] [setup-guide.md](setup-guide.md) — 開発者向けセットアップ手順
- [ ] [operations.md](operations.md) — オーナー様向け運用マニュアル
- [ ] [technical-spec.md](technical-spec.md) — 技術仕様（引き継ぎ用）
- [ ] [deploy-checklist.md](deploy-checklist.md) — 本番デプロイ前後のチェックリスト
- [ ] 運用マニュアルのスクリーンショット位置（`[Screenshot: …]`）に画像を差し込んだ
- [ ] 運用マニュアル 11章「サポート連絡先」を記入した

## 6. クライアントへ渡すもの

- [ ] 管理画面の URL（https://line-reservation-bot-two.vercel.app/admin）
- [ ] 管理画面のパスワード — **ドキュメントやメール本文に書かず、安全な方法で別送**
- [ ] 運用マニュアル（[operations.md](operations.md)。PDF 化するなど、スマートフォンで読める形で）
- [ ] 問い合わせ窓口（担当者・連絡方法・対応時間）
- [ ] 各サービスのアカウントの持ち主と支払い者の確認（LINE 公式アカウント・Vercel・Supabase・Anthropic）

## 7. 最終確認

- [ ] テストデータを整理した（テスト用の FAQ・メニュー・お知らせ下書き。手順は [deploy-checklist.md](deploy-checklist.md) 3-3）
- [ ] FAQ を実際の店舗の内容（営業時間・料金・アクセス・駐車場など）に差し替え、1件以上を公開した
  - 公開中の FAQ が0件だと、すべての質問がスタッフ確認になり、1通ごとにオーナーへ通知（送信枠を消費）される
- [ ] メニュー・料金を実際の内容にした（Bot には使われないことをクライアントに説明した）
- [ ] LINE Official Account Manager で、今月の配信可能数と残り数を確認し、クライアントと共有した
- [ ] **友だち全員への配信（本番 Broadcast）は、納品作業では行わない。** 実施するかどうか・いつ行うかはクライアントが判断する
- [ ] 既知の制約（[technical-spec.md](technical-spec.md) 12章）のうち、運用に関わるもの（メニュー未連携・削除機能なし・連投の制限なし・「状態確認が必要」の対応）をクライアントに説明した
