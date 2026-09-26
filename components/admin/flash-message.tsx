import type { ReactNode } from "react";
import type { FlashKind } from "@/lib/admin/flash";
import type { Tone } from "@/lib/admin/tone";
import { Notice } from "./notice";

type FlashMessageProps = {
  variant: FlashKind;
  children: ReactNode;
};

const VARIANTS: Record<FlashKind, { tone: Tone; title: string }> = {
  success: { tone: "success", title: "✓ 成功" },
  error: { tone: "danger", title: "! エラー" },
  warning: { tone: "warning", title: "⚠ 確認が必要です" },
};

/** 操作結果のメッセージ。 */
export function FlashMessage({ variant, children }: FlashMessageProps) {
  const { tone, title } = VARIANTS[variant];

  return (
    <Notice tone={tone} title={title} size="base">
      {children}
    </Notice>
  );
}
