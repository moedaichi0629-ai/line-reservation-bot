import type { ReactNode } from "react";
import type { Tone } from "@/lib/admin/tone";
import { TONE_CLASSES } from "./tone-styles";

type NoticeProps = {
  tone: Tone;
  title: string;
  children: ReactNode;
  /** 文字の大きさ。操作結果のメッセージは"base"、一覧内の補足は"sm"。 */
  size?: "sm" | "base";
};

/** 見出し付きの色分けされたお知らせ枠。neutral以外は読み上げで即時に伝わるようrole="alert"にする。 */
export function Notice({ tone, title, children, size = "sm" }: NoticeProps) {
  return (
    <div
      role={tone === "neutral" || tone === "success" ? "status" : "alert"}
      className={`rounded-xl border-2 px-4 py-3 ${size === "base" ? "text-base" : "text-sm"} ${TONE_CLASSES[tone]}`}
    >
      <p className="mb-1 text-sm font-bold">{title}</p>
      <div className="whitespace-pre-wrap break-words">{children}</div>
    </div>
  );
}
