import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME, createSessionToken } from "@/lib/admin/session-token";
import { config, proxy } from "@/proxy";

const SECRET = "test-secret-that-is-at-least-32-characters-long";
const ORIGIN = "https://salon.example.com";

function makeRequest(path: string, options: { method?: string; token?: string } = {}) {
  const headers = new Headers();
  if (options.token !== undefined) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${options.token}`);
  }
  return new NextRequest(`${ORIGIN}${path}`, { method: options.method ?? "GET", headers });
}

function isPassThrough(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

beforeEach(() => {
  vi.stubEnv("ADMIN_SESSION_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy: 未ログイン", () => {
  it.each(["/admin", "/admin/faq", "/admin/conversations/abc", "/admin/"])(
    "GET %s は /admin/login へリダイレクトする",
    (path) => {
      const response = proxy(makeRequest(path));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(`${ORIGIN}/admin/login`);
    },
  );

  it("POST(Server Action等)は401を返し、リダイレクトしない", async () => {
    const response = proxy(makeRequest("/admin/faq", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("HEADはGETと同様にログイン画面へリダイレクトする", () => {
    const response = proxy(makeRequest("/admin/faq", { method: "HEAD" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/admin/login`);
  });

  it("PUT/PATCH/DELETEも401", () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect(proxy(makeRequest("/admin/faq", { method })).status).toBe(401);
    }
  });

  it("不正・改ざん・期限切れのCookieは未ログイン扱い", () => {
    for (const token of ["garbage", "1800000000.forged", createSessionToken(SECRET, 0, 1)]) {
      const response = proxy(makeRequest("/admin", { token }));
      expect(response.status).toBe(307);
    }
  });

  it("ADMIN_SESSION_SECRETが未設定なら有効に見えるCookieでも拒否する(fail closed)", () => {
    const token = createSessionToken(SECRET);
    vi.stubEnv("ADMIN_SESSION_SECRET", "");

    expect(proxy(makeRequest("/admin", { token })).status).toBe(307);
  });
});

describe("proxy: ログイン画面", () => {
  it("未ログインでも /admin/login の表示とログインPOSTは通す", () => {
    expect(isPassThrough(proxy(makeRequest("/admin/login")))).toBe(true);
    expect(isPassThrough(proxy(makeRequest("/admin/login", { method: "POST" })))).toBe(true);
  });

  it("末尾スラッシュ付き /admin/login/ も同じ扱い", () => {
    expect(isPassThrough(proxy(makeRequest("/admin/login/")))).toBe(true);
  });

  it("ログイン済みで /admin/login を開くと /admin へ移動する", () => {
    const response = proxy(makeRequest("/admin/login", { token: createSessionToken(SECRET) }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/admin`);
  });

  it("ログイン済みの /admin/login へのPOSTはそのまま通す(リダイレクトしない)", () => {
    const token = createSessionToken(SECRET);

    expect(isPassThrough(proxy(makeRequest("/admin/login", { token, method: "POST" })))).toBe(true);
  });
});

describe("proxy: ログイン済み", () => {
  it("有効なCookieがあれば /admin 配下を通す(GET・POSTとも)", () => {
    const token = createSessionToken(SECRET);

    expect(isPassThrough(proxy(makeRequest("/admin", { token })))).toBe(true);
    expect(isPassThrough(proxy(makeRequest("/admin/faq", { token })))).toBe(true);
    expect(isPassThrough(proxy(makeRequest("/admin/faq", { token, method: "POST" })))).toBe(true);
  });
});

describe("proxy: matcher (Next.jsの実際のmatcher解釈で検証)", () => {
  function matches(url: string): boolean {
    return unstable_doesMiddlewareMatch({ config, url });
  }

  it("/admin 配下のみを対象にする", () => {
    expect(matches("/admin")).toBe(true);
    expect(matches("/admin/")).toBe(true);
    expect(matches("/admin/login")).toBe(true);
    expect(matches("/admin/faq")).toBe(true);
    expect(matches("/admin/faq/123/edit")).toBe(true);
  });

  it("LINE Webhookとその他のパスは対象外(署名検証の経路に影響しない)", () => {
    expect(matches("/api/line/webhook")).toBe(false);
    expect(matches("/api/admin")).toBe(false);
    expect(matches("/")).toBe(false);
    expect(matches("/administrator")).toBe(false);
    expect(matches("/_next/static/chunk.js")).toBe(false);
  });
});
