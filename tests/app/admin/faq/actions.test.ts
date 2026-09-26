import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAdmin = vi.fn(async () => {});
vi.mock("@/lib/admin/auth", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

const mockCreateFaq = vi.fn();
const mockUpdateFaq = vi.fn();
const mockSetFaqPublished = vi.fn();
const mockDeleteFaq = vi.fn();
const mockMoveFaqUp = vi.fn();
const mockMoveFaqDown = vi.fn();
vi.mock("@/lib/admin/faq-repository", () => ({
  createFaq: (input: unknown) => mockCreateFaq(input),
  updateFaq: (id: string, input: unknown) => mockUpdateFaq(id, input),
  setFaqPublished: (id: string, isPublished: boolean) => mockSetFaqPublished(id, isPublished),
  deleteFaq: (id: string) => mockDeleteFaq(id),
  moveFaqUp: (id: string) => mockMoveFaqUp(id),
  moveFaqDown: (id: string) => mockMoveFaqDown(id),
}));

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) throw error;
  },
}));

import {
  createFaqAction,
  deleteFaqAction,
  moveFaqAction,
  togglePublishAction,
  updateFaqAction,
} from "@/app/admin/(protected)/faq/actions";

const GENERIC_SAVE_ERROR = "保存に失敗しました。時間をおいて再度お試しください。";

function buildFaqFormData(overrides: Partial<Record<"question" | "answer" | "category", string>> = {}): FormData {
  const formData = new FormData();
  formData.set("question", overrides.question ?? "質問");
  formData.set("answer", overrides.answer ?? "回答");
  formData.set("category", overrides.category ?? "");
  return formData;
}

beforeEach(() => {
  mockRequireAdmin.mockReset();
  mockRequireAdmin.mockResolvedValue(undefined);
  mockCreateFaq.mockReset();
  mockUpdateFaq.mockReset();
  mockSetFaqPublished.mockReset();
  mockDeleteFaq.mockReset();
  mockMoveFaqUp.mockReset();
  mockMoveFaqDown.mockReset();
  mockRedirect.mockClear();
});

