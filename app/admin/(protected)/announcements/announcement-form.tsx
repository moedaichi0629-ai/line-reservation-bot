"use client";

import { useActionState, useEffect, useSyncExternalStore } from "react";
import { FlashMessage } from "@/components/admin/flash-message";
import { FormField, textareaClassName } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { ANNOUNCEMENT_BODY_MAX_LENGTH, parseAnnouncementBody } from "@/lib/admin/input-limits";
import { createAnnouncementDraftAction, type AnnouncementFormState } from "./actions";
import { announcementDraftStore as draftStore } from "./draft-store";

type AnnouncementFormProps = {
  /**
   * 下書き保存のリダイレクトでだけ付く値(?saved=)。新しい値のときだけ入力欄を空にする。
   * 配信・テスト送信の後(savedが無い)は入力途中の本文を残す(draft-store.ts)。
   */
  savedToken: string | null;
};

/**
 * 新しいお知らせの下書きを作る。ここでは保存するだけで、LINEへは何も送らない
 * (送信は履歴の各お知らせから、確認ダイアログを経て行う)。
 * 入力欄は文字数表示のために制御コンポーネントにしている。検証はサーバーと同じparseAnnouncementBody()。
 */
export function AnnouncementForm({ savedToken }: AnnouncementFormProps) {
  const [state, formAction] = useActionState<AnnouncementFormState, FormData>(
    createAnnouncementDraftAction,
    null,
  );
  // サーバー描画時は空(第3引数)。入力途中の本文はページの部品が作り直されても残るストアに持つ。
  const body = useSyncExternalStore(draftStore.subscribe, draftStore.getSnapshot, () => "");

  // 下書き保存が成功した(新しい?saved=が付いた)ときだけ入力欄を空にする(外部ストアの更新なのでeffectで行う)。
  useEffect(() => {
    draftStore.clearForSavedToken(savedToken);
  }, [savedToken]);

  const isOverLimit = body.length > ANNOUNCEMENT_BODY_MAX_LENGTH;
  const isValid = parseAnnouncementBody(body).success;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? <FlashMessage variant="error">{state.error}</FlashMessage> : null}

      <FormField
        label="本文"
        htmlFor="announcement-body"
        hint="キャンペーンや営業時間変更など、LINEで友だち全員へ送るお知らせを入力してください。"
      >
        <textarea
          id="announcement-body"
          name="body"
          required
          rows={8}
          maxLength={ANNOUNCEMENT_BODY_MAX_LENGTH}
          value={body}
          onChange={(event) => draftStore.setBody(event.target.value)}
          aria-describedby="announcement-body-count"
          className={textareaClassName}
        />
      </FormField>
      <p
        id="announcement-body-count"
        aria-live="polite"
        className={`-mt-2 text-right text-sm ${isOverLimit ? "font-bold text-red-700 dark:text-red-300" : "text-foreground/70"}`}
      >
        {body.length} / {ANNOUNCEMENT_BODY_MAX_LENGTH}文字
      </p>

      <SubmitButton pendingLabel="保存中…" disabled={!isValid}>
        下書きを保存
      </SubmitButton>
      <p className="text-sm text-foreground/70">
        保存しただけではLINEに送信されません。保存後、下の配信履歴から「自分にテスト送信」で表示を確認してから配信してください。
      </p>
    </form>
  );
}
