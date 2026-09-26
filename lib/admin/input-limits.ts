/**
 * 管理画面の入力上限と、zodを使わない検証。Client Component(フォーム)からもimportされるため、
 * zodなどサーバー側でだけ使う重い依存をここに持ち込まないこと(zodを使う検証はschemas.ts)。
 */

// 承認済みPhase 3計画の値(質問200字/回答1000字)。カテゴリはDBにCHECK制約が無いため、
// 管理画面側で暴走入力を防ぐ目安の上限のみ設ける。
export const FAQ_QUESTION_MAX_LENGTH = 200;
export const FAQ_ANSWER_MAX_LENGTH = 1000;
export const FAQ_CATEGORY_MAX_LENGTH = 50;

export const MENU_NAME_MAX_LENGTH = 100;
export const MENU_DESCRIPTION_MAX_LENGTH = 500;
// DBのCHECK制約(price_yen >= 0)と同じ下限。上限はDBに無いが、暴走入力を防ぐ目安として設ける。
export const MENU_PRICE_MIN_YEN = 0;
export const MENU_PRICE_MAX_YEN = 1_000_000;
// DBのCHECK制約(duration_minutes > 0)と同じ下限。上限は美容室の施術時間として現実的な目安。
export const MENU_DURATION_MIN_MINUTES = 1;
export const MENU_DURATION_MAX_MINUTES = 600;

// --- お知らせ配信 ---

// 承認済みPhase 3計画の運用上限(テキスト1通・1000字)。DB側はLINEの上限5000字を最終防衛線にしている。
// 文字数はJSの.length(UTF-16コード単位)で数える。LINEのテキスト上限と同じ数え方で、
// DBのchar_length(コードポイント数)以上の値になるため、ここを通ればDB制約にも必ず収まる。
export const ANNOUNCEMENT_BODY_MAX_LENGTH = 1000;

// 改行(\n, \r)とタブ以外の制御文字。LINE上で見えない文字として届き、NUL(\u0000)はPostgresのtextに保存できない。
const DISALLOWED_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export type ParsedAnnouncementBody = { success: true; data: string } | { success: false; error: string };

/**
 * お知らせ本文を検証する。下書き作成時と送信直前の両方で呼ぶ(防御的に二重に確認する)。
 * 本文は前後の空白も含めて入力どおりに配信するため、trimした値は判定にのみ使い、返す値は元の文字列のまま。
 */
export function parseAnnouncementBody(body: unknown): ParsedAnnouncementBody {
  if (typeof body !== "string" || body.trim().length === 0) {
    return { success: false, error: "本文を入力してください。" };
  }
  if (body.length > ANNOUNCEMENT_BODY_MAX_LENGTH) {
    return {
      success: false,
      error: `本文は${ANNOUNCEMENT_BODY_MAX_LENGTH}文字以内で入力してください。`,
    };
  }
  if (DISALLOWED_CONTROL_CHARS.test(body)) {
    return { success: false, error: "本文に使用できない文字が含まれています。" };
  }
  return { success: true, data: body };
}