describe("createFaqAction", () => {
  it("バリデーションエラーの場合はcreateFaqを呼ばずエラーを返す", async () => {
    const result = await createFaqAction(null, buildFaqFormData({ question: "" }));

    expect(result).toEqual({ error: "質問を入力してください。" });
    expect(mockCreateFaq).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("createFaqが失敗したら詳細を隠した一般的なエラーメッセージを返す", async () => {
    mockCreateFaq.mockRejectedValue(new Error("db down"));

    const result = await createFaqAction(null, buildFaqFormData());

    expect(result).toEqual({ error: GENERIC_SAVE_ERROR });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("成功したら一覧へ成功フラッシュ付きでredirectする", async () => {
    mockCreateFaq.mockResolvedValue(undefined);

    await expect(createFaqAction(null, buildFaqFormData())).rejects.toThrow(
      `NEXT_REDIRECT:/admin/faq?success=${encodeURIComponent("FAQを追加しました。")}`,
    );
    expect(mockCreateFaq).toHaveBeenCalledWith({ question: "質問", answer: "回答", category: null });
  });

  it("requireAdminを最初に呼ぶ", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT:/admin/login"));

    await expect(createFaqAction(null, buildFaqFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/admin/login",
    );
    expect(mockCreateFaq).not.toHaveBeenCalled();
  });
});

describe("updateFaqAction", () => {
  it("バリデーションエラーの場合はupdateFaqを呼ばずエラーを返す", async () => {
    const result = await updateFaqAction("faq-1", null, buildFaqFormData({ answer: "" }));

    expect(result).toEqual({ error: "回答を入力してください。" });
    expect(mockUpdateFaq).not.toHaveBeenCalled();
  });

  it("updateFaqが失敗したら一般的なエラーメッセージを返す", async () => {
    mockUpdateFaq.mockRejectedValue(new Error("db down"));

    const result = await updateFaqAction("faq-1", null, buildFaqFormData());

    expect(result).toEqual({ error: GENERIC_SAVE_ERROR });
  });

  it("成功したら一覧へ成功フラッシュ付きでredirectする", async () => {
    mockUpdateFaq.mockResolvedValue(undefined);

    await expect(updateFaqAction("faq-1", null, buildFaqFormData())).rejects.toThrow(
      `NEXT_REDIRECT:/admin/faq?success=${encodeURIComponent("FAQを更新しました。")}`,
    );
    expect(mockUpdateFaq).toHaveBeenCalledWith("faq-1", {
      question: "質問",
      answer: "回答",
      category: null,
    });
  });
});

describe("togglePublishAction", () => {
  function buildToggleFormData(id: string, nextPublished: boolean): FormData {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("nextPublished", nextPublished ? "true" : "false");
    return formData;
  }

  it("成功したら公開メッセージ付きでredirectする", async () => {
    mockSetFaqPublished.mockResolvedValue(undefined);

    await expect(togglePublishAction(buildToggleFormData("faq-1", true))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/faq?success=${encodeURIComponent("FAQを公開しました。")}`,
    );
    expect(mockSetFaqPublished).toHaveBeenCalledWith("faq-1", true);
  });

  it("非公開に切り替えて成功したら非公開メッセージ付きでredirectする", async () => {
    mockSetFaqPublished.mockResolvedValue(undefined);

    await expect(togglePublishAction(buildToggleFormData("faq-1", false))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/faq?success=${encodeURIComponent("FAQを非公開にしました。")}`,
    );
  });

  it("失敗したらエラーフラッシュ付きでredirectする", async () => {
    mockSetFaqPublished.mockRejectedValue(new Error("db down"));

    await expect(togglePublishAction(buildToggleFormData("faq-1", false))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/faq?error=${encodeURIComponent("公開状態の変更に失敗しました。")}`,
    );
  });

  it("idが無い場合は例外を投げる", async () => {
    await expect(togglePublishAction(new FormData())).rejects.toThrow("Missing form field: id");
    expect(mockSetFaqPublished).not.toHaveBeenCalled();
  });
});

describe("deleteFaqAction", () => {
  function buildDeleteFormData(id: string): FormData {
    const formData = new FormData();
    formData.set("id", id);
    return formData;
  }

  it("成功したら成功フラッシュ付きでredirectする", async () => {
    mockDeleteFaq.mockResolvedValue(undefined);

    await expect(deleteFaqAction(buildDeleteFormData("faq-1"))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/faq?success=${encodeURIComponent("FAQを削除しました。")}`,
    );
    expect(mockDeleteFaq).toHaveBeenCalledWith("faq-1");
  });

  it("失敗したらエラーフラッシュ付きでredirectする", async () => {
    mockDeleteFaq.mockRejectedValue(new Error("db down"));

    await expect(deleteFaqAction(buildDeleteFormData("faq-1"))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/faq?error=${encodeURIComponent("削除に失敗しました。")}`,
    );
  });
});

describe("moveFaqAction", () => {
  function buildMoveFormData(id: string, direction: string): FormData {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("direction", direction);
    return formData;
  }

  it("direction=upならmoveFaqUpを呼びFAQ一覧へredirectする", async () => {
    mockMoveFaqUp.mockResolvedValue(undefined);

    await expect(moveFaqAction(buildMoveFormData("faq-1", "up"))).rejects.toThrow(
      "NEXT_REDIRECT:/admin/faq",
    );
    expect(mockMoveFaqUp).toHaveBeenCalledWith("faq-1");
    expect(mockMoveFaqDown).not.toHaveBeenCalled();
  });

  it("direction=downならmoveFaqDownを呼びFAQ一覧へredirectする", async () => {
    mockMoveFaqDown.mockResolvedValue(undefined);

    await expect(moveFaqAction(buildMoveFormData("faq-1", "down"))).rejects.toThrow(
      "NEXT_REDIRECT:/admin/faq",
    );
    expect(mockMoveFaqDown).toHaveBeenCalledWith("faq-1");
    expect(mockMoveFaqUp).not.toHaveBeenCalled();
  });

  it("不明なdirectionの場合はどちらも呼ばずFAQ一覧へredirectする", async () => {
    await expect(moveFaqAction(buildMoveFormData("faq-1", "sideways"))).rejects.toThrow(
      "NEXT_REDIRECT:/admin/faq",
    );
    expect(mockMoveFaqUp).not.toHaveBeenCalled();
    expect(mockMoveFaqDown).not.toHaveBeenCalled();
  });

  it("失敗したらエラーフラッシュ付きでredirectする", async () => {
    mockMoveFaqUp.mockRejectedValue(new Error("db down"));

    await expect(moveFaqAction(buildMoveFormData("faq-1", "up"))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/faq?error=${encodeURIComponent("並べ替えに失敗しました。")}`,
    );
  });
});

describe("セッション切れ(リポジトリ内のrequireAdmin()によるリダイレクト)", () => {
  it("createFaqAction はログイン画面へのリダイレクトを保存失敗のエラーに変えずにそのまま通す", async () => {
    const loginRedirect = new Error("NEXT_REDIRECT:/admin/login");
    mockCreateFaq.mockRejectedValue(loginRedirect);

    await expect(createFaqAction(null, buildFaqFormData())).rejects.toBe(loginRedirect);
  });
});
