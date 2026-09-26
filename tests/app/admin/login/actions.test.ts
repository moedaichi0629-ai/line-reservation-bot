import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateAdminSession = vi.fn();
const mockDestroyAdminSession = vi.fn();
const mockVerifyAdminPassword = vi.fn();

vi.mock("@/lib/admin/auth", async () => {
  class AdminConfigError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AdminConfigError";
    }
  }
  return {
    AdminConfigError,
    createAdminSession: (...args: unknown[]) => mockCreateAdminSession(...args),
    destroyAdminSession: (...args: unknown[]) => mockDestroyAdminSession(...args),
    verifyAdminPassword: (...args: unknown[]) => mockVerifyAdminPassword(...args),
  };
});

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

import { AdminConfigError } from "@/lib/admin/auth";
import { loginAction, logoutAction } from "@/app/admin/login/actions";

function formWith(password?: string | File): FormData {
  const formData = new FormData();
  if (password !== undefined) {
    formData.set("password", password);
  }
  return formData;
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  mockCreateAdminSession.mockReset();
  mockDestroyAdminSession.mockReset();
  mockVerifyAdminPassword.mockReset();
  mockRedirect.mockClear();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  consoleErrorSpy.mockRestore();
});

describe("loginAction", () => {
  it("正しいパスワードならセッションを作成し /admin へリダイレクトする", async () => {
    mockVerifyAdminPassword.mockReturnValue(true);

    await expect(loginAction(null, formWith("correct-password-123"))).rejects.toThrow(
      "NEXT_REDIRECT:/admin",
    );
    expect(mockCreateAdminSession).toHaveBeenCalledTimes(1);
  });

  it("誤ったパスワードはセッションを作らず、一定の遅延後に汎用エラーを返す", async () => {
    mockVerifyAdminPassword.mockReturnValue(false);

    const promise = loginAction(null, formWith("wrong-password"));
    await vi.advanceTimersByTimeAsync(800);
    const result = await promise;

    expect(result).toEqual({ error: expect.stringContaining("パスワードが正しくありません") });
    expect(mockCreateAdminSession).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it.each([
    ["未入力", undefined],
    ["空文字", ""],
    ["長すぎる入力(201文字)", "a".repeat(201)],
    ["ファイル", new File(["x"], "x.txt")],
  ])("%s は検証関数を呼ばずに拒否する", async (_label, value) => {
    const promise = loginAction(null, formWith(value));
    await vi.advanceTimersByTimeAsync(800);
    const result = await promise;

    expect(result).toEqual({ error: expect.any(String) });
    expect(mockVerifyAdminPassword).not.toHaveBeenCalled();
    expect(mockCreateAdminSession).not.toHaveBeenCalled();
  });

  it("環境変数の設定不備では汎用メッセージを返し、ログに変数名のみ出力してパスワードは出さない", async () => {
    mockVerifyAdminPassword.mockImplementation(() => {
      throw new AdminConfigError("ADMIN_PASSWORD must be set to at least 12 characters.");
    });

    const result = await loginAction(null, formWith("typed-secret-password"));

    expect(result).toEqual({ error: expect.stringContaining("ログインできません") });
    expect(mockCreateAdminSession).not.toHaveBeenCalled();
    const logged = JSON.stringify(consoleErrorSpy.mock.calls);
    expect(logged).toContain("ADMIN_PASSWORD");
    expect(logged).not.toContain("typed-secret-password");
  });

  it("予期しない例外でもパスワードやエラー本文を出力せず、汎用メッセージを返す", async () => {
    mockVerifyAdminPassword.mockReturnValue(true);
    mockCreateAdminSession.mockRejectedValue(new Error("boom typed-secret-password"));

    const result = await loginAction(null, formWith("typed-secret-password"));

    expect(result).toEqual({ error: expect.stringContaining("ログインできません") });
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain("typed-secret-password");
  });
});

describe("logoutAction", () => {
  it("セッションを破棄して /admin/login へリダイレクトする", async () => {
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(mockDestroyAdminSession).toHaveBeenCalledTimes(1);
  });
});
