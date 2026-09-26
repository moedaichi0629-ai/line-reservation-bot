import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALREADY_ACCEPTED_MESSAGE,
  ANNOUNCEMENT_SEND_WINDOW_MS,
  EXPIRED_DRAFT_TEXT,
  EXPIRED_FAILED_TEXT,
  SENT_MESSAGE,
  STALE_SENDING_TEXT,
  STALE_SENDING_THRESHOLD_MS,
  UNRECORDED_FAILURE_MESSAGE,
  UNRECORDED_SUCCESS_MESSAGE,
  describeSendAnnouncementResult,
  getAnnouncementView,
  isStaleSending,
  isWithinSendWindow,
} from "@/lib/admin/announcement-policy";
import type { Announcement } from "@/types/database";

const NOW = new Date("2026-09-26T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

function announcement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    body: "本文",
    status: "draft",
    retry_key: "00000000-0000-4000-8000-000000000002",
    line_request_id: null,
    error_message: null,
    created_at: ago(HOUR),
    sending_started_at: null,
    sent_at: null,
    ...overrides,
  };
}

describe("定数", () => {
  it("送信可能期間はLINEのretry key有効期限(24時間)より短い23時間", () => {
    expect(ANNOUNCEMENT_SEND_WINDOW_MS).toBe(23 * HOUR);
  });

  it("sendingの警告は10分", () => {
    expect(STALE_SENDING_THRESHOLD_MS).toBe(10 * 60 * 1000);
  });

  it.each([
    ["お知らせ配信ページ", ["app", "admin", "(protected)", "announcements", "page.tsx"]],
    ["管理画面レイアウト", ["app", "admin", "(protected)", "layout.tsx"]],
  ])("警告までの時間は、%sのmaxDuration(Server Actionの最大実行時間)より十分長い", (_label, segments) => {
    const source = readFileSync(join(process.cwd(), ...segments), "utf8");
    const match = source.match(/^export const maxDuration = (\d+);\r?$/m);
    expect(match).not.toBeNull();
    const maxDurationMs = Number(match?.[1]) * 1000;
    expect(maxDurationMs).toBeGreaterThan(0);
    expect(STALE_SENDING_THRESHOLD_MS).toBeGreaterThanOrEqual(maxDurationMs * 5);
  });
});

describe("isWithinSendWindow", () => {
  it("作成からちょうど23時間までは期間内、それを過ぎたら期間外", () => {
    expect(isWithinSendWindow(ago(23 * HOUR), NOW)).toBe(true);
    expect(isWithinSendWindow(ago(23 * HOUR + 1), NOW)).toBe(false);
  });

  it("Supabaseのマイクロ秒付き形式も解釈できる", () => {
    expect(isWithinSendWindow("2026-09-26T11:00:00.123456+00:00", NOW)).toBe(true);
  });

  it("解釈できない日時は期間外(安全側)", () => {
    expect(isWithinSendWindow("not-a-date", NOW)).toBe(false);
  });
});

describe("isStaleSending", () => {
  it("sendingで10分以上経過したら警告対象", () => {
    expect(isStaleSending({ status: "sending", sending_started_at: ago(9 * 60 * 1000) }, NOW)).toBe(false);
    expect(isStaleSending({ status: "sending", sending_started_at: ago(10 * 60 * 1000) }, NOW)).toBe(true);
  });

  it("開始日時が無い・解釈できない場合も確認が必要として扱う", () => {
    expect(isStaleSending({ status: "sending", sending_started_at: null }, NOW)).toBe(true);
    expect(isStaleSending({ status: "sending", sending_started_at: "broken" }, NOW)).toBe(true);
  });

  it("sending以外は対象外", () => {
    expect(isStaleSending({ status: "failed", sending_started_at: ago(10 * HOUR) }, NOW)).toBe(false);
  });
});

