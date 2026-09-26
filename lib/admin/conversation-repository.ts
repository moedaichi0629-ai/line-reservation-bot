import "server-only";

import { requireAdmin } from "@/lib/admin/auth";
import { maskLineUserId } from "@/lib/admin/conversation-labels";
import { isValidUuid } from "@/lib/admin/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ConversationConfidence, ConversationDirection } from "@/types/database";

/**
 * 管理画面用の会話ログ取得(読み取り専用)。
 *
 * - conversationsテーブルへの書き込み(insert/update/delete/upsert)は一切行わない。
 *   ログの保存はWebhook(app/api/line/webhook/route.ts)だけが担う。
 * - 各関数は`requireAdmin()`を自分で呼ぶ(faq/menu-repositoryと同じ多層防御方針)。
 * - 画面へ返すのは表示用DTOのみ。raw_event(LINEの生イベント)と完全なLINEユーザーIDは
 *   selectもせず、DTOにも含めない。お客様の識別は「お客様（末尾xxxx）」と、
 *   URL用の不透明なキー(そのお客様の会話ログ行のuuid)で行う。
 */

// 一覧は「直近N件のログ」からお客様ごとにまとめる(DB変更なしでGROUP BYを避けるため)。
export const CUSTOMER_LIST_SCAN_LIMIT = 500;
// 「スタッフ確認あり」絞り込み時に遡るエスカレーション件数の上限。
export const ESCALATED_SCAN_LIMIT = 200;
// 詳細画面で1ページに表示するメッセージ(行)数。
export const THREAD_PAGE_SIZE = 50;

// raw_eventはselectしない。line_user_idはサーバー内のグループ化にのみ使い、DTOには入れない。
const LIST_COLUMNS = "id, line_user_id, direction, message_type, message_text, escalated, created_at";
const THREAD_COLUMNS =
  "id, direction, message_type, message_text, confidence, matched_faq_ids, escalated, created_at";

export type CustomerFilter = "all" | "needs-staff";

export type CustomerSummary = {
  /** 詳細画面へのURLに使う不透明なキー(そのお客様の最新の会話ログ行のid)。 */
  key: string;
  customerLabel: string;
  lastActivityAt: string;
  /** お客様から届いた最新のメッセージ(取得範囲内に無い場合はnull)。 */
  latestCustomerMessage: { messageType: string; messageText: string | null } | null;
  needsStaffCheck: boolean;
};

type ListRow = {
  id: string;
  line_user_id: string;
  direction: ConversationDirection;
  message_type: string;
  message_text: string | null;
  escalated: boolean;
  created_at: string;
};

/**
 * created_at降順の行を、お客様ごとにまとめる(最初に現れた=最新の行の順序を保つ)。
 */
export function summarizeCustomers(rows: ListRow[]): CustomerSummary[] {
  const summaries = new Map<string, CustomerSummary>();

  for (const row of rows) {
    let summary = summaries.get(row.line_user_id);
    if (!summary) {
      summary = {
        key: row.id,
        customerLabel: maskLineUserId(row.line_user_id),
        lastActivityAt: row.created_at,
        latestCustomerMessage: null,
        needsStaffCheck: false,
      };
      summaries.set(row.line_user_id, summary);
    }

    if (row.direction === "inbound" && summary.latestCustomerMessage === null) {
      summary.latestCustomerMessage = {
        messageType: row.message_type,
        messageText: row.message_text,
      };
    }
    if (row.escalated) {
      summary.needsStaffCheck = true;
    }
  }

  return [...summaries.values()];
}

