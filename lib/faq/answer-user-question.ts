import "server-only";
import { generateFaqAnswer, type FaqAnswerErrorType } from "@/lib/claude/generate-faq-answer";
import { getPublishedFaqs } from "@/lib/supabase/faq";
import type { Faq } from "@/types/database";

/**
 * fallback-errorの内訳。Claude API側のエラー種別に加え、
 * このオーケストレーター固有の失敗（構造化出力の解析失敗、FAQ取得失敗）を含む。
 * いずれも「confidence=low」とは別カテゴリであり、オーナー通知の対象にはしない。
 */
export type AnswerErrorType = FaqAnswerErrorType | "parse_failed" | "faq_fetch_failed";

export type AnswerUserQuestionResult =
  | {
      kind: "answer";
      answer: string;
      confidence: "high" | "medium";
      matchedFaqIds: string[];
    }
  | {
      kind: "escalate";
      reason: string;
      matchedFaqIds: string[];
    }
  | {
      kind: "fallback-error";
      errorType: AnswerErrorType;
    };

const NO_PUBLISHED_FAQ_REASON =
  "公開されているFAQが登録されていないため、自動回答できませんでした。";

/**
 * ユーザーの質問に対して、
 *   公開FAQ取得 → Claudeを1回呼び出し → matchedFaqIdsの実在検証 →
 *   confidenceガードレールの適用
 * までを行い、Webhook側が安全に分岐できる結果を返す。
 *
 * Claudeの申告するconfidence・matchedFaqIdsのいずれも無条件には信用しない:
 * - matchedFaqIdsは実際に取得した公開FAQのid集合と突き合わせ、存在しないidは除外する。
 * - confidenceがhigh/mediumであっても、有効なmatchedFaqIdsが0件ならlow相当
 *   （kind: "escalate"）へ強制的にダウングレードし、Claudeの生成したanswerは
 *   ユーザーへ返さない。
 */
export async function answerUserQuestion(
  question: string
): Promise<AnswerUserQuestionResult> {
  let faqs: Faq[];
  try {
    faqs = await getPublishedFaqs();
  } catch (error) {
    console.error(
      "Failed to fetch published FAQs while answering a user question",
      error instanceof Error ? error.name : typeof error
    );
    return { kind: "fallback-error", errorType: "faq_fetch_failed" };
  }

  if (faqs.length === 0) {
    return {
      kind: "escalate",
      reason: NO_PUBLISHED_FAQ_REASON,
      matchedFaqIds: [],
    };
  }

  const generated = await generateFaqAnswer(question, faqs);

  if (generated.kind === "parse-failed") {
    return { kind: "fallback-error", errorType: "parse_failed" };
  }

  if (generated.kind === "api-error") {
    return { kind: "fallback-error", errorType: generated.errorType };
  }

  const fetchedFaqIds = new Set(faqs.map((faq) => faq.id));
  const validMatchedFaqIds = generated.output.matchedFaqIds.filter((id) =>
    fetchedFaqIds.has(id)
  );

  if (generated.output.confidence === "low") {
    // Claude自身がlowと判定した場合。answerは断定回答である可能性があるため、
    // ユーザーへは返さずreasonのみをオーナー通知用に保持する。
    return {
      kind: "escalate",
      reason: generated.output.reason,
      matchedFaqIds: validMatchedFaqIds,
    };
  }

  if (validMatchedFaqIds.length === 0) {
    // high/mediumを主張していても、実在する根拠FAQが1件も無ければ信用しない。
    // lowへ強制ダウングレードし、無効だったmatchedFaqIdsは結果に残さない。
    return {
      kind: "escalate",
      reason: generated.output.reason,
      matchedFaqIds: [],
    };
  }

  return {
    kind: "answer",
    answer: generated.output.answer,
    confidence: generated.output.confidence,
    matchedFaqIds: validMatchedFaqIds,
  };
}
