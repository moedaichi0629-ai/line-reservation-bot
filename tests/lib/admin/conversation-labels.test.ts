import { describe, expect, it } from "vitest";
import {
  describeBotReply,
  describeConfidence,
  describeCustomerMessage,
  formatDateTimeJst,
  maskLineUserId,
} from "@/lib/admin/conversation-labels";
import { API_FAILURE_REPLY_TEXT, LOW_CONFIDENCE_REPLY_TEXT } from "@/lib/faq/reply-templates";

const FULL_LINE_USER_ID = "U4af4980629abcdef0123456789abcd12";

describe("maskLineUserId", () => {
  it("末尾4文字のみを表示し、完全なIDを含めない", () => {
    const label = maskLineUserId(FULL_LINE_USER_ID);
    expect(label).toBe("お客様（末尾cd12）");
    expect(label).not.toContain(FULL_LINE_USER_ID);
    expect(label).not.toContain("U4af");
  });

  it("極端に短いIDは識別子を出さない", () => {
    expect(maskLineUserId("U123")).toBe("お客様（ID不明）");
    expect(maskLineUserId("")).toBe("お客様（ID不明）");
  });
});

describe("describeCustomerMessage", () => {
  it("テキストは本文をそのまま返す", () => {
    expect(describeCustomerMessage("text", "カットの料金は？")).toBe("カットの料金は？");
  });

  it("本文が空/nullのテキストは「内容なし」", () => {
    expect(describeCustomerMessage("text", null)).toBe("（内容なし）");
    expect(describeCustomerMessage("text", "")).toBe("（内容なし）");
  });

  it.each([
    ["image", "（画像が送信されました）"],
    ["video", "（動画が送信されました）"],
    ["audio", "（音声が送信されました）"],
    ["file", "（ファイルが送信されました）"],
    ["location", "（位置情報が送信されました）"],
    ["sticker", "（スタンプが送信されました）"],
    ["unknown-type", "（テキスト以外のメッセージが送信されました）"],
  ])("%s は種類を日本語で示す", (type, expected) => {
    expect(describeCustomerMessage(type, null)).toBe(expected);
  });
});

describe("describeConfidence", () => {
  it("内部値を日本語にする", () => {
    expect(describeConfidence("high")).toBe("高い");
    expect(describeConfidence("medium")).toBe("ふつう");
    expect(describeConfidence("low")).toBe("低い");
    expect(describeConfidence(null)).toBeNull();
  });
});

describe("describeBotReply", () => {
  it("escalated=true → スタッフ確認が必要", () => {
    const label = describeBotReply({
      confidence: "low",
      escalated: true,
      messageText: LOW_CONFIDENCE_REPLY_TEXT,
    });
    expect(label.label).toBe("スタッフ確認が必要");
    expect(label.tone).toBe("warning");
  });

  it.each(["high", "medium"] as const)("confidence=%s → 自動回答", (confidence) => {
    const label = describeBotReply({ confidence, escalated: false, messageText: "回答です" });
    expect(label.label).toBe("自動回答");
    expect(label.tone).toBe("success");
  });

  it("confidence=low かつ escalated=false(通常は発生しない) → 要確認", () => {
    const label = describeBotReply({ confidence: "low", escalated: false, messageText: "x" });
    expect(label.label).toBe("要確認");
    expect(label.tone).toBe("warning");
  });

  it("confidence=null かつ API障害時の定型文 → 自動応答エラー", () => {
    const label = describeBotReply({
      confidence: null,
      escalated: false,
      messageText: API_FAILURE_REPLY_TEXT,
    });
    expect(label.label).toBe("自動応答エラー");
    expect(label.tone).toBe("danger");
  });

  it("confidence=null のその他の返信 → 定型メッセージ", () => {
    const label = describeBotReply({
      confidence: null,
      escalated: false,
      messageText: "テキストメッセージのみ対応しています。",
    });
    expect(label.label).toBe("定型メッセージ");
    expect(label.tone).toBe("neutral");
  });

  it("どのラベルも内部値(high/medium/low/escalated/null)をそのまま表示しない", () => {
    const cases = [
      describeBotReply({ confidence: "high", escalated: false, messageText: "a" }),
      describeBotReply({ confidence: "medium", escalated: false, messageText: "a" }),
      describeBotReply({ confidence: "low", escalated: true, messageText: "a" }),
      describeBotReply({ confidence: "low", escalated: false, messageText: "a" }),
      describeBotReply({ confidence: null, escalated: false, messageText: API_FAILURE_REPLY_TEXT }),
      describeBotReply({ confidence: null, escalated: false, messageText: null }),
    ];
    for (const { label, description } of cases) {
      expect(`${label}${description}`).not.toMatch(/high|medium|low|escalat|null|confidence/i);
    }
  });
});

describe("formatDateTimeJst", () => {
  it("UTCの日時を日本時間で表示する", () => {
    expect(formatDateTimeJst("2026-09-24T15:05:00.000Z")).toBe("2026/9/25 00:05");
  });

  it("Postgresのマイクロ秒付きタイムスタンプも扱える", () => {
    expect(formatDateTimeJst("2026-09-25T01:23:45.123456+00:00")).toBe("2026/9/25 10:23");
  });

  it("不正な値は「日時不明」", () => {
    expect(formatDateTimeJst("not-a-date")).toBe("日時不明");
  });
});
