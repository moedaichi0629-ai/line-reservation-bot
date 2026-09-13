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

export type Conversation = {
  id: string;
  line_user_id: string;
  direction: ConversationDirection;
  message_type: string;
  message_text: string | null;
  line_message_id: string | null;
  raw_event: unknown;
  created_at: string;
};
