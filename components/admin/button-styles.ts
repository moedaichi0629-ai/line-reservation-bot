// 管理画面のボタン・ボタン型リンクの見た目。タップしやすいよう高さは44px(min-h-11)以上。

/** 主要な操作(保存・送信など)の全幅ボタン。 */
export const primaryButtonClassName =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground px-6 text-base font-bold text-background transition-opacity active:opacity-80 disabled:cursor-not-allowed disabled:opacity-60";

/** 補助的な操作の全幅ボタン(枠線のみ)。 */
export const outlineButtonClassName =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-foreground/30 px-6 text-base font-bold active:bg-foreground/10 disabled:cursor-not-allowed disabled:opacity-60";

/** 一覧の各行に並べる小さな操作ボタン(編集・並べ替え・公開切り替えなど)。 */
export const smallOutlineButtonClassName =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-foreground/30 px-3 text-sm font-bold active:bg-foreground/10 disabled:cursor-not-allowed disabled:opacity-40";

/** 一覧の各行の削除ボタン。 */
export const smallDangerButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-red-700 px-3 text-sm font-bold text-red-700 active:bg-red-50 dark:border-red-400 dark:text-red-300 dark:active:bg-red-950";

/** キャンセル・ログアウトなど控えめなボタン。 */
export const secondaryButtonClassName =
  "min-h-11 rounded-xl border border-foreground/30 px-4 text-sm font-bold active:bg-foreground/10";

/** 一覧画面の「＋ 追加」リンク。 */
export const addLinkClassName =
  "inline-flex min-h-11 items-center rounded-xl bg-foreground px-4 text-sm font-bold text-background";
