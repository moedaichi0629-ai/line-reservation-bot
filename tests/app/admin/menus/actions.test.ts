import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAdmin = vi.fn(async () => {});
vi.mock("@/lib/admin/auth", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

const mockCreateMenu = vi.fn();
const mockUpdateMenu = vi.fn();
const mockSetMenuPublished = vi.fn();
const mockDeleteMenu = vi.fn();
const mockMoveMenuUp = vi.fn();
const mockMoveMenuDown = vi.fn();
vi.mock("@/lib/admin/menu-repository", () => ({
  createMenu: (input: unknown) => mockCreateMenu(input),
  updateMenu: (id: string, input: unknown) => mockUpdateMenu(id, input),
  setMenuPublished: (id: string, isPublished: boolean) => mockSetMenuPublished(id, isPublished),
  deleteMenu: (id: string) => mockDeleteMenu(id),
  moveMenuUp: (id: string) => mockMoveMenuUp(id),
  moveMenuDown: (id: string) => mockMoveMenuDown(id),
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
  createMenuAction,
  deleteMenuAction,
  moveMenuAction,
  togglePublishAction,
  updateMenuAction,
} from "@/app/admin/(protected)/menus/actions";

const GENERIC_SAVE_ERROR = "保存に失敗しました。時間をおいて再度お試しください。";

function buildMenuFormData(
  overrides: Partial<Record<"name" | "description" | "price_yen" | "duration_minutes", string>> = {},
): FormData {
  const formData = new FormData();
  formData.set("name", overrides.name ?? "カット");
  formData.set("description", overrides.description ?? "");
  formData.set("price_yen", overrides.price_yen ?? "3000");
  formData.set("duration_minutes", overrides.duration_minutes ?? "60");
  return formData;
}

beforeEach(() => {
  mockRequireAdmin.mockReset();
  mockRequireAdmin.mockResolvedValue(undefined);
  mockCreateMenu.mockReset();
  mockUpdateMenu.mockReset();
  mockSetMenuPublished.mockReset();
  mockDeleteMenu.mockReset();
  mockMoveMenuUp.mockReset();
  mockMoveMenuDown.mockReset();
  mockRedirect.mockClear();
});

describe("createMenuAction", () => {
  it("バリデーションエラーの場合はcreateMenuを呼ばずエラーを返す", async () => {
    const result = await createMenuAction(null, buildMenuFormData({ name: "" }));

    expect(result).toEqual({ error: "メニュー名を入力してください。" });
    expect(mockCreateMenu).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("価格が不正な場合はcreateMenuを呼ばずエラーを返す", async () => {
    const result = await createMenuAction(null, buildMenuFormData({ price_yen: "-100" }));

    expect(result).toEqual({ error: "料金は整数で入力してください。" });
    expect(mockCreateMenu).not.toHaveBeenCalled();
  });

  it("createMenuが失敗したら詳細を隠した一般的なエラーメッセージを返す", async () => {
    mockCreateMenu.mockRejectedValue(new Error("db down"));

    const result = await createMenuAction(null, buildMenuFormData());

    expect(result).toEqual({ error: GENERIC_SAVE_ERROR });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("成功したら一覧へ成功フラッシュ付きでredirectする", async () => {
    mockCreateMenu.mockResolvedValue(undefined);

    await expect(createMenuAction(null, buildMenuFormData())).rejects.toThrow(
      `NEXT_REDIRECT:/admin/menus?success=${encodeURIComponent("メニューを追加しました。")}`,
    );
    expect(mockCreateMenu).toHaveBeenCalledWith({
      name: "カット",
      description: null,
      price_yen: 3000,
      duration_minutes: 60,
    });
  });

  it("requireAdminを最初に呼ぶ", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT:/admin/login"));

    await expect(createMenuAction(null, buildMenuFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/admin/login",
    );
    expect(mockCreateMenu).not.toHaveBeenCalled();
  });
});

describe("updateMenuAction", () => {
  it("バリデーションエラーの場合はupdateMenuを呼ばずエラーを返す", async () => {
    const result = await updateMenuAction("menu-1", null, buildMenuFormData({ duration_minutes: "0" }));

    expect(result).toEqual({ error: "所要時間は1〜600の範囲で入力してください。" });
    expect(mockUpdateMenu).not.toHaveBeenCalled();
  });

  it("updateMenuが失敗したら一般的なエラーメッセージを返す", async () => {
    mockUpdateMenu.mockRejectedValue(new Error("db down"));

    const result = await updateMenuAction("menu-1", null, buildMenuFormData());

    expect(result).toEqual({ error: GENERIC_SAVE_ERROR });
  });

  it("成功したら一覧へ成功フラッシュ付きでredirectする", async () => {
    mockUpdateMenu.mockResolvedValue(undefined);

    await expect(updateMenuAction("menu-1", null, buildMenuFormData())).rejects.toThrow(
      `NEXT_REDIRECT:/admin/menus?success=${encodeURIComponent("メニューを更新しました。")}`,
    );
    expect(mockUpdateMenu).toHaveBeenCalledWith("menu-1", {
      name: "カット",
      description: null,
      price_yen: 3000,
      duration_minutes: 60,
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
    mockSetMenuPublished.mockResolvedValue(undefined);

    await expect(togglePublishAction(buildToggleFormData("menu-1", true))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/menus?success=${encodeURIComponent("メニューを公開しました。")}`,
    );
    expect(mockSetMenuPublished).toHaveBeenCalledWith("menu-1", true);
  });

  it("非公開に切り替えて成功したら非公開メッセージ付きでredirectする", async () => {
    mockSetMenuPublished.mockResolvedValue(undefined);

    await expect(togglePublishAction(buildToggleFormData("menu-1", false))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/menus?success=${encodeURIComponent("メニューを非公開にしました。")}`,
    );
  });

  it("失敗したらエラーフラッシュ付きでredirectする", async () => {
    mockSetMenuPublished.mockRejectedValue(new Error("db down"));

    await expect(togglePublishAction(buildToggleFormData("menu-1", false))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/menus?error=${encodeURIComponent("公開状態の変更に失敗しました。")}`,
    );
  });

  it("idが無い場合は例外を投げる", async () => {
    await expect(togglePublishAction(new FormData())).rejects.toThrow("Missing form field: id");
    expect(mockSetMenuPublished).not.toHaveBeenCalled();
  });
});

describe("deleteMenuAction", () => {
  function buildDeleteFormData(id: string): FormData {
    const formData = new FormData();
    formData.set("id", id);
    return formData;
  }

  it("成功したら成功フラッシュ付きでredirectする", async () => {
    mockDeleteMenu.mockResolvedValue(undefined);

    await expect(deleteMenuAction(buildDeleteFormData("menu-1"))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/menus?success=${encodeURIComponent("メニューを削除しました。")}`,
    );
    expect(mockDeleteMenu).toHaveBeenCalledWith("menu-1");
  });

  it("失敗したらエラーフラッシュ付きでredirectする", async () => {
    mockDeleteMenu.mockRejectedValue(new Error("db down"));

    await expect(deleteMenuAction(buildDeleteFormData("menu-1"))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/menus?error=${encodeURIComponent("削除に失敗しました。")}`,
    );
  });
});

describe("moveMenuAction", () => {
  function buildMoveFormData(id: string, direction: string): FormData {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("direction", direction);
    return formData;
  }

  it("direction=upならmoveMenuUpを呼びメニュー一覧へredirectする", async () => {
    mockMoveMenuUp.mockResolvedValue(undefined);

    await expect(moveMenuAction(buildMoveFormData("menu-1", "up"))).rejects.toThrow(
      "NEXT_REDIRECT:/admin/menus",
    );
    expect(mockMoveMenuUp).toHaveBeenCalledWith("menu-1");
    expect(mockMoveMenuDown).not.toHaveBeenCalled();
  });

  it("direction=downならmoveMenuDownを呼びメニュー一覧へredirectする", async () => {
    mockMoveMenuDown.mockResolvedValue(undefined);

    await expect(moveMenuAction(buildMoveFormData("menu-1", "down"))).rejects.toThrow(
      "NEXT_REDIRECT:/admin/menus",
    );
    expect(mockMoveMenuDown).toHaveBeenCalledWith("menu-1");
    expect(mockMoveMenuUp).not.toHaveBeenCalled();
  });

  it("不明なdirectionの場合はどちらも呼ばずメニュー一覧へredirectする", async () => {
    await expect(moveMenuAction(buildMoveFormData("menu-1", "sideways"))).rejects.toThrow(
      "NEXT_REDIRECT:/admin/menus",
    );
    expect(mockMoveMenuUp).not.toHaveBeenCalled();
    expect(mockMoveMenuDown).not.toHaveBeenCalled();
  });

  it("失敗したらエラーフラッシュ付きでredirectする", async () => {
    mockMoveMenuUp.mockRejectedValue(new Error("db down"));

    await expect(moveMenuAction(buildMoveFormData("menu-1", "up"))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/menus?error=${encodeURIComponent("並べ替えに失敗しました。")}`,
    );
  });
});

describe("セッション切れ(リポジトリ内のrequireAdmin()によるリダイレクト)", () => {
  it("createMenuAction はログイン画面へのリダイレクトを保存失敗のエラーに変えずにそのまま通す", async () => {
    const loginRedirect = new Error("NEXT_REDIRECT:/admin/login");
    mockCreateMenu.mockRejectedValue(loginRedirect);

    await expect(createMenuAction(null, buildMenuFormData())).rejects.toBe(loginRedirect);
  });
});
