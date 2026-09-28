# Vercel 本番デプロイ前チェックリスト

本番公開の前後に確認する項目です。上から順に進めてください。
記載内容は現在の実装（コード）を基準にしています。**「要確認」と書かれた項目は、実装からは判断できないため各サービスの画面で確認してください。**

> このリポジトリは公開（Public）です。APIキー・トークン・パスワード等の実際の値は、このファイル・Issue・コミットメッセージ等に絶対に書かないでください。値は Vercel の環境変数とパスワードマネージャーだけで管理します。

---

## 1. ローカルでの確認

- [ ] `npm run type-check` が成功する
- [ ] `npm run lint` が成功する
- [ ] `npm run test` が成功する（LINE・Supabase・Claude はすべてモック。実際の送信は行われない）
- [ ] `npm run build` が成功する
- [ ] `git status` に未コミットの変更がない
- [ ] `.env.local` が Git 管理外である（`.gitignore` の `.env*` 対象。Git に含まれるのは値が空の `.env.example` のみ）

---

## 2. 本番用シークレットの作成

`ADMIN_PASSWORD` と `ADMIN_SESSION_SECRET` は、開発用（`.env.local`）とは別の値を本番用に新しく作成します。
**`Get-Random` は暗号用の乱数ではないため、秘密情報の生成には使わないでください。** Windows PowerShell では次のコマンドを使います。

```powershell
# ADMIN_PASSWORD 用（32文字）
$b = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)

# ADMIN_SESSION_SECRET 用（44文字）
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

macOS / Linux の場合は `openssl rand -base64 24`（パスワード用）/ `openssl rand -base64 32`（セッション用）。

- [ ] `ADMIN_PASSWORD` を作成した
  - 実装上の条件: **12文字以上**（未満だとログイン自体ができない）。ログイン画面で受け付ける最大長は200文字
  - 推奨: 16文字以上のランダムな文字列（上のコマンドで作成）
- [ ] `ADMIN_SESSION_SECRET` を作成した
  - 実装上の条件: **32文字以上**（未満だと誰もログイン状態にならない）
  - この値を変更すると、全員のログイン状態が無効になる（全員の強制ログアウトに使える）
- [ ] 2つの値をパスワードマネージャー等に保存した（チャット・メール・コードに貼らない）

---

## 3. Supabase（本番で使うプロジェクト）

本番は、開発・手動テストで使ってきた Supabase プロジェクト（リージョン: Tokyo）をそのまま使う想定です。

### 3-1. マイグレーション

- [ ] SQL Editor で次の3つが **この順番で** 適用済みである
  1. `supabase/migrations/0001_init.sql`（faq / menus / conversations）
  2. `supabase/migrations/0002_conversation_ai_fields.sql`（conversations の confidence / matched_faq_ids / escalated 列）
  3. `supabase/migrations/0003_announcements.sql`（announcements）
- [ ] 4テーブルすべてで RLS が有効、ポリシーが0件である（次のSQLは読み取りのみ）

```sql
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('faq', 'menus', 'conversations', 'announcements');
```

期待する結果: 4行とも `rls_enabled = true`、`policies = 0`。
（アプリはサーバー側で `SUPABASE_SERVICE_ROLE_KEY` を使ってアクセスする。anon キーはアプリで使っていない）

### 3-2. プランの確認（要確認）

- [ ] **要確認**: 無料（Free）プランの場合、利用が無い期間が続くとプロジェクトが一時停止される条件があるか。一時停止中は Bot の返信・管理画面の両方が動かない
- [ ] **要確認**: 無料プランで利用できるバックアップの内容。必要なら運用開始前に手動でデータを控える
- [ ] **要確認**: 現在の使用量（データベース容量など）が上限に対して余裕があるか

### 3-3. テストデータの整理

開発・手動テストで作ったデータが残っています。**まず SELECT で一覧を確認し、消すものは ID を指定して1件ずつ削除してください。** 条件だけで一括削除するSQLは使わないでください。

```sql
-- お知らせ（下書き・配信履歴）の一覧
select id, status, created_at, sent_at, left(body, 40) as body_head
from public.announcements
order by created_at desc;

