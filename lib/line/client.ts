import "server-only";
import { messagingApi } from "@line/bot-sdk";

let cachedClient: messagingApi.MessagingApiClient | undefined;

/**
 * LINE Messaging APIクライアント（Reply APIなどの呼び出しに使用）。
 * Client Componentからは絶対にimportしないこと（"server-only"がビルド時に検知する）。
 */
export function getLineClient(): messagingApi.MessagingApiClient {
  if (cachedClient) {
    return cachedClient;
  }

  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelAccessToken) {
    throw new Error(
      "LINE_CHANNEL_ACCESS_TOKEN must be set in the environment."
    );
  }

  cachedClient = new messagingApi.MessagingApiClient({ channelAccessToken });

  return cachedClient;
}
