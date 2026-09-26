import { HTTPFetchError } from "@line/bot-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAnnouncementsDb } from "./fake-announcements-db";

// 実LINE APIには絶対に送らない: LINEクライアントは常にこのモックに差し替える。
const mockBroadcastWithHttpInfo = vi.fn();
const mockGetLineClient = vi.fn(() => ({ broadcastWithHttpInfo: mockBroadcastWithHttpInfo }));
vi.mock("@/lib/line/client", () => ({
  getLineClient: () => mockGetLineClient(),
}));

const mockRequireAdmin = vi.fn(async () => {});
vi.mock("@/lib/admin/auth", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

let db: FakeAnnouncementsDb;
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => db.client(),
}));

import { sendAnnouncement } from "@/lib/admin/send-announcement";

const SECRET_TOKEN = "test-line-channel-access-token-SECRET-1234567890";

function lineSuccess(requestId: string | null = "req-success-1") {
  const headers = new Headers();
  if (requestId !== null) headers.set("x-line-request-id", requestId);
  return { httpResponse: new Response(null, { status: 200, headers }), body: {} };
}

function lineError(status: number, body: string, headers: Record<string, string> = {}) {
  return new HTTPFetchError(`${status} - error`, {
    status,
    statusText: "error",
    headers: new Headers(headers),
    body,
  });
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  db = new FakeAnnouncementsDb();
  mockBroadcastWithHttpInfo.mockReset();
  mockBroadcastWithHttpInfo.mockResolvedValue(lineSuccess());
  mockGetLineClient.mockReset();
  mockGetLineClient.mockImplementation(() => ({ broadcastWithHttpInfo: mockBroadcastWithHttpInfo }));
  mockRequireAdmin.mockReset();
  mockRequireAdmin.mockResolvedValue(undefined);
  vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", SECRET_TOKEN);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  consoleErrorSpy.mockRestore();
});

describe("sendAnnouncement: 正常送信", () => {
  it("draft → sending → sent と遷移し、Broadcast APIへテキスト1件とretry_keyを渡す", async () => {
    const row = db.addRow({ body: "明日は臨時休業です。" });

    const result = await sendAnnouncement(row.id);

    expect(result).toEqual({
      ok: true,
      lineRequestId: "req-success-1",
      alreadyAccepted: false,
      recorded: true,
    });
    expect(mockBroadcastWithHttpInfo).toHaveBeenCalledTimes(1);
    expect(mockBroadcastWithHttpInfo).toHaveBeenCalledWith(
      { messages: [{ type: "text", text: "明日は臨時休業です。" }] },
      row.retry_key,
    );
    expect(db.updates.map((update) => update.status)).toEqual(["sending", "sent"]);

    const saved = db.get(row.id);
    expect(saved?.status).toBe("sent");
    expect(saved?.sent_at).not.toBeNull();
    expect(saved?.sending_started_at).not.toBeNull();
    expect(saved?.error_message).toBeNull();
    expect(saved?.line_request_id).toBe("req-success-1");
    expect(saved?.retry_key).toBe(row.retry_key);
  });

  it("sending遷移時に sending_started_at=現在時刻, sent_at=null, error_message=null を同時に設定する", async () => {
    const row = db.addRow();
    const before = Date.now();

    await sendAnnouncement(row.id);

    const sendingUpdate = db.updates[0];
    expect(sendingUpdate.status).toBe("sending");
    expect(sendingUpdate.sent_at).toBeNull();
    expect(sendingUpdate.error_message).toBeNull();
    expect(Date.parse(sendingUpdate.sending_started_at ?? "")).toBeGreaterThanOrEqual(before);
    expect("retry_key" in sendingUpdate).toBe(false);
  });

  it("LINEがrequest IDを返さない場合はline_request_idをnullのままsentにする", async () => {
    mockBroadcastWithHttpInfo.mockResolvedValue(lineSuccess(null));
    const row = db.addRow();

    const result = await sendAnnouncement(row.id);

    expect(result.ok).toBe(true);
    expect(db.get(row.id)?.status).toBe("sent");
    expect(db.get(row.id)?.line_request_id).toBeNull();
  });

  it("request IDが100文字を超える場合は100文字に切り詰めて保存する(DB制約違反にしない)", async () => {
    mockBroadcastWithHttpInfo.mockResolvedValue(lineSuccess("r".repeat(150)));
    const row = db.addRow();

    const result = await sendAnnouncement(row.id);

    expect(result).toMatchObject({ ok: true, recorded: true });
    expect(db.get(row.id)?.status).toBe("sent");
    expect(db.get(row.id)?.line_request_id).toBe("r".repeat(100));
  });
});

