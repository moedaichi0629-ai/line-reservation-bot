import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClaudeClient } from "@/lib/claude/client";
import { FaqAnswerSchema, type FaqAnswer } from "@/lib/claude/faq-answer-schema";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/claude/prompt";
import type { Faq } from "@/types/database";

/**
 * 実装時点でnode_modules/@anthropic-ai/sdk (v0.126.0) の
 * resources/messages/messages.d.ts が公開するModel型に含まれていることを
 * 直接確認済みの現行モデルID（推測ではない）。
 */
const FAQ_ANSWER_MODEL = "claude-sonnet-5" as const;

/**
 * LINEへの返信を長時間待たせないための明示的タイムアウト。
 * maxRetries: 0 と合わせて、この呼び出しでは自動リトライを行わない
 * （リトライで待ち時間が倍増するより、早めにフォールバック応答へ切り替える設計）。
 */
const CLAUDE_REQUEST_TIMEOUT_MS = 8000;

export type FaqAnswerErrorType =
  | "timeout"
  | "rate_limit"
  | "connection"
  | "authentication"
  | "bad_request"
  | "api_error"
  | "client_init"
  | "unknown";

export type GenerateFaqAnswerResult =
  | { kind: "parsed"; output: FaqAnswer }
  | { kind: "parse-failed" }
  | { kind: "api-error"; errorType: FaqAnswerErrorType };

/**
 * ユーザーの質問と公開FAQ一覧をClaudeへ1回だけ渡し、
 * 回答生成・関連FAQ判定・confidence判定をStructured Outputとして受け取る。
 *
 * matchedFaqIdsが実在のFAQ idかどうかの検証、confidenceの最終的なガードレール適用は
 * このファイルでは行わない（lib/faq/answer-user-question.ts側の責務）。
 */
export async function generateFaqAnswer(
  question: string,
  faqs: Faq[]
): Promise<GenerateFaqAnswerResult> {
  let client: Anthropic;
  try {
    client = getClaudeClient();
  } catch (error) {
    console.error(
      "Failed to initialize Claude client",
      error instanceof Error ? error.name : typeof error
    );
    return { kind: "api-error", errorType: "client_init" };
  }

  try {
    const response = await client.messages.parse(
      {
        model: FAQ_ANSWER_MODEL,
        max_tokens: 1024,
        system: buildSystemPrompt(),
        messages: [{ role: "user", content: buildUserPrompt(question, faqs) }],
        output_config: {
          format: zodOutputFormat(FaqAnswerSchema),
          effort: "low",
        },
      },
      { timeout: CLAUDE_REQUEST_TIMEOUT_MS, maxRetries: 0 }
    );

    // 型上はFaqAnswer | nullだが、node_modules/@anthropic-ai/sdk (v0.126.0) の
    // 実装（lib/parser.js → helpers/zod.js）を確認したところ、zodOutputFormat経由では
    // JSON解析失敗・スキーマ不一致のいずれも例外(AnthropicError)としてthrowされ、
    // parsed_outputがnullのまま返ることは実際には無い。将来のSDK挙動変化に備え、
    // 型どおりnullも念のためparse-failedとして扱う。
    if (response.parsed_output === null) {
      return { kind: "parse-failed" };
    }

    return { kind: "parsed", output: response.parsed_output };
  } catch (error) {
    if (isStructuredOutputParseError(error)) {
      console.error("Claude returned a response that failed structured-output parsing/validation");
      return { kind: "parse-failed" };
    }

    return { kind: "api-error", errorType: classifyApiError(error) };
  }
}

/**
 * messages.parse()がStructured OutputのJSON解析・スキーマ検証に失敗した際は、
 * 素のAnthropicError（サブクラスではない）をthrowする
 * （helpers/zod.jsのzodOutputFormat().parse()実装で確認済み。JSON解析失敗・
 * スキーマ検証失敗のいずれも`new AnthropicError(...)`を直接投げており、
 * サブクラスは使われない）。
 *
 * 判定にはinstanceofではなく、コンストラクタの完全一致を使う。
 * AnthropicErrorには、ミドルウェア用のリトライシグナルであるRetryableError
 * （core/error.jsで定義、APIErrorのサブクラスではない）という兄弟クラスが存在し、
 * instanceof Anthropic.AnthropicError && !(instanceof Anthropic.APIError) という条件では
 * RetryableErrorも誤って構造化出力の解析失敗として分類されてしまう
 * （現状このクライアントにミドルウェアは登録していないため到達しないが、
 * 将来ミドルウェアを追加した際に誤分類する潜在的リスクがあるため、
 * 実際の投げられ方に忠実な完全一致判定にしておく）。
 */
function isStructuredOutputParseError(error: unknown): boolean {
  return (error as { constructor?: unknown } | null)?.constructor === Anthropic.AnthropicError;
}

function classifyApiError(error: unknown): FaqAnswerErrorType {
  // APIConnectionTimeoutErrorはAPIConnectionErrorのサブクラスのため、
  // 先に判定しないとタイムアウトが一律"connection"に丸められてしまう。
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return "timeout";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "rate_limit";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "connection";
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return "authentication";
  }
  if (error instanceof Anthropic.BadRequestError) {
    return "bad_request";
  }
  if (error instanceof Anthropic.APIError) {
    return "api_error";
  }

  console.error(
    "Unexpected error while calling the Claude API",
    error instanceof Error ? error.name : typeof error
  );
  return "unknown";
}
