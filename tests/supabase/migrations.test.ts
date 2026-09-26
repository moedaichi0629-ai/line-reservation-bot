import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// マイグレーションは手動でSQL Editorから実行するため、実行前にファイル内容の安全性を静的に確認する。
const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), "utf8");
}

/** `--`コメント(ロールバック手順の説明を含む)を除いた、実際に実行されるSQLだけを返す。 */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("supabase/migrations", () => {
  it("連番どおりに並んでいる", () => {
    expect(readdirSync(MIGRATIONS_DIR).sort()).toEqual([
      "0001_init.sql",
      "0002_conversation_ai_fields.sql",
      "0003_announcements.sql",
    ]);
  });
});

describe("0003_announcements.sql", () => {
  const executable = stripComments(readMigration("0003_announcements.sql")).toLowerCase();

  it("announcementsテーブルを作成し、RLSを有効化する", () => {
    expect(executable).toMatch(/create table if not exists public\.announcements\s*\(/);
    expect(executable).toContain("alter table public.announcements enable row level security");
  });

  it("RLSポリシーを作らない(既存テーブルと同じくservice roleのみアクセス)", () => {
    expect(executable).not.toContain("create policy");
    expect(executable).not.toMatch(/\bgrant\b/);
  });

  it("既存テーブル(faq/menus/conversations)に触れない", () => {
    expect(executable).not.toMatch(/\b(faq|menus|conversations)\b/);
  });

  it("既存データを変更・削除する文を含まない(ロールバック手順はコメントのみ)", () => {
    expect(executable).not.toMatch(/\b(drop|delete|truncate|update|insert)\b/);
    expect(executable).not.toMatch(/alter table(?! public\.announcements enable row level security)/);
  });

  it("LINEユーザーID等の宛先情報のカラムを持たない", () => {
    expect(executable).not.toMatch(/user_id|line_user|recipient/);
  });

  it("計画どおりのステータス・重複送信防止キーを持つ", () => {
    expect(executable).toContain("check (status in ('draft', 'sending', 'sent', 'failed'))");
    expect(executable).toContain("retry_key uuid not null default gen_random_uuid()");
    expect(executable).toContain("unique (retry_key)");
  });

  it("statusの既定値はdraft", () => {
    expect(executable).toContain("status text not null default 'draft'");
  });

  it("本文は空白のみ(全角スペース・改行含む)を拒否し、LINEの上限5000字以内に制限する", () => {
    expect(executable).toContain("char_length(btrim(body, e' \\t\\r\\n\\u3000')) > 0");
    expect(executable).toContain("char_length(body) <= 5000");
  });

  it("状態と日時の整合性CHECKを持つ(送信前は日時なし・送信後は日時あり)", () => {
    const normalized = executable.replace(/\s+/g, " ");
    expect(normalized).toContain("constraint announcements_status_timestamps_check check (");
    expect(normalized).toContain(
      "(status = 'draft' and sending_started_at is null and sent_at is null)",
    );
    expect(normalized).toContain(
      "or (status in ('sending', 'failed') and sending_started_at is not null and sent_at is null)",
    );
    expect(normalized).toContain(
      "or (status = 'sent' and sending_started_at is not null and sent_at is not null)",
    );
  });

  it("LINEのリクエストIDと失敗理由に長さ上限を設ける", () => {
    expect(executable).toContain("char_length(line_request_id) <= 100");
    expect(executable).toContain("char_length(error_message) <= 500");
  });

  it("配信履歴(新しい順)用のインデックスを持つ", () => {
    expect(executable).toMatch(
      /create index if not exists announcements_created_at_idx\s+on public\.announcements \(created_at desc\)/,
    );
  });

  it("ロールバック手順をコメントで記載している", () => {
    expect(readMigration("0003_announcements.sql")).toContain(
      "--   drop table if exists public.announcements;",
    );
  });
});
