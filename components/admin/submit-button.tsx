"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { primaryButtonClassName } from "./button-styles";
import { Spinner } from "./spinner";

type SubmitButtonProps = {
  children: ReactNode;
  pendingLabel: string;
  /** 送信中に加えて、境界条件(先頭/末尾など)でも無効化したい場合に指定する。 */
  disabled?: boolean;
  /** 既定は主要な操作用の全幅ボタン。一覧内の小さな操作ボタンなど別の見た目にしたい場合に上書きする。 */
  className?: string;
};

/** 送信中は無効化してスピナーと「〜中…」を表示する(連打による二重送信を防ぐ)。 */
export function SubmitButton({ children, pendingLabel, disabled = false, className }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={className ?? primaryButtonClassName}
    >
      {pending ? (
        <>
          <Spinner className="size-5" />
          <span>{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