describe("sendAnnouncement: 送信失敗", () => {
  it("LINE APIがエラーを返したら failed にし、sent_atはnull、error_messageに日本語の理由を保存する", async () => {
    mockBroadcastWithHttpInfo.mockRejectedValue(
      lineError(429, JSON.stringify({ message: "You have reached your monthly limit." }), {
        "x-line-request-id": "req-failed-1",
      }),
    );
    const row = db.addRow();

    const result = await sendAnnouncement(row.id);

    expect(result).toMatchObject({ ok: false, reason: "line_error", recorded: true });
    const saved = db.get(row.id);
    expect(saved?.status).toBe("failed");
    expect(saved?.sent_at).toBeNull();
    expect(saved?.sending_started_at).not.toBeNull();
    expect(saved?.line_request_id).toBe("req-failed-1");
    expect(saved?.error_message).toContain("送信上限");
    expect(saved?.error_message).toContain("HTTP 429: You have reached your monthly limit.");
    expect(result.ok === false && result.message).toBe(saved?.error_message);
  });

  it.each([
    [400, "受け付けられませんでした"],
    [401, "認証に失敗"],
    [403, "認証に失敗"],
    [500, "一時的なエラー"],
    [503, "一時的なエラー"],
    [418, "配信依頼に失敗"],
  ])("HTTP %i のエラーを分かりやすい日本語で保存する", async (status, expected) => {
    mockBroadcastWithHttpInfo.mockRejectedValue(lineError(status, "{}"));
    const row = db.addRow();

    await sendAnnouncement(row.id);

    expect(db.get(row.id)?.status).toBe("failed");
    expect(db.get(row.id)?.error_message).toContain(expected);
    expect(db.get(row.id)?.error_message).toContain(`HTTP ${status}`);
  });

  it("通信エラー(レスポンス無し)は「配信されたか不明」として failed にする", async () => {
    mockBroadcastWithHttpInfo.mockRejectedValue(new TypeError("fetch failed"));
    const row = db.addRow();

    const result = await sendAnnouncement(row.id);

    expect(result).toMatchObject({ ok: false, reason: "line_error" });
    expect(db.get(row.id)?.status).toBe("failed");
    expect(db.get(row.id)?.error_message).toContain("配信されたかどうか分からない");
    expect(db.get(row.id)?.error_message).not.toContain("fetch failed");
  });

  it("アクセストークン未設定なら LINE APIを呼ばずに failed にする", async () => {
    mockGetLineClient.mockImplementation(() => {
      throw new Error("LINE_CHANNEL_ACCESS_TOKEN must be set in the environment.");
    });
    const row = db.addRow();

    await sendAnnouncement(row.id);

    expect(mockBroadcastWithHttpInfo).not.toHaveBeenCalled();
    expect(db.get(row.id)?.status).toBe("failed");
    expect(db.get(row.id)?.error_message).toContain("アクセストークン");
  });

  it("error_messageが500文字を超える場合は500文字以内に切り詰めて保存する(DB制約違反にしない)", async () => {
    mockBroadcastWithHttpInfo.mockRejectedValue(
      lineError(400, JSON.stringify({ message: "x".repeat(2000) })),
    );
    const row = db.addRow();

    const result = await sendAnnouncement(row.id);

    expect(result).toMatchObject({ ok: false, reason: "line_error", recorded: true });
    const saved = db.get(row.id);
    expect(saved?.status).toBe("failed");
    expect(saved?.error_message?.length).toBeLessThanOrEqual(500);
  });

  it("失敗時のrequest IDも100文字以内に切り詰めて保存する", async () => {
    mockBroadcastWithHttpInfo.mockRejectedValue(
      lineError(500, "{}", { "x-line-request-id": "f".repeat(300) }),
    );
    const row = db.addRow();

    await sendAnnouncement(row.id);

    expect(db.get(row.id)?.status).toBe("failed");
    expect(db.get(row.id)?.line_request_id).toBe("f".repeat(100));
  });

  it("LINEのエラー本文にトークンが含まれていても、保存値・戻り値・ログに秘密情報を出さない", async () => {
    mockBroadcastWithHttpInfo.mockRejectedValue(
      lineError(
        401,
        JSON.stringify({ message: `Invalid token ${SECRET_TOKEN} / Authorization: Bearer ${SECRET_TOKEN}` }),
      ),
    );
    const row = db.addRow();

    const result = await sendAnnouncement(row.id);

    const saved = db.get(row.id);
    expect(saved?.status).toBe("failed");
    expect(saved?.error_message).not.toContain(SECRET_TOKEN);
    expect(saved?.error_message).toContain("[REDACTED]");
    expect(JSON.stringify(result)).not.toContain(SECRET_TOKEN);
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(SECRET_TOKEN);
  });

  it("JSONでないエラー本文(HTML等)は保存しない", async () => {
    mockBroadcastWithHttpInfo.mockRejectedValue(lineError(502, "<html>Bad Gateway secret-ish</html>"));
    const row = db.addRow();

    await sendAnnouncement(row.id);

    expect(db.get(row.id)?.error_message).not.toContain("<html>");
    expect(db.get(row.id)?.error_message).toContain("HTTP 502");
  });
});

