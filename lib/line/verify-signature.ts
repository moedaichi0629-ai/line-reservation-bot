import { validateSignature } from "@line/bot-sdk";

/**
 * LINE Webhookの x-line-signature ヘッダーを検証する。
 * `body` は必ず生のリクエストボディ文字列（JSON.parse前）を渡すこと。
 */
export function verifyLineSignature(
  body: string,
  signature: string | null,
  channelSecret: string
): boolean {
  if (!signature) {
    return false;
  }

  return validateSignature(body, channelSecret, signature);
}
