import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/line/push-message", () => ({
  pushLineMessage: vi.fn(),
}));

import { pushLineMessage } from "@/lib/line/push-message";
import { notifyOwnerOfEscalation } from "@/lib/line/escalate-to-owner";

const mockPushLineMessage = vi.mocked(pushLineMessage);

// 実際のLINE User IDではなく、テスト専用のダミー値。
const DUMMY_OWNER_ID = "dummy-owner-line-id";
const DUMMY_CUSTOMER_ID = "dummy-customer-line-id";

/**
 * console.error/console.log へ渡された全引数の中に、指定した文字列が
 * (文字列引数だけでなく、Errorオブジェクトのmessageや、その他のオブジェクトを
 * String化した結果も含めて)含まれていないかを確認する。
 * `typeof arg === "string"` だけで絞り込むと、値が誤ってError等の非文字列引数
 * に紛れ込んだ場合に検知できず、テストが偽陰性(見逃し)になる。
 */
function loggedArgsContain(calls: unknown[][], needle: string): boolean {
  return calls.flat().some((arg) => {
    if (typeof arg === "string") {
      return arg.includes(needle);
    }
    if (arg instanceof Error) {
      return arg.message.includes(needle) || (arg.stack ?? "").includes(needle);
    }
    try {
      return String(arg).includes(needle);
    } catch {
      return false;
    }
  });
}

beforeEach(() => {
  mockPushLineMessage.mockReset();
  process.env.OWNER_LINE_USER_ID = DUMMY_OWNER_ID;
});

afterEach(() => {
  delete process.env.OWNER_LINE_USER_ID;
  vi.restoreAllMocks();
});

describe("notifyOwnerOfEscalation", () => {
  it("A. 正常時はpushLineMessageを1回呼び出し、ok:trueを返す", async () => {
    mockPushLineMessage.mockResolvedValue(undefined as never);

    const result = await notifyOwnerOfEscalation({
      question: "営業時間は？",
      reason: "予約可否に関する質問のため",
      lineUserId: DUMMY_CUSTOMER_ID,
    });

    expect(result).toEqual({ ok: true });
    expect(mockPushLineMessage).toHaveBeenCalledTimes(1);
  });

  it("B. OWNER_LINE_USER_ID未設定の場合、pushLineMessageを呼び出さずok:falseを返す(throwしない)", async () => {
    delete process.env.OWNER_LINE_USER_ID;

    const result = await notifyOwnerOfEscalation({
      question: "営業時間は？",
      reason: "理由",
      lineUserId: DUMMY_CUSTOMER_ID,
    });

    expect(result).toEqual({ ok: false, reason: "owner_user_id_missing" });
    expect(mockPushLineMessage).not.toHaveBeenCalled();
  });

  it("C. LINE Pushが失敗した場合、throwせず安全な失敗結果を返し、顧客ID・オーナーIDをログへ漏らさない", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPushLineMessage.mockRejectedValue(new Error("push failed"));

    const result = await notifyOwnerOfEscalation({
      question: "営業時間は？",
      reason: "理由",
      lineUserId: DUMMY_CUSTOMER_ID,
    });

    expect(result).toEqual({ ok: false, reason: "push_failed" });
    expect(loggedArgsContain(consoleErrorSpy.mock.calls, DUMMY_CUSTOMER_ID)).toBe(false);
    expect(loggedArgsContain(consoleErrorSpy.mock.calls, DUMMY_OWNER_ID)).toBe(false);
  });

  it("D. questionが500文字を超える場合はtruncateされる", async () => {
    mockPushLineMessage.mockResolvedValue(undefined as never);
    const longQuestion = "あ".repeat(600);

    await notifyOwnerOfEscalation({
      question: longQuestion,
      reason: "理由",
      lineUserId: DUMMY_CUSTOMER_ID,
    });

    const [, text] = mockPushLineMessage.mock.calls[0]!;
    expect(text).not.toContain(longQuestion);
    expect(text).toContain("あ".repeat(500));
  });

  it("E. reasonが200文字を超える場合はtruncateされる", async () => {
    mockPushLineMessage.mockResolvedValue(undefined as never);
    const longReason = "い".repeat(300);

    await notifyOwnerOfEscalation({
      question: "質問",
      reason: longReason,
      lineUserId: DUMMY_CUSTOMER_ID,
    });

    const [, text] = mockPushLineMessage.mock.calls[0]!;
    expect(text).not.toContain(longReason);
    expect(text).toContain("い".repeat(200));
  });

  it("F. 通知本文に必須の見出しがすべて含まれる", async () => {
    mockPushLineMessage.mockResolvedValue(undefined as never);

    await notifyOwnerOfEscalation({
      question: "営業時間は？",
      reason: "理由",
      lineUserId: DUMMY_CUSTOMER_ID,
    });

    const [, text] = mockPushLineMessage.mock.calls[0]!;
    expect(text).toContain("【要確認の問い合わせ】");
    expect(text).toContain("質問：");
    expect(text).toContain("判定：");
    expect(text).toContain("要スタッフ確認");
    expect(text).toContain("理由：");
    expect(text).toContain("ユーザーID：");
  });

  it("G. OWNER_LINE_USER_IDが送信先(to)として使用される", async () => {
    mockPushLineMessage.mockResolvedValue(undefined as never);

    await notifyOwnerOfEscalation({
      question: "質問",
      reason: "理由",
      lineUserId: DUMMY_CUSTOMER_ID,
    });

    const [to] = mockPushLineMessage.mock.calls[0]!;
    expect(to).toBe(DUMMY_OWNER_ID);
  });

  it("H. 顧客lineUserIdは通知本文には含まれるが、ログへは出力されない", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockPushLineMessage.mockResolvedValue(undefined as never);

    await notifyOwnerOfEscalation({
      question: "質問",
      reason: "理由",
      lineUserId: DUMMY_CUSTOMER_ID,
    });

    const [, text] = mockPushLineMessage.mock.calls[0]!;
    expect(text).toContain(DUMMY_CUSTOMER_ID);

    const calls = [...consoleErrorSpy.mock.calls, ...consoleLogSpy.mock.calls];
    expect(loggedArgsContain(calls, DUMMY_CUSTOMER_ID)).toBe(false);
  });

  it("H'. 顧客lineUserIdはPush失敗時のログにも出力されない", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockPushLineMessage.mockRejectedValue(new Error("push failed"));

    await notifyOwnerOfEscalation({
      question: "質問",
      reason: "理由",
      lineUserId: DUMMY_CUSTOMER_ID,
    });

    const calls = [...consoleErrorSpy.mock.calls, ...consoleLogSpy.mock.calls];
    expect(loggedArgsContain(calls, DUMMY_CUSTOMER_ID)).toBe(false);
  });

  it("I. OWNER_LINE_USER_IDの値が未設定時・Push失敗時のいずれもログへ出力されない", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    delete process.env.OWNER_LINE_USER_ID;
    await notifyOwnerOfEscalation({
      question: "質問",
      reason: "理由",
      lineUserId: DUMMY_CUSTOMER_ID,
    });

    process.env.OWNER_LINE_USER_ID = DUMMY_OWNER_ID;
    mockPushLineMessage.mockRejectedValue(new Error("push failed"));
    await notifyOwnerOfEscalation({
      question: "質問",
      reason: "理由",
      lineUserId: DUMMY_CUSTOMER_ID,
    });

    expect(loggedArgsContain(consoleErrorSpy.mock.calls, DUMMY_OWNER_ID)).toBe(false);
  });
});