-- FAQ の一覧（公開状態も確認）
select id, is_published, display_order, left(question, 40) as question_head, created_at
from public.faq
order by display_order;

-- メニューの一覧
select id, is_published, name, price_yen, created_at
from public.menus
order by display_order;
```

```sql
-- 削除する場合（1件ずつ。お知らせは下書きのみ）
delete from public.announcements where id = '<id>' and status = 'draft';
delete from public.faq where id = '<id>';
delete from public.menus where id = '<id>';
```

- [ ] テスト用のお知らせ下書きを削除した（または残すものだけになっている）
  - 管理画面にはお知らせを削除する機能はない。削除は SQL Editor で行う
  - テスト用の下書きを誤って「友だち全員へ配信」しないよう、公開前に整理する
- [ ] テスト用の FAQ・メニューを削除または非公開にした
  - FAQ を削除すると、過去の会話ログに残る「根拠FAQ」の参照が無効になる（履歴表示のみに影響）
  - **公開中の FAQ が0件になると、Bot は Claude を呼ばずにすべての質問を「スタッフ確認」にし、1通ごとにオーナーへ Push 通知する（LINE の送信枠を消費する）**。本番公開時点で、実際の FAQ を1件以上公開しておく
- [ ] 会話ログ（conversations）の扱いを決めた
  - 手動テストで送ったメッセージも記録されている。管理画面から削除する機能はない
  - お客様の LINE ユーザーID（個人情報）を含むため、外部へ出力・共有しない

---

## 4. Vercel（既存の line-reservation-bot プロジェクト）

### 4-1. Git 連携の確認（push の前に必ず確認）

- [ ] **要確認**: Vercel の line-reservation-bot プロジェクトが GitHub リポジトリと連携しているか（Project > Settings > Git）
  - 連携している場合、**`main` への `git push` がそのまま本番デプロイになる**。環境変数の登録（4-2）を push より先に済ませる
  - 連携していない場合は、push しても GitHub に反映されるだけで、デプロイは Vercel 側で別途行う
- [ ] **要確認**: 連携している場合、`main` 以外のブランチへの push でプレビューデプロイが作られるか

### 4-2. 環境変数（Project > Settings > Environment Variables）

次の8つを登録します。**対象の環境は Production のみ**にしてください。

> Preview に同じ値を登録すると、プレビュー用URLの管理画面から、本番と同じ LINE チャネル・同じデータベースを使って **友だち全員への一斉配信ができてしまいます**。Preview・Development には秘密情報を登録しないでください。

| 変数名 | 内容 | 取得元 |
|--------|------|--------|
| `LINE_CHANNEL_SECRET` | Webhook の署名検証に使う | LINE Developers > チャネル基本設定 > チャネルシークレット |
| `LINE_CHANNEL_ACCESS_TOKEN` | 返信・Push・一斉配信に使う | LINE Developers > Messaging API設定 > チャネルアクセストークン（長期） |
| `SUPABASE_URL` | データベースのURL | Supabase > Project Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | データベースへのアクセス（最重要機密） | Supabase > Project Settings > API > service_role |
| `ANTHROPIC_API_KEY` | FAQ 自動回答（Claude）に使う | Anthropic Console > API Keys |
| `OWNER_LINE_USER_ID` | スタッフ確認の通知先・テスト送信の宛先 | 開発時に使っている値（オーナーへのテスト送信で動作確認済みの値） |
| `ADMIN_PASSWORD` | 管理画面のパスワード | 手順2で作成した本番用の値 |
| `ADMIN_SESSION_SECRET` | ログイン状態の署名用 | 手順2で作成した本番用の値 |

- [ ] 8つすべてを Production に登録した
- [ ] どの変数名にも `NEXT_PUBLIC_` を付けていない（付けるとブラウザに公開される。アプリでは一切使っていない）
- [ ] Preview / Development に秘密情報を登録していない
- [ ] 環境変数を追加・変更した後は再デプロイが必要（既存のデプロイには反映されない）

### 4-3. プロジェクト設定

- [ ] Framework Preset が Next.js になっている
- [ ] Node.js のバージョンが 22 以上（`package.json` の `engines` が `>=22`）
- [ ] 任意: 関数の実行リージョンを Supabase（Tokyo）に近いリージョンにする（Project > Settings > Functions）。Webhook は1通ごとに Supabase へ複数回アクセスするため、応答が速くなる。**要確認**: Hobby プランで変更できるか
- [ ] 参考: 管理画面の処理（お知らせ配信を含む）は最大60秒で打ち切られる設定がコードに入っている（`maxDuration = 60`）。Vercel 側での設定は不要

### 4-4. ログイン試行回数の制限（Vercel Firewall）

コード側のログイン保護は「失敗時に0.8秒待たせる」だけで、試行回数の上限はありません。Vercel Firewall のカスタムルールでレート制限をかけます。

- [ ] **要確認**: 使用中のプラン（Hobby と思われる）で、Firewall のカスタムルールの `rate_limit`（レート制限）が使えるか
- [ ] 使える場合、次の条件でルールを作成する
  - 条件: パス が `/admin/login` と等しい **かつ** メソッド が `POST`
  - 動作: レート制限（IPアドレスごと）。まず「ログ（log）」で作成して誤検知が無いことを確認してから、制限を有効にする
  - 設定例: 60秒あたり10回まで（ログイン画面の Server Action は `/admin/login` への POST として届く）
- [ ] 使えない場合は、`ADMIN_PASSWORD` を上記コマンドで作った長いランダム値にすることで対策とし、その旨を記録しておく

### 4-5. Deployment Protection

- [ ] **要確認**: Project > Settings > Deployment Protection の現在の設定
- [ ] 本番ドメインの `/api/line/webhook` に LINE から認証なしでアクセスできる状態である（保護をかけると LINE からの Webhook が届かない）
- [ ] 管理画面はアプリ自身のパスワード認証で保護されている（Vercel の保護はパス単位では設定できないため、本番ドメインには保護をかけない想定）

---

## 5. LINE の設定（現在のチャネルを本番でも使用）

### 5-1. 送信枠の確認

- [ ] LINE Official Account Manager で、今月の送信数と残り送信可能数を記録した（無料プラン）
- [ ] 送信枠を消費するものを理解した
  - **友だち全員への配信（Broadcast）: 友だちの人数分を消費する**
  - 管理画面の「自分にテスト送信」: 1通
  - スタッフ確認の通知（オーナーへの Push）: 1回につき1通
  - お客様への返信（Reply）: 消費しない
- [ ] 本番公開時の動作確認では、**友だち全員への配信（Broadcast）は行わない**

### 5-2. Webhook の仕様（コードの動作）

- エンドポイント: `POST https://<本番ドメイン>/api/line/webhook`
- `LINE_CHANNEL_SECRET` が未設定 → 500
- 署名（`x-line-signature`）が無い・一致しない → 401（処理しない）
- 署名は正しいが本文が JSON でない → 400
- 署名が正しい → 200（LINE Developers の「検証」ボタンのリクエストも 200 を返す）
  - 署名確認後の処理でエラーが起きても、LINE の再送による二重処理を避けるため 200 を返す
