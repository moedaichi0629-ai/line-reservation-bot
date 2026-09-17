import { describe, expect, it } from "vitest";
import { FaqAnswerSchema } from "@/lib/claude/faq-answer-schema";

describe("FaqAnswerSchema", () => {
  it("正常なペイロードを受理する", () => {
    const result = FaqAnswerSchema.safeParse({
      answer: "カット料金は4,500円です。",
      confidence: "high",
      matchedFaqIds: ["faq-1"],
      reason: "FAQにカット料金が直接記載されている",
    });

    expect(result.success).toBe(true);
  });

  it("matchedFaqIdsが空配列でも受理する", () => {
    const result = FaqAnswerSchema.safeParse({
      answer: "スタッフにご確認ください。",
      confidence: "low",
      matchedFaqIds: [],
      reason: "FAQに根拠となる記載がない",
    });

    expect(result.success).toBe(true);
  });

  it.each(["high", "medium", "low"])(
    "confidence=\"%s\"を受理する",
    (confidence) => {
      const result = FaqAnswerSchema.safeParse({
        answer: "回答",
        confidence,
        matchedFaqIds: [],
        reason: "理由",
      });

      expect(result.success).toBe(true);
    }
  );

  it("confidenceがhigh/medium/low以外の場合は拒否する", () => {
    const result = FaqAnswerSchema.safeParse({
      answer: "回答",
      confidence: "unknown",
      matchedFaqIds: [],
      reason: "理由",
    });

    expect(result.success).toBe(false);
  });

  it.each(["answer", "confidence", "matchedFaqIds", "reason"])(
    "%sが欠落している場合は拒否する",
    (missingKey) => {
      const payload: Record<string, unknown> = {
        answer: "回答",
        confidence: "high",
        matchedFaqIds: [],
        reason: "理由",
      };
      delete payload[missingKey];

      const result = FaqAnswerSchema.safeParse(payload);

      expect(result.success).toBe(false);
    }
  );

  it("matchedFaqIdsが文字列配列でない場合は拒否する", () => {
    const result = FaqAnswerSchema.safeParse({
      answer: "回答",
      confidence: "high",
      matchedFaqIds: [123],
      reason: "理由",
    });

    expect(result.success).toBe(false);
  });

  it.each(["answer", "reason"])(
    "%sが空文字列の場合は拒否する",
    (emptyKey) => {
      const payload: Record<string, unknown> = {
        answer: "回答",
        confidence: "high",
        matchedFaqIds: [],
        reason: "理由",
      };
      payload[emptyKey] = "";

      const result = FaqAnswerSchema.safeParse(payload);

      expect(result.success).toBe(false);
    }
  );

  it("スキーマにない余分なフィールドが含まれる場合は拒否する（strict）", () => {
    const result = FaqAnswerSchema.safeParse({
      answer: "回答",
      confidence: "high",
      matchedFaqIds: [],
      reason: "理由",
      unexpectedField: "何か余分な値",
    });

    expect(result.success).toBe(false);
  });
});
