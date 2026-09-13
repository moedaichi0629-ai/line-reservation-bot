# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## プロジェクト概要

- 美容室向けLINE Bot
- LINEからの問い合わせを自動応答するシステム
- Phase 1ではLINE WebhookとEcho Botまで実装する
- 将来的にFAQ自動応答、Claude API、管理画面、お知らせ一斉配信、エスカレーション機能を追加する

## 現在のプロジェクト状態

`create-next-app`でブートストラップした直後の状態（Next.js 16.3.5、React 19.2.8）。`app/layout.tsx`、`app/page.tsx`、`app/globals.css`のデフォルトスキャフォールドのみが存在し、LINE BotやSupabase関連の実装はまだ開始していない。実装を始める際は、まずPlanを提示してから着手すること。

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

テストランナーは未設定。テスト実行時は`.claude/agents/test-runner.md`のtest-runnerサブエージェントを使用する。

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
