import { NextResponse } from "next/server";
import type { webhook } from "@line/bot-sdk";
import { verifyLineSignature } from "@/lib/line/verify-signature";
import { getLineClient } from "@/lib/line/client";
import { truncateForLineText } from "@/lib/line/truncate-text";
import { notifyOwnerOfEscalation } from "@/lib/line/escalate-to-owner";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { answerUserQuestion } from "@/lib/faq/answer-user-question";
import {
  API_FAILURE_REPLY_TEXT,
  LOW_CONFIDENCE_REPLY_TEXT,
} from "@/lib/faq/reply-templates";
import type { ConversationConfidence } from "@/types/database";

const NON_TEXT_REPLY_TEXT = "テキストメッセージのみ対応しています。";

/** PostgreSQLのunique_violationエラーコード。line_message_idの再送重複を検知するために使う。 */
const POSTGRES_UNIQUE_VIOLATION_CODE = "23505";

type LineMessageContentType = webhook.MessageContent["type"];

/**
 * エラーオブジェクトをログへ安全な形（名前/型のみ）に縮小する。
 * 生のerrorオブジェクトをそのままconsole.errorへ渡すと、HTTPクライアントが
 * 例外にリクエスト設定（Authorizationヘッダー等の秘密情報を含み得る）を
 * 保持している場合に、意図せずログへ混入するおそれがあるため使わない。
 */
function safeErrorLogValue(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

export async function POST(request: Request): Promise<NextResponse> {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!channelSecret) {
    console.error("LINE_CHANNEL_SECRET is not set.");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  // 署名検証には生のリクエストボディが必要なため、必ずJSONパースより先にtext()で取得する。
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let callback: webhook.CallbackRequest;
  try {
    callback = JSON.parse(rawBody) as webhook.CallbackRequest;
  } catch (error) {
    console.error("Failed to parse LINE webhook body as JSON", safeErrorLogValue(error));
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!callback || typeof callback !== "object" || !Array.isArray(callback.events)) {
    // callbackには質問文・lineUserId等の顧客データが含まれ得るため、
    // 生のオブジェクトはログへ出さず、形状の要約のみを記録する。
    console.error("LINE webhook body has an unexpected shape", {
      type: typeof callback,
      keys:
        callback && typeof callback === "object" ? Object.keys(callback) : undefined,
    });
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  // 署名検証を通過した後の想定外エラーはLINEのリトライによる二重処理を避けるため200を返す。
  try {
    const results = await Promise.allSettled(
      callback.events.map((event) => handleEvent(event))
    );

    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Failed to handle a LINE webhook event", safeErrorLogValue(result.reason));
      }
    }
  } catch (error) {
    console.error("Unexpected error while handling LINE webhook events", safeErrorLogValue(error));
  }

  return NextResponse.json({ status: "ok" }, { status: 200 });
}

async function handleEvent(event: webhook.Event): Promise<void> {
  if (event.type !== "message") {
    return;
  }

  await handleMessageEvent(event);
}

async function handleMessageEvent(event: webhook.MessageEvent): Promise<void> {
  const { replyToken, message } = event;

  if (!replyToken) {
    return;
  }

  const lineUserId = event.source?.userId;

  // line_message_id にはDB側でunique indexが張られているため、Webhook再送で
  // 同じメッセージが2度届いた場合はここでinsertがunique_violationになる。
  // これを「既に処理済み」の合図として使い、Claude API呼び出しとオーナーPushの
  // 二重実行を防ぐ（DB障害時は"failed"を返し、Phase1同様に返信自体は止めない）。
  const inboundLogResult = await logConversation({
    lineUserId,
    direction: "inbound",
    messageType: message.type,
    messageText: message.type === "text" ? message.text : null,
    lineMessageId: message.id,
    rawEvent: event,
  });

  if (inboundLogResult === "duplicate") {
    console.warn(
      "Skipping a LINE message that was already processed (duplicate webhook delivery).",
      { webhookEventId: event.webhookEventId, isRedelivery: event.deliveryContext?.isRedelivery }
    );
    return;
  }

  try {
    await processMessage({ replyToken, lineUserId, message });
  } catch (error) {
    // 応答の途中で失敗した場合、inbound側の重複防止レコードだけが残ってしまうと、
    // LINEからの正当な再送がここで"duplicate"扱いされ、ユーザーへ永久に返信できなくなる。
    // そのため、実際に処理に失敗した場合はinboundログを取り消し、次回の再送を通す。
    if (inboundLogResult === "inserted") {
      await deleteInboundConversationLog(message.id);
    }
    throw error;
  }
}

