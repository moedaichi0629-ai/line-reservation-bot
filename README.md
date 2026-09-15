This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Phase 1: 基盤構築のセットアップ

このプロジェクトはLINE Bot（美容室向けEcho Bot）の基盤が実装されています。ローカル開発環境を構築するには、以下の手順を実施してください。

### 環境変数の設定

1. `.env.example` をコピーして `.env.local` を作成してください。
   ```bash
   cp .env.example .env.local
   ```

2. `.env.local` に以下の環境変数を設定してください。

   - **LINE_CHANNEL_SECRET**  
     [LINE Developers Console](https://developers.line.biz/console/) > チャネル > Messaging API設定 > チャネルシークレット

   - **LINE_CHANNEL_ACCESS_TOKEN**  
     LINE Developers Console > チャネル > Messaging API設定 > チャネルアクセストークン（長期）

   - **SUPABASE_URL**  
     [Supabase Dashboard](https://supabase.com/dashboard) > Project Settings > API > Project URL

   - **SUPABASE_SERVICE_ROLE_KEY**  
     Supabase Dashboard > Project Settings > API > service_role secret key  
     ⚠️ **最重要機密 — 絶対に公開コードやGitに含めないでください**

### Supabaseのセットアップ

1. [Supabase](https://supabase.com) でプロジェクトを新規作成してください。

2. Supabase Dashboard > SQL Editor を開き、`supabase/migrations/0001_init.sql` の全内容をコピーして貼り付け、実行してください。

   これにより、以下の3テーブルが作成されます：
   - **faq**: よくある質問（Phase1では器として先に作成）
   - **menus**: 施術メニュー（Phase1では器として先に作成）
   - **conversations**: LINEとのやり取りのログ（Echo Botが読み書きする）

### LINE Developers Consoleでの設定

1. [LINE Developers Console](https://developers.line.biz/console/) でMessaging APIチャネルを作成してください。

2. チャネル > Messaging API設定 で以下の設定を行ってください：
   - **Webhook の利用**: ON
   - **応答メッセージ**: OFF（Echo Botとの二重応答を防ぐため）

### ローカル開発環境での開発（Webhookテスト）

LINE WebhookはHTTPSの公開URLが必要なため、ローカル開発ではngrok等のトンネルツールを使用します：

1. **ローカルサーバー起動**
   ```bash
   npm run dev
   ```
   ブラウザで [http://localhost:3000](http://localhost:3000) が起動します。

2. **ngrok で公開URLを取得**
   ```bash
   ngrok http 3000
   ```
   ターミナルに表示される `https://xxxx.ngrok.io` のようなURLをコピーします。

3. **LINE Developers Console にWebhook URLを設定**
   - チャネル > Messaging API設定 > Webhook URL
   - `https://xxxx.ngrok.io/api/line/webhook` を設定してください。

### 動作確認

1. LINE公式アカウント（チャネルのQRコード）を友だち追加します。

2. テキストメッセージを送信すると、同じ文言がオウム返しされます（Echo Bot動作確認）。

3. 画像やスタンプなど非テキストメッセージを送信すると「テキストメッセージのみ対応しています。」という固定文言が返信されます。

### 利用可能なnpmスクリプト

- `npm run dev` — 開発サーバー起動（Turbopack使用）
- `npm run build` — 本番ビルド
- `npm run start` — 本番ビルドの起動
- `npm run lint` — ESLint実行
- `npm run type-check` — TypeScript型チェック
- `npm run test` — ユニットテスト実行（vitest）

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
