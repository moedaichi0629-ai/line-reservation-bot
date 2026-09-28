# セットアップ手順書（開発者向け）

このプロジェクトを引き継ぐ開発者が、手元での起動から本番公開までを行うための手順です。
対象は「Web 開発の経験が少しある人」です。

- 仕組みの詳細は [technical-spec.md](technical-spec.md)
- 本番公開の前後に確認する項目は [deploy-checklist.md](deploy-checklist.md)
- オーナー様向けの使い方は [operations.md](operations.md)

> **このリポジトリは公開（Public）です。** API キー・トークン・パスワード・LINE ユーザーID などの実際の値を、
> コード・ドキュメント・Issue・コミットメッセージに絶対に書かないでください。

---

## 1. 必要なもの

| 種類 | 内容 |
|---|---|
| Git | リポジトリの取得 |
| Node.js | **22 以上**（`package.json` の `engines`） |
| npm | Node.js に同梱 |
| GitHub アカウント | リポジトリへのアクセス |
| Vercel アカウント | 本番公開 |
| Supabase アカウント | データベース |
| LINE Developers アカウント | LINE 公式アカウント（Messaging API チャネル） |
| Anthropic アカウント | Claude API キー |

ローカルで LINE からのメッセージを受けて試す場合は、HTTPS の公開 URL を作るツール（ngrok など）も必要です。

---

## 2. GitHub から取得

```bash
git clone https://github.com/moedaichi0629-ai/line-reservation-bot.git
cd line-reservation-bot
npm install
```

---

## 3. 環境変数

`.env.example` をコピーして `.env.local` を作り、値を入れます。

```bash
cp .env.example .env.local
```

`.env.local` は `.gitignore`（`.env*`）の対象で、Git には含まれません。**Git に入れてよいのは値が空の `.env.example` だけです。**

| 変数名 | 用途 | 取得元 |
|---|---|---|
| `LINE_CHANNEL_SECRET` | Webhook の署名検証 | LINE Developers > チャネル基本設定 > チャネルシークレット |
| `LINE_CHANNEL_ACCESS_TOKEN` | 返信・Push・一斉配信 | LINE Developers > Messaging API設定 > チャネルアクセストークン（長期） |
| `SUPABASE_URL` | データベースの URL | Supabase > Project Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | データベースへのアクセス（最重要機密） | Supabase > Project Settings > API > service_role |
| `ANTHROPIC_API_KEY` | FAQ 自動回答（Claude） | Anthropic Console > API Keys |
| `OWNER_LINE_USER_ID` | スタッフ確認の通知先・お知らせのテスト送信先 | LINE Developers > チャネル基本設定 >「あなたのユーザーID」など（オーナー本人の ID） |
| `ADMIN_PASSWORD` | 管理画面のパスワード | 自分で生成（**12文字以上**。16文字以上のランダム値を推奨） |
| `ADMIN_SESSION_SECRET` | ログイン Cookie の署名用 | 自分で生成（**32文字以上**のランダム値） |

ランダムな値の作り方（Windows PowerShell）:

```powershell
# ADMIN_PASSWORD 用（32文字）
$b = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)

# ADMIN_SESSION_SECRET 用（44文字）
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

macOS / Linux: `openssl rand -base64 24`（パスワード用）、`openssl rand -base64 32`（セッション用）。
`Get-Random` は暗号用の乱数ではないため使わないでください。

注意:

- どの変数名にも `NEXT_PUBLIC_` を付けないでください（付けるとブラウザに公開されます）。このアプリは `NEXT_PUBLIC_` の変数を1つも使いません。
- `ADMIN_PASSWORD` が12文字未満、`ADMIN_SESSION_SECRET` が32文字未満だと、管理画面に誰もログインできません（安全側に倒す設計）。
- 開発用と本番用で、`ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET` は別の値にしてください。

---

## 4. Supabase

1. Supabase でプロジェクトを作成します（既存プロジェクトを引き継ぐ場合は不要）。
2. SQL Editor で、次のファイルの中身を**この順番で**1つずつ実行します。
   1. `supabase/migrations/0001_init.sql` … `faq` / `menus` / `conversations` テーブル
   2. `supabase/migrations/0002_conversation_ai_fields.sql` … `conversations` に AI 回答の列（`confidence` / `matched_faq_ids` / `escalated`）を追加
   3. `supabase/migrations/0003_announcements.sql` … `announcements` テーブル（お知らせ配信）
3. RLS を確認します（読み取りのみの SQL）。

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

**なぜポリシーが0件なのか:** RLS を有効にしてポリシーを作らないと、anon / authenticated ロールからは一切読み書きできません（デフォルト全拒否）。
アプリはサーバー側だけで `SUPABASE_SERVICE_ROLE_KEY` を使って RLS をバイパスしてアクセスします。ブラウザから Supabase に直接アクセスする経路はありません。
**ポリシーを追加しないでください。**

---

## 5. LINE

1. LINE Developers で **Messaging API** チャネルを作成します（LINE 公式アカウントと紐づきます）。
2. 「Messaging API設定」で次を設定します。
   - **Webhook URL**: `https://<公開URL>/api/line/webhook`
   - **Webhookの利用**: ON
   - 「検証」ボタンで成功と表示されること