describe("sendAnnouncement: failedからの再試行", () => {
  it("failedは再送でき、retry_keyは前回と同じ値を使う(新しく生成しない)", async () => {
    mockBroadcastWithHttpInfo.mockRejectedValueOnce(lineError(500, "{}"));
    const row = db.addRow();

    const first = await sendAnnouncement(row.id);
    expect(first.ok).toBe(false);
    expect(db.get(row.id)?.status).toBe("failed");

    const second = await sendAnnouncement(row.id);

    expect(second).toMatchObject({ ok: true, recorded: true });
    expect(mockBroadcastWithHttpInfo).toHaveBeenCalledTimes(2);
    expect(mockBroadcastWithHttpInfo.mock.calls[0][1]).toBe(row.retry_key);
    expect(mockBroadcastWithHttpInfo.mock.calls[1][1]).toBe(row.retry_key);
    const saved = db.get(row.id);
    expect(saved?.retry_key).toBe(row.retry_key);
    expect(saved?.status).toBe("sent");
    expect(saved?.error_message).toBeNull();
    expect(db.updates.map((update) => update.status)).toEqual(["sending", "failed", "sending", "sent"]);
  });

  it("前回の送信が実はLINEに受け付けられていた場合(409)は、受付済みとしてsentにする", async () => {
    mockBroadcastWithHttpInfo.mockRejectedValueOnce(new TypeError("fetch failed"));
    mockBroadcastWithHttpInfo.mockRejectedValueOnce(
      lineError(409, JSON.stringify({ message: "The retry key is already accepted" }), {
        "x-line-request-id": "req-retry",
        "x-line-accepted-request-id": "req-original",
      }),
    );
    const row = db.addRow();

    await sendAnnouncement(row.id);
    const result = await sendAnnouncement(row.id);

    expect(result).toEqual({
      ok: true,
      lineRequestId: "req-original",
      alreadyAccepted: true,
      recorded: true,
    });
    expect(db.get(row.id)?.status).toBe("sent");
    expect(db.get(row.id)?.line_request_id).toBe("req-original");
  });

  it("作成から23時間を過ぎたfailedは再送しない(LINEのretry key失効後の二重配信を防ぐ)", async () => {
    const row = db.addRow({
      status: "failed",
      created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      sending_started_at: new Date(Date.now() - 23.5 * 60 * 60 * 1000).toISOString(),
      error_message: "前回のエラー",
    });

    const result = await sendAnnouncement(row.id);

    expect(result).toMatchObject({ ok: false, reason: "expired" });
    expect(mockBroadcastWithHttpInfo).not.toHaveBeenCalled();
    expect(db.get(row.id)?.status).toBe("failed");
  });

  it("作成から23時間を過ぎたdraftも送信しない", async () => {
    const row = db.addRow({ created_at: new Date(Date.now() - 23.5 * 60 * 60 * 1000).toISOString() });

    const result = await sendAnnouncement(row.id);

    expect(result).toMatchObject({ ok: false, reason: "expired" });
    expect(mockBroadcastWithHttpInfo).not.toHaveBeenCalled();
    expect(db.updates).toEqual([]);
  });
});

