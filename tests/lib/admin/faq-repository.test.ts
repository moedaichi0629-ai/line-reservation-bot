import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { Faq } from "@/types/database";

const mockRequireAdmin = vi.fn(async () => {});
vi.mock("@/lib/admin/auth", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

import {
  createFaq,
  deleteFaq,
  getFaqById,
  listFaqsForAdmin,
  moveFaqDown,
  moveFaqUp,
  setFaqPublished,
  updateFaq,
} from "@/lib/admin/faq-repository";

function makeFaq(overrides: Partial<Faq> = {}): Faq {
  return {
    id: "faq-1",
    question: "営業時間は？",
    answer: "10:00〜19:00です。",
    category: "営業時間",
    display_order: 0,
    is_published: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockRequireAdmin.mockReset();
  mockRequireAdmin.mockResolvedValue(undefined);
  mockCreateSupabaseServerClient.mockReset();
});

describe("listFaqsForAdmin", () => {
  it("公開/非公開を問わず全件をdisplay_order→created_at昇順で取得する", async () => {
    const faqs = [makeFaq()];
    const order2 = vi.fn().mockResolvedValue({ data: faqs, error: null });
    const order1 = vi.fn(() => ({ order: order2 }));
    const select = vi.fn(() => ({ order: order1 }));
    const from = vi.fn(() => ({ select }));
    mockCreateSupabaseServerClient.mockReturnValue({ from });

    const result = await listFaqsForAdmin();

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("faq");
    expect(select).toHaveBeenCalledWith("*");
    expect(order1).toHaveBeenCalledWith("display_order", { ascending: true });
    expect(order2).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(result).toEqual(faqs);
  });

  it("dataがnullの場合は空配列を返す", async () => {
    const order2 = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn(() => ({ order: vi.fn(() => ({ order: order2 })) }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    expect(await listFaqsForAdmin()).toEqual([]);
  });

  it("エラー時は例外を投げる", async () => {
    const order2 = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const select = vi.fn(() => ({ order: vi.fn(() => ({ order: order2 })) }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    await expect(listFaqsForAdmin()).rejects.toThrow("Failed to fetch FAQs: boom");
  });
});

describe("getFaqById", () => {
  it("存在するFAQを返す", async () => {
    const faq = makeFaq();
    const maybeSingle = vi.fn().mockResolvedValue({ data: faq, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mockCreateSupabaseServerClient.mockReturnValue({ from });

    const result = await getFaqById(faq.id);

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", faq.id);
    expect(result).toEqual(faq);
  });

  it("存在しない場合はnullを返す", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    expect(await getFaqById("missing")).toBeNull();
  });

  it("エラー時は例外を投げる", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    await expect(getFaqById("faq-1")).rejects.toThrow("Failed to fetch FAQ: boom");
  });
});

describe("createFaq", () => {
  it("既存FAQが無ければdisplay_order=0で作成する", async () => {
    const created = makeFaq({ display_order: 0 });
    const order2 = vi.fn().mockResolvedValue({ data: [], error: null });
    const listSelect = vi.fn(() => ({ order: vi.fn(() => ({ order: order2 })) }));

    const single = vi.fn().mockResolvedValue({ data: created, error: null });
    const insertSelect = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select: insertSelect }));

    const from = vi
      .fn()
      .mockReturnValueOnce({ select: listSelect })
      .mockReturnValueOnce({ insert });
    mockCreateSupabaseServerClient.mockReturnValue({ from });

    const result = await createFaq({ question: "質問", answer: "回答", category: null });

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith({
      question: "質問",
      answer: "回答",
      category: null,
      display_order: 0,
    });
    expect(result).toEqual(created);
  });

  it("既存FAQがあれば最大display_order+1で末尾に作成する", async () => {
    const existing = [makeFaq({ id: "a", display_order: 0 }), makeFaq({ id: "b", display_order: 3 })];
    const order2 = vi.fn().mockResolvedValue({ data: existing, error: null });
    const listSelect = vi.fn(() => ({ order: vi.fn(() => ({ order: order2 })) }));

    const single = vi.fn().mockResolvedValue({ data: makeFaq({ display_order: 4 }), error: null });
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));

    const from = vi
      .fn()
      .mockReturnValueOnce({ select: listSelect })
      .mockReturnValueOnce({ insert });
    mockCreateSupabaseServerClient.mockReturnValue({ from });

    await createFaq({ question: "質問", answer: "回答", category: null });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ display_order: 4 }));
  });

  it("エラー時は例外を投げる", async () => {
    const order2 = vi.fn().mockResolvedValue({ data: [], error: null });
    const listSelect = vi.fn(() => ({ order: vi.fn(() => ({ order: order2 })) }));
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));

    const from = vi
      .fn()
      .mockReturnValueOnce({ select: listSelect })
      .mockReturnValueOnce({ insert });
    mockCreateSupabaseServerClient.mockReturnValue({ from });

    await expect(createFaq({ question: "質問", answer: "回答", category: null })).rejects.toThrow(
      "Failed to create FAQ: boom",
    );
  });
});

describe("updateFaq", () => {
  it("question/answer/categoryのみを更新する(display_order/is_publishedには触れない)", async () => {
    const updated = makeFaq({ question: "新しい質問" });
    const single = vi.fn().mockResolvedValue({ data: updated, error: null });
    const eq = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const update = vi.fn(() => ({ eq }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ update })) });

    const result = await updateFaq("faq-1", { question: "新しい質問", answer: "回答", category: null });

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ question: "新しい質問", answer: "回答", category: null });
    expect(eq).toHaveBeenCalledWith("id", "faq-1");
    expect(result).toEqual(updated);
  });

  it("エラー時は例外を投げる", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const update = vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ single })) })) }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ update })) });

    await expect(
      updateFaq("faq-1", { question: "質問", answer: "回答", category: null }),
    ).rejects.toThrow("Failed to update FAQ: boom");
  });
});

