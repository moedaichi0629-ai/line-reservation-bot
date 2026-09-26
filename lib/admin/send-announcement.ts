import "server-only";

import { isWithinSendWindow } from "@/lib/admin/announcement-policy";
import {
  claimAnnouncementForSending,
  getAnnouncementById,
  markAnnouncementFailed,
  markAnnouncementSent,
} from "@/lib/admin/announcement-repository";
import { requireAdmin } from "@/lib/admin/auth";
import { errorName } from "@/lib/admin/log";
import { isValidUuid, parseAnnouncementBody } from "@/lib/admin/schemas";
import { broadcastTextMessage, type BroadcastResult } from "@/lib/line/broadcast";

/**
 * お知らせ1件をLINE Broadcast APIで友だち全員へ配信する(管理者専用・Step 7のServer Actionから呼ぶ)。
 *
 * 二重配信対策:
 * 1. sent / sending / 送信可能期間切れ の行は事前に拒否する(分かりやすいメッセージを返すための事前チェック)
 * 2. 実際の排他は claimAnnouncementForSending() の条件付きUPDATE(draft/failed → sending)で行う。
 *    同時に2回呼ばれても、LINE APIまで進めるのは1回だけ。
 * 3. LINEへは announcements.retry_key を X-Line-Retry-Key として渡す。failedからの再送でも同じキーを使うため、
 *    前回の送信が実はLINEに受け付けられていた場合(通信エラー等)でも、LINE側で二重配信されない(409=受付済み)。
 *
 * LINE送信後にDBへの記録が失敗した場合、行はsendingのまま残る。sendingは再送禁止のため二重配信は起きないが、
 * 管理者による状態確認が必要になる(ログに記録する)。
 */

export type SendAnnouncementRejectReason =
  | "invalid_id"
  | "not_found"
  | "already_sent"
  | "already_sending"
  | "expired"
  | "invalid_body"
  | "conflict";

export type SendAnnouncementResult =
  | {
      ok: true;
      lineRequestId: string | null;
      /** 同じretry keyで既にLINEに受け付けられていた(今回新たには配信されていない)。 */
      alreadyAccepted: boolean;
      /** falseの場合、配信は成功したがDBへのsent記録に失敗した(行はsendingのまま)。 */
      recorded: boolean;
    }
  | { ok: false; reason: SendAnnouncementRejectReason; message: string }
  | { ok: false; reason: "line_error"; message: string; recorded: boolean }
  | { ok: false; reason: "db_error"; message: string };

const REJECT_MESSAGES: Record<SendAnnouncementRejectReason, string> = {
  invalid_id: "お知らせが見つかりません。",
  not_found: "お知らせが見つかりません。",
  already_sent: "このお知らせは配信済みです。同じ内容を再度送る場合は、新しく作成してください。",
  already_sending:
    "このお知らせは配信処理中です。しばらくしてから配信履歴を確認してください。",
  expired:
    "作成から時間が経っているため、このお知らせは送信できません。お手数ですが新しく作成してください。",
  invalid_body: "本文の内容に問題があるため送信できません。",
  conflict:
    "他の画面などで同じお知らせの配信処理が行われた可能性があります。配信履歴を確認してください。",
};

const DB_ERROR_MESSAGE =
  "配信の準備中にエラーが発生しました。時間をおいてもう一度お試しください。";

function reject(reason: SendAnnouncementRejectReason): SendAnnouncementResult {
  return { ok: false, reason, message: REJECT_MESSAGES[reason] };
}

/**
 * LINEの失敗を、管理画面に表示し announcements.error_message に保存する日本語の要約にする。
 * トークン等の秘密情報・APIの生レスポンスは含めない(LINEのmessageは伏せ字・長さ制限済みの値のみ)。
 */
