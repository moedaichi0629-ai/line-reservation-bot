import type { Tone } from "@/lib/admin/tone";

/** 色分け(枠線・背景・文字色)。バッジ・お知らせ枠・操作結果メッセージで共通に使う。 */
export const TONE_CLASSES: Record<Tone, string> = {
  success:
    "border-green-700 bg-green-50 text-green-900 dark:border-green-400 dark:bg-green-950 dark:text-green-100",
  neutral: "border-foreground/30 bg-foreground/5 text-foreground/80",
  warning:
    "border-amber-700 bg-amber-50 text-amber-900 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-100",
  danger: "border-red-700 bg-red-50 text-red-900 dark:border-red-400 dark:bg-red-950 dark:text-red-100",
};
