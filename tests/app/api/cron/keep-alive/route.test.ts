import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { GET } from "@/app/api/cron/keep-alive/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const mockCreateSupabaseServerClient = vi.mocked(createSupabaseServerClient);

const CRON_SECRET = "dummy-cron-secret-do-not-leak-0123";
const DB_ERROR_MESSAGE = "dummy-db-error-detail-do-not-leak";

const mockLimit = vi.fn();
const mockSelect = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

function cronRequest(authorization?: string): Request {
  const headers = new Headers();
  if (authorization !== undefined) {
    headers.set("authorization", authorization);
  }
  return new Request("https://example.com/api/cron/keep-alive", { headers });
}

describe("GET /api/cron/keep-alive", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    mockLimit.mockResolvedValue({ data: [{ id: "faq-1" }], error: null });
    mockCreateSupabaseServerClient.mockReturnValue(
      { from: mockFrom } as unknown as ReturnType<typeof createSupabaseServerClient>
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("正しいシークレットなら faq を1行だけ読み取り、200 と最小限の本文を返す", async () => {
    const response = await GET(cronRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mockFrom).toHaveBeenCalledWith("faq");
    expect(mockSelect).toHaveBeenCalledWith("id");
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it("読み取ったデータはレスポンスに含めない", async () => {
    const response = await GET(cronRequest(`Bearer ${CRON_SECRET}`));

    expect(await response.text()).not.toContain("faq-1");
  });

  it.each([
    ["ヘッダーなし", undefined],
    ["空文字", ""],
    ["Bearer 接頭辞なし", CRON_SECRET],
    ["シークレット違い", "Bearer wrong-secret-value-0123456"],
    ["長さ違い（前方一致）", `Bearer ${CRON_SECRET}x`],
    ["大文字小文字違い", `bearer ${CRON_SECRET}`],
  ])("認証ヘッダーが不正（%s）なら 401 を返し、DB に触れない", async (_label, authorization) => {
    const response = await GET(cronRequest(authorization));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mockCreateSupabaseServerClient).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(CRON_SECRET);
  });

  it("CRON_SECRET が未設定なら 500 を返し、DB に触れない（fail-closed）", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await GET(cronRequest("Bearer "));

    expect(response.status).toBe(500);
    expect(mockCreateSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("CRON_SECRET が16文字未満なら、ヘッダーが一致していても 500 を返し、DB に触れない", async () => {
    const shortSecret = "short-secret-15";
    vi.stubEnv("CRON_SECRET", shortSecret);

    const response = await GET(cronRequest(`Bearer ${shortSecret}`));

    expect(response.status).toBe(500);
    expect(mockCreateSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("Supabase がエラーを返したら 500 を返し、エラー詳細を本文・ログに出さない", async () => {
    mockLimit.mockResolvedValue({
      data: null,
      error: { message: DB_ERROR_MESSAGE, code: "PGRST000" },
    });

    const response = await GET(cronRequest(`Bearer ${CRON_SECRET}`));
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain(DB_ERROR_MESSAGE);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(DB_ERROR_MESSAGE);
  });

  it("Supabase クライアントが例外を投げたら 500 を返し、例外メッセージを本文・ログに出さない", async () => {
    mockCreateSupabaseServerClient.mockImplementation(() => {
      throw new Error(DB_ERROR_MESSAGE);
    });

    const response = await GET(cronRequest(`Bearer ${CRON_SECRET}`));
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain(DB_ERROR_MESSAGE);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(DB_ERROR_MESSAGE);
  });

  it("どのレスポンスにも CRON_SECRET を含めない", async () => {
    const responses = await Promise.all([
      GET(cronRequest(`Bearer ${CRON_SECRET}`)),
      GET(cronRequest("Bearer wrong-secret-value-0123456")),
    ]);

    for (const response of responses) {
      expect(await response.text()).not.toContain(CRON_SECRET);
    }
  });
});
