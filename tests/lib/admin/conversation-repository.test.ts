import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAdmin = vi.fn(async () => {});
vi.mock("@/lib/admin/auth", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

import {
  CUSTOMER_LIST_SCAN_LIMIT,
  THREAD_PAGE_SIZE,
  getConversationThread,
  listRecentCustomers,
  normalizeCursor,
} from "@/lib/admin/conversation-repository";

type QueryResult = { data: unknown; error: { message: string; code?: string } | null };

// 読み取り系メソッドのみを持つチェーン可能なクエリのモック。insert/update/delete/upsert/rpcは
// 定義していないため、もし呼ばれればTypeErrorでテストが失敗する(=書き込みが無いことの確認を兼ねる)。
const READ_METHODS = ["select", "eq", "in", "lt", "order", "limit", "maybeSingle"] as const;

function createQuery(result: QueryResult) {
  const calls: Array<[string, unknown[]]> = [];
  const query: Record<string, unknown> = {
    then: (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  for (const method of READ_METHODS) {
    query[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, args]);
      return query;
    });
  }
  return { query, calls };
}

function setupClient(results: QueryResult[]) {
  const queries = results.map(createQuery);
  const tables: string[] = [];
  let index = 0;
  const from = vi.fn((table: string) => {
    tables.push(table);
    const next = queries[index];
    index += 1;
    if (!next) {
      throw new Error(`Unexpected query #${index} on ${table}`);
    }
    return next.query;
  });
  mockCreateSupabaseServerClient.mockReturnValue({ from });
  return { from, tables, queries };
}

function callsOf(queries: ReturnType<typeof createQuery>[], index: number) {
  return queries[index].calls;
}

const USER_A = "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaa1111";
const USER_B = "Ubbbbbbbbbbbbbbbbbbbbbbbbbbbb2222";
const ID_1 = "11111111-1111-4111-8111-111111111111";
const ID_2 = "22222222-2222-4222-8222-222222222222";
const ID_3 = "33333333-3333-4333-8333-333333333333";
const ID_4 = "44444444-4444-4444-8444-444444444444";
const FAQ_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DELETED_FAQ_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function listRow(overrides: Record<string, unknown>) {
  return {
    id: ID_1,
    line_user_id: USER_A,
    direction: "inbound",
    message_type: "text",
    message_text: "こんにちは",
    escalated: false,
    created_at: "2026-09-25T01:00:00.000000+00:00",
    ...overrides,
  };
}

function threadRow(overrides: Record<string, unknown>) {
  return {
    id: ID_1,
    direction: "inbound",
    message_type: "text",
    message_text: "質問",
    confidence: null,
    matched_faq_ids: null,
    escalated: false,
    created_at: "2026-09-25T01:00:00.000000+00:00",
    ...overrides,
  };
}

beforeEach(() => {
  mockRequireAdmin.mockReset();
  mockRequireAdmin.mockResolvedValue(undefined);
  mockCreateSupabaseServerClient.mockReset();
});

describe("認証", () => {
  it("未認証なら一覧取得でDBへアクセスしない", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    const { from } = setupClient([]);

    await expect(listRecentCustomers()).rejects.toThrow("NEXT_REDIRECT");
    await expect(listRecentCustomers("needs-staff")).rejects.toThrow("NEXT_REDIRECT");
    expect(from).not.toHaveBeenCalled();
  });

  it("未認証なら詳細取得でDBへアクセスしない", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    const { from } = setupClient([]);

    await expect(getConversationThread(ID_1)).rejects.toThrow("NEXT_REDIRECT");
    expect(from).not.toHaveBeenCalled();
  });
});