describe("sendAnnouncement: 二重配信の防止", () => {
  it("sentのお知らせは再送しない", async () => {
    const row = db.addRow({
      status: "sent",
      sending_started_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
    });

    const result = await sendAnnouncement(row.id);

    expect(result).toMatchObject({ ok: false, reason: "already_sent" });
    expect(mockBroadcastWithHttpInfo).not.toHaveBeenCalled();
    expect(db.updates).toEqual([]);
  });

  it("sendingのお知らせは再実行しない", async () => {
    const row = db.addRow({ status: "sending", sending_started_at: new Date().toISOString() });

    const result = await sendAnnouncement(row.id);

    expect(result).toMatchObject({ ok: false, reason: "already_sending" });
    expect(mockBroadcastWithHttpInfo).not.toHaveBeenCalled();
    expect(db.updates).toEqual([]);
  });

  it("同じお知らせを同時に2回実行しても、LINE APIを呼ぶのは1回だけ", async () => {
    const row = db.addRow();

    const results = await Promise.all([sendAnnouncement(row.id), sendAnnouncement(row.id)]);

    expect(mockBroadcastWithHttpInfo).toHaveBeenCalledTimes(1);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const rejected = results.find((result) => !result.ok);
    expect(rejected).toBeDefined();
    expect(["conflict", "already_sending"]).toContain(rejected?.ok === false && rejected.reason);
    expect(db.get(row.id)?.status).toBe("sent");
  });

  it("送信中(LINE API呼び出し中)に再実行されても拒否する", async () => {
    const row = db.addRow();
    let nested: Awaited<ReturnType<typeof sendAnnouncement>> | undefined;
    mockBroadcastWithHttpInfo.mockImplementationOnce(async () => {
      nested = await sendAnnouncement(row.id);
      return lineSuccess();
    });

    const result = await sendAnnouncement(row.id);

    expect(result.ok).toBe(true);
    expect(nested).toMatchObject({ ok: false, reason: "already_sending" });
    expect(mockBroadcastWithHttpInfo).toHaveBeenCalledTimes(1);
  });

  it("事前確認の後に別の処理が先に送信を始めた場合は、条件付きUPDATEで拒否する", async () => {
    const row = db.addRow();
    // 事前確認(select)でdraftと読まれた直後、UPDATEの前に別の処理がsendingへ遷移させた状況を再現する。
    db.afterOperation = (operation) => {
      if (operation === "select") {
        Object.assign(db.get(row.id) ?? {}, {
          status: "sending",
          sending_started_at: new Date().toISOString(),
        });
        db.afterOperation = null;
      }
    };

    const result = await sendAnnouncement(row.id);

    expect(result).toMatchObject({ ok: false, reason: "conflict" });
    expect(mockBroadcastWithHttpInfo).not.toHaveBeenCalled();
  });
});

