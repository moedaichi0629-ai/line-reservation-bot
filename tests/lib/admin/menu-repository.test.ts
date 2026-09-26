import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { Menu } from "@/types/database";

const mockRequireAdmin = vi.fn(async () => {});
vi.mock("@/lib/admin/auth", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

import {
  createMenu,
  deleteMenu,
  getMenuById,
  listMenusForAdmin,
  moveMenuDown,
  moveMenuUp,
  setMenuPublished,
  updateMenu,
} from "@/lib/admin/menu-repository";

function makeMenu(overrides: Partial<Menu> = {}): Menu {
  return {
    id: "menu-1",
    name: "カット",
    description: "シャンプー込み",
    price_yen: 3000,
    duration_minutes: 60,
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

describe("listMenusForAdmin", () => {
  it("公開/非公開を問わず全件をdisplay_order→created_at昇順で取得する", async () => {
    const menus = [makeMenu()];
    const order2 = vi.fn().mockResolvedValue({ data: menus, error: null });
    const order1 = vi.fn(() => ({ order: order2 }));
    const select = vi.fn(() => ({ order: order1 }));
    const from = vi.fn(() => ({ select }));
    mockCreateSupabaseServerClient.mockReturnValue({ from });

    const result = await listMenusForAdmin();

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("menus");
    expect(select).toHaveBeenCalledWith("*");
    expect(order1).toHaveBeenCalledWith("display_order", { ascending: true });
    expect(order2).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(result).toEqual(menus);
  });

  it("dataがnullの場合は空配列を返す", async () => {
    const order2 = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn(() => ({ order: vi.fn(() => ({ order: order2 })) }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    expect(await listMenusForAdmin()).toEqual([]);
  });

  it("エラー時は例外を投げる", async () => {
    const order2 = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const select = vi.fn(() => ({ order: vi.fn(() => ({ order: order2 })) }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    await expect(listMenusForAdmin()).rejects.toThrow("Failed to fetch menus: boom");
  });
});

describe("getMenuById", () => {
  it("存在するメニューを返す", async () => {
    const menu = makeMenu();
    const maybeSingle = vi.fn().mockResolvedValue({ data: menu, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mockCreateSupabaseServerClient.mockReturnValue({ from });

    const result = await getMenuById(menu.id);

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", menu.id);
    expect(result).toEqual(menu);
  });

  it("存在しない場合はnullを返す", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    expect(await getMenuById("missing")).toBeNull();
  });

  it("エラー時は例外を投げる", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    await expect(getMenuById("menu-1")).rejects.toThrow("Failed to fetch menu: boom");
  });
});

describe("createMenu", () => {
  it("既存メニューが無ければdisplay_order=0で作成する", async () => {
    const created = makeMenu({ display_order: 0 });
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

    const result = await createMenu({
      name: "カット",
      description: null,
      price_yen: 3000,
      duration_minutes: 60,
    });

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith({
      name: "カット",
      description: null,
      price_yen: 3000,
      duration_minutes: 60,
      display_order: 0,
    });
    expect(result).toEqual(created);
  });

  it("既存メニューがあれば最大display_order+1で末尾に作成する", async () => {
    const existing = [makeMenu({ id: "a", display_order: 0 }), makeMenu({ id: "b", display_order: 3 })];
    const order2 = vi.fn().mockResolvedValue({ data: existing, error: null });
    const listSelect = vi.fn(() => ({ order: vi.fn(() => ({ order: order2 })) }));

    const single = vi.fn().mockResolvedValue({ data: makeMenu({ display_order: 4 }), error: null });
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));

    const from = vi
      .fn()
      .mockReturnValueOnce({ select: listSelect })
      .mockReturnValueOnce({ insert });
    mockCreateSupabaseServerClient.mockReturnValue({ from });

    await createMenu({ name: "カット", description: null, price_yen: 3000, duration_minutes: 60 });

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

    await expect(
      createMenu({ name: "カット", description: null, price_yen: 3000, duration_minutes: 60 }),
    ).rejects.toThrow("Failed to create menu: boom");
  });
});

describe("updateMenu", () => {
  it("name/description/price_yen/duration_minutesのみを更新する(display_order/is_publishedには触れない)", async () => {
    const updated = makeMenu({ name: "パーマ" });
    const single = vi.fn().mockResolvedValue({ data: updated, error: null });
    const eq = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const update = vi.fn(() => ({ eq }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ update })) });

    const result = await updateMenu("menu-1", {
      name: "パーマ",
      description: null,
      price_yen: 8000,
      duration_minutes: 120,
    });

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      name: "パーマ",
      description: null,
      price_yen: 8000,
      duration_minutes: 120,
    });
    expect(eq).toHaveBeenCalledWith("id", "menu-1");
    expect(result).toEqual(updated);
  });

  it("エラー時は例外を投げる", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const update = vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ single })) })) }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ update })) });

    await expect(
      updateMenu("menu-1", { name: "カット", description: null, price_yen: 3000, duration_minutes: 60 }),
    ).rejects.toThrow("Failed to update menu: boom");
  });
});

