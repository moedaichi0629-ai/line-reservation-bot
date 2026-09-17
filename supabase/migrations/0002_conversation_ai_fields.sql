-- Phase 2: FAQ AI回答 + 確信度判定 + エスカレーション
-- conversationsテーブルへ、AI回答結果を追跡するための列を追加する
-- （追加のみ。既存の列・既存データへの変更は一切行わない）。
-- Supabase Dashboard > SQL Editor に貼り付けて実行する。

-- confidence: AI回答時の確信度（high/medium/low）。
--   fallback-error等、確信度判定自体が行われなかった行はNULLのままにする。
-- matched_faq_ids: 回答の根拠として実際に使用された（実在確認済みの）faq.idの配列。
--   根拠FAQが無い場合は空配列、判定自体が行われなかった行はNULL。
-- escalated: オーナーへのエスカレーション経路が選択されたか（kind:"escalate"だったか）を表す。
--   LINE Push通知が実際に配送成功したかどうかは表さない（Push失敗でもtrueのまま）。
alter table public.conversations
  add column if not exists confidence text
    check (confidence in ('high', 'medium', 'low')),
  add column if not exists matched_faq_ids uuid[],
  add column if not exists escalated boolean not null default false;

-- エスカレーションされた会話を後から一覧・集計できるよう、部分インデックスを追加する。
create index if not exists conversations_escalated_idx
  on public.conversations (escalated) where escalated;
