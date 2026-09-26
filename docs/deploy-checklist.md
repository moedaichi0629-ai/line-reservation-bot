# Vercel 本番デプロイ前チェックリスト

本番環境へのデプロイ前に、以下の項目を確認してください。チェック完了後、デプロイを実行してください。

## ローカル検証

- [ ] `npm run type-check` が成功している
- [ ] `npm run lint` が成功している（エラー・警告なし）
- [ ] `npm run test` が成功している（593テストが緑）
- [ ] `npm run build` が成功している（本番ビルドエラーなし）
- [ ] `git status` で全ての変更がコミットされている
- [ ] `.env*` ファイル（秘密情報）が `.gitignore` 対象で、Git に含まれていない

## Supabase（本番プロジェクト）

### データベース移行

- [ ] SQL Editor で以下を **この順番に** 実行済み：
  1. `supabase/migrations/0001_init.sql` (faq, menus, conversations テーブル)
  2. `supabase/migrations/0002_conversation_ai_fields.sql` (confidence, matched_faq_ids, escalated 列)
  3. `supabase/migrations/0003_announcements.sql` (announcements テーブル)
- [ ] 各テーブル（faq, menus, conversations, announcements）で RLS が **有効** になっている
- [ ] これらのテーブルに **ポリシーがない**（デフォルト全拒否状態）を確認
- [ ] 自動バックアップが設定されている（Project Settings > Backups）

### テストデータのクリーンアップ

本番 Supabase で開発・テストを行った場合、以下を削除してください：

**テスト FAQ の検出**
```sql
select id, question, created_at from public.faq where question like '%テスト%' or question like '%test%';
```

**テスト会話ログの削除**（開発用LINEアカウントが送信したメッセージの削除は不可）

**テスト用下書きの削除**（draft状態のお知らせのみ）
```sql
delete from public.announcements where status = 'draft' and created_at < now() - interval '7 days';
```

実際に削除する場合は、SQL Editorで以下を実行：
```sql
delete from public.faq where id = '<id>';
delete from public.announcements where id = '<id>' and status = 'draft';
```

- [ ] テスト FAQ が削除されている（または なし）
- [ ] テスト下書きが削除されている（または なし）

## Vercel（本番環境）

### 環境変数の設定

Vercel > Project > Settings > Environment Variables で、**Production** および **Preview** 環境に以下を設定（Preview を使用する場合）：

8つすべての環境変数が設定されていることを確認してください。**絶対に NEXT_PUBLIC_ 付きで設定しないこと。**

| 変数名 | 説明 | 値の例 |
|--------|------|--------|
| `LINE_CHANNEL_SECRET` | LINE Messaging API チャネルシークレット | `abc123...` |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API チャネルアクセストークン（長期） | `Channel-access-token-...` |
| `SUPABASE_URL` | Supabase プロジェクトURL | `https://project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role secret key（秘密） | `eyJ...` |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key（秘密） | `sk-ant-...` |
| `OWNER_LINE_USER_ID` | オーナーのLINEユーザーID（エスカレーション通知先） | `U...` |
| `ADMIN_PASSWORD` | 管理画面ログインパスワード（秘密、12字以上、16字以上のランダム推奨） | `RandomPass1234567890` |
| `ADMIN_SESSION_SECRET` | セッションCookie署名用秘密（秘密、32字以上のランダム） | `random-base64-32-chars...` |

#### セッション秘密キー生成
```bash
# macOS/Linux
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Maximum 256) }))
```

- [ ] 全8つの環境変数が設定されている
- [ ] 秘密キー（SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, ADMIN_PASSWORD, ADMIN_SESSION_SECRET）が本番用にランダムに生成されている
- [ ] いずれの変数にも `NEXT_PUBLIC_` 接頭辞がない

### アプリケーション設定

- [ ] Node.js バージョンが 22 以上に設定されている（Settings > Node.js Version）
- [ ] ビルドコマンドが `npm run build` に設定されている（デフォルト）
- [ ] スタートコマンドが `npm start` に設定されている（デフォルト）

### WAF（Web Application Firewall）ルール

ログイン試行の無限ループを防ぐため、WAFでレート制限を設定してください：

- [ ] Vercel WAF（Firewall）のレート制限ルールで `POST /admin/login` への試行回数を制限
  - 推奨: 1分あたり 5-10リクエスト
  - クライアント識別: IP アドレス

設定方法（Vercel Pro以上）：
1. Project > Settings > Security > Web Application Firewall
2. Create Rule: POST /admin/login → Rate Limit (5/min per IP)

### Deployment Protection

- [ ] Production 環境でのデプロイメント保護を検討（必要に応じて）
  - **重要**: Webhook の `/api/line/webhook` には保護をかけないこと（LINE側からアクセス必須）
  - 通常は保護なし（またはホワイトリストで `/admin` のみ保護）を推奨

- [ ] Webhook URL 公開アクセスが確保されている

## LINE Developers Console（本番チャネル）

### Webhook URL 更新

- [ ] Messaging API設定 > Webhook URL に本番ドメインを設定
  ```
  https://<production-domain>/api/line/webhook
  ```
  例: `https://my-line-bot.vercel.app/api/line/webhook`