export async function listRecentCustomers(filter: CustomerFilter = "all"): Promise<CustomerSummary[]> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  if (filter === "all") {
    const { data, error } = await supabase
      .from("conversations")
      .select(LIST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(CUSTOMER_LIST_SCAN_LIMIT);

    if (error) {
      throw new Error(`Failed to fetch conversations: ${error.message}`, { cause: error });
    }
    return summarizeCustomers(data ?? []);
  }

  // 「スタッフ確認あり」: まずエスカレーションされた行からお客様を特定し(部分インデックス利用)、
  // そのお客様たちの直近のやり取りを取得する。直近N件のスキャン範囲外にある古い
  // エスカレーションも拾えるよう、全体スキャンとは別のクエリにしている。
  const { data: escalatedRows, error: escalatedError } = await supabase
    .from("conversations")
    .select(LIST_COLUMNS)
    .eq("escalated", true)
    .order("created_at", { ascending: false })
    .limit(ESCALATED_SCAN_LIMIT);

  if (escalatedError) {
    throw new Error(`Failed to fetch escalated conversations: ${escalatedError.message}`, {
      cause: escalatedError,
    });
  }

  const escalatedUserIds = [...new Set((escalatedRows ?? []).map((row) => row.line_user_id))];
  if (escalatedUserIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("conversations")
    .select(LIST_COLUMNS)
    .in("line_user_id", escalatedUserIds)
    .order("created_at", { ascending: false })
    .limit(CUSTOMER_LIST_SCAN_LIMIT);

  if (error) {
    throw new Error(`Failed to fetch conversations: ${error.message}`, { cause: error });
  }

  // 2回目のクエリの上限は対象のお客様全員で共有のため、やり取りの多いお客様に押し出されて
  // 別のお客様の行が1件も入らないことがある。その場合でも一覧から漏れないよう、
  // そのお客様の最新のエスカレーション行から要約を作って補う。
  const summarizedUsers = new Set((data ?? []).map((row) => row.line_user_id));
  const missingRows = (escalatedRows ?? []).filter((row) => !summarizedUsers.has(row.line_user_id));
  const summaries = [...summarizeCustomers(data ?? []), ...summarizeCustomers(missingRows)];

  // 絞り込み対象は定義上すべて「スタッフ確認あり」。直近行のスキャン範囲に
  // エスカレーション行自体が入っていなくても表示を揃える。
  return summaries
    .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt))
    .map((summary) => ({ ...summary, needsStaffCheck: true }));
}

export type MatchedFaq = {
  id: string;
  /** FAQが削除済み・取得できなかった場合はnull。 */
  question: string | null;
};

export type CustomerMessage = {
  id: string;
  messageType: string;
  messageText: string | null;
  createdAt: string;
};

export type BotReply = {
  id: string;
  messageText: string | null;
  confidence: ConversationConfidence | null;
  escalated: boolean;
  matchedFaqs: MatchedFaq[];
  createdAt: string;
};

/** お客様のメッセージ1件と、それに対するBotの返信のまとまり。 */
export type ConversationExchange = {
  /** ページ境界でお客様側のメッセージが前のページにある場合はnull。 */
  customerMessage: CustomerMessage | null;
  botReplies: BotReply[];
};

export type ConversationThread = {
  customerLabel: string;
  /** 新しいやり取りが先頭。 */
  exchanges: ConversationExchange[];
  /** さらに古いやり取りがある場合の続き取得用カーソル(ISO 8601)。無ければnull。 */
  olderCursor: string | null;
};

type ThreadRow = {
  id: string;
  direction: ConversationDirection;
  message_type: string;
  message_text: string | null;
  confidence: ConversationConfidence | null;
  matched_faq_ids: string[] | null;
  escalated: boolean;
  created_at: string;
};

/**
 * 時系列(古い順)の行を「お客様のメッセージ → Botの返信」のまとまりに分け、新しい順に並べて返す。
 */
