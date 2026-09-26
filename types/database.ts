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

export type AnnouncementStatus = "draft" | "sending" | "sent" | "failed";

/**
 * お知らせ配信(LINE Broadcast)の履歴。migration 0003_announcements.sql と対応する。
 * 友だち全員へのBroadcastのため、宛先(LINEユーザーID等)は保持しない。
 */
export type Announcement = {
  id: string;
  /** 配信本文（テキスト1通）。DB側の上限は5000字、運用上の上限はアプリ側で検証する。 */
  body: string;
  status: AnnouncementStatus;
  /** LINE Messaging APIの X-Line-Retry-Key に渡すUUID（UNIQUE）。 */
  retry_key: string;
  /** LINEのレスポンスヘッダ x-line-request-id（DB上限100字）。 */
  line_request_id: string | null;
  /** 失敗理由の日本語要約（DB上限500字）。秘密情報・生レスポンスは入れない。 */
  error_message: string | null;
  created_at: string;
  /** 最後に送信処理を開始した日時。draftの間はNULL。 */
  sending_started_at: string | null;
  /** LINEが送信依頼を受け付けた日時。sentのときのみ値がある。 */
  sent_at: string | null;
};
