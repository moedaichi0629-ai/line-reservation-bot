import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAnnouncementsDb } from "./fake-announcements-db";

const mockRequireAdmin = vi.fn(async () => {});
vi.mock("@/lib/admin/auth", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

let db: FakeAnnouncementsDb;
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => db.client(),
}));

import {
  claimAnnouncementForSending,
  createAnnouncementDraft,
  getAnnouncementById,
  listAnnouncementsForAdmin,
  markAnnouncementFailed,
  markAnnouncementSent,
} from "@/lib/admin/announcement-repository";

beforeEach(() => {
  db = new FakeAnnouncementsDb();
  mockRequireAdmin.mockReset();
  mockRequireAdmin.mockResolvedValue(undefined);
});

describe("認証", () => {
  it.each([
    ["createAnnouncementDraft", () => createAnnouncementDraft("本文")],
    ["getAnnouncementById", () => getAnnouncementById("id")],
    ["listAnnouncementsForAdmin", () => listAnnouncementsForAdmin()],
    ["claimAnnouncementForSending", () => claimAnnouncementForSending("id")],
    ["markAnnouncementSent", () => markAnnouncementSent("id", null)],
    ["markAnnouncementFailed", () => markAnnouncementFailed("id", "失敗", null)],
  ])("%s は未認証ならDBに触れずに止まる", async (_name, call) => {
    const redirectError = new Error("NEXT_REDIRECT");
    mockRequireAdmin.mockRejectedValue(redirectError);
    const client = vi.spyOn(db, "client");

    await expect(call()).rejects.toBe(redirectError);
    expect(client).not.toHaveBeenCalled();
  });
});

describe("createAnnouncementDraft", () => {
  it("draftとして作成し、retry_keyはDBの既定値に任せる", async () => {
    const created = await createAnnouncementDraft("本文");

    expect(created.status).toBe("draft");
    expect(created.body).toBe("本文");
    expect(created.retry_key).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.sending_started_at).toBeNull();
    expect(created.sent_at).toBeNull();
  });

  it("DBエラーなら例外を投げる", async () => {
    db.failWhen = (operation) => operation === "insert";

    await expect(createAnnouncementDraft("本文")).rejects.toThrow("Failed to create announcement");
  });
});

describe("claimAnnouncementForSending(条件付きUPDATE)", () => {
  it("draftをsendingにし、同じretry_keyを返す", async () => {
    const row = db.addRow();

    const claimed = await claimAnnouncementForSending(row.id);

    expect(claimed).toEqual({ id: row.id, body: row.body, retry_key: row.retry_key });
    expect(db.get(row.id)?.status).toBe("sending");
  });

  it("failedをsendingにし、前回のエラー・request IDを消す(retry_keyは変えない)", async () => {
    const row = db.addRow({
      status: "failed",
      sending_started_at: new Date(Date.now() - 60_000).toISOString(),
      error_message: "前回のエラー",
      line_request_id: "req-old",
    });

    const claimed = await claimAnnouncementForSending(row.id);

    expect(claimed?.retry_key).toBe(row.retry_key);
    const saved = db.get(row.id);
    expect(saved?.status).toBe("sending");
    expect(saved?.error_message).toBeNull();
    expect(saved?.line_request_id).toBeNull();
    expect(saved?.retry_key).toBe(row.retry_key);
    expect(Date.parse(saved?.sending_started_at ?? "")).toBeGreaterThan(Date.parse(row.sending_started_at ?? ""));
  });

  it.each([
    ["sent", { status: "sent" as const, sending_started_at: new Date().toISOString(), sent_at: new Date().toISOString() }],
    ["sending", { status: "sending" as const, sending_started_at: new Date().toISOString() }],
  ])("%s の行は(事前チェックを経由しなくても)DB側の条件で遷移させない", async (_label, overrides) => {
    const row = db.addRow(overrides);

    const claimed = await claimAnnouncementForSending(row.id);

    expect(claimed).toBeNull();
    expect(db.get(row.id)?.status).toBe(overrides.status);
    expect(db.updates).toEqual([]);
  });

  it("2回続けて呼んでも、sendingにできるのは最初の1回だけ", async () => {
    const row = db.addRow();

    const [first, second] = await Promise.all([
      claimAnnouncementForSending(row.id),
      claimAnnouncementForSending(row.id),
    ]);

    expect([first, second].filter((claimed) => claimed !== null)).toHaveLength(1);
  });

  it("送信可能期間(作成から23時間)を過ぎた行は遷移させない", async () => {
    const row = db.addRow({ created_at: new Date(Date.now() - 23.5 * 60 * 60 * 1000).toISOString() });

    expect(await claimAnnouncementForSending(row.id)).toBeNull();
    expect(db.get(row.id)?.status).toBe("draft");
  });

  it("DBエラーなら例外を投げる", async () => {
    db.failWhen = () => true;
    const row = db.addRow();

    await expect(claimAnnouncementForSending(row.id)).rejects.toThrow("Failed to start sending");
  });
});

describe("markAnnouncementSent / markAnnouncementFailed", () => {
  function sendingRow() {
    return db.addRow({ status: "sending", sending_started_at: new Date().toISOString() });
  }

  it("sendingの行だけをsentにする(draftの行は更新せず例外)", async () => {
    const draft = db.addRow();

    await expect(markAnnouncementSent(draft.id, "req")).rejects.toThrow("no longer sending");
    expect(db.get(draft.id)?.status).toBe("draft");
  });

  it("sendingの行だけをfailedにする(sentの行は上書きせず例外)", async () => {
    const sent = db.addRow({
      status: "sent",
      sending_started_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
    });

    await expect(markAnnouncementFailed(sent.id, "失敗", null)).rejects.toThrow("no longer sending");
    expect(db.get(sent.id)?.status).toBe("sent");
  });

  it("request IDを100文字に切り詰める", async () => {
    const row = sendingRow();

    await markAnnouncementSent(row.id, "a".repeat(101));

    expect(db.get(row.id)?.line_request_id).toBe("a".repeat(100));
  });

  it("error_messageを500文字以内に切り詰め、サロゲートペアを壊さない", async () => {
    const row = sendingRow();
    // 499文字目の後ろに絵文字(2コード単位)を置き、ちょうど境界をまたがせる。
    const message = `${"え".repeat(499)}😀${"お".repeat(100)}`;

    await markAnnouncementFailed(row.id, message, "b".repeat(200));

    const saved = db.get(row.id);
    expect(saved?.status).toBe("failed");
    expect(saved?.error_message).toBe("え".repeat(499));
    expect(saved?.line_request_id).toBe("b".repeat(100));
    expect(saved?.sent_at).toBeNull();
  });
});

describe("listAnnouncementsForAdmin", () => {
  it("新しい順に最大50件を返す", async () => {
    for (let i = 0; i < 55; i++) {
      db.addRow({ body: `お知らせ${i}`, created_at: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString() });
    }

    const result = await listAnnouncementsForAdmin();

    expect(result).toHaveLength(50);
    expect(result[0].body).toBe("お知らせ54");
    expect(result[49].body).toBe("お知らせ5");
  });

  it("DBエラーなら例外を投げる", async () => {
    db.failWhen = () => true;

    await expect(listAnnouncementsForAdmin()).rejects.toThrow("Failed to fetch announcements");
  });
});
