import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/line/client", () => ({
  getLineClient: vi.fn(),
}));

import { getLineClient } from "@/lib/line/client";
import { pushLineMessage } from "@/lib/line/push-message";

const mockGetLineClient = vi.mocked(getLineClient);
const mockPushMessage = vi.fn();

beforeEach(() => {
  mockGetLineClient.mockReset();
  mockPushMessage.mockReset();
  mockGetLineClient.mockReturnValue({
    pushMessage: mockPushMessage,
  } as unknown as ReturnType<typeof getLineClient>);
});

describe("pushLineMessage", () => {
  it("指定したユーザーIDへテキストメッセージを1回だけPush送信する", async () => {
    mockPushMessage.mockResolvedValue({ sentMessages: [] });

    await pushLineMessage("dummy-user-id", "テストメッセージ");

    expect(mockPushMessage).toHaveBeenCalledTimes(1);
    expect(mockPushMessage).toHaveBeenCalledWith({
      to: "dummy-user-id",
      messages: [{ type: "text", text: "テストメッセージ" }],
    });
  });

  it("既存のgetLineClient()を再利用し、新しいクライアントを生成しない", async () => {
    mockPushMessage.mockResolvedValue({ sentMessages: [] });

    await pushLineMessage("dummy-user-id", "テストメッセージ");

    expect(mockGetLineClient).toHaveBeenCalledTimes(1);
  });

  it("LINE APIがエラーを返した場合は例外をそのまま伝播する(呼び出し元でハンドリングする設計)", async () => {
    mockPushMessage.mockRejectedValue(new Error("push failed"));

    await expect(
      pushLineMessage("dummy-user-id", "テストメッセージ")
    ).rejects.toThrow("push failed");
  });
});
