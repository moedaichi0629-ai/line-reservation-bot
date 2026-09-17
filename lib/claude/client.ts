import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let cachedClient: Anthropic | undefined;

/**
 * Anthropic Claude APIクライアント。
 * Client Componentからは絶対にimportしないこと（"server-only"がビルド時に検知する）。
 */
export function getClaudeClient(): Anthropic {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY must be set in the environment.");
  }

  cachedClient = new Anthropic({ apiKey });

  return cachedClient;
}
