"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useFormStatus } from "react-dom";
import { secondaryButtonClassName } from "./button-styles";
import { SubmitButton } from "./submit-button";

type ConfirmDialogProps = {
  triggerLabel: string;
  triggerClassName: string;
  title: string;
  description: ReactNode;
  cancelLabel?: string;
  /** 確認後に実行するServer Action。ダイアログ内の送信ボタンからだけ呼ばれる。 */
  action: (formData: FormData) => void | Promise<void>;
  /** Server Actionへ渡す値(対象のid等)。hidden inputとして送る。 */
  hiddenFields: Record<string, string>;
  submitLabel: string;
  pendingLabel: string;
};

/**
 * 処理が終わったら(成功・失敗を問わず)ダイアログを閉じる。処理中は閉じずに「〜中…」を見せ続ける。
 * showModal()で開いたダイアログは、Server Action後に同じ画面が再描画されても開いたまま残るため、
 * ここで閉じないとエラー表示の上にダイアログが被さったままになる。
 */
function CloseDialogWhenSettled({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      dialogRef.current?.close();
    }
    wasPending.current = pending;
  }, [pending, dialogRef]);

  return null;
}

/**
 * 影響の大きい操作(削除・一斉配信など)の前に確認を挟む共通コンポーネント。
 * ネイティブ<dialog>を使用し、実行用のフォームはダイアログの中にだけ置く(トリガーボタンは開くだけで送信しない)。
 */
export function ConfirmDialog({
  triggerLabel,
  triggerClassName,
  title,
  description,
  cancelLabel = "キャンセル",
  action,
  hiddenFields,
  submitLabel,
  pendingLabel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => dialogRef.current?.showModal()}>
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        className="w-[min(90vw,28rem)] rounded-2xl border border-foreground/20 bg-background p-5 text-foreground backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">{title}</h2>
            <div className="text-sm text-foreground/80">{description}</div>
          </div>
          <div className="flex flex-col gap-2">
            <form action={action}>
              {Object.entries(hiddenFields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
              <CloseDialogWhenSettled dialogRef={dialogRef} />
            </form>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className={secondaryButtonClassName}
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
