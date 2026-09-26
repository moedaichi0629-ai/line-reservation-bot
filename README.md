# 美容室向け LINE Bot

LINE公式アカウントを通じて顧客からの質問に自動応答し、管理者がお知らせを一斉配信できるシステムです。

## 機能

### Phase 1: 基盤構築（完了）
- LINE Messaging API連携
- Webhook署名検証
- 会話ログ記録（Supabase）

### Phase 2: FAQ自動応答（完了）
- Claude APIによる質問の自動応答
- 確信度ベースの評価（high/medium/low）
- 低信頼度時のオーナーへのエスカレーション（Push通知）
- 回答の根拠となったFAQの追跡記録

### Phase 3: 管理画面（完了）
- パスワード認証でのログイン
- FAQ管理（作成・編集・削除）
- メニュー・料金管理（表示のみ、Bot非連携）
- 会話ログ閲覧（読み取り専用）
- **お知らせ一斉配信**（LINE Broadcast API）
  - ドラフト作成 → テスト送信（オーナー限定）→ 全友だち配信
  - 二重配信防止（LINE retry key対応）
  - 状態管理（下書き/配信処理中/配信済み/配信失敗）

## 技術スタック

| 項目 | 技術 |
|------|------|
| フロントエンド | Next.js 16.3.5、React 19.2.8、TypeScript、Tailwind CSS |
| バックエンド | Next.js App Router（Server Components/Server Actions） |
| データベース | Supabase（PostgreSQL） |
| 認証 | LINE OAuth（顧客）、パスワード + 署名付きCookie（管理者） |
| AI | Anthropic Claude API |
| デプロイ | Vercel |

## ディレクトリ構成

```
line-reservation-bot/
├── app/
│   ├── api/line/webhook/            # LINE Webhook endpoint
│   │   └── route.ts
│   └── admin/                        # 管理画面（/admin）
│       ├── login/                    # ログイン画面
│       └── (protected)/              # 認証必須エリア
│           ├── faq/                  # FAQ管理
│           ├── menus/                # メニュー管理
│           ├── conversations/        # 会話ログ
│           └── announcements/        # お知らせ配信
├── lib/
│   ├── line/                         # LINE API関連
│   │   ├── client.ts
│   │   ├── verify-signature.ts
│   │   ├── escalate-to-owner.ts
│   │   └── broadcast.ts
│   ├── faq/                          # FAQ関連
│   │   ├── answer-user-question.ts
│   │   └── reply-templates.ts
│   ├── claude/                       # Claude API関連
│   │   ├── generate-faq-answer.ts
│   │   ├── prompt.ts
│   │   └── faq-answer-schema.ts
│   ├── admin/                        # 管理画面ビジネスロジック
│   │   ├── auth.ts
│   │   ├── session-token.ts
│   │   ├── announcement-policy.ts
│   │   ├── send-announcement.ts
│   │   └── *-repository.ts
│   └── supabase/                     # Supabase関連
│       ├── server.ts
│       └── faq.ts
├── types/
│   └── database.ts                   # TypeScript型定義
├── supabase/migrations/              # DB移行スクリプト
│   ├── 0001_init.sql                 # Phase 1
│   ├── 0002_conversation_ai_fields.sql # Phase 2
│   └── 0003_announcements.sql        # Phase 3
├── tests/                            # vitest ユニットテスト
├── docs/                             # 運用ドキュメント
│   ├── deploy-checklist.md
│   └── operations.md
└── .env.example                      # 環境変数テンプレート
```

## ローカル開発セットアップ

### 1. 環境変数の設定

```bash
cp .env.example .env.local
```

`.env.local` に以下の値を設定してください（読み取り専用、Gitに含めないこと）：

| 変数名 | 取得元 |
|--------|--------|
| `LINE_CHANNEL_SECRET` | LINE Developers Console > チャネル > Messaging API設定 > チャネルシークレット |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers Console > チャネル > Messaging API設定 > チャネルアクセストークン（長期） |
| `SUPABASE_URL` | Supabase Dashboard > Project Settings > API > Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Project Settings > API > service_role secret key（秘密キー） |
| `ANTHROPIC_API_KEY` | Anthropic Console > API Keys（秘密キー） |
| `OWNER_LINE_USER_ID` | LINE公式アカウント作成後、LINE Developers Console「あなたのユーザーID」または会話ログで確認 |
| `ADMIN_PASSWORD` | 12文字以上（16字以上のランダム文字列を推奨） |
| `ADMIN_SESSION_SECRET` | 32文字以上のランダム文字列（例: `openssl rand -base64 32`） |

