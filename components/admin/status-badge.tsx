import type { ReactNode } from "react";
import type { Tone } from "@/lib/admin/tone";
import { TONE_CLASSES } from "./tone-styles";

type StatusBadgeProps = {
  tone: Tone;
  children: ReactNode;
};

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
