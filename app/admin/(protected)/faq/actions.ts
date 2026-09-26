"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { buildFlashUrl, type FlashKind } from "@/lib/admin/flash";
import { requireStringField } from "@/lib/admin/form-data";
import { errorName } from "@/lib/admin/log";
import { ADMIN_FAQ_PATH } from "@/lib/admin/constants";
import {
  createFaq,
  deleteFaq,
  moveFaqDown,
  moveFaqUp,
  setFaqPublished,
  updateFaq,
} from "@/lib/admin/faq-repository";
import { parseFaqInput } from "@/lib/admin/schemas";

export type FaqFormState = { error: string } | null;

const GENERIC_SAVE_ERROR = "保存に失敗しました。時間をおいて再度お試しください。";

function flashUrl(kind: FlashKind, message: string): string {
  return buildFlashUrl(ADMIN_FAQ_PATH, { kind, message });
}

function logFaqActionError(action: string, error: unknown): void {
  console.error(`[admin-faq] ${action} failed:`, errorName(error));
}

export async function createFaqAction(
  _previousState: FaqFormState,
  formData: FormData,
): Promise<FaqFormState> {
  await requireAdmin();

  const parsed = parseFaqInput(formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  try {
    await createFaq(parsed.data);
  } catch (error) {
    // リポジトリ内のrequireAdmin()によるログイン画面へのリダイレクトは握りつぶさずにそのまま通す。
    unstable_rethrow(error);
    logFaqActionError("create", error);
    return { error: GENERIC_SAVE_ERROR };
  }

  redirect(flashUrl("success", "FAQを追加しました。"));
}

export async function updateFaqAction(
  id: string,
  _previousState: FaqFormState,
  formData: FormData,
): Promise<FaqFormState> {
  await requireAdmin();

  const parsed = parseFaqInput(formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  try {
    await updateFaq(id, parsed.data);
  } catch (error) {
    // リポジトリ内のrequireAdmin()によるログイン画面へのリダイレクトは握りつぶさずにそのまま通す。
    unstable_rethrow(error);
    logFaqActionError("update", error);
    return { error: GENERIC_SAVE_ERROR };
  }

  redirect(flashUrl("success", "FAQを更新しました。"));
}

export async function togglePublishAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = requireStringField(formData, "id");
  const nextPublished = formData.get("nextPublished") === "true";

  let message: string;
  try {
    await setFaqPublished(id, nextPublished);
    message = nextPublished ? "FAQを公開しました。" : "FAQを非公開にしました。";
  } catch (error) {
    // リポジトリ内のrequireAdmin()によるログイン画面へのリダイレクトは握りつぶさずにそのまま通す。
    unstable_rethrow(error);
    logFaqActionError("toggle publish", error);
    redirect(flashUrl("error", "公開状態の変更に失敗しました。"));
  }

  redirect(flashUrl("success", message));
}

export async function deleteFaqAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = requireStringField(formData, "id");

  try {
    await deleteFaq(id);
  } catch (error) {
    // リポジトリ内のrequireAdmin()によるログイン画面へのリダイレクトは握りつぶさずにそのまま通す。
    unstable_rethrow(error);
    logFaqActionError("delete", error);
    redirect(flashUrl("error", "削除に失敗しました。"));
  }

  redirect(flashUrl("success", "FAQを削除しました。"));
}

export async function moveFaqAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = requireStringField(formData, "id");
  const direction = formData.get("direction");

  try {
    if (direction === "up") {
      await moveFaqUp(id);
    } else if (direction === "down") {
      await moveFaqDown(id);
    }
  } catch (error) {
    // リポジトリ内のrequireAdmin()によるログイン画面へのリダイレクトは握りつぶさずにそのまま通す。
    unstable_rethrow(error);
    logFaqActionError("reorder", error);
    redirect(flashUrl("error", "並べ替えに失敗しました。"));
  }

  redirect(ADMIN_FAQ_PATH);
}