describe("listRecentCustomers (すべて)", () => {
  it("直近N件を新しい順に取得し、raw_eventをselectしない", async () => {
    const { tables, queries } = setupClient([{ data: [], error: null }]);

    await listRecentCustomers();

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(tables).toEqual(["conversations"]);
    const calls = callsOf(queries, 0);
    const selectArg = calls.find(([m]) => m === "select")?.[1][0];
    expect(selectArg).not.toContain("raw_event");
    expect(selectArg).not.toContain("*");
    expect(calls).toContainEqual(["order", ["created_at", { ascending: false }]]);
    expect(calls).toContainEqual(["limit", [CUSTOMER_LIST_SCAN_LIMIT]]);
  });

  it("お客様ごとにまとめ、最新のやり取り順に並べる", async () => {
    setupClient([
      {
        data: [
          listRow({ id: ID_4, line_user_id: USER_B, direction: "outbound", message_text: "返信B", created_at: "2026-09-25T04:00:00+00:00" }),
          listRow({ id: ID_3, line_user_id: USER_B, message_text: "質問B", created_at: "2026-09-25T03:59:00+00:00" }),
          listRow({ id: ID_2, line_user_id: USER_A, direction: "outbound", escalated: true, message_text: "確認します", created_at: "2026-09-25T02:00:00+00:00" }),
          listRow({ id: ID_1, line_user_id: USER_A, message_text: "質問A", created_at: "2026-09-25T01:59:00+00:00" }),
        ],
        error: null,
      },
    ]);

    const result = await listRecentCustomers();

    expect(result).toEqual([
      {
        key: ID_4,
        customerLabel: "お客様（末尾2222）",
        lastActivityAt: "2026-09-25T04:00:00+00:00",
        latestCustomerMessage: { messageType: "text", messageText: "質問B" },
        needsStaffCheck: false,
      },
      {
        key: ID_2,
        customerLabel: "お客様（末尾1111）",
        lastActivityAt: "2026-09-25T02:00:00+00:00",
        latestCustomerMessage: { messageType: "text", messageText: "質問A" },
        needsStaffCheck: true,
      },
    ]);
  });

  it("DTOに完全なLINEユーザーIDとraw_eventが含まれない", async () => {
    setupClient([
      { data: [listRow({ raw_event: { source: { userId: USER_A } } })], error: null },
    ]);

    const serialized = JSON.stringify(await listRecentCustomers());

    expect(serialized).not.toContain(USER_A);
    expect(serialized).not.toContain("raw_event");
    expect(serialized).not.toContain("line_user_id");
  });

  it("0件なら空配列", async () => {
    setupClient([{ data: null, error: null }]);
    expect(await listRecentCustomers()).toEqual([]);
  });

  it("DBエラー時は例外を投げる", async () => {
    setupClient([{ data: null, error: { message: "boom" } }]);
    await expect(listRecentCustomers()).rejects.toThrow("Failed to fetch conversations: boom");
  });
});

