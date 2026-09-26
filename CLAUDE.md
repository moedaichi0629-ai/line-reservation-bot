# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## プロジェクト概要

- 美容室向けLINE Bot
- LINEからの問い合わせに自動応答するシステム
- 管理画面でFAQ・お知らせ一斉配信を管理
- Phase 1（基盤構築）、Phase 2（FAQ自動応答）、Phase 3（管理画面・お知らせ配信）完了

## 現在のプロジェクト状態

Phase 1-3の実装が完了（Phase 1・2はコミット済み、Phase 3は2026-09-26時点で未コミット）。本番デプロイ前に `docs/deploy-checklist.md` を確認すること。

**Phase 1**: LINE Webhook (`app/api/line/webhook/route.ts`)、署名検証 (`lib/line/verify-signature.ts`)、会話ログ記録（conversations テーブル）

**Phase 2**: Claude APIによるFAQ自動回答 (`lib/claude/`, `lib/faq/`)、確信度ベース評価 (high/medium/low)、低信頼度時はオーナーへPush通知でエスカレーション (`lib/line/escalate-to-owner.ts`)

**Phase 3**: モバイル管理画面 (`app/admin/`)
- ログイン (`/admin/login`): パスワード認証、署名付きCookie（30日）
- FAQ管理 (`/admin/faq`): 作成・編集・削除、変更は即座に反映
- メニュー・料金 (`/admin/menus`): 作成・編集・削除（Bot未連携）
- 会話ログ (`/admin/conversations`): 読み取り専用、顧客IDは末尾4字表示
- **お知らせ配信** (`/admin/announcements`): 下書き → テスト送信 → 全友だち配信、LINE Broadcast API、状態管理（draft/sending/sent/failed）、二重配信防止（retry key）

DB移行: 0001_init.sql (faq/menus/conversations), 0002_conversation_ai_fields.sql (confidence/matched_faq_ids/escalated), 0003_announcements.sql

全テーブルでRLS有効、ポリシーなし（デフォルト全拒否）。サーバー側のみ SUPABASE_SERVICE_ROLE_KEY でアクセス。

テスト: vitest で 593テスト、37ファイル。全テストで LINE API/Supabase はモック。

## 技術スタック

- Next.js（App Router）
- TypeScript
- Tailwind CSS
- Supabase
- LINE Messaging API
- Claude API
- Vercel

## コマンド

- `npm run dev` — 開発サーバー起動（Turbopack）
- `npm run build` — 本番ビルド
- `npm run start` — 本番ビルドの起動
- `npm run lint` — ESLint（`eslint.config.mjs`、`eslint-config-next`のcore-web-vitals + typescriptルールを使用）
- `npm run type-check` — TypeScript型チェック
- `npm run test` — vitest ユニットテスト実行

## アーキテクチャ

### ディレクトリ構成と不変条件

**Webhook フロー** (Phase 1-2):
- `app/api/line/webhook/route.ts`: LINE Message Event → 署名検証 → conversationsへ inbound ログ → Claude/FAQ回答 → LINE replyMessage/Push → conversations へ outbound ログ
- 二重処理防止: line_message_id の unique constraint + duplicate webhook 検知
- 処理失敗時は inbound ログをロールバック（LINEの再送を許可）

**管理画面認証** (Phase 3):
- `proxy.ts`: 楽観的チェック（Optimistic check）のみ。実際の保護は `lib/admin/auth.ts::requireAdmin()` で全ページ・Server Action・データ関数で実施
- `tests/app/admin/server-actions-auth.test.ts`: 全Server Actionで requireAdmin() が呼ばれることを強制
- `tests/app/admin/announcements/security.test.ts`: お知らせ関連のセキュリティ検証

**お知らせ配信** (Phase 3):
- Draft作成 → テスト送信（オプション、OWNER_LINE_USER_ID のみ）→ 本配信（友だち全員、LINE Broadcast API）
- 状態遷移: draft ← 下書き、sending ← 条件付きUPDATE（draft/failed → sending）、sent ← LINE受付、failed ← 送信エラー
- 二重配信防止: 原子的な条件付きUPDATE + X-Line-Retry-Key（LINE側で24h有効）
- Stale sending 検知: 10分以上 sending のままなら「状態確認が必要」警告、自動再送なし
- `lib/admin/announcement-policy.ts`: 送信可能期間（作成から23h）・状態判定・UI表示ロジック
- maxDuration リテラル（60秒）は `app/admin/(protected)/announcements/page.tsx` と `app/admin/(protected)/layout.tsx` に記載、`STALE_SENDING_THRESHOLD_MS` (10分) と同期必須（テストで検証）
- Server Actionが`redirect()`するとページの部品が作り直されるため、入力途中の本文は `announcements/draft-store.ts`（useSyncExternalStore）に保持する

**スキーマ検証**:
- `lib/admin/schemas.ts`: Zod スキーマ（Server Action用）
- `lib/admin/input-limits.ts`: Client Component でも参照可能な定数（長さ上限等）、Zod なし
- `components/admin/confirm-dialog.tsx`: 確認ダイアログが実行用フォームを所有し、処理完了（成功・失敗とも）で自分で閉じる

**不変条件**:
- Client Component は `lib/admin/schemas.ts` をimportしない（Zod は重い依存）
- 全ページ/Server Action/データ関数で `requireAdmin()` 呼び出し
- Webhook フロー（Phase 1/2）は Plan なしに変更しない

## コーディングルール

- TypeScriptの`any`は原則使用禁止
- Server Componentを基本とする
- Client Componentは必要な場合のみ使用する
- APIキーや秘密情報をコードに直接記述しない
- 秘密情報は環境変数で管理する
- 重複コードを避ける
- 適切なエラーハンドリングを行う
- 既存の実装を確認してから変更する

## 命名規則

- React Component: PascalCase
- 関数・変数: camelCase
- ファイル名: kebab-case
- DBテーブル: snake_case

## UI

- スマホファースト
- 美容室オーナーが迷わず使えるシンプルなUI
- Tailwind CSSを使用する

## セキュリティ

- LINE Webhook署名検証を必須とする
- Supabase RLSを使用する
- Service Role Keyをクライアント側に公開しない
- ユーザー入力を信用せず適切に検証する

## 開発ルール

- 大きな変更をする前にPlanを提示する
- 一度に複数の大きな機能を実装しない
- 1機能ずつ実装して動作確認する
- 実装後は`.claude/agents/test-runner.md`のtest-runnerを使用する
- その後`.claude/agents/code-reviewer.md`のcode-reviewerを使用する
- ドキュメント作成が必要な場合は`.claude/agents/doc-writer.md`のdoc-writerを使用する

## Next.jsに関する注意

AGENTS.mdの通り、このプロジェクトのNext.jsは学習データより新しいバージョンで破壊的変更を含む可能性がある。コーディング前に`node_modules/next/dist/docs/`配下の該当ガイドを確認すること。
