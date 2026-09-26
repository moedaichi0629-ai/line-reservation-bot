import { HTTPFetchError } from "@line/bot-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 実LINE APIには絶対に送らない: LINEクライアントは常にモックに差し替える。
const mockBroadcastWithHttpInfo = vi.fn();
const mockPushMessage = vi.fn();
const mockGetLineClient = vi.fn(() => ({
  broadcastWithHttpInfo: mockBroadcastWithHttpInfo,
  pushMessage: mockPushMessage,
}));
vi.mock("@/lib/line/client", () => ({
  getLineClient: () => mockGetLineClient(),
}));

import { broadcastTextMessage, redactSecrets } from "@/lib/line/broadcast";

const SECRET_TOKEN = "broadcast-test-token-SECRET-abcdefghijklmnop";
const RETRY_KEY = "123e4567-e89b-42d3-a456-426614174000";

function httpError(status: number, body: string, headers: Record<string, string> = {}) {
  return new HTTPFetchError(`${status} - error`, {
    status,
    statusText: "error",
    headers: new Headers(headers),
    body,
  });
}

beforeEach(() => {
  mockBroadcastWithHttpInfo.mockReset();
  mockPushMessage.mockReset();
  mockGetLineClient.mockReset();
  mockGetLineClient.mockImplementation(() => ({
    broadcastWithHttpInfo: mockBroadcastWithHttpInfo,
    pushMessage: mockPushMessage,
  }));
  vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", SECRET_TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("broadcastTextMessage", () => {
  it("Broadcast APIにテキスト1件とretry keyを渡し、x-line-request-idを返す(個別Pushは使わない)", async () => {
    mockBroadcastWithHttpInfo.mockResolvedValue({
      httpResponse: new Response(null, { headers: { "x-line-request-id": "req-123" } }),
      body: {},
    });

    const result = await broadcastTextMessage("お知らせ本文", RETRY_KEY);

    expect(mockBroadcastWithHttpInfo).toHaveBeenCalledWith(
      { messages: [{ type: "text", text: "お知らせ本文" }] },
      RETRY_KEY,
    );
    expect(mockPushMessage).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, requestId: "req-123", alreadyAccepted: false });
  });

  it("409(同じretry keyで受付済み)は成功扱いにし、最初に受け付けられたリクエストIDを返す", async () => {
    mockBroadcastWithHttpInfo.mockRejectedValue(
      httpError(409, JSON.stringify({ message: "The retry key is already accepted" }), {
        "x-line-request-id": "req-now",
        "x-line-accepted-request-id": "req-first",
      }),
    );

    const result = await broadcastTextMessage("本文", RETRY_KEY);

    expect(result).toEqual({ ok: true, requestId: "req-first", alreadyAccepted: true });
  });

  it("HTTPエラーはthrowせず、ステータス・request ID・LINEのmessageを返す", async () => {
    mockBroadcastWithHttpInfo.mockRejectedValue(
      httpError(429, JSON.stringify({ message: "You have reached your monthly limit." }), {
        "x-line-request-id": "req-429",
      }),
    );

    const result = await broadcastTextMessage("本文", RETRY_KEY);

    expect(result).toEqual({
      ok: false,
      kind: "http",
      status: 429,
      requestId: "req-429",
      lineMessage: "You have reached your monthly limit.",
    });
  });

  it("LINEのmessageに含まれるトークンは伏せ字にし、200文字に制限する", async () => {
    mockBroadcastWithHttpInfo.mockRejectedValue(
      httpError(401, JSON.stringify({ message: `bad token ${SECRET_TOKEN} ${"z".repeat(500)}` })),
    );

    const result = await broadcastTextMessage("本文", RETRY_KEY);

    expect(result.ok).toBe(false);
    const message = result.ok ? null : result.lineMessage;
    expect(message).not.toContain(SECRET_TOKEN);
    expect(message).toContain("[REDACTED]");
    expect(message?.length).toBeLessThanOrEqual(200);
  });

  it("LINEのmessageを200文字で切るとき、絵文字(サロゲートペア)を途中で壊さない", async () => {
    mockBroadcastWithHttpInfo.mockRejectedValue(
      httpError(400, JSON.stringify({ message: `${"a".repeat(199)}😀tail` })),
    );

    const result = await broadcastTextMessage("本文", RETRY_KEY);

    expect(result.ok ? null : result.lineMessage).toBe("a".repeat(199));
  });

  it("JSONでないエラー本文は使わない", async () => {
    mockBroadcastWithHttpInfo.mockRejectedValue(httpError(502, "<html>gateway</html>"));

    const result = await broadcastTextMessage("本文", RETRY_KEY);

    expect(result).toMatchObject({ ok: false, kind: "http", status: 502, lineMessage: null });
  });

  it("通信エラーは network として返し、エラー内容は返さない", async () => {
    mockBroadcastWithHttpInfo.mockRejectedValue(new TypeError(`fetch failed ${SECRET_TOKEN}`));

    const result = await broadcastTextMessage("本文", RETRY_KEY);

    expect(result).toEqual({ ok: false, kind: "network", status: null, requestId: null, lineMessage: null });
  });

  it("クライアント生成に失敗した(トークン未設定)場合は config として返し、APIを呼ばない", async () => {
    mockGetLineClient.mockImplementation(() => {
      throw new Error("LINE_CHANNEL_ACCESS_TOKEN must be set in the environment.");
    });

    const result = await broadcastTextMessage("本文", RETRY_KEY);

    expect(result).toEqual({ ok: false, kind: "config", status: null, requestId: null, lineMessage: null });
    expect(mockBroadcastWithHttpInfo).not.toHaveBeenCalled();
  });
});

describe("redactSecrets", () => {
  it("アクセストークンとBearer形式の値を伏せ字にする", () => {
    expect(redactSecrets(`a ${SECRET_TOKEN} b Bearer xyz.123`)).toBe("a [REDACTED] b Bearer [REDACTED]");
  });

  it("トークン未設定でもBearer形式は伏せ字にする", () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "");
    expect(redactSecrets("authorization: bearer abc")).toBe("authorization: Bearer [REDACTED]");
  });
});
