import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALREADY_ACCEPTED_MESSAGE,
  BROADCAST_CONFIRMATION,
  SENT_MESSAGE,
  TEST_SEND_CONFIRMATION,
  UNRECORDED_SUCCESS_MESSAGE,
} from "@/lib/admin/announcement-policy";

const callOrder: string[] = [];

const mockRequireAdmin = vi.fn(async () => {
  callOrder.push("requireAdmin");
});
vi.mock("@/lib/admin/auth", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

const mockCreateAnnouncementDraft = vi.fn();
vi.mock("@/lib/admin/announcement-repository", () => ({
  createAnnouncementDraft: (body: string) => mockCreateAnnouncementDraft(body),
}));

const mockSendAnnouncement = vi.fn();
vi.mock("@/lib/admin/send-announcement", () => ({
  sendAnnouncement: (id: string) => {
    callOrder.push("sendAnnouncement");
    return mockSendAnnouncement(id);
  },
}));

const mockSendTestAnnouncementToOwner = vi.fn();
vi.mock("@/lib/admin/send-test-announcement", () => ({
  sendTestAnnouncementToOwner: (id: string) => mockSendTestAnnouncementToOwner(id),
}));

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}
const mockRedirect = vi.fn((url: string) => {
  throw new RedirectError(url);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
  unstable_rethrow: (error: unknown) => {
    if (error instanceof RedirectError) throw error;
  },
}));

import {
  createAnnouncementDraftAction,
  sendAnnouncementAction,
  sendTestAnnouncementAction,
} from "@/app/admin/(protected)/announcements/actions";

const ID = "00000000-0000-4000-8000-000000000001";

