import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CountResult = { count: number | null; error: { message: string } | null };

const mockGte = vi.fn<(column: string, value: string) => Promise<CountResult>>();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

const queryBuilder = { select: mockSelect, eq: mockEq, gte: mockGte };

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ from: mockFrom }),
}));

import {
  checkUserRateLimit,
  DEFAULT_RATE_LIMIT_MAX_PER_DAY,
  DEFAULT_RATE_LIMIT_MAX_PER_HOUR,
  getRateLimitConfig,
} from "@/lib/faq/rate-limit";

const NOW = new Date("2026-10-26T12:00:00.000Z");
const ONE_HOUR_AGO = "2026-10-26T11:00:00.000Z";
const ONE_DAY_AGO = "2026-10-25T12:00:00.000Z";

/** 直近1時間・直近24時間の件数をそれぞれ返すようにモックする */
function mockCounts(hourCount: number, dayCount: number): void {
  mockGte.mockImplementation(async (_column, since) => {
    if (since === ONE_HOUR_AGO) return { count: hourCount, error: null };
    if (since === ONE_DAY_AGO) return { count: dayCount, error: null };
    throw new Error(`unexpected since: ${since}`);
  });
}

beforeEach(() => {
  mockFrom.mockReset().mockReturnValue(queryBuilder);
  mockSelect.mockReset().mockReturnValue(queryBuilder);
  mockEq.mockReset().mockReturnValue(queryBuilder);
  mockGte.mockReset();
  vi.unstubAllEnvs();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getRateLimitConfig", () => {
  it("環境変数が未設定なら初期値（1時間10件・24時間30件）を使い、警告しない", () => {
    expect(getRateLimitConfig()).toEqual({ maxPerHour: 10, maxPerDay: 30 });
    expect(DEFAULT_RATE_LIMIT_MAX_PER_HOUR).toBe(10);
    expect(DEFAULT_RATE_LIMIT_MAX_PER_DAY).toBe(30);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("環境変数の正の整数を使う（前後の空白は無視）", () => {
    vi.stubEnv("RATE_LIMIT_MAX_PER_HOUR", " 5 ");
    vi.stubEnv("RATE_LIMIT_MAX_PER_DAY", "100");

    expect(getRateLimitConfig()).toEqual({ maxPerHour: 5, maxPerDay: 100 });
  });

  it("空文字列は未設定として初期値を使う", () => {
    vi.stubEnv("RATE_LIMIT_MAX_PER_HOUR", "");

    expect(getRateLimitConfig().maxPerHour).toBe(10);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "1.5", "abc", "10件", "1e2", "99999999999999999999"])(
    "不正な値 %s は警告して初期値を使う",
    (value) => {
      vi.stubEnv("RATE_LIMIT_MAX_PER_HOUR", value);
      vi.stubEnv("RATE_LIMIT_MAX_PER_DAY", value);

      expect(getRateLimitConfig()).toEqual({ maxPerHour: 10, maxPerDay: 30 });
      expect(console.warn).toHaveBeenCalledTimes(2);
    }
  );

  it("不正値の警告には環境変数名を含め、設定された値そのものは含めない", () => {
    vi.stubEnv("RATE_LIMIT_MAX_PER_HOUR", "invalid-value-xyz");

    getRateLimitConfig();

    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logged).toContain("RATE_LIMIT_MAX_PER_HOUR");
    expect(logged).not.toContain("invalid-value-xyz");
  });
});

describe("checkUserRateLimit", () => {
  it("同じユーザーの受信テキストメッセージを、直近1時間と直近24時間で数える", async () => {
    mockCounts(1, 1);

    await checkUserRateLimit("U-customer", NOW);

    expect(mockFrom).toHaveBeenCalledWith("conversations");
    expect(mockSelect).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(mockEq).toHaveBeenCalledWith("line_user_id", "U-customer");
    expect(mockEq).toHaveBeenCalledWith("direction", "inbound");
    expect(mockEq).toHaveBeenCalledWith("message_type", "text");
    expect(mockGte).toHaveBeenCalledWith("created_at", ONE_HOUR_AGO);
    expect(mockGte).toHaveBeenCalledWith("created_at", ONE_DAY_AGO);
  });

  it("1時間10件ちょうど（今回分を含む）までは許可する", async () => {
    mockCounts(10, 10);

    await expect(checkUserRateLimit("U-customer", NOW)).resolves.toEqual({
      kind: "allowed",
    });
  });

  it("1時間で11件目は制限し、オーナー通知の対象にする", async () => {
    mockCounts(11, 11);

    await expect(checkUserRateLimit("U-customer", NOW)).resolves.toEqual({
      kind: "limited",
      notifyOwner: true,
      reason: "送信回数の上限（1時間に10件）を超えました",
    });
  });

  it("1時間で12件目以降も制限するが、オーナーへは再通知しない", async () => {
    mockCounts(12, 12);

    await expect(checkUserRateLimit("U-customer", NOW)).resolves.toEqual({
      kind: "limited",
      notifyOwner: false,
      reason: "送信回数の上限（1時間に10件）を超えました",
    });
  });

  it("24時間30件ちょうどまでは許可する", async () => {
    mockCounts(3, 30);

    await expect(checkUserRateLimit("U-customer", NOW)).resolves.toEqual({
      kind: "allowed",
    });
  });

  it("24時間で31件目は制限し、オーナー通知の対象にする", async () => {
    mockCounts(3, 31);

    await expect(checkUserRateLimit("U-customer", NOW)).resolves.toEqual({
      kind: "limited",
      notifyOwner: true,
      reason: "送信回数の上限（24時間に30件）を超えました",
    });
  });

  it("24時間で32件目以降は制限するが、オーナーへは再通知しない", async () => {
    mockCounts(3, 32);

    await expect(checkUserRateLimit("U-customer", NOW)).resolves.toEqual({
      kind: "limited",
      notifyOwner: false,
      reason: "送信回数の上限（24時間に30件）を超えました",
    });
  });

  it("24時間の上限を既に超えた状態で1時間の上限をちょうど超えたら、1時間の理由で通知する", async () => {
    mockCounts(11, 40);

    await expect(checkUserRateLimit("U-customer", NOW)).resolves.toEqual({
      kind: "limited",
      notifyOwner: true,
      reason: "送信回数の上限（1時間に10件）を超えました",
    });
  });

  it("1時間と24時間の上限を同時にちょうど超えたら、1時間の理由で1回だけ通知する", async () => {
    mockCounts(11, 31);

    await expect(checkUserRateLimit("U-customer", NOW)).resolves.toEqual({
      kind: "limited",
      notifyOwner: true,
      reason: "送信回数の上限（1時間に10件）を超えました",
    });
  });

  it("1時間の上限を超えた状態で24時間の上限をちょうど超えたら、24時間の理由で通知する", async () => {
    mockCounts(15, 31);

    await expect(checkUserRateLimit("U-customer", NOW)).resolves.toEqual({
      kind: "limited",
      notifyOwner: true,
      reason: "送信回数の上限（24時間に30件）を超えました",
    });
  });

  it("環境変数で変更した上限を使う", async () => {
    vi.stubEnv("RATE_LIMIT_MAX_PER_HOUR", "3");
    vi.stubEnv("RATE_LIMIT_MAX_PER_DAY", "5");

    mockCounts(3, 3);
    await expect(checkUserRateLimit("U-customer", NOW)).resolves.toEqual({
      kind: "allowed",
    });

    mockCounts(4, 4);
    await expect(checkUserRateLimit("U-customer", NOW)).resolves.toEqual({
      kind: "limited",
      notifyOwner: true,
      reason: "送信回数の上限（1時間に3件）を超えました",
    });

    mockCounts(2, 6);
    await expect(checkUserRateLimit("U-customer", NOW)).resolves.toEqual({
      kind: "limited",
      notifyOwner: true,
      reason: "送信回数の上限（24時間に5件）を超えました",
    });
  });

  it("countがnullなら0件として扱い許可する", async () => {
    mockGte.mockResolvedValue({ count: null, error: null });

    await expect(checkUserRateLimit("U-customer", NOW)).resolves.toEqual({
      kind: "allowed",
    });
  });

  it("lineUserIdが無い（グループ/ルーム）場合はDBを問い合わせず unchecked を返す", async () => {
    await expect(checkUserRateLimit(undefined, NOW)).resolves.toEqual({
      kind: "unchecked",
      cause: "no_user_id",
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("Supabaseがエラーを返した場合は例外を投げず unchecked を返す", async () => {
    mockGte.mockResolvedValue({ count: null, error: { message: "connection failed" } });

    await expect(checkUserRateLimit("U-customer", NOW)).resolves.toEqual({
      kind: "unchecked",
      cause: "count_failed",
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("Supabaseクライアントが例外を投げた場合も unchecked を返す", async () => {
    mockGte.mockRejectedValue(new Error("network down"));

    await expect(checkUserRateLimit("U-customer", NOW)).resolves.toEqual({
      kind: "unchecked",
      cause: "count_failed",
    });
  });

  it("エラーログに顧客IDやエラーメッセージ本文を含めない", async () => {
    mockGte.mockResolvedValue({
      count: null,
      error: { message: "secret detail U-customer" },
    });

    await checkUserRateLimit("U-customer", NOW);

    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain("U-customer");
    expect(logged).not.toContain("secret detail");
  });
});
