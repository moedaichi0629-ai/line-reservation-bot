import "server-only";
import type { messagingApi } from "@line/bot-sdk";
import { getLineClient } from "@/lib/line/client";

/**
 * 指定したLINEユーザーIDへテキストメッセージをPush送信する。
 * 既存のgetLineClient()（シングルトン）を再利用し、新しいLINEクライアントは生成しない。
 * LINE API呼び出しの失敗はそのままthrowする（呼び出し元でハンドリングする設計）。
 */
export async function pushLineMessage(
  to: string,
  text: string
): Promise<messagingApi.PushMessageResponse> {
  return getLineClient().pushMessage({
    to,
    messages: [{ type: "text", text }],
  });
}
