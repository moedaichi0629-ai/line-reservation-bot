import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// 会話ログ画面は閲覧専用。DBへの書き込み経路(Server Action・書き込み系クエリ)が
// 紛れ込んでいないことをソースレベルで確認する。
const CONVERSATIONS_APP_DIR = join(process.cwd(), "app", "admin", "(protected)", "conversations");
const REPOSITORY_FILE = join(process.cwd(), "lib", "admin", "conversation-repository.ts");

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return listSourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const files = [...listSourceFiles(CONVERSATIONS_APP_DIR), REPOSITORY_FILE];
const cases = files.map((path) => [relative(process.cwd(), path), path]);

describe("会話ログ画面は読み取り専用", () => {
  it("対象ファイルを検出できる(ガードが空振りしていない)", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it.each(cases)("%s にDBへの書き込み処理が無い", (_relativePath, path) => {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
  });

  it.each(cases)("%s にServer Actionが無い", (_relativePath, path) => {
    expect(readFileSync(path, "utf8")).not.toMatch(/^\s*["']use server["']/m);
  });

  it.each(cases)("%s は raw_event を扱わない", (_relativePath, path) => {
    expect(readFileSync(path, "utf8")).not.toMatch(/raw_event["'`\s,]/);
  });

  it("各ページは自分でrequireAdmin()を呼ぶ", () => {
    const pages = files.filter((path) => path.endsWith("page.tsx"));
    expect(pages).toHaveLength(2);
    for (const page of pages) {
      expect(readFileSync(page, "utf8")).toContain("await requireAdmin()");
    }
  });
});
