import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/auth";
import type { FaqInput } from "@/lib/admin/schemas";
import { createSupabaseServerClient, type Database } from "@/lib/supabase/server";
import type { Faq } from "@/types/database";

/**
 * 管理画面用のFAQ CRUD。Bot側が読む`lib/supabase/faq.ts`の`getPublishedFaqs()`は
 * 変更しない(公開FAQのみを返す既存の挙動を保つ)。
 *
 * 各関数は`requireAdmin()`を自分で呼ぶ。proxy.tsの楽観チェック・呼び出し元ページ/Server Action
 * のチェックとは独立した最終防御線(多層防御方針。lib/admin/auth.tsの方針を踏襲)。
 */

async function fetchOrderedFaqs(supabase: SupabaseClient<Database>): Promise<Faq[]> {
  const { data, error } = await supabase
    .from("faq")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch FAQs: ${error.message}`, { cause: error });
  }

  return data ?? [];
}

export async function listFaqsForAdmin(): Promise<Faq[]> {
  await requireAdmin();
  return fetchOrderedFaqs(createSupabaseServerClient());
}

export async function getFaqById(id: string): Promise<Faq | null> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase.from("faq").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch FAQ: ${error.message}`, { cause: error });
  }

  return data;
}

export async function createFaq(input: FaqInput): Promise<Faq> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  // 新規FAQは常に末尾に追加する(display_orderはUIに出さず、並べ替えは上へ/下へボタンのみ)。
  const existing = await fetchOrderedFaqs(supabase);
  const nextDisplayOrder =
    existing.length > 0 ? existing[existing.length - 1].display_order + 1 : 0;

  const { data, error } = await supabase
    .from("faq")
    .insert({ ...input, display_order: nextDisplayOrder })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create FAQ: ${error?.message ?? "unknown error"}`, { cause: error });
  }

  return data;
}

export async function updateFaq(id: string, input: FaqInput): Promise<Faq> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase.from("faq").update(input).eq("id", id).select().single();

  if (error || !data) {
    throw new Error(`Failed to update FAQ: ${error?.message ?? "unknown error"}`, { cause: error });
  }

  return data;
}

export async function setFaqPublished(id: string, isPublished: boolean): Promise<void> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from("faq").update({ is_published: isPublished }).eq("id", id);

  if (error) {
    throw new Error(`Failed to update FAQ publish state: ${error.message}`, { cause: error });
  }
}

export async function deleteFaq(id: string): Promise<void> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.from("faq").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete FAQ: ${error.message}`, { cause: error });
  }
}

type MoveDirection = "up" | "down";

async function moveFaq(id: string, direction: MoveDirection): Promise<void> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const faqs = await fetchOrderedFaqs(supabase);
  const index = faqs.findIndex((faq) => faq.id === id);
  if (index === -1) {
    throw new Error("Failed to reorder FAQ: FAQ not found");
  }

  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= faqs.length) {
    // 既に先頭/末尾なので何もしない。
    return;
  }

  const current = faqs[index];
  const neighbor = faqs[neighborIndex];

  const { error: currentError } = await supabase
    .from("faq")
    .update({ display_order: neighbor.display_order })
    .eq("id", current.id);
  if (currentError) {
    throw new Error(`Failed to reorder FAQ: ${currentError.message}`, { cause: currentError });
  }

  const { error: neighborError } = await supabase
    .from("faq")
    .update({ display_order: current.display_order })
    .eq("id", neighbor.id);
  if (neighborError) {
    throw new Error(`Failed to reorder FAQ: ${neighborError.message}`, { cause: neighborError });
  }
}

export async function moveFaqUp(id: string): Promise<void> {
  await moveFaq(id, "up");
}

export async function moveFaqDown(id: string): Promise<void> {
  await moveFaq(id, "down");
}
