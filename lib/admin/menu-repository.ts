import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/auth";
import type { MenuInput } from "@/lib/admin/schemas";
import { createSupabaseServerClient, type Database } from "@/lib/supabase/server";
import type { Menu } from "@/types/database";

/**
 * 管理画面用のメニュー・料金 CRUD。menusテーブルはBotの自動応答からは一切参照されない
 * (Phase 3計画の確定事項。反映するのは将来の別フェーズ)。
 *
 * 各関数は`requireAdmin()`を自分で呼ぶ。proxy.tsの楽観チェック・呼び出し元ページ/Server Action
 * のチェックとは独立した最終防御線(多層防御方針。lib/admin/faq-repository.tsと同じ方針)。
 */

async function fetchOrderedMenus(supabase: SupabaseClient<Database>): Promise<Menu[]> {
  const { data, error } = await supabase
    .from("menus")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch menus: ${error.message}`, { cause: error });
  }

  return data ?? [];
}

export async function listMenusForAdmin(): Promise<Menu[]> {
  await requireAdmin();
  return fetchOrderedMenus(createSupabaseServerClient());
}

export async function getMenuById(id: string): Promise<Menu | null> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase.from("menus").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch menu: ${error.message}`, { cause: error });
  }

  return data;
}

export async function createMenu(input: MenuInput): Promise<Menu> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  // 新規メニューは常に末尾に追加する(display_orderはUIに出さず、並べ替えは上へ/下へボタンのみ)。
  const existing = await fetchOrderedMenus(supabase);
  const nextDisplayOrder =
    existing.length > 0 ? existing[existing.length - 1].display_order + 1 : 0;

  const { data, error } = await supabase
    .from("menus")
    .insert({ ...input, display_order: nextDisplayOrder })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create menu: ${error?.message ?? "unknown error"}`, { cause: error });
  }

  return data;
}

export async function updateMenu(id: string, input: MenuInput): Promise<Menu> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase.from("menus").update(input).eq("id", id).select().single();

  if (error || !data) {
    throw new Error(`Failed to update menu: ${error?.message ?? "unknown error"}`, { cause: error });
  }

  return data;
}

export async function setMenuPublished(id: string, isPublished: boolean): Promise<void> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from("menus").update({ is_published: isPublished }).eq("id", id);

  if (error) {
    throw new Error(`Failed to update menu publish state: ${error.message}`, { cause: error });
  }
}

export async function deleteMenu(id: string): Promise<void> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from("menus").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete menu: ${error.message}`, { cause: error });
  }
}

type MoveDirection = "up" | "down";

// 既知の制約: 2回の個別UPDATEによるdisplay_orderのswapで、Postgresトランザクション/RPCではない。
// 単一オーナー運用(並行編集は後勝ちで許容)を前提とした割り切り。lib/admin/faq-repository.tsの
// moveFaq()と同じ設計・同じ既知の限界を持つ。
async function moveMenu(id: string, direction: MoveDirection): Promise<void> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const menus = await fetchOrderedMenus(supabase);
  const index = menus.findIndex((menu) => menu.id === id);
  if (index === -1) {
    throw new Error("Failed to reorder menu: menu not found");
  }

  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= menus.length) {
    // 既に先頭/末尾なので何もしない。
    return;
  }

  const current = menus[index];
  const neighbor = menus[neighborIndex];

  const { error: currentError } = await supabase
    .from("menus")
    .update({ display_order: neighbor.display_order })
    .eq("id", current.id);
  if (currentError) {
    throw new Error(`Failed to reorder menu: ${currentError.message}`, { cause: currentError });
  }

  const { error: neighborError } = await supabase
    .from("menus")
    .update({ display_order: current.display_order })
    .eq("id", neighbor.id);
  if (neighborError) {
    throw new Error(`Failed to reorder menu: ${neighborError.message}`, { cause: neighborError });
  }
}

export async function moveMenuUp(id: string): Promise<void> {
  await moveMenu(id, "up");
}

export async function moveMenuDown(id: string): Promise<void> {
  await moveMenu(id, "down");
}