function form(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

/** Server Actionを実行し、redirect先のクエリ(flash)を返す。 */
async function runRedirecting(action: () => Promise<unknown>): Promise<URLSearchParams> {
  try {
    await action();
  } catch (error) {
    if (error instanceof RedirectError) {
      const url = new URL(error.url, "https://example.com");
      expect(url.pathname).toBe("/admin/announcements");
      return url.searchParams;
    }
    throw error;
  }
  throw new Error("expected redirect");
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  callOrder.length = 0;
  mockRequireAdmin.mockClear();
  mockCreateAnnouncementDraft.mockReset();
  mockSendAnnouncement.mockReset();
  mockSendTestAnnouncementToOwner.mockReset();
  mockRedirect.mockClear();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("認証", () => {
  it.each([
    ["createAnnouncementDraftAction", () => createAnnouncementDraftAction(null, form({ body: "本文" }))],
    [
      "sendAnnouncementAction",
      () => sendAnnouncementAction(form({ id: ID, confirmation: BROADCAST_CONFIRMATION })),
    ],
    [
      "sendTestAnnouncementAction",
      () => sendTestAnnouncementAction(form({ id: ID, confirmation: TEST_SEND_CONFIRMATION })),
    ],
  ])("%s は未認証なら何もしない", async (_name, action) => {
    const loginRedirect = new RedirectError("/admin/login");
    mockRequireAdmin.mockRejectedValueOnce(loginRedirect);

    await expect(action()).rejects.toBe(loginRedirect);
    expect(mockCreateAnnouncementDraft).not.toHaveBeenCalled();
    expect(mockSendAnnouncement).not.toHaveBeenCalled();
    expect(mockSendTestAnnouncementToOwner).not.toHaveBeenCalled();
  });
});

describe("createAnnouncementDraftAction", () => {
  it("本文を検証して下書きを保存し、成功メッセージを表示する", async () => {
    mockCreateAnnouncementDraft.mockResolvedValue({});

    const flash = await runRedirecting(() =>
      createAnnouncementDraftAction(null, form({ body: "今月のキャンペーン" })),
    );

    expect(mockCreateAnnouncementDraft).toHaveBeenCalledWith("今月のキャンペーン");
    expect(flash.get("success")).toBe("下書きを保存しました。");
    expect(flash.get("saved")).toMatch(/^\d+$/);
  });

  it.each([
    ["空文字", "", "本文を入力してください。"],
    ["空白のみ", " \n\u3000 ", "本文を入力してください。"],
    ["1001文字", "あ".repeat(1001), "本文は1000文字以内で入力してください。"],
  ])("%sは保存しない", async (_label, body, message) => {
    const state = await createAnnouncementDraftAction(null, form({ body }));

    expect(state).toEqual({ error: message });
    expect(mockCreateAnnouncementDraft).not.toHaveBeenCalled();
  });

  it("本文フィールドが無い場合も保存しない", async () => {
    expect(await createAnnouncementDraftAction(null, new FormData())).toEqual({
      error: "本文を入力してください。",
    });
  });

  it("1000文字ちょうどは保存できる", async () => {
    mockCreateAnnouncementDraft.mockResolvedValue({});

    await runRedirecting(() => createAnnouncementDraftAction(null, form({ body: "あ".repeat(1000) })));

    expect(mockCreateAnnouncementDraft).toHaveBeenCalledWith("あ".repeat(1000));
  });

  it("保存に失敗したら入力を残したままエラーを返す", async () => {
    mockCreateAnnouncementDraft.mockRejectedValue(new Error("db down"));

    expect(await createAnnouncementDraftAction(null, form({ body: "本文" }))).toEqual({
      error: "保存に失敗しました。時間をおいて再度お試しください。",
    });
  });

  it("下書き保存ではLINEへ何も送らない", async () => {
    mockCreateAnnouncementDraft.mockResolvedValue({});

    await runRedirecting(() => createAnnouncementDraftAction(null, form({ body: "本文" })));

    expect(mockSendAnnouncement).not.toHaveBeenCalled();
    expect(mockSendTestAnnouncementToOwner).not.toHaveBeenCalled();
  });
});

describe("sendAnnouncementAction(配信前確認)", () => {
  it("確認ダイアログの値が無い送信は、配信せずに拒否する", async () => {
    const flash = await runRedirecting(() => sendAnnouncementAction(form({ id: ID })));

    expect(mockSendAnnouncement).not.toHaveBeenCalled();
    expect(flash.get("error")).toContain("確認画面から操作してください");
  });

  it("テスト送信用の確認値では本番配信しない", async () => {
    await runRedirecting(() =>
      sendAnnouncementAction(form({ id: ID, confirmation: TEST_SEND_CONFIRMATION })),
    );

    expect(mockSendAnnouncement).not.toHaveBeenCalled();
  });

  it("IDが無い送信は拒否する", async () => {
    await runRedirecting(() => sendAnnouncementAction(form({ confirmation: BROADCAST_CONFIRMATION })));

    expect(mockSendAnnouncement).not.toHaveBeenCalled();
  });

  it("確認済みなら requireAdmin の後に sendAnnouncement(id) を1回だけ呼ぶ", async () => {
    mockSendAnnouncement.mockResolvedValue({ ok: true, lineRequestId: "r", alreadyAccepted: false, recorded: true });

    const flash = await runRedirecting(() =>
      sendAnnouncementAction(form({ id: ID, confirmation: BROADCAST_CONFIRMATION })),
    );

    expect(mockSendAnnouncement).toHaveBeenCalledTimes(1);
    expect(mockSendAnnouncement).toHaveBeenCalledWith(ID);
    expect(callOrder).toEqual(["requireAdmin", "sendAnnouncement"]);
    expect(flash.get("success")).toBe(SENT_MESSAGE);
    // 配信では入力中の新しいお知らせを消さない(入力欄の初期化はsavedのときだけ)。
    expect(flash.get("saved")).toBeNull();
  });

  it("alreadyAccepted:true を画面に伝える", async () => {
    mockSendAnnouncement.mockResolvedValue({ ok: true, lineRequestId: "r", alreadyAccepted: true, recorded: true });

    const flash = await runRedirecting(() =>
      sendAnnouncementAction(form({ id: ID, confirmation: BROADCAST_CONFIRMATION })),
    );

    expect(flash.get("success")).toBe(ALREADY_ACCEPTED_MESSAGE);
  });

  it("recorded:false は失敗ではなく警告として表示する", async () => {
    mockSendAnnouncement.mockResolvedValue({ ok: true, lineRequestId: null, alreadyAccepted: false, recorded: false });

    const flash = await runRedirecting(() =>
      sendAnnouncementAction(form({ id: ID, confirmation: BROADCAST_CONFIRMATION })),
    );

    expect(flash.get("warning")).toBe(UNRECORDED_SUCCESS_MESSAGE);
    expect(flash.get("error")).toBeNull();
    expect(flash.get("success")).toBeNull();
  });

  it.each([
    ["already_sent", "このお知らせは配信済みです。"],
    ["already_sending", "このお知らせは配信処理中です。"],
    ["expired", "送信できません"],
  ])("sendAnnouncementが %s で拒否した場合はそのメッセージを表示する", async (reason, message) => {
    mockSendAnnouncement.mockResolvedValue({ ok: false, reason, message });

    const flash = await runRedirecting(() =>
      sendAnnouncementAction(form({ id: ID, confirmation: BROADCAST_CONFIRMATION })),
    );

    expect(flash.get("error")).toContain(message);
  });

  it("LINEエラーは「送信に失敗しました。」と理由を表示する", async () => {
    mockSendAnnouncement.mockResolvedValue({
      ok: false,
      reason: "line_error",
      message: "LINE側で一時的なエラーが発生しました。",
      recorded: true,
    });

    const flash = await runRedirecting(() =>
      sendAnnouncementAction(form({ id: ID, confirmation: BROADCAST_CONFIRMATION })),
    );

    expect(flash.get("error")).toBe("送信に失敗しました。LINE側で一時的なエラーが発生しました。");
  });

  it("想定外の例外でも再送を促さず、状態確認を案内する", async () => {
    mockSendAnnouncement.mockRejectedValue(new Error("boom"));

    const flash = await runRedirecting(() =>
      sendAnnouncementAction(form({ id: ID, confirmation: BROADCAST_CONFIRMATION })),
    );

    expect(flash.get("warning")).toContain("配信状況を確認できませんでした。");
  });
});

describe("sendTestAnnouncementAction(テスト送信前確認)", () => {
  it("確認ダイアログの値が無い送信は拒否する", async () => {
    const flash = await runRedirecting(() => sendTestAnnouncementAction(form({ id: ID })));

    expect(mockSendTestAnnouncementToOwner).not.toHaveBeenCalled();
    expect(flash.get("error")).toContain("確認画面から操作してください");
  });

  it("本番配信用の確認値ではテスト送信しない", async () => {
    await runRedirecting(() =>
      sendTestAnnouncementAction(form({ id: ID, confirmation: BROADCAST_CONFIRMATION })),
    );

    expect(mockSendTestAnnouncementToOwner).not.toHaveBeenCalled();
  });

  it("確認済みならIDだけを渡してテスト送信し、本番配信は呼ばない(宛先はブラウザから受け取らない)", async () => {
    mockSendTestAnnouncementToOwner.mockResolvedValue({
      ok: true,
      message: "管理者のLINEへテスト送信しました。",
    });

    const flash = await runRedirecting(() =>
      sendTestAnnouncementAction(
        form({ id: ID, confirmation: TEST_SEND_CONFIRMATION, to: "Uattacker", ownerLineUserId: "Uattacker" }),
      ),
    );

    expect(mockSendTestAnnouncementToOwner).toHaveBeenCalledWith(ID);
    expect(mockSendTestAnnouncementToOwner.mock.calls[0]).toHaveLength(1);
    expect(mockSendAnnouncement).not.toHaveBeenCalled();
    expect(flash.get("success")).toBe("管理者のLINEへテスト送信しました。");
    expect(flash.get("saved")).toBeNull();
  });

  it("失敗時はテスト送信のメッセージを表示する", async () => {
    mockSendTestAnnouncementToOwner.mockResolvedValue({
      ok: false,
      reason: "owner_not_configured",
      message: "テスト送信先（管理者のLINE）が設定されていないため、送信できませんでした。",
    });

    const flash = await runRedirecting(() =>
      sendTestAnnouncementAction(form({ id: ID, confirmation: TEST_SEND_CONFIRMATION })),
    );

    expect(flash.get("error")).toContain("テスト送信先（管理者のLINE）が設定されていない");
  });

  it("想定外の例外は「送信に失敗しました。」と表示する", async () => {
    mockSendTestAnnouncementToOwner.mockRejectedValue(new Error("boom"));

    const flash = await runRedirecting(() =>
      sendTestAnnouncementAction(form({ id: ID, confirmation: TEST_SEND_CONFIRMATION })),
    );

    expect(flash.get("error")).toContain("送信に失敗しました。");
  });
});
