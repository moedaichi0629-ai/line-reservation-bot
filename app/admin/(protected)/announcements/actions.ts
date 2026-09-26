"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import {
  BROADCAST_CONFIRMATION,
  TEST_SEND_CONFIRMATION,
  describeSendAnnouncementResult,
} from "@/lib/admin/announcement-policy";
import { createAnnouncementDraft } from "@/lib/admin/announcement-repository";
import { requireAdmin } from "@/lib/admin/auth";
import { ADMIN_ANNOUNCEMENTS_PATH } from "@/lib/admin/constants";
import { buildFlashUrl, type Flash } from "@/lib/admin/flash";
import { readStringField } from "@/lib/admin/form-data";
import { errorName } from "@/lib/admin/log";
import { parseAnnouncementBody } from "@/lib/admin/schemas";
import { sendAnnouncement } from "@/lib/admin/send-announcement";
import { sendTestAnnouncementToOwner } from "@/lib/admin/send-test-announcement";

/**
 * お知らせ配信画面のServer Action。すべて最初にrequireAdmin()を呼ぶ。
 * LINE・Supabaseへのアクセスはlib/admin配下のサーバー専用モジュールだけが行い、
 * 宛先(OWNER_LINE_USER_ID)・トークンはここを含めブラウザへ返す値に一切含めない。
 */

export type AnnouncementFormState = { error: string } | null;

const GENERIC_SAVE_ERROR = "保存に失敗しました。時間をおいて再度お試しください。";
const NOT_CONFIRMED_ERROR = "確認画面から操作してください。送信は行っていません。";
const UNEXPECTED_SEND_ERROR =
  "配信状況を確認できませんでした。二重配信を防ぐため再送せず、配信履歴で状態を確認してください。";
const UNEXPECTED_TEST_SEND_ERROR = "送信に失敗しました。時間をおいてもう一度お試しください。";

function flashUrl(flash: Flash): string {
  return buildFlashUrl(ADMIN_ANNOUNCEMENTS_PATH, flash);
}

function logAnnouncementActionError(action: string, error: unknown): void {
  console.error(`[admin-announcements] ${action} failed:`, errorName(error));
}

export async function createAnnouncementDraftAction(
  _previousState: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  await requireAdmin();

  const parsed = parseAnnouncementBody(formData.get("body"));
  if (!parsed.success) {
    return { error: parsed.error };
  }

  try {
    await createAnnouncementDraft(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    logAnnouncementActionError("create draft", error);
    return { error: GENERIC_SAVE_ERROR };
  }

  // savedは下書きを保存したときだけ付ける。画面側はこれを合図に入力欄を空にする
  // (配信・テスト送信の後は付けず、入力途中の新しいお知らせを消さない)。
  redirect(
    buildFlashUrl(
      ADMIN_ANNOUNCEMENTS_PATH,
      { kind: "success", message: "下書きを保存しました。" },
      { saved: String(Date.now()) },
    ),
  );
}

/** 友だち全員への配信(初回・failedからの再試行とも)。二重配信対策はsendAnnouncement()側が担う。 */
export async function sendAnnouncementAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = readStringField(formData, "id");
  if (!id || formData.get("confirmation") !== BROADCAST_CONFIRMATION) {
    redirect(flashUrl({ kind: "error", message: NOT_CONFIRMED_ERROR }));
  }

  let flash: Flash;
  try {
    flash = describeSendAnnouncementResult(await sendAnnouncement(id));
  } catch (error) {
    unstable_rethrow(error);
    logAnnouncementActionError("broadcast", error);
    flash = { kind: "warning", message: UNEXPECTED_SEND_ERROR };
  }

  redirect(flashUrl(flash));
}

/** 管理者(OWNER_LINE_USER_ID)だけへのテスト送信。宛先はブラウザから受け取らない。 */
export async function sendTestAnnouncementAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = readStringField(formData, "id");
  if (!id || formData.get("confirmation") !== TEST_SEND_CONFIRMATION) {
    redirect(flashUrl({ kind: "error", message: NOT_CONFIRMED_ERROR }));
  }

  let flash: Flash;
  try {
    const result = await sendTestAnnouncementToOwner(id);
    flash = { kind: result.ok ? "success" : "error", message: result.message };
  } catch (error) {
    unstable_rethrow(error);
    logAnnouncementActionError("test send", error);
    flash = { kind: "error", message: UNEXPECTED_TEST_SEND_ERROR };
  }

  redirect(flashUrl(flash));
}
