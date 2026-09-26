type SpinnerProps = {
  /** 大きさ(例: "size-5")。 */
  className: string;
};

/** 処理中を表す回転アイコン(読み上げ対象外。状態は周囲のテキストで伝える)。 */
export function Spinner({ className }: SpinnerProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`${className} animate-spin`}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <circle cx="12" cy="12" r="9" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}