export function buildExchanges(
  chronologicalRows: ThreadRow[],
  faqQuestions: Map<string, string>,
): ConversationExchange[] {
  const exchanges: ConversationExchange[] = [];

  for (const row of chronologicalRows) {
    if (row.direction === "inbound") {
      exchanges.push({
        customerMessage: {
          id: row.id,
          messageType: row.message_type,
          messageText: row.message_text,
          createdAt: row.created_at,
        },
        botReplies: [],
      });
      continue;
    }

    const reply: BotReply = {
      id: row.id,
      messageText: row.message_text,
      confidence: row.confidence,
      escalated: row.escalated,
      matchedFaqs: (row.matched_faq_ids ?? []).map((id) => ({
        id,
        question: faqQuestions.get(id) ?? null,
      })),
      createdAt: row.created_at,
    };

    const current = exchanges.at(-1);
    if (current) {
      current.botReplies.push(reply);
    } else {
      exchanges.push({ customerMessage: null, botReplies: [reply] });
    }
  }

  return exchanges.reverse();
}

// PostgRESTが返すtimestamptzのISO形式(マイクロ秒・タイムゾーン付き)。
const CURSOR_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

/**
 * 続き取得用カーソルの検証。不正な値はnull(=最新から表示)として扱う。
 * DBの値はマイクロ秒精度のため、ミリ秒に丸めずそのまま使う(丸めると同じミリ秒内の
 * 行がページの境目で読み飛ばされる)。URLの"+"はLinkのquery指定でエンコードされる。
 */
export function normalizeCursor(value: string | undefined): string | null {
  if (!value || !CURSOR_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    return null;
  }
  return value;
}

async function fetchFaqQuestions(faqIds: string[]): Promise<Map<string, string>> {
  const questions = new Map<string, string>();
  const validIds = [...new Set(faqIds)].filter(isValidUuid);
  if (validIds.length === 0) {
    return questions;
  }

  const { data, error } = await createSupabaseServerClient()
    .from("faq")
    .select("id, question")
    .in("id", validIds);

  if (error) {
    // FAQ名が取れなくても会話ログ自体は表示できるため、画面全体は失敗させない。
    console.error("Failed to fetch FAQ questions for conversation log", { code: error.code });
    return questions;
  }

  for (const faq of data ?? []) {
    questions.set(faq.id, faq.question);
  }
  return questions;
}

/**
 * 1人のお客様とのやり取りを取得する。`key`はそのお客様の任意の会話ログ行のid。
 * 該当する行が無い(または形式が不正な)場合はnull。
 */
export async function getConversationThread(
  key: string,
  before?: string,
): Promise<ConversationThread | null> {
  await requireAdmin();

  if (!isValidUuid(key)) {
    return null;
  }

  const supabase = createSupabaseServerClient();

  const { data: anchor, error: anchorError } = await supabase
    .from("conversations")
    .select("line_user_id")
    .eq("id", key)
    .maybeSingle();

  if (anchorError) {
    throw new Error(`Failed to fetch conversation: ${anchorError.message}`, { cause: anchorError });
  }
  if (!anchor) {
    return null;
  }

  let query = supabase
    .from("conversations")
    .select(THREAD_COLUMNS)
    .eq("line_user_id", anchor.line_user_id);

  const cursor = normalizeCursor(before);
  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  // 1件多く取得して、さらに古いやり取りがあるかを判定する。
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(THREAD_PAGE_SIZE + 1);

  if (error) {
    throw new Error(`Failed to fetch conversation thread: ${error.message}`, { cause: error });
  }

  const rows = data ?? [];
  const hasOlder = rows.length > THREAD_PAGE_SIZE;
  const pageRows = rows.slice(0, THREAD_PAGE_SIZE);
  const oldestRow = pageRows.at(-1);

  const faqQuestions = await fetchFaqQuestions(pageRows.flatMap((row) => row.matched_faq_ids ?? []));

  return {
    customerLabel: maskLineUserId(anchor.line_user_id),
    exchanges: buildExchanges([...pageRows].reverse(), faqQuestions),
    olderCursor: hasOlder && oldestRow ? normalizeCursor(oldestRow.created_at) : null,
  };
}
