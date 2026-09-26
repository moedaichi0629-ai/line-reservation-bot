import { describe, expect, it } from "vitest";
import { ANNOUNCEMENT_BODY_MAX_LENGTH, parseAnnouncementBody } from "@/lib/admin/schemas";

describe("parseAnnouncementBody", () => {
  it("上限は1000文字", () => {
    expect(ANNOUNCEMENT_BODY_MAX_LENGTH).toBe(1000);
  });

  it("通常の本文は前後の空白も含めてそのまま返す", () => {
    expect(parseAnnouncementBody(" 本日は臨時休業です。\n")).toEqual({
      success: true,
      data: " 本日は臨時休業です。\n",
    });
  });

  it.each([
    ["空文字", ""],
    ["半角空白のみ", "   "],
    ["全角空白・タブ・改行のみ", `${String.fromCharCode(0x3000)}\t\r\n`],
  ])("%sは拒否する", (_label, body) => {
    expect(parseAnnouncementBody(body)).toEqual({ success: false, error: "本文を入力してください。" });
  });

  it.each([null, undefined, 123, {}])("文字列以外(%s)は拒否する", (body) => {
    expect(parseAnnouncementBody(body).success).toBe(false);
  });

  it("ちょうど1000文字は許可し、1001文字は拒否する", () => {
    expect(parseAnnouncementBody("あ".repeat(1000)).success).toBe(true);
    expect(parseAnnouncementBody("あ".repeat(1001))).toEqual({
      success: false,
      error: "本文は1000文字以内で入力してください。",
    });
  });

  it("絵文字はUTF-16コード単位で数える(LINEの数え方と同じ)", () => {
    expect(parseAnnouncementBody("😀".repeat(500)).success).toBe(true);
    expect(parseAnnouncementBody(`${"😀".repeat(500)}a`).success).toBe(false);
  });

  it.each([
    ["NUL", String.fromCharCode(0)],
    ["ESC", String.fromCharCode(0x1b)],
    ["DEL", String.fromCharCode(0x7f)],
  ])("制御文字(%s)を含む本文は拒否する", (_label, char) => {
    expect(parseAnnouncementBody(`お知らせ${char}です`)).toEqual({
      success: false,
      error: "本文に使用できない文字が含まれています。",
    });
  });

  it("改行・タブは許可する", () => {
    expect(parseAnnouncementBody("1行目\r\n2行目\tタブ").success).toBe(true);
  });
});
