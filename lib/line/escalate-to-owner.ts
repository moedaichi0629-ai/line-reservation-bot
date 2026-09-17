import "server-only";
import { pushLineMessage } from "@/lib/line/push-message";
import { truncateForLineText } from "@/lib/line/truncate-text";

const MAX_QUESTION_LENGTH = 500;
const MAX_REASON_LENGTH = 200;

export type NotifyOwnerResult =
  | { ok: true }
  | { ok: false; reason: "owner_user_id_missing" }
  | { ok: false; reason: "push_failed" };

interface EscalationParams {
  question: string;
  reason: string;
  lineUserId: string | undefined;
}

/**
 * サロゲートペア（絵文字等）の境界を壊さないよう、truncateForLineTextへ委譲する。
 * 単純な`slice(0, maxLength)`は、境界がサロゲートペアの間に来た場合に
 * 孤立した上位サロゲートを生成してしまうため使わない。
 */
function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${truncateForLineText(text, maxLength)}…` : text;
}

function buildEscalationMessage(params: EscalationParams): string {
  return (
    "【要確認の問い合わせ】\n\n" +
    "質問：\n" +
    `${truncate(params.question, MAX_QUESTION_LENGTH)}\n\n` +
    "判定：\n" +
    "要スタッフ確認\n\n" +
    "理由：\n" +
    `${truncate(params.reason, MAX_REASON_LENGTH)}\n\n` +
    "ユーザーID：\n" +
    (params.lineUserId ?? "不明(グループ/ルーム)")
  );
}

/**
 * confidence=low相当（escalate）になった問い合わせをオーナーへLINE Pushで通知する。
 *
 * - OWNER_LINE_USER_ID未設定・LINE Push失敗のいずれもthrowせず、判別可能な結果を返す
 *   （このファイルの呼び出しが「通知経路を選択したこと」を表すだけで、Push配送が
 *   実際に成功したかどうかは戻り値のokで区別する。Webhook側の返信処理は止めない）。
 * - ログには秘密情報（LINE_CHANNEL_ACCESS_TOKEN）・OWNER_LINE_USER_ID・顧客のlineUserId・
 *   question/reasonの全文を一切出力しない。
 */
export async function notifyOwnerOfEscalation(
  params: EscalationParams
): Promise<NotifyOwnerResult> {
  const ownerLineUserId = process.env.OWNER_LINE_USER_ID;

  if (!ownerLineUserId) {
    console.error(
      "OWNER_LINE_USER_ID is not set; skipping escalation push notification."
    );
    return { ok: false, reason: "owner_user_id_missing" };
  }

  try {
    const text = buildEscalationMessage(params);
    await pushLineMessage(ownerLineUserId, text);
    return { ok: true };
  } catch (error) {
    console.error(
      "Failed to push escalation notification to the owner",
      error instanceof Error ? error.name : typeof error
    );
    return { ok: false, reason: "push_failed" };
  }
}
