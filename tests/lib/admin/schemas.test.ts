import { describe, expect, it } from "vitest";
import {
  FAQ_ANSWER_MAX_LENGTH,
  FAQ_CATEGORY_MAX_LENGTH,
  FAQ_QUESTION_MAX_LENGTH,
  MENU_DESCRIPTION_MAX_LENGTH,
  MENU_DURATION_MAX_MINUTES,
  MENU_DURATION_MIN_MINUTES,
  MENU_NAME_MAX_LENGTH,
  MENU_PRICE_MAX_YEN,
  MENU_PRICE_MIN_YEN,
  parseFaqInput,
  parseMenuInput,
} from "@/lib/admin/schemas";

function buildFormData(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseFaqInput", () => {
  it("有効な入力はtrim済みのquestion/answer/categoryを返す", () => {
    const result = parseFaqInput(
      buildFormData({ question: " 営業時間は？ ", answer: " 10:00〜19:00です。 ", category: " 営業時間 " }),
    );

    expect(result).toEqual({
      success: true,
      data: { question: "営業時間は？", answer: "10:00〜19:00です。", category: "営業時間" },
    });
  });

  it("categoryが空文字・未指定のときはnullになる", () => {
    const emptyResult = parseFaqInput(buildFormData({ question: "質問", answer: "回答", category: "" }));
    expect(emptyResult).toMatchObject({ success: true, data: { category: null } });

    const missingFormData = new FormData();
    missingFormData.set("question", "質問");
    missingFormData.set("answer", "回答");
    const missingResult = parseFaqInput(missingFormData);
    expect(missingResult).toMatchObject({ success: true, data: { category: null } });
  });

  it("questionが空文字ならエラーを返す", () => {
    const result = parseFaqInput(buildFormData({ question: "", answer: "回答", category: "" }));
    expect(result).toEqual({ success: false, error: "質問を入力してください。" });
  });

  it("questionが空白のみでもエラーを返す(trim後に空になる)", () => {
    const result = parseFaqInput(buildFormData({ question: "   ", answer: "回答", category: "" }));
    expect(result.success).toBe(false);
  });

  it(`questionが${FAQ_QUESTION_MAX_LENGTH}文字を超えるとエラーを返す`, () => {
    const result = parseFaqInput(
      buildFormData({ question: "あ".repeat(FAQ_QUESTION_MAX_LENGTH + 1), answer: "回答", category: "" }),
    );
    expect(result).toEqual({
      success: false,
      error: `質問は${FAQ_QUESTION_MAX_LENGTH}文字以内で入力してください。`,
    });
  });

  it(`questionがちょうど${FAQ_QUESTION_MAX_LENGTH}文字なら成功する`, () => {
    const question = "あ".repeat(FAQ_QUESTION_MAX_LENGTH);
    const result = parseFaqInput(buildFormData({ question, answer: "回答", category: "" }));
    expect(result).toMatchObject({ success: true, data: { question } });
  });

  it("answerが空文字ならエラーを返す", () => {
    const result = parseFaqInput(buildFormData({ question: "質問", answer: "", category: "" }));
    expect(result).toEqual({ success: false, error: "回答を入力してください。" });
  });

  it(`answerが${FAQ_ANSWER_MAX_LENGTH}文字を超えるとエラーを返す`, () => {
    const result = parseFaqInput(
      buildFormData({ question: "質問", answer: "あ".repeat(FAQ_ANSWER_MAX_LENGTH + 1), category: "" }),
    );
    expect(result).toEqual({
      success: false,
      error: `回答は${FAQ_ANSWER_MAX_LENGTH}文字以内で入力してください。`,
    });
  });

  it(`categoryが${FAQ_CATEGORY_MAX_LENGTH}文字を超えるとエラーを返す`, () => {
    const result = parseFaqInput(
      buildFormData({ question: "質問", answer: "回答", category: "あ".repeat(FAQ_CATEGORY_MAX_LENGTH + 1) }),
    );
    expect(result).toEqual({
      success: false,
      error: `カテゴリは${FAQ_CATEGORY_MAX_LENGTH}文字以内で入力してください。`,
    });
  });

  it("HTMLタグを含む文字列もエスケープせずそのまま文字列として保持する(保存はDBの責務、エスケープは表示側のReactが行う)", () => {
    const question = "<script>alert('xss')</script>";
    const answer = "<b>太字</b>のような回答";
    const result = parseFaqInput(buildFormData({ question, answer, category: "" }));
    expect(result).toEqual({ success: true, data: { question, answer, category: null } });
  });

  it("question/answerがFormDataに存在しない(File等)場合はエラーを返し例外を投げない", () => {
    const formData = new FormData();
    formData.set("question", new Blob(["not a string"]), "file.txt");
    formData.set("answer", "回答");
    expect(() => parseFaqInput(formData)).not.toThrow();
    expect(parseFaqInput(formData).success).toBe(false);
  });
});

