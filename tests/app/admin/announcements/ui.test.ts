import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Announcement } from "@/types/database";

// Server Actionはダミー(描画のみを確認する。LINE・DBには一切触れない)。
vi.mock("@/app/admin/(protected)/announcements/actions", () => ({
  createAnnouncementDraftAction: async () => null,
  sendAnnouncementAction: async () => {},
  sendTestAnnouncementAction: async () => {},
}));

// 送信中(pending)の見た目を確認するため、useFormStatusだけ差し替えられるようにする。
const mockFormStatus = vi.fn(() => ({ pending: false }));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: () => mockFormStatus(),
}));

import { AnnouncementForm } from "@/app/admin/(protected)/announcements/announcement-form";
import { AnnouncementHistoryItem } from "@/app/admin/(protected)/announcements/announcement-history-item";
import { SubmitButton } from "@/components/admin/submit-button";
import {
  BROADCAST_CONFIRMATION,
  EXPIRED_FAILED_TEXT,
  TEST_SEND_CONFIRMATION,
} from "@/lib/admin/announcement-policy";

const NOW = new Date("2026-09-26T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function announcement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    body: "10月は全メニュー10%オフです。\nご予約お待ちしております。",
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

function renderItem(overrides: Partial<Announcement> = {}): string {
  return renderToStaticMarkup(
    createElement(AnnouncementHistoryItem, { announcement: announcement(overrides), now: NOW }),
  );
}

/** 確認ダイアログ(<dialog>)の中身だけを取り出す。 */
function dialogs(html: string): string[] {
  return [...html.matchAll(/<dialog[\s\S]*?<\/dialog>/g)].map((match) => match[0]);
}

beforeEach(() => {
  mockFormStatus.mockReset();
  mockFormStatus.mockReturnValue({ pending: false });
});

describe("配信履歴: draft", () => {
  const html = renderItem();

  it("状態・作成日時・本文を表示する", () => {
    expect(html).toContain("下書き");
    expect(html).toContain("作成日時");
    // 11:00Z = 日本時間 20:00
    expect(html).toContain("2026/9/26 20:00");
    expect(html).toContain("10月は全メニュー10%オフです。");
  });

  it("配信ボタンを押しても即配信せず、確認ダイアログ(本文全文・取り消せない注意・戻る/配信する)を挟む", () => {
    expect(html).toContain("友だち全員へ配信する");
    const broadcastDialog = dialogs(html).find((dialog) => dialog.includes(BROADCAST_CONFIRMATION));
    expect(broadcastDialog).toBeDefined();
    expect(broadcastDialog).toContain("この内容をLINEの友だち全員へ配信します。");
    expect(broadcastDialog).toContain("10月は全メニュー10%オフです。\nご予約お待ちしております。");
    expect(broadcastDialog).toContain("配信後は取り消せません。");
    expect(broadcastDialog).toContain("戻る");
    expect(broadcastDialog).toContain("配信する");
    // 配信フォーム(確認値付き)はダイアログの中にしか無い。
    expect(html.split(BROADCAST_CONFIRMATION)).toHaveLength(2);
  });

  it("テスト送信も確認ダイアログ(管理者だけ・友だち全員には配信されない・本文全文)を挟む", () => {
    expect(html).toContain("自分にテスト送信");
    expect(html).toContain("一斉配信する前に、管理者のLINEだけに表示確認用のメッセージを送ります。");
    const testDialog = dialogs(html).find((dialog) => dialog.includes(TEST_SEND_CONFIRMATION));
    expect(testDialog).toContain("管理者のLINEだけにテスト送信します。");
    expect(testDialog).toContain("友だち全員には配信されません。");
    expect(testDialog).toContain("10月は全メニュー10%オフです。");
    expect(testDialog).toContain("戻る");
    expect(testDialog).toContain("テスト送信する");
    expect(testDialog).not.toContain(BROADCAST_CONFIRMATION);
  });

  it("ブラウザへ送る値に宛先(LINEユーザーID)の入力欄は無い", () => {
    expect(html).not.toMatch(/name="(to|owner|ownerLineUserId|lineUserId)"/);
  });
});

describe("配信履歴: sent", () => {
  const html = renderItem({ status: "sent", sending_started_at: ago(HOUR), sent_at: ago(HOUR) });

  it("配信済みと配信日時を表示し、再送・テスト送信ボタンを出さない", () => {
    expect(html).toContain("配信済み");
    expect(html).toContain("配信日時");
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain("配信する");
    expect(html).not.toContain("テスト送信");
    expect(html).not.toContain(BROADCAST_CONFIRMATION);
  });
});

describe("配信履歴: sending", () => {
  it("直後は配信処理中と表示し、ボタンを出さない", () => {
    const html = renderItem({ status: "sending", sending_started_at: ago(60 * 1000) });
    expect(html).toContain("配信処理中");
    expect(html).not.toContain("状態確認が必要");
    expect(html).not.toContain("<dialog");
  });

  it("長時間sendingのままなら「状態確認が必要」を警告し、再送ボタンを出さない", () => {
    const html = renderItem({ status: "sending", sending_started_at: ago(2 * HOUR) });
    expect(html).toContain("状態確認が必要");
    expect(html).toContain("配信処理が完了したか確認できません。二重配信を防ぐため、自動では再送しません。");
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain(BROADCAST_CONFIRMATION);
  });
});

describe("配信履歴: failed", () => {
  it("失敗理由を表示し、期限内なら確認ダイアログ付きの再試行ボタンを出す", () => {
    const html = renderItem({
      status: "failed",
      sending_started_at: ago(HOUR),
      error_message: "LINE側で一時的なエラーが発生したため、配信できませんでした。",
    });
    expect(html).toContain("配信失敗");
    expect(html).toContain("LINE側で一時的なエラーが発生したため、配信できませんでした。");
    expect(html).toContain("もう一度配信する");
    const broadcastDialog = dialogs(html).find((dialog) => dialog.includes(BROADCAST_CONFIRMATION));
    expect(broadcastDialog).toContain("配信後は取り消せません。");
    expect(broadcastDialog).toContain("二重には配信されません");
  });

  it("23時間を超えたfailedは再送ボタンを出さず、新しく作成するよう案内する", () => {
    const html = renderItem({
      status: "failed",
      created_at: ago(24 * HOUR),
      sending_started_at: ago(23.5 * HOUR),
      error_message: "失敗",
    });
    expect(html).toContain(EXPIRED_FAILED_TEXT);
    expect(html).not.toContain("もう一度配信する");
    expect(html).not.toContain("<dialog");
  });
});

describe("本文はHTMLとして解釈せず文字として表示する", () => {
  it("scriptタグ等はエスケープされる", () => {
    const html = renderItem({ body: '<script>alert("x")</script>' });
    // (末尾の<script>はReactがフォーム用に自動で付けるもので、本文とは無関係)
    expect(html).not.toContain('<script>alert("x")');
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });
});

describe("新しいお知らせフォーム", () => {
  it("見出しの説明・文字数(0 / 1000)・下書きを保存ボタンを表示し、空の間は保存できない", () => {
    const html = renderToStaticMarkup(createElement(AnnouncementForm, { savedToken: null }));
    expect(html).toContain(
      "キャンペーンや営業時間変更など、LINEで友だち全員へ送るお知らせを入力してください。",
    );
    expect(html).toContain("0 / 1000文字");
    expect(html).toContain('maxLength="1000"');
    expect(html).toContain("下書きを保存");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
});

describe("連打防止(送信中の表示)", () => {
  it.each([
    ["配信中…", "配信する"],
    ["送信中…", "テスト送信する"],
    ["保存中…", "下書きを保存"],
  ])("送信中はボタンを無効化して「%s」を表示する", (pendingLabel, label) => {
    mockFormStatus.mockReturnValue({ pending: true });

    // SubmitButtonPropsのchildrenは必須のため、型に合わせてpropsで渡す(テストは.tsでJSXを使えない)。
    // eslint-disable-next-line react/no-children-prop
    const html = renderToStaticMarkup(createElement(SubmitButton, { pendingLabel, children: label }));

    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(pendingLabel);
    expect(html).not.toContain(label);
  });

  it("配信フォームのボタンは送信中に無効化される共通ボタン(SubmitButton)を使う", () => {
    mockFormStatus.mockReturnValue({ pending: true });

    const html = renderItem();

    // 確認ダイアログ内の「配信する」「テスト送信する」がどちらも送信中表示になる。
    expect(html).toContain("配信中…");
    expect(html).toContain("送信中…");
    expect(html).not.toMatch(/>配信する</);
    expect(html).not.toMatch(/>テスト送信する</);
  });
});
