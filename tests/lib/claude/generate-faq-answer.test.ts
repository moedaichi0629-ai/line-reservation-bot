import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Faq } from "@/types/database";
import Anthropic, { RetryableError } from "@anthropic-ai/sdk";

const mockParse = vi.fn();

vi.mock("@/lib/claude/client", () => ({
  getClaudeClient: vi.fn(() => ({
    messages: { parse: mockParse },
  })),
}));

import { generateFaqAnswer } from "@/lib/claude/generate-faq-answer";
import { getClaudeClient } from "@/lib/claude/client";

const mockGetClaudeClient = vi.mocked(getClaudeClient);

const QUESTION = "営業時間を教えて";

const SAMPLE_FAQS: Faq[] = [
  {
    id: "faq-1",
    question: "営業時間は？",
    answer: "10:00〜19:00です。",
    category: "営業時間",
    display_order: 0,
    is_published: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

const VALID_OUTPUT = {
  answer: "10:00〜19:00です。",
  confidence: "high" as const,
  matchedFaqIds: ["faq-1"],
  reason: "FAQに営業時間が直接記載されている",
};

beforeEach(() => {
  mockParse.mockReset();
  mockGetClaudeClient.mockClear();
  const mockClient = { messages: { parse: mockParse } };
  mockGetClaudeClient.mockReturnValue(mockClient as unknown as Anthropic);
});

describe("generateFaqAnswer", () => {
  it("正常なStructured Outputを受け取るとparsed結果を返す", async () => {
    mockParse.mockResolvedValue({ parsed_output: VALID_OUTPUT });

    const result = await generateFaqAnswer(QUESTION, SAMPLE_FAQS);

    expect(result).toEqual({ kind: "parsed", output: VALID_OUTPUT });
  });

  it("Claude APIを1回だけ呼び出す（カテゴリ判定などの複数回呼び出しをしない）", async () => {
    mockParse.mockResolvedValue({ parsed_output: VALID_OUTPUT });

    await generateFaqAnswer(QUESTION, SAMPLE_FAQS);

    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it("model/system/messages/output_config/timeout/maxRetriesを正しく指定して呼び出す", async () => {
    mockParse.mockResolvedValue({ parsed_output: VALID_OUTPUT });

    await generateFaqAnswer(QUESTION, SAMPLE_FAQS);

    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system: expect.any(String),
        messages: [{ role: "user", content: expect.any(String) }],
        output_config: expect.objectContaining({
          format: expect.any(Object),
          effort: "low",
        }),
      }),
      { timeout: 8000, maxRetries: 0 }
    );
  });

  it("parsed_outputがnullの場合はparse-failedを返す", async () => {
    mockParse.mockResolvedValue({ parsed_output: null });

    const result = await generateFaqAnswer(QUESTION, SAMPLE_FAQS);

    expect(result).toEqual({ kind: "parse-failed" });
  });

  it("Structured Outputの解析・スキーマ検証に失敗した場合（AnthropicErrorだがAPIErrorではない）はparse-failedを返す", async () => {
    mockParse.mockRejectedValue(
      new Anthropic.AnthropicError("Failed to parse structured output: invalid JSON")
    );

    const result = await generateFaqAnswer(QUESTION, SAMPLE_FAQS);

    expect(result).toEqual({ kind: "parse-failed" });
  });

  it("タイムアウトの場合はapi-error(timeout)を返す", async () => {
    mockParse.mockRejectedValue(new Anthropic.APIConnectionTimeoutError());

    const result = await generateFaqAnswer(QUESTION, SAMPLE_FAQS);

    expect(result).toEqual({ kind: "api-error", errorType: "timeout" });
  });

  it("Rate Limitの場合はapi-error(rate_limit)を返す", async () => {
    mockParse.mockRejectedValue(
      new Anthropic.RateLimitError(429, {}, "rate limited", new Headers())
    );

    const result = await generateFaqAnswer(QUESTION, SAMPLE_FAQS);

    expect(result).toEqual({ kind: "api-error", errorType: "rate_limit" });
  });

  it("接続エラーの場合はapi-error(connection)を返す", async () => {
    mockParse.mockRejectedValue(
      new Anthropic.APIConnectionError({ message: "connection failed" })
    );

    const result = await generateFaqAnswer(QUESTION, SAMPLE_FAQS);

    expect(result).toEqual({ kind: "api-error", errorType: "connection" });
  });

  it("Authenticationエラーの場合はapi-error(authentication)を返す", async () => {
    mockParse.mockRejectedValue(
      new Anthropic.AuthenticationError(401, {}, "invalid api key", new Headers())
    );

    const result = await generateFaqAnswer(QUESTION, SAMPLE_FAQS);

    expect(result).toEqual({ kind: "api-error", errorType: "authentication" });
  });

  it("Bad Requestの場合はapi-error(bad_request)を返す", async () => {
    mockParse.mockRejectedValue(
      new Anthropic.BadRequestError(400, {}, "invalid request", new Headers())
    );

    const result = await generateFaqAnswer(QUESTION, SAMPLE_FAQS);

    expect(result).toEqual({ kind: "api-error", errorType: "bad_request" });
  });

  it("その他のAnthropic APIエラー(例: 500系)の場合はapi-error(api_error)を返す", async () => {
    mockParse.mockRejectedValue(
      new Anthropic.InternalServerError(500, {}, "server error", new Headers())
    );

    const result = await generateFaqAnswer(QUESTION, SAMPLE_FAQS);

    expect(result).toEqual({ kind: "api-error", errorType: "api_error" });
  });

  it("getClaudeClient()自体が初期化エラーを投げた場合はapi-error(client_init)を返し、Claude APIを呼び出さない", async () => {
    mockGetClaudeClient.mockImplementation(() => {
      throw new Error("ANTHROPIC_API_KEY must be set in the environment.");
    });

    const result = await generateFaqAnswer(QUESTION, SAMPLE_FAQS);

    expect(result).toEqual({ kind: "api-error", errorType: "client_init" });
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("予期しない例外(Anthropic SDK由来ではないエラー)の場合はapi-error(unknown)を返す", async () => {
    mockParse.mockRejectedValue(new TypeError("something went wrong"));

    const result = await generateFaqAnswer(QUESTION, SAMPLE_FAQS);

    expect(result).toEqual({ kind: "api-error", errorType: "unknown" });
  });

  it("予期しない非Error例外(文字列throwなど)の場合もapi-error(unknown)を返す", async () => {
    mockParse.mockRejectedValue("something went wrong");

    const result = await generateFaqAnswer(QUESTION, SAMPLE_FAQS);

    expect(result).toEqual({ kind: "api-error", errorType: "unknown" });
  });

  it("RetryableError(ミドルウェア用のリトライシグナル、AnthropicErrorの兄弟クラス)はparse-failedと誤分類せずapi-error(unknown)を返す", async () => {
    mockParse.mockRejectedValue(new RetryableError("retry me"));

    const result = await generateFaqAnswer(QUESTION, SAMPLE_FAQS);

    expect(result).toEqual({ kind: "api-error", errorType: "unknown" });
  });
});
