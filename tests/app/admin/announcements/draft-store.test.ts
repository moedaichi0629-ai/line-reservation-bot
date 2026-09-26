import { describe, expect, it, vi } from "vitest";
import { createDraftStore } from "@/app/admin/(protected)/announcements/draft-store";

describe("お知らせ入力途中の本文ストア", () => {
  it("入力した本文を部品の外に保持し、購読者へ通知する", () => {
    const store = createDraftStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setBody("来週の営業時間");

    expect(store.getSnapshot()).toBe("来週の営業時間");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("配信・テスト送信の後(savedが無い)は入力途中の本文を残す", () => {
    const store = createDraftStore();
    store.setBody("入力途中");

    store.clearForSavedToken(null);

    expect(store.getSnapshot()).toBe("入力途中");
  });

  it("下書き保存の成功(新しいsaved)で一度だけ空にし、同じsavedでは再度空にしない", () => {
    const store = createDraftStore();
    store.setBody("保存した本文");

    store.clearForSavedToken("1001");
    expect(store.getSnapshot()).toBe("");

    store.setBody("次のお知らせを入力中");
    store.clearForSavedToken("1001");
    expect(store.getSnapshot()).toBe("次のお知らせを入力中");

    store.clearForSavedToken("1002");
    expect(store.getSnapshot()).toBe("");
  });

  it("値が変わらない更新では通知しない・購読解除後は通知しない", () => {
    const store = createDraftStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setBody("");
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
    store.setBody("変更");
    expect(listener).not.toHaveBeenCalled();
  });
});