- 同じメッセージの再送（同じメッセージID）は1回だけ処理する
- メッセージ以外のイベント（友だち追加など）には応答しない

### 5-3. 返信の仕様（コードの動作）

- テキスト以外（画像・スタンプ等） → 「テキストメッセージのみ対応しています。」と返信
- テキスト → 公開中の FAQ をもとに Claude（モデル `claude-sonnet-5`、最大出力1024トークン、**8秒でタイムアウト、再試行なし**）が回答
  - FAQ で回答できる → 回答を返信
  - スタッフ確認が必要（確信度が低い、根拠のFAQが無い、公開中のFAQが0件）→ 「お問い合わせありがとうございます。こちらの内容についてはスタッフによる確認が必要です。…」と返信し、オーナーへ Push 通知（送信枠を1通消費）
  - Claude の障害・タイムアウト・FAQ取得失敗など → 「申し訳ございません。現在、自動応答をご利用いただけません。…」と返信（オーナーへの通知はしない）

### 5-4. Webhook URL の切り替え（本番デプロイと管理画面の確認が終わってから）

- [ ] LINE Developers > Messaging API設定 > Webhook URL を `https://<本番ドメイン>/api/line/webhook` に変更した
  - 切り替え後は、開発用（ngrok 等）の環境には LINE からのメッセージが届かなくなる