### 2. Supabaseのセットアップ

1. [Supabase Dashboard](https://supabase.com/dashboard) で新規プロジェクトを作成

2. SQL Editor で以下を**順番に** 実行：
   ```
   1. supabase/migrations/0001_init.sql     (faq, menus, conversations テーブル)
   2. supabase/migrations/0002_conversation_ai_fields.sql  (confidence, matched_faq_ids等を追加)
   3. supabase/migrations/0003_announcements.sql (announcements テーブル)
   ```

### 3. LINE Developers Consoleでの設定

1. [LINE Developers Console](https://developers.line.biz/console/) で Messaging API チャネルを作成

2. チャネル > Messaging API設定：
   - **Webhook の利用**: ON
   - **応答メッセージ**: OFF（自動応答との二重返信を防ぐ）

### 4. ローカル開発（Webhookテスト）

LINE Webhookは HTTPS公開URL が必須なため、ngrok を使用：

```bash
# ターミナル1: ローカルサーバー起動
npm run dev

# ターミナル2: ngrok でトンネリング
ngrok http 3000
```

ngrok から `https://xxxx.ngrok.io` のような URL が表示されます。

3. LINE Developers Console > Messaging API設定 > Webhook URL：
   ```
   https://xxxx.ngrok.io/api/line/webhook
   ```

4. 動作確認
   - LINE公式アカウント（チャネルのQRコード）を友だち追加
   - テキストメッセージ送信 → FAQ回答または確信度不足時はオーナーに通知

## npm コマンド

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動（Turbopack） |
| `npm run build` | 本番ビルド |
| `npm run start` | 本番ビルドの実行 |
| `npm run lint` | ESLint実行 |
| `npm run type-check` | TypeScript型チェック |
| `npm run test` | vitest ユニットテスト実行（593テスト） |

## テスト

```bash
# 全テスト実行
npm run test

# 特定ファイルのテスト
npm run test -- tests/lib/line/verify-signature.test.ts
```

テスト環境では、LINE API と Supabase はモック化されており、実際の呼び出しは行われません。

## 管理画面の概要

### ログイン (`/admin/login`)
パスワード認証。成功時、署名付きCookie（30日間有効）が発行されます。

### FAQ管理 (`/admin/faq`)
- よくある質問の作成・編集・削除
- 質問（200字）と回答（1000字）をテキスト入力
- 公開/非公開、表示順序を制御
- 変更は即座に Bot の回答に反映

### メニュー・料金 (`/admin/menus`)
- 施術メニューの作成・編集・削除
- ここで登録した内容は、現在Botの自動応答には反映されません

### 会話ログ (`/admin/conversations`)
- 顧客からの質問と Bot の応答を表示（読み取り専用）
- 顧客IDは末尾4文字のみ表示（プライバシー配慮）
- エスカレーション判定、確信度も記録

### お知らせ配信 (`/admin/announcements`)

**ワークフロー:**
1. **下書き作成**（`/admin/announcements`）
   - 本文を入力（最大1000字）
2. **テスト送信**（オプション）
   - 「自分にテスト送信」でオーナーのLINEにのみ配信
   - 本配信状態には影響なし（下書きのままで OK）
3. **本配信**
   - 「友だち全員へ配信」を選択
   - 確認ダイアログが表示
   - 配信開始（「配信処理中」状態）
   - 完了すると「配信済み」に

**状態管理:**
| 状態 | 説明 |
|------|------|
| 下書き | まだ送信されていない |
| 配信処理中 | LINE への送信処理が進行中 |
| 配信済み | LINE が受け付けた |
| 配信失敗 | 送信エラーが発生した（再送可能） |

詳細は [docs/operations.md](docs/operations.md) を参照。

## 本番デプロイ

[docs/deploy-checklist.md](docs/deploy-checklist.md) で事前チェックリストを確認してください。

### Vercel へのデプロイ

1. ローカルで `npm run build` および `npm run test` が成功することを確認
2. `.env.local` の秘密情報が Git に含まれていないことを確認（`.gitignore` で `.env*` が対象）
3. Vercel にプッシュ
4. Vercel > Project > Settings > Environment Variables で Production/Preview 環境変数を設定
5. LINE Developers Console の Webhook URL を本番ドメインに更新
6. スモークテスト実行（テスト LINE アカウントから質問送信）

## セキュリティに関する注意

### LINE Webhook
- **署名検証**: `lib/line/verify-signature.ts` で全リクエストの HmacSHA256 署名を検証
- **秘密情報**: 質問テキストなど顧客データはログに記録しない（安全なサマリのみ）

### 管理画面認証
- **パスワード**: 最低12字（16字以上のランダム文字列を推奨）
  - Vercel WAF で POST `/admin/login` にレート制限を設定すること
- **セッション**: 署名付きCookie（30日間、`/admin` パスのみ）
  - 秘密キー回転で全ユーザーが再ログインになる
  - セッション取り消し機能はなし（秘密キー回転のみ）
- **アクセス制御**: 全ページ・Server Action・データ関数で `requireAdmin()` チェック（tests/app/admin/server-actions-auth.test.ts で強制）

### データベース
- **RLS**: 全テーブルで有効化、ポリシーなし（デフォルト全拒否）
- **アクセス**: サーバー側のみ `SUPABASE_SERVICE_ROLE_KEY` でアクセス
- **クライアント**: 匿名キーは未使用（`NEXT_PUBLIC_*` は禁止）

### 環境変数
- **秘密キー**: 絶対に `NEXT_PUBLIC_` префィックスを付けない
- **Git**: `.env*` は `.gitignore` で除外
- **Vercel**: 本番環境で独立した値を使用

## 既知の制限と注意

### 限界
- **M1 - Webhook レート制限なし**
  - 同一顧客の質問スパムはClaudeコール・オーナーPush通知を消費（LINE月間配信上限あり）
  - 運用時は LINE Official Account Manager で月間配信量を確認

- **M2 - ログイン試行制限なし**
  - Vercel WAF で `POST /admin/login` にレート制限ルールを設定必須（本番環境）
  - ADMIN_PASSWORD は 16字以上のランダム文字列を推奨

- **L1 - セッション取り消し不可**
  - 既存セッションを破棄する方法は秘密キー回転のみ
  - `ADMIN_SESSION_SECRET` を変更して再デプロイすると全員が再ログイン

- **L2 - URLクエリのフラッシュメッセージ可偽造**
  - テキストのみ（XSS なし）だが、クエリ文字列は改ざん可能
  - 画面上のメッセージで個人情報やパスワードの入力を要求されても応じないこと

### 運用上の注意
- **FAQの非トランザクション操作**
  - 複数FAQ の順序変更時、部分的な失敗が起こる可能性
  - 単一オーナー想定で問題なし

- **LINE プラン確認**
  - 本アカウントは「コミュニケーションプラン」（月間配信数制限あり）
  - 大規模配信前に LINE Official Account Manager で残配信数を確認

- **テストデータの清理**
  - 本番 Supabase を開発用に使用した場合、テスト FAQ・会話ログ・下書きを削除推奨
  - [docs/operations.md](docs/operations.md) 内「テストデータに関する注意事項」を参照

## ドキュメント

- **[docs/deploy-checklist.md](docs/deploy-checklist.md)** — 本番デプロイ前チェックリスト
- **[docs/operations.md](docs/operations.md)** — 運用手順（オーナー向け日本語ガイド）

## 開発ルール

このプロジェクトの開発方針は [CLAUDE.md](CLAUDE.md) に記載されています。
主な原則：
- Plan提示 → 実装 → テスト → コードレビュー → ドキュメント作成
- 大きな機能は1つずつ実装
- TypeScript `any` 禁止
- Server Component基本、Client Component必要時のみ
- 秘密情報は環境変数管理

## ライセンス・連絡先

開発者の連絡先: （運用開始時に記入してください）