3. LINE Official Account Manager の応答設定で:
   - **応答メッセージ**: OFF（ON だと Bot と二重に返信されます）
   - **Webhook**: ON

Webhook URL は1つしか登録できません。本番 URL を登録している間は、ローカル（ngrok など）にはメッセージが届きません。

---

## 6. Anthropic

Anthropic Console で API キーを作成し、`ANTHROPIC_API_KEY` に設定します。
必要に応じて、Console で利用上限額を設定してください。

---

## 7. ローカル起動

```bash
npm run dev
```

- 管理画面: http://localhost:3000/admin （`.env.local` の `ADMIN_PASSWORD` でログイン）
- トップページ（`/`）はポートフォリオ用の紹介ページです（ログイン不要。秘密情報は表示しません）。

LINE から実際にメッセージを受けて試す場合（任意）:

```bash
# 別のターミナルで
ngrok http 3000
```

表示された `https://…` の URL に `/api/line/webhook` を付けて、LINE Developers の Webhook URL に一時的に登録します。
**本番で運用中のチャネルで行うと、その間お客様のメッセージがローカルに届きます。** 本番チャネルでは行わないでください。

---

## 8. テスト・チェック

```bash
npm run type-check   # TypeScript の型チェック
npm run lint         # ESLint
npm run test         # Vitest（ユニット・結合テスト）
npm run build        # 本番ビルド
```

- `LayoutProps` などの型は Next.js が `.next/types` に自動生成します。clone 直後など `.next` が無い状態では `npm run type-check` が `Cannot find name 'LayoutProps'` で失敗するため、先に `npx next typegen`（または `npm run dev` / `npm run build`）を実行してください。
- テストでは LINE・Supabase・Claude はすべてモックです。**実際の送信や DB への書き込みは行われません。**
- OneDrive 配下で作業していて `npm run build` が `EPERM` で失敗する場合は、`.next` フォルダを削除してから再実行してください。

---

## 9. Vercel（本番公開）

1. Vercel でプロジェクトを作成し、GitHub リポジトリと連携します。
   - 連携すると **`main` への push がそのまま本番デプロイ**になります。
2. Framework Preset: Next.js。Node.js: 22 以上。
3. **Settings > Environment Variables** に、3章の8つの変数を登録します。
   - **対象の環境は Production のみ**にしてください。
   - Preview に登録すると、プレビュー URL の管理画面から、本番と同じ LINE チャネル・同じデータベースで**友だち全員への一斉配信ができてしまいます**。
   - 本番用の `ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET` は開発用と別の値にします。
4. 環境変数を登録・変更した後は再デプロイします（既存のデプロイには反映されません）。
5. デプロイが成功したら、5章の Webhook URL を本番 URL に切り替えます。

ログイン試行回数の制限（Vercel Firewall）や Deployment Protection の設定は [deploy-checklist.md](deploy-checklist.md) の4章を参照してください。

---

## 10. 本番での確認

**本番確認では、友だち全員への配信（Broadcast）は行わないでください。** 友だちの人数分、LINE の送信枠を消費します。

- [ ] `https://<本番URL>/admin` を開くとログイン画面に移動し、正しいパスワードでログインできる
- [ ] オーナー以外のテスト用 LINE アカウントから FAQ にある内容を送ると、FAQ にもとづく回答が返る
- [ ] 管理画面の会話ログに、そのやり取りが記録されている
- [ ] お知らせ配信画面が表示される（下書き保存まで。テスト送信は送信枠を1通使うため必要な場合のみ）
- [ ] Vercel の Logs にエラーが出ていない

詳しい確認項目は [deploy-checklist.md](deploy-checklist.md) の6章にあります。
