import { z } from "zod";

/**
 * Claudeへの1回の問い合わせで得る構造化出力の形式。
 * confidenceの最終判定・matchedFaqIdsの実在チェックはlib/faq/answer-user-question.ts側で行う。
 */
export const FaqAnswerSchema = z
  .object({
    answer: z.string().min(1),
    confidence: z.enum(["high", "medium", "low"]),
    matchedFaqIds: z.array(z.string()),
    reason: z.string().min(1),
  })
  .strict();

export type FaqAnswer = z.infer<typeof FaqAnswerSchema>;
