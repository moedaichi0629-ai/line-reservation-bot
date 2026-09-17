import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { webhook } from "@line/bot-sdk";

vi.mock("@/lib/line/verify-signature", () => ({
  verifyLineSignature: vi.fn(),
}));

vi.mock("@/lib/line/client", () => ({
  getLineClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/faq/answer-user-question", () => ({
  answerUserQuestion: vi.fn(),
}));

vi.mock("@/lib/line/escalate-to-owner", () => ({
  notifyOwnerOfEscalation: vi.fn(),
}));

import { POST } from "@/app/api/line/webhook/route";
import { verifyLineSignature } from "@/lib/line/verify-signature";
import { getLineClient } from "@/lib/line/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { answerUserQuestion } from "@/lib/faq/answer-user-question";
import { notifyOwnerOfEscalation } from "@/lib/line/escalate-to-owner";
import {
  API_FAILURE_REPLY_TEXT,
  LOW_CONFIDENCE_REPLY_TEXT,
} from "@/lib/faq/reply-templates";

const mockVerifyLineSignature = vi.mocked(verifyLineSignature);
const mockGetLineClient = vi.mocked(getLineClient);
const mockCreateSupabaseServerClient = vi.mocked(createSupabaseServerClient);
const mockAnswerUserQuestion = vi.mocked(answerUserQuestion);
const mockNotifyOwnerOfEscalation = vi.mocked(notifyOwnerOfEscalation);

const CHANNEL_SECRET = "dummy-channel-secret-do-not-leak";
const REPLY_TOKEN = "dummy-reply-token";
const USER_ID = "dummy-line-user-id";
const DEFAULT_QUESTION = "営業時間を教えて";

const mockReplyMessage = vi.fn();
const mockInsert = vi.fn();
const mockDeleteEq2 = vi.fn();
const mockDeleteEq1 = vi.fn(() => ({ eq: mockDeleteEq2 }));
const mockDelete = vi.fn(() => ({ eq: mockDeleteEq1 }));
const mockFrom = vi.fn(() => ({ insert: mockInsert, delete: mockDelete }));

function textMessageEvent(
  params: { text?: string; messageId?: string; userId?: string } = {}
): webhook.MessageEvent {
  const { text = DEFAULT_QUESTION, messageId = "msg-1", userId = USER_ID } = params;

  return {
    type: "message",
    replyToken: REPLY_TOKEN,
    source: { type: "user", userId },
    timestamp: 1700000000000,
    mode: "active",
    webhookEventId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    deliveryContext: { isRedelivery: false },
    message: {
      type: "text",
      id: messageId,
      text,
      quoteToken: "dummy-quote-token",
    },
  };
}

function stickerMessageEvent(): webhook.MessageEvent {
  return {
    type: "message",
    replyToken: REPLY_TOKEN,
    source: { type: "user", userId: USER_ID },
    timestamp: 1700000000000,
    mode: "active",
    webhookEventId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    deliveryContext: { isRedelivery: false },
    message: {
      type: "sticker",
      id: "sticker-msg-1",
      stickerId: "1",
      packageId: "1",
      stickerResourceType: "STATIC",
      keywords: [],
      quoteToken: "dummy-quote-token",
    },
  };
}

async function postWebhook(events: webhook.Event[]): Promise<Response> {
  const body = JSON.stringify({
    destination: "Uabcdefabcdefabcdefabcdefabcdefab",
    events,
  });

  const request = new Request("http://localhost/api/line/webhook", {
    method: "POST",
    headers: { "x-line-signature": "dummy-signature" },
    body,
  });

  return POST(request);
}

/** console呼び出しに渡された全引数の中に、指定した文字列が含まれていないかを確認する。 */
function loggedArgsContain(calls: unknown[][], needle: string): boolean {
  return calls.flat().some((arg) => {
    if (typeof arg === "string") {
      return arg.includes(needle);
    }
    try {
      return JSON.stringify(arg)?.includes(needle) ?? false;
    } catch {
      return false;
    }
  });
}