export function describeBroadcastFailure(result: Extract<BroadcastResult, { ok: false }>): string {
  let summary: string;
  if (result.kind === "config") {
    summary = "LINEの接続設定（アクセストークン）が見つからないため、配信できませんでした。";
  } else if (result.kind === "network") {
    summary =
      "LINEとの通信に失敗しました。配信されたかどうか分からないため、LINE公式アカウントの管理画面で確認してから再送してください。";
  } else if (result.status === 401 || result.status === 403) {
    summary = "LINEの認証に失敗したため、配信できませんでした（アクセストークンの設定を確認してください）。";
  } else if (result.status === 429) {
    summary =
      "LINEの送信上限（今月のメッセージ数、または短時間の送信回数）に達したため、配信できませんでした。";
  } else if (result.status !== null && result.status >= 500) {
    summary = "LINE側で一時的なエラーが発生したため、配信できませんでした。時間をおいて再送してください。";
  } else if (result.status === 400) {
    summary = "配信内容がLINEに受け付けられませんでした。";
  } else {
    summary = "LINEへの配信依頼に失敗しました。";
  }

  if (result.status === null) {
    return summary;
  }
  const detail = result.lineMessage ? `: ${result.lineMessage}` : "";
  return `${summary}（HTTP ${result.status}${detail}）`;
}

export async function sendAnnouncement(id: string): Promise<SendAnnouncementResult> {
  await requireAdmin();

  if (!isValidUuid(id)) {
    return reject("invalid_id");
  }

  let announcement;
  try {
    announcement = await getAnnouncementById(id);
  } catch (error) {
    console.error("Failed to load announcement before sending", { id, error: errorName(error) });
    return { ok: false, reason: "db_error", message: DB_ERROR_MESSAGE };
  }

  if (!announcement) {
    return reject("not_found");
  }
  if (announcement.status === "sent") {
    return reject("already_sent");
  }
  if (announcement.status === "sending") {
    return reject("already_sending");
  }
  // 画面の表示(再試行ボタンを出すか)と同じ判定。最終的な判定は条件付きUPDATEがDB側でも行う。
  const now = new Date();
  if (!isWithinSendWindow(announcement.created_at, now)) {
    return reject("expired");
  }
  if (!parseAnnouncementBody(announcement.body).success) {
    return reject("invalid_body");
  }

  let claimed;
  try {
    claimed = await claimAnnouncementForSending(id, now);
  } catch (error) {
    console.error("Failed to start sending announcement", { id, error: errorName(error) });
    return { ok: false, reason: "db_error", message: DB_ERROR_MESSAGE };
  }

  if (!claimed) {
    // 事前チェックの後に、別の処理が先にsendingへ遷移させた(または状態が変わった)。
    return reject("conflict");
  }

  // 事前チェックとUPDATEの間に本文が書き換えられていないかを、実際に送る値で再確認する。
  const body = parseAnnouncementBody(claimed.body);
  if (!body.success) {
    await recordFailure(id, REJECT_MESSAGES.invalid_body, null);
    return reject("invalid_body");
  }

  const result = await broadcastTextMessage(body.data, claimed.retry_key);

  if (result.ok) {
    const recorded = await tryRecord(
      () => markAnnouncementSent(id, result.requestId),
      "Broadcast succeeded but recording it failed; announcement stays in sending",
      { id, lineRequestId: result.requestId },
    );
    return {
      ok: true,
      lineRequestId: result.requestId,
      alreadyAccepted: result.alreadyAccepted,
      recorded,
    };
  }

  const message = describeBroadcastFailure(result);
  console.error("LINE broadcast failed", {
    id,
    kind: result.kind,
    status: result.status,
    lineRequestId: result.requestId,
  });
  const recorded = await recordFailure(id, message, result.requestId);
  return { ok: false, reason: "line_error", message, recorded };
}

/** DBへの結果記録を試み、失敗してもthrowせずログだけ残す(行はsendingのまま=再送禁止のため二重配信は起きない)。 */
async function tryRecord(
  write: () => Promise<void>,
  logMessage: string,
  logContext: Record<string, string | null>,
): Promise<boolean> {
  try {
    await write();
    return true;
  } catch (error) {
    console.error(logMessage, { ...logContext, error: errorName(error) });
    return false;
  }
}

function recordFailure(id: string, message: string, lineRequestId: string | null): Promise<boolean> {
  return tryRecord(
    () => markAnnouncementFailed(id, message, lineRequestId),
    "Failed to record announcement failure; announcement stays in sending",
    { id },
  );
}
