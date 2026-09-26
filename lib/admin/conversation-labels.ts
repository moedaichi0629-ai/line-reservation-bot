import { API_FAILURE_REPLY_TEXT } from "@/lib/faq/reply-templates";
import type { Tone } from "@/lib/admin/tone";
import type { ConversationConfidence } from "@/types/database";

/**
 * 会話ログ画面で使う表示用の変換(内部値 → 管理者が理解しやすい日本語)。
 * DBアクセスを行わない純粋関数のみを置く。
 */

export type LabelTone = Tone;

// LINEのユーザーIDは"U"+32桁の16進数(33文字)。極端に短い値は末尾4文字だけでも
// 全体の大部分が見えてしまうため、識別子を出さない。
const MIN_MASKABLE_LINE_USER_ID_LENGTH = 8;
const VISIBLE_LINE_USER_ID_SUFFIX_LENGTH = 4;

/**
 * LINEユーザーIDを画面表示用に伏せる。末尾4文字のみを「お客様（末尾xxxx）」として表示する。
 * 完全なIDはこの関数の外(画面・URL・クライアント)へ出さない。
 */
export function maskLineUserId(lineUserId: string): string {
  const trimmed = lineUserId.trim();
  if (trimmed.length < MIN_MASKABLE_LINE_USER_ID_LENGTH) {
    return "お客様（ID不明）";
  }
  return `お客様（末尾${trimmed.slice(-VISIBLE_LINE_USER_ID_SUFFIX_LENGTH)}）`;
}

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  image: "画像",
  video: "動画",
  audio: "音声",
  file: "ファイル",
  location: "位置情報",
  sticker: "スタンプ",
};

/**
 * お客様から届いたメッセージの表示文。テキスト以外(画像・スタンプ等)は本文が保存されないため、
 * 種類だけを日本語で示す。
 */
export function describeCustomerMessage(messageType: string, messageText: string | null): string {
  if (messageType === "text") {
    return messageText && messageText.length > 0 ? messageText : "（内容なし）";
  }
  const typeLabel = MESSAGE_TYPE_LABELS[messageType] ?? "テキスト以外のメッセージ";
  return `（${typeLabel}が送信されました）`;
}

const CONFIDENCE_LABELS: Record<ConversationConfidence, string> = {
  high: "高い",
  medium: "ふつう",
  low: "低い",
};

/** AI回答の確信度を「回答の確かさ」として表示する。判定が行われていない返信はnull。 */
export function describeConfidence(confidence: ConversationConfidence | null): string | null {
  return confidence ? CONFIDENCE_LABELS[confidence] : null;
}

export type BotReplyLabel = {
  label: string;
  tone: LabelTone;
  description: string;
};

/**
 * Botの返信(outbound)がどの経路で送られたかを日本語ラベルにする。
 * 判定はWebhookが保存する値の組み合わせに対応する(app/api/line/webhook/route.ts参照):
 * - escalated=true          → スタッフ確認(confidence=lowの固定文言)
 * - confidence=high/medium  → FAQにもとづく自動回答
 * - confidence=null         → AI判定を経ない返信(システム障害時のお詫び文・テキスト以外への定型文など)
 */
export function describeBotReply(params: {
  confidence: ConversationConfidence | null;
  escalated: boolean;
  messageText: string | null;
}): BotReplyLabel {
  const { confidence, escalated, messageText } = params;

  if (escalated) {
    return {
      label: "スタッフ確認が必要",
      tone: "warning",
      description:
        "Botでは確実に回答できないと判断し、「スタッフが確認します」とお客様へ返信しました。オーナーへのLINE通知の対象です。",
    };
  }

  if (confidence === "high" || confidence === "medium") {
    return {
      label: "自動回答",
      tone: "success",
      description: "登録されているFAQをもとに、Botが自動で回答しました。",
    };
  }

  if (confidence === "low") {
    return {
      label: "要確認",
      tone: "warning",
      description: "回答の確かさが低い返信です。内容をご確認ください。",
    };
  }

  if (messageText === API_FAILURE_REPLY_TEXT) {
    return {
      label: "自動応答エラー",
      tone: "danger",
      description:
        "システムの一時的な不具合のため、お詫びの定型文を返信しました。必要に応じてお客様へご連絡ください。",
    };
  }

  return {
    label: "定型メッセージ",
    tone: "neutral",
    description: "自動回答の対象外のため、決まった文面を返信しました（画像・スタンプへの返信など）。",
  };
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** サーバー(Vercel)のタイムゾーンはUTCのため、常に日本時間で表示する。 */
export function formatDateTimeJst(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "日時不明";
  }
  return DATE_TIME_FORMATTER.format(date);
}