async function processMessage(params: {
  replyToken: string;
  lineUserId: string | undefined;
  message: webhook.MessageContent;
}): Promise<void> {
  const { replyToken, lineUserId, message } = params;

  if (message.type !== "text") {
    await replyAndLog({ replyToken, lineUserId, replyText: NON_TEXT_REPLY_TEXT });
    return;
  }

  const result = await answerUserQuestion(message.text);

  if (result.kind === "answer") {
    const replyText = truncateForLineText(result.answer);
    await replyAndLog({
      replyToken,
      lineUserId,
      replyText,
      confidence: result.confidence,
      matchedFaqIds: result.matchedFaqIds,
      escalated: false,
    });
    return;
  }

  if (result.kind === "escalate") {
    // Claudeが生成したanswer本文は、根拠不十分な断定回答である可能性があるため
    // 絶対にユーザーへ送らない。固定文言のみを返信する。
    await replyAndLog({
      replyToken,
      lineUserId,
      replyText: LOW_CONFIDENCE_REPLY_TEXT,
      confidence: "low",
      matchedFaqIds: result.matchedFaqIds,
      escalated: true,
    });

    // Push失敗はnotifyOwnerOfEscalation内部でthrowされないため、
    // ここでの失敗によってユーザーへの返信処理が壊れることはない。
    await notifyOwnerOfEscalation({
      question: message.text,
      reason: result.reason,
      lineUserId,
    });
    return;
  }

  // fallback-error: Claude API障害・構造化出力の解析失敗・FAQ取得障害など。
  // confidence=lowとは別扱いのため、オーナーへは通知しない。
  // errorTypeは秘密情報・質問全文を含まない安全な分類値のため、サーバーログにのみ記録する。
  console.error("Answering via the fallback-error path", { errorType: result.errorType });

  await replyAndLog({
    replyToken,
    lineUserId,
    replyText: API_FAILURE_REPLY_TEXT,
    confidence: null,
    matchedFaqIds: null,
    escalated: false,
  });
}

interface ReplyAndLogParams {
  replyToken: string;
  lineUserId: string | undefined;
  replyText: string;
  confidence?: ConversationConfidence | null;
  matchedFaqIds?: string[] | null;
  escalated?: boolean;
}

async function replyAndLog(params: ReplyAndLogParams): Promise<void> {
  const replyResponse = await getLineClient().replyMessage({
    replyToken: params.replyToken,
    messages: [{ type: "text", text: params.replyText }],
  });

  await logConversation({
    lineUserId: params.lineUserId,
    direction: "outbound",
    messageType: "text",
    messageText: params.replyText,
    lineMessageId: replyResponse.sentMessages?.[0]?.id ?? null,
    rawEvent: null,
    confidence: params.confidence ?? null,
    matchedFaqIds: params.matchedFaqIds ?? null,
    escalated: params.escalated ?? false,
  });
}

/**
 * inbound側の重複防止ログを取り消す（応答処理が完遂できなかった場合の補償操作）。
 * これ自体が失敗してもthrowせず、ログにのみ記録する
 * （最悪の場合でも次回のLINE再送がline_message_idのunique_violationで
 * "duplicate"と誤判定され続けるだけで、新たな二重送信は発生しない）。
 */
async function deleteInboundConversationLog(lineMessageId: string): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("line_message_id", lineMessageId)
      .eq("direction", "inbound");

    if (error) {
      console.error(
        "Failed to roll back the inbound conversation log after a processing failure",
        safeErrorLogValue(error)
      );
    }
  } catch (error) {
    console.error(
      "Unexpected error while rolling back the inbound conversation log",
      safeErrorLogValue(error)
    );
  }
}

type LogConversationResult = "inserted" | "duplicate" | "skipped" | "failed";

interface LogConversationParams {
  lineUserId: string | undefined;
  direction: "inbound" | "outbound";
  messageType: LineMessageContentType;
  messageText: string | null;
  lineMessageId: string | null;
  rawEvent: unknown;
  confidence?: ConversationConfidence | null;
  matchedFaqIds?: string[] | null;
  escalated?: boolean;
}

/**
 * conversationsテーブルへのログ記録。DB障害でLINEへの返信自体が止まらないよう、
 * 失敗してもログに残すだけで例外を投げない。
 *
 * inbound方向でline_message_idがunique_violationになった場合は"duplicate"を返す
 * （Webhook再送の検知に使う）。それ以外のDB失敗は"failed"を返すが、
 * 呼び出し元は従来どおり処理を継続する。
 */
async function logConversation(
  params: LogConversationParams
): Promise<LogConversationResult> {
  if (!params.lineUserId) {
    console.warn(
      "Skipping conversation log because line_user_id is unavailable (group/room chat without userId)."
    );
    return "skipped";
  }

  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("conversations").insert({
      line_user_id: params.lineUserId,
      direction: params.direction,
      message_type: params.messageType,
      message_text: params.messageText,
      line_message_id: params.lineMessageId,
      raw_event: params.rawEvent,
      confidence: params.confidence ?? null,
      matched_faq_ids: params.matchedFaqIds ?? null,
      escalated: params.escalated ?? false,
    });

    if (error) {
      if (params.direction === "inbound" && error.code === POSTGRES_UNIQUE_VIOLATION_CODE) {
        return "duplicate";
      }
      console.error("Failed to insert conversation log", safeErrorLogValue(error));
      return "failed";
    }

    return "inserted";
  } catch (error) {
    console.error("Unexpected error while inserting conversation log", safeErrorLogValue(error));
    return "failed";
  }
}
