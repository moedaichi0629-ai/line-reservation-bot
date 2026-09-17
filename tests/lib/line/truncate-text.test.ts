import { describe, expect, it } from "vitest";
import {
  LINE_TEXT_MESSAGE_MAX_LENGTH,
  truncateForLineText,
} from "@/lib/line/truncate-text";

describe("truncateForLineText", () => {
  it("5000文字未満(4999文字)ならそのまま返す", () => {
    const text = "あ".repeat(LINE_TEXT_MESSAGE_MAX_LENGTH - 1);

    expect(truncateForLineText(text)).toBe(text);
  });

  it("ちょうど5000文字ならそのまま返す", () => {
    const text = "あ".repeat(LINE_TEXT_MESSAGE_MAX_LENGTH);

    const result = truncateForLineText(text);

    expect(result).toBe(text);
    expect(result.length).toBe(LINE_TEXT_MESSAGE_MAX_LENGTH);
  });

  it("5000文字を超える場合は5000文字にtruncateする", () => {
    const text = "あ".repeat(LINE_TEXT_MESSAGE_MAX_LENGTH + 1);

    const result = truncateForLineText(text);

    expect(result.length).toBe(LINE_TEXT_MESSAGE_MAX_LENGTH);
    expect(result).toBe("あ".repeat(LINE_TEXT_MESSAGE_MAX_LENGTH));
  });

  it("絵文字(サロゲートペア)を含んでいても上限内なら変更しない", () => {
    const text = "あ".repeat(LINE_TEXT_MESSAGE_MAX_LENGTH - 2) + "🍎";

    expect(text.length).toBe(LINE_TEXT_MESSAGE_MAX_LENGTH);
    expect(truncateForLineText(text)).toBe(text);
  });

  it("境界がサロゲートペアの間に来る場合、ペアごと切り捨てて孤立サロゲートを作らない", () => {
    // "あ" * 4999 (4999 code units) + 🍎 (2 code units) = 5001 code units。
    // 5000文字目でtruncateすると、絵文字の上位サロゲートと下位サロゲートの
    // ちょうど間で切れてしまう境界条件。
    const text = "あ".repeat(LINE_TEXT_MESSAGE_MAX_LENGTH - 1) + "🍎";
    expect(text.length).toBe(LINE_TEXT_MESSAGE_MAX_LENGTH + 1);

    const result = truncateForLineText(text);

    // 絵文字ごと切り捨てられ、孤立した上位サロゲートは残らない。
    expect(result).toBe("あ".repeat(LINE_TEXT_MESSAGE_MAX_LENGTH - 1));
    expect(result.length).toBe(LINE_TEXT_MESSAGE_MAX_LENGTH - 1);

    const lastCharCode = result.charCodeAt(result.length - 1);
    expect(lastCharCode >= 0xd800 && lastCharCode <= 0xdbff).toBe(false);
  });

  it("サロゲートペアを含まない通常のテキストは境界ちょうどで切断する", () => {
    const text = "a".repeat(LINE_TEXT_MESSAGE_MAX_LENGTH + 10);

    const result = truncateForLineText(text);

    expect(result.length).toBe(LINE_TEXT_MESSAGE_MAX_LENGTH);
  });
});