describe("setMenuPublished", () => {
  it("is_publishedのみを更新する", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ update })) });

    await setMenuPublished("menu-1", false);

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ is_published: false });
    expect(eq).toHaveBeenCalledWith("id", "menu-1");
  });

  it("エラー時は例外を投げる", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ update: vi.fn(() => ({ eq })) })) });

    await expect(setMenuPublished("menu-1", true)).rejects.toThrow(
      "Failed to update menu publish state: boom",
    );
  });
});

describe("deleteMenu", () => {
  it("idで1件削除する", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const del = vi.fn(() => ({ eq }));
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ delete: del })) });

    await deleteMenu("menu-1");

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", "menu-1");
  });

  it("エラー時は例外を投げる", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn(() => ({ delete: vi.fn(() => ({ eq })) })) });

    await expect(deleteMenu("menu-1")).rejects.toThrow("Failed to delete menu: boom");
  });
});

describe("moveMenuUp / moveMenuDown", () => {
  function mockOrderedList(menus: Menu[]) {
    const order2 = vi.fn().mockResolvedValue({ data: menus, error: null });
    return vi.fn(() => ({ order: vi.fn(() => ({ order: order2 })) }));
  }

  it("上へ移動すると自分と1つ上の項目のdisplay_orderを入れ替える", async () => {
    const a = makeMenu({ id: "a", display_order: 0 });
    const b = makeMenu({ id: "b", display_order: 1 });
    const c = makeMenu({ id: "c", display_order: 2 });
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

    await moveMenuUp(b.id);

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(updateForB).toHaveBeenCalledWith({ display_order: a.display_order });
    expect(eqForB).toHaveBeenCalledWith("id", b.id);
    expect(updateForA).toHaveBeenCalledWith({ display_order: b.display_order });
    expect(eqForA).toHaveBeenCalledWith("id", a.id);
  });

  it("先頭の項目を上へ移動しても何も更新しない(no-op)", async () => {
    const a = makeMenu({ id: "a", display_order: 0 });
    const b = makeMenu({ id: "b", display_order: 1 });
    const select = mockOrderedList([a, b]);
    const from = vi.fn().mockReturnValueOnce({ select });
    mockCreateSupabaseServerClient.mockReturnValue({ from });

    await moveMenuUp(a.id);

    expect(from).toHaveBeenCalledTimes(1);
  });

  it("末尾の項目を下へ移動しても何も更新しない(no-op)", async () => {
    const a = makeMenu({ id: "a", display_order: 0 });
    const b = makeMenu({ id: "b", display_order: 1 });
    const select = mockOrderedList([a, b]);
    const from = vi.fn().mockReturnValueOnce({ select });
    mockCreateSupabaseServerClient.mockReturnValue({ from });

    await moveMenuDown(b.id);

    expect(from).toHaveBeenCalledTimes(1);
  });

  it("下へ移動すると自分と1つ下の項目のdisplay_orderを入れ替える", async () => {
    const a = makeMenu({ id: "a", display_order: 0 });
    const b = makeMenu({ id: "b", display_order: 1 });
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

    await moveMenuDown(a.id);

    expect(updateForA).toHaveBeenCalledWith({ display_order: b.display_order });
    expect(updateForB).toHaveBeenCalledWith({ display_order: a.display_order });
  });

  it("存在しないidの場合は例外を投げる", async () => {
    const select = mockOrderedList([makeMenu({ id: "a" })]);
    mockCreateSupabaseServerClient.mockReturnValue({ from: vi.fn().mockReturnValueOnce({ select }) });

    await expect(moveMenuUp("missing")).rejects.toThrow("menu not found");
  });
});

describe("未認証の場合は全関数がDBへアクセスせず拒否する", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockRequireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT:/admin/login"));
  });

  const cases: Array<[string, () => Promise<unknown>]> = [
    ["listMenusForAdmin", () => listMenusForAdmin()],
    ["getMenuById", () => getMenuById("menu-1")],
    [
      "createMenu",
      () => createMenu({ name: "カット", description: null, price_yen: 3000, duration_minutes: 60 }),
    ],
    [
      "updateMenu",
      () =>
        updateMenu("menu-1", {
          name: "カット",
          description: null,
          price_yen: 3000,
          duration_minutes: 60,
        }),
    ],
    ["setMenuPublished", () => setMenuPublished("menu-1", false)],
    ["deleteMenu", () => deleteMenu("menu-1")],
    ["moveMenuUp", () => moveMenuUp("menu-1")],
    ["moveMenuDown", () => moveMenuDown("menu-1")],
  ];

  it.each(cases)("%s", async (_name, run) => {
    await expect(run()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(mockCreateSupabaseServerClient).not.toHaveBeenCalled();
  });
});