- [ ] 「Webhookの利用」が ON
- [ ] 「検証」ボタンで成功と表示される
- [ ] LINE Official Account Manager の応答設定で、**応答メッセージが OFF**、Webhook が ON（応答メッセージが ON だと Bot と二重に返信される）
- [ ] 任意: 「Webhookの再送」を ON にする場合も、同じメッセージの二重処理はコード側で防いでいる

---

## 6. 本番デプロイ後の動作確認

**この確認では友だち全員への配信（Broadcast）は行いません。**

### 6-1. 管理画面（Webhook の切り替え前に実施）

- [ ] スマートフォンで `https://<本番ドメイン>/admin` を開くと、ログイン画面へ移動する
- [ ] 誤ったパスワード → 「パスワードが正しくありません。もう一度入力してください。」と表示され、ログインできない
- [ ] 「ログインできません。しばらくしてからもう一度お試しください。…」と表示される場合は、`ADMIN_PASSWORD`（12文字以上）/ `ADMIN_SESSION_SECRET`（32文字以上）の設定を見直す
- [ ] 正しいパスワードでログインでき、FAQ管理・メニュー・料金・会話ログ・お知らせ配信の4画面が開く
- [ ] お知らせ配信画面に「配信できる通数には上限があります」の注意が表示される
- [ ] ログアウトできる

### 6-2. LINE（Webhook の切り替え後に実施）

オーナー以外のテスト用 LINE アカウントから、本番の公式アカウントへ送信します。

- [ ] FAQ にある内容をテキストで送信 → FAQ にもとづく回答が返信される
- [ ] 画像またはスタンプを送信 → 「テキストメッセージのみ対応しています。」が返信される
- [ ] 管理画面の会話ログに、上のやり取りが記録されている
- [ ] （任意・送信枠を1通消費）FAQ に無い内容を送信 → スタッフ確認の文言が返信され、オーナーの LINE に通知が届く
- [ ] Vercel の Logs（Functions）にエラーが出ていない

### 6-3. お知らせ配信（任意）

- [ ] 「自分にテスト送信」を行う場合は送信枠を1通消費する。必要な場合のみ実施する
  - テスト送信後も、お知らせの状態は「下書き」のまま（状態や再送用キーは変わらない）
- [ ] **友だち全員への配信は、送信枠（友だちの人数分）を確認したうえで、オーナーが実施を判断したときだけ行う**

---

## 7. 公開後の確認・運用

- [ ] LINE Official Account Manager で送信数を定期的に確認する（スタッフ確認の通知や一斉配信で枠が減る）
- [ ] 会話ログで、同じお客様からの大量の連投が無いか確認する
  - 現在の実装には、お客様ごとの送信回数の制限が無い。連投のたびに Claude の呼び出しが発生し、FAQ で回答できない質問ではオーナーへの Push が送信枠を消費する
  - 送信枠を使い切ると、一斉配信・スタッフ確認の通知が「送信上限」で失敗する
- [ ] Anthropic Console で利用状況を確認する。**要確認**: 利用上限額（Spend limit）を設定するか
- [ ] お知らせが「状態確認が必要」になった場合は `docs/operations.md` の手順で対応する（自動再送はしない）
- [ ] 管理画面にログインできる端末を紛失した場合などは、`ADMIN_SESSION_SECRET` を変更して再デプロイし、全員をログアウトさせる（パスワードを変更しても既存のログイン状態は無効にならない）

---

## 8. 問題が起きたときの戻し方

### アプリ

- Vercel > Deployments で、以前の正常なデプロイを選んで本番に戻す（Instant Rollback）
  - **要確認**: Hobby プランで戻せる範囲（直前のデプロイのみ等の制限があるか）
- Webhook が原因で返信が止まる場合は、LINE Developers の Webhook URL を見直す

### データベース（0003_announcements のみ）

お知らせ配信機能を取り除く必要がある場合のみ、SQL Editor で実行します。

```sql
drop table if exists public.announcements;
```

- faq / menus / conversations には影響しない
- お知らせの配信履歴はすべて削除される
- 0001・0002 のロールバック手順は用意していない
