import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Faq } from "@/types/database";

vi.mock("@/lib/supabase/faq", () => ({
  getPublishedFaqs: vi.fn(),
}));

vi.mock("@/lib/claude/generate-faq-answer", () => ({
  generateFaqAnswer: vi.fn(),
}));

import { answerUserQuestion } from "@/lib/faq/answer-user-question";
import { getPublishedFaqs } from "@/lib/supabase/faq";
import { generateFaqAnswer } from "@/lib/claude/generate-faq-answer";

const mockGetPublishedFaqs = vi.mocked(getPublishedFaqs);
const mockGenerateFaqAnswer = vi.mocked(generateFaqAnswer);

const QUESTION = "営業時間を教えて";

const SAMPLE_FAQS: Faq[] = [
  {
    id: "faq-a",
    question: "営業時間は？",
    answer: "10:00〜19:00です。",
    category: "営業時間",
    display_order: 0,
    is_published: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "faq-b",
    question: "定休日は？",
    answer: "月曜日です。",
    category: "営業時間",
    display_order: 1,
    is_published: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

function parsed(output: {
  answer: string;
  confidence: "high" | "medium" | "low";
  matchedFaqIds: string[];
  reason: string;
}) {
  return { kind: "parsed" as const, output };
}

beforeEach(() => {
  mockGetPublishedFaqs.mockReset();
  mockGenerateFaqAnswer.mockReset();
});

describe("answerUserQuestion", () => {
  it("A. FAQが0件の場合、Claude APIを呼び出さずescalateを返す", async () => {
    mockGetPublishedFaqs.mockResolvedValue([]);

    const result = await answerUserQuestion(QUESTION);

    expect(result.kind).toBe("escalate");
    expect(mockGenerateFaqAnswer).not.toHaveBeenCalled();
  });

  it("B. confidence=high + 有効なFAQ IDがある場合はanswerを返す", async () => {
    mockGetPublishedFaqs.mockResolvedValue(SAMPLE_FAQS);
    mockGenerateFaqAnswer.mockResolvedValue(
      parsed({
        answer: "10:00〜19:00です。",
        confidence: "high",
        matchedFaqIds: ["faq-a"],
        reason: "FAQに直接記載されている",
      })
    );

    const result = await answerUserQuestion(QUESTION);

    expect(result).toEqual({
      kind: "answer",
      answer: "10:00〜19:00です。",
      confidence: "high",
      matchedFaqIds: ["faq-a"],
    });
  });

  it("C. confidence=medium + 有効なFAQ IDがある場合はanswerを返す", async () => {
    mockGetPublishedFaqs.mockResolvedValue(SAMPLE_FAQS);
    mockGenerateFaqAnswer.mockResolvedValue(
      parsed({
        answer: "月曜定休です。",
        confidence: "medium",
        matchedFaqIds: ["faq-b"],
        reason: "FAQから間接的に読み取れる",
      })
    );

    const result = await answerUserQuestion(QUESTION);

    expect(result).toEqual({
      kind: "answer",
      answer: "月曜定休です。",
      confidence: "medium",
      matchedFaqIds: ["faq-b"],
    });
  });

  it("D. confidence=high + matchedFaqIdsが0件の場合はescalateへダウングレードする", async () => {
    mockGetPublishedFaqs.mockResolvedValue(SAMPLE_FAQS);
    mockGenerateFaqAnswer.mockResolvedValue(
      parsed({
        answer: "たぶん10:00〜19:00だと思います。",
        confidence: "high",
        matchedFaqIds: [],
        reason: "根拠となるFAQがない",
      })
    );

    const result = await answerUserQuestion(QUESTION);

    expect(result).toEqual({
      kind: "escalate",
      reason: "根拠となるFAQがない",
      matchedFaqIds: [],
    });
  });

  it("E. confidence=medium + matchedFaqIdsが0件の場合はescalateへダウングレードする", async () => {
    mockGetPublishedFaqs.mockResolvedValue(SAMPLE_FAQS);
    mockGenerateFaqAnswer.mockResolvedValue(
      parsed({
        answer: "たぶんそうだと思います。",
        confidence: "medium",
        matchedFaqIds: [],
        reason: "推測が必要",
      })
    );

    const result = await answerUserQuestion(QUESTION);

    expect(result.kind).toBe("escalate");
  });

  it("F. confidence=high + matchedFaqIdsが全て偽IDの場合はescalateへダウングレードする", async () => {
    mockGetPublishedFaqs.mockResolvedValue(SAMPLE_FAQS);
    mockGenerateFaqAnswer.mockResolvedValue(
      parsed({
        answer: "回答",
        confidence: "high",
        matchedFaqIds: ["fake-id-1", "fake-id-2"],
        reason: "理由",
      })
    );

    const result = await answerUserQuestion(QUESTION);

    expect(result).toEqual({
      kind: "escalate",
      reason: "理由",
      matchedFaqIds: [],
    });
  });

  it("G. confidence=high + 有効IDと偽IDが混在する場合、偽IDを除外してanswerを返す", async () => {
    mockGetPublishedFaqs.mockResolvedValue(SAMPLE_FAQS);
    mockGenerateFaqAnswer.mockResolvedValue(
      parsed({
        answer: "10:00〜19:00です。",
        confidence: "high",
        matchedFaqIds: ["faq-a", "fake-id"],
        reason: "理由",
      })
    );

    const result = await answerUserQuestion(QUESTION);

    expect(result).toEqual({
      kind: "answer",
      answer: "10:00〜19:00です。",
      confidence: "high",
      matchedFaqIds: ["faq-a"],
    });
  });

  it("H. Claude自身がconfidence=lowを返した場合はescalateとし、answerはユーザー向けに使用しない", async () => {
    mockGetPublishedFaqs.mockResolvedValue(SAMPLE_FAQS);
    mockGenerateFaqAnswer.mockResolvedValue(
      parsed({
        answer: "断定的な回答(escalate結果には含まれないはず)",
        confidence: "low",
        matchedFaqIds: ["faq-a"],
        reason: "予約可否に関する質問のため",
      })
    );

    const result = await answerUserQuestion(QUESTION);

    expect(result).toEqual({
      kind: "escalate",
      reason: "予約可否に関する質問のため",
      matchedFaqIds: ["faq-a"],
    });
    // escalate結果の型にはanswerフィールド自体が存在しない
    expect(result).not.toHaveProperty("answer");
  });

  it("H'. confidence=lowの場合も、matchedFaqIdsの実在チェックが適用される(有効IDと偽IDが混在)", async () => {
    mockGetPublishedFaqs.mockResolvedValue(SAMPLE_FAQS);
    mockGenerateFaqAnswer.mockResolvedValue(
      parsed({
        answer: "断定的な回答(escalate結果には含まれないはず)",
        confidence: "low",
        matchedFaqIds: ["faq-a", "fake-id"],
        reason: "予約可否に関する質問のため",
      })
    );

    const result = await answerUserQuestion(QUESTION);

    expect(result).toEqual({
      kind: "escalate",
      reason: "予約可否に関する質問のため",
      matchedFaqIds: ["faq-a"],
    });
  });

  it("I. parse-failedの場合はfallback-error(parse_failed)を返す", async () => {
    mockGetPublishedFaqs.mockResolvedValue(SAMPLE_FAQS);
    mockGenerateFaqAnswer.mockResolvedValue({ kind: "parse-failed" });

    const result = await answerUserQuestion(QUESTION);

    expect(result).toEqual({ kind: "fallback-error", errorType: "parse_failed" });
  });

  it.each([
    "timeout",
    "rate_limit",
    "connection",
    "authentication",
    "bad_request",
    "api_error",
    "client_init",
    "unknown",
  ] as const)("J. api-error(%s)の場合はfallback-errorを返す", async (errorType) => {
    mockGetPublishedFaqs.mockResolvedValue(SAMPLE_FAQS);
    mockGenerateFaqAnswer.mockResolvedValue({ kind: "api-error", errorType });

    const result = await answerUserQuestion(QUESTION);

    expect(result).toEqual({ kind: "fallback-error", errorType });
  });

  it("K. Supabaseからの公開FAQ取得が失敗した場合、例外を伝播させずfallback-error(faq_fetch_failed)を返す(Claudeは呼ばない)", async () => {
    mockGetPublishedFaqs.mockRejectedValue(new Error("connection failed"));

    const result = await answerUserQuestion(QUESTION);

    expect(result).toEqual({ kind: "fallback-error", errorType: "faq_fetch_failed" });
    expect(mockGenerateFaqAnswer).not.toHaveBeenCalled();
  });
});
