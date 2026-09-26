import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCookieGet = vi.fn();
const mockCookieSet = vi.fn();
const mockCookieDelete = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
    set: mockCookieSet,
    delete: mockCookieDelete,
  })),
}));

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

import {
  AdminConfigError,
  createAdminSession,
  destroyAdminSession,
  isAdminAuthenticated,
  requireAdmin,
  verifyAdminPassword,
} from "@/lib/admin/auth";
import { SESSION_COOKIE_NAME, createSessionToken } from "@/lib/admin/session-token";

const PASSWORD = "correct-horse-battery-staple";
const SECRET = "test-secret-that-is-at-least-32-characters-long";

beforeEach(() => {
  mockCookieGet.mockReset();
  mockCookieSet.mockReset();
  mockCookieDelete.mockReset();
  mockRedirect.mockClear();
  vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
  vi.stubEnv("ADMIN_SESSION_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verifyAdminPassword", () => {
  it("正しいパスワードはtrue、誤りや空文字はfalse", () => {
    expect(verifyAdminPassword(PASSWORD)).toBe(true);
    expect(verifyAdminPassword("wrong-password-value")).toBe(false);
    expect(verifyAdminPassword("")).toBe(false);
    expect(verifyAdminPassword(`${PASSWORD} `)).toBe(false);
  });

  it("長さが大きく異なる入力でも例外を出さずfalseを返す", () => {
    expect(verifyAdminPassword("x".repeat(10_000))).toBe(false);
  });

  it("ADMIN_PASSWORDが未設定または12文字未満ならAdminConfigError(値は含めない)", () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(() => verifyAdminPassword("anything")).toThrow(AdminConfigError);

    vi.stubEnv("ADMIN_PASSWORD", "short-pw");
    try {
      verifyAdminPassword("anything");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AdminConfigError);
      expect((error as Error).message).toContain("ADMIN_PASSWORD");
      expect((error as Error).message).not.toContain("short-pw");
    }
  });
});

describe("createAdminSession", () => {
  it("httpOnly・sameSite=lax・path=/admin・30日のCookieを設定し、有効なトークンを保存する", async () => {
    await createAdminSession();

    expect(mockCookieSet).toHaveBeenCalledTimes(1);
    const [name, token, options] = mockCookieSet.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE_NAME);
    expect(typeof token).toBe("string");
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/admin",
      maxAge: 60 * 60 * 24 * 30,
    });
  });

  it("本番環境ではsecure=true、開発環境ではfalse", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await createAdminSession();
    expect(mockCookieSet.mock.calls[0][2]).toMatchObject({ secure: true });

    mockCookieSet.mockReset();
    vi.stubEnv("NODE_ENV", "development");
    await createAdminSession();
    expect(mockCookieSet.mock.calls[0][2]).toMatchObject({ secure: false });
  });

  it("ADMIN_SESSION_SECRETが未設定ならCookieを設定せずAdminConfigError", async () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "");

    await expect(createAdminSession()).rejects.toThrow(AdminConfigError);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });
});

describe("destroyAdminSession", () => {
  it("セッションCookieをpath付きで削除する", async () => {
    await destroyAdminSession();

    expect(mockCookieDelete).toHaveBeenCalledWith({
      name: SESSION_COOKIE_NAME,
      path: "/admin",
    });
  });
});

describe("isAdminAuthenticated / requireAdmin", () => {
  it("有効なセッションCookieがあれば認証済みで、リダイレクトしない", async () => {
    mockCookieGet.mockReturnValue({ value: createSessionToken(SECRET) });

    expect(await isAdminAuthenticated()).toBe(true);
    await expect(requireAdmin()).resolves.toBeUndefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("Cookieが無ければ未認証で、requireAdminは/admin/loginへリダイレクトする", async () => {
    mockCookieGet.mockReturnValue(undefined);

    expect(await isAdminAuthenticated()).toBe(false);
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });

  it("改ざん・別シークレット・期限切れのCookieは未認証", async () => {
    mockCookieGet.mockReturnValue({ value: "1800000000.forged" });
    expect(await isAdminAuthenticated()).toBe(false);

    mockCookieGet.mockReturnValue({
      value: createSessionToken("another-secret-that-is-at-least-32-chars"),
    });
    expect(await isAdminAuthenticated()).toBe(false);

    mockCookieGet.mockReturnValue({ value: createSessionToken(SECRET, 0, 1) });
    expect(await isAdminAuthenticated()).toBe(false);
  });

  it("ADMIN_SESSION_SECRETが未設定なら、有効に見えるCookieでも未認証(fail closed)", async () => {
    mockCookieGet.mockReturnValue({ value: createSessionToken(SECRET) });
    vi.stubEnv("ADMIN_SESSION_SECRET", "");

    expect(await isAdminAuthenticated()).toBe(false);
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });
});
