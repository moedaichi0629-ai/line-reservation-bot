import "server-only";

import { getAnnouncementSendCutoff } from "@/lib/admin/announcement-policy";
import { requireAdmin } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { truncateForLineText } from "@/lib/line/truncate-text";
import type { Announcement } from "@/types/database";

/**
 * お知らせ配信(announcementsテーブル)のDB操作。状態遷移は migration 0003 のCHECK制約に合わせる:
 *   draft   : sending_started_at / sent_at ともにNULL
 *   sending : sending_started_at あり、sent_at NULL
 *   failed  : sending_started_at あり、sent_at NULL
 *   sent    : sending_started_at / sent_at ともにあり
 *
 * 各関数は`requireAdmin()`を自分で呼ぶ(lib/admin/faq-repository.tsと同じ多層防御方針)。
 */

// DBのCHECK制約の上限。超えると失敗を記録するUPDATE自体が失敗し、行がsendingのまま残るため必ず切り詰める。
// truncateForLineText()はUTF-16コード単位で切り詰める(サロゲートペアは壊さない)。JSの.lengthはDBの
// char_length(コードポイント数)以上になるため、ここで上限以内にすればDB制約にも必ず収まる。
const ERROR_MESSAGE_MAX_LENGTH = 500;
const LINE_REQUEST_ID_MAX_LENGTH = 100;

type AnnouncementForSending = Pick<Announcement, "id" | "body" | "retry_key">;

function toLineRequestIdColumn(lineRequestId: string | null): string | null {
  return lineRequestId === null ? null : truncateForLineText(lineRequestId, LINE_REQUEST_ID_MAX_LENGTH);
}

// 履歴として画面に出す件数(新しい順)。1日数件の配信を想定し、直近分の確認には十分な件数。
export const ANNOUNCEMENT_HISTORY_LIMIT = 50;

/** 配信履歴(新しい順、直近ANNOUNCEMENT_HISTORY_LIMIT件)。 */
export async function listAnnouncementsForAdmin(): Promise<Announcement[]> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(ANNOUNCEMENT_HISTORY_LIMIT);

  if (error) {
    throw new Error(`Failed to fetch announcements: ${error.message}`, { cause: error });
  }

  return data ?? [];
}

/** 下書きを作成する。本文は呼び出し元でparseAnnouncementBody()により検証済みであること。 */
export async function createAnnouncementDraft(body: string): Promise<Announcement> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase.from("announcements").insert({ body }).select().single();

  if (error || !data) {
    throw new Error(`Failed to create announcement: ${error?.message ?? "unknown error"}`, {
      cause: error,
    });
  }

  return data;
}

export async function getAnnouncementById(id: string): Promise<Announcement | null> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase.from("announcements").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch announcement: ${error.message}`, { cause: error });
  }

  return data;
}

/**
 * draft / failed(かつ送信可能期間内。lib/admin/announcement-policy.ts参照)の行だけを、1回の条件付きUPDATEで原子的にsendingへ遷移させる。
 * 同時に複数の送信処理が走っても、このUPDATEが成功するのは1つだけになる(残りは0件更新でnull)。
 * 再送でもretry_keyは変更しない(DBの値をそのまま返す)。
 */
export async function claimAnnouncementForSending(
  id: string,
  now: Date = new Date(),
): Promise<AnnouncementForSending | null> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("announcements")
    .update({
      status: "sending",
      sending_started_at: now.toISOString(),
      sent_at: null,
      error_message: null,
      line_request_id: null,
    })
    .eq("id", id)
    .in("status", ["draft", "failed"])
    .gte("created_at", getAnnouncementSendCutoff(now))
    .select("id, body, retry_key")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to start sending announcement: ${error.message}`, { cause: error });
  }

  return data;
}

/**
 * sendingの行だけを結果の状態(sent / failed)へ更新する(他の状態を上書きしない)。
 * 対象がsendingでなくなっていた(0件更新)場合も例外にする。
 */
async function finishSending(
  id: string,
  patch: Pick<Announcement, "status" | "sent_at" | "error_message" | "line_request_id">,
  label: string,
): Promise<void> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("announcements")
    .update(patch)
    .eq("id", id)
    .eq("status", "sending")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `Failed to mark announcement as ${label}: ${error?.message ?? "row is no longer sending"}`,
      { cause: error },
    );
  }
}

/** sending → sent。 */
export async function markAnnouncementSent(id: string, lineRequestId: string | null): Promise<void> {
  await requireAdmin();
  await finishSending(
    id,
    {
      status: "sent",
      sent_at: new Date().toISOString(),
      error_message: null,
      line_request_id: toLineRequestIdColumn(lineRequestId),
    },
    "sent",
  );
}

/** sending → failed。errorMessageは秘密情報を含まない日本語の要約であること。 */
export async function markAnnouncementFailed(
  id: string,
  errorMessage: string,
  lineRequestId: string | null,
): Promise<void> {
  await requireAdmin();
  await finishSending(
    id,
    {
      status: "failed",
      sent_at: null,
      error_message: truncateForLineText(errorMessage, ERROR_MESSAGE_MAX_LENGTH),
      line_request_id: toLineRequestIdColumn(lineRequestId),
    },
    "failed",
  );
}