beforeEach(() => {
  process.env.LINE_CHANNEL_SECRET = CHANNEL_SECRET;

  mockVerifyLineSignature.mockReset();
  mockVerifyLineSignature.mockReturnValue(true);

  mockGetLineClient.mockReset();
  mockReplyMessage.mockReset();
  mockReplyMessage.mockResolvedValue({ sentMessages: [{ id: "sent-msg-1" }] });
  mockGetLineClient.mockReturnValue({
    replyMessage: mockReplyMessage,
  } as unknown as ReturnType<typeof getLineClient>);

  mockInsert.mockReset();
  mockInsert.mockResolvedValue({ error: null });
  mockDeleteEq2.mockReset();
  mockDeleteEq2.mockResolvedValue({ error: null });
  mockDeleteEq1.mockReset();
  mockDeleteEq1.mockImplementation(() => ({ eq: mockDeleteEq2 }));
  mockDelete.mockReset();
  mockDelete.mockImplementation(() => ({ eq: mockDeleteEq1 }));
  mockFrom.mockReset();
  mockFrom.mockImplementation(() => ({ insert: mockInsert, delete: mockDelete }));
  mockCreateSupabaseServerClient.mockReset();
  mockCreateSupabaseServerClient.mockReturnValue({
    from: mockFrom,
  } as unknown as ReturnType<typeof createSupabaseServerClient>);

  mockAnswerUserQuestion.mockReset();
  mockNotifyOwnerOfEscalation.mockReset();
  mockNotifyOwnerOfEscalation.mockResolvedValue({ ok: true });
});

afterEach(() => {
  delete process.env.LINE_CHANNEL_SECRET;
  vi.restoreAllMocks();
});

