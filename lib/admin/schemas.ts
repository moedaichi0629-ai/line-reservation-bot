import { z } from "zod";
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
} from "./input-limits";

// 入力上限の定数とお知らせ本文の検証はzodを使わないinput-limits.tsにある(Client Componentが
// ここをimportするとzodがブラウザ用バンドルに入るため)。サーバー側の既存importのために再エクスポートする。
export * from "./input-limits";


export const faqInputSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "質問を入力してください。")
    .max(FAQ_QUESTION_MAX_LENGTH, `質問は${FAQ_QUESTION_MAX_LENGTH}文字以内で入力してください。`),
  answer: z
    .string()
    .trim()
    .min(1, "回答を入力してください。")
    .max(FAQ_ANSWER_MAX_LENGTH, `回答は${FAQ_ANSWER_MAX_LENGTH}文字以内で入力してください。`),
  // 空文字は「未入力」としてnull扱いにする(DBのcategoryはnull許容)。
  category: z
    .string()
    .trim()
    .max(FAQ_CATEGORY_MAX_LENGTH, `カテゴリは${FAQ_CATEGORY_MAX_LENGTH}文字以内で入力してください。`)
    .nullable()
    .transform((value) => (value === null || value === "" ? null : value)),
});

export type FaqInput = z.infer<typeof faqInputSchema>;

export type ParsedFaqInput = { success: true; data: FaqInput } | { success: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * URLの動的セグメント([id]等)がuuidの形になっているかを事前に確認する。
 * 不正な形式のままSupabaseへ渡すと"invalid input syntax for type uuid"の例外になり、
 * ページが意図しないエラー画面になってしまうため、その手前でnotFound()に倒せるようにする。
 */
export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * FAQ追加・編集フォームのFormDataを検証する。
 * 最初のバリデーションエラーのメッセージのみをユーザーに表示する(項目数が少ないため十分)。
 */
export function parseFaqInput(formData: FormData): ParsedFaqInput {
  const rawCategory = formData.get("category");

  const result = faqInputSchema.safeParse({
    question: formData.get("question"),
    answer: formData.get("answer"),
    category: typeof rawCategory === "string" ? rawCategory : null,
  });

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "入力内容を確認してください。" };
  }

  return { success: true, data: result.data };
}

// --- メニュー・料金管理 ---

const menuTextInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "メニュー名を入力してください。")
    .max(MENU_NAME_MAX_LENGTH, `メニュー名は${MENU_NAME_MAX_LENGTH}文字以内で入力してください。`),
  // 空文字は「未入力」としてnull扱いにする(DBのdescriptionはnull許容)。
  description: z
    .string()
    .trim()
    .max(MENU_DESCRIPTION_MAX_LENGTH, `説明は${MENU_DESCRIPTION_MAX_LENGTH}文字以内で入力してください。`)
    .nullable()
    .transform((value) => (value === null || value === "" ? null : value)),
});

export type MenuInput = {
  name: string;
  description: string | null;
  price_yen: number;
  duration_minutes: number;
};

export type ParsedMenuInput = { success: true; data: MenuInput } | { success: false; error: string };

type ParsedIntegerField = { success: true; value: number } | { success: false; error: string };

// 価格・所要時間は数字キーボード(inputMode="numeric")のtext inputで受け取るため、
// zodのz.number()型変換(空文字→0になる等の罠がある)を使わず、文字列として厳密に検証する。
function parseIntegerField(
  formData: FormData,
  fieldName: string,
  options: { min: number; max: number; label: string },
): ParsedIntegerField {
  const raw = formData.get(fieldName);
  if (typeof raw !== "string" || raw.trim() === "") {
    return { success: false, error: `${options.label}を入力してください。` };
  }

  const trimmed = raw.trim();
  // 整数のみ許可(小数点・符号付き小数・指数表記・全角数字等は不可)。
  if (!/^\d+$/.test(trimmed)) {
    return { success: false, error: `${options.label}は整数で入力してください。` };
  }

  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    return { success: false, error: `${options.label}の値が大きすぎます。` };
  }
  if (value < options.min || value > options.max) {
    return {
      success: false,
      error: `${options.label}は${options.min}〜${options.max}の範囲で入力してください。`,
    };
  }

  return { success: true, value };
}

/**
 * メニュー追加・編集フォームのFormDataを検証する。
 */
export function parseMenuInput(formData: FormData): ParsedMenuInput {
  const rawDescription = formData.get("description");

  const textResult = menuTextInputSchema.safeParse({
    name: formData.get("name"),
    description: typeof rawDescription === "string" ? rawDescription : null,
  });
  if (!textResult.success) {
    const firstIssue = textResult.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "入力内容を確認してください。" };
  }

  const priceResult = parseIntegerField(formData, "price_yen", {
    min: MENU_PRICE_MIN_YEN,
    max: MENU_PRICE_MAX_YEN,
    label: "料金",
  });
  if (!priceResult.success) {
    return priceResult;
  }

  const durationResult = parseIntegerField(formData, "duration_minutes", {
    min: MENU_DURATION_MIN_MINUTES,
    max: MENU_DURATION_MAX_MINUTES,
    label: "所要時間",
  });
  if (!durationResult.success) {
    return durationResult;
  }

  return {
    success: true,
    data: {
      name: textResult.data.name,
      description: textResult.data.description,
      price_yen: priceResult.value,
      duration_minutes: durationResult.value,
    },
  };
}