describe("getAnnouncementView", () => {
  it("draft(期間内): 下書き、配信・テスト送信できる", () => {
    const view = getAnnouncementView(announcement(), NOW);
    expect(view).toEqual({
      statusLabel: "下書き",
      tone: "neutral",
      sendAction: "send",
      canTestSend: true,
      notices: [],
    });
  });

  it("draft(23時間超): 配信もテスト送信もできず、作り直しを案内する", () => {
    const view = getAnnouncementView(announcement({ created_at: ago(24 * HOUR) }), NOW);
    expect(view.sendAction).toBeNull();
    expect(view.canTestSend).toBe(false);
    expect(view.notices.map((notice) => notice.text)).toEqual([EXPIRED_DRAFT_TEXT]);
  });

  it("sent: 配信済み、再送ボタンもテスト送信も無い", () => {
    const view = getAnnouncementView(
      announcement({ status: "sent", sending_started_at: ago(HOUR), sent_at: ago(HOUR) }),
      NOW,
    );
    expect(view).toEqual({
      statusLabel: "配信済み",
      tone: "success",
      sendAction: null,
      canTestSend: false,
      notices: [],
    });
  });

  it("sending(直後): 配信処理中、ボタンは出さない", () => {
    const view = getAnnouncementView(
      announcement({ status: "sending", sending_started_at: ago(60 * 1000) }),
      NOW,
    );
    expect(view.statusLabel).toBe("配信処理中");
    expect(view.sendAction).toBeNull();
    expect(view.canTestSend).toBe(false);
    expect(view.notices[0].title).toBe("配信処理中");
  });

  it("sending(長時間): 「状態確認が必要」を警告し、再送ボタンは出さない", () => {
    const view = getAnnouncementView(
      announcement({ status: "sending", sending_started_at: ago(2 * HOUR) }),
      NOW,
    );
    expect(view.sendAction).toBeNull();
    expect(view.canTestSend).toBe(false);
    expect(view.notices).toEqual([
      { tone: "warning", title: "状態確認が必要", text: STALE_SENDING_TEXT },
    ]);
    expect(STALE_SENDING_TEXT).toContain("配信処理が完了したか確認できません。二重配信を防ぐため、自動では再送しません。");
  });

  it("failed(期間内): 配信失敗、失敗理由を表示し、再試行できる", () => {
    const view = getAnnouncementView(
      announcement({ status: "failed", sending_started_at: ago(HOUR), error_message: "LINE側で一時的なエラー" }),
      NOW,
    );
    expect(view.statusLabel).toBe("配信失敗");
    expect(view.tone).toBe("danger");
    expect(view.sendAction).toBe("retry");
    expect(view.canTestSend).toBe(true);
    expect(view.notices).toEqual([
      { tone: "danger", title: "配信に失敗しました", text: "LINE側で一時的なエラー" },
    ]);
  });

  it("failed(23時間超): 再試行できず、安全な再送期限切れを表示する", () => {
    const view = getAnnouncementView(
      announcement({
        status: "failed",
        created_at: ago(23 * HOUR + 60 * 1000),
        sending_started_at: ago(HOUR),
        error_message: "失敗",
      }),
      NOW,
    );
    expect(view.sendAction).toBeNull();
    expect(view.canTestSend).toBe(false);
    expect(view.notices.map((notice) => notice.text)).toContain(EXPIRED_FAILED_TEXT);
    expect(EXPIRED_FAILED_TEXT).toBe(
      "安全な再送期限を過ぎています。内容を確認して新しいお知らせとして作成してください。",
    );
  });
});

describe("describeSendAnnouncementResult", () => {
  it("配信成功", () => {
    expect(
      describeSendAnnouncementResult({ ok: true, lineRequestId: "r", alreadyAccepted: false, recorded: true }),
    ).toEqual({ kind: "success", message: SENT_MESSAGE });
  });

  it("alreadyAccepted: 前回受付済みで二重配信していないことを伝える", () => {
    expect(
      describeSendAnnouncementResult({ ok: true, lineRequestId: "r", alreadyAccepted: true, recorded: true }),
    ).toEqual({ kind: "success", message: ALREADY_ACCEPTED_MESSAGE });
  });

  it("recorded:false(配信成功・記録失敗)は失敗ではなく、再送しないよう警告する", () => {
    const flash = describeSendAnnouncementResult({
      ok: true,
      lineRequestId: null,
      alreadyAccepted: false,
      recorded: false,
    });
    expect(flash).toEqual({ kind: "warning", message: UNRECORDED_SUCCESS_MESSAGE });
    expect(flash.message).toContain("LINEへの配信結果を管理画面に記録できませんでした。");
    expect(flash.message).toContain("再送せず");
  });

  it("LINEエラー(記録済み)は失敗として理由を表示する", () => {
    expect(
      describeSendAnnouncementResult({ ok: false, reason: "line_error", message: "上限に達しました。", recorded: true }),
    ).toEqual({ kind: "error", message: "送信に失敗しました。上限に達しました。" });
  });

  it("LINEエラー(記録失敗)は再送しないよう警告する", () => {
    const flash = describeSendAnnouncementResult({
      ok: false,
      reason: "line_error",
      message: "通信に失敗",
      recorded: false,
    });
    expect(flash.kind).toBe("warning");
    expect(flash.message).toContain(UNRECORDED_FAILURE_MESSAGE);
    expect(flash.message).toContain("配信状況を確認できませんでした。");
  });

  it("拒否(配信済み等)はsendAnnouncementのメッセージをそのまま表示する", () => {
    expect(
      describeSendAnnouncementResult({ ok: false, reason: "already_sent", message: "配信済みです。" }),
    ).toEqual({ kind: "error", message: "配信済みです。" });
  });
});