- [ ] 「Webhook の利用」が **ON** に設定されている
- [ ] 「応答メッセージ」が **OFF** に設定されている（自動応答との二重返信を防ぐ）
- [ ] Webhook URL の検証ボタン（緑のチェック）が表示されている

## LINE Official Account Manager（本番アカウント）

- [ ] プラン確認: 本アカウントが「コミュニケーションプラン」であることを確認
- [ ] 月間配信可能件数（メッセージ量）を確認
  - 顧客スパムやテスト時の無限ループで配信上限を超えないよう注意
  - Analytics > メッセージ配信数で月間使用状況を監視
- [ ] Webhook URL が正しく機能していることを確認（Dashboard > Webhook の配信ログ）

## デプロイ後のスモークテスト

Vercel へのデプロイ完了後、以下を実行してください（**まだ本配信しない**）：

### 1. 管理画面アクセス確認

- [ ] ブラウザで `https://<production-domain>/admin/login` を開く
- [ ] スマートフォンで同じ URL にアクセスし、スマホ表示が正常か確認
- [ ] 誤ったパスワードで拒否されることを確認
- [ ] 正しいパスワードでログインできることを確認
- [ ] 各画面（FAQ/メニュー/会話ログ/お知らせ）が表示できることを確認

### 2. LINE チャット動作確認

テスト LINE アカウント（別のスマホ）から本Bot にメッセージを送信：

- [ ] テキストメッセージを送信 → FAQ 回答が返信される（または確信度不足で確認待ち）
- [ ] 画像を送信 → 「テキストメッセージのみ対応しています。」が返信される
- [ ] 会話ログ（`/admin/conversations`）に記録されているか確認

### 3. お知らせ配信テスト（本配信前）

- [ ] 管理画面で下書きを1件作成（テキスト200字程度）
- [ ] 「自分にテスト送信」でオーナーのLINEに配信テスト
- [ ] オーナーのLINEにメッセージが届くことを確認
- [ ] 管理画面のお知らせステータスが「下書き」のままであることを確認
- [ ] 下書きを削除（不要な場合）

### 4. LINE Official Account Manager でのログ確認

- [ ] Dashboard > Webhook の配信ログを確認
- [ ] エラー（赤）がないことを確認
- [ ] 2023 series のエラー（タイムアウト等）がないこと

- [ ] スモークテスト完了。本番運用開始の許可が得られた

## ロールバック計画

本番環境で問題が発生した場合の対応：

### アプリケーション ロールバック

1. Vercel Dashboard > Deployments で前のバージョンを確認
2. デプロイ一覧から前回のビルド成功版を選択
3. 3つのドット（...）> Redeploy を選択
4. デプロイ完了を待つ（通常1-2分）

### データベース ロールバック（0003_announcements 移行のみ）

0003_announcements.sql のロールバックが必要な場合のみ：

Supabase SQL Editor で以下を実行：
```sql
drop table if exists public.announcements;
```

**注意**:
- faq, menus, conversations テーブルには影響なし
- 配信履歴は削除される
- 0001, 0002 はロールバック不可（重要なスキーマ）

## 本番運用での注意

- [ ] LINE Official Account Manager で月間配信数を定期的に監視
- [ ] 管理画面へのログイン試行は Vercel ログで監視（WAFレート制限エラーをチェック）
- [ ] 管理画面 > 会話ログで異常な質問スパムがないか定期確認
- [ ] セッション秘密キー（ADMIN_SESSION_SECRET）の定期ローテーション計画を立案（全員が再ログインになるため、事前アナウンス推奨）
