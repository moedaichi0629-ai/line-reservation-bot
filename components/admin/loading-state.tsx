import { Spinner } from "./spinner";

type LoadingStateProps = {
  label?: string;
};

/** ページのデータ取得中に表示する共通のローディング表示(loading.tsxから使う)。 */
export function LoadingState({ label = "読み込み中…" }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-40 flex-col items-center justify-center gap-3 text-foreground/70"
    >
      <Spinner className="size-8" />
      <p className="text-base">{label}</p>
    </div>
  );
}
