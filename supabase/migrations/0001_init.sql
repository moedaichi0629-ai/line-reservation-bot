-- Phase 1: 基盤構築 — faq / menus / conversations の初期スキーマ
-- Supabase Dashboard > SQL Editor に貼り付けて実行する。

create extension if not exists "pgcrypto";

-- 1. faq: よくある質問（Phase1では自動応答しないが、器として先に作成）
create table if not exists public.faq (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text,
  display_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists faq_published_order_idx
  on public.faq (is_published, display_order);

-- 2. menus: 施術メニュー（Phase1では予約機能なし。器として先に作成）
create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_yen integer not null check (price_yen >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  display_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists menus_published_order_idx
  on public.menus (is_published, display_order);

-- 3. conversations: LINEとのやり取りのログ（Echo Botが実際に読み書きする）
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null default 'text',
  message_text text,
  line_message_id text,
  raw_event jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversations_line_user_id_idx
  on public.conversations (line_user_id);

create index if not exists conversations_created_at_idx
  on public.conversations (created_at);

-- LINEはタイムアウト時に同一イベントを再送することがあるため、
-- line_message_id の重複挿入を防ぐ一意インデックス（NULL = outbound分は対象外）
create unique index if not exists conversations_line_message_id_key
  on public.conversations (line_message_id)
  where line_message_id is not null;

-- updated_at 自動更新（faq / menus のみ）
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists faq_set_updated_at on public.faq;
create trigger faq_set_updated_at
  before update on public.faq
  for each row execute function public.set_updated_at();

drop trigger if exists menus_set_updated_at on public.menus;
create trigger menus_set_updated_at
  before update on public.menus
  for each row execute function public.set_updated_at();

-- RLS: 3テーブルとも有効化。Phase1には管理者認証も匿名クライアントからのアクセスも存在しないため、
-- 明示的なポリシーは一切作らず「デフォルト全拒否」の状態にする。
-- サーバー側は SUPABASE_SERVICE_ROLE_KEY を使い RLS を意図的にバイパスしてアクセスする。
alter table public.faq enable row level security;
alter table public.menus enable row level security;
alter table public.conversations enable row level security;

-- 将来、管理画面（認証済みスタッフ）向けに SELECT/INSERT/UPDATE ポリシーをここに追加する。
-- 例（Phase1では作成しない・将来の参考コメントのみ）:
-- create policy "authenticated staff can read faq" on public.faq
--   for select to authenticated using (true);
