export type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  display_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type Menu = {
  id: string;
  name: string;
  description: string | null;
  price_yen: number;
  duration_minutes: number;
  display_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type ConversationDirection = "inbound" | "outbound";

export type ConversationConfidence = "high" | "medium" | "low";

export type Conversation = {
  id: string;
  line_user_id: string;
  direction: ConversationDirection;
  message_type: string;
  message_text: string | null;
  line_message_id: string | null;
  raw_event: unknown;
  /** AI回答時の確信度。fallback-error等、判定自体が行われなかった行はNULL。 */
  confidence: ConversationConfidence | null;
  /** 回答の根拠として実際に使用された（実在確認済みの）faq.idの配列。 */
  matched_faq_ids: string[] | null;
  /** オーナーへのエスカレーション経路が選択されたか（Push配送成功は表さない）。 */
  escalated: boolean;
  created_at: string;
};