describe("setFaqPublished", () => {
  it("is_publishedのみを更新する", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ update })) });

    await setFaqPublished("faq-1", false);

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ is_published: false });
    expect(eq).toHaveBeenCalledWith("id", "faq-1");
  });

  it("エラー時は例外を投げる", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ update: vi.fn(() => ({ eq })) })) });

    await expect(setFaqPublished("faq-1", true)).rejects.toThrow(
      "Failed to update FAQ publish state: boom",
    );
  });
});

describe("deleteFaq", () => {
  it("idで1件削除する", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const del = vi.fn(() => ({ eq }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ delete: del })) });

    await deleteFaq("faq-1");

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", "faq-1");
  });

  it("エラー時は例外を投げる", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ delete: vi.fn(() => ({ eq })) })) });

    await expect(deleteFaq("faq-1")).rejects.toThrow("Failed to delete FAQ: boom");
  });
});

describe("moveFaqUp / moveFaqDown", () => {
  function mockOrderedList(faqs: Faq[]) {
    const order2 = vi.fn().mockResolvedValue({ data: faqs, error: null });
    return vi.fn(() => ({ order: vi.fn(() => ({ order: order2 })) }));
  }

  it("上へ移動すると自分と1つ上の項目のdisplay_orderを入れ替える", async () => {
    const a = makeFaq({ id: "a", display_order: 0 });
    const b = makeFaq({ id: "b", display_order: 1 });
    const c = makeFaq({ id: "c", display_order: 2 });
    const select = mockOrderedList([a, b, c]);

    const eqForB = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateForB = vi.fn(() => ({ eq: eqForB }));
    const eqForA = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateForA = vi.fn(() => ({ eq: eqForA }));

    const from = vi
      .fn()
      .mockReturnValueOnce({ select })
      .mockReturnValueOnce({ update: updateForB })
      .mockReturnValueOnce({ update: updateForA });
    mockCreateSupabaseServerClient.mockReturnValue({ from });

    await moveFaqUp(b.id);

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(updateForB).toHaveBeenCalledWith({ display_order: a.display_order });
    expect(eqForB).toHaveBeenCalledWith("id", b.id);
    expect(updateForA).toHaveBeenCalledWith({ display_order: b.display_order });
    expect(eqForA).toHaveBeenCalledWith("id", a.id);
  });

  it("先頭の項目を上へ移動しても何も更新しない(no-op)", async () => {
    const a = makeFaq({ id: "a", display_order: 0 });
    const b = makeFaq({ id: "b", display_order: 1 });
    const select = mockOrderedList([a, b]);
    const from = vi.fn().mockReturnValueOnce({ select });
    mockCreateSupabaseServerClient.mockReturnValue({ from });

    await moveFaqUp(a.id);

    expect(from).toHaveBeenCalledTimes(1);
  });

  it("末尾の項目を下へ移動しても何も更新しない(no-op)", async () => {
    const a = makeFaq({ id: "a", display_order: 0 });
    const b = makeFaq({ id: "b", display_order: 1 });
    const select = mockOrderedList([a, b]);
    const from = vi.fn().mockReturnValueOnce({ select });
    mockCreateSupabaseServerClient.mockReturnValue({ from });

    await moveFaqDown(b.id);

    expect(from).toHaveBeenCalledTimes(1);
  });

  it("下へ移動すると自分と1つ下の項目のdisplay_orderを入れ替える", async () => {
    const a = makeFaq({ id: "a", display_order: 0 });
    const b = makeFaq({ id: "b", display_order: 1 });
    const select = mockOrderedList([a, b]);

    const eqForA = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateForA = vi.fn(() => ({ eq: eqForA }));
    const eqForB = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateForB = vi.fn(() => ({ eq: eqForB }));

    const from = vi
      .fn()
      .mockReturnValueOnce({ select })
      .mockReturnValueOnce({ update: updateForA })
      .mockReturnValueOnce({ update: updateForB });
    mockCreateSupabaseServerClient.mockReturnValue({ from });

    await moveFaqDown(a.id);

    expect(updateForA).toHaveBeenCalledWith({ display_order: b.display_order });
    expect(updateForB).toHaveBeenCalledWith({ display_order: a.display_order });
  });

  it("存在しないidの場合は例外を投げる", async () => {
    const select = mockOrderedList([makeFaq({ id: "a" })]);
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn().mockReturnValueOnce({ select }) });

    await expect(moveFaqUp("missing")).rejects.toThrow("FAQ not found");
  });
});

describe("未認証の場合は全関数がDBへアクセスせず拒否する", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockRequireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT:/admin/login"));
  });

  const cases: Array<[string, () => Promise<unknown>]> = [
    ["listFaqsForAdmin", () => listFaqsForAdmin()],
    ["getFaqById", () => getFaqById("faq-1")],
    ["createFaq", () => createFaq({ question: "q", answer: "a", category: null })],
    ["updateFaq", () => updateFaq("faq-1", { question: "q", answer: "a", category: null })],
    ["setFaqPublished", () => setFaqPublished("faq-1", false)],
    ["deleteFaq", () => deleteFaq("faq-1")],
    ["moveFaqUp", () => moveFaqUp("faq-1")],
    ["moveFaqDown", () => moveFaqDown("faq-1")],
  ];

  it.each(cases)("%s", async (_name, run) => {
    await expect(run()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(mockCreateSupabaseServerClient).not.toHaveBeenCalled();
  });
});
