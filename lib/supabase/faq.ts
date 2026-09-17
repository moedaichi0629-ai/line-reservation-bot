import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Faq } from "@/types/database";

/**
 * 公開中(is_published=true)のFAQを表示順に取得する。
 */
export async function getPublishedFaqs(): Promise<Faq[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("faq")
    .select("*")
    .eq("is_published", true)
    .order("display_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch published FAQs: ${error.message}`, {
      cause: error,
    });
  }

  return data ?? [];
}