function buildMenuFormData(fields: Record<string, string>): FormData {
  const formData = new FormData();
  formData.set("name", fields.name ?? "カット");
  formData.set("description", fields.description ?? "");
  formData.set("price_yen", fields.price_yen ?? "3000");
  formData.set("duration_minutes", fields.duration_minutes ?? "60");
  return formData;
}

describe("parseMenuInput", () => {
  it("有効な入力はtrim済みのname/description/整数のprice_yen・duration_minutesを返す", () => {
    const result = parseMenuInput(
      buildMenuFormData({
        name: " カット ",
        description: " シャンプー込み ",
        price_yen: " 3500 ",
        duration_minutes: " 45 ",
      }),
    );

    expect(result).toEqual({
      success: true,
      data: { name: "カット", description: "シャンプー込み", price_yen: 3500, duration_minutes: 45 },
    });
  });

  it("descriptionが空文字・未指定のときはnullになる", () => {
    const emptyResult = parseMenuInput(buildMenuFormData({ description: "" }));
    expect(emptyResult).toMatchObject({ success: true, data: { description: null } });

    const missingFormData = new FormData();
    missingFormData.set("name", "カット");
    missingFormData.set("price_yen", "3000");
    missingFormData.set("duration_minutes", "60");
    const missingResult = parseMenuInput(missingFormData);
    expect(missingResult).toMatchObject({ success: true, data: { description: null } });
  });

  it("nameが空文字ならエラーを返す", () => {
    const result = parseMenuInput(buildMenuFormData({ name: "" }));
    expect(result).toEqual({ success: false, error: "メニュー名を入力してください。" });
  });

  it(`nameが${MENU_NAME_MAX_LENGTH}文字を超えるとエラーを返す`, () => {
    const result = parseMenuInput(buildMenuFormData({ name: "あ".repeat(MENU_NAME_MAX_LENGTH + 1) }));
    expect(result).toEqual({
      success: false,
      error: `メニュー名は${MENU_NAME_MAX_LENGTH}文字以内で入力してください。`,
    });
  });

  it(`descriptionが${MENU_DESCRIPTION_MAX_LENGTH}文字を超えるとエラーを返す`, () => {
    const result = parseMenuInput(
      buildMenuFormData({ description: "あ".repeat(MENU_DESCRIPTION_MAX_LENGTH + 1) }),
    );
    expect(result).toEqual({
      success: false,
      error: `説明は${MENU_DESCRIPTION_MAX_LENGTH}文字以内で入力してください。`,
    });
  });

  it("price_yenが未入力・空白のみならエラーを返す", () => {
    expect(parseMenuInput(buildMenuFormData({ price_yen: "" }))).toEqual({
      success: false,
      error: "料金を入力してください。",
    });
    expect(parseMenuInput(buildMenuFormData({ price_yen: "   " }))).toEqual({
      success: false,
      error: "料金を入力してください。",
    });
  });

  it(`price_yenが${MENU_PRICE_MIN_YEN}円(下限)なら成功する`, () => {
    const result = parseMenuInput(buildMenuFormData({ price_yen: String(MENU_PRICE_MIN_YEN) }));
    expect(result).toMatchObject({ success: true, data: { price_yen: MENU_PRICE_MIN_YEN } });
  });

  it("price_yenが負数ならエラーを返す(整数チェックに引っかかる)", () => {
    const result = parseMenuInput(buildMenuFormData({ price_yen: "-100" }));
    expect(result).toEqual({ success: false, error: "料金は整数で入力してください。" });
  });

  it("price_yenが小数ならエラーを返す", () => {
    const result = parseMenuInput(buildMenuFormData({ price_yen: "100.5" }));
    expect(result).toEqual({ success: false, error: "料金は整数で入力してください。" });
  });

  it("price_yenが数字以外を含む場合はエラーを返す", () => {
    const result = parseMenuInput(buildMenuFormData({ price_yen: "1万円" }));
    expect(result).toEqual({ success: false, error: "料金は整数で入力してください。" });
  });

  it(`price_yenが${MENU_PRICE_MAX_YEN}円(上限)を超えるとエラーを返す`, () => {
    const result = parseMenuInput(buildMenuFormData({ price_yen: String(MENU_PRICE_MAX_YEN + 1) }));
    expect(result).toEqual({
      success: false,
      error: `料金は${MENU_PRICE_MIN_YEN}〜${MENU_PRICE_MAX_YEN}の範囲で入力してください。`,
    });
  });

  it(`price_yenが${MENU_PRICE_MAX_YEN}円(上限)ちょうどなら成功する`, () => {
    const result = parseMenuInput(buildMenuFormData({ price_yen: String(MENU_PRICE_MAX_YEN) }));
    expect(result).toMatchObject({ success: true, data: { price_yen: MENU_PRICE_MAX_YEN } });
  });

  it("非常に大きなprice_yen(安全な整数範囲外)はエラーを返す", () => {
    const result = parseMenuInput(buildMenuFormData({ price_yen: "9".repeat(400) }));
    expect(result).toEqual({ success: false, error: "料金の値が大きすぎます。" });
  });

  it(`duration_minutesが${MENU_DURATION_MIN_MINUTES - 1}(下限未満)ならエラーを返す`, () => {
    const result = parseMenuInput(
      buildMenuFormData({ duration_minutes: String(MENU_DURATION_MIN_MINUTES - 1) }),
    );
    expect(result).toEqual({
      success: false,
      error: `所要時間は${MENU_DURATION_MIN_MINUTES}〜${MENU_DURATION_MAX_MINUTES}の範囲で入力してください。`,
    });
  });

  it(`duration_minutesが${MENU_DURATION_MIN_MINUTES}(下限)なら成功する`, () => {
    const result = parseMenuInput(
      buildMenuFormData({ duration_minutes: String(MENU_DURATION_MIN_MINUTES) }),
    );
    expect(result).toMatchObject({ success: true, data: { duration_minutes: MENU_DURATION_MIN_MINUTES } });
  });

  it(`duration_minutesが${MENU_DURATION_MAX_MINUTES}(上限)を超えるとエラーを返す`, () => {
    const result = parseMenuInput(
      buildMenuFormData({ duration_minutes: String(MENU_DURATION_MAX_MINUTES + 1) }),
    );
    expect(result).toEqual({
      success: false,
      error: `所要時間は${MENU_DURATION_MIN_MINUTES}〜${MENU_DURATION_MAX_MINUTES}の範囲で入力してください。`,
    });
  });

  it("HTMLタグを含む文字列もエスケープせずそのまま文字列として保持する", () => {
    const name = "<script>alert('xss')</script>";
    const description = "<b>太字</b>のような説明";
    const result = parseMenuInput(buildMenuFormData({ name, description }));
    expect(result).toMatchObject({ success: true, data: { name, description } });
  });

  it("name/price_yenがFormDataに存在しない(File等)場合はエラーを返し例外を投げない", () => {
    const formData = new FormData();
    formData.set("name", new Blob(["not a string"]), "file.txt");
    formData.set("price_yen", "3000");
    formData.set("duration_minutes", "60");
    expect(() => parseMenuInput(formData)).not.toThrow();
    expect(parseMenuInput(formData).success).toBe(false);
  });
});
