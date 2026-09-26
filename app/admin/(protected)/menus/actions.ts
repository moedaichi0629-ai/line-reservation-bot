"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { buildFlashUrl, type FlashKind } from "@/lib/admin/flash";
import { requireStringField } from "@/lib/admin/form-data";
import { errorName } from "@/lib/admin/log";
import { ADMIN_MENUS_PATH } from "@/lib/admin/constants";
import {
  createMenu,
  deleteMenu,
  moveMenuDown,
  moveMenuUp,
  setMenuPublished,
  updateMenu,
} from "@/lib/admin/menu-repository";
import { parseMenuInput } from "@/lib/admin/schemas";

export type MenuFormState = { error: string } | null;

const GENERIC_SAVE_ERROR = "保存に失敗しました。時間をおいて再度お試しください。";

function flashUrl(kind: FlashKind, message: string): string {
  return buildFlashUrl(ADMIN_MENUS_PATH, { kind, message });
}

function logMenuActionError(action: string, error: unknown): void {
  console.error(`[admin-menu] ${action} failed:`, errorName(error));
}

export async function createMenuAction(
  _previousState: MenuFormState,
  formData: FormData,
): Promise<MenuFormState> {
  await requireAdmin();

  const parsed = parseMenuInput(formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  try {
    await createMenu(parsed.data);
  } catch (error) {
    // リポジトリ内のrequireAdmin()によるログイン画面へのリダイレクトは握りつぶさずにそのまま通す。
    unstable_rethrow(error);
    logMenuActionError("create", error);
    return { error: GENERIC_SAVE_ERROR };
  }

  redirect(flashUrl("success", "メニューを追加しました。"));
}

export async function updateMenuAction(
  id: string,
  _previousState: MenuFormState,
  formData: FormData,
): Promise<MenuFormState> {
  await requireAdmin();

  const parsed = parseMenuInput(formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  try {
    await updateMenu(id, parsed.data);
  } catch (error) {
    // リポジトリ内のrequireAdmin()によるログイン画面へのリダイレクトは握りつぶさずにそのまま通す。
    unstable_rethrow(error);
    logMenuActionError("update", error);
    return { error: GENERIC_SAVE_ERROR };
  }

  redirect(flashUrl("success", "メニューを更新しました。"));
}

export async function togglePublishAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = requireStringField(formData, "id");
  const nextPublished = formData.get("nextPublished") === "true";

  let message: string;
  try {
    await setMenuPublished(id, nextPublished);
    message = nextPublished ? "メニューを公開しました。" : "メニューを非公開にしました。";
  } catch (error) {
    // リポジトリ内のrequireAdmin()によるログイン画面へのリダイレクトは握りつぶさずにそのまま通す。
    unstable_rethrow(error);
    logMenuActionError("toggle publish", error);
    redirect(flashUrl("error", "公開状態の変更に失敗しました。"));
  }

  redirect(flashUrl("success", message));
}

export async function deleteMenuAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = requireStringField(formData, "id");

  try {
    await deleteMenu(id);
  } catch (error) {
    // リポジトリ内のrequireAdmin()によるログイン画面へのリダイレクトは握りつぶさずにそのまま通す。
    unstable_rethrow(error);
    logMenuActionError("delete", error);
    redirect(flashUrl("error", "削除に失敗しました。"));
  }

  redirect(flashUrl("success", "メニューを削除しました。"));
}

export async function moveMenuAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = requireStringField(formData, "id");
  const direction = formData.get("direction");

  try {
    if (direction === "up") {
      await moveMenuUp(id);
    } else if (direction === "down") {
      await moveMenuDown(id);
    }
  } catch (error) {
    // リポジトリ内のrequireAdmin()によるログイン画面へのリダイレクトは握りつぶさずにそのまま通す。
    unstable_rethrow(error);
    logMenuActionError("reorder", error);
    redirect(flashUrl("error", "並べ替えに失敗しました。"));
  }

  redirect(ADMIN_MENUS_PATH);
}
