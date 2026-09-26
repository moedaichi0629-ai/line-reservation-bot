import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

const ROOT = process.cwd();
const ANNOUNCEMENTS_APP_DIR = join(ROOT, "app", "admin", "(protected)", "announcements");

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return listSourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const read = (path: string) => readFileSync(path, "utf8");
/** コメントを除いたコード部分(説明コメント中の単語に反応しないようにする)。 */
const readCode = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const appFiles = listSourceFiles(ANNOUNCEMENTS_APP_DIR);
const clientFiles = [...appFiles, ...listSourceFiles(join(ROOT, "components", "admin"))].filter((path) =>
  /^\s*["']use client["']/m.test(read(path)),
);

describe("お知らせ配信画面: 秘密情報はサーバー側だけで扱う", () => {
  it("対象ファイルを検出できる(ガードが空振りしていない)", () => {
    expect(appFiles.length).toBeGreaterThanOrEqual(5);
    expect(clientFiles.map((path) => relative(ROOT, path))).toContain(
      join("app", "admin", "(protected)", "announcements", "announcement-form.tsx"),
    );
  });

  it.each(clientFiles.map((path) => [relative(ROOT, path), path]))(
    "%s (Client Component) はLINE SDK・Supabase・送信処理・環境変数を直接使わない",
    (_relativePath, path) => {
      const source = readCode(path);
      expect(source).not.toMatch(/@line\/bot-sdk|@\/lib\/line\//);
      expect(source).not.toMatch(/@supabase\/|@\/lib\/supabase\//);
      expect(source).not.toMatch(/announcement-repository|send-announcement|send-test-announcement/);
      expect(source).not.toContain("process.env");
    },
  );

  it.each(appFiles.map((path) => [relative(ROOT, path), path]))(
    "%s は環境変数(OWNER_LINE_USER_ID・LINE_CHANNEL_ACCESS_TOKEN等)を参照しない",
    (_relativePath, path) => {
      const source = readCode(path);
      expect(source).not.toContain("process.env");
      expect(source).not.toContain("OWNER_LINE_USER_ID");
      expect(source).not.toContain("LINE_CHANNEL_ACCESS_TOKEN");
    },
  );

  it("ページは自分でrequireAdmin()を呼ぶ", () => {
    expect(read(join(ANNOUNCEMENTS_APP_DIR, "page.tsx"))).toContain("await requireAdmin()");
  });

  it("Server Actionは3つとも最初にrequireAdmin()を呼ぶ", () => {
    const source = read(join(ANNOUNCEMENTS_APP_DIR, "actions.ts"));
    const actions = [...source.matchAll(/export async function (\w+)\([\s\S]*?\{\n\s*(.+)/g)];
    expect(actions.map(([, name]) => name)).toEqual([
      "createAnnouncementDraftAction",
      "sendAnnouncementAction",
      "sendTestAnnouncementAction",
    ]);
    for (const [, , firstStatement] of actions) {
      expect(firstStatement).toBe("await requireAdmin();");
    }
  });

  it("テスト送信処理はBroadcastを使わず、DBへ書き込まない", () => {
    const source = readCode(join(ROOT, "lib", "admin", "send-test-announcement.ts"));
    expect(source).not.toMatch(/broadcast/i);
    expect(source).not.toMatch(/claimAnnouncementForSending|markAnnouncement|\.update\(|\.insert\(/);
    expect(source).toContain("pushLineMessage(ownerLineUserId");
  });

  it("本番配信ボタンの送信先はsendAnnouncementActionだけ(画面から直接sendAnnouncementを呼ばない)", () => {
    const item = read(join(ANNOUNCEMENTS_APP_DIR, "announcement-history-item.tsx"));
    expect(item.match(/action=\{sendAnnouncementAction\}/g)).toHaveLength(1);
    expect(item).not.toMatch(/from "@\/lib\/admin\/send-announcement"/);
  });
});

describe("お知らせ配信画面: 未認証アクセス", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "test-secret-that-is-at-least-32-characters-long");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("未ログインで /admin/announcements を開くとログイン画面へ移動する", () => {
    const response = proxy(new NextRequest("https://salon.example.com/admin/announcements"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://salon.example.com/admin/login");
  });

  it("未ログインのPOST(Server Action)は401で拒否する", () => {
    const response = proxy(
      new NextRequest("https://salon.example.com/admin/announcements", { method: "POST" }),
    );

    expect(response.status).toBe(401);
  });
});

describe("管理画面のClient Componentはサーバー専用の重い依存をブラウザへ持ち込まない", () => {
  const adminClientFiles = [
    ...listSourceFiles(join(ROOT, "app", "admin")),
    ...listSourceFiles(join(ROOT, "components", "admin")),
  ].filter((path) => /^\s*["']use client["']/m.test(read(path)));

  it("対象ファイルを検出できる(ガードが空振りしていない)", () => {
    expect(adminClientFiles.length).toBeGreaterThanOrEqual(5);
  });

  it.each(adminClientFiles.map((path) => [relative(ROOT, path), path]))(
    "%s はzod(lib/admin/schemas.ts)をimportしない",
    (_relativePath, path) => {
      const source = readCode(path);
      expect(source).not.toMatch(/from ["']zod["']/);
      expect(source).not.toMatch(/@\/lib\/admin\/schemas["']/);
    },
  );

  it("フォームが使う入力上限モジュール(input-limits.ts)はzodに依存しない", () => {
    expect(readCode(join(ROOT, "lib", "admin", "input-limits.ts"))).not.toMatch(/import/);
  });
});

describe("管理画面のすべてのページは自分でrequireAdmin()を呼ぶ", () => {
  // レイアウトはクライアント側の画面遷移では再実行されないため、ページごとに確認する(多層防御)。
  const pages = listSourceFiles(join(ROOT, "app", "admin", "(protected)")).filter((path) =>
    path.endsWith("page.tsx"),
  );

  it("対象ページを検出できる(ガードが空振りしていない)", () => {
    expect(pages.length).toBeGreaterThanOrEqual(10);
  });

  it.each(pages.map((path) => [relative(ROOT, path), path]))("%s", (_relativePath, path) => {
    expect(readCode(path)).toContain("await requireAdmin()");
  });
});
