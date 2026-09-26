import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAnnouncementsDb } from "./fake-announcements-db";

// 実LINE APIには絶対に送らない: LINEクライアントは常にモックに差し替える(Push・Broadcastとも)。
const mockPushMessage = vi.fn();
const mockBroadcastWithHttpInfo = vi.fn();
const mockGetLineClient = vi.fn(() => ({
  pushMessage: mockPushMessage,
  broadcastWithHttpInfo: mockBroadcastWithHttpInfo,
}));
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

import { sendTestAnnouncementToOwner } from "@/lib/admin/send-test-announcement";

const OWNER_ID = "Uowner0123456789abcdef0123456789ab";

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  db = new FakeAnnouncementsDb();
  mockPushMessage.mockReset();
  mockPushMessage.mockResolvedValue({ sentMessages: [] });
  mockBroadcastWithHttpInfo.mockReset();
  mockGetLineClient.mockClear();
  mockRequireAdmin.mockReset();
  mockRequireAdmin.mockResolvedValue(undefined);
  vi.stubEnv("OWNER_LINE_USER_ID", OWNER_ID);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  consoleErrorSpy.mockRestore();
});

describe("sendTestAnnouncementToOwner", () => {
  it("OWNER_LINE_USER_IDの1人だけにPushでテキスト1件を送り、Broadcastは呼ばない", async () => {
    const row = db.addRow({ body: "来週は臨時休業です。" });

    const result = await sendTestAnnouncementToOwner(row.id);

    expect(result).toEqual({ ok: true, message: "管理者のLINEへテスト送信しました。" });
    expect(mockPushMessage).toHaveBeenCalledTimes(1);
    expect(mockPushMessage).toHaveBeenCalledWith({
      to: OWNER_ID,
      messages: [{ type: "text", text: "来週は臨時休業です。" }],
    });
    expect(mockBroadcastWithHttpInfo).not.toHaveBeenCalled();
  });

  it("テスト送信してもお知らせの行(status・retry_key・日時)を一切変更しない", async () => {
    const row = db.addRow();
    const before = { ...row };

    await sendTestAnnouncementToOwner(row.id);
    await sendTestAnnouncementToOwner(row.id);

    expect(db.get(row.id)).toEqual(before);
    expect(db.get(row.id)?.status).toBe("draft");
    expect(db.get(row.id)?.retry_key).toBe(before.retry_key);
    expect(db.updates).toEqual([]);
  });

  it("failed(期間内)のお知らせもテスト送信でき、状態はfailedのまま", async () => {
    const row = db.addRow({
      status: "failed",
      sending_started_at: new Date().toISOString(),
      error_message: "前回の失敗",
    });

    const result = await sendTestAnnouncementToOwner(row.id);

    expect(result.ok).toBe(true);
    expect(db.get(row.id)?.status).toBe("failed");
    expect(db.get(row.id)?.error_message).toBe("前回の失敗");
  });

  it("OWNER_LINE_USER_ID未設定ならLINEへ送らず、分かりやすいエラーを返す", async () => {
    vi.stubEnv("OWNER_LINE_USER_ID", "");
    const row = db.addRow();

    const result = await sendTestAnnouncementToOwner(row.id);

    expect(result).toMatchObject({ ok: false, reason: "owner_not_configured" });
    expect(result.ok === false && result.message).toContain("テスト送信先（管理者のLINE）が設定されていない");
    expect(mockPushMessage).not.toHaveBeenCalled();
    expect(mockBroadcastWithHttpInfo).not.toHaveBeenCalled();
  });

  it("OWNER_LINE_USER_IDが空白のみでも未設定として扱う", async () => {
    vi.stubEnv("OWNER_LINE_USER_ID", "   ");
    const row = db.addRow();

    expect(await sendTestAnnouncementToOwner(row.id)).toMatchObject({ reason: "owner_not_configured" });
    expect(mockPushMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["sent", { status: "sent" as const, sending_started_at: new Date().toISOString(), sent_at: new Date().toISOString() }],
    ["sending", { status: "sending" as const, sending_started_at: new Date().toISOString() }],
    ["期限切れdraft", { created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }],
  ])("%s のお知らせはテスト送信しない", async (_label, overrides) => {
    const row = db.addRow(overrides);

    const result = await sendTestAnnouncementToOwner(row.id);

    expect(result).toMatchObject({ ok: false, reason: "not_sendable" });
    expect(mockPushMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["空文字", ""],
    ["空白のみ", "  \n "],
    ["1001文字", "あ".repeat(1001)],
  ])("本文が%sなら送信しない(本番配信と同じ検証)", async (_label, body) => {
    const row = db.addRow();
    Object.assign(row, { body });

    const result = await sendTestAnnouncementToOwner(row.id);

    expect(result).toMatchObject({ ok: false, reason: "invalid_body" });
    expect(mockPushMessage).not.toHaveBeenCalled();
  });

  it("本文1000文字は送信できる", async () => {
    const row = db.addRow({ body: "あ".repeat(1000) });

    expect(await sendTestAnnouncementToOwner(row.id)).toMatchObject({ ok: true });
  });

  it("Push失敗時は日本語のエラーを返し、宛先IDを戻り値・ログに出さない", async () => {
    mockPushMessage.mockRejectedValue(new Error(`push to ${OWNER_ID} failed`));
    const row = db.addRow();

    const result = await sendTestAnnouncementToOwner(row.id);

    expect(result).toMatchObject({ ok: false, reason: "push_failed" });
    expect(JSON.stringify(result)).not.toContain(OWNER_ID);
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(OWNER_ID);
    expect(db.get(row.id)?.status).toBe("draft");
  });

  it("成功時の戻り値にも宛先IDを含めない", async () => {
    const row = db.addRow();

    expect(JSON.stringify(await sendTestAnnouncementToOwner(row.id))).not.toContain(OWNER_ID);
  });

  it("uuidでないID・存在しないIDは送信しない", async () => {
    expect(await sendTestAnnouncementToOwner("x")).toMatchObject({ reason: "invalid_id" });
    expect(
      await sendTestAnnouncementToOwner("00000000-0000-4000-8000-000000000000"),
    ).toMatchObject({ reason: "not_found" });
    expect(mockPushMessage).not.toHaveBeenCalled();
  });

  it("DBエラーなら送信しない", async () => {
    db.failWhen = () => true;
    const row = db.addRow();

    expect(await sendTestAnnouncementToOwner(row.id)).toMatchObject({ reason: "db_error" });
    expect(mockPushMessage).not.toHaveBeenCalled();
  });

  it("未認証ならDBにもLINEにも触れない", async () => {
    const redirectError = new Error("NEXT_REDIRECT");
    mockRequireAdmin.mockRejectedValue(redirectError);
    const row = db.addRow();
    const client = vi.spyOn(db, "client");

    await expect(sendTestAnnouncementToOwner(row.id)).rejects.toBe(redirectError);
    expect(client).not.toHaveBeenCalled();
    expect(mockPushMessage).not.toHaveBeenCalled();
  });
});