describe("POST /api/line/webhook", () => {
  it("1. 署名が不正な場合は401を返し、以降の処理を一切行わない", async () => {
    mockVerifyLineSignature.mockReturnValue(false);

    const response = await postWebhook([textMessageEvent()]);

    expect(response.status).toBe(401);
    expect(mockAnswerUserQuestion).not.toHaveBeenCalled();
    expect(mockReplyMessage).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("2. events=[]の場合は200を返す(LINEのWebhook検証リクエスト)", async () => {
    const response = await postWebhook([]);

    expect(response.status).toBe(200);
    expect(mockReplyMessage).not.toHaveBeenCalled();
  });

  it("3. 非テキストメッセージには既存の固定文言を返信する", async () => {
    const response = await postWebhook([stickerMessageEvent()]);

    expect(response.status).toBe(200);
    expect(mockReplyMessage).toHaveBeenCalledTimes(1);
    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: REPLY_TOKEN,
      messages: [{ type: "text", text: "テキストメッセージのみ対応しています。" }],
    });
    expect(mockAnswerUserQuestion).not.toHaveBeenCalled();
  });

  it("4. answer(confidence=high)の場合、Claudeの回答をそのままReplyする", async () => {
    mockAnswerUserQuestion.mockResolvedValue({
      kind: "answer",
      answer: "10:00〜19:00です。",
      confidence: "high",
      matchedFaqIds: ["faq-a"],
    });

    await postWebhook([textMessageEvent()]);

    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: REPLY_TOKEN,
      messages: [{ type: "text", text: "10:00〜19:00です。" }],
    });
  });

  it("5. answer(confidence=medium)の場合、Claudeの回答をそのままReplyする", async () => {
    mockAnswerUserQuestion.mockResolvedValue({
      kind: "answer",
      answer: "月曜定休です。",
      confidence: "medium",
      matchedFaqIds: ["faq-b"],
    });

    await postWebhook([textMessageEvent()]);

    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: REPLY_TOKEN,
      messages: [{ type: "text", text: "月曜定休です。" }],
    });
  });

  it("6. answerの場合、オーナーへのPush通知は行わない", async () => {
    mockAnswerUserQuestion.mockResolvedValue({
      kind: "answer",
      answer: "10:00〜19:00です。",
      confidence: "high",
      matchedFaqIds: ["faq-a"],
    });

    await postWebhook([textMessageEvent()]);

    expect(mockNotifyOwnerOfEscalation).not.toHaveBeenCalled();
  });

  it("7. escalateの場合、ユーザーにはLOW_CONFIDENCE_REPLY_TEXTのみを返信する", async () => {
    mockAnswerUserQuestion.mockResolvedValue({
      kind: "escalate",
      reason: "予約可否に関する質問のため",
      matchedFaqIds: [],
    });

    await postWebhook([textMessageEvent()]);

    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: REPLY_TOKEN,
      messages: [{ type: "text", text: LOW_CONFIDENCE_REPLY_TEXT }],
    });
  });

  it("8. escalateの場合、オーナーへのPush通知(notifyOwnerOfEscalation)が1回呼ばれる", async () => {
    mockAnswerUserQuestion.mockResolvedValue({
      kind: "escalate",
      reason: "予約可否に関する質問のため",
      matchedFaqIds: [],
    });

    await postWebhook([textMessageEvent({ text: "来週の土曜に予約できますか？" })]);

    expect(mockNotifyOwnerOfEscalation).toHaveBeenCalledTimes(1);
    expect(mockNotifyOwnerOfEscalation).toHaveBeenCalledWith({
      question: "来週の土曜に予約できますか？",
      reason: "予約可否に関する質問のため",
      lineUserId: USER_ID,
    });
  });

  it("9. escalateの場合、Claudeが生成したanswer相当のテキストはユーザーへ流れない", async () => {
    mockAnswerUserQuestion.mockResolvedValue({
      kind: "escalate",
      reason: "断定回答は危険なため要確認",
      matchedFaqIds: [],
    });

    await postWebhook([textMessageEvent()]);

    const [[replyCallArgs]] = mockReplyMessage.mock.calls;
    expect(replyCallArgs.messages[0].text).toBe(LOW_CONFIDENCE_REPLY_TEXT);
    expect(replyCallArgs.messages[0].text).not.toContain("断定回答は危険なため要確認");
  });

  it("10. fallback-errorの場合、API_FAILURE_REPLY_TEXTを返信する(LOW用の文言とは異なる)", async () => {
    mockAnswerUserQuestion.mockResolvedValue({
      kind: "fallback-error",
      errorType: "timeout",
    });

    await postWebhook([textMessageEvent()]);

    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: REPLY_TOKEN,
      messages: [{ type: "text", text: API_FAILURE_REPLY_TEXT }],
    });
    expect(API_FAILURE_REPLY_TEXT).not.toBe(LOW_CONFIDENCE_REPLY_TEXT);
  });

  it("11. fallback-errorの場合、オーナーへのPush通知は行わない", async () => {
    mockAnswerUserQuestion.mockResolvedValue({
      kind: "fallback-error",
      errorType: "parse_failed",
    });

    await postWebhook([textMessageEvent()]);

    expect(mockNotifyOwnerOfEscalation).not.toHaveBeenCalled();
  });

  it("12. answer時、outboundログにconfidence/matched_faq_ids/escalated:falseを記録する", async () => {
    mockAnswerUserQuestion.mockResolvedValue({
      kind: "answer",
      answer: "10:00〜19:00です。",
      confidence: "high",
      matchedFaqIds: ["faq-a", "faq-b"],
    });

    await postWebhook([textMessageEvent()]);

    const outboundCall = mockInsert.mock.calls.find(
      ([payload]) => payload.direction === "outbound"
    );
    expect(outboundCall?.[0]).toMatchObject({
      direction: "outbound",
      message_text: "10:00〜19:00です。",
      confidence: "high",
      matched_faq_ids: ["faq-a", "faq-b"],
      escalated: false,
    });
  });

  it("13. escalate時、outboundログにconfidence:'low'/matched_faq_ids/escalated:trueを記録する", async () => {
    mockAnswerUserQuestion.mockResolvedValue({
      kind: "escalate",
      reason: "理由",
      matchedFaqIds: ["faq-a"],
    });

    await postWebhook([textMessageEvent()]);

    const outboundCall = mockInsert.mock.calls.find(
      ([payload]) => payload.direction === "outbound"
    );
    expect(outboundCall?.[0]).toMatchObject({
      direction: "outbound",
      message_text: LOW_CONFIDENCE_REPLY_TEXT,
      confidence: "low",
      matched_faq_ids: ["faq-a"],
      escalated: true,
    });
  });

  it("14. fallback-error時、outboundログにconfidence:null/matched_faq_ids:null/escalated:falseを記録する", async () => {
    mockAnswerUserQuestion.mockResolvedValue({
      kind: "fallback-error",
      errorType: "connection",
    });

    await postWebhook([textMessageEvent()]);

    const outboundCall = mockInsert.mock.calls.find(
      ([payload]) => payload.direction === "outbound"
    );
    expect(outboundCall?.[0]).toMatchObject({
      direction: "outbound",
      message_text: API_FAILURE_REPLY_TEXT,
      confidence: null,
      matched_faq_ids: null,
      escalated: false,
    });
  });

  it("15. オーナーPushが失敗(またはnotifyOwnerOfEscalationが予期せず例外を投げて)も、ユーザーへの返信・ログ処理は既に完了しており200が返る", async () => {
    mockAnswerUserQuestion.mockResolvedValue({
      kind: "escalate",
      reason: "理由",
      matchedFaqIds: [],
    });
    mockNotifyOwnerOfEscalation.mockRejectedValue(new Error("push failed"));

    const response = await postWebhook([textMessageEvent()]);

    expect(response.status).toBe(200);
    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: REPLY_TOKEN,
      messages: [{ type: "text", text: LOW_CONFIDENCE_REPLY_TEXT }],
    });
    const outboundCall = mockInsert.mock.calls.find(
      ([payload]) => payload.direction === "outbound"
    );
    expect(outboundCall).toBeTruthy();
  });

  it("16. 同じline_message_idが再送された場合、Claude呼び出し・オーナーPush・返信を再実行しない", async () => {
    mockInsert.mockImplementation(async (payload: { direction: string }) => {
      if (payload.direction === "inbound") {
        return {
          error: { code: "23505", message: "duplicate key value violates unique constraint" },
        };
      }
      return { error: null };
    });

    const response = await postWebhook([textMessageEvent({ messageId: "duplicate-msg-id" })]);

    expect(response.status).toBe(200);
    expect(mockAnswerUserQuestion).not.toHaveBeenCalled();
    expect(mockReplyMessage).not.toHaveBeenCalled();
    expect(mockNotifyOwnerOfEscalation).not.toHaveBeenCalled();
  });

  it("17. 秘密情報(LINE_CHANNEL_SECRET)や質問全文をログへ出力しない(fallback-error時)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secretQuestion = "この質問内容は秘密情報ではないがログに全文出てはいけない";

    mockAnswerUserQuestion.mockResolvedValue({
      kind: "fallback-error",
      errorType: "timeout",
    });

    await postWebhook([textMessageEvent({ text: secretQuestion })]);

    const allCalls = [...consoleErrorSpy.mock.calls, ...consoleWarnSpy.mock.calls];
    expect(loggedArgsContain(allCalls, CHANNEL_SECRET)).toBe(false);
    expect(loggedArgsContain(allCalls, secretQuestion)).toBe(false);
  });

  it("18. 応答処理中に例外が発生した場合、inboundの重複防止ログを取り消し次回の再送をブロックしない", async () => {
    mockAnswerUserQuestion.mockResolvedValue({
      kind: "answer",
      answer: "10:00〜19:00です。",
      confidence: "high",
      matchedFaqIds: ["faq-a"],
    });
    mockReplyMessage.mockRejectedValue(new Error("LINE API error"));

    const response = await postWebhook([textMessageEvent({ messageId: "msg-retry-1" })]);

    // 署名検証後の想定外エラーはPromise.allSettledで吸収され、200が返る(Phase1の設計を維持)。
    expect(response.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteEq1).toHaveBeenCalledWith("line_message_id", "msg-retry-1");
    expect(mockDeleteEq2).toHaveBeenCalledWith("direction", "inbound");
  });

  it("18'. 重複(duplicate)として処理をスキップした場合は、取り消し処理(delete)を呼ばない", async () => {
    mockInsert.mockImplementation(async (payload: { direction: string }) => {
      if (payload.direction === "inbound") {
        return { error: { code: "23505", message: "duplicate key" } };
      }
      return { error: null };
    });

    await postWebhook([textMessageEvent({ messageId: "duplicate-msg-id" })]);

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("19. userIdが存在しない場合(グループ/ルーム)でも既存Phase1同様に返信は行われ、DBログはスキップされる", async () => {
    mockAnswerUserQuestion.mockResolvedValue({
      kind: "answer",
      answer: "10:00〜19:00です。",
      confidence: "high",
      matchedFaqIds: ["faq-a"],
    });

    const event: webhook.MessageEvent = {
      type: "message",
      replyToken: REPLY_TOKEN,
      source: { type: "group", groupId: "dummy-group-id" },
      timestamp: 1700000000000,
      mode: "active",
      webhookEventId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      deliveryContext: { isRedelivery: false },
      message: {
        type: "text",
        id: "msg-group-1",
        text: DEFAULT_QUESTION,
        quoteToken: "dummy-quote-token",
      },
    };

    const response = await postWebhook([event]);

    expect(response.status).toBe(200);
    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: REPLY_TOKEN,
      messages: [{ type: "text", text: "10:00〜19:00です。" }],
    });
    // line_user_idを解決できないため、inbound/outboundいずれのconversationsログも書き込まれない。
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