describe("listRecentCustomers (スタッフ確認あり)", () => {
  it("エスカレーションされたお客様だけを取得する", async () => {
    const { queries } = setupClient([
      { data: [{ line_user_id: USER_A }, { line_user_id: USER_A }], error: null },
      { data: [listRow({ id: ID_1, line_user_id: USER_A })], error: null },
    ]);

    const result = await listRecentCustomers("needs-staff");

    expect(callsOf(queries, 0)).toContainEqual(["eq", ["escalated", true]]);
    expect(callsOf(queries, 1)).toContainEqual(["in", ["line_user_id", [USER_A]]]);
    expect(result).toHaveLength(1);
    expect(result[0].needsStaffCheck).toBe(true);
  });

  it("やり取りの多い別のお客様に取得上限を占められても、エスカレーションされたお客様を漏らさない", async () => {
    setupClient([
      {
        data: [
          listRow({ id: ID_4, line_user_id: USER_A, direction: "outbound", escalated: true, created_at: "2026-09-25T05:00:00+00:00" }),
          listRow({ id: ID_2, line_user_id: USER_B, direction: "outbound", escalated: true, created_at: "2026-09-20T05:00:00+00:00" }),
        ],
        error: null,
      },
      // 2回目の取得結果はUSER_Aの行だけで埋まり、USER_Bの行が1件も入っていない。
      { data: [listRow({ id: ID_3, line_user_id: USER_A, created_at: "2026-09-25T06:00:00+00:00" })], error: null },
    ]);

    const result = await listRecentCustomers("needs-staff");

    expect(result.map((summary) => summary.customerLabel)).toEqual([
      "お客様（末尾1111）",
      "お客様（末尾2222）",
    ]);
    expect(result[1]).toMatchObject({ key: ID_2, needsStaffCheck: true });
    expect(JSON.stringify(result)).not.toContain(USER_B);
  });

  it("該当者がいなければ2回目のクエリを行わず空配列", async () => {
    const { from } = setupClient([{ data: [], error: null }]);

    expect(await listRecentCustomers("needs-staff")).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("エスカレーション取得のDBエラー時は例外を投げる", async () => {
    setupClient([{ data: null, error: { message: "boom" } }]);
    await expect(listRecentCustomers("needs-staff")).rejects.toThrow(
      "Failed to fetch escalated conversations: boom",
    );
  });
});

describe("getConversationThread", () => {
  it("不正な形式のキーはDBへアクセスせずnull", async () => {
    const { from } = setupClient([]);
    expect(await getConversationThread("not-a-uuid")).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("該当する行が無ければnull", async () => {
    setupClient([{ data: null, error: null }]);
    expect(await getConversationThread(ID_1)).toBeNull();
  });

  it("キーの行からお客様を特定し、そのお客様のやり取りだけを新しい順に取得する", async () => {
    const { tables, queries } = setupClient([
      { data: { line_user_id: USER_A }, error: null },
      { data: [], error: null },
    ]);

    await getConversationThread(ID_1);

    expect(tables).toEqual(["conversations", "conversations"]);
    expect(callsOf(queries, 0)).toContainEqual(["eq", ["id", ID_1]]);
    const threadCalls = callsOf(queries, 1);
    expect(threadCalls).toContainEqual(["eq", ["line_user_id", USER_A]]);
    expect(threadCalls).toContainEqual(["order", ["created_at", { ascending: false }]]);
    expect(threadCalls).toContainEqual(["limit", [THREAD_PAGE_SIZE + 1]]);
    const selectArg = threadCalls.find(([m]) => m === "select")?.[1][0];
    expect(selectArg).not.toContain("raw_event");
    expect(selectArg).not.toContain("line_user_id");
    expect(threadCalls.some(([m]) => m === "lt")).toBe(false);
  });

  it("お客様のメッセージとBotの返信を組にし、新しいやり取りを先頭にする", async () => {
    setupClient([
      { data: { line_user_id: USER_A }, error: null },
      {
        data: [
          threadRow({ id: ID_4, direction: "outbound", message_text: "スタッフが確認します", confidence: "low", escalated: true, matched_faq_ids: [], created_at: "2026-09-25T02:00:01+00:00" }),
          threadRow({ id: ID_3, message_text: "質問2", created_at: "2026-09-25T02:00:00+00:00" }),
          threadRow({ id: ID_2, direction: "outbound", message_text: "回答1", confidence: "high", matched_faq_ids: [FAQ_ID, DELETED_FAQ_ID], created_at: "2026-09-25T01:00:01+00:00" }),
          threadRow({ id: ID_1, message_text: "質問1", created_at: "2026-09-25T01:00:00+00:00" }),
        ],
        error: null,
      },
      { data: [{ id: FAQ_ID, question: "料金は？" }], error: null },
    ]);

    const thread = await getConversationThread(ID_1);

    expect(thread?.customerLabel).toBe("お客様（末尾1111）");
    expect(thread?.olderCursor).toBeNull();
    expect(thread?.exchanges.map((e) => e.customerMessage?.messageText)).toEqual(["質問2", "質問1"]);
    expect(thread?.exchanges[0].botReplies[0]).toMatchObject({ escalated: true, confidence: "low" });
    expect(thread?.exchanges[1].botReplies[0].matchedFaqs).toEqual([
      { id: FAQ_ID, question: "料金は？" },
      { id: DELETED_FAQ_ID, question: null },
    ]);
  });

  it("DTOに完全なLINEユーザーIDとraw_eventが含まれない", async () => {
    setupClient([
      { data: { line_user_id: USER_A }, error: null },
      { data: [threadRow({ raw_event: { source: { userId: USER_A } } })], error: null },
    ]);

    const serialized = JSON.stringify(await getConversationThread(ID_1));

    expect(serialized).not.toContain(USER_A);
    expect(serialized).not.toContain("raw_event");
  });

  it("ページ境界で返信だけが残る場合もお客様メッセージ無しの組として表示できる", async () => {
    setupClient([
      { data: { line_user_id: USER_A }, error: null },
      { data: [threadRow({ id: ID_2, direction: "outbound", message_text: "返信" })], error: null },
    ]);

    const thread = await getConversationThread(ID_1);

    expect(thread?.exchanges).toHaveLength(1);
    expect(thread?.exchanges[0].customerMessage).toBeNull();
    expect(thread?.exchanges[0].botReplies[0].messageText).toBe("返信");
  });

  it("1ページを超える場合は続き取得用カーソルを返し、表示はページサイズまで", async () => {
    const rows = Array.from({ length: THREAD_PAGE_SIZE + 1 }, (_, i) =>
      threadRow({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        created_at: new Date(Date.UTC(2026, 8, 25, 12, 0, 0) - i * 60_000).toISOString(),
      }),
    );
    setupClient([
      { data: { line_user_id: USER_A }, error: null },
      { data: rows, error: null },
    ]);

    const thread = await getConversationThread(ID_1);

    expect(thread?.exchanges).toHaveLength(THREAD_PAGE_SIZE);
    expect(thread?.olderCursor).toBe(rows[THREAD_PAGE_SIZE - 1].created_at);
  });

  it("続き取得用カーソルはDBの値を丸めない(同じミリ秒内の行を読み飛ばさない)", async () => {
    const rows = Array.from({ length: THREAD_PAGE_SIZE + 1 }, (_, i) =>
      threadRow({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        created_at: `2026-09-25T10:00:00.1234${String(99 - i).padStart(2, "0")}+00:00`,
      }),
    );
    setupClient([
      { data: { line_user_id: USER_A }, error: null },
      { data: rows, error: null },
    ]);

    const thread = await getConversationThread(ID_1);

    expect(thread?.olderCursor).toBe(rows[THREAD_PAGE_SIZE - 1].created_at);
  });

  it("カーソル指定時はそれより古い行のみを取得する", async () => {
    const { queries } = setupClient([
      { data: { line_user_id: USER_A }, error: null },
      { data: [], error: null },
    ]);

    await getConversationThread(ID_1, "2026-09-25T01:00:00.123Z");

    expect(callsOf(queries, 1)).toContainEqual(["lt", ["created_at", "2026-09-25T01:00:00.123Z"]]);
  });

  it("FAQ名の取得に失敗しても会話ログは表示できる", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    setupClient([
      { data: { line_user_id: USER_A }, error: null },
      { data: [threadRow({ direction: "outbound", confidence: "high", matched_faq_ids: [FAQ_ID] })], error: null },
      { data: null, error: { message: "boom", code: "XX000" } },
    ]);

    const thread = await getConversationThread(ID_1);

    expect(thread?.exchanges[0].botReplies[0].matchedFaqs).toEqual([{ id: FAQ_ID, question: null }]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("会話ログ取得のDBエラー時は例外を投げる", async () => {
    setupClient([
      { data: { line_user_id: USER_A }, error: null },
      { data: null, error: { message: "boom" } },
    ]);

    await expect(getConversationThread(ID_1)).rejects.toThrow(
      "Failed to fetch conversation thread: boom",
    );
  });
});

describe("normalizeCursor", () => {
  it("DBのマイクロ秒精度の値を丸めずにそのまま使う", () => {
    expect(normalizeCursor("2026-09-25T01:23:45.123456+00:00")).toBe("2026-09-25T01:23:45.123456+00:00");
    expect(normalizeCursor("2026-09-25T01:23:45.123Z")).toBe("2026-09-25T01:23:45.123Z");
  });

  it("ISO形式でない値(日付として解釈できても)はnull", () => {
    expect(normalizeCursor("2026-09-25 01:23:45.123456 00:00")).toBeNull();
    expect(normalizeCursor("Sep 25 2026")).toBeNull();
    expect(normalizeCursor("2026-13-45T99:99:99Z")).toBeNull();
  });

  it("未指定・不正な値・長すぎる値はnull", () => {
    expect(normalizeCursor(undefined)).toBeNull();
    expect(normalizeCursor("")).toBeNull();
    expect(normalizeCursor("not-a-date")).toBeNull();
    expect(normalizeCursor("2026-09-25T01:00:00Z".padEnd(100, "x"))).toBeNull();
  });
});
