import "server-only";

import { getAnnouncementView } from "@/lib/admin/announcement-policy";
import { getAnnouncementById } from "@/lib/admin/announcement-repository";
import { requireAdmin } from "@/lib/admin/auth";
import { errorName } from "@/lib/admin/log";
import { isValidUuid, parseAnnouncementBody } from "@/lib/admin/schemas";
import { pushLineMessage } from "@/lib/line/push-message";

/**
 * お知らせを管理者(OWNER_LINE_USER_ID)のLINEだけにテスト送信する(表示確認用)。
 *
 * - Broadcast APIは使わない。既存のPush API(pushLineMessage)で1人にだけ送る。
 * - 宛先はサーバーの環境変数OWNER_LINE_USER_IDのみ。ブラウザから宛先を指定する経路は無く、
 *   宛先IDは戻り値にもログにも出さない。
 * - announcementsテーブルは読むだけで一切更新しない(status・retry_key・日時は本番配信用のまま)。
 */

export type SendTestAnnouncementResult =
  | { ok: true; message: string }
  | {
      ok: false;
      reason:
        | "invalid_id"
        | "not_found"
        | "not_sendable"
        | "invalid_body"
        | "owner_not_configured"
        | "db_error"
        | "push_failed";
      message: string;
    };

const TEST_SEND_SUCCESS_MESSAGE = "管理者のLINEへテスト送信しました。";

const FAILURE_MESSAGES = {
  invalid_id: "お知らせが見つかりません。",
  not_found: "お知らせが見つかりません。",
  not_sendable: "このお知らせはテスト送信できる状態ではありません（配信済み・配信処理中・期限切れ）。",
  invalid_body: "本文の内容に問題があるため送信できません。",
  owner_not_configured:
    "テスト送信先（管理者のLINE）が設定されていないため、送信できませんでした。",
  db_error: "送信に失敗しました。時間をおいてもう一度お試しください。",
  push_failed:
    "送信に失敗しました。LINEの送信上限に達しているか、接続設定に問題がある可能性があります。",
} as const;

function fail(reason: keyof typeof FAILURE_MESSAGES): SendTestAnnouncementResult {
  return { ok: false, reason, message: FAILURE_MESSAGES[reason] };
}

export async function sendTestAnnouncementToOwner(id: string): Promise<SendTestAnnouncementResult> {
  await requireAdmin();

  if (!isValidUuid(id)) {
    return fail("invalid_id");
  }

  let announcement;
  try {
    announcement = await getAnnouncementById(id);
  } catch (error) {
    console.error("Failed to load announcement for test send", {
      id,
      error: errorName(error),
    });
    return fail("db_error");
  }

  if (!announcement) {
    return fail("not_found");
  }
  // 画面でテスト送信ボタンを出す条件と同じ(まだ本番配信できる状態のときだけ)。
  if (!getAnnouncementView(announcement).canTestSend) {
    return fail("not_sendable");
  }

  const body = parseAnnouncementBody(announcement.body);
  if (!body.success) {
    return fail("invalid_body");
  }

  const ownerLineUserId = process.env.OWNER_LINE_USER_ID?.trim();
  if (!ownerLineUserId) {
    console.error("OWNER_LINE_USER_ID is not set; skipping announcement test send.");
    return fail("owner_not_configured");
  }

  try {
    await pushLineMessage(ownerLineUserId, body.data);
  } catch (error) {
    console.error("Failed to push announcement test message to the owner", {
      id,
      error: errorName(error),
    });
    return fail("push_failed");
  }

  return { ok: true, message: TEST_SEND_SUCCESS_MESSAGE };
}
