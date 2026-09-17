import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Faq } from "@/types/database";

const mockOrder = vi.fn();
const mockEq = vi.fn(() => ({ order: mockOrder }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ from: mockFrom }),
}));

import { getPublishedFaqs } from "@/lib/supabase/faq";

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

beforeEach(() => {
  mockFrom.mockClear();
  mockSelect.mockClear();
  mockEq.mockClear();
  mockOrder.mockReset();
});

describe("getPublishedFaqs", () => {
  it("is_published=trueでフィルタし、display_order昇順でソートして問い合わせる", async () => {
    mockOrder.mockResolvedValue({ data: SAMPLE_FAQS, error: null });

    await getPublishedFaqs();

    expect(mockFrom).toHaveBeenCalledWith("faq");
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockEq).toHaveBeenCalledWith("is_published", true);
    expect(mockOrder).toHaveBeenCalledWith("display_order", { ascending: true });
  });

  it("取得したFAQ一覧をそのまま返す", async () => {
    mockOrder.mockResolvedValue({ data: SAMPLE_FAQS, error: null });

    const result = await getPublishedFaqs();

    expect(result).toEqual(SAMPLE_FAQS);
  });

  it("dataがnullの場合は空配列を返す", async () => {
    mockOrder.mockResolvedValue({ data: null, error: null });

    const result = await getPublishedFaqs();

    expect(result).toEqual([]);
  });

  it("Supabaseがエラーを返した場合は例外を投げる", async () => {
    mockOrder.mockResolvedValue({
      data: null,
      error: { message: "connection failed" },
    });

    await expect(getPublishedFaqs()).rejects.toThrow(
      "Failed to fetch published FAQs: connection failed"
    );
  });
});
