import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ADMIN_APP_DIR = join(process.cwd(), "app", "admin");
// Login/logout must work without a session, so they are the only allowed exceptions.
const UNAUTHENTICATED_ACTION_FILES = new Set([join("app", "admin", "login", "actions.ts")]);

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return listSourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// proxy.ts cannot protect Server Actions (they are dispatched by action ID, not URL),
// so every action module under app/admin must verify the session itself.
describe("app/admin の Server Action は必ず自分で認証を確認する", () => {
  const actionFiles = listSourceFiles(ADMIN_APP_DIR).filter((path) =>
    /^\s*["']use server["']/m.test(readFileSync(path, "utf8")),
  );

  it("Server Actionファイルを検出できる(ガードが空振りしていない)", () => {
    expect(actionFiles.length).toBeGreaterThan(0);
  });

  it.each(actionFiles.map((path) => [relative(process.cwd(), path), path]))(
    "%s",
    (relativePath, path) => {
      if (UNAUTHENTICATED_ACTION_FILES.has(relativePath)) {
        return;
      }
      expect(readFileSync(path, "utf8")).toContain("requireAdmin(");
    },
  );
});