describe("sendAnnouncement: 入力・存在確認", () => {
  it("uuidの形でないIDはDBに問い合わせずに拒否する", async () => {
    const result = await sendAnnouncement("not-a-uuid");

    expect(result).toMatchObject({ ok: false, reason: "invalid_id" });
    expect(mockBroadcastWithHttpInfo).not.toHaveBeenCalled();
  });

  it("存在しないお知らせは拒否する", async () => {
    const result = await sendAnnouncement("00000000-0000-4000-8000-000000000000");

    expect(result).toMatchObject({ ok: false, reason: "not_found" });
    expect(mockBroadcastWithHttpInfo).not.toHaveBeenCalled();
  });

  it.each([
    ["空文字", ""],
    ["半角空白のみ", "   "],
    ["全角空白・改行のみ", "\u3000\n\t\u3000"],
    ["1000文字超過", "あ".repeat(1001)],
  ])("本文が%sの場合は送信しない", async (_label, body) => {
    // DB制約を通らない値も含むため、偽DBへ直接書き込んで「保存済みの不正本文」を再現する。
    const row = db.addRow();
    Object.assign(row, { body });

    const result = await sendAnnouncement(row.id);

    expect(result).toMatchObject({ ok: false, reason: "invalid_body" });
    expect(mockBroadcastWithHttpInfo).not.toHaveBeenCalled();
    expect(db.get(row.id)?.status).toBe("draft");
  });

  it("本文がちょうど1000文字なら送信できる", async () => {
    const row = db.addRow({ body: "あ".repeat(1000) });

    const result = await sendAnnouncement(row.id);

    expect(result.ok).toBe(true);
  });
});

describe("sendAnnouncement: 認証", () => {
  it("未認証なら requireAdmin() が止め、DBにもLINE APIにも触れない", async () => {
    const redirectError = new Error("NEXT_REDIRECT");
    mockRequireAdmin.mockRejectedValue(redirectError);
    const row = db.addRow();
    const select = vi.spyOn(db, "client");

    await expect(sendAnnouncement(row.id)).rejects.toBe(redirectError);

    expect(select).not.toHaveBeenCalled();
    expect(mockBroadcastWithHttpInfo).not.toHaveBeenCalled();
    expect(db.get(row.id)?.status).toBe("draft");
  });
});

describe("sendAnnouncement: DBエラー", () => {
  it("sending遷移のUPDATEが失敗したら LINE APIを呼ばない", async () => {
    db.failWhen = (operation, payload) => operation === "update" && payload?.status === "sending";
    const row = db.addRow();

    const result = await sendAnnouncement(row.id);

    expect(result).toMatchObject({ ok: false, reason: "db_error" });
    expect(mockBroadcastWithHttpInfo).not.toHaveBeenCalled();
    expect(db.get(row.id)?.status).toBe("draft");
  });

  it("配信成功後にsent記録が失敗しても成功として返し、行はsendingのまま(再送禁止)にする", async () => {
    db.failWhen = (operation, payload) => operation === "update" && payload?.status === "sent";
    const row = db.addRow();

    const result = await sendAnnouncement(row.id);

    expect(result).toMatchObject({ ok: true, recorded: false });
    expect(db.get(row.id)?.status).toBe("sending");

    db.failWhen = null;
    const retry = await sendAnnouncement(row.id);
    expect(retry).toMatchObject({ ok: false, reason: "already_sending" });
    expect(mockBroadcastWithHttpInfo).toHaveBeenCalledTimes(1);
  });

  it("failed記録が失敗した場合は recorded=false を返す(行はsendingのまま)", async () => {
    mockBroadcastWithHttpInfo.mockRejectedValue(lineError(500, "{}"));
    db.failWhen = (operation, payload) => operation === "update" && payload?.status === "failed";
    const row = db.addRow();

    const result = await sendAnnouncement(row.id);

    expect(result).toMatchObject({ ok: false, reason: "line_error", recorded: false });
    expect(db.get(row.id)?.status).toBe("sending");
  });
});
