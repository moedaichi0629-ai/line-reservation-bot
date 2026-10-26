import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const DEFAULT_RATE_LIMIT_MAX_PER_HOUR = 10;
export const DEFAULT_RATE_LIMIT_MAX_PER_DAY = 30;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface RateLimitConfig {
  maxPerHour: number;
  maxPerDay: number;
}

export type RateLimitCheckResult =
  | { kind: "allowed" }
  | {
      kind: "limited";
      /** 上限をちょうど超えた1件目のときだけtrue（オーナー通知の連投を防ぐ） */
      notifyOwner: boolean;
      /** オーナー通知の「理由」欄に使う文言 */
      reason: string;
    }
  | {
      /** 回数を判定できなかった（呼び出し元は制限をかけずに通常どおり回答する） */
      kind: "unchecked";
      cause: "no_user_id" | "count_failed";
    };

/**
 * 環境変数の値を正の整数として解釈する。未設定なら初期値を黙って使い、
 * 設定されているのに不正な値（0・負数・小数・数字以外）なら警告して初期値を使う。
 */
function parsePositiveIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];

  if (raw === undefined || raw.trim() === "") {
    return defaultValue;
  }

  const trimmed = raw.trim();
  const value = Number(trimmed);

  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(value) || value <= 0) {
    console.warn(`${name} is not a positive integer; using the default value.`, {
      defaultValue,
    });
    return defaultValue;
  }

  return value;
}

export function getRateLimitConfig(): RateLimitConfig {
  return {
    maxPerHour: parsePositiveIntEnv(
      "RATE_LIMIT_MAX_PER_HOUR",
      DEFAULT_RATE_LIMIT_MAX_PER_HOUR
    ),
    maxPerDay: parsePositiveIntEnv("RATE_LIMIT_MAX_PER_DAY", DEFAULT_RATE_LIMIT_MAX_PER_DAY),
  };
}

/**
 * 指定時刻以降に、そのユーザーから受信したテキストメッセージの件数を数える。
 * テキスト以外はAIを使わないため数えない。
 */
async function countInboundTextMessagesSince(
  lineUserId: string,
  since: Date
): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { count, error } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("line_user_id", lineUserId)
    .eq("direction", "inbound")
    .eq("message_type", "text")
    .gte("created_at", since.toISOString());

  if (error) {
    throw new Error("Failed to count inbound messages", { cause: error });
  }

  return count ?? 0;
}

/**
 * お客様ごとのAI回答回数の上限（直近1時間・直近24時間）を判定する。
 *
 * 前提: 今回のメッセージの受信ログはconversationsへ保存済みであること
 * （件数に今回分が含まれるため、件数が上限を「超えた」ら制限する）。
 * 受信ログを保存できなかった場合は、呼び出し元でこの判定自体を行わないこと。
 *
 * DB障害で返信自体が止まらないよう、件数を取得できない場合は例外を投げず
 * "unchecked"を返す（呼び出し元は制限なしで通常どおり回答する）。
 *
 * - 制限中のメッセージも受信ログに残るため件数に含まれる（連投を続ける限り制限が続く）。
 * - オーナー通知（notifyOwner）は件数が「上限+1」になった1件目だけで判定する。
 *   通知済みフラグをDBに持たないため、これはベストエフォートである:
 *   同じユーザーの並行リクエストでは0回または2回になり得るほか、1時間枠・24時間枠
 *   それぞれで上限を超えるたびに通知される（ユーザーごとに1回ではない）。
 */
export async function checkUserRateLimit(
  lineUserId: string | undefined,
  now: Date = new Date()
): Promise<RateLimitCheckResult> {
  if (!lineUserId) {
    return { kind: "unchecked", cause: "no_user_id" };
  }

  const { maxPerHour, maxPerDay } = getRateLimitConfig();

  let hourCount: number;
  let dayCount: number;
  try {
    [hourCount, dayCount] = await Promise.all([
      countInboundTextMessagesSince(lineUserId, new Date(now.getTime() - HOUR_MS)),
      countInboundTextMessagesSince(lineUserId, new Date(now.getTime() - DAY_MS)),
    ]);
  } catch (error) {
    console.error(
      "Failed to check the per-user rate limit; answering without the limit.",
      error instanceof Error ? error.name : typeof error
    );
    return { kind: "unchecked", cause: "count_failed" };
  }

  const hourExceeded = hourCount > maxPerHour;
  const dayExceeded = dayCount > maxPerDay;

  if (!hourExceeded && !dayExceeded) {
    return { kind: "allowed" };
  }

  const hourReason = `送信回数の上限（1時間に${maxPerHour}件）を超えました`;
  const dayReason = `送信回数の上限（24時間に${maxPerDay}件）を超えました`;

  if (hourCount === maxPerHour + 1) {
    return { kind: "limited", notifyOwner: true, reason: hourReason };
  }
  if (dayCount === maxPerDay + 1) {
    return { kind: "limited", notifyOwner: true, reason: dayReason };
  }

  return {
    kind: "limited",
    notifyOwner: false,
    reason: hourExceeded ? hourReason : dayReason,
  };
}
