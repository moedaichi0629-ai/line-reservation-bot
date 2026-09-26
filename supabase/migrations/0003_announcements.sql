-- Phase 3: お知らせ配信(LINE Broadcast)の履歴テーブルを追加する
-- （新規テーブルの追加のみ。既存の faq / menus / conversations とその既存データには一切触れない）。
-- Supabase Dashboard > SQL Editor に貼り付けて実行する。
--
-- 配信は友だち全員へのBroadcastのため、宛先(LINEユーザーID等の個人情報)はこのテーブルに保存しない。
--
-- 状態遷移（アプリ側で制御する。Step 6・7で実装）:
--   draft   : 確認画面へ進んだ時点で作成。まだ送信していない。
--   sending : 「draft/failed → sending」を条件付きUPDATEで原子的に遷移させてから送信する
--             （0件更新なら送信済み/送信中として中止し、連打・二重タブによる二重配信を防ぐ）。
--             下の状態・日時の整合性CHECKにより、同じUPDATEで sending_started_at も必ず設定すること:
--               update public.announcements
--                  set status = 'sending', sending_started_at = now(), error_message = null
--                where id = $1 and status in ('draft', 'failed')
--               returning retry_key;
--   sent    : LINEが送信依頼を受け付けた（受信者ごとの到達はBroadcastでは分からない）。
--   failed  : 送信依頼に失敗した。同じretry_keyで再送できる（LINE側のキー有効期限は24時間）。

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),

  -- 配信本文（テキスト1通）。空白のみ（半角/全角スペース・タブ・改行）は不可。上限はLINEの
  -- テキストメッセージ上限(5000字)をDB側の最終防衛線とし、運用上の上限(1000字)はアプリ側で検証する
  -- （DB変更なしで調整できるように）。
  body text not null
    check (
      char_length(btrim(body, E' \t\r\n\u3000')) > 0
      and char_length(body) <= 5000
    ),

  status text not null default 'draft'
    check (status in ('draft', 'sending', 'sent', 'failed')),

  -- LINE Messaging APIの X-Line-Retry-Key に渡すUUID。同じキーでの再送はLINE側で二重配信されない。
  retry_key uuid not null default gen_random_uuid(),

  -- LINEのレスポンスヘッダ x-line-request-id（問い合わせ・調査用）。
  line_request_id text
    check (line_request_id is null or char_length(line_request_id) <= 100),

  -- 失敗理由（管理画面に表示する日本語の要約）。トークン等の秘密情報やAPIの生レスポンスは入れない。
  -- line_request_id / error_message の長さ上限を超えると、失敗を記録するUPDATE自体が失敗して
  -- 行がsendingのまま残るため、アプリ側で必ず上限以内に切り詰めてから保存すること。
  error_message text
    check (error_message is null or char_length(error_message) <= 500),

  created_at timestamptz not null default now(),
  -- 最後に送信処理を開始した日時（failedからの再送時は上書きされる）。
  sending_started_at timestamptz,
  -- 配信日時（LINEが送信依頼を受け付けた日時）。
  sent_at timestamptz,

  constraint announcements_retry_key_key unique (retry_key),

  -- 状態と日時の整合性。アプリの不具合で矛盾した行が保存されるのを防ぐ。
  --   draft        : 送信開始前なので、送信開始日時・配信日時はどちらも無い
  --   sending/failed: 送信を開始しているが、配信日時は無い
  --   sent         : 送信開始日時・配信日時の両方がある
  constraint announcements_status_timestamps_check check (
    (status = 'draft'   and sending_started_at is null     and sent_at is null)
    or (status in ('sending', 'failed') and sending_started_at is not null and sent_at is null)
    or (status = 'sent' and sending_started_at is not null and sent_at is not null)
  )
);

-- 管理画面の配信履歴(新しい順)の一覧用。
create index if not exists announcements_created_at_idx
  on public.announcements (created_at desc);

-- RLS: 既存3テーブルと同じ方針。有効化のみでポリシーは作らない（デフォルト全拒否）。
-- 管理画面・配信処理はサーバー側で SUPABASE_SERVICE_ROLE_KEY を使い RLS をバイパスしてアクセスする
-- （anon / authenticated ロールからは読み書きできない）。
alter table public.announcements enable row level security;

-- ---------------------------------------------------------------------------
-- ロールバック（元に戻す場合のみ、SQL Editorで以下を実行する）:
--   drop table if exists public.announcements;
-- ※ announcementsテーブルと、そこに保存された配信履歴だけが削除される。
--   既存の faq / menus / conversations には影響しない。
--   テーブル削除と同時に、そのインデックス・制約・RLS設定も削除される。
-- ---------------------------------------------------------------------------
