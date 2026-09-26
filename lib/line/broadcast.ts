import "server-only";
import { HTTPFetchError } from "@line/bot-sdk";
import { getLineClient } from "@/lib/line/client";
import { truncateForLineText } from "@/lib/line/truncate-text";

/**
 * LINE Broadcast API(友だち全員への一斉送信)の呼び出しと結果の分類。
 * 宛先のユーザーIDは扱わない(個別Pushではなく、LINE側が友だち全員へ届ける)。
 *
 * この関数はthrowしない。成功/失敗を判別可能な結果で返し、DBへの記録は呼び出し元が行う。
 * 戻り値・ログのどちらにもアクセストークンを含めない(LINEのエラー本文も伏せ字処理してから返す)。
 */

export type BroadcastResult =
  | {
      ok: true;
      requestId: string | null;
      /** 同じretry keyのリクエストがLINEに受付済みだった(409)。今回は新たに配信されていない。 */
      alreadyAccepted: boolean;
    }
  | {
      ok: false;
      /**
       * - config : アクセストークン未設定等でリクエスト前に失敗(配信されていない)
       * - http   : LINEがエラーを返した(配信は受け付けられていない)
       * - network: 通信エラー・タイムアウト等(LINEに届いたかどうか不明)
       */
      kind: "config" | "http" | "network";
      status: number | null;
      requestId: string | null;
      /** LINEのエラー本文のmessage(伏せ字・長さ制限済み)。無い場合はnull。 */
      lineMessage: string | null;
    };

const REQUEST_ID_HEADER = "x-line-request-id";
// 409(retry key受付済み)のとき、最初に受け付けられたリクエストのIDが入る。
const ACCEPTED_REQUEST_ID_HEADER = "x-line-accepted-request-id";
const LINE_MESSAGE_MAX_LENGTH = 200;

function readHeader(headers: Headers | undefined, name: string): string | null {
  const value = headers?.get(name)?.trim();
  return value ? value : null;
}

/** アクセストークンそのもの・Bearerトークン形式の文字列を伏せ字にする。 */
export function redactSecrets(text: string): string {
  let result = text;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (token && token.length >= 8) {
    result = result.split(token).join("[REDACTED]");
  }
  return result.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

function extractLineMessage(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "message" in parsed &&
      typeof parsed.message === "string"
    ) {
      const message = redactSecrets(parsed.message).replace(/\s+/g, " ").trim();
      return message ? truncateForLineText(message, LINE_MESSAGE_MAX_LENGTH) : null;
    }
  } catch {
    // JSONでない本文(HTML等)は内容を使わない。
  }
  return null;
}

export async function broadcastTextMessage(text: string, retryKey: string): Promise<BroadcastResult> {
  let client;
  try {
    client = getLineClient();
  } catch {
    return { ok: false, kind: "config", status: null, requestId: null, lineMessage: null };
  }

  try {
    const { httpResponse } = await client.broadcastWithHttpInfo(
      { messages: [{ type: "text", text }] },
      retryKey,
    );
    return {
      ok: true,
      requestId: readHeader(httpResponse.headers, REQUEST_ID_HEADER),
      alreadyAccepted: false,
    };
  } catch (error) {
    if (error instanceof HTTPFetchError) {
      if (error.status === 409) {
        return {
          ok: true,
          requestId:
            readHeader(error.headers, ACCEPTED_REQUEST_ID_HEADER) ??
            readHeader(error.headers, REQUEST_ID_HEADER),
          alreadyAccepted: true,
        };
      }
      return {
        ok: false,
        kind: "http",
        status: error.status,
        requestId: readHeader(error.headers, REQUEST_ID_HEADER),
        lineMessage: extractLineMessage(error.body),
      };
    }
    return { ok: false, kind: "network", status: null, requestId: null, lineMessage: null };
  }
}
