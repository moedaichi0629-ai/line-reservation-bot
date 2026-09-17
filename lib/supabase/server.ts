import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Conversation, Faq, Menu } from "@/types/database";

/** DBがデフォルト値を持つ、またはNULL許容のカラムをInsert時に省略可能にする */
type WithOptionalColumns<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type FaqInsert = WithOptionalColumns<
  Faq,
  "id" | "created_at" | "updated_at" | "category" | "display_order" | "is_published"
>;
type MenuInsert = WithOptionalColumns<
  Menu,
  "id" | "created_at" | "updated_at" | "description" | "display_order" | "is_published"
>;
type ConversationInsert = WithOptionalColumns<
  Conversation,
  | "id"
  | "created_at"
  | "message_type"
  | "message_text"
  | "line_message_id"
  | "raw_event"
  | "confidence"
  | "matched_faq_ids"
  | "escalated"
>;

export interface Database {
  public: {
    Tables: {
      faq: {
        Row: Faq;
        Insert: FaqInsert;
        Update: Partial<FaqInsert>;
        Relationships: [];
      };
      menus: {
        Row: Menu;
        Insert: MenuInsert;
        Update: Partial<MenuInsert>;
        Relationships: [];
      };
      conversations: {
        Row: Conversation;
        Insert: ConversationInsert;
        Update: Partial<ConversationInsert>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
  };
}

let cachedClient: SupabaseClient<Database> | undefined;

/**
 * サーバー専用のSupabaseクライアント（service role key使用、RLSをバイパスする）。
 * Client Componentからは絶対にimportしないこと（"server-only"がビルド時に検知する）。
 */
export function createSupabaseServerClient(): SupabaseClient<Database> {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment."
    );
  }

  cachedClient = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return cachedClient;
}
