import { describe, expect, it } from "vitest";
import { API_FAILURE_REPLY_TEXT, LOW_CONFIDENCE_REPLY_TEXT } from "@/lib/faq/reply-templates";

describe("reply-templates", () => {
  it("LOW_CONFIDENCE_REPLY_TEXTとAPI_FAILURE_REPLY_TEXTは異なる文言である", () => {
    expect(LOW_CONFIDENCE_REPLY_TEXT).not.toBe(API_FAILURE_REPLY_TEXT);
  });

  it("LOW_CONFIDENCE_REPLY_TEXTはスタッフが確認する旨を伝える", () => {
    expect(LOW_CONFIDENCE_REPLY_TEXT).toContain("スタッフ");
  });

  it("API_FAILURE_REPLY_TEXTは「スタッフが確認する」と約束しない", () => {
    expect(API_FAILURE_REPLY_TEXT).not.toContain("スタッフ");
  });

  it("両方とも空文字列ではない", () => {
    expect(LOW_CONFIDENCE_REPLY_TEXT.length).toBeGreaterThan(0);
    expect(API_FAILURE_REPLY_TEXT.length).toBeGreaterThan(0);
  });
});
