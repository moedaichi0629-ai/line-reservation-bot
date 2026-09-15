import { NextResponse } from "next/server";
import type { webhook } from "@line/bot-sdk";
import { verifyLineSignature } from "@/lib/line/verify-signature";
import { getLineClient } from "@/lib/line/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const NON_TEXT_REPLY_TEXT = "テキストメッセージのみ対応しています。";

type LineMessageContentType = webhook.MessageContent["type"];

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
    console.error("Failed to parse LINE webhook body as JSON", error);
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!callback || typeof callback !== "object" || !Array.isArray(callback.events)) {
    console.error("LINE webhook body has an unexpected shape", callback);
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  // 署名検証を通過した後の想定外エラーはLINEのリトライによる二重処理を避けるため200を返す。
  try {
    const results = await Promise.allSettled(
      callback.events.map((event) => handleEvent(event))
    );

    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Failed to handle a LINE webhook event", result.reason);
      }
    }
  } catch (error) {
    console.error("Unexpected error while handling LINE webhook events", error);
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
  const isText = message.type === "text";
  const replyText = isText ? message.text : NON_TEXT_REPLY_TEXT;

  await logConversation({
    lineUserId,
    direction: "inbound",
    messageType: message.type,
    messageText: isText ? message.text : null,
    lineMessageId: message.id,
    rawEvent: event,
  });

  const replyResponse = await getLineClient().replyMessage({
    replyToken,
    messages: [{ type: "text", text: replyText }],
  });

  await logConversation({
    lineUserId,
    direction: "outbound",
    messageType: "text",
    messageText: replyText,
    lineMessageId: replyResponse.sentMessages?.[0]?.id ?? null,
    rawEvent: null,
  });
}

interface LogConversationParams {
  lineUserId: string | undefined;
  direction: "inbound" | "outbound";
  messageType: LineMessageContentType;
  messageText: string | null;
  lineMessageId: string | null;
  rawEvent: unknown;
}

/**
 * conversationsテーブルへのログ記録。DB障害でLINEへの返信自体が止まらないよう、
 * 失敗してもログに残すだけで例外を投げない。
 */
async function logConversation(params: LogConversationParams): Promise<void> {
  if (!params.lineUserId) {
    console.warn(
      "Skipping conversation log because line_user_id is unavailable (group/room chat without userId)."
    );
    return;
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
    });

    if (error) {
      console.error("Failed to insert conversation log", error);
    }
  } catch (error) {
    console.error("Unexpected error while inserting conversation log", error);
  }
}
